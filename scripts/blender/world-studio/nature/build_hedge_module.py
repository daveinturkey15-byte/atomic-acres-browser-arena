"""Author the world-studio hedge module and export runtime glTF binaries.

Runs INSIDE Blender via launch_nature.py (``--background --factory-startup --threads 4``).

Design (dry-suburb/mountain concept): a 1.98 m clipped boxwood hedge MODULE with
actual clustered leaves, not a solid green block. A noise-displaced, domed core
mass breaks the box read; ~2,200 real geometry leaves (2 tris each) stud the whole
surface, oriented along the local outward normal with seeded yaw/pitch jitter and
per-leaf tone variation via COLOR_0. The dark-toned core reads as hedge shadow in
the gaps. One leaf material + one core material are shared across the whole module;
the runtime proposal (src/world-studio/nature-assets) instances the module along
hedge runs instead of re-authoring geometry per run.

The existing procedural hedge (src/world-studio/nature/gardens.ts) is a displaced
box with a canvas sprig texture; this module replaces the *read* with real leaf
silhouette while keeping the placement contract (knee-height run, presentation
only, no collision) a loader decision for root.

Method atoms applied:
  * ai-3d-asset-generation-loop: code-only procedural route; CPU verification loop.
  * threejs-procedural-vegetation (register row 38): species parameter sets so one
    material serves the whole plant; deterministic seeded scatter.
  * Blender 5.1 glTF manual: official material hookups (nature_common docstring).

Presentation only: no collider, spawn or navigation data is emitted.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nature_common import (  # noqa: E402
    ASSET_DIR,
    BLEND_DIR,
    Builder,
    SEED,
    auto_uv,
    export_glb,
    fbm,
    hrand,
    make_material,
    normal_from_height,
    orm_image,
    print_report,
    render_thumbnail,
    save_image,
    sha256_file,
    smooth_by_angle,
    to_object,
)

import bpy  # noqa: E402

REPO = Path(__file__).resolve().parents[4]

# Frozen spec. Metres. Run module: X = along the hedge, Y = depth, Z = up, origin
# at bottom centre of the run.
RUN_LENGTH = 1.98
DEPTH = 0.44
HEIGHT = 0.50  # knee height, matching the existing hedge placement contract
CORNER_R = 0.13
RING_POINTS = 28
CORE_STATIONS = 14
CORE_STATIONS_LOD1 = 10
LEAF_LOD0 = 2200
LEAF_LOD1 = 900
LEAF_SIZE = (0.034, 0.021)  # length, width
LEAF_PROTRUDE = (0.012, 0.026)  # offset range outside the core surface
M_CORE, M_LEAF = 0, 1
CORE_TONE = (0.34, 0.40, 0.30)  # dark multiplier: core reads as shadow in the gaps


def perimeter_segments():
    """Table of (length, point_fn, normal) walking the rounded-rect cross-section.

    Cross-section lives in the (y, z) plane, centred on (0, HEIGHT/2). CCW walk so
    the outward normal is (cos a, sin a) on arcs and axis-aligned on edges.
    """
    w, d, r = DEPTH / 2.0, HEIGHT / 2.0, CORNER_R
    sy, sz = w - r, d - r
    arc = math.pi * r / 2.0
    segs: list[tuple[float, object, tuple[float, float]]] = [
        (2 * sy, lambda s: (-sy + s, d), (0.0, 1.0)),                      # top
        (arc, lambda s: _arc((sy, sz), r, math.pi / 2 - s / r), None),      # NE arc
        (2 * sz, lambda s: (w, sz - s), (1.0, 0.0)),                        # right
        (arc, lambda s: _arc((sy, -sz), r, -s / r), None),                  # SE arc
        (2 * sy, lambda s: (sy - s, -d), (0.0, -1.0)),                      # bottom
        (arc, lambda s: _arc((-sy, -sz), r, -math.pi / 2 - s / r), None),   # SW arc
        (2 * sz, lambda s: (-w, -sz + s), (-1.0, 0.0)),                     # left
        (arc, lambda s: _arc((-sy, sz), r, math.pi - s / r), None),         # NW arc
    ]
    return segs


def _arc(centre: tuple[float, float], r: float, a: float) -> tuple[float, float]:
    return (centre[0] + r * math.cos(a), centre[1] + r * math.sin(a))


PERIMETER_TOTAL = sum(seg[0] for seg in perimeter_segments())


def perimeter_point(t: float) -> tuple[float, float, float, float]:
    """Point (y, z) + outward (ny, nz) on the cross-section at parameter t in [0,1)."""
    dist = (t % 1.0) * PERIMETER_TOTAL
    for length, fn, normal in perimeter_segments():
        if dist < length:
            if normal is None:  # arc: derive the normal from the centre
                py, pz = fn(dist)
                sy = DEPTH / 2.0 - CORNER_R
                sz = HEIGHT / 2.0 - CORNER_R
                cy = sy if py > 0 else -sy
                cz = sz if pz > HEIGHT / 2.0 else -sz
                ny, nz = py - cy, pz - cz
                nl = math.hypot(ny, nz)
                return py, pz, ny / nl, nz / nl
            py, pz = fn(dist)
            return py, pz, normal[0], normal[1]
        dist -= length
    return (DEPTH / 2.0 - CORNER_R, HEIGHT / 2.0, 0.0, 1.0)


def core_surface_point(x: float, t: float) -> tuple[Vector, Vector]:
    """Core surface point and outward normal at run position x, cross-section t."""
    py, pz, ny, nz = perimeter_point(t)
    dome = 1.0 - 0.20 * (2.0 * x / RUN_LENGTH) ** 2  # slight longitudinal dome
    ripple = (fbm(np.array([(x / 0.45) % 1.0]), np.array([t % 1.0]), 4, SEED + 11, 3)[0] - 0.5)
    bulge = ripple * 0.035
    n = Vector((0.0, ny + bulge * 8.0, nz)).normalized()
    p = Vector((x, (py + ny * bulge) * dome, (pz + nz * bulge)))
    return p, n


def build_core(b: Builder, mat: int, stations: int) -> None:
    """Rounded, noise-displaced core prism lofted along the run, fan-capped ends."""
    ring: list[list[int]] = []
    for i in range(stations + 1):
        x = -RUN_LENGTH / 2.0 + RUN_LENGTH * i / stations
        station: list[int] = []
        for j in range(RING_POINTS):
            p, _n = core_surface_point(x, j / RING_POINTS)
            station.append(b.add_vert(p))
        ring.append(station)
    for i in range(stations):
        for j in range(RING_POINTS):
            j2 = (j + 1) % RING_POINTS
            quad = [ring[i][j2], ring[i][j], ring[i + 1][j], ring[i + 1][j2]]
            pts = [b.verts[v] for v in quad]
            b.add_face(quad, mat, uv=auto_uv(pts), color=[CORE_TONE] * 4)
    for i in (0, stations):
        cx = b.verts[ring[i][0]][0]
        centre = b.add_vert((cx, 0.0, HEIGHT / 2.0))
        for j in range(RING_POINTS):
            j2 = (j + 1) % RING_POINTS
            tri = ([centre, ring[i][j], ring[i][j2]] if i == 0
                   else [centre, ring[i][j2], ring[i][j]])
            b.add_face(tri, mat, color=[CORE_TONE] * 3)


def build_leaves(b: Builder, mat: int, count: int, seed: int) -> None:
    """Scatter real-geometry leaves over the core surface with deterministic jitter."""
    z_axis = Vector((0.0, 0.0, 1.0))
    for i in range(count):
        r1 = hrand(seed + i * 4)
        r2 = hrand(seed + i * 4 + 1)
        r3 = hrand(seed + i * 4 + 2)
        r4 = hrand(seed + i * 4 + 3)
        x = -RUN_LENGTH / 2.0 + RUN_LENGTH * r1
        p, n = core_surface_point(x, r2)
        p = p + n * (LEAF_PROTRUDE[0] + (LEAF_PROTRUDE[1] - LEAF_PROTRUDE[0]) * r3)
        # leaf frame: long axis out along the normal, jittered yaw about Z then pitch
        yaw = Matrix.Rotation((r4 - 0.5) * math.radians(70.0), 4, "Z")
        long_dir = (yaw @ n).normalized()
        side = long_dir.cross(z_axis)
        if side.length < 1e-4:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        pitch = Matrix.Rotation((hrand(seed + i * 4 + 1) - 0.5) * math.radians(40.0), 4, side)
        long_dir = (pitch @ long_dir).normalized()
        width = long_dir.cross(z_axis)
        if width.length < 1e-4:
            width = Vector((1.0, 0.0, 0.0))
        width = width.normalized() * (LEAF_SIZE[1] * 0.5)
        droop = -0.25 * LEAF_SIZE[0]
        base_l = p - width
        base_r = p + width
        mid = p + long_dir * (LEAF_SIZE[0] * 0.5)
        tip = p + long_dir * LEAF_SIZE[0] + Vector((0.0, 0.0, droop))
        mid_l = mid - width * 0.85
        mid_r = mid + width * 0.85
        # per-leaf tone: hash-varied green multiplier, darker toward the hedge foot
        tone_v = 0.80 + hrand(seed + i * 4 + 2) * 0.42
        foot = 0.84 if p.z < HEIGHT * 0.3 else 1.0
        tone = (0.42 * tone_v * foot, 0.55 * tone_v * foot, 0.28 * tone_v * foot)
        v0, v1, v2, v3 = (b.add_vert(base_l), b.add_vert(base_r), b.add_vert(mid_r), b.add_vert(mid_l))
        v4 = b.add_vert(tip)
        uv_leaf = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.5), (0.0, 0.5)]
        b.add_face([v0, v1, v2, v3], mat, uv=uv_leaf, color=[tone] * 4)
        b.add_face([v3, v2, v4], mat, uv=[(0.0, 0.5), (1.0, 0.5), (0.5, 1.0)], color=[tone] * 3)


def make_hedge_maps(size: int = 256) -> dict:
    """Leaf basecolour: green blotch variation + faint midrib; gentle wax normal."""
    u = np.linspace(0.0, 1.0, size, endpoint=False)
    v = np.linspace(0.0, 1.0, size, endpoint=False)
    uu, vv = np.meshgrid(u, v)
    lo = np.array((0.16, 0.28, 0.10))
    hi = np.array((0.36, 0.52, 0.20))
    blotch = fbm(uu, vv, 6, SEED + 21, octaves=4)
    rib = np.exp(-(((vv - 0.5) ** 2) / 0.004)) * 0.10
    rgb = lo + (hi - lo) * blotch[..., None] - rib[..., None]
    height = fbm(uu, vv, 6, SEED + 22, octaves=3) * 0.5
    rough = np.clip(0.50 + blotch * 0.20, 0.4, 0.75)
    return {
        "hedge-leaf-basecolor": np.clip(rgb, 0.0, 1.0),
        "hedge-leaf-normal": normal_from_height(height, strength=1.2),
        "hedge-leaf-orm": orm_image(rough, metalness=0.0),
    }


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    maps = make_hedge_maps(256)
    paths = {k: save_image(k, img, ASSET_DIR / "textures") for k, img in maps.items()}
    mats = [
        make_material("HedgeCore", paths["hedge-leaf-basecolor"], paths["hedge-leaf-normal"],
                      paths["hedge-leaf-orm"], roughness=0.8),
        make_material("HedgeLeaf", paths["hedge-leaf-basecolor"], paths["hedge-leaf-normal"],
                      paths["hedge-leaf-orm"], roughness=0.6),
    ]

    def build(tag: str, leaf_count: int, stations: int):
        b = Builder()
        build_core(b, M_CORE, stations)
        build_leaves(b, M_LEAF, leaf_count, SEED + 31)
        obj = to_object(f"NatureHedgeModule{tag}", b, mats)
        smooth_by_angle(obj, 50.0)
        return obj

    lod0 = build("Lod0", LEAF_LOD0, CORE_STATIONS)
    lod1 = build("Lod1", LEAF_LOD1, CORE_STATIONS_LOD1)

    stats = {}
    for obj, tag in ((lod0, "lod0"), (lod1, "lod1")):
        obj.data.calc_loop_triangles()
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        stats[tag] = {
            "triangles": len(obj.data.loop_triangles),
            "verts": len(obj.data.vertices),
            "runLength": round(max(p[0] for p in bb) - min(p[0] for p in bb), 4),
            "height": round(max(p[2] for p in bb), 4),
        }

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "hedge-module.blend"), compress=False)

    glb0 = ASSET_DIR / "hedge-module.glb"
    glb1 = ASSET_DIR / "hedge-module-lod1.glb"
    export_glb([lod0], glb0)
    export_glb([lod1], glb1)
    thumb = ASSET_DIR / "thumbs" / "hedge-module.png"
    render_thumbnail(thumb)

    print_report({
        "asset": "hedge-module",
        "seed": SEED,
        "lod0": stats["lod0"],
        "lod1": stats["lod1"],
        "leafCount": {"lod0": LEAF_LOD0, "lod1": LEAF_LOD1},
        "materials": [m.name for m in mats],
        "textures": {k: str(p.relative_to(REPO)).replace("\\", "/") for k, p in paths.items()},
        "glb": str(glb0.relative_to(REPO)).replace("\\", "/"),
        "glbLod1": str(glb1.relative_to(REPO)).replace("\\", "/"),
        "glbSha256": sha256_file(glb0),
        "glbLod1Sha256": sha256_file(glb1),
        "glbBytes": glb0.stat().st_size,
        "thumbnail": str(thumb.relative_to(REPO)).replace("\\", "/"),
    })


if __name__ == "__main__":
    main()
