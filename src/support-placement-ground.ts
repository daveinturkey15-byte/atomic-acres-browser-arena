import * as THREE from 'three';
import type { Box2 } from './collision';

export type SupportPlacementGroundSamplerOptions = Readonly<{
  bounds: Pick<Box2, 'minY' | 'maxY'>;
  ceilingY: number;
  colliders: readonly Box2[];
  prepareRaycastMeshes: () => readonly THREE.Object3D[];
}>;

function isEnclosingPresentationSurface(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    const semantics = [
      current.name,
      current.userData.supportPlacementSurface,
      current.userData.structureMaterial,
      current.userData.assemblyRole,
    ].filter((value): value is string => typeof value === 'string').join(' ');
    if (/(?:^|[^a-z])(ceiling|roof|soffit|canopy|overhead)(?:[^a-z]|$)/i.test(semantics)) return true;
  }
  return false;
}

/**
 * Resolves all ground samples for one support-world snapshot. The expensive
 * scene traversal and matrix update is deliberately lazy and happens at most
 * once, even when Carpet Bomber lays out its full impact line.
 */
export class SupportPlacementGroundSampler {
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3(0, -1, 0);
  private raycastMeshes: THREE.Object3D[] | null = null;

  constructor(private readonly options: SupportPlacementGroundSamplerOptions) {}

  heightAt(x: number, z: number): number {
    const floorY = this.options.bounds.minY ?? 0;
    const maximumGroundY = this.options.ceilingY - 0.5;
    let admittedHeight = floorY;
    for (const box of this.options.colliders) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      const top = box.maxY ?? 4;
      // Enclosing roofs and full-height walls are collision authority, not a
      // support-placement floor. Treating their tops as ground created a
      // collider-only 17.5m pseudo-surface under the Gun Range test-bay roof.
      if (Number.isFinite(top) && top <= maximumGroundY) admittedHeight = Math.max(admittedHeight, top);
    }

    const originY = Math.max(
      this.options.ceilingY + 8,
      (this.options.bounds.maxY ?? this.options.ceilingY) + 8,
    );
    this.rayOrigin.set(x, originY, z);
    this.raycaster.set(this.rayOrigin, this.rayDirection);
    this.raycaster.near = 0;
    this.raycaster.far = originY - floorY + 2;
    this.raycastMeshes ??= [...this.options.prepareRaycastMeshes()];
    const hit = this.raycaster.intersectObjects(this.raycastMeshes, true)
      .find((candidate) => candidate.point.y >= floorY - 0.05
        && candidate.point.y <= maximumGroundY
        && !isEnclosingPresentationSurface(candidate.object));
    if (hit) admittedHeight = Math.max(admittedHeight, hit.point.y);
    return THREE.MathUtils.clamp(admittedHeight, floorY, maximumGroundY);
  }
}
