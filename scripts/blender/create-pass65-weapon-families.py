"""Author the seventeen Pass 65 firearm families as project-original Blender assets.

The checked-in specification controls identity, real display names, silhouette
budgets and required platform details. Six independently built delivery roots
per weapon provide two first-person and three world LODs. Gameplay ballistics,
authority and damage remain TypeScript-owned; this source owns presentation
geometry, PBR materials, sockets and the core action corpus. A comma-separated
PASS65_WEAPON_PREVIEW_IDS environment value provides a bounded authoring-only
preview without replacing the production source blend.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pass65_weapon_production_geometry import build_platform


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "source-assets/blender/pass65-weapon-family-specs.json"
RAW_DIR = ROOT / "artifacts/blender-weapon-families/raw"
MODEL_DIR = ROOT / "public/assets/original/models/weapons/pass65-firearms"
TEXTURE_ROOT = ROOT / "public/assets/original/textures/weapons/pass65-firearms"
REVIEW_ROOT = ROOT / "docs/assets/pass65-weapons/firearms"
TEXTURE_SIZE = 512
REVIEW_WIDTH = 480
REVIEW_HEIGHT = 360
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
)

SPEC = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
PREVIEW_IDS = tuple(value.strip() for value in os.environ.get("PASS65_WEAPON_PREVIEW_IDS", "").split(",") if value.strip())
known_ids = {weapon["id"] for weapon in SPEC["weapons"]}
unknown_preview_ids = sorted(set(PREVIEW_IDS) - known_ids)
if unknown_preview_ids:
    raise RuntimeError(f"Unknown PASS65_WEAPON_PREVIEW_IDS: {', '.join(unknown_preview_ids)}")
WEAPONS = [weapon for weapon in SPEC["weapons"] if not PREVIEW_IDS or weapon["id"] in PREVIEW_IDS]
if PREVIEW_IDS == ("m4a1",):
    # The one-anchor production gate needs enough pixels to judge receiver
    # controls, rail machining and material response before corpus expansion.
    REVIEW_WIDTH = 720
    REVIEW_HEIGHT = 480
SOURCE_BLEND = (
    ROOT / "artifacts/blender-weapon-families/pass65-weapon-families-preview.blend"
    if PREVIEW_IDS else ROOT / "source-assets/blender/pass65-weapon-families.blend"
)
DELIVERIES = SPEC["deliveries"]
preview_delivery_suffixes = tuple(
    value.strip()
    for value in os.environ.get("PASS65_WEAPON_PREVIEW_DELIVERY_SUFFIXES", "").split(",")
    if value.strip()
)
if preview_delivery_suffixes:
    if not PREVIEW_IDS:
        raise RuntimeError("PASS65_WEAPON_PREVIEW_DELIVERY_SUFFIXES is preview-only")
    known_delivery_suffixes = {delivery["suffix"] for delivery in DELIVERIES}
    unknown_delivery_suffixes = sorted(set(preview_delivery_suffixes) - known_delivery_suffixes)
    if unknown_delivery_suffixes:
        raise RuntimeError(
            f"Unknown PASS65_WEAPON_PREVIEW_DELIVERY_SUFFIXES: {', '.join(unknown_delivery_suffixes)}"
        )
    DELIVERIES = [
        delivery for delivery in DELIVERIES
        if delivery["suffix"] in preview_delivery_suffixes
    ]

for directory in (SOURCE_BLEND.parent, RAW_DIR, MODEL_DIR, TEXTURE_ROOT, REVIEW_ROOT):
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


def hex_rgb(value: str) -> tuple[float, float, float]:
    return tuple(int(value[index:index + 2], 16) / 255.0 for index in (0, 2, 4))


def mix_rgb(first, second, amount: float):
    return tuple(first[index] * (1.0 - amount) + second[index] * amount for index in range(3))


def make_texture(spec, kind: str) -> bpy.types.Image:
    weapon_id = spec["id"]
    directory = TEXTURE_ROOT / weapon_id
    directory.mkdir(parents=True, exist_ok=True)
    seed = sum((index + 1) * ord(character) for index, character in enumerate(weapon_id))
    primary = hex_rgb(spec["primary"])
    accent = hex_rgb(spec["accent"])
    polymer = hex_rgb(spec["polymer"])
    image = bpy.data.images.new(
        f"Pass65_{weapon_id}_{kind}", width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True,
    )
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            grain = ((x * (19 + seed % 17) + y * (31 + seed % 23) + (x ^ y) * 7 + seed) % 211) / 210.0
            brushed = ((y * 5 + seed) % 113) / 112.0
            machining = ((x * 11 + y * 3 + seed) % 181) / 180.0
            panel = (0.08 < u < 0.46 and 0.55 < v < 0.91) or (0.61 < u < 0.9 and 0.12 < v < 0.42)
            seam = min(x % 128, y % 128, 127 - x % 128, 127 - y % 128) < 2
            hairline = ((x * 17 + y * 73 + seed) % 997) < 3
            if kind in {"baseColor", "polymerBaseColor"}:
                source = polymer if kind == "polymerBaseColor" else primary
                # Subtle manufactured breakup, not high-amplitude noise that
                # makes anodized aluminium resemble leather or stone.
                variance = (0.76 if kind == "polymerBaseColor" else 0.84) + grain * 0.055 + brushed * 0.018
                value = [min(1.0, component * variance) for component in source]
                if seam:
                    value = [component * 0.84 for component in value]
                if hairline and kind == "baseColor":
                    value = [min(1.0, component + 0.018) for component in value]
            elif kind == "normal":
                nx = 0.5 + (machining - 0.5) * (0.018 if panel else 0.009)
                ny = 0.5 + (0.022 if seam else (grain - 0.5) * 0.01)
                value = [nx, ny, 0.998]
            elif kind in {"roughness", "polymerRoughness"}:
                if kind == "polymerRoughness":
                    rough = 0.72 + grain * 0.15
                else:
                    rough = (0.48 if panel else 0.36) + grain * (0.12 if panel else 0.1)
                if seam:
                    rough = min(1.0, rough + 0.08)
                value = [rough, rough, rough]
            elif kind in {"metallic", "polymerMetallic"}:
                metal = (0.015 + grain * 0.018) if kind == "polymerMetallic" else (0.8 + grain * 0.12)
                value = [metal, metal, metal]
            else:
                raise RuntimeError(kind)
            offset = (y * TEXTURE_SIZE + x) * 4
            pixels[offset:offset + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {
        "normal", "roughness", "metallic", "polymerRoughness", "polymerMetallic",
    } else "sRGB"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(directory / f"{weapon_id}-{kind}.png")
    image.save()
    image.pack()
    return image


def textured_material(name: str, images, tint=(1.0, 1.0, 1.0, 1.0), roughness=0.42, metallic=0.72):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = tint
    input_socket(bsdf, "Roughness").default_value = roughness
    input_socket(bsdf, "Metallic").default_value = metallic
    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = f"{name}_{kind}"
        texture.image = images[kind]
        links.new(texture.outputs["Color"], input_socket(bsdf, target))
    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = f"{name}_normal"
    normal_texture.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = f"{name}_normal_map"
    normal_map.inputs["Strength"].default_value = 0.28
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
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


def finish_mesh(obj, material, parent, bevel=0.0, smooth=False, canonical=None, weighted_normals=True):
    obj.name = canonical or obj.name.replace(".", "_")
    obj.data.materials.append(material)
    if canonical:
        obj["canonical_node_name"] = canonical
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.harden_normals = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Weighted split normals keep the large forged faces visually planar
        # while allowing the authored bevels to catch highlights in first
        # person. This is part of the production hard-surface contract, not a
        # render-only smooth-shading shortcut.
        if weighted_normals:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
            try:
                weighted = obj.modifiers.new("Production weighted normals", "WEIGHTED_NORMAL")
                weighted.keep_sharp = True
                weighted.weight = 60
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=weighted.name)
            except (RuntimeError, TypeError, AttributeError):
                # Blender 5.x may replace this legacy modifier with its built-in
                # smooth-by-angle path. Beveled geometry remains valid either way.
                pass
    triangulate = obj.modifiers.new("Release triangulation", "TRIANGULATE")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.parent = parent
    obj["opaque_release_mesh"] = True
    return obj


def cube(name, location, dimensions, material, parent, rotation=(0.0, 0.0, 0.0), bevel=0.012, canonical=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, parent, bevel=bevel, canonical=canonical)


def profiled_prism(name, rings, material, parent, chamfer=0.14, bevel=0.004, weighted_normals=True):
    """Manufactured multi-ring receiver/chassis with chamfered, non-box cross-sections."""
    vertices = []
    around = (
        (-1.0 + chamfer, -1.0), (1.0 - chamfer, -1.0),
        (1.0, -1.0 + chamfer), (1.0, 1.0 - chamfer),
        (1.0 - chamfer, 1.0), (-1.0 + chamfer, 1.0),
        (-1.0, 1.0 - chamfer), (-1.0, -1.0 + chamfer),
    )
    for y, width, height, center_z in rings:
        for side, up in around:
            vertices.append((side * width * 0.5, y, center_z + up * height * 0.5))
    faces = []
    for ring_index in range(len(rings) - 1):
        ring = ring_index * len(around)
        next_ring = (ring_index + 1) * len(around)
        for index in range(len(around)):
            next_index = (index + 1) % len(around)
            faces.append((ring + index, ring + next_index, next_ring + next_index, next_ring + index))
    faces.append(tuple(reversed(range(len(around)))))
    final_ring = (len(rings) - 1) * len(around)
    faces.append(tuple(final_ring + index for index in range(len(around))))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            ring_index = min(len(rings) - 1, vertex_index // len(around))
            around_index = vertex_index % len(around)
            uv_layer.data[loop_index].uv = (
                around_index / len(around),
                ring_index / max(1, len(rings) - 1),
            )
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, parent, bevel=bevel, weighted_normals=weighted_normals)


def cylinder(name, location, radius, depth, material, parent, rotation=(0.0, 0.0, 0.0), vertices=18, bevel=0.004, canonical=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    # Blender's bevel modifier can paradoxically create more triangles on an
    # eight-sided cylinder than on the twelve-sided middle LOD. Low deliveries
    # therefore use their authored silhouette directly, preserving strict LOD
    # monotonicity instead of relying on optimizer side effects.
    if vertices <= 8:
        bevel = 0.0
    return finish_mesh(obj, material, parent, bevel=bevel, smooth=True, canonical=canonical)


def cylinder_between(name, start, end, radius, material, parent, vertices=18, bevel=0.002):
    """Create a round manufactured strut between arbitrary 3D endpoints."""
    start_vector = Vector(start)
    end_vector = Vector(end)
    delta = end_vector - start_vector
    midpoint = (start_vector + end_vector) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=delta.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, parent, bevel=bevel, smooth=True)


def profiled_box_z(name, rings, material, parent, chamfer=0.14, bevel=0.004, weighted_normals=True):
    """Manufactured box profile along Z for magazines and vertical controls."""
    vertices = []
    around = (
        (-1.0 + chamfer, -1.0), (1.0 - chamfer, -1.0),
        (1.0, -1.0 + chamfer), (1.0, 1.0 - chamfer),
        (1.0 - chamfer, 1.0), (-1.0 + chamfer, 1.0),
        (-1.0, 1.0 - chamfer), (-1.0, -1.0 + chamfer),
    )
    for z, width, depth, center_y in rings:
        for side, forward in around:
            vertices.append((side * width * 0.5, center_y + forward * depth * 0.5, z))
    faces = []
    for ring_index in range(len(rings) - 1):
        ring = ring_index * len(around)
        next_ring = (ring_index + 1) * len(around)
        for index in range(len(around)):
            next_index = (index + 1) % len(around)
            faces.append((ring + index, ring + next_index, next_ring + next_index, next_ring + index))
    faces.append(tuple(reversed(range(len(around)))))
    final_ring = (len(rings) - 1) * len(around)
    faces.append(tuple(final_ring + index for index in range(len(around))))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            ring_index = min(len(rings) - 1, vertex_index // len(around))
            around_index = vertex_index % len(around)
            uv_layer.data[loop_index].uv = (
                around_index / len(around),
                ring_index / max(1, len(rings) - 1),
            )
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, parent, bevel=bevel, weighted_normals=weighted_normals)


def torus(name, location, major_radius, minor_radius, material, parent, rotation=(0.0, 0.0, 0.0), segments=18, canonical=None):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segments, minor_segments=max(6, segments // 3),
        major_radius=major_radius, minor_radius=minor_radius,
        location=location, rotation=rotation,
    )
    return finish_mesh(bpy.context.object, material, parent, smooth=True, canonical=canonical)


def empty(name, location, parent, semantic=None, canonical=True):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.045
    obj.location = location
    obj.parent = parent
    if canonical:
        obj["canonical_node_name"] = name
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def consolidate_runtime_meshes(root, frame, action_part, magazine, asset_label):
    """Batch rigid authored detail by material and animation ownership.

    Sockets and signature empties remain named nodes. Only the bolt/charging
    action group and removable magazine retain independent transforms; every
    other rigid detail is baked into a small material batch. This prevents a
    visually detailed first-person asset from becoming a draw-call bomb.
    """
    groups = {}
    for obj in list(root.children_recursive):
        if obj.type != "MESH":
            continue
        owner = frame
        ancestor = obj.parent
        while ancestor is not None and ancestor != root:
            if ancestor == magazine:
                owner = magazine
                break
            if ancestor == action_part:
                owner = action_part
                break
            ancestor = ancestor.parent
        material = obj.data.materials[0] if obj.data.materials else None
        material_name = material.name if material else "unassigned"
        owner_label = "magazine" if owner == magazine else "action" if owner == action_part else "static"
        groups.setdefault((owner_label, material_name), {"owner": owner, "objects": []})["objects"].append(obj)

    consolidated = []
    for (owner_label, material_name), group in sorted(groups.items()):
        objects = group["objects"]
        if not objects:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        world_matrix = active.matrix_world.copy()
        active.parent = group["owner"]
        active.matrix_world = world_matrix
        safe_material = "".join(character if character.isalnum() else "_" for character in material_name)
        active.name = f"{asset_label}_Runtime_{owner_label}_{safe_material}"
        active["runtime_material_batch"] = material_name
        active["runtime_transform_owner"] = owner_label
        active["opaque_release_mesh"] = True
        bpy.context.view_layer.objects.active = active
        try:
            bpy.ops.object.material_slot_remove_unused()
        except RuntimeError:
            pass
        consolidated.append(active)
    return consolidated


def apply_delivery_lod_reduction(runtime_meshes, weapon_id, delivery):
    """Make authored delivery detail monotonic without touching the hero mesh.

    Hard-surface bevel topology can make an 18-sided intermediate cylinder
    marginally denser than its 24-sided hero counterpart, and an un-beveled
    eight-sided island can occasionally survive with more triangles than a
    beveled twelve-sided island after rigid batching.  The delivery contract is
    about the shipped result, so simplify only the non-hero FP delivery and the
    far-world delivery after batching.  M4A1 is the separately accepted anchor
    and already satisfies the contract byte-for-byte.
    """
    if weapon_id == "m4a1":
        return
    ratio = {
        "first-person-lod1": 0.82,
        # The P90's continuous bullpup/thumbhole polymer shell contains more
        # disconnected hard-surface islands in its un-bevelled eight-sided
        # source than in the middle delivery.  Give that far-world shell a
        # deliberate reduction margin; otherwise it can remain denser than
        # world-lod1 even though every cylindrical source segment decreased.
        "world-lod2": 0.62 if weapon_id == "smg" else 0.78,
    }.get(delivery["variant"])
    if ratio is None:
        return
    for mesh in runtime_meshes:
        if mesh.type != "MESH" or len(mesh.data.polygons) < 24:
            continue
        bpy.context.view_layer.objects.active = mesh
        modifier = mesh.modifiers.new("Authored delivery LOD reduction", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        triangulate = mesh.modifiers.new("Release triangulation after LOD", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=triangulate.name)


def add_object_action(obj, weapon_id: str, clip_name: str, positions=None, rotations=None, scales=None):
    original_location = obj.location.copy()
    original_rotation = obj.rotation_euler.copy()
    original_scale = obj.scale.copy()
    action = bpy.data.actions.new(f"Pass65_{weapon_id}_{clip_name}__{obj.name}")
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


def action_corpus(driver, action_part, magazine, spec):
    weapon_id = spec["id"]
    scale = spec["motionScale"]
    rest = driver.location.copy()
    rest_rot = Vector(tuple(driver.rotation_euler))
    motion = {
        "equip": ([(1, rest + Vector((0, 0.18 * scale, -0.13 * scale))), (9, rest), (15, rest)], None),
        "unequip": ([(1, rest), (8, rest + Vector((0, 0.16 * scale, -0.11 * scale))), (15, rest + Vector((0, 0.31 * scale, -0.24 * scale)))], None),
        "idle": ([(1, rest), (24, rest + Vector((0, -0.005 * scale, 0.004 * scale))), (48, rest)], None),
        "walk": ([(1, rest), (8, rest + Vector((0.014 * scale, 0, 0.011 * scale))), (16, rest + Vector((-0.014 * scale, 0, -0.004 * scale))), (24, rest)], None),
        "sprint": ([(1, rest), (8, rest + Vector((0.035 * scale, 0.07 * scale, -0.045 * scale))), (15, rest + Vector((-0.025 * scale, 0.04 * scale, -0.02 * scale))), (22, rest)], [(1, rest_rot), (11, rest_rot + Vector((0.12 * scale, -0.055 * scale, -0.2 * scale))), (22, rest_rot)]),
        "ads-in": ([(1, rest), (10, rest + Vector((-0.018 * scale, -0.03 * scale, 0.022 * scale)))], None),
        "ads-out": ([(1, rest + Vector((-0.018 * scale, -0.03 * scale, 0.022 * scale))), (10, rest)], None),
        "fire": ([(1, rest), (2, rest + Vector((0, 0.055 * scale, 0.016 * scale))), (7, rest)], [(1, rest_rot), (2, rest_rot + Vector((-0.022 * scale, 0, 0.01 * scale))), (7, rest_rot)]),
        "dry-fire": ([(1, rest), (2, rest + Vector((0, 0.012 * scale, 0.002 * scale))), (5, rest)], None),
        "reload": ([(1, rest), (13, rest + Vector((0.075 * scale, 0.1 * scale, -0.07 * scale))), (30, rest)], [(1, rest_rot), (13, rest_rot + Vector((0.16 * scale, -0.07 * scale, 0.2 * scale))), (30, rest_rot)]),
        "empty-reload": ([(1, rest), (17, rest + Vector((0.09 * scale, 0.14 * scale, -0.085 * scale))), (38, rest)], [(1, rest_rot), (17, rest_rot + Vector((0.21 * scale, -0.09 * scale, 0.27 * scale))), (38, rest_rot)]),
        "melee": ([(1, rest), (8, rest + Vector((-0.21 * scale, -0.16 * scale, 0.07 * scale))), (16, rest)], [(1, rest_rot), (8, rest_rot + Vector((-0.25 * scale, -0.43 * scale, 0.5 * scale))), (16, rest_rot)]),
        "inspect": ([(1, rest), (25, rest + Vector((0.055 * scale, 0.075 * scale, 0.045 * scale))), (50, rest)], [(1, rest_rot), (25, rest_rot + Vector((0.12 * scale, 0.33 * scale, -0.16 * scale))), (50, rest_rot)]),
    }
    for clip in CORE_ACTIONS:
        positions, rotations = motion[clip]
        add_object_action(driver, weapon_id, clip, positions=positions, rotations=rotations)

    action_rest = action_part.location.copy()
    action_rot = Vector(tuple(action_part.rotation_euler))
    if spec["actionStyle"] == "rotary":
        add_object_action(action_part, weapon_id, "fire", rotations=[(1, action_rot), (3, action_rot + Vector((0, math.tau, 0))), (7, action_rot + Vector((0, math.tau * 2, 0)))])
    elif spec["actionStyle"] == "coil":
        add_object_action(action_part, weapon_id, "fire", scales=[(1, Vector((1, 1, 1))), (2, Vector((1.08, 0.82, 1.08))), (7, Vector((1, 1, 1)))])
    else:
        travel = 0.18 if spec["actionStyle"] == "pump" else 0.09 if spec["family"] != "sidearm" else 0.07
        add_object_action(action_part, weapon_id, "fire", positions=[(1, action_rest), (2, action_rest + Vector((0, travel * scale, 0))), (7, action_rest)])
    magazine_rest = magazine.location.copy()
    # Reload reviews must show a deliberate handoff path beside the weapon,
    # never a magazine dropped beneath the stage like detached debris.
    if weapon_id in {"smg"}:
        reload_offset = Vector((0.22, 0.08, 0.06))
        empty_reload_offset = Vector((0.29, 0.1, 0.09))
    elif spec["family"] == "sidearm":
        reload_offset = Vector((0.15, 0.015, -0.055))
        empty_reload_offset = Vector((0.2, 0.025, -0.085))
    elif weapon_id in {"scattergun", "slug-shotgun"}:
        reload_offset = Vector((0.18, -0.03, -0.08))
        empty_reload_offset = Vector((0.24, -0.05, -0.11))
    elif weapon_id in {"minigun", "lmg", "railgun"}:
        reload_offset = Vector((0.3, 0.02, -0.07))
        empty_reload_offset = Vector((0.37, 0.03, -0.11))
    else:
        reload_offset = Vector((0.24, 0.04, -0.12))
        empty_reload_offset = Vector((0.31, 0.06, -0.17))
    add_object_action(magazine, weapon_id, "reload", positions=[(1, magazine_rest), (12, magazine_rest + reload_offset), (22, magazine_rest), (30, magazine_rest)])
    add_object_action(magazine, weapon_id, "empty-reload", positions=[(1, magazine_rest), (13, magazine_rest + empty_reload_offset), (29, magazine_rest), (38, magazine_rest)])


def segment_count(detail: float) -> int:
    if detail >= 0.9:
        return 24
    if detail >= 0.65:
        return 18
    if detail >= 0.4:
        return 12
    return 8


def add_stock(spec, frame, materials, detail, rear_y):
    stock = empty("weapon-stock", (0, 0, 0), frame, "stock")
    style = spec["stockStyle"]
    width = spec["width"]
    material = materials["polymer"]
    if style == "none":
        return stock
    signature = {
        "telescoping": "hk416-telescoping-stock", "buffer": "m4a1-buffer-stock",
        "skeletal": "m14ebr-skeletal-stock" if spec["id"] == "m14-ebr" else None,
        "wire": "mini-uzi-stock-rods", "carry-frame": "m134-carry-frame",
    }.get(style)
    signature_root = empty(signature, (0, 0, 0), stock, "signature") if signature else stock
    if style == "thumbhole":
        # P90 rear body and thumbhole are one continuous bullpup shell.
        return stock
    if style in {"telescoping", "buffer", "collapsing"}:
        segments = segment_count(detail)
        cylinder(
            f"{spec['id']}_BufferTube_{detail}", (0, rear_y + 0.19, 0.015),
            0.032, 0.38, materials["metal"], signature_root,
            rotation=(math.pi / 2, 0, 0), vertices=segments,
        )
        profiled_prism(
            f"{spec['id']}_AdjustableStock_{detail}",
            ((rear_y + 0.16, width * 0.44, 0.085, 0.055),
             (rear_y + 0.34, width * 0.66, 0.105, 0.045),
             (rear_y + 0.51, width * 0.78, 0.145, 0.025)),
            material, signature_root, chamfer=0.24, bevel=0.007 if detail >= 0.4 else 0.0,
        )
        cube(
            f"{spec['id']}_StockLowerBrace_{detail}", (0, rear_y + 0.35, -0.075),
            (width * 0.4, 0.31, 0.045), materials["metal"], signature_root,
            rotation=(math.radians(7), 0, 0), bevel=0.008,
        )
        cube(
            f"{spec['id']}_ButtPad_{detail}", (0, rear_y + 0.53, -0.02),
            (width * 0.9, 0.055, 0.25), materials["rubber"], signature_root, bevel=0.018,
        )
    elif style == "laminate":
        profiled_prism(
            f"{spec['id']}_LaminateStock_{detail}",
            ((rear_y, width * 0.48, 0.13, -0.015),
             (rear_y + 0.2, width * 0.66, 0.19, -0.015),
             (rear_y + 0.48, width * 0.92, 0.27, -0.035)),
            materials["wood"], signature_root, chamfer=0.2, bevel=0.008 if detail >= 0.4 else 0.0,
        )
        cube(
            f"{spec['id']}_ButtPad_{detail}", (0, rear_y + 0.51, -0.035),
            (width, 0.055, 0.285), materials["rubber"], signature_root, bevel=0.018,
        )
    elif style in {"wire", "skeletal", "carry-frame", "skeleton-grip"}:
        for side in (-1, 1):
            cylinder(
                f"{spec['id']}_StockRod_{side}_{detail}",
                (side * width * 0.38, rear_y + 0.24, -0.015), 0.014 if detail > 0.4 else 0.018, 0.48,
                materials["metal"], signature_root, rotation=(math.pi / 2, 0, 0), vertices=segment_count(detail),
            )
        cube(f"{spec['id']}_ButtPad_{detail}", (0, rear_y + 0.48, -0.02), (width * 1.05, 0.08, 0.26), material, signature_root, bevel=0.025)
    else:
        profiled_prism(
            f"{spec['id']}_FixedStock_{detail}",
            ((rear_y, width * 0.5, 0.14, -0.01),
             (rear_y + 0.2, width * 0.78, 0.21, -0.018),
             (rear_y + 0.49, width, 0.27, -0.035)),
            material, signature_root, chamfer=0.2, bevel=0.009 if detail >= 0.4 else 0.0,
        )
        cube(f"{spec['id']}_ButtPad_{detail}", (0, rear_y + 0.49, -0.025), (width * 1.12, 0.075, 0.275), materials["rubber"], signature_root, bevel=0.025)
    if style == "precision":
        cheek = empty("m40a5-cheek-riser", (0, 0, 0), stock, "signature")
        cube(f"{spec['id']}_CheekRiser_{detail}", (0, rear_y + 0.22, 0.17), (width * 1.05, 0.32, 0.09), materials["accent"], cheek, bevel=0.025)
    return stock


def curved_magazine(parent, name, origin, width, material, detail, curve=0.08):
    group = empty(name, (0, 0, 0), parent, "signature")
    pieces = 4 if detail >= 0.4 else 3
    for index in range(pieces):
        t = index / max(1, pieces - 1)
        cube(
            f"{name}_Segment_{index}_{detail}",
            (origin[0], origin[1] + curve * t * t, origin[2] - 0.058 * index),
            (width, 0.145, 0.095), material, group,
            rotation=(math.radians(6 + index * 7), 0, 0), bevel=0.015,
        )
    return group


def add_magazine(spec, frame, materials, detail, receiver_height):
    magazine = empty("weapon-magazine", (0, 0, 0), frame, "magazine")
    style = spec["magazineStyle"]
    origin = (0, 0.08, -receiver_height * 0.63)
    width = spec["width"] * 0.66
    if style == "top-feed":
        group = empty("p90-top-magazine", (0, 0, 0), magazine, "signature")
        cube(f"P90_TopFeed_{detail}", (0, -0.11, receiver_height * 0.72), (width * 0.75, 0.63, 0.075), materials["accent"], group, bevel=0.024)
        cube(f"P90_FeedWindow_{detail}", (0, -0.12, receiver_height * 0.765), (width * 0.48, 0.42, 0.018), materials["lens"], group, bevel=0.008)
    elif style == "box":
        group = empty("m249-box-magazine", (0, 0, 0), magazine, "signature")
        cube(f"M249_BoxMag_{detail}", (0, 0.02, -receiver_height * 0.92), (width * 1.65, 0.34, 0.36), materials["polymer"], group, bevel=0.04)
        for index in range(3 if detail > 0.4 else 2):
            cube(f"M249_BoxRib_{index}_{detail}", (0, -0.1 + index * 0.1, -receiver_height * 0.92), (width * 1.72, 0.025, 0.3), materials["accent"], group, bevel=0.006)
    elif style in {"tube"}:
        signature = "remington870-tube-magazine" if spec["id"] == "scattergun" else "benelli-m4-tube-magazine"
        group = empty(signature, (0, 0, 0), magazine, "signature")
        cylinder(f"{spec['id']}_TubeMag_{detail}", (0, -0.42, -0.095), 0.047, 0.78, materials["metal"], group, rotation=(math.pi / 2, 0, 0), vertices=segment_count(detail))
    elif style == "drum":
        group = empty("m134-ammo-drum", (0, 0, 0), magazine, "signature")
        cylinder(f"M134_AmmoDrum_{detail}", (0, 0.08, -0.34), 0.25, 0.35, materials["polymer"], group, rotation=(0, math.pi / 2, 0), vertices=segment_count(detail), bevel=0.018)
        torus(f"M134_DrumRim_{detail}", (0.18, 0.08, -0.34), 0.2, 0.018, materials["accent"], group, rotation=(0, math.pi / 2, 0), segments=segment_count(detail))
    elif style == "capacitor":
        group = empty("emrg-capacitor-bank", (0, 0, 0), magazine, "signature")
        for side in (-1, 1):
            cylinder(f"EMRG_Capacitor_{side}_{detail}", (side * 0.13, -0.05, -0.22), 0.07, 0.44, materials["emissive"], group, rotation=(math.pi / 2, 0, 0), vertices=segment_count(detail))
    elif style in {"curved-smg", "curved-rifle"}:
        signature = "mp5-curved-magazine" if spec["id"] == "mp5" else "ak47-curved-magazine"
        curved_magazine(magazine, signature, origin, width, materials["polymer"], detail, 0.045 if style == "curved-smg" else 0.09)
    else:
        signature = {
            "extended-pistol": "glock18-extended-magazine",
            "stanag": "m4a1-stanag-magazine" if spec["id"] == "m4a1" else None,
        }.get(style)
        group = empty(signature, (0, 0, 0), magazine, "signature") if signature else magazine
        height = (
            0.29 if style == "extended-pistol"
            else 0.2 if style == "short-box"
            else 0.18 if style in {"pistol", "pistol-heavy"}
            else 0.28
        )
        cube(f"{spec['id']}_Magazine_{detail}", origin, (width, 0.17, height), materials["polymer"], group, rotation=(math.radians(7), 0, 0), bevel=0.025)
    return magazine


def add_optic(spec, frame, materials, detail, sight_z, receiver_front, muzzle_y):
    optic = empty("weapon-optic", (0, 0, 0), frame, "optic")
    style = spec["opticStyle"]
    segments = segment_count(detail)
    if style in {"long-scope", "thermal"}:
        signature = {
            "sniper": "m40a5-long-scope", "railgun": "emrg-thermal-optic", "m14-ebr": "m14ebr-thermal-optic",
        }[spec["id"]]
        group = empty(signature, (0, 0, 0), optic, "signature")
        depth = 0.58 if style == "long-scope" else 0.4 if spec["id"] == "m14-ebr" else 0.48
        optic_radius = 0.082 if style == "long-scope" else 0.072 if spec["id"] == "m14-ebr" else 0.1
        cylinder(f"{spec['id']}_OpticBody_{detail}", (0, -0.08, sight_z), optic_radius, depth, materials["metal"], group, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.008)
        cylinder(f"{spec['id']}_OpticFrontLens_{detail}", (0, -0.08 - depth / 2 - 0.008, sight_z), optic_radius * 0.84, 0.014, materials["lens"], group, rotation=(math.pi / 2, 0, 0), vertices=segments)
        cylinder(f"{spec['id']}_OpticRearLens_{detail}", (0, -0.08 + depth / 2 + 0.008, sight_z), optic_radius * 0.77, 0.014, materials["lens"], group, rotation=(math.pi / 2, 0, 0), vertices=segments)
        cube(f"{spec['id']}_OpticTurret_{detail}", (0, -0.08, sight_z + optic_radius + 0.035), (0.085, 0.09, 0.065), materials["metal"], group, bevel=0.012)
    elif style == "holographic":
        cube(f"{spec['id']}_HoloBody_{detail}", (0, -0.12, sight_z - 0.035), (0.19, 0.19, 0.09), materials["metal"], optic, bevel=0.024)
        cube(f"{spec['id']}_HoloWindow_{detail}", (0, -0.12, sight_z + 0.04), (0.13, 0.045, 0.12), materials["lens"], optic, bevel=0.012)
    elif style in {"ring", "diopter", "ghost-ring", "reflex"}:
        signature = "mp5-diopter-sight" if spec["id"] == "mp5" else None
        group = empty(signature, (0, 0, 0), optic, "signature") if signature else optic
        torus(f"{spec['id']}_RearRing_{detail}", (0, 0.12, sight_z), 0.055, 0.014, materials["metal"], group, rotation=(math.pi / 2, 0, 0), segments=segments)
        cube(f"{spec['id']}_FrontPost_{detail}", (0, muzzle_y + 0.16, sight_z), (0.026, 0.035, 0.095), materials["metal"], group, bevel=0.006)
    else:
        cube(f"{spec['id']}_RearSight_{detail}", (0, 0.12, sight_z), (0.13, 0.04, 0.055), materials["metal"], optic, bevel=0.008)
        cube(f"{spec['id']}_FrontSight_{detail}", (0, muzzle_y + 0.14, sight_z), (0.04, 0.04, 0.075), materials["metal"], optic, bevel=0.006)
    return optic


def add_platform_features(spec, frame, action_part, materials, detail, receiver_front, muzzle_y, barrel_z, sight_z):
    weapon_id = spec["id"]
    segments = segment_count(detail)
    width = spec["width"]
    if weapon_id == "carbine":
        piston = empty("hk416-piston-block", (0, 0, 0), frame, "signature")
        cube(f"HK416_Piston_{detail}", (0, receiver_front - 0.08, barrel_z + 0.095), (0.16, 0.19, 0.11), materials["metal"], piston, bevel=0.016)
        rail = empty("hk416-quad-rail", (0, 0, 0), frame, "signature")
        cube(f"HK416_Rail_{detail}", (0, receiver_front - 0.24, barrel_z), (0.24, 0.5, 0.2), materials["primary"], rail, bevel=0.02)
    elif weapon_id == "smg":
        thumbhole = empty("p90-thumbhole-stock", (0, 0, 0), frame, "signature")
        for side in (-1, 1):
            cube(f"P90_ThumbholeRail_{side}_{detail}", (side * 0.12, 0.19, -0.06), (0.05, 0.34, 0.19), materials["polymer"], thumbhole, rotation=(0, 0, side * math.radians(6)), bevel=0.022)
        grip = empty("p90-forward-grip", (0, 0, 0), frame, "signature")
        cube(f"P90_ForwardGrip_{detail}", (0, -0.31, -0.18), (0.2, 0.22, 0.28), materials["polymer"], grip, rotation=(math.radians(-8), 0, 0), bevel=0.045)
    elif weapon_id == "lmg":
        handle = empty("m249-carry-handle", (0, 0, 0), frame, "signature")
        cube(f"M249_HandleTop_{detail}", (0, -0.1, sight_z + 0.12), (0.28, 0.22, 0.045), materials["polymer"], handle, bevel=0.018)
        for side in (-1, 1):
            cube(f"M249_HandleLeg_{side}_{detail}", (side * 0.11, -0.1, sight_z + 0.045), (0.035, 0.08, 0.16), materials["metal"], handle, rotation=(0, side * math.radians(9), 0), bevel=0.008)
        bipod = empty("m249-bipod", (0, 0, 0), frame, "signature")
        for side in (-1, 1):
            cylinder(f"M249_BipodLeg_{side}_{detail}", (side * 0.13, muzzle_y + 0.34, -0.13), 0.014, 0.42, materials["metal"], bipod, rotation=(math.radians(18), side * math.radians(10), 0), vertices=segments)
    elif weapon_id == "scattergun":
        pump = empty("remington870-pump", (0, 0, 0), action_part, "signature")
        cylinder(f"R870_Pump_{detail}", (0, -0.39, -0.015), 0.095, 0.38, materials["polymer"], pump, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.012)
        saddle = empty("remington870-shell-saddle", (0, 0, 0), frame, "signature")
        for index in range(5 if detail > 0.4 else 3):
            cylinder(f"R870_Shell_{index}_{detail}", (width * 0.54, -0.04 - index * 0.075, 0.02), 0.025, 0.09, materials["accent"], saddle, rotation=(math.pi / 2, 0, 0), vertices=max(8, segments // 2))
    elif weapon_id == "sniper":
        handle = empty("m40a5-bolt-handle", (0, 0, 0), action_part, "signature")
        cylinder(f"M40A5_BoltStem_{detail}", (width * 0.62, 0.04, 0.04), 0.018, 0.16, materials["metal"], handle, rotation=(0, math.pi / 2, 0), vertices=segments)
        cylinder(f"M40A5_BoltKnob_{detail}", (width * 0.95, 0.04, 0.04), 0.034, 0.05, materials["accent"], handle, rotation=(0, math.pi / 2, 0), vertices=segments)
    elif weapon_id == "railgun":
        for side, name in ((-1, "emrg-coil-left"), (1, "emrg-coil-right")):
            coil = empty(name, (0, 0, 0), action_part, "signature")
            cylinder(f"EMRG_Coil_{side}_{detail}", (side * width * 0.46, -0.47, barrel_z), 0.055, 0.92, materials["emissive"], coil, rotation=(math.pi / 2, 0, 0), vertices=segments)
            for ring in range(6 if detail >= 0.65 else 3):
                torus(f"EMRG_CoilRing_{side}_{ring}_{detail}", (side * width * 0.46, -0.15 - ring * 0.13, barrel_z), 0.065, 0.009, materials["accent"], coil, rotation=(math.pi / 2, 0, 0), segments=segments)
    elif weapon_id == "pistol":
        slide = empty("glock17-slide", (0, 0, 0), action_part, "signature")
        profiled_prism(
            f"G17_Slide_{detail}",
            ((0.14, width * 0.86, 0.12, 0.075), (-0.08, width, 0.145, 0.078), (-0.34, width * 0.82, 0.12, 0.075)),
            materials["primary"], slide, chamfer=0.18, bevel=0.006 if detail >= 0.4 else 0.0,
        )
        frame = empty("glock17-polymer-frame", (0, 0, 0), frame, "signature")
        profiled_prism(
            f"G17_Frame_{detail}",
            ((0.16, width * 0.72, 0.11, -0.04), (0.0, width * 0.9, 0.14, -0.045), (-0.24, width * 0.68, 0.1, -0.035)),
            materials["polymer"], frame, chamfer=0.24, bevel=0.006 if detail >= 0.4 else 0.0,
        )
        safety = empty("glock17-trigger-safety", (0, 0, 0), frame, "signature")
        cube(f"G17_TriggerSafety_{detail}", (0, -0.02, -0.12), (0.024, 0.045, 0.085), materials["accent"], safety, rotation=(math.radians(-12), 0, 0), bevel=0.005)
        if detail >= 0.4:
            cube(f"G17_EjectionPort_{detail}", (width * 0.43, -0.08, 0.11), (0.018, 0.105, 0.047), materials["metal"], slide, bevel=0.003)
            for index in range(4):
                cube(f"G17_RearSerration_{index}_{detail}", (width * 0.47, 0.055 + index * 0.026, 0.08), (0.012, 0.012, 0.095), materials["metal"], slide, bevel=0.001)
    elif weapon_id == "magnum":
        slide = empty("deagle-heavy-slide", (0, 0, 0), action_part, "signature")
        profiled_prism(
            f"Deagle_Slide_{detail}",
            ((0.17, width * 0.82, 0.15, 0.075), (-0.08, width, 0.19, 0.085), (-0.42, width * 0.78, 0.15, 0.075)),
            materials["primary"], slide, chamfer=0.16, bevel=0.008 if detail >= 0.4 else 0.0,
        )
        rib = empty("deagle-gas-rib", (0, 0, 0), frame, "signature")
        cube(f"Deagle_GasRib_{detail}", (0, -0.22, 0.19), (width * 0.62, 0.49, 0.055), materials["accent"], rib, bevel=0.012)
        grip = empty("deagle-oversized-grip", (0, 0, 0), frame, "signature")
        cube(f"Deagle_Grip_{detail}", (0, 0.13, -0.19), (width * 0.82, 0.18, 0.24), materials["polymer"], grip, rotation=(math.radians(-12), 0, 0), bevel=0.028)
        if detail >= 0.4:
            cube(f"Deagle_EjectionPort_{detail}", (width * 0.43, -0.09, 0.13), (0.018, 0.13, 0.055), materials["metal"], slide, bevel=0.003)
    elif weapon_id == "machine-pistol":
        slide = empty("glock18-ported-slide", (0, 0, 0), action_part, "signature")
        profiled_prism(
            f"G18_PortedSlide_{detail}",
            ((0.15, width * 0.86, 0.12, 0.075), (-0.08, width, 0.145, 0.078), (-0.37, width * 0.8, 0.12, 0.075)),
            materials["primary"], slide, chamfer=0.18, bevel=0.006 if detail >= 0.4 else 0.0,
        )
        for index in range(4 if detail > 0.4 else 2):
            cube(f"G18_Port_{index}_{detail}", (0, -0.28 + index * 0.065, 0.151), (width * 0.48, 0.028, 0.018), materials["emissive"], slide, bevel=0.003)
        selector = empty("glock18-selector", (0, 0, 0), frame, "signature")
        cube(f"G18_Selector_{detail}", (width * 0.56, 0.02, 0.09), (0.035, 0.075, 0.065), materials["accent"], selector, bevel=0.008)
        if detail >= 0.4:
            cube(f"G18_EjectionPort_{detail}", (width * 0.43, -0.08, 0.11), (0.018, 0.105, 0.047), materials["metal"], slide, bevel=0.003)
    elif weapon_id == "mini-uzi":
        receiver = empty("mini-uzi-stamped-receiver", (0, 0, 0), frame, "signature")
        cube(f"MiniUzi_StampedBody_{detail}", (0, -0.05, 0.01), (width, 0.48, 0.3), materials["primary"], receiver, bevel=0.018)
        handle = empty("mini-uzi-side-charging-handle", (0, 0, 0), action_part, "signature")
        cylinder(f"MiniUzi_Charge_{detail}", (width * 0.62, -0.11, 0.13), 0.027, 0.13, materials["accent"], handle, rotation=(0, math.pi / 2, 0), vertices=segments)
    elif weapon_id == "mp5":
        receiver = empty("mp5-tubular-receiver", (0, 0, 0), frame, "signature")
        cylinder(f"MP5_ReceiverTube_{detail}", (0, -0.08, 0.05), width * 0.42, 0.58, materials["primary"], receiver, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.008)
    elif weapon_id == "m4a1":
        sight = empty("m4a1-delta-sight", (0, 0, 0), frame, "signature")
        cube(f"M4_DeltaBase_{detail}", (0, receiver_front - 0.16, barrel_z + 0.1), (0.18, 0.08, 0.08), materials["metal"], sight, bevel=0.012)
        cube(f"M4_DeltaPost_{detail}", (0, receiver_front - 0.16, barrel_z + 0.18), (0.035, 0.045, 0.14), materials["accent"], sight, bevel=0.006)
        if detail >= 0.4:
            cube(f"M4_EjectionPort_{detail}", (width * 0.48, -0.03, 0.045), (0.02, 0.18, 0.075), materials["metal"], sight, bevel=0.004)
            cylinder(f"M4_ForwardAssist_{detail}", (width * 0.56, 0.12, 0.035), 0.018, 0.07, materials["metal"], sight, rotation=(0, math.pi / 2, 0), vertices=max(8, segments // 2))
            for side in (-1, 1):
                for index in range(4):
                    cube(
                        f"M4_HandguardVent_{side}_{index}_{detail}",
                        (side * width * 0.34, receiver_front - 0.08 - index * 0.075, barrel_z - 0.005),
                        (0.018, 0.045, 0.055), materials["metal"], sight, bevel=0.004,
                    )
    elif weapon_id == "ak-47":
        gas = empty("ak47-gas-tube", (0, 0, 0), frame, "signature")
        cylinder(f"AK_GasTube_{detail}", (0, receiver_front - 0.22, barrel_z + 0.1), 0.042, 0.42, materials["metal"], gas, rotation=(math.pi / 2, 0, 0), vertices=segments)
        handguard = empty("ak47-laminate-handguard", (0, 0, 0), frame, "signature")
        profiled_prism(
            f"AK_LaminateGuard_{detail}",
            ((receiver_front + 0.02, width * 0.66, 0.16, barrel_z - 0.025),
             (receiver_front - 0.24, width * 0.9, 0.2, barrel_z - 0.02),
             (receiver_front - 0.35, width * 0.62, 0.145, barrel_z - 0.005)),
            materials["wood"], handguard, chamfer=0.22, bevel=0.008 if detail >= 0.4 else 0.0,
        )
        if detail >= 0.4:
            selector = cube(
                f"AK_SelectorLever_{detail}", (width * 0.5, -0.02, 0.055),
                (0.018, 0.3, 0.025), materials["metal"], gas,
                rotation=(math.radians(-7), 0, 0), bevel=0.004,
            )
            selector["platform_detail"] = "selector-lever"
            cylinder(
                f"AK_ChargingHandle_{detail}", (width * 0.62, -0.05, 0.085),
                0.018, 0.13, materials["metal"], gas,
                rotation=(0, math.pi / 2, 0), vertices=max(8, segments // 2), bevel=0.003,
            )
    elif weapon_id == "minigun":
        cluster = empty("m134-barrel-cluster", (0, 0, 0), action_part, "signature")
        for index in range(6):
            angle = index * math.tau / 6
            x = math.cos(angle) * 0.115
            z = barrel_z + math.sin(angle) * 0.115
            cylinder(f"M134_Barrel_{index}_{detail}", (x, -0.58, z), spec["barrelRadius"], 1.12, materials["metal"], cluster, rotation=(math.pi / 2, 0, 0), vertices=segments)
        motor = empty("m134-drive-motor", (0, 0, 0), frame, "signature")
        cylinder(f"M134_Motor_{detail}", (0, 0.02, barrel_z), 0.18, 0.42, materials["primary"], motor, rotation=(math.pi / 2, 0, 0), vertices=segments)
    elif weapon_id == "m14-ebr":
        chassis = empty("m14ebr-sage-chassis", (0, 0, 0), frame, "signature")
        profiled_prism(
            f"M14_SageChassis_{detail}",
            ((0.28, width * 0.7, 0.18, -0.005), (-0.04, width, 0.24, 0.0),
             (-0.38, width * 0.78, 0.18, 0.01)),
            materials["primary"], chassis, chamfer=0.2, bevel=0.008 if detail >= 0.4 else 0.0,
        )
        if detail >= 0.4:
            cube(f"M14_EjectionPort_{detail}", (width * 0.48, -0.05, 0.065), (0.02, 0.18, 0.07), materials["metal"], chassis, bevel=0.004)
            cylinder(f"M14_ChargingHandle_{detail}", (width * 0.58, 0.02, 0.045), 0.018, 0.11, materials["metal"], chassis, rotation=(0, math.pi / 2, 0), vertices=max(8, segments // 2))
    elif weapon_id == "slug-shotgun":
        pistons = empty("benelli-m4-gas-pistons", (0, 0, 0), action_part, "signature")
        for side in (-1, 1):
            cylinder(f"Benelli_GasPiston_{side}_{detail}", (side * 0.07, -0.37, -0.01), 0.025, 0.38, materials["accent"], pistons, rotation=(math.pi / 2, 0, 0), vertices=segments)
        saddle = empty("benelli-m4-shell-saddle", (0, 0, 0), frame, "signature")
        for index in range(4 if detail > 0.4 else 2):
            cylinder(f"Benelli_Shell_{index}_{detail}", (width * 0.55, -0.02 - index * 0.075, 0.025), 0.025, 0.09, materials["accent"], saddle, rotation=(math.pi / 2, 0, 0), vertices=max(8, segments // 2))
    elif weapon_id == "flashlight-pistol":
        usp_slide = empty("usp45-action-slide", (0, 0, 0), action_part, "slide")
        profiled_prism(
            f"USP45_Slide_{detail}",
            ((0.15, width * 0.84, 0.13, 0.078), (-0.08, width, 0.155, 0.08), (-0.36, width * 0.8, 0.125, 0.075)),
            materials["primary"], usp_slide, chamfer=0.17, bevel=0.006 if detail >= 0.4 else 0.0,
        )
        barrel = empty("usp45-threaded-barrel", (0, 0, 0), frame, "signature")
        cylinder(f"USP_ThreadedBarrel_{detail}", (0, muzzle_y + 0.06, barrel_z), 0.035, 0.17, materials["metal"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments)
        light = empty("usp45-underbarrel-flashlight", (0, 0, 0), frame, "signature")
        cylinder(f"USP_LightBody_{detail}", (0, -0.23, -0.08), 0.055, 0.22, materials["polymer"], light, rotation=(math.pi / 2, 0, 0), vertices=segments)
        cylinder(f"USP_LightLens_{detail}", (0, -0.35, -0.08), 0.045, 0.018, materials["emissive"], light, rotation=(math.pi / 2, 0, 0), vertices=segments)
        paddle = empty("usp45-paddle-control", (0, 0, 0), frame, "signature")
        cube(f"USP_Paddle_{detail}", (width * 0.53, 0.03, -0.045), (0.03, 0.1, 0.06), materials["accent"], paddle, bevel=0.006)
        if detail >= 0.4:
            cube(f"USP_EjectionPort_{detail}", (width * 0.43, -0.08, 0.12), (0.018, 0.11, 0.05), materials["metal"], usp_slide, bevel=0.003)
            for index in range(4):
                cube(f"USP_RearSerration_{index}_{detail}", (width * 0.47, 0.055 + index * 0.026, 0.08), (0.012, 0.012, 0.095), materials["metal"], usp_slide, bevel=0.001)


def add_platform_core(spec, receiver, frame, materials, detail, receiver_front, rear_y):
    """Give each platform its own manufactured receiver/chassis proportions."""
    weapon_id = spec["id"]
    width = spec["width"]
    height = spec["height"]
    bevel = 0.007 if detail >= 0.4 else 0.0
    if spec["family"] == "sidearm":
        profiled_prism(
            f"{weapon_id}_PolymerLower_{detail}",
            ((rear_y * 0.78, width * 0.7, height * 0.34, -height * 0.13),
             (0.02, width * 0.88, height * 0.43, -height * 0.15),
             (receiver_front * 0.72, width * 0.72, height * 0.3, -height * 0.12)),
            materials["polymer"], receiver, chamfer=0.22, bevel=bevel,
        )
        return
    if weapon_id == "smg":
        profiled_prism(
            f"P90_BullpupShell_{detail}",
            ((rear_y, width * 0.86, height * 0.76, -0.01),
             (rear_y * 0.42, width, height * 0.92, 0.0),
             (-0.13, width * 0.96, height * 0.88, 0.0),
             (receiver_front, width * 0.72, height * 0.62, 0.02)),
            materials["primary"], receiver, chamfer=0.28, bevel=bevel,
        )
        profiled_prism(
            f"P90_LowerShell_{detail}",
            ((rear_y * 0.7, width * 0.76, height * 0.34, -height * 0.34),
             (-0.08, width * 0.85, height * 0.4, -height * 0.35),
             (receiver_front * 0.9, width * 0.62, height * 0.28, -height * 0.28)),
            materials["polymer"], receiver, chamfer=0.3, bevel=bevel,
        )
        return
    if weapon_id == "minigun":
        profiled_prism(
            f"M134_RearHousing_{detail}",
            ((rear_y, width * 0.76, height * 0.7, 0.0),
             (0.08, width * 0.92, height * 0.82, 0.0),
             (receiver_front, width * 0.66, height * 0.58, 0.01)),
            materials["primary"], receiver, chamfer=0.24, bevel=bevel,
        )
        profiled_prism(
            f"M134_ControlHousing_{detail}",
            ((rear_y * 0.72, width * 0.58, height * 0.28, -height * 0.42),
             (-0.04, width * 0.7, height * 0.34, -height * 0.43),
             (receiver_front * 0.68, width * 0.48, height * 0.24, -height * 0.36)),
            materials["polymer"], receiver, chamfer=0.25, bevel=bevel,
        )
        return
    if weapon_id == "railgun":
        profiled_prism(
            f"EMRG_MainChassis_{detail}",
            ((rear_y, width * 0.68, height * 0.62, 0.0),
             (rear_y * 0.3, width * 0.86, height * 0.78, 0.015),
             (-0.22, width, height * 0.82, 0.02),
             (receiver_front, width * 0.76, height * 0.58, 0.015)),
            materials["primary"], receiver, chamfer=0.2, bevel=bevel,
        )
        profiled_prism(
            f"EMRG_InsulatedLower_{detail}",
            ((rear_y * 0.66, width * 0.5, height * 0.28, -height * 0.4),
             (-0.22, width * 0.66, height * 0.34, -height * 0.41),
             (receiver_front * 0.84, width * 0.44, height * 0.22, -height * 0.32)),
            materials["polymer"], receiver, chamfer=0.25, bevel=bevel,
        )
        return
    if weapon_id in {"m4a1", "carbine"}:
        upper_profile = (
            (rear_y, width * 0.74, height * 0.42, height * 0.18),
            (rear_y * 0.25, width * 0.94, height * 0.56, height * 0.15),
            (receiver_front * 0.55, width * 0.86, height * 0.5, height * 0.15),
            (receiver_front, width * 0.68, height * 0.38, height * 0.14),
        )
        lower_profile = (
            (rear_y * 0.78, width * 0.58, height * 0.32, -height * 0.2),
            (0.06, width * 0.82, height * 0.44, -height * 0.22),
            (receiver_front * 0.72, width * 0.72, height * 0.34, -height * 0.18),
        )
    elif weapon_id == "ak-47":
        upper_profile = (
            (rear_y, width * 0.78, height * 0.54, height * 0.08),
            (0.04, width * 0.94, height * 0.66, height * 0.07),
            (receiver_front, width * 0.78, height * 0.48, height * 0.09),
        )
        lower_profile = (
            (rear_y * 0.72, width * 0.62, height * 0.34, -height * 0.28),
            (0.03, width * 0.84, height * 0.44, -height * 0.27),
            (receiver_front * 0.68, width * 0.7, height * 0.3, -height * 0.23),
        )
    elif weapon_id in {"m14-ebr", "sniper"}:
        upper_profile = (
            (rear_y, width * 0.68, height * 0.38, height * 0.14),
            (0.0, width * 0.86, height * 0.5, height * 0.13),
            (receiver_front, width * 0.62, height * 0.32, height * 0.13),
        )
        lower_profile = (
            (rear_y * 0.76, width * 0.54, height * 0.3, -height * 0.22),
            (-0.08, width * 0.76, height * 0.38, -height * 0.23),
            (receiver_front * 0.76, width * 0.58, height * 0.27, -height * 0.2),
        )
    elif spec["family"] == "shotgun":
        upper_profile = (
            (rear_y, width * 0.72, height * 0.54, 0.02),
            (0.0, width * 0.9, height * 0.68, 0.015),
            (receiver_front, width * 0.7, height * 0.5, 0.02),
        )
        lower_profile = (
            (rear_y * 0.74, width * 0.55, height * 0.3, -height * 0.31),
            (-0.04, width * 0.7, height * 0.36, -height * 0.3),
            (receiver_front * 0.74, width * 0.5, height * 0.24, -height * 0.25),
        )
    else:
        upper_profile = (
            (rear_y, width * 0.76, height * 0.48, height * 0.1),
            (0.0, width * 0.94, height * 0.62, height * 0.08),
            (receiver_front, width * 0.7, height * 0.42, height * 0.1),
        )
        lower_profile = (
            (rear_y * 0.72, width * 0.58, height * 0.32, -height * 0.27),
            (0.0, width * 0.78, height * 0.42, -height * 0.27),
            (receiver_front * 0.7, width * 0.58, height * 0.28, -height * 0.23),
        )
    profiled_prism(f"{weapon_id}_PlatformUpper_{detail}", upper_profile, materials["primary"], receiver, bevel=bevel)
    profiled_prism(f"{weapon_id}_PlatformLower_{detail}", lower_profile, materials["polymer"], receiver, bevel=bevel)


def add_m4a1_production_geometry(spec, frame, receiver, action_part, materials, detail, label):
    """Build one recognizable M4A1 from real platform anatomy, not proxy boxes.

    The dimensions remain project-original and presentation-only, but the
    relationship between receiver, direct-impingement barrel group, RAS-style
    handguard, controls, STANAG magazine and collapsible stock follows the real
    platform closely enough to survive a close first-person review.
    """
    segments = max(18, segment_count(detail))
    bevel = 0.009 if detail >= 0.65 else 0.006 if detail >= 0.4 else 0.002
    high = detail >= 0.65
    hero = detail >= 0.9

    platform = empty("m4a1-authored-platform-v3", (0, 0, 0), frame, "signature")

    # Forged upper and lower are separate manufactured components. The upper
    # keeps a rounded roof/forward taper while the lower breaks into fire-
    # control housing, buffer tower and a forward-raked magazine well.
    profiled_prism(
        f"M4A1_ForgedUpper_{label}",
        ((0.235, 0.142, 0.105, 0.062),
         (0.16, 0.184, 0.142, 0.064),
         (-0.10, 0.202, 0.15, 0.061),
         (-0.225, 0.164, 0.122, 0.058)),
        materials["primary"], receiver, chamfer=0.12, bevel=bevel,
        weighted_normals=False,
    )
    profiled_prism(
        f"M4A1_FireControlLower_{label}",
        ((0.225, 0.145, 0.15, -0.067),
         (0.06, 0.186, 0.178, -0.068),
         (-0.08, 0.19, 0.164, -0.065),
         (-0.17, 0.155, 0.12, -0.052)),
        materials["primary"], receiver, chamfer=0.16, bevel=bevel,
        weighted_normals=False,
    )
    cylinder(
        f"M4A1_BufferTower_{label}", (0, 0.224, 0.015), 0.069, 0.075,
        materials["primary"], receiver, rotation=(math.pi / 2, 0, 0),
        vertices=segments, bevel=0.004,
    )
    magwell = empty("m4a1-magwell", (0, 0, 0), receiver, "magwell")
    profiled_box_z(
        f"M4A1_Magwell_{label}",
        ((0.005, 0.18, 0.205, -0.105),
         (-0.08, 0.188, 0.195, -0.115),
         (-0.17, 0.166, 0.168, -0.14)),
        materials["primary"], magwell, chamfer=0.14, bevel=bevel,
        weighted_normals=False,
    )
    cube(
        f"M4A1_MagwellFrontFence_{label}", (0, -0.226, -0.07),
        (0.17, 0.018, 0.16), materials["primary"], magwell,
        rotation=(math.radians(-6), 0, 0), bevel=0.004,
    )

    # Direct-impingement barrel group: extension, stepped barrel, gas journal,
    # exposed front barrel and an open birdcage with a recessed crown.
    barrel = empty("m4a1-multi-part-barrel", (0, 0, 0), frame, "barrel")
    cylinder(f"M4A1_BarrelExtension_{label}", (0, -0.255, 0.052), 0.044, 0.09, materials["metal"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.004)
    cylinder(f"M4A1_HeavyBarrel_{label}", (0, -0.38, 0.052), 0.03, 0.18, materials["metal"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003)
    cylinder(f"M4A1_GasJournal_{label}", (0, -0.525, 0.052), 0.038, 0.11, materials["metal"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003)
    cylinder(f"M4A1_FrontBarrel_{label}", (0, -0.64, 0.052), 0.024, 0.16, materials["metal"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002)
    cylinder(f"M4A1_MuzzleShoulder_{label}", (0, -0.728, 0.052), 0.031, 0.025, materials["primary"], barrel, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002)
    muzzle = empty("weapon-muzzle-device", (0, 0, 0), frame, "muzzle-device")
    cylinder(f"M4A1_BirdcageBase_{label}", (0, -0.758, 0.052), 0.035, 0.055, materials["primary"], muzzle, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003)
    prong_count = 6 if high else 4
    for index in range(prong_count):
        angle = math.tau * index / prong_count
        cylinder(
            f"M4A1_BirdcageProng_{index}_{label}",
            (math.cos(angle) * 0.024, -0.81, 0.052 + math.sin(angle) * 0.024),
            0.0065, 0.085, materials["primary"], muzzle,
            rotation=(math.pi / 2, 0, 0), vertices=max(8, segments // 2), bevel=0.001,
        )
    cylinder(f"M4A1_RecessedBore_{label}", (0, -0.855, 0.052), 0.017, 0.006, materials["rubber"], muzzle, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.0)

    # RAS-style handguard is assembled from a slim shell, four rails, actual
    # rail teeth, recessed vent capsules and fasteners. The reduced shell keeps
    # the barrel readable through the side detail instead of becoming a block.
    handguard = empty("m4a1-ras-handguard", (0, 0, 0), frame, "handguard")
    profiled_prism(
        f"M4A1_RASCore_{label}",
        ((-0.205, 0.15, 0.13, 0.047),
         (-0.37, 0.158, 0.138, 0.048),
         (-0.52, 0.142, 0.122, 0.05)),
        materials["primary"], handguard, chamfer=0.2, bevel=bevel,
        weighted_normals=False,
    )
    rail_length = 0.72
    # HF-396: the top rail spine floated 17-18 mm above the RAS core (top .114);
    # a riser the length of the handguard seats it. Over the forged upper the
    # spine already overlaps the receiver top, so the riser stops there.
    cube(f"M4A1_RASRailRiser_{label}", (0, -0.36, 0.124), (0.11, 0.33, 0.02), materials["primary"], handguard, bevel=0.003)
    cube(f"M4A1_TopRailSpine_{label}", (0, -0.145, 0.145), (0.125, rail_length, 0.026), materials["primary"], handguard, bevel=0.004)
    cube(f"M4A1_BottomRailSpine_{label}", (0, -0.36, -0.026), (0.12, 0.31, 0.025), materials["primary"], handguard, bevel=0.004)
    for side in (-1, 1):
        cube(f"M4A1_SideRailSpine_{side}_{label}", (side * 0.094, -0.36, 0.052), (0.026, 0.31, 0.085), materials["primary"], handguard, bevel=0.004)
    top_teeth = 18 if hero else 13 if high else 8 if detail >= 0.4 else 4
    for index in range(top_teeth):
        y = 0.195 - index * (0.69 / max(1, top_teeth - 1))
        cube(f"M4A1_PicatinnyTop_{index}_{label}", (0, y, 0.16), (0.145, 0.02, 0.018), materials["primary"], handguard, bevel=0.002)
    side_teeth = 8 if hero else 6 if high else 3
    for side in (-1, 1):
        for index in range(side_teeth):
            y = -0.225 - index * (0.285 / max(1, side_teeth - 1))
            cube(f"M4A1_PicatinnySide_{side}_{index}_{label}", (side * 0.112, y, 0.052), (0.03, 0.022, 0.115), materials["primary"], handguard, bevel=0.002)
    vent_count = 5 if high else 3
    if detail >= 0.4:
        for side in (-1, 1):
            for index in range(vent_count):
                y = -0.255 - index * (0.23 / max(1, vent_count - 1))
                cube(
                    f"M4A1_RASVent_{side}_{index}_{label}",
                    (side * 0.0815, y, 0.055), (0.007, 0.04, 0.055),
                    materials["rubber"], handguard,
                    rotation=(math.radians(18), 0, 0), bevel=0.008,
                )
            for y in (-0.225, -0.505):
                cylinder(f"M4A1_RASTorx_{side}_{y}_{label}", (side * 0.113, y, 0.11), 0.009, 0.007, materials["metal"], handguard, rotation=(0, math.pi / 2, 0), vertices=12, bevel=0.001)

    # A-frame front sight/gas block and folding rear aperture align with the
    # bore. Two separate legs preserve the characteristic delta silhouette.
    front_sight = empty("m4a1-delta-sight", (0, 0, 0), frame, "signature")
    cylinder(f"M4A1_GasBlockBand_{label}", (0, -0.535, 0.052), 0.049, 0.065, materials["primary"], front_sight, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003)
    cylinder_between(f"M4A1_FrontSightLegL_{label}", (-0.044, -0.535, 0.075), (-0.018, -0.535, 0.186), 0.009, materials["primary"], front_sight, vertices=12)
    cylinder_between(f"M4A1_FrontSightLegR_{label}", (0.044, -0.535, 0.075), (0.018, -0.535, 0.186), 0.009, materials["primary"], front_sight, vertices=12)
    cube(f"M4A1_FrontSightBridge_{label}", (0, -0.535, 0.186), (0.064, 0.04, 0.025), materials["primary"], front_sight, bevel=0.004)
    cylinder(f"M4A1_FrontSightPost_{label}", (0, -0.535, 0.218), 0.005, 0.07, materials["metal"], front_sight, vertices=10, bevel=0.001)
    optic = empty("weapon-optic", (0, 0, 0), frame, "optic")
    rear_sight = empty("m4a1-rear-aperture", (0, 0, 0), optic, "sight-rear")
    cube(f"M4A1_RearSightBase_{label}", (0, 0.175, 0.185), (0.12, 0.06, 0.04), materials["primary"], rear_sight, bevel=0.005)
    for side in (-1, 1):
        cylinder_between(f"M4A1_RearSightEar_{side}_{label}", (side * 0.044, 0.175, 0.2), (side * 0.036, 0.175, 0.26), 0.008, materials["primary"], rear_sight, vertices=12)
    torus(f"M4A1_RearAperture_{label}", (0, 0.175, 0.242), 0.025, 0.006, materials["metal"], rear_sight, rotation=(math.pi / 2, 0, 0), segments=segments)

    # Right-side ejection anatomy is deliberately readable from the close hero
    # camera: recessed port, bolt carrier, dust-cover border, deflector,
    # charging handle and forward assist are independent parts.
    if detail >= 0.4:
        ejection = empty("m4a1-ejection-controls", (0, 0, 0), receiver, "ejection")
        cube(f"M4A1_EjectionRecess_{label}", (0.103, -0.015, 0.083), (0.008, 0.19, 0.075), materials["rubber"], ejection, bevel=0.005)
        cube(f"M4A1_BoltCarrier_{label}", (0.108, -0.025, 0.087), (0.008, 0.145, 0.047), materials["metal"], action_part, bevel=0.003)
        for y, z, dy, dz in ((-0.015, 0.126, 0.2, 0.009), (-0.015, 0.04, 0.2, 0.009), (0.09, 0.083, 0.009, 0.085), (-0.12, 0.083, 0.009, 0.085)):
            cube(f"M4A1_DustCoverBorder_{y}_{z}_{label}", (0.111, y, z), (0.007, dy, dz), materials["primary"], ejection, bevel=0.002)
        cube(f"M4A1_CaseDeflector_{label}", (0.111, 0.108, 0.07), (0.035, 0.055, 0.07), materials["primary"], ejection, rotation=(0, 0, math.radians(18)), bevel=0.008)
        cylinder(f"M4A1_ForwardAssist_{label}", (0.125, 0.147, 0.052), 0.02, 0.065, materials["metal"], ejection, rotation=(0, math.pi / 2, 0), vertices=segments, bevel=0.002)
        cylinder(f"M4A1_MagRelease_{label}", (0.108, -0.076, -0.045), 0.014, 0.01, materials["metal"], ejection, rotation=(0, math.pi / 2, 0), vertices=12, bevel=0.001)
        charging = empty("m4a1-charging-handle", (0, 0, 0), action_part, "charging-handle")
        cube(f"M4A1_ChargingStem_{label}", (0, 0.185, 0.13), (0.035, 0.115, 0.025), materials["primary"], charging, bevel=0.004)
        cube(f"M4A1_ChargingLatch_{label}", (0, 0.242, 0.132), (0.18, 0.028, 0.028), materials["primary"], charging, bevel=0.004)

    # Real trigger/guard/grip relationship. The open guard is built from thin
    # struts instead of the former solid rectangular proxy.
    grip_y = 0.115
    grip = empty("m4a1-a2-pistol-grip", (0, 0, 0), frame, "rightGrip")
    profiled_box_z(
        f"M4A1_A2Grip_{label}",
        ((-0.135, 0.122, 0.115, 0.095),
         (-0.22, 0.12, 0.132, 0.12),
         (-0.33, 0.108, 0.125, 0.155),
         (-0.39, 0.1, 0.11, 0.175)),
        materials["polymer"], grip, chamfer=0.22, bevel=0.014 if detail >= 0.4 else 0.004,
        weighted_normals=False,
    )
    cube(f"M4A1_GripBeavertail_{label}", (0, 0.185, -0.15), (0.13, 0.11, 0.07), materials["polymer"], grip, bevel=0.015)
    if high:
        for index in range(4):
            cube(f"M4A1_GripGroove_{index}_{label}", (0, 0.045 + index * 0.022, -0.19 - index * 0.052), (0.095, 0.009, 0.01), materials["polymer"], grip, rotation=(math.radians(-12), 0, 0), bevel=0.002)
    guard = empty("m4a1-trigger-guard", (0, 0, 0), frame, "trigger-guard")
    guard_points = ((0.075, -0.075), (0.035, -0.165), (-0.075, -0.178), (-0.145, -0.13))
    for side in (-1, 1):
        for index in range(len(guard_points) - 1):
            start_y, start_z = guard_points[index]
            end_y, end_z = guard_points[index + 1]
            cylinder_between(f"M4A1_TriggerGuard_{side}_{index}_{label}", (side * 0.064, start_y, start_z), (side * 0.064, end_y, end_z), 0.006, materials["primary"], guard, vertices=10, bevel=0.001)
    cylinder_between(f"M4A1_CurvedTrigger_{label}", (0, -0.015, -0.105), (0, -0.055, -0.17), 0.008, materials["metal"], action_part, vertices=12, bevel=0.001)

    # STANAG 30-round magazine: forward rake, tapered body, stamped ribs and
    # floor plate. It remains an independent action node for reload clips.
    magazine = empty("weapon-magazine", (0, 0, 0), frame, "magazine")
    stanag = empty("m4a1-stanag-magazine", (0, 0, 0), magazine, "signature")
    profiled_box_z(
        f"M4A1_STANAGBody_{label}",
        ((-0.105, 0.151, 0.154, -0.125),
         (-0.19, 0.164, 0.165, -0.142),
         (-0.315, 0.16, 0.16, -0.177),
         (-0.405, 0.145, 0.145, -0.205)),
        materials["primary"], stanag, chamfer=0.1, bevel=0.006 if detail >= 0.4 else 0.002,
        weighted_normals=False,
    )
    cube(f"M4A1_STANAGFloorplate_{label}", (0, -0.208, -0.413), (0.17, 0.17, 0.025), materials["metal"], stanag, rotation=(math.radians(-8), 0, 0), bevel=0.005)
    if detail >= 0.4:
        for side in (-1, 1):
            for index, y in enumerate((-0.145, -0.185, -0.22)):
                cube(f"M4A1_STANAGRib_{side}_{index}_{label}", (side * 0.081, y, -0.265), (0.008, 0.018, 0.235), materials["metal"], stanag, rotation=(math.radians(-9), 0, 0), bevel=0.002)

    # Six-position buffer assembly and skeletal M4 stock. Open negative space
    # is genuine geometry between cheek, side rails and lower brace.
    stock = empty("weapon-stock", (0, 0, 0), frame, "stock")
    stock_sig = empty("m4a1-buffer-stock", (0, 0, 0), stock, "signature")
    cylinder(f"M4A1_CastleNut_{label}", (0, 0.255, 0.038), 0.064, 0.045, materials["primary"], stock_sig, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003)
    cylinder(f"M4A1_BufferTube_{label}", (0, 0.425, 0.038), 0.031, 0.36, materials["metal"], stock_sig, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002)
    cube(f"M4A1_StockCheek_{label}", (0, 0.485, 0.095), (0.145, 0.31, 0.075), materials["polymer"], stock_sig, rotation=(math.radians(-2), 0, 0), bevel=0.018)
    for side in (-1, 1):
        cylinder_between(f"M4A1_StockSideRail_{side}_{label}", (side * 0.055, 0.36, 0.03), (side * 0.075, 0.615, -0.105), 0.014, materials["polymer"], stock_sig, vertices=segments, bevel=0.002)
    cylinder_between(f"M4A1_StockLowerBrace_{label}", (0, 0.42, -0.02), (0, 0.61, -0.155), 0.017, materials["polymer"], stock_sig, vertices=segments, bevel=0.002)
    cube(f"M4A1_ButtPad_{label}", (0, 0.635, -0.015), (0.185, 0.055, 0.29), materials["rubber"], stock_sig, rotation=(math.radians(-3), 0, 0), bevel=0.022)
    cube(f"M4A1_AdjustmentLever_{label}", (0, 0.455, -0.09), (0.085, 0.13, 0.035), materials["polymer"], stock_sig, rotation=(math.radians(-8), 0, 0), bevel=0.008)

    if high:
        controls = empty("m4a1-ambidextrous-controls", (0, 0, 0), receiver, "controls")
        for side in (-1, 1):
            for index, (y, z) in enumerate(((0.145, -0.045), (-0.025, -0.035))):
                cylinder(f"M4A1_ReceiverPin_{side}_{index}_{label}", (side * 0.103, y, z), 0.011, 0.012, materials["metal"], controls, rotation=(0, math.pi / 2, 0), vertices=12, bevel=0.001)
        cylinder(f"M4A1_SelectorHub_{label}", (-0.105, 0.105, -0.045), 0.017, 0.012, materials["metal"], controls, rotation=(0, math.pi / 2, 0), vertices=12, bevel=0.001)
        cube(f"M4A1_SelectorLever_{label}", (-0.112, 0.073, -0.022), (0.012, 0.08, 0.018), materials["metal"], controls, rotation=(0, 0, math.radians(-22)), bevel=0.003)
        cube(f"M4A1_BoltCatch_{label}", (-0.11, -0.03, 0.005), (0.012, 0.052, 0.06), materials["metal"], controls, bevel=0.004)
        cube(f"M4A1_SerialPlate_{label}", (-0.108, 0.015, -0.085), (0.007, 0.115, 0.045), materials["metal"], controls, bevel=0.002)
        # Fastener/surface breakup on the visible receiver and stock.
        for index, y in enumerate((-0.18, -0.125, -0.07, -0.015, 0.04)):
            cube(f"M4A1_UpperMachiningLine_{index}_{label}", (0.105, y, 0.025), (0.005, 0.004, 0.09), materials["metal"], controls, bevel=0.001)

    return stock, magazine, optic


def build_weapon(spec, delivery, materials):
    weapon_id = spec["id"]
    detail = delivery["detail"]
    label = delivery["suffix"].upper().replace("-", "_")
    root = empty(f"Pass65_{weapon_id}_{label}", (0, 0, 0), None, canonical=False)
    root.rotation_euler.z = math.pi
    root["asset_id"] = f"pass65-weapon-{weapon_id}"
    root["weapon_id"] = weapon_id
    root["display_name"] = spec["displayName"]
    root["design_id"] = spec["designId"]
    root["silhouette_family"] = spec["family"]
    root["delivery_variant"] = delivery["variant"]
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "-Y rotated to +Y at delivery root"
    root["source_spec_schema"] = SPEC["schemaVersion"]
    root["presentation_only"] = True
    root["opaque_material_contract"] = True
    root["visual_revision"] = "m4a1-production-hero-v3" if weapon_id == "m4a1" else "platform-specific-v2"
    root["material_language"] = "m4a1-anodized-metal-polymer-pbr-v3" if weapon_id == "m4a1" else "restrained-real-platform-pbr-v2"
    root["delivery_silhouette_review"] = True

    driver = empty("weapon-action-driver", (0, 0, 0), root, "animation-root")
    frame = empty("weapon-frame", (0, 0, 0), driver, "frame")
    receiver = empty("weapon-receiver", (0, 0, 0), frame, "receiver")
    length = spec["length"]
    width = spec["width"]
    height = spec["height"]
    receiver_length = spec["receiverLength"]
    muzzle_y = -length * 0.56
    rear_y = receiver_length * 0.46
    receiver_front = -receiver_length * 0.5
    barrel_z = height * 0.12
    sight_z = height * 0.72
    segments = segment_count(detail)

    if weapon_id == "m4a1":
        action_part = empty("weapon-action", (0, 0, 0), frame, spec["actionStyle"])
        stock, magazine, optic = add_m4a1_production_geometry(
            spec, frame, receiver, action_part, materials, detail, label,
        )
        sockets = {
            "grip-socket-r": ((0, 0.115, -0.35), "rightGrip"),
            "support-socket-l": ((-0.09, -0.39, -0.035), "leftGrip"),
            "reload-socket-l": ((-0.095, -0.17, -0.31), "reload"),
            "magazine-socket": ((0, -0.14, -0.12), "magazine"),
            "muzzle-socket": ((0, -0.86, 0.052), "muzzle"),
            "eject-socket": ((0.115, -0.02, 0.083), "eject"),
            "optic-socket": ((0, 0.02, 0.205), "optic"),
            "rear-sight-socket": ((0, 0.175, 0.242), "sight-rear"),
            "front-sight-socket": ((0, -0.535, 0.218), "sight-front"),
        }
        for socket_name, (position, semantic) in sockets.items():
            empty(socket_name, position, root, semantic)
        root["declared_length_m"] = length
        root["signature_node_count"] = len(spec["signatureNodes"])
        root["required_signature_nodes_csv"] = ",".join(spec["signatureNodes"])
        root["m4a1_platform_anatomy"] = "upper-lower-magwell-ras-direct-impingement-stanag-buffer-stock"
        root["weighted_surface_contract"] = "beveled-authored-hard-surface"
        runtime_meshes = consolidate_runtime_meshes(
            root, frame, action_part, magazine, f"M4A1_{label}",
        )
        root["runtime_render_primitive_budget"] = 12 if delivery["variant"] == "drop-lod0" else 16
        root["runtime_rigid_material_batches"] = len(runtime_meshes)
        root["runtime_batching_contract"] = "static-action-magazine-by-material-v1"
        action_corpus(driver, action_part, magazine, spec)
        return root

    # Every approved real-name platform gets a dedicated production builder.
    # The fallback below remains only while a bounded corpus batch is still
    # under construction; final release gates reject its older v2 metadata.
    action_part = empty("weapon-action", (0, 0, 0), frame, spec["actionStyle"])
    production_geometry = build_platform(
        globals(), spec, frame, receiver, action_part, materials, detail, label,
    )
    if production_geometry is not None:
        stock, magazine, optic, sockets, platform_anatomy = production_geometry
        for socket_name, (position, semantic) in sockets.items():
            empty(socket_name, position, root, semantic)
        root["declared_length_m"] = length
        root["signature_node_count"] = len(spec["signatureNodes"])
        root["required_signature_nodes_csv"] = ",".join(spec["signatureNodes"])
        root["visual_revision"] = "platform-production-hero-v4"
        root["material_language"] = "platform-authentic-metal-polymer-pbr-v4"
        root["platform_anatomy"] = platform_anatomy
        root["weighted_surface_contract"] = "beveled-authored-hard-surface"
        runtime_meshes = consolidate_runtime_meshes(
            root, frame, action_part, magazine, f"{weapon_id}_{label}",
        )
        apply_delivery_lod_reduction(runtime_meshes, weapon_id, delivery)
        root["runtime_render_primitive_budget"] = 12 if delivery["variant"] == "drop-lod0" else 16
        root["runtime_rigid_material_batches"] = len(runtime_meshes)
        root["runtime_batching_contract"] = "static-action-magazine-by-material-v1"
        action_corpus(driver, action_part, magazine, spec)
        return root

    add_platform_core(spec, receiver, frame, materials, detail, receiver_front, rear_y)
    barrel_depth = abs(muzzle_y - receiver_front)
    cylinder(f"{weapon_id}_Barrel_{label}", (0, (muzzle_y + receiver_front) / 2, barrel_z), spec["barrelRadius"], barrel_depth, materials["metal"], frame, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.004)
    muzzle = empty("weapon-muzzle-device", (0, 0, 0), frame, "muzzle-device")
    if spec["family"] == "sidearm":
        # Service-pistol barrels terminate inside the slide. A recessed dark
        # crown reads as a bore without the toy-like protruding rifle muzzle.
        cylinder(
            f"{weapon_id}_BarrelCrown_{label}", (0, muzzle_y - 0.006, barrel_z),
            spec["barrelRadius"] * 0.92, 0.025, materials["metal"], muzzle,
            rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.002,
        )
    else:
        cylinder(f"{weapon_id}_MuzzleDevice_{label}", (0, muzzle_y - 0.035, barrel_z), spec["barrelRadius"] * 1.45, 0.13, materials["metal"], muzzle, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.006)

    grip_y = rear_y * 0.45
    grip_height = 0.225 if spec["family"] != "sidearm" else 0.205
    grip_depth = 0.16 if spec["family"] != "sidearm" else 0.135
    grip_center_z = -height * 0.55 - grip_height * 0.42
    cube(f"{weapon_id}_PistolGrip_{label}", (0, grip_y, grip_center_z), (width * 0.62, grip_depth, grip_height), materials["polymer"], frame, rotation=(math.radians(-15), 0, 0), bevel=0.026)
    cube(f"{weapon_id}_TriggerGuard_{label}", (0, grip_y - 0.11, -height * 0.53), (width * 0.62, 0.19, 0.045), materials["metal"], frame, bevel=0.015)
    cube(f"{weapon_id}_Trigger_{label}", (0, grip_y - 0.12, -height * 0.61), (0.026, 0.045, 0.1), materials["accent"], frame, rotation=(math.radians(-13), 0, 0), bevel=0.005)

    if spec["family"] != "sidearm" and weapon_id not in {"smg", "minigun", "ak-47"}:
        profiled_prism(
            f"{weapon_id}_Handguard_{label}",
            ((receiver_front + 0.03, width * 0.72, height * 0.56, barrel_z - 0.02),
             (receiver_front - 0.2, width * 0.88, height * 0.68, barrel_z - 0.02),
             (receiver_front - 0.36, width * 0.62, height * 0.48, barrel_z - 0.01)),
            materials["polymer"], frame, chamfer=0.22, bevel=0.007 if detail >= 0.4 else 0.0,
        )
    if detail >= 0.4 and spec["family"] != "sidearm":
        cube(f"{weapon_id}_TopRail_{label}", (0, -0.12, sight_z - 0.09), (width * 0.62, receiver_length * 0.86, 0.035), materials["metal"], frame, bevel=0.006)
        teeth = 7 if detail >= 0.75 else 4
        for index in range(teeth):
            cube(f"{weapon_id}_RailTooth_{index}_{label}", (0, rear_y - 0.07 - index * receiver_length * 0.1, sight_z - 0.06), (width * 0.72, 0.024, 0.027), materials["metal"], frame, bevel=0.003)

    if spec["actionStyle"] not in {"pump", "rotary", "coil"}:
        cube(f"{weapon_id}_ActionBlock_{label}", (width * 0.43, -0.01, height * 0.16), (0.055, 0.2, 0.075), materials["metal"], action_part, bevel=0.01)
    stock = add_stock(spec, frame, materials, detail, rear_y)
    magazine = add_magazine(spec, frame, materials, detail, height)
    optic = add_optic(spec, frame, materials, detail, sight_z, receiver_front, muzzle_y)
    add_platform_features(spec, frame, action_part, materials, detail, receiver_front, muzzle_y, barrel_z, sight_z)

    if detail >= 0.75:
        for side in (-1, 1):
            for index in range(4):
                cylinder(f"{weapon_id}_ReceiverPin_{side}_{index}_{label}", (side * width * 0.505, rear_y - 0.09 - index * 0.115, 0.03), 0.008, 0.012, materials["metal"], receiver, rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.001)
        cube(f"{weapon_id}_SerialPlate_{label}", (-width * 0.51, -0.03, -0.015), (0.012, 0.2, 0.075), materials["metal"], receiver, bevel=0.004)

    sockets = {
        "grip-socket-r": ((0, grip_y, -height * 0.93), "rightGrip"),
        "support-socket-l": ((-width * 0.35, receiver_front - 0.23, -height * 0.34), "leftGrip"),
        "reload-socket-l": ((-width * 0.52, 0.07, -height * 0.72), "reload"),
        "magazine-socket": ((0, 0.08, -height * 0.63), "magazine"),
        "muzzle-socket": ((0, muzzle_y - 0.11, barrel_z), "muzzle"),
        "eject-socket": ((width * 0.55, -0.03, height * 0.16), "eject"),
        "optic-socket": ((0, -0.08, sight_z), "optic"),
        "rear-sight-socket": ((0, rear_y - 0.06, sight_z), "sight-rear"),
        "front-sight-socket": ((0, muzzle_y + 0.14, sight_z), "sight-front"),
    }
    for socket_name, (position, semantic) in sockets.items():
        empty(socket_name, position, root, semantic)
    root["declared_length_m"] = length
    root["signature_node_count"] = len(spec["signatureNodes"])
    root["required_signature_nodes_csv"] = ",".join(spec["signatureNodes"])
    action_corpus(driver, action_part, magazine, spec)
    return root


def hierarchy(root):
    return [root, *root.children_recursive]


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


def set_review_clip(root, clip_name=None, frame=1):
    for obj in hierarchy(root):
        animation_data = obj.animation_data
        if not animation_data:
            continue
        for track in animation_data.nla_tracks:
            track.mute = clip_name is None or track.name != clip_name
    bpy.context.scene.frame_set(frame)


def render_reviews(hero_roots):
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.58))
    stage = bpy.context.object
    stage.name = "Pass65_WeaponFamily_ReviewStage"
    stage.data.materials.append(stage_material)
    for name, location, energy, color, size in (
        ("Weapon_Key", (-3.2, -2.6, 3.5), 980, (0.84, 0.9, 1.0), 2.2),
        ("Weapon_Rim", (3.3, 0.8, 2.8), 520, (0.62, 0.78, 0.94), 1.8),
        ("Weapon_Fill", (0.2, 3.8, 1.5), 540, (0.48, 0.62, 0.74), 2.4),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 0.05))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass65_WeaponFamily_ReviewCamera"
    bpy.context.scene.camera = camera
    label_material = simple_material(
        "MAT_Pass65_Weapon_Review_Label",
        (0.73, 0.94, 1.0, 1.0), 0.0, 0.42,
        (0.34, 0.82, 1.0, 1.0), 1.4,
    )
    label_back_material = simple_material(
        "MAT_Pass65_Weapon_Review_Label_Back",
        (0.008, 0.014, 0.02, 1.0), 0.0, 0.82,
    )
    bpy.ops.object.text_add()
    review_label = bpy.context.object
    review_label.name = "Pass65_Weapon_Review_Label"
    review_label.parent = camera
    review_label.location = (0.0, -0.155, -1.0)
    review_label.rotation_euler = (0.0, 0.0, 0.0)
    review_label.data.align_x = "CENTER"
    review_label.data.align_y = "CENTER"
    review_label.data.size = 0.047
    review_label.data.extrude = 0.0006
    review_label.data.materials.append(label_material)
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    review_label_back = bpy.context.object
    review_label_back.name = "Pass65_Weapon_Review_Label_Back"
    review_label_back.parent = camera
    review_label_back.location = (0.0, -0.155, -1.012)
    review_label_back.scale = (0.52, 0.063, 1.0)
    review_label_back.data.materials.append(label_back_material)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_WIDTH
    scene.render.resolution_y = REVIEW_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.011)
    scene.view_settings.look = "AgX - Medium High Contrast"

    all_roots = list(delivery_roots)
    for spec in WEAPONS:
        weapon_id = spec["id"]
        hero = hero_roots[weapon_id]
        world_hero = next(root for root in all_roots if root.get("weapon_id") == weapon_id and root.get("delivery_variant") == "world-lod0")
        world_far = next(root for root in all_roots if root.get("weapon_id") == weapon_id and root.get("delivery_variant") == "world-lod2")
        drop_hero = next(root for root in all_roots if root.get("weapon_id") == weapon_id and root.get("delivery_variant") == "drop-lod0")
        directory = REVIEW_ROOT / weapon_id
        directory.mkdir(parents=True, exist_ok=True)
        distance = 2.5 + spec["length"] * 0.45
        if weapon_id == "m4a1":
            views = (
                ("hero-quarter", hero, (-2.7, 2.85, 1.2), (0, -0.08, -0.035), 68, None, 1),
                ("side-silhouette", hero, (-3.8, 0.02, 0.42), (0, -0.08, -0.045), 66, None, 1),
                # Close first-person/right-side receiver review. This is where
                # ejection, bolt, controls, magwell and stock must survive.
                ("sight-line", hero, (-0.63, 1.12, 0.43), (-0.025, -0.07, 0.015), 68, None, 1),
                ("reload-action", hero, (2.45, 2.65, 1.05), (0, -0.03, -0.09), 68, "reload", 13),
                ("world-lod0-silhouette", world_hero, (-3.8, 0.02, 0.42), (0, -0.08, -0.045), 66, None, 1),
                ("world-lod2-silhouette", world_far, (-3.8, 0.02, 0.42), (0, -0.08, -0.045), 66, None, 1),
                ("drop-lod0-silhouette", drop_hero, (-3.8, 0.02, 0.42), (0, -0.08, -0.045), 66, None, 1),
            )
        elif spec["family"] == "sidearm":
            views = (
                ("hero-quarter", hero, (1.35, 1.55, 0.72), (0, -0.06, -0.1), 62, None, 1),
                ("side-silhouette", hero, (1.75, 0.03, 0.22), (0, -0.07, -0.12), 68, None, 1),
                ("sight-line", hero, (0.34, 1.0, 0.25), (0, -0.12, 0.03), 70, None, 1),
                ("reload-action", hero, (-1.3, 1.4, 0.63), (0, 0.03, -0.16), 62, "reload", 13),
                ("world-lod0-silhouette", world_hero, (1.75, 0.03, 0.22), (0, -0.07, -0.12), 68, None, 1),
                ("world-lod2-silhouette", world_far, (1.75, 0.03, 0.22), (0, -0.07, -0.12), 68, None, 1),
                ("drop-lod0-silhouette", drop_hero, (1.75, 0.03, 0.22), (0, -0.07, -0.12), 68, None, 1),
            )
        else:
            views = (
                ("hero-quarter", hero, (distance * 0.76, distance, 1.15), (0, 0, 0.02), 58, None, 1),
                ("side-silhouette", hero, (distance, 0.1, 0.55), (0, 0, 0.0), 64, None, 1),
                ("sight-line", hero, (0.62, 2.15, 0.48), (0, -0.18, spec["height"] * 0.48), 72, None, 1),
                ("reload-action", hero, (-distance * 0.72, distance * 0.8, 1.0), (0, 0.02, -0.05), 58, "reload", 13),
                ("world-lod0-silhouette", world_hero, (distance, 0.1, 0.55), (0, 0, 0.0), 64, None, 1),
                ("world-lod2-silhouette", world_far, (distance, 0.1, 0.55), (0, 0, 0.0), 64, None, 1),
                ("drop-lod0-silhouette", drop_hero, (distance, 0.1, 0.55), (0, 0, 0.0), 64, None, 1),
            )
        review_roles = {
            "hero-quarter": "FP NEUTRAL",
            "side-silhouette": "FP SIDE",
            "sight-line": "FP ADS",
            "reload-action": "FP RELOAD",
            "world-lod0-silhouette": "WORLD LOD0",
            "world-lod2-silhouette": "WORLD LOD2",
            "drop-lod0-silhouette": "DROP LOD0",
        }
        rendered = []
        for label, review_root, location, target, lens, clip, frame in views:
            for root in all_roots:
                visible = root == review_root
                for obj in hierarchy(root):
                    obj.hide_render = not visible
                    obj.hide_viewport = not visible
            set_review_clip(review_root, clip, frame)
            camera.location = location
            camera.data.lens = lens
            look_at(camera, target)
            review_label.data.body = f"{spec['displayName'].upper()}  /  {review_roles[label]}"
            # High-lens ADS/world cameras magnify camera-parented labels. Keep
            # even the longest real weapon names fully inside a 480 px tile.
            review_label.data.size = min(0.037, 0.78 / len(review_label.data.body))
            path = directory / f"{weapon_id}-{label}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            rendered.append(path)
        loaded = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
        sheet_columns = 4
        sheet_rows = math.ceil(len(rendered) / sheet_columns)
        sheet = bpy.data.images.new(
            f"Pass65_{weapon_id}_ContactSheet",
            REVIEW_WIDTH * sheet_columns,
            REVIEW_HEIGHT * sheet_rows,
            alpha=True,
        )
        pixels = [0.0] * (REVIEW_WIDTH * sheet_columns * REVIEW_HEIGHT * sheet_rows * 4)
        for index, image in enumerate(loaded):
            source = list(image.pixels[:])
            tile_x = (index % sheet_columns) * REVIEW_WIDTH
            tile_y = (sheet_rows - 1 - index // sheet_columns) * REVIEW_HEIGHT
            for row in range(REVIEW_HEIGHT):
                source_start = row * REVIEW_WIDTH * 4
                target_start = ((tile_y + row) * REVIEW_WIDTH * sheet_columns + tile_x) * 4
                pixels[target_start:target_start + REVIEW_WIDTH * 4] = source[source_start:source_start + REVIEW_WIDTH * 4]
        sheet.pixels = pixels
        sheet.file_format = "PNG"
        sheet.filepath_raw = str(directory / f"{weapon_id}-contact-sheet.png")
        sheet.save()
        for image in loaded:
            bpy.data.images.remove(image)
        bpy.data.images.remove(sheet)
        set_review_clip(hero)

    # One deterministic corpus sheet makes cross-family silhouette duplication
    # visible in a single review artifact instead of hiding it across 17 folders.
    columns = 5
    rows = math.ceil(len(WEAPONS) / columns)
    tile_width = REVIEW_WIDTH
    tile_height = REVIEW_HEIGHT
    corpus = bpy.data.images.new(
        "Pass65_WeaponFamily_CorpusContactSheet",
        tile_width * columns,
        tile_height * rows,
        alpha=True,
    )
    corpus_pixels = [0.0] * (tile_width * columns * tile_height * rows * 4)
    corpus_images = []
    for index, spec in enumerate(WEAPONS):
        path = REVIEW_ROOT / spec["id"] / f"{spec['id']}-hero-quarter.png"
        review = bpy.data.images.load(str(path), check_existing=False)
        corpus_images.append(review)
        source = list(review.pixels[:])
        tile_x = (index % columns) * tile_width
        tile_y = (rows - 1 - index // columns) * tile_height
        for row in range(tile_height):
            source_start = row * tile_width * 4
            target_start = ((tile_y + row) * tile_width * columns + tile_x) * 4
            corpus_pixels[target_start:target_start + tile_width * 4] = source[source_start:source_start + tile_width * 4]
    corpus.pixels = corpus_pixels
    corpus.file_format = "PNG"
    corpus_path = (
        SOURCE_BLEND.parent / "pass65-weapon-family-preview-contact-sheet.png"
        if PREVIEW_IDS
        else REVIEW_ROOT / "pass65-weapon-family-contact-sheet.png"
    )
    corpus.filepath_raw = str(corpus_path)
    corpus.save()
    for review in corpus_images:
        bpy.data.images.remove(review)
    bpy.data.images.remove(corpus)


reset()
materials_by_weapon = {}
for weapon in WEAPONS:
    weapon_images = {kind: make_texture(weapon, kind) for kind in ("baseColor", "normal", "roughness", "metallic")}
    polymer_images = {
        **weapon_images,
        "baseColor": make_texture(weapon, "polymerBaseColor"),
        "roughness": make_texture(weapon, "polymerRoughness"),
        "metallic": make_texture(weapon, "polymerMetallic"),
    }
    safe_id = weapon["id"].replace("-", "_")
    primary_rgb = hex_rgb(weapon["primary"])
    raw_accent = hex_rgb(weapon["accent"])
    primary = (*primary_rgb, 1.0)
    accent_amount = 0.78 if weapon["id"] in {"railgun", "smg"} else 0.62 if weapon["id"] == "ak-47" else 0.32
    accent = (*mix_rgb(primary_rgb, raw_accent, accent_amount), 1.0)
    polymer = (*hex_rgb(weapon["polymer"]), 1.0)
    gunmetal = (*mix_rgb(primary_rgb, (0.075, 0.085, 0.095), 0.58), 1.0)
    wood = (*mix_rgb((0.12, 0.045, 0.022), raw_accent, 0.24), 1.0)
    lens_emission = (*mix_rgb((0.01, 0.05, 0.065), raw_accent, 0.34), 1.0)
    materials_by_weapon[weapon["id"]] = {
        "primary": textured_material(f"MAT_Pass65_{safe_id}_Primary_PBR", weapon_images),
        "polymer": textured_material(f"MAT_Pass65_{safe_id}_Polymer_PBR", polymer_images, tint=(0.48, 0.5, 0.5, 1.0), roughness=0.68, metallic=0.12),
        "accent": simple_material(f"MAT_Pass65_{safe_id}_Accent", accent, 0.42, 0.46),
        "metal": simple_material(f"MAT_Pass65_{safe_id}_Gunmetal", gunmetal, 0.9, 0.3),
        "wood": textured_material(
            f"MAT_Pass65_{safe_id}_LaminateWood_PBR", polymer_images,
            tint=wood, roughness=0.72, metallic=0.015,
        ),
        "rubber": simple_material(f"MAT_Pass65_{safe_id}_Rubber", polymer, 0.02, 0.9),
        "lens": simple_material(f"MAT_Pass65_{safe_id}_Lens", (0.012, 0.055, 0.072, 1), 0.18, 0.13, lens_emission, 0.42),
        "emissive": simple_material(f"MAT_Pass65_{safe_id}_Emissive", accent, 0.3, 0.24, accent, 1.3 if weapon["id"] == "railgun" else 0.6),
    }
stage_material = simple_material("MAT_Pass65_WeaponFamily_ReviewStage", (0.012, 0.017, 0.023, 1), 0.1, 0.6)

delivery_roots = []
hero_roots = {}
for weapon in WEAPONS:
    for delivery in DELIVERIES:
        root = build_weapon(weapon, delivery, materials_by_weapon[weapon["id"]])
        delivery_roots.append(root)
        if delivery["variant"] == "first-person-lod0":
            hero_roots[weapon["id"]] = root
        export_root(root, f"{weapon['id']}-{delivery['suffix']}")

render_reviews(hero_roots)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
for weapon in WEAPONS:
    counts = []
    for delivery in DELIVERIES:
        root = next(candidate for candidate in delivery_roots if candidate.get("weapon_id") == weapon["id"] and candidate.get("delivery_variant") == delivery["variant"])
        meshes = [obj for obj in hierarchy(root) if obj.type == "MESH"]
        triangles = sum(len(polygon.vertices) - 2 for obj in meshes for polygon in obj.data.polygons)
        counts.append(f"{delivery['suffix']}={len(meshes)}m/{triangles}t")
    print(f"PASS65_WEAPON_{weapon['id']}_READY {' '.join(counts)}")
print(f"BLEND={SOURCE_BLEND}")
print(f"RAW_DIR={RAW_DIR}")
print(f"REVIEW_ROOT={REVIEW_ROOT}")
