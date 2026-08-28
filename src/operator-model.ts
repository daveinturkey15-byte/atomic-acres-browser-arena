import * as THREE from 'three';
import { proneStanceAdjustment, type ProneBodyClearance } from './prone-clearance';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { markMeshGeometriesShared } from './gpu-resource-ownership';
import type { Team } from './protocol';
import { objectLocalGeometryBounds } from './character-presentation-contract';
import { solveTwoBoneElbow } from './ik';
import { yieldBrowserCpuTask } from './browser-preparation-scheduler';
import { operatorBodyColour, operatorSkinPalette } from './operator-skin-catalog';
import {
  advanceOperatorAnimation,
  createOperatorAnimationDirector,
  pushOperatorHitImpulse,
  pushOperatorOneShot,
  type OperatorOneShotKind,
  type OperatorAnimationDirector,
  type OperatorAnimationOutput,
} from './rigged-operator-animation-director';
import {
  applyOperatorAnimationPose,
  applyOperatorMixerPlan,
  directedGroundVelocity,
  localGroundVelocity,
  planOperatorMixer,
} from './rigged-operator-animation-runtime';
import { wrapAngleRadians } from './animation-additive-pose';
import type { HitReactionZone } from './animation-hit-reaction';
import {
  isOperatorStanceId,
  stanceIdleClip,
  type OperatorStanceId,
} from './operator-appearance-catalog'; // HF-382

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
  /**
   * HF-365 ("badly animated"): the authored delivery ships 13 runtime clips but
   * only fire/reload/melee were ever played, and each stopped every other
   * action, so a standing or walking player's arms were frozen. The base action
   * is the looping locomotion clip underneath those one-shots.
   */
  baseAction: string | null;
};

/**
 * ROTATION only, and deliberately so. The authored clips carry translation and
 * scale channels for every digit alongside the rotation, and the old
 * `(?:\.|$)` suffix admitted all three. A digit is a hinge: animating its
 * translation and scale stretched the finger bones into needles that shot out
 * past the weapon. It stayed hidden while the only clips ever played were brief
 * one-shots and the per-frame finger reset restored quaternions (and nothing
 * else), which is exactly the drift this pattern leaves behind. Admitting the
 * hinge channel only is strictly narrower than before.
 */
const FIRST_PERSON_RUNTIME_FINGER_TRACK = /(?:Index|Middle|Ring|Pinky|Thumb)[123][LR]\.quaternion$/;

/**
 * The authored Blender clips retain complete arm-chain motion for offline
 * contact review. In the live viewmodel only digit rotation tracks are
 * admitted: the shoulder, elbow and wrist are solved after animation by weapon
 * socket IK (or the dedicated melee solve), so a clip can never pull a hand off
 * its socket, and no digit can be translated or scaled off its knuckle.
 */
export function firstPersonArmRuntimeClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.filter((track) => FIRST_PERSON_RUNTIME_FINGER_TRACK.test(track.name)).map((track) => track.clone()),
    clip.blendMode,
  );
}

/**
 * HF-388 architectural fix — the authored pose layer.
 *
 * MEASURED 2026-08-25 by decoding `pass65-first-person-arms-lod0.glb` directly
 * (normalized-int16 quaternion accessors): every one of the 13 clips carries
 * exactly two identical keyframes per track — a static held pose, no motion
 * (max inter-key span ≈ 0° except a small left-thumb wiggle). The authoring
 * script (`build-pass65-djmaesen-first-person-arms.py`, `action_corpus`)
 * confirms the intent: one pose dictionary inserted at every keyframe.
 *
 * Consequence: admitting the arm-chain tracks into the live mixer (or
 * reordering restoreRiggedArmBindPose) would surface exactly nothing. Instead,
 * each clip's arm-chain quaternion deltas vs bind are decomposed ONCE at load
 * into the three parameters the authoritative socket IK can actually accept
 * without breaking palm contact: an elbow-pole rotation about the
 * shoulder→wrist axis, a wrist roll about the forearm axis, and a bounded
 * shoulder-carriage offset. The viewmodel layer sums these with its procedural
 * motion and clamps to the same caps, so the authored poses finally reach the
 * screen as visible arm carriage while every contact gate stays intact.
 */
export type FirstPersonArmAuthoredChannel = Readonly<{
  poleRadians: number;
  wristRollRadians: number;
  /** Authored wrist displacement vs bind, arms-visual local metres. */
  carriageOffset: readonly [number, number, number];
}>;
export type FirstPersonArmAuthoredClipPose = Readonly<{
  left: FirstPersonArmAuthoredChannel;
  right: FirstPersonArmAuthoredChannel;
}>;
export type FirstPersonArmAuthoredPoseLayer = ReadonlyMap<string, FirstPersonArmAuthoredClipPose>;

/** Identical numeric bound to weapon-presentation's procedural pole cap. */
export const FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS = 0.24;
/** Identical numeric bound to weapon-presentation's procedural wrist-roll cap. */
export const FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS = 0.03;
/**
 * Carriage is a translation of the whole shoulder entry, so it competes with
 * reach and near-plane framing; it is bounded far below the pole cap.
 */
export const FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS = 0.05;

const FIRST_PERSON_ARM_AUTHORED_ZERO_CHANNEL: FirstPersonArmAuthoredChannel = Object.freeze({
  poleRadians: 0,
  wristRollRadians: 0,
  carriageOffset: Object.freeze([0, 0, 0] as const),
});

export type FirstPersonArmChainJoints = Readonly<{
  side: 'left' | 'right';
  shoulder: THREE.Bone;
  elbow: THREE.Bone;
  wrist: THREE.Bone;
}>;

/**
 * Evaluates a clip's rotation track at its last key into `target`. Missing or
 * non-rotation tracks leave `target` untouched and return false, which the
 * builder treats as "this clip holds bind on that joint".
 */
function clipQuatAt(
  clip: THREE.AnimationClip,
  trackName: string,
  target: THREE.Quaternion,
): boolean {
  const track = clip.tracks.find((candidate) => candidate.name === trackName);
  if (!(track instanceof THREE.QuaternionKeyframeTrack) || track.times.length === 0) return false;
  // The sample is taken AT the last keyframe, where interpolation is the identity - so
  // read the final quaternion straight out of the buffer. createInterpolant() is not on
  // the QuaternionKeyframeTrack type in r185 and is not needed for an on-key sample.
  const base = (track.times.length - 1) * 4;
  if (track.values.length < base + 4) return false;
  target.set(track.values[base], track.values[base + 1],
             track.values[base + 2], track.values[base + 3]).normalize();
  return true;
}

/**
 * Decomposes one clip's arm-chain hold pose into IK-layer channels for both
 * sides. Pure FK math on local transforms — no bone in the scene is read or
 * written beyond the bind reference supplied by `joints`, whose bones must be
 * resting at their loaded bind pose when this runs (true inside
 * createFirstPersonRiggedArms before any mixer action has played).
 */
export function buildFirstPersonArmAuthoredPoseLayer(
  clips: readonly THREE.AnimationClip[],
  joints: readonly FirstPersonArmChainJoints[],
): FirstPersonArmAuthoredPoseLayer {
  const references = joints.map((joint) => ({
    side: joint.side,
    suffix: joint.side === 'left' ? 'L' : 'R',
    shoulderToElbow: joint.elbow.position.clone(),
    elbowToWrist: joint.wrist.position.clone(),
    bindShoulder: joint.shoulder.quaternion.clone(),
    bindElbow: joint.elbow.quaternion.clone(),
    bindWrist: joint.wrist.quaternion.clone(),
  }));
  const clipQuat = new THREE.Quaternion();
  const swing = new THREE.Quaternion();
  const elbowWorld = new THREE.Vector3();
  const wristWorld = new THREE.Vector3();
  const bindElbowWorld = new THREE.Vector3();
  const bindWristWorld = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const bindElbowDir = new THREE.Vector3();
  const clipElbowDir = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const forearmAxis = new THREE.Vector3();
  const carriage = new THREE.Vector3();
  const layer = new Map<string, FirstPersonArmAuthoredClipPose>();
  for (const clip of clips) {
    const sides = {} as Record<'left' | 'right', FirstPersonArmAuthoredChannel>;
    for (const reference of references) {
      // Forward-kinematics the chain with the clip's local rotations. Bind
      // positions are shared; only rotations differ between the two poses.
      const posedShoulder = clipQuatAt(clip, `UpperArm${reference.suffix}.quaternion`, clipQuat)
        ? clipQuat.clone() : reference.bindShoulder.clone();
      const posedElbow = clipQuatAt(clip, `LowerArm${reference.suffix}.quaternion`, clipQuat)
        ? clipQuat.clone() : reference.bindElbow.clone();
      const posedWrist = clipQuatAt(clip, `Wrist${reference.suffix}.quaternion`, clipQuat)
        ? clipQuat.clone() : reference.bindWrist.clone();
      elbowWorld.copy(reference.shoulderToElbow).applyQuaternion(posedShoulder);
      wristWorld.copy(reference.elbowToWrist).applyQuaternion(swing.copy(posedShoulder).multiply(posedElbow)).add(elbowWorld);
      bindElbowWorld.copy(reference.shoulderToElbow).applyQuaternion(reference.bindShoulder);
      bindWristWorld.copy(reference.elbowToWrist)
        .applyQuaternion(swing.copy(reference.bindShoulder).multiply(reference.bindElbow))
        .add(bindElbowWorld);
      axis.copy(wristWorld).normalize();
      bindElbowDir.copy(bindElbowWorld).addScaledVector(axis, -bindElbowWorld.dot(axis));
      clipElbowDir.copy(elbowWorld).addScaledVector(axis, -elbowWorld.dot(axis));
      let poleRadians = 0;
      if (bindElbowDir.lengthSq() > 1e-10 && clipElbowDir.lengthSq() > 1e-10) {
        cross.crossVectors(bindElbowDir.normalize(), clipElbowDir.normalize());
        poleRadians = Math.atan2(cross.dot(axis), bindElbowDir.dot(clipElbowDir));
      }
      forearmAxis.copy(wristWorld).sub(elbowWorld);
      let wristRollRadians = 0;
      if (forearmAxis.lengthSq() > 1e-10) {
        // Twist component of (posedWrist ∘ bindWrist⁻¹) about the UNIT forearm
        // axis; atan2's first argument is only a signed sine on a unit axis.
        forearmAxis.normalize();
        swing.copy(posedWrist).multiply(reference.bindWrist.clone().invert());
        wristRollRadians = 2 * Math.atan2(
          swing.x * forearmAxis.x + swing.y * forearmAxis.y + swing.z * forearmAxis.z,
          swing.w,
        );
      }
      carriage.copy(wristWorld).sub(bindWristWorld);
      sides[reference.side] = Object.freeze({
        poleRadians,
        wristRollRadians,
        carriageOffset: Object.freeze([carriage.x, carriage.y, carriage.z] as const),
      });
    }
    layer.set(clip.name, Object.freeze({ left: sides.left, right: sides.right }));
  }
  return layer;
}

function clampFirstPersonArmAuthoredChannel(
  channel: FirstPersonArmAuthoredChannel | undefined,
): FirstPersonArmAuthoredChannel {
  if (!channel) return FIRST_PERSON_ARM_AUTHORED_ZERO_CHANNEL;
  const [x, y, z] = channel.carriageOffset;
  const magnitude = Math.hypot(x, y, z);
  const scale = magnitude > FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS
    ? FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS / magnitude
    : 1;
  return Object.freeze({
    poleRadians: THREE.MathUtils.clamp(
      channel.poleRadians,
      -FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS,
      FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS,
    ),
    wristRollRadians: THREE.MathUtils.clamp(
      channel.wristRollRadians,
      -FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS,
      FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS,
    ),
    carriageOffset: Object.freeze([x * scale, y * scale, z * scale] as const),
  });
}

/**
 * Combines the looping base pose with the active one-shot pose. The runtime
 * mixer already collapses weight (updateFirstPersonArmAnimations holds the
 * base at zero while a one-shot runs), so the one-shot simply overrides here;
 * the consumer's exponential smoothing provides the crossfade in time.
 */
export function firstPersonArmAuthoredLayerSample(
  layer: FirstPersonArmAuthoredPoseLayer | null | undefined,
  baseAction: string | null,
  oneShotAction: string | null,
): { left: FirstPersonArmAuthoredChannel; right: FirstPersonArmAuthoredChannel } {
  // Ternaries, not `&&`: `'' && x` evaluates to '' rather than undefined, and ?? only
  // falls through on null/undefined - so an empty action name (an idle slot) survived into
  // `selected` as a string and the .left/.right reads below failed to typecheck.
  const selected = (oneShotAction ? layer?.get(oneShotAction) : undefined)
    ?? (baseAction ? layer?.get(baseAction) : undefined)
    ?? null;
  return {
    left: clampFirstPersonArmAuthoredChannel(selected?.left),
    right: clampFirstPersonArmAuthoredChannel(selected?.right),
  };
}

export function getFirstPersonArmAuthoredLayer(root: THREE.Object3D): FirstPersonArmAuthoredPoseLayer | null {
  return (root.userData.firstPersonArmAuthoredLayer as FirstPersonArmAuthoredPoseLayer | undefined) ?? null;
}

type RiggedOperatorRuntime = {
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  currentBase: string;
  lastUpdatedAt: number;
  stancePivot: THREE.Group;
  /**
   * Room the prone presentation actually has, supplied by the runtime each
   * frame. Null when the caller has not measured it, in which case the pose is
   * used exactly as authored.
   */
  proneClearance: ProneBodyClearance | null;
  visual: THREE.Group;
  weaponSocket: THREE.Group;
  canonicalEvidence: RiggedOperatorCanonicalEvidence;
  stance: 'stand' | 'crouch' | 'prone';
  crouchBlend: number;
  proneBlend: number;
  speed: number;
  /** Pass 77: the composed animation director this operator is driven by. */
  director: OperatorAnimationDirector;
  /** Terminal: once dead, the corpse clip owns the mixer until a reset. */
  dead: boolean;
  /** Clips the mixer had non-zero weight on last frame, so they can be released. */
  activeAnimationClips: readonly string[];
  /** Presentation yaw, rate limited toward the authoritative root yaw. */
  visualYawRadians: number;
  /** Previous root ground position, for measuring the real movement direction. */
  lastGroundX: number;
  lastGroundZ: number;
  lastAnimation: OperatorAnimationOutput | null;
  /**
   * HF-382: the selected IDLE STANCE's authored clip plus its cross-fade state.
   * `clipName` is what the operator fades TOWARD; `fadeFrom` is the outgoing
   * idle still carrying weight. Both stay null until a stance is published.
   */
  stanceIdleFade: {
    clipName: string | null;
    fadeFrom: string | null;
    fadeSeconds: number;
  };
  lazilyBoundDirectionalClips: number;
  poseBones: {
    hips?: THREE.Bone;
    abdomen?: THREE.Bone;
    torso?: THREE.Bone;
    chest?: THREE.Bone;
    neck?: THREE.Bone;
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
  // Pass 75: the only clip the selectable-emote catalog adds to the bound set.
  // One extra clip against a deliberate binding budget, so the emote menu can
  // never request something the mixer does not carry.
  'Wave',
] as const);

export const RIGGED_OPERATOR_CORPSE_ACTION_NAMES = Object.freeze(['Death'] as const);

/**
 * Pass 77 / HF-375. The three authored directional runs, which the corpus has
 * carried since Pass 65 and the runtime has never used. Without them a bot
 * retreating at 4.65 m/s or strafing at 4.05 m/s plays a FORWARD run - it
 * moonwalks - because clip choice was made from a scalar speed.
 *
 * They are deliberately NOT in `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES`. That list
 * is the SPAWN-TIME prewarm budget, capped at 14 by
 * `operator-appearance-catalog.test.ts` for a measured main-thread cost, and
 * raising that cap without re-measuring would be weakening a gate to get green.
 * These are made available to the mixer and bound lazily by `actionFor` on the
 * first frame an operator actually moves sideways or backwards - one clip, once
 * per operator lifetime, at the moment it is needed. Spawn cost is unchanged;
 * `lazilyBoundDirectionalClips` reports what the lazy path actually cost.
 */
export const RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES = Object.freeze([
  'Run_Back',
  'Run_Left',
  'Run_Right',
] as const);

export function riggedOperatorRuntimeClips(clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
  return RIGGED_OPERATOR_RUNTIME_ACTION_NAMES.flatMap((name) => {
    const clip = clipsByName.get(name);
    return clip ? [clip] : [];
  });
}

/**
 * Every clip the live mixer may reach: the prewarmed controller set plus the
 * lazily bound directional runs. Availability is not binding - a clip only costs
 * anything once `actionFor` is asked for it.
 */
export function riggedOperatorAvailableClips(clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
  const bound = riggedOperatorRuntimeClips(clips);
  return [
    ...bound,
    ...RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES.flatMap((name) => {
      const clip = clipsByName.get(name);
      return clip ? [clip] : [];
    }),
  ];
}

export type RiggedOperatorInstance = {
  root: THREE.Group;
  weaponSocket: THREE.Group;
};

/**
 * `showcase` is the menu's appearance: the skin's own colours with no team
 * wash, for the OPERATOR panel's live turntable. Gameplay never uses it.
 */
export type OperatorAppearance = 'team' | 'neon-purple' | 'showcase';

const operatorAssets: Partial<Record<'quality' | 'performance', RiggedOperatorAsset>> = {};
let firstPersonArmsAsset: FirstPersonArmsAsset | null = null;
let operatorAssetPromise: Promise<void> | null = null;
let firstPersonArmsAssetPromise: Promise<void> | null = null;

/**
 * HF-360: per-skin third-person operator deliveries. Every archetype GLB was
 * authored on the SAME canonical rig (62 joints, 24 clips —
 * pass65-third-person-operator-family-v1, verified from the binaries), so a
 * skin swap is a model swap with identical animation, sockets and hit proxies.
 * Assets load lazily per selected skin; nobody pays for skins nobody picked.
 * The 'default' id maps to the retained pass65 operator via operatorAssets.
 */
export const OPERATOR_SKIN_MODEL_URLS: Readonly<Record<string, Readonly<{ quality: string; performance: string }>>> = Object.freeze({
  explorer: Object.freeze({
    quality: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-explorer-lod0.glb',
    performance: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-explorer-lod1.glb',
  }),
  symbiote: Object.freeze({
    quality: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-symbiote-lod0.glb',
    performance: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-symbiote-lod1.glb',
  }),
  navalops: Object.freeze({
    quality: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-navalops-lod0.glb',
    performance: './assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-navalops-lod1.glb',
  }),
});

const operatorSkinAssets = new Map<string, Partial<Record<'quality' | 'performance', RiggedOperatorAsset>>>();
const operatorSkinAssetPromises = new Map<string, Promise<void>>();

/** Lazily loads both LODs for a non-default skin. Unknown ids resolve without
 * loading anything, so a stale peer selection can never wedge deployment. */
export function loadOperatorSkinAsset(skinId: string): Promise<void> {
  if (skinId === 'default') return loadRiggedOperatorAsset();
  const urls = OPERATOR_SKIN_MODEL_URLS[skinId];
  if (!urls) return Promise.resolve();
  const existing = operatorSkinAssetPromises.get(skinId);
  if (existing) return existing;
  const promise = Promise.all([
    loadRiggedGltf(urls.quality).then((operator) => {
      const store = operatorSkinAssets.get(skinId) ?? {};
      store.quality = describeOperatorAsset(operator, 0, urls.quality);
      operatorSkinAssets.set(skinId, store);
    }),
    loadRiggedGltf(urls.performance).then((operator) => {
      const store = operatorSkinAssets.get(skinId) ?? {};
      store.performance = describeOperatorAsset(operator, 1, urls.performance);
      operatorSkinAssets.set(skinId, store);
    }),
  ]).then(() => undefined);
  operatorSkinAssetPromises.set(skinId, promise);
  return promise;
}

export function operatorSkinAssetReady(skinId: string): boolean {
  if (skinId === 'default') return operatorAssets.quality !== undefined && operatorAssets.performance !== undefined;
  const store = operatorSkinAssets.get(skinId);
  return store?.quality !== undefined && store?.performance !== undefined;
}

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
  // HF-345. The prone pose lays the whole rig down about the pelvis pivot, so
  // the visible body reaches ~0.82 m forward and ~0.88 m back while the
  // authority capsule stays tiny. Against a wall that surplus went straight
  // through the geometry. proneBodyClearance has measured the available room
  // since HF-345 landed, but nothing consumed it; this is that consumer.
  //
  // Presentation only - the capsule, the hit proxies and every authority
  // decision are untouched, exactly as the clearance module intended.
  const proneAdjustment = runtimeState.stance === 'prone' && runtimeState.proneClearance
    ? proneStanceAdjustment(runtimeState.proneClearance)
    : null;

  runtimeState.stancePivot.position.y = THREE.MathUtils.lerp(
    runtimeState.stancePivot.position.y,
    target.pivotHeight,
    alpha,
  );
  // Sliding along local Z seats the body in the room it has without changing
  // the pose; propping only happens when sliding cannot recover the deficit.
  runtimeState.stancePivot.position.z = THREE.MathUtils.lerp(
    runtimeState.stancePivot.position.z,
    proneAdjustment ? proneAdjustment.slideM : 0,
    alpha,
  );
  runtimeState.stancePivot.rotation.x = THREE.MathUtils.lerp(
    runtimeState.stancePivot.rotation.x,
    proneAdjustment ? target.pivotPitch * proneAdjustment.pitchScale : target.pivotPitch,
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

/**
 * HF-366: the operator body carries the SELECTED SKIN, not one fixed team paint.
 *
 * Measured at HEAD before this change, from the running build: all four skin
 * GLBs load correctly and then arrive here sharing the canonical material names
 * (`Swat`, `Swat_Black`, `Visor`, `Skin`), so the old exact-name branches below
 * stamped identical colours on every one of them - `Swat` came out #2d7882 for
 * default, explorer, symbiote AND navalops. Four different multi-megabyte
 * deliveries, one colour. "They all looked greyed out" was the correct report.
 *
 * The team is still applied, as a bounded wash over the skin's own colour
 * (`operatorBodyColour`), so aqua and coral stay separable at range. The
 * `lift` term exists because two of the four skins ship a garment atlas whose
 * mean is ~40/255: no multiply tint, not even white, can make those read as a
 * colour, so a small flat palette-hued fill does the part multiply cannot.
 *
 * `showcase` is the menu's appearance: no team wash at all, because a player
 * looking at their own operator in the OPERATOR panel is not on a team yet and
 * should see the skin they are actually buying into.
 */
function skinPaintedBodyMaterial(
  result: THREE.MeshStandardMaterial,
  role: 'swat' | 'swatBlack' | 'grey',
  team: Team,
  appearance: OperatorAppearance,
  skinId: string,
  flattenMaterials: boolean,
): void {
  const body = operatorSkinPalette(skinId).body;
  const colour = appearance === 'showcase'
    ? body[role]
    : operatorBodyColour(skinId, team === 0 ? 0 : 1, role);
  result.color.setHex(colour);
  // The fill is the same hue as the garment, so a dark authored atlas gains
  // readable colour rather than gaining grey.
  result.emissive.setHex(colour);
  const lift = role === 'grey' ? body.lift * 0.6 : body.lift;
  result.emissiveIntensity = flattenMaterials ? lift * 1.35 : lift;
  if (role === 'swat') result.roughness = body.swatRoughness;
  else if (role === 'swatBlack') result.roughness = body.swatBlackRoughness;
}

function materialForTeam(
  material: THREE.Material,
  team: Team,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
  skinId = 'default',
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
    skinPaintedBodyMaterial(result, 'swat', team, appearance, skinId, flattenMaterials);
  } else if (name.includes('swat_black')) {
    skinPaintedBodyMaterial(result, 'swatBlack', team, appearance, skinId, flattenMaterials);
  } else if (name.includes('grey')) {
    skinPaintedBodyMaterial(result, 'grey', team, appearance, skinId, flattenMaterials);
  } else if (name === 'visor') {
    // The visor is the head's only bright element and the fastest way to tell
    // two operators apart across an arena, so it takes the skin at full
    // strength and never a team wash.
    // HF-380: each skin's lens atlas is baked in its OWN tint (the symbiote's
    // is teal), and colour MULTIPLIES the map - white over teal is still teal,
    // so the palette's lens colour could never reach the mesh. Drop the map
    // (retained for recovery, same contract as the arm crushed-albedo roles)
    // so the lens IS the palette colour on every skin.
    if (result.map) {
      result.userData.authoredVisorBaseColorMap = result.map;
      result.map = null;
    }
    result.color.setHex(operatorSkinPalette(skinId).body.visor);
  }
  if (flattenMaterials && appearance !== 'neon-purple') {
    // Bots and distant operators drop to a flat response, but NOT to a flat
    // roughness of 1 on the garment: that erased the one cue separating wet
    // neoprene from canvas even when the colour survived.
    if (name !== 'swat' && !name.includes('swat_black')) result.roughness = 1;
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
  skinId = 'default',
): (material: THREE.Material) => THREE.Material {
  const instanceMaterials = new Map<THREE.Material, THREE.Material>();
  return (material: THREE.Material): THREE.Material => {
    const existing = instanceMaterials.get(material);
    if (existing) return existing;
    const result = materialForTeam(material, team, flattenMaterials, appearance, skinId);
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

export type FirstPersonArmMaterialRole = 'sleeve' | 'glove' | 'finger-glove' | 'accent' | 'skin';

/**
 * Classifies one authored arm material into the role the skin palette paints.
 * Exported because the skin -> arm resolution is the testable half of HF-366:
 * a renamed or newly added arm material that falls through to null would be
 * left untinted and would visibly disagree with the menu portrait.
 */
export function firstPersonArmMaterialRole(materialName: string): FirstPersonArmMaterialRole | null {
  const normalized = materialName.toLowerCase();
  if (normalized === 'skin') return 'skin';
  if (normalized.includes('arms_fingerglove')) return 'finger-glove';
  if (normalized.includes('arms_glove')) return 'glove';
  if (normalized.includes('arms_sleeve')) return 'sleeve';
  if (normalized.includes('arms_wristaccent') || normalized.includes('arms_armorpad')) return 'accent';
  return null;
}

export const FIRST_PERSON_ARM_SKIN_CONTRACT = 'measured-albedo-aware-arm-skin-v2';

/**
 * HF-365 / HF-366: what the authored first-person arm atlas actually contains,
 * measured on 2026-08-23 by sampling the shipped 1024x1024 base-colour PNG
 * through each mesh's own UVs. Mean RGB, per material role:
 *
 *   sleeve       ( 30,  30,  32)   <- crushed; no usable albedo signal
 *   glove        ( 14,  17,  20)   <- crushed; no usable albedo signal
 *   finger-glove ( 98,  92,  96)   <- the bare-hand island, correctly exposed
 *   accent       (105,  99, 102)   <- correctly exposed
 *
 * This is the fact the previous attempt at this row did not have, and the
 * reason its fix could not reach the owner. A `color` multiply is bounded above
 * by white, so tinting a 14/255 glove with the brightest possible tint still
 * yields 14/255: the arms were mathematically incapable of showing ANY skin,
 * and were guaranteed to render as one flat black wedge - which is exactly what
 * "the arms are thin" describes, because a silhouette with no interior shading
 * has no readable thickness.
 *
 * So the two crushed roles stop multiplying a black map and take the palette
 * colour as their albedo directly. The normal map (1.0 MB) and roughness map
 * (0.5 MB) are kept, and they are where the weave, wrinkles and seams actually
 * live - so the arm gains form and colour and loses nothing that was visible.
 * The two correctly-exposed roles keep their map and are tinted as before.
 */
export const FIRST_PERSON_ARM_CRUSHED_ALBEDO_ROLES: readonly FirstPersonArmMaterialRole[] =
  Object.freeze(['sleeve', 'glove']);

/**
 * The hand island is bare skin. Tinting it to the palette's glove colour at
 * full strength turned the player's own hands grey-blue; a partial wash keeps
 * flesh reading as flesh while still shifting with the skin.
 */
export const FIRST_PERSON_ARM_HAND_TINT_BLEND = 0.42;

/**
 * HF-388. The correction the crushed-albedo fix above needed and did not have.
 *
 * Dropping the 14/255 map was right - a multiply cannot lighten - but it left
 * the palette colour standing as the arm's ENTIRE albedo, and the palette is
 * authored for a body seen across an arena under arena lighting. The
 * first-person arms are a different lighting problem: they sit inside
 * `first-person-viewmodel-fill`, a point light which at the time of this pass
 * ran at intensity 17.5 with decay 2, MEASURED live at 0.61 m from the arm -
 * an order of magnitude more illuminance than the same surface receives in
 * third person. Measured on the running build 2026-08-25, the shipped default
 * sleeve arrives at sRGB #9fc6cc - luminance 0.75, brighter than printer paper
 * - and the rendered arm is a value-flat white shape with 12% of its pixels
 * within a hair of clipping.
 *
 * SUPERSEDED IN PART, same day: correcting the albedo was necessary and is
 * kept, but it was not sufficient and the diagnosis above under-attributed the
 * fill. Forcing the arm's albedo to BLACK still rendered mean 100.5 against a
 * shipped 140.5, so most of the brightness was never albedo at all - it was
 * the fill's white specular sheen. The fill now runs at 4.5; see
 * FIRST_PERSON_VIEWMODEL_FILL_INTENSITY in weapon-presentation.ts.
 * The owner's "still need some work" is the far side of the same coin the
 * black wedge was on: one had no albedo, this has too much.
 *
 * So the palette keeps deciding WHICH COLOUR the arm is, and this decides how
 * much light it may return. Two properties matter and both are asserted:
 *
 *   1. The target luminance sits far above `READABLE_ALBEDO_FLOOR` (0.16), so
 *      this cannot walk back toward the silhouette failure it is fixing.
 *   2. Chroma is preserved as an sRGB offset from each palette's own grey, not
 *      scaled with it, and then GAINED - because removing value from a colour
 *      removes the channel separation that made two skins tellable apart, and
 *      the four-skin separability gate must not be paid for with this fix.
 */
export const FIRST_PERSON_ARM_ALBEDO_CONTRACT = 'first-person-exposure-corrected-arm-albedo-v1';
/** sRGB luminance the arm's two largest regions are re-based onto. */
export const FIRST_PERSON_ARM_TARGET_SRGB_LUMINANCE: Readonly<Record<'sleeve' | 'glove', number>> = Object.freeze({
  // A deliberate value break between sleeve and glove: an arm with one flat
  // value has no readable interior, which is the other half of what "thin"
  // described. Gloves are darker than sleeves in every issued kit.
  sleeve: 0.35,
  glove: 0.28,
});
/**
 * Chroma restoration applied while re-basing onto the luminance target.
 * 1.4 left the tightest produced pair (default vs navalops sleeve) at
 * 40/255 sRGB separation - below the four-skin separability contract's
 * 0.16 floor (operator-model.test.ts). 1.45 puts that pair at 44/255
 * (0.1725) with no channel clamped on any skin or role, so the exact
 * luminance landing is preserved.
 */
export const FIRST_PERSON_ARM_CHROMA_GAIN = 1.45;

/**
 * HF-388 follow-up: why the arm had no weave, wrinkle or material character
 * even after its albedo was corrected.
 *
 * The crushed-albedo fix above drops the base-colour map for sleeve and glove
 * and keeps the normal (1.0 MB) and roughness (0.5 MB) maps, on the stated
 * grounds that they are "where the weave, wrinkles and seams actually live".
 * They are - but MEASURED live on the shipped GLB 2026-08-25, the authored
 * materials arrive with `normalScale` 0.68-0.72, i.e. the asset itself
 * attenuates that detail to about seven tenths before it is ever shaded. With
 * the base-colour map deliberately removed, the normal map is now the ONLY
 * spatial signal the sleeve has, and it was being delivered at a discount.
 *
 * That is the second half of "a bright, nearly featureless pale shape": the
 * first half was the viewmodel fill's white specular veil
 * (FIRST_PERSON_VIEWMODEL_FILL_INTENSITY), and with the veil reduced the
 * detail underneath still has to be strong enough to read at arm's length.
 *
 * Verified by sweep on real WebGPU at Nuke Town sunset, over arm pixels only,
 * measuring mean absolute one-pixel luminance step BETWEEN neighbouring arm
 * pixels - a silhouette-free local-detail term, because a limb under a broad
 * gradient keeps a healthy stdDev while being locally flat:
 *     authored 0.72 -> 8.42     2.4 -> 9.24     3.2 -> 9.85     4.0 -> 9.69
 * Frames were read, not just the numbers: at the authored value the sleeve is
 * a smooth latex tube, at 2.4 it carries fabric folds and creases, and by 4.0
 * it starts to look ropey and synthetic. 2.4 is the value that reads as cloth.
 *
 * The geometry supports this honestly - the arm meshes ship `tangent` and
 * `uv1` attributes, so this is a real tangent-space normal map being turned up
 * to full strength, not a flat surface being faked.
 */
export const FIRST_PERSON_ARM_NORMAL_SCALE = 2.4;

function srgbChannels(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function srgbLuminance(channels: readonly [number, number, number]): number {
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/**
 * Re-bases one palette arm colour onto the first-person luminance target,
 * preserving (and gaining) its chroma. Returns an sRGB hex, because that is
 * the space the palette is authored in and the space the separability gate
 * judges; `THREE.Color.setHex` converts to linear on the way in.
 *
 * The chroma offsets sum to zero luminance by construction, so the result
 * lands on the target EXACTLY - as long as no channel is clamped. A clamp
 * would silently push the surface back up in value, which is the failure being
 * fixed, so the gain is capped per colour at whatever that colour can take
 * instead. Only the explorer sleeve is anywhere near that cap; every other
 * arm colour takes the full gain.
 */
export function firstPersonArmSkinAlbedo(paletteHex: number, role: 'sleeve' | 'glove'): number {
  const channels = srgbChannels(paletteHex);
  const grey = srgbLuminance(channels);
  const target = FIRST_PERSON_ARM_TARGET_SRGB_LUMINANCE[role];
  const offsets = channels.map((channel) => channel - grey);
  const admissibleGain = offsets.reduce((limit, offset) => {
    if (Math.abs(offset) < 1e-6) return limit;
    const headroom = offset < 0 ? target : 1 - target;
    return Math.min(limit, headroom / Math.abs(offset));
  }, FIRST_PERSON_ARM_CHROMA_GAIN);
  const gain = Math.max(1, Math.min(FIRST_PERSON_ARM_CHROMA_GAIN, admissibleGain));
  return offsets.reduce(
    (hex, offset) => (hex << 8) | Math.round(Math.max(0, Math.min(1, target + offset * gain)) * 255),
    0,
  );
}

const armHandTintScratch = new THREE.Color();

/**
 * HF-366: paints one already-cloned arm material with the selected skin.
 *
 * The tint MULTIPLIES the authored base-colour map, so the licensed albedo,
 * normal and ORM detail survives and only the hue/response changes. This is
 * the honest limit of what the shipped assets allow: the arms GLB has no
 * per-skin variant and each skin's own atlas is UV-mapped for the full body,
 * so sampling it through arm UVs would land on legs and webbing.
 */
export function applyFirstPersonArmSkinMaterial(
  material: THREE.Material,
  materialName: string,
  skinId: string,
): boolean {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  const role = firstPersonArmMaterialRole(materialName);
  if (role === null || role === 'skin') return false;
  const palette = operatorSkinPalette(skinId).arm;
  // HF-388 follow-up: drive the authored normal map at full strength. This
  // lives here rather than in the material clone path for two reasons: every
  // arm role this function paints has the same attenuated authored scale, and
  // a later skin change re-enters HERE - so a repaint cannot silently drop the
  // surface detail and leave the arm smooth again for one player.
  if (material.normalMap !== null) {
    material.normalScale.set(FIRST_PERSON_ARM_NORMAL_SCALE, FIRST_PERSON_ARM_NORMAL_SCALE);
  }
  if (role === 'sleeve' || role === 'glove') {
    material.color.setHex(firstPersonArmSkinAlbedo(role === 'sleeve' ? palette.sleeve : palette.glove, role));
    material.roughness = role === 'sleeve' ? palette.sleeveRoughness : palette.gloveRoughness;
    // HF-388. Measured live on the shipped GLB 2026-08-25: both of these
    // materials arrive with `metalness` 0.82. Woven sleeve and rubber-palmed
    // glove are dielectrics - a metal has no diffuse response at all and tints
    // its specular with its base colour, which is exactly the wet-plastic read
    // the owner is looking at. `finger-glove` is the ONLY arm role that
    // already forced this to 0, and it is the only one that does not look like
    // latex. The authored metalnessMap is deliberately left attached, so an
    // asset that really does carry metal detail loses nothing it had: THREE
    // multiplies the two, and this only removes the scalar that could not be
    // right for cloth.
    material.metalness = 0;
    // The crushed base-colour map is dropped, not multiplied: see
    // FIRST_PERSON_ARM_CRUSHED_ALBEDO_ROLES. Everything that carries the
    // surface's form - normalMap, roughnessMap, metalnessMap, aoMap - stays.
    if (material.map !== null) {
      material.userData.authoredArmBaseColorMap = material.map;
      material.map = null;
      material.needsUpdate = true;
    }
  } else if (role === 'finger-glove') {
    // Bare hands: wash toward the palette rather than replacing flesh with it.
    armHandTintScratch.setHex(palette.fingerGlove);
    material.color.setRGB(
      1 + (armHandTintScratch.r - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND,
      1 + (armHandTintScratch.g - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND,
      1 + (armHandTintScratch.b - 1) * FIRST_PERSON_ARM_HAND_TINT_BLEND,
    );
    material.roughness = 0.86;
    material.metalness = 0;
  } else {
    material.color.setHex(palette.accent);
    material.metalness = palette.accentMetalness;
    material.emissive.setHex(palette.accentEmissive);
    material.emissiveIntensity = Math.min(0.16, FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
  }
  return true;
}

/**
 * Repaints a live first-person arms root for a new skin selection. Materials
 * are per-instance clones (materialForFirstPerson clones every source), so this
 * mutates only the caller's own arms and never the shared authored asset.
 */
export function applyFirstPersonArmSkin(root: THREE.Object3D, skinId: string): number {
  let painted = 0;
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      const sourceName = String(material.userData.authoredArmMaterialName ?? material.name);
      if (applyFirstPersonArmSkinMaterial(material, sourceName, skinId)) painted += 1;
    }
  });
  root.userData.firstPersonArmSkinId = skinId;
  root.userData.firstPersonArmSkinContract = FIRST_PERSON_ARM_SKIN_CONTRACT;
  root.userData.firstPersonArmSkinPaintedMaterials = painted;
  return painted;
}

function materialForFirstPerson(
  material: THREE.Material,
  flattenMaterials: boolean,
  skinId: string,
): THREE.Material {
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
  // Keep the authored name on the clone so a later skin change can re-classify
  // it; materialForTeam clones may be renamed by downstream passes.
  result.userData.authoredArmMaterialName = material.name;
  applyFirstPersonArmSkinMaterial(result, material.name, skinId);
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

export const FIRST_PERSON_ARM_GIRTH_CONTRACT = 'authored-normal-shell-limb-girth-v1';

/**
 * HF-365 ("the arms are thin"): metres of radius added along the authored
 * vertex normals, per material role, in the arms GLB's own local units.
 *
 * A normal-offset shell is the one girth operation that leaves EVERYTHING else
 * the release gates depend on untouched: no bone is scaled (the reviewed
 * "no skinned bone receives scale or length mutation" contract holds), no
 * segment length changes, no socket, palm contact or knife mount moves, and
 * the skin weights are the authored ones because only positions move. Fingers
 * take a much smaller shell than the sleeve so digits thicken without fusing.
 *
 * HF-354 previously recorded arm thickness as correct. The owner played the
 * Pass 76 candidate and said the opposite, so that status is superseded here.
 */
export const FIRST_PERSON_ARM_GIRTH_METRES: Readonly<Record<FirstPersonArmMaterialRole, number>> = Object.freeze({
  // Raised for the HF-365 second pass. The shell was already applied at HEAD
  // (verified on the live geometry: sleeve carried 0.0105 m), so thickness was
  // not the whole of "the arms are thin" - a black silhouette reads thin at any
  // girth. Colour is fixed above; this adds the mass that was genuinely
  // missing, still without scaling one bone or moving one socket.
  sleeve: 0.0172,
  accent: 0.0148,
  glove: 0.0112,
  // Digits keep the small shell: a larger one fuses adjacent fingers into a
  // mitten, and the grip read depends on separated fingers.
  'finger-glove': 0.0031,
  skin: 0.0031,
});

const ARM_GIRTH_APPLIED_KEY = 'firstPersonArmGirthMetres';

/**
 * Thickens the shared authored arm geometry exactly once. SkeletonUtils.clone
 * SHARES geometry between every arms instance, so inflating per instance would
 * compound the shell on every viewmodel build; the applied amount is stamped on
 * the geometry and re-entry is a no-op.
 */
export function inflateFirstPersonArmGirth(root: THREE.Object3D): number {
  let inflated = 0;
  const done = new Set<THREE.BufferGeometry>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    if (done.has(geometry)) return;
    done.add(geometry);
    if (typeof geometry.userData[ARM_GIRTH_APPLIED_KEY] === 'number') return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const roles = materials
      .map((material) => firstPersonArmMaterialRole(material.name))
      .filter((role): role is FirstPersonArmMaterialRole => role !== null);
    if (roles.length !== 1) return;
    const girth = FIRST_PERSON_ARM_GIRTH_METRES[roles[0]!];
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal || position.count !== normal.count) return;
    // The delivery is meshopt-compressed: positions arrive as a NORMALIZED
    // Int16 interleaved attribute, so the encodable range is exactly [-1, 1]
    // and setXYZ re-quantizes on write. Writing an inflated extreme vertex
    // (fingertips and sleeve ends sit ON the quantization bounds by
    // construction) overflows Int16 and WRAPS to the opposite extreme, which
    // renders as a metre-long black spike through the viewmodel. Rebuild the
    // attribute as float first; four small viewmodel meshes can afford it, and
    // no other attribute is touched.
    const shelled = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      shelled[index * 3] = position.getX(index) + normal.getX(index) * girth;
      shelled[index * 3 + 1] = position.getY(index) + normal.getY(index) * girth;
      shelled[index * 3 + 2] = position.getZ(index) + normal.getZ(index) * girth;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(shelled, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData[ARM_GIRTH_APPLIED_KEY] = girth;
    geometry.userData.firstPersonArmGirthContract = FIRST_PERSON_ARM_GIRTH_CONTRACT;
    inflated += 1;
  });
  return inflated;
}

export function loadFirstPersonArmsAsset(): Promise<void> {
  if (firstPersonArmsAsset) return Promise.resolve();
  firstPersonArmsAssetPromise ??= loadRiggedGltf(FIRST_PERSON_ARMS_URL).catch((error: unknown) => {
    // Same anti-poisoning rule as the operator memo below: a transient fetch
    // failure must be retryable, not cached for the session.
    firstPersonArmsAssetPromise = null;
    throw error;
  }).then((arms) => {
    inflateFirstPersonArmGirth(arms.scene);
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
  ]).then(() => undefined)
    .catch((error: unknown) => {
      // A rejected load must not poison the memo: leaving the failed promise
      // cached made one transient GLB fetch failure permanent for the whole
      // session - every later remote was built with no rig and no retry was
      // possible without a full page reload. Clearing the memo lets the next
      // caller attempt a fresh load; already-loaded halves stay loaded via
      // the per-asset guards above.
      operatorAssetPromise = null;
      throw error;
    });
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
  /** Captured so a clip can never leave a digit translated or scaled. */
  bindPosition: THREE.Vector3;
  bindScale: THREE.Vector3;
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

export function createFirstPersonRiggedArms(
  flattenMaterials: boolean,
  skinId = 'default',
): FirstPersonRiggedArms | null {
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
      const result = materialForFirstPerson(material, flattenMaterials, skinId);
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
            bindPosition: bone.position.clone(),
            bindScale: bone.scale.clone(),
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
  // HF-388: the original (unfiltered) clips are decomposed into IK-layer pose
  // channels here, while the bones are still resting at their loaded bind pose.
  root.userData.firstPersonArmAuthoredLayer = buildFirstPersonArmAuthoredPoseLayer(
    firstPersonArmsAsset.clips,
    chains.map((entry) => ({ side: entry.side, shoulder: entry.shoulder, elbow: entry.elbow, wrist: entry.wrist })),
  );
  root.userData.firstPersonArmsRuntime = {
    mixer, actions, activeAction: null, baseAction: null,
  } satisfies FirstPersonArmsRuntime;
  root.userData.firstPersonArmSkinId = skinId;
  root.userData.firstPersonArmSkinContract = FIRST_PERSON_ARM_SKIN_CONTRACT;
  root.userData.firstPersonArmGirthContract = FIRST_PERSON_ARM_GIRTH_CONTRACT;
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

/**
 * Restores the COMPLETE authored digit transform each frame, not only the
 * rotation. The runtime clip filter already refuses translation and scale
 * channels; this is the second guard, so a future asset that smuggles one in
 * cannot leave a finger drifted off its knuckle.
 */
export function resetFirstPersonArmFingers(fingers: readonly FirstPersonFingerBone[]): void {
  for (const finger of fingers) {
    finger.bone.quaternion.copy(finger.bindQuaternion);
    finger.bone.position.copy(finger.bindPosition);
    finger.bone.scale.copy(finger.bindScale);
  }
}

export const FIRST_PERSON_ARM_BASE_ACTION_NAMES = Object.freeze(['idle', 'walk', 'sprint'] as const);
export type FirstPersonArmBaseAction = typeof FIRST_PERSON_ARM_BASE_ACTION_NAMES[number];

/**
 * Selects the looping locomotion clip for a movement state. Pure so the
 * mapping is testable without a mixer.
 */
export function firstPersonArmBaseActionFor(moving: boolean, sprinting: boolean): FirstPersonArmBaseAction {
  if (sprinting) return 'sprint';
  return moving ? 'walk' : 'idle';
}

/**
 * Crossfades the looping locomotion clip underneath the one-shots. Returns the
 * action that is now the base, or null when the asset does not carry it.
 */
export function setFirstPersonArmBaseAction(root: THREE.Object3D, actionName: string): string | null {
  const runtime = firstPersonArmsRuntime(root);
  const action = runtime?.actions.get(actionName);
  if (!runtime || !action) return null;
  if (runtime.baseAction === actionName) return actionName;
  const previous = runtime.baseAction ? runtime.actions.get(runtime.baseAction) : undefined;
  action.reset().setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.enabled = true;
  action.play();
  if (previous && previous !== action) previous.crossFadeTo(action, 0.18, false);
  else action.fadeIn(0.18);
  runtime.baseAction = actionName;
  return actionName;
}

export function playFirstPersonArmAction(root: THREE.Object3D, actionName: string): boolean {
  const runtime = firstPersonArmsRuntime(root);
  const action = runtime?.actions.get(actionName);
  if (!runtime || !action) return false;
  // Stop only the previous ONE-SHOT. The old stopAllAction() here also killed
  // the locomotion loop, which is why a single shot left the arms dead until
  // the next shot.
  const previousOneShot = runtime.activeAction ? runtime.actions.get(runtime.activeAction) : undefined;
  if (previousOneShot && previousOneShot !== action) previousOneShot.stop();
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = false;
  action.setEffectiveWeight(1);
  action.play();
  runtime.activeAction = actionName;
  return true;
}

export function updateFirstPersonArmAnimations(root: THREE.Object3D, dt: number): void {
  const runtime = firstPersonArmsRuntime(root);
  if (!runtime) return;
  // The one-shot owns the digits while it runs; the locomotion loop is held at
  // zero weight rather than stopped so it resumes mid-cycle instead of popping.
  const oneShot = runtime.activeAction ? runtime.actions.get(runtime.activeAction) : undefined;
  const base = runtime.baseAction ? runtime.actions.get(runtime.baseAction) : undefined;
  if (base) base.setEffectiveWeight(oneShot?.isRunning() === true ? 0 : 1);
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
  runtime.baseAction = null;
}

export function firstPersonArmAnimationState(root: THREE.Object3D | undefined): Readonly<{
  clips: number;
  activeAction: string | null;
  baseAction: string | null;
  blendPolicy: string;
  trackPolicy: string;
  runtimeTracks: number;
  upperChainTracksExcluded: number;
  skinId: string;
}> | null {
  if (!root) return null;
  const runtime = firstPersonArmsRuntime(root);
  if (!runtime) return null;
  return Object.freeze({
    clips: runtime.actions.size,
    activeAction: runtime.activeAction,
    baseAction: runtime.baseAction,
    skinId: String(root.userData.firstPersonArmSkinId ?? 'default'),
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

const DIRECTIONAL_ACTION_NAME_SET: ReadonlySet<string> = new Set(RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES);

/**
 * The runtime lives in `userData`, which is an untyped bag: the Gun Range
 * training dummy and other presentations assemble one by hand rather than going
 * through `createRiggedOperator`, and TypeScript cannot see that. Rather than
 * requiring every such site to know about the Pass 77 fields, the one function
 * that reads them fills in whatever is missing, once, from the operator itself.
 */
function ensureAnimationRuntime(runtimeState: RiggedOperatorRuntime, root: THREE.Object3D): void {
  if (runtimeState.director) return;
  runtimeState.director = createOperatorAnimationDirector(
    String(root.userData.operatorSkinId ?? 'default'),
    root.name,
  );
  runtimeState.dead = runtimeState.currentBase === 'Death';
  runtimeState.activeAnimationClips = runtimeState.currentBase ? [runtimeState.currentBase] : [];
  runtimeState.visualYawRadians = root.rotation.y;
  runtimeState.lastGroundX = root.position.x;
  runtimeState.lastGroundZ = root.position.z;
  runtimeState.lastAnimation = null;
  runtimeState.lazilyBoundDirectionalClips = 0;
}

function actionFor(runtimeState: RiggedOperatorRuntime, name: string): THREE.AnimationAction | undefined {
  const existing = runtimeState.actions.get(name);
  if (existing) return existing;
  const clip = runtimeState.clips.get(name);
  if (!clip) return undefined;
  const action = runtimeState.mixer.clipAction(clip);
  runtimeState.actions.set(name, action);
  if (DIRECTIONAL_ACTION_NAME_SET.has(name)) runtimeState.lazilyBoundDirectionalClips += 1;
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

// Pass 77 retired `switchBaseAction` (one hard-coded 0.14 s cross-fade for every
// transition, with nothing bounding how many partly-faded actions accumulated)
// and `playOneShot` (clampWhenFinished with no finished listener, so a fired,
// hit or meleed operator stayed a running average of frozen poses for the rest
// of its life). Both are now decided by the director and applied by
// `rigged-operator-animation-runtime`, which releases what leaves the mix.

export function createRiggedOperator(
  team: Team,
  name: string,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
  skinId = 'default',
): RiggedOperatorInstance | null {
  // HF-360: a selected skin whose asset has not finished loading falls back to
  // the default operator rather than blocking or failing the spawn — the skin
  // is presentation only, and lobby-time prefetch makes the race unlikely.
  const skinStore = skinId !== 'default' && operatorSkinAssetReady(skinId)
    ? operatorSkinAssets.get(skinId)
    : undefined;
  const operatorAsset = flattenMaterials
    ? skinStore?.performance ?? operatorAssets.performance
    : skinStore?.quality ?? operatorAssets.quality;
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
  const prepareMaterial = createOperatorInstanceMaterialResolver(team, flattenMaterials, appearance, skinId);
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
  const clips = new Map(riggedOperatorAvailableClips(operatorAsset.clips).map((clip) => [clip.name, clip]));
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
    // Keyed on the skin's archetype and the operator's replicated name, so two
    // bots of one archetype are visibly out of phase and every peer agrees how.
    director: createOperatorAnimationDirector(skinId, name),
    dead: false,
    activeAnimationClips: base ? [base] : [],
    visualYawRadians: root.rotation.y,
    lastGroundX: root.position.x,
    lastGroundZ: root.position.z,
    // HF-382: no stance published yet - the skin profile's idle decides until
    // a caller writes userData.operatorStanceId.
    stanceIdleFade: { clipName: null, fadeFrom: null, fadeSeconds: 0 },
    lastAnimation: null,
    lazilyBoundDirectionalClips: 0,
    poseBones: {
      hips: poseBone('Hips'),
      abdomen: poseBone('Abdomen'),
      torso: poseBone('Torso'),
      chest: poseBone('Chest'),
      neck: poseBone('Neck'),
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
    // Measured by the runtime each frame; the authored pose is used until then.
    proneClearance: null,
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
  // Kept so a respawn can rebuild the same archetype movement identity without
  // the caller having to hand the skin back.
  root.userData.operatorSkinId = skinId;
  return { root, weaponSocket };
}

/**
 * Pass 77 / HF-375. Per-frame gameplay state the animation director consumes
 * beyond the scalar speed every call site already supplies. Every field is
 * optional: an unchanged call site still gets speed matching, direction-aware
 * locomotion, turn-in-place and released one-shots, because direction and yaw
 * error are MEASURED from the operator's own root motion rather than declared.
 */
export type RiggedOperatorMotion = Readonly<{
  /** Radians, positive up, matching the camera/protocol pitch convention. */
  aimPitchRadians?: number;
  armed?: boolean;
}>;

/**
 * HF-382: how long an idle-to-idle stance change cross-fades. Short enough to
 * feel responsive in the menu turntable, long enough that the outgoing clip
 * still carries weight on the first frame after the switch - a released and
 * restarted action reads as a pose snap.
 */
export const OPERATOR_STANCE_IDLE_FADE_SECONDS = 0.28;

/** The idle corpus the stance catalog draws from (same clips as the director's). */
const STANCE_IDLE_CLIP_CORPUS: Readonly<Record<string, true>> = Object.freeze({
  Idle_Gun_Pointing: true,
  Idle_Gun: true,
  Idle_Gun_Shoot: true,
});

/**
 * The per-root stance preference, published by callers (the menu preview writes
 * it directly; gameplay replication should write the same channel). Null when
 * nothing valid is published, which preserves the pre-HF-382 behaviour exactly:
 * the skin profile's own idle preference decides.
 */
export function rootOperatorStancePreference(root: THREE.Object3D): OperatorStanceId | null {
  const value = root.userData.operatorStanceId;
  return isOperatorStanceId(value) ? value : null;
}

/**
 * HF-382: folds the selected IDLE STANCE into a director output. Advances the
 * cross-fade state, then replaces every emitted idle-corpus layer with the
 * stance's authored clip - split between the outgoing and incoming clips while
 * the fade runs so the mixer never releases-and-restarts a visible pose. Weights
 * are conserved, so the blend graph's renormalisation contract still holds.
 *
 * Pure with respect to the animation; the only mutation is `fadeState`, which
 * lives on the per-operator runtime. Death layers pass through untouched.
 */
export function applyOperatorStanceIdlePreference(
  animation: OperatorAnimationOutput,
  availableClips: ReadonlySet<string>,
  stance: OperatorStanceId,
  fadeState: { clipName: string | null; fadeFrom: string | null; fadeSeconds: number },
  deltaSeconds: number,
): OperatorAnimationOutput {
  const preferred = stanceIdleClip(stance, availableClips);
  if (fadeState.clipName !== preferred) {
    fadeState.fadeFrom = fadeState.clipName;
    fadeState.clipName = preferred;
    fadeState.fadeSeconds = 0;
  }
  let blend = 1;
  if (fadeState.fadeFrom !== null && fadeState.fadeFrom !== fadeState.clipName) {
    fadeState.fadeSeconds += Math.max(0, deltaSeconds);
    blend = Math.min(1, fadeState.fadeSeconds / OPERATOR_STANCE_IDLE_FADE_SECONDS);
    if (blend >= 1) fadeState.fadeFrom = null;
  }
  if (!availableClips.has(preferred)) return animation;
  const touchesIdle = animation.layers.some((layer) => STANCE_IDLE_CLIP_CORPUS[layer.clip] === true)
    || (animation.selectedClip !== null && STANCE_IDLE_CLIP_CORPUS[animation.selectedClip] === true);
  if (!touchesIdle) return animation;

  interface WeightedLayer {
    clip: string;
    weight: number;
    timeScale: number;
  }
  const layers: WeightedLayer[] = [];
  for (const layer of animation.layers) {
    if (!STANCE_IDLE_CLIP_CORPUS[layer.clip]) {
      layers.push({ ...layer });
      continue;
    }
    if (fadeState.fadeFrom !== null && blend < 1) {
      // Mid-fade: the outgoing idle keeps its share of this layer's weight.
      if (fadeState.fadeFrom !== preferred && availableClips.has(fadeState.fadeFrom)) {
        layers.push({
          clip: fadeState.fadeFrom,
          weight: layer.weight * (1 - blend),
          timeScale: layer.timeScale,
        });
      }
      layers.push({ clip: preferred, weight: layer.weight * blend, timeScale: layer.timeScale });
    } else {
      layers.push({ ...layer, clip: preferred });
    }
  }
  const sorted = layers
    .filter((layer) => availableClips.has(layer.clip))
    .sort((left, right) => (right.weight - left.weight) || left.clip.localeCompare(right.clip));
  return {
    ...animation,
    layers: Object.freeze(sorted),
    selectedClip: STANCE_IDLE_CLIP_CORPUS[animation.selectedClip ?? ''] === true
      ? preferred
      : animation.selectedClip,
  };
}

export function updateRiggedOperator(
  root: THREE.Object3D,
  speed: number,
  stance: 'stand' | 'crouch' | 'prone',
  motion?: RiggedOperatorMotion,
): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  ensureAnimationRuntime(runtimeState, root);
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - runtimeState.lastUpdatedAt) / 1_000));
  runtimeState.lastUpdatedAt = now;
  runtimeState.stance = stance;
  runtimeState.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
  // Published by the runtime on the operator root (the same userData channel
  // the stance, melee and minigun state already use).
  const publishedClearance = root.userData.proneClearance as ProneBodyClearance | undefined;
  runtimeState.proneClearance = publishedClearance && Number.isFinite(publishedClearance.forwardM)
    ? publishedClearance
    : null;
  for (const entry of runtimeState.poseBeforeStance ?? []) {
    entry.bone.position.copy(entry.position);
    entry.bone.quaternion.copy(entry.quaternion);
  }
  // Direction is measured from the operator's own root motion; magnitude comes
  // from the caller. That combination is why no call site had to change to stop
  // a strafing bot playing a forward run, and why the frozen debug presentation
  // route (which declares a speed while standing still) keeps working.
  const measured = localGroundVelocity(
    root.position.x - runtimeState.lastGroundX,
    root.position.z - runtimeState.lastGroundZ,
    root.rotation.y,
    dt,
  );
  runtimeState.lastGroundX = root.position.x;
  runtimeState.lastGroundZ = root.position.z;
  const velocity = directedGroundVelocity(runtimeState.speed, measured);

  // Turn-in-place is presentation only. The authoritative yaw stays exactly
  // where the caller put it - hit registration, replication and bot aim are
  // untouched - and the VISIBLE body lags it and catches up at the archetype's
  // turn rate, applied on the stance pivot the prone solve already owns.
  const yawError = wrapAngleRadians(root.rotation.y - runtimeState.visualYawRadians);

  let animation = advanceOperatorAnimation(runtimeState.director, {
    deltaSeconds: dt,
    forwardMps: velocity.forwardMps,
    strafeMps: velocity.strafeMps,
    aimPitchRadians: stance === 'prone' ? 0 : motion?.aimPitchRadians ?? 0,
    yawErrorRadians: yawError,
    dead: runtimeState.dead,
    armed: motion?.armed ?? true,
    availableClips: [...runtimeState.clips.keys()],
  });
  // HF-382: the published IDLE STANCE overrides which authored idle the mixer
  // plays, cross-faded. Presentation only - it cannot reach hit proxies or
  // movement authority, and an unpublished root behaves exactly as before.
  const stancePreference = rootOperatorStancePreference(root);
  if (stancePreference !== null) {
    animation = applyOperatorStanceIdlePreference(
      animation,
      new Set(runtimeState.clips.keys()),
      stancePreference,
      runtimeState.stanceIdleFade,
      dt,
    );
  }
  runtimeState.lastAnimation = animation;
  runtimeState.visualYawRadians = wrapAngleRadians(
    runtimeState.visualYawRadians + animation.aim.bodyYawDeltaRadians,
  );

  const plan = planOperatorMixer(animation, runtimeState.activeAnimationClips);
  applyOperatorMixerPlan(plan, (clip) => actionFor(runtimeState, clip));
  runtimeState.activeAnimationClips = plan.active;
  // `activeClip` has always meant the clip the controller SELECTED, with the
  // mixer cross-fading toward it. Reading the heaviest live layer instead would
  // report the clip being left behind for the length of every transition.
  runtimeState.currentBase = runtimeState.dead
    ? 'Death'
    : animation.selectedClip ?? runtimeState.currentBase;

  runtimeState.mixer.update(dt);
  // A corpse keeps the stance pivot and weapon socket exactly where death left
  // them, as it always has. Only the mixer runs, so the collapse can play out.
  if (runtimeState.dead) return true;
  runtimeState.poseBeforeStance = Object.values(runtimeState.poseBones)
    .filter((bone): bone is THREE.Bone => bone instanceof THREE.Bone)
    .map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    }));
  // Additive channels go on AFTER the clean pose is captured, so next frame's
  // restore wipes them and they can never accumulate across frames.
  applyOperatorAnimationPose(runtimeState.poseBones, animation);
  // The stance pivot carries the visual yaw lag; the authoritative root yaw is
  // never written here, so hit registration, replication and bot aim are
  // untouched. Set before the stance solve, which world-matrixes the pivot to
  // plant the crouch legs and must see the yaw the body is actually presenting.
  runtimeState.stancePivot.rotation.y = wrapAngleRadians(runtimeState.visualYawRadians - root.rotation.y);
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

/**
 * Pass 77: a shot is an ACCENT on top of whatever the operator is doing, with a
 * defined end - not a full-weight clip swap that stays clamped forever. The
 * director owns the envelope; nothing has to remember to switch it off.
 */
export function fireRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  ensureAnimationRuntime(runtimeState, root);
  pushOperatorOneShot(runtimeState.director, 'fire');
  return true;
}

/** Catalog emote id -> director one-shot kind. 'none' maps to nothing on purpose. */
const EMOTE_ONE_SHOT_KINDS: Readonly<Record<string, OperatorOneShotKind>> = Object.freeze({
  wave: 'emote-wave',
  'salute-punch': 'emote-punch',
  boot: 'emote-boot',
});

/**
 * Play a replicated emote on a third-person rig as a bounded one-shot. Same
 * contract as fireRiggedOperator: the director owns the envelope, so nothing has
 * to remember to switch it off, and an off-catalog id is a no-op rather than a
 * throw - the message was already host-validated, this is defence in depth.
 */
export function emoteRiggedOperator(root: THREE.Object3D, emoteId: string): boolean {
  const kind = EMOTE_ONE_SHOT_KINDS[emoteId];
  if (!kind) return false;
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  ensureAnimationRuntime(runtimeState, root);
  pushOperatorOneShot(runtimeState.director, kind);
  return true;
}

/**
 * `zone` used to be a boolean that only chose between the two authored hit
 * clips. It now carries real severity and direction into the reaction layer, so
 * a headshot flinches harder than a limb graze and a hit from the right rolls
 * the torso left - while the operator keeps running underneath.
 */
export function reactRiggedOperator(
  root: THREE.Object3D,
  zone: HitReactionZone | boolean = 'body',
  incomingYawRadians = 0,
): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  ensureAnimationRuntime(runtimeState, root);
  const resolved: HitReactionZone = typeof zone === 'boolean' ? (zone ? 'limb' : 'body') : zone;
  pushOperatorHitImpulse(runtimeState.director, {
    zone: resolved,
    severity: resolved === 'head' ? 1 : resolved === 'body' ? 0.72 : 0.45,
    incomingYawRadians,
  });
  return true;
}

export function deathRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState || !runtimeState.clips.has('Death')) return false;
  runtimeState.dead = true;
  runtimeState.currentBase = 'Death';
  return true;
}

export function resetRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  for (const action of runtimeState.actions.values()) {
    action.stop();
    action.enabled = false;
    action.clampWhenFinished = false;
  }
  const base = runtimeState.clips.has('Idle_Gun_Pointing')
    ? 'Idle_Gun_Pointing'
    : runtimeState.clips.has('Idle_Gun') ? 'Idle_Gun' : 'Idle_Gun_Shoot';
  actionFor(runtimeState, base)?.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  runtimeState.currentBase = base;
  runtimeState.dead = false;
  // A respawn is a new life: the blend graph, the aim smoothing, the breathing
  // phase and every live impulse start clean, but the archetype identity (which
  // is a property of the skin, not of the life) is rebuilt from the same keys.
  runtimeState.stanceIdleFade = { clipName: null, fadeFrom: null, fadeSeconds: 0 };
  runtimeState.director = createOperatorAnimationDirector(
    String(root.userData.operatorSkinId ?? 'default'),
    root.name,
  );
  runtimeState.activeAnimationClips = [base];
  runtimeState.lastAnimation = null;
  runtimeState.visualYawRadians = root.rotation.y;
  runtimeState.lastGroundX = root.position.x;
  runtimeState.lastGroundZ = root.position.z;
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
  ensureAnimationRuntime(runtimeState, root);
  pushOperatorOneShot(runtimeState.director, 'melee');
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
      // Pass 77 / HF-375. Everything a live capture needs to prove the system is
      // running, rather than merely compiled.
      pass77: runtimeState.director === undefined ? null : {
        contract: 'director-composed-operator-animation-v1',
        archetype: runtimeState.director.profile.archetype,
        state: runtimeState.lastAnimation?.state ?? null,
        layers: (runtimeState.lastAnimation?.layers ?? []).map((layer) => ({
          clip: layer.clip,
          weight: Number(layer.weight.toFixed(4)),
          timeScale: Number(layer.timeScale.toFixed(4)),
        })),
        baseWeightSum: Number(((runtimeState.lastAnimation?.layers ?? [])
          .reduce((sum, layer) => sum + layer.weight, 0)).toFixed(6)),
        additiveLayers: (runtimeState.lastAnimation?.additiveLayers ?? []).map((layer) => ({
          clip: layer.clip,
          weight: Number(layer.weight.toFixed(4)),
        })),
        mixedClips: [...runtimeState.activeAnimationClips],
        // The whole point of the release path: an operator that has fired, been
        // hit and meleed should NOT still be mixing three frozen poses.
        // `isScheduled()` is the only honest predicate for "contributing to the
        // mix". A freshly bound action is `enabled` with weight 1 but is not in
        // the mixer's active list and affects nothing, so filtering on enabled
        // alone reports the entire prewarmed set as live. `isRunning()` is the
        // opposite mistake: it excludes paused actions, and a clamped finished
        // one-shot is precisely a PAUSED action that still writes its frozen
        // pose every frame - the exact defect this pass exists to remove.
        mixedActions: [...runtimeState.actions.entries()]
          .filter(([, action]) => action.isScheduled() && action.enabled && action.getEffectiveWeight() > 1e-4)
          .map(([name, action]) => ({
            name,
            weight: Number(action.getEffectiveWeight().toFixed(4)),
            paused: action.paused,
          })),
        boundActions: runtimeState.actions.size,
        playbackRate: runtimeState.lastAnimation?.locomotion.playbackRate ?? null,
        footSlideMps: runtimeState.lastAnimation
          ? Number(runtimeState.lastAnimation.locomotion.footSlideMps.toFixed(4)) : null,
        footSlideRatio: runtimeState.lastAnimation
          ? Number(runtimeState.lastAnimation.locomotion.footSlideRatio.toFixed(4)) : null,
        directional: runtimeState.lastAnimation?.locomotion.directional ?? null,
        directionMismatch: runtimeState.lastAnimation
          ? Number(runtimeState.lastAnimation.locomotion.directionMismatch.toFixed(4)) : null,
        aimPitchRadians: runtimeState.lastAnimation
          ? Number(runtimeState.lastAnimation.aim.aimPitchRadians.toFixed(4)) : null,
        aimJointRadians: runtimeState.lastAnimation?.aim.aimJointRadians ?? null,
        postureSpineRadians: runtimeState.director.profile.posture.spinePitchRadians,
        turning: runtimeState.lastAnimation?.aim.turning ?? 0,
        visualYawLagRadians: Number(runtimeState.stancePivot.rotation.y.toFixed(4)),
        hitReactionWeight: runtimeState.lastAnimation
          ? Number(runtimeState.lastAnimation.hitReaction.clipWeight.toFixed(4)) : null,
        lazilyBoundDirectionalClips: runtimeState.lazilyBoundDirectionalClips,
      },
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
