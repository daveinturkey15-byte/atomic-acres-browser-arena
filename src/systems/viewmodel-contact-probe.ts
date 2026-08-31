/**
 * Viewmodel CONTACT PROBING - the nine-sample camera-forward lattice that
 * decides how far the on-screen weapon folds away from world geometry.
 *
 * Owner 2026-08-30: "gun still clips through walls and floor". The lattice had
 * two copies in legacy-main - the live pose path and the HF-343 fire-admission
 * diagnostics - and they had already drifted (the diagnostic copy never saw
 * dressing geometry or the analytic ground clamp), so the tool built to
 * explain a contact refusal was measuring a different world than the refusal.
 *
 * This module owns the lattice once. Everything it needs is a parameter: the
 * weapon, the camera-space pose, the collider sets and the stance facts. It
 * never imports legacy-main, never reads ambient state, and needs no DOM and
 * no renderer, so both the wall fold and the floor clamp are unit-testable.
 *
 * Authority boundary, unchanged and load-bearing: `colliders` are the
 * authoritative movement boxes that BOTH the pose fold and the fire gate see;
 * `dressingBoxes` are decoration that may bend the gun on screen and must
 * never reach the trigger. Callers keep those two sets apart.
 */
import * as THREE from 'three';
import { firstSegmentBoxHit, type Box2, type Point3 } from '../collision';
import type { WeaponId } from '../protocol';
import {
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  VIEWMODEL_CONTACT_PROFILES,
  viewmodelContactProbePaddingMeters,
  viewmodelFloorClearance,
  viewmodelObstructionPose,
  viewmodelProbeLattice,
  type ViewmodelContactEnvelope,
  type ViewmodelContactProbeOffset,
  type ViewmodelContactProfile,
  type ViewmodelObstructionPose,
  type ViewmodelProbeLattice,
} from '../weapon-presentation-state';

/** Downward floor probe length, and the padding it sweeps with. */
const FLOOR_PROBE_LENGTH_METERS = 1.05;
const FLOOR_PROBE_PADDING_METERS = 0.035;
/**
 * A forward probe is only clamped against the stance ground plane once it is
 * meaningfully down-pitched; near the horizon the analytic distance explodes.
 */
const GROUND_CLAMP_MIN_DOWN_COMPONENT = 0.001;

/**
 * A contact surface only places the CUT when the view axis meets it at least
 * this squarely. `forward . normal` is -1 for a wall faced head-on and 0 for a
 * wall running exactly alongside the view axis; below this the crossing point
 * runs away to infinity and the surface is one a camera-perpendicular plane
 * cannot represent at all.
 */
const CUT_FACE_MINIMUM_FACING = 1e-3;
/** Axis-aligned face normals, indexed as (axis, sign) by the slab entry test. */
const CUT_FACE_NORMALS: readonly (readonly [number, number, number])[] = Object.freeze([
  Object.freeze([1, 0, 0] as const), Object.freeze([-1, 0, 0] as const),
  Object.freeze([0, 1, 0] as const), Object.freeze([0, -1, 0] as const),
  Object.freeze([0, 0, 1] as const), Object.freeze([0, 0, -1] as const),
]);

/** Where the camera is and which way it looks, plus the world it looks into. */
export type ViewmodelContactProbeInput = Readonly<{
  weapon: WeaponId;
  /** Camera/eye position, not the capsule foot. */
  position: Point3;
  yaw: number;
  pitch: number;
  /** Authoritative movement colliders. Seen by the pose fold and the fire gate. */
  colliders: readonly Box2[];
  /** Pose-only dressing AABBs. Bends the gun, never refuses the trigger. */
  dressingBoxes: readonly Box2[];
  /**
   * MEASURED rig envelope. Presentation-only, and deliberately optional.
   *
   * With it absent the lattice is the authored profile centred on the eye -
   * the exact volume the HF-343 fire gate has always sampled, unchanged. With
   * it present the lattice covers the volume the weapon is actually in and
   * reaches as far as the weapon actually reaches. Only the POSE path passes
   * it; the fire path must keep seeing the authored numbers.
   */
  envelope?: ViewmodelContactEnvelope | null;
}>;

/** One lattice sample, with the two collider sets kept separable. */
export type ViewmodelContactProbeSample = Readonly<{
  offset: ViewmodelContactProbeOffset;
  /** Metres along the probe to the nearest movement collider, or null. */
  colliderMeters: number | null;
  /** The movement collider that produced `colliderMeters`, for diagnostics. */
  colliderBox: Box2 | null;
  /** Metres along the probe to the nearest dressing box, or null. */
  dressingMeters: number | null;
  /** The dressing box that produced `dressingMeters`. Places the cut plane. */
  dressingBox: Box2 | null;
}>;

export type ViewmodelContactProbeSweep = Readonly<{
  profile: ViewmodelContactProfile;
  probePaddingMeters: number;
  /** Camera-forward Y. The ground clamp needs its sign and magnitude. */
  forwardY: number;
  /** The lattice that was actually walked - authored profile or measured rig. */
  lattice: ViewmodelProbeLattice;
  samples: readonly ViewmodelContactProbeSample[];
}>;

/** Everything the full obstruction pose needs on top of the lattice. */
export type ViewmodelObstructionPoseInput = ViewmodelContactProbeInput & Readonly<{
  grounded: boolean;
  prone: boolean;
  /** stanceEyeHeight(stance): the analytic ground plane and floor fallback. */
  stanceEyeHeightMeters: number;
}>;

/** What `forEachContactProbe` reports once the lattice has been walked. */
type ContactProbeFrame = Readonly<{
  profile: ViewmodelContactProfile;
  probePaddingMeters: number;
  forwardY: number;
  lattice: ViewmodelProbeLattice;
}>;

// Retained scratch for the per-frame path. These are written and read inside a
// single synchronous call and carry nothing between calls; they exist so the
// pose does not allocate five vectors every frame, exactly as legacy-main did.
const probeDirection = new THREE.Vector3();
const probeRight = new THREE.Vector3();
const probeUp = new THREE.Vector3();
const probeStart = new THREE.Vector3();
const probeEnd = new THREE.Vector3();
const probeRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const probeCorner = new THREE.Vector3();
const probeVolumeMin = new THREE.Vector3();
const probeVolumeMax = new THREE.Vector3();
const nearbyColliders: Box2[] = [];
const nearbyDressing: Box2[] = [];
const cutBoxMinimum = [0, 0, 0];
const cutBoxMaximum = [0, 0, 0];
const cutProbeOrigin = [0, 0, 0];
const cutProbeDirection = [0, 0, 0];

/**
 * Discards boxes no probe in this lattice can reach, before the nine segment
 * sweeps rather than inside each of them.
 *
 * EXACT, not approximate: any box a probe can hit must overlap the AABB of the
 * whole swept lattice, so this changes no result - it only stops the dressing
 * set (88 boxes on atomic-acres once the batched art layer became visible to
 * the fold) being walked nine times per sweep.
 */
function boxesInsideProbeVolume(boxes: readonly Box2[], out: Box2[]): readonly Box2[] {
  if (boxes.length <= 24) return boxes;
  out.length = 0;
  for (const box of boxes) {
    if (box.maxX < probeVolumeMin.x || box.minX > probeVolumeMax.x) continue;
    // minY/maxY are optional on Box2: an absent bound means the box is
    // unbounded on Y, so it can never be culled on Y.
    if (box.maxY !== undefined && box.maxY < probeVolumeMin.y) continue;
    if (box.minY !== undefined && box.minY > probeVolumeMax.y) continue;
    if (box.maxZ < probeVolumeMin.z || box.minZ > probeVolumeMax.z) continue;
    out.push(box);
  }
  return out;
}

/**
 * Walks the authored probe lattice, handing each sample to `visit` already
 * converted to metres. The callback form is the allocation-free core; the two
 * exported helpers below are the shapes callers actually want.
 */
function forEachContactProbe(
  input: ViewmodelContactProbeInput,
  visit: (
    offset: ViewmodelContactProbeOffset,
    colliderMeters: number | null,
    colliderBox: Box2 | null,
    dressingMeters: number | null,
    dressingBox: Box2 | null,
    /** Probe origin in world space. The cut needs it to place a face plane. */
    origin: THREE.Vector3,
  ) => void,
): ContactProbeFrame {
  const profile = VIEWMODEL_CONTACT_PROFILES[input.weapon];
  const lattice = viewmodelProbeLattice(profile, input.envelope ?? null);
  probeRotation.set(input.pitch, input.yaw, 0, 'YXZ');
  probeDirection.set(0, 0, -1).applyEuler(probeRotation).normalize();
  probeRight.set(1, 0, 0).applyEuler(probeRotation).normalize();
  probeUp.set(0, 1, 0).applyEuler(probeRotation).normalize();
  // The authored padding stays derived here and stays the fire gate's padding.
  // A measured lattice derives its own from the rig it measured; for the
  // authored path the two are the same number by construction.
  const probePaddingMeters = viewmodelContactProbePaddingMeters(profile);
  const sweepPaddingMeters = lattice.source === 'authored-profile' ? probePaddingMeters : lattice.paddingMeters;
  const probeLengthMeters = lattice.lengthMeters;
  probeVolumeMin.set(Infinity, Infinity, Infinity);
  probeVolumeMax.set(-Infinity, -Infinity, -Infinity);
  for (const right of [lattice.centreRightMeters - lattice.halfWidthMeters, lattice.centreRightMeters + lattice.halfWidthMeters]) {
    for (const up of [lattice.centreUpMeters - lattice.lowerOffsetMeters, lattice.centreUpMeters + lattice.upperOffsetMeters]) {
      for (const along of [0, probeLengthMeters]) {
        probeCorner.copy(input.position)
          .addScaledVector(probeRight, right)
          .addScaledVector(probeUp, up)
          .addScaledVector(probeDirection, along);
        probeVolumeMin.min(probeCorner);
        probeVolumeMax.max(probeCorner);
      }
    }
  }
  probeVolumeMin.subScalar(sweepPaddingMeters);
  probeVolumeMax.addScalar(sweepPaddingMeters);
  const sweptColliders = boxesInsideProbeVolume(input.colliders, nearbyColliders);
  const sweptDressing = boxesInsideProbeVolume(input.dressingBoxes, nearbyDressing);
  for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS) {
    // The authored lattice keeps its historical 4 cm nudge on the two flanking
    // centre probes; the measured lattice is already centred on the rig and
    // needs no nudge. Neither path may drift from the other's numbers.
    const authoredCentreNudge = lattice.source === 'authored-profile' && offset.rightScale !== 0 ? 0.04 : 0;
    const verticalOffset = lattice.centreUpMeters + (offset.vertical === 'upper'
      ? lattice.upperOffsetMeters
      : offset.vertical === 'lower' ? -lattice.lowerOffsetMeters : authoredCentreNudge);
    probeStart.copy(input.position)
      .addScaledVector(probeRight, lattice.centreRightMeters + offset.rightScale * lattice.halfWidthMeters)
      .addScaledVector(probeUp, verticalOffset);
    probeEnd.copy(probeStart).addScaledVector(probeDirection, probeLengthMeters);
    const hit = firstSegmentBoxHit(probeStart, probeEnd, sweptColliders, sweepPaddingMeters);
    const dressingHit = firstSegmentBoxHit(probeStart, probeEnd, sweptDressing, sweepPaddingMeters);
    visit(
      offset,
      hit ? hit.time * probeLengthMeters : null,
      hit ? hit.box : null,
      dressingHit ? dressingHit.time * probeLengthMeters : null,
      dressingHit ? dressingHit.box : null,
      probeStart,
    );
  }
  return { profile, probePaddingMeters: sweepPaddingMeters, forwardY: probeDirection.y, lattice };
}

/**
 * The lattice as data. Used by the fire-admission diagnostics, which has to
 * name the individual probe and the collider that blocked it.
 */
export function sampleViewmodelContactProbes(
  input: ViewmodelContactProbeInput,
): ViewmodelContactProbeSweep {
  const samples: ViewmodelContactProbeSample[] = [];
  const frame = forEachContactProbe(input, (offset, colliderMeters, colliderBox, dressingMeters, dressingBox) => {
    samples.push({ offset, colliderMeters, colliderBox, dressingMeters, dressingBox });
  });
  return { ...frame, samples };
}

function sweepNearestForwardMeters(
  input: ViewmodelObstructionPoseInput,
  restorePadding = false,
): number | null {
  let nearestForward: number | null = null;
  const takeNearest = (distance: number | null): void => {
    if (distance === null) return;
    nearestForward = nearestForward === null ? distance : Math.min(nearestForward, distance);
  };
  const paddingRestoreMeters = restorePadding
    ? viewmodelProbeLattice(VIEWMODEL_CONTACT_PROFILES[input.weapon], input.envelope ?? null).paddingMeters
    : 0;
  const frame = forEachContactProbe(input, (_offset, colliderMeters, _colliderBox, dressingMeters) => {
    // firstSegmentBoxHit inflates every box by the probe padding on ALL three
    // axes, so a padded hit reports the surface `padding` metres nearer than
    // it is. That inflation exists to stop a thin doorjamb slipping between
    // two samples - it is a LATERAL safety margin, and reading it as depth
    // makes the fold solve against a wall that is not there. `retreat` has
    // always consumed the padded value and still does; the geometry solve
    // takes the real distance.
    const restore = restorePadding ? paddingRestoreMeters : 0;
    takeNearest(colliderMeters === null ? null : colliderMeters + restore);
    takeNearest(dressingMeters === null ? null : dressingMeters + restore);
  });
  // Owner 2026-08-30 ("gun still clips through walls and floor"): most
  // authored floors are raycast planes, not movement boxes, so a down-pitched
  // forward probe sailed straight through the ground and the viewmodel
  // rendered half-buried (worst while prone looking down - the weapon
  // dismembered into the floor). Clamp the forward obstruction analytically
  // against the stance ground plane so the SAME contact fold that keeps the
  // weapon camera-side of walls also keeps it above the floor.
  if (input.grounded && frame.forwardY < -GROUND_CLAMP_MIN_DOWN_COMPONENT) {
    const groundPlaneY = input.position.y - input.stanceEyeHeightMeters;
    const groundDistance = (input.position.y - groundPlaneY) / -frame.forwardY;
    if (groundDistance > 0 && groundDistance < frame.lattice.lengthMeters) takeNearest(groundDistance);
  }
  return nearestForward;
}

/**
 * Camera-forward metres from the eye to the point where the surface a probe
 * struck crosses the VIEW AXIS, or null when it never does.
 *
 * This is the whole correction of 2026-08-31, so it is worth being explicit
 * about what it computes and why the probe's own hit distance is not it.
 *
 * The cut is one plane perpendicular to camera-forward, and the only thing
 * such a plane can faithfully stand in for is a surface crossing the view
 * axis at some depth. So ask the surface that question directly: take the box
 * FACE the probe entered through, extend it to its plane, and intersect that
 * plane with the ray from the eye along camera-forward. For a wall faced
 * head-on the answer is the wall's distance and nothing changes. For a wall
 * met at an angle it is where that wall crosses the crosshair, which is the
 * depth a perpendicular plane genuinely represents - NOT the much shorter
 * distance from a probe offset toward the wall, which is what the old
 * conservative sweep reported. For a wall running alongside the view axis
 * there is no crossing at all, `forward . normal` goes to zero, and the
 * surface correctly places no cut.
 *
 * Measured at `atomic-acres/corner`, standing 0.400 m off the west fence with
 * the camera at 45 degrees to it: the nine probes reported 0.000-0.188 m
 * because the rig sits 0.33 m to the RIGHT, a third of a metre nearer that
 * wall than the eye is. Every one of them struck the SAME fence the crosshair
 * is looking at - there was never a second surface off to one side. The face
 * plane of that fence crosses the view axis at 0.4000003 m, which is the
 * ballistic trace's answer to nine significant figures.
 *
 * Rotated boxes fall back to the probe's own hit distance: deriving a face
 * from an oriented box needs the collider's frame, which this module cannot
 * reach, and being conservative there keeps geometry behind the surface.
 */
function cutDepthFromFaceCrossing(
  box: Box2,
  hitMeters: number,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  eye: Point3,
): number | null {
  if (box.rotation) return hitMeters;
  // Retained scratch, like the vectors above: this runs up to nine times per
  // frame and the module deliberately allocates nothing in the per-frame path.
  cutBoxMinimum[0] = box.minX;
  cutBoxMinimum[1] = box.minY ?? Number.NEGATIVE_INFINITY;
  cutBoxMinimum[2] = box.minZ;
  cutBoxMaximum[0] = box.maxX;
  cutBoxMaximum[1] = box.maxY ?? Number.POSITIVE_INFINITY;
  cutBoxMaximum[2] = box.maxZ;
  cutProbeOrigin[0] = origin.x;
  cutProbeOrigin[1] = origin.y;
  cutProbeOrigin[2] = origin.z;
  cutProbeDirection[0] = direction.x;
  cutProbeDirection[1] = direction.y;
  cutProbeDirection[2] = direction.z;
  // Slab entry: the face the probe came in through is the one whose near-plane
  // crossing happens LAST. An unbounded or parallel slab never enters, and a
  // probe that starts inside the box still names the face it would have used,
  // which is exactly the face to clip against when the rig is in the wall.
  let entryTime = Number.NEGATIVE_INFINITY;
  let entryFace = -1;
  let entryBound = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const speed = cutProbeDirection[axis];
    if (Math.abs(speed) < 1e-9) continue;
    const bound = speed > 0 ? cutBoxMinimum[axis] : cutBoxMaximum[axis];
    if (!Number.isFinite(bound)) continue;
    const time = (bound - cutProbeOrigin[axis]) / speed;
    if (time > entryTime) {
      entryTime = time;
      entryFace = axis * 2 + (speed > 0 ? 1 : 0);
      entryBound = bound;
    }
  }
  if (entryFace < 0) return null;
  const normal = CUT_FACE_NORMALS[entryFace];
  const facing = normal[0] * direction.x + normal[1] * direction.y + normal[2] * direction.z;
  // Facing away, or so nearly edge-on that the crossing runs to infinity.
  if (facing > -CUT_FACE_MINIMUM_FACING) return null;
  // The plane constant comes from the box's OWN face coordinate, never from
  // the hit point: `firstSegmentBoxHit` inflates every box by the lattice
  // padding, so the hit point sits that far camera-side of the real surface.
  // Reading the constant off it put the cut 0.19 m in front of a wall measured
  // at 0.40 m and emptied even the head-on frames - measured, and the reason
  // this comment exists.
  const constant = normal[entryFace >> 1] * entryBound;
  const depth = (constant - (normal[0] * eye.x + normal[1] * eye.y + normal[2] * eye.z)) / facing;
  // A crossing at or behind the eye means the eye is already past the surface.
  // No plane helps there, and clamping one to the near plane empties the frame.
  return depth > 0 && Number.isFinite(depth) ? depth : null;
}

/** One cut probe, with the crossing it contributed. Diagnostics only. */
export type ViewmodelCutProbeSample = Readonly<{
  offset: string;
  hitMeters: number | null;
  cutDepthMeters: number | null;
  bounds: Box2 | null;
  set: 'collider' | 'dressing' | null;
}>;

/**
 * The CUT's lattice as data, probe by probe. Diagnostics only.
 *
 * The sweep below collapses to one scalar, and a scalar cannot say WHICH probe
 * placed the plane, what it struck, or how far its own hit distance was from
 * the crossing it contributed - the facts every question about a vanished
 * weapon turns on. This publishes all four.
 */
export function sampleViewmodelCutProbes(
  input: ViewmodelObstructionPoseInput,
): readonly ViewmodelCutProbeSample[] {
  const samples: ViewmodelCutProbeSample[] = [];
  forEachContactProbe(input, (offset, colliderMeters, colliderBox, dressingMeters, dressingBox, origin) => {
    const useDressing = colliderMeters === null
      || (dressingMeters !== null && dressingMeters < colliderMeters);
    const meters = useDressing ? dressingMeters : colliderMeters;
    const box = useDressing ? dressingBox : colliderBox;
    samples.push({
      offset: `${offset.rightScale}/${offset.vertical}`,
      hitMeters: meters,
      cutDepthMeters: meters === null || box === null
        ? null
        : cutDepthFromFaceCrossing(box, meters, origin, probeDirection, input.position),
      bounds: box,
      set: meters === null ? null : (useDressing ? 'dressing' : 'collider'),
    });
  });
  return samples;
}

/**
 * ON-AXIS contact depth for the CUT, in metres, or null when nothing in front
 * of the rig can place a plane.
 *
 * WHY THIS IS A SECOND NUMBER, and why the fold does not use it.
 *
 * The fold and the cut are answers to two different questions and they must
 * not share one scalar.
 *
 *   - The FOLD asks "is something close?". Any nearby surface, on whichever
 *     side, should pull the weapon back and fold it up - the pose response is
 *     correct in every direction - so the conservative minimum over the padded
 *     lattice is exactly right and stays exactly as it was.
 *
 *   - The CUT asks "what would have OCCLUDED the weapon?". The viewmodel draws
 *     on a depth-cleared overlay, so the cut reinstates the depth test a wall
 *     would have performed. One camera-perpendicular plane is a faithful
 *     stand-in for a surface that crosses the view axis, and a false one for a
 *     surface running alongside it: a wall parallel to the view axis occludes
 *     a lateral slab of the frame, never a depth slab, and no perpendicular
 *     plane expresses that. Placing the plane from such a surface deletes
 *     weapon geometry nothing in the world was going to hide. Measured
 *     2026-08-31: 15 of 68 contact rows cut nearer than 0.25 m against on-axis
 *     surfaces at 0.400 m, and in the tightest of them the frame came back
 *     EMPTY.
 *
 * The whole lattice still votes, and that is deliberate. Reducing the cut to
 * the centre probe alone would look like the same fix on this matrix - the
 * harness's surface ray IS the centre answer, so the grade could not tell them
 * apart - and it would quietly lose every camera-FACING surface that misses
 * the middle of the rig: a pillar off to your right, a door reveal, a wall you
 * face at a shallow angle while the barrel is already inside it. Those are
 * genuine occluders, a perpendicular plane represents them well, and they
 * still place the cut here because the crossing is computed per surface rather
 * than assumed from the probe's own distance.
 */
export function measuredEnvelopeCutDepthMeters(
  input: ViewmodelObstructionPoseInput,
): number | null {
  if (!input.envelope) return null;
  let nearest: number | null = null;
  const vote = (depth: number | null): void => {
    if (depth === null) return;
    nearest = nearest === null ? depth : Math.min(nearest, depth);
  };
  const frame = forEachContactProbe(
    input,
    (_offset, colliderMeters, colliderBox, dressingMeters, dressingBox, origin) => {
      if (colliderMeters !== null && colliderBox !== null) {
        vote(cutDepthFromFaceCrossing(colliderBox, colliderMeters, origin, probeDirection, input.position));
      }
      if (dressingMeters !== null && dressingBox !== null) {
        vote(cutDepthFromFaceCrossing(dressingBox, dressingMeters, origin, probeDirection, input.position));
      }
    },
  );
  // The analytic ground plane is the same computation with a normal of +Y: a
  // horizontal floor under a down-pitched camera crosses the view axis at
  // eyeHeight / -forwardY, and that is the face-on surface a perpendicular
  // plane represents best of all. It votes here for the same reason it clamps
  // the fold.
  if (input.grounded && frame.forwardY < -GROUND_CLAMP_MIN_DOWN_COMPONENT) {
    const groundDistance = input.stanceEyeHeightMeters / -frame.forwardY;
    if (groundDistance > 0 && groundDistance < frame.lattice.lengthMeters) vote(groundDistance);
  }
  return nearest;
}

/**
 * Nearest forward obstruction across the AUTHORED lattice, in metres, or null
 * when that envelope is clear. Both collider sets fold the pose.
 *
 * This is the number that becomes `retreat`, and `retreat` is an input to the
 * HF-343 fire gate, so this function deliberately drops any measured envelope
 * the caller passed: widening what the trigger can refuse is not presentation
 * work and was never asked for. The measured envelope belongs to
 * `measuredEnvelopeContactDepthMeters` below, which nothing gameplay reads.
 */
export function nearestViewmodelForwardObstructionMeters(
  input: ViewmodelObstructionPoseInput,
): number | null {
  return sweepNearestForwardMeters({ ...input, envelope: null });
}

/**
 * Nearest forward obstruction across the MEASURED rig envelope, in metres.
 *
 * The authored sweep above cannot answer this: `probeLengthMeters` is 1.65 m
 * for the carbine against a muzzle measured 1.958 m from the eye, and 1.95 m
 * for the sniper against 2.157 m, so at a 1.80 m gap it reports "clear" while
 * the muzzle is already 15.8 cm inside the wall. Presentation-only.
 */
export function measuredEnvelopeContactDepthMeters(
  input: ViewmodelObstructionPoseInput,
): number | null {
  if (!input.envelope) return null;
  return sweepNearestForwardMeters(input, true);
}

/** Downward clearance under the camera, resolved through the stance fallback. */
export function viewmodelFloorClearanceFor(input: ViewmodelObstructionPoseInput): number | null {
  probeStart.copy(input.position);
  probeEnd.copy(input.position);
  probeEnd.y -= FLOOR_PROBE_LENGTH_METERS;
  const floorHit = firstSegmentBoxHit(probeStart, probeEnd, input.colliders, FLOOR_PROBE_PADDING_METERS);
  return viewmodelFloorClearance(
    floorHit ? floorHit.time * FLOOR_PROBE_LENGTH_METERS : null,
    input.grounded,
    input.stanceEyeHeightMeters,
  );
}

/**
 * The obstruction pose plus the cut depth.
 *
 * `ViewmodelObstructionPose` is declared in `weapon-presentation-state.ts`,
 * which the contact lattice does not own; the extra presentation-only field is
 * therefore added here rather than widening a shared reducer type. Every
 * existing consumer is typed to the base shape and is unaffected.
 */
export type ViewmodelObstructionPoseWithCut = ViewmodelObstructionPose & Readonly<{
  /**
   * Metres from the eye to the nearest surface that a camera-perpendicular
   * plane can honestly represent, or null. Places the CUT only. See
   * `measuredEnvelopeCutDepthMeters` for why this is not `contactDepthMeters`.
   */
  contactCutDepthMeters: number | null;
}>;

/**
 * The complete presentation-only obstruction pose. This is what the runtime
 * calls each frame; it changes no camera, gameplay ray or character capsule.
 */
export function resolveViewmodelObstructionPose(
  input: ViewmodelObstructionPoseInput,
): ViewmodelObstructionPoseWithCut {
  const nearestForward = nearestViewmodelForwardObstructionMeters(input);
  const floorClearance = viewmodelFloorClearanceFor(input);
  const pose = viewmodelObstructionPose(nearestForward, input.prone, floorClearance, input.weapon);
  // `retreat`/`lift` above are byte-identical to what the fire gate has always
  // consumed. The two measured depths ride alongside them for the presentation
  // contact fold and cut, and for nothing else.
  return {
    ...pose,
    contactDepthMeters: measuredEnvelopeContactDepthMeters(input),
    contactCutDepthMeters: measuredEnvelopeCutDepthMeters(input),
  };
}
