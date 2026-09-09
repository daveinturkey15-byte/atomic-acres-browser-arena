/**
 * Pass 77 / HF-375. Additive pose channels layered ON TOP of locomotion:
 * aim pitch, lean, turn-in-place and idle breathing.
 *
 * Aim pitch is the headline. `poseOperator` already receives an aim pitch from
 * the caller - the local operator path even passes the real replicated pitch -
 * and the parameter is named `_aimPitch` and dropped on the floor. The result is
 * a body that always aims at the horizon while its bullets go up a stairwell.
 * Distributing that pitch across spine, chest, neck and head is the standard fix
 * and needs no new art, because it is a bone offset applied after the mixer.
 *
 * Every channel here is:
 *   - clamped to an anatomically sane range, so a bad input cannot fold the rig;
 *   - critically approached (never overshoots) with a frame-rate independent
 *     response, so 30 Hz and 240 Hz clients converge on the same pose;
 *   - deterministic - deltas in, no clocks, no randomness.
 */

export type AimJointRole = 'spine' | 'chest' | 'neck' | 'head';

/**
 * How much of the total aim pitch each joint carries. Weighted toward the chest
 * and spine so the weapon (socketed on the body, not on a hand bone) actually
 * follows the aim, with the head finishing the line of sight. The four weights
 * sum to 1 by contract, which is what lets the distribution be verified against
 * the requested pitch instead of eyeballed.
 */
export const AIM_PITCH_DISTRIBUTION: Readonly<Record<AimJointRole, number>> = Object.freeze({
  spine: 0.3,
  chest: 0.32,
  neck: 0.18,
  head: 0.2,
});

export type AimPitchLimits = Readonly<{ maximumUpRadians: number; maximumDownRadians: number }>;

/**
 * Asymmetric on purpose: a standing human folds further forward than backward.
 * ~35 degrees up, ~45 degrees down covers every firing line the arenas contain.
 */
export const AIM_PITCH_LIMITS: AimPitchLimits = Object.freeze({
  maximumUpRadians: 0.61,
  maximumDownRadians: 0.79,
});

export const MAXIMUM_LEAN_RADIANS = 0.28;

export type AdditivePoseProfile = Readonly<{
  aimResponseHz: number;
  leanResponseHz: number;
  leanGainRadiansPerMps: number;
  maximumLeanRadians: number;
  /** Yaw error that starts a turn-in-place while stationary. */
  turnEnterRadians: number;
  /** Yaw error that ends one. Must be smaller than the enter threshold. */
  turnExitRadians: number;
  turnRateRadiansPerSecond: number;
  /** Above this speed the body is steered by movement, not by turning in place. */
  turnSpeedCeilingMps: number;
  /** Multiplier on the turn rate once the operator is moving. */
  movingTurnRateScale: number;
  breathHz: number;
  breathAmplitudeRadians: number;
}>;

export type AdditivePoseState = {
  aimPitchRadians: number;
  leanRollRadians: number;
  turning: -1 | 0 | 1;
  breathPhase: number;
};

export type AdditivePoseInput = Readonly<{
  deltaSeconds: number;
  desiredAimPitchRadians: number;
  /** Signed shortest angle from the current body yaw to the desired yaw. */
  yawErrorRadians: number;
  /** Local-space lateral velocity, +right. Drives the lean. */
  strafeMps: number;
  groundSpeedMps: number;
}>;

export type AdditivePoseOutput = Readonly<{
  aimPitchRadians: number;
  aimJointRadians: Readonly<Record<AimJointRole, number>>;
  leanRollRadians: number;
  turning: -1 | 0 | 1;
  /** Yaw the body should rotate by this frame, already rate limited. */
  bodyYawDeltaRadians: number;
  residualYawErrorRadians: number;
  breathPhase: number;
  breathOffsetRadians: number;
}>;

export const DEFAULT_ADDITIVE_POSE_PROFILE: AdditivePoseProfile = Object.freeze({
  aimResponseHz: 6,
  leanResponseHz: 4,
  leanGainRadiansPerMps: 0.03,
  maximumLeanRadians: 0.2,
  turnEnterRadians: 0.79,
  turnExitRadians: 0.1,
  turnRateRadiansPerSecond: 3.4,
  turnSpeedCeilingMps: 0.6,
  movingTurnRateScale: 2.6,
  breathHz: 0.26,
  breathAmplitudeRadians: 0.018,
});

const TWO_PI = Math.PI * 2;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

/** Shortest signed representation of an angle, in (-pi, pi]. */
export function wrapAngleRadians(angle: number): number {
  const value = finiteOr(angle, 0);
  const wrapped = value - TWO_PI * Math.floor((value + Math.PI) / TWO_PI);
  return wrapped <= -Math.PI ? wrapped + TWO_PI : wrapped;
}

/**
 * Exponential approach expressed as a half-life in hertz rather than a per-frame
 * lerp factor. A per-frame factor makes the pose depend on frame rate, which is
 * how two clients watching the same replicated operator end up disagreeing.
 */
export function smoothTowards(current: number, target: number, deltaSeconds: number, responseHz: number): number {
  const from = finiteOr(current, 0);
  const to = finiteOr(target, 0);
  const dt = Math.max(0, finiteOr(deltaSeconds, 0));
  const hz = Math.max(0, finiteOr(responseHz, 0));
  if (dt <= 0 || hz <= 0) return from;
  return from + (to - from) * (1 - Math.exp(-TWO_PI * hz * dt));
}

export function clampAimPitch(pitchRadians: number, limits: AimPitchLimits = AIM_PITCH_LIMITS): number {
  const up = Math.abs(finiteOr(limits.maximumUpRadians, AIM_PITCH_LIMITS.maximumUpRadians));
  const down = Math.abs(finiteOr(limits.maximumDownRadians, AIM_PITCH_LIMITS.maximumDownRadians));
  return clamp(finiteOr(pitchRadians, 0), -down, up);
}

/**
 * Splits a clamped aim pitch across the spine chain. The returned offsets sum to
 * the clamped pitch, so the chain as a whole points exactly where the shot goes.
 */
export function distributeAimPitch(
  pitchRadians: number,
  distribution: Readonly<Record<AimJointRole, number>> = AIM_PITCH_DISTRIBUTION,
  limits: AimPitchLimits = AIM_PITCH_LIMITS,
): Readonly<Record<AimJointRole, number>> {
  const pitch = clampAimPitch(pitchRadians, limits);
  const roles: readonly AimJointRole[] = ['spine', 'chest', 'neck', 'head'];
  const total = roles.reduce((sum, role) => sum + Math.max(0, finiteOr(distribution[role], 0)), 0);
  if (total <= 0) return Object.freeze({ spine: 0, chest: 0, neck: 0, head: 0 });
  const scaled = roles.map((role) => Math.max(0, finiteOr(distribution[role], 0)) / total * pitch);
  // Give the rounding residue to the heaviest joint so the sum is exact.
  const residue = pitch - scaled.reduce((sum, value) => sum + value, 0);
  let heaviest = 0;
  for (let index = 1; index < roles.length; index += 1) {
    if (scaled[index]! > scaled[heaviest]!) heaviest = index;
  }
  scaled[heaviest] = scaled[heaviest]! + residue;
  return Object.freeze({ spine: scaled[0]!, chest: scaled[1]!, neck: scaled[2]!, head: scaled[3]! });
}

export function createAdditivePoseState(breathPhase = 0): AdditivePoseState {
  return {
    aimPitchRadians: 0,
    leanRollRadians: 0,
    turning: 0,
    breathPhase: ((finiteOr(breathPhase, 0) % 1) + 1) % 1,
  };
}

export function advanceAdditivePose(
  state: AdditivePoseState,
  input: AdditivePoseInput,
  profile: AdditivePoseProfile = DEFAULT_ADDITIVE_POSE_PROFILE,
): AdditivePoseOutput {
  const dt = Math.max(0, finiteOr(input.deltaSeconds, 0));
  const groundSpeedMps = Math.max(0, finiteOr(input.groundSpeedMps, 0));
  const yawError = wrapAngleRadians(input.yawErrorRadians);

  state.aimPitchRadians = clampAimPitch(
    smoothTowards(state.aimPitchRadians, clampAimPitch(input.desiredAimPitchRadians), dt, profile.aimResponseHz),
  );

  const leanTarget = clamp(
    finiteOr(input.strafeMps, 0) * finiteOr(profile.leanGainRadiansPerMps, 0),
    -Math.min(MAXIMUM_LEAN_RADIANS, Math.abs(profile.maximumLeanRadians)),
    Math.min(MAXIMUM_LEAN_RADIANS, Math.abs(profile.maximumLeanRadians)),
  );
  state.leanRollRadians = smoothTowards(state.leanRollRadians, leanTarget, dt, profile.leanResponseHz);

  // Turn-in-place is a hysteresis, not a threshold: entering and leaving on the
  // same angle makes a stationary operator flicker between turning and idle.
  const stationary = groundSpeedMps <= Math.max(0, finiteOr(profile.turnSpeedCeilingMps, 0));
  const enter = Math.abs(finiteOr(profile.turnEnterRadians, DEFAULT_ADDITIVE_POSE_PROFILE.turnEnterRadians));
  const exit = Math.min(enter, Math.abs(finiteOr(profile.turnExitRadians, DEFAULT_ADDITIVE_POSE_PROFILE.turnExitRadians)));
  if (!stationary) state.turning = 0;
  else if (state.turning === 0) {
    if (Math.abs(yawError) >= enter) state.turning = yawError >= 0 ? 1 : -1;
  } else if (Math.abs(yawError) <= exit) state.turning = 0;

  const baseRate = Math.max(0, finiteOr(profile.turnRateRadiansPerSecond, 0));
  const rate = stationary ? baseRate : baseRate * Math.max(1, finiteOr(profile.movingTurnRateScale, 1));
  const maximumDelta = rate * dt;
  const bodyYawDeltaRadians = clamp(yawError, -maximumDelta, maximumDelta);

  const breathHz = Math.max(0, finiteOr(profile.breathHz, 0));
  state.breathPhase = (state.breathPhase + breathHz * dt) % 1;
  const breathOffsetRadians = Math.sin(state.breathPhase * TWO_PI)
    * Math.max(0, finiteOr(profile.breathAmplitudeRadians, 0));

  return Object.freeze({
    aimPitchRadians: state.aimPitchRadians,
    aimJointRadians: distributeAimPitch(state.aimPitchRadians),
    leanRollRadians: state.leanRollRadians,
    turning: state.turning,
    bodyYawDeltaRadians,
    residualYawErrorRadians: yawError - bodyYawDeltaRadians,
    breathPhase: state.breathPhase,
    breathOffsetRadians,
  });
}
