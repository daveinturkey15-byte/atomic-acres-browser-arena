/**
 * farcrysis-constants.ts — Shared arena constants (leaf module, no imports from farcrysis.ts).
 *
 * Extracted to break a circular import chain between the arena entry point and
 * its art layer. The third link in that chain, farcrysis-terrain.ts, no longer
 * exists: the terrain was re-authored inline in farcrysis-art.ts when the
 * module version stopped booting, and the orphan sat unreferenced for several
 * passes afterwards. This module stays a leaf regardless - that is the point.
 */

import type { Box2 } from './collision';

export const FARCRYSIS_BOUNDS: Readonly<Box2> = Object.freeze({
  // HF-396: island grown from +/-32 m (64 m across, 4096 m^2) to +/-64 m
  // (128 m across, 16384 m^2) - exactly 4x the playfield area. Every
  // consumer derives geometry from this box (terrain authority ARENA_HALF,
  // physics plates, bot platform grid, vegetation rings, bound walls), so
  // this one constant is the whole linear rescale.
  minX: -64,
  maxX: 64,
  minZ: -64,
  maxZ: 64,
});

export const FARCRYSIS_MAX_SIGHTLINE = 22;
export const FARCRYSIS_COVER_MIN = 14;

/**
 * The authored spawn table, x/z only — the SINGLE source both `buildFarcrysis`
 * (which seats each point on the terrain authority) and the vegetation layer
 * (which keeps its foliage off them) read.
 *
 * PASS 85 Lane R. These lived in two places: the real table in farcrysis.ts and
 * a hand-copied `SPAWNS_ALL` in farcrysis-vegetation.ts whose own comment said
 * "kept in sync with buildFarcrysis - update both together when spawns move".
 * It was not: moving the table off the beach corners immediately put an
 * undergrowth card 2.68 m from a spawn against a 3.19 m clearance rule, and
 * that is the failure mode a hand-kept duplicate always has. This module is the
 * arena's designated leaf (no imports from farcrysis.ts), so both sides can
 * derive from it without a cycle.
 *
 * Solved by `npx tsx scripts/qa/solve-farcrysis-spawns.ts` against the HF-402
 * constraint set; see src/farcrysis-spawns.test.ts for what they are held to.
 */
export const FARCRYSIS_SPAWNS_XZ: Readonly<Record<0 | 1, ReadonlyArray<readonly [number, number]>>> = Object.freeze({
  0: Object.freeze([
    [-36, -22], [-8, -26], [-26, -8], [-26, -34], [-20, -20], [-32, -14], [-34, -32], [-28, -26],
  ] as ReadonlyArray<readonly [number, number]>),
  1: Object.freeze([
    [26, 34], [32, 2], [2, 46], [44, 18], [24, 18], [16, 42], [34, 32], [28, 26],
  ] as ReadonlyArray<readonly [number, number]>),
});

/** Both tables in one list, for the clearance queries that do not care about sides. */
export const FARCRYSIS_SPAWNS_ALL: ReadonlyArray<readonly [number, number]> = Object.freeze([
  ...FARCRYSIS_SPAWNS_XZ[0],
  ...FARCRYSIS_SPAWNS_XZ[1],
]);

/**
 * Bot patrol anchors, x/z only — the same de-duplication as the spawn table:
 * farcrysis.ts built `patrolPoints` from one literal and
 * farcrysis-vegetation.ts kept a second copy as `PATROL_PTS`.
 */
export const FARCRYSIS_PATROL_XZ: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-52, -52], [-36, -40], [-24, -32], [-8, -24], [0, 0], [24, 32], [36, 40], [52, 52],
  [-40, 36], [40, -36], [-16, -48], [16, 48],
]);
