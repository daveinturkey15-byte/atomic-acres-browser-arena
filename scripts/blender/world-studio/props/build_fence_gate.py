"""Author the Nuketown weathered wood fence/gate section and export a runtime GLB.

Concept: teal-backyard image (codex-clipboard-37cd28a5): vertical-plank wood
fence ~1.8 m with cap rail, posts, and a gate leaf; yellow-backyard image
(codex-clipboard-b6a7a535) shows the same weathered horizontal-rail language.
One run along X: two fixed bays plus a gate leaf hinged open 32 degrees.
Modelled at real scale, metres, ground at Z = 0, run centred on the origin.

Reused exact shared techniques (see docs/technique-lab/props/skill-receipt.md):
- Deterministic primitive authoring with applied bevel modifiers for bevelled
  silhouettes (pattern: scripts/blender/world-studio/build_hero_bus.py and the
  wave-1 garden-set script in this directory).
- CPU-synthesised tileable wood-grain/fBm maps via numpy (pattern:
  make_body_maps / garden-set weave_image + fbm_rough_image, extended with a
  directional grain variant for weathered boards).
- Identical GLB export kwargs, smooth angle, census shape and BUILD_REPORT.
Runs headless: blender --background --factory-startup --threads 4 --python build_fence_gate.py
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
BLEND_PATH = REPO / "source-assets" / "world-studio" / "props" / "fence-gate.blend"
GLB_PATH = ASSET_DIR / "fence-gate.glb"
THUMB_PATH = ASSET_DIR / "fence-gate-thumb.png"
TEX_DIR = ASSET_DIR / "textures"

SEED = 20260912
LEAF_OPEN_DEG = 32.0  # gate leaf swing, plan view, toward -Y (into the yard)

# ---------------------------------------------------------------------------------------------
# Frozen dimensions (metres). Vertical-plank run, 1.8 m nominal fence height.
# ---------------------------------------------------------------------------------------------
POST_X = (-2.7, -0.9, 0.9, 2.7)
POST_SIZE = (0.10, 0.10, 1.90)
PLANK_W, PLANK_T = 0.14, 0.024
BAY_INNER = 1.70            # clear span between posts in a fixed bay
PLANK_PITCH = 0.17          # 10 planks per fixed bay
PLANK_H = 1.72
GATE_W = 1.72               # leaf width covering the middle opening when closed
HINGE_X = 0.9

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
def wood_image(name: str, path: Path, base: tuple[float, float, float],
               streak_amp: float, weather: float, data: bool) -> bpy.types.Image:
    """Weathered board map, grain running along V. Colour when data=False."""
    n = 256
    rng = np.random.default_rng(SEED + 7)
    lattice = rng.random((8, 8))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64) / n * 8.0
    x0, y0 = xx.astype(int) % 8, yy.astype(int) % 8
    fx, fy = xx - xx.astype(int), yy - yy.astype(int)
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    v = (lattice[x0, y0] * (1 - sx) + lattice[(x0 + 1) % 8, y0] * sx) * (1 - sy) + \
        (lattice[x0, (y0 + 1) % 8] * (1 - sx) + lattice[(x0 + 1) % 8, (y0 + 1) % 8] * sx) * sy
    # Vertical grain: 9 integer periods across the tile, warped by the lattice.
    grain = 0.5 + 0.5 * np.sin(2 * np.pi * (xx * 9.0 / 8.0 + v * 1.5))
    # Grey weathering blotches: second lattice at integer offset.
    w = (lattice[(x0 + 3) % 8, (y0 + 5) % 8] - 0.5)
    if data:
        r = np.clip(0.80 + (grain - 0.5) * streak_amp + (v - 0.5) * 0.20, 0.05, 1.0)
        rgb = np.stack([r, r, r], axis=-1)
    else:
        tone = 1.0 + (grain - 0.5) * streak_amp + (v - 0.5) * 0.22
        grey = 1.0 - np.clip(w, 0.0, 1.0) * weather  # sun-grey drift on some boards
        rgb = np.stack([np.full_like(tone, base[0]) * tone * (0.94 + 0.06 * grey),
                        np.full_like(tone, base[1]) * tone * (0.94 + 0.06 * grey),
                        np.full_like(tone, base[2]) * tone * grey], axis=-1)
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
def build_posts(wood, _metal) -> None:
    for i, x in enumerate(POST_X):
        post = box(f"FencePost{i}", (x, 0, POST_SIZE[2] / 2.0), POST_SIZE, 0.008)
        assign(post, wood)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.085, depth=0.07,
                                        location=(x, 0, POST_SIZE[2] + 0.035),
                                        rotation=(0, 0, math.radians(45)))
        cap = bpy.context.view_layer.objects.active
        cap.name = f"FencePostCap{i}"
        PROP_NAMES.append(cap.name)
        assign(cap, wood)


def build_fixed_bay(tag: str, x0: float, x1: float, wood) -> None:
    """Planks + back rails + cap rail for one fixed bay spanning [x0, x1]."""
    rng = np.random.default_rng(SEED + (11 if tag == "L" else 23))
    cx = (x0 + x1) / 2.0
    span = x1 - x0 - POST_SIZE[0]
    count = int(round(span / PLANK_PITCH))
    start = cx - (count - 1) * PLANK_PITCH / 2.0
    for i in range(count):
        h = PLANK_H + float(rng.uniform(-0.025, 0.025))
        yaw = float(rng.uniform(-0.008, 0.008))
        p = box(f"Fence{tag}Plank{i}", (start + i * PLANK_PITCH, 0, h / 2.0),
                (PLANK_W, PLANK_T, h), 0.004)
        p.rotation_euler = Euler((0, 0, yaw), "XYZ")
        assign(p, wood)
    for j, z in enumerate((0.45, 1.35)):
        rail = box(f"Fence{tag}Rail{j}", (cx, 0.038, z), (span, 0.035, 0.09), 0.006)
        assign(rail, wood)
    cap = box(f"Fence{tag}Cap", (cx, 0, 1.775), (span + 0.16, 0.15, 0.035), 0.008)
    assign(cap, wood)


def build_gate_leaf(wood, metal) -> None:
    """Gate leaf built closed (covering [-0.9, 0.9] at y=0), then swung on a hinge empty."""
    leaf_ids: list[str] = []

    def leaf_box(name: str, loc, size, mat, bevel_w: float = 0.005):
        obj = box(name, loc, size, bevel_w)
        assign(obj, mat)
        leaf_ids.append(name)
        return obj

    # Frame: hinge stile at x=0.84, latch stile at x=-0.84, rails + diagonal.
    leaf_box("GateHingeStile", (0.84, 0, 0.85), (0.07, 0.035, 1.60), wood)
    leaf_box("GateLatchStile", (-0.84, 0, 0.85), (0.07, 0.035, 1.60), wood)
    for j, z in enumerate((0.32, 1.38)):
        leaf_box(f"GateRail{j}", (0.0, 0.030, z), (1.68, 0.030, 0.10), wood)
    diag_len = math.hypot(1.61, 1.06)
    diag = leaf_box("GateBrace", (0.0, 0.030, 0.85), (diag_len, 0.026, 0.09), wood)
    diag.rotation_euler = Euler((0, math.atan2(1.06, 1.61), 0), "XYZ")
    rng = np.random.default_rng(SEED + 31)
    for i in range(10):
        h = 1.62 + float(rng.uniform(-0.02, 0.02))
        x = -0.765 + i * 0.17
        leaf_box(f"GatePlank{i}", (x, -0.012, h / 2.0 + 0.03),
                 (PLANK_W, PLANK_T, h), wood, 0.004)
    # Hardware: strap hinges + latch, dark metal.
    for j, z in enumerate((0.42, 1.28)):
        leaf_box(f"GateStrap{j}", (0.68, -0.032, z), (0.34, 0.012, 0.05), metal, 0.002)
    leaf_box("GateLatch", (-0.80, -0.035, 1.05), (0.05, 0.03, 0.16), metal, 0.002)
    knob = cylinder("GateKnob", (-0.80, -0.065, 1.12), 0.022, 0.05)
    knob.rotation_euler = Euler((math.radians(90), 0, 0), "XYZ")
    assign(knob, metal)
    leaf_ids.append("GateKnob")

    # Swing the whole leaf on a hinge empty at the hinge post.
    bpy.ops.object.empty_add(location=(HINGE_X, 0, 0))
    hinge = bpy.context.view_layer.objects.active
    hinge.name = "GateHinge"
    bpy.ops.object.select_all(action="DESELECT")
    for name in leaf_ids:
        bpy.data.objects[name].select_set(True)
    hinge.select_set(True)
    bpy.context.view_layer.objects.active = hinge
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
    hinge.rotation_euler = Euler((0, 0, math.radians(LEAF_OPEN_DEG)), "XYZ")
    # Bake the swing into the leaf: keep world transforms, drop the parent so
    # the selection-only GLB export cannot depend on an unexported empty.
    bpy.ops.object.select_all(action="DESELECT")
    for name in leaf_ids:
        bpy.data.objects[name].select_set(True)
    bpy.context.view_layer.objects.active = hinge
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.data.objects.remove(hinge)


# ---------------------------------------------------------------------------------------------
# Census / export / thumbnail (identical contract to build_garden_set.py)
# ---------------------------------------------------------------------------------------------
def census() -> dict:
    # Direct loc/rot assignment leaves matrix_world stale until evaluated;
    # without this the census reads phantom bounds (AC wave-2 false 1.77 m).
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

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.001))
    ground = bpy.context.view_layer.objects.active
    ground.name = "ThumbGround"
    gmat = bpy.data.materials.new("ThumbGround")
    gmat.use_nodes = True
    bsdf = gmat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.42, 0.48, 0.30, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    ground.data.materials.append(gmat)

    bpy.ops.object.light_add(type="SUN", location=(4, -3, 6))
    sun = bpy.context.view_layer.objects.active
    sun.data.energy = 3.0
    bpy.ops.object.light_add(type="SUN", location=(-5, 4, 3))
    fill = bpy.context.view_layer.objects.active
    fill.data.energy = 0.6

    bpy.ops.object.empty_add(location=(0, 0, 0.9))
    target = bpy.context.view_layer.objects.active
    bpy.ops.object.camera_add(location=(4.4, -5.2, 2.5))
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

    wood_base = wood_image("FenceWoodBase", TEX_DIR / "fence_wood_basecolor.png",
                           (0.46, 0.34, 0.23), 0.35, 0.45, data=False)
    wood_rough = wood_image("FenceWoodRough", TEX_DIR / "fence_wood_roughness.png",
                            (0, 0, 0), 0.40, 0.0, data=True)

    wood = principled("FenceWood", (0.46, 0.34, 0.23), 0.0, 0.8,
                      rough_img=wood_rough, base_img=wood_base)
    metal = principled("FenceIron", (0.07, 0.07, 0.075), 0.85, 0.55)

    build_posts(wood, metal)
    build_fixed_bay("L", -2.7, -0.9, wood)
    build_fixed_bay("R", 0.9, 2.7, wood)
    build_gate_leaf(wood, metal)

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
              "materials": ["FenceWood", "FenceIron"],
              "textures": sorted(p.name for p in TEX_DIR.glob("fence_*.png")),
              "blend": str(BLEND_PATH.relative_to(REPO)).replace("\\", "/"),
              "glb": str(GLB_PATH.relative_to(REPO)).replace("\\", "/"),
              "glbBytes": GLB_PATH.stat().st_size,
              "thumb": str(THUMB_PATH.relative_to(REPO)).replace("\\", "/"),
              "thumbBytes": THUMB_PATH.stat().st_size}
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
