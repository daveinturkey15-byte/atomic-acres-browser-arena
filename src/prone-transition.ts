/**
 * HF-412 — the DROP SHOT stance transition (Lane Y, PASS 85).
 *
 * Owner, 2026-09-02 ~16:45 BST, verbatim: "Also ensure 'drop shots' work like
 * they did back in black ops 2 days, no weird sliding or diving, just however
 * drop shots worked and what keys you had to press, important" and "its where
 * you go prone and shoot i think, and has an animation too of the body".
 *
 * What the reference actually is (see docs/DROP_SHOT_2026-09-02.md for the
 * research trail and the claim-state of every line):
 *   - go prone WHILE FIRING. The trigger is never taken away. That is the whole
 *     technique: the enemy's aim is dragged off you while your own shots keep
 *     going out.
 *   - a short, FIXED transition. The body falls; it does not teleport and it
 *     does not take a second.
 *   - NO slide and NO dive. Black Ops 1 had the dolphin dive, later titles had
 *     the slide; Black Ops 2 had neither. This module therefore produces no
 *     lateral or vertical impulse of any kind — see `stanceTransitionImpulse`.
 *   - an accuracy cost while you are falling, not a fire block. Players describe
 *     drop shotting as close-range only precisely because the shots that go out
 *     mid-drop are inaccurate.
 *
 * Measured before this landed (docs/evidence/pass85/hf412/before-test1-quiet.json,
 * the tracked receipt, headless Chrome, Firing Range): the eye fell 1.09 m in a
 * SINGLE frame, and `tryFire` refused 30 consecutive shots with
 * `stance-or-sprint-recovery` — a 260 ms hard fire block going down and 290 ms
 * coming up. That is the opposite of a drop shot. (An earlier noisy run quoted
 * 54 refusals in commit 98f88e4e's message and in three source comments; that
 * run was discarded and is not in the tree. The tracked receipt is the record;
 * an independent re-measurement of the same base reported 29.)
 *
 * Pure and deterministic: clocks come in as arguments, nothing is read from
 * `performance`, nothing touches THREE or the DOM, so every rule here is
 * testable without a GPU.
 */

import type { Stance } from './gameplay';
import { stanceEyeHeight } from './legacy-pure-helpers-2';

/**
 * The one place the drop-shot timing lives. Tuning the feel means editing these
 * five numbers and nothing else.
 *
 * `standToProneMs` / `proneToStandMs`: the reference's drop reads as roughly a
 * third of a second down and a little longer back up (getting up is the slow,
 * punished half — that asymmetry is why drop shotting is a commitment). Getting
 * up being slower is also what keeps the technique from being free.
 *
 * `crouchStepMs`: one stance step (stand<->crouch) is half the distance, so it
 * gets a proportionally shorter window.
 *
 * `holdCrouchToProneMs`: the console control. Tapping crouch crouches; holding
 * it past this goes prone. Short enough to feel like one motion, long enough
 * that a DELIBERATE crouch press — not just a flick — never converts by
 * accident. It was 250 ms and a 200 ms press is an ordinary deliberate press,
 * so the threshold sits near the top of the tuning band instead.
 */
export const DROP_SHOT_TIMING = Object.freeze({
  standToProneMs: 300,
  proneToStandMs: 380,
  crouchStepMs: 170,
  holdCrouchToProneMs: 320,
  /**
   * Peak cone multiplier at the middle of a prone transition. The reference
   * penalises accuracy heavily while you are falling; it never takes the
   * trigger away. 1 means "no penalty", so this must stay above 1 for the
   * penalty to exist at all and bounded so the drop shot stays a technique
   * rather than a coin flip.
   *
   * The consumer decides WHICH cone it scales. `tryFire` applies it to the
   * hip-fire cone only: a shot taken with the sights settled keeps the ADS cone
   * it earned, because the reference's cost is a hip-fire cost and an
   * undocumented ADS penalty is not what was asked for.
   */
  transitionSpreadPeak: 1.85,
});

/** Bounds every consumer can rely on. A tuning pass may not leave this band. */
export const DROP_SHOT_TIMING_BOUNDS = Object.freeze({
  minimumTransitionMs: 120,
  maximumTransitionMs: 600,
  minimumHoldToProneMs: 150,
  maximumHoldToProneMs: 400,
  maximumSpreadPeak: 2.5,
});

export type StanceTransition = Readonly<{
  from: Stance;
  to: Stance;
  startedAtMs: number;
  durationMs: number;
}>;

export type StanceTransitionSample = Readonly<{
  /** True while the transition is still running. */
  active: boolean;
  /** 0 at the press, 1 when the pose has fully arrived. */
  progress: number;
  from: Stance;
  to: Stance;
  /**
   * Metres to ADD to the authoritative eye position to get the RENDERED eye.
   * The capsule and every authority decision commit to the new stance on the
   * press; only the camera catches up over the transition, which is why the
   * offset starts at the full stance-height difference and eases to exactly 0.
   */
  eyeOffsetMeters: number;
  /** 0..1 blend for the third-person body pose, on the same clock as the eye. */
  bodyProgress: number;
  /**
   * Cone multiplier for the shot the caller is about to take; exactly 1 outside
   * a prone transition. `tryFire` applies it to the hip-fire cone only.
   */
  spreadMultiplier: number;
  /** True while this is a stand/crouch -> prone drop specifically. */
  dropping: boolean;
}>;

/** The rest sample: nothing in flight, nothing modified. */
export function restingStanceTransitionSample(stance: Stance): StanceTransitionSample {
  return Object.freeze({
    active: false,
    progress: 1,
    from: stance,
    to: stance,
    eyeOffsetMeters: 0,
    bodyProgress: 1,
    spreadMultiplier: 1,
    dropping: false,
  });
}

/** Fixed duration for one stance change. Never depends on frame rate or load. */
export function stanceTransitionDurationMs(from: Stance, to: Stance): number {
  if (from === to) return 0;
  if (to === 'prone') return DROP_SHOT_TIMING.standToProneMs;
  if (from === 'prone') return DROP_SHOT_TIMING.proneToStandMs;
  return DROP_SHOT_TIMING.crouchStepMs;
}

/**
 * Start a transition. `null` when there is nothing to animate, so a caller can
 * assign the result straight through without branching.
 */
export function beginStanceTransition(from: Stance, to: Stance, nowMs: number): StanceTransition | null {
  if (from === to || !Number.isFinite(nowMs)) return null;
  return Object.freeze({ from, to, startedAtMs: nowMs, durationMs: stanceTransitionDurationMs(from, to) });
}

/**
 * Smoothstep. C1-continuous with zero velocity at both ends, so the camera
 * neither snaps away on the press nor arrives with a jolt, and it cannot
 * overshoot the way a spring or a cubic-out with a bounce can — an overshooting
 * eye would put the camera BELOW the prone seat, inside the floor.
 */
function smoothstep(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

/** Symmetric 0->1->0 bump; peaks exactly at the middle of the transition. */
function bump(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 4 * clamped * (1 - clamped);
}

export function sampleStanceTransition(
  transition: StanceTransition | null,
  nowMs: number,
  currentStance: Stance,
): StanceTransitionSample {
  if (!transition || !Number.isFinite(nowMs) || transition.durationMs <= 0) {
    return restingStanceTransitionSample(currentStance);
  }
  const elapsed = nowMs - transition.startedAtMs;
  const raw = elapsed / transition.durationMs;
  const progress = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
  const active = progress < 1;
  const eased = smoothstep(progress);
  const heightDelta = stanceEyeHeight(transition.from) - stanceEyeHeight(transition.to);
  // A prone transition in EITHER direction is the drop shot's window: the
  // accuracy cost applies while the body is moving between standing/crouched
  // and prone, and never on a plain crouch step.
  const proneInvolved = transition.to === 'prone' || transition.from === 'prone';
  return Object.freeze({
    active,
    progress,
    from: transition.from,
    to: transition.to,
    eyeOffsetMeters: active ? heightDelta * (1 - eased) : 0,
    bodyProgress: eased,
    spreadMultiplier: active && proneInvolved
      ? 1 + (DROP_SHOT_TIMING.transitionSpreadPeak - 1) * bump(progress)
      : 1,
    dropping: active && transition.to === 'prone',
  });
}

/**
 * The no-slide / no-dive contract, stated as code so it can be asserted rather
 * than promised in a comment.
 *
 * Black Ops 2 had neither mechanic. Going prone therefore contributes exactly
 * zero to the player's velocity in every axis: the character keeps whatever
 * momentum the movement solver already gave it and the transition adds nothing.
 * Any future "make the drop feel punchier" change that returns a non-zero
 * component here is a dive or a slide by another name and fails
 * `src/prone-transition.test.ts`.
 */
export function stanceTransitionImpulse(_sample: StanceTransitionSample): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({ x: 0, y: 0, z: 0 });
}

/**
 * The hold-crouch-to-prone control, as a pure reducer over one crouch button's
 * press/hold/release. This is the reference's console control (tap the crouch
 * button to crouch, hold it to go prone) and it is offered on the keyboard too,
 * so the drop shot is reachable from the crouch key alone without disturbing
 * anyone's existing dedicated prone bind.
 */
export type CrouchHoldState = Readonly<{
  pressedAtMs: number | null;
  /** Set once the hold has already been converted, so it converts exactly once. */
  convertedToProne: boolean;
  /**
   * Whether THIS press may convert to prone at all.
   *
   * The crouch bind is how a prone player gets up: `nextStance('prone',
   * 'toggle-crouch')` is 'crouch'. If every hold could convert, a deliberate
   * press-and-hold from prone would start the rise and then be forced back
   * down `holdCrouchToProneMs` later - the player would be unable to stand up
   * with the key they have always used, and would see a camera bounce and two
   * spread windows for one press. The hold is therefore armed only when the
   * press came from a NON-prone stance, which is the only case where "hold
   * crouch to keep going down" means anything.
   */
  armed: boolean;
}>;

export const IDLE_CROUCH_HOLD: CrouchHoldState =
  Object.freeze({ pressedAtMs: null, convertedToProne: false, armed: false });

export type CrouchHoldOutcome = Readonly<{
  state: CrouchHoldState;
  /** 'crouch' toggles crouch, 'prone' drops to prone, null does nothing. */
  action: 'crouch' | 'prone' | null;
}>;

/**
 * The crouch button went down. The crouch step happens immediately, as it
 * always has. `stanceAtPress` decides whether the hold may deepen into prone:
 * from prone the press is a request to GET UP and must stay one.
 */
export function crouchPressed(
  state: CrouchHoldState,
  nowMs: number,
  stanceAtPress: Stance,
): CrouchHoldOutcome {
  if (state.pressedAtMs !== null) return Object.freeze({ state, action: null });
  return Object.freeze({
    state: Object.freeze({ pressedAtMs: nowMs, convertedToProne: false, armed: stanceAtPress !== 'prone' }),
    action: 'crouch',
  });
}

/** Called every frame while the crouch button is down. */
export function crouchHeld(state: CrouchHoldState, nowMs: number): CrouchHoldOutcome {
  if (state.pressedAtMs === null || state.convertedToProne || !state.armed) {
    return Object.freeze({ state, action: null });
  }
  if (nowMs - state.pressedAtMs < DROP_SHOT_TIMING.holdCrouchToProneMs) return Object.freeze({ state, action: null });
  return Object.freeze({
    state: Object.freeze({ pressedAtMs: state.pressedAtMs, convertedToProne: true, armed: true }),
    action: 'prone',
  });
}

/** The crouch button came up. Never produces an action; it only clears the hold. */
export function crouchReleased(): CrouchHoldOutcome {
  return Object.freeze({ state: IDLE_CROUCH_HOLD, action: null });
}

/**
 * HF-431: Sprint latch state machine (Lane AX).
 *
 * Tracks whether sprinting is permitted to engage. When a drop shot is performed
 * while sprinting or holding sprint, the latch is cleared and requires a fresh
 * press once standing before sprint can re-engage.
 */
export type SprintLatchState = Readonly<{
  latched: boolean;
  requiresFreshPress: boolean;
}>;

export const IDLE_SPRINT_LATCH: SprintLatchState = Object.freeze({
  latched: false,
  requiresFreshPress: false,
});

/**
 * Steps the sprint latch state.
 *
 * Rules (HF-431, extended by HF-433):
 * - If the sprint input is not held, reset to idle (arms a future fresh press).
 * - If a fresh press is required (set on a stance drop), sprint cannot engage
 *   while the input remains held, even across standing up.
 * - If the player is NOT STANDING - prone or crouched - pressing sprint does
 *   not engage sprint and sets `requiresFreshPress`, so simply standing up does
 *   not immediately sprint.
 * - Otherwise (standing, and a fresh press available), sprint latches.
 *
 * HF-433 is the crouch half, and it is the owner's own words: "when I go prone
 * now it dropshots nicely but going crouched I still move fast, sort it out in
 * the same way?". Before it, a crouched player who held sprint was STOOD UP by
 * `src/legacy-main.ts` and sprinted, so the crouch speed the movement profile
 * authors (0.512 of the walk - `CROUCH_SPEED_FACTOR`) applied for one frame.
 * With `stand` required here, sprint simply cannot engage from a crouch: the
 * player has to stand first, and if they were holding sprint through the
 * crouch they have to release and press it again. Exactly the prone rule.
 */
export function stepSprintLatch(
  state: SprintLatchState,
  rawSprintInput: boolean,
  currentStance: Stance,
): SprintLatchState {
  if (!rawSprintInput) {
    return IDLE_SPRINT_LATCH;
  }
  if (state.requiresFreshPress) {
    return Object.freeze({ latched: false, requiresFreshPress: true });
  }
  if (currentStance !== 'stand') {
    return Object.freeze({ latched: false, requiresFreshPress: true });
  }
  return Object.freeze({ latched: true, requiresFreshPress: false });
}

/**
 * Called when the player leaves the standing stance while sprinting - the drop
 * shot (HF-431) and, since HF-433, an ordinary crouch. Clears the latch and
 * requires a fresh press after the player stands. The name is HF-431's and is
 * kept because `src/prone-transition.test.ts` pins the exact call site text in
 * `src/legacy-main.ts` against it.
 */
export function clearSprintLatchOnDropShot(
  _state: SprintLatchState,
): SprintLatchState {
  return Object.freeze({
    latched: false,
    requiresFreshPress: true,
  });
}

