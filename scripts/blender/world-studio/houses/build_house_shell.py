"""Author one world-studio house exterior shell in Blender and export it as a GLB.

Run through ``run_houses.py`` (which pins the executable, takes the shared Blender lock and
forces ``--background``), or directly:

    blender --background --factory-startup --python-exit-code 9 \
        --python scripts/blender/world-studio/houses/build_house_shell.py -- --variant teal

CONTRACT
  * Presentation only. This file emits no collider, spawn, navigation ramp, ballistic surface
    or proxy wall. Movement and shot authority stay in ``src/world-studio/architecture`` and
    are never derived from this mesh (photoreal-procedural-scene-forge section 6).
  * Shell means structure: walls, floors, ceilings, roof, chimney, porch, balcony, garage,
    trim, gutters, glazing. Furniture and interior decor belong to the interiors lane.
  * Nothing opaque may cross a declared aperture. A ``slider`` is glazed over exactly one
    leaf; a ``door`` leaf parks flat against the inside face; a ``garage`` opening is dressed
    only above its head. ``_assert_apertures_clear`` re-measures this from the built mesh
    before the export runs, so a scripting mistake fails the build instead of shipping.
  * CPU only. No GPU compute is requested anywhere in this file.

Geometry carries the read and the maps are the second layer: the lap siding, the shingle
courses and the chimney stones are real stepped solids, not a normal map on a flat box
(photoreal-procedural-scene-forge rule 4).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import bpy  # noqa: E402  (Blender-only import; the module is never imported outside Blender)

import house_contract as C  # noqa: E402
import house_textures as T  # noqa: E402

REPO_ROOT = HERE.parents[3]
ASSET_DIR = REPO_ROOT / "public" / "assets" / "world-studio" / "blender" / "houses"
SOURCE_DIR = REPO_ROOT / "source-assets" / "world-studio" / "houses"

Vec3 = Tuple[float, float, float]

# Texel density per material slot, in metres of surface per texture tile.
TILE_M = {
    "siding": T.SIDING_M,
    "shingle": T.SHINGLE_M,
    "masonry": T.STONE_M,
    "trim": T.TRIM_M,
    "concrete": T.CONCRETE_M,
    "metal": T.METAL_M,
    "glass": 1.0,
    "door": T.TRIM_M,
}

# Material slot for the structural leaf behind the lap siding. Named because the wave-3 value
# ("trim", i.e. painted white) is the white comb in the Build 16 facade, and because
# ``facade_preview.py`` re-renders the old value to hold the before/after record. The build
# itself never reads anything but this constant.
SHEATHING_SLOT = "siding"

# ---------------------------------------------------------------- surface ownership
#
# Wave 5. A wall plane is a *place*, not a surface, and until now four different members
# all put a face on it: the sheathing leaf, every lap-siding course's inboard face, the
# opening reveal lining, and the back face of everything mounted outboard. Coplanar faces
# with the same facing cannot be cured by culling — the depth buffer picks a winner per
# pixel, which is the dashed vertical seam ``audit_surfaces.py`` measures as falsifier 13.
#
# The rule now is: **exactly one member owns each plane, and every other member stands off
# from it by more than the audit's 1.5 mm epsilon.** The outboard wall plane is owned by
# the siding face; the inboard wall plane is owned by the lining. Nothing here moves an
# outward-visible surface: the siding's outer face, the canonical bounds, every aperture
# void and every marker are untouched. Only faces that were already buried inside the wall
# cavity move, and they move inwards.
#
# Offsets are >= SEAM_STANDOFF because a separation below the audit's epsilon still counts
# as a depth conflict and still fights at distance; a 0.5 mm "fix" would be cosmetic on the
# report and useless in the depth buffer.
SEAM_STANDOFF = 0.004   # m — minimum separation between two same-facing surfaces
SHEATHING_SETBACK = 0.012  # m — leaf face behind the wall plane; the reveal's shadow gap


# ---------------------------------------------------------------- deterministic PRNG

class Rng:
    """A tiny explicit LCG. Blender's Python RNG state is global and Python's ``random`` seeds
    differently across versions; this keeps stone placement byte-reproducible."""

    def __init__(self, seed: int) -> None:
        self.state = (seed ^ 0x9E3779B9) & 0xFFFFFFFF

    def next(self) -> float:
        self.state = (1664525 * self.state + 1013904223) & 0xFFFFFFFF
        return self.state / 0x100000000

    def span(self, lo: float, hi: float) -> float:
        return lo + (hi - lo) * self.next()


# ---------------------------------------------------------------- mesh accumulation

class Slot:
    """One material's accumulated geometry. One slot becomes one mesh and one draw group."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.verts: List[Vec3] = []
        self.faces: List[Tuple[int, ...]] = []
        self.uvs: List[Tuple[float, float]] = []

    def quad(self, a: Vec3, b: Vec3, c: Vec3, d: Vec3, uvs: Sequence[Tuple[float, float]]) -> None:
        base = len(self.verts)
        self.verts.extend([a, b, c, d])
        self.faces.append((base, base + 1, base + 2, base + 3))
        self.uvs.extend(uvs)

    @property
    def triangles(self) -> int:
        return sum(len(f) - 2 for f in self.faces)


class Builder:
    def __init__(self, variant: C.Variant) -> None:
        self.variant = variant
        self.mirror = -1.0 if variant.mirror_x else 1.0
        self.slots: Dict[str, Slot] = {}
        self.rng = Rng(variant.seed)
        # Opaque axis-aligned solids recorded for the aperture self-audit. Glass is excluded:
        # a pane is transparent and shootable, not an aperture blocker.
        self.opaque: List[Tuple[float, float, float, float, float, float]] = []
        self.markers: List[dict] = []
        self.panes: List[dict] = []

    def slot(self, name: str) -> Slot:
        if name not in self.slots:
            self.slots[name] = Slot(name)
        return self.slots[name]

    # ---- primitive emission -------------------------------------------------

    def box(
        self,
        material: str,
        x0: float, x1: float,
        y0: float, y1: float,
        z0: float, z1: float,
        *,
        opaque: bool = True,
        uv_offset: Tuple[float, float] = (0.0, 0.0),
    ) -> None:
        """Emit an axis-aligned box with planar per-face UVs at the slot's texel density.

        Coordinates are given in the canonical LOCAL frame; the yellow mirror is applied here
        so every call site reads the same as the TypeScript it mirrors.
        """
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        if x1 - x0 < 1e-6 or y1 - y0 < 1e-6 or z1 - z0 < 1e-6:
            return
        if opaque and material != "glass":
            self.opaque.append((x0, x1, y0, y1, z0, z1))

        tile = TILE_M.get(material, 1.0)
        ou, ov = uv_offset
        s = self.mirror
        slot = self.slot(material)

        def uv(u: float, v: float) -> Tuple[float, float]:
            return (u / tile + ou, v / tile + ov)

        # (corners, uv source axes) per face. Winding is CCW seen from outside in the
        # unmirrored frame; mirroring reverses it, which ``_emit`` corrects.
        faces = [
            # +X / -X : UV from (z, y)
            ([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], [(z0, y0), (z1, y0), (z1, y1), (z0, y1)]),
            ([(x0, y0, z1), (x0, y0, z0), (x0, y1, z0), (x0, y1, z1)], [(z1, y0), (z0, y0), (z0, y1), (z1, y1)]),
            # +Z / -Z : UV from (x, y)
            ([(x1, y0, z1), (x0, y0, z1), (x0, y1, z1), (x1, y1, z1)], [(x1, y0), (x0, y0), (x0, y1), (x1, y1)]),
            ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]),
            # +Y / -Y : UV from (x, z)
            ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]),
            ([(x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0)], [(x0, z1), (x1, z1), (x1, z0), (x0, z0)]),
        ]
        for corners, uvsrc in faces:
            pts = [(p[0] * s, p[1], p[2]) for p in corners]
            uvs = [uv(a, b) for a, b in uvsrc]
            if s < 0:
                pts = list(reversed(pts))
                uvs = list(reversed(uvs))
            slot.quad(pts[0], pts[1], pts[2], pts[3], uvs)

    def rotated_slab(
        self,
        material: str,
        centre: Vec3,
        size: Vec3,
        pitch_z: float,
    ) -> None:
        """A slab rotated about the local Z axis — the roof planes and the raking boards.

        Rotation happens before the mirror so the pitch sign stays correct on both houses.
        """
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        cos_a, sin_a = math.cos(pitch_z), math.sin(pitch_z)
        tile = TILE_M.get(material, 1.0)
        s = self.mirror
        slot = self.slot(material)

        def place(dx: float, dy: float, dz: float) -> Vec3:
            rx = dx * cos_a - dy * sin_a
            ry = dx * sin_a + dy * cos_a
            return ((centre[0] + rx) * s, centre[1] + ry, centre[2] + dz)

        corners = {
            (i, j, k): place(i * hx, j * hy, k * hz)
            for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)
        }
        quads = [
            ([(1, 1, -1), (1, 1, 1), (-1, 1, 1), (-1, 1, -1)], "top"),
            ([(-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)], "bottom"),
            ([(1, -1, 1), (1, 1, 1), (-1, 1, 1), (-1, -1, 1)], "zpos"),
            ([(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)], "zneg"),
            ([(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)], "xpos"),
            ([(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)], "xneg"),
        ]
        for keys, kind in quads:
            pts = [corners[k] for k in keys]
            if kind in ("top", "bottom"):
                uvs = [(k[0] * hx / tile, k[2] * hz / tile) for k in keys]
            elif kind in ("zpos", "zneg"):
                uvs = [(k[0] * hx / tile, k[1] * hy / tile) for k in keys]
            else:
                uvs = [(k[2] * hz / tile, k[1] * hy / tile) for k in keys]
            if s < 0:
                pts, uvs = list(reversed(pts)), list(reversed(uvs))
            slot.quad(pts[0], pts[1], pts[2], pts[3], uvs)

    def rotated_slab_x(
        self,
        material: str,
        centre: Vec3,
        size: Vec3,
        pitch_x: float,
    ) -> None:
        """A slab rotated about the local X axis — the two stair handrails and the garage-roof
        threshold, which rise along Z rather than along X.

        ``rotated_slab`` cannot serve: it rotates in the (X, Y) plane, which would tilt a rail
        sideways instead of up the flight. The mirror is applied after the rotation and does not
        interact with it, because a rotation about X leaves X alone.
        """
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        cos_a, sin_a = math.cos(pitch_x), math.sin(pitch_x)
        tile = TILE_M.get(material, 1.0)
        s = self.mirror
        slot = self.slot(material)

        def place(dx: float, dy: float, dz: float) -> Vec3:
            ry = dy * cos_a - dz * sin_a
            rz = dy * sin_a + dz * cos_a
            return ((centre[0] + dx) * s, centre[1] + ry, centre[2] + rz)

        corners = {
            (i, j, k): place(i * hx, j * hy, k * hz)
            for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)
        }
        quads = [
            ([(1, 1, -1), (1, 1, 1), (-1, 1, 1), (-1, 1, -1)], "top"),
            ([(-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)], "bottom"),
            ([(1, -1, 1), (1, 1, 1), (-1, 1, 1), (-1, -1, 1)], "zpos"),
            ([(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)], "zneg"),
            ([(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)], "xpos"),
            ([(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)], "xneg"),
        ]
        for keys, kind in quads:
            pts = [corners[k] for k in keys]
            if kind in ("top", "bottom"):
                uvs = [(k[0] * hx / tile, k[2] * hz / tile) for k in keys]
            elif kind in ("zpos", "zneg"):
                uvs = [(k[0] * hx / tile, k[1] * hy / tile) for k in keys]
            else:
                uvs = [(k[2] * hz / tile, k[1] * hy / tile) for k in keys]
            if s < 0:
                pts, uvs = list(reversed(pts)), list(reversed(uvs))
            slot.quad(pts[0], pts[1], pts[2], pts[3], uvs)

    # ---- semantic markers ---------------------------------------------------

    def marker(self, name: str, position: Vec3, props: Dict[str, object]) -> None:
        self.markers.append({"name": name, "position": (position[0] * self.mirror, position[1], position[2]), "props": props})


# ---------------------------------------------------------------- wall assembly

def _aperture_rects(openings: Iterable[C.Opening]) -> List[C.Rect]:
    return [(o.u0, o.u1, o.y0, o.y1) for o in openings]


def _wall_box(b: Builder, frame: C.WallFrame, material: str, rect: C.Rect, n0: float, n1: float, *, opaque: bool = True) -> None:
    """Emit a wall-space box: ``rect`` is (u0,u1,y0,y1); ``n0..n1`` is offset from the plane."""
    u0, u1, y0, y1 = rect
    a, bb = frame.at + n0, frame.at + n1
    if frame.axis == "z":
        b.box(material, a, bb, y0, y1, u0, u1, opaque=opaque)
    else:
        b.box(material, u0, u1, y0, y1, a, bb, opaque=opaque)


def build_exterior_wall(b: Builder, frame: C.WallFrame, openings: Sequence[C.Opening], y0: float, y1: float) -> None:
    """Structural leaf, interior lining, lap-siding relief and every opening's dressing."""
    v = b.variant
    half = frame.thickness / 2
    out = frame.outward
    solids = C.subtract_apertures((frame.u_from, frame.u_to, y0, y1), _aperture_rects(openings))

    for rect in solids:
        # Structural leaf — the surface the siding hangs on and the interior lining covers.
        #
        # Wave 4, and this is the white comb. The leaf shipped in the ``trim`` slot, i.e. in
        # painted white, and it sits 12 mm behind a lap siding course that leaves a 3 mm reveal
        # at every joint. So every one of those joints is a 3 mm window onto a white board, and
        # at street distance a 3 mm line is a fraction of a pixel and breaks into dashes — the
        # comb the Build 16 capture shows. Real clapboard shows shadow in that gap, not paint.
        # The leaf now carries the siding slot, which is also what it physically is: sheathing
        # behind the boards, never seen except through the reveal. The interior face is
        # unaffected, because the lining below covers it.
        #
        # Measured, not argued: ``facade_evidence.py`` rasterises both states through one
        # instrument and the light slivers inside the siding field fall 2,095 -> 807 across six
        # camera/variant pairs, with the leaf's own planes leaving the guilty list entirely.
        # Why the lane's Cycles review frames never showed it is *not* established — a 15 mm
        # slot in sun shadow is the likely reason but no runtime capture exists to confirm it
        # (falsifier 1), so treat the runtime lighting story as a hypothesis, not a result.
        #
        # Wave 5 corrects the *sign*. ``half - out * 0.012`` only sets the leaf back on walls
        # whose outward normal is +X/+Z. On an ``out = -1`` wall it did the opposite: the leaf's
        # outboard face landed exactly ON the wall plane — coplanar with the reveal lining and
        # with the inboard face of every siding course — while the leaf's other end pushed 12 mm
        # *through* the interior lining, putting a siding-slot face in the lining's own plane.
        # Written as an explicit (inboard, outboard) pair it is sign-correct on all four walls:
        # flush with the inboard wall plane, set back SHEATHING_SETBACK from the outboard one.
        _wall_box(b, frame, SHEATHING_SLOT, rect, -out * half, out * (half - SHEATHING_SETBACK))
        # Interior lining, inboard of the structure (shell only: paint, no furniture).
        _wall_box(b, frame, "trim", rect, -out * (half + C.LINING), -out * half, opaque=False)
        # Lap siding: one real course per 152.4 mm, 3 mm reveal between courses, 18 mm proud.
        _emit_lap_siding(b, frame, rect, half)

    for opening in openings:
        dress_opening(b, frame, opening)


def _emit_lap_siding(b: Builder, frame: C.WallFrame, rect: C.Rect, half: float) -> None:
    exposure, reveal, proud = 0.1524, 0.003, 0.018
    u0, u1, y0, y1 = rect
    out = frame.outward
    start = math.floor(y0 / exposure)
    for course in range(start, int(math.ceil(y1 / exposure)) + 1):
        cy0 = course * exposure
        cy1 = cy0 + exposure - reveal
        cy0, cy1 = max(cy0, y0), min(cy1, y1)
        if cy1 - cy0 < 0.004:
            continue
        # Wave 5: the course's *outboard* face is the visible one and does not move. Its
        # inboard face used to sit exactly on the wall plane, which is also where the back
        # face of every mounted casing, watertable, downspout and apron sits — the single
        # largest source of same-facing coincident pairs in the shipped GLB, and all of it
        # buried. Biting SEAM_STANDOFF into the cavity separates them; the course still
        # overlaps the leaf's 12 mm setback by 8 mm, so no gap opens behind the boards.
        _wall_box(b, frame, "siding", (u0, u1, cy0, cy1),
                  out * (half - SEAM_STANDOFF), out * (half + proud), opaque=False)


def dress_opening(b: Builder, frame: C.WallFrame, opening: C.Opening) -> None:
    """Casing, sill, drip, reveal lining, glazing and door leaf — mirroring ``house.ts:317-375``.

    Every branch here keeps the declared void open: glass covers one leaf of a slider, a door
    leaf parks outside its own opening, and a garage opening is dressed only above its head.
    """
    v = b.variant
    u0, u1, y0, y1 = opening.u0, opening.u1, opening.y0, opening.y1
    half = frame.thickness / 2
    out = frame.outward
    face = out * (half + 0.018)  # outboard of the siding relief
    # Wave 2 read shallow at the street camera: a 55 mm casing projection throws almost no
    # shadow at the sun elevations the review cameras use. 78 mm is a real 1x4-on-1x2 build-up
    # and doubles the shadow width without adding a single triangle.
    casing, proud = 0.10, out * 0.078

    # Exterior casing: head, jambs, projecting sill and drip. This is the white board trim the
    # concept reads as depth around every window.
    _wall_box(b, frame, "trim", (u0 - casing, u1 + casing, y1, y1 + casing), face, face + proud)
    _wall_box(b, frame, "trim", (u0 - casing, u0, y0, y1), face, face + proud)
    _wall_box(b, frame, "trim", (u1, u1 + casing, y0, y1), face, face + proud)
    if opening.kind == "window":
        _wall_box(b, frame, "trim", (u0 - casing - 0.05, u1 + casing + 0.05, y0 - 0.08, y0), face, face + out * 0.155)
        _wall_box(b, frame, "trim", (u0 - casing - 0.05, u1 + casing + 0.05, y1 + casing, y1 + casing + 0.06), face, face + out * 0.135)

    # Reveal lining so the cut edge never shows raw wall.
    #
    # Wave 5: it used to span exactly -half..half, i.e. it put a face on *both* wall planes.
    # The outboard one is same-facing with the leaf's face and with the reveal of every
    # course beside it, and it is visible straight down the opening, so it is a seam a
    # street camera can actually see. It now runs from the inboard plane to SEAM_STANDOFF
    # proud of the outboard plane — still inside the void, still covering the cut edge (it
    # covers 4 mm more of it than before), and coplanar with nothing.
    reveal_in, reveal_out = -out * half, out * (half + SEAM_STANDOFF)
    _wall_box(b, frame, "trim", (u0, u1, y1 - 0.03, y1), reveal_in, reveal_out, opaque=False)
    if opening.kind != "garage":
        _wall_box(b, frame, "trim", (u0, u0 + 0.03, y0, y1), reveal_in, reveal_out, opaque=False)
        _wall_box(b, frame, "trim", (u1 - 0.03, u1, y0, y1), reveal_in, reveal_out, opaque=False)

    if opening.kind in ("window", "slider"):
        inset = 0.04
        # A slider is glazed over ONE leaf only. The other half is a declared route.
        glass_u1 = (u0 + u1) / 2 if opening.kind == "slider" else u1 - inset
        _emit_pane(b, frame, opening, (u0 + inset, glass_u1, y0 + inset, y1 - inset))
        bars = opening.mullions if opening.mullions is not None else 1
        for bar in range(1, bars + 1):
            pos = u0 + (glass_u1 - u0) * bar / (bars + 1)
            _wall_box(b, frame, "trim", (pos - 0.03, pos + 0.03, y0 + inset, y1 - inset), -0.035, 0.035, opaque=False)
        if opening.kind == "window":
            mid = (y0 + y1) / 2
            _wall_box(b, frame, "trim", (u0 + inset, u1 - inset, mid - 0.03, mid + 0.03), -0.035, 0.035, opaque=False)
        else:
            _wall_box(b, frame, "trim", (glass_u1, glass_u1 + 0.06, y0 + inset, y1 - inset), -0.045, 0.045, opaque=False)
            _wall_box(b, frame, "metal", (u0, u1, y0, y0 + 0.04), -0.05, 0.05, opaque=False)

    if opening.kind == "door":
        width = u1 - u0
        leaf_u0 = u1 + 0.02 if opening.swing > 0 else u0 - width - 0.02
        _wall_box(b, frame, "door", (leaf_u0, leaf_u0 + width, y0, y1 - 0.04), -out * (half + 0.07), -out * half, opaque=False)
        _wall_box(b, frame, "trim", (leaf_u0 + 0.1, leaf_u0 + width - 0.1, y0 + 0.9, y0 + 1.05), -out * (half + 0.09), -out * (half + 0.07), opaque=False)

    # Aperture audit marker at the centre of the declared void.
    cu, cy = (u0 + u1) / 2, (y0 + y1) / 2
    pos = (frame.at, cy, cu) if frame.axis == "z" else (cu, cy, frame.at)
    b.marker(
        f"aperture-{frame.key}-{opening.id}",
        pos,
        {
            "atomic_semantic": "aperture-audit",
            "atomic_aperture_id": f"{v.house_id}:{opening.id}",
            "atomic_aperture_kind": opening.kind,
            "atomic_aperture_clear": True,
            "atomic_aperture_samples": 9,
            "atomic_aperture_transparent": opening.kind == "window",
            "atomic_aperture_bounds": [u0, y0, u1, y1],
            "atomic_aperture_wall": frame.key,
        },
    )


def _emit_pane(b: Builder, frame: C.WallFrame, opening: C.Opening, rect: C.Rect) -> None:
    v = b.variant
    _wall_box(b, frame, "glass", rect, -0.015, 0.015, opaque=False)
    u0, u1, y0, y1 = rect
    cu, cy = (u0 + u1) / 2, (y0 + y1) / 2
    pos = (frame.at, cy, cu) if frame.axis == "z" else (cu, cy, frame.at)
    # The pane's own glass solid, in the canonical local frame. Recorded so each pane stays an
    # individually inspectable component rather than an anonymous slice of the merged glass mesh.
    if frame.axis == "z":
        local = [frame.at - 0.015, y0, u0, frame.at + 0.015, y1, u1]
    else:
        local = [u0, y0, frame.at - 0.015, u1, y1, frame.at + 0.015]
    b.panes.append(
        {
            "name": f"pane-{frame.key}-{opening.id}",
            "position": pos,
            "windowId": C.window_runtime_id(v.house_id, frame.key, opening.id),
            "solidId": C.window_solid_id(v.house_id, frame.key, opening.id),
            "localBounds": local,
        }
    )


# ---------------------------------------------------------------- shell assembly

def build_shell(variant_name: str) -> Builder:
    v = C.VARIANTS[variant_name]
    b = Builder(v)

    # ---- foundation, floors, ceilings (shell only) --------------------------
    b.box("concrete", -C.HALF_WIDTH, C.HALF_WIDTH, -0.42, 0.02, -C.HALF_DEPTH, C.HALF_DEPTH)
    b.box("concrete", -C.GARAGE_HALF_X, C.GARAGE_HALF_X, -0.42, 0.06, C.GARAGE_Z0, C.GARAGE_Z1)
    b.box("trim", -C.INNER_X, C.INNER_X, 0.02, C.GROUND_FLOOR_Y, -C.INNER_Z, C.INNER_Z, opaque=False)
    # Upper slab, split around the stairwell exactly as ``house.ts:464-497`` splits it. Wave 2
    # shipped this as one unbroken box, which capped the shaft: a shell that substitutes for the
    # procedural presentation would have run the stair into a solid ceiling. Marked opaque so the
    # transcribed head-height probe (studio-architecture.test.ts:157) actually tests the hole.
    hole = C.STAIR_HOLE
    for hx0, hx1, hz0, hz1 in (
        (-C.INNER_X, hole["x0"], -C.INNER_Z, C.INNER_Z),
        (hole["x1"], C.INNER_X, -C.INNER_Z, C.INNER_Z),
        (hole["x0"], hole["x1"], -C.INNER_Z, hole["z0"]),
        (hole["x0"], hole["x1"], hole["z1"], C.INNER_Z),
    ):
        b.box("trim", hx0, hx1, C.UPPER_FLOOR_Y - C.SLAB, C.UPPER_FLOOR_Y, hz0, hz1)
    b.box("trim", -C.INNER_X, C.INNER_X, C.UPPER_CEILING_Y, C.EAVE_Y, -C.INNER_Z, C.INNER_Z, opaque=False)

    # ---- exterior walls -----------------------------------------------------
    for key, frame in C.WALLS.items():
        build_exterior_wall(b, frame, C.EXTERIOR_OPENINGS[key], 0.0, C.EAVE_Y)

    # ---- exterior trim bands ------------------------------------------------
    # Projection depths raised in wave 2. These bands are the only thing breaking the two-storey
    # wall into readable stacked volumes at the street camera, and at 52-75 mm they cast a
    # shadow barely one pixel wide there, which is why the wave-2 front render read flat.
    for name, ty0, ty1, proud in (
        ("watertable", 0.30, 0.48, 0.098),
        ("beltcourse", C.UPPER_FLOOR_Y - 0.34, C.UPPER_FLOOR_Y - 0.16, 0.082),
        ("frieze", C.EAVE_Y - 0.26, C.EAVE_Y, 0.080),
    ):
        b.box("trim", C.HALF_WIDTH, C.HALF_WIDTH + proud, ty0, ty1, -C.HALF_DEPTH - proud, C.HALF_DEPTH + proud)
        b.box("trim", -C.HALF_WIDTH - proud, -C.HALF_WIDTH, ty0, ty1, -C.HALF_DEPTH - proud, C.HALF_DEPTH + proud)
        b.box("trim", -C.HALF_WIDTH, C.HALF_WIDTH, ty0, ty1, -C.HALF_DEPTH - proud, -C.HALF_DEPTH)
        b.box("trim", -C.HALF_WIDTH, C.HALF_WIDTH, ty0, ty1, C.HALF_DEPTH, C.HALF_DEPTH + proud)

    # Corner boards, the vertical white stops the concept shows on every corner.
    for cx, cz in ((C.HALF_WIDTH, -C.HALF_DEPTH), (C.HALF_WIDTH, C.HALF_DEPTH),
                   (-C.HALF_WIDTH, -C.HALF_DEPTH), (-C.HALF_WIDTH, C.HALF_DEPTH)):
        sx, sz = (1 if cx > 0 else -1), (1 if cz > 0 else -1)
        b.box("trim", cx - sx * 0.17, cx + sx * 0.075, 0.30, C.EAVE_Y, cz - sz * 0.075, cz + sz * 0.075)
        b.box("trim", cx - sx * 0.075, cx + sx * 0.075, 0.30, C.EAVE_Y, cz - sz * 0.17, cz + sz * 0.075)

    build_roof(b)
    build_chimney(b)
    build_porch_and_pergola(b)
    build_rear_balcony(b)
    build_garage(b)
    build_interior(b)

    for route, (rx, ry, rz) in C.ROUTE_LANDMARKS.items():
        b.marker(
            f"route-{route}",
            (rx, ry, rz),
            {
                "atomic_semantic": "route-landmark",
                "atomic_route_id": f"{v.house_id}-{route}",
            },
        )
    return b


def build_roof(b: Builder) -> None:
    """Low-pitch gable with a deep overhang, real shingle courses, fascia, gutter and rakes."""
    pitch = math.atan2(C.RIDGE_Y - C.EAVE_Y, C.ROOF_RUN)
    slope = math.hypot(C.ROOF_RUN, C.RIDGE_Y - C.EAVE_Y)
    depth = 2 * (C.HALF_DEPTH + C.RAKE_OVERHANG)
    centre_y = (C.RIDGE_Y + C.EAVE_Y) / 2
    exposure = 0.142875  # one shingle course

    for sign in (1, -1):
        cx = sign * C.ROOF_RUN / 2
        # Deck.
        b.rotated_slab("trim", (cx, centre_y - 0.02, 0.0), (slope, C.ROOF_THICKNESS, depth), -sign * pitch)
        # Shingle courses laid up the slope, each one proud of the one above it.
        courses = int(slope / exposure)
        for course in range(courses + 1):
            along = -slope / 2 + course * exposure + exposure / 2
            if along > slope / 2:
                break
            run = min(exposure, slope / 2 - (along - exposure / 2))
            # ``along`` runs down-slope from the ridge on both sides, so the course centre
            # steps outboard in X and down in Y by the same pitch the deck uses.
            ccx = cx + sign * math.cos(pitch) * along
            ccy = centre_y - math.sin(pitch) * along
            b.rotated_slab("shingle", (ccx, ccy + 0.10, 0.0), (run * 1.04, 0.045, depth), -sign * pitch)

        eave_x = sign * C.ROOF_RUN
        b.box("trim", sign * C.HALF_WIDTH, eave_x, C.EAVE_Y - 0.35, C.EAVE_Y - 0.28,
              -C.HALF_DEPTH - C.RAKE_OVERHANG, C.HALF_DEPTH + C.RAKE_OVERHANG)
        b.box("trim", eave_x, eave_x + sign * 0.10, C.EAVE_Y - 0.47, C.EAVE_Y - 0.04,
              -C.HALF_DEPTH - C.RAKE_OVERHANG, C.HALF_DEPTH + C.RAKE_OVERHANG)
        # Gutter: a real open trough — back, bottom and front lip, not a solid bar.
        gx0, gx1 = eave_x + sign * 0.10, eave_x + sign * 0.23
        b.box("metal", gx0, gx1, C.EAVE_Y - 0.46, C.EAVE_Y - 0.42, -C.HALF_DEPTH - C.RAKE_OVERHANG, C.HALF_DEPTH + C.RAKE_OVERHANG)
        b.box("metal", gx1, gx1 - sign * 0.02, C.EAVE_Y - 0.46, C.EAVE_Y - 0.31, -C.HALF_DEPTH - C.RAKE_OVERHANG, C.HALF_DEPTH + C.RAKE_OVERHANG)
        for z in (-C.HALF_DEPTH + 0.35, C.HALF_DEPTH - 0.35):
            b.box("metal", sign * C.HALF_WIDTH, sign * (C.HALF_WIDTH + 0.095), 0.05, C.EAVE_Y - 0.47, z - 0.05, z + 0.05)
            b.box("metal", sign * C.HALF_WIDTH, gx0, C.EAVE_Y - 0.47, C.EAVE_Y - 0.38, z - 0.05, z + 0.05)
        # Barge/rake boards. The gable end is the elevation both review cameras and the wave-2
        # front view actually see, and a 280 x 140 mm board on a 14 m gable is invisible from
        # there. A 360 x 210 mm board reads as a real raking eave and drops a shadow band onto
        # the gable siding, which is the depth cue the concept's roofline carries.
        for z in (-(C.HALF_DEPTH + C.RAKE_OVERHANG) + 0.09, C.HALF_DEPTH + C.RAKE_OVERHANG - 0.09):
            b.rotated_slab("trim", (cx, centre_y - 0.21, z), (slope, 0.36, 0.21), -sign * pitch)

    b.box("shingle", -0.28, 0.28, C.RIDGE_Y - 0.06, C.RIDGE_Y + 0.16,
          -C.HALF_DEPTH - C.RAKE_OVERHANG, C.HALF_DEPTH + C.RAKE_OVERHANG)

    # Gable infill, stepped under the roof plane so the attic is closed from outside.
    def roof_under(x: float) -> float:
        return C.RIDGE_Y - (abs(x) / C.ROOF_RUN) * (C.RIDGE_Y - C.EAVE_Y) - C.ROOF_THICKNESS / math.cos(pitch)

    for z in (-C.HALF_DEPTH, C.HALF_DEPTH - C.WALL):
        for step in range(16):
            x0 = -C.HALF_WIDTH + step * (C.HALF_WIDTH / 8)
            x1 = x0 + C.HALF_WIDTH / 8
            top = min(roof_under(x0), roof_under(x1))
            if top <= C.EAVE_Y + 0.02:
                continue
            b.box("siding", x0, x1, C.EAVE_Y - 0.02, top, z, z + C.WALL)


def build_chimney(b: Builder) -> None:
    """Random-ashlar masonry chimney built from real protruding stones.

    This is the strongest single material in the street concept, so it gets geometry: every
    course is laid with seeded stone widths and a per-stone proud depth, over a solid core.
    """
    x0, x1 = C.CHIMNEY_X0, C.CHIMNEY_X1
    z0, z1 = C.CHIMNEY_Z0, C.CHIMNEY_Z1
    top = C.CHIMNEY_TOP
    b.box("masonry", x0, x1, 0.0, top, z0, z1)               # core
    b.box("masonry", x0 - 0.15, x1 + 0.15, top, top + 0.22, z0 - 0.14, z1 + 0.14)   # cap
    b.box("masonry", x0 + 0.15, x1 - 0.15, 2.6, 2.78, z0 - 0.08, z0)                # shoulder

    course_h, joint = 0.28, 0.02
    faces = [
        ("xneg", (x0, z0, z1, -1)),
        ("xpos", (x1, z0, z1, 1)),
        ("zneg", (z0, x0, x1, -1)),
        ("zpos", (z1, x0, x1, 1)),
    ]
    courses = int(top / course_h)
    for course in range(courses):
        cy0 = course * course_h + joint
        cy1 = cy0 + course_h - joint * 2
        if cy1 > top - 0.04:
            break
        for kind, (at, u_lo, u_hi, out) in faces:
            u = u_lo + b.rng.span(0.0, 0.22)
            while u < u_hi - 0.12:
                width = min(b.rng.span(0.26, 0.62), u_hi - u - 0.02)
                if width < 0.12:
                    break
                proud = b.rng.span(0.035, 0.085)
                if kind.startswith("x"):
                    b.box("masonry", at, at + out * proud, cy0, cy1, u, u + width - joint)
                else:
                    b.box("masonry", u, u + width - joint, cy0, cy1, at, at + out * proud)
                u += width


def build_porch_and_pergola(b: Builder) -> None:
    """Street entry: concrete porch, posts, the balcony above it and an open slatted pergola.

    The concept's defining street element is the white open-slat pergola over the entry, so
    the slats are modelled as real separated boards rather than a textured plane.
    """
    px0, px1, pz0, pz1 = C.PORCH_X0, C.PORCH_X1, C.PORCH_Z0, C.PORCH_Z1
    deck_y = C.UPPER_FLOOR_Y

    b.box("concrete", px0, px1, 0.0, C.PORCH_Y, pz0, pz1)
    b.box("concrete", px1, px1 + 0.45, 0.0, C.PORCH_Y - 0.08, pz0 + 2.4, pz1 - 1.4)
    b.box("trim", px0, px1 + 0.03, C.PORCH_Y - 0.06, C.PORCH_Y, pz1, pz1 + 0.03)

    for z in (1.0, 2.9, 5.1, 6.9):
        b.box("trim", px1 - 0.26, px1 - 0.06, C.PORCH_Y, deck_y - 0.12, z - 0.09, z + 0.09)
    b.box("trim", px1 - 0.30, px1 - 0.02, deck_y - 0.32, deck_y - 0.12, pz0, pz1)
    b.box("trim", px0 - 0.02, px0 + 0.20, deck_y - 0.32, deck_y - 0.12, pz0, pz1)
    b.box("trim", px0, px1 - 0.04, deck_y - 0.12, deck_y - 0.06, pz0, pz1)

    # Street balcony deck over the porch.
    b.box("door", px0, px1, deck_y - 0.06, deck_y, pz0, pz1)
    b.box("trim", px1, px1 + 0.06, deck_y - 0.24, deck_y + 0.02, pz0 - 0.06, pz1 + 0.06)
    rail_top = deck_y + 1.02
    b.box("trim", px1 - 0.09, px1, rail_top - 0.10, rail_top, pz0, pz1)
    b.box("trim", px0, px1, rail_top - 0.10, rail_top, pz0, pz0 + 0.09)
    b.box("trim", px0, px1, rail_top - 0.10, rail_top, pz1 - 0.09, pz1)
    z = pz0 + 0.10
    while z < pz1 - 0.08:
        b.box("trim", px1 - 0.06, px1 - 0.01, deck_y, rail_top - 0.10, z - 0.025, z + 0.025)
        z += 0.13
    for z_end in (pz0 + 0.04, pz1 - 0.09):
        x = px0 + 0.12
        while x < px1 - 0.10:
            b.box("trim", x - 0.025, x + 0.025, deck_y, rail_top - 0.10, z_end, z_end + 0.05)
            x += 0.13

    # Pergola: posts, outer beam, wall ledger and open slats running out from the house.
    for z in (pz0 + 0.5, pz1 - 0.5):
        b.box("trim", px1 - 0.24, px1 - 0.06, deck_y, 6.15, z - 0.08, z + 0.08)
    b.box("trim", px1 - 0.28, px1 - 0.02, 6.15, 6.35, pz0, pz1)
    b.box("trim", px0 - 0.02, px0 + 0.18, 6.15, 6.35, pz0, pz1)
    z = pz0 + 0.20
    while z < pz1 - 0.10:
        b.box("trim", px0 - 0.05, px1 - 0.02, 6.35, 6.44, z - 0.032, z + 0.032)
        z += 0.28


def build_rear_balcony(b: Builder) -> None:
    """Backyard balcony, posts and the external stair that serves it (concept -37cd28a5)."""
    bx0, bx1, bz0, bz1 = C.BALCONY_X0, C.BALCONY_X1, C.BALCONY_Z0, C.BALCONY_Z1
    y = C.UPPER_FLOOR_Y
    b.box("door", bx0, bx1, y - 0.12, y, bz0, bz1)
    b.box("trim", bx0 - 0.04, bx1, y - 0.20, y - 0.12, bz0 - 0.04, bz1 + 0.04)
    for z in (bz0 + 0.4, bz1 - 0.4):
        b.box("trim", bx0 + 0.10, bx0 + 0.28, 0.0, y - 0.12, z - 0.09, z + 0.09)
    rail_top = y + 1.02
    b.box("trim", bx0, bx0 + 0.09, rail_top - 0.10, rail_top, bz0, bz1)
    b.box("trim", bx0, bx1, rail_top - 0.10, rail_top, bz0, bz0 + 0.09)
    b.box("trim", -7.9, bx1, rail_top - 0.10, rail_top, bz1 - 0.09, bz1)
    z = bz0 + 0.12
    while z < bz1 - 0.10:
        b.box("trim", bx0 + 0.01, bx0 + 0.06, y, rail_top - 0.10, z - 0.025, z + 0.025)
        z += 0.13
    x = bx0 + 0.12
    while x < bx1 - 0.10:
        b.box("trim", x - 0.025, x + 0.025, y, rail_top - 0.10, bz0 + 0.01, bz0 + 0.06)
        x += 0.13

    # External stair: 16 treads, matching the contracted rise and going.
    for step in range(C.STAIR_STEPS):
        sz0 = bz1 + step * C.STAIR_GOING
        top = C.UPPER_FLOOR_Y - (step + 1) * C.STAIR_RISE
        b.box("door", C.EXT_STAIR_X0, C.EXT_STAIR_X1, max(top - 0.10, 0.0), top, sz0, sz0 + C.STAIR_GOING)
    # Its handrail, from house.ts:787-793. Wave 2 omitted it, which would have left a visible
    # hole the moment the procedural presentation was hidden: the procedural mesh is merged per
    # (group, material), so there is no way to hide the walls and keep this one rail.
    pitch = math.atan2(C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y, C.STAIR_RUN)
    b.rotated_slab_x(
        "trim",
        (C.EXT_STAIR_X0 - 0.05, C.UPPER_FLOOR_Y - (C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y) / 2 + 0.95, bz1 + C.STAIR_RUN / 2),
        (0.08, 0.08, math.hypot(C.STAIR_RUN, C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y)),
        pitch,
    )


def build_garage(b: Builder) -> None:
    """Attached garage wing: walls with their declared openings, flat roof, apron and the
    sectional door parked under the head so the vehicle opening stays a real route."""
    for key, frame in C.GARAGE_WALLS.items():
        openings = C.GARAGE_OPENINGS[key]
        solids = C.subtract_apertures((frame.u_from, frame.u_to, 0.0, C.GARAGE_ROOF_Y), _aperture_rects(openings))
        half = frame.thickness / 2
        for rect in solids:
            _wall_box(b, frame, "trim", rect, -half, half - frame.outward * 0.012)
            _emit_lap_siding(b, frame, rect, half)
        for opening in openings:
            dress_opening(b, frame, opening)

    gx, z0, z1 = C.GARAGE_HALF_X, C.GARAGE_Z0, C.GARAGE_Z1
    b.box("trim", -gx - 0.22, gx + 0.22, C.GARAGE_ROOF_Y - 0.22, C.GARAGE_ROOF_Y, z0 - 0.22, z1 + 0.28)
    b.box("shingle", -gx - 0.22, gx + 0.22, C.GARAGE_ROOF_Y, C.GARAGE_ROOF_Y + 0.05, z0 - 0.22, z1 + 0.28)
    for x in (-gx - 0.28, gx + 0.22):
        b.box("trim", x, x + 0.06, C.GARAGE_ROOF_Y - 0.30, C.GARAGE_ROOF_Y + 0.06, z0 - 0.28, z1 + 0.34)
    b.box("trim", -gx - 0.28, gx + 0.28, C.GARAGE_ROOF_Y - 0.30, C.GARAGE_ROOF_Y + 0.06, z1 + 0.28, z1 + 0.34)
    b.box("metal", -gx - 0.28, gx + 0.28, C.GARAGE_ROOF_Y - 0.30, C.GARAGE_ROOF_Y - 0.26, z1 + 0.34, z1 + 0.40)

    # Driveway apron running out from the vehicle opening. Deliberately stopped at Z 20.6:
    # the visual contract expects the visible shell to stay near Z +19.31, and the road, kerb
    # and ground surface beyond that belong to other owners.
    b.box("concrete", -2.6, 2.6, -0.30, 0.02, z1 + 0.28, z1 + 1.6)

    # Sectional door parked flat under the ceiling. It never crosses the opening.
    for panel in range(4):
        y = 2.66 + panel * 0.16
        b.box("metal", -2.3, 2.3, y, y + 0.14, z1 - 1.92, z1 - 1.80, opaque=False)
    for x in (-2.32, 2.32):
        b.box("metal", x - 0.05, x + 0.05, 3.2, 3.28, z1 - 3.4, z1 - 0.2, opaque=False)
    b.box("trim", -2.48, 2.48, 2.55, 2.74, z1 - 0.28, z1 + 0.04)
    b.box("trim", -2.48, -2.3, 0.0, 2.74, z1 - 0.28, z1 + 0.04)
    b.box("trim", 2.3, 2.48, 0.0, 2.74, z1 - 0.28, z1 + 0.04)


# ---------------------------------------------------------------- interior (wave 3)

def build_interior(b: Builder) -> None:
    """Interior partitions, cased openings, skirting/cornice and the 16-tread internal stair.

    Wave 2 shipped a deliberately minimal interior shell and recorded it as falsifier 5. That
    made substitution unsafe for a reason worth restating: ``build.ts:310-334`` merges the whole
    procedural house into one mesh per ``(group, material)`` pair, so a root that hides
    ``world-studio-<houseId>-*`` hides the interior walls and the stair together with the
    exterior. There is no partial hide. Either the GLB carries the interior or hiding is a
    regression.

    Every dimension comes from ``house_contract`` and therefore from ``house.ts``; none is
    chosen here. The stair in particular reproduces the contracted rise, going, run and the
    ``STAIR_HOLE`` the upper slab is split around.
    """
    for frame in C.INTERIOR_PARTITIONS:
        build_partition(b, frame)
    build_interior_stair(b)
    build_interior_trim(b)
    build_garage_roof_threshold(b)


def build_partition(b: Builder, frame: C.PartitionFrame) -> None:
    """One interior partition leaf plus a cased architrave around each of its openings."""
    v = b.variant
    half = C.PARTITION / 2
    solids = C.subtract_apertures((frame.u_from, frame.u_to, frame.y0, frame.y1), _aperture_rects(frame.openings))
    for rect in solids:
        _wall_box(b, frame, "trim", rect, -half, half)

    arch, face = C.ARCHITRAVE, half + C.ARCHITRAVE_PROUD
    for opening in frame.openings:
        u0, u1, y0, y1 = opening.u0, opening.u1, opening.y0, opening.y1
        # Head and both jambs stand proud of the leaf on both faces, and all three sit strictly
        # outside the declared void, so the opening stays a clear route through the partition.
        _wall_box(b, frame, "trim", (u0 - arch, u1 + arch, y1, y1 + arch), -face, face)
        _wall_box(b, frame, "trim", (u0 - arch, u0, y0, y1), -face, face)
        _wall_box(b, frame, "trim", (u1, u1 + arch, y0, y1), -face, face)

        cu, cy = (u0 + u1) / 2, (y0 + y1) / 2
        pos = (frame.at, cy, cu) if frame.axis == "z" else (cu, cy, frame.at)
        b.marker(
            f"interior-{frame.key}-{opening.id}",
            pos,
            {
                # A distinct semantic from the exterior ``aperture-audit``: the 26 declared
                # gameplay apertures are a frozen contract and their count must not move.
                "atomic_semantic": "interior-aperture-audit",
                "atomic_interior_aperture_id": f"{v.house_id}:{frame.key}:{opening.id}",
                "atomic_aperture_kind": "cased",
                "atomic_aperture_clear": True,
                "atomic_aperture_samples": 9,
                "atomic_aperture_bounds": [u0, y0, u1, y1],
                "atomic_aperture_wall": frame.key,
            },
        )

    lo = (frame.at - half, frame.y0, frame.u_from) if frame.axis == "z" else (frame.u_from, frame.y0, frame.at - half)
    hi = (frame.at + half, frame.y1, frame.u_to) if frame.axis == "z" else (frame.u_to, frame.y1, frame.at + half)
    b.marker(
        f"partition-{frame.key}",
        ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        {
            "atomic_semantic": "interior-partition",
            "atomic_partition_id": f"{v.house_id}:{frame.key}",
            "atomic_partition_storey": frame.storey,
            "atomic_partition_bounds": [*lo, *hi],
            "atomic_partition_openings": [o.id for o in frame.openings],
        },
    )


def build_interior_stair(b: Builder) -> None:
    """The contracted straight flight: 16 treads at 201.25 mm rise and 281.25 mm going.

    Each tread is a solid block from the floor to its own top, which is what ``house.ts:667``
    builds and what makes ``supportHeight`` return the contracted value at every step. A tread
    marker records the measured top so the 16 treads are inspectable from the GLB alone.
    """
    v = b.variant
    x0, x1 = C.STAIR_X0, C.STAIR_X1
    for step in range(C.STAIR_STEPS):
        z0 = C.STAIR_Z0 + step * C.STAIR_GOING
        z1 = z0 + C.STAIR_GOING
        top = C.stair_tread_top(step)
        b.box("door", x0, x1, 0.02, top, z0, z1)
        b.box("trim", x0, x1 + 0.03, top - 0.04, top, z0 - 0.03, z0 + 0.06, opaque=False)
        bz = C.STAIR_Z0 + (step + 0.5) * C.STAIR_GOING
        b.box("metal", x1, x1 + 0.04, top, top + 0.93, bz - 0.02, bz + 0.02, opaque=False)
        b.marker(
            f"stair-tread-{step:02d}",
            ((x0 + x1) / 2, top, (z0 + z1) / 2),
            {
                "atomic_semantic": "stair-tread",
                "atomic_route_id": f"{v.house_id}-interior-stair",
                "atomic_stair_index": step,
                "atomic_stair_tread_top": top,
                "atomic_stair_tread_bounds": [x0, 0.02, z0, x1, top, z1],
            },
        )

    pitch = math.atan2(C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y, C.STAIR_RUN)
    b.rotated_slab_x(
        "door",
        (x1 + 0.04, C.GROUND_FLOOR_Y + (C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y) / 2 + 0.95, C.STAIR_Z0 + C.STAIR_RUN / 2),
        (0.09, 0.07, math.hypot(C.STAIR_RUN, C.UPPER_FLOOR_Y - C.GROUND_FLOOR_Y)),
        -pitch,
    )

    # Landing guard around the stairwell opening, house.ts:691-697.
    hole = C.STAIR_HOLE
    guard_top = C.UPPER_FLOOR_Y + 1.02
    b.box("door", hole["x1"], hole["x1"] + 0.08, C.UPPER_FLOOR_Y, guard_top, hole["z0"], hole["z1"])
    b.box("door", hole["x0"], hole["x1"] + 0.08, C.UPPER_FLOOR_Y, guard_top, hole["z0"], hole["z0"] + 0.08)
    for baluster in range(14):
        z = hole["z0"] + 0.2 + baluster * 0.29
        if z > hole["z1"] - 0.1:
            break
        b.box("metal", hole["x1"] + 0.02, hole["x1"] + 0.06, C.UPPER_FLOOR_Y, C.UPPER_FLOOR_Y + 0.95,
              z - 0.02, z + 0.02, opaque=False)


def build_interior_trim(b: Builder) -> None:
    """Skirting and picture rail, house.ts:652-660 — the cheap detail that stops a room reading
    as a box at the interior review camera."""
    g, u, s = C.GROUND_FLOOR_Y, C.UPPER_FLOOR_Y, C.SLAB
    b.box("trim", C.INNER_X - 0.03, C.INNER_X, g, g + 0.14, -C.INNER_Z, C.INNER_Z, opaque=False)
    b.box("trim", -C.INNER_X, -C.INNER_X + 0.03, g, g + 0.14, -C.INNER_Z, C.INNER_Z, opaque=False)
    b.box("trim", -C.INNER_X, C.INNER_X, u, u + 0.14, -C.INNER_Z, -C.INNER_Z + 0.03, opaque=False)
    b.box("trim", -C.INNER_X, C.INNER_X, u, u + 0.14, C.INNER_Z - 0.03, C.INNER_Z, opaque=False)
    b.box("trim", -C.INNER_X, C.INNER_X, u - s - 0.1, u - s, -C.INNER_Z, -C.INNER_Z + 0.08, opaque=False)
    b.box("trim", -C.INNER_X, C.INNER_X, u - s - 0.1, u - s, C.INNER_Z - 0.08, C.INNER_Z, opaque=False)


def build_garage_roof_threshold(b: Builder) -> None:
    """The sloped board that bridges upper floor 3.30 to garage roof 3.50, house.ts:869-873."""
    run = C.GARAGE_ROOF_THRESHOLD_Z1 - C.GARAGE_ROOF_THRESHOLD_Z0
    rise = C.GARAGE_ROOF_Y - C.UPPER_FLOOR_Y
    pitch = math.atan2(rise, run)
    thickness = C.GARAGE_ROOF_THRESHOLD_THICKNESS
    b.rotated_slab_x(
        "door",
        (
            C.GARAGE_ROOF_THRESHOLD_X[b.variant.name],
            (C.UPPER_FLOOR_Y + C.GARAGE_ROOF_Y) / 2 - math.cos(pitch) * thickness / 2,
            (C.GARAGE_ROOF_THRESHOLD_Z0 + C.GARAGE_ROOF_THRESHOLD_Z1) / 2 + math.sin(pitch) * thickness / 2,
        ),
        (C.GARAGE_ROOF_THRESHOLD_WIDTH, thickness, math.hypot(run, rise)),
        -pitch,
    )


# ---------------------------------------------------------------- self-audit

def assert_apertures_clear(b: Builder) -> List[dict]:
    """Sample every declared aperture against the accumulated opaque solids.

    Nine samples per aperture (centre plus the inner-third grid), exactly the minimum the
    visual contract requires. A hit is a mismatch, reported rather than silently exported.
    """
    frames: Dict[str, object] = {**C.WALLS, **C.GARAGE_WALLS}
    for partition in C.INTERIOR_PARTITIONS:
        frames[partition.key] = partition

    mismatches: List[dict] = []
    for marker in b.markers:
        props = marker["props"]
        if props.get("atomic_semantic") not in ("aperture-audit", "interior-aperture-audit"):
            continue
        u0, y0, u1, y1 = props["atomic_aperture_bounds"]
        wall_key = props["atomic_aperture_wall"]
        frame = frames[wall_key]
        kind = props["atomic_aperture_kind"]
        # A slider's glazed leaf is legitimate: only audit the clear half.
        if kind == "slider":
            u0 = (u0 + u1) / 2 + 0.05
        hits = 0
        for fu in (0.34, 0.5, 0.66):
            for fy in (0.34, 0.5, 0.66):
                u = u0 + (u1 - u0) * fu
                y = y0 + (y1 - y0) * fy
                px, pz = (frame.at, u) if frame.axis == "z" else (u, frame.at)
                for sx0, sx1, sy0, sy1, sz0, sz1 in b.opaque:
                    if sx0 + 1e-4 < px < sx1 - 1e-4 and sy0 + 1e-4 < y < sy1 - 1e-4 and sz0 + 1e-4 < pz < sz1 - 1e-4:
                        hits += 1
                        break
        props["atomic_aperture_clear"] = hits == 0
        if hits:
            mismatches.append({
                "aperture": props.get("atomic_aperture_id") or props["atomic_interior_aperture_id"],
                "interior": props["atomic_semantic"] == "interior-aperture-audit",
                "blockedSamples": hits,
                "of": 9,
            })
    return mismatches


def support_height(solids: Sequence[Tuple[float, ...]], x: float, z: float, below_y: float) -> float | None:
    """Highest opaque top at or below ``below_y`` under ``(x, z)``.

    The presentation-side mirror of the runtime's ``supportHeight`` helper, so the transcribed
    tread probe in ``studio-architecture.test.ts:150`` can be run against this mesh.
    """
    best: float | None = None
    for sx0, sx1, sy0, sy1, sz0, sz1 in solids:
        if sx0 - 1e-6 <= x <= sx1 + 1e-6 and sz0 - 1e-6 <= z <= sz1 + 1e-6 and sy1 <= below_y + 1e-6:
            best = sy1 if best is None else max(best, sy1)
    return best


def assert_stair_treads(b: Builder) -> List[dict]:
    """Re-measure all 16 treads from the built mesh, the way the runtime test measures them.

    ``studio-architecture.test.ts:142-155`` queries the support height a millimetre above each
    contracted tread top and requires it to equal the contract, with no rise above 0.5 m. The
    same query is run here against the accumulated opaque solids. This is a *presentation*
    measurement — it proves the visible tread exists at the height the collider claims, which is
    exactly the substitution question. It does not re-derive or replace the collider.
    """
    problems: List[dict] = []
    previous = C.GROUND_FLOOR_Y
    for step in range(C.STAIR_STEPS):
        z = C.STAIR_Z0 + (step + 0.5) * C.STAIR_GOING
        expected = C.stair_tread_top(step)
        got = support_height(b.opaque, C.STAIR_PROBE_X, z, expected + 0.001)
        if got is None or abs(got - expected) > 1e-5:
            problems.append({"tread": step, "expected": expected, "measured": got})
        elif got - previous >= 0.5:
            problems.append({"tread": step, "rise": got - previous, "limit": 0.5})
        if got is not None:
            previous = got
    return problems


def assert_probes_clear(b: Builder) -> List[dict]:
    """Run the runtime's own transcribed probe coordinates against the built opaque solids.

    Wave 2's falsifier 2 was that the aperture audit only ever measured this lane's own list.
    These probes are not this lane's: they are the exact coordinates
    ``studio-architecture.test.ts:96-157`` uses, converted into the local frame. A hit means the
    presentation shell would visually block a route the runtime believes is open.
    """
    blocked: List[dict] = []
    groups = (
        ("runtime-route", C.RUNTIME_ROUTE_PROBES),
        ("interior-room", C.INTERIOR_ROOM_PROBES),
        ("stairwell-head", C.STAIRWELL_HEAD_PROBES),
    )
    for kind, probes in groups:
        for label, x, y, z in probes:
            for sx0, sx1, sy0, sy1, sz0, sz1 in b.opaque:
                if sx0 + 1e-4 < x < sx1 - 1e-4 and sy0 + 1e-4 < y < sy1 - 1e-4 and sz0 + 1e-4 < z < sz1 - 1e-4:
                    blocked.append({"kind": kind, "probe": label, "at": [x, y, z],
                                    "blocker": [sx0, sy0, sz0, sx1, sy1, sz1]})
                    break
    return blocked


def measure_panes(b: Builder) -> List[dict]:
    """Per-pane glass evidence: identity, position and the exact glass box that carries it.

    The prompt for this wave is explicit that a pane must stay a real, inspectable glass
    component with its own window identity, and that no opaque duplicate or superposed pane may
    appear. ``glass_bounds`` is the pane's own solid; ``opaqueBehind`` is a nine-sample test of
    the pane rectangle against every opaque solid in the build, so a partition or lining placed
    across a window shows up as a number rather than as an opinion.
    """
    out: List[dict] = []
    for pane in b.panes:
        x, y, z = pane["localBounds"][0], pane["localBounds"][1], pane["localBounds"][2]
        x1, y1, z1 = pane["localBounds"][3], pane["localBounds"][4], pane["localBounds"][5]
        hits = 0
        for fu in (0.25, 0.5, 0.75):
            for fv in (0.25, 0.5, 0.75):
                px = x + (x1 - x) * (fu if x1 - x > 0.05 else 0.5)
                py = y + (y1 - y) * fv
                pz = z + (z1 - z) * (fu if z1 - z > 0.05 else 0.5)
                for sx0, sx1, sy0, sy1, sz0, sz1 in b.opaque:
                    if sx0 + 1e-4 < px < sx1 - 1e-4 and sy0 + 1e-4 < py < sy1 - 1e-4 and sz0 + 1e-4 < pz < sz1 - 1e-4:
                        hits += 1
                        break
        out.append({
            "name": pane["name"],
            "windowId": pane["windowId"],
            "solidId": pane["solidId"],
            "localBounds": [round(v, 4) for v in pane["localBounds"]],
            "opaqueBehind": hits,
        })
    return out


# ---------------------------------------------------------------- Blender realisation

def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def make_material(name: str, maps: Dict[str, Path], *, glass: bool = False, base_rgb=(0.8, 0.8, 0.8)) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]

    # Wave 4. Blender defaults ``use_backface_culling`` to False, so the glTF exporter wrote
    # every material ``doubleSided: true``, and ``src/world-studio/houses/index.ts:229`` then
    # walks the loaded scene and forces ``FrontSide`` back onto every opaque material. The
    # export has been shipping a flag its only consumer immediately overrides.
    #
    # Be precise about what this buys, because it is easy to overclaim. Every solid here is a
    # closed box, so each box's back face lies in the plane of whatever it is mounted on; those
    # coincident pairs would fight in a renderer that draws both sides. ``audit_surfaces.py``
    # counts 21,174 such opposite-facing pairs. They were *already* cured in this project's
    # runtime by that ``FrontSide`` assignment, so this line fixes no pixel there — it makes
    # the file honest for any other consumer and removes a silent dependency on loader repair.
    # It does **not** touch the 12,509 same-facing pairs, which no culling rule can resolve;
    # those are still open (HANDOFF falsifier 13).
    #
    # Glass is the deliberate exception: the loader forces ``DoubleSide`` on it too, and the
    # wave-2 alpha 0.42 film was solved with both faces blending. Culling it would halve the
    # density that measurement fixed, so it stays as it was.
    mat.use_backface_culling = not glass

    if glass:
        # Wave 2: "glass reads flat light-gray in all views". A near-white pane at alpha 0.28 is
        # mostly whatever is behind it, so under the evaluator's bright uniform world every
        # window read as a white board with muntins. Real glazing seen from outside is darker
        # than the wall because it shows an unlit interior. A darker blue-grey film at a higher
        # alpha gives that without claiming a reflection the uniform world cannot produce.
        bsdf.inputs["Base Color"].default_value = (0.42, 0.52, 0.56, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.07
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 0.42
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
        return mat

    tex_coord = nodes.new("ShaderNodeTexCoord")
    for slot_name, socket, colorspace in (
        ("albedo", "Base Color", "sRGB"),
        ("roughness", "Roughness", "Non-Color"),
    ):
        path = maps.get(slot_name)
        if not path:
            continue
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(path))
        node.image.colorspace_settings.name = colorspace
        node.interpolation = "Smart"
        links.new(tex_coord.outputs["UV"], node.inputs["Vector"])
        if socket == "Roughness":
            sep = nodes.new("ShaderNodeSeparateColor")
            links.new(node.outputs["Color"], sep.inputs["Color"])
            links.new(sep.outputs["Red"], bsdf.inputs["Roughness"])
        else:
            links.new(node.outputs["Color"], bsdf.inputs[socket])

    normal_path = maps.get("normal")
    if normal_path:
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(normal_path))
        node.image.colorspace_settings.name = "Non-Color"
        links.new(tex_coord.outputs["UV"], node.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 1.0
        links.new(node.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if not maps:
        # Wave-3 defect, found while wiring the stair: ``base_rgb`` was accepted and never used,
        # so the untextured "door" slot shipped at Blender's 0.8 grey default. Every front door,
        # both balcony decks and the whole external stair were therefore neutral grey rather than
        # the ``door_rgb`` the variant declares. The parameter is now applied; the declared
        # colour was already in ``house_contract.VARIANTS``, so nothing new was invented.
        bsdf.inputs["Base Color"].default_value = (*base_rgb, 1.0)

    # The "metal" slot is gutters, downpipes and a sectional garage door: all powder-coated,
    # i.e. a paint film over metal. Wave 1's 0.85 made them behave as bare polished aluminium
    # and they came back as silver glints in the close renders.
    bsdf.inputs["Metallic"].default_value = 0.25 if name.endswith("metal") else 0.0
    return mat


def realise(b: Builder, textures: Dict[str, Dict[str, Path]]) -> Tuple[bpy.types.Object, Dict[str, int]]:
    v = b.variant
    root = bpy.data.objects.new(C.partition_key(v.name), None)
    bpy.context.scene.collection.objects.link(root)
    root["atomic_asset_class"] = "world-studio-house-shell"
    root["atomic_presentation_partition"] = C.partition_key(v.name)
    root["atomic_coordinate_contract"] = C.CONTRACT_ID
    root["atomic_units"] = "meters"
    root["atomic_up_axis"] = "Y"
    root["atomic_house_id"] = v.house_id
    root["atomic_source_sha"] = C.SOURCE_SHA
    root["atomic_collision_authority"] = "typescript-world-studio-solids-v1"

    census: Dict[str, int] = {}
    for name, slot in sorted(b.slots.items()):
        mesh = bpy.data.meshes.new(f"{v.name}-{name}")
        mesh.from_pydata(slot.verts, [], [list(f) for f in slot.faces])
        mesh.update()
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for loop_index, loop in enumerate(mesh.loops):
            uv_layer.data[loop_index].uv = slot.uvs[loop_index]
        mesh.validate(verbose=False)
        # Blender authors Z-up; the glTF exporter converts to the Y-up the contract requires.
        obj = bpy.data.objects.new(f"{C.partition_key(v.name)}.{name}", mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = root
        obj["atomic_semantic"] = "shell-surface"
        obj["atomic_material_slot"] = name
        obj["atomic_presentation_only"] = True

        if name == "glass":
            mat = make_material(f"{v.name}-glass", {}, glass=True)
        else:
            # "door" is the only slot with no synthesised map set: doors, decks, stair treads
            # and handrails are a flat painted/stained colour, so it takes its declared albedo.
            maps = textures.get(name, {})
            if not maps and name != "door":
                raise RuntimeError(f"material slot '{name}' has no texture set and no declared colour")
            mat = make_material(f"{v.name}-{name}", maps, base_rgb=v.door_rgb)
        mesh.materials.append(mat)
        census[name] = slot.triangles

    for pane in b.panes:
        empty = bpy.data.objects.new(f"{C.partition_key(v.name)}.{pane['name']}", None)
        empty.empty_display_size = 0.2
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = root
        empty.location = _to_blender(pane["position"], b.mirror)
        empty["atomic_semantic"] = "breakable-window"
        empty["atomic_window_id"] = pane["windowId"]
        empty["atomic_solid_id"] = pane["solidId"]
        empty["atomic_house_id"] = v.house_id
        # The exact glass solid this identity names, so an inspector can find the pane in the
        # merged glass mesh instead of trusting that the marker sits on one.
        empty["atomic_window_bounds"] = [float(value) for value in pane["localBounds"]]

    for marker in b.markers:
        empty = bpy.data.objects.new(f"{C.partition_key(v.name)}.{marker['name']}", None)
        empty.empty_display_size = 0.2
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = root
        empty.location = _to_blender(marker["position"], 1.0)
        for key, value in marker["props"].items():
            empty[key] = value
        empty["atomic_house_id"] = v.house_id
    return root, census


def _to_blender(position: Sequence[float], mirror: float) -> Tuple[float, float, float]:
    """Contract frame (X right, Y up, Z depth) -> Blender Z-up (X, -Z, Y)."""
    x, y, z = position[0] * (mirror if mirror < 0 else 1.0), position[1], position[2]
    return (x, -z, y)


def rotate_to_blender_up(root: bpy.types.Object) -> None:
    """Author in the contract's Y-up frame, then rotate the whole rig into Blender's Z-up so
    the glTF exporter's ``+Y up`` conversion returns it exactly where the contract wants it."""
    for obj in root.children:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        for vert in mesh.vertices:
            x, y, z = vert.co[0], vert.co[1], vert.co[2]
            vert.co = (x, -z, y)
        mesh.update()


def measure_bounds(b: Builder) -> Dict[str, List[float]]:
    xs = [v[0] for slot in b.slots.values() for v in slot.verts]
    ys = [v[1] for slot in b.slots.values() for v in slot.verts]
    zs = [v[2] for slot in b.slots.values() for v in slot.verts]
    return {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}


def main(argv: Sequence[str]) -> int:
    args_start = argv.index("--") + 1 if "--" in argv else len(argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", required=True, choices=sorted(C.VARIANTS))
    args = parser.parse_args(argv[args_start:])

    v = C.VARIANTS[args.variant]
    print(f"[houses] building {v.house_id} (Blender {bpy.app.version_string})", flush=True)

    b = build_shell(args.variant)
    all_mismatches = assert_apertures_clear(b)
    # The 26 declared gameplay apertures keep their own frozen list; the 7 interior cased
    # openings are reported separately so the exterior gate's meaning never drifts.
    mismatches = [m for m in all_mismatches if not m["interior"]]
    interior_mismatches = [m for m in all_mismatches if m["interior"]]
    tread_problems = assert_stair_treads(b)
    blocked_probes = assert_probes_clear(b)
    panes = measure_panes(b)
    bounds = measure_bounds(b)

    tex_dir = SOURCE_DIR / args.variant / "textures"
    textures = T.write_material_set(
        tex_dir,
        v.seed,
        {
            "siding": v.siding_rgb,
            "siding_shade": v.siding_shade_rgb,
            "shingle": v.shingle_rgb,
            "masonry": v.masonry_rgb,
            "masonry_b": v.masonry_rgb_b,
            "trim": v.trim_rgb,
        },
    )

    reset_scene()
    root, census = realise(b, textures)
    rotate_to_blender_up(root)

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    glb_path = ASSET_DIR / f"house-{args.variant}-shell.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        use_selection=False,
    )

    digest = hashlib.sha256(glb_path.read_bytes()).hexdigest()
    texture_bytes = sum(p.stat().st_size for maps in textures.values() for p in maps.values())
    report = {
        "variant": args.variant,
        "houseId": v.house_id,
        "partition": C.partition_key(args.variant),
        "blender": bpy.app.version_string,
        "glb": str(glb_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "sha256": digest,
        "bytes": glb_path.stat().st_size,
        "localBounds": bounds,
        "placement": [v.centre_x, 0.0, 0.0],
        "triangles": sum(census.values()),
        "trianglesByMaterial": census,
        "materials": len(census),
        "drawGroups": len(census),
        "textureBytes": texture_bytes,
        "textureMeasurements": T.TEXTURE_MEASUREMENTS,
        "panes": len(b.panes),
        "apertureMarkers": sum(1 for m in b.markers if m["props"].get("atomic_semantic") == "aperture-audit"),
        "routeLandmarks": sum(1 for m in b.markers if m["props"].get("atomic_semantic") == "route-landmark"),
        "apertureMismatches": mismatches,
        "roadClearanceLocalX": C.ROAD_CLEARANCE_LOCAL_X,
        "roadClearanceOk": max(abs(bounds["min"][0]), abs(bounds["max"][0])) <= C.ROAD_CLEARANCE_LOCAL_X + 1e-6,
        # ---- wave 3: interior substitution evidence ----
        "interiorPartitions": sum(1 for m in b.markers if m["props"].get("atomic_semantic") == "interior-partition"),
        "interiorApertureMarkers": sum(1 for m in b.markers if m["props"].get("atomic_semantic") == "interior-aperture-audit"),
        "interiorApertureMismatches": interior_mismatches,
        "stairTreads": sum(1 for m in b.markers if m["props"].get("atomic_semantic") == "stair-tread"),
        "stairRise": C.STAIR_RISE,
        "stairGoing": C.STAIR_GOING,
        "stairTreadTops": [C.stair_tread_top(step) for step in range(C.STAIR_STEPS)],
        "stairTreadProblems": tread_problems,
        "stairHole": C.STAIR_HOLE,
        "blockedRuntimeProbes": blocked_probes,
        "runtimeProbesChecked": len(C.RUNTIME_ROUTE_PROBES) + len(C.INTERIOR_ROOM_PROBES) + len(C.STAIRWELL_HEAD_PROBES),
        "paneDetail": panes,
    }
    report_path = SOURCE_DIR / args.variant / "build-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("[houses] " + json.dumps({k: report[k] for k in (
        "variant", "sha256", "bytes", "triangles", "materials", "panes",
        "apertureMarkers", "routeLandmarks", "roadClearanceOk",
        "interiorPartitions", "interiorApertureMarkers", "stairTreads")}), flush=True)
    failed = False
    for label, payload in (
        ("APERTURE MISMATCHES", mismatches),
        ("INTERIOR APERTURE MISMATCHES", interior_mismatches),
        ("STAIR TREAD PROBLEMS", tread_problems),
        ("BLOCKED RUNTIME PROBES", blocked_probes),
    ):
        if payload:
            failed = True
            print(f"[houses] {label}: {json.dumps(payload)}", flush=True)
    superposed = [p for p in panes if p["opaqueBehind"] > 0]
    if superposed:
        failed = True
        print(f"[houses] PANES WITH OPAQUE GEOMETRY IN THE GLASS: {json.dumps(superposed)}", flush=True)
    # The export above already happened, deliberately: an inspectable failing artefact is worth
    # more than none. The non-zero exit is what stops it being treated as a passing build.
    return 4 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
