"""Generate the four original Pass 65 menu preview master clips in Blender.

The shipped web videos are transcoded from the generated PNG master sequences
by ffmpeg. Everything in the frame is built from Blender primitives; the
script does not import any external image, model, map, or franchise asset.

Run from the repository root with Blender 5.1 or newer:

  blender.exe --background --python scripts/assets/generate_pass65_menu_previews.py
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MASTER_DIR = ROOT / "source-assets" / "menu" / "pass65-preview-masters"
MASTER_DIR.mkdir(parents=True, exist_ok=True)
FRAME_ROOT = ROOT / "artifacts" / "pass65" / "menu-preview-master-frames"
FRAME_ROOT.mkdir(parents=True, exist_ok=True)

FPS = 24
SECONDS = 8
FINAL_FRAME = FPS * SECONDS
RESOLUTION_X = int(os.environ.get("AA_PREVIEW_WIDTH", "960"))
RESOLUTION_Y = int(os.environ.get("AA_PREVIEW_HEIGHT", "540"))
STILL_FRAME = int(os.environ.get("AA_PREVIEW_STILL_FRAME", "0"))


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.52,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    metallic_input = bsdf.inputs.get("Metallic IOR Level") or bsdf.inputs.get("Metallic")
    if metallic_input is not None:
        metallic_input.default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_input = bsdf.inputs.get("Emission Strength")
        if emission_input is not None:
            emission_input.default_value = emission
        if strength_input is not None:
            strength_input.default_value = emission_strength
    return value


def assign(obj, mat) -> None:
    obj.data.materials.append(mat)


def cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat,
    *,
    bevel: float = 0.0,
):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("soft-machined-edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    assign(obj, mat)
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    mat,
    *,
    vertices: int = 24,
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    return obj


def uv_sphere(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    return obj


def cone(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    mat,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=0.02, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    return obj


def polygon_plate(
    name: str,
    points: Iterable[tuple[float, float]],
    z: float,
    mat,
    *,
    thickness: float = 0.04,
    bevel: float = 0.018,
):
    """Create a softly edged authored silhouette facing the preview camera."""
    vertices = [(x, y, z) for x, y in points]
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    solidify = obj.modifiers.new("soft-silhouette-thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0
    edge = obj.modifiers.new("soft-silhouette-edge", "BEVEL")
    edge.width = bevel
    edge.segments = 3
    return obj


def parent(child, owner) -> None:
    child.parent = owner


def reset_scene() -> dict[str, object]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.curves, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FINAL_FRAME
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 42
    scene.render.film_transparent = False
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("pass65-preview-world") if bpy.data.worlds.get("pass65-preview-world") is None else bpy.data.worlds["pass65-preview-world"]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.085, 0.16, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.52

    key_data = bpy.data.lights.new("sun-key", "SUN")
    key_data.energy = 3.2
    key_data.color = (1.0, 0.69, 0.44)
    key = bpy.data.objects.new("sun-key", key_data)
    bpy.context.collection.objects.link(key)
    key.rotation_euler = (math.radians(38), math.radians(-24), math.radians(-34))

    fill_data = bpy.data.lights.new("sky-fill", "AREA")
    fill_data.energy = 1050
    fill_data.shape = "DISK"
    fill_data.size = 18
    fill_data.color = (0.19, 0.65, 1.0)
    fill = bpy.data.objects.new("sky-fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (0, -8, 26)
    fill.rotation_euler = (0, 0, 0)

    return {
        "asphalt": material("asphalt", (0.035, 0.055, 0.07, 1), roughness=0.86),
        "concrete": material("concrete", (0.22, 0.25, 0.27, 1), roughness=0.78),
        "steel": material("gunmetal", (0.035, 0.08, 0.12, 1), metallic=0.82, roughness=0.24),
        "black": material("black-rubber", (0.008, 0.012, 0.017, 1), roughness=0.34),
        "white": material("chalk-white", (0.66, 0.73, 0.72, 1), roughness=0.65),
        "teal": material("aqua", (0.015, 0.38, 0.40, 1), metallic=0.12, roughness=0.4),
        "coral": material("coral", (0.54, 0.09, 0.075, 1), metallic=0.08, roughness=0.46),
        "amber": material("amber", (0.55, 0.17, 0.012, 1), emission=(1.0, 0.23, 0.018, 1), emission_strength=4.5, roughness=0.28),
        "cyan": material("cyan", (0.02, 0.25, 0.36, 1), emission=(0.01, 0.68, 1.0, 1), emission_strength=5.5, roughness=0.2),
        "green": material("hud-green", (0.01, 0.28, 0.13, 1), emission=(0.03, 1.0, 0.31, 1), emission_strength=5.0, roughness=0.18),
        "yellow": material("warning-yellow", (0.76, 0.45, 0.025, 1), emission=(1.0, 0.46, 0.02, 1), emission_strength=2.1, roughness=0.42),
        "grass": material("grass", (0.035, 0.16, 0.075, 1), roughness=0.9),
        "ocean": material("ocean", (0.006, 0.09, 0.14, 1), metallic=0.18, roughness=0.19),
        "fur": material("cat-fur-charcoal", (0.035, 0.032, 0.038, 1), emission=(0.012, 0.01, 0.016, 1), emission_strength=0.2, roughness=0.92),
        "fur_highlight": material("cat-fur-silver", (0.32, 0.30, 0.29, 1), emission=(0.055, 0.045, 0.05, 1), emission_strength=0.2, roughness=0.86),
        "pink": material("cat-pads-soft-coral", (0.58, 0.16, 0.23, 1), emission=(0.22, 0.025, 0.045, 1), emission_strength=0.32, roughness=0.68),
        "pink_inner": material("cat-inner-ear", (0.48, 0.12, 0.18, 1), emission=(0.16, 0.018, 0.03, 1), emission_strength=0.24, roughness=0.76),
    }


def add_point_light(name: str, location: tuple[float, float, float], color: tuple[float, float, float], energy: float, radius: float):
    data = bpy.data.lights.new(name, "POINT")
    data.color = color
    data.energy = energy
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def add_house(x: float, y: float, hue_mat, mats, yaw: float = 0.0) -> None:
    body = cube("authored-neighbourhood-house", (x, y, 2.0), (4.2, 3.2, 2.0), hue_mat, bevel=0.15)
    body.rotation_euler[2] = yaw
    roof = cube("pitched-roof-silhouette", (x, y, 4.3), (4.65, 3.6, 0.28), mats["black"], bevel=0.12)
    roof.rotation_euler[2] = yaw
    for offset in (-1.7, 1.7):
        window = cube("window-emissive", (x + offset * math.cos(yaw), y + offset * math.sin(yaw), 2.2), (0.7, 0.07, 0.8), mats["cyan"], bevel=0.05)
        window.rotation_euler[2] = yaw


def build_nuke_town(mats) -> None:
    cube("grass-block", (0, 0, -0.65), (28, 28, 0.65), mats["grass"])
    cube("main-road", (0, 0, 0.015), (5.0, 28, 0.02), mats["asphalt"])
    cube("cross-road", (0, 0, 0.018), (28, 4.5, 0.02), mats["asphalt"])
    for x, y, hue, yaw in [(-14, -14, mats["teal"], 0.2), (14, -12, mats["coral"], -0.16), (-15, 14, mats["coral"], math.pi), (15, 14, mats["teal"], math.pi)]:
        add_house(x, y, hue, mats, yaw)
    bus = cube("physical-transit-bus", (0, -9, 1.35), (1.7, 5.6, 1.35), mats["yellow"], bevel=0.3)
    cube("bus-window-band", (0, -9, 1.85), (1.73, 3.7, 0.42), mats["black"], bevel=0.08)
    for x in (-7.5, 7.5):
        for y in (-20, -7, 7, 20):
            cylinder("tree-trunk", (x, y, 1.5), 0.32, 3, mats["black"], vertices=12)
            uv_sphere("tree-canopy", (x, y, 4.3), (1.8, 1.8, 2.0), mats["grass"])
    add_point_light("aqua-cross-street", (-4, 0, 2.4), (0.05, 0.8, 1.0), 520, 1.3)
    add_point_light("coral-cross-street", (4, 0, 2.4), (1.0, 0.12, 0.055), 480, 1.2)


def build_terminal(mats) -> None:
    cube("terminal-apron", (0, 0, -0.5), (34, 30, 0.5), mats["concrete"])
    terminal = cube("terminal-concourse", (0, 12, 4.0), (25, 6.5, 4.0), mats["steel"], bevel=0.24)
    for x in range(-21, 22, 6):
        cube("terminal-window", (x, 5.43, 4.6), (2.25, 0.06, 2.25), mats["cyan"], bevel=0.06)
    cube("runway", (0, -14, 0.02), (30, 4.6, 0.025), mats["asphalt"])
    for x in range(-26, 27, 5):
        cube("runway-light", (x, -14, 0.12), (0.16, 0.16, 0.08), mats["yellow"], bevel=0.03)
    # Original low-poly jetliner silhouette.
    fuselage = cylinder("jetliner-fuselage", (5, -4, 2.4), 1.35, 14, mats["white"], vertices=32)
    fuselage.rotation_euler[1] = math.pi / 2
    cube("jetliner-wing", (5, -4, 2.35), (4.0, 7.2, 0.14), mats["white"], bevel=0.18)
    cone("jetliner-nose", (-2.15, -4, 2.4), 1.35, 2.6, mats["white"], rotation=(0, math.pi / 2, 0))
    cube("jetbridge", (-7, 3, 3.25), (1.4, 5.4, 1.05), mats["teal"], bevel=0.15)
    add_point_light("terminal-cyan-pool", (-7, 1, 4.0), (0.05, 0.72, 1.0), 900, 1.8)
    add_point_light("terminal-amber-pool", (12, -6, 2.0), (1.0, 0.28, 0.03), 700, 1.6)


def build_rustrig(mats) -> None:
    cube("north-sea", (0, 0, -2.2), (45, 45, 2.0), mats["ocean"])
    cube("rig-deck", (0, 0, 0.15), (25, 25, 0.35), mats["steel"], bevel=0.1)
    for x, y in [(-20, -20), (20, -20), (-20, 20), (20, 20)]:
        cylinder("rig-leg", (x, y, -5.0), 1.2, 12, mats["steel"], vertices=16)
    for level in range(5):
        z = 2 + level * 4.0
        cube("central-plant-platform", (0, 0, z), (6.5 - level * 0.35, 6.5 - level * 0.35, 0.28), mats["steel"], bevel=0.08)
        for x, y in [(-5, -5), (5, -5), (-5, 5), (5, 5)]:
            cube("tower-column", (x, y, z + 2.0), (0.22, 0.22, 2.0), mats["yellow"], bevel=0.03)
    cylinder("flare-stack", (8, 5, 10), 0.55, 20, mats["steel"], vertices=16)
    uv_sphere("flare-fire", (8, 5, 20.5), (0.8, 0.8, 1.5), mats["amber"])
    container_colors = [mats["coral"], mats["teal"], mats["yellow"]]
    for index, (x, y) in enumerate([(-15, -15), (-8, -15), (8, -15), (15, -15), (-15, 14), (0, 15), (15, 14)]):
        box = cube("physical-shipping-container", (x, y, 1.45), (3.0, 1.35, 1.45), container_colors[index % 3], bevel=0.08)
        box.rotation_euler[2] = (index % 3 - 1) * 0.12
        for ridge in range(-2, 3):
            cube("container-ridge", (x + ridge * 1.0, y - 1.38, 1.45), (0.04, 0.03, 1.25), mats["steel"])
        light_color = [(1.0, 0.1, 0.025), (1.0, 0.38, 0.025), (1.0, 0.75, 0.06)][index % 3]
        add_point_light(f"container-atmosphere-{index}", (x, y, 3.1), light_color, 560, 1.4)


def build_gun_range(mats) -> None:
    cube("range-floor", (0, -8, -0.45), (12, 30, 0.45), mats["asphalt"])
    cube("range-ceiling", (0, -8, 7.5), (12, 30, 0.35), mats["steel"])
    cube("range-left-wall", (-12, -8, 3.5), (0.35, 30, 4.0), mats["concrete"])
    cube("range-right-wall", (12, -8, 3.5), (0.35, 30, 4.0), mats["concrete"])
    cube("range-back-wall", (0, -38, 3.5), (12, 0.35, 4.0), mats["black"])
    for lane in (-7.5, -2.5, 2.5, 7.5):
        cube("lane-divider", (lane, 11, 1.1), (0.05, 3.6, 1.1), mats["steel"])
        for y, color in [(-10, mats["cyan"]), (-21, mats["yellow"]), (-33, mats["coral"])]:
            target = cube("new-illuminated-moving-target", (lane, y, 2.1), (0.72, 0.12, 1.25), mats["white"], bevel=0.1)
            target_light = cube("moving-target-light", (lane, y + 0.08, 3.25), (0.34, 0.08, 0.16), color, bevel=0.05)
            travel = 1.35 if (lane + round(abs(y))) % 2 else -1.35
            for item in (target, target_light):
                origin_x = item.location.x
                item.location.x = origin_x - travel
                item.keyframe_insert(data_path="location", frame=1)
                item.location.x = origin_x + travel
                item.keyframe_insert(data_path="location", frame=FINAL_FRAME // 2 + 1)
                item.location.x = origin_x - travel
                item.keyframe_insert(data_path="location", frame=FINAL_FRAME + 1)
    for y in range(-33, 17, 7):
        cube("neon-ceiling-strip", (0, y, 7.08), (9.4, 0.11, 0.12), mats["cyan"] if y % 2 else mats["amber"], bevel=0.03)
    for x in (-11.4, 11.4):
        for y in (-28, -14, 0, 14):
            cube("neon-wall-marker", (x, y, 3.4), (0.08, 1.5, 0.1), mats["amber"] if y < 0 else mats["cyan"])
    add_point_light("range-key-cyan", (0, -9, 6.7), (0.05, 0.65, 1.0), 1250, 2.5)
    add_point_light("range-key-amber", (0, -29, 6.4), (1.0, 0.24, 0.02), 1000, 2.2)


def animate_rotor(rotor, final_frame: int) -> None:
    rotor.rotation_mode = "XYZ"
    rotor.rotation_euler[1] = 0
    driver = rotor.driver_add("rotation_euler", 1).driver
    driver.expression = f"frame * {math.tau * 38 / max(1, final_frame):.12f}"


def add_helicopter_cockpit(rig, mats) -> None:
    dash = cube("sleek-cockpit-glareshield", (0, -0.27, -1.20), (0.56, 0.06, 0.08), mats["steel"], bevel=0.045)
    dash.rotation_euler[0] = math.radians(-7)
    parent(dash, rig)
    for x, panel_mat in [(-0.33, mats["green"]), (0.0, mats["cyan"]), (0.33, mats["green"])]:
        panel = cube("three-dimensional-cockpit-hud", (x, -0.22, -1.08), (0.105, 0.02, 0.05), panel_mat, bevel=0.018)
        panel.rotation_euler[0] = math.radians(-7)
        parent(panel, rig)
    for x in (-0.45, 0.45):
        strut = cube("canopy-frame", (x, 0.08, -1.20), (0.022, 0.42, 0.022), mats["steel"], bevel=0.012)
        strut.rotation_euler[0] = math.radians(-18)
        strut.rotation_euler[2] = math.radians(-13 * math.copysign(1, x))
        parent(strut, rig)
    centre = cube("canopy-centre-spine", (0, 0.43, -1.28), (0.014, 0.16, 0.018), mats["steel"], bevel=0.01)
    centre.rotation_euler[0] = math.radians(-6)
    parent(centre, rig)
    mast = cylinder("visible-main-rotor-mast", (0, 0.55, -1.12), 0.045, 0.28, mats["steel"], vertices=16)
    mast.rotation_euler[0] = math.pi / 2
    parent(mast, rig)
    rotor = bpy.data.objects.new("visible-spinning-main-rotor", None)
    bpy.context.collection.objects.link(rotor)
    rotor.location = (0, 0.69, -1.12)
    parent(rotor, rig)
    blade_a = cube("rotor-blade-a", (0, 0, 0), (2.3, 0.025, 0.035), mats["black"], bevel=0.018)
    blade_b = cube("rotor-blade-b", (0, 0, 0), (0.035, 0.025, 2.3), mats["black"], bevel=0.018)
    parent(blade_a, rotor)
    parent(blade_b, rotor)
    animate_rotor(rotor, FINAL_FRAME)
    add_point_light("cockpit-green-fill", (-0.58, -0.10, -0.74), (0.03, 1.0, 0.28), 12, 0.35).parent = rig
    add_point_light("cockpit-blue-fill", (0.62, -0.09, -0.72), (0.03, 0.58, 1.0), 11, 0.35).parent = rig


def camera_keyframe(rig, frame: int, position: Vector, look_at: Vector, bank: float) -> None:
    rig.location = position
    direction = look_at - position
    rig.rotation_mode = "QUATERNION"
    rig.rotation_quaternion = direction.to_track_quat("-Z", "Y")
    rig.rotation_mode = "XYZ"
    rig.rotation_euler.rotate_axis("Z", bank)
    rig.keyframe_insert(data_path="location", frame=frame)
    rig.keyframe_insert(data_path="rotation_euler", frame=frame)


def animate_helicopter_camera(rig, map_name: str) -> None:
    parameters = {
        "atomic-acres": (34.0, 25.0, 15.2, Vector((0, 0, 2.0)), 0.17),
        "skyline-terminal": (39.0, 28.0, 16.8, Vector((0, 1, 2.9)), -0.34),
        "rustworks-1v1": (36.0, 30.0, 22.0, Vector((0, 0, 7.0)), 0.48),
    }
    radius_x, radius_y, altitude, look_at, phase = parameters[map_name]
    keys = 16
    for key in range(keys + 1):
        progress = key / keys
        theta = phase + progress * math.tau
        # Smooth, coupled, deterministic corrections: no per-frame noise.
        correction = math.sin(theta * 3.0 + 0.4) * 0.65 + math.sin(theta * 5.0 - 0.2) * 0.22
        radius_scale = 1.0 + math.sin(theta * 2.0 + 0.7) * 0.018
        position = Vector((
            math.cos(theta) * radius_x * radius_scale,
            math.sin(theta) * radius_y * radius_scale,
            altitude + correction,
        ))
        gaze = look_at + Vector((
            math.sin(theta * 2.0) * 0.65,
            math.cos(theta * 3.0) * 0.45,
            math.sin(theta * 4.0) * 0.22,
        ))
        bank = math.radians(-math.sin(theta + 0.2) * 2.2 - math.sin(theta * 3.0) * 0.45)
        frame = 1 + round(progress * FINAL_FRAME)
        camera_keyframe(rig, frame, position, gaze, bank)


def add_cat_pov(rig, mats) -> None:
    for side in (-1, 1):
        ear_root = bpy.data.objects.new(f"authored-cat-ear-root-{'left' if side < 0 else 'right'}", None)
        bpy.context.collection.objects.link(ear_root)
        ear_root.location = (side * 0.50, 0.06, -1.18)
        ear_root.scale = (0.65, 0.65, 0.65)
        parent(ear_root, rig)
        outer = polygon_plate(
            "authored-feline-ear-silhouette",
            [(-0.23, 0.0), (-0.21, 0.12), (-0.11, 0.29), (side * 0.08, 0.43), (0.13, 0.28), (0.22, 0.11), (0.23, 0.0)],
            0,
            mats["fur_highlight"],
            thickness=0.065,
            bevel=0.028,
        )
        parent(outer, ear_root)
        inner = polygon_plate(
            "authored-feline-ear-inner",
            [(-0.13, 0.05), (-0.10, 0.15), (side * 0.055, 0.33), (0.08, 0.17), (0.13, 0.05)],
            0.043,
            mats["pink_inner"],
            thickness=0.018,
            bevel=0.016,
        )
        parent(inner, ear_root)
        ear_root.rotation_mode = "XYZ"
        for frame, twitch in [(1, 0), (61, 0), (70, side * 4.5), (79, -side * 1.5), (88, 0), (FINAL_FRAME + 1, 0)]:
            ear_root.rotation_euler[2] = math.radians(twitch)
            ear_root.keyframe_insert(data_path="rotation_euler", frame=frame)

    for side in (-1, 1):
        paw_root = bpy.data.objects.new(f"authored-cat-forepaw-root-{'left' if side < 0 else 'right'}", None)
        bpy.context.collection.objects.link(paw_root)
        paw_root.location = (side * 0.35, -0.26, -1.04)
        paw_root.scale = (0.72, 0.72, 0.72)
        parent(paw_root, rig)
        foreleg = uv_sphere("authored-cat-foreleg", (0, -0.13, -0.25), (0.19, 0.13, 0.31), mats["fur"])
        palm = uv_sphere("authored-cat-paw-palm", (0, 0, 0), (0.25, 0.12, 0.23), mats["fur"])
        parent(foreleg, paw_root)
        parent(palm, paw_root)
        for toe_x in (-0.15, -0.05, 0.05, 0.15):
            toe = uv_sphere("authored-cat-paw-toe", (toe_x, 0.045, 0.19), (0.082, 0.065, 0.105), mats["fur_highlight"])
            pad = uv_sphere("authored-cat-digital-pad", (toe_x, 0.052, 0.295), (0.032, 0.018, 0.037), mats["pink"])
            parent(toe, paw_root)
            parent(pad, paw_root)
        central_pad = uv_sphere("authored-cat-central-pad", (0, -0.015, 0.285), (0.08, 0.022, 0.055), mats["pink"])
        parent(central_pad, paw_root)
        paw_root.rotation_mode = "XYZ"
        for frame, lift, splay in [
            (1, 0, 0),
            (FINAL_FRAME // 4 + 1, side * 3.5, -side * 2.0),
            (FINAL_FRAME // 2 + 1, 0, 0),
            (FINAL_FRAME * 3 // 4 + 1, -side * 2.5, side * 1.5),
            (FINAL_FRAME + 1, 0, 0),
        ]:
            paw_root.rotation_euler = (math.radians(lift), math.radians(splay), math.radians(side * lift * 0.35))
            paw_root.keyframe_insert(data_path="rotation_euler", frame=frame)
    add_point_light("cat-pov-cyan-rim", (0, -0.08, -0.68), (0.08, 0.55, 1.0), 9, 0.28).parent = rig


def animate_cat_camera(rig) -> None:
    positions = [
        Vector((0.0, 15.0, 1.05)), Vector((4.8, 10.0, 1.10)), Vector((7.0, 1.0, 1.00)),
        Vector((4.2, -8.0, 1.12)), Vector((0.0, -18.0, 1.02)), Vector((-4.8, -8.0, 1.08)),
        Vector((-7.0, 2.0, 1.00)), Vector((-4.0, 11.0, 1.13)), Vector((0.0, 15.0, 1.05)),
    ]
    looks = [
        Vector((0, -8, 2.3)), Vector((7.5, -10, 2.2)), Vector((2.5, -21, 2.8)),
        Vector((0, -31, 2.4)), Vector((0, -36, 2.0)), Vector((-4.0, -22, 3.1)),
        Vector((-7.5, -7, 2.0)), Vector((0, -5, 3.2)), Vector((0, -8, 2.3)),
    ]
    for index, (position, look) in enumerate(zip(positions, looks)):
        frame = 1 + round(index / (len(positions) - 1) * FINAL_FRAME)
        bob = math.sin(index * math.pi * 0.75) * 0.03
        camera_keyframe(rig, frame, position + Vector((0, 0, bob)), look, math.radians(math.sin(index * 1.7) * 1.0))


def add_camera_rig(kind: str, mats):
    rig = bpy.data.objects.new(f"{kind}-preview-camera-rig", None)
    bpy.context.collection.objects.link(rig)
    camera_data = bpy.data.cameras.new(f"{kind}-preview-camera")
    camera_data.lens = 28 if kind == "cat" else 32
    camera_data.sensor_width = 36
    camera = bpy.data.objects.new(f"{kind}-preview-camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.parent = rig
    camera.location = (0, 0, 0)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = camera
    if kind == "cat":
        add_cat_pov(rig, mats)
    else:
        add_helicopter_cockpit(rig, mats)
    return rig


def render(map_name: str) -> None:
    mats = reset_scene()
    if map_name == "atomic-acres":
        build_nuke_town(mats)
    elif map_name == "skyline-terminal":
        build_terminal(mats)
    elif map_name == "rustworks-1v1":
        build_rustrig(mats)
    elif map_name == "gun-range":
        build_gun_range(mats)
    else:
        raise ValueError(map_name)

    is_cat = map_name == "gun-range"
    rig = add_camera_rig("cat" if is_cat else "helicopter", mats)
    if is_cat:
        animate_cat_camera(rig)
    else:
        animate_helicopter_camera(rig, map_name)

    scene = bpy.context.scene
    frame_directory = FRAME_ROOT / map_name
    frame_directory.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(frame_directory / "frame-")
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER_DIR / f"{map_name}.blend"))
    if STILL_FRAME > 0:
        scene.frame_set(min(FINAL_FRAME, STILL_FRAME))
        scene.render.filepath = str(frame_directory / f"frame-{scene.frame_current:04d}.png")
        bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)


requested_arenas = tuple(filter(None, os.environ.get(
    "AA_PREVIEW_ARENAS",
    "atomic-acres,skyline-terminal,rustworks-1v1,gun-range",
).split(",")))
for arena in requested_arenas:
    render(arena)
