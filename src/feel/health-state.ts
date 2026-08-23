/**
 * Damage feel, part 2: the player's CONDITION.
 *
 * `impact-response.ts` is per-event and transient - it answers "what just
 * happened to me". This module is persistent and answers "what state am I in":
 * heart rate, breathing, whether I am critical, and how far through recovery I
 * am. It is what makes a firefight have an arc instead of a series of flashes.
 *
 * Pure and frame-rate independent, on the same rules as the impact module.
 *
 * ---------------------------------------------------------------------------
 * WHY HYSTERESIS, AND WHY IT IS NOT ENOUGH ON ITS OWN
 *
 * A single "health < 30%" threshold flickers: regen ticks, a heal, or a shot
 * that lands exactly on the boundary toggle the critical state on and off many
 * times a second, which strobes the vignette and machine-guns the heartbeat
 * cue. That is not a theoretical failure - it is the classic low-health-HUD bug.
 *
 * Three defences, in order:
 *  1. HYSTERESIS. Enter at <= 30% health, leave only at >= 38%. Between those
 *    the state simply holds. (These are the same numbers as the existing
 *    LOW_HEALTH_ENTER_HP / LOW_HEALTH_EXIT_HP in `src/sensory-feedback.ts`, so
 *    the HUD cannot disagree with itself about what "critical" means.)
 *  2. A MINIMUM DWELL on the way OUT only. Once critical, the state must hold
 *    for CRITICAL_MIN_DWELL_SECONDS before it may clear, so a burst of healing
 *    across the exit threshold cannot blink it off and on. Entering is never
 *    delayed: "you are about to die" is information the player needs THIS frame,
 *    and a dwell gate on entry would withhold it.
 *  3. A SMOOTHED LEVEL. `criticalLevel` ramps between 0 and 1 on an exponential
 *    curve rather than stepping. Even if the boolean somehow toggled, nothing
 *    downstream can strobe, because everything visual is driven by the level.
 *
 * ---------------------------------------------------------------------------
 * THE CURVES
 *
 *  - damagePressure ("how hard have I just been hit"): exponential decay,
 *    half-life DAMAGE_PRESSURE_HALF_LIFE_SECONDS, saturating accumulation so a
 *    spam of hits converges on 1 instead of exploding.
 *  - recovery: a smoothstep that stays at 0 for RECOVERY_DELAY_SECONDS after
 *    the last hit and then eases to 1 over RECOVERY_SECONDS. The delay is the
 *    point - an instant relax the moment shooting stops feels like a bug; a
 *    beat of held tension then a settle feels like breathing.
 *  - heart and breath rate: linear interpolation from resting to maximum over a
 *    "drive" that is the maximum of a health term and a recent-damage term. The
 *    max, not the sum: a player at 5% health who has been calm for a minute
 *    still has a fast heart (the health term holds the floor), and recovery can
 *    only relax the damage term. Adrenaline decays; blood loss does not.
 *  - phases integrate rate over time in fixed substeps of at most
 *    PHASE_SUBSTEP_SECONDS, so a partition of the same elapsed time gives the
 *    same phase to well under a millisecond of beat.
 */

import { clamp01, decayFactor, saturatingAdd } from './impact-response';

/** Enter critical at or below this health fraction. Matches LOW_HEALTH_ENTER_HP. */
export const CRITICAL_ENTER_FRACTION = 0.30;
/** Leave critical only at or above this. Matches LOW_HEALTH_EXIT_HP. */
export const CRITICAL_EXIT_FRACTION = 0.38;
/** Critical must hold this long before it is allowed to clear. Entry is never delayed. */
export const CRITICAL_MIN_DWELL_SECONDS = 0.75;
/** Half-life of the smoothed critical level rising and falling. */
export const CRITICAL_RISE_HALF_LIFE_SECONDS = 0.22;
export const CRITICAL_FALL_HALF_LIFE_SECONDS = 0.65;

/** Recent-damage pressure half-life. */
export const DAMAGE_PRESSURE_HALF_LIFE_SECONDS = 2.2;
/** Held tension before recovery starts easing in. */
export const RECOVERY_DELAY_SECONDS = 1.6;
/** Length of the recovery ease once it starts. */
export const RECOVERY_SECONDS = 4.5;

/** Resting heart rate, Hz (~63 bpm). */
export const HEARTBEAT_RESTING_HZ = 1.05;
/** Maximum heart rate, Hz (~156 bpm). Beyond this it reads as a machine, not a body. */
export const HEARTBEAT_MAX_HZ = 2.6;
/** Resting breath rate, Hz (~15 breaths/min). */
export const BREATH_RESTING_HZ = 0.25;
/** Maximum breath rate, Hz (~37 breaths/min). */
export const BREATH_MAX_HZ = 0.62;

/** Distress below this produces no audible heartbeat at all. */
export const HEARTBEAT_ONSET_DISTRESS = 0.22;
/** Distress below this produces no audible breathing at all. */
export const BREATH_ONSET_DISTRESS = 0.12;
/** How much of the damage-driven elevation full recovery may relax. */
export const RECOVERY_RELAXATION = 0.85;

/** Peripheral critical vignette ceiling. Deliberately low: see combat safety. */
export const CRITICAL_VIGNETTE_CEILING = 0.42;

/** Phase integration substep. 1/120 s is finer than any frame we ship at. */
export const PHASE_SUBSTEP_SECONDS = 1 / 120;
/** Phase catch-up ceiling after a backgrounded tab; levels still decay fully. */
export const PHASE_MAX_CATCHUP_SECONDS = 1;

export type HealthFeelState = Readonly<{
  /** Last observed health fraction, 0..1. */
  healthFraction: number;
  /** Whether the player is alive; a dead player has no heartbeat. */
  alive: boolean;
  /** Recent-damage pressure 0..1. */
  damagePressure: number;
  /** Seconds since the last damage event. */
  secondsSinceDamage: number;
  critical: boolean;
  /** Seconds the current critical value has been held; gates the exit only. */
  criticalHeldSeconds: number;
  /** Smoothed 0..1 critical level. Everything visual reads this, never the boolean. */
  criticalLevel: number;
  /** Heartbeat phase 0..1. */
  heartbeatPhase: number;
  /** Breath phase 0..1. */
  breathPhase: number;
}>;

export type HealthFeelSignals = Readonly<{
  /** Master 0..1 "how bad is it" used to drive everything else. */
  distress: number;
  heartbeatHz: number;
  breathHz: number;
  heartbeatPhase: number;
  breathPhase: number;
  /** 0..1 lub-dub envelope. Peaks at the beat; the HUD/audio multiplies by gain. */
  heartbeatPulse: number;
  /** 0..1 heartbeat loudness. Zero until distress passes HEARTBEAT_ONSET_DISTRESS. */
  heartbeatGain: number;
  /** 0..1 breath envelope (inhale/exhale). */
  breathPulse: number;
  breathGain: number;
  critical: boolean;
  /** Smoothed 0..1. Cannot flicker; use this, not `critical`, for anything drawn. */
  criticalLevel: number;
  /** Peripheral vignette opacity, capped at CRITICAL_VIGNETTE_CEILING. */
  vignette: number;
  /** 0..1 recovery progress since the last hit. */
  recovery: number;
}>;

export function createHealthFeelState(healthFraction = 1): HealthFeelState {
  const health = clamp01(healthFraction);
  return Object.freeze({
    healthFraction: health,
    alive: true,
    damagePressure: 0,
    secondsSinceDamage: Number.POSITIVE_INFINITY,
    critical: health <= CRITICAL_ENTER_FRACTION,
    criticalHeldSeconds: 0,
    criticalLevel: health <= CRITICAL_ENTER_FRACTION ? 1 : 0,
    heartbeatPhase: 0,
    breathPhase: 0,
  });
}

/** Smoothstep on 0..1, used for the recovery ease. */
function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Recovery is a pure function of time since the last hit; no state of its own. */
export function healthRecoveryCurve(secondsSinceDamage: number): number {
  if (!Number.isFinite(secondsSinceDamage)) return 1;
  if (secondsSinceDamage <= RECOVERY_DELAY_SECONDS) return 0;
  return smoothstep01((secondsSinceDamage - RECOVERY_DELAY_SECONDS) / RECOVERY_SECONDS);
}

/**
 * The elevation driving heart and breath rate.
 *
 * `max`, not `sum`: blood loss sets a floor that adrenaline decay cannot clear,
 * and recovery may only relax the damage half. A player at 5% health never
 * returns to a resting heart rate while they are still at 5% health.
 */
function elevation(healthFraction: number, damagePressure: number, recovery: number): number {
  const healthDrive = clamp01(Math.pow(1 - clamp01(healthFraction), 1.4));
  const damageDrive = clamp01(damagePressure) * (1 - RECOVERY_RELAXATION * clamp01(recovery));
  return clamp01(Math.max(healthDrive, damageDrive));
}

/** Distress blends the two drives; it is the master signal the HUD scales with. */
function distressOf(healthFraction: number, damagePressure: number): number {
  const healthDrive = clamp01(Math.pow(1 - clamp01(healthFraction), 1.4));
  return clamp01(Math.max(healthDrive, 0.55 * healthDrive + 0.75 * clamp01(damagePressure)));
}

export function heartbeatRateHz(healthFraction: number, damagePressure: number, recovery: number): number {
  return HEARTBEAT_RESTING_HZ
    + (HEARTBEAT_MAX_HZ - HEARTBEAT_RESTING_HZ) * elevation(healthFraction, damagePressure, recovery);
}

export function breathingRateHz(healthFraction: number, damagePressure: number, recovery: number): number {
  return BREATH_RESTING_HZ
    + (BREATH_MAX_HZ - BREATH_RESTING_HZ) * elevation(healthFraction, damagePressure, recovery);
}

/** Shortest wrapped distance between two 0..1 phases. */
function phaseDistance(phase: number, centre: number): number {
  const raw = Math.abs(phase - centre);
  return Math.min(raw, 1 - raw);
}

function gaussian(distance: number, width: number): number {
  const t = distance / width;
  return Math.exp(-t * t);
}

/** Lub-dub: a strong first sound and a softer second at 30% of the cycle. */
function heartbeatEnvelope(phase: number): number {
  const lub = gaussian(phaseDistance(phase, 0), 0.055);
  const dub = gaussian(phaseDistance(phase, 0.30), 0.05) * 0.62;
  return clamp01(Math.max(lub, dub));
}

/** Breathing is a single smooth swell; a sharp breath envelope reads as a gasp loop. */
function breathEnvelope(phase: number): number {
  return clamp01(0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
}

/**
 * Record damage. `amountFraction` is the share of MAX health lost (so a 45 hp
 * hit on a 100 hp player is 0.45), which keeps the model independent of the
 * health scale the gameplay layer happens to use.
 */
export function recordHealthFeelDamage(
  state: HealthFeelState,
  amountFraction: number,
  healthFraction: number,
): HealthFeelState {
  if (!Number.isFinite(amountFraction) || amountFraction <= 0) {
    return healthFraction === state.healthFraction ? state : Object.freeze({ ...state, healthFraction: clamp01(healthFraction) });
  }
  return Object.freeze({
    ...state,
    healthFraction: clamp01(healthFraction),
    damagePressure: saturatingAdd(state.damagePressure, clamp01(amountFraction * 1.6), 1),
    secondsSinceDamage: 0,
  });
}

/**
 * Advance the condition model. Levels decay analytically over the full elapsed
 * time (exactly composable); the oscillator phases integrate in bounded
 * substeps because their rate changes as pressure decays within the step.
 */
export function advanceHealthFeel(
  state: HealthFeelState,
  dtSeconds: number,
  healthFraction: number,
  alive = true,
): HealthFeelState {
  const health = clamp01(healthFraction);
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;

  // --- critical hysteresis -------------------------------------------------
  let critical = state.critical;
  let heldSeconds = state.criticalHeldSeconds + dt;
  if (!alive) {
    critical = false;
    if (state.critical) heldSeconds = 0;
  } else if (critical) {
    // Exit needs BOTH the exit threshold and the dwell. Either alone flickers.
    if (health >= CRITICAL_EXIT_FRACTION && heldSeconds >= CRITICAL_MIN_DWELL_SECONDS) {
      critical = false;
      heldSeconds = 0;
    }
  } else if (health <= CRITICAL_ENTER_FRACTION) {
    // Entry is immediate and ungated: this is safety information.
    critical = true;
    heldSeconds = 0;
  }

  const criticalTarget = critical ? 1 : 0;
  const criticalHalfLife = critical ? CRITICAL_RISE_HALF_LIFE_SECONDS : CRITICAL_FALL_HALF_LIFE_SECONDS;
  const criticalLevel = criticalTarget
    + (state.criticalLevel - criticalTarget) * decayFactor(criticalHalfLife, dt);

  // --- pressure and recovery ----------------------------------------------
  const pressure0 = clamp01(state.damagePressure);
  const damagePressure = pressure0 * decayFactor(DAMAGE_PRESSURE_HALF_LIFE_SECONDS, dt);
  const secondsSinceDamage = Number.isFinite(state.secondsSinceDamage)
    ? state.secondsSinceDamage + dt
    : Number.POSITIVE_INFINITY;

  // --- phases --------------------------------------------------------------
  let heartbeatPhase = state.heartbeatPhase;
  let breathPhase = state.breathPhase;
  if (alive && dt > 0) {
    const catchUp = Math.min(dt, PHASE_MAX_CATCHUP_SECONDS);
    let elapsed = 0;
    // Bounded loop: catchUp / substep is at most 120 iterations.
    while (elapsed < catchUp) {
      const step = Math.min(PHASE_SUBSTEP_SECONDS, catchUp - elapsed);
      // Rate is sampled at the substep MIDPOINT, not its start. That makes the
      // integration second-order, which is what lets two different partitions
      // of the same elapsed time agree on phase to ~1e-6 of a beat instead of
      // ~1e-3 - the difference between "frame-rate independent" and "close".
      const midpoint = elapsed + step * 0.5;
      const pressureAt = pressure0 * decayFactor(DAMAGE_PRESSURE_HALF_LIFE_SECONDS, midpoint);
      const recoveryAt = healthRecoveryCurve(
        Number.isFinite(state.secondsSinceDamage) ? state.secondsSinceDamage + midpoint : Number.POSITIVE_INFINITY,
      );
      heartbeatPhase += heartbeatRateHz(health, pressureAt, recoveryAt) * step;
      breathPhase += breathingRateHz(health, pressureAt, recoveryAt) * step;
      elapsed += step;
    }
    heartbeatPhase -= Math.floor(heartbeatPhase);
    breathPhase -= Math.floor(breathPhase);
  }

  return Object.freeze({
    healthFraction: health,
    alive,
    damagePressure: damagePressure < 1e-6 ? 0 : damagePressure,
    secondsSinceDamage,
    critical,
    criticalHeldSeconds: heldSeconds,
    criticalLevel: Math.abs(criticalLevel - criticalTarget) < 1e-6 ? criticalTarget : clamp01(criticalLevel),
    heartbeatPhase,
    breathPhase,
  });
}

/** Read the condition model. Pure function of state: no time, no preferences. */
export function healthFeelSignals(state: HealthFeelState): HealthFeelSignals {
  const recovery = healthRecoveryCurve(state.secondsSinceDamage);
  const distress = state.alive ? distressOf(state.healthFraction, state.damagePressure) : 0;
  const heartbeatDrive = state.alive
    ? clamp01((distress - HEARTBEAT_ONSET_DISTRESS) / (1 - HEARTBEAT_ONSET_DISTRESS))
    : 0;
  const breathDrive = state.alive
    ? clamp01((distress - BREATH_ONSET_DISTRESS) / (1 - BREATH_ONSET_DISTRESS))
    : 0;
  const heartbeatPulse = state.alive ? heartbeatEnvelope(state.heartbeatPhase) : 0;
  const breathPulse = state.alive ? breathEnvelope(state.breathPhase) : 0;
  return Object.freeze({
    distress,
    heartbeatHz: heartbeatRateHz(state.healthFraction, state.damagePressure, recovery),
    breathHz: breathingRateHz(state.healthFraction, state.damagePressure, recovery),
    heartbeatPhase: state.heartbeatPhase,
    breathPhase: state.breathPhase,
    heartbeatPulse,
    heartbeatGain: clamp01(heartbeatPulse * heartbeatDrive),
    breathPulse,
    breathGain: clamp01(breathPulse * breathDrive * 0.8),
    critical: state.critical,
    criticalLevel: state.criticalLevel,
    vignette: clamp01(state.criticalLevel * CRITICAL_VIGNETTE_CEILING),
    recovery,
  });
}
