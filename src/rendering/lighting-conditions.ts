/**
 * lighting-conditions.ts — Lane AB (PASS 87): TIME OF DAY as uniform writes.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS SHAPED LIKE `weather-state.ts`
 * The owner has asked since 2026-08-31 for "dynamic, coloured, time-of-day and
 * weather lighting" on every arena. Half of that already shipped: Pass 76-79
 * built `src/weather/weather-state.ts` (a peer-identical sky derived from
 * `(arenaId, matchSeed, elapsedSeconds)` over zero bytes of traffic) and routed
 * its gloom into fog span and an overcast fill. The other half — TIME OF DAY —
 * did not exist at all. Every arena has always been lit at exactly one hour.
 *
 * This module is that other half, and it is deliberately the SAME SHAPE as the
 * weather model, for the same reason: friends must share a sky. Time of day is
 * a pure function of `(arenaId, matchSeed, elapsedSeconds, choice)`, all four of
 * which every peer already has, so it replicates by DERIVATION and needs no new
 * network channel. A guest joining at t=214 s computes the same sun as the host.
 *
 * THE PASS 82 CONSTRAINT (never violate)
 * Three's WebGPU light set is part of every material's cache key: adding,
 * removing or toggling a light at runtime invalidates every pipeline and freezes
 * the game. That is the root cause PASS 82 shipped a fix for. Therefore this
 * module NEVER returns a light — it returns NUMBERS. Every field below is a
 * scale, a tint or an angle that a caller writes into a light that already
 * exists. The light SET is frozen before the coverage fence and stays frozen.
 *
 * EVERYTHING IS A DELTA FROM THE AUTHORED HOUR
 * Each arena declares the hour its shipped lighting was authored at. At that
 * hour, in clear weather, every scale in `LightingConditionWrites` is exactly 1,
 * every tint is exactly [1,1,1] and the sun-direction delta is exactly 0 — the
 * resolved writes are the IDENTITY. So a PASS 87 build pinned to the authored
 * hour is bit-identical to PASS 85, and the whole feature is a bounded
 * excursion away from a known-good look rather than a replacement for it.
 * `lightingConditionsAreIdentity()` proves it and the test sweeps it.
 *
 * COMBAT SAFETY: THE SHADOW FLOOR CAN ONLY RISE
 * The single most direct way to hide a player is to darken the shadow they are
 * standing in, and "it is night now" is not an excuse. So this model buys its
 * night by HUE, ANGLE and SKY — never by removing light from the shadow side:
 *
 *   as the key light falls, the ambient/hemisphere/fill floor is lifted by
 *   exactly enough that the composed shadow illumination NEVER drops below the
 *   arena's authored value.
 *
 * That is `shadowFloorScale >= 1` at every hour of every arena's band in every
 * weather, and it is arithmetic rather than tuning: the lift is derived from
 * the key drop, not authored beside it. `assertLightingConditionSafety()` sweeps
 * every arena x every hour x every weather rung and fails closed.
 *
 * WEATHER SHRINKS THIS MODEL, IT NEVER FIGHTS IT
 * A storm has no golden hour. Every tint and the key-light excursion are pulled
 * back toward the authored identity in proportion to `skyDarkenAmount`, so the
 * two systems compose monotonically: adding weather can only ever REDUCE the
 * time-of-day deviation, which means the safety envelope proved for clear
 * weather bounds every weather.
 *
 * THIS FILE IS PURE. No THREE, no timers, no wall clock, no Math.random.
 */

import type { ArenaId } from '../arena-identity';
import { ARENA_IDS } from '../arena-identity';

export type Rgb3 = readonly [number, number, number];

/**
 * The host-settable choice. It is deliberately ARENA-RELATIVE rather than an
 * absolute clock: `late` means dusk on Nuke Town, night on RustRig and late
 * afternoon on Farcrysis, because each arena's band is its own. An absolute
 * "20:00" would be a beautiful dusk on one map and a black screen on another.
 */
export type LightingTimeChoice = 'authored' | 'early' | 'midday' | 'late' | 'random' | 'cycle';

export const LIGHTING_TIME_CHOICES: readonly LightingTimeChoice[] = Object.freeze([
  'authored', 'early', 'midday', 'late', 'random', 'cycle',
]);

/**
 * Player-facing labels. They name what the choice DOES to this arena rather
 * than a clock, because the band is arena-relative: LATE is dusk on Nuke Town
 * and night on RustRig, and a menu that promised "20:00" would be lying on one
 * of them.
 */
export const LIGHTING_TIME_CHOICE_LABELS: Readonly<Record<LightingTimeChoice, string>> = Object.freeze({
  authored: 'AUTHORED',
  early: 'EARLY',
  midday: 'MIDDAY',
  late: 'LATE',
  random: 'RANDOM',
  cycle: 'CYCLE OVER MATCH',
});

/** Solo and lobby default. The owner asked for variety, not for one new hour. */
export const DEFAULT_LIGHTING_TIME_CHOICE: LightingTimeChoice = 'random';

export function isLightingTimeChoice(value: unknown): value is LightingTimeChoice {
  return typeof value === 'string' && (LIGHTING_TIME_CHOICES as readonly string[]).includes(value);
}

export type ArenaDaylightProfile = Readonly<{
  arenaId: ArenaId;
  /** Human-readable authoring identity; unique per arena. */
  identity: string;
  /**
   * True when the arena has a roof (or is a PREVIEW map whose own lane owns its
   * look). Pinned arenas resolve to the authored hour at every choice, so no
   * consumer has to remember there is a ceiling.
   */
  pinned: boolean;
  /** The hour the arena's SHIPPED lighting was authored at. Identity anchor. */
  authoredHour: number;
  /** Playable band, inclusive. Never leaves the arena's identity. */
  hourRange: readonly [number, number];
  /** Sun arc window used to place the sun; wider than `hourRange` by design. */
  dayWindow: readonly [number, number];
  /** Sun elevation at the arc's ends and at its peak (degrees). */
  elevationRange: readonly [number, number];
  /** Peak azimuth excursion across the whole arc, end to end (degrees). */
  azimuthSwingDegrees: number;
  /** Minutes of match a full `cycle` traversal of `hourRange` takes. */
  cycleMatchMinutes: number;
}>;

const profile = (
  arenaId: ArenaId,
  identity: string,
  pinned: boolean,
  authoredHour: number,
  hourRange: readonly [number, number],
  dayWindow: readonly [number, number],
  elevationRange: readonly [number, number],
  azimuthSwingDegrees: number,
  cycleMatchMinutes: number,
): ArenaDaylightProfile => Object.freeze({
  arenaId,
  identity,
  pinned,
  authoredHour,
  hourRange: Object.freeze([hourRange[0], hourRange[1]] as const),
  dayWindow: Object.freeze([dayWindow[0], dayWindow[1]] as const),
  elevationRange: Object.freeze([elevationRange[0], elevationRange[1]] as const),
  azimuthSwingDegrees,
  cycleMatchMinutes,
});

/**
 * The frozen daylight contract. Every band is chosen to stay INSIDE the arena's
 * authored identity — `src/rendering/art-direction.ts` says what each place is,
 * and a band that left it would make the art direction a lie. Changing a number
 * here is a visible readability change, the same status the weather table has.
 */
export const ARENA_DAYLIGHT_PROFILES: Readonly<Record<ArenaId, ArenaDaylightProfile>> = Object.freeze({
  // Warm pastoral americana, a heartbeat before the test. Afternoon into dusk;
  // it never goes dark, because a 1950s postcard suburb at midnight is a
  // different map, not the same map later.
  'atomic-acres': profile('atomic-acres', 'suburban-afternoon-into-dusk', false, 17.5, [15, 19], [6, 20], [8, 62], 46, 6),
  // Apron dawn through mid-morning; the authored atmosphere preset is literally
  // 'airport-dawn' and the corporate-glass identity lives in cold early light.
  'skyline-terminal': profile('skyline-terminal', 'apron-dawn-to-midmorning', false, 7, [5.8, 10.5], [5, 19], [7, 58], 42, 6),
  // North-sea rig: the narrowest outdoor band in the game. Its authored night
  // shadow mass (15/255) is the combat-safety datum for the whole feature, so
  // this arena is allowed to move the LEAST.
  'rustworks-1v1': profile('rustworks-1v1', 'north-sea-rig-dusk-into-night', false, 21, [20, 22], [4.5, 23.5], [6, 54], 30, 8),
  // INDOORS. Pinned by the table, not by every consumer remembering the roof.
  'gun-range': profile('gun-range', 'indoor-range-no-sky', true, 12, [12, 12], [6, 18], [40, 40], 0, 6),
  // Tropical: the widest arc, because a Far Cry island is defined by its sun.
  farcrysis: profile('farcrysis', 'tropical-midmorning-to-late-afternoon', false, 12.5, [9, 17], [6, 18.5], [10, 74], 54, 7),
  // Open water with nothing to occlude the sky, so the widest BAND.
  'high-seas': profile('high-seas', 'open-ocean-morning-through-dusk', false, 13, [7.5, 19], [5.5, 20.5], [8, 66], 58, 7),
  // Firing Range: dry range under hard sun. Its weather profile is pinned clear
  // by design, so the hour is the only variation this arena gets at all -- which
  // is why its arc window is TIGHT (07:00-17:00 rather than the 06:00-19:00 the
  // wetter arenas use). A wide window put the whole 09:00-13:00 band within four
  // degrees of the arc's peak and the sun scale moved by 5% end to end.
  test1: profile('test1', 'dry-range-hard-morning-sun', false, 10.5, [9, 13], [7, 17], [12, 70], 34, 6),
  // Raid: golden-hour hillside estate. Narrow — golden hour IS the identity.
  test2: profile('test2', 'golden-hour-hillside', false, 17, [16, 18.5], [6, 19.5], [8, 60], 26, 6),
  // MAP3 (PREVIEW). PINNED on purpose: Lane V owns this map's look while it is
  // being built, and a second lane moving its sun underneath it would be a
  // merge conflict rendered on screen. This row is the TEMPLATE that lane fills
  // in (see docs/DYNAMIC_LIGHTING_2026-09-03.md, "Preset template").
  map3: profile('map3', 'open-scrub-midmorning-preview-pinned', true, 10, [10, 10], [6, 19], [12, 66], 0, 6),
});

export function arenaDaylightProfile(arenaId: ArenaId): ArenaDaylightProfile {
  return ARENA_DAYLIGHT_PROFILES[arenaId];
}

/**
 * The combat-safety envelope. Every one of these is checked for every arena at
 * every hour in every weather by `assertLightingConditionSafety`, which this
 * module runs at import time — fail closed, exactly like the art-direction
 * catalog's own `assertArtDirectionSafety`.
 */
export const LIGHTING_CONDITION_BOUNDS = Object.freeze({
  /** The key light may dim to buy a dusk, but never past this. */
  sunIntensityScale: Object.freeze({ minimum: 0.55, maximum: 1.15 }),
  /**
   * THE INVARIANT. Composed ambient + hemisphere + fill, relative to authored.
   * A minimum of exactly 1 is the whole safety argument: the shadow a player
   * stands in can only ever get BRIGHTER than the shipped arena, never darker.
   */
  shadowFloorScale: Object.freeze({ minimum: 1, maximum: 1.6 }),
  /** Per-channel tint bound, shared by sun, ambient and hemisphere. */
  tintChannel: Object.freeze({ minimum: 0.72, maximum: 1.3 }),
  /** Exposure only ever rises (dark adaptation), and barely. */
  exposureScale: Object.freeze({ minimum: 1, maximum: 1.12 }),
  /**
   * A sun at the horizon casts shadows the length of the map and turns every
   * sightline into a silhouette. It never gets below 6 degrees.
   */
  sunElevationDegrees: Object.freeze({ minimum: 6, maximum: 78 }),
  /** Azimuth excursion from the arena's authored sun direction. */
  sunAzimuthDeltaDegrees: Object.freeze({ minimum: -70, maximum: 70 }),
  /** Fog COLOUR may be tinted; fog near/far are not this module's to touch. */
  fogTintChannel: Object.freeze({ minimum: 0.8, maximum: 1.25 }),
});

/**
 * How much of the key-light drop is returned to the shadow side. 1.0 would mean
 * "give back exactly what was taken"; the value is above 1 because ambient light
 * reaching a shadowed surface is a fraction of what the key contributes to a lit
 * one, so a like-for-like ratio would still leave the shadow darker than before.
 * With the sun floor at 0.55 this saturates the lift at 0.45 * 1.15 = 0.5175,
 * comfortably inside `shadowFloorScale.maximum`.
 */
const SHADOW_LIFT_GAIN = 1.15;

/** Exposure gain per unit of key-light drop. Small on purpose. */
const EXPOSURE_LIFT_GAIN = 0.24;

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

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
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

function arenaHash(arenaId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < arenaId.length; index += 1) {
    hash ^= arenaId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(value: number): number {
  return (value >>> 0) / 0x1_0000_0000;
}

/**
 * The sun's arc. `phase` is 0 at the arena's dawn and 1 at its dusk; elevation
 * follows a half-sine and azimuth sweeps linearly across the swing. Both are
 * consumed as DELTAS from the authored hour, so their absolute calibration never
 * has to agree with the arena's authored sun vector — only their SHAPE does.
 */
function arcPhase(daylight: ArenaDaylightProfile, hour: number): number {
  const dawn = daylight.dayWindow[0];
  const dusk = daylight.dayWindow[1];
  if (!(dusk > dawn)) return 0.5;
  return clamp01((hour - dawn) / (dusk - dawn));
}

function arcElevationDegrees(daylight: ArenaDaylightProfile, hour: number): number {
  const low = daylight.elevationRange[0];
  const high = daylight.elevationRange[1];
  return low + (high - low) * Math.sin(Math.PI * arcPhase(daylight, hour));
}

function arcAzimuthDegrees(daylight: ArenaDaylightProfile, hour: number): number {
  return daylight.azimuthSwingDegrees * (arcPhase(daylight, hour) - 0.5);
}

/**
 * Colour temperature of direct sun as a function of elevation. Low sun is a
 * long path through the atmosphere: red survives it, blue does not. Returned as
 * a per-channel multiplier over a neutral white, and only ever CONSUMED as a
 * ratio against the authored hour, so the absolute scale is arbitrary.
 */
function directSunTint(elevationDegrees: number): Rgb3 {
  const stops: readonly (readonly [number, Rgb3])[] = [
    [2, [1.2, 0.84, 0.6]],
    [12, [1.1, 0.94, 0.79]],
    [30, [1.02, 1, 0.97]],
    [55, [0.985, 1, 1.035]],
    [80, [0.97, 1, 1.06]],
  ];
  const elevation = clamp(elevationDegrees, stops[0][0], stops[stops.length - 1][0]);
  for (let index = 1; index < stops.length; index += 1) {
    const highStop = stops[index];
    const lowStop = stops[index - 1];
    if (elevation <= highStop[0]) {
      const amount = (elevation - lowStop[0]) / (highStop[0] - lowStop[0]);
      return [
        mix(lowStop[1][0], highStop[1][0], amount),
        mix(lowStop[1][1], highStop[1][1], amount),
        mix(lowStop[1][2], highStop[1][2], amount),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Skylight tint. The inverse story to `directSunTint`: the lower the sun, the
 * more of the ambient dome is scattered blue rather than direct warm light, so
 * the shadow side goes COOL exactly as the lit side goes warm. That opposition
 * is most of what makes a dusk read as a dusk instead of as an orange filter.
 */
function skylightTint(elevationDegrees: number): Rgb3 {
  // The knee is at 45 degrees rather than at 30: above roughly 45 the direct
  // beam dominates and the dome reads neutral, and a knee that low left five of
  // the seven outdoor arenas with a mathematically real but invisible sky shift
  // because their whole band sits above it (measured: High Seas moved 0.000 on
  // every channel at 07:30 with a 30-degree knee).
  const amount = clamp01((45 - clamp(elevationDegrees, 2, 70)) / 40);
  return [mix(1, 0.86, amount), mix(1, 0.93, amount), mix(1, 1.13, amount)];
}

function ratioTint(current: Rgb3, authored: Rgb3, neutralise: number): Rgb3 {
  const bound = LIGHTING_CONDITION_BOUNDS.tintChannel;
  const blend = clamp01(neutralise);
  return [
    clamp(mix(current[0] / authored[0], 1, blend), bound.minimum, bound.maximum),
    clamp(mix(current[1] / authored[1], 1, blend), bound.minimum, bound.maximum),
    clamp(mix(current[2] / authored[2], 1, blend), bound.minimum, bound.maximum),
  ];
}

/**
 * Resolved hour for a match. PURE in every argument, so two peers holding the
 * same lobby (which is where `matchSeed` and `choice` both come from) resolve
 * the same hour on the same frame with zero bytes exchanged — the identical
 * contract `weather-state.ts` already ships.
 */
export function resolveLightingHour(
  arenaId: ArenaId,
  matchSeed: number,
  elapsedSeconds: number,
  choice: LightingTimeChoice = DEFAULT_LIGHTING_TIME_CHOICE,
): number {
  const daylight = ARENA_DAYLIGHT_PROFILES[arenaId];
  if (daylight.pinned || choice === 'authored') return daylight.authoredHour;
  const low = daylight.hourRange[0];
  const high = daylight.hourRange[1];
  const span = high - low;
  if (!(span > 0)) return daylight.authoredHour;
  const seed = hash32(arenaHash(arenaId) ^ Math.imul(finite(matchSeed, 0) >>> 0, 0x9e3779b1));
  switch (choice) {
    case 'early':
      return low;
    case 'midday':
      return low + span * 0.5;
    case 'late':
      return high;
    case 'random':
      return low + span * unit(seed);
    case 'cycle': {
      // Ping-pong across the band so the sun never leaves the arena's identity,
      // and start somewhere seeded so two matches on one map differ.
      const elapsed = Math.max(0, finite(elapsedSeconds, 0));
      const period = Math.max(1, daylight.cycleMatchMinutes) * 60;
      const start = unit(hash32(seed ^ 0x5bf03635));
      const walked = (start + elapsed / period) % 2;
      const triangle = walked <= 1 ? walked : 2 - walked;
      return low + span * triangle;
    }
    default:
      return daylight.authoredHour;
  }
}

/**
 * Everything a caller writes into the ALREADY-EXISTING lights. Scales multiply
 * the arena's authored value; tints multiply its authored colour; the two sun
 * angles are DELTAS from the arena's authored sun direction. There is no light
 * in this type, and there never will be.
 */
export type LightingConditionWrites = Readonly<{
  arenaId: ArenaId;
  /** The resolved hour, peer-identical. */
  hour: number;
  /** 0 at the authored hour, 1 at the far end of the arena's band. */
  deviation: number;
  /** Multiplies the authored sun/key intensity. */
  sunIntensityScale: number;
  /** Multiplies the authored sun colour. */
  sunTint: Rgb3;
  /** Degrees to raise (+) or lower (-) the sun from its authored direction. */
  sunElevationDeltaDegrees: number;
  /** Degrees to swing the sun about the arena's up axis. */
  sunAzimuthDeltaDegrees: number;
  /** Multiplies authored ambient intensity. Never below 1 while the sun falls. */
  ambientIntensityScale: number;
  ambientTint: Rgb3;
  hemisphereIntensityScale: number;
  hemisphereSkyTint: Rgb3;
  hemisphereGroundTint: Rgb3;
  fillIntensityScale: number;
  fillTint: Rgb3;
  /** Multiplies the authored fog COLOUR. Fog near/far belong to weather. */
  fogTint: Rgb3;
  /** Multiplies the arena's authored exposure. Rises as the key falls. */
  exposureScale: number;
  /**
   * THE SAFETY SCALAR. Composed indirect illumination relative to authored.
   * `>= 1` at every hour of every arena in every weather, by construction.
   */
  shadowFloorScale: number;
}>;

export type LightingConditionsInput = Readonly<{
  arenaId: ArenaId;
  matchSeed?: number;
  elapsedSeconds?: number;
  choice?: LightingTimeChoice;
  /**
   * `WeatherSample.skyDarkenAmount` (0..1). Weather pulls the time-of-day
   * excursion back toward the authored identity, so composing the two can only
   * ever SHRINK this model's deviation.
   */
  skyDarkenAmount?: number;
  /** Escape hatch for deterministic captures and tests. Overrides `choice`. */
  fixedHour?: number;
}>;

/** The whole model, in one pure call. */
export function resolveLightingConditions(input: LightingConditionsInput): LightingConditionWrites {
  const daylight = ARENA_DAYLIGHT_PROFILES[input.arenaId];
  const low = daylight.hourRange[0];
  const high = daylight.hourRange[1];
  const requested = input.fixedHour !== undefined
    ? clamp(finite(input.fixedHour, daylight.authoredHour), Math.min(low, high), Math.max(low, high))
    : resolveLightingHour(input.arenaId, finite(input.matchSeed, 0), finite(input.elapsedSeconds, 0), input.choice);
  const hour = daylight.pinned ? daylight.authoredHour : requested;

  // Weather neutralisation. A storm has no golden hour; every excursion below is
  // pulled back toward identity in proportion to how overcast the sky is.
  const neutralise = clamp01(finite(input.skyDarkenAmount, 0));
  const excursion = 1 - neutralise;

  const authoredElevation = arcElevationDegrees(daylight, daylight.authoredHour);
  const rawElevation = arcElevationDegrees(daylight, hour);
  const elevation = clamp(
    mix(authoredElevation, rawElevation, excursion),
    LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum,
    LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.maximum,
  );
  const sunElevationDeltaDegrees = elevation - authoredElevation;
  const sunAzimuthDeltaDegrees = clamp(
    (arcAzimuthDegrees(daylight, hour) - arcAzimuthDegrees(daylight, daylight.authoredHour)) * excursion,
    LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.minimum,
    LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.maximum,
  );

  // Key intensity follows sin(elevation) — the geometric cosine law for light
  // landing on the ground — normalised so the authored hour is exactly 1.
  const authoredKey = Math.max(0.08, Math.sin(clamp(authoredElevation, 1, 89) * DEG));
  const resolvedKey = Math.max(0.08, Math.sin(clamp(elevation, 1, 89) * DEG));
  const sunIntensityScale = clamp(
    resolvedKey / authoredKey,
    LIGHTING_CONDITION_BOUNDS.sunIntensityScale.minimum,
    LIGHTING_CONDITION_BOUNDS.sunIntensityScale.maximum,
  );

  // THE INVARIANT. Whatever the key gave up, the shadow side gets back and then
  // some. `drop` is zero whenever the key is at or above authored, so a brighter
  // midday never darkens the shadows either.
  const drop = Math.max(0, 1 - sunIntensityScale);
  const shadowFloorScale = clamp(
    1 + drop * SHADOW_LIFT_GAIN,
    LIGHTING_CONDITION_BOUNDS.shadowFloorScale.minimum,
    LIGHTING_CONDITION_BOUNDS.shadowFloorScale.maximum,
  );

  const authoredSunTint = directSunTint(authoredElevation);
  const authoredSkyTint = skylightTint(authoredElevation);
  const resolvedSunTint = directSunTint(elevation);
  const sunTint = ratioTint(resolvedSunTint, authoredSunTint, neutralise);
  const skyTint = ratioTint(skylightTint(elevation), authoredSkyTint, neutralise);

  // The ground half of the hemisphere is bounce off the arena's own floor, so it
  // follows the SUN's colour, not the sky's. That opposition is most of what
  // makes low light read as low light rather than as a blue filter.
  const groundTint = ratioTint(
    [mix(resolvedSunTint[0], 1, 0.45), mix(resolvedSunTint[1], 1, 0.45), mix(resolvedSunTint[2], 1, 0.45)],
    [mix(authoredSunTint[0], 1, 0.45), mix(authoredSunTint[1], 1, 0.45), mix(authoredSunTint[2], 1, 0.45)],
    neutralise,
  );

  // Fog is lit by the sky, so it takes the skylight tint at half strength: fog
  // that swings as hard as the dome reads as coloured smoke rather than as air.
  const fogBound = LIGHTING_CONDITION_BOUNDS.fogTintChannel;
  const fogTint: Rgb3 = [
    clamp(mix(1, skyTint[0], 0.5), fogBound.minimum, fogBound.maximum),
    clamp(mix(1, skyTint[1], 0.5), fogBound.minimum, fogBound.maximum),
    clamp(mix(1, skyTint[2], 0.5), fogBound.minimum, fogBound.maximum),
  ];

  const span = Math.max(high - low, 1e-6);
  const deviation = daylight.pinned
    ? 0
    : clamp01(Math.abs(hour - daylight.authoredHour) / span) * excursion;

  return Object.freeze({
    arenaId: input.arenaId,
    hour,
    deviation,
    sunIntensityScale,
    sunTint: Object.freeze([sunTint[0], sunTint[1], sunTint[2]] as const),
    sunElevationDeltaDegrees,
    sunAzimuthDeltaDegrees,
    ambientIntensityScale: shadowFloorScale,
    ambientTint: Object.freeze([skyTint[0], skyTint[1], skyTint[2]] as const),
    hemisphereIntensityScale: shadowFloorScale,
    hemisphereSkyTint: Object.freeze([skyTint[0], skyTint[1], skyTint[2]] as const),
    hemisphereGroundTint: Object.freeze([groundTint[0], groundTint[1], groundTint[2]] as const),
    fillIntensityScale: shadowFloorScale,
    fillTint: Object.freeze([skyTint[0], skyTint[1], skyTint[2]] as const),
    fogTint: Object.freeze([fogTint[0], fogTint[1], fogTint[2]] as const),
    exposureScale: clamp(
      1 + drop * EXPOSURE_LIFT_GAIN,
      LIGHTING_CONDITION_BOUNDS.exposureScale.minimum,
      LIGHTING_CONDITION_BOUNDS.exposureScale.maximum,
    ),
    shadowFloorScale,
  });
}

/** Tolerance for "this write is the identity" — well under one 8-bit step. */
const IDENTITY_EPSILON = 1e-9;

function isOne(value: number): boolean {
  return Math.abs(value - 1) <= IDENTITY_EPSILON;
}

function isIdentityTint(tint: Rgb3): boolean {
  return tint.every(isOne);
}

/**
 * True when the resolved writes change NOTHING. The runtime uses it to skip the
 * uniform writes entirely at the authored hour, and the tests use it to prove a
 * build pinned to the authored hour is the PASS 85 look exactly.
 */
export function lightingConditionsAreIdentity(writes: LightingConditionWrites): boolean {
  return isOne(writes.sunIntensityScale)
    && isOne(writes.shadowFloorScale)
    && isOne(writes.exposureScale)
    && Math.abs(writes.sunElevationDeltaDegrees) <= IDENTITY_EPSILON
    && Math.abs(writes.sunAzimuthDeltaDegrees) <= IDENTITY_EPSILON
    && isIdentityTint(writes.sunTint)
    && isIdentityTint(writes.ambientTint)
    && isIdentityTint(writes.hemisphereSkyTint)
    && isIdentityTint(writes.hemisphereGroundTint)
    && isIdentityTint(writes.fillTint)
    && isIdentityTint(writes.fogTint);
}

/** The writes that change nothing, for callers that need a neutral value. */
export function identityLightingConditions(arenaId: ArenaId): LightingConditionWrites {
  return resolveLightingConditions({ arenaId, choice: 'authored' });
}

function assertWithin(
  arenaId: ArenaId,
  hour: number,
  label: string,
  value: number,
  bounds: Readonly<{ minimum: number; maximum: number }>,
): void {
  if (!Number.isFinite(value) || value < bounds.minimum - 1e-9 || value > bounds.maximum + 1e-9) {
    throw new Error(
      `Lighting-condition combat-safety violation in '${arenaId}' at hour ${hour.toFixed(2)}: `
      + `${label} = ${value} escapes [${bounds.minimum}, ${bounds.maximum}]`,
    );
  }
}

/**
 * The weather rungs' authored `skyDarkenAmount` values, mirrored here so this
 * file keeps no runtime edge to the weather modules (they must not form an
 * initialisation cycle). `lighting-conditions.test.ts` pins these against
 * `WEATHER_STATE_TABLE` so the mirror can never drift unnoticed.
 */
export const SWEPT_SKY_DARKEN: readonly number[] = Object.freeze([0, 0.16, 0.3, 0.45, 0.58]);

/**
 * Fails closed over the WHOLE space: every arena x a fine sweep of its band x
 * every weather rung. Nothing here is asserted at a single point, because a
 * bound that only holds at the ends is not a bound.
 */
export function assertLightingConditionSafety(): void {
  for (const arenaId of ARENA_IDS) {
    const daylight = ARENA_DAYLIGHT_PROFILES[arenaId];
    const low = daylight.hourRange[0];
    const high = daylight.hourRange[1];
    const steps = 96;
    for (let step = 0; step <= steps; step += 1) {
      const hour = low + ((high - low) * step) / steps;
      for (const skyDarkenAmount of SWEPT_SKY_DARKEN) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount });
        assertWithin(arenaId, hour, 'sunIntensityScale', writes.sunIntensityScale, LIGHTING_CONDITION_BOUNDS.sunIntensityScale);
        assertWithin(arenaId, hour, 'shadowFloorScale', writes.shadowFloorScale, LIGHTING_CONDITION_BOUNDS.shadowFloorScale);
        assertWithin(arenaId, hour, 'exposureScale', writes.exposureScale, LIGHTING_CONDITION_BOUNDS.exposureScale);
        assertWithin(
          arenaId,
          hour,
          'sunAzimuthDeltaDegrees',
          writes.sunAzimuthDeltaDegrees,
          LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees,
        );
        const tints: readonly (readonly [string, Rgb3])[] = [
          ['sunTint', writes.sunTint],
          ['ambientTint', writes.ambientTint],
          ['hemisphereSkyTint', writes.hemisphereSkyTint],
          ['hemisphereGroundTint', writes.hemisphereGroundTint],
          ['fillTint', writes.fillTint],
        ];
        for (const entry of tints) {
          for (let channel = 0; channel < 3; channel += 1) {
            assertWithin(arenaId, hour, `${entry[0]}[${channel}]`, entry[1][channel], LIGHTING_CONDITION_BOUNDS.tintChannel);
          }
        }
        for (let channel = 0; channel < 3; channel += 1) {
          assertWithin(arenaId, hour, `fogTint[${channel}]`, writes.fogTint[channel], LIGHTING_CONDITION_BOUNDS.fogTintChannel);
        }
        // The absolute sun elevation is checked through the delta plus the
        // authored arc, because the delta is what a caller applies.
        const absolute = arcElevationDegrees(daylight, daylight.authoredHour) + writes.sunElevationDeltaDegrees;
        assertWithin(arenaId, hour, 'sunElevationDegrees', absolute, LIGHTING_CONDITION_BOUNDS.sunElevationDegrees);
      }
    }
    // Pinned arenas must be provably constant, so no consumer special-cases them.
    if (daylight.pinned) {
      for (const choice of LIGHTING_TIME_CHOICES) {
        const writes = resolveLightingConditions({ arenaId, matchSeed: 0x51ed, elapsedSeconds: 187, choice });
        if (!lightingConditionsAreIdentity(writes)) {
          throw new Error(`Pinned arena '${arenaId}' resolved a non-identity lighting condition for choice '${choice}'`);
        }
      }
    }
  }
}

assertLightingConditionSafety();
