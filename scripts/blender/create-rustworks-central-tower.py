"""Create the original Rustworks central-tower Blender detail kit.

The TypeScript arena remains collision and shot authority. This asset is a
non-authoritative Blender Render presentation layer aligned to that tower.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "source-assets" / "blender" / "rustworks-central-tower.blend"
GLB_PATH = ROOT / "public" / "assets" / "original" / "models" / "rustworks-central-tower.glb"


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
    root["asset_version"] = "pass34-v1"
    root["authored_height_metres"] = 14.6

    created = []
    # Structural sleeves and X-braces around the taller procedural authority.
    for x in (-3.35, 3.35):
        for z in (-3.35, 3.35):
            created.append(cylinder(f"RW_leg_sleeve_{x}_{z}", (x, z, 5.5), 0.11, 10.7, steel, kind="leg-sleeve"))
    for z in (-3.42, 3.42):
        for y0, y1 in ((0.35, 3.25), (3.55, 8.05), (8.35, 11.0)):
            created.append(beam(f"RW_brace_xa_{z}_{y0}", (-3.25, z, y0), (3.25, z, y1), 0.12, rust))
            created.append(beam(f"RW_brace_xb_{z}_{y0}", (3.25, z, y0), (-3.25, z, y1), 0.12, rust))
    for x in (-3.42, 3.42):
        for y0, y1 in ((0.35, 3.25), (3.55, 8.05), (8.35, 11.0)):
            created.append(beam(f"RW_brace_za_{x}_{y0}", (x, -3.25, y0), (x, 3.25, y1), 0.12, steel))
            created.append(beam(f"RW_brace_zb_{x}_{y0}", (x, 3.25, y0), (x, -3.25, y1), 0.12, steel))

    # Upper canopy, guard details and a visibly higher crown.
    for x in (-2.8, 2.8):
        for z in (-2.8, 2.8):
            created.append(cube(f"RW_canopy_post_{x}_{z}", (x, z, 11.55), (0.16, 0.16, 3.0), steel, "canopy-post"))
    created.append(cube("RW_canopy_roof", (0, 0, 13.12), (6.4, 6.4, 0.22), rust, "tower-crown"))
    created.append(cube("RW_canopy_ridge", (0, 0, 13.55), (0.26, 6.7, 0.58), hazard, "tower-crown"))
    for z in (-3.15, 3.15):
        created.append(cube(f"RW_upper_handrail_{z}", (0, z, 8.92), (6.1, 0.08, 1.35), hazard, "upper-handrail"))
    for x in (-3.15, 3.15):
        created.append(cube(f"RW_upper_handrail_{x}", (x, 0, 8.92), (0.08, 6.1, 1.35), hazard, "upper-handrail"))

    # Ladder and process-pipe detail read clearly from ground level.
    for x in (-0.38, 0.38):
        created.append(cube(f"RW_ladder_rail_{x}", (x, 3.53, 6.15), (0.08, 0.08, 4.7), steel, "ladder"))
    for index, y in enumerate([4.0, 4.55, 5.1, 5.65, 6.2, 6.75, 7.3, 7.85]):
        created.append(cube(f"RW_ladder_rung_{index}", (0, 3.53, y), (0.86, 0.08, 0.08), hazard, "ladder"))
    for x in (-1.15, 1.15):
        created.append(cylinder(f"RW_process_riser_{x}", (x, -2.95, 6.2), 0.17, 10.5, dark, rotation=(0, 0, 0), kind="process-pipe"))
        created.append(cylinder(f"RW_process_cap_{x}", (x, -2.95, 11.48), 0.26, 0.24, rust, rotation=(0, 0, 0), kind="process-pipe"))

    # Crane pulley and hook lift the authored silhouette above the 13 m canopy.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.09, major_segments=16, minor_segments=6, location=(-10.8, 0, 13.4), rotation=(math.pi / 2, 0, 0))
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


if __name__ == "__main__":
    main()
