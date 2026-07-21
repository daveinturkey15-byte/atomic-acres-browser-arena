#!/usr/bin/env python3
"""Pass 44 — high-resolution industrial PBR set for Rustworks Quality plant."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
SIZE = 1024


def save_rgb(path: Path, arr: np.ndarray) -> None:
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(path, optimize=True)


def save_l(path: Path, arr: np.ndarray) -> None:
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L").save(path, optimize=True)


def fbm(rng: np.random.Generator, size: int, octaves: int = 5) -> np.ndarray:
    total = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        step = max(1, size // (8 * (2**o)))
        grid = rng.normal(0, 1, (size // step + 2, size // step + 2)).astype(np.float32)
        img = Image.fromarray(((grid - grid.min()) / max(1e-6, grid.max() - grid.min()) * 255).astype(np.uint8), "L")
        img = img.resize((size, size), Image.Resampling.BICUBIC)
        layer = np.asarray(img, dtype=np.float32) / 255.0
        total += layer * amp
        norm += amp
        amp *= 0.55
    return total / norm


def normals_from_height(height: np.ndarray, strength: float = 2.8) -> np.ndarray:
    gy, gx = np.gradient(height.astype(np.float32))
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    n = np.stack((nx / length, ny / length, nz / length), axis=-1)
    return np.clip((n * 0.5 + 0.5) * 255.0, 0, 255)


def roughness_map(height: np.ndarray, base: float, variance: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = fbm(rng, height.shape[0], 4)
    rough = base + (0.5 - height) * variance + (n - 0.5) * 40
    return np.clip(rough, 24, 250)


def write_set(stem: str, albedo: np.ndarray, height: np.ndarray, *, strength: float, rough_base: float, rough_var: float, seed: int) -> None:
    # Mild contrast polish so metals read under arena lighting.
    img = Image.fromarray(np.clip(albedo, 0, 255).astype(np.uint8), "RGB")
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Color(img).enhance(1.05)
    img.save(ROOT / f"{stem}.png", optimize=True)
    save_rgb(ROOT / f"{stem}-normal.png", normals_from_height(height, strength))
    save_l(ROOT / f"{stem}-roughness.png", roughness_map(height, rough_base, rough_var, seed))
    print(f"wrote {stem}")


def rust_steel() -> None:
    rng = np.random.default_rng(4401)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    base = np.dstack([
        np.full((SIZE, SIZE), 98.0),
        np.full((SIZE, SIZE), 52.0),
        np.full((SIZE, SIZE), 36.0),
    ])
    streaks = (np.sin(xx * 0.07 + yy * 0.015) * 0.5 + 0.5) * 48
    grain = fbm(rng, SIZE, 6)
    blotch = (grain - 0.5) * 55
    rust = base + np.dstack([streaks + blotch, streaks * 0.4 + blotch * 0.45, blotch * 0.22])
    # Vertical runoff streaks
    for _ in range(40):
        x = rng.integers(0, SIZE)
        w = rng.integers(2, 7)
        intensity = rng.uniform(18, 42)
        rust[:, x : x + w, 0] = np.clip(rust[:, x : x + w, 0] + intensity, 0, 255)
        rust[:, x : x + w, 1] = np.clip(rust[:, x : x + w, 1] + intensity * 0.35, 0, 255)
    pits = rng.random((SIZE, SIZE)) < 0.025
    rust[pits] *= 0.42
    height = np.clip(0.42 + streaks / 140 + blotch / 100 + grain * 0.15, 0.05, 0.95)
    write_set("rustworks-steel-rust", rust, height, strength=3.0, rough_base=172, rough_var=48, seed=4401)


def plate_steel() -> None:
    rng = np.random.default_rng(4402)
    base = np.dstack([
        np.full((SIZE, SIZE), 78.0),
        np.full((SIZE, SIZE), 84.0),
        np.full((SIZE, SIZE), 90.0),
    ])
    # Weld seams / plate panels
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    for i in range(0, SIZE, 128):
        draw.line([(i, 0), (i, SIZE)], fill=(110, 118, 124), width=3)
        draw.line([(0, i), (SIZE, i)], fill=(104, 112, 118), width=3)
    for _ in range(120):
        x, y = rng.integers(8, SIZE - 8, 2)
        draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(130, 136, 140))
    arr = np.asarray(img, dtype=np.float32)
    arr += (fbm(rng, SIZE, 4)[..., None] - 0.5) * 28
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-plate-steel", arr, height, strength=2.4, rough_base=128, rough_var=34, seed=4402)


def grate_metal() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (48, 54, 58))
    draw = ImageDraw.Draw(img)
    step = 28
    bar = 5
    for i in range(0, SIZE + step, step):
        draw.rectangle([i, 0, i + bar, SIZE], fill=(92, 100, 106))
        draw.rectangle([0, i, SIZE, i + bar], fill=(84, 92, 98))
    for i in range(0, SIZE, step):
        for j in range(0, SIZE, step):
            draw.rectangle([i + bar + 2, j + bar + 2, i + step - 2, j + step - 2], fill=(28, 32, 36))
    # Diamond plate corners
    arr = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(4403)
    arr += rng.normal(0, 5, arr.shape)
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-grate-metal", arr, height, strength=3.4, rough_base=118, rough_var=40, seed=4403)


def diamond_plate() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (70, 74, 78))
    draw = ImageDraw.Draw(img)
    spacing = 48
    for y in range(-spacing, SIZE + spacing, spacing):
        for x in range(-spacing, SIZE + spacing, spacing):
            ox = x + (spacing // 2 if (y // spacing) % 2 else 0)
            # Raised diamond lozenge
            pts = [(ox, y - 10), (ox + 14, y), (ox, y + 10), (ox - 14, y)]
            draw.polygon(pts, fill=(118, 124, 130))
            draw.line(pts + [pts[0]], fill=(150, 156, 162), width=1)
    arr = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(4404)
    arr += (fbm(rng, SIZE, 3)[..., None] - 0.5) * 18
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-diamond-plate", arr, height, strength=3.2, rough_base=132, rough_var=30, seed=4404)


def industrial_concrete() -> None:
    rng = np.random.default_rng(4405)
    base = np.dstack([
        np.full((SIZE, SIZE), 126.0),
        np.full((SIZE, SIZE), 120.0),
        np.full((SIZE, SIZE), 108.0),
    ])
    grain = fbm(rng, SIZE, 6)
    arr = base + (grain[..., None] - 0.5) * 36
    # Expansion joints
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    for i in range(0, SIZE, 256):
        draw.line([(i, 0), (i, SIZE)], fill=(88, 84, 76), width=4)
        draw.line([(0, i), (SIZE, i)], fill=(88, 84, 76), width=4)
    # Oil stains
    for _ in range(18):
        x, y = rng.integers(0, SIZE, 2)
        r = rng.integers(40, 120)
        stain = Image.new("L", (SIZE, SIZE), 0)
        sd = ImageDraw.Draw(stain)
        sd.ellipse([x - r, y - r, x + r, y + r], fill=90)
        stain = stain.filter(ImageFilter.GaussianBlur(radius=18))
        s = np.asarray(stain, dtype=np.float32) / 255.0
        arr = np.asarray(img, dtype=np.float32)
        arr[..., 0] *= 1 - s * 0.35
        arr[..., 1] *= 1 - s * 0.32
        arr[..., 2] *= 1 - s * 0.28
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    arr = np.asarray(img, dtype=np.float32)
    height = np.clip(0.5 + (grain - 0.5) * 0.35, 0.05, 0.95)
    write_set("rustworks-concrete", arr, height, strength=1.8, rough_base=214, rough_var=28, seed=4405)


def hazard_stripe() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (24, 20, 14))
    draw = ImageDraw.Draw(img)
    band = 56
    for offset in range(-SIZE, SIZE * 2, band):
        pts = [(offset, 0), (offset + band // 2, 0), (offset + band // 2 - SIZE, SIZE), (offset - SIZE, SIZE)]
        draw.polygon(pts, fill=(228, 168, 42))
    arr = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(4406)
    wear = fbm(rng, SIZE, 4)
    arr[wear < 0.35] *= 0.55
    arr += rng.normal(0, 4, arr.shape)
    # Scuff marks
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-hazard", arr, height, strength=1.5, rough_base=148, rough_var=32, seed=4406)


def oxide_dark() -> None:
    rng = np.random.default_rng(4407)
    base = np.dstack([
        np.full((SIZE, SIZE), 46.0),
        np.full((SIZE, SIZE), 32.0),
        np.full((SIZE, SIZE), 30.0),
    ])
    g = fbm(rng, SIZE, 5)
    arr = base + np.dstack([(g - 0.5) * 30, (g - 0.5) * 18, (g - 0.5) * 14])
    write_set("rustworks-oxide", arr, g, strength=2.0, rough_base=190, rough_var=36, seed=4407)


def tank_paint() -> None:
    rng = np.random.default_rng(4408)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    base = np.dstack([
        np.full((SIZE, SIZE), 64.0),
        np.full((SIZE, SIZE), 102.0),
        np.full((SIZE, SIZE), 112.0),
    ])
    rings = (np.sin(yy * 0.09) * 0.5 + 0.5) * 22
    g = fbm(rng, SIZE, 4)
    arr = base + rings[..., None] + (g[..., None] - 0.5) * 20
    # Peeling paint patches
    peel = g > 0.72
    arr[peel] = np.array([88, 52, 36], dtype=np.float32)
    write_set("rustworks-tank-paint", arr, np.clip(0.5 + rings / 50 + g * 0.2, 0.1, 0.9), strength=1.7, rough_base=136, rough_var=30, seed=4408)


def asphalt_industrial() -> None:
    rng = np.random.default_rng(4409)
    base = np.dstack([
        np.full((SIZE, SIZE), 42.0),
        np.full((SIZE, SIZE), 44.0),
        np.full((SIZE, SIZE), 48.0),
    ])
    g = fbm(rng, SIZE, 6)
    arr = base + (g[..., None] - 0.5) * 22
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    # Faded lane marks
    draw.line([(SIZE // 2, 0), (SIZE // 2, SIZE)], fill=(160, 150, 90), width=8)
    for y in range(40, SIZE, 90):
        draw.line([(SIZE // 2 - 4, y), (SIZE // 2 - 4, y + 40)], fill=(180, 170, 100), width=10)
    arr = np.asarray(img, dtype=np.float32)
    write_set("rustworks-asphalt", arr, g, strength=1.6, rough_base=220, rough_var=24, seed=4409)


def warning_signage() -> None:
    img = Image.new("RGB", (SIZE, SIZE), (28, 28, 30))
    draw = ImageDraw.Draw(img)
    draw.rectangle([80, 80, SIZE - 80, SIZE - 80], outline=(220, 170, 40), width=18)
    draw.rectangle([120, 120, SIZE - 120, SIZE - 120], fill=(200, 48, 36))
    # Simple exclamation block
    draw.rectangle([SIZE // 2 - 40, 200, SIZE // 2 + 40, 620], fill=(240, 230, 210))
    draw.ellipse([SIZE // 2 - 40, 680, SIZE // 2 + 40, 760], fill=(240, 230, 210))
    arr = np.asarray(img, dtype=np.float32)
    height = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    write_set("rustworks-signage", arr, height, strength=1.2, rough_base=160, rough_var=20, seed=4410)


def corrugated() -> None:
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    wave = (np.sin(xx * 0.12) * 0.5 + 0.5)
    base = np.dstack([
        70 + wave * 40,
        74 + wave * 36,
        78 + wave * 32,
    ])
    rng = np.random.default_rng(4411)
    base += (fbm(rng, SIZE, 3)[..., None] - 0.5) * 16
    write_set("rustworks-corrugated", base, wave * 0.5 + 0.25, strength=2.6, rough_base=145, rough_var=28, seed=4411)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    rust_steel()
    plate_steel()
    grate_metal()
    diamond_plate()
    industrial_concrete()
    hazard_stripe()
    oxide_dark()
    tank_paint()
    asphalt_industrial()
    warning_signage()
    corrugated()
    print("Pass 44 industrial PBR complete")
