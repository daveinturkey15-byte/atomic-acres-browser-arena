"""Pass 43 — Authored Rustworks Quality environment (textured industrial plant).

TypeScript remains collision/shot authority. This GLB is the Quality Graphics
presentation layer: real embedded PBR textures, solid decks, clear climb routes,
and yard silhouettes so Rustworks stops looking like untextured boxes.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "source-assets" / "blender" / "rustworks-central-tower.blend"
GLB_PATH = ROOT / "public" / "assets" / "original" / "models" / "rustworks-central-tower.glb"
TEXTURE_ROOT = ROOT / "public" / "assets" / "original" / "textures"
PREVIEW_PATH = ROOT / "artifacts" / "pass43" / "rustworks-quality-preview.png"

ASSET_VERSION = "pass43-v1"
AUTHORED_HEIGHT_M = 14.8

LOADED: dict[str, bpy.types.Image] = {}


def load_tex(name: str, color_space: str = "sRGB") -> bpy.types.Image:
    if name in LOADED:
        return LOADED[name]
    path = TEXTURE_ROOT / name
    if not path.is_file():
        raise FileNotFoundError(path)
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = color_space
    image.pack()
    LOADED[name] = image
    return image


def textured_material(
    name: str,
    albedo: str,
    *,
    metallic: float,
    roughness: float,
    tile: float = 2.4,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness

    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = load_tex(albedo)
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / max(tile, 0.25), 1.0 / max(tile, 0.25), 1.0)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    # Generated coords keep unwrapped primitives looking tiled without a UV unwrap pass.
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    stem = Path(albedo).stem
    normal_name = f"{stem}-normal.png"
    rough_name = f"{stem}-roughness.png"
    if (TEXTURE_ROOT / normal_name).is_file():
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = load_tex(normal_name, "Non-Color")
        ntex.interpolation = "Linear"
        ntex.extension = "REPEAT"
        nt.links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.85
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if (TEXTURE_ROOT / rough_name).is_file():
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = load_tex(rough_name, "Non-Color")
        rtex.interpolation = "Linear"
        rtex.extension = "REPEAT"
        nt.links.new(mapping.outputs["Vector"], rtex.inputs["Vector"])
        nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])

    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    mat["rustworks_texture"] = albedo
    mat["rustworks_tile_metres"] = tile
    return mat


def tag(obj, kind: str):
    obj["rustworks_asset_class"] = "authored-central-tower"
    obj["rustworks_semantic"] = kind
    obj["collision_authority"] = "typescript-rustworks-boxes"
    obj["asset_version"] = ASSET_VERSION
    return obj


def cube(name: str, location, scale, mat, kind="tower-detail"):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Smart UV project for better texture scale on boxes.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    tag(obj, kind)
    return obj


def cylinder(name: str, location, radius: float, depth: float, mat, rotation=(0, 0, 0), vertices=16, kind="tower-detail"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cylinder_project(direction="VIEW_ON_EQUATOR", align="POLAR_ZX")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.materials.append(mat)
    tag(obj, kind)
    return obj


def beam(name: str, start, end, width: float, mat, kind="cross-brace"):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = cube(name, (a + b) / 2, (width, width, delta.length), mat, kind)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def main():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            block.remove(item)

    rust = textured_material("RW_Mat_RustSteel", "rustworks-steel-rust.png", metallic=0.72, roughness=0.62, tile=1.8)
    steel = textured_material("RW_Mat_GrateSteel", "rustworks-grate-metal.png", metallic=0.82, roughness=0.4, tile=1.2)
    concrete = textured_material("RW_Mat_Concrete", "rustworks-concrete.png", metallic=0.05, roughness=0.9, tile=3.0)
    hazard = textured_material("RW_Mat_Hazard", "rustworks-hazard.png", metallic=0.35, roughness=0.55, tile=1.4, emission=(0.55, 0.28, 0.04), emission_strength=0.12)
    oxide = textured_material("RW_Mat_Oxide", "rustworks-oxide.png", metallic=0.48, roughness=0.78, tile=2.0)
    tank = textured_material("RW_Mat_Tank", "rustworks-tank-paint.png", metallic=0.55, roughness=0.48, tile=2.2)

    root = bpy.data.objects.new("RUSTWORKS_AUTHORED_CENTRAL_TOWER", None)
    bpy.context.collection.objects.link(root)
    tag(root, "tower-root")
    root["asset_version"] = ASSET_VERSION
    root["authored_height_metres"] = AUTHORED_HEIGHT_M
    root["access_scheme"] = "lower-ramp-plus-ship-ladder"
    root["quality_pass"] = "pass43-textured-plant"

    created: list = []

    # --- Ground hardstand + service apron (Quality ground read) ---
    created.append(cube("RW_hardstand", (0, 0, 0.04), (18.5, 18.5, 0.08), concrete, "ground-hardstand"))
    created.append(cube("RW_service_lane", (0, 16, 0.05), (8.8, 18.0, 0.06), concrete, "ground-lane"))
    for z in (-24, -18, -12, 12, 18, 24):
        created.append(cube(f"RW_chevron_{z}", (0, -z, 0.06), (3.4, 0.55, 0.04), hazard, "ground-marking"))

    # --- Four-leg tower with solid textured decks (open centre walk) ---
    for x in (-3.2, 3.2):
        for z in (-3.2, 3.2):
            created.append(cylinder(f"RW_leg_{x}_{z}", (x, -z, 5.4), 0.34, 10.8, steel, vertices=14, kind="leg-sleeve"))
            created.append(cube(f"RW_leg_base_{x}_{z}", (x, -z, 0.35), (1.25, 1.25, 0.7), concrete, "leg-base"))
            created.append(cube(f"RW_leg_cap_{x}_{z}", (x, -z, 11.0), (0.7, 0.7, 0.28), rust, "leg-cap"))

    # X-bracing outside walk cores
    for z in (-3.4, 3.4):
        for y0, y1 in ((0.5, 3.15), (3.65, 7.9), (8.4, 11.05)):
            created.append(beam(f"RW_brace_a_{z}_{y0}", (-3.2, -z, y0), (3.2, -z, y1), 0.14, rust))
            created.append(beam(f"RW_brace_b_{z}_{y0}", (3.2, -z, y0), (-3.2, -z, y1), 0.14, rust))
    for x in (-3.4, 3.4):
        for y0, y1 in ((0.5, 3.15), (3.65, 7.9), (8.4, 11.05)):
            created.append(beam(f"RW_brace_c_{x}_{y0}", (x, 3.2, y0), (x, -3.2, y1), 0.14, steel))
            created.append(beam(f"RW_brace_d_{x}_{y0}", (x, -3.2, y0), (x, 3.2, y1), 0.14, steel))

    # Solid decks — grate texture. Upper deck keeps OPEN centre: only corner utilities.
    created.append(cube("RW_lower_deck", (0, 0, 3.35), (8.5, 8.5, 0.34), steel, "lower-deck"))
    created.append(cube("RW_upper_deck", (0, 0, 8.15), (6.9, 6.9, 0.34), rust, "upper-deck"))
    created.append(cube("RW_lower_deck_trim", (0, 0, 3.55), (7.6, 7.6, 0.05), steel, "lower-deck-trim"))
    created.append(cube("RW_upper_walk_ring", (0, 0, 8.36), (5.0, 5.0, 0.04), hazard, "upper-walk-ring"))

    # Corner-only utilities — do NOT block centre circulation
    created.append(cube("RW_control_hut_shell", (-2.05, 2.05, 9.45), (1.95, 1.95, 2.25), oxide, "control-hut"))
    created.append(cube("RW_control_hut_door", (-2.05, 1.05, 9.1), (0.9, 0.08, 1.6), steel, "control-hut"))
    created.append(cube("RW_control_hut_awning", (-2.05, 1.15, 10.7), (2.15, 1.05, 0.12), hazard, "control-hut"))
    created.append(cube("RW_process_manifold", (2.15, -2.15, 9.2), (1.05, 1.05, 1.55), steel, "process-equipment"))
    created.append(cylinder("RW_manifold_stack", (2.15, -2.15, 10.2), 0.22, 0.9, rust, kind="process-equipment"))

    # Crown / crane silhouette
    for x in (-2.7, 2.7):
        for z in (-2.7, 2.7):
            created.append(cube(f"RW_canopy_post_{x}_{z}", (x, -z, 11.45), (0.2, 0.2, 2.5), steel, "canopy-post"))
    created.append(cube("RW_canopy_roof", (0, 0, 12.85), (6.6, 6.6, 0.24), rust, "tower-crown"))
    created.append(cube("RW_canopy_ridge", (0, 0, 13.25), (0.32, 6.9, 0.55), hazard, "tower-crown"))
    created.append(cube("RW_crane_boom", (-5.4, 0, 13.55), (11.8, 0.42, 0.42), steel, "crane-detail"))
    created.append(cylinder("RW_crane_drop", (-10.9, 0, 10.1), 0.05, 6.8, oxide, kind="crane-cable"))
    created.append(cube("RW_crane_hook", (-10.9, 0, 6.5), (0.34, 0.4, 0.55), rust, "crane-hook"))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.08, major_segments=18, minor_segments=8, location=(-10.9, 0, 13.55), rotation=(math.pi / 2, 0, 0))
    pulley = bpy.context.object
    pulley.name = "RW_crane_pulley"
    pulley.data.materials.append(hazard)
    tag(pulley, "crane-detail")
    created.append(pulley)

    # Process risers parked OUTSIDE walk ring on -Y (Three +Z) edge
    for x in (-2.55, 2.55):
        created.append(cylinder(f"RW_process_riser_{x}", (x, 3.55, 6.1), 0.2, 10.2, oxide, kind="process-pipe"))
        created.append(cylinder(f"RW_process_cap_{x}", (x, 3.55, 11.35), 0.3, 0.28, rust, kind="process-pipe"))
    created.append(cube("RW_process_pipe_a", (-2.5, -2.9, 4.6), (1.7, 0.34, 0.34), steel, "process-pipe"))
    created.append(cube("RW_process_pipe_b", (2.35, 2.75, 6.8), (0.34, 1.9, 0.34), steel, "process-pipe"))
    created.append(cube("RW_process_pipe_c", (0.15, -2.7, 10.45), (2.1, 0.3, 0.3), steel, "process-pipe"))

    # Access geometry (Blender x, -threeZ, threeY) matching TS authority.
    landing_overlap = 0.06
    deck_thickness = 0.34
    lower_top = 3.35 + deck_thickness / 2
    upper_top = 8.15 + deck_thickness / 2
    lower_half = 8.4 / 2
    upper_half = 6.8 / 2

    # Ground → lower ramp on -Z (Blender +Y)
    lower_angle = math.radians(22.0)
    lower_width = 3.75
    lower_thick = 0.28
    lower_landing_depth = 1.55
    lower_ramp_len = (lower_top - 0.12) / math.sin(lower_angle)
    lower_landing_center_z = -lower_half - lower_landing_depth / 2 + landing_overlap
    lower_ramp_top_z = lower_landing_center_z - lower_landing_depth / 2 + landing_overlap
    lower_ramp_center_z = lower_ramp_top_z - math.cos(lower_angle) * (lower_ramp_len / 2)
    lower_ramp_center_y = lower_top - math.sin(lower_angle) * (lower_ramp_len / 2) - math.cos(lower_angle) * (lower_thick / 2)
    created.append(cube("RW_lower_ramp_foot", (0.0, -(lower_ramp_center_z - math.cos(lower_angle) * (lower_ramp_len / 2) - 0.55), 0.1), (lower_width + 0.9, 1.7, 0.18), concrete, "lower-ramp-foot"))
    lower_ramp = cube("RW_lower_ramp_shell", (0.0, -lower_ramp_center_z, lower_ramp_center_y + 0.018), (lower_width, lower_ramp_len, lower_thick), steel, "lower-ramp")
    lower_ramp.rotation_euler = (-lower_angle, 0.0, 0.0)
    created.append(lower_ramp)
    created.append(cube("RW_lower_ramp_landing_shell", (0.0, -lower_landing_center_z, lower_top), (lower_width + 0.45, lower_landing_depth, 0.12), steel, "lower-ramp-landing"))
    for side, label in ((-1, "w"), (1, "e")):
        rail = cube(f"RW_lower_ramp_rail_{label}", (side * (lower_width / 2 + 0.12), -lower_ramp_center_z, lower_ramp_center_y + 0.55), (0.1, lower_ramp_len, 0.1), hazard, "lower-ramp-rail")
        rail.rotation_euler = (-lower_angle, 0.0, 0.0)
        created.append(rail)

    # Ship ladder +X rim
    ship_angle = math.radians(48.0)
    ship_rise = upper_top - lower_top
    ship_run = ship_rise / math.tan(ship_angle)
    ship_len = ship_rise / math.sin(ship_angle)
    ship_width = 1.75
    ship_thick = 0.22
    ship_x = lower_half - 0.35
    ship_lower_landing_depth = 1.3
    ship_upper_landing_depth = 1.4
    ship_low_z = lower_half - 0.2
    ship_lower_landing_center_z = ship_low_z + ship_lower_landing_depth / 2 - landing_overlap
    ship_low_surface_z = ship_lower_landing_center_z - ship_lower_landing_depth / 2 + landing_overlap
    ship_high_surface_z = ship_low_surface_z - ship_run
    ship_center_z = (ship_low_surface_z + ship_high_surface_z) / 2
    ship_center_y = (lower_top + upper_top) / 2 - math.cos(ship_angle) * (ship_thick / 2)
    ship_upper_landing_center_z = ship_high_surface_z - ship_upper_landing_depth / 2 + landing_overlap
    ship_bridge_center_x = (ship_x + upper_half - 0.35) / 2

    created.append(cube("RW_ship_ladder_lower_landing", (ship_x, -ship_lower_landing_center_z, lower_top), (ship_width + 0.55, ship_lower_landing_depth, 0.12), steel, "ship-ladder-landing"))
    created.append(cube("RW_ship_ladder_upper_landing", (ship_x, -ship_upper_landing_center_z, upper_top), (ship_width + 0.5, ship_upper_landing_depth, 0.12), rust, "ship-ladder-landing"))
    created.append(cube("RW_upper_access_bridge", (ship_bridge_center_x, -ship_upper_landing_center_z, upper_top), (abs(ship_x - (upper_half - 0.35)) + 0.55, ship_upper_landing_depth, 0.12), steel, "upper-access"))
    slab = cube("RW_ship_ladder_slab", (ship_x, -ship_center_z, ship_center_y + 0.018), (ship_width, ship_len, ship_thick), steel, "ship-ladder")
    slab.rotation_euler = (ship_angle, 0.0, 0.0)
    created.append(slab)
    for side, label in ((-1, "west"), (1, "east")):
        rail = cube(f"RW_ship_ladder_rail_{label}", (ship_x + side * (ship_width / 2 + 0.09), -ship_center_z, ship_center_y + 0.62), (0.1, ship_len, 0.1), hazard, "ship-ladder-rail")
        rail.rotation_euler = (ship_angle, 0.0, 0.0)
        created.append(rail)
        stringer = cube(f"RW_ship_ladder_stringer_{label}", (ship_x + side * (ship_width / 2 + 0.02), -ship_center_z, ship_center_y - 0.08), (0.09, ship_len + 0.1, 0.2), oxide, "ship-ladder-stringer")
        stringer.rotation_euler = (ship_angle, 0.0, 0.0)
        created.append(stringer)
    for index in range(10):
        t = (index + 0.5) / 10.0
        three_z = ship_low_surface_z - ship_run * t
        three_y = lower_top + ship_rise * t + 0.04
        created.append(cube(f"RW_ship_ladder_rung_{index}", (ship_x, -three_z, three_y), (ship_width - 0.14, 0.11, 0.09), hazard, "ship-ladder-rung"))

    # Split upper handrails clear of ship-ladder opening
    upper_rail_y = upper_top + 0.62
    for three_z in (-3.35, 3.35):
        created.append(cube(f"RW_upper_handrail_z_{three_z}", (-0.1, -three_z, upper_rail_y), (6.0, 0.12, 1.15), hazard, "upper-handrail"))
    created.append(cube("RW_upper_handrail_x_neg", (-3.35, 0.15, upper_rail_y), (0.12, 5.9, 1.15), hazard, "upper-handrail"))
    created.append(cube("RW_upper_handrail_x_pos_south", (3.35, 2.55, upper_rail_y), (0.12, 1.55, 1.15), hazard, "upper-handrail"))
    created.append(cube("RW_upper_handrail_x_pos_north", (3.35, -1.85, upper_rail_y), (0.12, 2.95, 1.15), hazard, "upper-handrail"))
    for three_x, three_z in (
        (-3.35, -3.35), (2.7, -3.35), (-3.35, 3.35), (2.7, 3.35),
        (3.35, -3.35), (3.35, -2.4), (3.35, 0.35), (3.35, 3.35),
    ):
        created.append(cube(f"RW_upper_rail_post_{three_x}_{three_z}", (three_x, -three_z, upper_top + 0.62), (0.12, 0.12, 1.2), hazard, "upper-handrail"))

    # Lower deck rails split around ramp opening on -Z
    lower_rail_y = lower_top + 0.62
    created.append(cube("RW_lower_handrail_n", (-0.7, -4.15, lower_rail_y), (6.4, 0.12, 1.1), hazard, "lower-handrail"))
    created.append(cube("RW_lower_handrail_s_w", (-3.4, 4.15, lower_rail_y), (1.7, 0.12, 1.1), hazard, "lower-handrail"))
    created.append(cube("RW_lower_handrail_s_e", (3.4, 4.15, lower_rail_y), (1.7, 0.12, 1.1), hazard, "lower-handrail"))
    created.append(cube("RW_lower_handrail_w", (-4.15, -0.2, lower_rail_y), (0.12, 7.4, 1.1), hazard, "lower-handrail"))
    created.append(cube("RW_lower_handrail_e", (4.15, 0.4, lower_rail_y), (0.12, 5.6, 1.1), hazard, "lower-handrail"))

    # Yard industrial kit — outer only, not on tower apron
    for i, (x, z, sx, sy, sz) in enumerate((
        (-18, -18, 4.2, 2.6, 7.4),
        (-13.2, -18, 3.7, 2.4, 6.5),
        (17, 19, 4.2, 2.6, 7.4),
        (12.4, 19, 3.7, 2.3, 6.1),
        (-20, 12, 3.3, 1.9, 3.9),
        (20, -12, 3.3, 1.9, 3.9),
    )):
        created.append(cube(f"RW_crate_{i}", (x, -z, sy / 2), (sx, sz, sy), rust if i % 2 == 0 else oxide, "yard-crate"))
        created.append(cube(f"RW_crate_lid_{i}", (x, -z, sy + 0.08), (sx + 0.18, sz + 0.18, 0.14), steel, "yard-crate"))

    for i, (x, z) in enumerate(((-19, 9), (19, -10), (0, 22))):
        created.append(cylinder(f"RW_tank_{i}", (x, -z, 1.7), 1.85, 3.3, tank, rotation=(0, math.pi / 2, 0), vertices=18, kind="yard-tank"))
        created.append(cube(f"RW_tank_saddle_a_{i}", (x - 1.15, -z, 0.45), (0.38, 2.2, 0.9), concrete, "yard-tank"))
        created.append(cube(f"RW_tank_saddle_b_{i}", (x + 1.15, -z, 0.45), (0.38, 2.2, 0.9), concrete, "yard-tank"))

    for i, (x, z, sx, sz) in enumerate((
        (-12, 14, 5.2, 2.0), (13, -15, 5.6, 2.0), (-16, -4, 3.5, 2.4), (16, 5, 3.5, 2.4),
        (-5.5, 21, 5.0, 1.9), (6, -23, 5.0, 1.9),
    )):
        created.append(cube(f"RW_scrap_{i}", (x, -z, 1.0), (sx, sz, 2.0), concrete, "yard-cover"))
        created.append(cube(f"RW_scrap_beam_{i}", (x, -z, 2.15), (min(sx, 3.2), 0.22, 0.18), hazard, "yard-cover"))

    # Perimeter posts (visual)
    for i, (x, z) in enumerate((
        (-18, -29), (-6, -29), (6, -29), (18, -29),
        (-18, 29), (-6, 29), (6, 29), (18, 29),
        (-27, -18), (-27, 0), (-27, 18),
        (27, -18), (27, 0), (27, 18),
    )):
        created.append(cube(f"RW_perimeter_post_{i}", (x, -z, 2.4), (0.45, 0.45, 4.8), steel, "perimeter"))

    created.append(cube("RW_original_arena_sign", (0, -2.15, 11.15), (4.0, 0.14, 0.78), hazard, "signage"))

    for obj in created:
        obj.parent = root

    # Mild bevel on a few hero pieces via shade smooth
    for obj in created:
        if obj.type == "MESH" and obj.name.startswith(("RW_leg_", "RW_tank_", "RW_crane_", "RW_hardstand")):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Preview camera
    cam_data = bpy.data.cameras.new("RW_PreviewCam")
    cam = bpy.data.objects.new("RW_PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (18.5, -26.0, 14.5)
    cam.rotation_euler = (math.radians(62), 0, math.radians(32))
    bpy.context.scene.camera = cam
    light_data = bpy.data.lights.new(name="RW_Sun", type="SUN")
    light_data.energy = 3.2
    light = bpy.data.objects.new(name="RW_Sun", object_data=light_data)
    bpy.context.collection.objects.link(light)
    light.rotation_euler = (math.radians(42), math.radians(10), math.radians(-35))
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 720
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:  # noqa: BLE001 — preview is best-effort on headless
        print(f"PREVIEW_SKIP {type(exc).__name__}: {exc}")

    # Don't export lights/cameras into gameplay GLB
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(light, do_unlink=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print(f"WROTE {BLEND_PATH}")
    print(f"WROTE {GLB_PATH}")
    print(f"ASSET_VERSION {ASSET_VERSION}")
    print(f"CREATED {len(created)}")
    print(f"GLB_BYTES {GLB_PATH.stat().st_size}")


if __name__ == "__main__":
    main()
