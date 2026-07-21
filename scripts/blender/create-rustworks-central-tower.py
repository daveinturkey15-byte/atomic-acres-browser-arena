"""Create the original Rustworks central-tower Blender detail kit.

The TypeScript arena remains collision and shot authority. This asset is a
non-authoritative Blender Render presentation layer aligned to that tower.
Pass 40 mirrors the revised ship-ladder access and denser industrial read.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "source-assets" / "blender" / "rustworks-central-tower.blend"
GLB_PATH = ROOT / "public" / "assets" / "original" / "models" / "rustworks-central-tower.glb"

ASSET_VERSION = "pass40-v1"
AUTHORED_HEIGHT_M = 14.8


def material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = color
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    return mat


def tag(obj, kind: str):
    obj["rustworks_asset_class"] = "authored-central-tower"
    obj["rustworks_semantic"] = kind
    obj["collision_authority"] = "typescript-rustworks-boxes"
    return obj


def cube(name: str, location, scale, mat, kind="tower-detail"):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    tag(obj, kind)
    return obj


def cylinder(name: str, location, radius: float, depth: float, mat, rotation=(0, 0, 0), vertices=12, kind="tower-detail"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
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
    # Keep regeneration clean: Blender's default save-version backup would leave
    # a stray .blend1 candidate beside the source asset on every authoring pass.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    rust = material("Rustworks_RustedSteel", (0.30, 0.085, 0.035, 1), 0.58, 0.72)
    steel = material("Rustworks_Gunmetal", (0.12, 0.17, 0.19, 1), 0.78, 0.43)
    hazard = material("Rustworks_HazardYellow", (0.82, 0.39, 0.045, 1), 0.42, 0.6)
    dark = material("Rustworks_OxideDark", (0.055, 0.038, 0.034, 1), 0.45, 0.86)

    root = bpy.data.objects.new("RUSTWORKS_AUTHORED_CENTRAL_TOWER", None)
    bpy.context.collection.objects.link(root)
    tag(root, "tower-root")
    root["asset_version"] = ASSET_VERSION
    root["authored_height_metres"] = AUTHORED_HEIGHT_M
    root["access_scheme"] = "lower-ramp-plus-ship-ladder"

    created = []
    # Structural sleeves and X-braces around the taller procedural authority.
    for x in (-3.35, 3.35):
        for z in (-3.35, 3.35):
            created.append(cylinder(f"RW_leg_sleeve_{x}_{z}", (x, z, 5.5), 0.13, 10.7, steel, kind="leg-sleeve"))
            created.append(cube(f"RW_leg_base_{x}_{z}", (x, z, 0.35), (1.05, 1.05, 0.7), dark, "leg-base"))
    for z in (-3.42, 3.42):
        for y0, y1 in ((0.35, 3.25), (3.55, 8.05), (8.35, 11.0)):
            created.append(beam(f"RW_brace_xa_{z}_{y0}", (-3.25, z, y0), (3.25, z, y1), 0.12, rust))
            created.append(beam(f"RW_brace_xb_{z}_{y0}", (3.25, z, y0), (-3.25, z, y1), 0.12, rust))
    for x in (-3.42, 3.42):
        for y0, y1 in ((0.35, 3.25), (3.55, 8.05), (8.35, 11.0)):
            created.append(beam(f"RW_brace_za_{x}_{y0}", (x, -3.25, y0), (x, 3.25, y1), 0.12, steel))
            created.append(beam(f"RW_brace_zb_{x}_{y0}", (x, 3.25, y0), (x, -3.25, y1), 0.12, steel))

    # Deck trim plates (presentation) aligned to procedural deck elevations.
    created.append(cube("RW_lower_deck_trim", (0, 0, 3.52), (8.1, 8.1, 0.06), steel, "lower-deck-trim"))
    created.append(cube("RW_upper_deck_trim", (0, 0, 8.32), (6.5, 6.5, 0.06), rust, "upper-deck-trim"))
    # Authored silhouettes use Blender (x, -threeZ, threeY) so Quality overlay matches
    # the procedural control hut / manifold / process gear instead of ghosting beside it.
    created.append(cube("RW_control_hut_shell", (-1.35, 1.45, 9.55), (2.6, 2.4, 2.5), dark, "control-hut"))
    created.append(cube("RW_process_manifold", (1.55, -1.85, 9.35), (1.2, 1.2, 1.7), steel, "process-equipment"))

    # Upper canopy and crown. Guard rails are split around the ship-ladder opening
    # on +X so the authored overlay does not paint a ghost wall across the route.
    for x in (-2.8, 2.8):
        for z in (-2.8, 2.8):
            created.append(cube(f"RW_canopy_post_{x}_{z}", (x, z, 11.55), (0.16, 0.16, 3.0), steel, "canopy-post"))
    created.append(cube("RW_canopy_roof", (0, 0, 13.12), (6.4, 6.4, 0.22), rust, "tower-crown"))
    created.append(cube("RW_canopy_ridge", (0, 0, 13.55), (0.26, 6.7, 0.58), hazard, "tower-crown"))
    upper_rail_y = 8.32 + 0.6
    for three_z in (-3.35, 3.35):
        created.append(cube(
            f"RW_upper_handrail_z_{three_z}",
            (-0.1, -three_z, upper_rail_y),
            (6.0, 0.12, 1.2),
            hazard,
            "upper-handrail",
        ))
    created.append(cube("RW_upper_handrail_x_neg", (-3.35, 0.15, upper_rail_y), (0.12, 5.9, 1.2), hazard, "upper-handrail"))
    created.append(cube("RW_upper_handrail_x_pos_south", (3.35, 2.45, upper_rail_y), (0.12, 1.8, 1.2), hazard, "upper-handrail"))
    created.append(cube("RW_upper_handrail_x_pos_north", (3.35, -1.675, upper_rail_y), (0.12, 3.35, 1.2), hazard, "upper-handrail"))
    for three_x, three_z in (
        (-3.35, -3.35), (2.9, -3.35), (-3.35, 3.35), (2.9, 3.35),
        (3.35, -3.35), (3.35, -1.55), (3.35, 0.0), (3.35, 3.35),
    ):
        created.append(cube(
            f"RW_upper_rail_post_{three_x}_{three_z}",
            (three_x, -three_z, 8.32 + 0.62),
            (0.12, 0.12, 1.2),
            hazard,
            "upper-handrail",
        ))

    # Walkable ship-ladder presentation on the +X rim. Blender exports Y-up as
    # Three.js Y-up with Three Z = -Blender Y, so every authored access position
    # mirrors the TypeScript authority explicitly rather than relying on a visual
    # approximation.
    landing_overlap = 0.06
    deck_thickness = 0.34
    lower_top = 3.35 + deck_thickness / 2
    upper_top = 8.15 + deck_thickness / 2
    lower_half = 8.4 / 2
    upper_half = 6.8 / 2

    ship_angle = math.radians(48.0)
    ship_rise = upper_top - lower_top
    ship_run = ship_rise / math.tan(ship_angle)
    ship_len = ship_rise / math.sin(ship_angle)
    ship_width = 1.5
    ship_thick = 0.22
    ship_x = lower_half - 0.3
    ship_lower_landing_depth = 1.15
    ship_upper_landing_depth = 1.2
    ship_low_z = lower_half - 0.15
    ship_lower_landing_center_z = ship_low_z + ship_lower_landing_depth / 2 - landing_overlap
    ship_low_surface_z = ship_lower_landing_center_z - ship_lower_landing_depth / 2 + landing_overlap
    ship_high_surface_z = ship_low_surface_z - ship_run
    ship_center_z = (ship_low_surface_z + ship_high_surface_z) / 2
    ship_center_y = (lower_top + upper_top) / 2 - math.cos(ship_angle) * (ship_thick / 2)
    ship_upper_landing_center_z = ship_high_surface_z - ship_upper_landing_depth / 2 + landing_overlap
    ship_bridge_center_x = (ship_x + upper_half - 0.15) / 2

    created.append(cube(
        "RW_ship_ladder_lower_landing",
        (ship_x, -ship_lower_landing_center_z, lower_top),
        (ship_width + 0.4, ship_lower_landing_depth, 0.12),
        steel,
        "ship-ladder-landing",
    ))
    created.append(cube(
        "RW_ship_ladder_upper_landing",
        (ship_x, -ship_upper_landing_center_z, upper_top),
        (ship_width + 0.35, ship_upper_landing_depth, 0.12),
        rust,
        "ship-ladder-landing",
    ))
    created.append(cube(
        "RW_upper_access_bridge",
        (ship_bridge_center_x, -ship_upper_landing_center_z, upper_top),
        (abs(ship_x - (upper_half - 0.15)) + 0.35, ship_upper_landing_depth, 0.12),
        steel,
        "upper-access",
    ))

    slab = cube(
        "RW_ship_ladder_slab",
        (ship_x, -ship_center_z, ship_center_y + 0.018),
        (ship_width, ship_len, ship_thick),
        steel,
        "ship-ladder",
    )
    slab.rotation_euler = (ship_angle, 0.0, 0.0)
    created.append(slab)

    for side, label in ((-1, "west"), (1, "east")):
        rail = cube(
            f"RW_ship_ladder_rail_{label}",
            (ship_x + side * (ship_width / 2 + 0.08), -ship_center_z, ship_center_y + 0.62),
            (0.09, ship_len, 0.09),
            hazard,
            "ship-ladder-rail",
        )
        rail.rotation_euler = (ship_angle, 0.0, 0.0)
        created.append(rail)
        stringer = cube(
            f"RW_ship_ladder_stringer_{label}",
            (ship_x + side * (ship_width / 2 + 0.02), -ship_center_z, ship_center_y - 0.08),
            (0.08, ship_len + 0.08, 0.18),
            dark,
            "ship-ladder-stringer",
        )
        stringer.rotation_euler = (ship_angle, 0.0, 0.0)
        created.append(stringer)

    for index in range(9):
        t = (index + 0.5) / 9.0
        three_z = ship_low_surface_z - ship_run * t
        three_y = lower_top + ship_rise * t + 0.04
        created.append(
            cube(
                f"RW_ship_ladder_rung_{index}",
                (ship_x, -three_z, three_y),
                (ship_width - 0.12, 0.1, 0.08),
                hazard,
                "ship-ladder-rung",
            )
        )

    # Ground-to-lower ramp presentation, derived from the same deck edges,
    # landing overlap and 22° slope as TypeScript/Rapier authority.
    lower_angle = math.radians(22.0)
    lower_width = 3.2
    lower_thick = 0.28
    lower_landing_depth = 1.35
    lower_ramp_len = (lower_top - 0.12) / math.sin(lower_angle)
    lower_landing_center_z = -lower_half - lower_landing_depth / 2 + landing_overlap
    lower_ramp_top_z = lower_landing_center_z - lower_landing_depth / 2 + landing_overlap
    lower_ramp_center_z = lower_ramp_top_z - math.cos(lower_angle) * (lower_ramp_len / 2)
    lower_ramp_center_y = (
        lower_top
        - math.sin(lower_angle) * (lower_ramp_len / 2)
        - math.cos(lower_angle) * (lower_thick / 2)
    )
    lower_ramp = cube(
        "RW_lower_ramp_shell",
        (0.0, -lower_ramp_center_z, lower_ramp_center_y + 0.018),
        (lower_width, lower_ramp_len, lower_thick),
        steel,
        "lower-ramp",
    )
    lower_ramp.rotation_euler = (-lower_angle, 0.0, 0.0)
    created.append(lower_ramp)
    created.append(cube(
        "RW_lower_ramp_landing_shell",
        (0.0, -lower_landing_center_z, lower_top),
        (lower_width + 0.3, lower_landing_depth, 0.1),
        steel,
        "lower-ramp-landing",
    ))

    # Process risers and pipe detail readable from ground level. Coordinates match the
    # procedural authority via Blender (x, -threeZ, threeY).
    for x in (-1.35, 1.35):
        created.append(cylinder(f"RW_process_riser_{x}", (x, 3.05, 6.1), 0.19, 10.2, dark, rotation=(0, 0, 0), kind="process-pipe"))
        created.append(cylinder(f"RW_process_cap_{x}", (x, 3.05, 11.35), 0.28, 0.24, rust, rotation=(0, 0, 0), kind="process-pipe"))
    created.append(cube("RW_process_pipe_a", (-2.4, -2.6, 4.6), (1.8, 0.32, 0.32), steel, "process-pipe"))
    created.append(cube("RW_process_pipe_b", (2.1, 2.4, 6.8), (0.32, 2.2, 0.32), steel, "process-pipe"))
    created.append(cube("RW_process_pipe_c", (0.2, -2.4, 10.2), (2.6, 0.28, 0.28), steel, "process-pipe"))

    # Crane pulley and hook lift the authored silhouette above the canopy.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.42,
        minor_radius=0.09,
        major_segments=16,
        minor_segments=6,
        location=(-10.8, 0, 13.4),
        rotation=(math.pi / 2, 0, 0),
    )
    pulley = bpy.context.object
    pulley.name = "RW_crane_pulley"
    pulley.data.materials.append(hazard)
    tag(pulley, "crane-detail")
    created.append(pulley)
    created.append(cylinder("RW_crane_drop", (-10.8, 0, 10.2), 0.045, 6.3, dark, kind="crane-cable"))
    created.append(cube("RW_crane_hook", (-10.8, 0, 7.0), (0.26, 0.32, 0.5), rust, "crane-hook"))

    for obj in created:
        obj.parent = root

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"WROTE {BLEND_PATH}")
    print(f"WROTE {GLB_PATH}")
    print(f"ASSET_VERSION {ASSET_VERSION}")
    print(f"CREATED {len(created)}")


if __name__ == "__main__":
    main()
