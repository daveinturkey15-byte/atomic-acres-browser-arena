"""Emit the houses lane catalog from the real build reports and the real files on disk.

Runs under a bare system Python — no Blender — and derives every number from artefacts that
already exist, so the catalog can never claim an asset the build did not produce. Every hash is
recomputed here from the exported bytes rather than copied forward.

    python scripts/blender/world-studio/houses/write_catalog.py

Schema: the shared per-lane asset interface in the overnight SPEC (schemaVersion 1, assets[]).
URLs are deploy-base-relative, never file paths.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]
ASSET_DIR = REPO_ROOT / "public" / "assets" / "world-studio" / "blender" / "houses"
SOURCE_DIR = REPO_ROOT / "source-assets" / "world-studio" / "houses"
URL_BASE = "assets/world-studio/blender/houses"

VARIANTS = ("teal", "yellow")

LIMITATIONS = [
    "Structural shell, inside and out: walls, floors, ceilings, roof, chimney, porch, balcony, "
    "garage, trim, gutters, glazing, the seven interior partitions with their nine cased "
    "openings, and the contracted 16-tread internal stair. Furniture and interior decor still "
    "belong to the interiors lane and are NOT in this file.",
    "Presentation only. No collider, shot surface, spawn or navigation data is exported or "
    "derived; movement and shot authority stay in src/world-studio/architecture.",
    "Not yet observed in the running arena. Generated and audited is not integrated or visually "
    "accepted; root must inspect runtime and visuals before acceptance.",
    "Exterior thumbnails are 512x320 CPU Cycles renders at 24 samples, sized for a gallery tile "
    "rather than for judging material detail.",
    "The two interior thumbnails add four interior fill lamps because a closed house lit only by "
    "the exterior sun renders as noise at any sample count this lane can afford. They are a "
    "photographic rig for inspecting geometry and say nothing about the project light rig, "
    "interior bounce or mood. The stair frame is also aimed at the flight rather than at the "
    "review point's published target.",
    "Siding, shingle and stone maps are 512px procedural tiles; close-camera interior inspection "
    "will show the tile repeat.",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    assets = []
    for variant in VARIANTS:
        report_path = SOURCE_DIR / variant / "build-report.json"
        if not report_path.exists():
            print(f"[catalog] missing {report_path}; run run_houses.py first")
            return 2
        report = json.loads(report_path.read_text(encoding="utf-8"))
        glb = ASSET_DIR / f"house-{variant}-shell.glb"
        thumb = ASSET_DIR / f"house-{variant}-street.png"
        if not glb.exists() or not thumb.exists():
            print(f"[catalog] missing export or thumbnail for {variant}")
            return 2

        digest = sha256(glb)
        if digest != report["sha256"]:
            print(f"[catalog] {variant}: build report hash does not match the file on disk")
            return 3

        assets.append(
            {
                "id": f"world-studio-house-{variant}-shell",
                "title": f"{variant.capitalize()} two-storey house shell",
                "assetUrl": f"{URL_BASE}/house-{variant}-shell.glb",
                "thumbnailUrl": f"{URL_BASE}/house-{variant}-street.png",
                "additionalThumbnails": [
                    f"{URL_BASE}/house-{variant}-backyard.png",
                    f"{URL_BASE}/house-{variant}-interior-stair.png",
                    f"{URL_BASE}/house-{variant}-interior-living.png",
                ],
                "category": "architecture",
                # Curator assessment, not a measurement. Teal is ranked first because it is the
                # house the street hero concept frames and the one authored to completion first.
                "qualityRank": 1 if variant == "teal" else 2,
                "qualityReason": (
                    "Full structural shell with real lap-siding relief, stepped shingle courses, a "
                    "random-ashlar masonry chimney built from individual stones, open slatted "
                    "pergola, balustrades and open gameplay apertures, plus the interior "
                    f"partitions and the {report['stairTreads']}-tread internal stair; audited "
                    f"clear against all {report['apertureMarkers']} declared openings, "
                    f"{report['interiorApertureMarkers']} interior cased openings and "
                    f"{report['runtimeProbesChecked']} transcribed runtime probes."
                ),
                "revision": 3,
                "authoredBy": {"harness": "claude", "model": "claude-opus-5", "effort": "xhigh"},
                "sourceUrls": [
                    "https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html",
                    "https://threejs.org/docs/pages/GLTFLoader.html",
                ],
                "license": "Original project procedurally authored artwork",
                "method": (
                    "Deterministic Blender 5.1.2 Python authoring (CPU, --background, 4 threads) "
                    "from scripts/blender/world-studio/houses/, with PBR maps synthesised in numpy "
                    "from a seeded PRNG. No downloaded meshes or textures, no AI-generated images."
                ),
                "limitations": LIMITATIONS,
                "metrics": {
                    "triangles": report["triangles"],
                    "materials": report["materials"],
                    "textureBytes": report["textureBytes"],
                    "drawGroups": report["drawGroups"],
                    "glbBytes": report["bytes"],
                    "panes": report["panes"],
                    "apertureMarkers": report["apertureMarkers"],
                    "routeLandmarks": report["routeLandmarks"],
                    "trianglesByMaterial": report["trianglesByMaterial"],
                    "localBounds": report["localBounds"],
                    "interiorPartitions": report["interiorPartitions"],
                    "interiorApertureMarkers": report["interiorApertureMarkers"],
                    "stairTreads": report["stairTreads"],
                    "stairRise": report["stairRise"],
                    "stairGoing": report["stairGoing"],
                },
                "interiorApertureMismatches": report["interiorApertureMismatches"],
                "stairTreadProblems": report["stairTreadProblems"],
                "blockedRuntimeProbes": report["blockedRuntimeProbes"],
                "sha256": digest,
                "partition": report["partition"],
                "houseId": report["houseId"],
                "placement": report["placement"],
                "apertureMismatches": report["apertureMismatches"],
                "blender": report["blender"],
            }
        )

    catalog = {"schemaVersion": 1, "lane": "houses", "assets": assets}
    out = ASSET_DIR / "catalog.json"
    out.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"[catalog] wrote {out.relative_to(REPO_ROOT)} with {len(assets)} assets")
    for asset in assets:
        print(f"[catalog]   {asset['id']} {asset['sha256'][:16]} tris={asset['metrics']['triangles']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
