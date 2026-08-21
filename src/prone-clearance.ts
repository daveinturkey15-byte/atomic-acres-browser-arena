// HF-345: clipping when prone and near walls in many maps.
//
// The prone authority capsule is tiny (halfHeight 0.02, radius 0.36), but the
// prone presentation rotates the full operator rig about a pelvis pivot, so the
// visible body can extend roughly 0.85 m forward/backward from the pivot.
//
// This module is a PURE consultative helper: it measures how much room the
// presentation has along the body yaw axis before it would intersect world
// colliders. It does NOT move the player, change the capsule, or make any
// authority decision. A later consumer will use these clearances to choose an
// adjusted pose/offset.

import { segmentBoxHitTime, segmentIntersectsBox, type Box2, type Point3 } from './collision';

/**
 * Prone body presentation envelope, measured from the pelvis pivot.
 *
 * These are approximations derived from the rigged operator skeleton. The
 * pivot sits ~0.43 m above the ground when prone, and the torso+head reach
 * forward while the legs reach backward. Total visual length is ~1.7 m.
 */
export const PRONE_PRESENTATION_ENVELOPE = Object.freeze({
  /** Distance the head/torso extend forward of the pelvis pivot (m). */
  forwardM: 0.82,
  /** Distance the legs extend backward of the pelvis pivot (m). */
  backwardM: 0.88,
  /** Half-thickness of the prone body used for side-clearance probes (m). */
  halfThicknessM: 0.16,
  /** Pelvis pivot height above the ground when prone (m). */
  pivotHeightM: 0.43,
});

/** Clearance returned by {@link proneBodyClearance}. */
export type ProneBodyClearance = Readonly<{
  /** Unobstructed distance forward of the pivot along the body axis (m). */
  forwardM: number;
  /** Unobstructed distance backward of the pivot along the body axis (m). */
  backwardM: number;
  /** True when there is so little room the pose is visibly clipped. */
  clipped: boolean;
}>;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function yawDirection(yaw: number): Point3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

function yawRight(yaw: number): Point3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/**
 * Measures presentation clearance for a prone operator lying at `position`
 * with body axis `yaw`.
 *
 * @param position World-space pelvis/authority position (usually the player
 *   capsule centre). Only x and z are used; y is taken from the prone pivot
 *   height because the body lies horizontally at that height.
 * @param yaw Body yaw in radians. 0 means facing +Z, π/2 means facing +X.
 * @param colliders Axis-aligned or rotated solid box colliders to test against.
 * @returns Forward and backward clearance along the body axis, in metres, plus
 *   a clipped flag for quick consumers.
 *
 * The function is pure: no side effects, no mutations of inputs, no gameplay
 * authority change. It reuses the same segment/box primitive
 * (`segmentIntersectsBox`) that killstreak line-of-sight uses.
 */
export function proneBodyClearance(
  position: Readonly<Point3>,
  yaw: number,
  colliders: ReadonlyArray<Box2>,
): ProneBodyClearance {
  const safePosition = {
    x: finiteOr(position.x, 0),
    y: finiteOr(position.y, PRONE_PRESENTATION_ENVELOPE.pivotHeightM),
    z: finiteOr(position.z, 0),
  };
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;

  const pivot: Point3 = {
    x: safePosition.x,
    y: PRONE_PRESENTATION_ENVELOPE.pivotHeightM,
    z: safePosition.z,
  };

  const forwardDir = yawDirection(safeYaw);
  const rightDir = yawRight(safeYaw);
  const halfThick = PRONE_PRESENTATION_ENVELOPE.halfThicknessM;

  // We cast three probes along the body axis (centre, left flank, right flank)
  // so the clearance reflects the true width of the body, not just a single
  // centre line. The worst (smallest) of the three probes becomes the reported
  // clearance.
  const probes = [
    { lateralX: 0, lateralZ: 0 },
    { lateralX: rightDir.x * halfThick, lateralZ: rightDir.z * halfThick },
    { lateralX: -rightDir.x * halfThick, lateralZ: -rightDir.z * halfThick },
  ];

  const maxForward = PRONE_PRESENTATION_ENVELOPE.forwardM as number;
  const maxBackward = PRONE_PRESENTATION_ENVELOPE.backwardM as number;

  let bestForward = maxForward;
  let bestBackward = maxBackward;

  for (const probe of probes) {
    const start: Point3 = {
      x: pivot.x + probe.lateralX,
      y: pivot.y,
      z: pivot.z + probe.lateralZ,
    };

    // Forward probe: from pivot toward head.
    const forwardEnd: Point3 = {
      x: start.x + forwardDir.x * maxForward,
      y: start.y,
      z: start.z + forwardDir.z * maxForward,
    };
    const forwardHit = firstBoxHitTime(start, forwardEnd, colliders);
    const forwardClear = forwardHit === null ? maxForward : forwardHit * maxForward;

    // Backward probe: from pivot toward feet.
    const backwardEnd: Point3 = {
      x: start.x - forwardDir.x * maxBackward,
      y: start.y,
      z: start.z - forwardDir.z * maxBackward,
    };
    const backwardHit = firstBoxHitTime(start, backwardEnd, colliders);
    const backwardClear = backwardHit === null ? maxBackward : backwardHit * maxBackward;

    if (forwardClear < bestForward) bestForward = forwardClear;
    if (backwardClear < bestBackward) bestBackward = backwardClear;
  }

  // Numerical guard: tiny negative values can appear when a probe starts
  // fractionally inside a collider due to authority/collision tolerance.
  bestForward = Math.max(0, bestForward);
  bestBackward = Math.max(0, bestBackward);

  const clipped = bestForward < maxForward || bestBackward < maxBackward;

  return Object.freeze({
    forwardM: bestForward,
    backwardM: bestBackward,
    clipped,
  });
}

function firstBoxHitTime(
  start: Point3,
  end: Point3,
  colliders: ReadonlyArray<Box2>,
): number | null {
  let first: number | null = null;
  for (const box of colliders) {
    // segmentIntersectsBox is the exact 3D segment/box primitive used by
    // killstreakLineOfSight in legacy-main.ts. We pass padding 0 because
    // clearance is a geometric measurement: we want the distance to the actual
    // collider surface, not the gameplay "graze" tolerance used for LOS.
    if (!segmentIntersectsBox(start, end, box, 0)) continue;
    const time = segmentBoxHitTime(start, end, box, 0);
    if (time !== null && (first === null || time < first)) first = time;
  }
  return first;
}
