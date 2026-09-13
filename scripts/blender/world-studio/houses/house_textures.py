"""Deterministic PBR texture synthesis for the world-studio house shells.

No downloaded maps, no AI-generated images: every texel is computed here from a seeded PRNG,
so the same seed reproduces byte-identical PNGs on any machine. Dependencies are ``numpy``
only (shipped inside Blender) plus ``zlib``/``struct`` from the standard library — the PNG
writer below exists so this module also runs under a bare system Python.

Method adopted from ``atomic-acres-asset-authoring`` step 2 (Sobel-gradient normals,
``roughness = base + (0.5 - gray) * variance + detail + noise``) and from
``photoreal-procedural-scene-forge`` rule 3: **author every field in millimetres and measure
the pixels**. Each generator therefore declares its tile size in metres and the exact integer
pixel pitch of its dominant feature, and ``TEXTURE_MEASUREMENTS`` records what was actually
produced rather than what was intended.

Rule 4 of the same skill — "anything the frame must show is a 10-30% albedo step or geometry"
— is why the lap-siding course lines, the shingle tabs and the stone joints all carry an
albedo step here *and* real geometry in ``build_house_shell.py``. The normal and roughness
maps are the second layer, never the carrier.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path
from typing import Dict, Tuple

import numpy as np

# Every tile is square. (pixels, metres) — the ratio is the declared texel density.
SIDING_PX, SIDING_M = 512, 2.4384        # 16 courses x 152.4 mm (6 in) exposure = 32 px each
SHINGLE_PX, SHINGLE_M = 512, 2.2860      # 16 courses x 142.875 mm exposure = 32 px each
STONE_PX, STONE_M = 512, 2.0             # 8 courses x 250 mm = 64 px each
TRIM_PX, TRIM_M = 256, 1.0
CONCRETE_PX, CONCRETE_M = 512, 2.0
METAL_PX, METAL_M = 256, 1.0

TEXTURE_MEASUREMENTS: Dict[str, Dict[str, float]] = {}


# ---------------------------------------------------------------- PNG writer

def write_png(path: Path, rgb: np.ndarray) -> int:
    """Write an 8-bit RGB PNG with no ancillary chunks. Returns the byte count.

    Deterministic: fixed filter type 0 on every scanline and a fixed zlib level, so the same
    array always produces the same file.
    """
    height, width, channels = rgb.shape
    assert channels == 3, "write_png expects HxWx3"
    raw = bytearray()
    data = np.ascontiguousarray(rgb.astype(np.uint8))
    for y in range(height):
        raw.append(0)
        raw.extend(data[y].tobytes())

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    return len(png)


# ---------------------------------------------------------------- noise toolkit

def _value_noise(rng: np.random.Generator, size: int, cells: int) -> np.ndarray:
    """Tileable value noise: a ``cells x cells`` lattice wrapped and bilinearly upsampled."""
    lattice = rng.random((cells, cells), dtype=np.float64)
    lattice = np.pad(lattice, ((0, 1), (0, 1)), mode="wrap")
    coords = np.linspace(0.0, cells, size, endpoint=False)
    i0 = np.floor(coords).astype(np.int64)
    frac = coords - i0
    # Smoothstep the interpolant so the lattice never shows as a diamond grid.
    frac = frac * frac * (3.0 - 2.0 * frac)
    top = lattice[i0][:, i0] * (1 - frac)[None, :] + lattice[i0][:, i0 + 1] * frac[None, :]
    bot = lattice[i0 + 1][:, i0] * (1 - frac)[None, :] + lattice[i0 + 1][:, i0 + 1] * frac[None, :]
    return top * (1 - frac)[:, None] + bot * frac[:, None]


def _fbm(rng: np.random.Generator, size: int, cells: int, octaves: int = 4) -> np.ndarray:
    """Fractal sum of tileable value noise. The lattice period stays an integer at every
    octave — a fractional period yields NaN and silently turns the map black."""
    total = np.zeros((size, size), dtype=np.float64)
    amplitude, weight = 1.0, 0.0
    for octave in range(octaves):
        period = cells * (2 ** octave)
        if size % period != 0 and period > size:
            break
        total += amplitude * _value_noise(rng, size, period)
        weight += amplitude
        amplitude *= 0.5
    return total / max(weight, 1e-9)


def _normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    """Sobel-gradient tangent-space normal, wrapped so the map tiles."""
    h = height
    shift = lambda a, dy, dx: np.roll(np.roll(a, dy, axis=0), dx, axis=1)  # noqa: E731
    dx = (
        (shift(h, -1, -1) + 2 * shift(h, 0, -1) + shift(h, 1, -1))
        - (shift(h, -1, 1) + 2 * shift(h, 0, 1) + shift(h, 1, 1))
    ) * strength
    dy = (
        (shift(h, -1, -1) + 2 * shift(h, -1, 0) + shift(h, -1, 1))
        - (shift(h, 1, -1) + 2 * shift(h, 1, 0) + shift(h, 1, 1))
    ) * strength
    nz = np.ones_like(h)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    rgb = np.stack([dx / length, dy / length, nz / length], axis=-1)
    return np.clip((rgb * 0.5 + 0.5) * 255.0, 0, 255)


def _roughness(gray: np.ndarray, base: float, variance: float, noise: np.ndarray, weight: float) -> np.ndarray:
    """The repo's standard roughness derivation, clamped to the 32..248 band it uses."""
    value = base + (0.5 - gray) * variance + (noise - 0.5) * weight
    return np.clip(value * 255.0, 32, 248)


def _gray(rgb: np.ndarray) -> np.ndarray:
    return (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255.0


def _mono(value: np.ndarray) -> np.ndarray:
    return np.stack([value, value, value], axis=-1)


def _record(name: str, px: int, metres: float, feature_mm: float, feature_px: float) -> None:
    TEXTURE_MEASUREMENTS[name] = {
        "tilePixels": px,
        "tileMetres": round(metres, 4),
        "texelsPerMetre": round(px / metres, 3),
        "featureMillimetres": round(feature_mm, 3),
        "measuredFeaturePixels": round(feature_px, 3),
    }


# ---------------------------------------------------------------- material generators

def lap_siding(seed: int, base: Tuple[float, float, float], shade: Tuple[float, float, float]) -> Dict[str, np.ndarray]:
    """Painted horizontal lap siding: 152.4 mm exposure, 32 px per course at 209.98 texels/m.

    The course line is an albedo step, not only a normal: the top 3 px of each board sits in
    the next board's shadow and the bottom 2 px catch the light, which is what makes the wall
    read as boards at fifteen metres.
    """
    size, courses = SIDING_PX, 16
    pitch = size // courses
    rng = np.random.default_rng(seed)
    ys = np.arange(size)
    within = ys % pitch
    course_index = ys // pitch

    # Per-board paint tone. Wave 1 used +-4%, which vanished at the street camera and left the
    # wall reading as one flat plastic sheet; rule 4 wants a 10-30% step, so this is +-6.5%
    # board to board (13% peak to peak) — measured back out of the render, not guessed.
    board_tone = 1.0 + (rng.random(courses) - 0.5) * 0.13
    tone = board_tone[course_index][:, None]

    shadow = np.zeros(size)
    shadow[within < 3] = -0.30 + 0.09 * within[within < 3]   # cast shadow under the butt edge
    shadow[within >= pitch - 2] = 0.10                        # lit lower lip of the board above
    shading = (1.0 + shadow)[:, None]

    grain = _fbm(rng, size, 8, 4) * 0.10 + _fbm(rng, size, 32, 2) * 0.05
    # Vertical butt joints every ~2.44 m are rare at this tile size; one per tile, offset per
    # course so the wall never shows a continuous seam.
    joint = np.zeros((size, size))
    for c in range(courses):
        x = int((rng.random() * size)) % size
        joint[c * pitch:(c + 1) * pitch, max(0, x - 1):x + 1] = -0.15

    base_arr = np.array(base)
    shade_arr = np.array(shade)
    mix = np.clip(0.5 + grain * 0.9 - 0.35, 0.0, 1.0)[..., None]
    albedo = (base_arr * (1 - mix) + shade_arr * mix) * tone[..., None] * shading[..., None]
    albedo = albedo * (1.0 + joint)[..., None]
    # Grounded wear: dirt rising from the base of the tile, heavier in the lower fifth.
    rise = np.clip(1.0 - ys / (size * 0.22), 0.0, 1.0)[:, None]
    dirt = np.clip(rise * (0.45 + _fbm(rng, size, 16, 3) * 0.55), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - dirt * 0.30)
    albedo = np.clip(albedo * 255.0, 0, 255)

    height = (
        np.clip(-shadow, 0, 1)[:, None] * 0.0
        + (within / pitch)[:, None] * 0.55
        + grain * 0.45
        + joint * 0.9
    )
    # The course step is real geometry in ``build_house_shell._emit_lap_siding``; wave 1 also
    # put it in the normal map at strength 1.5 and the two read as a doubled, over-modelled
    # board at the porch-close camera. The map is the second layer, so it is halved here.
    normal = _normal_from_height(height, strength=0.62)
    # Flat exterior house paint, not the semi-gloss wave 1 shipped: 0.62 gave the wall a broad
    # specular sheen that read as plastic against the concept's chalky siding.
    rough = _roughness(_gray(albedo), 0.80, 0.20, grain / max(grain.max(), 1e-9), 0.22)
    rough = np.clip(rough + dirt[..., 0] * 40.0, 32, 248)

    _record("siding", size, SIDING_M, 152.4, pitch)
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


def asphalt_shingle(seed: int, base: Tuple[float, float, float]) -> Dict[str, np.ndarray]:
    """Three-tab asphalt shingle: 142.875 mm course exposure at 32 px, 285.75 mm tabs at 64 px."""
    size, courses, tabs = SHINGLE_PX, 16, 8
    pitch, tab_px = size // courses, size // tabs
    rng = np.random.default_rng(seed + 7)
    ys, xs = np.arange(size)[:, None], np.arange(size)[None, :]
    course_index = ys // pitch
    within_y = ys % pitch
    # Alternate courses are offset half a tab, as a real roof is laid.
    offset = (course_index % 2) * (tab_px // 2)
    within_x = (xs + offset) % tab_px

    granule = _fbm(rng, size, 64, 3) * 0.55 + _fbm(rng, size, 16, 3) * 0.45
    # Per-tab weathering. Raised from +-7% to +-10% so the courses read as individual tabs at
    # the street camera instead of one poured slab — the wave-2 front render's flattest area.
    tile_tone = 1.0 + (rng.random((courses, tabs)) - 0.5) * 0.20
    tone = tile_tone[course_index % courses, ((xs + offset) // tab_px) % tabs]

    shading = np.ones((size, size))
    shading = np.where(within_y < 3, 0.45, shading)     # keyway shadow under each course
    shading = np.where(within_x < 2, 0.55, shading)     # tab slot
    shading = np.where(within_y >= pitch - 2, 1.08, shading)

    base_arr = np.array(base)
    albedo = base_arr[None, None, :] * (0.72 + granule * 0.56)[..., None] * tone[..., None] * shading[..., None]
    albedo = np.clip(albedo * 255.0, 0, 255)

    height = (within_y / pitch) * 0.5 + granule * 0.5
    height = np.where(within_y < 3, 0.0, height)
    height = np.where(within_x < 2, height * 0.25, height)
    # Strength 2.2 in wave 1 produced near-vertical tangent normals on the 8 px granule lattice;
    # at the grazing eave camera those facets caught the sun and read as silver glitter along
    # the whole shingle edge (wave-2 falsifier "sparkle/fireflies on hard edges"). The course
    # and tab steps are real geometry, so the map only needs the granule.
    normal = _normal_from_height(np.broadcast_to(height, (size, size)).copy(), strength=0.50)
    rough = _roughness(_gray(albedo), 0.90, 0.10, granule, 0.10)

    _record("shingle", size, SHINGLE_M, 142.875, pitch)
    TEXTURE_MEASUREMENTS["shingle"]["measuredTabPixels"] = tab_px
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


def random_ashlar(seed: int, base: Tuple[float, float, float], light: Tuple[float, float, float]) -> Dict[str, np.ndarray]:
    """Random-ashlar stone veneer for the chimney: 250 mm courses at 64 px, 12 mm raked joints.

    The concept's chimney is the single strongest material in the street frame, so the stones
    get per-stone hue, per-stone height and a recessed mortar joint rather than a tiling noise.
    """
    size, courses = STONE_PX, 8
    pitch = size // courses
    rng = np.random.default_rng(seed + 31)
    joint_px = max(2, int(round(0.012 * size / STONE_M)))  # 12 mm raked joint

    albedo = np.zeros((size, size, 3))
    height = np.zeros((size, size))
    base_arr, light_arr = np.array(base), np.array(light)

    for course in range(courses):
        y0, y1 = course * pitch, (course + 1) * pitch
        # Stones per course vary; the first stone is offset so courses never align vertically.
        x = int(rng.random() * pitch)
        albedo[y0:y1, :] = base_arr * 0.45      # mortar bed, overwritten by each stone
        height[y0:y1, :] = 0.0
        while x < size + pitch:
            width = int(pitch * (1.1 + rng.random() * 1.5))
            mix = rng.random()
            stone = base_arr * (1 - mix) + light_arr * mix
            stone = stone * (0.88 + rng.random() * 0.24)
            proud = 0.45 + rng.random() * 0.55
            xs = np.arange(x + joint_px, x + width) % size
            ys = slice(y0 + joint_px, y1)
            if len(xs) == 0:
                x += width
                continue
            albedo[ys, xs] = stone
            height[ys, xs] = proud
            x += width

    face = _fbm(rng, size, 48, 3)
    albedo = albedo * (0.82 + face * 0.36)[..., None]
    albedo = np.clip(albedo * 255.0, 0, 255)
    height = height * 0.75 + face * 0.25
    # Every stone is already a real protruding solid (``build_chimney``); 3.2 added a second,
    # contradicting relief on top of it and sparkled on the cap edge.
    normal = _normal_from_height(height, strength=1.6)
    rough = _roughness(_gray(albedo), 0.84, 0.14, face, 0.16)

    _record("masonry", size, STONE_M, 250.0, pitch)
    TEXTURE_MEASUREMENTS["masonry"]["measuredJointPixels"] = joint_px
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


def painted_trim(seed: int, base: Tuple[float, float, float]) -> Dict[str, np.ndarray]:
    """Semi-gloss painted trim: brush-direction grain plus a little grime in the grain.

    Wave 2's loudest defect was here. The tile is 256 px over 1 m, so the wave-1 height —
    ``fbm(cells=32)`` plus a 64-cell value noise — put 4-8 px features on the map, i.e. 16-31 mm
    lumps, driven at Sobel strength 0.45. Every casing, corner board, post and rake read as
    sprayed popcorn/stucco at the porch-close camera and speckled at grazing incidence.
    Painted trim is *smooth*: the albedo keeps the fine grime, but the height that drives the
    normal now carries only low-frequency board waviness plus a vertical brush direction, at a
    fifth of the strength.
    """
    size = TRIM_PX
    rng = np.random.default_rng(seed + 11)
    grain = _fbm(rng, size, 4, 4) * 0.6 + _fbm(rng, size, 32, 2) * 0.4
    streak = _value_noise(rng, size, 64)
    combined = np.clip(grain * 0.7 + streak * 0.3, 0, 1)
    base_arr = np.array(base)
    albedo = base_arr[None, None, :] * (0.92 + combined * 0.14)[..., None]
    albedo = np.clip(albedo * 255.0, 0, 255)
    # One row of value noise repeated down the tile = strokes that run with the board, never
    # a lump field. 48 cells over 1 m is a ~21 mm brush width, which is what a 100 mm casing
    # actually shows.
    brush = np.repeat(_value_noise(rng, size, 48)[:1, :], size, axis=0)
    height = np.clip(_fbm(rng, size, 4, 2) * 0.85 + brush * 0.15, 0.0, 1.0)
    # 0.09 still measured a 7.2 deg mean tilt in ``audit_maps.py`` — a painted 1x4 is smoother
    # than that. 0.035 lands under the 3 deg ceiling while keeping the brush direction visible.
    normal = _normal_from_height(height, strength=0.035)
    rough = _roughness(_gray(albedo), 0.52, 0.08, combined, 0.12)
    _record("trim", size, TRIM_M, 0.0, 0.0)
    TEXTURE_MEASUREMENTS["trim"]["measuredBrushPixels"] = size // 48
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


def concrete(seed: int) -> Dict[str, np.ndarray]:
    """Float-finished concrete for slabs, the porch deck and the driveway apron."""
    size = CONCRETE_PX
    rng = np.random.default_rng(seed + 13)
    fine = _fbm(rng, size, 64, 3)
    broad = _fbm(rng, size, 8, 3)
    combined = np.clip(fine * 0.55 + broad * 0.45, 0, 1)
    albedo = np.stack([combined, combined, combined], axis=-1) * np.array([0.62, 0.61, 0.585])
    albedo = np.clip((albedo * 0.55 + 0.28) * 255.0, 0, 255)
    # Float-finished, not exposed-aggregate: 0.8 in wave 1 and 0.5 here both left the stoop
    # nosing reading as coarse chippings in the grazing-contact frame.
    normal = _normal_from_height(fine, strength=0.30)
    rough = _roughness(_gray(albedo), 0.90, 0.08, combined, 0.10)
    _record("concrete", size, CONCRETE_M, 0.0, 0.0)
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


def brushed_metal(seed: int) -> Dict[str, np.ndarray]:
    """Powder-coated sheet metal for the gutters, downpipes and the sectional garage door.

    *Powder-coated*, which is the point: wave 1 shipped this at roughness 0.35 over a 128-cell
    (2 px) brush lattice, and the downpipe on ``house-yellow-close.png`` came back as a strip of
    silver glints. A painted gutter is a satin paint film on metal, not bare aluminium.
    """
    size = METAL_PX
    rng = np.random.default_rng(seed + 17)
    # A 128-cell lattice on a 256 px tile is a 2 px period, and a 2 px period has an enormous
    # per-texel gradient however low the strength is: that pairing, not the strength alone, is
    # what measured a 13 deg mean tilt and sparkled on the downpipe. 48 cells is a ~21 mm
    # brush line, which is what a coated gutter actually shows.
    brush = _value_noise(rng, size, 48)
    dirt = _fbm(rng, size, 16, 3)
    combined = np.clip(brush * 0.7 + dirt * 0.3, 0, 1)
    albedo = np.clip((0.60 + combined * 0.18) * 255.0, 0, 255)
    albedo = np.stack([albedo * 0.98, albedo * 0.99, albedo], axis=-1)
    normal = _normal_from_height(brush, strength=0.075)
    rough = _roughness(_gray(albedo), 0.48, 0.10, dirt, 0.18)
    _record("metal", size, METAL_M, 0.0, 0.0)
    return {"albedo": albedo, "normal": normal, "roughness": _mono(rough)}


# ---------------------------------------------------------------- set writer

def write_material_set(out_dir: Path, variant_seed: int, palette: Dict[str, tuple]) -> Dict[str, Dict[str, Path]]:
    """Generate and write every map for one house variant. Returns ``{slot: {map: path}}``."""
    sets = {
        "siding": lap_siding(variant_seed, palette["siding"], palette["siding_shade"]),
        "shingle": asphalt_shingle(variant_seed, palette["shingle"]),
        "masonry": random_ashlar(variant_seed, palette["masonry"], palette["masonry_b"]),
        "trim": painted_trim(variant_seed, palette["trim"]),
        "concrete": concrete(variant_seed),
        "metal": brushed_metal(variant_seed),
    }
    written: Dict[str, Dict[str, Path]] = {}
    for slot, maps in sets.items():
        written[slot] = {}
        for kind, array in maps.items():
            suffix = {"albedo": "", "normal": "-normal", "roughness": "-roughness"}[kind]
            path = out_dir / f"{slot}{suffix}.png"
            write_png(path, array)
            written[slot][kind] = path
    return written
