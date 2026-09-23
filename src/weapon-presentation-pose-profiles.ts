import * as THREE from 'three';
import type { WeaponId } from './protocol';

/**
 * Pass 74 extraction seam (HF-340/HF-341): the per-side and per-grip-family
 * first-person arm stance data that used to live as scattered ternaries and
 * magic constants inside weapon-presentation.ts. Pure data plus small pure
 * functions only — no scene, camera or solver state.
 */

export type ViewmodelGripFamily = 'long-gun' | 'compact' | 'handgun' | 'heavy' | 'crossbow';

export function viewmodelGripFamily(weapon: WeaponId): ViewmodelGripFamily {
  if (weapon === 'pistol' || weapon === 'magnum' || weapon === 'machine-pistol' || weapon === 'flashlight-pistol' || weapon === 'flare-gun') return 'handgun';
  if (weapon === 'smg' || weapon === 'mini-uzi' || weapon === 'mp5') return 'compact';
  if (weapon === 'lmg' || weapon === 'minigun' || weapon === 'flamethrower') return 'heavy';
  if (weapon === 'explosive-crossbow') return 'crossbow';
  return 'long-gun';
}

export const FIRST_PERSON_ELBOW_POLE_CONTRACT = 'per-grip-family-lateral-firing-elbow-pole-v1';

/**
 * Support (left) elbow pole: camera-down, retained unchanged from before Pass
 * 73 commit 14a9344c. The owner confirmed "the left looks ok" (HF-340).
 */
export const FIRST_PERSON_SUPPORT_ELBOW_POLE = Object.freeze(
  new THREE.Vector3(-0.7, -1, 0.25).normalize(),
);

/**
 * HF-340: lateral-dominant, slightly camera-down firing pole. Pass 73 commit
 * 14a9344c replaced the right pole with a camera-up hint for every family,
 * flaring the right elbow toward the camera while the left dropped naturally —
 * the owner's "right arm is bent strange, the left looks ok". Long-gun,
 * handgun and crossbow stances bend back down here; the lateral dominance
 * (|x| > |y|) keeps the forearm crossing the frame instead of folding under
 * the crop.
 */
export const FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED = Object.freeze(
  new THREE.Vector3(0.85, -0.35, 0.25).normalize(),
);

/**
 * The 14a9344c camera-up pole, retained ONLY for the compact/heavy hip poses
 * whose forearms genuinely folded entirely underneath the crop (the defect
 * that motivated that commit), and as the high-ready blend target for every
 * family: a weapon raised against cover folds the forearm up, where the
 * raised pole is anatomically correct.
 */
export const FIRST_PERSON_FIRING_ELBOW_POLE_RAISED = Object.freeze(
  new THREE.Vector3(0.7, 0.35, 0.25).normalize(),
);

export const FIRST_PERSON_FIRING_ELBOW_POLE_BY_FAMILY: Readonly<Record<ViewmodelGripFamily, THREE.Vector3>> = Object.freeze({
  'long-gun': FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED,
  handgun: FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED,
  crossbow: FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED,
  compact: FIRST_PERSON_FIRING_ELBOW_POLE_RAISED,
  heavy: FIRST_PERSON_FIRING_ELBOW_POLE_RAISED,
});

/**
 * Camera-space firing (right) elbow pole for one stance. Blends the authored
 * family pole toward the raised pole as the near-cover high-ready response
 * lifts the weapon, so the elbow follows the folding forearm continuously
 * instead of snapping between bend sides.
 */
export function firstPersonFiringElbowPole(
  gripFamily: ViewmodelGripFamily,
  highReadyBlend: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.copy(FIRST_PERSON_FIRING_ELBOW_POLE_BY_FAMILY[gripFamily])
    .lerp(FIRST_PERSON_FIRING_ELBOW_POLE_RAISED, THREE.MathUtils.clamp(highReadyBlend, 0, 1))
    .normalize();
}

/** Camera-space support (left) elbow pole; constant across families. */
export function firstPersonSupportElbowPole(target: THREE.Vector3): THREE.Vector3 {
  return target.copy(FIRST_PERSON_SUPPORT_ELBOW_POLE);
}

/**
 * HF-341: per-family firing-hand wrist roll. The handgun stance gets a slight
 * inward cant so the two-hand pistol grip reads as a deliberate modern-FPS
 * stance rather than a rifle solve reused on a sidearm; every other family
 * keeps the neutral roll the rifle grips were reviewed with.
 */
export const FIRST_PERSON_FIRING_WRIST_ROLL_RADIANS: Readonly<Record<ViewmodelGripFamily, number>> = Object.freeze({
  'long-gun': 0,
  compact: 0,
  heavy: 0,
  crossbow: 0,
  handgun: THREE.MathUtils.degToRad(-8),
});

export function firstPersonFiringWristRollRadians(gripFamily: ViewmodelGripFamily): number {
  return FIRST_PERSON_FIRING_WRIST_ROLL_RADIANS[gripFamily];
}

/**
 * HF-341: authored left-arm melee guard, in the same arms-local glTF frame as
 * the right-hand melee constants in weapon-presentation.ts. Used when the stab
 * begins without a reusable immediately-preceding support pose, so the knife
 * action always shows two real solved arms instead of replaying a stale or
 * invalid capture. Values mirror the reviewed right-chain lane onto the
 * lower-left guard position (x negated, pulled slightly closer to the body).
 */
export const MELEE_LEFT_GUARD_WRIST_TARGET_GLTF = Object.freeze(
  new THREE.Vector3(-0.26, -0.21, -0.33),
);
export const MELEE_LEFT_GUARD_BEND_HINT_GLTF = Object.freeze(
  new THREE.Vector3(-0.32, -0.35, 0.08).normalize(),
);
export const MELEE_LEFT_GUARD_HAND_DIRECTION_GLTF = Object.freeze(
  new THREE.Vector3(0.45, 0.05, -0.892).normalize(),
);

/**
 * HF-341: a captured pre-stab support pose is only reusable when its shoulder
 * still sits near the authored bind location. The removed handgun stow used to
 * teleport the shoulder +40 m off-screen; replaying such a capture froze the
 * left arm 40 m away for the entire 520 ms stab.
 */
export const MELEE_SUPPORT_POSE_MAX_SHOULDER_DRIFT_METERS = 5;

export function meleeSupportPoseReusable(
  shoulderPosition: THREE.Vector3,
  bindShoulderPosition: THREE.Vector3,
): boolean {
  return shoulderPosition.distanceTo(bindShoulderPosition)
    <= MELEE_SUPPORT_POSE_MAX_SHOULDER_DRIFT_METERS;
}
