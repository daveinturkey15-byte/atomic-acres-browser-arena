import * as THREE from 'three';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT = 'fractured-shards-no-intact-pane-v1';
export const WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT = 6;

type WindowGlassDebrisVisualOptions = Readonly<{
  id: string;
  halfExtents: Readonly<{ x: number; y: number; z: number }>;
  reducedRenderMode: boolean;
}>;

const SHARD_TRIANGLES = Object.freeze([
  Object.freeze([[-0.96, 0.90], [-0.20, 0.82], [-0.55, 0.24]]),
  Object.freeze([[-0.08, 0.84], [0.92, 0.75], [0.27, 0.17]]),
  Object.freeze([[-0.88, 0.11], [-0.42, 0.18], [-0.12, -0.34]]),
  Object.freeze([[-0.33, 0.10], [0.24, 0.13], [0.83, -0.27]]),
  Object.freeze([[-0.82, -0.04], [-0.18, -0.42], [-0.63, -0.91]]),
  Object.freeze([[-0.04, -0.39], [0.76, -0.34], [0.93, -0.88]]),
] as const);

function createSharedShardGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  SHARD_TRIANGLES.forEach((triangle, fragmentIndex) => {
    const depthLane = (fragmentIndex % 3) - 1;
    for (const [x, y] of triangle) positions.push(x, y, depthLane);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'window-debris:shared-fractured-shards';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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
const sharedShardEdgesGeometry = new THREE.EdgesGeometry(sharedShardGeometry, 1);
sharedShardEdgesGeometry.name = 'window-debris:shared-fractured-shard-edges';
sharedShardEdgesGeometry.userData[GPU_SHARED_GEOMETRY_KEY] = 'window-glass-debris-edges';

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

const sharedShardEdgesMaterial = new THREE.LineBasicMaterial({ color: 0xbaf5ff, transparent: true, opacity: 0.72, toneMapped: false });

/**
 * One bounded physics body can carry several visibly separated glass shards.
 * The old presentation used a single rectangular box, which read as an intact
 * pane falling out of its frame even though the authority had breached it.
 */
export function createFracturedWindowDebrisVisual(options: WindowGlassDebrisVisualOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = options.id;
  root.userData.windowGlassDebrisContract = WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT;
  root.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  root.userData.intactPaneMeshCount = 0;

  const shardMaterial = (options.reducedRenderMode ? sharedShardMaterialReduced : sharedShardMaterialTemplate).clone();
  const depthScale = Math.max(0.006, options.halfExtents.z * 0.32);
  const shards = new THREE.Mesh(sharedShardGeometry, shardMaterial);
  shards.name = `${options.id}:shard-cluster`;
  shards.scale.set(options.halfExtents.x, options.halfExtents.y, depthScale);
  shards.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  shards.userData.intactPane = false;

  const edges = new THREE.LineSegments(sharedShardEdgesGeometry, sharedShardEdgesMaterial);
  edges.name = `${options.id}:shard-edges`;
  edges.scale.copy(shards.scale);
  root.add(shards, edges);
  return root;
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
    const shards = root.getObjectByName('prewarmed-window-debris:shard-cluster');
    if (shards instanceof THREE.Mesh) {
      const materials = Array.isArray(shards.material) ? shards.material : [shards.material];
      for (const material of materials) material.dispose();
    }
    root.clear();
  }
}
