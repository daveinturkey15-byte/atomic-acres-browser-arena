"""Retarget a Kimodo SOMA-30 motion onto the canonical operator rig.

Run with:
  blender --background --factory-startup --python-exit-code 1 \
      --python scripts/blender/retarget-kimodo-motion.py -- \
      --blend source-assets/blender/pass74-operator-skin-explorer.blend \
      --motion artifacts/motion/raw/idle-alert-stand \
      --clip Kimodo_Idle_Alert \
      --out artifacts/motion/retargeted/idle-alert-stand.glb

WHY THIS IS NOT A QUATERNION COPY
---------------------------------
Kimodo emits PARENT-LOCAL rotations on the SOMA-30 skeleton. Our operator rig
is a different skeleton with a different rest pose. Copying a local quaternion
from one onto the other bakes in the difference between the two rest poses,
which is exactly how a retarget produces a character standing bent sideways
while every individual number looks plausible.

The compensation used here is the standard one:

  1. Compose the source LOCAL rotations up the SOMA parent chain into source
     GLOBAL rotations, per frame.
  2. SOMA's rest pose has identity local rotations (its `soma30_offsets` carry
     the rest geometry, not rest rotations), so a joint's global rotation at
     time t IS its global delta from rest. That is what makes step 3 legal;
     if the source rest were non-identity this would need an extra inverse.
  3. Apply that global delta to the DESTINATION bone's rest orientation, then
     convert back into the destination's local space through its own parent.

Scale is reconciled on REST hip height, not assumed 1:1 and not taken from a
clip. The SOMA figure's rest hips sit 0.9887 m up (summed from its own bone
offsets); the three operator archetypes are authored at 1.710 / 1.766 / 1.919 m.
Using an observed hip height instead would be wrong in a way that looks
reasonable: the standing idle measures 0.833 m and the crouch idle 0.359 m on
the very same skeleton, so normalising by observation divides the crouch out of
the crouch.

WHAT THIS SCRIPT WILL NOT DO
----------------------------
It does not touch the finger or thumb chains. Neither emitting skeleton
articulates fingers, and a retarget permitted to write them would zero them and
open every operator's fist mid-fire. The barred list is the single source in
src/animation/kimodo-operator-retarget.ts and is restated here.

It does not solve foot contact. Foot sliding is MEASURED and reported by
scripts/animation/measure-retarget-quality.mjs; the fix, when needed, is an
explicit IK pass, not a silent adjustment here.

SOURCE SKELETONS
----------------
`--source-skeleton soma30` (the default) is unchanged in every respect. A second
source, `--source-skeleton g1-34`, retargets MotionBricks' Unitree G1 skeleton
using exactly the same three-step global-delta method, because the property that
makes step 3 legal - identity rest rotations - holds for G1 too (verified: FK
from `neutral_joints` and the parent chain reproduces the published
`global_joint_positions` to 5.005e-7).

G1 differs from SOMA-30 in two ways that the table below has to state rather
than paper over. It has NO head and NO neck link, so those operator joints stay
at rest and are named deficiencies. And every ball joint is a serial chain of
single-axis links, so a destination bone takes its ORIENTATION from the deepest
link of its chain (whose global matrix composes all axes) and its POSITION from
the shallowest (the anatomical joint). That is why a G1 row carries two source
joints. `src/animation/motionbricks-g1-retarget.ts` is the reviewable statement
of this table and its test asserts the alignment; this is its mirror.

WHY IT IMPORTS THE SOURCE GLTF RATHER THAN THE SAVED .blend
-----------------------------------------------------------
The archetype .blend files hold the same 24 clips and their action data is
intact when read back (Death still carries 380 fcurves and 33 keyframes). But
exporting glTF straight from a saved .blend in Blender 5.1 collapses EVERY clip
to 2 samples - measured with no retarget in the loop at all, so this is the
exporter, not this script. The asset generator never hits it because it imports
the vendored source glTF fresh and exports in the same session. This does the
same. Do not "simplify" it back to opening the .blend.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]

# SOMA-30, transcribed from kimodo.cpp src/skeleton.hpp (soma30_names).
SOMA30_NAMES = [
    "Hips", "Spine1", "Spine2", "Chest", "Neck1", "Neck2", "Head", "Jaw",
    "LeftEye", "RightEye",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "LeftHandThumbEnd", "LeftHandMiddleEnd",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "RightHandThumbEnd", "RightHandMiddleEnd",
    "LeftLeg", "LeftShin", "LeftFoot", "LeftToeBase",
    "RightLeg", "RightShin", "RightFoot", "RightToeBase",
]
SOMA30_PARENTS = [
    -1, 0, 1, 2, 3, 4, 5, 6, 6, 6, 3, 10, 11, 12, 13, 13, 3, 16, 17, 18, 19, 19,
    0, 22, 23, 24, 0, 26, 27, 28,
]

# SOMA-30 rest bone offsets, from soma30_offsets. Needed because this rig
# cannot inherit position through parenting - see the FK note in main().
SOMA30_OFFSETS = [
    (0, 0, 0),
    (-0.00013727, 0.0500376256, -0.00053726669),
    (-1.86574103e-09, 0.0712530139, -0.000298248546),
    (-5.75188398e-09, 0.0755006305, -0.00815970992),
    (-0.00181676517, 0.263112953, -0.00553348292),
    (-2.85102231e-08, 0.0770939664, 0.0230258546),
    (-4.5975437e-08, 0.0612891595, 0.0195370861),
    (2.63687901e-05, 0.0047559225, 0.0309494062),
    (0.0320638079, 0.0538020513, 0.0758688308),
    (-0.0322244017, 0.05361869, 0.0755823359),
    (0.0162165175, 0.232371641, 0.0511341324),
    (0.149198457, 2.19397873e-08, -0.0550232576),
    (0.287393078, 2.50268389e-09, -2.58787737e-05),
    (0.270939812, -7.06625108e-09, 2.60897248e-05),
    (0.122686267, -0.0322017573, 0.0483306876),
    (0.190119595, -0.00312878387, -0.000339570373),
    (-0.0138011824, 0.231803086, 0.0521415786),
    (-0.150371962, 1.17387901e-07, -0.0554560437),
    (-0.287366393, 1.87628082e-08, -2.59709359e-05),
    (-0.271336198, -1.16767401e-09, 2.61269368e-05),
    (-0.122642483, -0.0321145448, 0.0480403904),
    (-0.190005945, -0.00306615542, -0.0003157343),
    (0.10043214, -0.0843452671, 0.0259565473),
    (-1e-08, -0.432217537, -0.00802912805),
    (1e-08, -0.421550959, -0.0348152298),
    (0, -0.0505947206, 0.132315294),
    (-0.10047278, -0.0829525995, 0.0262031695),
    (1e-08, -0.433622059, -0.00805555828),
    (2e-08, -0.421173943, -0.0347839785),
    (-3.42907669e-09, -0.0507960932, 0.132841956),
]

# SOMA-30 -> canonical operator rig. Mirrors
# src/animation/kimodo-operator-retarget.ts; None is a deliberate decision.
SOMA30_TO_OPERATOR = {
    "Hips": "Hips", "Spine1": "Abdomen", "Spine2": "Torso", "Chest": "Chest",
    "Neck1": "Neck", "Neck2": None, "Head": "Head",
    "Jaw": None, "LeftEye": None, "RightEye": None,
    "LeftShoulder": "Shoulder.L", "LeftArm": "UpperArm.L",
    "LeftForeArm": "LowerArm.L", "LeftHand": "Wrist.L",
    "LeftHandThumbEnd": None, "LeftHandMiddleEnd": None,
    "RightShoulder": "Shoulder.R", "RightArm": "UpperArm.R",
    "RightForeArm": "LowerArm.R", "RightHand": "Wrist.R",
    "RightHandThumbEnd": None, "RightHandMiddleEnd": None,
    "LeftLeg": "UpperLeg.L", "LeftShin": "LowerLeg.L",
    "LeftFoot": "Foot.L", "LeftToeBase": "PT.L",
    "RightLeg": "UpperLeg.R", "RightShin": "LowerLeg.R",
    "RightFoot": "Foot.R", "RightToeBase": "PT.R",
}

FINGER_PREFIXES = ("Index", "Middle", "Ring", "Pinky", "Thumb")

# SOMA-30 REST hip height above the ground, summed from soma30_offsets:
#   Hips -> LeftLeg   0.0843453
#        -> LeftShin  0.4322175
#        -> LeftFoot  0.4215510
#        -> LeftToe   0.0505947   (the toe base sits at about ground level)
# = 0.9887 m.
#
# This is deliberately the REST height and NOT a height observed in a clip.
# Hip height varies with POSE by design - the standing idle measures 0.833 m and
# the crouch idle 0.359 m on the same skeleton - so scaling by an observed value
# would divide the crouch out of the crouch. The source figure's stature is
# fixed by its bone offsets; that is the only thing a scale factor may come from.
SOMA_REST_HIP_HEIGHT_M = 0.0843453 + 0.4322175 + 0.4215510 + 0.0505947

# MotionBricks G1-34 -> canonical operator rig. Mirrors
# src/animation/motionbricks-g1-retarget.ts's G1_TO_OPERATOR; the value is
# (destination bone or None, joint whose GLOBAL rotation orients it). The joint
# NAMES and PARENTS are deliberately not written here - they are read from
# skeleton.json, which parse-mbstyle.mjs derives from the published support.gguf
# metadata, so there is exactly one transcription of them in the tree.
G1_TO_OPERATOR = {
    "pelvis_skel": ("Hips", "pelvis_skel"),
    "left_hip_pitch_skel": ("UpperLeg.L", "left_hip_yaw_skel"),
    "left_hip_roll_skel": (None, "left_hip_roll_skel"),
    "left_hip_yaw_skel": (None, "left_hip_yaw_skel"),
    "left_knee_skel": ("LowerLeg.L", "left_knee_skel"),
    "left_ankle_pitch_skel": ("Foot.L", "left_ankle_roll_skel"),
    "left_ankle_roll_skel": (None, "left_ankle_roll_skel"),
    "left_toe_base": ("PT.L", "left_toe_base"),
    "right_hip_pitch_skel": ("UpperLeg.R", "right_hip_yaw_skel"),
    "right_hip_roll_skel": (None, "right_hip_roll_skel"),
    "right_hip_yaw_skel": (None, "right_hip_yaw_skel"),
    "right_knee_skel": ("LowerLeg.R", "right_knee_skel"),
    "right_ankle_pitch_skel": ("Foot.R", "right_ankle_roll_skel"),
    "right_ankle_roll_skel": (None, "right_ankle_roll_skel"),
    "right_toe_base": ("PT.R", "right_toe_base"),
    "waist_yaw_skel": ("Abdomen", "waist_yaw_skel"),
    "waist_roll_skel": ("Torso", "waist_roll_skel"),
    "waist_pitch_skel": ("Chest", "waist_pitch_skel"),
    "left_shoulder_pitch_skel": ("Shoulder.L", "left_shoulder_pitch_skel"),
    "left_shoulder_roll_skel": ("UpperArm.L", "left_shoulder_yaw_skel"),
    "left_shoulder_yaw_skel": (None, "left_shoulder_yaw_skel"),
    "left_elbow_skel": ("LowerArm.L", "left_elbow_skel"),
    "left_wrist_roll_skel": ("Wrist.L", "left_wrist_yaw_skel"),
    "left_wrist_pitch_skel": (None, "left_wrist_pitch_skel"),
    "left_wrist_yaw_skel": (None, "left_wrist_yaw_skel"),
    "left_hand_roll_skel": (None, "left_hand_roll_skel"),
    "right_shoulder_pitch_skel": ("Shoulder.R", "right_shoulder_pitch_skel"),
    "right_shoulder_roll_skel": ("UpperArm.R", "right_shoulder_yaw_skel"),
    "right_shoulder_yaw_skel": (None, "right_shoulder_yaw_skel"),
    "right_elbow_skel": ("LowerArm.R", "right_elbow_skel"),
    "right_wrist_roll_skel": ("Wrist.R", "right_wrist_yaw_skel"),
    "right_wrist_pitch_skel": (None, "right_wrist_pitch_skel"),
    "right_wrist_yaw_skel": (None, "right_wrist_yaw_skel"),
    "right_hand_roll_skel": (None, "right_hand_roll_skel"),
}

# Operator joints G1 cannot reach at all, because g1skel34 ends at the waist.
# Named here so a capture never has to discover them.
OPERATOR_JOINTS_G1_CANNOT_DRIVE = ("Neck", "Head")


def load_g1_skeleton(directory: Path) -> dict:
    """Names, parents and parent-relative rest offsets, from skeleton.json.

    parse-mbstyle.mjs writes this beside the .f32 pair, derived from the
    published `motionbricks.joint_names` key and the `joint_parents` /
    `neutral_joints` tensors of support.gguf. Nothing here is guessed; if the
    file is absent the run STOPS rather than assuming a joint order, because a
    guessed order shifts every channel and still renders.
    """
    meta_path = directory / "skeleton.json"
    if not meta_path.exists():
        raise RuntimeError(
            str(meta_path) + " missing. Run: node scripts/animation/parse-mbstyle.mjs "
            "--emit-motion <style> --motion-out <dir>.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta.get("skeleton") != "g1skel34":
        raise RuntimeError("expected skeleton g1skel34, got " + repr(meta.get("skeleton")))
    if len(meta["names"]) != 34 or len(meta["parents"]) != 34:
        raise RuntimeError("g1skel34 must carry exactly 34 names and 34 parents")
    missing = sorted(set(meta["names"]) - set(G1_TO_OPERATOR))
    if missing:
        raise RuntimeError("correspondence table is missing G1 joints: " + repr(missing))
    if not isinstance(meta.get("fps"), (int, float)) or meta["fps"] <= 0:
        raise RuntimeError(
            "skeleton.json carries no usable fps. The scene frame rate must come from "
            "the source, not from Blender's default, or the clip bakes out at the wrong speed.")
    return meta



def cli(flag: str, default=None):
    tokens = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if flag in tokens:
        index = tokens.index(flag)
        if index + 1 < len(tokens):
            return tokens[index + 1]
    return default


def read_f32(path: Path) -> list[float]:
    data = path.read_bytes()
    if len(data) % 4:
        raise RuntimeError(f"{path}: not a whole number of float32 values")
    return list(struct.unpack(f"<{len(data)//4}f", data))


def load_motion(directory: Path, expected_joints: int | None = None) -> dict:
    root = read_f32(directory / "root_positions.f32")
    rot = read_f32(directory / "local_rotations_xyzw.f32")
    if len(root) % 3:
        raise RuntimeError("root_positions.f32 is not a multiple of 3")
    frames = len(root) // 3
    if len(rot) % (frames * 4):
        raise RuntimeError("rotation buffer does not divide by frames*4")
    joints = len(rot) // (frames * 4)
    expected = len(SOMA30_NAMES) if expected_joints is None else expected_joints
    if joints != expected:
        raise RuntimeError(
            f"expected {expected} source joints, got {joints}. Identify the "
            "skeleton before retargeting; a joint-count mismatch shifts every channel.")
    return {"frames": frames, "joints": joints, "root": root, "rot": rot}


def source_global_rotations(motion: dict, parents=None) -> list[list[Quaternion]]:
    """Compose parent-local rotations up the source chain into global rotations."""
    frames, joints, rot = motion["frames"], motion["joints"], motion["rot"]
    parents = SOMA30_PARENTS if parents is None else parents
    out: list[list[Quaternion]] = []
    for t in range(frames):
        globals_: list[Quaternion] = []
        for j in range(joints):
            base = (t * joints + j) * 4
            # Kimodo writes xyzw; mathutils.Quaternion takes wxyz.
            local = Quaternion((rot[base + 3], rot[base + 0], rot[base + 1], rot[base + 2]))
            parent = parents[j]
            globals_.append(local if parent < 0 else globals_[parent] @ local)
        out.append(globals_)
    return out


def source_world_positions(
    src_global: list[list[Quaternion]], root_positions: list[float],
    offsets=None, parents=None,
) -> list[list[Vector]]:
    """Forward-kinematic joint positions on the SOMA skeleton, per frame.

    position[root] = the clip's own root translation, which carries hip HEIGHT
    as well as travel. Starting the chain at the origin instead buries the
    figure by its own hip height - measured -0.8855 m, i.e. the feet ended up
    88 cm underground while every joint angle was correct.

    position[j] = position[parent] + R_global[parent] * rest_offset[j]
    """
    offsets = SOMA30_OFFSETS if offsets is None else offsets
    parents = SOMA30_PARENTS if parents is None else parents
    out: list[list[Vector]] = []
    for t, frame_rotations in enumerate(src_global):
        positions: list[Vector] = []
        for j, offset in enumerate(offsets):
            parent = parents[j]
            if parent < 0:
                positions.append(Vector(root_positions[t * 3: t * 3 + 3]))
            else:
                positions.append(positions[parent] + (frame_rotations[parent] @ Vector(offset)))
        out.append(positions)
    return out


def find_armature() -> bpy.types.Object:
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    raise RuntimeError("no armature in the blend file")


def main() -> None:
    source_gltf = ROOT / cli(
        "--source", "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf")
    motion_dir = ROOT / cli("--motion", "artifacts/motion/raw/idle-alert-stand")
    clip_name = cli("--clip", "Kimodo_Clip")
    out_path = ROOT / cli("--out", "artifacts/motion/retargeted/clip.glb")
    report_path = out_path.with_suffix(".report.json")
    source_skeleton = cli("--source-skeleton", "soma30")
    if source_skeleton not in ("soma30", "g1-34"):
        raise RuntimeError(
            "unknown --source-skeleton " + repr(source_skeleton) + "; expected soma30 or g1-34")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_gltf))
    armature = bpy.data.objects.get("CharacterArmature") or find_armature()
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")

    if source_skeleton == "g1-34":
        g1 = load_g1_skeleton(motion_dir)
        source_names = g1["names"]
        source_parents = g1["parents"]
        source_offsets = [tuple(o) for o in g1["restOffsets"]]
        source_rest_hip = g1["restHipHeightM"]
        source_fps = g1["fps"]
    else:
        source_names = SOMA30_NAMES
        source_parents = SOMA30_PARENTS
        source_offsets = SOMA30_OFFSETS
        source_rest_hip = SOMA_REST_HIP_HEIGHT_M
        # Kimodo/SOMA-30 clips are natively 24 fps, which is also Blender's
        # factory default, so this path is unchanged by being made explicit.
        source_fps = 24

    # THE SCENE FRAME RATE IS PART OF THE RETARGET, NOT A DISPLAY SETTING.
    # One key is inserted per source frame, and the glTF exporter converts key
    # indices to SECONDS using scene.render.fps. Leaving it at Blender's default
    # 24 while baking a 30 fps source exported the first trial clip at
    # 76/24 = 3.1667 s instead of 76/30 = 2.5333 s - a walk running 25% slow,
    # with every per-second figure measured off it wrong by the same factor,
    # and nothing in the file to say so.
    bpy.context.scene.render.fps = int(round(source_fps))
    bpy.context.scene.render.fps_base = bpy.context.scene.render.fps / float(source_fps)

    motion = load_motion(motion_dir, len(source_names))
    frames = motion["frames"]
    src_global = source_global_rotations(motion, source_parents)

    # Destination rest orientations, in armature space.
    rest_global: dict[str, Matrix] = {}
    for bone in armature.data.bones:
        rest_global[bone.name] = bone.matrix_local.to_quaternion().to_matrix().to_4x4()

    # Hip-height scale: the destination archetype is authored at its own
    # stature, so root translation is scaled rather than copied.
    hips_bone = armature.data.bones.get("Hips")
    if hips_bone is None:
        raise RuntimeError("canonical rig is missing the Hips joint")
    dest_hip_height = (armature.matrix_world @ hips_bone.head_local).z
    scale = dest_hip_height / source_rest_hip
    root_bone_name = "Body" if armature.pose.bones.get("Body") else "Hips"

    # (rotation source index, position source index, destination bone). The two
    # indices differ only for g1-34, where a 3-DoF ball joint is a serial chain:
    # the composed orientation lives on the chain's deepest link and the
    # anatomical position on its shallowest.
    driven: list[tuple[int, int, str]] = []
    skipped_missing: list[str] = []
    for j, name in enumerate(source_names):
        if source_skeleton == "g1-34":
            dest, rotation_source = G1_TO_OPERATOR[name]
            rotation_index = source_names.index(rotation_source)
        else:
            dest = SOMA30_TO_OPERATOR.get(name)
            rotation_index = j
        if dest is None:
            continue
        if dest.startswith(FINGER_PREFIXES):
            raise RuntimeError(f"refusing to drive weapon-grip chain {dest}")
        if dest in OPERATOR_JOINTS_G1_CANNOT_DRIVE and source_skeleton == "g1-34":
            raise RuntimeError(f"g1skel34 has no source for {dest}; it must stay unmapped")
        if armature.pose.bones.get(dest) is None:
            skipped_missing.append(dest)
            continue
        driven.append((rotation_index, j, dest))
    if skipped_missing:
        raise RuntimeError(f"rig is missing mapped joints: {sorted(skipped_missing)}")

    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"

    # The rig's 24 authored clips live on NLA TRACKS, and the export below runs
    # in NLA_TRACKS mode to match the asset generator. So this must ADD a track,
    # never clear animation data: animation_data_clear() would delete all 24.
    if armature.animation_data is None:
        armature.animation_data_create()
    action = bpy.data.actions.new(clip_name)
    previous_action = armature.animation_data.action
    armature.animation_data.action = action

    # Driven bones in HIERARCHY order. Setting pose_bone.matrix is an
    # armature-space assignment, and Blender resolves it against the parent's
    # CURRENT pose - so a child written before its parent is silently wrong.
    depth = {}

    def bone_depth(name: str) -> int:
        if name in depth:
            return depth[name]
        bone = armature.data.bones[name]
        depth[name] = 0 if bone.parent is None else bone_depth(bone.parent.name) + 1
        return depth[name]

    driven_ordered = sorted(driven, key=lambda row: bone_depth(row[2]))

    # THIS RIG CANNOT INHERIT POSITION THROUGH PARENTING.
    # Foot.R's parent is Root, not LowerLeg.R, and UpperLeg.R's parent is Body,
    # not Hips - the feet hang off the root entirely. So rotating a leg moves
    # nothing below it, which is why a rotation-only retarget produced a walk
    # whose legs swung 57 degrees while the feet measured 0.0000 m of travel.
    # The authored clips animate foot TRANSLATION directly for the same reason.
    # Every mapped bone is therefore placed explicitly from source FK.
    src_positions = source_world_positions(
        src_global, motion["root"], source_offsets, source_parents)
    # SOMA is Y-up / +Z forward; Blender is Z-up. Swap and scale to our stature.
    def to_blender(p: Vector) -> Vector:
        return Vector((p.x * scale, p.z * scale, p.y * scale))

    for t in range(frames):
        frame = t + 1
        bpy.context.scene.frame_set(frame)
        for j_rot, j_pos, dest in driven_ordered:
            pose_bone = armature.pose.bones[dest]
            # SOMA rest rotations are identity, so the source global rotation
            # at time t IS the global delta from rest. Apply it to the
            # DESTINATION bone's rest orientation to get where that bone should
            # point in armature space.
            target = src_global[t][j_rot].to_matrix().to_4x4() @ rest_global[dest]
            # Assign rotation only: keep the head where the (already-posed)
            # parent chain has just put it, so no bone is translated off its
            # joint. Blender converts this to the correct local delta itself.
            target.translation = to_blender(src_positions[t][j_pos])
            pose_bone.matrix = target
            bpy.context.view_layer.update()
            # Location is keyed as well as rotation, and that is not optional.
            # This rig exports to glTF with a FLAT node hierarchy - every bone
            # is a direct child of Root, exactly as the shipped asset does - so
            # a child's world position is carried by its own translation
            # channel, not inherited from a parent's rotation. Keying rotation
            # alone produced a walk cycle whose legs swung 57 degrees while the
            # feet never left the spot: measured 0.0000 m of foot travel where
            # the authored Walk measures 0.57 m.
            pose_bone.keyframe_insert("rotation_quaternion", frame=frame)
            pose_bone.keyframe_insert("location", frame=frame)

        # No separate root-bone key: every mapped bone is now placed from source
        # FK, and that FK already starts at the clip's own root translation, so
        # keying the root as well would apply the travel twice.

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames

    # Push the new clip onto its own NLA track beside the authored 24, then
    # detach it as the active action so it is not exported twice.
    track = armature.animation_data.nla_tracks.new()
    track.name = clip_name
    track.strips.new(clip_name, 1, action)
    armature.animation_data.action = previous_action

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Settings mirror create-pass74-operator-archetype-skins.py's export_lod.
    # NOTE: export_frame_range must NOT be set here. With it on, every action -
    # including the 24 authored ones - collapsed to 2 samples (Walk exports 33
    # in the shipped asset), because each action was clamped to the scene range
    # rather than exported over its own.
    bpy.ops.export_scene.gltf(
        filepath=str(out_path), export_format="GLB",
        use_selection=False, export_yup=True, export_apply=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_extras=True, export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=False, export_optimize_animation_size=True,
        export_tangents=True,
    )

    report = {
        "clip": clip_name,
        "frames": frames,
        "sourceSkeleton": source_skeleton,
        "sourceFps": source_fps,
        "sceneFps": bpy.context.scene.render.fps / bpy.context.scene.render.fps_base,
        "clipDurationS": round(frames / float(source_fps), 4),
        "drivenJoints": sorted(dest for _, _, dest in driven),
        "drivenCount": len(driven),
        "unmappedSourceJoints": sorted(
            n for n in source_names
            if (G1_TO_OPERATOR[n][0] if source_skeleton == "g1-34" else SOMA30_TO_OPERATOR.get(n)) is None),
        "operatorJointsSourceCannotDrive": (
            list(OPERATOR_JOINTS_G1_CANNOT_DRIVE) if source_skeleton == "g1-34" else []),
        "hipHeightScale": round(scale, 5),
        "destinationHipHeightM": round(dest_hip_height, 4),
        "sourceRestHipHeightM": round(source_rest_hip, 4),
        "rootBone": root_bone_name,
        "sourceGltf": str(source_gltf.relative_to(ROOT)),
        "motion": str(motion_dir.relative_to(ROOT)),
        "glb": str(out_path.relative_to(ROOT)),
    }
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8", newline="")
    print("RETARGET_REPORT=" + json.dumps(report, sort_keys=True))
    print(f"GLB={out_path}")


main()
