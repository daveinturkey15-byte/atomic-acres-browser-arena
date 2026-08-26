#!/usr/bin/env python3
"""Generate deterministic, original non-colour PBR companions from project-authored albedo textures."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
TARGETS = {
    "plaster-warm": {"normal_strength": 1.45, "rough_base": 214, "rough_variance": 24, "seed": 3101},
    "wood-deck": {"normal_strength": 2.0, "rough_base": 198, "rough_variance": 30, "seed": 3102},
    "weapon-gunmetal": {"normal_strength": 1.65, "rough_base": 132, "rough_variance": 34, "seed": 3103},
    "painted-metal-teal": {"normal_strength": 1.25, "rough_base": 164, "rough_variance": 28, "seed": 3104},
}


def generate(stem: str, config: dict[str, float | int]) -> None:
    source = Image.open(ROOT / f"{stem}.png").convert("RGB")
    gray_image = source.convert("L").filter(ImageFilter.GaussianBlur(radius=0.7))
    gray = np.asarray(gray_image, dtype=np.float32) / 255.0
    gy, gx = np.gradient(gray)
    strength = float(config["normal_strength"])
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(gray)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal = np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(normal, "RGB").save(ROOT / f"{stem}-normal.png", optimize=True)

    rng = np.random.default_rng(int(config["seed"]))
    noise = rng.normal(0.0, 1.0, gray.shape).astype(np.float32)
    noise_image = Image.fromarray(np.clip(noise * 28 + 128, 0, 255).astype(np.uint8), "L")
    broad_noise = np.asarray(noise_image.filter(ImageFilter.GaussianBlur(radius=5.0)), dtype=np.float32) - 128.0
    base = float(config["rough_base"])
    variance = float(config["rough_variance"])
    roughness = base + (0.5 - gray) * variance + broad_noise * 0.7
    roughness = np.clip(roughness, 32, 248).astype(np.uint8)
    Image.fromarray(roughness, "L").save(ROOT / f"{stem}-roughness.png", optimize=True)


if __name__ == "__main__":
    for texture_stem, settings in TARGETS.items():
        generate(texture_stem, settings)
        print(f"generated {texture_stem} normal + roughness")
