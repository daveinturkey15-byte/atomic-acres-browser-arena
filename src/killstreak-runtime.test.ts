import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  ADRENALINE_DAMAGE_MULTIPLIER,
  ADRENALINE_DURATION_MS,
  ADRENALINE_MOVEMENT_MULTIPLIER,
  ADRENALINE_RELOAD_DURATION_MULTIPLIER,
  CARPET_BOMBER_IMPACT_COUNT,
  CHOPPER_DURATION_MS,
  CHOPPER_HEALTH,
  DRONE_HEALTH,
  DRONE_SWARM_COUNT,
  DRONE_SWARM_DURATION_MS,
  HostKillstreakRuntime,
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

  it('derives exactly 20 deterministic in-bounds Carpet Bomber impacts from host seed only', () => {
    const setup = (clientRequestId: string) => {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
      earn(runtime, 7);
      runtime.activate(intent('carpet-bomber', 3, 1, clientRequestId), 1_000, DEFAULT_WORLD);
      return runtime.advance(6_000, DEFAULT_WORLD);
    };
    const first = setup('activation-client-request-a');
    const second = setup('activation-client-request-b');
    expect(first.impactEvents).toHaveLength(CARPET_BOMBER_IMPACT_COUNT);
    expect(first.impactEvents).toEqual(second.impactEvents);
    expect(first.impactEvents.every((impact) => impact.position[0] >= -40 && impact.position[0] <= 40
      && impact.position[2] >= -45 && impact.position[2] <= 45)).toBe(true);
    expect(new Set(first.impactEvents.map((impact) => impact.ordinal)).size).toBe(CARPET_BOMBER_IMPACT_COUNT);
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

  it('creates exactly 12 targetable 50-HP swarm drones with bounded host damage and 60-second expiry', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(runtime, 15);
    const activation = runtime.activate(intent('drone-swarm', 5), 1_000, DEFAULT_WORLD);
    expect(activation.entityIds).toHaveLength(DRONE_SWARM_COUNT);
    const spawned = runtime.snapshotFor('owner', 1_000).entities;
    expect(spawned).toHaveLength(DRONE_SWARM_COUNT);
    expect(spawned.every((entity) => entity.kind === 'drone' && entity.mode === 'swarm' && entity.health === DRONE_HEALTH && entity.magazine === 20 && entity.reserveClips === null)).toBe(true);
    const attacks = runtime.advance(2_000, DEFAULT_WORLD).damageEvents;
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
    expect(runtime.snapshotFor('owner', 7_100).entities[0].revealedReward).toBeNull();
    runtime.advance(8_349, DEFAULT_WORLD);
    expect(runtime.snapshotFor('owner', 8_349).actors[0].revealedCareRewards).toEqual([]);
    runtime.advance(8_350, DEFAULT_WORLD);
    const owner = runtime.snapshotFor('owner', 8_350);
    expect(owner.entities).toHaveLength(0);
    expect(owner.actors[0].revealedCareRewards).toHaveLength(1);
    expect(runtime.snapshotFor('other', 8_350).actors[0].revealedCareRewards).toEqual([]);
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
