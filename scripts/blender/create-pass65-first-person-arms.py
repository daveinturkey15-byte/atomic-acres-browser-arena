"""Author dedicated opaque first-person operator arms for Pass 65 in Blender.

The two exported LODs share the same named deform skeleton and action corpus but
are independently built. Meshes are weighted to explicit bones; runtime grip
IK remains presentation-only and cannot change camera/shot authority.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "source-assets/blender/pass65-first-person-operator-arms.blend"
RAW_DIR = ROOT / "artifacts/blender-operator-arms/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/operators/pass65-first-person-arms"
REVIEW_DIR = ROOT / "docs/assets/pass65-operators/first-person-arms"
TEXTURE_SIZE = 512
REVIEW_SIZE = 512
ASSET_ID = "pass65-first-person-operator-arms"
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
)
FINGER_NAMES = ("Index", "Middle", "Ring", "Pinky")

for directory in (SOURCE_BLEND.parent, RAW_DIR, TEXTURE_DIR, REVIEW_DIR):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


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


def make_texture(name: str, kind: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            weave = ((x * 31 + y * 47 + (x ^ y) * 5) % 127) / 126.0
            seam = min(x % 128, y % 128, 127 - (x % 128), 127 - (y % 128)) < 3
            glove_zone = u > 0.5
            cuff_stripe = glove_zone and ((y // 18) % 7 == 0)
            if kind == "baseColor":
                if glove_zone:
                    base = 0.115 + weave * 0.055
                    value = [base * 0.75, base * 0.84, base * 0.82]
                else:
                    base = 0.24 + weave * 0.075
                    value = [base * 0.64, base * 0.83, base * 0.87]
                if seam:
                    value = [component * 0.42 for component in value]
                if cuff_stripe:
                    value = [0.44, 0.36, 0.18]
            elif kind == "normal":
                nx = 0.5 + (weave - 0.5) * 0.035
                ny = 0.5 + (0.08 if seam else (weave - 0.5) * 0.02)
                value = [nx, ny, 0.996]
            elif kind == "roughness":
                rough = (0.77 if glove_zone else 0.87) + weave * 0.09
                value = [rough, rough, rough]
            elif kind == "metallic":
                metal = 0.02 if not cuff_stripe else 0.18
                value = [metal, metal, metal]
            else:
                raise RuntimeError(kind)
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "roughness", "metallic"} else "sRGB"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"pass65-first-person-arms-{kind}.png")
    image.save()
    image.pack()
    return image


def textured_material(name: str, images, tint, uv_offset_x: float):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = tint
    input_socket(bsdf, "Roughness").default_value = 0.84
    input_socket(bsdf, "Metallic").default_value = 0.02
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value[0] = uv_offset_x
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        tex = nodes.new("ShaderNodeTexImage")
        tex.name = f"Pass65 Arms {kind}"
        tex.image = images[kind]
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        links.new(tex.outputs["Color"], input_socket(bsdf, target))
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "Pass65 Arms normal"
    normal_tex.image = images["normal"]
    links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.46
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))
    return material


def simple_material(name, color, metallic, roughness, emission=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = color
    input_socket(bsdf, "Metallic").default_value = metallic
    input_socket(bsdf, "Roughness").default_value = roughness
    if emission is not None:
        input_socket(bsdf, "Emission Color", "Emission").default_value = emission
        input_socket(bsdf, "Emission Strength").default_value = strength
    return material


def finish_mesh(obj, material, bevel=0.0, smooth=False):
    obj.name = obj.name.replace(".", "_")
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft tactical edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    triangulate = obj.modifiers.new("Release triangulation", "TRIANGULATE")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def rounded_cube(name, location, dimensions, material, bevel, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel=bevel)


def tapered_segment(name, start, end, radius_start, radius_end, material, vertices):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius_start, radius2=radius_end,
        depth=direction.length, location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "XYZ"
    return finish_mesh(obj, material, bevel=0.006, smooth=True)


def sphere(name, location, radius, material, segments, rings):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, smooth=True)


def empty(name, location, parent, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.055
    obj.location = location
    obj.parent = parent
    obj["canonical_node_name"] = name
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def add_edit_bone(armature, name, head, tail, parent=None):
    bone = armature.data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.use_deform = name != "Root"
    if parent:
        bone.parent = armature.data.edit_bones[parent]
        bone.use_connect = (Vector(head) - Vector(bone.parent.tail)).length < 0.0001
    return bone


def skin_to_bone(obj, armature, bone_name):
    # glTF requires skinned mesh nodes to be scene roots. Parenting them under
    # the armature emits NODE_SKINNED_MESH_NON_ROOT and makes parent transforms
    # ambiguous at runtime. Keep ownership metadata for deterministic export
    # and review selection while the Armature modifier owns deformation.
    obj.parent = None
    obj["pass65_asset_root"] = armature.parent.get("asset_root_key", armature.parent.name)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Pass65 authored armature", "ARMATURE")
    modifier.object = armature
    obj["weighted_bone"] = bone_name
    obj["opaque_release_mesh"] = True
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
    poses = {
        "equip": (14, 7, {"UpperArmR": (-0.12, 0.08, -0.1), "UpperArmL": (-0.12, -0.08, 0.1)}),
        "unequip": (14, 8, {"UpperArmR": (0.2, -0.18, 0.28), "UpperArmL": (0.18, 0.16, -0.28)}),
        "idle": (48, 24, {"UpperArmR": (-0.018, 0.012, -0.012), "UpperArmL": (-0.016, -0.012, 0.012)}),
        "walk": (24, 12, {"UpperArmR": (-0.04, 0.025, -0.05), "UpperArmL": (0.035, -0.02, 0.05)}),
        "sprint": (22, 11, {"UpperArmR": (0.26, -0.18, 0.34), "LowerArmR": (-0.24, 0.02, -0.1), "UpperArmL": (0.18, 0.22, -0.38), "LowerArmL": (-0.2, -0.02, 0.12)}),
        "ads-in": (12, 8, {"UpperArmR": (-0.08, 0.04, -0.05), "UpperArmL": (-0.1, -0.035, 0.05), "WristR": (-0.04, 0, 0), "WristL": (-0.04, 0, 0)}),
        "ads-out": (12, 5, {"UpperArmR": (-0.08, 0.04, -0.05), "UpperArmL": (-0.1, -0.035, 0.05)}),
        "fire": (7, 2, {"UpperArmR": (-0.075, 0.01, -0.025), "LowerArmR": (-0.1, 0, 0.02), "WristR": (-0.12, 0, 0.04), "UpperArmL": (-0.045, 0, 0.02)}),
        "dry-fire": (5, 2, {"WristR": (-0.04, 0, 0.018)}),
        "reload": (30, 15, {"UpperArmL": (0.42, -0.35, 0.5), "LowerArmL": (-0.7, 0.12, -0.18), "WristL": (-0.28, 0.26, -0.42), "UpperArmR": (-0.08, 0.04, -0.04)}),
        "empty-reload": (40, 20, {"UpperArmL": (0.5, -0.42, 0.58), "LowerArmL": (-0.82, 0.15, -0.22), "WristL": (-0.35, 0.3, -0.48), "UpperArmR": (-0.1, 0.05, -0.05)}),
        "melee": (18, 8, {"UpperArmR": (-0.48, -0.38, 0.72), "LowerArmR": (-0.72, 0.05, -0.25), "WristR": (-0.4, -0.12, 0.38), "UpperArmL": (0.18, 0.16, -0.2)}),
        "inspect": (54, 27, {"UpperArmR": (0.18, -0.32, 0.42), "LowerArmR": (-0.42, 0.08, -0.12), "WristR": (-0.1, 0.38, 0.12), "UpperArmL": (0.12, 0.28, -0.38), "LowerArmL": (-0.36, -0.08, 0.14)}),
    }
    for clip_name in CORE_ACTIONS:
        end_frame, middle_frame, pose_map = poses[clip_name]
        add_armature_action(armature, clip_name, end_frame, middle_frame, pose_map)


def build_armature(label: str, detail: float):
    root = empty(f"Pass65_FirstPersonArms_{label}", (0, 0, 0), None)
    root["asset_id"] = ASSET_ID
    root["asset_root_key"] = root.name
    root["creator"] = "Atomic Acres project"
    root["license"] = "Project-original"
    root["quality_tier"] = label
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "+Y"
    root["opaque_material_contract"] = True
    root["presentation_only"] = True

    armature_data = bpy.data.armatures.new(f"Pass65_FirstPersonArms_Skeleton_{label}")
    armature = bpy.data.objects.new(f"pass65-first-person-arms-skeleton-{label}", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.parent = root
    armature["asset_id"] = ASSET_ID
    armature["dedicated_first_person_skeleton"] = True
    armature.show_in_front = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    add_edit_bone(armature, "Root", (0, -0.46, 0.0), (0, -0.58, 0.0))

    chains = {}
    for side, sign in (("R", 1), ("L", -1)):
        shoulder_x = 0.4 * sign
        elbow_x = 0.33 * sign
        wrist_x = 0.205 * sign
        # Blender +Y exports to glTF -Z, the same forward axis used by the
        # camera-space weapon/socket contract.
        upper_head = (shoulder_x, -0.42, 0.045)
        upper_tail = (elbow_x, 0.12, 0.0)
        lower_tail = (wrist_x, 0.66, -0.035)
        wrist_tail = (0.155 * sign, 0.81, -0.045)
        add_edit_bone(armature, f"UpperArm{side}", upper_head, upper_tail, "Root")
        add_edit_bone(armature, f"LowerArm{side}", upper_tail, lower_tail, f"UpperArm{side}")
        add_edit_bone(armature, f"Wrist{side}", lower_tail, wrist_tail, f"LowerArm{side}")
        chains[side] = (upper_head, upper_tail, lower_tail, wrist_tail)
        finger_x_offsets = (0.056, 0.018, -0.02, -0.056)
        for finger_name, offset in zip(FINGER_NAMES, finger_x_offsets):
            start = (wrist_tail[0] + offset * sign, wrist_tail[1] + 0.018, wrist_tail[2] + 0.012)
            one = (start[0], start[1] + 0.085, start[2] - 0.006)
            two = (start[0], one[1] + 0.067, one[2] - 0.012)
            three = (start[0], two[1] + 0.048, two[2] - 0.014)
            add_edit_bone(armature, f"{finger_name}1{side}", start, one, f"Wrist{side}")
            add_edit_bone(armature, f"{finger_name}2{side}", one, two, f"{finger_name}1{side}")
            add_edit_bone(armature, f"{finger_name}3{side}", two, three, f"{finger_name}2{side}")
        thumb_start = (wrist_tail[0] + 0.086 * sign, wrist_tail[1] + 0.002, wrist_tail[2] - 0.008)
        thumb_one = (thumb_start[0] + 0.064 * sign, thumb_start[1] + 0.052, thumb_start[2] - 0.012)
        thumb_two = (thumb_one[0] + 0.045 * sign, thumb_one[1] + 0.048, thumb_one[2] - 0.018)
        thumb_three = (thumb_two[0] + 0.026 * sign, thumb_two[1] + 0.035, thumb_two[2] - 0.012)
        add_edit_bone(armature, f"Thumb1{side}", thumb_start, thumb_one, f"Wrist{side}")
        add_edit_bone(armature, f"Thumb2{side}", thumb_one, thumb_two, f"Thumb1{side}")
        add_edit_bone(armature, f"Thumb3{side}", thumb_two, thumb_three, f"Thumb2{side}")
    bpy.ops.object.mode_set(mode="OBJECT")

    segments = 18 if detail > 0.8 else 10
    rings = 10 if detail > 0.8 else 6
    for side, sign in (("R", 1), ("L", -1)):
        upper_head, upper_tail, lower_tail, wrist_tail = chains[side]
        upper = tapered_segment(f"{side}-authored-upper-sleeve-{label}", upper_head, upper_tail, 0.135, 0.09, materials["sleeve"], segments)
        lower = tapered_segment(f"{side}-authored-forearm-sleeve-{label}", upper_tail, lower_tail, 0.094, 0.067, materials["sleeve"], segments)
        elbow = sphere(f"{side}-authored-elbow-{label}", upper_tail, 0.092, materials["sleeve"], segments, rings)
        cuff_mid = Vector(lower_tail).lerp(Vector(wrist_tail), 0.35)
        cuff = tapered_segment(f"{side}-authored-glove-cuff-{label}", lower_tail, wrist_tail, 0.078, 0.083, materials["glove"], segments)
        palm_center = Vector(wrist_tail) + Vector((0, 0.065, 0.0))
        palm = rounded_cube(f"{side}-authored-palm-{label}", palm_center, (0.17, 0.22, 0.085), materials["glove"], 0.035)
        knuckle = rounded_cube(f"{side}-authored-knuckle-guard-{label}", palm_center + Vector((0, -0.035, 0.052)), (0.15, 0.105, 0.035), materials["pad"], 0.014)
        wrist_guard = rounded_cube(f"{side}-authored-wrist-guard-{label}", cuff_mid + Vector((0, 0, 0.055)), (0.145, 0.09, 0.04), materials["pad"], 0.012)
        for obj, bone_name in ((upper, f"UpperArm{side}"), (lower, f"LowerArm{side}"), (elbow, f"LowerArm{side}"),
                               (cuff, f"Wrist{side}"), (palm, f"Wrist{side}"), (knuckle, f"Wrist{side}"), (wrist_guard, f"Wrist{side}")):
            skin_to_bone(obj, armature, bone_name)
        if side == "L":
            display = rounded_cube("left-wrist-authored-display", cuff_mid + Vector((0, -0.015, 0.078)), (0.105, 0.078, 0.018), materials["display"], 0.007)
            skin_to_bone(display, armature, "WristL")

        for finger_name in FINGER_NAMES:
            for joint in (1, 2, 3):
                bone = armature.data.bones[f"{finger_name}{joint}{side}"]
                radius = 0.022 if joint == 1 else 0.019 if joint == 2 else 0.016
                mesh = tapered_segment(
                    f"{side}-{finger_name.lower()}-{joint}-{label}", bone.head_local, bone.tail_local,
                    radius, radius * 0.88, materials["glove"], max(8, segments // 2),
                )
                skin_to_bone(mesh, armature, bone.name)
        for joint in (1, 2, 3):
            bone = armature.data.bones[f"Thumb{joint}{side}"]
            radius = 0.025 if joint == 1 else 0.021 if joint == 2 else 0.017
            mesh = tapered_segment(
                f"{side}-thumb-{joint}-{label}", bone.head_local, bone.tail_local,
                radius, radius * 0.86, materials["glove"], max(8, segments // 2),
            )
            skin_to_bone(mesh, armature, bone.name)

    for name, location, semantic in (
        ("right-hand-grip-socket", (0.155, 0.86, -0.045), "rightGrip"),
        ("left-hand-grip-socket", (-0.155, 0.86, -0.045), "leftGrip"),
        ("right-wrist-knife-socket", (0.19, 0.76, -0.06), "knife"),
        ("left-hand-grenade-socket", (-0.15, 0.87, -0.045), "grenade"),
    ):
        empty(name, location, armature, semantic)
    action_corpus(armature)
    return root, armature


def hierarchy(root):
    root_key = root.get("asset_root_key", root.name)
    owned = [obj for obj in bpy.data.objects if obj.get("pass65_asset_root") == root_key]
    return [root, *root.children_recursive, *owned]


def export_root(root, output_name):
    selected = hierarchy(root)
    selected_set = set(selected)
    for obj in bpy.data.objects:
        canonical = obj.get("canonical_node_name")
        if canonical and obj not in selected_set:
            obj.name = f"{canonical}__SOURCE_OTHER"
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = canonical
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_DIR / f"{output_name}.glb"), export_format="GLB",
        use_selection=True, export_yup=True, export_apply=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_extras=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=False, export_optimize_animation_size=True,
        export_tangents=True,
    )
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = f"{canonical}__SOURCE_{output_name}"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(hero_root, armature):
    for root, _candidate_armature in arm_roots:
        visible = root == hero_root
        for obj in hierarchy(root):
            obj.hide_render = not visible
            obj.hide_viewport = not visible
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, -0.28, -0.36))
    stage = bpy.context.object
    stage.name = "Operator_Arms_Review_Stage"
    stage.data.materials.append(materials["stage"])
    for name, location, energy, color, size in (
        ("Arms_Key", (-2.8, -2.3, 3.4), 1120, (0.55, 0.78, 1.0), 2.0),
        ("Arms_Rim", (2.7, 0.2, 2.6), 980, (1.0, 0.28, 0.06), 1.6),
        ("Arms_Fill", (0.0, 3.2, 1.2), 620, (0.25, 0.5, 0.72), 2.2),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, -0.35, 0.0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass65_Arms_Review_Camera"
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.011)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_set(1)
    views = (
        ("neutral-front", (0, -2.65, 0.8), (0, 0.26, -0.02), 58, None),
        ("neutral-quarter", (2.25, -1.75, 1.2), (0, 0.3, -0.02), 62, None),
        ("glove-closeup", (0.82, 0.04, 0.28), (0.2, 0.79, -0.045), 72, None),
        ("reload-action", (-1.9, -1.55, 0.95), (0, 0.32, -0.02), 62, "reload"),
    )
    rendered = []
    for label, location, target, lens, action_name in views:
        if action_name:
            track = next(track for track in armature.animation_data.nla_tracks if track.name == action_name)
            for candidate in armature.animation_data.nla_tracks:
                candidate.mute = candidate != track
            scene.frame_set(15)
        else:
            for candidate in armature.animation_data.nla_tracks:
                candidate.mute = True
            reset_pose(armature)
            scene.frame_set(1)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"pass65-first-person-arms-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)
    for candidate in armature.animation_data.nla_tracks:
        candidate.mute = False
    reset_pose(armature)
    scene.frame_set(1)
    images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet = bpy.data.images.new("Pass65_FirstPersonArms_ContactSheet", REVIEW_SIZE * 2, REVIEW_SIZE * 2, alpha=True)
    pixels = [0.0] * (REVIEW_SIZE * 2 * REVIEW_SIZE * 2 * 4)
    for index, image in enumerate(images):
        source = list(image.pixels[:])
        tile_x = (index % 2) * REVIEW_SIZE
        tile_y = (1 - index // 2) * REVIEW_SIZE
        for row in range(REVIEW_SIZE):
            source_start = row * REVIEW_SIZE * 4
            target_start = ((tile_y + row) * REVIEW_SIZE * 2 + tile_x) * 4
            pixels[target_start:target_start + REVIEW_SIZE * 4] = source[source_start:source_start + REVIEW_SIZE * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / "pass65-first-person-arms-contact-sheet.png")
    sheet.save()


reset()
images = {kind: make_texture(f"Pass65_FirstPersonArms_{kind}", kind) for kind in ("baseColor", "normal", "roughness", "metallic")}
materials = {
    "sleeve": textured_material("MAT_Pass65_Arms_Sleeve_PBR", images, (0.42, 0.62, 0.66, 1), 0.0),
    "glove": textured_material("MAT_Pass65_Arms_Glove_PBR", images, (0.16, 0.19, 0.18, 1), 0.5),
    "pad": simple_material("MAT_Pass65_Arms_ArmorPad", (0.055, 0.067, 0.066, 1), 0.12, 0.72),
    "display": simple_material("MAT_Pass65_Arms_WristDisplay", (0.01, 0.18, 0.19, 1), 0.22, 0.18, (0.0, 0.86, 0.78, 1), 4.2),
    "stage": simple_material("MAT_Pass65_Arms_ReviewStage", (0.012, 0.017, 0.023, 1), 0.1, 0.6),
}
arm_roots = []
for label, detail, output_name in (("LOD0", 1.0, "pass65-first-person-arms-lod0"), ("LOD1", 0.55, "pass65-first-person-arms-lod1")):
    root, armature = build_armature(label, detail)
    arm_roots.append((root, armature))
    export_root(root, output_name)
render_reviews(arm_roots[0][0], arm_roots[0][1])
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
for root, armature in arm_roots:
    meshes = [obj for obj in hierarchy(root) if obj.type == "MESH"]
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    print(f"PASS65_OPERATOR_ARMS_{root.get('quality_tier')}_READY meshes={len(meshes)} bones={len(armature.data.bones)} triangles={triangles}")
print(f"BLEND={SOURCE_BLEND}")
print(f"RAW_DIR={RAW_DIR}")
print(f"REVIEW={REVIEW_DIR / 'pass65-first-person-arms-contact-sheet.png'}")
