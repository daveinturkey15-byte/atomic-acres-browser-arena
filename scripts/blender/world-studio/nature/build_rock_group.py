"""Author the world-studio nature rock group and export runtime glTF binaries.

Runs INSIDE Blender via launch_nature.py (``--background --factory-startup --threads 4``).

Design (dry-suburb/mountain concept): four sculpted, irregular desert-granite rocks
nestled as one dressing group - a main boulder, a tilted slab, a medium chunk and a
small chip - all sharing ONE rock material; per-rock tone variation rides COLOR_0
vertex colours, which three multiplies into the textured base colour. Surfaces are
displaced by seeded trig lumps (deterministic; no random module), so no two rocks
read alike yet every build is byte-identical.

Method atoms applied:
  * ai-3d-asset-generation-loop: route = code-only procedural (dressing, not hero);
    verification = CPU render + GLB census + sha256, browser round left to root.
  * atomic-acres-asset-authoring: deterministic pipeline, synthesised PBR maps
    (albedo sRGB / normal tangent / roughness-in-G), provenance + hashes reported.
  * Blender 5.1 glTF manual: official material hookups (nature_common docstring).

Presentation only: no collider, spawn or navigation data is emitted.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nature_common import (  # noqa: E402
    ASSET_DIR,
    BLEND_DIR,
    Builder,
    SEED,
    auto_uv,
    export_glb,
    fbm,
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

import bmesh  # noqa: E402
import bpy  # noqa: E402

REPO = Path(__file__).resolve().parents[4]

# Frozen spec. Metres. Group footprint ~1.6 x 1.2 m, tallest rock 0.72 m.
ROCKS = [
    # (radius, scale (x,y,z), centre (x,y,z), tone multiplier, lump amplitude)
    (0.44, (1.10, 0.92, 0.80), (0.00, 0.00, 0.36), (1.00, 0.97, 0.92), 0.30),
    (0.50, (1.00, 0.72, 0.34), (0.62, 0.30, 0.15), (0.90, 0.88, 0.85), 0.22),
    (0.34, (0.95, 1.00, 0.85), (-0.55, 0.34, 0.26), (1.06, 1.00, 0.93), 0.34),
    (0.22, (1.00, 1.00, 0.90), (0.18, 0.48, 0.14), (0.94, 0.92, 0.88), 0.38),
]
ICOSPHERE_SUBDIV = 3  # 642 verts / 1280 faces per rock at LOD0
ICOSPHERE_SUBDIV_LOD1 = 2


def rock_lump(d: tuple[float, float, float], amp: float, seed: int) -> float:
    """Seeded lumpy displacement of a unit direction: irregular but deterministic."""
    x, y, z = d
    p = [math.pi * ((0.13 * k * seed) % 1.0 + 0.11 * (k + 1)) for k in range(6)]
    v = (
        0.55 * math.sin(3.1 * x + p[0]) * math.sin(2.7 * y + p[1])
        + 0.30 * math.sin(4.3 * y + p[2]) * math.sin(3.9 * z + p[3])
        + 0.15 * math.sin(5.2 * z + p[4]) * math.sin(4.1 * x + p[5])
    )
    return 1.0 + amp * v


def build_rock(centre, radius, scale, tone, amp, seed, subdiv: int, mat: int, b: Builder) -> None:
    """One displaced icosphere, anisotropically scaled, sunk slightly into the grade."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, u_segments=subdiv, radius=1.0)
    bm.verts.index_update()
    bm.faces.index_update()
    ids = []
    for v in bm.verts:
        d = v.co.normalized() if v.co.length > 1e-9 else Vector((0.0, 0.0, 1.0))
        f = rock_lump((d.x, d.y, d.z), amp, seed)
        p = (
            centre[0] + v.co.x * radius * scale[0] * f,
            centre[1] + v.co.y * radius * scale[1] * f,
            centre[2] + v.co.z * radius * scale[2] * f,
        )
        ids.append(b.add_vert(p))
    for face in bm.faces:
        idx = [ids[v.index] for v in face.verts]
        pts = [b.verts[i] for i in idx]
        b.add_face(idx, mat, uv=auto_uv(pts), color=[tone] * len(idx))
    bm.free()


def make_rock_maps(size: int = 256) -> dict:
    """Warm desert granite: tan-grey fBm mottle, faint ochre patches, fine speckle."""
    u = np.linspace(0.0, 1.0, size, endpoint=False)
    v = np.linspace(0.0, 1.0, size, endpoint=False)
    uu, vv = np.meshgrid(u, v)
    base_lo = np.array((0.46, 0.42, 0.38))
    base_hi = np.array((0.64, 0.59, 0.52))
    ochre = np.array((0.68, 0.54, 0.38))
    mottle = fbm(uu, vv, 8, SEED + 1, octaves=5)
    patches = (fbm(uu, vv, 3, SEED + 2, octaves=2) > 0.62).astype(np.float64)
    gx, gy = np.meshgrid(np.arange(size), np.arange(size))
    sp = ((gx * 374761393 + gy * 668265263 + SEED) & 0xFFFFFFFF).astype(np.uint64)
    sp = ((sp ^ (sp >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
    speckle = ((sp.astype(np.float64) / 4294967295.0) - 0.5) * 0.09
    rgb = base_lo + (base_hi - base_lo) * mottle[..., None]
    rgb = rgb * (1.0 - 0.35 * patches[..., None]) + ochre * (0.35 * patches[..., None])
    rgb = rgb + speckle[..., None]
    height = fbm(uu, vv, 8, SEED + 3, octaves=5)
    rough = np.clip(0.80 + (0.5 - mottle) * 0.25 + speckle * 0.6, 0.6, 0.97)
    return {
        "rock-basecolor": np.clip(rgb, 0.0, 1.0),
        "rock-normal": normal_from_height(height, strength=3.0),
        "rock-orm": orm_image(rough, metalness=0.0),
    }


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    maps = make_rock_maps(256)
    paths = {k: save_image(k, img, ASSET_DIR / "textures") for k, img in maps.items()}
    mats = [make_material("NatureRock", paths["rock-basecolor"], paths["rock-normal"],
                          paths["rock-orm"], roughness=0.85)]

    def build_group(subdiv: int, tag: str):
        b = Builder()
        for i, (radius, scale, centre, tone, amp) in enumerate(ROCKS):
            build_rock(centre, radius, scale, tone, amp, SEED + i * 97, subdiv, 0, b)
        lo = min(v[2] for v in b.verts)
        b.verts = [(v[0], v[1], v[2] - lo - 0.03) for v in b.verts]  # settle 3 cm into grade
        obj = to_object(f"NatureRockGroup{tag}", b, mats)
        smooth_by_angle(obj, 34.0)
        return obj

    lod0 = build_group(ICOSPHERE_SUBDIV, "Lod0")
    lod1 = build_group(ICOSPHERE_SUBDIV_LOD1, "Lod1")

    stats = {}
    for obj, tag in ((lod0, "lod0"), (lod1, "lod1")):
        obj.data.calc_loop_triangles()
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        stats[tag] = {
            "triangles": len(obj.data.loop_triangles),
            "verts": len(obj.data.vertices),
            "height": round(max(p[2] for p in bb) - min(p[2] for p in bb), 4),
        }

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "rock-group.blend"), compress=False)

    glb0 = ASSET_DIR / "rock-group.glb"
    glb1 = ASSET_DIR / "rock-group-lod1.glb"
    export_glb([lod0], glb0)
    export_glb([lod1], glb1)
    thumb = ASSET_DIR / "thumbs" / "rock-group.png"
    render_thumbnail(thumb)

    print_report({
        "asset": "rock-group",
        "seed": SEED,
        "lod0": stats["lod0"],
        "lod1": stats["lod1"],
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
