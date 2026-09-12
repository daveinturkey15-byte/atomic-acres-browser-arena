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
    UV_SCALE,
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
# Steer axle sits near mid-hood, as it does on the reference conventional tractor. Measured
# against the recipe's proportion band: front overhang 0.85 m / wheelbase 3.34 m = 25% (band 29%),
# axle-to-cowl 0.75 m = 22% (band 22%). The old -5.85 put the axle 0.30 m from the windscreen.
STEER_Y = -6.30
DRIVE_Y = (-3.30, -2.62)
BOGIE_Y = (4.58, 5.28)
DUAL_INNER = 0.88
DUAL_OUTER = 1.18
STEER_X = 1.00

# --- Station-ring sections (vehicle-recipe sections 2-4) --------------------------------------
# Two lofts, because a conventional tractor is two units: a tilting hood/fender assembly and the
# cab behind it, parted by a real shut gap. Each loft is a quad grid through closed rings whose
# flank is anchored once, globally, by `_profile_x`.
HOOD_Z_UNDER = 0.735       # closed underside of the hood/fender unit
HOOD_Z_SKIRT = 0.820       # fender lower edge away from the arch
HOOD_Z_SILL = 0.980        # nominal sill the flank profile is anchored to
HOOD_Z_BELT = 1.630        # hood shoulder line (widest section)
HOOD_HW_SILL = 1.085
HOOD_HW_BELT = 1.205
HOOD_HW_TOP = 1.052        # tumblehome at the shoulder: hwTop < hwBelt
HOOD_SHOULDER_R = 0.165
HOOD_CROWN = 0.018         # the hood top is crowned, not a flat lid
HOOD_LINER_X = 0.840       # inner fender wall stays inboard of the tyre's inner face (0.872)
ARCH_W = WHEEL_R + 0.150   # superellipse half width, p = 2.6
ARCH_H = WHEEL_R + 0.055
ARCH_P = 2.6

CAB_Z_FLOOR = 0.990
CAB_Z_SILL = 1.260
CAB_Z_BELT = 2.060         # window sill line
CAB_Z_WIN = 2.820          # window head
CAB_Z_TOP = 3.050          # roof crown
CAB_R_TOP = 0.200
CAB_HW_SILL = 1.222
CAB_HW_BELT = 1.275
CAB_HW_TOP = 1.232         # tumblehome above the belt
CAB_BAND_INSET = 0.050     # depth of the glazing recess cut into the loft
CAB_GLASS_PROUD = 0.020
WINDSCREEN_RAKE = 0.22     # ~12 degrees back from vertical over the glazed height
DOOR_Y = (-5.235, -4.065)
HOOD_GAP = 0.032           # hood-to-cab shut gap

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
def make_panel_normal(size: int = 512) -> Path:
    """One panel normal map, shared by both paint families.

    Both families drew their height field from the same seeds, so the two maps were bit-identical
    and the GLB embedded the same PNG twice. Generating it once keeps the material response
    exactly what it was and drops a duplicate image from the binary.
    """
    v, u = np.meshgrid((np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size, indexing="ij")
    height = 0.6 * fbm(u, v, 8, SEED + 401, 5) + 0.4 * fbm(u, v, 16, SEED + 457, 3)
    gx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    gy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx, ny, nz = -gx * 1.25, -gy * 1.25, np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5,
                       np.ones_like(height)], axis=-1)
    return save_image("truck_panel_normal", normal.astype(np.float32), "Non-Color")


def make_paint_maps(name: str, srgb, dirt_strength: float, normal_path: Path,
                    size: int = 512) -> dict:
    """Base colour / roughness for one paint family, sharing the panel normal map.

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

    return {
        "basecolor": save_image(f"{name}_basecolor", colour.astype(np.float32), "sRGB"),
        "roughness": save_image(f"{name}_roughness", rough_rgba.astype(np.float32), "Non-Color"),
        "normal": normal_path,
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


# ---------------------------------------------------------------------------------------------
# Station rings (vehicle-recipe sections 2-4)
# ---------------------------------------------------------------------------------------------
def _profile_x(z: float, z0: float, z1: float, hw0: float, hw1: float) -> float:
    """The globally anchored flank: x(z) = hw0 + (hw1 - hw0) * t**0.45 between nominal sill/belt.

    Where the lower edge lifts over a wheel arch the points still read off this one curve, so the
    fender cannot grow its own bulge and crease the skin behind it.
    """
    t = min(1.0, max(0.0, (z - z0) / (z1 - z0)))
    return hw0 + (hw1 - hw0) * (t ** 0.45)


def _tumble_x(z: float, z0: float, z1: float, hw0: float, hw1: float) -> float:
    t = min(1.0, max(0.0, (z - z0) / (z1 - z0)))
    return hw0 + (hw1 - hw0) * (t * t * (3.0 - 2.0 * t))


def arch_z(y: float) -> float:
    """Fender lower edge over the steer axle: |d/w|^p + |(z-R)/h|^p = 1 with p = 2.6."""
    d = abs(y - STEER_Y)
    if d >= ARCH_W:
        return HOOD_Z_SKIRT
    lift = WHEEL_R + ARCH_H * (1.0 - (d / ARCH_W) ** ARCH_P) ** (1.0 / ARCH_P)
    return max(HOOD_Z_SKIRT, lift)


def hood_top_z(y: float) -> float:
    """Hood top line: falls towards the grille, so the nose drops away from the windscreen."""
    t = (y - NOSE_Y) / (HOOD_END - NOSE_Y)
    return HOOD_TOP - 0.145 * ((1.0 - t) ** 1.45)


def hood_scale(y: float) -> float:
    """One width scale per station - nose taper plus a fender blister over the steer axle."""
    t = (y - NOSE_Y) / (HOOD_END - NOSE_Y)
    taper = 0.944 + 0.056 * (min(1.0, t / 0.32) ** 0.7)
    d = abs(y - STEER_Y) / 0.96
    return taper + 0.060 * (max(0.0, 1.0 - d * d) ** 1.25)


def hood_ring_half(y: float) -> list[tuple[float, float]]:
    """Right half of a hood/fender station, underside centre to crown centre."""
    s = hood_scale(y)
    hw_sill, hw_belt, hw_top = HOOD_HW_SILL * s, HOOD_HW_BELT * s, HOOD_HW_TOP * s
    z_top = hood_top_z(y)
    z_belt = min(HOOD_Z_BELT, z_top - 0.06)      # recipe clamp: belt <= top - 0.03
    z_low = arch_z(y)
    x_low = _profile_x(z_low, HOOD_Z_SILL, z_belt, hw_sill, hw_belt)
    r = min(HOOD_SHOULDER_R, (z_top - z_belt) * 0.9, hw_top * 0.5)
    flank = lambda f: (_profile_x(z_low + (z_belt - z_low) * f, HOOD_Z_SILL, z_belt, hw_sill, hw_belt),
                       z_low + (z_belt - z_low) * f)
    shoulder_z = z_belt + (z_top - r - z_belt) * 0.55
    pts = [
        (0.0, HOOD_Z_UNDER),
        (min(x_low * 0.56, HOOD_LINER_X * 0.72), HOOD_Z_UNDER),
        (min(x_low * 0.92, HOOD_LINER_X), HOOD_Z_UNDER + (z_low - HOOD_Z_UNDER) * 0.55),
        (x_low, z_low),                                   # fender lip, on the global profile
        flank(0.36),
        flank(0.72),
        (hw_belt, z_belt),                                # shoulder line: widest section
        (_tumble_x(shoulder_z, z_belt, z_top - r, hw_belt, hw_top), shoulder_z),
        (hw_top, z_top - r),
    ]
    for k in (1, 2, 3):                                   # shoulder radius
        a = (math.pi / 2.0) * k / 3.0
        pts.append((hw_top - r + r * math.cos(a), z_top - r + r * math.sin(a)))
    pts.append(((hw_top - r) * 0.45, z_top + HOOD_CROWN * 0.72))   # crowned top panel
    pts.append((0.0, z_top + HOOD_CROWN))
    return pts


def cab_ring_half(scale: float, band: bool) -> list[tuple[float, float, int]]:
    """Right half of a cab station as (x, z, row-kind); 0 = paint, 1 = glazing recess, 2 = roof."""
    hs, hb, ht = CAB_HW_SILL * scale, CAB_HW_BELT * scale, CAB_HW_TOP * scale
    inset = CAB_BAND_INSET if band else 0.0
    r = min(CAB_R_TOP, (CAB_Z_TOP - CAB_Z_BELT) * 0.9, ht * 0.5)
    z_sh = CAB_Z_TOP - r
    x_sh = _tumble_x(z_sh, CAB_Z_BELT, z_sh, hb, ht)
    flank = lambda f: (_profile_x(CAB_Z_SILL + (CAB_Z_BELT - CAB_Z_SILL) * f,
                                  CAB_Z_SILL, CAB_Z_BELT, hs, hb),
                       CAB_Z_SILL + (CAB_Z_BELT - CAB_Z_SILL) * f)
    z_mid = (CAB_Z_BELT + CAB_Z_WIN) / 2.0
    pts: list[tuple[float, float, int]] = [
        (0.0, CAB_Z_FLOOR, 0),
        (hs * 0.66, CAB_Z_FLOOR, 0),
        (hs * 0.965, CAB_Z_FLOOR + 0.040, 0),
        (hs, CAB_Z_SILL, 0),
        (*flank(0.38), 0),
        (*flank(0.74), 0),
        (hb, CAB_Z_BELT, 0),
        (hb - inset, CAB_Z_BELT + 0.007, 1),                                   # recess lower lip
        (_tumble_x(z_mid, CAB_Z_BELT, z_sh, hb, ht) - inset, z_mid, 1),
        (_tumble_x(CAB_Z_WIN, CAB_Z_BELT, z_sh, hb, ht) - inset, CAB_Z_WIN - 0.007, 1),
        (_tumble_x(CAB_Z_WIN, CAB_Z_BELT, z_sh, hb, ht), CAB_Z_WIN, 0),        # drip lip
        (x_sh, z_sh, 2),
    ]
    for k in (1, 2, 3):                                   # roof corner radius, then a flat panel
        a = (math.pi / 2.0) * k / 3.0
        pts.append((x_sh - r + r * math.cos(a), z_sh + r * math.sin(a), 2))
    pts.append((0.0, CAB_Z_TOP, 2))
    return pts


def cab_skin_x(z: float) -> float:
    """Outer half width of the cab at any height - the one source the door parts follow."""
    if z <= CAB_Z_FLOOR + 0.040:
        return CAB_HW_SILL * 0.965
    if z <= CAB_Z_SILL:
        t = (z - (CAB_Z_FLOOR + 0.040)) / (CAB_Z_SILL - CAB_Z_FLOOR - 0.040)
        return CAB_HW_SILL * (0.965 + 0.035 * t)
    if z <= CAB_Z_BELT:
        return _profile_x(z, CAB_Z_SILL, CAB_Z_BELT, CAB_HW_SILL, CAB_HW_BELT)
    return _tumble_x(z, CAB_Z_BELT, CAB_Z_TOP - CAB_R_TOP, CAB_HW_BELT, CAB_HW_TOP)


def front_y(z: float) -> float:
    """The raked windscreen plane; vertical below the belt, leaning back over the glazing."""
    return HOOD_END + WINDSCREEN_RAKE * max(0.0, z - CAB_Z_BELT)


def _ring_u(half: list[tuple[float, float]]) -> list[float]:
    pts = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half[1:-1])]
    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = arc[-1] + math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    return [a / total for a in arc]


def ring_at(b: Builder, half: list[tuple[float, float]], y_of) -> list[int]:
    ids = [b.add_vert(x, y_of(z), z) for x, z in half]
    ids += [b.add_vert(-x, y_of(z), z) for x, z in reversed(half[1:-1])]
    return ids


def loft_rings(b: Builder, rings, ys, us, kinds, mat_skin: int, mat_band: int) -> None:
    n = len(us)
    for i in range(len(rings) - 1):
        v0, v1 = ys[i] / UV_SCALE, ys[i + 1] / UV_SCALE
        for j in range(n):
            j2 = (j + 1) % n
            mat = mat_band if (kinds[j] == 1 and kinds[j2] == 1) else mat_skin
            u0, u1 = us[j], (us[j2] if j2 else 1.0)
            b.add_face([rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2]], mat,
                       [(u0, v0), (u0, v1), (u1, v1), (u1, v0)])


def cap_ring(b: Builder, ring: list[int], y_apex: float, z_apex: float, mat_of) -> None:
    """Close a loft end onto a recessed apex; the material is chosen per face from its own rows."""
    pts = [b.verts[i] for i in ring]
    centre = b.add_vert(0.0, y_apex, z_apex)
    for k in range(len(ring)):
        k2 = (k + 1) % len(ring)
        b.add_face([centre, ring[k], ring[k2]], mat_of(pts[k], pts[k2]))


def hood_stations() -> list[float]:
    """Feature edges, a 0.15 m background spacing, and 17 stations across the wheel arch."""
    end = HOOD_END - HOOD_GAP
    ys = {NOSE_Y, NOSE_Y + 0.055, end}
    y = NOSE_Y
    while y < end:
        ys.add(round(y, 4))
        y += 0.15
    for k in range(17):
        ys.add(round(STEER_Y - ARCH_W + 2.0 * ARCH_W * k / 16.0, 4))
    return sorted(v for v in ys if NOSE_Y - 1e-6 <= v <= end + 1e-6)


def cab_stations() -> list[float]:
    ys = {HOOD_END, HOOD_END + 0.05, CAB_BACK - 0.05, CAB_BACK}
    for y in DOOR_Y:
        ys.add(round(y - 0.055, 4))
        ys.add(round(y + 0.055, 4))
    y = HOOD_END
    while y < CAB_BACK:
        ys.add(round(y, 4))
        y += 0.24
    return sorted(v for v in ys if HOOD_END - 1e-6 <= v <= CAB_BACK + 1e-6)


def build_hood(b: Builder) -> dict:
    """The hood/fender unit as one loft: arch cut into the skin, not a tube laid over it."""
    ys = hood_stations()
    us = _ring_u(hood_ring_half(ys[0]))
    rings = [ring_at(b, hood_ring_half(y), (lambda z, yy=y: yy)) for y in ys]
    loft_rings(b, rings, ys, us, [0] * len(us), M_RED, M_RED)

    def nose_mat(p, q):
        if max(abs(p[0]), abs(q[0])) > 0.80 or min(p[2], q[2]) > 1.70:
            return M_RED                         # painted frame around the grille aperture
        return M_DARK                            # grille cavity

    cap_ring(b, rings[0], ys[0] + 0.075, 1.40, nose_mat)
    cap_ring(b, rings[-1], ys[-1] - 0.05, 1.30, lambda p, q: M_DARK)
    # Fender lip bead, swept from the loft's own arch-edge points (recipe section 8).
    lip = [y for y in ys if abs(y - STEER_Y) <= ARCH_W - 0.012]
    for side in (-1, 1):
        path, uax, vax = [], [], []
        for y in lip:
            z = arch_z(y)
            s = hood_scale(y)
            x = _profile_x(z, HOOD_Z_SILL, min(HOOD_Z_BELT, hood_top_z(y) - 0.06),
                           HOOD_HW_SILL * s, HOOD_HW_BELT * s)
            path.append((side * (x - 0.012), y, z - 0.014))
            uax.append((side, 0.0, 0.0))
            vax.append((0.0, 0.0, 1.0))
        sweep(b, path, uax, vax, 0.016, 0.020, M_RED)
    return {"hoodStations": len(ys), "hoodRing": len(us)}


def build_cab(b: Builder, liner: Builder) -> dict:
    """Cab shell with the glazing recess cut into the loft, plus a dark liner behind the glass."""
    ys = cab_stations()
    half = cab_ring_half(1.0, True)
    xz = [(x, z) for x, z, _k in half]
    us = _ring_u(xz)
    kinds = [k for _x, _z, k in half] + [k for _x, _z, k in reversed(half[1:-1])]
    rings = []
    for i, y in enumerate(ys):
        rake = WINDSCREEN_RAKE if i == 0 else 0.0
        rings.append(ring_at(b, xz, (lambda z, yy=y, rk=rake: yy + rk * max(0.0, z - CAB_Z_BELT))))
    loft_rings(b, rings, ys, us, kinds, M_RED, M_DARK)
    cap_ring(b, rings[0], ys[0] + 0.10, CAB_Z_BELT,
             lambda p, q: M_RED if max(p[2], q[2]) <= CAB_Z_BELT + 1e-4 else M_DARK)
    cap_ring(b, rings[-1], ys[-1] - 0.04, 2.00, lambda p, q: M_RED)

    inner_xz = [(x, z) for x, z, _k in cab_ring_half(0.945, True)]
    inner_us = _ring_u(inner_xz)
    inner_kinds = kinds
    inner = []
    for i, y in enumerate(ys):
        rake = WINDSCREEN_RAKE if i == 0 else 0.0
        dy = 0.11 if i == 0 else (-0.06 if i == len(ys) - 1 else 0.0)
        inner.append(ring_at(liner, inner_xz,
                             (lambda z, yy=y + dy, rk=rake: yy + rk * max(0.0, z - CAB_Z_BELT))))
    loft_rings(liner, inner, ys, inner_us, inner_kinds, M_DARK, M_DARK)
    cap_ring(liner, inner[0], ys[0] + 0.12, CAB_Z_BELT, lambda p, q: M_DARK)
    cap_ring(liner, inner[-1], ys[-1] - 0.06, 2.00, lambda p, q: M_DARK)
    return {"cabStations": len(ys), "cabRing": len(us)}


def windscreen(b: Builder) -> int:
    """Two gasket-set panes on the raked plane, with pillars, header and a sun visor."""
    def plane_slab(x_c: float, half_w: float, z0: float, z1: float, proud: float,
                   half_th: float, mat: int, steps: int = 5) -> None:
        zs = [z0 + (z1 - z0) * k / steps for k in range(steps + 1)]
        sweep(b, [(x_c, front_y(z) - proud, z) for z in zs],
              [(0.0, -1.0, 0.0)] * len(zs), [(1.0, 0.0, 0.0)] * len(zs), half_th, half_w, mat)

    z0, z1 = CAB_Z_BELT + 0.040, CAB_Z_WIN - 0.040
    panes = 0
    for side in (-1, 1):
        plane_slab(side * 0.600, 0.530, z0, z1, 0.006, 0.012, M_GLASS)
        plane_slab(side * 1.168, 0.062, z0 - 0.030, z1 + 0.030, 0.012, 0.022, M_RED)   # A-pillar
        panes += 1
    plane_slab(0.0, 0.046, z0 - 0.030, z1 + 0.030, 0.012, 0.024, M_RED)                # centre post
    plane_slab(0.0, 1.230, z1 + 0.030, z1 + 0.062, 0.012, 0.024, M_RED)                # header
    plane_slab(0.0, 1.230, z0 - 0.062, z0 - 0.030, 0.012, 0.024, M_RED)                # lower rail
    # Sun visor over the header, standing off the glass the way the reference cab carries it.
    chamfer_box(b, (0.0, front_y(CAB_Z_WIN) - 0.075, CAB_Z_WIN + 0.105), (2.38, 0.20, 0.045),
                M_DARK, 0.012)
    for side in (-1, 1):                                   # wiper arms parked on the lower rail
        sweep(b, [(side * 0.18, front_y(z0) - 0.026, z0 - 0.010), (side * 0.86, front_y(z0) - 0.026, z0 + 0.150)],
              [(0.0, -1.0, 0.0)] * 2, [(0.0, 0.0, 1.0)] * 2, 0.011, 0.013, M_DARK)
    return panes


def cab_side(b: Builder) -> int:
    """Door shut lines, glazing seated in the loft's recess, painted fillers where it is blind."""
    y0, y1 = DOOR_Y
    z_lo, z_hi = 1.090, CAB_Z_WIN - 0.030
    z_mid = (CAB_Z_BELT + CAB_Z_WIN) / 2.0
    seat = _tumble_x(z_mid, CAB_Z_BELT, CAB_Z_TOP - CAB_R_TOP, CAB_HW_BELT, CAB_HW_TOP) - CAB_BAND_INSET
    panes = 0
    for side in (-1, 1):
        # Shut lines: an 8 mm gap 10 mm deep, bracketing the door skin.
        for y in (y0, y1):
            zs = [z_lo + (z_hi - z_lo) * k / 5.0 for k in range(6)]
            sweep(b, [(side * (cab_skin_x(z) - 0.010), y, z) for z in zs],
                  [(side, 0.0, 0.0)] * len(zs), [(0.0, 1.0, 0.0)] * len(zs), 0.011, 0.004, M_DARK)
        ys_b = [y0 + (y1 - y0) * k / 6.0 for k in range(7)]
        sweep(b, [(side * (cab_skin_x(z_lo) - 0.010), y, z_lo) for y in ys_b],
              [(side, 0.0, 0.0)] * len(ys_b), [(0.0, 0.0, 1.0)] * len(ys_b), 0.011, 0.004, M_DARK)
        # Door glass in the recess, plus a quarter light ahead of the door frame.
        chamfer_box(b, (side * (seat + CAB_GLASS_PROUD), (y0 + y1) / 2.0 + 0.06, z_mid + 0.010),
                    (0.012, (y1 - y0) - 0.20, CAB_Z_WIN - CAB_Z_BELT - 0.115), M_GLASS, 0.004)
        chamfer_box(b, (side * (seat + CAB_GLASS_PROUD), y0 - 0.085, z_mid + 0.010),
                    (0.012, 0.130, CAB_Z_WIN - CAB_Z_BELT - 0.115), M_GLASS, 0.004)
        panes += 2
        # Painted fillers: the recess is only glazed over the door, so the blind spans get skin.
        for (fy0, fy1) in ((HOOD_END + 0.02, y0 - 0.155), (y1 - 0.08, CAB_BACK - 0.02)):
            ys_f = [fy0, fy1]
            sweep(b, [(side * (seat + CAB_BAND_INSET * 0.5), y, z_mid) for y in ys_f],
                  [(side, 0.0, 0.0)] * 2, [(0.0, 0.0, 1.0)] * 2,
                  CAB_BAND_INSET * 0.52, (CAB_Z_WIN - CAB_Z_BELT) / 2.0, M_RED)
        # Window frame pillars bridging the recess back to the skin.
        for y in (y0 - 0.150, y0 - 0.020, y1 - 0.020):
            chamfer_box(b, (side * (seat + CAB_BAND_INSET * 0.5), y, z_mid),
                        (CAB_BAND_INSET * 1.05, 0.048, CAB_Z_WIN - CAB_Z_BELT), M_RED, 0.008)
        # Handle and a grab rail on the A-pillar edge.
        chamfer_box(b, (side * (cab_skin_x(1.86) + 0.014), y0 + 0.30, 1.860), (0.032, 0.180, 0.048),
                    M_CHROME, 0.010)
        sweep(b, [(side * (cab_skin_x(z) + 0.012), y0 - 0.24, z) for z in (1.28, 1.62, 1.96)],
              [(side, 0.0, 0.0)] * 3, [(0.0, 1.0, 0.0)] * 3, 0.015, 0.015, M_CHROME)
    return panes


def cab_interior(b: Builder) -> None:
    """Dash, wheel and two seats, so the glass reads as a cab rather than a tinted slab."""
    chamfer_box(b, (0.0, HOOD_END + 0.26, 1.760), (2.20, 0.44, 0.34), M_DARK, 0.020)
    revolve(b, [(0.155, 0.0), (0.235, 0.0), (0.235, 0.026), (0.155, 0.026)],
            (-0.62, HOOD_END + 0.60, 2.010), "y", 16, M_DARK)
    for side in (-1, 1):
        chamfer_box(b, (side * 0.60, HOOD_END + 1.10, 1.560), (0.56, 0.52, 0.18), M_DARK, 0.020)
        chamfer_box(b, (side * 0.60, HOOD_END + 1.34, 2.010), (0.56, 0.16, 0.72), M_DARK, 0.020)


# ---------------------------------------------------------------------------------------------
# Tractor
# ---------------------------------------------------------------------------------------------
def tractor(b: Builder, liner: Builder) -> dict:
    # Chassis rails and the fifth wheel.
    for side in (-1, 1):
        chamfer_box(b, (side * 0.42, -4.55, 0.88), (0.16, 4.70, 0.20), M_DARK, 0.014)
    chamfer_box(b, (0.0, -2.92, 1.18), (1.05, 0.95, 0.10), M_DARK, 0.016)
    chamfer_box(b, (0.0, -2.92, 1.06), (0.70, 0.60, 0.16), M_DARK, 0.016)

    info = build_hood(b)
    info.update(build_cab(b, liner))
    info["panes"] = windscreen(b) + cab_side(b)
    cab_interior(liner)

    # Grille: chrome bars set 10 mm inside the nose plane, in the cap's own dark cavity.
    nose_top = hood_top_z(NOSE_Y) + HOOD_CROWN
    for bar in range(9):
        chamfer_box(b, (0.0, NOSE_Y + 0.036, 1.000 + bar * 0.085), (1.48, 0.048, 0.040),
                    M_CHROME, 0.008)
    chamfer_box(b, (0.0, NOSE_Y + 0.020, 1.745), (1.56, 0.070, 0.075), M_CHROME, 0.012)
    chamfer_box(b, (0.0, NOSE_Y + 0.020, 0.930), (1.56, 0.070, 0.070), M_CHROME, 0.012)
    for side in (-1, 1):
        # Rectangular headlamp: chrome bucket, then the lens 5 mm proud (layer order = depth order).
        chamfer_box(b, (side * 0.925, NOSE_Y + 0.045, 1.180), (0.300, 0.110, 0.215), M_CHROME, 0.012)
        chamfer_box(b, (side * 0.925, NOSE_Y - 0.006, 1.180), (0.262, 0.040, 0.176), M_GLASS, 0.008)
        revolve(b, _ring_profile(0.072, 0.038), (side * 1.010, NOSE_Y + 0.030, 1.600), "y", 12, M_CHROME)
        disc(b, (side * 1.010, NOSE_Y - 0.004, 1.600), 0.054, "y", 12, M_AMBER, -1.0)
        # Air cleaner canister against the cowl, as the reference tractor carries it.
        revolve(b, [(0.0, 0.0), (0.115, 0.0), (0.115, 1.32), (0.0, 1.32)],
                (side * 1.360, HOOD_END - 0.225, 1.100), "z", 14, M_CHROME)
        for z in (1.30, 2.24):
            revolve(b, _ring_profile(0.128, 0.035), (side * 1.360, HOOD_END - 0.225, z), "z", 14, M_DARK)
    # Front bumper: wider than the nose, wrapping back at the ends, with a plate panel.
    chamfer_box(b, (0.0, NOSE_Y - 0.048, 0.800), (2.52, 0.155, 0.320), M_CHROME, 0.030)
    chamfer_box(b, (0.0, NOSE_Y - 0.130, 0.800), (0.56, 0.030, 0.200), M_DARK, 0.010)
    for side in (-1, 1):
        chamfer_box(b, (side * 1.255, NOSE_Y + 0.130, 0.800), (0.130, 0.400, 0.320), M_CHROME, 0.030)
        # Mirrors on the cab's front corner; the widest point of the prop stays inside 3.0 m.
        chamfer_box(b, (side * 1.360, HOOD_END + 0.10, 2.620), (0.190, 0.040, 0.040), M_DARK, 0.010)
        chamfer_box(b, (side * 1.440, HOOD_END + 0.10, 2.320), (0.040, 0.040, 0.620), M_DARK, 0.010)
        chamfer_box(b, (side * 1.447, HOOD_END + 0.12, 2.560), (0.050, 0.165, 0.520), M_CHROME, 0.012)
        # Fuel tank, step and the exhaust stack behind the cab.
        revolve(b, [(0.0, -0.62), (0.295, -0.62), (0.295, 0.62), (0.0, 0.62)],
                (side * 1.100, -4.55, 0.920), "y", 16, M_CHROME)
        chamfer_box(b, (side * 1.060, -4.55, 0.440), (0.440, 0.700, 0.060), M_DARK, 0.010)
        revolve(b, [(0.0, 0.0), (0.068, 0.0), (0.068, 2.35), (0.0, 2.35)],
                (side * 1.220, CAB_BACK + 0.070, 1.050), "z", 12, M_CHROME)
    for k in range(5):  # roof marker lamps, behind the raked front roof edge
        chamfer_box(b, ((k - 2) * 0.34, HOOD_END + 0.32, CAB_Z_TOP + 0.028), (0.11, 0.10, 0.055),
                    M_AMBER, 0.012)
    return info


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

    panel_normal = make_panel_normal()
    red_maps = make_paint_maps("truck_red", (0.474, 0.088, 0.072), 1.0, panel_normal)
    white_maps = make_paint_maps("trailer_white", (0.836, 0.828, 0.798), 0.85, panel_normal)
    mats = make_materials(red_maps, white_maps)

    shell = Builder()
    liner = Builder()
    info = tractor(shell, liner)
    trailer(shell)
    running_gear(shell)

    # Centre the prop on its own origin. The spec places the rig at Z = -2 in the scene; with the
    # frame anchored on the fifth wheel the visual centre sat 0.41 m behind that point, so the
    # declared placement and the 14 m envelope disagreed. Presentation only - no collider derives
    # from this, and the geometry itself is unmoved relative to every other part of the truck.
    all_y = [v[1] for v in shell.verts] + [v[1] for v in liner.verts]
    centre_shift = round(-(min(all_y) + max(all_y)) / 2.0, 4)
    for builder in (shell, liner):
        builder.verts = [(x, y + centre_shift, z) for x, y, z in builder.verts]

    obj = to_object("HeroTruck", shell, mats)
    liner_obj = to_object("HeroTruckInterior", liner, mats, flip=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    liner_obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()

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
        "centreShiftY": centre_shift,
        "hoodStations": info["hoodStations"],
        "hoodRingPoints": info["hoodRing"],
        "cabStations": info["cabStations"],
        "cabRingPoints": info["cabRing"],
        "glassPanes": info["panes"],
        "boundsBlenderXYZ": {"min": [round(v, 4) for v in mins], "max": [round(v, 4) for v in maxs]},
        "boundsGltfYUp": {
            "widthX": round(maxs[0] - mins[0], 4),
            "heightY": round(maxs[2] - mins[2], 4),
            "lengthZ": round(maxs[1] - mins[1], 4),
        },
        "gltfZRange": [round(-maxs[1], 4), round(-mins[1], 4)],
        "minZ": round(mins[2], 4),
        "hasUV": bool(mesh.uv_layers),
        "blend": str(blend_path.relative_to(REPO)).replace("\\", "/"),
        "glb": str(glb_path.relative_to(REPO)).replace("\\", "/"),
        "glbBytes": glb_path.stat().st_size,
    }
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
