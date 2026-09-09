/**
 * Kimodo motion skeletons -> canonical operator rig joint correspondence.
 *
 * Kimodo (NVIDIA's text-to-motion model, run locally through the Apache-2.0
 * `kimodo.cpp` port) emits motion on ONE OF SEVERAL documented parametric
 * skeletons, not on a bespoke rig, and not always the same one. Nothing about
 * that makes an arbitrary destination skeleton automatic - the retarget is the
 * work, and it is the step where every foot-slide and hip-drift defect is
 * created.
 *
 * WHICH SKELETON IS A MEASUREMENT, NOT A README CLAIM. The port's own
 * description says it "gives you SMPL-X", and that is true of the SMPL-X
 * checkpoint - which is the one we may NOT use, because its internal-R&D
 * licence forbids distributing derivative models. The checkpoint we can and do
 * use, `soma-rp-v1.1`, emits **SOMA-30**. A first cut of this module was
 * written against SMPL-X's 22 joints on the strength of that sentence; the
 * first real generation came back with 30, and the inspector caught it before
 * anything was retargeted. Both layouts are carried here, transcribed from
 * `src/skeleton.hpp` in the port, and the joint COUNT is what selects between
 * them at import time.
 *
 * WHAT THIS IS NOT. It is not a retargeter. It states which joint corresponds
 * to which; rest-pose calibration, axis and scale reconciliation, hip/root
 * ownership and foot-contact solving all happen against a real armature.
 * Correspondence is necessary and nowhere near sufficient.
 */

/** Canonical operator rig identity every archetype shares. */
export const OPERATOR_RIG_ID = 'pass65-third-person-operator-family-v1';
export const OPERATOR_JOINT_COUNT = 62;

/**
 * SOMA-30, in emission order. Transcribed from `soma30_names` in the port.
 * This is the layout `soma-rp-v1.1` actually produces.
 */
export const SOMA30_JOINTS = Object.freeze([
  'Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Neck2', 'Head', 'Jaw',
  'LeftEye', 'RightEye',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'LeftHandThumbEnd', 'LeftHandMiddleEnd',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'RightHandThumbEnd', 'RightHandMiddleEnd',
  'LeftLeg', 'LeftShin', 'LeftFoot', 'LeftToeBase',
  'RightLeg', 'RightShin', 'RightFoot', 'RightToeBase',
] as const);

/** Parent index per SOMA-30 joint, -1 for the root. From `soma30_parents`. */
export const SOMA30_PARENTS: readonly number[] = Object.freeze([
  -1, 0, 1, 2, 3, 4, 5, 6, 6, 6, 3, 10, 11, 12, 13, 13, 3, 16, 17, 18, 19, 19,
  0, 22, 23, 24, 0, 26, 27, 28,
]);

/** SMPL-X 22-joint body layout, from `smplx22_names`. Kept for the G1/SMPL-X
 * checkpoints; NOT what `soma-rp-v1.1` emits. */
export const SMPLX22_JOINTS = Object.freeze([
  'pelvis', 'left_hip', 'right_hip', 'spine1', 'left_knee', 'right_knee',
  'spine2', 'left_ankle', 'right_ankle', 'spine3', 'left_foot', 'right_foot',
  'neck', 'left_collar', 'right_collar', 'head', 'left_shoulder',
  'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
] as const);

/**
 * SOMA-30 -> operator rig.
 *
 * `null` means the source joint has no operator equivalent that should be
 * driven, and each one is a deliberate decision rather than an oversight:
 *
 *  - `Neck2`, `Jaw`, `LeftEye`, `RightEye` - the operator rig has ONE neck
 *    joint and no facial rig at all. Driving a second neck segment onto the
 *    same bone double-applies the head tilt.
 *  - `*HandThumbEnd`, `*HandMiddleEnd` - the weapon grip is authored and
 *    pinned by the viewmodel contract. A generated clip must never write the
 *    finger chains; see OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE.
 */
export const SOMA30_TO_OPERATOR_JOINT: Readonly<Record<string, string | null>> = Object.freeze({
  Hips: 'Hips',
  Spine1: 'Abdomen',
  Spine2: 'Torso',
  Chest: 'Chest',
  Neck1: 'Neck',
  Neck2: null,
  Head: 'Head',
  Jaw: null,
  LeftEye: null,
  RightEye: null,

  LeftShoulder: 'Shoulder.L',
  LeftArm: 'UpperArm.L',
  LeftForeArm: 'LowerArm.L',
  LeftHand: 'Wrist.L',
  LeftHandThumbEnd: null,
  LeftHandMiddleEnd: null,

  RightShoulder: 'Shoulder.R',
  RightArm: 'UpperArm.R',
  RightForeArm: 'LowerArm.R',
  RightHand: 'Wrist.R',
  RightHandThumbEnd: null,
  RightHandMiddleEnd: null,

  LeftLeg: 'UpperLeg.L',
  LeftShin: 'LowerLeg.L',
  LeftFoot: 'Foot.L',
  LeftToeBase: 'PT.L',

  RightLeg: 'UpperLeg.R',
  RightShin: 'LowerLeg.R',
  RightFoot: 'Foot.R',
  RightToeBase: 'PT.R',
});

/**
 * SMPL-X 22 -> operator rig. Spine note: SMPL-X carries
 * pelvis -> spine1 -> spine2 -> spine3 -> neck and the operator rig carries
 * Hips -> Abdomen -> Torso -> Chest -> Neck, the same four-segment column.
 */
export const SMPLX22_TO_OPERATOR_JOINT: Readonly<Record<string, string | null>> = Object.freeze({
  pelvis: 'Hips',
  spine1: 'Abdomen',
  spine2: 'Torso',
  spine3: 'Chest',
  neck: 'Neck',
  head: 'Head',
  left_collar: 'Shoulder.L',
  left_shoulder: 'UpperArm.L',
  left_elbow: 'LowerArm.L',
  left_wrist: 'Wrist.L',
  right_collar: 'Shoulder.R',
  right_shoulder: 'UpperArm.R',
  right_elbow: 'LowerArm.R',
  right_wrist: 'Wrist.R',
  left_hip: 'UpperLeg.L',
  left_knee: 'LowerLeg.L',
  left_ankle: 'Foot.L',
  left_foot: 'PT.L',
  right_hip: 'UpperLeg.R',
  right_knee: 'LowerLeg.R',
  right_ankle: 'Foot.R',
  right_foot: 'PT.R',
});

export type KimodoSkeletonId = 'soma30' | 'smplx22';

export type KimodoSkeleton = Readonly<{
  id: KimodoSkeletonId;
  joints: readonly string[];
  toOperator: Readonly<Record<string, string | null>>;
}>;

export const KIMODO_SKELETONS: Readonly<Record<KimodoSkeletonId, KimodoSkeleton>> = Object.freeze({
  soma30: Object.freeze({ id: 'soma30', joints: SOMA30_JOINTS, toOperator: SOMA30_TO_OPERATOR_JOINT }),
  smplx22: Object.freeze({ id: 'smplx22', joints: SMPLX22_JOINTS, toOperator: SMPLX22_TO_OPERATOR_JOINT }),
});

/**
 * Identify the emitting skeleton from the joint count recovered from the raw
 * export. The `.f32` files carry no shape metadata, so this is the only
 * identification available at import time - and guessing it wrong silently
 * shifts every channel by one joint.
 */
export function kimodoSkeletonForJointCount(joints: number): KimodoSkeleton | null {
  if (joints === SOMA30_JOINTS.length) return KIMODO_SKELETONS.soma30;
  if (joints === SMPLX22_JOINTS.length) return KIMODO_SKELETONS.smplx22;
  return null;
}

/**
 * Operator joints a retarget must NEVER write.
 *
 * The finger and thumb chains carry the weapon grip, which the viewmodel and
 * weapon contracts own. Neither emitting skeleton articulates fingers - SOMA-30
 * carries only two end markers per hand - so a retarget permitted to write
 * these would zero them and open every operator's fist mid-fire. `Root` and
 * `Body` sit above `Hips` and are the rig's own root pair: root motion is
 * assigned to them explicitly, never inherited from the source hips.
 */
export const OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE: readonly string[] = Object.freeze([
  'Root', 'Body',
  ...(['L', 'R'] as const).flatMap((side) => [
    `Index1.${side}`, `Index2.${side}`, `Index3.${side}`, `Index4.${side}`,
    `Middle1.${side}`, `Middle2.${side}`, `Middle3.${side}`, `Middle4.${side}`,
    `Ring1.${side}`, `Ring2.${side}`, `Ring3.${side}`, `Ring4.${side}`,
    `Pinky1.${side}`, `Pinky2.${side}`, `Pinky3.${side}`, `Pinky4.${side}`,
    `Thumb1.${side}`, `Thumb2.${side}`, `Thumb3.${side}`,
  ]),
]);

/** Every operator joint a given skeleton drives. */
export function retargetDrivenOperatorJoints(skeleton: KimodoSkeleton): readonly string[] {
  return skeleton.joints
    .map((joint) => skeleton.toOperator[joint] ?? null)
    .filter((joint): joint is string => joint !== null);
}

/**
 * Measured on the first real generation (`soma-rp-v1.1`, 60 frames, seed 1234,
 * prompt "a person walks forward at a steady pace"):
 *
 *   quaternion norms  1.000000 .. 1.000000  (decode is exact)
 *   root y            0.971 .. 1.040 m      -> Y IS UP, hip height ~1.006 m
 *   root z            -0.029 .. 5.266 m     -> forward travel on +Z, 5.30 m
 *   loop seam         38.48 deg worst joint -> a traversal, not a cycle
 *
 * Recorded because the destination rig is Y-up too but is authored at a
 * different stature per archetype (1.710 / 1.766 / 1.919 m), so the hip-height
 * ratio is the scale calibration a retarget starts from rather than assuming
 * 1:1.
 */
export const KIMODO_CANARY_MEASUREMENTS = Object.freeze({
  upAxis: 'y' as const,
  forwardAxis: 'z' as const,
  sourceHipHeightM: 1.006,
});
