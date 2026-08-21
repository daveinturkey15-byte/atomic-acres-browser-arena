// HF-345: clipping when prone and near walls in many maps.
import { describe, expect, it } from 'vitest';
import { proneBodyClearance, PRONE_PRESENTATION_ENVELOPE } from './prone-clearance';
import type { Box2, Point3 } from './collision';

const { forwardM: MAX_FORWARD, backwardM: MAX_BACKWARD, pivotHeightM: PIVOT_Y } = PRONE_PRESENTATION_ENVELOPE;

function box(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  rotation?: Box2['rotation'],
): Box2 {
  return { minX, maxX, minY, maxY, minZ, maxZ, rotation };
}

function point(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

describe('proneBodyClearance', () => {
  it('returns full envelope in open space', () => {
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, []);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('detects a wall directly ahead', () => {
    // Player at origin facing +Z, wall at z = 0.5.
    const wall = box(-2, 2, 0, 2, 0.5, 0.7);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [wall]);
    expect(clearance.forwardM).toBeCloseTo(0.5, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(true);
  });

  it('detects a wall directly behind', () => {
    // Player at origin facing +Z, wall at z = -0.6.
    const wall = box(-2, 2, 0, 2, -0.8, -0.6);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [wall]);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(0.6, 10);
    expect(clearance.clipped).toBe(true);
  });

  it('detects a wall on both sides', () => {
    const frontWall = box(-2, 2, 0, 2, 0.4, 0.6);
    const backWall = box(-2, 2, 0, 2, -0.7, -0.5);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [frontWall, backWall]);
    expect(clearance.forwardM).toBeCloseTo(0.4, 10);
    expect(clearance.backwardM).toBeCloseTo(0.5, 10);
    expect(clearance.clipped).toBe(true);
  });

  it('handles yaw rotation so the body axis aligns correctly', () => {
    // Player at origin facing +X, wall at x = 0.3.
    const wall = box(0.3, 0.5, 0, 2, -2, 2);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), Math.PI / 2, [wall]);
    expect(clearance.forwardM).toBeCloseTo(0.3, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(true);
  });

  it('reports full clearance for walls at extreme yaw that miss the body axis', () => {
    // Wall at z = 0.5 but player facing +X; probes should miss it.
    const wall = box(-2, 2, 0, 2, 0.5, 0.7);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), Math.PI / 2, [wall]);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('handles a corner that blocks the forward-right flank', () => {
    // Player at origin facing +Z. A corner touches the right flank forward.
    const corner = box(0.05, 0.35, 0, 2, 0.2, 0.8);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [corner]);
    // Centre and left probes are unobstructed, right flank is blocked.
    expect(clearance.forwardM).toBeLessThan(MAX_FORWARD);
    expect(clearance.forwardM).toBeGreaterThan(0);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(true);
  });

  it('handles a doorway gap between two colliders', () => {
    // Two walls on either side of +Z axis with a 1 m gap in x.
    const leftWall = box(-2, -0.6, 0, 2, 0.3, 1.0);
    const rightWall = box(0.6, 2, 0, 2, 0.3, 1.0);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [leftWall, rightWall]);
    // The body is ~0.32 m wide, well under the 1.2 m gap, so it should reach
    // the full forward distance.
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('treats a wall too low to intersect the prone body as non-blocking', () => {
    // Wall top is below the prone pivot height.
    const lowWall = box(-2, 2, 0, 0.2, 0.3, 0.5);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [lowWall]);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('treats a wall too high (only above the body) as non-blocking', () => {
    // Wall bottom is above the prone pivot height.
    const highWall = box(-2, 2, 0.8, 2, 0.3, 0.5);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [highWall]);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('clamps tiny negative clearances to zero', () => {
    // Start exactly on the wall face; hit time can be ~0 or slightly negative.
    const wall = box(-2, 2, 0, 2, 0, 0.1);
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0), 0, [wall]);
    expect(clearance.forwardM).toBeGreaterThanOrEqual(0);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
  });

  it('handles rotated boxes like the repo line-of-sight checks', () => {
    // A 45-degree wall crossing the forward axis.
    const rotatedWall: Box2 = {
      minX: -0.2, maxX: 0.2, minY: 0, maxY: 2, minZ: -2, maxZ: 2,
      rotation: [0, Math.PI / 4, 0],
    };
    const clearance = proneBodyClearance(point(0, PIVOT_Y, 0.2), 0, [rotatedWall]);
    // Some intersection is expected; just verify it does not crash and reports
    // a finite clipped result.
    expect(Number.isFinite(clearance.forwardM)).toBe(true);
    expect(Number.isFinite(clearance.backwardM)).toBe(true);
    expect(clearance.clipped).toBe(true);
  });

  it('returns full clearance for the degenerate zero-collider case', () => {
    const clearance = proneBodyClearance(point(12, PIVOT_Y, -34), Math.PI / 3, []);
    expect(clearance.forwardM).toBeCloseTo(MAX_FORWARD, 10);
    expect(clearance.backwardM).toBeCloseTo(MAX_BACKWARD, 10);
    expect(clearance.clipped).toBe(false);
  });

  it('falls back gracefully for non-finite inputs', () => {
    const clearance = proneBodyClearance(point(NaN, Infinity, NaN), NaN, []);
    expect(Number.isFinite(clearance.forwardM)).toBe(true);
    expect(Number.isFinite(clearance.backwardM)).toBe(true);
    expect(clearance.clipped).toBe(false);
  });

  it('does not mutate input colliders', () => {
    const wall = box(-2, 2, 0, 2, 0.5, 0.7);
    const colliders: Box2[] = [wall];
    const keys = Object.keys(wall);
    proneBodyClearance(point(0, PIVOT_Y, 0), 0, colliders);
    expect(colliders).toHaveLength(1);
    expect(Object.keys(wall)).toEqual(keys);
  });
});
