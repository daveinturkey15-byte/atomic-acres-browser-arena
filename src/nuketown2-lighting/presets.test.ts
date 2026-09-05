import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { definition as nuketown2Definition } from '../rendering/arenas/nuketown2';
import {
  BAKED_INDIRECT_MAXIMUM_GAIN,
  resolveBakedIndirectTuning,
} from '../rendering/lighting/baked-indirect';
import {
  DISPLAY_VIGNETTE_MAXIMUM,
  MAXIMUM_COMPOSED_MIDTONE_CONTRAST,
  MINIMUM_COMPOSED_BLOOM_THRESHOLD,
  artDirectionForArena,
} from '../rendering/art-direction';
import { GODRAY_MAXIMUM_ADDITIVE_GAIN } from '../rendering/screen-space-post-profile';
import { LIGHTING_CONDITION_BOUNDS } from '../rendering/lighting-conditions';
import {
  NUKETOWN2_ANCHOR_PRESET,
  NUKETOWN2_AUTHORED,
  NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS,
  NUKETOWN2_LONGEST_SIGHTLINE_M,
  NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE,
  NUKETOWN2_SHADE_READABILITY_FLOOR,
  NUKETOWN2_SKY_PRESET_IDS,
  NUKETOWN2_SKY_PRESETS,
  assertNuketown2PresetSafety,
  ev100FromLux,
  linearFogCoverage,
  nuketown2BakedIndirectComposite,
  nuketown2LongestRunHaze,
  nuketown2PracticalEmissiveFloor,
  nuketown2PresetPhysics,
} from './presets';

describe('Nuke Town Rebuild sky presets', () => {
  it('authors exactly the five skies in clock order, anchored on the shipped one', () => {
    expect([...NUKETOWN2_SKY_PRESET_IDS]).toEqual(['dawn', 'late-morning', 'overcast', 'golden-hour', 'night']);
    expect(NUKETOWN2_ANCHOR_PRESET).toBe('golden-hour');
  });

  // THE MIRROR TEST. `NUKETOWN2_AUTHORED` restates the arena definition's own
  // numbers so this module stays pure of THREE and of the visual-definition
  // graph. A mirror nobody checks is a lie waiting to happen.
  it('mirrors the shipped arena definition exactly', () => {
    expect(NUKETOWN2_AUTHORED.sunColor).toBe(nuketown2Definition.lighting.sunColor);
    expect(NUKETOWN2_AUTHORED.sunIntensity).toBe(nuketown2Definition.lighting.sunIntensity);
    expect(NUKETOWN2_AUTHORED.ambientColor).toBe(nuketown2Definition.lighting.ambientColor);
    expect(NUKETOWN2_AUTHORED.ambientIntensity).toBe(nuketown2Definition.lighting.ambientIntensity);
    expect(NUKETOWN2_AUTHORED.fogColor).toBe(nuketown2Definition.fog.color);
    expect(NUKETOWN2_AUTHORED.fogNear).toBe(nuketown2Definition.fog.near);
    expect(NUKETOWN2_AUTHORED.fogFar).toBe(nuketown2Definition.fog.far);
    expect(NUKETOWN2_AUTHORED.exposure).toBe(nuketown2Definition.colorPipeline.exposure);
    expect(NUKETOWN2_AUTHORED.skyPreset).toBe(nuketown2Definition.atmosphere.preset);
  });

  it('anchors the golden hour on the definition fog span, so the anchor frame is the shipped frame', () => {
    const anchor = NUKETOWN2_SKY_PRESETS[NUKETOWN2_ANCHOR_PRESET];
    expect(anchor.fogNear).toBe(nuketown2Definition.fog.near);
    expect(anchor.fogFar).toBe(nuketown2Definition.fog.far);
    expect(anchor.sunTint).toEqual([1, 1, 1]);
    expect(anchor.skyTint).toEqual([1, 1, 1]);
    expect(anchor.fogTint).toEqual([1, 1, 1]);
    expect(anchor.practicalEmissiveGain).toBe(1);
    expect(anchor.sunAzimuthDeltaDegrees).toBe(0);
  });
});

describe('Nuke Town Rebuild physical exposure derivation', () => {
  // EV100 = log2(E / 2.5). Checked against a hand-computed value rather than
  // against the function's own output, so a sign flip inside it fails here.
  it('derives EV100 by incident metering at C = 250, ISO 100', () => {
    expect(ev100FromLux(2.5)).toBeCloseTo(0, 12);
    expect(ev100FromLux(20_000)).toBeCloseTo(Math.log2(8000), 12);
  });

  it('places the three skies at the stops a light meter would read', () => {
    const morning = nuketown2PresetPhysics('late-morning');
    const golden = nuketown2PresetPhysics('golden-hour');
    const cloud = nuketown2PresetPhysics('overcast');
    expect(golden.stopsFromAnchor).toBe(0);
    expect(golden.physicalExposureScale).toBe(1);
    // 101 klx against 20.1 klx is 2.33 stops of daylight.
    expect(morning.stopsFromAnchor).toBeCloseTo(2.329, 2);
    expect(morning.physicalExposureScale).toBeCloseTo(0.199, 3);
    // A bright stratus deck is still 0.63 stops under a golden hour with a beam.
    expect(cloud.stopsFromAnchor).toBeCloseTo(-0.629, 2);
    expect(cloud.physicalExposureScale).toBeCloseTo(1.547, 2);
  });

  it('loses the beam under stratus without moving the sun', () => {
    const cloud = nuketown2PresetPhysics('overcast');
    expect(NUKETOWN2_SKY_PRESETS.overcast.directIlluminanceLux).toBe(0);
    expect(NUKETOWN2_SKY_PRESETS.overcast.sunElevationDegrees).toBeGreaterThan(
      NUKETOWN2_SKY_PRESETS['golden-hour'].sunElevationDegrees,
    );
    // Higher sun, weaker key: that is the cloud, not the geometry.
    expect(cloud.rawKeyScale).toBeLessThan(1);
  });

  it('states the readability floor as the arena authored composed shade', () => {
    expect(NUKETOWN2_SHADE_READABILITY_FLOOR).toBeCloseTo(0.4536, 6);
    expect(NUKETOWN2_SHADE_READABILITY_FLOOR).toBe(
      nuketown2Definition.lighting.ambientIntensity * nuketown2Definition.colorPipeline.exposure,
    );
  });
});

describe('Nuke Town Rebuild fog falloff', () => {
  it('reproduces the shipped 0.37 haze at the longest run under the anchor', () => {
    expect(linearFogCoverage(NUKETOWN2_LONGEST_SIGHTLINE_M, 58, 148)).toBeCloseTo(0.371, 3);
    expect(nuketown2LongestRunHaze('golden-hour')).toBeCloseTo(0.371, 3);
  });

  it('keeps every sky inside the aerial-perspective window at the longest run', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      const haze = nuketown2LongestRunHaze(id);
      expect(haze).toBeGreaterThanOrEqual(NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.minimum);
      expect(haze).toBeLessThanOrEqual(NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.maximum);
    }
  });

  it('orders the three skies by air clarity: clear morning, evening, stratus', () => {
    expect(nuketown2LongestRunHaze('late-morning'))
      .toBeLessThan(nuketown2LongestRunHaze('golden-hour'));
    expect(nuketown2LongestRunHaze('golden-hour'))
      .toBeLessThan(nuketown2LongestRunHaze('overcast'));
  });
});

describe('Nuke Town Rebuild interior practicals', () => {
  // The floors are mirrored from the material module; read its source so a
  // change to an emissive vector fails HERE rather than dimming the fixtures
  // silently at runtime.
  it('mirrors the emissive floors the ceiling-light material actually authors', () => {
    const source = readFileSync(new URL('../nuketown2-interior-materials.ts', import.meta.url), 'utf8');
    expect(source).toContain('mat.emissiveNode = vec3(2.6, 2.1, 1.4);');
    expect(source).toContain('mat.emissiveNode = vec3(1.8, 2.3, 3.1);');
    expect(NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.warm).toBe(1.4);
    expect(NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.cold).toBe(1.8);
  });

  it('keeps every fixture above the composed bloom threshold under every sky', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      expect(nuketown2PracticalEmissiveFloor(id)).toBeGreaterThan(MINIMUM_COMPOSED_BLOOM_THRESHOLD);
    }
  });

  it('pushes the practicals hardest under the sky that fights them hardest', () => {
    expect(NUKETOWN2_SKY_PRESETS['late-morning'].practicalEmissiveGain)
      .toBeGreaterThan(NUKETOWN2_SKY_PRESETS.overcast.practicalEmissiveGain);
    expect(NUKETOWN2_SKY_PRESETS.overcast.practicalEmissiveGain)
      .toBeGreaterThan(NUKETOWN2_SKY_PRESETS['golden-hour'].practicalEmissiveGain);
  });
});

describe('Nuke Town Rebuild baked indirect and filmic post', () => {
  it('never composes a baked-indirect gain over the shipped ceiling', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      for (const tier of ['off', 'low', 'high'] as const) {
        const composed = nuketown2BakedIndirectComposite(id, tier);
        expect(composed).toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_GAIN);
        expect(composed).toBeCloseTo(
          resolveBakedIndirectTuning(tier).composite * NUKETOWN2_SKY_PRESETS[id].bakedIndirect.compositeScale,
          12,
        );
      }
    }
  });

  it('prefers the higher bake tier under the two skies whose light is mostly indirect', () => {
    expect(NUKETOWN2_SKY_PRESETS['late-morning'].bakedIndirect.preferredTier).toBe('high');
    expect(NUKETOWN2_SKY_PRESETS.overcast.bakedIndirect.preferredTier).toBe('high');
    expect(NUKETOWN2_SKY_PRESETS['golden-hour'].bakedIndirect.preferredTier).toBe('low');
  });

  it('stays inside every shipped filmic ceiling once composed with the art-direction row', () => {
    const row = artDirectionForArena('nuketown2');
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      const filmic = NUKETOWN2_SKY_PRESETS[id].filmic;
      // Bloom thresholds may only ever move UP, per the art-direction rule.
      expect(filmic.bloomThresholdScale).toBeGreaterThanOrEqual(1);
      expect(row.bloom.thresholdScale * filmic.bloomThresholdScale)
        .toBeGreaterThan(MINIMUM_COMPOSED_BLOOM_THRESHOLD);
      expect(filmic.godrayAdditiveGain).toBeLessThanOrEqual(GODRAY_MAXIMUM_ADDITIVE_GAIN);
      expect(row.vignette.base * filmic.vignetteScale).toBeLessThanOrEqual(DISPLAY_VIGNETTE_MAXIMUM);
      expect(row.midtoneContrastDelta + filmic.midtoneContrastDelta)
        .toBeLessThanOrEqual(MAXIMUM_COMPOSED_MIDTONE_CONTRAST);
      expect(row.midtoneContrastDelta + filmic.midtoneContrastDelta).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every authored value inside the shipped lighting-condition envelope', () => {
    expect(() => assertNuketown2PresetSafety()).not.toThrow();
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      const entry = NUKETOWN2_SKY_PRESETS[id];
      expect(entry.sunElevationDegrees)
        .toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum);
      expect(entry.sunElevationDegrees)
        .toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.maximum);
    }
  });
});
