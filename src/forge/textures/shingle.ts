/**
 * Roof shingle generator (HF-536) - 300 mm courses of 250 mm-wide shingles.
 *
 * Canvas row 0 is v = 1 (top of the tile); course 0 is the topmost course; the exposed
 * lip of each shingle is at the BOTTOM of its course (yLocal near 300), where the edge
 * is lifted +1.7 mm and the reveal below it (top of the next course) sits in shadow.
 * Joints between shingles are offset half a shingle per course (125 mm) and read as a
 * 6 mm keyed slot; the offset period is two courses, so the tile must hold an EVEN
 * number of courses: tileMm % 600 == 0 && tileMm % 250 == 0 (default 3.0 m = 10 courses
 * x 12 shingles).
 *
 * Granules are ~1 mm (sub-texel at 2.9296875 mm/px) and ride speckle plus a resolved
 * 9 mm clump fBM on roughness (granule roughness noise). Per-shingle tone jitter +/-10%.
 */

import { assertPowerOfTwoSize, fieldAt, hash2u, smoothstep, tileableFbm, tileableSpeckle } from './noise';
import { renderTextureSet } from './render';
import type { FamilyShader } from './tile';
import type { TextureSet, TextureSetOptions } from './types';

export const SHINGLE_DEFAULT_METRES_PER_TILE = 3.0;
const COURSE_PITCH_MM = 300;
const SHINGLE_WIDTH_MM = 250;
const JOINT_WIDTH_MM = 6;
const GRAIN_MM = 1.0;

export function generateShingle(options: TextureSetOptions = {}): TextureSet {
  const size = options.size ?? 1024;
  const seed = options.seed ?? 1;
  const metresPerTile = options.metresPerTile ?? SHINGLE_DEFAULT_METRES_PER_TILE;
  assertPowerOfTwoSize(size);
  const tileMm = metresPerTile * 1000;
  const mmPerPx = tileMm / size;
  if (
    tileMm % (COURSE_PITCH_MM * 2) !== 0 ||
    tileMm % SHINGLE_WIDTH_MM !== 0
  ) {
    throw new Error(
      `texture forge: shingle tile must be a multiple of 600 mm and 250 mm, got ${tileMm} mm`,
    );
  }

  const coursesPerTile = tileMm / COURSE_PITCH_MM;
  const columnsPerTile = tileMm / SHINGLE_WIDTH_MM;
  const granCells = Math.max(2, Math.round(tileMm / 9));
  const granules = tileableFbm(size, granCells, 2, seed * 7 + 4);
  const speckle = tileableSpeckle(size, seed * 13 + 6);

  const shader: FamilyShader = (x, y, out) => {
    const xMm = x * mmPerPx;
    const yMm = y * mmPerPx;
    const course = Math.floor(yMm / COURSE_PITCH_MM);
    const yLocal = yMm - course * COURSE_PITCH_MM;
    const offset = (course * (SHINGLE_WIDTH_MM / 2)) % SHINGLE_WIDTH_MM;
    const xs = xMm - offset;
    const column = Math.floor(xs / SHINGLE_WIDTH_MM);
    const xLocal = xs - column * SHINGLE_WIDTH_MM;
    // Wrapped lattice identities: the same physical shingle hashes identically next tile.
    const columnW = ((column % columnsPerTile) + columnsPerTile) % columnsPerTile;
    const courseW = ((course % coursesPerTile) + coursesPerTile) % coursesPerTile;

    const s = fieldAt(speckle, size, x, y);
    const g = fieldAt(granules, size, x, y);

    const tone = 0.27 * (1 + (hash2u(columnW, courseW, seed) - 0.5) * 0.2);
    let r = tone * 0.96 + (g - 0.5) * 0.05 + (s - 0.5) * 0.055;
    let gg = tone * 1.0 + (g - 0.5) * 0.05 + (s - 0.5) * 0.055;
    let b = tone * 0.92 + (g - 0.5) * 0.045 + (s - 0.5) * 0.05;
    let rough = 0.86 + (g - 0.5) * 0.1 + (s - 0.5) * 0.07;
    let height = (s - 0.5) * 0.6 + (g - 0.5) * 0.5;

    // Keyed joint slot between shingles.
    const slot = smoothstep(SHINGLE_WIDTH_MM - JOINT_WIDTH_MM - 1.5, SHINGLE_WIDTH_MM - JOINT_WIDTH_MM + 0.5, xLocal);
    r *= 1 - 0.16 * slot;
    gg *= 1 - 0.16 * slot;
    b *= 1 - 0.15 * slot;
    rough += 0.05 * slot;
    height -= 1.3 * slot;

    // Lifted bottom edge: the lip rises over the last ~26 mm of the course.
    const dBottom = COURSE_PITCH_MM - yLocal;
    const lift = smoothstep(26, 2, dBottom);
    height += 1.7 * lift;
    // Lifted-edge shadow: darkening at the lip and in the reveal just below it.
    const lipShadow = smoothstep(16, 1, dBottom);
    const revealShadow = smoothstep(12, 0, yLocal);
    r *= 1 - 0.2 * lipShadow - 0.24 * revealShadow;
    gg *= 1 - 0.2 * lipShadow - 0.24 * revealShadow;
    b *= 1 - 0.19 * lipShadow - 0.22 * revealShadow;
    height -= 0.8 * revealShadow;

    out[0] = Math.min(0.9, Math.max(0.02, r));
    out[1] = Math.min(0.9, Math.max(0.02, gg));
    out[2] = Math.min(0.9, Math.max(0.02, b));
    out[3] = Math.min(1, Math.max(0.05, rough));
    out[4] = height;
  };

  return renderTextureSet({
    family: 'shingle',
    size,
    seed,
    metresPerTile,
    normalStrength: 1.7,
    originXPx: options.originXPx ?? 0,
    originYPx: options.originYPx ?? 0,
    shader,
    authored: {
      grainMm: GRAIN_MM,
      texelMm: mmPerPx,
      granuleClumpMm: tileMm / granCells,
      coursePitchMm: COURSE_PITCH_MM,
      shingleWidthMm: SHINGLE_WIDTH_MM,
      jointWidthMm: JOINT_WIDTH_MM,
      toneJitterPercent: 10,
      liftMm: 1.7,
    },
  });
}
