/**
 * HF-535. The Nuke Town shadow floor.
 *
 * Dave's report was "the middle street is a black slab". It was: under the
 * arena's own authored golden-hour sky the coach/building shadow footprint on
 * the asphalt renders at max channel <= 6 over ~20-25% of the
 * `nuketown2-coach-elevation` frame. The measured repair is one intensity VALUE
 * on the `shadow-side-arena-fill` directional light that every render profile
 * already builds, arena-scoped the way `RUSTWORKS_BRIGHTENING` already is.
 *
 * This file pins the floor constant and everything the repair must NOT have
 * done. It fails at base 3278a930 by construction: there the nuketown2 profile
 * inherits BLENDER_LIGHTING's shared 0.22 fill, which is far below the floor.
 */
import { describe, expect, it } from 'vitest';
import {
  arenaLightingProfile,
  NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY,
  NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY,
} from './blender-lighting';

describe('HF-535 Nuke Town shadow floor', () => {
  it('pins the applied fill intensity at or above the measured floor', () => {
    expect(NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY).toBe(1.4);
    expect(NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY)
      .toBeGreaterThanOrEqual(NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY);
  });

  it('applies the floor to nuketown2 in both gameplay profiles', () => {
    for (const profile of ['blender', 'performance'] as const) {
      const lighting = arenaLightingProfile(profile, 'nuketown2');
      expect(lighting.fillIntensity).toBe(NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY);
      expect(lighting.fillIntensity)
        .toBeGreaterThanOrEqual(NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY);
    }
  });

  it('is a real lift over the shared profile the arena used to inherit', () => {
    const shared = arenaLightingProfile('blender');
    const arena = arenaLightingProfile('blender', 'nuketown2');
    expect(shared.fillIntensity).toBe(0.22);
    // The whole defect: 0.22 leaves the shaded road inside the ACES toe.
    expect(arena.fillIntensity / shared.fillIntensity).toBeGreaterThanOrEqual(6);
  });

  it('keeps the sun the key light, so the street still reads as golden hour', () => {
    const arena = arenaLightingProfile('blender', 'nuketown2');
    expect(arena.sunIntensity).toBeGreaterThan(arena.fillIntensity);
    // A fill that reaches the key stops being a fill and flattens the map.
    expect(arena.fillIntensity / arena.sunIntensity).toBeLessThanOrEqual(0.55);
  });

  it('changes nothing but the fill on nuketown2', () => {
    const shared = arenaLightingProfile('blender');
    const arena = arenaLightingProfile('blender', 'nuketown2');
    for (const key of Object.keys(shared) as (keyof typeof shared)[]) {
      if (key === 'fillIntensity') continue;
      expect({ key, value: arena[key] }).toEqual({ key, value: shared[key] });
    }
  });

  it('leaves every other arena and the compatibility route alone', () => {
    expect(arenaLightingProfile('blender', 'terminal').fillIntensity).toBe(0.22);
    expect(arenaLightingProfile('blender', 'rustworks-1v1').fillIntensity).toBe(0.275);
    expect(arenaLightingProfile('blender', 'atomic-acres').fillIntensity)
      .not.toBe(NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY);
    expect(arenaLightingProfile('compat', 'nuketown2').fillIntensity).toBe(0.66);
  });
});
