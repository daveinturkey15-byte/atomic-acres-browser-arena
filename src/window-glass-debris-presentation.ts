import * as THREE from 'three';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT = 'irregular-independent-radial-shards-v2';
export const WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT = 24;
export const WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M = 0.04;
export const WINDOW_GLASS_DEBRIS_POSE_GRACE_MS = 180;
export const WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS = 450;
export const WINDOW_GLASS_DEBRIS_MIN_PROGRESS_M = 0.025;
export const WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS = 1_800;
export const WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS = 4_500;
export const WINDOW_GLASS_DEBRIS_FALLBACK_MAX_STEP_SECONDS = 0.05;
const WINDOW_GLASS_DEBRIS_FALLBACK_GRAVITY_MPS2 = 9.81;

export type WindowGlassDebrisSettleMode = 'physics-active' | 'settled' | 'presentation-fall';
export type WindowGlassDebrisLifecycleMode = WindowGlassDebrisSettleMode | 'expired';
export type WindowGlassDebrisLifecycleMilestonePhase = 'initial' | 'moving' | 'settled';

export type WindowGlassDebrisLifecycleSample = Readonly<{
  ageMs: number;
  positionY: number;
  restY: number | null;
  physicsActive: boolean;
  sleeping: boolean;
  receivedPhysicsPose: boolean;
  noProgressMs: number;
  fallbackSettled: boolean;
}>;

/**
 * A Rapier body can report sleeping while it is still supported by the broken
 * window frame. Accepting that as settled leaves the visible shards suspended
 * at sill height forever.
 */
export function windowGlassDebrisSettleMode(
  positionY: number,
  restY: number,
  sleeping: boolean,
): WindowGlassDebrisSettleMode {
  if (![positionY, restY].every(Number.isFinite)) {
    throw new TypeError('window glass debris settling requires finite heights');
  }
  if (!sleeping) return 'physics-active';
  return positionY <= restY + WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M
    ? 'settled'
    : 'presentation-fall';
}

/**
 * A detached pane gets a short dynamic collision phase, then a deterministic
 * presentation fall and cleanup. Awake-but-wedged bodies are not progress and
 * cannot retain an invisible pane-sized collider for the rest of the match.
 */
export function windowGlassDebrisLifecycleMode(
  sample: WindowGlassDebrisLifecycleSample,
): WindowGlassDebrisLifecycleMode {
  if (![sample.ageMs, sample.positionY, sample.noProgressMs].every(Number.isFinite)
    || sample.restY !== null && !Number.isFinite(sample.restY)) {
    throw new TypeError('window glass debris lifecycle requires finite samples');
  }
  if (sample.ageMs >= WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS) return 'expired';
  if (sample.fallbackSettled) return 'settled';
  if (!sample.physicsActive) return 'presentation-fall';
  if (!sample.receivedPhysicsPose && sample.ageMs < WINDOW_GLASS_DEBRIS_POSE_GRACE_MS) {
    return 'physics-active';
  }
  if (!sample.receivedPhysicsPose
    || sample.ageMs >= WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS
    || sample.noProgressMs >= WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS) {
    return 'presentation-fall';
  }
  if (sample.restY === null) return sample.sleeping ? 'presentation-fall' : 'physics-active';
  return windowGlassDebrisSettleMode(sample.positionY, sample.restY, sample.sleeping);
}

export function windowGlassDebrisMilestoneAdmitted(sample: Readonly<{
  phase: WindowGlassDebrisLifecycleMilestonePhase;
  spawnedAt: number;
  sampledAt: number;
  previous: Readonly<{
    phase: WindowGlassDebrisLifecycleMilestonePhase;
    sampledAt: number;
    physical: boolean;
  }> | null;
  physical: boolean;
  fallbackStartedAt: number | null;
}>): boolean {
  const expected = sample.previous === null
    ? 'initial'
    : sample.previous.phase === 'initial'
      ? 'moving'
      : sample.previous.phase === 'moving'
        ? 'settled'
        : null;
  return sample.phase === expected
    && Number.isFinite(sample.spawnedAt)
    && Number.isFinite(sample.sampledAt)
    && sample.sampledAt >= sample.spawnedAt
    && sample.sampledAt < sample.spawnedAt + WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS
    && (sample.previous === null || sample.sampledAt >= sample.previous.sampledAt)
    && (sample.phase === 'initial'
      ? sample.physical
      : sample.phase === 'moving'
        ? sample.physical
          || sample.fallbackStartedAt !== null && sample.sampledAt >= sample.fallbackStartedAt
        : !sample.physical && (sample.fallbackStartedAt === null
          ? sample.previous?.physical === true
          : sample.sampledAt >= sample.fallbackStartedAt));
}

export type WindowGlassDebrisFallbackVector = Readonly<{ x: number; y: number; z: number }>;

export type WindowGlassDebrisFallbackState = Readonly<{
  position: WindowGlassDebrisFallbackVector;
  velocity: WindowGlassDebrisFallbackVector;
  rotation: WindowGlassDebrisFallbackVector;
  angular: WindowGlassDebrisFallbackVector;
}>;

export type WindowGlassDebrisFallbackSweep = Readonly<{
  restY: number | null;
  source: string | null;
  impactFraction: number | null;
}>;

export type WindowGlassDebrisFallbackSupportCandidate = Readonly<{
  source: string;
  collider: Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }>;
}>;

export type WindowGlassDebrisFallbackMotionSample = Readonly<{
  elapsedSeconds: number;
  state: WindowGlassDebrisFallbackState;
}>;

export type WindowGlassDebrisFallbackResult = Readonly<{
  elapsedSeconds: number;
  state: WindowGlassDebrisFallbackState;
  moving: WindowGlassDebrisFallbackMotionSample | null;
  settled: boolean;
  settledAfterSeconds: number | null;
  support: Readonly<{ restY: number | null; source: string | null }>;
}>;

export type WindowGlassDebrisFallbackInterval = Readonly<{
  policyStartAt: number;
  stateStartAt: number;
  captureStartAt: number;
  endAt: number;
}>;

/**
 * Freezes the Three.js presentation bridge into the pure fallback contract.
 * Euler metadata is enumerable, so spreading or validating a live Euler would
 * leak non-numeric fields such as `isEuler` and `_order` into the integrator.
 */
function snapshotWindowGlassDebrisFallbackVector(
  vector: WindowGlassDebrisFallbackVector,
): WindowGlassDebrisFallbackVector {
  const snapshot = Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
  if (!Object.values(snapshot).every(Number.isFinite)) {
    throw new TypeError('window glass debris fallback snapshot requires finite motion');
  }
  return snapshot;
}

export function snapshotWindowGlassDebrisFallbackState(
  state: WindowGlassDebrisFallbackState,
): WindowGlassDebrisFallbackState {
  return Object.freeze({
    position: snapshotWindowGlassDebrisFallbackVector(state.position),
    velocity: snapshotWindowGlassDebrisFallbackVector(state.velocity),
    rotation: snapshotWindowGlassDebrisFallbackVector(state.rotation),
    angular: snapshotWindowGlassDebrisFallbackVector(state.angular),
  });
}

/**
 * Derives the fallback interval from retained lifecycle timestamps, not from
 * the callback that happens to notice the boundary. The end remains the hard
 * retirement instant even when one sparse outer callback arrives later.
 */
export function windowGlassDebrisFallbackInterval(sample: Readonly<{
  spawnedAt: number;
  now: number;
  physicsActive: boolean;
  receivedPhysicsPose: boolean;
  stateIncludesPhysicsPose: boolean;
  firstPhysicsPoseAt?: number | null;
  stateObservedAt: number;
  lastProgressAt: number;
  fallbackStartedAt: number | null;
  forcedFallbackAt?: number | null;
}>): WindowGlassDebrisFallbackInterval | null {
  const values = [
    sample.spawnedAt,
    sample.now,
    sample.lastProgressAt,
    sample.firstPhysicsPoseAt ?? null,
    sample.stateObservedAt,
    sample.fallbackStartedAt,
    sample.forcedFallbackAt ?? null,
  ].filter((value): value is number => value !== null);
  if (!values.every(Number.isFinite)
    || sample.now < sample.spawnedAt
    || sample.lastProgressAt < sample.spawnedAt
    || sample.lastProgressAt > sample.now
    || sample.stateObservedAt < sample.spawnedAt
    || sample.stateObservedAt > sample.now
    || sample.lastProgressAt > sample.stateObservedAt
    || sample.stateIncludesPhysicsPose && (!sample.receivedPhysicsPose
      || sample.firstPhysicsPoseAt === undefined
      || sample.firstPhysicsPoseAt === null
      || sample.firstPhysicsPoseAt > sample.stateObservedAt)
    || sample.firstPhysicsPoseAt !== undefined && sample.firstPhysicsPoseAt !== null
      && (sample.firstPhysicsPoseAt < sample.spawnedAt || sample.firstPhysicsPoseAt > sample.now)
    || sample.fallbackStartedAt !== null
      && (sample.fallbackStartedAt < sample.spawnedAt || sample.fallbackStartedAt > sample.now)
    || sample.forcedFallbackAt !== undefined && sample.forcedFallbackAt !== null
      && (sample.forcedFallbackAt < sample.spawnedAt || sample.forcedFallbackAt > sample.now)) {
    throw new TypeError('window glass debris fallback interval requires ordered finite timestamps');
  }
  const policyStart = sample.fallbackStartedAt
    ?? (!sample.physicsActive
      ? sample.spawnedAt
      : !sample.stateIncludesPhysicsPose
        ? sample.spawnedAt + WINDOW_GLASS_DEBRIS_POSE_GRACE_MS
        : Math.min(
            sample.lastProgressAt + WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS,
            sample.spawnedAt + WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS,
            sample.forcedFallbackAt ?? Number.POSITIVE_INFINITY,
          ));
  const endAt = Math.min(sample.now, sample.spawnedAt + WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS);
  if (policyStart > endAt || sample.stateObservedAt > endAt) return null;
  return Object.freeze({
    policyStartAt: policyStart,
    stateStartAt: sample.stateObservedAt,
    captureStartAt: Math.max(policyStart, sample.stateObservedAt),
    endAt,
  });
}

function cloneFallbackState(state: WindowGlassDebrisFallbackState): WindowGlassDebrisFallbackState {
  return snapshotWindowGlassDebrisFallbackState(state);
}

function fallbackMovementReached(
  position: WindowGlassDebrisFallbackVector,
  origin: WindowGlassDebrisFallbackVector | null,
): boolean {
  if (!origin || position.y > origin.y - WINDOW_GLASS_DEBRIS_MIN_PROGRESS_M) return false;
  return Math.hypot(position.x - origin.x, position.y - origin.y, position.z - origin.z)
    >= WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M;
}

/**
 * Finds the highest collision-authoritative support crossed by a bounded
 * downward step. A body already overlapping a surface is admitted only when
 * that surface top lies inside its current vertical extent; this recovers a
 * real penetration without treating tall walls or distant floors as support.
 */
export function windowGlassDebrisFallbackSweepSupport(
  from: WindowGlassDebrisFallbackVector,
  to: WindowGlassDebrisFallbackVector,
  halfExtents: WindowGlassDebrisFallbackVector,
  candidates: readonly WindowGlassDebrisFallbackSupportCandidate[],
): WindowGlassDebrisFallbackSweep {
  const values = [...Object.values(from), ...Object.values(to), ...Object.values(halfExtents)];
  if (!values.every(Number.isFinite)
    || halfExtents.x <= 0
    || halfExtents.y <= 0
    || halfExtents.z <= 0) {
    throw new TypeError('window glass debris fallback support requires finite positive bounds');
  }
  if (to.y > from.y) return Object.freeze({ restY: null, source: null, impactFraction: null });

  const footprintInsetX = Math.min(halfExtents.x * 0.35, 0.18);
  const footprintInsetZ = Math.min(halfExtents.z * 0.35, 0.08);
  const fromBottom = from.y - halfExtents.y;
  const toBottom = to.y - halfExtents.y;
  let supportY: number | null = null;
  let source: string | null = null;
  let impactFraction: number | null = null;

  for (const candidate of candidates) {
    const { collider } = candidate;
    if (!candidate.source
      || !Number.isFinite(collider.minX)
      || !Number.isFinite(collider.maxX)
      || !Number.isFinite(collider.minY)
      || !Number.isFinite(collider.maxY)
      || !Number.isFinite(collider.minZ)
      || !Number.isFinite(collider.maxZ)
      || collider.minX > collider.maxX
      || collider.minY > collider.maxY
      || collider.minZ > collider.maxZ) continue;
    const surfaceY = collider.maxY;
    const overlappingAtStart = surfaceY >= fromBottom
      && surfaceY <= from.y + halfExtents.y;
    const crossedDuringStep = fromBottom > surfaceY && toBottom <= surfaceY;
    if (!overlappingAtStart && !crossedDuringStep) continue;
    const fraction = overlappingAtStart
      ? 0
      : (fromBottom - surfaceY) / (fromBottom - toBottom);
    const impactX = from.x + (to.x - from.x) * fraction;
    const impactZ = from.z + (to.z - from.z) * fraction;
    const overlapsX = impactX + halfExtents.x - footprintInsetX >= collider.minX
      && impactX - halfExtents.x + footprintInsetX <= collider.maxX;
    const overlapsZ = impactZ + halfExtents.z - footprintInsetZ >= collider.minZ
      && impactZ - halfExtents.z + footprintInsetZ <= collider.maxZ;
    if (!overlapsX || !overlapsZ || supportY !== null && surfaceY <= supportY) continue;
    supportY = surfaceY;
    source = candidate.source;
    impactFraction = fraction;
  }

  return Object.freeze({
    restY: supportY === null ? null : supportY + halfExtents.y,
    source,
    impactFraction,
  });
}

/**
 * Advances presentation-owned debris by real elapsed time while retaining a
 * bounded collision step. The caller owns support authority and can therefore
 * reject off-footprint or non-collision surfaces without changing this motion.
 */
export function integrateWindowGlassDebrisFallback(
  initialState: WindowGlassDebrisFallbackState,
  elapsedSeconds: number,
  supportForSweep: (
    from: WindowGlassDebrisFallbackVector,
    to: WindowGlassDebrisFallbackVector,
    stepSeconds: number,
  ) => WindowGlassDebrisFallbackSweep,
  movementOrigin: WindowGlassDebrisFallbackVector | null = null,
): WindowGlassDebrisFallbackResult {
  const values = [
    elapsedSeconds,
    ...Object.values(initialState.position),
    ...Object.values(initialState.velocity),
    ...Object.values(initialState.rotation),
    ...Object.values(initialState.angular),
  ];
  if (!values.every(Number.isFinite)
    || elapsedSeconds < 0
    || elapsedSeconds > WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS / 1_000) {
    throw new TypeError('window glass debris fallback requires finite bounded motion');
  }

  let position = { ...initialState.position };
  let velocity = { ...initialState.velocity };
  let rotation = { ...initialState.rotation };
  let angular = { ...initialState.angular };
  let advancedSeconds = 0;
  let moving: WindowGlassDebrisFallbackMotionSample | null = null;
  let support: Readonly<{ restY: number | null; source: string | null }> = Object.freeze({
    restY: null,
    source: null,
  });
  const captureMoving = () => {
    if (moving || !fallbackMovementReached(position, movementOrigin)) return;
    moving = Object.freeze({
      elapsedSeconds: advancedSeconds,
      state: cloneFallbackState({ position, velocity, rotation, angular }),
    });
  };

  captureMoving();
  while (elapsedSeconds - advancedSeconds > Number.EPSILON) {
    const stepSeconds = Math.min(
      WINDOW_GLASS_DEBRIS_FALLBACK_MAX_STEP_SECONDS,
      elapsedSeconds - advancedSeconds,
    );
    const nextVelocity = {
      x: velocity.x,
      y: velocity.y - WINDOW_GLASS_DEBRIS_FALLBACK_GRAVITY_MPS2 * stepSeconds,
      z: velocity.z,
    };
    const nextPosition = {
      x: position.x + velocity.x * stepSeconds,
      y: position.y + velocity.y * stepSeconds
        - 0.5 * WINDOW_GLASS_DEBRIS_FALLBACK_GRAVITY_MPS2 * stepSeconds * stepSeconds,
      z: position.z + velocity.z * stepSeconds,
    };
    const sweep = supportForSweep(position, nextPosition, stepSeconds);
    const sweepValues = [sweep.restY, sweep.impactFraction]
      .filter((value): value is number => value !== null);
    if (!sweepValues.every(Number.isFinite)
      || (sweep.restY === null) !== (sweep.source === null)
      || (sweep.restY === null) !== (sweep.impactFraction === null)
      || sweep.impactFraction !== null && (sweep.impactFraction < 0 || sweep.impactFraction > 1)) {
      throw new TypeError('window glass debris fallback received an invalid support sweep');
    }

    if (sweep.restY !== null && sweep.source !== null && sweep.impactFraction !== null) {
      const impactSeconds = stepSeconds * sweep.impactFraction;
      position = {
        x: position.x + velocity.x * impactSeconds,
        y: sweep.restY,
        z: position.z + velocity.z * impactSeconds,
      };
      rotation = {
        x: 0,
        y: rotation.y + angular.y * impactSeconds,
        z: 0,
      };
      velocity = { x: 0, y: 0, z: 0 };
      angular = { x: 0, y: 0, z: 0 };
      advancedSeconds += impactSeconds;
      captureMoving();
      support = Object.freeze({ restY: sweep.restY, source: sweep.source });
      const settledState = cloneFallbackState({ position, velocity, rotation, angular });
      return Object.freeze({
        elapsedSeconds: advancedSeconds,
        state: settledState,
        moving,
        settled: true,
        settledAfterSeconds: advancedSeconds,
        support,
      });
    }

    position = nextPosition;
    velocity = nextVelocity;
    rotation = {
      x: rotation.x + angular.x * stepSeconds,
      y: rotation.y + angular.y * stepSeconds,
      z: rotation.z + angular.z * stepSeconds,
    };
    advancedSeconds += stepSeconds;
    captureMoving();
  }

  return Object.freeze({
    elapsedSeconds: advancedSeconds,
    state: cloneFallbackState({ position, velocity, rotation, angular }),
    moving,
    settled: false,
    settledAfterSeconds: null,
    support,
  });
}

type WindowGlassDebrisVisualOptions = Readonly<{
  id: string;
  halfExtents: Readonly<{ x: number; y: number; z: number }>;
  reducedRenderMode: boolean;
}>;

/** Build an irregular radial fracture with a small impact void and visible gaps. */
function buildShardTriangles(): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  const triangles: Array<ReadonlyArray<readonly [number, number]>> = [];
  const outer = Object.freeze([
    [-0.86, -0.82], [-0.28, -0.88], [0.34, -0.84], [0.84, -0.66],
    [0.88, -0.12], [0.82, 0.48], [0.58, 0.86], [0.02, 0.89],
    [-0.5, 0.84], [-0.86, 0.56], [-0.9, 0.02], [-0.84, -0.48],
  ] as const);
  const inner = Object.freeze([
    [-0.16, -0.12], [-0.06, -0.2], [0.1, -0.18], [0.2, -0.08],
    [0.22, 0.06], [0.14, 0.18], [0.01, 0.22], [-0.13, 0.18],
    [-0.22, 0.08], [-0.2, -0.03], [-0.25, -0.09], [-0.28, -0.17],
  ] as const);
  const shrinkTriangle = (points: readonly (readonly [number, number])[]) => {
    const centreX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const centreY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return Object.freeze(points.map(([x, y]) => Object.freeze([
      centreX + (x - centreX) * 0.84,
      centreY + (y - centreY) * 0.84,
    ] as const)));
  };
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    triangles.push(shrinkTriangle([inner[index], outer[index], outer[next]]));
    triangles.push(shrinkTriangle([inner[index], outer[next], inner[next]]));
  }
  return Object.freeze(triangles);
}

const SHARD_TRIANGLES = buildShardTriangles();

function createSharedShardGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'window-debris:shared-unit-triangle';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  geometry.userData.intactPane = false;
  geometry.userData[GPU_SHARED_GEOMETRY_KEY] = 'window-glass-debris';
  return geometry;
}

// Build normals, bounds and edge topology once during module preparation. A
// live glass breach only scales these immutable buffers instead of allocating
// and analysing new geometry on the shot frame.
const sharedShardGeometry = createSharedShardGeometry();

/**
 * Shared shard cluster material: MeshPhysicalMaterial with transmission is
 * expensive to compile on first use, so deployment prewarm submits this exact
 * material before a live break and each break only clones its mutable state.
 */
const sharedShardMaterialTemplate = new THREE.MeshPhysicalMaterial({
  color: 0x8ad9e8,
  emissive: 0x0b3241,
  emissiveIntensity: 0.22,
  roughness: 0.16,
  metalness: 0.04,
  transparent: true,
  opacity: 0.52,
  transmission: 0.18,
  thickness: 0.08,
  clearcoat: 0.8,
  clearcoatRoughness: 0.2,
  side: THREE.DoubleSide,
  depthWrite: true,
});

const sharedShardMaterialReduced = new THREE.MeshPhysicalMaterial({
  color: 0x8ad9e8,
  emissive: 0x0b3241,
  emissiveIntensity: 0.22,
  roughness: 0.16,
  metalness: 0.04,
  transparent: true,
  opacity: 0.52,
  transmission: 0,
  thickness: 0.08,
  clearcoat: 0.8,
  clearcoatRoughness: 0.2,
  side: THREE.DoubleSide,
  depthWrite: true,
});

type ShardMotion = Readonly<{
  base: THREE.Matrix4;
  pivot: THREE.Vector3;
  velocity: THREE.Vector3;
  axis: THREE.Vector3;
  angularSpeed: number;
}>;

const shardMotionByRoot = new WeakMap<THREE.Group, Readonly<{
  mesh: THREE.InstancedMesh;
  shards: readonly ShardMotion[];
}>>();
const shardOffsetScratch = new THREE.Vector3();
const shardRotationScratch = new THREE.Quaternion();
const shardMatrixScratch = new THREE.Matrix4();
const shardTransformScratch = new THREE.Matrix4();
const shardPivotScratch = new THREE.Matrix4();
const shardUnpivotScratch = new THREE.Matrix4();
const shardRotationMatrixScratch = new THREE.Matrix4();

function shardBaseMatrix(
  triangle: ReadonlyArray<readonly [number, number]>,
  halfExtents: Readonly<{ x: number; y: number; z: number }>,
  depth: number,
): THREE.Matrix4 {
  const [a, b, c] = triangle;
  return new THREE.Matrix4().set(
    (b[0] - a[0]) * halfExtents.x, (c[0] - a[0]) * halfExtents.x, 0, a[0] * halfExtents.x,
    (b[1] - a[1]) * halfExtents.y, (c[1] - a[1]) * halfExtents.y, 0, a[1] * halfExtents.y,
    0, 0, Math.max(0.006, halfExtents.z * 0.32), depth,
    0, 0, 0, 1,
  );
}

/**
 * One prewarmed instanced draw carries independently transformed triangular
 * shards. This avoids both the old rectangular grid and per-shard materials.
 */
export function createFracturedWindowDebrisVisual(options: WindowGlassDebrisVisualOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = options.id;
  root.userData.windowGlassDebrisContract = WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT;
  root.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  root.userData.intactPaneMeshCount = 0;
  root.userData.independentShardTransforms = true;
  root.userData.radialFracture = true;

  // Reuse the single prewarmed material instance for every break. Cloning per
  // break creates a new RenderObject whose first draw triggers a WebGPU shader
  // pipeline compile on the shot frame (the reported glass-break freeze).
  const shardMaterial = options.reducedRenderMode ? sharedShardMaterialReduced : sharedShardMaterialTemplate;
  const shards = new THREE.InstancedMesh(sharedShardGeometry, shardMaterial, WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT);
  shards.name = `${options.id}:shard-cluster`;
  shards.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  shards.userData.intactPane = false;
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const motion = SHARD_TRIANGLES.map((triangle, index): ShardMotion => {
    const depth = ((index % 5) - 2) * Math.max(0.004, options.halfExtents.z * 0.08);
    const base = shardBaseMatrix(triangle, options.halfExtents, depth);
    shards.setMatrixAt(index, base);
    const centroid = new THREE.Vector3(
      triangle.reduce((sum, point) => sum + point[0], 0) / 3 * options.halfExtents.x,
      triangle.reduce((sum, point) => sum + point[1], 0) / 3 * options.halfExtents.y,
      depth,
    );
    const radial = centroid.clone().setZ(0).normalize();
    const jitter = ((index * 37) % 11 - 5) * 0.018;
    return Object.freeze({
      base,
      pivot: centroid,
      velocity: radial.multiplyScalar(0.18 + (index % 4) * 0.035).add(new THREE.Vector3(jitter, 0.06 + (index % 3) * 0.025, ((index % 5) - 2) * 0.035)),
      axis: new THREE.Vector3(0.35 + (index % 3) * 0.2, 0.5 + (index % 5) * 0.08, 0.9).normalize(),
      angularSpeed: 0.8 + (index % 7) * 0.21,
    });
  });
  shards.instanceMatrix.needsUpdate = true;
  root.add(shards);
  shardMotionByRoot.set(root, Object.freeze({ mesh: shards, shards: Object.freeze(motion) }));
  return root;
}

/** Spread and rotate every shard independently during the first break beat. */
export function updateFracturedWindowDebrisVisual(root: THREE.Group, ageSeconds: number): boolean {
  const state = shardMotionByRoot.get(root);
  if (!state || !Number.isFinite(ageSeconds)) return false;
  const elapsed = THREE.MathUtils.clamp(ageSeconds, 0, 0.72);
  const eased = 1 - Math.pow(1 - elapsed / 0.72, 3);
  state.shards.forEach((shard, index) => {
    shardOffsetScratch.copy(shard.velocity).multiplyScalar(eased);
    shardOffsetScratch.y -= 0.08 * eased * eased;
    shardRotationScratch.setFromAxisAngle(shard.axis, shard.angularSpeed * eased);
    shardTransformScratch.makeTranslation(shardOffsetScratch.x, shardOffsetScratch.y, shardOffsetScratch.z);
    shardPivotScratch.makeTranslation(shard.pivot.x, shard.pivot.y, shard.pivot.z);
    shardUnpivotScratch.makeTranslation(-shard.pivot.x, -shard.pivot.y, -shard.pivot.z);
    shardRotationMatrixScratch.makeRotationFromQuaternion(shardRotationScratch);
    shardMatrixScratch.copy(shardTransformScratch)
      .multiply(shardPivotScratch)
      .multiply(shardRotationMatrixScratch)
      .multiply(shardUnpivotScratch)
      .multiply(shard.base);
    state.mesh.setMatrixAt(index, shardMatrixScratch);
  });
  state.mesh.instanceMatrix.needsUpdate = true;
  return true;
}

/** Submit the exact glass buffers/material while the deployment surface is up. */
export async function prewarmFracturedWindowDebrisVisual(
  runtime: PresentationPrewarmRuntime,
  camera: THREE.Camera,
  scene: THREE.Scene,
  reducedRenderMode: boolean,
): Promise<void> {
  camera.updateWorldMatrix(true, false);
  const root = createFracturedWindowDebrisVisual({
    id: 'prewarmed-window-debris',
    halfExtents: { x: 0.7, y: 0.6, z: 0.03 },
    reducedRenderMode,
  });
  root.position.copy(camera.getWorldPosition(new THREE.Vector3()))
    .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 4);
  scene.add(root);
  try {
    await runtime.compileAndRender(root, camera, scene);
  } finally {
    root.removeFromParent();
    // The debris visuals now share the single prewarmed material instance, so
    // never dispose it here - live breaks reuse the same pipeline.
    root.clear();
  }
}
