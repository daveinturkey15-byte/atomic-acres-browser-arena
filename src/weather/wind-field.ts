/**
 * wind-field.ts — Pass 76: the one wind model every peer already agrees on.
 *
 * WHY THIS EXISTS
 * Wind was authored three separate times and never as a shared quantity:
 * grass-placement.ts rolls its own sine stack, farcrysis-tsl-foliage.ts drives
 * a `uTime` uniform, and arena-ambient-events.ts fires a `wind-gust` whoosh on
 * a random timer. Nothing agreed with anything else — the grass leaned one way
 * while the palms leaned another and the gust you HEARD had no relationship to
 * either. Rain made that unacceptable: a rain streak that shears left while the
 * grass bends right reads as broken, not as weather.
 *
 * So there is now exactly one field. It answers "which way and how hard is the
 * wind blowing at (x, z) right now" and every consumer — rain shear, foliage
 * sway, ambient gust cues — reads the same answer.
 *
 * DETERMINISM CONTRACT
 * The field is a closed-form function of (arenaId, matchSeed, x, z, t). No
 * Math.random, no accumulated state, no per-frame integration. A host and a
 * guest that know the arena and the match seed — which they already do, because
 * both come from the lobby — compute byte-identical wind with ZERO network
 * traffic. That is the whole point: wind is too high-frequency to replicate and
 * too visible to let drift.
 *
 * WHY IT NEVER LOOPS
 * The gust stack's five band periods are the square roots of 34, 99, 280, 754
 * and 2020. Those radicands share no square factor ratio, so every pair of
 * periods is PROVABLY incommensurate and the summed signal has no finite common
 * period — not a long one, none at all. This is the same reasoning the
 * continuous audio bed uses for its incommensurate loop lengths
 * (arena-ambient-events.ts header), applied to a spatial field: a wind that
 * repeats every ninety seconds is a fan, not weather.
 *
 * THIS FILE IS PURE. No THREE, no timers, no module-scope randomness.
 */

import type { ArenaId } from '../arena-identity';

const TAU = Math.PI * 2;

/**
 * Radicands of the five gust-band periods, INDEX-ALIGNED with WIND_GUST_BANDS
 * (longest swell first). Kept as integers rather than the decimal periods so
 * the incommensurability property is checkable by hand and by test: no pair
 * reduces to a ratio of two perfect squares, therefore no pair of periods is
 * commensurate, therefore the stack has no repeat.
 */
export const WIND_GUST_PERIOD_RADICANDS: readonly number[] = Object.freeze([2020, 754, 280, 99, 34]);

/** Metres per gust cell the shared band table was authored against. */
export const WIND_REFERENCE_GUST_SCALE_M = 14;

export type WindGustBand = Readonly<{
  /** Temporal period (s). sqrt of the matching radicand — never rational. */
  periodSeconds: number;
  /** Spatial phase advance in radians per metre at the reference gust scale. */
  spatialFrequency: number;
  /** Bearing (rad) the band's gust front travels along, relative to the base. */
  frontBearingOffset: number;
  /** Share of the arena gust amplitude carried by this band. Sums to 1. */
  weight: number;
  /** Radians this band swings the wind bearing at full strength. */
  bearingSwing: number;
}>;

/** Reads the period radicand by band index, so the two tables cannot drift. */
const band = (
  bandIndex: number,
  spatialFrequency: number,
  frontBearingOffset: number,
  weight: number,
  bearingSwing: number,
): WindGustBand => Object.freeze({
  periodSeconds: Math.sqrt(WIND_GUST_PERIOD_RADICANDS[bandIndex]),
  spatialFrequency,
  frontBearingOffset,
  weight,
  bearingSwing,
});

/**
 * Shared band table: long slow swells carry most of the amplitude, short bands
 * add the flutter that makes a gust read as air rather than as a fade. Front
 * bearings are deliberately spread so gust fronts cross each other instead of
 * marching in convoy (a convoy is visible as a travelling stripe).
 */
export const WIND_GUST_BANDS: readonly WindGustBand[] = Object.freeze([
  band(0, 0.0130, 0.00, 0.34, 0.24),
  band(1, 0.0215, 0.71, 0.26, 0.19),
  band(2, 0.0370, -1.13, 0.20, 0.14),
  band(3, 0.0620, 2.06, 0.13, 0.09),
  band(4, 0.1080, -2.44, 0.07, 0.05),
]);

/**
 * GUST FRONT ASYMMETRY — Pass 79.
 *
 * The band stack was a sum of pure sines, and a sum of pure sines is
 * SYMMETRIC: every gust took exactly as long to arrive as it took to die, and
 * every lull lasted exactly as long as the gust before it. Air does not behave
 * like that. A gust front is a boundary between two bodies of air, so it
 * ARRIVES — a fast leading edge — and then bleeds away over several times
 * longer as the fast air mixes out. That asymmetry is most of what makes wind
 * read as wind rather than as a fader being moved up and down, and the owner
 * audit's note about wind quality is describing its absence.
 *
 * THE WARP, AND WHY IT IS THIS ONE. Every band's wave becomes
 *
 *     w(phase) = sin(phase + skew * sin(phase))
 *
 * i.e. the phase itself is advanced fastest where the wave is rising. This is
 * the only shaping considered that keeps ALL FOUR properties the field already
 * depends on, without one line of extra state:
 *
 *   - BOUNDED. It is still a sine of something, so |w| <= 1 exactly, and the
 *     weights still sum to 1, so the envelope still spans exactly 0..1.
 *   - CONTINUOUS AND SMOOTH everywhere, including at the turning points. A
 *     value-side trick (different exponents on the rise and the fall) steps
 *     discontinuously every time the derivative changes sign, and a step in
 *     wind speed reads as a bug.
 *   - PERIOD-PRESERVING. w has exactly the period of its band, so the
 *     incommensurate-radicand argument for "the stack never repeats" is
 *     untouched — see WIND_GUST_PERIOD_RADICANDS.
 *   - CLOSED-FORM AND SEEDLESS, so two peers still compute byte-identical wind
 *     from (arenaId, matchSeed, x, z, t) with zero traffic.
 *
 * WHAT IT IS WORTH, MEASURED RATHER THAN CLAIMED. Per band the effect is
 * large: dw/dphase is (1 + skew) at the upward zero crossing and -(1 - skew)
 * at the downward one, so at 0.55 each band builds 3.4x faster than it decays.
 * At the SUMMED envelope - which is what a player actually feels - it is much
 * smaller, because five bands at five unrelated phases partially cancel each
 * other's asymmetry: wind-field.test.ts measures 1.127-1.140 mean-decay over
 * mean-front across the six arenas, against 1.01 for the symmetric stack it
 * replaces. So this is a real change of about 13%, not a 3.4x one, and the
 * test pins the measured figure so it cannot quietly drift back to symmetric.
 * A graded skew (strong on the long swells, none on the flutter) was measured
 * too and came out WORSE at the envelope, at 1.02-1.07; flat is the best of
 * the shapes tried.
 *
 * `skew` must stay under 1 or the phase map stops being monotone and the wave
 * develops a flat spot at its trough; `assertGustFrontShape` holds that line.
 */
export const WIND_FRONT_SKEW = 0.55;

/** One band's wave. Same period and same bounds as the sine it replaced. */
export function gustWave(phase: number, skew: number = WIND_FRONT_SKEW): number {
  return Math.sin(phase + skew * Math.sin(phase));
}

/** How many times faster a gust front arrives than it dies away. */
export function gustFrontSlopeRatio(skew: number = WIND_FRONT_SKEW): number {
  return (1 + skew) / (1 - skew);
}

/** Fails closed on a skew that would stop the phase map being monotone. */
export function assertGustFrontShape(): void {
  if (!(WIND_FRONT_SKEW >= 0 && WIND_FRONT_SKEW < 1)) {
    throw new Error(`Wind gust skew left the monotone range: ${WIND_FRONT_SKEW}`);
  }
}

export type WindProfile = Readonly<{
  arenaId: ArenaId;
  /** Human-readable authoring identity; unique per arena. */
  identity: string;
  /** Prevailing bearing (rad) in world XZ: 0 is +X, PI/2 is +Z. */
  baseBearingRadians: number;
  /** Prevailing speed with the gust stack at its lull (m/s). */
  baseSpeedMps: number;
  /** Metres/second the gust stack adds at full peak, on top of the base. */
  gustSpeedMps: number;
  /** Metres per gust cell. Larger = broader, lazier fronts. */
  gustScaleM: number;
  /** Scales every band's bearing swing. 0 pins the wind to one bearing. */
  bearingSwingScale: number;
  /**
   * Indoors. Sheltered arenas keep a whisper of HVAC drift so foliage/audio
   * consumers do not have to special-case zero, but they never get weather
   * (weather-state.ts authors the same arenas clear-only).
   */
  sheltered: boolean;
}>;

const profile = (
  arenaId: ArenaId,
  identity: string,
  baseBearingRadians: number,
  baseSpeedMps: number,
  gustSpeedMps: number,
  gustScaleM: number,
  bearingSwingScale: number,
  sheltered: boolean,
): WindProfile => Object.freeze({
  arenaId,
  identity,
  baseBearingRadians,
  baseSpeedMps,
  gustSpeedMps,
  gustScaleM,
  bearingSwingScale,
  sheltered,
});

/**
 * Per-arena wind identity. Speeds are real m/s so consumers can reason about
 * them physically (a 12 m/s sea breeze really does shear rain roughly one metre
 * sideways per metre of fall at storm fall speeds).
 */
export const WIND_PROFILES: Readonly<Record<ArenaId, WindProfile>> = Object.freeze({
  // Backyard air between two fences: slow, wandering, easily blocked.
  'atomic-acres': profile('atomic-acres', 'sheltered-suburban-drift', 0.62, 2.4, 2.1, 16, 1.0, false),
  // Apron wind funnelled between terminal and hangar: fast, narrow, directional.
  'skyline-terminal': profile('skyline-terminal', 'funnelled-apron-crosswind', -1.94, 5.4, 3.4, 22, 0.55, false),
  // North-sea rig: hard, cold and relentlessly one-directional.
  'rustworks-1v1': profile('rustworks-1v1', 'north-sea-rig-blow', 2.36, 8.2, 4.6, 30, 0.4, false),
  // Indoors. A ventilation plant, not weather (see `sheltered`).
  'gun-range': profile('gun-range', 'indoor-range-hvac-drift', 1.05, 0.35, 0.25, 9, 1.3, true),
  // Tropical: low mean speed, enormous humid gusts that arrive and die.
  farcrysis: profile('farcrysis', 'humid-monsoon-gusting', -0.42, 3.1, 5.2, 19, 1.45, false),
  // Open water: the stiffest steady breeze in the game, broad ocean fronts.
  'high-seas': profile('high-seas', 'open-ocean-stiff-breeze', 1.71, 11.0, 5.8, 34, 0.6, false),
  // Dry open range: moderate steady wind, gusty enough to flap canvas.
  'test1': profile('test1', 'dry-range-gusty-crosswind', 0.94, 4.6, 3.8, 20, 0.8, false),
  // Hillside garden air: soft late-afternoon breeze, lazy broad fronts.
  'test2': profile('test2', 'hillside-garden-soft-breeze', -1.18, 2.2, 1.8, 18, 1.1, false),
  // MAP3 (PREVIEW): open scrub with eight walled bays cut through it. The
  // gust scale is the largest on the board (34 m) because the pier lines are
  // what break the wind up, and they are 6.4 m apart down a 54 m lane.
  'map3': profile('map3', 'open-scrub-gallery-crossbreeze', 0.62, 2.9, 2.6, 34, 1.0, false),
  // RAID2 (PREVIEW, HF-408): the same hillside breeze as test2, on a longer
  // gust scale (26 m against 18 m) because what breaks the wind here is a
  // colonnade on 4 m gaps at the end of a 52 m lane, not a hedge line.
  'raid2': profile('raid2', 'hillside-terrace-lane-breeze', -1.18, 2.5, 2.1, 26, 1.05, false),
});

export function windProfile(arenaId: ArenaId): WindProfile {
  return WIND_PROFILES[arenaId];
}

/** Peak speed an arena can reach with the gust stack at full strength (m/s). */
export function windPeakSpeed(arenaId: ArenaId): number {
  const entry = WIND_PROFILES[arenaId];
  return entry.baseSpeedMps + entry.gustSpeedMps;
}

function hash32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function unit(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000;
}

/** FNV-1a over the arena id, so two arenas on one seed never share phases. */
function arenaHash(arenaId: ArenaId): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < arenaId.length; index += 1) {
    hash ^= arenaId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export type WindField = Readonly<{
  arenaId: ArenaId;
  profile: WindProfile;
  matchSeed: number;
  /** Per-band starting phase (rad), derived from (arenaId, matchSeed). */
  bandPhases: readonly number[];
}>;

/**
 * Resolves the per-match field. The seed only chooses where in the never-
 * repeating gust signal the match starts, so two matches on one arena feel
 * related but never play back the same gusts.
 */
export function createWindField(arenaId: ArenaId, matchSeed: number): WindField {
  const seed = Math.trunc(finite(matchSeed, 0)) >>> 0;
  const root = hash32(arenaHash(arenaId) ^ hash32(seed));
  const bandPhases = WIND_GUST_BANDS.map((_, index) => unit(hash32(root ^ Math.imul(index + 1, 0x9e3779b9))) * TAU);
  return Object.freeze({
    arenaId,
    profile: WIND_PROFILES[arenaId],
    matchSeed: seed,
    bandPhases: Object.freeze(bandPhases),
  });
}

export type WindSample = Readonly<{
  /** World-XZ wind vector (m/s). This is the 2D vector consumers integrate. */
  x: number;
  z: number;
  /** Magnitude of (x, z) in m/s. */
  speed: number;
  /** Bearing of (x, z) in radians. */
  bearingRadians: number;
  /** 0 at the deepest lull, 1 at the strongest gust. Drives audio/foliage. */
  gust: number;
}>;

/**
 * The field sample. Returns the 2D wind vector at (x, z) at `timeSeconds`.
 *
 * `speedMultiplier` is where weather couples in: weather-state.ts hands back a
 * `windMultiplier` that a storm raises to ~1.8, and the caller passes it
 * straight through. Weather scales wind; it never redirects it, because a wind
 * that swings 90 degrees when a cloud arrives reads as a bug.
 */
export function sampleWind(
  field: WindField,
  x: number,
  z: number,
  timeSeconds: number,
  speedMultiplier = 1,
): WindSample {
  const entry = field.profile;
  const safeX = finite(x, 0);
  const safeZ = finite(z, 0);
  const time = finite(timeSeconds, 0);
  const multiplier = Math.max(0, finite(speedMultiplier, 1));
  // gustScaleM widens or tightens the cells without re-authoring the table.
  const spatialScale = WIND_REFERENCE_GUST_SCALE_M / Math.max(1, entry.gustScaleM);

  let envelope = 0;
  let bearingOffset = 0;
  for (let index = 0; index < WIND_GUST_BANDS.length; index += 1) {
    const gustBand = WIND_GUST_BANDS[index];
    const frontBearing = entry.baseBearingRadians + gustBand.frontBearingOffset;
    const along = safeX * Math.cos(frontBearing) + safeZ * Math.sin(frontBearing);
    const phase = (time / gustBand.periodSeconds) * TAU
      + along * gustBand.spatialFrequency * spatialScale
      + (field.bandPhases[index] ?? 0);
    // Asymmetric by construction: fast front, slow decay. See WIND_FRONT_SKEW.
    const wave = gustWave(phase);
    envelope += wave * gustBand.weight;
    bearingOffset += wave * gustBand.bearingSwing * entry.bearingSwingScale;
  }

  // Weights sum to 1, so `envelope` lands in [-1, 1]; remap to a 0..1 gust
  // envelope. Clamped because float drift at the ends must never go negative
  // and hand a consumer a wind that blows backwards.
  const gust = Math.min(1, Math.max(0, envelope * 0.5 + 0.5));
  const bearing = entry.baseBearingRadians + bearingOffset;
  const speed = (entry.baseSpeedMps + entry.gustSpeedMps * gust) * multiplier;
  return Object.freeze({
    x: Math.cos(bearing) * speed,
    z: Math.sin(bearing) * speed,
    speed,
    bearingRadians: bearing,
    gust,
  });
}

/** A dead-calm sample, for bypassed/indoor consumers that still want a vector. */
export function calmWind(): WindSample {
  return Object.freeze({ x: 0, z: 0, speed: 0, bearingRadians: 0, gust: 0 });
}
