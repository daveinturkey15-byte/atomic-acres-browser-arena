import type { Node } from 'three/webgpu';
import { dot, max, pow, vec3 } from 'three/tsl';

export type LinearContrastRgb = readonly [number, number, number];
export const SCENE_LINEAR_CONTRAST_LUMA = [0.2126, 0.7152, 0.0722] as const;
export const SCENE_LINEAR_CONTRAST_PIVOT = 0.5;
export const SCENE_LINEAR_CONTRAST_EPSILON = 1e-6;

/** Finite linear HDR input, positive contrast. No per-channel offset or HDR clamp.
 * Nonnegative input stays nonnegative; a shared positive scale preserves ratios.
 * Below epsilon the scale is constant, keeping black zero and the curve continuous.
 */
export function sceneLinearContrast(rgb: LinearContrastRgb, contrast: number): LinearContrastRgb {
  if (contrast === 1) return rgb;
  const luminance = rgb[0] * SCENE_LINEAR_CONTRAST_LUMA[0]
    + rgb[1] * SCENE_LINEAR_CONTRAST_LUMA[1] + rgb[2] * SCENE_LINEAR_CONTRAST_LUMA[2];
  const scale = Math.pow(
    Math.max(luminance, SCENE_LINEAR_CONTRAST_EPSILON) / SCENE_LINEAR_CONTRAST_PIVOT,
    contrast - 1,
  );
  return [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
}

/** Same curve on the existing scene-grade uniform; identity selects the input exactly. */
export function sceneLinearContrastNode(rgb: Node<'vec3'>, contrast: Node<'float'>): Node<'vec3'> {
  const luminance = dot(rgb, vec3(...SCENE_LINEAR_CONTRAST_LUMA));
  const scale = pow(
    max(luminance, SCENE_LINEAR_CONTRAST_EPSILON).div(SCENE_LINEAR_CONTRAST_PIVOT),
    contrast.sub(1),
  );
  return contrast.equal(1).select(rgb, rgb.mul(scale));
}
