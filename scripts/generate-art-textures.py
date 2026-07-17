#!/usr/bin/env python3
"""Generate original repeatable Atomic Acres material textures.

No external source imagery is used. The fixed seed keeps builds reproducible.
"""
from __future__ import annotations

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
SIZE = 512
PBR_SIZE = 256
SEED = 860711
random.seed(SEED)

PBR_MATERIALS: dict[str, tuple[int, int, float]] = {
    "asphalt-aged.png": (226, 22, 2.2),
    "brick-warm.png": (218, 18, 2.0),
    "concrete-poured.png": (210, 16, 1.5),
    "grass-turf.png": (236, 14, 2.5),
    "roof-shingles.png": (224, 18, 2.1),
    "siding-aqua.png": (188, 16, 1.6),
    "siding-coral.png": (192, 16, 1.6),
}


def noise_layer(base: tuple[int, int, int], amount: int = 14) -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE), base)
    px = image.load()
    assert px is not None
    for y in range(SIZE):
        for x in range(SIZE):
            grain = random.randint(-amount, amount)
            px[x, y] = tuple(max(0, min(255, value + grain)) for value in base)
    return image.filter(ImageFilter.GaussianBlur(0.35))


def siding(name: str, base: tuple[int, int, int], edge: tuple[int, int, int]) -> None:
    image = noise_layer(base, 9)
    draw = ImageDraw.Draw(image)
    board = 44
    for y in range(0, SIZE, board):
        draw.rectangle((0, y, SIZE, y + 3), fill=edge)
        draw.line((0, y + board - 3, SIZE, y + board - 3), fill=tuple(min(255, c + 18) for c in base), width=2)
    for _ in range(65):
        x = random.randrange(SIZE); y = random.randrange(SIZE)
        draw.line((x, y, min(SIZE, x + random.randrange(8, 48)), y), fill=(*edge,), width=1)
    image.save(OUT / name, optimize=True)


def brick() -> None:
    image = noise_layer((150, 73, 48), 17)
    draw = ImageDraw.Draw(image)
    bw, bh, mortar = 92, 46, 5
    for row, y in enumerate(range(0, SIZE, bh)):
        offset = -(bw // 2) if row % 2 else 0
        draw.rectangle((0, y, SIZE, y + mortar), fill=(183, 171, 143))
        for x in range(offset, SIZE + bw, bw):
            draw.rectangle((x, y, x + mortar, y + bh), fill=(177, 161, 135))
            draw.line((x + mortar + 2, y + mortar + 3, x + bw - 4, y + mortar + 3), fill=(184, 99, 67), width=2)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image.save(OUT / "brick-warm.png", optimize=True)


def asphalt() -> None:
    image = noise_layer((50, 55, 58), 24)
    draw = ImageDraw.Draw(image, "RGB")
    for _ in range(1700):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        tone = random.choice([(76, 77, 74), (33, 39, 43), (98, 93, 80)])
        r = random.choice((1, 1, 1, 2))
        draw.ellipse((x-r, y-r, x+r, y+r), fill=tone)
    for _ in range(6):
        x = random.randrange(SIZE)
        points = [(x, 0)]
        for y in range(32, SIZE + 32, 32):
            x = (x + random.randint(-10, 10)) % SIZE
            points.append((x, min(y, SIZE)))
        draw.line(points, fill=(30, 31, 32), width=2)
    image.save(OUT / "asphalt-aged.png", optimize=True)


def concrete() -> None:
    image = noise_layer((173, 169, 154), 16)
    draw = ImageDraw.Draw(image)
    for _ in range(220):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        r = random.randint(1, 3)
        draw.ellipse((x-r, y-r, x+r, y+r), fill=(130, 127, 116))
    draw.line((0, 256, SIZE, 256), fill=(122, 120, 111), width=4)
    draw.line((256, 0, 256, SIZE), fill=(122, 120, 111), width=4)
    image.save(OUT / "concrete-poured.png", optimize=True)


def wood() -> None:
    image = noise_layer((108, 61, 37), 13)
    draw = ImageDraw.Draw(image)
    for x in range(0, SIZE, 64):
        draw.rectangle((x, 0, x + 4, SIZE), fill=(62, 38, 27))
        draw.line((x + 8, 0, x + 8, SIZE), fill=(145, 87, 49), width=2)
    for _ in range(95):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        draw.arc((x-18, y-7, x+18, y+7), 0, 360, fill=(72, 43, 29), width=1)
    image.save(OUT / "wood-deck.png", optimize=True)


def painted_metal() -> None:
    image = noise_layer((63, 108, 102), 8)
    draw = ImageDraw.Draw(image)
    for x in range(0, SIZE, 84):
        draw.line((x, 0, x, SIZE), fill=(35, 69, 68), width=3)
        draw.line((x+4, 0, x+4, SIZE), fill=(92, 139, 128), width=2)
    for _ in range(130):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        length = random.randint(4, 26)
        draw.line((x, y, min(SIZE, x+length), y+random.choice((-1, 0, 1))), fill=(137, 104, 68), width=1)
    image.save(OUT / "painted-metal-teal.png", optimize=True)


def weapon_finish() -> None:
    image = noise_layer((33, 39, 43), 8)
    draw = ImageDraw.Draw(image)
    for y in range(0, SIZE, 32):
        draw.line((0, y, SIZE, y), fill=(47, 55, 58), width=1)
    for _ in range(260):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        draw.line((x, y, min(SIZE, x+random.randint(3, 18)), y), fill=(72, 77, 75), width=1)
    image.save(OUT / "weapon-gunmetal.png", optimize=True)


def lawn() -> None:
    image = noise_layer((70, 98, 55), 18)
    draw = ImageDraw.Draw(image)
    for _ in range(3600):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        length = random.randint(2, 7)
        tone = random.choice(((48, 77, 43), (91, 116, 64), (59, 91, 49), (102, 113, 65)))
        draw.line((x, y, x + random.choice((-1, 0, 1)), max(0, y - length)), fill=tone, width=1)
    # Broad low-contrast mowing variation breaks uniformity without stamped
    # circles or other obvious motifs that repeat across the large lawn UVs.
    for offset in range(-SIZE, SIZE * 2, 96):
        draw.line((offset, 0, offset + SIZE, SIZE), fill=(73, 101, 57), width=9)
    image = image.filter(ImageFilter.GaussianBlur(0.18))
    image.save(OUT / "grass-turf.png", optimize=True)


def roof_shingles() -> None:
    image = noise_layer((72, 79, 80), 12)
    draw = ImageDraw.Draw(image)
    width, height = 64, 34
    for row, y in enumerate(range(0, SIZE, height)):
        offset = -(width // 2) if row % 2 else 0
        draw.line((0, y, SIZE, y), fill=(24, 34, 38), width=3)
        for x in range(offset, SIZE + width, width):
            draw.line((x, y, x, min(SIZE, y + height)), fill=(31, 42, 46), width=2)
            draw.line((x + 3, y + 4, x + width - 4, y + 4), fill=(70, 80, 80), width=1)
    image.save(OUT / "roof-shingles.png", optimize=True)


def pbr_companions() -> None:
    """Derive deterministic tangent-space normal and roughness maps from authored albedo detail."""
    for stale in (*OUT.glob("*-normal.png"), *OUT.glob("*-roughness.png")):
        stale.unlink()
    for filename, (roughness_base, roughness_variation, normal_strength) in PBR_MATERIALS.items():
        source = OUT / filename
        if not source.is_file():
            raise FileNotFoundError(f"missing authored PBR source {source}")
        height = Image.open(source).convert("L").resize((PBR_SIZE, PBR_SIZE), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.65))
        rough_source = height.filter(ImageFilter.GaussianBlur(1.6))
        src = height.load()
        rough_src = rough_source.load()
        assert src is not None
        normal = Image.new("RGB", height.size)
        normal_px = normal.load()
        roughness = Image.new("L", height.size)
        rough_px = roughness.load()
        assert normal_px is not None and rough_px is not None and rough_src is not None
        for y in range(PBR_SIZE):
            up = (y - 1) % PBR_SIZE
            down = (y + 1) % PBR_SIZE
            for x in range(PBR_SIZE):
                left = (x - 1) % PBR_SIZE
                right = (x + 1) % PBR_SIZE
                dx = (int(src[right, y]) - int(src[left, y])) / 255.0 * normal_strength
                dy = (int(src[x, down]) - int(src[x, up])) / 255.0 * normal_strength
                inv_length = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
                normal_px[x, y] = (
                    round(((-dx * inv_length) * 0.5 + 0.5) * 255),
                    round(((dy * inv_length) * 0.5 + 0.5) * 255),
                    round(inv_length * 255),
                )
                broad = round((int(rough_src[x, y]) - 128) * (roughness_variation / 128))
                rough_px[x, y] = max(24, min(248, roughness_base + broad))
        stem = source.stem
        normal.save(OUT / f"{stem}-normal.png", optimize=True)
        roughness.filter(ImageFilter.GaussianBlur(0.25)).save(OUT / f"{stem}-roughness.png", optimize=True)


def make_contact_sheet() -> None:
    paths = sorted(OUT.glob("*.png"))
    thumbs = []
    for path in paths:
        tile = Image.open(path).resize((220, 220))
        canvas = Image.new("RGB", (220, 250), (20, 24, 26))
        canvas.paste(tile, (0, 0))
        ImageDraw.Draw(canvas).text((8, 228), path.stem, fill=(240, 231, 205))
        thumbs.append(canvas)
    sheet = Image.new("RGB", (220 * 4, 250 * math.ceil(len(thumbs) / 4)), (12, 17, 19))
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % 4) * 220, (index // 4) * 250))
    sheet.save(OUT.parent / "texture-contact-sheet.jpg", quality=90)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    siding("siding-aqua.png", (71, 139, 137), (37, 82, 84))
    siding("siding-coral.png", (178, 89, 70), (111, 54, 47))
    brick(); asphalt(); concrete(); wood(); painted_metal(); weapon_finish(); lawn(); roof_shingles(); pbr_companions(); make_contact_sheet()
    print(f"generated {len(list(OUT.glob('*.png')))} textures in {OUT}")


if __name__ == "__main__":
    main()
