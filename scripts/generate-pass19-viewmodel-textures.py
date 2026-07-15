#!/usr/bin/env python3
"""Generate Atomic Acres Pass 19 viewmodel textures from licence-clean UV sources.

The OpenGameArt FPS arm source uses four disconnected UV islands: two forearms
and two hands. This script labels those islands, preserves the source's useful
micro-variation, and replaces photographic skin with authored navy fabric and
dark tactical glove colour language. Output is deterministic.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "third-party-candidates/opengameart/fps-arms"
SOURCE = ASSET_DIR / "source_diffuse.png"
ALBEDO = ASSET_DIR / "new_diff.png"
ROUGHNESS = ASSET_DIR / "atomic_arms_roughness.png"
CONTACT_SHEET = ASSET_DIR / "atomic_arms_texture_contact_sheet.jpg"


def connected_components(mask: np.ndarray) -> list[np.ndarray]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[np.ndarray] = []
    for start_y, start_x in np.argwhere(mask & ~visited):
        if visited[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        points: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            points.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((ny, nx))
        if len(points) >= 128:
            component = np.zeros_like(mask, dtype=bool)
            ys, xs = zip(*points)
            component[np.asarray(ys), np.asarray(xs)] = True
            components.append(component)
    return sorted(components, key=lambda item: int(item.sum()), reverse=True)


def deterministic_noise(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    value = (x.astype(np.uint32) * 73856093) ^ (y.astype(np.uint32) * 19349663) ^ np.uint32(0xA71C5EED)
    return ((value & np.uint32(255)).astype(np.float32) / 255.0) - 0.5


def main() -> None:
    source_image = Image.open(SOURCE).convert("RGB")
    source = np.asarray(source_image, dtype=np.float32)
    mask = source.max(axis=2) > 18
    components = connected_components(mask)
    if len(components) != 3:
        raise RuntimeError(f"Expected one connected forearm component and two hand components, found {len(components)}")

    output = np.zeros_like(source, dtype=np.float32)
    roughness = np.full(mask.shape, 255, dtype=np.uint8)
    yy, xx = np.indices(mask.shape)
    luminance = source.mean(axis=2) / 255.0

    classifications: list[tuple[int, str, float]] = []
    for index, component in enumerate(components):
        centroid_y = float(yy[component].mean())
        kind = "sleeve" if centroid_y < source.shape[0] * 0.52 else "glove"
        classifications.append((int(component.sum()), kind, centroid_y))
        noise = deterministic_noise(xx, yy)
        if kind == "sleeve":
            base = np.asarray([43.0, 80.0, 91.0])
            source_modulation = (luminance - float(luminance[component].mean())) * 38.0
            weave = (((xx + yy * 2) % 7) < 2).astype(np.float32) * 4.0 - 1.2
            value = base + source_modulation[..., None] + weave[..., None] + noise[..., None] * 3.0
            roughness[component] = np.clip(224 + noise[component] * 12, 205, 238).astype(np.uint8)
        else:
            base = np.asarray([31.0, 39.0, 42.0])
            source_modulation = (luminance - float(luminance[component].mean())) * 28.0
            grain = noise * 8.0 + np.sin(xx * 0.19 + yy * 0.13) * 2.2
            value = base + source_modulation[..., None] + grain[..., None]
            roughness[component] = np.clip(188 + noise[component] * 18, 164, 212).astype(np.uint8)
        output[component] = np.clip(value[component], 0, 255)

    Image.fromarray(output.astype(np.uint8), "RGB").save(ALBEDO, optimize=True)
    Image.fromarray(roughness, "L").save(ROUGHNESS, optimize=True)

    preview_source = source_image.resize((512, 512), Image.Resampling.LANCZOS)
    preview_albedo = Image.open(ALBEDO).resize((512, 512), Image.Resampling.LANCZOS)
    preview_roughness = Image.open(ROUGHNESS).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    sheet = Image.new("RGB", (1536, 560), "#10171a")
    sheet.paste(preview_source, (0, 48))
    sheet.paste(preview_albedo, (512, 48))
    sheet.paste(preview_roughness, (1024, 48))
    draw = ImageDraw.Draw(sheet)
    for x, label in ((16, "CC0 SOURCE DIFFUSE"), (528, "ATOMIC ALBEDO"), (1040, "ATOMIC ROUGHNESS")):
        draw.text((x, 16), label, fill="#d9e6e8")
    sheet.save(CONTACT_SHEET, quality=92, optimize=True)

    print("components", classifications)
    print(ALBEDO.relative_to(ROOT))
    print(ROUGHNESS.relative_to(ROOT))
    print(CONTACT_SHEET.relative_to(ROOT))


if __name__ == "__main__":
    main()
