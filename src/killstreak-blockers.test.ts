import { describe, expect, it } from 'vitest';
import { sphereIntersectsBox, type Box2 } from './collision';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { PASS65_FLIGHT_NAVIGATION, resolveSupportFlightStep } from './killstreak-flight-navigation';
import {
  CARE_AIRCRAFT_DURATION_MS,
  CHOPPER_MOTION_VARIANCE,
  DRONE_SWARM_COUNT,
  HostKillstreakRuntime,
  chopperRoutePose,
  type KillstreakActivationIntent,
  type KillstreakWorld,
} from './killstreak-runtime';
import { DRONE_GUN_PROFILE, DRONE_GUN_PROFILE_ID } from './killstreak-support-catalog';

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
  it('uses one byte-identical solid-occluded gun profile for both drone modes', () => {
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
      mode: 'piloted', gunProfileId: DRONE_GUN_PROFILE_ID, magazine: 20, reserveClips: 1,
    });
    expect(swarmEntities).toHaveLength(DRONE_SWARM_COUNT);
    expect(swarmEntities.every((entity) => entity.gunProfileId === pilotEntity.gunProfileId
      && entity.magazine === DRONE_GUN_PROFILE.magazineSize && entity.reserveClips === null)).toBe(true);

    const entityId = pilotEntity.id;
    pilot.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
    }, 1_001);
    expect(pilot.advance(1_001, baseWorld()).damageEvents[0]).toMatchObject({ damage: DRONE_GUN_PROFILE.damage });
    pilot.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 0, verticalQ: 0, fire: true,
    }, 1_200);
    expect(pilot.advance(1_200, baseWorld()).damageEvents).toHaveLength(0);
    expect(pilot.advance(1_001 + DRONE_GUN_PROFILE.cadenceMs, baseWorld()).damageEvents).toHaveLength(1);

    const firstSwarm = swarm.advance(2_000, baseWorld()).damageEvents;
    expect(firstSwarm).toHaveLength(DRONE_SWARM_COUNT);
    expect(firstSwarm.every((event) => event.damage === DRONE_GUN_PROFILE.damage)).toBe(true);
    expect(swarm.advance(2_000 + DRONE_GUN_PROFILE.cadenceMs - 1, baseWorld()).damageEvents).toHaveLength(0);
    expect(swarm.advance(2_000 + DRONE_GUN_PROFILE.cadenceMs, baseWorld()).damageEvents).toHaveLength(DRONE_SWARM_COUNT);
  });

  it('enforces piloted 2x20 ammo and swarm unlimited 20-round reload loops inside their hard lifetimes', () => {
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
    expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ phase: 'reloading', magazine: 0, reserveClips: 1 });
    now += DRONE_GUN_PROFILE.reloadMs;
    pilot.advance(now, baseWorld());
    expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ magazine: 20, reserveClips: 0 });
    firePilotMagazine();
    expect(pilot.snapshotFor('owner', now).actors[0].possession).toBeNull();
    expect(pilot.snapshotFor('owner', now).entities[0]).toMatchObject({ magazine: 0, reserveClips: 0 });

    const swarm = new HostKillstreakRuntime(7);
    swarm.registerActor('owner', 0, 1, swarmLoadout);
    earn(swarm, 15);
    swarm.activate(activation('drone-swarm', 5), 1_000, baseWorld());
    now = 2_000;
    for (let reloadLoop = 0; reloadLoop < 2; reloadLoop += 1) {
      for (let shot = 0; shot < 20; shot += 1) {
        swarm.advance(now, baseWorld());
        now += DRONE_GUN_PROFILE.cadenceMs;
      }
      expect(swarm.snapshotFor('owner', now).entities.every((entity) => entity.magazine === 0 && entity.reserveClips === null)).toBe(true);
      now += DRONE_GUN_PROFILE.reloadMs;
      swarm.advance(now, baseWorld());
      expect(swarm.snapshotFor('owner', now).entities.every((entity) => entity.magazine === 20 && entity.reserveClips === null)).toBe(true);
      now += 1;
    }
    expect(now).toBeLessThan(61_000);
  });

  it('reveals only living hostiles through walls to the pilot while bullets remain solid-occluded', () => {
    const world = baseWorld({
      targets: [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
        { id: 'enemy', kind: 'player', team: 1, lifeId: 2, alive: true, position: [0, 1.7, -12] },
        { id: 'enemy-dead', kind: 'player', team: 1, lifeId: 8, alive: false, position: [0, 1.7, -10] },
        { id: 'friendly', kind: 'player', team: 0, lifeId: 3, alive: true, position: [0, 1.7, -8] },
        { id: 'behind', kind: 'bot', team: 1, lifeId: 4, alive: true, position: [0, 1.7, 8] },
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
      id: 'enemy', kind: 'player', team: 1, lifeId: 2, position: [0, 1.7, -12], relation: 'hostile', throughWall: true,
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
    expect(inFlight.find((entity) => entity.kind === 'aircraft')?.position).not.toEqual(aircraft.position);
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
