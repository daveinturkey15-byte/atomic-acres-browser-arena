/**
 * weather-state.ts — Pass 76: the weather every peer computes and nobody sends.
 *
 * WHY THIS EXISTS
 * Weather that matters to gameplay readability (rain density, sky darkening,
 * fog) has to be identical on every screen or two players are arguing about a
 * different match. The obvious build is a host-authoritative weather message on
 * a timer. That is the wrong trade here: it adds a replicated channel, a join-
 * in-progress resync, and a whole class of "the guest is still sunny" bugs, all
 * to transmit something that is a pure function of the clock.
 *
 * So it is a pure function of the clock. Weather is derived from
 * (arenaId, matchSeed, elapsedSeconds) — all three of which every peer already
 * has from the lobby — and travels over ZERO bytes of network traffic. A guest
 * that joins at t=214 s computes the same sky as the host who has been there
 * since t=0, including the accumulated ground wetness, because the wetness is
 * integrated closed-form from t=0 rather than accumulated frame by frame.
 *
 * AUTHORED AVAILABILITY, NOT SIMULATION
 * Each arena declares which states it can reach. Gun Range is INDOORS: it lists
 * `clear` and nothing else, so `sampleWeather('gun-range', ...)` is provably
 * constant and no consumer ever has to remember to special-case the roof.
 *
 * SEVERITY LADDER
 * Transitions move at most one rung along
 * clear -> overcast -> light-rain -> heavy-rain -> storm.
 * Skipping rungs is what makes procedural weather read as a bug: skies do not
 * go from cloudless to torrential between two frames. The ladder also gives
 * the build-up and the break for free.
 *
 * READABILITY BUDGET
 * The heavy states are deliberately the SHORTEST authored spells (storm 18-34 s
 * against clear's 70-150 s). Heavy rain is a moment you fight through, not a
 * condition you fight in for four minutes — see rain-presentation.ts for the
 * matching opacity cap and ADS exclusion.
 *
 * THIS FILE IS PURE. No THREE, no timers, no Math.random.
 */

import type { ArenaId } from '../arena-identity';

export type WeatherState = 'clear' | 'overcast' | 'light-rain' | 'heavy-rain' | 'storm';

/** Mild to severe. Index in this array IS the severity rung. */
export const WEATHER_SEVERITY_LADDER: readonly WeatherState[] = Object.freeze([
  'clear',
  'overcast',
  'light-rain',
  'heavy-rain',
  'storm',
]);

/** Seconds a state change takes to blend in. Long enough to read as a front. */
export const WEATHER_TRANSITION_SECONDS = 14;

/** Window the no-repeat property is authored and tested against (s). */
export const WEATHER_MATCH_HORIZON_SECONDS = 900;

/** Above this rainRate a state counts as "heavy" for the duration budget. */
export const WEATHER_HEAVY_RAIN_RATE = 0.7;

/** Heavy states may not be authored longer than this (readability budget, s). */
export const WEATHER_HEAVY_MAX_DURATION_SECONDS = 50;

/** Guard against an absurd elapsedSeconds walking forever. */
const MAX_PHASE_WALK = 4096;

/** Sub-steps used to integrate wetness across a transition blend. */
const WETNESS_TRANSITION_STEPS = 4;

/**
 * Ground soaks faster than it dries — the asymmetry is what makes a shower
 * leave a mark on the arena for a minute after the sky clears.
 */
export const WEATHER_WETNESS = Object.freeze({
  /** 1/s toward a wetter target (~18 s time constant). */
  soakRatePerSecond: 0.055,
  /** 1/s toward a drier target (~62 s time constant). */
  dryRatePerSecond: 0.016,
} as const);

export type WeatherStateRow = Readonly<{
  state: WeatherState;
  /** Rung on WEATHER_SEVERITY_LADDER. */
  severity: number;
  /** Overall weather strength 0..1. Presentation-facing summary value. */
  intensity: number;
  /** Normalized precipitation 0..1. Drives rain instance count and audio. */
  rainRate: number;
  /** Multiplies wind-field speed. Never below 1: weather adds, never stills. */
  windMultiplier: number;
  /** Ground wetness this state drives toward, 0..1. */
  wetnessTarget: number;
  /** Multiplies the arena's authored fog density. */
  fogDensityMultiplier: number;
  /** 0..1 fraction the sky/key light is darkened by. */
  skyDarkenAmount: number;
  /** Shortest and longest authored spell, in seconds. */
  durationSecondsRange: readonly [number, number];
}>;

const row = (
  state: WeatherState,
  intensity: number,
  rainRate: number,
  windMultiplier: number,
  wetnessTarget: number,
  fogDensityMultiplier: number,
  skyDarkenAmount: number,
  durationSecondsRange: readonly [number, number],
): WeatherStateRow => Object.freeze({
  state,
  severity: WEATHER_SEVERITY_LADDER.indexOf(state),
  intensity,
  rainRate,
  windMultiplier,
  wetnessTarget,
  fogDensityMultiplier,
  skyDarkenAmount,
  durationSecondsRange: Object.freeze(durationSecondsRange),
});

/**
 * The frozen weather contract. Changing any number here is a visible gameplay-
 * readability change, not a tuning tweak — the same status the FLOAT_ZONE table
 * in water/swim-state.ts carries.
 */
export const WEATHER_STATE_TABLE: Readonly<Record<WeatherState, WeatherStateRow>> = Object.freeze({
  clear: row('clear', 0, 0, 1.00, 0, 1.00, 0.00, [70, 150]),
  overcast: row('overcast', 0.24, 0, 1.10, 0, 1.22, 0.16, [55, 125]),
  'light-rain': row('light-rain', 0.46, 0.34, 1.22, 0.55, 1.48, 0.30, [45, 95]),
  // Short by design: heavy rain is a moment, not a condition.
  'heavy-rain': row('heavy-rain', 0.74, 0.76, 1.44, 0.88, 1.82, 0.45, [26, 48]),
  // Shortest of all. A storm you cannot shoot through must not outlast a life.
  storm: row('storm', 1, 1, 1.78, 1, 2.15, 0.58, [18, 34]),
});

export function weatherStateRow(state: WeatherState): WeatherStateRow {
  return WEATHER_STATE_TABLE[state];
}

export type ArenaWeatherProfile = Readonly<{
  arenaId: ArenaId;
  /** Human-readable authoring identity; unique per arena. */
  identity: string;
  /** True when the arena has a roof and weather is authored out entirely. */
  indoor: boolean;
  /** Reachable states, mild-first. A single entry pins the arena to it. */
  availableStates: readonly WeatherState[];
}>;

const arenaProfile = (
  arenaId: ArenaId,
  identity: string,
  indoor: boolean,
  availableStates: readonly WeatherState[],
): ArenaWeatherProfile => Object.freeze({
  arenaId,
  identity,
  indoor,
  availableStates: Object.freeze(
    [...availableStates].sort((left, right) => WEATHER_SEVERITY_LADDER.indexOf(left) - WEATHER_SEVERITY_LADDER.indexOf(right)),
  ),
});

export const ARENA_WEATHER_PROFILES: Readonly<Record<ArenaId, ArenaWeatherProfile>> = Object.freeze({
  // Summer suburb: it showers, it does not gale. No storm rung.
  'atomic-acres': arenaProfile('atomic-acres', 'suburban-summer-showers', false, ['clear', 'overcast', 'light-rain', 'heavy-rain']),
  // Half the fight is under the concourse canopy, so downpours stay bounded.
  'skyline-terminal': arenaProfile('skyline-terminal', 'apron-squall-under-canopy', false, ['clear', 'overcast', 'light-rain', 'heavy-rain']),
  // North-sea rig. It has every rung and it uses them.
  'rustworks-1v1': arenaProfile('rustworks-1v1', 'north-sea-rig-weather', false, ['clear', 'overcast', 'light-rain', 'heavy-rain', 'storm']),
  // INDOORS. One rung, so the range can never rain — checked by test, not by
  // every consumer remembering there is a roof.
  'gun-range': arenaProfile('gun-range', 'indoor-range-no-sky', true, ['clear']),
  // Tropical: skips the dry middle and arrives as a wall of water.
  farcrysis: arenaProfile('farcrysis', 'tropical-monsoon-downpour', false, ['clear', 'overcast', 'light-rain', 'heavy-rain', 'storm']),
  // Open water with nothing to hide behind.
  'high-seas': arenaProfile('high-seas', 'open-ocean-squall-line', false, ['clear', 'overcast', 'light-rain', 'heavy-rain', 'storm']),
});

export function arenaWeatherProfile(arenaId: ArenaId): ArenaWeatherProfile {
  return ARENA_WEATHER_PROFILES[arenaId];
}

/** Reachable states for an arena, mild-first. */
export function weatherAvailability(arenaId: ArenaId): readonly WeatherState[] {
  return ARENA_WEATHER_PROFILES[arenaId].availableStates;
}

/** True only when the arena authors at least one precipitating state. */
export function arenaCanRain(arenaId: ArenaId): boolean {
  return weatherAvailability(arenaId).some((state) => WEATHER_STATE_TABLE[state].rainRate > 0);
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

function arenaHash(arenaId: ArenaId): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < arenaId.length; index += 1) {
    hash ^= arenaId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
}

export type WeatherPhase = Readonly<{
  /** 0-based index in the match's phase sequence. */
  index: number;
  state: WeatherState;
  /** State being blended out. Equals `state` on the opening phase. */
  previousState: WeatherState;
  startSeconds: number;
  durationSeconds: number;
}>;

/**
 * Rung chosen for the next phase. Weighted to climb from mild skies and to
 * fall out of severe ones, which is what produces a build/break arc instead of
 * a random walk that parks in a storm.
 */
function nextRung(rung: number, rungCount: number, roll: number): number {
  if (rungCount <= 1) return 0;
  const position = rung / (rungCount - 1);
  const downWeight = 0.12 + 0.42 * position;
  const upWeight = 0.42 - 0.30 * position;
  const delta = roll < downWeight ? -1 : roll < 1 - upWeight ? 0 : 1;
  return Math.min(rungCount - 1, Math.max(0, rung + delta));
}

function phaseSeed(arenaId: ArenaId, matchSeed: number): number {
  const seed = Math.trunc(Number.isFinite(matchSeed) ? matchSeed : 0) >>> 0;
  return hash32(arenaHash(arenaId) ^ hash32(seed ^ 0x5bf03635));
}

/**
 * The first `phaseCount` phases of a match. Exposed because "the weather never
 * repeats inside a match" is a property of this sequence, and a property you
 * cannot enumerate is a property you cannot test.
 */
export function weatherPhaseSequence(
  arenaId: ArenaId,
  matchSeed: number,
  phaseCount: number,
): readonly WeatherPhase[] {
  const available = ARENA_WEATHER_PROFILES[arenaId].availableStates;
  const root = phaseSeed(arenaId, matchSeed);
  const wanted = Math.min(MAX_PHASE_WALK, Math.max(0, Math.trunc(Number.isFinite(phaseCount) ? phaseCount : 0)));
  const phases: WeatherPhase[] = [];
  // Every match opens on its arena's mildest authored sky. Weather arrives; it
  // does not ambush a spawn that has not finished loading.
  let rung = 0;
  let previousState = available[0];
  let startSeconds = 0;
  for (let index = 0; index < wanted; index += 1) {
    const state = available[rung];
    const [low, high] = WEATHER_STATE_TABLE[state].durationSecondsRange;
    const durationSeconds = low + (high - low) * unit(hash32(root ^ Math.imul(index + 1, 0x27d4eb2f)));
    phases.push(Object.freeze({ index, state, previousState, startSeconds, durationSeconds }));
    startSeconds += durationSeconds;
    previousState = state;
    rung = nextRung(rung, available.length, unit(hash32(root ^ Math.imul(index + 1, 0x165667b1))));
  }
  return Object.freeze(phases);
}

export type WeatherSample = Readonly<{
  arenaId: ArenaId;
  /** The state being blended IN (the phase the match is currently inside). */
  state: WeatherState;
  /** The state being blended OUT. Equals `state` once the front has passed. */
  previousState: WeatherState;
  phaseIndex: number;
  /** 0 at the instant the front arrives, 1 once it has fully settled. */
  transitionBlend: number;
  intensity: number;
  rainRate: number;
  windMultiplier: number;
  /** 0..1, integrated closed-form from t=0 so a late joiner agrees exactly. */
  wetness: number;
  fogDensityMultiplier: number;
  skyDarkenAmount: number;
  raining: boolean;
}>;

/** Exponential relaxation toward `target`; never overshoots, so it is stable. */
function relaxWetness(wetness: number, target: number, seconds: number): number {
  if (seconds <= 0) return wetness;
  const rate = target > wetness ? WEATHER_WETNESS.soakRatePerSecond : WEATHER_WETNESS.dryRatePerSecond;
  return target + (wetness - target) * Math.exp(-rate * seconds);
}

/**
 * Integrates wetness across `seconds` of a phase whose target blends from
 * `previousTarget` to `target` over the transition. The blend region is walked
 * in a fixed number of sub-steps and the settled region analytically, so the
 * result depends only on elapsed time — never on frame rate or call cadence.
 */
function integratePhaseWetness(
  wetness: number,
  previousTarget: number,
  target: number,
  seconds: number,
  transitionSeconds: number,
): number {
  const blendSeconds = Math.min(transitionSeconds, seconds);
  let value = wetness;
  if (blendSeconds > 0 && previousTarget !== target) {
    const step = blendSeconds / WETNESS_TRANSITION_STEPS;
    for (let index = 0; index < WETNESS_TRANSITION_STEPS; index += 1) {
      const midpoint = (index + 0.5) / WETNESS_TRANSITION_STEPS;
      const blended = lerp(previousTarget, target, smoothstep01((blendSeconds * midpoint) / transitionSeconds));
      value = relaxWetness(value, blended, step);
    }
  } else if (blendSeconds > 0) {
    value = relaxWetness(value, target, blendSeconds);
  }
  return relaxWetness(value, target, seconds - blendSeconds);
}

/**
 * The single weather read. Deterministic from (arenaId, matchSeed,
 * elapsedSeconds) and cheap enough to call once per frame: a 15 minute match is
 * roughly a dozen phases, and each phase costs a handful of exponentials.
 */
export function sampleWeather(arenaId: ArenaId, matchSeed: number, elapsedSeconds: number): WeatherSample {
  const available = ARENA_WEATHER_PROFILES[arenaId].availableStates;
  const root = phaseSeed(arenaId, matchSeed);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);

  let rung = 0;
  let previousState = available[0];
  let state = available[0];
  let startSeconds = 0;
  let durationSeconds = 0;
  let index = 0;
  let wetness = WEATHER_STATE_TABLE[available[0]].wetnessTarget;

  for (; index < MAX_PHASE_WALK; index += 1) {
    state = available[rung];
    const [low, high] = WEATHER_STATE_TABLE[state].durationSecondsRange;
    durationSeconds = low + (high - low) * unit(hash32(root ^ Math.imul(index + 1, 0x27d4eb2f)));
    if (startSeconds + durationSeconds > elapsed) break;
    wetness = integratePhaseWetness(
      wetness,
      WEATHER_STATE_TABLE[previousState].wetnessTarget,
      WEATHER_STATE_TABLE[state].wetnessTarget,
      durationSeconds,
      WEATHER_TRANSITION_SECONDS,
    );
    startSeconds += durationSeconds;
    previousState = state;
    rung = nextRung(rung, available.length, unit(hash32(root ^ Math.imul(index + 1, 0x165667b1))));
  }

  const intoPhase = Math.min(durationSeconds, elapsed - startSeconds);
  const current = WEATHER_STATE_TABLE[state];
  const previous = WEATHER_STATE_TABLE[previousState];
  const transitionBlend = previousState === state
    ? 1
    : smoothstep01(intoPhase / WEATHER_TRANSITION_SECONDS);
  wetness = clamp01(integratePhaseWetness(
    wetness,
    previous.wetnessTarget,
    current.wetnessTarget,
    Math.max(0, intoPhase),
    WEATHER_TRANSITION_SECONDS,
  ));

  const rainRate = lerp(previous.rainRate, current.rainRate, transitionBlend);
  return Object.freeze({
    arenaId,
    state,
    previousState,
    phaseIndex: index,
    transitionBlend,
    intensity: lerp(previous.intensity, current.intensity, transitionBlend),
    rainRate,
    windMultiplier: lerp(previous.windMultiplier, current.windMultiplier, transitionBlend),
    wetness,
    fogDensityMultiplier: lerp(previous.fogDensityMultiplier, current.fogDensityMultiplier, transitionBlend),
    skyDarkenAmount: lerp(previous.skyDarkenAmount, current.skyDarkenAmount, transitionBlend),
    raining: rainRate > 0.001,
  });
}

/**
 * A settled-clear sample. Bypassed render profiles and menu/preview scenes need
 * a weather value that is unambiguously "nothing is happening" without having
 * to invent one at each call site.
 */
/**
 * A settled sample of one named state, for the `?weather=` HITL override.
 *
 * Natural weather reaches rain in roughly a fifth of five-minute matches, which
 * is the right variety to play with and the wrong odds to TEST with - without a
 * forcing switch you must reroll matches to see the feature at all.
 */
export function forcedWeatherSample(arenaId: ArenaId, state: WeatherState): WeatherSample {
  // Indoor arenas stay dry no matter what is asked for: the availability table
  // is a gameplay fact, not a preference.
  const permitted = weatherAvailability(arenaId);
  const resolved = permitted.includes(state) ? state : 'clear';
  const row = WEATHER_STATE_TABLE[resolved];
  return Object.freeze({
    arenaId,
    state: resolved,
    previousState: resolved,
    phaseIndex: 0,
    transitionBlend: 1,
    intensity: row.intensity,
    rainRate: row.rainRate,
    windMultiplier: row.windMultiplier,
    wetness: row.rainRate > 0 ? 1 : 0,
    fogDensityMultiplier: row.fogDensityMultiplier,
    skyDarkenAmount: row.skyDarkenAmount,
    raining: row.rainRate > 0.001,
  });
}

export function clearWeatherSample(arenaId: ArenaId): WeatherSample {
  const clear = WEATHER_STATE_TABLE.clear;
  return Object.freeze({
    arenaId,
    state: 'clear',
    previousState: 'clear',
    phaseIndex: 0,
    transitionBlend: 1,
    intensity: clear.intensity,
    rainRate: clear.rainRate,
    windMultiplier: clear.windMultiplier,
    wetness: 0,
    fogDensityMultiplier: clear.fogDensityMultiplier,
    skyDarkenAmount: clear.skyDarkenAmount,
    raining: false,
  });
}
