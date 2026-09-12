/**
 * Tile-wrap proof for the texture forge (HF-536).
 *
 * A buffer of width W is trivially "periodic"; the meaningful seam test is that the
 * GENERATOR is periodic: shading pixel (x + size, y) must reproduce (x, y). We prove it
 * two ways, both mechanical:
 *
 * 1. `assertShaderWraps` - samples the family shader one full tile to the right of and
 *    below the tile and requires left==right / top==bottom within 1/255 (quantisation
 *    step), i.e. the content that would sit past the right edge equals the left edge.
 * 2. `assertBuffersEqual` - the driver can render with a pixel origin offset of exactly
 *    (size, size); periodicity makes that neighbouring tile byte-identical.
 *
 * Canvas row 0 is v = 1 (top of the tile). Gravity points towards INCREASING row index.
 * Every generator that places a feature by height states this in its header comment.
 */

import { assertPowerOfTwoSize } from './noise';

/** Shader output slots written by every family shader (allocation-free scratch). */
export const SHADER_SLOTS = 5;
export const SLOT_ALBEDO_R = 0;
export const SLOT_ALBEDO_G = 1;
export const SLOT_ALBEDO_B = 2;
export const SLOT_ROUGHNESS = 3;
export const SLOT_HEIGHT_MM = 4;

/**
 * A family shader shades one texel. It receives pixel coordinates that may lie outside
 * [0, size) only through the wrap probes below; fields must be read with `fieldAt`
 * (bitwise wrap, size is a power of two). Writes [albedoR, albedoG, albedoB, roughness,
 * heightMm] into `out`; albedo and roughness are display-space [0, 1]; height is in mm.
 */
export type FamilyShader = (x: number, y: number, out: Float64Array) => void;

/**
 * Circular distance in millimetres on the torus: every mask authored this way tiles at
 * ANY metresPerTile, because features may straddle the seam without breaking the wrap.
 */
export function circularDistanceMm(a: number, b: number, tileMm: number): number {
  const d = Math.abs(a - b) % tileMm;
  return d > tileMm * 0.5 ? tileMm - d : d;
}

const TOLERANCE = 1 / 255;

/**
 * left==right / top==bottom: shading at x + size must equal shading at x (and y + size
 * at y) within one quantisation step, sampled on a deterministic probe grid.
 */
export function assertShaderWraps(shader: FamilyShader, size: number, probes = 97): void {
  assertPowerOfTwoSize(size);
  const a = new Float64Array(SHADER_SLOTS);
  const b = new Float64Array(SHADER_SLOTS);
  for (let i = 0; i < probes; i++) {
    const x = Math.floor((i * size) / probes);
    const y = Math.floor(((i * 31 + 7) % probes) * size / probes);
    shader(x, y, a);
    shader(x + size, y, b);
    for (let s = 0; s < SHADER_SLOTS; s++) {
      if (Math.abs(a[s] - b[s]) > TOLERANCE) {
        throw new Error(
          `texture forge: horizontal wrap violated at probe (${x}, ${y}) slot ${s}: ${a[s]} vs ${b[s]}`,
        );
      }
    }
    shader(x, y, a);
    shader(x, y + size, b);
    for (let s = 0; s < SHADER_SLOTS; s++) {
      if (Math.abs(a[s] - b[s]) > TOLERANCE) {
        throw new Error(
          `texture forge: vertical wrap violated at probe (${x}, ${y}) slot ${s}: ${a[s]} vs ${b[s]}`,
        );
      }
    }
  }
}

/** Byte-exact comparison for the offset-tile determinism/wrap proof. */
export function assertBuffersEqual(
  a: Uint8ClampedArray | Float32Array,
  b: Uint8ClampedArray | Float32Array,
  what: string,
): void {
  if (a.length !== b.length) {
    throw new Error(`texture forge: ${what} length mismatch ${a.length} vs ${b.length}`);
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      throw new Error(`texture forge: ${what} differ at index ${i}: ${a[i]} vs ${b[i]}`);
    }
  }
}
