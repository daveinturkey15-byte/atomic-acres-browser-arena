"""Generate the four original Pass 65 menu preview master clips in Blender.

The shipped web videos are transcoded from the generated PNG master sequences
by ffmpeg. Arena geometry is built from project primitives and the three
helicopter clips append the approved project-original Pass 65 cockpit source.
The script does not import any external image, model, map, or franchise asset.

Run from the repository root with Blender 5.1 or newer:

  blender.exe --background --python scripts/assets/generate_pass65_menu_previews.py
"""

from __future__ import annotations

import math
import json
import os
from pathlib import Path
from typing import Iterable

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[2]
MASTER_DIR = ROOT / "source-assets" / "menu" / "pass65-preview-masters"
MASTER_DIR.mkdir(parents=True, exist_ok=True)
CHOPPER_SOURCE = ROOT / "source-assets" / "blender" / "pass65-chopper-gunner.blend"
CHOREOGRAPHY_PATH = MASTER_DIR / "choreography.json"
FRAME_ROOT = ROOT / "artifacts" / "pass65" / "menu-preview-master-frames"
FRAME_ROOT.mkdir(parents=True, exist_ok=True)


def load_choreography() -> dict[str, object]:
    if not CHOREOGRAPHY_PATH.is_file():
        raise RuntimeError(f"canonical preview choreography missing: {CHOREOGRAPHY_PATH}")
    recipe = json.loads(CHOREOGRAPHY_PATH.read_text(encoding="utf-8"))
    if recipe.get("schemaVersion") != 2:
        raise RuntimeError("preview choreography must use schemaVersion 2")
    if set(recipe.get("arenas", {})) != {"atomic-acres", "skyline-terminal", "rustworks-1v1", "gun-range"}:
        raise RuntimeError("preview choreography arena set is incomplete")
    return recipe


CHOREOGRAPHY = load_choreography()
FPS = int(CHOREOGRAPHY["fps"])
SECONDS = int(CHOREOGRAPHY["durationSeconds"])
FINAL_FRAME = int(CHOREOGRAPHY["frameCount"])
if FINAL_FRAME != FPS * SECONDS:
    raise RuntimeError("preview choreography frameCount must equal fps * durationSeconds")
RESOLUTION_X = int(os.environ.get("AA_PREVIEW_WIDTH", "960"))
RESOLUTION_Y = int(os.environ.get("AA_PREVIEW_HEIGHT", "540"))
STILL_FRAME = int(os.environ.get("AA_PREVIEW_STILL_FRAME", "0"))
STILL_FRAMES = tuple(
    int(value)
    for value in os.environ.get("AA_PREVIEW_STILL_FRAMES", "").split(",")
    if value.strip()
)
SAVE_ONLY = os.environ.get("AA_PREVIEW_SAVE_ONLY", "0") == "1"


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


def add_fur_microtexture(value, dark: tuple[float, float, float, float], light: tuple[float, float, float, float]) -> None:
    """Give authored cat silhouettes a subtle spatial fur grain instead of flat plastic color."""
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError(f"fur material {value.name} has no Principled BSDF")
    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = f"{value.name}-generated-coordinates"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = f"{value.name}-micro-fur-noise"
    noise.inputs["Scale"].default_value = 54.0
    noise.inputs["Detail"].default_value = 4.2
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = f"{value.name}-fur-colour-ramp"
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = light
    bump = nodes.new("ShaderNodeBump")
    bump.name = f"{value.name}-micro-fur-bump"
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.018
    links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


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


def ellipse_plate(
    name: str,
    center: tuple[float, float],
    radii: tuple[float, float],
    z: float,
    mat,
    *,
    vertices: int = 20,
    thickness: float = 0.04,
    bevel: float = 0.018,
):
    """Create an authored rounded silhouette without primitive-sphere anatomy."""
    points = [
        (
            center[0] + math.cos(index / vertices * math.tau) * radii[0],
            center[1] + math.sin(index / vertices * math.tau) * radii[1],
        )
        for index in range(vertices)
    ]
    return polygon_plate(name, points, z, mat, thickness=thickness, bevel=bevel)


class XorShift32:
    """Small cross-language PRNG used only to author deterministic preview tracks."""

    def __init__(self, seed: int):
        self.state = int(seed) & 0xFFFFFFFF or 0x9E3779B9

    def next(self) -> float:
        value = self.state
        value ^= (value << 13) & 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        self.state = value & 0xFFFFFFFF
        return self.state / 0x100000000

    def signed(self) -> float:
        return self.next() * 2.0 - 1.0


def quintic(value: float) -> float:
    return value * value * value * (value * (value * 6.0 - 15.0) + 10.0)


def lerp(start: float, end: float, blend: float) -> float:
    return start + (end - start) * blend


def closed_catmull_rom(path: list[list[float]], progress: float) -> Vector:
    if progress >= 1.0:
        progress = 0.0
    scaled = (progress % 1.0) * len(path)
    index = int(math.floor(scaled)) % len(path)
    local = scaled - math.floor(scaled)
    points = [Vector(path[(index + offset) % len(path)]) for offset in (-1, 0, 1, 2)]
    p0, p1, p2, p3 = points
    return 0.5 * (
        2.0 * p1
        + (-p0 + p2) * local
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * local * local
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * local * local * local
    )


def build_helicopter_variance_track(seed: int) -> list[dict[str, float]]:
    contract = CHOREOGRAPHY["helicopter"]
    random = XorShift32(seed)
    maxima = {
        "pitch": float(contract["maximumPitchDegrees"]),
        "yaw": float(contract["maximumYawDegrees"]),
        "bank": float(contract["maximumBankDegrees"]),
        "altitude": float(contract["maximumAltitudeOffsetM"]),
        "direction": math.radians(float(contract["maximumDirectionBiasDegrees"])),
        "radius": float(contract["maximumRadiusScaleDelta"]),
    }
    track: list[dict[str, float]] = []
    for _ in range(int(contract["segmentCount"])):
        # Most segments remain close to trim. A few make a restrained, coupled
        # correction, with the hold/blend envelope applied by the sampler.
        amount = (0.46 + random.next() * 0.54) if random.next() < 0.42 else (0.04 + random.next() * 0.14)
        turn = random.signed() * amount
        vertical = random.signed() * amount
        direction = random.signed() * amount
        track.append({
            "pitch": (vertical * 0.92 - abs(turn) * 0.08) * maxima["pitch"],
            "yaw": turn * maxima["yaw"],
            "bank": (-turn * 0.88 + random.signed() * 0.12 * amount) * maxima["bank"],
            "altitude": vertical * maxima["altitude"],
            "direction": direction * maxima["direction"],
            "radius": random.signed() * amount * maxima["radius"],
        })
    return track


def sample_hold_track(track: list[dict[str, float]], progress: float) -> dict[str, float]:
    if progress >= 1.0:
        progress = 0.0
    scaled = (progress % 1.0) * len(track)
    index = int(math.floor(scaled)) % len(track)
    local = scaled - math.floor(scaled)
    hold_fraction = float(CHOREOGRAPHY["helicopter"]["holdFraction"])
    if local <= hold_fraction:
        blend = 0.0
    else:
        blend = quintic((local - hold_fraction) / (1.0 - hold_fraction))
    start = track[index]
    end = track[(index + 1) % len(track)]
    return {key: lerp(start[key], end[key], blend) for key in start}


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
    if hasattr(scene.render, "use_motion_blur"):
        scene.render.use_motion_blur = True
    if hasattr(scene.render, "motion_blur_shutter"):
        scene.render.motion_blur_shutter = 0.32
    if hasattr(scene.render, "motion_blur_position"):
        scene.render.motion_blur_position = "CENTER"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene["preview_recipe_id"] = CHOREOGRAPHY["recipeId"]
    scene["preview_variance_algorithm"] = CHOREOGRAPHY["helicopter"]["varianceAlgorithm"]
    scene["preview_review_frames"] = ",".join(str(frame) for frame in CHOREOGRAPHY["reviewFrames"])
    scene["runtime_contract"] = "prerecorded-media-only-zero-gameplay-render-submissions"

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

    materials = {
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
    add_fur_microtexture(materials["fur"], (0.012, 0.01, 0.016, 1), (0.075, 0.068, 0.082, 1))
    add_fur_microtexture(materials["fur_highlight"], (0.13, 0.12, 0.14, 1), (0.48, 0.45, 0.43, 1))
    return materials


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
                item.keyframe_insert(data_path="location", frame=(FINAL_FRAME + 1) // 2)
                item.location.x = origin_x - travel
                item.keyframe_insert(data_path="location", frame=FINAL_FRAME)
    for y in range(-33, 17, 7):
        cube("neon-ceiling-strip", (0, y, 7.08), (9.4, 0.11, 0.12), mats["cyan"] if y % 2 else mats["amber"], bevel=0.03)
    for x in (-11.4, 11.4):
        for y in (-28, -14, 0, 14):
            cube("neon-wall-marker", (x, y, 3.4), (0.08, 1.5, 0.1), mats["amber"] if y < 0 else mats["cyan"])
    add_point_light("range-key-cyan", (0, -9, 6.7), (0.05, 0.65, 1.0), 1250, 2.5)
    add_point_light("range-key-amber", (0, -29, 6.4), (1.0, 0.24, 0.02), 1000, 2.2)


def animate_rotor(rotor, final_frame: int, axis: int = 1) -> None:
    rotor.rotation_mode = "XYZ"
    rotor.rotation_euler[axis] = 0
    driver = rotor.driver_add("rotation_euler", axis).driver
    turns = int(CHOREOGRAPHY["helicopter"]["rotorTurnsPerLoop"])
    driver.expression = f"(frame - 1) * {math.tau * turns / max(1, final_frame - 1):.12f}"
    rotor["preview_rotor_visible_first_person"] = True
    rotor["preview_rotor_turns_per_loop"] = turns
    rotor["preview_rotor_loop_frames"] = final_frame


def strengthen_first_person_rotor_cue(rotor) -> None:
    """Keep the authored rotor readable as a restrained, physical top-frame cue."""
    for item in object_tree(rotor):
        if item.type != "MESH":
            continue
        if "RotorBlade" in item.name:
            # The accepted vehicle uses physically narrow blades. At 960x540
            # they collapse below a pixel when viewed edge-on from the pilot
            # socket, so widen only this offline presentation copy.
            item.scale.x *= 3.2
            cue = "authored-blade-motion-cue"
            alpha = 0.20
            emission_strength = 0.42
        elif "RotorArc" in item.name:
            cue = "authored-disc-motion-cue"
            alpha = 0.115
            emission_strength = 0.28
        elif "RotorTip" in item.name:
            cue = "authored-tip-motion-cue"
            alpha = 0.42
            emission_strength = 1.25
        else:
            continue
        if not item.data.materials:
            raise RuntimeError(f"first-person rotor cue has no authored material: {item.name}")
        source = item.data.materials[0]
        value = source.copy()
        value.name = f"{source.name}-{cue}"
        value.diffuse_color[3] = alpha
        value.surface_render_method = "DITHERED"
        if value.node_tree is None:
            raise RuntimeError(f"first-person rotor cue material has no nodes: {value.name}")
        bsdf = value.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            raise RuntimeError(f"first-person rotor cue material has no Principled BSDF: {value.name}")
        base = bsdf.inputs.get("Base Color")
        material_alpha = bsdf.inputs.get("Alpha")
        emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        emission_amount = bsdf.inputs.get("Emission Strength")
        if base is not None:
            base.default_value[3] = alpha
        if material_alpha is not None:
            material_alpha.default_value = alpha
        if emission is not None and "RotorTip" not in item.name:
            emission.default_value = (0.035, 0.26, 0.31, 1.0)
        if emission_amount is not None:
            emission_amount.default_value = emission_strength
        item.data.materials[0] = value
        item["preview_rotor_visual_cue"] = cue
        item["preview_rotor_visual_alpha"] = alpha


def object_tree(root) -> list[bpy.types.Object]:
    result: list[bpy.types.Object] = []
    stack = [root]
    while stack:
        item = stack.pop()
        result.append(item)
        stack.extend(item.children)
    return result


def animate_cockpit_instruments(cockpit_tree: set[bpy.types.Object]) -> None:
    radar_sweep = next((item for item in cockpit_tree if item.name.startswith("Chopper_RadarSweep_LOD0")), None)
    target_ring = next((item for item in cockpit_tree if item.name.startswith("chopper-cockpit-hud-target-ring")), None)
    if radar_sweep is None or target_ring is None:
        raise RuntimeError("authored cockpit is missing radar sweep or HUD target-ring geometry")
    radar_sweep.rotation_mode = "XYZ"
    radar_driver = radar_sweep.driver_add("rotation_euler", 1).driver
    radar_driver.expression = f"(frame - 1) * {math.tau * 2 / max(1, FINAL_FRAME - 1):.12f}"
    radar_sweep["preview_instrument_animation"] = "two-exact-loop-radar-turns"
    base_scale = target_ring.scale.copy()
    for frame in range(1, FINAL_FRAME + 1):
        progress = (frame - 1) / max(1, FINAL_FRAME - 1)
        pulse = 1.0 + math.sin(progress * math.tau * 2.0) * 0.045
        target_ring.scale = base_scale * pulse
        target_ring.keyframe_insert(data_path="scale", frame=frame)
    target_ring["preview_instrument_animation"] = "bounded-two-pulse-exact-loop"
    set_linear_interpolation(target_ring)

    for material_name, minimum, maximum in (
        ("MAT_Pass65Chopper_HUDGreen", 2.8, 3.25),
        ("MAT_Pass65Chopper_HUDCyan", 2.65, 3.05),
    ):
        used_materials = {
            value
            for item in cockpit_tree
            if item.type == "MESH"
            for value in item.data.materials
            if value is not None
        }
        value = next((
            candidate for candidate in used_materials
            if candidate.name == material_name or candidate.name.startswith(f"{material_name}.")
        ), None)
        if value is None or value.node_tree is None:
            raise RuntimeError(f"authored cockpit material missing: {material_name}")
        bsdf = value.node_tree.nodes.get("Principled BSDF")
        strength = None if bsdf is None else bsdf.inputs.get("Emission Strength")
        if strength is None:
            raise RuntimeError(f"authored cockpit material has no emission strength: {material_name}")
        for frame in range(1, FINAL_FRAME + 1):
            progress = (frame - 1) / max(1, FINAL_FRAME - 1)
            blend = (math.sin(progress * math.tau * 2.0 - math.pi / 2.0) + 1.0) / 2.0
            strength.default_value = lerp(minimum, maximum, blend)
            strength.keyframe_insert(data_path="default_value", frame=frame)
        value["preview_instrument_animation"] = "bounded-emission-breathe-exact-loop"
        set_linear_interpolation(value.node_tree)


def add_authored_helicopter_cockpit(rig) -> None:
    """Append the approved LOD0 cockpit and reproduce runtime cockpit-only visibility."""
    if not CHOPPER_SOURCE.is_file():
        raise RuntimeError(f"approved authored chopper source missing: {CHOPPER_SOURCE}")
    with bpy.data.libraries.load(str(CHOPPER_SOURCE), link=False) as (source, destination):
        destination.objects = list(source.objects)
    loaded = [obj for obj in destination.objects if obj is not None]
    for obj in loaded:
        if not obj.users_collection:
            bpy.context.collection.objects.link(obj)
    lod0 = next((
        obj for obj in loaded
        if obj.get("asset_id") == "chopper-gunner-vehicle-v1" and obj.get("quality_tier") == "LOD0"
    ), None)
    if lod0 is None:
        raise RuntimeError("approved chopper source has no chopper-gunner-vehicle-v1 LOD0 root")
    lod0_tree = set(object_tree(lod0))
    cockpit = next((
        obj for obj in lod0_tree
        if obj.get("canonical_node_name") == "chopper-first-person-cockpit"
        or obj.name == "chopper-first-person-cockpit"
    ), None)
    camera_socket = next((
        obj for obj in lod0_tree
        if obj.get("canonical_node_name") == "chopper-first-person-camera-socket"
        or obj.name == "chopper-first-person-camera-socket"
    ), None)
    first_person_rotor = next((
        obj for obj in lod0_tree
        if obj.get("canonical_node_name") == "chopper-first-person-rotor"
        or obj.name == "chopper-first-person-rotor"
    ), None)
    if cockpit is None or camera_socket is None or first_person_rotor is None:
        raise RuntimeError("approved chopper source is missing cockpit, camera, or first-person rotor semantics")
    cockpit_tree = set(object_tree(cockpit))
    for obj in lod0_tree:
        if obj.type == "MESH":
            obj.hide_render = obj not in cockpit_tree
            obj.hide_viewport = obj not in cockpit_tree
    for obj in loaded:
        if obj not in lod0_tree:
            bpy.data.objects.remove(obj, do_unlink=True)
    lod0.parent = rig
    lod0.rotation_mode = "XYZ"
    lod0.rotation_euler = (math.radians(-90), 0, 0)
    rotated_socket = lod0.rotation_euler.to_matrix() @ Vector(camera_socket.location)
    lod0.location = -rotated_socket
    # The acceptance camera carries a slight downward pilot gaze. Preserve that
    # composition while the map-orbit rig itself remains the authoritative view.
    lod0.location.y += 0.055
    lod0["offline_preview_source"] = "source-assets/blender/pass65-chopper-gunner.blend"
    lod0["offline_preview_visibility"] = "first-person-cockpit-only"
    lod0["preview_cockpit_contract"] = "authored-lod0-3d-cyan-green-glass"
    lod0["preview_recipe_id"] = CHOREOGRAPHY["recipeId"]
    animate_cockpit_instruments(cockpit_tree)
    for name, location, color in (
        ("cockpit-cyan-instrument-bounce", (-0.38, -0.20, -0.58), (0.03, 0.52, 1.0)),
        ("cockpit-green-instrument-bounce", (0.34, -0.16, -0.62), (0.04, 1.0, 0.32)),
    ):
        light = add_point_light(name, location, color, 11, 0.26)
        light["preview_cockpit_depth_light"] = True
        parent(light, rig)
    strengthen_first_person_rotor_cue(first_person_rotor)
    animate_rotor(first_person_rotor, FINAL_FRAME, axis=2)


def camera_keyframe(
    rig,
    frame: int,
    position: Vector,
    look_at: Vector,
    bank: float,
    pitch: float = 0.0,
    yaw: float = 0.0,
    previous_rotation: Euler | None = None,
) -> Euler:
    rig.location = position
    direction = look_at - position
    correction = Euler((pitch, yaw, bank), "XYZ").to_quaternion()
    orientation = direction.to_track_quat("-Z", "Y") @ correction
    rotation = orientation.to_euler("XYZ", previous_rotation)
    rig.rotation_mode = "XYZ"
    rig.rotation_euler = rotation
    rig.keyframe_insert(data_path="location", frame=frame)
    rig.keyframe_insert(data_path="rotation_euler", frame=frame)
    return rotation.copy()


def set_linear_interpolation(obj) -> None:
    if obj.animation_data is None or obj.animation_data.action is None:
        return
    action = obj.animation_data.action
    curves = list(getattr(action, "fcurves", ()))
    for layer in getattr(action, "layers", ()):
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                curves.extend(channelbag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"


def animate_helicopter_camera(rig, map_name: str) -> None:
    recipe = CHOREOGRAPHY["arenas"][map_name]
    radius_x, radius_y = (float(value) for value in recipe["radius"])
    centre = Vector(recipe["centre"])
    altitude = float(recipe["altitudeM"])
    look_at = Vector(recipe["lookAt"])
    phase = float(recipe["phaseRadians"])
    track = build_helicopter_variance_track(int(recipe["seed"]))
    rig["preview_recipe_id"] = CHOREOGRAPHY["recipeId"]
    rig["preview_arena_id"] = map_name
    rig["preview_seed"] = int(recipe["seed"])
    rig["preview_variance_algorithm"] = CHOREOGRAPHY["helicopter"]["varianceAlgorithm"]
    rig["preview_hold_fraction"] = float(CHOREOGRAPHY["helicopter"]["holdFraction"])
    first_pose: tuple[Vector, Vector, float, float, float] | None = None
    previous_rotation: Euler | None = None
    for frame in range(1, FINAL_FRAME + 1):
        progress = (frame - 1) / max(1, FINAL_FRAME - 1)
        variance = sample_hold_track(track, progress)
        theta = phase + progress * math.tau + variance["direction"]
        radius_scale = 1.0 + variance["radius"]
        position = Vector((
            centre.x + math.cos(theta) * radius_x * radius_scale,
            centre.y + math.sin(theta) * radius_y * radius_scale,
            altitude + variance["altitude"],
        ))
        pose = (
            position,
            look_at,
            math.radians(variance["bank"]),
            math.radians(variance["pitch"]),
            math.radians(variance["yaw"]),
        )
        if first_pose is None:
            first_pose = pose
        elif frame == FINAL_FRAME:
            pose = first_pose
        previous_rotation = camera_keyframe(rig, frame, *pose, previous_rotation=previous_rotation)
    set_linear_interpolation(rig)


def add_cat_pov(rig, mats) -> None:
    for side in (-1, 1):
        side_name = "left" if side < 0 else "right"
        ear_root = bpy.data.objects.new(f"authored-cat-ear-root-{side_name}", None)
        bpy.context.collection.objects.link(ear_root)
        ear_root.location = (side * 0.44, -0.015, -1.16)
        ear_root.scale = (0.68, 0.68, 0.68)
        ear_root["preview_anatomy"] = "ear"
        ear_root["preview_side"] = side_name
        parent(ear_root, rig)
        outer = polygon_plate(
            f"authored-feline-ear-silhouette-{side_name}",
            [(-0.28, -0.02), (-0.25, 0.14), (-0.14, 0.35), (0.0, 0.56), (0.14, 0.35), (0.25, 0.14), (0.28, -0.02)],
            0,
            mats["fur_highlight"],
            thickness=0.078,
            bevel=0.032,
        )
        outer["preview_anatomy"] = "ear-shell"
        parent(outer, ear_root)
        inner = polygon_plate(
            f"authored-feline-ear-inner-{side_name}",
            [(-0.16, 0.07), (-0.11, 0.21), (0.0, 0.43), (0.11, 0.21), (0.16, 0.07)],
            0.052,
            mats["pink_inner"],
            thickness=0.018,
            bevel=0.019,
        )
        inner["preview_anatomy"] = "ear-pinna"
        parent(inner, ear_root)
        tuft = polygon_plate(
            f"authored-feline-ear-tuft-{side_name}",
            [(-0.09, 0.38), (-0.04, 0.58), (0.0, 0.43), (0.04, 0.60), (0.09, 0.38)],
            0.061,
            mats["fur"],
            thickness=0.014,
            bevel=0.01,
        )
        tuft["preview_anatomy"] = "ear-tuft"
        parent(tuft, ear_root)
        ear_root.rotation_mode = "XYZ"
        for frame in range(1, FINAL_FRAME + 1):
            progress = (frame - 1) / max(1, FINAL_FRAME - 1)
            centre = 0.35 if side < 0 else 0.71
            distance = abs(((progress - centre + 0.5) % 1.0) - 0.5)
            twitch = 0.0 if distance >= 0.075 else math.cos(distance / 0.075 * math.pi / 2.0) ** 2
            ear_root.rotation_euler = (math.radians(-1.5), 0, math.radians(side * (7.0 + twitch * 5.5)))
            ear_root.keyframe_insert(data_path="rotation_euler", frame=frame)
        set_linear_interpolation(ear_root)

    for side in (-1, 1):
        side_name = "left" if side < 0 else "right"
        paw_root = bpy.data.objects.new(f"authored-cat-forepaw-root-{side_name}", None)
        bpy.context.collection.objects.link(paw_root)
        base_location = Vector((side * 0.34, -0.30, -1.05))
        paw_root.location = base_location
        paw_root.scale = (0.76, 0.76, 0.76)
        paw_root["preview_anatomy"] = "paw"
        paw_root["preview_side"] = side_name
        parent(paw_root, rig)
        foreleg = ellipse_plate(
            f"authored-cat-foreleg-{side_name}", (0, -0.19), (0.18, 0.34), 0,
            mats["fur"], thickness=0.09, bevel=0.028,
        )
        palm = ellipse_plate(
            f"authored-cat-paw-palm-{side_name}", (0, 0.09), (0.28, 0.24), 0.012,
            mats["fur"], thickness=0.11, bevel=0.032,
        )
        foreleg["preview_anatomy"] = "foreleg"
        palm["preview_anatomy"] = "palm"
        parent(foreleg, paw_root)
        parent(palm, paw_root)
        for toe_index, toe_x in enumerate((-0.18, -0.06, 0.06, 0.18), start=1):
            toe = ellipse_plate(
                f"authored-cat-paw-toe-{side_name}-{toe_index}", (toe_x, 0.30), (0.075, 0.115), 0.025,
                mats["fur_highlight"], vertices=16, thickness=0.075, bevel=0.025,
            )
            pad = ellipse_plate(
                f"authored-cat-digital-pad-{side_name}-{toe_index}", (toe_x, 0.32), (0.034, 0.047), 0.071,
                mats["pink"], vertices=14, thickness=0.018, bevel=0.01,
            )
            toe["preview_anatomy"] = "toe"
            toe["preview_side"] = side_name
            toe["preview_toe_index"] = toe_index
            pad["preview_anatomy"] = "digital-pad"
            parent(toe, paw_root)
            parent(pad, paw_root)
        central_pad = ellipse_plate(
            f"authored-cat-central-pad-{side_name}", (0, 0.13), (0.09, 0.07), 0.072,
            mats["pink"], vertices=18, thickness=0.018, bevel=0.012,
        )
        central_pad["preview_anatomy"] = "central-pad"
        parent(central_pad, paw_root)
        paw_root.rotation_mode = "XYZ"
        for frame in range(1, FINAL_FRAME + 1):
            progress = (frame - 1) / max(1, FINAL_FRAME - 1)
            centre = 0.43 if side < 0 else 0.79
            distance = abs(((progress - centre + 0.5) % 1.0) - 0.5)
            lift = 0.0 if distance >= 0.10 else math.cos(distance / 0.10 * math.pi / 2.0) ** 2
            paw_root.location = base_location + Vector((0, lift * 0.075, lift * 0.035))
            paw_root.rotation_euler = (
                math.radians(-lift * 8.0),
                math.radians(-side * lift * 2.5),
                math.radians(side * (2.0 + lift * 3.0)),
            )
            paw_root.keyframe_insert(data_path="location", frame=frame)
            paw_root.keyframe_insert(data_path="rotation_euler", frame=frame)
        set_linear_interpolation(paw_root)
    add_point_light("cat-pov-cyan-rim", (0, -0.08, -0.68), (0.08, 0.55, 1.0), 9, 0.28).parent = rig


def animate_cat_camera(rig) -> None:
    recipe = CHOREOGRAPHY["arenas"]["gun-range"]
    rig["preview_recipe_id"] = CHOREOGRAPHY["recipeId"]
    rig["preview_arena_id"] = "gun-range"
    rig["preview_seed"] = int(recipe["seed"])
    rig["preview_motion_bounds"] = json.dumps(recipe["motionBounds"], sort_keys=True)
    first_pose: tuple[Vector, Vector, float] | None = None
    previous_rotation: Euler | None = None
    for frame in range(1, FINAL_FRAME + 1):
        progress = (frame - 1) / max(1, FINAL_FRAME - 1)
        position = closed_catmull_rom(recipe["path"], progress)
        look = closed_catmull_rom(recipe["lookAtPath"], progress)
        # Four light footsteps and a curious head cant; both return exactly to
        # the first frame so the prerecorded loop has no camera snap.
        bob = math.sin(progress * math.tau * 4.0) * 0.018
        bank = math.radians(math.sin(progress * math.tau * 2.0) * 0.75)
        pose = (position + Vector((0, 0, bob)), look, bank)
        if first_pose is None:
            first_pose = pose
        elif frame == FINAL_FRAME:
            pose = first_pose
        previous_rotation = camera_keyframe(rig, frame, *pose, previous_rotation=previous_rotation)
    set_linear_interpolation(rig)


def add_camera_rig(kind: str, arena_id: str, mats):
    rig = bpy.data.objects.new(f"{kind}-preview-camera-rig", None)
    bpy.context.collection.objects.link(rig)
    recipe = CHOREOGRAPHY["arenas"][arena_id]
    rig["preview_kind"] = kind
    rig["preview_arena_id"] = arena_id
    rig["preview_recipe_id"] = CHOREOGRAPHY["recipeId"]
    camera_data = bpy.data.cameras.new(f"{kind}-preview-camera")
    camera_data.sensor_width = 36
    camera_data.angle = math.radians(float(recipe["fovDegrees"]))
    camera = bpy.data.objects.new(f"{kind}-preview-camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera["preview_fov_degrees"] = float(recipe["fovDegrees"])
    camera["preview_static_poster_frame"] = int(recipe["posterFrame"])
    camera.parent = rig
    camera.location = (0, 0, 0)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = camera
    if kind == "cat":
        add_cat_pov(rig, mats)
    else:
        add_authored_helicopter_cockpit(rig)
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
    rig = add_camera_rig("cat" if is_cat else "helicopter", map_name, mats)
    if is_cat:
        animate_cat_camera(rig)
    else:
        animate_helicopter_camera(rig, map_name)

    scene = bpy.context.scene
    scene["preview_arena_id"] = map_name
    scene["preview_seed"] = int(CHOREOGRAPHY["arenas"][map_name]["seed"])
    scene["preview_kind"] = CHOREOGRAPHY["arenas"][map_name]["kind"]
    scene["preview_fov_degrees"] = float(CHOREOGRAPHY["arenas"][map_name]["fovDegrees"])
    scene["preview_poster_frame"] = int(CHOREOGRAPHY["arenas"][map_name]["posterFrame"])
    frame_directory = FRAME_ROOT / map_name
    frame_directory.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(frame_directory / "frame-")
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER_DIR / f"{map_name}.blend"))
    if SAVE_ONLY:
        return
    requested_stills = STILL_FRAMES or ((STILL_FRAME,) if STILL_FRAME > 0 else ())
    if requested_stills:
        for still_frame in requested_stills:
            if still_frame < 1 or still_frame > FINAL_FRAME:
                raise RuntimeError(f"preview still frame outside 1..{FINAL_FRAME}: {still_frame}")
            scene.frame_set(still_frame)
            scene.render.filepath = str(frame_directory / f"frame-{scene.frame_current:04d}.png")
            bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)


requested_arenas = tuple(filter(None, os.environ.get(
    "AA_PREVIEW_ARENAS",
    "atomic-acres,skyline-terminal,rustworks-1v1,gun-range",
).split(",")))
unknown_arenas = set(requested_arenas) - set(CHOREOGRAPHY["arenas"])
if unknown_arenas:
    raise RuntimeError(f"unknown preview arenas requested: {sorted(unknown_arenas)}")
for arena in requested_arenas:
    render(arena)
