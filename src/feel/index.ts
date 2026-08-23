/**
 * Damage feel, part 3: the one call the runtime makes per frame.
 *
 *   feel = stepFeel(feel, { dtSeconds, healthFraction, events, preferences });
 *
 * and then everything - camera shake requests, HUD overlay levels, audio
 * filtering, heartbeat, direction indicators - is read off `feel.frame`. The
 * point of this file is that wiring damage feel into the runtime is a handful
 * of lines and one state variable, not a rewrite.
 *
 * ---------------------------------------------------------------------------
 * COMBAT SAFETY - the four rules, and how each is enforced rather than intended
 *
 * 1. PERIPHERAL ONLY, NEVER CENTRE SCREEN.
 *    Every visual channel this model emits is radial, and the frame carries
 *    `centreSafeRadiusFraction` (0.62 of the viewport half-height) that the HUD
 *    must use as the inner stop of its gradients. Nothing in this model can
 *    request a centre-screen effect, because no such channel exists in the
 *    output type. Chromatic aberration is allowed only because radial CA is
 *    exactly zero at the centre pixel by definition.
 *
 * 2. EFFECTS MUST NOT REDUCE ENEMY CONTRAST.
 *    Desaturation is capped at 0.45 and removes CHROMA, not LUMINANCE - a
 *    silhouette keeps its luminance contrast against the background, which is
 *    what target acquisition actually uses. There is deliberately no darkening
 *    or blur channel in this model. `combatSafetyReport()` fails the frame if a
 *    ceiling is exceeded, and a test runs it under damage spam.
 *
 * 3. CAPS ON SIMULTANEOUS INTENSITY.
 *    Two independent caps. Per channel, the saturating accumulator in
 *    `impact-response.ts` means additional hits can only claim the remaining
 *    headroom, so N hits converge on the ceiling and never sum past it. Across
 *    channels, `overlayLoad` sums the weighted opacities and, above
 *    FEEL_MAX_COMBINED_OVERLAY, scales every visual channel down proportionally
 *    - because three channels at 60% each is a white-out even though no single
 *    one broke its own limit. Three fast hits are LOUDER but never BLINDING.
 *
 * 4. GLOBAL INTENSITY SCALE + REDUCED MOTION, WITHOUT LOSING INFORMATION.
 *    `intensityScale` (0..1) scales the drama. `reducedMotion` - satisfied by
 *    EITHER of the two switches this repo already carries, the OS
 *    `prefers-reduced-motion` media query and the in-game reduced-sensory
 *    setting, both surfaced by `resolveAccessibilityRuntime` - zeroes motion:
 *    no shake requests are emitted at all, and every throb/pulse output is 0.
 *    What it does NOT do is take away the information. Direction indicators keep
 *    their bearing and keep a legibility floor of 45% of their intensity even at
 *    intensityScale 0, so a player using the calmest possible settings still
 *    knows exactly which way they were shot from. Losing that would be a
 *    competitive disadvantage handed out for using an accessibility setting,
 *    which is not an acceptable trade.
 */

import type { CameraShakeTraumaInput } from '../camera-shake';
import {
  FEEL_CENTRE_SAFE_RADIUS_FRACTION,
  FEEL_CHANNEL_CEILINGS,
  FEEL_CROSSHAIR_CLEAR_RADIUS_FRACTION,
  FEEL_DIRECTION_RING_RADIUS_FRACTION,
  addImpactResponse,
  clamp01,
  createImpactResponseState,
  decayImpactResponse,
  impactResponseEnvelope,
  impactResponseIdle,
  type DamageImpactEvent,
  type ImpactResponseState,
  type ImpactSourceKind,
} from './impact-response';
import {
  CRITICAL_VIGNETTE_CEILING,
  advanceHealthFeel,
  createHealthFeelState,
  healthFeelSignals,
  recordHealthFeelDamage,
  type HealthFeelState,
} from './health-state';

export * from './impact-response';
export * from './health-state';

/** Combined weighted opacity budget for everything this model draws at once. */
export const FEEL_MAX_COMBINED_OVERLAY = 0.72;
/**
 * Fraction of a direction indicator's intensity that survives an intensityScale
 * of 0. Direction is gameplay information, not drama; the player turns the
 * indicator itself off in HUD settings, not by turning effects down.
 */
export const FEEL_DIRECTION_LEGIBILITY_FLOOR = 0.45;
/** Ceiling applied to the peripheral overlay when reduced sensory is on. */
export const FEEL_REDUCED_SENSORY_OVERLAY_SCALE = 0.35;
/** Health points a full health bar represents, when the caller does not say. */
export const FEEL_DEFAULT_MAX_HEALTH = 100;

/** Weights used to compute the combined overlay load. Peripheral area x opacity. */
const OVERLAY_WEIGHTS = Object.freeze({
  edgeImpact: 1,
  vignette: 0.75,
  desaturation: 0.35,
  chromatic: 0.30,
});

export type FeelPreferences = Readonly<{
  /** OS `prefers-reduced-motion`, or the in-game reduced-motion setting. */
  reducedMotion?: boolean;
  /** The repo's stronger switch: reduced sensory effects. Implies reduced motion here. */
  reducedSensory?: boolean;
  /** Global 0..1 strength for the whole feel system. */
  intensityScale?: number;
}>;

export type FeelScales = Readonly<{
  intensityScale: number;
  reducedMotion: boolean;
  reducedSensory: boolean;
  /** 0 when either reduced switch is set. Gates shake and every throb. */
  motionScale: number;
  /** 0 when reduced sensory is set. Gates chromatic and the heartbeat mix. */
  sensoryScale: number;
  /** Scales peripheral overlays; clamped, not zeroed, under reduced sensory. */
  overlayScale: number;
  /** Never below FEEL_DIRECTION_LEGIBILITY_FLOOR. Gates nothing away. */
  informationScale: number;
}>;

export function resolveFeelScales(preferences?: FeelPreferences): FeelScales {
  const intensityScale = clamp01(preferences?.intensityScale ?? 1);
  const reducedSensory = Boolean(preferences?.reducedSensory);
  // Either switch is sufficient. The repo's resolveAccessibilityRuntime already
  // folds OS reduced-motion and reduced-transparency into reducedSensory; we
  // accept both independently so a caller cannot wire only one and lose the gate.
  const reducedMotion = Boolean(preferences?.reducedMotion) || reducedSensory;
  return Object.freeze({
    intensityScale,
    reducedMotion,
    reducedSensory,
    motionScale: reducedMotion ? 0 : intensityScale,
    sensoryScale: reducedSensory ? 0 : intensityScale,
    overlayScale: reducedSensory
      ? Math.min(intensityScale, FEEL_REDUCED_SENSORY_OVERLAY_SCALE)
      : intensityScale,
    informationScale: FEEL_DIRECTION_LEGIBILITY_FLOOR
      + (1 - FEEL_DIRECTION_LEGIBILITY_FLOOR) * intensityScale,
  });
}

export type FeelDirectionIndicator = Readonly<{
  /** Bearing to the source in the player's frame; 0 ahead, +right. Never scaled. */
  bearingRadians: number;
  /** 0..1 draw strength. Always > 0 while the pulse is alive, at any setting. */
  intensity: number;
  source: ImpactSourceKind;
}>;

export type FeelFrame = Readonly<{
  reducedMotion: boolean;
  intensityScale: number;

  /** Hand each straight to `addCameraShakeTrauma`. Empty under reduced motion. */
  shakeRequests: readonly CameraShakeTraumaInput[];

  /** Informational. Survives reduced motion and intensityScale 0. */
  directions: readonly FeelDirectionIndicator[];

  /** Peripheral blood/impact spatter opacity, 0..1. */
  edgeImpact: number;
  /** Peripheral low-health vignette opacity, 0..1. Steady, never throbbing. */
  vignette: number;
  /** Radial chromatic aberration strength, 0..1. Zero at the centre pixel. */
  chromatic: number;
  /** Peripheral chroma loss, 0..1. Never touches luminance. */
  desaturation: number;
  /** Combat-bus low-pass amount, 0..1. */
  audioLowPass: number;

  heartbeatHz: number;
  /** Audio heartbeat gain 0..1. Zero under reduced sensory. */
  heartbeatGain: number;
  breathHz: number;
  breathGain: number;
  /** Visual heartbeat throb 0..1. This is MOTION: zero under reduced motion. */
  hudPulse: number;

  critical: boolean;
  /** Smoothed 0..1. Cannot flicker. Drive anything drawn from this. */
  criticalLevel: number;
  /** Critical throb 0..1. MOTION: zero under reduced motion, level stays. */
  criticalPulse: number;

  /** 0..1 recovery progress since the last hit. */
  recovery: number;
  /** 0..1 master condition signal. */
  distress: number;

  /** Weighted sum of visual channels; guaranteed <= FEEL_MAX_COMBINED_OVERLAY. */
  overlayLoad: number;
  /** Inner radius the HUD must keep clear of every feel overlay. */
  centreSafeRadiusFraction: number;
  /** True when nothing is active and the runtime may skip the overlay entirely. */
  idle: boolean;
}>;

export type FeelState = Readonly<{
  impact: ImpactResponseState;
  health: HealthFeelState;
  /** The model's own clock in ms, used when the caller does not supply one. */
  elapsedMs: number;
  /** Base seed for deterministic shake seeds. */
  seed: number;
  /** Monotonic event counter; makes derived seeds distinct and replayable. */
  eventCount: number;
}>;

export type FeelStepInput = Readonly<{
  dtSeconds: number;
  /** Current health fraction 0..1. */
  healthFraction: number;
  alive?: boolean;
  /** Damage events that landed during this frame. */
  events?: readonly DamageImpactEvent[];
  preferences?: FeelPreferences;
  /** Health points a full bar represents. Defaults to FEEL_DEFAULT_MAX_HEALTH. */
  maxHealth?: number;
  /** Wall clock in ms for the shake requests. Defaults to the model's own clock. */
  nowMs?: number;
}>;

export type FeelStepResult = Readonly<{ state: FeelState; frame: FeelFrame }>;

export function createFeelState(healthFraction = 1, seed = 0): FeelState {
  return Object.freeze({
    impact: createImpactResponseState(),
    health: createHealthFeelState(healthFraction),
    elapsedMs: 0,
    seed: seed | 0,
    eventCount: 0,
  });
}

/** Deterministic per-event seed. Never random, so replays and peers agree. */
function derivedSeed(base: number, ordinal: number): number {
  return (Math.imul(base ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(ordinal + 1, 0x27d4eb2d)) | 0;
}

/**
 * One frame. Order is: advance time, then apply the events that landed during
 * it, so a hit is at full strength on the frame it is reported rather than
 * arriving already decayed by that frame's dt.
 */
export function stepFeel(state: FeelState, input: FeelStepInput): FeelStepResult {
  const dt = Number.isFinite(input.dtSeconds) && input.dtSeconds > 0 ? input.dtSeconds : 0;
  const alive = input.alive ?? true;
  const health = clamp01(input.healthFraction);
  const maxHealth = Number.isFinite(input.maxHealth) && (input.maxHealth as number) > 0
    ? (input.maxHealth as number)
    : FEEL_DEFAULT_MAX_HEALTH;
  const scales = resolveFeelScales(input.preferences);
  const elapsedMs = state.elapsedMs + dt * 1000;
  const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : elapsedMs;

  let impact = decayImpactResponse(state.impact, dt);
  let healthState = advanceHealthFeel(state.health, dt, health, alive);
  let eventCount = state.eventCount;
  const shakeRequests: CameraShakeTraumaInput[] = [];

  for (const event of input.events ?? []) {
    const envelope = impactResponseEnvelope(event);
    if (!envelope) continue;
    const ordinal = eventCount;
    eventCount += 1;
    impact = addImpactResponse(impact, envelope);
    healthState = recordHealthFeelDamage(healthState, event.amount / maxHealth, health);
    if (scales.motionScale <= 0) continue;
    shakeRequests.push(Object.freeze({
      source: envelope.shakeSource,
      now: nowMs,
      strength: envelope.shakeStrength,
      distanceUnits: event.distanceUnits,
      seed: event.seed ?? derivedSeed(state.seed, ordinal),
      preferences: Object.freeze({
        reducedMotion: scales.reducedMotion,
        intensityScale: scales.motionScale,
      }),
    }));
  }

  const nextState: FeelState = Object.freeze({
    impact,
    health: healthState,
    elapsedMs,
    seed: state.seed,
    eventCount,
  });

  return Object.freeze({
    state: nextState,
    frame: sampleFeel(nextState, input.preferences, shakeRequests),
  });
}

/**
 * Read a frame from a state. Exported separately so a paused or interpolated
 * renderer can re-read the same state without advancing it.
 */
export function sampleFeel(
  state: FeelState,
  preferences?: FeelPreferences,
  shakeRequests: readonly CameraShakeTraumaInput[] = [],
): FeelFrame {
  const scales = resolveFeelScales(preferences);
  const signals = healthFeelSignals(state.health);

  // Raw (pre-cap) visual channels after the accessibility scales.
  const rawEdgeImpact = state.impact.edgeImpact * scales.overlayScale;
  const rawVignette = signals.vignette * scales.overlayScale;
  const rawChromatic = state.impact.chromatic * scales.sensoryScale;
  const rawDesaturation = state.impact.desaturation * scales.overlayScale;

  const rawLoad = rawEdgeImpact * OVERLAY_WEIGHTS.edgeImpact
    + rawVignette * OVERLAY_WEIGHTS.vignette
    + rawDesaturation * OVERLAY_WEIGHTS.desaturation
    + rawChromatic * OVERLAY_WEIGHTS.chromatic;
  // The simultaneous cap. Proportional, so the mix is preserved and the frame
  // still reads as "three hits at once" - just never as a white-out.
  const capScale = rawLoad > FEEL_MAX_COMBINED_OVERLAY ? FEEL_MAX_COMBINED_OVERLAY / rawLoad : 1;

  const edgeImpact = clamp01(rawEdgeImpact * capScale);
  const vignette = clamp01(rawVignette * capScale);
  const chromatic = clamp01(rawChromatic * capScale);
  const desaturation = clamp01(rawDesaturation * capScale);

  const directions = Object.freeze(state.impact.directions.map((pulse) => Object.freeze({
    bearingRadians: pulse.bearingRadians,
    intensity: clamp01(pulse.intensity * scales.informationScale),
    source: pulse.source,
  })));

  const overlayLoad = edgeImpact * OVERLAY_WEIGHTS.edgeImpact
    + vignette * OVERLAY_WEIGHTS.vignette
    + desaturation * OVERLAY_WEIGHTS.desaturation
    + chromatic * OVERLAY_WEIGHTS.chromatic;

  return Object.freeze({
    reducedMotion: scales.reducedMotion,
    intensityScale: scales.intensityScale,
    shakeRequests: scales.motionScale <= 0 ? Object.freeze([]) : Object.freeze(shakeRequests.slice()),
    directions,
    edgeImpact,
    vignette,
    chromatic,
    desaturation,
    audioLowPass: clamp01(state.impact.audioLowPass * (scales.reducedSensory ? 0.4 : 1) * scales.intensityScale),
    heartbeatHz: signals.heartbeatHz,
    heartbeatGain: clamp01(signals.heartbeatGain * scales.sensoryScale),
    breathHz: signals.breathHz,
    breathGain: clamp01(signals.breathGain * scales.sensoryScale),
    hudPulse: clamp01(signals.heartbeatPulse * signals.criticalLevel * scales.motionScale),
    critical: signals.critical,
    criticalLevel: signals.criticalLevel,
    criticalPulse: clamp01(signals.criticalLevel * signals.heartbeatPulse * scales.motionScale),
    recovery: signals.recovery,
    distress: signals.distress,
    overlayLoad,
    centreSafeRadiusFraction: FEEL_CENTRE_SAFE_RADIUS_FRACTION,
    idle: impactResponseIdle(state.impact) && signals.criticalLevel === 0 && signals.heartbeatGain === 0,
  });
}

export type FeelOverlayGeometry = Readonly<{
  centreXPx: number;
  centreYPx: number;
  /** Gradient inner stop. Alpha is 0 here and everywhere inside it. */
  innerRadiusPx: number;
  /** Gradient outer stop, at the far corner: alpha reaches the channel value. */
  outerRadiusPx: number;
  /** Radius the directional damage indicators are placed on. */
  directionRingRadiusPx: number;
  /** Hard exclusion radius. Nothing at all may be drawn inside it. */
  crosshairClearRadiusPx: number;
}>;

/**
 * Turn a viewport into the exact pixel geometry the overlay must use.
 *
 * This exists so the safety rules survive contact with CSS. `edgeImpact: 0.4`
 * is the alpha at the OUTER stop only - the gradient ramps from 0 at
 * `innerRadiusPx` - so the area-weighted opacity over the frame is a small
 * fraction of the channel value, and the peak only ever exists in the outermost
 * pixels. A flat fill at the channel value would be a completely different, and
 * much worse, effect than the numbers in this model were tuned for.
 */
export function feelOverlayGeometry(viewportWidth: number, viewportHeight: number): FeelOverlayGeometry {
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
  const halfHeight = height / 2;
  const outerRadiusPx = Math.hypot(width / 2, halfHeight);
  return Object.freeze({
    centreXPx: width / 2,
    centreYPx: halfHeight,
    innerRadiusPx: Math.min(halfHeight * FEEL_CENTRE_SAFE_RADIUS_FRACTION, outerRadiusPx * 0.95),
    outerRadiusPx,
    directionRingRadiusPx: halfHeight * FEEL_DIRECTION_RING_RADIUS_FRACTION,
    crosshairClearRadiusPx: halfHeight * FEEL_CROSSHAIR_CLEAR_RADIUS_FRACTION,
  });
}

/**
 * Mechanical combat-safety audit of one frame. Returns the violations, empty
 * when the frame is safe. Tests run this under damage spam; a runtime assertion
 * can run it in development builds.
 */
export function combatSafetyReport(frame: FeelFrame): readonly string[] {
  const violations: string[] = [];
  if (frame.centreSafeRadiusFraction < FEEL_CENTRE_SAFE_RADIUS_FRACTION) {
    violations.push('centre-safe radius shrank below the contract');
  }
  if (frame.edgeImpact > FEEL_CHANNEL_CEILINGS.edgeImpact) violations.push('edgeImpact above ceiling');
  if (frame.chromatic > FEEL_CHANNEL_CEILINGS.chromatic) violations.push('chromatic above ceiling');
  if (frame.desaturation > FEEL_CHANNEL_CEILINGS.desaturation) violations.push('desaturation above ceiling');
  if (frame.audioLowPass > FEEL_CHANNEL_CEILINGS.audioLowPass) violations.push('audioLowPass above ceiling');
  if (frame.vignette > CRITICAL_VIGNETTE_CEILING) violations.push('vignette above ceiling');
  if (frame.overlayLoad > FEEL_MAX_COMBINED_OVERLAY + 1e-9) violations.push('combined overlay load above cap');
  if (frame.reducedMotion && frame.shakeRequests.length > 0) violations.push('shake emitted under reduced motion');
  if (frame.reducedMotion && (frame.hudPulse > 0 || frame.criticalPulse > 0)) {
    violations.push('throb emitted under reduced motion');
  }
  for (const direction of frame.directions) {
    if (!Number.isFinite(direction.bearingRadians)) violations.push('direction bearing is not finite');
    if (direction.intensity <= 0) violations.push('direction indicator lost its intensity');
  }
  return Object.freeze(violations);
}
