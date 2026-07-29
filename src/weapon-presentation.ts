import * as THREE from 'three';
import { VIEWMODEL_SHADOW_BUDGET_SCOPE } from './rendering/runtime-shadow-budget';
import { presentationRandom } from './runtime-random';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWeaponModel, optimizeAttachedWeapon, roundedBox, texturedMaterial } from './art-kit';
import {
  createFirstPersonRiggedArms,
  firstPersonArmAnimationState,
  loadFirstPersonArmsAsset,
  playFirstPersonArmAction,
  resetFirstPersonArmFingers,
  updateFirstPersonArmAnimations,
  type FirstPersonArmChain,
  type FirstPersonFingerBone,
} from './operator-model';
import { solveTwoBoneElbow } from './ik';
import { reloadActionEvents, reloadPoseAt, viewmodelReloadStageAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
import { advanceAdsBlend, advanceWeaponHeat, fireCycleAt } from './weapon-presentation-state';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import {
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
type MeleeBonePose = Readonly<{
  windup: readonly [number, number, number];
  thrust: readonly [number, number, number];
}>;

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
};

type ViewmodelGripFamily = 'long-gun' | 'compact' | 'handgun' | 'heavy' | 'crossbow';

function viewmodelGripFamily(weapon: WeaponId): ViewmodelGripFamily {
  if (weapon === 'pistol' || weapon === 'magnum' || weapon === 'machine-pistol' || weapon === 'flashlight-pistol') return 'handgun';
  if (weapon === 'smg' || weapon === 'mini-uzi' || weapon === 'mp5') return 'compact';
  if (weapon === 'lmg' || weapon === 'minigun') return 'heavy';
  if (weapon === 'explosive-crossbow') return 'crossbow';
  return 'long-gun';
}

const FINGER_CURL_JOINTS = Object.freeze([0.27, 0.54, 0.46] as const);
const FINGER_RELOAD_CURL_JOINTS = Object.freeze([0.2, 0.34, 0.24] as const);
const FINGER_MELEE_CURL_JOINTS = Object.freeze([0.16, 0.25, 0.18] as const);
const FINGER_CURL_DIGIT_SCALE: Readonly<Record<FirstPersonFingerBone['digit'], number>> = Object.freeze({
  index: 0.72,
  middle: 1,
  ring: 1.08,
  pinky: 1.16,
  thumb: 0.68,
});
const FINGER_SPREAD: Readonly<Record<FirstPersonFingerBone['digit'], number>> = Object.freeze({
  index: -0.026,
  middle: -0.008,
  ring: 0.012,
  pinky: 0.03,
  thumb: -0.05,
});
const MELEE_ARM_POSES: Readonly<Record<'rightShoulder' | 'rightElbow' | 'rightWrist', MeleeBonePose>> = Object.freeze({
  rightShoulder: { windup: [0.04, -0.05, 0.08], thrust: [-0.08, -0.1, 0.14] },
  rightElbow: { windup: [-0.06, 0.02, -0.03], thrust: [-0.12, 0.01, -0.06] },
  rightWrist: { windup: [-0.04, -0.02, 0.06], thrust: [-0.08, -0.03, 0.1] },
});

function weaponFingerCurlScale(weapon: WeaponId, finger: FirstPersonFingerBone): number {
  const family = viewmodelGripFamily(weapon);
  const sideScale = finger.side === 'right'
    ? 1
    : family === 'handgun' ? 1.18 : family === 'compact' ? 0.92 : family === 'heavy' ? 0.86 : family === 'crossbow' ? 0.94 : 0.82;
  // Keep the trigger index readable instead of wrapping every digit into one
  // mitten silhouette. Remaining firing-hand digits close around the grip.
  const triggerScale = finger.side === 'right' && finger.digit === 'index' ? 0.42 : 1;
  return sideScale * triggerScale * FINGER_CURL_DIGIT_SCALE[finger.digit];
}

// Pass 65: matches the 520 ms third-person melee window so first-person and
// remote observers see the same stab duration.
const MELEE_PRESENTATION_MS = 520;
export const HIP_VIEWMODEL_POSITION = Object.freeze({ x: 0.4, y: -0.42, z: -1.02 });
export const HIP_VIEWMODEL_SCALE = 0.54;
const ADS_VIEWMODEL_BASE_POSITION = Object.freeze({ x: 0.28, y: -0.34, z: -0.97 });
const ADS_VIEWMODEL_SCALE = 0.64;

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

/** Original first-person weapon presentation with ADS, sprint, recoil, melee and staged reload motion. */
export class WeaponPresentation {
  static readonly MAX_RETAINED_WEBGPU_WEAPONS = RUNTIME_WEAPON_RETENTION_LIMIT;
  readonly root = new THREE.Group();
  private readonly browserRuntime: boolean;
  private readonly models = new Map<WeaponId, THREE.Object3D>();
  private readonly modelLastUsed = new Map<WeaponId, number>();
  private readonly gpuReadyModels = new WeakSet<THREE.Object3D>();
  private readonly gpuPrewarmPromises = new WeakMap<THREE.Object3D, Promise<void>>();
  private browserCatalogPrewarmPromise: Promise<void> | null = null;
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
  private readonly weaponFlashlight: THREE.SpotLight;
  private readonly weaponFlashlightTarget: THREE.Object3D;
  private flashlightGpuPrewarmCount = 0;
  private lastBrowserCatalogPrewarmProfile: Readonly<{
    requested: number;
    newlyCreated: number;
    assetLoadMs: number;
    modelCreateMs: number;
    gpuPrewarmMs: number;
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
  private readonly meleePoseEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  private readonly meleePoseQuaternion = new THREE.Quaternion();
  private readonly meleeGripWorld = new THREE.Vector3();
  private readonly meleeSocketWorld = new THREE.Vector3();
  private authoredArmsRoot: THREE.Group | null = null;
  private riggedArmDiagnostics: Array<Record<string, unknown>> = [];
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
  private surfaceRetreat = 0;
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
    const viewmodelFill = new THREE.PointLight(0xe6f2ef, flattenMaterials ? 0 : 1.05, 2.6, 2);
    viewmodelFill.name = 'first-person-viewmodel-fill';
    viewmodelFill.position.set(-0.48, 0.72, 0.4);
    viewmodelFill.castShadow = false;
    viewmodelFill.userData.presentationOnly = true;
    this.root.add(viewmodelFill);

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
    // The complete viewmodel root is deliberately reduced, so retain physical
    // authority while scaling the presentation around its aligned grip socket.
    this.meleeKnife.scale.setScalar(2.25);

    exportedWristSocket.userData.authoredRigAttachment = true;
    exportedWristSocket.add(this.meleeKnife);
    this.meleeKnife.add(authoredKnife);

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
    this.authoredMeleeKnife = authoredKnife;
    this.authoredMeleeSocket = exportedWristSocket;
    this.meleeKnife.userData.projectOriginalMeleeWeapon = true;
    this.meleeKnife.userData.authoredGripSocket = authoredGrip.name;
    this.meleeKnife.visible = false;
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const browserRuntime = typeof document !== 'undefined';
    const initialWeapon = this.active;
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
      const idleCallback = (window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (typeof idleCallback === 'function') idleCallback.call(window, prewarmDropKnife, { timeout: 2_000 });
      else globalThis.setTimeout(prewarmDropKnife, 0);
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
      const model = browserRuntime
        ? id === 'explosive-crossbow'
          ? createPass65CrossbowModel(this.flattenMaterials, 'first-person')
          : createPass65WeaponModel(id, this.flattenMaterials, 'first-person')
        : buildWeaponModel(id, this.flattenMaterials, false);
      if (!model) throw new Error(`Pass 65 first-person asset unavailable: ${id}`);
      if (!browserRuntime && id !== 'explosive-crossbow') model.userData.firstPersonSource = 'test-only-procedural-fallback';
      const firstPersonHidden: Record<WeaponId, Set<string>> = {
        carbine: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        smg: new Set(['smg-stock-rod', 'wire-stock-pad']),
        lmg: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        scattergun: new Set(['stock', 'stock-cheek-panel']),
        sniper: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        railgun: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        pistol: new Set(),
        magnum: new Set(),
        'machine-pistol': new Set(),
        'mini-uzi': new Set(['smg-stock-rod', 'wire-stock-pad', 'mini-uzi-compact-stock']),
        mp5: new Set(['smg-stock-rod', 'wire-stock-pad']),
        m4a1: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        'ak-47': new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        minigun: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        'm14-ebr': new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        'slug-shotgun': new Set(['stock', 'stock-cheek-panel']),
        'flashlight-pistol': new Set(),
        'explosive-crossbow': new Set(),
      };
      model.traverse((node) => {
        if (firstPersonHidden[id].has(node.name)) node.visible = false;
      });
      if (id === 'carbine') {
        const reticle = model.getObjectByName('optic-reticle');
        if (reticle instanceof THREE.Mesh && reticle.material instanceof THREE.MeshBasicMaterial) {
          reticle.material = reticle.material.clone();
          reticle.material.depthTest = false;
          reticle.material.depthWrite = false;
          reticle.renderOrder = 1_000;
        }
      }
      // Preserve the authored PBR materials, normal/roughness maps and small
      // receiver parts in the quality viewmodel. Reduced profiles retain the
      // bounded merged path.
      if (this.flattenMaterials && id !== 'explosive-crossbow') optimizeAttachedWeapon(model, 'palette-basic');
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
    if (browserRuntime && this.gpuPrewarmer) {
      const initialModel = this.models.get(initialWeapon);
      if (!initialModel) throw new Error(`Pass 65 initial first-person asset unavailable after load: ${initialWeapon}`);
      try {
        await this.prewarmBrowserModel(initialWeapon, initialModel, this.browserWeaponRequest);
      } catch (error) {
        this.retireRejectedBrowserModel(initialWeapon, initialModel);
        throw error;
      }
    }
    this.setWeapon(this.active, true);
    if (browserRuntime) this.trimBrowserWeaponModels();
  }

  /**
   * Loads, creates and GPU-prewarms one bounded gameplay weapon set behind the
   * deployment surface. WebGPU compilation can synchronously occupy the browser
   * main thread even though compileAsync returns a Promise, so a live lazy
   * switch is not a safe presentation boundary. Deployment therefore pins the
   * complete arena-reachable set; WebGL/no-hook callers retain the existing
   * bounded two-model lazy cache.
   */
  async prewarmBrowserWeaponCatalog(
    requestedIds: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    if (!this.browserRuntime || !this.gpuPrewarmer) return;
    const ids = [...new Set(requestedIds)];
    if (ids.length === 0 || ids.length > WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS) {
      throw new Error(`Pass 65 WebGPU weapon prewarm requires 1-${WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS} unique models`);
    }
    if (this.browserCatalogPrewarmPromise) {
      await this.browserCatalogPrewarmPromise;
      return this.prewarmBrowserWeaponCatalog(ids, onProgress);
    }
    const exactSetReady = ids.length === this.browserResidentWeaponIds.size
      && ids.every((id) => {
        const model = this.models.get(id);
        return this.browserResidentWeaponIds.has(id) && model !== undefined && this.modelIsGpuReady(model);
      });
    if (exactSetReady) return;
    const operation = this.performBrowserWeaponCatalogPrewarm(ids, onProgress);
    this.browserCatalogPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.browserCatalogPrewarmPromise === operation) this.browserCatalogPrewarmPromise = null;
    }
  }

  private async performBrowserWeaponCatalogPrewarm(
    ids: readonly WeaponId[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const prewarmStartedAt = performance.now();
    let assetLoadMs = 0;
    let modelCreateMs = 0;
    let newlyCreated = 0;
    const entries: WeaponViewmodelCatalogGpuPrewarmEntry[] = [];
    for (const id of ids) {
      const assetLoadStartedAt = performance.now();
      await loadPass65WeaponPresentation(id, 'first-person');
      assetLoadMs += performance.now() - assetLoadStartedAt;
      const modelCreateStartedAt = performance.now();
      let model = this.models.get(id);
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
      entries.push(Object.freeze({ weaponId: id, model }));
      modelCreateMs += performance.now() - modelCreateStartedAt;
    }

    const gpuPrewarmStartedAt = performance.now();
    if (this.catalogGpuPrewarmer) {
      // A live switch can already own one candidate's individual prewarm. Let
      // that exact operation settle before forming the remaining deployment
      // batch so one model is never staged by two owners concurrently.
      await Promise.all(entries.flatMap(({ model }) => {
        const pending = this.gpuPrewarmPromises.get(model);
        return pending ? [pending] : [];
      }));
      const batchEntries = entries.filter(({ model }) => !this.modelIsGpuReady(model));
      const flashlightEntries = batchEntries.filter(({ weaponId }) => WEAPONS[weaponId].flashlight !== null);
      if (flashlightEntries[0]) this.configureWeaponFlashlight(flashlightEntries[0].weaponId);
      try {
        await this.prewarmBrowserCatalogModels(batchEntries, this.browserWeaponRequest);
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
      entries.forEach(({ weaponId }, index) => {
        this.browserResidentWeaponIds.add(weaponId);
        onProgress?.(index + 1, ids.length);
      });
    } else {
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
        this.browserResidentWeaponIds.add(id);
        onProgress?.(index + 1, ids.length);
      }
    }
    const gpuPrewarmMs = performance.now() - gpuPrewarmStartedAt;
    const cleanupStartedAt = performance.now();
    const desired = new Set(ids);
    for (const id of [...this.browserResidentWeaponIds]) {
      if (!desired.has(id)) this.browserResidentWeaponIds.delete(id);
    }
    for (const [id, model] of [...this.models]) {
      if (desired.has(id) || id === this.active || this.gpuPrewarmPromises.has(model)) continue;
      this.models.delete(id);
      this.modelLastUsed.delete(id);
      this.root.remove(model);
      if (this.retireModel) this.retireModel(model, () => releasePass65WeaponModel(model));
      else disposePass65WeaponModel(model);
    }
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
      gpuPrewarmMs: Number(gpuPrewarmMs.toFixed(3)),
      cleanupMs: Number((performance.now() - cleanupStartedAt).toFixed(3)),
      totalMs: Number((performance.now() - prewarmStartedAt).toFixed(3)),
      mode: this.catalogGpuPrewarmer ? 'catalog-batch' : 'individual-fallback',
    });
  }

  isReady(): boolean {
    return typeof document !== 'undefined' ? this.models.has(this.active) : this.models.size === Object.keys(WEAPONS).length;
  }

  private createLoadedBrowserWeapon(id: WeaponId): THREE.Group | null {
    return id === 'explosive-crossbow'
      ? createPass65CrossbowModel(this.flattenMaterials, 'first-person')
      : createPass65WeaponModel(id, this.flattenMaterials, 'first-person');
  }

  private trimBrowserWeaponModels(): void {
    if (this.browserCatalogPrewarmPromise) return;
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
    const promise = Promise.resolve().then(() => this.gpuPrewarmer!(model, {
      weaponId: id,
      requestGeneration,
    })).then(() => {
      this.gpuReadyModels.add(model);
    }).finally(() => {
      this.gpuPrewarmPromises.delete(model);
    });
    this.gpuPrewarmPromises.set(model, promise);
    return promise;
  }

  private prewarmBrowserCatalogModels(
    entries: readonly WeaponViewmodelCatalogGpuPrewarmEntry[],
    requestGeneration: number,
  ): Promise<void> {
    if (entries.length === 0) return Promise.resolve();
    const promise = Promise.resolve().then(() => this.catalogGpuPrewarmer!(entries, {
      requestGeneration,
    })).then(() => {
      for (const { model } of entries) this.gpuReadyModels.add(model);
    }).finally(() => {
      for (const { model } of entries) {
        if (this.gpuPrewarmPromises.get(model) === promise) this.gpuPrewarmPromises.delete(model);
      }
    });
    for (const { model } of entries) this.gpuPrewarmPromises.set(model, promise);
    return promise;
  }

  private retireRejectedBrowserModel(id: WeaponId, model: THREE.Object3D): void {
    if (this.models.get(id) !== model || this.gpuReadyModels.has(model)) return;
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
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
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
      if (this.browserResidentWeaponIds.size > 0 && !this.browserResidentWeaponIds.has(id)) {
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
    const sightName = this.active === 'carbine'
      ? 'optic-reticle'
      : this.active === 'sniper'
        ? 'sniper-scope'
      : this.active === 'm14-ebr'
        ? 'm14-thermal-optic'
      : this.active === 'lmg'
        ? 'lmg-aperture'
      : this.active === 'smg'
        ? 'smg-aperture'
        : this.active === 'pistol' || this.active === 'machine-pistol' || this.active === 'magnum'
          ? 'pistol-rear-sight'
          : 'ghost-ring';
    // Pass 65 authored GLBs expose a canonical socket contract. Cosmetic mesh
    // names are retained only as a fallback for the procedural/headless models.
    return model?.getObjectByName('rear-sight-socket') ?? model?.getObjectByName(sightName);
  }

  private centerSightReference(model: THREE.Object3D | undefined): void {
    const lock = THREE.MathUtils.smoothstep(this.adsBlend, 0.72, 0.98);
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
      modelVisibleMeshCount,
      attachedWeaponBatchStats: model?.userData.attachedWeaponBatchStats ?? null,
      adsProgress: this.adsBlend,
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
      actionContract: this.actionContract,
      surfaceRetreat: this.surfaceRetreat,
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
      browserWeaponCatalog: {
        retained: [...this.browserResidentWeaponIds],
        retainedCount: this.browserResidentWeaponIds.size,
        loaded: this.models.size,
        gpuReady: [...this.models.values()].filter((entry) => this.modelIsGpuReady(entry)).length,
        available: Object.keys(WEAPONS).length,
        prewarming: this.browserCatalogPrewarmPromise !== null,
        unpreparedSwitches: this.unpreparedBrowserSwitches,
        lastUnpreparedSwitch: this.lastUnpreparedBrowserSwitch,
        maximumRetained: WeaponPresentation.MAX_RETAINED_WEBGPU_WEAPONS,
        flashlightGpuPrewarmCount: this.flashlightGpuPrewarmCount,
        lastPrewarmProfile: this.lastBrowserCatalogPrewarmProfile,
      },
      importedModel,
    };
  }

  private solveArms(arms: THREE.Object3D, activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (!activeModel) return;
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
    bone.updateWorldMatrix(true, true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const currentDirection = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const desiredDirection = targetWorld.clone().sub(origin).normalize();
    if (currentDirection.lengthSq() < 1e-6 || desiredDirection.lengthSq() < 1e-6) return;
    const currentWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const desiredWorld = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection).multiply(currentWorld);
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
    bone.updateWorldMatrix(false, true);
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

  private applyRiggedMeleeBone(
    bone: THREE.Bone,
    bind: THREE.Quaternion,
    pose: MeleeBonePose,
    windup: number,
    thrust: number,
    retained: number,
  ): void {
    this.meleePoseEuler.set(
      (pose.windup[0] * windup + (pose.thrust[0] - pose.windup[0]) * thrust) * retained,
      (pose.windup[1] * windup + (pose.thrust[1] - pose.windup[1]) * thrust) * retained,
      (pose.windup[2] * windup + (pose.thrust[2] - pose.windup[2]) * thrust) * retained,
      'XYZ',
    );
    this.meleePoseQuaternion.setFromEuler(this.meleePoseEuler);
    bone.quaternion.copy(bind).multiply(this.meleePoseQuaternion);
  }

  private poseRiggedMeleeArms(progress: number): void {
    this.restoreRiggedArmBindPose();
    const windup = THREE.MathUtils.smoothstep(progress, 0, 0.18);
    const thrust = THREE.MathUtils.smoothstep(progress, 0.18, 0.46);
    const recover = THREE.MathUtils.smoothstep(progress, 0.58, 1);
    const retained = 1 - recover;
    let right: RiggedViewArm | undefined;
    let left: RiggedViewArm | undefined;
    for (const rig of this.riggedArmRigs) {
      if (rig.side === 'right') right = rig;
      else left = rig;
    }
    if (right) {
      this.applyRiggedMeleeBone(right.shoulder, right.bindShoulder, MELEE_ARM_POSES.rightShoulder, windup, thrust, retained);
      this.applyRiggedMeleeBone(right.elbow, right.bindElbow, MELEE_ARM_POSES.rightElbow, windup, thrust, retained);
      this.applyRiggedMeleeBone(right.wrist, right.bindWrist, MELEE_ARM_POSES.rightWrist, windup, thrust, retained);
    }
    if (left) {
      // A knife action is a one-hand stab. Keeping the firearm support arm at
      // its prior grip pose made two complete chains cross at the wrist and
      // read as detached sausage segments. Collapse that non-participating
      // chain outside the frustum for the action, then restore its exact bind
      // position/scale on exit; the visible right shoulder-to-knife chain
      // remains fully skinned and anatomically continuous.
      left.shoulder.position.set(
        left.bindShoulderPosition.x + 4,
        left.bindShoulderPosition.y,
        left.bindShoulderPosition.z,
      );
      left.shoulder.scale.setScalar(0.001);
    }
    this.root.updateWorldMatrix(true, true);
    if (this.authoredMeleeKnife && this.authoredMeleeSocket) {
      const grip = this.authoredMeleeKnife.getObjectByName('grip-socket-r');
      if (grip) {
        this.authoredMeleeGripError = grip.getWorldPosition(this.meleeGripWorld)
          .distanceTo(this.authoredMeleeSocket.getWorldPosition(this.meleeSocketWorld));
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
    }));
  }

  private poseRiggedFingers(reloadPose: ReloadPose, meleeActive: boolean): void {
    for (const finger of this.riggedFingerBones) {
      const jointCurl = FINGER_CURL_JOINTS[finger.joint - 1];
      let curl = jointCurl * weaponFingerCurlScale(this.active, finger);
      if (finger.side === 'left' && reloadPose.handToReload > 0) {
        const reloadCurl = FINGER_RELOAD_CURL_JOINTS[finger.joint - 1]
          * (finger.digit === 'thumb' ? 0.72 : FINGER_CURL_DIGIT_SCALE[finger.digit]);
        curl = THREE.MathUtils.lerp(curl, reloadCurl, reloadPose.handToReload);
      }
      if (meleeActive && finger.side === 'right') {
        curl += FINGER_MELEE_CURL_JOINTS[finger.joint - 1]
          * (finger.digit === 'thumb' ? 0.68 : FINGER_CURL_DIGIT_SCALE[finger.digit]);
      }
      const spread = finger.joint === 1
        ? FINGER_SPREAD[finger.digit]
          * (finger.side === 'left' ? -1 : 1)
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
    const cameraRotation = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const diagnostics: Array<Record<string, unknown>> = [];
    for (const rig of this.riggedArmRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const target = socket.getWorldPosition(new THREE.Vector3());
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) target.lerp(reloadSocket.getWorldPosition(new THREE.Vector3()), reloadPose.handToReload);
      }
      const shoulderPosition = rig.shoulder.getWorldPosition(new THREE.Vector3());
      const elbowPosition = rig.elbow.getWorldPosition(new THREE.Vector3());
      const wristPosition = rig.wrist.getWorldPosition(new THREE.Vector3());
      const upperLength = shoulderPosition.distanceTo(elbowPosition);
      const lowerLength = elbowPosition.distanceTo(wristPosition);
      const bendHint = new THREE.Vector3(rig.side === 'left' ? -0.7 : 0.7, -1, 0.25).applyQuaternion(cameraRotation);
      const elbowTarget = solveTwoBoneElbow(shoulderPosition, target, upperLength, lowerLength, bendHint);
      this.orientRiggedBone(rig.shoulder, rig.elbow, elbowTarget);
      this.orientRiggedBone(rig.elbow, rig.wrist, target);
      const handDirection = new THREE.Vector3(
        rig.side === 'left' ? 0.55 : 0.12,
        -1,
        rig.side === 'left' ? -0.15 : 0.08,
      ).normalize();
      const gripRotation = WEAPON_HAND_ROTATIONS[this.active][rig.side];
      handDirection.applyEuler(new THREE.Euler(
        gripRotation[0] * 0.24,
        gripRotation[1] * 0.24,
        gripRotation[2] * 0.24,
        'XYZ',
      )).applyQuaternion(cameraRotation);
      this.orientRiggedBone(rig.wrist, rig.finger, rig.wrist.getWorldPosition(new THREE.Vector3()).add(handDirection));
      const solvedWrist = rig.wrist.getWorldPosition(new THREE.Vector3());
      const reachRatio = shoulderPosition.distanceTo(target) / Math.max(upperLength + lowerLength, 1e-6);
      diagnostics.push({
        side: rig.side,
        weapon: this.active,
        gripFamily: viewmodelGripFamily(this.active),
        socket: socketName,
        upperLength,
        lowerLength,
        shoulder: rig.shoulder.getWorldPosition(new THREE.Vector3()).toArray(),
        elbow: rig.elbow.getWorldPosition(new THREE.Vector3()).toArray(),
        wrist: rig.wrist.getWorldPosition(new THREE.Vector3()).toArray(),
        target: target.toArray(),
        contactError: solvedWrist.distanceTo(target),
        reachRatio,
        withinStableReach: reachRatio <= 1.001,
        bindOffsetsPreserved: true,
        finite: [...target.toArray(), ...solvedWrist.toArray(), ...elbowTarget.toArray()].every(Number.isFinite),
        shoulderQuaternion: rig.shoulder.quaternion.toArray(),
        elbowQuaternion: rig.elbow.quaternion.toArray(),
      });
    }
    this.riggedArmDiagnostics = diagnostics;
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
    this.root.scale.setScalar(THREE.MathUtils.lerp(HIP_VIEWMODEL_SCALE, ADS_VIEWMODEL_SCALE, this.adsBlend));
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    this.muzzleFlash.visible = this.muzzleLight.intensity > 0.45;
    const arms = this.root.getObjectByName('first-person-arms');
    if (arms) {
      // Keep the ADS reduction modest and lower the shoulders. The authored
      // sleeves now extend behind the camera, so no capped shoulder endpoint
      // can enter frame while palms retain enough scale to read at the grips.
      arms.position.y = THREE.MathUtils.lerp(-0.075, -0.17, this.adsBlend);
      arms.scale.setScalar(THREE.MathUtils.lerp(1, 0.84, this.adsBlend));
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
    const hipYaw = this.active === 'carbine'
      ? 0.18
      : this.active === 'scattergun'
        ? 0.16
        : this.active === 'smg'
          ? 0.14
          : 0.1;
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
    const proneLift = pose.prone ? 0.018 * stanceHipBlend : 0;
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
    const viewmodelBaseY = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.y, ADS_VIEWMODEL_BASE_POSITION.y, this.adsBlend);
    const viewmodelBaseZ = THREE.MathUtils.lerp(HIP_VIEWMODEL_POSITION.z, ADS_VIEWMODEL_BASE_POSITION.z, this.adsBlend);
    const targetPosition = new THREE.Vector3(
      viewmodelBaseX + adsX + bobX + this.swayX - pose.lateralSpeed * 0.012 - meleeArc * 0.12 + grenadeArc * 0.18 + reloadStage.lateral,
      viewmodelBaseY + adsY + bobY + breath + sprintDrop + crouchLift + proneLift + switchDrop + reloadStage.lift - presentationKick * 0.095 - pose.landingImpulse * 0.075,
      viewmodelBaseZ + adsZ + (pose.surfaceRetreat ?? 0) + presentationKick * profile.recoilTranslation * 1.12 - meleeArc * 0.18 + grenadeArc * 0.24,
    );
    this.surfaceRetreat = pose.surfaceRetreat ?? 0;
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, presentationKick * profile.recoilRotation * 1.15 - this.swayY - grenadeArc * 0.42 + reloadStage.pitch, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y,
      hipYaw * (1 - this.adsBlend) - this.swayX * 2 - this.sprintBlend * 0.38 - meleeArc * 0.18,
      smoothing(13),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadStage.roll - this.sprintBlend * 0.22 - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) + meleeArc * 0.12 + shotRoll, smoothing(13));
    this.centerSightReference(activeModel);
    if (arms && !meleeActive) this.solveArms(arms, activeModel, reloadPose);
    if (!authoredMeleeActive) this.solveRiggedArms(activeModel, reloadPose);
    return actionEvents;
  }
}
