import * as THREE from 'three';

/**
 * Returns a stable elbow point for a two-segment chain. Targets beyond reach are
 * clamped onto the reachable sphere rather than producing NaN or a flipped arm.
 */
export function solveTwoBoneElbow(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  bendHint: THREE.Vector3,
): THREE.Vector3 {
  const toTarget = target.clone().sub(shoulder);
  const rawDistance = toTarget.length();
  const direction = rawDistance > 1e-6 ? toTarget.multiplyScalar(1 / rawDistance) : new THREE.Vector3(0, 0, -1);
  const minimum = Math.abs(upperLength - lowerLength) + 1e-4;
  const maximum = upperLength + lowerLength - 1e-4;
  const distance = THREE.MathUtils.clamp(rawDistance, minimum, maximum);
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const perpendicular = bendHint.clone().sub(direction.clone().multiplyScalar(bendHint.dot(direction)));
  if (perpendicular.lengthSq() < 1e-6) {
    perpendicular.crossVectors(direction, Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  }
  perpendicular.normalize();
  return shoulder.clone().addScaledVector(direction, along).addScaledVector(perpendicular, height);
}
