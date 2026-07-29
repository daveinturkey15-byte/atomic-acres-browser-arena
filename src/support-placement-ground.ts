import * as THREE from 'three';
import type { Box2 } from './collision';

export type SupportPlacementGroundSamplerOptions = Readonly<{
  bounds: Pick<Box2, 'minY' | 'maxY'>;
  ceilingY: number;
  colliders: readonly Box2[];
  prepareRaycastMeshes: () => readonly THREE.Object3D[];
}>;

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
    let admittedHeight = floorY;
    for (const box of this.options.colliders) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      const top = box.maxY ?? 4;
      if (Number.isFinite(top)) admittedHeight = Math.max(admittedHeight, top);
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
      .find((candidate) => candidate.point.y >= floorY - 0.05 && candidate.point.y <= this.options.ceilingY);
    if (hit) admittedHeight = Math.max(admittedHeight, hit.point.y);
    return THREE.MathUtils.clamp(admittedHeight, floorY, this.options.ceilingY - 0.5);
  }
}
