/**
 * Shared types for the procedural PBR texture forge (HF-536).
 *
 * All generators are pure TypeScript over typed arrays - no DOM at generation time - so
 * the same code runs in a Worker on OffscreenCanvas, or in Node under vitest.
 *
 * Canvas row 0 is v = 1 (the TOP of the tile); gravity points towards increasing row.
 * Albedo values are display-space (sRGB) in [0, 1]; height is authored in millimetres
 * against a `metresPerTile` parameter; roughness is linear [0, 1].
 */

import type { FamilyShader } from './tile';

export type TextureFamily = 'asphalt' | 'brick' | 'lapSiding' | 'shingle' | 'concrete';

export interface TextureSetOptions {
  /** Tile edge in pixels, power of two. Default 1024. */
  size?: number;
  /** Deterministic seed. Default 1. */
  seed?: number;
  /** Real-world metres covered by one tile. Default is per family (see each generator). */
  metresPerTile?: number;
  /**
   * Pixel origin offset (wrap proof): rendering the neighbouring tile must be
   * byte-identical because every pattern is periodic in the tile. Default 0.
   */
  originXPx?: number;
  originYPx?: number;
  /** lapSiding only: sill line position as a tile fraction from the top, 0..1. Default 0.35. */
  sillV?: number;
}

export interface TextureSet {
  family: TextureFamily;
  size: number;
  seed: number;
  metresPerTile: number;
  mmPerPx: number;
  /** RGBA, sRGB-encoded display values, length 4 * size * size. */
  albedo: Uint8ClampedArray;
  /** RGBA tangent-space normal map (X +u, Y +v up, Z out), length 4 * size * size. */
  normal: Uint8ClampedArray;
  /** Single-channel (RedFormat DataTexture input), length size * size. */
  roughness: Uint8ClampedArray;
  /** Height field in millimetres, length size * size. */
  heightMm: Float32Array;
  /** Decoded-normal z > 0.92 fraction, exposed for the "mostly +Z" proof. */
  fractionMostlyZ: number;
  /** Measured (not intended) feature scales and generator wall time in ms. */
  authored: Readonly<Record<string, number>>;
  generateMs: number;
}

export interface FamilyRenderPlan {
  family: TextureFamily;
  size: number;
  seed: number;
  metresPerTile: number;
  normalStrength: number;
  originXPx: number;
  originYPx: number;
  shader: FamilyShader;
  /** Measured feature scales in mm/m, asserted against the ruleset bands by tests. */
  authored: Readonly<Record<string, number>>;
}
