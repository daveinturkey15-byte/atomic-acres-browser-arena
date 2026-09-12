"""Frozen dimensional contract for the world-studio two-storey houses.

Every number here is transcribed from the authoritative TypeScript source at exact commit
``6e9b2cafd318ca2b2f67f9eedcf8d624fee30453``:

  * ``src/world-studio/architecture/house.ts:30-81``   levels, footprints, porch, balcony
  * ``src/world-studio/architecture/house.ts:418-460`` exterior aperture declarations
  * ``src/world-studio/architecture/house.ts:797-856`` garage wing and vehicle opening
  * ``src/world-studio/architecture/index.ts:49-68``   house roster (centre X, front sign)

This module is pure data plus pure functions. It imports nothing from ``bpy`` so it can be
diffed, unit-checked and executed outside Blender.

LOCAL FRAME (the frame every GLB is authored in, per the visual contract):

    +X  street side          -X  backyard side          +Z  garage side
    Y = 0 is ground contact; the GLB origin is the centre of the 14 x 18 m main block.

The yellow house is the same authored local frame mirrored across X at export time, so its
street side still points along local +X while its garage stays on local +Z. It is placed at
world ``[+20, 0, 0]`` with no runtime rotation; teal is placed at ``[-20, 0, 0]``.
"""

from __future__ import annotations

from typing import Dict, List, NamedTuple, Sequence, Tuple

CONTRACT_ID = "world-studio-house-v1"
SOURCE_SHA = "6e9b2cafd318ca2b2f67f9eedcf8d624fee30453"

# ---------------------------------------------------------------- levels and footprints

HALF_WIDTH = 7.0          # local X extent of the main block
HALF_DEPTH = 9.0          # local Z extent of the main block
GROUND_FLOOR_Y = 0.08
UPPER_FLOOR_Y = 3.30
UPPER_CEILING_Y = 6.30
EAVE_Y = 6.45
RIDGE_Y = 8.0
GARAGE_ROOF_Y = 3.5

WALL = 0.22
SLAB = 0.22
LINING = 0.04
INNER_X = HALF_WIDTH - WALL
INNER_Z = HALF_DEPTH - WALL

EAVE_OVERHANG = 0.5
RAKE_OVERHANG = 0.4
ROOF_THICKNESS = 0.22
ROOF_RUN = HALF_WIDTH + EAVE_OVERHANG

GARAGE_HALF_X = 4.0
GARAGE_Z0 = 9.0
GARAGE_Z1 = 19.0

PORCH_X0, PORCH_X1 = HALF_WIDTH, 8.6
PORCH_Z0, PORCH_Z1 = 0.6, 7.2
PORCH_Y = 0.16

BALCONY_X0, BALCONY_X1 = -9.4, -HALF_WIDTH
BALCONY_Z0, BALCONY_Z1 = -6.6, -0.8

CHIMNEY_X0, CHIMNEY_X1 = -1.7, 0.3
CHIMNEY_Z0, CHIMNEY_Z1 = -10.0, -HALF_DEPTH + 0.1
CHIMNEY_TOP = 9.2

STAIR_STEPS = 16
STAIR_RISE = (UPPER_FLOOR_Y - GROUND_FLOOR_Y) / STAIR_STEPS
STAIR_GOING = 0.28125
STAIR_RUN = STAIR_STEPS * STAIR_GOING
STAIR_X0, STAIR_X1 = 0.12, 1.37
STAIR_Z0 = 2.2
STAIR_HOLE = {"x0": 0.08, "x1": 1.55, "z0": 2.55, "z1": STAIR_Z0 + STAIR_RUN}

EXT_STAIR_X0, EXT_STAIR_X1 = -9.25, -8.0

# The road safety gap enforced by studio-architecture.test.ts:82-94. Teal geometry must stay
# left of world X -10.5, yellow right of +10.5; in the local frame both reduce to the same
# bound because the yellow mesh is mirrored before placement.
ROAD_CLEARANCE_LOCAL_X = 9.5  # |local X| must stay <= this, i.e. world |X| >= 10.5


class Opening(NamedTuple):
    """One declared aperture, in the wall's own (u, y) frame.

    ``u`` is local Z for the front/rear walls and local X for the side walls, exactly as
    ``house.ts`` declares them.
    """

    id: str
    u0: float
    u1: float
    y0: float
    y1: float
    kind: str           # window | door | slider | garage
    swing: int = 1      # which end an open door leaf parks against
    mullions: int = 1


class WallFrame(NamedTuple):
    key: str
    axis: str           # 'z' -> the wall plane is perpendicular to local X; 'x' -> to local Z
    at: float           # centre-plane coordinate on the perpendicular axis
    outward: float      # +1 / -1 along that perpendicular axis
    u_from: float
    u_to: float
    thickness: float


WALLS: Dict[str, WallFrame] = {
    "front": WallFrame("front", "z", HALF_WIDTH - WALL / 2, 1.0, -HALF_DEPTH, HALF_DEPTH, WALL),
    "rear": WallFrame("rear", "z", -(HALF_WIDTH - WALL / 2), -1.0, -HALF_DEPTH, HALF_DEPTH, WALL),
    "sideA": WallFrame("sideA", "x", -(HALF_DEPTH - WALL / 2), -1.0, -HALF_WIDTH, HALF_WIDTH, WALL),
    "sideB": WallFrame("sideB", "x", HALF_DEPTH - WALL / 2, 1.0, -HALF_WIDTH, HALF_WIDTH, WALL),
}

FRONT_OPENINGS: List[Opening] = [
    Opening("living-picture", -6.6, -2.6, 1.0, 2.45, "window", mullions=2),
    Opening("entry-door", 3.4, 4.5, GROUND_FLOOR_Y, 2.22, "door", swing=1),
    Opening("entry-sidelight", 4.72, 5.12, 0.6, 2.22, "window", mullions=0),
    Opening("hall-window", 6.4, 7.8, 1.0, 2.35, "window", mullions=1),
    Opening("bedroom-street-a", -6.6, -4.6, 4.1, 5.65, "window", mullions=1),
    Opening("bedroom-street-b", -3.4, -1.4, 4.1, 5.65, "window", mullions=1),
    Opening("landing-balcony-door", 3.6, 5.4, UPPER_FLOOR_Y, 5.65, "slider", mullions=1),
]

REAR_OPENINGS: List[Opening] = [
    Opening("dining-slider", -3.9, -2.1, GROUND_FLOOR_Y, 2.35, "slider", mullions=1),
    Opening("dining-window", -7.6, -6.0, 1.0, 2.35, "window", mullions=1),
    Opening("kitchen-window", 3.6, 5.6, 1.05, 2.3, "window", mullions=1),
    Opening("study-window", -7.8, -6.2, 4.15, 5.6, "window", mullions=1),
    Opening("balcony-door", -4.2, -2.4, UPPER_FLOOR_Y, 5.6, "slider", mullions=1),
    Opening("back-hall-window", 1.0, 2.4, 4.2, 5.6, "window", mullions=1),
    Opening("bedroom2-rear", 6.0, 7.6, 4.15, 5.6, "window", mullions=1),
]

SIDE_A_OPENINGS: List[Opening] = [
    Opening("living-side", 2.0, 4.6, 1.0, 2.4, "window", mullions=2),
    Opening("dining-side", -5.6, -3.6, 1.05, 2.3, "window", mullions=1),
    Opening("bedroom-side", 2.4, 4.6, 4.15, 5.6, "window", mullions=1),
    Opening("study-side", -5.4, -3.6, 4.15, 5.6, "window", mullions=1),
]

SIDE_B_OPENINGS: List[Opening] = [
    Opening("garage-link", -4.6, -3.5, GROUND_FLOOR_Y, 2.2, "door", swing=-1),
    Opening("hall-side", 3.4, 5.4, 1.0, 2.35, "window", mullions=1),
    Opening("bedroom2-roof-door", -4.0, -2.2, UPPER_FLOOR_Y, 5.55, "slider", mullions=1),
    Opening("landing-side", 2.6, 4.4, 4.2, 5.6, "window", mullions=1),
]

EXTERIOR_OPENINGS: Dict[str, List[Opening]] = {
    "front": FRONT_OPENINGS,
    "rear": REAR_OPENINGS,
    "sideA": SIDE_A_OPENINGS,
    "sideB": SIDE_B_OPENINGS,
}

# Garage wing walls. ``house.ts:832-841`` declares these in world-ish local terms: the two long
# walls run along local Z with `u` = local Z, the end wall runs along local X with `u` = local X.
GARAGE_WALLS: Dict[str, WallFrame] = {
    "garage-west": WallFrame("garage-west", "z", -(GARAGE_HALF_X - 0.1), -1.0, GARAGE_Z0, GARAGE_Z1, 0.2),
    "garage-east": WallFrame("garage-east", "z", GARAGE_HALF_X - 0.1, 1.0, GARAGE_Z0, GARAGE_Z1, 0.2),
    "garage-end": WallFrame("garage-end", "x", GARAGE_Z1 - 0.1, 1.0, -GARAGE_HALF_X, GARAGE_HALF_X, 0.2),
}

GARAGE_OPENINGS: Dict[str, List[Opening]] = {
    "garage-west": [
        Opening("garage-side-door", 12.0, 13.1, 0.06, 2.1, "door", swing=1),
        Opening("garage-side-window", 15.5, 16.8, 1.2, 2.2, "window", mullions=1),
    ],
    "garage-east": [
        Opening("garage-east-window", 14.5, 16.0, 1.2, 2.2, "window", mullions=1),
    ],
    "garage-end": [
        Opening("garage-door", -2.3, 2.3, 0.0, 2.55, "garage"),
    ],
}

# ---------------------------------------------------------------- interior partitions
#
# Wave 3. Transcribed from ``house.ts:502-700`` at the same frozen SHA — the ``partition(...)``
# calls, the skirting/cornice band, the sixteen-tread stair and the landing guard. Nothing here
# is invented: every number below appears literally in that file.
#
# ``axis`` matches ``WallFrame``: ``'z'`` means the wall plane's normal is local X and ``u`` is
# local Z; ``'x'`` means the normal is local Z and ``u`` is local X. ``house.ts`` pushes the
# ``'x'`` case through ``wx()``, which is exactly the mirror this lane bakes at export, so every
# coordinate below is already in the canonical local frame for BOTH houses.

PARTITION = 0.14           # house.ts:40
ARCHITRAVE = 0.08          # cased board width, house.ts:554-556
ARCHITRAVE_PROUD = 0.02    # ``half = PARTITION / 2 + 0.02``, house.ts:541


class PartitionFrame(NamedTuple):
    key: str
    axis: str
    at: float
    u_from: float
    u_to: float
    y0: float
    y1: float
    storey: str                    # 'ground' | 'upper'
    openings: Tuple[Opening, ...]  # kind is always 'cased' — an interior opening, never glazed


INTERIOR_PARTITIONS: Tuple[PartitionFrame, ...] = (
    # Ground: living/hall on the street side of the spine, dining/kitchen on the yard side.
    PartitionFrame("p-spine", "z", 0.0, -INNER_Z, INNER_Z, 0.02, UPPER_FLOOR_Y - SLAB, "ground", (
        Opening("living-dining", -7.4, -5.4, GROUND_FLOOR_Y, 2.40, "cased"),
        Opening("hall-kitchen", 5.0, 5.9, GROUND_FLOOR_Y, 2.15, "cased"),
    )),
    PartitionFrame("p-hall", "x", 0.0, 0.0, INNER_X, 0.02, UPPER_FLOOR_Y - SLAB, "ground", (
        Opening("living-hall", 3.6, 6.4, GROUND_FLOOR_Y, 2.50, "cased"),
    )),
    PartitionFrame("p-kitchen", "x", 2.0, -INNER_X, 0.0, 0.02, UPPER_FLOOR_Y - SLAB, "ground", (
        Opening("dining-kitchen", -5.6, -3.6, GROUND_FLOOR_Y, 2.40, "cased"),
    )),
    # Upper: landing on the street side, bath/study/bedroom 2 on the yard side.
    PartitionFrame("q-spine", "z", 0.0, -INNER_Z, INNER_Z, UPPER_FLOOR_Y, UPPER_CEILING_Y, "upper", (
        Opening("hall-bath", 1.4, 2.5, UPPER_FLOOR_Y, 5.4, "cased"),
        Opening("hall-bedroom2", 5.4, 6.5, UPPER_FLOOR_Y, 5.4, "cased"),
    )),
    PartitionFrame("q-bedroom", "x", 1.0, 0.0, INNER_X, UPPER_FLOOR_Y, UPPER_CEILING_Y, "upper", (
        Opening("landing-bedroom", 4.6, 5.7, UPPER_FLOOR_Y, 5.4, "cased"),
    )),
    PartitionFrame("q-study", "x", -1.0, -INNER_X, 0.0, UPPER_FLOOR_Y, UPPER_CEILING_Y, "upper", (
        Opening("bath-study", -6.0, -4.9, UPPER_FLOOR_Y, 5.4, "cased"),
    )),
    PartitionFrame("q-bedroom2", "x", 4.0, -INNER_X, 0.0, UPPER_FLOOR_Y, UPPER_CEILING_Y, "upper", (
        Opening("bath-bedroom2", -2.2, -1.1, UPPER_FLOOR_Y, 5.4, "cased"),
    )),
)

# house.ts:869-875. The threshold board that bridges the 0.2 m rise from the upper floor to the
# garage roof. Its local X is NOT mirror-symmetric in the TypeScript: ``garageRoofDoorX`` weights
# the open half three-to-one toward the larger *world* X, so the two houses land on different
# local offsets. Both are transcribed rather than averaged or invented.
GARAGE_ROOF_THRESHOLD_X: Dict[str, float] = {"teal": -2.65, "yellow": -3.45}
GARAGE_ROOF_THRESHOLD_Z0 = 7.6
GARAGE_ROOF_THRESHOLD_Z1 = GARAGE_Z0 - 0.2
GARAGE_ROOF_THRESHOLD_WIDTH = 1.1
GARAGE_ROOF_THRESHOLD_THICKNESS = 0.04

# ---------------------------------------------------------------- runtime probe transcription
#
# Falsifier 2 of the wave-2 handoff: "the aperture audit is self-referential — it measures this
# lane's own opaque-solid list, not the runtime probes in studio-architecture.test.ts:96-140."
# These three tables close most of that gap. They are the runtime's own probe coordinates,
# converted from the teal house's world frame (``worldX = -20 + localX``) into the local frame
# the builder works in, which is identical for both houses because the yellow mesh is a pure
# mirror. They are checked against the built solids at build time, so agreement between the two
# audits is now measured rather than assumed.
#
# What this still does NOT prove: the runtime probes run against the TypeScript collider set and
# these run against the GLB's opaque presentation solids. Both being clear at the same point is
# agreement, not identity.

# studio-architecture.test.ts:96-115 — exterior routes that must stay physically open.
RUNTIME_ROUTE_PROBES: Tuple[Tuple[str, float, float, float], ...] = (
    ("front door", 6.89, 1.2, 3.95),
    ("front door head", 6.89, 2.0, 3.95),
    ("rear slider open leaf", -6.89, 1.4, -2.6),
    ("balcony door open leaf", -6.89, 4.2, -2.9),
    ("garage roof door open leaf", -2.5, 4.2, 8.89),
    ("street balcony door open leaf", 6.89, 4.2, 4.95),
    ("garage link", -4.05, 1.2, 8.89),
    ("garage vehicle door", 0.0, 1.5, 18.9),
)

# studio-architecture.test.ts:118-140 — every ground room, every upper room, every interior door.
INTERIOR_ROOM_PROBES: Tuple[Tuple[str, float, float, float], ...] = (
    ("living room", 3.5, 1.2, -4.5),
    ("entry hall", 3.5, 1.2, 5.0),
    ("dining room", -3.5, 1.2, -4.5),
    ("kitchen", -3.5, 1.2, 5.5),
    ("living to dining opening", 0.0, 1.2, -6.4),
    ("hall to kitchen door", 0.0, 1.2, 5.45),
    ("living to hall arch", 5.0, 1.2, 0.0),
    ("dining to kitchen opening", -4.6, 1.2, 2.0),
    ("upper landing", 3.5, 4.4, 4.0),
    ("master bedroom", 4.0, 4.4, -5.0),
    ("study", -4.5, 4.4, -5.0),
    ("bedroom two", -4.0, 4.4, 6.5),
    ("landing to bedroom door", 4.8, 4.4, 1.0),
    ("landing to bath door", 0.0, 4.4, 2.0),
    ("bath to study door", -5.4, 4.4, -1.0),
)

# studio-architecture.test.ts:157 — the stairwell is a real hole, not a capped shaft.
STAIRWELL_HEAD_PROBES: Tuple[Tuple[str, float, float, float], ...] = (
    ("stairwell head height", (STAIR_X0 + STAIR_X1) / 2, UPPER_FLOOR_Y - 0.15, 3.2),
)

# The centre line the tread audit queries, from studio-architecture.test.ts:143-146.
STAIR_PROBE_X = (STAIR_X0 + STAIR_X1) / 2


def stair_tread_top(step: int) -> float:
    """Contracted top of tread ``step``, house.ts:666. Never rounded, never re-derived."""
    return GROUND_FLOOR_Y + (step + 1) * STAIR_RISE


ROUTE_LANDMARKS: Dict[str, Tuple[float, float, float]] = {
    # ``<house-id>-`` is prefixed at build time. Positions are local-frame foot points taken
    # from house.ts:699-700, :794-795 and :874-875.
    "interior-stair": ((STAIR_X0 + STAIR_X1) / 2, GROUND_FLOOR_Y, STAIR_Z0),
    "external-stair": ((EXT_STAIR_X0 + EXT_STAIR_X1) / 2, 0.0, BALCONY_Z1 + STAIR_RUN),
    "garage-roof-door": (-3.55, UPPER_FLOOR_Y, 7.6),
}


# ---------------------------------------------------------------- variants

class Variant(NamedTuple):
    name: str                       # 'teal' | 'yellow'
    house_id: str                   # 'teal-house' | 'yellow-house'
    centre_x: float
    front_sign: int
    mirror_x: bool                  # bake a local-X mirror into the mesh
    siding_rgb: Tuple[float, float, float]
    siding_shade_rgb: Tuple[float, float, float]
    trim_rgb: Tuple[float, float, float]
    masonry: str                    # 'brick' | 'stone' — matches the TS material roster
    masonry_rgb: Tuple[float, float, float]
    masonry_rgb_b: Tuple[float, float, float]
    shingle_rgb: Tuple[float, float, float]
    door_rgb: Tuple[float, float, float]
    seed: int


# ---- wave-2 palette derivation (measured, not eyeballed) ---------------------------------
#
# Wave 1 picked these by eye and both houses came back over-saturated against the concept. The
# wave-2 values below were solved from pixels. Masks over ``codex-clipboard-5e010137`` (hue,
# saturation and value bands, restricted to each house's image region) give, in sRGB:
#
#     teal siding, lit          (77, 127, 119)      white trim on the same house (226, 222, 210)
#     yellow siding, lit        (169, 134, 66)      roof plane, teal house       (137, 143, 129)
#
# The concept renders a sunlit white at ~0.96 of its own albedo, so a lit reading is very close
# to albedo, and the siding/trim linear ratio pins the level independently of exposure. The
# generators average ``0.4 * base + 0.6 * shade`` (the ``mix`` term in ``lap_siding``), so each
# pair below is solved to land the *effective* albedo on the measured target:
#
#     teal   0.4*(0.365,0.570,0.548) + 0.6*(0.273,0.470,0.451) = (0.310,0.510,0.490) -> sRGB (79,130,125)
#     yellow 0.4*(0.760,0.610,0.330) + 0.6*(0.618,0.488,0.238) = (0.675,0.537,0.275) -> sRGB (172,137,70)
#
# Wave 1 shipped sRGB (66,170,152) and (203,175,54): the green channel was ~30 counts hot on
# teal and yellow sat a whole step toward olive. Roof: see ``shingle_rgb`` below.
VARIANTS: Dict[str, Variant] = {
    # Concept reference: codex-clipboard-5e010137 (street hero) and -37cd28a5 (teal backyard).
    # Teal is mid-century mint lap siding, warm random-ashlar stone chimney, white trim.
    "teal": Variant(
        name="teal",
        house_id="teal-house",
        centre_x=-20.0,
        front_sign=1,
        mirror_x=False,
        siding_rgb=(0.365, 0.570, 0.548),
        siding_shade_rgb=(0.273, 0.470, 0.451),
        trim_rgb=(0.895, 0.882, 0.845),
        masonry="brick",
        masonry_rgb=(0.502, 0.427, 0.325),
        masonry_rgb_b=(0.639, 0.569, 0.451),
        # Concept roof plane measures sRGB (137,143,129). A first pass hedged at 85% of that
        # and ``audit_maps.py`` measured the shipped albedo at (113,117,110), 23 counts short —
        # so the hedge was dropped and the value solved back from that measurement rather than
        # the tolerance being widened to accept it. Wave 1 shipped sRGB 43, near black, which
        # is why the front render's roof showed no course relief whatsoever.
        shingle_rgb=(0.575, 0.600, 0.542),
        door_rgb=(0.400, 0.235, 0.157),
        seed=20260912,
    ),
    # Concept reference: codex-clipboard-b6a7a535 (yellow backyard) and the right-hand house in
    # the street hero: saturated yellow siding, grey stacked-stone pier, white pergola.
    "yellow": Variant(
        name="yellow",
        house_id="yellow-house",
        centre_x=20.0,
        front_sign=-1,
        mirror_x=True,
        siding_rgb=(0.760, 0.610, 0.330),
        siding_shade_rgb=(0.618, 0.488, 0.238),
        trim_rgb=(0.925, 0.918, 0.898),
        masonry="stone",
        masonry_rgb=(0.404, 0.408, 0.400),
        masonry_rgb_b=(0.545, 0.553, 0.541),
        # Same target; the small warm bias against teal's roof is kept, inside tolerance.
        shingle_rgb=(0.580, 0.590, 0.530),
        door_rgb=(0.290, 0.310, 0.345),
        seed=20260913,
    ),
}


def partition_key(variant: str) -> str:
    return f"world-studio.house.{variant}.shell"


def window_solid_id(house_id: str, wall_key: str, opening_id: str) -> str:
    """The exact TypeScript solid id for a pane, from ``house.ts:351`` via ``build.ts:290``.

    ``arena.ts:37`` then lower-cases it into ``world-studio-window:<id>``.
    """
    return f"{house_id}-{wall_key}-{opening_id}-glass"


def window_runtime_id(house_id: str, wall_key: str, opening_id: str) -> str:
    return f"world-studio-window:{window_solid_id(house_id, wall_key, opening_id).lower()}"


# ---------------------------------------------------------------- rectangle algebra

Rect = Tuple[float, float, float, float]  # (u0, u1, y0, y1)


def subtract_apertures(wall: Rect, apertures: Sequence[Rect]) -> List[Rect]:
    """Split ``wall`` into solid sub-rectangles that avoid every aperture.

    A coordinate sweep rather than a boolean modifier: the result is deterministic, never
    produces degenerate faces and reproduces the same voids the TypeScript wall splitter
    produces in ``build.ts:236-290``. Adjacent cells in the same column are merged vertically
    so the emitted box count stays low.
    """
    u0, u1, y0, y1 = wall
    clipped = []
    for a_u0, a_u1, a_y0, a_y1 in apertures:
        cu0, cu1 = max(u0, a_u0), min(u1, a_u1)
        cy0, cy1 = max(y0, a_y0), min(y1, a_y1)
        if cu1 - cu0 > 1e-6 and cy1 - cy0 > 1e-6:
            clipped.append((cu0, cu1, cy0, cy1))

    if not clipped:
        return [wall]

    us = sorted({u0, u1, *(v for a in clipped for v in (a[0], a[1]))})
    ys = sorted({y0, y1, *(v for a in clipped for v in (a[2], a[3]))})

    out: List[Rect] = []
    for i in range(len(us) - 1):
        cu0, cu1 = us[i], us[i + 1]
        if cu1 - cu0 < 1e-6:
            continue
        cum = (cu0 + cu1) / 2
        run_start = None
        for j in range(len(ys) - 1):
            cy0, cy1 = ys[j], ys[j + 1]
            if cy1 - cy0 < 1e-6:
                continue
            cym = (cy0 + cy1) / 2
            solid = not any(a[0] < cum < a[1] and a[2] < cym < a[3] for a in clipped)
            if solid and run_start is None:
                run_start = cy0
            if not solid and run_start is not None:
                out.append((cu0, cu1, run_start, cy0))
                run_start = None
        if run_start is not None:
            out.append((cu0, cu1, run_start, ys[-1]))
    return out
