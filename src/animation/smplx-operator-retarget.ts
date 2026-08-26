/**
 * SMPL-X -> canonical operator rig joint correspondence.
 *
 * Kimodo (NVIDIA's text-to-motion model, run locally through the Apache-2.0
 * `kimodo.cpp` port) emits motion on the SMPL-X body model: a documented
 * parametric skeleton, not a bespoke rig. Nothing about that makes an
 * arbitrary destination skeleton automatic - the retarget is the work, and it
 * is the step where every foot-slide and hip-drift defect is created.
 *
 * This module is the single declared correspondence between that intermediate
 * and `pass65-third-person-operator-family-v1`, the 62-joint rig every
 * operator archetype shares. It is deliberately DATA, exported from TypeScript
 * rather than buried in a Blender script, so the mapping the runtime believes
 * in and the mapping the authoring pipeline applies are the same list, and so
 * a rig change fails a test here instead of silently producing bent clips.
 *
 * WHAT THIS IS NOT. It is not a retargeter. It states which joint corresponds
 * to which; rest-pose calibration, axis and scale reconciliation, hip/root
 * ownership and foot-contact solving all happen in Blender against a real
 * armature. Correspondence is necessary and nowhere near sufficient.
 */

/**
 * The SMPL-X body joints Kimodo drives, in the canonical SMPL-X index order.
 * The hands, face and eyes of full SMPL-X are absent by design: this model
 * emits the 22-joint body hierarchy.
 */
export const SMPLX_BODY_JOINTS = Object.freeze([
  'pelvis',
  'left_hip', 'right_hip',
  'spine1',
  'left_knee', 'right_knee',
  'spine2',
  'left_ankle', 'right_ankle',
  'spine3',
  'left_foot', 'right_foot',
  'neck',
  'left_collar', 'right_collar',
  'head',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
] as const);

export type SmplxBodyJoint = (typeof SMPLX_BODY_JOINTS)[number];

/**
 * Correspondence onto the canonical operator rig.
 *
 * `null` means the SMPL-X joint has no operator equivalent that should be
 * driven. Nothing here is a guess: each mapped pair is a like-for-like
 * position in both hierarchies, and the two spine joints that do NOT line up
 * one-to-one are called out below rather than fudged.
 *
 * Spine note: SMPL-X carries pelvis -> spine1 -> spine2 -> spine3 -> neck.
 * The operator rig carries Hips -> Abdomen -> Torso -> Chest -> Neck. Those
 * are the same four-segment column, so the mapping is direct. `Root` and
 * `Body` sit ABOVE Hips on the operator rig and are not SMPL-X joints at all -
 * they are the rig's own root/offset pair, and root motion is assigned to them
 * explicitly during retarget rather than being inherited from pelvis.
 */
export const SMPLX_TO_OPERATOR_JOINT: Readonly<Record<SmplxBodyJoint, string | null>> = Object.freeze({
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
  // SMPL-X `*_foot` is the toe base. The operator rig calls it PT (point-toe).
  left_foot: 'PT.L',

  right_hip: 'UpperLeg.R',
  right_knee: 'LowerLeg.R',
  right_ankle: 'Foot.R',
  right_foot: 'PT.R',
});

/**
 * Operator joints that a retarget must NEVER write from SMPL-X data.
 *
 * The finger chains and thumbs carry the weapon grip, which is authored and
 * pinned by the viewmodel/weapon contract, not by a text prompt. A body model
 * that does not emit hand articulation must not be allowed to zero them: that
 * is how a generated clip silently opens every operator's fist mid-fire.
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

/** Every operator joint this correspondence drives. */
export function retargetDrivenOperatorJoints(): readonly string[] {
  return Object.values(SMPLX_TO_OPERATOR_JOINT).filter((joint): joint is string => joint !== null);
}
