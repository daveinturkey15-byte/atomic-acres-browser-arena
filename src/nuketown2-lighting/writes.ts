/**
 * nuketown2-lighting/writes.ts — the Nuke Town Rebuild's sky, as uniform writes.
 *
 * WHAT THIS EMITS, AND WHY IT IS THAT EXACT RECORD. It returns the shipped
 * `LightingConditionWrites` and nothing else. That type is the game's existing
 * contract for "numbers a caller pushes into lights that already exist", and
 * `applyLightingConditionUniforms()` in `src/legacy-main.ts` is the only thing
 * that consumes it: it copies colours into `sunLight`/`ambientLight`/
 * `hemisphereLight`/`fillLight`, sets four intensities, tints `scene.fog.color`
 * and sets one exposure. No light is created, destroyed, parented, unparented
 * or toggled, so the WebGPU light set stays frozen and no material's cache key
 * moves. Reusing that record rather than inventing a second one is the whole
 * reason this lane adds no runtime plumbing: the applier, its per-frame gate,
 * its telemetry and its equality test all already exist and already work.
 *
 * WHY THIS ARENA HAS ITS OWN RESOLVER AT ALL. `resolveLightingConditions()`
 * places a sun on a continuous arc between two band ends. This arena is PINNED
 * in that table on purpose, and unpinning it means re-running
 * `scripts/qa/scan-lane-ab-band-readability.mjs` over a new band, which this
 * lane has not run. It also is not what the brief asked for: three AUTHORED
 * skies, one of them a cloud deck, and a stratus afternoon is not a point on a
 * sun arc. So the generic model keeps its pinned identity for this arena, this
 * module resolves the three named skies, and the caller asks this one first.
 *
 * HOW THE EXISTING CONFIG SELECTS THEM. No new setting, no new protocol field.
 * The shipped `LightingTimeChoice` already replicates through
 * `PrivateMatchConfig.timeOfDay` and is already documented as ARENA-RELATIVE
 * ("`late` means dusk on Nuke Town, night on RustRig"). On this arena:
 *
 *   early  -> LATE MORNING   (10:30, high near-white sun)
 *   midday -> OVERCAST       (14:00, 8/8 stratus over the same street)
 *   late   -> GOLDEN HOUR    (17:36, the shipped evening — the anchor)
 *   authored -> GOLDEN HOUR, and its writes are the exact identity
 *   random / cycle -> derived from (arenaId, matchSeed, elapsedSeconds), so
 *   every peer computes the same sky with zero bytes of traffic, exactly as the
 *   generic model does.
 *
 * WEATHER BLENDS TOWARD THE CLOUD DECK, IT DOES NOT NEUTRALISE. The generic
 * model pulls its excursion back toward the authored hour under weather,
 * because a storm has no golden hour. That is right, and here it has a better
 * destination than the identity: this arena HAS an authored storm sky, so
 * `skyDarkenAmount` blends the selected preset toward `overcast` instead. The
 * safety claim is unchanged and is checked over the whole blend rather than at
 * the ends — see `assertNuketown2LightingSafety()`.
 */

import type { ArenaId } from '../arena-identity';
import {
  LIGHTING_CONDITION_BOUNDS,
  SWEPT_SKY_DARKEN,
  type LightingConditionWrites,
  type LightingConditionsInput,
  type LightingTimeChoice,
  type Rgb3,
} from '../rendering/lighting-conditions';
import {
  NUKETOWN2_ANCHOR_PRESET,
  NUKETOWN2_AUTHORED,
  NUKETOWN2_SHADE_READABILITY_FLOOR,
  NUKETOWN2_SKY_PRESET_IDS,
  nuketown2SkyPreset,
  tintLuma,
  type Nuketown2SkyPreset,
  type Nuketown2SkyPresetId,
} from './presets';

/** The arena this module speaks for. Every other id belongs to the generic model. */
export const NUKETOWN2_ARENA_ID: ArenaId = 'nuketown2';

/**
 * How much of the key-light drop is returned to the shadow side. Mirrors
 * `SHADOW_LIFT_GAIN` in the generic model, deliberately: two lifts that
 * disagree would make a cross-arena readability claim untestable.
 */
const SHADOW_LIFT_GAIN = 1.15;

/** Exposure gain per unit of key drop. Also the generic model's. */
const EXPOSURE_LIFT_GAIN = 0.24;

/**
 * Dampening on the skylight lift. The sky dome under a 52-degree sun delivers
 * 2.5x the anchor's diffuse illuminance, and writing that straight into ambient
 * would wash the arena flat; ^0.35 keeps the DIRECTION of the physics (a
 * brighter dome lifts the shade) while landing inside the shipped
 * `shadowFloorScale` envelope. It is an exponent rather than a clamp so the
 * relationship stays monotonic in illuminance.
 */
const SKYLIGHT_LIFT_EXPONENT = 0.35;

/** `skyDarkenAmount` at which the sky is fully the authored cloud deck. */
const OVERCAST_SATURATION = 0.58;

/** Match minutes a full `cycle` traversal of the three skies takes. */
const CYCLE_MATCH_MINUTES = 6;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function mixTint(from: Rgb3, to: Rgb3, amount: number): Rgb3 {
  return [mix(from[0], to[0], amount), mix(from[1], to[1], amount), mix(from[2], to[2], amount)];
}

/** Deterministic 32-bit avalanche; identical shape to the weather model's. */
function hash32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * The choice-to-sky map. It is exported because it is the whole of the feature
 * a player can see, and a test that reads it is worth more than a comment that
 * describes it.
 */
export const NUKETOWN2_CHOICE_PRESETS: Readonly<Record<
  Exclude<LightingTimeChoice, 'random' | 'cycle'>, Nuketown2SkyPresetId
>> = Object.freeze({
  authored: 'golden-hour',
  early: 'late-morning',
  midday: 'overcast',
  late: 'golden-hour',
});

/**
 * Which sky a match is under, before weather. Pure in every argument, so host
 * and guest agree by derivation rather than by a message.
 */
export function nuketown2PresetForChoice(
  choice: LightingTimeChoice | undefined,
  matchSeed: number,
  elapsedSeconds: number,
): Nuketown2SkyPresetId {
  const resolved: LightingTimeChoice = choice ?? 'authored';
  if (resolved === 'random') {
    return NUKETOWN2_SKY_PRESET_IDS[hash32(Math.floor(finite(matchSeed, 0))) % NUKETOWN2_SKY_PRESET_IDS.length];
  }
  if (resolved === 'cycle') {
    const period = CYCLE_MATCH_MINUTES * 60;
    const phase = ((finite(elapsedSeconds, 0) % period) + period) % period;
    const slot = Math.floor((phase / period) * NUKETOWN2_SKY_PRESET_IDS.length);
    return NUKETOWN2_SKY_PRESET_IDS[Math.min(slot, NUKETOWN2_SKY_PRESET_IDS.length - 1)];
  }
  return NUKETOWN2_CHOICE_PRESETS[resolved];
}

/**
 * `fixedHour` addressing, for deterministic captures and `?tod=`. Each preset
 * owns a capture hour; the nearest one wins. This is how the three review
 * captures this lane owes are taken without adding a capture-only code path
 * that the player never runs.
 */
export function nuketown2PresetForFixedHour(hour: number): Nuketown2SkyPresetId {
  let best: Nuketown2SkyPresetId = NUKETOWN2_ANCHOR_PRESET;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of NUKETOWN2_SKY_PRESET_IDS) {
    const distance = Math.abs(nuketown2SkyPreset(id).captureHour - hour);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

/** The blended sky a frame is actually lit by: a preset, pulled toward stratus. */
export type Nuketown2ResolvedSky = Readonly<{
  presetId: Nuketown2SkyPresetId;
  /** 0 = the selected preset as authored, 1 = the authored cloud deck. */
  overcastBlend: number;
  sunElevationDegrees: number;
  sunAzimuthDeltaDegrees: number;
  sunTint: Rgb3;
  skyTint: Rgb3;
  fogTint: Rgb3;
  skyIlluminanceLux: number;
  fogNear: number;
  fogFar: number;
  practicalEmissiveGain: number;
}>;

function blendToward(entry: Nuketown2SkyPreset, amount: number): Nuketown2ResolvedSky {
  const cloud = nuketown2SkyPreset('overcast');
  return Object.freeze({
    presetId: entry.id,
    overcastBlend: amount,
    sunElevationDegrees: mix(entry.sunElevationDegrees, cloud.sunElevationDegrees, amount),
    sunAzimuthDeltaDegrees: mix(entry.sunAzimuthDeltaDegrees, cloud.sunAzimuthDeltaDegrees, amount),
    sunTint: Object.freeze(mixTint(entry.sunTint, cloud.sunTint, amount)) as Rgb3,
    skyTint: Object.freeze(mixTint(entry.skyTint, cloud.skyTint, amount)) as Rgb3,
    fogTint: Object.freeze(mixTint(entry.fogTint, cloud.fogTint, amount)) as Rgb3,
    skyIlluminanceLux: mix(entry.skyIlluminanceLux, cloud.skyIlluminanceLux, amount),
    fogNear: mix(entry.fogNear, cloud.fogNear, amount),
    fogFar: mix(entry.fogFar, cloud.fogFar, amount),
    practicalEmissiveGain: mix(entry.practicalEmissiveGain, cloud.practicalEmissiveGain, amount),
  });
}

const DEG = Math.PI / 180;

function keyResponse(elevationDegrees: number, extinction: number): number {
  return Math.max(0.08, Math.sin(clamp(elevationDegrees, 1, 89) * DEG) * (1 - clamp01(extinction)));
}

/** The sky a frame is under, given the config the game already replicates. */
export function resolveNuketown2Sky(input: LightingConditionsInput): Nuketown2ResolvedSky {
  const selected = input.fixedHour !== undefined
    ? nuketown2PresetForFixedHour(finite(input.fixedHour, nuketown2SkyPreset(NUKETOWN2_ANCHOR_PRESET).captureHour))
    : nuketown2PresetForChoice(input.choice, finite(input.matchSeed, 0), finite(input.elapsedSeconds, 0));
  const blend = clamp01(finite(input.skyDarkenAmount, 0) / OVERCAST_SATURATION);
  return blendToward(nuketown2SkyPreset(selected), blend);
}

/**
 * THE RESOLVE. Pure, allocation-bounded, and shaped so the caller's existing
 * per-frame gate (`lightingConditionWritesEqual`) keeps working unchanged.
 */
export function resolveNuketown2LightingConditions(
  input: LightingConditionsInput,
): LightingConditionWrites {
  const anchor = nuketown2SkyPreset(NUKETOWN2_ANCHOR_PRESET);
  const sky = resolveNuketown2Sky(input);
  const preset = nuketown2SkyPreset(sky.presetId);

  // The cloud extinction travels with the blend: a golden hour pulled halfway
  // into stratus has lost half its beam, not none of it.
  const extinction = mix(preset.cloudExtinction, nuketown2SkyPreset('overcast').cloudExtinction, sky.overcastBlend);
  const anchorKey = keyResponse(anchor.sunElevationDegrees, anchor.cloudExtinction);
  const key = keyResponse(sky.sunElevationDegrees, extinction);
  const sunIntensityScale = clamp(
    key / anchorKey,
    LIGHTING_CONDITION_BOUNDS.sunIntensityScale.minimum,
    LIGHTING_CONDITION_BOUNDS.sunIntensityScale.maximum,
  );

  // TWO INDEPENDENT REASONS THE SHADOW SIDE RISES, AND THE LARGER WINS.
  //   1. The generic model's invariant: whatever the key gave up, the shadow
  //      gets back with gain. Zero when the key is at or above authored.
  //   2. The physics this arena's own table carries: the sky dome under a high
  //      sun is 2.5x brighter than under the anchor's, and that light lands in
  //      the shade whether or not the key moved. `late-morning` is the case the
  //      first term cannot see at all — its key ROSE, so term 1 is exactly zero
  //      while the real shade is much brighter than the anchor's.
  const drop = Math.max(0, 1 - sunIntensityScale);
  const skylightLift = Math.pow(
    Math.max(1e-6, sky.skyIlluminanceLux) / Math.max(1e-6, anchor.skyIlluminanceLux),
    SKYLIGHT_LIFT_EXPONENT,
  );
  const shadowFloorScale = clamp(
    Math.max(1 + drop * SHADOW_LIFT_GAIN, skylightLift),
    LIGHTING_CONDITION_BOUNDS.shadowFloorScale.minimum,
    LIGHTING_CONDITION_BOUNDS.shadowFloorScale.maximum,
  );

  // EXPOSURE IS BOUNDED BY THE PHYSICS FROM ABOVE AND BY THE FLOOR FROM BELOW.
  // A camera re-metering under this sky would multiply the anchor's stop by
  // `physicalExposureScale`; the applied value is never allowed to exceed that
  // (it would be a lie about the sky) and never allowed below 1 (that is the
  // stop-down that hides a defender). Under `late-morning` the physical ratio
  // is 0.199 and the applied value is therefore exactly 1: the extra light goes
  // into the key and the dome, not into the shutter.
  const totalLux = mix(
    preset.directIlluminanceLux, nuketown2SkyPreset('overcast').directIlluminanceLux, sky.overcastBlend,
  ) + sky.skyIlluminanceLux;
  const anchorLux = anchor.directIlluminanceLux + anchor.skyIlluminanceLux;
  const physicalExposureScale = anchorLux / Math.max(1e-6, totalLux);
  const exposureScale = clamp(
    Math.min(1 + drop * EXPOSURE_LIFT_GAIN, Math.max(1, physicalExposureScale)),
    LIGHTING_CONDITION_BOUNDS.exposureScale.minimum,
    LIGHTING_CONDITION_BOUNDS.exposureScale.maximum,
  );

  // The ground half of the hemisphere is bounce off the arena's own asphalt and
  // lawn, so it follows the SUN's colour rather than the sky's, at 45% strength
  // — the same opposition the generic model uses, for the same reason: it is
  // most of what makes a low sun read as a low sun rather than as a filter.
  const groundTint: Rgb3 = [
    mix(sky.sunTint[0], 1, 0.45), mix(sky.sunTint[1], 1, 0.45), mix(sky.sunTint[2], 1, 0.45),
  ];

  const fogBound = LIGHTING_CONDITION_BOUNDS.fogTintChannel;
  const fogTint: Rgb3 = [
    clamp(sky.fogTint[0], fogBound.minimum, fogBound.maximum),
    clamp(sky.fogTint[1], fogBound.minimum, fogBound.maximum),
    clamp(sky.fogTint[2], fogBound.minimum, fogBound.maximum),
  ];

  const elevation = clamp(
    sky.sunElevationDegrees,
    LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum,
    LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.maximum,
  );

  // `hour` and `deviation` keep their published meanings for the telemetry and
  // the debug panel: the capture hour of the sky in force, and how far this
  // frame is from the anchor sky. A caller that only knows the generic contract
  // reads both correctly.
  const hour = mix(preset.captureHour, nuketown2SkyPreset('overcast').captureHour, sky.overcastBlend);
  const deviation = sky.presetId === NUKETOWN2_ANCHOR_PRESET && sky.overcastBlend === 0
    ? 0
    : clamp01(Math.max(
      Math.abs(elevation - anchor.sunElevationDegrees) / 41,
      sky.overcastBlend,
    ));

  return Object.freeze({
    arenaId: NUKETOWN2_ARENA_ID,
    hour,
    deviation,
    sunIntensityScale,
    sunTint: Object.freeze([sky.sunTint[0], sky.sunTint[1], sky.sunTint[2]] as const),
    sunElevationDeltaDegrees: elevation - anchor.sunElevationDegrees,
    sunAzimuthDeltaDegrees: clamp(
      sky.sunAzimuthDeltaDegrees,
      LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.minimum,
      LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.maximum,
    ),
    ambientIntensityScale: shadowFloorScale,
    ambientTint: Object.freeze([sky.skyTint[0], sky.skyTint[1], sky.skyTint[2]] as const),
    hemisphereIntensityScale: shadowFloorScale,
    hemisphereSkyTint: Object.freeze([sky.skyTint[0], sky.skyTint[1], sky.skyTint[2]] as const),
    hemisphereGroundTint: Object.freeze([groundTint[0], groundTint[1], groundTint[2]] as const),
    fillIntensityScale: shadowFloorScale,
    fillTint: Object.freeze([sky.skyTint[0], sky.skyTint[1], sky.skyTint[2]] as const),
    fogTint: Object.freeze([fogTint[0], fogTint[1], fogTint[2]] as const),
    exposureScale,
    shadowFloorScale,
  });
}

/**
 * THE READABILITY METRIC, in one number. Authored ambient intensity x the
 * resolved ambient scale x the luma of the resolved ambient tint x the arena's
 * authored exposure x the resolved exposure scale. It is exactly the product
 * the applier writes into a surface that the key never reaches, which is what
 * "the shade" means on a competitive map.
 */
export function nuketown2ComposedShadeResponse(writes: LightingConditionWrites): number {
  return NUKETOWN2_AUTHORED.ambientIntensity
    * writes.ambientIntensityScale
    * tintLuma(writes.ambientTint)
    * NUKETOWN2_AUTHORED.exposure
    * writes.exposureScale;
}

function assertWithin(
  label: string,
  value: number,
  bounds: Readonly<{ minimum: number; maximum: number }>,
): void {
  if (!Number.isFinite(value) || value < bounds.minimum - 1e-9 || value > bounds.maximum + 1e-9) {
    throw new Error(
      `Nuke Town Rebuild lighting combat-safety violation: ${label} = ${value} `
      + `escapes [${bounds.minimum}, ${bounds.maximum}]`,
    );
  }
}

/**
 * Fails closed over the WHOLE space this lane can reach: every named sky, every
 * selection route, a fine sweep of the weather blend, and the shipped weather
 * rungs the generic model is swept at. Nothing is asserted at a single point,
 * because a bound that only holds at the ends is not a bound.
 */
export function assertNuketown2LightingSafety(): void {
  const sweep: number[] = [...SWEPT_SKY_DARKEN];
  for (let step = 0; step <= 64; step += 1) sweep.push((OVERCAST_SATURATION * step) / 64);
  for (const presetId of NUKETOWN2_SKY_PRESET_IDS) {
    const captureHour = nuketown2SkyPreset(presetId).captureHour;
    for (const skyDarkenAmount of sweep) {
      const writes = resolveNuketown2LightingConditions({
        arenaId: NUKETOWN2_ARENA_ID, fixedHour: captureHour, skyDarkenAmount,
      });
      const where = `'${presetId}' at skyDarken ${skyDarkenAmount.toFixed(4)}`;
      assertWithin(`${where} sunIntensityScale`, writes.sunIntensityScale,
        LIGHTING_CONDITION_BOUNDS.sunIntensityScale);
      assertWithin(`${where} shadowFloorScale`, writes.shadowFloorScale,
        LIGHTING_CONDITION_BOUNDS.shadowFloorScale);
      assertWithin(`${where} exposureScale`, writes.exposureScale,
        LIGHTING_CONDITION_BOUNDS.exposureScale);
      assertWithin(`${where} sun elevation`,
        writes.sunElevationDeltaDegrees + nuketown2SkyPreset(NUKETOWN2_ANCHOR_PRESET).sunElevationDegrees,
        LIGHTING_CONDITION_BOUNDS.sunElevationDegrees);
      assertWithin(`${where} sunAzimuthDeltaDegrees`, writes.sunAzimuthDeltaDegrees,
        LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees);
      for (const channel of [0, 1, 2] as const) {
        assertWithin(`${where} sunTint[${channel}]`, writes.sunTint[channel],
          LIGHTING_CONDITION_BOUNDS.tintChannel);
        assertWithin(`${where} ambientTint[${channel}]`, writes.ambientTint[channel],
          LIGHTING_CONDITION_BOUNDS.tintChannel);
        assertWithin(`${where} fogTint[${channel}]`, writes.fogTint[channel],
          LIGHTING_CONDITION_BOUNDS.fogTintChannel);
      }
      // THE CLAMP THE BRIEF ASKED FOR, ENFORCED.
      const shade = nuketown2ComposedShadeResponse(writes);
      if (shade < NUKETOWN2_SHADE_READABILITY_FLOOR - 1e-9) {
        throw new Error(
          `Nuke Town Rebuild shade readability floor breached by ${where}: composed shade response `
          + `${shade} is below the authored floor ${NUKETOWN2_SHADE_READABILITY_FLOOR}`,
        );
      }
    }
  }
}

assertNuketown2LightingSafety();
