"""Procedural PBR texture synthesis for the world-studio mid-century interiors.

Deliberately **free of any Blender dependency** so the exact maps that
`build_interiors.py` links into the GLB can be generated, diffed and digested by a plain
CPython run with no 3D application in the loop:

    python scripts/blender/world-studio/interiors/interior_textures.py \
        --out source-assets/world-studio/interiors/textures

`build_interiors.py` imports these same functions, so a texture that ships in the GLB and a
texture on disk are the same array from the same seed - there is no second implementation to
drift.

Authoring rule taken from `photoreal-procedural-scene-forge` section 4.3: every field is
authored in millimetres against a declared tile size, and the docstring records the resulting
pixel pitch so the claim can be measured rather than asserted. Nothing here encodes light:
no daylight, no sun angle, no ambient gradient. Weather and time of day vary at runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import zlib

import numpy as np

SEED = 20260912
TEX_SIZE = 512


# --------------------------------------------------------------------------------------
# noise
# --------------------------------------------------------------------------------------


def tileable_noise(size: int, cells: int, rng: np.random.Generator) -> np.ndarray:
    """Periodic value noise. `cells` must divide `size`; a fractional period wraps wrong and
    the failure is invisible until a seam shows up in a frame, so assert it here."""
    assert size % cells == 0, f"noise period {size}/{cells} is not an integer"
    lattice = rng.random((cells, cells))
    lattice = np.pad(lattice, ((0, 1), (0, 1)), mode="wrap")
    t = np.linspace(0.0, cells, size, endpoint=False)
    i0 = np.floor(t).astype(int)
    frac = t - i0
    smooth = frac * frac * (3.0 - 2.0 * frac)
    a = lattice[np.ix_(i0, i0)]
    b = lattice[np.ix_(i0 + 1, i0)]
    c = lattice[np.ix_(i0, i0 + 1)]
    d = lattice[np.ix_(i0 + 1, i0 + 1)]
    sx = smooth[None, :]
    sy = smooth[:, None]
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def fbm(size: int, base_cells: int, octaves: int, rng: np.random.Generator) -> np.ndarray:
    total = np.zeros((size, size))
    amplitude = 1.0
    weight = 0.0
    cells = base_cells
    for _ in range(octaves):
        if size % cells != 0:
            break
        total += tileable_noise(size, cells, rng) * amplitude
        weight += amplitude
        amplitude *= 0.5
        cells *= 2
    return total / max(weight, 1e-6)


def _coords(size: int) -> tuple[np.ndarray, np.ndarray]:
    axis = np.arange(size)
    return np.meshgrid(axis, axis, indexing="ij")


# --------------------------------------------------------------------------------------
# the six maps
# --------------------------------------------------------------------------------------


def tex_sage_weave(size: int) -> tuple[np.ndarray, np.ndarray]:
    """Sofa boucle. Tile = 0.30 m, so 512 px / 300 mm = 1.706 px/mm. 200 warps across the
    tile is a 1.5 mm pitch at 2.56 px - above the 2 px floor where a weave turns to mush."""
    rng = np.random.default_rng(SEED + 11)
    yy, xx = _coords(size)
    warps = 200
    warp = np.sin(xx * (2 * math.pi * warps / size)) * 0.5 + 0.5
    weft = np.sin(yy * (2 * math.pi * warps / size)) * 0.5 + 0.5
    plain = np.where(((xx // 3) + (yy // 3)) % 2 == 0, warp, weft)
    slub = fbm(size, 8, 4, rng)
    value = 0.62 + 0.30 * (plain - 0.5) + 0.22 * (slub - 0.5)
    albedo = np.stack([value * 0.56, value * 0.70, value * 0.58], axis=-1)
    rough = np.clip(0.86 + 0.10 * (plain - 0.5) + 0.06 * (slub - 0.5), 0.0, 1.0)
    return np.clip(albedo, 0.0, 1.0), rough


def tex_walnut(size: int) -> tuple[np.ndarray, np.ndarray]:
    """American black walnut. Tile = 0.60 m, 0.853 px/mm. 150 rings across the tile is a
    4.0 mm growth-ring pitch at 3.4 px; open pores are one octave finer."""
    rng = np.random.default_rng(SEED + 23)
    yy, xx = _coords(size)
    drift = (fbm(size, 4, 4, rng) - 0.5) * 46.0
    rings = np.sin((yy + drift) * (2 * math.pi * 150 / size))
    rings = np.sign(rings) * np.abs(rings) ** 0.55
    pores = np.clip((fbm(size, 32, 3, rng) - 0.5) * 2.0, 0.0, 1.0) ** 3
    value = 0.34 + 0.16 * rings - 0.13 * pores + 0.05 * (fbm(size, 6, 3, rng) - 0.5)
    albedo = np.stack([value * 1.00, value * 0.60, value * 0.36], axis=-1)
    rough = np.clip(0.34 + 0.20 * pores + 0.05 * rings, 0.05, 1.0)
    return np.clip(albedo, 0.0, 1.0), rough


def tex_carpet(size: int) -> tuple[np.ndarray, np.ndarray]:
    """Wall-to-wall berber loop pile. Tile = 1.0 m, 0.512 px/mm; 250 tufts across the tile is
    a 4.0 mm gauge at 2.05 px, which is the smallest honest pitch at this resolution."""
    rng = np.random.default_rng(SEED + 37)
    yy, xx = _coords(size)
    gauge = 250
    tuft = np.sin(xx * (2 * math.pi * gauge / size)) * np.sin(yy * (2 * math.pi * gauge / size))
    flecks = fbm(size, 64, 2, rng)
    base = 0.52 + 0.10 * tuft + 0.13 * (flecks - 0.5)
    warm = np.clip(flecks - 0.62, 0.0, 1.0) * 2.4
    albedo = np.stack(
        [base * 0.94 + warm * 0.22, base * 0.86 + warm * 0.12, base * 0.70 + warm * 0.04], axis=-1
    )
    rough = np.clip(0.94 + 0.05 * (flecks - 0.5), 0.6, 1.0)
    return np.clip(albedo, 0.0, 1.0), rough


def tex_rug(size: int) -> tuple[np.ndarray, np.ndarray]:
    """Atomic-age area rug: five horizontal ground bands in rust / ochre sand / cream with a
    six-arm asterisk motif on a quarter-tile lattice. Tile = 2.4 m of rug, so the motif
    repeats at 0.6 m - the concept's scale, authored rather than traced."""
    rng = np.random.default_rng(SEED + 53)
    yy, xx = _coords(size)
    u = xx / size
    v = yy / size

    bands = np.zeros((size, size))
    for edge, value in ((0.00, 0.0), (0.18, 1.0), (0.34, 2.0), (0.62, 1.0), (0.80, 0.0)):
        bands = np.where(v >= edge, value, bands)
    palette = np.array([[0.78, 0.44, 0.26], [0.84, 0.70, 0.47], [0.87, 0.82, 0.70]])
    ground = palette[bands.astype(int)]

    cu = (u * 4.0) % 1.0 - 0.5
    cv = (v * 4.0) % 1.0 - 0.5
    radius = np.sqrt(cu * cu + cv * cv)
    arms = np.abs(np.sin(np.arctan2(cv, cu) * 3.0))
    motif = ((radius < 0.30) & (arms < 0.14)) | (radius < 0.035)
    albedo = np.where(motif[..., None], np.array([0.16, 0.16, 0.17])[None, None, :], ground)

    pile = (fbm(size, 128, 2, rng) - 0.5) * 0.14
    albedo = np.clip(albedo + pile[..., None], 0.0, 1.0)
    return albedo, np.clip(0.92 + pile * 0.4, 0.6, 1.0)


def tex_tile(size: int) -> tuple[np.ndarray, np.ndarray]:
    """Kitchen backsplash. Tile = 0.8 m at 8 courses is a 100 mm glazed square (the period's
    4 in field tile) at 64 px, with a 2.5% joint = 2.5 mm grout at 1.6 px, and a printed
    accent on every seventh tile."""
    rng = np.random.default_rng(SEED + 71)
    yy, xx = _coords(size)
    courses = 8
    cell = size // courses
    gx = (xx % cell) / cell
    gy = (yy % cell) / cell
    joint = 0.025
    grout = (gx < joint) | (gx > 1 - joint) | (gy < joint) | (gy > 1 - joint)

    tile_id = (xx // cell) * 31 + (yy // cell) * 17
    glaze = fbm(size, 16, 3, rng)
    field = np.stack(
        [0.88 + 0.05 * (glaze - 0.5), 0.87 + 0.05 * (glaze - 0.5), 0.80 + 0.06 * (glaze - 0.5)],
        axis=-1,
    )
    accent = np.broadcast_to(np.array([0.74, 0.55, 0.26]), (size, size, 3))
    inner = (np.abs(gx - 0.5) < 0.24) & (np.abs(gy - 0.5) < 0.24)
    field = np.where(((tile_id % 7 == 0) & inner)[..., None], accent, field)

    albedo = np.where(grout[..., None], np.array([0.72, 0.70, 0.66])[None, None, :], field)
    rough = np.where(grout, 0.82, np.clip(0.14 + 0.06 * (glaze - 0.5), 0.05, 1.0))
    return np.clip(albedo, 0.0, 1.0), rough


def tex_counter(size: int) -> tuple[np.ndarray, np.ndarray]:
    """Boomerang-speckle laminate worktop: cream ground with ~1.5% dark and ~1.2% ochre
    confetti at one pixel, which at a 1.0 m tile is a 2 mm fleck."""
    rng = np.random.default_rng(SEED + 97)
    speck = fbm(size, 128, 2, rng)
    fine = rng.random((size, size))
    base = np.broadcast_to(np.array([0.80, 0.77, 0.70]), (size, size, 3))
    dark = (fine > 0.985)[..., None] * np.array([-0.45, -0.42, -0.38])[None, None, :]
    warm = (fine < 0.012)[..., None] * np.array([0.10, -0.04, -0.22])[None, None, :]
    albedo = np.clip(base + dark + warm + (speck[..., None] - 0.5) * 0.06, 0.0, 1.0)
    return albedo, np.clip(0.28 + 0.08 * (speck - 0.5), 0.05, 1.0)


TEXTURES = {
    "sage-weave": tex_sage_weave,
    "walnut": tex_walnut,
    "carpet": tex_carpet,
    "rug": tex_rug,
    "tile": tex_tile,
    "counter": tex_counter,
}


# --------------------------------------------------------------------------------------
# PNG writing without Pillow, so the CPU path has no optional dependency
# --------------------------------------------------------------------------------------


def write_png(path: str, rgb: np.ndarray) -> str:
    """Writes an 8-bit RGB PNG with filter type 0 on every scanline. Deterministic: the same
    array always yields the same bytes, so the sha256 below is a real reproducibility pin."""
    data = np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)
    height, width, _ = data.shape
    raw = b"".join(b"\x00" + data[row].tobytes() for row in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(png)
    return path


def sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def generate_all(out_dir: str, size: int = TEX_SIZE) -> dict:
    report: dict[str, dict] = {}
    for name, fn in TEXTURES.items():
        albedo, rough = fn(size)
        rough_rgb = np.repeat(rough[..., None], 3, axis=-1)
        albedo_path = write_png(os.path.join(out_dir, f"interior-{name}-albedo.png"), albedo)
        rough_path = write_png(os.path.join(out_dir, f"interior-{name}-roughness.png"), rough_rgb)
        report[name] = {
            "size": size,
            "albedo": {
                "file": os.path.basename(albedo_path),
                "sha256": sha256_of(albedo_path),
                "bytes": os.path.getsize(albedo_path),
                # Measured, not intended: the albedo spread is what decides whether the
                # detail survives a frame at all (forge rule 4).
                "albedoSpread": round(float(albedo.max() - albedo.min()), 4),
                "albedoMean": round(float(albedo.mean()), 4),
            },
            "roughness": {
                "file": os.path.basename(rough_path),
                "sha256": sha256_of(rough_path),
                "bytes": os.path.getsize(rough_path),
                "mean": round(float(rough.mean()), 4),
                "min": round(float(rough.min()), 4),
                "max": round(float(rough.max()), 4),
            },
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", type=int, default=TEX_SIZE)
    args = parser.parse_args()
    report = generate_all(args.out, args.size)
    report_path = os.path.join(args.out, "texture-report.json")
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump({"seed": SEED, "textures": report}, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"seed": SEED, "textures": report}, indent=2))


if __name__ == "__main__":
    main()
