import * as THREE from 'three';

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

/**
 * Shared shard cluster material: MeshPhysicalMaterial with transmission is
 * expensive to compile on first use, so we prewarm one instance and clone it
 * per break. This avoids the first-break frame hitch.
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

  const positions: number[] = [];
  SHARD_TRIANGLES.forEach((triangle, fragmentIndex) => {
    const depth = ((fragmentIndex % 3) - 1) * Math.max(0.006, options.halfExtents.z * 0.32);
    for (const [x, y] of triangle) {
      positions.push(x * options.halfExtents.x, y * options.halfExtents.y, depth);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.name = `${options.id}:fractured-shards`;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  geometry.userData.intactPane = false;

  const shardMaterial = (options.reducedRenderMode ? sharedShardMaterialReduced : sharedShardMaterialTemplate).clone();
  const shards = new THREE.Mesh(geometry, shardMaterial);
  shards.name = `${options.id}:shard-cluster`;
  shards.userData.fragmentCount = WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT;
  shards.userData.intactPane = false;

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), sharedShardEdgesMaterial);
  edges.name = `${options.id}:shard-edges`;
  root.add(shards, edges);
  return root;
}
