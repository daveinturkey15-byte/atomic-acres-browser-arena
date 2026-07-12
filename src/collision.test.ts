import { describe, expect, it } from 'vitest';
import { circleIntersectsBox, clampPointToBounds, damp, firstSegmentBoxHit, pointInsideBounds, resolveHitscanAgainstTarget, resolveHorizontalMove, segmentIntersectsBox, shortestAngleDelta, sweepSphereAgainstBoxes } from './collision';

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

  it('rejects out-of-bounds combat origins with the actor radius margin', () => {
    expect(pointInsideBounds({ x: 0, y: 1.7, z: 0 }, bounds, 0.5)).toBe(true);
    expect(pointInsideBounds({ x: 9.5, y: 1.7, z: -9.5 }, bounds, 0.5)).toBe(true);
    expect(pointInsideBounds({ x: 9.51, y: 1.7, z: 0 }, bounds, 0.5)).toBe(false);
    expect(pointInsideBounds({ x: 0, y: 1.7, z: -9.51 }, bounds, 0.5)).toBe(false);
    expect(clampPointToBounds({ x: 13, y: 4, z: -12 }, bounds, 0.5)).toEqual({ x: 9.5, y: 4, z: -9.5 });
  });

  it('checks line of sight against solid boxes in all three dimensions', () => {
    expect(segmentIntersectsBox({ x: 0, y: 1.7, z: 0 }, { x: 4, y: 1.7, z: 0 }, wall)).toBe(true);
    expect(segmentIntersectsBox({ x: 0, y: 1.7, z: 3 }, { x: 4, y: 1.7, z: 3 }, wall)).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 5, z: 0 }, { x: 4, y: 5, z: 0 }, wall)).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 8, z: 0 }, { x: 4, y: 0, z: 0 }, wall)).toBe(true);
    expect(segmentIntersectsBox({ x: 0, y: 8, z: 0 }, { x: 4, y: 4, z: 0 }, wall)).toBe(false);
  });

  it('returns the nearest authoritative cover hit for tracer clipping', () => {
    const nearWall = { minX: 1, maxX: 1.4, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
    const farWall = { minX: 3, maxX: 3.4, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
    const hit = firstSegmentBoxHit({ x: 0, y: 1.5, z: 0 }, { x: 5, y: 1.5, z: 0 }, [farWall, nearWall]);
    expect(hit?.box).toBe(nearWall);
    expect(hit?.time).toBeCloseTo(0.196, 3);
  });

  it('stops a bot hitscan at cover and never authorizes damage through it', () => {
    const fence = { minX: 2, maxX: 2.4, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
    const blocked = resolveHitscanAgainstTarget(
      { x: 0, y: 1.4, z: 0 },
      { x: 1, y: 0, z: 0 },
      8,
      { x: 4, y: 1.4, z: 0 },
      0.55,
      [fence],
    );
    expect(blocked.blockedByCover).toBe(true);
    expect(blocked.hitTarget).toBe(false);
    expect(blocked.tracerDistance).toBeCloseTo(1.98, 2);

    const clear = resolveHitscanAgainstTarget(
      { x: 0, y: 1.4, z: 0 },
      { x: 1, y: 0, z: 0 },
      8,
      { x: 4, y: 1.4, z: 0 },
      0.55,
      [],
    );
    expect(clear.blockedByCover).toBe(false);
    expect(clear.hitTarget).toBe(true);
  });

  it('sweeps fast grenades into thin walls instead of tunnelling through', () => {
    const hit = sweepSphereAgainstBoxes(
      { x: 0, y: 1, z: 0 },
      { x: 4, y: 0, z: 0 },
      [wall],
      0.17,
    );
    expect(hit).not.toBeNull();
    expect(hit!.time).toBeGreaterThan(0.15);
    expect(hit!.time).toBeLessThan(0.3);
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(sweepSphereAgainstBoxes({ x: 0, y: 4, z: 0 }, { x: 4, y: 0, z: 0 }, [wall])).toBeNull();
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
