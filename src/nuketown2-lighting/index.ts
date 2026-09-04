/**
 * nuketown2-lighting — the Nuke Town Rebuild's sun, sky, fog, practicals and
 * filmic post, authored as three named times of day and delivered as uniform
 * writes into the frozen light set.
 *
 * The runtime seam is one call: `resolveNuketown2LightingConditions(input)`
 * returns the shipped `LightingConditionWrites`, so
 * `applyLightingConditionUniforms()` in `src/legacy-main.ts` consumes it with
 * no change to its gate, its telemetry or its equality test. Everything else
 * here is authored data and the assertions that keep it honest.
 */

export {
  INCIDENT_METER_CONSTANT,
  NUKETOWN2_ANCHOR_PRESET,
  NUKETOWN2_AUTHORED,
  NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS,
  NUKETOWN2_LONGEST_SIGHTLINE_M,
  NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE,
  NUKETOWN2_SHADE_READABILITY_FLOOR,
  NUKETOWN2_SKY_PRESET_IDS,
  NUKETOWN2_SKY_PRESET_LABELS,
  NUKETOWN2_SKY_PRESETS,
  assertNuketown2PresetSafety,
  ev100FromLux,
  linearFogCoverage,
  nuketown2BakedIndirectComposite,
  nuketown2LongestRunHaze,
  nuketown2PracticalEmissiveFloor,
  nuketown2PresetPhysics,
  nuketown2SkyPreset,
  tintLuma,
  type Nuketown2PresetPhysics,
  type Nuketown2SkyPreset,
  type Nuketown2SkyPresetId,
} from './presets';

export {
  NUKETOWN2_ARENA_ID,
  NUKETOWN2_CHOICE_PRESETS,
  assertNuketown2LightingSafety,
  nuketown2ComposedShadeResponse,
  nuketown2PresetForChoice,
  nuketown2PresetForFixedHour,
  resolveNuketown2LightingConditions,
  resolveNuketown2Sky,
  type Nuketown2ResolvedSky,
} from './writes';
