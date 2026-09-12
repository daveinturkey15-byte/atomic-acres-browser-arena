"""Author the Nuketown retro utility AC unit and export a runtime GLB.

Concept: teal-backyard image (codex-clipboard-37cd28a5): grey box condenser
beside the brick chimney on a concrete pad — louvered front, top fan grille,
side control box. Modelled at real scale, metres, ground at Z = 0, unit
centred on the origin so placement lives in the TS helper, not the mesh.

Reused exact shared techniques (see docs/technique-lab/props/skill-receipt.md):
- Deterministic primitive authoring with applied bevel modifiers for bevelled
  silhouettes (pattern: scripts/blender/world-studio/build_hero_bus.py and the
  wave-1 garden-set script in this directory).
- CPU-synthesised tileable fBm maps via numpy (pattern: make_body_maps /
  garden-set fbm_rough_image), plus a subtle vertical-brush paint basecolor.
- Identical GLB export kwargs, smooth angle, census shape and BUILD_REPORT.
Runs headless: blender --background --factory-startup --threads 4 --python build_utility_ac.py
Renders one 512x384 CPU Cycles thumbnail (fixed 4 threads) of the actual asset.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler

REPO = Path(__file__).resolve().parents[4]
ASSET_DIR = REPO / "public" / "assets" / "world-studio" / "blender" / "props"
BLEND_PATH = REPO / "source-assets" / "world-studio" / "props" / "utility-ac.blend"
GLB_PATH = ASSET_DIR / "utility-ac.glb"
THUMB_PATH = ASSET_DIR / "utility-ac-thumb.png"
TEX_DIR = ASSET_DIR / "textures"

SEED = 20260912

# ---------------------------------------------------------------------------------------------
# Frozen dimensions (metres). Box condenser on a pad; front faces -Y.
# ---------------------------------------------------------------------------------------------
PAD_SIZE = (1.20, 1.00, 0.08)
CAB_SIZE = (0.86, 0.64, 0.72)
CAB_BASE_Z = 0.14            # pad top (0.08) + rubber feet (0.06)
CAB_TOP_Z = CAB_BASE_Z + CAB_SIZE[2]
FAN_R = 0.24

PROP_NAMES: list[str] = []


# ---------------------------------------------------------------------------------------------
# Small helpers (identical contract to build_garden_set.py)
# ---------------------------------------------------------------------------------------------
def active(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bevel(obj, width: float, segments: int = 2) -> None:
    active(obj)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth(obj, angle_deg: float = 34.0) -> None:
    active(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg), keep_sharp_edges=True)


def box(name: str, loc, size, bevel_w: float = 0.010) -> object:
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.dimensions = size
    # Operator defaults are location=True, rotation=True: pass explicit flags
    # or creation offsets bake into verts and later loc/rot double-applies.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_w > 0:
        bevel(obj, bevel_w)
    PROP_NAMES.append(name)
    return obj


def cylinder(name: str, loc, radius: float, depth: float, vertices: int = 24) -> object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc
    )
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    PROP_NAMES.append(name)
    return obj


def assign(obj, mat) -> None:
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------------------------
# CPU texture synthesis (tileable by construction: integer lattice + integer periods)
# ---------------------------------------------------------------------------------------------
def fbm_image(name: str, path: Path, base: tuple[float, float, float],
              var: float, brush_periods: int, data: bool) -> bpy.types.Image:
    """Brushed-paint variation map. Colour when data=False, roughness when True."""
    n = 256
    rng = np.random.default_rng(SEED + 3)
    lattice = rng.random((8, 8))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64) / n * 8.0
    x0, y0 = xx.astype(int) % 8, yy.astype(int) % 8
    fx, fy = xx - xx.astype(int), yy - yy.astype(int)
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    v = (lattice[x0, y0] * (1 - sx) + lattice[(x0 + 1) % 8, y0] * sx) * (1 - sy) + \
        (lattice[x0, (y0 + 1) % 8] * (1 - sx) + lattice[(x0 + 1) % 8, (y0 + 1) % 8] * sx) * sy
    # Vertical brushing: integer periods across the tile so edges meet.
    streak = 0.5 + 0.5 * np.sin(2 * np.pi * (xx * brush_periods / 8.0 + v * 2.0))
    if data:
        r = np.clip(base[0] + (v - 0.5) * var + (streak - 0.5) * var * 0.5, 0.05, 1.0)
        rgb = np.stack([r, r, r], axis=-1)
    else:
        tone = 1.0 + (v - 0.5) * var + (streak - 0.5) * var * 0.4
        rgb = np.stack([np.full_like(tone, base[0]) * tone,
                        np.full_like(tone, base[1]) * tone,
                        np.full_like(tone, base[2]) * tone], axis=-1)
    rgba = np.dstack([np.clip(rgb, 0.0, 1.0), np.ones_like(v)])[..., :4]
    img = bpy.data.images.new(name, n, n)
    img.pixels = rgba.reshape(-1).tolist()
    img.file_format = "PNG"
    img.filepath_raw = str(path)
    img.save()
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    img.use_fake_user = True
    return img


def principled(name: str, base, metallic: float, rough: float,
               rough_img=None, base_img=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    if base_img is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    if rough_img is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = rough_img
        tex.interpolation = "Linear"
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough
    return mat


# ---------------------------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------------------------
def build_pad_and_feet(concrete, rubber) -> None:
    pad = box("AcPad", (0, 0, PAD_SIZE[2] / 2.0), PAD_SIZE, 0.006)
    assign(pad, concrete)
    hx, hy = CAB_SIZE[0] / 2.0 - 0.08, CAB_SIZE[1] / 2.0 - 0.08
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        foot = box(f"AcFoot{i}", (sx * hx, sy * hy, 0.08 + 0.03), (0.09, 0.09, 0.06), 0.006)
        assign(foot, rubber)


def build_cabinet(paint, dark) -> None:
    cab = box("AcCabinet", (0, 0, CAB_BASE_Z + CAB_SIZE[2] / 2.0), CAB_SIZE, 0.012)
    assign(cab, paint)
    # Corner post seams: thin darker verticals read as panel breaks.
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        seam = box(f"AcSeam{i}", (sx * (CAB_SIZE[0] / 2.0 - 0.01), sy * (CAB_SIZE[1] / 2.0 - 0.01),
                                  CAB_BASE_Z + CAB_SIZE[2] / 2.0),
                   (0.018, 0.018, CAB_SIZE[2] - 0.06), 0.0)
        assign(seam, dark)
    # Lid lip overhanging the top edge.
    lid = box("AcLid", (0, 0, CAB_TOP_Z + 0.008), (CAB_SIZE[0] + 0.03, CAB_SIZE[1] + 0.03, 0.035), 0.008)
    assign(lid, paint)


def build_louvers(paint, dark) -> None:
    """Recessed dark intake + 7 angled slats on the -Y face."""
    y_face = -CAB_SIZE[1] / 2.0
    recess = box("AcIntake", (0, y_face - 0.005, 0.50), (0.70, 0.02, 0.52), 0.0)
    assign(recess, dark)
    for i in range(7):
        z = 0.28 + i * 0.073
        slat = box(f"AcLouver{i}", (0, y_face - 0.018, z), (0.70, 0.014, 0.055), 0.002)
        slat.rotation_euler = Euler((math.radians(-35), 0, 0), "XYZ")
        assign(slat, paint)


def build_fan(dark, steel) -> None:
    """Recessed fan well, 3 blades, wire grille of 3 rings + 8 spokes + hub."""
    well = cylinder("AcFanWell", (0, 0, CAB_TOP_Z + 0.026), FAN_R + 0.015, 0.02, 40)
    assign(well, dark)
    for i in range(3):
        blade = box(f"AcFanBlade{i}", (0, 0, CAB_TOP_Z + 0.030), (0.20, 0.095, 0.008), 0.002)
        blade.rotation_euler = Euler((0, math.radians(18), math.radians(i * 120)), "XYZ")
        # Push each blade out along its own yaw so the trio reads as a fan.
        a = math.radians(i * 120)
        blade.location = (0.11 * math.cos(a), 0.11 * math.sin(a), CAB_TOP_Z + 0.030)
        assign(blade, steel)
    for i, r in enumerate((0.10, 0.17, 0.24)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.007,
                                         location=(0, 0, CAB_TOP_Z + 0.052))
        ring = bpy.context.view_layer.objects.active
        ring.name = f"AcGrilleRing{i}"
        PROP_NAMES.append(ring.name)
        assign(ring, steel)
    for i in range(8):
        spoke = box(f"AcGrilleSpoke{i}", (0, 0, CAB_TOP_Z + 0.052), (0.50, 0.014, 0.008), 0.0)
        spoke.rotation_euler = Euler((0, 0, math.radians(i * 22.5)), "XYZ")
        assign(spoke, steel)
    hub = cylinder("AcGrilleHub", (0, 0, CAB_TOP_Z + 0.052), 0.05, 0.025, 20)
    assign(hub, steel)


def build_services(paint, dark, copper, rubber, lamp) -> None:
    """Side control box with knob + lamp, rear copper stub with insulation."""
    x_face = CAB_SIZE[0] / 2.0
    ctl = box("AcControlBox", (x_face + 0.05, 0.10, 0.55), (0.10, 0.24, 0.30), 0.006)
    assign(ctl, paint)
    knob = cylinder("AcControlKnob", (x_face + 0.105, 0.10, 0.55), 0.025, 0.04, 16)
    knob.rotation_euler = Euler((0, math.radians(90), 0), "XYZ")
    assign(knob, dark)
    eye = cylinder("AcLamp", (x_face + 0.105, 0.10, 0.66), 0.012, 0.02, 12)
    eye.rotation_euler = Euler((0, math.radians(90), 0), "XYZ")
    assign(eye, lamp)
    y_back = CAB_SIZE[1] / 2.0
    stub = cylinder("AcPipeStub", (-0.25, y_back + 0.05, 0.45), 0.016, 0.30, 12)
    assign(stub, copper)
    lag = cylinder("AcPipeLagging", (-0.25, y_back + 0.05, 0.30), 0.024, 0.12, 12)
    assign(lag, rubber)


# ---------------------------------------------------------------------------------------------
# Census / export / thumbnail (identical contract to build_garden_set.py)
# ---------------------------------------------------------------------------------------------
def census() -> dict:
    # Direct loc/rot assignment leaves matrix_world stale until evaluated;
    # without this the census reads phantom bounds (false 1.77 m on first run).
    bpy.context.view_layer.update()
    tris, verts, objs = 0, 0, 0
    mins = [math.inf] * 3
    maxs = [-math.inf] * 3
    worst = ("", 0.0)
    for name in PROP_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        tris += len(mesh.loop_triangles)
        verts += len(mesh.vertices)
        objs += 1
        omin = math.inf
        for v in mesh.vertices:
            w = obj.matrix_world @ v.co
            omin = min(omin, w[2])
            for i in range(3):
                mins[i] = min(mins[i], w[i])
                maxs[i] = max(maxs[i], w[i])
        if omin < mins[2] + 1e-9:
            worst = (name, round(omin, 4))
    return {"objects": objs, "vertices": verts, "triangles": tris,
            "boundsMin": [round(v, 4) for v in mins],
            "boundsMax": [round(v, 4) for v in maxs],
            "lowestObject": list(worst)}


def render_thumbnail() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 512
    scene.render.resolution_y = 384
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.001))
    ground = bpy.context.view_layer.objects.active
    ground.name = "ThumbGround"
    gmat = bpy.data.materials.new("ThumbGround")
    gmat.use_nodes = True
    bsdf = gmat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.52, 0.52, 0.50, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    ground.data.materials.append(gmat)

    bpy.ops.object.light_add(type="SUN", location=(4, -3, 6))
    sun = bpy.context.view_layer.objects.active
    sun.data.energy = 3.0
    bpy.ops.object.light_add(type="SUN", location=(-5, 4, 3))
    fill = bpy.context.view_layer.objects.active
    fill.data.energy = 0.6

    bpy.ops.object.empty_add(location=(0, 0, 0.5))
    target = bpy.context.view_layer.objects.active
    bpy.ops.object.camera_add(location=(1.9, -2.2, 1.45))
    cam = bpy.context.view_layer.objects.active
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam
    world = bpy.context.scene.world or bpy.data.worlds.new("ThumbWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.72, 0.85, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

    scene.render.filepath = str(THUMB_PATH)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    paint_base = fbm_image("AcPaintBase", TEX_DIR / "ac_paint_basecolor.png",
                           (0.60, 0.585, 0.545), 0.10, 24, data=False)
    paint_rough = fbm_image("AcPaintRough", TEX_DIR / "ac_paint_roughness.png",
                            (0.55,), 0.25, 24, data=True)
    conc_rough = fbm_image("AcConcreteRough", TEX_DIR / "ac_concrete_roughness.png",
                           (0.90,), 0.20, 8, data=True)

    paint = principled("AcPaint", (0.60, 0.585, 0.545), 0.35, 0.55,
                       rough_img=paint_rough, base_img=paint_base)
    dark = principled("AcDark", (0.05, 0.05, 0.055), 0.6, 0.7)
    steel = principled("AcSteel", (0.35, 0.35, 0.36), 0.9, 0.4)
    concrete = principled("AcConcrete", (0.55, 0.55, 0.53), 0.0, 0.9, rough_img=conc_rough)
    rubber = principled("AcRubber", (0.03, 0.03, 0.032), 0.0, 0.95)
    copper = principled("AcCopper", (0.55, 0.28, 0.12), 1.0, 0.35)
    lamp = principled("AcLampRed", (0.55, 0.05, 0.05), 0.0, 0.4)

    build_pad_and_feet(concrete, rubber)
    build_cabinet(paint, dark)
    build_louvers(paint, dark)
    build_fan(dark, steel)
    build_services(paint, dark, copper, rubber, lamp)

    for name in PROP_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            smooth(obj)

    stats = census()

    bpy.ops.object.select_all(action="DESELECT")
    for name in PROP_NAMES:
        bpy.data.objects[name].select_set(True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=False)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
    )

    render_thumbnail()

    report = {"blender": bpy.app.version_string, "seed": SEED, **stats,
              "materials": ["AcPaint", "AcDark", "AcSteel", "AcConcrete",
                            "AcRubber", "AcCopper", "AcLampRed"],
              "textures": sorted(p.name for p in TEX_DIR.glob("ac_*.png")),
              "blend": str(BLEND_PATH.relative_to(REPO)).replace("\\", "/"),
              "glb": str(GLB_PATH.relative_to(REPO)).replace("\\", "/"),
              "glbBytes": GLB_PATH.stat().st_size,
              "thumb": str(THUMB_PATH.relative_to(REPO)).replace("\\", "/"),
              "thumbBytes": THUMB_PATH.stat().st_size}
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
