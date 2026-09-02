import * as THREE from 'three';
import { deepFreezeSubtreeMatrices, deepUnfreezeSubtreeMatrices } from './static-matrix-freeze';
import { VIEWMODEL_SHADOW_BUDGET_SCOPE } from './rendering/runtime-shadow-budget';
import { presentationRandom } from './runtime-random';
import {
  FIRST_PERSON_CAMERA_NEAR_METERS,
  VIEWMODEL_BODY_FIT_CONTRACT,
  VIEWMODEL_BODY_FIT_SCALE,
  viewmodelBodyFitLightDistance,
  viewmodelBodyFitLightIntensity,
  viewmodelRigToWorldMeters,
  viewmodelWorldToRigMeters,
} from './viewmodel-body-fit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWeaponModel, optimizeAttachedWeapon, roundedBox, texturedMaterial } from './art-kit';
import {
  scheduleBrowserPreparationIdleTask,
  yieldBrowserPreparationFrame,
} from './browser-preparation-scheduler';
import {
  applyFirstPersonArmSkin,
  createFirstPersonRiggedArms,
  FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY,
  firstPersonArmAnimationState,
  firstPersonArmAuthoredLayerSample,
  firstPersonArmBaseActionFor,
  getFirstPersonArmAuthoredLayer,
  loadFirstPersonArmsAsset,
  playFirstPersonArmAction,
  resetFirstPersonArmAnimations,
  resetFirstPersonArmFingers,
  setFirstPersonArmBaseAction,
  updateFirstPersonArmAnimations,
  type FirstPersonArmChain,
  type FirstPersonFingerBone,
} from './operator-model';
import { observeLocalOperatorSkinId, operatorSkinPalette } from './operator-skin-catalog';
import { solveTwoBoneElbow, solveTwoBoneElbowInto, type TwoBoneElbowScratch } from './ik';
import { reloadActionEvents, reloadPoseAt, viewmodelReloadStageAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
import {
  advanceAdsBlend,
  advanceWeaponHeat,
  fireCycleAt,
  VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
  VIEWMODEL_EQUIP_SETTLED_SECONDS,
  VIEWMODEL_LAND_DIP_SETTLE_SECONDS,
  viewmodelContactResponse,
  viewmodelEquipBlendAt,
  viewmodelLandDropMetersAt,
  viewmodelSprintPoseEase,
  viewmodelFireAdmissionFromResponse,
  type ViewmodelContactEnvelope,
  type ViewmodelContactResponse,
  type ViewmodelFireAdmission,
} from './weapon-presentation-state';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import {
  MELEE_LEFT_GUARD_BEND_HINT_GLTF,
  MELEE_LEFT_GUARD_HAND_DIRECTION_GLTF,
  MELEE_LEFT_GUARD_WRIST_TARGET_GLTF,
  firstPersonFiringElbowPole,
  firstPersonFiringWristRollRadians,
  firstPersonSupportElbowPole,
  meleeSupportPoseReusable,
  viewmodelGripFamily,
  type ViewmodelGripFamily,
} from './weapon-presentation-pose-profiles';
import { FIRST_PERSON_STANCE_PRESENTATIONS, activeOperatorStance } from './operator-stance-runtime'; // HF-382
// Pass 74 extraction (HF-340/HF-341): grip families and arm stance profiles
// moved into their own typed module; re-export to keep the public surface.
export {
  FIRST_PERSON_ELBOW_POLE_CONTRACT,
  FIRST_PERSON_FIRING_ELBOW_POLE_BY_FAMILY,
  FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED,
  FIRST_PERSON_FIRING_ELBOW_POLE_RAISED,
  FIRST_PERSON_SUPPORT_ELBOW_POLE,
  firstPersonFiringElbowPole,
  firstPersonFiringWristRollRadians,
  firstPersonSupportElbowPole,
  viewmodelGripFamily,
  type ViewmodelGripFamily,
} from './weapon-presentation-pose-profiles';
import { adsSightProfile } from './ads-sight-profile';
import {
  PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
  PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
  authoredOpticAssembly,
  capturePass70FirstPersonMaterialState,
  createPass65CrossbowModel,
  createPass65FieldKnifeModel,
  createPass65WeaponModel,
  disposePass65WeaponModel,
  fireImportedWeapon,
  importedWeaponTelemetry,
  loadPass65FieldKnifeAsset,
  loadPass65WeaponPresentation,
  meleeImportedWeapon,
  releasePass65WeaponModel,
  reloadImportedWeapon,
  resetImportedWeaponAnimations,
  updateImportedWeapon,
} from './weapon-model';
import { WEAPONS } from './gameplay';
import type { WeaponId } from './protocol';
import { characterActionContract, measureCameraFraming, resolveSocketWorld, type CharacterActionContract } from './character-presentation-contract';
import { measureViewmodelFraming } from './viewmodel-near-plane-framing';
import {
  advanceMinigunSpool,
  createMinigunSpoolState,
  resetMinigunSpool,
  type MinigunSpoolPhase,
} from './minigun-spool';
import { RUNTIME_WEAPON_RETENTION_LIMIT } from './weapon-prewarm-catalog';
import { stableDirectionDelta } from './stable-bone-orientation';
import {
  VIEWMODEL_SURFACE_CLIP_PLANE_COUNT,
  type ViewmodelSurfacePlane,
} from './systems/viewmodel-surface-clip';

export type WeaponPose = {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  crouched: boolean;
  prone: boolean;
  ads: boolean;
  phase: number;
  landingImpulse: number;
  lateralSpeed: number;
  /** Presentation-only camera-space retreat from nearby walls/floor. */
  surfaceRetreat?: number;
  /**
   * Presentation-only metres from the eye to the nearest obstruction inside
   * the MEASURED rig envelope. Drives the contact fold and nothing else; the
   * HF-343 fire gate keeps consuming `surfaceRetreat` unchanged.
   */
  surfaceContactDepth?: number | null;
  /**
   * Presentation-only metres from the eye to the nearest surface a
   * camera-perpendicular plane can honestly represent. Places the contact CUT;
   * `surfaceContactDepth` above keeps driving the FOLD. They differ whenever
   * the nearest thing to the rig is beside it rather than in front of it, and
   * that difference is the whole 2026-08-31 "the weapon vanishes" defect.
   */
  surfaceContactCutDepth?: number | null;
  /**
   * The nearby SURFACES themselves, as world-space planes that keep the eye.
   *
   * `surfaceContactCutDepth` above can only describe a surface the view axis
   * runs into, which is a real limit of a camera-perpendicular plane and not a
   * bug in it. Measured turning on the spot at the Nuke Town house wall: facing
   * it, penetration is 0.000 m; with the same wall alongside the rig it is
   * 0.26-0.36 m, because no perpendicular plane can represent a surface the
   * crosshair never meets. These planes are the surfaces' own, so they cut at
   * any angle. See src/systems/viewmodel-surface-clip.ts.
   */
  surfaceClipPlanes?: readonly ViewmodelSurfacePlane[];
  /** Presentation-only vertical clearance from nearby floor geometry. */
  surfaceLift?: number;
  /** Authoritative gameplay reload progress. Null means no active reload. */
  reloadProgress: number | null;
  /** Presentation input only; host shot admission owns the legal spin-up tick. */
  triggerHeld?: boolean;
};

type ViewCasing = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; frames: number; active: boolean };
type ViewSmoke = { velocity: THREE.Vector3; life: number; maxLife: number; active: boolean };
type RiggedViewArm = FirstPersonArmChain & {
  bindShoulder: THREE.Quaternion;
  bindElbow: THREE.Quaternion;
  bindWrist: THREE.Quaternion;
  bindShoulderPosition: THREE.Vector3;
  bindElbowPosition: THREE.Vector3;
  bindWristPosition: THREE.Vector3;
  bindShoulderScale: THREE.Vector3;
  bindElbowScale: THREE.Vector3;
  bindWristScale: THREE.Vector3;
};
export type ViewmodelArmEvidenceCaptureMode = 'background' | 'left' | 'right' | null;
type ViewmodelArmEvidenceMeshRestore = {
  mesh: THREE.SkinnedMesh;
  visible: boolean;
  renderOrder: number;
  material: THREE.Material | THREE.Material[];
  ownershipAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
};
type RiggedMeleeSupportPose = Readonly<{
  shoulderPosition: THREE.Vector3;
  shoulderQuaternion: THREE.Quaternion;
  shoulderScale: THREE.Vector3;
  elbowPosition: THREE.Vector3;
  elbowQuaternion: THREE.Quaternion;
  elbowScale: THREE.Vector3;
  wristPosition: THREE.Vector3;
  wristQuaternion: THREE.Quaternion;
  wristScale: THREE.Vector3;
}>;
type ViewArmRig = {
  side: 'left' | 'right';
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
  upperLength: number;
  lowerLength: number;
};

const VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE = 'viewmodelArmEvidenceOwnership';
export const VIEWMODEL_ARM_EVIDENCE_CONTRACT = 'actual-skinned-vertex-arm-only-material-id-v1';

function firstPersonArmBoneSide(name: string): 'left' | 'right' | null {
  // The shipped first-person skeleton uses Blender's explicit L/R terminal
  // suffixes (UpperArmL, WristR, Index1L, ...). Do not infer ownership from
  // mesh/material names: every one of the four authored skins contains both
  // arms, so mesh-level visibility would make an arm-only proof untruthful.
  if (/^(?:UpperArm|LowerArm|Wrist|Hand|Palm|Index\d+|Middle\d+|Ring\d+|Pinky\d+|Thumb\d+)L$/u.test(name)) {
    return 'left';
  }
  if (/^(?:UpperArm|LowerArm|Wrist|Hand|Palm|Index\d+|Middle\d+|Ring\d+|Pinky\d+|Thumb\d+)R$/u.test(name)) {
    return 'right';
  }
  return null;
}

function createViewmodelArmEvidenceMaterial(side: 'left' | 'right'): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    // Deliberately non-art colors make the material-ID pixels machine
    // selectable even when the paired action advances by a few render frames.
    color: side === 'left' ? 0x19ff4a : 0xff174f,
    // ID capture is an ownership/x-ray pass. Draw the selected actual skin on
    // top so the receiver cannot split the hand/cuff from its sleeve and turn
    // a continuous chain into two apparent components in evidence space.
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  material.name = `qa-${side}-arm-skinned-material-id`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float ${VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE};\nvarying float vViewmodelArmEvidenceOwnership;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvViewmodelArmEvidenceOwnership = ${VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vViewmodelArmEvidenceOwnership;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (vViewmodelArmEvidenceOwnership < 0.25) discard;',
      );
  };
  material.customProgramCacheKey = () => `${VIEWMODEL_ARM_EVIDENCE_CONTRACT}:${side}`;
  return material;
}

type HandRotationSet = { left: [number, number, number]; right: [number, number, number] };
const WEAPON_HAND_ROTATIONS: Record<WeaponId, HandRotationSet> = {
  carbine: { left: [-0.32, 0.12, -0.22], right: [-0.22, -0.06, 0.26] },
  smg: { left: [-0.36, 0.14, -0.22], right: [-0.18, -0.02, 0.16] },
  lmg: { left: [-0.31, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  scattergun: { left: [-0.26, 0.08, -0.16], right: [-0.14, -0.04, 0.12] },
  sniper: { left: [-0.3, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  railgun: { left: [-0.3, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  pistol: { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
  magnum: { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
  'machine-pistol': { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
  'mini-uzi': { left: [-0.36, 0.14, -0.22], right: [-0.18, -0.02, 0.16] },
  mp5: { left: [-0.36, 0.14, -0.22], right: [-0.18, -0.02, 0.16] },
  m4a1: { left: [-0.32, 0.12, -0.22], right: [-0.22, -0.06, 0.26] },
  'ak-47': { left: [-0.32, 0.12, -0.22], right: [-0.22, -0.06, 0.26] },
  minigun: { left: [-0.31, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  'm14-ebr': { left: [-0.3, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  'slug-shotgun': { left: [-0.26, 0.08, -0.16], right: [-0.14, -0.04, 0.12] },
  'flashlight-pistol': { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
  'explosive-crossbow': { left: [-0.42, 0.14, -0.24], right: [-0.24, 0.02, 0.1] },
  flamethrower: { left: [-0.31, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  'crimson-flamethrower': { left: [-0.31, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  'flare-gun': { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
};

const VIEWMODEL_GRIP_OFFSETS: Record<WeaponId, HandRotationSet> = {
  carbine: { left: [-0.06, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  smg: { left: [-0.055, -0.02, 0.02], right: [0.08, -0.025, 0.015] },
  lmg: { left: [-0.06, -0.025, 0.02], right: [0.08, -0.025, 0.015] },
  scattergun: { left: [-0.055, -0.025, 0.015], right: [0.08, -0.025, 0.015] },
  sniper: { left: [-0.055, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  railgun: { left: [-0.055, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  pistol: { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
  magnum: { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
  'machine-pistol': { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
  'mini-uzi': { left: [-0.055, -0.02, 0.02], right: [0.08, -0.025, 0.015] },
  mp5: { left: [-0.055, -0.02, 0.02], right: [0.08, -0.025, 0.015] },
  m4a1: { left: [-0.06, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  'ak-47': { left: [-0.06, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  minigun: { left: [-0.065, -0.03, 0.02], right: [0.08, -0.025, 0.015] },
  'm14-ebr': { left: [-0.055, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  'slug-shotgun': { left: [-0.055, -0.025, 0.015], right: [0.08, -0.025, 0.015] },
  'flashlight-pistol': { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
  'explosive-crossbow': { left: [-0.015, -0.025, 0.03], right: [0.07, -0.025, 0.015] },
  flamethrower: { left: [-0.065, -0.03, 0.02], right: [0.08, -0.025, 0.015] },
  'crimson-flamethrower': { left: [-0.065, -0.03, 0.02], right: [0.08, -0.025, 0.015] },
  'flare-gun': { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
};

const RELOAD_HAND_ROTATIONS: Record<WeaponId, [number, number, number]> = {
  carbine: [-0.72, 0.32, -0.5],
  smg: [-0.82, 0.38, -0.58],
  lmg: [-0.78, 0.35, -0.54],
  scattergun: [-0.58, 0.18, -0.42],
  sniper: [-0.76, 0.34, -0.52],
  railgun: [-0.76, 0.34, -0.52],
  pistol: [-0.92, 0.42, -0.68],
  magnum: [-0.92, 0.42, -0.68],
  'machine-pistol': [-0.92, 0.42, -0.68],
  'mini-uzi': [-0.82, 0.38, -0.58],
  mp5: [-0.82, 0.38, -0.58],
  m4a1: [-0.72, 0.32, -0.5],
  'ak-47': [-0.72, 0.32, -0.5],
  minigun: [-0.78, 0.35, -0.54],
  'm14-ebr': [-0.76, 0.34, -0.52],
  'slug-shotgun': [-0.58, 0.18, -0.42],
  'flashlight-pistol': [-0.92, 0.42, -0.68],
  'explosive-crossbow': [-0.72, 0.28, -0.48],
  flamethrower: [-0.78, 0.35, -0.54],
  'crimson-flamethrower': [-0.78, 0.35, -0.54],
  'flare-gun': [-0.92, 0.42, -0.68],
};

export const RIGGED_HAND_POSE_CHAIN_CONTRACT = 'authored-palm-full-transform-to-socket-frame-v2';
// HF-341 contract bump: v1 ('right-firing-hand-handgun-support-reload-only-v1')
// stowed the handgun support arm by teleporting its shoulder +40 m and toggled
// that stow across a single frame at every reload boundary. Handguns now keep
// a posed two-hand grip on the authored support-socket-l at all times, so the
// support chain is always active and reload transitions blend continuously.
export const FIRST_PERSON_HAND_POLICY_CONTRACT = 'right-firing-hand-two-hand-support-always-active-v2';
export type FirstPersonHandPolicy = Readonly<{
  contract: typeof FIRST_PERSON_HAND_POLICY_CONTRACT;
  gripFamily: ViewmodelGripFamily;
  firingHand: 'right';
  supportHand: 'active';
  activeChainCount: 2;
}>;

export function firstPersonHandPolicy(weapon: WeaponId): FirstPersonHandPolicy {
  const gripFamily = viewmodelGripFamily(weapon);
  return Object.freeze({
    contract: FIRST_PERSON_HAND_POLICY_CONTRACT,
    gripFamily,
    firingHand: 'right',
    supportHand: 'active',
    activeChainCount: 2,
  });
}
const RIGGED_SUPPORT_HAND_DIRECTION_LOCAL = Object.freeze(new THREE.Vector3(0.85, -0.20, -0.45).normalize());
const RIGGED_RELOAD_HAND_DIRECTION_LOCAL = Object.freeze(new THREE.Vector3(0.90, -0.25, -0.05).normalize());
const RIGGED_SUPPORT_WRIST_ROLL_RADIANS = THREE.MathUtils.degToRad(-4);
const RIGGED_RELOAD_WRIST_ROLL_RADIANS = THREE.MathUtils.degToRad(-20);

/**
 * Replays the accepted Blender palm directions in glTF weapon space. Blender's
 * `(x, y, z)` authoring vectors become `(x, z, -y)` in the runtime delivery.
 * Keeping this interpolation independent of the camera prevents reload roll
 * and stance framing from turning the support glove into a loose finger chain.
 */
export function riggedSupportHandDirectionLocal(
  reloadBlend: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.copy(RIGGED_SUPPORT_HAND_DIRECTION_LOCAL)
    .lerp(RIGGED_RELOAD_HAND_DIRECTION_LOCAL, THREE.MathUtils.clamp(reloadBlend, 0, 1))
    .normalize();
}

export function riggedSupportWristRollRadians(reloadBlend: number): number {
  return THREE.MathUtils.lerp(
    RIGGED_SUPPORT_WRIST_ROLL_RADIANS,
    RIGGED_RELOAD_WRIST_ROLL_RADIANS,
    THREE.MathUtils.clamp(reloadBlend, 0, 1),
  );
}

type FingerCurlProfile = Readonly<Record<FirstPersonFingerBone['digit'], readonly [number, number, number]>>;
// Preserve the evaluated per-digit source-authoring poses. A generic curl and
// per-digit multiplier left the firing index almost straight, closed the thumb
// too far, and spread the firing hand even though only the C-clamp support hand
// is authored with lateral separation. The exact profiles make the visible
// glove close around the grip rather than merely putting its palm on a socket.
export const FINGER_FIRE_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.28, -0.46, -0.34],
  middle: [-0.42, -0.70, -0.52],
  ring: [-0.46, -0.76, -0.56],
  pinky: [-0.50, -0.82, -0.60],
  thumb: [-0.20, -0.34, -0.24],
});
/**
 * HF-388. The support hand did not read as gripping anything, and the numbers
 * say why: the first (metacarpal) joint of the support index bent 0.07 rad -
 * FOUR DEGREES - so the hand was an open plate laid against the handguard
 * rather than a hand closed around it. Captured frames show exactly that: a
 * featureless pale mass beside the receiver with no visible digit separation.
 *
 * The rig lesson taken from the CC0 reference (para, OpenGameArt, public
 * domain - `.akephalos/references/ai-3d-technique-register.md` row 31, page
 * read 2026-08-25) is about the SHAPE of a curl, not about its numbers. That
 * rig drives each digit from a single control through a constraint chained
 * down the finger, so curl is monotonic and compounding from metacarpal to
 * tip, and the author's own note is that you "probably want to turn these off
 * at some point" - the constraint is a posing aid, and shipped poses are
 * hand-authored per joint. Our table is already the hand-authored form, so the
 * correction is to make it obey the shape the constraint would have produced:
 * every digit's bend grows from the metacarpal into the middle joint and every
 * digit closes further than the one before it, thumb last and opposed.
 *
 * This stays a C-clamp, not a fist: the thumb keeps its positive (abducted)
 * metacarpal so it lies over the rail rather than under it, and the index
 * stays the shallowest finger. FINGER_FIRE_CURL is untouched - the trigger
 * hand was never the one that failed to read.
 */
export const FIRST_PERSON_SUPPORT_GRIP_CONTRACT = 'monotonic-chained-c-clamp-support-curl-v1';
export const FINGER_SUPPORT_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.30, -0.52, -0.40],
  middle: [-0.36, -0.60, -0.46],
  ring: [-0.40, -0.66, -0.50],
  pinky: [-0.44, -0.72, -0.54],
  thumb: [0.12, -0.30, -0.22],
});
const FINGER_RELOAD_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.18, -0.38, -0.30],
  middle: [-0.24, -0.48, -0.38],
  ring: [-0.28, -0.54, -0.42],
  pinky: [-0.32, -0.60, -0.46],
  thumb: [-0.12, -0.28, -0.20],
});
const FINGER_OFFHAND_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.04, -0.08, -0.05],
  middle: [-0.05, -0.10, -0.06],
  ring: [-0.06, -0.12, -0.07],
  pinky: [-0.08, -0.14, -0.08],
  thumb: [-0.02, -0.05, -0.03],
});
const FINGER_SUPPORT_SPREAD: Readonly<Record<FirstPersonFingerBone['digit'], number>> = Object.freeze({
  index: -0.026,
  middle: -0.008,
  ring: 0.012,
  pinky: 0.03,
  thumb: -0.05,
});
// Evaluated Pass 65 knife-contact solve, converted from Blender XYZ into the
// exported glTF coordinate system (x, z, -y). Reusing the authored endpoint
// and pole is materially different from adding Euler offsets: it preserves a
// real bent shoulder/elbow/wrist chain instead of stretching the sleeve into a
// horizontal tube when the whole viewmodel enters from the right edge.
const MELEE_RIGHT_WRIST_SOURCE_TARGET_GLTF = Object.freeze(new THREE.Vector3(
  0.11208589375019073, -0.15644994378089905, -0.43055760860443115,
));
// The review camera sat close to the hand, while the runtime action enters from
// the screen edge. Drive the same authored target 37 cm across the camera-right
// axis so the blade tip actually crosses the centre-right combat lane; the
// shoulder remains at the lower-right edge and the real two-bone chain spans
// the intervening space instead of moving the complete rig as one block.
const MELEE_RIGHT_WRIST_TARGET_GLTF = Object.freeze(
  MELEE_RIGHT_WRIST_SOURCE_TARGET_GLTF.clone().add(new THREE.Vector3(-0.37, 0, 0)),
);
const MELEE_RIGHT_BEND_HINT_GLTF = Object.freeze(new THREE.Vector3(0.32, -0.35, 0.08).normalize());
const MELEE_RIGHT_HAND_DIRECTION_GLTF = Object.freeze(new THREE.Vector3(
  -0.45, 0.05, -0.892,
).normalize());
function supportFingerCurlScale(weapon: WeaponId): number {
  const family = viewmodelGripFamily(weapon);
  return family === 'handgun' ? 1.18 : family === 'compact' ? 0.92 : family === 'heavy' ? 0.86 : family === 'crossbow' ? 0.94 : 1;
}

// Pass 65: matches the 520 ms third-person melee window so first-person and
// remote observers see the same stab duration.
const MELEE_PRESENTATION_MS = 520;
// The owner rejected the earlier small, needle-like knife presentation at
// 1440p/4K.  Keep the authored grip socket as the scale origin so enlarging the
// silhouette cannot detach it from the hand, and size the action independently
// from pixel resolution (perspective framing is resolution invariant).
export const MELEE_KNIFE_PRESENTATION_SCALE = 1.55;
export const MELEE_VIEWMODEL_PEAK_SCALE_LIFT = 0.3;
// A two-bone solver cannot place a wrist beyond the physical arm span. Clamp
// only that impossible final fraction while publishing both the raw socket
// reach and calibration distance; the visual gate separately rejects a socket
// that needs more than a small authored tolerance, so malformed assets cannot
// be hidden by the runtime solver.
// Keep the wrist fractionally short of mathematical full extension so the
// two-bone solve retains a stable elbow bend. The larger Pass 66 viewmodel
// framing scales authored metre distances too; 0.996 keeps the M134 support
// hand inside the retained 15 mm socket-calibration contract while preserving
// a real (non-zero) anti-singularity margin.
const RIGGED_ARM_MAX_REACH_RATIO = 0.996;
export const FIRST_PERSON_ARM_PROPORTION_CONTRACT = 'authored-fixed-length-strong-operator-arms-v5';
/** Uniform root scaling preserves the authored skeleton, palms and joint radii. */
export const FIRST_PERSON_ARM_UNIFORM_SCALE = 1.12;
// HF-365: the owner played the candidate and said the arms read thin, which
// supersedes HF-354's "thickness is right". Two levers move together and both
// stay uniform: this presentation scale (the one the runtime actually applies
// every frame - FIRST_PERSON_ARM_UNIFORM_SCALE is only the load-time seed) and
// the normal-shell girth in operator-model. Scale alone would have to go
// implausibly high to fix girth because it lengthens the arm at the same rate;
// the shell adds mass without reach, so this lift stays modest.
// Second HF-365 pass, 2026-08-23. Measured from the running build: the trigger
// hand sits at NDC y -0.75..-0.89 (welded to `grip-socket-r`, which is correct)
// and the support hand at NDC (0.16, -0.36) on `support-socket-l`, also
// correct - but at the previous scale BOTH hands were smaller than the rifle's
// own silhouette and so were completely hidden behind it. From the player's
// seat the weapon appeared to be held by a bare tube, which is what "weirdly
// held" describes. Scale is the only lever that grows the HANDS without moving
// the welded palms off their sockets, so it takes the remaining lift.
export const FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE = 1.74;
// Do not shrink the operator's arms while aiming. Apart from making the ADS
// silhouette look implausibly skinny, the old shrink broke the lower-frame
// sleeve continuation on short landscape viewports.
export const FIRST_PERSON_ARM_ADS_PRESENTATION_SCALE = 1.79;
export const FIRST_PERSON_ARM_RELOAD_SCALE_LIFT = 0.16;
/**
 * Keeps every axis uniform while adding mass at the two poses where the arms
 * previously narrowed to a disconnected lower-crop silhouette. Reload lift is
 * smooth and returns exactly to the hip scale at both action boundaries.
 */
export function firstPersonArmPresentationScale(adsBlend: number, reloadProgress: number | null): number {
  const aim = THREE.MathUtils.clamp(adsBlend, 0, 1);
  const reloadLift = reloadProgress === null
    ? 0
    : Math.sin(THREE.MathUtils.clamp(reloadProgress, 0, 1) * Math.PI) * FIRST_PERSON_ARM_RELOAD_SCALE_LIFT;
  return THREE.MathUtils.lerp(
    FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE,
    FIRST_PERSON_ARM_ADS_PRESENTATION_SCALE,
    aim,
  ) + reloadLift;
}
export const FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT = 'fixed-length-reachable-shoulders-continuous-sleeve-crop-v5';
export const FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC = Object.freeze({
  // HF-365 ("weirdly held"): the support shoulder used to be pinned 1.12 NDC
  // below the frame. constrainRiggedShoulderEntryToReach walks the shoulder
  // toward straight-down until the joint clears that lane, so a lane that deep
  // forced an almost vertical support arm - a pale post rising out of the
  // bottom edge with the hand balanced on top. Pulling the lane up to 1.04
  // (still comfortably past the -0.98 below-frame continuation requirement)
  // lets the search stop while the shoulder still carries real lateral offset,
  // so the support arm enters diagonally from the lower left like an arm.
  left: -1.04,
  // Ordinary hip/fire poses need the closed proximal sleeve safely below the
  // crop. Raised/ADS/heavy poses use the lifted lane below instead.
  right: -0.97,
});
export const FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC = -0.82;
export function firstPersonArmShoulderEntryNdc(
  side: 'left' | 'right',
  gripFamily: ViewmodelGripFamily,
  adsBlend: number,
  highReadyBlend: number,
): number {
  if (side === 'left') return FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left;
  const raisedBlend = Math.max(
    gripFamily === 'heavy' ? 1 : 0,
    THREE.MathUtils.clamp(adsBlend, 0, 1),
    THREE.MathUtils.clamp(highReadyBlend, 0, 1),
  );
  return THREE.MathUtils.lerp(
    FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right,
    FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC,
    raisedBlend,
  );
}
/**
 * HF-365 ("badly animated"). Diagnosis, recorded honestly: the authored arms
 * ship 13 runtime clips, only fire/reload/melee were ever played, each of those
 * is a ONE-SHOT that stopped every other action, and the runtime clip filter
 * admits digit tracks only - the shoulder, elbow and wrist are IK-solved. On
 * top of that, bob, sway and recoil are applied to the shared viewmodel root,
 * so the arms and the weapon move as one rigid block. Standing still or
 * walking, nothing on the arms moved at all.
 *
 * Two fixes: the locomotion loop underneath the one-shots (operator-model), and
 * this layer. It animates ONLY the elbow pole and the wrist roll. The pole
 * rotates the elbow around the shoulder-to-grip axis, which swings the whole
 * visible forearm and sleeve without moving the wrist endpoint at all, and the
 * roll turns the hand about the grip axis. The palm therefore stays welded to
 * the authored socket and the contact/orientation gates are untouched - the
 * arms breathe and stride around a hand that never leaves the weapon.
 *
 * Mean-zero on purpose: HF-340's reviewed per-family elbow poles remain the
 * pose; this only adds motion around them.
 */
export const FIRST_PERSON_ARM_MOTION_CONTRACT = 'welded-palm-elbow-pole-locomotion-v1';
/**
 * HF-388: bounded arm-local recoil share and landing dip. Both feed the same
 * elbow-pole channel as the authored pose layer and are re-clamped with it, so
 * the total pole motion can never exceed FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS.
 */
export const FIRST_PERSON_ARM_RECOIL_POLE_GAIN = 0.9;
export const FIRST_PERSON_ARM_RECOIL_MAX_POLE_RADIANS = 0.16;
export const FIRST_PERSON_ARM_LAND_DIP_RADIANS = 0.22;
export const FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS = 0.24;
export const FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS = 0.03;
const ARM_BREATH_HZ = 0.21;
const ARM_ROLL_HZ = 0.17;

export type FirstPersonArmMotionInput = Readonly<{
  side: 'left' | 'right';
  elapsedSeconds: number;
  /** Shared locomotion phase; the same signal that drives viewmodel bob. */
  phase: number;
  movingBlend: number;
  sprintBlend: number;
  adsBlend: number;
}>;

export type FirstPersonArmMotionSample = Readonly<{
  poleRadians: number;
  wristRollRadians: number;
}>;

export function firstPersonArmMotionSample(input: FirstPersonArmMotionInput): FirstPersonArmMotionSample {
  const elapsed = Number.isFinite(input.elapsedSeconds) ? input.elapsedSeconds : 0;
  const phase = Number.isFinite(input.phase) ? input.phase : 0;
  const moving = THREE.MathUtils.clamp(input.movingBlend, 0, 1);
  const sprint = THREE.MathUtils.clamp(input.sprintBlend, 0, 1);
  // Aiming settles the arms exactly as it settles bob, breath and sway, so the
  // sight picture the owner already accepted does not start swimming.
  const aimSteady = 1 - THREE.MathUtils.clamp(input.adsBlend, 0, 1) * 0.72;
  // Half a cycle apart: the support and firing elbows counter-swing the way
  // they do when a rifle is carried, instead of pumping in unison.
  const sideOffset = input.side === 'left' ? Math.PI * 0.5 : 0;
  const breath = Math.sin(elapsed * Math.PI * 2 * ARM_BREATH_HZ + sideOffset) * 0.055;
  const stride = Math.sin(phase + sideOffset) * (0.072 + 0.098 * sprint);
  const pole = (breath * (1 - moving * 0.55) + stride * moving) * aimSteady;
  const roll = Math.sin(elapsed * Math.PI * 2 * ARM_ROLL_HZ + sideOffset) * 0.018 * aimSteady;
  return Object.freeze({
    poleRadians: THREE.MathUtils.clamp(pole, -FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS, FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS),
    wristRollRadians: THREE.MathUtils.clamp(roll, -FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS, FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS),
  });
}

/** The one-handed knife arc needs extra proximal sleeve travel at peak extension. */
export const FIRST_PERSON_MELEE_SHOULDER_ENTRY_NDC = -1.23;
/** Runtime IK rotates joints and may translate the shoulder, but never stretches a skinned segment. */
export const FIRST_PERSON_ARM_BIND_SEGMENT_LENGTH_SCALE = 1;
// HF-340: the firing elbow pole now comes from the per-grip-family stance
// profile module. Long-gun/handgun/crossbow bend lateral-and-slightly-down
// like the accepted left arm; the camera-up pole that 14a9344c applied to
// every family (and which bent the right arm strangely) is reserved for the
// compact/heavy hip poses whose forearms folded under the crop, plus the
// high-ready blend where the folded forearm genuinely rises.
/** Unit -Z blade axis reused by the per-frame melee knife alignment. */
const KNIFE_BLADE_AXIS = Object.freeze(new THREE.Vector3(0, 0, -1));
export const HIP_VIEWMODEL_POSITION = Object.freeze({ x: 0.34, y: -0.44, z: -1.08 });
export const HIP_VIEWMODEL_SCALE = 0.82;
/**
 * HF-388 - the trigger hand, and the trade-off, stated.
 *
 * MEASURED on the running build at 2560x1440, WebGPU, by projecting every
 * first-person hand bone through the live gameplay camera (2026-08-25):
 *
 *   weapon    right-hand bones, NDC y        reading
 *   carbine   -0.965 .. -0.759               bottom 12% of the frame, cropped
 *   pistol    -0.903 .. -0.706               low, but whole
 *   M249 LMG  -1.109 .. -0.888               PART OF THE HAND IS OFF-FRAME
 *
 * The ammo panel spans NDC x 0.371..0.684, and the hand spans 0.146..0.277, so
 * the panel is NOT what hides it - the earlier read was close but wrong about
 * the mechanism. The frame's own bottom edge is.
 *
 * A previous agent diagnosed the IK weld as correct and declined to move the
 * weapon unilaterally. The weld IS correct - contact error is 1e-9 m and the
 * palm sits exactly on `grip-socket-r` - and that is precisely why the weapon
 * has to move: the hand is welded to the socket, so there is no lever that
 * raises the hand and leaves the weapon where it is. The choice is between
 * moving the viewmodel and never showing the trigger hand.
 *
 * THE TRADE-OFF, taken deliberately:
 *   - Raising the hip viewmodel raises the WEAPON with it, and the weapon is
 *     what a player reads the fastest. So the lift is per grip family and no
 *     larger than the family's own measured deficit, rather than one global
 *     nudge sized for the worst case. The M249 sits 0.19 m low because its
 *     authored grip socket is low, and only the M249 pays for that.
 *   - COMBAT SAFETY BOUND, enforced and re-measured after the change: the
 *     weapon's own NDC bounding box must not reach screen centre. The crosshair
 *     sits at (0, 0); the bound this change holds is that the raised viewmodel
 *     leaves NDC y = 0 clear across the centre column, so nothing that was
 *     shootable before is behind the gun now.
 *   - ADS IS UNTOUCHED, byte for byte. The lift is multiplied by (1 - adsBlend)
 *     and the ADS base position is not edited, so the sight picture the owner
 *     already accepted cannot move. Sprint keeps its own drop for the same
 *     reason: a sprinting player is not aiming and the lowered carry reads as
 *     the sprint.
 */
export const FIRST_PERSON_HIP_TRIGGER_HAND_LIFT_CONTRACT = 'per-grip-family-hip-trigger-hand-lift-v1';
export const FIRST_PERSON_HIP_TRIGGER_HAND_LIFT: Readonly<Record<ViewmodelGripFamily, number>> = Object.freeze({
  'long-gun': 0.09,
  compact: 0.09,
  handgun: 0.06,
  heavy: 0.15,
  crossbow: 0.08,
});
/** No family may buy hand framing with more than this much screen. */
export const FIRST_PERSON_HIP_TRIGGER_HAND_LIFT_CEILING = 0.2;

/**
 * Metres of hip-only vertical lift for one weapon. Zero at full ADS and zero
 * while the melee arc owns the viewmodel, so neither of those poses changes.
 */
export function firstPersonHipTriggerHandLift(
  weapon: WeaponId,
  adsBlend: number,
  meleeBlend = 0,
): number {
  const authored = FIRST_PERSON_HIP_TRIGGER_HAND_LIFT[viewmodelGripFamily(weapon)];
  const bounded = Math.min(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT_CEILING, Math.max(0, authored));
  const hip = (1 - THREE.MathUtils.clamp(adsBlend, 0, 1)) * (1 - THREE.MathUtils.clamp(meleeBlend, 0, 1));
  return bounded * hip;
}
/** Camera-space Z clearance preventing thicker arm geometry from crossing the near plane. */
export const VIEWMODEL_NEAR_PLANE_CLEARANCE = 0.06;
/**
 * HF-397 (2026-09-02): the owner asked for the near-wall pullback to be
 * halved. Multiplies the clamped surface retreat at its single application
 * site; the raw probed value still feeds telemetry and the clip planes.
 *
 * HF-410 (2026-09-02, owner: "holding it up when near floor or prone or walls
 * is super bad, needs a re work"): halving it was not enough, and the reason is
 * that the pullback was never the right instrument. It existed to drag a rig
 * that hung up to 1.6 m outside the player's own 0.38 m collision capsule back
 * out of the wall it was necessarily inside - a job that needed ~1.6 m of
 * travel and had 0.28 m of budget. The rig is now fitted INSIDE that capsule
 * (src/viewmodel-body-fit.ts), measured at 0.316 m radial against a 0.38 m
 * radius, so there is no wall for it to be pulled out of and the pullback is
 * zero. The retreat is still probed, still reported in telemetry, and the
 * clamp above it is untouched, so nothing here is a weakened bound: the
 * multiplier is zero because the geometry no longer needs it.
 */
export const VIEWMODEL_WALL_PULLBACK_SCALE = 0;

/**
 * Maximum camera-space wall retreat that still keeps the armed hands/stock
 * clear of the near plane. The prone-contact spec requires a real retreat
 * (> 0.25) while the weapon framing must stay near-plane-clear, so the
 * visual retreat is capped here while telemetry keeps reporting the pose.
 */
export const VIEWMODEL_NEAR_PLANE_SAFE_RETREAT = 0.28;
const ADS_VIEWMODEL_BASE_POSITION = Object.freeze({ x: 0.28, y: -0.38, z: -1.04 });
const ADS_VIEWMODEL_SCALE = 0.76;
export const FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE = 0.0001;
export const FULLSCREEN_PRESENTATION_SUPPRESSION_CONTRACT = 'retained-structural-lights-fullscreen-suppression-v1';

/**
 * Extra max-contact retreat for authored first-person assets whose retained
 * receiver/stock envelope is deeper than the M4A1 calibration weapon. These
 * conservative upper bounds come from the 2026-08-09 real-GLB wall-contact
 * sweep at camera.near + 0.02 m; the release verifier must be rerun whenever a
 * source model or the gameplay camera near plane changes.
 */
export const FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT_CONTRACT = 'authored-glb-contact-retreat-2026-08-09-v1';
export const FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT: Readonly<Record<WeaponId, number>> = Object.freeze({
  carbine: 0,
  smg: 0,
  lmg: 0.1,
  scattergun: 0.03,
  sniper: 0.14,
  'mini-uzi': 0,
  mp5: 0,
  m4a1: 0,
  'ak-47': 0.03,
  minigun: 0,
  'm14-ebr': 0.05,
  'slug-shotgun': 0.03,
  pistol: 0,
  'machine-pistol': 0,
  magnum: 0,
  'flashlight-pistol': 0,
  'explosive-crossbow': 0,
  railgun: 0.1,
  flamethrower: 0,
  'crimson-flamethrower': 0,
  'flare-gun': 0,
});

export function authoredNearPlaneContactRetreat(weapon: WeaponId, surfaceRetreat: number): number {
  const contactBlend = THREE.MathUtils.clamp(
    surfaceRetreat / VIEWMODEL_NEAR_PLANE_SAFE_RETREAT,
    0,
    1,
  );
  return FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT[weapon] * contactBlend;
}

// ---------------------------------------------------------------------------
// MEASURED CONTACT FOLD
//
// Owner, across several passes and again this morning: "the gun clipping is
// still happening everywhere". Every previous fix went green and did not work,
// because every previous gate asserted on a pure REDUCER while the renderer
// applied something else. Measured at HEAD, eye 0.40 m from a wall: the
// reducer asked for 0.78 m of retreat, the renderer performed 0.28 m (the
// VIEWMODEL_NEAR_PLANE_SAFE_RETREAT clamp, minus the authored contact retreat
// on top), and the carbine muzzle finished 0.889 m PAST the wall. The sniper -
// the longer gun - travelled LESS (0.14 m) and finished 0.937 m through.
//
// Retreat alone cannot fix that. A rig whose muzzle sits ~1.96 m in front of
// the eye needs ~1.6 m of translation to clear a wall 0.40 m away, which puts
// the whole weapon behind the camera. What DOES fix it is what shipped
// first-person games do at muzzle-contact range: fold the weapon up so its
// forward reach collapses, retreat what is left, and shrink slightly. Forward
// reach under a pitch of t is dominated by cos(t): at 0.82 rad (the authored
// ceiling) a 0.88 m barrel still reaches 0.60 m forward of the root; at
// 1.40 rad it reaches 0.03 m.
//
// So the fold is SOLVED, not authored. Given the rig's measured root-local
// bounds and the measured distance to the surface, find the smallest fold that
// puts the forward-most rig point at or behind the surface while keeping the
// nearest rig point in front of the camera near plane. One authored bound
// remains - how far a rig may fold before it reads as inside-out - and it is a
// single physical limit rather than a per-weapon guess.
// ---------------------------------------------------------------------------

export const VIEWMODEL_CONTACT_FOLD_CONTRACT = 'measured-viewmodel-contact-fold-v2';
/** Hard ceiling on total high-ready pitch. Beyond this the rig reads inside-out. */
export const VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS = 1.5;
/** Extra shrink at full fold, on top of the authored contact response scale. */
export const VIEWMODEL_CONTACT_FOLD_MINIMUM_SCALE = 0.72;
/** Stand-off kept between the forward-most rig point and the contact surface. */
export const VIEWMODEL_CONTACT_FOLD_MARGIN_METERS = 0.06;
/** Bisection steps. The solve is nine transformed points per step. */
const CONTACT_FOLD_SOLVE_STEPS = 14;
/** Samples of the fold family walked when no fold can close the gap. */
const CONTACT_FOLD_MINIMISER_SAMPLES = 32;

/**
 * THE CUT.
 *
 * Measured on 2026-08-31, and this is the honest finding of this pass: at the
 * owner's failing distance the rig physically cannot fold far enough.
 *
 * The forward-most point the renderer can achieve is bounded from below by
 *
 *     forwardExtent >= nearPlane + depth(fold)
 *
 * because the rearmost point must stay in front of the near plane. With the
 * eye 0.40 m off a wall the budget is 0.34 m of extent against a 0.11 m near
 * plane, so the complete rig - weapon AND arms - would have to be no more than
 * 0.23 m deep along the view axis. The measured chain is not: at full fold the
 * shoulder entry alone sits 0.69 m from the eye and the sleeve reaches 0.86 m,
 * and no pitch fixes that, because pitching about the root swings the arms'
 * low-hanging geometry FORWARD (measured: the offending vertex is skinned to
 * UpperArmR). More fold makes the arms worse, not better.
 *
 * So the fold does everything it can, and what still cannot move is CUT at the
 * contacting surface instead of painted over it. The viewmodel draws on a
 * depth-cleared overlay, which is exactly why geometry past the wall is
 * visible in the first place; a clean cut at the wall plane is what the wall
 * would have done if the overlay were not there.
 *
 * An arms TUCK was built and then removed on the evidence. Pulling the
 * shoulder entry in along its own projection ray does shorten the chain's
 * depth (measured: sleeve reach 0.86 m to 0.70 m), but it also drags the
 * sleeve toward the lens, and the 2560x1440 frame showed a mint sleeve filling
 * the lower third of the screen - visibly worse than the clipping it was meant
 * to spare. It is not needed either: the shoulder entry is placed BELOW the
 * frame by contract, so cutting the shoulder end of the chain costs nothing on
 * screen. The cut is the whole fallback.
 *
 * The plane lives on the viewmodel root, which is marked as a clipping group.
 * `ClippingGroup` is only exported from `three/webgpu`, so the flag set is
 * duck-typed here rather than importing a second three entry point into a
 * module that also runs headless. WebGPURenderer reads exactly these fields
 * (`Renderer.js`: `object.isClippingGroup && object.enabled`).
 */
export const VIEWMODEL_CONTACT_CLIP_CONTRACT = 'viewmodel-contact-surface-clip-v1';
/**
 * The cut sits this far CAMERA-SIDE of the measured surface. The surface is
 * sampled by a padded lattice whose reported distance is conservative to the
 * millimetre, not to the centimetre, and a cut exactly on the plane z-fights
 * the wall it is cutting against.
 */
export const VIEWMODEL_CONTACT_CLIP_MARGIN_METERS = 0.02;
/** Where the contact plane rests when nothing is being clipped. Far enough
 * that the whole rig is on the kept side, so the plane is a no-op without
 * ever changing the clipping state. */
const VIEWMODEL_CONTACT_CLIP_PARKED_METERS = 1_000;

/** The viewmodel root, with the WebGPU clipping-group fields it publishes. */
type ViewmodelClippingRoot = THREE.Group & {
  isClippingGroup: boolean;
  enabled: boolean;
  clipIntersection: boolean;
  clipShadows: boolean;
  clippingPlanes: THREE.Plane[];
};

/** The rig's own bounds, in the viewmodel root's LOCAL frame. Measured, never authored. */
export type ViewmodelRigBounds = Readonly<{
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  /** Root-local muzzle point: the authored socket where the model has one. */
  muzzleX: number; muzzleY: number; muzzleZ: number;
  /**
   * Convex hull, in the root-local (y, z) plane, of every PER-MESH bound
   * corner. The fold pitches about X, so depth under a fold is a support
   * query in exactly this plane and only hull points can ever answer it.
   *
   * One whole-rig AABB is not good enough here and the difference is the fix.
   * Measured on the carbine: the rig box spans y -0.430..0.355 and
   * z -0.894..0.713, so its rear-top corner is (0.355, 0.713) - the height of
   * the optic at the depth of the stock butt, where the weapon has no material
   * at all. Pitched to the stow angle that corner sits 7 cm further back than
   * any real geometry, and since the near plane is measured off the rearmost
   * point, that phantom corner alone cost ~7 cm of retreat. Per-mesh corners
   * keep the optic's height with the optic's depth.
   */
  hullYZ: readonly (readonly [number, number])[];
  /** Meshes the bounds were taken from. Zero means "no measurement, fall back". */
  meshes: number;
}>;

/** Monotone-chain convex hull. Small inputs (tens of points), run once per weapon. */
function convexHullYZ(points: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  if (points.length <= 3) return [...points];
  const sorted = [...points].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (
    o: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (input: readonly (readonly [number, number])[]): (readonly [number, number])[] => {
    const chain: (readonly [number, number])[] = [];
    for (const point of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop();
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...build(sorted), ...build([...sorted].reverse())];
}

export type ViewmodelContactFold = Readonly<{
  contract: typeof VIEWMODEL_CONTACT_FOLD_CONTRACT;
  engaged: boolean;
  /** Camera-space metres of retreat the renderer will actually perform. */
  retreatMeters: number;
  /** Extra high-ready pitch beyond the authored contact response, radians. */
  foldPitchRadians: number;
  /** Extra uniform scale factor beyond the authored contact response. */
  scale: number;
  /** Closest root z the camera near plane allows, given the folded rig. */
  nearPlaneLimitZ: number;
  /** Forward-most rig point after the solve, metres from the eye. */
  forwardReachMeters: number;
  /** Muzzle after the solve, metres from the eye. Telemetry, not the grade. */
  muzzleForwardMeters: number;
  /**
   * Metres of VISIBLE rig still past the surface once the fold has spent
   * everything it has. Zero is the acceptance condition, and it is measured on
   * `forwardReachMeters` - the silhouette - not on the muzzle socket.
   */
  residualMeters: number;
  /**
   * Camera-forward metres at which the rig is CUT, or null when nothing that
   * a plane can represent is in front of it. See
   * `VIEWMODEL_CONTACT_CLIP_CONTRACT`: the fold cannot always close the gap,
   * and what it cannot move is cut at the surface rather than painted over it.
   *
   * This is NOT `contactDepthMeters`. The fold's depth is the conservative
   * minimum over the padded lattice and may name a surface off to one side;
   * the cut's depth is the nearest surface the rig actually runs into.
   */
  clipPlaneDistanceMeters: number | null;
}>;

// Retained scratch for the once-per-weapon bounds measurement.
const rigBoundsToRoot = new THREE.Matrix4();
const rigBoundsMatrix = new THREE.Matrix4();
const rigBoundsAccumulator = new THREE.Box3();
const rigBoundsMesh = new THREE.Box3();
const rigBoundsVertex = new THREE.Vector3();

const CONTACT_FOLD_CLEAR: ViewmodelContactFold = Object.freeze({
  contract: VIEWMODEL_CONTACT_FOLD_CONTRACT,
  engaged: false,
  retreatMeters: 0,
  foldPitchRadians: 0,
  scale: 1,
  nearPlaneLimitZ: Number.POSITIVE_INFINITY,
  forwardReachMeters: 0,
  muzzleForwardMeters: 0,
  residualMeters: 0,
  clipPlaneDistanceMeters: null,
});

/**
 * Camera-space Z of a root-local point once the root has been pitched about X
 * by `pitch` and uniformly scaled. Yaw and roll are deliberately excluded: the
 * contact response drives them to at most ~0.18 rad, they shorten the forward
 * reach rather than lengthen it, and leaving them out keeps the solve
 * conservative instead of optimistic.
 */
function pitchedLocalZ(y: number, z: number, pitch: number, scale: number): number {
  return (y * Math.sin(pitch) + z * Math.cos(pitch)) * scale;
}

/**
 * Depth span of the rig once pitched, in camera-space metres relative to the
 * root: `muzzle` is the barrel exit, `back` the rearmost hull point (the
 * near-plane constraint), `front` the forward-most hull point.
 *
 * `front` IS the fold's target, and correcting that is the point of this pass.
 *
 * The previous revision targeted `muzzle` on the grounds that a pitched
 * axis-aligned box juts ~28 cm past any real geometry. That reasoning applied
 * to a whole-rig AABB and stopped applying the moment `hullYZ` became a hull
 * of real VERTICES: measured in installed Chrome on 2026-08-31, the carbine's
 * furthest-forward vertex is its magazine, not its muzzle, and it finished
 * 0.572 m from the eye against a surface at 0.400 m while the muzzle sat
 * correctly at 0.351 m. The muzzle socket is one authored point; it is not the
 * silhouette, and grading on it is how this shipped twice.
 */
function rigDepthSpan(
  bounds: ViewmodelRigBounds,
  pitch: number,
  scale: number,
): { front: number; back: number; muzzle: number } {
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  let front = Number.POSITIVE_INFINITY;
  let back = Number.NEGATIVE_INFINITY;
  for (const point of bounds.hullYZ) {
    const rotated = (point[0] * sin + point[1] * cos) * scale;
    if (rotated < front) front = rotated;
    if (rotated > back) back = rotated;
  }
  const muzzle = pitchedLocalZ(bounds.muzzleY, bounds.muzzleZ, pitch, scale);
  return { front: Math.min(front, muzzle), back: Math.max(back, muzzle), muzzle };
}

/**
 * Solves the fold. Pure: everything it needs is an argument, so the gate can
 * assert on the transform the renderer applies rather than on a reducer's
 * return value - which is precisely the gap five defects hid in.
 *
 * Returns an unengaged result when there is nothing to solve against - no
 * measured rig, or no obstruction inside the envelope - and the renderer then
 * keeps its historical unmeasured behaviour exactly.
 */
export function solveViewmodelContactFold(input: {
  bounds: ViewmodelRigBounds | null;
  /** Measured metres from the eye to the surface, or null when clear. */
  contactDepthMeters: number | null;
  /**
   * Metres to the surface that PLACES THE CUT, or null when nothing in front
   * of the rig can place a plane. Defaults to `contactDepthMeters` so a caller
   * that has only the conservative number keeps the old behaviour exactly.
   */
  contactCutDepthMeters?: number | null;
  /** Root z with the authored contact retreat already subtracted, no fold. */
  baseRootZ: number;
  /** Root z the authored response alone would reach (base + authored retreat). */
  authoredRootZ: number;
  /** Authored contact-response pitch already going into the root rotation. */
  basePitchRadians: number;
  /** Root uniform scale the authored response already produces. */
  baseScale: number;
  /** camera.near plus the viewmodel's near-plane clearance. */
  nearPlaneMeters: number;
  maximumPitchRadians?: number;
  marginMeters?: number;
}): ViewmodelContactFold {
  const { bounds } = input;
  const depth = input.contactDepthMeters;
  if (!bounds || bounds.meshes <= 0 || depth === null || !Number.isFinite(depth)) return CONTACT_FOLD_CLEAR;
  // THE CUT'S OWN DEPTH. `depth` above is the conservative lattice minimum and
  // it keeps driving the fold: the pose should retreat from anything nearby,
  // whichever side it is on. The plane is different - it can only stand in for
  // a surface the rig runs INTO - so it is placed by the on-axis sweep. When
  // the caller has no such number (headless callers, and every gate written
  // before this pass) the two are the same and nothing moves.
  const cutDepth = input.contactCutDepthMeters === undefined ? depth : input.contactCutDepthMeters;
  const clipPlaneDistanceMeters = cutDepth !== null && Number.isFinite(cutDepth) ? cutDepth : null;
  const maximumPitch = Math.max(
    input.basePitchRadians,
    input.maximumPitchRadians ?? VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS,
  );
  const margin = input.marginMeters ?? VIEWMODEL_CONTACT_FOLD_MARGIN_METERS;
  const target = Math.max(0, depth - margin);
  const baseScale = Math.max(1e-4, input.baseScale);

  // What the pose does with no fold at all. If that is already clear, the
  // authored response is untouched and this frame costs one evaluation.
  const evaluate = (fold: number, allowExtraRetreat = false): ViewmodelContactFold => {
    const pitch = input.basePitchRadians + fold * (maximumPitch - input.basePitchRadians);
    const scaleFactor = 1 - fold * (1 - VIEWMODEL_CONTACT_FOLD_MINIMUM_SCALE);
    const span = rigDepthSpan(bounds, pitch, baseScale * scaleFactor);
    // rootZ <= -(near) - back keeps the nearest rig point in front of the near
    // plane; rootZ >= -target - front puts the forward-most point behind the
    // surface. Retreat as far as contact demands, never past the near plane,
    // and never forward of where the authored response already sits.
    const nearPlaneLimitZ = -input.nearPlaneMeters - span.back;
    // THE CORRECTED TARGET. `span.front` is the forward-most VERTEX of every
    // visible weapon mesh - magazine, stock, optic, muzzle device - not the
    // authored muzzle socket. On the carbine those differ by 0.22 m, and that
    // difference is exactly what the owner still saw through the wall.
    const demandedZ = -target - span.front;
    // Retreat only as far as the geometry needs, never past the near plane,
    // and never past what the authored response already asked for. Folding is
    // preferred over retreating on purpose: retreat drags the arms toward the
    // lens (the reason a blanket 0.28 m cap was here in the first place),
    // while folding shortens the rig's reach without moving it at the camera.
    const rootZCeiling = allowExtraRetreat
      ? nearPlaneLimitZ
      : Math.min(nearPlaneLimitZ, input.authoredRootZ);
    const rootZ = Math.min(rootZCeiling, Math.max(input.baseRootZ, demandedZ));
    const muzzleForward = -(rootZ + span.muzzle);
    const forwardReach = -(rootZ + span.front);
    return Object.freeze({
      contract: VIEWMODEL_CONTACT_FOLD_CONTRACT,
      // True for every result the solve actually produced. The renderer uses
      // it to choose between the solved translation and the historical
      // unmeasured clamp, so it must NOT flicker with how much retreat this
      // particular frame needed.
      engaged: true,
      retreatMeters: Math.max(0, rootZ - input.baseRootZ),
      foldPitchRadians: pitch - input.basePitchRadians,
      scale: scaleFactor,
      nearPlaneLimitZ,
      forwardReachMeters: forwardReach,
      muzzleForwardMeters: muzzleForward,
      // Graded on the SILHOUETTE, not on the socket.
      residualMeters: Math.max(0, forwardReach - target),
      // Everything past the contacting surface is inside it. The viewmodel
      // draws on a depth-cleared overlay, so that geometry is not occluded by
      // the wall - it is painted over it, which is what "the gun is clipping
      // through the wall" looks like. When the fold cannot close the gap the
      // renderer cuts the rig at the surface instead; see
      // `applyViewmodelContactClip`.
      clipPlaneDistanceMeters,
    });
  };

  const bisect = (allowExtraRetreat: boolean): ViewmodelContactFold | null => {
    if (evaluate(0, allowExtraRetreat).residualMeters <= 0) return evaluate(0, allowExtraRetreat);
    if (evaluate(1, allowExtraRetreat).residualMeters > 0) return null;
    let low = 0;
    let high = 1;
    for (let step = 0; step < CONTACT_FOLD_SOLVE_STEPS; step += 1) {
      const mid = (low + high) / 2;
      if (evaluate(mid, allowExtraRetreat).residualMeters > 0) low = mid; else high = mid;
    }
    return evaluate(high, allowExtraRetreat);
  };
  // Stage one: close it with the fold, spending no more retreat than the
  // authored response already asked for. Stage two, only if that cannot close
  // it: spend retreat up to the near plane as well.
  const closed = bisect(false) ?? bisect(true);
  if (closed) return closed;
  // Stage three: it does not close, and no parameter in this design can make
  // it. The forward-most point is bounded from below by
  //
  //     forwardReach >= nearPlane + (back(fold) - front(fold))
  //
  // because the rearmost point may not cross the near plane, and at the
  // owner's 0.40 m that leaves 0.23 m of depth for a rig measured far deeper
  // than that. So SEARCH for the least-bad fold instead of assuming the
  // hardest one is it: maximum pitch minimises a long barrel's reach but not
  // necessarily the whole hull's DEPTH, and depth is what is binding here.
  // Measured on the carbine this recovers a few centimetres over evaluate(1),
  // and it makes the result the minimum of the family rather than an endpoint,
  // which is a property a gate can actually assert.
  let best = evaluate(1, true);
  for (let step = 0; step <= CONTACT_FOLD_MINIMISER_SAMPLES; step += 1) {
    const candidate = evaluate(step / CONTACT_FOLD_MINIMISER_SAMPLES, true);
    if (candidate.forwardReachMeters < best.forwardReachMeters - 1e-9) best = candidate;
  }
  return best;
}

/**
 * The viewmodel is framed for a 16:9 viewport at the default field of view.
 * Pixel resolution does not change perspective framing: 2560x1440 and
 * 3840x2160 must therefore produce the same relative viewmodel size. Vertical
 * FOV does change it, while ultrawide aspect only changes horizontal context;
 * use a small square-root compensation for the latter instead of multiplying
 * by the full aspect ratio and making 21:9 rigs huge and excessively low.
 */
const VIEWMODEL_REFERENCE_ASPECT = 16 / 9;
const VIEWMODEL_REFERENCE_FOV_DEGREES = 75;

function viewmodelAspectScale(aspect: number): number {
  const normalized = Number.isFinite(aspect) && aspect > 0 ? aspect : VIEWMODEL_REFERENCE_ASPECT;
  return THREE.MathUtils.clamp(Math.sqrt(normalized / VIEWMODEL_REFERENCE_ASPECT), 0.96, 1.12);
}

function viewmodelFovScale(fovDegrees: number): number {
  const fov = Number.isFinite(fovDegrees) && fovDegrees > 1 ? fovDegrees : VIEWMODEL_REFERENCE_FOV_DEGREES;
  const reference = Math.tan(THREE.MathUtils.degToRad(VIEWMODEL_REFERENCE_FOV_DEGREES) / 2);
  return THREE.MathUtils.clamp(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / reference, 0.85, 2.4);
}

export function viewmodelViewportScale(aspect: number, fovDegrees: number): number {
  return viewmodelAspectScale(aspect) * viewmodelFovScale(fovDegrees);
}

export function viewmodelMeleeLateralOffset(aspect: number): number {
  const normalized = Number.isFinite(aspect) && aspect > 0 ? aspect : VIEWMODEL_REFERENCE_ASPECT;
  const aspectRatio = normalized / VIEWMODEL_REFERENCE_ASPECT;
  // A camera-space offset must grow with horizontal frustum width to retain
  // the same screen-space entry point. The arm root also receives the bounded
  // ultrawide scale compensation, so add a small overdraw term beyond 16:9 to
  // keep its skinned shoulder (not the hand) connected to the physical edge.
  // The knife-tip lane remains independently gated near centre-right.
  return THREE.MathUtils.clamp(1.37 * aspectRatio + Math.max(0, aspectRatio - 1) * 0.58, 1.18, 2.05);
}

function viewmodelScreenScale(camera: THREE.Camera): number {
  if (!(camera instanceof THREE.PerspectiveCamera)) return 1;
  return viewmodelViewportScale(camera.aspect, camera.fov);
}

function viewmodelScreenDrop(camera: THREE.Camera): number {
  return THREE.MathUtils.clamp((viewmodelScreenScale(camera) - 1) * 0.18, -0.025, 0.14);
}

function viewmodelMeleeScreenOffset(camera: THREE.Camera): number {
  return viewmodelMeleeLateralOffset(camera instanceof THREE.PerspectiveCamera ? camera.aspect : VIEWMODEL_REFERENCE_ASPECT);
}

const FIRST_PERSON_ADS_BORE_RADIUS: Readonly<Partial<Record<WeaponId, number>>> = Object.freeze({
  'mini-uzi': 0.024,
});
export const COMPACT_OPTIC_ADS_PRESENTATION_CONTRACT = 'authored-optic-assembly-eye-scale-v1' as const;
/**
 * How much larger the authored compact optic presents at settled ADS.
 *
 * HF-405. The crossbow's optic is authored at true size on a viewmodel that
 * sits about 1.2 m from the eye, so its ocular subtends barely 36 px on a
 * 720p frame: a correct 1.5x whose glass and reticle are too small to read as
 * glass or reticle. The physical weapon cannot simply be brought closer — the
 * stock would pass through the camera — so the OPTIC alone grows about its
 * own authored socket as the aim blend completes, which is the same thing the
 * shooter's eye moving up behind it would do. Hip presentation is untouched
 * (the factor is 1 at zero blend) and no socket, bore or aim ray moves: the
 * assembly's scale and its compensating position are the only writes.
 */
export const COMPACT_OPTIC_ADS_EYE_SCALE = 1.85;

const FIRST_PERSON_ADS_SIGHT_PICTURE_RETREAT: Readonly<Partial<Record<WeaponId, number>>> = Object.freeze({
  // The authored muzzle/front-sight geometry extends close to the camera when
  // its rear socket is centred. A bounded ADS-only retreat keeps the opaque
  // authored silhouette and arms below the physical sight window without
  // changing the source model, sockets or authoritative aim ray.
  carbine: 0.26,
  'mini-uzi': 0.3,
});

type AdsSightBoreTelemetry = Readonly<{
  applied: boolean;
  contract: 'physical-aperture-spatial-degenerate-v1';
  radius: number;
  rayCount: number;
  suppressedElements: number;
  batches: ReadonlyArray<Readonly<{ mesh: string; submittedElements: number; suppressedElements: number }>>;
}>;

/**
 * Punches a small, real aperture through only the cloned first-person render
 * batches intersecting the authored rear-to-front sight axis. The carbine's
 * authored optic is genuine clear space once its optic socket is centred, so
 * it deliberately does not use this geometry-degeneration fallback. The Mini
 * Uzi retains the fallback for its merged iron-sight plate. Degenerating
 * intersected cloned indices keeps sockets, materials and source topology
 * stable.
 */
export function carveFirstPersonAdsSightBore(id: WeaponId, model: THREE.Object3D): AdsSightBoreTelemetry | null {
  const radius = FIRST_PERSON_ADS_BORE_RADIUS[id];
  if (!radius) return null;
  const rearSocket = model.getObjectByName('rear-sight-socket');
  const frontSocket = model.getObjectByName('front-sight-socket');
  if (!rearSocket || !frontSocket) return null;

  model.updateMatrixWorld(true);
  const rear = model.worldToLocal(rearSocket.getWorldPosition(new THREE.Vector3()));
  const front = model.worldToLocal(frontSocket.getWorldPosition(new THREE.Vector3()));
  const axis = front.clone().sub(rear).normalize();
  if (![...rear.toArray(), ...front.toArray(), ...axis.toArray()].every(Number.isFinite) || axis.lengthSq() < 0.99) return null;

  const lateral = new THREE.Vector3(1, 0, 0);
  if (Math.abs(lateral.dot(axis)) > 0.9) lateral.set(0, 1, 0);
  lateral.addScaledVector(axis, -lateral.dot(axis)).normalize();
  const vertical = new THREE.Vector3().crossVectors(axis, lateral).normalize();
  const start = rear.clone().addScaledVector(axis, -0.12);
  const end = front.clone().addScaledVector(axis, 0.08);
  const maximumDistance = start.distanceTo(end);
  const rayOffsets = Object.freeze([
    [0, 0],
    [-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55],
    [-0.42, -0.42], [-0.42, 0.42], [0.42, -0.42], [0.42, 0.42],
  ] as const);
  const rays = rayOffsets.map(([x, y]) => new THREE.Ray(
    start.clone().addScaledVector(lateral, x * radius).addScaledVector(vertical, y * radius),
    axis,
  ));
  const inverseModelWorld = model.matrixWorld.clone().invert();
  const meshToModel = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const batches: Array<Readonly<{ mesh: string; submittedElements: number; suppressedElements: number }>> = [];
  let suppressedElements = 0;

  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.name.includes('Runtime_static')) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const elementCount = index?.count ?? 0;
    if (!position || position.itemSize < 3 || !index || elementCount < 3 || elementCount % 3 !== 0) return;
    meshToModel.multiplyMatrices(inverseModelWorld, node.matrixWorld);
    let batchSuppressed = 0;
    for (let element = 0; element < elementCount; element += 3) {
      const ia = index.getX(element);
      const ib = index.getX(element + 1);
      const ic = index.getX(element + 2);
      if (ia === ib && ib === ic) continue;
      a.fromBufferAttribute(position, ia).applyMatrix4(meshToModel);
      b.fromBufferAttribute(position, ib).applyMatrix4(meshToModel);
      c.fromBufferAttribute(position, ic).applyMatrix4(meshToModel);
      const blocksAperture = rays.some((ray) => {
        const intersection = ray.intersectTriangle(a, b, c, false, hit);
        return intersection !== null && ray.origin.distanceTo(intersection) <= maximumDistance;
      });
      if (!blocksAperture) continue;
      index.setX(element + 1, ia);
      index.setX(element + 2, ia);
      batchSuppressed += 3;
    }
    if (batchSuppressed === 0) return;
    index.needsUpdate = true;
    node.userData.firstPersonAdsSightBore = Object.freeze({
      submittedElements: elementCount,
      suppressedElements: batchSuppressed,
      radius,
    });
    batches.push(Object.freeze({ mesh: node.name, submittedElements: elementCount, suppressedElements: batchSuppressed }));
    suppressedElements += batchSuppressed;
  });

  const telemetry: AdsSightBoreTelemetry = Object.freeze({
    applied: suppressedElements > 0,
    contract: 'physical-aperture-spatial-degenerate-v1',
    radius,
    rayCount: rays.length,
    suppressedElements,
    batches: Object.freeze(batches),
  });
  model.userData.firstPersonAdsSightBore = telemetry;
  return telemetry;
}

type RearOccluderTrimTelemetry = Readonly<{
  applied: boolean;
  contract: 'rear-sight-axis-spatial-degenerate-v1';
  radius: number;
  rayCount: number;
  submittedElements: number;
  suppressedElements: number;
  suppressionRatio: number;
  batches: ReadonlyArray<Readonly<{ mesh: string; submittedElements: number; suppressedElements: number }>>;
}>;

/** Removes only merged butt/stock triangles intersecting the rear sight corridor. */
export function trimFirstPersonRearOccluder(id: WeaponId, model: THREE.Object3D): RearOccluderTrimTelemetry | null {
  if (id !== 'mini-uzi') return null;
  const rearSocket = model.getObjectByName('rear-sight-socket');
  const frontSocket = model.getObjectByName('front-sight-socket');
  if (!rearSocket || !frontSocket) return null;
  model.updateMatrixWorld(true);
  const rear = model.worldToLocal(rearSocket.getWorldPosition(new THREE.Vector3()));
  const front = model.worldToLocal(frontSocket.getWorldPosition(new THREE.Vector3()));
  const axis = front.clone().sub(rear).normalize();
  if (axis.lengthSq() < 0.99) return null;
  const radius = 0.05;
  const lateral = new THREE.Vector3(1, 0, 0);
  if (Math.abs(lateral.dot(axis)) > 0.9) lateral.set(0, 1, 0);
  lateral.addScaledVector(axis, -lateral.dot(axis)).normalize();
  const vertical = new THREE.Vector3().crossVectors(axis, lateral).normalize();
  const start = rear.clone().addScaledVector(axis, -0.38);
  const end = rear.clone().addScaledVector(axis, 0.015);
  const maximumDistance = start.distanceTo(end);
  const rayOffsets = Object.freeze([
    [0, 0],
    [-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55],
    [-0.42, -0.42], [-0.42, 0.42], [0.42, -0.42], [0.42, 0.42],
  ] as const);
  const rays = rayOffsets.map(([x, y]) => new THREE.Ray(
    start.clone().addScaledVector(lateral, x * radius).addScaledVector(vertical, y * radius),
    axis,
  ));
  const inverseModelWorld = model.matrixWorld.clone().invert();
  const meshToModel = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const batches: Array<Readonly<{ mesh: string; submittedElements: number; suppressedElements: number }>> = [];
  let submittedElements = 0;
  let suppressedElements = 0;
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.name.includes('Runtime_static')) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const elementCount = index?.count ?? 0;
    if (!position || position.itemSize < 3 || !index || elementCount < 3 || elementCount % 3 !== 0) return;
    submittedElements += elementCount;
    meshToModel.multiplyMatrices(inverseModelWorld, node.matrixWorld);
    let batchSuppressed = 0;
    for (let element = 0; element < elementCount; element += 3) {
      const ia = index.getX(element);
      const ib = index.getX(element + 1);
      const ic = index.getX(element + 2);
      if (ia === ib && ib === ic) continue;
      a.fromBufferAttribute(position, ia).applyMatrix4(meshToModel);
      b.fromBufferAttribute(position, ib).applyMatrix4(meshToModel);
      c.fromBufferAttribute(position, ic).applyMatrix4(meshToModel);
      const blocksCorridor = rays.some((ray) => {
        const intersection = ray.intersectTriangle(a, b, c, false, hit);
        return intersection !== null && ray.origin.distanceTo(intersection) <= maximumDistance;
      });
      if (!blocksCorridor) continue;
      index.setX(element + 1, ia);
      index.setX(element + 2, ia);
      batchSuppressed += 3;
    }
    if (batchSuppressed === 0) return;
    index.needsUpdate = true;
    batches.push(Object.freeze({ mesh: node.name, submittedElements: elementCount, suppressedElements: batchSuppressed }));
    suppressedElements += batchSuppressed;
  });
  const telemetry: RearOccluderTrimTelemetry = Object.freeze({
    applied: suppressedElements > 0,
    contract: 'rear-sight-axis-spatial-degenerate-v1',
    radius,
    rayCount: rays.length,
    submittedElements,
    suppressedElements,
    suppressionRatio: submittedElements > 0 ? suppressedElements / submittedElements : 0,
    batches: Object.freeze(batches),
  });
  model.userData.firstPersonRearOccluderTrim = telemetry;
  return telemetry;
}

/**
 * The release GLB keeps semantic stock nodes, but its renderable material
 * batches have already been merged beneath `weapon-frame`; hiding the empty
 * `weapon-stock` node therefore cannot hide any pixels. Degenerate only the
 * cloned first-person indices whose evaluated centroid is behind the receiver,
 * so ADS presents the charging handle and real aperture instead of a butt pad
 * or buffer tube filling half the viewport. Source geometry, sockets, index
 * counts and release telemetry stay immutable.
 */
function trimM4a1FirstPersonRearStock(model: THREE.Object3D): void {
  const rearThreshold = 0.29;
  model.updateMatrixWorld(true);
  const inverseModelWorld = model.matrixWorld.clone().invert();
  const meshToModel = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  const trimmed: Array<Readonly<{ mesh: string; submittedElements: number; suppressedElements: number }>> = [];
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.name.includes('Runtime_static')) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize < 3) return;
    const index = geometry.index;
    const elementCount = index?.count ?? 0;
    if (!index || elementCount < 6 || elementCount % 3 !== 0) return;
    meshToModel.multiplyMatrices(inverseModelWorld, node.matrixWorld);
    let suppressedElements = 0;
    for (let element = 0; element < elementCount; element += 3) {
      let centroidZ = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = index.getX(element + corner);
        vertex.fromBufferAttribute(position, vertexIndex).applyMatrix4(meshToModel);
        centroidZ += vertex.z / 3;
      }
      if (centroidZ <= rearThreshold) continue;
      const anchor = index.getX(element);
      index.setX(element + 1, anchor);
      index.setX(element + 2, anchor);
      suppressedElements += 3;
    }
    if (suppressedElements < 12) return;
    index.needsUpdate = true;
    node.userData.firstPersonRearStockTrim = Object.freeze({
      submittedElements: elementCount,
      suppressedElements,
      rearThreshold,
      contract: 'cloned-index-spatial-degenerate-v1',
    });
    trimmed.push(Object.freeze({ mesh: node.name, submittedElements: elementCount, suppressedElements }));
  });
  model.userData.firstPersonRearStockTrim = Object.freeze({
    applied: trimmed.length > 0,
    rearThreshold,
    batches: Object.freeze(trimmed),
  });
}

const FIRST_PERSON_HIDDEN_NODES: Readonly<Record<WeaponId, ReadonlySet<string>>> = Object.freeze({
  carbine: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  smg: new Set(['smg-stock-rod', 'wire-stock-pad']),
  lmg: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  scattergun: new Set(['stock', 'stock-cheek-panel']),
  sniper: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  railgun: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  pistol: new Set<string>(),
  magnum: new Set<string>(),
  'machine-pistol': new Set<string>(),
  'mini-uzi': new Set(['smg-stock-rod', 'wire-stock-pad', 'mini-uzi-compact-stock']),
  mp5: new Set(['smg-stock-rod', 'wire-stock-pad']),
  m4a1: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  'ak-47': new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  minigun: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  'm14-ebr': new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  'slug-shotgun': new Set(['stock', 'stock-cheek-panel']),
  'flashlight-pistol': new Set<string>(),
  'explosive-crossbow': new Set<string>(),
  flamethrower: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  'crimson-flamethrower': new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
  'flare-gun': new Set<string>(),
});

function prepareFirstPersonWeaponModel(
  id: WeaponId,
  model: THREE.Group,
  flattenMaterials: boolean,
  requirePhysicalAdsAperture: boolean,
): THREE.Group {
  model.traverse((node) => {
    if (FIRST_PERSON_HIDDEN_NODES[id].has(node.name)) node.visible = false;
  });
  if (id === 'm4a1') trimM4a1FirstPersonRearStock(model);
  const rearOccluderTrim = trimFirstPersonRearOccluder(id, model);
  if (requirePhysicalAdsAperture && FIRST_PERSON_ADS_BORE_RADIUS[id] && !rearOccluderTrim?.applied) {
    throw new Error(`${id} first-person rear occluder trim is missing or did not intersect rendered geometry`);
  }
  const adsSightBore = carveFirstPersonAdsSightBore(id, model);
  if (requirePhysicalAdsAperture && FIRST_PERSON_ADS_BORE_RADIUS[id] && !adsSightBore?.applied) {
    throw new Error(`${id} first-person ADS sight bore is missing or did not intersect rendered geometry`);
  }
  if (id === 'carbine') {
    const reticle = model.getObjectByName('optic-reticle');
    if (reticle instanceof THREE.Mesh && reticle.material instanceof THREE.MeshBasicMaterial) {
      reticle.material = reticle.material.clone();
      reticle.material.depthTest = false;
      reticle.material.depthWrite = false;
      reticle.renderOrder = 1_000;
    }
  }
  // The first-person weapon is the most-seen surface in the game. Even in
  // reduced-render mode it must keep its authored texture maps and UVs —
  // 'palette-basic' collapsed it to a flat unlit white silhouette, which
  // reads as a missing asset. 'texture-lit' preserves mapped materials and
  // their UV/normal attributes while still batching static parts into one
  // draw call, so Performance keeps the authored look at near-zero extra cost.
  if (flattenMaterials && id !== 'explosive-crossbow') optimizeAttachedWeapon(model, 'texture-lit');
  return model;
}

/**
 * HF-366: the ambient fill now carries the SELECTED SKIN's hue rather than one
 * fixed neutral grey. Without this the fill washed the palette tint back out in
 * dark arenas - which is where the owner would be looking at their arms - and
 * it also overwrote the accent glow the palette had just set. The luminance of
 * each authored fill is preserved; only its hue moves, and only part way.
 */
/**
 * HF-388 follow-up: the single term that was washing the first-person arm out.
 *
 * This light sits 0.61 m from the arm surface (MEASURED live, not the authored
 * 0.4 - it hangs off a SCALED viewmodel root) with decay 2, so at the previous
 * 17.5 cd it delivered roughly 47 lux to a surface the player views from 60 cm.
 * On a rough dielectric most of that comes back as a broad, WHITE, Fresnel-
 * driven specular sheen, and the sheen is what the owner was looking at:
 *
 *   Measured on real WebGPU, arm pixels only, difference-masked against a
 *   frame with the arms hidden (scripts/qa/probe-hf388-arm-lighting.mjs):
 *     - Nuke Town sunset, shipped:                       mean 140.5
 *     - the same frame with the arm albedo forced BLACK: mean 100.5
 *   Three quarters of the arm's screen brightness was reflected white light
 *   that its own colour had nothing to do with. That is why a #2c656d teal
 *   sleeve rendered as pale mint, why the palette stopped being readable, and
 *   why the normal and roughness maps stopped reading at all - the surface was
 *   parked in the tone-mapping shoulder, where local detail is compressed away.
 *
 * It is also why the arm did not sit in the arena at all: below deck on High
 * Seas the shipped arm measured mean 130.2 against 140.5 in full sunset. It
 * carried its own daylight into a dark corridor.
 *
 * 4.5 cd was chosen by sweep, not by taste. The arena's own contribution to the
 * arm measures 53 in BOTH arenas, and at 4.5:
 *     - Nuke Town sunset:     mean 98.4, near-clipping 4.0% -> 0.8%
 *     - High Seas below deck: mean 105.1, p05 14.0 - readable, no black wedge
 * The dark end is the expensive historical failure on this project, so it is
 * the bound checked hardest: the arm must never go back to a flat silhouette,
 * and at 4.5 it does not.
 */
export const FIRST_PERSON_VIEWMODEL_FILL_INTENSITY = 4.5;

const ARM_FILL_SKIN_BLEND = 0.86;
const armFillScratch = new THREE.Color();
const armFillTintScratch = new THREE.Color();

/**
 * HF-366 second pass. The previous version renormalised the palette tint to the
 * luminance of a fixed dark grey before blending, which is a saturation killer:
 * whatever colour went in, a near-grey came out, and the fill then washed the
 * remaining tint back out of the sleeve. Combined with a base-colour map whose
 * mean was 30/255, that is the whole mechanism by which four different skins
 * produced one grey arm.
 *
 * The fill now keeps the palette's own hue and only borrows the authored grey's
 * ROLE - a low, bounded ambient floor for dark arenas - by scaling it, never by
 * averaging its colour in.
 */
function armFillEmissive(base: number, tint: number): THREE.Color {
  armFillScratch.setHex(base);
  const baseLuminance = armFillScratch.r * 0.2126 + armFillScratch.g * 0.7152 + armFillScratch.b * 0.0722;
  armFillTintScratch.setHex(tint);
  const tintLuminance = Math.max(1e-4, armFillTintScratch.r * 0.2126 + armFillTintScratch.g * 0.7152 + armFillTintScratch.b * 0.0722);
  // Scale the tint to the authored fill's brightness, then keep almost all of
  // the tint. The authored grey survives only as the brightness budget.
  armFillTintScratch.multiplyScalar(baseLuminance / tintLuminance);
  return armFillScratch.lerp(armFillTintScratch, ARM_FILL_SKIN_BLEND);
}

/**
 * HF-388 follow-up: the emissive-cap bypass, resolved.
 *
 * `FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY` declared a bound of 0.18 and this
 * pass then wrote 0.34-0.38 straight past it, so the constant documented a
 * contract nothing enforced and two readers disagreed about what shipped.
 *
 * It was left open because honouring it looked like it would halve the ambient
 * floor in dark arenas. MEASURED, that model is wrong twice over. On real
 * WebGPU, arm pixels only, three frames averaged, High Seas below deck with the
 * viewmodel fill at its new 4.5:
 *     capped 0.18 -> mean 105.13     bypassed 0.34/0.36 -> mean 105.38
 * with run-to-run spreads of 7.6 and 5.3. The cap costs 0.25 luminance points
 * inside a 7-point noise band - it is free. And emissive was never the floor:
 * with the fill OFF, emissive 0.34 measured microContrast 1.33 against 7.73
 * with emissive at zero. It does not light the arm, it FLATTENS it, because a
 * constant added everywhere is the one light that carries no form.
 *
 * The reduced-render path keeps its own higher authored values deliberately:
 * it runs with the viewmodel fill at ZERO (see the constructor), so there
 * emissive genuinely is the only floor and the measurement above - taken with
 * a live fill - says nothing about it. That path is not what the owner plays
 * and was not re-measured here.
 */
export const ARM_FILL_EMISSIVE_INTENSITY = Object.freeze({
  sleeve: Object.freeze({ lit: 0.16, reduced: 0.24 }),
  glove: Object.freeze({ lit: 0.17, reduced: 0.26 }),
  accent: Object.freeze({ lit: 0.18, reduced: 0.28 }),
  skin: Object.freeze({ lit: 0.13, reduced: 0.2 }),
});

export type ArmFillEmissiveRole = keyof typeof ARM_FILL_EMISSIVE_INTENSITY;

/**
 * The lit-path value is clamped STRUCTURALLY rather than by choosing numbers
 * that happen to sit under the bound, so a later edit to the table above cannot
 * silently re-open the bypass this replaced.
 */
export function armFillEmissiveIntensity(role: ArmFillEmissiveRole, flattenMaterials: boolean): number {
  const authored = ARM_FILL_EMISSIVE_INTENSITY[role];
  return flattenMaterials
    ? authored.reduced
    : Math.min(authored.lit, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
}

function tuneAuthoredFirstPersonArmMaterials(
  root: THREE.Object3D,
  flattenMaterials: boolean,
  skinId = 'default',
): void {
  const palette = operatorSkinPalette(skinId).arm;
  const materials = new Set<THREE.MeshStandardMaterial>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const candidates = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of candidates) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  });
  let adjusted = 0;
  for (const material of materials) {
    const name = String(material.userData.authoredArmMaterialName ?? material.name).toLowerCase();
    if (name.includes('arms_sleeve')) {
      material.emissive.copy(armFillEmissive(0x3b4542, palette.sleeve));
      material.emissiveIntensity = armFillEmissiveIntensity('sleeve', flattenMaterials);
    } else if (name.includes('arms_fingerglove')) {
      material.emissive.copy(armFillEmissive(0x454945, palette.fingerGlove));
      material.emissiveIntensity = armFillEmissiveIntensity('glove', flattenMaterials);
    } else if (name.includes('arms_glove')) {
      material.emissive.copy(armFillEmissive(0x454945, palette.glove));
      material.emissiveIntensity = armFillEmissiveIntensity('glove', flattenMaterials);
    } else if (name.includes('arms_armorpad') || name.includes('wristaccent')) {
      material.emissive.copy(armFillEmissive(0x3f4945, palette.accent));
      material.emissiveIntensity = armFillEmissiveIntensity('accent', flattenMaterials);
    } else if (name === 'skin') {
      material.emissive.setHex(0x3a3430);
      material.emissiveIntensity = armFillEmissiveIntensity('skin', flattenMaterials);
    } else {
      continue;
    }
    adjusted += 1;
  }
  // v2: same scheme (authored PBR, muted emissive, warm key), but the produced
  // emissive values changed - the lit path now honours
  // FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY instead of writing past it.
  root.userData.armMaterialPresentationContract = 'authored-pbr-muted-emissive-warm-key-v2';
  root.userData.armMaterialPresentationAdjusted = adjusted;
  root.userData.armMaterialPresentationSkinId = skinId;
}

function weaponHipYaw(weapon: WeaponId): number {
  return weapon === 'carbine'
    ? 0.18
    : weapon === 'scattergun'
      ? 0.16
      : weapon === 'smg'
        ? 0.14
        : 0.1;
}

export type WeaponViewmodelGpuPrewarmContext = Readonly<{
  weaponId: WeaponId;
  requestGeneration: number;
}>;

/**
 * Resolves only after a newly loaded live viewmodel is safe to reveal. The
 * caller owns renderer compilation/submission fencing; this presentation owns
 * request-generation admission and keeps the previous model visible meanwhile.
 */
export type WeaponViewmodelGpuPrewarmer = (
  model: THREE.Object3D,
  context: WeaponViewmodelGpuPrewarmContext,
) => Promise<void>;

export type WeaponViewmodelCatalogGpuPrewarmEntry = Readonly<{
  weaponId: WeaponId;
  model: THREE.Object3D;
}>;

export type WeaponViewmodelCatalogGpuPrewarmer = (
  entries: readonly WeaponViewmodelCatalogGpuPrewarmEntry[],
  context: Readonly<{ requestGeneration: number }>,
) => Promise<void>;

export type WeaponPresentationLoadOptions = Readonly<{
  /**
   * Menu/bootstrap preparation may decode and retain presentation assets, but
   * it must not exercise renderer hooks or reveal the camera-space root before
   * the selected arena owns the final lighting/TSL graph.
   */
  mode?: 'active' | 'asset-only';
}>;

/** Original first-person weapon presentation with ADS, sprint, recoil, melee and staged reload motion. */
export class WeaponPresentation {
  static readonly MAX_RETAINED_WEBGPU_WEAPONS = RUNTIME_WEAPON_RETENTION_LIMIT;
  static readonly CATALOG_GPU_MODELS_PER_SUBMISSION = 2;
  static readonly CATALOG_GPU_SINGLETON_WEAPONS: ReadonlySet<WeaponId> = new Set([
    'pistol',
    'machine-pistol',
    'magnum',
    'flashlight-pistol',
    'explosive-crossbow',
    'railgun',
  ]);
  /**
   * HF-410: the body fit. One uniform scale about the eye, sitting between
   * the camera and the rig, so that every pose the presentation composes -
   * bob, sway, recoil, reload, melee, stance, contact - stays authored in
   * the frame it was measured and tuned in, and the whole composed result
   * lands inside the player's own collision capsule. A perspective
   * projection is invariant under a uniform scale about its centre, so the
   * rendered image does not move; see src/viewmodel-body-fit.ts.
   */
  readonly bodyFitRoot = new THREE.Group();
  readonly root = new THREE.Group();
  /**
   * The single camera-facing plane that cuts the rig at the contacting
   * surface. Retained and mutated in place: a new Plane each frame would
   * change the clipping context's cache key and recompile pipelines.
   */
  private readonly contactClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), Number.POSITIVE_INFINITY);
  /**
   * Surface-aligned cut planes, FIXED LENGTH for the rig's whole lifetime.
   *
   * The array never grows or shrinks. three folds the clipping-plane COUNT into
   * a material's shader cache key, so resizing this per frame would recompile
   * every viewmodel material on every wall approach - the exact defect fixed on
   * 2026-08-31, where 85.7% of all pipeline creations landed inside a stall.
   * Unused slots are parked far ahead of the camera where they clip nothing.
   */
  private readonly surfaceClipPlanes: THREE.Plane[] = Array.from(
    { length: VIEWMODEL_SURFACE_CLIP_PLANE_COUNT },
    () => new THREE.Plane(new THREE.Vector3(0, 0, -1), Number.POSITIVE_INFINITY),
  );
  private readonly contactClipScratch = {
    eye: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    point: new THREE.Vector3(),
  };

  private enforceNearPlaneClearance(activeModel: THREE.Object3D | undefined, arms: THREE.Object3D | undefined): void {
    const cameraNear = this.camera instanceof THREE.PerspectiveCamera ? this.camera.near : 0.08;
    let nearestDepth = Infinity;
    if (activeModel?.visible) {
      const framing = measureCameraFraming(activeModel, this.camera);
      if (framing && Number.isFinite(framing.nearestDepth)) nearestDepth = Math.min(nearestDepth, framing.nearestDepth);
    }
    if (arms?.visible) {
      const framing = measureCameraFraming(arms, this.camera);
      if (framing && Number.isFinite(framing.nearestDepth)) nearestDepth = Math.min(nearestDepth, framing.nearestDepth);
    }
    if (Number.isFinite(nearestDepth)) {
      const push = Math.max(0, cameraNear + 0.02 - nearestDepth);
      if (push > 0) this.root.position.z -= push;
    }
  }

  private readonly browserRuntime: boolean;
  private readonly models = new Map<WeaponId, THREE.Object3D>();
  private readonly modelLastUsed = new Map<WeaponId, number>();
  private gpuReadyModels = new WeakSet<THREE.Object3D>();
  private gpuPrewarmPromises = new WeakMap<THREE.Object3D, Promise<void>>();
  private gpuReadinessGeneration = 0;
  /** Serializes asset-only staging and renderer-dependent catalog prewarm. */
  private browserCatalogOperationPromise: Promise<void> | null = null;
  private readonly browserResidentWeaponIds = new Set<WeaponId>();
  private unpreparedBrowserSwitches = 0;
  private lastUnpreparedBrowserSwitch: Readonly<{
    requested: WeaponId;
    previousActive: WeaponId;
    resident: readonly WeaponId[];
    loaded: readonly WeaponId[];
    gpuReady: readonly WeaponId[];
  }> | null = null;
  private modelUseCounter = 0;
  private browserWeaponRequest = 0;
  private active: WeaponId = 'carbine';
  private recoil = 0;
  private reloadLastProgress = 0;
  /** HF-388: seconds since the current equip began; see viewmodelEquipBlendAt. */
  private equipElapsedSeconds = VIEWMODEL_EQUIP_SETTLED_SECONDS;
  /** HF-388: landing follow-through state; see viewmodelLandDropMetersAt. */
  private landAgeSeconds = VIEWMODEL_LAND_DIP_SETTLE_SECONDS;
  private landAmplitude = 0;
  private lastLandingImpulse = 0;
  private swayX = 0;
  private swayY = 0;
  /** HF-365 arm-motion clock/state; see FIRST_PERSON_ARM_MOTION_CONTRACT. */
  private armMotionSeconds = 0;
  private armMotionPhase = 0;
  private armMotionMovingBlend = 0;
  /**
   * HF-382: smoothed first-person stance offsets, lerped toward the selected
   * IDLE STANCE's presentation every frame so a menu switch eases in rather
   * than snapping the viewmodel.
   */
  private stancePose = {
    dropMeters: 0,
    pitchRadians: 0,
    yawRadians: 0,
    rollRadians: 0,
    lateralMeters: 0,
  };
  private operatorSkinId = 'default';

  /** Detaches the operator-skin subscription; see releaseOperatorSkin(). */
  private releaseOperatorSkinSubscription: (() => void) | null = null;
  private meleeStart = 0;
  private meleePresentationFrames = 0;
  private debugMeleeProgress: number | null = null;
  private riggedMeleeSupportPose: RiggedMeleeSupportPose | null = null;
  private grenadeStart = 0;
  private debugGrenadeProgress: number | null = null;
  private readonly muzzleLight: THREE.PointLight;
  private readonly muzzleFlash: THREE.Group;
  private readonly viewmodelFill: THREE.PointLight;
  private readonly weaponFlashlight: THREE.SpotLight;
  private readonly weaponFlashlightTarget: THREE.Object3D;
  private flashlightGpuPrewarmCount = 0;
  private lastBrowserCatalogPrewarmProfile: Readonly<{
    requested: number;
    newlyCreated: number;
    assetLoadMs: number;
    modelCreateMs: number;
    assetPrepareWallMs: number;
    gpuPrewarmMs: number;
    gpuSubmissionBatches: number;
    cleanupMs: number;
    totalMs: number;
    mode: 'catalog-batch' | 'individual-fallback';
  }> | null = null;
  private readonly casings: ViewCasing[] = [];
  private readonly smokes: ViewSmoke[] = [];
  private readonly smokePositions = new Float32Array(24);
  private readonly smokeColors = new Float32Array(24);
  private readonly smokePoints: THREE.Points;
  private readonly armRigs: ViewArmRig[] = [];
  private readonly riggedArmRigs: RiggedViewArm[] = [];
  private readonly riggedFingerBones: FirstPersonFingerBone[] = [];
  private readonly fingerPoseEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  private readonly fingerPoseQuaternion = new THREE.Quaternion();
  private readonly meleeGripWorld = new THREE.Vector3();
  private readonly meleeSocketWorld = new THREE.Vector3();
  private readonly meleeHandWorld = new THREE.Vector3();
  private readonly frameTargetPosition = new THREE.Vector3();
  private authoredArmsRoot: THREE.Group | null = null;
  private readonly armEvidenceMaterials = Object.freeze({
    left: createViewmodelArmEvidenceMaterial('left'),
    right: createViewmodelArmEvidenceMaterial('right'),
  });
  private armEvidenceRestore: ViewmodelArmEvidenceMeshRestore[] = [];
  private armEvidenceCaptureTelemetry: Readonly<Record<string, unknown>> | null = null;
  private riggedArmDiagnostics: Array<Record<string, unknown>> = [];
  private nextRiggedArmDiagnosticsAt = 0;
  /**
   * HF-388: the smoothed authored pose layer (see operator-model). Channels are
   * approached exponentially each frame so action edges crossfade instead of
   * popping, and every contribution is re-clamped inside solveRiggedArms so the
   * totals stay within the pinned procedural motion caps.
   */
  private readonly authoredArmChannels = {
    left: { poleRadians: 0, wristRollRadians: 0, carriageOffset: new THREE.Vector3() },
    right: { poleRadians: 0, wristRollRadians: 0, carriageOffset: new THREE.Vector3() },
  };
  private lastPresentedAds: boolean | null = null;
  private armRecoilKickRadians = 0;
  private armLandDipRadians = 0;
  private readonly riggedArmSolveScratch = {
    cameraRotation: new THREE.Quaternion(),
    carriageWorld: new THREE.Vector3(),
    carriageParentWorld: new THREE.Quaternion(),
    cameraUp: new THREE.Vector3(),
    target: new THREE.Vector3(),
    socketTarget: new THREE.Vector3(),
    shoulderPosition: new THREE.Vector3(),
    shoulderStartWorld: new THREE.Vector3(),
    elbowPosition: new THREE.Vector3(),
    wristPosition: new THREE.Vector3(),
    bendHint: new THREE.Vector3(),
    poleAxis: new THREE.Vector3(),
    elbowTarget: new THREE.Vector3(),
    handDirection: new THREE.Vector3(),
    weaponForward: new THREE.Vector3(),
    weaponRotation: new THREE.Quaternion(),
    parentWorldRotation: new THREE.Quaternion(),
    wristWorldRotation: new THREE.Quaternion(),
    palmWorldRotation: new THREE.Quaternion(),
    palmTargetRotation: new THREE.Quaternion(),
    palmRotationDelta: new THREE.Quaternion(),
    palmTargetBasis: new THREE.Matrix4(),
    palmTargetForward: new THREE.Vector3(),
    palmTargetUp: new THREE.Vector3(),
    palmTargetRight: new THREE.Vector3(),
    shoulderEntryWorld: new THREE.Vector3(),
    shoulderEntryLocal: new THREE.Vector3(),
    shoulderProjected: new THREE.Vector3(),
    shoulderReachDirection: new THREE.Vector3(),
    shoulderReachCandidate: new THREE.Vector3(),
    shoulderAnatomicalDirection: new THREE.Vector3(),
    shoulderBlendedDirection: new THREE.Vector3(),
    shoulderReachResult: {
      ndc: [0, 0, 0] as [number, number, number],
      displacementMeters: 0,
      adjusted: false,
      socketDistance: 0,
    },
    cameraDown: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    cameraBack: new THREE.Vector3(),
    handTarget: new THREE.Vector3(),
    wristTarget: new THREE.Vector3(),
    solvedWrist: new THREE.Vector3(),
    palmWorld: new THREE.Vector3(),
    palmCorrection: new THREE.Vector3(),
    diagnosticShoulder: new THREE.Vector3(),
    diagnosticElbow: new THREE.Vector3(),
    diagnosticWrist: new THREE.Vector3(),
    diagnosticPalm: new THREE.Vector3(),
    meleeRestWristLocal: new THREE.Vector3(),
    meleeWristTargetLocal: new THREE.Vector3(),
    meleeWristTargetWorld: new THREE.Vector3(),
    meleeBendHintWorld: new THREE.Vector3(),
    meleeHandDirectionWorld: new THREE.Vector3(),
    meleeArmsWorldRotation: new THREE.Quaternion(),
    elbowSolver: {
      toTarget: new THREE.Vector3(),
      perpendicular: new THREE.Vector3(),
      projection: new THREE.Vector3(),
    } satisfies TwoBoneElbowScratch,
    orientCurrentDirection: new THREE.Vector3(),
    orientDesiredDirection: new THREE.Vector3(),
    orientPreferredAxis: new THREE.Vector3(),
    orientDelta: new THREE.Quaternion(),
  };
  private readonly meleeKnife = new THREE.Group();
  private readonly meleeRig = new THREE.Group();
  private readonly passiveKnife = new THREE.Group();
  private authoredMeleeKnife: THREE.Group | null = null;
  private authoredMeleeSocket: THREE.Object3D | null = null;
  private meleePresentationActive = false;
  private meleePresentationMode: 'inactive' | 'authored-rigged-arms' | 'headless-procedural-fallback' = 'inactive';
  private proceduralMeleeArmFrames = 0;
  private riggedMeleeBindPoseRestoredExactly = true;
  private authoredMeleeGripError = Number.POSITIVE_INFINITY;
  private authoredMeleeHandContactError = Number.POSITIVE_INFINITY;
  private readonly brassGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.085, 7);
  private readonly shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.105, 8);
  private readonly brassMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a65c, roughness: 0.3, metalness: 0.78 });
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ color: 0xb43f32, roughness: 0.58, metalness: 0.18 });
  private shotStarted = -10_000;
  private debugFireAgeMs: number | null = null;
  private presentedFireCycle = fireCycleAt('carbine', 10_000, 0);
  private casingCursor = 0;
  private smokeCursor = 0;
  private pendingScattergunShell = false;
  private adsBlend = 0;
  private sprintBlend = 0;
  private weaponHeat = 0;
  private shotsPresented = 0;
  private flamethrowerHeldFireClearanceFastPathActive = false;
  private flamethrowerHeldFireClearanceEntryTransitions = 0;
  private flamethrowerHeldFireClearanceExitTransitions = 0;
  private flamethrowerHeldFireClearanceSkippedFrames = 0;
  private flamethrowerHeldFireClearancePrewarmChecks = 0;
  private surfaceRetreat = 0;
  private surfaceLift = 0;
  private prone = false;
  private contactResponse: ViewmodelContactResponse = viewmodelContactResponse('carbine', 0, 0, false, 0);
  /** Measured root-local bounds per weapon. Populated on first mount, then reused. */
  private readonly rigBounds = new Map<WeaponId, ViewmodelRigBounds>();
  private contactFold: ViewmodelContactFold = CONTACT_FOLD_CLEAR;
  private fullscreenPresentationSuppressed = false;
  private readonly minigunSpool = createMinigunSpoolState();
  private actionContract: CharacterActionContract = characterActionContract({
    weapon: 'carbine', aimBlend: 0, sprintBlend: 0, reloadProgress: null, meleeProgress: null,
  });

  constructor(
    private readonly camera: THREE.Camera,
    private readonly flattenMaterials = false,
    private readonly retireModel?: (root: THREE.Object3D, afterFence?: () => void) => void,
    private readonly gpuPrewarmer?: WeaponViewmodelGpuPrewarmer,
    private readonly catalogGpuPrewarmer?: WeaponViewmodelCatalogGpuPrewarmer,
  ) {
    this.browserRuntime = typeof document !== 'undefined';
    // HF-366: the viewmodel now READS the player's operator-skin choice.
    // setOperatorSkin() shipped fully tested with zero call sites, so the arms
    // were pinned to 'default' for everyone regardless of which card they
    // pressed - the reason "the arms should look diff too?" was still true
    // after the previous attempt. Subscribing here fires once immediately, so
    // the arms are BUILT with the stored choice rather than repainted after,
    // and again on every later change.
    this.releaseOperatorSkinSubscription = observeLocalOperatorSkinId((skinId) => {
      this.setOperatorSkin(skinId);
    });
    this.root.name = 'original-weapon-view';
    this.root.position.set(HIP_VIEWMODEL_POSITION.x, HIP_VIEWMODEL_POSITION.y, HIP_VIEWMODEL_POSITION.z);
    this.root.scale.setScalar(HIP_VIEWMODEL_SCALE);
    // The contact cut, declared once and left ARMED FOR THE LIFETIME OF THE RIG.
    //
    // Owner 2026-08-31: "it just freezes every few seconds ... mega unstable".
    // This used to set `enabled = false` until the rig was genuinely in contact,
    // on the reasoning quoted here before: "no plane, no clipping context, no
    // cache-key change". That is true AT REST and wrong IN MOTION - the TOGGLE is
    // the cache-key change. Every engage and disengage flips the clipping state,
    // which changes each material's shader permutation, and three recompiles the
    // pipeline. Combat means constantly nearing and leaving walls, so the whole
    // viewmodel - weapon, lenses, sleeve, gloves - recompiled several times a
    // second.
    //
    // Measured: 85.7% of ALL pipeline creations landed inside a stall, against
    // 2.73% expected if unrelated - a 31x enrichment - and the same material
    // (MAT_Pass65_Arms_FingerGlove_PBR_855) recompiled three times in two seconds.
    //
    // So the group stays enabled and the PLANE moves instead. Out of contact it
    // is parked far in front of the rig, where every viewmodel vertex is on the
    // kept camera side and it clips nothing. One permutation, compiled once.
    const clippingRoot = this.root as ViewmodelClippingRoot;
    clippingRoot.isClippingGroup = true;
    clippingRoot.enabled = true;
    clippingRoot.clipIntersection = false;
    clippingRoot.clipShadows = false;
    clippingRoot.clippingPlanes = [this.contactClipPlane, ...this.surfaceClipPlanes];
    this.root.userData.viewmodelContactClipContract = VIEWMODEL_CONTACT_CLIP_CONTRACT;
    this.bodyFitRoot.name = 'viewmodel-body-fit';
    this.bodyFitRoot.userData.viewmodelBodyFitContract = VIEWMODEL_BODY_FIT_CONTRACT;
    this.bodyFitRoot.scale.setScalar(VIEWMODEL_BODY_FIT_SCALE);
    camera.add(this.bodyFitRoot);
    this.bodyFitRoot.add(this.root);
    // HF-410: viewmodel-only lights live inside the fit, so their world
    // radius and physical intensity move with it. Without this the rig
    // would be lit as though the fill lamp were 1/k times closer.
    this.viewmodelFill = new THREE.PointLight(0xfff0dc, 0, viewmodelBodyFitLightDistance(3.2), 2);
    this.viewmodelFill.name = 'first-person-viewmodel-fill';
    this.viewmodelFill.position.set(0.12, 0.66, 0.4);
    this.viewmodelFill.castShadow = false;
    this.viewmodelFill.userData.presentationOnly = true;
    // Three r185 point-light intensity is physically based. The former 1.28 cd
    // fill was effectively black at the one-metre first-person working
    // distance, leaving authored fabric, weapon controls and the knife handle
    // unreadable in the Gun Range shadow floor. Keep one retained, viewmodel-
    // only warm key and give it enough bounded intensity to reveal PBR detail
    // without flattening the metal/fabric response or touching world lighting.
    this.viewmodelFill.userData.authoredIntensity = flattenMaterials
      ? 0
      : viewmodelBodyFitLightIntensity(FIRST_PERSON_VIEWMODEL_FILL_INTENSITY);
    this.root.add(this.viewmodelFill);
    const fabricMaterial = (color: number, roughness: number, repeatX: number, repeatY: number, normalScale: number): THREE.MeshStandardMaterial => {
      if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      return texturedMaterial('./assets/original/textures/fabric-weave.png', {
        color, roughness, repeatX, repeatY,
        normalPath: './assets/original/textures/fabric-weave-normal.png',
        roughnessPath: './assets/original/textures/fabric-weave-roughness.png', normalScale,
      });
    };

    const sleeve: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x4a6870 })
      : fabricMaterial(0x78979d, 0.96, 5, 2, 0.32);
    const sleeveTrim: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x9c8c62 })
      : fabricMaterial(0xa99a70, 0.9, 6, 3, 0.24);
    const glove: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x514b40 })
      : fabricMaterial(0x625b4c, 0.98, 7, 4, 0.38);
    const glovePalm: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x766d5c })
      : fabricMaterial(0x8a806c, 0.91, 8, 5, 0.3);
    // This bounded procedural rig is a construction-time and headless-test
    // scaffold only. Browser load() replaces it atomically with the dedicated
    // project-original Blender arms before the presentation becomes ready.
    const arms = new THREE.Group(); arms.name = 'first-person-arms';
    const anatomicalLimb = (
      name: string,
      length: number,
      profile: Array<[position: number, radius: number]>,
    ): THREE.Mesh => {
      const points = profile.map(([position, radius]) => new THREE.Vector2(radius, position * length - length / 2));
      const geometry = new THREE.LatheGeometry(points, flattenMaterials ? 8 : 12);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, sleeve);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = -length / 2;
      mesh.castShadow = true;
      return mesh;
    };
    const mergeArmAssembly = (parent: THREE.Object3D, sources: THREE.Mesh[], name: string): THREE.Mesh => {
      const geometries = sources.map((source) => {
        source.updateMatrix();
        const clone = source.geometry.clone();
        const geometry = clone.index ? clone.toNonIndexed() : clone;
        if (geometry !== clone) clone.dispose();
        geometry.applyMatrix4(source.matrix);
        for (const attribute of Object.keys(geometry.attributes)) {
          if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
        }
        const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
        const color = 'color' in sourceMaterial && sourceMaterial.color instanceof THREE.Color
          ? sourceMaterial.color
          : new THREE.Color(0xffffff);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let index = 0; index < colors.length; index += 3) {
          colors[index] = color.r;
          colors[index + 1] = color.g;
          colors[index + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
      });
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((item) => item.dispose());
      if (!geometry) throw new Error(`Unable to merge ${name}`);
      const material = this.flattenMaterials
        ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 1 })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, transparent: true, opacity: 1 });
      const merged = new THREE.Mesh(geometry, material);
      merged.name = name;
      sources.forEach((source) => parent.remove(source));
      parent.add(merged);
      return merged;
    };
    const makeArm = (side: 'left' | 'right') => {
      const sign = side === 'left' ? -1 : 1;
      // Preserve the total reach while restoring human upper/forearm proportion.
      // Profile bulges create a deltoid/biceps and brachioradialis silhouette
      // without adding meshes or draw calls.
      const upperLength = 0.66;
      const lowerLength = 0.63;
      const shoulder = new THREE.Group(); shoulder.name = `${side}-shoulder-joint`;
      shoulder.position.set(side === 'right' ? 0.48 : -0.36, side === 'right' ? -0.08 : -0.04, side === 'right' ? 0.58 : 0.52);
      const radialSegments = flattenMaterials ? 8 : 12;
      const upper = anatomicalLimb(`${side}-upper-arm`, upperLength, [
        [0, 0.1], [0.26, 0.112], [0.63, 0.091], [1, 0.071],
      ]);
      upper.scale.set(1.04, 0.9, 1);
      shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.name = `${side}-elbow-joint`; elbow.position.z = -upperLength; shoulder.add(elbow);
      const forearm = anatomicalLimb(`${side}-forearm`, lowerLength, [
        [0, 0.082], [0.28, 0.097], [0.68, 0.073], [1, 0.055],
      ]);
      forearm.scale.set(1, 0.84, 1);
      elbow.add(forearm);
      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.086, radialSegments, 7), sleeve);
      elbowCap.name = `${side}-elbow-cap`;
      elbowCap.scale.set(1, 0.92, 1.04);
      elbow.add(elbowCap);
      const wrist = new THREE.Group();
      wrist.name = `${side}-wrist-joint`;
      wrist.position.z = -lowerLength;
      wrist.rotation.set(-0.12, 0, sign * 0.08);
      elbow.add(wrist);
      // Reduced profiles retain every articulated glove part while trimming only
      // bevel subdivision; this preserves anatomy and rigging without spending
      // the full Quality-profile viewmodel triangle budget.
      const cuff = roundedBox(`${side}-glove-cuff`, [0.21, 0.15, 0.14], glove, 0.038, flattenMaterials ? 1 : 3);
      cuff.position.z = 0.045;
      wrist.add(cuff);
      const cuffAccent = roundedBox(`${side}-cuff-accent`, [0.178, 0.15, 0.032], sleeveTrim, 0.009, 2);
      cuffAccent.position.z = 0.098;
      wrist.add(cuffAccent);
      const wristGuard = roundedBox(`${side}-wrist-guard`, [0.19, 0.075, 0.12], glove, 0.022, flattenMaterials ? 1 : 3);
      wristGuard.position.set(0, -0.045, 0.018);
      wrist.add(wristGuard);
      const hand = roundedBox(`${side}-palm`, [0.2, 0.13, 0.21], glovePalm, 0.048, flattenMaterials ? 2 : 4);
      hand.position.set(sign * -0.014, -0.002, -0.035);
      wrist.add(hand);
      const palmHeel = roundedBox(`${side}-palm-heel`, [0.142, 0.032, 0.095], glove, 0.014, 2);
      palmHeel.position.set(sign * -0.014, 0.058, -0.012);
      palmHeel.rotation.x = -0.08;
      wrist.add(palmHeel);
      const knucklePad = roundedBox(`${side}-knuckle-pad`, [0.158, 0.038, 0.09], glove, 0.016, flattenMaterials ? 1 : 3);
      knucklePad.position.set(sign * -0.014, -0.062, -0.085);
      wrist.add(knucklePad);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.088, 5, flattenMaterials ? 6 : 9), glove);
      thumb.name = `${side}-thumb`;
      thumb.position.set(sign * -0.094, -0.018, -0.052);
      thumb.rotation.set(-Math.PI / 2 - 0.38, sign * 0.12, sign * 0.54);
      wrist.add(thumb);
      const fingers: THREE.Mesh[] = [];
      for (let finger = 0; finger < 4; finger += 1) {
        const proximal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0225, 0.054 - finger * 0.002, 4, flattenMaterials ? 6 : 9), glove);
        proximal.name = `${side}-finger-${finger}-proximal`;
        proximal.position.set(sign * (0.055 - finger * 0.037), -0.062, -0.121 + finger * 0.004);
        proximal.rotation.set(Math.PI / 2 + 0.28 + finger * 0.025, 0, sign * (finger - 1.5) * 0.045);
        const distal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0195, 0.034 - finger * 0.0015, 4, flattenMaterials ? 6 : 9), glove);
        distal.name = `${side}-finger-${finger}-distal`;
        distal.position.set(sign * (0.055 - finger * 0.037), -0.047, -0.176 + finger * 0.004);
        distal.rotation.set(Math.PI / 2 + 0.64 + finger * 0.03, 0, sign * (finger - 1.5) * 0.052);
        wrist.add(proximal, distal);
        fingers.push(proximal, distal);
      }
      // Preserve all eight authored phalange shapes while collapsing them into
      // one material-compatible draw per hand. Geometry is transformed into
      // glove-local space before merging, so the silhouette stays unchanged.
      const fingerGeometries = fingers.map((fingerMesh) => {
        fingerMesh.updateMatrix();
        const geometry = fingerMesh.geometry.clone();
        geometry.applyMatrix4(fingerMesh.matrix);
        return geometry;
      });
      const mergedFingerGeometry = mergeGeometries(fingerGeometries, false);
      fingerGeometries.forEach((geometry) => geometry.dispose());
      if (mergedFingerGeometry) {
        for (const fingerMesh of fingers) {
          wrist.remove(fingerMesh);
          fingerMesh.geometry.dispose();
        }
        const fingerCluster = new THREE.Mesh(mergedFingerGeometry, glove);
        fingerCluster.name = `${side}-finger-articulated-cluster`;
        fingerCluster.castShadow = true;
        fingerCluster.receiveShadow = true;
        fingerCluster.userData.segmentCount = 8;
        fingerCluster.userData.anatomy = 'four articulated two-segment fingers';
        wrist.add(fingerCluster);
        fingers.splice(0, fingers.length, fingerCluster);
      }
      const sleeveBand = roundedBox(`${side}-sleeve-band`, [0.166, 0.166, 0.048], sleeveTrim, 0.014, 2);
      sleeveBand.position.z = -upperLength * 0.72;
      shoulder.add(sleeveBand);
      const sleevePatch = roundedBox(`${side}-sleeve-patch`, [0.115, 0.035, 0.15], sleeveTrim, 0.012, 2);
      sleevePatch.position.set(sign * 0.068, -0.07, -upperLength * 0.44);
      sleevePatch.rotation.z = sign * 0.09;
      shoulder.add(sleevePatch);
      if (this.flattenMaterials) {
        mergeArmAssembly(shoulder, [upper, sleeveBand, sleevePatch], `${side}-upper-arm`);
        mergeArmAssembly(elbow, [forearm, elbowCap], `${side}-forearm`);
      } else {
        upper.userData.anatomicalSleeve = true;
        forearm.userData.anatomicalSleeve = true;
      }
      const wristExtras: THREE.Mesh[] = [];
      if (side === 'left') {
        const displayHousing = roundedBox('left-wrist-display-housing', [0.13, 0.045, 0.1], glove, 0.012, 2);
        displayHousing.position.set(-0.015, -0.09, 0.035);
        const display = roundedBox(
          'left-wrist-display', [0.094, 0.01, 0.064],
          flattenMaterials
            ? new THREE.MeshBasicMaterial({ color: 0x6ef5e8 })
            : new THREE.MeshStandardMaterial({ color: 0x74f4e7, emissive: 0x167e77, emissiveIntensity: 0.82, roughness: 0.2 }),
          0.006, 2,
        );
        display.position.set(-0.015, -0.116, 0.03);
        display.rotation.x = -0.05;
        wrist.add(displayHousing, display);
        wristExtras.push(displayHousing, display);
      }
      const gloveSources = [cuff, cuffAccent, wristGuard, hand, palmHeel, knucklePad, thumb, ...fingers, ...wristExtras];
      const silhouetteOffset = new THREE.Vector3(sign * 0.02, -0.012, 0);
      gloveSources.forEach((part) => part.position.add(silhouetteOffset));
      const gloveAssembly = this.flattenMaterials
        ? mergeArmAssembly(wrist, gloveSources, `${side}-glove`)
        : wrist;
      gloveAssembly.userData.style = 'atomic-tactical-v3-detailed';
      gloveAssembly.userData.cuffConnected = true;
      gloveAssembly.userData.sourcePartCount = gloveSources.length
        + Math.max(0, (fingers[0]?.userData.segmentCount ?? 1) - 1);

      this.armRigs.push({ side, shoulder, elbow, hand: wrist, upperLength, lowerLength });
      return shoulder;
    };
    if (!this.browserRuntime) {
      arms.userData.testOnlyProceduralFallback = true;
      arms.add(makeArm('right'), makeArm('left'));
      arms.scale.setScalar(this.flattenMaterials ? 0.76 : 0.74);
      arms.position.set(0, -0.08, 0.02);
      arms.visible = true;
      this.root.add(arms);
    }

    // Headless tests retain a deterministic construction-only fallback. Browser
    // release runtime leaves this container empty until the authored GLB is
    // available, so a procedural knife can never flash on screen during load.
    this.meleeKnife.name = 'field-knife-presentation';
    this.meleeKnife.visible = false;
    if (!this.browserRuntime) {
      const knifeHandle = roundedBox('field-knife-handle', [0.15, 0.42, 0.14], glove, 0.035, 2);
      knifeHandle.position.set(0, -0.24, 0);
      const knifeGuard = roundedBox('field-knife-guard', [0.36, 0.075, 0.11], sleeveTrim, 0.018, 2);
      knifeGuard.position.set(0, 0, 0);
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-0.095, 0);
      bladeShape.lineTo(0.095, 0);
      bladeShape.lineTo(0.072, 0.82);
      bladeShape.lineTo(0, 1.04);
      bladeShape.lineTo(-0.072, 0.82);
      bladeShape.closePath();
      const blade = new THREE.Mesh(
        new THREE.ExtrudeGeometry(bladeShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }),
        flattenMaterials
          ? new THREE.MeshBasicMaterial({ color: 0xe4eeee })
          : new THREE.MeshStandardMaterial({ color: 0xd5e0e0, roughness: 0.24, metalness: 0.8 }),
      );
      blade.name = 'field-knife-blade';
      blade.position.set(0, 0.02, -0.03);
      const bladeDetailMaterial = flattenMaterials
        ? new THREE.MeshBasicMaterial({ color: 0x59696d })
        : new THREE.MeshStandardMaterial({ color: 0x56666a, roughness: 0.34, metalness: 0.74 });
      const bladeFuller = roundedBox('field-knife-fuller', [0.035, 0.64, 0.018], bladeDetailMaterial, 0.008, 2);
      bladeFuller.position.set(0, 0.43, 0.022);
      const pommel = roundedBox('field-knife-pommel', [0.18, 0.1, 0.16], sleeveTrim, 0.028, 3);
      pommel.position.set(0, -0.49, 0);
      this.meleeKnife.add(knifeHandle, knifeGuard, blade, bladeFuller, pommel);
      for (let ridge = 0; ridge < 6; ridge += 1) {
        const wrap = roundedBox(`field-knife-grip-ridge-${ridge}`, [0.164, 0.026, 0.152], sleeveTrim, 0.01, 2);
        wrap.position.set(0, -0.075 - ridge * 0.062, 0);
        wrap.rotation.z = ridge % 2 === 0 ? 0.08 : -0.08;
        this.meleeKnife.add(wrap);
      }
    }
    this.meleeRig.name = 'field-knife-arm-rig';
    this.meleeRig.userData.testOnlyProceduralFallback = true;
    if (!this.browserRuntime) {
      const meleeForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.82, 8, 16), sleeve);
      meleeForearm.name = 'field-knife-forearm';
      meleeForearm.position.set(0.56, -0.58, 0.12);
      meleeForearm.rotation.z = 0.55;
      const meleeUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.17, 1.4, 14, 1, false), sleeve);
      meleeUpperArm.name = 'field-knife-upper-arm';
      meleeUpperArm.position.set(0.82, -1.55, 0.14);
      meleeUpperArm.rotation.z = 0.08;
      const meleeElbow = roundedBox('field-knife-elbow-guard', [0.25, 0.2, 0.18], glove, 0.055, 3);
      meleeElbow.position.set(0.73, -0.92, 0.13);
      meleeElbow.rotation.z = 0.52;
      const meleeCuff = roundedBox('knife-glove-cuff', [0.21, 0.18, 0.15], sleeveTrim, 0.04, 2);
      meleeCuff.position.set(0.24, -0.13, -0.04);
      meleeCuff.rotation.z = 0.3;
      const meleeHand = roundedBox('knife-glove', [0.19, 0.21, 0.24], glove, 0.055, 3);
      meleeHand.position.set(0.19, -0.02, -0.14);
      meleeHand.rotation.set(-0.18, 0.08, -0.42);
      this.meleeKnife.position.set(0.19, 0.1, -0.2);
      this.meleeKnife.rotation.set(0.04, -0.06, -0.48);
      this.meleeRig.add(meleeUpperArm, meleeElbow, meleeForearm, meleeCuff, meleeHand, this.meleeKnife);
      this.meleeRig.visible = false;
      this.root.add(this.meleeRig);
    }
    const passiveKnifeModel = this.meleeKnife.clone(true);
    passiveKnifeModel.name = 'passive-field-knife-model';
    passiveKnifeModel.position.set(0, 0, 0);
    passiveKnifeModel.rotation.set(0, 0, 0);
    this.passiveKnife.name = 'passive-field-knife-presence';
    this.passiveKnife.userData.presentationOnly = true;
    this.passiveKnife.position.set(-0.52, -0.48, 0.08);
    this.passiveKnife.rotation.set(-0.28, -0.12, 0.78);
    this.passiveKnife.scale.setScalar(0.24);
    this.passiveKnife.add(passiveKnifeModel);
    this.passiveKnife.visible = false;
    this.root.add(this.passiveKnife);
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, viewmodelBodyFitLightDistance(4.5), 2);
    this.muzzleLight.name = 'first-person-muzzle-light';
    this.muzzleLight.position.set(0, 0.08, -1.15);
    if (!flattenMaterials) this.root.add(this.muzzleLight);

    this.weaponFlashlight = new THREE.SpotLight(0xeaffff, 0, 18, 0.42, 0.34, 1.5);
    this.weaponFlashlight.name = 'always-on-solid-occluded-weapon-flashlight';
    this.weaponFlashlight.userData.shadowBudgetScope = VIEWMODEL_SHADOW_BUDGET_SCOPE;
    this.weaponFlashlight.position.set(0.05, -0.08, -0.3);
    this.weaponFlashlight.castShadow = !flattenMaterials;
    this.weaponFlashlight.shadow.mapSize.set(512, 512);
    this.weaponFlashlight.shadow.camera.near = 0.1;
    this.weaponFlashlight.shadow.camera.far = 18;
    this.weaponFlashlightTarget = new THREE.Object3D();
    this.weaponFlashlightTarget.name = 'weapon-flashlight-target';
    this.weaponFlashlightTarget.position.set(0, 0, -12);
    this.weaponFlashlight.target = this.weaponFlashlightTarget;
    camera.add(this.weaponFlashlight, this.weaponFlashlightTarget);

    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.set(0, 0.08, -1.15);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd38a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const coreGeometry = new THREE.ConeGeometry(0.052, 0.5, 7, 1, true);
    coreGeometry.rotateX(-Math.PI / 2);
    coreGeometry.translate(0, 0, -0.25);
    const crownGeometry = new THREE.CircleGeometry(0.052, 10);
    crownGeometry.translate(0, 0, -0.006);
    const flareShape = new THREE.Shape();
    const flarePoints = 16;
    for (let index = 0; index < flarePoints; index += 1) {
      const angle = (index / flarePoints) * Math.PI * 2 + Math.PI / 16;
      const spoke = index % 2 === 0;
      const radius = spoke ? (index % 4 === 0 ? 0.2 : 0.14) : 0.044;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) flareShape.moveTo(x, y);
      else flareShape.lineTo(x, y);
    }
    flareShape.closePath();
    const flareGeometry = new THREE.ShapeGeometry(flareShape);
    const burstGeometry = mergeGeometries([coreGeometry, crownGeometry, flareGeometry], false);
    coreGeometry.dispose();
    crownGeometry.dispose();
    flareGeometry.dispose();
    if (!burstGeometry) throw new Error('Unable to merge muzzle flash burst');
    const burst = new THREE.Mesh(burstGeometry, flashMaterial);
    burst.name = 'muzzle-flash-burst';
    this.muzzleFlash.add(burst);
    this.muzzleFlash.visible = false;
    this.root.add(this.muzzleFlash);

    const smokeGeometry = new THREE.BufferGeometry();
    this.smokePositions.fill(0);
    for (let index = 0; index < 8; index += 1) this.smokePositions[index * 3 + 1] = -10_000;
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    smokeGeometry.setAttribute('color', new THREE.BufferAttribute(this.smokeColors, 3));
    this.smokePoints = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({
      size: flattenMaterials ? 0.045 : 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.smokePoints.name = 'pooled-muzzle-smoke';
    this.smokePoints.visible = false;
    this.smokePoints.frustumCulled = false;
    this.root.add(this.smokePoints);
    for (let index = 0; index < 8; index += 1) {
      this.smokes.push({ velocity: new THREE.Vector3(), life: 0, maxLife: 0, active: false });
    }

    for (let index = 0; index < 16; index += 1) {
      const mesh = new THREE.Mesh(this.brassGeometry, this.brassMaterial);
      mesh.name = `pooled-casing-${index}`;
      mesh.visible = false;
      mesh.rotation.z = Math.PI / 2;
      this.root.add(mesh);
      this.casings.push({ mesh, velocity: new THREE.Vector3(), life: 0, frames: 0, active: false });
    }
  }

  private attachAuthoredMeleeKnife(
    rightRig: RiggedViewArm,
    authoredKnife: THREE.Group,
    exportedWristSocket: THREE.Object3D,
  ): void {
    const authoredGrip = authoredKnife.getObjectByName('grip-socket-r');
    if (!authoredGrip) throw new Error('Pass 65 authored field knife is missing grip-socket-r');

    this.meleeKnife.removeFromParent();
    this.meleeKnife.clear();
    this.meleeKnife.position.set(0, 0, 0);
    this.meleeKnife.rotation.set(0, 0, 0);
    // The exported object is correctly parented to WristR, but the source GLB's
    // bone-parent inverse leaves its translation roughly a metre away from the
    // visible hand. Re-seat that authored socket at the articulated index base
    // and remove its inherited rotation before mounting the knife. Its inverse
    // armature scale remains intact, preserving the authored physical units.
    this.root.updateWorldMatrix(true, true);
    const knifePalmWorld = this.riggedPalmWorld(rightRig, this.meleeHandWorld);
    const knifeSocketParent = exportedWristSocket.parent;
    if (!knifeSocketParent) throw new Error('Pass 65 authored knife socket has no wrist-chain parent');
    exportedWristSocket.position.copy(knifeSocketParent.worldToLocal(knifePalmWorld));
    exportedWristSocket.quaternion.identity();
    this.meleeKnife.scale.setScalar(MELEE_KNIFE_PRESENTATION_SCALE);

    exportedWristSocket.userData.authoredRigAttachment = true;
    exportedWristSocket.add(this.meleeKnife);
    this.meleeKnife.add(authoredKnife);
    authoredKnife.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const name = material.name.toLowerCase();
        if (name.includes('blade') || name.includes('gunmetal') || name.includes('fuller')) {
          // Keep every authored PBR map/normal while lifting only the metal
          // edge enough to survive the darkest arena exposure.
          material.emissive.setHex(0x30464d);
          material.emissiveIntensity = 0.38;
        } else if (name.includes('accent')) {
          material.emissive.setHex(0x8a4f1f);
          material.emissiveIntensity = 0.32;
        } else if (name.includes('g10') || name.includes('handle')) {
          // The dark textured grip still needs a shallow floor when its normal
          // turns away from the key. Retain all PBR maps and contrast; lift only
          // enough to keep the handle connected to the glove at 4K/21:9.
          material.emissive.setHex(0x162326);
          material.emissiveIntensity = 0.28;
        } else if (name.includes('rubber')) {
          material.emissive.setHex(0x101716);
          material.emissiveIntensity = 0.18;
        }
      }
    });

    // The authored knife's grip empty is the alignment authority. Translating
    // its managed model by the grip position keeps the handle centred on the
    // wrist socket even when the source asset scale changes.
    this.root.updateWorldMatrix(true, true);
    const gripInContainer = this.meleeKnife.worldToLocal(authoredGrip.getWorldPosition(new THREE.Vector3()));
    authoredKnife.position.sub(gripInContainer);

    // Point the authored -Z blade axis along the hand chain, then add a small
    // palm roll so the edge reads clearly during the thrust instead of showing
    // a flat, edge-on silhouette.
    this.root.updateWorldMatrix(true, true);
    const fingerDirection = rightRig.wrist.worldToLocal(rightRig.finger.getWorldPosition(new THREE.Vector3()));
    if (fingerDirection.lengthSq() < 1e-6) fingerDirection.set(0, -1, 0);
    else fingerDirection.normalize();
    this.meleeKnife.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), fingerDirection);
    this.meleeKnife.rotateZ(-0.2);

    this.root.updateWorldMatrix(true, true);
    this.authoredMeleeGripError = authoredGrip.getWorldPosition(new THREE.Vector3())
      .distanceTo(exportedWristSocket.getWorldPosition(new THREE.Vector3()));
    this.authoredMeleeHandContactError = authoredGrip.getWorldPosition(this.meleeGripWorld)
      .distanceTo(this.riggedPalmWorld(rightRig, this.meleeHandWorld));
    this.authoredMeleeKnife = authoredKnife;
    this.authoredMeleeSocket = exportedWristSocket;
    this.meleeKnife.userData.projectOriginalMeleeWeapon = true;
    this.meleeKnife.userData.authoredGripSocket = authoredGrip.name;
    this.meleeKnife.visible = false;
  }

  /**
   * HF-366 ("the arms should look diff too?"): adopts the player's chosen
   * operator skin on the first-person arms. Safe before load() - the id is
   * retained and the arms are built with it - and safe after, because the arms
   * own per-instance material clones, so this repaints only this viewmodel.
   */
  setOperatorSkin(skinId: string): boolean {
    this.operatorSkinId = skinId;
    if (!this.authoredArmsRoot) return false;
    const painted = applyFirstPersonArmSkin(this.authoredArmsRoot, skinId) > 0;
    // Re-run the fill so the ambient contribution keeps agreeing with the tint;
    // otherwise a skin change would leave the old hue lighting the new colour.
    tuneAuthoredFirstPersonArmMaterials(this.authoredArmsRoot, this.flattenMaterials, skinId);
    return painted;
  }

  get operatorSkin(): string {
    return this.operatorSkinId;
  }

  /** Detaches the skin-selection listener. Idempotent. */
  releaseOperatorSkin(): void {
    this.releaseOperatorSkinSubscription?.();
    this.releaseOperatorSkinSubscription = null;
  }

  async load(
    onProgress?: (loaded: number, total: number) => void,
    options: WeaponPresentationLoadOptions = {},
  ): Promise<void> {
    const browserRuntime = typeof document !== 'undefined';
    const assetOnly = browserRuntime && options.mode === 'asset-only';
    const initialWeapon = this.active;
    // Staging-time hide, deliberately NOT setPresentationVisible(false): no
    // live scene exists yet, so there is no light set to invalidate. The
    // retained-structural-lights contract governs RUNTIME hides, where
    // root.visible=false would invalidate every material program in the live
    // scene at once (see setPresentationVisible).
    if (assetOnly) this.root.visible = false;
    if (browserRuntime) {
      await Promise.all([
        loadPass65WeaponPresentation(initialWeapon, 'first-person'),
        loadPass65FieldKnifeAsset('first-person'),
        loadFirstPersonArmsAsset(),
      ]);
      const authoredArms = createFirstPersonRiggedArms(this.flattenMaterials, this.operatorSkinId);
      if (!authoredArms || authoredArms.chains.length !== 2) {
        throw new Error('Pass 65 authored first-person arms failed the two-chain release contract');
      }
      tuneAuthoredFirstPersonArmMaterials(authoredArms.root, this.flattenMaterials, this.operatorSkinId);
      const fallbackArms = this.root.getObjectByName('first-person-arms');
      if (fallbackArms) this.root.remove(fallbackArms);
      this.armRigs.length = 0;
      this.riggedArmRigs.length = 0;
      this.riggedFingerBones.length = 0;
      for (const chain of authoredArms.chains) {
        this.riggedArmRigs.push({
          ...chain,
          bindShoulder: chain.shoulder.quaternion.clone(),
          bindElbow: chain.elbow.quaternion.clone(),
          bindWrist: chain.wrist.quaternion.clone(),
          bindShoulderPosition: chain.shoulder.position.clone(),
          bindElbowPosition: chain.elbow.position.clone(),
          bindWristPosition: chain.wrist.position.clone(),
          bindShoulderScale: chain.shoulder.scale.clone(),
          bindElbowScale: chain.elbow.scale.clone(),
          bindWristScale: chain.wrist.scale.clone(),
        });
      }
      this.riggedFingerBones.push(...authoredArms.fingers);
      this.authoredArmsRoot = authoredArms.root;
      authoredArms.root.scale.setScalar(FIRST_PERSON_ARM_UNIFORM_SCALE);
      authoredArms.root.userData.firstPersonArmProportionContract = FIRST_PERSON_ARM_PROPORTION_CONTRACT;
      authoredArms.root.userData.firstPersonArmUniformScale = FIRST_PERSON_ARM_UNIFORM_SCALE;
      authoredArms.root.userData.firstPersonArmViewportEntryContract = FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT;
      this.root.add(authoredArms.root);
      const authoredKnife = createPass65FieldKnifeModel(this.flattenMaterials, 'first-person');
      if (!authoredKnife) throw new Error('Pass 65 authored first-person field knife failed the release contract');
      const rightRig = this.riggedArmRigs.find((rig) => rig.side === 'right');
      if (!rightRig) throw new Error('Pass 65 authored first-person arms are missing the right-hand chain');
      this.attachAuthoredMeleeKnife(rightRig, authoredKnife, authoredArms.knifeSocket);
      this.passiveKnife.clear();
      const prewarmDropKnife = () => {
        void loadPass65FieldKnifeAsset('drop').then(() => {
          const dropKnife = createPass65FieldKnifeModel(this.flattenMaterials, 'drop');
          if (!dropKnife) throw new Error('Pass 65 authored field-knife drop delivery unavailable after prewarm');
          dropKnife.name = 'passive-field-knife-model';
          this.passiveKnife.add(dropKnife);
          this.passiveKnife.visible = false;
        }).catch((error: unknown) => {
          this.root.userData.pass65FieldKnifeDropLoadError = error instanceof Error ? error.message : String(error);
        });
      };
      scheduleBrowserPreparationIdleTask(prewarmDropKnife);
    }

    const ids = browserRuntime ? [initialWeapon] : Object.keys(WEAPONS) as WeaponId[];
    ids.forEach((id, index) => {
      // Camera-space weapons use the project-authored high-detail model. The
      // imported low-poly assets remain suitable for distant world operators.
      // The low-poly imported pickups remain valid world assets, but first
      // person needs the authored PBR receiver, functional action parts and
      // calibrated sockets rather than a camera-close pickup mesh.
      if (browserRuntime && this.models.has(id)) {
        onProgress?.(index + 1, ids.length);
        return;
      }
      const unpreparedModel = browserRuntime
        ? id === 'explosive-crossbow'
          ? createPass65CrossbowModel(this.flattenMaterials, 'first-person')
          : createPass65WeaponModel(id, this.flattenMaterials, 'first-person')
        : buildWeaponModel(id, this.flattenMaterials, false);
      if (!unpreparedModel) throw new Error(`Pass 65 first-person asset unavailable: ${id}`);
      const model = prepareFirstPersonWeaponModel(id, unpreparedModel, this.flattenMaterials, browserRuntime);
      if (!browserRuntime && id !== 'explosive-crossbow') model.userData.firstPersonSource = 'test-only-procedural-fallback';
      model.visible = false;
      this.models.set(id, model);
      this.modelLastUsed.set(id, ++this.modelUseCounter);
      // Without an injected renderer hook (the WebGL/no-hook path), the
      // existing match-start compile remains the readiness boundary. WebGPU
      // callers inject a prewarmer and must explicitly settle even this first
      // browser model before load() can admit it.
      if (!this.gpuPrewarmer) this.gpuReadyModels.add(model);
      this.root.add(model);
      onProgress?.(index + 1, ids.length);
    });
    if (browserRuntime && this.gpuPrewarmer && !assetOnly) {
      const initialModel = this.models.get(initialWeapon);
      if (!initialModel) throw new Error(`Pass 65 initial first-person asset unavailable after load: ${initialWeapon}`);
      try {
        await this.prewarmBrowserModel(initialWeapon, initialModel, this.browserWeaponRequest);
      } catch (error) {
        this.retireRejectedBrowserModel(initialWeapon, initialModel);
        throw error;
      }
    }
    if (!assetOnly) this.setWeapon(this.active, true);
    if (browserRuntime) this.trimBrowserWeaponModels();
  }

  /**
   * Loads, creates and GPU-prewarms one bounded gameplay weapon set behind the
   * deployment surface. WebGPU compilation can synchronously occupy the browser
   * main thread even though compileAsync returns a Promise, so a live lazy
   * switch is not a safe presentation boundary. Deployment therefore pins the
   * complete arena-reachable set. WebGL/no-hook callers use the asset-only
   * preparation path for a caller-defined bounded retained hotset.
   */
  async prewarmBrowserWeaponCatalog(
    requestedIds: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<void> {
    if (!this.browserRuntime || !this.gpuPrewarmer) return;
    const ids = this.normalizeBrowserWeaponCatalog(requestedIds);
    if (this.browserCatalogOperationPromise) {
      await this.browserCatalogOperationPromise;
      return this.prewarmBrowserWeaponCatalog(ids, onProgress, yieldToBrowser);
    }
    const exactSetReady = ids.length === this.browserResidentWeaponIds.size
      && ids.every((id) => {
        const model = this.models.get(id);
        return this.browserResidentWeaponIds.has(id) && model !== undefined && this.modelIsGpuReady(model);
    });
    if (exactSetReady) return;
    const operation = this.performBrowserWeaponCatalogPrewarm(ids, onProgress, yieldToBrowser);
    this.browserCatalogOperationPromise = operation;
    try {
      await operation;
    } finally {
      if (this.browserCatalogOperationPromise === operation) this.browserCatalogOperationPromise = null;
    }
  }

  /**
   * Loads, creates and retains one browser viewmodel catalog without submitting
   * renderer work or claiming pipeline readiness. Menu preparation uses this
   * before the final arena TSL/HDR graph exists; deployment can then GPU-prewarm
   * the exact same model instances without another asset request or decode.
   */
  async prepareBrowserWeaponCatalogAssets(
    requestedIds: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<void> {
    if (!this.browserRuntime) return;
    const ids = this.normalizeBrowserWeaponCatalog(requestedIds);
    if (this.browserCatalogOperationPromise) {
      await this.browserCatalogOperationPromise;
      return this.prepareBrowserWeaponCatalogAssets(ids, onProgress, yieldToBrowser);
    }
    const exactSetResident = ids.length === this.browserResidentWeaponIds.size
      && ids.every((id) => this.browserResidentWeaponIds.has(id) && this.models.has(id));
    if (exactSetResident) return;
    const operation = this.performBrowserWeaponCatalogAssetPreparation(ids, onProgress, yieldToBrowser);
    this.browserCatalogOperationPromise = operation;
    try {
      await operation;
    } finally {
      if (this.browserCatalogOperationPromise === operation) this.browserCatalogOperationPromise = null;
    }
  }

  /**
   * Makes one exact match-start viewmodel synchronously selectable. WebGL2 has
   * no catalog GPU hook, so admission must still await asset creation instead
   * of allowing setWeapon() to begin a live lazy swap after ready.
   */
  async prepareBrowserWeapon(id: WeaponId): Promise<void> {
    if (!this.browserRuntime) return;
    let model = this.models.get(id);
    if (model && this.modelIsGpuReady(model)) return;
    await loadPass65WeaponPresentation(id, 'first-person');
    model = this.models.get(id);
    if (!model) {
      const loadedModel = this.createLoadedBrowserWeapon(id);
      if (!loadedModel) throw new Error(`Pass 65 match-start viewmodel unavailable after load: ${id}`);
      loadedModel.visible = false;
      loadedModel.traverse((node) => { node.layers.mask = this.root.layers.mask; });
      deepFreezeSubtreeMatrices(loadedModel);
      this.models.set(id, loadedModel);
      this.modelLastUsed.set(id, ++this.modelUseCounter);
      this.root.add(loadedModel);
      model = loadedModel;
    }
    await this.prewarmBrowserModel(id, model, this.browserWeaponRequest);
    if (!this.modelIsGpuReady(model)) {
      throw new Error(`Pass 65 match-start viewmodel did not reach GPU readiness: ${id}`);
    }
  }

  /**
   * Exercises the exact retained first-person fire pose behind the deployment
   * surface. WebGL2 does not use the streamed WebGPU hook, so an idle-model
   * compile alone leaves the authored fire clip and bounded muzzle-light
   * topology to compile on the first live shot.
   */
  async prewarmBrowserWeaponFirePresentation(
    id: WeaponId,
    submit: (root: THREE.Object3D) => Promise<void>,
  ): Promise<void> {
    await this.prepareBrowserWeapon(id);
    const model = this.models.get(id);
    if (!model) throw new Error(`Pass 65 fire presentation unavailable after load: ${id}`);
    const priorActive = this.active;
    const priorRootVisible = this.root.visible;
    const priorModelVisibility = new Map([...this.models].map(([weaponId, entry]) => [weaponId, entry.visible]));
    const priorFlashVisible = this.muzzleFlash.visible;
    const priorLightVisible = this.muzzleLight.visible;
    const priorLightIntensity = this.muzzleLight.intensity;
    const priorRootPosition = this.root.position.clone();
    const priorCasingCursor = this.casingCursor;
    const priorSmokeCursor = this.smokeCursor;
    const priorSmokeVisible = this.smokePoints.visible;
    const priorSmokePositions = this.smokePositions.slice();
    const priorSmokeColors = this.smokeColors.slice();
    const priorSmokes = this.smokes.map((smoke) => ({
      velocity: smoke.velocity.clone(),
      life: smoke.life,
      maxLife: smoke.maxLife,
      active: smoke.active,
    }));
    const stagedCasing = this.casings[this.casingCursor % this.casings.length];
    const priorCasing = stagedCasing ? {
      geometry: stagedCasing.mesh.geometry,
      material: stagedCasing.mesh.material,
      position: stagedCasing.mesh.position.clone(),
      quaternion: stagedCasing.mesh.quaternion.clone(),
      scale: stagedCasing.mesh.scale.clone(),
      visible: stagedCasing.mesh.visible,
      velocity: stagedCasing.velocity.clone(),
      life: stagedCasing.life,
      frames: stagedCasing.frames,
      active: stagedCasing.active,
    } : null;
    try {
      this.active = id;
      this.root.visible = true;
      for (const entry of this.models.values()) entry.visible = entry === model;
      this.applyModelMatrixFreeze();
      this.updateActiveSockets(id);
      fireImportedWeapon(model);
      updateImportedWeapon(model, 1 / 60);
      this.muzzleFlash.visible = true;
      this.muzzleLight.visible = true;
      this.muzzleLight.intensity = viewmodelBodyFitLightIntensity(1);
      if (id === 'flamethrower') {
        this.enforceNearPlaneClearance(model, this.root.getObjectByName('first-person-arms'));
        this.flamethrowerHeldFireClearancePrewarmChecks += 1;
      }
      // Submit the exact retained Points and brass Mesh used by a legal shot,
      // without calling fire() or advancing gameplay/presentation cursors. An
      // idle viewmodel compile cannot create these material programs because
      // both pooled objects are normally hidden until the accepted shot.
      const muzzle = this.socketLocalPosition(model, 'muzzle-socket')
        ?? new THREE.Vector3(0, 0.08, -1.15);
      const smokeCount = Math.min(this.smokes.length, Math.ceil(weaponFamilyPresentation(id).smokeBase));
      for (let index = 0; index < smokeCount; index += 1) {
        const slot = (this.smokeCursor + index) % this.smokes.length;
        const smoke = this.smokes[slot];
        const offset = slot * 3;
        this.smokePositions[offset] = muzzle.x + (index - smokeCount / 2) * 0.012;
        this.smokePositions[offset + 1] = muzzle.y + index * 0.008;
        this.smokePositions[offset + 2] = muzzle.z - 0.05 - index * 0.035;
        smoke.velocity.set(0, 0.12, -0.14);
        smoke.maxLife = 0.2;
        smoke.life = smoke.maxLife;
        smoke.active = true;
        this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0.62;
      }
      this.smokePoints.visible = smokeCount > 0;
      (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      if (stagedCasing) {
        stagedCasing.mesh.geometry = this.brassGeometry;
        stagedCasing.mesh.material = this.brassMaterial;
        stagedCasing.mesh.position.copy(
          this.socketLocalPosition(model, 'eject-socket') ?? new THREE.Vector3(0.12, 0.04, -0.48),
        );
        stagedCasing.mesh.rotation.set(0.2, 0, Math.PI / 2);
        stagedCasing.mesh.visible = true;
        stagedCasing.velocity.set(1.05, 0.85, 0.1);
        stagedCasing.life = 0.42;
        stagedCasing.frames = 0;
        stagedCasing.active = true;
      }
      await submit(this.root);
    } finally {
      resetImportedWeaponAnimations(model);
      this.active = priorActive;
      this.root.visible = priorRootVisible;
      for (const [weaponId, visible] of priorModelVisibility) {
        const entry = this.models.get(weaponId);
        if (entry) entry.visible = visible;
      }
      this.muzzleFlash.visible = priorFlashVisible;
      this.muzzleLight.visible = priorLightVisible;
      this.muzzleLight.intensity = priorLightIntensity;
      this.root.position.copy(priorRootPosition);
      this.casingCursor = priorCasingCursor;
      this.smokeCursor = priorSmokeCursor;
      this.smokePositions.set(priorSmokePositions);
      this.smokeColors.set(priorSmokeColors);
      this.smokePoints.visible = priorSmokeVisible;
      (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      for (let index = 0; index < this.smokes.length; index += 1) {
        const smoke = this.smokes[index];
        const prior = priorSmokes[index];
        if (!prior) continue;
        smoke.velocity.copy(prior.velocity);
        smoke.life = prior.life;
        smoke.maxLife = prior.maxLife;
        smoke.active = prior.active;
      }
      if (stagedCasing && priorCasing) {
        stagedCasing.mesh.geometry = priorCasing.geometry;
        stagedCasing.mesh.material = priorCasing.material;
        stagedCasing.mesh.position.copy(priorCasing.position);
        stagedCasing.mesh.quaternion.copy(priorCasing.quaternion);
        stagedCasing.mesh.scale.copy(priorCasing.scale);
        stagedCasing.mesh.visible = priorCasing.visible;
        stagedCasing.velocity.copy(priorCasing.velocity);
        stagedCasing.life = priorCasing.life;
        stagedCasing.frames = priorCasing.frames;
        stagedCasing.active = priorCasing.active;
      }
      this.updateActiveSockets(priorActive);
    }
  }

  /** Rehearse the exact retained reload pose without advancing live reload authority. */
  async prewarmBrowserWeaponReloadPresentation(
    id: WeaponId,
    submit: (root: THREE.Object3D) => Promise<void>,
  ): Promise<void> {
    await this.prepareBrowserWeapon(id);
    const model = this.models.get(id);
    if (!model) throw new Error(`Pass 65 reload presentation unavailable after load: ${id}`);
    const priorActive = this.active;
    const priorReloadLastProgress = this.reloadLastProgress;
    const priorNodes: Array<Readonly<{
      node: THREE.Object3D;
      visible: boolean;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    }>> = [];
    this.root.traverse((node) => priorNodes.push({
      node,
      visible: node.visible,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    }));
    try {
      this.active = id;
      this.root.visible = true;
      for (const entry of this.models.values()) entry.visible = entry === model;
      this.applyModelMatrixFreeze();
      this.updateActiveSockets(id);
      reloadImportedWeapon(model);
      updateImportedWeapon(model, 0.16);
      if (this.authoredArmsRoot) {
        playFirstPersonArmAction(this.authoredArmsRoot, 'reload');
        updateFirstPersonArmAnimations(this.authoredArmsRoot, 0.16);
      }
      const reloadPose = reloadPoseAt(id, 0.5);
      const magazineName = id === 'carbine'
        ? 'curved-magazine'
        : id === 'lmg'
          ? 'lmg-box-magazine'
          : id === 'pistol' || id === 'machine-pistol' || id === 'magnum'
            ? 'pistol-magazine'
            : 'straight-magazine';
      const magazine = model.getObjectByName(magazineName);
      if (magazine) {
        const restX = Number(magazine.userData.restX ?? magazine.position.x);
        const restY = Number(magazine.userData.restY ?? magazine.position.y);
        const restZ = Number(magazine.userData.restZ ?? magazine.position.z);
        const restRotationZ = Number(magazine.userData.restRotationZ ?? magazine.rotation.z);
        magazine.position.set(
          restX + reloadPose.magazineLateral,
          restY - reloadPose.magazineDrop,
          restZ + reloadPose.magazineForward,
        );
        magazine.rotation.z = restRotationZ + reloadPose.magazineTwist;
      }
      const reloadShell = model.getObjectByName('reload-shell');
      if (reloadShell) {
        reloadShell.visible = reloadPose.shellVisible;
        reloadShell.position.set(-0.16 + reloadPose.shellTravel * 0.13, -0.13 + reloadPose.shellTravel * 0.035, -0.02);
      }
      this.reloadLastProgress = 0.5;
      await submit(this.root);
    } finally {
      resetImportedWeaponAnimations(model);
      if (this.authoredArmsRoot) resetFirstPersonArmAnimations(this.authoredArmsRoot);
      this.active = priorActive;
      this.reloadLastProgress = priorReloadLastProgress;
      for (const prior of priorNodes) {
        prior.node.visible = prior.visible;
        prior.node.position.copy(prior.position);
        prior.node.quaternion.copy(prior.quaternion);
        prior.node.scale.copy(prior.scale);
      }
    }
  }

  private async performBrowserWeaponCatalogPrewarm(
    ids: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<void> {
    const prewarmStartedAt = performance.now();
    const assetPrepareStartedAt = performance.now();
    const { entries, assetLoadMs, modelCreateMs, newlyCreated } = await this.prepareBrowserCatalogEntries(
      ids,
      undefined,
      yieldToBrowser,
    );
    const assetPrepareWallMs = performance.now() - assetPrepareStartedAt;

    const gpuPrewarmStartedAt = performance.now();
    let gpuSubmissionBatches = 0;
    if (this.catalogGpuPrewarmer) {
      // A live switch can already own one candidate's individual prewarm. Let
      // that exact operation settle before forming the remaining deployment
      // batch so one model is never staged by two owners concurrently.
      await Promise.all(entries.flatMap(({ model }) => {
        const pending = this.gpuPrewarmPromises.get(model);
        return pending ? [pending] : [];
      }));
      const batchEntries = entries.filter(({ model }) => !this.modelIsGpuReady(model));
      gpuSubmissionBatches = this.browserCatalogGpuSubmissionBatches(batchEntries).length;
      const flashlightEntries = batchEntries.filter(({ weaponId }) => WEAPONS[weaponId].flashlight !== null);
      if (flashlightEntries[0]) this.configureWeaponFlashlight(flashlightEntries[0].weaponId);
      try {
        await this.prewarmBrowserCatalogModels(batchEntries, this.browserWeaponRequest, yieldToBrowser);
        // One shared spotlight topology serves every flashlight-capable
        // weapon. The batch exercises that renderer pipeline once, so telemetry
        // counts the real submission exercise rather than the model count.
        this.flashlightGpuPrewarmCount += Number(flashlightEntries.length > 0);
      } catch (error) {
        for (const { weaponId, model } of batchEntries) this.retireRejectedBrowserModel(weaponId, model);
        throw error;
      } finally {
        if (flashlightEntries.length > 0) this.configureWeaponFlashlight(this.active);
      }
      entries.forEach((_entry, index) => {
        onProgress?.(index + 1, ids.length);
      });
    } else {
      gpuSubmissionBatches = entries.reduce(
        (count, { model }) => count + Number(!this.modelIsGpuReady(model)),
        0,
      );
      for (const [index, { weaponId: id, model }] of entries.entries()) {
        const exercisesFlashlightPipeline = WEAPONS[id].flashlight !== null;
        let flashlightPipelineReady = false;
        if (exercisesFlashlightPipeline) this.configureWeaponFlashlight(id);
        try {
          await this.prewarmBrowserModel(id, model, this.browserWeaponRequest);
          flashlightPipelineReady = true;
        } catch (error) {
          this.retireRejectedBrowserModel(id, model);
          throw error;
        } finally {
          if (exercisesFlashlightPipeline) {
            if (flashlightPipelineReady) this.flashlightGpuPrewarmCount += 1;
            this.configureWeaponFlashlight(this.active);
          }
        }
        onProgress?.(index + 1, ids.length);
        await yieldToBrowser?.();
      }
    }
    const gpuPrewarmMs = performance.now() - gpuPrewarmStartedAt;
    const cleanupStartedAt = performance.now();
    this.commitBrowserResidentCatalog(ids);
    const activeModel = this.models.get(this.active);
    if (!activeModel || !this.modelIsGpuReady(activeModel)) {
      throw new Error(`Pass 65 active first-person catalog model was not GPU-ready: ${this.active}`);
    }
    for (const [weaponId, model] of this.models) model.visible = weaponId === this.active;
    this.modelLastUsed.set(this.active, ++this.modelUseCounter);
    this.updateActiveSockets(this.active);
    this.lastBrowserCatalogPrewarmProfile = Object.freeze({
      requested: ids.length,
      newlyCreated,
      assetLoadMs: Number(assetLoadMs.toFixed(3)),
      modelCreateMs: Number(modelCreateMs.toFixed(3)),
      assetPrepareWallMs: Number(assetPrepareWallMs.toFixed(3)),
      gpuPrewarmMs: Number(gpuPrewarmMs.toFixed(3)),
      gpuSubmissionBatches,
      cleanupMs: Number((performance.now() - cleanupStartedAt).toFixed(3)),
      totalMs: Number((performance.now() - prewarmStartedAt).toFixed(3)),
      mode: this.catalogGpuPrewarmer ? 'catalog-batch' : 'individual-fallback',
    });
  }

  private normalizeBrowserWeaponCatalog(requestedIds: readonly WeaponId[]): WeaponId[] {
    const ids = [...new Set(requestedIds)];
    if (ids.length === 0 || ids.length > WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS) {
      throw new Error(`Pass 65 browser weapon catalog requires 1-${WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS} unique models`);
    }
    return ids;
  }

  private async prepareBrowserCatalogEntries(
    ids: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<Readonly<{
    entries: readonly WeaponViewmodelCatalogGpuPrewarmEntry[];
    assetLoadMs: number;
    modelCreateMs: number;
    newlyCreated: number;
  }>> {
    let assetLoadMs = 0;
    let modelCreateMs = 0;
    let newlyCreated = 0;
    const entries: WeaponViewmodelCatalogGpuPrewarmEntry[] = [];
    // Load then immediately acquire each cache-backed clone. A wider decode
    // burst can exceed the two-source soft cache before awaiting owners acquire
    // refs, evicting a just-decoded source. Existing retained models already own
    // their source refs and must not re-enter the loader during final GPU prewarm.
    for (const [index, id] of ids.entries()) {
      let model = this.models.get(id);
      if (!model) {
        const assetLoadStartedAt = performance.now();
        await loadPass65WeaponPresentation(id, 'first-person');
        assetLoadMs += performance.now() - assetLoadStartedAt;
        const modelCreateStartedAt = performance.now();
        // A live switch can finish the same load while catalog preparation is
        // awaiting. Re-read the map before creating so one ID keeps one instance.
        model = this.models.get(id);
        if (!model) {
          const loadedModel = this.createLoadedBrowserWeapon(id);
          if (!loadedModel) throw new Error(`Pass 65 first-person catalog asset unavailable after load: ${id}`);
          model = loadedModel;
          model.visible = false;
          model.traverse((node) => { node.layers.mask = this.root.layers.mask; });
          this.models.set(id, model);
          this.modelLastUsed.set(id, ++this.modelUseCounter);
          this.root.add(model);
          newlyCreated += 1;
        }
        modelCreateMs += performance.now() - modelCreateStartedAt;
      }
      entries.push(Object.freeze({ weaponId: id, model }));
      onProgress?.(index + 1, ids.length);
      await yieldToBrowser?.();
    }
    return Object.freeze({ entries: Object.freeze(entries), assetLoadMs, modelCreateMs, newlyCreated });
  }

  private async performBrowserWeaponCatalogAssetPreparation(
    ids: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<void> {
    await this.prepareBrowserCatalogEntries(ids, onProgress, yieldToBrowser);
    this.commitBrowserResidentCatalog(ids);
  }

  private commitBrowserResidentCatalog(ids: readonly WeaponId[]): void {
    const desired = new Set(ids);
    // Commit only after every requested model exists. Rebuilding the Set also
    // makes the latest serialized request's order and membership authoritative.
    this.browserResidentWeaponIds.clear();
    for (const id of ids) this.browserResidentWeaponIds.add(id);
    for (const [id, model] of [...this.models]) {
      if (
        desired.has(id)
        || id === this.active
        || model.visible
        || this.gpuPrewarmPromises.has(model)
      ) continue;
      this.models.delete(id);
      this.modelLastUsed.delete(id);
      this.root.remove(model);
      if (this.retireModel) this.retireModel(model, () => releasePass65WeaponModel(model));
      else disposePass65WeaponModel(model);
    }
  }

  isReady(): boolean {
    return typeof document !== 'undefined' ? this.models.has(this.active) : this.models.size === Object.keys(WEAPONS).length;
  }

  /**
   * Allocation-light imported-model readiness for frame-transition gates. This
   * deliberately avoids presentationState(), whose framing telemetry traverses
   * every mesh and would itself contaminate a per-animation-frame hitch probe.
   */
  activeWeaponReadiness(): Readonly<{
    requestedWeapon: WeaponId;
    ready: boolean;
    modelLoaded: boolean;
    gpuReady: boolean;
    resident: boolean;
    catalogPrewarming: boolean;
    importedWeapon: WeaponId | null;
    mountedIsRequested: boolean;
  }> {
    const requestedModel = this.models.get(this.active);
    const mountedModel = this.mountedModel();
    const importedRuntime = mountedModel?.userData.importedWeaponRuntime as { weapon?: unknown } | undefined;
    const importedWeapon = typeof importedRuntime?.weapon === 'string'
      && Object.prototype.hasOwnProperty.call(WEAPONS, importedRuntime.weapon)
      ? importedRuntime.weapon as WeaponId
      : null;
    const modelLoaded = requestedModel !== undefined;
    const gpuReady = requestedModel !== undefined && this.modelIsGpuReady(requestedModel);
    const mountedIsRequested = requestedModel !== undefined
      && mountedModel === requestedModel
      && requestedModel.visible;
    return Object.freeze({
      requestedWeapon: this.active,
      ready: modelLoaded && gpuReady && mountedIsRequested && importedWeapon === this.active,
      modelLoaded,
      gpuReady,
      resident: this.browserResidentWeaponIds.has(this.active),
      catalogPrewarming: this.browserCatalogOperationPromise !== null,
      importedWeapon,
      mountedIsRequested,
    });
  }

  /** Narrow live-gate health; unlike presentationState(), this never traverses models or measures framing. */
  browserCatalogHealth(): Readonly<{
    retainedCount: number;
    loaded: number;
    prewarming: boolean;
    unpreparedSwitches: number;
    maximumRetained: number;
  }> {
    return Object.freeze({
      retainedCount: this.browserResidentWeaponIds.size,
      loaded: this.models.size,
      prewarming: this.browserCatalogOperationPromise !== null,
      unpreparedSwitches: this.unpreparedBrowserSwitches,
      maximumRetained: WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS,
    });
  }

  /** Exact catalog readiness for cold admission without full viewmodel framing/traversal telemetry. */
  browserCatalogReadiness() {
    return Object.freeze({
      retained: Object.freeze([...this.browserResidentWeaponIds]),
      retainedCount: this.browserResidentWeaponIds.size,
      loaded: this.models.size,
      gpuReady: [...this.models.values()].reduce(
        (count, model) => count + Number(this.modelIsGpuReady(model)),
        0,
      ),
      available: Object.keys(WEAPONS).length,
      prewarming: this.browserCatalogOperationPromise !== null,
      unpreparedSwitches: this.unpreparedBrowserSwitches,
      lastUnpreparedSwitch: this.lastUnpreparedBrowserSwitch,
      maximumRetained: WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS,
      flashlightGpuPrewarmCount: this.flashlightGpuPrewarmCount,
      lastPrewarmProfile: this.lastBrowserCatalogPrewarmProfile,
    });
  }

  /**
   * Invalidates only renderer-pipeline-dependent readiness. Retained models,
   * decoded assets and the requested resident catalog stay intact so the final
   * TSL/HDR graph can re-prewarm the same instances without another asset load.
   */
  invalidateBrowserWeaponGpuReadinessForPipelineChange(): void {
    if (!this.browserRuntime || !this.gpuPrewarmer) return;
    this.gpuReadinessGeneration += 1;
    this.gpuReadyModels = new WeakSet<THREE.Object3D>();
    this.gpuPrewarmPromises = new WeakMap<THREE.Object3D, Promise<void>>();
  }

  private createLoadedBrowserWeapon(id: WeaponId): THREE.Group | null {
    const model = id === 'explosive-crossbow'
      ? createPass65CrossbowModel(this.flattenMaterials, 'first-person')
      : createPass65WeaponModel(id, this.flattenMaterials, 'first-person');
    return model ? prepareFirstPersonWeaponModel(id, model, this.flattenMaterials, this.browserRuntime) : null;
  }

  private trimBrowserWeaponModels(): void {
    if (this.browserCatalogOperationPromise) return;
    const retainedLimit = Math.max(2, this.browserResidentWeaponIds.size);
    while (this.models.size > retainedLimit) {
      const victim = [...this.models.keys()]
        .filter((id) => {
          const model = this.models.get(id);
          if (!model || id === this.active || model.visible || this.browserResidentWeaponIds.has(id)) return false;
          return !this.gpuPrewarmPromises.has(model);
        })
        .sort((a, b) => (this.modelLastUsed.get(a) ?? 0) - (this.modelLastUsed.get(b) ?? 0))[0];
      if (!victim) return;
      const model = this.models.get(victim);
      if (model) {
        this.root.remove(model);
        if (this.retireModel) this.retireModel(model, () => releasePass65WeaponModel(model));
        else disposePass65WeaponModel(model);
      }
      this.models.delete(victim);
      this.modelLastUsed.delete(victim);
    }
  }

  private updateActiveSockets(id: WeaponId): void {
    const activeModel = this.models.get(id);
    const muzzlePosition = activeModel ? this.socketLocalPosition(activeModel, 'muzzle-socket') : null;
    if (muzzlePosition) {
      this.muzzleLight.position.copy(muzzlePosition);
      this.muzzleFlash.position.copy(muzzlePosition);
    }
  }

  private mountedModel(): THREE.Object3D | undefined {
    const requested = this.models.get(this.active);
    if (requested && this.modelIsGpuReady(requested)) return requested;
    return [...this.models.values()].find((model) => model.visible);
  }

  private modelIsGpuReady(model: THREE.Object3D): boolean {
    return !this.gpuPrewarmer || this.gpuReadyModels.has(model);
  }

  private prewarmBrowserModel(id: WeaponId, model: THREE.Object3D, requestGeneration: number): Promise<void> {
    if (this.modelIsGpuReady(model)) return Promise.resolve();
    const pending = this.gpuPrewarmPromises.get(model);
    if (pending) return pending;
    const readinessGeneration = this.gpuReadinessGeneration;
    const promiseRegistry = this.gpuPrewarmPromises;
    let promise: Promise<void>;
    promise = Promise.resolve().then(() => this.gpuPrewarmer!(model, {
      weaponId: id,
      requestGeneration,
    })).then(async () => {
      if (readinessGeneration !== this.gpuReadinessGeneration) {
        if (this.models.get(id) === model) await this.prewarmBrowserModel(id, model, requestGeneration);
        return;
      }
      if (this.models.get(id) === model) this.gpuReadyModels.add(model);
    }).finally(() => {
      if (promiseRegistry.get(model) === promise) promiseRegistry.delete(model);
    });
    promiseRegistry.set(model, promise);
    return promise;
  }

  private prewarmBrowserCatalogModels(
    entries: readonly WeaponViewmodelCatalogGpuPrewarmEntry[],
    requestGeneration: number,
    yieldToBrowser?: () => Promise<void>,
  ): Promise<void> {
    if (entries.length === 0) return Promise.resolve();
    const pending = [...new Set(entries.flatMap(({ model }) => {
      const operation = this.gpuPrewarmPromises.get(model);
      return operation ? [operation] : [];
    }))];
    if (pending.length > 0) {
      return Promise.all(pending).then(() => this.prewarmBrowserCatalogModels(
        entries.filter(({ model }) => !this.modelIsGpuReady(model)),
        requestGeneration,
        yieldToBrowser,
      ));
    }
    const readinessGeneration = this.gpuReadinessGeneration;
    const promiseRegistry = this.gpuPrewarmPromises;
    let promise: Promise<void>;
    promise = Promise.resolve().then(async () => {
      const batches = this.browserCatalogGpuSubmissionBatches(entries);
      for (const [batchIndex, batch] of batches.entries()) {
        if (readinessGeneration !== this.gpuReadinessGeneration) break;
        await this.catalogGpuPrewarmer!(batch, { requestGeneration });
        if (readinessGeneration !== this.gpuReadinessGeneration) break;
        if (batchIndex + 1 < batches.length) {
          // End the current browser task between renderer submissions so the
          // prerecorded loading/menu video and accessibility UI can present.
          // One giant 17-model node build created a measured 1.24s long task.
          if (yieldToBrowser) await yieldToBrowser();
          else await yieldBrowserPreparationFrame();
        }
      }
    }).then(async () => {
      if (readinessGeneration !== this.gpuReadinessGeneration) {
        await this.prewarmBrowserCatalogModels(
          entries.filter(({ weaponId, model }) => this.models.get(weaponId) === model),
          requestGeneration,
          yieldToBrowser,
        );
        return;
      }
      for (const { weaponId, model } of entries) {
        if (this.models.get(weaponId) === model) this.gpuReadyModels.add(model);
      }
    }).finally(() => {
      for (const { model } of entries) {
        if (promiseRegistry.get(model) === promise) promiseRegistry.delete(model);
      }
    });
    for (const { model } of entries) promiseRegistry.set(model, promise);
    return promise;
  }

  private browserCatalogGpuSubmissionBatches(
    entries: readonly WeaponViewmodelCatalogGpuPrewarmEntry[],
  ): readonly (readonly WeaponViewmodelCatalogGpuPrewarmEntry[])[] {
    const batches: WeaponViewmodelCatalogGpuPrewarmEntry[][] = [];
    for (let offset = 0; offset < entries.length;) {
      const current = entries[offset]!;
      const next = entries[offset + 1];
      // The retained sidearm/special families caused the only two catalog
      // Long Tasks in the exact cold receipt (69/59 ms). Submit them alone so
      // every model remains genuinely drawn while the browser task stays under
      // the preserved 50 ms gameplay threshold. Ordinary rifles retain the
      // measured two-model throughput bound.
      const submissionSize = WeaponPresentation.CATALOG_GPU_SINGLETON_WEAPONS.has(current.weaponId)
        || next && WeaponPresentation.CATALOG_GPU_SINGLETON_WEAPONS.has(next.weaponId)
        ? 1
        : WeaponPresentation.CATALOG_GPU_MODELS_PER_SUBMISSION;
      batches.push(entries.slice(offset, offset + submissionSize));
      offset += submissionSize;
    }
    return batches;
  }

  private retireRejectedBrowserModel(id: WeaponId, model: THREE.Object3D): void {
    if (this.models.get(id) !== model || this.gpuReadyModels.has(model)) return;
    this.browserResidentWeaponIds.delete(id);
    this.models.delete(id);
    this.modelLastUsed.delete(id);
    this.root.remove(model);
    if (this.retireModel) this.retireModel(model, () => releasePass65WeaponModel(model));
    else disposePass65WeaponModel(model);
  }

  private ensureBrowserWeapon(id: WeaponId): void {
    const request = ++this.browserWeaponRequest;
    void loadPass65WeaponPresentation(id, 'first-person').then(async () => {
      if (!this.models.has(id)) {
        const model = this.createLoadedBrowserWeapon(id);
        if (!model) throw new Error(`Pass 65 first-person asset unavailable after load: ${id}`);
        model.visible = false;
        // The initial asset is attached before legacy assigns the dedicated
        // viewmodel layer. Streamed replacements arrive later, so inherit the
        // current root mask explicitly or their descendants fall back to world
        // layer 0 and bypass the depth-cleared viewmodel composite.
        model.traverse((node) => { node.layers.mask = this.root.layers.mask; });
        this.models.set(id, model);
        this.modelLastUsed.set(id, ++this.modelUseCounter);
        this.root.add(model);
      }
      const model = this.models.get(id)!;
      try {
        await this.prewarmBrowserModel(id, model, request);
      } catch (error) {
        this.retireRejectedBrowserModel(id, model);
        throw error;
      }
      if (request === this.browserWeaponRequest && this.active === id) {
        for (const [weaponId, model] of this.models) model.visible = weaponId === id;
        this.modelLastUsed.set(id, ++this.modelUseCounter);
        this.updateActiveSockets(id);
      }
      this.trimBrowserWeaponModels();
    }).catch((error: unknown) => {
      this.root.userData.pass65WeaponLoadError = error instanceof Error ? error.message : String(error);
      console.error(`Pass 65 authored weapon load failed for ${id}`, error);
    });
  }

  /**
   * Places the contact cut for this frame.
   *
   * It reads exactly one number - `clipPlaneDistanceMeters`, which the fold
   * solve published - so the plane cannot disagree with the pose that was
   * actually applied, and it is inert when nothing a plane can represent is in
   * front of the rig. That number is the ON-AXIS depth, not the conservative
   * lattice minimum the fold solved against; see `measuredEnvelopeCutDepthMeters`.
   */
  /**
   * Move the contact plane far enough forward that nothing is clipped, WITHOUT
   * changing the clipping state. Keeping the group armed at a harmless position
   * holds the shader permutation constant; toggling `enabled` does not.
   */
  private parkViewmodelContactClip(): void {
    this.camera.updateWorldMatrix(true, false);
    const scratch = this.contactClipScratch;
    const eye = this.camera.getWorldPosition(scratch.eye);
    const forward = this.camera.getWorldDirection(scratch.forward);
    // 1 km ahead: every viewmodel vertex sits within ~3 m, so all of it is on
    // the kept camera side of the plane.
    const point = scratch.point.copy(eye).addScaledVector(forward, VIEWMODEL_CONTACT_CLIP_PARKED_METERS);
    this.contactClipPlane.normal.copy(forward).multiplyScalar(-1);
    this.contactClipPlane.constant = -this.contactClipPlane.normal.dot(point);
  }

  /**
   * Point a plane 1 km ahead of the camera, where every viewmodel vertex is on
   * its kept side. This is how an unused slot is retired WITHOUT changing the
   * array length, which is what holds the shader permutation constant.
   */
  private parkPlane(plane: THREE.Plane): void {
    const scratch = this.contactClipScratch;
    const eye = this.camera.getWorldPosition(scratch.eye);
    const forward = this.camera.getWorldDirection(scratch.forward);
    const point = scratch.point.copy(eye).addScaledVector(forward, VIEWMODEL_CONTACT_CLIP_PARKED_METERS);
    plane.normal.copy(forward).multiplyScalar(-1);
    plane.constant = -plane.normal.dot(point);
  }

  /**
   * Apply this frame's surface-aligned cuts.
   *
   * These are the surfaces' OWN planes, so unlike the camera-perpendicular cut
   * they work at any angle - which is the whole point. Every slot is written
   * every frame: a live one takes a surface, a spare one is parked. Nothing
   * ever changes the array's length.
   */
  private applyViewmodelSurfaceClip(planes: readonly ViewmodelSurfacePlane[] | undefined): void {
    this.camera.updateWorldMatrix(true, false);
    for (let slot = 0; slot < this.surfaceClipPlanes.length; slot += 1) {
      const target = this.surfaceClipPlanes[slot]!;
      const source = planes?.[slot];
      if (!source) {
        this.parkPlane(target);
        continue;
      }
      target.normal.set(source.normal.x, source.normal.y, source.normal.z);
      target.constant = source.constant;
    }
  }

  private applyViewmodelContactClip(): void {
    const clippingRoot = this.root as ViewmodelClippingRoot;
    // HF-410: the solve now works in rig metres (its depth inputs are
    // converted on the way in), and this plane is placed in world space.
    const solvedMeters = this.contactFold.clipPlaneDistanceMeters;
    const surfaceMeters = solvedMeters === null || !Number.isFinite(solvedMeters)
      ? solvedMeters
      : viewmodelRigToWorldMeters(solvedMeters);
    if (surfaceMeters === null || !Number.isFinite(surfaceMeters)) {
      // Park the plane instead of disarming the group - see the constructor.
      // Disabling would flip every viewmodel material's shader permutation and
      // recompile the lot, which is what was freezing the game.
      this.parkViewmodelContactClip();
      return;
    }
    // HF-410 REPAIR: this plane is placed in WORLD metres, and the plane that
    // can actually clip the rig is the ON-FOOT GAMEPLAY CAMERA's - the
    // depth-cleared overlay submission does not run on the shipped WebGPU
    // route (atomicSignal is hardcoded null), so the rig is drawn at
    // FIRST_PERSON_CAMERA_NEAR_METERS. Using the larger, real plane raises
    // this floor from 0.002 m to 0.02 m, which is the stricter direction: the
    // cut can never be placed closer to the eye than the plane that already
    // discards everything there. The clearance is authored in rig metres, so
    // it converts.
    const nearPlane = FIRST_PERSON_CAMERA_NEAR_METERS;
    const cutMeters = Math.max(
      nearPlane + viewmodelRigToWorldMeters(VIEWMODEL_NEAR_PLANE_CLEARANCE),
      surfaceMeters - VIEWMODEL_CONTACT_CLIP_MARGIN_METERS,
    );
    this.camera.updateWorldMatrix(true, false);
    const scratch = this.contactClipScratch;
    const eye = this.camera.getWorldPosition(scratch.eye);
    const forward = this.camera.getWorldDirection(scratch.forward);
    const point = scratch.point.copy(eye).addScaledVector(forward, cutMeters);
    // Normal points back at the camera: the kept half-space is camera-side.
    this.contactClipPlane.normal.copy(forward).multiplyScalar(-1);
    this.contactClipPlane.constant = -this.contactClipPlane.normal.dot(point);
    clippingRoot.enabled = true;
  }

  /**
   * The mounted weapon's own bounds, in the viewmodel root's LOCAL frame.
   *
   * Measured once per weapon off the real mesh, then cached: geometry does not
   * change, and the contact fold must never be handed an authored guess again.
   * The ARMS are excluded on purpose - their batched sleeve mesh carries a
   * bounding box roughly a metre looser than the anatomy it covers (measured
   * 2.11 m of forward reach against a 1.47 m weapon), so folding against it
   * would fold the rig in open ground. The hands sit on the weapon, so the
   * weapon's own span still covers the volume the lattice has to sample.
   */
  private measureRigBounds(): ViewmodelRigBounds | null {
    const cached = this.rigBounds.get(this.active);
    if (cached) return cached;
    const model = this.models.get(this.active);
    if (!model || !this.modelIsGpuReady(model)) return null;
    this.root.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    const toRoot = rigBoundsToRoot.copy(this.root.matrixWorld).invert();
    const bounds = rigBoundsAccumulator.makeEmpty();
    const hullPoints: (readonly [number, number])[] = [];
    let meshes = 0;
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      for (let parent: THREE.Object3D | null = node.parent; parent && parent !== model; parent = parent.parent) {
        if (!parent.visible) return;
      }
      const geometry = node.geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      rigBoundsMatrix.multiplyMatrices(toRoot, node.matrixWorld);
      rigBoundsMesh.copy(geometry.boundingBox).applyMatrix4(rigBoundsMatrix);
      bounds.union(rigBoundsMesh);
      // REAL VERTICES, not the eight corners of a box around them.
      //
      // The corners were the last authored-ish guess left in this path and
      // they are measurably wrong in both directions: on the flamethrower the
      // box corner sits 8.4 cm in front of any vertex (the fold would spend
      // travel it does not need), and on a pitched mesh the corner can also
      // fall SHORT. The hull is walked once per weapon and cached, so the cost
      // is a few thousand transforms at first mount and nothing per frame.
      const position = geometry.getAttribute('position');
      if (position) {
        for (let index = 0; index < position.count; index += 1) {
          rigBoundsVertex.fromBufferAttribute(position, index).applyMatrix4(rigBoundsMatrix);
          hullPoints.push([rigBoundsVertex.y, rigBoundsVertex.z]);
        }
      } else {
        hullPoints.push(
          [rigBoundsMesh.min.y, rigBoundsMesh.min.z],
          [rigBoundsMesh.min.y, rigBoundsMesh.max.z],
          [rigBoundsMesh.max.y, rigBoundsMesh.min.z],
          [rigBoundsMesh.max.y, rigBoundsMesh.max.z],
        );
      }
      meshes += 1;
    });
    if (meshes === 0 || !Number.isFinite(bounds.min.z) || !Number.isFinite(bounds.max.z)) return null;
    const muzzle = this.socketLocalPosition(model, 'muzzle-socket');
    const measured: ViewmodelRigBounds = Object.freeze({
      minX: bounds.min.x, maxX: bounds.max.x,
      minY: bounds.min.y, maxY: bounds.max.y,
      minZ: bounds.min.z, maxZ: bounds.max.z,
      hullYZ: Object.freeze(convexHullYZ(hullPoints)),
      // No authored socket: the forward-most bound corner is the muzzle for
      // fold purposes, which is conservative rather than optimistic.
      muzzleX: muzzle?.x ?? (bounds.min.x + bounds.max.x) / 2,
      muzzleY: muzzle?.y ?? (bounds.min.y + bounds.max.y) / 2,
      muzzleZ: muzzle?.z ?? bounds.min.z,
      meshes,
    });
    this.rigBounds.set(this.active, measured);
    return measured;
  }

  /**
   * The rig's camera-space envelope at the NEUTRAL pose - no contact retreat,
   * no fold, no recoil. The contact lattice is placed with this, so a longer
   * weapon gets a longer probe over the volume it really occupies. Taking it
   * at the neutral pose is what stops the obvious feedback loop: a folded rig
   * is shorter, a shorter rig probes less, and the fold would chatter.
   */
  contactProbeEnvelope(): ViewmodelContactEnvelope | null {
    const bounds = this.measureRigBounds();
    if (!bounds) return null;
    const scale = THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend)
      * viewmodelScreenScale(this.camera);
    const x = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.x, ADS_VIEWMODEL_BASE_POSITION.x, this.adsBlend);
    const y = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.y, ADS_VIEWMODEL_BASE_POSITION.y, this.adsBlend);
    const z = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.z, ADS_VIEWMODEL_BASE_POSITION.z, this.adsBlend)
      - VIEWMODEL_NEAR_PLANE_CLEARANCE;
    // HF-410: THE ENVELOPE IS THE PROBE'S REACH, AND THE PROBE IS WORLD SPACE.
    //
    // Every number above is composed in the rig's own frame; the body fit
    // then scales that frame about the eye. The consumer (the contact probe
    // lattice in legacy-main) casts real world rays, so it must be handed
    // the volume the rig REALLY occupies. This conversion is the whole
    // reason the wall lift and the high-ready fold stop appearing on normal
    // poses: with the rig inside the capsule, a probe sized to it cannot
    // reach a surface the capsule is allowed to stand next to.
    return Object.freeze({
      contract: VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
      weapon: this.active,
      minX: viewmodelRigToWorldMeters(x + bounds.minX * scale),
      maxX: viewmodelRigToWorldMeters(x + bounds.maxX * scale),
      minY: viewmodelRigToWorldMeters(y + bounds.minY * scale),
      maxY: viewmodelRigToWorldMeters(y + bounds.maxY * scale),
      forwardReachMeters: viewmodelRigToWorldMeters(-(z + bounds.minZ * scale)),
    });
  }

  /** The fold the renderer applied on the last update. Read-only telemetry. */
  contactFoldState(): ViewmodelContactFold {
    return this.contactFold;
  }

  private socketLocalPosition(model: THREE.Object3D, name: string): THREE.Vector3 | null {
    const socket = model.getObjectByName(name);
    if (!socket) return null;
    // getWorldPosition updates only the socket's ancestor chain. Calling
    // updateMatrixWorld(true) on the shared viewmodel root recursively touched
    // every descendant of the complete retained weapon catalog on each switch,
    // even though every sibling model was hidden and unchanged.
    const worldPosition = socket.getWorldPosition(new THREE.Vector3());
    this.root.updateWorldMatrix(true, false);
    return this.root.worldToLocal(worldPosition);
  }

  setWeapon(id: WeaponId, immediate = false): void {
    const previousActive = this.active;
    if (id !== this.active) resetMinigunSpool(this.minigunSpool);
    this.active = id;
    this.contactResponse = viewmodelContactResponse(
      id,
      this.surfaceRetreat,
      this.surfaceLift,
      this.prone,
      this.adsBlend,
    );
    this.equipElapsedSeconds = immediate ? VIEWMODEL_EQUIP_SETTLED_SECONDS : 0;
    this.reloadLastProgress = 0;
    this.pendingScattergunShell = false;
    const activeModel = this.models.get(id);
    // HF-388: play the previously-dead authored 'equip' pose on a live weapon
    // switch. The authored pose layer turns it into visible arm carriage; the
    // mixer's own finger-only tracks carry no arm-chain content.
    if (!immediate && this.authoredArmsRoot) playFirstPersonArmAction(this.authoredArmsRoot, 'equip');
    if (activeModel && this.modelIsGpuReady(activeModel)) {
      for (const [weaponId, model] of this.models) model.visible = weaponId === id;
      this.applyModelMatrixFreeze();
      this.modelLastUsed.set(id, ++this.modelUseCounter);
      this.updateActiveSockets(id);
      if (this.browserRuntime) this.trimBrowserWeaponModels();
    } else if (typeof document !== 'undefined') {
      // Keep the last complete viewmodel mounted while the requested authored
      // model is loading. The completion callback performs the visibility swap
      // atomically and is generation guarded by browserWeaponRequest.
      if (
        this.browserResidentWeaponIds.size > 0
        && (!this.browserResidentWeaponIds.has(id) || !activeModel || !this.modelIsGpuReady(activeModel))
      ) {
        this.unpreparedBrowserSwitches += 1;
        this.lastUnpreparedBrowserSwitch = Object.freeze({
          requested: id,
          previousActive,
          resident: Object.freeze([...this.browserResidentWeaponIds]),
          loaded: Object.freeze([...this.models.keys()]),
          gpuReady: Object.freeze([...this.models.entries()]
            .filter(([, model]) => this.modelIsGpuReady(model))
            .map(([weaponId]) => weaponId)),
        });
      }
      this.ensureBrowserWeapon(id);
    }
    this.configureWeaponFlashlight(id);
  }

  /** Perf (2026-08-29): only the mounted weapon rig may pay per-frame matrix
   * costs. Hidden rigs (hundreds of nodes each) deep-freeze; the active rig
   * unfreezes so its authored animations reach the renderer. */
  private applyModelMatrixFreeze(): void {
    // HF-399: freeze/unfreeze only on a visibility TRANSITION. Both helpers
    // traverse the whole model (and unfreeze forces a full world-matrix
    // refresh), and this runs every frame from update(): measured 2026-09-02
    // at ~5,000 Object3D.traverse calls per frame, 1.5 ms of a 25 ms frame.
    // The invariant is unchanged - whatever is visible is unfrozen - it is
    // just not re-established on models whose state did not move.
    for (const entry of this.models.values()) {
      const frozen = entry.userData.hf399MatrixFrozen === true;
      if (entry.visible && (frozen || entry.userData.hf399MatrixFrozen === undefined)) {
        deepUnfreezeSubtreeMatrices(entry);
        entry.userData.hf399MatrixFrozen = false;
      } else if (!entry.visible && !frozen) {
        deepFreezeSubtreeMatrices(entry);
        entry.userData.hf399MatrixFrozen = true;
      }
    }
  }

  setPresentationVisible(visible: boolean): void {
    if (this.fullscreenPresentationSuppressed) {
      this.fullscreenPresentationSuppressed = false;
    }
    // Retained-structural-lights contract v1 (same rule as
    // setFullscreenPresentationSuppressed): the hidden first-person viewmodel
    // must NOT drive this.root.visible false. The root carries
    // first-person-muzzle-light and first-person-viewmodel-fill, so hiding the
    // root removes both from Three's WebGPU light set, LightsNode's cache key
    // changes, and every material program in the scene is invalidated at once.
    // Each death/respawn cycle then rebuilt hundreds of render pipelines inside
    // combat: probe 2026-09-01 (artifacts/qa/pipeline-compile/
    // before-local-pass81.json) measured 251 in-combat pipeline creations with
    // 99.2% landing inside compositor stalls (7.1x enrichment), and the probe's
    // cache-key diffs name exactly these two lights toggling on every
    // alive:false -> alive:true transition. Keep the lights resident and
    // express "hidden" as the suppressed scale plus zero intensities instead -
    // uniform writes, never a light-set change.
    this.root.visible = true;
    this.root.scale.setScalar(visible
      ? this.unsuppressedViewmodelScale()
      : FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE);
    this.viewmodelFill.intensity = visible
      ? Number(this.viewmodelFill.userData.authoredIntensity ?? 0)
      : 0;
    if (!visible) this.muzzleLight.intensity = 0;
  }

  private restoreArmEvidenceCapture(): void {
    for (const entry of this.armEvidenceRestore) {
      entry.mesh.visible = entry.visible;
      entry.mesh.renderOrder = entry.renderOrder;
      entry.mesh.material = entry.material;
      if (entry.ownershipAttribute) {
        entry.mesh.geometry.setAttribute(VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE, entry.ownershipAttribute);
      } else {
        entry.mesh.geometry.deleteAttribute(VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE);
      }
    }
    this.armEvidenceRestore = [];
    this.armEvidenceCaptureTelemetry = null;
  }

  /**
   * QA-only truthful material-ID pass over the actual shipped skinned arms.
   * The active weapon/knife is deliberately untouched. `background` hides only
   * the arm skins; left/right keep only vertices influenced by that side's
   * authored bones. A screenshot difference therefore cannot be satisfied by
   * the receiver, knife, HUD, world, or the opposite arm.
   */
  setArmEvidenceCapture(mode: ViewmodelArmEvidenceCaptureMode): boolean {
    this.restoreArmEvidenceCapture();
    if (mode === null) return true;
    const arms = this.authoredArmsRoot;
    if (!arms || (mode !== 'background' && mode !== 'left' && mode !== 'right')) return false;
    const selectedSide = mode === 'background' ? null : mode;
    let skinnedMeshCount = 0;
    let eligibleSkinnedMeshCount = 0;
    let selectedVertexCount = 0;
    let oppositeVertexCount = 0;
    let unownedVertexCount = 0;
    let weaponMeshCount = 0;
    let visibleWeaponMeshCount = 0;
    const activeModel = this.mountedModel();
    activeModel?.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      weaponMeshCount += 1;
      if (node.visible) visibleWeaponMeshCount += 1;
    });
    arms.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      skinnedMeshCount += 1;
      const geometry = node.geometry;
      const skinIndex = geometry.getAttribute('skinIndex');
      const skinWeight = geometry.getAttribute('skinWeight');
      const position = geometry.getAttribute('position');
      this.armEvidenceRestore.push({
        mesh: node,
        visible: node.visible,
        renderOrder: node.renderOrder,
        material: node.material,
        ownershipAttribute: geometry.getAttribute(VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE),
      });
      if (selectedSide === null) {
        node.visible = false;
        return;
      }
      if (!skinIndex || !skinWeight || !position
        || skinIndex.itemSize !== 4 || skinWeight.itemSize !== 4
        || skinIndex.count !== position.count || skinWeight.count !== position.count) {
        node.visible = false;
        return;
      }
      eligibleSkinnedMeshCount += 1;
      const ownership = new Float32Array(position.count);
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        let selectedWeight = 0;
        let oppositeWeight = 0;
        for (let slot = 0; slot < 4; slot += 1) {
          const boneIndex = skinIndex.getComponent(vertex, slot);
          const weight = skinWeight.getComponent(vertex, slot);
          const owner = firstPersonArmBoneSide(node.skeleton.bones[boneIndex]?.name ?? '');
          if (owner === selectedSide) selectedWeight += weight;
          else if (owner !== null) oppositeWeight += weight;
        }
        ownership[vertex] = selectedWeight;
        if (selectedWeight >= 0.25) selectedVertexCount += 1;
        else if (oppositeWeight >= 0.25) oppositeVertexCount += 1;
        else unownedVertexCount += 1;
      }
      geometry.setAttribute(VIEWMODEL_ARM_EVIDENCE_ATTRIBUTE, new THREE.Float32BufferAttribute(ownership, 1));
      node.material = this.armEvidenceMaterials[selectedSide];
      node.renderOrder = 10_000;
      node.visible = node.visible && ownership.some((weight) => weight >= 0.25);
    });
    this.armEvidenceCaptureTelemetry = Object.freeze({
      contract: VIEWMODEL_ARM_EVIDENCE_CONTRACT,
      mode,
      selectedSide,
      skinnedMeshCount,
      eligibleSkinnedMeshCount,
      selectedVertexCount,
      oppositeVertexCount,
      unownedVertexCount,
      weaponMeshCount,
      visibleWeaponMeshCount,
      weaponMeshesMutated: 0,
      knifeMutated: false,
      ownershipPassOcclusionPolicy: 'selected-real-arm-xray-weapon-render-retained-v1',
    });
    return selectedSide === null
      ? skinnedMeshCount > 0
      : eligibleSkinnedMeshCount > 0 && selectedVertexCount > 0 && oppositeVertexCount > 0;
  }

  /**
   * Keep the prepared viewmodel render objects and structural lights resident
   * while a full-screen optic or support cockpit owns the sight picture.
   * Removing the root from the render list changes Three's WebGPU light/node
   * graph and forces every active world-support object to rebuild. A near-zero
   * exact-scale draw suppresses the model without changing that vocabulary.
   */
  suppressForFullscreenPresentation(suppressed: boolean): void {
    this.fullscreenPresentationSuppressed = suppressed;
    this.root.visible = true;
    this.root.scale.setScalar(suppressed
      ? FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE
      : this.unsuppressedViewmodelScale());
    this.viewmodelFill.intensity = suppressed
      ? 0
      : Number(this.viewmodelFill.userData.authoredIntensity ?? 0);
    if (suppressed) this.muzzleLight.intensity = 0;
  }

  suppressForSniperScope(suppressed: boolean): void {
    this.suppressForFullscreenPresentation(suppressed);
  }

  private unsuppressedViewmodelScale(): number {
    return THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend)
      * viewmodelScreenScale(this.camera)
      * this.contactResponse.scale;
  }

  /**
   * Places the retained first-person presentation at the exact clean match-start
   * pose without advancing clocks, actions, effect pools or gameplay state.
   * Admission uses this while normal player simulation is deliberately blocked
   * behind the prerecorded deployment surface.
   */
  snapToMatchStartRestPose(surfaceRetreat = 0): void {
    this.recoil = 0;
    this.reloadLastProgress = 0;
    this.equipElapsedSeconds = VIEWMODEL_EQUIP_SETTLED_SECONDS;
    this.landAgeSeconds = VIEWMODEL_LAND_DIP_SETTLE_SECONDS;
    this.landAmplitude = 0;
    this.lastLandingImpulse = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.meleeStart = 0;
    this.meleePresentationFrames = 0;
    this.grenadeStart = 0;
    this.meleePresentationActive = false;
    this.meleePresentationMode = 'inactive';
    this.shotStarted = -10_000;
    this.presentedFireCycle = fireCycleAt(this.active, 10_000, 0);
    this.pendingScattergunShell = false;
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.weaponHeat = 0;
    this.shotsPresented = 0;
    this.surfaceRetreat = surfaceRetreat;
    this.surfaceLift = 0;
    this.prone = false;
    this.contactResponse = viewmodelContactResponse(this.active, surfaceRetreat, 0, false, 0);
    resetMinigunSpool(this.minigunSpool);

    this.muzzleLight.intensity = 0;
    this.muzzleFlash.visible = false;
    for (const casing of this.casings) {
      casing.active = false;
      casing.life = 0;
      casing.frames = 0;
      casing.mesh.visible = false;
    }
    for (let slot = 0; slot < this.smokes.length; slot += 1) {
      const smoke = this.smokes[slot];
      const offset = slot * 3;
      smoke.active = false;
      smoke.life = 0;
      this.smokePositions[offset] = 0;
      this.smokePositions[offset + 1] = -10_000;
      this.smokePositions[offset + 2] = 0;
      this.smokeColors[offset] = 0;
      this.smokeColors[offset + 1] = 0;
      this.smokeColors[offset + 2] = 0;
    }
    this.smokePoints.visible = false;
    (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // HF-397: the owner finds the full wall pullback too strong; the APPLIED
    // retreat is halved. Anti-clipping stays owned by the surface clip planes
    // (viewmodel-surface-clip), and the near-plane framing contract only gets
    // safer as the weapon moves away from the camera. Telemetry keeps reporting
    // the raw probed surfaceRetreat, so the prone-contact spec's >0.25 telemetry
    // floor is untouched.
    const appliedWallRetreat = Math.min(surfaceRetreat, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT)
      * VIEWMODEL_WALL_PULLBACK_SCALE;
    this.root.position.set(
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y + this.contactResponse.additionalLiftMeters + this.contactResponse.proneFloorGuardMeters
        - this.contactResponse.additionalDropMeters,
      // The wall retreat is capped at the near-plane-safe distance: pushing
      // the weapon further back would drive the arms/stock through the near
      // plane and fail the prone framing contract.
      HIP_VIEWMODEL_POSITION.z + appliedWallRetreat - VIEWMODEL_NEAR_PLANE_CLEARANCE
        - authoredNearPlaneContactRetreat(this.active, appliedWallRetreat),
    );
    this.root.rotation.set(
      this.contactResponse.pitchRadians,
      weaponHipYaw(this.active) + this.contactResponse.yawRadians,
      this.contactResponse.rollRadians,
    );
    this.root.scale.setScalar(HIP_VIEWMODEL_SCALE * this.contactResponse.scale);
    this.meleeRig.visible = false;
    this.meleeKnife.visible = false;
    this.passiveKnife.visible = false;
    this.restoreRiggedArmBindPose();
    if (this.authoredArmsRoot) resetFirstPersonArmAnimations(this.authoredArmsRoot);
    resetFirstPersonArmFingers(this.riggedFingerBones);

    const activeModel = this.mountedModel();
    if (activeModel) {
      resetImportedWeaponAnimations(activeModel);
      activeModel.visible = true;
    }
    if (this.authoredMeleeKnife) resetImportedWeaponAnimations(this.authoredMeleeKnife);
    const reloadPose = reloadPoseAt(this.active, 0);
    const bolt = this.cachedNamedNode(activeModel, 'bolt-or-slide');
    if (bolt) bolt.position.z = Number(bolt.userData.restZ ?? 0);
    const pump = this.cachedNamedNode(activeModel, 'pump');
    if (pump) pump.position.z = Number(pump.userData.restZ ?? -0.48);
    const magazineName = this.active === 'carbine'
      ? 'curved-magazine'
      : this.active === 'lmg'
        ? 'lmg-box-magazine'
        : this.active === 'pistol' || this.active === 'machine-pistol' || this.active === 'magnum'
          ? 'pistol-magazine'
          : 'straight-magazine';
    const magazine = this.cachedNamedNode(activeModel, magazineName);
    if (magazine?.userData.restY !== undefined) {
      magazine.position.set(
        Number(magazine.userData.restX),
        Number(magazine.userData.restY),
        Number(magazine.userData.restZ),
      );
      magazine.rotation.z = Number(magazine.userData.restRotationZ);
    }
    const reloadShell = this.cachedNamedNode(activeModel, 'reload-shell');
    if (reloadShell) reloadShell.visible = false;
    const arms = this.cachedNamedNode(this.root, 'first-person-arms');
    if (arms) {
      arms.visible = true;
      arms.position.set(0, -0.075, 0);
      arms.scale.setScalar(1);
      arms.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          material.transparent = false;
          material.opacity = 1;
          material.depthWrite = true;
        }
      });
      this.solveArms(arms, activeModel, reloadPose);
    }
    this.poseRiggedFingers(reloadPose, false);
    this.solveRiggedArms(activeModel, reloadPose);
    this.actionContract = characterActionContract({
      weapon: this.active,
      aimBlend: 0,
      sprintBlend: 0,
      reloadProgress: null,
      meleeProgress: null,
    });
    // HF-399: one consistent refresh of the mounted rig per frame, through
    // updateMatrixWorld so the deep-frozen hidden models are skipped (the
    // updateWorldMatrix(_, true) child recursion bypasses the freeze override
    // and re-multiplied every parked weapon's matrices every frame).
    this.root.updateWorldMatrix(true, false);
    this.root.updateMatrixWorld(true);
  }

  private configureWeaponFlashlight(id: WeaponId): void {
    const flashlight = WEAPONS[id].flashlight;
    const flashlightActive = flashlight !== null && !this.flattenMaterials;
    // Keep one quality spotlight in the renderer topology from bootstrap onward.
    // Toggling the light's visibility when the flashlight pistol was equipped
    // forced a new WebGPU lighting/shadow pipeline during live play and could
    // freeze the presented frame for several seconds. Zero intensity preserves
    // the dark state without changing shader topology.
    this.weaponFlashlight.visible = !this.flattenMaterials;
    this.weaponFlashlight.intensity = flashlight?.intensity ?? 0;
    this.weaponFlashlight.distance = flashlight?.rangeM ?? 0;
    this.weaponFlashlight.angle = flashlight?.coneAngleRadians ?? 0.42;
    if (flashlight) this.weaponFlashlight.color.setHex(flashlight.colorHex);
    // Keep the compiled light/shadow topology resident, but do not redraw a
    // zero-intensity 512px shadow map for every non-flashlight weapon.
    this.weaponFlashlight.shadow.autoUpdate = flashlightActive;
    this.weaponFlashlight.shadow.needsUpdate = flashlightActive;
    this.weaponFlashlight.userData.shadowBudgetActive = flashlightActive;
  }

  private ejectCasing(shell: boolean): void {
    const casing = this.casings[this.casingCursor++ % this.casings.length];
    casing.mesh.geometry = shell ? this.shellGeometry : this.brassGeometry;
    casing.mesh.material = shell ? this.shellMaterial : this.brassMaterial;
    const activeModel = this.mountedModel();
    const ejectPosition = activeModel ? this.socketLocalPosition(activeModel, 'eject-socket') : null;
    casing.mesh.position.copy(ejectPosition ?? new THREE.Vector3(0.12, 0.04, -0.48));
    casing.mesh.rotation.set(presentationRandom() * 0.4, 0, Math.PI / 2);
    casing.mesh.visible = true;
    casing.velocity.set(
      shell ? 0.72 : 0.95 + presentationRandom() * 0.25,
      shell ? 0.55 : 0.75 + presentationRandom() * 0.2,
      shell ? 0.16 : 0.1,
    );
    casing.life = shell ? 0.62 : 0.42;
    casing.frames = 0;
    casing.active = true;
  }

  fire(amount: number): void {
    // A legal shot immediately owns the presentation. This does not change the
    // melee cooldown/range result; it only prevents a stale knife arc from
    // hiding a shot which authority already accepted.
    if (this.meleeStart > 0 && this.debugMeleeProgress === null) {
      this.meleeStart = 0;
      this.meleePresentationFrames = 0;
      this.meleeRig.visible = false;
      this.meleeKnife.visible = false;
      this.meleePresentationActive = false;
      this.meleePresentationMode = 'inactive';
      this.restoreRiggedArmBindPose();
      const arms = this.root.getObjectByName('first-person-arms');
      if (arms) arms.visible = true;
      const model = this.mountedModel();
      if (model) {
        model.visible = true;
        deepUnfreezeSubtreeMatrices(model);
      }
    }
    const activeModel = this.mountedModel();
    if (activeModel) fireImportedWeapon(activeModel);
    if (this.authoredArmsRoot) playFirstPersonArmAction(this.authoredArmsRoot, 'fire');
    const profile = weaponFamilyPresentation(this.active);
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, true, 0, this.active);
    this.shotsPresented += 1;
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.shotStarted = performance.now();
    this.muzzleLight.intensity = this.flattenMaterials
      ? 0
      : viewmodelBodyFitLightIntensity(4.8 * WEAPONS[this.active].muzzleFlashScale);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(profile.flashScale);
    this.muzzleFlash.rotation.z = (this.shotsPresented * 2.399963229728653) % Math.PI;

    const activeModelForSmoke = this.mountedModel();
    const muzzlePosition = activeModelForSmoke ? this.socketLocalPosition(activeModelForSmoke, 'muzzle-socket') : null;
    const smokeCount = Math.min(this.smokes.length, profile.smokeBase + (this.weaponHeat > 0.56 ? 1 : 0));
    const cycle = fireCycleAt(this.active, 0, this.weaponHeat);
    for (let index = 0; index < smokeCount; index += 1) {
      const slot = this.smokeCursor++ % this.smokes.length;
      const smoke = this.smokes[slot];
      const offset = slot * 3;
      const muzzle = muzzlePosition ?? new THREE.Vector3(0, 0.08, -1.15);
      this.smokePositions[offset] = muzzle.x + (presentationRandom() - 0.5) * 0.025;
      this.smokePositions[offset + 1] = muzzle.y + (presentationRandom() - 0.5) * 0.02;
      this.smokePositions[offset + 2] = muzzle.z - 0.05 - index * 0.035;
      smoke.velocity.set(
        (presentationRandom() - 0.5) * 0.055 * cycle.smokeScale,
        (0.1 + presentationRandom() * 0.06) * cycle.smokeScale,
        (-0.11 - presentationRandom() * 0.08) * cycle.smokeScale,
      );
      smoke.maxLife = (this.active === 'scattergun' ? 0.38 : 0.2 + this.weaponHeat * 0.12);
      smoke.life = smoke.maxLife;
      smoke.active = true;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0.62;
    }
    this.smokePoints.visible = true;
    (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // Rifle and pistol actions eject with the accepted shot. Doing this at the
    // action boundary keeps the pooled casing visible even when a software-
    // rendered frame takes longer than the authored bolt marker. Scattergun
    // shells remain tied to the delayed pump cycle below.
    if (this.active === 'scattergun') this.pendingScattergunShell = true;
    else this.ejectCasing(false);
  }

  reload(): void {
    const activeModel = this.mountedModel();
    if (activeModel) reloadImportedWeapon(activeModel);
    if (this.authoredArmsRoot) playFirstPersonArmAction(this.authoredArmsRoot, 'reload');
    this.reloadLastProgress = 0;
  }

  cancelReload(): void {
    this.reloadLastProgress = 0;
  }

  melee(): void {
    this.meleeStart = performance.now();
    this.meleePresentationFrames = 0;
    const authoredReady = this.browserRuntime
      && this.riggedArmRigs.length === 2
      && this.authoredMeleeKnife !== null
      && this.authoredMeleeSocket !== null;
    const leftRig = this.riggedArmRigs.find((rig) => rig.side === 'left');
    // HF-341: only reuse the immediately preceding support pose when it is a
    // real near-bind pose. The removed handgun stow teleported this shoulder
    // +40 m; replaying such a capture played the whole 520 ms stab one-armed.
    // Without a reusable capture, poseRiggedMeleeArms solves the authored
    // left-arm guard instead.
    const supportPoseReusable = leftRig !== undefined
      && meleeSupportPoseReusable(leftRig.shoulder.position, leftRig.bindShoulderPosition);
    this.riggedMeleeSupportPose = authoredReady && leftRig && supportPoseReusable ? Object.freeze({
      shoulderPosition: leftRig.shoulder.position.clone(),
      shoulderQuaternion: leftRig.shoulder.quaternion.clone(),
      shoulderScale: leftRig.shoulder.scale.clone(),
      elbowPosition: leftRig.elbow.position.clone(),
      elbowQuaternion: leftRig.elbow.quaternion.clone(),
      elbowScale: leftRig.elbow.scale.clone(),
      wristPosition: leftRig.wrist.position.clone(),
      wristQuaternion: leftRig.wrist.quaternion.clone(),
      wristScale: leftRig.wrist.scale.clone(),
    }) : null;
    this.meleeRig.visible = !this.browserRuntime;
    this.meleeKnife.visible = !this.browserRuntime || authoredReady;
    this.meleePresentationActive = true;
    this.meleePresentationMode = authoredReady
      ? 'authored-rigged-arms'
      : this.browserRuntime ? 'inactive' : 'headless-procedural-fallback';
    if (this.browserRuntime && !authoredReady) {
      this.root.userData.pass65MeleePresentationError = 'authored arms or wrist-mounted knife unavailable';
    }
    meleeImportedWeapon(this.authoredMeleeKnife ?? this.meleeKnife);
    if (this.authoredArmsRoot) playFirstPersonArmAction(this.authoredArmsRoot, 'melee');
    const arms = this.cachedNamedNode(this.root, 'first-person-arms');
    if (arms) arms.visible = this.browserRuntime;
    const activeModel = this.mountedModel();
    if (activeModel) activeModel.visible = false;
    this.actionContract = characterActionContract({
      weapon: this.active,
      aimBlend: this.adsBlend,
      sprintBlend: this.sprintBlend,
      reloadProgress: null,
      meleeProgress: 0,
    });
  }

  setMeleeCaptureProgress(progress: number | null): void {
    this.debugMeleeProgress = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 0.999);
  }

  setFireCaptureAgeMs(ageMs: number | null): void {
    this.debugFireAgeMs = ageMs === null ? null : THREE.MathUtils.clamp(ageMs, 0, 1_000);
  }

  throwGrenade(): void {
    this.grenadeStart = performance.now();
  }

  setGrenadeCaptureProgress(progress: number | null): void {
    this.debugGrenadeProgress = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 0.999);
  }

  grenadeActionTelemetry(now = performance.now()): Readonly<{
    startedAt: number;
    elapsedMs: number | null;
    progress: number;
    active: boolean;
    arc: number;
    capturePinned: boolean;
  }> {
    const elapsedMs = this.grenadeStart > 0 ? Math.max(0, now - this.grenadeStart) : null;
    const progress = this.debugGrenadeProgress
      ?? (elapsedMs === null ? 1 : THREE.MathUtils.clamp(elapsedMs / 620, 0, 1));
    const active = elapsedMs !== null && progress < 1;
    return Object.freeze({
      startedAt: this.grenadeStart,
      elapsedMs,
      progress,
      active,
      arc: active ? Math.sin(progress * Math.PI) : 0,
      capturePinned: this.debugGrenadeProgress !== null,
    });
  }

  addMouseDelta(x: number, y: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX + x * 0.00008, -0.025, 0.025);
    this.swayY = THREE.MathUtils.clamp(this.swayY + y * 0.00006, -0.02, 0.02);
  }

  muzzleWorldPosition(target = new THREE.Vector3()): THREE.Vector3 | null {
    const socket = this.cachedNamedNode(this.mountedModel(), 'muzzle-socket');
    return socket ? socket.getWorldPosition(target) : null;
  }

  /**
   * HF-410 REPAIR - WHERE A WORLD-SPACE EFFECT MUST BE BORN, NOW THAT THE RIG
   * IS NOT WHERE IT LOOKS LIKE IT IS.
   *
   * `muzzleWorldPosition` is the truth about the RIG: the socket's real world
   * position. Under the body fit that is roughly 0.25 m from the eye, and world
   * systems that consume it are not measuring a viewmodel - they are measuring
   * the world. `PARTICLE_READABILITY.nearCullM` is a hard 0.35 m "not drawn at
   * all, in any family, at any opacity" (src/particles/combat-readability.ts),
   * so every particle emitted at the fitted socket is born INSIDE the near-lens
   * cull and silently never renders. Before the fit the socket sat 0.96-1.80 m
   * out and cleared it comfortably. HF-371 powder smoke and the flamethrower
   * stream origin both feed off this point.
   *
   * The correct anchor is the point the muzzle would occupy without the fit,
   * which is exact and not a fudge: the fit is a uniform scale k about the eye,
   * so undoing it is `eye + (socket - eye) / k`. That point lies on the SAME
   * ray from the eye, so it projects to the same pixel - the effect still
   * starts at the muzzle on screen - while sitting at the world distance the
   * effect systems were tuned against, which is where it sat when this build
   * shipped. The rig itself does not move.
   *
   * Do NOT solve this by lowering nearCullM: that guard is a combat-readability
   * contract about the player's view of the fight, not a viewmodel constant.
   */
  muzzleEffectWorldPosition(target = new THREE.Vector3()): THREE.Vector3 | null {
    const socket = this.muzzleWorldPosition(target);
    if (!socket) return null;
    const eye = this.camera.getWorldPosition(this.muzzleEffectScratch);
    return socket.sub(eye).divideScalar(VIEWMODEL_BODY_FIT_SCALE).add(eye);
  }

  private readonly muzzleEffectScratch = new THREE.Vector3();

  /**
   * HF-399 RESIDUAL (assigned to this lane by the brief addendum, 17:10) -
   * STOP RE-SEARCHING THE SAME SCENE FOR THE SAME FOUR SOCKETS EVERY FRAME.
   *
   * `Object3D.getObjectByName` is a full depth-first traversal of the subtree.
   * `solveRiggedArms` ran one per arm per frame for 'grip-socket-r' /
   * 'support-socket-l', another for 'muzzle-socket' per arm, and a fourth for
   * 'reload-socket-l' whenever a reload is blending; `muzzleWorldPosition` runs
   * one more per shot-visual. Lane A's census read ~10,000 name/property
   * searches per frame on a 10,275-node scene, with `solveRiggedArms` the
   * dominant caller, inside a `WeaponPresentation.update` that is ~22% of the
   * frame. None of those searches can return a different node between frames
   * unless the mounted model changes.
   *
   * WHY THIS CANNOT GO STALE, which is the only thing that matters here. The
   * cache is keyed on the MODEL OBJECT itself, so a different weapon (or a
   * re-imported GLB) is a different key with an empty cache - no invalidation
   * call to forget. Within one model, a hit is returned only after walking the
   * cached node's parent chain back to that model, which is O(depth of the
   * socket) - about five links - instead of O(nodes). A socket that has been
   * detached, re-parented or swapped by an attachment rebuild therefore fails
   * that check and is re-resolved on the spot.
   *
   * MISSES ARE NOT CACHED, on purpose. A negative result would have to be
   * invalidated when an attachment mounts a socket later in the model's life,
   * and a wrong `null` here is a missing hand or a missing muzzle. The weapons
   * that legitimately lack a socket pay the old traversal; every rig that has
   * one pays it once.
   */
  private readonly socketCache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>();

  private cachedNamedNode(model: THREE.Object3D | undefined, name: string): THREE.Object3D | undefined {
    if (!model) return undefined;
    let cache = this.socketCache.get(model);
    if (!cache) {
      cache = new Map();
      this.socketCache.set(model, cache);
    }
    const cached = cache.get(name);
    if (cached) {
      for (let node: THREE.Object3D | null = cached; node; node = node.parent) {
        if (node === model) return cached;
      }
      cache.delete(name);
    }
    const resolved = model.getObjectByName(name);
    if (resolved) cache.set(name, resolved);
    return resolved;
  }

  adsProgress(): number {
    return this.adsBlend;
  }

  /**
   * HF-343: typed obstruction/high-ready fire admission derived from the same
   * per-frame contact response that raises the weapon. Presentation applies
   * nothing itself — this is the seam gameplay's tryFire gate consumes; the
   * authoritative shot ray and hit timing never pass through here. Hosts that
   * still hold the raw forward-probe distance should prefer
   * viewmodelFireAdmissionFromResponse() with that distance for the exact
   * full-stow check.
   */
  fireAdmission(): ViewmodelFireAdmission {
    return viewmodelFireAdmissionFromResponse(this.active, this.contactResponse);
  }

  minigunSpoolFraction(): number {
    return this.minigunSpool.fraction;
  }

  minigunSpoolPhase(): MinigunSpoolPhase {
    return this.minigunSpool.phase;
  }

  private sightReference(model: THREE.Object3D | undefined): THREE.Object3D | undefined {
    const sightNames = this.active === 'carbine' || this.active === 'm4a1' || this.active === 'ak-47'
      ? ['optic-reticle']
      : this.active === 'sniper'
        ? ['sniper-scope']
        : this.active === 'railgun'
          ? ['railgun-thermal-scope', 'sniper-scope']
          : this.active === 'm14-ebr'
            ? ['m14-thermal-optic', 'sniper-scope']
            : this.active === 'lmg' || this.active === 'minigun' || this.active === 'flamethrower'
              ? ['lmg-aperture']
              : this.active === 'smg' || this.active === 'mini-uzi'
                ? ['smg-aperture']
                : this.active === 'mp5'
                  ? ['mp5-diode-sight', 'smg-aperture']
                  : this.active === 'scattergun' || this.active === 'slug-shotgun'
                    ? ['ghost-ring']
                    : this.active === 'flare-gun'
                      ? ['flare-gun-rear-sight', 'pistol-rear-sight']
                      : ['pistol-rear-sight'];
    // Pass 65 authored GLBs expose a canonical socket contract. Cosmetic mesh
    // names are retained only as a fallback for the procedural/headless models.
    // HF-405: a weapon that presents a compact optic aims through its OPTIC
    // socket, not through the iron rear sight it also carries. The crossbow
    // authors both; centring the irons left the glass a couple of pixels off
    // the aim point it is supposed to own.
    return (this.active === 'carbine' || adsSightProfile(this.active).marker === 'compact-optic'
      ? model?.getObjectByName('optic-socket') ?? model?.getObjectByName('optic-reticle')
      : model?.getObjectByName('rear-sight-socket'))
      ?? model?.getObjectByName('rear-sight-socket')
      ?? sightNames.map((name) => model?.getObjectByName(name)).find((sight) => sight !== undefined);
  }

  /**
   * The authored optic assembly for the mounted model, or undefined when the
   * weapon does not present a compact optic. Cached per model: the traversal
   * and the pivot are fixed for the life of the mounted instance.
   */
  private compactOpticAssembly(model: THREE.Object3D | undefined): THREE.Object3D | undefined {
    if (!model || adsSightProfile(this.active).marker !== 'compact-optic') return undefined;
    const cached = model.userData.compactOpticAssembly as THREE.Object3D | null | undefined;
    if (cached !== undefined) return cached ?? undefined;
    const assembly = authoredOpticAssembly(model);
    model.userData.compactOpticAssembly = assembly;
    if (!assembly) return undefined;
    assembly.updateWorldMatrix(true, true);
    const socket = model.getObjectByName('optic-socket');
    const pivot = socket
      ? assembly.worldToLocal(socket.getWorldPosition(new THREE.Vector3()))
      : new THREE.Box3().setFromObject(assembly).getCenter(new THREE.Vector3()).applyMatrix4(
        assembly.matrixWorld.clone().invert(),
      );
    assembly.userData.compactOpticPivot = pivot;
    assembly.userData.compactOpticBasePosition = assembly.position.clone();
    return assembly;
  }

  /** Grows the authored optic to eye scale as the aim blend completes. See COMPACT_OPTIC_ADS_EYE_SCALE. */
  private applyCompactOpticAdsPresentation(model: THREE.Object3D | undefined): void {
    const assembly = this.compactOpticAssembly(model);
    if (!assembly) return;
    const pivot = assembly.userData.compactOpticPivot as THREE.Vector3;
    const base = assembly.userData.compactOpticBasePosition as THREE.Vector3;
    const scale = 1 + (COMPACT_OPTIC_ADS_EYE_SCALE - 1) * this.adsBlend;
    // p' = base + q(1 - s) keeps the authored pivot exactly where it was, so
    // the optic grows off the rail rather than sliding along it.
    assembly.scale.setScalar(scale);
    assembly.position.set(
      base.x + pivot.x * (1 - scale),
      base.y + pivot.y * (1 - scale),
      base.z + pivot.z * (1 - scale),
    );
    assembly.updateWorldMatrix(false, true);
  }

  private centerSightReference(model: THREE.Object3D | undefined): void {
    // The alignment previously only ramped in over the last quarter of the aim
    // blend, so the sight snapped onto the crosshair at the very end and every
    // weapon read as roughly-aimed. Engaging earlier and reaching a full lock
    // gives every gun a precise, settled sight picture for the whole hold.
    const lock = THREE.MathUtils.smoothstep(this.adsBlend, 0.32, 0.88);
    if (lock <= 0) return;
    const sight = this.sightReference(model);
    if (!sight) return;
    this.camera.updateMatrixWorld(true);
    this.root.updateWorldMatrix(true, true);
    const cameraLocal = this.camera.worldToLocal(sight.getWorldPosition(new THREE.Vector3()));
    this.root.position.x -= cameraLocal.x * lock;
    this.root.position.y -= cameraLocal.y * lock;
    this.root.updateWorldMatrix(true, true);
  }

  presentationState() {
    const model = this.mountedModel();
    const requiredDetails = weaponFamilyPresentation(this.active).requiredDetails;
    const sight = this.sightReference(model);
    this.camera.updateMatrixWorld(true);
    sight?.updateWorldMatrix(true, false);
    const projected = sight?.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const arms = this.cachedNamedNode(this.root, 'first-person-arms');
    const isAuthoredArmMesh = (candidate: THREE.Object3D): candidate is THREE.Mesh => {
      if (!(candidate instanceof THREE.Mesh)) return false;
      let ancestor: THREE.Object3D | null = candidate;
      while (ancestor && ancestor !== arms) {
        if (ancestor === this.meleeKnife) return false;
        ancestor = ancestor.parent;
      }
      return ancestor === arms;
    };
    let modelVisibleMeshCount = 0;
    model?.traverse((child) => { if (child.visible && child instanceof THREE.Mesh) modelVisibleMeshCount += 1; });
    let armMeshCount = 0;
    let armMaterialCount = 0;
    let armTransparentMaterialCount = 0;
    let armNonOpaqueMaterialCount = 0;
    let armDepthWriteDisabledMaterialCount = 0;
    arms?.traverse((child) => {
      if (!isAuthoredArmMesh(child)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        armMaterialCount += 1;
        if (material.transparent) armTransparentMaterialCount += 1;
        if (material.opacity < 1) armNonOpaqueMaterialCount += 1;
        if (!material.depthWrite) armDepthWriteDisabledMaterialCount += 1;
      }
    });
    if (arms?.visible) arms.traverse((child) => { if (child.visible && isAuthoredArmMesh(child)) armMeshCount += 1; });
    if (this.meleeRig.visible) this.meleeRig.traverse((child) => {
      if (child.visible && child instanceof THREE.Mesh && (child.name.includes('forearm') || child.name.includes('glove'))) armMeshCount += 1;
    });
    const armBox = arms ? new THREE.Box3().setFromObject(arms) : null;
    const armCenter = armBox && !armBox.isEmpty() ? armBox.getCenter(new THREE.Vector3()) : null;
    const armSize = armBox && !armBox.isEmpty() ? armBox.getSize(new THREE.Vector3()) : null;
    const armProjected = armCenter?.clone().project(this.camera) ?? null;
    const visibleWorldBounds = (root: THREE.Object3D | undefined): Readonly<{
      min: readonly number[];
      max: readonly number[];
    }> | null => {
      if (!root?.visible) return null;
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().makeEmpty();
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.visible) return;
        if (child instanceof THREE.SkinnedMesh) {
          child.computeBoundingBox();
          if (child.boundingBox) bounds.union(child.boundingBox.clone().applyMatrix4(child.matrixWorld));
          return;
        }
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
      });
      return bounds.isEmpty() ? null : Object.freeze({
        min: Object.freeze(bounds.min.toArray()),
        max: Object.freeze(bounds.max.toArray()),
      });
    };
    const armWorldBounds = visibleWorldBounds(arms);
    const weaponWorldBounds = visibleWorldBounds(model);
    const importedModel = importedWeaponTelemetry(model);
    const detailsReady = importedModel
      ? importedModel.socketContractReady && importedModel.meshes > 0
        && (importedModel.sightForwardDot ?? -1) > 0.995
        && (importedModel.muzzleForwardDot ?? -1) > 0.85
      : requiredDetails.every((name) => model?.getObjectByName(name) !== undefined);
    const opticMaterialSemantics = model ? capturePass70FirstPersonMaterialState(model) : {
      contract: PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
      materialCount: 0,
      markedMaterialCount: 0,
      opticWindowCount: 0,
      opaqueBodyCount: 0,
      presentationDetailCount: 0,
      invalidOpticWindowCount: 0,
      invalidOpaqueBodyCount: 0,
      opticWindows: [],
    };
    const opaqueSightWindowHits = (() => {
      const ndcRadius = 0.02;
      if (!model || (this.active !== 'carbine' && this.active !== 'mini-uzi')) {
        return {
          contract: 'camera-ndc-authored-sight-aperture-rays-v3',
          acceptance: 'not-applicable',
          accepted: true,
          rayCount: 9,
          ndcRadius,
          centerHits: 0,
          blockedRays: 0,
          maximumHits: 0,
          meshes: [] as string[],
          samples: [] as ReadonlyArray<unknown>,
        };
      }
      model.updateWorldMatrix(true, true);
      const offsets = [
        ['center', 0, 0],
        ['left', -ndcRadius, 0], ['right', ndcRadius, 0], ['lower', 0, -ndcRadius], ['upper', 0, ndcRadius],
        ['lower-left', -0.014, -0.014], ['upper-left', -0.014, 0.014],
        ['lower-right', 0.014, -0.014], ['upper-right', 0.014, 0.014],
      ] as const;
      const raycaster = new THREE.Raycaster();
      raycaster.layers.mask = this.camera.layers.mask;
      // HF-410 REPAIR: the fitted rig spans roughly 0.02-0.32 m from the eye,
      // inside the 0.08 m plane this camera carried before the fit. The probe
      // uses the plane the rig is really drawn with now,
      // FIRST_PERSON_CAMERA_NEAR_METERS, or it would report every aperture as
      // empty. Not the overlay's 0.002 m: that submission does not run on the
      // shipped route, and the nearest measured weapon vertex in any graded
      // pose is 0.0921 m, so the honest larger plane changes no reading.
      raycaster.near = FIRST_PERSON_CAMERA_NEAR_METERS;
      raycaster.far = this.camera instanceof THREE.PerspectiveCamera ? this.camera.far : Number.POSITIVE_INFINITY;
      const samples = offsets.map(([label, x, y]) => {
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
        const hits = raycaster.intersectObject(model, true).filter((hit) => {
          if (!(hit.object instanceof THREE.Mesh)) return false;
          let ancestor: THREE.Object3D | null = hit.object;
          while (ancestor && ancestor !== model) {
            if (!ancestor.visible) return false;
            ancestor = ancestor.parent;
          }
          if (ancestor !== model || !model.visible) return false;
          const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
          const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
          return material?.visible === true && material.colorWrite !== false && material.opacity >= 0.35;
        });
        return {
          label,
          ndc: [x, y] as const,
          count: hits.length,
          hits: hits.map((hit) => {
            const mesh = hit.object as THREE.Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
            return { mesh: mesh.name, material: material?.name ?? '', distance: hit.distance };
          }),
        };
      });
      const acceptance = this.active === 'mini-uzi' ? 'centre-ray-clear' : 'nine-ray-window-clear';
      const blockedRays = samples.filter((sample) => sample.count > 0).length;
      const centerHits = samples[0].count;
      return {
        contract: 'camera-ndc-authored-sight-aperture-rays-v3',
        acceptance,
        accepted: acceptance === 'centre-ray-clear' ? centerHits === 0 : blockedRays === 0,
        rayCount: samples.length,
        ndcRadius,
        centerHits,
        blockedRays,
        maximumHits: samples.reduce((maximum, sample) => Math.max(maximum, sample.count), 0),
        meshes: [...new Set(samples.flatMap((sample) => sample.hits.map((hit) => hit.mesh)))],
        samples,
      };
    })();
    return {
      weapon: this.active,
      heat: this.weaponHeat,
      shotsPresented: this.shotsPresented,
      fireCycle: this.presentedFireCycle,
      muzzleFlashMeshCount: (() => {
        let count = 0;
        this.muzzleFlash.traverse((node) => { if (node instanceof THREE.Mesh) count += 1; });
        return count;
      })(),
      activeCasings: this.casings.filter((casing) => casing.active).length,
      activeSmoke: this.smokes.reduce((count, smoke) => count + Number(smoke.active), 0),
      detailsReady,
      modelKind: model?.userData.projectOriginalWeapon === true
        ? 'project-original-blender'
        : importedModel ? 'licensed-imported' : 'original-authored',
      firstPersonSource: model?.userData.firstPersonSource ?? 'unknown',
      weaponModelId: model?.userData.weaponModelId ?? null,
      weaponFinishId: model?.userData.weaponFinishId ?? null,
      firstPersonRearStockTrim: model?.userData.firstPersonRearStockTrim ?? null,
      firstPersonRearOccluderTrim: model?.userData.firstPersonRearOccluderTrim ?? null,
      firstPersonAdsSightBore: model?.userData.firstPersonAdsSightBore ?? null,
      opticMaterialSemantics: {
        ...opticMaterialSemantics,
        clearWindowOpacity: PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
        sightPictureRetreat: this.adsBlend * (FIRST_PERSON_ADS_SIGHT_PICTURE_RETREAT[this.active] ?? 0),
      },
      adsOpaqueSightWindow: opaqueSightWindowHits,
      flamethrowerHeldFireClearance: {
        fastPathActive: this.flamethrowerHeldFireClearanceFastPathActive,
        entryTransitions: this.flamethrowerHeldFireClearanceEntryTransitions,
        exitTransitions: this.flamethrowerHeldFireClearanceExitTransitions,
        skippedFrames: this.flamethrowerHeldFireClearanceSkippedFrames,
        prewarmChecks: this.flamethrowerHeldFireClearancePrewarmChecks,
      },
      nearPlaneClearance: {
        contract: FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT_CONTRACT,
        cameraNear: this.camera instanceof THREE.PerspectiveCamera ? this.camera.near : 0.08,
        requiredMargin: 0.02,
        baseRetreat: VIEWMODEL_NEAR_PLANE_CLEARANCE,
        maximumSurfaceRetreat: VIEWMODEL_NEAR_PLANE_SAFE_RETREAT,
        cachedRetreat: FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT[this.active],
        blendedRetreat: authoredNearPlaneContactRetreat(
          this.active,
          Math.min(this.surfaceRetreat, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT),
        ),
      },
      fullscreenSuppression: {
        contract: FULLSCREEN_PRESENTATION_SUPPRESSION_CONTRACT,
        active: this.fullscreenPresentationSuppressed,
        suppressedScale: FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE,
        rootVisible: this.root.visible,
        rootScale: this.root.scale.x,
        structuralLightCount: [this.viewmodelFill, this.muzzleLight]
          .filter((light) => light.parent === this.root).length,
        structuralLights: [
          {
            name: this.viewmodelFill.name,
            intensityContract: 'zero-when-suppressed',
            attachedToRoot: this.viewmodelFill.parent === this.root,
            visible: this.viewmodelFill.visible,
            intensity: this.viewmodelFill.intensity,
          },
          {
            name: this.muzzleLight.name,
            intensityContract: 'transient-fire-decay',
            attachedToRoot: this.muzzleLight.parent === this.root,
            visible: this.muzzleLight.visible,
            intensity: this.muzzleLight.intensity,
          },
        ],
      },
      modelVisibleMeshCount,
      attachedWeaponBatchStats: model?.userData.attachedWeaponBatchStats ?? null,
      adsProgress: this.adsBlend,
      sightReferenceName: sight?.name ?? null,
      // HF-405 observability: whether the authored optic actually has an open
      // bore and what scale it is presenting at. Both were unmeasurable while
      // the sight picture was a capped housing.
      compactOptic: (() => {
        const assembly = this.compactOpticAssembly(model);
        if (!assembly) return null;
        return {
          contract: COMPACT_OPTIC_ADS_PRESENTATION_CONTRACT,
          assembly: assembly.name,
          eyeScale: assembly.scale.x,
          maximumEyeScale: COMPACT_OPTIC_ADS_EYE_SCALE,
          bore: assembly.userData.hf405CompactOpticBore ?? null,
        };
      })(),
      sightOffset: projected ? [projected.x, projected.y] : null,
      armsVisible: arms?.visible === true || this.meleeRig.visible,
      armMeshCount,
      armMaterials: {
        contract: arms?.userData.materialContract ?? 'unavailable',
        total: armMaterialCount,
        transparent: armTransparentMaterialCount,
        nonOpaque: armNonOpaqueMaterialCount,
        depthWriteDisabled: armDepthWriteDisabledMaterialCount,
      },
      armBounds: armCenter && armSize && armProjected ? {
        center: armCenter.toArray(),
        size: armSize.toArray(),
        projected: armProjected.toArray(),
      } : null,
      worldPlaneClearance: {
        contract: 'current-rendered-mesh-world-bounds-v1',
        arms: armWorldBounds,
        weapon: weaponWorldBounds,
      },
      // HF-410 REPAIR: graded against FIRST_PERSON_CAMERA_NEAR_METERS - the
      // plane the shipped WebGPU route really submits this rig with - on real
      // deformed vertices, split by whether they land inside the viewport.
      // The first pass graded these against VIEWMODEL_OVERLAY_NEAR_METERS,
      // which is the plane of a submission this lane itself proved never runs
      // (atomicSignal is hardcoded null in legacy-main). See
      // src/viewmodel-near-plane-framing.ts for the numbers that forced both
      // halves of the correction.
      armFraming: arms?.visible
        ? measureViewmodelFraming(arms, this.camera, FIRST_PERSON_CAMERA_NEAR_METERS, isAuthoredArmMesh)
        : null,
      weaponFraming: model?.visible
        ? measureViewmodelFraming(model, this.camera, FIRST_PERSON_CAMERA_NEAR_METERS)
        : null,
      meleeKnifeFraming: this.meleeKnife.visible
        ? measureViewmodelFraming(this.meleeKnife, this.camera, FIRST_PERSON_CAMERA_NEAR_METERS)
        : null,
      viewmodelViewport: {
        aspect: this.camera instanceof THREE.PerspectiveCamera ? this.camera.aspect : null,
        fov: this.camera instanceof THREE.PerspectiveCamera ? this.camera.fov : null,
        scaleMultiplier: viewmodelScreenScale(this.camera),
        rootScale: this.root.scale.x,
        rootPosition: this.root.position.toArray(),
        rootRotation: [this.root.rotation.x, this.root.rotation.y, this.root.rotation.z],
      },
      actionContract: this.actionContract,
      // Read-only action telemetry lets the browser evidence gate capture the
      // real 620 ms throw arc without introducing a synthetic gameplay state.
      grenadeAction: this.grenadeActionTelemetry(),
      // HF-387 audit correction: `surfaceRetreat` used to publish the uncapped
      // obstruction DEMAND while the renderer performs min(demand,
      // VIEWMODEL_NEAR_PLANE_SAFE_RETREAT) of camera-space translation (the
      // clamp applied at both live sites: update() and snapToMatchStartRestPose).
      // Instruments therefore measured a retreat that never happened. The field
      // now reports the APPLIED translation; the uncapped demand stays available
      // as requestedSurfaceRetreat. Fire admission and the contact fold keep
      // consuming the demand, so combat safety is unchanged.
      surfaceRetreat: this.contactFold.engaged
        ? this.contactFold.retreatMeters
        : Math.min(this.surfaceRetreat, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT),
      requestedSurfaceRetreat: this.surfaceRetreat,
      surfaceRetreatCapMeters: this.contactFold.engaged
        ? this.contactFold.retreatMeters
        : VIEWMODEL_NEAR_PLANE_SAFE_RETREAT,
      surfaceRetreatCapped: this.contactFold.engaged
        ? this.contactFold.retreatMeters < this.surfaceRetreat
        : this.surfaceRetreat > VIEWMODEL_NEAR_PLANE_SAFE_RETREAT,
      // The solved fold, so an instrument can read what the renderer did to
      // the transform rather than what a reducer asked for.
      contactFold: this.contactFold,
      surfaceLift: this.surfaceLift,
      contactResponse: this.contactResponse,
      // HF-343: typed fire admission so the browser evidence gate and the
      // future tryFire gate read one frozen record, not re-derived blends.
      fireAdmission: this.fireAdmission(),
      riggedArms: this.riggedArmDiagnostics,
      armsSource: arms?.userData.authoredFirstPersonArms === true
        ? 'authored-two-chain'
        : arms?.userData.testOnlyProceduralFallback === true ? 'headless-procedural-fallback' : 'unavailable',
      meleeArmSource: this.meleePresentationMode,
      proceduralMeleeArmVisible: this.meleeRig.visible,
      browserProceduralMeleeArmViolation: this.browserRuntime && this.meleeRig.visible,
      proceduralMeleeArmFrames: this.proceduralMeleeArmFrames,
      riggedMeleeBindPoseRestoredExactly: this.riggedMeleeBindPoseRestoredExactly,
      authoredMeleeChainCount: this.riggedArmRigs.length,
      authoredMeleeKnifeParent: this.meleeKnife.parent?.name ?? null,
      authoredMeleeGripError: Number.isFinite(this.authoredMeleeGripError) ? this.authoredMeleeGripError : null,
      authoredMeleeHandContactError: Number.isFinite(this.authoredMeleeHandContactError)
        ? this.authoredMeleeHandContactError : null,
      authoredFingerBoneCount: this.riggedFingerBones.length,
      authoredArmAnimation: firstPersonArmAnimationState(this.authoredArmsRoot ?? undefined),
      armEvidenceCapture: this.armEvidenceCaptureTelemetry,
      knifeVisible: this.meleePresentationActive && this.meleeKnife.visible,
      passiveKnifeVisible: this.passiveKnife.visible,
      passiveKnifeModel: this.passiveKnife.getObjectByName('passive-field-knife-model') !== undefined,
      flashlight: {
        resident: this.weaponFlashlight.visible && this.weaponFlashlight.castShadow,
        active: this.weaponFlashlight.userData.shadowBudgetActive === true,
        intensity: this.weaponFlashlight.intensity,
        shadowAutoUpdate: this.weaponFlashlight.shadow.autoUpdate,
        shadowNeedsUpdate: this.weaponFlashlight.shadow.needsUpdate,
        shadowMapPixels: this.weaponFlashlight.shadow.mapSize.x * this.weaponFlashlight.shadow.mapSize.y,
        budgetScope: this.weaponFlashlight.userData.shadowBudgetScope ?? null,
      },
      minigunSpool: { ...this.minigunSpool },
      browserWeaponCatalog: this.browserCatalogReadiness(),
      importedModel,
    };
  }

  private solveArms(arms: THREE.Object3D, activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (!activeModel || this.armRigs.length === 0) return;
    this.root.updateMatrixWorld(true);
    const diagnostics: Array<Record<string, unknown>> = [];
    for (const rig of this.armRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      // HF-399: cached per mounted model; see modelSocket().
      const socket = this.cachedNamedNode(activeModel, socketName);
      if (!socket) continue;
      const socketTargetWorld = resolveSocketWorld(socket);
      const targetWorld = socketTargetWorld.clone();
      const gripOffset = new THREE.Vector3(...VIEWMODEL_GRIP_OFFSETS[this.active][rig.side])
        .multiplyScalar(rig.side === 'left' ? 1 - reloadPose.handToReload : 1)
        .multiplyScalar(1 - this.adsBlend * 0.9);
      if (gripOffset.lengthSq() > 0) {
        const modelOrigin = activeModel.localToWorld(new THREE.Vector3());
        const modelOffset = activeModel.localToWorld(gripOffset).sub(modelOrigin);
        targetWorld.add(modelOffset);
      }
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = this.cachedNamedNode(activeModel, 'reload-socket-l');
        if (reloadSocket) targetWorld.lerp(resolveSocketWorld(reloadSocket), reloadPose.handToReload);
      }
      const targetInArms = arms.worldToLocal(targetWorld.clone());
      const hint = new THREE.Vector3(rig.side === 'left' ? -0.48 : 0.48, -1, 0.22);
      const elbowPoint = solveTwoBoneElbow(rig.shoulder.position, targetInArms, rig.upperLength, rig.lowerLength, hint);
      const upperDirection = elbowPoint.sub(rig.shoulder.position).normalize();
      rig.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), upperDirection);
      rig.elbow.position.set(0, 0, -rig.upperLength);
      rig.shoulder.updateWorldMatrix(true, false); // HF-399: worldToLocal needs only this node
      const targetInShoulder = rig.shoulder.worldToLocal(targetWorld.clone());
      const lowerDirection = targetInShoulder.sub(rig.elbow.position).normalize();
      rig.elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lowerDirection);
      const gripRotation = WEAPON_HAND_ROTATIONS[this.active][rig.side];
      const gripQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...gripRotation, 'XYZ'));
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...RELOAD_HAND_ROTATIONS[this.active], 'XYZ'));
        rig.hand.quaternion.copy(gripQuaternion).slerp(reloadQuaternion, reloadPose.handToReload);
      } else {
        rig.hand.quaternion.copy(gripQuaternion);
      }
      rig.elbow.updateWorldMatrix(true, false); // HF-399: getWorldPosition refreshes the hand chain
      const handWorld = rig.hand.getWorldPosition(new THREE.Vector3());
      diagnostics.push({
        side: rig.side,
        socket: socketName,
        socketParent: socket.parent?.name ?? null,
        socketTarget: socketTargetWorld.toArray(),
        target: targetWorld.toArray(),
        hand: handWorld.toArray(),
        contactError: handWorld.distanceTo(targetWorld),
        reachRatio: rig.shoulder.position.distanceTo(targetInArms) / (rig.upperLength + rig.lowerLength),
        bindOffsetsPreserved: rig.elbow.position.equals(new THREE.Vector3(0, 0, -rig.upperLength)),
        finite: [...targetWorld.toArray(), ...handWorld.toArray()].every(Number.isFinite),
      });
    }
    this.riggedArmDiagnostics = diagnostics;
  }

  private orientRiggedBone(bone: THREE.Bone, child: THREE.Bone, targetWorld: THREE.Vector3): void {
    const scratch = this.riggedArmSolveScratch;
    // Solve the shortest arc in the bone parent's local space. This preserves
    // the authored positive-handed armature and also keeps diagnostic fixtures
    // with a reflected ancestor mathematically stable; a quaternion must never
    // be asked to encode scale handedness.
    bone.updateWorldMatrix(true, false);
    const parent = bone.parent;
    const desiredParent = scratch.orientDesiredDirection.copy(targetWorld);
    if (parent) parent.worldToLocal(desiredParent);
    desiredParent.sub(bone.position).normalize();
    const currentParent = scratch.orientCurrentDirection
      .copy(child.position)
      .applyQuaternion(bone.quaternion)
      .normalize();
    if (currentParent.lengthSq() < 1e-6 || desiredParent.lengthSq() < 1e-6) return;
    const preferredAxis = scratch.orientPreferredAxis.set(1, 0, 0).applyQuaternion(bone.quaternion);
    stableDirectionDelta(currentParent, desiredParent, preferredAxis, scratch.orientDelta);
    bone.quaternion.premultiply(scratch.orientDelta).normalize();
    // HF-399: (false, false). Every later read on this chain goes through
    // getWorldPosition/getWorldQuaternion, which refresh the parent chain
    // themselves; walking the whole subtree here (fingers, skinned sleeve and
    // whatever is socketed below the wrist) three bones x two arms x up to
    // three iterations per frame was the largest matrix cost in the frame.
    bone.updateWorldMatrix(false, false);
  }

  /** The exported palm node is the complete position and orientation authority. */
  private riggedPalmWorld(rig: RiggedViewArm, target: THREE.Vector3): THREE.Vector3 {
    return rig.palmContact.getWorldPosition(target);
  }

  private palmTargetWorldRotation(
    socket: THREE.Object3D,
    handDirectionWorld: THREE.Vector3,
    wristRollRadians: number,
  ): THREE.Quaternion {
    const scratch = this.riggedArmSolveScratch;
    const socketRotation = socket.getWorldQuaternion(scratch.weaponRotation);
    const forward = scratch.palmTargetForward.copy(handDirectionWorld).normalize();
    const up = scratch.palmTargetUp.set(0, 1, 0).applyQuaternion(socketRotation);
    up.addScaledVector(forward, -up.dot(forward));
    if (up.lengthSq() <= 1e-8) {
      up.set(0, 0, 1).applyQuaternion(socketRotation);
      up.addScaledVector(forward, -up.dot(forward));
    }
    up.normalize().applyAxisAngle(forward, wristRollRadians);
    const right = scratch.palmTargetRight.crossVectors(forward, up).normalize();
    up.crossVectors(right, forward).normalize();
    scratch.palmTargetBasis.makeBasis(right, forward, up);
    return scratch.palmTargetRotation.setFromRotationMatrix(scratch.palmTargetBasis).normalize();
  }

  private alignRiggedPalmWorld(rig: RiggedViewArm, targetRotationWorld: THREE.Quaternion): number {
    const scratch = this.riggedArmSolveScratch;
    rig.wrist.updateWorldMatrix(true, false); // HF-399: palmContact refreshes its own chain below
    const currentPalm = rig.palmContact.getWorldQuaternion(scratch.palmWorldRotation);
    const wristWorld = rig.wrist.getWorldQuaternion(scratch.wristWorldRotation);
    const parentWorld = rig.wrist.parent
      ? rig.wrist.parent.getWorldQuaternion(scratch.parentWorldRotation)
      : scratch.parentWorldRotation.identity();
    scratch.palmRotationDelta.copy(targetRotationWorld).multiply(currentPalm.invert());
    wristWorld.premultiply(scratch.palmRotationDelta);
    rig.wrist.quaternion.copy(parentWorld.invert().multiply(wristWorld)).normalize();
    rig.wrist.updateWorldMatrix(false, false); // HF-399
    return rig.palmContact.getWorldQuaternion(scratch.palmWorldRotation).angleTo(targetRotationWorld);
  }

  private placeRiggedShoulderEntryBelowFrame(
    rig: RiggedViewArm,
    cameraRotation: THREE.Quaternion,
    targetNdcY: number = FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC[rig.side],
  ): Readonly<{ ndc: readonly [number, number, number]; displacementMeters: number }> {
    const scratch = this.riggedArmSolveScratch;
    const parent = rig.shoulder.parent;
    if (!parent) return { ndc: [0, 0, 0], displacementMeters: 0 };
    parent.updateWorldMatrix(true, false);
    const start = rig.shoulder.getWorldPosition(scratch.shoulderStartWorld);
    const entry = scratch.shoulderEntryWorld.copy(start);
    const cameraDown = scratch.cameraDown.set(0, -1, 0).applyQuaternion(cameraRotation).normalize();
    const cameraRight = scratch.cameraRight.set(1, 0, 0).applyQuaternion(cameraRotation).normalize();
    entry.addScaledVector(cameraDown, 0.1)
      .addScaledVector(cameraRight, rig.side === 'right' ? 0.012 : -0.012);
    // Pin the joint to its reviewed continuation lane from either direction.
    // The previous one-sided clamp could leave heavy/mobile firing shoulders
    // arbitrarily far below the frame, exposing only a thin folded fragment.
    // The authored proximal sleeve extends past this joint and remains the
    // actual below-screen continuation; no procedural cover geometry is used.
    const projectedEntry = scratch.shoulderProjected.copy(entry).project(this.camera);
    if (Math.abs(projectedEntry.y - (targetNdcY - 0.01)) > 1e-6) {
      // Preserve exact projected depth, move the point directly below the
      // reviewed lane, then convert it back through the authored parent.
      // This is deterministic under recoil/reload rotations and replaces the
      // former unbounded below-frame placement.
      projectedEntry.y = targetNdcY - 0.01;
      entry.copy(projectedEntry.unproject(this.camera));
    }
    rig.shoulder.position.copy(parent.worldToLocal(scratch.shoulderEntryLocal.copy(entry)));
    rig.shoulder.updateWorldMatrix(false, false); // HF-399
    const projected = scratch.shoulderProjected.copy(entry).project(this.camera);
    return Object.freeze({
      ndc: Object.freeze([projected.x, projected.y, projected.z] as const),
      displacementMeters: start.distanceTo(entry),
    });
  }

  /**
   * HF-388: shifts the solved shoulder entry by the authored pose layer's
   * bounded carriage offset (clamped at build/sample time to
   * FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS and damped by ADS here).
   * Same world-intent/parent-local-write pattern as
   * placeRiggedShoulderEntryBelowFrame; the reach constraints that run later in
   * solveRiggedArms still bound the final pose.
   */
  private applyRiggedArmCarriage(rig: RiggedViewArm, cameraRotation: THREE.Quaternion): void {
    const parent = rig.shoulder.parent;
    if (!parent) return;
    const scratch = this.riggedArmSolveScratch;
    const channel = this.authoredArmChannels[rig.side];
    if (channel.carriageOffset.lengthSq() < 1e-10) return;
    const aimDamp = 1 - this.adsBlend * 0.72;
    scratch.carriageWorld.copy(channel.carriageOffset).multiplyScalar(aimDamp);
    parent.getWorldQuaternion(scratch.carriageParentWorld);
    scratch.carriageWorld.applyQuaternion(scratch.carriageParentWorld);
    const entry = rig.shoulder.getWorldPosition(scratch.shoulderStartWorld);
    entry.addScaledVector(
      scratch.cameraRight.set(1, 0, 0).applyQuaternion(cameraRotation),
      scratch.carriageWorld.dot(scratch.cameraRight),
    );
    entry.addScaledVector(
      scratch.cameraUp.set(0, 1, 0).applyQuaternion(cameraRotation),
      scratch.carriageWorld.dot(scratch.cameraUp),
    );
    rig.shoulder.position.copy(parent.worldToLocal(entry));
    rig.shoulder.updateWorldMatrix(false, false); // HF-399
  }

  /**
   * Keeps the authored upper/lower-arm lengths intact. If the below-frame
   * shoulder crop leaves a grip outside the real two-bone span, move only the
   * shoulder root onto the reachable sphere and rotate that offset toward a
   * camera-relative human shoulder direction until the sleeve still enters
   * below frame. No skinned bone receives scale or length mutation.
   */
  private constrainRiggedShoulderEntryToReach(
    rig: RiggedViewArm,
    cameraRotation: THREE.Quaternion,
    socketTarget: THREE.Vector3,
    maximumSocketReach: number,
    targetNdcY: number = FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC[rig.side],
  ): Readonly<{
      ndc: readonly [number, number, number];
      displacementMeters: number;
      adjusted: boolean;
      socketDistance: number;
    }> {
    const scratch = this.riggedArmSolveScratch;
    const result = scratch.shoulderReachResult;
    const parent = rig.shoulder.parent;
    const start = rig.shoulder.getWorldPosition(scratch.shoulderStartWorld);
    const safeReach = Math.max(0.05, maximumSocketReach);
    const initialSocketDistance = start.distanceTo(socketTarget);
    if (!parent || initialSocketDistance <= safeReach) {
      const projected = scratch.shoulderProjected.copy(start).project(this.camera);
      result.ndc[0] = projected.x;
      result.ndc[1] = projected.y;
      result.ndc[2] = projected.z;
      result.displacementMeters = 0;
      result.adjusted = false;
      result.socketDistance = initialSocketDistance;
      return result;
    }

    const initialDirection = scratch.shoulderReachDirection.copy(start).sub(socketTarget);
    if (initialDirection.lengthSq() <= 1e-8) {
      initialDirection.set(rig.side === 'right' ? 0.25 : -0.25, -0.9, 0.3).applyQuaternion(cameraRotation);
    }
    initialDirection.normalize();
    const cameraDown = scratch.cameraDown.set(0, -1, 0).applyQuaternion(cameraRotation).normalize();
    const cameraRight = scratch.cameraRight.set(1, 0, 0).applyQuaternion(cameraRotation).normalize();
    const cameraBack = scratch.cameraBack.set(0, 0, 1).applyQuaternion(cameraRotation).normalize();
    // HF-365: 0.2 of lateral against 0.93 of down is very nearly straight below
    // the grip, and that is what made both arms read as vertical posts. A real
    // shoulder sits well outboard of the hands, so the fallback direction now
    // carries a shoulder-width lateral component; the loop still walks toward
    // it only as far as the below-frame lane requires, so nothing about the
    // crop contract changes.
    const anatomicalDirection = scratch.shoulderAnatomicalDirection.copy(cameraDown).multiplyScalar(0.84)
      .addScaledVector(cameraRight, rig.side === 'right' ? 0.45 : -0.45)
      .addScaledVector(cameraBack, 0.31)
      .normalize();

    const candidate = scratch.shoulderReachCandidate;
    const blended = scratch.shoulderBlendedDirection;
    let projected = scratch.shoulderProjected;
    for (let step = 0; step <= 16; step += 1) {
      blended.copy(initialDirection).lerp(anatomicalDirection, step / 16).normalize();
      candidate.copy(socketTarget).addScaledVector(blended, safeReach);
      projected = scratch.shoulderProjected.copy(candidate).project(this.camera);
      if (projected.y <= targetNdcY - 0.005) break;
    }

    parent.updateWorldMatrix(true, false);
    rig.shoulder.position.copy(parent.worldToLocal(scratch.shoulderEntryLocal.copy(candidate)));
    rig.shoulder.updateWorldMatrix(false, false); // HF-399
    const finalShoulder = rig.shoulder.getWorldPosition(scratch.shoulderPosition);
    projected = scratch.shoulderProjected.copy(finalShoulder).project(this.camera);
    result.ndc[0] = projected.x;
    result.ndc[1] = projected.y;
    result.ndc[2] = projected.z;
    result.displacementMeters = start.distanceTo(finalShoulder);
    result.adjusted = true;
    result.socketDistance = finalShoulder.distanceTo(socketTarget);
    return result;
  }

  private poseRiggedArmToWristTarget(
    rig: RiggedViewArm,
    wristTarget: THREE.Vector3,
    shoulderPosition: THREE.Vector3,
    upperLength: number,
    lowerLength: number,
    bendHint: THREE.Vector3,
    handDirection: THREE.Vector3,
  ): THREE.Vector3 {
    const scratch = this.riggedArmSolveScratch;
    const elbowTarget = solveTwoBoneElbowInto(
      shoulderPosition,
      wristTarget,
      upperLength,
      lowerLength,
      bendHint,
      scratch.elbowTarget,
      scratch.elbowSolver,
    );
    this.orientRiggedBone(rig.shoulder, rig.elbow, elbowTarget);
    this.orientRiggedBone(rig.elbow, rig.wrist, wristTarget);
    const handTarget = rig.wrist.getWorldPosition(scratch.handTarget).add(handDirection);
    this.orientRiggedBone(rig.wrist, rig.finger, handTarget);
    return elbowTarget;
  }

  private restoreRiggedArmBindPose(): boolean {
    for (const rig of this.riggedArmRigs) {
      rig.shoulder.quaternion.copy(rig.bindShoulder);
      rig.elbow.quaternion.copy(rig.bindElbow);
      rig.wrist.quaternion.copy(rig.bindWrist);
      rig.shoulder.position.copy(rig.bindShoulderPosition);
      rig.elbow.position.copy(rig.bindElbowPosition);
      rig.wrist.position.copy(rig.bindWristPosition);
      rig.shoulder.scale.copy(rig.bindShoulderScale);
      rig.elbow.scale.copy(rig.bindElbowScale);
      rig.wrist.scale.copy(rig.bindWristScale);
    }
    const restored = this.riggedArmRigs.every((rig) => (
      rig.shoulder.quaternion.equals(rig.bindShoulder)
      && rig.elbow.quaternion.equals(rig.bindElbow)
      && rig.wrist.quaternion.equals(rig.bindWrist)
      && rig.shoulder.position.equals(rig.bindShoulderPosition)
      && rig.elbow.position.equals(rig.bindElbowPosition)
      && rig.wrist.position.equals(rig.bindWristPosition)
      && rig.shoulder.scale.equals(rig.bindShoulderScale)
      && rig.elbow.scale.equals(rig.bindElbowScale)
      && rig.wrist.scale.equals(rig.bindWristScale)
    ));
    this.riggedMeleeBindPoseRestoredExactly = restored;
    return restored;
  }

  private poseRiggedMeleeArms(progress: number): void {
    this.restoreRiggedArmBindPose();
    const windup = THREE.MathUtils.smoothstep(progress, 0, 0.14);
    const thrust = THREE.MathUtils.smoothstep(progress, 0.14, 0.44);
    const recover = THREE.MathUtils.smoothstep(progress, 0.58, 1);
    const drive = thrust * (1 - recover);
    let right: RiggedViewArm | undefined;
    let left: RiggedViewArm | undefined;
    for (const rig of this.riggedArmRigs) {
      if (rig.side === 'right') right = rig;
      else left = rig;
    }
    const arms = this.authoredArmsRoot;
    if (arms) {
      const scratch = this.riggedArmSolveScratch;
      const cameraRotation = this.camera.getWorldQuaternion(scratch.cameraRotation);
      if (right) {
        this.placeRiggedShoulderEntryBelowFrame(
          right,
          cameraRotation,
          FIRST_PERSON_MELEE_SHOULDER_ENTRY_NDC,
        );
      }
      if (left && this.riggedMeleeSupportPose) {
        // Keep the intact off-hand guard from the immediately preceding armed
        // pose. The old +40 m stow made a real arm vanish during every knife
        // frame; preserving its authored local joint transforms keeps both
        // sleeves substantial without inventing geometry or scaling a chain.
        const support = this.riggedMeleeSupportPose;
        left.shoulder.position.copy(support.shoulderPosition);
        left.shoulder.quaternion.copy(support.shoulderQuaternion);
        left.shoulder.scale.copy(support.shoulderScale);
        left.elbow.position.copy(support.elbowPosition);
        left.elbow.quaternion.copy(support.elbowQuaternion);
        left.elbow.scale.copy(support.elbowScale);
        left.wrist.position.copy(support.wristPosition);
        left.wrist.quaternion.copy(support.wristQuaternion);
        left.wrist.scale.copy(support.wristScale);
        this.placeRiggedShoulderEntryBelowFrame(left, cameraRotation);
      }
      arms.updateWorldMatrix(true, true);
      const armsWorldRotation = arms.getWorldQuaternion(scratch.meleeArmsWorldRotation);
      const poseChain = (
        rig: RiggedViewArm,
        peakTargetLocal: THREE.Vector3,
        bendHintLocal: THREE.Vector3,
        handDirectionLocal: THREE.Vector3,
        windupOffsetLocal: THREE.Vector3,
      ) => {
        const shoulder = rig.shoulder.getWorldPosition(scratch.shoulderPosition);
        const elbow = rig.elbow.getWorldPosition(scratch.elbowPosition);
        const wrist = rig.wrist.getWorldPosition(scratch.wristPosition);
        const upperLength = shoulder.distanceTo(elbow);
        const lowerLength = elbow.distanceTo(wrist);
        const restWristLocal = arms.worldToLocal(scratch.meleeRestWristLocal.copy(wrist));
        const targetLocal = scratch.meleeWristTargetLocal.copy(restWristLocal)
          .addScaledVector(windupOffsetLocal, windup * (1 - thrust))
          .lerp(peakTargetLocal, drive);
        const wristTarget = arms.localToWorld(scratch.meleeWristTargetWorld.copy(targetLocal));
        const bendHint = scratch.meleeBendHintWorld.copy(bendHintLocal).applyQuaternion(armsWorldRotation).normalize();
        const handDirection = scratch.meleeHandDirectionWorld.copy(handDirectionLocal).applyQuaternion(armsWorldRotation).normalize();
        this.poseRiggedArmToWristTarget(
          rig, wristTarget, shoulder, upperLength, lowerLength, bendHint, handDirection,
        );
      };
      if (right) {
        poseChain(
          right,
          MELEE_RIGHT_WRIST_TARGET_GLTF as THREE.Vector3,
          MELEE_RIGHT_BEND_HINT_GLTF as THREE.Vector3,
          MELEE_RIGHT_HAND_DIRECTION_GLTF as THREE.Vector3,
          scratch.target.set(0.055, -0.025, 0.075),
        );
      }
      if (left && !this.riggedMeleeSupportPose) {
        // HF-341: no reusable pre-stab capture (for example the preceding pose
        // was the legacy off-screen stow). Solve the authored left-arm guard
        // with the real two-bone chain so the stab still shows both arms.
        this.placeRiggedShoulderEntryBelowFrame(left, cameraRotation);
        const shoulder = left.shoulder.getWorldPosition(scratch.shoulderPosition);
        const elbow = left.elbow.getWorldPosition(scratch.elbowPosition);
        const wrist = left.wrist.getWorldPosition(scratch.wristPosition);
        const upperLength = shoulder.distanceTo(elbow);
        const lowerLength = elbow.distanceTo(wrist);
        const wristTarget = arms.localToWorld(
          scratch.meleeWristTargetWorld.copy(MELEE_LEFT_GUARD_WRIST_TARGET_GLTF),
        );
        const bendHint = scratch.meleeBendHintWorld.copy(MELEE_LEFT_GUARD_BEND_HINT_GLTF)
          .applyQuaternion(armsWorldRotation).normalize();
        const handDirection = scratch.meleeHandDirectionWorld.copy(MELEE_LEFT_GUARD_HAND_DIRECTION_GLTF)
          .applyQuaternion(armsWorldRotation).normalize();
        this.poseRiggedArmToWristTarget(
          left, wristTarget, shoulder, upperLength, lowerLength, bendHint, handDirection,
        );
      }
    }
    this.root.updateWorldMatrix(true, true);
    if (this.authoredMeleeKnife && this.authoredMeleeSocket) {
      // Re-align the knife blade axis to the current finger direction each frame
      // so the handle stays visibly seated in the palm through windup/thrust/recovery.
      if (right) {
        const fingerDir = right.wrist.worldToLocal(right.finger.getWorldPosition(this.meleeGripWorld));
        if (fingerDir.lengthSq() > 1e-6) {
          fingerDir.normalize();
          this.meleeKnife.quaternion.setFromUnitVectors(KNIFE_BLADE_AXIS as THREE.Vector3, fingerDir);
          this.meleeKnife.rotateZ(-0.2);
        }
      }
      // HF-399: per-frame melee diagnostic; cached per knife model.
      const grip = this.cachedNamedNode(this.authoredMeleeKnife, 'grip-socket-r');
      if (grip) {
        this.authoredMeleeGripError = grip.getWorldPosition(this.meleeGripWorld)
          .distanceTo(this.authoredMeleeSocket.getWorldPosition(this.meleeSocketWorld));
        if (right) {
          this.authoredMeleeHandContactError = grip.getWorldPosition(this.meleeGripWorld)
            .distanceTo(this.riggedPalmWorld(right, this.meleeHandWorld));
        }
      }
    }
    this.riggedArmDiagnostics = this.riggedArmRigs.map((rig) => ({
      side: rig.side,
      action: 'melee',
      progress,
      shoulderBindDelta: rig.shoulder.quaternion.angleTo(rig.bindShoulder),
      elbowBindDelta: rig.elbow.quaternion.angleTo(rig.bindElbow),
      wristBindDelta: rig.wrist.quaternion.angleTo(rig.bindWrist),
      knifeAttachedToRightWrist: rig.side === 'right' && this.authoredMeleeSocket?.parent === rig.wrist,
      supportChainScale: rig.side === 'left' ? rig.shoulder.scale.x : null,
      supportChainPolicy: rig.side === 'left' ? 'two-chain-intact-melee-guard-v1' : null,
      // HF-341: names whether the left arm replays the captured pre-stab pose
      // or was solved fresh onto the authored guard target.
      supportPoseSource: rig.side === 'left'
        ? (this.riggedMeleeSupportPose ? 'captured-preceding-pose' : 'solved-authored-guard')
        : null,
      supportChainVisible: rig.side === 'left',
      stowedWithoutScaling: rig.side === 'left' ? false : null,
      shoulder: rig.shoulder.getWorldPosition(new THREE.Vector3()).toArray(),
      elbow: rig.elbow.getWorldPosition(new THREE.Vector3()).toArray(),
      wrist: rig.wrist.getWorldPosition(new THREE.Vector3()).toArray(),
      palm: this.riggedPalmWorld(rig, new THREE.Vector3()).toArray(),
    }));
  }

  private poseRiggedFingers(reloadPose: ReloadPose, meleeActive: boolean): void {
    for (const finger of this.riggedFingerBones) {
      const joint = finger.joint - 1;
      const supportScale = supportFingerCurlScale(this.active);
      let curl = finger.side === 'right'
        ? FINGER_FIRE_CURL[finger.digit][joint]
        : FINGER_SUPPORT_CURL[finger.digit][joint] * supportScale;
      if (finger.side === 'left' && reloadPose.handToReload > 0) {
        const reloadCurl = FINGER_RELOAD_CURL[finger.digit][joint];
        curl = THREE.MathUtils.lerp(curl, reloadCurl, reloadPose.handToReload);
      }
      if (meleeActive && finger.side === 'right') {
        curl = FINGER_FIRE_CURL[finger.digit][joint] * 1.35;
      } else if (meleeActive && finger.side === 'left') {
        curl = FINGER_OFFHAND_CURL[finger.digit][joint];
      }
      const spread = finger.side === 'left' && finger.joint === 1 && !meleeActive
        ? FINGER_SUPPORT_SPREAD[finger.digit] * (1 - reloadPose.handToReload)
        : 0;
      this.fingerPoseEuler.set(curl, spread, 0, 'XYZ');
      this.fingerPoseQuaternion.setFromEuler(this.fingerPoseEuler);
      finger.bone.quaternion.multiply(this.fingerPoseQuaternion);
    }
  }

  private solveRiggedArms(activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (this.riggedArmRigs.length === 0) return;
    this.restoreRiggedArmBindPose();
    if (!activeModel) return;
    this.root.updateMatrixWorld(true);
    const scratch = this.riggedArmSolveScratch;
    const cameraRotation = this.camera.getWorldQuaternion(scratch.cameraRotation);
    const now = performance.now();
    const captureDiagnostics = now >= this.nextRiggedArmDiagnosticsAt;
    const diagnostics: Array<Record<string, unknown>> | null = captureDiagnostics ? [] : null;
    if (captureDiagnostics) this.nextRiggedArmDiagnosticsAt = now + 250;
    // HF-341: the handgun-family '+40 m support stow' branch that used to live
    // here is gone. It teleported a real arm off-screen (the exact pattern the
    // melee path condemns) and popped it back across one frame at every reload
    // boundary. Handguns now hold a posed two-hand grip on the authored
    // support-socket-l, and every reload transition blends via handToReload.
    const handPolicy = firstPersonHandPolicy(this.active);
    for (const rig of this.riggedArmRigs) {
      // Keep the authored segment translations byte-for-byte intact. The
      // previous reach fix multiplied these offsets as far as 2.2x, stretching
      // weighted sleeves into thin tubes at elbows and wrists. Reach is now
      // solved by a bounded shoulder-root translation plus joint rotation.
      const segmentLengthScale = FIRST_PERSON_ARM_BIND_SEGMENT_LENGTH_SCALE;
      rig.elbow.position.copy(rig.bindElbowPosition);
      rig.wrist.position.copy(rig.bindWristPosition);
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      // HF-399: cached per mounted model; see modelSocket().
      const socket = this.cachedNamedNode(activeModel, socketName);
      if (!socket) continue;
      const target = socket.getWorldPosition(scratch.target);
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = this.cachedNamedNode(activeModel, 'reload-socket-l');
        if (reloadSocket) target.lerp(reloadSocket.getWorldPosition(scratch.handTarget), reloadPose.handToReload);
      }
      const shoulderEntryTargetNdcY = firstPersonArmShoulderEntryNdc(
        rig.side,
        handPolicy.gripFamily,
        this.adsBlend,
        this.contactResponse.highReadyBlend,
      );
      const initialShoulderEntry = this.placeRiggedShoulderEntryBelowFrame(
        rig,
        cameraRotation,
        shoulderEntryTargetNdcY,
      );
      // HF-388: the authored pose layer's bounded shoulder-carriage shift,
      // applied exactly like placeRiggedShoulderEntryBelowFrame applies its own
      // entry move (world-space intent, parent-local write). Reach constraints
      // below still bound the result.
      this.applyRiggedArmCarriage(rig, cameraRotation);
      const shoulderPosition = rig.shoulder.getWorldPosition(scratch.shoulderPosition);
      const elbowPosition = rig.elbow.getWorldPosition(scratch.elbowPosition);
      const wristPosition = rig.wrist.getWorldPosition(scratch.wristPosition);
      const upperLength = shoulderPosition.distanceTo(elbowPosition);
      const lowerLength = elbowPosition.distanceTo(wristPosition);
      const socketTarget = scratch.socketTarget.copy(target);
      const physicalReach = upperLength + lowerLength;
      const palmReachAllowance = rig.wrist.getWorldPosition(scratch.solvedWrist)
        .distanceTo(this.riggedPalmWorld(rig, scratch.palmWorld)) + 0.01;
      const maximumSocketReach = Math.max(
        0.05,
        physicalReach * RIGGED_ARM_MAX_REACH_RATIO - palmReachAllowance,
      );
      const reachableShoulderEntry = this.constrainRiggedShoulderEntryToReach(
        rig,
        cameraRotation,
        socketTarget,
        maximumSocketReach,
        shoulderEntryTargetNdcY,
      );
      rig.shoulder.getWorldPosition(shoulderPosition);
      rig.elbow.getWorldPosition(elbowPosition);
      rig.wrist.getWorldPosition(wristPosition);
      const socketReach = shoulderPosition.distanceTo(socketTarget);
      const socketReachRatio = socketReach / Math.max(physicalReach, 1e-6);
      const calibratedReach = physicalReach * RIGGED_ARM_MAX_REACH_RATIO;
      let gripSocketCalibration = 0;
      // HF-340: per-family firing pole (lateral-dominant, slightly camera-down
      // for long-gun/handgun/crossbow) restores left/right bend symmetry; the
      // raised pole survives only for compact/heavy and the high-ready blend.
      const bendHint = rig.side === 'left'
        ? firstPersonSupportElbowPole(scratch.bendHint)
        : firstPersonFiringElbowPole(
          handPolicy.gripFamily,
          this.contactResponse.highReadyBlend,
          scratch.bendHint,
        );
      bendHint.applyQuaternion(cameraRotation);
      // HF-365: swing the elbow around the shoulder-to-grip axis. Rotating the
      // POLE moves the forearm and sleeve without moving the wrist endpoint, so
      // the palm contact solved below is unaffected.
      const motion = firstPersonArmMotionSample({
        side: rig.side,
        elapsedSeconds: this.armMotionSeconds,
        phase: this.armMotionPhase,
        movingBlend: this.armMotionMovingBlend,
        sprintBlend: this.sprintBlend,
        adsBlend: this.adsBlend,
      });
      const poleAxis = scratch.poleAxis.copy(socketTarget).sub(shoulderPosition);
      if (poleAxis.lengthSq() > 1e-8) {
        // HF-388: procedural + authored pose layer + arm-local recoil + landing
        // absorb share one pole channel. The clamp is EQUAL to the pre-existing
        // bound (motion was already capped at FIRST_PERSON_ARM_MOTION_MAX_POLE_
        // RADIANS); the sum can only be smaller.
        const authored = this.authoredArmChannels[rig.side];
        const aimDamp = 1 - this.adsBlend * 0.72;
        const recoilSign = rig.side === 'right' ? 1 : -1;
        const totalPoleRadians = THREE.MathUtils.clamp(
          motion.poleRadians
            + authored.poleRadians * aimDamp
            + this.armRecoilKickRadians * recoilSign
            - this.armLandDipRadians * aimDamp,
          -FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS,
          FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS,
        );
        bendHint.applyAxisAngle(poleAxis.normalize(), totalPoleRadians);
      }
      const weaponRotation = activeModel.getWorldQuaternion(scratch.weaponRotation);
      const muzzle = this.cachedNamedNode(activeModel, 'muzzle-socket');
      const weaponForward = muzzle
        ? scratch.weaponForward.copy(muzzle.getWorldPosition(scratch.handTarget)).sub(socketTarget).normalize()
        : scratch.weaponForward.set(0, 0, 1).applyQuaternion(weaponRotation).normalize();
      const handDirection = rig.side === 'left'
        ? riggedSupportHandDirectionLocal(reloadPose.handToReload, scratch.handDirection).applyQuaternion(weaponRotation).normalize()
        : scratch.handDirection.copy(weaponForward);
      // HF-341: the firing wrist takes the per-family stance roll (slight
      // inward cant for the two-hand handgun grip, neutral elsewhere).
      // HF-388: the authored pose layer's roll joins the MOTION portion, and
      // only that motion portion is capped — identical bound to before, so the
      // authored contribution can never exceed the procedural roll budget.
      const motionWristRollRadians = THREE.MathUtils.clamp(
        motion.wristRollRadians
          + this.authoredArmChannels[rig.side].wristRollRadians * (1 - this.adsBlend * 0.72),
        -FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS,
        FIRST_PERSON_ARM_MOTION_MAX_WRIST_ROLL_RADIANS,
      );
      const wristRollRadians = (rig.side === 'left'
        ? riggedSupportWristRollRadians(reloadPose.handToReload)
        : firstPersonFiringWristRollRadians(handPolicy.gripFamily)) + motionWristRollRadians;
      const palmTargetRotation = this.palmTargetWorldRotation(socket, handDirection, wristRollRadians);
      const contactIterationErrors: number[] | null = diagnostics ? [] : null;
      let palmOrientationError = Number.POSITIVE_INFINITY;

      // Iterate the wrist endpoint until the actual palm, rather than the cuff
      // joint, meets the authored weapon socket. This mirrors the source-asset
      // contact solve and keeps sleeves behind the controls at hip, ADS and
      // reload poses. All corrections remain bounded by the physical chain.
      const wristTarget = scratch.wristTarget.copy(socketTarget);
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const requestedReach = shoulderPosition.distanceTo(wristTarget);
        if (requestedReach > calibratedReach) {
          const unclampedX = wristTarget.x;
          const unclampedY = wristTarget.y;
          const unclampedZ = wristTarget.z;
          wristTarget.lerp(shoulderPosition, 1 - calibratedReach / requestedReach);
          gripSocketCalibration = Math.max(
            gripSocketCalibration,
            Math.hypot(wristTarget.x - unclampedX, wristTarget.y - unclampedY, wristTarget.z - unclampedZ),
          );
        }
        this.poseRiggedArmToWristTarget(
          rig, wristTarget, shoulderPosition, upperLength, lowerLength, bendHint, handDirection,
        );
        palmOrientationError = this.alignRiggedPalmWorld(rig, palmTargetRotation);
        this.riggedPalmWorld(rig, scratch.palmWorld);
        const correction = scratch.palmCorrection.copy(socketTarget).sub(scratch.palmWorld);
        contactIterationErrors?.push(correction.length());
        wristTarget.add(correction);
        if (correction.lengthSq() <= 0.00025 * 0.00025) break;
      }
      const requestedReach = shoulderPosition.distanceTo(wristTarget);
      if (requestedReach > calibratedReach) {
        const excess = requestedReach - calibratedReach;
        wristTarget.lerp(shoulderPosition, 1 - calibratedReach / requestedReach);
        gripSocketCalibration = Math.max(gripSocketCalibration, excess);
      }
      const elbowTarget = this.poseRiggedArmToWristTarget(
        rig, wristTarget, shoulderPosition, upperLength, lowerLength, bendHint, handDirection,
      );
      palmOrientationError = this.alignRiggedPalmWorld(rig, palmTargetRotation);
      const solvedWrist = rig.wrist.getWorldPosition(scratch.solvedWrist);
      const solvedPalm = this.riggedPalmWorld(rig, scratch.diagnosticPalm);
      const reachRatio = shoulderPosition.distanceTo(wristTarget) / Math.max(upperLength + lowerLength, 1e-6);
      if (!diagnostics) continue;
      diagnostics.push({
        side: rig.side,
        weapon: this.active,
        gripFamily: viewmodelGripFamily(this.active),
        handPolicy,
        active: true,
        socket: socketName,
        socketTarget: socketTarget.toArray(),
        socketReachRatio,
        gripSocketCalibration,
        upperLength,
        lowerLength,
        // HF-388: live values of the new arm-motion channels, so a QA probe can
        // prove the layer is actually driving the pose instead of trusting code.
        authoredPoleRadians: this.authoredArmChannels[rig.side].poleRadians,
        authoredWristRollRadians: this.authoredArmChannels[rig.side].wristRollRadians,
        authoredCarriageMeters: this.authoredArmChannels[rig.side].carriageOffset.length(),
        armRecoilKickRadians: this.armRecoilKickRadians,
        armLandDipRadians: this.armLandDipRadians,
        shoulder: rig.shoulder.getWorldPosition(scratch.diagnosticShoulder).toArray(),
        elbow: rig.elbow.getWorldPosition(scratch.diagnosticElbow).toArray(),
        wrist: rig.wrist.getWorldPosition(scratch.diagnosticWrist).toArray(),
        palm: solvedPalm.toArray(),
        palmQuaternion: rig.palmContact.getWorldQuaternion(scratch.palmWorldRotation).toArray(),
        palmTargetQuaternion: palmTargetRotation.toArray(),
        target: socketTarget.toArray(),
        wristTarget: wristTarget.toArray(),
        contactAnchor: rig.palmContact.name,
        poseChainContract: RIGGED_HAND_POSE_CHAIN_CONTRACT,
        shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
        shoulderEntryNdc: [...reachableShoulderEntry.ndc],
        shoulderEntryDisplacementMeters: initialShoulderEntry.displacementMeters
          + reachableShoulderEntry.displacementMeters,
        shoulderReachAdjusted: reachableShoulderEntry.adjusted,
        maximumSocketReach,
        segmentLengthScale,
        authoredSegmentDirectionsPreserved: rig.elbow.position.clone().normalize()
          .dot(rig.bindElbowPosition.clone().normalize()) > 0.999999
          && rig.wrist.position.clone().normalize().dot(rig.bindWristPosition.clone().normalize()) > 0.999999,
        handDirection: handDirection.toArray(),
        wristRollRadians,
        palmOrientationError,
        contactIterationErrors,
        contactError: solvedPalm.distanceTo(socketTarget),
        wristContactError: solvedWrist.distanceTo(wristTarget),
        reachRatio,
        withinStableReach: reachRatio <= 1.001,
        bindOffsetsPreserved: rig.elbow.position.equals(rig.bindElbowPosition)
          && rig.wrist.position.equals(rig.bindWristPosition),
        finite: [...socketTarget.toArray(), ...wristTarget.toArray(), ...solvedWrist.toArray(), ...solvedPalm.toArray(), ...elbowTarget.toArray()].every(Number.isFinite),
        shoulderQuaternion: rig.shoulder.quaternion.toArray(),
        elbowQuaternion: rig.elbow.quaternion.toArray(),
      });
    }
    if (diagnostics) this.riggedArmDiagnostics = diagnostics;
  }

  /**
   * HF-410 - THE FIT IS A PRESENTATION TRANSFORM, AND THE SOLVE IS NOT INSIDE IT.
   *
   * The body fit (src/viewmodel-body-fit.ts) is a uniform scale about the eye
   * carried by `bodyFitRoot`. Everything below solves in WORLD space against
   * AUTHORED METRE CONSTANTS - the arm IK's 0.1 m shoulder drop and its socket
   * reach, the near-plane clearance push, the ADS sight centring - and those
   * constants were measured against an unfitted rig. Solving inside the fit
   * would silently multiply every one of them by 1/k.
   *
   * So the rig is posed in exactly the frame it was authored and tuned in, and
   * the fit is applied to the finished result. `finally`, not a trailing
   * statement: an early return or a throw must never leave the rig rendering a
   * frame at full size, which is a visible pop.
   */
  update(pose: WeaponPose): WeaponActionEvent[] {
    this.applyBodyFit(1);
    try {
      return this.updateSolvedPose(pose);
    } finally {
      this.applyBodyFit(VIEWMODEL_BODY_FIT_SCALE);
    }
  }

  /**
   * Sets the fit AND republishes the node's own world matrix, in constant time.
   *
   * `Object3D.updateMatrixWorld` does not walk UP the tree, so a consumer that
   * calls it on the rig root - the renderer does not, but the regression gates
   * and several probes do - composes against whatever this node's `matrixWorld`
   * happens to hold. Flipping `scale` without republishing left that matrix
   * describing a different fit from the one in force, and the rig then measured
   * as though it had drifted off its own mount. Two matrix composes per frame.
   */
  private applyBodyFit(scale: number): void {
    this.bodyFitRoot.scale.setScalar(scale);
    this.bodyFitRoot.updateMatrix();
    const parent = this.bodyFitRoot.parent;
    if (parent) this.bodyFitRoot.matrixWorld.multiplyMatrices(parent.matrixWorld, this.bodyFitRoot.matrix);
    else this.bodyFitRoot.matrixWorld.copy(this.bodyFitRoot.matrix);
  }

  private updateSolvedPose(pose: WeaponPose): WeaponActionEvent[] {
    // Owner 2026-08-30 ("randomly top of shotgun detached ... m14 scope part
    // is flying in the air above the gun"). Hidden weapon models have their
    // subtree matrices DEEP-FROZEN (matrixAutoUpdate off) so a parked model
    // costs nothing per frame. Any path that reveals a model without
    // re-running applyModelMatrixFreeze therefore renders it - and every part
    // under it - at the WORLD transform it was frozen at, which is exactly a
    // rib or an optic hanging in the air away from the receiver. It is
    // intermittent because it depends on which of several reveal paths ran.
    // Rather than chase each path, the invariant is enforced once, per frame,
    // where it can never be bypassed: whatever is visible is unfrozen.
    this.applyModelMatrixFreeze();
    const actionEvents: WeaponActionEvent[] = [];
    const smoothing = (rate: number) => 1 - Math.exp(-rate * pose.dt);
    // HF-365: advance the arm-motion clock before anything reads it, and keep
    // the locomotion loop matched to the movement state. Both are clamped to
    // the same dt the mixer uses so a stalled tab cannot jump the pose.
    const armDt = Math.min(0.05, Math.max(0, pose.dt));
    this.armMotionSeconds += armDt;
    this.armMotionPhase = Number.isFinite(pose.phase) ? pose.phase : this.armMotionPhase;
    this.armMotionMovingBlend = THREE.MathUtils.lerp(
      this.armMotionMovingBlend,
      pose.moving ? 1 : 0,
      1 - Math.exp(-9 * armDt),
    );
    if (this.authoredArmsRoot) {
      resetFirstPersonArmFingers(this.riggedFingerBones);
      setFirstPersonArmBaseAction(
        this.authoredArmsRoot,
        firstPersonArmBaseActionFor(pose.moving, pose.sprinting),
      );
      // HF-388: ADS edges play the previously-dead authored clips. The pose
      // layer below turns them into visible arm carriage because the mixer's
      // own finger-only tracks carry no arm-chain content.
      const presentedAds = pose.ads === true;
      if (this.lastPresentedAds !== null && presentedAds !== this.lastPresentedAds) {
        this.lastPresentedAds = presentedAds;
        playFirstPersonArmAction(this.authoredArmsRoot, presentedAds ? 'ads-in' : 'ads-out');
      }
      updateFirstPersonArmAnimations(this.authoredArmsRoot, pose.dt);
      const state = firstPersonArmAnimationState(this.authoredArmsRoot);
      const sample = firstPersonArmAuthoredLayerSample(
        getFirstPersonArmAuthoredLayer(this.authoredArmsRoot),
        state?.baseAction ?? null,
        state?.activeAction ?? null,
      );
      const channelMix = 1 - Math.exp(-12 * armDt);
      for (const side of ['left', 'right'] as const) {
        const target = sample[side];
        const smoothed = this.authoredArmChannels[side];
        smoothed.poleRadians += (target.poleRadians - smoothed.poleRadians) * channelMix;
        smoothed.wristRollRadians += (target.wristRollRadians - smoothed.wristRollRadians) * channelMix;
        smoothed.carriageOffset.x += (target.carriageOffset[0] - smoothed.carriageOffset.x) * channelMix;
        smoothed.carriageOffset.y += (target.carriageOffset[1] - smoothed.carriageOffset.y) * channelMix;
        smoothed.carriageOffset.z += (target.carriageOffset[2] - smoothed.carriageOffset.z) * channelMix;
      }
    }
    // HF-388: landing absorb. The impulse arrives transiently from the movement
    // loop; hold the peak with an exponential release so a single-frame spike
    // still reads as a visible dip instead of vanishing inside one frame.
    this.armLandDipRadians = Math.max(
      THREE.MathUtils.clamp(pose.landingImpulse, 0, 1) * FIRST_PERSON_ARM_LAND_DIP_RADIANS,
      this.armLandDipRadians * Math.exp(-6 * armDt),
    );
    // HF-388 landing follow-through. A rising impulse is a fresh (or sustained)
    // impact: restart the authored dip envelope and take the stronger
    // amplitude. Otherwise the envelope just ages along its damped release.
    if (pose.landingImpulse > this.lastLandingImpulse + 1e-9) {
      this.landAgeSeconds = 0;
      this.landAmplitude = Math.max(this.landAmplitude, THREE.MathUtils.clamp(pose.landingImpulse, 0, 1));
    } else {
      this.landAgeSeconds += Math.max(0, pose.dt);
      if (this.landAgeSeconds >= VIEWMODEL_LAND_DIP_SETTLE_SECONDS) {
        this.landAgeSeconds = VIEWMODEL_LAND_DIP_SETTLE_SECONDS;
        this.landAmplitude = 0;
      }
    }
    this.lastLandingImpulse = pose.landingImpulse;
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, false, pose.dt, this.active);
    advanceMinigunSpool(this.minigunSpool, {
      dt: pose.dt,
      triggerHeld: pose.triggerHeld === true,
      equipped: this.active === 'minigun',
    });
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, smoothing(16));
    this.muzzleLight.intensity = THREE.MathUtils.lerp(this.muzzleLight.intensity, 0, smoothing(30));
    this.equipElapsedSeconds += Math.max(0, pose.dt);
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, smoothing(7));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, smoothing(7));
    this.adsBlend = advanceAdsBlend(this.adsBlend, pose.ads, pose.dt, this.active);
    this.surfaceRetreat = pose.surfaceRetreat ?? 0;
    this.surfaceLift = pose.surfaceLift ?? 0;
    this.prone = pose.prone;
    this.contactResponse = viewmodelContactResponse(
      this.active,
      this.surfaceRetreat,
      this.surfaceLift,
      this.prone,
      this.adsBlend,
    );
    // The physical aperture and bounded retreat own ADS clearance. Weapon
    // receivers, stocks and hands remain opaque; only semantically named lens
    // materials are clear from model instantiation onward.
    this.root.scale.setScalar(this.unsuppressedViewmodelScale());
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    // HF-410: this gate is a threshold on a PHYSICAL light intensity, and the
    // body fit divides every viewmodel-only intensity by k^2. Left as a bare
    // 0.45 the muzzle flash mesh would never appear again.
    this.muzzleFlash.visible = this.muzzleLight.intensity > viewmodelBodyFitLightIntensity(0.45);
    const arms = this.cachedNamedNode(this.root, 'first-person-arms');
    if (arms) {
      // Keep the licensed chains close to physical scale in ADS. The previous
      // 16% shrink and deep shoulder drop made the long-gun support socket
      // unreachable and could hyperextend the elbow. The capped sleeves stay
      // behind the camera with this shallow, bounded clearance adjustment.
      arms.position.y = THREE.MathUtils.lerp(0.02, 0.012, this.adsBlend);
      arms.position.z = THREE.MathUtils.lerp(0, -0.08, this.adsBlend);
      arms.scale.setScalar(firstPersonArmPresentationScale(this.adsBlend, pose.reloadProgress));
      arms.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const material = node.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        // Do not alpha-fade anatomy in ADS. The previous fade made opaque arms
        // look ghosted/see-through and exposed internal overlap. Pose and scale
        // own the ADS clearance while every visible arm mesh remains opaque.
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
      });
    }

    for (const casing of this.casings) {
      if (!casing.active) continue;
      casing.frames += 1;
      const casingDt = Math.min(pose.dt, 1 / 20);
      casing.life -= casingDt;
      casing.velocity.y -= 4.5 * casingDt;
      casing.mesh.position.addScaledVector(casing.velocity, casingDt);
      casing.mesh.rotation.x += casingDt * 18;
      casing.mesh.rotation.z += casingDt * 11;
      if (casing.life <= 0 && casing.frames >= 3) {
        casing.active = false;
        casing.mesh.visible = false;
      }
    }
    let activeSmoke = 0;
    for (let slot = 0; slot < this.smokes.length; slot += 1) {
      const smoke = this.smokes[slot];
      if (!smoke.active) continue;
      const offset = slot * 3;
      smoke.life -= pose.dt;
      if (smoke.life <= 0) {
        smoke.active = false;
        this.smokePositions[offset + 1] = -10_000;
        this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0;
        continue;
      }
      activeSmoke += 1;
      this.smokePositions[offset] += smoke.velocity.x * pose.dt;
      this.smokePositions[offset + 1] += smoke.velocity.y * pose.dt;
      this.smokePositions[offset + 2] += smoke.velocity.z * pose.dt;
      const fade = Math.min(1, smoke.life / Math.max(0.001, smoke.maxLife) * 1.7) * 0.62;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = fade;
    }
    this.smokePoints.visible = activeSmoke > 0;
    if (activeSmoke > 0) {
      (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }

    const activeModel = this.mountedModel();
    if (activeModel) updateImportedWeapon(activeModel, pose.dt);
    updateImportedWeapon(this.authoredMeleeKnife ?? this.meleeKnife, pose.dt);
    const minigunBarrels = this.cachedNamedNode(this.models.get('minigun'), 'minigun-barrel-cluster');
    if (minigunBarrels) minigunBarrels.rotation.z = this.minigunSpool.angleRadians;
    const profile = weaponFamilyPresentation(this.active);
    const hipYaw = weaponHipYaw(this.active);
    const shotAge = this.debugFireAgeMs ?? performance.now() - this.shotStarted;
    const fireCycle = fireCycleAt(this.active, shotAge, this.weaponHeat);
    this.presentedFireCycle = fireCycle;
    const presentedRecoil = this.debugFireAgeMs === null
      ? this.recoil
      : Math.max(this.recoil, fireCycle.flash * 0.35 + fireCycle.boltTravel * 0.65);
    const presentationKick = Math.max(presentedRecoil, fireCycle.kick * 0.9);
    // HF-388: arm-local recoil. Until now every shot moved only this.root, so
    // the arms were rigid relative to the weapon they hold. A bounded share of
    // the same kick flexes the elbows instead; damped while aiming so the
    // settled ADS sight picture does not start swimming.
    this.armRecoilKickRadians = Math.min(
      FIRST_PERSON_ARM_RECOIL_MAX_POLE_RADIANS,
      presentationKick * FIRST_PERSON_ARM_RECOIL_POLE_GAIN,
    ) * (1 - this.adsBlend * 0.6);
    const shotRoll = fireCycle.kick * (this.shotsPresented % 2 === 0 ? -0.018 : 0.018);
    this.muzzleFlash.visible = fireCycle.flash > 0.015;
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.scale.setScalar(profile.flashScale * (0.78 + fireCycle.flash * 0.42 + fireCycle.kick * 0.12));
    }
    if (this.active === 'scattergun' && this.pendingScattergunShell && fireCycle.casingReady) {
      this.ejectCasing(true);
      this.pendingScattergunShell = false;
    }
    const bolt = this.cachedNamedNode(activeModel, 'bolt-or-slide');
    if (bolt) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      bolt.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }
    const pump = this.cachedNamedNode(activeModel, 'pump');
    if (pump) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      pump.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.12 : pose.prone ? 0.12 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    // HF-388 exactness repair: breath rides the HF-365 arm-motion clock
    // (accumulated, stalled-tab-clamped dt) instead of wall-clock
    // performance.now(). A loaded tab or test runner must not jump the pose -
    // the same invariant the armDt clamp above states - and exact rest-pose
    // presentation contracts sample root Y at one deterministic phase.
    const breath = Math.sin(this.armMotionSeconds * 1.7) * (pose.ads ? 0.0015 : 0.0045);
    const adsX = this.adsBlend * profile.adsX;
    // Each original weapon family declares its physical sight axis. The 0.6
    // view scale is included in the profile so no HUD approximation is used.
    const adsY = this.adsBlend * profile.adsY;
    const adsZ = this.adsBlend * profile.adsZ;
    // HF-388: the visual sprint terms ride the S-curve ease; the raw blend
    // still owns action contracts and stance gating unchanged.
    const sprintPose = viewmodelSprintPoseEase(this.sprintBlend);
    const sprintDrop = sprintPose * -0.28;
    const stanceHipBlend = 1 - this.adsBlend;
    const crouchLift = pose.crouched ? 0.035 * stanceHipBlend : 0;
    const proneLift = (pose.prone ? 0.018 * stanceHipBlend : 0) + (pose.surfaceLift ?? 0);
    // HF-388: authored underdamped equip settle replaces the frame-one-stiff
    // exponential; same -0.52 m bound, now with soft attack and follow-through.
    const switchDrop = (1 - viewmodelEquipBlendAt(this.equipElapsedSeconds)) * -0.52;

    const reloadProgress = pose.reloadProgress ?? 0;
    if (pose.reloadProgress !== null) {
      actionEvents.push(...reloadActionEvents(this.active, this.reloadLastProgress, reloadProgress));
      this.reloadLastProgress = reloadProgress;
    } else if (this.reloadLastProgress > 0) {
      this.reloadLastProgress = 0;
    }
    const reloadStage = viewmodelReloadStageAt(this.active, reloadProgress);
    const reloadPose = reloadPoseAt(this.active, reloadProgress);
    const magazineName = this.active === 'carbine'
      ? 'curved-magazine'
      : this.active === 'lmg'
        ? 'lmg-box-magazine'
      : this.active === 'pistol' || this.active === 'machine-pistol' || this.active === 'magnum'
        ? 'pistol-magazine'
        : 'straight-magazine';
    const magazine = this.cachedNamedNode(activeModel, magazineName);
    if (magazine) {
      if (magazine.userData.restY === undefined) {
        magazine.userData.restX = magazine.position.x;
        magazine.userData.restY = magazine.position.y;
        magazine.userData.restZ = magazine.position.z;
        magazine.userData.restRotationZ = magazine.rotation.z;
      }
      magazine.position.x = Number(magazine.userData.restX) + reloadPose.magazineLateral;
      magazine.position.y = Number(magazine.userData.restY) - reloadPose.magazineDrop;
      magazine.position.z = Number(magazine.userData.restZ) + reloadPose.magazineForward;
      magazine.rotation.z = Number(magazine.userData.restRotationZ) + reloadPose.magazineTwist;
    }
    const reloadShell = this.cachedNamedNode(activeModel, 'reload-shell');
    if (reloadShell) {
      reloadShell.visible = reloadPose.shellVisible;
      reloadShell.position.set(-0.16 + reloadPose.shellTravel * 0.13, -0.13 + reloadPose.shellTravel * 0.035, -0.02);
    }
    if (pump && reloadPose.actionPull > 0) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      pump.position.z = restZ + reloadPose.actionPull * 0.16;
    }
    if (bolt && reloadPose.actionPull > 0) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      bolt.position.z = restZ + reloadPose.actionPull * (this.active === 'smg' ? 0.1 : 0.12);
    }

    if (this.meleeStart > 0) this.meleePresentationFrames += 1;
    const timedMeleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / MELEE_PRESENTATION_MS, 0, 1);
    // A software-rendered frame may take longer than the authored 520 ms arc.
    // Preserve at least three presented frames so a valid knife action cannot
    // disappear entirely while keeping authoritative melee timing unchanged.
    const presentedMeleeProgress = this.meleeStart > 0 && this.meleePresentationFrames <= 3
      ? Math.min(timedMeleeProgress, 0.98)
      : timedMeleeProgress;
    const meleeProgress = this.debugMeleeProgress ?? presentedMeleeProgress;
    const meleeActive = this.debugMeleeProgress !== null || (this.meleeStart > 0 && meleeProgress < 1);
    const meleeArc = meleeActive ? Math.sin(meleeProgress * Math.PI) : 0;
    if (meleeActive) this.root.scale.multiplyScalar(1 + meleeArc * MELEE_VIEWMODEL_PEAK_SCALE_LIFT);
    this.actionContract = characterActionContract({
      weapon: this.active,
      aimBlend: this.adsBlend,
      sprintBlend: this.sprintBlend,
      reloadProgress: pose.reloadProgress,
      meleeProgress: meleeActive ? meleeProgress : null,
    });
    const wasMeleeActive = this.meleePresentationActive;
    const authoredMeleeActive = meleeActive && this.browserRuntime
      && this.riggedArmRigs.length === 2
      && this.authoredMeleeKnife !== null
      && this.authoredMeleeSocket !== null;
    this.poseRiggedFingers(reloadPose, authoredMeleeActive);
    const proceduralMeleeActive = meleeActive && !this.browserRuntime;
    this.meleePresentationActive = meleeActive;
    this.meleePresentationMode = authoredMeleeActive
      ? 'authored-rigged-arms'
      : proceduralMeleeActive ? 'headless-procedural-fallback' : 'inactive';
    this.meleeRig.visible = proceduralMeleeActive;
    this.meleeKnife.visible = authoredMeleeActive || proceduralMeleeActive;
    // A knife is an action presentation, never a permanent off-hand prop. The
    // old passive clone read as a floating knife beside every firearm.
    this.passiveKnife.visible = false;
    if (arms) arms.visible = this.browserRuntime || !meleeActive;
    if (activeModel) activeModel.visible = !meleeActive;
    if (meleeActive) {
      // Pass 65: three-phase stab — short wind-up, hard thrust, eased recover —
      // so the knife returns to rest instead of popping out mid-lunge.
      const windup = THREE.MathUtils.smoothstep(meleeProgress, 0, 0.14);
      const thrust = THREE.MathUtils.smoothstep(meleeProgress, 0.14, 0.44);
      const recover = THREE.MathUtils.smoothstep(meleeProgress, 0.58, 1);
      const drive = thrust * (1 - recover);
      if (authoredMeleeActive) {
        this.poseRiggedMeleeArms(meleeProgress);
      } else if (proceduralMeleeActive) {
        this.proceduralMeleeArmFrames += 1;
        this.meleeRig.position.set(
          0.28 + windup * 0.08 - drive * 0.42,
          -0.12 - windup * 0.07 + drive * 0.24,
          -0.2 + windup * 0.1 - drive * 0.54,
        );
        this.meleeRig.rotation.set(-drive * 0.3, -drive * 0.48, drive * 0.55);
      }
    } else if (wasMeleeActive) {
      this.restoreRiggedArmBindPose();
    }
    const grenadeAction = this.grenadeActionTelemetry();
    const grenadeArc = grenadeAction.arc;

    const viewmodelBaseX = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.x, ADS_VIEWMODEL_BASE_POSITION.x, this.adsBlend);
    const viewmodelBaseY = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.y, ADS_VIEWMODEL_BASE_POSITION.y, this.adsBlend)
      - viewmodelScreenDrop(this.camera)
      // HF-388: the per-grip-family hip lift that brings the welded trigger
      // hand back inside the frame. Zero at full ADS and through the melee arc.
      + firstPersonHipTriggerHandLift(this.active, this.adsBlend, meleeArc);
    const viewmodelBaseZ = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.z, ADS_VIEWMODEL_BASE_POSITION.z, this.adsBlend);
    // Aiming down sights is a real improvement on every weapon: idle bob, breath
    // and mouse sway collapse as the blend completes, so the sight settles on the
    // crosshair with a clear, unobstructed picture instead of drifting around it.
    const aimSteady = 1 - this.adsBlend * 0.86;
    // THE APPLIED RETREAT. This used to be min(demand, 0.28) - a blanket cap
    // that no unit test could see, because every unit test asserted on the
    // reducers, which return the uncapped demand. Measured at HEAD with the
    // eye 0.40 m from a wall: reducers 0.78 m, renderer 0.28 m, carbine muzzle
    // 0.889 m through the wall; the longer sniper travelled 0.14 m and
    // finished further through. Near-plane safety is now solved against the
    // rig's MEASURED bounds instead, so the retreat is whatever the geometry
    // genuinely needs and the fold covers what retreat physically cannot.
    const surfaceRetreatDemand = Math.max(0, pose.surfaceRetreat ?? 0);
    const authoredContactRetreat = authoredNearPlaneContactRetreat(this.active, surfaceRetreatDemand);
    const adsSightPictureRetreat = this.adsBlend * (FIRST_PERSON_ADS_SIGHT_PICTURE_RETREAT[this.active] ?? 0);
    // Root z with no contact retreat at all: the origin the solve measures from.
    const contactFoldBaseZ = viewmodelBaseZ + adsZ - adsSightPictureRetreat
      - VIEWMODEL_NEAR_PLANE_CLEARANCE - authoredContactRetreat;
    this.contactFold = solveViewmodelContactFold({
      bounds: this.measureRigBounds(),
      // HF-410: the solve compares the rig's ROOT-LOCAL bounds against this
      // depth, and the body fit means one rig metre is now
      // VIEWMODEL_BODY_FIT_SCALE world metres. Converting here is what makes
      // the fold measure the fitted rig instead of the rig that used to hang
      // outside the body: it disengages because the geometry genuinely no
      // longer reaches the surface, not because a threshold was moved.
      contactDepthMeters: pose.surfaceContactDepth === null || pose.surfaceContactDepth === undefined
        ? null
        : viewmodelWorldToRigMeters(pose.surfaceContactDepth),
      // The fold keeps the conservative minimum above; the cut is placed by
      // the on-axis depth. Passed through UNDEFAULTED on purpose: `undefined`
      // has to keep meaning "this caller has no separate cut depth", which the
      // solve answers by falling back to `contactDepthMeters` exactly as
      // before, while an explicit `null` means "nothing a plane can represent"
      // and correctly disarms the cut.
      contactCutDepthMeters: pose.surfaceContactCutDepth === undefined
        ? undefined
        : (pose.surfaceContactCutDepth === null
          ? null
          : viewmodelWorldToRigMeters(pose.surfaceContactCutDepth)),
      baseRootZ: contactFoldBaseZ,
      authoredRootZ: contactFoldBaseZ + surfaceRetreatDemand,
      basePitchRadians: this.contactResponse.pitchRadians,
      baseScale: this.unsuppressedViewmodelScale(),
      // HF-410 REPAIR: the fold's near-plane admission is expressed in rig
      // metres and must describe the plane in force on the shipped route
      // (FIRST_PERSON_CAMERA_NEAR_METERS), not the overlay submission's, which
      // never runs. This raises the admission from 0.075 to 0.214 rig metres -
      // strictly more conservative.
      nearPlaneMeters: viewmodelWorldToRigMeters(FIRST_PERSON_CAMERA_NEAR_METERS)
        + VIEWMODEL_NEAR_PLANE_CLEARANCE,
    });
    this.applyViewmodelContactClip();
    this.applyViewmodelSurfaceClip(pose.surfaceClipPlanes);
    // Unmeasured rigs (headless, a model still loading, a weapon with no mesh)
    // keep the historical clamp exactly: this change only moves poses the
    // renderer can actually measure.
    const surfaceRetreatClamped = this.contactFold.engaged
      ? this.contactFold.retreatMeters
      : Math.min(surfaceRetreatDemand, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    // The fire kick plus a full surface retreat can push the viewmodel behind
    // the near plane while prone against a wall; the weapon must stay at least
    // as far from the camera as its near-plane-clear hip position, and the
    // recoil pitch swings the stock back toward the camera, so the cap carries
    // an extra stock-swing allowance during the fire kick. The solved
    // near-plane limit is the measured form of the same rule and wins whenever
    // the rig has been measured.
    const fireNearPlaneCapZ = Math.min(
      this.contactFold.nearPlaneLimitZ + authoredContactRetreat,
      viewmodelBaseZ + surfaceRetreatClamped - adsSightPictureRetreat
        - (presentationKick > 0.05 ? 0.1 : 0),
    );
    // Floor contact must survive the complete action envelope, not only the
    // idle mesh. Counter the authored downward recoil translation and raise a
    // detached magazine by a bounded fraction while it is below the receiver;
    // rotations, grips and action timing remain unchanged.
    const floorActionClearance = this.contactResponse.floorBlend
      * (presentationKick * 0.095 + reloadPose.magazineDrop * 0.65);
    // HF-382: the IDLE STANCE selector must be visible in first person. The
    // selected stance's presentation is lerped in here and applied to the hip
    // viewmodel below. The hip factor gates everything to (1 - ADS)(1 - sprint)
    // (1 - melee), so aiming, sprinting and melee presentations are byte-for-byte
    // what they were before this block existed. Z is never touched: the near-plane
    // admission caps above already own that axis.
    const stanceProfile = FIRST_PERSON_STANCE_PRESENTATIONS[activeOperatorStance()];
    {
      const stanceMix = smoothing(7);
      this.stancePose.dropMeters += (stanceProfile.dropMeters - this.stancePose.dropMeters) * stanceMix;
      this.stancePose.pitchRadians += (stanceProfile.pitchRadians - this.stancePose.pitchRadians) * stanceMix;
      this.stancePose.yawRadians += (stanceProfile.yawRadians - this.stancePose.yawRadians) * stanceMix;
      this.stancePose.rollRadians += (stanceProfile.rollRadians - this.stancePose.rollRadians) * stanceMix;
      this.stancePose.lateralMeters += (stanceProfile.lateralMeters - this.stancePose.lateralMeters) * stanceMix;
    }
    const stanceHip = (1 - this.adsBlend) * (1 - this.sprintBlend) * (1 - meleeArc);
    const targetPosition = this.frameTargetPosition.set(
      viewmodelBaseX + adsX + (bobX + this.swayX) * aimSteady - pose.lateralSpeed * 0.012 * aimSteady + meleeArc * viewmodelMeleeScreenOffset(this.camera) + grenadeArc * 0.18 + reloadStage.lateral
        + this.stancePose.lateralMeters * stanceHip,
      viewmodelBaseY + adsY + (bobY + breath) * aimSteady + sprintDrop + crouchLift + proneLift
        + this.contactResponse.additionalLiftMeters + this.contactResponse.proneFloorGuardMeters - this.contactResponse.additionalDropMeters
        + switchDrop + reloadStage.lift + floorActionClearance
        - presentationKick * 0.095
        // HF-388: the landing dip is now an authored attack-rebound-settle
        // envelope instead of the raw impulse; viewmodelLandDropMetersAt is
        // signed, so the rebound legitimately lifts the viewmodel above rest.
        + viewmodelLandDropMetersAt(this.landAgeSeconds, this.landAmplitude) * aimSteady
        + meleeArc * 0.26
        - this.stancePose.dropMeters * stanceHip,
      Math.min(
        viewmodelBaseZ + adsZ + surfaceRetreatClamped - adsSightPictureRetreat - VIEWMODEL_NEAR_PLANE_CLEARANCE + presentationKick * profile.recoilTranslation * 1.12 + grenadeArc * 0.24,
        fireNearPlaneCapZ,
      ) - authoredContactRetreat,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    // Shrinking the rig buys forward clearance that translation cannot. Applied
    // here so it composes with the per-frame setScalar and the melee lift
    // instead of racing them.
    if (this.contactFold.scale !== 1) this.root.scale.multiplyScalar(this.contactFold.scale);
    this.root.rotation.x = THREE.MathUtils.lerp(
      this.root.rotation.x,
      presentationKick * profile.recoilRotation * 1.15 - this.swayY * aimSteady
        - grenadeArc * 0.42 + reloadStage.pitch + this.contactResponse.pitchRadians
        // The solved fold. Kept as its own term rather than folded into
        // contactResponse: the HF-343 fire admission reads that record, and
        // presentation must not be able to move what the trigger sees.
        + this.contactFold.foldPitchRadians
        + this.stancePose.pitchRadians * stanceHip,
      smoothing(22),
    );
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y,
      hipYaw * (1 - this.adsBlend) - this.swayX * 2 * aimSteady - sprintPose * 0.38
        - meleeArc * 0.18 + this.contactResponse.yawRadians
        + this.stancePose.yawRadians * stanceHip,
      smoothing(13),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(
      this.root.rotation.z,
      reloadStage.roll - sprintPose * 0.22
        - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) * aimSteady
        - meleeArc * 0.42 + shotRoll + this.contactResponse.rollRadians
        + this.stancePose.rollRadians * stanceHip,
      smoothing(13),
    );
    this.applyCompactOpticAdsPresentation(activeModel);
    this.centerSightReference(activeModel);
    if (arms && !meleeActive) this.solveArms(arms, activeModel, reloadPose);
    if (!authoredMeleeActive) this.solveRiggedArms(activeModel, reloadPose);
    // The conservative position cap and authored contact retreat above are the
    // live near-plane contract.
    // Exact skinned bounds remain available to admission/diagnostic probes, but
    // never traverse and deform the complete weapon/arm mesh during gameplay.
    const flamethrowerHeldFireFastPath = this.active === 'flamethrower' && pose.triggerHeld === true;
    const enteringFlamethrowerHeldFireFastPath = flamethrowerHeldFireFastPath
      && !this.flamethrowerHeldFireClearanceFastPathActive;
    const exitingFlamethrowerHeldFireFastPath = !flamethrowerHeldFireFastPath
      && this.flamethrowerHeldFireClearanceFastPathActive;
    if (enteringFlamethrowerHeldFireFastPath) this.flamethrowerHeldFireClearanceEntryTransitions += 1;
    if (exitingFlamethrowerHeldFireFastPath) this.flamethrowerHeldFireClearanceExitTransitions += 1;
    if (flamethrowerHeldFireFastPath && !enteringFlamethrowerHeldFireFastPath) {
      this.flamethrowerHeldFireClearanceSkippedFrames += 1;
    }
    this.flamethrowerHeldFireClearanceFastPathActive = flamethrowerHeldFireFastPath;
    return actionEvents;
  }
}
