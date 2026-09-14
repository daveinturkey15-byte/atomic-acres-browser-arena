/**
 * src/sky/cloud-deck.test.ts — FIX lane VOLUMETRIC CLOUDS contract.
 *
 * Pins BEHAVIOUR, not values: the falsifiable radiance ratio, the
 * Beer-Lambert ablation, closed-form opacity shape, weather monotonicity,
 * one-draw-call structure, and the allocation-free sort. A retune of any
 * constant keeps these green; deleting the extinction term fails them.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_AMBIENT_FLOOR,
  CLOUD_DECK_DEFAULT_LOBES,
  CLOUD_DECK_DRAW_CALLS,
  CLOUD_DECK_REACHABILITY_MARKER,
  CLOUD_DECK_SAMPLER_COUNT,
  CLOUD_DECK_SORT_INTERVAL_MS,
  CLOUD_DECK_SUN_TAPS,
  CLOUD_QUAD_SIGMA_EXTENT,
  CLOUD_RADIANCE_RATIO_MIN,
  NEUTRAL_CLOUD_WEATHER,
  applyCloudWeather,
  beerLambertTransmittance,
  cloudDeckLobeCountFor,
  cloudWeatherFromMap3Preset,
  cloudWeatherFromWeatherSample,
  createCloudDeck,
  dualHenyeyGreensteinPhase,
  henyeyGreensteinPhase,
  fixedFieldRadianceRatio,
  fogPeakTauScale,
  gaussianErfc,
  gaussianFullOpticalDepth,
  gaussianRayOpticalDepth,
  generateCloudLobes,
  getLiveCloudDeckCount,
  lobeIncidentRadiance,
  lobePeakViewTau,
  lobeSunTransmittance,
  quadFragmentOpacity,
  FIXED_RATIO_BASE,
  FIXED_RATIO_LOBE,
  FIXED_RATIO_SUN,
  FIXED_RATIO_TOP,
  FIXED_RATIO_VIEW,
  type CloudLobe,
} from './cloud-deck';

describe('falsifiable radiance row', () => {
  it('sun-facing top over shadow-side base is >= 4 with extinction', () => {
    const ratio = fixedFieldRadianceRatio();
    expect(ratio).toBeGreaterThanOrEqual(CLOUD_RADIANCE_RATIO_MIN);
  });

  it('is exactly 1.0 +/- 1e-6 when sigma = 0', () => {
    expect(fixedFieldRadianceRatio({ sigma: 0 })).toBeCloseTo(1, 6);
  });

  it('collapses to 1 when the Beer-Lambert term is deleted', () => {
    // The ablation switch is the executable form of "delete the term".
    expect(fixedFieldRadianceRatio({ useBeerLambert: false })).toBeCloseTo(1, 6);
    // And it also fails the >= 4 half, not just the sigma = 0 half.
    expect(fixedFieldRadianceRatio({ useBeerLambert: false }))
      .toBeLessThan(CLOUD_RADIANCE_RATIO_MIN);
  });
});

describe('closed-form optics', () => {
  it('erfc matches known values', () => {
    expect(gaussianErfc(0)).toBeCloseTo(1, 6);
    expect(gaussianErfc(3)).toBeCloseTo(0.000022, 6);
    expect(gaussianErfc(-3)).toBeCloseTo(1.999978, 5);
  });

  it('zero sigma is clear air on every path', () => {
    const lobe: CloudLobe = { ...FIXED_RATIO_LOBE, sigma: 0 };
    expect(gaussianRayOpticalDepth(lobe, [10, 4, 2], [0, 1, 0])).toBe(0);
    expect(gaussianFullOpticalDepth(0, lobe.radii, [1, 0, 0])).toBe(0);
    expect(lobeSunTransmittance(lobe, FIXED_RATIO_BASE, FIXED_RATIO_SUN)).toBe(1);
  });

  it('sun ray through the lobe is dimmer than the ray above it', () => {
    const tTop = lobeSunTransmittance(FIXED_RATIO_LOBE, FIXED_RATIO_TOP, FIXED_RATIO_SUN);
    const tBase = lobeSunTransmittance(FIXED_RATIO_LOBE, FIXED_RATIO_BASE, FIXED_RATIO_SUN);
    expect(tTop).toBeGreaterThan(tBase);
    expect(beerLambertTransmittance(0)).toBe(1);
    expect(beerLambertTransmittance(10)).toBeLessThan(1e-4);
  });

  it('phase is forward-dominant, positive, and dual-lobed', () => {
    const forward = dualHenyeyGreensteinPhase(1);
    const side = dualHenyeyGreensteinPhase(0);
    const back = dualHenyeyGreensteinPhase(-1);
    // Cloud droplets scatter forward: the sun-facing lobe dominates.
    expect(forward).toBeGreaterThan(side);
    expect(forward).toBeGreaterThan(back);
    expect(side).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    // The backward lobe contributes: the dual phase differs from either
    // single lobe evaluated at the same angle.
    expect(side).not.toBeCloseTo(4 * Math.PI * henyeyGreensteinPhase(0, 0.65), 6);
    expect(side).not.toBeCloseTo(4 * Math.PI * henyeyGreensteinPhase(0, -0.28), 6);
  });
  it('fragment opacity is the closed form: centre 1-exp(-peak), rim falls off', () => {
    const peak = 2.5;
    expect(quadFragmentOpacity(0.5, 0.5, peak)).toBeCloseTo(1 - Math.exp(-peak), 12);
    const mid = quadFragmentOpacity(0.75, 0.5, peak);
    const rim = quadFragmentOpacity(1, 0.5, peak);
    expect(mid).toBeLessThan(quadFragmentOpacity(0.5, 0.5, peak));
    expect(rim).toBeLessThan(mid);
    expect(quadFragmentOpacity(0.5, 0.5, 0)).toBe(0);
    expect(quadFragmentOpacity(0, 0, peak)).toBeLessThan(0.05);
  });

  it('edge-on lobes read denser than face-on (anisotropy, no texture)', () => {
    const lobe: CloudLobe = { center: [0, 0, 0], radii: [9, 3.2, 6.5], sigma: 0.6 };
    expect(lobePeakViewTau(lobe, [1, 0, 0])).toBeGreaterThan(
      lobePeakViewTau(lobe, [0, 1, 0]),
    );
  });

  it('degenerate inputs never produce NaN', () => {
    const lobe: CloudLobe = { center: [0, 0, 0], radii: [9, 3.2, 6.5], sigma: 0.6 };
    expect(Number.isNaN(gaussianRayOpticalDepth(lobe, [0, 0, 0], [0, 0, 0]))).toBe(false);
    expect(Number.isNaN(lobeIncidentRadiance(lobe, [0, 0, 0], [0, 0, 0], [1, 0, 0]))).toBe(false);
  });
});

describe('weather authority is consumed, never redefined', () => {
  it('neutral defaults are zero-effect', () => {
    expect(NEUTRAL_CLOUD_WEATHER.tint).toEqual([1, 1, 1]);
    expect(NEUTRAL_CLOUD_WEATHER.fogDensityScale).toBe(1);
    expect(NEUTRAL_CLOUD_WEATHER.skyDarken).toBe(0);
    expect(cloudWeatherFromMap3Preset({})).toEqual(NEUTRAL_CLOUD_WEATHER);
    expect(cloudWeatherFromWeatherSample({})).toEqual(NEUTRAL_CLOUD_WEATHER);
  });

  it('storm is darker and denser than clear (Map 3 authority)', () => {
    const clear = cloudWeatherFromMap3Preset({ skyTint: 0xffffff, fogDensityScale: 1.0, skyDarken: 0 });
    const storm = cloudWeatherFromMap3Preset({ skyTint: 0x6d7a8c, fogDensityScale: 2.1, skyDarken: 0.85 });
    expect(storm.fogDensityScale).toBeGreaterThan(clear.fogDensityScale);
    expect(fogPeakTauScale(storm.fogDensityScale)).toBeGreaterThan(fogPeakTauScale(clear.fogDensityScale));
    const clearLum = clear.tint[0]! + clear.tint[1]! + clear.tint[2]!;
    const stormLum = storm.tint[0]! * (1 - 0.5 * storm.skyDarken)
      + storm.tint[1]! * (1 - 0.5 * storm.skyDarken)
      + storm.tint[2]! * (1 - 0.5 * storm.skyDarken);
    expect(stormLum).toBeLessThan(clearLum);
  });

  it('heavy Nuke Town weather is denser than clear', () => {
    const clear = cloudWeatherFromWeatherSample({ fogDensityMultiplier: 1, skyDarkenAmount: 0 });
    const heavy = cloudWeatherFromWeatherSample({ fogDensityMultiplier: 1.8, skyDarkenAmount: 0.7 });
    expect(fogPeakTauScale(heavy.fogDensityScale)).toBeGreaterThan(fogPeakTauScale(clear.fogDensityScale));
    expect(heavy.skyDarken).toBeGreaterThan(clear.skyDarken);
  });

  it('neutral weather leaves deck uniforms untouched', () => {
    const deck = createCloudDeck({ lobeCount: 4 });
    try {
      const before = deck.uniforms.tint.value.clone();
      applyCloudWeather(deck.uniforms, NEUTRAL_CLOUD_WEATHER);
      expect(deck.uniforms.tint.value.equals(before)).toBe(true);
    } finally {
      deck.dispose();
    }
  });
});

describe('deck structure and budget', () => {
  it('importing the module creates no deck (no load-time cost)', () => {
    expect(getLiveCloudDeckCount()).toBe(0);
  });

  it('is one InstancedMesh, one draw call, zero samplers', () => {
    expect(CLOUD_DECK_DRAW_CALLS).toBe(1);
    expect(CLOUD_DECK_SAMPLER_COUNT).toBe(0);
    expect(CLOUD_DECK_SUN_TAPS).toBe(3);
    const deck = createCloudDeck({ lobeCount: 8, seed: 7 });
    try {
      expect(deck.mesh.isInstancedMesh).toBe(true);
      expect(deck.mesh.count).toBe(8);
      expect(deck.material.transparent).toBe(true);
      expect(deck.material.depthWrite).toBe(false);
      expect(deck.material.fog).toBe(false);
      expect((deck.material as unknown as { map: unknown }).map ?? null).toBeNull();
      expect(deck.mesh.frustumCulled).toBe(false);
      expect(deck.mesh.name).toContain(CLOUD_DECK_REACHABILITY_MARKER);
      expect(deck.mesh.userData.presentationOnly).toBe(true);
      expect(deck.mesh.userData.blocksShots).toBe(false);
      expect(deck.mesh.userData.reachability).toBe(CLOUD_DECK_REACHABILITY_MARKER);
    } finally {
      deck.dispose();
    }
  });

  it('quality tiers bound the draw: off adds nothing', () => {
    expect(cloudDeckLobeCountFor('off')).toBe(0);
    expect(cloudDeckLobeCountFor('low')).toBe(64);
    expect(cloudDeckLobeCountFor('high')).toBe(CLOUD_DECK_DEFAULT_LOBES);
    const deck = createCloudDeck({ lobeCount: 8, quality: 'off' });
    try {
      expect(deck.count).toBe(0);
      expect(deck.mesh.visible).toBe(false);
      deck.setQuality('low');
      expect(deck.count).toBe(8);
    } finally {
      deck.dispose();
    }
  });

  it('field generation is seeded and bounded', () => {
    const a = generateCloudLobes({ lobeCount: 16, seed: 42 });
    const b = generateCloudLobes({ lobeCount: 16, seed: 42 });
    expect(a).toEqual(b);
    expect(generateCloudLobes({ lobeCount: 16, seed: 43 })).not.toEqual(a);
    for (const lobe of a) {
      expect(lobe.radii[0]).toBeGreaterThan(0);
      expect(lobe.radii[1]).toBeGreaterThan(0);
      expect(lobe.radii[2]).toBeGreaterThan(0);
      expect(Math.abs(lobe.center[0])).toBeLessThanOrEqual(320);
    }
    expect(generateCloudLobes({ lobeCount: 10000 }).length)
      .toBeLessThanOrEqual(256);
  });
});

describe('sort and frame loop', () => {
  const sun: [number, number, number] = [0.2425, 0.9701, 0.1455];

  function cameraAt(x: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(x, 150, 400);
    camera.lookAt(0, 150, 0);
    camera.updateMatrixWorld();
    return camera;
  }

  it('sorts far-first into a preallocated index, throttled to 4 Hz', () => {
    const deck = createCloudDeck({ lobeCount: 16, seed: 11 });
    try {
      const camera = cameraAt(0);
      expect(deck.shadeTick(camera, sun, NEUTRAL_CLOUD_WEATHER, 1000)).toBe(true);
      // Throttle: a second tick inside the interval is a no-op.
      expect(deck.shadeTick(camera, sun, NEUTRAL_CLOUD_WEATHER, 1000 + CLOUD_DECK_SORT_INTERVAL_MS - 1)).toBe(false);
      expect(deck.shadeTick(camera, sun, NEUTRAL_CLOUD_WEATHER, 1000 + CLOUD_DECK_SORT_INTERVAL_MS)).toBe(true);
      // Permutation check.
      const sorted = [...deck.order].sort((x, y) => x - y);
      expect(sorted).toEqual([...Array(16).keys()]);
      // Far-first: depths non-decreasing along the draw order.
      for (let i = 1; i < 16; i += 1) {
        expect(deck.depths[deck.order[i]!]!).toBeGreaterThanOrEqual(
          deck.depths[deck.order[i - 1]!]! - 1e-6,
        );
      }
      // A side camera re-sorts; nearest lobe from the front is far from the side.
      const side = cameraAt(600);
      expect(deck.shadeTick(side, sun, NEUTRAL_CLOUD_WEATHER, 2000)).toBe(true);
    } finally {
      deck.dispose();
    }
  });

  it('per-frame update allocates nothing observable', () => {
    const deck = createCloudDeck({ lobeCount: 8, seed: 5 });
    try {
      const camera = cameraAt(0);
      const orderRef = deck.order;
      const depthsRef = deck.depths;
      const matrixRef = deck.mesh.instanceMatrix.array;
      deck.shadeTick(camera, sun, NEUTRAL_CLOUD_WEATHER, 0);
      deck.update(camera, sun, NEUTRAL_CLOUD_WEATHER, 16, 1 / 60);
      deck.update(camera, sun, NEUTRAL_CLOUD_WEATHER, 32, 1 / 60);
      expect(deck.order).toBe(orderRef);
      expect(deck.depths).toBe(depthsRef);
      expect(deck.mesh.instanceMatrix.array).toBe(matrixRef);
      expect(CLOUD_QUAD_SIGMA_EXTENT).toBe(2);
    } finally {
      deck.dispose();
    }
  });

  it('ambient floor keeps the shadow side non-black', () => {
    expect(CLOUD_AMBIENT_FLOOR).toBeGreaterThan(0);
    const lobe: CloudLobe = { ...FIXED_RATIO_LOBE };
    expect(lobeIncidentRadiance(lobe, FIXED_RATIO_BASE, FIXED_RATIO_SUN, FIXED_RATIO_VIEW))
      .toBeGreaterThan(0);
  });
});
