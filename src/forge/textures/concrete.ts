/**
 * Concrete generator (HF-536) - apron/slab with float marks and expansion joints.
 *
 * Canvas row 0 is v = 1 (top of the tile); gravity is increasing row (irrelevant here -
 * concrete carries no height-directed feature except staining, which is isotropic).
 * Expansion joints run along u every 1.5 m (6 mm wide, recessed 8 mm); float marks are
 * two crossed anisotropic fBMs (34-72 mm, scuff band 20-80 mm) blended per-pixel; light
 * staining is a 1.1 m fBM (traffic band); aggregate specks are 1-2 px dark/light pops.
 * Tile must hold an integer number of joint periods: tileMm % 1500 == 0
 * (default 3.0 m = two joints).
 */

import {
  assertPowerOfTwoSize,
  fieldAt,
  smoothstep,
  tileableFbm,
  tileableSpeckle,
  tileableValueNoiseAniso,
} from './noise';
import { renderTextureSet } from './render';
import type { FamilyShader } from './tile';
import type { TextureSet, TextureSetOptions } from './types';

export const CONCRETE_DEFAULT_METRES_PER_TILE = 3.0;
const JOINT_EVERY_MM = 1500;
const JOINT_WIDTH_MM = 6;
const JOINT_DEPTH_MM = 8;

export function generateConcrete(options: TextureSetOptions = {}): TextureSet {
  const size = options.size ?? 1024;
  const seed = options.seed ?? 1;
  const metresPerTile = options.metresPerTile ?? CONCRETE_DEFAULT_METRES_PER_TILE;
  assertPowerOfTwoSize(size);
  const tileMm = metresPerTile * 1000;
  const mmPerPx = tileMm / size;
  if (tileMm % JOINT_EVERY_MM !== 0) {
    throw new Error(
      `texture forge: concrete tile must be a multiple of 1500 mm, got ${tileMm} mm`,
    );
  }

  // Crossed float-mark fields (anisotropic: elongated trowel arcs).
  const floatACellsU = Math.max(2, Math.round(tileMm / 70));
  const floatACellsV = Math.max(2, Math.round(tileMm / 34));
  const floatBCellsU = Math.max(2, Math.round(tileMm / 38));
  const floatBCellsV = Math.max(2, Math.round(tileMm / 72));
  const floatA = tileableValueNoiseAniso(size, floatACellsU, floatACellsV, seed * 7 + 6);
  const floatB = tileableValueNoiseAniso(size, floatBCellsU, floatBCellsV, seed * 11 + 8);
  const blend = tileableFbm(size, Math.max(2, Math.round(tileMm / 900)), 2, seed * 17 + 10);
  const stain = tileableFbm(size, Math.max(2, Math.round(tileMm / 1100)), 3, seed * 23 + 12);
  const speckle = tileableSpeckle(size, seed * 31 + 14);

  const shader: FamilyShader = (x, y, out) => {
    const yMm = y * mmPerPx;
    const s = fieldAt(speckle, size, x, y);
    const mixV = fieldAt(blend, size, x, y);
    const floatMark =
      fieldAt(floatA, size, x, y) * (1 - mixV) + fieldAt(floatB, size, x, y) * mixV;
    const stainV = fieldAt(stain, size, x, y);

    let r = 0.585 + (floatMark - 0.5) * 0.05 + (stainV - 0.5) * 0.07;
    let g = 0.58 + (floatMark - 0.5) * 0.05 + (stainV - 0.5) * 0.07 + (stainV - 0.5) * 0.012;
    let b = 0.565 + (floatMark - 0.5) * 0.048 + (stainV - 0.5) * 0.065;
    let rough = 0.66 + (floatMark - 0.5) * 0.07 + (stainV - 0.5) * 0.09;
    let height = (floatMark - 0.5) * 1.0 + (s - 0.5) * 0.12;

    // Aggregate specks: sparse dark pops and rarer light pops (1-2 px).
    if (s > 0.968) {
      r *= 0.82;
      g *= 0.82;
      b *= 0.82;
      rough += 0.08;
      height -= 0.3;
    } else if (s < 0.018) {
      r *= 1.1;
      g *= 1.1;
      b *= 1.08;
      height += 0.18;
    }

    // Expansion joints every 1.5 m: circular distance, so joints may sit on the seam.
    const yJoint = yMm % JOINT_EVERY_MM;
    const dJoint = Math.min(yJoint, JOINT_EVERY_MM - yJoint);
    const joint = 1 - smoothstep(JOINT_WIDTH_MM * 0.42, JOINT_WIDTH_MM * 0.75, dJoint);
    if (joint > 0) {
      r *= 1 - 0.1 * joint;
      g *= 1 - 0.1 * joint;
      b *= 1 - 0.09 * joint;
      rough += 0.06 * joint;
      height = height * (1 - joint) - JOINT_DEPTH_MM * joint;
      // Slightly crumbled joint arris.
      const arris = 1 - smoothstep(JOINT_WIDTH_MM * 0.7, 14, dJoint);
      height += (s - 0.5) * 1.2 * arris;
    }

    out[0] = Math.min(0.9, Math.max(0.02, r));
    out[1] = Math.min(0.9, Math.max(0.02, g));
    out[2] = Math.min(0.9, Math.max(0.02, b));
    out[3] = Math.min(1, Math.max(0.05, rough));
    out[4] = height;
  };

  return renderTextureSet({
    family: 'concrete',
    size,
    seed,
    metresPerTile,
    normalStrength: 1.2,
    originXPx: options.originXPx ?? 0,
    originYPx: options.originYPx ?? 0,
    shader,
    authored: {
      texelMm: mmPerPx,
      floatMarkLongMm: tileMm / floatACellsU,
      floatMarkShortMm: tileMm / floatACellsV,
      stainMm: tileMm / Math.max(2, Math.round(tileMm / 1100)),
      jointEveryMm: JOINT_EVERY_MM,
      jointWidthMm: JOINT_WIDTH_MM,
      jointDepthMm: JOINT_DEPTH_MM,
      speckRatePercent: 5,
    },
  });
}
