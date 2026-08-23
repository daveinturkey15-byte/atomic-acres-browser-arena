/**
 * Damage feel, part 1: what ONE damage event does to the frame.
 *
 * Pure math. No DOM, no three.js, no audio node, no clock of its own - the
 * caller owns time and passes elapsed seconds in. That is what makes this
 * testable and what makes it frame-rate independent.
 *
 * This module deliberately does NOT implement camera shake. `src/camera-shake.ts`
 * already owns the trauma model (trauma^2 amplitude, seeded value noise, per-source
 * presets). Here we only decide HOW MUCH trauma a damage event is worth and WHICH
 * preset it should use; the runtime hands the resulting request straight to
 * `addCameraShakeTrauma`. A second shake integrator would give the player two
 * cameras fighting each other.
 *
 * ---------------------------------------------------------------------------
 * THE CURVES (all of them, documented, none of them latching)
 *
 * Every channel decays as `value * 0.5^(dt / halfLife)`. Exponential half-life
 * was chosen over the linear bleed the trauma model uses for one reason that
 * matters here: exponential decay is EXACTLY composable, because
 * `0.5^(a/h) * 0.5^(b/h) === 0.5^((a+b)/h)`. Advancing 100 ms ten times and
 * advancing 1000 ms once therefore land on the same number to floating-point
 * rounding, with no accumulator, no clamp and no per-frame drift. A game that
 * looks different at 30 fps and 144 fps is a game that feels different, and
 * "feel" is the entire point of this module.
 *
 * Nothing latches: below FEEL_SILENCE_EPSILON a channel snaps to exactly 0 and a
 * direction pulse is dropped, so an idle player provably costs zero overlay.
 *
 * Per-channel half-lives are tuned relative to each other, not in isolation:
 *  - chromatic (0.16s) is the fastest because it is the most readability-hostile
 *    channel. You get a hard flash of it and it is gone before your return shot.
 *  - direction (0.30s) and edge impact (0.34s) outlive it, because those are the
 *    channels carrying INFORMATION (who hit me, from where) rather than drama.
 *  - desaturation (0.42s) and the audio low-pass (0.62s) are the slow tail; an
 *    explosion should ring in your ears after your eyes have recovered.
 *
 * Duration is therefore a CONSEQUENCE of amplitude under a fixed decay rate,
 * never a second competing knob: a bigger hit lasts longer because it starts
 * higher. `durationSeconds` on the envelope is that consequence solved for t.
 *
 * ---------------------------------------------------------------------------
 * COMBAT SAFETY (the constraints, stated as code)
 *
 *  - PERIPHERAL ONLY. Every visual channel here is radial and starts at
 *    FEEL_CENTRE_SAFE_RADIUS_FRACTION of the half-height. The centre of the
 *    screen - crosshair, hit markers, whatever the player is aiming at - is
 *    untouched by construction, not by careful CSS. Chromatic aberration is
 *    radial and mathematically zero at the centre pixel, which is exactly why
 *    it is allowed at all.
 *  - NEVER DARKEN THE TARGET. Desaturation is capped hard and applies to the
 *    peripheral ring; it removes colour, it does not remove luminance, so an
 *    enemy silhouette against a background keeps its contrast ratio.
 *  - SIMULTANEOUS CAP. Per-channel ceilings are not enough, because three
 *    channels at 60% each still white out a frame. Channels accumulate through
 *    a saturating blend (never past their ceiling) and the combined overlay load
 *    is capped again at the frame level in `./index`. Three fast hits converge
 *    on the cap; they cannot sum past it.
 */
import type { CameraShakeSource } from '../camera-shake';

/** Below this a channel is snapped to exactly zero, so nothing latches. */
export const FEEL_SILENCE_EPSILON = 1e-4;
/** Opacity below which an overlay is not perceptible; used to solve durations. */
export const FEEL_VISIBLE_THRESHOLD = 0.02;

/**
 * Fraction of the viewport HALF-HEIGHT that stays completely free of feel tint.
 * The HUD drives its radial gradient's inner stop from this constant (via
 * `feelOverlayGeometry`) rather than hard-coding a number in CSS, so the safety
 * rule has one definition and a test can hold it.
 *
 * Half-height, not half-width and not half-diagonal, and this matters: on the
 * 3440x1440 review viewport a diagonal-keyed gradient would push tint into the
 * vertical centre of the frame, while a height-keyed one hugs the far left and
 * right edges - which is where peripheral vision actually is on an ultrawide.
 */
export const FEEL_CENTRE_SAFE_RADIUS_FRACTION = 0.62;

/**
 * Radius (of half-height) of the ring the directional damage indicators sit on.
 *
 * Calibrated against real captures of the live HUD, not guessed. Two hard walls:
 *  - OUTWARD: at 1280x720 every corner is occupied by a real panel (scoreboard,
 *    minimap, vitals, killstreak rail). The nearest panel edges are ~200 px from
 *    centre, so a ring beyond ~0.55 of half-height starts landing behind chrome.
 *  - INWARD: the first render of this at 0.34 put a marker ~122 px from the
 *    crosshair at 720p - directly over the ground plane where a target stands.
 *    That is an effect obscuring an enemy, which this model is not allowed to do.
 *
 * 0.50 sits in the gap: clear of the aim zone, clear of the panels, and inside
 * FEEL_CENTRE_SAFE_RADIUS_FRACTION so a marker never overlaps the edge tint.
 * The marker itself must be an OUTLINE chevron, never a filled wedge - see the
 * wiring notes; the radius alone does not make it safe.
 */
export const FEEL_DIRECTION_RING_RADIUS_FRACTION = 0.50;

/**
 * Absolutely nothing - no tint, no glyph, no arc - is permitted inside this
 * radius (of half-height). This is the crosshair and target-acquisition zone.
 */
export const FEEL_CROSSHAIR_CLEAR_RADIUS_FRACTION = 0.12;

export type ImpactSourceKind = 'bullet' | 'explosion' | 'fall' | 'fire';

export const IMPACT_SOURCE_KINDS = Object.freeze(
  ['bullet', 'explosion', 'fall', 'fire'] as const,
);

/** Per-channel exponential half-lives in seconds. See the header for the tuning. */
export const FEEL_DECAY_HALF_LIVES = Object.freeze({
  direction: 0.30,
  edgeImpact: 0.34,
  chromatic: 0.16,
  desaturation: 0.42,
  audioLowPass: 0.62,
});

/**
 * Hard per-channel ceilings. These are the "cannot blind the player" numbers:
 * no accumulation path, no damage amount and no number of simultaneous hits may
 * push a channel past its ceiling.
 */
export const FEEL_CHANNEL_CEILINGS = Object.freeze({
  /** Peripheral blood/impact spatter opacity. */
  edgeImpact: 0.62,
  /** Radial chromatic aberration, normalised strength (renderer maps it to px). */
  chromatic: 0.40,
  /** Peripheral colour loss. Luminance is never touched. */
  desaturation: 0.45,
  /** Concussive low-pass on the combat bus, 0 = open, 1 = fully muffled. */
  audioLowPass: 0.85,
});

/** At most this many distinct damage bearings are tracked and drawn at once. */
export const FEEL_MAX_TRACKED_DIRECTIONS = 4;
/** Hits within this angle of an existing pulse reinforce it instead of adding an arrow. */
export const FEEL_DIRECTION_MERGE_RADIANS = Math.PI / 8;

/** Damage that counts as a full-strength single hit for channel scaling. */
export const FEEL_REFERENCE_DAMAGE = 45;
/** Extra response at zero health: a hit at 5% health reads harder than at 100%. */
export const FEEL_LOW_HEALTH_AMPLIFICATION = 0.35;

export type DamageImpactEvent = Readonly<{
  /** Health points lost. Non-finite or <= 0 produces no envelope. */
  amount: number;
  /**
   * Bearing TO the damage source in the player's own frame: 0 is dead ahead,
   * +PI/2 is the player's right, +-PI is behind. Screen space, not world space,
   * so the HUD can use it directly and so it stays correct under camera yaw.
   */
  bearingRadians: number;
  source: ImpactSourceKind;
  /** Health fraction AFTER the hit, 0..1. Drives the low-health amplification. */
  healthFraction: number;
  /** Distance to the source; only explosions use it (near vs far preset). */
  distanceUnits?: number;
  /** Deterministic seed forwarded to the shake model. Never a random number. */
  seed?: number;
}>;

export type ImpactResponseEnvelope = Readonly<{
  source: ImpactSourceKind;
  /** Which `CAMERA_SHAKE_SOURCE_PRESETS` entry this event should drive. */
  shakeSource: CameraShakeSource;
  /** 0..1 strength for `addCameraShakeTrauma`; the preset supplies the shape. */
  shakeStrength: number;
  directionalIntensity: number;
  directionalBearingRadians: number;
  /**
   * False when the bearing carries no information (a fall has no attacker).
   * The HUD must not draw a "shot from the front" arrow for hitting the ground.
   */
  directionalCertain: boolean;
  edgeImpact: number;
  chromatic: number;
  desaturation: number;
  audioLowPass: number;
  /** Seconds until every channel of this event alone is below perception. */
  durationSeconds: number;
}>;

type SourceProfile = Readonly<{
  shakeSource: CameraShakeSource;
  /** Explosions swap preset by distance; null means the preset never changes. */
  farShakeSource: CameraShakeSource | null;
  farDistanceUnits: number;
  shakeStrength: number;
  directional: number;
  directionalCertain: boolean;
  edgeImpact: number;
  chromatic: number;
  desaturation: number;
  audioLowPass: number;
}>;

/**
 * Per-source character. These are the values at exactly FEEL_REFERENCE_DAMAGE
 * at full health; everything else scales from here.
 *
 *  - bullet: the most common event, so it is the most restrained. It is mostly
 *    DIRECTION - the one thing you actually need - with a short spatter and a
 *    hard, brief chromatic snap. Almost no audio change: a rifle hit does not
 *    concuss you, and muffling audio on every bullet would destroy the footstep
 *    information a firefight is won with.
 *  - explosion: the loud one. Full audio low-pass (the concussion ring every
 *    modern shooter trains the player to expect), heavy desaturation, but its
 *    DIRECTIONAL weight is lower than a bullet's on purpose - a blast is an
 *    area event, and a confident arrow at one edge of it is a lie.
 *  - fall: entirely non-directional. Vertical impact, no attacker, so the arrow
 *    is suppressed and the response is a body thump: shake, desaturation, a
 *    short audio duck. Drawing a damage arrow here is a known genre bug.
 *  - fire: the drip. Tiny per tick because it ticks repeatedly; the saturating
 *    accumulation below is what turns a stream of small ticks into a sustained
 *    edge glow rather than a strobe.
 */
const SOURCE_PROFILES: Readonly<Record<ImpactSourceKind, SourceProfile>> = Object.freeze({
  bullet: Object.freeze({
    shakeSource: 'damage-taken',
    farShakeSource: null,
    farDistanceUnits: Number.POSITIVE_INFINITY,
    shakeStrength: 0.55,
    directional: 1,
    directionalCertain: true,
    edgeImpact: 0.46,
    chromatic: 0.34,
    desaturation: 0.18,
    audioLowPass: 0.10,
  }),
  explosion: Object.freeze({
    shakeSource: 'near-explosion',
    farShakeSource: 'far-explosion',
    farDistanceUnits: 18,
    shakeStrength: 1,
    directional: 0.62,
    directionalCertain: true,
    edgeImpact: 0.70,
    chromatic: 0.85,
    desaturation: 0.62,
    audioLowPass: 1,
  }),
  fall: Object.freeze({
    shakeSource: 'hard-landing',
    farShakeSource: null,
    farDistanceUnits: Number.POSITIVE_INFINITY,
    shakeStrength: 0.8,
    directional: 0,
    directionalCertain: false,
    edgeImpact: 0.24,
    chromatic: 0.18,
    desaturation: 0.34,
    audioLowPass: 0.30,
  }),
  fire: Object.freeze({
    shakeSource: 'damage-taken',
    farShakeSource: null,
    farDistanceUnits: Number.POSITIVE_INFINITY,
    shakeStrength: 0.14,
    directional: 0.5,
    directionalCertain: true,
    edgeImpact: 0.58,
    chromatic: 0.12,
    desaturation: 0.10,
    audioLowPass: 0.06,
  }),
});

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Wrap to [-PI, PI) - the same convention and the same formula as the existing
 * `normalizeAngle` in `src/sensory-feedback.ts`, so "directly behind" is -PI in
 * both and the two damage indicators cannot disagree by a full turn.
 * Non-finite input reads as dead ahead rather than propagating NaN into the HUD.
 */
export function normalizeBearing(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  const turn = Math.PI * 2;
  return ((radians + Math.PI) % turn + turn) % turn - Math.PI;
}

/**
 * Exponential decay factor for one elapsed span. Exactly composable, which is
 * the whole frame-rate-independence guarantee in one line.
 */
export function decayFactor(halfLifeSeconds: number, dtSeconds: number): number {
  if (!(halfLifeSeconds > 0) || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return 1;
  return Math.pow(0.5, dtSeconds / halfLifeSeconds);
}

/**
 * Saturating accumulation: `current + add * (1 - current/ceiling)`.
 *
 * This is the anti-blinding rule. Each additional hit can only claim a fraction
 * of the HEADROOM that is left, so the channel approaches its ceiling and never
 * reaches or exceeds it. Three hits of 0.5 into a 0.62 ceiling land just under
 * 0.62, not at 1.5. It is also monotonic, so a test can assert "more damage is
 * never less response" without special-casing the cap.
 */
export function saturatingAdd(current: number, add: number, ceiling: number): number {
  if (!(ceiling > 0)) return 0;
  const base = Math.min(Math.max(Number.isFinite(current) ? current : 0, 0), ceiling);
  const increment = Math.min(Math.max(Number.isFinite(add) ? add : 0, 0), ceiling);
  const next = base + increment * (1 - base / ceiling);
  return next >= ceiling ? ceiling : next;
}

/** Seconds for `value` to decay below FEEL_VISIBLE_THRESHOLD under `halfLife`. */
function channelDuration(value: number, halfLifeSeconds: number): number {
  if (value <= FEEL_VISIBLE_THRESHOLD) return 0;
  return halfLifeSeconds * Math.log2(value / FEEL_VISIBLE_THRESHOLD);
}

/**
 * The per-event response. Pure function of the event: no state, no time, no
 * preferences. Accessibility scaling happens at sample time in `./index` so
 * that turning effects down never destroys the informational content here.
 *
 * Returns null for a non-event (zero, negative or non-finite damage), so the
 * caller never has to invent a "did anything happen" flag.
 */
export function impactResponseEnvelope(event: DamageImpactEvent): ImpactResponseEnvelope | null {
  if (!Number.isFinite(event.amount) || event.amount <= 0) return null;
  const profile = SOURCE_PROFILES[event.source];
  if (!profile) return null;

  // Severity saturates rather than clipping: a 200-damage rocket is not four
  // times the screen effect of a 50-damage burst, it is "the maximum" plus a
  // longer tail. sqrt keeps small hits legible instead of invisible.
  const severity = clamp01(Math.sqrt(clamp01(event.amount / FEEL_REFERENCE_DAMAGE)));
  const health = clamp01(event.healthFraction);
  const amplification = 1 + (1 - health) * FEEL_LOW_HEALTH_AMPLIFICATION;
  const scale = severity * amplification;

  const distance = Number.isFinite(event.distanceUnits) ? Math.max(0, event.distanceUnits as number) : 0;
  const shakeSource = profile.farShakeSource !== null && distance > profile.farDistanceUnits
    ? profile.farShakeSource
    : profile.shakeSource;

  const edgeImpact = Math.min(profile.edgeImpact * scale, FEEL_CHANNEL_CEILINGS.edgeImpact);
  const chromatic = Math.min(profile.chromatic * scale, FEEL_CHANNEL_CEILINGS.chromatic);
  const desaturation = Math.min(profile.desaturation * scale, FEEL_CHANNEL_CEILINGS.desaturation);
  const audioLowPass = Math.min(profile.audioLowPass * scale, FEEL_CHANNEL_CEILINGS.audioLowPass);
  const directionalIntensity = profile.directionalCertain ? clamp01(profile.directional * scale) : 0;

  const durationSeconds = Math.max(
    channelDuration(directionalIntensity, FEEL_DECAY_HALF_LIVES.direction),
    channelDuration(edgeImpact, FEEL_DECAY_HALF_LIVES.edgeImpact),
    channelDuration(chromatic, FEEL_DECAY_HALF_LIVES.chromatic),
    channelDuration(desaturation, FEEL_DECAY_HALF_LIVES.desaturation),
    channelDuration(audioLowPass, FEEL_DECAY_HALF_LIVES.audioLowPass),
  );

  return Object.freeze({
    source: event.source,
    shakeSource,
    shakeStrength: clamp01(profile.shakeStrength * scale),
    directionalIntensity,
    directionalBearingRadians: profile.directionalCertain ? normalizeBearing(event.bearingRadians) : 0,
    directionalCertain: profile.directionalCertain,
    edgeImpact,
    chromatic,
    desaturation,
    audioLowPass,
    durationSeconds,
  });
}

export type ImpactDirectionPulse = Readonly<{
  bearingRadians: number;
  intensity: number;
  source: ImpactSourceKind;
}>;

export type ImpactResponseState = Readonly<{
  edgeImpact: number;
  chromatic: number;
  desaturation: number;
  audioLowPass: number;
  directions: readonly ImpactDirectionPulse[];
}>;

const EMPTY_DIRECTIONS: readonly ImpactDirectionPulse[] = Object.freeze([]);

export function createImpactResponseState(): ImpactResponseState {
  return Object.freeze({
    edgeImpact: 0,
    chromatic: 0,
    desaturation: 0,
    audioLowPass: 0,
    directions: EMPTY_DIRECTIONS,
  });
}

/** Deterministic ordering: strongest first, then by bearing, then by source. */
function sortedDirections(directions: readonly ImpactDirectionPulse[]): readonly ImpactDirectionPulse[] {
  const ordered = directions.slice().sort((left, right) =>
    right.intensity - left.intensity
    || left.bearingRadians - right.bearingRadians
    || left.source.localeCompare(right.source));
  return Object.freeze(ordered.slice(0, FEEL_MAX_TRACKED_DIRECTIONS));
}

/**
 * Fold one envelope into the live state.
 *
 * Directions merge rather than multiply: a burst of five rounds from the same
 * attacker reinforces ONE indicator instead of stacking five identical arrows,
 * which is both the readable behaviour and the reason a cap of four is a real
 * cap on distinct threats rather than on bullets.
 */
export function addImpactResponse(
  state: ImpactResponseState,
  envelope: ImpactResponseEnvelope,
): ImpactResponseState {
  const directions: ImpactDirectionPulse[] = state.directions.map((pulse) => pulse);
  if (envelope.directionalCertain && envelope.directionalIntensity > 0) {
    const bearing = envelope.directionalBearingRadians;
    let mergedAt = -1;
    for (let index = 0; index < directions.length; index += 1) {
      const pulse = directions[index];
      if (Math.abs(normalizeBearing(bearing - pulse.bearingRadians)) > FEEL_DIRECTION_MERGE_RADIANS) continue;
      const intensity = saturatingAdd(pulse.intensity, envelope.directionalIntensity, 1);
      // Pull the indicator toward the newer bearing in proportion to how much
      // of the total intensity the new hit contributed, so a moving attacker
      // drags the arrow instead of teleporting it.
      const weight = intensity <= 0 ? 0 : clamp01(envelope.directionalIntensity / intensity);
      directions[index] = Object.freeze({
        bearingRadians: normalizeBearing(
          pulse.bearingRadians + normalizeBearing(bearing - pulse.bearingRadians) * weight,
        ),
        intensity,
        source: envelope.source,
      });
      mergedAt = index;
      break;
    }
    if (mergedAt < 0) {
      directions.push(Object.freeze({
        bearingRadians: bearing,
        intensity: clamp01(envelope.directionalIntensity),
        source: envelope.source,
      }));
    }
  }
  return Object.freeze({
    edgeImpact: saturatingAdd(state.edgeImpact, envelope.edgeImpact, FEEL_CHANNEL_CEILINGS.edgeImpact),
    chromatic: saturatingAdd(state.chromatic, envelope.chromatic, FEEL_CHANNEL_CEILINGS.chromatic),
    desaturation: saturatingAdd(state.desaturation, envelope.desaturation, FEEL_CHANNEL_CEILINGS.desaturation),
    audioLowPass: saturatingAdd(state.audioLowPass, envelope.audioLowPass, FEEL_CHANNEL_CEILINGS.audioLowPass),
    directions: sortedDirections(directions),
  });
}

/**
 * Advance every channel by `dtSeconds`. Exact under any partition of elapsed
 * time; see the header. Channels below FEEL_SILENCE_EPSILON snap to exactly 0
 * and pulses below it are dropped, so the state provably returns to its initial
 * value and an untouched player renders nothing.
 */
export function decayImpactResponse(state: ImpactResponseState, dtSeconds: number): ImpactResponseState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const snap = (value: number, halfLife: number): number => {
    const next = value * decayFactor(halfLife, dtSeconds);
    return next < FEEL_SILENCE_EPSILON ? 0 : next;
  };
  const directionFactor = decayFactor(FEEL_DECAY_HALF_LIVES.direction, dtSeconds);
  const directions = state.directions
    .map((pulse) => Object.freeze({ ...pulse, intensity: pulse.intensity * directionFactor }))
    .filter((pulse) => pulse.intensity >= FEEL_SILENCE_EPSILON);
  return Object.freeze({
    edgeImpact: snap(state.edgeImpact, FEEL_DECAY_HALF_LIVES.edgeImpact),
    chromatic: snap(state.chromatic, FEEL_DECAY_HALF_LIVES.chromatic),
    desaturation: snap(state.desaturation, FEEL_DECAY_HALF_LIVES.desaturation),
    audioLowPass: snap(state.audioLowPass, FEEL_DECAY_HALF_LIVES.audioLowPass),
    directions: directions.length === 0 ? EMPTY_DIRECTIONS : Object.freeze(directions),
  });
}

/** True when nothing is active, so the runtime can skip the whole overlay path. */
export function impactResponseIdle(state: ImpactResponseState): boolean {
  return state.edgeImpact === 0
    && state.chromatic === 0
    && state.desaturation === 0
    && state.audioLowPass === 0
    && state.directions.length === 0;
}
