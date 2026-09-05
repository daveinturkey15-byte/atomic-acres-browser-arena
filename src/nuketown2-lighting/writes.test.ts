import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  LIGHTING_CONDITION_BOUNDS,
  SWEPT_SKY_DARKEN,
  lightingConditionWritesEqual,
  lightingConditionsAreIdentity,
  type LightingConditionWrites,
} from '../rendering/lighting-conditions';
import {
  NUKETOWN2_ANCHOR_PRESET,
  NUKETOWN2_SHADE_READABILITY_FLOOR,
  NUKETOWN2_SKY_PRESET_IDS,
  NUKETOWN2_SKY_PRESETS,
  nuketown2SkyPreset,
} from './presets';
import {
  NUKETOWN2_ARENA_ID,
  NUKETOWN2_CHOICE_PRESETS,
  assertNuketown2LightingSafety,
  nuketown2ComposedShadeResponse,
  nuketown2PresetForChoice,
  nuketown2PresetForFixedHour,
  resolveNuketown2LightingConditions,
  resolveNuketown2Sky,
} from './writes';

const atCapture = (id: (typeof NUKETOWN2_SKY_PRESET_IDS)[number], skyDarkenAmount = 0) =>
  resolveNuketown2LightingConditions({
    arenaId: NUKETOWN2_ARENA_ID,
    fixedHour: nuketown2SkyPreset(id).captureHour,
    skyDarkenAmount,
  });

describe('Nuke Town Rebuild lighting: the anchor is the shipped frame', () => {
  // The single most important property in this directory. If the anchor is not
  // the identity, selecting GOLDEN HOUR does not render the PASS 93 arena and
  // every capture baseline in the repo silently moves.
  it('resolves the golden hour to the exact identity', () => {
    const writes = atCapture('golden-hour');
    expect(lightingConditionsAreIdentity(writes)).toBe(true);
    expect(writes.sunIntensityScale).toBe(1);
    expect(writes.shadowFloorScale).toBe(1);
    expect(writes.exposureScale).toBe(1);
    expect(writes.sunElevationDeltaDegrees).toBe(0);
    expect(writes.sunAzimuthDeltaDegrees).toBe(0);
    expect(writes.deviation).toBe(0);
  });

  it('resolves the identity through the replicated choice as well as the capture hour', () => {
    for (const choice of ['authored', 'late'] as const) {
      const writes = resolveNuketown2LightingConditions({ arenaId: NUKETOWN2_ARENA_ID, choice });
      expect(lightingConditionsAreIdentity(writes)).toBe(true);
    }
  });

  it('reports this arena id on every write, so the applier baseline gate matches', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) expect(atCapture(id).arenaId).toBe(NUKETOWN2_ARENA_ID);
  });
});

describe('Nuke Town Rebuild lighting: selection through the shipped config', () => {
  it('maps the replicated time-of-day choice onto the three skies', () => {
    expect(NUKETOWN2_CHOICE_PRESETS).toEqual({
      authored: 'golden-hour',
      early: 'late-morning',
      midday: 'overcast',
      late: 'golden-hour',
    });
    expect(nuketown2PresetForChoice('early', 0, 0)).toBe('late-morning');
    expect(nuketown2PresetForChoice('midday', 0, 0)).toBe('overcast');
    expect(nuketown2PresetForChoice('late', 0, 0)).toBe('golden-hour');
    expect(nuketown2PresetForChoice(undefined, 0, 0)).toBe(NUKETOWN2_ANCHOR_PRESET);
  });

  it('derives random and cycle purely, so every peer computes the same sky', () => {
    for (const seed of [0, 1, 7, 99, 123_457, 2 ** 31]) {
      expect(nuketown2PresetForChoice('random', seed, 0))
        .toBe(nuketown2PresetForChoice('random', seed, 0));
      expect(NUKETOWN2_SKY_PRESET_IDS).toContain(nuketown2PresetForChoice('random', seed, 0));
    }
    // Cycle traverses all five inside one 6-minute period and wraps cleanly.
    const seen = new Set<string>();
    for (let second = 0; second < 360; second += 5) seen.add(nuketown2PresetForChoice('cycle', 0, second));
    expect([...seen].sort()).toEqual(['dawn', 'golden-hour', 'late-morning', 'night', 'overcast']);
    expect(nuketown2PresetForChoice('cycle', 0, 361)).toBe(nuketown2PresetForChoice('cycle', 0, 1));
    expect(nuketown2PresetForChoice('cycle', 0, -1)).toBe(nuketown2PresetForChoice('cycle', 0, 359));
  });

  it('addresses each sky by its own capture hour, for deterministic captures', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      expect(nuketown2PresetForFixedHour(nuketown2SkyPreset(id).captureHour)).toBe(id);
    }
    expect(nuketown2PresetForFixedHour(10.4)).toBe('late-morning');
    expect(nuketown2PresetForFixedHour(18)).toBe('golden-hour');
    expect(nuketown2PresetForFixedHour(20)).toBe('night');
    expect(nuketown2PresetForFixedHour(5)).toBe('dawn');
  });

  it('tolerates junk without throwing, because a URL is untrusted input', () => {
    const writes = resolveNuketown2LightingConditions({
      arenaId: NUKETOWN2_ARENA_ID,
      matchSeed: Number.NaN,
      elapsedSeconds: Number.POSITIVE_INFINITY,
      skyDarkenAmount: Number.NaN,
      choice: 'random',
    });
    expect(Number.isFinite(writes.sunIntensityScale)).toBe(true);
    expect(Number.isFinite(writes.exposureScale)).toBe(true);
  });
});

describe('Nuke Town Rebuild lighting: runtime writes are uniform writes only', () => {
  // THE FROZEN LIGHT SET RULE, AS A PROPERTY OF THE SOURCE. A light constructed
  // or a material node built in this directory would invalidate every pipeline
  // and freeze the game, and it would also mean this lane owes a menu-time
  // precompile entry. Neither is true, and this is what keeps it true.
  it('constructs no light, material, node or texture anywhere in the module', () => {
    for (const file of ['presets.ts', 'writes.ts', 'index.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from ['"]three/);
      expect(source).not.toMatch(/\bnew THREE\./);
      expect(source).not.toMatch(/\bnew (Directional|Ambient|Hemisphere|Point|Spot|Rect)\w*Light\b/);
      expect(source).not.toMatch(/\bNodeMaterial\b/);
      expect(source).not.toMatch(/\bShaderMaterial\b/);
      expect(source).not.toMatch(/from ['"]three\/tsl['"]/);
    }
  });

  it('emits only the shipped write record, so no new runtime plumbing exists', () => {
    const writes = atCapture('overcast');
    expect(Object.keys(writes).sort()).toEqual([
      'ambientIntensityScale', 'ambientTint', 'arenaId', 'deviation', 'exposureScale',
      'fillIntensityScale', 'fillTint', 'fogTint', 'hemisphereGroundTint', 'hemisphereIntensityScale',
      'hemisphereSkyTint', 'hour', 'shadowFloorScale', 'sunAzimuthDeltaDegrees',
      'sunElevationDeltaDegrees', 'sunIntensityScale', 'sunTint',
    ]);
    expect(Object.isFrozen(writes)).toBe(true);
  });

  it('is stable enough for the applier per-frame equality gate to suppress no-ops', () => {
    const a = atCapture('late-morning');
    const b = atCapture('late-morning');
    expect(lightingConditionWritesEqual(a, b)).toBe(true);
    expect(lightingConditionWritesEqual(a, atCapture('overcast'))).toBe(false);
  });
});

describe('Nuke Town Rebuild lighting: the competitive readability floor', () => {
  it('never composes a shade darker than the arena authored shade, in any sky', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      expect(nuketown2ComposedShadeResponse(atCapture(id)))
        .toBeGreaterThanOrEqual(NUKETOWN2_SHADE_READABILITY_FLOOR - 1e-9);
    }
  });

  it('holds the floor across the whole weather blend, not just at the ends', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      for (let step = 0; step <= 128; step += 1) {
        const skyDarkenAmount = step / 128;
        const writes = atCapture(id, skyDarkenAmount);
        expect(nuketown2ComposedShadeResponse(writes))
          .toBeGreaterThanOrEqual(NUKETOWN2_SHADE_READABILITY_FLOOR - 1e-9);
      }
    }
  });

  it('holds the floor at every shipped weather rung', () => {
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      for (const skyDarkenAmount of SWEPT_SKY_DARKEN) {
        expect(nuketown2ComposedShadeResponse(atCapture(id, skyDarkenAmount)))
          .toBeGreaterThanOrEqual(NUKETOWN2_SHADE_READABILITY_FLOOR - 1e-9);
      }
    }
  });

  it('touches the floor exactly at the anchor, so the floor is the shipped arena', () => {
    expect(nuketown2ComposedShadeResponse(atCapture('golden-hour')))
      .toBeCloseTo(NUKETOWN2_SHADE_READABILITY_FLOOR, 12);
  });

  // The reason the physical exposure is not applied verbatim, stated as a test.
  it('refuses to stop down under a bright sky, whatever the light meter says', () => {
    const morning = atCapture('late-morning');
    expect(morning.exposureScale).toBe(1);
    expect(morning.exposureScale).toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.exposureScale.minimum);
  });

  it('never opens the shutter further than a re-metering camera would', () => {
    // Overcast meters 1.547x the anchor; the applied lift is far under that and
    // under the shipped envelope, so exposure is bounded by physics AND policy.
    const cloud = atCapture('overcast');
    expect(cloud.exposureScale).toBeGreaterThan(1);
    expect(cloud.exposureScale).toBeLessThan(1.547);
    expect(cloud.exposureScale).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.exposureScale.maximum);
  });

  it('lifts the shade when the sky dome is brighter, even though the key rose', () => {
    // `late-morning` is the case a key-drop-only model cannot see: its key is
    // at the ceiling, so the generic lift term is exactly zero while the real
    // dome delivers 2.5x the anchor's diffuse light.
    const morning = atCapture('late-morning');
    expect(morning.sunIntensityScale).toBe(LIGHTING_CONDITION_BOUNDS.sunIntensityScale.maximum);
    expect(morning.shadowFloorScale).toBeGreaterThan(1.2);
    expect(nuketown2ComposedShadeResponse(morning))
      .toBeGreaterThan(NUKETOWN2_SHADE_READABILITY_FLOOR * 1.2);
  });
});

describe('Nuke Town Rebuild lighting: weather composes toward the authored cloud deck', () => {
  it('reaches the cloud deck exactly at the top weather rung', () => {
    expect(resolveNuketown2Sky({ arenaId: NUKETOWN2_ARENA_ID, choice: 'early', skyDarkenAmount: 0.58 })
      .overcastBlend).toBeCloseTo(1, 12);
    expect(resolveNuketown2Sky({ arenaId: NUKETOWN2_ARENA_ID, choice: 'early', skyDarkenAmount: 0 })
      .overcastBlend).toBe(0);
    // A storm past the top rung cannot overshoot into an unauthored sky.
    expect(resolveNuketown2Sky({ arenaId: NUKETOWN2_ARENA_ID, choice: 'early', skyDarkenAmount: 5 })
      .overcastBlend).toBe(1);
  });

  it('lands on the authored overcast writes when a storm saturates any sky', () => {
    const target = atCapture('overcast');
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      expect(lightingConditionWritesEqual(atCapture(id, 0.58), target)).toBe(true);
    }
  });

  it('moves the key monotonically toward the stratus key as the storm builds', () => {
    const readings: number[] = [];
    for (let step = 0; step <= 32; step += 1) readings.push(atCapture('late-morning', (0.58 * step) / 32).sunIntensityScale);
    for (let index = 1; index < readings.length; index += 1) {
      expect(readings[index]).toBeLessThanOrEqual(readings[index - 1] + 1e-12);
    }
  });
});

describe('Nuke Town Rebuild lighting: the fail-closed sweep', () => {
  it('passes the whole authored space at import time', () => {
    expect(() => assertNuketown2LightingSafety()).not.toThrow();
  });

  it('keeps every write inside the shipped combat-safety envelope', () => {
    const check = (writes: LightingConditionWrites) => {
      expect(writes.sunIntensityScale)
        .toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunIntensityScale.minimum);
      expect(writes.sunIntensityScale)
        .toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunIntensityScale.maximum);
      expect(writes.shadowFloorScale)
        .toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.shadowFloorScale.minimum);
      expect(writes.shadowFloorScale)
        .toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.shadowFloorScale.maximum);
      for (const channel of [0, 1, 2] as const) {
        expect(writes.sunTint[channel])
          .toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.tintChannel.minimum);
        expect(writes.sunTint[channel])
          .toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.tintChannel.maximum);
        expect(writes.fogTint[channel])
          .toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.fogTintChannel.minimum);
        expect(writes.fogTint[channel])
          .toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.fogTintChannel.maximum);
      }
    };
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      for (const skyDarkenAmount of [...SWEPT_SKY_DARKEN, 0.1, 0.25, 0.4, 0.5, 0.58, 1]) {
        check(atCapture(id, skyDarkenAmount));
      }
    }
  });

  it('keeps the sun inside the arc envelope, so no sky puts it on the horizon', () => {
    const anchorElevation = NUKETOWN2_SKY_PRESETS[NUKETOWN2_ANCHOR_PRESET].sunElevationDegrees;
    for (const id of NUKETOWN2_SKY_PRESET_IDS) {
      for (let step = 0; step <= 32; step += 1) {
        const writes = atCapture(id, (0.58 * step) / 32);
        const elevation = anchorElevation + writes.sunElevationDeltaDegrees;
        expect(elevation).toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum);
        expect(elevation).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.maximum);
      }
    }
  });
});
