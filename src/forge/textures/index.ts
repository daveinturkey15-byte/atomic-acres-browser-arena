/**
 * Texture forge entry point (HF-536): deterministic, tileable PBR texture sets generated
 * in code for Nuke Town surfaces. Pure TypeScript over typed arrays - no DOM at
 * generation time - so the same generators run in a Worker on OffscreenCanvas or in Node
 * under vitest. Consumption: upload albedo/normal/roughness as DataTextures (3 samplers
 * per family); height is the authoring field the normal map was derived from.
 *
 * Canvas row 0 is v = 1 (top); every generator that places a feature by height says so
 * in its header comment (ruleset 1.1).
 */

import { generateAsphalt } from './asphalt';
import { generateBrick } from './brick';
import { generateConcrete } from './concrete';
import { generateLapSiding } from './lapSiding';
import { generateShingle } from './shingle';
import type { TextureFamily, TextureSet, TextureSetOptions } from './types';

export type { TextureFamily, TextureSet, TextureSetOptions } from './types';
export type { FamilyShader } from './tile';
export { SHADER_SLOTS } from './tile';
export const TEXTURE_FAMILIES: readonly TextureFamily[] = [
  'asphalt',
  'brick',
  'lapSiding',
  'shingle',
  'concrete',
] as const;

type FamilyGenerator = (options: TextureSetOptions) => TextureSet;

const GENERATORS: Record<TextureFamily, FamilyGenerator> = {
  asphalt: generateAsphalt,
  brick: generateBrick,
  lapSiding: generateLapSiding,
  shingle: generateShingle,
  concrete: generateConcrete,
};

/** Generates one tileable PBR texture set for `family` (default 1024^2, seed 1). */
export function generateTextureSet(
  family: TextureFamily,
  options: TextureSetOptions = {},
): TextureSet {
  const generator = GENERATORS[family];
  if (!generator) {
    throw new Error(`texture forge: unknown family '${String(family)}'`);
  }
  return generator(options);
}

export {
  generateAsphalt,
  generateBrick,
  generateConcrete,
  generateLapSiding,
  generateShingle,
};
