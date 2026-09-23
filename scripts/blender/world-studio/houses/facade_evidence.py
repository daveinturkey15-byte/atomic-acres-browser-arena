"""Produce the wave-4 facade before/after record. CPU only, no Blender, no GPU.

Renders the same cameras twice — once with the wave-3 white structural leaf and
once with the wave-4 repair — through ``facade_preview``'s quantised depth
buffer, and writes both the frames and the numbers.

    python scripts/blender/world-studio/houses/facade_evidence.py

Frames land in ``source-assets/world-studio/houses/<variant>/review/`` and the
numbers in ``docs/technique-lab/houses/facade-repair-evidence.json``. Nothing
here touches the shipped GLB, the catalog or any build report: those are
Blender's output and re-exporting them is the one step this pass cannot take.
"""

from __future__ import annotations

import gc
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Must precede the numpy import: its BLAS pool sizes per-thread scratch at load time and
# this sandbox cannot always satisfy it. Nothing here is a matrix multiply.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import facade_preview as F  # noqa: E402

REPO_ROOT = F.REPO_ROOT
CAMERAS = ("street-grazing", "belt-grazing", "watertable-close")
VARIANTS = ("teal", "yellow")
SIZE = (800, 450)


OUT_JSON = os.path.join(REPO_ROOT, "docs", "technique-lab", "houses", "facade-repair-evidence.json")


def run(variants=VARIANTS) -> dict:
    record: dict = {
        "instrument": "facade_preview (CPU raster, quantised depth buffer)",
        "size": list(SIZE),
        "near": F.NEAR, "far": F.FAR, "depthBits": F.DEPTH_BITS,
        "runtimeSidedness": "FrontSide on opaque, DoubleSide on glass "
                            "(src/world-studio/houses/index.ts:211)",
        "cases": [],
    }
    for variant in variants:
        for camera in CAMERAS:
            for legacy in (True, False):
                image, idbuf, mats, names, census, tris = F.render(
                    variant, camera, SIZE[0], SIZE[1], cull=True, legacy_sheathing=legacy,
                )
                metrics = F.stripe_metrics(idbuf, mats, names, tris)
                wave = "wave3" if legacy else "wave4"
                out = os.path.join(
                    REPO_ROOT, "source-assets", "world-studio", "houses", variant, "review",
                    f"cpu-{camera}-{wave}.png",
                )
                os.makedirs(os.path.dirname(out), exist_ok=True)
                F.save_png(image, out)
                record["cases"].append({
                    "variant": variant,
                    "camera": camera,
                    "state": wave,
                    "frame": os.path.relpath(out, REPO_ROOT).replace("\\", "/"),
                    "sidingFieldPixels": metrics["fieldPixels"],
                    "lightSliverPixels": metrics["sliverPixels"],
                    "sliverShareOfField": round(
                        metrics["sliverPixels"] / max(metrics["fieldPixels"], 1), 5),
                    "census": {k: int(v) for k, v in census.items()},
                    "worstSurfaces": [
                        {"material": k[0], "normal": list(k[1]), "planeOffset": k[2], "pixels": v}
                        for k, v in metrics["groups"].most_common(5)
                    ],
                })
                print(f"{variant:6s} {camera:16s} {wave}  "
                      f"slivers {metrics['sliverPixels']:5d} / field {metrics['fieldPixels']:6d}"
                      f"  ({100.0 * metrics['sliverPixels'] / max(metrics['fieldPixels'], 1):5.2f}%)",
                      flush=True)
                # Each case allocates a full triangle set and two buffers; this loop runs
                # twelve of them, so release before the next rather than at exit.
                del image, idbuf, mats, names, census, tris, metrics
                gc.collect()

    # Each variant is rendered in its own process (twelve full triangle sets in one
    # process exhausts this sandbox's memory), so merge with whatever is on disk.
    if os.path.exists(OUT_JSON):
        with open(OUT_JSON, encoding="utf-8") as handle:
            previous = json.load(handle)
        kept = [c for c in previous.get("cases", []) if c["variant"] not in variants]
        record["cases"] = kept + record["cases"]

    by_key = {(c["variant"], c["camera"], c["state"]): c for c in record["cases"]}
    deltas = []
    for variant, camera in sorted({(k[0], k[1]) for k in by_key}):
        if (variant, camera, "wave3") not in by_key or (variant, camera, "wave4") not in by_key:
            continue
        before = by_key[(variant, camera, "wave3")]["lightSliverPixels"]
        after = by_key[(variant, camera, "wave4")]["lightSliverPixels"]
        deltas.append({
            "variant": variant, "camera": camera,
            "before": before, "after": after,
            "reductionPercent": round(100.0 * (before - after) / before, 1) if before else None,
        })
    record["deltas"] = deltas
    total_before = sum(d["before"] for d in deltas)
    total_after = sum(d["after"] for d in deltas)
    record["totalBefore"] = total_before
    record["totalAfter"] = total_after
    record["totalReductionPercent"] = (
        round(100.0 * (total_before - total_after) / total_before, 1) if total_before else None
    )
    return record


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    variants = tuple(v for v in VARIANTS if not argv or v in argv)
    record = run(variants)
    out = OUT_JSON
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"\ntotal light slivers {record['totalBefore']} -> {record['totalAfter']} "
          f"({record['totalReductionPercent']}% reduction)")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
