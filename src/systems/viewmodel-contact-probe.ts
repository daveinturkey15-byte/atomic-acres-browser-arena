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
  type ViewmodelContactProbeOffset,
  type ViewmodelContactProfile,
  type ViewmodelObstructionPose,
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
  probeRotation.set(input.pitch, input.yaw, 0, 'YXZ');
  probeDirection.set(0, 0, -1).applyEuler(probeRotation).normalize();
  probeRight.set(1, 0, 0).applyEuler(probeRotation).normalize();
  probeUp.set(0, 1, 0).applyEuler(probeRotation).normalize();
  const probePaddingMeters = viewmodelContactProbePaddingMeters(profile);
  for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS) {
    const verticalOffset = offset.vertical === 'upper'
      ? profile.probeUpperOffsetMeters
      : offset.vertical === 'lower' ? -profile.probeLowerOffsetMeters : offset.rightScale === 0 ? 0 : 0.04;
    probeStart.copy(input.position)
      .addScaledVector(probeRight, offset.rightScale * profile.probeHalfWidthMeters)
      .addScaledVector(probeUp, verticalOffset);
    probeEnd.copy(probeStart).addScaledVector(probeDirection, profile.probeLengthMeters);
    const hit = firstSegmentBoxHit(probeStart, probeEnd, input.colliders, probePaddingMeters);
    const dressingHit = firstSegmentBoxHit(probeStart, probeEnd, input.dressingBoxes, probePaddingMeters);
    visit(
      offset,
      hit ? hit.time * profile.probeLengthMeters : null,
      hit ? hit.box : null,
      dressingHit ? dressingHit.time * profile.probeLengthMeters : null,
    );
  }
  return { profile, probePaddingMeters, forwardY: probeDirection.y };
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

/**
 * Nearest forward obstruction across the lattice, in metres, or null when the
 * weapon envelope is clear. Both collider sets fold the pose.
 */
export function nearestViewmodelForwardObstructionMeters(
  input: ViewmodelObstructionPoseInput,
): number | null {
  let nearestForward: number | null = null;
  const takeNearest = (distance: number | null): void => {
    if (distance === null) return;
    nearestForward = nearestForward === null ? distance : Math.min(nearestForward, distance);
  };
  const frame = forEachContactProbe(input, (_offset, colliderMeters, _colliderBox, dressingMeters) => {
    takeNearest(colliderMeters);
    takeNearest(dressingMeters);
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
    if (groundDistance > 0 && groundDistance < frame.profile.probeLengthMeters) takeNearest(groundDistance);
  }
  return nearestForward;
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
  return viewmodelObstructionPose(nearestForward, input.prone, floorClearance, input.weapon);
}
