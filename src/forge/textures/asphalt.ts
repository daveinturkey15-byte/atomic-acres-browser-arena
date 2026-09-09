/**
 * Asphalt generator (HF-536) - Nuke Town carriageway.
 *
 * Canvas row 0 is v = 1 (top of the tile); the road runs along +u, wheel paths are the
 * two horizontal 0.5 m bands at quarter and three-quarter height, the tar seam runs the
 * full height of the tile at u ~ 0.3 m. All masks use circular distance in mm, so the
 * family tiles at any metresPerTile; the default 4 m tile carries exactly one 4 m seam
 * period (band 4-8 m).
 *
 * Authored scales (ruleset 1.1): aggregate grain 1.0 mm (0.5-1.5 mm band) - SUB-TEXEL at
 * this tile size (texel = 3.90625 mm at 1024 px / 4 m), so grain is carried by per-pixel
 * speckle amplitude plus its roughness/normal response, which is the honest rendering of
 * sub-texel stone; tonal mottle 667 mm (traffic band 0.5-3 m); seam width 44 mm, albedo
 * step -20%; edge abrasion 190 mm. Anything the frame must show rides albedo steps of
 * 10-30%; roughness is the second layer.
 */

import { assertPowerOfTwoSize, fieldAt, smoothstep, tileableFbm, tileableSpeckle } from './noise';
import { renderTextureSet } from './render';
import { circularDistanceMm, type FamilyShader } from './tile';
import type { TextureSet, TextureSetOptions } from './types';

export const ASPHALT_DEFAULT_METRES_PER_TILE = 4;
const GRAIN_MM = 1.0;
const SEAM_WIDTH_MM = 44;
const POLISH_BAND_MM = 500;
const ABRASION_WIDTH_MM = 190;

export function generateAsphalt(options: TextureSetOptions = {}): TextureSet {
  const size = options.size ?? 1024;
  const seed = options.seed ?? 1;
  const metresPerTile = options.metresPerTile ?? ASPHALT_DEFAULT_METRES_PER_TILE;
  assertPowerOfTwoSize(size);
  const tileMm = metresPerTile * 1000;
  const mmPerPx = tileMm / size;

  // Traffic-scale tonal drift (base wavelength ~667 mm, 4 octaves down to ~83 mm).
  const mottleCells = Math.max(2, Math.round(tileMm / 667));
  const mottle = tileableFbm(size, mottleCells, 4, seed * 7 + 1);
  // Sub-texel aggregate grain: per-pixel speckle (1 mm stones at a 3.9 mm texel).
  const speckle = tileableSpeckle(size, seed * 13 + 5);

  const seamUMm = tileMm * 0.075;
  const polishCentersMm = [tileMm * 0.25, tileMm * 0.75];

  // NIGHT-LOAD (2026-09-08): wheel-path polish is a function of the ROW alone,
  // tar seam and edge abrasion are functions of the COLUMN alone, and every one
  // of them is torus-invariant (circularDistance over a period that divides the
  // tile), so a value tabled at the wrapped index equals the value at any x or
  // y - the wrap probes at x+size / y+size included. That takes three
  // circularDistance calls and four smoothsteps per pixel out of the hot loop.
  // Values, expression shape and evaluation order are unchanged; the
  // byte-identity and neighbour-tile proofs in textures.test.ts pin that.
  const rowPolish = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const vMm = i * mmPerPx;
    const vToBand0 = circularDistanceMm(vMm, polishCentersMm[0], tileMm);
    const vToBand1 = circularDistanceMm(vMm, polishCentersMm[1], tileMm);
    const vNearest = Math.min(vToBand0, vToBand1);
    rowPolish[i] = 1 - smoothstep(POLISH_BAND_MM * 0.46, POLISH_BAND_MM * 0.54, vNearest);
  }
  const colSeamCore = new Float64Array(size);
  const colSeamEdge = new Float64Array(size);
  const colAbrasion = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const uMm = i * mmPerPx;
    const dSeam = circularDistanceMm(uMm, seamUMm, tileMm);
    colSeamCore[i] = 1 - smoothstep(SEAM_WIDTH_MM * 0.32, SEAM_WIDTH_MM * 0.5, dSeam);
    colSeamEdge[i] = 1 - smoothstep(SEAM_WIDTH_MM * 0.4, SEAM_WIDTH_MM * 0.8, dSeam);
    const dEdge = circularDistanceMm(uMm, 0, tileMm);
    colAbrasion[i] = 1 - smoothstep(ABRASION_WIDTH_MM * 0.63, ABRASION_WIDTH_MM, dEdge);
  }

  const shader: FamilyShader = (x, y, out) => {
    const s = fieldAt(speckle, size, x, y);
    const m = fieldAt(mottle, size, x, y);

    let albedo = 0.252 + (m - 0.5) * 0.055;
    let rough = 0.95 + (m - 0.5) * 0.05;
    let grainAmp = 1;

    // Wheel-path polish: roughness -0.25 across two 0.5 m bands (traffic scale).
    const polish = rowPolish[y & (size - 1)];
    rough -= 0.25 * polish;
    albedo *= 1 - 0.06 * polish;
    grainAmp -= 0.55 * polish;

    // Tar seam: -20% albedo, slightly glossier, trough in height, crumbled edges.
    const seamCore = colSeamCore[x & (size - 1)];
    const seamEdge = colSeamEdge[x & (size - 1)];
    albedo *= 1 - 0.2 * seamCore;
    rough -= 0.22 * seamCore;
    grainAmp += 1.2 * seamEdge * (1 - seamCore);

    // Edge abrasion near u = 0: raveled, lighter, rougher aggregate.
    const abrasion = colAbrasion[x & (size - 1)];
    albedo += 0.05 * abrasion * (s - 0.3);
    rough += 0.07 * abrasion;
    grainAmp += 1.4 * abrasion;

    // Aggregate speckle: stone/binder contrast rides albedo (10-30% steps), then roughness.
    albedo += (s - 0.5) * 0.13 * grainAmp;
    rough += (s - 0.5) * 0.08 * grainAmp;

    const heightMm =
      (s - 0.5) * 2.2 * grainAmp - 1.8 * seamCore + (m - 0.5) * 1.2;

    out[0] = Math.min(0.9, Math.max(0.02, albedo));
    out[1] = out[0];
    out[2] = Math.min(0.92, Math.max(0.02, albedo * 1.04));
    out[3] = Math.min(1, Math.max(0.05, rough));
    out[4] = heightMm;
  };

  return renderTextureSet({
    family: 'asphalt',
    size,
    seed,
    metresPerTile,
    normalStrength: 1.3,
    originXPx: options.originXPx ?? 0,
    originYPx: options.originYPx ?? 0,
    shader,
    authored: {
      grainMm: GRAIN_MM,
      texelMm: mmPerPx,
      seamPeriodM: metresPerTile,
      seamWidthMm: SEAM_WIDTH_MM,
      polishBandMm: POLISH_BAND_MM,
      polishGapM: (metresPerTile * 0.5),
      abrasionWidthMm: ABRASION_WIDTH_MM,
      mottleBaseMm: tileMm / mottleCells,
    },
  });
}
