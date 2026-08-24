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
