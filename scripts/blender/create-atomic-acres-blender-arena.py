#!/usr/bin/env python3
"""Deterministically author Atomic Acres' complete Blender Render environment.

This script uses only Blender primitives and project-authored material values. It reads
the checked-in arena spec generated from authoritative TypeScript architecture and
writes an editable .blend, a self-contained GLB, and a local preview render.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "source-assets/blender/atomic-acres-arena-spec.json"
BLEND_PATH = ROOT / "source-assets/blender/atomic-acres-blender-arena.blend"
GLB_PATH = ROOT / "public/assets/original/models/atomic-acres-blender-arena.glb"
PREVIEW_PATH = ROOT / "artifacts/blender-render/atomic-acres-blender-arena-preview.png"

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


def make_material(name: str, color: int, roughness: float, metallic: float = 0.0,
                  alpha: float = 1.0, emission: int | None = None, emission_strength: float = 0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
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
    "grass": make_material("MAT_ground_olive", 0x56644C, 0.98),
    "earth": make_material("MAT_earth_edge", 0x3A3329, 1.0),
    "asphalt": make_material("MAT_asphalt_charcoal", 0x292F31, 0.96),
    "concrete": make_material("MAT_concrete_weathered", 0x7B7D76, 0.9),
    "concrete_dark": make_material("MAT_concrete_dark", 0x454B4D, 0.92),
    "aqua": make_material("MAT_aqua_oxidized", 0x356E73, 0.73, 0.05),
    "coral": make_material("MAT_coral_oxide", 0x8B4B40, 0.76, 0.04),
    "plaster": make_material("MAT_plaster_sand", 0xB8AE95, 0.9),
    "trim": make_material("MAT_trim_bone", 0xD4CBB7, 0.67),
    "brick": make_material("MAT_brick_brown", 0x6F4436, 0.91),
    "timber": make_material("MAT_timber_dark", 0x574334, 0.9),
    "metal": make_material("MAT_gunmetal", 0x2F3B40, 0.48, 0.62),
    "metal_light": make_material("MAT_brushed_alloy", 0x7E898B, 0.41, 0.68),
    "yellow": make_material("MAT_hazard_amber", 0xC79A32, 0.54, 0.16),
    "rubber": make_material("MAT_rubber", 0x15191A, 0.84),
    "glass": make_material("MAT_glass_tactical", 0x5E9AA5, 0.18, 0.16, 0.42),
    "foliage": make_material("MAT_foliage_military", 0x405D3D, 0.97),
    "emissive_aqua": make_material("MAT_emissive_aqua", 0x67D7D4, 0.32, 0.25, emission=0x3CCDCB, emission_strength=3.0),
    "emissive_amber": make_material("MAT_emissive_amber", 0xF0C36A, 0.35, 0.15, emission=0xE9A73E, emission_strength=2.5),
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
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


def add_uv_sphere(name: str, position, scale, material, segments=12, rings=8):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=game_location(position))
    obj = bpy.context.object
    obj.name = name
    obj.scale = game_dimensions(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


def add_torus(name: str, position, major: float, minor: float, material, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=6,
                                    location=game_location(position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj["atomic_environment"] = True
    link_only_env(obj)
    return obj


# Ground and road hierarchy.
roadway = spec["roadway"]
add_box("BLD_TERRAIN_foundation", roadway["ground"]["position"], roadway["ground"]["size"], M["earth"], 0)
add_box("BLD_TERRAIN_grass_cap", [0, 0.0, 0], [86, 0.06, 98], M["grass"], 0)
add_box("BLD_ROAD_asphalt", roadway["road"]["position"], roadway["road"]["size"], M["asphalt"], 0)
for index, item in enumerate(roadway["curbs"]): add_box(f"BLD_ROAD_curb_{index}", item["position"], item["size"], M["concrete"], 0.03)
for index, item in enumerate(roadway["sidewalks"]): add_box(f"BLD_ROAD_sidewalk_{index}", item["position"], item["size"], M["concrete"], 0.02)
for index, item in enumerate(roadway["laneMarkers"]): add_box(f"BLD_ROAD_lane_{index}", item["position"], item["size"], M["yellow"], 0)
for index, item in enumerate(roadway["crosswalks"]): add_box(f"BLD_ROAD_crosswalk_{index}", item["position"], item["size"], M["trim"], 0)

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
        add_box(
            f"BLD_HOUSE_{prefix}_{solid_index:03d}_{solid['name']}", solid["position"], solid["size"],
            surface_material[solid["surface"]], 0.025 if solid["kind"] != "glass" else 0,
            rotation=rotation, semantic=semantic,
        )
    x, z = house["origin"]["x"], house["origin"]["z"]
    facing = house["origin"]["facing"]
    width, depth = house["dimensions"]["width"], house["dimensions"]["depth"]
    accent = M["aqua"] if house["team"] == 0 else M["coral"]
    add_box(f"BLD_HOUSE_{prefix}_roof", [x, 7.18, z], [width + 0.8, 0.48, depth + 0.8], M["metal"], 0.08)
    # Original tactical facade ribs, rooftop equipment and faction beacon strips.
    for side in (-1, 1):
        add_box(f"BLD_HOUSE_{prefix}_corner_{side}", [x + side * (width / 2 + 0.06), 3.55, z], [0.18, 7.1, depth + 0.25], M["metal"], 0.02)
    for offset in (-7.0, -3.5, 0, 3.5, 7.0):
        add_box(f"BLD_HOUSE_{prefix}_facade_rib_{offset}", [x + offset, 5.55, z + facing * (depth / 2 + 0.24)], [0.13, 2.6, 0.16], accent, 0.02)
    add_box(f"BLD_HOUSE_{prefix}_roof_plant", [x + 4.8, 7.65, z - facing * 2.2], [3.1, 0.9, 2.2], M["concrete_dark"], 0.12)
    for offset in (-1.05, 0, 1.05):
        add_box(f"BLD_HOUSE_{prefix}_roof_vent_{offset}", [x + 4.8 + offset, 8.18, z - facing * 2.2], [0.12, 0.32, 1.6], M["metal_light"], 0.02)
    add_box(f"BLD_HOUSE_{prefix}_identity_strip", [x, 6.55, z + facing * (depth / 2 + 0.28)], [7.5, 0.2, 0.1], M["emissive_aqua"] if house["team"] == 0 else M["emissive_amber"], 0.01)

# Garages with armored doors, roof stacks and side vents.
for index, garage in enumerate(spec["garages"]):
    x, z = garage["x"], garage["z"]
    facing = 1 if z < 0 else -1
    accent = M["aqua"] if index == 0 else M["coral"]
    add_box(f"BLD_GARAGE_{index}_shell", [x, 1.7, z], [12, 3.4, 6.5], M["concrete_dark"], 0.12)
    add_box(f"BLD_GARAGE_{index}_roof", [x, 3.65, z], [12.6, 0.5, 7.1], M["metal"], 0.09)
    front_z = z + facing * 3.3
    add_box(f"BLD_GARAGE_{index}_door", [x, 1.55, front_z], [9, 2.7, 0.16], M["metal_light"], 0.05)
    for y in (0.75, 1.35, 1.95, 2.55):
        add_box(f"BLD_GARAGE_{index}_door_rib_{y}", [x, y, front_z + facing * 0.1], [8.6, 0.06, 0.08], M["metal"], 0.01)
    add_box(f"BLD_GARAGE_{index}_accent", [x, 3.05, front_z + facing * 0.14], [5.2, 0.18, 0.08], accent, 0.01)

# Distinct original armored public-transit carrier.
add_box("BLD_VEHICLE_transit_lower", [-3.8, 1.1, 7], [5.4, 2.2, 14], M["yellow"], 0.28)
add_box("BLD_VEHICLE_transit_upper", [-3.8, 2.65, 7], [5.05, 1.5, 12.8], M["concrete_dark"], 0.3)
add_box("BLD_VEHICLE_transit_roof", [-3.8, 3.58, 7], [4.8, 0.28, 12.2], M["metal"], 0.1)
for side_x in (-6.34, -1.26):
    for z in (3.0, 6.0, 9.0, 12.0): add_box(f"BLD_VEHICLE_transit_window_{side_x}_{z}", [side_x, 2.65, z], [0.07, 0.88, 2.15], M["glass"], 0.02)
for x in (-5.7, -1.9):
    for z in (2.0, 12.0): add_cylinder(f"BLD_VEHICLE_transit_wheel_{x}_{z}", [x, 0.7, z], 0.66, 0.42, M["rubber"], 16, rotation=(0, math.pi / 2, 0))

# Original modular agritech carrier.
add_box("BLD_VEHICLE_carrier_bed", [4.2, 1.65, -7.0], [4.8, 3.0, 7.0], M["aqua"], 0.18)
add_box("BLD_VEHICLE_carrier_cab", [4.2, 1.35, -12.3], [4.8, 2.7, 3.5], M["plaster"], 0.22)
add_box("BLD_VEHICLE_carrier_glass", [4.2, 2.05, -14.08], [3.5, 1.05, 0.08], M["glass"], 0.01)
add_box("BLD_VEHICLE_carrier_bumper", [4.2, 0.65, -14.25], [5.2, 0.42, 0.42], M["metal"], 0.08)
for x in (2.25, 6.15):
    for z in (-5.2, -12.5): add_cylinder(f"BLD_VEHICLE_carrier_wheel_{x}_{z}", [x, 0.65, z], 0.64, 0.4, M["rubber"], 16, rotation=(0, math.pi / 2, 0))

# Lane cover becomes authored modular military/agricultural barriers.
for index, (x, z, width, depth) in enumerate(spec["cover"]):
    accent = M["aqua"] if index % 2 == 0 else M["coral"]
    add_box(f"BLD_COVER_{index}_core", [x, 0.8, z], [width, 1.6, depth], M["concrete_dark"], 0.15)
    add_box(f"BLD_COVER_{index}_plate", [x, 1.32, z], [max(0.5, width - 0.25), 0.22, depth + 0.08], accent, 0.04)
    for side in (-1, 1): add_box(f"BLD_COVER_{index}_foot_{side}", [x + side * (width / 2 - 0.18), 0.18, z], [0.28, 0.36, depth + 0.35], M["metal"], 0.04)

# Hydroponics frame, service trench and solar canopy—original lane landmarks.
for x in (-29.0, -22.0):
    for z in (12.2, 19.8): add_box(f"BLD_HYDRO_post_{x}_{z}", [x, 2.2, z], [0.35, 4.4, 0.35], M["metal"], 0.05)
for x in (-29.0, -25.5, -22.0): add_box(f"BLD_HYDRO_beam_{x}", [x, 4.25, 16], [0.2, 0.2, 8], M["metal"], 0.03)
for z in (12.4, 16, 19.6): add_box(f"BLD_HYDRO_cross_{z}", [-25.5, 4.3, z], [7.5, 0.18, 0.18], M["metal_light"], 0.03)
for x in (-28.1, -26.4, -24.7, -23.0):
    add_box(f"BLD_HYDRO_bed_{x}", [x, 0.5, 16], [1.1, 1.0, 6.2], M["concrete"], 0.12)
    for z in (13.8, 16, 18.2): add_uv_sphere(f"BLD_HYDRO_crop_{x}_{z}", [x, 1.25, z], [0.45, 0.6, 0.45], M["foliage"])
for x in (22.5, 28.5): add_box(f"BLD_SERVICE_wall_{x}", [x, 0.75, 9], [0.7, 1.5, 10], M["concrete_dark"], 0.09)
for x in (22.5, 29.5):
    for z in (-20, -12): add_box(f"BLD_SOLAR_post_{x}_{z}", [x, 2.1, z], [0.6, 4.2, 0.6], M["metal"], 0.08)
for z in (-19.5, -15.5, -11.5):
    panel = add_box(f"BLD_SOLAR_panel_{z}", [26, 4.35, z], [8.4, 0.16, 3.2], M["aqua"], 0.04, rotation=(0.12, 0, 0))
    add_box(f"BLD_SOLAR_spine_{z}", [26, 4.0, z], [0.22, 0.65, 3.4], M["metal_light"], 0.03)

# Atomic beacon landmark with original geometry.
add_box("BLD_BEACON_plinth", [27, 0.38, -1.5], [5.8, 0.76, 5.8], M["concrete"], 0.14)
add_cylinder("BLD_BEACON_mast", [27, 3.6, -1.5], 0.28, 6.4, M["metal"], 16)
for angle in (0, math.pi / 3, -math.pi / 3): add_torus(f"BLD_BEACON_ring_{angle}", [27, 3.5, -1.5], 1.65, 0.1, M["emissive_aqua"], rotation=(math.pi / 2, angle, 0))
add_uv_sphere("BLD_BEACON_core", [27, 3.5, -1.5], [0.48, 0.48, 0.48], M["emissive_amber"])

# Boundary walls receive armored posts, preserving the authoritative playable bounds silhouette.
for boundary in spec["boundaries"]: add_box(f"BLD_BOUNDARY_{boundary['id']}", boundary["position"], boundary["size"], M["concrete_dark"], 0.08)
for x in (-33.9, 33.9):
    for z in range(-39, 40, 6): add_box(f"BLD_BOUNDARY_post_{x}_{z}", [x, 2.1, z], [0.75, 4.2, 0.75], M["metal"], 0.08)
for z in (-42.9, 42.9):
    for x in range(-30, 31, 6): add_box(f"BLD_BOUNDARY_post_{x}_{z}", [x, 2.1, z], [0.75, 4.2, 0.75], M["metal"], 0.08)

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

# Join non-semantic objects by material to keep browser draw calls bounded.
semantic_objects = {obj for obj in env.objects if obj.get("atomic_semantic") == "breakable-window"}
for material in list(M.values()):
    objects = [obj for obj in env.objects if obj.type == "MESH" and obj not in semantic_objects and obj.data.materials and obj.data.materials[0] == material]
    if not objects:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = f"BLD_BATCH_{material.name}"
    objects[0]["atomic_environment"] = True

for obj in env.objects:
    if obj.type == "MESH":
        obj.select_set(False)
        for polygon in obj.data.polygons:
            polygon.use_smooth = False

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

meshes = [obj for obj in env.objects if obj.type == "MESH"]
triangles = sum(len(obj.data.loop_triangles) if obj.data.loop_triangles else (obj.data.calc_loop_triangles() or len(obj.data.loop_triangles)) for obj in meshes)
print(json.dumps({
    "blend": str(BLEND_PATH), "glb": str(GLB_PATH), "preview": str(PREVIEW_PATH),
    "meshes": len(meshes), "materials": len(M), "semanticWindows": len(semantic_objects), "triangles": triangles,
}, sort_keys=True))
