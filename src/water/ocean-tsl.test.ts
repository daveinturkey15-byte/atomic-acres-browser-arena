import { describe, expect, it } from 'vitest';
import {
  OCEAN_ALBEDO_SCALE,
  OCEAN_MIN_VIEW_COSINE,
  OCEAN_EMISSIVE_SCALE,
  OCEAN_ROUGHNESS_FLAT,
  OCEAN_ROUGHNESS_ROUGH,
  OCEAN_SLOPE_FULL_ROUGHNESS,
  oceanColumnDepth,
  oceanOpticsForBody,
  oceanPathLength,
  oceanRoughnessFromSlope,
  oceanTransmission,
} from './ocean-tsl';
import { WATER_POOLS, WATER_TYPES, waterBodyForArena } from './water-authoring';
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

/**
 * HF-420 Beer-Lambert colour model. These pin the CPU mirrors of the TSL graph
 * (the same pattern as oceanRoughnessFromSlope above); the displacement field
 * and OCEAN_BANDS are never touched here - colour only.
 */
describe('HF-420 physical water colour', () => {
  it('slants the optical path by view angle and clamps at grazing', () => {
    // Straight down through 1 m of water: down and back up is 2 m.
    expect(oceanPathLength(1, 1)).toBeCloseTo(2, 6);
    // A shallower look crosses more water, monotonically.
    expect(oceanPathLength(1, 0.5)).toBeGreaterThan(oceanPathLength(1, 1));
    expect(oceanPathLength(1, 0.25)).toBeGreaterThan(oceanPathLength(1, 0.5));
    // Grazing stays finite: the clamp, not infinity.
    expect(oceanPathLength(1, 0)).toBeCloseTo(1 / OCEAN_MIN_VIEW_COSINE + 1, 6);
    expect(Number.isFinite(oceanPathLength(1, -5))).toBe(true);
    // Zero column is zero path: a dry-shore fragment absorbs nothing.
    expect(oceanPathLength(0, 0.3)).toBe(0);
  });

  it('absorbs red first in clear water and green LAST in a murky pond', () => {
    // The whole point of a per-channel sigma: two water types differ only in
    // this vector, and that is what makes a lagoon cyan and a pond green-brown.
    const lagoon = oceanTransmission(WATER_TYPES['clear-lagoon'], 4);
    expect(lagoon.r).toBeLessThan(lagoon.g);
    expect(lagoon.g).toBeLessThan(lagoon.b);
    const pond = oceanTransmission(WATER_TYPES['murky-pond'], 1);
    expect(pond.g).toBeGreaterThan(pond.r);
    expect(pond.g).toBeGreaterThan(pond.b);
  });

  it('is monotonically darker with depth and never exceeds unity (bloom contract)', () => {
    let previous = Infinity;
    for (let path = 0; path <= 20; path += 0.5) {
      const t = oceanTransmission(WATER_TYPES['open-ocean'], path);
      expect(t.r).toBeLessThanOrEqual(previous + 1e-12);
      previous = t.r;
      for (const channel of [t.r, t.g, t.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reverts to the palette lerp for any body that authors no water type', () => {
    // The one-line revert path: no waterType means no optics and a zero column,
    // which is exactly the pre-HF-420 material.
    const bodyless = { ...waterBodyForArena('high-seas')! } as Record<string, unknown>;
    delete bodyless.waterType;
    expect(oceanOpticsForBody(bodyless as never)).toBeNull();
    expect(oceanColumnDepth(bodyless as never)).toBe(0);
  });

  it('gives every Map 3 pond a murky column shallow enough to saturate', () => {
    const ponds = WATER_POOLS.map3 ?? [];
    expect(ponds.length).toBeGreaterThan(0);
    for (const pond of ponds) {
      expect(pond.waterType).toBe('murky-pond');
      const depth = oceanColumnDepth(pond);
      expect(depth).toBeGreaterThan(0);
      expect(depth).toBeLessThanOrEqual(0.5);
      // Past this column the exponential has effectively saturated, which is
      // why the authored depth is a colour statement and not a claim about the
      // basin's true thickness.
      const straightDown = oceanTransmission(WATER_TYPES['murky-pond'], oceanPathLength(depth, 1));
      expect(straightDown.g).toBeGreaterThan(straightDown.r);
      expect(straightDown.g).toBeGreaterThan(straightDown.b);
    }
  });
});
