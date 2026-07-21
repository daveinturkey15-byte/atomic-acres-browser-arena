#!/usr/bin/env python3
"""Generate original industrial PBR albedo/normal/roughness set for Rustworks."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
SIZE = 512


def save_rgb(path: Path, arr: np.ndarray) -> None:
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(path, optimize=True)


def save_l(path: Path, arr: np.ndarray) -> None:
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L").save(path, optimize=True)


def normals_from_height(height: np.ndarray, strength: float = 2.2) -> np.ndarray:
    gy, gx = np.gradient(height)
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack((nx / length, ny / length, nz / length), axis=-1)
    return np.clip((n * 0.5 + 0.5) * 255.0, 0, 255)


def roughness_from_height(height: np.ndarray, base: float, variance: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, height.shape).astype(np.float32)
    noise_img = Image.fromarray(np.clip(noise * 30 + 128, 0, 255).astype(np.uint8), "L")
    broad = np.asarray(noise_img.filter(ImageFilter.GaussianBlur(radius=4.5)), dtype=np.float32) - 128.0
    rough = base + (0.5 - height) * variance + broad * 0.65
    return np.clip(rough, 28, 250)


def write_set(stem: str, albedo: np.ndarray, height: np.ndarray, *, strength: float, rough_base: float, rough_var: float, seed: int) -> None:
    save_rgb(ROOT / f"{stem}.png", albedo)
    save_rgb(ROOT / f"{stem}-normal.png", normals_from_height(height, strength))
    save_l(ROOT / f"{stem}-roughness.png", roughness_from_height(height, rough_base, rough_var, seed))
    print(f"wrote {stem} set")


def rust_steel() -> None:
    rng = np.random.default_rng(4301)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    base = np.stack(
        [
            np.full((SIZE, SIZE), 92.0),
            np.full((SIZE, SIZE), 48.0),
            np.full((SIZE, SIZE), 34.0),
        ],
        axis=-1,
    )
    streaks = (np.sin(xx * 0.09 + yy * 0.02) * 0.5 + 0.5) * 40
    blotch = rng.normal(0, 18, (SIZE, SIZE))
    blotch = np.asarray(Image.fromarray(np.clip(blotch + 128, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(2.2)), dtype=np.float32) - 128
    rust = np.clip(base + np.stack([streaks + blotch, streaks * 0.35 + blotch * 0.5, blotch * 0.2], axis=-1), 0, 255)
    # dark pitting
    pits = rng.random((SIZE, SIZE))
    rust[pits < 0.03] *= 0.45
    height = (0.45 + streaks / 120.0 + blotch / 90.0).astype(np.float32)
    height = np.clip(height, 0.05, 0.95)
    write_set("rustworks-steel-rust", rust, height, strength=2.4, rough_base=168, rough_var=42, seed=4301)


def grate_metal() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (54, 62, 66))
    draw = ImageDraw.Draw(img)
    step = 18
    for i in range(0, SIZE + step, step):
        draw.line([(i, 0), (i, SIZE)], fill=(78, 88, 92), width=3)
        draw.line([(0, i), (SIZE, i)], fill=(70, 80, 84), width=3)
    for i in range(0, SIZE, step):
        for j in range(0, SIZE, step):
            draw.rectangle([i + 4, j + 4, i + step - 5, j + step - 5], fill=(38, 44, 48))
    arr = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(4302)
    arr += rng.normal(0, 6, arr.shape)
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-grate-metal", arr, height, strength=3.1, rough_base=122, rough_var=36, seed=4302)


def industrial_concrete() -> None:
    rng = np.random.default_rng(4303)
    base = np.stack(
        [
            np.full((SIZE, SIZE), 118.0),
            np.full((SIZE, SIZE), 114.0),
            np.full((SIZE, SIZE), 104.0),
        ],
        axis=-1,
    )
    noise = rng.normal(0, 14, (SIZE, SIZE))
    noise = np.asarray(Image.fromarray(np.clip(noise + 128, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.4)), dtype=np.float32) - 128
    cracks = np.zeros((SIZE, SIZE), dtype=np.float32)
    for _ in range(18):
        x0, y0 = rng.integers(0, SIZE, 2)
        ang = rng.uniform(0, np.pi * 2)
        for t in range(90):
            x = int(x0 + np.cos(ang) * t)
            y = int(y0 + np.sin(ang) * t * 0.7)
            if 0 <= x < SIZE and 0 <= y < SIZE:
                cracks[y, x] = -28
                if x + 1 < SIZE:
                    cracks[y, x + 1] = -18
        ang += rng.uniform(-0.3, 0.3)
    albedo = np.clip(base + noise[..., None] + cracks[..., None], 0, 255)
    height = np.clip(0.5 + noise / 90.0 + cracks / 80.0, 0.05, 0.95)
    write_set("rustworks-concrete", albedo, height, strength=1.7, rough_base=210, rough_var=26, seed=4303)


def hazard_stripe() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (28, 24, 18))
    draw = ImageDraw.Draw(img)
    band = 36
    for offset in range(-SIZE, SIZE * 2, band):
        pts = [(offset, 0), (offset + band // 2, 0), (offset + band // 2 - SIZE, SIZE), (offset - SIZE, SIZE)]
        draw.polygon(pts, fill=(214, 150, 36))
    arr = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(4304)
    arr += rng.normal(0, 5, arr.shape)
    # wear edges
    wear = rng.random((SIZE, SIZE))
    arr[wear < 0.04] *= 0.55
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-hazard", arr, height, strength=1.4, rough_base=150, rough_var=30, seed=4304)


def oxide_dark() -> None:
    rng = np.random.default_rng(4305)
    base = np.stack(
        [
            np.full((SIZE, SIZE), 42.0),
            np.full((SIZE, SIZE), 30.0),
            np.full((SIZE, SIZE), 28.0),
        ],
        axis=-1,
    )
    noise = rng.normal(0, 10, (SIZE, SIZE))
    noise = np.asarray(Image.fromarray(np.clip(noise + 128, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.8)), dtype=np.float32) - 128
    albedo = np.clip(base + np.stack([noise * 0.8, noise * 0.5, noise * 0.4], axis=-1), 0, 255)
    height = np.clip(0.4 + noise / 70.0, 0.05, 0.9)
    write_set("rustworks-oxide", albedo, height, strength=1.9, rough_base=188, rough_var=34, seed=4305)


def painted_tank() -> None:
    rng = np.random.default_rng(4306)
    base = np.stack(
        [
            np.full((SIZE, SIZE), 72.0),
            np.full((SIZE, SIZE), 96.0),
            np.full((SIZE, SIZE), 104.0),
        ],
        axis=-1,
    )
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    rings = (np.sin(yy * 0.22) * 0.5 + 0.5) * 18
    noise = rng.normal(0, 8, (SIZE, SIZE))
    albedo = np.clip(base + rings[..., None] + noise[..., None], 0, 255)
    height = np.clip(0.5 + rings / 40.0 + noise / 80.0, 0.1, 0.9)
    write_set("rustworks-tank-paint", albedo, height, strength=1.6, rough_base=140, rough_var=28, seed=4306)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    rust_steel()
    grate_metal()
    industrial_concrete()
    hazard_stripe()
    oxide_dark()
    painted_tank()
    print("Rustworks industrial PBR set complete")
