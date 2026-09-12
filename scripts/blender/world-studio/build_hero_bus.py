"""Author the world-studio hero bus in Blender 5.1 and export a runtime glTF binary.

Runs INSIDE Blender (``blender --background --factory-startup --python this_file``); launch it
through ``blender_launcher.py`` so the machine-wide Blender lock is honoured.

Method applied (see docs/world-studio-blender-assets.md for the provenance table):

  * ``photoreal-procedural-scene-forge`` / ``references/vehicle-recipe.md`` - the station-ring
    loft. One globally anchored flank profile ``x(y) = hwSill + (hwBelt - hwSill) * t**0.45``,
    tumblehome ``hwTop < hwBelt``, a clamped per-station top radius, stations collected from
    every feature edge plus a background spacing, and trim built from the loft's own edge
    points rather than from the feature it decorates. Glass is seated in a recess cut into the
    loft itself instead of being laid proud of a closed body.
  * ``atomic-acres-procedural-art-authoring`` - presentation only (this file emits no collider,
    spawn or navigation data), deterministic (seeded integer hash, no ``random``), budgets
    frozen before the pass and reported as measured, and textures synthesised at true physical
    size rather than downloaded.

Everything is CPU: mesh construction in Python, texture synthesis in numpy, glTF export. No
render, no Cycles, no GPU device is requested.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

REPO = Path(__file__).resolve().parents[3]
BLEND_DIR = REPO / "scripts" / "blender" / "world-studio" / "source"
ASSET_DIR = REPO / "public" / "assets" / "world-studio" / "blender"
SEED = 20260912

# ---------------------------------------------------------------------------------------------
# Frozen spec. Game envelope: 3.0 m wide, 3.2 m high, 10 m long, long axis Z after Y-up export.
# Modelled in Blender with +Y = length (nose at -Y), +Z = height, ground at Z = 0.
# ---------------------------------------------------------------------------------------------
LENGTH = 9.84
HALF_LEN = LENGTH / 2.0
# Body width leaves room for the mirrors: the whole prop, mirrors included, stays inside the
# 3.0 m game envelope, so the body itself is 2.70 m across the belt line.
HW_SILL = 1.262          # half width at the sill
HW_BELT = 1.352          # half width at the belt line (widest body section: 2.704 m)
# Tumblehome is deliberately small (34 mm across the glazing): on a bus the section stays close
# to vertical up to the window head and the width is taken out by the roof arch above it. A large
# lean here would drive the panes through the skin at the window head.
HW_TOP = 1.318           # half width at the roof shoulder -> tumblehome (< HW_BELT)
Z_BOTTOM = 0.455         # skirt lower edge
Z_SILL = 0.965           # floor / lower rub rail
Z_BELT = 1.925           # window sill line
Z_WIN_TOP = 2.705        # window head
Z_TOP = 3.175            # roof crown
R_TOP = 0.46             # roof arch radius
BAND_INSET = 0.052       # depth of the glazing recess cut into the loft
GLASS_PROUD = 0.020      # pane face sits 32 mm inside the outer skin, 20 mm proud of the seat

COWL_Y = -HALF_LEN + 0.62      # front ring of the main loft
PILLAR_Y0 = COWL_Y + 0.33      # first window pillar
PILLAR_STEP = 0.93
PILLAR_COUNT = 10              # ten pillars -> nine glazed bays per side
# Kerb side in Blender X. Exported nose faces +Z with +Y up, so right = forward x up = -X.
DOOR_SIDE = -1
TAIL_Y = HALF_LEN
HOOD_TOP = 1.805
# The mid-century snub-nose transit bus in the reference carries a near-vertical windscreen.
# Held at exactly vertical: a raked front ring would have to lean every station behind it or the
# loft folds over itself at the roof, and the reference rake is only a few degrees.
WINDSHIELD_RAKE = 0.0

WHEEL_R = 0.526          # axle height; the tyre crown is 0.524 so the tread sits on Y = 0
TYRE_HW = 0.132
AXLE_FRONT = -HALF_LEN + 1.66
AXLE_REAR = HALF_LEN - 2.28
DUAL_OFFSET = 0.285            # centre-to-centre of the rear dual pair

M_PAINT, M_GLASS, M_RUBBER, M_CHROME, M_RED, M_AMBER, M_CLEAR, M_INTERIOR = range(8)
MATERIAL_NAMES = [
    "bus_paint_yellow",
    "bus_glass",
    "bus_rubber",
    "bus_chrome",
    "bus_lamp_red",
    "bus_lamp_amber",
    "bus_lamp_clear",
    "bus_interior",
]

UV_SCALE = 2.0  # one texture tile spans two metres


# ---------------------------------------------------------------------------------------------
# Deterministic mesh accumulator
# ---------------------------------------------------------------------------------------------
class Builder:
    """Collects verts/faces/material indices/UVs for one mesh. No global state, no randomness."""

    def __init__(self) -> None:
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[list[int]] = []
        self.mats: list[int] = []
        self.uvs: list[list[tuple[float, float]]] = []

    def add_vert(self, x: float, y: float, z: float) -> int:
        self.verts.append((float(x), float(y), float(z)))
        return len(self.verts) - 1

    def add_face(self, idx: list[int], mat: int, uv: list[tuple[float, float]] | None = None) -> None:
        if len(set(idx)) < 3:
            return  # degenerate guard: never emit a zero-area face
        pts = [self.verts[i] for i in idx]
        if _area(pts) < 1e-9:
            return
        self.faces.append(list(idx))
        self.mats.append(mat)
        self.uvs.append(uv if uv is not None else auto_uv(pts))

    def extend(self, other: "Builder") -> None:
        base = len(self.verts)
        self.verts.extend(other.verts)
        self.faces.extend([[i + base for i in f] for f in other.faces])
        self.mats.extend(other.mats)
        self.uvs.extend(other.uvs)

    def tri_count(self) -> int:
        return sum(len(f) - 2 for f in self.faces)


def _area(pts) -> float:
    if len(pts) < 3:
        return 0.0
    a = Vector(pts[0])
    total = Vector((0.0, 0.0, 0.0))
    for i in range(1, len(pts) - 1):
        total += (Vector(pts[i]) - a).cross(Vector(pts[i + 1]) - a)
    return total.length * 0.5


def auto_uv(pts) -> list[tuple[float, float]]:
    """Planar projection on the face's dominant axis, metre-proportional at UV_SCALE."""
    a = Vector(pts[0])
    n = Vector((0.0, 0.0, 0.0))
    for i in range(1, len(pts) - 1):
        n += (Vector(pts[i]) - a).cross(Vector(pts[i + 1]) - a)
    axis = max(range(3), key=lambda i: abs(n[i])) if n.length > 1e-12 else 2
    u_ax, v_ax = ((1, 2), (0, 2), (0, 1))[axis]
    return [(p[u_ax] / UV_SCALE, p[v_ax] / UV_SCALE) for p in pts]


# ---------------------------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------------------------
def chamfer_box(b: Builder, centre, size, mat: int, chamfer: float = 0.012) -> None:
    """A box with all twelve edges chamfered - bevels authored into the geometry, not a modifier."""
    cx, cy, cz = centre
    half = [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
    c = min(chamfer, min(half) * 0.45)
    idx: dict[tuple, int] = {}
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                for axis in (0, 1, 2):
                    off = [i * (half[0] - c), j * (half[1] - c), k * (half[2] - c)]
                    off[axis] = (i, j, k)[axis] * half[axis]
                    idx[(i, j, k, axis)] = b.add_vert(cx + off[0], cy + off[1], cz + off[2])

    signs = (-1, 1)
    for axis in (0, 1, 2):
        o1, o2 = [a for a in (0, 1, 2) if a != axis]
        for s in signs:
            quad = []
            for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                key = [0, 0, 0]
                key[axis] = s
                key[o1] = sa
                key[o2] = sb
                quad.append(idx[(key[0], key[1], key[2], axis)])
            b.add_face(quad, mat)
    for axis in (0, 1, 2):
        o1, o2 = [a for a in (0, 1, 2) if a != axis]
        for s1 in signs:
            for s2 in signs:
                key_lo = [0, 0, 0]
                key_lo[o1] = s1
                key_lo[o2] = s2
                key_lo[axis] = -1
                key_hi = list(key_lo)
                key_hi[axis] = 1
                b.add_face(
                    [
                        idx[(key_lo[0], key_lo[1], key_lo[2], o1)],
                        idx[(key_hi[0], key_hi[1], key_hi[2], o1)],
                        idx[(key_hi[0], key_hi[1], key_hi[2], o2)],
                        idx[(key_lo[0], key_lo[1], key_lo[2], o2)],
                    ],
                    mat,
                )
    for i in signs:
        for j in signs:
            for k in signs:
                b.add_face([idx[(i, j, k, 0)], idx[(i, j, k, 1)], idx[(i, j, k, 2)]], mat)


def revolve(b: Builder, profile, centre, axis: str, segments: int, mat: int, uv_span=2.0) -> None:
    """Closed lathe about a cardinal axis. Profile is a closed loop of (radius, axial offset)."""
    cx, cy, cz = centre
    rings = []
    arc = [0.0]
    for i in range(1, len(profile)):
        dr = profile[i][0] - profile[i - 1][0]
        da = profile[i][1] - profile[i - 1][1]
        arc.append(arc[-1] + math.hypot(dr, da))
    for s in range(segments):
        ang = 2.0 * math.pi * s / segments
        ca, sa = math.cos(ang), math.sin(ang)
        ring = []
        for r, a in profile:
            if axis == "x":
                ring.append(b.add_vert(cx + a, cy + r * ca, cz + r * sa))
            elif axis == "y":
                ring.append(b.add_vert(cx + r * ca, cy + a, cz + r * sa))
            else:
                ring.append(b.add_vert(cx + r * ca, cy + r * sa, cz + a))
        rings.append(ring)
    n = len(profile)
    mean_r = sum(p[0] for p in profile) / n
    for s in range(segments):
        s2 = (s + 1) % segments
        u0 = 2.0 * math.pi * mean_r * s / segments / uv_span
        u1 = 2.0 * math.pi * mean_r * (s + 1) / segments / uv_span
        for i in range(n):
            i2 = (i + 1) % n
            v0, v1 = arc[i] / uv_span, (arc[i2] if i2 else arc[-1] + 0.0) / uv_span
            b.add_face(
                [rings[s][i], rings[s2][i], rings[s2][i2], rings[s][i2]],
                mat,
                [(u0, v0), (u1, v0), (u1, v1), (u0, v1)],
            )


def disc(b: Builder, centre, radius: float, axis: str, segments: int, mat: int, normal_sign=1.0) -> None:
    cx, cy, cz = centre
    ring = []
    for s in range(segments):
        ang = 2.0 * math.pi * s / segments
        ca, sa = math.cos(ang), math.sin(ang)
        if axis == "x":
            ring.append(b.add_vert(cx, cy + radius * ca, cz + radius * sa))
        elif axis == "y":
            ring.append(b.add_vert(cx + radius * ca, cy, cz + radius * sa))
        else:
            ring.append(b.add_vert(cx + radius * ca, cy + radius * sa, cz))
    centre_i = b.add_vert(cx, cy, cz)
    for s in range(segments):
        s2 = (s + 1) % segments
        tri = [centre_i, ring[s], ring[s2]] if normal_sign > 0 else [centre_i, ring[s2], ring[s]]
        b.add_face(tri, mat)


def sweep(b: Builder, path, u_axes, v_axes, hu: float, hv: float, mat: int) -> None:
    """Sweep a rectangular section along a path, one closed solid with capped ends.

    Trim follows the surface it sits on: the caller passes path points sampled from the loft's
    own edge points, so a rail cannot float where the body pulls away from it.
    """
    sections = []
    for p, u, v in zip(path, u_axes, v_axes):
        pv, uv, vv = Vector(p), Vector(u).normalized(), Vector(v).normalized()
        sections.append([
            b.add_vert(*(pv - uv * hu - vv * hv)),
            b.add_vert(*(pv + uv * hu - vv * hv)),
            b.add_vert(*(pv + uv * hu + vv * hv)),
            b.add_vert(*(pv - uv * hu + vv * hv)),
        ])
    run = 0.0
    for i in range(len(sections) - 1):
        step = (Vector(path[i + 1]) - Vector(path[i])).length
        for j in range(4):
            j2 = (j + 1) % 4
            edge = (2 * hu) if j % 2 == 0 else (2 * hv)
            b.add_face(
                [sections[i][j], sections[i + 1][j], sections[i + 1][j2], sections[i][j2]],
                mat,
                [(run / UV_SCALE, 0.0), ((run + step) / UV_SCALE, 0.0),
                 ((run + step) / UV_SCALE, edge / UV_SCALE), (run / UV_SCALE, edge / UV_SCALE)],
            )
        run += step
    b.add_face(list(sections[0]), mat)
    b.add_face(list(reversed(sections[-1])), mat)


# ---------------------------------------------------------------------------------------------
# The station ring - one globally anchored flank profile, 34 points
# ---------------------------------------------------------------------------------------------
def flank_x(z: float, hw_sill: float, hw_belt: float) -> float:
    t = (z - Z_SILL) / (Z_BELT - Z_SILL)
    t = min(1.0, max(0.0, t))
    return hw_sill + (hw_belt - hw_sill) * (t ** 0.45)


def skin_x(z: float) -> float:
    """Outer half width of the body at any height - the single source the door follows."""
    if z <= Z_BOTTOM + 0.098:
        return HW_SILL * 0.996
    if z <= Z_SILL:
        t = (z - (Z_BOTTOM + 0.098)) / (Z_SILL - (Z_BOTTOM + 0.098))
        return HW_SILL * (0.996 + 0.004 * t)
    if z <= Z_BELT:
        return flank_x(z, HW_SILL, HW_BELT)
    return tumble_x(z, HW_BELT, HW_TOP)


def tumble_x(z: float, hw_belt: float, hw_top: float) -> float:
    t = (z - Z_BELT) / ((Z_TOP - R_TOP) - Z_BELT)
    t = min(1.0, max(0.0, t))
    return hw_belt + (hw_top - hw_belt) * (t * t * (3.0 - 2.0 * t))


def ring_half(scale: float, band: bool) -> list[tuple[float, float, int]]:
    """Right half of a station, bottom centre to top centre, as (x, z, row-kind).

    row-kind 0 = painted skin, 1 = glazing recess (dark gasket), 2 = roof.
    Every station shares this row schedule so the loft stays a clean quad grid.
    """
    hs, hb, ht = HW_SILL * scale, HW_BELT * scale, HW_TOP * scale
    zb, zs, zbe, zwt, zt = Z_BOTTOM, Z_SILL, Z_BELT, Z_WIN_TOP, Z_TOP
    r = min(R_TOP, (zt - zbe) * 0.9, ht * 0.5)
    inset = BAND_INSET if band else 0.0
    pts: list[tuple[float, float, int]] = [
        (0.0, zb, 0),
        (hs * 0.62, zb, 0),
        (hs * 0.93, zb + 0.028, 0),
        (hs * 0.996, zb + 0.098, 0),
        (hs, zs, 0),
        (flank_x(zs + (zbe - zs) * 0.34, hs, hb), zs + (zbe - zs) * 0.34, 0),
        (flank_x(zs + (zbe - zs) * 0.70, hs, hb), zs + (zbe - zs) * 0.70, 0),
        (hb, zbe, 0),
        (hb - inset, zbe + 0.006, 1),                      # lower lip of the recess
        (tumble_x(zbe + 0.30, hb, ht) - inset, zbe + 0.30, 1),
        (tumble_x(zwt, hb, ht) - inset, zwt - 0.006, 1),   # window head, still in the recess
        (tumble_x(zwt, hb, ht), zwt, 0),                   # back out to the skin: drip lip
        (tumble_x(zt - r, hb, ht), zt - r, 2),
    ]
    for k in (1, 2, 3):  # elliptical roof arch: ht wide, r tall
        a = (math.pi / 2.0) * k / 4.0
        pts.append((ht * math.cos(a), zt - r + r * math.sin(a), 2))
    pts.append((0.0, zt, 2))
    return pts


def station_ring(b: Builder, y: float, scale: float, band: bool, rake: float) -> list[int]:
    """Emit one closed ring; returns vertex indices ordered right-half then mirrored left-half."""
    half = ring_half(scale, band)
    ids: list[int] = []
    for x, z, _kind in half:
        yy = y + (rake * max(0.0, z - Z_BELT))
        ids.append(b.add_vert(x, yy, z))
    for x, z, _kind in reversed(half[1:-1]):
        yy = y + (rake * max(0.0, z - Z_BELT))
        ids.append(b.add_vert(-x, yy, z))
    return ids


def ring_kinds(scale: float, band: bool) -> list[int]:
    half = ring_half(scale, band)
    return [k for _x, _z, k in half] + [k for _x, _z, k in reversed(half[1:-1])]


def ring_arc_u(scale: float, band: bool) -> list[float]:
    """Normalised arc position around the ring - u=0 bottom centre, 0.5 roof crown."""
    half = ring_half(scale, band)
    pts = [(x, z) for x, z, _ in half] + [(-x, z) for x, z, _ in reversed(half[1:-1])]
    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    closing = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    total = arc[-1] + closing
    return [a / total for a in arc]


def stations() -> list[float]:
    """Feature edges plus a 0.42 m background spacing, per the recipe's station-placement rule."""
    ys = {COWL_Y, COWL_Y + 0.055, TAIL_Y - 0.055, TAIL_Y}
    for p in range(PILLAR_COUNT):  # pillar positions become stations so the recess reads crisply
        ys.add(round(PILLAR_Y0 + p * PILLAR_STEP, 4))
    y = COWL_Y
    while y < TAIL_Y:
        ys.add(round(y, 4))
        y += 0.42
    for axle in (AXLE_FRONT, AXLE_REAR):
        for d in (-0.62, -0.31, 0.31, 0.62):
            ys.add(round(axle + d, 4))
    return sorted(v for v in ys if COWL_Y - 1e-6 <= v <= TAIL_Y + 1e-6)


def build_body(b: Builder) -> dict:
    ys = stations()
    kinds = ring_kinds(1.0, True)
    us = ring_arc_u(1.0, True)
    rings = []
    for i, y in enumerate(ys):
        # Front and rear rings tuck in slightly; the front ring also rakes the windshield back.
        first, last = i == 0, i == len(ys) - 1
        scale = 0.965 if first else (0.972 if last else 1.0)
        rings.append(station_ring(b, y, scale, True, WINDSHIELD_RAKE if first else 0.0))

    n = len(kinds)
    for i in range(len(ys) - 1):
        v0, v1 = (ys[i] / UV_SCALE), (ys[i + 1] / UV_SCALE)
        for j in range(n):
            j2 = (j + 1) % n
            kind = 1 if (kinds[j] == 1 and kinds[j2] == 1) else 0
            mat = M_RUBBER if kind == 1 else M_PAINT
            u0, u1 = us[j], us[j2] if j2 else 1.0
            b.add_face(
                [rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2]],
                mat,
                [(u0, v0), (u0, v1), (u1, v1), (u1, v0)],
            )
    _cap(b, rings[0], ys[0] - 0.02, M_PAINT)
    _cap(b, rings[-1], ys[-1] + 0.02, M_PAINT)
    return {"stations": len(ys), "ring": n, "ys": ys}


def _cap(b: Builder, ring: list[int], y: float, mat: int) -> None:
    pts = [b.verts[i] for i in ring]
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[2] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    centre = b.add_vert(cx, cy, cz)
    for k in range(len(ring)):
        b.add_face([centre, ring[k], ring[(k + 1) % len(ring)]], mat)


# ---------------------------------------------------------------------------------------------
# Glazing, pillars, trim, lamps, wheels
# ---------------------------------------------------------------------------------------------
def glazing(b: Builder) -> int:
    """Panes seated in the loft's own recess, with painted pillars bridging back to the skin."""
    z_mid = (Z_BELT + Z_WIN_TOP) / 2.0
    z_h = (Z_WIN_TOP - Z_BELT) - 0.10
    panes = 0
    x_seat = tumble_x(z_mid, HW_BELT, HW_TOP) - BAND_INSET
    for bay in range(PILLAR_COUNT - 1):
        y0 = PILLAR_Y0 + bay * PILLAR_STEP + 0.054
        y1 = PILLAR_Y0 + (bay + 1) * PILLAR_STEP - 0.054
        for side in (-1, 1):
            if bay == 0 and side == DOOR_SIDE:
                continue  # the kerb-side entry door occupies the first bay
            chamfer_box(b, (side * (x_seat + GLASS_PROUD), (y0 + y1) / 2.0, z_mid),
                        (0.012, y1 - y0, z_h), M_GLASS, 0.004)
            panes += 1
    for p in range(PILLAR_COUNT):
        y = PILLAR_Y0 + p * PILLAR_STEP
        for side in (-1, 1):
            chamfer_box(b, (side * (x_seat + BAND_INSET * 0.5), y, z_mid),
                        (BAND_INSET * 1.05, 0.106, Z_WIN_TOP - Z_BELT), M_PAINT, 0.008)
    # Windshield: two gasket-set panes either side of a centre post, on the raked front plane.
    y_at = lambda z: COWL_Y + WINDSHIELD_RAKE * max(0.0, z - Z_BELT) - 0.005
    for side in (-1, 1):  # two-piece screen either side of a centre post
        chamfer_box(b, (side * 0.60, y_at(z_mid), z_mid + 0.03), (1.04, 0.035, z_h + 0.06), M_GLASS, 0.006)
        chamfer_box(b, (side * 1.185, y_at(z_mid) + 0.008, z_mid + 0.03), (0.10, 0.050, z_h + 0.14), M_PAINT, 0.008)
        panes += 1
    chamfer_box(b, (0.0, y_at(z_mid) + 0.008, z_mid + 0.03), (0.072, 0.055, z_h + 0.14), M_PAINT, 0.008)
    chamfer_box(b, (0.0, y_at(Z_WIN_TOP) + 0.025, Z_WIN_TOP + 0.04), (2.46, 0.070, 0.10), M_PAINT, 0.012)
    # Rear window, above the emergency door.
    chamfer_box(b, (0.0, TAIL_Y + 0.014, 2.35), (1.10, 0.042, 0.50), M_GLASS, 0.006)
    panes += 1
    return panes


def trim(b: Builder) -> None:
    """Rub rails, drip rails and roof arch ribs, all swept from the loft's own edge points."""
    ys = [y for y in stations() if COWL_Y + 0.02 <= y <= TAIL_Y - 0.02]
    for z_rail, half_h in ((Z_SILL + 0.10, 0.0425), (Z_BELT - 0.175, 0.0375)):
        for side in (-1, 1):
            x = side * (flank_x(z_rail, HW_SILL, HW_BELT) + 0.013)
            path = [(x, y, z_rail) for y in ys]
            sweep(b, path, [(side, 0, 0)] * len(ys), [(0, 0, 1)] * len(ys), 0.015, half_h, M_RUBBER)
    for side in (-1, 1):  # drip rail above the glazing, following the skin
        x = side * (tumble_x(Z_WIN_TOP, HW_BELT, HW_TOP) + 0.004)
        path = [(x, y, Z_WIN_TOP + 0.050) for y in ys]
        sweep(b, path, [(side, 0, 0)] * len(ys), [(0, 0, 1)] * len(ys), 0.022, 0.018, M_CHROME)
    for rib in range(5):  # transverse roof arches, swept proud of the crown ellipse
        y = COWL_Y + 1.15 + rib * 1.62
        path, us, vs = [], [], []
        for k in range(11):
            a = math.pi * (0.10 + 0.80 * k / 10.0)
            ca, sa = math.cos(a), math.sin(a)
            path.append((ca * (HW_TOP + 0.010), y, Z_TOP - R_TOP + sa * (R_TOP + 0.010)))
            us.append((ca, 0.0, sa))
            vs.append((0.0, 1.0, 0.0))
        sweep(b, path, us, vs, 0.014, 0.030, M_PAINT)


def entry_door(b: Builder) -> None:
    """Kerb-side entry door in the first bay: two leaves, solid below the waist, glazed above.

    Every part is swept up the body's own `skin_x` profile, so the door follows the flank curve
    instead of cutting a flat slab through a body that changes width with height.
    """
    side = DOOR_SIDE
    y0, y1 = PILLAR_Y0 + 0.055, PILLAR_Y0 + PILLAR_STEP - 0.055
    y_mid, span = (y0 + y1) / 2.0, y1 - y0
    z_lo, z_hi = 0.735, Z_WIN_TOP - 0.015

    def slab(y_centre: float, half_len: float, inset: float, half_thick: float,
             mat: int, zlo: float, zhi: float) -> None:
        pts = [zlo + (zhi - zlo) * k / 8.0 for k in range(9)]
        sweep(b, [(side * (skin_x(z) - inset), y_centre, z) for z in pts],
              [(side, 0.0, 0.0)] * len(pts), [(0.0, 1.0, 0.0)] * len(pts),
              half_thick, half_len, mat)

    # The aperture: a dark reveal the leaves sit inside, so the door reads as a real opening.
    slab(y_mid, span / 2.0 + 0.014, 0.060, 0.020, M_INTERIOR, z_lo - 0.014, z_hi + 0.014)
    gap = 0.026
    leaf_half = (span - gap) / 4.0
    for leaf in (-1, 1):
        y_leaf = y_mid + leaf * (leaf_half + gap / 2.0)
        slab(y_leaf, leaf_half, 0.012, 0.016, M_PAINT, z_lo, 1.790)          # lower panel
        slab(y_leaf, leaf_half, 0.012, 0.016, M_PAINT, 1.790, 1.830)         # waist rail
        slab(y_leaf, leaf_half - 0.030, 0.020, 0.007, M_GLASS, 1.856, z_hi - 0.026)
    # Grab handle on the leading edge and the step well below the sill.
    sweep(b, [(side * (skin_x(z) - 0.004), y0 - 0.012, z) for z in (1.15, 1.55, 1.95)],
          [(side, 0.0, 0.0)] * 3, [(0.0, 1.0, 0.0)] * 3, 0.016, 0.016, M_CHROME)
    slab(y_mid, span / 2.0 - 0.02, 0.115, 0.015, M_INTERIOR, Z_BOTTOM + 0.02, z_lo - 0.02)


def front_end(b: Builder) -> None:
    """Snub hood, grille, bumper, headlamps, indicators and mirrors."""
    nose_y = -HALF_LEN
    hood_len = COWL_Y - nose_y
    z_floor = Z_SILL - 0.42  # the hood block runs down behind the bumper, out of sight
    for i in range(7):  # lofted hood block: rounded crown falling to the grille
        t0, t1 = i / 7.0, (i + 1) / 7.0
        y0 = nose_y + hood_len * t0
        y1 = nose_y + hood_len * t1
        hw = HW_SILL * (0.86 + 0.14 * (((t0 + t1) / 2.0) ** 0.6))
        z_top = HOOD_TOP - 0.30 * ((1.0 - (t0 + t1) / 2.0) ** 1.7)
        chamfer_box(b, (0.0, (y0 + y1) / 2.0, (z_top + z_floor) / 2.0),
                    (hw * 2.0, y1 - y0 + 0.004, z_top - z_floor), M_PAINT, 0.030)
    nose_hw = HW_SILL * 0.86
    # Grille: a recessed dark panel with horizontal chrome bars.
    chamfer_box(b, (0.0, nose_y + 0.10, 1.18), (1.30, 0.10, 0.50), M_INTERIOR, 0.010)
    for bar in range(6):
        chamfer_box(b, (0.0, nose_y + 0.055, 0.985 + bar * 0.078), (1.22, 0.045, 0.032), M_CHROME, 0.007)
    for side in (-1, 1):
        # Headlamp: bezel, reveal, lens - layered outward so nothing renders behind a front face.
        revolve(b, _ring_profile(0.168, 0.055), (side * 0.87, nose_y + 0.085, 1.12), "y", 18, M_CHROME)
        disc(b, (side * 0.87, nose_y + 0.030, 1.12), 0.128, "y", 18, M_CLEAR, -1.0)
        revolve(b, _ring_profile(0.080, 0.040), (side * 0.87, nose_y + 0.095, 1.44), "y", 14, M_CHROME)
        disc(b, (side * 0.87, nose_y + 0.058, 1.44), 0.060, "y", 14, M_AMBER, -1.0)
        chamfer_box(b, (side * (nose_hw - 0.02), nose_y + 0.30, 1.30), (0.08, 0.50, 0.52), M_PAINT, 0.020)
    # Front bumper, sitting on the skirt line.
    chamfer_box(b, (0.0, nose_y + 0.012, 0.74), (2.66, 0.13, 0.30), M_CHROME, 0.028)
    for side in (-1, 1):
        chamfer_box(b, (side * 1.295, nose_y + 0.22, 0.74), (0.12, 0.42, 0.30), M_CHROME, 0.028)
        # Mirror: arm off the cowl, head outboard - the whole prop stays inside 3.0 m.
        chamfer_box(b, (side * 1.362, COWL_Y + 0.10, 2.30), (0.20, 0.042, 0.042), M_RUBBER, 0.010)
        chamfer_box(b, (side * 1.455, COWL_Y + 0.10, 2.06), (0.042, 0.042, 0.52), M_RUBBER, 0.010)
        chamfer_box(b, (side * 1.462, COWL_Y + 0.12, 2.44), (0.052, 0.170, 0.26), M_CHROME, 0.012)
        chamfer_box(b, (side * 1.462, COWL_Y + 0.145, 1.88), (0.048, 0.190, 0.190), M_CHROME, 0.010)
    chamfer_box(b, (0.0, COWL_Y - 0.045, Z_WIN_TOP + 0.16), (1.45, 0.065, 0.24), M_INTERIOR, 0.010)


def rear_end(b: Builder) -> None:
    ty = TAIL_Y
    # Emergency door: proud panel inside a dark reveal ring, per the recipe's reveal rule.
    chamfer_box(b, (0.0, ty + 0.004, 1.475), (1.42, 0.035, 1.26), M_INTERIOR, 0.008)
    chamfer_box(b, (0.0, ty + 0.022, 1.475), (1.33, 0.030, 1.15), M_PAINT, 0.010)
    chamfer_box(b, (0.55, ty + 0.045, 1.42), (0.10, 0.05, 0.10), M_CHROME, 0.012)  # handle
    chamfer_box(b, (0.0, ty + 0.045, 1.02), (0.62, 0.05, 0.24), M_CLEAR, 0.010)    # plate
    for side in (-1, 1):
        for k, (z, mat) in enumerate(((1.32, M_RED), (1.70, M_AMBER), (2.34, M_RED))):
            revolve(b, _ring_profile(0.115, 0.045), (side * 1.12, ty + 0.02, z), "y", 16, M_CHROME)
            disc(b, (side * 1.12, ty + 0.062, z), 0.092, "y", 16, mat, 1.0)
    chamfer_box(b, (0.0, ty + 0.012, 0.76), (2.60, 0.13, 0.28), M_CHROME, 0.026)
    for side in (-1, 1):
        chamfer_box(b, (side * 1.265, ty - 0.20, 0.76), (0.12, 0.40, 0.28), M_CHROME, 0.026)
    for side in (-1, 1, 0):  # roof beacons
        revolve(b, _ring_profile(0.105, 0.075), (side * 1.02, ty - 0.30, Z_TOP - 0.06), "z", 14, M_RED)


def _ring_profile(radius: float, depth: float) -> list[tuple[float, float]]:
    """Closed lathe profile for a shallow bezel ring: outer wall, face, inner reveal, back."""
    r_in = radius * 0.78
    return [
        (r_in, 0.0),
        (radius, 0.0),
        (radius, depth * 0.62),
        (radius * 0.94, depth),
        (r_in, depth),
    ]


def wheel(b: Builder, x: float, y: float, outer_face: int, lugs: bool = True) -> None:
    """Tyre + steel rim on one lathe axis, with a contact-patch flat and lug detail outboard."""
    hw = TYRE_HW
    r_bead = 0.315
    tyre = [
        (r_bead, -hw * 0.95),
        (0.400, -hw * 1.10),
        (0.470, -hw * 1.06),
        (0.505, -hw * 0.92),
        (0.521, -hw * 0.66),
        (0.524, 0.0),
        (0.521, hw * 0.66),
        (0.505, hw * 0.92),
        (0.470, hw * 1.06),
        (0.400, hw * 1.10),
        (r_bead, hw * 0.95),
    ]
    revolve(b, tyre, (x, y, WHEEL_R), "x", 24, M_RUBBER, uv_span=0.9)
    rim = [
        (0.060, outer_face * 0.055),
        (0.150, outer_face * 0.060),
        (0.250, outer_face * 0.020),
        (0.300, outer_face * 0.030),
        (0.312, outer_face * 0.085),
        (0.312, -outer_face * 0.085),
        (0.300, -outer_face * 0.030),
        (0.100, -outer_face * 0.040),
        (0.060, -outer_face * 0.040),
    ]
    revolve(b, rim, (x, y, WHEEL_R), "x", 24, M_CHROME, uv_span=0.9)
    revolve(b, _ring_profile(0.085, 0.030), (x + outer_face * 0.062, y, WHEEL_R), "x", 12, M_CHROME)
    if lugs:  # only on the wheels whose outboard face a player can see
        for lug in range(5):
            a = 2.0 * math.pi * lug / 5.0 + 0.31
            revolve(
                b,
                [(0.0, 0.0), (0.022, 0.0), (0.022, 0.018), (0.0, 0.018)],
                (x + outer_face * 0.064, y + 0.148 * math.cos(a), WHEEL_R + 0.148 * math.sin(a)),
                "x",
                6,
                M_CHROME,
            )


def running_gear(b: Builder) -> None:
    front_track = 1.055
    for side in (-1, 1):
        wheel(b, side * front_track, AXLE_FRONT, side, lugs=True)
        wheel(b, side * (front_track - DUAL_OFFSET / 2.0), AXLE_REAR, -side, lugs=False)
        wheel(b, side * (front_track + DUAL_OFFSET / 2.0), AXLE_REAR, side, lugs=True)
    for axle_y, r in ((AXLE_FRONT, 0.075), (AXLE_REAR, 0.105)):
        revolve(b, [(0.0, -front_track), (r, -front_track), (r, front_track), (0.0, front_track)],
                (0.0, axle_y, WHEEL_R), "x", 12, M_INTERIOR)
    chamfer_box(b, (0.0, (AXLE_FRONT + AXLE_REAR) / 2.0, Z_BOTTOM - 0.10),
                (0.92, AXLE_REAR - AXLE_FRONT, 0.20), M_INTERIOR, 0.020)
    chamfer_box(b, (-1.02, AXLE_REAR - 1.35, Z_BOTTOM + 0.06), (0.34, 1.05, 0.42), M_INTERIOR, 0.020)


def interior(b: Builder) -> None:
    """Dark liner inside the glazing plus seat backs, so the glass reads as depth, not a slab."""
    ys = stations()
    inner = []
    for i, y in enumerate(ys):
        rake = WINDSHIELD_RAKE if i == 0 else (-0.055 if i == len(ys) - 1 else 0.0)
        yy = y + (0.16 if i == 0 else (-0.16 if i == len(ys) - 1 else 0.0))
        inner.append(station_ring(b, yy, 0.945, True, rake))
    kinds = ring_kinds(0.945, True)
    n = len(kinds)
    for i in range(len(ys) - 1):
        for j in range(n):
            j2 = (j + 1) % n
            b.add_face([inner[i][j], inner[i][j2], inner[i + 1][j2], inner[i + 1][j]], M_INTERIOR)
    _cap(b, inner[0], ys[0], M_INTERIOR)
    _cap(b, inner[-1], ys[-1], M_INTERIOR)
    for row in range(9):
        y = COWL_Y + 0.95 + row * 0.86
        for side in (-1, 1):
            chamfer_box(b, (side * 0.78, y, Z_BELT - 0.16), (0.98, 0.11, 0.66), M_INTERIOR, 0.014)
            chamfer_box(b, (side * 0.78, y + 0.20, Z_BELT - 0.50), (0.98, 0.42, 0.10), M_INTERIOR, 0.014)
    chamfer_box(b, (-0.85, COWL_Y + 0.30, 1.48), (0.86, 0.34, 0.30), M_INTERIOR, 0.016)  # dash
    revolve(b, [(0.10, 0.0), (0.22, 0.0), (0.22, 0.03), (0.10, 0.03)], (-0.85, COWL_Y + 0.52, 1.72), "y", 14, M_INTERIOR)


# ---------------------------------------------------------------------------------------------
# CPU texture synthesis (numpy, tileable value-noise fBm, integer periods)
# ---------------------------------------------------------------------------------------------
def _hash2(ix: np.ndarray, iy: np.ndarray, seed: int) -> np.ndarray:
    n = (ix.astype(np.uint64) * np.uint64(374761393)) + (iy.astype(np.uint64) * np.uint64(668265263))
    n = (n + np.uint64(seed * 2654435761 & 0xFFFFFFFF)) & np.uint64(0xFFFFFFFF)
    n = (n ^ (n >> np.uint64(13))) * np.uint64(1274126177) & np.uint64(0xFFFFFFFF)
    n = n ^ (n >> np.uint64(16))
    return (n & np.uint64(0xFFFFFFFF)).astype(np.float64) / 4294967295.0


def value_noise(u: np.ndarray, v: np.ndarray, period: int, seed: int) -> np.ndarray:
    assert float(period).is_integer(), "noise period must be an integer or the map goes NaN"
    x, y = u * period, v * period
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    x0, x1 = ix % period, (ix + 1) % period
    y0, y1 = iy % period, (iy + 1) % period
    n00 = _hash2(x0, y0, seed)
    n10 = _hash2(x1, y0, seed)
    n01 = _hash2(x0, y1, seed)
    n11 = _hash2(x1, y1, seed)
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy


def fbm(u, v, period: int, seed: int, octaves: int = 4) -> np.ndarray:
    total = np.zeros_like(u)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(u, v, period * (2 ** o), seed + o * 977)
        norm += amp
        amp *= 0.5
    return total / norm


def save_image(name: str, rgba: np.ndarray, colorspace: str) -> Path:
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1].reshape(-1), dtype=np.float32))
    path = ASSET_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    img.reload()
    return path


def make_body_maps(size: int = 512) -> dict:
    """Base colour, roughness and normal for the hero paint, authored against the u = around-ring
    parameterisation so dust lands on the skirt and the roof, and the flanks stay clean."""
    v, u = np.meshgrid(
        (np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size, indexing="ij"
    )
    grain = fbm(u, v, 8, SEED, 5)
    mottle = fbm(u, v, 3, SEED + 31, 3)
    streak = value_noise(u * 0.5, v, 24, SEED + 57)

    skirt = np.clip((0.16 - np.minimum(u, 1.0 - u)) / 0.16, 0.0, 1.0) ** 1.4
    roof = np.clip(1.0 - np.abs(u - 0.5) / 0.09, 0.0, 1.0) ** 1.6
    dust = np.clip(skirt * 0.85 + roof * 0.55, 0.0, 1.0) * (0.55 + 0.45 * grain)

    base = np.stack([
        np.full((size, size), 0.906),
        np.full((size, size), 0.686),
        np.full((size, size), 0.184),
    ], axis=-1)
    base *= (0.955 + 0.09 * mottle)[..., None]
    base += (0.035 * (streak - 0.5))[..., None]
    base = base * (1.0 - 0.30 * dust)[..., None] + np.array([0.42, 0.37, 0.30]) * (0.30 * dust)[..., None]
    chips = (fbm(u, v, 40, SEED + 11, 2) > 0.885) & (skirt > 0.25)
    base[chips] = np.array([0.46, 0.42, 0.37])
    base = np.clip(base, 0.0, 1.0)
    colour = np.concatenate([base, np.ones((size, size, 1))], axis=-1)

    rough = 0.315 + 0.085 * grain + 0.30 * dust + 0.05 * mottle
    rough = np.clip(rough, 0.05, 0.95)
    rough_rgba = np.stack([rough, rough, rough, np.ones_like(rough)], axis=-1)

    height = 0.55 * grain + 0.45 * fbm(u, v, 16, SEED + 73, 3)
    gx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    gy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    strength = 1.35
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5,
                       np.ones_like(height)], axis=-1)

    return {
        "basecolor": save_image("bus_body_basecolor", colour.astype(np.float32), "sRGB"),
        "roughness": save_image("bus_body_roughness", rough_rgba.astype(np.float32), "Non-Color"),
        "normal": save_image("bus_body_normal", normal.astype(np.float32), "Non-Color"),
    }


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------
def _principled(mat):
    return mat.node_tree.nodes["Principled BSDF"]


def _set_alpha_blend(mat) -> None:
    for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        if hasattr(mat, attr):
            try:
                setattr(mat, attr, value)
            except (TypeError, AttributeError):
                pass


def make_materials(maps: dict) -> list:
    mats = []
    for name in MATERIAL_NAMES:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mats.append(mat)

    paint = mats[M_PAINT]
    nodes, links = paint.node_tree.nodes, paint.node_tree.links
    bsdf = _principled(paint)
    for slot, key, cs in (("Base Color", "basecolor", "sRGB"),
                          ("Roughness", "roughness", "Non-Color"),
                          ("Normal", "normal", "Non-Color")):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(maps[key]), check_existing=True)
        tex.image.colorspace_settings.name = cs
        tex.location = (-700, 300 - 320 * list(maps).index(key))
        if slot == "Normal":
            nm = nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = 0.8
            nm.location = (-380, -340)
            links.new(tex.outputs["Color"], nm.inputs["Color"])
            links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        else:
            links.new(tex.outputs["Color"], bsdf.inputs[slot])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Coat Weight"].default_value = 0.45
    bsdf.inputs["Coat Roughness"].default_value = 0.18

    def flat(index, colour, rough, metal, alpha=1.0, emission=None):
        bsdf = _principled(mats[index])
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

    flat(M_GLASS, (0.372, 0.446, 0.472), 0.075, 0.0, alpha=0.62)
    flat(M_RUBBER, (0.052, 0.050, 0.049), 0.86, 0.0)
    flat(M_CHROME, (0.812, 0.818, 0.828), 0.215, 1.0)
    flat(M_RED, (0.545, 0.041, 0.032), 0.16, 0.0, emission=(0.115, 0.006, 0.004))
    flat(M_AMBER, (0.692, 0.268, 0.024), 0.16, 0.0, emission=(0.140, 0.042, 0.003))
    flat(M_CLEAR, (0.842, 0.836, 0.812), 0.13, 0.0)
    flat(M_INTERIOR, (0.086, 0.079, 0.070), 0.78, 0.0)
    return mats


# ---------------------------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------------------------
def to_object(name: str, b: Builder, mats: list, flip: bool = False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(b.verts, [], b.faces)
    mesh.update()
    for mat in mats:
        mesh.materials.append(mat)
    for poly, mat in zip(mesh.polygons, b.mats):
        poly.material_index = mat
    uv = mesh.uv_layers.new(name="UVMap")
    loop_uvs = []
    for face_uvs in b.uvs:
        loop_uvs.extend(face_uvs)
    flat = []
    for pair in loop_uvs:
        flat.extend((float(pair[0]), float(pair[1])))
    uv.data.foreach_set("uv", flat)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return obj


def main() -> None:
    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    maps = make_body_maps(512)
    mats = make_materials(maps)

    shell = Builder()
    info = build_body(shell)
    panes = glazing(shell)
    entry_door(shell)
    trim(shell)
    front_end(shell)
    rear_end(shell)
    running_gear(shell)

    liner = Builder()
    interior(liner)

    obj = to_object("HeroBus", shell, mats)
    liner_obj = to_object("HeroBusInterior", liner, mats, flip=True)

    # Join the interior into the hero mesh so the export is one object with eight material
    # groups - one glTF primitive per material, no per-part draw explosion.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    liner_obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(34.0), keep_sharp_edges=True)

    mesh = obj.data
    mesh.calc_loop_triangles()
    tris = len(mesh.loop_triangles)
    used = sorted({p.material_index for p in mesh.polygons})
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mins = [min(p[i] for p in bb) for i in range(3)]
    maxs = [max(p[i] for p in bb) for i in range(3)]

    bpy.context.preferences.filepaths.save_version = 0  # no rolling .blend1 beside the source
    blend_path = BLEND_DIR / "hero-bus.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=False)

    glb_path = ASSET_DIR / "hero-bus.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
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

    report = {
        "blender": bpy.app.version_string,
        "buildHash": bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "seed": SEED,
        "stations": info["stations"],
        "ringPoints": info["ring"],
        "glassPanes": panes,
        "indexedTriangles": tris,
        "materialSlots": len(mesh.materials),
        "materialGroupsUsed": [MATERIAL_NAMES[i] for i in used],
        "boundsBlenderXYZ": {"min": [round(v, 4) for v in mins], "max": [round(v, 4) for v in maxs]},
        "boundsGltfYUp": {
            "widthX": round(maxs[0] - mins[0], 4),
            "heightY": round(maxs[2] - mins[2], 4),
            "lengthZ": round(maxs[1] - mins[1], 4),
        },
        "hasUV": bool(mesh.uv_layers),
        "textures": {k: str(v.relative_to(REPO)).replace("\\", "/") for k, v in maps.items()},
        "blend": str(blend_path.relative_to(REPO)).replace("\\", "/"),
        "glb": str(glb_path.relative_to(REPO)).replace("\\", "/"),
        "glbBytes": glb_path.stat().st_size,
    }
    print("BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
