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

// Coordinator wiring pass, 2026-09-09, request 1 of 2 from the fix-nuketown-tod lane. The lane
// built and tested a continuous day cycle over the three AUTHORED presets and correctly could not
// mount it - it held only its own new file. Four features this week shipped as modules nothing
// imported, so the wiring is now owned centrally rather than left to whichever lane happens to
// hold legacy-main.ts.
export {
  NUKETOWN2_DAY_CYCLE_PRACTICAL_FULL_BELOW_DEGREES,
  NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST,
  NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES,
  nuketown2DayCycle,
  nuketown2DayCyclePracticalFloor,
} from './day-cycle';
