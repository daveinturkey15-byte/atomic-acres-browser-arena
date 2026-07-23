#!/usr/bin/env python3
"""Deterministically author Atomic Acres' complete Blender Render environment.

This script uses only Blender primitives and project-authored material values. It reads
the checked-in arena spec generated from authoritative TypeScript architecture and
writes an editable .blend, a self-contained GLB, and a local preview render.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "source-assets/blender/atomic-acres-arena-spec.json"
BLEND_PATH = ROOT / "source-assets/blender/atomic-acres-blender-arena.blend"
GLB_PATH = ROOT / "public/assets/original/models/atomic-acres-blender-arena.glb"
PREVIEW_PATH = ROOT / "artifacts/blender-render/atomic-acres-blender-arena-preview.png"
TEXTURE_ROOT = ROOT / "public/assets/original/textures"

for path in (BLEND_PATH, GLB_PATH, PREVIEW_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)

spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

env = bpy.data.collections.new("Atomic_Acres_Blender_Render")
bpy.context.scene.collection.children.link(env)


def rgba(hex_value: int, alpha: float = 1.0) -> tuple[float, float, float, float]:
    return (
        ((hex_value >> 16) & 255) / 255.0,
        ((hex_value >> 8) & 255) / 255.0,
        (hex_value & 255) / 255.0,
        alpha,
    )


LOADED_TEXTURES: dict[str, bpy.types.Image] = {}


def load_authored_texture(filename: str, color_space: str = "sRGB") -> bpy.types.Image:
    existing = LOADED_TEXTURES.get(filename)
    if existing is not None:
        return existing
    path = TEXTURE_ROOT / filename
    if not path.is_file():
        raise FileNotFoundError(f"Missing project-authored arena texture: {path}")
    image = bpy.data.images.load(str(path), check_existing=True)
    image.name = f"TEX_{path.stem}"
    image.colorspace_settings.name = color_space
    image.pack()
    LOADED_TEXTURES[filename] = image
    return image


def make_material(name: str, color: int, roughness: float, metallic: float = 0.0,
                  alpha: float = 1.0, emission: int | None = None, emission_strength: float = 0.0,
                  texture: str | None = None, tile_metres: float = 2.5,
                  texture_tint: int | None = None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if texture is not None:
        image_node = material.node_tree.nodes.new("ShaderNodeTexImage")
        image_node.name = f"Authored_{Path(texture).stem}"
        image_node.label = "Project-authored embedded albedo"
        image_node.image = load_authored_texture(texture)
        image_node.interpolation = "Linear"
        image_node.extension = "REPEAT"
        if texture_tint is None:
            material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            tint = material.node_tree.nodes.new("ShaderNodeMixRGB")
            tint.name = f"Authored_{Path(texture).stem}_tint"
            tint.label = "Project-authored albedo tint"
            tint.blend_type = "COLOR"
            tint.inputs[0].default_value = 0.78
            tint.inputs[2].default_value = rgba(texture_tint)
            material.node_tree.links.new(image_node.outputs["Color"], tint.inputs[1])
            material.node_tree.links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])
            material["atomic_texture_tint"] = f"#{texture_tint:06x}"
        material["atomic_texture"] = texture
        material["atomic_tile_metres"] = tile_metres
        stem = Path(texture).stem
        normal_filename = f"{stem}-normal.png"
        roughness_filename = f"{stem}-roughness.png"
        if (TEXTURE_ROOT / normal_filename).is_file():
            normal_image = material.node_tree.nodes.new("ShaderNodeTexImage")
            normal_image.name = f"Authored_{stem}_normal"
            normal_image.label = "Project-authored embedded tangent normal"
            normal_image.image = load_authored_texture(normal_filename, "Non-Color")
            normal_image.interpolation = "Linear"
            normal_image.extension = "REPEAT"
            normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
            normal_map.inputs["Strength"].default_value = 0.72
            material.node_tree.links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
            material.node_tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
            material["atomic_normal_texture"] = normal_filename
        if (TEXTURE_ROOT / roughness_filename).is_file():
            roughness_image = material.node_tree.nodes.new("ShaderNodeTexImage")
            roughness_image.name = f"Authored_{stem}_roughness"
            roughness_image.label = "Project-authored embedded roughness"
            roughness_image.image = load_authored_texture(roughness_filename, "Non-Color")
            roughness_image.interpolation = "Linear"
            roughness_image.extension = "REPEAT"
            material.node_tree.links.new(roughness_image.outputs["Color"], bsdf.inputs["Roughness"])
            material["atomic_roughness_texture"] = roughness_filename
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = rgba(emission)
        strength_input = bsdf.inputs.get("Emission Strength")
        if strength_input is not None:
            strength_input.default_value = emission_strength
    if alpha < 1:
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        else:
            material.blend_method = "BLEND"
        if hasattr(material, "use_transparency_overlap"):
            material.use_transparency_overlap = False
    return material


M = {
    "grass": make_material("MAT_ground_olive", 0x56644C, 0.98, texture="grass-turf.png", tile_metres=3.2),
    "earth": make_material("MAT_earth_edge", 0x3A3329, 1.0),
    "asphalt": make_material("MAT_asphalt_charcoal", 0x292F31, 0.96, texture="asphalt-aged.png", tile_metres=3.4),
    "concrete": make_material("MAT_concrete_weathered", 0x7B7D76, 0.9, texture="concrete-poured.png", tile_metres=2.8),
    "boundary": make_material(
        "MAT_boundary_warm_concrete", 0xB9B29E, 0.92,
        texture="concrete-poured.png", tile_metres=3.8, texture_tint=0xD8D1BE,
    ),
    "concrete_dark": make_material("MAT_concrete_dark", 0x454B4D, 0.92, texture="roof-shingles.png", tile_metres=2.4),
    "aqua": make_material("MAT_aqua_oxidized", 0x356E73, 0.73, 0.05, texture="siding-aqua.png", tile_metres=2.6),
    "coral": make_material("MAT_coral_oxide", 0x8B4B40, 0.76, 0.04, texture="siding-coral.png", tile_metres=2.6),
    "aqua_upper": make_material("MAT_aqua_upper_brick", 0x638B87, 0.82, 0.03, texture="brick-warm.png", tile_metres=2.15, texture_tint=0xA9C8C2),
    "coral_upper": make_material("MAT_coral_upper_plaster", 0xB26F5D, 0.86, 0.02, texture="plaster-warm.png", tile_metres=3.15, texture_tint=0xF2B6A2),
    "aqua_rear": make_material("MAT_aqua_rear_plaster", 0x819D97, 0.88, 0.02, texture="plaster-warm.png", tile_metres=2.45, texture_tint=0xBFE0DA),
    "coral_rear": make_material("MAT_coral_rear_brick", 0x805244, 0.9, 0.02, texture="brick-warm.png", tile_metres=2.6),
    "plaster": make_material("MAT_plaster_sand", 0xB8AE95, 0.9, texture="plaster-warm.png", tile_metres=2.8),
    "trim": make_material("MAT_trim_bone", 0xD4CBB7, 0.67, texture="plaster-warm.png", tile_metres=2.1),
    "brick": make_material("MAT_brick_brown", 0x6F4436, 0.91, texture="brick-warm.png", tile_metres=2.4),
    "timber": make_material("MAT_timber_dark", 0x574334, 0.9, texture="wood-deck.png", tile_metres=2.2),
    "metal": make_material("MAT_gunmetal", 0x2F3B40, 0.48, 0.62, texture="weapon-gunmetal.png", tile_metres=2.4),
    "metal_light": make_material("MAT_brushed_alloy", 0x7E898B, 0.41, 0.68),
    "roof": make_material("MAT_roof_shingles", 0x343B3D, 0.88, texture="roof-shingles.png", tile_metres=2.5),
    "yellow": make_material("MAT_hazard_amber", 0xC79A32, 0.54, 0.16),
    "rubber": make_material("MAT_rubber", 0x15191A, 0.84),
    "glass": make_material("MAT_glass_tactical", 0x5E9AA5, 0.18, 0.16, 0.42),
    "foliage": make_material("MAT_foliage_military", 0x405D3D, 0.97, texture="grass-turf.png", tile_metres=1.8),
    "fabric_aqua": make_material("MAT_upholstery_aqua_weave", 0x5A858A, 0.96, texture="fabric-weave.png", tile_metres=0.42),
    "fabric_coral": make_material("MAT_upholstery_coral_weave", 0x9A6258, 0.96, texture="fabric-weave.png", tile_metres=0.42),
    "fabric_neutral": make_material("MAT_bedding_neutral_weave", 0xD0C7B5, 0.98, texture="fabric-weave.png", tile_metres=0.38),
    "emissive_aqua": make_material("MAT_emissive_aqua", 0x55BDBB, 0.34, 0.22, emission=0x319C9A, emission_strength=1.8),
    "emissive_amber": make_material("MAT_emissive_amber", 0xDDAF5B, 0.37, 0.14, emission=0xC9832F, emission_strength=2.0),
    "grow_violet": make_material("MAT_route_grow_violet", 0xB08BC7, 0.32, 0.08, emission=0x8A55B8, emission_strength=3.2),
}


def link_only_env(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    env.objects.link(obj)


def game_location(position):
    x, y, z = position
    return (x, -z, y)


def game_dimensions(size):
    x, y, z = size
    return (x, z, y)


def apply_box_uvs(obj, material):
    """Project each box face in local metres so textures retain a stable world scale."""
    tile_metres = float(material.get("atomic_tile_metres", 0.0))
    if tile_metres <= 0:
        return
    mesh = obj.data
    uv_layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        normal = polygon.normal
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if abs(normal.z) >= abs(normal.x) and abs(normal.z) >= abs(normal.y):
                u, v = vertex.x, vertex.y
            elif abs(normal.x) >= abs(normal.y):
                u, v = vertex.y, vertex.z
            else:
                u, v = vertex.x, vertex.z
            uv_layer.data[loop_index].uv = (u / tile_metres, v / tile_metres)


def scale_existing_uvs(obj, material):
    tile_metres = float(material.get("atomic_tile_metres", 0.0))
    uv_layer = obj.data.uv_layers.active
    if tile_metres <= 0 or uv_layer is None:
        return
    repeats = max(1.0, max(obj.dimensions) / tile_metres)
    for loop in uv_layer.data:
        loop.uv *= repeats


def add_box(name: str, position, size, material, bevel: float = 0.04, rotation=(0.0, 0.0, 0.0), semantic: str | None = None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game_location(position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = game_dimensions(size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("authored_edge_bevel", "BEVEL")
        modifier.width = min(bevel, min(obj.dimensions) * 0.22)
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    apply_box_uvs(obj, material)
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    if semantic:
        obj["atomic_window_id"] = semantic
        obj["atomic_semantic"] = "breakable-window"
    link_only_env(obj)
    return obj


def add_cylinder(name: str, position, radius: float, depth: float, material, vertices=12, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=game_location(position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    scale_existing_uvs(obj, material)
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


def add_uv_sphere(name: str, position, scale, material, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=max(8, segments), ring_count=max(6, rings), radius=1,
        location=game_location(position),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = game_dimensions(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    scale_existing_uvs(obj, material)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


def add_torus(name: str, position, major: float, minor: float, material, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=6,
                                    location=game_location(position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    scale_existing_uvs(obj, material)
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


def add_transit_bus(prefix: str, centre, length: float, body_material, destination: str):
    """Build a complete original bus asset around an existing collision footprint."""
    x, z = centre
    half = length / 2
    add_box(f"{prefix}_body_lower", [x, 1.25, z], [5.2, 2.2, length], M["metal"], 0.24)
    add_box(f"{prefix}_body_colour", [x, 2.15, z], [5.0, 2.25, length - 0.35], body_material, 0.3)
    add_box(f"{prefix}_roof", [x, 3.52, z], [4.75, 0.34, length - 0.7], M["trim"], 0.14)
    # Original Atomic Acres civic-showcase trim, held inside the existing footprint.
    add_box(f"{prefix}_roof_visor", [x, 3.58, z - half - 0.18], [4.3, 0.18, 0.55], body_material, 0.08)
    add_box(f"{prefix}_front_glass", [x, 2.55, z - half - 0.015], [4.12, 1.24, 0.09], M["glass"], 0.03)
    add_box(f"{prefix}_windshield_divider", [x, 2.55, z - half - 0.075], [0.12, 1.26, 0.08], M["metal"], 0.02)
    add_box(f"{prefix}_rear_glass", [x, 2.52, z + half + 0.015], [3.95, 1.12, 0.09], M["glass"], 0.03)
    add_box(f"{prefix}_front_fascia", [x, 1.42, z - half - 0.07], [4.82, 0.94, 0.14], body_material, 0.05)
    add_box(f"{prefix}_front_grille", [x, 0.92, z - half - 0.16], [2.35, 0.38, 0.08], M["metal_light"], 0.03)
    for grille_x in (-0.8, -0.4, 0, 0.4, 0.8):
        add_box(f"{prefix}_grille_slot_{grille_x}", [x + grille_x, 0.92, z - half - 0.26], [0.06, 0.28, 0.03], M["metal"], 0.01)
    window_count = 5 if length > 12 else 4
    for side in (-1, 1):
        for index in range(window_count):
            wz = z - half + 1.5 + index * ((length - 3.0) / max(1, window_count - 1))
            add_box(f"{prefix}_side_window_{side}_{index}", [x + side * 2.53, 2.54, wz], [0.07, 1.18, 1.62], M["glass"], 0.025)
        add_box(f"{prefix}_side_identity_stripe_{side}", [x + side * 2.64, 1.54, z], [0.06, 0.18, length - 0.7], M["trim"], 0.018)
        add_box(f"{prefix}_side_sweep_{side}", [x + side * 2.67, 1.86, z + 0.35], [0.05, 0.42, length - 2.2], body_material, 0.025)
        door_z = z - half + (2.25 if side > 0 else length - 2.25)
        frame_x = x + side * 2.67
        add_box(f"{prefix}_door_frame_{side}_top", [frame_x, 2.975, door_z], [0.08, 0.1, 1.7], M["metal_light"], 0.02)
        add_box(f"{prefix}_door_frame_{side}_bottom", [frame_x, 1.125, door_z], [0.08, 0.1, 1.7], M["metal_light"], 0.02)
        for frame_z in (-0.8, 0, 0.8):
            add_box(f"{prefix}_door_frame_{side}_upright_{frame_z}", [frame_x, 2.05, door_z + frame_z], [0.08, 1.75, 0.1], M["metal_light"], 0.02)
        for leaf in (-1, 1):
            add_box(f"{prefix}_door_glass_{side}_{leaf}", [x + side * 2.615, 2.05, door_z + leaf * 0.41], [0.055, 1.75, 0.68], M["glass"], 0.018)
        add_box(f"{prefix}_step_{side}", [x + side * 2.72, 0.42, door_z], [0.42, 0.18, 1.45], M["metal_light"], 0.025)
    for wheel_x in (x - 2.48, x + 2.48):
        for wheel_z in (z - half + 2.2, z + half - 2.2):
            add_cylinder(f"{prefix}_wheel_{wheel_x}_{wheel_z}", [wheel_x, 0.72, wheel_z], 0.72, 0.42, M["rubber"], 20, rotation=(0, math.pi / 2, 0))
            add_cylinder(f"{prefix}_wheel_hub_{wheel_x}_{wheel_z}", [wheel_x + (-0.23 if wheel_x < x else 0.23), 0.72, wheel_z], 0.28, 0.06, M["metal_light"], 16, rotation=(0, math.pi / 2, 0))
    for end, end_z in (("front", z - half - 0.08), ("rear", z + half + 0.08)):
        add_box(f"{prefix}_{end}_bumper", [x, 0.58, end_z], [5.25, 0.32, 0.22], M["metal_light"], 0.07)
        for side in (-1, 1):
            add_uv_sphere(f"{prefix}_{end}_lamp_{side}", [x + side * 1.75, 1.35, end_z + (-0.08 if end == "front" else 0.08)], [0.22, 0.16, 0.08], M["emissive_amber"])
    add_box(f"{prefix}_destination", [x, 3.05, z - half - 0.15], [3.35, 0.48, 0.08], M["emissive_aqua"], 0.025)
    add_box(f"{prefix}_number_plate", [x, 0.58, z - half - 0.22], [1.15, 0.28, 0.04], M["yellow"], 0.018)
    for side in (-1, 1):
        add_box(f"{prefix}_mirror_arm_{side}", [x + side * 2.85, 2.25, z - half + 0.55], [0.58, 0.08, 0.08], M["metal"], 0.02)
        add_box(f"{prefix}_mirror_{side}", [x + side * 3.12, 2.25, z - half + 0.55], [0.1, 0.42, 0.3], M["glass"], 0.03)
    marker = bpy.data.objects.new(f"{prefix}_ASSET_{destination}", None)
    marker.location = game_location((x, 1.8, z))
    marker["atomic_asset_class"] = "physical-transit-bus"
    marker["atomic_asset_variant"] = destination
    marker["atomic_collision_authority"] = "typescript-vehicle-boxes"
    env.objects.link(marker)


# Ground and road hierarchy.
roadway = spec["roadway"]
add_box("BLD_TERRAIN_foundation", roadway["ground"]["position"], roadway["ground"]["size"], M["earth"], 0)
# Keep grass and road on disjoint footprints. Pass 23 layered both surfaces at
# the same top elevation, creating broad coplanar z-fighting and unstable light.
for side, x in (("west", -28.6), ("east", 28.6)):
    add_box(f"BLD_TERRAIN_grass_{side}", [x, 0.015, 0], [28.8, 0.03, 98], M["grass"], 0)
add_box("BLD_ROAD_asphalt", roadway["road"]["position"], roadway["road"]["size"], M["asphalt"], 0)
for index, item in enumerate(roadway["curbs"]): add_box(f"BLD_ROAD_curb_{index}", item["position"], item["size"], M["concrete"], 0.03)
for index, item in enumerate(roadway["sidewalks"]): add_box(f"BLD_ROAD_sidewalk_{index}", item["position"], item["size"], M["concrete"], 0.02)
for index, item in enumerate(roadway["laneMarkers"]): add_box(f"BLD_ROAD_lane_{index}", item["position"], item["size"], M["yellow"], 0)
for index, item in enumerate(roadway["crosswalks"]): add_box(f"BLD_ROAD_crosswalk_{index}", item["position"], item["size"], M["trim"], 0)
# Flush storm drains and utility access plates add modern street-scale material
# response without creating visible cover or changing TypeScript collision.
for side in (-1, 1):
    for index, z in enumerate((-31, -15, 1, 17, 33)):
        add_box(f"BLD_ROAD_drain_{side}_{index}", [side * 9.18, 0.056, z], [0.62, 0.032, 1.2], M["metal"], 0.015)
for index, (x, z, width, depth) in enumerate(((-3.2, -28, 3.4, 5.2), (3.5, 27, 4.2, 4.6), (2.8, 4, 2.8, 3.5))):
    add_box(f"BLD_ROAD_repair_{index}", [x, 0.059, z], [width, 0.012, depth], M["asphalt"], 0.02)

# Full two-storey house shells, floors, frames, rails, ramps and semantic glass.
surface_material = {
    "aqua": M["aqua"], "coral": M["coral"], "plaster": M["plaster"], "brick": M["brick"],
    "timber": M["timber"], "concrete": M["concrete"], "trim": M["trim"], "glass": M["glass"],
    "metal": M["metal"], "ceiling": M["plaster"], "light": M["emissive_amber"],
}
for house_index, house in enumerate(spec["houses"]):
    prefix = "AQUA" if house["team"] == 0 else "CORAL"
    for solid_index, solid in enumerate(house["solids"]):
        semantic = solid["id"] if solid["kind"] == "glass" and solid["breakable"] else None
        rotation = tuple(solid.get("rotation") or (0, 0, 0))
        solid_material = surface_material[solid["surface"]]
        # The upper slab needs two readable faces: a pale ceiling below and a
        # timber walking surface above. Rendering the whole 32 cm slab as dark
        # timber made it read as a huge floating roof from the ground floor.
        upper_floor = solid["name"].startswith("upper-floor-")
        if upper_floor:
            solid_material = M["plaster"]
        if solid["surface"] in ("aqua", "coral"):
            if "upper" in solid["name"]:
                solid_material = M["aqua_upper"] if house["team"] == 0 else M["coral_upper"]
            elif solid["name"].startswith("rear-ground"):
                solid_material = M["aqua_rear"] if house["team"] == 0 else M["coral_rear"]
        add_box(
            f"BLD_HOUSE_{prefix}_{solid_index:03d}_{solid['name']}", solid["position"], solid["size"],
            solid_material, 0.025 if solid["kind"] != "glass" else 0,
            rotation=rotation, semantic=semantic,
        )
        if upper_floor:
            position = list(solid["position"])
            size = list(solid["size"])
            position[1] += size[1] / 2 + 0.012
            add_box(
                f"BLD_HOUSE_{prefix}_{solid_index:03d}_{solid['name']}_timber_wear_surface",
                position, [size[0], 0.024, size[2]], M["timber"], 0,
            )
    x, z = house["origin"]["x"], house["origin"]["z"]
    facing = house["origin"]["facing"]
    width, depth = house["dimensions"]["width"], house["dimensions"]["depth"]
    accent = M["aqua"] if house["team"] == 0 else M["coral"]
    add_box(f"BLD_HOUSE_{prefix}_roof", [x, 7.18, z], [width + 0.8, 0.48, depth + 0.8], M["roof"], 0.08)
    # Give the upper rooms a light, continuous soffit. Exposing the dark roof
    # shingle underside made every internal doorway read as a black rectangle.
    add_box(f"BLD_HOUSE_{prefix}_upper_ceiling_soffit", [x, 6.92, z], [width - 0.24, 0.04, depth - 0.24], M["plaster"], 0)
    # Upper-storey exterior walls keep their team colour outside, but a pale
    # interior lining prevents the siding texture from reading as blue/green
    # timber floating above the open ground floor.
    upper_wall_solids = [solid for solid in house["solids"] if (
        solid["surface"] in ("aqua", "coral")
        and (solid["name"].startswith("upper-") or solid["name"].startswith("front-upper"))
    )]
    for lining_index, solid in enumerate(upper_wall_solids):
        lining_position = list(solid["position"])
        lining_size = list(solid["size"])
        if lining_size[0] < lining_size[2]:
            lining_position[0] += 0.235 if lining_position[0] < x else -0.235
            lining_size[0] = 0.035
        else:
            lining_position[2] += 0.235 if lining_position[2] < z else -0.235
            lining_size[2] = 0.035
        add_box(
            f"BLD_HOUSE_{prefix}_upper_interior_lining_{lining_index:02d}_{solid['name']}",
            lining_position, lining_size, M["plaster"], 0,
        )
    # Both upper rooms get an unmistakable warm ceiling panel. This makes an
    # open route read as a lit room rather than a black door leaf from outside.
    for room_index, room_z in enumerate((z - facing * 3.2, z + facing * 3.2)):
        add_box(
            f"BLD_HOUSE_{prefix}_upper_room_light_{room_index}",
            [x, 6.875, room_z], [4.8, 0.025, 1.1], M["emissive_amber"], 0.02,
        )
    # Deliberately asymmetric model-home trim preserves every structural opening.
    for side in (-1, 1):
        add_box(f"BLD_HOUSE_{prefix}_corner_{side}", [x + side * (width / 2 + 0.06), 3.55, z], [0.18, 7.1, depth + 0.25], M["metal"], 0.02)
    facade_z = z + facing * (depth / 2 + 0.24)
    add_box(f"BLD_HOUSE_{prefix}_facade_band", [x, 6.35, facade_z], [14.8, 0.34, 0.18], accent, 0.035)
    for offset in (-7.0, 7.0):
        add_box(f"BLD_HOUSE_{prefix}_facade_endcap_{offset}", [x + offset, 5.45, facade_z], [0.28, 2.15, 0.22], M["trim"], 0.035)
    feature_x = x + (-4.3 if house["team"] == 0 else 4.3)
    add_box(f"BLD_HOUSE_{prefix}_feature_panel", [feature_x, 5.18, facade_z + facing * 0.06], [2.2, 1.7, 0.12], accent, 0.06)
    for stripe in (-0.65, 0.0, 0.65):
        add_box(f"BLD_HOUSE_{prefix}_feature_reveal_{stripe}", [feature_x + stripe, 5.18, facade_z + facing * 0.14], [0.06, 1.45, 0.06], M["trim"], 0.015)
    add_box(f"BLD_HOUSE_{prefix}_roof_plant", [x + 4.8, 7.52, z - facing * 2.2], [2.5, 0.58, 1.7], M["boundary"], 0.12)
    for offset in (-0.72, 0.72):
        add_box(f"BLD_HOUSE_{prefix}_roof_vent_{offset}", [x + 4.8 + offset, 7.92, z - facing * 2.2], [0.1, 0.24, 1.15], M["metal_light"], 0.02)
    # Lightweight entrance canopy and recessed wayfinding light: presentation
    # only, above the traversal envelope, batched into existing materials.
    entrance_z = z + facing * (depth / 2 + 0.58)
    entrance_x = x + (0.55 if house["team"] == 0 else -0.55)
    add_box(f"BLD_HOUSE_{prefix}_entrance_canopy", [entrance_x, 3.05, entrance_z], [4.4, 0.16, 1.4], M["metal"], 0.04)
    for side in (-1, 1):
        add_box(f"BLD_HOUSE_{prefix}_entrance_frame_{side}", [entrance_x + side * 2.05, 1.65, entrance_z - facing * 0.34], [0.18, 2.8, 0.18], accent, 0.025)
    add_box(f"BLD_HOUSE_{prefix}_entrance_light", [x, 2.92, entrance_z - facing * 0.18], [2.4, 0.05, 0.12], M["emissive_aqua"] if house["team"] == 0 else M["emissive_amber"], 0.01)
    for side in (-1, 1):
        add_box(f"BLD_HOUSE_{prefix}_window_hood_{side}", [x + side * 5.7, 5.62, z + facing * (depth / 2 + 0.35)], [3.2, 0.1, 0.62], M["metal_light"], 0.025)

# Authored interior asset sets replace the old single-box furniture silhouettes.
# They sit against room edges so traversal openings and fast combat routes remain clear.
for house_index, house in enumerate(spec["houses"]):
    x, z = house["origin"]["x"], house["origin"]["z"]
    facing = house["origin"]["facing"]
    prefix = "AQUA" if house["team"] == 0 else "CORAL"
    fabric = M["fabric_aqua"] if house["team"] == 0 else M["fabric_coral"]
    accent = M["aqua"] if house["team"] == 0 else M["coral"]

    table_x, table_z = x - 3.0, z - facing * 2.7
    add_box(f"P32_FURN_{prefix}_dining_top", [table_x, 0.91, table_z], [2.6, 0.16, 1.25], M["timber"], 0.07)
    for lx in (-1.08, 1.08):
        for lz in (-0.46, 0.46):
            add_box(f"P32_FURN_{prefix}_dining_leg_{lx}_{lz}", [table_x + lx, 0.45, table_z + lz], [0.13, 0.9, 0.13], M["metal_light"], 0.025)
    add_uv_sphere(f"P32_FURN_{prefix}_table_bowl", [table_x, 1.08, table_z], [0.34, 0.12, 0.34], M["trim"], 16, 8)
    for chair_index, (cx, cz, rotation) in enumerate((
        (table_x - 1.72, table_z, math.pi / 2), (table_x + 1.72, table_z, -math.pi / 2),
        (table_x, table_z - 1.05, 0), (table_x, table_z + 1.05, math.pi),
    )):
        add_box(f"P32_FURN_{prefix}_chair_seat_{chair_index}", [cx, 0.57, cz], [0.62, 0.14, 0.62], fabric, 0.06, rotation=(0, rotation, 0))
        add_box(f"P32_FURN_{prefix}_chair_back_{chair_index}", [cx, 1.03, cz + math.cos(rotation) * 0.28], [0.58, 0.82, 0.12], fabric, 0.06, rotation=(0, rotation, 0))
        for ox in (-0.22, 0.22):
            for oz in (-0.22, 0.22):
                add_box(f"P32_FURN_{prefix}_chair_leg_{chair_index}_{ox}_{oz}", [cx + ox, 0.27, cz + oz], [0.08, 0.54, 0.08], M["metal"], 0.018)

    sofa_x, sofa_z = x + 3.7, z + facing * 2.7
    add_box(f"P32_FURN_{prefix}_sofa_base", [sofa_x, 0.32, sofa_z], [3.0, 0.62, 1.15], M["timber"], 0.13)
    for cushion in (-0.95, 0, 0.95):
        add_box(f"P32_FURN_{prefix}_sofa_cushion_{cushion}", [sofa_x + cushion, 0.68, sofa_z - facing * 0.08], [0.86, 0.22, 0.9], fabric, 0.13)
        add_box(f"P32_FURN_{prefix}_sofa_back_{cushion}", [sofa_x + cushion, 1.14, sofa_z + facing * 0.48], [0.88, 0.82, 0.24], fabric, 0.12)
    for side in (-1, 1):
        add_box(f"P32_FURN_{prefix}_sofa_arm_{side}", [sofa_x + side * 1.48, 0.74, sofa_z], [0.22, 0.72, 1.08], fabric, 0.1)

    # Edge-aligned galley, rug and decor make this a staged model home without
    # filling the central traversal envelope with implied cover.
    kitchen_z = z - facing * 5.25
    for cabinet_index, cabinet_x in enumerate((x - 5.25, x - 3.9, x - 2.55, x - 1.2)):
        add_box(f"P32_FURN_{prefix}_kitchen_base_{cabinet_index}", [cabinet_x, 0.52, kitchen_z], [1.2, 0.95, 0.62], M["trim"], 0.045)
        add_box(f"P32_FURN_{prefix}_kitchen_upper_{cabinet_index}", [cabinet_x, 1.85, kitchen_z - facing * 0.05], [1.2, 0.85, 0.5], M["boundary"], 0.035)
    add_box(f"P32_FURN_{prefix}_kitchen_counter", [x - 3.23, 1.04, kitchen_z + facing * 0.04], [5.5, 0.13, 0.72], M["timber"], 0.035)
    add_box(f"P32_FURN_{prefix}_kitchen_fridge", [x - 6.45, 1.12, kitchen_z], [1.05, 2.15, 0.72], M["metal_light"], 0.06)
    add_box(f"P32_FURN_{prefix}_living_rug", [sofa_x - 0.3, 0.095, sofa_z - facing * 1.5], [4.0, 0.035, 2.2], fabric, 0.025)
    add_box(f"P32_FURN_{prefix}_coffee_table", [sofa_x - 0.3, 0.42, sofa_z - facing * 1.5], [1.8, 0.22, 0.82], M["timber"], 0.08)
    for leg_x in (-0.7, 0.7):
        for leg_z in (-0.29, 0.29):
            add_box(
                f"P32_FURN_{prefix}_coffee_table_leg_{leg_x}_{leg_z}",
                [sofa_x - 0.3 + leg_x, 0.2, sofa_z - facing * 1.5 + leg_z],
                [0.1, 0.4, 0.1], M["metal"], 0.018,
            )
    for art_index, art_x in enumerate((x + 1.8, x + 3.2)):
        add_box(f"P32_FURN_{prefix}_wall_art_{art_index}", [art_x, 1.85, z + facing * 5.28], [1.05, 0.78, 0.06], accent, 0.025)

    console_x, console_z = x + 3.7, z - facing * 3.1
    add_box(f"P32_FURN_{prefix}_media_cabinet", [console_x, 0.46, console_z], [2.45, 0.9, 0.62], M["timber"], 0.08)
    add_box(f"P32_FURN_{prefix}_media_screen_frame", [console_x, 1.55, console_z + facing * 0.18], [2.2, 1.25, 0.14], M["metal"], 0.06)
    add_box(f"P32_FURN_{prefix}_media_screen", [console_x, 1.56, console_z + facing * 0.27], [1.88, 0.95, 0.04], M["emissive_aqua"], 0.025)
    for side in (-1, 1):
        add_cylinder(f"P32_FURN_{prefix}_speaker_{side}", [console_x + side * 0.83, 0.62, console_z + facing * 0.35], 0.18, 0.06, M["rubber"], 16, rotation=(math.pi / 2, 0, 0))

    # Clear the upper-room doorway sightline. The old headboard placement sat
    # directly behind the aperture and looked exactly like an opaque black door.
    bed_x, bed_z = x + 6.1, z - facing * 2.5
    add_box(f"P32_FURN_{prefix}_upper_bed_frame", [bed_x, 3.82, bed_z], [3.0, 0.32, 2.1], M["timber"], 0.08)
    add_box(f"P32_FURN_{prefix}_upper_mattress", [bed_x, 4.12, bed_z], [2.82, 0.36, 1.96], M["fabric_neutral"], 0.12)
    add_box(f"P32_FURN_{prefix}_upper_blanket", [bed_x, 4.34, bed_z + facing * 0.32], [2.7, 0.14, 1.22], fabric, 0.08)
    add_box(f"P32_FURN_{prefix}_upper_headboard", [bed_x, 4.72, bed_z - facing * 1.02], [3.08, 1.72, 0.2], M["fabric_neutral"], 0.07)
    for side in (-1, 1):
        add_box(f"P32_FURN_{prefix}_upper_pillow_{side}", [bed_x + side * 0.68, 4.37, bed_z - facing * 0.55], [1.05, 0.2, 0.55], M["fabric_neutral"], 0.12)

    desk_x, desk_z = x - 3.2, z + facing * 2.8
    add_box(f"P32_FURN_{prefix}_upper_desk", [desk_x, 4.28, desk_z], [2.5, 0.16, 0.82], M["timber"], 0.06)
    for side in (-1, 1):
        add_box(f"P32_FURN_{prefix}_upper_desk_leg_{side}", [desk_x + side * 1.05, 3.86, desk_z], [0.14, 0.84, 0.62], M["metal_light"], 0.025)
    add_box(f"P32_FURN_{prefix}_upper_monitor", [desk_x, 4.93, desk_z - facing * 0.2], [1.35, 0.82, 0.12], M["metal"], 0.05)
    add_box(f"P32_FURN_{prefix}_upper_monitor_screen", [desk_x, 4.93, desk_z - facing * 0.27], [1.14, 0.62, 0.035], M["emissive_aqua"], 0.015)
    marker = bpy.data.objects.new(f"P32_FURN_{prefix}_ASSET_SET", None)
    marker.location = game_location((x, 1.0, z))
    marker["atomic_asset_class"] = "authored-house-furnishing-set"
    marker["atomic_asset_variant"] = prefix.lower()
    env.objects.link(marker)

# Garages with armored doors, roof stacks and side vents.
for index, garage in enumerate(spec["garages"]):
    x, z = garage["x"], garage["z"]
    facing = 1 if z < 0 else -1
    accent = M["aqua"] if index == 0 else M["coral"]
    add_box(f"BLD_GARAGE_{index}_shell", [x, 1.7, z], [12, 3.4, 6.5], M["concrete_dark"], 0.12)
    add_box(f"BLD_GARAGE_{index}_roof", [x, 3.65, z], [12.6, 0.5, 7.1], M["roof"], 0.09)
    front_z = z + facing * 3.3
    add_box(f"BLD_GARAGE_{index}_door", [x, 1.55, front_z], [9, 2.7, 0.16], M["metal_light"], 0.05)
    for y in (0.75, 1.35, 1.95, 2.55):
        add_box(f"BLD_GARAGE_{index}_door_rib_{y}", [x, y, front_z + facing * 0.1], [8.6, 0.06, 0.08], M["metal"], 0.01)
    add_box(f"BLD_GARAGE_{index}_accent", [x, 3.05, front_z + facing * 0.14], [5.2, 0.18, 0.08], accent, 0.01)

# Two complete original bus assets sit on the existing authoritative vehicle
# collision footprints and form the map's large, unmistakable hard-cover anchors.
add_transit_bus("P32_BUS_ATOM_LINER", (-3.8, 7.0), 14.0, M["yellow"], "ATOM_LINER_86")
add_transit_bus("P32_BUS_ACRES_SHUTTLE", (4.2, -8.8), 10.8, M["aqua"], "ACRES_SHUTTLE")

# Lane cover becomes authored modular military/agricultural barriers. The four
# outer anchors are recognisable large utility objects aligned to their taller
# TypeScript collision bodies rather than another row of anonymous cubes.
for index, (x, z, width, depth) in enumerate(spec["cover"]):
    accent = M["aqua"] if index % 2 == 0 else M["coral"]
    if index == 4:
        for crate_index, (ox, oy, sy) in enumerate(((-0.95, 0.62, 1.18), (0.95, 0.62, 1.18), (0, 1.65, 0.86))):
            add_box(f"P32_LARGE_COVER_cargo_crate_{crate_index}", [x + ox, oy, z], [1.72, sy, 1.78], M["timber"], 0.1)
            for band in (-0.42, 0.42):
                add_box(f"P32_LARGE_COVER_cargo_strap_{crate_index}_{band}", [x + ox + band, oy, z], [0.1, sy + 0.04, 1.82], M["yellow"], 0.02)
    elif index == 5:
        # Ground the stack exactly and leave both pipe ends open. The previous
        # capped cylinders floated 19 cm above grade and looked like boulders.
        pipe_length = width - 0.3
        for pipe_index, (oz, oy) in enumerate(((-0.9, 0.46), (0, 0.46), (0.9, 0.46), (-0.45, 1.32), (0.45, 1.32))):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=24, radius=0.43, depth=pipe_length, end_fill_type="NOTHING",
                location=game_location([x, oy, z + oz]), rotation=(0, math.pi / 2, 0),
            )
            pipe = bpy.context.object
            pipe.name = f"P32_LARGE_COVER_concrete_pipe_{pipe_index}"
            scale_existing_uvs(pipe, M["concrete"])
            pipe.data.materials.append(M["concrete"])
            pipe["atomic_environment"] = True
            link_only_env(pipe)
            for end_index, end_x in enumerate((x - pipe_length / 2, x + pipe_length / 2)):
                add_torus(
                    f"P32_LARGE_COVER_concrete_pipe_{pipe_index}_rim_{end_index}",
                    [end_x, oy, z + oz], 0.36, 0.07, M["concrete"], rotation=(0, math.pi / 2, 0),
                )
    elif index == 6:
        add_box("P32_LARGE_COVER_service_skip_body", [x, 0.98, z], [width - 0.12, 1.86, depth - 0.18], M["coral"], 0.16)
        for side in (-1, 1):
            add_box(f"P32_LARGE_COVER_service_skip_rim_{side}", [x, 1.98, z + side * (depth / 2 - 0.12)], [width + 0.08, 0.14, 0.18], M["yellow"], 0.035)
        add_box("P32_LARGE_COVER_service_skip_label", [x, 1.08, z + depth / 2], [width - 0.45, 0.5, 0.06], M["trim"], 0.03)
    elif index == 7:
        add_box("P32_LARGE_COVER_generator_shell", [x, 1.1, z], [width - 0.18, 1.72, depth - 0.42], M["metal"], 0.14)
        add_box("P32_LARGE_COVER_generator_roof", [x, 2.02, z], [width, 0.18, depth - 0.18], M["yellow"], 0.06)
        for vent_index, vent_y in enumerate((0.54, 0.82, 1.1)):
            add_box(f"P32_LARGE_COVER_generator_vent_{vent_index}", [x, vent_y, z + depth / 2 - 0.17], [width - 0.5, 0.08, 0.06], M["metal_light"], 0.01)
        for wheel_index, wheel_z in enumerate((z - depth * 0.3, z + depth * 0.3)):
            add_cylinder(f"P32_LARGE_COVER_generator_wheel_{wheel_index}", [x, 0.44, wheel_z], 0.42, width + 0.08, M["rubber"], 16, rotation=(0, math.pi / 2, 0))
    else:
        add_box(f"BLD_COVER_{index}_core", [x, 0.8, z], [width, 1.6, depth], M["concrete_dark"], 0.15)
        add_box(f"BLD_COVER_{index}_plate", [x, 1.32, z], [max(0.5, width - 0.25), 0.22, depth + 0.08], accent, 0.04)
        for side in (-1, 1): add_box(f"BLD_COVER_{index}_foot_{side}", [x + side * (width / 2 - 0.18), 0.18, z], [0.28, 0.36, depth + 0.35], M["metal"], 0.04)
    if index >= 4:
        cover_marker = bpy.data.objects.new(f"P32_LARGE_COVER_ASSET_{index}", None)
        cover_marker.location = game_location((x, 1.1, z))
        cover_marker["atomic_asset_class"] = "authored-large-physical-cover"
        cover_marker["atomic_cover_id"] = ("north-cargo-stack", "south-pipe-stack", "west-service-skip", "east-generator-trailer")[index - 4]
        cover_marker["atomic_collision_authority"] = "typescript-cover-box"
        env.objects.link(cover_marker)

# Hydroponics frame, service trench and solar canopy—original lane landmarks.
for x in (-29.0, -22.0):
    for z in (12.2, 19.8): add_box(f"BLD_HYDRO_post_{x}_{z}", [x, 2.2, z], [0.35, 4.4, 0.35], M["metal"], 0.05)
for x in (-29.0, -25.5, -22.0): add_box(f"BLD_HYDRO_beam_{x}", [x, 4.25, 16], [0.2, 0.2, 8], M["metal"], 0.03)
for z in (12.4, 16, 19.6): add_box(f"BLD_HYDRO_cross_{z}", [-25.5, 4.3, z], [7.5, 0.18, 0.18], M["metal_light"], 0.03)
for x in (-28.1, -26.4, -24.7, -23.0):
    # Presentation beds stay ankle-low because they are not collision authority.
    # Their visual silhouette must not promise cover or an impassable planter.
    add_box(f"BLD_HYDRO_bed_{x}", [x, 0.18, 16], [1.1, 0.36, 6.2], M["concrete"], 0.08)
    for z in (13.8, 16, 18.2): add_uv_sphere(f"BLD_HYDRO_crop_{x}_{z}", [x, 0.62, z], [0.38, 0.42, 0.38], M["foliage"])
for x in (22.5, 28.5): add_box(f"BLD_SERVICE_wall_{x}", [x, 0.75, 9], [0.7, 1.5, 10], M["concrete_dark"], 0.09)
for x in (22.5, 29.5):
    for z in (-20, -12): add_box(f"BLD_SOLAR_post_{x}_{z}", [x, 2.1, z], [0.6, 4.2, 0.6], M["metal"], 0.08)
for z in (-19.5, -15.5, -11.5):
    panel = add_box(f"BLD_SOLAR_panel_{z}", [26, 4.35, z], [8.4, 0.16, 3.2], M["aqua"], 0.04, rotation=(0.12, 0, 0))
    add_box(f"BLD_SOLAR_spine_{z}", [26, 4.0, z], [0.22, 0.65, 3.4], M["metal_light"], 0.03)

# Compact original Atomic Acres campus beacon, subordinate to the model homes.
add_box("BLD_BEACON_plinth", [27, 0.24, -1.5], [4.4, 0.48, 4.4], M["boundary"], 0.14)
add_cylinder("BLD_BEACON_mast", [27, 2.45, -1.5], 0.2, 4.4, M["metal"], 16)
for angle, major_radius in ((0, 1.0), (math.pi / 2, 1.22)):
    add_torus(f"BLD_BEACON_ring_{angle}", [27, 2.55, -1.5], major_radius, 0.07, M["emissive_aqua"], rotation=(math.pi / 2, angle, 0))
add_uv_sphere("BLD_BEACON_core", [27, 2.55, -1.5], [0.33, 0.33, 0.33], M["emissive_amber"])

# Pass 27 World Identity: presentation-only route signatures, atmospheric
# grounding and civil-defence/agritech storytelling. Everything is overhead,
# flush to the floor, outside the playable bounds, or mounted on an existing
# authoritative collider so it cannot imply new cover or close a route.

# Ground-contact/grime patches visually seat the two hero vehicles and major
# route landmarks without an SSAO/post-processing dependency.
for index, (x, z, width, depth) in enumerate((
    (-3.8, 7.0, 6.1, 15.0), (4.2, -8.8, 5.6, 10.8),
    (-25.5, 16.0, 8.4, 9.2), (26.0, -16.0, 9.0, 10.2), (27.0, -1.5, 6.2, 6.2),
)):
    add_box(f"P27_CONTACT_patch_{index}", [x, 0.071, z], [width, 0.014, depth], M["rubber"], 0.06)

# West / VERDANT ARRAY: low hydroponic beds remain traversable-looking while
# elevated irrigation, violet grow rails and a reclamation tank form the skyline.
for z in (12.7, 16.0, 19.3):
    add_cylinder(f"P27_VERDANT_irrigation_{z}", [-25.5, 3.25, z], 0.075, 7.2, M["metal_light"], 12, rotation=(0, math.pi / 2, 0))
    add_box(f"P27_VERDANT_grow_rail_{z}", [-25.5, 3.85, z], [6.4, 0.08, 0.1], M["grow_violet"], 0.015)
for x in (-28.1, -26.4, -24.7, -23.0):
    add_box(f"P27_VERDANT_row_light_{x}", [x, 1.35, 16], [0.05, 0.05, 5.5], M["grow_violet"], 0.01)
add_cylinder("P27_VERDANT_reclamation_tank", [-31.0, 3.05, 4.0], 1.35, 5.6, M["metal_light"], 20)
add_cylinder("P27_VERDANT_tank_cap", [-31.0, 5.9, 4.0], 1.42, 0.18, M["metal"], 20)
for height in (1.2, 3.0, 4.8):
    add_torus(f"P27_VERDANT_tank_band_{height}", [-31.0, height, 4.0], 1.38, 0.055, M["foliage"], rotation=(math.pi / 2, 0, 0))
add_box("P27_ROUTE_verdant_header", [-31.0, 6.55, 4.0], [3.6, 0.42, 0.24], M["foliage"], 0.08)

# Central / CIVIC TRANSIT: an overhead civil-defence signal and flush evacuation
# chevrons reinforce a broad exposed route. Supports sit beyond the carriageway.
for x in (-11.3, 11.3):
    add_box(f"P27_CIVIC_signal_post_{x}", [x, 3.25, 0.0], [0.22, 6.5, 0.22], M["metal_light"], 0.04)
add_box("P27_CIVIC_signal_beam", [0.0, 6.25, 0.0], [22.8, 0.28, 0.32], M["metal_light"], 0.05)
for index, x in enumerate((-5.2, 0.0, 5.2)):
    add_box(f"P27_CIVIC_signal_{index}", [x, 5.95, 0.0], [2.2, 0.36, 0.18], M["emissive_amber"], 0.04)
for index, z in enumerate((-32, -24, -14, 0, 14, 24, 32)):
    # Negative chevrons stay west and positive chevrons stay east so neither
    # crosses the broad contact patch beneath its nearby transit bus.
    offset = -2.6 if z < 0 else 2.6
    stripe = add_box(f"P27_CIVIC_evacuation_chevron_{index}", [offset, 0.073, z], [3.2, 0.016, 0.28], M["metal_light"], 0.02, rotation=(0, 0, (-0.24 if offset < 0 else 0.24)))
    stripe["atomic_route_cue"] = "central-transit"

# East / HELIO SERVICE: battery hardware mounts on existing service walls and
# photovoltaic canopies; violet service diagnostics distinguish it from team IFF.
for index, (x, z) in enumerate(((22.5, 7.0), (22.5, 10.8), (28.5, 7.0), (28.5, 10.8))):
    add_box(f"P27_HELIO_battery_{index}", [x, 1.75, z], [0.58, 1.65, 1.45], M["aqua"], 0.08)
    add_box(f"P27_HELIO_battery_status_{index}", [x + (-0.31 if x > 25 else 0.31), 1.92, z], [0.04, 0.34, 0.72], M["grow_violet"], 0.01)
for z in (-19.5, -15.5, -11.5):
    add_box(f"P27_HELIO_panel_spine_{z}", [26.0, 4.58, z], [7.9, 0.05, 0.12], M["aqua"], 0.01)
for z in (-18.0, -14.0):
    add_cylinder(f"P27_HELIO_coolant_{z}", [30.5, 2.7, z], 0.11, 6.0, M["metal_light"], 12, rotation=(math.pi / 2, 0, 0))
add_box("P27_ROUTE_helio_header", [27.0, 6.25, -1.5], [4.2, 0.42, 0.24], M["aqua"], 0.08)
add_box("P27_ROUTE_helio_status", [27.0, 5.72, -1.5], [2.8, 0.12, 0.18], M["grow_violet"], 0.02)

# Civil-defence retrofits sit above traversal on both model homes.
for house_index, house in enumerate(spec["houses"]):
    x, z = house["origin"]["x"], house["origin"]["z"]
    prefix = "AQUA" if house["team"] == 0 else "CORAL"
    accent = M["emissive_aqua"] if house["team"] == 0 else M["emissive_amber"]
    add_cylinder(f"P27_HABITAT_{prefix}_sensor_mast", [x - 4.7, 9.2, z + 2.7], 0.09, 3.4, M["metal"], 10)
    add_uv_sphere(f"P27_HABITAT_{prefix}_sensor", [x - 4.7, 10.85, z + 2.7], [0.34, 0.24, 0.34], accent)
    for offset in (-1.4, 0, 1.4):
        add_box(f"P27_HABITAT_{prefix}_roof_sensor_{offset}", [x + offset, 7.75, z - 3.4], [0.85, 0.16, 1.2], M["metal"], 0.03, rotation=(0.08, 0, 0))

# Distant agricultural energy silhouettes live beyond the collision boundary and
# create near/mid/far separation without adding playable geometry.
for index, (x, z, height) in enumerate(((-50, -24, 16), (52, 34, 20), (-49, 42, 14))):
    add_cylinder(f"P27_SKYLINE_turbine_mast_{index}", [x, height / 2, z], 0.2, height, M["metal_light"], 10)
    add_uv_sphere(f"P27_SKYLINE_turbine_hub_{index}", [x, height, z], [0.42, 0.42, 0.3], M["metal_light"])
    for blade in range(3):
        angle = blade * math.pi * 2 / 3
        radius = 2.15
        blade_x = x - math.sin(angle) * radius
        blade_y = height + math.cos(angle) * radius
        arm = add_box(
            f"P27_SKYLINE_turbine_blade_{index}_{blade}",
            [blade_x, blade_y, z], [0.24, 4.4, 0.16], M["trim"], 0.035,
            rotation=(0, -angle, 0),
        )
        arm["atomic_skyline_only"] = True

# Warm campus walls and low posts contain the exhibit without reading as a fortress.
for boundary in spec["boundaries"]: add_box(f"BLD_BOUNDARY_{boundary['id']}", boundary["position"], boundary["size"], M["boundary"], 0.08)
for x in (-33.9, 33.9):
    for z in range(-39, 40, 8): add_box(f"BLD_BOUNDARY_post_{x}_{z}", [x, 1.55, z], [0.52, 3.1, 0.52], M["metal_light"], 0.08)
for z in (-42.9, 42.9):
    for x in range(-30, 31, 8): add_box(f"BLD_BOUNDARY_post_{x}_{z}", [x, 1.55, z], [0.52, 3.1, 0.52], M["metal_light"], 0.08)
for ridge_index, (x, z, sx, sy, sz) in enumerate((
    (-45, -34, 20, 5.5, 13), (46, -26, 17, 4.6, 15),
    (-42, 34, 16, 4.2, 12), (44, 39, 21, 5.2, 11),
)):
    ridge = add_uv_sphere(f"P33_SKYLINE_earth_bank_{ridge_index}", [x, -0.8, z], [sx, sy, sz], M["earth"], 16, 8)
    ridge["atomic_skyline_only"] = True

# Lamps, trees, utility boxes and compact tactical signage.
for index, (x, z) in enumerate(((-13, -16), (13, 16), (-13, 22), (13, -22), (-29, 4), (29, -4))):
    add_cylinder(f"BLD_PROP_lamp_{index}", [x, 2.8, z], 0.11, 5.6, M["metal"], 10)
    add_box(f"BLD_PROP_lamp_arm_{index}", [x + (0.55 if x < 0 else -0.55), 5.45, z], [1.25, 0.12, 0.12], M["metal"], 0.025)
    add_uv_sphere(f"BLD_PROP_lamp_glow_{index}", [x + (1.05 if x < 0 else -1.05), 5.28, z], [0.22, 0.18, 0.22], M["emissive_amber"])
for index, (x, z, scale) in enumerate(((-31, -30, 1.0), (31, 30, 1.1), (-31, 28, 0.9), (31, -27, 1.0), (-18, 34, 0.85), (18, -34, 0.9))):
    add_cylinder(f"BLD_PROP_tree_trunk_{index}", [x, 2.0 * scale, z], 0.34 * scale, 4.0 * scale, M["timber"], 10)
    for cluster, (ox, oy, oz) in enumerate(((0, 5.2, 0), (-0.9, 4.8, 0.4), (0.9, 4.9, -0.4), (0, 6.0, 0.25))):
        add_uv_sphere(f"BLD_PROP_tree_crown_{index}_{cluster}", [x + ox * scale, oy * scale, z + oz * scale], [1.45 * scale, 1.15 * scale, 1.3 * scale], M["foliage"])
for index, (x, z) in enumerate(((-18, 10), (20, -12), (-22, -24), (22, 25))):
    add_box(f"BLD_PROP_terminal_{index}", [x, 0.85, z], [1.25, 1.7, 0.8], M["metal"], 0.12)
    add_box(f"BLD_PROP_terminal_screen_{index}", [x, 1.15, z + 0.43], [0.7, 0.42, 0.05], M["emissive_aqua"], 0.02)

# Export one checked semantic marker per route as a named empty node. Keeping the
# route contract on empties lets the visible meshes remain fully material-batched.
for landmark_name, route_id, position in (
    ("P27_LANDMARK_verdant_array", "west-cultivation", (-31.0, 6.55, 4.0)),
    ("P27_LANDMARK_civic_transit", "central-transit", (0.0, 6.25, 0.0)),
    ("P27_LANDMARK_helio_service", "east-service", (27.0, 6.25, -1.5)),
):
    landmark = bpy.data.objects.new(landmark_name, None)
    landmark.location = game_location(position)
    landmark["atomic_semantic"] = "route-landmark"
    landmark["atomic_route_id"] = route_id
    env.objects.link(landmark)

# Join ordinary non-semantic meshes by material to keep browser draw calls bounded.
window_objects = {obj for obj in env.objects if obj.get("atomic_semantic") == "breakable-window"}
protected_objects = window_objects
for material in list(M.values()):
    objects = [obj for obj in env.objects if obj.type == "MESH" and obj not in protected_objects and obj.data.materials and obj.data.materials[0] == material]
    if not objects:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = f"BLD_BATCH_{material.name}"
    objects[0]["atomic_environment"] = True
    if material in (M["grass"], M["asphalt"]):
        objects[0]["atomic_ground_layout"] = "manicured-verges-v3"

for obj in env.objects:
    if obj.type == "MESH":
        obj.select_set(False)

# Preview camera and original lighting are saved in the editable source but excluded from GLB.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.render.film_transparent = False
scene.world.color = (0.045, 0.065, 0.075)

bpy.ops.object.light_add(type="SUN", location=(-35, 25, 65))
sun = bpy.context.object
sun.name = "Preview_Sun"
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-34))
bpy.ops.object.light_add(type="AREA", location=game_location((0, 24, -12)))
area = bpy.context.object
area.name = "Preview_Sky_Fill"
area.data.energy = 1800
area.data.shape = "DISK"
area.data.size = 42

bpy.ops.object.camera_add(location=game_location((58, 36, 72)))
camera = bpy.context.object
camera.name = "Preview_Camera"
scene.camera = camera

def point_camera(camera_obj, target_game):
    target = Vector(game_location(target_game))
    camera_obj.rotation_euler = (target - camera_obj.location).to_track_quat("-Z", "Y").to_euler()
point_camera(camera, (0, 2.5, 0))
camera.data.lens = 47


def canonicalize_glb_vertex_data(path: Path) -> None:
    """Remove sub-pixel Blender 5.x parallel-evaluation drift from GLB attributes."""
    data = bytearray(path.read_bytes())
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(bytes(data[20:20 + json_length]).decode("utf-8").rstrip())
    binary_start = 20 + json_length + 8
    accessor_semantics: dict[int, str] = {}
    index_accessors: set[int] = set()
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if "indices" in primitive:
                index_accessors.add(primitive["indices"])
            for semantic, accessor_index in primitive.get("attributes", {}).items():
                accessor_semantics.setdefault(accessor_index, semantic)
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    quantums = {"NORMAL": 1e-3, "TANGENT": 1e-3, "TEXCOORD_0": 1e-4, "TEXCOORD_1": 1e-4}
    for accessor_index, semantic in accessor_semantics.items():
        quantum = quantums.get(semantic)
        accessor = gltf["accessors"][accessor_index]
        if quantum is None or accessor.get("componentType") != 5126 or "bufferView" not in accessor:
            continue
        view = gltf["bufferViews"][accessor["bufferView"]]
        components = component_counts[accessor["type"]]
        stride = view.get("byteStride", components * 4)
        start = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for item_index in range(accessor["count"]):
            for component_index in range(components):
                offset = start + item_index * stride + component_index * 4
                value = struct.unpack_from("<f", data, offset)[0]
                canonical = round(value / quantum) * quantum
                if abs(canonical) < quantum / 2:
                    canonical = 0.0
                struct.pack_into("<f", data, offset, canonical)
    # Blender 5.x can emit equivalent triangles in a different order between
    # factory-startup runs. Rotate each triangle without changing its winding,
    # then sort the triangle records so the checked GLB remains byte-stable.
    index_formats = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4)}
    for accessor_index in index_accessors:
        accessor = gltf["accessors"][accessor_index]
        if accessor.get("type") != "SCALAR" or accessor["count"] % 3 != 0:
            continue
        component_format, component_size = index_formats[accessor["componentType"]]
        view = gltf["bufferViews"][accessor["bufferView"]]
        stride = view.get("byteStride", component_size)
        start = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        values = [struct.unpack_from(f"<{component_format}", data, start + index * stride)[0]
                  for index in range(accessor["count"])]
        triangles = []
        for index in range(0, len(values), 3):
            triangle = values[index:index + 3]
            minimum = triangle.index(min(triangle))
            triangles.append(tuple(triangle[minimum:] + triangle[:minimum]))
        flattened = [value for triangle in sorted(triangles) for value in triangle]
        for index, value in enumerate(flattened):
            struct.pack_into(f"<{component_format}", data, start + index * stride, value)
    path.write_bytes(data)

# Deterministic authoring runs replace this source file intentionally; do not emit
# Blender's rotating .blend1 backup into the source tree on every regeneration.
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action="DESELECT")
for obj in env.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = next((obj for obj in env.objects if obj.type == "MESH"), None)
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH), export_format="GLB", use_selection=True, export_extras=True,
    export_apply=True, export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
)
canonicalize_glb_vertex_data(GLB_PATH)

meshes = [obj for obj in env.objects if obj.type == "MESH"]
triangles = sum(len(obj.data.loop_triangles) if obj.data.loop_triangles else (obj.data.calc_loop_triangles() or len(obj.data.loop_triangles)) for obj in meshes)
print(json.dumps({
    "blend": str(BLEND_PATH), "glb": str(GLB_PATH), "preview": str(PREVIEW_PATH),
    "meshes": len(meshes), "materials": len(M), "semanticWindows": len(window_objects), "triangles": triangles,
}, sort_keys=True))
