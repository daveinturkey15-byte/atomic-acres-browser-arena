/**
 * Shared render driver for the texture forge (HF-536): samples a family shader into the
 * four PBR buffers, proves the wrap on every generation, and derives the tangent-space
 * normal map from the millimetre height field. Runs unchanged in Node and in a Worker.
 */

import { normalFromHeight } from './normalFromHeight';
import {
  SLOT_ALBEDO_B,
  SLOT_ALBEDO_G,
  SLOT_ALBEDO_R,
  SLOT_HEIGHT_MM,
  SLOT_ROUGHNESS,
  SHADER_SLOTS,
  assertShaderWraps,
} from './tile';
import type { FamilyRenderPlan, TextureSet } from './types';

export function renderTextureSet(plan: FamilyRenderPlan): TextureSet {
  const started = performance.now();
  const { size, shader } = plan;
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size);
  const heightMm = new Float32Array(size * size);
  const scratch = new Float64Array(SHADER_SLOTS);
  for (let py = 0; py < size; py++) {
    const row = py * size;
    const sampleY = py + plan.originYPx;
    for (let px = 0; px < size; px++) {
      shader(px + plan.originXPx, sampleY, scratch);
      const i = row + px;
      const o = i * 4;
      albedo[o] = scratch[SLOT_ALBEDO_R] * 255;
      albedo[o + 1] = scratch[SLOT_ALBEDO_G] * 255;
      albedo[o + 2] = scratch[SLOT_ALBEDO_B] * 255;
      albedo[o + 3] = 255;
      roughness[i] = scratch[SLOT_ROUGHNESS] * 255;
      heightMm[i] = scratch[SLOT_HEIGHT_MM];
    }
  }
  // Fail loud, every generation: a seam here ships a visibly repeating edge.
  assertShaderWraps(shader, size);
  const mmPerPx = (plan.metresPerTile * 1000) / size;
  const normal = normalFromHeight(heightMm, size, mmPerPx, plan.normalStrength);
  return {
    family: plan.family,
    size,
    seed: plan.seed,
    metresPerTile: plan.metresPerTile,
    mmPerPx,
    albedo,
    normal: normal.rgba,
    roughness,
    heightMm,
    fractionMostlyZ: normal.fractionMostlyZ,
    authored: plan.authored,
    generateMs: performance.now() - started,
  };
}
