import { describe, expect, it } from 'vitest';
import { PASS65_KILLSTREAK_CATALOG, parseKillstreakLoadout } from './killstreak-catalog';
import {
  ADRENALINE_DAMAGE_MULTIPLIER,
  ADRENALINE_DURATION_MS,
  ADRENALINE_MOVEMENT_MULTIPLIER,
  ADRENALINE_RELOAD_DURATION_MULTIPLIER,
  CARPET_BOMBER_DAMAGE_MULTIPLIER,
  CARPET_BOMBER_IMPACT_COUNT,
  CARPET_BOMBER_MAX_DAMAGE,
  CARPET_BOMBER_PREVIOUS_MAX_DAMAGE,
  CARPET_BOMB_SHELL_DROP_LEAD_MS,
  CARPET_TARGET_MARKER_MAX_LIFETIME_MS,
  CHOPPER_DURATION_MS,
  CHOPPER_HEALTH,
  DRONE_HEALTH,
  DRONE_SWARM_COUNT,
  DRONE_SWARM_DURATION_MS,
  HostKillstreakRuntime,
  MAX_RETAINED_CARE_REWARDS,
  MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD,
  adrenalineModifiers,
  chopperGunnerAuthoritativeRay,
  droneSwarmStepMinimumAltitudeY,
  type KillstreakActivationIntent,
  type KillstreakEntitySnapshot,
  type KillstreakTarget,
  type KillstreakWorld,
} from './killstreak-runtime';
import {
  CHOPPER_GUN_SPLASH_MAX_DAMAGE,
  CHOPPER_GUN_SPLASH_RADIUS_M,
  chopperMissileGroundTarget,
  type KillstreakDamageEvent,
} from './killstreak-runtime';

const DEFAULT_WORLD: KillstreakWorld = {
  bounds: { minX: -40, maxX: 40, minZ: -45, maxZ: 45, floorY: 0, ceilingY: 40 },
  targets: [
    { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
    { id: 'enemy', kind: 'player', team: 1, lifeId: 3, alive: true, position: [0, 1.7, 12] },
    { id: 'enemy-bot', kind: 'bot', team: 1, lifeId: 2, alive: true, position: [8, 1.7, 10] },
    { id: 'friendly', kind: 'player', team: 0, lifeId: 4, alive: true, position: [0, 1.7, 8] },
  ],
  hasLineOfSight: () => true,
  isFlightPositionValid: () => true,
};

function loadout(slots: readonly [string, string, string, string, string]) {
  return parseKillstreakLoadout({ schemaVersion: 1, slots });
}

function earn(runtime: HostKillstreakRuntime, count: number, actorId = 'owner'): void {
  for (let index = 0; index < count; index += 1) runtime.recordEligibleElimination(actorId, 'weapon');
}

function intent(
  expectedId: KillstreakActivationIntent['expectedId'],
  slot: KillstreakActivationIntent['slot'],
  sequence = 1,
  activationId = `activation-${expectedId}-${sequence}`,
): KillstreakActivationIntent {
  return { by: 'owner', matchEpoch: 7, lifeId: 1, sequence, slot, activationId, expectedId, anchor: [0, 0, 0] };
}

describe('host killstreak runtime', () => {
  it('routes secure test-bay grants through normal host activation without consuming real care rewards', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));

    expect(runtime.grantTrainingReward('owner', 1, 'piloted-drone', {
      arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'offline',
    })).toEqual({ accepted: true, reason: 'accepted' });
    expect(runtime.snapshotFor('owner', 100).actors[0].revealedCareRewards).toEqual(['piloted-drone']);
    expect(runtime.activate(intent('piloted-drone', 1), 100, DEFAULT_WORLD)).toMatchObject({
      accepted: true,
      activatedId: 'piloted-drone',
    });
    expect(runtime.snapshotFor('owner', 101).actors[0].revealedCareRewards).toEqual([]);
  });

  it('admits every catalog support from an isolated secure test-bay station through the canonical runtime', () => {
    for (const [index, definition] of PASS65_KILLSTREAK_CATALOG.definitions.entries()) {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
      expect(runtime.grantTrainingReward('owner', 1, definition.id, {
        arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'host',
      })).toEqual({ accepted: true, reason: 'accepted' });
      expect(runtime.activate(intent(definition.id, 1, index + 1), 1_000, DEFAULT_WORLD)).toMatchObject({
        accepted: true,
        activatedId: definition.id,
      });
    }
  });

  it('keeps an off-centre Gun Range chopper route inside the authored support-flight bay', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 8);
    const gunRangeWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      bounds: { minX: -20, maxX: 100, minZ: -48, maxZ: 38, floorY: 0, ceilingY: 18 },
      supportFlightCentreVolume: {
        centre: [76, 4.5, 6],
        halfExtents: [7.5, 1, 7.5],
      },
      resolveFlightPosition: (_from, desired) => desired,
    };
    const activation = runtime.activate(intent('chopper', 4), 1_000, gunRangeWorld);
    expect(activation.accepted).toBe(true);
    for (let elapsed = 0; elapsed < CHOPPER_DURATION_MS; elapsed += 500) {
      const now = 1_000 + elapsed;
      runtime.advance(now, gunRangeWorld);
      const chopper = runtime.snapshotFor('owner', now).entities.find((entity) => entity.kind === 'chopper');
      expect(chopper, `missing chopper at ${elapsed}ms`).toBeDefined();
      expect(chopper!.position[0], `x at ${elapsed}ms`).toBeGreaterThanOrEqual(51.5);
      expect(chopper!.position[0], `x at ${elapsed}ms`).toBeLessThanOrEqual(100);
      expect(chopper!.position[2], `z at ${elapsed}ms`).toBeGreaterThanOrEqual(-26);
      expect(chopper!.position[2], `z at ${elapsed}ms`).toBeLessThanOrEqual(38);
    }
  });

  it('fails closed for spoofed test-bay context, stale lives and missing actors', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    const valid = { arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'host' } as const;
    expect(runtime.grantTrainingReward('missing', 1, 'chopper', valid).reason).toBe('unknown-actor');
    expect(runtime.grantTrainingReward('owner', 2, 'chopper', valid).reason).toBe('life-mismatch');
    expect(runtime.grantTrainingReward('owner', 1, 'chopper', {
      ...valid,
      arenaId: 'atomic-acres',
    } as unknown as typeof valid).reason).toBe('invalid-training-context');
    expect(runtime.snapshotFor('owner', 100).actors[0].revealedCareRewards).toEqual([]);
  });

  it('earns only the frozen five-slot selection and retains unconsumed rewards across lives', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm']));
    expect(runtime.recordEligibleElimination('owner', 'killstreak')).toEqual([]);
    earn(runtime, 2);
    expect(runtime.snapshotFor('owner', 0).actors[0].available).toEqual([]);
    expect(runtime.recordEligibleElimination('owner', 'ordnance')).toEqual(['adrenaline']);
    earn(runtime, 2);
    expect(runtime.snapshotFor('owner', 0).actors[0].available).toEqual(['adrenaline', 'yardhawk']);
    earn(runtime, 20);
    expect(runtime.snapshotFor('owner', 0).actors[0].available).toEqual([
      'adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm',
    ]);
    expect(runtime.snapshotFor('owner', 0).actors[0].availableCharges).toEqual([
      { id: 'adrenaline', count: 2 },
      { id: 'yardhawk', count: 2 },
      { id: 'carpet-bomber', count: 2 },
      { id: 'chopper', count: 2 },
      { id: 'drone-swarm', count: 1 },
    ]);
    expect(runtime.recordEligibleElimination('owner', 'weapon')).toEqual([]);
    runtime.recordActorDeath('owner', 2);
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({
      lifeId: 2,
      streak: 0,
      cycleProgress: 0,
      available: ['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm'],
    });
    runtime.recordActorDeath('owner', 3);
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({
      lifeId: 3,
      streak: 0,
      cycleProgress: 0,
      available: ['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm'],
    });
  });

  it('banks three same-life ladder cycles without consumption and spends exactly one charge per accepted activation', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 45);
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({
      streak: 45,
      cycleProgress: 0,
      available: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
      availableCharges: [
        { id: 'scout-sweep', count: 3 },
        { id: 'yardhawk', count: 3 },
        { id: 'tri-pass', count: 3 },
        { id: 'chopper', count: 3 },
        { id: 'nuke', count: 3 },
      ],
    });

    expect(runtime.activate(intent('scout-sweep', 1, 1), 1_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 1_000).actors[0].availableCharges[0]).toEqual({ id: 'scout-sweep', count: 2 });
    expect(runtime.activate(intent('scout-sweep', 1, 1), 1_001, DEFAULT_WORLD)).toMatchObject({
      accepted: false,
      reason: 'replayed-sequence',
    });
    expect(runtime.snapshotFor('owner', 1_001).actors[0].availableCharges[0]).toEqual({ id: 'scout-sweep', count: 2 });

    earn(runtime, 5);
    expect(runtime.snapshotFor('owner', 1_002).actors[0]).toMatchObject({
      streak: 50,
      cycleProgress: 5,
      availableCharges: [
        { id: 'scout-sweep', count: 3 },
        { id: 'yardhawk', count: 4 },
        { id: 'tri-pass', count: 3 },
        { id: 'chopper', count: 3 },
        { id: 'nuke', count: 3 },
      ],
    });
    expect(runtime.activate(intent('scout-sweep', 1, 2), 1_003, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 1_003).actors[0].availableCharges[0]).toEqual({ id: 'scout-sweep', count: 2 });
  });

  it('backpressures before a full reward bank instead of silently discarding an earned charge', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD * 15);
    expect(runtime.snapshotFor('owner', 0).actors[0].availableCharges).toEqual([
      { id: 'scout-sweep', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD },
      { id: 'yardhawk', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD },
      { id: 'tri-pass', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD },
      { id: 'chopper', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD },
      { id: 'nuke', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD },
    ]);

    earn(runtime, 2);
    expect(runtime.recordEligibleElimination('owner', 'weapon')).toEqual([]);
    expect(runtime.snapshotFor('owner', 0).actors[0].cycleProgress).toBe(2);
    expect(runtime.activate(intent('scout-sweep', 1, 1), 1_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.recordEligibleElimination('owner', 'weapon')).toEqual(['scout-sweep']);
    const resumed = runtime.snapshotFor('owner', 1_001).actors[0];
    expect(resumed.cycleProgress).toBe(3);
    expect(resumed.availableCharges[0]).toEqual({
      id: 'scout-sweep', count: MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD,
    });
  });

  it('preserves earned rewards across repeated deaths and a transport rejoin while rejecting stale, duplicate, and forged activation claims', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    const registeredRevision = runtime.snapshotFor('owner', 0).revision;
    earn(runtime, 18);
    expect(runtime.snapshotFor('owner', 0)).toMatchObject({ revision: registeredRevision + 18 });
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({ streak: 18, cycleProgress: 3 });
    runtime.recordActorDeath('owner', 2);
    runtime.recordActorDeath('owner', 3);

    // A network disconnect does not unregister the host actor. A reconnecting
    // recipient receives a fresh projection of the same canonical queue.
    const rejoined = runtime.snapshotFor('owner', 5_000).actors[0];
    expect(rejoined).toMatchObject({
      lifeId: 3,
      streak: 0,
      cycleProgress: 0,
      availableCharges: [
        { id: 'scout-sweep', count: 2 },
        { id: 'yardhawk', count: 1 },
        { id: 'tri-pass', count: 1 },
        { id: 'chopper', count: 1 },
        { id: 'nuke', count: 1 },
      ],
    });
    expect(rejoined.available).toEqual(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']);

    expect(runtime.activate({
      ...intent('nuke', 5), lifeId: 2, activationId: 'activation-stale-life',
    }, 5_001, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'life-mismatch' });
    expect(runtime.activate({
      ...intent('nuke', 4), lifeId: 3, activationId: 'activation-forged-slot',
    }, 5_002, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'selection-mismatch' });

    const accepted = runtime.activate({
      ...intent('nuke', 5), lifeId: 3, activationId: 'activation-authority-nuke',
    }, 5_003, DEFAULT_WORLD);
    expect(accepted.accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 5_003).actors[0].available).not.toContain('nuke');
    expect(runtime.activate({
      ...intent('nuke', 5), lifeId: 3, activationId: 'activation-authority-nuke',
    }, 5_004, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'replayed-sequence' });

    runtime.recordActorDeath('owner', 4);
    earn(runtime, 15);
    expect(runtime.activate({
      ...intent('nuke', 5, 1, 'activation-authority-nuke'), lifeId: 4,
    }, 6_000, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'duplicate-activation-id' });
    expect(runtime.snapshotFor('owner', 6_000).actors[0].available).toContain('nuke');
    expect(runtime.activate({
      ...intent('nuke', 5, 2, 'activation-authority-nuke-2'), lifeId: 4,
    }, 6_001, DEFAULT_WORLD).accepted).toBe(true);
  });

  it('applies the exact non-stacking Adrenaline stage for exactly 15 seconds', () => {
    expect(adrenalineModifiers(ADRENALINE_DURATION_MS, ADRENALINE_DURATION_MS - 1)).toEqual({
      active: true,
      damage: ADRENALINE_DAMAGE_MULTIPLIER,
      movement: ADRENALINE_MOVEMENT_MULTIPLIER,
      reloadDuration: ADRENALINE_RELOAD_DURATION_MULTIPLIER,
    });
    expect(adrenalineModifiers(ADRENALINE_DURATION_MS, ADRENALINE_DURATION_MS)).toEqual({
      active: false, damage: 1, movement: 1, reloadDuration: 1,
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['adrenaline', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 3);
    expect(runtime.activate(intent('adrenaline', 1), 1_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.modifiersForActor('owner', 15_999).active).toBe(true);
    expect(runtime.modifiersForActor('owner', 16_000).active).toBe(false);
    expect(runtime.activate(intent('adrenaline', 1, 2), 1_001, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'reward-not-earned' });
  });

  it('keeps chopper flight host-AI while F toggles gun-only control at any active time and AI resumes', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 8);
    const activation = runtime.activate(intent('chopper', 3), 10_000, DEFAULT_WORLD);
    expect(activation).toMatchObject({ accepted: true, activatedId: 'chopper' });
    const entityId = activation.entityIds[0];
    expect(runtime.snapshotFor('owner', 10_000).entities[0]).toMatchObject({ health: CHOPPER_HEALTH, gunController: 'ai' });
    const enter = runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 10_001);
    expect(enter.accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 10_001).entities[0].gunController).toBe('owner-player');
    const before = runtime.snapshotFor('owner', 10_001).entities[0].position;
    runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control', yawQ: 2.5, pitchQ: -0.2, thrustQ: 1, verticalQ: 1,
    }, 12_000);
    runtime.advance(12_000, DEFAULT_WORLD);
    const after = runtime.snapshotFor('owner', 12_000).entities[0].position;
    expect(after).not.toEqual(before);
    const exit = runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId, action: 'toggle-chopper-gunner',
    }, 39_999);
    expect(exit.accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 39_999).entities[0].gunController).toBe('ai');
    expect(runtime.advance(10_000 + CHOPPER_DURATION_MS, DEFAULT_WORLD).expiredEntityIds).toEqual([entityId]);
  });

  it('restores AI gun and ordinary control exactly once on owner death', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 8);
    const entityId = runtime.activate(intent('chopper', 3), 0, DEFAULT_WORLD).entityIds[0];
    runtime.control({ by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner' }, 1);
    runtime.recordActorDeath('owner', 2);
    const snapshot = runtime.snapshotFor('owner', 2);
    expect(snapshot.actors[0].possession).toBeNull();
    expect(snapshot.entities[0].gunController).toBe('ai');
    expect(runtime.control({ by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'toggle-chopper-gunner' }, 3)).toMatchObject({ accepted: false, reason: 'identity-mismatch' });
  });

  it('HF-187 atomically supersedes drone possession with chopper and toggles the selected slot platform back to AI', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 8);
    const droneId = runtime.activate(intent('piloted-drone', 2, 1), 1_000, DEFAULT_WORLD).entityIds[0];
    const chopperId = runtime.activate(intent('chopper', 4, 2), 1_001, DEFAULT_WORLD).entityIds[0];

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: droneId, action: 'toggle-piloted-drone',
    }, 1_002).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 1_002).actors[0].possession).toEqual({ kind: 'piloted-drone', entityId: droneId });

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: chopperId, action: 'toggle-chopper-gunner',
    }, 1_003).accepted).toBe(true);
    let snapshot = runtime.snapshotFor('owner', 1_003);
    expect(snapshot.actors[0].possession).toEqual({ kind: 'chopper-gunner', entityId: chopperId });
    expect(snapshot.entities.find((entity) => entity.id === droneId)?.mode).toBe('piloted');
    expect(snapshot.entities.find((entity) => entity.id === chopperId)?.gunController).toBe('owner-player');

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId: chopperId, action: 'toggle-chopper-gunner',
    }, 1_004).accepted).toBe(true);
    snapshot = runtime.snapshotFor('owner', 1_004);
    expect(snapshot.actors[0].possession).toBeNull();
    expect(snapshot.entities.find((entity) => entity.id === chopperId)?.gunController).toBe('ai');
  });

  it('ends chopper possession on disconnect, resumes AI, and preserves rewards for a replacement transport', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 15);
    const entityId = runtime.activate(intent('chopper', 3), 1_000, DEFAULT_WORLD).entityIds[0];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 1_001).accepted).toBe(true);

    runtime.recordActorDisconnect('owner');
    const disconnected = runtime.snapshotFor('owner', 1_002);
    expect(disconnected.actors[0]).toMatchObject({
      lifeId: 1,
      streak: 15,
      possession: null,
      available: ['scout-sweep', 'yardhawk', 'tri-pass', 'nuke'],
    });
    expect(disconnected.entities[0]).toMatchObject({ id: entityId, gunController: 'ai' });

    // A replacement transport starts a fresh control-sequence domain without
    // minting rewards or replacing the canonical actor.
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 1_003).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 1_003).actors[0].possession).toEqual({ kind: 'chopper-gunner', entityId });
    expect(runtime.activate(intent('nuke', 5, 1, 'activation-rejoined-nuke'), 1_004, DEFAULT_WORLD).accepted).toBe(true);
  });

  it('returns a disconnected piloted drone to autonomous fire and unregisters only after reservation expiry', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    const entityId = runtime.activate(intent('piloted-drone', 2), 1_000, DEFAULT_WORLD).entityIds[0];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_001).accepted).toBe(true);

    runtime.recordActorDisconnect('owner');
    expect(runtime.snapshotFor('owner', 1_002).actors[0].possession).toBeNull();
    expect(runtime.advance(1_600, DEFAULT_WORLD).damageEvents).toEqual([
      expect.objectContaining({ source: 'piloted-drone', ownerId: 'owner', damage: expect.any(Number) }),
    ]);
    runtime.unregisterActor('owner');
    const expired = runtime.snapshotFor('owner', 1_601);
    expect(expired.actors).toEqual([]);
    expect(expired.entities).toEqual([]);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_602)).toMatchObject({ accepted: false, reason: 'unknown-actor' });
  });

  it('atomically ends support, possession, timed modifiers, and deferred impacts on every match terminal path', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 15);
    expect(runtime.activate(intent('adrenaline', 1, 1, 'activation-end-adrenaline'), 1_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.activate(intent('carpet-bomber', 3, 2, 'activation-end-carpet'), 1_001, DEFAULT_WORLD).accepted).toBe(true);
    const chopperId = runtime.activate(intent('chopper', 4, 3, 'activation-end-chopper'), 1_002, DEFAULT_WORLD).entityIds[0];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: chopperId, action: 'toggle-chopper-gunner',
    }, 1_003).accepted).toBe(true);

    expect(runtime.modifiersForActor('owner', 1_004).active).toBe(true);
    const activeEntityIds = runtime.snapshotFor('owner', 1_004).entities.map((entity) => entity.id);
    expect(new Set(runtime.endMatch())).toEqual(new Set(activeEntityIds));
    const ended = runtime.snapshotFor('owner', 1_005);
    expect(ended.entities).toEqual([]);
    expect(ended.placementMarkers).toEqual([]);
    expect(ended.actors[0].possession).toBeNull();
    expect(runtime.modifiersForActor('owner', 1_005).active).toBe(false);
    expect(runtime.advance(20_000, DEFAULT_WORLD)).toEqual({
      damageEvents: [], shotEvents: [], impactEvents: [], expiredEntityIds: [],
      // HF-334: host killstreak result object includes careWeaponGrantEvents
      // (care-package weapon grants, e.g. the 10% flamethrower reward).
      careWeaponGrantEvents: [],
      // HF-458: and taserStunEvents (Piloted Drone taser hits).
      taserStunEvents: [],
    });
    expect(runtime.endMatch()).toEqual([]);
  });

  it('derives exactly 20 deterministic in-bounds Carpet Bomber impacts from host seed only', () => {
    const setup = (clientRequestId: string) => {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
      earn(runtime, 7);
      runtime.activate(intent('carpet-bomber', 3, 1, clientRequestId), 1_000, DEFAULT_WORLD);
      const damageEvents = [];
      const impactEvents = [];
      for (let now = 1_000; now <= 6_000; now += 20) {
        const step = runtime.advance(now, DEFAULT_WORLD);
        damageEvents.push(...step.damageEvents);
        impactEvents.push(...step.impactEvents);
      }
      return {
        damageEvents,
        impactEvents,
      };
    };
    const first = setup('activation-client-request-a');
    const second = setup('activation-client-request-b');
    expect(first.impactEvents).toHaveLength(CARPET_BOMBER_IMPACT_COUNT * 2);
    expect(first.impactEvents).toEqual(second.impactEvents);
    expect(first.impactEvents.every((impact) => impact.position[0] >= -40 && impact.position[0] <= 40
      && impact.position[2] >= -45 && impact.position[2] <= 45)).toBe(true);
    expect(new Set(first.impactEvents.map((impact) => `${impact.ordinal}:${impact.phase}`)).size)
      .toBe(CARPET_BOMBER_IMPACT_COUNT * 2);
    for (let ordinal = 0; ordinal < CARPET_BOMBER_IMPACT_COUNT; ordinal += 1) {
      const drop = first.impactEvents.find((event) => event.ordinal === ordinal && event.phase === 'drop');
      const impact = first.impactEvents.find((event) => event.ordinal === ordinal && event.phase === 'impact');
      expect(drop).toBeDefined();
      expect(impact).toBeDefined();
      expect(drop?.impactAtMs).toBe(impact?.impactAtMs);
      expect(drop?.atMs).toBe((impact?.impactAtMs ?? 0) - CARPET_BOMB_SHELL_DROP_LEAD_MS);
      expect(impact?.atMs).toBe(impact?.impactAtMs);
      expect((drop?.impactAtMs ?? 0) - (1_000 + CARPET_TARGET_MARKER_MAX_LIFETIME_MS + ordinal * 180))
        .toBe(0);
    }
    const staged = new HostKillstreakRuntime(7);
    staged.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(staged, 7);
    staged.activate(intent('carpet-bomber', 3), 1_000, DEFAULT_WORLD);
    expect(staged.advance(2_000 - CARPET_BOMB_SHELL_DROP_LEAD_MS, DEFAULT_WORLD).impactEvents)
      .toEqual([expect.objectContaining({ ordinal: 0, phase: 'drop', impactAtMs: 2_000 })]);
    expect(staged.advance(1_999, DEFAULT_WORLD).impactEvents.every((event) => event.phase === 'drop')).toBe(true);
    expect(staged.advance(2_000, DEFAULT_WORLD).impactEvents)
      .toContainEqual(expect.objectContaining({ ordinal: 0, phase: 'impact', impactAtMs: 2_000 }));
  });

  it('rejects a fully blocked Carpet route before consuming the reward and permits an exact retry', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    const blockedWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      resolveFlightEnvelopePosition: (from) => [...from],
    };
    const activationIntent = intent('carpet-bomber', 3, 1, 'activation-blocked-route');
    expect(runtime.activate(activationIntent, 1_000, blockedWorld)).toMatchObject({
      accepted: false,
      reason: 'no-clear-carpet-route',
    });
    expect(runtime.carpetBomberReservationCount()).toBe(0);
    expect(runtime.snapshotFor('owner', 1_001).actors[0].available).toContain('carpet-bomber');

    expect(runtime.activate(activationIntent, 1_002, DEFAULT_WORLD)).toMatchObject({
      accepted: true,
      activatedId: 'carpet-bomber',
    });
    expect(runtime.carpetBomberReservationCount()).toBe(1);
  });

  it('selects a deterministic alternate heading when the requested Carpet corridor is blocked', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    let rejectedHorizontalSweeps = 0;
    const headingWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      resolveFlightEnvelopePosition: (from, desired) => {
        const dx = Math.abs(desired[0] - from[0]);
        const dz = Math.abs(desired[2] - from[2]);
        if (dx > dz * 2 && dx > 0.5) {
          rejectedHorizontalSweeps += 1;
          return [...from];
        }
        return [...desired];
      },
    };
    const result = runtime.activate({
      ...intent('carpet-bomber', 3),
      facing: [1, 0, 0],
    }, 1_000, headingWorld);
    expect(result.accepted).toBe(true);
    expect(rejectedHorizontalSweeps).toBeGreaterThan(0);
    const before = runtime.snapshotFor('owner', 1_000).entities.find((entity) => entity.id === result.entityIds[0]);
    runtime.advance(2_000, headingWorld);
    const after = runtime.snapshotFor('owner', 2_000).entities.find((entity) => entity.id === result.entityIds[0]);
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(Math.abs(after!.position[2] - before!.position[2]))
      .toBeGreaterThan(Math.abs(after!.position[0] - before!.position[0]));
  });

  it('never releases undropped Carpet payload while the admitted airframe is stopped, then cleans the reservation', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    let liveRouteBlocked = false;
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      resolveFlightEnvelopePosition: (from, desired) => liveRouteBlocked ? [...from] : [...desired],
    };
    expect(runtime.activate(intent('carpet-bomber', 3), 1_000, world).accepted).toBe(true);
    liveRouteBlocked = true;
    const emitted = [];
    for (let now = 1_000; now <= 9_000; now += 100) emitted.push(...runtime.advance(now, world).impactEvents);
    expect(emitted).toEqual([]);
    expect(runtime.carpetBomberReservationCount()).toBe(0);
    expect(runtime.snapshotFor('owner', 9_001).entities.filter((entity) => entity.kind === 'aircraft')).toEqual([]);
  });

  it('preserves a real 420ms shell lead after a coarse/stalled host advance', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    runtime.activate(intent('carpet-bomber', 3), 1_000, DEFAULT_WORLD);

    const stalled = runtime.advance(6_000, DEFAULT_WORLD);
    expect(stalled.damageEvents).toEqual([]);
    expect(stalled.impactEvents).toEqual([
      expect.objectContaining({ ordinal: 0, phase: 'drop', atMs: 6_000, impactAtMs: 6_420 }),
    ]);
    expect(runtime.advance(6_001, DEFAULT_WORLD).impactEvents).toEqual([]);
    expect(runtime.advance(6_180, DEFAULT_WORLD).impactEvents).toEqual([
      expect.objectContaining({ ordinal: 1, phase: 'drop', atMs: 6_180, impactAtMs: 6_600 }),
    ]);
    expect(runtime.advance(6_419, DEFAULT_WORLD).impactEvents.every((event) => event.phase === 'drop')).toBe(true);
    const landed = runtime.advance(6_420, DEFAULT_WORLD);
    expect(landed.impactEvents).toContainEqual(
      expect.objectContaining({ ordinal: 0, phase: 'impact', atMs: 6_420, impactAtMs: 6_420 }),
    );
    const firstLanded = landed.impactEvents.find((event) => event.phase === 'impact' && event.ordinal === 0);
    expect(firstLanded).toBeDefined();
    expect(firstLanded!.atMs - stalled.impactEvents[0]!.atMs).toBe(CARPET_BOMB_SHELL_DROP_LEAD_MS);
  });

  it('binds Carpet Bomber to exactly three times the previous maximum damage', () => {
    expect(CARPET_BOMBER_MAX_DAMAGE).toBe(CARPET_BOMBER_PREVIOUS_MAX_DAMAGE * CARPET_BOMBER_DAMAGE_MULTIPLIER);
    expect(CARPET_BOMBER_DAMAGE_MULTIPLIER).toBe(3);
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    runtime.activate(intent('carpet-bomber', 3), 1_000, DEFAULT_WORLD);
    const drops = runtime.advance(2_000 - CARPET_BOMB_SHELL_DROP_LEAD_MS, DEFAULT_WORLD).impactEvents.filter((event) => event.phase === 'drop');
    const exactImpact = drops[0]!.position;
    const result = runtime.advance(2_000, {
      ...DEFAULT_WORLD,
      targets: [
        DEFAULT_WORLD.targets[0]!,
        { id: 'exact-impact-enemy', kind: 'player', team: 1, lifeId: 1, alive: true, position: exactImpact },
      ],
    });
    expect(result.damageEvents.find((event) => event.targetId === 'exact-impact-enemy'
      && event.origin.every((value, axis) => value === exactImpact[axis]))?.damage).toBe(CARPET_BOMBER_MAX_DAMAGE);
  });

  it('lifts only the room-collision LOS probe above the floor while retaining the exact impact origin', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    runtime.activate(intent('carpet-bomber', 3), 1_000, DEFAULT_WORLD);
    const [drop] = runtime.advance(
      1_000 + CARPET_TARGET_MARKER_MAX_LIFETIME_MS - CARPET_BOMB_SHELL_DROP_LEAD_MS,
      DEFAULT_WORLD,
    ).impactEvents;
    expect(drop).toMatchObject({ ordinal: 0, phase: 'drop' });
    const observedOrigins: readonly number[][] = [];
    const result = runtime.advance(drop!.impactAtMs, {
      ...DEFAULT_WORLD,
      targets: [{
        id: 'floor-victim', kind: 'player', team: 1, lifeId: 1, alive: true, position: drop!.position,
      }],
      hasLineOfSight: (from) => {
        (observedOrigins as number[][]).push([...from]);
        return from[1] > drop!.position[1];
      },
    });
    expect(observedOrigins).toContainEqual([drop!.position[0], drop!.position[1] + 0.08, drop!.position[2]]);
    expect(result.damageEvents.find((event) => event.targetId === 'floor-victim')?.origin).toEqual(drop!.position);
  });

  it('contains every admitted payload inside its seeded mildly-wide corridor across seeds, bounds and surfaces', () => {
    const boundsCases = [
      { minX: -40, maxX: 40, minZ: -45, maxZ: 45, floorY: 0, ceilingY: 40 },
      { minX: -28, maxX: 28, minZ: -22, maxZ: 22, floorY: 0, ceilingY: 30 },
      { minX: -48, maxX: 48, minZ: -30, maxZ: 30, floorY: 0, ceilingY: 35 },
    ] as const;
    for (let matchEpoch = 1; matchEpoch <= 30; matchEpoch += 1) {
      const bounds = boundsCases[matchEpoch % boundsCases.length]!;
      const groundHeightAt = (x: number, z: number) => 0.6
        + (x - bounds.minX) / (bounds.maxX - bounds.minX) * 0.7
        + (z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * 0.35;
      const world: KillstreakWorld = { ...DEFAULT_WORLD, bounds, groundHeightAt };
      const runtime = new HostKillstreakRuntime(matchEpoch);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
      earn(runtime, 7);
      const anchor: readonly [number, number, number] = matchEpoch % 2 === 0
        ? [bounds.maxX - 0.1, 99, bounds.minZ + 0.1]
        : [bounds.minX + 0.1, -99, bounds.maxZ - 0.1];
      expect(runtime.activate({
        by: 'owner', matchEpoch, lifeId: 1, sequence: 1, slot: 3,
        activationId: `activation-carpet-${matchEpoch}`, expectedId: 'carpet-bomber', anchor,
      }, 1_000, world).accepted).toBe(true);
      const corridor = runtime.snapshotFor('owner', 1_001).placementMarkers.find((marker) => marker.shape === 'corridor');
      expect(corridor).toBeDefined();
      expect(corridor?.audience).toBe('owner-only');
      expect(corridor?.halfWidthM).toBeGreaterThan(3.5);
      expect(corridor?.halfWidthM).toBeLessThan(7.5);
      const start = corridor!.pathStart!;
      const end = corridor!.pathEnd!;
      const dx = end[0] - start[0];
      const dz = end[2] - start[2];
      const lengthSquared = dx * dx + dz * dz;
      const impactEvents = [];
      for (let now = 1_000; now <= 6_000; now += 20) {
        impactEvents.push(...runtime.advance(now, world).impactEvents.filter((event) => event.phase === 'impact'));
      }
      expect(impactEvents).toHaveLength(CARPET_BOMBER_IMPACT_COUNT);
      for (const impact of impactEvents) {
        const relativeX = impact.position[0] - start[0];
        const relativeZ = impact.position[2] - start[2];
        const projection = (relativeX * dx + relativeZ * dz) / lengthSquared;
        const perpendicular = Math.abs(relativeX * dz - relativeZ * dx) / Math.sqrt(lengthSquared);
        expect(projection).toBeGreaterThanOrEqual(-1e-9);
        expect(projection).toBeLessThanOrEqual(1 + 1e-9);
        expect(perpendicular).toBeLessThanOrEqual(corridor!.halfWidthM! + 1e-9);
        expect(impact.position[1]).toBeCloseTo(groundHeightAt(impact.position[0], impact.position[2]), 8);
      }
    }
  });

  it('ignores a forged placement Y and anchors the Care X plus crate to the host surface', () => {
    const groundHeightAt = (x: number, z: number) => 2.25 + x * 0.01 - z * 0.005;
    const world: KillstreakWorld = { ...DEFAULT_WORLD, groundHeightAt };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    expect(runtime.activate({ ...intent('care-package', 1), anchor: [7, 999, -6] }, 1_000, world).accepted).toBe(true);
    const marker = runtime.snapshotFor('owner', 1_001).placementMarkers[0]!;
    const surfaceY = groundHeightAt(7, -6);
    expect(marker).toMatchObject({
      source: 'care-package', shape: 'ground-x', audience: 'all-combatants',
      anchor: [7, surfaceY, -6], pathStart: null, pathEnd: null, halfWidthM: null,
    });
    runtime.advance(7_000, world);
    const crate = runtime.snapshotFor('owner', 7_000).entities.find((entity) => entity.kind === 'care-crate');
    expect(crate?.phase).toBe('landed');
    expect(crate?.position).toEqual([7, surfaceY + 0.45, -6]);
  });

  it('replicates admitted placement X markers to both peers but keeps the carpet corridor owner-private', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    runtime.registerActor('observer', 1, 2, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 7);
    runtime.activate({ ...intent('carpet-bomber', 3), anchor: [6, 0, -4] }, 1_000, DEFAULT_WORLD);
    const owner = runtime.snapshotFor('owner', 1_001);
    const observer = runtime.snapshotFor('observer', 1_001);
    expect(owner.placementMarkers.map((marker) => marker.shape).sort()).toEqual(['corridor', 'ground-x']);
    expect(observer.placementMarkers.map((marker) => marker.shape)).toEqual(['ground-x']);
    expect(observer.placementMarkers[0]).toMatchObject({ anchor: [6, 0, -4], audience: 'all-combatants' });
    expect(owner.placementMarkers.find((marker) => marker.shape === 'corridor')).toMatchObject({ audience: 'owner-only' });
    runtime.advance(2_001, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 2_001).placementMarkers).toEqual([]);
    expect(runtime.snapshotFor('observer', 2_001).placementMarkers).toEqual([]);
  });

  it('never creates or consumes a target marker for rejected placement requests', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    expect(runtime.activate({ ...intent('care-package', 1), anchor: [4, 0, -2] }, 1_000, DEFAULT_WORLD))
      .toMatchObject({ accepted: false, reason: 'reward-not-earned' });
    expect(runtime.snapshotFor('owner', 1_000).placementMarkers).toEqual([]);
    earn(runtime, 4);
    expect(runtime.activate({ ...intent('care-package', 1), expectedId: 'carpet-bomber', anchor: [4, 0, -2] }, 1_001, DEFAULT_WORLD))
      .toMatchObject({ accepted: false, reason: 'selection-mismatch' });
    expect(runtime.snapshotFor('owner', 1_001).placementMarkers).toEqual([]);
    expect(runtime.snapshotFor('owner', 1_001).actors[0].available).toContain('care-package');
  });

  it('deploys exactly 24 targetable 50-HP swarm drones in a separated deterministic centre-map formation', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(runtime, 15);
    const activation = runtime.activate({ ...intent('drone-swarm', 5), facing: [0, 0, 1] }, 1_000, DEFAULT_WORLD);
    expect(activation.entityIds).toHaveLength(DRONE_SWARM_COUNT);
    const spawned = runtime.snapshotFor('owner', 1_000).entities;
    expect(spawned).toHaveLength(DRONE_SWARM_COUNT);
    expect(spawned.every((entity) => entity.kind === 'drone' && entity.mode === 'swarm' && entity.health === DRONE_HEALTH && entity.magazine === 20 && entity.reserveClips === null)).toBe(true);
    const centroid = spawned.reduce<[number, number, number]>(
      (sum, entity) => [sum[0] + entity.position[0], sum[1] + entity.position[1], sum[2] + entity.position[2]],
      [0, 0, 0],
    ).map((axis) => axis / spawned.length);
    expect(Math.abs(centroid[0])).toBeLessThan(0.1);
    expect(Math.abs(centroid[2])).toBeLessThan(0.1);
    for (let left = 0; left < spawned.length; left += 1) {
      for (let right = left + 1; right < spawned.length; right += 1) {
        expect(Math.hypot(
          spawned[left].position[0] - spawned[right].position[0],
          spawned[left].position[1] - spawned[right].position[1],
          spawned[left].position[2] - spawned[right].position[2],
        )).toBeGreaterThanOrEqual(1.15);
      }
    }
    const attacks = [...runtime.advance(2_000, DEFAULT_WORLD).damageEvents];
    for (let atMs = 2_100; atMs <= 5_000; atMs += 100) attacks.push(...runtime.advance(atMs, DEFAULT_WORLD).damageEvents);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.length).toBeLessThanOrEqual(DRONE_SWARM_COUNT);
    expect(attacks.every((event) => event.targetId === 'enemy' || event.targetId === 'enemy-bot')).toBe(true);
    expect(attacks).toHaveLength(1);
    expect(attacks.every((event) => event.damage > 1 && event.targetLifeId > 0)).toBe(true);
    expect(runtime.advance(1_000 + DRONE_SWARM_DURATION_MS, DEFAULT_WORLD).expiredEntityIds).toHaveLength(DRONE_SWARM_COUNT);
  });

  it('derives the swarm altitude floor from seeded local terrain and roof midpoints at both step ends', () => {
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      groundHeightAt: (x, z) => (x >= 0 ? 10 : 2) + (Math.abs(Math.round(z)) % 3),
    };
    const admittedSpawnY = 18;
    for (let seed = 1; seed <= 24; seed += 1) {
      const current: readonly [number, number, number] = [seed % 2 === 0 ? -8 : 8, admittedSpawnY, (seed * 7) % 11 - 5];
      const desired: readonly [number, number, number] = [seed % 2 === 0 ? 8 : -8, 0, (seed * 13) % 13 - 6];
      const currentSurface = world.groundHeightAt!(current[0], current[2]);
      const desiredSurface = world.groundHeightAt!(desired[0], desired[2]);
      const expected = Math.max(
        currentSurface + Math.max(1, (admittedSpawnY - currentSurface) * 0.5),
        desiredSurface + Math.max(1, (admittedSpawnY - desiredSurface) * 0.5),
      );
      expect(droneSwarmStepMinimumAltitudeY(admittedSpawnY, current, desired, world)).toBeCloseTo(expected, 8);
    }
    expect(droneSwarmStepMinimumAltitudeY(18, [-8, 18, 0], [8, 0, 0], world)).toBe(14);
  });

  it('evaluates each owner hostile set once per host step for the full 24-drone swarm', () => {
    let hostilityChecks = 0;
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      areHostile: (_ownerId, ownerTeam, target) => {
        hostilityChecks += 1;
        return target.team !== ownerTeam;
      },
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(runtime, 15);
    expect(runtime.activate(intent('drone-swarm', 5), 1_000, world).accepted).toBe(true);

    runtime.advance(3_001, world);
    expect(hostilityChecks).toBe(world.targets.length - 1);
    runtime.advance(3_101, world);
    expect(hostilityChecks).toBe((world.targets.length - 1) * 2);
  });

  it('uses the match hostility predicate so free-for-all opponents may share a team value', () => {
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'ffa-rival', kind: 'player', team: 0, lifeId: 2, alive: true, position: [0, 1.7, 10] },
      ],
      areHostile: (ownerId, _ownerTeam, target) => ownerId !== target.id,
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 8);
    runtime.activate(intent('chopper', 3), 1_000, world);
    const result = runtime.advance(2_000, world);
    expect(result.damageEvents).toHaveLength(1);
    expect(result.damageEvents[0]).toMatchObject({ ownerId: 'owner', targetId: 'ffa-rival' });
  });

  it('lets the standalone drone run autonomously or toggle into non-inverted first-person control', () => {
    const firstPersonForwardWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: DEFAULT_WORLD.targets.map((target) => target.id === 'enemy'
        ? { ...target, position: [0, 18, -12] as const }
        : target),
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('other', 1, 9, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    const entityId = runtime.activate(intent('piloted-drone', 2), 1_000, DEFAULT_WORLD).entityIds[0];
    expect(runtime.snapshotFor('owner', 1_000).entities[0]).toMatchObject({ magazine: 20, reserveClips: 2, mode: 'piloted' });
    expect(runtime.snapshotFor('owner', 1_000).actors[0].possession).toBeNull();
    const autonomousShot = runtime.advance(1_001, DEFAULT_WORLD);
    expect(autonomousShot.damageEvents[0]).toMatchObject({ source: 'piloted-drone', ownerId: 'owner' });
    expect(autonomousShot.shotEvents).toEqual([expect.objectContaining({
      entityId, source: 'piloted-drone', ownerId: 'owner', ownerTeam: 0, ordinal: 0,
    })]);
    expect(runtime.control({
      by: 'other', matchEpoch: 7, lifeId: 9, sequence: 1, entityId, action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 1, verticalQ: 1, fire: true,
    }, 1_001)).toMatchObject({ accepted: false, reason: 'entity-unavailable' });
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_002)).toMatchObject({ accepted: true });
    expect(runtime.snapshotFor('owner', 1_002).actors.find((actor) => actor.actorId === 'owner')?.possession)
      .toEqual({ kind: 'piloted-drone', entityId });
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 1, verticalQ: 1, fire: true,
    }, 1_003).accepted).toBe(true);
    const before = runtime.snapshotFor('owner', 1_003).entities[0].position;
    const controlledMiss = runtime.advance(1_301, {
      ...DEFAULT_WORLD,
      targets: DEFAULT_WORLD.targets.filter((target) => target.id === 'owner'),
    });
    expect(controlledMiss.damageEvents).toEqual([]);
    expect(controlledMiss.shotEvents).toEqual([expect.objectContaining({
      entityId, source: 'piloted-drone', ownerId: 'owner', ownerTeam: 0, ordinal: 1,
    })]);
    const controlledHit = runtime.advance(1_601, firstPersonForwardWorld);
    expect(controlledHit.damageEvents).toHaveLength(1);
    expect(controlledHit.shotEvents).toEqual([expect.objectContaining({
      entityId, source: 'piloted-drone', ordinal: 2,
    })]);
    runtime.advance(1_617, firstPersonForwardWorld);
    const after = runtime.snapshotFor('owner', 1_617).entities[0].position;
    expect(after[2]).toBeLessThan(before[2]);
    expect(runtime.control({ by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId, action: 'toggle-piloted-drone' }, 1_618).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 1_618).actors.find((actor) => actor.actorId === 'owner')?.possession).toBeNull();
  });

  it('strafes the possessed drone level-right and level-left independent of look direction', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    const entityId = runtime.activate(intent('piloted-drone', 2), 1_000, DEFAULT_WORLD).entityIds[0];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_001).accepted).toBe(true);
    // Look along negative Z (yaw 0): D must travel positive X with no forward drift.
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 0, strafeQ: 1, verticalQ: 0,
    }, 1_002).accepted).toBe(true);
    runtime.advance(1_100, DEFAULT_WORLD);
    const start = runtime.snapshotFor('owner', 1_100).entities[0].position;
    for (let atMs = 1_150; atMs <= 1_600; atMs += 50) runtime.advance(atMs, DEFAULT_WORLD);
    const right = runtime.snapshotFor('owner', 1_600).entities[0].position;
    expect(right[0]).toBeGreaterThan(start[0] + 1);
    expect(Math.abs(right[2] - start[2])).toBeLessThan(0.01);
    // Reverse the axis: A must return along negative X.
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId, action: 'pilot-control', strafeQ: -1,
    }, 1_601).accepted).toBe(true);
    for (let atMs = 1_650; atMs <= 2_100; atMs += 50) runtime.advance(atMs, DEFAULT_WORLD);
    const left = runtime.snapshotFor('owner', 2_100).entities[0].position;
    expect(left[0]).toBeLessThan(right[0] - 1);
  });

  it('keeps care seed, roll and reward host-private until one admitted capture completes', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, DEFAULT_WORLD).entityIds[0];
    const publicBefore = runtime.snapshotFor(null, 1_000);
    expect(JSON.stringify(publicBefore)).not.toMatch(/rollUnit|seed/i);
    expect(publicBefore.entities[0].revealedReward).toBeNull();
    expect(publicBefore.placementMarkers).toHaveLength(1);
    expect(publicBefore.placementMarkers[0]).toMatchObject({ source: 'care-package', shape: 'ground-x', audience: 'all-combatants' });
    runtime.advance(7_100, DEFAULT_WORLD);
    expect(runtime.beginCareCapture('owner', 99, entityId, 7_100, DEFAULT_WORLD)).toMatchObject({ accepted: false, reason: 'identity-mismatch' });
    expect(runtime.beginCareCapture('owner', 1, entityId, 7_100, DEFAULT_WORLD).accepted).toBe(true);
    const owner = runtime.snapshotFor('owner', 7_100);
    expect(owner.entities.some((entity) => entity.id === entityId)).toBe(false);
    expect(owner.actors[0].revealedCareRewards).toHaveLength(1);
    expect(runtime.snapshotFor('other', 7_100).actors[0].revealedCareRewards).toEqual([]);
  });

  it('requires continuous care capture through release, damage, range, LOS, death and exactly-once completion', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('thief', 1, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    const thiefWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [
        ...DEFAULT_WORLD.targets,
        { id: 'thief', kind: 'player', team: 1, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      ],
    };
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, DEFAULT_WORLD).entityIds[0];
    runtime.advance(7_100, DEFAULT_WORLD);

    expect(runtime.beginCareCapture('thief', 1, entityId, 7_100, thiefWorld).accepted).toBe(true);
    expect(runtime.interruptCareCapture('thief', 99)).toBe(false);
    expect(runtime.interruptCareCapture('thief', 1)).toBe(true);
    expect(runtime.advance(9_000, DEFAULT_WORLD).damageEvents).toEqual([]);
    expect(runtime.snapshotFor('thief', 9_000).entities)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: entityId, phase: 'landed', captureProgress: null })]));
    expect(runtime.snapshotFor('thief', 9_000).actors.find((actor) => actor.actorId === 'thief')?.revealedCareRewards).toEqual([]);

    expect(runtime.beginCareCapture('thief', 1, entityId, 9_000, thiefWorld).accepted).toBe(true);
    expect(runtime.recordActorDamage('thief')).toBe(true);
    expect(runtime.recordActorDamage('thief')).toBe(false);
    expect(runtime.snapshotFor('thief', 9_001).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    expect(runtime.beginCareCapture('thief', 1, entityId, 9_100, thiefWorld).accepted).toBe(true);
    const beforeRangeRevision = runtime.snapshotFor('thief', 9_100).revision;
    const outOfRangeWorld: KillstreakWorld = {
      ...thiefWorld,
      targets: thiefWorld.targets.map((target) => target.id === 'thief'
        ? { ...target, position: [20, 1.7, 20] }
        : target),
    };
    runtime.advance(9_200, outOfRangeWorld);
    expect(runtime.snapshotFor('thief', 9_200)).toMatchObject({
      revision: expect.any(Number),
      entities: [expect.objectContaining({ phase: 'landed', captureProgress: null })],
    });
    expect(runtime.snapshotFor('thief', 9_200).revision).toBeGreaterThan(beforeRangeRevision);

    expect(runtime.beginCareCapture('thief', 1, entityId, 9_300, thiefWorld).accepted).toBe(true);
    runtime.advance(9_400, { ...thiefWorld, hasLineOfSight: () => false });
    expect(runtime.snapshotFor('thief', 9_400).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    expect(runtime.beginCareCapture('thief', 1, entityId, 9_500, thiefWorld).accepted).toBe(true);
    runtime.recordActorDeath('thief', 2);
    expect(runtime.snapshotFor('thief', 9_501).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    const thiefLifeTwoWorld: KillstreakWorld = {
      ...thiefWorld,
      targets: thiefWorld.targets.map((target) => target.id === 'thief' ? { ...target, lifeId: 2 } : target),
    };
    expect(runtime.beginCareCapture('thief', 2, entityId, 9_600, thiefLifeTwoWorld).accepted).toBe(true);
    runtime.advance(12_099, thiefLifeTwoWorld);
    expect(runtime.snapshotFor('thief', 12_099).actors.find((actor) => actor.actorId === 'thief')?.revealedCareRewards).toEqual([]);
    runtime.advance(12_100, thiefLifeTwoWorld);
    expect(runtime.snapshotFor('thief', 12_100).actors.find((actor) => actor.actorId === 'thief')?.revealedCareRewards).toHaveLength(1);
    runtime.advance(20_000, thiefLifeTwoWorld);
    expect(runtime.snapshotFor('thief', 20_000).actors.find((actor) => actor.actorId === 'thief')?.revealedCareRewards).toHaveLength(1);
  });

  it('bounds the private care queue to the recipient protocol and leaves overflow crates claimable', () => {
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [
        ...DEFAULT_WORLD.targets,
        { id: 'collector', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      ],
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('collector', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    let lifeId = 1;
    let now = 1_000;
    for (let index = 0; index < MAX_RETAINED_CARE_REWARDS; index += 1) {
      earn(runtime, 4);
      const crateId = runtime.activate({
        ...intent('care-package', 1, 1, `activation-care-cap-${index}`), lifeId,
      }, now, world).entityIds[0];
      runtime.advance(now + 6_000, world);
      expect(runtime.beginCareCapture('collector', 1, crateId, now + 6_000, world).accepted).toBe(true);
      runtime.advance(now + 7_250, world);
      expect(runtime.snapshotFor('collector', now + 7_250).actors.find((actor) => actor.actorId === 'collector')?.revealedCareRewards)
        .toHaveLength(index + 1);
      lifeId += 1;
      runtime.recordActorDeath('owner', lifeId);
      now += 8_000;
    }

    earn(runtime, 4);
    const overflowCrateId = runtime.activate({
      ...intent('care-package', 1, 1, 'activation-care-cap-overflow'), lifeId,
    }, now, world).entityIds[0];
    runtime.advance(now + 6_000, world);
    expect(runtime.beginCareCapture('collector', 1, overflowCrateId, now + 6_000, world))
      .toEqual({ accepted: false, reason: 'reward-capacity' });
    expect(runtime.snapshotFor('collector', now + 6_000)).toMatchObject({
      entities: expect.arrayContaining([expect.objectContaining({ id: overflowCrateId, phase: 'landed' })]),
      actors: expect.arrayContaining([expect.objectContaining({
        actorId: 'collector', revealedCareRewards: expect.any(Array),
      })]),
    });
    const collector = runtime.snapshotFor('collector', now + 6_000).actors.find((actor) => actor.actorId === 'collector');
    expect(collector?.revealedCareRewards).toHaveLength(MAX_RETAINED_CARE_REWARDS);
  });

  it('admits at most one simultaneous care capture per actor', () => {
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [
        ...DEFAULT_WORLD.targets,
        { id: 'second-owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'collector', kind: 'player', team: 1, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      ],
    };
    const runtime = new HostKillstreakRuntime(7);
    const careLoadout = loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']);
    runtime.registerActor('owner', 0, 1, careLoadout);
    runtime.registerActor('second-owner', 0, 1, careLoadout);
    runtime.registerActor('collector', 1, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    earn(runtime, 4, 'second-owner');
    const firstCrateId = runtime.activate(intent('care-package', 1, 1, 'activation-care-first'), 1_000, world).entityIds[0];
    const secondCrateId = runtime.activate({
      ...intent('care-package', 1, 1, 'activation-care-second'), by: 'second-owner',
    }, 1_000, world).entityIds[0];
    runtime.advance(7_000, world);

    expect(runtime.beginCareCapture('collector', 1, firstCrateId, 7_000, world).accepted).toBe(true);
    expect(runtime.beginCareCapture('collector', 1, secondCrateId, 7_000, world))
      .toEqual({ accepted: false, reason: 'actor-already-capturing' });
  });

  it('interrupts care capture on disconnect without revealing or consuming its reward', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('thief', 1, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    const thiefWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [...DEFAULT_WORLD.targets, { id: 'thief', kind: 'player', team: 1, lifeId: 1, alive: true, position: [0, 1.7, 0] }],
    };
    earn(runtime, 4);
    const crateId = runtime.activate(intent('care-package', 1), 1_000, DEFAULT_WORLD).entityIds[0];
    runtime.advance(7_000, DEFAULT_WORLD);
    expect(runtime.beginCareCapture('thief', 1, crateId, 7_000, thiefWorld).accepted).toBe(true);

    runtime.recordActorDisconnect('thief');
    expect(runtime.snapshotFor('thief', 7_500)).toMatchObject({
      entities: expect.arrayContaining([expect.objectContaining({ id: crateId, phase: 'landed', captureProgress: null })]),
      actors: expect.arrayContaining([expect.objectContaining({ actorId: 'thief', revealedCareRewards: [] })]),
    });
    runtime.advance(9_000, thiefWorld);
    expect(runtime.snapshotFor('thief', 9_000).actors.find((actor) => actor.actorId === 'thief')?.revealedCareRewards).toEqual([]);
    expect(runtime.beginCareCapture('owner', 1, crateId, 9_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.snapshotFor('owner', 9_000).actors.find((actor) => actor.actorId === 'owner')?.revealedCareRewards).toHaveLength(1);
  });

  it('advances aggregate revisions with moving support and never rewinds on a regressed host clock', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 8);
    runtime.activate(intent('chopper', 3), 1_000, DEFAULT_WORLD);
    const activated = runtime.snapshotFor('owner', 1_000);
    runtime.advance(2_000, DEFAULT_WORLD);
    const advanced = runtime.snapshotFor('owner', 2_000);
    expect(advanced.revision).toBeGreaterThan(activated.revision);
    expect(advanced.entities[0].revision).toBeGreaterThan(activated.entities[0].revision);

    runtime.advance(1_500, DEFAULT_WORLD);
    const regressedClock = runtime.snapshotFor('owner', 2_000);
    expect(regressedClock.revision).toBe(advanced.revision);
    expect(regressedClock.entities[0].position).toEqual(advanced.entities[0].position);
    expect(regressedClock.entities[0].attitude).toEqual(advanced.entities[0].attitude);

    const beforeInvalid = regressedClock.revision;
    expect(runtime.advance(Number.NaN, DEFAULT_WORLD)).toEqual({
      damageEvents: [], shotEvents: [], impactEvents: [], expiredEntityIds: [],
      // HF-334: host killstreak result object includes careWeaponGrantEvents
      // (care-package weapon grants, e.g. the 10% flamethrower reward).
      careWeaponGrantEvents: [],
      // HF-458: and taserStunEvents (Piloted Drone taser hits).
      taserStunEvents: [],
    });
    expect(runtime.snapshotFor('owner', 2_000).revision).toBe(beforeInvalid);
  });

  it('produces identical host snapshots and exactly-once damage IDs for identical seed/time', () => {
    const run = () => {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
      earn(runtime, 8);
      runtime.activate(intent('chopper', 3, 1, 'activation-replication'), 1_000, DEFAULT_WORLD);
      const first = runtime.advance(2_000, DEFAULT_WORLD);
      const repeat = runtime.advance(2_000, DEFAULT_WORLD);
      return { snapshot: runtime.snapshotFor('owner', 2_000), first, repeat };
    };
    const left = run();
    const right = run();
    expect(left.snapshot).toEqual(right.snapshot);
    expect(left.first).toEqual(right.first);
    expect(left.first.damageEvents).toHaveLength(1);
    expect(left.repeat.damageEvents).toHaveLength(0);
    expect(left.first.damageEvents[0].resultId).toMatch(/^ks-result-7-1$/);
  });
});

describe('FFA care-crate capture hostility (mode-aware, not raw team)', () => {
  /**
   * In FFA the lobby still assigns everyone a team number, and players who
   * never touch the team select all carry the same one. Capture friendliness
   * used raw team equality, so in FFA any other player could TAP-STEAL a crate
   * at the owner tier instead of fighting through the 2.5 s enemy hold. The
   * decision now defers to world.areHostile - the same authority every
   * targeting path uses - and is recorded once at capture start so the step
   * and the rendered progress agree.
   */
  const ffaWorld: KillstreakWorld = {
    ...DEFAULT_WORLD,
    targets: [
      ...DEFAULT_WORLD.targets,
      // Standing at the drop point so capture admission (range + LOS) passes.
      { id: 'rival', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      { id: 'mate', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
    ],
    // FFA: everyone is hostile to everyone but themselves, whatever their team.
    areHostile: (ownerId, _ownerTeam, target) => target.id !== ownerId,
  };

  it('keeps the owner tap pickup for the owner themselves', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, ffaWorld).entityIds[0];
    runtime.advance(7_100, ffaWorld);
    expect(runtime.beginCareCapture('owner', 1, entityId, 7_100, ffaWorld).accepted).toBe(true);
    // Owner capture is a tap: the crate is gone immediately.
    expect(runtime.snapshotFor('owner', 7_100).entities.some((entity) => entity.id === entityId)).toBe(false);
  });

  it('forces the 2.5 s enemy hold on a same-lobby-team rival in FFA', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    // Same lobby team as the owner - hostile anyway, because FFA.
    runtime.registerActor('rival', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, ffaWorld).entityIds[0];
    runtime.advance(7_100, ffaWorld);

    expect(runtime.beginCareCapture('rival', 1, entityId, 7_100, ffaWorld).accepted).toBe(true);
    // NOT a tap: the crate is still present, in the capturing phase.
    expect(runtime.snapshotFor('rival', 7_150).entities.some((entity) => entity.id === entityId)).toBe(true);

    // The friendly 1250 ms mark must NOT complete the theft...
    runtime.advance(7_100 + 1_300, ffaWorld);
    expect(runtime.snapshotFor('rival', 7_100 + 1_300).entities.some((entity) => entity.id === entityId)).toBe(true);

    // ...the enemy 2500 ms mark must.
    runtime.advance(7_100 + 2_600, ffaWorld);
    expect(runtime.snapshotFor('rival', 7_100 + 2_600).entities.some((entity) => entity.id === entityId)).toBe(false);
  });

  it('still grants team-mates the tap tier in TDM (no areHostile regression)', () => {
    const runtime = new HostKillstreakRuntime(7);
    const tdmWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [
        ...DEFAULT_WORLD.targets,
        { id: 'mate', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      ],
      areHostile: (_ownerId, ownerTeam, target) => target.team !== ownerTeam,
    };
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('mate', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, tdmWorld).entityIds[0];
    runtime.advance(7_100, tdmWorld);
    expect(runtime.beginCareCapture('mate', 1, entityId, 7_100, tdmWorld).accepted).toBe(true);
    expect(runtime.snapshotFor('mate', 7_100).entities.some((entity) => entity.id === entityId)).toBe(false);
  });
});

describe('possessed autocannon shell splash (owner 2026-08-30)', () => {
  // "the normal gun previously had splash damage and a good radius so you
  // could actually hit people" - a near-miss must chip, a wide miss must not.
  function pumpFire(enemyOffsetM: number) {
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [{ id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] }],
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'chopper', 'tri-pass', 'nuke']));
    earn(runtime, 8);
    const entityId = runtime.activate(intent('chopper', 3), 10_000, world).entityIds[0];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 10_001).accepted).toBe(true);
    // Hold fire straight down (pitch clamps at -1.2) and keep the hostile at a
    // fixed offset from the live authoritative burst point while the route
    // moves the aircraft; capture the first admitted chopper damage event.
    let sequence = 2;
    let shotFired = false;
    const chopperDamage: KillstreakDamageEvent[] = [];
    for (let atMs = 10_100; atMs <= 13_000; atMs += 100) {
      runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence: sequence++, entityId, action: 'pilot-control', yawQ: 0, pitchQ: -1.2, fire: true,
      }, atMs - 1);
      const live = runtime.snapshotFor('owner', atMs - 1).entities[0]!;
      const burst = chopperMissileGroundTarget(live.position, live.attitude, 0, -1.2, world);
      const stepWorld: KillstreakWorld = {
        ...world,
        targets: [
          ...world.targets,
          { id: 'enemy', kind: 'player', team: 1, lifeId: 3, alive: true, position: [burst[0] + enemyOffsetM, 1.7, burst[2]] },
        ],
      };
      const result = runtime.advance(atMs, stepWorld);
      if (result.shotEvents.some((event) => event.source === 'chopper')) shotFired = true;
      chopperDamage.push(...result.damageEvents.filter((event) => event.source === 'chopper'));
      if (chopperDamage.length > 0) break;
    }
    return { shotFired, chopperDamage };
  }

  it('bursts a near-miss into splash damage inside the shell radius', () => {
    // 1.2 m beside the burst: outside the 1 m direct-hit capsule, inside the
    // 2.6 m shell radius.
    const { shotFired, chopperDamage } = pumpFire(1.2);
    expect(shotFired).toBe(true);
    expect(chopperDamage.length).toBeGreaterThanOrEqual(1);
    expect(chopperDamage[0]!.targetId).toBe('enemy');
    expect(chopperDamage[0]!.damage).toBeGreaterThanOrEqual(1);
    expect(chopperDamage[0]!.damage).toBeLessThanOrEqual(CHOPPER_GUN_SPLASH_MAX_DAMAGE);
  });

  it('leaves hostiles outside the shell radius untouched on a miss', () => {
    const { shotFired, chopperDamage } = pumpFire(CHOPPER_GUN_SPLASH_RADIUS_M + 2);
    expect(shotFired).toBe(true);
    expect(chopperDamage).toEqual([]);
  });
});

/**
 * HF-404 — "the machien gun dont hit or do damage properly".
 *
 * The first-person controller's yaw is an unbounded accumulator: it is never
 * wrapped, so a gunner who keeps turning ships 7.5, 13.8, 20.1 rad. The aim
 * authority CLAMPED that into [-pi, pi] instead of wrapping it, so the moment
 * the turret swept past a half turn of accumulated yaw the host pinned the aim
 * at the clamp boundary and the damage ray stopped following the crosshair.
 * Yaw is periodic and pitch is not, so yaw wraps and pitch still clamps.
 */
describe('HF-404 possessed aim yaw wraps, never clamps', () => {
  const SWEPT_YAW = 7.5;
  const SAME_HEADING = 7.5 - Math.PI * 2;
  const CLAMP_BOUNDARY_YAW = Math.PI;
  // The authoritative cadence puts the first possessed shell at 1_600.
  const FIRST_SHOT_AT = 1_600;

  function possessedGunner(): Readonly<{
    runtime: HostKillstreakRuntime;
    entityId: string;
    entity: KillstreakEntitySnapshot;
  }> {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 8);
    const entityId = runtime.activate(intent('chopper', 4), 1_000, DEFAULT_WORLD).entityIds[0]!;
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 1_001).accepted).toBe(true);
    runtime.advance(FIRST_SHOT_AT - 1, DEFAULT_WORLD);
    const entity = runtime.snapshotFor('owner', FIRST_SHOT_AT - 1).entities
      .find((candidate) => candidate.kind === 'chopper')!;
    expect(entity).toBeDefined();
    return Object.freeze({ runtime, entityId, entity });
  }

  /** Fires one shell aimed with `commandedYaw` at a hostile placed 20 m down the `expectedYaw` ray. */
  function shellDamage(commandedYaw: number, expectedYaw: number, commandedPitch = -0.2, expectedPitch = commandedPitch) {
    const { runtime, entityId, entity } = possessedGunner();
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, expectedYaw, expectedPitch);
    const victim: KillstreakTarget = {
      id: 'swept-hostile',
      kind: 'player',
      team: 1,
      lifeId: 3,
      alive: true,
      position: [
        ray.origin[0] + ray.direction[0] * 20,
        ray.origin[1] + ray.direction[1] * 20,
        ray.origin[2] + ray.direction[2] * 20,
      ],
    };
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: commandedYaw, pitchQ: commandedPitch, fire: true,
    }, FIRST_SHOT_AT - 1).accepted).toBe(true);
    const world: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: [DEFAULT_WORLD.targets[0]!, victim],
    };
    return runtime.advance(FIRST_SHOT_AT, world).damageEvents.filter((event) => event.source === 'chopper');
  }

  it('resolves a swept 7.5 rad yaw to exactly the same aim as 7.5 - 2*pi', () => {
    expect(shellDamage(SWEPT_YAW, SAME_HEADING).map((event) => event.targetId)).toEqual(['swept-hostile']);
    // The control-side truth: the wrapped value really is the same heading.
    expect(shellDamage(SAME_HEADING, SAME_HEADING).map((event) => event.targetId)).toEqual(['swept-hostile']);
  });

  it('does not pin a swept yaw at the +pi clamp boundary', () => {
    // This is the regression itself: under the old clamp, 7.5 rad resolved to
    // pi and the shell went here instead of down the crosshair.
    expect(shellDamage(SWEPT_YAW, CLAMP_BOUNDARY_YAW)).toEqual([]);
  });

  it('keeps wrapping past a full turn in both directions', () => {
    expect(shellDamage(SAME_HEADING + Math.PI * 4, SAME_HEADING).map((event) => event.targetId))
      .toEqual(['swept-hostile']);
    expect(shellDamage(SAME_HEADING - Math.PI * 6, SAME_HEADING).map((event) => event.targetId))
      .toEqual(['swept-hostile']);
  });

  it('still clamps pitch, because the elevation limit is a real mechanical stop', () => {
    // Commanding 3 rad of elevation must resolve to the authored 0.5 ceiling,
    // not wrap round to a downward heading.
    expect(shellDamage(SAME_HEADING, SAME_HEADING, 3, 0.5).map((event) => event.targetId))
      .toEqual(['swept-hostile']);
  });
});
