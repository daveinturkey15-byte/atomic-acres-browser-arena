"""Mechanical audit of the shipped house maps, GLBs and build reports. No Blender, no bpy.

Wave 2's verdict on wave 1 was that several claims were plausible but unmeasured. This script
exists so the wave-3 claims are not: every number in the handoff's validation section comes out
of here, and anyone can re-run it.

    python scripts/blender/world-studio/houses/audit_maps.py

Three checks, each of which can fail:

  1. **Palette against the concept.** ``codex-clipboard-5e010137`` was masked by hue/saturation
     per house and the lit siding and roof plane measured in sRGB. The generators are authored
     so the *mean albedo texel* lands on those numbers, which is a lighting-independent
     comparison — unlike comparing two renders shot under two different light rigs.
  2. **Normal-map aggression.** Wave 2's "trim reads popcorn/stucco" and "silver glints on the
     shingle eave" are both a mean tangent tilt that is too high for the material. The tilt is
     measured straight out of the shipped PNG, in degrees, and held under a per-slot ceiling.
  3. **Contract census.** Triangles, materials, apertures, panes, route landmarks, aperture
     mismatches and road clearance, read back from the build reports and the GLBs on disk.

Exit code 0 only if every check passes.
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path
from typing import Dict, List, Tuple

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]
ASSET_DIR = REPO_ROOT / "public" / "assets" / "world-studio" / "blender" / "houses"
SOURCE_DIR = REPO_ROOT / "source-assets" / "world-studio" / "houses"

# Measured off the owner concept image, in sRGB. See house_contract.VARIANTS for the derivation.
CONCEPT_SRGB: Dict[str, Dict[str, Tuple[int, int, int]]] = {
    "teal": {"siding": (77, 127, 119), "shingle": (137, 143, 129)},
    "yellow": {"siding": (169, 134, 66), "shingle": (137, 143, 129)},
}
# Mean per-channel tolerance. 18 counts is about 7% of range: close enough that the house reads
# as the concept's house, loose enough that per-board tone and weathering are not flattened out.
PALETTE_TOLERANCE = 18.0

# Ceiling on the mean tangent-space tilt, in degrees, per slot. These are statements about what
# each material physically is, written down before measuring: a painted 1x4 and a coated gutter
# are near-smooth, a float-finished slab and a painted board have a little tooth, a granule
# surface has more, and a stone face is genuinely rough. Wave 1's 0.45-strength trim map put
# painted board up at stucco tilt, which is why it read as popcorn at the porch-close camera.
# Siding, shingle and stone all carry their real relief as geometry, so their maps only add
# grain on top and none of them needs a large tilt to do that.
MAX_MEAN_TILT_DEG = {
    "trim": 3.0,
    "metal": 3.0,
    "siding": 8.0,
    "shingle": 12.0,
    "concrete": 8.0,
    "masonry": 20.0,
}

EXPECTED = {
    "materials": 8,
    "apertureMarkers": 26,
    "routeLandmarks": 3,
    "panes": 22,
    "images": 18,
    # Wave 3. The interior contract transcribed from house.ts:502-700: seven partitions carrying
    # nine cased openings between them, and a sixteen-tread flight. These are counts of a frozen
    # contract, not targets, so any drift is a failure in either direction.
    "interiorPartitions": 7,
    "interiorApertureMarkers": 9,
    "stairTreads": 16,
}

# Wave 3 declared the interior cost up front rather than discovering it afterwards. Wave 2 shipped
# 36,360 / 36,528 triangles with no interior at all; partitions, architraves, the stair, the
# landing guard, the skirting band and the two missing handrails are the whole of the increase.
# The ceiling is a budget, not a measurement: it fails if the interior ever starts costing more
# than the ~5% of the exterior it is worth.
MAX_TRIANGLES = 40_000
MAX_GLB_BYTES = 6_000_000


# ---------------------------------------------------------------- minimal PNG reader

def read_png_rgb(path: Path) -> Tuple[int, int, List[bytes]]:
    """Decode the 8-bit RGB PNGs this lane writes. Filter 0 only, which is all we emit."""
    blob = path.read_bytes()
    assert blob[:8] == b"\x89PNG\r\n\x1a\n", f"not a PNG: {path}"
    pos, width, height, idat = 8, 0, 0, bytearray()
    while pos < len(blob):
        (length,) = struct.unpack(">I", blob[pos:pos + 4])
        tag = blob[pos + 4:pos + 8]
        payload = blob[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            width, height, depth, colour = struct.unpack(">IIBB", payload[:10])
            assert depth == 8 and colour == 2, f"{path}: expected 8-bit RGB, got depth {depth} colour {colour}"
        elif tag == b"IDAT":
            idat.extend(payload)
        elif tag == b"IEND":
            break
        pos += 12 + length
    raw = zlib.decompress(bytes(idat))
    stride = width * 3
    rows: List[bytes] = []
    for y in range(height):
        start = y * (stride + 1)
        assert raw[start] == 0, f"{path}: unexpected PNG filter {raw[start]} on row {y}"
        rows.append(raw[start + 1:start + 1 + stride])
    return width, height, rows


def mean_rgb(rows: List[bytes]) -> Tuple[float, float, float]:
    totals = [0, 0, 0]
    count = 0
    for row in rows:
        totals[0] += sum(row[0::3])
        totals[1] += sum(row[1::3])
        totals[2] += sum(row[2::3])
        count += len(row) // 3
    return tuple(t / count for t in totals)  # type: ignore[return-value]


def mean_tilt_degrees(rows: List[bytes]) -> float:
    """Mean angle between the encoded tangent normal and the surface normal, in degrees.

    Measured from X and Y, never from Z. Reading Z looks like the obvious choice and is a trap:
    an 8-bit Z is hopeless near flat, because the whole 0-13 degree band lives between codes
    254 and 255. ``write_png`` truncates, so a dead-flat normal encodes Z=254 and
    ``acos(254/127.5 - 1)`` is 7.18 degrees — a floor no tangent map can ever get under, which
    silently turns the trim ceiling into an unreachable gate that says nothing about the
    material. X and Y sit near code 127 where one code is 1/127.5 of the full range, giving a
    quantisation floor around 0.45 degrees. The +0.5 undoes the truncation bias.
    """
    import math

    total, count = 0.0, 0
    for row in rows:
        xs, ys = row[0::3], row[1::3]
        for x, y in zip(xs, ys):
            nx = (x + 0.5) / 127.5 - 1.0
            ny = (y + 0.5) / 127.5 - 1.0
            planar = math.hypot(nx, ny)
            total += math.degrees(math.atan2(planar, math.sqrt(max(0.0, 1.0 - min(1.0, planar * planar)))))
            count += 1
    return total / count


# ---------------------------------------------------------------- checks

def audit() -> int:
    failures: List[str] = []
    print(f"[audit] repo root {REPO_ROOT}")

    for variant in ("teal", "yellow"):
        tex = SOURCE_DIR / variant / "textures"
        report_path = SOURCE_DIR / variant / "build-report.json"
        if not report_path.exists():
            failures.append(f"{variant}: no build-report.json; run run_houses.py first")
            continue
        report = json.loads(report_path.read_text(encoding="utf-8"))

        print(f"\n[audit] ---- {variant} ----")

        # 1. palette
        for slot, target in CONCEPT_SRGB[variant].items():
            _, _, rows = read_png_rgb(tex / f"{slot}.png")
            got = mean_rgb(rows)
            delta = sum(abs(g - t) for g, t in zip(got, target)) / 3.0
            verdict = "ok" if delta <= PALETTE_TOLERANCE else "FAIL"
            if verdict == "FAIL":
                failures.append(f"{variant}/{slot}: albedo {tuple(round(v,1) for v in got)} vs concept {target}, mean dE {delta:.1f} > {PALETTE_TOLERANCE}")
            print(f"  palette {slot:8s} albedo mean {tuple(round(v, 1) for v in got)} "
                  f"concept {target} mean|dE| {delta:5.1f}  {verdict}")

        # 2. normal aggression
        for slot, ceiling in MAX_MEAN_TILT_DEG.items():
            path = tex / f"{slot}-normal.png"
            if not path.exists():
                failures.append(f"{variant}: missing {path.name}")
                continue
            _, _, rows = read_png_rgb(path)
            tilt = mean_tilt_degrees(rows)
            verdict = "ok" if tilt <= ceiling else "FAIL"
            if verdict == "FAIL":
                failures.append(f"{variant}/{slot}: mean normal tilt {tilt:.2f} deg > ceiling {ceiling}")
            print(f"  normal  {slot:8s} mean tilt {tilt:6.2f} deg  ceiling {ceiling:5.1f}  {verdict}")

        # 3. contract census
        glb = REPO_ROOT / report["glb"]
        digest = hashlib.sha256(glb.read_bytes()).hexdigest()
        checks = [
            ("glb exists", glb.exists()),
            ("sha256 matches report", digest == report["sha256"]),
            ("bytes match report", glb.stat().st_size == report["bytes"]),
            ("materials", report["materials"] == EXPECTED["materials"]),
            ("apertureMarkers", report["apertureMarkers"] == EXPECTED["apertureMarkers"]),
            ("routeLandmarks", report["routeLandmarks"] == EXPECTED["routeLandmarks"]),
            ("panes", report["panes"] == EXPECTED["panes"]),
            ("apertureMismatches empty", report["apertureMismatches"] == []),
            ("roadClearanceOk", bool(report["roadClearanceOk"])),
            # ---- wave 3: interior substitution ----
            ("interiorPartitions", report.get("interiorPartitions") == EXPECTED["interiorPartitions"]),
            ("interiorApertureMarkers", report.get("interiorApertureMarkers") == EXPECTED["interiorApertureMarkers"]),
            ("interiorApertureMismatches empty", report.get("interiorApertureMismatches") == []),
            ("stairTreads", report.get("stairTreads") == EXPECTED["stairTreads"]),
            ("stairTreadProblems empty", report.get("stairTreadProblems") == []),
            ("blockedRuntimeProbes empty", report.get("blockedRuntimeProbes") == []),
            ("runtimeProbesChecked >= 24", int(report.get("runtimeProbesChecked", 0)) >= 24),
            ("no pane has opaque geometry in it",
             all(pane["opaqueBehind"] == 0 for pane in report.get("paneDetail", []))),
            ("every pane carries a unique window id",
             len({pane["windowId"] for pane in report.get("paneDetail", [])}) == EXPECTED["panes"]),
            ("triangles under budget", int(report["triangles"]) <= MAX_TRIANGLES),
            ("glb bytes under budget", int(report["bytes"]) <= MAX_GLB_BYTES),
        ]
        for label, ok in checks:
            if not ok:
                failures.append(f"{variant}: census check '{label}' failed")
            print(f"  census  {label:26s} {'ok' if ok else 'FAIL'}")
        print(f"  census  triangles {report['triangles']}  textureBytes {report['textureBytes']}  "
              f"glbBytes {report['bytes']}")
        print(f"  census  sha256 {digest}")

    print()
    if failures:
        print(f"[audit] {len(failures)} FAILURE(S):")
        for line in failures:
            print(f"  - {line}")
        return 1
    print("[audit] all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(audit())
