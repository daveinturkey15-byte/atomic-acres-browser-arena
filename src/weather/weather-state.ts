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
import {
  activeWeatherPresentation,
  weatherOverrideClockSeconds,
  type WeatherPresentationRuntime,
} from './weather-settings';

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
 * LIGHTNING — Pass 78.
 *
 * A storm with no lightning is a rain filter. The schedule is closed-form from
 * (arenaId, matchSeed) exactly like the phase walk, so two peers flash on the
 * same frame with zero traffic, and it is O(1) rather than a walk: strike `k`
 * lives in slot `k` and the slot index falls out of a division.
 *
 * The whole model is gated on RAIN RATE rather than on a state name, which is
 * what makes it agree with the presentation clamp for free: a player who has
 * capped their weather at LIGHT has a rain rate below the floor and therefore
 * gets no flashes, without the clamp having to know lightning exists.
 */
export const WEATHER_LIGHTNING = Object.freeze({
  /** One strike slot this long; the strike lands somewhere inside it. */
  strikeIntervalSeconds: 9.5,
  /** Fraction of the slot the strike may wander across. */
  slotJitter: 0.72,
  /** No flash at all below this rain rate. Heavy rain is where storms live. */
  rainRateFloor: WEATHER_HEAVY_RAIN_RATE,
  /** Total visible flash length (s). Nothing is lit after this. */
  flashSeconds: 0.26,
  /**
   * COMBAT-SAFETY CEILING. Hard cap on the 0..1 flash value at any rain rate,
   * any distance and any settings. A flash only ever ADDS light, and it adds
   * at most this fraction of the presentation's flash budget for at most
   * `flashSeconds`. Enforced here, re-checked by `assertLightningCombatSafety`.
   */
  maxFlash: 0.62,
  /** Strike distance band (m). Closer strikes are brighter and quicker. */
  minDistanceM: 260,
  maxDistanceM: 4200,
  /** Brightness multiplier at `maxDistanceM`. Never zero: far sky still lights. */
  farBrightness: 0.42,
  /** Speed of sound for the thunder delay (m/s). */
  soundSpeedMps: 343,
} as const);

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
  // Dry range under hard mid-morning sun: pinned clear by design.
  'test1': arenaProfile('test1', 'dry-range-hard-sun', false, ['clear']),
  // Golden-hour hillside estate: pinned clear by design.
  'test2': arenaProfile('test2', 'golden-hour-hillside-clear', false, ['clear']),
  // MAP3 (PREVIEW): the bays are open to the sky, so weather is real here, but
  // the arena is authored for hard midmorning light and rain would contradict
  // the whole grade. Clear and overcast only until it leaves preview.
  'map3': arenaProfile('map3', 'open-scrub-midmorning-clear', false, ['clear', 'overcast']),
  // NUKETOWN2 (PREVIEW, HF-407): PINNED CLEAR, the same authored posture as
  // Test1 and Test2 and for the same reason. This arena is authored for hard
  // bleached noon - its visual module declares `clouds: false`, it flies the
  // same 'range-midmorning' sky preset Test1 does, and its grade is built on a
  // colourless high sun - so rain here would fall out of a sky with nothing in
  // it. Deliberately NOT the shipped Nuke Town's four-rung shower ladder even
  // though the two are the same place: the rebuild is a different time of day,
  // and that is the one difference between them that is on purpose.
  //
  // Measured while landing this row, and worth the next weather owner's time:
  // with any multi-rung ladder this arena fails
  // `never repeats the derived weather signal at any lag inside a match`. The
  // schedule is seeded by the ARENA ID string, and 'nuketown2' happens to draw
  // three consecutive 129-149 s phases, so no phase boundary is ever straddled
  // by a lag-5 sample pair inside the test's 0-320 s window. That is a property
  // of the gate's fixed seed and sample cadence, not of this arena - four
  // different rung sets were tried and all four fail identically. Recorded in
  // the HF-407 lane report rather than fixed here: the gate is not this lane's
  // to change, and pinning clear is the right authoring call regardless.
  'nuketown2': arenaProfile('nuketown2', 'test-town-bleached-noon', false, ['clear']),
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

export type WeatherLightning = Readonly<{
  /** True while a strike is lighting the sky. */
  active: boolean;
  /** 0..1 flash brightness, already capped by WEATHER_LIGHTNING.maxFlash. */
  flash: number;
  /** Monotonic strike id, -1 before the match's first strike. */
  strikeIndex: number;
  /** Straight-line distance to that strike (m). */
  distanceM: number;
  /** Seconds between the flash and its thunder for this strike. */
  thunderDelaySeconds: number;
  /**
   * Seconds until this strike's thunder arrives; <= 0 once it has. AUDIO READS
   * THIS. The rule for a consumer is "fire once per strikeIndex, on the frame
   * this first crosses zero" - which is a property of the sample rather than of
   * a callback, so a system that starts late still gets it right.
   */
  thunderInSeconds: number;
  /** Seconds since the flash itself. */
  sinceStrikeSeconds: number;
}>;

export const NO_LIGHTNING: WeatherLightning = Object.freeze({
  active: false,
  flash: 0,
  strikeIndex: -1,
  distanceM: 0,
  thunderDelaySeconds: 0,
  thunderInSeconds: 0,
  sinceStrikeSeconds: 0,
});

/**
 * Two flashes, not one: the stepped leader, then the return stroke ~55 ms
 * later. A single exponential reads as a camera flash rather than as weather.
 * The tail is squared to zero at `flashSeconds` so the light never truncates
 * mid-decay, and the 1.44 brings the pair's peak to exactly 1 so `maxFlash` is
 * the only ceiling in play.
 */
export function lightningFlashEnvelope(ageSeconds: number): number {
  const age = Number.isFinite(ageSeconds) ? ageSeconds : -1;
  if (age < 0 || age >= WEATHER_LIGHTNING.flashSeconds) return 0;
  const leader = Math.exp(-age / 0.035) * 0.55;
  const stroke = age >= 0.055 ? Math.exp(-(age - 0.055) / 0.075) : 0;
  const tail = 1 - age / WEATHER_LIGHTNING.flashSeconds;
  return Math.min(1, (leader + stroke) * tail * tail * 1.44);
}

function lightningSlotStrikeSeconds(root: number, slot: number): number {
  const jitter = unit(hash32(root ^ Math.imul(slot + 1, 0x7ed55d16)));
  return (slot + jitter * WEATHER_LIGHTNING.slotJitter) * WEATHER_LIGHTNING.strikeIntervalSeconds;
}

/**
 * The lightning read. Pure, O(1), and derived from the same (arenaId,
 * matchSeed) root as the phase walk, so no peer has to be told a strike
 * happened.
 *
 * `rainRate` is the PRESENTED rain rate, which is what makes the player's
 * weather ceiling apply to lightning without this function knowing the ceiling
 * exists.
 */
export function sampleWeatherLightning(
  arenaId: ArenaId,
  matchSeed: number,
  elapsedSeconds: number,
  rainRate: number,
  enabled = true,
): WeatherLightning {
  const stormFactor = clamp01(
    (clamp01(Number.isFinite(rainRate) ? rainRate : 0) - WEATHER_LIGHTNING.rainRateFloor)
    / (1 - WEATHER_LIGHTNING.rainRateFloor),
  );
  // The common case by a wide margin: most of a match, and every sample on an
  // arena that cannot reach heavy rain, has no storm to strike from. Answering
  // it with the shared frozen row keeps sampleWeather allocation-free on the
  // path it spends nearly all of its time on.
  if (!enabled || stormFactor <= 0) return NO_LIGHTNING;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const root = hash32(phaseSeed(arenaId, matchSeed) ^ 0x3f1b_9d0d);
  let slot = Math.floor(elapsed / WEATHER_LIGHTNING.strikeIntervalSeconds);
  let strikeSeconds = lightningSlotStrikeSeconds(root, slot);
  if (elapsed < strikeSeconds) {
    slot -= 1;
    strikeSeconds = lightningSlotStrikeSeconds(root, slot);
  }
  if (slot < 0) return NO_LIGHTNING;
  const span = WEATHER_LIGHTNING.maxDistanceM - WEATHER_LIGHTNING.minDistanceM;
  const distanceUnit = unit(hash32(root ^ Math.imul(slot + 1, 0xc761c23c)));
  const distanceM = WEATHER_LIGHTNING.minDistanceM + distanceUnit * span;
  const thunderDelaySeconds = distanceM / WEATHER_LIGHTNING.soundSpeedMps;
  const sinceStrikeSeconds = elapsed - strikeSeconds;
  const proximity = lerp(1, WEATHER_LIGHTNING.farBrightness, distanceUnit);
  const flash = Math.min(
    WEATHER_LIGHTNING.maxFlash,
    lightningFlashEnvelope(sinceStrikeSeconds) * WEATHER_LIGHTNING.maxFlash * stormFactor * proximity,
  );
  return Object.freeze({
    active: flash > 0.001,
    flash,
    strikeIndex: slot,
    distanceM,
    thunderDelaySeconds,
    thunderInSeconds: thunderDelaySeconds - sinceStrikeSeconds,
    sinceStrikeSeconds,
  });
}

/**
 * Fail-closed combat-safety check for the flash, in the shape
 * `assertDepthOfFieldCombatSafety` uses: it THROWS rather than documenting a
 * hope. A flash may only ever add light, may never exceed the cap, and may
 * never outlast `flashSeconds`.
 */
export function assertLightningCombatSafety(): void {
  if (!(WEATHER_LIGHTNING.maxFlash > 0 && WEATHER_LIGHTNING.maxFlash <= 0.65)) {
    throw new Error(`Lightning flash ceiling is outside the readability envelope: ${WEATHER_LIGHTNING.maxFlash}`);
  }
  if (WEATHER_LIGHTNING.flashSeconds > 0.3) {
    throw new Error(`Lightning flash outlasts the readability budget: ${WEATHER_LIGHTNING.flashSeconds}s`);
  }
  for (let age = -0.05; age <= WEATHER_LIGHTNING.flashSeconds + 0.05; age += 0.002) {
    const value = lightningFlashEnvelope(age);
    if (!(value >= 0 && value <= 1)) {
      throw new Error(`Lightning flash envelope left 0..1 at age ${age.toFixed(3)}: ${value}`);
    }
    if (age >= WEATHER_LIGHTNING.flashSeconds && value !== 0) {
      throw new Error(`Lightning kept lighting the sky after ${WEATHER_LIGHTNING.flashSeconds}s`);
    }
  }
}

export type WeatherSample = Readonly<{
  arenaId: ArenaId;
  /** The state being blended IN, AFTER the local presentation ceiling. */
  state: WeatherState;
  /** The state being blended OUT. Equals `state` once the front has passed. */
  previousState: WeatherState;
  /**
   * The state the MATCH is in, before this screen's weather ceiling. Every peer
   * agrees on this field whatever anybody's Options say, so it - not `state` -
   * is what a shared-world consumer compares.
   */
  simulatedState: WeatherState;
  /** Rung of the presented `state` on WEATHER_SEVERITY_LADDER. */
  severity: number;
  /** The ceiling this screen applied. Equals `storm` when nothing was capped. */
  presentationCeiling: WeatherState;
  phaseIndex: number;
  /** 0 at the instant the front arrives, 1 once it has fully settled. */
  transitionBlend: number;
  intensity: number;
  rainRate: number;
  /** Already includes the player's wind-strength setting. */
  windMultiplier: number;
  /** 0..1, integrated closed-form from t=0 so a late joiner agrees exactly. */
  wetness: number;
  fogDensityMultiplier: number;
  skyDarkenAmount: number;
  raining: boolean;
  /** Storm flash and thunder timing. Audio-facing; see WeatherLightning. */
  lightning: WeatherLightning;
}>;

/**
 * The player's weather ceiling, resolved against ONE ARENA'S authored states.
 *
 * Clamping happens at the STATE level rather than on the derived scalars: a
 * capped sample still blends smoothly from its previous rung up to the ceiling
 * instead of rising and then hard-clipping, and clamping into `available`
 * rather than into the global ladder means a capped sample can only ever be a
 * state this arena actually authored.
 */
function presentationRung(available: readonly WeatherState[], ceiling: WeatherState): number {
  const ceilingSeverity = WEATHER_SEVERITY_LADDER.indexOf(ceiling);
  let rung = 0;
  for (let index = 0; index < available.length; index += 1) {
    if (WEATHER_STATE_TABLE[available[index]].severity <= ceilingSeverity) rung = index;
  }
  return rung;
}

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
export function sampleWeather(
  arenaId: ArenaId,
  matchSeed: number,
  elapsedSeconds: number,
  presentation: WeatherPresentationRuntime = activeWeatherPresentation(),
): WeatherSample {
  const available = ARENA_WEATHER_PROFILES[arenaId].availableStates;
  const ceilingRung = presentationRung(available, presentation.ceilingState);
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
  const simulatedState = state;
  const transitionBlend = previousState === state
    ? 1
    : smoothstep01(intoPhase / WEATHER_TRANSITION_SECONDS);
  // Wetness is integrated against the SIMULATED targets - the ground got as
  // wet as the match made it - and then capped at what the presented ceiling
  // could itself have soaked. Integrating a clamped target instead would make
  // wetness depend on when the player last changed the setting.
  wetness = clamp01(integratePhaseWetness(
    wetness,
    WEATHER_STATE_TABLE[previousState].wetnessTarget,
    WEATHER_STATE_TABLE[state].wetnessTarget,
    Math.max(0, intoPhase),
    WEATHER_TRANSITION_SECONDS,
  ));

  const presentedState = available[Math.min(available.indexOf(state), ceilingRung)];
  const presentedPreviousState = available[Math.min(available.indexOf(previousState), ceilingRung)];
  const current = WEATHER_STATE_TABLE[presentedState];
  const previous = WEATHER_STATE_TABLE[presentedPreviousState];
  // The wettest the presented ceiling could itself have made the ground. A
  // no-op when nothing is capped, because the relaxation never overshoots a
  // target it is already integrating toward.
  const wetnessCeiling = WEATHER_STATE_TABLE[available[ceilingRung]].wetnessTarget;

  const rainRate = lerp(previous.rainRate, current.rainRate, transitionBlend);
  return Object.freeze({
    arenaId,
    state: presentedState,
    previousState: presentedPreviousState,
    simulatedState,
    severity: current.severity,
    presentationCeiling: presentation.ceilingState,
    phaseIndex: index,
    transitionBlend,
    intensity: lerp(previous.intensity, current.intensity, transitionBlend),
    rainRate,
    windMultiplier: lerp(previous.windMultiplier, current.windMultiplier, transitionBlend) * presentation.windStrength,
    wetness: Math.min(wetness, wetnessCeiling),
    fogDensityMultiplier: lerp(previous.fogDensityMultiplier, current.fogDensityMultiplier, transitionBlend),
    skyDarkenAmount: lerp(previous.skyDarkenAmount, current.skyDarkenAmount, transitionBlend),
    raining: rainRate > 0.001,
    lightning: sampleWeatherLightning(arenaId, matchSeed, elapsed, rainRate, presentation.lightning),
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
export function forcedWeatherSample(
  arenaId: ArenaId,
  state: WeatherState,
  presentation: WeatherPresentationRuntime = activeWeatherPresentation(),
  // Accumulated presentation frame time, not a wall clock. Without a clock the
  // one route built for LOOKING at weather would be the one route that can
  // never show lightning. See weather-settings.ts -> THE OVERRIDE CLOCK.
  elapsedSeconds: number = weatherOverrideClockSeconds(),
): WeatherSample {
  // Indoor arenas stay dry no matter what is asked for: the availability table
  // is a gameplay fact, not a preference.
  const permitted = weatherAvailability(arenaId);
  // An over-severe request CLAMPS DOWN to the arena's heaviest rung; it does
  // not fall back to clear. The old `includes ? state : 'clear'` did fall back,
  // and a live WebGPU capture caught what that costs: `?weather=storm` on
  // atomic-acres - whose table stops at heavy-rain - returned rainRate 0 and
  // zero streaks, so the ONE route built for looking at heavy weather showed a
  // sunny sky. Reusing presentationRung is what makes this correct by
  // construction: it already means "the heaviest available rung at or below
  // this one", which is exactly the question being asked twice here.
  const requestedRung = presentationRung(permitted, state);
  // The player's ceiling applies to the override too. A capture taken with
  // `?weather=storm` and WEATHER: LIGHT must show what LIGHT actually ships,
  // or the override is testing a configuration nobody can play.
  const ceilingRung = presentationRung(permitted, presentation.ceilingState);
  const requested = permitted[requestedRung];
  const resolved = permitted[Math.min(requestedRung, ceilingRung)];
  const row = WEATHER_STATE_TABLE[resolved];
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  return Object.freeze({
    arenaId,
    state: resolved,
    previousState: resolved,
    simulatedState: requested,
    severity: row.severity,
    presentationCeiling: presentation.ceilingState,
    phaseIndex: 0,
    transitionBlend: 1,
    intensity: row.intensity,
    rainRate: row.rainRate,
    windMultiplier: row.windMultiplier * presentation.windStrength,
    wetness: row.rainRate > 0 ? 1 : 0,
    fogDensityMultiplier: row.fogDensityMultiplier,
    skyDarkenAmount: row.skyDarkenAmount,
    raining: row.rainRate > 0.001,
    lightning: sampleWeatherLightning(arenaId, 0, elapsed, row.rainRate, presentation.lightning),
  });
}

export function clearWeatherSample(
  arenaId: ArenaId,
  presentation: WeatherPresentationRuntime = activeWeatherPresentation(),
): WeatherSample {
  const clear = WEATHER_STATE_TABLE.clear;
  return Object.freeze({
    arenaId,
    state: 'clear',
    previousState: 'clear',
    simulatedState: 'clear',
    severity: clear.severity,
    presentationCeiling: presentation.ceilingState,
    phaseIndex: 0,
    transitionBlend: 1,
    intensity: clear.intensity,
    rainRate: clear.rainRate,
    // Still air is still air, but the wind field itself is not weather - a
    // clear sky still has the arena's prevailing breeze, scaled by the player.
    windMultiplier: clear.windMultiplier * presentation.windStrength,
    wetness: 0,
    fogDensityMultiplier: clear.fogDensityMultiplier,
    skyDarkenAmount: clear.skyDarkenAmount,
    raining: false,
    lightning: NO_LIGHTNING,
  });
}
