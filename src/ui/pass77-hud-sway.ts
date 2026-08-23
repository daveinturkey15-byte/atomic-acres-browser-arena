/**
 * Pass 77 / HF-370 - diegetic HUD sway.
 *
 * The owner asked for a HUD that is "maybe not even pinned directly to the
 * screen ... dynamic with how you look and move like most modern first person
 * shooters". `pass77-instrument-hud.css` consumes three normalised inputs to
 * do that:
 *
 *   --hud-sway-x   -1..1  horizontal look lag (+ = the camera turned right)
 *   --hud-sway-y   -1..1  vertical look lag   (+ = the camera pitched up)
 *   --hud-breathe  -1..1  SIGNED respiration, strongest when standing still
 *   --hud-gait      0..1  movement intensity, which scales the walking bob
 *
 * TWO DEFECTS THIS FILE USED TO HAVE, both reported by the owner and both
 * reproduced by the Pass 77 audit:
 *
 *   1. The amplitude was imperceptible. The CSS ceiling was a 10x multiplier
 *      on a 1px travel - a 10px drift at the very edge of a 1920px viewport,
 *      about half a percent of the screen. The travel now lives in one CSS
 *      token (`--p77-sway-travel`) so the ceiling is explicit and adjustable,
 *      and `SATURATION_RAD` below was lowered so ORDINARY aiming produces
 *      visible lag rather than only a full-speed flick.
 *
 *   2. `--hud-breathe` was driven by SPEED, so it was exactly ZERO while the
 *      player stood still. The owner asked specifically for movement "when
 *      you're breathing and when you're stationary", which is the one case the
 *      old signal could not produce. Respiration and gait are now separate
 *      signals with opposite dependence on speed: breathing is FULL at a
 *      standstill and is suppressed as you run, gait is the reverse. Standing
 *      perfectly still now produces the slow, deliberate rise and fall of
 *      someone holding a piece of kit and breathing.
 *
 * This module owns the maths that produces them, for three reasons:
 *
 *   1. The wiring into the frame loop then costs the renderer lane exactly one
 *      import and one call, with no per-frame arithmetic to review or get
 *      subtly wrong inside a 30k-line file.
 *   2. Clamping and non-finite rejection live here, so the CSS ceiling (a 10px
 *      lag multiplier) is a real ceiling and a NaN yaw can never write an
 *      invalid custom property into the HUD.
 *   3. It is unit-testable without a DOM or a running match, which the frame
 *      loop is not.
 *
 * The model is a first-order lag: an internal "carried" orientation chases the
 * camera, and the sway is the residual between them. That is what makes the
 * HUD trail a fast flick and then settle, rather than rigidly mirroring the
 * camera - and the settle is fast (TAU_MS below) so nothing lingers in the
 * player's peripheral vision during a fight.
 *
 * Everything here is pure. It reads no globals, touches no DOM except through
 * the tiny structural type `HudSwayTarget`, and has no side effects other than
 * the three property writes in `applyHudSway`.
 */

/** Retained lag state. Treat as opaque; construct with `createHudSwayState`. */
export type HudSwayState = Readonly<{
  /** The "carried" yaw, in radians, trailing the camera. */
  yaw: number;
  /** The "carried" pitch, in radians, trailing the camera. */
  pitch: number;
  /** Smoothed movement intensity, 0..1. Drives gait, suppresses respiration. */
  breathe: number;
  /** Respiration phase in radians, advanced by real time, never by speed. */
  phase: number;
}>;

/** Per-frame camera and movement sample. */
export type HudSwaySample = Readonly<{
  /** Camera yaw in radians. */
  yaw: number;
  /** Camera pitch in radians. */
  pitch: number;
  /** Horizontal speed in world units per second. */
  speed: number;
  /** Frame delta in milliseconds. */
  deltaMs: number;
}>;

/** The four normalised values `pass77-instrument-hud.css` consumes. */
export type HudSwayOutput = Readonly<{
  state: HudSwayState;
  swayX: number;
  swayY: number;
  /** Signed respiration, -1..1. Full amplitude at a standstill. */
  breathe: number;
  /** Movement intensity, 0..1. Zero at a standstill. */
  gait: number;
}>;

/** The only DOM surface this module needs. Keeps it testable with a stub. */
export type HudSwayTarget = {
  style: { setProperty(property: string, value: string): void };
};

/**
 * Lag time constant. 90 ms is deliberately short: AGENTS.md requires HUD
 * effects to sit at the edges and decay fast, and a longer constant turns a
 * quick corner-check into a visible smear across the operator console.
 */
const TAU_MS = 90;

/**
 * Radians of residual that map to the full +-1 output.
 *
 * Lowered from 0.085 as part of the amplitude fix. At 0.085 the filter only
 * approached +-1 on a deliberate fast flick, so ORDINARY aiming - which is
 * what the player spends the match doing - produced a fraction of an already
 * tiny 10px travel. At 0.055 a normal tracking turn reads clearly and a flick
 * still saturates rather than overshooting the CSS ceiling.
 */
const SATURATION_RAD = 0.055;

/** Speed, in world units per second, that maps to full gait intensity. */
const BREATHE_SPEED = 5.5;

/** Gait follows the body, not the head, so it settles more slowly. */
const BREATHE_TAU_MS = 260;

/**
 * Respiration rate, radians per second. 1.4 rad/s is a full cycle every ~4.5
 * seconds, i.e. about 13 breaths a minute - a calm, alert operator. Fast
 * enough to read as alive, slow enough that it never competes for attention
 * with anything the player is actually looking at.
 */
const BREATH_RATE_RAD_PER_S = 1.4;

/**
 * How much of the respiration survives at a full sprint.
 *
 * Not zero: a sprinting player is breathing HARDER, not less. But at speed the
 * gait bob dominates and two oscillators at different frequencies read as
 * noise, so respiration is ducked to a third rather than removed.
 */
const BREATH_FLOOR_AT_SPEED = 0.34;

/** A single frame can never advance the filter by more than this. */
const MAX_DELTA_MS = 100;

const TWO_PI = Math.PI * 2;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

/** Shortest signed angular difference `a - b`, wrapped to (-PI, PI]. */
export function shortestAngleDelta(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  let delta = (a - b) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return delta;
}

/** Start the filter already settled on a pose, so the first frame never jumps. */
export function createHudSwayState(yaw = 0, pitch = 0): HudSwayState {
  return { yaw: finite(yaw), pitch: finite(pitch), breathe: 0, phase: 0 };
}

/**
 * Advance the lag filter one frame and report the normalised sway.
 *
 * Pure: the caller owns the returned state. A zero or negative delta advances
 * nothing but still reports the current residual, so a paused frame holds its
 * value instead of snapping to zero.
 */
export function sampleHudSway(state: HudSwayState, sample: HudSwaySample): HudSwayOutput {
  const yaw = finite(sample.yaw, state.yaw);
  const pitch = finite(sample.pitch, state.pitch);
  const speed = Math.max(0, finite(sample.speed));
  const deltaMs = Math.min(MAX_DELTA_MS, Math.max(0, finite(sample.deltaMs)));

  // Exponential smoothing with a frame-rate-independent coefficient, so the
  // feel is identical at 60, 144 and uncapped.
  const follow = deltaMs > 0 ? 1 - Math.exp(-deltaMs / TAU_MS) : 0;
  const breatheFollow = deltaMs > 0 ? 1 - Math.exp(-deltaMs / BREATHE_TAU_MS) : 0;

  const yawResidual = shortestAngleDelta(yaw, state.yaw);
  const pitchResidual = shortestAngleDelta(pitch, state.pitch);

  const nextYaw = state.yaw + yawResidual * follow;
  const nextPitch = state.pitch + pitchResidual * follow;
  const targetGait = Math.min(1, speed / BREATHE_SPEED);
  const nextGait = state.breathe + (targetGait - state.breathe) * breatheFollow;

  // Respiration is advanced by the CLOCK, never by speed. That is the whole
  // fix: the old signal multiplied everything by movement intensity, so a
  // stationary player got a flat zero and the HUD froze solid the moment they
  // stopped walking - the exact state the owner was looking at when he said
  // the HUD does not move when you are standing still.
  const phase = (state.phase + (deltaMs / 1000) * BREATH_RATE_RAD_PER_S) % TWO_PI;
  // Ducked, not silenced, as speed rises: 1 at a standstill, BREATH_FLOOR at a
  // sprint. `nextGait` is already smoothed, so the duck cannot snap.
  const breathAmplitude = 1 - (1 - BREATH_FLOOR_AT_SPEED) * clampUnit(nextGait);

  return {
    state: { yaw: nextYaw, pitch: nextPitch, breathe: nextGait, phase },
    swayX: clampUnit(yawResidual / SATURATION_RAD),
    swayY: clampUnit(pitchResidual / SATURATION_RAD),
    breathe: clampUnit(Math.sin(phase) * breathAmplitude),
    gait: clampUnit(nextGait),
  };
}

/** Three decimals is below one screen pixel at the CSS multipliers in use. */
function serialise(value: number): string {
  return clampUnit(value).toFixed(3);
}

/**
 * Advance the filter and write the three custom properties onto the HUD root.
 *
 * This is the one call the frame loop makes. It returns the next state, which
 * the caller retains:
 *
 *   hudSway = applyHudSway(hudRoot, hudSway, { yaw, pitch, speed, deltaMs });
 */
export function applyHudSway(
  target: HudSwayTarget,
  state: HudSwayState,
  sample: HudSwaySample,
): HudSwayState {
  const next = sampleHudSway(state, sample);
  target.style.setProperty('--hud-sway-x', serialise(next.swayX));
  target.style.setProperty('--hud-sway-y', serialise(next.swayY));
  target.style.setProperty('--hud-breathe', serialise(next.breathe));
  target.style.setProperty('--hud-gait', serialise(next.gait));
  return next.state;
}

/**
 * Write the neutral pose. Call this when motion must stop dead - reduced
 * motion, pause, death, or a possession handover - so no stale residual is
 * left frozen on screen. The CSS gates already zero the transform under both
 * reduced-motion switches; this exists for the runtime-side cases.
 */
export function releaseHudSway(target: HudSwayTarget): void {
  target.style.setProperty('--hud-sway-x', '0');
  target.style.setProperty('--hud-sway-y', '0');
  target.style.setProperty('--hud-breathe', '0');
  target.style.setProperty('--hud-gait', '0');
}
