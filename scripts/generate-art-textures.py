#!/usr/bin/env python3
"""Generate original repeatable Atomic Acres material textures.

No external source imagery is used. The fixed seed keeps builds reproducible.

2026-08-30 richness pass (owner: "much richer assets ... and textures too"):
albedo 512 -> 1024, PBR companions 256 -> 512, and the Nuke Town surface set
(asphalt, lawn, concrete, brick, shingles) rebuilt around a pyramid-noise fbm
base with material-specific detail - cracks, patches and oil stains in the
asphalt; blade clumps, soil breaks and mow bands in the turf; pour joints,
aggregate and drip stains in the concrete; per-brick tone with shaded courses;
per-tab shingle granules. Pattern constants scale with SIZE so the world-space
feature size every material was tuned at (512) is preserved exactly.
"""
from __future__ import annotations

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public/assets/original/textures"
CONTACT_SHEET = Path(__file__).resolve().parents[1] / "docs/assets/texture-contact-sheet.jpg"
SIZE = 1024
PBR_SIZE = 512
S = SIZE // 512  # feature-scale factor vs the original 512 tuning
SEED = 860711
random.seed(SEED)

PBR_MATERIALS: dict[str, tuple[int, int, float]] = {
    "asphalt-aged.png": (226, 22, 2.6),
    "brick-warm.png": (218, 18, 2.4),
    "concrete-poured.png": (210, 16, 1.8),
    "grass-turf.png": (236, 14, 2.7),
    "roof-shingles.png": (224, 18, 2.5),
    "siding-aqua.png": (188, 16, 1.6),
    "siding-coral.png": (192, 16, 1.6),
}


def fbm_layer(octaves: int = 5, seed: int = 0, contrast: float = 1.0) -> Image.Image:
    """Tileable-enough pyramid value noise in L mode, mean 128."""
    state = random.Random(SEED + seed)
    accum = Image.new("L", (SIZE, SIZE), 0)
    total = 0.0
    for octave in range(octaves):
        res = 4 << octave
        weight = 1.0 / (1 << octave)
        total += weight
        layer = Image.new("L", (res, res))
        layer.putdata([state.randint(0, 255) for _ in range(res * res)])
        layer = layer.resize((SIZE, SIZE), Image.Resampling.BICUBIC)
        accum = Image.blend(accum, layer, weight / total)
    gray = accum
    if contrast != 1.0:
        gray = ImageEnhance.Contrast(gray).enhance(contrast)
    return gray


def apply_fbm_tone(image: Image.Image, octaves: int, seed: int, amount: int) -> Image.Image:
    """Modulate an RGB image's brightness by +/- amount using fbm."""
    tone = fbm_layer(octaves, seed)
    px = image.load()
    tpx = tone.load()
    assert px is not None and tpx is not None
    for y in range(SIZE):
        for x in range(SIZE):
            delta = round((tpx[x, y] - 128) * amount / 128)
            r, g, b = px[x, y]
            px[x, y] = (
                max(0, min(255, r + delta)),
                max(0, min(255, g + delta)),
                max(0, min(255, b + delta)),
            )
    return image


def noise_layer(base: tuple[int, int, int], amount: int = 14) -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE), base)
    px = image.load()
    assert px is not None
    for y in range(SIZE):
        for x in range(SIZE):
            grain = random.randint(-amount, amount)
            px[x, y] = tuple(max(0, min(255, value + grain)) for value in base)
    return image.filter(ImageFilter.GaussianBlur(0.35))


def crack_walk(draw: ImageDraw.ImageDraw, state: random.Random, dark: tuple[int, int, int], light: tuple[int, int, int]) -> None:
    x = state.randrange(SIZE)
    y = state.randrange(SIZE)
    heading = state.uniform(0, math.tau)
    for _ in range(state.randint(140, 340)):
        heading += state.uniform(-0.5, 0.5)
        nx = x + math.cos(heading) * 3
        ny = y + math.sin(heading) * 3
        draw.line((x % SIZE, y % SIZE, nx % SIZE, ny % SIZE), fill=dark, width=2)
        draw.line(((x + 1) % SIZE, (y - 1) % SIZE, (nx + 1) % SIZE, (ny - 1) % SIZE), fill=light, width=1)
        x, y = nx, ny


def radial_stain(image: Image.Image, cx: int, cy: int, radius: int, strength: float) -> None:
    px = image.load()
    assert px is not None
    for y in range(max(0, cy - radius), min(SIZE, cy + radius)):
        for x in range(max(0, cx - radius), min(SIZE, cx + radius)):
            d = math.hypot(x - cx, y - cy) / radius
            if d >= 1:
                continue
            factor = 1 - strength * (1 - d) * (1 - d)
            r, g, b = px[x, y]
            px[x, y] = (round(r * factor), round(g * factor), round(b * factor))


def siding(name: str, base: tuple[int, int, int], edge: tuple[int, int, int]) -> None:
    image = noise_layer(base, 9)
    draw = ImageDraw.Draw(image)
    board = 44 * S
    for y in range(0, SIZE, board):
        draw.rectangle((0, y, SIZE, y + 3 * S), fill=edge)
        draw.line((0, y + board - 3 * S, SIZE, y + board - 3 * S), fill=tuple(min(255, c + 18) for c in base), width=2 * S)
    for _ in range(65 * S * S):
        x = random.randrange(SIZE); y = random.randrange(SIZE)
        draw.line((x, y, min(SIZE, x + random.randrange(8 * S, 48 * S)), y), fill=(*edge,), width=1)
    image.save(OUT / name, optimize=True)


def brick() -> None:
    state = random.Random(SEED + 101)
    image = Image.new("RGB", (SIZE, SIZE), (183, 171, 143))
    draw = ImageDraw.Draw(image)
    bw, bh, mortar = 92 * S, 46 * S, 5 * S
    for row, y in enumerate(range(0, SIZE, bh)):
        offset = -(bw // 2) if row % 2 else 0
        for x in range(offset, SIZE + bw, bw):
            # Per-brick tone: fired-clay variation with the occasional dark header.
            tone = state.randint(-14, 14)
            base = (150 + tone, 73 + tone // 2, 48 + tone // 2)
            if state.random() < 0.09:
                base = (104 + tone, 58 + tone // 2, 44 + tone // 2)
            draw.rectangle((x + mortar // 2, y + mortar, x + bw - mortar // 2, y + bh - 1), fill=base)
            # Shaded lower edge gives each course visual weight.
            draw.rectangle((x + mortar // 2, y + bh - 1 - 3 * S, x + bw - mortar // 2, y + bh - 1),
                           fill=tuple(max(0, c - 26) for c in base))
            draw.line((x + mortar // 2, y + mortar, x + bw - mortar // 2, y + mortar),
                      fill=tuple(min(255, c + 16) for c in base), width=S)
    # Kiln flash and weathering wash over everything.
    image = apply_fbm_tone(image, 5, 101, 10)
    px = image.load()
    assert px is not None
    for _ in range(2600 * S):
        x = random.randrange(SIZE); y = random.randrange(SIZE)
        r, g, b = px[x, y]
        d = random.randint(-12, 12)
        px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))
    image.save(OUT / "brick-warm.png", optimize=True)


def asphalt() -> None:
    state = random.Random(SEED + 202)
    image = noise_layer((37, 42, 44), 18)
    image = apply_fbm_tone(image, 6, 202, 13)
    draw = ImageDraw.Draw(image)
    # Fresh-patch rectangles: straight-edged, slightly darker, faint outline.
    for _ in range(4):
        x, y = state.randrange(SIZE), state.randrange(SIZE)
        w, h = state.randint(120 * S, 260 * S) // 2, state.randint(80 * S, 200 * S) // 2
        draw.rectangle((x, y, min(SIZE - 1, x + w), min(SIZE - 1, y + h)), fill=(30, 34, 36))
        draw.rectangle((x, y, min(SIZE - 1, x + w), min(SIZE - 1, y + h)), outline=(52, 57, 58), width=2)
    # Exposed-aggregate speckle.
    for _ in range(2400 * S):
        x, y = state.randrange(SIZE), state.randrange(SIZE)
        tone = state.choice(((72, 76, 76), (58, 62, 63), (88, 90, 88), (47, 52, 54)))
        r = state.choice((1, 1, 2))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=tone)
    # Cracks with an edge highlight so the normal map picks them up.
    for _ in range(11):
        crack_walk(draw, state, (16, 18, 19), (56, 61, 62))
    # Oil-drip stains.
    for _ in range(9):
        radial_stain(image, state.randrange(SIZE), state.randrange(SIZE), state.randint(28 * S, 64 * S), state.uniform(0.16, 0.3))
    image.save(OUT / "asphalt-aged.png", optimize=True)


def concrete() -> None:
    state = random.Random(SEED + 303)
    image = noise_layer((173, 169, 154), 12)
    image = apply_fbm_tone(image, 5, 303, 9)
    draw = ImageDraw.Draw(image)
    for _ in range(1400 * S):
        x, y = state.randrange(SIZE), state.randrange(SIZE)
        r = state.randint(1, 2 * S)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=state.choice(((130, 127, 116), (148, 144, 131), (118, 116, 107))))
    # Pour joints: shadowed cut with a light chamfer, two slabs per axis.
    for c in (SIZE // 2,):
        draw.line((0, c, SIZE, c), fill=(118, 116, 108), width=4 * S)
        draw.line((0, c - 3 * S, SIZE, c - 3 * S), fill=(196, 192, 176), width=S)
        draw.line((c, 0, c, SIZE), fill=(118, 116, 108), width=4 * S)
        draw.line((c - 3 * S, 0, c - 3 * S, SIZE), fill=(196, 192, 176), width=S)
    # Drip stains bleeding down from the horizontal joint.
    for _ in range(10):
        x = state.randrange(SIZE)
        run = state.randint(20 * S, 90 * S)
        for step in range(run):
            y = (SIZE // 2 + step) % SIZE
            factor = 1 - 0.12 * (1 - step / run)
            for dx in range(-S, S + 1):
                px = image.load()
                r, g, b = px[(x + dx) % SIZE, y]
                px[(x + dx) % SIZE, y] = (round(r * factor), round(g * factor), round(b * factor))
    # Hairline cracks.
    for _ in range(5):
        crack_walk(draw, state, (139, 136, 124), (188, 184, 168))
    image.save(OUT / "concrete-poured.png", optimize=True)


def wood() -> None:
    image = noise_layer((108, 61, 37), 13)
    draw = ImageDraw.Draw(image)
    for x in range(0, SIZE, 64 * S):
        draw.rectangle((x, 0, x + 4 * S, SIZE), fill=(62, 38, 27))
        draw.line((x + 8 * S, 0, x + 8 * S, SIZE), fill=(145, 87, 49), width=2 * S)
    for _ in range(95 * S * S):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        draw.arc((x - 18 * S, y - 7 * S, x + 18 * S, y + 7 * S), 0, 360, fill=(72, 43, 29), width=1)
    image.save(OUT / "wood-deck.png", optimize=True)


def painted_metal() -> None:
    image = noise_layer((63, 108, 102), 8)
    draw = ImageDraw.Draw(image)
    for x in range(0, SIZE, 84 * S):
        draw.line((x, 0, x, SIZE), fill=(35, 69, 68), width=3 * S)
        draw.line((x + 4 * S, 0, x + 4 * S, SIZE), fill=(92, 139, 128), width=2 * S)
    for _ in range(130 * S * S):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        length = random.randint(4 * S, 26 * S)
        draw.line((x, y, min(SIZE, x + length), y + random.choice((-1, 0, 1))), fill=(137, 104, 68), width=1)
    image.save(OUT / "painted-metal-teal.png", optimize=True)


def weapon_finish() -> None:
    image = noise_layer((33, 39, 43), 8)
    draw = ImageDraw.Draw(image)
    for y in range(0, SIZE, 32 * S):
        draw.line((0, y, SIZE, y), fill=(47, 55, 58), width=1)
    for _ in range(260 * S * S):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        draw.line((x, y, min(SIZE, x + random.randint(3 * S, 18 * S)), y), fill=(72, 77, 75), width=1)
    image.save(OUT / "weapon-gunmetal.png", optimize=True)


def lawn() -> None:
    state = random.Random(SEED + 404)
    image = noise_layer((70, 98, 55), 14)
    image = apply_fbm_tone(image, 5, 404, 16)
    draw = ImageDraw.Draw(image)
    # Clump mask: blades gather where the coarse noise is high, thinning
    # elsewhere so the turf stops reading as a uniform carpet.
    clump = fbm_layer(3, 405)
    clump_px = clump.load()
    assert clump_px is not None
    for _ in range(9000 * S):
        x, y = state.randrange(SIZE), state.randrange(SIZE)
        if clump_px[x, y] < 96 and state.random() < 0.65:
            continue
        length = state.randint(3 * S, 8 * S)
        lean = state.choice((-2, -1, -1, 0, 0, 1, 1, 2))
        tone = state.choice((
            (48, 77, 43), (91, 116, 64), (59, 91, 49), (102, 113, 65),
            (72, 104, 52), (126, 128, 74),
        ))
        draw.line((x, y, x + lean, max(0, y - length)), fill=tone, width=1)
    # Worn soil breaks where the clump mask bottoms out: soft radial thinning
    # toward an earthy tone, then thinner blades re-scattered on top so the
    # patch reads as worn turf rather than a stamped blob.
    for _ in range(6):
        cx, cy = state.randrange(SIZE), state.randrange(SIZE)
        if clump_px[cx, cy] > 110:
            continue
        radius = state.randint(22 * S, 44 * S)
        px = image.load()
        for y in range(max(0, cy - radius), min(SIZE, cy + radius)):
            for x in range(max(0, cx - radius), min(SIZE, cx + radius)):
                d = math.hypot(x - cx, y - cy) / radius
                if d >= 1:
                    continue
                w = (1 - d) * (1 - d) * 0.55
                r0, g0, b0 = px[x, y]
                px[x, y] = (
                    round(r0 * (1 - w) + 104 * w),
                    round(g0 * (1 - w) + 88 * w),
                    round(b0 * (1 - w) + 62 * w),
                )
        for _ in range(radius * 2):
            bx = cx + state.randint(-radius, radius)
            by = cy + state.randint(-radius, radius)
            if 0 <= bx < SIZE and 0 <= by < SIZE:
                draw.line((bx, by, bx, max(0, by - state.randint(2 * S, 5 * S))), fill=state.choice(((91, 116, 64), (72, 104, 52))), width=1)
    # Broad low-contrast mowing variation breaks uniformity without stamped
    # circles or other obvious motifs that repeat across the large lawn UVs.
    for offset in range(-SIZE, SIZE * 2, 96 * S):
        draw.line((offset, 0, offset + SIZE, SIZE), fill=(76, 102, 58), width=7 * S)
    image = image.filter(ImageFilter.GaussianBlur(0.18))
    image.save(OUT / "grass-turf.png", optimize=True)


def roof_shingles() -> None:
    state = random.Random(SEED + 505)
    image = noise_layer((72, 79, 80), 10)
    draw = ImageDraw.Draw(image)
    width, height = 64 * S, 34 * S
    for row, y in enumerate(range(0, SIZE, height)):
        offset = -(width // 2) if row % 2 else 0
        for x in range(offset, SIZE + width, width):
            tone = state.randint(-9, 9)
            base = (72 + tone, 79 + tone, 80 + tone)
            draw.rectangle((x + 2 * S, y + 3 * S, x + width - 2 * S, y + height - 1), fill=base)
            # Granule sparkle inside each tab.
            for _ in range(30 * S):
                gx = state.randint(x + 2 * S, x + width - 2 * S)
                gy = state.randint(y + 3 * S, y + height - 1)
                if 0 <= gx < SIZE and 0 <= gy < SIZE:
                    d = state.randint(-16, 20)
                    draw.point((gx, gy), fill=(72 + tone + d, 79 + tone + d, 80 + tone + d))
            draw.line((x, y, x, min(SIZE, y + height)), fill=(31, 42, 46), width=2 * S)
        # Course shadow: dark cut with a soft lower penumbra.
        draw.line((0, y, SIZE, y), fill=(24, 34, 38), width=3 * S)
        draw.line((0, y + 3 * S, SIZE, y + 3 * S), fill=(46, 55, 57), width=S)
    image.save(OUT / "roof-shingles.png", optimize=True)


def pbr_companions() -> None:
    """Derive deterministic tangent-space normal and roughness maps from authored albedo detail."""
    # Only this generator's own companions: other pipelines (farcrysis) keep
    # their normal/roughness maps in the same folder.
    for filename in PBR_MATERIALS:
        stem = Path(filename).stem
        for stale in (OUT / f"{stem}-normal.png", OUT / f"{stem}-roughness.png"):
            if stale.is_file():
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
    CONTACT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CONTACT_SHEET, quality=90)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    siding("siding-aqua.png", (71, 139, 137), (37, 82, 84))
    siding("siding-coral.png", (178, 89, 70), (111, 54, 47))
    brick(); asphalt(); concrete(); wood(); painted_metal(); weapon_finish(); lawn(); roof_shingles(); pbr_companions(); make_contact_sheet()
    print(f"generated {len(list(OUT.glob('*.png')))} textures in {OUT}")


if __name__ == "__main__":
    main()
