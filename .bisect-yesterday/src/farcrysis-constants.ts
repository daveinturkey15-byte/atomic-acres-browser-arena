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
  minX: -32,
  maxX: 32,
  minZ: -32,
  maxZ: 32,
});

export const FARCRYSIS_MAX_SIGHTLINE = 22;
export const FARCRYSIS_COVER_MIN = 14;
