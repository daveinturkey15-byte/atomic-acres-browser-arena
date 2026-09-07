/**
 * weather-settings.ts — Pass 78: the player's half of the weather contract.
 *
 * WHY THIS EXISTS
 * Weather shipped as a simulation with no switch on it. The owner audit rated
 * "options to toggle/adjust the weather and rain" NOT-STARTED, and it was
 * right: `weather-state.ts` and `rain-presentation.ts` were fully authored and
 * completely unadjustable. Every other graphics feature in the game has a row
 * in `graphics-settings-registry.ts`; weather had none, so a player who found
 * rain unreadable, or who wanted more of it, had nothing to touch.
 *
 * WHAT A WEATHER CONTROL IS ALLOWED TO BE
 * Weather is derived from (arenaId, matchSeed, elapsedSeconds) precisely so
 * every peer computes the same sky with zero network traffic. A per-player
 * setting cannot be allowed to change that derivation, or the determinism
 * contract is gone and two peers are back to arguing about different matches.
 *
 * So a weather setting is a LOCAL PRESENTATION CLAMP and nothing else:
 *
 *   - The simulated state is computed first, from the seed, exactly as before.
 *     `WeatherSample.simulatedState` always reports it, and every peer agrees
 *     on that field whatever anybody's options say.
 *   - The clamp then decides how much of that sky THIS screen draws. It can
 *     only ever show the same weather or less of it — it can never invent a
 *     storm the match did not roll, and it can never reach a state the arena
 *     did not author.
 *
 * That is the same status every other presentation control has: turning
 * particles down does not change where the grenade landed.
 *
 * THE LATCH
 * `resolveGraphicsRuntime` publishes the resolved runtime here, and the weather
 * modules read it as a DEFAULT ARGUMENT. Callers that want purity (every test
 * in this lane) pass the runtime explicitly and never touch the latch at all;
 * the running game, whose weather systems are constructed at module scope
 * before any settings exist and are never handed settings afterwards, gets the
 * player's live choice without a per-frame plumb through the frame loop. The
 * published value is a pure function of the settings, so publishing twice with
 * the same settings republishes the same numbers.
 *
 * THIS FILE IS PURE apart from that one explicit latch. No THREE, no timers,
 * no Math.random, no wall-clock.
 */

// Type-only: erased at compile time, so this file has no runtime edge back to
// weather-state.ts and the two modules cannot form an initialisation cycle.
// The ceiling is carried as a STATE NAME for the same reason - weather-state.ts
// owns the severity ladder and resolves the name against it.
import type { WeatherState } from './weather-state';

/**
 * The player-facing ladder, in the owner's words. Each choice is a CEILING on
 * how far the arena's own weather may build on this screen — `storm` is not
 * "force a storm", it is "no ceiling, show me whatever the match rolls".
 */
export type WeatherIntensityChoice = 'off' | 'light' | 'moderate' | 'heavy' | 'storm';

export const WEATHER_INTENSITY_CHOICES: readonly WeatherIntensityChoice[] = Object.freeze([
  'off', 'light', 'moderate', 'heavy', 'storm',
]);

/**
 * Choice -> highest severity rung this screen will present. Indices are into
 * WEATHER_SEVERITY_LADDER, so the table cannot drift from the ladder without
 * the weather-settings tests noticing.
 */
export const WEATHER_INTENSITY_CEILING: Readonly<Record<WeatherIntensityChoice, WeatherState>> = Object.freeze({
  off: 'clear',
  light: 'overcast',
  moderate: 'light-rain',
  heavy: 'heavy-rain',
  storm: 'storm',
});

/**
 * Rain density slider bounds. The ceiling is 1.5 rather than 1 because the
 * authored density is the middle of the range the owner asked to be able to
 * push, and the instance ceiling in `rain-presentation.ts` bounds what 1.5
 * can actually place on screen — the combat-safety proof is enforced there
 * (`assertRainCombatSafety`), not by this slider's good manners.
 */
export const WEATHER_RAIN_DENSITY_RANGE = Object.freeze({ minimum: 0.25, maximum: 1.5, step: 0.05 } as const);

/** Wind strength slider bounds. 0 is genuinely still air, 1 is authored. */
export const WEATHER_WIND_STRENGTH_RANGE = Object.freeze({ minimum: 0, maximum: 2, step: 0.05 } as const);

export type WeatherPresentationSettings = Readonly<{
  weatherIntensity: WeatherIntensityChoice;
  rainDensity: number;
  windStrength: number;
  lightning: boolean;
  wetSurfaces: boolean;
}>;

export type WeatherPresentationRuntime = Readonly<{
  intensity: WeatherIntensityChoice;
  /** Highest rung of WEATHER_SEVERITY_LADDER this screen presents, by name. */
  ceilingState: WeatherState;
  /** Multiplies the presented rain instance count. */
  rainDensity: number;
  /** Multiplies the presented wind speed. Never negative. */
  windStrength: number;
  /** Whether storm flashes are drawn. Thunder STATE is exposed regardless. */
  lightning: boolean;
  /**
   * Whether rain darkens and glosses the ground it falls on. The wetness VALUE
   * is still simulated and still peer-identical either way - this only decides
   * whether the local screen writes it into the arena's materials.
   */
  wetSurfaces: boolean;
  /** False only for `off`: nothing precipitates and the sky stays baseline. */
  weatherEnabled: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Pure resolver. Hostile values fall back to the authored defaults rather than
 * throwing: a corrupt persisted setting must degrade to playable weather, not
 * to a crashed frame loop.
 */
export function resolveWeatherPresentation(settings: Partial<WeatherPresentationSettings>): WeatherPresentationRuntime {
  const intensity = WEATHER_INTENSITY_CHOICES.includes(settings.weatherIntensity as WeatherIntensityChoice)
    ? settings.weatherIntensity as WeatherIntensityChoice
    : 'storm';
  const ceilingState = WEATHER_INTENSITY_CEILING[intensity];
  return Object.freeze({
    intensity,
    ceilingState,
    rainDensity: clamp(
      finite(settings.rainDensity, 1),
      WEATHER_RAIN_DENSITY_RANGE.minimum,
      WEATHER_RAIN_DENSITY_RANGE.maximum,
    ),
    windStrength: clamp(
      finite(settings.windStrength, 1),
      WEATHER_WIND_STRENGTH_RANGE.minimum,
      WEATHER_WIND_STRENGTH_RANGE.maximum,
    ),
    lightning: typeof settings.lightning === 'boolean' ? settings.lightning : true,
    wetSurfaces: typeof settings.wetSurfaces === 'boolean' ? settings.wetSurfaces : true,
    weatherEnabled: intensity !== 'off',
  });
}

/**
 * What a consumer sees before anything is published: the full authored
 * experience. A missing settings layer must never silently mute a feature.
 */
export const DEFAULT_WEATHER_PRESENTATION: WeatherPresentationRuntime = resolveWeatherPresentation({});

let published: WeatherPresentationRuntime = DEFAULT_WEATHER_PRESENTATION;

/**
 * The one write. `resolveGraphicsRuntime` is the only production caller: it
 * runs at boot and again on every Options apply, which is exactly the cadence
 * a presentation clamp needs.
 */
export function publishWeatherPresentation(runtime: WeatherPresentationRuntime): void {
  published = runtime;
}

/** The default argument every weather consumer falls back to. */
export function activeWeatherPresentation(): WeatherPresentationRuntime {
  return published;
}

/** Test-only reset, so one suite's settings cannot leak into the next. */
export function resetWeatherPresentation(): void {
  published = DEFAULT_WEATHER_PRESENTATION;
}

/**
 * THE OVERRIDE CLOCK — testing path only.
 *
 * `?weather=storm` pins the sky to one state so a capture does not have to
 * reroll matches to see the feature. `forcedWeatherSample` therefore has no
 * match elapsed time to work from, and a lightning schedule with no clock is a
 * lightning schedule that never fires — which would make the one route built
 * for LOOKING at weather the one route that cannot show all of it.
 *
 * So the rain presentation advances this counter by its own frame delta and the
 * forced sample reads it. It is accumulated frame time, not `Date.now()`: the
 * same sequence of frame deltas produces the same flashes, and nothing on the
 * natural (seeded, peer-identical) path reads it at all.
 */
let overrideClockSeconds = 0;

export function advanceWeatherOverrideClock(deltaSeconds: number): number {
  const step = finite(deltaSeconds, 0);
  if (step > 0) overrideClockSeconds += step;
  return overrideClockSeconds;
}

export function weatherOverrideClockSeconds(): number {
  return overrideClockSeconds;
}

export function resetWeatherOverrideClock(): void {
  overrideClockSeconds = 0;
}
