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
 *
 * HF-395 (2026-09-02), the second measurement, with the instrument's stance
 * defect fixed (it had been sampling every "prone" and "stand" row airborne at
 * eye height 1.8 m, so the floor plane never engaged in any stance):
 *
 *  - Standing on flat ground looking down, the arms sleeve reached 0.49 m BELOW
 *    the floor. The floor plane was refused because the eye was 1.84 m up and
 *    the wall reach is 1.4 m - but the rig, pitched down, reaches ~2.1 m. The
 *    ground gets its own, longer reach.
 *  - At the Nuke Town garage door, 89% of the rig's vertices were cut: a box
 *    whose top sat 0.08 m under the eye offered its TOP as the nearest
 *    separating face, and a plane at eye level keeps nothing of a rig that
 *    hangs below the eye. A top face that close is BESIDE the rig, not under
 *    it: it is no longer a separating face.
 *  - In the bus/van gap two near-coplanar ceilings 0.03 m apart took two of
 *    the four slots, and the wall the rig was actually inside (0.87 m away)
 *    was dropped. Planes with the same normal are nested half-spaces, so only
 *    the nearest one can ever matter: one plane per axis-aligned normal, and
 *    six slots so nothing is ever dropped. Six is still a FIXED count.
 *
 * HF-395 REPAIR (2026-09-02), after review: the z-fight bias was applied at its
 * full 12 mm however close the face was, so a face the eye was 5 mm outside of
 * produced a plane 7 mm PAST the eye. The kept half-space then excluded the eye
 * itself, and with it every vertex of a rig that hangs around the eye - the
 * whole weapon vanishes while brushing a wall. The bias is now clamped to half
 * the eye's own distance outside the face, which makes
 *
 *     signedDistance(plane, eye) >= eyeDistanceMeters / 2 > 0
 *
 * an invariant of every plane this module returns, for every input. See
 * `viewmodel-surface-clip.test.ts`, "never returns a plane that cuts the eye".
 */

import type { Box2, Point3 } from '../collision';

export const VIEWMODEL_SURFACE_CLIP_CONTRACT = 'viewmodel-surface-aligned-clip-v3' as const;

/**
 * How many surface planes the rig can be cut by at once.
 *
 * Every candidate is an axis-aligned face, so there are exactly six possible
 * normals, and two planes with the same normal are nested half-spaces (only the
 * one nearer the eye ever cuts anything). Six slots therefore hold EVERY
 * distinct surface a frame can produce; nothing is ever dropped for lack of a
 * slot, which is what emptied the bus/van gap measurement of its real wall.
 * The count is fixed for the rig's lifetime - that, not the value, is what
 * keeps the material permutation constant.
 */
export const VIEWMODEL_SURFACE_CLIP_PLANE_COUNT = 6;

/**
 * Radius around the eye within which a solid can clip the rig, in metres.
 *
 * The rig reaches about 0.9 m forward and sits 0.33 m to the side, so 1.4 m
 * covers every wall any part of it can reach with margin. Larger would start
 * selecting walls that cannot touch the rig and waste slots on them.
 */
export const VIEWMODEL_SURFACE_CLIP_REACH_METERS = 1.4;

/**
 * How far below the eye the standing surface can be and still get a plane.
 *
 * Measured (HF-395, `artifacts/qa/hf395/diagnose-before-carbine.json`): a
 * standing player (eye 1.84 m up) looking down at flat ground had the arms
 * sleeve 0.49 m below the floor - the pitched rig reaches ~2.1 m from the eye,
 * far beyond the 1.4 m wall reach. 2.4 m admits the floor in every stance and
 * still refuses a floor the player has dropped a storey away from.
 */
export const VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS = 2.4;

/**
 * A top face (normal +Y) nearer than this to the eye is BESIDE the rig, not
 * under it, and is not a separating face.
 *
 * The rig hangs about 0.45 m below the eye in the hip pose, so a plane at a
 * top face 0.08 m under the eye keeps only the scope and cuts the rest - the
 * Nuke Town garage-door case, 13838 of 15538 vertices cut. The face can be no
 * closer than the rig's own hang, so the plane always keeps the rig's body and
 * cuts only what is genuinely beneath the surface.
 */
export const VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS = 0.5;

/**
 * The same rule for a bottom face (normal -Y, a ceiling or overhang): the rig
 * rises about 0.1 m above the eye (a scope at ADS), so a ceiling nearer than
 * this is level with the rig and would cut the optic off the receiver.
 */
export const VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS = 0.12;

/**
 * Metres the plane is pushed OUT of the solid, toward the eye.
 *
 * Cutting exactly on the face leaves the rig's surface coplanar with the wall,
 * which z-fights. A small bias also hides the seam where the cut meets the wall.
 */
export const VIEWMODEL_SURFACE_CLIP_BIAS_METERS = 0.012;

/**
 * The most of the eye's own distance outside a face the bias may consume.
 *
 * A plane must never cross the eye. Every vertex of the rig sits within about a
 * metre of the eye and the great majority of them hang directly around it, so a
 * half-space that excludes the eye excludes essentially the whole weapon: this
 * is the "the gun disappeared" failure, not a clip. Taking at most half of the
 * measured clearance leaves the eye on the kept side by at least the other half,
 * whatever the geometry, while still biasing the cut out of the solid in every
 * case where there is room for the full 12 mm.
 */
export const VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION = 0.5;

/**
 * How far the eye must have risen above the tracked standing surface before
 * that surface is treated as the floor the rig can reach.
 *
 * This used to borrow `..._TOP_FACE_MINIMUM_DEPTH_METERS` (0.5 m), a number
 * measured for BOX TOPS beside the rig, which is a different question: a box
 * top level with the rig is not a separating face at all, whereas the standing
 * surface is a horizontal plane at a fixed world height and cuts exactly what
 * is under the floor no matter how low the eye is. The only thing the minimum
 * has to exclude is a STALE reference - a floor the player has left. Measured
 * (`artifacts/qa/hf395/diagnose-after-v2-carbine.json`) the lowest real eye is
 * prone at 0.762 m above its floor, so 0.15 m keeps 0.6 m of margin for a
 * landing dip, view bob or camera shake that the borrowed 0.5 m did not have.
 */
export const VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS = 0.15;

/**
 * The plane offset actually applied for a face the eye is `outside` metres
 * clear of: the z-fight bias, never more than half that clearance.
 *
 * Returned separately from the plane so the tests can state the invariant in
 * the same terms the module computes it.
 */
export function viewmodelSurfaceClipAppliedBias(outsideMeters: number): number {
  return Math.min(
    VIEWMODEL_SURFACE_CLIP_BIAS_METERS,
    outsideMeters * VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION,
  );
}

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
 * The least distance the eye must be outside a face for that face to count as
 * separating. Side faces need only be outside at all; the vertical faces need
 * the rig's own hang or rise, see the constants above.
 */
function minimumOutside(axis: 0 | 1 | 2, sign: -1 | 1): number {
  if (axis !== 1) return 0;
  return sign > 0
    ? VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS
    : VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS;
}

/**
 * The face of `box` that separates it from `eye`, or null when no face does:
 * the eye is inside the box on every axis (nothing can be clipped against a
 * solid you are standing inside - every choice would cut the whole rig), or
 * the only faces the eye is outside of are a top or bottom too close to be
 * under or over the rig.
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
    // A top or bottom face level with the rig is beside it, not under or over
    // it; the box's side faces (if any) are what the rig runs into.
    if (outside < minimumOutside(axis, sign)) continue;
    if (best !== null && outside >= best.eyeDistanceMeters) continue;
    const normal: Point3 = {
      x: axis === 0 ? sign : 0,
      y: axis === 1 ? sign : 0,
      z: axis === 2 ? sign : 0,
    };
    // The plane sits on the face, biased toward the eye by the z-fight margin.
    // normal . p + constant = 0 with the kept side positive, so the constant is
    // the negated face coordinate along the normal.
    // Clamped so the plane can never reach the eye: see
    // VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION. Full 12 mm whenever the
    // face is more than 24 mm away, which is every ordinary frame.
    const facePosition = bound + sign * viewmodelSurfaceClipAppliedBias(outside);
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

/** Index of a plane's normal among the six axis-aligned faces. */
function normalSlot(normal: Point3): number {
  if (normal.x !== 0) return normal.x < 0 ? 0 : 1;
  if (normal.y !== 0) return normal.y < 0 ? 2 : 3;
  return normal.z < 0 ? 4 : 5;
}

/**
 * The surface planes the rig should be cut by this frame, nearest first.
 *
 * Pure and allocation-light by design: this is called every frame, and the
 * module it replaces part of allocates nothing in the per-frame path.
 *
 * One plane per axis-aligned normal: two planes with the same normal are nested
 * half-spaces, and a vertex the nearer one keeps is always kept by the farther
 * one too, so the farther one can never cut anything the nearer does not. That
 * makes the ground (a +Y plane) and every box top one family, in which the
 * nearest to the eye wins - which is also the most restrictive.
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
  groundReachMeters?: number;
  maximumPlanes?: number;
}>): readonly ViewmodelSurfacePlane[] {
  const reach = input.reachMeters ?? VIEWMODEL_SURFACE_CLIP_REACH_METERS;
  const groundReach = input.groundReachMeters ?? VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS;
  const limit = input.maximumPlanes ?? VIEWMODEL_SURFACE_CLIP_PLANE_COUNT;
  if (limit <= 0) return [];
  // One candidate per normal; a nearer plane with the same normal replaces it.
  const nearestByNormal: Array<ViewmodelSurfacePlane | null> = [null, null, null, null, null, null];
  const offer = (plane: ViewmodelSurfacePlane): void => {
    const slot = normalSlot(plane.normal);
    const held = nearestByNormal[slot];
    if (held === null || held === undefined || plane.eyeDistanceMeters < held.eyeDistanceMeters) {
      nearestByNormal[slot] = plane;
    }
  };

  const groundY = input.groundPlaneY;
  if (groundY !== null && groundY !== undefined && Number.isFinite(groundY)) {
    const above = input.eye.y - groundY;
    // Below its own floor means the reference is stale - walked downstairs,
    // dropped off a ledge. A plane there would cut the whole rig. The minimum
    // is the ground's OWN (see VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS),
    // not the box-top constant it used to borrow.
    if (above >= VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS && above <= groundReach) {
      offer(Object.freeze({
        normal: Object.freeze({ x: 0, y: 1, z: 0 }),
        constant: -(groundY - viewmodelSurfaceClipAppliedBias(above)),
        eyeDistanceMeters: above,
      }));
    }
  }

  const consider = (boxes: readonly Box2[]): void => {
    for (const box of boxes) {
      if (!withinReach(box, input.eye, reach)) continue;
      const plane = separatingFaceFor(box, input.eye);
      if (plane) offer(plane);
    }
  };
  consider(input.colliders);
  if (input.dressingBoxes) consider(input.dressingBoxes);

  // Nearest surface first: purely for diagnostics and for a caller that asks
  // for fewer slots than normals, in which case the ones closest to the eye
  // are the ones the rig can actually be inside.
  const found: ViewmodelSurfacePlane[] = [];
  for (const plane of nearestByNormal) if (plane) found.push(plane);
  found.sort((left, right) => left.eyeDistanceMeters - right.eyeDistanceMeters);
  return found.length > limit ? found.slice(0, limit) : found;
}

/**
 * Gameplay fire admission for the first-person rig. The clipping probe already
 * identifies the world-space half-spaces that can cut the rendered weapon; use
 * the authored muzzle socket against those planes, rather than the collider's
 * class or the conservative camera-forward contact lattice. This keeps stairs
 * and ramps fireable when the muzzle is clear while retaining a real muzzle-in-
 * solid block.
 */
export function viewmodelMuzzleInsideSurfaceClip(
  muzzle: Point3,
  planes: readonly Pick<ViewmodelSurfacePlane, 'normal' | 'constant'>[],
): boolean {
  return planes.some((plane) => (
    plane.normal.x * muzzle.x
      + plane.normal.y * muzzle.y
      + plane.normal.z * muzzle.z
      + plane.constant < 0
  ));
}

export function viewmodelMuzzleFireBlockReason(
  muzzle: Point3 | null,
  planes: readonly Pick<ViewmodelSurfacePlane, 'normal' | 'constant'>[],
): 'viewmodel-muzzle-unavailable' | 'viewmodel-muzzle-clip' | null {
  if (muzzle === null) return 'viewmodel-muzzle-unavailable';
  return viewmodelMuzzleInsideSurfaceClip(muzzle, planes) ? 'viewmodel-muzzle-clip' : null;
}
