export type ChopperExteriorReviewBounds = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type ChopperExteriorReviewCameraInput = Readonly<{
  drawableBounds: ChopperExteriorReviewBounds;
  entityYaw: number;
  aspect: number;
  preferredSide?: -1 | 1 | null;
}>;

export type ChopperExteriorReviewCameraPose = Readonly<{
  side: -1 | 1;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
  distanceM: number;
  clearanceM: number;
  inTestBay: boolean;
}>;

export async function withExactChopperRootHiddenForControl<T>(
  root: { visible: boolean },
  capture: () => Promise<T>,
): Promise<T> {
  if (!root.visible) throw new Error('Chopper hidden-control requires the exact visible reviewed root');
  root.visible = false;
  try {
    return await capture();
  } finally {
    root.visible = true;
  }
}

export const CHOPPER_EXTERIOR_REVIEW_CAMERA_CONTRACT = Object.freeze({
  quarterAngleRadians: Math.PI / 3,
  fovDegrees: 50,
  fitFraction: 0.55,
  minimumDistanceM: 5.5,
  fitPaddingM: 1.2,
  maximumDistanceM: 18,
  wallInsetM: 0.8,
  minimumCameraY: 1.8,
  minimumVerticalOffsetM: 0.55,
  verticalOffsetSpanRatio: 0.06,
  testBayMinimumX: 50,
  mainRange: Object.freeze({ minX: -19.2, maxX: 19.2, minZ: -47.8, maxZ: 19, maxCameraY: 5.8 }),
  testBay: Object.freeze({ minX: 52.8, maxX: 99.2, minZ: -25.2, maxZ: 37.2, maxCameraY: 22 }),
});

function finiteBounds(bounds: ChopperExteriorReviewBounds): boolean {
  return bounds.min.length === 3
    && bounds.max.length === 3
    && [...bounds.min, ...bounds.max].every(Number.isFinite)
    && bounds.max.every((coordinate, axis) => coordinate > bounds.min[axis]!);
}

export function chopperExteriorReviewCameraPose(
  input: ChopperExteriorReviewCameraInput,
): ChopperExteriorReviewCameraPose | null {
  if (!finiteBounds(input.drawableBounds)
    || !Number.isFinite(input.entityYaw)
    || !Number.isFinite(input.aspect)
    || input.aspect <= 0
    || (input.preferredSide !== undefined
      && input.preferredSide !== null
      && input.preferredSide !== -1
      && input.preferredSide !== 1)) return null;

  const contract = CHOPPER_EXTERIOR_REVIEW_CAMERA_CONTRACT;
  const { min, max } = input.drawableBounds;
  const target = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ] as const;
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as const;
  const inTestBay = target[0] >= contract.testBayMinimumX;
  const arena = inTestBay ? contract.testBay : contract.mainRange;
  const verticalTangent = Math.tan((contract.fovDegrees * Math.PI / 180) / 2);
  const horizontalTangent = verticalTangent * input.aspect;
  const horizontalSpan = Math.max(span[0], span[2]);
  const fittedDistance = Math.max(
    span[1] / (2 * verticalTangent * contract.fitFraction),
    horizontalSpan / (2 * horizontalTangent * contract.fitFraction),
    contract.minimumDistanceM,
  ) + contract.fitPaddingM;
  const cameraDistanceM = Math.min(contract.maximumDistanceM, fittedDistance);
  const sides = input.preferredSide === -1 || input.preferredSide === 1
    ? [input.preferredSide]
    : [-1, 1] as const;
  const candidates = sides.map((side) => {
    const angle = input.entityYaw + Math.PI + (side * contract.quarterAngleRadians);
    const x = Math.max(
      arena.minX + contract.wallInsetM,
      Math.min(arena.maxX - contract.wallInsetM, target[0] + (Math.sin(angle) * cameraDistanceM)),
    );
    const z = Math.max(
      arena.minZ + contract.wallInsetM,
      Math.min(arena.maxZ - contract.wallInsetM, target[2] + (Math.cos(angle) * cameraDistanceM)),
    );
    const clearanceM = Math.min(
      x - arena.minX,
      arena.maxX - x,
      z - arena.minZ,
      arena.maxZ - z,
    );
    const distanceM = Math.hypot(x - target[0], z - target[2]);
    return { side, x, z, clearanceM, distanceM };
  });
  candidates.sort((left, right) => (
    (right.clearanceM + right.distanceM) - (left.clearanceM + left.distanceM)
  ));
  const candidate = candidates[0]!;
  const cameraY = Math.max(
    contract.minimumCameraY,
    Math.min(
      arena.maxCameraY,
      target[1] + Math.max(contract.minimumVerticalOffsetM, span[1] * contract.verticalOffsetSpanRatio),
    ),
  );
  const horizontalDistanceM = Math.hypot(candidate.x - target[0], candidate.z - target[2]);
  return Object.freeze({
    side: candidate.side,
    position: Object.freeze([candidate.x, cameraY, candidate.z] as [number, number, number]),
    target: Object.freeze([...target] as [number, number, number]),
    yaw: Math.atan2(candidate.x - target[0], candidate.z - target[2]),
    pitch: Math.atan2(target[1] - cameraY, Math.max(0.001, horizontalDistanceM)),
    fov: contract.fovDegrees,
    distanceM: candidate.distanceM,
    clearanceM: candidate.clearanceM,
    inTestBay,
  });
}
