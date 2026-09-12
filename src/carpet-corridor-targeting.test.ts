import { describe, expect, it } from 'vitest';
import {
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  CARPET_BOMBER_MIN_RUN_LENGTH_M,
  CARPET_CORRIDOR_POINT_COUNT,
  carpetCorridorDropPoint,
  carpetCorridorIntent,
  carpetCorridorRun,
  carpetCorridorRunFromPoints,
  carpetCorridorStage,
  createCarpetCorridorTargeting,
  registerCarpetCorridorPoint,
} from './carpet-corridor-targeting';

const BOUNDS = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } as const;

function corridor(...points: readonly { x: number; z: number }[]) {
  return points.reduce(
    (state, point) => registerCarpetCorridorPoint(state, point, BOUNDS),
    createCarpetCorridorTargeting(),
  );
}

describe('carpet corridor stage (HF-369)', () => {
  it('names the click the player is on, not just how many are left', () => {
    expect(carpetCorridorStage(corridor())).toBe('drop');
    expect(carpetCorridorStage(corridor({ x: 0, z: 0 }))).toBe('direction');
    expect(carpetCorridorStage(corridor({ x: 0, z: 0 }, { x: 30, z: 0 }))).toBe('complete');
  });

  it('exposes the drop pin only once it is placed', () => {
    expect(carpetCorridorDropPoint(corridor())).toBeNull();
    expect(carpetCorridorDropPoint(corridor({ x: 4, z: -7 }))).toEqual({ x: 4, z: -7 });
  });
});

describe('carpet corridor run solve (HF-369)', () => {
  it('re-centres a too-long pick on its midpoint instead of flying the whole drag', () => {
    const requested = CARPET_BOMBER_MAX_RUN_LENGTH_M * 2;
    const run = carpetCorridorRunFromPoints({ x: 0, z: 0 }, { x: requested, z: 0 });
    expect(run.requestedLengthM).toBeCloseTo(requested, 6);
    expect(run.lengthM).toBe(CARPET_BOMBER_MAX_RUN_LENGTH_M);
    expect(run.clamp).toBe('shortened');
    expect(run.anchor).toEqual({ x: requested / 2, z: 0 });
    expect(Math.hypot(run.end.x - run.start.x, run.end.z - run.start.z))
      .toBeCloseTo(CARPET_BOMBER_MAX_RUN_LENGTH_M, 6);
    // The drawn ends straddle the midpoint, so neither is the clicked point.
    expect(run.start.x).toBeGreaterThan(0);
    expect(run.end.x).toBeLessThan(requested);
  });

  it('extends a too-short pick to the minimum admitted run', () => {
    const run = carpetCorridorRunFromPoints({ x: 10, z: 10 }, { x: 11, z: 10 });
    expect(run.lengthM).toBe(CARPET_BOMBER_MIN_RUN_LENGTH_M);
    expect(run.clamp).toBe('extended');
    expect(run.anchor).toEqual({ x: 10.5, z: 10 });
  });

  it('reports no clamp for a pick already inside the admitted band', () => {
    const run = carpetCorridorRunFromPoints({ x: 0, z: 0 }, { x: 0, z: 30 });
    expect(run.clamp).toBeNull();
    expect(run.lengthM).toBeCloseTo(30, 6);
    expect(run.start).toEqual({ x: 0, z: 0 });
    expect(run.end.z).toBeCloseTo(30, 6);
  });

  it('falls back to +X east for a degenerate same-point pick', () => {
    const run = carpetCorridorRunFromPoints({ x: 5, z: 5 }, { x: 5, z: 5 });
    expect(run.headingRadians).toBe(0);
    expect(run.lengthM).toBe(CARPET_BOMBER_MIN_RUN_LENGTH_M);
    expect(run.clamp).toBe('extended');
  });

  it('is null until both clicks have landed', () => {
    expect(carpetCorridorRun(corridor())).toBeNull();
    expect(carpetCorridorRun(corridor({ x: 0, z: 0 }))).toBeNull();
    expect(carpetCorridorRun(corridor({ x: 0, z: 0 }, { x: 40, z: 0 }))).not.toBeNull();
  });
});

describe('carpet corridor intent still matches the previewed run', () => {
  it('agrees with the run solve on anchor, heading and length', () => {
    const state = corridor({ x: -30, z: 12 }, { x: 55, z: -20 });
    const run = carpetCorridorRun(state)!;
    const intent = carpetCorridorIntent(state)!;
    expect(intent.lengthM).toBe(run.lengthM);
    expect(intent.anchor[0]).toBeCloseTo(run.anchor.x, 6);
    expect(intent.anchor[2]).toBeCloseTo(run.anchor.z, 6);
    expect(Math.atan2(intent.facing[2], intent.facing[0])).toBeCloseTo(run.headingRadians, 6);
    expect(Math.hypot(intent.facing[0], intent.facing[2])).toBeCloseTo(run.lengthM, 6);
  });

  it('keeps rejecting an incomplete corridor', () => {
    expect(carpetCorridorIntent(corridor({ x: 1, z: 1 }))).toBeNull();
    expect(CARPET_CORRIDOR_POINT_COUNT).toBe(2);
  });
});
