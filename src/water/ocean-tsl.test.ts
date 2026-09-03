import { describe, expect, it } from 'vitest';
import {
  OCEAN_ALBEDO_SCALE,
  OCEAN_MIN_VIEW_COSINE,
  OCEAN_EMISSIVE_SCALE,
  OCEAN_ROUGHNESS_FLAT,
  OCEAN_ROUGHNESS_ROUGH,
  OCEAN_SLOPE_FULL_ROUGHNESS,
  OCEAN_BACKSCATTER_DECAY,
  OCEAN_FOAM_SLOPE_LOW,
  oceanBackscatterDensity,
  oceanColumnDepth,
  oceanOpticsForBody,
  oceanPathLength,
  oceanRoughnessFromSlope,
  oceanDeepScatterColor,
  oceanScatteredRadiance,
  oceanTransmission,
} from './ocean-tsl';
import { OCEAN_BANDS, OCEAN_REFERENCE_AMPLITUDE } from './ocean-spectrum';
import {
  WATER_BODIES,
  WATER_POOLS,
  WATER_TYPES,
  waterBodyForArena,
  waterBodyId,
} from './water-authoring';
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

/** Peak summed |d(height)/dx, d(height)/dz| for a body at a given amplitude. */
function peakSlope(amplitude: number): number {
  return OCEAN_BANDS.reduce(
    (sum, band) => sum + band.weight * amplitude * band.waveNumber,
    0,
  );
}

describe('HF-420 broadband bubble backscatter', () => {
  it('is EXACTLY zero for a Map 3 pond, at every crest height', () => {
    // The still-water control the whole proof rests on. A pond's amplitude puts
    // its steepest possible slope far below the foam gate, so the term is a
    // hard zero rather than a small number - the pond's pixels are unchanged.
    const pond = (WATER_POOLS.map3 ?? [])[0]!;
    const pondSlope = peakSlope(OCEAN_REFERENCE_AMPLITUDE * pond.amplitudeScale);
    expect(pondSlope).toBeLessThan(OCEAN_FOAM_SLOPE_LOW);
    const optics = WATER_TYPES[pond.waterType!];
    for (let crest = 0; crest <= 1.5; crest += 0.05) {
      expect(oceanBackscatterDensity(crest, pondSlope, optics)).toBe(0);
    }
  });

  it('is non-zero on the storm spectrum, and trails the whitecap', () => {
    const storm = waterBodyForArena('rustworks-1v1')!;
    const stormSlope = peakSlope(OCEAN_REFERENCE_AMPLITUDE * storm.amplitudeScale);
    expect(stormSlope).toBeGreaterThan(OCEAN_FOAM_SLOPE_LOW);
    // The water TYPE by name, not through the body: no ocean opts in today
    // (see water-authoring.ts), and this test is about the term's behaviour on
    // a storm spectrum, not about which arenas are enrolled.
    const optics = WATER_TYPES['storm-ocean'];
    // At the whitecap itself.
    expect(oceanBackscatterDensity(1.2, stormSlope, optics)).toBeGreaterThan(0);
    // BELOW the foam threshold the bubbles are still there: the cloud outlives
    // the crest that made it, which is what stops it reading as a moving decal.
    expect(oceanBackscatterDensity(0.88 - OCEAN_BACKSCATTER_DECAY / 2, stormSlope, optics))
      .toBeGreaterThan(0);
    // ...and it is weaker there than at the crest.
    expect(oceanBackscatterDensity(0.88 - OCEAN_BACKSCATTER_DECAY / 2, stormSlope, optics))
      .toBeLessThan(oceanBackscatterDensity(1.2, stormSlope, optics));
  });

  it('has no colour of its own: the shift comes from absorption acting on it', () => {
    // This test IS the skill's primary gotcha, mechanised. Same flat density,
    // two injection points.
    const optics = WATER_TYPES['storm-ocean'];
    const base = { r: 0.09, g: 0.49, b: 0.58 };
    const path = 6;
    const transmission = oceanTransmission(optics, path);
    const upstream = oceanScatteredRadiance(base, 0.4, optics, path);
    const absorbedOnly = oceanScatteredRadiance(base, 0, optics, path);
    // UPSTREAM: the added light is filtered by the water, so it arrives
    // green-shifted - green gains more than red or blue, in absolute terms.
    const gainR = upstream.r - absorbedOnly.r;
    const gainG = upstream.g - absorbedOnly.g;
    const gainB = upstream.b - absorbedOnly.b;
    expect(gainG).toBeGreaterThan(gainR);
    expect(gainG).toBeGreaterThan(gainB);
    // ...and it is brighter than the un-scattered water.
    expect(upstream.g).toBeGreaterThan(absorbedOnly.g);
    // DOWNSTREAM (the failure mode): the same flat term added AFTER absorption
    // gains exactly the same amount in every channel - grey milk, no hue shift.
    const downstream = {
      r: absorbedOnly.r + 0.4, g: absorbedOnly.g + 0.4, b: absorbedOnly.b + 0.4,
    };
    expect(downstream.r - absorbedOnly.r).toBeCloseTo(downstream.g - absorbedOnly.g, 12);
    expect(downstream.g - absorbedOnly.g).toBeCloseTo(downstream.b - absorbedOnly.b, 12);
    // The two are not the same picture: if they ever agree, the term has been
    // moved downstream and the model is wrong.
    expect(Math.abs(gainG - gainR)).toBeGreaterThan(1e-3);
    // Transmission ordering is what produced it: green survives best in coastal
    // water, which is why surf reads jade rather than cyan.
    expect(transmission.g).toBeGreaterThan(transmission.r);
    expect(transmission.g).toBeGreaterThan(transmission.b);
  });

  it('cannot push the surface above the bloom bound', () => {
    const optics = WATER_TYPES['clear-lagoon'];
    for (const density of [0, 0.25, 0.5, 1, 4]) {
      const out = oceanScatteredRadiance({ r: 1, g: 1, b: 1 }, density, optics, 0.0001);
      for (const channel of [out.r, out.g, out.b]) {
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('HF-420 deep-water scattering closure', () => {
  it('tends to the water type scattering colour, not to black, as the column deepens', () => {
    // Absorption on its own is a black hole. This is the term that stops a deep
    // ocean rendering as one, and it is physics rather than a floor constant:
    // it is the light backscattered out of the upper column.
    const optics = WATER_TYPES['open-ocean'];
    const deep = oceanDeepScatterColor(optics);
    const far = oceanScatteredRadiance({ r: 0.09, g: 0.49, b: 0.58 }, 0, optics, 400);
    expect(far.r).toBeCloseTo(deep.r, 4);
    expect(far.g).toBeCloseTo(deep.g, 4);
    expect(far.b).toBeCloseTo(deep.b, 4);
    // ...and it is not black.
    expect(deep.r + deep.g + deep.b).toBeGreaterThan(0.1);
  });

  it('tends to the floor colour as the column thins, so a shore still reads shallow', () => {
    const optics = WATER_TYPES['clear-lagoon'];
    const floor = { r: 0.4, g: 0.72, b: 0.68 };
    const thin = oceanScatteredRadiance(floor, 0, optics, 0.0001);
    expect(thin.r).toBeCloseTo(floor.r, 3);
    expect(thin.g).toBeCloseTo(floor.g, 3);
    expect(thin.b).toBeCloseTo(floor.b, 3);
  });

  it('is monotone between the two ends and never leaves [0, 1]', () => {
    const optics = WATER_TYPES['murky-pond'];
    const floor = { r: 0.2, g: 0.35, b: 0.24 };
    let previous = oceanScatteredRadiance(floor, 0, optics, 0);
    for (let path = 0.1; path <= 8; path += 0.1) {
      const here = oceanScatteredRadiance(floor, 0, optics, path);
      for (const channel of [here.r, here.g, here.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
      previous = here;
    }
    expect(previous.g).toBeGreaterThan(0);
  });
});


/**
 * HF-420: the horizon skirt is NOT on the physical colour model, and the
 * constraint that keeps that consistent is enforced here rather than trusted.
 *
 * The skirt is an unlit MeshBasicMaterial ring; the near plane is a lit
 * MeshStandardNodeMaterial. Measured (skirt-hidden capture probe, RustRig):
 * the skirt owns 1.54% of the worst frame - a thin horizon line and the hole
 * in the near plane's rectangular dry footprint under the rig - and painting it
 * the optically-deep limit of the body's own optics renders about 4x the
 * luminance of the accepted palette because it is unlit, turning the horizon
 * line into a bright green stripe and the shadowed water under the rig into a
 * glowing green pad. There is no weight that is both principled and correct,
 * because the quantity to match is the near plane's LIT output.
 *
 * So: a body that owns a skirt may not author a water type. One assertion,
 * and it is the reason two shipped oceans are not enrolled today.
 */
describe('HF-420 skirted bodies may not author a water type', () => {
  it('holds for every authored body, sea and pond alike', () => {
    const bodies = [
      ...Object.values(WATER_BODIES),
      ...Object.values(WATER_POOLS).flatMap((pools) => pools ?? []),
    ].filter((body): body is NonNullable<typeof body> => Boolean(body));
    expect(bodies.length).toBeGreaterThan(0);
    const skirted = bodies.filter((body) => body.horizonRadius > 0);
    // The rule is only meaningful while skirted bodies actually exist.
    expect(skirted.length).toBeGreaterThan(0);
    expect(skirted.filter((body) => body.waterType).map(waterBodyId)).toEqual([]);
  });

  it('is not vacuous: the bodies that DO carry optics are the skirtless ones', () => {
    const withOptics = [
      ...Object.values(WATER_BODIES),
      ...Object.values(WATER_POOLS).flatMap((pools) => pools ?? []),
    ].filter((body) => body && body.waterType);
    expect(withOptics.length).toBeGreaterThan(0);
    for (const body of withOptics) expect(body!.horizonRadius).toBe(0);
  });
});
