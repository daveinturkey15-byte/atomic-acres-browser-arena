"""compare_hf420_water_captures.py - HF-420 capture comparison (Lane AM, PASS 87).

Two capture directories in, one JSON out. Every number here is measured from the
PNGs; nothing is estimated.

Per shot it reports:
  * mean linear-ish sRGB per channel, whole frame and a centred region of
    interest (the ROI is where the water is in the shoreline/grazing/down shots);
  * the mean absolute per-pixel delta and the fraction of pixels that differ at
    all, which is what makes "byte-comparable" a measurement rather than a claim;
  * the SKIRT SEAM: the horizon skirt's own pixels (found by differencing
    against the same frame with the skirt hidden) against the near-plane water
    immediately below them, compared as chromaticity - so a hue break between
    the two surfaces is a number and not an eyeball verdict;
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
# 8/255. The visible-difference threshold every coverage figure in this lane's
# evidence is quoted at. It used to be 1e-9 here, which is not a coverage
# threshold at all - it counts any pixel that moved by a single LSB, so on an
# animated sea it reported the 1.2 s of wave motion between the main frame and
# the pool-hidden frame as "pond coverage" on arenas that have no ponds.
VISIBLE_DELTA = 8.0 / 255.0


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


def skirt_seam(frame: Path, noskirt: Path) -> dict:
    """Measure the skirt / near-plane seam on NAMED pixel sets.

    The horizon skirt is an unlit ring carrying the sea past the displaced near
    plane. Differencing the frame against the same frame with the skirt hidden
    gives exactly the skirt's pixels. For every column that owns skirt pixels we
    then take the water immediately BELOW the skirt's bottom edge - that is the
    near plane at the seam - and compare the two as CHROMATICITY (colour
    normalised to unit sum).

    Chromaticity is the right space because the seam has always carried a
    brightness step: the skirt is unlit and the near plane is a lit
    MeshStandardNodeMaterial, and that was true of the accepted pre-change build
    too. What must not exist is a HUE disagreement, which is what appears when
    the two surfaces are running different colour models.
    """
    a = np.asarray(Image.open(frame).convert('RGB'), dtype=np.float64) / 255.0
    b = np.asarray(Image.open(noskirt).convert('RGB'), dtype=np.float64) / 255.0
    if a.shape != b.shape:
        return {'error': f'shape mismatch {a.shape} vs {b.shape}'}
    mask = np.abs(a - b).max(axis=2) > VISIBLE_DELTA
    height, width = mask.shape
    columns = np.flatnonzero(mask.any(axis=0))
    if columns.size == 0:
        return {'skirtPixels': 0}
    band = 8  # rows of near plane sampled directly under the skirt's bottom edge
    skirt_samples, near_samples = [], []
    for column in columns:
        rows = np.flatnonzero(mask[:, column])
        bottom = int(rows.max())
        skirt_samples.append(a[rows, column, :])
        low, high = bottom + 1, min(height, bottom + 1 + band)
        if high > low and not mask[low:high, column].any():
            near_samples.append(a[low:high, column, :])
    if not skirt_samples or not near_samples:
        return {'skirtPixels': int(mask.sum()), 'seamColumns': 0}
    skirt = np.concatenate(skirt_samples, axis=0).mean(axis=0)
    near = np.concatenate(near_samples, axis=0).mean(axis=0)

    def chroma(rgb: np.ndarray) -> np.ndarray:
        total = rgb.sum()
        return rgb / total if total > 1e-6 else np.zeros(3)

    skirt_chroma, near_chroma = chroma(skirt), chroma(near)
    return {
        'skirtPixels': int(mask.sum()),
        'skirtCoverage': round(float(mask.mean()), 8),
        'seamColumns': len(near_samples),
        'skirtMeanRgb': [round(float(v), 6) for v in skirt],
        'nearPlaneMeanRgb': [round(float(v), 6) for v in near],
        'skirtChromaticity': [round(float(v), 6) for v in skirt_chroma],
        'nearPlaneChromaticity': [round(float(v), 6) for v in near_chroma],
        # The headline: total absolute chromaticity distance across the seam.
        'seamHueDistance': round(float(np.abs(skirt_chroma - near_chroma).sum()), 6),
        'seamLumaRatio': round(float(luma(skirt) / max(luma(near), 1e-6)), 6),
    }


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
        'visiblyChangedPixelFraction': round(float((delta.max(axis=2) > VISIBLE_DELTA).mean()), 8),
        'visiblyChangedPixels': int((delta.max(axis=2) > VISIBLE_DELTA).sum()),
        'roiMeanAbsDelta': round(float(delta[ry, rx].mean()), 8),
        'silhouetteMaxShiftPx': int(sil_shift.max()),
        'silhouetteMeanShiftPx': round(float(sil_shift.mean()), 6),
        'silhouetteColumnsMoved': int((sil_shift > 0).sum()),
        'width': int(a.shape[1]),
        'height': int(a.shape[0]),
    }


def has_pools(capture_dir: Path) -> bool:
    """Did the build in this capture directory actually author any ponds?

    Read from the harness's own scene-graph readback rather than guessed from
    the arena name, so a build that authors a pond and fails to draw it is still
    counted as HAVING one - that distinction is the whole point of the coverage
    probe. Absent telemetry means "unknown", and unknown must not publish a
    coverage number.
    """
    telemetry = capture_dir / 'telemetry.json'
    if not telemetry.exists():
        return False
    try:
        nodes = json.loads(telemetry.read_text(encoding='utf-8')).get('waterNodes') or []
    except (ValueError, OSError):
        return False
    # A POND is a mesh carrying a waterBodyId. The containing group is named
    # 'Pass 64 TSL water pools' and is built on EVERY arena, empty or not, so
    # matching the name alone counts every arena as having ponds - which is how
    # high-seas and rustworks came to publish pond coverage in the first place.
    return any(
        'water pool' in str(node.get('name', '')) and node.get('bodyId')
        for node in nodes
    )


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
        # hidden. Pixels that VISIBLY move when the ponds are hidden ARE the
        # ponds - at 8/255, the threshold every coverage figure in the evidence
        # is quoted at, and only for a build that actually has ponds.
        #
        # Both of those conditions were wrong before. At 1e-9 the metric counted
        # the 1.2 s of wave animation between the two screenshots, and it was
        # emitted unconditionally, so high-seas and rustworks - which author no
        # ponds at all - published 9-20% "pond coverage" that was pure frame
        # drift. The same number is still useful, so it is still reported, under
        # the name of the thing it actually measures.
        nopool = after_dir / f'{png.stem}-nopool.png'
        if nopool.exists():
            pair = stats(nopool, other)
            if has_pools(after_dir):
                entry['poolCoverage'] = pair['visiblyChangedPixelFraction']
                entry['poolCoveragePixels'] = pair['visiblyChangedPixels']
            entry['frameDriftFraction'] = pair['changedPixelFraction']
        nopool_before = before_dir / f'{png.stem}-nopool.png'
        if nopool_before.exists():
            pair_before = stats(nopool_before, png)
            if has_pools(before_dir):
                entry['poolCoverageBefore'] = pair_before['visiblyChangedPixelFraction']
            entry['frameDriftFractionBefore'] = pair_before['changedPixelFraction']
        # Skirt / near-plane seam, per build, on named pixel sets.
        for label, frame, capture_dir in (
            ('skirtSeamBefore', png, before_dir),
            ('skirtSeamAfter', other, after_dir),
        ):
            noskirt = capture_dir / f'{png.stem}-noskirt.png'
            if noskirt.exists():
                entry[label] = skirt_seam(frame, noskirt)
        report['shots'][png.stem] = entry
    text = json.dumps(report, indent=2)
    print(text)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
