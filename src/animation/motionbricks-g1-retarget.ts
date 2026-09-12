/**
 * MotionBricks G1-34 -> canonical operator rig joint correspondence.
 *
 * MotionBricks (`localai-org/motion-bricks.cpp`, Apache-2.0 port of NVIDIA's
 * `NVlabs/GR00T-WholeBodyControl` motionbricks slice) is a realtime motion
 * PLANNER, not a clip generator. For a browser game it is an offline clip
 * bakery exactly as Kimodo is: its build files carry no wasm/emscripten target
 * and `docs/IMPLEMENTATION.md:804` lists "WebAssembly inference in the browser;"
 * under "## Explicitly deferred". `THREE.AnimationMixer` stays the runtime.
 *
 * WHAT THIS IS NOT, in the same words as `kimodo-operator-retarget.ts`: it is
 * not a retargeter. It states which G1 joint corresponds to which operator
 * joint. Rest-pose calibration, axis and scale reconciliation, hip/root
 * ownership and foot-contact solving all happen against a real armature, in
 * `scripts/blender/retarget-kimodo-motion.py --source-skeleton g1-34`.
 *
 * THE JOINT LIST IS TRANSCRIBED, NOT GUESSED. Every name and parent index below
 * is read from the published `motionbricks.joint_names` metadata key and the
 * `joint_parents` tensor of
 * `LocalAI-io/MotionBricks-G1-GGML@cc2a47603dbc203a4f18f35dd06ed3611833f506`
 * `g1-f32/support.gguf` (5,472 bytes, sha256 5d41cae4bc494e612ef19e25f599351a
 * afbc9ef1cb46d4ac3f1e42bb7ab07200, matching the repo's own SHA256SUMS), read by
 * `scripts/animation/parse-mbstyle.mjs`. `G1_34_REST_OFFSETS` is that file's
 * `neutral_joints` tensor, converted from pelvis-relative absolute positions to
 * parent-relative offsets. A GUESSED joint order silently shifts every channel
 * and produces a plausible-looking wrong answer, which is the worst outcome
 * available here; the lane's stated instruction was to STOP and report BLOCKED
 * rather than guess, and it did not have to.
 *
 * THE JOINT NAMES ARE METADATA, NOT MODEL DATA. Under the NVIDIA Open Model
 * License a repackaged `.mbstyle` primitive or checkpoint is Model data and is
 * never committed; a skeleton's joint-name list and rest geometry is the
 * interface description a correspondence table has to state to be reviewable,
 * and it is what `kimodo-operator-retarget.ts` already does for SOMA-30. No
 * weights, no motion samples and no `.mbstyle` bytes appear in this file.
 */

import { OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE, OPERATOR_RIG_ID } from './kimodo-operator-retarget';

export { OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE, OPERATOR_RIG_ID };

/** Pinned provenance for everything transcribed in this module. */
export const MOTIONBRICKS_G1_SOURCE = Object.freeze({
  weightsRepo: 'https://huggingface.co/LocalAI-io/MotionBricks-G1-GGML',
  weightsCommit: 'cc2a47603dbc203a4f18f35dd06ed3611833f506',
  supportFile: 'g1-f32/support.gguf',
  supportSha256: '5d41cae4bc494e612ef19e25f599351aafbc9ef1cb46d4ac3f1e42bb7ab07200',
  portRepo: 'https://github.com/localai-org/motion-bricks.cpp',
  portCommit: '6fdb75e15ddb7f97dd1a4abb8017a57b936bc7a3',
  upstreamRevision: 'a0732b642c0333077e127a2f56ab0014c196bca4',
  codeLicence: 'Apache-2.0',
  weightsLicence: 'NVIDIA Open Model License (no jurisdiction exclusion; outputs excluded from Derivative Model)',
  skeletonId: 'g1skel34',
});

/**
 * G1-34, in emission order. `motionbricks.joint_names`, split on `,`.
 *
 * Two properties of this list decide the whole retarget and neither is
 * cosmetic:
 *
 *  1. THERE IS NO HEAD AND NO NECK. The chain above the pelvis is
 *     waist yaw -> roll -> pitch and then straight into the two shoulders. A
 *     Unitree G1's head is not an actuated link, so the model was never trained
 *     to move one. Every head and neck channel on the destination rig is
 *     therefore unmapped by construction, not by oversight.
 *  2. EVERY BALL JOINT IS A SERIAL CHAIN OF SINGLE-AXIS LINKS. Hip = pitch,
 *     roll, yaw as three separate nodes; shoulder likewise; wrist = roll,
 *     pitch, yaw plus a hand roll. The composed orientation of such a chain
 *     lives on its DEEPEST link, and its anatomical position lives on its
 *     shallowest. That is why the correspondence table below carries a separate
 *     rotation source and position source per destination joint.
 */
export const G1_34_JOINTS = Object.freeze([
  'pelvis_skel',
  'left_hip_pitch_skel', 'left_hip_roll_skel', 'left_hip_yaw_skel',
  'left_knee_skel', 'left_ankle_pitch_skel', 'left_ankle_roll_skel', 'left_toe_base',
  'right_hip_pitch_skel', 'right_hip_roll_skel', 'right_hip_yaw_skel',
  'right_knee_skel', 'right_ankle_pitch_skel', 'right_ankle_roll_skel', 'right_toe_base',
  'waist_yaw_skel', 'waist_roll_skel', 'waist_pitch_skel',
  'left_shoulder_pitch_skel', 'left_shoulder_roll_skel', 'left_shoulder_yaw_skel',
  'left_elbow_skel',
  'left_wrist_roll_skel', 'left_wrist_pitch_skel', 'left_wrist_yaw_skel', 'left_hand_roll_skel',
  'right_shoulder_pitch_skel', 'right_shoulder_roll_skel', 'right_shoulder_yaw_skel',
  'right_elbow_skel',
  'right_wrist_roll_skel', 'right_wrist_pitch_skel', 'right_wrist_yaw_skel', 'right_hand_roll_skel',
] as const);

/** Parent index per G1-34 joint, -1 for the root. From the `joint_parents` tensor. */
export const G1_34_PARENTS: readonly number[] = Object.freeze([
  -1,
  0, 1, 2, 3, 4, 5, 6,
  0, 8, 9, 10, 11, 12, 13,
  0, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24,
  17, 26, 27, 28, 29, 30, 31, 32,
]);

/**
 * Pelvis-relative rest positions, metres, Y-up, +X to the figure's LEFT,
 * +Z forward. The `neutral_joints` tensor of `support.gguf`, rounded to 1e-6.
 *
 * The arms rest pointing FORWARD (`left_hand_roll_skel` at z = +0.2998), not
 * out in a T-pose. This matters only in that the rest rotations are identity,
 * which is the property the retarget's global-delta step depends on and the
 * same property SOMA-30 has.
 */
export const G1_34_REST_POSITIONS: readonly (readonly [number, number, number])[] = Object.freeze([
  [0, 0, 0],
  [0.0645, -0.1027, 0], [0.1165, -0.1332, 0], [0.1165, -0.2573, 0.025],
  [0.1186, -0.4346, -0.0533], [0.1185, -0.7346, -0.0533], [0.1185, -0.7522, -0.0533], [0.1185, -0.7872, 0.0867],
  [-0.0645, -0.1027, 0], [-0.1165, -0.1332, 0], [-0.1165, -0.2573, 0.025],
  [-0.1186, -0.4346, -0.0533], [-0.1185, -0.7346, -0.0533], [-0.1185, -0.7522, -0.0533], [-0.1185, -0.7872, 0.0867],
  [0, 0, 0], [0, 0.044, -0.004], [0, 0.044, -0.004],
  [0.1002, 0.2918, 0], [0.1382, 0.2779, 0], [0.1445, 0.1747, 0],
  [0.1445, 0.0942, 0.0158], [0.1463, 0.0842, 0.1158], [0.1463, 0.0842, 0.1538],
  [0.1463, 0.0842, 0.1998], [0.1463, 0.0842, 0.2998],
  [-0.1002, 0.2918, 0], [-0.1382, 0.2779, 0], [-0.1444, 0.1747, 0],
  [-0.1444, 0.0942, 0.0158], [-0.1463, 0.0842, 0.1158], [-0.1463, 0.0842, 0.1538],
  [-0.1463, 0.0842, 0.1998], [-0.1463, 0.0842, 0.2998],
] as const);

/**
 * G1's REST hip height: the pelvis sits 0.7872 m above the toe base, read from
 * `G1_34_REST_POSITIONS[7].y`. Deliberately the REST height and not one
 * observed in a clip, for the reason `retarget-kimodo-motion.py` already
 * records: hip height varies with pose by design, so normalising by an observed
 * value divides the crouch out of a crouch. The MEASURED per-style pelvis
 * heights in `docs/evidence/pass86/hf422/mbstyle-inventory.json` range 0.197 m
 * (`elbow_crawling`) to 0.779 m (`idle`) on this one fixed skeleton, which is
 * that hazard stated in numbers.
 *
 * For comparison, SOMA-30's rest hip height is 0.9887 m. G1 is 20.4% shorter at
 * the hip, so a G1 clip needs a 25.6% LARGER root scale than a Kimodo clip onto
 * the same operator - the single largest difference between the two sources.
 */
export const G1_REST_HIP_HEIGHT_M = 0.7872;

export type G1RetargetTarget = Readonly<{
  /** Operator joint driven, or `null` when the source joint drives nothing. */
  operatorJoint: string | null;
  /**
   * G1 joint whose GLOBAL rotation orients the destination bone. For a
   * single-axis link that is itself; for a serial ball joint it is the deepest
   * link of the chain, whose global matrix already composes every axis.
   */
  rotationFrom: string;
  /** G1 joint whose FK position places the destination bone's head. */
  positionFrom: string;
  /** Why, in the row-16 house style. Every `null` carries one. */
  reason: string;
}>;

/**
 * G1-34 -> operator rig.
 *
 * `null` is a decision, never an oversight, and the deficiencies are named here
 * so that no one has to discover them from a capture:
 *
 *  - `Neck` and `Head` have NO G1 SOURCE AT ALL. The G1 skeleton ends at the
 *    waist. A retargeted clip therefore leaves the operator's head locked to
 *    the chest for the whole clip: no head stabilisation, no look-ahead, no
 *    counter-rotation against the shoulders. On a soldier walk that is a
 *    visible defect and it is the first thing to look for in the three-quarter
 *    capture.
 *  - `Abdomen`, `Torso` and `Chest` share one G1 source between them. G1's
 *    three waist links are effectively CO-LOCATED (offsets 0, +0.044, +0.044 m)
 *    - a single 3-DoF waist, not a spine column - while the operator carries a
 *    genuine four-segment column. The mapping is stated one-for-one below so
 *    the composed torso twist lands on `Chest`, but `Abdomen` and `Torso` each
 *    receive only one axis of it. Expect a stiffer torso than the source.
 *  - The finger and thumb chains are never written; see
 *    `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE`, which this module imports
 *    rather than restating. G1 has no fingers whatsoever - not even the two end
 *    markers per hand SOMA-30 carries - so there is nothing to write even if it
 *    were permitted.
 *  - `PT.L` / `PT.R` ARE NOT TOES, AND DRIVING THEM IS A CHANGE IN KIND FROM
 *    THE AUTHORED CONVENTION. The source side is real enough - `left_toe_base`
 *    / `right_toe_base` do exist in `g1skel34` - but the DESTINATION bones are
 *    not what an earlier draft of this table assumed. In `Swat.gltf` they are
 *    parented to `Root` (not to the leg chain), have no children, are NOT
 *    mirrored (rest translations `(0.568, 0.627, 0.227)` and
 *    `(-0.018, 0.423, 0.659)`) and sit 0.42-0.63 m above the floor. The name
 *    reads as "pole target"; nothing in the tree states their semantics and
 *    this lane did not establish them.
 *    All 24 authored clips leave both bones COMPLETELY STATIC - zero lift, zero
 *    path, parked at roughly knee height. Driving them from source FK drags
 *    them to the floor (min world Y -0.0135 / -0.0168 m) over nearly 4 m of
 *    path. Measured in `docs/evidence/pass86/hf422/foot-contact-analysis.json`.
 *    The rows are kept below only because they match the pre-existing Kimodo
 *    route in `kimodo-operator-retarget.ts`, so removing them here would put
 *    the two tables out of step. THEY MUST BE INSPECTED - most likely dropped -
 *    before any G1 clip ships. Do not read them as a toe mapping.
 */
export const G1_TO_OPERATOR: readonly G1RetargetTarget[] = Object.freeze([
  { operatorJoint: 'Hips', rotationFrom: 'pelvis_skel', positionFrom: 'pelvis_skel', reason: 'root of both skeletons; carries the figure over the ground plane' },

  { operatorJoint: 'UpperLeg.L', rotationFrom: 'left_hip_yaw_skel', positionFrom: 'left_hip_pitch_skel', reason: 'the hip is a 3-link serial chain; yaw carries the composed orientation, pitch is the anatomical hip position' },
  { operatorJoint: null, rotationFrom: 'left_hip_roll_skel', positionFrom: 'left_hip_roll_skel', reason: 'middle link of the same 3-DoF hip; its rotation is already inside the yaw link global matrix, and driving it too would double-apply the roll' },
  { operatorJoint: null, rotationFrom: 'left_hip_yaw_skel', positionFrom: 'left_hip_yaw_skel', reason: 'consumed as UpperLeg.L rotation source above; listed so every source joint has a row' },
  { operatorJoint: 'LowerLeg.L', rotationFrom: 'left_knee_skel', positionFrom: 'left_knee_skel', reason: 'single-axis knee, one-for-one with the operator shin' },
  { operatorJoint: 'Foot.L', rotationFrom: 'left_ankle_roll_skel', positionFrom: 'left_ankle_pitch_skel', reason: 'ankle is pitch then roll; roll carries the composed orientation, pitch is the ankle position' },
  { operatorJoint: null, rotationFrom: 'left_ankle_roll_skel', positionFrom: 'left_ankle_roll_skel', reason: 'consumed as Foot.L rotation source above' },
  { operatorJoint: 'PT.L', rotationFrom: 'left_toe_base', positionFrom: 'left_toe_base', reason: 'NOT a toe: PT.L is a Root-parented helper bone that all 24 authored clips leave static. Kept only to match the pre-existing Kimodo route; inspect before shipping - see the block comment above' },

  { operatorJoint: 'UpperLeg.R', rotationFrom: 'right_hip_yaw_skel', positionFrom: 'right_hip_pitch_skel', reason: 'mirror of the left hip' },
  { operatorJoint: null, rotationFrom: 'right_hip_roll_skel', positionFrom: 'right_hip_roll_skel', reason: 'mirror of the left hip roll' },
  { operatorJoint: null, rotationFrom: 'right_hip_yaw_skel', positionFrom: 'right_hip_yaw_skel', reason: 'consumed as UpperLeg.R rotation source above' },
  { operatorJoint: 'LowerLeg.R', rotationFrom: 'right_knee_skel', positionFrom: 'right_knee_skel', reason: 'mirror of the left knee' },
  { operatorJoint: 'Foot.R', rotationFrom: 'right_ankle_roll_skel', positionFrom: 'right_ankle_pitch_skel', reason: 'mirror of the left ankle' },
  { operatorJoint: null, rotationFrom: 'right_ankle_roll_skel', positionFrom: 'right_ankle_roll_skel', reason: 'consumed as Foot.R rotation source above' },
  { operatorJoint: 'PT.R', rotationFrom: 'right_toe_base', positionFrom: 'right_toe_base', reason: 'same as PT.L, and note PT.R is NOT the mirror of PT.L in the rest pose - the two helper bones are asymmetric' },

  { operatorJoint: 'Abdomen', rotationFrom: 'waist_yaw_skel', positionFrom: 'waist_yaw_skel', reason: 'lowest waist link; carries only the yaw axis, because G1 has one 3-DoF waist where the operator has a four-segment column' },
  { operatorJoint: 'Torso', rotationFrom: 'waist_roll_skel', positionFrom: 'waist_roll_skel', reason: 'middle waist link; yaw+roll composed' },
  { operatorJoint: 'Chest', rotationFrom: 'waist_pitch_skel', positionFrom: 'waist_pitch_skel', reason: 'deepest waist link; carries the full composed torso orientation' },

  { operatorJoint: 'Shoulder.L', rotationFrom: 'left_shoulder_pitch_skel', positionFrom: 'left_shoulder_pitch_skel', reason: 'clavicle stand-in; G1 has no clavicle, so this takes the first shoulder link and the arm chain below is shifted one link deeper' },
  { operatorJoint: 'UpperArm.L', rotationFrom: 'left_shoulder_yaw_skel', positionFrom: 'left_shoulder_roll_skel', reason: 'shoulder is a 3-link serial chain; yaw carries the composed orientation, roll is the anatomical shoulder position' },
  { operatorJoint: null, rotationFrom: 'left_shoulder_yaw_skel', positionFrom: 'left_shoulder_yaw_skel', reason: 'consumed as UpperArm.L rotation source above' },
  { operatorJoint: 'LowerArm.L', rotationFrom: 'left_elbow_skel', positionFrom: 'left_elbow_skel', reason: 'single-axis elbow, one-for-one with the operator forearm' },
  { operatorJoint: 'Wrist.L', rotationFrom: 'left_wrist_yaw_skel', positionFrom: 'left_wrist_roll_skel', reason: 'wrist is roll/pitch/yaw; yaw carries the composed orientation, roll is the wrist position' },
  { operatorJoint: null, rotationFrom: 'left_wrist_pitch_skel', positionFrom: 'left_wrist_pitch_skel', reason: 'middle wrist link, already inside the yaw link global matrix' },
  { operatorJoint: null, rotationFrom: 'left_wrist_yaw_skel', positionFrom: 'left_wrist_yaw_skel', reason: 'consumed as Wrist.L rotation source above' },
  { operatorJoint: null, rotationFrom: 'left_hand_roll_skel', positionFrom: 'left_hand_roll_skel', reason: 'G1 hand roll would land inside the finger chains, which the viewmodel weapon-grip contract owns; barred by OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE' },

  { operatorJoint: 'Shoulder.R', rotationFrom: 'right_shoulder_pitch_skel', positionFrom: 'right_shoulder_pitch_skel', reason: 'mirror of the left clavicle stand-in' },
  { operatorJoint: 'UpperArm.R', rotationFrom: 'right_shoulder_yaw_skel', positionFrom: 'right_shoulder_roll_skel', reason: 'mirror of the left shoulder' },
  { operatorJoint: null, rotationFrom: 'right_shoulder_yaw_skel', positionFrom: 'right_shoulder_yaw_skel', reason: 'consumed as UpperArm.R rotation source above' },
  { operatorJoint: 'LowerArm.R', rotationFrom: 'right_elbow_skel', positionFrom: 'right_elbow_skel', reason: 'mirror of the left elbow' },
  { operatorJoint: 'Wrist.R', rotationFrom: 'right_wrist_yaw_skel', positionFrom: 'right_wrist_roll_skel', reason: 'mirror of the left wrist' },
  { operatorJoint: null, rotationFrom: 'right_wrist_pitch_skel', positionFrom: 'right_wrist_pitch_skel', reason: 'mirror of the left wrist pitch' },
  { operatorJoint: null, rotationFrom: 'right_wrist_yaw_skel', positionFrom: 'right_wrist_yaw_skel', reason: 'consumed as Wrist.R rotation source above' },
  { operatorJoint: null, rotationFrom: 'right_hand_roll_skel', positionFrom: 'right_hand_roll_skel', reason: 'mirror of the left hand roll; barred for the same weapon-grip reason' },
] as const);

/**
 * Operator joints that G1 CANNOT drive, with the reason. These are named
 * deficiencies of the source skeleton, not of this table, and they are the
 * honest cost of a robot source.
 */
export const OPERATOR_JOINTS_G1_CANNOT_DRIVE: Readonly<Record<string, string>> = Object.freeze({
  Neck: 'g1skel34 has no neck link - a Unitree G1 head is not actuated, so the model never learned to move one',
  Head: 'g1skel34 has no head link; the operator head stays at rest for the whole clip',
});

/** The trial clip this lane bakes. Admitted through a test-gated debug corpus,
 *  never by raising the spawn-time prewarm ceiling. */
export const MOTIONBRICKS_TRIAL_CLIP_NAME = 'MB_Walk_Gun_Debug';

/** Source style for the trial clip, measured by parse-mbstyle.mjs. */
export const MOTIONBRICKS_TRIAL_SOURCE = Object.freeze({
  style: 'walk_gun',
  frames: 76,
  fps: 30,
  durationS: 2.5333,
  g1PelvisHeightM: 0.65995,
  pathTravelM: 2.80198,
  meanGroundSpeedMS: 1.12079,
});

/** Every operator joint this correspondence drives. */
export function g1DrivenOperatorJoints(): readonly string[] {
  return G1_TO_OPERATOR
    .map((row) => row.operatorJoint)
    .filter((joint): joint is string => joint !== null);
}

/** Index of a G1 joint by name, or -1. */
export function g1JointIndex(name: string): number {
  return G1_34_JOINTS.indexOf(name as (typeof G1_34_JOINTS)[number]);
}

/**
 * Parent-relative rest offsets, derived from the pelvis-relative absolute
 * positions. This is the form the Blender FK pass consumes, and deriving it
 * here rather than transcribing a second list keeps one source of truth.
 */
export function g1RestOffsets(): readonly (readonly [number, number, number])[] {
  return G1_34_REST_POSITIONS.map((position, index) => {
    const parent = G1_34_PARENTS[index];
    if (parent < 0) return [0, 0, 0] as const;
    const base = G1_34_REST_POSITIONS[parent];
    return [
      position[0] - base[0],
      position[1] - base[1],
      position[2] - base[2],
    ] as const;
  });
}

/**
 * Scale for root translation: destination rest hip height over G1's. Applied to
 * root translation ONLY - never to joint rotations, which are scale-free, and
 * never to the destination's own bone lengths.
 */
export function g1RootScaleForHipHeight(destinationRestHipHeightM: number): number {
  return destinationRestHipHeightM / G1_REST_HIP_HEIGHT_M;
}
