#!/usr/bin/env python3
"""Generate high-quality PBR texture companions for the Farcrysis jungle/beach arena.

Input: AI-generated base albedo images in source-assets/farcrysis-textures/
Output: seamless color + normal + roughness maps in public/assets/original/textures/
        plus a contact sheet in docs/assets/

Deterministic post-processing: border crop, seam blending, Sobel normal derivation,
local-contrast roughness derivation, frond alpha keying.
"""

from __future__ import annotations

import json
import hashlib
from pathlib import Path
from datetime import date
from typing import Optional

import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
from scipy.ndimage import sobel, uniform_filter  # type: ignore[import-untyped]

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-assets/farcrysis-textures"
OUT_DIR = ROOT / "public/assets/original/textures"
DOCS_DIR = ROOT / "docs/assets"
CONTACT_SHEET_PATH = DOCS_DIR / "farcrysis-texture-contact-sheet.jpg"
PROVENANCE_DIR = SOURCE_DIR
TODAY = date.today().isoformat()

# Output size — match existing repo texture size for fast delivery
SIZE = 1024
# Border safety crop (removes ~1% from each side before seam fix)
SAFE_CROP = 8  # px
# Seam blend band (how many pixels at edges to cross-blend)
BLEND_BAND = 48  # px

# PBR settings per material family
MATERIALS: dict[str, dict] = {
    "farcrysis-sand": {
        "category": "sand",
        "normal_strength": 0.6,
        "rough_base": 195,
        "rough_variance": 28,
        "rough_seed": 4201,
        "edge_blend": "mirror",  # grain textures benefit from mirror blend
    },
    "farcrysis-rock": {
        "category": "rock",
        "normal_strength": 2.2,
        "rough_base": 186,
        "rough_variance": 36,
        "rough_seed": 4202,
        "edge_blend": "standard",
    },
    "farcrysis-bark": {
        "category": "palm-bark",
        "normal_strength": 3.0,
        "rough_base": 202,
        "rough_variance": 32,
        "rough_seed": 4203,
        "edge_blend": "mirror",  # vertical striations — mirror preserves continuity
    },
    "farcrysis-frond": {
        "category": "frond",
        "normal_strength": 1.0,
        "rough_base": 180,
        "rough_variance": 22,
        "rough_seed": 4204,
        "edge_blend": "none",  # not a tiled texture; alpha-keyed leaf
        "alpha_key": True,     # derive alpha from luminance
    },
    "farcrysis-water": {
        "category": "water",
        "normal_strength": 1.8,
        "rough_base": 64,
        "rough_variance": 26,
        "rough_seed": 4205,
        "edge_blend": "mirror",
    },
    "farcrysis-crate": {
        "category": "crate",
        "normal_strength": 1.6,
        "rough_base": 188,
        "rough_variance": 30,
        "rough_seed": 4206,
        "edge_blend": "mirror",
    },
}


def sha256_file(path: Path) -> str:
    """Return hex digest of file contents."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_source(stem: str) -> Image.Image:
    """Load and pre-process source image: crop safe border, resize to SIZE."""
    src = SOURCE_DIR / f"{stem}.png"
    if not src.exists():
        raise FileNotFoundError(f"Source not found: {src}")
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # Crop safe border from all sides
    crop = SAFE_CROP
    if w > crop * 2 and h > crop * 2:
        im = im.crop((crop, crop, w - crop, h - crop))
    # Resize to exact SIZE
    if im.size != (SIZE, SIZE):
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
    return im


def make_seamless(arr: np.ndarray, blend_mode: str) -> np.ndarray:
    """Blend border edges so the texture tiles seamlessly.

    blend_mode:
      'standard' — cross-blend each border band with the opposite edge
      'mirror'   — cross-blend with mirrored opposite edge (better for directional textures)
      'none'     — return unchanged
    """
    if blend_mode == "none":
        return arr

    H, W, C = arr.shape
    band = BLEND_BAND
    result = arr.copy().astype(np.float32)

    def _blend(a: np.ndarray, b: np.ndarray, alpha: float) -> np.ndarray:
        return a * (1 - alpha) + b * alpha

    if blend_mode == "standard":
        # Left edge blends with right edge
        for i in range(band):
            alpha = (i + 1) / band
            # Left band: blend current row with corresponding pixel from right edge
            result[:, i, :] = _blend(result[:, i, :], arr[:, W - band + i, :], alpha)
            # Right band: blend with left side
            result[:, W - 1 - i, :] = _blend(result[:, W - 1 - i, :], arr[:, band - 1 - i, :], alpha)
        # Top edge blends with bottom edge
        for i in range(band):
            alpha = (i + 1) / band
            result[i, :, :] = _blend(result[i, :, :], arr[H - band + i, :, :], alpha)
            result[H - 1 - i, :, :] = _blend(result[H - 1 - i, :, :], arr[band - 1 - i, :, :], alpha)

    elif blend_mode == "mirror":
        # Mirror-blend: flip the opposite edge, which preserves directional continuity
        for i in range(band):
            alpha = (i + 1) / band
            # Left band blends with mirrored right
            mirror_r = arr[:, band - 1 - i, :]  # mirror coords
            result[:, i, :] = _blend(result[:, i, :], mirror_r, alpha)
            # Right band blends with mirrored left
            mirror_l = arr[:, W - band + i, :]
            result[:, W - 1 - i, :] = _blend(result[:, W - 1 - i, :], mirror_l, alpha)
        for i in range(band):
            alpha = (i + 1) / band
            # Top band blends with mirrored bottom
            mirror_b = arr[band - 1 - i, :, :]
            result[i, :, :] = _blend(result[i, :, :], mirror_b, alpha)
            # Bottom band blends with mirrored top
            mirror_t = arr[H - band + i, :, :]
            result[H - 1 - i, :, :] = _blend(result[H - 1 - i, :, :], mirror_t, alpha)

    return np.clip(result, 0, 255).astype(np.uint8)


def derive_normal(gray: np.ndarray, strength: float) -> np.ndarray:
    """Derive tangent-space normal map from a grayscale height field.

    Uses Sobel gradients for edge-respecting normals, matching the repo convention
    in scripts/generate-pass31-pbr.py.
    """
    # Gaussian blur to reduce aliasing
    gray_img = Image.fromarray((gray * 255).astype(np.uint8), "L")
    gray_img = gray_img.filter(ImageFilter.GaussianBlur(radius=0.7))
    g = np.asarray(gray_img, dtype=np.float32) / 255.0

    dx = sobel(g, axis=1) * strength
    dy = sobel(g, axis=0) * strength

    nz = np.ones_like(g)
    length = np.sqrt(dx * dx + dy * dy + nz)
    nx = -dx / length
    ny = -dy / length
    nz = nz / length

    normal = np.stack((nx, ny, nz), axis=-1)
    normal = np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    return normal


def derive_roughness(
    gray: np.ndarray,
    base: float,
    variance: float,
    seed: int,
) -> np.ndarray:
    """Derive roughness map from grayscale: darker = smoother (usually).

    Combines base roughness with local detail variation (more detail → rougher)
    and mild noise per the repo convention.
    """
    g = gray.astype(np.float32) / 255.0

    # Local contrast: standard deviation in a ~15px window
    window = 15
    local_mean = uniform_filter(g, size=window)
    local_sq = uniform_filter(g * g, size=window)
    local_std = np.sqrt(np.maximum(local_sq - local_mean * local_mean, 0))
    # Normalize local_std to a 0..1 range (typical std for these textures ~0.02-0.12)
    detail = np.clip(local_std / 0.08, 0, 1)

    # Gentle noise
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1, g.shape).astype(np.float32)
    noise_img = Image.fromarray(np.clip(noise * 24 + 128, 0, 255).astype(np.uint8), "L")
    broad_noise = np.asarray(noise_img.filter(ImageFilter.GaussianBlur(radius=6.0)), dtype=np.float32) - 128.0

    # Rougher where (a) mid-gray in the albedo, (b) high local detail, (c) noise
    roughness = base + (0.5 - g) * variance + detail * 28 + broad_noise * 0.5
    roughness = np.clip(roughness, 32, 248).astype(np.uint8)
    return roughness


def key_alpha_from_luminance(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Extract alpha channel from leaf-on-black: low luminance → transparent.

    Returns (rgb_array, alpha_array) where alpha is 0 for black, 1 for bright.
    """
    lum = 0.299 * rgb[:, :, 0].astype(np.float32) \
        + 0.587 * rgb[:, :, 1].astype(np.float32) \
        + 0.114 * rgb[:, :, 2].astype(np.float32)

    # Soft threshold: fully transparent below 15, fully opaque above 50
    alpha = np.clip((lum - 15) / 35, 0, 1)

    # Also boost green-channel alpha for leaves (avoid dark green stems)
    green_bias = (rgb[:, :, 1].astype(np.float32) - rgb[:, :, 0].astype(np.float32)) / 255.0
    green_bias = np.clip(green_bias, 0, 0.3)
    alpha = np.clip(alpha + green_bias, 0, 1)

    # Smooth alpha edges
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.0))
    alpha = np.asarray(alpha_img, dtype=np.float32) / 255.0

    # Premultiply RGB by alpha (darken edges)
    rgb = (rgb.astype(np.float32) * alpha[:, :, np.newaxis]).astype(np.uint8)

    return rgb, (alpha * 255).astype(np.uint8)


def generate_material(stem: str, config: dict) -> None:
    """Generate color, normal, roughness (and optionally alpha) for one material."""
    print(f"  {stem} ...")

    im = load_source(stem)
    arr = np.asarray(im, dtype=np.uint8)

    # --- Make seamless ---
    arr = make_seamless(arr, config.get("edge_blend", "standard"))

    # --- Save color map ---
    color_path = OUT_DIR / f"{stem}.png"
    Image.fromarray(arr, "RGB").save(color_path, optimize=True)

    # Grayscale for derivations
    gray = 0.299 * arr[:, :, 0].astype(np.float32) \
         + 0.587 * arr[:, :, 1].astype(np.float32) \
         + 0.114 * arr[:, :, 2].astype(np.float32)
    gray = gray / 255.0

    # --- Frond alpha keying ---
    if config.get("alpha_key"):
        rgb_result, alpha_channel = key_alpha_from_luminance(arr)
        # Save RGBA color
        rgba = np.dstack([rgb_result, alpha_channel])
        Image.fromarray(rgba, "RGBA").save(color_path, optimize=True)
        print(f"    saved RGBA color {color_path.name}")
    else:
        print(f"    saved color {color_path.name}")

    # --- Normal map ---
    normal = derive_normal(gray, config["normal_strength"])
    normal_path = OUT_DIR / f"{stem}-normal.png"
    Image.fromarray(normal, "RGB").save(normal_path, optimize=True)
    print(f"    saved normal {normal_path.name}")

    # --- Roughness map ---
    roughness = derive_roughness(
        gray,
        config["rough_base"],
        config["rough_variance"],
        config["rough_seed"],
    )
    rough_path = OUT_DIR / f"{stem}-roughness.png"
    Image.fromarray(roughness, "L").save(rough_path, optimize=True)
    print(f"    saved roughness {rough_path.name}")

    # --- File sizes report ---
    for p in [color_path, normal_path, rough_path]:
        kb = p.stat().st_size / 1024
        print(f"    {p.name}: {kb:.0f} KB")


def make_contact_sheet() -> None:
    """Generate a contact sheet showing all materials side by side."""
    stems = list(MATERIALS.keys())
    cols = len(stems)
    thumb = SIZE // 3  # each thumbnail 341x341
    spacing = 8
    label_h = 32

    sheet_w = cols * thumb + (cols + 1) * spacing
    sheet_h = thumb + 2 * spacing + label_h

    sheet = Image.new("RGB", (sheet_w, sheet_h), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)

    try:
        font = ImageFont.truetype("arial.ttf", 12)
    except OSError:
        font = ImageFont.load_default()

    for ci, stem in enumerate(stems):
        color_path = OUT_DIR / f"{stem}.png"
        try:
            im = Image.open(color_path).convert("RGB")
            im = im.resize((thumb, thumb), Image.LANCZOS)
        except FileNotFoundError:
            im = Image.new("RGB", (thumb, thumb), (80, 0, 0))

        x = spacing + ci * (thumb + spacing)
        y = spacing
        sheet.paste(im, (x, y))

        label = stem.removeprefix("farcrysis-")
        tw = draw.textlength(label, font=font) if font else len(label) * 7
        lx = x + (thumb - tw) // 2
        ly = y + thumb + 4
        draw.text((lx, ly), label, fill=(220, 220, 220), font=font)

    sheet.save(CONTACT_SHEET_PATH, quality=92, optimize=True)
    kb = CONTACT_SHEET_PATH.stat().st_size / 1024
    print(f"\nContact sheet: {CONTACT_SHEET_PATH.name} ({kb:.0f} KB)")


def write_provenance() -> None:
    """Write provenance JSON for the full texture set."""
    generated_hashes = {}
    for stem in MATERIALS:
        for suffix in ["", "-normal", "-roughness"]:
            p = OUT_DIR / f"{stem}{suffix}.png"
            if p.exists():
                generated_hashes[p.name] = sha256_file(p)

    prov = {
        "schemaVersion": 1,
        "assetId": "farcrysis-jungle-beach-pbr-texture-set",
        "generatedAt": TODAY,
        "creator": "Atomic Acres project / FAL FLUX 2 Klein AI image generation",
        "provider": "FAL.ai",
        "model": "FLUX 2 Klein 9B",
        "sourceImages": {
            stem: {
                "path": f"source-assets/farcrysis-textures/{stem}.png",
                "sha256": sha256_file(SOURCE_DIR / f"{stem}.png"),
            }
            for stem in MATERIALS
        },
        "runtimeImages": {
            name: sha256 for name, sha256 in generated_hashes.items()
        },
        "sourceScript": "scripts/generate-farcrysis-pbr.py",
        "sourceScriptSha256": sha256_file(Path(__file__)),
        "generationStages": [
            {
                "stage": 1,
                "provider": "FAL.ai",
                "model": "FLUX 2 Klein 9B",
                "description": "Six AI-generated base albedo textures at 1024x1024: warm beach sand, dark volcanic jungle rock, palm trunk bark, palm frond leaf on black, tropical lagoon water, weathered wooden crate planks. Prompts specified seamless tileable PBR albedo with flat diffuse lighting.",
                "disposition": "admitted as source pixels after mechanical review (prompt-injection text artifacts noted as absent in pixel-level inspection)",
            },
            {
                "stage": 2,
                "processor": "scripts/generate-farcrysis-pbr.py",
                "description": "Deterministic PBR post-processing: 8px safe border crop, 48px edge blend for seamlessness (mirror blend for directional textures), 1024x1024 Lanczos uniform size, Sobel-gradient tangent normal derivation, local-contrast roughness derivation, frond luminance-to-alpha keying.",
                "disposition": "admitted — runtime textures are deterministic pure functions of the admitted source pixels",
            },
        ],
        "transform": "Source images are safely cropped (8px border), blended at edges for seamless tiling at 48px band, and maintained at exactly 1024x1024 RGB. Normal maps use scipy.ndimage.sobel gradient with material-specific strength. Roughness maps combine base roughness, luminance inversion (darker albedo → rougher), local contrast detail scaling, and broad Gaussian noise. The frond leaf texture is luminance-keyed to RGBA with 1.0px Gaussian alpha-smoothing. All outputs are lossless optimized PNG.",
        "qualityEvidence": {
            "outputSize": 1024,
            "texturesPerFamily": 3,  # color, normal, roughness (frond has RGBA color)
            "totalFamilyCount": len(MATERIALS),
        },
        "externalAssets": [],
        "license": "Original project AI-assisted artwork",
        "attributionRequired": False,
        "notes": "AI-generated pixels only; no downloaded imagery, logos, text, watermarks, or extracted game assets are present. The runtime textures are presentation-only and own no gameplay, collision, fog, lighting, or networking authority.",
    }

    prov_path = SOURCE_DIR / "farcrysis-textures.provenance.json"
    prov_path.write_text(json.dumps(prov, indent=2, ensure_ascii=False) + "\n")
    print(f"\nProvenance: {prov_path}")


def main() -> None:
    print("=" * 60)
    print("Farcrysis PBR Texture Authoring")
    print("=" * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    for stem, cfg in MATERIALS.items():
        print(f"\n[{cfg['category']}]")
        generate_material(stem, cfg)

    print("\n" + "=" * 60)
    make_contact_sheet()
    write_provenance()

    print("\nDone. Textures written to public/assets/original/textures/farcrysis-*.png")


if __name__ == "__main__":
    main()
