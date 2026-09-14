"""Shared deterministic authoring helpers for the world-studio nature kit.

Runs INSIDE Blender (``blender --background --factory-startup --threads 4 --python``).
All geometry is built from seeded integer hashes - no ``random``, no time, no
environment dependence, so a re-run is byte-identical. All texture maps are
synthesised in numpy at 256 px from tileable value-noise fBm (integer periods).

Conventions (verified against the Blender 5.1 glTF manual and the three r185
GLTFLoader source, see docs/technique-lab/nature/technique-notes.md):

  * base colour: sRGB PNG into Principled Base Color.
  * normal:      Non-Color PNG into a tangent-space Normal Map node.
  * roughness:   value packed into the GREEN channel of an RGB PNG (blue carries
                 metalness = 0) wired G->Roughness, B->Metalness so the exporter
                 copies the image verbatim.
  * alpha:       deliberately unused. Every leaf, frond and tuft is real
                 geometry, so nothing needs alpha sorting, MASK clipping or the
                 GLTFLoader transparent/depthWrite trade-off.
  * glTF export: Y-up, embedded PNGs, one mesh per asset, materials shared.

Presentation only: no collider, spawn, navigation or gameplay data is emitted.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

REPO = Path(__file__).resolve().parents[4]
NATURE_DIR = Path(__file__).resolve().parent
BLEND_DIR = NATURE_DIR / "source"
ASSET_DIR = REPO / "public" / "assets" / "world-studio" / "blender" / "nature"
SOURCE_ASSET_DIR = REPO / "source-assets" / "world-studio" / "nature"
SEED = 20260912
UV_SCALE = 1.0  # one texture tile spans one metre


# ---------------------------------------------------------------------------------------------
# Deterministic noise (numpy, tileable value-noise fBm with integer periods)
# ---------------------------------------------------------------------------------------------
def hash2(ix: np.ndarray, iy: np.ndarray, seed: int) -> np.ndarray:
    n = (ix.astype(np.uint64) * np.uint64(374761393)) + (iy.astype(np.uint64) * np.uint64(668265263))
    n = (n ^ (n >> np.uint64(13))) * np.uint64(1274126177)
    return (n & np.uint64(0xFFFFFFFF)).astype(np.float64) / 4294967295.0


def value_noise(u: np.ndarray, v: np.ndarray, period: int, seed: int) -> np.ndarray:
    assert float(period).is_integer(), "noise period must be an integer or the map goes NaN"
    u = u * period
    v = v * period
    ix = np.floor(u).astype(np.int64)
    iy = np.floor(v).astype(np.int64)
    fx = u - ix
    fy = v - iy
    sx = fx * fx * (3.0 - 2.0 * fx)
    sy = fy * fy * (3.0 - 2.0 * fy)
    ix0, iy0 = ix % period, iy % period
    ix1, iy1 = (ix + 1) % period, (iy + 1) % period
    n00 = hash2(ix0, iy0, seed)
    n10 = hash2(ix1, iy0, seed)
    n01 = hash2(ix0, iy1, seed)
    n11 = hash2(ix1, iy1, seed)
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy


def fbm(u: np.ndarray, v: np.ndarray, period: int, seed: int, octaves: int = 4) -> np.ndarray:
    total = np.zeros_like(u)
    norm = 0.0
    for o in range(octaves):
        total += value_noise(u, v, period * (2**o), seed + o * 101) / (2**o)
        norm += 1.0 / (2**o)
    return total / norm


def hrand(seed: int) -> float:
    """One deterministic float in [0,1) from an integer seed."""
    n = (seed * 2654435761) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n / 4294967296.0


# ---------------------------------------------------------------------------------------------
# Deterministic mesh accumulator
# ---------------------------------------------------------------------------------------------
class Builder:
    """Collects verts/faces/material indices/UVs/colours for one mesh. No global state."""

    def __init__(self) -> None:
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[list[int]] = []
        self.mats: list[int] = []
        self.uvs: list[list[tuple[float, float]]] = []
        self.colors: list[list[tuple[float, float, float]]] = []

    def add_vert(self, p) -> int:
        self.verts.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.verts) - 1

    def add_face(self, pts: list[int], mat: int, uv=None, color=None) -> None:
        self.faces.append(list(pts))
        self.mats.append(mat)
        self.uvs.append(uv or [((0.0, 0.0))] * len(pts))
        self.colors.append(color or [(1.0, 1.0, 1.0)] * len(pts))

    @property
    def tri_count(self) -> int:
        return sum(len(f) - 2 for f in self.faces)


def auto_uv(pts) -> list[tuple[float, float]]:
    """Planar projection on the face's dominant axis, metre-proportional at UV_SCALE."""
    a, b, c = pts[0], pts[1], pts[2]
    nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
    ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    u_ax = 0 if abs(nx) >= abs(ny) and abs(nx) >= abs(nz) else (1 if abs(ny) >= abs(nz) else 0)
    v_ax = 2 if u_ax != 2 else 1
    return [(p[u_ax] / UV_SCALE, p[v_ax] / UV_SCALE) for p in pts]


def tube(b: Builder, path, radii, sides: int, mat: int, color=(1.0, 1.0, 1.0),
         radial_ripple: float = 0.0, seed: int = SEED) -> list[int]:
    """Loft one capped tube along `path` with per-station radii. Returns ring tip vertex ids."""
    up = Vector((0.0, 0.0, 1.0))
    rings: list[list[int]] = []
    n_st = len(path)
    for si, (p, r) in enumerate(zip(path, radii)):
        tangent = (Vector(path[min(si + 1, n_st - 1)]) - Vector(path[max(si - 1, 0)])).normalized()
        ref = up if abs(tangent.dot(up)) < 0.9 else Vector((1.0, 0.0, 0.0))
        x_axis = tangent.cross(ref).normalized()
        y_axis = tangent.cross(x_axis).normalized()
        ring = []
        for k in range(sides):
            ang = 2.0 * math.pi * k / sides
            ripple = 1.0
            if radial_ripple > 0.0:
                ripple = 1.0 + radial_ripple * math.sin(ang * 3.0 + si * 1.7 + seed % 7)
            off = x_axis * (math.cos(ang) * r * ripple) + y_axis * (math.sin(ang) * r * ripple)
            ring.append(b.add_vert(Vector(p) + off))
        rings.append(ring)
    for si in range(n_st - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            quad = [rings[si][k], rings[si][k2], rings[si + 1][k2], rings[si + 1][k]]
            b.add_face(quad, mat, uv=auto_uv([b.verts[i] for i in quad]), color=[color] * 4)
    # tip cap: converge last ring to a centre point
    tip_centre = b.add_vert(path[-1])
    for k in range(sides):
        k2 = (k + 1) % sides
        b.add_face([rings[-1][k2], rings[-1][k], tip_centre], mat, color=[color] * 3)
    return rings[-1]


# ---------------------------------------------------------------------------------------------
# Textures
# ---------------------------------------------------------------------------------------------
def save_image(name: str, rgb: np.ndarray, out_dir: Path) -> Path:
    h, w, _ = rgb.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0.0, 1.0)
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels = rgba.ravel().tolist()
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    out_dir.mkdir(parents=True, exist_ok=True)
    img.save()
    bpy.data.images.remove(img)
    return out_dir / f"{name}.png"


def normal_from_height(height: np.ndarray, strength: float = 2.0) -> np.ndarray:
    """Tangent-space normal (OpenGL +Y up, as glTF expects) from a height field."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nz = np.ones_like(height)
    length = np.sqrt(dx * dx + dy * dy + 1.0)
    n = np.stack((-dx / length, -dy / length, nz / length), axis=-1)
    return n * 0.5 + 0.5


def orm_image(roughness: np.ndarray, metalness: float | np.ndarray = 0.0) -> np.ndarray:
    """Roughness in G, metalness in B, per the glTF metal/rough convention."""
    r = np.full_like(roughness, 1.0)  # occlusion unused; keep white
    g = np.clip(roughness, 0.0, 1.0)
    b = np.clip(np.broadcast_to(metalness, roughness.shape).astype(np.float64), 0.0, 1.0)
    return np.stack((r, g, b), axis=-1)


# ---------------------------------------------------------------------------------------------
# Materials (official glTF hookups; see module docstring)
# ---------------------------------------------------------------------------------------------
def _image_node(nt, image_path: Path, non_color: bool):
    img = bpy.data.images.load(str(image_path), check_existing=True)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    node.interpolation = "Linear"
    return node


def make_material(name: str, basecolor: Path | None, normal: Path | None, orm: Path | None,
                  base_tint=(1.0, 1.0, 1.0, 1.0), roughness: float = 0.85, metallic: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False  # export as doubleSided: blades and fronds need it
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base_tint[:3], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if basecolor is not None:
        node = _image_node(nt, basecolor, non_color=False)
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if normal is not None:
        node = _image_node(nt, normal, non_color=True)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.space = "TANGENT"
        nt.links.new(node.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if orm is not None:
        node = _image_node(nt, orm, non_color=True)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(node.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    return mat


# ---------------------------------------------------------------------------------------------
# Object assembly, export, render
# ---------------------------------------------------------------------------------------------
def to_object(name: str, b: Builder, mats: list):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([v for v in b.verts], [], [f for f in b.faces])
    mesh.validate()
    mesh.update()
    for i, _face in enumerate(b.faces):
        mesh.polygons[i].material_index = b.mats[i]
    # per-corner UVs
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            corner = list(poly.vertices).index(vi)
            uv_layer.data[li].uv = b.uvs[poly.index][corner]
    # per-corner colour attribute (exports as COLOR_0; three multiplies into base colour)
    if any(any(c != (1.0, 1.0, 1.0) for c in face) for face in b.colors):
        col = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                vi = mesh.loops[li].vertex_index
                corner = list(poly.vertices).index(vi)
                rgb = b.colors[poly.index][corner]
                col.data[li].color = (rgb[0], rgb[1], rgb[2], 1.0)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def smooth_by_angle(obj, angle_deg: float = 34.0) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg), keep_sharp_edges=True)


def export_glb(objs: list, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_lights=False,
        export_animations=False,
        export_extras=False,
    )


def render_thumbnail(out_png: Path, size: int = 256, samples: int = 24) -> None:
    """Small CPU render of the current scene's selected-ish contents: 4 threads, Cycles."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False

    # neutral world + key/fill so material value reads, per the ai-3d loop's fixed rig
    world = bpy.data.worlds.new("ThumbWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.45, 0.47, 0.50, 1.0)
    bg.inputs[1].default_value = 0.7
    scene.world = world

    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 3.0
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (math.radians(50), 0.0, math.radians(35))
    bpy.context.collection.objects.link(key_obj)
    fill = bpy.data.lights.new("Fill", type="AREA")
    fill.energy = 250.0
    fill.size = 6.0
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.location = (-4.0, -3.0, 3.5)
    fill_obj.rotation_euler = (math.radians(55), 0.0, math.radians(-55))
    bpy.context.collection.objects.link(fill_obj)

    # ground contact plane, matte, slightly warm
    ground = bpy.data.meshes.new("Ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20.0)
    bm.to_mesh(ground)
    bm.free()
    gmat = bpy.data.materials.new("GroundMat")
    gmat.use_nodes = True
    gb = gmat.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (0.42, 0.40, 0.36, 1.0)
    gb.inputs["Roughness"].default_value = 0.95
    ground.materials.append(gmat)
    ground_obj = bpy.data.objects.new("Ground", ground)
    bpy.context.collection.objects.link(ground_obj)

    # frame the union of mesh objects from a fixed three-quarter hero angle
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Ground"]
    pts: list[Vector] = []
    for o in meshes:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    if pts:
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        centre = (lo + hi) * 0.5
        radius = max(0.2, max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * 0.5)
    cam = bpy.data.cameras.new("ThumbCam")
    cam.lens = 50.0
    cam_obj = bpy.data.objects.new("ThumbCam", cam)
    direction = Vector((1.0, -1.35, 0.55)).normalized()
    cam_obj.location = centre + direction * (radius * 3.1)
    look = centre - cam_obj.location
    cam_obj.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    out_png.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_png)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def print_report(payload: dict) -> None:
    print("BUILD_REPORT " + json.dumps(payload))


def ground_clamp_min_z(b: Builder, min_z: float) -> None:
    """Translate the accumulated verts so the lowest vertex sits at min_z (slight sink)."""
    lo = min(v[2] for v in b.verts)
    dz = min_z - lo
    if abs(dz) > 1e-9:
        b.verts = [(v[0], v[1], v[2] + dz) for v in b.verts]
