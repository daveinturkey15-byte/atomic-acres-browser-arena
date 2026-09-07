/**
 * Lap siding generator (HF-536) - 220 mm courses with a 12 mm shadow gap.
 *
 * Canvas row 0 is v = 1 (top of the tile); gravity points towards INCREASING row, so
 * course 0 is the topmost board and each board's shadow gap sits at the BOTTOM of its
 * 220 mm course (yLocal in [208, 220)). Drip streaks run DOWNWARDS from the sill line
 * parameter `sillV` (tile fraction from the top, default 0.35): "below the sill" means
 * larger y (larger row index).
 *
 * Authored scales: wood grain 1.2 mm along/across the course (0.5-1.5 mm band) - SUB-TEXEL
 * at 1.71875 mm/px, carried by speckle plus resolved elongated ridges at 3.4 mm pitch
 * (2 px) running along the course; paint-wear blotches 55 mm and 45 mm edge bands
 * (scuff band 20-80 mm); per-course paint batch jitter +/-2.5%. Tile must hold an integer
 * number of courses: tileMm % 220 == 0 (default 1.76 m = 8 courses).
 */

import {
  assertPowerOfTwoSize,
  fieldAt,
  hash2u,
  smoothstep,
  tileableFbm,
  tileableSpeckle,
  tileableValueNoiseAniso,
} from './noise';
import { renderTextureSet } from './render';
import { circularDistanceMm, type FamilyShader } from './tile';
import type { TextureSet, TextureSetOptions } from './types';

export const LAP_SIDING_DEFAULT_METRES_PER_TILE = 1.76;
const COURSE_PITCH_MM = 220;
const SHADOW_GAP_MM = 12;
const GRAIN_MM = 1.2;
const WEAR_BLOTCH_MM = 55;
const WEAR_EDGE_BAND_MM = 45;

export function generateLapSiding(options: TextureSetOptions = {}): TextureSet {
  const size = options.size ?? 1024;
  const seed = options.seed ?? 1;
  const metresPerTile = options.metresPerTile ?? LAP_SIDING_DEFAULT_METRES_PER_TILE;
  const sillV = options.sillV ?? 0.35;
  assertPowerOfTwoSize(size);
  if (sillV < 0 || sillV > 1) {
    throw new Error(`texture forge: lapSiding sillV must be in [0, 1], got ${sillV}`);
  }
  const tileMm = metresPerTile * 1000;
  const coursesPerTile = tileMm / COURSE_PITCH_MM;
  const mmPerPx = tileMm / size;
  if (tileMm % COURSE_PITCH_MM !== 0) {
    throw new Error(
      `texture forge: lapSiding tile must be a multiple of 220 mm, got ${tileMm} mm`,
    );
  }

  // Wood grain: ridges elongated ALONG the course (few cells along u, many across v).
  const ridgeCellsV = Math.max(2, Math.round(tileMm / 3.4));
  const ridgeCellsU = Math.max(2, Math.round(tileMm / 80));
  const ridges = tileableValueNoiseAniso(size, ridgeCellsU, ridgeCellsV, seed * 7 + 2);
  const speckle = tileableSpeckle(size, seed * 13 + 11);
  // Paint-wear blotches at scuff scale.
  const wearCells = Math.max(2, Math.round(tileMm / WEAR_BLOTCH_MM));
  const wear = tileableFbm(size, wearCells, 2, seed * 19 + 5);
  // Drip-streak columns: ~64 mm spacing, nearly constant along v.
  const streakCellsU = Math.max(2, Math.round(tileMm / 64));
  const streaks = tileableValueNoiseAniso(size, streakCellsU, 2, seed * 29 + 13);

  const sillYMm = sillV * tileMm;

  const shader: FamilyShader = (x, y, out) => {
    const yMm = y * mmPerPx;
    const course = Math.floor(yMm / COURSE_PITCH_MM);
    const yLocal = yMm - course * COURSE_PITCH_MM;
    const courseW = ((course % coursesPerTile) + coursesPerTile) % coursesPerTile;
    const s = fieldAt(speckle, size, x, y);
    const ridge = fieldAt(ridges, size, x, y);

    if (yLocal >= COURSE_PITCH_MM - SHADOW_GAP_MM) {
      // Shadow gap: the height step under the lap overlap.
      out[0] = 0.36;
      out[1] = 0.335;
      out[2] = 0.3;
      out[3] = 0.6;
      out[4] = -6 + (s - 0.5) * 0.15;
      return;
    }


    // Painted board face with per-course batch tone jitter (wrapped course identity).
    const batch = 0.66 * (1 + (hash2u(0, courseW, seed) - 0.5) * 0.05);
    let r = batch * 1.06;
    let g = batch * 1.0;
    let b = batch * 0.9;
    let rough = 0.52;
    let height = (ridge - 0.5) * 0.9 + (s - 0.5) * 0.22;

    // Paint wear at course edges (scuff scale blotches, strongest at the bottom edge).
    const edgeBand = Math.max(
      smoothstep(COURSE_PITCH_MM - SHADOW_GAP_MM - WEAR_EDGE_BAND_MM, COURSE_PITCH_MM - SHADOW_GAP_MM - 4, yLocal),
      0.25 * smoothstep(26, 2, yLocal),
    );
    const worn = smoothstep(0.52, 0.74, fieldAt(wear, size, x, y)) * edgeBand;
    r = r * (1 - worn) + 0.44 * worn;
    g = g * (1 - worn) + 0.34 * worn;
    b = b * (1 - worn) + 0.245 * worn;
    rough += 0.28 * worn;
    height -= 0.15 * worn;

    // Wood grain: stronger where the paint is gone; ridges run along the course.
    const grainAmt = 0.05 + 0.1 * worn;
    r += (ridge - 0.5) * grainAmt + (s - 0.5) * (0.02 + 0.04 * worn);
    g += (ridge - 0.5) * grainAmt + (s - 0.5) * (0.02 + 0.04 * worn);
    b += (ridge - 0.5) * grainAmt * 0.9 + (s - 0.5) * (0.02 + 0.04 * worn);
    // Drip streaks below the sill line: depth is measured on the TORUS so the streak
    // field is periodic (the neighbouring tile sees the same depth below its sill).
    const dBelow = ((yMm - sillYMm) % tileMm + tileMm) % tileMm;
    if (dBelow > 0) {
      const fall = Math.exp(-dBelow / 240) * (1 - smoothstep(320, 520, dBelow));
      const streakCols = smoothstep(0.62, 0.78, fieldAt(streaks, size, x, y));
      const streak = streakCols * fall;
      r *= 1 - 0.14 * streak;
      g *= 1 - 0.14 * streak;
      b *= 1 - 0.13 * streak;
      rough += 0.1 * streak;
    }
    // The sill line itself: 8 mm darker band.
    const dSill = circularDistanceMm(yMm, sillYMm, tileMm);
    const sillBand = 1 - smoothstep(4, 11, dSill);
    r *= 1 - 0.1 * sillBand;
    g *= 1 - 0.1 * sillBand;
    b *= 1 - 0.09 * sillBand;

    out[0] = Math.min(0.9, Math.max(0.02, r));
    out[1] = Math.min(0.9, Math.max(0.02, g));
    out[2] = Math.min(0.9, Math.max(0.02, b));
    out[3] = Math.min(1, Math.max(0.05, rough));
    out[4] = height - 0.6 * sillBand;
  };

  return renderTextureSet({
    family: 'lapSiding',
    size,
    seed,
    metresPerTile,
    normalStrength: 1.1,
    originXPx: options.originXPx ?? 0,
    originYPx: options.originYPx ?? 0,
    shader,
    authored: {
      grainMm: GRAIN_MM,
      texelMm: mmPerPx,
      resolvedRidgePitchMm: tileMm / ridgeCellsV,
      coursePitchMm: COURSE_PITCH_MM,
      shadowGapMm: SHADOW_GAP_MM,
      wearBlotchMm: tileMm / wearCells,
      wearEdgeBandMm: WEAR_EDGE_BAND_MM,
      streakColumnMm: tileMm / streakCellsU,
      sillV,
    },
  });
}
