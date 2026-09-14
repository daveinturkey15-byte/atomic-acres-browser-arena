/**
 * water-quality.ts — per-render-profile water presentation budgets.
 *
 * HF-358: quality knobs live in one typed table instead of scattered
 * ternaries. Two hard rules:
 *
 * 1. Amplitude is NOT here. Wave height participates in buoyancy and is
 *    gameplay authority (see ocean-spectrum.ts); this table deliberately has
 *    no amplitude field so a profile can never change the sea state.
 * 2. The compat/WebGL2 route keeps the existing legacy water presentation and
 *    gets ZERO TSL water (tslWater: false). WebGPU fail-closed stays the only
 *    TSL route (AGENTS.md Pass 64 contract).
 */

import type { RenderProfile } from '../render-profile';

export type WaterQualityBudget = Readonly<{
  profile: RenderProfile;
  /** False routes the profile to the legacy WebGL2 GLSL presentation only. */
  tslWater: boolean;
  /** TSL near-plane tessellation (segments per side). 0 when tslWater=false. */
  surfaceSegments: number;
  /** Legacy WebGL2 GLSL plane tessellation (segments per side). */
  legacySurfaceSegments: number;
  /** Normal-only capillary detail bands layered in the TSL normalNode. */
  capillaryBands: number;
  /** Value-noise octaves in the foam breakup mask. */
  foamNoiseOctaves: number;
  /**
   * Planar reflection object allowed. Staged OFF for every profile this pass:
   * the blender-profile reflector (WaterMesh, resolutionScale <= 0.32) is
   * admitted only after a compute-budget receipt on both profiles (HF-358
   * staged scope).
   */
  reflection: boolean;
  /** Cheap far-water skirt radius (metres). */
  horizonRadius: number;
}>;

export const WATER_QUALITY: Readonly<Record<RenderProfile, WaterQualityBudget>> = Object.freeze({
  compat: Object.freeze({
    profile: 'compat' as const,
    tslWater: false,
    surfaceSegments: 0,
    legacySurfaceSegments: 96,
    capillaryBands: 0,
    foamNoiseOctaves: 1,
    reflection: false,
    horizonRadius: 3_200,
  }),
  performance: Object.freeze({
    profile: 'performance' as const,
    tslWater: true,
    surfaceSegments: 256,
    legacySurfaceSegments: 96,
    capillaryBands: 1,
    foamNoiseOctaves: 1,
    reflection: false,
    horizonRadius: 3_200,
  }),
  blender: Object.freeze({
    profile: 'blender' as const,
    tslWater: true,
    surfaceSegments: 256,
    legacySurfaceSegments: 160,
    capillaryBands: 3,
    foamNoiseOctaves: 2,
    reflection: false,
    horizonRadius: 3_200,
  }),
});

export function waterQualityForProfile(profile: RenderProfile): WaterQualityBudget {
  return WATER_QUALITY[profile];
}

/**
 * The Forge Map3Water.h:22-26 grid rule: keep at least three segments per
 * shortest displaced wavelength so the near-water silhouette never facets.
 */
export const SEGMENTS_PER_SHORTEST_WAVELENGTH = 3;

export function minimumSurfaceSegments(nearSize: number, shortestWavelength: number): number {
  return Math.ceil((nearSize * SEGMENTS_PER_SHORTEST_WAVELENGTH) / shortestWavelength);
}
