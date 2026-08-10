import * as THREE from 'three';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT = 'irregular-independent-radial-shards-v2';
export const WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT = 24;

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
