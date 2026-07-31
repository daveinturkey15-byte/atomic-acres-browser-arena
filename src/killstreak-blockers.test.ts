import { describe, expect, it } from 'vitest';
import { sphereIntersectsBox, type Box2 } from './collision';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { PASS65_FLIGHT_NAVIGATION, resolveSupportFlightStep } from './killstreak-flight-navigation';
import {
  CARE_AIRCRAFT_DURATION_MS,
  CHOPPER_MOTION_VARIANCE,
  DRONE_SWARM_COUNT,
  HostKillstreakRuntime,
  PILOTED_DRONE_RESERVE_CLIPS,
  chopperRoutePose,
  type KillstreakActivationIntent,
  type KillstreakWorld,
} from './killstreak-runtime';
import {
  DRONE_GUN_PROFILE,
  DRONE_SUPPORT_DEFINITIONS,
  DRONE_SWARM_GUN_PROFILE,
  DRONE_SWARM_GUN_PROFILE_ID,
  PILOTED_DRONE_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE_ID,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
} from './killstreak-support-catalog';
import { supportForwardFromYawPitch } from './support-forward-axis';

const bounds = { minX: -40, maxX: 40, minZ: -45, maxZ: 45, floorY: 0, ceilingY: 40 } as const;
const baseWorld = (overrides: Partial<KillstreakWorld> = {}): KillstreakWorld => ({
  bounds,
  targets: [
    { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
    { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, -12] },
  ],
  hasLineOfSight: () => true,
  isFlightPositionValid: () => true,
  ...overrides,
});

const pilotedLoadout = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke'],
});
const swarmLoadout = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm'],
});

function earn(runtime: HostKillstreakRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
}

function activation(expectedId: KillstreakActivationIntent['expectedId'], slot: KillstreakActivationIntent['slot'], sequence = 1): KillstreakActivationIntent {
  return {
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence, slot,
    activationId: `blocker-${expectedId}-${sequence}`,
    expectedId,
    anchor: [0, 0, 0],
  };
}

describe('Pass 65 killstreak blockers', () => {
  it('uses authoritative half-baseline and double-baseline drone variants', () => {
    const pilot = new HostKillstreakRuntime(7);
    pilot.registerActor('owner', 0, 1, pilotedLoadout);
    earn(pilot, 5);
    pilot.activate(activation('piloted-drone', 2), 1_000, baseWorld());

    const swarm = new HostKillstreakRuntime(7);
    swarm.registerActor('owner', 0, 1, swarmLoadout);
    earn(swarm, 15);
    swarm.activate(activation('drone-swarm', 5), 1_000, baseWorld());

    const pilotEntity = pilot.snapshotFor('owner', 1_000).entities[0];
    const swarmEntities = swarm.snapshotFor('owner', 1_000).entities;
    expect(pilotEntity).toMatchObject({
      mode: 'piloted', gunProfileId: PILOTED_DRONE_GUN_PROFILE_ID, magazine: 20, reserveClips: PILOTED_DRONE_RESERVE_CLIPS,
    });
    expect(swarmEntities).toHaveLength(DRONE_SWARM_COUNT);
    expect(swarmEntities.every((entity) => entity.gunProfileId === DRONE_SWARM_GUN_PROFILE_ID
      && entity.magazine === DRONE_GUN_PROFILE.magazineSize && entity.reserveClips === null)).toBe(true);

    const entityId = pilotEntity.id;
    pilot.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
    }, 1_001);
    expect(pilot.advance(1_001, baseWorld()).damageEvents[0]).toMatchObject({ damage: PILOTED_DRONE_GUN_PROFILE.damage });
    pilot.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
    }, 1_200);
    expect(pilot.advance(1_200, baseWorld()).damageEvents).toHaveLength(0);
    expect(pilot.advance(1_001 + DRONE_GUN_PROFILE.cadenceMs, baseWorld()).damageEvents).toHaveLength(1);

    // The formation spends its first two seconds on the authored behind-player
    // ingress path; weapons become eligible only after that choreography ends.
    const firstSwarmAt = 3_001;
    const firstSwarm = swarm.advance(firstSwarmAt, baseWorld()).damageEvents;
    expect(firstSwarm).toHaveLength(1);
    expect(firstSwarm[0].damage).toBeGreaterThan(DRONE_GUN_PROFILE.damage);
    expect(firstSwarm[0].damage).toBeLessThanOrEqual(DRONE_SWARM_GUN_PROFILE.damage);
    expect(swarm.advance(firstSwarmAt + DRONE_SWARM_FIRE_LANE_INTERVAL_MS - 1, baseWorld()).damageEvents).toHaveLength(0);
    expect(swarm.advance(firstSwarmAt + DRONE_SWARM_FIRE_LANE_INTERVAL_MS, baseWorld()).damageEvents).toHaveLength(1);
  });

  it('enforces piloted three-magazine ammo and swarm unlimited 20-round reload loops inside their hard lifetimes', () => {
    const pilot = new HostKillstreakRuntime(7);
    pilot.registerActor('owner', 0, 1, pilotedLoadout);
    earn(pilot, 5);
    const pilotId = pilot.activate(activation('piloted-drone', 2), 1_000, baseWorld()).entityIds[0];
    let sequence = 0;
    let now = 1_001;
    const firePilotMagazine = () => {
      for (let shot = 0; shot < 20; shot += 1) {
        pilot.control({
          by: 'owner', matchEpoch: 7, lifeId: 1, sequence: ++sequence, entityId: pilotId, action: 'pilot-control',
          yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
        }, now);
        pilot.advance(now, baseWorld());
        now += DRONE_GUN_PROFILE.cadenceMs;
      }
    };
    firePilotMagazine();
    expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ phase: 'reloading', magazine: 0, reserveClips: PILOTED_DRONE_RESERVE_CLIPS });
    for (let reserve = PILOTED_DRONE_RESERVE_CLIPS - 1; reserve >= 0; reserve -= 1) {
      now += DRONE_GUN_PROFILE.reloadMs;
      pilot.advance(now, baseWorld());
      expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ magazine: 20, reserveClips: reserve });
      firePilotMagazine();
    }
    expect(pilot.snapshotFor('owner', now).actors[0].possession).toBeNull();
    expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ magazine: 0, reserveClips: 0 });

    const swarm = new HostKillstreakRuntime(7);
    swarm.registerActor('owner', 0, 1, swarmLoadout);
    earn(swarm, 15);
    swarm.activate(activation('drone-swarm', 5), 1_000, baseWorld());
    now = 2_000;
    let admittedSwarmShots = 0;
    // Sample inside the swarm's own catalog lifetime so the assertion follows the
    // authoritative duration instead of a hard-coded window.
    const swarmExpiresAtMs = 1_000 + DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs;
    while (now < swarmExpiresAtMs - DRONE_SWARM_FIRE_LANE_INTERVAL_MS) {
      admittedSwarmShots += swarm.advance(now, baseWorld()).damageEvents.length;
      now += DRONE_SWARM_FIRE_LANE_INTERVAL_MS;
    }
    const swarmSnapshot = swarm.snapshotFor('owner', now).entities;
    expect(admittedSwarmShots).toBeGreaterThan(DRONE_GUN_PROFILE.magazineSize);
    expect(swarmSnapshot.every((entity) => entity.reserveClips === null && entity.magazine !== null
      && entity.magazine >= 0 && entity.magazine <= 20)).toBe(true);
    expect(swarmSnapshot.reduce((spent, entity) => spent + (20 - (entity.magazine ?? 20)), 0)).toBeGreaterThan(0);
  });

  it('reveals only living hostiles through walls to the pilot while bullets remain solid-occluded', () => {
    const world = baseWorld({
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 18, -12] },
        { id: 'enemy-dead', kind: 'player', team: 1, lifeId: 8, alive: false, position: [0, 18, -10] },
        { id: 'friendly', kind: 'player', team: 0, lifeId: 3, alive: true, position: [0, 18, -8] },
        { id: 'behind', kind: 'bot', team: 1, lifeId: 4, alive: true, position: [0, 18, 8] },
      ],
      hasLineOfSight: () => false,
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, pilotedLoadout);
    runtime.registerActor('observer', 0, 5, pilotedLoadout);
    earn(runtime, 5);
    const entityId = runtime.activate(activation('piloted-drone', 2), 1_000, world).entityIds[0];
    runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_000);
    runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
    }, 1_001);
    const result = runtime.advance(1_001, world);
    expect(result.damageEvents).toHaveLength(0);
    expect(runtime.snapshotFor('owner', 1_001).entities[0].magazine).toBe(19);
    expect(runtime.snapshotFor('owner', 1_001).sensorContacts).toEqual([{
      id: 'enemy', kind: 'player', team: 1, lifeId: 2, position: [0, 18, -12], relation: 'hostile', throughWall: true,
    }]);
    expect(runtime.snapshotFor('observer', 1_001).sensorContacts).toEqual([]);
  });

  it('routes choppers and drones through the arena collision resolver instead of bounds-only movement', () => {
    const solids: readonly Box2[] = [
      { minX: -40, maxX: -1, minY: 0, maxY: 9, minZ: -0.3, maxZ: 0.3 },
      { minX: 1, maxX: 40, minY: 0, maxY: 9, minZ: -0.3, maxZ: 0.3 },
    ];
    let resolverCalls = 0;
    const world = baseWorld({
      resolveFlightPosition: (from, desired, radius) => {
        resolverCalls += 1;
        const result = resolveSupportFlightStep({
          definition: PASS65_FLIGHT_NAVIGATION['rustworks-1v1'],
          arenaBounds: { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ },
          solids,
          from: { x: from[0], y: from[1], z: from[2] },
          desired: { x: desired[0], y: desired[1], z: desired[2] },
          radius,
        });
        return [result.position.x, result.position.y, result.position.z];
      },
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, pilotedLoadout);
    earn(runtime, 8);
    const droneId = runtime.activate(activation('piloted-drone', 2), 1_000, world).entityIds[0];
    runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: droneId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 1, verticalQ: 0,
    }, 1_001);
    const initialDronePosition = runtime.snapshotFor('owner', 1_001).entities.find((entity) => entity.id === droneId)!.position;
    let finalDronePosition = initialDronePosition;
    for (let now = 1_001; now <= 4_000; now += 100) {
      runtime.advance(now, world);
      const drone = runtime.snapshotFor('owner', now).entities.find((entity) => entity.id === droneId)!;
      finalDronePosition = drone.position;
      expect(solids.some((solid) => sphereIntersectsBox({ x: drone.position[0], y: drone.position[1], z: drone.position[2] }, 0.35, solid))).toBe(false);
    }
    expect(finalDronePosition).not.toEqual(initialDronePosition);
    runtime.control({ by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: droneId, action: 'exit-piloted-drone' }, 4_001);
    const chopperId = runtime.activate(activation('chopper', 4, 2), 4_100, world).entityIds[0];
    for (let now = 4_100; now <= 6_000; now += 100) {
      runtime.advance(now, world);
      const chopper = runtime.snapshotFor('owner', now).entities.find((entity) => entity.id === chopperId)!;
      expect(solids.some((solid) => sphereIntersectsBox({ x: chopper.position[0], y: chopper.position[1], z: chopper.position[2] }, 1.25, solid))).toBe(false);
    }
    expect(resolverCalls).toBeGreaterThan(20);
  });

  it('creates a host-owned high care flyover aircraft and deterministic descending crate', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, parseKillstreakLoadout({
      schemaVersion: 1, slots: ['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
    }));
    earn(runtime, 4);
    const admitted = runtime.activate(activation('care-package', 1), 1_000, baseWorld());
    expect(admitted.entityIds).toHaveLength(2);
    const initial = runtime.snapshotFor(null, 1_000).entities;
    expect(initial.map((entity) => entity.kind).sort()).toEqual(['aircraft', 'care-crate']);
    expect(initial.every((entity) => entity.position[1] >= 12)).toBe(true);
    const aircraft = initial.find((entity) => entity.kind === 'aircraft')!;
    expect(runtime.damageEntity(aircraft.id, 999)).toMatchObject({ applied: false, destroyed: false });
    runtime.advance(2_000, baseWorld());
    const inFlight = runtime.snapshotFor(null, 2_000).entities;
    const movedAircraft = inFlight.find((entity) => entity.kind === 'aircraft')!;
    expect(movedAircraft.position).not.toEqual(aircraft.position);
    const travel = [movedAircraft.position[0] - aircraft.position[0], movedAircraft.position[2] - aircraft.position[2]];
    const travelLength = Math.hypot(...travel);
    const initialForward = supportForwardFromYawPitch(aircraft.attitude[1], aircraft.attitude[0]);
    const movedForward = supportForwardFromYawPitch(movedAircraft.attitude[1], movedAircraft.attitude[0]);
    const horizontalAlignment = (forward: readonly [number, number, number]) => (
      (forward[0] * travel[0] + forward[2] * travel[1]) / (Math.hypot(forward[0], forward[2]) * travelLength)
    );
    expect(horizontalAlignment(initialForward)).toBeGreaterThan(0.999);
    expect(horizontalAlignment(movedForward)).toBeGreaterThan(0.999);
    expect(inFlight.find((entity) => entity.kind === 'care-crate')?.phase).toBe('descending');
    runtime.advance(1_000 + CARE_AIRCRAFT_DURATION_MS, baseWorld());
    const afterFlyover = runtime.snapshotFor(null, 1_000 + CARE_AIRCRAFT_DURATION_MS).entities;
    expect(afterFlyover.some((entity) => entity.kind === 'aircraft')).toBe(false);
    expect(afterFlyover.find((entity) => entity.kind === 'care-crate')?.phase).toBe('landed');
  });

  it('replicates one seeded chopper attitude/path and structurally isolates gun input from flight', () => {
    const centre = [0, 18, 0] as const;
    const first = chopperRoutePose(1234, 1_000, 8_500, centre, bounds);
    expect(first).toEqual(chopperRoutePose(1234, 1_000, 8_500, centre, bounds));
    expect(first).not.toEqual(chopperRoutePose(9876, 1_000, 8_500, centre, bounds));
    expect(Math.abs(first.attitude[0])).toBeLessThanOrEqual(CHOPPER_MOTION_VARIANCE.maximumPitchRadians);
    expect(Math.abs(first.attitude[2])).toBeLessThanOrEqual(CHOPPER_MOTION_VARIANCE.maximumBankRadians);
    expect(Math.abs(first.position[1] - centre[1])).toBeLessThanOrEqual(CHOPPER_MOTION_VARIANCE.maximumAltitudeOffsetM);

    const setup = () => {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, pilotedLoadout);
      earn(runtime, 8);
      const entityId = runtime.activate(activation('chopper', 4), 1_000, baseWorld()).entityIds[0];
      return { runtime, entityId };
    };
    const ai = setup();
    const gunner = setup();
    gunner.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: gunner.entityId, action: 'toggle-chopper-gunner',
    }, 1_001);
    gunner.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: gunner.entityId, action: 'pilot-control',
      yawQ: 2.8, pitchQ: -0.8, thrustQ: 1, verticalQ: 1, fire: true,
    }, 5_000);
    ai.runtime.advance(5_000, baseWorld());
    gunner.runtime.advance(5_000, baseWorld());
    const aiPose = ai.runtime.snapshotFor('owner', 5_000).entities[0];
    const gunnerPose = gunner.runtime.snapshotFor('owner', 5_000).entities[0];
    expect({ position: gunnerPose.position, velocity: gunnerPose.velocity, attitude: gunnerPose.attitude })
      .toEqual({ position: aiPose.position, velocity: aiPose.velocity, attitude: aiPose.attitude });
    expect(gunnerPose.gunController).toBe('owner-player');
  });
});
