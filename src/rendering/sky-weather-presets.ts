/**
 * sky-weather-presets.ts — PASS 95: named TIME-OF-DAY x WEATHER presets for
 * every arena, and the sun-following SKY BACKDROP intensity.
 *
 * WHAT ALREADY EXISTED, AND WHAT THIS ADDS
 * `lighting-conditions.ts` (Lane AB) resolves an HOUR into uniform writes over
 * the frozen light set; `weather-state.ts` (Pass 76) resolves a seeded weather
 * ladder; `nuketown2-lighting/` authors that arena's own skies. None of them
 * names a preset a player, a lobby row, a capture script or a match clock can
 * ask for by NAME — "night on Nuke Town", "light rain at dawn on the rig". This
 * module is that catalogue. It is derived from the roster (`ARENA_IDS`) and
 * from the tables those modules already export, so an arena that lands on the
 * integration line is covered here the moment it has a daylight row, and a
 * preset that would escape any shipped bound fails the import-time sweep.
 *
 * THE FROZEN LIGHT SET RULE (PASS 82) HOLDS HERE TOO. Nothing in this file
 * returns a light, a material or a node. It returns the SAME
 * `LightingConditionWrites` record the runtime already applies, plus one more
 * scalar — `backdropIntensity` — which the runtime writes into
 * `scene.backgroundIntensity`. In three r185's common renderer that scalar is a
 * uniform reference on the background node (`Background.js` multiplies the
 * background by `backgroundIntensity`), so a dimmer night sky is a uniform
 * write with no pipeline permutation, which is why it needs no menu-time
 * precompile entry and cannot trip the in-combat pipeline tripwire.
 *
 * BANDS ARE NOT WIDENED. Every generic arena's hour band was MEASURED by the
 * band-readability scan and this module addresses hours INSIDE it: `dawn` is
 * the band's early end, `day` its middle, `dusk` and `night` its late end. On
 * an arena whose band never reaches a low sun (Farcrysis, Test1) `night` is
 * therefore the same hour as `dusk` and reads as its darkest authored light,
 * not as a black screen; widening a band means re-running the scan, which is
 * the next lane's job, not a number to type here. The Nuke Town Rebuild owns
 * five authored skies and its four presets address them by capture hour.
 *
 * THIS FILE IS PURE. No THREE, no timers, no wall clock, no Math.random.
 */

import type { ArenaId } from '../arena-identity';
import { ARENA_IDS } from '../arena-identity';
import {
  ARENA_DAYLIGHT_PROFILES,
  arcElevationDegrees,
  resolveLightingConditions,
  type LightingConditionWrites,
  type Rgb3,
} from './lighting-conditions';
import {
  NUKETOWN2_ARENA_ID,
  NUKETOWN2_SKY_PRESETS,
  resolveNuketown2LightingConditions,
  type Nuketown2SkyPresetId,
} from '../nuketown2-lighting';
import { localLightFadeForHour } from './clustered-lights';
import {
  ARENA_WEATHER_PROFILES,
  WEATHER_SEVERITY_LADDER,
  WEATHER_STATE_TABLE,
  type WeatherState,
} from '../weather/weather-state';

/**
 * The arena's AUTHORED lighting, snapshotted when its visual definition is
 * applied; every uniform write composes on top of these numbers, so the
 * authored hour is always recoverable as the identity. Hoisted out of
 * `legacy-main.ts` by PASS 95 (the size ratchet is a hoist-only ceiling).
 */
export type LightingConditionBaseline = Readonly<{
  arenaId: ArenaId;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  fillColor: number;
  fillIntensity: number;
  fogColor: number;
  exposure: number;
}>;

/** The three channels and `setHex` a `THREE.Color` has; typed structurally so this file stays THREE-free. */
export type TintableColor = { r: number; g: number; b: number; setHex(hex: number): unknown };

/** Multiplies an authored colour by a bounded per-channel tint, in place, clamped to white. */
export function tintHexInto<T extends TintableColor>(target: T, hex: number, tint: Rgb3): T {
  target.setHex(hex);
  target.r = Math.min(1, target.r * tint[0]);
  target.g = Math.min(1, target.g * tint[1]);
  target.b = Math.min(1, target.b * tint[2]);
  return target;
}

export type SkyTimePresetId = 'dawn' | 'day' | 'dusk' | 'night';

export const SKY_TIME_PRESET_IDS: readonly SkyTimePresetId[] = Object.freeze(['dawn', 'day', 'dusk', 'night']);

/** The three weather presets the brief names; each is a shipped weather rung. */
export type WeatherPresetId = 'clear' | 'overcast' | 'light-rain';

export const WEATHER_PRESET_IDS: readonly WeatherPresetId[] = Object.freeze(['clear', 'overcast', 'light-rain']);

export const SKY_TIME_PRESET_LABELS: Readonly<Record<SkyTimePresetId, string>> = Object.freeze({
  dawn: 'DAWN',
  day: 'DAY',
  dusk: 'DUSK',
  night: 'NIGHT',
});

export const WEATHER_PRESET_LABELS: Readonly<Record<WeatherPresetId, string>> = Object.freeze({
  clear: 'CLEAR',
  overcast: 'OVERCAST',
  'light-rain': 'LIGHT RAIN',
});

export function isSkyTimePresetId(value: unknown): value is SkyTimePresetId {
  return typeof value === 'string' && (SKY_TIME_PRESET_IDS as readonly string[]).includes(value);
}

export function isWeatherPresetId(value: unknown): value is WeatherPresetId {
  return typeof value === 'string' && (WEATHER_PRESET_IDS as readonly string[]).includes(value);
}

/**
 * The Nuke Town Rebuild's four presets address its authored skies by name; the
 * fifth sky (`overcast`) is the weather axis, not the time axis, and is reached
 * through `skyDarkenAmount` exactly as the shipped resolver already does.
 */
export const NUKETOWN2_TIME_PRESET_SKIES: Readonly<Record<SkyTimePresetId, Nuketown2SkyPresetId>> = Object.freeze({
  dawn: 'dawn',
  day: 'late-morning',
  dusk: 'golden-hour',
  night: 'night',
});

/**
 * The hour a named time preset resolves to on an arena. Pinned arenas resolve
 * to their authored hour at every preset (the roof is in the table, not in
 * every consumer). Generic arenas address their MEASURED band; see the header.
 */
export function skyTimePresetHour(arenaId: ArenaId, preset: SkyTimePresetId): number {
  if (arenaId === NUKETOWN2_ARENA_ID) return NUKETOWN2_SKY_PRESETS[NUKETOWN2_TIME_PRESET_SKIES[preset]].captureHour;
  const daylight = ARENA_DAYLIGHT_PROFILES[arenaId];
  if (daylight.pinned) return daylight.authoredHour;
  const low = daylight.hourRange[0];
  const high = daylight.hourRange[1];
  switch (preset) {
    case 'dawn': return low;
    case 'day': return low + (high - low) * 0.5;
    case 'dusk':
    case 'night':
    default: return high;
  }
}

/**
 * The arena-configured preset: the named time whose hour is nearest the hour
 * the arena's shipped lighting was authored at, in clear weather. Derived, not
 * authored, so it cannot drift from the daylight table.
 */
export function arenaConfiguredSkyPreset(arenaId: ArenaId): Readonly<{ time: SkyTimePresetId; weather: WeatherPresetId }> {
  const authored = arenaId === NUKETOWN2_ARENA_ID
    ? NUKETOWN2_SKY_PRESETS['golden-hour'].captureHour
    : ARENA_DAYLIGHT_PROFILES[arenaId].authoredHour;
  let best: SkyTimePresetId = 'day';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of SKY_TIME_PRESET_IDS) {
    const distance = Math.abs(skyTimePresetHour(arenaId, preset) - authored);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = preset;
    }
  }
  return Object.freeze({ time: best, weather: 'clear' });
}

/**
 * The match-time preset: a match walks dawn -> day -> dusk -> night in equal
 * quarters of its authored length. Pure in both arguments so every peer agrees.
 */
export function matchTimeSkyPreset(elapsedSeconds: number, matchSeconds: number): SkyTimePresetId {
  const length = Number.isFinite(matchSeconds) && matchSeconds > 0 ? matchSeconds : 300;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const quarter = Math.min(3, Math.floor((elapsed / length) * 4));
  return SKY_TIME_PRESET_IDS[quarter];
}
/**
 * The match-time preset as an HOUR on an arena: the documented quarters of
 * `matchTimeSkyPreset()` addressed through `skyTimePresetHour()`. Pure in all
 * three arguments so every peer derives the same sun with zero traffic; the
 * existing sun-movement gate (`LIGHTING_CONDITION_SUN_STEP_DEGREES` in
 * legacy-main.ts) means the static shadow map refreshes only when the sun
 * actually moves between quarters.
 */
export function matchTimeSkyPresetHour(arenaId: ArenaId, elapsedSeconds: number, matchSeconds: number): number {
  return skyTimePresetHour(arenaId, matchTimeSkyPreset(elapsedSeconds, matchSeconds));
}
/**
 * The `cycle` match-clock hour for an arena: quarters walk with the match
 * length already resolved. `durationMs` is the replicated match length (null
 * on explore arenas, which run no clock); anything non-positive falls back to
 * the 300 s default `matchTimeSkyPreset()` itself uses, so the walk stays
 * defined everywhere and every peer agrees with zero traffic.
 */
export function cycleMatchFixedHour(arenaId: ArenaId, elapsedSeconds: number, durationMs: unknown): number {
  const matchSeconds = typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 300;
  return matchTimeSkyPresetHour(arenaId, elapsedSeconds, matchSeconds);
}

/**
 * A weather preset clamped to what the arena can reach: the highest available
 * rung at or below the requested one, so an indoor range asked for rain gets
 * `clear` rather than a contradiction of its own roof.
 */
export function arenaWeatherPresetState(arenaId: ArenaId, preset: WeatherPresetId): WeatherState {
  const available = ARENA_WEATHER_PROFILES[arenaId].availableStates;
  const requestedRung = WEATHER_SEVERITY_LADDER.indexOf(preset);
  let resolved: WeatherState = available[0];
  for (const state of available) {
    if (WEATHER_SEVERITY_LADDER.indexOf(state) <= requestedRung) resolved = state;
  }
  return resolved;
}

/**
 * The sky-backdrop intensity envelope. The floor keeps a silhouette against
 * the sky readable at night; the ceiling stops a bright noon from clipping the
 * generated panoramas. The authored hour in clear weather is exactly 1.
 */
export const SKY_BACKDROP_INTENSITY_BOUNDS = Object.freeze({ minimum: 0.3, maximum: 1.15 });

/** How much an 8/8 stratus deck (skyDarkenAmount 0.58) dims the dome. */
const OVERCAST_BACKDROP_DARKEN = 0.45;

const DEG = Math.PI / 180;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Absolute sun elevation the arena's shipped lighting was authored at. */
export function authoredSunElevationDegrees(arenaId: ArenaId): number {
  if (arenaId === NUKETOWN2_ARENA_ID) return NUKETOWN2_SKY_PRESETS['golden-hour'].sunElevationDegrees;
  const daylight = ARENA_DAYLIGHT_PROFILES[arenaId];
  return arcElevationDegrees(daylight, daylight.authoredHour);
}

/**
 * THE SUN-FOLLOWING SKY. Zenith luminance of a clear sky scales close to
 * linearly with the sine of the solar elevation (the Kittler/CIE clear-sky
 * relation over the elevations this game uses), so the backdrop is scaled by
 * the ratio of that term against the authored hour. Weather then dims the
 * dome in proportion to `skyDarkenAmount`. Bounded, and exactly 1 at the
 * authored hour in clear air, so a build at the authored preset shows the
 * PASS 94 sky to the bit.
 */
export function skyBackdropIntensity(writes: LightingConditionWrites, skyDarkenAmount = 0): number {
  const authored = authoredSunElevationDegrees(writes.arenaId);
  const elevation = authored + finite(writes.sunElevationDeltaDegrees, 0);
  const authoredTerm = Math.max(0.03, Math.sin(clamp(authored, 1, 89) * DEG));
  const term = Math.max(0.03, Math.sin(clamp(elevation, 1, 89) * DEG));
  const weather = 1 - OVERCAST_BACKDROP_DARKEN * clamp01(finite(skyDarkenAmount, 0) / 0.58);
  return clamp(
    (term / authoredTerm) * weather,
    SKY_BACKDROP_INTENSITY_BOUNDS.minimum,
    SKY_BACKDROP_INTENSITY_BOUNDS.maximum,
  );
}

export type SkyWeatherPresetInput = Readonly<{
  arenaId: ArenaId;
  time: SkyTimePresetId;
  weather: WeatherPresetId;
}>;

export type ResolvedSkyWeatherPreset = Readonly<{
  arenaId: ArenaId;
  time: SkyTimePresetId;
  weather: WeatherPresetId;
  /** The weather rung the arena can actually reach for this preset. */
  weatherState: WeatherState;
  /** The hour addressed, peer-identical. */
  hour: number;
  /** `skyDarkenAmount` of the resolved weather rung. */
  skyDarkenAmount: number;
  /** Ground wetness the rung drives toward (the wet-surface material hook's input). */
  wetnessTarget: number;
  /** Normalised rain rate the pooled rain presentation is driven by. */
  rainRate: number;
  /** The uniform writes over the frozen light set. */
  writes: LightingConditionWrites;
  /** `scene.backgroundIntensity` for this preset. */
  backdropIntensity: number;
  /** Clustered street/porch/window light fade at this hour (Nuke Town Rebuild). */
  localLightFade: number;
  /** URL query that reproduces this preset on a capture run. */
  captureQuery: string;
}>;

/** The whole preset, in one pure call. */
export function resolveSkyWeatherPreset(input: SkyWeatherPresetInput): ResolvedSkyWeatherPreset {
  const hour = skyTimePresetHour(input.arenaId, input.time);
  const weatherState = arenaWeatherPresetState(input.arenaId, input.weather);
  const rung = WEATHER_STATE_TABLE[weatherState];
  const resolve = input.arenaId === NUKETOWN2_ARENA_ID ? resolveNuketown2LightingConditions : resolveLightingConditions;
  const writes = resolve({ arenaId: input.arenaId, fixedHour: hour, skyDarkenAmount: rung.skyDarkenAmount });
  return Object.freeze({
    arenaId: input.arenaId,
    time: input.time,
    weather: input.weather,
    weatherState,
    hour,
    skyDarkenAmount: rung.skyDarkenAmount,
    wetnessTarget: rung.wetnessTarget,
    rainRate: rung.rainRate,
    writes,
    backdropIntensity: skyBackdropIntensity(writes, rung.skyDarkenAmount),
    localLightFade: input.arenaId === NUKETOWN2_ARENA_ID ? localLightFadeForHour(hour) : 0,
    captureQuery: `todhour=${hour}&weather=${weatherState}`,
  });
}

/** Rec.709 luma of a tint, for the readability sweep. */
function luma(tint: Rgb3): number {
  return tint[0] * 0.2126 + tint[1] * 0.7152 + tint[2] * 0.0722;
}

/**
 * Fails closed over the WHOLE catalogue at import time: every arena x every
 * time preset x every weather preset. The shade a defender stands in may never
 * be darker than the shipped arena (composed shade response >= 1), the
 * backdrop stays inside its envelope, and pinned arenas are provably constant.
 */
export function assertSkyWeatherPresetSafety(): void {
  for (const arenaId of ARENA_IDS) {
    for (const time of SKY_TIME_PRESET_IDS) {
      for (const weather of WEATHER_PRESET_IDS) {
        const resolved = resolveSkyWeatherPreset({ arenaId, time, weather });
        const shade = resolved.writes.ambientIntensityScale * luma(resolved.writes.ambientTint) * resolved.writes.exposureScale;
        if (!(shade >= 1 - 1e-9)) {
          throw new Error(
            `Sky/weather preset '${arenaId}' ${time}/${weather} composes a shade response of ${shade.toFixed(4)}, `
            + 'darker than the shipped arena; a defender in shade would be harder to read',
          );
        }
        if (!(resolved.writes.shadowFloorScale >= 1 - 1e-9)) {
          throw new Error(`Sky/weather preset '${arenaId}' ${time}/${weather} lowers the shadow floor`);
        }
        const intensity = resolved.backdropIntensity;
        if (!Number.isFinite(intensity)
          || intensity < SKY_BACKDROP_INTENSITY_BOUNDS.minimum - 1e-9
          || intensity > SKY_BACKDROP_INTENSITY_BOUNDS.maximum + 1e-9) {
          throw new Error(`Sky/weather preset '${arenaId}' ${time}/${weather} backdrop intensity ${intensity} escapes its envelope`);
        }
      }
    }
    const configured = arenaConfiguredSkyPreset(arenaId);
    const anchor = resolveSkyWeatherPreset({ arenaId, ...configured });
    if (ARENA_DAYLIGHT_PROFILES[arenaId].pinned && Math.abs(anchor.backdropIntensity - 1) > 1e-9) {
      throw new Error(`Pinned arena '${arenaId}' must keep its authored sky backdrop at every preset`);
    }
  }
}

assertSkyWeatherPresetSafety();
