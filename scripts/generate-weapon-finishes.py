#!/usr/bin/env python3
"""Generate deterministic original PBR finishes for the seven authored weapons."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
SOURCE = ROOT / "weapon-gunmetal.png"
CONTACT_SHEET = Path(__file__).resolve().parents[1] / "docs/assets/weapon-finish-contact-sheet.jpg"

FINISHES = {
    "carbine": {"base": (55, 66, 68), "accent": (179, 139, 54), "mix": 0.32, "rough": 118, "seed": 861},
    "smg": {"base": (36, 75, 78), "accent": (65, 158, 154), "mix": 0.24, "rough": 134, "seed": 862},
    "lmg": {"base": (68, 66, 48), "accent": (151, 119, 58), "mix": 0.29, "rough": 139, "seed": 867},
    "scattergun": {"base": (57, 50, 48), "accent": (142, 75, 55), "mix": 0.3, "rough": 151, "seed": 863},
    "sniper": {"base": (68, 79, 62), "accent": (115, 151, 124), "mix": 0.25, "rough": 143, "seed": 864},
    "pistol": {"base": (47, 48, 48), "accent": (168, 142, 79), "mix": 0.18, "rough": 111, "seed": 865},
    "machine-pistol": {"base": (54, 51, 48), "accent": (206, 99, 40), "mix": 0.34, "rough": 124, "seed": 866},
}


def finish_pattern(name: str, yy: np.ndarray, xx: np.ndarray, noise: np.ndarray) -> np.ndarray:
    height, width = yy.shape
    if name == "carbine":
        return (((xx + yy) % 149) < 3) & ((xx % 211) < 126)
    if name == "smg":
        cells = ((xx // 18) + (yy // 16)) % 2 == 0
        edges = ((xx % 18) < 2) | ((yy % 16) < 2)
        return cells & edges & (((xx + yy) % 3) == 0)
    if name == "lmg":
        return ((((xx * 3 - yy) % 163) < 5) & ((yy % 127) < 86)) | ((noise > 0.992) & ((xx % 9) < 3))
    if name == "scattergun":
        return ((yy % 73) < 2) & ((xx + (yy // 73) * 31) % 190 < 92)
    if name == "sniper":
        contour = np.sin(xx * 0.035 + np.sin(yy * 0.021) * 2.6)
        return (contour > 0.965) & ((yy % 97) < 71)
    if name == "pistol":
        return (noise > 0.986) | ((((xx - yy) % 181) < 2) & ((xx % 233) < 84))
    return ((((xx * 2 + yy) % 137) < 4) & ((yy % 109) < 72))


def generate(name: str, config: dict[str, object], source: np.ndarray) -> None:
    rng = np.random.default_rng(int(config["seed"]))
    height, width, _ = source.shape
    yy, xx = np.indices((height, width))
    noise = rng.random((height, width), dtype=np.float32)
    broad = np.asarray(
        Image.fromarray(np.uint8(noise * 255), "L").filter(ImageFilter.GaussianBlur(radius=5.2)),
        dtype=np.float32,
    ) / 255.0 - 0.5
    source_luma = source.mean(axis=2) / 255.0
    source_detail = source_luma - np.asarray(
        Image.fromarray(np.uint8(source_luma * 255), "L").filter(ImageFilter.GaussianBlur(radius=2.1)),
        dtype=np.float32,
    ) / 255.0
    base = np.asarray(config["base"], dtype=np.float32)
    accent = np.asarray(config["accent"], dtype=np.float32)
    variation = broad[..., None] * 18.0 + source_detail[..., None] * 72.0
    albedo = np.clip(base + variation, 0, 255)
    pattern = finish_pattern(name, yy, xx, noise)
    accent_mix = float(config["mix"])
    albedo[pattern] = np.clip(albedo[pattern] * (1.0 - accent_mix) + accent * accent_mix, 0, 255)
    albedo_image = Image.fromarray(albedo.astype(np.uint8), "RGB")
    albedo_image.save(ROOT / f"weapon-{name}.png", optimize=True)

    height_field = np.asarray(albedo_image.convert("L").filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0
    gy, gx = np.gradient(height_field)
    strength = 1.25 if name in {"pistol", "machine-pistol"} else 1.55
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    Image.fromarray(np.uint8(np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255)), "RGB").save(
        ROOT / f"weapon-{name}-normal.png", optimize=True,
    )

    roughness = float(config["rough"]) + broad * 31.0 - source_detail * 46.0
    roughness[pattern] -= 17.0
    Image.fromarray(np.uint8(np.clip(roughness, 52, 224)), "L").save(
        ROOT / f"weapon-{name}-roughness.png", optimize=True,
    )


def main() -> None:
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float32)
    for finish_name, settings in FINISHES.items():
        generate(finish_name, settings, source)
        print(f"generated weapon-{finish_name} albedo + normal + roughness")
    tile_size = 256
    label_height = 28
    columns = 4
    rows = (len(FINISHES) + columns - 1) // columns
    sheet = Image.new("RGB", (tile_size * columns, (tile_size + label_height) * rows), "#10171a")
    draw = ImageDraw.Draw(sheet)
    for index, finish_name in enumerate(FINISHES):
        x = (index % columns) * tile_size
        y = (index // columns) * (tile_size + label_height)
        preview = Image.open(ROOT / f"weapon-{finish_name}.png").convert("RGB").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        sheet.paste(preview, (x, y))
        draw.rectangle((x, y + tile_size, x + tile_size, y + tile_size + label_height), fill="#172429")
        draw.text((x + 10, y + tile_size + 8), finish_name.upper(), fill="#e8dfca")
    CONTACT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CONTACT_SHEET, quality=92, optimize=True)
    print(CONTACT_SHEET)


if __name__ == "__main__":
    main()
