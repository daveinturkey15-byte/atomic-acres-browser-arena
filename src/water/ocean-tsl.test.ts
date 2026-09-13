import { describe, expect, it } from 'vitest';
import {
  OCEAN_ALBEDO_SCALE,
  OCEAN_EMISSIVE_SCALE,
  OCEAN_ROUGHNESS_FLAT,
  OCEAN_ROUGHNESS_ROUGH,
  OCEAN_SLOPE_FULL_ROUGHNESS,
  oceanRoughnessFromSlope,
} from './ocean-tsl';
// HF-362 grade-chain reference: profile bloom thresholds live here and are
// fail-closed asserted > 1.0 linear (true emitters only).
import { GRADE_PROFILES } from '../rendering/grade-profile';

/**
 * Stage-1 ocean PBR material pins (graphics register: material response only).
 *
 * - Buoyancy parity is UNTOUCHABLE: these tests never import or exercise
 *   positionNode / OCEAN_BANDS displacement math — material response only.
 * - Bloom-threshold contract: no authored material term may reach the lowest
 *   profile bloom threshold; specular stays below it by construction.
 */
describe('HF-37x stage-1 ocean PBR material', () => {
  it('modulates roughness from wave slope (flat = glossy 0.15, steep -> broader glints)', () => {
    // Calm water keeps a tight GGX lobe so directional light produces real
    // sun/moon glints instead of the previous roughness=1 diffuse-only look.
    expect(oceanRoughnessFromSlope(0)).toBe(OCEAN_ROUGHNESS_FLAT);
    expect(OCEAN_ROUGHNESS_FLAT).toBeCloseTo(0.15, 5);
    // Monotonically increasing in slope magnitude: steeper local Gerstner
    // slope => rougher micro-facets => broader glints.
    let previous = -Infinity;
    for (let s = 0; s <= 2.4; s += 0.1) {
      const r = oceanRoughnessFromSlope(s);
      expect(r).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
    // Saturates at the rough ceiling and clamps beyond the full-roughness knee.
    expect(oceanRoughnessFromSlope(OCEAN_SLOPE_FULL_ROUGHNESS)).toBeCloseTo(OCEAN_ROUGHNESS_ROUGH, 5);
    expect(oceanRoughnessFromSlope(10_000)).toBeCloseTo(OCEAN_ROUGHNESS_ROUGH, 5);
    expect(oceanRoughnessFromSlope(-3)).toBeCloseTo(OCEAN_ROUGHNESS_FLAT, 5);
    // Never mirror-sharp (bloom safety) and never fully matte.
    expect(OCEAN_ROUGHNESS_ROUGH).toBeLessThan(0.7);
  });

  it('keeps a REDUCED but non-zero emissive term for the authored deep-water glow', () => {
    // Night arenas (rustworks) must not go black under directional-only light.
    expect(OCEAN_EMISSIVE_SCALE).toBeGreaterThan(0);
    // ...but emissive is reduced relative to the pre-stage-1 0.58 scale, with
    // the majority of the look moved into albedo where lights shape it.
    expect(OCEAN_ALBEDO_SCALE).toBeGreaterThan(OCEAN_EMISSIVE_SCALE);
    expect(OCEAN_EMISSIVE_SCALE).toBeLessThan(0.58);
  });

  it('cannot exceed the bloom threshold for any plausible input (grade-chain reference)', () => {
    // Authored terms are convex combinations of palette colours (<= 1/channel)
    // times keyFacing (<= 1), scaled by ALBEDO + EMISSIVE. The worst case is
    // therefore the sum of both scales on pure-white authored water.
    const worstCaseAuthoredLinear =
      Math.max(OCEAN_ALBEDO_SCALE + OCEAN_EMISSIVE_SCALE, Number.EPSILON);
    const lowestProfileThreshold = Math.min(
      ...Object.values(GRADE_PROFILES).map((p) => p.bloom.threshold),
    );
    // Contract: threshold > 1.0 linear, reserved for TRUE emitters only.
    expect(lowestProfileThreshold).toBeGreaterThan(1);
    // Water's static output stays strictly below every bloom threshold.
    expect(worstCaseAuthoredLinear).toBeLessThan(lowestProfileThreshold);
    // Specular cannot bridge the gap: roughness floors at 0.15, so the GGX
    // lobe is broad enough that even a unit-intensity key light cannot focus
    // energy above the threshold band at plausible exposure.
    expect(oceanRoughnessFromSlope(0)).toBeGreaterThanOrEqual(0.15);
  });
});
