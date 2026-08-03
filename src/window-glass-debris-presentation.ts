import * as THREE from 'three';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT = 'fractured-shards-no-intact-pane-v1';
export const WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT = 24;

type WindowGlassDebrisVisualOptions = Readonly<{
  id: string;
  halfExtents: Readonly<{ x: number; y: number; z: number }>;
  reducedRenderMode: boolean;
}>;

/**
 * A shattered pane reads as broken when it breaks into many small shards, not
 * six large slabs. Generate a 4x3 grid of inset triangles (24 shards) with
 * visible gaps between them so the debris reads as a real break while the
 * total covered area stays inside the shared-buffer contract.
 */
function buildShardTriangles(): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  const triangles: Array<ReadonlyArray<readonly [number, number]>> = [];
  const columns = 4;
  const rows = 3;
  const inset = 0.1;
  const cellWidth = 2 / columns;
  const cellHeight = 2 / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = -1 + column * cellWidth;
      const x1 = x0 + cellWidth;
      const y0 = 1 - (row + 1) * cellHeight;
      const y1 = y0 + cellHeight;
      const left = x0 + inset;
      const right = x1 - inset;
      const bottom = y0 + inset;
      const top = y1 - inset;
      triangles.push(Object.freeze([
        Object.freeze([left, bottom] as const),
        Object.freeze([right, bottom] as const),
        Object.freeze([left, top] as const),
      ]));
      triangles.push(Object.freeze([
        Object.freeze([right, bottom] as const),
        Object.freeze([right, top] as const),
        Object.freeze([left, top] as const),
      ]));
    }
  }
  return Object.freeze(triangles);
}

const SHARD_TRIANGLES = buildShardTriangles();

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

  // Reuse the single prewarmed material instance for every break. Cloning per
  // break creates a new RenderObject whose first draw triggers a WebGPU shader
  // pipeline compile on the shot frame (the reported glass-break freeze).
  const shardMaterial = options.reducedRenderMode ? sharedShardMaterialReduced : sharedShardMaterialTemplate;
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
    // The debris visuals now share the single prewarmed material instance, so
    // never dispose it here - live breaks reuse the same pipeline.
    root.clear();
  }
}
