import { describe, expect, it } from 'vitest';
import { deriveRiggedHandCamera, RIGGED_HAND_CAMERA_CONTRACT } from './rigged-hand-evidence';

const leftShoulder = [-0.15, 1.4, 0.05] as const;
const rightShoulder = [0.15, 1.4, 0.05] as const;
const weaponCenter = [0, 1.25, -0.2] as const;
const crossedLeftHand = [
  [0.2, 1.2, -0.2], [0.18, 1.18, -0.22], [0.16, 1.2, -0.24],
  [0.17, 1.21, -0.25], [0.19, 1.22, -0.25], [0.21, 1.22, -0.24],
].map((worldPosition) => ({ worldPosition }));
const crossedRightHand = [
  [-0.2, 1.2, -0.2], [-0.18, 1.18, -0.22], [-0.16, 1.2, -0.24],
  [-0.17, 1.21, -0.25], [-0.19, 1.22, -0.25], [-0.21, 1.22, -0.24],
].map((worldPosition) => ({ worldPosition }));

describe('deterministic rigged hand evidence camera', () => {
  it('keeps left and right cameras in opposite shoulder hemispheres with one fixed front bias', () => {
    const left = deriveRiggedHandCamera({
      side: 'left', leftShoulderWorld: leftShoulder, rightShoulderWorld: rightShoulder,
      weaponCenterWorld: weaponCenter, handSentinels: crossedLeftHand,
    });
    const right = deriveRiggedHandCamera({
      side: 'right', leftShoulderWorld: leftShoulder, rightShoulderWorld: rightShoulder,
      weaponCenterWorld: weaponCenter, handSentinels: crossedRightHand,
    });

    expect(left.gripHemisphereSign).toBe(1);
    expect(right.gripHemisphereSign).toBe(-1);
    expect(left.lateralDot).toBeCloseTo(Math.cos(Math.PI / 9), 12);
    expect(right.lateralDot).toBeCloseTo(-Math.cos(Math.PI / 9), 12);
    expect(left.frontDot).toBeCloseTo(Math.sin(Math.PI / 9), 12);
    expect(right.frontDot).toBeCloseTo(Math.sin(Math.PI / 9), 12);
    expect(left.peerDirectionDot).toBeCloseTo(-Math.cos(2 * Math.PI / 9), 12);
    expect(left.outsideDirectionWorld).toEqual(right.peerOutsideDirectionWorld);
    expect(left.outsideDirectionWorld.reduce((sum, value, axis) => (
      sum + value * right.outsideDirectionWorld[axis]
    ), 0)).toBeCloseTo(-Math.cos(2 * Math.PI / 9), 12);
    expect(Math.hypot(...left.outsideDirectionWorld)).toBeCloseTo(1, 12);
    expect(Math.hypot(...left.positionWorld.map((value, axis) => (
      value - left.targetWorld[axis] - (axis === 1 ? RIGGED_HAND_CAMERA_CONTRACT.upwardOffsetM : 0)
    )))).toBeCloseTo(RIGGED_HAND_CAMERA_CONTRACT.outsideOffsetM, 12);
  });

  it.each([
    ['coincident horizontal shoulders', { leftShoulderWorld: [0, 1.4, 0], rightShoulderWorld: [0, 1.5, 0] }],
    ['weapon center on the shoulder axis', { weaponCenterWorld: [0.2, 1.25, 0.05] }],
    ['weapon center too close', { weaponCenterWorld: [0, 1.25, 0.049] }],
    ['weapon center too far', { weaponCenterWorld: [0, 1.25, -0.7] }],
    ['non-finite source', { rightShoulderWorld: [Number.NaN, 1.4, 0] }],
    ['missing hand sentinel', { handSentinels: crossedLeftHand.slice(1) }],
    ['uncrossed left grip', { handSentinels: crossedRightHand }],
    ['sub-minimum grip hemisphere', {
      handSentinels: crossedLeftHand.map(({ worldPosition }) => ({
        worldPosition: [0.079, worldPosition[1], worldPosition[2]],
      })),
    }],
  ])('fails closed without fallback for %s', (_label, override) => {
    expect(() => deriveRiggedHandCamera({
      side: 'left',
      leftShoulderWorld: leftShoulder,
      rightShoulderWorld: rightShoulder,
      weaponCenterWorld: weaponCenter,
      handSentinels: crossedLeftHand,
      ...override,
    })).toThrow('Rigged hand camera degeneracy');
  });
});
