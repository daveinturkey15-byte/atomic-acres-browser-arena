import * as THREE from 'three';

export type TwoBoneElbowScratch = Readonly<{
  toTarget: THREE.Vector3;
  perpendicular: THREE.Vector3;
  projection: THREE.Vector3;
}>;

export function solveTwoBoneElbowInto(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  bendHint: THREE.Vector3,
  result: THREE.Vector3,
  scratch: TwoBoneElbowScratch,
): THREE.Vector3 {
  const direction = scratch.toTarget.copy(target).sub(shoulder);
  const rawDistance = direction.length();
  if (rawDistance > 1e-6) direction.multiplyScalar(1 / rawDistance);
  else direction.set(0, 0, -1);
  const minimum = Math.abs(upperLength - lowerLength) + 1e-4;
  const maximum = upperLength + lowerLength - 1e-4;
  const distance = THREE.MathUtils.clamp(rawDistance, minimum, maximum);
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const perpendicular = scratch.perpendicular.copy(bendHint)
    .sub(scratch.projection.copy(direction).multiplyScalar(bendHint.dot(direction)));
  if (perpendicular.lengthSq() < 1e-6) {
    scratch.projection.set(Math.abs(direction.y) < 0.9 ? 0 : 1, Math.abs(direction.y) < 0.9 ? 1 : 0, 0);
    perpendicular.crossVectors(direction, scratch.projection);
  }
  perpendicular.normalize();
  return result.copy(shoulder).addScaledVector(direction, along).addScaledVector(perpendicular, height);
}

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
  return solveTwoBoneElbowInto(shoulder, target, upperLength, lowerLength, bendHint, new THREE.Vector3(), {
    toTarget: new THREE.Vector3(),
    perpendicular: new THREE.Vector3(),
    projection: new THREE.Vector3(),
  });
}
