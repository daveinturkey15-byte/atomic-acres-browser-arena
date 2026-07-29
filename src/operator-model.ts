import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { markMeshGeometriesShared } from './gpu-resource-ownership';
import type { Team } from './protocol';
import { objectLocalGeometryBounds } from './character-presentation-contract';
import { solveTwoBoneElbow } from './ik';

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
  poseBeforeStance?: Array<{
    bone: THREE.Bone;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }>;
};

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

function materialForFirstPerson(material: THREE.Material, flattenMaterials: boolean): THREE.Material {
  const result = materialForTeam(material, 0, flattenMaterials);
  const materialName = material.name.toLowerCase();
  if (result instanceof THREE.MeshStandardMaterial && materialName === 'skin') {
    // Dark tactical gloves read more cleanly than bare low-poly fingertips
    // when the articulated hand wraps around compact weapon geometry.
    result.color.setHex(0x243238);
    result.roughness = 0.92;
    result.metalness = 0;
    result.emissive.setHex(0x05090a);
    result.emissiveIntensity = flattenMaterials ? 0.24 : 0.08;
  } else if (result instanceof THREE.MeshStandardMaterial
    && (materialName.includes('arms_glove') || materialName.includes('arms_fingerglove'))) {
    // The source texture remains tactical navy. A restrained cool fill keeps
    // articulated digits readable against black receivers in the indoor Gun
    // Range without flattening the baked normal/roughness response.
    result.emissive.setHex(0x285866);
    result.emissiveIntensity = flattenMaterials ? 0.58 : 0.48;
  } else if (result instanceof THREE.MeshStandardMaterial && materialName.includes('arms_sleeve')) {
    result.emissive.setHex(0x1c424d);
    result.emissiveIntensity = flattenMaterials ? 0.5 : 0.4;
  } else if (result instanceof THREE.MeshStandardMaterial && materialName.includes('arms_armorpad')) {
    result.color.setHex(0x31505a);
    result.emissive.setHex(0x204954);
    result.emissiveIntensity = flattenMaterials ? 0.52 : 0.42;
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

export function createFirstPersonRiggedArms(flattenMaterials: boolean): FirstPersonRiggedArms | null {
  if (!firstPersonArmsAsset) return null;
  const root = new THREE.Group();
  root.name = 'first-person-arms';
  const visual = cloneSkeleton(firstPersonArmsAsset.scene) as THREE.Group;
  visual.name = 'authored-first-person-arms-visual';
  visual.scale.setScalar(1);
  visual.position.set(0, 0, 0);
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    const prepare = (material: THREE.Material) => {
      const result = materialForFirstPerson(material, flattenMaterials);
      result.transparent = false;
      result.opacity = 1;
      result.depthWrite = true;
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
    return shoulder instanceof THREE.Bone && elbow instanceof THREE.Bone && wrist instanceof THREE.Bone && finger instanceof THREE.Bone
      ? { shoulder, elbow, wrist, finger, side }
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
  root.userData.importedFirstPersonArmChains = chains.length;
  root.userData.authoredAnimationClipCount = actions.size;
  root.userData.authoredAnimationBlendPolicy = 'finger-tracks-first-runtime-ik-last';
  root.userData.authoredAnimationTrackPolicy = 'finger-bones-only';
  root.userData.authoredAnimationTrackCount = runtimeTrackCount;
  root.userData.authoredUpperChainTracksExcluded = authoredTrackCount - runtimeTrackCount;
  root.userData.authoredKnifeSocket = knifeSocket.name;
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
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
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
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
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
  root.userData.riggedOperatorRuntime = {
    mixer,
    clips,
    actions,
    currentBase: base,
    lastUpdatedAt: performance.now(),
    stancePivot,
    visual,
    weaponSocket,
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
  let visibleSkinnedMeshes = 0;
  let visibleEmbeddedWeapons = 0;
  runtimeState.visual.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh && node.visible) visibleSkinnedMeshes += 1;
    if (node.userData.embeddedWeaponSuppressed === true && node.visible) visibleEmbeddedWeapons += 1;
  });
  const headBoneWorld = runtimeState.poseBones.head?.getWorldPosition(new THREE.Vector3()) ?? null;
  const headProxy = root.getObjectByName('authoritative-hit-proxies')?.children.find(
    (node) => node.userData.authoritativeProxy === true && node.userData.hitZone === 'head',
  );
  const hitProxyHeadWorld = headProxy?.getWorldPosition(new THREE.Vector3()) ?? null;
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
    headBoneWorld: headBoneWorld?.toArray() ?? null,
    hitProxyHeadWorld: hitProxyHeadWorld?.toArray() ?? null,
    hitProxyHeadDelta: headBoneWorld && hitProxyHeadWorld ? headBoneWorld.distanceTo(hitProxyHeadWorld) : null,
    armBonesPresent: ['UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR']
      .filter((name) => runtimeState.visual.getObjectByName(name) instanceof THREE.Bone).length,
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
