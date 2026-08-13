import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  CHOPPER_GUN_PROFILE,
  CHOPPER_GUNNER_RAY_POLICY,
  CHOPPER_GUNNER_SPLASH_POLICY,
} from './killstreak-support-catalog';
import {
  HostKillstreakRuntime,
  chopperGunnerAuthoritativeRay,
  type ChopperGunnerAuthoritativeRay,
  type KillstreakEntitySnapshot,
  type KillstreakTarget,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';

const LOADOUT = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
});
const BOUNDS = Object.freeze({ minX: -80, maxX: 80, minZ: -80, maxZ: 80, floorY: 0, ceilingY: 48 });

function vecClose(actual: SupportVec3, expected: readonly number[], precision = 8): void {
  expect(actual[0]).toBeCloseTo(expected[0]!, precision);
  expect(actual[1]).toBeCloseTo(expected[1]!, precision);
  expect(actual[2]).toBeCloseTo(expected[2]!, precision);
}

function pointAlong(ray: ChopperGunnerAuthoritativeRay, distanceM: number, rightOffsetM = 0): SupportVec3 {
  const right = [Math.cos(Math.atan2(-ray.direction[0], -ray.direction[2])), 0, -Math.sin(Math.atan2(-ray.direction[0], -ray.direction[2]))] as const;
  return Object.freeze([
    ray.origin[0] + ray.direction[0] * distanceM + right[0] * rightOffsetM,
    ray.origin[1] + ray.direction[1] * distanceM,
    ray.origin[2] + ray.direction[2] * distanceM + right[2] * rightOffsetM,
  ] as const);
}

function target(id: string, position: SupportVec3): KillstreakTarget {
  return Object.freeze({ id, kind: 'player', team: 1, lifeId: 3, alive: true, position });
}

function world(
  targets: readonly KillstreakTarget[] = [],
  hasLineOfSight: NonNullable<KillstreakWorld['hasLineOfSight']> = () => true,
): KillstreakWorld {
  return {
    bounds: BOUNDS,
    targets,
    hasLineOfSight,
    isFlightPositionValid: () => true,
  };
}

function activeChopper(runtime: HostKillstreakRuntime, nowMs: number): KillstreakEntitySnapshot {
  const entity = runtime.snapshotFor('owner', nowMs).entities.find((candidate) => candidate.kind === 'chopper');
  if (!entity) throw new Error('expected active chopper');
  return entity;
}

function setupPlayerGunner(): Readonly<{ runtime: HostKillstreakRuntime; entityId: string }> {
  const runtime = new HostKillstreakRuntime(7);
  runtime.registerActor('owner', 0, 1, LOADOUT);
  for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
  const activation = runtime.activate({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
    activationId: 'activation-chopper-ray', expectedId: 'chopper', anchor: [0, 0, 0],
  }, 1_000, world());
  const entityId = activation.entityIds[0]!;
  expect(runtime.control({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1,
    entityId, action: 'toggle-chopper-gunner',
  }, 1_001)).toMatchObject({ accepted: true });
  return Object.freeze({ runtime, entityId });
}

describe('HF-135 authoritative Chopper Gunner fire ray', () => {
  it('matches the authored socket transforms and full camera yaw/pitch limits at moving poses', () => {
    const poses = [
      { position: [0, 18, 0] as const, attitude: [0, 0, 0] as const, yaw: -Math.PI, pitch: -1.2 },
      { position: [12.5, 21.25, -8.75] as const, attitude: [0.12, -1.1, 0.18] as const, yaw: 0.73, pitch: -0.31 },
      { position: [-34, 14, 29] as const, attitude: [-0.12, 2.4, -0.18] as const, yaw: Math.PI, pitch: 0.5 },
    ];
    const cameraLocal = new THREE.Vector3(
      CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[0],
      CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[1],
      CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[2] - CHOPPER_GUNNER_RAY_POLICY.cameraForwardNudgeM,
    );
    const muzzleLocal = new THREE.Vector3(...CHOPPER_GUNNER_RAY_POLICY.muzzleSocketLocalM);
    for (const pose of poses) {
      const rootQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pose.attitude[0], pose.attitude[1], pose.attitude[2], 'YXZ'),
      );
      const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch, pose.yaw, 0, 'YXZ'));
      const ray = chopperGunnerAuthoritativeRay(pose.position, pose.attitude, pose.yaw, pose.pitch);
      vecClose(ray.origin, cameraLocal.clone().applyQuaternion(rootQuaternion).add(new THREE.Vector3(...pose.position)).toArray());
      vecClose(ray.tracerOrigin, muzzleLocal.clone().applyQuaternion(rootQuaternion).add(new THREE.Vector3(...pose.position)).toArray());
      vecClose(ray.direction, new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion).toArray());
      expect(Math.hypot(...ray.direction)).toBeCloseTo(1, 10);
    }
  });

  it('admits near and far impacts plus the exact three-metre splash volume while excluding wider old-cone targets', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    let entity = activeChopper(runtime, 1_599);
    let ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0, -0.2);
    const oldConeTarget = target('off-crosshair', pointAlong(ray, 10, 3.01));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -0.2, fire: true,
    }, 1_599).accepted).toBe(true);
    expect(runtime.advance(1_600, world([oldConeTarget])).damageEvents).toEqual([]);

    runtime.advance(1_879, world());
    entity = activeChopper(runtime, 1_879);
    ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, Math.PI, -1.2);
    const near = target('near-centre', pointAlong(ray, 4));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId,
      action: 'pilot-control', yawQ: Math.PI, pitchQ: -1.2, fire: true,
    }, 1_879).accepted).toBe(true);
    const nearResult = runtime.advance(1_880, world([near]));
    expect(nearResult.damageEvents).toHaveLength(1);
    expect(nearResult.damageEvents[0]).toMatchObject({ targetId: 'near-centre', source: 'chopper' });

    runtime.advance(2_159, world());
    entity = activeChopper(runtime, 2_159);
    ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, -Math.PI / 2, 0.5);
    const far = target('far-centre', pointAlong(ray, 50));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 4, entityId,
      action: 'pilot-control', yawQ: -Math.PI / 2, pitchQ: 0.5, fire: true,
    }, 2_159).accepted).toBe(true);
    const farResult = runtime.advance(2_160, world([far]));
    expect(farResult.damageEvents).toHaveLength(1);
    expect(farResult.damageEvents[0]).toMatchObject({ targetId: 'far-centre', source: 'chopper' });
    expect(farResult.damageEvents[0]!.damage).toBeLessThanOrEqual(CHOPPER_GUN_PROFILE.damage);
    const admittedRay = ray;
    vecClose(farResult.damageEvents[0]!.origin, admittedRay.origin);
    vecClose(farResult.damageEvents[0]!.tracerOrigin, admittedRay.tracerOrigin);
    const endpointDelta = farResult.damageEvents[0]!.endpoint.map((value, axis) => value - admittedRay.origin[axis]) as unknown as SupportVec3;
    const endpointDistance = Math.hypot(...endpointDelta);
    vecClose(endpointDelta, admittedRay.direction.map((value) => value * endpointDistance));
  });

  it('uses camera-origin LOS at cover edges where the aircraft root would be occluded', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    const entity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0.4, -0.35);
    const victim = target('cover-edge', pointAlong(ray, 18));
    const observedOrigins: SupportVec3[] = [];
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0.4, pitchQ: -0.35, fire: true,
    }, 1_599).accepted).toBe(true);
    const result = runtime.advance(1_600, world([victim], (from) => {
      observedOrigins.push(from);
      return Math.hypot(
        from[0] - entity.position[0],
        from[1] - entity.position[1],
        from[2] - entity.position[2],
      ) > 0.5;
    }));
    expect(result.damageEvents).toHaveLength(1);
    expect(observedOrigins).toHaveLength(1);
    vecClose(observedOrigins[0]!, result.damageEvents[0]!.origin);
    expect(Math.hypot(
      result.damageEvents[0]!.origin[0] - activeChopper(runtime, 1_600).position[0],
      result.damageEvents[0]!.origin[1] - activeChopper(runtime, 1_600).position[1],
      result.damageEvents[0]!.origin[2] - activeChopper(runtime, 1_600).position[2],
    )).toBeGreaterThan(0.5);
  });

  it('resolves an accepted player shot from its snapshot camera before a low-FPS flight step', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    const firingEntity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(firingEntity.position, firingEntity.attitude, 2.7, -0.55);
    const movingFrameTarget = target('low-fps-centre', pointAlong(ray, 34));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 2.7, pitchQ: -0.55, fire: true,
    }, 1_599).accepted).toBe(true);
    const result = runtime.advance(1_719, world([movingFrameTarget]));
    expect(result.damageEvents).toHaveLength(1);
    expect(result.damageEvents[0]).toMatchObject({ targetId: 'low-fps-centre', source: 'chopper' });
    vecClose(result.damageEvents[0]!.origin, ray.origin);
    expect(Math.hypot(
      activeChopper(runtime, 1_719).position[0] - firingEntity.position[0],
      activeChopper(runtime, 1_719).position[1] - firingEntity.position[1],
      activeChopper(runtime, 1_719).position[2] - firingEntity.position[2],
    )).toBeGreaterThan(CHOPPER_GUNNER_RAY_POLICY.targetRadiusM);
  });

  it('switches only player fire to the camera ray and restores unchanged AI root fire on exit', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, LOADOUT);
    for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const aiTarget = target('ai-target', [0, 1.7, 10]);
    const entityId = runtime.activate({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
      activationId: 'activation-chopper-lifecycle', expectedId: 'chopper', anchor: [0, 0, 0],
    }, 1_000, world([aiTarget])).entityIds[0]!;
    const firstAiFiringEntity = activeChopper(runtime, 1_000);
    const firstAi = runtime.advance(1_600, world([aiTarget])).damageEvents[0]!;
    vecClose(firstAi.origin, firstAiFiringEntity.position);
    vecClose(firstAi.tracerOrigin, firstAi.origin);
    vecClose(firstAi.endpoint, firstAi.targetPosition);

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId,
      action: 'toggle-chopper-gunner',
    }, 1_601).accepted).toBe(true);
    runtime.advance(1_879, world());
    const playerEntity = activeChopper(runtime, 1_879);
    const playerRay = chopperGunnerAuthoritativeRay(playerEntity.position, playerEntity.attitude, 0.25, -0.25);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0.25, pitchQ: -0.25, fire: true,
    }, 1_879).accepted).toBe(true);
    const playerEvent = runtime.advance(1_880, world([target('player-target', pointAlong(playerRay, 20))])).damageEvents[0]!;
    expect(playerEvent.targetId).toBe('player-target');
    expect(Math.hypot(
      playerEvent.origin[0] - activeChopper(runtime, 1_880).position[0],
      playerEvent.origin[1] - activeChopper(runtime, 1_880).position[1],
      playerEvent.origin[2] - activeChopper(runtime, 1_880).position[2],
    )).toBeGreaterThan(0.5);

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId,
      action: 'toggle-chopper-gunner',
    }, 1_881).accepted).toBe(true);
    const resumedAiFiringEntity = activeChopper(runtime, 1_881);
    const resumedAi = runtime.advance(2_160, world([aiTarget])).damageEvents[0]!;
    expect(runtime.snapshotFor('owner', 2_160).actors[0]!.possession).toBeNull();
    vecClose(resumedAi.origin, resumedAiFiringEntity.position);
    vecClose(resumedAi.tracerOrigin, resumedAi.origin);
    vecClose(resumedAi.endpoint, resumedAi.targetPosition);
  });

  it('freezes the preceding direct radius and admits one LOS-bounded result per hostile inside exact 3x splash', () => {
    expect(CHOPPER_GUNNER_SPLASH_POLICY.precedingDirectHitRadiusM).toBe(CHOPPER_GUNNER_RAY_POLICY.targetRadiusM);
    expect(CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM).toBe(
      CHOPPER_GUNNER_SPLASH_POLICY.precedingDirectHitRadiusM
      * CHOPPER_GUNNER_SPLASH_POLICY.linearRadiusMultiplier,
    );
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    const entity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0, -0.2);
    const primary = target('primary', pointAlong(ray, 20, 0.6));
    const splash = target('splash', pointAlong(ray, 20, 2.75));
    const covered = target('covered', pointAlong(ray, 20, -2.5));
    const outside = target('outside', pointAlong(ray, 20, 3.01));
    const friendly = Object.freeze({ ...target('friendly', pointAlong(ray, 20, 2)), team: 0 as const });
    const owner = Object.freeze({ ...target('owner', pointAlong(ray, 20, 1)), team: 0 as const });
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -0.2, fire: true,
    }, 1_599).accepted).toBe(true);
    const result = runtime.advance(1_600, world(
      [primary, splash, covered, outside, friendly, owner],
      (_from, to) => to !== covered.position,
    ));
    expect(result.damageEvents.map((event) => event.targetId)).toEqual(['primary', 'splash']);
    expect(new Set(result.damageEvents.map((event) => event.targetId)).size).toBe(result.damageEvents.length);
    expect(result.damageEvents[0]!.damage).toBeGreaterThan(result.damageEvents[1]!.damage);
    expect(result.damageEvents.every((event) => event.endpoint.every((value, axis) => value === result.damageEvents[0]!.endpoint[axis]))).toBe(true);
  });

  it('rejects a centred primary and every nearby splash target when hard cover blocks the admitted impact', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    const entity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0, -0.2);
    const coveredPrimary = target('covered-primary', pointAlong(ray, 20));
    const coveredSplash = target('covered-splash', pointAlong(ray, 20, 2.75));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -0.2, fire: true,
    }, 1_599).accepted).toBe(true);
    const result = runtime.advance(1_600, world([coveredPrimary, coveredSplash], () => false));
    expect(result.damageEvents).toEqual([]);
  });

  it('rejects guest control and preserves one unique result per target at the unchanged 280 ms cadence', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.registerActor('guest', 1, 1, LOADOUT);
    expect(runtime.control({
      by: 'guest', matchEpoch: 7, lifeId: 1, sequence: 1, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -0.2, fire: true,
    }, 1_500)).toMatchObject({ accepted: false, reason: 'entity-unavailable' });

    runtime.advance(1_599, world());
    const entity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0, -0.2);
    const primary = target('cadence-primary', pointAlong(ray, 20, 0.6));
    const splash = target('cadence-splash', pointAlong(ray, 20, 2.75));
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -0.2, fire: true,
    }, 1_599).accepted).toBe(true);
    const first = runtime.advance(1_600, world([primary, splash])).damageEvents;
    expect(first.map((event) => event.targetId)).toEqual(['cadence-primary', 'cadence-splash']);
    expect(new Set(first.map((event) => event.resultId)).size).toBe(2);
    expect(runtime.advance(1_879, world([primary, splash])).damageEvents).toEqual([]);
    const second = runtime.advance(1_880, world([primary, splash])).damageEvents;
    expect(second.map((event) => event.targetId)).toEqual(['cadence-primary', 'cadence-splash']);
    expect(new Set(second.map((event) => event.resultId)).size).toBe(2);
    expect(second[0]!.atMs - first[0]!.atMs).toBe(CHOPPER_GUN_PROFILE.cadenceMs);
    expect(second.every((event) => !first.some((prior) => prior.resultId === event.resultId))).toBe(true);
  });

  it('is a strict far-range superset of the preceding one-metre direct capsule', () => {
    const { runtime, entityId } = setupPlayerGunner();
    runtime.advance(1_599, world());
    const entity = activeChopper(runtime, 1_599);
    const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, 0, 0);
    const precedingFarEdge = target(
      'preceding-far-edge',
      pointAlong(ray, CHOPPER_GUN_PROFILE.maximumRangeM + 0.99, 0),
    );
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: 0, fire: true,
    }, 1_599).accepted).toBe(true);
    expect(runtime.advance(1_600, world([precedingFarEdge])).damageEvents)
      .toEqual([expect.objectContaining({ targetId: 'preceding-far-edge' })]);

    runtime.advance(1_879, world());
    const laterEntity = activeChopper(runtime, 1_879);
    const laterRay = chopperGunnerAuthoritativeRay(laterEntity.position, laterEntity.attitude, 0, 0);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: 0, fire: true,
    }, 1_879).accepted).toBe(true);
    const beyondNewEnvelope = target(
      'beyond-new-envelope',
      pointAlong(laterRay, CHOPPER_GUN_PROFILE.maximumRangeM + CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM + 0.01, 0),
    );
    expect(runtime.advance(1_880, world([beyondNewEnvelope])).damageEvents).toEqual([]);
  });
});
