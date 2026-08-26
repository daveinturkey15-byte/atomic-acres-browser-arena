/**
 * Pass 77 / HF-370 - HUD impact response.
 *
 * THE DEFECT THIS CLOSES. Camera trauma was wired in Pass 77 (legacy-main.ts
 * feeds `addCameraShakeTrauma` from damage and from every blast), but nothing
 * ever coupled it to the HUD. The only custom properties written on #hud were
 * `--hud-sway-x/y`, `--hud-breathe` and `--hud-health`, so the overlay sat
 * perfectly still while the camera was being thrown around. Getting shot did
 * not move the HUD at all. The owner asked for a HUD that reacts to being hit;
 * this is the missing half.
 *
 * WHY A SEPARATE MODULE FROM pass77-hud-sway.ts. Sway is a *filter* - it lags
 * a continuous signal (where the camera is pointing) and has no memory of
 * events. Impact is an *impulse response* - discrete events arrive, each one
 * kicks a spring, and the spring rings down. Different maths, different state,
 * different failure modes. Folding them together would mean a NaN bearing on
 * one hit could poison look-lag for the rest of the match.
 *
 * THE MODEL. One damped harmonic oscillator per axis (x, y, roll), plus two
 * exponentially decaying scalars (chromatic split, flash). An event adds
 * VELOCITY, it does not set position - that is what makes two hits in quick
 * succession compound into a harder shove instead of restarting the same
 * animation, and it is why this cannot be done with CSS keyframes alone.
 *
 * DIRECTION. `bearingRadians` is the screen-relative bearing of the source:
 * 0 is dead ahead, +ve is to the right, matching `sourceScreenAngle` in
 * legacy-main.ts, which already computes exactly this for the damage-direction
 * markers. The HUD kicks AWAY from the source, the way a body absorbs a hit:
 *
 *     kickX = -sin(bearing)      source on your right  -> HUD shoves left
 *     kickY = +cos(bearing)      source ahead of you   -> HUD shoves down
 *
 * SIGNATURES. A bullet and an explosion must not feel the same. A bullet is a
 * stiff, small, fast-settling snap with almost no colour separation. An
 * explosion is a loose, large, slow-settling heave with real chromatic split
 * and a flash. The presets below are the only place that difference lives.
 *
 * COMBAT SAFETY. This module produces numbers; it never decides what moves.
 * The CSS in pass77-instrument-hud.css applies them to the edge clusters only.
 * #crosshair, #hitmarker, #damage-numbers, the scopes, #countdown, #banner and
 * #respawn are never given these properties, for the same reason sway does not
 * touch them: aim, confirmation and warning surfaces stay welded to the
 * viewport. A guard test in pass77-visual-language.test.ts enforces it.
 *
 * Everything here is pure. The only side effects in the file are the property
 * writes in `advanceHudImpact`, and those are skipped entirely while idle.
 */
import { CAMERA_SHAKE_SOURCES } from '../camera-shake';

/** What hit the player. Selects the impulse signature. */
export type HudImpactKind = 'bullet' | 'explosion' | 'fall' | 'melee';

/** A single impact. Construct one per damage event or blast. */
export type HudImpactEvent = Readonly<{
  kind: HudImpactKind;
  /**
   * Severity, 0..1. For damage taken this is the fraction of health lost; for
   * a blast it is the distance falloff. Values outside the range are clamped,
   * and a non-finite value is dropped rather than allowed to poison the state.
   */
  severity: number;
  /**
   * Screen-relative bearing of the source in radians: 0 dead ahead, +ve right.
   * Omit it for a sourceless impact (a fall, a self-inflicted blast); the kick
   * is then purely vertical, which is what a fall should feel like anyway.
   */
  bearingRadians?: number;
  /** Event timestamp, ms, same clock as `advanceHudImpact`. */
  now: number;
}>;

/** Retained oscillator state. Treat as opaque; build with `createHudImpactState`. */
export type HudImpactState = Readonly<{
  /** Kick displacement, roughly -1..1 after clamping. */
  x: number;
  y: number;
  /** Kick velocity, units per second. */
  vx: number;
  vy: number;
  /** Roll displacement and velocity, roughly -1..1. */
  roll: number;
  vroll: number;
  /** Chromatic split, 0..1, decaying. */
  chroma: number;
  /** White/red flash, 0..1, decaying. */
  flash: number;
  /** Bearing of the most recent event, radians, held for the directional wash. */
  bearingRadians: number;
  /** Signature of the most recent event, so CSS can style bullet vs blast. */
  kind: HudImpactKind | 'none';
  /** Clock of the last `advanceHudImpact`, for the delta. */
  at: number;
}>;

/** The minimal DOM surface this module needs. Keeps it testable with a stub. */
export type HudImpactTarget = {
  style: {
    setProperty(property: string, value: string): void;
    removeProperty(property: string): void;
  };
  dataset?: Record<string, string | undefined>;
};

/**
 * Per-kind impulse signature.
 *
 * `stiffness` and `damping` are the oscillator constants: stiffness sets how
 * fast it wants to return, damping how much it rings. `damping` below the
 * critical value (2*sqrt(stiffness)) overshoots, which is what gives a blast
 * its heave-and-settle instead of a dead slide back to centre.
 */
type ImpactPreset = Readonly<{
  stiffness: number;
  damping: number;
  /** Linear kick velocity per unit severity. */
  kick: number;
  /** Roll velocity per unit severity, signed by the bearing. */
  roll: number;
  /** Chromatic split added per unit severity. */
  chroma: number;
  /** Flash added per unit severity. */
  flash: number;
}>;

/**
 * The four signatures. These numbers are the entire "feel" of the feature, so
 * they are named and grouped rather than scattered through the integrator.
 *
 *   bullet    - stiff and near-critically damped. Snaps out, comes straight
 *               back, barely overshoots. Reads as a flinch.
 *   explosion - loose and underdamped. Big heave, one visible overshoot, and
 *               the only signature with a real flash and colour split.
 *   fall      - vertical only (callers omit the bearing), stiff, almost no
 *               roll and almost no colour: a landing, not an attack.
 *   melee     - between a bullet and a blast, with by far the strongest roll,
 *               because a melee hit is delivered off-axis.
 *
 * TUNED AGAINST MEASUREMENT, NOT INTUITION. `kick` is deliberately similar
 * across the four: the impulse a body takes is roughly comparable, and the
 * CHARACTER difference comes from the spring, not from the shove. That is why
 * the same kick produces a 0.28 peak on the stiff bullet spring and a 0.83
 * peak on the loose explosion spring. The first draft of these numbers had a
 * bullet peaking at 0.073 - which, at any sane CSS multiplier, is under two
 * pixels, i.e. exactly the "imperceptible" defect this lane exists to fix.
 */
export const HUD_IMPACT_PRESETS: Readonly<Record<HudImpactKind, ImpactPreset>> = Object.freeze({
  bullet: Object.freeze({ stiffness: 320, damping: 33, kick: 13, roll: 5.0, chroma: 0.35, flash: 0.30 }),
  explosion: Object.freeze({ stiffness: 88, damping: 9.5, kick: 15, roll: 7.0, chroma: 1.0, flash: 0.85 }),
  fall: Object.freeze({ stiffness: 210, damping: 21, kick: 14, roll: 1.5, chroma: 0.15, flash: 0.12 }),
  melee: Object.freeze({ stiffness: 180, damping: 15, kick: 15, roll: 9.0, chroma: 0.5, flash: 0.35 }),
});

/** Chromatic split half-life, ms. Short: colour fringing must not linger. */
const CHROMA_TAU_MS = 130;
/** Flash half-life, ms. Shorter still - a flash that lingers blinds the player. */
const FLASH_TAU_MS = 95;
/** A single frame can never advance the integrator by more than this. */
const MAX_DELTA_MS = 64;
/** Integrator sub-step. Bounds stiff-spring error at low frame rates. */
const SUB_STEP_MS = 8;
/** Below this the state is treated as fully settled and writes stop. */
const IDLE_EPSILON = 0.0015;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < 0) return 0;
  return value;
}

/** A settled HUD: nothing displaced, nothing flashing, no signature. */
export function createHudImpactState(now = 0): HudImpactState {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    roll: 0, vroll: 0,
    chroma: 0, flash: 0,
    bearingRadians: 0,
    kind: 'none',
    at: finite(now),
  };
}

/** True when nothing is displaced, ringing or fading. */
export function isHudImpactIdle(state: HudImpactState): boolean {
  return Math.abs(state.x) < IDLE_EPSILON
    && Math.abs(state.y) < IDLE_EPSILON
    && Math.abs(state.vx) < IDLE_EPSILON
    && Math.abs(state.vy) < IDLE_EPSILON
    && Math.abs(state.roll) < IDLE_EPSILON
    && Math.abs(state.vroll) < IDLE_EPSILON
    && state.chroma < IDLE_EPSILON
    && state.flash < IDLE_EPSILON;
}

/**
 * Add an impact. Pure: returns the next state.
 *
 * The event adds VELOCITY rather than setting position, so a burst of fire
 * compounds into a harder shove instead of each round restarting the same
 * displacement. A non-finite severity or timestamp is dropped: a bad event
 * must never be able to leave the HUD stuck off-centre.
 */
export function pushHudImpact(state: HudImpactState, event: HudImpactEvent): HudImpactState {
  const preset = HUD_IMPACT_PRESETS[event.kind];
  if (!preset) return state;
  if (!Number.isFinite(event.now)) return state;
  const severity = clamp01(finite(event.severity));
  if (severity <= 0) return state;

  // `bearingRadians` is optional, and "absent" must stay distinguishable from
  // "zero" - zero means dead ahead, absent means the impact has no source.
  const hasBearing = typeof event.bearingRadians === 'number' && Number.isFinite(event.bearingRadians);
  const bearing = hasBearing ? (event.bearingRadians as number) : 0;
  // Sourceless impacts (falls, self-inflicted blasts) push straight down.
  const dirX = hasBearing ? -Math.sin(bearing) : 0;
  const dirY = hasBearing ? Math.cos(bearing) : 1;

  return {
    ...state,
    vx: state.vx + dirX * preset.kick * severity,
    vy: state.vy + dirY * preset.kick * severity,
    // Roll follows the horizontal component, so a hit from the right rolls the
    // overlay the same way the shove throws it. A head-on hit barely rolls.
    vroll: state.vroll + dirX * preset.roll * severity,
    chroma: clamp01(state.chroma + preset.chroma * severity),
    flash: clamp01(state.flash + preset.flash * severity),
    bearingRadians: hasBearing ? bearing : state.bearingRadians,
    kind: event.kind,
  };
}

/**
 * Integrate the springs and the decays forward to `now`. Pure.
 *
 * Sub-stepped at SUB_STEP_MS because the bullet preset is stiff enough that a
 * single 60 Hz Euler step is visibly wrong (and a single 30 Hz step diverges).
 * Sub-stepping is cheap here - at most eight iterations of six multiplies.
 */
export function stepHudImpact(state: HudImpactState, now: number): HudImpactState {
  const clock = finite(now, state.at);
  const elapsed = Math.min(MAX_DELTA_MS, Math.max(0, clock - state.at));
  if (elapsed <= 0) return { ...state, at: clock };

  const preset = HUD_IMPACT_PRESETS[state.kind as HudImpactKind] ?? HUD_IMPACT_PRESETS.bullet;
  const steps = Math.max(1, Math.ceil(elapsed / SUB_STEP_MS));
  const dt = elapsed / steps / 1000;

  let { x, y, vx, vy, roll, vroll } = state;
  for (let step = 0; step < steps; step += 1) {
    // Semi-implicit Euler: velocity first, then position. Stable where the
    // explicit form is not, at no extra cost.
    vx += (-preset.stiffness * x - preset.damping * vx) * dt;
    vy += (-preset.stiffness * y - preset.damping * vy) * dt;
    vroll += (-preset.stiffness * roll - preset.damping * vroll) * dt;
    x += vx * dt;
    y += vy * dt;
    roll += vroll * dt;
  }

  const chroma = state.chroma * Math.exp(-elapsed / CHROMA_TAU_MS);
  const flash = state.flash * Math.exp(-elapsed / FLASH_TAU_MS);

  const next: HudImpactState = {
    x: clampUnit(x), y: clampUnit(y),
    vx: finite(vx), vy: finite(vy),
    roll: clampUnit(roll), vroll: finite(vroll),
    chroma: clamp01(chroma), flash: clamp01(flash),
    bearingRadians: state.bearingRadians,
    kind: state.kind,
    at: clock,
  };
  // Snap to a clean zero once settled, so the properties can be removed and
  // the compositor stops being handed micro-values forever.
  return isHudImpactIdle(next)
    ? { ...next, x: 0, y: 0, vx: 0, vy: 0, roll: 0, vroll: 0, chroma: 0, flash: 0, kind: 'none' }
    : next;
}

/** Three decimals is below one screen pixel at the CSS multipliers in use. */
function serialise(value: number): string {
  return value.toFixed(3);
}

/**
 * THE PROPERTY CONTRACT. Six numbers on #hud, all unitless, all safe at zero:
 *
 *   --hud-impact-x        -1..1   kick, +ve right
 *   --hud-impact-y        -1..1   kick, +ve down
 *   --hud-impact-roll     -1..1   roll, +ve clockwise
 *   --hud-impact-chroma    0..1   chromatic split amount
 *   --hud-impact-flash     0..1   damage flash amount
 *   --hud-impact-bearing   deg    source bearing for the directional wash
 *
 * plus `data-hud-impact` on the same element carrying the signature name, so a
 * blast and a bullet can be styled differently without a seventh number.
 */
export function writeHudImpactProperties(target: HudImpactTarget, state: HudImpactState): void {
  target.style.setProperty('--hud-impact-x', serialise(state.x));
  target.style.setProperty('--hud-impact-y', serialise(state.y));
  target.style.setProperty('--hud-impact-roll', serialise(state.roll));
  target.style.setProperty('--hud-impact-chroma', serialise(state.chroma));
  target.style.setProperty('--hud-impact-flash', serialise(state.flash));
  target.style.setProperty('--hud-impact-bearing', `${((state.bearingRadians * 180) / Math.PI).toFixed(1)}deg`);
  if (target.dataset) target.dataset.hudImpact = state.kind;
}

/** Clear every impact property. Called once when the state settles. */
export function releaseHudImpact(target: HudImpactTarget): void {
  for (const property of [
    '--hud-impact-x', '--hud-impact-y', '--hud-impact-roll',
    '--hud-impact-chroma', '--hud-impact-flash', '--hud-impact-bearing',
  ]) target.style.removeProperty(property);
  if (target.dataset) target.dataset.hudImpact = 'none';
}

/**
 * The one call the frame loop makes.
 *
 *   hudImpact = advanceHudImpact(hudRoot, hudImpact, now);
 *
 * While the HUD is settled - which is almost every frame of a match - this
 * writes NOTHING. It integrates, sees the state is idle, and returns. The
 * properties are cleared exactly once on the transition into idle, so an
 * unwired or resting HUD carries no impact properties at all and the
 * compositor is not handed a fresh transform every frame for no reason.
 */
export function advanceHudImpact(
  target: HudImpactTarget,
  state: HudImpactState,
  now: number,
): HudImpactState {
  const wasIdle = isHudImpactIdle(state);
  const next = stepHudImpact(state, now);
  const nowIdle = isHudImpactIdle(next);
  if (nowIdle) {
    // One clearing write on the settling edge, then silence.
    if (!wasIdle) releaseHudImpact(target);
    return next;
  }
  writeHudImpactProperties(target, next);
  return next;
}

/**
 * Map a camera-shake source name onto an impact signature.
 *
 * legacy-main.ts already classifies every trauma event with one of these
 * source names for `addCameraShakeTrauma`. Reusing that classification is what
 * keeps the HUD's reaction and the camera's reaction describing the same
 * event, instead of two lanes drifting apart over what counts as an explosion.
 *
 * CAMERA_SHAKE_SOURCES is the authority: a name outside the taxonomy has no
 * authored meaning, so it maps to the explicit 'bullet' fallback rather than
 * being guessed at. Live callers pass typed `CameraShakeSource` values, so in
 * practice only a programming error reaches that fallback.
 */
export function impactKindForShakeSource(source: string): HudImpactKind {
  if (!(CAMERA_SHAKE_SOURCES as readonly string[]).includes(source)) return 'bullet';
  switch (source) {
    case 'near-explosion':
    case 'far-explosion':
    case 'nuke':
      return 'explosion';
    case 'hard-landing':
      return 'fall';
    case 'heavy-weapon-fire':
    case 'damage-taken':
      return 'bullet';
  }
  // Unreachable for CAMERA_SHAKE_SOURCES members (gated above); kept so the
  // open-string signature stays honest.
  return 'bullet';
}
