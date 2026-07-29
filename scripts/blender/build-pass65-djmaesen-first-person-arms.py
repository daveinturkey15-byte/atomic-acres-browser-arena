"""Build the isolated Pass 65 DJMaesen first-person-arms prototype.

This prototype deliberately writes only to artifacts/ until the source licence,
visual contact sheet, and native WebGPU review have been accepted.  It preserves
the source skin/UVs, removes the unrelated Sketchfab icosphere, collapses the
five terminal finger-tip joints into the canonical three-joint digit contract,
and partitions the real (non-duplicated) source faces into four render batches.
"""

from __future__ import annotations

from array import array
import hashlib
import json
import math
import os
from pathlib import Path

import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils.bvhtree import BVHTree
from mathutils import Matrix, Quaternion, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(
    os.environ.get(
        "PASS65_DJMAESEN_SOURCE",
        ROOT / "source-assets/third-party/djmaesen-fps-arms",
    )
).resolve()
OUTPUT_DIR = ROOT / "artifacts/blender-operator-arms/djmaesen-prototype"
TEXTURE_DIR = OUTPUT_DIR / "textures"
REVIEW_DIR = OUTPUT_DIR / "reviews"
REVIEW_WEAPON_DIR = OUTPUT_DIR / "review-weapons"
SOURCE_GLTF = SOURCE_DIR / "scene.gltf"
OUTPUT_GLB = OUTPUT_DIR / "pass65-first-person-arms-lod0.glb"
OUTPUT_LOD1_GLB = OUTPUT_DIR / "pass65-first-person-arms-lod1.glb"
OUTPUT_BLEND = OUTPUT_DIR / "pass65-first-person-arms-djmaesen-prototype.blend"
TEXTURE_SIZE = 1024
REVIEW_WIDTH = 960
REVIEW_HEIGHT = 540
ASSET_ID = "pass65-first-person-operator-arms"
SOURCE_UID = "08ec4403a47645d8ad80633abf13d39d"
SOURCE_MIRROR_COMMIT = "96fdc4c94ba6c37786b0af6e8caf44b6cf2913f0"
SOURCE_SHA256 = {
    "license.txt": "0a3a79ee4fcd16538ee0760c29217c6306035f1609414bfe386a4847876de50b",
    "scene.bin": "e247e239feab51f84a14da4b018e61093d0bf29dfaace43e409089d7b5c7bc79",
    "scene.gltf": "f2b5527846da489d6d33614ecf4725c28b89c680c884f4ea6d2790e6491465fd",
    "textures/material_diffuse.png": "c388b8708509cd606c6257d01a48a3fd04022659cf6bc129c9868a165cb45ae4",
    "textures/material_normal.png": "9f78779b21248cbef81ccb9988d53e0b349c011ef7c00b0f94c000094bb1ba38",
    "textures/material_occlusion.png": "9f7f37d86a9d818c9063a40a427bbaa92589d42773c285508d70a4f639059075",
    "textures/material_specularGlossiness.png": "484489addcbae2c46ea1972bca754fd03d0624dd7bbbcbba2397f1356a183c3f",
}
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
)
CANONICAL_BONES = (
    "Root",
    "UpperArmR", "LowerArmR", "WristR",
    "Index1R", "Index2R", "Index3R", "Middle1R", "Middle2R", "Middle3R",
    "Ring1R", "Ring2R", "Ring3R", "Pinky1R", "Pinky2R", "Pinky3R",
    "Thumb1R", "Thumb2R", "Thumb3R",
    "UpperArmL", "LowerArmL", "WristL",
    "Index1L", "Index2L", "Index3L", "Middle1L", "Middle2L", "Middle3L",
    "Ring1L", "Ring2L", "Ring3L", "Pinky1L", "Pinky2L", "Pinky3L",
    "Thumb1L", "Thumb2L", "Thumb3L",
)


def env_vector(name: str, default) -> Vector:
    raw = os.environ.get(name)
    if raw is None:
        return Vector(default)
    values = tuple(float(value.strip()) for value in raw.split(","))
    if len(values) != 3:
        raise RuntimeError(f"{name} requires three comma-separated values, got {raw!r}")
    return Vector(values)


def env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    value = float(os.environ.get(name, str(default)))
    if not minimum <= value <= maximum:
        raise RuntimeError(
            f"{name}={value} outside reviewed range [{minimum}, {maximum}]"
        )
    return value


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge1 <= edge0:
        raise RuntimeError(f"invalid smoothstep range {edge0}..{edge1}")
    factor = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return factor * factor * (3.0 - 2.0 * factor)

# Source L/R already match the canonical anatomical side.  A 180-degree
# authoring-root turn moves the source's -Y view direction to Blender +Y (and
# therefore the runtime -Z axis) while preserving those labels.
BONE_RENAMES = {
    "_rootJoint": "Root",
    "L_arm_01": "UpperArmL", "L_elbow_02": "LowerArmL", "L_wrist_03": "WristL",
    "L_thumb1_04": "Thumb1L", "L_thumb2_05": "Thumb2L", "L_thumb3_06": "Thumb3L",
    "L_point1_08": "Index1L", "L_point2_09": "Index2L", "L_point3_010": "Index3L",
    "L_middle1_012": "Middle1L", "L_middle2_00": "Middle2L", "L_middle3_013": "Middle3L",
    "L_ring1_015": "Ring1L", "L_ring2_016": "Ring2L", "L_ring3_017": "Ring3L",
    "L_pink1_019": "Pinky1L", "L_pink2_020": "Pinky2L", "L_pink3_021": "Pinky3L",
    "R_arm_023": "UpperArmR", "R_elbow_024": "LowerArmR", "R_wrist_025": "WristR",
    "R_thumb1_026": "Thumb1R", "R_thumb2_027": "Thumb2R", "R_thumb3_028": "Thumb3R",
    "R_point1_030": "Index1R", "R_point2_031": "Index2R", "R_point3_032": "Index3R",
    "R_middle1_034": "Middle1R", "R_middle2_035": "Middle2R", "R_middle3_036": "Middle3R",
    "R_ring1_038": "Ring1R", "R_ring2_039": "Ring2R", "R_ring3_040": "Ring3R",
    "R_pink1_042": "Pinky1R", "R_pink2_043": "Pinky2R", "R_pink3_044": "Pinky3R",
}
TIP_TO_DISTAL = {
    "L_thumb4_07": "L_thumb3_06", "L_point4_011": "L_point3_010",
    "L_middle4_014": "L_middle3_013", "L_ring4_018": "L_ring3_017",
    "L_pink4_022": "L_pink3_021",
    "R_thumb4_029": "R_thumb3_028", "R_point4_033": "R_point3_032",
    "R_middle4_037": "R_middle3_036", "R_ring4_041": "R_ring3_040",
    "R_pink4_045": "R_pink3_044",
}

for directory in (OUTPUT_DIR, TEXTURE_DIR, REVIEW_DIR, REVIEW_WEAPON_DIR):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def verify_frozen_source() -> None:
    failures = []
    for relative, expected in SOURCE_SHA256.items():
        source = SOURCE_DIR / relative
        if not source.is_file():
            failures.append(f"missing {source}")
            continue
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual != expected:
            failures.append(f"{source}: expected sha256 {expected}, got {actual}")
    if failures:
        raise RuntimeError("DJMaesen source package integrity failed:\n- " + "\n- ".join(failures))


def reset() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras,
        bpy.data.lights, bpy.data.actions, bpy.data.images, bpy.data.armatures,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError(f"missing shader input {names}")


def load_scaled_image(source: Path, name: str, output: Path, colorspace: str) -> bpy.types.Image:
    image = bpy.data.images.load(str(source), check_existing=False)
    image.name = name
    image.colorspace_settings.name = colorspace
    image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    image.file_format = "PNG"
    image.filepath_raw = str(output)
    image.save()
    return image


def read_pixels(image: bpy.types.Image) -> array:
    result = array("f", [0.0]) * (len(image.pixels))
    image.pixels.foreach_get(result)
    return result


def image_from_pixels(name: str, output: Path, pixels: array, colorspace: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(pixels)
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(output)
    image.save()
    return image


def build_textures():
    diffuse = load_scaled_image(
        SOURCE_DIR / "textures/material_diffuse.png",
        "Pass65_DJMaesen_SourceDiffuse_1024",
        TEXTURE_DIR / "pass65-arms-skin-baseColor.png",
        "sRGB",
    )
    normal = load_scaled_image(
        SOURCE_DIR / "textures/material_normal.png",
        "Pass65_DJMaesen_Normal_1024",
        TEXTURE_DIR / "pass65-first-person-arms-normal.png",
        "Non-Color",
    )
    occlusion = load_scaled_image(
        SOURCE_DIR / "textures/material_occlusion.png",
        "Pass65_DJMaesen_Occlusion_1024",
        TEXTURE_DIR / "pass65-arms-source-occlusion.png",
        "Non-Color",
    )
    spec_gloss = load_scaled_image(
        SOURCE_DIR / "textures/material_specularGlossiness.png",
        "Pass65_DJMaesen_SpecGloss_1024",
        TEXTURE_DIR / "pass65-arms-source-specGloss.png",
        "Non-Color",
    )

    source = read_pixels(diffuse)
    tactical = array("f", [0.0]) * len(source)
    for offset in range(0, len(source), 4):
        red, green, blue, alpha = source[offset:offset + 4]
        luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        # Lift crushed black cloth, reduce the dirty brown cast, and retain the
        # source weave/creases instead of synthesizing replacement UV detail.
        value = min(0.34, 0.007 + math.pow(max(luminance, 0.0), 0.92) * 0.45)
        residual_r = (red - luminance) * 0.16
        residual_g = (green - luminance) * 0.12
        residual_b = (blue - luminance) * 0.10
        tactical[offset] = max(0.0, min(1.0, value * 0.70 + residual_r))
        tactical[offset + 1] = max(0.0, min(1.0, value * 0.77 + residual_g))
        tactical[offset + 2] = max(0.0, min(1.0, value * 0.84 + residual_b))
        tactical[offset + 3] = alpha
    tactical_base = image_from_pixels(
        "Pass65_Arms_TacticalBase_1024",
        TEXTURE_DIR / "pass65-first-person-arms-baseColor.png",
        tactical,
        "sRGB",
    )

    occ_pixels = read_pixels(occlusion)
    spec_pixels = read_pixels(spec_gloss)
    orm = array("f", [0.0]) * len(occ_pixels)
    roughness_map = array("f", [0.0]) * len(occ_pixels)
    metallic_map = array("f", [0.0]) * len(occ_pixels)
    for offset in range(0, len(orm), 4):
        ao = max(0.2, min(1.0, occ_pixels[offset]))
        gloss = max(0.0, min(1.0, spec_pixels[offset + 3]))
        roughness = max(0.36, min(0.96, 1.0 - gloss))
        orm[offset:offset + 4] = array("f", (ao, roughness, 0.0, 1.0))
        roughness_map[offset:offset + 4] = array(
            "f", (roughness, roughness, roughness, 1.0),
        )
        metallic_map[offset:offset + 4] = array("f", (0.0, 0.0, 0.0, 1.0))
    orm_image = image_from_pixels(
        "Pass65_Arms_ORM_1024",
        TEXTURE_DIR / "pass65-arms-orm.png",
        orm,
        "Non-Color",
    )
    image_from_pixels(
        "Pass65_Arms_Roughness_1024",
        TEXTURE_DIR / "pass65-first-person-arms-roughness.png",
        roughness_map,
        "Non-Color",
    )
    image_from_pixels(
        "Pass65_Arms_Metallic_1024",
        TEXTURE_DIR / "pass65-first-person-arms-metallic.png",
        metallic_map,
        "Non-Color",
    )

    decoded_bytes = TEXTURE_SIZE * TEXTURE_SIZE * 4 * 4
    return {
        "skin": diffuse,
        "tactical": tactical_base,
        "normal": normal,
        "orm": orm_image,
        "decoded_bytes": decoded_bytes,
    }


def gltf_occlusion_socket(nodes: bpy.types.Nodes, material_name: str):
    group = bpy.data.node_groups.new(f"{material_name}_glTF_Settings", "ShaderNodeTree")
    group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    node = nodes.new("ShaderNodeGroup")
    node.name = "glTF Material Output"
    node.label = "glTF Material Output"
    node.node_tree = group
    return node.inputs["Occlusion"]


def pbr_material(name: str, base_image: bpy.types.Image, images, tint, roughness_bias: float):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*tint, 1.0)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = (*tint, 1.0)
    input_socket(bsdf, "Roughness").default_value = roughness_bias
    input_socket(bsdf, "Metallic").default_value = 0.0

    base = nodes.new("ShaderNodeTexImage")
    base.name = f"{name}_BaseColor"
    base.image = base_image
    tint_multiply = nodes.new("ShaderNodeMixRGB")
    tint_multiply.blend_type = "MULTIPLY"
    tint_multiply.inputs[0].default_value = 1.0
    tint_multiply.inputs[2].default_value = (*tint, 1.0)
    links.new(base.outputs["Color"], tint_multiply.inputs[1])
    links.new(tint_multiply.outputs["Color"], input_socket(bsdf, "Base Color"))

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"{name}_ORM"
    orm.image = images["orm"]
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], input_socket(bsdf, "Roughness"))
    links.new(separate.outputs["Blue"], input_socket(bsdf, "Metallic"))
    links.new(separate.outputs["Red"], gltf_occlusion_socket(nodes, name))

    normal = nodes.new("ShaderNodeTexImage")
    normal.name = f"{name}_Normal"
    normal.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    # Keep each anatomical render batch semantically distinct through glTF
    # optimization while retaining one shared source normal map.
    normal_map.inputs["Strength"].default_value = 0.58 + roughness_bias * 0.18
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))
    material["opaque_depth_write_contract"] = True
    material["source_texture_uvs_preserved"] = True
    material["render_batch_semantic"] = name
    return material


def build_materials(images):
    return {
        "sleeve": pbr_material(
            "MAT_Pass65_Arms_Sleeve_PBR", images["tactical"], images,
            (0.92, 0.97, 1.0), 0.82,
        ),
        "glove": pbr_material(
            "MAT_Pass65_Arms_Glove_PBR", images["tactical"], images,
            (0.78, 0.86, 0.92), 0.76,
        ),
        "accent": pbr_material(
            "MAT_Pass65_Arms_WristAccent_PBR", images["tactical"], images,
            (0.30, 0.92, 0.96), 0.58,
        ),
        "skin": pbr_material(
            "MAT_Pass65_Arms_FingerGlove_PBR", images["tactical"], images,
            (1.00, 1.00, 1.00), 0.66,
        ),
    }


def import_source():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLTF))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    skinned = [obj for obj in imported if obj.type == "MESH" and len(obj.vertex_groups) >= 40]
    if len(armatures) != 1 or len(skinned) != 1:
        raise RuntimeError(f"unexpected source structure armatures={len(armatures)} skinned={len(skinned)}")
    armature = armatures[0]
    mesh = skinned[0]
    source_triangles = sum(len(poly.vertices) - 2 for poly in mesh.data.polygons)
    if len(mesh.data.vertices) != 4026 or source_triangles != 7028:
        raise RuntimeError(
            f"source geometry drift vertices={len(mesh.data.vertices)} triangles={source_triangles}"
        )
    for obj in imported:
        if obj not in {armature, mesh}:
            bpy.data.objects.remove(obj, do_unlink=True)
    # The unparented Sketchfab Icosphere is outside the imported hierarchy and
    # must never be mistaken for authored arm geometry.
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj != mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
    return armature, mesh, source_triangles


def canonical_digit_segment_metrics(armature):
    """Fail closed on malformed or disconnected three-phalanx chains."""
    digits = {}
    maximum_segment = 0.0
    maximum_joint_gap = 0.0
    minimum_distal_alignment = 1.0
    for side in ("L", "R"):
        for digit in ("Index", "Middle", "Ring", "Pinky", "Thumb"):
            first, second, distal = (
                armature.data.bones[f"{digit}{joint}{side}"]
                for joint in (1, 2, 3)
            )
            lengths = (first.length, second.length, distal.length)
            proximal_ratio = lengths[0] / max(lengths[1], 1e-8)
            distal_ratio = lengths[2] / max(lengths[1], 1e-8)
            first_gap = (first.tail_local - second.head_local).length
            second_gap = (second.tail_local - distal.head_local).length
            middle_direction = distal.head_local - second.head_local
            distal_direction = distal.tail_local - distal.head_local
            if middle_direction.length_squared < 1e-10 or distal_direction.length_squared < 1e-10:
                raise RuntimeError(f"{digit}{side}: degenerate canonical digit direction")
            distal_alignment = middle_direction.normalized().dot(
                distal_direction.normalized()
            )
            maximum_segment = max(maximum_segment, *lengths)
            maximum_joint_gap = max(maximum_joint_gap, first_gap, second_gap)
            minimum_distal_alignment = min(minimum_distal_alignment, distal_alignment)
            if not 0.70 <= proximal_ratio <= 1.85:
                raise RuntimeError(
                    f"{digit}{side}: proximal phalanx ratio drift {proximal_ratio:.4f}"
                )
            if not 0.68 <= distal_ratio <= 0.76:
                raise RuntimeError(
                    f"{digit}{side}: distal phalanx ratio drift {distal_ratio:.4f}"
                )
            if max(lengths) > 6.5:
                raise RuntimeError(
                    f"{digit}{side}: unbounded canonical phalanx length {max(lengths):.4f}"
                )
            if max(first_gap, second_gap) > 1e-5:
                raise RuntimeError(
                    f"{digit}{side}: disconnected phalanx chain gap "
                    f"{max(first_gap, second_gap):.8f}"
                )
            if distal_alignment < 0.999:
                raise RuntimeError(
                    f"{digit}{side}: terminal tail direction drift {distal_alignment:.6f}"
                )
            digits[f"{digit}{side}"] = {
                "segmentLengthsSourceUnits": lengths,
                "proximalToMiddleRatio": proximal_ratio,
                "distalToMiddleRatio": distal_ratio,
                "maximumJointGapSourceUnits": max(first_gap, second_gap),
                "distalDirectionAlignment": distal_alignment,
            }
    return {
        "contract": "connected-bounded-three-phalanx-chain-v2",
        "digits": digits,
        "maximumSegmentSourceUnits": maximum_segment,
        "maximumJointGapSourceUnits": maximum_joint_gap,
        "minimumDistalDirectionAlignment": minimum_distal_alignment,
        "passed": True,
    }


def transfer_tip_weights_and_rename(armature, mesh) -> None:
    for tip_name, distal_name in TIP_TO_DISTAL.items():
        source_group = mesh.vertex_groups.get(tip_name)
        target_group = mesh.vertex_groups.get(distal_name)
        if source_group is None or target_group is None:
            raise RuntimeError(f"missing source tip transfer {tip_name}->{distal_name}")
        for vertex in mesh.data.vertices:
            entry = next((item for item in vertex.groups if item.group == source_group.index), None)
            if entry is not None and entry.weight > 0:
                target_group.add([vertex.index], entry.weight, "ADD")
        mesh.vertex_groups.remove(source_group)

    for source_name, canonical_name in BONE_RENAMES.items():
        bone = armature.data.bones.get(source_name)
        if bone is None:
            raise RuntimeError(f"missing source bone {source_name}")
        bone.name = canonical_name
    for source_name, canonical_name in BONE_RENAMES.items():
        group = mesh.vertex_groups.get(canonical_name) or mesh.vertex_groups.get(source_name)
        if group is None:
            raise RuntimeError(f"missing renamed vertex group {source_name}->{canonical_name}")
        group.name = canonical_name

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    rig_integrity = {
        "contract": "canonical-child-head-tail-and-bounded-distal-extrapolation-v1",
        "gotcha": (
            "Malformed terminal-joint tail -> distal IK explosion -> canonicalize "
            "from child heads with bounded extrapolation -> assert phalanx ratios"
        ),
        "digits": {},
    }
    for side in ("L", "R"):
        upper = armature.data.edit_bones[f"UpperArm{side}"]
        lower = armature.data.edit_bones[f"LowerArm{side}"]
        wrist = armature.data.edit_bones[f"Wrist{side}"]
        upper.tail = lower.head.copy()
        lower.tail = wrist.head.copy()
        digit_bases = []
        for digit in ("Index", "Middle", "Ring", "Pinky", "Thumb"):
            first = armature.data.edit_bones[f"{digit}1{side}"]
            second = armature.data.edit_bones[f"{digit}2{side}"]
            distal = armature.data.edit_bones[f"{digit}3{side}"]
            first.tail = second.head.copy()
            second.tail = distal.head.copy()
            first_length = first.length
            second_length = second.length
            if not 0.70 <= first_length / max(second_length, 1e-8) <= 1.85:
                raise RuntimeError(
                    f"{digit}{side}: proximal phalanx ratio drift "
                    f"{first_length / max(second_length, 1e-8):.4f}"
                )
            distal_length = second_length * 0.72
            distal_direction = distal.head - second.head
            if distal_direction.length_squared < 1e-10:
                raise RuntimeError(f"{digit}{side}: degenerate distal direction")
            distal.tail = distal.head + distal_direction.normalized() * distal_length
            if not 0.68 <= distal.length / max(second.length, 1e-8) <= 0.76:
                raise RuntimeError(
                    f"{digit}{side}: distal phalanx ratio drift "
                    f"{distal.length / max(second.length, 1e-8):.4f}"
                )
            if max(first.length, second.length, distal.length) > 6.5:
                raise RuntimeError(
                    f"{digit}{side}: unbounded canonical phalanx length "
                    f"{max(first.length, second.length, distal.length):.4f}"
                )
            rig_integrity["digits"][f"{digit}{side}"] = {
                "segmentLengthsSourceUnits": [first.length, second.length, distal.length],
                "proximalToMiddleRatio": first.length / second.length,
                "distalToMiddleRatio": distal.length / second.length,
            }
            digit_bases.append(first.head.copy())
        wrist.tail = sum(digit_bases, Vector()) / len(digit_bases)
    for tip_name in TIP_TO_DISTAL:
        tip = armature.data.edit_bones.get(tip_name)
        if tip is None:
            raise RuntimeError(f"missing terminal edit bone {tip_name}")
        armature.data.edit_bones.remove(tip)
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)

    actual = {bone.name for bone in armature.data.bones}
    if actual != set(CANONICAL_BONES):
        raise RuntimeError(f"canonical bone mismatch missing={set(CANONICAL_BONES)-actual} extra={actual-set(CANONICAL_BONES)}")
    rig_integrity["canonicalValidation"] = canonical_digit_segment_metrics(armature)
    armature["rig_integrity"] = json.dumps(rig_integrity, sort_keys=True)

    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    mesh.select_set(False)


def connected_component_count(mesh_obj) -> int:
    adjacency = [set() for _ in mesh_obj.data.vertices]
    for edge in mesh_obj.data.edges:
        left, right = edge.vertices
        adjacency[left].add(right)
        adjacency[right].add(left)
    seen = set()
    components = 0
    for index in range(len(adjacency)):
        if index in seen:
            continue
        components += 1
        stack = [index]
        seen.add(index)
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
    return components


def author_first_person_shoulder_anchors(armature, mesh_objects) -> None:
    """Move each licensed arm branch into an FPS-specific bind arrangement.

    The source bind pose is a symmetric presentation pose.  A viewmodel needs
    narrower shoulders, with the support shoulder farther forward.  Moving the
    full per-side weighted geometry and its matching bind branch preserves the
    original deformation and topology while eliminating the T-pose convergence
    that a rotation-only IK solve cannot correct.
    """
    # Both shoulders live below and outside the gameplay frustum.  The source
    # T-pose roots were almost level with the camera, which forced metres of
    # sleeve across the image even when the hands themselves solved correctly.
    # These are bind-space translations (not render-time scale/hide tricks):
    # the same complete skinned chains remain available to runtime IK.
    offsets = {
        "L": Vector((-6.0, -24.0, -28.0)),
        "R": Vector((6.0, -8.0, -28.0)),
    }
    for mesh_obj in mesh_objects:
        group_names = {group.index: group.name for group in mesh_obj.vertex_groups}
        for vertex in mesh_obj.data.vertices:
            side_scores = {"L": 0.0, "R": 0.0}
            for membership in vertex.groups:
                name = group_names.get(membership.group, "")
                if name.endswith("L"):
                    side_scores["L"] += membership.weight
                elif name.endswith("R"):
                    side_scores["R"] += membership.weight
            side = "L" if side_scores["L"] >= side_scores["R"] else "R"
            if side_scores[side] <= 0:
                raise RuntimeError(
                    f"unweighted source vertex cannot be anchored: {mesh_obj.name}:{vertex.index}"
                )
            vertex.co += offsets[side]
        mesh_obj.data.update()

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in armature.data.edit_bones:
        side = "L" if bone.name.endswith("L") else "R" if bone.name.endswith("R") else None
        if side:
            bone.head += offsets[side]
            bone.tail += offsets[side]
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)


def cap_proximal_sleeves(mesh_obj) -> int:
    """Close both deliberately exposed shoulder boundaries with weighted faces.

    The imported sleeve already carries the correct UpperArm weights on its
    boundary ring.  Filling that existing ring adds no vertices and therefore
    inherits real deform weights instead of attaching a rigid cosmetic plug.
    """
    mesh_data = mesh_obj.data
    before_triangles = sum(len(poly.vertices) - 2 for poly in mesh_data.polygons)
    bm = bmesh.new()
    bm.from_mesh(mesh_data)
    boundary_edges = [edge for edge in bm.edges if len(edge.link_faces) == 1]
    edge_neighbors = {}
    for edge in boundary_edges:
        for vertex in edge.verts:
            edge_neighbors.setdefault(vertex, set()).add(edge)
    boundary_components = []
    unseen = set(boundary_edges)
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            for vertex in current.verts:
                for neighbor in edge_neighbors[vertex]:
                    if neighbor in unseen:
                        unseen.remove(neighbor)
                        component.add(neighbor)
                        stack.append(neighbor)
        boundary_components.append(component)
    proximal_components = [
        component for component in boundary_components
        if sum(vertex.co.y for edge in component for vertex in edge.verts) / (2 * len(component)) > -5.0
    ]
    if len(proximal_components) != 2:
        component_summary = sorted(
            (
                len(component),
                round(sum(vertex.co.y for edge in component for vertex in edge.verts) / (2 * len(component)), 3),
            )
            for component in boundary_components
        )
        bm.free()
        raise RuntimeError(
            f"expected two proximal shoulder boundary loops, found {len(proximal_components)}; "
            f"all boundary components={component_summary}"
        )
    proximal_edges = [edge for component in proximal_components for edge in component]
    existing_faces = set(bm.faces)
    bmesh.ops.holes_fill(bm, edges=proximal_edges, sides=0)
    new_faces = [face for face in bm.faces if face not in existing_faces]
    if len(new_faces) != 2:
        bm.free()
        raise RuntimeError(f"expected two shoulder cap faces, found {len(new_faces)}")
    bmesh.ops.triangulate(bm, faces=new_faces)
    bm.to_mesh(mesh_data)
    bm.free()
    mesh_data.update()
    after_triangles = sum(len(poly.vertices) - 2 for poly in mesh_data.polygons)
    added = after_triangles - before_triangles
    if added < 12:
        raise RuntimeError(f"weighted shoulder cap topology too small: triangles={added}")
    return added


def split_loose_parts(mesh):
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [obj for obj in bpy.data.objects if obj == mesh or obj not in before]


def boundary_loop_records(obj):
    edge_use = {}
    for polygon in obj.data.polygons:
        vertices = tuple(polygon.vertices)
        for index, left in enumerate(vertices):
            edge = tuple(sorted((left, vertices[(index + 1) % len(vertices)])))
            edge_use[edge] = edge_use.get(edge, 0) + 1
    adjacency = {}
    for (left, right), use_count in edge_use.items():
        if use_count != 1:
            continue
        adjacency.setdefault(left, set()).add(right)
        adjacency.setdefault(right, set()).add(left)
    unseen = set(adjacency)
    records = []
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        points = [obj.data.vertices[index].co for index in component]
        centroid = sum(points, Vector()) / len(points)
        records.append({
            "vertices": len(component),
            "centroid": tuple(centroid),
            "minimum": tuple(min(point[axis] for point in points) for axis in range(3)),
            "maximum": tuple(max(point[axis] for point in points) for axis in range(3)),
        })
    return sorted(records, key=lambda record: record["vertices"], reverse=True)


def closest_point_on_segment(point: Vector, start: Vector, end: Vector) -> Vector:
    delta = end - start
    if delta.length_squared < 1e-10:
        return start.copy()
    factor = max(0.0, min(1.0, (point - start).dot(delta) / delta.length_squared))
    return start + delta * factor


def refine_sleeve_profile(
    part, armature, support_radial_scale: float, firing_radial_scale: float,
) -> None:
    average_x = sum(vertex.co.x for vertex in part.data.vertices) / len(part.data.vertices)
    side = "L" if average_x > 0 else "R"
    radial_scale = support_radial_scale if side == "L" else firing_radial_scale
    shoulder = armature.data.bones[f"UpperArm{side}"].head_local.copy()
    elbow = armature.data.bones[f"LowerArm{side}"].head_local.copy()
    wrist = armature.data.bones[f"Wrist{side}"].head_local.copy()
    for vertex in part.data.vertices:
        first = closest_point_on_segment(vertex.co, shoulder, elbow)
        second = closest_point_on_segment(vertex.co, elbow, wrist)
        use_lower_arm = (vertex.co - second).length_squared < (vertex.co - first).length_squared
        center = second if use_lower_arm else first
        # Preserve the licensed silhouette while adapting its presentation-
        # pose sleeve volume to a near-camera viewmodel.  The source's broad
        # hero-render sleeves dominate a 16:9 FPS frame.  Preserve enough
        # radius to read as a clothed human forearm rather than the rejected
        # thin tube, while keeping the complete weighted chain clear of the
        # receiver.
        profile = 1.0
        if side == "L" and use_lower_arm:
            lower_axis = wrist - elbow
            lower_progress = max(0.0, min(
                1.0,
                (center - elbow).dot(lower_axis) / max(lower_axis.length_squared, 1e-8),
            ))
            # Preserve believable cloth volume through the elbow and close the
            # pinched wrist transition without turning the whole limb into a
            # uniform hose.  Mid-forearm remains the narrowest point.
            profile += 0.06 * (1.0 - smoothstep(0.0, 0.35, lower_progress))
            profile += 0.14 * smoothstep(0.55, 1.0, lower_progress)
        vertex.co = center + (vertex.co - center) * radial_scale * profile


def separate_cuff_band(part):
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    part.select_set(True)
    bpy.context.view_layer.objects.active = part
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    selected = 0
    # The two 561-vertex sleeve components terminate near source Y=-17.6.
    # A narrow real face band at that authored cuff becomes the teal detail;
    # no face is copied and the source UV coordinates remain untouched.
    for polygon in part.data.polygons:
        center_y = sum(part.data.vertices[index].co.y for index in polygon.vertices) / len(polygon.vertices)
        polygon.select = center_y < -12.6
        selected += int(polygon.select)
    if selected < 12 or selected >= len(part.data.polygons) - 12:
        raise RuntimeError(f"invalid cuff face partition {part.name}: {selected}/{len(part.data.polygons)}")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    created = [obj for obj in bpy.data.objects if obj not in before]
    if len(created) != 1:
        raise RuntimeError(f"cuff partition produced {len(created)} objects")
    return created[0]


def extend_cuff_band(part, armature) -> None:
    """Stretch the real distal sleeve band into the glove without a seam."""
    average_x = sum(vertex.co.x for vertex in part.data.vertices) / len(part.data.vertices)
    side = "L" if average_x > 0 else "R"
    elbow = armature.data.bones[f"LowerArm{side}"].head_local.copy()
    wrist = armature.data.bones[f"Wrist{side}"].head_local.copy()
    axis = wrist - elbow
    if axis.length_squared < 1e-10:
        raise RuntimeError(f"{side} cuff bridge has a degenerate lower-arm axis")
    axis.normalize()
    projections = [(vertex.co - elbow).dot(axis) for vertex in part.data.vertices]
    minimum, maximum = min(projections), max(projections)
    if maximum - minimum <= 1e-5:
        raise RuntimeError(f"{side} cuff bridge has no authored axial span")
    for vertex, projection in zip(part.data.vertices, projections):
        distal = smoothstep(0.0, 1.0, (projection - minimum) / (maximum - minimum))
        center = closest_point_on_segment(vertex.co, elbow, wrist)
        radial = vertex.co - center
        vertex.co = center + radial * (1.0 + distal * 0.035) + axis * distal * 0.90
    part.data.update()


def assign_single_material(obj, material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True


def join_parts(name, parts, material, armature, root_key, source_piece_count):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    result = parts[0]
    bpy.context.view_layer.objects.active = result
    if len(parts) > 1:
        bpy.ops.object.join()
    result.name = name
    result.parent = None
    assign_single_material(result, material)
    modifiers = [modifier for modifier in result.modifiers if modifier.type == "ARMATURE"]
    if not modifiers:
        modifier = result.modifiers.new("Pass65 licensed arms skin", "ARMATURE")
        modifier.object = armature
    else:
        modifiers[0].object = armature
        for redundant in modifiers[1:]:
            result.modifiers.remove(redundant)
    result["pass65_asset_root"] = root_key
    result["opaque_release_mesh"] = True
    result["batched_skinned_renderable"] = True
    result["batched_material"] = material.name
    result["weighted_part_count"] = source_piece_count
    result["source_faces_unique"] = True
    return result


def partition_render_batches(mesh, armature, materials, root_key, source_triangles, authored_cap_triangles):
    if connected_component_count(mesh) != 14:
        raise RuntimeError(f"source disconnected-component contract drift: {connected_component_count(mesh)}")
    parts = split_loose_parts(mesh)
    ranked = sorted(parts, key=lambda obj: len(obj.data.vertices), reverse=True)
    counts = sorted((len(obj.data.vertices) for obj in ranked), reverse=True)
    if counts != [671, 671, 561, 561, 167, 167, 164, 164, 164, 164, 164, 164, 122, 122]:
        raise RuntimeError(f"source loose-part signature drift: {counts}")
    gloves = [obj for obj in ranked if len(obj.data.vertices) == 671]
    sleeves = [obj for obj in ranked if len(obj.data.vertices) == 561]
    skin = [obj for obj in ranked if len(obj.data.vertices) < 500]
    if os.environ.get("PASS65_DEBUG_GLOVE_BOUNDARIES") == "1":
        for glove in gloves:
            print(
                "PASS65_GLOVE_BOUNDARIES",
                glove.name,
                json.dumps(boundary_loop_records(glove)),
            )
    sleeve_radial_scale = env_float(
        "PASS65_SLEEVE_RADIAL_SCALE", 0.86, 0.48, 0.86,
    )
    firing_sleeve_radial_scale = env_float(
        "PASS65_FIRING_SLEEVE_RADIAL_SCALE", 0.56, 0.48, 0.66,
    )
    for sleeve in sleeves:
        refine_sleeve_profile(
            sleeve, armature, sleeve_radial_scale, firing_sleeve_radial_scale,
        )
    accents = [separate_cuff_band(part) for part in sleeves]
    for accent in accents:
        extend_cuff_band(accent, armature)
    batches = [
        join_parts("Pass65_Arms_Batch_Sleeve", sleeves, materials["sleeve"], armature, root_key, 2),
        join_parts("Pass65_Arms_Batch_Glove", gloves, materials["glove"], armature, root_key, 2),
        join_parts("Pass65_Arms_Batch_WristAccent", accents, materials["accent"], armature, root_key, 2),
        join_parts("Pass65_Arms_Batch_Skin", skin, materials["skin"], armature, root_key, 10),
    ]
    triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in batches)
    expected = source_triangles + authored_cap_triangles
    if triangles != expected:
        raise RuntimeError(f"face conservation failed expected={expected} batches={triangles}")
    return batches, triangles


def refine_hand_proportions(batches, armature, hand_scale: float) -> None:
    """Scale each complete hand branch about its wrist in bind space.

    The licensed scan has hero-render hands that are intentionally broad near
    the lens.  At the actual 16:9 gameplay FOV that silhouette is larger than
    the M4/MP5 controls and hides the articulated digits.  Scaling the real
    glove/skin vertices together with all thirty digit bones preserves source
    topology, UVs, weights, and finger animation.  The glove now uses a smooth
    wrist-to-palm taper so the authored cuff ring remains full-size and closed;
    uniformly shrinking that ring caused the rejected open-cuff silhouette.
    """
    if not 0.75 <= hand_scale <= 1.0:
        raise RuntimeError(f"hand scale outside reviewed range: {hand_scale}")
    wrists = {
        side: armature.data.bones[f"Wrist{side}"].head_local.copy()
        for side in ("L", "R")
    }
    digit_base_centers = {
        side: sum(
            (
                armature.data.bones[f"{digit}1{side}"].head_local.copy()
                for digit in ("Index", "Middle", "Ring", "Pinky", "Thumb")
            ),
            Vector(),
        ) / 5.0
        for side in ("L", "R")
    }
    palm_axes = {
        side: (digit_base_centers[side] - wrists[side]).normalized()
        for side in ("L", "R")
    }
    palm_lengths = {
        side: (digit_base_centers[side] - wrists[side]).length
        for side in ("L", "R")
    }
    if min(palm_lengths.values()) <= 1e-6:
        raise RuntimeError(f"degenerate hand axes {palm_lengths}")
    hand_batches = [
        batch for batch in batches
        if "Glove" in batch.name or "Skin" in batch.name
    ]
    if len(hand_batches) != 2:
        raise RuntimeError(
            f"expected disjoint glove and skin batches, found {[item.name for item in hand_batches]}"
        )
    for batch in hand_batches:
        is_glove = "Glove" in batch.name
        group_names = {group.index: group.name for group in batch.vertex_groups}
        for vertex in batch.data.vertices:
            side_scores = {"L": 0.0, "R": 0.0}
            for membership in vertex.groups:
                name = group_names.get(membership.group, "")
                if name.endswith("L"):
                    side_scores["L"] += membership.weight
                elif name.endswith("R"):
                    side_scores["R"] += membership.weight
            side = "L" if side_scores["L"] >= side_scores["R"] else "R"
            if side_scores[side] <= 0:
                raise RuntimeError(
                    f"unweighted hand vertex cannot be proportioned: {batch.name}:{vertex.index}"
                )
            wrist = wrists[side]
            relative = vertex.co - wrist
            scale = hand_scale
            if is_glove:
                normalized_along = (
                    relative.dot(palm_axes[side]) / palm_lengths[side]
                )
                taper = smoothstep(0.08, 0.82, normalized_along)
                scale = 1.0 - (1.0 - hand_scale) * taper
                # Sink the proximal glove ring a few millimetres into the
                # sleeve.  The meshes stay disjoint and source weighted, but
                # the overlap remains closed when the wrist rotates away from
                # the lower-arm bone in an FPS support grip.
                cuff_overlap = palm_lengths[side] * 0.10 * (
                    1.0 - smoothstep(-0.05, 0.25, normalized_along)
                )
                relative -= palm_axes[side] * cuff_overlap
            vertex.co = wrist + relative * scale
        batch.data.update()

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for side in ("L", "R"):
        wrist = wrists[side]
        for digit in ("Index", "Middle", "Ring", "Pinky", "Thumb"):
            for joint in (1, 2, 3):
                bone = armature.data.edit_bones[f"{digit}{joint}{side}"]
                bone.head = wrist + (bone.head - wrist) * hand_scale
                bone.tail = wrist + (bone.tail - wrist) * hand_scale
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    bpy.context.view_layer.update()
    rig_integrity = json.loads(armature["rig_integrity"])
    rig_integrity["postHandScale"] = canonical_digit_segment_metrics(armature)
    rig_integrity["handProportioning"] = {
        "contract": "full-cuff-smooth-palm-taper-v1",
        "handScale": hand_scale,
        "gloveTaperNormalizedRange": [0.08, 0.82],
        "proximalGloveOverlapPalmFraction": 0.10,
    }
    armature["rig_integrity"] = json.dumps(rig_integrity, sort_keys=True)


def empty(name, world_location, parent=None, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.045
    obj.parent = parent
    obj.matrix_world = Matrix.Translation(Vector(world_location))
    obj["canonical_node_name"] = name
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def bone_socket(name, world_location, armature, bone_name, semantic):
    obj = empty(name, world_location, armature, semantic)
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = Matrix.Translation(Vector(world_location))
    obj["deform_parent_bone"] = bone_name
    return obj


def set_pose_rotation(armature, bone_name, rotation):
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        return
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = rotation


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def add_armature_action(armature, clip_name: str, end_frame: int, middle_frame: int, pose_map):
    action = bpy.data.actions.new(f"Pass65Arms_{clip_name}__{armature.name}")
    armature.animation_data_create()
    armature.animation_data.action = action
    reset_pose(armature)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=1)
    for bone_name, rotation in pose_map.items():
        set_pose_rotation(armature, bone_name, rotation)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=middle_frame)
    reset_pose(armature)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=end_frame)
    track = armature.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = end_frame
    armature.animation_data.action = None
    reset_pose(armature)


def action_corpus(armature):
    # Upper-chain keys are retained for editable Blender review.  Live runtime
    # filters them out and applies finger tracks before authoritative socket IK.
    poses = {
        "equip": (14, 7, {"UpperArmR": (-0.08, 0.04, -0.06), "UpperArmL": (-0.08, -0.04, 0.06)}),
        "unequip": (14, 8, {"UpperArmR": (0.12, -0.10, 0.16), "UpperArmL": (0.12, 0.10, -0.16)}),
        "idle": (48, 24, {"UpperArmR": (-0.012, 0.008, -0.008), "UpperArmL": (-0.012, -0.008, 0.008)}),
        "walk": (24, 12, {"UpperArmR": (-0.025, 0.015, -0.025), "UpperArmL": (0.025, -0.015, 0.025)}),
        "sprint": (22, 11, {"UpperArmR": (0.16, -0.10, 0.20), "UpperArmL": (0.13, 0.12, -0.22)}),
        "ads-in": (12, 8, {"UpperArmR": (-0.04, 0.02, -0.025), "UpperArmL": (-0.05, -0.02, 0.025)}),
        "ads-out": (12, 5, {"UpperArmR": (-0.04, 0.02, -0.025), "UpperArmL": (-0.05, -0.02, 0.025)}),
        "fire": (7, 2, {"WristR": (-0.035, 0.0, 0.012)}),
        "dry-fire": (5, 2, {"WristR": (-0.018, 0.0, 0.008)}),
        "reload": (30, 15, {"UpperArmL": (0.20, -0.16, 0.24), "LowerArmL": (-0.28, 0.06, -0.08)}),
        "empty-reload": (40, 20, {"UpperArmL": (0.24, -0.20, 0.28), "LowerArmL": (-0.34, 0.07, -0.10)}),
        "melee": (18, 8, {"UpperArmR": (-0.26, -0.20, 0.34), "LowerArmR": (-0.32, 0.03, -0.12)}),
        "inspect": (54, 27, {"UpperArmR": (0.10, -0.16, 0.18), "UpperArmL": (0.08, 0.14, -0.18)}),
    }
    finger_scales = {
        "Index": (0.025, 0.05, 0.035),
        "Middle": (0.08, 0.14, 0.09),
        "Ring": (0.10, 0.17, 0.11),
        "Pinky": (0.12, 0.20, 0.13),
        "Thumb": (0.05, 0.09, 0.06),
    }
    for action_name, (_end, _middle, pose) in poses.items():
        action_scale = 1.0 if action_name in {"fire", "reload", "empty-reload", "melee", "inspect"} else 0.42
        for side in ("L", "R"):
            for digit, curls in finger_scales.items():
                for joint, value in enumerate(curls, start=1):
                    pose[f"{digit}{joint}{side}"] = (value * action_scale, 0.0, 0.0)
    for clip_name in CORE_ACTIONS:
        end_frame, middle_frame, pose = poses[clip_name]
        add_armature_action(armature, clip_name, end_frame, middle_frame, pose)


def weighting_receipt(batches):
    blended_vertices = 0
    multi_bone_batches = 0
    pairs = set()
    for batch in batches:
        group_names = {group.index: group.name for group in batch.vertex_groups}
        batch_blended = False
        for vertex in batch.data.vertices:
            active = sorted(
                group_names[membership.group]
                for membership in vertex.groups
                if membership.weight > 0.05 and membership.group in group_names
            )
            if len(active) < 2:
                continue
            blended_vertices += 1
            batch_blended = True
            for left in range(len(active)):
                for right in range(left + 1, len(active)):
                    pairs.add(":".join(sorted((active[left], active[right]))))
        if batch_blended:
            multi_bone_batches += 1
    required = {
        "LowerArmL:WristL", "LowerArmR:WristR",
        "LowerArmL:UpperArmL", "LowerArmR:UpperArmR",
        "Index1L:Index2L", "Index1R:Index2R",
        "Index2L:Index3L", "Index2R:Index3R",
        "Thumb1L:Thumb2L", "Thumb1R:Thumb2R",
        "Thumb2L:Thumb3L", "Thumb2R:Thumb3R",
    }
    missing = sorted(required - pairs)
    if blended_vertices < 240 or missing:
        raise RuntimeError(
            "licensed arms weighting contract failed "
            f"blended={blended_vertices} missingPairs={missing}"
        )
    return blended_vertices, multi_bone_batches, sorted(pairs)


def configure_asset_root(
    armature, batches, source_triangles, authored_cap_triangles,
    delivery_triangles, decoded_texture_bytes,
):
    blended_vertices, multi_bone_batches, blended_pairs = weighting_receipt(batches)
    root = empty("Pass65_FirstPersonArms_LOD0", (0, 0, 0))
    root["asset_id"] = ASSET_ID
    root["asset_root_key"] = root.name
    root["creator"] = "DJMaesen; Atomic Acres integration"
    root["license"] = "CC-BY-4.0"
    root["license_url"] = "https://creativecommons.org/licenses/by/4.0/"
    root["source_title"] = "fps arms"
    root["source_creator"] = "DJMaesen (bumstrum)"
    root["source_url"] = "https://sketchfab.com/3d-models/fps-arms-08ec4403a47645d8ad80633abf13d39d"
    root["source_creator_url"] = "https://sketchfab.com/bumstrum"
    root["modified_by"] = "Atomic Acres project"
    root["modification_notice"] = (
        "Retargeted 47 to 37 bones; removed Icosphere; adapted bind pose, sleeves, "
        "hands, PBR materials, sockets, action clips, LODs, and weapon contacts."
    )
    root["source_asset_uid"] = SOURCE_UID
    root["source_mirror_commit"] = SOURCE_MIRROR_COMMIT
    root["quality_tier"] = "LOD0"
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "+Y"
    root["opaque_material_contract"] = True
    root["presentation_only"] = True
    root["visual_revision"] = "licensed-anatomical-viewmodel-v7"
    root["limb_profile_contract"] = "licensed-human-skin-and-glove-deformation-v1"
    root["hand_pose_contract"] = "licensed-articulated-fingerless-glove-grip-v1"
    root["glove_construction_contract"] = "opaque-uv-preserved-licensed-human-hand-v1"
    root["shoulder_entry_contract"] = "weighted-capped-frame-edge-sleeve-v1"
    root["weapon_grip_review_contract"] = "seven-view-actual-weapon-contact-v1"
    root["runtime_animation_contract"] = "authored-fingers-under-runtime-chain-ik-v1"
    root["finger_segment_count"] = 30
    root["source_vertex_count"] = 4026
    root["source_triangle_count"] = source_triangles
    root["authored_weighted_shoulder_cap_triangles"] = authored_cap_triangles
    root["delivery_triangle_count"] = delivery_triangles
    root["source_disconnected_component_count"] = 14
    root["source_weighted_part_count"] = 16
    root["source_terminal_joints_collapsed"] = 10
    root["expected_bone_count"] = len(CANONICAL_BONES)
    root["batched_skinned_mesh_count"] = len(batches)
    root["render_region_count"] = 4
    root["geometry_duplication_count"] = 0
    root["max_skinned_renderable_meshes"] = 6
    root["max_skinned_primitives"] = 6
    root["batching_policy"] = "four-disjoint-source-face-regions"
    root["blended_vertex_count"] = blended_vertices
    root["multi_bone_weighted_part_count"] = multi_bone_batches
    root["blended_joint_pairs_csv"] = ",".join(blended_pairs)
    root["weighting_contract"] = "adjacent-bone-normalized-blend-v5"
    root["texture_resolution"] = TEXTURE_SIZE
    root["decoded_texture_budget_bytes"] = decoded_texture_bytes
    root["texture_grade_contract"] = "source-uv-preserved-charcoal-navy-teal-pbr-v1"
    root["weapon_grip_review_frames"] = 7
    root["reviewed_hand_scale_from_source"] = float(
        os.environ.get("PASS65_HAND_SCALE", "1.0")
    )

    transform = (
        Matrix.Translation((0.0, 0.40, -0.37))
        @ Matrix.Rotation(math.pi, 4, "Z")
        @ Matrix.Scale(0.0120, 4)
    )
    armature.name = "pass65-first-person-arms-skeleton-LOD0"
    armature["asset_id"] = ASSET_ID
    armature["dedicated_first_person_skeleton"] = True
    armature.parent = root
    armature.matrix_world = transform
    for batch in batches:
        batch.parent = None
        batch.matrix_world = transform
        batch["pass65_asset_root"] = root.name

    for name, location, bone_name, semantic in (
        ("right-hand-grip-socket", (0.05, 0.58, -0.16), "WristR", "rightGrip"),
        ("left-hand-grip-socket", (-0.02, 0.72, -0.07), "WristL", "leftGrip"),
        ("right-wrist-knife-socket", (0.20, 0.54, -0.11), "WristR", "knife"),
        ("left-hand-grenade-socket", (-0.20, 0.54, -0.10), "WristL", "grenade"),
    ):
        bone_socket(name, location, armature, bone_name, semantic)
    return root


def hierarchy(root):
    root_key = root.get("asset_root_key", root.name)
    owned = [obj for obj in bpy.data.objects if obj.get("pass65_asset_root") == root_key]
    return [root, *root.children_recursive, *owned]


def export_glb(root, output_path):
    selected = list(dict.fromkeys(hierarchy(root)))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=False,
        export_optimize_animation_size=True,
        export_tangents=True,
    )


def mesh_triangle_count(objects):
    return sum(
        len(polygon.vertices) - 2
        for obj in objects
        for polygon in obj.data.polygons
    )


def author_lod1(root, armature, batches, lod0_triangles):
    """Create a true reduced delivery after the editable LOD0 blend is saved."""
    for batch in batches:
        armature_modifiers = [
            modifier for modifier in batch.modifiers if modifier.type == "ARMATURE"
        ]
        if len(armature_modifiers) != 1:
            raise RuntimeError(
                f"{batch.name}: expected one armature modifier before LOD1, "
                f"found {len(armature_modifiers)}"
            )
        batch.modifiers.remove(armature_modifiers[0])
        decimate = batch.modifiers.new("Pass66 deterministic LOD1", "DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = 0.70
        decimate.use_collapse_triangulate = True
        bpy.ops.object.select_all(action="DESELECT")
        batch.select_set(True)
        bpy.context.view_layer.objects.active = batch
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        skin = batch.modifiers.new("Pass65 licensed arms skin", "ARMATURE")
        skin.object = armature
        batch["quality_tier"] = "LOD1"
    lod1_triangles = mesh_triangle_count(batches)
    if not 0 < lod1_triangles < lod0_triangles:
        raise RuntimeError(
            f"LOD1 must reduce triangles strictly: lod0={lod0_triangles} lod1={lod1_triangles}"
        )
    blended_vertices, multi_bone_batches, blended_pairs = weighting_receipt(batches)
    root["quality_tier"] = "LOD1"
    root["delivery_triangle_count"] = lod1_triangles
    root["lod_reduction_ratio"] = lod1_triangles / lod0_triangles
    root["blended_vertex_count"] = blended_vertices
    root["multi_bone_weighted_part_count"] = multi_bone_batches
    root["blended_joint_pairs_csv"] = ",".join(blended_pairs)
    export_glb(root, OUTPUT_LOD1_GLB)
    return lod1_triangles


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def bone_head_world(armature, bone_name: str) -> Vector:
    return armature.matrix_world @ armature.pose.bones[bone_name].head


def place_pose_bone_head_world(armature, bone_name: str, target_world: Vector) -> None:
    """Translate a complete pose branch without scaling or hiding geometry."""
    bone = armature.pose.bones[bone_name]
    matrix_world = armature.matrix_world @ bone.matrix
    matrix_world.translation = target_world
    bone.matrix = armature.matrix_world.inverted() @ matrix_world
    bpy.context.view_layer.update()


def orient_pose_bone_toward(armature, bone_name: str, child_name: str, target_world: Vector) -> None:
    bpy.context.view_layer.update()
    bone = armature.pose.bones[bone_name]
    origin = bone_head_world(armature, bone_name)
    current_direction = bone_head_world(armature, child_name) - origin
    desired_direction = target_world - origin
    if current_direction.length_squared < 1e-10 or desired_direction.length_squared < 1e-10:
        raise RuntimeError(f"degenerate pose direction {bone_name}->{child_name}")
    delta = current_direction.normalized().rotation_difference(desired_direction.normalized())
    current_world = armature.matrix_world @ bone.matrix
    target_rotation = delta @ current_world.to_quaternion()
    target_world_matrix = Matrix.LocRotScale(
        current_world.translation,
        target_rotation,
        current_world.to_scale(),
    )
    bone.matrix = armature.matrix_world.inverted() @ target_world_matrix
    bpy.context.view_layer.update()


def orient_pose_bone_world_direction(
    armature, bone_name: str, desired_direction: Vector,
) -> None:
    """Aim a deform bone's authored head-to-tail axis in world space."""
    bpy.context.view_layer.update()
    if desired_direction.length_squared < 1e-10:
        raise RuntimeError(f"degenerate desired direction for {bone_name}")
    bone = armature.pose.bones[bone_name]
    current_world = armature.matrix_world @ bone.matrix
    current_direction = (
        armature.matrix_world @ bone.tail
        - armature.matrix_world @ bone.head
    )
    if current_direction.length_squared < 1e-10:
        raise RuntimeError(f"degenerate current direction for {bone_name}")
    delta = current_direction.normalized().rotation_difference(
        desired_direction.normalized()
    )
    bone.matrix = armature.matrix_world.inverted() @ Matrix.LocRotScale(
        current_world.translation,
        delta @ current_world.to_quaternion(),
        current_world.to_scale(),
    )
    bpy.context.view_layer.update()


def bone_tail_world(armature, bone_name: str) -> Vector:
    return armature.matrix_world @ armature.pose.bones[bone_name].tail


def bounded_digit_target(
    armature, digit: str, side: str, requested_world: Vector,
    maximum_reach_ratio: float = 0.94,
):
    """Keep procedural digit goals inside the real three-bone reach envelope."""
    chain = [f"{digit}{joint}{side}" for joint in (1, 2, 3)]
    base = bone_head_world(armature, chain[0])
    reach = sum(
        (bone_tail_world(armature, name) - bone_head_world(armature, name)).length
        for name in chain
    )
    requested_delta = requested_world - base
    if reach <= 1e-8 or requested_delta.length <= 1e-8:
        raise RuntimeError(f"{digit}{side}: degenerate procedural digit target")
    limit = reach * maximum_reach_ratio
    resolved = (
        requested_world.copy()
        if requested_delta.length <= limit
        else base + requested_delta.normalized() * limit
    )
    return resolved, {
        "chainReachM": reach,
        "requestedReachRatio": requested_delta.length / reach,
        "resolvedReachRatio": (resolved - base).length / reach,
        "clamped": requested_delta.length > limit,
    }


def rotate_pose_bone_world_delta(armature, bone_name: str, delta: Quaternion) -> None:
    bone = armature.pose.bones[bone_name]
    current_world = armature.matrix_world @ bone.matrix
    bone.matrix = armature.matrix_world.inverted() @ Matrix.LocRotScale(
        current_world.translation,
        delta @ current_world.to_quaternion(),
        current_world.to_scale(),
    )
    bpy.context.view_layer.update()


def solve_digit_tip_ccd(
    armature, digit: str, side: str, target_world: Vector,
    iterations: int = 12,
) -> float:
    chain = [f"{digit}{joint}{side}" for joint in (1, 2, 3)]
    for _iteration in range(iterations):
        for bone_name in reversed(chain):
            joint = bone_head_world(armature, bone_name)
            tip_delta = bone_tail_world(armature, chain[-1]) - joint
            target_delta = target_world - joint
            if tip_delta.length_squared < 1e-10 or target_delta.length_squared < 1e-10:
                continue
            rotate_pose_bone_world_delta(
                armature,
                bone_name,
                tip_delta.normalized().rotation_difference(target_delta.normalized()),
            )
        if (bone_tail_world(armature, chain[-1]) - target_world).length <= 0.0015:
            break
    return (bone_tail_world(armature, chain[-1]) - target_world).length


def solve_elbow(shoulder: Vector, elbow: Vector, wrist: Vector, target: Vector, side: str):
    upper_length = (elbow - shoulder).length
    lower_length = (wrist - elbow).length
    target_delta = target - shoulder
    target_distance = target_delta.length
    reach_ratio = target_distance / max(upper_length + lower_length, 1e-8)
    if target_distance >= upper_length + lower_length - 1e-6:
        target_distance = upper_length + lower_length - 1e-6
        target_delta = target_delta.normalized() * target_distance
        target = shoulder + target_delta
    direction = target_delta.normalized()
    along = (
        upper_length * upper_length - lower_length * lower_length + target_distance * target_distance
    ) / (2.0 * target_distance)
    height = math.sqrt(max(0.0, upper_length * upper_length - along * along))
    pole_offset = (
        env_vector("PASS65_LEFT_ELBOW_POLE", (-0.32, -0.08, -0.35))
        if side == "L" else Vector((0.32, -0.08, -0.35))
    )
    pole = shoulder + pole_offset
    pole_projection = shoulder + direction * (pole - shoulder).dot(direction)
    perpendicular = pole - pole_projection
    if perpendicular.length_squared < 1e-8:
        perpendicular = Vector((-0.55 if side == "L" else 0.55, -0.15, -0.34))
        perpendicular -= direction * perpendicular.dot(direction)
    perpendicular.normalize()
    return shoulder + direction * along + perpendicular * height, reach_ratio


def pose_chain_to_target(armature, side: str, target: Vector, forward: Vector):
    shoulder_name = f"UpperArm{side}"
    elbow_name = f"LowerArm{side}"
    wrist_name = f"Wrist{side}"
    finger_name = f"Index1{side}"
    shoulder = bone_head_world(armature, shoulder_name)
    elbow = bone_head_world(armature, elbow_name)
    wrist = bone_head_world(armature, wrist_name)
    elbow_target, reach_ratio = solve_elbow(shoulder, elbow, wrist, target, side)
    orient_pose_bone_toward(armature, shoulder_name, elbow_name, elbow_target)
    orient_pose_bone_toward(armature, elbow_name, wrist_name, target)
    orient_pose_bone_toward(armature, wrist_name, finger_name, target + forward.normalized() * 0.16)
    error = (bone_head_world(armature, wrist_name) - target).length
    return error, reach_ratio


def hand_palm_world(armature, side: str) -> Vector:
    points = [
        bone_head_world(armature, f"{digit}1{side}")
        for digit in ("Index", "Middle", "Ring", "Pinky", "Thumb")
    ]
    digit_base_center = sum(points, Vector()) / len(points)
    wrist = bone_head_world(armature, f"Wrist{side}")
    return wrist + (digit_base_center - wrist) * 1.45


def roll_pose_bone_world(
    armature, bone_name: str, axis_world: Vector, degrees: float,
) -> None:
    if abs(degrees) <= 1e-6:
        return
    if axis_world.length_squared < 1e-10:
        raise RuntimeError(f"degenerate world roll axis for {bone_name}")
    bone = armature.pose.bones[bone_name]
    current_world = armature.matrix_world @ bone.matrix
    rolled_world = Matrix.LocRotScale(
        current_world.translation,
        Quaternion(axis_world.normalized(), math.radians(degrees))
        @ current_world.to_quaternion(),
        current_world.to_scale(),
    )
    bone.matrix = armature.matrix_world.inverted() @ rolled_world
    bpy.context.view_layer.update()


def pose_hand_to_socket(
    armature, side: str, socket_target: Vector, forward: Vector,
    roll_degrees: float = 0.0,
):
    """Solve the anatomical palm anchor to a weapon socket, not the cuff.

    Wrist-at-socket was valid for the rejected blockout rig but drives a real
    human cuff through the receiver.  Iterate the wrist endpoint so the mean
    metacarpal anchor reaches the authored weapon socket while the cuff remains
    behind the grip surface.
    """
    wrist_target = socket_target.copy()
    reach_ratio = 0.0
    for _iteration in range(4):
        _wrist_error, reach_ratio = pose_chain_to_target(
            armature, side, wrist_target, forward,
        )
        roll_pose_bone_world(
            armature, f"Wrist{side}", forward, roll_degrees,
        )
        correction = socket_target - hand_palm_world(armature, side)
        wrist_target += correction
        if correction.length <= 0.00025:
            break
    pose_chain_to_target(armature, side, wrist_target, forward)
    roll_pose_bone_world(
        armature, f"Wrist{side}", forward, roll_degrees,
    )
    socket_error = (hand_palm_world(armature, side) - socket_target).length
    return socket_error, reach_ratio, wrist_target


def pose_grip_fingers(armature, left_style="support", knife=False):
    firing_curls = {
        "Index": (-0.28, -0.46, -0.34),
        "Middle": (-0.42, -0.70, -0.52),
        "Ring": (-0.46, -0.76, -0.56),
        "Pinky": (-0.50, -0.82, -0.60),
        "Thumb": (-0.20, -0.34, -0.24),
    }
    left_profiles = {
        # Long-gun/SMG C-clamp: extended proximal digits remain individually
        # readable along the rail while distal joints curl around its lower
        # edge. This deliberately avoids the rejected closed-fist silhouette.
        "support": {
            "Index": (-0.07, -0.24, -0.20),
            "Middle": (-0.10, -0.30, -0.24),
            "Ring": (-0.13, -0.36, -0.28),
            "Pinky": (-0.16, -0.42, -0.32),
            "Thumb": (0.10, -0.18, -0.12),
        },
        "reload": {
            "Index": (-0.18, -0.38, -0.30),
            "Middle": (-0.24, -0.48, -0.38),
            "Ring": (-0.28, -0.54, -0.42),
            "Pinky": (-0.32, -0.60, -0.46),
            "Thumb": (-0.12, -0.28, -0.20),
        },
        "offhand": {
            "Index": (-0.04, -0.08, -0.05),
            "Middle": (-0.05, -0.10, -0.06),
            "Ring": (-0.06, -0.12, -0.07),
            "Pinky": (-0.08, -0.14, -0.08),
            "Thumb": (-0.02, -0.05, -0.03),
        },
    }
    if left_style not in left_profiles:
        raise RuntimeError(f"unknown left-hand finger style {left_style}")
    for side in ("L", "R"):
        curls = left_profiles[left_style] if side == "L" else firing_curls
        scale = 1.35 if (knife and side == "R") else 1.0
        for digit_index, (digit, values) in enumerate(curls.items()):
            for joint, value in enumerate(values, start=1):
                support_curl_scale = 1.0
                if side == "L" and left_style == "support":
                    support_curl_scale = float(os.environ.get(
                        "PASS65_SUPPORT_THUMB_CURL_SCALE"
                        if digit == "Thumb" else "PASS65_SUPPORT_CURL_SCALE",
                        "1.0",
                    ))
                spread = 0.0
                if side == "L" and left_style == "support" and joint == 1:
                    spread = (-0.025, -0.008, 0.010, 0.030, -0.045)[digit_index]
                set_pose_rotation(
                    armature, f"{digit}{joint}{side}",
                    (value * scale * support_curl_scale, spread, 0.0),
                )
    bpy.context.view_layer.update()


def pose_support_digits_around_handguard(
    armature, weapon_forward: Vector, palm_socket: Vector,
):
    """Pose a legible left-hand C-clamp around a long-gun handguard.

    Generic Euler curls are dependent on the source joint rolls and produced a
    closed fist or straight dangling fingers.  This review pose instead aims
    each real deform phalanx in world space: four fingers descend along the
    left rail and hook under it, while the thumb crosses the top.  No geometry
    is translated independently of its licensed bones.
    """
    forward = weapon_forward.normalized()
    up = Vector((0.0, 0.0, 1.0))
    right = forward.cross(up)
    if right.length_squared < 1e-10:
        raise RuntimeError("support wrap cannot derive handguard lateral axis")
    right.normalize()
    # Preserve visible digit separation along the barrel while making each
    # fingertip hook back toward the handguard underside.
    longitudinal = {
        "Index": 0.14,
        "Middle": 0.05,
        "Ring": -0.04,
        "Pinky": -0.12,
    }
    vertical_fan = {
        "Index": 0.18,
        "Middle": 0.06,
        "Ring": -0.06,
        "Pinky": -0.18,
    }
    for digit, along in longitudinal.items():
        fan = vertical_fan[digit]
        directions = (
            right * 0.36 + up * (-0.91 + fan) + forward * along,
            right * 0.62 + up * (-0.70 + fan * 0.70) + forward * along * 0.65,
            right * 0.78 + up * (0.24 + fan * 0.40) + forward * along * 0.35,
        )
        for joint, direction in enumerate(directions, start=1):
            orient_pose_bone_world_direction(
                armature, f"{digit}{joint}L", direction,
            )
    thumb_directions = (
        right * 0.45 + up * 0.85 + forward * 0.12,
        right * 0.90 + up * 0.25 + forward * 0.08,
        right * 0.97 - up * 0.10 + forward * 0.04,
    )
    for joint, direction in enumerate(thumb_directions, start=1):
        orient_pose_bone_world_direction(
            armature, f"Thumb{joint}L", direction,
        )
    requested_targets = {}
    targets = {}
    reach = {}
    errors = {}
    finger_target_offsets = {
        "Index": (0.045, -0.004, 0.026),
        "Middle": (0.050, -0.010, 0.010),
        "Ring": (0.052, -0.016, -0.008),
        "Pinky": (0.050, -0.022, -0.024),
    }
    for digit, (across, vertical, along) in finger_target_offsets.items():
        requested = palm_socket + right * across + up * vertical + forward * along
        target, reach[digit] = bounded_digit_target(
            armature, digit, "L", requested,
        )
        requested_targets[digit] = tuple(requested)
        targets[digit] = tuple(target)
        errors[digit] = (
            solve_digit_tip_ccd(armature, digit, "L", target)
            if os.environ.get("PASS65_SUPPORT_DIGIT_CCD", "1") == "1"
            else (bone_tail_world(armature, f"{digit}3L") - target).length
        )
    requested_thumb = palm_socket + right * 0.025 + up * 0.042 + forward * 0.012
    thumb_target, reach["Thumb"] = bounded_digit_target(
        armature, "Thumb", "L", requested_thumb,
    )
    requested_targets["Thumb"] = tuple(requested_thumb)
    targets["Thumb"] = tuple(thumb_target)
    errors["Thumb"] = (
        solve_digit_tip_ccd(armature, "Thumb", "L", thumb_target)
        if os.environ.get("PASS65_SUPPORT_DIGIT_CCD", "1") == "1"
        else (bone_tail_world(armature, "Thumb3L") - thumb_target).length
    )
    return {
        "contract": "bounded-evaluated-phalanx-ccd-handguard-wrap-v2",
        "requestedTargets": requested_targets,
        "targets": targets,
        "reach": reach,
        "tipErrorsM": errors,
        "maximumTipErrorM": max(errors.values()),
        "passed": (
            max(errors.values()) <= 0.012
            and max(item["resolvedReachRatio"] for item in reach.values()) <= 0.94 + 1e-6
        ),
    }


def pose_reload_digits_around_magazine(armature, reload_state):
    """Wrap the real left-hand digits around the detached STANAG body."""
    minimum = Vector(reload_state["detachedBounds"]["minimum"])
    maximum = Vector(reload_state["detachedBounds"]["maximum"])
    center = Vector(reload_state["detachedBounds"]["center"])
    front_y = minimum.y - 0.004
    requested = {
        "Index": Vector((center.x - 0.012, front_y, maximum.z - 0.026)),
        "Middle": Vector((center.x - 0.012, front_y, center.z + 0.016)),
        "Ring": Vector((center.x - 0.012, front_y, center.z - 0.016)),
        "Pinky": Vector((center.x - 0.012, front_y, minimum.z + 0.026)),
        # Seat the thumb over the magazine's upper shoulder.  The earlier
        # target stopped 2 mm short of the opposed-contact threshold and left
        # the thumb reading as another finger beneath the box.
        "Thumb": Vector((minimum.x + 0.006, minimum.y - 0.002, maximum.z - 0.012)),
    }
    targets = {}
    reach = {}
    errors = {}
    for digit, requested_target in requested.items():
        target, reach[digit] = bounded_digit_target(
            armature, digit, "L", requested_target,
        )
        targets[digit] = tuple(target)
        errors[digit] = solve_digit_tip_ccd(
            armature, digit, "L", target, iterations=16,
        )
    evaluated_tips = {
        digit: tuple(bone_tail_world(armature, f"{digit}3L"))
        for digit in requested
    }
    finger_z = [evaluated_tips[digit][2] for digit in ("Index", "Middle", "Ring", "Pinky")]
    ordered_finger_cues = all(
        finger_z[index] > finger_z[index + 1] + 0.006
        for index in range(len(finger_z) - 1)
    )
    thumb_opposed = evaluated_tips["Thumb"][2] >= max(finger_z) + 0.010
    return {
        "contract": "detached-stanag-four-finger-front-wrap-v1",
        "requestedTargets": {key: tuple(value) for key, value in requested.items()},
        "targets": targets,
        "reach": reach,
        "tipErrorsM": errors,
        "evaluatedTips": evaluated_tips,
        "orderedFingerCues": ordered_finger_cues,
        "thumbOpposed": thumb_opposed,
        "maximumTipErrorM": max(errors.values()),
        "passed": (
            max(errors.values()) <= 0.012
            and ordered_finger_cues
            and thumb_opposed
        ),
    }


def mesh_world_bounds(objects):
    points = [
        obj.matrix_world @ vertex.co
        for obj in objects if obj.type == "MESH"
        for vertex in obj.data.vertices
    ]
    if not points:
        raise RuntimeError("cannot derive bounds from an empty mesh set")
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return {
        "minimum": minimum,
        "maximum": maximum,
        "center": (minimum + maximum) * 0.5,
        "extent": maximum - minimum,
    }


def import_review_weapon(weapon_id: str, scale: float, right_target: Vector):
    source = REVIEW_WEAPON_DIR / f"{weapon_id}-uncompressed.glb"
    if not source.exists():
        raise RuntimeError(f"missing decoded review weapon {source}")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    group = bpy.data.objects.new(f"Pass65_{weapon_id}_ContactReview", None)
    bpy.context.collection.objects.link(group)
    imported_set = set(imported)
    for obj in imported:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
        if obj.parent not in imported_set:
            world = obj.matrix_world.copy()
            obj.parent = group
            obj.matrix_world = world
    group.scale = (scale, scale, scale)
    if weapon_id != "knife":
        group.rotation_euler = (math.radians(-2.0), 0.0, math.radians(-4.0))
    bpy.context.view_layer.update()

    def node(name):
        return next(
            (
                obj for obj in imported
                if obj.name == name or obj.name.startswith(f"{name}.")
                or obj.get("canonical_node_name") == name
            ),
            None,
        )

    right = node("grip-socket-r")
    if right is None:
        raise RuntimeError(f"{weapon_id}: grip-socket-r missing")
    group.location += right_target - right.matrix_world.translation
    bpy.context.view_layer.update()
    left = node("support-socket-l")
    support_calibration = None
    support_offsets = {
        "pistol": Vector((-0.160, 0.110, 0.090)),
        "mp5": Vector((-0.050, 0.180, 0.100)),
        "m4a1": env_vector("PASS65_M4_SUPPORT_OFFSET", (-0.070, 0.170, 0.085)),
    }
    if left is not None and weapon_id in support_offsets:
        original = left.matrix_world.translation.copy()
        # Put the anatomical palm on the left face of the handguard.  The
        # earlier centreline socket made the glove look plausible from one
        # camera while driving the cuff through the receiver.  This lateral
        # offset leaves the fingers free to wrap the rail without admitting
        # sleeve or wrist geometry into the weapon volume.
        calibrated = right_target + support_offsets[weapon_id]
        left.matrix_world.translation = calibrated
        bpy.context.view_layer.update()
        support_calibration = {
            "originalWorld": tuple(original),
            "calibratedWorld": tuple(calibrated),
            "contract": "left-side-camera-space-support-v1",
        }
    reload_node = node("reload-socket-l")
    reload_calibration = None
    magazine_bounds = None
    magazine_meshes = []
    magazine_root = node("weapon-magazine")
    magazine_socket = node("magazine-socket")
    if weapon_id == "m4a1" and reload_node is not None:
        original = reload_node.matrix_world.translation.copy()
        magazine_meshes = [
            obj for obj in imported
            if obj.type == "MESH" and "Runtime_magazine_" in obj.name
        ]
        if len(magazine_meshes) != 2:
            raise RuntimeError(
                f"m4a1: expected two evaluated magazine batches, found "
                f"{[obj.name for obj in magazine_meshes]}"
            )
        if os.environ.get("PASS65_DEBUG_MAGAZINE_MATERIAL") == "1":
            debug_material = bpy.data.materials.new("DEBUG_M4_MAGAZINE_RED")
            debug_material.diffuse_color = (1.0, 0.0, 0.0, 1.0)
            debug_material.use_nodes = True
            debug_bsdf = debug_material.node_tree.nodes.get("Principled BSDF")
            input_socket(debug_bsdf, "Base Color").default_value = (1.0, 0.0, 0.0, 1.0)
            for magazine_mesh in magazine_meshes:
                magazine_mesh.data.materials.clear()
                magazine_mesh.data.materials.append(debug_material)
        magazine_bounds = mesh_world_bounds(magazine_meshes)
        # Grip the camera-left face of the evaluated STANAG body.  The source
        # socket is authored for its presentation camera and resolves behind
        # the receiver after this FPS root conversion; the earlier replacement
        # sat too far outboard and produced a floating fist.
        default_reload_target = Vector((
            magazine_bounds["minimum"].x - 0.025,
            magazine_bounds["center"].y,
            magazine_bounds["minimum"].z + magazine_bounds["extent"].z * 0.46,
        ))
        calibrated = default_reload_target + env_vector(
            "PASS65_M4_RELOAD_TRIM", (0.0, 0.0, 0.0),
        )
        reload_node.matrix_world.translation = calibrated
        bpy.context.view_layer.update()
        reload_calibration = {
            "originalWorld": tuple(original),
            "calibratedWorld": tuple(calibrated),
            "evaluatedMagazineBounds": {
                key: tuple(value) for key, value in magazine_bounds.items()
            },
            "contract": "evaluated-stanag-camera-left-grip-v3",
        }
    rear_node = node("rear-sight-socket")
    front_node = node("front-sight-socket")
    sight_calibration = None
    if weapon_id == "m4a1" and rear_node is not None and front_node is not None:
        gunmetal = next(
            (
                obj for obj in imported
                if obj.type == "MESH"
                and "Runtime_static_MAT_Pass65_m4a1_Gunmetal" in obj.name
            ),
            None,
        )
        if gunmetal is None:
            raise RuntimeError("m4a1: static gunmetal batch unavailable for sight-axis audit")
        components = mesh_component_records(gunmetal)
        rear_candidates = [
            item for item in components
            if 180 <= item["vertices"] <= 280
            and 0.018 <= item["extent"][0] <= 0.040
            and item["extent"][1] <= 0.012
            and 0.018 <= item["extent"][2] <= 0.040
        ]
        if len(rear_candidates) != 1:
            raise RuntimeError(f"m4a1: rear aperture component ambiguous {rear_candidates}")
        rear_center = Vector(rear_candidates[0]["center"])
        front_candidates = [
            item for item in components
            if 120 <= item["vertices"] <= 220
            and item["extent"][0] <= 0.010
            and item["extent"][1] <= 0.010
            and 0.020 <= item["extent"][2] <= 0.040
            and item["center"][1] >= rear_center.y + 0.20
        ]
        if not front_candidates:
            raise RuntimeError("m4a1: front post component unavailable")
        front_component = max(front_candidates, key=lambda item: item["center"][1])
        front_center = Vector(front_component["center"])
        original_rear = rear_node.matrix_world.translation.copy()
        original_front = front_node.matrix_world.translation.copy()
        rear_node.matrix_world.translation = rear_center
        front_node.matrix_world.translation = front_center
        bpy.context.view_layer.update()
        sight_calibration = {
            "originalRearWorld": tuple(original_rear),
            "originalFrontWorld": tuple(original_front),
            "calibratedRearWorld": tuple(rear_center),
            "calibratedFrontWorld": tuple(front_center),
            "rearSocketGeometryErrorM": (original_rear - rear_center).length,
            "frontSocketGeometryErrorM": (original_front - front_center).length,
            "contract": "evaluated-aperture-and-post-centres-v1",
        }
    for obj in [group, *imported]:
        obj.hide_render = True
        obj.hide_viewport = True
    return {
        "id": weapon_id,
        "group": group,
        "imported": imported,
        "right": right,
        "left": left,
        "reload": reload_node,
        "muzzle": node("muzzle-socket") or node("blade-tip-socket"),
        "rear": rear_node,
        "front": front_node,
        "supportCalibration": support_calibration,
        "reloadCalibration": reload_calibration,
        "magazineBounds": magazine_bounds,
        "magazineMeshes": magazine_meshes,
        "magazineRoot": magazine_root,
        "magazineSocket": magazine_socket,
        "sightCalibration": sight_calibration,
    }


def show_only_weapon(weapons, selected):
    for review in weapons.values():
        visible = review is selected
        for obj in [review["group"], *review["imported"]]:
            obj.hide_render = not visible
            obj.hide_viewport = not visible


def mesh_component_records(obj):
    if obj.type != "MESH":
        return []
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        left, right = edge.vertices
        adjacency[left].add(right)
        adjacency[right].add(left)
    unseen = set(range(len(adjacency)))
    components = []
    while unseen:
        seed = unseen.pop()
        indices = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    indices.add(neighbor)
                    stack.append(neighbor)
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
        minimum = tuple(min(point[axis] for point in points) for axis in range(3))
        maximum = tuple(max(point[axis] for point in points) for axis in range(3))
        center = tuple((minimum[axis] + maximum[axis]) * 0.5 for axis in range(3))
        extent = tuple(maximum[axis] - minimum[axis] for axis in range(3))
        components.append({
            "vertices": len(indices), "min": minimum, "max": maximum,
            "center": center, "extent": extent,
        })
    return components


def debug_mesh_components(review) -> None:
    if os.environ.get("PASS65_ARMS_DEBUG_COMPONENTS") != "1":
        return
    for obj in review["imported"]:
        if obj.type != "MESH":
            continue
        components = mesh_component_records(obj)
        print("PASS65_WEAPON_COMPONENTS", review["id"], obj.name, json.dumps(components))


def prepare_detached_reload_magazine(review):
    root = review.get("magazineRoot")
    meshes = review.get("magazineMeshes") or []
    socket = review.get("magazineSocket")
    reload_node = review.get("reload")
    if root is None or len(meshes) != 2 or socket is None or reload_node is None:
        raise RuntimeError("m4a1 reload requires magazine root, two batches, socket, and hand target")
    inserted_bounds = mesh_world_bounds(meshes)
    world = root.matrix_world.copy()
    offset = env_vector("PASS65_RELOAD_MAGAZINE_OFFSET", (-0.125, -0.035, -0.065))
    world.translation += offset
    root.matrix_world = world
    bpy.context.view_layer.update()
    detached_bounds = mesh_world_bounds(meshes)
    palm_target = Vector((
        # Put the metacarpal anchor beside the magazine centreline instead of
        # outside its minimum X face.  This seats the box between the opposed
        # thumb and four articulated fingers rather than producing a floating
        # fingertip pinch.
        detached_bounds["center"].x - 0.010,
        detached_bounds["center"].y,
        detached_bounds["center"].z,
    )) + env_vector("PASS65_RELOAD_PALM_TRIM", (0.0, 0.0, 0.0))
    reload_node.matrix_world.translation = palm_target
    bpy.context.view_layer.update()
    insertion_axis = socket.matrix_world.translation - detached_bounds["center"]
    if insertion_axis.length < 0.08:
        raise RuntimeError(
            f"reload magazine separation too small: {insertion_axis.length:.4f}m"
        )
    state = {
        "contract": "detached-stanag-visible-approach-v1",
        "offsetWorld": tuple(offset),
        "insertedBounds": {
            key: tuple(value) for key, value in inserted_bounds.items()
        },
        "detachedBounds": {
            key: tuple(value) for key, value in detached_bounds.items()
        },
        "palmTarget": tuple(palm_target),
        "magazineSocket": tuple(socket.matrix_world.translation),
        "insertionAxis": tuple(insertion_axis),
        "insertionSeparationM": insertion_axis.length,
    }
    review["reloadCalibration"] = state
    return state


def pose_for_weapon(armature, review, left_socket="left"):
    reset_pose(armature)
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    reload_magazine = (
        prepare_detached_reload_magazine(review)
        if left_socket == "reload" else None
    )
    if left_socket == "reload":
        place_pose_bone_head_world(
            armature, "UpperArmL", Vector((-0.34, 0.34, -0.56)),
        )
    elif left_socket == "left" and review["id"] in {"mp5", "m4a1"}:
        place_pose_bone_head_world(
            armature, "UpperArmL",
            env_vector("PASS65_SUPPORT_SHOULDER", (-0.28, 0.40, -0.48)),
        )
    right_target = review["right"].matrix_world.translation.copy()
    left_node = review[left_socket]
    if left_node is None:
        raise RuntimeError(f"{review['id']}: {left_socket} socket missing")
    left_target = left_node.matrix_world.translation.copy()
    forward = (
        review["muzzle"].matrix_world.translation - right_target
        if review["muzzle"] is not None else Vector((0, 1, 0))
    )
    right_error, right_reach, right_wrist_target = pose_hand_to_socket(
        armature, "R", right_target, forward,
    )
    support_mode = "two-hand-support"
    if review["id"] == "pistol" and left_socket == "left":
        support_mode = "one-hand-pistol-offhand-below-frustum"
        left_target = Vector((-0.32, 0.40, -0.58))
        left_error, left_reach = pose_chain_to_target(
            armature, "L", left_target, Vector((0, 1, 0)),
        )
        left_wrist_target = left_target.copy()
        left_style = "offhand"
    else:
        left_forward = (
            env_vector("PASS65_RELOAD_FORWARD", (0.90, 0.05, -0.25))
            if left_socket == "reload"
            else env_vector("PASS65_SUPPORT_FORWARD", (0.85, 0.45, -0.20))
        )
        support_roll_degrees = (
            float(os.environ.get("PASS65_SUPPORT_ROLL_DEGREES", "-4"))
            if left_socket == "left"
            else float(os.environ.get("PASS65_RELOAD_ROLL_DEGREES", "-20"))
        )
        left_error, left_reach, left_wrist_target = pose_hand_to_socket(
            armature, "L", left_target, left_forward,
            roll_degrees=support_roll_degrees,
        )
        left_style = "reload" if left_socket == "reload" else "support"
    pose_grip_fingers(armature, left_style=left_style)
    support_digit_wrap = None
    reload_digit_wrap = None
    if (
        left_style == "support"
        and os.environ.get("PASS65_PROCEDURAL_SUPPORT_WRAP", "1") == "1"
    ):
        support_digit_wrap = pose_support_digits_around_handguard(
            armature, forward, left_target,
        )
    if left_style == "reload":
        reload_digit_wrap = pose_reload_digits_around_magazine(
            armature, reload_magazine,
        )
    chains = {
        side: {
            "shoulder": tuple(bone_head_world(armature, f"UpperArm{side}")),
            "elbow": tuple(bone_head_world(armature, f"LowerArm{side}")),
            "wrist": tuple(bone_head_world(armature, f"Wrist{side}")),
            "palm": tuple(hand_palm_world(armature, side)),
        }
        for side in ("L", "R")
    }
    return {
        "rightSocketErrorM": right_error,
        "leftSocketErrorM": left_error,
        "rightReachRatio": right_reach,
        "leftReachRatio": left_reach,
        "rightSolvedWristTarget": tuple(right_wrist_target),
        "leftSolvedWristTarget": tuple(left_wrist_target),
        "socketAnchor": "mean-digit-base-palm",
        "supportMode": support_mode,
        "supportWristRollDegrees": (
            float(os.environ.get("PASS65_SUPPORT_ROLL_DEGREES", "-4"))
            if support_mode == "two-hand-support" else 0.0
        ),
        "supportDigitWrap": support_digit_wrap,
        "reloadDigitWrap": reload_digit_wrap,
        "reloadMagazine": reload_magazine,
        "weaponReloadCalibration": review["reloadCalibration"],
        "chainWorld": chains,
    }


def arm_self_intersection_metrics(armature, batches):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = {"L": [], "R": []}
    regions = {"L": [], "R": []}
    for batch in batches:
        region = (
            "glove" if "Glove" in batch.name else
            "skin" if "Skin" in batch.name else
            "wrist-accent" if "WristAccent" in batch.name else
            "sleeve"
        )
        evaluated = batch.evaluated_get(depsgraph)
        evaluated_mesh = evaluated.to_mesh()
        group_names = {group.index: group.name for group in batch.vertex_groups}
        try:
            for polygon in batch.data.polygons:
                scores = {"L": 0.0, "R": 0.0}
                for vertex_index in polygon.vertices:
                    for membership in batch.data.vertices[vertex_index].groups:
                        name = group_names.get(membership.group, "")
                        if name.endswith("L"):
                            scores["L"] += membership.weight
                        elif name.endswith("R"):
                            scores["R"] += membership.weight
                side = "L" if scores["L"] >= scores["R"] else "R"
                vertices = [
                    evaluated.matrix_world @ evaluated_mesh.vertices[index].co
                    for index in polygon.vertices
                ]
                for offset in range(1, len(vertices) - 1):
                    triangles[side].append((vertices[0], vertices[offset], vertices[offset + 1]))
                    regions[side].append(region)
        finally:
            evaluated.to_mesh_clear()

    trees = {}
    for side in ("L", "R"):
        vertices = []
        polygons = []
        for triangle in triangles[side]:
            base = len(vertices)
            vertices.extend(triangle)
            polygons.append((base, base + 1, base + 2))
        trees[side] = BVHTree.FromPolygons(vertices, polygons, all_triangles=True)
    overlaps = trees["L"].overlap(trees["R"]) if trees["L"] and trees["R"] else []
    overlap_count = len(overlaps)
    overlap_regions = {}
    for left_index, right_index in overlaps:
        key = f"{regions['L'][left_index]}:{regions['R'][right_index]}"
        overlap_regions[key] = overlap_regions.get(key, 0) + 1

    minimum_digit_separation = math.inf
    digits = ("Index", "Middle", "Ring", "Pinky", "Thumb")
    for side in ("L", "R"):
        for left_index, left_digit in enumerate(digits):
            for right_digit in digits[left_index + 1:]:
                for joint in (2, 3):
                    left = bone_head_world(armature, f"{left_digit}{joint}{side}")
                    right = bone_head_world(armature, f"{right_digit}{joint}{side}")
                    minimum_digit_separation = min(minimum_digit_separation, (left - right).length)
    return {
        "crossArmTriangleOverlapCount": overlap_count,
        "crossArmPairsByRegion": overlap_regions,
        "minimumNonAdjacentDigitJointSeparationM": minimum_digit_separation,
        "passed": overlap_count == 0 and minimum_digit_separation >= 0.004,
    }


def evaluated_object_triangles(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    triangles = []
    try:
        mesh.calc_loop_triangles()
        for triangle in mesh.loop_triangles:
            triangles.append(tuple(
                evaluated.matrix_world @ mesh.vertices[index].co
                for index in triangle.vertices
            ))
    finally:
        evaluated.to_mesh_clear()
    return triangles


def evaluated_batch_triangles(batch):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = batch.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    records = []
    group_names = {group.index: group.name for group in batch.vertex_groups}
    try:
        mesh.calc_loop_triangles()
        for triangle in mesh.loop_triangles:
            polygon = batch.data.polygons[triangle.polygon_index]
            scores = {"L": 0.0, "R": 0.0}
            for vertex_index in polygon.vertices:
                for membership in batch.data.vertices[vertex_index].groups:
                    name = group_names.get(membership.group, "")
                    if name.endswith("L"):
                        scores["L"] += membership.weight
                    elif name.endswith("R"):
                        scores["R"] += membership.weight
            side = "L" if scores["L"] >= scores["R"] else "R"
            records.append((
                tuple(
                    evaluated.matrix_world @ mesh.vertices[index].co
                    for index in triangle.vertices
                ),
                side,
            ))
    finally:
        evaluated.to_mesh_clear()
    return records


def triangle_tree(triangles):
    if not triangles:
        return None
    vertices = []
    polygons = []
    for triangle in triangles:
        base = len(vertices)
        vertices.extend(triangle)
        polygons.append((base, base + 1, base + 2))
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=True)


def arm_weapon_collision_metrics(armature, batches, review):
    weapon_triangles = []
    for obj in review["imported"]:
        if obj.type == "MESH" and not obj.hide_render:
            weapon_triangles.extend(evaluated_object_triangles(obj))
    weapon_tree = triangle_tree(weapon_triangles)
    if weapon_tree is None:
        raise RuntimeError(f"{review['id']}: active weapon has no evaluated triangles")

    hand_joints = [
        (f"{name}{side}", bone_head_world(armature, f"{name}{side}"))
        for side in ("L", "R")
        for name in (
            "Wrist", "Index1", "Index2", "Index3", "Middle1", "Middle2", "Middle3",
            "Ring1", "Ring2", "Ring3", "Pinky1", "Pinky2", "Pinky3",
            "Thumb1", "Thumb2", "Thumb3",
        )
    ]
    region_counts = {}
    intentional = 0
    forbidden = 0
    forbidden_centroids = []
    forbidden_samples = []
    for batch in batches:
        arm_records = evaluated_batch_triangles(batch)
        arm_triangles = [record[0] for record in arm_records]
        arm_tree = triangle_tree(arm_triangles)
        overlaps = arm_tree.overlap(weapon_tree) if arm_tree else []
        region = (
            "glove" if "Glove" in batch.name else
            "skin" if "Skin" in batch.name else
            "wrist-accent" if "WristAccent" in batch.name else
            "sleeve"
        )
        for arm_index, _weapon_index in overlaps:
            side = arm_records[arm_index][1]
            key = f"{region}:{side}"
            region_counts[key] = region_counts.get(key, 0) + 1
        for arm_index, _weapon_index in overlaps:
            triangle = arm_triangles[arm_index]
            centroid = sum(triangle, Vector()) / 3.0
            nearest_joint_name, nearest_joint = min(
                hand_joints,
                key=lambda item: (centroid - item[1]).length,
            )
            nearest_joint_distance = (centroid - nearest_joint).length
            # The four render batches are disjoint source-face partitions.
            # Glove and skin therefore contain only hand/finger surfaces;
            # sleeves and the independently separated wrist band contain no
            # hand faces.  Region identity is a stricter anatomical classifier
            # than the old 55 mm joint sphere, which incorrectly rejected the
            # proximal palm even though it was licensed glove geometry.
            if region in {"glove", "skin"}:
                intentional += 1
            else:
                forbidden += 1
                forbidden_centroids.append(centroid)
                if len(forbidden_samples) < 24:
                    forbidden_samples.append({
                        "region": region,
                        "side": side,
                        "centroid": tuple(centroid),
                        "nearestJoint": nearest_joint_name,
                        "nearestJointDistanceM": nearest_joint_distance,
                    })
    total = sum(region_counts.values())
    forbidden_bounds = None
    if forbidden_centroids:
        forbidden_bounds = {
            "min": tuple(min(point[axis] for point in forbidden_centroids) for axis in range(3)),
            "max": tuple(max(point[axis] for point in forbidden_centroids) for axis in range(3)),
            "mean": tuple(
                sum(point[axis] for point in forbidden_centroids) / len(forbidden_centroids)
                for axis in range(3)
            ),
        }
    return {
        "totalTrianglePairCount": total,
        "intentionalHandContactPairCount": intentional,
        "forbiddenPenetrationPairCount": forbidden,
        "pairsByRenderRegion": region_counts,
        "forbiddenCentroidBounds": forbidden_bounds,
        "forbiddenSamples": forbidden_samples,
        "allowedContactRegions": ["glove", "skin"],
        "prohibitedContactRegions": ["sleeve", "wrist-accent"],
        "passed": forbidden == 0,
    }


def weapon_screen_occupancy(scene, camera, review):
    projected = []
    for obj in review["imported"]:
        if obj.type != "MESH" or obj.hide_render:
            continue
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                coordinate = world_to_camera_view(
                    scene, camera, evaluated.matrix_world @ vertex.co,
                )
                if coordinate.z > 0:
                    projected.append((coordinate.x, coordinate.y))
        finally:
            evaluated.to_mesh_clear()
    if not projected:
        raise RuntimeError(f"{review['id']}: no weapon vertices project in front of camera")
    min_x = min(item[0] for item in projected)
    max_x = max(item[0] for item in projected)
    min_y = min(item[1] for item in projected)
    max_y = max(item[1] for item in projected)
    clipped_min_x, clipped_max_x = max(0.0, min_x), min(1.0, max_x)
    clipped_min_y, clipped_max_y = max(0.0, min_y), min(1.0, max_y)
    width = max(0.0, clipped_max_x - clipped_min_x)
    height = max(0.0, clipped_max_y - clipped_min_y)
    in_frame = sum(1 for x, y in projected if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0)
    result = {
        "unclippedBounds": {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y},
        "visibleWidthFraction": width,
        "visibleHeightFraction": height,
        "visibleBoundingAreaFraction": width * height,
        "projectedVertexFractionInFrame": in_frame / len(projected),
        "visibleCenterX": (clipped_min_x + clipped_max_x) * 0.5,
        "visibleCenterY": (clipped_min_y + clipped_max_y) * 0.5,
    }
    result["passed"] = (
        0.08 <= width <= 0.72
        and 0.25 <= height <= 0.92
        and 0.035 <= result["visibleBoundingAreaFraction"] <= 0.55
        and result["projectedVertexFractionInFrame"] >= 0.18
        and min_x >= -0.35 and max_x <= 1.35
        and min_y >= -0.40 and max_y <= 1.25
        and result["projectedVertexFractionInFrame"] >= 0.70
    )
    return result


def compose_contact_sheet(rendered, output_name):
    images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    columns = min(3, len(images))
    rows = math.ceil(len(images) / columns)
    sheet = bpy.data.images.new(
        "Pass65_DJMaesen_Arms_WeaponContactSheet",
        REVIEW_WIDTH * columns,
        REVIEW_HEIGHT * rows,
        alpha=True,
    )
    pixels = array("f", [0.0]) * (REVIEW_WIDTH * columns * REVIEW_HEIGHT * rows * 4)
    for index, image in enumerate(images):
        source = read_pixels(image)
        tile_x = (index % columns) * REVIEW_WIDTH
        tile_y = (rows - 1 - index // columns) * REVIEW_HEIGHT
        for row in range(REVIEW_HEIGHT):
            source_start = row * REVIEW_WIDTH * 4
            target_start = ((tile_y + row) * REVIEW_WIDTH * columns + tile_x) * 4
            pixels[target_start:target_start + REVIEW_WIDTH * 4] = source[source_start:source_start + REVIEW_WIDTH * 4]
    sheet.pixels.foreach_set(pixels)
    sheet.update()
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / output_name)
    sheet.save()


def set_vertical_fov(camera, scene, degrees: float) -> None:
    """Match Three.js' vertical-FOV convention at the review aspect ratio."""
    aspect = scene.render.resolution_x / scene.render.resolution_y
    effective_sensor_height = camera.data.sensor_width / aspect
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.lens = effective_sensor_height / (
        2.0 * math.tan(math.radians(degrees) * 0.5)
    )


def render_contact_sheet(root, armature, batches):
    stage_material = bpy.data.materials.new("MAT_Pass65_Arms_ReviewStage")
    stage_material.diffuse_color = (0.008, 0.013, 0.020, 1)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0.75, -0.41))
    stage = bpy.context.object
    stage.name = "DJMaesen_Prototype_Review_Stage"
    stage.data.materials.append(stage_material)
    bpy.ops.mesh.primitive_plane_add(
        size=8,
        location=(0, 3.0, 1.35),
        rotation=(math.pi / 2, 0, 0),
    )
    backdrop = bpy.context.object
    backdrop.name = "DJMaesen_Prototype_Review_Backdrop"
    backdrop.data.materials.append(stage_material)
    for name, location, energy, color, size in (
        ("Arms_Key", (-2.4, -1.8, 3.0), 430, (0.52, 0.76, 1.0), 2.0),
        ("Arms_Rim", (2.2, 1.2, 2.2), 310, (0.12, 0.82, 0.92), 1.5),
        ("Arms_Fill", (0.0, 3.0, 1.0), 220, (0.36, 0.54, 0.70), 2.4),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0.35, -0.08))

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass65_DJMaesen_WeaponContact_Camera"
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_WIDTH
    scene.render.resolution_y = REVIEW_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.002, 0.004, 0.008)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.0
    scene.render.film_transparent = False

    camera.data.sensor_fit = "HORIZONTAL"

    right_target = Vector((0.0, 0.58, -0.18))
    weapons = {
        "pistol": import_review_weapon("pistol", 0.54, right_target),
        "mp5": import_review_weapon("mp5", 0.40, right_target),
        "m4a1": import_review_weapon("m4a1", 0.42, right_target),
        "knife": import_review_weapon("knife", 0.45, right_target),
    }
    for review in weapons.values():
        debug_mesh_components(review)
    views = (
        ("pistol-hip", "pistol", "left", (-0.08, 0.28, 0.14), (0.00, 0.92, -0.32), 58),
        ("mp5-hip", "mp5", "left", (-0.10, 0.20, 0.16), (0.00, 1.02, -0.42), 54),
        ("m4a1-hip", "m4a1", "left", (-0.12, 0.24, 0.18), (0.00, 1.10, -0.52), 53),
        (
            "m4a1-grip-oblique", "m4a1", "left",
            # This is a contact-inspection angle, not a macro crop.  A 65-degree
            # vertical FOV keeps the thicker, corrected sleeve and complete
            # support hand inside the immutable occupancy bounds.
            (-0.30, 0.80, -0.18), (0.00, 0.77, -0.12), 65,
        ),
        ("m4a1-ads", "m4a1", "left", None, None, 46),
        ("m4a1-reload", "m4a1", "reload", (-0.10, 0.20, 0.14), (-0.02, 0.78, -0.30), 59),
        ("knife-contact", "knife", "knife", (0.02, 0.22, 0.10), (0.08, 0.62, -0.16), 60),
    )
    single_view = os.environ.get("PASS65_ARMS_REVIEW_SINGLE")
    if single_view:
        views = tuple(view for view in views if view[0] == single_view)
        if not views:
            raise RuntimeError(f"unknown PASS65_ARMS_REVIEW_SINGLE={single_view}")
    rendered = []
    evidence = []
    for label, weapon_id, left_socket, location, target, vertical_fov in views:
        review = weapons[weapon_id]
        show_only_weapon(weapons, review)
        if left_socket == "knife":
            reset_pose(armature)
            for track in armature.animation_data.nla_tracks:
                track.mute = True
            melee_target = Vector((0.09, 0.59, -0.14))
            error, reach, right_wrist_target = pose_hand_to_socket(
                armature, "R", melee_target, Vector((0.08, 1.0, -0.10)),
            )
            # Keep the complete support chain below the lower-left frustum for
            # the one-handed stab. It is still posed and skinned, never scaled
            # away or hidden.
            left_error, left_reach = pose_chain_to_target(
                armature, "L", Vector((-0.30, 0.36, -0.58)), Vector((0, 1, 0)),
            )
            pose_grip_fingers(armature, left_style="offhand", knife=True)
            exported_socket = next(
                obj for obj in armature.children if obj.name.startswith("right-wrist-knife-socket")
            )
            grip = review["right"]
            review["group"].location += melee_target - grip.matrix_world.translation
            bpy.context.view_layer.update()
            metrics = {
                "rightSocketErrorM": error,
                "leftSocketErrorM": left_error,
                "rightReachRatio": reach,
                "leftReachRatio": left_reach,
                "rightSolvedWristTarget": tuple(right_wrist_target),
                "knifeGripSocketErrorM": (
                    melee_target - grip.matrix_world.translation
                ).length,
                "knifeAttachmentContract": "anatomical-palm-to-grip-v1",
                "exportedKnifeSocketWorld": tuple(exported_socket.matrix_world.translation),
            }
        else:
            metrics = pose_for_weapon(armature, review, left_socket=left_socket)
        intersections = arm_self_intersection_metrics(armature, batches)
        weapon_collisions = arm_weapon_collision_metrics(armature, batches, review)
        metrics["selfIntersection"] = intersections
        metrics["weaponCollision"] = weapon_collisions
        left_hand_contacts = sum(
            count for key, count in weapon_collisions["pairsByRenderRegion"].items()
            if key in {"glove:L", "skin:L"}
        )
        right_hand_contacts = sum(
            count for key, count in weapon_collisions["pairsByRenderRegion"].items()
            if key in {"glove:R", "skin:R"}
        )
        metrics["leftHandWeaponContactPairs"] = left_hand_contacts
        metrics["rightHandWeaponContactPairs"] = right_hand_contacts
        metrics["leftHandContactRequired"] = (
            (left_socket == "left" and weapon_id in {"mp5", "m4a1"})
            or (left_socket == "reload" and weapon_id == "m4a1")
        )
        metrics["passed"] = (
            metrics["rightSocketErrorM"] <= 0.02
            and (metrics["leftSocketErrorM"] is None or metrics["leftSocketErrorM"] <= 0.02)
            and metrics.get("knifeGripSocketErrorM", 0.0) <= 0.001
            and intersections["passed"]
            and weapon_collisions["passed"]
            and (not metrics["leftHandContactRequired"] or left_hand_contacts >= 12)
            and (
                metrics.get("supportDigitWrap") is None
                or metrics["supportDigitWrap"]["passed"]
            )
            and (
                metrics.get("reloadDigitWrap") is None
                or metrics["reloadDigitWrap"]["passed"]
            )
        )

        if label == "m4a1-ads":
            rear = review["rear"].matrix_world.translation
            front = review["front"].matrix_world.translation
            direction = (front - rear).normalized()
            camera.location = rear - direction * 0.50 + Vector((0, 0, 0.008))
            target = front + direction * 0.35
            metrics["adsSight"] = {
                "rear": tuple(rear),
                "front": tuple(front),
                "direction": tuple(direction),
                "camera": tuple(camera.location),
            }
        else:
            camera.location = location
        set_vertical_fov(camera, scene, vertical_fov)
        look_at(camera, target)
        bpy.context.view_layer.update()
        if label == "m4a1-ads":
            rear_projected = world_to_camera_view(scene, camera, rear)
            front_projected = world_to_camera_view(scene, camera, front)
            metrics["adsSight"]["rearProjected"] = tuple(rear_projected)
            metrics["adsSight"]["frontProjected"] = tuple(front_projected)
            rear_pixel_error = math.hypot(
                (rear_projected.x - 0.5) * REVIEW_WIDTH,
                (rear_projected.y - 0.5) * REVIEW_HEIGHT,
            )
            front_pixel_error = math.hypot(
                (front_projected.x - 0.5) * REVIEW_WIDTH,
                (front_projected.y - 0.5) * REVIEW_HEIGHT,
            )
            metrics["adsSight"]["rearCenterPixelError"] = rear_pixel_error
            metrics["adsSight"]["frontCenterPixelError"] = front_pixel_error
            metrics["adsSight"]["maximumCenterPixelError"] = max(
                rear_pixel_error, front_pixel_error,
            )
            metrics["adsSight"]["passed"] = max(
                rear_pixel_error, front_pixel_error,
            ) <= 8.0
            metrics["passed"] = metrics["passed"] and metrics["adsSight"]["passed"]
        occupancy = weapon_screen_occupancy(scene, camera, review)
        occupancy["verticalFovDegrees"] = vertical_fov
        occupancy["aspectRatio"] = REVIEW_WIDTH / REVIEW_HEIGHT
        metrics["screenOccupancy"] = occupancy
        metrics["passed"] = metrics["passed"] and occupancy["passed"]
        evidence.append({"view": label, "weapon": weapon_id, **metrics})
        path = REVIEW_DIR / f"pass65-djmaesen-arms-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)

    m4_hip = next(item for item in evidence if item["view"] == "m4a1-hip")
    root["m4a1_review_right_socket_error_m"] = m4_hip["rightSocketErrorM"]
    root["m4a1_review_left_socket_error_m"] = m4_hip["leftSocketErrorM"]
    root["m4a1_review_scale"] = float(weapons["m4a1"]["group"].scale.x)
    root["m4a1_review_right_digit_contacts"] = m4_hip["rightHandWeaponContactPairs"]
    root["m4a1_review_left_digit_contacts"] = m4_hip["leftHandWeaponContactPairs"]

    violations = []
    for item in evidence:
        if not item["passed"]:
            violations.append(
                f"{item['view']}: socket or self-intersection contract failed: {item}"
            )
    receipt = {
        "schema": "atomic-acres/pass65-djmaesen-arms-contact-prototype@1",
        "sourceUid": SOURCE_UID,
        "sourceMirrorCommit": SOURCE_MIRROR_COMMIT,
        "delivery": {
            "meshBatches": len(batches),
            "bones": len(armature.data.bones),
            "clips": len(armature.animation_data.nla_tracks),
            "opaque": True,
            "rigIntegrity": json.loads(armature["rig_integrity"]),
        },
        "evidence": evidence,
        "violations": violations,
        "verdict": "pass" if not violations else "fail",
    }
    (REVIEW_DIR / "weapon-contact-receipt.json").write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )
    compose_contact_sheet(rendered, "pass65-djmaesen-arms-weapon-contact-sheet.png")
    for track in armature.animation_data.nla_tracks:
        track.mute = False
    reset_pose(armature)
    scene.frame_set(1)
    if violations:
        raise RuntimeError("weapon contact review failed:\n- " + "\n- ".join(violations))


verify_frozen_source()
reset()
images = build_textures()
materials = build_materials(images)
armature, source_mesh, source_triangles = import_source()
transfer_tip_weights_and_rename(armature, source_mesh)
authored_cap_triangles = cap_proximal_sleeves(source_mesh)
root_key = "Pass65_FirstPersonArms_LOD0"
batches, delivery_triangles = partition_render_batches(
    source_mesh, armature, materials, root_key, source_triangles, authored_cap_triangles,
)
refine_hand_proportions(
    batches, armature, float(os.environ.get("PASS65_HAND_SCALE", "0.86")),
)
author_first_person_shoulder_anchors(armature, batches)
root = configure_asset_root(
    armature, batches, source_triangles, authored_cap_triangles,
    delivery_triangles, images["decoded_bytes"],
)
action_corpus(armature)
render_contact_sheet(root, armature, batches)
bpy.ops.object.select_all(action="DESELECT")
allowed = set(hierarchy(root))
for obj in list(bpy.data.objects):
    if obj not in allowed:
        bpy.data.objects.remove(obj, do_unlink=True)
export_glb(root, OUTPUT_GLB)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
lod1_triangles = author_lod1(root, armature, batches, delivery_triangles)

print(
    "PASS65_DJMAESEN_ARMS_PROTOTYPE_READY "
    f"meshes={len(batches)} bones={len(armature.data.bones)} triangles={delivery_triangles} "
    f"lod1Triangles={lod1_triangles} clips={len(armature.animation_data.nla_tracks)} "
    f"decodedTextureBytes={images['decoded_bytes']}"
)
print(f"GLB={OUTPUT_GLB}")
print(f"LOD1_GLB={OUTPUT_LOD1_GLB}")
print(f"BLEND={OUTPUT_BLEND}")
print(f"CONTACT_SHEET={REVIEW_DIR / 'pass65-djmaesen-arms-weapon-contact-sheet.png'}")
