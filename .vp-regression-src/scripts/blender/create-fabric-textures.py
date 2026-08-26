#!/usr/bin/env python3
"""Generate deterministic tileable upholstery fabric PBR textures for Atomic Acres."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

SIZE = 256
ROOT = Path(__file__).resolve().parents[2] / "public" / "assets" / "original" / "textures"


def weave_height(x: int, y: int) -> float:
    warp = 0.5 + 0.5 * math.cos((x % 8) / 8 * math.tau)
    weft = 0.5 + 0.5 * math.cos((y % 8) / 8 * math.tau)
    crossing = warp if (y // 4) % 2 == 0 else weft
    micro = 0.08 * math.sin((x + y) * math.tau / 16)
    return max(0.0, min(1.0, 0.28 + crossing * 0.5 + micro))


heights = [[weave_height(x, y) for x in range(SIZE)] for y in range(SIZE)]
albedo = Image.new("RGB", (SIZE, SIZE))
normal = Image.new("RGB", (SIZE, SIZE))
roughness = Image.new("L", (SIZE, SIZE))

for y in range(SIZE):
    for x in range(SIZE):
        height = heights[y][x]
        variation = int(116 + height * 48 + 5 * math.sin((x * 3 + y * 5) * math.tau / 64))
        albedo.putpixel((x, y), (variation, variation, max(0, variation - 4)))
        left = heights[y][(x - 1) % SIZE]
        right = heights[y][(x + 1) % SIZE]
        down = heights[(y - 1) % SIZE][x]
        up = heights[(y + 1) % SIZE][x]
        nx = (left - right) * 1.45
        ny = (down - up) * 1.45
        nz = 1.0
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        normal.putpixel((x, y), (
            int((nx / length * 0.5 + 0.5) * 255),
            int((ny / length * 0.5 + 0.5) * 255),
            int((nz / length * 0.5 + 0.5) * 255),
        ))
        roughness.putpixel((x, y), int(205 + (1 - height) * 34))

ROOT.mkdir(parents=True, exist_ok=True)
albedo.save(ROOT / "fabric-weave.png", optimize=True)
normal.save(ROOT / "fabric-weave-normal.png", optimize=True)
roughness.save(ROOT / "fabric-weave-roughness.png", optimize=True)
print(f"generated fabric weave PBR set in {ROOT}")
