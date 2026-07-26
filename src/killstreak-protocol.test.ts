import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { HostKillstreakRuntime } from './killstreak-runtime';
import { isKillstreakHostAuthorityMessage, isKillstreakProtocolMessage, killstreakMessageBelongsToPlayer } from './killstreak-protocol';

const loadout = parseKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'] });

describe('killstreak protocol', () => {
  it('accepts bounded typed intents and rejects free-pick, forged seed/path, replay-shaped and unbounded inputs', () => {
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-loadout-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 0, loadout, nonce: 1,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-activate-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
      slot: 3, activationId: 'activation-tri-pass-1', expectedId: 'tri-pass', anchor: [0, 0, 0], nonce: 2,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-activate-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
      slot: 3, activationId: 'activation-tri-pass-1', expectedId: 'tri-pass', anchor: [0, 0, 0], seed: 42, path: [[0, 0, 0]], nonce: 2,
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-loadout-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 0,
      loadout: { schemaVersion: 1, slots: ['nuke', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm'] }, nonce: 1,
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-control-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2,
      entityId: 'ks-7-chopper-1', action: 'pilot-control', yawQ: 99, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true, nonce: 3,
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-control-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2,
      entityId: 'ks-7-chopper-1', action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0,
      position: [99, 99, 99], flightAuthority: 'player', nonce: 3,
    })).toBe(false);
  });

  it('admits bounded recipient snapshots, rejects entity storms, and classifies host authority', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout);
    const message = { type: 'killstreak-state' as const, by: 'host', forPlayerId: 'owner', snapshot: runtime.snapshotFor('owner', 0), nonce: 1 };
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isKillstreakHostAuthorityMessage(message)).toBe(true);
    expect(killstreakMessageBelongsToPlayer(message, 'owner')).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, entities: Array.from({ length: 33 }, () => ({ id: 'bad' })) } })).toBe(false);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        sensorContacts: [{
          id: 'friendly', kind: 'player', team: 0, lifeId: 1, position: [0, 0, 0], relation: 'friendly', throughWall: true,
        }],
      },
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        sensorContacts: [{
          id: 'enemy', kind: 'player', team: 1, lifeId: 2, position: [0, 0, 8], relation: 'hostile', throughWall: true,
        }],
      },
    })).toBe(false);
  });

  it('admits host-filtered piloted sensor contacts only for the possessing recipient', () => {
    const pilotLoadout = parseKillstreakLoadout({
      schemaVersion: 1, slots: ['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke'],
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, pilotLoadout);
    for (let index = 0; index < 5; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    runtime.activate({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 2,
      activationId: 'activation-piloted-sensor', expectedId: 'piloted-drone', anchor: [0, 0, 0],
    }, 1_000, {
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20, floorY: 0, ceilingY: 20 },
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, 8] },
      ],
      hasLineOfSight: () => false,
    });
    runtime.advance(1_001, {
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20, floorY: 0, ceilingY: 20 },
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, 8] },
      ],
      hasLineOfSight: () => false,
    });
    const message = {
      type: 'killstreak-state' as const,
      by: 'host',
      forPlayerId: 'owner',
      snapshot: runtime.snapshotFor('owner', 1_001),
      nonce: 2,
    };
    expect(message.snapshot.sensorContacts).toHaveLength(1);
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, forPlayerId: 'observer' })).toBe(false);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        entities: message.snapshot.entities.map((entity) => ({ ...entity, gunProfileId: 'forged-drone-gun' })),
      },
    })).toBe(false);
  });
});
