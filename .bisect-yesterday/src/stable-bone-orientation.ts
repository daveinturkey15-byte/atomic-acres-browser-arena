import * as THREE from 'three';

const current = new THREE.Vector3();
const desired = new THREE.Vector3();
const axis = new THREE.Vector3();
const basis = new THREE.Vector3();

/**
 * Returns the shortest rotation from one direction to another while keeping the
 * 180-degree case deterministic. THREE.Quaternion.setFromUnitVectors() must
 * choose an arbitrary perpendicular axis for anti-parallel inputs; on a rigged
 * wrist that choice can flip between frames and invert the hand.
 */
export function stableDirectionDelta(
  currentDirection: THREE.Vector3,
  desiredDirection: THREE.Vector3,
  preferredAxis: THREE.Vector3,
  target = new THREE.Quaternion(),
): THREE.Quaternion {
  current.copy(currentDirection).normalize();
  desired.copy(desiredDirection).normalize();
  if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return target.identity();
  const dot = THREE.MathUtils.clamp(current.dot(desired), -1, 1);
  // Preserve the exact shortest arc for every non-singular pair instead of
  // delegating to THREE.setFromUnitVectors(), whose deliberate 1e-8 fallback
  // already chooses an arbitrary axis before the pair is truly anti-parallel.
  const scalar = 1 + dot;
  if (scalar > Number.EPSILON) {
    axis.crossVectors(current, desired);
    return target.set(axis.x, axis.y, axis.z, scalar).normalize();
  }

  axis.copy(preferredAxis).addScaledVector(current, -preferredAxis.dot(current));
  if (axis.lengthSq() < 1e-8) {
    basis.set(
      Math.abs(current.x) < Math.abs(current.y) && Math.abs(current.x) < Math.abs(current.z) ? 1 : 0,
      Math.abs(current.y) <= Math.abs(current.x) && Math.abs(current.y) < Math.abs(current.z) ? 1 : 0,
      Math.abs(current.z) <= Math.abs(current.x) && Math.abs(current.z) <= Math.abs(current.y) ? 1 : 0,
    );
    axis.crossVectors(current, basis);
  }
  return target.setFromAxisAngle(axis.normalize(), Math.PI).normalize();
}
