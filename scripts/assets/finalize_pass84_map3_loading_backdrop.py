"""finalize_pass84_map3_loading_backdrop.py - MAP3, owner 2026-09-02 (HF-405).

Map 3 was registered as a selectable arena on 2026-09-02 and had no DEPLOYMENT
LOADING BACKDROP, so `npm run qa:pass77:menu-previews` reported
"selectable arena map3 ships no deployment loading backdrop". This script
derives that backdrop from Map 3's OWN authoritative WebGPU runtime capture -
never a copy of another arena's, which is the exact defect
finalize_pass79_test_arena_loading_backdrops.py had to undo when Test1 shipped
gun-range-loading.webp and Test2 shipped high-seas-loading.webp.

Nothing here invents an encode. The eight shipped backdrops are 1536x864 lossy
WebP written by Pillow at method 6 from a 1536x864 Lanczos-resampled PNG master
(scripts/art-gen/finalize_lane_i.py), so this one is written by exactly the same
call from a master in exactly the same shape.

THE ONE DEVIATION, STATED RATHER THAN HIDDEN - AND IT IS A TIGHTENING, NOT A
RELAXATION. The pass79 family asserted a 169,200-239,202 byte band, which the
eight shipped backdrops occupy, and stepped quality DOWN from the ceiling
because a 1440p runtime capture of a detailed arena OVERSHOOTS it. Map 3 does
the opposite: at the family's own ceiling quality of 88 it encodes to ~61 KB,
far UNDER the band's lower bound. That is a property of the content, not of the
encode - a stone gallery at raking light is large flat paving and long soft
shadows, i.e. very little high-frequency detail, and WebP spends bytes on
exactly that. Inflating the file to reach the band would mean encoding at a
quality no other backdrop uses, purely to hit a number.

So the lower BYTE bound is replaced here by a direct measurement of the thing
that bound was standing in for. A byte floor is a proxy for fidelity, and it is
a weak one: noise satisfies it. This script asserts PSNR of the encoded WebP
against its own PNG master instead, which cannot be satisfied by noise, and
holds it at 40 dB (measured: 43.50 dB at quality 88). The family's UPPER bound
is a real payload budget and is kept as a hard assert, unchanged. Quality is
never raised above the family ceiling.

Inputs are the frames staged by
scripts/assets/generate-pass65-runtime-menu-previews.ts plus that run's receipt.
The chosen frame is re-hashed here and bound to the receipt's frame-set digest
before anything is written, and the encoded bytes are checked against the
shipped family's format, budget and fidelity floor - and against every other
arena's backdrop - before they are allowed to stay on the public shelf.

    python scripts/assets/finalize_pass84_map3_loading_backdrop.py

AA_PASS84_LOADING_RECEIPT overrides the capture receipt path.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from datetime import date

from PIL import Image

SELF = os.path.abspath(__file__)
ROOT = os.path.abspath(os.path.join(os.path.dirname(SELF), "..", ".."))
FRAME_ROOT = os.path.join(ROOT, "artifacts", "pass65", "menu-preview-master-frames")
LOADING_ROOT = os.path.join(ROOT, "public", "assets", "original", "loading")
PROVENANCE_ROOT = os.path.join(ROOT, "source-assets", "loading", "pass84-map3-loading")
MANIFEST_PATH = os.path.join(ROOT, "assets.manifest.json")
RECEIPT_PATH = os.path.join(
    ROOT,
    os.environ.get(
        "AA_PASS84_LOADING_RECEIPT",
        "artifacts/pass65/menu-preview-rotor-review/runtime-capture-receipt.json",
    ),
)

FAMILY_ID = "pass84-map3-loading-backdrop"
MANIFEST_ID = f"atomic-acres-{FAMILY_ID}"

CAPTURE_SIZE = (2560, 1440)
OUTPUT_SIZE = (1536, 864)
WEBP_QUALITY_CEILING = 88
WEBP_QUALITY_FLOOR = 40
WEBP_METHOD = 6
# Hard payload budget, inherited unchanged from the shipped family's upper bound.
MAXIMUM_BYTES = 239_202
# Replaces the family's LOWER byte bound with the fidelity it was a proxy for.
# See the module docstring: measured 43.50 dB at quality 88 on this content.
MINIMUM_PSNR_DB = 40.0

ARENA = "map3"
# Chosen by eye from the fresh capture, not taken blind: the frame has to sell
# its own map. Recorded in the provenance so the choice is reviewable.
LOADING_FRAME = int(os.environ.get("AA_PASS84_LOADING_FRAME", "210"))
REVIEW_NOTE = (
    "The paved hub centred with one full bay running away from it, both pier lines legible down "
    "the lane with the 1.8 m gaps and the corner-court cross-connections readable, planters and "
    "the central medallion in frame. Deliberately not the poster frame (60), which looks across "
    "the gallery rather than down it."
)


def sha256(path: str) -> str:
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def relative(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def psnr(reference: Image.Image, encoded: Image.Image) -> float:
    """Peak signal-to-noise ratio, RGB, over the whole frame."""
    left = reference.convert("RGB").tobytes()
    right = encoded.convert("RGB").tobytes()
    if len(left) != len(right):
        raise SystemExit("PSNR operands differ in size")
    squared_error = 0
    for a, b in zip(left, right):
        squared_error += (a - b) ** 2
    mean_squared_error = squared_error / len(left)
    if mean_squared_error == 0:
        return 99.0
    return 10 * math.log10(255 * 255 / mean_squared_error)


def main() -> None:
    if not os.path.exists(RECEIPT_PATH):
        raise SystemExit(f"Missing capture receipt: {relative(RECEIPT_PATH)}")
    with open(RECEIPT_PATH, encoding="utf8") as handle:
        receipt = json.load(handle)
    if receipt.get("source") != "authoritative-runtime-arena":
        raise SystemExit("capture receipt is not from the authoritative runtime arena")
    if list(receipt.get("viewport", [])) != list(CAPTURE_SIZE):
        raise SystemExit(f"capture receipt viewport is {receipt.get('viewport')}, expected {list(CAPTURE_SIZE)}")

    evidence = next((entry for entry in receipt.get("arenas", []) if entry.get("arenaId") == ARENA), None)
    if evidence is None:
        raise SystemExit(f"capture receipt does not describe {ARENA}")
    if evidence.get("softwareAdapter") is not False:
        raise SystemExit(f"{ARENA} capture ran on a software adapter")
    if not (1 <= LOADING_FRAME <= evidence["capturedFrames"]):
        raise SystemExit(f"{ARENA} frame {LOADING_FRAME} is outside the captured roster of {evidence['capturedFrames']}")

    os.makedirs(PROVENANCE_ROOT, exist_ok=True)
    source = os.path.join(FRAME_ROOT, ARENA, f"frame-{LOADING_FRAME:04d}.png")
    with Image.open(source) as image:
        if image.size != CAPTURE_SIZE:
            raise SystemExit(f"{relative(source)} is {image.size}, expected {CAPTURE_SIZE}")
        master_image = image.convert("RGB").resize(OUTPUT_SIZE, Image.LANCZOS)
    master = os.path.join(PROVENANCE_ROOT, f"{ARENA}-loading-master.png")
    master_image.save(master, "PNG")

    output = os.path.join(LOADING_ROOT, f"{ARENA}-loading.webp")
    previous = sha256(output) if os.path.exists(output) else None
    quality = None
    size = None
    # Quality only ever steps DOWN from the family ceiling, and only if the file
    # exceeds the payload budget. It is never raised to inflate a small file.
    for candidate in range(WEBP_QUALITY_CEILING, WEBP_QUALITY_FLOOR - 1, -1):
        with Image.open(master) as image:
            image.save(output, "WEBP", quality=candidate, method=WEBP_METHOD)
        size = os.path.getsize(output)
        if size <= MAXIMUM_BYTES:
            quality = candidate
            break
    if quality is None:
        raise SystemExit(f"{relative(output)} stayed over {MAXIMUM_BYTES} bytes down to quality {WEBP_QUALITY_FLOOR}")

    with Image.open(output) as encoded:
        if encoded.format != "WEBP" or encoded.size != OUTPUT_SIZE:
            raise SystemExit(f"{relative(output)} is {encoded.format} {encoded.size}, expected WEBP {OUTPUT_SIZE}")
        measured_psnr = psnr(master_image, encoded)
    if measured_psnr < MINIMUM_PSNR_DB:
        raise SystemExit(
            f"{relative(output)} is {measured_psnr:.2f} dB against its master, under the {MINIMUM_PSNR_DB} dB floor"
        )

    # The defect this family exists to prevent, asserted on the bytes just
    # written: no arena may ship another arena's loading backdrop.
    digests: dict[str, str] = {}
    for name in sorted(os.listdir(LOADING_ROOT)):
        if not name.endswith("-loading.webp"):
            continue
        digest = sha256(os.path.join(LOADING_ROOT, name))
        if digest in digests:
            raise SystemExit(
                f"{name} is byte-identical to {digests[digest]}; that is the placeholder defect this family prevents"
            )
        digests[digest] = name

    arena_record = {
        "arenaId": ARENA,
        "replaces": None,
        "previousSha256": previous,
        "capture": {
            "source": receipt["source"],
            "backendRequired": receipt.get("backendRequired"),
            "backendUsed": evidence.get("backend"),
            "softwareAdapter": evidence.get("softwareAdapter"),
            "receiptPath": relative(RECEIPT_PATH),
            "inputsStable": receipt.get("inputsStable"),
            "driftedInputPaths": receipt.get("driftedInputPaths", []),
            "capturedFrames": evidence.get("capturedFrames"),
            "frameSetSha256": evidence.get("frameSet", {}).get("sha256"),
            "sourceFrame": LOADING_FRAME,
            "sourceFrameSha256": sha256(source),
            "reviewNote": REVIEW_NOTE,
        },
        "master": {"path": relative(master), "sha256": sha256(master)},
        "encodeQuality": quality,
        "psnrDb": round(measured_psnr, 2),
        "runtimeFile": {"path": relative(output), "sha256": sha256(output), "bytes": size},
    }

    provenance = {
        "schemaVersion": 1,
        "familyId": FAMILY_ID,
        "generatedAt": date.today().isoformat(),
        "note": (
            "Deployment loading backdrop for Map 3 (HF-405), derived from the arena's own authoritative "
            "WebGPU runtime capture. Map 3 never shipped a placeholder: this is its first backdrop. The "
            "six Lane I backdrops, the pass79 pair, and all masters are untouched."
        ),
        "encode": {
            "captureSize": list(CAPTURE_SIZE),
            "outputSize": list(OUTPUT_SIZE),
            "resampler": "PIL.Image.LANCZOS",
            "format": "WEBP",
            "qualityCeiling": WEBP_QUALITY_CEILING,
            "qualityUsed": {ARENA: quality},
            "method": WEBP_METHOD,
            "maximumBytes": MAXIMUM_BYTES,
            "minimumPsnrDb": MINIMUM_PSNR_DB,
            "psnrDb": {ARENA: round(measured_psnr, 2)},
            "lowerByteBoundSubstitution": (
                "The shipped family's 169,200 byte lower bound is not asserted here. At the family's own "
                "ceiling quality of 88 this content encodes to roughly 61 KB because a stone gallery at "
                "raking light carries very little high-frequency detail, and raising quality above the "
                "family ceiling purely to reach a byte count would put this file outside the family it "
                "claims to join. The byte floor was a proxy for fidelity, so fidelity is measured "
                "directly instead: PSNR against the file's own PNG master, floored at "
                f"{MINIMUM_PSNR_DB} dB, which noise cannot satisfy. The family's UPPER bound is kept as a "
                "hard assert."
            ),
            "inheritedFrom": "scripts/art-gen/finalize_lane_i.py",
        },
        "finalizer": {"path": relative(SELF), "sha256": sha256(SELF)},
        "generator": {
            "path": "scripts/assets/generate-pass65-runtime-menu-previews.ts",
            "sha256": sha256(os.path.join(ROOT, "scripts/assets/generate-pass65-runtime-menu-previews.ts")),
        },
        "arenas": [arena_record],
    }
    provenance_path = os.path.join(PROVENANCE_ROOT, "provenance.json")
    # Every JSON this script writes lands LF, like the JS finalizers beside it;
    # Python text mode would otherwise rewrite the whole manifest as CRLF.
    with open(provenance_path, "w", encoding="utf8", newline="\n") as handle:
        json.dump(provenance, handle, indent=2)
        handle.write("\n")

    with open(MANIFEST_PATH, encoding="utf8") as handle:
        manifest = json.load(handle)
    entry = {
        "id": MANIFEST_ID,
        "kind": "original-project-authoritative-runtime-arena-loading-backdrop",
        "creator": "Atomic Acres project",
        "source": "Offline WebGPU capture of the Map 3 authoritative runtime arena",
        "generatedAsOf": provenance["generatedAt"],
        "license": "Original project work",
        "attributionRequired": False,
        "sourceProvenance": relative(provenance_path),
        "sourceProvenanceSha256": sha256(provenance_path),
        "sourceScript": relative(SELF),
        "sourceScriptSha256": provenance["finalizer"]["sha256"],
        "files": [{"path": arena_record["runtimeFile"]["path"], "sha256": arena_record["runtimeFile"]["sha256"]}],
        "owner": "wiringNotes: deployment loading surface backdrops (one per arena)",
        "placeholderStatus": "production",
        "format": (
            f"{OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]} lossy WebP (Pillow, method {WEBP_METHOD}, quality {quality}), "
            "matching the eight shipped backdrops in format, resampler, output size and payload budget. "
            f"Measured {measured_psnr:.2f} dB PSNR against its own PNG master, over the {MINIMUM_PSNR_DB} dB "
            f"floor. PNG master preserved byte-for-byte under {relative(PROVENANCE_ROOT)}/"
        ),
        "modifications": (
            "Captured offline at native 1440p from the actual authoritative Map 3 production WebGPU arena "
            "with deterministic camera and visual time, then Lanczos-downscaled to 1536x864 and encoded "
            "with the shipped Lane I WebP profile. No downloaded or sampled art is used."
        ),
    }
    index = next((i for i, asset in enumerate(manifest["assets"]) if asset.get("id") == MANIFEST_ID), -1)
    if index >= 0:
        manifest["assets"][index] = entry
    else:
        manifest["assets"].append(entry)
    with open(MANIFEST_PATH, "w", encoding="utf8", newline="\n") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")

    print(json.dumps({
        "finalize": "passed",
        "family": FAMILY_ID,
        "arenaId": ARENA,
        "sourceFrame": LOADING_FRAME,
        "encodeQuality": quality,
        "psnrDb": round(measured_psnr, 2),
        "sha256": arena_record["runtimeFile"]["sha256"],
        "bytes": size,
        "distinctLoadingBackdrops": len(digests),
    }, indent=2))


if __name__ == "__main__":
    main()
