import * as THREE from 'three';
import type { BallisticSurface } from '../../src/ballistics';

/** Float32 scene-coordinate tolerance, not a gameplay coverage allowance. */
const COORDINATE_EPSILON_M = 1e-5;

/**
 * Every entire triangle must fit in ONE convex shot box. Testing its three
 * vertices in the same oriented box proves its interior is covered, while
 * vertices split across boxes do not prove anything about the air between.
 * Uses the same centre and inverse XYZ Euler rotation as surfaceInterval.
 * Invalid measurements fail closed rather than contributing a proof.
 */
export function proveTriangleShotCoverage(
  vertices: readonly THREE.Vector3[],
  surfaces: readonly BallisticSurface[],
): { triangles: number; surfaceIds: string[] } | null {
  if (vertices.length === 0 || vertices.length % 3 !== 0
    || vertices.some(v => ![v.x, v.y, v.z].every(Number.isFinite))) return null;
  const boxes = surfaces.map(surface => {
    const b = surface.bounds;
    const minY = b.minY ?? 0; const maxY = b.maxY ?? 8;
    if (![b.minX, b.maxX, b.minZ, b.maxZ, minY, maxY, ...(b.rotation ?? [])].every(Number.isFinite)
      || b.minX >= b.maxX || b.minZ >= b.maxZ || minY >= maxY) return null;
    const centre = new THREE.Vector3((b.minX + b.maxX) / 2, (minY + maxY) / 2, (b.minZ + b.maxZ) / 2);
    const half = new THREE.Vector3((b.maxX - b.minX) / 2, (maxY - minY) / 2, (b.maxZ - b.minZ) / 2);
    const inverse = new THREE.Quaternion();
    if (b.rotation) inverse.setFromEuler(new THREE.Euler(...b.rotation)).invert();
    return { surface, centre, half, inverse };
  });
  if (boxes.some(box => box === null)) return null;
  const used = new Set<string>();
  const local = new THREE.Vector3();
  for (let i = 0; i < vertices.length; i += 3) {
    const covering = boxes.find(box => box && [0, 1, 2].every(offset => {
      local.copy(vertices[i + offset]!).sub(box.centre).applyQuaternion(box.inverse);
      return Math.abs(local.x) <= box.half.x + COORDINATE_EPSILON_M
        && Math.abs(local.y) <= box.half.y + COORDINATE_EPSILON_M
        && Math.abs(local.z) <= box.half.z + COORDINATE_EPSILON_M;
    }));
    if (!covering) return null;
    used.add(covering.surface.id);
  }
  return { triangles: vertices.length / 3, surfaceIds: [...used].sort() };
}
