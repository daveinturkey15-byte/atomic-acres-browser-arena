"""Pass 44 — Rustworks Quality industrial plant (Sol-depth authored environment).

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
PREVIEW_PATH = ROOT / "artifacts" / "pass44" / "rustworks-quality-plant-preview.png"

ASSET_VERSION = "pass44-v1"
AUTHORED_HEIGHT_M = 15.2

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
    obj["rustworks_asset_class"] = "authored-central-tower"
    obj["rustworks_semantic"] = kind
    obj["collision_authority"] = "typescript-rustworks-boxes"
    obj["asset_version"] = ASSET_VERSION
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
    M_tank = mat("RW_Mat_Tank", "rustworks-tank-paint.png", metallic=0.58, roughness=0.46, tile=2.4)
    M_asphalt = mat("RW_Mat_Asphalt", "rustworks-asphalt.png", metallic=0.02, roughness=0.94, tile=4.0)
    M_sign = mat("RW_Mat_Signage", "rustworks-signage.png", metallic=0.2, roughness=0.55, tile=1.0,
                 emission=(0.4, 0.08, 0.04), emission_strength=0.1)
    M_corr = mat("RW_Mat_Corrugated", "rustworks-corrugated.png", metallic=0.7, roughness=0.48, tile=1.5)

    root = bpy.data.objects.new("RUSTWORKS_AUTHORED_CENTRAL_TOWER", None)
    bpy.context.collection.objects.link(root)
    tag(root, "tower-root")
    root["asset_version"] = ASSET_VERSION
    root["authored_height_metres"] = AUTHORED_HEIGHT_M
    root["access_scheme"] = "lower-ramp-plus-ship-ladder"
    root["quality_pass"] = "pass44-industrial-plant"
    root["material_count_target"] = 11

    # ========== GROUND ==========
    cube("RW_asphalt_pad", (0, 0, 0.02), (62, 62, 0.05), M_asphalt, "ground-asphalt", do_bevel=False)
    cube("RW_hardstand", (0, 0, 0.06), (20, 20, 0.1), M_concrete, "ground-hardstand")
    cube("RW_service_lane", (0, 18, 0.07), (10, 22, 0.08), M_concrete, "ground-lane")
    # Stained apron rings so the yard floor isn't a single flat grey read.
    for i, r in enumerate((11.5, 14.5, 17.5)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.35, major_segments=48, minor_segments=8, location=(0, 0, 0.09))
        ring = bpy.context.object
        ring.name = f"RW_apron_ring_{i}"
        smart_uv(ring)
        assign(ring, M_hazard if i == 1 else M_oxide)
        tag(ring, "ground-marking")
        CREATED.append(ring)
    for i, z in enumerate((-26, -20, -14, 14, 20, 26)):
        cube(f"RW_chevron_{i}", (0, -z, 0.09), (4.2, 0.7, 0.05), M_hazard, "ground-marking", do_bevel=False)
    for i, (x, z) in enumerate(((-8, -8), (8, 8), (-8, 8), (8, -8), (0, 12), (0, -12))):
        cube(f"RW_oil_stain_{i}", (x, -z, 0.08), (3.2, 2.4, 0.03), M_oxide, "ground-detail", do_bevel=False)
    # Drain gutters
    for z in (-9.5, 9.5):
        cube(f"RW_gutter_z_{z}", (0, -z, 0.08), (18, 0.35, 0.12), M_oxide, "ground-detail", do_bevel=False)
    for x in (-9.5, 9.5):
        cube(f"RW_gutter_x_{x}", (x, 0, 0.08), (0.35, 18, 0.12), M_oxide, "ground-detail", do_bevel=False)

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

    # Cross bracing — denser lattice
    for z in (-3.55, 3.55):
        for y0, y1 in ((0.6, 2.9), (2.9, 5.2), (5.2, 7.5), (7.5, 9.8), (9.8, 11.2)):
            beam(f"RW_brace_a_{z}_{y0}", (-3.35, -z, y0), (3.35, -z, y1), 0.12, M_rust)
            beam(f"RW_brace_b_{z}_{y0}", (3.35, -z, y0), (-3.35, -z, y1), 0.12, M_rust)
    for x in (-3.55, 3.55):
        for y0, y1 in ((0.6, 2.9), (2.9, 5.2), (5.2, 7.5), (7.5, 9.8), (9.8, 11.2)):
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
    cube("RW_lower_deck", (0, 0, 3.35), (8.8, 8.8, 0.36), M_grate, "lower-deck")
    cube("RW_lower_deck_skin", (0, 0, 3.12), (8.5, 8.5, 0.12), M_plate, "lower-deck")
    cube("RW_upper_deck", (0, 0, 8.15), (7.1, 7.1, 0.36), M_diamond, "upper-deck")
    cube("RW_upper_deck_skin", (0, 0, 7.92), (6.8, 6.8, 0.12), M_rust, "upper-deck")
    cube("RW_upper_walk_ring", (0, 0, 8.38), (5.1, 5.1, 0.05), M_hazard, "upper-walk-ring", do_bevel=False)
    # Deck edge kickplates
    for three_z in (-4.3, 4.3):
        cube(f"RW_lower_kick_z_{three_z}", (0, -three_z, 3.55), (8.6, 0.08, 0.18), M_hazard, "lower-handrail", do_bevel=False)
    for three_x in (-4.3, 4.3):
        cube(f"RW_lower_kick_x_{three_x}", (three_x, 0, 3.55), (0.08, 8.6, 0.18), M_hazard, "lower-handrail", do_bevel=False)

    # Corner-only utilities — open centre
    cube("RW_control_hut_shell", (-2.15, 2.15, 9.5), (2.0, 2.0, 2.35), M_corr, "control-hut")
    cube("RW_control_hut_door", (-2.15, 1.1, 9.15), (0.95, 0.1, 1.7), M_plate, "control-hut")
    cube("RW_control_hut_window", (-1.15, 2.15, 9.7), (0.08, 0.7, 0.55), M_sign, "control-hut")
    cube("RW_control_hut_awning", (-2.15, 1.2, 10.8), (2.2, 1.1, 0.14), M_hazard, "control-hut")
    cube("RW_control_hut_ac", (-2.15, 2.9, 10.9), (0.7, 0.55, 0.45), M_oxide, "control-hut")
    cube("RW_process_manifold", (2.2, -2.2, 9.25), (1.15, 1.15, 1.7), M_plate, "process-equipment")
    cylinder("RW_manifold_stack", (2.2, -2.2, 10.35), 0.26, 1.0, M_rust, kind="process-equipment")
    cylinder("RW_manifold_valve", (2.2, -1.4, 9.0), 0.18, 0.35, M_hazard, rotation=(math.pi / 2, 0, 0), kind="process-equipment")
    # Cable trays on upper rim (outside walk)
    cube("RW_cable_tray_a", (0, -3.7, 8.7), (5.5, 0.4, 0.15), M_oxide, "cable-tray")
    cube("RW_cable_tray_b", (3.7, 0.4, 8.7), (0.4, 5.0, 0.15), M_oxide, "cable-tray")

    # ========== CROWN / CRANE ==========
    for x in (-2.8, 2.8):
        for z in (-2.8, 2.8):
            cube(f"RW_canopy_post_{x}_{z}", (x, -z, 11.6), (0.22, 0.22, 2.7), M_plate, "canopy-post")
    cube("RW_canopy_roof", (0, 0, 13.05), (6.9, 6.9, 0.28), M_corr, "tower-crown")
    cube("RW_canopy_ridge", (0, 0, 13.45), (0.36, 7.2, 0.6), M_hazard, "tower-crown")
    # Crane gantry
    i_beam("RW_crane_gantry", (-1.0, 0, 13.7), 12.5, 0.55, M_plate, axis="x")
    cube("RW_crane_trolley", (-8.5, 0, 13.55), (1.1, 0.7, 0.55), M_rust, "crane-detail")
    cylinder("RW_crane_drop", (-10.9, 0, 10.2), 0.055, 6.6, M_oxide, kind="crane-cable")
    cube("RW_crane_hook_block", (-10.9, 0, 6.7), (0.4, 0.45, 0.7), M_rust, "crane-hook")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.07, major_segments=20, minor_segments=8,
                                     location=(-10.9, 0, 13.7), rotation=(math.pi / 2, 0, 0))
    pulley = bpy.context.object
    pulley.name = "RW_crane_pulley"
    assign(pulley, M_hazard)
    tag(pulley, "crane-detail")
    CREATED.append(pulley)

    # ========== PROCESS RISERS / PIPES ==========
    for x in (-2.65, 2.65):
        cylinder(f"RW_process_riser_{x}", (x, 3.7, 6.2), 0.22, 10.5, M_oxide, kind="process-pipe")
        cylinder(f"RW_process_cap_{x}", (x, 3.7, 11.55), 0.34, 0.3, M_rust, kind="process-pipe")
        # Ladder cages on risers
        for y in (2, 4, 6, 8, 10):
            cube(f"RW_riser_band_{x}_{y}", (x, 3.7, y), (0.55, 0.55, 0.08), M_plate, "process-pipe", do_bevel=False)

    pipe_run("RW_pipeA", [(-4.5, 2.0, 4.2), (0.0, 2.0, 4.2), (0.0, -2.5, 4.2), (3.5, -2.5, 6.5)], 0.14, M_plate)
    pipe_run("RW_pipeB", [(4.0, -3.8, 5.5), (4.0, 1.5, 5.5), (-1.0, 1.5, 7.8), (-1.0, 1.5, 10.2)], 0.12, M_rust)
    pipe_run("RW_pipeC", [(-3.8, -3.8, 9.0), (2.5, -3.8, 9.0), (2.5, -3.8, 11.0)], 0.11, M_tank)

    # ========== ACCESS — ramp + ship ladder (TS-aligned) ==========
    landing_overlap = 0.06
    deck_thickness = 0.36
    lower_top = 3.35 + deck_thickness / 2
    upper_top = 8.15 + deck_thickness / 2
    lower_half = 8.8 / 2
    upper_half = 7.1 / 2

    lower_angle = math.radians(22.0)
    lower_width = 3.9
    lower_thick = 0.3
    lower_landing_depth = 1.6
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

    ship_angle = math.radians(48.0)
    ship_rise = upper_top - lower_top
    ship_run = ship_rise / math.tan(ship_angle)
    ship_len = ship_rise / math.sin(ship_angle)
    ship_width = 1.8
    ship_thick = 0.24
    ship_x = lower_half - 0.4
    ship_lower_landing_depth = 1.35
    ship_upper_landing_depth = 1.45
    ship_low_z = lower_half - 0.25
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
    slab = cube("RW_ship_ladder_slab", (ship_x, -ship_center_z, ship_center_y + 0.02),
                (ship_width, ship_len, ship_thick), M_diamond, "ship-ladder", do_bevel=False)
    slab.rotation_euler = (ship_angle, 0.0, 0.0)
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

    # ========== YARD ==========
    # Vertical silos
    for i, (x, z, h, r) in enumerate((
        (-20, -18, 9.5, 2.2), (-15.2, -18.5, 8.2, 1.9), (19, 18, 9.5, 2.2), (14.2, 18.5, 7.8, 1.8),
    )):
        cylinder(f"RW_silo_{i}", (x, -z, h / 2), r, h, M_corr if i % 2 == 0 else M_tank, vertices=28, kind="yard-silo")
        # Flat cap disc — plate steel avoids streaky rust looking like wood on top faces.
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r * 0.98, depth=0.35, location=(x, -z, h + 0.18))
        cap = bpy.context.object
        cap.name = f"RW_silo_cap_{i}"
        smart_uv(cap)
        assign(cap, M_plate)
        tag(cap, "yard-silo")
        CREATED.append(cap)
        cube(f"RW_silo_ladder_{i}", (x + r + 0.15, -z, h * 0.45), (0.12, 0.35, h * 0.85), M_hazard, "yard-silo", do_bevel=False)
        cube(f"RW_silo_pad_{i}", (x, -z, 0.15), (r * 2.4, r * 2.4, 0.3), M_concrete, "yard-silo")
        # Vertical ribs for silhouette
        for rib in range(6):
            ang = rib * math.pi / 3
            rx = x + math.cos(ang) * (r + 0.04)
            rz = z + math.sin(ang) * (r + 0.04)
            cube(f"RW_silo_rib_{i}_{rib}", (rx, -rz, h * 0.45), (0.1, 0.1, h * 0.85), M_oxide, "yard-silo", do_bevel=False)

    # Horizontal tanks
    for i, (x, z) in enumerate(((-20, 10), (20, -11), (0, 24), (-8, 22))):
        cylinder(f"RW_tank_{i}", (x, -z, 1.85), 1.7, 5.2, M_tank, rotation=(0, math.pi / 2, 0), vertices=20, kind="yard-tank")
        cube(f"RW_tank_saddle_a_{i}", (x - 1.5, -z, 0.5), (0.4, 2.0, 1.0), M_concrete, "yard-tank")
        cube(f"RW_tank_saddle_b_{i}", (x + 1.5, -z, 0.5), (0.4, 2.0, 1.0), M_concrete, "yard-tank")
        cylinder(f"RW_tank_hatch_{i}", (x, -z, 3.5), 0.35, 0.25, M_rust, kind="yard-tank")

    # Pipe rack corridors
    for i, (x, z0, z1) in enumerate(((-12, -10, 10), (12, -10, 10), (-6, 16, 26))):
        for y in (2.2, 3.4):
            i_beam(f"RW_rack_beam_{i}_{y}", (x, -((z0 + z1) / 2), y), abs(z1 - z0), 0.4, M_plate, axis="y")
        for z in (z0, (z0 + z1) / 2, z1):
            cube(f"RW_rack_post_{i}_{z}", (x, -z, 1.8), (0.25, 0.25, 3.6), M_rust, "pipe-rack")
        pipe_run(f"RW_rack_pipe_{i}", [(x - 0.35, -z0, 2.6), (x - 0.35, -z1, 2.6)], 0.12, M_oxide)
        pipe_run(f"RW_rack_pipe2_{i}", [(x + 0.35, -z0, 3.0), (x + 0.35, -z1, 3.0)], 0.1, M_tank)

    # Crates / scrap cover
    for i, (x, z, sx, sy, sz) in enumerate((
        (-17, 14, 4.5, 2.8, 3.2), (16, -16, 4.8, 2.5, 3.0), (-14, 4, 3.2, 2.2, 2.8),
        (15, 6, 3.4, 2.0, 2.6), (-4, 20, 5.2, 2.0, 2.4), (5, -22, 5.0, 1.9, 2.5),
        (-22, -4, 2.8, 3.5, 2.2), (22, 4, 2.8, 3.2, 2.2),
    )):
        cube(f"RW_crate_{i}", (x, -z, sy / 2), (sx, sz, sy), M_rust if i % 2 == 0 else M_oxide, "yard-crate")
        cube(f"RW_crate_lid_{i}", (x, -z, sy + 0.1), (sx + 0.2, sz + 0.2, 0.16), M_plate, "yard-crate")
        if i % 3 == 0:
            cube(f"RW_crate_band_{i}", (x, -z, sy * 0.55), (sx + 0.05, sz + 0.05, 0.12), M_hazard, "yard-crate", do_bevel=False)

    # Scrap piles / low cover
    for i, (x, z, sx, sz) in enumerate((
        (-11, 16, 5.5, 2.2), (12, -14, 5.8, 2.1), (-16, -6, 3.6, 2.5), (17, 8, 3.6, 2.5),
        (-7, 24, 5.2, 2.0), (7, -25, 5.2, 2.0), (0, -20, 4.0, 1.8),
    )):
        cube(f"RW_scrap_{i}", (x, -z, 1.05), (sx, sz, 2.1), M_concrete, "yard-cover")
        cube(f"RW_scrap_beam_{i}", (x, -z, 2.25), (min(sx, 3.4), 0.24, 0.2), M_hazard, "yard-cover")
        cube(f"RW_scrap_sheet_{i}", (x + 0.4, -z + 0.3, 1.8), (sx * 0.4, sz * 0.5, 0.08), M_corr, "yard-cover", do_bevel=False)

    # Perimeter fence posts + panels
    posts = []
    for x in range(-28, 29, 7):
        posts.append((x, -30))
        posts.append((x, 30))
    for z in range(-23, 24, 7):
        posts.append((-30, z))
        posts.append((30, z))
    for i, (x, z) in enumerate(posts):
        cube(f"RW_perimeter_post_{i}", (x, -z, 2.5), (0.35, 0.35, 5.0), M_plate, "perimeter")
        cube(f"RW_perimeter_cap_{i}", (x, -z, 5.15), (0.5, 0.5, 0.2), M_hazard, "perimeter", do_bevel=False)
    # Fence rails
    for z in (-30, 30):
        cube(f"RW_fence_rail_z_{z}_lo", (0, -z, 1.2), (58, 0.08, 0.12), M_oxide, "perimeter", do_bevel=False)
        cube(f"RW_fence_rail_z_{z}_hi", (0, -z, 3.6), (58, 0.08, 0.12), M_oxide, "perimeter", do_bevel=False)
    for x in (-30, 30):
        cube(f"RW_fence_rail_x_{x}_lo", (x, 0, 1.2), (0.08, 58, 0.12), M_oxide, "perimeter", do_bevel=False)
        cube(f"RW_fence_rail_x_{x}_hi", (x, 0, 3.6), (0.08, 58, 0.12), M_oxide, "perimeter", do_bevel=False)

    # Signage
    cube("RW_plant_sign", (0, -2.2, 11.3), (4.4, 0.16, 0.9), M_sign, "signage")
    cube("RW_plant_sign_frame", (0, -2.15, 11.3), (4.7, 0.08, 1.1), M_plate, "signage", do_bevel=False)
    cube("RW_yard_sign_a", (-10, 12, 3.2), (0.12, 2.2, 1.4), M_sign, "signage")
    cube("RW_yard_sign_b", (10, -12, 3.2), (0.12, 2.2, 1.4), M_hazard, "signage")

    # Floodlight poles
    for i, (x, z) in enumerate(((-22, -22), (22, 22), (-22, 22), (22, -22), (0, -28), (0, 28))):
        cube(f"RW_light_pole_{i}", (x, -z, 4.5), (0.28, 0.28, 9.0), M_plate, "yard-light")
        cube(f"RW_light_arm_{i}", (x + 0.8, -z, 8.8), (1.6, 0.18, 0.18), M_rust, "yard-light")
        cube(f"RW_light_head_{i}", (x + 1.5, -z, 8.6), (0.7, 0.5, 0.35), M_hazard, "yard-light",
             do_bevel=False)

    # Spool props
    for i, (x, z) in enumerate(((-8, -14), (9, 15), (-18, 0))):
        cylinder(f"RW_spool_{i}", (x, -z, 1.1), 1.1, 0.9, M_oxide, rotation=(math.pi / 2, 0, 0), vertices=16, kind="yard-prop")
        cylinder(f"RW_spool_core_{i}", (x, -z, 1.1), 0.35, 1.0, M_rust, rotation=(math.pi / 2, 0, 0), vertices=12, kind="yard-prop")

    # Parent all
    for obj in CREATED:
        obj.parent = root

    # Smooth a few hero pieces
    for obj in CREATED:
        if obj.type == "MESH" and any(k in obj.name for k in ("RW_leg_sleeve", "RW_silo_", "RW_tank_", "RW_crane_")):
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
    cam.location = (22.0, -30.0, 16.0)
    cam.rotation_euler = (math.radians(58), 0, math.radians(36))
    cam_data.lens = 28
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
