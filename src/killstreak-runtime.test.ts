import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
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
  adrenalineModifiers,
  type KillstreakActivationIntent,
  type KillstreakWorld,
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
    expect(runtime.recordEligibleElimination('owner', 'weapon')).toEqual([]);
    runtime.recordActorDeath('owner', 2);
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({
      lifeId: 2,
      streak: 0,
      available: ['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm'],
    });
    runtime.recordActorDeath('owner', 3);
    expect(runtime.snapshotFor('owner', 0).actors[0]).toMatchObject({
      lifeId: 3,
      streak: 0,
      available: ['adrenaline', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm'],
    });
  });

  it('recycles the streak ladder after all five rewards are earned and spent without dying', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 15);
    expect(runtime.snapshotFor('owner', 0).actors[0].available).toEqual(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']);
    expect(runtime.activate(intent('scout-sweep', 1, 1), 1_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.activate(intent('yardhawk', 2, 2), 1_001, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.activate(intent('tri-pass', 3, 3), 1_002, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.activate(intent('chopper', 4, 4), 1_003, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.activate(intent('nuke', 5, 5), 1_004, DEFAULT_WORLD).accepted).toBe(true);
    const recycled = runtime.snapshotFor('owner', 1_005).actors[0];
    expect(recycled.streak).toBe(0);
    expect(recycled.available).toEqual([]);
    earn(runtime, 2);
    expect(runtime.recordEligibleElimination('owner', 'weapon')).toEqual(['scout-sweep']);
    expect(runtime.snapshotFor('owner', 1_006).actors[0].available).toEqual(['scout-sweep']);
  });

  it('preserves earned rewards across repeated deaths and a transport rejoin while rejecting stale, duplicate, and forged activation claims', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    const registeredRevision = runtime.snapshotFor('owner', 0).revision;
    earn(runtime, 15);
    expect(runtime.snapshotFor('owner', 0).revision).toBe(registeredRevision + 15);
    runtime.recordActorDeath('owner', 2);
    runtime.recordActorDeath('owner', 3);

    // A network disconnect does not unregister the host actor. A reconnecting
    // recipient receives a fresh projection of the same canonical queue.
    const rejoined = runtime.snapshotFor('owner', 5_000).actors[0];
    expect(rejoined).toMatchObject({ lifeId: 3, streak: 0 });
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
      damageEvents: [], impactEvents: [], expiredEntityIds: [],
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

  it('flies exactly 24 targetable 50-HP swarm drones in from behind before spreading to bounded host targets', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(runtime, 15);
    const activation = runtime.activate({ ...intent('drone-swarm', 5), facing: [0, 0, 1] }, 1_000, DEFAULT_WORLD);
    expect(activation.entityIds).toHaveLength(DRONE_SWARM_COUNT);
    const spawned = runtime.snapshotFor('owner', 1_000).entities;
    expect(spawned).toHaveLength(DRONE_SWARM_COUNT);
    expect(spawned.every((entity) => entity.kind === 'drone' && entity.mode === 'swarm' && entity.health === DRONE_HEALTH && entity.magazine === 20 && entity.reserveClips === null)).toBe(true);
    expect(spawned.every((entity) => entity.position[2] < -8)).toBe(true);
    expect(new Set(spawned.map((entity) => `${entity.position[0].toFixed(1)}:${entity.position[1].toFixed(1)}`)).size).toBeGreaterThan(12);
    const attacks = [...runtime.advance(2_000, DEFAULT_WORLD).damageEvents];
    for (let atMs = 2_100; atMs <= 5_000; atMs += 100) attacks.push(...runtime.advance(atMs, DEFAULT_WORLD).damageEvents);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.length).toBeLessThanOrEqual(DRONE_SWARM_COUNT);
    expect(attacks.every((event) => event.targetId === 'enemy' || event.targetId === 'enemy-bot')).toBe(true);
    expect(attacks).toHaveLength(1);
    expect(attacks.every((event) => event.damage > 1 && event.targetLifeId > 0)).toBe(true);
    expect(runtime.advance(1_000 + DRONE_SWARM_DURATION_MS, DEFAULT_WORLD).expiredEntityIds).toHaveLength(DRONE_SWARM_COUNT);
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
        ? { ...target, position: [0, 1.7, -12] as const }
        : target),
    };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('other', 1, 9, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    const entityId = runtime.activate(intent('piloted-drone', 2), 1_000, DEFAULT_WORLD).entityIds[0];
    expect(runtime.snapshotFor('owner', 1_000).entities[0]).toMatchObject({ magazine: 20, reserveClips: 1, mode: 'piloted' });
    expect(runtime.snapshotFor('owner', 1_000).actors[0].possession).toBeNull();
    expect(runtime.advance(1_001, DEFAULT_WORLD).damageEvents[0]).toMatchObject({ source: 'piloted-drone', ownerId: 'owner' });
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
    expect(runtime.advance(1_601, firstPersonForwardWorld).damageEvents).toHaveLength(1);
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
    expect(runtime.snapshotFor('owner', 7_100).entities[0]).toMatchObject({
      captureActorId: 'owner', phase: 'capturing', revealedReward: null,
    });
    runtime.advance(8_349, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 8_349).actors[0].revealedCareRewards).toEqual([]);
    runtime.advance(8_350, DEFAULT_WORLD);
    const owner = runtime.snapshotFor('owner', 8_350);
    expect(owner.entities).toHaveLength(0);
    expect(owner.actors[0].revealedCareRewards).toHaveLength(1);
    expect(runtime.snapshotFor('other', 8_350).actors[0].revealedCareRewards).toEqual([]);
  });

  it('requires continuous care capture through release, damage, range, LOS, death and exactly-once completion', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 4);
    const entityId = runtime.activate(intent('care-package', 1), 1_000, DEFAULT_WORLD).entityIds[0];
    runtime.advance(7_100, DEFAULT_WORLD);

    expect(runtime.beginCareCapture('owner', 1, entityId, 7_100, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.interruptCareCapture('owner', 99)).toBe(false);
    expect(runtime.interruptCareCapture('owner', 1)).toBe(true);
    expect(runtime.advance(9_000, DEFAULT_WORLD).damageEvents).toEqual([]);
    expect(runtime.snapshotFor('owner', 9_000)).toMatchObject({
      entities: [expect.objectContaining({ id: entityId, phase: 'landed', captureProgress: null })],
      actors: [expect.objectContaining({ revealedCareRewards: [] })],
    });

    expect(runtime.beginCareCapture('owner', 1, entityId, 9_000, DEFAULT_WORLD).accepted).toBe(true);
    expect(runtime.recordActorDamage('owner')).toBe(true);
    expect(runtime.recordActorDamage('owner')).toBe(false);
    expect(runtime.snapshotFor('owner', 9_001).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    expect(runtime.beginCareCapture('owner', 1, entityId, 9_100, DEFAULT_WORLD).accepted).toBe(true);
    const beforeRangeRevision = runtime.snapshotFor('owner', 9_100).revision;
    const outOfRangeWorld: KillstreakWorld = {
      ...DEFAULT_WORLD,
      targets: DEFAULT_WORLD.targets.map((target) => target.id === 'owner'
        ? { ...target, position: [20, 1.7, 20] }
        : target),
    };
    runtime.advance(9_200, outOfRangeWorld);
    expect(runtime.snapshotFor('owner', 9_200)).toMatchObject({
      revision: expect.any(Number),
      entities: [expect.objectContaining({ phase: 'landed', captureProgress: null })],
    });
    expect(runtime.snapshotFor('owner', 9_200).revision).toBeGreaterThan(beforeRangeRevision);

    expect(runtime.beginCareCapture('owner', 1, entityId, 9_300, DEFAULT_WORLD).accepted).toBe(true);
    runtime.advance(9_400, { ...DEFAULT_WORLD, hasLineOfSight: () => false });
    expect(runtime.snapshotFor('owner', 9_400).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    expect(runtime.beginCareCapture('owner', 1, entityId, 9_500, DEFAULT_WORLD).accepted).toBe(true);
    runtime.recordActorDeath('owner', 2);
    expect(runtime.snapshotFor('owner', 9_501).entities[0]).toMatchObject({ phase: 'landed', captureProgress: null });

    expect(runtime.beginCareCapture('owner', 2, entityId, 9_600, DEFAULT_WORLD).accepted).toBe(true);
    runtime.advance(10_850, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 10_850).actors[0].revealedCareRewards).toHaveLength(1);
    runtime.advance(20_000, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 20_000).actors[0].revealedCareRewards).toHaveLength(1);
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
        { id: 'collector', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
      ],
    };
    const runtime = new HostKillstreakRuntime(7);
    const careLoadout = loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']);
    runtime.registerActor('owner', 0, 1, careLoadout);
    runtime.registerActor('second-owner', 0, 1, careLoadout);
    runtime.registerActor('collector', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
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
    earn(runtime, 4);
    const crateId = runtime.activate(intent('care-package', 1), 1_000, DEFAULT_WORLD).entityIds[0];
    runtime.advance(7_000, DEFAULT_WORLD);
    expect(runtime.beginCareCapture('owner', 1, crateId, 7_000, DEFAULT_WORLD).accepted).toBe(true);

    runtime.recordActorDisconnect('owner');
    expect(runtime.snapshotFor('owner', 7_500)).toMatchObject({
      entities: expect.arrayContaining([expect.objectContaining({ id: crateId, phase: 'landed', captureProgress: null })]),
      actors: [expect.objectContaining({ actorId: 'owner', revealedCareRewards: [] })],
    });
    runtime.advance(9_000, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 9_000).actors[0].revealedCareRewards).toEqual([]);
    expect(runtime.beginCareCapture('owner', 1, crateId, 9_000, DEFAULT_WORLD).accepted).toBe(true);
    runtime.advance(10_250, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 10_250).actors[0].revealedCareRewards).toHaveLength(1);
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
      damageEvents: [], impactEvents: [], expiredEntityIds: [],
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
