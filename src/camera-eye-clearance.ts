// Owner 2026-08-29: "ensure there is no clipping when near walls or prone,
// longtime issue which was fixed once then regressed, needs to be present
// across all maps."
//
// The eye-clearance sweep (docs/eye-clearance/ledger.json) proves the arenas
// still contain LEGAL positions where the first-person eye sits closer to a
// solid surface than the near plane + head-bob margin (worst class: house
// access-ramp flanks on atomic-acres, d = 0.028-0.142 m, all stances). Every
// prior fix attacked individual geometry; this module is the general,
// per-frame answer: after the camera is seated, short probes measure the
// distance to solid colliders around the eye and push the eye out of any
// surface closer than the clearance radius. Presentation-only - the player
// capsule, shot rays (built from player.yaw/pitch), and authority positions
// are untouched.

import { segmentBoxHitTime, type Box2, type Point3 } from './collision';

/** Distance to the nearest solid surface from `start` along `direction`
 * (unit), or null when nothing lies within `maxM`. The runtime supplies the
 * canonical ballistic-surface trace here - the same surface set the
 * eye-clearance sweep measures - because the felt clipping class is visual
 * geometry protruding PAST the movement colliders (ramp flanks, airstair
 * bellies); a collider-only probe cannot see it. */
export type EyeClearanceHit = Readonly<{
  /** Distance to the surface entry along the probe (0 = start is inside). */
  entryM: number;
  /** Distance to where the probe exits the surface volume (clamped to the
   * probe range when the segment ends inside). */
  exitM: number;
}>;
export type EyeClearanceProbe = (start: Readonly<Point3>, direction: Readonly<Point3>, maxM: number) => EyeClearanceHit | null;

/** Minimum clear distance between the eye and any solid surface. The sweep
 * probes at 0.15 m (near plane 0.08 + bob + margin); matching it here means
 * a clean resolve drives the live sweep's violation count to zero. */
export const EYE_CLEARANCE_RADIUS_M = 0.15;

/** Cap on how far the resolve may move the eye from its authored seat. The
 * worst measured penetration class is 0.122 m inside the radius; the cap
 * leaves headroom without ever teleporting the view. */
export const EYE_CLEARANCE_MAX_PUSH_M = 0.34;

/** Depenetration only engages for SHALLOW volume intrusions - a fringe of
 * solid geometry poking past its movement collider. An eye deeper inside a
 * volume than this is a legitimately enterable fixture; shoving the camera
 * out of one would fight the level design. */
export const EYE_DEPENETRATION_LIMIT_M = 0.4;

const INV_SQRT2 = Math.SQRT1_2;

/** Probe directions: the horizontal ring (violations are wall/flank hugs),
 * the four horizontal diagonals (corner pockets), straight up (sloped ramp
 * undersides over the head) and straight down (floors; this resolve runs
 * AFTER the fixed floor standoff and owns the final say, so it must respect
 * floors itself when it pushes down off a ceiling). */
const PROBE_DIRECTIONS: ReadonlyArray<Point3> = Object.freeze([
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  { x: INV_SQRT2, y: 0, z: INV_SQRT2 }, { x: -INV_SQRT2, y: 0, z: INV_SQRT2 },
  { x: INV_SQRT2, y: 0, z: -INV_SQRT2 }, { x: -INV_SQRT2, y: 0, z: -INV_SQRT2 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
]);

export type EyeClearanceResult = Readonly<{
  x: number;
  y: number;
  z: number;
  /** Total distance the eye was moved (0 = seat was already clear). */
  pushedM: number;
}>;

/**
 * Push `eye` so no collider surface lies within `radiusM` of it along the
 * probe directions. Two relaxation passes settle corner pockets where the
 * first push exposes a second surface. Pure: inputs are not mutated.
 */
export function resolveEyeClearance(
  eye: Readonly<Point3>,
  probe: EyeClearanceProbe,
  radiusM = EYE_CLEARANCE_RADIUS_M,
  maxPushM = EYE_CLEARANCE_MAX_PUSH_M,
): EyeClearanceResult {
  let x = eye.x;
  let y = eye.y;
  let z = eye.z;
  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    let inside = false;
    for (const direction of PROBE_DIRECTIONS) {
      const hit = probe({ x, y, z }, direction, radiusM);
      if (hit === null || hit.entryM >= radiusM) continue;
      if (hit.entryM <= 1e-6) {
        // Start is inside the volume - entry pushes cancel in opposite
        // directions; handled by depenetration below.
        inside = true;
        continue;
      }
      const push = radiusM - hit.entryM;
      if (push <= 1e-6) continue;
      x -= direction.x * push;
      y -= direction.y * push;
      z -= direction.z * push;
      moved = true;
    }
    if (inside && !moved) {
      // Depenetrate through the NEAREST face: probe the exits and step out
      // along the direction with the smallest one, then keep clearance.
      let bestDirection: Point3 | null = null;
      let bestExit = EYE_DEPENETRATION_LIMIT_M;
      for (const direction of PROBE_DIRECTIONS) {
        const hit = probe({ x, y, z }, direction, EYE_DEPENETRATION_LIMIT_M);
        if (hit === null || hit.entryM > 1e-6) continue;
        if (hit.exitM < bestExit) {
          bestExit = hit.exitM;
          bestDirection = direction;
        }
      }
      if (bestDirection) {
        x += bestDirection.x * (bestExit + radiusM);
        y += bestDirection.y * (bestExit + radiusM);
        z += bestDirection.z * (bestExit + radiusM);
        moved = true;
      }
    }
    if (!moved) break;
  }
  let pushedM = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
  if (pushedM > maxPushM) {
    const scale = maxPushM / pushedM;
    x = eye.x + (x - eye.x) * scale;
    y = eye.y + (y - eye.y) * scale;
    z = eye.z + (z - eye.z) * scale;
    pushedM = maxPushM;
  }
  return Object.freeze({ x, y, z, pushedM });
}

/** Builds a probe over box colliders (unit tests, offline sweeps). */
export function boxColliderProbe(colliders: ReadonlyArray<Box2>): EyeClearanceProbe {
  return (start, direction, maxM) => {
    const end = {
      x: start.x + direction.x * maxM,
      y: start.y + direction.y * maxM,
      z: start.z + direction.z * maxM,
    };
    let best: EyeClearanceHit | null = null;
    for (const box of colliders) {
      const entry = segmentBoxHitTime(start, end, box, 0);
      if (entry === null) continue;
      // Exit: cast the reversed segment; its hit time locates the far face.
      const reverse = segmentBoxHitTime(end, start, box, 0);
      const exitM = reverse === null ? maxM : maxM * (1 - reverse);
      const hit = { entryM: entry * maxM, exitM };
      if (best === null || hit.entryM < best.entryM) best = hit;
    }
    return best;
  };
}
