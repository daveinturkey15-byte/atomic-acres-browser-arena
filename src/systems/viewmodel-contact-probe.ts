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
  const frame = forEachContactProbe(input, (offset, colliderMeters, colliderBox, dressingMeters) => {
    samples.push({ offset, colliderMeters, colliderBox, dressingMeters });
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
 * The complete presentation-only obstruction pose. This is what the runtime
 * calls each frame; it changes no camera, gameplay ray or character capsule.
 */
export function resolveViewmodelObstructionPose(
  input: ViewmodelObstructionPoseInput,
): ViewmodelObstructionPose {
  const nearestForward = nearestViewmodelForwardObstructionMeters(input);
  const floorClearance = viewmodelFloorClearanceFor(input);
  const pose = viewmodelObstructionPose(nearestForward, input.prone, floorClearance, input.weapon);
  // `retreat`/`lift` above are byte-identical to what the fire gate has always
  // consumed. The measured depth rides alongside them for the presentation
  // contact fold and for nothing else.
  return { ...pose, contactDepthMeters: measuredEnvelopeContactDepthMeters(input) };
}
