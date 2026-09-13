"""Author the Nuketown garden table/chairs + red parasol set and export a runtime GLB.

Concept: yellow-backyard image (codex-clipboard-b6a7a535): round dark patio table
with four dark armchairs and a red canopy parasol through the table centre, sitting
on a wooden deck. Modelled at real scale, metres, ground at Z = 0, set centred on
the origin so placement lives in the TS helper, not the mesh.

Reused exact shared techniques (see docs/technique-lab/props/skill-receipt.md):
- Builder-free deterministic primitive authoring with applied bevel modifiers for
  bevelled silhouettes (pattern: scripts/blender/world-studio/build_hero_bus.py,
  chamfer_box / shade_smooth_by_angle / metric units / BUILD_REPORT census).
- CPU-synthesised tileable weave/fBm maps via numpy (pattern: make_body_maps).
Runs headless: blender --background --threads 4 --python build_garden_set.py
Renders one 512x384 CPU Cycles thumbnail (fixed 4 threads) of the actual asset.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Vector

REPO = Path(__file__).resolve().parents[4]
ASSET_DIR = REPO / "public" / "assets" / "world-studio" / "blender" / "props"
BLEND_PATH = REPO / "source-assets" / "world-studio" / "props" / "garden-set.blend"
GLB_PATH = ASSET_DIR / "garden-set.glb"
THUMB_PATH = ASSET_DIR / "garden-set-thumb.png"
TEX_DIR = ASSET_DIR / "textures"

SEED = 20260912

# ---------------------------------------------------------------------------------------------
# Frozen dimensions (metres). Round table seats four; parasol shades the whole set.
# ---------------------------------------------------------------------------------------------
TABLE_TOP_R = 0.55
TABLE_TOP_Z = 0.735
TABLE_TOP_T = 0.035
CHAIR_RING_R = 1.02          # chair centre distance from set centre
PARASOL_EAVE_R = 1.32        # canopy radius: covers table + chair backs
PARASOL_EAVE_Z = 1.98
PARASOL_APEX_Z = 2.34
POLE_R = 0.024

PROP_NAMES: list[str] = []


# ---------------------------------------------------------------------------------------------
# Small helpers
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
    bpy.ops.object.transform_apply(scale=True)
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
# CPU texture synthesis (tileable by construction: integer weave periods)
# ---------------------------------------------------------------------------------------------
def weave_image(name: str, path: Path, base: tuple[float, float, float],
                amp: float, cells: int, data: bool) -> bpy.types.Image:
    """Plain-weave variation map. Colour when data=False, roughness when data=True."""
    n = 256
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    warp = ((xx // (n // cells)) + (yy // (n // cells))) % 2
    weft = (xx % (n // cells)) / (n // cells)
    v = 0.5 + (warp - 0.5) * 2.0 * amp + (weft - 0.5) * amp * 0.5
    if data:
        rgb = np.stack([v, v, v], axis=-1)
    else:
        rgb = np.stack([np.full_like(v, base[0]) * (0.92 + 0.16 * v),
                        np.full_like(v, base[1]) * (0.92 + 0.16 * v),
                        np.full_like(v, base[2]) * (0.92 + 0.16 * v)], axis=-1)
    rgba = np.dstack([np.clip(rgb, 0.0, 1.0), np.ones_like(v)])[..., :4]
    img = bpy.data.images.new(name, n, n)
    img.pixels = rgba.reshape(-1).tolist()
    img.file_format = "PNG"
    img.filepath_raw = str(path)
    img.save()
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    img.use_fake_user = True
    return img


def fbm_rough_image(name: str, path: Path, base: float, var: float) -> bpy.types.Image:
    """Brushed-metal roughness: low-frequency fBm bands, tileable via integer lattice."""
    n = 256
    rng = np.random.default_rng(SEED)
    lattice = rng.random((8, 8))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64) / n * 8.0
    x0, y0 = xx.astype(int) % 8, yy.astype(int) % 8
    fx, fy = xx - xx.astype(int), yy - yy.astype(int)
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    v = (lattice[x0, y0] * (1 - sx) + lattice[(x0 + 1) % 8, y0] * sx) * (1 - sy) + \
        (lattice[x0, (y0 + 1) % 8] * (1 - sx) + lattice[(x0 + 1) % 8, (y0 + 1) % 8] * sx) * sy
    # Horizontal brushing: stretch detail along x.
    streak = 0.5 + 0.5 * np.sin(2 * np.pi * (yy * 24.0 / n + v * 2.0))
    r = np.clip(base + (v - 0.5) * var + (streak - 0.5) * var * 0.5, 0.05, 1.0)
    rgba = np.dstack([r, r, r, np.ones_like(r)])
    img = bpy.data.images.new(name, n, n)
    img.pixels = rgba.reshape(-1).tolist()
    img.file_format = "PNG"
    img.filepath_raw = str(path)
    img.save()
    img.colorspace_settings.name = "Non-Color"
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
def build_table(metal, _fabric) -> None:
    top = cylinder("TableTop", (0, 0, TABLE_TOP_Z), TABLE_TOP_R, TABLE_TOP_T, 48)
    assign(top, metal)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=TABLE_TOP_R, minor_radius=0.018, location=(0, 0, TABLE_TOP_Z))
    rim = bpy.context.view_layer.objects.active
    rim.name = "TableRim"
    PROP_NAMES.append("TableRim")
    assign(rim, metal)
    column = cylinder("TableColumn", (0, 0, 0.36), 0.05, 0.68)
    assign(column, metal)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        foot = box(f"TableFoot{i}", (0.30 * math.cos(a), 0.30 * math.sin(a), 0.025),
                   (0.55, 0.07, 0.05), 0.008)
        foot.rotation_euler = Euler((0, 0, a), "XYZ")
        assign(foot, metal)


def build_chair(tag: str, angle_deg: float, metal, fabric) -> None:
    """One armchair in local space (+Y faces the table), then placed on the ring."""
    a = math.radians(angle_deg)
    cx, cy = CHAIR_RING_R * math.cos(a), CHAIR_RING_R * math.sin(a)
    yaw = a - math.pi / 2.0  # face the centre

    def place(obj, lx: float, ly: float, lz: float, tilt_x: float = 0.0):
        wx = cx + lx * math.cos(a + math.pi / 2.0) - ly * math.cos(a)
        wy = cy + lx * math.sin(a + math.pi / 2.0) - ly * math.sin(a)
        obj.location = (wx, wy, lz)
        obj.rotation_euler = Euler((tilt_x, 0, yaw + math.pi / 2.0), "XYZ")

    parts = []
    seat_frame = box(f"Chair{tag}SeatFrame", (0, 0, 0), (0.58, 0.54, 0.05))
    parts.append((seat_frame, 0.0, 0.0, 0.44, 0.0, metal))
    seat_pad = box(f"Chair{tag}SeatPad", (0, 0, 0), (0.52, 0.47, 0.07), 0.020)
    parts.append((seat_pad, 0.0, 0.01, 0.50, 0.0, fabric))
    back_frame = box(f"Chair{tag}BackFrame", (0, 0, 0), (0.56, 0.05, 0.58))
    parts.append((back_frame, 0.0, -0.27, 0.76, -0.14, metal))
    back_pad = box(f"Chair{tag}BackPad", (0, 0, 0), (0.48, 0.06, 0.46), 0.020)
    parts.append((back_pad, 0.0, -0.245, 0.75, -0.14, fabric))
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        leg = cylinder(f"Chair{tag}Leg{i}", (0, 0, 0), 0.024, 0.44)
        parts.append((leg, 0.24 * sx, 0.21 * sy, 0.22, 0.0, metal))
    for s in (-1, 1):
        arm = box(f"Chair{tag}Arm{('L' if s < 0 else 'R')}", (0, 0, 0), (0.06, 0.50, 0.05))
        parts.append((arm, 0.30 * s, -0.01, 0.64, 0.0, metal))
        post = box(f"Chair{tag}ArmPost{('L' if s < 0 else 'R')}", (0, 0, 0),
                   (0.05, 0.05, 0.18), 0.006)
        parts.append((post, 0.30 * s, 0.19, 0.53, 0.0, metal))
    for obj, lx, ly, lz, tilt, mat in parts:
        place(obj, lx, ly, lz, tilt)
        assign(obj, mat)


def build_parasol(metal, canopy, _fabric) -> None:
    pole = cylinder("ParasolPole", (0, 0, 1.175), POLE_R, 2.35)
    assign(pole, metal)
    base = cylinder("ParasolBase", (0, 0, 0.035), 0.28, 0.07, 32)
    assign(base, metal)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=PARASOL_EAVE_R, radius2=0.03,
                                    depth=PARASOL_APEX_Z - PARASOL_EAVE_Z,
                                    location=(0, 0, (PARASOL_EAVE_Z + PARASOL_APEX_Z) / 2.0),
                                    rotation=(0, 0, math.radians(22.5)))
    shade = bpy.context.view_layer.objects.active
    shade.name = "ParasolCanopy"
    PROP_NAMES.append("ParasolCanopy")
    active(shade)
    sol = shade.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.012
    sol.offset = -1.0
    bpy.ops.object.modifier_apply(modifier=sol.name)
    smooth(shade, 30.0)
    assign(shade, canopy)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=PARASOL_EAVE_R, depth=0.13,
                                        location=(0, 0, PARASOL_EAVE_Z - 0.055),
                                        rotation=(0, 0, math.radians(22.5)))
    valance = bpy.context.view_layer.objects.active
    valance.name = "ParasolValance"
    PROP_NAMES.append("ParasolValance")
    bm = bmesh.new()
    bm.from_mesh(valance.data)
    caps = [f for f in bm.faces if abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=caps, context="FACES")
    bm.to_mesh(valance.data)
    bm.free()
    assign(valance, canopy)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(0, 0, PARASOL_APEX_Z + 0.03))
    finial = bpy.context.view_layer.objects.active
    finial.name = "ParasolFinial"
    PROP_NAMES.append("ParasolFinial")
    assign(finial, metal)
    crank = box("ParasolCrank", (0.055, 0, 1.10), (0.07, 0.05, 0.09), 0.006)
    assign(crank, metal)


# ---------------------------------------------------------------------------------------------
# Census / export / thumbnail
# ---------------------------------------------------------------------------------------------
def census() -> dict:
    tris, verts, objs = 0, 0, 0
    mins = [math.inf] * 3
    maxs = [-math.inf] * 3
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

    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, -0.001))
    ground = bpy.context.view_layer.objects.active
    ground.name = "ThumbGround"
    gmat = bpy.data.materials.new("ThumbGround")
    gmat.use_nodes = True
    bsdf = gmat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.55, 0.53, 0.48, 1.0)
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
    bpy.ops.object.camera_add(location=(3.4, -3.6, 2.3))
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


    red_base = weave_image("ParasolWeave", TEX_DIR / "parasol_red_basecolor.png",
                           (0.60, 0.07, 0.09), 0.10, 48, data=False)
    red_rough = weave_image("ParasolWeaveRough", TEX_DIR / "parasol_red_roughness.png",
                            (0, 0, 0), 0.10, 48, data=True)
    char_rough = weave_image("ChairWeaveRough", TEX_DIR / "chair_char_roughness.png",
                             (0, 0, 0), 0.12, 40, data=True)
    metal_rough = fbm_rough_image("MetalBrushRough", TEX_DIR / "metal_bronze_roughness.png",
                                  0.52, 0.22)

    metal = principled("BronzeMetal", (0.10, 0.085, 0.075), 0.85, 0.5, rough_img=metal_rough)
    fabric = principled("CharSling", (0.085, 0.085, 0.09), 0.0, 0.9, rough_img=char_rough)
    canopy = principled("ParasolRed", (0.60, 0.07, 0.09), 0.0, 0.85,
                        rough_img=red_rough, base_img=red_base)

    build_table(metal, fabric)
    for tag, ang in (("A", 25.0), ("B", 115.0), ("C", 205.0), ("D", 295.0)):
        build_chair(tag, ang, metal, fabric)
    build_parasol(metal, canopy, fabric)

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
              "materials": ["BronzeMetal", "CharSling", "ParasolRed"],
              "textures": sorted(p.name for p in TEX_DIR.glob("*.png")),
              "blend": str(BLEND_PATH.relative_to(REPO)).replace("\\", "/"),
              "glb": str(GLB_PATH.relative_to(REPO)).replace("\\", "/"),
              "glbBytes": GLB_PATH.stat().st_size,
              "thumb": str(THUMB_PATH.relative_to(REPO)).replace("\\", "/"),
              "thumbBytes": THUMB_PATH.stat().st_size}
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
