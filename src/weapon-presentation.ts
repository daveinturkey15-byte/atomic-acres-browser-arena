import * as THREE from 'three';
import { VIEWMODEL_SHADOW_BUDGET_SCOPE } from './rendering/runtime-shadow-budget';
import { presentationRandom } from './runtime-random';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWeaponModel, optimizeAttachedWeapon, roundedBox, texturedMaterial } from './art-kit';
import {
  scheduleBrowserPreparationIdleTask,
  yieldBrowserPreparationFrame,
} from './browser-preparation-scheduler';
import {
  createFirstPersonRiggedArms,
  firstPersonArmAnimationState,
  loadFirstPersonArmsAsset,
  playFirstPersonArmAction,
  resetFirstPersonArmAnimations,
  resetFirstPersonArmFingers,
  updateFirstPersonArmAnimations,
  type FirstPersonArmChain,
  type FirstPersonFingerBone,
} from './operator-model';
import { solveTwoBoneElbow, solveTwoBoneElbowInto, type TwoBoneElbowScratch } from './ik';
import { reloadActionEvents, reloadPoseAt, viewmodelReloadStageAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
import { advanceAdsBlend, advanceWeaponHeat, fireCycleAt } from './weapon-presentation-state';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import {
  PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
  PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
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
import {
  advanceMinigunSpool,
  createMinigunSpoolState,
  resetMinigunSpool,
  type MinigunSpoolPhase,
} from './minigun-spool';
import { RUNTIME_WEAPON_RETENTION_LIMIT } from './weapon-prewarm-catalog';
import { stableDirectionDelta } from './stable-bone-orientation';

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
  bindShoulderScale: THREE.Vector3;
};
type ViewArmRig = {
  side: 'left' | 'right';
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
  upperLength: number;
  lowerLength: number;
};

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
  'flare-gun': [-0.92, 0.42, -0.68],
};

type ViewmodelGripFamily = 'long-gun' | 'compact' | 'handgun' | 'heavy' | 'crossbow';

function viewmodelGripFamily(weapon: WeaponId): ViewmodelGripFamily {
  if (weapon === 'pistol' || weapon === 'magnum' || weapon === 'machine-pistol' || weapon === 'flashlight-pistol' || weapon === 'flare-gun') return 'handgun';
  if (weapon === 'smg' || weapon === 'mini-uzi' || weapon === 'mp5') return 'compact';
  if (weapon === 'lmg' || weapon === 'minigun' || weapon === 'flamethrower') return 'heavy';
  if (weapon === 'explosive-crossbow') return 'crossbow';
  return 'long-gun';
}

type FingerCurlProfile = Readonly<Record<FirstPersonFingerBone['digit'], readonly [number, number, number]>>;
// Preserve the evaluated per-digit source-authoring poses. A generic curl and
// per-digit multiplier left the firing index almost straight, closed the thumb
// too far, and spread the firing hand even though only the C-clamp support hand
// is authored with lateral separation. The exact profiles make the visible
// glove close around the grip rather than merely putting its palm on a socket.
const FINGER_FIRE_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.28, -0.46, -0.34],
  middle: [-0.42, -0.70, -0.52],
  ring: [-0.46, -0.76, -0.56],
  pinky: [-0.50, -0.82, -0.60],
  thumb: [-0.20, -0.34, -0.24],
});
const FINGER_SUPPORT_CURL: FingerCurlProfile = Object.freeze({
  index: [-0.07, -0.24, -0.20],
  middle: [-0.10, -0.30, -0.24],
  ring: [-0.13, -0.36, -0.28],
  pinky: [-0.16, -0.42, -0.32],
  thumb: [0.10, -0.18, -0.12],
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
/** Unit -Z blade axis reused by the per-frame melee knife alignment. */
const KNIFE_BLADE_AXIS = Object.freeze(new THREE.Vector3(0, 0, -1));
export const HIP_VIEWMODEL_POSITION = Object.freeze({ x: 0.34, y: -0.44, z: -1.08 });
export const HIP_VIEWMODEL_SCALE = 0.82;
/** Camera-space Z clearance preventing thicker arm geometry from crossing the near plane. */
export const VIEWMODEL_NEAR_PLANE_CLEARANCE = 0.06;
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

function tuneAuthoredFirstPersonArmMaterials(root: THREE.Object3D, flattenMaterials: boolean): void {
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
    const name = material.name.toLowerCase();
    if (name.includes('arms_sleeve')) {
      material.emissive.setHex(0x3b4542);
      material.emissiveIntensity = flattenMaterials ? 0.24 : 0.34;
    } else if (name.includes('arms_glove') || name.includes('arms_fingerglove')) {
      material.emissive.setHex(0x454945);
      material.emissiveIntensity = flattenMaterials ? 0.26 : 0.36;
    } else if (name.includes('arms_armorpad') || name.includes('wristaccent')) {
      material.emissive.setHex(0x3f4945);
      material.emissiveIntensity = flattenMaterials ? 0.28 : 0.38;
    } else if (name === 'skin') {
      material.emissive.setHex(0x3a3430);
      material.emissiveIntensity = flattenMaterials ? 0.2 : 0.28;
    } else {
      continue;
    }
    adjusted += 1;
  }
  root.userData.armMaterialPresentationContract = 'authored-pbr-muted-emissive-warm-key-v1';
  root.userData.armMaterialPresentationAdjusted = adjusted;
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
  readonly root = new THREE.Group();

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
  private switchBlend = 1;
  private swayX = 0;
  private swayY = 0;
  private meleeStart = 0;
  private meleePresentationFrames = 0;
  private debugMeleeProgress: number | null = null;
  private grenadeStart = 0;
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
  private riggedArmDiagnostics: Array<Record<string, unknown>> = [];
  private nextRiggedArmDiagnosticsAt = 0;
  private readonly riggedArmSolveScratch = {
    cameraRotation: new THREE.Quaternion(),
    target: new THREE.Vector3(),
    socketTarget: new THREE.Vector3(),
    shoulderPosition: new THREE.Vector3(),
    elbowPosition: new THREE.Vector3(),
    wristPosition: new THREE.Vector3(),
    bendHint: new THREE.Vector3(),
    elbowTarget: new THREE.Vector3(),
    handDirection: new THREE.Vector3(),
    handTarget: new THREE.Vector3(),
    wristTarget: new THREE.Vector3(),
    solvedWrist: new THREE.Vector3(),
    palmWorld: new THREE.Vector3(),
    palmWrist: new THREE.Vector3(),
    palmDigitBase: new THREE.Vector3(),
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
    gripEuler: new THREE.Euler(),
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
    this.root.name = 'original-weapon-view';
    this.root.position.set(HIP_VIEWMODEL_POSITION.x, HIP_VIEWMODEL_POSITION.y, HIP_VIEWMODEL_POSITION.z);
    this.root.scale.setScalar(HIP_VIEWMODEL_SCALE);
    camera.add(this.root);
    this.viewmodelFill = new THREE.PointLight(0xfff0dc, 0, 3.2, 2);
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
    this.viewmodelFill.userData.authoredIntensity = flattenMaterials ? 0 : 11.75;
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
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 4.5, 2);
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

  async load(
    onProgress?: (loaded: number, total: number) => void,
    options: WeaponPresentationLoadOptions = {},
  ): Promise<void> {
    const browserRuntime = typeof document !== 'undefined';
    const assetOnly = browserRuntime && options.mode === 'asset-only';
    const initialWeapon = this.active;
    if (assetOnly) this.setPresentationVisible(false);
    if (browserRuntime) {
      await Promise.all([
        loadPass65WeaponPresentation(initialWeapon, 'first-person'),
        loadPass65FieldKnifeAsset('first-person'),
        loadFirstPersonArmsAsset(),
      ]);
      const authoredArms = createFirstPersonRiggedArms(this.flattenMaterials);
      if (!authoredArms || authoredArms.chains.length !== 2) {
        throw new Error('Pass 65 authored first-person arms failed the two-chain release contract');
      }
      tuneAuthoredFirstPersonArmMaterials(authoredArms.root, this.flattenMaterials);
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
          bindShoulderScale: chain.shoulder.scale.clone(),
        });
      }
      this.riggedFingerBones.push(...authoredArms.fingers);
      this.authoredArmsRoot = authoredArms.root;
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
      this.updateActiveSockets(id);
      fireImportedWeapon(model);
      updateImportedWeapon(model, 1 / 60);
      this.muzzleFlash.visible = true;
      this.muzzleLight.visible = true;
      this.muzzleLight.intensity = 1;
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
    this.switchBlend = immediate ? 1 : 0;
    this.reloadLastProgress = 0;
    this.pendingScattergunShell = false;
    const activeModel = this.models.get(id);
    if (activeModel && this.modelIsGpuReady(activeModel)) {
      for (const [weaponId, model] of this.models) model.visible = weaponId === id;
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

  setPresentationVisible(visible: boolean): void {
    if (this.fullscreenPresentationSuppressed) {
      this.fullscreenPresentationSuppressed = false;
      this.root.scale.setScalar(
        THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend)
          * viewmodelScreenScale(this.camera),
      );
    }
    this.root.visible = visible;
    this.viewmodelFill.intensity = visible
      ? Number(this.viewmodelFill.userData.authoredIntensity ?? 0)
      : 0;
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
      : THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend) * viewmodelScreenScale(this.camera));
    this.viewmodelFill.intensity = suppressed
      ? 0
      : Number(this.viewmodelFill.userData.authoredIntensity ?? 0);
    if (suppressed) this.muzzleLight.intensity = 0;
  }

  suppressForSniperScope(suppressed: boolean): void {
    this.suppressForFullscreenPresentation(suppressed);
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
    this.switchBlend = 1;
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

    const surfaceRetreatClamped = Math.min(surfaceRetreat, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    this.root.position.set(
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y,
      // The wall retreat is capped at the near-plane-safe distance: pushing
      // the weapon further back would drive the arms/stock through the near
      // plane and fail the prone framing contract.
      HIP_VIEWMODEL_POSITION.z + surfaceRetreatClamped - VIEWMODEL_NEAR_PLANE_CLEARANCE
        - authoredNearPlaneContactRetreat(this.active, surfaceRetreatClamped),
    );
    this.root.rotation.set(0, weaponHipYaw(this.active), 0);
    this.root.scale.setScalar(HIP_VIEWMODEL_SCALE);
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
    const bolt = activeModel?.getObjectByName('bolt-or-slide');
    if (bolt) bolt.position.z = Number(bolt.userData.restZ ?? 0);
    const pump = activeModel?.getObjectByName('pump');
    if (pump) pump.position.z = Number(pump.userData.restZ ?? -0.48);
    const magazineName = this.active === 'carbine'
      ? 'curved-magazine'
      : this.active === 'lmg'
        ? 'lmg-box-magazine'
        : this.active === 'pistol' || this.active === 'machine-pistol' || this.active === 'magnum'
          ? 'pistol-magazine'
          : 'straight-magazine';
    const magazine = activeModel?.getObjectByName(magazineName);
    if (magazine?.userData.restY !== undefined) {
      magazine.position.set(
        Number(magazine.userData.restX),
        Number(magazine.userData.restY),
        Number(magazine.userData.restZ),
      );
      magazine.rotation.z = Number(magazine.userData.restRotationZ);
    }
    const reloadShell = activeModel?.getObjectByName('reload-shell');
    if (reloadShell) reloadShell.visible = false;
    const arms = this.root.getObjectByName('first-person-arms');
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
    this.root.updateWorldMatrix(true, true);
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
      if (model) model.visible = true;
    }
    const activeModel = this.mountedModel();
    if (activeModel) fireImportedWeapon(activeModel);
    if (this.authoredArmsRoot) playFirstPersonArmAction(this.authoredArmsRoot, 'fire');
    const profile = weaponFamilyPresentation(this.active);
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, true, 0, this.active);
    this.shotsPresented += 1;
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.shotStarted = performance.now();
    this.muzzleLight.intensity = this.flattenMaterials ? 0 : 4.8 * WEAPONS[this.active].muzzleFlashScale;
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
    const arms = this.root.getObjectByName('first-person-arms');
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

  addMouseDelta(x: number, y: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX + x * 0.00008, -0.025, 0.025);
    this.swayY = THREE.MathUtils.clamp(this.swayY + y * 0.00006, -0.02, 0.02);
  }

  muzzleWorldPosition(target = new THREE.Vector3()): THREE.Vector3 | null {
    const socket = this.mountedModel()?.getObjectByName('muzzle-socket');
    return socket ? socket.getWorldPosition(target) : null;
  }

  adsProgress(): number {
    return this.adsBlend;
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
    return (this.active === 'carbine'
      ? model?.getObjectByName('optic-socket') ?? model?.getObjectByName('optic-reticle')
      : model?.getObjectByName('rear-sight-socket'))
      ?? model?.getObjectByName('rear-sight-socket')
      ?? sightNames.map((name) => model?.getObjectByName(name)).find((sight) => sight !== undefined);
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
    const arms = this.root.getObjectByName('first-person-arms');
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
          contract: 'camera-ndc-centre-reticle-window-rays-v2',
          rayCount: 9,
          ndcRadius,
          blockedRays: 0,
          maximumHits: 0,
          meshes: [] as string[],
        };
      }
      model.updateWorldMatrix(true, true);
      const offsets = [
        [0, 0],
        [-ndcRadius, 0], [ndcRadius, 0], [0, -ndcRadius], [0, ndcRadius],
        [-0.014, -0.014], [-0.014, 0.014], [0.014, -0.014], [0.014, 0.014],
      ] as const;
      const raycaster = new THREE.Raycaster();
      raycaster.layers.mask = this.camera.layers.mask;
      raycaster.near = this.camera instanceof THREE.PerspectiveCamera ? this.camera.near : 0;
      raycaster.far = this.camera instanceof THREE.PerspectiveCamera ? this.camera.far : Number.POSITIVE_INFINITY;
      const samples = offsets.map(([x, y]) => {
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
        return { count: hits.length, meshes: hits.map((hit) => hit.object.name) };
      });
      return {
        contract: 'camera-ndc-centre-reticle-window-rays-v2',
        rayCount: samples.length,
        ndcRadius,
        blockedRays: samples.filter((sample) => sample.count > 0).length,
        maximumHits: samples.reduce((maximum, sample) => Math.max(maximum, sample.count), 0),
        meshes: [...new Set(samples.flatMap((sample) => sample.meshes))],
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
      armFraming: arms?.visible
        ? measureCameraFraming(arms, this.camera, isAuthoredArmMesh)
        : null,
      weaponFraming: model?.visible ? measureCameraFraming(model, this.camera) : null,
      meleeKnifeFraming: this.meleeKnife.visible ? measureCameraFraming(this.meleeKnife, this.camera) : null,
      viewmodelViewport: {
        aspect: this.camera instanceof THREE.PerspectiveCamera ? this.camera.aspect : null,
        fov: this.camera instanceof THREE.PerspectiveCamera ? this.camera.fov : null,
        scaleMultiplier: viewmodelScreenScale(this.camera),
        rootScale: this.root.scale.x,
        rootPosition: this.root.position.toArray(),
        rootRotation: [this.root.rotation.x, this.root.rotation.y, this.root.rotation.z],
      },
      actionContract: this.actionContract,
      surfaceRetreat: this.surfaceRetreat,
      surfaceLift: this.surfaceLift,
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
      const socket = activeModel.getObjectByName(socketName);
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
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) targetWorld.lerp(resolveSocketWorld(reloadSocket), reloadPose.handToReload);
      }
      const targetInArms = arms.worldToLocal(targetWorld.clone());
      const hint = new THREE.Vector3(rig.side === 'left' ? -0.48 : 0.48, -1, 0.22);
      const elbowPoint = solveTwoBoneElbow(rig.shoulder.position, targetInArms, rig.upperLength, rig.lowerLength, hint);
      const upperDirection = elbowPoint.sub(rig.shoulder.position).normalize();
      rig.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), upperDirection);
      rig.elbow.position.set(0, 0, -rig.upperLength);
      rig.shoulder.updateWorldMatrix(true, true);
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
      rig.elbow.updateWorldMatrix(true, true);
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
    bone.updateWorldMatrix(false, true);
  }

  /**
   * Match the anatomical contact anchor used by the Blender authoring pass.
   * A wrist joint is at the cuff, not in the centre of the glove: solving the
   * wrist directly onto a weapon socket buries the palm beyond the receiver
   * and leaves only fingertips visible. The mean proximal-digit base, extended
   * 45% beyond the wrist, tracks the real metacarpal centre of this rig.
   */
  private riggedPalmWorld(rig: RiggedViewArm, target: THREE.Vector3): THREE.Vector3 {
    const scratch = this.riggedArmSolveScratch;
    target.set(0, 0, 0);
    let digitBaseCount = 0;
    for (const finger of this.riggedFingerBones) {
      if (finger.side !== rig.side || finger.joint !== 1) continue;
      target.add(finger.bone.getWorldPosition(scratch.palmDigitBase));
      digitBaseCount += 1;
    }
    const wrist = rig.wrist.getWorldPosition(scratch.palmWrist);
    if (digitBaseCount === 0) return target.copy(wrist);
    return target.multiplyScalar(1 / digitBaseCount).sub(wrist).multiplyScalar(1.45).add(wrist);
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
      rig.shoulder.scale.copy(rig.bindShoulderScale);
    }
    const restored = this.riggedArmRigs.every((rig) => (
      rig.shoulder.quaternion.equals(rig.bindShoulder)
      && rig.elbow.quaternion.equals(rig.bindElbow)
      && rig.wrist.quaternion.equals(rig.bindWrist)
      && rig.shoulder.position.equals(rig.bindShoulderPosition)
      && rig.shoulder.scale.equals(rig.bindShoulderScale)
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
      if (left) {
        // The knife action is one-handed. The combined-material arm skins do
        // not provide a per-side visibility node, so move the complete support
        // chain outside the camera before collapsing it. This avoids the torn
        // floating sleeve produced when its natural authoring-camera stow was
        // evaluated through the live viewmodel root.
        left.shoulder.position.set(
          left.bindShoulderPosition.x + 40,
          left.bindShoulderPosition.y,
          left.bindShoulderPosition.z,
        );
        left.shoulder.scale.setScalar(0.001);
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
      const grip = this.authoredMeleeKnife.getObjectByName('grip-socket-r');
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
      supportChainPolicy: rig.side === 'left' ? 'one-hand-action-stowed-outside-frustum-v1' : null,
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
    for (const rig of this.riggedArmRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const target = socket.getWorldPosition(scratch.target);
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) target.lerp(reloadSocket.getWorldPosition(scratch.handTarget), reloadPose.handToReload);
      }
      const shoulderPosition = rig.shoulder.getWorldPosition(scratch.shoulderPosition);
      const elbowPosition = rig.elbow.getWorldPosition(scratch.elbowPosition);
      const wristPosition = rig.wrist.getWorldPosition(scratch.wristPosition);
      const upperLength = shoulderPosition.distanceTo(elbowPosition);
      const lowerLength = elbowPosition.distanceTo(wristPosition);
      const socketTarget = scratch.socketTarget.copy(target);
      const physicalReach = upperLength + lowerLength;
      const socketReach = shoulderPosition.distanceTo(socketTarget);
      const socketReachRatio = socketReach / Math.max(physicalReach, 1e-6);
      const calibratedReach = physicalReach * RIGGED_ARM_MAX_REACH_RATIO;
      let gripSocketCalibration = 0;
      const bendHint = scratch.bendHint.set(rig.side === 'left' ? -0.7 : 0.7, -1, 0.25).applyQuaternion(cameraRotation);
      const handDirection = scratch.handDirection.set(
        rig.side === 'left' ? 0.2 : 0.08,
        rig.side === 'left' ? -0.08 : -0.28,
        -1,
      ).normalize();
      const gripRotation = WEAPON_HAND_ROTATIONS[this.active][rig.side];
      scratch.gripEuler.set(
        gripRotation[0] * 0.24,
        gripRotation[1] * 0.24,
        gripRotation[2] * 0.24,
        'XYZ',
      );
      handDirection.applyEuler(scratch.gripEuler).applyQuaternion(cameraRotation);

      // Iterate the wrist endpoint until the actual palm, rather than the cuff
      // joint, meets the authored weapon socket. This mirrors the source-asset
      // contact solve and keeps sleeves behind the controls at hip, ADS and
      // reload poses. All corrections remain bounded by the physical chain.
      const wristTarget = scratch.wristTarget.copy(socketTarget);
      for (let iteration = 0; iteration < 4; iteration += 1) {
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
        this.riggedPalmWorld(rig, scratch.palmWorld);
        const correction = scratch.palmCorrection.copy(socketTarget).sub(scratch.palmWorld);
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
      const solvedWrist = rig.wrist.getWorldPosition(scratch.solvedWrist);
      const solvedPalm = this.riggedPalmWorld(rig, scratch.diagnosticPalm);
      const reachRatio = shoulderPosition.distanceTo(wristTarget) / Math.max(upperLength + lowerLength, 1e-6);
      if (!diagnostics) continue;
      diagnostics.push({
        side: rig.side,
        weapon: this.active,
        gripFamily: viewmodelGripFamily(this.active),
        socket: socketName,
        socketTarget: socketTarget.toArray(),
        socketReachRatio,
        gripSocketCalibration,
        upperLength,
        lowerLength,
        shoulder: rig.shoulder.getWorldPosition(scratch.diagnosticShoulder).toArray(),
        elbow: rig.elbow.getWorldPosition(scratch.diagnosticElbow).toArray(),
        wrist: rig.wrist.getWorldPosition(scratch.diagnosticWrist).toArray(),
        palm: solvedPalm.toArray(),
        target: socketTarget.toArray(),
        wristTarget: wristTarget.toArray(),
        contactAnchor: 'mean-digit-base-palm-v1',
        contactError: solvedPalm.distanceTo(socketTarget),
        wristContactError: solvedWrist.distanceTo(wristTarget),
        reachRatio,
        withinStableReach: reachRatio <= 1.001,
        bindOffsetsPreserved: true,
        finite: [...socketTarget.toArray(), ...wristTarget.toArray(), ...solvedWrist.toArray(), ...solvedPalm.toArray(), ...elbowTarget.toArray()].every(Number.isFinite),
        shoulderQuaternion: rig.shoulder.quaternion.toArray(),
        elbowQuaternion: rig.elbow.quaternion.toArray(),
      });
    }
    if (diagnostics) this.riggedArmDiagnostics = diagnostics;
  }

  update(pose: WeaponPose): WeaponActionEvent[] {
    const actionEvents: WeaponActionEvent[] = [];
    const smoothing = (rate: number) => 1 - Math.exp(-rate * pose.dt);
    if (this.authoredArmsRoot) {
      resetFirstPersonArmFingers(this.riggedFingerBones);
      updateFirstPersonArmAnimations(this.authoredArmsRoot, pose.dt);
    }
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, false, pose.dt, this.active);
    advanceMinigunSpool(this.minigunSpool, {
      dt: pose.dt,
      triggerHeld: pose.triggerHeld === true,
      equipped: this.active === 'minigun',
    });
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, smoothing(16));
    this.muzzleLight.intensity = THREE.MathUtils.lerp(this.muzzleLight.intensity, 0, smoothing(30));
    this.switchBlend = THREE.MathUtils.lerp(this.switchBlend, 1, smoothing(10));
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, smoothing(7));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, smoothing(7));
    this.adsBlend = advanceAdsBlend(this.adsBlend, pose.ads, pose.dt, this.active);
    // The physical aperture and bounded retreat own ADS clearance. Weapon
    // receivers, stocks and hands remain opaque; only semantically named lens
    // materials are clear from model instantiation onward.
    this.root.scale.setScalar(THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend) * viewmodelScreenScale(this.camera));
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    this.muzzleFlash.visible = this.muzzleLight.intensity > 0.45;
    const arms = this.root.getObjectByName('first-person-arms');
    if (arms) {
      // Keep the licensed chains close to physical scale in ADS. The previous
      // 16% shrink and deep shoulder drop made the long-gun support socket
      // unreachable and could hyperextend the elbow. The capped sleeves stay
      // behind the camera with this shallow, bounded clearance adjustment.
      arms.position.y = THREE.MathUtils.lerp(0.02, 0.012, this.adsBlend);
      arms.position.z = THREE.MathUtils.lerp(0, -0.08, this.adsBlend);
      arms.scale.setScalar(THREE.MathUtils.lerp(1.24, 1.18, this.adsBlend));
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
    const minigunBarrels = this.models.get('minigun')?.getObjectByName('minigun-barrel-cluster');
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
    const shotRoll = fireCycle.kick * (this.shotsPresented % 2 === 0 ? -0.018 : 0.018);
    this.muzzleFlash.visible = fireCycle.flash > 0.015;
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.scale.setScalar(profile.flashScale * (0.78 + fireCycle.flash * 0.42 + fireCycle.kick * 0.12));
    }
    if (this.active === 'scattergun' && this.pendingScattergunShell && fireCycle.casingReady) {
      this.ejectCasing(true);
      this.pendingScattergunShell = false;
    }
    const bolt = activeModel?.getObjectByName('bolt-or-slide');
    if (bolt) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      bolt.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }
    const pump = activeModel?.getObjectByName('pump');
    if (pump) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      pump.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.12 : pose.prone ? 0.12 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    const breath = Math.sin(performance.now() * 0.0017) * (pose.ads ? 0.0015 : 0.0045);
    const adsX = this.adsBlend * profile.adsX;
    // Each original weapon family declares its physical sight axis. The 0.6
    // view scale is included in the profile so no HUD approximation is used.
    const adsY = this.adsBlend * profile.adsY;
    const adsZ = this.adsBlend * profile.adsZ;
    const sprintDrop = this.sprintBlend * -0.16;
    const stanceHipBlend = 1 - this.adsBlend;
    const crouchLift = pose.crouched ? 0.035 * stanceHipBlend : 0;
    const proneLift = (pose.prone ? 0.018 * stanceHipBlend : 0) + (pose.surfaceLift ?? 0);
    const switchDrop = (1 - this.switchBlend) * -0.34;

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
    const magazine = activeModel?.getObjectByName(magazineName);
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
    const reloadShell = activeModel?.getObjectByName('reload-shell');
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
    const grenadeProgress = THREE.MathUtils.clamp((performance.now() - this.grenadeStart) / 620, 0, 1);
    const grenadeArc = this.grenadeStart > 0 && grenadeProgress < 1 ? Math.sin(grenadeProgress * Math.PI) : 0;

    const viewmodelBaseX = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.x, ADS_VIEWMODEL_BASE_POSITION.x, this.adsBlend);
    const viewmodelBaseY = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.y, ADS_VIEWMODEL_BASE_POSITION.y, this.adsBlend)
      - viewmodelScreenDrop(this.camera);
    const viewmodelBaseZ = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.z, ADS_VIEWMODEL_BASE_POSITION.z, this.adsBlend);
    // Aiming down sights is a real improvement on every weapon: idle bob, breath
    // and mouse sway collapse as the blend completes, so the sight settles on the
    // crosshair with a clear, unobstructed picture instead of drifting around it.
    const aimSteady = 1 - this.adsBlend * 0.86;
    const surfaceRetreatClamped = Math.min(pose.surfaceRetreat ?? 0, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    const authoredContactRetreat = authoredNearPlaneContactRetreat(this.active, surfaceRetreatClamped);
    const adsSightPictureRetreat = this.adsBlend * (FIRST_PERSON_ADS_SIGHT_PICTURE_RETREAT[this.active] ?? 0);
    // The fire kick plus a full surface retreat can push the viewmodel behind
    // the near plane while prone against a wall; the weapon must stay at least
    // as far from the camera as its near-plane-clear hip position, and the
    // recoil pitch swings the stock back toward the camera, so the cap carries
    // an extra stock-swing allowance during the fire kick.
    const fireNearPlaneCapZ = viewmodelBaseZ + surfaceRetreatClamped - adsSightPictureRetreat
      - (presentationKick > 0.05 ? 0.1 : 0);
    const targetPosition = this.frameTargetPosition.set(
      viewmodelBaseX + adsX + (bobX + this.swayX) * aimSteady - pose.lateralSpeed * 0.012 * aimSteady + meleeArc * viewmodelMeleeScreenOffset(this.camera) + grenadeArc * 0.18 + reloadStage.lateral,
      viewmodelBaseY + adsY + (bobY + breath) * aimSteady + sprintDrop + crouchLift + proneLift + switchDrop + reloadStage.lift - presentationKick * 0.095 - pose.landingImpulse * 0.075 * aimSteady + meleeArc * 0.26,
      Math.min(
        viewmodelBaseZ + adsZ + surfaceRetreatClamped - adsSightPictureRetreat - VIEWMODEL_NEAR_PLANE_CLEARANCE + presentationKick * profile.recoilTranslation * 1.12 + grenadeArc * 0.24,
        fireNearPlaneCapZ,
      ) - authoredContactRetreat,
    );
    this.surfaceRetreat = pose.surfaceRetreat ?? 0;
    this.surfaceLift = pose.surfaceLift ?? 0;
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, presentationKick * profile.recoilRotation * 1.15 - this.swayY * aimSteady - grenadeArc * 0.42 + reloadStage.pitch, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y,
      hipYaw * (1 - this.adsBlend) - this.swayX * 2 * aimSteady - this.sprintBlend * 0.38 - meleeArc * 0.18,
      smoothing(13),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadStage.roll - this.sprintBlend * 0.22 - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) * aimSteady - meleeArc * 0.42 + shotRoll, smoothing(13));
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
