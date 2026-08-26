"""Author the Pass 65 project-original explosive crossbow in Blender 5.1.

The checked-in .blend is the editable source of truth. Six independently built
delivery roots provide two first-person LODs, three world LODs, and one drop
LOD. Runtime projectile authority, fuse timing, sticking, and damage remain in
TypeScript; this file owns presentation geometry, materials, sockets, and clips.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "source-assets/blender/pass65-explosive-crossbow.blend"
RAW_DIR = ROOT / "artifacts/blender-crossbow/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/weapons/pass65-crossbow"
REVIEW_DIR = ROOT / "docs/assets/pass65-weapons/crossbow"
TEXTURE_SIZE = 512
REVIEW_WIDTH = 640
REVIEW_HEIGHT = 480
ASSET_ID = "explosive-crossbow-production-v1"
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
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


def make_texture(name: str, kind: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            cell_x = x % 128
            cell_y = y % 128
            seam = min(cell_x, cell_y, 127 - cell_x, 127 - cell_y) < 3
            weave = ((x * 41 + y * 23 + (x ^ (y * 3)) * 7) % 113) / 112.0
            diagonal = ((x + y * 2) % 74) < 5
            tan_panel = 0.54 < u < 0.78 and 0.12 < v < 0.46
            amber = 0.78 < u < 0.92 and 0.72 < v < 0.90
            if kind == "baseColor":
                graphite = 0.055 + (weave - 0.5) * 0.022
                value = [graphite * 0.88, graphite * 0.97, graphite]
                if seam:
                    value = [0.015, 0.022, 0.025]
                elif tan_panel:
                    value = [0.31 + weave * 0.07, 0.245 + weave * 0.05, 0.145 + weave * 0.035]
                elif diagonal:
                    value = [0.075, 0.105, 0.115]
                if amber:
                    value = [0.95, 0.28, 0.025]
            elif kind == "normal":
                nx = 0.5 + (0.045 if diagonal else -0.018) + (weave - 0.5) * 0.012
                ny = 0.5 + (0.06 if seam else 0.0)
                value = [max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny)), 0.995]
            elif kind == "roughness":
                rough = 0.34 + weave * 0.23
                if tan_panel:
                    rough = 0.66 + weave * 0.12
                if amber:
                    rough = 0.21
                value = [rough, rough, rough]
            elif kind == "metallic":
                metal = 0.86 if not tan_panel else 0.05
                if amber:
                    metal = 0.38
                value = [metal, metal, metal]
            elif kind == "emissive":
                value = [1.0, 0.12, 0.004] if amber else [0.0, 0.0, 0.0]
            else:
                raise RuntimeError(kind)
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "roughness", "metallic"} else "sRGB"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"pass65-crossbow-{kind}.png")
    image.save()
    image.pack()
    return image


def textured_material(name: str, images: dict[str, bpy.types.Image], tint=(1.0, 1.0, 1.0, 1.0), emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = tint
    input_socket(bsdf, "Roughness").default_value = 0.44
    input_socket(bsdf, "Metallic").default_value = 0.78

    for kind, socket_name in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        tex = nodes.new("ShaderNodeTexImage")
        tex.name = f"Pass65 Crossbow {kind}"
        tex.image = images[kind]
        links.new(tex.outputs["Color"], input_socket(bsdf, socket_name))

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "Pass65 Crossbow normal"
    normal_tex.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.58
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))

    if emission > 0:
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.name = "Pass65 Crossbow emissive"
        emissive.image = images["emissive"]
        links.new(emissive.outputs["Color"], input_socket(bsdf, "Emission Color", "Emission"))
        input_socket(bsdf, "Emission Strength").default_value = emission
    return material


def simple_material(name: str, color, metallic: float, roughness: float, emission=None, strength=0.0):
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


def apply_material(obj, material) -> None:
    if obj.type == "MESH":
        obj.data.materials.append(material)


def finish_mesh(obj, material, parent, bevel=0.0, smooth=False):
    obj.name = obj.name.replace(".", "_")
    apply_material(obj, material)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
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
    obj.parent = parent
    return obj


def cube(name, location, dimensions, material, parent, rotation=(0.0, 0.0, 0.0), bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, parent, bevel=bevel)


def cylinder(name, location, radius, depth, material, parent, rotation=(0.0, 0.0, 0.0), vertices=20, bevel=0.004):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, parent, bevel=bevel, smooth=True)


def torus(name, location, major_radius, minor_radius, material, parent, segments=24):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segments, minor_segments=max(6, segments // 4),
        major_radius=major_radius, minor_radius=minor_radius, location=location,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, parent, smooth=True)


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


def curve_tube(name: str, points, radius: float, material, parent, resolution=1):
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, point in enumerate(points):
        spline.points[index].co = (*point, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def limb_mesh(name: str, side: int, material, parent, detail: float):
    points = [
        (0.08 * side, -0.73), (0.28 * side, -0.755),
        (0.51 * side, -0.82), (0.72 * side, -0.91), (0.86 * side, -1.01),
    ]
    widths = [0.07, 0.064, 0.052, 0.041, 0.032]
    thickness = 0.045 if detail > 0.5 else 0.038
    vertices = []
    for index, ((x, y), width) in enumerate(zip(points, widths)):
        if index == 0:
            direction = Vector((points[1][0] - x, points[1][1] - y))
        elif index == len(points) - 1:
            direction = Vector((x - points[index - 1][0], y - points[index - 1][1]))
        else:
            direction = Vector((points[index + 1][0] - points[index - 1][0], points[index + 1][1] - points[index - 1][1]))
        direction.normalize()
        normal = Vector((-direction.y, direction.x)) * width
        for z in (-thickness / 2, thickness / 2):
            vertices.extend(((x + normal.x, y + normal.y, 0.11 + z), (x - normal.x, y - normal.y, 0.11 + z)))
    faces = []
    for index in range(len(points) - 1):
        a = index * 4
        b = (index + 1) * 4
        faces.extend(((a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2),
                      (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)))
    faces.extend(((0, 1, 3, 2), (len(vertices) - 4, len(vertices) - 2, len(vertices) - 1, len(vertices) - 3)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    result = finish_mesh(obj, material, parent, bevel=0.006 if detail > 0.4 else 0.003)
    bpy.ops.object.select_all(action="DESELECT")
    result.select_set(True)
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return result


def add_object_action(obj, clip_name: str, positions=None, rotations=None, scales=None) -> None:
    original_location = obj.location.copy()
    original_rotation = obj.rotation_euler.copy()
    original_scale = obj.scale.copy()
    action = bpy.data.actions.new(f"Crossbow_{clip_name}__{obj.name}")
    obj.animation_data_create()
    obj.animation_data.action = action
    end_frame = 2
    if positions:
        for frame, value in positions:
            end_frame = max(end_frame, frame)
            obj.location = value
            obj.keyframe_insert(data_path="location", frame=frame)
    if rotations:
        obj.rotation_mode = "XYZ"
        for frame, value in rotations:
            end_frame = max(end_frame, frame)
            obj.rotation_euler = value
            obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    if scales:
        for frame, value in scales:
            end_frame = max(end_frame, frame)
            obj.scale = value
            obj.keyframe_insert(data_path="scale", frame=frame)
    track = obj.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = end_frame
    obj.animation_data.action = None
    obj.location = original_location
    obj.rotation_euler = original_rotation
    obj.scale = original_scale


def action_corpus(driver, string, bolt, magazine) -> None:
    rest = driver.location.copy()
    rest_rot = Vector(tuple(driver.rotation_euler))
    motion = {
        "equip": ([(1, rest + Vector((0, 0.22, -0.16))), (8, rest), (14, rest)], None),
        "unequip": ([(1, rest), (8, rest + Vector((0, 0.18, -0.12))), (14, rest + Vector((0, 0.34, -0.28)))], None),
        "idle": ([(1, rest), (24, rest + Vector((0.0, -0.006, 0.004))), (48, rest)], None),
        "walk": ([(1, rest), (8, rest + Vector((0.015, 0, 0.012))), (16, rest + Vector((-0.015, 0, -0.004))), (24, rest)], None),
        "sprint": ([(1, rest), (7, rest + Vector((0.035, 0.08, -0.05))), (14, rest + Vector((-0.025, 0.04, -0.02))), (21, rest)], [(1, rest_rot), (11, rest_rot + Vector((0.14, -0.06, -0.22))), (21, rest_rot)]),
        "ads-in": ([(1, rest), (10, rest + Vector((-0.02, -0.035, 0.025)))], None),
        "ads-out": ([(1, rest + Vector((-0.02, -0.035, 0.025))), (10, rest)], None),
        "fire": ([(1, rest), (2, rest + Vector((0, 0.07, 0.018))), (7, rest)], [(1, rest_rot), (2, rest_rot + Vector((-0.025, 0, 0.012))), (7, rest_rot)]),
        "dry-fire": ([(1, rest), (2, rest + Vector((0, 0.016, 0.003))), (5, rest)], None),
        "reload": ([(1, rest), (12, rest + Vector((0.08, 0.12, -0.08))), (28, rest)], [(1, rest_rot), (12, rest_rot + Vector((0.18, -0.08, 0.24))), (28, rest_rot)]),
        "empty-reload": ([(1, rest), (16, rest + Vector((0.1, 0.16, -0.1))), (36, rest)], [(1, rest_rot), (16, rest_rot + Vector((0.24, -0.1, 0.3))), (36, rest_rot)]),
        "melee": ([(1, rest), (7, rest + Vector((-0.24, -0.18, 0.08))), (15, rest)], [(1, rest_rot), (7, rest_rot + Vector((-0.28, -0.5, 0.58))), (15, rest_rot)]),
        "inspect": ([(1, rest), (24, rest + Vector((0.06, 0.08, 0.05))), (48, rest)], [(1, rest_rot), (24, rest_rot + Vector((0.14, 0.38, -0.18))), (48, rest_rot)]),
    }
    for clip in CORE_ACTIONS:
        positions, rotations = motion[clip]
        add_object_action(driver, clip, positions=positions, rotations=rotations)
    add_object_action(string, "fire", scales=[(1, Vector((1, 1, 1))), (2, Vector((0.74, 1, 1))), (6, Vector((1, 1, 1)))])
    add_object_action(bolt, "fire", positions=[(1, bolt.location.copy()), (2, bolt.location + Vector((0, -0.22, 0))), (4, bolt.location + Vector((0, -1.8, 0)))])
    add_object_action(bolt, "reload", positions=[(1, bolt.location + Vector((0, 0.72, 0.08))), (18, bolt.location.copy()), (28, bolt.location.copy())])
    add_object_action(bolt, "empty-reload", positions=[(1, bolt.location + Vector((0, 0.85, 0.12))), (25, bolt.location.copy()), (36, bolt.location.copy())])
    add_object_action(magazine, "reload", positions=[(1, magazine.location.copy()), (12, magazine.location + Vector((0, 0.1, -0.32))), (22, magazine.location.copy()), (28, magazine.location.copy())])


def build_crossbow(label: str, detail: float, variant: str):
    root = empty(f"Pass65Crossbow_{label}", (0, 0, 0), None)
    # Blender's +Y exports to glTF -Z. Geometry is authored toward Blender -Y
    # for convenient top/front modeling, so rotate the delivery root once and
    # make the declared runtime axis physically true for every socket and mesh.
    root.rotation_euler.z = math.pi
    root["asset_id"] = ASSET_ID
    root["creator"] = "Atomic Acres project"
    root["license"] = "Project-original"
    root["delivery_variant"] = variant
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "-Y rotated to +Y at delivery root"
    root["optic_magnification"] = 1.5
    root["presentation_only"] = True

    segments = 32 if detail >= 0.9 else 24 if detail >= 0.6 else 14
    driver = empty("crossbow-action-driver", (0, 0, 0), root, "animation-root")
    chassis = empty("crossbow-chassis", (0, 0, 0), driver, "chassis")

    cube(f"Crossbow_Receiver_{label}", (0, -0.25, 0.02), (0.25, 0.78, 0.22), materials["armor"], chassis, bevel=0.025)
    cube(f"Crossbow_TopRail_{label}", (0, -0.47, 0.18), (0.105, 0.88, 0.055), materials["metal"], chassis, bevel=0.008)
    cube(f"Crossbow_BoltChannel_{label}", (0, -0.68, 0.215), (0.04, 1.25, 0.028), materials["dark"], chassis, bevel=0.004)
    cube(f"Crossbow_Riser_{label}", (0, -0.79, 0.08), (0.28, 0.17, 0.25), materials["metal"], chassis, bevel=0.028)
    cube(f"Crossbow_RearDeck_{label}", (0, 0.26, 0.07), (0.24, 0.38, 0.16), materials["armor"], chassis, rotation=(math.radians(2), 0, 0), bevel=0.024)
    cube(f"Crossbow_StockSpine_{label}", (0, 0.49, 0.025), (0.18, 0.44, 0.13), materials["dark"], chassis, rotation=(math.radians(-4), 0, 0), bevel=0.028)
    cube(f"Crossbow_CheekPad_{label}", (0, 0.57, 0.13), (0.22, 0.3, 0.09), materials["tan"], chassis, bevel=0.026)
    cube(f"Crossbow_ButtPad_{label}", (0, 0.75, 0.015), (0.25, 0.08, 0.23), materials["rubber"], chassis, rotation=(math.radians(-7), 0, 0), bevel=0.035)

    grip = cube(f"Crossbow_Grip_{label}", (0, 0.09, -0.2), (0.19, 0.26, 0.38), materials["tan"], chassis, rotation=(math.radians(-17), 0, 0), bevel=0.04)
    grip["semantic_part"] = "rightGrip"
    cube(f"Crossbow_TriggerGuard_{label}", (0, -0.045, -0.105), (0.19, 0.2, 0.045), materials["metal"], chassis, bevel=0.018)
    trigger = cube(f"Crossbow_Trigger_{label}", (0, -0.09, -0.135), (0.035, 0.045, 0.12), materials["accent"], chassis, rotation=(math.radians(-12), 0, 0), bevel=0.008)
    trigger["semantic_part"] = "trigger"
    foregrip = cube(f"Crossbow_Foregrip_{label}", (0, -0.58, -0.135), (0.22, 0.27, 0.25), materials["rubber"], chassis, rotation=(math.radians(7), 0, 0), bevel=0.038)
    foregrip["semantic_part"] = "leftGrip"
    magazine = cube(f"Crossbow_BoltCassette_{label}", (0, -0.31, -0.19), (0.2, 0.32, 0.24), materials["tan"], chassis, rotation=(math.radians(8), 0, 0), bevel=0.028)
    magazine.name = "crossbow-magazine"
    magazine["semantic_part"] = "magazine"

    limb_mesh(f"Crossbow_Limb_Left_{label}", -1, materials["carbon"], chassis, detail)
    limb_mesh(f"Crossbow_Limb_Right_{label}", 1, materials["carbon"], chassis, detail)
    for side in (-1, 1):
        torus(f"Crossbow_Cam_{'L' if side < 0 else 'R'}_{label}", (side * 0.86, -1.01, 0.11), 0.105, 0.018, materials["metal"], chassis, segments=segments)
        cylinder(f"Crossbow_CamHub_{side}_{label}", (side * 0.86, -1.01, 0.11), 0.032, 0.065, materials["accent"], chassis, vertices=max(10, segments // 2))
        if detail >= 0.55:
            for spoke in range(4):
                angle = spoke * math.pi / 2
                cube(
                    f"Crossbow_CamSpoke_{side}_{spoke}_{label}",
                    (side * 0.86 + math.cos(angle) * 0.045, -1.01 + math.sin(angle) * 0.045, 0.11),
                    (0.085, 0.016, 0.014), materials["metal"], chassis,
                    rotation=(0, 0, angle), bevel=0.003,
                )

    string = curve_tube(
        "crossbow-string",
        [(-0.86, -1.01, 0.11), (-0.62, -0.91, 0.11), (0, -0.18, 0.13), (0.62, -0.91, 0.11), (0.86, -1.01, 0.11)],
        0.006 if detail >= 0.6 else 0.008, materials["string"], chassis,
    )
    string["semantic_part"] = "string"

    bolt = empty("crossbow-loaded-bolt", (0, 0, 0), chassis, "bolt")
    cylinder(f"Crossbow_BoltShaft_{label}", (0, -0.79, 0.25), 0.014, 1.1, materials["bolt"], bolt, rotation=(math.pi / 2, 0, 0), vertices=max(10, segments // 2), bevel=0.002)
    bpy.ops.mesh.primitive_cone_add(vertices=max(10, segments // 2), radius1=0.035, radius2=0.006, depth=0.11, location=(0, -1.38, 0.25), rotation=(math.pi / 2, 0, 0))
    tip = finish_mesh(bpy.context.object, materials["accent"], bolt, bevel=0.002, smooth=True)
    tip.name = f"Crossbow_ExplosiveTip_{label}"
    for side in (-1, 1):
        cube(f"Crossbow_BoltFletching_{side}_{label}", (side * 0.022, -0.27, 0.25), (0.04, 0.12, 0.045), materials["accent"], bolt, rotation=(0, side * math.radians(12), 0), bevel=0.004)

    optic = empty("crossbow-compact-optic-1_5x", (0, 0, 0), chassis, "optic")
    optic["magnification"] = 1.5
    cylinder(f"Crossbow_OpticBody_{label}", (0, -0.29, 0.34), 0.075, 0.3, materials["metal"], optic, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.008)
    cylinder(f"Crossbow_OpticFrontLens_{label}", (0, -0.445, 0.34), 0.061, 0.012, materials["lens"], optic, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002)
    cylinder(f"Crossbow_OpticRearLens_{label}", (0, -0.135, 0.34), 0.056, 0.012, materials["lens"], optic, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002)
    cube(f"Crossbow_OpticMount_{label}", (0, -0.29, 0.245), (0.12, 0.15, 0.1), materials["metal"], optic, bevel=0.012)
    cylinder(f"Crossbow_OpticDial_{label}", (0.085, -0.29, 0.37), 0.025, 0.04, materials["accent"], optic, rotation=(0, math.pi / 2, 0), vertices=max(10, segments // 2), bevel=0.003)
    reticle = curve_tube("crossbow-optic-reticle", [(-0.022, -0.453, 0.34), (0.022, -0.453, 0.34)], 0.0025, materials["emissive"], optic)
    reticle["reticle"] = "illuminated-crosshair"
    curve_tube("crossbow-optic-reticle-vertical", [(0, -0.453, 0.318), (0, -0.453, 0.362)], 0.0025, materials["emissive"], optic)

    if detail >= 0.55:
        for side in (-1, 1):
            cube(f"Crossbow_RiserBrace_{side}_{label}", (side * 0.17, -0.71, 0.025), (0.08, 0.35, 0.065), materials["metal"], chassis, rotation=(0, 0, side * math.radians(18)), bevel=0.012)
            cube(f"Crossbow_ReceiverPanel_{side}_{label}", (side * 0.132, -0.28, 0.04), (0.018, 0.52, 0.13), materials["tan"], chassis, bevel=0.008)
        for index in range(7 if detail > 0.8 else 4):
            cylinder(f"Crossbow_RailScrew_{index}_{label}", (0.057, -0.15 - index * 0.095, 0.205), 0.009, 0.01, materials["accent"], chassis, rotation=(0, math.pi / 2, 0), vertices=10, bevel=0.001)
        cube(f"Crossbow_SafetySelector_{label}", (-0.135, -0.03, 0.04), (0.025, 0.09, 0.06), materials["accent"], chassis, bevel=0.008)
        cube(f"Crossbow_CableGuard_{label}", (0, -0.88, -0.015), (0.12, 0.55, 0.04), materials["dark"], chassis, bevel=0.008)

    sockets = {
        "grip-socket-r": ((0.0, 0.08, -0.22), "rightGrip"),
        "support-socket-l": ((-0.02, -0.59, -0.16), "leftGrip"),
        "reload-socket-l": ((-0.14, -0.31, -0.2), "reload"),
        "magazine-socket": ((0.0, -0.31, -0.19), "magazine"),
        "muzzle-socket": ((0.0, -1.45, 0.25), "muzzle"),
        "eject-socket": ((0.12, -0.2, 0.12), "eject"),
        "optic-socket": ((0.0, -0.29, 0.34), "optic"),
        "rear-sight-socket": ((0.0, -0.13, 0.34), "sight-rear"),
        "front-sight-socket": ((0.0, -0.45, 0.34), "sight-front"),
    }
    for socket_name, (position, semantic) in sockets.items():
        empty(socket_name, position, root, semantic)
    action_corpus(driver, string, bolt, magazine)
    return root


def hierarchy(root):
    return [root, *root.children_recursive]


def export_root(root, output_name: str) -> None:
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


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(hero_root) -> None:
    for root in delivery_roots:
        visible = root == hero_root
        for obj in hierarchy(root):
            obj.hide_render = not visible
            obj.hide_viewport = not visible
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.44))
    stage = bpy.context.object
    stage.name = "Crossbow_Review_Stage"
    apply_material(stage, materials["stage"])
    for name, location, energy, color, size in (
        ("Crossbow_Key", (-3.1, -2.4, 3.5), 1200, (0.50, 0.75, 1.0), 2.1),
        ("Crossbow_Rim", (3.2, 0.7, 2.7), 1000, (1.0, 0.24, 0.045), 1.8),
        ("Crossbow_Fill", (0.2, 3.6, 1.5), 650, (0.28, 0.45, 0.72), 2.4),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, -0.25, 0.05))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Crossbow_Review_Camera"
    camera.data.lens = 58
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_WIDTH
    scene.render.resolution_y = REVIEW_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.011)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_set(1)
    views = (
        ("hero-quarter", (2.45, 2.55, 1.45), (0, -0.25, 0.04), 58),
        ("top-silhouette", (0.0, -0.15, 4.1), (0, -0.28, 0.03), 62),
        ("optic-closeup", (1.05, 0.72, 0.72), (0, -0.28, 0.31), 76),
        ("limb-string-profile", (-2.5, -0.35, 0.82), (0, -0.55, 0.08), 58),
    )
    rendered = []
    for label, location, target, lens in views:
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"pass65-crossbow-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)
    images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet = bpy.data.images.new("Pass65_Crossbow_Contact_Sheet", REVIEW_WIDTH * 2, REVIEW_HEIGHT * 2, alpha=True)
    pixels = [0.0] * (REVIEW_WIDTH * 2 * REVIEW_HEIGHT * 2 * 4)
    for index, image in enumerate(images):
        source = list(image.pixels[:])
        tile_x = (index % 2) * REVIEW_WIDTH
        tile_y = (1 - index // 2) * REVIEW_HEIGHT
        for row in range(REVIEW_HEIGHT):
            source_start = row * REVIEW_WIDTH * 4
            target_start = ((tile_y + row) * REVIEW_WIDTH * 2 + tile_x) * 4
            pixels[target_start:target_start + REVIEW_WIDTH * 4] = source[source_start:source_start + REVIEW_WIDTH * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / "pass65-crossbow-contact-sheet.png")
    sheet.save()


reset()
images = {kind: make_texture(f"Pass65_Crossbow_{kind}", kind) for kind in ("baseColor", "normal", "roughness", "metallic", "emissive")}
materials = {
    "armor": textured_material("MAT_Pass65_Crossbow_Armor_PBR", images, emission=0.55),
    "carbon": textured_material("MAT_Pass65_Crossbow_Carbon_PBR", images, tint=(0.58, 0.66, 0.7, 1)),
    "metal": simple_material("MAT_Pass65_Crossbow_Gunmetal", (0.045, 0.058, 0.064, 1), 0.92, 0.25),
    "dark": simple_material("MAT_Pass65_Crossbow_Black", (0.012, 0.018, 0.02, 1), 0.55, 0.54),
    "tan": simple_material("MAT_Pass65_Crossbow_Tan", (0.34, 0.265, 0.15, 1), 0.08, 0.72),
    "rubber": simple_material("MAT_Pass65_Crossbow_Rubber", (0.018, 0.022, 0.021, 1), 0.0, 0.92),
    "accent": simple_material("MAT_Pass65_Crossbow_Amber", (0.78, 0.18, 0.025, 1), 0.42, 0.31),
    "string": simple_material("MAT_Pass65_Crossbow_String", (0.22, 0.24, 0.23, 1), 0.15, 0.58),
    "bolt": simple_material("MAT_Pass65_Crossbow_Bolt", (0.11, 0.13, 0.12, 1), 0.68, 0.28),
    "lens": simple_material("MAT_Pass65_Crossbow_OpticLens", (0.025, 0.12, 0.16, 1), 0.25, 0.08, (0.0, 0.42, 0.72, 1), 1.8),
    "emissive": simple_material("MAT_Pass65_Crossbow_Reticle", (1.0, 0.12, 0.01, 1), 0.05, 0.18, (1.0, 0.04, 0.0, 1), 7.0),
    "stage": simple_material("MAT_Pass65_Weapon_ReviewStage", (0.012, 0.017, 0.023, 1), 0.1, 0.6),
}

delivery_specs = (
    ("FP_LOD0", 1.0, "first-person-lod0", "pass65-crossbow-fp-lod0"),
    ("FP_LOD1", 0.7, "first-person-lod1", "pass65-crossbow-fp-lod1"),
    ("WORLD_LOD0", 0.86, "world-lod0", "pass65-crossbow-world-lod0"),
    ("WORLD_LOD1", 0.56, "world-lod1", "pass65-crossbow-world-lod1"),
    ("WORLD_LOD2", 0.28, "world-lod2", "pass65-crossbow-world-lod2"),
    ("DROP_LOD0", 0.63, "drop-lod0", "pass65-crossbow-drop-lod0"),
)
delivery_roots = []
for label, detail, variant, output_name in delivery_specs:
    delivery_root = build_crossbow(label, detail, variant)
    delivery_roots.append(delivery_root)
    export_root(delivery_root, output_name)

render_reviews(delivery_roots[0])
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
for label, _detail, variant, _output_name in delivery_specs:
    root = next(candidate for candidate in delivery_roots if candidate.get("delivery_variant") == variant)
    meshes = [obj for obj in hierarchy(root) if obj.type == "MESH"]
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    print(f"PASS65_CROSSBOW_{label}_READY meshes={len(meshes)} triangles={triangles}")
print(f"BLEND={SOURCE_BLEND}")
print(f"RAW_DIR={RAW_DIR}")
print(f"REVIEW={REVIEW_DIR / 'pass65-crossbow-contact-sheet.png'}")
