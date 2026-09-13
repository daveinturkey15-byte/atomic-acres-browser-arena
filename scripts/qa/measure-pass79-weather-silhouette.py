"""Pass 79 weather lane - measure enemy silhouette readability from captured frames.

Reads matched with-enemy / without-enemy frame pairs taken at an IDENTICAL
stance (same arena, same spawn, same staged enemy world position) under
different forced weather states, and reports, for each state:

  * the enemy MASK, measured once on the clear pair as the pixels that change
    when the enemy is removed, restricted to a radius around the crosshair so
    the enemy's own cast SHADOW cannot be mistaken for the enemy;
  * a background RING dilated around that mask;
  * SILHOUETTE CONTRAST = |L_enemy - L_background| / (L_enemy + L_background),
    read off the WITH-enemy frame alone - the quantity a player's eye uses to
    pick a target out of its background.

The mask is measured once and reused unchanged for every state, so every state
is judged on identical pixels.

Usage:
  python scripts/qa/measure-pass79-weather-silhouette.py \
      --dir artifacts/pass79/weather --prefix pair --states clear,storm
"""
from __future__ import annotations

import argparse
import json
import math
import os

from PIL import Image

MASK_THRESHOLD = 12.0
MASK_RADIUS_PX = 150
RING_PIXELS = 10
CROP = 460


def crop_centre(path: str) -> Image.Image:
    image = Image.open(path).convert('RGB')
    left = (image.width - CROP) // 2
    top = (image.height - CROP) // 2
    return image.crop((left, top, left + CROP, top + CROP))


def luminance(pixel) -> float:
    return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]


def build_mask(with_enemy: Image.Image, without_enemy: Image.Image):
    a = with_enemy.load()
    b = without_enemy.load()
    flags = bytearray(CROP * CROP)
    hits = 0
    sum_x = 0
    sum_y = 0
    centre = CROP / 2
    for y in range(CROP):
        for x in range(CROP):
            if math.hypot(x - centre, y - centre) > MASK_RADIUS_PX:
                continue
            pa = a[x, y]
            pb = b[x, y]
            delta = (abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2])) / 3.0
            if delta >= MASK_THRESHOLD:
                flags[y * CROP + x] = 1
                hits += 1
                sum_x += x
                sum_y += y
    offset = math.hypot(sum_x / hits - centre, sum_y / hits - centre) if hits else float('inf')
    return flags, hits, offset


def dilate(flags: bytearray, radius: int) -> bytearray:
    out = bytearray(CROP * CROP)
    for y in range(CROP):
        row = y * CROP
        for x in range(CROP):
            if not flags[row + x]:
                continue
            for dy in range(-radius, radius + 1):
                ny = y + dy
                if ny < 0 or ny >= CROP:
                    continue
                base = ny * CROP
                for dx in range(-radius, radius + 1):
                    nx = x + dx
                    if 0 <= nx < CROP:
                        out[base + nx] = 1
    return out


def build_ring(flags: bytearray):
    outer = dilate(flags, RING_PIXELS)
    inner = dilate(flags, 2)
    out = bytearray(CROP * CROP)
    hits = 0
    for index in range(CROP * CROP):
        if outer[index] and not inner[index]:
            out[index] = 1
            hits += 1
    return out, hits


def mean_luminance(image: Image.Image, flags: bytearray) -> float:
    pixels = image.load()
    total = 0.0
    count = 0
    for index in range(CROP * CROP):
        if not flags[index]:
            continue
        total += luminance(pixels[index % CROP, index // CROP])
        count += 1
    return total / count if count else 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dir', default='artifacts/pass79/weather')
    parser.add_argument('--prefix', default='pair')
    parser.add_argument('--states', default='clear,storm')
    parser.add_argument('--mask-from', default='clear')
    args = parser.parse_args()

    states = args.states.split(',')
    frames = {}
    for state in states:
        with_path = os.path.join(args.dir, f'{args.prefix}-{state}-with.png')
        without_path = os.path.join(args.dir, f'{args.prefix}-{state}-without.png')
        frames[state] = (crop_centre(with_path), crop_centre(without_path))

    mask, mask_hits, mask_offset = build_mask(*frames[args.mask_from])
    if mask_hits < 500:
        raise SystemExit(f'enemy mask is only {mask_hits} px - the enemy is not in the crop')
    if mask_offset > 70:
        raise SystemExit(f'enemy mask centroid is {mask_offset:.1f} px off the crosshair - that is not the enemy')
    ring, ring_hits = build_ring(mask)

    report = {
        'maskPixels': mask_hits,
        'maskCentroidOffsetPx': round(mask_offset, 1),
        'ringPixels': ring_hits,
        'states': [],
    }
    baseline = None
    for state in states:
        with_enemy, without_enemy = frames[state]
        enemy = mean_luminance(with_enemy, mask)
        background = mean_luminance(with_enemy, ring)
        contrast = abs(enemy - background) / (enemy + background) if (enemy + background) else 0.0
        if baseline is None:
            baseline = contrast
        report['states'].append({
            'state': state,
            'enemyLuminance': round(enemy, 2),
            'backgroundLuminance': round(background, 2),
            'silhouetteContrast': round(contrast, 4),
            'retentionVsFirstState': round(contrast / baseline, 3) if baseline else None,
        })
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
