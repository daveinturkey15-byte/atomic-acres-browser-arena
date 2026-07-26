import * as THREE from 'three';

export const GPU_GEOMETRY_OWNER_KEY = 'atomicAcresGpuGeometryOwner' as const;

/**
 * SkeletonUtils clones scene graphs but deliberately shares mesh geometries.
 * Runtime entities that can retire independently must own their geometry so a
 * fenced disposal cannot invalidate another live operator or the source GLB.
 */
export function cloneMeshGeometriesForOwner(root: THREE.Object3D, owner: string): number {
  const ownedClones = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const source = node.geometry;
    const existing = ownedClones.get(source);
    const geometry = existing ?? source.clone();
    if (!existing) {
      geometry.userData = { ...geometry.userData, [GPU_GEOMETRY_OWNER_KEY]: owner };
      ownedClones.set(source, geometry);
    }
    node.geometry = geometry;
  });
  root.userData.gpuGeometryOwner = owner;
  root.userData.gpuOwnedGeometryCount = ownedClones.size;
  return ownedClones.size;
}

export function ownedMeshGeometryCount(root: THREE.Object3D, owner: string): number {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.geometry.userData[GPU_GEOMETRY_OWNER_KEY] === owner) owned.add(node.geometry);
  });
  return owned.size;
}
