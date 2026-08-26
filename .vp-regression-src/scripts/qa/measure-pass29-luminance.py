#!/usr/bin/env python3
"""Measure gameplay-only luminance for deterministic Pass 29 environment captures."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def metrics(path: Path) -> dict[str, float]:
    image = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    height, width = image.shape[:2]
    if height < 270 or width < 480:
        raise ValueError(f"{path} is smaller than the minimum 480x270 capture contract")
    # Avoid minimap, score strip, weapon/field-support panels and FPS badge.
    rgb = image[round(height * 0.174):round(height * 0.889), round(width * 0.219):round(width * 0.625)]
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]
    return {
        "meanLinearLuminance": round(float(luminance.mean()), 4),
        "p10": round(float(np.percentile(luminance, 10)), 4),
        "median": round(float(np.median(luminance)), 4),
        "pixelsBelow0.03Pct": round(float((luminance < 0.03).mean() * 100), 1),
        "pixelsBelow0.08Pct": round(float((luminance < 0.08).mean() * 100), 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("capture_dir", nargs="?", default="artifacts/pass29/after")
    args = parser.parse_args()
    capture_dir = Path(args.capture_dir)
    captures = sorted(capture_dir.glob("*.png"))
    if not captures:
        raise SystemExit(f"No PNG captures found in {capture_dir}")
    result = {path.stem: metrics(path) for path in captures}
    destination = capture_dir / "luminance.json"
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
