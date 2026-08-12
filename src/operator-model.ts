import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { markMeshGeometriesShared } from './gpu-resource-ownership';
import type { Team } from './protocol';
import { objectLocalGeometryBounds } from './character-presentation-contract';
import { solveTwoBoneElbow } from './ik';
import { yieldBrowserCpuTask } from './browser-preparation-scheduler';

export const BOT_EMISSIVE_BRIGHTNESS_SCALE = 0.5;

/** Applies the global bot-only emissive budget once without dimming players. */
export function applyBotEmissiveBrightness(root: THREE.Object3D): number {
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const candidates = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of candidates) materials.add(material);
  });
  let adjusted = 0;
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)
      && !(material instanceof THREE.MeshLambertMaterial)
      && !(material instanceof THREE.MeshPhongMaterial)) continue;
    const stored = material.userData.botEmissiveBaseIntensity;
    const base = typeof stored === 'number' ? stored : material.emissiveIntensity;
    material.userData.botEmissiveBaseIntensity = base;
    material.emissiveIntensity = base * BOT_EMISSIVE_BRIGHTNESS_SCALE;
    adjusted += 1;
  }
  root.userData.botEmissiveBrightnessScale = BOT_EMISSIVE_BRIGHTNESS_SCALE;
  root.userData.botEmissiveMaterialsAdjusted = adjusted;
  return adjusted;
}

const OPERATOR_QUALITY_URL = './assets/original/models/operators/pass65-third-person-operator-lod0.glb';
const OPERATOR_PERFORMANCE_URL = './assets/original/models/operators/pass65-third-person-operator-lod1.glb';
const FIRST_PERSON_ARMS_URL = './assets/original/models/operators/pass65-first-person-arms-lod0.glb';

type RiggedOperatorAsset = {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  lod: 0 | 1;
  source: string;
  skinnedMeshes: number;
  pbrMaterials: number;
};

type FirstPersonArmsAsset = {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
};

type FirstPersonArmsRuntime = {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  activeAction: string | null;
};

const FIRST_PERSON_RUNTIME_FINGER_TRACK = /(?:Index|Middle|Ring|Pinky|Thumb)[123][LR](?:\.|$)/;

/**
 * The authored Blender clips retain complete arm-chain motion for offline
 * contact review. In the live viewmodel only digit tracks are admitted: the
 * shoulder, elbow and wrist are solved after animation by weapon socket IK (or
 * the dedicated melee solve), so a clip can never pull a hand off its socket.
 */
export function firstPersonArmRuntimeClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.filter((track) => FIRST_PERSON_RUNTIME_FINGER_TRACK.test(track.name)).map((track) => track.clone()),
    clip.blendMode,
  );
}

type RiggedOperatorRuntime = {
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  currentBase: string;
  lastUpdatedAt: number;
  stancePivot: THREE.Group;
  visual: THREE.Group;
  weaponSocket: THREE.Group;
  canonicalEvidence: RiggedOperatorCanonicalEvidence;
  stance: 'stand' | 'crouch' | 'prone';
  crouchBlend: number;
  proneBlend: number;
  speed: number;
  poseBones: {
    hips?: THREE.Bone;
    abdomen?: THREE.Bone;
    torso?: THREE.Bone;
    chest?: THREE.Bone;
    head?: THREE.Bone;
    upperLegLeft?: THREE.Bone;
    upperLegRight?: THREE.Bone;
    lowerLegLeft?: THREE.Bone;
    lowerLegRight?: THREE.Bone;
    footLeft?: THREE.Bone;
    footRight?: THREE.Bone;
  };
  /** Immutable local transforms captured from the authored GLB before animation. */
  armBindPose: Array<{
    side: 'left' | 'right';
    role: 'shoulder' | 'elbow' | 'wrist-hand';
    sourceBone: string;
    bone: THREE.Bone;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }>;
  /** Authored finger joints animated by Walk, captured before mixer evaluation. */
  handBindPose: Array<{
    side: 'left' | 'right';
    digit: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
    joint: 2;
    sourceBone: string;
    bone: THREE.Bone;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }>;
  /** Static skin influence scan, invalidated when a geometry attribute version changes. */
  renderedInfluenceCache?: {
    signature: string;
    generation: number;
    byBone: Map<THREE.Bone, RenderedVertexInfluenceTelemetry>;
  };
  poseBeforeStance?: Array<{
    bone: THREE.Bone;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }>;
};

export type RiggedOperatorCanonicalBoneIdentity = Readonly<{
  index: number;
  name: string;
  uuid: string;
  parentIndex: number;
}>;

export type RiggedOperatorCanonicalSkinIdentity = Readonly<{
  name: string;
  uuid: string;
  geometryUuid: string;
  positionCount: number;
  skinIndexCount: number;
  skinIndexItemSize: number;
  skinIndexNormalized: boolean;
  skinWeightCount: number;
  skinWeightItemSize: number;
  skinWeightNormalized: boolean;
  skeletonBones: readonly RiggedOperatorCanonicalBoneIdentity[];
}>;

export type RiggedOperatorCanonicalEvidenceManifest = Readonly<{
  contract: 'runtime-canonical-operator-skin-manifest-v1';
  assetUrl: string;
  lod: 0 | 1;
  visual: Readonly<{ name: string; uuid: string }>;
  skinnedMeshes: readonly RiggedOperatorCanonicalSkinIdentity[];
  wrists: readonly Readonly<{ side: 'left' | 'right'; name: string; uuid: string }>[];
}>;

type RiggedOperatorCanonicalEvidence = {
  visual: THREE.Group;
  skinnedMeshes: readonly THREE.SkinnedMesh[];
  wrists: Readonly<Partial<Record<'left' | 'right', THREE.Bone>>>;
  assetUrl: string;
  lod: 0 | 1;
  manifest?: RiggedOperatorCanonicalEvidenceManifest;
};

export type RiggedOperatorHandEvidenceIdentity = Readonly<{
  operatorRoot: THREE.Object3D;
  visual: THREE.Group;
  side: 'left' | 'right';
  wrist: THREE.Bone;
  skinnedMeshes: readonly THREE.SkinnedMesh[];
  manifest: RiggedOperatorCanonicalEvidenceManifest;
}>;

export type RenderedVertexInfluenceMeshTelemetry = Readonly<{
  mesh: string;
  meshUuid: string;
  geometryUuid: string;
  influencedVertexCount: number;
  maximumNormalizedWeight: number;
}>;

export type RenderedVertexInfluenceTelemetry = Readonly<{
  contract: 'rendered-joints0-weights0-influence-v2';
  bone: string;
  boneUuid: string;
  thresholds: Readonly<{
    minimumNormalizedWeight: number;
    minimumInfluencedVertices: number;
    minimumMaximumNormalizedWeight: number;
  }>;
  influencedVertexCount: number;
  maximumNormalizedWeight: number;
  meshes: readonly RenderedVertexInfluenceMeshTelemetry[];
  passes: boolean;
}>;

const RIGGED_OPERATOR_ARM_BONES = Object.freeze([
  Object.freeze({ side: 'left' as const, role: 'shoulder' as const, sourceBone: 'UpperArm.L', names: Object.freeze(['UpperArmL', 'UpperArm.L']) }),
  Object.freeze({ side: 'left' as const, role: 'elbow' as const, sourceBone: 'LowerArm.L', names: Object.freeze(['LowerArmL', 'LowerArm.L']) }),
  Object.freeze({ side: 'left' as const, role: 'wrist-hand' as const, sourceBone: 'Wrist.L', names: Object.freeze(['WristL', 'Wrist.L']) }),
  Object.freeze({ side: 'right' as const, role: 'shoulder' as const, sourceBone: 'UpperArm.R', names: Object.freeze(['UpperArmR', 'UpperArm.R']) }),
  Object.freeze({ side: 'right' as const, role: 'elbow' as const, sourceBone: 'LowerArm.R', names: Object.freeze(['LowerArmR', 'LowerArm.R']) }),
  Object.freeze({ side: 'right' as const, role: 'wrist-hand' as const, sourceBone: 'Wrist.R', names: Object.freeze(['WristR', 'Wrist.R']) }),
]);

// All ten second phalanges are real, animated joints in the shipped operator
// GLB. They are both projection sentinels and rendered-weight sentinels: a
// named skeleton node without JOINTS_0/WEIGHTS_0 influence is not hand proof.
const RIGGED_OPERATOR_HAND_BONES = Object.freeze([
  Object.freeze({ side: 'left' as const, digit: 'thumb' as const, joint: 2 as const, sourceBone: 'Thumb2.L', names: Object.freeze(['Thumb2L', 'Thumb2.L']) }),
  Object.freeze({ side: 'left' as const, digit: 'index' as const, joint: 2 as const, sourceBone: 'Index2.L', names: Object.freeze(['Index2L', 'Index2.L']) }),
  Object.freeze({ side: 'left' as const, digit: 'middle' as const, joint: 2 as const, sourceBone: 'Middle2.L', names: Object.freeze(['Middle2L', 'Middle2.L']) }),
  Object.freeze({ side: 'left' as const, digit: 'ring' as const, joint: 2 as const, sourceBone: 'Ring2.L', names: Object.freeze(['Ring2L', 'Ring2.L']) }),
  Object.freeze({ side: 'left' as const, digit: 'pinky' as const, joint: 2 as const, sourceBone: 'Pinky2.L', names: Object.freeze(['Pinky2L', 'Pinky2.L']) }),
  Object.freeze({ side: 'right' as const, digit: 'thumb' as const, joint: 2 as const, sourceBone: 'Thumb2.R', names: Object.freeze(['Thumb2R', 'Thumb2.R']) }),
  Object.freeze({ side: 'right' as const, digit: 'index' as const, joint: 2 as const, sourceBone: 'Index2.R', names: Object.freeze(['Index2R', 'Index2.R']) }),
  Object.freeze({ side: 'right' as const, digit: 'middle' as const, joint: 2 as const, sourceBone: 'Middle2.R', names: Object.freeze(['Middle2R', 'Middle2.R']) }),
  Object.freeze({ side: 'right' as const, digit: 'ring' as const, joint: 2 as const, sourceBone: 'Ring2.R', names: Object.freeze(['Ring2R', 'Ring2.R']) }),
  Object.freeze({ side: 'right' as const, digit: 'pinky' as const, joint: 2 as const, sourceBone: 'Pinky2.R', names: Object.freeze(['Pinky2R', 'Pinky2.R']) }),
]);

export const RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS = Object.freeze({
  minimumNormalizedWeight: 0.05,
  minimumInfluencedVertices: 4,
  minimumMaximumNormalizedWeight: 0.2,
});

const RIGGED_OPERATOR_ANTI_T_THRESHOLDS = Object.freeze({
  minimumVerticalDropM: 0.08,
  minimumVerticalDropRatio: 0.18,
  maximumHorizontalReachRatio: 0.9,
  maximumOutwardReachRatio: 0.82,
  minimumElbowFlexRadians: 0.3,
});

/**
 * Only clips reachable from the live operator controller belong in the runtime
 * mixer. The source GLB deliberately retains the complete authored animation
 * library for offline review, but binding every track of every unused clip at
 * spawn time creates a multi-hundred-millisecond main-thread task.
 */
export const RIGGED_OPERATOR_RUNTIME_ACTION_NAMES = Object.freeze([
  'Idle_Gun_Pointing',
  'Idle_Gun',
  'Idle_Gun_Shoot',
  'Walk',
  'Run_Shoot',
  'Run',
  'Gun_Shoot',
  'HitRecieve_2',
  'HitRecieve',
  'Death',
  'Punch_Right',
  'Kick_Right',
] as const);

export const RIGGED_OPERATOR_CORPSE_ACTION_NAMES = Object.freeze(['Death'] as const);

export function riggedOperatorRuntimeClips(clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
  return RIGGED_OPERATOR_RUNTIME_ACTION_NAMES.flatMap((name) => {
    const clip = clipsByName.get(name);
    return clip ? [clip] : [];
  });
}

export type RiggedOperatorInstance = {
  root: THREE.Group;
  weaponSocket: THREE.Group;
};

export type OperatorAppearance = 'team' | 'neon-purple';

const operatorAssets: Partial<Record<'quality' | 'performance', RiggedOperatorAsset>> = {};
let firstPersonArmsAsset: FirstPersonArmsAsset | null = null;
let operatorAssetPromise: Promise<void> | null = null;
let firstPersonArmsAssetPromise: Promise<void> | null = null;

const STANCE_PIVOT_HEIGHT = 0.84;
const EMBEDDED_WEAPON_NAME = /(^|[\s_.-])(pistol|rifle|shotgun|smg|gun|weapon)([\s_.-]|$)/i;
const PRONE_WEAPON_MOUNT: Record<string, { x: number; y: number; z: number }> = {
  carbine: { x: 0.1, y: 0.425, z: -0.14 },
  smg: { x: 0.09, y: 0.425, z: -0.14 },
  lmg: { x: 0.1, y: 0.435, z: -0.11 },
  scattergun: { x: 0.09, y: 0.425, z: -0.14 },
  sniper: { x: 0.1, y: 0.425, z: -0.14 },
  pistol: { x: 0.065, y: 0.45, z: -0.23 },
  'machine-pistol': { x: 0.065, y: 0.45, z: -0.23 },
};

/** The character source includes its own skinned pistol. Runtime loadouts own all visible weapons. */
export function isEmbeddedWeaponObjectName(name: string): boolean {
  return EMBEDDED_WEAPON_NAME.test(name.trim());
}

export function suppressEmbeddedWeaponObjects(root: THREE.Object3D): number {
  let suppressed = 0;
  root.traverse((node) => {
    if (!isEmbeddedWeaponObjectName(node.name)) return;
    node.visible = false;
    node.userData.embeddedWeaponSuppressed = true;
    suppressed += 1;
  });
  return suppressed;
}

export function riggedStanceTarget(stance: RiggedOperatorRuntime['stance']): {
  pivotHeight: number;
  pivotPitch: number;
  crouch: number;
  prone: number;
} {
  if (stance === 'prone') return { pivotHeight: 0.43, pivotPitch: -1.42, crouch: 0, prone: 1 };
  if (stance === 'crouch') return { pivotHeight: STANCE_PIVOT_HEIGHT, pivotPitch: 0, crouch: 1, prone: 0 };
  return { pivotHeight: STANCE_PIVOT_HEIGHT, pivotPitch: 0, crouch: 0, prone: 0 };
}

function addLocalPose(bone: THREE.Bone | undefined, x: number, y: number, z: number, weight: number): void {
  if (!bone || weight <= 0) return;
  bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x * weight, y * weight, z * weight, 'XYZ')));
}

function orientBoneTowardWorld(bone: THREE.Bone, child: THREE.Bone, targetWorld: THREE.Vector3): void {
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

function plantCrouchLeg(
  upper: THREE.Bone | undefined,
  lower: THREE.Bone | undefined,
  foot: THREE.Bone | undefined,
  footTarget: THREE.Vector3 | null,
  bendHint: THREE.Vector3,
): void {
  if (!upper || !lower || !foot || !footTarget) return;
  upper.updateWorldMatrix(true, true);
  const hip = upper.getWorldPosition(new THREE.Vector3());
  const knee = lower.getWorldPosition(new THREE.Vector3());
  const ankle = foot.getWorldPosition(new THREE.Vector3());
  const upperLength = hip.distanceTo(knee);
  const lowerLength = knee.distanceTo(ankle);
  const footWorldRotation = foot.getWorldQuaternion(new THREE.Quaternion());
  const kneeTarget = solveTwoBoneElbow(hip, footTarget, upperLength, lowerLength, bendHint);
  orientBoneTowardWorld(upper, lower, kneeTarget);
  orientBoneTowardWorld(lower, foot, footTarget);
  const parentWorld = foot.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  foot.quaternion.copy(parentWorld.invert().multiply(footWorldRotation));
  foot.updateWorldMatrix(false, true);
}

function applyStancePose(runtimeState: RiggedOperatorRuntime, dt: number): void {
  const target = riggedStanceTarget(runtimeState.stance);
  const alpha = 1 - Math.exp(-Math.max(0, dt) * 12);
  runtimeState.crouchBlend = THREE.MathUtils.lerp(runtimeState.crouchBlend, target.crouch, alpha);
  runtimeState.proneBlend = THREE.MathUtils.lerp(runtimeState.proneBlend, target.prone, alpha);
  runtimeState.stancePivot.position.y = THREE.MathUtils.lerp(
    runtimeState.stancePivot.position.y,
    target.pivotHeight,
    alpha,
  );
  runtimeState.stancePivot.rotation.x = THREE.MathUtils.lerp(
    runtimeState.stancePivot.rotation.x,
    target.pivotPitch,
    alpha,
  );

  // The visible loadout lives in body space rather than under an animated
  // wrist. That keeps its muzzle authoritative while both arms are solved onto
  // the weapon after the animation mixer has written the current pose.
  const sprint = runtimeState.stance === 'stand'
    ? THREE.MathUtils.smoothstep(runtimeState.speed, 3.2, 6.8)
    : 0;
  const weaponId = String(runtimeState.weaponSocket.children[0]?.userData.weaponId ?? 'carbine');
  const proneMount = PRONE_WEAPON_MOUNT[weaponId] ?? PRONE_WEAPON_MOUNT.carbine;
  const weaponX = runtimeState.stance === 'prone' ? proneMount.x : 0;
  const weaponY = runtimeState.stance === 'prone' ? proneMount.y
    : runtimeState.stance === 'crouch' ? 0.82
      : THREE.MathUtils.lerp(1.31, 1.14, sprint);
  const weaponZ = runtimeState.stance === 'prone' ? proneMount.z
    : THREE.MathUtils.lerp(-0.18, -0.08, sprint);
  runtimeState.weaponSocket.position.x = THREE.MathUtils.lerp(runtimeState.weaponSocket.position.x, weaponX, alpha);
  runtimeState.weaponSocket.position.y = THREE.MathUtils.lerp(runtimeState.weaponSocket.position.y, weaponY, alpha);
  runtimeState.weaponSocket.position.z = THREE.MathUtils.lerp(runtimeState.weaponSocket.position.z, weaponZ, alpha);
  runtimeState.weaponSocket.rotation.x = THREE.MathUtils.lerp(runtimeState.weaponSocket.rotation.x, -0.2 * sprint, alpha);
  runtimeState.weaponSocket.rotation.z = THREE.MathUtils.lerp(runtimeState.weaponSocket.rotation.z, -0.08 * sprint, alpha);

  const crouch = runtimeState.crouchBlend;
  const prone = runtimeState.proneBlend;
  const bones = runtimeState.poseBones;
  const leftFootTarget = crouch > 0.001 ? bones.footLeft?.getWorldPosition(new THREE.Vector3()) ?? null : null;
  const rightFootTarget = crouch > 0.001 ? bones.footRight?.getWorldPosition(new THREE.Vector3()) ?? null : null;
  if (bones.hips) bones.hips.position.y -= 0.44 * crouch;
  addLocalPose(bones.hips, 0.05, 0, 0, crouch);
  addLocalPose(bones.abdomen, 0.08, 0, 0, crouch);
  addLocalPose(bones.torso, 0.12, 0, 0, crouch);
  addLocalPose(bones.chest, -0.05, 0, 0, crouch);
  if (crouch > 0.001) {
    runtimeState.visual.updateWorldMatrix(true, true);
    const bodyRotation = runtimeState.stancePivot.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(bodyRotation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyRotation);
    plantCrouchLeg(
      bones.upperLegLeft, bones.lowerLegLeft, bones.footLeft, leftFootTarget,
      forward.clone().addScaledVector(right, -0.18),
    );
    plantCrouchLeg(
      bones.upperLegRight, bones.lowerLegRight, bones.footRight, rightFootTarget,
      forward.clone().addScaledVector(right, 0.18),
    );
  }

  // The whole-pelvis pivot supplies the prone silhouette. Keep the authored
  // idle legs intact: layering walk-knee offsets here produced a raised foot
  // and twisted hip that read as a broken ragdoll.
  addLocalPose(bones.chest, -0.025, 0, 0, prone);
}

function materialForTeam(
  material: THREE.Material,
  team: Team,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material.clone();
  const result = material.clone();
  const name = material.name.toLowerCase();
  if (appearance === 'neon-purple' && name === 'swat') {
    result.color.setHex(0xd85cff);
    result.emissive.setHex(0x7d16bd);
    result.emissiveIntensity = 1.2;
    result.roughness = 0.46;
    result.metalness = 0.08;
  } else if (appearance === 'neon-purple' && name.includes('swat_black')) {
    result.color.setHex(0xa93cff);
    result.emissive.setHex(0x5d0ca8);
    result.emissiveIntensity = 1.05;
    result.roughness = 0.5;
    result.metalness = 0.06;
  } else if (appearance === 'neon-purple' && name.includes('grey')) {
    result.color.setHex(0xe3a5ff);
    result.emissive.setHex(0x64119e);
    result.emissiveIntensity = 0.72;
    result.roughness = 0.54;
    result.metalness = 0.04;
  } else if (name === 'swat') {
    result.color.setHex(team === 0 ? 0x2d7882 : 0xb34d3f);
    result.emissive.setHex(team === 0 ? 0x061a1d : 0x240906);
    result.emissiveIntensity = flattenMaterials ? 0.34 : 0.14;
  } else if (name.includes('swat_black')) {
    result.color.setHex(team === 0 ? 0x1d292d : 0x302326);
    result.emissive.setHex(team === 0 ? 0x061113 : 0x130708);
    result.emissiveIntensity = flattenMaterials ? 0.22 : 0.08;
  } else if (name.includes('grey')) {
    result.color.setHex(team === 0 ? 0x6d9b9e : 0xb98276);
  }
  if (flattenMaterials && appearance !== 'neon-purple') {
    result.roughness = 1;
    result.metalness = 0;
  }
  return result;
}

/**
 * One operator owns one mutable material set, but meshes inside that operator
 * which referenced the same authored source material should continue sharing a
 * single clone. Cloning per mesh multiplied material objects during every bot
 * and corpse build, while sharing across operators would make independent
 * fenced retirement unsafe.
 */
export function createOperatorInstanceMaterialResolver(
  team: Team,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
): (material: THREE.Material) => THREE.Material {
  const instanceMaterials = new Map<THREE.Material, THREE.Material>();
  return (material: THREE.Material): THREE.Material => {
    const existing = instanceMaterials.get(material);
    if (existing) return existing;
    const result = materialForTeam(material, team, flattenMaterials, appearance);
    result.transparent = false;
    result.opacity = 1;
    result.depthWrite = true;
    result.depthTest = true;
    result.alphaTest = 0;
    instanceMaterials.set(material, result);
    return result;
  };
}

export const FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY = 0.18;

export function firstPersonArmMaterialReadabilityProfile(materialName: string): Readonly<{
  emissive: number;
  emissiveIntensity: number;
  color?: number;
}> | null {
  const normalized = materialName.toLowerCase();
  if (normalized === 'skin') return Object.freeze({ emissive: 0x24160f, emissiveIntensity: 0.08 });
  if (normalized.includes('arms_glove') || normalized.includes('arms_fingerglove')) {
    return Object.freeze({ emissive: 0x183238, emissiveIntensity: 0.14 });
  }
  if (normalized.includes('arms_sleeve')) return Object.freeze({ emissive: 0x142b30, emissiveIntensity: 0.12 });
  if (normalized.includes('arms_armorpad')) {
    return Object.freeze({ emissive: 0x172f34, emissiveIntensity: 0.1 });
  }
  return null;
}

function materialForFirstPerson(material: THREE.Material, flattenMaterials: boolean): THREE.Material {
  const result = materialForTeam(material, 0, flattenMaterials);
  const profile = firstPersonArmMaterialReadabilityProfile(material.name);
  if (result instanceof THREE.MeshStandardMaterial && profile) {
    // Preserve the licensed base-color, normal, roughness and metallic maps.
    // Retain only a low fill contribution for the darkest arenas. The authored
    // base-colour, normal and ORM maps must remain the dominant surface signal;
    // the previous near-0.7 emissive lift flattened gloves into teal plastic.
    result.emissive.setHex(profile.emissive);
    result.emissiveIntensity = Math.min(profile.emissiveIntensity, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
    if (profile.color !== undefined) result.color.setHex(profile.color);
  }
  if (result instanceof THREE.MeshStandardMaterial && material.name.toLowerCase() === 'skin') {
    result.roughness = 0.92;
    result.metalness = 0;
  }
  return result;
}

const loadRiggedGltf = (url: string) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);

function describeOperatorAsset(
  operator: Awaited<ReturnType<typeof loadRiggedGltf>>,
  lod: 0 | 1,
  source: string,
): RiggedOperatorAsset {
  let skinnedMeshes = 0;
  const pbrMaterials = new Set<THREE.MeshStandardMaterial>();
  operator.scene.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skinnedMeshes += 1;
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial
        && material.map && material.normalMap && material.roughnessMap && material.metalnessMap) {
        pbrMaterials.add(material);
      }
    }
  });
  return {
    scene: operator.scene,
    clips: operator.animations,
    lod,
    source,
    skinnedMeshes,
    pbrMaterials: pbrMaterials.size,
  };
}

export function loadFirstPersonArmsAsset(): Promise<void> {
  if (firstPersonArmsAsset) return Promise.resolve();
  firstPersonArmsAssetPromise ??= loadRiggedGltf(FIRST_PERSON_ARMS_URL).then((arms) => {
    firstPersonArmsAsset = { scene: arms.scene, clips: arms.animations };
  });
  return firstPersonArmsAssetPromise;
}

export function loadRiggedOperatorAsset(): Promise<void> {
  if (operatorAssets.quality && operatorAssets.performance && firstPersonArmsAsset) return Promise.resolve();
  if (operatorAssetPromise) return operatorAssetPromise;
  operatorAssetPromise = Promise.all([
    operatorAssets.quality ? Promise.resolve() : loadRiggedGltf(OPERATOR_QUALITY_URL).then((operator) => {
      operatorAssets.quality = describeOperatorAsset(operator, 0, OPERATOR_QUALITY_URL);
    }),
    operatorAssets.performance ? Promise.resolve() : loadRiggedGltf(OPERATOR_PERFORMANCE_URL).then((operator) => {
      operatorAssets.performance = describeOperatorAsset(operator, 1, OPERATOR_PERFORMANCE_URL);
    }),
    loadFirstPersonArmsAsset(),
  ]).then(() => undefined);
  return operatorAssetPromise;
}

export function riggedOperatorAssetReady(): boolean {
  return operatorAssets.quality !== undefined
    && operatorAssets.performance !== undefined
    && firstPersonArmsAsset !== null;
}

export type FirstPersonArmChain = {
  shoulder: THREE.Bone;
  elbow: THREE.Bone;
  wrist: THREE.Bone;
  finger: THREE.Bone;
  /** Exported full palm transform; this, not the wrist or digit centroid, is the contact authority. */
  palmContact: THREE.Object3D;
  side: 'left' | 'right';
};

export type FirstPersonFingerBone = {
  bone: THREE.Bone;
  bindQuaternion: THREE.Quaternion;
  side: 'left' | 'right';
  digit: 'index' | 'middle' | 'ring' | 'pinky' | 'thumb';
  joint: 1 | 2 | 3;
};

export type FirstPersonRiggedArms = {
  root: THREE.Group;
  chains: FirstPersonArmChain[];
  fingers: FirstPersonFingerBone[];
  knifeSocket: THREE.Object3D;
};

export type FirstPersonArmHandedness = Readonly<{
  contract: 'authored-positive-determinant-right-on-positive-x-v1';
  valid: boolean;
  rightShoulderX: number;
  leftShoulderX: number;
  shoulderSeparation: number;
  visualDeterminant: number;
}>;

/**
 * Audits the exported scene in world space. Local bone translations are not a
 * handedness signal because the GLB owns parent rotations and scale. The Pass
 * 65 delivery already resolves its right chain to camera-positive X; reflecting
 * the runtime root a second time crossed both shoulders and inverted tangents.
 */
export function firstPersonArmHandedness(visual: THREE.Object3D): FirstPersonArmHandedness {
  visual.updateWorldMatrix(true, true);
  const right = visual.getObjectByName('UpperArmR');
  const left = visual.getObjectByName('UpperArmL');
  const rightShoulderX = right?.getWorldPosition(new THREE.Vector3()).x ?? Number.NaN;
  const leftShoulderX = left?.getWorldPosition(new THREE.Vector3()).x ?? Number.NaN;
  const shoulderSeparation = rightShoulderX - leftShoulderX;
  const visualDeterminant = visual.matrixWorld.determinant();
  return Object.freeze({
    contract: 'authored-positive-determinant-right-on-positive-x-v1',
    valid: Number.isFinite(rightShoulderX)
      && Number.isFinite(leftShoulderX)
      && shoulderSeparation > 0.05
      && visualDeterminant > 0,
    rightShoulderX,
    leftShoulderX,
    shoulderSeparation,
    visualDeterminant,
  });
}

export function createFirstPersonRiggedArms(flattenMaterials: boolean): FirstPersonRiggedArms | null {
  if (!firstPersonArmsAsset) return null;
  const root = new THREE.Group();
  root.name = 'first-person-arms';
  const visual = cloneSkeleton(firstPersonArmsAsset.scene) as THREE.Group;
  visual.name = 'authored-first-person-arms-visual';
  // The exported parent transforms already resolve UpperArmR to positive world
  // X. Preserve that positive-determinant delivery: a second runtime reflection
  // crossed the shoulders and reversed the normal-map tangent basis.
  visual.scale.set(1, 1, 1);
  visual.position.set(0, 0, 0);
  const handedness = firstPersonArmHandedness(visual);
  if (!handedness.valid) return null;
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    // Camera-space viewmodels must never frustum-cull: the repartitioned
    // four-skin delivery keeps rest-pose bounds that do not track the posed
    // IK chains, which silently dropped whole arms from the render list.
    node.frustumCulled = false;
    const prepare = (material: THREE.Material) => {
      const result = materialForFirstPerson(material, flattenMaterials);
      result.transparent = false;
      result.opacity = 1;
      result.depthWrite = true;
      // Positive-handed authored winding lets normal-mapped cloth use its real
      // front face. Near-plane clearance is owned by the viewmodel framing
      // pass; drawing backfaces here made cuffs and fingers look inside-out.
      result.side = THREE.FrontSide;
      return result;
    };
    if (Array.isArray(node.material)) node.material = node.material.map(prepare);
    else node.material = prepare(node.material);
  });
  root.add(visual);
  const chain = (side: 'left' | 'right'): FirstPersonArmChain | null => {
    const suffix = side === 'left' ? 'L' : 'R';
    const shoulder = visual.getObjectByName(`UpperArm${suffix}`);
    const elbow = visual.getObjectByName(`LowerArm${suffix}`);
    const wrist = visual.getObjectByName(`Wrist${suffix}`);
    const finger = visual.getObjectByName(`Index1${suffix}`);
    const palmContact = visual.getObjectByName(`${side}-palm-contact`);
    let palmAncestor: THREE.Object3D | null = palmContact?.parent ?? null;
    while (palmAncestor && palmAncestor !== wrist) palmAncestor = palmAncestor.parent;
    return shoulder instanceof THREE.Bone
      && elbow instanceof THREE.Bone
      && wrist instanceof THREE.Bone
      && finger instanceof THREE.Bone
      && palmContact !== undefined
      && palmAncestor === wrist
      && palmContact.userData.positive_determinant === true
      && palmContact.userData.palm_forward_axis === '+Y'
      && palmContact.userData.palm_up_axis === '+Z'
      ? { shoulder, elbow, wrist, finger, palmContact, side }
      : null;
  };
  const chains = [chain('right'), chain('left')].filter((value): value is FirstPersonArmChain => value !== null);
  const fingers: FirstPersonFingerBone[] = [];
  const digitNames = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'] as const;
  for (const [suffix, side] of [['L', 'left'], ['R', 'right']] as const) {
    for (const digitName of digitNames) {
      for (const joint of [1, 2, 3] as const) {
        const bone = visual.getObjectByName(`${digitName}${joint}${suffix}`);
        if (bone instanceof THREE.Bone) {
          fingers.push({
            bone,
            bindQuaternion: bone.quaternion.clone(),
            side,
            digit: digitName.toLowerCase() as FirstPersonFingerBone['digit'],
            joint,
          });
        }
      }
    }
  }
  const knifeSocket = visual.getObjectByName('right-wrist-knife-socket');
  const rightWrist = visual.getObjectByName('WristR');
  let knifeAncestor: THREE.Object3D | null = knifeSocket?.parent ?? null;
  while (knifeAncestor && knifeAncestor !== rightWrist) knifeAncestor = knifeAncestor.parent;
  if (!knifeSocket || !(rightWrist instanceof THREE.Bone) || knifeAncestor !== rightWrist || fingers.length !== 30) return null;
  const mixer = new THREE.AnimationMixer(visual);
  const runtimeClips = firstPersonArmsAsset.clips.map(firstPersonArmRuntimeClip);
  const authoredTrackCount = firstPersonArmsAsset.clips.reduce((count, clip) => count + clip.tracks.length, 0);
  const runtimeTrackCount = runtimeClips.reduce((count, clip) => count + clip.tracks.length, 0);
  const actions = new Map(runtimeClips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  root.userData.firstPersonArmsRuntime = { mixer, actions, activeAction: null } satisfies FirstPersonArmsRuntime;
  root.userData.importedFirstPersonArms = false;
  root.userData.authoredFirstPersonArms = true;
  root.userData.firstPersonArmsSource = FIRST_PERSON_ARMS_URL;
  root.userData.materialContract = 'opaque-depth-writing';
  root.userData.firstPersonArmSurfaceContract = 'front-face-authored-pbr-v1';
  root.userData.firstPersonArmHandedness = handedness;
  root.userData.importedFirstPersonArmChains = chains.length;
  root.userData.authoredAnimationClipCount = actions.size;
  root.userData.authoredAnimationBlendPolicy = 'finger-tracks-first-runtime-ik-last';
  root.userData.authoredAnimationTrackPolicy = 'finger-bones-only';
  root.userData.authoredAnimationTrackCount = runtimeTrackCount;
  root.userData.authoredUpperChainTracksExcluded = authoredTrackCount - runtimeTrackCount;
  root.userData.authoredKnifeSocket = knifeSocket.name;
  root.userData.authoredPalmContactContract = 'full-transform-positive-determinant-plus-y-forward-plus-z-up-v1';
  root.userData.authoredPalmContacts = chains.map((entry) => entry.palmContact.name);
  return { root, chains, fingers, knifeSocket };
}

function firstPersonArmsRuntime(root: THREE.Object3D): FirstPersonArmsRuntime | null {
  return (root.userData.firstPersonArmsRuntime as FirstPersonArmsRuntime | undefined) ?? null;
}

export function resetFirstPersonArmFingers(fingers: readonly FirstPersonFingerBone[]): void {
  for (const finger of fingers) finger.bone.quaternion.copy(finger.bindQuaternion);
}

export function playFirstPersonArmAction(root: THREE.Object3D, actionName: string): boolean {
  const runtime = firstPersonArmsRuntime(root);
  const action = runtime?.actions.get(actionName);
  if (!runtime || !action) return false;
  runtime.mixer.stopAllAction();
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = false;
  action.play();
  runtime.activeAction = actionName;
  return true;
}

export function updateFirstPersonArmAnimations(root: THREE.Object3D, dt: number): void {
  const runtime = firstPersonArmsRuntime(root);
  if (!runtime) return;
  runtime.mixer.update(Math.min(0.05, Math.max(0, dt)));
  if (runtime.activeAction && runtime.actions.get(runtime.activeAction)?.isRunning() !== true) runtime.activeAction = null;
}

/** Clears a retained first-person action without advancing its mixer clock. */
export function resetFirstPersonArmAnimations(root: THREE.Object3D): void {
  const runtime = firstPersonArmsRuntime(root);
  if (!runtime) return;
  runtime.mixer.stopAllAction();
  for (const action of runtime.actions.values()) action.stop();
  runtime.mixer.setTime(0);
  runtime.activeAction = null;
}

export function firstPersonArmAnimationState(root: THREE.Object3D | undefined): Readonly<{
  clips: number;
  activeAction: string | null;
  blendPolicy: string;
  trackPolicy: string;
  runtimeTracks: number;
  upperChainTracksExcluded: number;
}> | null {
  if (!root) return null;
  const runtime = firstPersonArmsRuntime(root);
  if (!runtime) return null;
  return Object.freeze({
    clips: runtime.actions.size,
    activeAction: runtime.activeAction,
    blendPolicy: String(root.userData.authoredAnimationBlendPolicy ?? 'unknown'),
    trackPolicy: String(root.userData.authoredAnimationTrackPolicy ?? 'unknown'),
    runtimeTracks: Number(root.userData.authoredAnimationTrackCount ?? 0),
    upperChainTracksExcluded: Number(root.userData.authoredUpperChainTracksExcluded ?? 0),
  });
}

function runtime(root: THREE.Object3D): RiggedOperatorRuntime | undefined {
  return root.userData.riggedOperatorRuntime as RiggedOperatorRuntime | undefined;
}

function canonicalEvidenceManifest(
  evidence: RiggedOperatorCanonicalEvidence,
): RiggedOperatorCanonicalEvidenceManifest {
  if (evidence.manifest) return evidence.manifest;
  const skinnedMeshes = Object.freeze(evidence.skinnedMeshes.map((mesh) => {
    const boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone, index]));
    const position = mesh.geometry.getAttribute('position');
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    return Object.freeze({
      name: mesh.name,
      uuid: mesh.uuid,
      geometryUuid: mesh.geometry.uuid,
      positionCount: position?.count ?? -1,
      skinIndexCount: skinIndex?.count ?? -1,
      skinIndexItemSize: skinIndex?.itemSize ?? -1,
      skinIndexNormalized: skinIndex?.normalized ?? false,
      skinWeightCount: skinWeight?.count ?? -1,
      skinWeightItemSize: skinWeight?.itemSize ?? -1,
      skinWeightNormalized: skinWeight?.normalized ?? false,
      skeletonBones: Object.freeze(mesh.skeleton.bones.map((bone, index) => Object.freeze({
        index,
        name: bone.name,
        uuid: bone.uuid,
        parentIndex: bone.parent instanceof THREE.Bone ? (boneIndices.get(bone.parent) ?? -1) : -1,
      }))),
    });
  }));
  evidence.manifest = Object.freeze({
    contract: 'runtime-canonical-operator-skin-manifest-v1',
    assetUrl: evidence.assetUrl,
    lod: evidence.lod,
    visual: Object.freeze({ name: evidence.visual.name, uuid: evidence.visual.uuid }),
    skinnedMeshes,
    wrists: Object.freeze((['left', 'right'] as const).flatMap((side) => {
      const wrist = evidence.wrists[side];
      return wrist ? [Object.freeze({ side, name: wrist.name, uuid: wrist.uuid })] : [];
    })),
  });
  return evidence.manifest;
}

export function riggedOperatorCanonicalEvidenceManifest(
  root: THREE.Object3D,
): RiggedOperatorCanonicalEvidenceManifest | null {
  const evidence = runtime(root)?.canonicalEvidence;
  return evidence ? canonicalEvidenceManifest(evidence) : null;
}

export function riggedOperatorHandEvidenceIdentity(
  root: THREE.Object3D,
  side: 'left' | 'right',
): RiggedOperatorHandEvidenceIdentity | null {
  const runtimeState = runtime(root);
  const wrist = runtimeState?.canonicalEvidence.wrists[side];
  if (!runtimeState || !wrist || runtimeState.canonicalEvidence.skinnedMeshes.length === 0) return null;
  const manifest = canonicalEvidenceManifest(runtimeState.canonicalEvidence);
  return Object.freeze({
    operatorRoot: root,
    visual: runtimeState.canonicalEvidence.visual,
    side,
    wrist,
    skinnedMeshes: runtimeState.canonicalEvidence.skinnedMeshes,
    manifest,
  });
}

export function resolveRiggedOperatorRuntimeRoot(root: THREE.Object3D): THREE.Object3D | null {
  if (runtime(root)) return root;
  const candidates = root.children.filter((child) => runtime(child) !== undefined);
  return candidates.length === 1 ? candidates[0] : null;
}

function actionFor(runtimeState: RiggedOperatorRuntime, name: string): THREE.AnimationAction | undefined {
  const existing = runtimeState.actions.get(name);
  if (existing) return existing;
  const clip = runtimeState.clips.get(name);
  if (!clip) return undefined;
  const action = runtimeState.mixer.clipAction(clip);
  runtimeState.actions.set(name, action);
  return action;
}

const RIGGED_OPERATOR_ACTIONS_PER_TASK = 2;

async function performRiggedOperatorActionPrewarm(
  runtimeState: RiggedOperatorRuntime,
  actionNames: readonly string[],
): Promise<number> {
  let bound = 0;
  for (let index = 0; index < actionNames.length; index += 1) {
    const name = actionNames[index]!;
    const existed = runtimeState.actions.has(name);
    if (actionFor(runtimeState, name) && !existed) bound += 1;
    if (typeof document !== 'undefined'
      && (index + 1) % RIGGED_OPERATOR_ACTIONS_PER_TASK === 0
      && index + 1 < actionNames.length) {
      await yieldBrowserCpuTask();
    }
  }
  return bound;
}

/** Binds requested live animation actions in short CPU tasks before admission. */
export function prewarmRiggedOperatorActions(
  root: THREE.Object3D,
  actionNames: readonly string[] = RIGGED_OPERATOR_RUNTIME_ACTION_NAMES,
): Promise<number> {
  const runtimeState = runtime(root);
  if (!runtimeState) return Promise.resolve(0);
  return performRiggedOperatorActionPrewarm(runtimeState, actionNames);
}

function switchBaseAction(runtimeState: RiggedOperatorRuntime, name: string): void {
  if (runtimeState.currentBase === name) return;
  const previous = actionFor(runtimeState, runtimeState.currentBase);
  const next = actionFor(runtimeState, name);
  if (!next) return;
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.14).play();
  previous?.fadeOut(0.14);
  runtimeState.currentBase = name;
}

function playOneShot(runtimeState: RiggedOperatorRuntime, name: string, timeScale = 1): void {
  const action = actionFor(runtimeState, name);
  if (!action) return;
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.setLoop(THREE.LoopOnce, 1);
  action.setEffectiveTimeScale(timeScale);
  action.setEffectiveWeight(1);
  action.fadeIn(0.035).play();
}

export function createRiggedOperator(
  team: Team,
  name: string,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
): RiggedOperatorInstance | null {
  const operatorAsset = flattenMaterials ? operatorAssets.performance : operatorAssets.quality;
  if (!operatorAsset) return null;
  const root = new THREE.Group();
  root.name = name;
  root.userData.dynamic = true;

  const visual = cloneSkeleton(operatorAsset.scene) as THREE.Group;
  visual.name = 'rigged-operator-visual';
  // The source character's authored forward axis is opposite Atomic Acres'
  // existing operator convention. Correct it once at the visual root so AI,
  // network yaw and authoritative hit proxies keep their established axes.
  visual.rotation.y = Math.PI;
  const embeddedWeaponsSuppressed = suppressEmbeddedWeaponObjects(visual);
  const prepareMaterial = createOperatorInstanceMaterialResolver(team, flattenMaterials, appearance);
  const canonicalSkinnedMeshes: THREE.SkinnedMesh[] = [];
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.SkinnedMesh) canonicalSkinnedMeshes.push(node);
    node.castShadow = !flattenMaterials;
    node.receiveShadow = !flattenMaterials;
    node.userData.presentationOnly = true;
    node.raycast = () => undefined;
    if (Array.isArray(node.material)) node.material = node.material.map(prepareMaterial);
    else node.material = prepareMaterial(node.material);
  });
  // SkeletonUtils already creates independent bones and SkinnedMesh objects.
  // Their immutable vertex/index buffers can remain shared with the retained
  // operator source; selective fenced retirement disposes per-instance team
  // materials without copying or invalidating these multi-megabyte buffers.
  markMeshGeometriesShared(visual, 'rigged-operator-source');
  const stancePivot = new THREE.Group();
  stancePivot.name = 'operator-stance-pivot';
  stancePivot.position.y = STANCE_PIVOT_HEIGHT;
  visual.position.y -= STANCE_PIVOT_HEIGHT;
  stancePivot.add(visual);
  root.add(stancePivot);

  const weaponSocket = new THREE.Group();
  weaponSocket.name = 'weapon-socket';
  weaponSocket.position.set(0, 1.31, -0.18);
  root.add(weaponSocket);

  const mixer = new THREE.AnimationMixer(visual);
  const clips = new Map(riggedOperatorRuntimeClips(operatorAsset.clips).map((clip) => [clip.name, clip]));
  const actions = new Map<string, THREE.AnimationAction>();
  const base = clips.has('Idle_Gun_Pointing') ? 'Idle_Gun_Pointing' : clips.has('Idle_Gun') ? 'Idle_Gun' : 'Idle_Gun_Shoot';
  const baseClip = clips.get(base);
  if (baseClip) {
    const baseAction = mixer.clipAction(baseClip);
    actions.set(base, baseAction);
    baseAction.setLoop(THREE.LoopRepeat, Infinity).play();
  }
  const poseBone = (...names: string[]): THREE.Bone | undefined => {
    for (const candidate of names) {
      const node = visual.getObjectByName(candidate);
      if (node instanceof THREE.Bone) return node;
    }
    return undefined;
  };
  const armBindPose = RIGGED_OPERATOR_ARM_BONES.flatMap(({ side, role, sourceBone, names }) => {
    const bone = poseBone(...names);
    return bone ? [{
      side,
      role,
      sourceBone,
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    }] : [];
  });
  const handBindPose = RIGGED_OPERATOR_HAND_BONES.flatMap(({ side, digit, joint, sourceBone, names }) => {
    const bone = poseBone(...names);
    return bone ? [{
      side,
      digit,
      joint,
      sourceBone,
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    }] : [];
  });
  const canonicalWrists = Object.freeze({
    left: armBindPose.find((entry) => entry.side === 'left' && entry.role === 'wrist-hand')?.bone,
    right: armBindPose.find((entry) => entry.side === 'right' && entry.role === 'wrist-hand')?.bone,
  });
  const canonicalEvidence: RiggedOperatorCanonicalEvidence = {
    visual,
    skinnedMeshes: Object.freeze([...canonicalSkinnedMeshes]),
    wrists: canonicalWrists,
    assetUrl: operatorAsset.source,
    lod: operatorAsset.lod,
  };
  root.updateWorldMatrix(true, true);
  const operatorRootWorld = root.getWorldQuaternion(new THREE.Quaternion());
  for (const entry of armBindPose.filter(({ role }) => role === 'wrist-hand')) {
    // Convert the authored third-person wrist basis into Atomic Acres operator
    // root space. The weapon solve can then apply the existing weapon-specific
    // hand rotation without pretending the GLB bone axes equal socket axes.
    const wristWorld = entry.bone.getWorldQuaternion(new THREE.Quaternion());
    entry.bone.userData.riggedGripBasisCorrection = wristWorld.invert()
      .multiply(operatorRootWorld)
      .normalize()
      .toArray();
    entry.bone.userData.riggedGripBasisReference = {
      contract: 'authored-wrist-bind-to-operator-root-v1',
      sourceAsset: operatorAsset.source,
      sourceBone: entry.sourceBone,
    };
  }
  root.userData.riggedOperatorRuntime = {
    mixer,
    clips,
    actions,
    currentBase: base,
    lastUpdatedAt: performance.now(),
    stancePivot,
    visual,
    weaponSocket,
    canonicalEvidence,
    stance: 'stand',
    crouchBlend: 0,
    proneBlend: 0,
    speed: 0,
    poseBones: {
      hips: poseBone('Hips'),
      abdomen: poseBone('Abdomen'),
      torso: poseBone('Torso'),
      chest: poseBone('Chest'),
      head: poseBone('Head'),
      upperLegLeft: poseBone('UpperLegL', 'UpperLeg.L'),
      upperLegRight: poseBone('UpperLegR', 'UpperLeg.R'),
      lowerLegLeft: poseBone('LowerLegL', 'LowerLeg.L'),
      lowerLegRight: poseBone('LowerLegR', 'LowerLeg.R'),
      footLeft: poseBone('FootL', 'Foot.L'),
      footRight: poseBone('FootR', 'Foot.R'),
    },
    armBindPose,
    handBindPose,
  } satisfies RiggedOperatorRuntime;
  root.userData.operatorAsset = {
    source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
    assetUrl: operatorAsset.source,
    license: 'CC0-1.0',
    lod: operatorAsset.lod,
    skinnedMeshes: operatorAsset.skinnedMeshes,
    pbrMaterials: operatorAsset.pbrMaterials,
    materialContract: 'opaque-embedded-pbr-depth-writing',
    clips: operatorAsset.clips.length,
    embeddedWeaponsSuppressed,
  };
  root.userData.operatorAppearance = appearance;
  return { root, weaponSocket };
}

export function updateRiggedOperator(root: THREE.Object3D, speed: number, stance: 'stand' | 'crouch' | 'prone'): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - runtimeState.lastUpdatedAt) / 1_000));
  runtimeState.lastUpdatedAt = now;
  runtimeState.stance = stance;
  runtimeState.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
  for (const entry of runtimeState.poseBeforeStance ?? []) {
    entry.bone.position.copy(entry.position);
    entry.bone.quaternion.copy(entry.quaternion);
  }
  if (runtimeState.currentBase === 'Death') {
    runtimeState.mixer.update(dt);
    return true;
  }
  const next = stance !== 'stand'
    ? 'Idle_Gun_Pointing'
    : speed > 3.2 ? 'Run_Shoot' : speed > 0.18 ? 'Walk' : 'Idle_Gun_Pointing';
  switchBaseAction(runtimeState, runtimeState.clips.has(next) ? next : speed > 0.18 ? 'Run' : 'Idle_Gun');
  runtimeState.mixer.update(dt);
  runtimeState.poseBeforeStance = Object.values(runtimeState.poseBones)
    .filter((bone): bone is THREE.Bone => bone instanceof THREE.Bone)
    .map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    }));
  applyStancePose(runtimeState, dt);
  return true;
}

const UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS = 0.075;
const UNARMED_WRIST_AXIS_EPSILON = 1e-6;
const HAND_BIND_FLOOR_COMPARISON_EPSILON = 1e-9;
const HAND_BIND_FLOOR_AXIS_EPSILON = 1e-8;
const HAND_BIND_FLOOR_AXIS_CACHE_KEY = 'riggedHandBindFloorAxis';
const HAND_BIND_FLOOR_TELEMETRY_KEY = 'riggedHandBindFloorTelemetry';
const HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY = 'riggedHandBindFloorObservedAxisStorage';
type RiggedHandSide = 'left' | 'right';
type RiggedHandDigit = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
type RiggedHandBindFloorTelemetry = Record<string, unknown> & {
  contract: 'post-mixer-authored-bind-relative-hand-floor-v1';
  allocationContract: 'persistent-per-rendered-hand-bone-v1';
  generation: number;
  bindLocalQuaternion: number[];
  beforeLocalQuaternion: number[];
  afterLocalQuaternion: number[];
  observedShortestRelativeAxis: number[] | null;
  appliedAxis: number[];
};
const HAND_BIND_FLOOR_SCRATCH = {
  before: new THREE.Quaternion(),
  relative: new THREE.Quaternion(),
  observedAxis: new THREE.Vector3(),
  cachedAxis: new THREE.Vector3(),
  fallbackAxis: new THREE.Vector3(),
  appliedAxis: new THREE.Vector3(),
  targetDelta: new THREE.Quaternion(),
  normalizedBefore: new THREE.Quaternion(),
  normalizedAfter: new THREE.Quaternion(),
};
const UNARMED_WRIST_FALLBACK_AXIS = Object.freeze({
  left: Object.freeze([1, -0.45, -0.6] as const),
  right: Object.freeze([1, 0.45, 0.6] as const),
});

function writeQuaternionArray(target: number[], value: THREE.Quaternion): void {
  target[0] = value.x;
  target[1] = value.y;
  target[2] = value.z;
  target[3] = value.w;
}

function writeVectorArray(target: number[], value: THREE.Vector3): void {
  target[0] = value.x;
  target[1] = value.y;
  target[2] = value.z;
}

/**
 * Enforce a post-mixer angular floor on one rendered hand joint relative to
 * its immutable authored GLB bind quaternion. Nonzero poses retain the
 * shortest bind-relative rotation axis; exact cancellation reuses the last
 * observed axis before falling back to the caller's authored curl axis.
 */
export function enforceRiggedOperatorHandBindDeltaFloor(
  root: THREE.Object3D,
  side: RiggedHandSide,
  digit: RiggedHandDigit,
  minimumBindDeltaRadians: number,
  fallbackAxis: readonly [number, number, number],
): Record<string, unknown> | null {
  const runtimeState = runtime(root);
  if (!runtimeState) return null;
  let entry: RiggedOperatorRuntime['handBindPose'][number] | undefined;
  for (const candidate of runtimeState.handBindPose) {
    if (candidate.side === side && candidate.digit === digit) {
      entry = candidate;
      break;
    }
  }
  if (!entry || !Number.isFinite(minimumBindDeltaRadians)
    || minimumBindDeltaRadians <= 0 || minimumBindDeltaRadians >= Math.PI) return null;
  const bindLocalQuaternion = entry.quaternion;
  const bindQuaternionNorm = bindLocalQuaternion.length();
  const normalizedBindDotTarget = Math.cos(minimumBindDeltaRadians / 2) / bindQuaternionNorm;
  if (!Number.isFinite(bindQuaternionNorm) || bindQuaternionNorm <= HAND_BIND_FLOOR_AXIS_EPSILON
    || !Number.isFinite(normalizedBindDotTarget) || normalizedBindDotTarget > 1) return null;
  // GLB quaternion components are float32 and can differ from unit length by a
  // few e-8. Three's Quaternion.angleTo intentionally uses the stored values,
  // so solve the unit output angle that makes that immutable authored value
  // report the requested floor instead of silently missing it by float error.
  const floorTargetRelativeAngleRadians = 2 * Math.acos(THREE.MathUtils.clamp(normalizedBindDotTarget, -1, 1));
  const beforeLocalQuaternion = HAND_BIND_FLOOR_SCRATCH.before.copy(entry.bone.quaternion);
  const beforeBindDeltaRadians = beforeLocalQuaternion.angleTo(bindLocalQuaternion);
  const relative = HAND_BIND_FLOOR_SCRATCH.relative.copy(bindLocalQuaternion)
    .invert().multiply(beforeLocalQuaternion).normalize();
  if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
  const relativeAxisLength = Math.hypot(relative.x, relative.y, relative.z);
  const observedAxisAvailable = relativeAxisLength > HAND_BIND_FLOOR_AXIS_EPSILON;
  if (observedAxisAvailable) {
    HAND_BIND_FLOOR_SCRATCH.observedAxis.set(relative.x, relative.y, relative.z).divideScalar(relativeAxisLength);
  }
  const cachedAxisValue = entry.bone.userData[HAND_BIND_FLOOR_AXIS_CACHE_KEY];
  const cachedAxisAvailable = Array.isArray(cachedAxisValue) && cachedAxisValue.length === 3
    && typeof cachedAxisValue[0] === 'number' && Number.isFinite(cachedAxisValue[0])
    && typeof cachedAxisValue[1] === 'number' && Number.isFinite(cachedAxisValue[1])
    && typeof cachedAxisValue[2] === 'number' && Number.isFinite(cachedAxisValue[2])
    && HAND_BIND_FLOOR_SCRATCH.cachedAxis.fromArray(cachedAxisValue as [number, number, number]).lengthSq()
      > HAND_BIND_FLOOR_AXIS_EPSILON ** 2;
  if (cachedAxisAvailable) HAND_BIND_FLOOR_SCRATCH.cachedAxis.normalize();
  const authoredFallbackAxis = HAND_BIND_FLOOR_SCRATCH.fallbackAxis.set(...fallbackAxis);
  if (authoredFallbackAxis.lengthSq() <= HAND_BIND_FLOOR_AXIS_EPSILON ** 2) return null;
  authoredFallbackAxis.normalize();
  const intervened = beforeBindDeltaRadians
    < minimumBindDeltaRadians - HAND_BIND_FLOOR_COMPARISON_EPSILON;
  const continuityReferenceAxis = cachedAxisAvailable
    ? HAND_BIND_FLOOR_SCRATCH.cachedAxis
    : authoredFallbackAxis;
  const appliedAxis = HAND_BIND_FLOOR_SCRATCH.appliedAxis.copy(observedAxisAvailable
    ? HAND_BIND_FLOOR_SCRATCH.observedAxis
    : continuityReferenceAxis);
  // A real observed axis seeds the persistent hemisphere without being
  // rewritten. Subsequent sub-floor cancellation samples align to that prior
  // observation; exact bind uses the authored fallback only when no observed
  // direction has ever existed.
  const alignedObservedAxisHemisphere = intervened && observedAxisAvailable && cachedAxisAvailable
    && appliedAxis.dot(continuityReferenceAxis) < 0;
  if (alignedObservedAxisHemisphere) appliedAxis.negate();
  const axisSource = observedAxisAvailable
    ? alignedObservedAxisHemisphere
      ? 'shortest-bind-relative-aligned-to-previous'
      : 'shortest-bind-relative'
    : cachedAxisAvailable ? 'previous-shortest-bind-relative' : 'authored-curl-fallback';
  if (intervened) {
    entry.bone.quaternion.copy(bindLocalQuaternion).multiply(
      HAND_BIND_FLOOR_SCRATCH.targetDelta.setFromAxisAngle(appliedAxis, floorTargetRelativeAngleRadians),
    ).normalize();
  }
  let persistentAxisCache = cachedAxisValue as number[] | undefined;
  if (!Array.isArray(persistentAxisCache) || persistentAxisCache.length !== 3) {
    persistentAxisCache = [0, 0, 0];
    entry.bone.userData[HAND_BIND_FLOOR_AXIS_CACHE_KEY] = persistentAxisCache;
  }
  // While the source pose is inside the prohibited bind neighbourhood, keep
  // the cached axis hemisphere continuous across +0/-0 cancellation. Once a
  // real animation phase clears the floor it owns the cache again unchanged.
  if (observedAxisAvailable) writeVectorArray(
    persistentAxisCache,
    intervened ? appliedAxis : HAND_BIND_FLOOR_SCRATCH.observedAxis,
  );
  else if (!cachedAxisAvailable) writeVectorArray(persistentAxisCache, appliedAxis);
  entry.bone.updateWorldMatrix(false, true);
  const afterBindDeltaRadians = entry.bone.quaternion.angleTo(bindLocalQuaternion);
  const reportedBindDeltaCorrectionRadians = intervened
    ? Math.max(0, minimumBindDeltaRadians - beforeBindDeltaRadians)
    : 0;
  const renderedOrientationCorrectionRadians = intervened
    ? HAND_BIND_FLOOR_SCRATCH.normalizedBefore.copy(beforeLocalQuaternion).normalize()
      .angleTo(HAND_BIND_FLOOR_SCRATCH.normalizedAfter.copy(entry.bone.quaternion).normalize())
    : 0;
  let telemetry = entry.bone.userData[HAND_BIND_FLOOR_TELEMETRY_KEY] as RiggedHandBindFloorTelemetry | undefined;
  if (telemetry?.allocationContract !== 'persistent-per-rendered-hand-bone-v1') {
    telemetry = {
      contract: 'post-mixer-authored-bind-relative-hand-floor-v1',
      allocationContract: 'persistent-per-rendered-hand-bone-v1',
      generation: 0,
      bindLocalQuaternion: [0, 0, 0, 1],
      beforeLocalQuaternion: [0, 0, 0, 1],
      afterLocalQuaternion: [0, 0, 0, 1],
      observedShortestRelativeAxis: null,
      appliedAxis: [0, 0, 0],
    };
    entry.bone.userData[HAND_BIND_FLOOR_TELEMETRY_KEY] = telemetry;
  }
  let observedAxisStorage = entry.bone.userData[HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY] as number[] | undefined;
  if (!Array.isArray(observedAxisStorage) || observedAxisStorage.length !== 3) {
    observedAxisStorage = [0, 0, 0];
    entry.bone.userData[HAND_BIND_FLOOR_OBSERVED_AXIS_STORAGE_KEY] = observedAxisStorage;
  }
  if (observedAxisAvailable) writeVectorArray(observedAxisStorage, HAND_BIND_FLOOR_SCRATCH.observedAxis);
  writeQuaternionArray(telemetry.bindLocalQuaternion, bindLocalQuaternion);
  writeQuaternionArray(telemetry.beforeLocalQuaternion, beforeLocalQuaternion);
  writeQuaternionArray(telemetry.afterLocalQuaternion, entry.bone.quaternion);
  writeVectorArray(telemetry.appliedAxis, appliedAxis);
  telemetry.generation += 1;
  telemetry.reference = 'immutable-authored-handBindPose-before-animation';
  telemetry.side = side;
  telemetry.digit = digit;
  telemetry.sourceBone = entry.sourceBone;
  telemetry.bone = entry.bone.name;
  telemetry.minimumBindDeltaRadians = minimumBindDeltaRadians;
  telemetry.bindQuaternionNorm = bindQuaternionNorm;
  telemetry.floorTargetRelativeAngleRadians = floorTargetRelativeAngleRadians;
  telemetry.bindNormCompensationRadians = floorTargetRelativeAngleRadians - minimumBindDeltaRadians;
  telemetry.beforeBindDeltaRadians = beforeBindDeltaRadians;
  telemetry.afterBindDeltaRadians = afterBindDeltaRadians;
  telemetry.reportedBindDeltaCorrectionRadians = reportedBindDeltaCorrectionRadians;
  telemetry.renderedOrientationCorrectionRadians = renderedOrientationCorrectionRadians;
  telemetry.observedShortestRelativeAxis = observedAxisAvailable ? observedAxisStorage : null;
  telemetry.axisSource = axisSource;
  telemetry.alignedObservedAxisHemisphere = alignedObservedAxisHemisphere;
  telemetry.continuityReference = intervened
    ? cachedAxisAvailable
      ? 'previous-shortest-bind-relative'
      : observedAxisAvailable ? null : 'authored-curl-fallback'
    : null;
  telemetry.intervened = intervened;
  telemetry.preservedShortestRelativeAxis = observedAxisAvailable
    ? Math.abs(HAND_BIND_FLOOR_SCRATCH.observedAxis.dot(appliedAxis)) >= 1 - 1e-9
    : intervened ? null : true;
  telemetry.usedPreviousAxis = !observedAxisAvailable && cachedAxisAvailable;
  telemetry.usedFallbackAxis = !observedAxisAvailable && !cachedAxisAvailable;
  telemetry.appliedToRenderedBone = true;
  telemetry.allFinite = Number.isFinite(minimumBindDeltaRadians)
    && Number.isFinite(bindQuaternionNorm)
    && Number.isFinite(floorTargetRelativeAngleRadians)
    && Number.isFinite(beforeBindDeltaRadians)
    && Number.isFinite(afterBindDeltaRadians)
    && Number.isFinite(reportedBindDeltaCorrectionRadians)
    && Number.isFinite(renderedOrientationCorrectionRadians)
    && telemetry.bindLocalQuaternion.every(Number.isFinite)
    && telemetry.beforeLocalQuaternion.every(Number.isFinite)
    && telemetry.afterLocalQuaternion.every(Number.isFinite)
    && telemetry.appliedAxis.every(Number.isFinite);
  return telemetry;
}

/**
 * Keep an unarmed operator's rendered hands in a natural, deterministic rest
 * pose after the locomotion mixer. Shoulder, elbow and finger animation stays
 * live. A wrist already beyond the floor is untouched; a near-bind wrist keeps
 * its animated relative-rotation axis and only gains enough angle to reach the
 * floor. Exact bind pose uses a mirrored natural fallback axis. Armed operators
 * never call this path because their final wrist pose is owned by weapon grip IK.
 */
export function poseUnarmedRiggedOperatorHands(root: THREE.Object3D): Record<string, unknown> | null {
  const runtimeState = runtime(root);
  if (!runtimeState) return null;
  const entries = runtimeState.armBindPose
    .filter(({ role }) => role === 'wrist-hand')
    .map((entry) => {
      const beforeBindDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
      let intervened = false;
      let usedMirroredFallbackAxis = false;
      if (beforeBindDeltaRadians < UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS) {
        const relative = entry.quaternion.clone().invert().multiply(entry.bone.quaternion).normalize();
        if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
        const relativeAxisLength = Math.hypot(relative.x, relative.y, relative.z);
        const axis = beforeBindDeltaRadians > UNARMED_WRIST_AXIS_EPSILON
          && relativeAxisLength > UNARMED_WRIST_AXIS_EPSILON
          ? new THREE.Vector3(relative.x, relative.y, relative.z).divideScalar(relativeAxisLength)
          : new THREE.Vector3(...UNARMED_WRIST_FALLBACK_AXIS[entry.side]).normalize();
        usedMirroredFallbackAxis = beforeBindDeltaRadians <= UNARMED_WRIST_AXIS_EPSILON;
        const enforcedDelta = new THREE.Quaternion().setFromAxisAngle(
          axis,
          UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS,
        );
        entry.bone.quaternion.copy(entry.quaternion).multiply(enforcedDelta).normalize();
        intervened = true;
      }
      entry.bone.updateWorldMatrix(false, true);
      return {
        side: entry.side,
        sourceBone: entry.sourceBone,
        bone: entry.bone.name,
        minimumBindDeltaRadians: UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS,
        beforeBindDeltaRadians,
        afterBindDeltaRadians: entry.bone.quaternion.angleTo(entry.quaternion),
        intervened,
        preservedAnimatedAxis: intervened && !usedMirroredFallbackAxis,
        usedMirroredFallbackAxis,
        appliedToRenderedBone: true,
      };
    });
  return {
    contract: 'post-mixer-unarmed-wrist-rest-v1',
    expectedBoneCount: 2,
    entries,
    allApplied: entries.length === 2 && entries.every(({ appliedToRenderedBone }) => appliedToRenderedBone),
    allAtOrAboveFloor: entries.length === 2 && entries.every(({ afterBindDeltaRadians }) => (
      afterBindDeltaRadians >= UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS - 1e-9
    )),
  };
}

export function fireRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, runtimeState.clips.has('Gun_Shoot') ? 'Gun_Shoot' : 'Idle_Gun_Shoot', 1.35);
  return true;
}

export function reactRiggedOperator(root: THREE.Object3D, alternate = false): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, alternate && runtimeState.clips.has('HitRecieve_2') ? 'HitRecieve_2' : 'HitRecieve', 1.15);
  return true;
}

export function deathRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState || !runtimeState.clips.has('Death')) return false;
  for (const action of runtimeState.actions.values()) action.fadeOut(0.04);
  playOneShot(runtimeState, 'Death', 1.08);
  runtimeState.currentBase = 'Death';
  return true;
}

export function resetRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  for (const action of runtimeState.actions.values()) action.stop();
  const base = runtimeState.clips.has('Idle_Gun_Pointing')
    ? 'Idle_Gun_Pointing'
    : runtimeState.clips.has('Idle_Gun') ? 'Idle_Gun' : 'Idle_Gun_Shoot';
  actionFor(runtimeState, base)?.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  runtimeState.currentBase = base;
  runtimeState.stance = 'stand';
  runtimeState.crouchBlend = 0;
  runtimeState.proneBlend = 0;
  runtimeState.poseBeforeStance = undefined;
  runtimeState.stancePivot.position.set(0, STANCE_PIVOT_HEIGHT, 0);
  runtimeState.stancePivot.rotation.set(0, 0, 0);
  runtimeState.weaponSocket.position.set(0, 1.31, -0.18);
  runtimeState.weaponSocket.rotation.set(0, 0, 0);
  runtimeState.lastUpdatedAt = performance.now();
  return true;
}

export function meleeRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, runtimeState.clips.has('Punch_Right') ? 'Punch_Right' : 'Kick_Right', 1.4);
  return true;
}

export function riggedOperatorTelemetry(root: THREE.Object3D): Record<string, unknown> | null {
  const runtimeState = runtime(root);
  if (!runtimeState) return null;
  const weaponRoot = runtimeState.weaponSocket.children[0];
  let weaponBounds: { center: number[]; size: number[]; distanceFromSocket: number } | null = null;
  if (weaponRoot) {
    weaponRoot.updateWorldMatrix(true, true);
    const rootInverse = weaponRoot.matrixWorld.clone().invert();
    const localBounds = new THREE.Box3().makeEmpty();
    weaponRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) return;
      const meshToWeapon = rootInverse.clone().multiply(child.matrixWorld);
      localBounds.union(child.geometry.boundingBox.clone().applyMatrix4(meshToWeapon));
    });
    if (!localBounds.isEmpty()) {
      const center = localBounds.getCenter(new THREE.Vector3()).applyMatrix4(weaponRoot.matrixWorld);
      const size = localBounds.getSize(new THREE.Vector3());
      const worldScale = weaponRoot.getWorldScale(new THREE.Vector3());
      size.multiply(new THREE.Vector3(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)));
      const socketPosition = runtimeState.weaponSocket.getWorldPosition(new THREE.Vector3());
      weaponBounds = { center: center.toArray(), size: size.toArray(), distanceFromSocket: center.distanceTo(socketPosition) };
    }
  }
  const localMountBounds = weaponRoot ? objectLocalGeometryBounds(weaponRoot) : null;
  let muzzleForwardDot: number | null = null;
  if (weaponRoot) {
    const grip = weaponRoot.getObjectByName('grip-socket-r');
    const muzzle = weaponRoot.getObjectByName('muzzle-socket');
    if (grip && muzzle) {
      const aim = muzzle.getWorldPosition(new THREE.Vector3()).sub(grip.getWorldPosition(new THREE.Vector3()));
      const operatorForward = new THREE.Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
      if (aim.lengthSq() > 1e-8) muzzleForwardDot = aim.normalize().dot(operatorForward.normalize());
    }
  }
  const effectivelyVisible = (node: THREE.Object3D): boolean => {
    let cursor: THREE.Object3D | null = node;
    while (cursor) {
      if (!cursor.visible) return false;
      cursor = cursor.parent;
    }
    return true;
  };
  const skinnedMeshIsRenderable = (mesh: THREE.SkinnedMesh): boolean => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return effectivelyVisible(mesh)
      && materials.some((material) => material.visible && material.colorWrite
        && (!material.transparent || material.opacity > 0))
      && (mesh.geometry.getAttribute('position')?.count ?? 0) > 0;
  };
  const effectiveSkinnedMeshes: THREE.SkinnedMesh[] = [];
  let visibleSkinnedMeshes = 0;
  let visibleEmbeddedWeapons = 0;
  runtimeState.visual.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh && node.visible) {
      visibleSkinnedMeshes += 1;
      if (skinnedMeshIsRenderable(node)) effectiveSkinnedMeshes.push(node);
    }
    if (node.userData.embeddedWeaponSuppressed === true && node.visible) visibleEmbeddedWeapons += 1;
  });
  const headBoneWorld = runtimeState.poseBones.head?.getWorldPosition(new THREE.Vector3()) ?? null;
  const headProxy = root.getObjectByName('authoritative-hit-proxies')?.children.find(
    (node) => node.userData.authoritativeProxy === true && node.userData.hitZone === 'head',
  );
  const hitProxyHeadWorld = headProxy?.getWorldPosition(new THREE.Vector3()) ?? null;
  root.updateWorldMatrix(true, true);
  const skinMembership = (bone: THREE.Bone): string[] => effectiveSkinnedMeshes
    .filter((mesh) => mesh.skeleton.bones.includes(bone))
    .map((mesh) => mesh.name);
  const attributeComponent = (
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    vertex: number,
    slot: number,
  ): number => {
    if (slot === 0) return attribute.getX(vertex);
    if (slot === 1) return attribute.getY(vertex);
    if (slot === 2) return attribute.getZ(vertex);
    return attribute.getW(vertex);
  };
  const bufferAttributeVersion = (
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  ): number => {
    if (!attribute) return -1;
    return attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
  };
  const renderedInfluenceSignature = effectiveSkinnedMeshes.map((mesh) => {
    const joints = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const positions = mesh.geometry.getAttribute('position');
    return [
      mesh.uuid,
      mesh.geometry.uuid,
      positions?.count ?? -1,
      bufferAttributeVersion(joints),
      bufferAttributeVersion(weights),
      mesh.geometry.index?.version ?? -1,
      mesh.geometry.drawRange.start,
      mesh.geometry.drawRange.count,
    ].join(':');
  }).join('|');
  let renderedInfluenceCache = runtimeState.renderedInfluenceCache;
  if (!renderedInfluenceCache || renderedInfluenceCache.signature !== renderedInfluenceSignature) {
    renderedInfluenceCache = {
      signature: renderedInfluenceSignature,
      generation: (renderedInfluenceCache?.generation ?? 0) + 1,
      byBone: new Map(),
    };
    runtimeState.renderedInfluenceCache = renderedInfluenceCache;
  }
  let renderedInfluenceComputedBones = 0;
  let renderedInfluenceReusedBones = 0;
  const renderedVertexInfluence = (bone: THREE.Bone): RenderedVertexInfluenceTelemetry => {
    const cached = renderedInfluenceCache.byBone.get(bone);
    if (cached) {
      renderedInfluenceReusedBones += 1;
      return cached;
    }
    let influencedVertexCount = 0;
    let maximumNormalizedWeight = 0;
    const meshes: RenderedVertexInfluenceMeshTelemetry[] = [];
    for (const mesh of effectiveSkinnedMeshes) {
      const jointIndex = mesh.skeleton.bones.indexOf(bone);
      const joints = mesh.geometry.getAttribute('skinIndex');
      const weights = mesh.geometry.getAttribute('skinWeight');
      const positions = mesh.geometry.getAttribute('position');
      if (jointIndex < 0 || !joints || !weights || !positions || joints.itemSize < 4 || weights.itemSize < 4) continue;
      const renderedVertices = new Set<number>();
      const index = mesh.geometry.index;
      const drawStart = Math.max(0, mesh.geometry.drawRange.start);
      const available = index?.count ?? positions.count;
      const drawCount = Number.isFinite(mesh.geometry.drawRange.count)
        ? Math.min(mesh.geometry.drawRange.count, available - drawStart)
        : available - drawStart;
      for (let drawIndex = drawStart; drawIndex < drawStart + Math.max(0, drawCount); drawIndex += 1) {
        renderedVertices.add(index ? index.getX(drawIndex) : drawIndex);
      }
      let meshInfluencedVertexCount = 0;
      let meshMaximumNormalizedWeight = 0;
      for (const vertex of renderedVertices) {
        let totalWeight = 0;
        let boneWeight = 0;
        for (let slot = 0; slot < 4; slot += 1) {
          const weight = attributeComponent(weights, vertex, slot);
          totalWeight += weight;
          if (Math.round(attributeComponent(joints, vertex, slot)) === jointIndex) boneWeight += weight;
        }
        const normalizedWeight = totalWeight > 1e-8 ? boneWeight / totalWeight : 0;
        if (normalizedWeight >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumNormalizedWeight) {
          meshInfluencedVertexCount += 1;
        }
        meshMaximumNormalizedWeight = Math.max(meshMaximumNormalizedWeight, normalizedWeight);
      }
      if (meshInfluencedVertexCount > 0 || meshMaximumNormalizedWeight > 0) {
        meshes.push({
          mesh: mesh.name,
          meshUuid: mesh.uuid,
          geometryUuid: mesh.geometry.uuid,
          influencedVertexCount: meshInfluencedVertexCount,
          maximumNormalizedWeight: meshMaximumNormalizedWeight,
        });
      }
      influencedVertexCount += meshInfluencedVertexCount;
      maximumNormalizedWeight = Math.max(maximumNormalizedWeight, meshMaximumNormalizedWeight);
    }
    const telemetry: RenderedVertexInfluenceTelemetry = {
      contract: 'rendered-joints0-weights0-influence-v2',
      bone: bone.name,
      boneUuid: bone.uuid,
      thresholds: RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS,
      influencedVertexCount,
      maximumNormalizedWeight,
      meshes,
      passes: influencedVertexCount >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices
        && maximumNormalizedWeight >= RIGGED_OPERATOR_RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight,
    };
    renderedInfluenceCache.byBone.set(bone, telemetry);
    renderedInfluenceComputedBones += 1;
    return telemetry;
  };
  const descendantPath = (descendant: THREE.Object3D, ancestor: THREE.Object3D): string[] | null => {
    const path = [descendant.name];
    let cursor = descendant.parent;
    while (cursor) {
      path.unshift(cursor.name);
      if (cursor === ancestor) return path;
      cursor = cursor.parent;
    }
    return null;
  };
  const armPoseBones = (runtimeState.armBindPose ?? []).map((entry) => {
    const localPosition = entry.bone.position.toArray();
    const localQuaternion = entry.bone.quaternion.toArray();
    const worldPosition = entry.bone.getWorldPosition(new THREE.Vector3()).toArray();
    const worldQuaternion = entry.bone.getWorldQuaternion(new THREE.Quaternion()).toArray();
    const bindPositionDelta = entry.bone.position.distanceTo(entry.position);
    const bindQuaternionDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
    const vertexInfluence = renderedVertexInfluence(entry.bone);
    return {
      side: entry.side,
      role: entry.role,
      sourceBone: entry.sourceBone,
      bone: entry.bone.name,
      parentBone: entry.bone.parent?.name ?? null,
      effectiveSkinnedMeshes: skinMembership(entry.bone),
      localPosition,
      localQuaternion,
      worldPosition,
      worldQuaternion,
      bindLocalPosition: entry.position.toArray(),
      bindLocalQuaternion: entry.quaternion.toArray(),
      bindPositionDelta,
      bindQuaternionDeltaRadians,
      inEffectivelyVisibleSkinnedMesh: skinMembership(entry.bone).length > 0,
      vertexInfluence,
      finite: [
        ...localPosition,
        ...localQuaternion,
        ...worldPosition,
        ...worldQuaternion,
        bindPositionDelta,
        bindQuaternionDeltaRadians,
      ].every(Number.isFinite),
    };
  });
  const handPoseBones = (runtimeState.handBindPose ?? []).map((entry) => {
    const wrist = runtimeState.armBindPose.find((candidate) => (
      candidate.side === entry.side && candidate.role === 'wrist-hand'
    ))?.bone;
    const localPosition = entry.bone.position.toArray();
    const localQuaternion = entry.bone.quaternion.toArray();
    const worldPosition = entry.bone.getWorldPosition(new THREE.Vector3()).toArray();
    const worldQuaternion = entry.bone.getWorldQuaternion(new THREE.Quaternion()).toArray();
    const bindQuaternionDeltaRadians = entry.bone.quaternion.angleTo(entry.quaternion);
    const effectiveSkinMembership = skinMembership(entry.bone);
    const wristDescendantPath = wrist ? descendantPath(entry.bone, wrist) : null;
    const vertexInfluence = renderedVertexInfluence(entry.bone);
    return {
      side: entry.side,
      digit: entry.digit,
      joint: entry.joint,
      sourceBone: entry.sourceBone,
      bone: entry.bone.name,
      parentBone: entry.bone.parent?.name ?? null,
      wristBone: wrist?.name ?? null,
      wristDescendantPath,
      descendantOfWrist: wristDescendantPath !== null,
      effectiveSkinnedMeshes: effectiveSkinMembership,
      inEffectivelyVisibleSkinnedMesh: effectiveSkinMembership.length > 0,
      vertexInfluence,
      localPosition,
      localQuaternion,
      worldPosition,
      worldQuaternion,
      bindLocalPosition: entry.position.toArray(),
      bindLocalQuaternion: entry.quaternion.toArray(),
      bindQuaternionDeltaRadians,
      finite: [
        ...localPosition,
        ...localQuaternion,
        ...worldPosition,
        ...worldQuaternion,
        bindQuaternionDeltaRadians,
      ].every(Number.isFinite),
    };
  });
  const commonEffectiveSkinMeshes = effectiveSkinnedMeshes
    .filter((mesh) => [...(runtimeState.armBindPose ?? []), ...(runtimeState.handBindPose ?? [])]
      .every((entry) => mesh.skeleton.bones.includes(entry.bone)))
    .map((mesh) => mesh.name);
  const armChains = (['left', 'right'] as const).map((side) => {
    const shoulder = armPoseBones.find((bone) => bone.side === side && bone.role === 'shoulder');
    const elbow = armPoseBones.find((bone) => bone.side === side && bone.role === 'elbow');
    const wrist = armPoseBones.find((bone) => bone.side === side && bone.role === 'wrist-hand');
    if (!shoulder || !elbow || !wrist) return { side, complete: false };
    const shoulderWorld = new THREE.Vector3().fromArray(shoulder.worldPosition);
    const elbowWorld = new THREE.Vector3().fromArray(elbow.worldPosition);
    const wristWorld = new THREE.Vector3().fromArray(wrist.worldPosition);
    const shoulderToElbow = elbowWorld.clone().sub(shoulderWorld);
    const elbowToWrist = wristWorld.clone().sub(elbowWorld);
    const shoulderToWrist = wristWorld.clone().sub(shoulderWorld);
    const upperArmLength = shoulderToElbow.length();
    const forearmLength = elbowToWrist.length();
    const armLength = upperArmLength + forearmLength;
    const elbowBendRadians = shoulderWorld.clone().sub(elbowWorld).angleTo(elbowToWrist);
    const elbowFlexRadians = Math.PI - elbowBendRadians;
    const shoulderToWristVerticalDrop = shoulderWorld.y - wristWorld.y;
    const shoulderToWristHorizontalReach = Math.hypot(shoulderToWrist.x, shoulderToWrist.z);
    const torsoWorld = runtimeState.poseBones.torso?.getWorldPosition(new THREE.Vector3()) ?? null;
    const outwardAxis = torsoWorld ? shoulderWorld.clone().sub(torsoWorld).setY(0) : new THREE.Vector3();
    const shoulderToWristOutwardReach = outwardAxis.lengthSq() > 1e-8
      ? shoulderToWrist.dot(outwardAxis.normalize())
      : Number.NaN;
    const hierarchyPath = descendantPath(
      runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'wrist-hand')!.bone,
      runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'shoulder')!.bone,
    );
    const directHierarchy = hierarchyPath?.length === 3
      && runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'elbow')?.bone.parent
        === runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'shoulder')?.bone
      && runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'wrist-hand')?.bone.parent
        === runtimeState.armBindPose.find((entry) => entry.side === side && entry.role === 'elbow')?.bone;
    const shoulderToWristVerticalDropRatio = shoulderToWristVerticalDrop / Math.max(armLength, 1e-6);
    const shoulderToWristHorizontalReachRatio = shoulderToWristHorizontalReach / Math.max(armLength, 1e-6);
    const shoulderToWristOutwardReachRatio = Math.abs(shoulderToWristOutwardReach) / Math.max(armLength, 1e-6);
    return {
      side,
      complete: true,
      hierarchyPath,
      directHierarchy,
      upperArmLength,
      forearmLength,
      armLength,
      elbowBendRadians,
      elbowFlexRadians,
      upperArmVerticalDrop: shoulderWorld.y - elbowWorld.y,
      forearmVerticalDrop: elbowWorld.y - wristWorld.y,
      shoulderToWristVerticalDrop,
      shoulderToWristVerticalDropRatio,
      shoulderToWristHorizontalReach,
      shoulderToWristHorizontalReachRatio,
      shoulderOutwardAxis: outwardAxis.toArray(),
      shoulderToWristOutwardReach,
      shoulderToWristOutwardReachRatio,
      verticalDropToOutwardReachRatio: shoulderToWristVerticalDrop
        / Math.max(Math.abs(shoulderToWristOutwardReach), 1e-6),
      antiTPoseGeometry: directHierarchy === true
        && shoulderToWristVerticalDrop >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumVerticalDropM
        && shoulderToWristVerticalDropRatio >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumVerticalDropRatio
        && shoulderToWristHorizontalReachRatio <= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.maximumHorizontalReachRatio
        && shoulderToWristOutwardReachRatio <= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.maximumOutwardReachRatio
        && elbowFlexRadians >= RIGGED_OPERATOR_ANTI_T_THRESHOLDS.minimumElbowFlexRadians,
    };
  });
  return {
    source: root.userData.operatorAsset?.source,
    assetUrl: root.userData.operatorAsset?.assetUrl,
    appearance: root.userData.operatorAppearance,
    license: root.userData.operatorAsset?.license,
    lod: root.userData.operatorAsset?.lod,
    skinnedMeshes: root.userData.operatorAsset?.skinnedMeshes,
    pbrMaterials: root.userData.operatorAsset?.pbrMaterials,
    materialContract: root.userData.operatorAsset?.materialContract,
    clips: root.userData.operatorAsset?.clips,
    runtimeClips: runtimeState.clips.size,
    runtimeActionsBound: runtimeState.actions.size,
    embeddedWeaponsSuppressed: root.userData.operatorAsset?.embeddedWeaponsSuppressed,
    visibleEmbeddedWeapons,
    activeClip: runtimeState.currentBase,
    animationContract: {
      base: runtimeState.currentBase,
      stance: runtimeState.stance,
      crouchBlend: runtimeState.crouchBlend,
      proneBlend: runtimeState.proneBlend,
      pivotHeight: runtimeState.stancePivot.position.y,
      pivotPitch: runtimeState.stancePivot.rotation.x,
      speed: runtimeState.speed,
      mixerBeforeSupportIk: true,
    },
    skeletons: runtimeState.visual.getObjectsByProperty('isSkinnedMesh', true).length,
    visibleSkinnedMeshes,
    effectivelyVisibleSkinnedMeshes: effectiveSkinnedMeshes.map((mesh) => mesh.name),
    headBoneWorld: headBoneWorld?.toArray() ?? null,
    hitProxyHeadWorld: hitProxyHeadWorld?.toArray() ?? null,
    hitProxyHeadDelta: headBoneWorld && hitProxyHeadWorld ? headBoneWorld.distanceTo(hitProxyHeadWorld) : null,
    armBonesPresent: (runtimeState.armBindPose ?? []).length,
    armPose: {
      contract: 'source-glb-skinned-anti-t-arm-chain-v2',
      reference: 'authored-glb-local-transform-before-animation',
      thresholds: RIGGED_OPERATOR_ANTI_T_THRESHOLDS,
      expectedBoneCount: RIGGED_OPERATOR_ARM_BONES.length,
      bones: armPoseBones,
      chains: armChains,
      commonEffectiveSkinnedMeshes: commonEffectiveSkinMeshes,
      allPresent: armPoseBones.length === RIGGED_OPERATOR_ARM_BONES.length
        && armChains.every((chain) => chain.complete),
      allHierarchyValid: armChains.every((chain) => chain.complete && chain.directHierarchy === true),
      allInEffectivelyVisibleSkinnedMesh: armPoseBones.every((bone) => bone.inEffectivelyVisibleSkinnedMesh)
        && commonEffectiveSkinMeshes.length > 0,
      allHaveRenderedVertexInfluence: armPoseBones.every((bone) => bone.vertexInfluence.passes),
      renderedInfluenceCache: {
        contract: 'static-rendered-influence-cache-v1',
        generation: renderedInfluenceCache.generation,
        computedBones: renderedInfluenceComputedBones,
        reusedBones: renderedInfluenceReusedBones,
        cachedBones: renderedInfluenceCache.byBone.size,
      },
      allAntiTPoseGeometry: armChains.every((chain) => chain.complete && chain.antiTPoseGeometry === true),
      allFinite: armPoseBones.every((bone) => bone.finite)
        && armChains.every((chain) => !chain.complete || ('armLength' in chain
          && chain.shoulderOutwardAxis?.length === 3
          && chain.shoulderOutwardAxis.every(Number.isFinite)
          && [
            chain.upperArmLength, chain.forearmLength, chain.armLength,
            chain.elbowBendRadians, chain.elbowFlexRadians,
            chain.upperArmVerticalDrop, chain.forearmVerticalDrop,
            chain.shoulderToWristVerticalDrop, chain.shoulderToWristVerticalDropRatio,
            chain.shoulderToWristHorizontalReach, chain.shoulderToWristHorizontalReachRatio,
            chain.shoulderToWristOutwardReach, chain.shoulderToWristOutwardReachRatio,
            chain.verticalDropToOutwardReachRatio,
          ].every(Number.isFinite))),
    },
    handPose: {
      contract: 'source-glb-weighted-five-digit-sentinels-v2',
      reference: 'shipped-lod0-walk-animated-second-phalanges',
      expectedBoneCount: RIGGED_OPERATOR_HAND_BONES.length,
      bones: handPoseBones,
      allPresent: handPoseBones.length === RIGGED_OPERATOR_HAND_BONES.length,
      allDescendantOfWrist: handPoseBones.every((bone) => bone.descendantOfWrist),
      allInEffectivelyVisibleSkinnedMesh: handPoseBones.every((bone) => bone.inEffectivelyVisibleSkinnedMesh)
        && commonEffectiveSkinMeshes.length > 0,
      allHaveRenderedVertexInfluence: handPoseBones.every((bone) => bone.vertexInfluence.passes),
      allFinite: handPoseBones.every((bone) => bone.finite),
    },
    meleeKnifeVisible: root.getObjectByName('operator-melee-knife')?.visible === true,
    mergedVertexLod: runtimeState.visual.getObjectByName('Swat_Merged_Vertex_LOD')?.visible === true,
    weaponChildren: runtimeState.weaponSocket.children.length,
    weaponSocketWorld: runtimeState.weaponSocket.getWorldPosition(new THREE.Vector3()).toArray(),
    weaponSocketQuaternion: runtimeState.weaponSocket.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    weaponBounds,
    muzzleForwardDot,
    weaponMount: weaponRoot ? {
      modelId: weaponRoot.userData.weaponModelId ?? null,
      finishId: weaponRoot.userData.weaponFinishId ?? null,
      forwardCorrection: weaponRoot.userData.riggedForwardCorrection ?? null,
      directChild: weaponRoot.parent === runtimeState.weaponSocket,
      localPosition: weaponRoot.position.toArray(),
      localQuaternion: weaponRoot.quaternion.toArray(),
      localScale: weaponRoot.scale.toArray(),
      finite: [...weaponRoot.position.toArray(), ...weaponRoot.quaternion.toArray(), ...weaponRoot.scale.toArray()].every(Number.isFinite),
      localBounds: localMountBounds ? {
        center: localMountBounds.getCenter(new THREE.Vector3()).toArray(),
        size: localMountBounds.getSize(new THREE.Vector3()).toArray(),
      } : null,
    } : null,
    supportGrip: root.userData.operatorGripTelemetry ?? null,
    minigunSpool: root.userData.operatorMinigunSpoolTelemetry ?? null,
  };
}
