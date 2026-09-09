import { describe, expect, it } from 'vitest';
import {
  circleIntersectsBox,
  collidersOverlappingVerticalSpan,
  clampPointToBounds,
  damp,
  firstSegmentBoxHit,
  isBlocked,
  pointInsideBounds,
  resolveHitscanAgainstTarget,
  resolveHorizontalMove,
  segmentIntersectsBox,
  shortestAngleDelta,
  sweepSphereAgainstBoxes,
  sphereIntersectsBox,
  type Box2,
} from './collision';

const wall = { minX: 1, maxX: 3, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const closedShedDoor: Box2 = {
  minX: -0.72, maxX: 0.72, minZ: -0.04, maxZ: 0.04, minY: 0, maxY: 2.2, rotation: [0, 0, 0],
};
const openShedDoor: Box2 = { ...closedShedDoor, rotation: [0, Math.PI / 2, 0] };

describe('arena collision', () => {
  it('detects circle overlap against an axis-aligned wall', () => {
    expect(circleIntersectsBox(0.7, 0, 0.4, wall)).toBe(true);
    expect(circleIntersectsBox(0, 0, 0.4, wall)).toBe(false);
  });

  it('detects support-flight sphere overlap against axis-aligned and oriented solids', () => {
    expect(sphereIntersectsBox({ x: 1.1, y: 1.5, z: 0 }, 0.25, wall)).toBe(true);
    expect(sphereIntersectsBox({ x: 0.5, y: 1.5, z: 0 }, 0.25, wall)).toBe(false);
    expect(sphereIntersectsBox({ x: 0, y: 0.8, z: 0 }, 0.25, {
      minX: -1, maxX: 1, minY: -0.1, maxY: 0.1, minZ: -1, maxZ: 1, rotation: [0, 0, Math.PI / 2],
    })).toBe(true);
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

  it('preserves collider identity while isolating stacked-deck capsule spans', () => {
    const engineWall: Box2 = { minX: -1, maxX: 1, minY: -0.2, maxY: 2.8, minZ: -1, maxZ: 1 };
    const mainWall: Box2 = { minX: -1, maxX: 1, minY: 3.2, maxY: 5.9, minZ: -1, maxZ: 1 };
    const upperWall: Box2 = { minX: -1, maxX: 1, minY: 6.2, maxY: 8.92, minZ: -1, maxZ: 1 };
    const colliders = [engineWall, mainWall, upperWall];
    expect(collidersOverlappingVerticalSpan(colliders, 0, 1.7)).toEqual([engineWall]);
    expect(collidersOverlappingVerticalSpan(colliders, 3.2, 4.9)).toEqual([mainWall]);
    expect(collidersOverlappingVerticalSpan(colliders, 6.2, 7.9)).toEqual([upperWall]);
    expect(collidersOverlappingVerticalSpan(colliders, 3.2, 4.9)[0]).toBe(mainWall);
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
    expect(hit!.box).toBe(wall);
    expect(sweepSphereAgainstBoxes({ x: 0, y: 4, z: 0 }, { x: 4, y: 0, z: 0 }, [wall])).toBeNull();
  });

  it('rotates shed-door occupancy and line-of-sight authority with the leaf', () => {
    const acrossClosedLeaf = [{ x: 0.5, y: 1.1, z: -1 }, { x: 0.5, y: 1.1, z: 1 }] as const;
    const acrossOpenLeaf = [{ x: -1, y: 1.1, z: 0.5 }, { x: 1, y: 1.1, z: 0.5 }] as const;

    expect(segmentIntersectsBox(...acrossClosedLeaf, closedShedDoor)).toBe(true);
    expect(segmentIntersectsBox(...acrossClosedLeaf, openShedDoor)).toBe(false);
    expect(segmentIntersectsBox(...acrossOpenLeaf, closedShedDoor)).toBe(false);
    expect(segmentIntersectsBox(...acrossOpenLeaf, openShedDoor)).toBe(true);

    expect(circleIntersectsBox(0.5, 0, 0.08, closedShedDoor)).toBe(true);
    expect(circleIntersectsBox(0.5, 0, 0.08, openShedDoor)).toBe(false);
    expect(isBlocked({ x: 0, y: 1.65, z: 0.5 }, [closedShedDoor], 0.08)).toBe(false);
    expect(isBlocked({ x: 0, y: 1.65, z: 0.5 }, [openShedDoor], 0.08)).toBe(true);

    expect(resolveHorizontalMove(
      { x: -0.2, y: 1.65, z: 0.5 },
      { x: 0, y: 1.65, z: 0.5 },
      [closedShedDoor],
      bounds,
      0.08,
    ).x).toBe(0);
    expect(resolveHorizontalMove(
      { x: -0.2, y: 1.65, z: 0.5 },
      { x: 0, y: 1.65, z: 0.5 },
      [openShedDoor],
      bounds,
      0.08,
    ).x).toBe(-0.2);
  });

  it('returns the rotated world-space normal for a swept shed-door hit', () => {
    expect(sweepSphereAgainstBoxes(
      { x: -1, y: 1.1, z: 0.5 },
      { x: 2, y: 0, z: 0 },
      [closedShedDoor],
      0.08,
    )).toBeNull();
    const openHit = sweepSphereAgainstBoxes(
      { x: -1, y: 1.1, z: 0.5 },
      { x: 2, y: 0, z: 0 },
      [openShedDoor],
      0.08,
    );
    expect(openHit).not.toBeNull();
    expect(openHit!.normal).toEqual({ x: -1, y: 0, z: 0 });

    const diagonalDoor: Box2 = { ...closedShedDoor, rotation: [0, Math.PI / 4, 0] };
    const diagonal = Math.SQRT1_2;
    const diagonalHit = sweepSphereAgainstBoxes(
      { x: -diagonal * 2, y: 1.1, z: -diagonal * 2 },
      { x: diagonal * 4, y: 0, z: diagonal * 4 },
      [diagonalDoor],
      0.08,
    );
    expect(diagonalHit).not.toBeNull();
    expect(diagonalHit!.normal.x).toBeCloseTo(-diagonal, 10);
    expect(diagonalHit!.normal.y).toBe(0);
    expect(diagonalHit!.normal.z).toBeCloseTo(-diagonal, 10);
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
