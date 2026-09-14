"""Author the world-studio Joshua tree and export runtime glTF binaries.

Runs INSIDE Blender via launch_nature.py (``--background --factory-startup --threads 4``).

Design (dry-suburb/mountain concept: Yucca Valley street with Joshua trees against
rocky mountains): a Yucca brevifolia silhouette - a short fuzzy trunk forking into
a few up-reaching arms, each tipped with a dense radial rosette of stiff, slightly
recurved dagger leaves. Real geometry everywhere: trunk/arms are noise-displaced
tapered tubes with a fibrous bark material; leaves are bent 5-tri blades with a
lengthwise midrib read. Two materials shared across the whole tree (bark, leaf);
per-rosette tone variation rides COLOR_0. Scale: 4.2 m tall, 2.8 m crown.

Method atoms applied:
  * ai-3d-asset-generation-loop: code-only procedural route; CPU verification loop.
  * threejs-procedural-vegetation: deterministic seeded branching + radial rosette
    layout (golden-angle leaf stagger, per-leaf deterministic jitter).
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
    tube,
)

import bpy  # noqa: E402

REPO = Path(__file__).resolve().parents[4]

# Frozen spec. Metres.
TRUNK_H = 1.55
TRUNK_R0, TRUNK_R1 = 0.17, 0.115
SIDES = 9
SIDES_LOD1 = 7
ARMS = [
    # (azimuth, tilt from vertical, length, fork?)
    (0.0, math.radians(18), 1.35, True),
    (2.1, math.radians(30), 1.15, True),
    (4.2, math.radians(24), 1.25, False),
    (1.05, math.radians(38), 0.95, False),
    (3.15, math.radians(33), 1.05, False),
]
FORK_T = 0.62  # fork position along the parent arm
FORK_SPREAD = math.radians(22)
LEAVES_PER_ROSETTE = 34
LEAVES_PER_ROSETTE_LOD1 = 20
LEAF_LEN = (0.20, 0.30)  # min/max blade length
M_BARK, M_LEAF = 0, 1
BARK_TONE = (1.0, 1.0, 1.0)
Z_AXIS = Vector((0.0, 0.0, 1.0))


def dir_from(azimuth: float, tilt: float) -> Vector:
    return Vector((math.sin(tilt) * math.cos(azimuth), math.sin(tilt) * math.sin(azimuth),
                   math.cos(tilt)))


def path_along(start: Vector, direction: Vector, length: float, bend: float,
               stations: int) -> list[Vector]:
    """Bent path: start, mid (bent by `bend` sideways), tip (rebending toward vertical)."""
    side = direction.cross(Z_AXIS)
    if side.length < 1e-5:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    pts = []
    for i in range(stations + 1):
        t = i / stations
        p = start + direction * (length * t)
        p += side * (bend * length * math.sin(math.pi * t))
        if t > 0.0:  # tips re-reach for the light
            p += Z_AXIS * (0.10 * length * t * t)
        pts.append(p)
    return pts

def radii_for(r0: float, r1: float, stations: int) -> list[float]:
    return [r0 + (r1 - r0) * (i / stations) ** 0.9 for i in range(stations + 1)]


def build_segment(b: Builder, start: Vector, direction: Vector, length: float, r0: float,
                  r1: float, mat: int, sides: int, seed: int) -> Vector:
    """One tapered bark tube; returns the tip (rosette anchor)."""
    stations = 4
    path = path_along(start, direction, length, 0.12 + hrand(seed) * 0.10, stations)
    radii = radii_for(r0, r1, stations)
    rings = tube(b, path, radii, sides, mat, color=BARK_TONE, radial_ripple=0.10, seed=seed)
    return Vector(path[-1])


def build_rosette(b: Builder, anchor: Vector, tip_dir: Vector, mat: int, count: int,
                  seed: int, scale: float = 1.0) -> None:
    """Radial rosette of stiff, slightly recurved dagger leaves with a midrib read."""
    base = tip_dir
    if base.z < 0.35:
        base = Vector((base.x, base.y, 0.35)).normalized()
    side0 = base.cross(Z_AXIS)
    if side0.length < 1e-4:
        side0 = Vector((1.0, 0.0, 0.0))
    side0.normalize()
    up0 = side0.cross(base).normalized()
    rosette_tone_v = 0.88 + hrand(seed) * 0.24
    for k in range(count):
        golden = k * math.pi * (3.0 - math.sqrt(5.0))
        yaw = Matrix.Rotation(golden, 4, base)
        tilt = math.radians(18.0 + 44.0 * hrand(seed + k * 7 + 1))
        side = leaf_dir.cross(Z_AXIS)
        if side.length < 1e-4:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        length = (LEAF_LEN[0] + (LEAF_LEN[1] - LEAF_LEN[0]) * hrand(seed + k * 7 + 2)) * scale
        width = 0.026 * scale
        # blade: 2 quads + tip tri, drooping along its length (recurved dagger)
        w0 = side * (width * 0.5)
        p0 = anchor
        p1 = anchor + leaf_dir * (length * 0.45) + Z_AXIS * (length * 0.10)
        p2 = anchor + leaf_dir * (length * 0.85) - Z_AXIS * (length * 0.06)
        p3 = anchor + leaf_dir * length - Z_AXIS * (length * 0.22)
        tone_v = (0.80 + hrand(seed + k * 7 + 3) * 0.40) * rosette_tone_v
        tone = (0.34 * tone_v, 0.42 * tone_v, 0.22 * tone_v)
        hw = width * 0.5
        taper = [1.0, 0.85, 0.55]
        v_a = b.add_vert(p0 - w0)
        v_b = b.add_vert(p0 + w0)
        v_c = b.add_vert(p1 + w0 * taper[1])
        v_d = b.add_vert(p1 - w0 * taper[1])
        v_e = b.add_vert(p2 + w0 * taper[2])
        v_f = b.add_vert(p2 - w0 * taper[2])
        v_g = b.add_vert(p3)
        uvq = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.45), (0.0, 0.45)]
        b.add_face([v_a, v_b, v_c, v_d], mat, uv=uvq, color=[tone] * 4)
        b.add_face([v_d, v_c, v_e, v_f], mat, uv=[(0.0, 0.45), (1.0, 0.45), (1.0, 0.8), (0.0, 0.8)],
                   color=[tone] * 4)
        b.add_face([v_f, v_e, v_g], mat, uv=[(0.0, 0.8), (1.0, 0.8), (0.5, 1.0)], color=[tone] * 3)


def build_tree(b: Builder, mat_bark: int, mat_leaf: int, sides: int, leaves: int) -> None:
    seed_top = build_segment(
        b, Vector((0.0, 0.0, 0.0)), dir_from(0.0, math.radians(2)), TRUNK_H,
        TRUNK_R0, TRUNK_R1, mat_bark, sides, SEED)
    # a second short trunk limb keeps the base from reading as a pole
    build_segment(
        b, Vector((0.02, 0.03, TRUNK_H * 0.28)), dir_from(5.1, math.radians(26)), TRUNK_H * 0.62,
        TRUNK_R1 * 0.9, TRUNK_R1 * 0.62, mat_bark, sides, SEED + 5)
    build_rosette(b, seed_top, Vector((0.05, 0.02, 1.0)).normalized(), mat_leaf, leaves, SEED + 1, 0.9)
    for i, (az, tilt, length, fork) in enumerate(ARMS):
        arm_seed = SEED + 10 + i * 13
        d = dir_from(az, tilt)
        start = Vector((0.0, 0.0, TRUNK_H * (0.82 + 0.16 * hrand(arm_seed))))
        r0 = TRUNK_R1 * (0.92 - 0.1 * (i % 2))
        if fork:
            fork_t = FORK_T
            fork_seed = arm_seed + 100
            d_f0 = dir_from(az - FORK_SPREAD / 0.02, tilt + FORK_SPREAD)
            d_f0 = dir_from(az - 0.42, tilt + FORK_SPREAD)
            d_f1 = dir_from(az + 0.42, tilt + FORK_SPREAD * 1.2)
            mid = start + d * (length * fork_t)
            len_rest = length * (1.0 - fork_t)
            build_segment(b, mid, d_f0, len_rest, r0 * 0.72, r0 * 0.45, mat_bark, sides, fork_seed)
            tip_f = build_segment(b, mid, d_f1, len_rest * 0.92, r0 * 0.72, r0 * 0.45,
                                  mat_bark, sides, fork_seed + 1)
            build_rosette(b, mid, d_f0, mat_leaf, max(8, leaves // 2), fork_seed + 2, 0.8)
            build_rosette(b, tip_f, d_f1, mat_leaf, leaves, fork_seed + 3, 0.95)
        else:
            tip = build_segment(b, start, d, length, r0, r0 * 0.5, mat_bark, sides, arm_seed)
            build_rosette(b, tip, d, mat_leaf, leaves, arm_seed + 1, 1.0)


def make_tree_maps(size: int = 256) -> dict:
    """Fibrous grey-brown bark (vertical striation) + sage leaf with midrib."""
    u = np.linspace(0.0, 1.0, size, endpoint=False)
    v = np.linspace(0.0, 1.0, size, endpoint=False)
    uu, vv = np.meshgrid(u, v)
    # bark: striations stretched along v (trunk axis)
    strip = fbm(uu * 3.0 % 1.0, vv, 6, SEED + 41, octaves=4)
    bark_lo = np.array((0.28, 0.25, 0.22))
    bark_hi = np.array((0.44, 0.40, 0.35))
    bark_rgb = bark_lo + (bark_hi - bark_lo) * strip[..., None]
    bark_h = strip * 1.0
    bark_rough = np.clip(0.85 + strip * 0.12, 0.7, 0.98)
    # leaf: sage green, darker midrib stripe along v (leaf axis)
    blotch = fbm(uu, vv, 6, SEED + 42, octaves=3)
    leaf_lo = np.array((0.20, 0.28, 0.14))
    leaf_hi = np.array((0.34, 0.46, 0.22))
    rib = np.exp(-(((uu - 0.5) ** 2) / 0.006)) * 0.12
    leaf_rgb = leaf_lo + (leaf_hi - leaf_hi * 0.2 + (leaf_hi * 0.2 - leaf_lo) * 0.0) * 0.0
    leaf_rgb = leaf_lo + (leaf_hi - leaf_lo) * blotch[..., None] - rib[..., None]
    leaf_h = blotch * 0.4 + np.exp(-(((uu - 0.5) ** 2) / 0.006)) * 0.3
    leaf_rough = np.clip(0.55 + blotch * 0.15, 0.45, 0.75)
    return {
        "joshua-bark-basecolor": np.clip(bark_rgb, 0.0, 1.0),
        "joshua-bark-normal": normal_from_height(bark_h, strength=2.5),
        "joshua-bark-orm": orm_image(bark_rough, metalness=0.0),
        "joshua-leaf-basecolor": np.clip(leaf_rgb, 0.0, 1.0),
        "joshua-leaf-normal": normal_from_height(leaf_h, strength=1.4),
        "joshua-leaf-orm": orm_image(leaf_rough, metalness=0.0),
    }


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    maps = make_tree_maps(256)
    paths = {k: save_image(k, img, ASSET_DIR / "textures") for k, img in maps.items()}
    mats = [
        make_material("JoshuaBark", paths["joshua-bark-basecolor"], paths["joshua-bark-normal"],
                      paths["joshua-bark-orm"], roughness=0.9),
        make_material("JoshuaLeaf", paths["joshua-leaf-basecolor"], paths["joshua-leaf-normal"],
                      paths["joshua-leaf-orm"], roughness=0.55),
    ]

    def build(tag: str, sides: int, leaves: int):
        b = Builder()
        build_tree(b, M_BARK, M_LEAF, sides, leaves)
        lo = min(v[2] for v in b.verts)
        b.verts = [(v[0], v[1], v[2] - lo) for v in b.verts]  # pivot on the ground
        obj = to_object(f"NatureJoshuaTree{tag}", b, mats)
        smooth_by_angle(obj, 30.0)
        return obj

    lod0 = build("Lod0", SIDES, LEAVES_PER_ROSETTE)
    lod1 = build("Lod1", SIDES_LOD1, LEAVES_PER_ROSETTE_LOD1)

    stats = {}
    for obj, tag in ((lod0, "lod0"), (lod1, "lod1")):
        obj.data.calc_loop_triangles()
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        stats[tag] = {
            "triangles": len(obj.data.loop_triangles),
            "verts": len(obj.data.vertices),
            "height": round(max(p[2] for p in bb) - min(p[2] for p in bb), 4),
            "crownWidth": round(max(p[0] for p in bb) - min(p[0] for p in bb), 4),
        }

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "joshua-tree.blend"), compress=False)

    glb0 = ASSET_DIR / "joshua-tree.glb"
    glb1 = ASSET_DIR / "joshua-tree-lod1.glb"
    export_glb([lod0], glb0)
    export_glb([lod1], glb1)
    thumb = ASSET_DIR / "thumbs" / "joshua-tree.png"
    render_thumbnail(thumb)

    print_report({
        "asset": "joshua-tree",
        "seed": SEED,
        "lod0": stats["lod0"],
        "lod1": stats["lod1"],
        "leavesPerRosette": {"lod0": LEAVES_PER_ROSETTE, "lod1": LEAVES_PER_ROSETTE_LOD1},
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
