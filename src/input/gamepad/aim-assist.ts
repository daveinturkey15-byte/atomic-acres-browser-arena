/**
 * Tiered aim assist (PASS 84 Lane E). A pure, deterministic look-rate
 * modifier — it never touches damage, spread, hit registration or netcode.
 *
 * Fairness contract (owner, 2026-08-31 / 2026-09-01): a touch player, a pad
 * player and a mouse player share one lobby, so TOUCH gets the strongest
 * assist, PAD sits between touch and mouse, MOUSE gets none.
 *
 * Three components, each documented with its exact curve:
 *
 * 1. Target-proximity slowdown. Let θ be the angular distance (degrees)
 *    between the reticle and the nearest hostile aim point within range.
 *      s = smoothstep(inner, outer, θ)          // 0 inside `inner`, 1 past `outer`
 *      lookRateScale = minScale + (1 - minScale) * s
 *    While aiming down sights the zone shrinks to ADS_ZONE_SCALE of its hip
 *    size because the magnified view already spreads angles across the screen.
 *
 * 2. Strafe friction / magnetism. Only while the player is strafing. The yaw
 *    rate that would keep the current nearest target centred is measured
 *    numerically (target bearing now vs. bearing after one frame of lateral
 *    motion), then a fraction of it is applied inside the zone:
 *      w = 1 - smoothstep(inner, outer, θ)
 *      frictionYaw = clamp(gain * requiredYawRate, ±maxRate) * w
 *    Pitch friction is deliberately zero: strafing does not move a target
 *    vertically, and vertical magnetism reads as the game "pulling".
 *
 * 4. Line of sight. A hostile the player cannot see must not bend his aim, or
 *    the assist reads as the game pulling at nothing. `isVisible` is injected
 *    by the caller (legacy-main tests the eye -> aim-point segment against the
 *    live world colliders) and is evaluated lazily: only a candidate that is
 *    already closer than the best visible one so far pays for the test, so the
 *    common frame costs one segment test, not one per hostile. Callers that
 *    omit the predicate keep the previous no-LOS behaviour.
 *
 * 3. Trigger micro-snap (TOUCH ONLY). On the trigger's press edge, if the
 *    nearest target is inside `snapConeDeg`, the view rotates toward it by at
 *    most `snapMaxDeg`. This is still a look adjustment: the shot the client
 *    sends is the ray of the view after the snap, exactly as it would be for
 *    any other look input. It does not read or alter the hit model.
 *
 * All angles below are in degrees unless the name says radians.
 */

export type AimAssistTier = 'mouse' | 'pad' | 'touch';

export type AimAssistProfile = Readonly<{
  tier: AimAssistTier;
  slowdownInnerDeg: number;
  slowdownOuterDeg: number;
  minLookScale: number;
  frictionGain: number;
  frictionMaxRadPerSec: number;
  snapConeDeg: number;
  snapMaxDeg: number;
  maxRangeM: number;
}>;

export const ADS_ZONE_SCALE = 0.7;
export const STRAFE_ACTIVE_MIN_MPS = 0.35;

export const AIM_ASSIST_PROFILES: Readonly<Record<AimAssistTier, AimAssistProfile>> = Object.freeze({
  mouse: Object.freeze({
    tier: 'mouse', slowdownInnerDeg: 0, slowdownOuterDeg: 0, minLookScale: 1,
    frictionGain: 0, frictionMaxRadPerSec: 0, snapConeDeg: 0, snapMaxDeg: 0, maxRangeM: 0,
  }),
  pad: Object.freeze({
    tier: 'pad', slowdownInnerDeg: 1.6, slowdownOuterDeg: 5.5, minLookScale: 0.55,
    frictionGain: 0.35, frictionMaxRadPerSec: 0.9, snapConeDeg: 0, snapMaxDeg: 0, maxRangeM: 45,
  }),
  touch: Object.freeze({
    tier: 'touch', slowdownInnerDeg: 2.4, slowdownOuterDeg: 8, minLookScale: 0.4,
    frictionGain: 0.6, frictionMaxRadPerSec: 1.4, snapConeDeg: 2, snapMaxDeg: 0.8, maxRangeM: 45,
  }),
});

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type AimAssistTarget = Readonly<{
  /** World-space aim point (upper chest) of one hostile combatant. */
  point: Vec3;
  id?: string;
}>;

export type AimAssistInput = Readonly<{
  tier: AimAssistTier;
  eye: Vec3;
  yaw: number;
  pitch: number;
  ads: boolean;
  /** Player horizontal velocity in world metres/second (x, z). */
  velocity: Readonly<{ x: number; z: number }>;
  dt: number;
  targets: readonly AimAssistTarget[];
  /**
   * Optional line-of-sight predicate. Called at most once per candidate that
   * improves on the nearest visible target found so far. Omit it to keep the
   * pre-2026-09-02 behaviour (assist through walls).
   */
  isVisible?: (target: AimAssistTarget) => boolean;
}>;

export type AimAssistResult = Readonly<{
  tier: AimAssistTier;
  lookRateScale: number;
  /** Signed yaw rate (radians/second, positive increases `yaw`) to add to the look integration. */
  frictionYawRadPerSec: number;
  nearestAngleDeg: number | null;
  nearestTargetId: string | null;
  strafing: boolean;
}>;

export const NO_AIM_ASSIST: AimAssistResult = Object.freeze({
  tier: 'mouse', lookRateScale: 1, frictionYawRadPerSec: 0, nearestAngleDeg: null, nearestTargetId: null, strafing: false,
});

const RAD_TO_DEG = 180 / Math.PI;

export function wrapRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Bearing (yaw, pitch) from `eye` to `point` in the game's YXZ camera convention. */
export function bearingTo(eye: Vec3, point: Vec3): Readonly<{ yaw: number; pitch: number; distance: number }> {
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const horizontal = Math.hypot(dx, dz);
  return Object.freeze({
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, horizontal),
    distance: Math.hypot(dx, dy, dz),
  });
}

/** Angular distance in degrees between the view (yaw, pitch) and a bearing. */
export function angularDistanceDeg(yaw: number, pitch: number, bearing: Readonly<{ yaw: number; pitch: number }>): number {
  const deltaYaw = wrapRadians(bearing.yaw - yaw) * Math.cos(pitch);
  const deltaPitch = bearing.pitch - pitch;
  return Math.hypot(deltaYaw, deltaPitch) * RAD_TO_DEG;
}

type MutableBearing = { yaw: number; pitch: number; distance: number };
type NearestTarget = { index: number; angleDeg: number; bearing: MutableBearing; target: AimAssistTarget };

const NULL_TARGET: AimAssistTarget = Object.freeze({ point: Object.freeze({ x: 0, y: 0, z: 0 }) });

/**
 * Scratch records. `nearestTarget()` runs every frame a pad or touch overlay is
 * live, so it writes into these instead of allocating a bearing per hostile and
 * a frozen result per improving candidate. The returned record is only valid
 * until the next call, and both callers consume it synchronously.
 */
const bearingScratch: MutableBearing = { yaw: 0, pitch: 0, distance: 0 };
const nearestScratch: NearestTarget = {
  index: -1, angleDeg: 0, bearing: { yaw: 0, pitch: 0, distance: 0 }, target: NULL_TARGET,
};

function writeBearing(out: MutableBearing, eye: Vec3, point: Vec3): MutableBearing {
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  out.distance = Math.hypot(dx, dy, dz);
  return out;
}

function nearestTarget(input: AimAssistInput, maxRangeM: number): NearestTarget | null {
  let found = false;
  const targets = input.targets;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const bearing = writeBearing(bearingScratch, input.eye, target.point);
    if (!Number.isFinite(bearing.distance) || bearing.distance <= 0.05 || bearing.distance > maxRangeM) continue;
    const angleDeg = angularDistanceDeg(input.yaw, input.pitch, bearing);
    if (!Number.isFinite(angleDeg)) continue;
    if (found && angleDeg >= nearestScratch.angleDeg) continue;
    // Last, so an occlusion test costs once per improving candidate.
    if (input.isVisible && !input.isVisible(target)) continue;
    found = true;
    nearestScratch.index = index;
    nearestScratch.angleDeg = angleDeg;
    nearestScratch.bearing.yaw = bearing.yaw;
    nearestScratch.bearing.pitch = bearing.pitch;
    nearestScratch.bearing.distance = bearing.distance;
    nearestScratch.target = target;
  }
  return found ? nearestScratch : null;
}

export function evaluateAimAssist(input: AimAssistInput): AimAssistResult {
  const profile = AIM_ASSIST_PROFILES[input.tier];
  if (profile.minLookScale >= 1 && profile.frictionGain <= 0) return Object.freeze({ ...NO_AIM_ASSIST, tier: input.tier });
  if (![input.yaw, input.pitch, input.dt].every(Number.isFinite)) return Object.freeze({ ...NO_AIM_ASSIST, tier: input.tier });
  const nearest = nearestTarget(input, profile.maxRangeM);
  const lateralSpeed = Math.hypot(input.velocity.x, input.velocity.z);
  const strafing = lateralSpeed >= STRAFE_ACTIVE_MIN_MPS;
  if (!nearest) {
    return Object.freeze({ tier: input.tier, lookRateScale: 1, frictionYawRadPerSec: 0, nearestAngleDeg: null, nearestTargetId: null, strafing });
  }
  const zoneScale = input.ads ? ADS_ZONE_SCALE : 1;
  const inner = profile.slowdownInnerDeg * zoneScale;
  const outer = profile.slowdownOuterDeg * zoneScale;
  const s = smoothstep(inner, outer, nearest.angleDeg);
  const lookRateScale = profile.minLookScale + (1 - profile.minLookScale) * s;
  let frictionYawRadPerSec = 0;
  if (strafing && profile.frictionGain > 0 && s < 1) {
    const dt = Math.max(1e-4, Math.min(0.05, input.dt));
    const movedEye: Vec3 = { x: input.eye.x + input.velocity.x * dt, y: input.eye.y, z: input.eye.z + input.velocity.z * dt };
    const bearingAfter = bearingTo(movedEye, nearest.target.point);
    const requiredYawRate = wrapRadians(bearingAfter.yaw - nearest.bearing.yaw) / dt;
    const weight = 1 - s;
    const scaled = profile.frictionGain * requiredYawRate;
    frictionYawRadPerSec = Math.max(-profile.frictionMaxRadPerSec, Math.min(profile.frictionMaxRadPerSec, scaled)) * weight;
  }
  return Object.freeze({
    tier: input.tier,
    lookRateScale,
    frictionYawRadPerSec,
    nearestAngleDeg: nearest.angleDeg,
    nearestTargetId: nearest.target.id ?? null,
    strafing,
  });
}

export type TriggerSnapInput = Readonly<{
  tier: AimAssistTier;
  eye: Vec3;
  yaw: number;
  pitch: number;
  targets: readonly AimAssistTarget[];
  /** Same lazy line-of-sight predicate as `AimAssistInput`. */
  isVisible?: (target: AimAssistTarget) => boolean;
}>;

export type TriggerSnapResult = Readonly<{ yaw: number; pitch: number; snappedDeg: number; targetId: string | null }>;

/**
 * Trigger-press micro-snap. Returns the (possibly unchanged) view. Only the
 * touch profile has a non-zero cone, so pad and mouse always pass through.
 */
export function applyTriggerSnap(input: TriggerSnapInput): TriggerSnapResult {
  const profile = AIM_ASSIST_PROFILES[input.tier];
  const passthrough: TriggerSnapResult = Object.freeze({ yaw: input.yaw, pitch: input.pitch, snappedDeg: 0, targetId: null });
  if (profile.snapConeDeg <= 0 || profile.snapMaxDeg <= 0) return passthrough;
  const nearest = nearestTarget({ ...input, ads: false, velocity: { x: 0, z: 0 }, dt: 1 / 60 }, profile.maxRangeM);
  if (!nearest || nearest.angleDeg > profile.snapConeDeg || nearest.angleDeg <= 1e-6) return passthrough;
  const fraction = Math.min(1, profile.snapMaxDeg / nearest.angleDeg);
  const deltaYaw = wrapRadians(nearest.bearing.yaw - input.yaw) * fraction;
  const deltaPitch = (nearest.bearing.pitch - input.pitch) * fraction;
  return Object.freeze({
    yaw: input.yaw + deltaYaw,
    pitch: Math.max(-1.42, Math.min(1.42, input.pitch + deltaPitch)),
    snappedDeg: Math.min(nearest.angleDeg, profile.snapMaxDeg),
    targetId: nearest.target.id ?? null,
  });
}
