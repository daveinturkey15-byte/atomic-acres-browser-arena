/**
 * farcrysis-constants.ts — Shared arena constants (leaf module, no imports from farcrysis.ts).
 *
 * Extracted to break the circular import chain:
 *   farcrysis.ts → farcrysis-art.ts → farcrysis-terrain.ts → farcrysis.ts
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
