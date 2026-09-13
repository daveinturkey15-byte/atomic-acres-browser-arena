import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LIGHTING_CONDITION_BOUNDS, lightingConditionsAreIdentity } from '../rendering/lighting-conditions';
import {
  DISPLAY_VIGNETTE_MAXIMUM,
  MAXIMUM_COMPOSED_MIDTONE_CONTRAST,
  MINIMUM_COMPOSED_BLOOM_THRESHOLD,
} from '../rendering/art-direction';
import { GODRAY_MAXIMUM_ADDITIVE_GAIN } from '../rendering/screen-space-post-profile';
import {
  NUKETOWN2_AUTHORED,
  NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS,
  NUKETOWN2_LONGEST_SIGHTLINE_M,
  NUKETOWN2_SHADE_READABILITY_FLOOR,
  linearFogCoverage,
  nuketown2PracticalEmissiveFloor,
  nuketown2SkyPreset,
  tintLuma,
} from './presets';
import {
  NUKETOWN2_ARENA_ID,
  nuketown2ComposedShadeResponse,
  resolveNuketown2LightingConditions,
} from './writes';
import {
  NUKETOWN2_DAY_CYCLE_PRACTICAL_FULL_BELOW_DEGREES,
  NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST,
  NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES,
  nuketown2DayCycle,
  nuketown2DayCyclePracticalFloor,
} from './day-cycle';

const SWEEP_STEPS = 240;
const sweepT = (): number[] => {
  const out: number[] = [0, 0.25, 0.55, 0.68, 0.82];
  for (let step = 0; step < SWEEP_STEPS; step += 1) out.push(step / SWEEP_STEPS);
  return out;
};

describe('Nuke Town day-cycle: ?tod=authored keeps today exact deterministic frame', () => {
  it('resolves the authored choice to the identity, untouched by the cycle', () => {
    const writes = resolveNuketown2LightingConditions({ arenaId: NUKETOWN2_ARENA_ID, choice: 'authored' });
    expect(lightingConditionsAreIdentity(writes)).toBe(true);
    expect(writes.sunIntensityScale).toBe(1);
    expect(writes.shadowFloorScale).toBe(1);
    expect(writes.exposureScale).toBe(1);
    expect(writes.sunElevationDeltaDegrees).toBe(0);
    expect(writes.sunAzimuthDeltaDegrees).toBe(0);
    expect(writes.deviation).toBe(0);
  });

  it('matches the golden-hour capture hour exactly, so boards do not move', () => {
    const viaChoice = resolveNuketown2LightingConditions({ arenaId: NUKETOWN2_ARENA_ID, choice: 'authored' });
    const viaHour = resolveNuketown2LightingConditions({
      arenaId: NUKETOWN2_ARENA_ID,
      fixedHour: nuketown2SkyPreset('golden-hour').captureHour,
    });
    expect(viaHour).toEqual(viaChoice);
  });

  it('reproduces the authored knots byte-for-byte: the cycle starts from today', () => {
    expect(nuketown2DayCycle(0.25)).toEqual(nuketown2SkyPreset('late-morning'));
    expect(nuketown2DayCycle(0.55)).toEqual(nuketown2SkyPreset('golden-hour'));
  });

  it('actually moves the sun: off-knot values leave the anchor behind', () => {
    expect(nuketown2DayCycle(0).sunElevationDegrees).toBeCloseTo(9, 12);
    expect(nuketown2DayCycle(0.82).directIlluminanceLux).toBe(0);
    expect(nuketown2DayCycle(0.82).sunElevationDegrees).toBe(
      LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum,
    );
  });
});

describe('Nuke Town day-cycle: one timetable, no phase drift', () => {
  it('peaks at the late-morning knot and bottoms out overnight', () => {
    let peak = -Infinity;
    let peakT = -1;
    for (const t of sweepT()) {
      const elevation = nuketown2DayCycle(t).sunElevationDegrees;
      if (elevation > peak) {
        peak = elevation;
        peakT = t;
      }
    }
    expect(peak).toBeCloseTo(52, 9);
    expect(peakT).toBeCloseTo(0.25, 9);
  });

  it('swings the azimuth monotonically across the day, home overnight', () => {
    const azimuths = [0, 0.25, 0.55, 0.68, 0.82].map((t) => nuketown2DayCycle(t).sunAzimuthDeltaDegrees);
    expect(azimuths).toEqual([-44, -34, 0, 12, 28]);
    expect(nuketown2DayCycle(0.999).sunAzimuthDeltaDegrees).toBeCloseTo(-44, 0);
  });

  it('mixes colours in linear RGB: the mid-segment value is the arithmetic mean', () => {
    // Halfway from late-morning (t=0.25) to golden-hour (t=0.55) is t=0.40.
    // Linear-light mixing lands exactly on the channel means; an sRGB-space
    // mix would sit elsewhere (darker mid). Pin the linear answer.
    const mid = nuketown2DayCycle(0.4);
    expect(mid.sunTint[0]).toBeCloseTo((0.96 + 1) / 2, 12);
    expect(mid.sunTint[1]).toBeCloseTo(1, 12);
    expect(mid.sunTint[2]).toBeCloseTo((1.16 + 1) / 2, 12);
    expect(mid.skyTint[0]).toBeCloseTo((0.95 + 1) / 2, 12);
    expect(mid.sunElevationDegrees).toBeCloseTo((52 + 11) / 2, 12);
  });

  it('is pure, wraps the day, and fails closed on garbage', () => {
    expect(nuketown2DayCycle(0.3)).toEqual(nuketown2DayCycle(0.3));
    expect(nuketown2DayCycle(1)).toEqual(nuketown2DayCycle(0));
    expect(nuketown2DayCycle(-0.1)).toEqual(nuketown2DayCycle(0.9));
    expect(nuketown2DayCycle(1.7)).toEqual(nuketown2DayCycle(0.7));
    expect(() => nuketown2DayCycle(Number.NaN)).toThrow();
    expect(() => nuketown2DayCycle(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('steps continuously: no pops in elevation, azimuth, tint or gain', () => {
    let maxElevationStep = 0;
    let maxAzimuthStep = 0;
    let maxTintStep = 0;
    let maxGainStep = 0;
    let previous = nuketown2DayCycle(0);
    for (let step = 1; step <= SWEEP_STEPS; step += 1) {
      const current = nuketown2DayCycle(step / SWEEP_STEPS);
      maxElevationStep = Math.max(maxElevationStep, Math.abs(current.sunElevationDegrees - previous.sunElevationDegrees));
      maxAzimuthStep = Math.max(maxAzimuthStep, Math.abs(current.sunAzimuthDeltaDegrees - previous.sunAzimuthDeltaDegrees));
      for (const channel of [0, 1, 2] as const) {
        maxTintStep = Math.max(
          maxTintStep,
          Math.abs(current.sunTint[channel] - previous.sunTint[channel]),
          Math.abs(current.skyTint[channel] - previous.skyTint[channel]),
        );
      }
      maxGainStep = Math.max(maxGainStep, Math.abs(current.practicalEmissiveGain - previous.practicalEmissiveGain));
      previous = current;
    }
    expect(maxElevationStep).toBeLessThan(1.5);
    expect(maxAzimuthStep).toBeLessThan(2.5);
    expect(maxTintStep).toBeLessThan(0.06);
    // Steepest slope is the dawn boost exit (C1 smoothstep, ~0.001/frame on a
    // 6-minute cycle): continuous, not a switch. The bound pins that.
    expect(maxGainStep).toBeLessThan(0.12);
  });
});

describe('Nuke Town day-cycle: practicals ramp over the dusk window, never switch', () => {
  it('agrees with the authored practical floors at the knots', () => {
    expect(nuketown2PracticalEmissiveFloor('late-morning')).toBeCloseTo(1.4 * 1.25, 12);
    expect(nuketown2PracticalEmissiveFloor('golden-hour')).toBeCloseTo(1.4 * 1.0, 12);
    expect(nuketown2DayCyclePracticalFloor(0.25)).toBeCloseTo(1.4 * 1.25, 12);
    expect(nuketown2DayCyclePracticalFloor(0.55)).toBeCloseTo(1.4 * 1.0, 12);
  });

  it('adds exactly zero lift at and above the anchor elevation', () => {
    expect(NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES).toBe(11);
    // Mid-day segment: base interpolates, boost contributes nothing.
    const mid = nuketown2DayCycle(0.4);
    expect(mid.practicalEmissiveGain).toBeCloseTo((1.25 + 1.0) / 2, 12);
  });

  it('rides full boost at dusk and at night, half-on at dawn', () => {
    expect(nuketown2DayCycle(0.68).practicalEmissiveGain).toBeCloseTo(
      1.0 + NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST, 12,
    );
    expect(nuketown2DayCycle(0.82).practicalEmissiveGain).toBeCloseTo(
      1.0 + NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST, 12,
    );
    const dawn = nuketown2DayCycle(0).practicalEmissiveGain;
    expect(dawn).toBeGreaterThan(1.1);
    expect(dawn).toBeLessThan(1.1 + NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST);
  });

  it('keeps every fixture a light source: floor above the bloom threshold at every t', () => {
    expect(NUKETOWN2_DAY_CYCLE_PRACTICAL_FULL_BELOW_DEGREES).toBe(6.5);
    for (const t of sweepT()) {
      expect(nuketown2DayCyclePracticalFloor(t)).toBeGreaterThan(MINIMUM_COMPOSED_BLOOM_THRESHOLD);
    }
  });
});

describe('Nuke Town day-cycle: the readability floor holds at every t', () => {
  it('stays inside the combat-safety envelope at every t', () => {
    const bounds = LIGHTING_CONDITION_BOUNDS;
    for (const t of sweepT()) {
      const preset = nuketown2DayCycle(t);
      expect(preset.sunElevationDegrees).toBeLessThanOrEqual(bounds.sunElevationDegrees.maximum + 1e-9);
      expect(preset.sunElevationDegrees).toBeGreaterThanOrEqual(bounds.sunElevationDegrees.minimum - 1e-9);
      expect(preset.sunAzimuthDeltaDegrees).toBeGreaterThanOrEqual(bounds.sunAzimuthDeltaDegrees.minimum - 1e-9);
      expect(preset.sunAzimuthDeltaDegrees).toBeLessThanOrEqual(bounds.sunAzimuthDeltaDegrees.maximum + 1e-9);
      for (const channel of [0, 1, 2] as const) {
        expect(preset.sunTint[channel]).toBeGreaterThanOrEqual(bounds.tintChannel.minimum - 1e-9);
        expect(preset.sunTint[channel]).toBeLessThanOrEqual(bounds.tintChannel.maximum + 1e-9);
        expect(preset.skyTint[channel]).toBeGreaterThanOrEqual(bounds.tintChannel.minimum - 1e-9);
        expect(preset.skyTint[channel]).toBeLessThanOrEqual(bounds.tintChannel.maximum + 1e-9);
        expect(preset.fogTint[channel]).toBeGreaterThanOrEqual(bounds.fogTintChannel.minimum - 1e-9);
        expect(preset.fogTint[channel]).toBeLessThanOrEqual(bounds.fogTintChannel.maximum + 1e-9);
      }
      expect(preset.filmic.bloomThresholdScale).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(preset.filmic.bloomThresholdScale).toBeLessThanOrEqual(1.4 + 1e-9);
      expect(preset.filmic.godrayAdditiveGain).toBeGreaterThanOrEqual(0 - 1e-9);
      expect(preset.filmic.godrayAdditiveGain).toBeLessThanOrEqual(GODRAY_MAXIMUM_ADDITIVE_GAIN + 1e-9);
      expect(0.07 * preset.filmic.vignetteScale).toBeLessThanOrEqual(DISPLAY_VIGNETTE_MAXIMUM + 1e-9);
      expect(0.08 + preset.filmic.midtoneContrastDelta).toBeLessThanOrEqual(
        MAXIMUM_COMPOSED_MIDTONE_CONTRAST + 1e-9,
      );
      expect(['low', 'high']).toContain(preset.bakedIndirect.preferredTier);
      expect(preset.bakedIndirect.compositeScale).toBe(1);
    }
  });

  it('keeps the longest-run haze inside the authored window at every t', () => {
    for (const t of sweepT()) {
      const preset = nuketown2DayCycle(t);
      const haze = linearFogCoverage(NUKETOWN2_LONGEST_SIGHTLINE_M, preset.fogNear, preset.fogFar);
      expect(haze).toBeGreaterThanOrEqual(NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.minimum - 1e-9);
      expect(haze).toBeLessThanOrEqual(NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.maximum + 1e-9);
    }
  });

  it('composes shade above the floor at every t, lifts aside', () => {
    // Sufficient and preset-level: the resolver clamps shadowFloorScale and
    // exposureScale from below at exactly 1, so composed shade is bounded
    // below by authored-ambient x tint luma x authored-exposure — and the
    // lifts it adds on top can only raise it. Sweep that lower bound.
    let minimum = Number.POSITIVE_INFINITY;
    for (const t of sweepT()) {
      const lowerBound = NUKETOWN2_AUTHORED.ambientIntensity
        * tintLuma(nuketown2DayCycle(t).skyTint)
        * NUKETOWN2_AUTHORED.exposure;
      minimum = Math.min(minimum, lowerBound);
      expect(lowerBound).toBeGreaterThanOrEqual(NUKETOWN2_SHADE_READABILITY_FLOOR);
    }
    expect(minimum).toBeGreaterThan(NUKETOWN2_SHADE_READABILITY_FLOOR * 5);
  });

  it('holds the true composed shade above the floor at the authored knots', () => {
    for (const id of ['late-morning', 'golden-hour'] as const) {
      const writes = resolveNuketown2LightingConditions({
        arenaId: NUKETOWN2_ARENA_ID,
        fixedHour: nuketown2SkyPreset(id).captureHour,
      });
      expect(nuketown2ComposedShadeResponse(writes)).toBeGreaterThanOrEqual(NUKETOWN2_SHADE_READABILITY_FLOOR);
    }
  });
});

describe('Nuke Town day-cycle: overcast is weather, not time', () => {
  it('never returns the weather state at any t', () => {
    for (const t of sweepT()) {
      expect(nuketown2DayCycle(t).id).not.toBe('overcast');
    }
  });

  it('leaves the authored stratus row exactly as found', () => {
    const cloud = nuketown2SkyPreset('overcast');
    expect(cloud.directIlluminanceLux).toBe(0);
    expect(cloud.captureHour).toBe(14);
    expect(cloud.cloudExtinction).toBeCloseTo(0.62, 12);
  });
});

describe('Nuke Town day-cycle: uniform writes only, like the rest of the directory', () => {
  it('constructs no light, material, node or texture', () => {
    const source = readFileSync(new URL('./day-cycle.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]three/);
    expect(source).not.toMatch(/\bnew THREE\./);
    expect(source).not.toMatch(/\bnew (Directional|Ambient|Hemisphere|Point|Spot|Rect)\w*Light\b/);
    expect(source).not.toMatch(/\bNodeMaterial\b/);
    expect(source).not.toMatch(/\bShaderMaterial\b/);
    expect(source).not.toMatch(/from ['"]three\/tsl['"]/);
  });
});
