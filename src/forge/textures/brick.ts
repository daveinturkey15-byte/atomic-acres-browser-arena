/**
 * Brick generator (HF-536) - running bond 215 x 65 mm with 10 mm mortar.
 *
 * Canvas row 0 is v = 1 (top of the tile): course 0 is the TOPMOST course, courses run
 * downwards with increasing row index. The mortar bed is recessed 3 mm in height;
 * per-brick tone jitter is +/-12% (band 8-15%); ~14% of bricks carry one chipped corner
 * (9-19 mm chip, scuff scale); mortar carries large-scale staining.
 *
 * Tileability: the tile must contain an integer number of courses AND an even number of
 * courses (the half-brick running-bond offset has period two courses), plus an integer
 * number of 225 mm runs: validated as tileMm % 225 == 0 && tileMm % 150 == 0. Default
 * 1.8 m = 24 courses x 8 bricks. Grain (0.6 mm clay) is sub-texel (1.7578125 mm/px) and
 * rides speckle amplitude; measured facts are in `authored`.
 */

import { assertPowerOfTwoSize, fieldAt, hash2u, smoothstep, tileableFbm, tileableSpeckle } from './noise';
import { renderTextureSet } from './render';
import type { FamilyShader } from './tile';
import type { TextureSet, TextureSetOptions } from './types';

export const BRICK_DEFAULT_METRES_PER_TILE = 1.8;
const COURSE_PITCH_MM = 75; // 65 brick + 10 mortar
const RUN_PITCH_MM = 225; // 215 brick + 10 joint
const MORTAR_DEPTH_MM = 3;
const GRAIN_MM = 0.6;

export function generateBrick(options: TextureSetOptions = {}): TextureSet {
  const size = options.size ?? 1024;
  const seed = options.seed ?? 1;
  const metresPerTile = options.metresPerTile ?? BRICK_DEFAULT_METRES_PER_TILE;


  assertPowerOfTwoSize(size);
  const tileMm = metresPerTile * 1000;
  const mmPerPx = tileMm / size;
  if (tileMm % RUN_PITCH_MM !== 0 || tileMm % (COURSE_PITCH_MM * 2) !== 0) {
    throw new Error(
      `texture forge: brick tile must be a multiple of 225 mm and 150 mm, got ${tileMm} mm`,
    );
  }
const coursesPerTile = tileMm / COURSE_PITCH_MM;
const columnsPerTile = tileMm / RUN_PITCH_MM;

  const stainCells = Math.max(2, Math.round(tileMm / 240));
  const mortarStain = tileableFbm(size, stainCells, 2, seed * 11 + 3);
  const reliefCells = Math.max(2, Math.round(tileMm / 85));
  const faceRelief = tileableFbm(size, reliefCells, 2, seed * 17 + 9);
  const speckle = tileableSpeckle(size, seed * 23 + 7);

  const shader: FamilyShader = (x, y, out) => {
    const xMm = x * mmPerPx;
    const yMm = y * mmPerPx;
    const course = Math.floor(yMm / COURSE_PITCH_MM);
    const yLocal = yMm - course * COURSE_PITCH_MM;
    const offset = (course * (RUN_PITCH_MM / 2)) % RUN_PITCH_MM;
    const xs = xMm - offset;
    const column = Math.floor(xs / RUN_PITCH_MM);
    const xLocal = xs - column * RUN_PITCH_MM;
    // Wrap lattice identities so the SAME physical brick hashes identically in the
    // neighbouring tile (the wrap gate fails loud otherwise).
    const columnW = ((column % columnsPerTile) + columnsPerTile) % columnsPerTile;
    const courseW = ((course % coursesPerTile) + coursesPerTile) % coursesPerTile;

    const s = fieldAt(speckle, size, x, y);

    if (yLocal < 65 && xLocal < 215) {
      // Brick face.
      const toneH = hash2u(columnW, courseW, seed);
      const tiltH = hash2u(columnW, courseW, seed ^ 0x5bd1);
      const chipH = hash2u(columnW, courseW, seed ^ 0x1b56);
      const tone = 0.52 * (1 + (toneH - 0.5) * 0.24);
      let r = tone * 1.045 + (s - 0.5) * 0.036;
      let g = tone * 0.7 + (s - 0.5) * 0.03;
      let b = tone * 0.585 + (s - 0.5) * 0.026;
      let rough = 0.66 + (s - 0.5) * 0.06;
      let height =
        (tiltH - 0.5) * 0.5 * ((xLocal - 107.5) / 107.5) +
        (s - 0.5) * 0.7 +
        (fieldAt(faceRelief, size, x, y) - 0.5) * 0.8;

      // Chipped corner: one per ~14% of bricks, 9-19 mm quarter-disc.
      if (chipH > 0.86) {
        const cornerH = hash2u(columnW, courseW, seed ^ 0x77aa);
        const radius = 9 + 10 * hash2u(columnW, courseW, seed ^ 0x9931);
        const corner = Math.floor(cornerH * 4);
        const cx = (corner & 1) !== 0 ? 215 : 0;
        const cy = (corner & 2) !== 0 ? 65 : 0;
        const dc = Math.hypot(xLocal - cx, yLocal - cy);
        const chip = 1 - smoothstep(radius * 0.5, radius, dc);
        if (chip > 0) {
          r *= 1 + 0.14 * chip;
          g *= 1 + 0.13 * chip;
          b *= 1 + 0.12 * chip;
          rough += 0.16 * chip;
          height -= 1.7 * chip;
        }
      }

      // Rolled arris: the face eases into the mortar recess over ~1.8 mm.
      const dEdge = Math.min(xLocal, 215 - xLocal, yLocal, 65 - yLocal);
      const bevel = smoothstep(0, 1.8, dEdge);
      height = -2.2 + (height + 2.2) * bevel;

      out[0] = Math.min(0.9, Math.max(0.02, r));
      out[1] = Math.min(0.9, Math.max(0.02, g));
      out[2] = Math.min(0.9, Math.max(0.02, b));
      out[3] = Math.min(1, Math.max(0.05, rough));
      out[4] = height;
      return;
    }

    // Mortar: recessed 3 mm, stained, slightly warmer than the average brick.
    const stain = fieldAt(mortarStain, size, x, y);
    const base = 0.6 * (1 - stain * 0.22);
    out[0] = Math.min(0.9, Math.max(0.02, base * 1.02 + (s - 0.5) * 0.03));
    out[1] = Math.min(0.9, Math.max(0.02, base + (s - 0.5) * 0.03));
    out[2] = Math.min(0.9, Math.max(0.02, base * 0.96 + (s - 0.5) * 0.03));
    out[3] = Math.min(1, Math.max(0.05, 0.8 + (s - 0.5) * 0.05));
    out[4] = -MORTAR_DEPTH_MM + (s - 0.5) * 0.5 + (stain - 0.5) * 0.3;
  };

  return renderTextureSet({
    family: 'brick',
    size,
    seed,
    metresPerTile,
    normalStrength: 1.6,
    originXPx: options.originXPx ?? 0,
    originYPx: options.originYPx ?? 0,
    shader,
    authored: {
      grainMm: GRAIN_MM,
      texelMm: mmPerPx,
      brickMm: 215,
      coursePitchMm: COURSE_PITCH_MM,
      mortarMm: 10,
      mortarDepthMm: MORTAR_DEPTH_MM,
      toneJitterPercent: 12,
      chipRatePercent: 14,
      mortarStainMm: tileMm / stainCells,
    },
  });
}
