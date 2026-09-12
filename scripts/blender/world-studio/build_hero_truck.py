"""Author the world-studio hero truck and box trailer in Blender 5.1 and export runtime glTF.

Runs INSIDE Blender; launch through ``blender_launcher.py`` so the machine-wide Blender lock is
honoured. Same contract as the bus: presentation only, deterministic, CPU only - no render, no
Cycles, no GPU device.

Geometry primitives and the CPU noise/texture machinery are imported from ``build_hero_bus`` so
this is a second consumer of that generator rather than a copy of it; only the vehicle spec and
its assembly are new here.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh  # noqa: F401  (imported for parity with the bus build environment)
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_hero_bus import (  # noqa: E402  - path must be set first
    ASSET_DIR,
    BLEND_DIR,
    REPO,
    SEED,
    Builder,
    chamfer_box,
    disc,
    fbm,
    revolve,
    save_image,
    sweep,
    to_object,
    value_noise,
    _ring_profile,
    _set_alpha_blend,
)

# ---------------------------------------------------------------------------------------------
# Frozen spec. Envelope: about 3 m wide and 14 m long, tractor + white box trailer.
# Blender axes: +Y = length (nose at -Y), +X = width, +Z = height, ground at Z = 0.
# ---------------------------------------------------------------------------------------------
NOSE_Y = -7.05
HOOD_END = -5.55          # cab front face / windscreen plane
CAB_BACK = -3.75
TRAILER_Y0 = -3.55
TRAILER_Y1 = 6.25
TRAILER_HW = 1.30
TRAILER_FLOOR = 1.30
TRAILER_TOP = 3.95
CAB_HW = 1.275
HOOD_TOP = 1.98
CAB_TOP = 3.05

WHEEL_R = 0.530
TYRE_HW = 0.128
STEER_Y = -5.85
DRIVE_Y = (-3.30, -2.62)
BOGIE_Y = (4.58, 5.28)
DUAL_INNER = 0.88
DUAL_OUTER = 1.18
STEER_X = 1.02

M_RED, M_WHITE, M_GLASS, M_RUBBER, M_CHROME, M_RED_LAMP, M_AMBER, M_DARK = range(8)
MATERIAL_NAMES = [
    "truck_paint_red",
    "trailer_paint_white",
    "truck_glass",
    "truck_rubber",
    "truck_chrome",
    "truck_lamp_red",
    "truck_lamp_amber",
    "truck_dark",
]


# ---------------------------------------------------------------------------------------------
# Textures: the bus's noise machinery, re-parameterised for two paint families
# ---------------------------------------------------------------------------------------------
def make_paint_maps(name: str, srgb, dirt_strength: float, size: int = 512) -> dict:
    """Base colour / roughness / normal for one paint family.

    `u` runs across the panel and `v` along it; road dirt is weighted to the lower edge (u near
    0) the way it collects on a truck flank, and the wear stays restrained.
    """
    v, u = np.meshgrid((np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size, indexing="ij")
    grain = fbm(u, v, 8, SEED + 401, 5)
    mottle = fbm(u, v, 3, SEED + 419, 3)
    streak = value_noise(u * 0.35, v, 32, SEED + 433)

    low = np.clip((0.26 - u) / 0.26, 0.0, 1.0) ** 1.3
    spray = np.clip(1.0 - np.abs(u - 0.12) / 0.16, 0.0, 1.0)
    dirt = np.clip(low * 0.9 + spray * 0.5, 0.0, 1.0) * (0.5 + 0.5 * grain) * dirt_strength

    base = np.stack([np.full((size, size), c) for c in srgb], axis=-1)
    base *= (0.96 + 0.08 * mottle)[..., None]
    base += (0.030 * (streak - 0.5))[..., None]
    base = base * (1.0 - 0.34 * dirt)[..., None] + np.array([0.40, 0.36, 0.31]) * (0.34 * dirt)[..., None]
    base = np.clip(base, 0.0, 1.0)
    colour = np.concatenate([base, np.ones((size, size, 1))], axis=-1)

    rough = np.clip(0.30 + 0.09 * grain + 0.34 * dirt + 0.05 * mottle, 0.05, 0.95)
    rough_rgba = np.stack([rough, rough, rough, np.ones_like(rough)], axis=-1)

    height = 0.6 * grain + 0.4 * fbm(u, v, 16, SEED + 457, 3)
    gx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    gy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx, ny, nz = -gx * 1.25, -gy * 1.25, np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5,
                       np.ones_like(height)], axis=-1)

    return {
        "basecolor": save_image(f"{name}_basecolor", colour.astype(np.float32), "sRGB"),
        "roughness": save_image(f"{name}_roughness", rough_rgba.astype(np.float32), "Non-Color"),
        "normal": save_image(f"{name}_normal", normal.astype(np.float32), "Non-Color"),
    }


def make_materials(red_maps: dict, white_maps: dict) -> list:
    mats = []
    for name in MATERIAL_NAMES:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mats.append(mat)

    def textured(index: int, maps: dict, coat: float) -> None:
        mat = mats[index]
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes["Principled BSDF"]
        for order, (slot, key, cs) in enumerate((("Base Color", "basecolor", "sRGB"),
                                                 ("Roughness", "roughness", "Non-Color"),
                                                 ("Normal", "normal", "Non-Color"))):
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(str(maps[key]), check_existing=True)
            tex.image.colorspace_settings.name = cs
            tex.location = (-700, 300 - 320 * order)
            if slot == "Normal":
                nm = nodes.new("ShaderNodeNormalMap")
                nm.inputs["Strength"].default_value = 0.75
                nm.location = (-380, -340)
                links.new(tex.outputs["Color"], nm.inputs["Color"])
                links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
            else:
                links.new(tex.outputs["Color"], bsdf.inputs[slot])
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.2

    textured(M_RED, red_maps, 0.5)
    textured(M_WHITE, white_maps, 0.3)

    def flat(index, colour, rough, metal, alpha=1.0, emission=None):
        bsdf = mats[index].node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
        if alpha < 1.0:
            _set_alpha_blend(mats[index])
            mats[index].use_backface_culling = False

    flat(M_GLASS, (0.355, 0.428, 0.455), 0.07, 0.0, alpha=0.60)
    flat(M_RUBBER, (0.050, 0.048, 0.047), 0.87, 0.0)
    flat(M_CHROME, (0.822, 0.828, 0.838), 0.185, 1.0)
    flat(M_RED_LAMP, (0.532, 0.038, 0.030), 0.15, 0.0, emission=(0.110, 0.005, 0.004))
    flat(M_AMBER, (0.688, 0.262, 0.022), 0.15, 0.0, emission=(0.135, 0.040, 0.003))
    flat(M_DARK, (0.072, 0.068, 0.063), 0.80, 0.0)
    return mats


# ---------------------------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------------------------
def truck_wheel(b: Builder, x: float, y: float, outer: int, lugs: bool) -> None:
    hw, r_bead = TYRE_HW, 0.318
    tyre = [
        (r_bead, -hw * 0.95),
        (0.402, -hw * 1.10),
        (0.492, -hw * 0.95),
        (0.526, -hw * 0.62),
        (0.530, 0.0),
        (0.526, hw * 0.62),
        (0.492, hw * 0.95),
        (0.402, hw * 1.10),
        (r_bead, hw * 0.95),
    ]
    revolve(b, tyre, (x, y, WHEEL_R), "x", 18, M_RUBBER, uv_span=0.9)
    rim = [
        (0.062, outer * 0.052),
        (0.160, outer * 0.058),
        (0.260, outer * 0.016),
        (0.302, outer * 0.028),
        (0.314, outer * 0.082),
        (0.314, -outer * 0.082),
        (0.302, -outer * 0.030),
        (0.062, -outer * 0.038),
    ]
    revolve(b, rim, (x, y, WHEEL_R), "x", 18, M_CHROME, uv_span=0.9)
    if lugs:
        revolve(b, _ring_profile(0.090, 0.028), (x + outer * 0.058, y, WHEEL_R), "x", 12, M_CHROME)
        for lug in range(5):
            a = 2.0 * math.pi * lug / 5.0 + 0.31
            revolve(b, [(0.0, 0.0), (0.021, 0.0), (0.021, 0.017), (0.0, 0.017)],
                    (x + outer * 0.060, y + 0.150 * math.cos(a), WHEEL_R + 0.150 * math.sin(a)),
                    "x", 6, M_CHROME)


def running_gear(b: Builder) -> None:
    for side in (-1, 1):
        truck_wheel(b, side * STEER_X, STEER_Y, side, True)
        for axle in DRIVE_Y + BOGIE_Y:
            truck_wheel(b, side * DUAL_INNER, axle, -side, False)
            truck_wheel(b, side * DUAL_OUTER, axle, side, True)
    for axle in (STEER_Y,) + DRIVE_Y + BOGIE_Y:
        r = 0.078 if axle == STEER_Y else 0.108
        revolve(b, [(0.0, -1.20), (r, -1.20), (r, 1.20), (0.0, 1.20)],
                (0.0, axle, WHEEL_R), "x", 10, M_DARK)
    # Mudflaps behind the drive tandem and the trailer bogie.
    for side in (-1, 1):
        chamfer_box(b, (side * 1.03, DRIVE_Y[1] + 0.62, 0.44), (0.64, 0.03, 0.60), M_RUBBER, 0.010)
        chamfer_box(b, (side * 1.03, BOGIE_Y[1] + 0.60, 0.44), (0.64, 0.03, 0.60), M_RUBBER, 0.010)


def fender_arch(b: Builder, x: float, y: float, radius: float, mat: int, half_len: float) -> None:
    """Superellipse arch over an axle, swept from the recipe's p = 2.6 profile."""
    path, us, vs = [], [], []
    for k in range(13):
        t = math.pi * (0.06 + 0.88 * k / 12.0)
        ca, sa = math.cos(t), math.sin(t)
        p = 2.6
        dy = math.copysign(abs(ca) ** (2.0 / p), ca) * (radius + 0.16)
        dz = abs(sa) ** (2.0 / p) * (radius + 0.10)
        path.append((x, y + dy, WHEEL_R + dz - 0.02))
        us.append((0.0, ca, sa))
        vs.append((1.0, 0.0, 0.0))
    sweep(b, path, us, vs, 0.030, half_len, mat)


# ---------------------------------------------------------------------------------------------
# Tractor
# ---------------------------------------------------------------------------------------------
def tractor(b: Builder) -> None:
    # Chassis rails and the fifth wheel.
    for side in (-1, 1):
        chamfer_box(b, (side * 0.42, -4.55, 0.88), (0.16, 4.70, 0.20), M_DARK, 0.014)
    chamfer_box(b, (0.0, -2.92, 1.18), (1.05, 0.95, 0.10), M_DARK, 0.016)
    chamfer_box(b, (0.0, -2.92, 1.06), (0.70, 0.60, 0.16), M_DARK, 0.016)

    # Bonnet: a tapered stack, narrowing and dropping towards the grille.
    hood_len = HOOD_END - NOSE_Y
    for i in range(6):
        t0, t1 = i / 6.0, (i + 1) / 6.0
        tm = (t0 + t1) / 2.0
        y0, y1 = NOSE_Y + hood_len * t0, NOSE_Y + hood_len * t1
        hw = 1.05 + 0.16 * (tm ** 0.7)
        top = HOOD_TOP - 0.20 * ((1.0 - tm) ** 1.6)
        chamfer_box(b, (0.0, (y0 + y1) / 2.0, (top + 0.86) / 2.0),
                    (hw * 2.0, y1 - y0 + 0.004, top - 0.86), M_RED, 0.040)
    # Front fenders over the steer wheels.
    for side in (-1, 1):
        fender_arch(b, side * 1.05, STEER_Y, WHEEL_R, M_RED, 0.20)

    # Grille and lamps.
    chamfer_box(b, (0.0, NOSE_Y + 0.09, 1.42), (1.30, 0.10, 0.86), M_DARK, 0.012)
    for bar in range(9):
        chamfer_box(b, (0.0, NOSE_Y + 0.045, 1.05 + bar * 0.092), (1.22, 0.045, 0.038), M_CHROME, 0.008)
    chamfer_box(b, (0.0, NOSE_Y + 0.055, 1.90), (1.34, 0.08, 0.10), M_CHROME, 0.012)
    for side in (-1, 1):
        revolve(b, _ring_profile(0.152, 0.050), (side * 0.90, NOSE_Y + 0.075, 1.12), "y", 16, M_CHROME)
        disc(b, (side * 0.90, NOSE_Y + 0.028, 1.12), 0.118, "y", 16, M_GLASS, -1.0)
        revolve(b, _ring_profile(0.070, 0.036), (side * 1.12, NOSE_Y + 0.16, 1.60), "y", 12, M_CHROME)
        disc(b, (side * 1.12, NOSE_Y + 0.128, 1.60), 0.052, "y", 12, M_AMBER, -1.0)
    chamfer_box(b, (0.0, NOSE_Y - 0.02, 0.80), (2.50, 0.16, 0.32), M_CHROME, 0.030)

    # Cab shell, with a softly rounded roof.
    cab_len = CAB_BACK - HOOD_END
    chamfer_box(b, (0.0, (HOOD_END + CAB_BACK) / 2.0, (1.02 + CAB_TOP) / 2.0),
                (CAB_HW * 2.0, cab_len, CAB_TOP - 1.02), M_RED, 0.085)
    # Windscreen, side glazing and door reveals.
    chamfer_box(b, (0.0, HOOD_END - 0.018, 2.50), (2.16, 0.055, 0.76), M_GLASS, 0.010)
    chamfer_box(b, (0.0, HOOD_END - 0.030, 2.50), (0.075, 0.050, 0.80), M_RED, 0.008)
    for side in (-1, 1):
        chamfer_box(b, (side * (CAB_HW - 0.006), -4.62, 1.90), (0.035, 1.36, 1.66), M_DARK, 0.010)
        chamfer_box(b, (side * (CAB_HW + 0.004), -4.62, 1.86), (0.030, 1.28, 1.54), M_RED, 0.012)
        chamfer_box(b, (side * (CAB_HW + 0.012), -4.86, 2.46), (0.022, 0.74, 0.60), M_GLASS, 0.008)
        chamfer_box(b, (side * (CAB_HW + 0.020), -4.18, 1.94), (0.040, 0.12, 0.05), M_CHROME, 0.010)
        # Mirror arms and heads.
        chamfer_box(b, (side * (CAB_HW + 0.085), HOOD_END + 0.10, 2.62), (0.19, 0.040, 0.040), M_DARK, 0.010)
        chamfer_box(b, (side * (CAB_HW + 0.165), HOOD_END + 0.10, 2.32), (0.040, 0.040, 0.62), M_DARK, 0.010)
        chamfer_box(b, (side * (CAB_HW + 0.172), HOOD_END + 0.12, 2.56), (0.050, 0.165, 0.52), M_CHROME, 0.012)
        # Fuel tank and step.
        revolve(b, [(0.0, -0.62), (0.295, -0.62), (0.295, 0.62), (0.0, 0.62)],
                (side * 1.10, -4.55, 0.92), "y", 16, M_CHROME)
        chamfer_box(b, (side * 1.06, -4.55, 0.44), (0.44, 0.70, 0.06), M_DARK, 0.010)
        # Exhaust stack behind the cab.
        revolve(b, [(0.0, 0.0), (0.068, 0.0), (0.068, 2.35), (0.0, 2.35)],
                (side * 1.16, CAB_BACK - 0.14, 1.05), "z", 12, M_CHROME)
    # Roof marker lamps.
    for k in range(5):
        chamfer_box(b, ((k - 2) * 0.34, HOOD_END + 0.10, CAB_TOP + 0.030), (0.11, 0.10, 0.055), M_AMBER, 0.012)


# ---------------------------------------------------------------------------------------------
# Trailer
# ---------------------------------------------------------------------------------------------
def trailer(b: Builder) -> None:
    length = TRAILER_Y1 - TRAILER_Y0
    mid_y = (TRAILER_Y0 + TRAILER_Y1) / 2.0
    mid_z = (TRAILER_FLOOR + TRAILER_TOP) / 2.0
    chamfer_box(b, (0.0, mid_y, mid_z), (TRAILER_HW * 2.0, length, TRAILER_TOP - TRAILER_FLOOR),
                M_WHITE, 0.055)
    # Vertical side ribs, swept so the flank reads as a panelled box rather than a slab.
    rib_count = 22
    for rib in range(rib_count):
        y = TRAILER_Y0 + 0.34 + rib * ((length - 0.68) / (rib_count - 1))
        for side in (-1, 1):
            sweep(b,
                  [(side * (TRAILER_HW + 0.004), y, TRAILER_FLOOR + 0.09),
                   (side * (TRAILER_HW + 0.004), y, TRAILER_TOP - 0.09)],
                  [(side, 0.0, 0.0)] * 2, [(0.0, 1.0, 0.0)] * 2, 0.018, 0.048, M_WHITE)
    # Top and bottom rails.
    for z in (TRAILER_FLOOR + 0.05, TRAILER_TOP - 0.05):
        for side in (-1, 1):
            sweep(b, [(side * (TRAILER_HW + 0.006), TRAILER_Y0 + 0.06, z),
                      (side * (TRAILER_HW + 0.006), TRAILER_Y1 - 0.06, z)],
                  [(side, 0.0, 0.0)] * 2, [(0.0, 0.0, 1.0)] * 2, 0.020, 0.042, M_CHROME)
    # Rear doors in a dark reveal, with hinges and a lock bar.
    chamfer_box(b, (0.0, TRAILER_Y1 + 0.010, mid_z), (TRAILER_HW * 2.0 - 0.10, 0.035,
                TRAILER_TOP - TRAILER_FLOOR - 0.10), M_DARK, 0.010)
    for leaf in (-1, 1):
        chamfer_box(b, (leaf * 0.62, TRAILER_Y1 + 0.032, mid_z), (1.14, 0.030,
                    TRAILER_TOP - TRAILER_FLOOR - 0.17), M_WHITE, 0.012)
        chamfer_box(b, (leaf * 0.30, TRAILER_Y1 + 0.055, mid_z), (0.045, 0.030,
                    TRAILER_TOP - TRAILER_FLOOR - 0.28), M_CHROME, 0.010)
        for hinge in range(3):
            chamfer_box(b, (leaf * 1.20, TRAILER_Y1 + 0.050, TRAILER_FLOOR + 0.45 + hinge * 0.85),
                        (0.09, 0.045, 0.16), M_CHROME, 0.010)
    # Underride bar, bogie frame, landing gear and lamps.
    chamfer_box(b, (0.0, TRAILER_Y1 - 0.12, 0.58), (1.90, 0.10, 0.13), M_DARK, 0.014)
    for side in (-1, 1):
        chamfer_box(b, (side * 0.86, TRAILER_Y1 - 0.30, 0.80), (0.10, 0.42, 0.44), M_DARK, 0.014)
        chamfer_box(b, (side * 0.94, (BOGIE_Y[0] + BOGIE_Y[1]) / 2.0, 1.14), (0.14, 1.70, 0.26), M_DARK, 0.014)
        chamfer_box(b, (side * 0.78, -1.55, 0.76), (0.16, 0.16, 1.10), M_DARK, 0.014)
        chamfer_box(b, (side * 0.78, -1.55, 0.16), (0.30, 0.42, 0.10), M_DARK, 0.012)
        for k, (z, mat) in enumerate(((0.80, M_RED_LAMP), (1.02, M_AMBER))):
            chamfer_box(b, (side * 1.14, TRAILER_Y1 + 0.045, z), (0.20, 0.035, 0.13), mat, 0.012)
    chamfer_box(b, (0.0, TRAILER_Y0 - 0.012, mid_z), (TRAILER_HW * 2.0 - 0.14, 0.030,
                TRAILER_TOP - TRAILER_FLOOR - 0.14), M_WHITE, 0.014)


def main() -> None:
    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.preferences.filepaths.save_version = 0

    red_maps = make_paint_maps("truck_red", (0.474, 0.088, 0.072), 1.0)
    white_maps = make_paint_maps("trailer_white", (0.836, 0.828, 0.798), 0.85)
    mats = make_materials(red_maps, white_maps)

    shell = Builder()
    tractor(shell)
    trailer(shell)
    running_gear(shell)

    obj = to_object("HeroTruck", shell, mats)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(32.0), keep_sharp_edges=True)

    mesh = obj.data
    mesh.calc_loop_triangles()
    tris = len(mesh.loop_triangles)
    used = sorted({p.material_index for p in mesh.polygons})
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mins = [min(p[i] for p in bb) for i in range(3)]
    maxs = [max(p[i] for p in bb) for i in range(3)]

    blend_path = BLEND_DIR / "hero-truck.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=False)

    glb_path = ASSET_DIR / "hero-truck.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_normals=True, export_texcoords=True, export_materials="EXPORT",
        export_image_format="AUTO", export_cameras=False, export_lights=False,
        export_animations=False, export_extras=False,
    )

    report = {
        "blender": bpy.app.version_string,
        "buildHash": bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "seed": SEED,
        "indexedTriangles": tris,
        "materialSlots": len(mesh.materials),
        "materialGroupsUsed": [MATERIAL_NAMES[i] for i in used],
        "boundsGltfYUp": {
            "widthX": round(maxs[0] - mins[0], 4),
            "heightY": round(maxs[2] - mins[2], 4),
            "lengthZ": round(maxs[1] - mins[1], 4),
        },
        "minZ": round(mins[2], 4),
        "hasUV": bool(mesh.uv_layers),
        "blend": str(blend_path.relative_to(REPO)).replace("\\", "/"),
        "glb": str(glb_path.relative_to(REPO)).replace("\\", "/"),
        "glbBytes": glb_path.stat().st_size,
    }
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
