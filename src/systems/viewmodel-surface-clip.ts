/**
 * SURFACE-ALIGNED CLIP PLANES FOR THE FIRST-PERSON RIG.
 *
 * WHY THIS EXISTS, measured rather than argued.
 *
 * The viewmodel already had a contact clip: ONE plane, perpendicular to camera
 * forward, placed at the depth where the obstructing surface crosses the view
 * axis. Measured on the live build with
 * `scripts/qa/measure-viewmodel-penetration-cdp.mjs`, which walks every visible
 * viewmodel vertex in world space and reports how deep the deepest one sits
 * inside a solid, standing at the Nuke Town house front wall and turning on the
 * spot:
 *
 *     yaw 150 / 180 / 210  (facing the wall head on)   0.000 m
 *     yaw  30 /  60 /  90  (wall alongside the rig)    0.305 / 0.360 / 0.346 m
 *     yaw 270 / 300 / 330  (wall alongside the rig)    0.333 / 0.304 / 0.257 m
 *
 * Head on it is perfect. Everywhere else it does nothing, and 117 of 183
 * measured poses had weapon or arm geometry inside a solid.
 *
 * That is not a tuning failure, it is the shape of the tool. A plane
 * perpendicular to the view axis can only stand in for a surface that CROSSES
 * the view axis, and `cutDepthFromFaceCrossing` correctly refuses to place one
 * otherwise (`facing > -CUT_FACE_MINIMUM_FACING` returns null). A wall you are
 * walking ALONG never crosses the axis, so it never gets a plane - while the rig
 * sits about a third of a metre to the RIGHT of the eye, straight through it.
 *
 * THE FIX: clip against the surface's OWN plane. A `THREE.Plane` in a clipping
 * group is an arbitrary world-space plane; nothing requires it to face the
 * camera. Taking the face of the solid that separates it from the eye, and
 * keeping the half-space the eye is in, cuts exactly the geometry that is on the
 * far side of a wall - at any angle, and for floors and ceilings too, since
 * those are the same computation with a vertical normal.
 *
 * THE CONSTRAINT THAT SHAPES THE API: three recompiles a material when its
 * clipping state changes, and the NUMBER of clipping planes is part of that
 * state. Growing and shrinking the array per frame would rebuild every
 * viewmodel pipeline on every wall approach - which is precisely the defect
 * fixed on 2026-08-31 that had 85.7% of all pipeline creations landing inside a
 * stall. So the caller keeps a FIXED-LENGTH array and this module fills it,
 * returning how many slots are live; the caller parks the rest.
 */

import type { Box2, Point3 } from '../collision';

export const VIEWMODEL_SURFACE_CLIP_CONTRACT = 'viewmodel-surface-aligned-clip-v1' as const;

/**
 * How many surface planes the rig can be cut by at once. Three covers an inside
 * corner plus its floor, which is the worst real case; a fourth has never been
 * needed in measurement and every slot costs a clipping-plane uniform.
 */
export const VIEWMODEL_SURFACE_CLIP_PLANE_COUNT = 4;

/**
 * Radius around the eye within which a solid can clip the rig, in metres.
 *
 * The rig reaches about 0.9 m forward and sits 0.33 m to the side, so 1.4 m
 * covers every surface any part of it can reach with margin. Larger would start
 * selecting walls that cannot touch the rig and waste the three slots on them.
 */
export const VIEWMODEL_SURFACE_CLIP_REACH_METERS = 1.4;

/**
 * Metres the plane is pushed OUT of the solid, toward the eye.
 *
 * Cutting exactly on the face leaves the rig's surface coplanar with the wall,
 * which z-fights. A small bias also hides the seam where the cut meets the wall.
 */
export const VIEWMODEL_SURFACE_CLIP_BIAS_METERS = 0.012;

export type ViewmodelSurfacePlane = Readonly<{
  /** Unit outward normal of the chosen face; the KEPT half-space contains the eye. */
  normal: Readonly<Point3>;
  /** Plane constant in the `normal . p + constant = 0` convention THREE.Plane uses. */
  constant: number;
  /** Metres from the eye to the face along the normal. Diagnostics and ordering. */
  eyeDistanceMeters: number;
}>;

/** The six axis-aligned outward face normals, as [axis, sign]. */
const FACES: ReadonlyArray<readonly [0 | 1 | 2, -1 | 1]> = Object.freeze([
  [0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1],
]);

function axisValue(point: Point3, axis: 0 | 1 | 2): number {
  return axis === 0 ? point.x : axis === 1 ? point.y : point.z;
}

function boxBound(box: Box2, axis: 0 | 1 | 2, sign: -1 | 1): number {
  if (axis === 0) return sign < 0 ? box.minX : box.maxX;
  if (axis === 2) return sign < 0 ? box.minZ : box.maxZ;
  const low = box.minY ?? Number.NEGATIVE_INFINITY;
  const high = box.maxY ?? Number.POSITIVE_INFINITY;
  return sign < 0 ? low : high;
}

/**
 * The face of `box` that separates it from `eye`, or null when the eye is
 * inside the box on every axis (nothing can be clipped against a solid you are
 * standing inside - every choice would cut the whole rig).
 *
 * "Separating" means a face the eye is OUTSIDE of, and of those, the NEAREST -
 * because that is the surface the rig can actually reach. For a wall to the
 * player's right that is the wall's left-hand face; for the ground it is the top.
 *
 * The nearest rule is not the obvious one and it was got wrong first. Taking the
 * face the eye is FURTHEST outside of looks safer, but a long wall authored as
 * many collider segments then reports each segment's END CAP - the eye is metres
 * beyond a segment's z extent while being centimetres from its side - and the rig
 * gets sliced in open air by a plane cutting across the corridor. The end cap is
 * only ever the nearest face when the player has actually walked past the end of
 * the wall, which is exactly when it IS the surface facing them.
 */
export function separatingFaceFor(box: Box2, eye: Point3): ViewmodelSurfacePlane | null {
  // Oriented boxes need the collider's own frame to derive a face, which this
  // module cannot reach. Skipping is conservative: no plane, no wrong cut.
  if (box.rotation) return null;
  let best: ViewmodelSurfacePlane | null = null;
  for (const [axis, sign] of FACES) {
    const bound = boxBound(box, axis, sign);
    if (!Number.isFinite(bound)) continue;
    // Signed distance of the eye outside this face. Positive means the eye is
    // on the outside of it, which is the only case a plane can separate.
    const outside = sign > 0 ? axisValue(eye, axis) - bound : bound - axisValue(eye, axis);
    if (outside <= 0) continue;
    if (best !== null && outside >= best.eyeDistanceMeters) continue;
    const normal: Point3 = {
      x: axis === 0 ? sign : 0,
      y: axis === 1 ? sign : 0,
      z: axis === 2 ? sign : 0,
    };
    // The plane sits on the face, biased toward the eye by the z-fight margin.
    // normal . p + constant = 0 with the kept side positive, so the constant is
    // the negated face coordinate along the normal.
    const facePosition = bound + sign * VIEWMODEL_SURFACE_CLIP_BIAS_METERS;
    best = Object.freeze({
      normal: Object.freeze(normal),
      constant: -(sign * facePosition),
      eyeDistanceMeters: outside,
    });
  }
  return best;
}

/** True when any part of `box` lies within `reach` of `eye`. */
function withinReach(box: Box2, eye: Point3, reach: number): boolean {
  const dx = Math.max(box.minX - eye.x, 0, eye.x - box.maxX);
  const dz = Math.max(box.minZ - eye.z, 0, eye.z - box.maxZ);
  const low = box.minY ?? Number.NEGATIVE_INFINITY;
  const high = box.maxY ?? Number.POSITIVE_INFINITY;
  const dy = Math.max(Number.isFinite(low) ? low - eye.y : 0, 0, Number.isFinite(high) ? eye.y - high : 0);
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}

/**
 * The surface planes the rig should be cut by this frame, nearest first.
 *
 * Pure and allocation-light by design: this is called every frame, and the
 * module it replaces part of allocates nothing in the per-frame path.
 *
 * Returns at most `VIEWMODEL_SURFACE_CLIP_PLANE_COUNT`. Fewer means the caller
 * parks the remaining slots - it must NOT shorten the array.
 */
export function viewmodelSurfaceClipPlanes(input: Readonly<{
  eye: Point3;
  colliders: readonly Box2[];
  dressingBoxes?: readonly Box2[];
  /**
   * World Y of the surface the player is standing on, when known.
   *
   * THE GROUND IS NOT A COLLIDER. Most authored floors and all procedural
   * terrain are raycast surfaces, not boxes, so no box face can ever describe
   * them - which is why the arena with the owner's reported problem
   * (sloped grass, looking down) measured ZERO box penetrations and 36 poses
   * with weapon geometry below the standing surface. A horizontal plane at the
   * standing height is the cheapest exact answer for the flat case and a strict
   * improvement on the sloped one.
   */
  groundPlaneY?: number | null;
  reachMeters?: number;
  maximumPlanes?: number;
}>): readonly ViewmodelSurfacePlane[] {
  const reach = input.reachMeters ?? VIEWMODEL_SURFACE_CLIP_REACH_METERS;
  const limit = input.maximumPlanes ?? VIEWMODEL_SURFACE_CLIP_PLANE_COUNT;
  if (limit <= 0) return [];
  const found: ViewmodelSurfacePlane[] = [];

  // The ground goes in FIRST so that when there are more surfaces than slots it
  // is never the one dropped: a weapon through the floor is visible on every
  // frame the player looks down, while a third wall is a corner case.
  const groundY = input.groundPlaneY;
  if (groundY !== null && groundY !== undefined && Number.isFinite(groundY)) {
    const above = input.eye.y - groundY;
    // Below its own floor means the reference is stale - walked downstairs,
    // dropped off a ledge. A plane there would cut the whole rig.
    if (above > 0 && above <= reach) {
      found.push(Object.freeze({
        normal: Object.freeze({ x: 0, y: 1, z: 0 }),
        constant: -(groundY - VIEWMODEL_SURFACE_CLIP_BIAS_METERS),
        eyeDistanceMeters: above,
      }));
    }
  }

  const consider = (boxes: readonly Box2[]): void => {
    for (const box of boxes) {
      if (!withinReach(box, input.eye, reach)) continue;
      const plane = separatingFaceFor(box, input.eye);
      if (!plane) continue;
      // Deduplicate coplanar faces: a wall split into many collider segments
      // yields the same plane many times and would spend every slot on one
      // surface. Same normal and effectively the same constant is one plane.
      const duplicate = found.some((existing) => existing.normal.x === plane.normal.x
        && existing.normal.y === plane.normal.y
        && existing.normal.z === plane.normal.z
        && Math.abs(existing.constant - plane.constant) < 1e-4);
      if (duplicate) continue;
      found.push(plane);
    }
  };
  consider(input.colliders);
  if (input.dressingBoxes) consider(input.dressingBoxes);

  // Nearest surface first: with more candidates than slots, the ones closest to
  // the eye are the ones the rig can actually be inside.
  // Nearest surface first, EXCEPT the ground, which was pushed first and stays
  // first: a weapon through the floor shows every time the player looks down.
  const groundCount = found.length > 0 && found[0]!.normal.y === 1 && found[0]!.normal.x === 0 ? 1 : 0;
  const rest = found.slice(groundCount);
  rest.sort((left, right) => left.eyeDistanceMeters - right.eyeDistanceMeters);
  const ordered = [...found.slice(0, groundCount), ...rest];
  return ordered.length > limit ? ordered.slice(0, limit) : ordered;
}
