import { describe, expect, it } from 'vitest';
import { circleIntersectsBox, damp, resolveHorizontalMove, segmentIntersectsBox, shortestAngleDelta } from './collision';

const wall = { minX: 1, maxX: 3, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

describe('arena collision', () => {
  it('detects circle overlap against an axis-aligned wall', () => {
    expect(circleIntersectsBox(0.7, 0, 0.4, wall)).toBe(true);
    expect(circleIntersectsBox(0, 0, 0.4, wall)).toBe(false);
  });

  it('slides on the free axis rather than cancelling all motion', () => {
    const result = resolveHorizontalMove(
      { x: 0, y: 1.7, z: -2 },
      { x: 1.5, y: 1.7, z: 0.5 },
      [wall],
      bounds,
    );
    expect(result.x).toBe(1.5);
    expect(result.z).toBe(-2);
  });

  it('clamps the player within map boundaries', () => {
    const result = resolveHorizontalMove(
      { x: 0, y: 1.7, z: 0 },
      { x: 99, y: 1.7, z: -99 },
      [],
      bounds,
      0.5,
    );
    expect(result.x).toBe(9.5);
    expect(result.z).toBe(-9.5);
  });

  it('checks line of sight against solid boxes without mesh raycasts', () => {
    expect(segmentIntersectsBox({ x: 0, y: 1.7, z: 0 }, { x: 4, y: 1.7, z: 0 }, wall)).toBe(true);
    expect(segmentIntersectsBox({ x: 0, y: 1.7, z: 3 }, { x: 4, y: 1.7, z: 3 }, wall)).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 5, z: 0 }, { x: 4, y: 5, z: 0 }, wall)).toBe(false);
  });
});

describe('interpolation helpers', () => {
  it('takes the shortest wrapped angle path', () => {
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
  });

  it('damping is framerate independent within floating point tolerance', () => {
    const oneStep = damp(0, 10, 8, 1 / 30);
    const half = damp(0, 10, 8, 1 / 60);
    const twoSteps = damp(half, 10, 8, 1 / 60);
    expect(twoSteps).toBeCloseTo(oneStep, 8);
  });
});
