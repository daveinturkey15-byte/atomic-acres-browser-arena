/**
 * HF-352 screen feedback: kill-confirm pulse on the hitmarker.
 *
 * Pure presentation math: the caller (legacy-main, outside this pass's
 * allowlist) renders the returned opacity/scale each frame. The pulse fires
 * only when a local player's shot actually eliminates a target — the caller
 * passes `wasElimination`; non-eliminating hits never trigger it.
 *
 * Recipe: fast attack (~40ms) then exponential decay over ~320ms; scale
 * overshoot mirrors the opacity curve. Accessibility sensoryScale clamps
 * peak intensity without changing hit timing.
 */

export const KILL_CONFIRM_PULSE_ATTACK_MS = 40;
export const KILL_CONFIRM_PULSE_DECAY_MS = 320;
export const KILL_CONFIRM_PULSE_MAX_INTENSITY = 1;

export type KillConfirmPulseState = Readonly<{
  active: boolean;
  startedAtMs: number | null;
  /** Accessibility sensory scale 0..1; 0 disables the pulse entirely. */
  sensoryScale: number;
}>;

export type KillConfirmPulsePresentation = Readonly<{
  active: boolean;
  /** 0..1 eased envelope for the marker glow/opacity. */
  opacity: number;
  /** 0..1 eased envelope for the marker scale overshoot. */
  scale: number;
}>;

export function createKillConfirmPulseState(sensoryScale = 1): KillConfirmPulseState {
  const boundedScale = Math.min(1, Math.max(0, Number.isFinite(sensoryScale) ? sensoryScale : 1));
  return Object.freeze({ active: false, startedAtMs: null, sensoryScale: boundedScale });
}

/** Trigger exactly once per confirmed elimination. */
export function triggerKillConfirmPulse(
  state: KillConfirmPulseState,
  now: number,
): KillConfirmPulseState {
  if (!Number.isFinite(now) || state.sensoryScale <= 0) return state;
  return Object.freeze({ ...state, active: true, startedAtMs: now });
}

/** Sample the eased envelope; returns inactive zeros after the decay window. */
export function sampleKillConfirmPulse(
  state: KillConfirmPulseState,
  now: number,
): Readonly<{ state: KillConfirmPulseState; presentation: KillConfirmPulsePresentation }> {
  if (!state.active || state.startedAtMs === null) {
    return Object.freeze({
      state,
      presentation: Object.freeze({ active: false, opacity: 0, scale: 0 }),
    });
  }
  const age = Math.max(0, now - state.startedAtMs);
  if (age > KILL_CONFIRM_PULSE_ATTACK_MS + KILL_CONFIRM_PULSE_DECAY_MS) {
    return Object.freeze({
      state: Object.freeze({ ...state, active: false, startedAtMs: null }),
      presentation: Object.freeze({ active: false, opacity: 0, scale: 0 }),
    });
  }
  const attackPhase = Math.min(1, age / KILL_CONFIRM_PULSE_ATTACK_MS);
  const decayPhase = age <= KILL_CONFIRM_PULSE_ATTACK_MS
    ? 1
    : Math.exp(-(age - KILL_CONFIRM_PULSE_ATTACK_MS) / (KILL_CONFIRM_PULSE_DECAY_MS / 3));
  const envelope = attackPhase * decayPhase * state.sensoryScale;
  // Scale uses a slightly faster decay so the pop reads as a snap.
  const scaleEnvelope = attackPhase
    * Math.exp(-(age - KILL_CONFIRM_PULSE_ATTACK_MS < 0 ? 0 : age - KILL_CONFIRM_PULSE_ATTACK_MS) / (KILL_CONFIRM_PULSE_DECAY_MS / 4));
  return Object.freeze({
    state,
    presentation: Object.freeze({
      active: true,
      opacity: Number(Math.min(1, envelope).toFixed(4)),
      scale: Number(Math.min(1, scaleEnvelope).toFixed(2)),
    }),
  });
}
