import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { HostKillstreakRuntime, MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD } from './killstreak-runtime';
import {
  admitKillstreakCareCaptureResultMessage,
  admitKillstreakStateMessage,
  isKillstreakHostAuthorityMessage,
  isKillstreakProtocolMessage,
  killstreakMessageBelongsToPlayer,
} from './killstreak-protocol';

const loadout = parseKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'] });

describe('killstreak protocol', () => {
  it('accepts bounded typed intents and rejects free-pick, forged seed/path, replay-shaped and unbounded inputs', () => {
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-loadout-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 0, loadout, nonce: 1,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-activate-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
      slot: 3, activationId: 'activation-tri-pass-1', expectedId: 'tri-pass', anchor: [0, 0, 0], facing: [0, 0, -1], nonce: 2,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-activate-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
      slot: 3, activationId: 'activation-tri-pass-1', expectedId: 'tri-pass', anchor: [0, 0, 0], facing: [Number.NaN, 0, -1], nonce: 2,
    })).toBe(false);
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
      entityId: 'ks-7-pilot-drone-1', action: 'toggle-piloted-drone', nonce: 3,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-control-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3,
      entityId: 'ks-7-chopper-1', action: 'pilot-control', yawQ: 0, pitchQ: -0.8,
      fire: false, missileFire: true, nonce: 4,
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-control-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3,
      entityId: 'ks-7-chopper-1', action: 'pilot-control', yawQ: 0, pitchQ: -0.8,
      missileFire: true, missileTarget: [20, 0, 20], nonce: 4,
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-control-intent', by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2,
      entityId: 'ks-7-chopper-1', action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0,
      position: [99, 99, 99], flightAuthority: 'player', nonce: 3,
    })).toBe(false);
  });

  it('admits only correlated host-authored care capture results', () => {
    const message = {
      type: 'killstreak-care-capture-result' as const,
      by: 'host', forPlayerId: 'owner', matchEpoch: 7, lifeId: 3, sequence: 9,
      crateId: 'ks-7-care-1', holding: true, accepted: true, reason: 'accepted' as const,
      revision: 14, nonce: 55,
    };
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isKillstreakHostAuthorityMessage(message)).toBe(true);
    expect(killstreakMessageBelongsToPlayer(message, 'owner')).toBe(true);
    expect(admitKillstreakCareCaptureResultMessage(message, {
      expectedHostId: 'host', expectedRecipientId: 'owner', expectedMatchEpoch: 7,
      expectedLifeId: 3, seenNonces: new Set(),
    })).toEqual({ accepted: true, reason: 'accepted' });
    expect(admitKillstreakCareCaptureResultMessage(message, {
      expectedHostId: 'forged', expectedRecipientId: 'owner', expectedMatchEpoch: 7,
      expectedLifeId: 3, seenNonces: new Set(),
    }).accepted).toBe(false);
    expect(admitKillstreakCareCaptureResultMessage(message, {
      expectedHostId: 'host', expectedRecipientId: 'owner', expectedMatchEpoch: 7,
      expectedLifeId: 3, seenNonces: new Set([55]),
    }).reason).toBe('duplicate-nonce');
    expect(isKillstreakProtocolMessage({ ...message, accepted: false, reason: 'accepted' })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, accepted: true, reason: 'crate-unavailable' })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, accepted: true, holding: false, reason: 'released' })).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, accepted: false, holding: false, reason: 'not-capturing' })).toBe(true);
  });

  it('admits bounded host carpet drop/impact choreography even when no damage target was hit', () => {
    const message = {
      type: 'killstreak-damage-result' as const,
      by: 'host', matchEpoch: 7, revision: 3, events: [],
      impacts: [
        { activationId: 'ks-activation-7-1', source: 'carpet-bomber' as const, ordinal: 0, phase: 'drop' as const, position: [1, 0, 2] as const, launchPosition: null, impactAtMs: 2_000, atMs: 1_580 },
        { activationId: 'ks-activation-7-1', source: 'carpet-bomber' as const, ordinal: 0, phase: 'impact' as const, position: [1, 0, 2] as const, launchPosition: null, impactAtMs: 2_000, atMs: 2_000 },
      ],
      nonce: 9,
    };
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(killstreakMessageBelongsToPlayer(message, 'observer')).toBe(true);
    expect(isKillstreakHostAuthorityMessage(message)).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, impacts: [...message.impacts, message.impacts[0]] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, impacts: [{ ...message.impacts[0], phase: 'drop', atMs: 2_001 }] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, impacts: [{ ...message.impacts[1], phase: 'impact', atMs: 1_999 }] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, impacts: [{ ...message.impacts[0], ordinal: 20 }] })).toBe(false);

    const chopperMissile = {
      ...message,
      impacts: [
        { activationId: 'ks-activation-7-2', source: 'chopper' as const, ordinal: 5, phase: 'drop' as const, position: [3, 0, 4] as const, launchPosition: [1, 18, 2] as const, impactAtMs: 2_780, atMs: 2_000 },
        { activationId: 'ks-activation-7-2', source: 'chopper' as const, ordinal: 5, phase: 'impact' as const, position: [3, 0, 4] as const, launchPosition: [1, 18, 2] as const, impactAtMs: 2_780, atMs: 2_780 },
      ],
    };
    expect(isKillstreakProtocolMessage(chopperMissile)).toBe(true);
    expect(isKillstreakProtocolMessage({ ...chopperMissile, impacts: [{ ...chopperMissile.impacts[0], ordinal: 6 }] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...chopperMissile, impacts: [{ ...chopperMissile.impacts[0], atMs: 2_001 }] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...chopperMissile, impacts: [{ ...chopperMissile.impacts[1], atMs: 2_781 }] })).toBe(false);
  });

  it('requires finite authoritative ray endpoints and tracer origins on damage results', () => {
    const event = {
      resultId: 'ks-result-7-1', activationId: 'ks-activation-7-1', source: 'chopper' as const,
      ownerId: 'owner', targetId: 'enemy', targetLifeId: 3, targetPosition: [0, 1.7, -20] as const,
      damage: 10, origin: [0, 8, 0] as const, endpoint: [0, 1.7, -19.38] as const,
      tracerOrigin: [0, 6.4, -3] as const, atMs: 2_000,
    };
    const message = {
      type: 'killstreak-damage-result' as const,
      by: 'host', matchEpoch: 7, revision: 4, events: [event], impacts: [], nonce: 10,
    };
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, events: [{ ...event, endpoint: [0, Number.NaN, -19.38] }] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, events: [{ ...event, tracerOrigin: [0, 6.4] }] })).toBe(false);
    const missingEndpoint = Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'endpoint'));
    expect(isKillstreakProtocolMessage({ ...message, events: [missingEndpoint] })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, events: [{ ...event, clientRay: [0, 0, -1] }] })).toBe(false);
  });

  it('admits bounded recipient snapshots, rejects entity storms, and classifies host authority', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout);
    const message = { type: 'killstreak-state' as const, by: 'host', forPlayerId: 'owner', snapshot: runtime.snapshotFor('owner', 0), nonce: 1 };
    expect(message.snapshot.schemaVersion).toBe(3);
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isKillstreakHostAuthorityMessage(message)).toBe(true);
    expect(killstreakMessageBelongsToPlayer(message, 'owner')).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, schemaVersion: 2 } })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, schemaVersion: 4 } })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, entities: Array.from({ length: 33 }, () => ({ id: 'bad' })) } })).toBe(false);
    const privateCorridor = {
      id: 'ks-activation-7-1:carpet-corridor', activationId: 'ks-activation-7-1', source: 'carpet-bomber', shape: 'corridor',
      ownerId: 'owner', team: 0, audience: 'owner-only', anchor: [0, 0, 0], pathStart: [-10, 0, 0], pathEnd: [10, 0, 0], halfWidthM: 6, expiresInMs: 900,
    } as const;
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, placementMarkers: [privateCorridor] } })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...message, forPlayerId: 'observer', snapshot: { ...message.snapshot, placementMarkers: [privateCorridor] } })).toBe(false);
    const publicTarget = {
      ...privateCorridor,
      id: 'ks-activation-7-1:carpet-target',
      shape: 'ground-x' as const,
      audience: 'all-combatants' as const,
      pathStart: null,
      pathEnd: null,
      halfWidthM: null,
    };
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, placementMarkers: [publicTarget, privateCorridor] } })).toBe(true);
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, placementMarkers: [publicTarget] } })).toBe(false);
    expect(isKillstreakProtocolMessage({
      ...message,
      forPlayerId: 'observer',
      snapshot: { ...message.snapshot, placementMarkers: [publicTarget] },
    })).toBe(true);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: { ...message.snapshot, placementMarkers: [{ ...publicTarget, audience: 'owner-only' }] },
    })).toBe(false);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: { ...message.snapshot, placementMarkers: [{ ...privateCorridor, halfWidthM: null }] },
    })).toBe(false);
    for (const placementMarkers of [
      [publicTarget, { ...privateCorridor, anchor: [1, 0, 0] }],
      [publicTarget, { ...privateCorridor, team: 1 }],
      [publicTarget, { ...privateCorridor, expiresInMs: 901 }],
      [publicTarget, { ...privateCorridor, halfWidthM: 13 }],
      [publicTarget, { ...privateCorridor, pathEnd: [250, 0, 0] }],
      [publicTarget, privateCorridor, privateCorridor],
      [{ ...publicTarget, id: 'unbound-target-id' }, privateCorridor],
    ]) {
      expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, placementMarkers } })).toBe(false);
    }
    const careTarget = {
      ...publicTarget,
      id: 'ks-activation-7-2:care-target',
      activationId: 'ks-activation-7-2',
      source: 'care-package' as const,
      expiresInMs: 6_000,
    };
    expect(isKillstreakProtocolMessage({ ...message, snapshot: { ...message.snapshot, placementMarkers: [careTarget] } })).toBe(true);
    expect(isKillstreakProtocolMessage({
      ...message,
      snapshot: { ...message.snapshot, placementMarkers: [{ ...careTarget, expiresInMs: 6_001 }] },
    })).toBe(false);
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

  it('strictly validates replicated Chopper missile ammo and cooldown state', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout);
    for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    expect(runtime.activate({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
      activationId: 'activation-chopper-state', expectedId: 'chopper', anchor: [0, 0, 0],
    }, 1_000, {
      bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40, floorY: 0, ceilingY: 32 },
      targets: [],
    }).accepted).toBe(true);
    const snapshot = runtime.snapshotFor('owner', 1_000);
    const message = { type: 'killstreak-state' as const, by: 'host', forPlayerId: 'owner', snapshot, nonce: 81 };
    expect(snapshot.entities[0]).toMatchObject({ missileAmmo: 6, missileCooldownMs: 0 });
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    const chopper = snapshot.entities[0]!;
    const withChopper = (replacement: unknown) => ({
      ...message,
      snapshot: { ...snapshot, entities: [replacement] },
    });
    expect(isKillstreakProtocolMessage(withChopper({ ...chopper, missileAmmo: 7 }))).toBe(false);
    expect(isKillstreakProtocolMessage(withChopper({ ...chopper, missileCooldownMs: 1_001 }))).toBe(false);
    expect(isKillstreakProtocolMessage(withChopper({ ...chopper, missileAmmo: null }))).toBe(false);
    const missingAmmo = Object.fromEntries(Object.entries(chopper).filter(([key]) => key !== 'missileAmmo'));
    expect(isKillstreakProtocolMessage(withChopper(missingAmmo))).toBe(false);
  });

  it('admits canonical counted reward charges and rejects forged, duplicate, or mismatched banks', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout);
    for (let index = 0; index < 45; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const snapshot = runtime.snapshotFor('owner', 1_000);
    const message = { type: 'killstreak-state' as const, by: 'host', forPlayerId: 'owner', snapshot, nonce: 91 };
    expect(snapshot.actors[0]).toMatchObject({
      streak: 45,
      cycleProgress: 0,
      availableCharges: [
        { id: 'scout-sweep', count: 3 },
        { id: 'yardhawk', count: 3 },
        { id: 'tri-pass', count: 3 },
        { id: 'chopper', count: 3 },
        { id: 'nuke', count: 3 },
      ],
    });
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    const actor = snapshot.actors[0];
    const withActor = (replacement: unknown) => ({
      ...message,
      snapshot: { ...snapshot, actors: [replacement] },
    });
    expect(isKillstreakProtocolMessage(withActor({ ...actor, availableCharges: [{ id: 'scout-sweep', count: 0 }] }))).toBe(false);
    expect(isKillstreakProtocolMessage(withActor({
      ...actor,
      available: ['scout-sweep'],
      availableCharges: [{ id: 'scout-sweep', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD + 1 }],
    }))).toBe(false);
    expect(isKillstreakProtocolMessage(withActor({
      ...actor,
      availableCharges: [...actor.availableCharges, actor.availableCharges[0]],
    }))).toBe(false);
    expect(isKillstreakProtocolMessage(withActor({
      ...actor,
      available: [...actor.available].reverse(),
      availableCharges: [...actor.availableCharges].reverse(),
    }))).toBe(false);
    expect(isKillstreakProtocolMessage(withActor({ ...actor, available: actor.available.slice(1) }))).toBe(false);
    expect(isKillstreakProtocolMessage(withActor({ ...actor, cycleProgress: 15 }))).toBe(false);
  });

  it('rejects stale, duplicate, and forged host reward projections before they replace local state', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout);
    for (let index = 0; index < 15; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const message = {
      type: 'killstreak-state' as const,
      by: 'host',
      forPlayerId: 'owner',
      snapshot: runtime.snapshotFor('owner', 1_000),
      nonce: 71,
    };
    const context = {
      expectedHostId: 'host',
      expectedRecipientId: 'owner',
      expectedMatchEpoch: 7,
      currentRevision: message.snapshot.revision,
      seenNonces: new Set<number>(),
    };
    expect(admitKillstreakStateMessage(message, context)).toEqual({ accepted: true, reason: 'accepted' });
    expect(admitKillstreakStateMessage({ ...message, by: 'peer' }, context)).toEqual({ accepted: false, reason: 'forged-host' });
    expect(admitKillstreakStateMessage({ ...message, forPlayerId: 'observer' }, context)).toEqual({ accepted: false, reason: 'forged-recipient' });
    expect(admitKillstreakStateMessage({
      ...message, snapshot: { ...message.snapshot, matchEpoch: 6 },
    }, context)).toEqual({ accepted: false, reason: 'match-epoch-mismatch' });
    expect(admitKillstreakStateMessage({
      ...message, snapshot: { ...message.snapshot, revision: message.snapshot.revision - 1 },
    }, context)).toEqual({ accepted: false, reason: 'stale-revision' });
    expect(admitKillstreakStateMessage(message, {
      ...context, seenNonces: new Set([message.nonce]),
    })).toEqual({ accepted: false, reason: 'duplicate-nonce' });
  });

  it('admits host-filtered piloted sensor contacts only for the possessing recipient', () => {
    const pilotLoadout = parseKillstreakLoadout({
      schemaVersion: 1, slots: ['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke'],
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, pilotLoadout);
    for (let index = 0; index < 5; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const activation = runtime.activate({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 2,
      activationId: 'activation-piloted-sensor', expectedId: 'piloted-drone', anchor: [0, 0, 0],
    }, 1_000, {
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20, floorY: 0, ceilingY: 20 },
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, -8] },
      ],
      hasLineOfSight: () => false,
    });
    runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
      entityId: activation.entityIds[0], action: 'toggle-piloted-drone',
    }, 1_000);
    runtime.advance(1_001, {
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20, floorY: 0, ceilingY: 20 },
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, -8] },
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
