export type RiggedHandSide = 'left' | 'right';

export type RiggedHandSourceSentinel = Readonly<{
  worldPosition: readonly number[];
}>;

export const RIGGED_HAND_CAMERA_CONTRACT = Object.freeze({
  contract: 'fixed-shoulder-lateral-front-oblique-hand-v2',
  outsideOffsetM: 0.7,
  upwardOffsetM: 0.12,
  fovDegrees: 48,
  maximumSourceJointDriftM: 0.03,
  frontObliqueDegrees: 20,
  minimumHorizontalShoulderSpanM: 0.15,
  minimumOrthogonalFrontLengthM: 0.08,
  minimumWeaponCenterDistanceM: 0.08,
  maximumWeaponCenterDistanceM: 0.65,
  minimumAbsoluteLateralDot: 0.93,
  minimumFrontDot: 0.33,
  maximumFrontDot: 0.35,
  maximumPeerDirectionDot: -0.75,
  noFallback: true,
});

type DeriveRiggedHandCameraInput = Readonly<{
  side: RiggedHandSide;
  leftShoulderWorld: readonly number[];
  rightShoulderWorld: readonly number[];
  weaponCenterWorld: readonly number[];
  handSentinels: readonly RiggedHandSourceSentinel[];
}>;

function finiteVector3(value: readonly number[]): value is readonly [number, number, number] {
  return value.length === 3 && value.every(Number.isFinite);
}

function fail(reason: string): never {
  throw new Error(`Rigged hand camera degeneracy: ${reason}`);
}

export function deriveRiggedHandCamera(input: DeriveRiggedHandCameraInput) {
  const {
    side, leftShoulderWorld, rightShoulderWorld, weaponCenterWorld, handSentinels,
  } = input;
  if (!finiteVector3(leftShoulderWorld) || !finiteVector3(rightShoulderWorld)
    || !finiteVector3(weaponCenterWorld)) fail('non-finite-source-basis');
  if (handSentinels.length !== 6
    || !handSentinels.every(({ worldPosition }) => finiteVector3(worldPosition))) {
    fail('invalid-hand-sentinel-set');
  }

  const shoulderDelta = [
    rightShoulderWorld[0] - leftShoulderWorld[0],
    0,
    rightShoulderWorld[2] - leftShoulderWorld[2],
  ] as const;
  const horizontalShoulderSpanM = Math.hypot(shoulderDelta[0], shoulderDelta[2]);
  if (!(horizontalShoulderSpanM >= RIGGED_HAND_CAMERA_CONTRACT.minimumHorizontalShoulderSpanM)) {
    fail('horizontal-shoulder-span');
  }
  const lateralWorld = shoulderDelta.map((value) => value / horizontalShoulderSpanM);
  const shoulderMidWorld = [0, 1, 2].map((axis) => (
    (leftShoulderWorld[axis] + rightShoulderWorld[axis]) / 2
  ));
  const rawFrontWorld = [
    weaponCenterWorld[0] - shoulderMidWorld[0],
    0,
    weaponCenterWorld[2] - shoulderMidWorld[2],
  ];
  const weaponCenterDistanceM = Math.hypot(rawFrontWorld[0], rawFrontWorld[2]);
  if (!(weaponCenterDistanceM >= RIGGED_HAND_CAMERA_CONTRACT.minimumWeaponCenterDistanceM
    && weaponCenterDistanceM <= RIGGED_HAND_CAMERA_CONTRACT.maximumWeaponCenterDistanceM)) {
    fail('weapon-center-distance');
  }
  const lateralProjection = rawFrontWorld[0] * lateralWorld[0]
    + rawFrontWorld[2] * lateralWorld[2];
  const orthogonalFrontWorld = rawFrontWorld.map((value, axis) => (
    value - lateralWorld[axis] * lateralProjection
  ));
  const orthogonalFrontLengthM = Math.hypot(orthogonalFrontWorld[0], orthogonalFrontWorld[2]);
  if (!(orthogonalFrontLengthM >= RIGGED_HAND_CAMERA_CONTRACT.minimumOrthogonalFrontLengthM)) {
    fail('orthogonal-front-length');
  }
  const frontWorld = orthogonalFrontWorld.map((value) => value / orthogonalFrontLengthM);
  const sideSign = side === 'left' ? -1 : 1;
  const obliqueRadians = RIGGED_HAND_CAMERA_CONTRACT.frontObliqueDegrees * Math.PI / 180;
  const outsideDirectionWorld = [0, 1, 2].map((axis) => (
    Math.cos(obliqueRadians) * sideSign * lateralWorld[axis]
      + Math.sin(obliqueRadians) * frontWorld[axis]
  ));
  const peerOutsideDirectionWorld = [0, 1, 2].map((axis) => (
    -Math.cos(obliqueRadians) * sideSign * lateralWorld[axis]
      + Math.sin(obliqueRadians) * frontWorld[axis]
  ));
  const lateralDot = outsideDirectionWorld[0] * lateralWorld[0]
    + outsideDirectionWorld[2] * lateralWorld[2];
  const frontDot = outsideDirectionWorld[0] * frontWorld[0]
    + outsideDirectionWorld[2] * frontWorld[2];
  const peerDirectionDot = outsideDirectionWorld.reduce((sum, value, axis) => (
    sum + value * peerOutsideDirectionWorld[axis]
  ), 0);
  if (!(Math.abs(lateralDot) >= RIGGED_HAND_CAMERA_CONTRACT.minimumAbsoluteLateralDot
    && Math.sign(lateralDot) === sideSign
    && frontDot >= RIGGED_HAND_CAMERA_CONTRACT.minimumFrontDot
    && frontDot <= RIGGED_HAND_CAMERA_CONTRACT.maximumFrontDot
    && peerDirectionDot <= RIGGED_HAND_CAMERA_CONTRACT.maximumPeerDirectionDot)) {
    fail('derived-direction-invariant');
  }

  const targetWorld = [0, 1, 2].map((axis) => (
    handSentinels.reduce((sum, sentinel) => sum + sentinel.worldPosition[axis], 0)
      / handSentinels.length
  ));
  const positionWorld = targetWorld.map((value, axis) => (
    value + outsideDirectionWorld[axis] * RIGGED_HAND_CAMERA_CONTRACT.outsideOffsetM
      + (axis === 1 ? RIGGED_HAND_CAMERA_CONTRACT.upwardOffsetM : 0)
  ));

  return Object.freeze({
    sideSign,
    leftShoulderWorld: Object.freeze([...leftShoulderWorld]),
    rightShoulderWorld: Object.freeze([...rightShoulderWorld]),
    shoulderMidWorld: Object.freeze(shoulderMidWorld),
    horizontalShoulderSpanM,
    lateralWorld: Object.freeze(lateralWorld),
    rawFrontWorld: Object.freeze(rawFrontWorld),
    weaponCenterDistanceM,
    orthogonalFrontWorld: Object.freeze(orthogonalFrontWorld),
    orthogonalFrontLengthM,
    frontWorld: Object.freeze(frontWorld),
    outsideDirectionWorld: Object.freeze(outsideDirectionWorld),
    peerOutsideDirectionWorld: Object.freeze(peerOutsideDirectionWorld),
    lateralDot,
    frontDot,
    peerDirectionDot,
    targetWorld: Object.freeze(targetWorld),
    positionWorld: Object.freeze(positionWorld),
    degeneracyPolicy: Object.freeze({
      minimumHorizontalShoulderSpanM: RIGGED_HAND_CAMERA_CONTRACT.minimumHorizontalShoulderSpanM,
      minimumOrthogonalFrontLengthM: RIGGED_HAND_CAMERA_CONTRACT.minimumOrthogonalFrontLengthM,
      minimumWeaponCenterDistanceM: RIGGED_HAND_CAMERA_CONTRACT.minimumWeaponCenterDistanceM,
      maximumWeaponCenterDistanceM: RIGGED_HAND_CAMERA_CONTRACT.maximumWeaponCenterDistanceM,
      noFallback: true,
    }),
  });
}
