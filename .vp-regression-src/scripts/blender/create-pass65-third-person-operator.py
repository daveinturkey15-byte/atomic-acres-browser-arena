"""Forge the Pass 65 canonical third-person operator family in Blender 5.1.

The Quaternius CC0 SWAT source supplies the lawful humanoid topology, 62-joint
skeleton, skin weights, and 24 action clips. This controlled derivative removes
the embedded pistol, authors opaque project-owned PBR maps, emits three distinct
skinned LODs, and creates deterministic review renders. Gameplay hit proxies,
damage, movement, and weapon authority remain TypeScript-owned.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_GLTF = ROOT / "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf"
SOURCE_BLEND = ROOT / "source-assets/blender/pass65-third-person-operator.blend"
RAW_DIR = ROOT / "artifacts/blender-third-person-operator/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/operators/pass65-third-person-operator"
REVIEW_DIR = ROOT / "docs/assets/pass65-operators/third-person"
ASSET_ID = "pass65-third-person-operator-family-v1"
TEXTURE_SIZE = 512
REVIEW_SIZE = 640
MATERIAL_NAMES = ("Skin", "Swat", "Swat_Black", "Visor")
REQUIRED_ACTIONS = (
    "Idle_Gun_Pointing", "Idle_Gun", "Walk", "Run", "Run_Shoot",
    "Gun_Shoot", "HitRecieve", "HitRecieve_2", "Death", "Punch_Right",
)

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


def deterministic_noise(x: int, y: int, seed: int) -> float:
    value = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)
    value ^= value >> 13
    value *= 1274126177
    value ^= value >> 16
    return (value & 0xFFFF) / 65535.0


def texture_sample(material_name: str, kind: str, x: int, y: int) -> tuple[float, float, float]:
    material_index = MATERIAL_NAMES.index(material_name)
    u = x / (TEXTURE_SIZE - 1)
    v = y / (TEXTURE_SIZE - 1)
    noise = deterministic_noise(x, y, material_index + 1)
    weave = 0.5 + 0.5 * math.sin((x + y * 1.7) * 0.34) * math.sin((y - x * 0.65) * 0.29)
    cell_x = x % 128
    cell_y = y % 128
    seam = min(cell_x, cell_y, 127 - cell_x, 127 - cell_y) < 3
    edge_wear = min(1.0, min(cell_x, cell_y, 127 - cell_x, 127 - cell_y) / 16.0)

    if material_name == "Skin":
        if kind == "baseColor":
            freckle = -0.055 if noise > 0.982 else 0.0
            warm = 0.56 + (noise - 0.5) * 0.045 + freckle
            return warm, warm * 0.69, warm * 0.48
        if kind == "normal":
            return 0.5 + (noise - 0.5) * 0.022, 0.5 + (weave - 0.5) * 0.012, 0.999
        if kind == "roughness":
            value = 0.58 + noise * 0.12
            return value, value, value
        return 0.0, 0.0, 0.0

    if material_name == "Swat":
        if kind == "baseColor":
            base = 0.72 + (weave - 0.5) * 0.12 + (noise - 0.5) * 0.035
            if seam:
                base *= 0.38
            return base * 0.78, base * 0.92, base
        if kind == "normal":
            seam_push = 0.10 if seam else 0.0
            return 0.5 + (weave - 0.5) * 0.045, 0.5 + seam_push + (noise - 0.5) * 0.022, 0.996
        if kind == "roughness":
            value = 0.74 + noise * 0.18 - (0.10 if seam else 0.0)
            return value, value, value
        return 0.018, 0.018, 0.018

    if material_name == "Swat_Black":
        plate = ((x // 64) + (y // 64)) % 3 == 0
        if kind == "baseColor":
            base = (0.47 if plate else 0.61) + (noise - 0.5) * 0.06
            base *= 0.78 + edge_wear * 0.22
            if seam:
                base *= 0.34
            return base * 0.73, base * 0.78, base * 0.80
        if kind == "normal":
            strength = 0.018 if plate else 0.055
            return 0.5 + (noise - 0.5) * strength, 0.5 + (weave - 0.5) * strength, 0.998
        if kind == "roughness":
            value = (0.44 if plate else 0.76) + noise * 0.12
            return value, value, value
        value = 0.16 if plate else 0.028
        return value, value, value

    # The visor remains fully opaque but gains a coherent reflective response.
    scanline = 0.05 if y % 32 < 2 else 0.0
    if kind == "baseColor":
        return 0.08 + scanline, 0.34 + scanline, 0.42 + scanline
    if kind == "normal":
        return 0.5 + (noise - 0.5) * 0.008, 0.5, 1.0
    if kind == "roughness":
        value = 0.16 + noise * 0.09
        return value, value, value
    value = 0.52 + noise * 0.08
    return value, value, value


def make_texture(material_name: str, kind: str) -> bpy.types.Image:
    slug = material_name.lower().replace("_", "-")
    image_name = f"Pass65_ThirdPersonOperator_{material_name}_{kind}"
    image = bpy.data.images.new(image_name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            value = texture_sample(material_name, kind, x, y)
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "roughness", "metallic"} else "sRGB"
    image.alpha_mode = "STRAIGHT"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"pass65-third-person-operator-{slug}-{kind}.png")
    image.save()
    image.pack()
    return image


def configure_material(material: bpy.types.Material, images: dict[str, bpy.types.Image]) -> None:
    material.use_nodes = True
    material.diffuse_color[3] = 1.0
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    input_socket(bsdf, "Base Color").default_value = (1.0, 1.0, 1.0, 1.0)
    input_socket(bsdf, "Alpha").default_value = 1.0
    input_socket(bsdf, "Roughness").default_value = 0.72
    input_socket(bsdf, "Metallic").default_value = 0.02

    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = f"Pass65 Operator {material.name} {kind}"
        texture.image = images[kind]
        links.new(texture.outputs["Color"], input_socket(bsdf, target))

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = f"Pass65 Operator {material.name} normal"
    normal_texture.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.7 if material.name != "Visor" else 0.24
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))

    material["pass65_asset_id"] = ASSET_ID
    material["opaque_depth_writing"] = True
    material["pbr_map_contract"] = "baseColor+normal+roughness+metallic"


def import_and_prepare() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    reset()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLTF))
    armature = bpy.data.objects.get("CharacterArmature")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("Quaternius SWAT armature was not imported")

    embedded_pistol = bpy.data.objects.get("Pistol")
    if embedded_pistol is None:
        raise RuntimeError("source pistol removal contract cannot be verified")
    bpy.data.objects.remove(embedded_pistol, do_unlink=True)

    body_objects = [bpy.data.objects.get(name) for name in ("Swat_Body", "Swat_Feet", "Swat_Head", "Swat_Legs")]
    if any(obj is None or obj.type != "MESH" for obj in body_objects):
        raise RuntimeError("complete source SWAT body mesh family was not imported")
    body_meshes = [obj for obj in body_objects if obj is not None]

    textures: dict[str, dict[str, bpy.types.Image]] = {}
    for material_name in MATERIAL_NAMES:
        material = bpy.data.materials.get(material_name)
        if material is None:
            raise RuntimeError(f"source material {material_name} missing")
        material_images = {
            kind: make_texture(material_name, kind)
            for kind in ("baseColor", "normal", "roughness", "metallic")
        }
        configure_material(material, material_images)
        textures[material_name] = material_images

    armature.name = "Pass65_ThirdPersonOperator_Armature"
    armature["asset_id"] = ASSET_ID
    armature["source_kind"] = "license-vetted-cc0-blender-derivative"
    armature["runtime_forward_axis"] = "+Z-source-corrected-once-to-atomic-minus-Z"
    armature["material_contract"] = "opaque-embedded-pbr-depth-writing"
    armature["skeleton_joint_count"] = 62
    armature["animation_clip_count"] = 24
    armature["embedded_weapon_policy"] = "removed-from-delivery"
    armature["canonical_consumers"] = "players+bots+reinforcements+corpses"
    # Blender's glTF importer leaves the final (Death) action active as well as
    # creating one NLA track per clip. Clear that active action so review poses
    # and editable-source state are driven by exactly one selected track.
    if armature.animation_data is None:
        raise RuntimeError("operator armature has no animation data")
    armature.animation_data.action = None
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    for action_name in REQUIRED_ACTIONS:
        if bpy.data.actions.get(action_name) is None:
            raise RuntimeError(f"required source animation {action_name} missing")
    for body in body_meshes:
        body["asset_id"] = ASSET_ID
        body["skinned_operator_body_part"] = body.name
        body["presentation_only"] = True
        body["opaque_pbr"] = True
        if not body.vertex_groups:
            raise RuntimeError(f"{body.name} has no retained skin weights")
    return armature, body_meshes


def selected_delivery_objects(armature: bpy.types.Object, body_meshes: list[bpy.types.Object]) -> list[bpy.types.Object]:
    return [armature, *body_meshes]


def export_lod(armature: bpy.types.Object, body_meshes: list[bpy.types.Object], lod: int) -> None:
    armature["lod"] = lod
    armature["quality_tier"] = ("hero-near", "gameplay-mid", "gameplay-far")[lod]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected_delivery_objects(armature, body_meshes):
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_DIR / f"pass65-third-person-operator-lod{lod}.glb"),
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


def decimate_body(body_meshes: list[bpy.types.Object], ratio: float, label: str) -> None:
    for body in body_meshes:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        modifier = body.modifiers.new(f"Pass65 {label} authored topology reduction", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        # Evaluate the reduction on the authored bind-pose mesh, before the
        # Armature modifier. Applying it after skin deformation makes the
        # result pose-dependent and Blender warns that the output is unstable.
        while body.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        body.select_set(False)


def mute_all_tracks(armature: bpy.types.Object) -> None:
    if armature.animation_data is None:
        return
    for track in armature.animation_data.nla_tracks:
        track.mute = True


def activate_track(armature: bpy.types.Object, action_name: str, frame: int) -> None:
    if armature.animation_data is None:
        raise RuntimeError("operator armature has no animation data")
    found = False
    for track in armature.animation_data.nla_tracks:
        track.mute = track.name != action_name
        found = found or track.name == action_name
    if not found:
        raise RuntimeError(f"review action {action_name} missing")
    bpy.context.scene.frame_set(frame)


def activate_rest_pose(armature: bpy.types.Object) -> None:
    mute_all_tracks(armature)
    armature.data.pose_position = "REST"
    bpy.context.scene.frame_set(1)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(armature: bpy.types.Object, body_meshes: list[bpy.types.Object]) -> None:
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    stage = bpy.context.object
    stage.name = "Pass65_Operator_Review_Stage"
    stage_material = bpy.data.materials.new("Pass65_Operator_Review_Stage_Material")
    stage_material.diffuse_color = (0.025, 0.035, 0.045, 1.0)
    stage_material.use_nodes = True
    stage_bsdf = stage_material.node_tree.nodes.get("Principled BSDF")
    input_socket(stage_bsdf, "Base Color").default_value = (0.018, 0.028, 0.038, 1.0)
    input_socket(stage_bsdf, "Roughness").default_value = 0.55
    stage.data.materials.append(stage_material)

    for name, location, energy, color, size in (
        ("Operator_Review_Key", (-3.8, -3.2, 4.9), 1280, (0.50, 0.76, 1.0), 2.5),
        ("Operator_Review_Rim", (3.4, 1.8, 3.5), 1180, (1.0, 0.25, 0.08), 2.0),
        ("Operator_Review_Fill", (0.0, 4.0, 2.4), 760, (0.20, 0.44, 0.72), 2.8),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 1.0))

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass65_Operator_Review_Camera"
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.012)
    scene.view_settings.look = "AgX - Medium High Contrast"

    views = (
        ("neutral-front", (0.0, -4.35, 1.28), (0.0, 0.0, 0.94), 66, "Idle_Neutral", 12),
        ("neutral-rear-quarter", (3.35, 3.15, 1.48), (0.0, 0.0, 0.98), 68, "Idle", 12),
        ("run-action", (-3.15, -3.15, 1.18), (0.0, 0.0, 0.92), 62, "Run", 12),
        ("corpse-action", (3.25, -3.15, 1.72), (0.0, 0.0, 0.38), 58, "Death", 25),
    )
    rendered: list[Path] = []
    for label, location, target, lens, action_name, frame in views:
        if action_name is None:
            activate_rest_pose(armature)
        else:
            armature.data.pose_position = "POSE"
            activate_track(armature, action_name, frame)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"pass65-third-person-operator-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)

    mute_all_tracks(armature)
    armature.data.pose_position = "REST"
    scene.frame_set(1)
    source_images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet = bpy.data.images.new(
        "Pass65_ThirdPersonOperator_ContactSheet",
        REVIEW_SIZE * 2,
        REVIEW_SIZE * 2,
        alpha=True,
    )
    sheet_pixels = [0.0] * (REVIEW_SIZE * 2 * REVIEW_SIZE * 2 * 4)
    for image_index, image in enumerate(source_images):
        source = list(image.pixels[:])
        tile_x = (image_index % 2) * REVIEW_SIZE
        tile_y = (1 - image_index // 2) * REVIEW_SIZE
        for row in range(REVIEW_SIZE):
            source_start = row * REVIEW_SIZE * 4
            target_start = ((tile_y + row) * REVIEW_SIZE * 2 + tile_x) * 4
            sheet_pixels[target_start:target_start + REVIEW_SIZE * 4] = source[source_start:source_start + REVIEW_SIZE * 4]
    sheet.pixels = sheet_pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / "pass65-third-person-operator-contact-sheet.png")
    sheet.save()

    # Keep review objects in the editable source, but never in selected runtime exports.
    for body in body_meshes:
        body.hide_render = False
        body.hide_viewport = False


armature, body_meshes = import_and_prepare()
export_lod(armature, body_meshes, 0)
render_reviews(armature, body_meshes)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND), compress=True)

decimate_body(body_meshes, 0.70, "LOD1")
export_lod(armature, body_meshes, 1)
decimate_body(body_meshes, 0.58, "LOD2")
export_lod(armature, body_meshes, 2)

print(f"SOURCE={SOURCE_BLEND}")
print(f"RAW={RAW_DIR}")
print(f"REVIEW={REVIEW_DIR / 'pass65-third-person-operator-contact-sheet.png'}")
