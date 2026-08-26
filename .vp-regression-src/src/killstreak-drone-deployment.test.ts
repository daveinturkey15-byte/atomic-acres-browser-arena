import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { pointInsideBounds, sphereIntersectsBox } from './collision';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { PASS65_FLIGHT_NAVIGATION, resolveSupportFlightStep } from './killstreak-flight-navigation';
import { DRONE_DEPLOYMENT_POLICY } from './killstreak-support-catalog';
import {
  DRONE_SWARM_COUNT,
  HostKillstreakRuntime,
  planDroneCentreSpawns,
  type KillstreakActivationIntent,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';
import { buildArena, type ArenaMap } from './map';
import type { ArenaId } from './map-selection';

const supportMapBounds = Object.freeze([
  Object.freeze({ id: 'atomic-acres', minX: -34, maxX: 34, minZ: -43, maxZ: 43, floorY: 0, ceilingY: 42 }),
  Object.freeze({ id: 'rustworks-1v1', minX: -27, maxX: 27, minZ: -29, maxZ: 29, floorY: 0, ceilingY: 42 }),
  Object.freeze({ id: 'skyline-terminal', minX: -35, maxX: 35, minZ: -35, maxZ: 35, floorY: 0, ceilingY: 42 }),
] as const);

function world(bounds: KillstreakWorld['bounds'], targets: KillstreakWorld['targets'] = []): KillstreakWorld {
  return {
    bounds,
    targets,
    hasLineOfSight: () => true,
    resolveFlightPosition: (_from, desired) => desired,
    isFlightPositionValid: (position) => position[0] >= bounds.minX + 0.35 && position[0] <= bounds.maxX - 0.35
      && position[1] >= bounds.floorY + 0.35 && position[1] <= bounds.ceilingY - 0.35
      && position[2] >= bounds.minZ + 0.35 && position[2] <= bounds.maxZ - 0.35,
  };
}

function loadout(slots: readonly [string, string, string, string, string]) {
  return parseKillstreakLoadout({ schemaVersion: 1, slots });
}

function earn(runtime: HostKillstreakRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
}

function intent(
  expectedId: KillstreakActivationIntent['expectedId'],
  slot: KillstreakActivationIntent['slot'],
): KillstreakActivationIntent {
  return {
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot,
    activationId: `activation-${expectedId}-centre`, expectedId,
    anchor: [999, 999, -999], facing: [1, 0, 0],
  };
}

function centroid(positions: readonly SupportVec3[]): SupportVec3 {
  return [
    positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
    positions.reduce((sum, position) => sum + position[1], 0) / positions.length,
    positions.reduce((sum, position) => sum + position[2], 0) / positions.length,
  ];
}

function minimumPairDistance(positions: readonly SupportVec3[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      minimum = Math.min(minimum, Math.hypot(
        positions[left]![0] - positions[right]![0],
        positions[left]![1] - positions[right]![1],
        positions[left]![2] - positions[right]![2],
      ));
    }
  }
  return minimum;
}

describe('drone centre-map deployment and movement', () => {
  it('admits the complete centre formation against the real collider/ceiling set on all four arenas', () => {
    const builders: readonly [ArenaId, (scene: THREE.Scene) => ArenaMap][] = [
      ['atomic-acres', buildArena],
      ['rustworks-1v1', buildRustworks1v1],
      ['skyline-terminal', buildSkylineTerminal],
      ['gun-range', buildGunRange],
    ];
    for (const [arenaId, build] of builders) {
      const scene = new THREE.Scene();
      const map = build(scene);
      const navigation = PASS65_FLIGHT_NAVIGATION[arenaId];
      const centrePortal = [...navigation.portals]
        .sort((left, right) => right.altitudeM - left.altitudeM || left.id.localeCompare(right.id))[0]!;
      const bounds = {
        minX: map.bounds.minX, maxX: map.bounds.maxX,
        minZ: map.bounds.minZ, maxZ: map.bounds.maxZ,
        floorY: navigation.floorY, ceilingY: navigation.ceilingY,
      };
      const actualWorld: KillstreakWorld = {
        bounds,
        targets: [],
        resolveFlightPosition: (from, desired, radius) => {
          const result = resolveSupportFlightStep({
            definition: navigation,
            arenaBounds: map.bounds,
            solids: map.colliders,
            from: { x: from[0], y: from[1], z: from[2] },
            desired: { x: desired[0], y: desired[1], z: desired[2] },
            radius,
          });
          return [result.position.x, result.position.y, result.position.z];
        },
        isFlightPositionValid: (position) => {
          const point = { x: position[0], y: position[1], z: position[2] };
          return pointInsideBounds(point, map.bounds, 0.35)
            && !map.colliders.some((solid) => sphereIntersectsBox(point, 0.35, solid));
        },
        supportFlightCentreVolume: {
          centre: [
            (map.bounds.minX + map.bounds.maxX) / 2 + centrePortal.xQ * (map.bounds.maxX - map.bounds.minX) / 2,
            centrePortal.altitudeM,
            (map.bounds.minZ + map.bounds.maxZ) / 2 + centrePortal.zQ * (map.bounds.maxZ - map.bounds.minZ) / 2,
          ],
          halfExtents: [
            Math.min(7.5, (map.bounds.maxX - map.bounds.minX) * 0.12),
            Math.min(2, navigation.ceilingY * 0.05),
            Math.min(7.5, (map.bounds.maxZ - map.bounds.minZ) * 0.12),
          ],
        },
      };
      const plan = planDroneCentreSpawns(actualWorld, DRONE_SWARM_COUNT, 0x65cafe);
      expect(plan.positions, `${arenaId} centre volume`).toHaveLength(DRONE_SWARM_COUNT);
      expect(plan.positions.every((position) => actualWorld.isFlightPositionValid?.(position))).toBe(true);
      expect(minimumPairDistance(plan.positions)).toBeGreaterThanOrEqual(
        DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM - 1e-9,
      );
      scene.clear();
    }
  });

  it('builds one deterministic separated 24-unit centre volume on every support map', () => {
    for (const bounds of supportMapBounds) {
      const supportWorld = world(bounds);
      const first = planDroneCentreSpawns(supportWorld, DRONE_SWARM_COUNT, 0x65cafe);
      const second = planDroneCentreSpawns(supportWorld, DRONE_SWARM_COUNT, 0x65cafe);
      expect(first).toEqual(second);
      expect(first.positions).toHaveLength(DRONE_SWARM_COUNT);
      expect(minimumPairDistance(first.positions)).toBeGreaterThanOrEqual(
        DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM - 1e-9,
      );
      const mapCentreX = (bounds.minX + bounds.maxX) / 2;
      const mapCentreZ = (bounds.minZ + bounds.maxZ) / 2;
      const spreadCentre = centroid(first.positions);
      expect(spreadCentre[0]).toBeCloseTo(mapCentreX, 8);
      expect(spreadCentre[2]).toBeCloseTo(mapCentreZ, 8);
      expect(first.positions.every((position) => supportWorld.isFlightPositionValid?.(position))).toBe(true);
    }
  });

  it('ignores forged caller anchors for both standalone and Swarm deployment', () => {
    const bounds = supportMapBounds[0];
    const supportWorld = world(bounds);
    const pilot = new HostKillstreakRuntime(7);
    pilot.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(pilot, 5);
    expect(pilot.activate(intent('piloted-drone', 2), 1_000, supportWorld).accepted).toBe(true);
    const pilotPosition = pilot.snapshotFor('owner', 1_000).entities[0]!.position;
    expect(pilotPosition[0]).toBeCloseTo((bounds.minX + bounds.maxX) / 2, 8);
    expect(pilotPosition[2]).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2, 8);

    const swarm = new HostKillstreakRuntime(7);
    swarm.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(swarm, 15);
    expect(swarm.activate(intent('drone-swarm', 5), 1_000, supportWorld).accepted).toBe(true);
    const positions = swarm.snapshotFor('owner', 1_000).entities.map((entity) => entity.position);
    expect(centroid(positions)[0]).toBeCloseTo((bounds.minX + bounds.maxX) / 2, 8);
    expect(centroid(positions)[2]).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2, 8);
  });

  it('probes around a blocked centre and retains the reward if no valid volume exists', () => {
    const bounds = supportMapBounds[1];
    const blockedCentre: KillstreakWorld = {
      ...world(bounds),
      isFlightPositionValid: (position) => Math.hypot(position[0], position[2]) > 1.25,
    };
    const recovered = planDroneCentreSpawns(blockedCentre, 1, 1234);
    expect(recovered.positions).toHaveLength(1);
    expect(Math.hypot(recovered.positions[0]![0], recovered.positions[0]![2])).toBeGreaterThan(1.25);

    const impossible: KillstreakWorld = { ...world(bounds), isFlightPositionValid: () => false };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    expect(runtime.activate(intent('piloted-drone', 2), 1_000, impossible)).toMatchObject({
      accepted: false,
      reason: 'no-valid-centre-drone-spawn-volume',
    });
    expect(runtime.snapshotFor('owner', 1_000).actors[0]!.available).toContain('piloted-drone');
    expect(runtime.snapshotFor('owner', 1_000).entities).toEqual([]);
  });

  it('bounds centre admission work even when every probe is rejected', () => {
    const bounds = supportMapBounds[0];
    let validityChecks = 0;
    const blocked: KillstreakWorld = {
      ...world(bounds),
      isFlightPositionValid: () => {
        validityChecks += 1;
        return false;
      },
    };
    expect(planDroneCentreSpawns(blocked, DRONE_SWARM_COUNT, 0x65cafe).positions).toEqual([]);
    expect(validityChecks).toBe(DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit);
    expect(validityChecks).toBeLessThanOrEqual(
      DRONE_SWARM_COUNT * DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit,
    );
  });

  it('moves autonomous standalone flight at exactly twice manual speed and clears transition state', () => {
    const bounds = supportMapBounds[2];
    const targets = [
      { id: 'owner', kind: 'player' as const, team: 0 as const, lifeId: 1, alive: true, position: [0, 1.7, 0] as const },
      { id: 'enemy', kind: 'player' as const, team: 1 as const, lifeId: 2, alive: true, position: [0, 19, 34] as const },
    ];
    const supportWorld = world(bounds, targets);

    const autonomous = new HostKillstreakRuntime(7);
    autonomous.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(autonomous, 5);
    autonomous.activate(intent('piloted-drone', 2), 1_000, supportWorld);
    const autonomousStart = autonomous.snapshotFor('owner', 1_000).entities[0]!.position;
    autonomous.advance(1_000, supportWorld);
    autonomous.advance(1_100, supportWorld);
    const autonomousEnd = autonomous.snapshotFor('owner', 1_100).entities[0]!.position;
    const autonomousDistance = Math.hypot(
      autonomousEnd[0] - autonomousStart[0],
      autonomousEnd[1] - autonomousStart[1],
      autonomousEnd[2] - autonomousStart[2],
    );

    const manual = new HostKillstreakRuntime(7);
    manual.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(manual, 5);
    const droneId = manual.activate(intent('piloted-drone', 2), 1_000, supportWorld).entityIds[0]!;
    expect(manual.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: droneId, action: 'toggle-piloted-drone',
    }, 1_001).accepted).toBe(true);
    expect(manual.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: droneId, action: 'pilot-control',
      yawQ: 0, pitchQ: 0, thrustQ: 1, strafeQ: 0, verticalQ: 0,
    }, 1_002).accepted).toBe(true);
    const manualStart = manual.snapshotFor('owner', 1_002).entities[0]!.position;
    manual.advance(1_002, supportWorld);
    manual.advance(1_102, supportWorld);
    const manualEnd = manual.snapshotFor('owner', 1_102).entities[0]!.position;
    const manualDistance = Math.hypot(
      manualEnd[0] - manualStart[0],
      manualEnd[1] - manualStart[1],
      manualEnd[2] - manualStart[2],
    );
    expect(autonomousDistance).toBeCloseTo(0.6, 8);
    expect(manualDistance).toBeCloseTo(0.3, 8);
    expect(autonomousDistance).toBeCloseTo(manualDistance * 2, 8);

    expect(manual.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId: droneId, action: 'toggle-piloted-drone',
    }, 1_103).accepted).toBe(true);
    const transitioned = manual.snapshotFor('owner', 1_103).entities[0]!;
    expect(transitioned.velocity).toEqual([0, 0, 0]);
    expect(manual.snapshotFor('owner', 1_103).actors[0]!.possession).toBeNull();
  });

  it('moves toward or away from the full pitched aim vector under forward and reverse thrust', () => {
    const bounds = supportMapBounds[2];
    const supportWorld = world(bounds);
    const move = (thrustQ: -1 | 1) => {
      const runtime = new HostKillstreakRuntime(7);
      runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
      earn(runtime, 5);
      const droneId = runtime.activate(intent('piloted-drone', 2), 1_000, supportWorld).entityIds[0]!;
      expect(runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: droneId, action: 'toggle-piloted-drone',
      }, 1_001).accepted).toBe(true);
      expect(runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: droneId, action: 'pilot-control',
        yawQ: 0, pitchQ: Math.PI / 6, thrustQ, strafeQ: 0, verticalQ: 0,
      }, 1_002).accepted).toBe(true);
      const start = runtime.snapshotFor('owner', 1_002).entities[0]!.position;
      runtime.advance(1_002, supportWorld);
      runtime.advance(1_102, supportWorld);
      const end = runtime.snapshotFor('owner', 1_102).entities[0]!.position;
      return [end[0] - start[0], end[1] - start[1], end[2] - start[2]] as const;
    };

    const forward = move(1);
    const reverse = move(-1);
    expect(forward[0]).toBeCloseTo(0, 8);
    expect(forward[1]).toBeCloseTo(0.15, 8);
    expect(forward[2]).toBeCloseTo(-Math.sqrt(3) * 0.15, 8);
    expect(reverse[0]).toBeCloseTo(-forward[0], 8);
    expect(reverse[1]).toBeCloseTo(-forward[1], 8);
    expect(reverse[2]).toBeCloseTo(-forward[2], 8);
  });

  it('keeps autonomous standalone no-target patrol at the canonical 6m/s', () => {
    const bounds = supportMapBounds[2];
    const noTargetWorld = world(bounds, [
      { id: 'owner', kind: 'player' as const, team: 0 as const, lifeId: 1, alive: true, position: [0, 1.7, 0] as const },
    ]);
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'nuke']));
    earn(runtime, 5);
    runtime.activate(intent('piloted-drone', 2), 1_000, noTargetWorld);
    const start = runtime.snapshotFor('owner', 1_000).entities[0]!.position;
    runtime.advance(1_000, noTargetWorld);
    runtime.advance(1_100, noTargetWorld);
    const end = runtime.snapshotFor('owner', 1_100).entities[0]!.position;
    expect(Math.hypot(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    )).toBeCloseTo(0.6, 8);
  });

  it('keeps all 24 Swarm units separated in deterministic clusters while engaging one target', () => {
    const bounds = supportMapBounds[0];
    const target = { id: 'enemy', kind: 'player' as const, team: 1 as const, lifeId: 2, alive: true, position: [0, 1.7, 0] as const };
    const supportWorld = world(bounds, [
      { id: 'owner', kind: 'player' as const, team: 0 as const, lifeId: 1, alive: true, position: [0, 1.7, -20] as const },
      target,
    ]);
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm']));
    earn(runtime, 15);
    expect(runtime.activate(intent('drone-swarm', 5), 1_000, supportWorld).accepted).toBe(true);
    runtime.advance(1_000, supportWorld);
    for (let now = 1_100; now <= 9_000; now += 100) runtime.advance(now, supportWorld);
    const positions = runtime.snapshotFor('owner', 9_000).entities.map((entity) => entity.position);
    expect(positions).toHaveLength(DRONE_SWARM_COUNT);
    expect(new Set(positions.map((position) => position.map((value) => value.toFixed(4)).join(':'))).size)
      .toBe(DRONE_SWARM_COUNT);
    expect(minimumPairDistance(positions)).toBeGreaterThan(1.25);
    const spreadCentre = centroid(positions);
    expect(spreadCentre[0]).toBeCloseTo(target.position[0], 0);
    expect(spreadCentre[2]).toBeCloseTo(target.position[2], 0);
  });

  it('commits Carpet Bomber through the same admitted ground-X lifecycle before its visible aircraft moves', () => {
    const bounds = supportMapBounds[0];
    const groundHeightAt = (x: number, z: number) => 1.25 + x * 0.002 - z * 0.003;
    const supportWorld: KillstreakWorld = { ...world(bounds), groundHeightAt };
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'carpet-bomber', 'chopper', 'nuke']));
    earn(runtime, 7);
    const admission = runtime.activate({
      ...intent('carpet-bomber', 3),
      anchor: [9, 999, -11],
    }, 1_000, supportWorld);
    expect(admission).toMatchObject({ accepted: true, activatedId: 'carpet-bomber' });
    expect(admission.entityIds).toHaveLength(1);
    expect(admission.entityIds[0]).toMatch(/carpet-aircraft/);
    const ownerSnapshot = runtime.snapshotFor('owner', 1_001);
    const observerSnapshot = runtime.snapshotFor('observer', 1_001);
    expect(ownerSnapshot.placementMarkers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'carpet-bomber', shape: 'ground-x', audience: 'all-combatants',
        anchor: [9, groundHeightAt(9, -11), -11],
      }),
      expect.objectContaining({ source: 'carpet-bomber', shape: 'corridor', audience: 'owner-only' }),
    ]));
    expect(observerSnapshot.placementMarkers).toEqual([
      expect.objectContaining({ source: 'carpet-bomber', shape: 'ground-x', audience: 'all-combatants' }),
    ]);
    const aircraftBefore = ownerSnapshot.entities.find((entity) => entity.id === admission.entityIds[0]);
    expect(aircraftBefore).toMatchObject({ kind: 'aircraft', phase: 'inbound' });
    runtime.advance(1_001, supportWorld);
    runtime.advance(1_201, supportWorld);
    const aircraftAfter = runtime.snapshotFor('owner', 1_201).entities.find((entity) => entity.id === admission.entityIds[0]);
    expect(aircraftAfter).toBeDefined();
    expect(aircraftAfter!.position).not.toEqual(aircraftBefore!.position);
    expect(runtime.snapshotFor('owner', 1_201).actors[0]!.available).not.toContain('carpet-bomber');
  });
});
