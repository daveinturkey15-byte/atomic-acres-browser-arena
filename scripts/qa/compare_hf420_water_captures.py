"""compare_hf420_water_captures.py - HF-420 capture comparison (Lane AM, PASS 87).

Two capture directories in, one JSON out. Every number here is measured from the
PNGs; nothing is estimated.

Per shot it reports:
  * mean linear-ish sRGB per channel, whole frame and a centred region of
    interest (the ROI is where the water is in the shoreline/grazing/down shots);
  * the mean absolute per-pixel delta and the fraction of pixels that differ at
    all, which is what makes "byte-comparable" a measurement rather than a claim;
  * the SILHOUETTE row per column - for each column, the first row from the top
    that is not sky - and the max/mean shift of that line between the two
    builds. Geometry that did not move cannot move this line, so it separates
    "the colour changed" from "the surface changed".

Usage: python scripts/qa/compare_hf420_water_captures.py BEFORE_DIR AFTER_DIR [--out FILE]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SKY_LUMA = 0.55
ROI_FRACTION = 0.5


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def silhouette_rows(rgb: np.ndarray) -> np.ndarray:
    """First row per column that is not sky; height when the column is all sky."""
    not_sky = luma(rgb) < SKY_LUMA
    height = rgb.shape[0]
    first = np.argmax(not_sky, axis=0)
    first[~not_sky.any(axis=0)] = height
    return first


def roi_slice(shape: tuple[int, int]) -> tuple[slice, slice]:
    h, w = shape
    dh, dw = int(h * ROI_FRACTION / 2), int(w * ROI_FRACTION / 2)
    return slice(h // 2 - dh, h // 2 + dh), slice(w // 2 - dw, w // 2 + dw)


def stats(before: Path, after: Path) -> dict:
    a = np.asarray(Image.open(before).convert('RGB'), dtype=np.float64) / 255.0
    b = np.asarray(Image.open(after).convert('RGB'), dtype=np.float64) / 255.0
    if a.shape != b.shape:
        return {'error': f'shape mismatch {a.shape} vs {b.shape}'}
    ry, rx = roi_slice(a.shape[:2])
    delta = np.abs(b - a)
    sil_a, sil_b = silhouette_rows(a), silhouette_rows(b)
    sil_shift = np.abs(sil_b.astype(np.int64) - sil_a.astype(np.int64))
    return {
        'meanBefore': [round(float(a[..., c].mean()), 6) for c in range(3)],
        'meanAfter': [round(float(b[..., c].mean()), 6) for c in range(3)],
        'roiMeanBefore': [round(float(a[ry, rx, c].mean()), 6) for c in range(3)],
        'roiMeanAfter': [round(float(b[ry, rx, c].mean()), 6) for c in range(3)],
        'meanAbsDelta': round(float(delta.mean()), 8),
        'maxAbsDelta': round(float(delta.max()), 8),
        'changedPixelFraction': round(float((delta.max(axis=2) > 1e-9).mean()), 8),
        'roiMeanAbsDelta': round(float(delta[ry, rx].mean()), 8),
        'silhouetteMaxShiftPx': int(sil_shift.max()),
        'silhouetteMeanShiftPx': round(float(sil_shift.mean()), 6),
        'silhouetteColumnsMoved': int((sil_shift > 0).sum()),
        'width': int(a.shape[1]),
        'height': int(a.shape[0]),
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print(__doc__)
        return 2
    before_dir, after_dir = Path(args[0]), Path(args[1])
    out = None
    if '--out' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--out') + 1])
    report = {'before': str(before_dir), 'after': str(after_dir), 'shots': {}}
    for png in sorted(before_dir.glob('*.png')):
        if png.stem.endswith('-nopool'):
            continue
        other = after_dir / png.name
        if not other.exists():
            continue
        entry = stats(png, other)
        # Pond screen coverage, measured: the same frame with the pool group
        # hidden. Pixels that move when the ponds are hidden ARE the ponds.
        nopool = after_dir / f'{png.stem}-nopool.png'
        if nopool.exists():
            entry['poolCoverage'] = stats(nopool, other)['changedPixelFraction']
        nopool_before = before_dir / f'{png.stem}-nopool.png'
        if nopool_before.exists():
            entry['poolCoverageBefore'] = stats(nopool_before, png)['changedPixelFraction']
        report['shots'][png.stem] = entry
    text = json.dumps(report, indent=2)
    print(text)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
