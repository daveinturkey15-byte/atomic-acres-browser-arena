import * as THREE from 'three';

export const GPU_GEOMETRY_OWNER_KEY = 'atomicAcresGpuGeometryOwner' as const;
export const GPU_SHARED_GEOMETRY_KEY = 'atomicAcresGpuSharedGeometry' as const;

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

/**
 * Marks immutable source geometry that may be reused by independently retired
 * scene graphs. Retirement disposes each instance's materials but must retain
 * these buffers until their long-lived source asset is released.
 */
export function markMeshGeometriesShared(root: THREE.Object3D, owner: string): number {
  const shared = new Set<THREE.BufferGeometry>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.userData = { ...node.geometry.userData, [GPU_SHARED_GEOMETRY_KEY]: owner };
    shared.add(node.geometry);
  });
  root.userData.gpuSharedGeometryOwner = owner;
  root.userData.gpuSharedGeometryCount = shared.size;
  return shared.size;
}

export function isSharedMeshGeometry(geometry: THREE.BufferGeometry): boolean {
  return typeof geometry.userData[GPU_SHARED_GEOMETRY_KEY] === 'string';
}
