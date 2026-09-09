/**
 * particles/ambient-life-settings.ts — Pass 79: the player's half of the air.
 *
 * WHY THIS EXISTS
 * The ambient particle system shipped wired, live and completely unadjustable.
 * A player who found the motes busy, or who wanted the thicker air the owner
 * asked for ("we need more like dust and particle effects"), had exactly one
 * lever: `PARTICLES` in Options, whose three tiers are a CAPACITY CEILING and
 * a performance control. Nothing said how much of that ceiling to use.
 *
 * The two are genuinely different knobs and conflating them is why the top of
 * the quality select felt like it did nothing: raising the ceiling from 900 to
 * 1536 changes nothing at all if the arena profile only ever asks for 347.
 *
 * WHAT AN AMBIENT-LIFE SETTING IS ALLOWED TO BE
 * The same status every other presentation control has, and for the same
 * reason weather/weather-settings.ts spells out at length: it is a LOCAL
 * PRESENTATION SCALE. Ambient particles carry no gameplay authority, block no
 * shots and enter no networked state, so this one is easier than the weather
 * clamp - but it still may not reach past the family capacity the quality tier
 * pinned, because that ceiling is what the readability audit and the frame
 * budget were both computed against.
 *
 * THE LATCH
 * Identical idiom to `weather-settings.ts`: `resolveGraphicsRuntime` publishes,
 * and `ParticleRuntime.update` reads this as a DEFAULT ARGUMENT. The runtime is
 * constructed at module scope in legacy-main before any settings object exists
 * and is never handed one afterwards, so without a latch this row would be a
 * switch wired to nothing - the exact failure this project has already paid for
 * three times. Tests pass the runtime explicitly and never touch the latch.
 *
 * THIS FILE IS PURE apart from that one explicit latch. No THREE, no timers,
 * no Math.random, no wall-clock.
 */

/**
 * Slider bounds. 1 is the authored per-arena density. The ceiling is 2 because
 * the arena profiles ask for roughly a third to a half of the family capacity,
 * so doubling is a real, visible increase that still cannot reach the tier's
 * instance ceiling; the ceiling itself is enforced downstream in
 * `particle-field.ts`, not by this slider's good manners.
 */
export const AMBIENT_LIFE_RANGE = Object.freeze({ minimum: 0, maximum: 2, step: 0.05 } as const);

export type AmbientLifeSettings = Readonly<{
  /** Multiplies the authored ambient population. 0 is genuinely empty air. */
  ambientLife: number;
}>;

export type AmbientLifeRuntime = Readonly<{
  /** Multiplies the live ambient population. Never negative, never unbounded. */
  density: number;
  /** False only at 0: the ambient families are parked rather than thinned. */
  enabled: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Pure resolver. A hostile persisted value degrades to the authored default
 * rather than throwing: a corrupt setting must cost the player some dust, not
 * a crashed frame loop.
 */
export function resolveAmbientLife(settings: Partial<AmbientLifeSettings>): AmbientLifeRuntime {
  const density = clamp(finite(settings.ambientLife, 1), AMBIENT_LIFE_RANGE.minimum, AMBIENT_LIFE_RANGE.maximum);
  return Object.freeze({ density, enabled: density > 0 });
}

/** What a consumer sees before anything is published: the authored air. */
export const DEFAULT_AMBIENT_LIFE: AmbientLifeRuntime = resolveAmbientLife({});

let published: AmbientLifeRuntime = DEFAULT_AMBIENT_LIFE;

/**
 * The one write. `resolveGraphicsRuntime` is the only production caller: boot,
 * and again on every Options apply.
 */
export function publishAmbientLife(runtime: AmbientLifeRuntime): void {
  published = runtime;
}

/** The default argument the ambient particle runtime falls back to. */
export function activeAmbientLife(): AmbientLifeRuntime {
  return published;
}

/** Test-only reset, so one suite's settings cannot leak into the next. */
export function resetAmbientLife(): void {
  published = DEFAULT_AMBIENT_LIFE;
}
