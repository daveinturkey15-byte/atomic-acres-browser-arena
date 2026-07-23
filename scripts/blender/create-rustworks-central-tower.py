"""Rustworks-owned tower, undercroft, trench, and container overhaul.

Presentation-only GLB. Collision / shot authority remains TypeScript.
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
PREVIEW_PATH = ROOT / "artifacts" / "rustworks-tower-overhaul" / "rustworks-tower-overhaul-preview.png"

ASSET_VERSION = "rustworks-pass60-feedback-v2"
AUTHORED_HEIGHT_M = 15.87

LOADED: dict[str, bpy.types.Image] = {}
CREATED: list = []


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


def mat(name: str, albedo: str, *, metallic: float, roughness: float, tile: float = 2.0,
        emission=None, emission_strength: float = 0.0) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = load_tex(albedo)
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    # Generated + scale approximates metre tiling on primitives.
    mapping.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0 / tile)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    stem = Path(albedo).stem
    if (TEXTURE_ROOT / f"{stem}-normal.png").is_file():
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = load_tex(f"{stem}-normal.png", "Non-Color")
        ntex.interpolation = "Linear"
        ntex.extension = "REPEAT"
        nt.links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.95
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if (TEXTURE_ROOT / f"{stem}-roughness.png").is_file():
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = load_tex(f"{stem}-roughness.png", "Non-Color")
        rtex.interpolation = "Linear"
        rtex.extension = "REPEAT"
        nt.links.new(mapping.outputs["Vector"], rtex.inputs["Vector"])
        nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    m["rustworks_texture"] = albedo
    m["rustworks_tile_metres"] = tile
    return m


def tag(obj, kind: str):
    obj["rustworks_asset_owner"] = "Rustworks"
    obj["rustworks_asset_class"] = "authored-central-tower"
    obj["rustworks_semantic"] = kind
    obj["collision_authority"] = "typescript-rustworks-boxes"
    obj["asset_version"] = ASSET_VERSION
    return obj


def empty(name: str, loc, kind: str):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    tag(obj, kind)
    CREATED.append(obj)
    return obj


def assign(obj, material):
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def smart_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def bevel(obj, width=0.03, segments=2):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def cube(name, loc, scale, material, kind="detail", do_bevel=True, bevel_w=0.025):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if do_bevel and min(scale) > 0.12:
        try:
            bevel(obj, width=min(bevel_w, min(scale) * 0.08))
        except Exception:
            pass
    smart_uv(obj)
    assign(obj, material)
    tag(obj, kind)
    CREATED.append(obj)
    return obj


def cylinder(name, loc, radius, depth, material, rotation=(0, 0, 0), vertices=20, kind="detail", do_bevel=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if do_bevel:
        try:
            bevel(obj, width=0.02, segments=1)
        except Exception:
            pass
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cylinder_project(direction="VIEW_ON_EQUATOR", align="POLAR_ZX")
    bpy.ops.object.mode_set(mode="OBJECT")
    assign(obj, material)
    tag(obj, kind)
    CREATED.append(obj)
    return obj


def beam(name, start, end, width, material, kind="cross-brace"):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = cube(name, (a + b) / 2, (width, width, delta.length), material, kind, do_bevel=False)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def i_beam(name, loc, length, height, material, axis="x", kind="i-beam"):
    """Approximate I-beam from three boxes."""
    if axis == "x":
        cube(f"{name}_web", loc, (length, 0.08, height * 0.7), material, kind, do_bevel=False)
        cube(f"{name}_flange_t", (loc[0], loc[1], loc[2] + height * 0.4), (length, 0.32, 0.08), material, kind, do_bevel=False)
        cube(f"{name}_flange_b", (loc[0], loc[1], loc[2] - height * 0.4), (length, 0.32, 0.08), material, kind, do_bevel=False)
    else:
        cube(f"{name}_web", loc, (0.08, length, height * 0.7), material, kind, do_bevel=False)
        cube(f"{name}_flange_t", (loc[0], loc[1], loc[2] + height * 0.4), (0.32, length, 0.08), material, kind, do_bevel=False)
        cube(f"{name}_flange_b", (loc[0], loc[1], loc[2] - height * 0.4), (0.32, length, 0.08), material, kind, do_bevel=False)


def pipe_run(name_prefix, points, radius, material):
    for i in range(len(points) - 1):
        a, b = Vector(points[i]), Vector(points[i + 1])
        mid = (a + b) / 2
        delta = b - a
        obj = cylinder(f"{name_prefix}_{i}", mid, radius, delta.length, material, vertices=12, kind="process-pipe")
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
        # Elbow joint
        cylinder(f"{name_prefix}_joint_{i}", a, radius * 1.25, radius * 1.6, material, vertices=12, kind="process-pipe")


def main():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)

    # Materials — 11 industrial looks
    M_rust = mat("RW_Mat_RustSteel", "rustworks-steel-rust.png", metallic=0.78, roughness=0.58, tile=1.6)
    M_plate = mat("RW_Mat_PlateSteel", "rustworks-plate-steel.png", metallic=0.86, roughness=0.42, tile=1.8)
    M_grate = mat("RW_Mat_GrateSteel", "rustworks-grate-metal.png", metallic=0.84, roughness=0.38, tile=1.0)
    M_diamond = mat("RW_Mat_DiamondPlate", "rustworks-diamond-plate.png", metallic=0.8, roughness=0.4, tile=1.2)
    M_concrete = mat("RW_Mat_Concrete", "rustworks-concrete.png", metallic=0.04, roughness=0.92, tile=3.2)
    M_hazard = mat("RW_Mat_Hazard", "rustworks-hazard.png", metallic=0.32, roughness=0.52, tile=1.3,
                   emission=(0.55, 0.3, 0.05), emission_strength=0.16)
    M_oxide = mat("RW_Mat_Oxide", "rustworks-oxide.png", metallic=0.5, roughness=0.76, tile=2.0)
    M_asphalt = mat("RW_Mat_Asphalt", "rustworks-asphalt.png", metallic=0.02, roughness=0.94, tile=4.0)
    M_sign = mat("RW_Mat_Signage", "rustworks-signage.png", metallic=0.2, roughness=0.55, tile=1.0,
                 emission=(0.4, 0.08, 0.04), emission_strength=0.1)
    M_corr = mat("RW_Mat_Corrugated", "rustworks-corrugated.png", metallic=0.7, roughness=0.48, tile=1.5)

    root = bpy.data.objects.new("RUSTWORKS_AUTHORED_CENTRAL_TOWER", None)
    bpy.context.collection.objects.link(root)
    tag(root, "tower-root")
    root["asset_version"] = ASSET_VERSION
    root["authored_height_metres"] = AUTHORED_HEIGHT_M
    root["access_scheme"] = "undercroft-cross-plus-lower-ramp-plus-ship-ladder"
    root["quality_pass"] = "rustworks-pass60-feedback"
    root["container_layout"] = "five-per-side-one-open-per-side"
    root["service_trench"] = "west-deck-level"
    root["material_count_target"] = 10

    # ========== GROUND ==========
    # Match the actual 54x58 metre oil-rig deck. Keeping the authored surface
    # inside the safety rail lets the lowered ocean remain visible over every edge.
    cube("RW_rig_deck_top", (0, 0, 0.025), (54, 58, 0.05), M_plate, "ground-rig-deck", do_bevel=False)
    cube("RW_hardstand", (0, 0, 0.075), (16, 16, 0.05), M_asphalt, "ground-hardstand", do_bevel=False)
    cube("RW_service_lane_z", (0, 0, 0.125), (5.5, 48, 0.04), M_concrete, "ground-lane", do_bevel=False)
    cube("RW_service_lane_x", (0, 0, 0.125), (48, 5.5, 0.04), M_concrete, "ground-lane", do_bevel=False)
    for i, z in enumerate((-20, 20)):
        cube(f"RW_chevron_{i}", (0, -z, 0.16), (4.2, 0.7, 0.02), M_hazard, "ground-marking", do_bevel=False)

    # ========== TOWER LEGS (I-style) ==========
    for x in (-3.35, 3.35):
        for z in (-3.35, 3.35):
            # Outer sleeve
            cylinder(f"RW_leg_sleeve_{x}_{z}", (x, -z, 5.6), 0.38, 11.0, M_plate, vertices=16, kind="leg-sleeve")
            # Inner dark
            cylinder(f"RW_leg_core_{x}_{z}", (x, -z, 5.6), 0.22, 10.8, M_oxide, vertices=12, kind="leg-sleeve")
            cube(f"RW_leg_base_{x}_{z}", (x, -z, 0.4), (1.45, 1.45, 0.8), M_concrete, "leg-base")
            cube(f"RW_leg_base_plate_{x}_{z}", (x, -z, 0.85), (1.7, 1.7, 0.12), M_rust, "leg-base")
            # Anchor bolts
            for ox, oz in ((-0.5, -0.5), (-0.5, 0.5), (0.5, -0.5), (0.5, 0.5)):
                cylinder(f"RW_anchor_{x}_{z}_{ox}_{oz}", (x + ox, -(z + oz), 0.95), 0.06, 0.18, M_hazard, vertices=8, kind="leg-base")
            cube(f"RW_leg_cap_{x}_{z}", (x, -z, 11.2), (0.85, 0.85, 0.32), M_rust, "leg-cap")

    # Four armoured service modules produce two clear, intersecting tunnels
    # beneath the lower deck while visually grounding the tower legs.
    undercroft_passage = 3.1
    undercroft_module_size = 2.2
    undercroft_height = 2.75
    undercroft_offset = (undercroft_passage + undercroft_module_size) / 2
    for x in (-undercroft_offset, undercroft_offset):
        for z in (-undercroft_offset, undercroft_offset):
            module = cube(
                f"RW_undercroft_module_{x}_{z}", (x, -z, undercroft_height / 2),
                (undercroft_module_size, undercroft_module_size, undercroft_height), M_corr, "tower-undercroft"
            )
            module["rustworks_route_role"] = "undercroft-corner-cover"
            cube(
                f"RW_undercroft_cap_{x}_{z}", (x, -z, undercroft_height - 0.08),
                (2.45, 2.45, 0.16), M_hazard, "tower-undercroft"
            )
    cube("RW_undercroft_floor_east_west", (0, 0, 0.045), (8.1, 2.7, 0.05), M_grate, "tower-undercroft", do_bevel=False)
    cube("RW_undercroft_floor_north_south", (0, 0, 0.05), (2.7, 8.1, 0.05), M_grate, "tower-undercroft", do_bevel=False)
    for index, (x, z, sx, sy) in enumerate(((0, -4.0, 3.25, 0.12), (0, 4.0, 3.25, 0.12), (-4.0, 0, 0.12, 3.25), (4.0, 0, 0.12, 3.25))):
        cube(f"RW_undercroft_portal_{index}", (x, -z, 2.72), (sx, sy, 0.18), M_hazard, "tower-undercroft", do_bevel=False)

    # Two sparse structural bays per face; enough silhouette without the old
    # cage of criss-crossing braces around the under-tower fight space.
    for z in (-3.55, 3.55):
        for y0, y1 in ((3.7, 7.85), (8.45, 11.1)):
            beam(f"RW_brace_a_{z}_{y0}", (-3.35, -z, y0), (3.35, -z, y1), 0.12, M_rust)
            beam(f"RW_brace_b_{z}_{y0}", (3.35, -z, y0), (-3.35, -z, y1), 0.12, M_rust)
    for x in (-3.55, 3.55):
        for y0, y1 in ((3.7, 7.85), (8.45, 11.1)):
            beam(f"RW_brace_c_{x}_{y0}", (x, 3.35, y0), (x, -3.35, y1), 0.12, M_plate)
            beam(f"RW_brace_d_{x}_{y0}", (x, -3.35, y0), (x, 3.35, y1), 0.12, M_plate)

    # Horizontal ring beams
    for y in (3.2, 8.0, 11.0):
        for x1, z1, x2, z2 in (
            (-3.35, -3.35, 3.35, -3.35),
            (3.35, -3.35, 3.35, 3.35),
            (3.35, 3.35, -3.35, 3.35),
            (-3.35, 3.35, -3.35, -3.35),
        ):
            beam(f"RW_ring_{y}_{x1}_{z1}", (x1, -z1, y), (x2, -z2, y), 0.14, M_plate, "ring-beam")

    # ========== DECKS ==========
    cube("RW_lower_deck", (0, 0, 3.35), (8.4, 8.4, 0.34), M_grate, "lower-deck")
    cube("RW_lower_deck_skin", (0, 0, 3.12), (8.1, 8.1, 0.12), M_plate, "lower-deck")
    cube("RW_upper_deck", (0, 0, 8.15), (6.8, 6.8, 0.34), M_diamond, "upper-deck")
    cube("RW_upper_deck_skin", (0, 0, 7.92), (6.5, 6.5, 0.12), M_rust, "upper-deck")
    cube("RW_upper_walk_ring", (0, 0, 8.38), (5.0, 5.0, 0.05), M_hazard, "upper-walk-ring", do_bevel=False)
    # Deck edge kickplates
    for three_z in (-4.3, 4.3):
        cube(f"RW_lower_kick_z_{three_z}", (0, -three_z, 3.55), (8.6, 0.08, 0.18), M_hazard, "lower-handrail", do_bevel=False)
    for three_x in (-4.3, 4.3):
        cube(f"RW_lower_kick_x_{three_x}", (three_x, 0, 3.55), (0.08, 8.6, 0.18), M_hazard, "lower-handrail", do_bevel=False)

    # ========== TAPERED DERRICK CROWN ==========
    # Four continuous sloped members converge on supported rings. This replaces
    # the flat canopy slab and disconnected-looking upper silhouette.
    derrick_base_z = 8.47
    derrick_ring_z = 11.35
    derrick_top_z = 14.35
    for x in (-2.75, 2.75):
        for y in (-2.75, 2.75):
            beam(
                f"RW_derrick_leg_{x}_{y}",
                (x, y, derrick_base_z),
                (math.copysign(0.78, x), math.copysign(0.78, y), derrick_top_z),
                0.22,
                M_rust if x == y else M_plate,
                "derrick-crown",
            )
    for z, half in ((derrick_ring_z, 1.9), (derrick_top_z, 0.84)):
        beam(f"RW_derrick_ring_n_{z}", (-half, -half, z), (half, -half, z), 0.16, M_plate, "derrick-crown")
        beam(f"RW_derrick_ring_s_{z}", (-half, half, z), (half, half, z), 0.16, M_plate, "derrick-crown")
        beam(f"RW_derrick_ring_w_{z}", (-half, -half, z), (-half, half, z), 0.16, M_plate, "derrick-crown")
        beam(f"RW_derrick_ring_e_{z}", (half, -half, z), (half, half, z), 0.16, M_plate, "derrick-crown")
    cube("RW_derrick_service_platform", (0, 0, derrick_ring_z - 0.12), (4.3, 4.3, 0.18), M_grate, "derrick-service-platform")
    cylinder("RW_derrick_beacon_mast", (0, 0, 15.05), 0.08, 1.4, M_hazard, vertices=12, kind="derrick-beacon")
    cylinder("RW_derrick_beacon", (0, 0, 15.78), 0.21, 0.18, M_hazard, vertices=16, kind="derrick-beacon")

    # ========== ACCESS — ramp + ship ladder (TS-aligned) ==========
    landing_overlap = 0.06
    deck_thickness = 0.34
    lower_top = 3.35 + deck_thickness / 2
    upper_top = 8.15 + deck_thickness / 2
    lower_half = 8.4 / 2
    upper_half = 6.8 / 2

    lower_angle = math.radians(18.0)
    lower_width = 4.8
    lower_thick = 0.28
    lower_landing_depth = 1.55
    lower_ramp_len = (lower_top - 0.12) / math.sin(lower_angle)
    lower_landing_center_z = -lower_half - lower_landing_depth / 2 + landing_overlap
    lower_ramp_top_z = lower_landing_center_z - lower_landing_depth / 2 + landing_overlap
    lower_ramp_center_z = lower_ramp_top_z - math.cos(lower_angle) * (lower_ramp_len / 2)
    lower_ramp_center_y = lower_top - math.sin(lower_angle) * (lower_ramp_len / 2) - math.cos(lower_angle) * (lower_thick / 2)

    cube("RW_lower_ramp_foot", (0.0, -(lower_ramp_center_z - math.cos(lower_angle) * (lower_ramp_len / 2) - 0.6), 0.12),
         (lower_width + 1.1, 1.9, 0.22), M_concrete, "lower-ramp-foot")
    lower_ramp = cube("RW_lower_ramp_shell", (0.0, -lower_ramp_center_z, lower_ramp_center_y + 0.02),
                      (lower_width, lower_ramp_len, lower_thick), M_diamond, "lower-ramp", do_bevel=False)
    lower_ramp.rotation_euler = (-lower_angle, 0.0, 0.0)
    cube("RW_lower_ramp_landing_shell", (0.0, -lower_landing_center_z, lower_top),
         (lower_width + 0.5, lower_landing_depth, 0.14), M_grate, "lower-ramp-landing")
    # Tread strips on ramp
    for i in range(8):
        t = (i + 0.5) / 8
        three_z = (lower_ramp_center_z + math.cos(lower_angle) * (lower_ramp_len / 2)) - math.cos(lower_angle) * lower_ramp_len * t
        three_y = (lower_ramp_center_y - math.sin(lower_angle) * (lower_ramp_len / 2)) + math.sin(lower_angle) * lower_ramp_len * t + 0.16
        strip = cube(f"RW_lower_ramp_tread_{i}", (0.0, -three_z, three_y), (lower_width - 0.2, 0.12, 0.04), M_hazard, "lower-ramp", do_bevel=False)
        strip.rotation_euler = (-lower_angle, 0.0, 0.0)
    for side, label in ((-1, "w"), (1, "e")):
        rail = cube(f"RW_lower_ramp_rail_{label}", (side * (lower_width / 2 + 0.14), -lower_ramp_center_z, lower_ramp_center_y + 0.58),
                    (0.1, lower_ramp_len, 0.1), M_hazard, "lower-ramp-rail", do_bevel=False)
        rail.rotation_euler = (-lower_angle, 0.0, 0.0)
        mid = cube(f"RW_lower_ramp_midrail_{label}", (side * (lower_width / 2 + 0.14), -lower_ramp_center_z, lower_ramp_center_y + 0.32),
                   (0.07, lower_ramp_len, 0.07), M_plate, "lower-ramp-rail", do_bevel=False)
        mid.rotation_euler = (-lower_angle, 0.0, 0.0)

    ship_angle = math.radians(38.0)
    ship_rise = upper_top - lower_top
    ship_run = ship_rise / math.tan(ship_angle)
    ship_len = ship_rise / math.sin(ship_angle)
    ship_width = 2.6
    ship_thick = 0.22
    ship_x = lower_half - 0.1
    ship_lower_landing_depth = 1.25
    ship_upper_landing_depth = 1.35
    ship_low_z = lower_half - 0.2
    ship_lower_landing_center_z = ship_low_z + ship_lower_landing_depth / 2 - landing_overlap
    ship_low_surface_z = ship_lower_landing_center_z - ship_lower_landing_depth / 2 + landing_overlap
    ship_high_surface_z = ship_low_surface_z - ship_run
    ship_center_z = (ship_low_surface_z + ship_high_surface_z) / 2
    ship_center_y = (lower_top + upper_top) / 2 - math.cos(ship_angle) * (ship_thick / 2)
    ship_upper_landing_center_z = ship_high_surface_z - ship_upper_landing_depth / 2 + landing_overlap
    ship_bridge_center_x = (ship_x + upper_half - 0.35) / 2

    cube("RW_ship_ladder_lower_landing", (ship_x, -ship_lower_landing_center_z, lower_top),
         (ship_width + 0.6, ship_lower_landing_depth, 0.14), M_grate, "ship-ladder-landing")
    cube("RW_ship_ladder_upper_landing", (ship_x, -ship_upper_landing_center_z, upper_top),
         (ship_width + 0.55, ship_upper_landing_depth, 0.14), M_diamond, "ship-ladder-landing")
    cube("RW_upper_access_bridge", (ship_bridge_center_x, -ship_upper_landing_center_z, upper_top),
         (abs(ship_x - (upper_half - 0.35)) + 0.6, ship_upper_landing_depth, 0.14), M_grate, "upper-access")
    ladder_marker = empty("RW_ship_ladder_route", (ship_x, -ship_center_z, ship_center_y), "ship-ladder")
    ladder_marker["rustworks_collision_authority"] = "typescript-hidden-ramp"
    for side, label in ((-1, "west"), (1, "east")):
        rail = cube(f"RW_ship_ladder_rail_{label}", (ship_x + side * (ship_width / 2 + 0.1), -ship_center_z, ship_center_y + 0.65),
                    (0.1, ship_len, 0.1), M_hazard, "ship-ladder-rail", do_bevel=False)
        rail.rotation_euler = (ship_angle, 0.0, 0.0)
        stringer = cube(f"RW_ship_ladder_stringer_{label}", (ship_x + side * (ship_width / 2 + 0.02), -ship_center_z, ship_center_y - 0.1),
                        (0.1, ship_len + 0.12, 0.22), M_oxide, "ship-ladder-stringer", do_bevel=False)
        stringer.rotation_euler = (ship_angle, 0.0, 0.0)
    for index in range(12):
        t = (index + 0.5) / 12.0
        three_z = ship_low_surface_z - ship_run * t
        three_y = lower_top + ship_rise * t + 0.05
        cube(f"RW_ship_ladder_rung_{index}", (ship_x, -three_z, three_y),
             (ship_width - 0.16, 0.12, 0.1), M_hazard, "ship-ladder-rung", do_bevel=False)

    # Handrails — split openings
    upper_rail_y = upper_top + 0.65
    for three_z in (-3.45, 3.45):
        cube(f"RW_upper_handrail_z_{three_z}", (-0.1, -three_z, upper_rail_y), (6.2, 0.12, 1.2), M_hazard, "upper-handrail")
    cube("RW_upper_handrail_x_neg", (-3.45, 0.15, upper_rail_y), (0.12, 6.1, 1.2), M_hazard, "upper-handrail")
    cube("RW_upper_handrail_x_pos_south", (3.45, 2.65, upper_rail_y), (0.12, 1.6, 1.2), M_hazard, "upper-handrail")
    cube("RW_upper_handrail_x_pos_north", (3.45, -1.95, upper_rail_y), (0.12, 3.0, 1.2), M_hazard, "upper-handrail")
    for three_x, three_z in (
        (-3.45, -3.45), (2.75, -3.45), (-3.45, 3.45), (2.75, 3.45),
        (3.45, -3.45), (3.45, -2.45), (3.45, 0.4), (3.45, 3.45),
    ):
        cube(f"RW_upper_rail_post_{three_x}_{three_z}", (three_x, -three_z, upper_top + 0.65),
             (0.12, 0.12, 1.25), M_hazard, "upper-handrail")

    lower_rail_y = lower_top + 0.65
    cube("RW_lower_handrail_n", (-0.7, -4.3, lower_rail_y), (6.6, 0.12, 1.15), M_hazard, "lower-handrail")
    cube("RW_lower_handrail_s_w", (-3.5, 4.3, lower_rail_y), (1.8, 0.12, 1.15), M_hazard, "lower-handrail")
    cube("RW_lower_handrail_s_e", (3.5, 4.3, lower_rail_y), (1.8, 0.12, 1.15), M_hazard, "lower-handrail")
    cube("RW_lower_handrail_w", (-4.3, -0.2, lower_rail_y), (0.12, 7.6, 1.15), M_hazard, "lower-handrail")
    cube("RW_lower_handrail_e", (4.3, 0.45, lower_rail_y), (0.12, 5.8, 1.15), M_hazard, "lower-handrail")

    # ========== WEST SERVICE TRENCH ==========
    trench_x = -13.8
    trench_wall_xs = (trench_x - 1.85, trench_x + 1.85)
    trench_segments = (-12.0, 0.0, 12.0)
    cube("RW_service_trench_floor", (trench_x, 0, 0.045), (3.4, 34.0, 0.05), M_grate, "service-trench", do_bevel=False)
    for x in trench_wall_xs:
        for z in trench_segments:
            wall = cube(f"RW_service_trench_wall_{x}_{z}", (x, -z, 0.65), (0.32, 7.0, 1.3), M_concrete, "service-trench")
            wall["rustworks_route_role"] = "west-service-trench-cover"
            cube(f"RW_service_trench_coping_{x}_{z}", (x, -z, 1.34), (0.46, 7.05, 0.08), M_hazard, "service-trench")
    for z in (-6.0, 6.0):
        cube(f"RW_service_trench_crossover_{z}", (trench_x, -z, 2.55), (4.35, 1.2, 0.16), M_plate, "service-trench-crossover")

    # Eight low/medium cover pieces break the previously empty central quadrants
    # without closing either service cross or the west trench route.
    centre_cover_specs = (
        ("stack_base", (9.2, -9.4, 0.6), (3.2, 2.2, 1.2), M_rust),
        ("stack_top", (9.7, -9.4, 1.65), (1.8, 1.8, 0.9), M_hazard),
        ("stagger_long", (-9.4, -8.5, 0.62), (3.4, 1.0, 1.24), M_corr),
        ("stagger_short", (-8.15, -5.9, 0.45), (1.0, 2.4, 0.9), M_plate),
        ("corner_long", (9.4, 8.2, 0.55), (3.6, 0.9, 1.1), M_concrete),
        ("corner_high", (8.1, 9.45, 0.8), (0.9, 3.4, 1.6), M_oxide),
        ("low_flank_a", (-9.8, 8.6, 0.42), (2.8, 1.2, 0.84), M_concrete),
        ("low_flank_b", (-7.7, 10.0, 0.42), (1.8, 1.2, 0.84), M_hazard),
    )
    for label, (x, z, y), size, material in centre_cover_specs:
        cover = cube(f"RW_centre_cover_{label}", (x, -z, y), size, material, "yard-centre-cover")
        cover["rustworks_cover_role"] = label

    # ========== YARD (five containers per side; one pass-through per side) ==========
    perimeter_slots = (-18.0, -9.0, 0.0, 9.0, 18.0)
    perimeter_row = 21.5
    container_materials = (M_hazard, M_rust, M_corr)
    container_index = 0
    for side in ("north", "south", "west", "east"):
        for slot, offset in enumerate(perimeter_slots):
            if side in ("north", "south"):
                x, z, sx, sy = offset, (-perimeter_row if side == "north" else perimeter_row), 5.8, 2.5
                is_open = slot == (1 if side == "north" else 2)
            else:
                x, z, sx, sy = (-perimeter_row if side == "west" else perimeter_row), offset, 2.5, 5.8
                is_open = slot == (1 if side == "west" else 2)
            marker = empty(f"RW_container_placement_{side}_{slot}", (x, -z, 0), "yard-container-placement")
            marker["rustworks_side"] = side
            marker["rustworks_slot"] = slot
            marker["rustworks_open"] = is_open
            marker["rustworks_axis"] = "x" if side in ("north", "south") else "z"

            material = container_materials[slot % len(container_materials)]
            if is_open:
                thickness = 0.14
                if side in ("north", "south"):
                    shell_specs = (
                        ("wall_a", (x, -z - (sy - thickness) / 2, 1.3), (sx, thickness, 2.6)),
                        ("wall_b", (x, -z + (sy - thickness) / 2, 1.3), (sx, thickness, 2.6)),
                        ("roof", (x, -z, 2.6 - thickness / 2), (sx, sy, thickness)),
                    )
                else:
                    shell_specs = (
                        ("wall_a", (x - (sx - thickness) / 2, -z, 1.3), (thickness, sy, 2.6)),
                        ("wall_b", (x + (sx - thickness) / 2, -z, 1.3), (thickness, sy, 2.6)),
                        ("roof", (x, -z, 2.6 - thickness / 2), (sx, sy, thickness)),
                    )
                for suffix, loc, scale in shell_specs:
                    shell = cube(f"RW_open_container_{side}_{slot}_{suffix}", loc, scale, material, "yard-open-container")
                    shell["rustworks_side"] = side
                    shell["rustworks_slot"] = slot
                cube(f"RW_open_container_{side}_{slot}_floor", (x, -z, 0.045), (sx, sy, 0.05), M_grate, "yard-open-container", do_bevel=False)
                for end in (-1, 1):
                    if side in ("north", "south"):
                        end_axis = x + end * (sx / 2 - 0.07)
                        for edge in (-1, 1):
                            cube(
                                f"RW_open_container_{side}_{slot}_end_{end}_post_{edge}",
                                (end_axis, -z + edge * (sy / 2 - 0.08), 1.3),
                                (0.14, 0.16, 2.6), M_plate, "yard-open-container-frame", do_bevel=False
                            )
                        cube(
                            f"RW_open_container_{side}_{slot}_end_{end}_header",
                            (end_axis, -z, 2.53), (0.14, sy - 0.32, 0.14),
                            M_plate, "yard-open-container-frame", do_bevel=False
                        )
                    else:
                        end_axis = -z + end * (sy / 2 - 0.07)
                        for edge in (-1, 1):
                            cube(
                                f"RW_open_container_{side}_{slot}_end_{end}_post_{edge}",
                                (x + edge * (sx / 2 - 0.08), end_axis, 1.3),
                                (0.16, 0.14, 2.6), M_plate, "yard-open-container-frame", do_bevel=False
                            )
                        cube(
                            f"RW_open_container_{side}_{slot}_end_{end}_header",
                            (x, end_axis, 2.53), (sx - 0.32, 0.14, 0.14),
                            M_plate, "yard-open-container-frame", do_bevel=False
                        )
            else:
                container = cube(
                    f"RW_shipping_container_{side}_{slot}", (x, -z, 1.3), (sx, sy, 2.6),
                    material, "yard-container"
                )
                container["rustworks_side"] = side
                container["rustworks_slot"] = slot
            container_index += 1

    # Open safety rail (not solid walls).
    posts = []
    for x in range(-24, 25, 8):
        posts.append((x, -29))
        posts.append((x, 29))
    for z in range(-20, 21, 8):
        posts.append((-26.6, z))
        posts.append((26.6, z))
    for i, (x, z) in enumerate(posts):
        cube(f"RW_perimeter_post_{i}", (x, -z, 0.7), (0.28, 0.28, 1.4), M_plate, "perimeter")
    for z in (-29.2, 29.2):
        cube(f"RW_fence_rail_z_{z}", (0, -z, 1.15), (52, 0.1, 0.12), M_hazard, "perimeter", do_bevel=False)
    for x in (-26.8, 26.8):
        cube(f"RW_fence_rail_x_{x}", (x, 0, 1.15), (0.1, 56, 0.12), M_hazard, "perimeter", do_bevel=False)

    # Oil-rig legs + thick deck slab (ocean sits far below in runtime water system).
    for i, (x, y) in enumerate(((-22, -24), (-22, 24), (22, -24), (22, 24), (-8, -8), (8, 8), (-8, 8), (8, -8))):
        cube(f"RW_rig_leg_{i}", (x, y, -8.0), (1.3, 1.3, 15.0), M_plate, "rig-leg")
    cube("RW_rig_deck_slab", (0, 0, -0.85), (54.5, 58.5, 1.6), M_rust, "rig-deck")
    for z in (-18, 0, 18):
        cube(f"RW_rig_girder_z_{z}", (0, -z, -1.55), (50, 0.7, 0.55), M_plate, "rig-deck")
    for x in (-18, 0, 18):
        cube(f"RW_rig_girder_x_{x}", (x, 0, -1.55), (0.7, 54, 0.55), M_plate, "rig-deck")

    # Signage
    cube("RW_plant_sign", (0, -2.2, 11.3), (4.4, 0.16, 0.9), M_sign, "signage")
    cube("RW_plant_sign_frame", (0, -2.15, 11.3), (4.7, 0.08, 1.1), M_plate, "signage", do_bevel=False)

    # Floodlight poles at corners / edges
    for i, (x, z) in enumerate(((-22, -22), (22, 22), (-22, 22), (22, -22), (0, -28), (0, 28))):
        cube(f"RW_light_pole_{i}", (x, -z, 4.5), (0.28, 0.28, 9.0), M_plate, "yard-light")
        cube(f"RW_light_arm_{i}", (x + 0.8, -z, 8.8), (1.6, 0.18, 0.18), M_rust, "yard-light")
        cube(f"RW_light_head_{i}", (x + 1.5, -z, 8.6), (0.7, 0.5, 0.35), M_hazard, "yard-light",
             do_bevel=False)

    # Parent all
    for obj in CREATED:
        obj.parent = root

    # Smooth a few hero pieces
    for obj in CREATED:
        if obj.type == "MESH" and any(k in obj.name for k in ("RW_leg_sleeve", "RW_silo_")):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Preview render
    cam_data = bpy.data.cameras.new("RW_PreviewCam")
    cam = bpy.data.objects.new("RW_PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (24.0, -34.0, 19.0)
    cam.rotation_euler = (Vector((0.0, 0.0, 6.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 34
    bpy.context.scene.camera = cam
    sun = bpy.data.lights.new(name="RW_Sun", type="SUN")
    sun.energy = 4.0
    sun_obj = bpy.data.objects.new("RW_Sun", sun)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(48), math.radians(12), math.radians(-40))
    area = bpy.data.lights.new(name="RW_Fill", type="AREA")
    area.energy = 250
    area_obj = bpy.data.objects.new("RW_Fill", area)
    bpy.context.collection.objects.link(area_obj)
    area_obj.location = (-12, 18, 10)
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 1600
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    try:
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW {PREVIEW_PATH}")
    except Exception as exc:  # noqa: BLE001
        print(f"PREVIEW_SKIP {type(exc).__name__}: {exc}")

    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun_obj, do_unlink=True)
    bpy.data.objects.remove(area_obj, do_unlink=True)

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
    print(f"CREATED {len(CREATED)}")
    print(f"GLB_BYTES {GLB_PATH.stat().st_size}")
    print(f"MATERIALS {len(bpy.data.materials)}")


if __name__ == "__main__":
    main()
