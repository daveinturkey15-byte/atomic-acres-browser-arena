"""Author the project-original Pass 65 tactical field-knife delivery family."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "source-assets/blender/pass65-field-knife.blend"
RAW_DIR = ROOT / "artifacts/blender-field-knife/raw"
MODEL_DIR = ROOT / "public/assets/original/models/weapons/pass65-field-knife"
TEXTURE_DIR = ROOT / "public/assets/original/textures/weapons/pass65-field-knife"
REVIEW_DIR = ROOT / "docs/assets/pass65-weapons/field-knife"
TEXTURE_SIZE = 512
ACTIONS = ("equip", "unequip", "idle", "walk", "sprint", "melee", "inspect")
DELIVERIES = (
    ("first-person-lod0", "fp-lod0", 1.0),
    ("first-person-lod1", "fp-lod1", 0.68),
    ("world-lod0", "world-lod0", 0.84),
    ("world-lod1", "world-lod1", 0.45),
    ("drop-lod0", "drop-lod0", 0.58),
)

for directory in (SOURCE_BLEND.parent, RAW_DIR, MODEL_DIR, TEXTURE_DIR, REVIEW_DIR):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def shader_input(node, *names):
    for name in names:
        result = node.inputs.get(name)
        if result is not None:
            return result
    raise RuntimeError(names)


def texture(kind):
    image = bpy.data.images.new(f"Pass65_FieldKnife_{kind}", TEXTURE_SIZE, TEXTURE_SIZE, alpha=True)
    pixels = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            grain = ((x * 29 + y * 47 + (x ^ y) * 11 + 7331) % 251) / 250
            groove = min(x % 96, 95 - x % 96) < 4
            handle_panel = 0.52 < u < 0.94 and 0.08 < v < 0.48
            if kind in {"baseColor", "handleBaseColor"}:
                if kind == "handleBaseColor":
                    handle_panel = True
                color = (0.075, 0.095, 0.105) if handle_panel else (0.19, 0.23, 0.24)
                value = [component * (0.82 + grain * 0.2) for component in color]
                if groove: value = [component * 0.42 for component in value]
            elif kind == "normal":
                value = [0.5 + (grain - 0.5) * 0.035, 0.58 if groove else 0.5, 0.996]
            elif kind == "roughness":
                roughness = (0.72 if handle_panel else 0.28) + grain * 0.14
                value = [roughness] * 3
            elif kind == "metallic":
                metallic = 0.04 if handle_panel else 0.88 - grain * 0.07
                value = [metallic] * 3
            else:
                raise RuntimeError(kind)
            offset = (y * TEXTURE_SIZE + x) * 4
            pixels[offset:offset + 4] = [*value, 1]
    image.colorspace_settings.name = "sRGB" if kind in {"baseColor", "handleBaseColor"} else "Non-Color"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"pass65-field-knife-{kind}.png")
    image.save()
    image.pack()
    return image


def pbr_material(name, images, tint, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    shader_input(bsdf, "Base Color").default_value = tint
    shader_input(bsdf, "Metallic").default_value = metallic
    shader_input(bsdf, "Roughness").default_value = roughness
    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        node = nodes.new("ShaderNodeTexImage")
        node.image = images[kind]
        links.new(node.outputs["Color"], shader_input(bsdf, target))
    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.55
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader_input(bsdf, "Normal"))
    return material


def simple_material(name, color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    shader_input(bsdf, "Base Color").default_value = color
    shader_input(bsdf, "Metallic").default_value = metallic
    shader_input(bsdf, "Roughness").default_value = roughness
    return material


def empty(name, location, parent=None, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj["canonical_node_name"] = name
    if semantic: obj["atomic_socket"] = semantic
    return obj


def finish(obj, material, parent, bevel=0.0, segments=2, canonical=None, smooth=False):
    obj.name = canonical or obj.name.replace(".", "_")
    if canonical: obj["canonical_node_name"] = canonical
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new("Release triangulation", "TRIANGULATE")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for polygon in obj.data.polygons: polygon.use_smooth = True
    obj.parent = parent
    obj["opaque_release_mesh"] = True
    return obj


def cube(name, location, dimensions, material, parent, bevel=0.01, segments=2, rotation=(0, 0, 0), canonical=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, parent, bevel, segments, canonical)


def cylinder(name, location, radius, depth, material, parent, vertices, rotation=(0, 0, 0), canonical=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, material, parent, 0.003, 1, canonical, True)


def blade_mesh(name, detail, material, parent):
    outline = [(-0.12, 0.24), (-0.16, 0.08), (-0.155, -0.48), (-0.11, -0.92), (0, -1.18), (0.11, -0.92), (0.15, -0.5), (0.13, 0.08), (0.09, 0.24)]
    thickness = 0.032
    vertices = [(x, y, z) for z in (-thickness, thickness) for x, y in outline]
    count = len(outline)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, following + count, index + count))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    return finish(obj, material, parent, 0.008, 3 if detail > 0.9 else 2 if detail > 0.55 else 1, "field-knife-blade")


def add_action(obj, name, positions=None, rotations=None):
    rest_position = obj.location.copy()
    rest_rotation = obj.rotation_euler.copy()
    action = bpy.data.actions.new(f"Pass65_FieldKnife_{name}")
    obj.animation_data_create()
    obj.animation_data.action = action
    end = 2
    for frame, value in positions or []:
        end = max(end, frame)
        obj.location = value
        obj.keyframe_insert(data_path="location", frame=frame)
    for frame, value in rotations or []:
        end = max(end, frame)
        obj.rotation_euler = value
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = end
    obj.animation_data.action = None
    obj.location = rest_position
    obj.rotation_euler = rest_rotation


def action_corpus(driver, detail):
    rest = driver.location.copy()
    rotation = Vector(tuple(driver.rotation_euler))
    motions = {
        "equip": ([(1, rest + Vector((0.2, 0.16, -0.18))), (12, rest)], None),
        "unequip": ([(1, rest), (12, rest + Vector((0.24, 0.2, -0.2)))], None),
        "idle": ([(1, rest), (24, rest + Vector((0, -0.004, 0.006))), (48, rest)], None),
        "walk": ([(1, rest), (8, rest + Vector((0.015, 0, 0.012))), (16, rest + Vector((-0.015, 0, -0.005))), (24, rest)], None),
        "sprint": ([(1, rest), (8, rest + Vector((0.04, 0.08, -0.05))), (18, rest)], [(1, rotation), (9, rotation + Vector((0.18, -0.12, -0.32))), (18, rotation)]),
        "melee": ([(1, rest), (7, rest + Vector((-0.34, -0.22, 0.15))), (14, rest + Vector((0.12, -0.34, -0.08))), (22, rest)], [(1, rotation), (7, rotation + Vector((-0.45, -0.7, 0.8))), (14, rotation + Vector((0.25, 0.42, -0.55))), (22, rotation)]),
        "inspect": ([(1, rest), (24, rest + Vector((0.06, 0.08, 0.05))), (50, rest)], [(1, rotation), (24, rotation + Vector((0.18, 0.5, -0.22))), (50, rotation)]),
    }
    for name in ACTIONS:
        positions, rotations = motions[name]
        add_action(driver, name, positions, rotations)
    driver["action_motion_scale"] = detail


def build(delivery, suffix, detail, materials):
    root = empty(f"Pass65_FieldKnife_{suffix.upper().replace('-', '_')}", (0, 0, 0))
    root.rotation_euler.z = math.pi
    root["asset_id"] = "pass65-field-knife-v1"
    root["delivery_variant"] = delivery
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "-Y rotated to +Y at delivery root"
    root["presentation_only"] = True
    root["opaque_material_contract"] = True
    driver = empty("field-knife-action-driver", (0, 0, 0), root, "animation-root")
    blade = blade_mesh(f"FieldKnife_Blade_{suffix}", detail, materials["blade"], driver)
    fuller = cube("FieldKnife_Fuller", (0, -0.42, 0.037), (0.085, 0.75, 0.011), materials["fuller"], blade, 0.006, 2, canonical="field-knife-fuller")
    fuller["recessed_blade_detail"] = True
    guard = empty("field-knife-guard", (0, 0, 0), driver, "guard")
    cube("FieldKnife_GuardBody", (0, 0.25, 0), (0.39, 0.085, 0.095), materials["metal"], guard, 0.025, 2)
    tang = empty("field-knife-full-tang", (0, 0, 0), driver, "full-tang")
    cube("FieldKnife_Tang", (0, 0.61, 0), (0.155, 0.68, 0.07), materials["metal"], tang, 0.018, 2)
    grip = empty("field-knife-g10-grip", (0, 0, 0), driver, "grip")
    for side in (-1, 1):
        cube(f"FieldKnife_HandleScale_{side}", (side * 0.052, 0.61, 0), (0.075, 0.63, 0.12), materials["handle"], grip, 0.035, 3 if detail > 0.65 else 2)
    ribs = 8 if detail > 0.9 else 6 if detail > 0.6 else 4 if detail > 0.4 else 2
    segments = 24 if detail > 0.9 else 18 if detail > 0.6 else 12 if detail > 0.4 else 8
    for index in range(ribs):
        cube(f"FieldKnife_GripRib_{index}", (0, 0.35 + index * 0.075, 0.067), (0.17, 0.025, 0.018), materials["rubber"], grip, 0.006, 1)
    screw_count = 3 if detail > 0.55 else 2
    for index in range(screw_count):
        for side in (-1, 1):
            cylinder(f"FieldKnife_HandleScrew_{side}_{index}", (side * 0.092, 0.42 + index * 0.18, 0), 0.019, 0.018, materials["accent"], grip, segments, rotation=(0, math.pi / 2, 0))
    serrations = 6 if detail > 0.9 else 4 if detail > 0.6 else 3 if detail > 0.4 else 1
    serration_root = empty("field-knife-spine-serrations", (0, 0, 0), blade, "serrations")
    for index in range(serrations):
        cube(f"FieldKnife_Serration_{index}", (-0.135, -0.12 - index * 0.075, 0), (0.035, 0.04, 0.085), materials["metal"], serration_root, 0.004, 1, rotation=(0, 0, math.radians(32)))
    pommel = empty("field-knife-pommel", (0, 0, 0), driver, "pommel")
    cube("FieldKnife_PommelBody", (0, 0.98, 0), (0.19, 0.13, 0.13), materials["metal"], pommel, 0.035, 2)
    cylinder("FieldKnife_LanyardHole", (0, 0.98, 0), 0.034, 0.15, materials["fuller"], pommel, segments, rotation=(0, math.pi / 2, 0), canonical="field-knife-lanyard-hole")
    for name, position, semantic in (
        ("grip-socket-r", (0, 0.61, 0), "rightGrip"),
        ("blade-tip-socket", (0, -1.2, 0), "bladeTip"),
        ("blade-edge-socket", (0.13, -0.56, 0), "bladeEdge"),
        ("pommel-socket", (0, 1.06, 0), "pommel"),
    ):
        empty(name, position, root, semantic)
    action_corpus(driver, detail)
    return root


def hierarchy(root):
    return [root, *root.children_recursive]


def export_root(root, output):
    selected = hierarchy(root)
    selected_set = set(selected)
    for obj in bpy.data.objects:
        canonical = obj.get("canonical_node_name")
        if canonical and obj not in selected_set: obj.name = f"{canonical}__SOURCE_OTHER"
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical: obj.name = canonical
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected: obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_DIR / f"pass65-field-knife-{output}.glb"), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_extras=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_force_sampling=False, export_optimize_animation_size=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False, export_tangents=True,
    )
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical: obj.name = f"{canonical}__SOURCE_{output}"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def reviews(hero):
    bpy.ops.mesh.primitive_plane_add(size=7, location=(0, 0, -0.22))
    stage = bpy.context.object
    stage.data.materials.append(materials["stage"])
    for location, energy, color, size in (
        ((-2.8, -2.4, 3.0), 1100, (0.48, 0.72, 1), 2.0),
        ((2.7, 0.7, 2.2), 900, (1, 0.28, 0.06), 1.5),
        ((0, 3.2, 1.4), 560, (0.3, 0.45, 0.64), 2.2),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 480
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.011)
    scene.view_settings.look = "AgX - Medium High Contrast"
    for root in roots:
        visible = root == hero
        for obj in hierarchy(root): obj.hide_render = not visible
    views = (
        ("hero-quarter", (2.25, 2.15, 1.05), (0, -0.15, 0), 62, None, 1),
        ("blade-profile", (2.8, 0.08, 0.42), (0, -0.1, 0), 68, None, 1),
        ("grip-closeup", (1.5, 1.55, 0.52), (0, 0.55, 0), 72, None, 1),
        ("melee-action", (-2.1, 2.0, 1.0), (0, -0.12, 0), 58, "melee", 7),
    )
    paths = []
    for label, location, target, lens, clip, frame in views:
        for obj in hierarchy(hero):
            if obj.animation_data:
                for track in obj.animation_data.nla_tracks: track.mute = clip is None or track.name != clip
        scene.frame_set(frame)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"pass65-field-knife-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    loaded = [bpy.data.images.load(str(path), check_existing=False) for path in paths]
    sheet = bpy.data.images.new("Pass65_FieldKnife_ContactSheet", 960, 720, alpha=True)
    pixels = [0.0] * (960 * 720 * 4)
    for index, image in enumerate(loaded):
        source = list(image.pixels[:])
        tile_x = (index % 2) * 480
        tile_y = (1 - index // 2) * 360
        for row in range(360):
            source_start = row * 480 * 4
            target_start = ((tile_y + row) * 960 + tile_x) * 4
            pixels[target_start:target_start + 480 * 4] = source[source_start:source_start + 480 * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / "pass65-field-knife-contact-sheet.png")
    sheet.save()


reset()
images = {kind: texture(kind) for kind in ("baseColor", "normal", "roughness", "metallic")}
handle_images = {**images, "baseColor": texture("handleBaseColor")}
materials = {
    "blade": pbr_material("MAT_Pass65_FieldKnife_Blade_PBR", images, (0.38, 0.43, 0.44, 1), 0.9, 0.25),
    "handle": pbr_material("MAT_Pass65_FieldKnife_G10_PBR", handle_images, (0.18, 0.21, 0.2, 1), 0.04, 0.75),
    "metal": simple_material("MAT_Pass65_FieldKnife_Gunmetal", (0.12, 0.15, 0.16, 1), 0.86, 0.3),
    "fuller": simple_material("MAT_Pass65_FieldKnife_Fuller", (0.025, 0.035, 0.04, 1), 0.76, 0.2),
    "rubber": simple_material("MAT_Pass65_FieldKnife_Rubber", (0.035, 0.045, 0.04, 1), 0.02, 0.9),
    "accent": simple_material("MAT_Pass65_FieldKnife_Accent", (0.73, 0.45, 0.16, 1), 0.65, 0.28),
    "stage": simple_material("MAT_Pass65_FieldKnife_Stage", (0.012, 0.017, 0.023, 1), 0.1, 0.62),
}
roots = []
hero = None
for delivery, suffix, detail in DELIVERIES:
    root = build(delivery, suffix, detail, materials)
    roots.append(root)
    if delivery == "first-person-lod0": hero = root
    export_root(root, suffix)
reviews(hero)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
for delivery, suffix, _detail in DELIVERIES:
    root = next(item for item in roots if item.get("delivery_variant") == delivery)
    triangles = sum(len(polygon.vertices) - 2 for obj in hierarchy(root) if obj.type == "MESH" for polygon in obj.data.polygons)
    print(f"PASS65_FIELD_KNIFE_{suffix}=READY/{triangles}t")
print(f"BLEND={SOURCE_BLEND}")
