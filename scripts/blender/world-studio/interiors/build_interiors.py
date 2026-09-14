"""Deterministic Blender build for the Atomic Acres world-studio mid-century interiors.

Lane: interiors-night-20260912 (contrib/dave-gaming-pc/claude/interiors-night-20260912).

Run (never interactively, never with the GPU) - one line, from the repo root, no `--` payload:

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --threads 2 --python scripts/blender/world-studio/interiors/build_interiors.py

That line exports all ten assets: `--repo` defaults to this file's own repo root and the per-prop
GLBs are on by default. Optional `-- --render [--samples 24]` adds the Cycles CPU thumbnail, and
`-- --hero-only` skips the props. Without `--render` the catalog publishes `thumbnailUrl: null`
rather than pointing at a still from an earlier, different export - see `write_catalog`.

What it produces
----------------
* `public/assets/world-studio/blender/interiors/*.glb` - the hero composition plus the
  individually re-usable props, glTF PBR, embedded textures, metre scale, Y-up.
* `source-assets/world-studio/interiors/textures/*.png` - the procedurally synthesised
  albedo/roughness maps, written before they are linked, so the input is reconstructable.
* `public/assets/world-studio/blender/interiors/thumb-*.png` - Cycles **CPU** renders.
* `public/assets/world-studio/blender/interiors/catalog.json` - the lane catalog, with the
  measured geometry census and the sha256 of every exported file.

Coordinate contract
-------------------
Everything is authored in the **house-local** frame published by
`src/world-studio/architecture/house.ts` (`anchor(id, room, lx, y, lz, yaw, footprint)`):
`lx` is house-local X, `lz` is house-local Z, `y` is the world floor height
(`GROUND_FLOOR_Y = 0.08`). The set origin is house-local `(0, 0, 0)` at floor level, so the
hero GLB drops in at `position = [wx(0), GROUND_FLOOR_Y, 0]` with no further offset and every
individual prop carries the anchor coordinates recorded in the catalog.

Blender is Z-up and glTF is Y-up, so `_p(lx, height, lz) -> (lx, -lz, height)` and a runtime
yaw about +Y is a Blender rotation about +Z with the same sign (verified by the mapping
`X_blender = x, Y_blender = -z, Z_blender = y`).

Lighting policy
---------------
**Nothing is baked.** No daylight, no sun, no sky is written into any texture, because the
arena's weather and time of day vary; the only authored surface variation is material detail
(weave, grain, glaze, tuft, speckle) plus a mild geometric contact darkening under the rug.
The Cycles rig below exists to render the *thumbnail* and is never exported.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from typing import Iterable, Sequence

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# --------------------------------------------------------------------------------------
# determinism
# --------------------------------------------------------------------------------------

SEED = 20260912

TEX_SIZE = 512

# House-local floor height published by src/world-studio/architecture/house.ts.
GROUND_FLOOR_Y = 0.08

# --------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------


def _p(lx: float, height: float, lz: float) -> tuple[float, float, float]:
    """House-local (x, y, z) in the runtime's Y-up frame -> Blender Z-up coordinates."""
    return (lx, -lz, height)


def _clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def _collection(name: str) -> bpy.types.Collection:
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


# --------------------------------------------------------------------------------------
# procedural textures
# --------------------------------------------------------------------------------------

# `interior_textures` is the sole AUTHORITY for every map: it is imported rather than
# re-implemented so the PNG on disk and the image embedded in the GLB are the same array
# from the same seed. The superseded in-file copy of the `tex_*` generators was deleted in
# wave 2 (it was dead code - `TEXTURES` below has always come from the module).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import interior_textures  # noqa: E402

TEXTURES = dict(interior_textures.TEXTURES)
assert TEX_SIZE == interior_textures.TEX_SIZE
assert SEED == interior_textures.SEED


def _load_map(path: str, name: str, is_data: bool) -> bpy.types.Image:
    """Loads a map from the file the shared module just wrote, so the bytes the GLB embeds are
    the bytes `source-assets` holds and `texture-report.json` pins."""
    image = bpy.data.images.load(path, check_existing=False)
    image.name = name
    image.colorspace_settings.name = "Non-Color" if is_data else "sRGB"
    return image


def build_textures(directory: str) -> tuple[dict[str, dict[str, bpy.types.Image]], dict]:
    """Generates every map through `interior_textures` and reloads it from disk.

    Wave 1 instead re-implemented the write: it pushed the array through Blender's float pixel
    buffer, which is scene-linear, so saving re-encoded each albedo to sRGB and produced
    *different bytes* from the module's encoder for the same seed. The first real run therefore
    silently invalidated all twelve sha256 pins in `texture-report.json`, and every albedo
    reached the shader far too bright (walnut's 0.34 arriving as 0.34 linear instead of 0.34
    sRGB = 0.095 linear) - which is what made the first hero render read washed out. One
    encoder, in the shared module, is now the authority for the bytes as well as the array, and
    the report is rewritten by the same run that writes the files.
    """
    os.makedirs(directory, exist_ok=True)
    report = interior_textures.generate_all(directory, TEX_SIZE)
    with open(os.path.join(directory, "texture-report.json"), "w", encoding="utf-8") as handle:
        json.dump({"seed": SEED, "textures": report}, handle, indent=2)
        handle.write("\n")
    out: dict[str, dict[str, bpy.types.Image]] = {}
    for name, entry in report.items():
        out[name] = {
            kind: _load_map(
                os.path.join(directory, entry[kind]["file"]),
                f"{name}-{kind}",
                is_data=(kind == "roughness"),
            )
            for kind in ("albedo", "roughness")
        }
    return out, report


# --------------------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------------------

MATERIALS: dict[str, bpy.types.Material] = {}


def _principled(mat: bpy.types.Material) -> bpy.types.Node:
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _set_input(node: bpy.types.Node, key: str, value) -> None:
    socket = node.inputs.get(key)
    if socket is not None:
        socket.default_value = value


def make_material(
    name: str,
    colour: Sequence[float],
    roughness: float,
    metallic: float = 0.0,
    maps: dict[str, bpy.types.Image] | None = None,
    uv_scale: float = 1.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = _principled(mat)
    _set_input(bsdf, "Base Color", (*colour, 1.0))
    _set_input(bsdf, "Roughness", roughness)
    _set_input(bsdf, "Metallic", metallic)
    _set_input(bsdf, "Alpha", alpha)
    if alpha < 1.0:
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
    if maps:
        tree = mat.node_tree
        mapping = tree.nodes.new("ShaderNodeMapping")
        mapping.location = (-1000, 0)
        mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, 1.0)
        uv = tree.nodes.new("ShaderNodeTexCoord")
        uv.location = (-1200, 0)
        tree.links.new(mapping.inputs["Vector"], uv.outputs["UV"])
        for key, socket in (("albedo", "Base Color"), ("roughness", "Roughness")):
            image = maps.get(key)
            if image is None or bsdf.inputs.get(socket) is None:
                continue
            node = tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            node.location = (-700, 0 if key == "albedo" else -320)
            node.interpolation = "Smart"
            tree.links.new(node.inputs["Vector"], mapping.outputs["Vector"])
            tree.links.new(bsdf.inputs[socket], node.outputs["Color"])
    MATERIALS[name] = mat
    return mat


def build_materials(maps: dict[str, dict[str, bpy.types.Image]]) -> None:
    make_material("IntSageUpholstery", (0.55, 0.69, 0.58), 0.88, maps=maps["sage-weave"], uv_scale=3.2)
    make_material("IntWalnut", (0.33, 0.19, 0.11), 0.36, maps=maps["walnut"], uv_scale=1.7)
    make_material("IntTeakLight", (0.47, 0.29, 0.16), 0.42, maps=maps["walnut"], uv_scale=2.6)
    make_material("IntAreaRug", (0.80, 0.62, 0.45), 0.93, maps=maps["rug"], uv_scale=0.42)
    make_material("IntBerberCarpet", (0.60, 0.53, 0.43), 0.95, maps=maps["carpet"], uv_scale=1.0)
    make_material("IntBacksplashTile", (0.86, 0.85, 0.78), 0.13, maps=maps["tile"], uv_scale=1.25)
    make_material("IntLaminateCounter", (0.79, 0.76, 0.69), 0.27, maps=maps["counter"], uv_scale=1.1)
    make_material("IntCabinetOchre", (0.68, 0.58, 0.13), 0.31)
    make_material("IntApplianceEnamel", (0.91, 0.89, 0.84), 0.24)
    make_material("IntChrome", (0.86, 0.87, 0.89), 0.13, metallic=1.0)
    make_material("IntBrass", (0.70, 0.53, 0.20), 0.28, metallic=1.0)
    make_material("IntVinylRust", (0.62, 0.29, 0.14), 0.42)
    make_material("IntVinylAvocado", (0.36, 0.46, 0.20), 0.40)
    make_material("IntCeramicCream", (0.85, 0.81, 0.71), 0.18)
    make_material("IntLampShade", (0.88, 0.82, 0.62), 0.72)
    make_material("IntFoliage", (0.22, 0.36, 0.18), 0.62)
    make_material("IntDarkCast", (0.10, 0.10, 0.11), 0.48)
    make_material("IntScreenGlass", (0.07, 0.08, 0.08), 0.10)
    make_material("IntPaperStack", (0.82, 0.78, 0.70), 0.70)


# --------------------------------------------------------------------------------------
# geometry primitives - everything near the camera is bevelled, nothing is a raw box
# --------------------------------------------------------------------------------------


def _world_uvs(bm: bmesh.types.BMesh, scale: float = 1.0) -> None:
    """Dominant-axis world projection. Deterministic, needs no operator context, and keeps a
    1 m texture repeat at 1 m of surface so the authored millimetre pitch survives."""
    layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            loop[layer].uv = (u * scale, v * scale)


def _finish(
    bm: bmesh.types.BMesh,
    name: str,
    material: str,
    location: Sequence[float],
    rotation: Sequence[float],
    collection: bpy.types.Collection,
    smooth_axis: int | None = None,
) -> bpy.types.Object:
    bm.normal_update()
    _world_uvs(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth_axis is not None:
        for poly in mesh.polygons:
            # Cap faces stay flat; the lathe wall shades smooth.
            poly.use_smooth = abs(poly.normal[smooth_axis]) < 0.87
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(location)
    obj.rotation_euler = Vector(rotation)
    mesh.materials.append(MATERIALS[material])
    collection.objects.link(obj)
    return obj


def box(
    name: str,
    size: Sequence[float],
    location: Sequence[float],
    material: str,
    collection: bpy.types.Collection,
    bevel: float = 0.012,
    segments: int = 3,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    taper: float | None = None,
) -> bpy.types.Object:
    """Bevelled box. `size` is the full extent; `location` is the centre. `taper` scales the
    +Z face, which is how every leg, plinth and shade in this set gets its profile."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= size[0]
        vert.co.y *= size[1]
        vert.co.z *= size[2]
    if taper is not None:
        for vert in bm.verts:
            if vert.co.z > 0:
                vert.co.x *= taper
                vert.co.y *= taper
    limit = min(size) * 0.45
    offset = min(bevel, limit)
    if offset > 1e-5:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.verts) + list(bm.edges),
            offset=offset,
            segments=segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return _finish(bm, name, material, location, rotation, collection)


def cylinder(
    name: str,
    radius: float,
    height: float,
    location: Sequence[float],
    material: str,
    collection: bpy.types.Collection,
    segments: int = 20,
    taper: float = 1.0,
    bevel: float = 0.004,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius * taper,
        depth=height,
    )
    if bevel > 1e-5:
        rim = [e for e in bm.edges if len({round(v.co.z, 5) for v in e.verts}) == 1]
        bmesh.ops.bevel(
            bm, geom=rim, offset=min(bevel, radius * 0.4), segments=2, profile=0.5,
            affect="EDGES", clamp_overlap=True,
        )
    return _finish(bm, name, material, location, rotation, collection, smooth_axis=2)


def sphere(
    name: str,
    radius: float,
    location: Sequence[float],
    material: str,
    collection: bpy.types.Collection,
    segments: int = 20,
    rings: int = 10,
    scale: Sequence[float] = (1.0, 1.0, 1.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for vert in bm.verts:
        vert.co.x *= scale[0]
        vert.co.y *= scale[1]
        vert.co.z *= scale[2]
    obj_bm = bm
    obj_bm.normal_update()
    _world_uvs(obj_bm)
    mesh = bpy.data.meshes.new(name)
    obj_bm.to_mesh(mesh)
    obj_bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(location)
    mesh.materials.append(MATERIALS[material])
    collection.objects.link(obj)
    return obj


def tapered_leg(
    name: str,
    top: Sequence[float],
    height: float,
    radius: float,
    material: str,
    collection: bpy.types.Collection,
    splay: Sequence[float] = (0.0, 0.0),
    taper: float = 0.55,
) -> bpy.types.Object:
    """The signature mid-century leg: a round dowel, tapered to the floor, splayed outward."""
    tilt_x = math.atan2(splay[1], height)
    tilt_y = -math.atan2(splay[0], height)
    obj = cylinder(
        name,
        radius,
        height,
        _p(0, 0, 0),
        material,
        collection,
        segments=12,
        taper=taper,
        bevel=0.002,
    )
    obj.location = Vector((top[0] + splay[0] * 0.5, top[1] + splay[1] * 0.5, top[2] - height * 0.5))
    obj.rotation_euler = Vector((tilt_x, tilt_y, 0.0))
    return obj


# --------------------------------------------------------------------------------------
# the props
# --------------------------------------------------------------------------------------


def build_sofa(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Three-seat sage sofa: plinth, separate seat and back cushions, arms, welt, walnut legs.
    Footprint 2.24 x 0.92 m from the `sofa` anchor, seat height 0.42 m."""
    tag = "sofa"
    base_y = 0.20
    # DEFECT FIX (wave 5, ADAPTER M1). A line setting the frame's own Z rotation to the anchor yaw
    # used to sit here, and has been deleted.
    # `_rotate_group` at the end of this function adds `yaw` to every part's Z rotation,
    # so the frame received it twice and the exported `sofa-frame` node sits at 180 deg while its
    # fifteen siblings sit at -90: a 2.20 x 0.88 m walnut plinth lying crosswise under a sofa whose
    # body runs along Z, 0.65 m outside the anchor footprint at each end. The frame needs no yaw of
    # its own - `_rotate_group` rotates both its position about the anchor and its own Z.
    # The shipped GLBs still contain the defect (this lane may not run Blender); the runtime
    # repairs it on load - `src/world-studio/interior-assets/fit.ts` SOFA_PLINTH_REPAIR - and that
    # repair is conditional, so it goes quiet once this export is refreshed.
    frame = box(f"{tag}-frame", (2.20, 0.88, 0.16), _p(lx, base_y + 0.08, lz), "IntWalnut", coll, bevel=0.02)
    parts = [frame]
    for index, offset in enumerate((-0.70, 0.0, 0.70)):
        cushion = box(
            f"{tag}-seat-{index}",
            (0.66, 0.80, 0.17),
            _p(lx + offset, base_y + 0.245, lz),
            "IntSageUpholstery",
            coll,
            bevel=0.055,
            segments=4,
        )
        parts.append(cushion)
        back = box(
            f"{tag}-back-{index}",
            (0.66, 0.19, 0.44),
            _p(lx + offset, base_y + 0.52, lz - 0.33),
            "IntSageUpholstery",
            coll,
            bevel=0.05,
            segments=4,
            rotation=(math.radians(-8.0), 0.0, 0.0),
        )
        parts.append(back)
    for side, offset in (("l", -1.16), ("r", 1.16)):
        arm = box(
            f"{tag}-arm-{side}",
            (0.16, 0.88, 0.36),
            _p(lx + offset, base_y + 0.34, lz),
            "IntSageUpholstery",
            coll,
            bevel=0.06,
            segments=4,
        )
        parts.append(arm)
        parts.append(
            box(
                f"{tag}-arm-cap-{side}",
                (0.19, 0.90, 0.03),
                _p(lx + offset, base_y + 0.535, lz),
                "IntWalnut",
                coll,
                bevel=0.012,
            )
        )
    # Welt piping along the seat front edge - a 12 mm reveal, not a decal.
    parts.append(
        box(f"{tag}-welt", (2.06, 0.02, 0.02), _p(lx, base_y + 0.245, lz + 0.40), "IntWalnut", coll, bevel=0.006)
    )
    for index, (ox, oz) in enumerate(((-0.94, 0.34), (0.94, 0.34), (-0.94, -0.34), (0.94, -0.34))):
        parts.append(
            tapered_leg(
                f"{tag}-leg-{index}",
                _p(lx + ox, base_y, lz + oz),
                base_y,
                0.026,
                "IntWalnut",
                coll,
                splay=(0.03 * (1 if ox > 0 else -1), -0.03 * (1 if oz > 0 else -1)),
            )
        )
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_coffee_table(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Walnut surfboard coffee table with a shaped top, splayed dowel legs and dressing."""
    tag = "coffee-table"
    top_y = 0.40
    parts = []
    # FIT FIX (wave 5). The top was authored 1.34 m long inside the 1.20 x 0.60 m `coffee-table`
    # anchor, so it stood 0.07 m proud at each end - the anchor footprint binds, and a coffee table
    # is not a dinette chair with a reason to stand outside it. 1.34 -> 1.20 with the pinch
    # half-length following it (0.67 -> 0.60), which keeps the surfboard profile identical in
    # normalised terms rather than re-tuning the curve. Legs at +/-0.54 and the 1.02 m apron are
    # unchanged and stay inside. The shipped GLB still measures 1.34: this takes effect on the
    # next Blender run, and no runtime transform can shrink geometry, so the overrun is recorded
    # as accepted in `fit.ts` until then.
    top = box(f"{tag}-top", (1.20, 0.58, 0.036), _p(lx, top_y, lz), "IntWalnut", coll, bevel=0.017, segments=4)
    # Shape the rectangle into a soft surfboard: pull the end vertices in.
    mesh = top.data
    for vert in mesh.vertices:
        pinch = 1.0 - 0.42 * (abs(vert.co.x) / 0.60) ** 2.4
        vert.co.y *= pinch
    parts.append(top)
    parts.append(
        box(f"{tag}-apron", (1.02, 0.34, 0.026), _p(lx, top_y - 0.045, lz), "IntWalnut", coll, bevel=0.008)
    )
    for index, (ox, oz) in enumerate(((-0.54, 0.19), (0.54, 0.19), (-0.54, -0.19), (0.54, -0.19))):
        parts.append(
            tapered_leg(
                f"{tag}-leg-{index}",
                _p(lx + ox, top_y - 0.05, lz + oz),
                top_y - 0.05,
                0.024,
                "IntWalnut",
                coll,
                splay=(0.055 * (1 if ox > 0 else -1), 0.035 * (1 if oz > 0 else -1)),
                taper=0.45,
            )
        )
    # Dressing: a brass bowl and a stack of magazines.
    bowl = sphere(f"{tag}-bowl", 0.13, _p(lx + 0.22, top_y + 0.036, lz - 0.02), "IntBrass", coll, scale=(1.0, 1.0, 0.42))
    parts.append(bowl)
    for index, (thickness, inset, mat) in enumerate(
        ((0.016, 0.0, "IntPaperStack"), (0.014, 0.012, "IntVinylRust"), (0.012, 0.024, "IntPaperStack"))
    ):
        parts.append(
            box(
                f"{tag}-book-{index}",
                (0.26 - inset, 0.19 - inset, thickness),
                _p(lx - 0.30, top_y + 0.018 + index * 0.016, lz + 0.02),
                mat,
                coll,
                bevel=0.004,
                rotation=(0.0, 0.0, math.radians(4.0 * index)),
            )
        )
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_armchair(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Rust vinyl lounge chair on an exposed walnut frame - the concept's window chair."""
    tag = "armchair"
    parts = []
    seat_y = 0.40
    parts.append(box(f"{tag}-seat", (0.60, 0.56, 0.13), _p(lx, seat_y, lz), "IntVinylRust", coll, bevel=0.045, segments=4))
    parts.append(
        box(
            f"{tag}-back",
            (0.60, 0.15, 0.50),
            _p(lx, seat_y + 0.30, lz - 0.26),
            "IntVinylRust",
            coll,
            bevel=0.045,
            segments=4,
            rotation=(math.radians(-13.0), 0.0, 0.0),
        )
    )
    for side, ox in (("l", -0.33), ("r", 0.33)):
        parts.append(
            box(f"{tag}-arm-{side}", (0.05, 0.54, 0.05), _p(lx + ox, seat_y + 0.19, lz + 0.01), "IntWalnut", coll, bevel=0.016, segments=3)
        )
        parts.append(
            box(f"{tag}-post-{side}", (0.045, 0.05, 0.24), _p(lx + ox, seat_y + 0.08, lz + 0.25), "IntWalnut", coll, bevel=0.01)
        )
        parts.append(
            box(f"{tag}-rail-{side}", (0.045, 0.60, 0.055), _p(lx + ox, seat_y - 0.08, lz), "IntWalnut", coll, bevel=0.012)
        )
    for index, (ox, oz) in enumerate(((-0.28, 0.24), (0.28, 0.24), (-0.28, -0.24), (0.28, -0.24))):
        parts.append(
            tapered_leg(
                f"{tag}-leg-{index}",
                _p(lx + ox, seat_y - 0.10, lz + oz),
                seat_y - 0.10,
                0.022,
                "IntWalnut",
                coll,
                splay=(0.05 * (1 if ox > 0 else -1), 0.05 * (1 if oz > 0 else -1)),
                taper=0.45,
            )
        )
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_credenza(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Walnut credenza with real door reveals and hardware, plus a period television."""
    tag = "tv-unit"
    parts = []
    body_y = 0.34
    height = 0.56
    # FIT FIX (wave 6). The credenza is not oversized - it is off-centre. The carcass is 0.44 m
    # deep inside a 0.500 m `tv-unit` footprint, but the hardware only stands proud at the front:
    # the brass pulls reach +0.262 (0.25 standoff + 0.012 radius) while the deepest thing behind
    # the centre line is the carcass at -0.220. Occupied depth 0.482 m, centred at +0.021, so the
    # front face sat 0.012 m outside the footprint while 0.030 m of slack went unused at the back.
    # Author the whole assembly about that occupied centre instead of about the carcass centre:
    # +/-0.241 inside +/-0.250, 9 mm clear on both faces. The rotation pivot below stays on the
    # true anchor centre `lz`, so the piece still rotates about its anchor, not about the bias.
    # Wave 5's load-time nudge measured the same 0.012 m and translated 12 mm; it is derived from
    # measured bounds, so it computes zero and goes quiet once this export reaches the bytes.
    CREDENZA_FRONT_BIAS = 0.021
    cz = lz - CREDENZA_FRONT_BIAS
    parts.append(box(f"{tag}-carcass", (1.56, 0.44, height), _p(lx, body_y + height / 2, cz), "IntWalnut", coll, bevel=0.014))
    for index, ox in enumerate((-0.38, 0.38)):
        parts.append(
            box(
                f"{tag}-door-{index}",
                (0.72, 0.024, height - 0.07),
                _p(lx + ox, body_y + height / 2, cz + 0.232),
                "IntTeakLight",
                coll,
                bevel=0.007,
            )
        )
        parts.append(
            cylinder(
                f"{tag}-pull-{index}",
                0.012,
                0.16,
                _p(lx + ox + (0.28 if index == 0 else -0.28), body_y + height / 2, cz + 0.25),
                "IntBrass",
                coll,
                segments=10,
                rotation=(0.0, math.radians(90.0), 0.0),
            )
        )
    for index, (ox, oz) in enumerate(((-0.64, 0.16), (0.64, 0.16), (-0.64, -0.16), (0.64, -0.16))):
        parts.append(
            tapered_leg(
                f"{tag}-leg-{index}", _p(lx + ox, body_y, cz + oz), body_y, 0.022, "IntWalnut", coll,
                splay=(0.02 * (1 if ox > 0 else -1), 0.02 * (1 if oz > 0 else -1)),
            )
        )
    # Period portable television.
    tv_y = body_y + height
    parts.append(box(f"{tag}-tv-body", (0.52, 0.40, 0.40), _p(lx - 0.36, tv_y + 0.20, cz), "IntWalnut", coll, bevel=0.02, segments=3))
    parts.append(box(f"{tag}-tv-bezel", (0.42, 0.02, 0.31), _p(lx - 0.36, tv_y + 0.22, cz + 0.20), "IntDarkCast", coll, bevel=0.02, segments=4))
    parts.append(box(f"{tag}-tv-screen", (0.37, 0.012, 0.27), _p(lx - 0.36, tv_y + 0.22, cz + 0.213), "IntScreenGlass", coll, bevel=0.02, segments=4))
    for index, oz in enumerate((0.06, -0.02)):
        parts.append(
            cylinder(
                f"{tag}-tv-knob-{index}", 0.022, 0.02,
                _p(lx - 0.10, tv_y + 0.26 + index * -0.08, cz + 0.205), "IntBrass", coll,
                segments=12, rotation=(math.radians(90.0), 0.0, 0.0),
            )
        )
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_table_lamp(coll: bpy.types.Collection, lx: float, lz: float) -> None:
    tag = "table-lamp"
    base = 0.90
    cylinder(f"{tag}-foot", 0.09, 0.02, _p(lx, base + 0.01, lz), "IntBrass", coll, segments=16)
    cylinder(f"{tag}-body", 0.075, 0.26, _p(lx, base + 0.15, lz), "IntCeramicCream", coll, segments=20, taper=0.72)
    cylinder(f"{tag}-neck", 0.014, 0.12, _p(lx, base + 0.34, lz), "IntBrass", coll, segments=10)
    cylinder(f"{tag}-shade", 0.135, 0.20, _p(lx, base + 0.48, lz), "IntLampShade", coll, segments=24, taper=0.74)


def build_sunburst_clock(coll: bpy.types.Collection, lx: float, height: float, lz: float, yaw: float) -> None:
    """Brass starburst wall clock - the concept's strongest single silhouette."""
    tag = "sunburst-clock"
    parts = [
        cylinder(f"{tag}-face", 0.085, 0.035, _p(lx, height, lz), "IntWalnut", coll, segments=24, rotation=(math.radians(90.0), 0.0, 0.0)),
        cylinder(f"{tag}-bezel", 0.092, 0.012, _p(lx, height, lz + 0.02), "IntBrass", coll, segments=24, rotation=(math.radians(90.0), 0.0, 0.0)),
    ]
    for index in range(16):
        angle = index * (2 * math.pi / 16)
        length = 0.30 if index % 2 == 0 else 0.19
        cx = lx + math.cos(angle) * (0.08 + length * 0.5)
        cy = height + math.sin(angle) * (0.08 + length * 0.5)
        ray = box(
            f"{tag}-ray-{index}",
            (length, 0.016, 0.022),
            _p(cx, cy, lz),
            "IntBrass",
            coll,
            bevel=0.004,
            taper=0.18,
            rotation=(0.0, 0.0, 0.0),
        )
        ray.rotation_euler = Vector((math.radians(90.0), -angle, 0.0))
        parts.append(ray)
    for name, length, angle in (("hour", 0.045, 1.1), ("minute", 0.068, -0.5)):
        hand = box(f"{tag}-{name}", (length, 0.008, 0.006), _p(lx + math.cos(angle) * length * 0.5, height + math.sin(angle) * length * 0.5, lz + 0.03), "IntDarkCast", coll, bevel=0.002)
        hand.rotation_euler = Vector((math.radians(90.0), -angle, 0.0))
        parts.append(hand)
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_kitchen_run(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Ochre-enamel kitchen run: base cabinets with reveals and pulls, laminate worktop with a
    bullnose, a recessed steel sink and tap, a four-burner hob, wall cabinets and tiled
    backsplash. Footprint 4.4 x 0.65 m from the `kitchen-run` anchor."""
    tag = "kitchen"
    parts = []
    counter_y = 0.90
    # FIT FIX (wave 6), two causes, both measured in `fit-report.json` (X span 0.664 in a 0.650 m
    # footprint, Z span 4.440 in a 4.400 m one). Wave 5 declined to re-author either; wave 6 does,
    # because the `kitchen-run` anchor footprint is the wall line and a run that crosses it is not
    # "what the object is".
    #
    # Depth 0.62 -> 0.60. 600 mm is the standard base-cabinet depth and 650 mm the worktop over it,
    # which is exactly what the anchor publishes; 620 was arbitrary and spent the slack the chrome
    # pulls need. At 0.60 the front-most thing is a base pull at +0.329 (0.300 carcass + 0.020
    # standoff + 0.009 radius) and the rear-most is the splash lip and backsplash at -0.315.
    # Occupied depth 0.644 m in 0.650, centred at +0.007 - so bias the assembly back by that and
    # both faces land at +/-0.322, 3 mm clear. The pulls keep their full standoff: a handle that
    # protrudes is still a handle, it just no longer protrudes through a wall.
    #
    # Length `+ 0.04` -> `length` on the worktop, splash lip and backsplash. That 40 mm was a
    # bullnose overhang applied to the wrong axis: the worktop still overhangs the *front* by
    # `depth + 0.03`, which is the feature, but the ends of a run butt into the room and 0.020 m
    # of laminate stood outside the footprint at each end.
    #
    # The shipped GLBs still measure 0.664 x 4.440. Nothing at runtime can shrink geometry, so both
    # stay recorded as accepted overruns in `fit.ts` until this export is refreshed.
    depth = 0.60
    length = 4.40
    KITCHEN_FRONT_BIAS = 0.007
    kz = lz - KITCHEN_FRONT_BIAS
    parts.append(box(f"{tag}-toe-kick", (length - 0.06, depth - 0.09, 0.11), _p(lx, 0.055, kz - 0.04), "IntDarkCast", coll, bevel=0.006))
    parts.append(box(f"{tag}-carcass", (length, depth, counter_y - 0.15), _p(lx, 0.11 + (counter_y - 0.15) / 2, kz), "IntCabinetOchre", coll, bevel=0.008))
    door_h = counter_y - 0.24
    for index in range(5):
        ox = -length / 2 + 0.46 + index * 0.87
        parts.append(
            box(f"{tag}-door-{index}", (0.82, 0.026, door_h), _p(lx + ox, 0.11 + door_h / 2 + 0.03, kz + depth / 2 - 0.004), "IntCabinetOchre", coll, bevel=0.008, segments=3)
        )
        parts.append(
            cylinder(f"{tag}-pull-{index}", 0.009, 0.13, _p(lx + ox + 0.33, 0.11 + door_h - 0.08, kz + depth / 2 + 0.02), "IntChrome", coll, segments=10, rotation=(0.0, math.radians(90.0), 0.0))
        )
    # Worktop with a bullnose front edge and a shallow recessed sink.
    parts.append(box(f"{tag}-worktop", (length, depth + 0.03, 0.04), _p(lx, counter_y - 0.02, kz + 0.01), "IntLaminateCounter", coll, bevel=0.018, segments=4))
    parts.append(box(f"{tag}-splash-lip", (length, 0.03, 0.09), _p(lx, counter_y + 0.045, kz - depth / 2), "IntLaminateCounter", coll, bevel=0.008))
    sink_x = lx + 0.62
    parts.append(box(f"{tag}-sink-basin", (0.62, 0.42, 0.14), _p(sink_x, counter_y - 0.10, kz + 0.01), "IntChrome", coll, bevel=0.02, segments=3))
    parts.append(box(f"{tag}-sink-rim", (0.66, 0.46, 0.012), _p(sink_x, counter_y + 0.004, kz + 0.01), "IntChrome", coll, bevel=0.006))
    parts.append(cylinder(f"{tag}-tap-body", 0.017, 0.24, _p(sink_x, counter_y + 0.12, kz - 0.20), "IntChrome", coll, segments=14))
    parts.append(cylinder(f"{tag}-tap-spout", 0.014, 0.22, _p(sink_x, counter_y + 0.22, kz - 0.10), "IntChrome", coll, segments=12, rotation=(math.radians(90.0), 0.0, 0.0)))
    # Four-burner hob.
    hob_x = lx - 1.28
    parts.append(box(f"{tag}-hob-plate", (0.62, 0.52, 0.014), _p(hob_x, counter_y + 0.005, kz + 0.01), "IntDarkCast", coll, bevel=0.006))
    for index, (ox, oz) in enumerate(((-0.15, 0.12), (0.15, 0.12), (-0.15, -0.12), (0.15, -0.12))):
        parts.append(cylinder(f"{tag}-burner-{index}", 0.075, 0.012, _p(hob_x + ox, counter_y + 0.014, kz + oz), "IntChrome", coll, segments=18))
        parts.append(cylinder(f"{tag}-burner-cap-{index}", 0.028, 0.016, _p(hob_x + ox, counter_y + 0.02, kz + oz), "IntDarkCast", coll, segments=12))
    # Wall cabinets and the tiled field behind the run.
    wall_y = 1.52
    wall_h = 0.72
    parts.append(box(f"{tag}-wall-carcass", (2.60, 0.34, wall_h), _p(lx - 0.70, wall_y + wall_h / 2, kz - 0.14), "IntCabinetOchre", coll, bevel=0.008))
    for index in range(3):
        ox = -0.70 - 1.30 + 0.44 + index * 0.86
        parts.append(box(f"{tag}-wall-door-{index}", (0.81, 0.024, wall_h - 0.04), _p(lx + ox, wall_y + wall_h / 2, kz - 0.14 + 0.18), "IntCabinetOchre", coll, bevel=0.008, segments=3))
        parts.append(cylinder(f"{tag}-wall-pull-{index}", 0.008, 0.11, _p(lx + ox + 0.32, wall_y + 0.10, kz - 0.14 + 0.20), "IntChrome", coll, segments=10, rotation=(0.0, math.radians(90.0), 0.0)))
    parts.append(box(f"{tag}-backsplash", (length, 0.02, 0.56), _p(lx, counter_y + 0.30, kz - depth / 2 - 0.005), "IntBacksplashTile", coll, bevel=0.004))
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_fridge(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Rounded-shoulder enamel refrigerator with a chrome latch handle."""
    tag = "fridge"
    parts = []
    height = 1.62
    parts.append(box(f"{tag}-plinth", (0.66, 0.62, 0.09), _p(lx, 0.045, lz), "IntDarkCast", coll, bevel=0.006))
    parts.append(box(f"{tag}-body", (0.72, 0.68, height), _p(lx, 0.09 + height / 2, lz), "IntApplianceEnamel", coll, bevel=0.05, segments=5))
    parts.append(box(f"{tag}-door-seam", (0.70, 0.014, 0.010), _p(lx, 0.09 + height * 0.74, lz + 0.345), "IntChrome", coll, bevel=0.003))
    parts.append(box(f"{tag}-handle", (0.035, 0.06, 0.30), _p(lx + 0.28, 0.09 + height * 0.45, lz + 0.365), "IntChrome", coll, bevel=0.012, segments=3))
    parts.append(box(f"{tag}-badge", (0.13, 0.012, 0.035), _p(lx - 0.18, 0.09 + height * 0.80, lz + 0.345), "IntBrass", coll, bevel=0.004))
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def build_dinette(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Chrome-and-laminate dinette with four avocado vinyl chairs, as in the concept's
    kitchen bay. Chair backs clear the table so the route between them stays walkable."""
    tag = "dinette"
    parts = []
    top_y = 0.74
    top = box(f"{tag}-top", (1.30, 0.92, 0.035), _p(lx, top_y, lz), "IntLaminateCounter", coll, bevel=0.016, segments=4)
    for vert in top.data.vertices:
        pinch = 1.0 - 0.30 * (abs(vert.co.x) / 0.65) ** 3.0
        vert.co.y *= pinch
    parts.append(top)
    parts.append(box(f"{tag}-edge", (1.31, 0.93, 0.012), _p(lx, top_y - 0.022, lz), "IntChrome", coll, bevel=0.005))
    for index, (ox, oz) in enumerate(((-0.52, 0.32), (0.52, 0.32), (-0.52, -0.32), (0.52, -0.32))):
        parts.append(
            cylinder(f"{tag}-leg-{index}", 0.020, top_y - 0.04, _p(lx + ox, (top_y - 0.04) / 2, lz + oz), "IntChrome", coll, segments=12)
        )
    parts.append(box(f"{tag}-stretcher", (0.98, 0.03, 0.03), _p(lx, 0.14, lz), "IntChrome", coll, bevel=0.006))
    for index, (ox, oz, chair_yaw) in enumerate(
        ((-0.92, 0.0, math.pi / 2), (0.92, 0.0, -math.pi / 2), (0.0, 0.80, math.pi), (0.0, -0.80, 0.0))
    ):
        parts.extend(_dinette_chair(coll, f"{tag}-chair-{index}", lx + ox, lz + oz, chair_yaw))
    # Fruit bowl.
    parts.append(sphere(f"{tag}-bowl", 0.115, _p(lx + 0.34, top_y + 0.035, lz), "IntCeramicCream", coll, scale=(1.0, 1.0, 0.45)))
    for index, (ox, oz) in enumerate(((-0.03, 0.02), (0.04, -0.03), (0.0, 0.05), (0.05, 0.04))):
        parts.append(sphere(f"{tag}-fruit-{index}", 0.036, _p(lx + 0.34 + ox, top_y + 0.07, lz + oz), "IntBrass", coll, segments=12, rings=8))
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def _dinette_chair(coll: bpy.types.Collection, tag: str, lx: float, lz: float, yaw: float) -> list[bpy.types.Object]:
    seat_y = 0.44
    parts = [
        box(f"{tag}-seat", (0.42, 0.42, 0.075), _p(lx, seat_y, lz), "IntVinylAvocado", coll, bevel=0.028, segments=4),
        box(f"{tag}-back", (0.40, 0.08, 0.30), _p(lx, seat_y + 0.27, lz - 0.19), "IntVinylAvocado", coll, bevel=0.032, segments=4, rotation=(math.radians(-10.0), 0.0, 0.0)),
        box(f"{tag}-seat-trim", (0.43, 0.43, 0.012), _p(lx, seat_y - 0.042, lz), "IntChrome", coll, bevel=0.005),
    ]
    for index, (ox, oz) in enumerate(((-0.17, 0.17), (0.17, 0.17), (-0.17, -0.17), (0.17, -0.17))):
        parts.append(cylinder(f"{tag}-leg-{index}", 0.014, seat_y - 0.05, _p(lx + ox, (seat_y - 0.05) / 2, lz + oz), "IntChrome", coll, segments=10))
    for index, ox in enumerate((-0.19, 0.19)):
        parts.append(cylinder(f"{tag}-post-{index}", 0.013, 0.34, _p(lx + ox, seat_y + 0.19, lz - 0.19), "IntChrome", coll, segments=10))
    _rotate_group(parts, _p(lx, 0, lz), yaw)
    return parts


def build_rug(coll: bpy.types.Collection, lx: float, lz: float, yaw: float) -> None:
    """Patterned area rug with real thickness and a chamfered edge, plus a broad shadow-free
    contact pad: the darkening under it is geometry and material, never baked light."""
    tag = "area-rug"
    rug = box(f"{tag}-pile", (3.30, 2.30, 0.018), _p(lx, 0.011, lz), "IntAreaRug", coll, bevel=0.007, segments=2)
    rug.rotation_euler.z = yaw
    fringe = box(f"{tag}-binding", (3.34, 2.34, 0.006), _p(lx, 0.004, lz), "IntBerberCarpet", coll, bevel=0.003)
    fringe.rotation_euler.z = yaw


def build_snake_plant(coll: bpy.types.Collection, lx: float, lz: float) -> None:
    """Sansevieria in a ceramic planter - the concept's stair-foot greenery."""
    tag = "snake-plant"
    cylinder(f"{tag}-pot", 0.18, 0.34, _p(lx, 0.17, lz), "IntCeramicCream", coll, segments=20, taper=1.18)
    cylinder(f"{tag}-soil", 0.19, 0.02, _p(lx, 0.335, lz), "IntDarkCast", coll, segments=20)
    blade_rng = np.random.default_rng(SEED + 5)
    for index in range(9):
        angle = index * (2 * math.pi / 9) + 0.18
        height = 0.52 + float(blade_rng.random()) * 0.42
        radius = 0.055 + float(blade_rng.random()) * 0.05
        blade = box(
            f"{tag}-blade-{index}",
            (0.055, 0.012, height),
            _p(lx + math.cos(angle) * radius, 0.34 + height / 2, lz + math.sin(angle) * radius),
            "IntFoliage",
            coll,
            bevel=0.005,
            segments=2,
            taper=0.22,
        )
        blade.rotation_euler = Vector((math.radians(9.0) * math.sin(angle), math.radians(9.0) * math.cos(angle), angle))


def build_wall_art(coll: bpy.types.Collection, lx: float, height: float, lz: float, yaw: float) -> None:
    tag = "wall-art"
    parts = [
        box(f"{tag}-frame", (0.52, 0.035, 0.66), _p(lx, height, lz), "IntWalnut", coll, bevel=0.008),
        box(f"{tag}-canvas", (0.46, 0.012, 0.60), _p(lx, height, lz + 0.016), "IntPaperStack", coll, bevel=0.004),
        box(f"{tag}-shape-a", (0.16, 0.006, 0.22), _p(lx - 0.09, height + 0.10, lz + 0.024), "IntVinylRust", coll, bevel=0.003),
        box(f"{tag}-shape-b", (0.12, 0.006, 0.30), _p(lx + 0.08, height - 0.05, lz + 0.024), "IntVinylAvocado", coll, bevel=0.003),
        box(f"{tag}-shape-c", (0.20, 0.006, 0.09), _p(lx + 0.02, height + 0.20, lz + 0.024), "IntBrass", coll, bevel=0.003),
    ]
    _rotate_group(parts, _p(lx, 0, lz), yaw)


def _rotate_group(objects: Iterable[bpy.types.Object], pivot: Sequence[float], yaw: float) -> None:
    """Rotates a prop's parts about its own anchor. The runtime yaw sign matches Blender's Z
    rotation under the `X, -Z, Y` mapping, so this is the same number the anchor publishes."""
    if abs(yaw) < 1e-9:
        return
    cos_y, sin_y = math.cos(yaw), math.sin(yaw)
    px, py = pivot[0], pivot[1]
    for obj in objects:
        dx = obj.location.x - px
        dy = obj.location.y - py
        obj.location.x = px + dx * cos_y - dy * sin_y
        obj.location.y = py + dx * sin_y + dy * cos_y
        obj.rotation_euler.z += yaw


# --------------------------------------------------------------------------------------
# the hero set
# --------------------------------------------------------------------------------------

# House-local anchor coordinates, copied from house.ts `anchor(...)` calls. Kept here as
# data so the exported placement and the runtime anchor can be compared mechanically.
ANCHORS = {
    "sofa": (5.4, -4.4, -math.pi / 2, (2.2, 0.9)),
    "coffee-table": (3.6, -4.4, 0.0, (1.2, 0.6)),
    "tv-unit": (1.0, -4.4, math.pi / 2, (1.6, 0.5)),
    "dining-table": (-3.4, -3.4, 0.0, (1.6, 1.0)),
    "kitchen-run": (-6.2, 5.2, math.pi / 2, (4.4, 0.65)),
}

PROP_GROUPS = {
    "sofa": ("sofa",),
    "coffee-table": ("coffee-table",),
    "credenza": ("tv-unit",),
    "armchair": ("armchair",),
    "kitchen-run": ("kitchen",),
    "fridge": ("fridge",),
    "dinette": ("dinette",),
    "area-rug": ("area-rug",),
    "accents": ("table-lamp", "sunburst-clock", "snake-plant", "wall-art"),
}


def build_set(coll: bpy.types.Collection) -> None:
    sofa_x, sofa_z, sofa_yaw, _ = ANCHORS["sofa"]
    build_sofa(coll, sofa_x, sofa_z, sofa_yaw)

    table_x, table_z, table_yaw, _ = ANCHORS["coffee-table"]
    build_coffee_table(coll, table_x, table_z, table_yaw)

    tv_x, tv_z, tv_yaw, _ = ANCHORS["tv-unit"]
    build_credenza(coll, tv_x, tv_z, tv_yaw)

    # Window chair, rug, lamp and plant sit inside the living room's published anchor
    # envelope and never cross the hall route at local X ~ 0..2, Z ~ 0..8.
    build_armchair(coll, 3.4, -6.6, math.radians(28.0))
    build_rug(coll, 3.9, -4.5, 0.0)
    build_table_lamp(coll, 1.05, -6.1)
    build_sunburst_clock(coll, -0.6, 2.15, -7.55, 0.0)
    build_wall_art(coll, 4.9, 1.72, -7.55, 0.0)
    build_snake_plant(coll, -1.5, -1.1)

    kitchen_x, kitchen_z, kitchen_yaw, _ = ANCHORS["kitchen-run"]
    build_kitchen_run(coll, kitchen_x, kitchen_z, kitchen_yaw)
    build_fridge(coll, -6.25, 2.05, math.pi / 2)

    dining_x, dining_z, dining_yaw, _ = ANCHORS["dining-table"]
    build_dinette(coll, dining_x, dining_z, dining_yaw)


# --------------------------------------------------------------------------------------
# export, census, render
# --------------------------------------------------------------------------------------


def _select(objects: Sequence[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def census(objects: Sequence[bpy.types.Object]) -> dict:
    triangles = 0
    vertices = 0
    materials: set[str] = set()
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        vertices += len(mesh.vertices)
        for mat in mesh.materials:
            if mat is not None:
                materials.add(mat.name)
    return {
        "objects": len(objects),
        "vertices": vertices,
        "triangles": triangles,
        "materials": sorted(materials),
    }


def sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_glb(objects: Sequence[bpy.types.Object], path: str) -> dict:
    _select(objects)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )
    stat = census(objects)
    stat["file"] = os.path.basename(path)
    stat["bytes"] = os.path.getsize(path)
    stat["sha256"] = sha256_of(path)
    return stat


def setup_render(samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 640
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    # The preview plaster is the brightest surface in frame and clips first; pull the
    # whole frame down rather than dimming the key that makes the contact shadows.
    scene.view_settings.exposure = -0.25
    available = [v.name for v in scene.view_settings.bl_rna.properties["view_transform"].enum_items]
    for preferred in ("AgX", "Filmic"):
        if preferred in available:
            scene.view_settings.view_transform = preferred
            break
    # Base AgX desaturates a thumbnail whose whole job is to show what the albedo is; the
    # punchier look is picked by name because the enum differs between transforms.
    looks = [v.name for v in scene.view_settings.bl_rna.properties["look"].enum_items]
    for preferred in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast", "Medium High Contrast"):
        if preferred in looks:
            scene.view_settings.look = preferred
            break


def _aim(obj: bpy.types.Object, target_house: Sequence[float]) -> None:
    """Point `obj`'s -Z axis at a house-local target. Wave 1 hand-wrote the Euler triple and
    got the sign of the Z rotation wrong, so the first real run rendered the empty world
    background: derive the rotation from the target instead of asserting it."""
    direction = Vector(_p(*target_house)) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_preview_shell(rig: bpy.types.Collection) -> None:
    """Thumbnail-only floor, two far walls and a ceiling. The exported set is furniture alone,
    so without these the props float in the world background and no contact shadow, bounce or
    occlusion is visible. These objects are built after every export call and live in the
    preview collection, so they cannot reach a GLB."""
    make_material("PrevPlaster", (0.70, 0.67, 0.62), 0.84)
    make_material("PrevWallTeal", (0.44, 0.63, 0.56), 0.80)
    # The set origin IS floor level: every prop is authored from y = 0 and the loader adds
    # GROUND_FLOOR_Y when it places the group in the house. Building this shell at 0.08
    # sank the whole set 80 mm into the preview floor and buried the area rug (top 20 mm)
    # completely, which is why no rug appeared in the first three frames.
    floor_y = 0.0
    # Floor: reuses the exported berber map so the frame shows the real carpet, not a proxy.
    box("prev-floor", (15.0, 19.0, 0.06), _p(0.0, floor_y - 0.03, 0.0), "IntBerberCarpet", rig, bevel=0.0)
    # Far wall behind the kitchen run (cabinet backs sit at house x = -6.525).
    box("prev-wall-kitchen", (0.12, 19.0, 2.70), _p(-6.65, floor_y + 1.35, 0.0), "PrevPlaster", rig, bevel=0.0)
    # End wall past the kitchen, and the living-room accent wall the concept paints teal.
    box("prev-wall-far", (15.0, 0.12, 2.70), _p(0.0, floor_y + 1.35, 8.6), "PrevPlaster", rig, bevel=0.0)
    box("prev-wall-living", (0.12, 19.0, 2.70), _p(7.3, floor_y + 1.35, 0.0), "PrevWallTeal", rig, bevel=0.0)
    ceiling = box(
        "prev-ceiling", (15.0, 19.0, 0.10), _p(0.0, floor_y + 2.75, 0.0), "PrevPlaster", rig, bevel=0.0
    )
    # The ceiling frames the shot but must not block the preview sun, which stands in for the
    # picture-window daylight the concept is lit by. Camera-visible, shadow-transparent.
    ceiling.visible_shadow = False


def add_preview_rig() -> bpy.types.Object:
    """A thumbnail-only rig. It is never exported and nothing it does is written to a texture:
    daylight direction and intensity remain the runtime's decision."""
    rig = _collection("preview-rig")
    add_preview_shell(rig)
    cam_data = bpy.data.cameras.new("hero-cam")
    # 20 mm bent the ceiling line and left half the frame bare floor; 28 mm still clears the
    # 14 m envelope from the corner and reads as a room rather than a hall.
    cam_data.lens = 26.0
    cam = bpy.data.objects.new("hero-cam", cam_data)
    # Concept edd0e997: low eye height in the living room looking across the hall into the
    # kitchen, the stair on the right of frame.
    cam.location = Vector(_p(6.2, 1.30, -6.6))
    rig.objects.link(cam)
    _aim(cam, (-2.2, 0.72, 0.45))
    bpy.context.scene.camera = cam

    # Window daylight. The concept's character is one hard, low, warm key raking in from the
    # picture window, not a room-wide ambient: without it the set renders shadowless and the
    # contact between a leg and the floor disappears.
    sun = bpy.data.lights.new("window-sun", type="SUN")
    sun.energy = 11.0
    sun.color = (1.0, 0.94, 0.84)
    sun.angle = math.radians(1.6)
    sun_obj = bpy.data.objects.new("window-sun", sun)
    sun_obj.location = Vector(_p(4.5, 5.6, -9.5))
    rig.objects.link(sun_obj)
    _aim(sun_obj, (-0.5, 0.0, 1.0))

    key = bpy.data.lights.new("window-key", type="AREA")
    key.energy = 130.0
    key.size = 3.2
    key.size_y = 1.6
    key.shape = "RECTANGLE"
    key.color = (1.0, 0.96, 0.88)
    key_obj = bpy.data.objects.new("window-key", key)
    key_obj.location = Vector(_p(4.0, 1.7, -8.4))
    key_obj.rotation_euler = Vector((math.radians(-72.0), 0.0, 0.0))
    rig.objects.link(key_obj)

    # Second daylight zone at the kitchen bay - the handoff's first lighting note. One
    # room-wide fill leaves the ochre run flat.
    fill = bpy.data.lights.new("kitchen-fill", type="AREA")
    fill.energy = 190.0
    fill.size = 2.4
    fill.color = (0.94, 0.96, 1.0)
    fill_obj = bpy.data.objects.new("kitchen-fill", fill)
    fill_obj.location = Vector(_p(-6.0, 2.2, 7.4))
    fill_obj.rotation_euler = Vector((math.radians(64.0), 0.0, 0.0))
    rig.objects.link(fill_obj)

    # Soft ceiling-height toplight. Wave 1 rotated this 180 deg so it faced up, which lit
    # nothing at all when the set had no ceiling; it now sits just under the preview ceiling
    # and faces down.
    bounce = bpy.data.lights.new("ceiling-bounce", type="AREA")
    bounce.energy = 110.0
    bounce.size = 6.0
    bounce.color = (1.0, 0.98, 0.94)
    bounce_obj = bpy.data.objects.new("ceiling-bounce", bounce)
    bounce_obj.location = Vector(_p(1.0, 2.66, -1.0))
    rig.objects.link(bounce_obj)

    world = bpy.data.worlds.new("preview-world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.36, 0.42, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.22
    bpy.context.scene.world = world
    return cam


def render_thumbnail(path: str, camera: bpy.types.Object) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# --------------------------------------------------------------------------------------
# catalog
# --------------------------------------------------------------------------------------

CATALOG_TITLES = {
    "interior-hero-teal-living-kitchen": "Mid-century living room and kitchen hero set (teal house)",
    "interior-prop-sofa": "Sage three-seat sofa on a walnut plinth",
    "interior-prop-coffee-table": "Walnut surfboard coffee table with brass bowl and books",
    "interior-prop-credenza": "Walnut credenza with period wood-cased television",
    "interior-prop-armchair": "Rust vinyl lounge chair on an exposed walnut frame",
    "interior-prop-kitchen-run": "Ochre enamel kitchen run with sink, hob and tiled splashback",
    "interior-prop-fridge": "White enamel refrigerator with chrome latch",
    "interior-prop-dinette": "Chrome-and-laminate dinette with four avocado vinyl chairs",
    "interior-prop-area-rug": "Banded geometric area rug over the berber field",
    "interior-prop-accents": "Accent set: table lamp, starburst clock, snake plant, wall art",
}

ASSET_URL_BASE = "assets/world-studio/blender/interiors"


def write_catalog(report: dict, out_dir: str) -> str:
    """Emits `catalog.json` **from the measured report only**. A row exists here if and only if
    this run wrote the file it names, so the catalog cannot drift into a phantom gallery entry;
    `thumbnailUrl` is null unless this run actually rendered that thumbnail."""
    thumbnails = report.get("thumbnails", {})
    assets = []
    for export in report["exports"]:
        asset_id = export["id"]
        thumb = thumbnails.get(asset_id)
        assets.append(
            {
                "id": asset_id,
                "title": CATALOG_TITLES.get(asset_id, asset_id),
                "assetUrl": f"{ASSET_URL_BASE}/{export['file']}",
                "thumbnailUrl": f"{ASSET_URL_BASE}/{thumb}" if thumb else None,
                "category": "interior",
                "kind": "composition" if asset_id.startswith("interior-hero") else "prop",
                "authoredBy": {"harness": "claude", "model": "claude-opus-5", "effort": "xhigh"},
                "license": "Original project artwork, authored from code in this repository",
                "method": (
                    "Deterministic Blender Python (bevelled hard-surface geometry, dominant-axis "
                    "world UVs) with procedurally synthesised albedo/roughness maps; no downloaded "
                    "mesh, texture or scan."
                ),
                "sourceUrls": [],
                "revision": 2,
                "status": "exported",
                "metrics": {
                    "objects": export["objects"],
                    "vertices": export["vertices"],
                    "triangles": export["triangles"],
                    "materials": export["materials"],
                    "bytes": export["bytes"],
                },
                "sha256": export["sha256"],
                "presentationOnly": True,
            }
        )
    catalog = {
        "schemaVersion": 1,
        "lane": "interiors-night-20260912",
        "generatedBy": "scripts/blender/world-studio/interiors/build_interiors.py",
        "blender": report["blender"],
        "seed": report["seed"],
        "assets": assets,
        "limitations": [
            "Presentation only: no collider, spawn, patrol point or shot authority is implied by "
            "any row here. The runtime keeps gameplay authority.",
            "Thumbnails are Blender Cycles CPU stills of the exported set lit by a preview-only "
            "rig (camera, lights, floor/walls/ceiling) that is NOT part of any GLB. They are not "
            "a runtime capture and are not visual acceptance.",
            "Not yet loaded by the runtime: no row here has been fetched by three.js in a browser. "
            "`src/world-studio/interior-assets/index.ts` is typechecked but unexercised.",
        ],
    }
    path = f"{out_dir}/catalog.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(catalog, handle, indent=2)
        handle.write("\n")
    return path


# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------


def _repo_root() -> str:
    """Repo root inferred from this file: `<repo>/scripts/blender/world-studio/interiors/`."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "..", "..", "..")).replace("\\", "/")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    # The canonical run is the single pinned line in the module docstring, with no `--` payload at
    # all, so every argument has to have a correct default. `--repo` used to be required, which
    # made that line exit 2 before a single object was built; it now derives the repo root from
    # this file's own location (repo/scripts/blender/world-studio/interiors/build_interiors.py),
    # which is the only root at which the export paths below are meaningful. Still overridable.
    parser.add_argument("--repo", default=_repo_root())
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--samples", type=int, default=24)
    # The catalog publishes ten assets, so the default run has to export ten. `--props` stays
    # accepted so older invocations keep working; `--hero-only` is the opt-out that used to be
    # the accidental default.
    parser.add_argument("--props", action="store_true", default=True, help="export the per-prop GLBs")
    parser.add_argument("--hero-only", dest="props", action="store_false", help="export only the hero composition")
    args = parser.parse_args(argv)

    repo = args.repo.replace("\\", "/").rstrip("/")
    out_dir = f"{repo}/public/assets/world-studio/blender/interiors"
    tex_dir = f"{repo}/source-assets/world-studio/interiors/textures"

    _clear_scene()
    maps, texture_report = build_textures(tex_dir)
    build_materials(maps)
    coll = _collection("interior-hero-teal")
    build_set(coll)

    objects = sorted(coll.objects, key=lambda o: o.name)
    print(f"[interiors] built {len(objects)} objects")

    exports = []
    exports.append(
        {
            "id": "interior-hero-teal-living-kitchen",
            **export_glb(objects, f"{out_dir}/interior-hero-teal-living-kitchen.glb"),
        }
    )

    if args.props:
        for prop_id, prefixes in PROP_GROUPS.items():
            subset = [o for o in objects if any(o.name.startswith(p + "-") for p in prefixes)]
            if not subset:
                continue
            exports.append(
                {"id": f"interior-prop-{prop_id}", **export_glb(subset, f"{out_dir}/interior-prop-{prop_id}.glb")}
            )

    thumbnails = {}
    if args.render:
        setup_render(args.samples)
        camera = add_preview_rig()
        thumb = render_thumbnail(f"{out_dir}/thumb-interior-hero-teal.png", camera)
        thumbnails["interior-hero-teal-living-kitchen"] = os.path.basename(thumb)

    report = {
        "seed": SEED,
        "blender": bpy.app.version_string,
        "groundFloorY": GROUND_FLOOR_Y,
        "anchors": {k: {"lx": v[0], "lz": v[1], "yaw": v[2], "footprint": list(v[3])} for k, v in ANCHORS.items()},
        "exports": exports,
        "thumbnails": thumbnails,
        "textures": sorted(os.path.basename(p) for p in os.listdir(tex_dir) if p.endswith(".png")),
        # Pinned by the same run that wrote the files, so a stale pin is a build failure rather
        # than something a later reader has to notice.
        "texturePins": {
            name: {kind: entry[kind]["sha256"] for kind in ("albedo", "roughness")}
            for name, entry in sorted(texture_report.items())
        },
    }
    report_path = f"{out_dir}/build-report.json"
    os.makedirs(out_dir, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    catalog_path = write_catalog(report, out_dir)
    print(f"[interiors] catalog: {catalog_path} ({len(report['exports'])} rows)")
    print("[interiors] report:\n" + json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
