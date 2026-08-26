/**
 * Pass 77 / HF-375. Hit reactions as a bounded additive layer.
 *
 * The shipped reaction plays `HitRecieve` as a full-weight one-shot with
 * `clampWhenFinished = true` and no `finished` listener, so the clip does not
 * merely replace locomotion for its duration - it stays clamped at its last
 * frame and keeps contributing to the mix for the rest of the operator's life.
 * An operator that has been shot, fired and meleed is a running average of three
 * frozen poses and whatever it is actually doing. That is a large part of why
 * bots look wrong after their first firefight.
 *
 * The model here is the opposite: an impulse is a short envelope with a defined
 * end, several impulses sum but the sum is CLAMPED BELOW 1 so locomotion is
 * always visible underneath, and the layer returns to exactly zero. Nothing
 * needs to remember to switch it off.
 *
 * Deterministic: impulse ordering, the alternate-clip choice and the envelope
 * are all functions of the inputs. No randomness, so networked peers agree.
 */

export type HitReactionZone = 'head' | 'body' | 'limb';

export type HitReactionShape = Readonly<{
  riseSeconds: number;
  decaySeconds: number;
  /** Peak contribution of a severity-1 impulse in this zone. */
  peak: number;
}>;

export const HIT_REACTION_SHAPES: Readonly<Record<HitReactionZone, HitReactionShape>> = Object.freeze({
  head: Object.freeze({ riseSeconds: 0.045, decaySeconds: 0.34, peak: 1 }),
  body: Object.freeze({ riseSeconds: 0.06, decaySeconds: 0.28, peak: 0.78 }),
  limb: Object.freeze({ riseSeconds: 0.05, decaySeconds: 0.2, peak: 0.5 }),
});

/**
 * The reaction layer never reaches 1. A full-weight reaction is a clip swap by
 * another name; leaving headroom is what makes it read as a flinch while the
 * operator keeps running.
 */
export const MAXIMUM_HIT_REACTION_WEIGHT = 0.85;
/** Torso deflection ceiling. Beyond this the spine visibly breaks. */
export const MAXIMUM_HIT_REACTION_OFFSET_RADIANS = 0.35;
/** Older impulses past this count are retired; mixer cost stays bounded. */
export const MAXIMUM_CONCURRENT_HIT_IMPULSES = 4;

export type HitImpulse = Readonly<{
  zone: HitReactionZone;
  /** 0..1. Damage fraction, not raw damage - the caller owns that mapping. */
  severity: number;
  /**
   * Direction the hit came FROM, in the operator's local frame: 0 is dead ahead,
   * +pi/2 is the operator's right.
   */
  incomingYawRadians: number;
}>;

type ActiveImpulse = {
  zone: HitReactionZone;
  severity: number;
  incomingYawRadians: number;
  ageSeconds: number;
  /** Deterministic parity used to alternate between the two authored clips. */
  alternate: boolean;
};

export type HitReactionState = {
  impulses: ActiveImpulse[];
  /** Monotonic counter; the parity of the count picks the alternate clip. */
  received: number;
};

export type HitReactionOutput = Readonly<{
  /** Additive weight for the hit clip. Always < 1 and returns to exactly 0. */
  clipWeight: number;
  /** True when the alternate authored hit clip should carry the layer. */
  alternate: boolean;
  pitchOffsetRadians: number;
  rollOffsetRadians: number;
  activeImpulses: number;
}>;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Rise-then-decay envelope with a hard end. Continuous at the peak, exactly 0
 * at and after `riseSeconds + decaySeconds`, so an impulse cannot linger.
 */
export function hitImpulseEnvelope(ageSeconds: number, shape: HitReactionShape): number {
  const age = finiteOr(ageSeconds, 0);
  const rise = Math.max(1e-6, finiteOr(shape.riseSeconds, 0));
  const decay = Math.max(1e-6, finiteOr(shape.decaySeconds, 0));
  if (age <= 0) return 0;
  if (age < rise) return smoothstep01(age / rise);
  if (age < rise + decay) return 1 - smoothstep01((age - rise) / decay);
  return 0;
}

export function hitImpulseDurationSeconds(zone: HitReactionZone): number {
  const shape = HIT_REACTION_SHAPES[zone];
  return shape.riseSeconds + shape.decaySeconds;
}

export function createHitReactionState(): HitReactionState {
  return { impulses: [], received: 0 };
}

export function pushHitImpulse(state: HitReactionState, impulse: HitImpulse): void {
  const zone: HitReactionZone = impulse.zone in HIT_REACTION_SHAPES ? impulse.zone : 'body';
  state.received += 1;
  state.impulses.push({
    zone,
    severity: clamp(finiteOr(impulse.severity, 1), 0, 1),
    incomingYawRadians: finiteOr(impulse.incomingYawRadians, 0),
    ageSeconds: 0,
    // Alternating on a counter rather than a coin flip keeps two peers showing
    // the same reaction for the same shot.
    alternate: state.received % 2 === 0,
  });
  if (state.impulses.length > MAXIMUM_CONCURRENT_HIT_IMPULSES) {
    state.impulses.splice(0, state.impulses.length - MAXIMUM_CONCURRENT_HIT_IMPULSES);
  }
}

/**
 * Advances every live impulse and sums them into one bounded layer.
 * `gain` is the per-skin absorption factor: a plated archetype flinches less.
 */
export function advanceHitReaction(state: HitReactionState, deltaSeconds: number, gain = 1): HitReactionOutput {
  const dt = Math.max(0, finiteOr(deltaSeconds, 0));
  const scale = clamp(finiteOr(gain, 1), 0, 2);
  let rawWeight = 0;
  let pitch = 0;
  let roll = 0;
  let dominant: ActiveImpulse | null = null;
  let dominantContribution = 0;

  const surviving: ActiveImpulse[] = [];
  for (const impulse of state.impulses) {
    impulse.ageSeconds += dt;
    const shape = HIT_REACTION_SHAPES[impulse.zone];
    if (impulse.ageSeconds >= shape.riseSeconds + shape.decaySeconds) continue;
    surviving.push(impulse);
    const contribution = hitImpulseEnvelope(impulse.ageSeconds, shape) * shape.peak * impulse.severity * scale;
    if (contribution <= 0) continue;
    rawWeight += contribution;
    // A hit from dead ahead throws the torso back (negative pitch); one from the
    // right rolls it left. Direction comes from the shot, not from the clip.
    pitch -= contribution * Math.cos(impulse.incomingYawRadians) * MAXIMUM_HIT_REACTION_OFFSET_RADIANS;
    roll -= contribution * Math.sin(impulse.incomingYawRadians) * MAXIMUM_HIT_REACTION_OFFSET_RADIANS;
    if (contribution > dominantContribution) {
      dominantContribution = contribution;
      dominant = impulse;
    }
  }
  state.impulses = surviving;

  return Object.freeze({
    clipWeight: clamp(rawWeight, 0, MAXIMUM_HIT_REACTION_WEIGHT),
    alternate: dominant?.alternate ?? false,
    pitchOffsetRadians: clamp(pitch, -MAXIMUM_HIT_REACTION_OFFSET_RADIANS, MAXIMUM_HIT_REACTION_OFFSET_RADIANS),
    rollOffsetRadians: clamp(roll, -MAXIMUM_HIT_REACTION_OFFSET_RADIANS, MAXIMUM_HIT_REACTION_OFFSET_RADIANS),
    activeImpulses: surviving.length,
  });
}
