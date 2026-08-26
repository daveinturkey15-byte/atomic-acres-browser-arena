#!/usr/bin/env python3
"""Lane I finalize: derive web-optimised runtime assets from generated masters,
write provenance records, and update assets.manifest.json so the repo's
provenance verifiers admit every new public file.

Inputs (produced by generate step):
  source-assets/art-gen/skin-cards/*-card-master.png   (896x1152 portraits)
  source-assets/art-gen/loading/*-loading-master.png   (1536x864 wides)
  source-assets/art-gen/menu/main-menu-backdrop-master.png
  source-assets/art-gen/lane-i-generation-receipt.json (exact prompts/seeds/hashes)

Outputs:
  public/assets/original/skin-cards/{id}-card.webp     (448x576 card size)
  public/assets/original/loading/{name}-loading.webp   (1536x864, quality 88)
  public/assets/original/menu/main-menu-backdrop.webp  (1536x864, quality 88)
  source-assets/art-gen/lane-i.provenance.json
  assets.manifest.json rows (3 sets, replaced idempotently by id)

Run:  python scripts/art-gen/finalize_lane_i.py     (from anywhere)
Then: npm run qa:asset-provenance
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "source-assets", "art-gen")
PUB = os.path.join(ROOT, "public", "assets", "original")
MANIFEST = os.path.join(ROOT, "assets.manifest.json")
RECEIPT = os.path.join(SRC, "lane-i-generation-receipt.json")
DATE = time.strftime("%Y-%m-%d")

SKIN_IDS = ["default", "explorer", "symbiote", "navalops"]
LOADING_NAMES = ["atomic-acres", "skyline-terminal", "rustworks", "gun-range",
                 "farcrysis", "high-seas"]

CREATOR = "Atomic Acres project / local Qwen-Image-2512 (ComfyUI, dave-gaming-pc)"
SOURCE = ("Local ComfyUI Qwen-Image-2512 fp8 + Lightning 4-step LoRA on the "
          "owner's RTX 5080; owner-cleared non-commercial local generation; "
          "no hosted or paid API")
LICENSE = "Original project AI-assisted artwork"
GEN_SCRIPT = "scripts/art-gen/comfy_generate.py"
JOBS_FILE = "scripts/art-gen/lane_i_jobs.json"


def sha256(path: str) -> str:
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace("\\", "/")


def derive_webp(master: str, out: str, size: tuple[int, int] | None,
                quality: int) -> dict:
    img = Image.open(master).convert("RGB")
    if size is not None and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "WEBP", quality=quality, method=6)
    return {"path": rel(out), "sha256": sha256(out)}


def main() -> None:
    receipt = json.load(open(RECEIPT, encoding="utf-8"))
    by_name = {j["name"]: j for j in receipt["jobs"]}

    skin_files, loading_files, menu_files = [], [], []
    masters = []

    for skin in SKIN_IDS:
        master = os.path.join(SRC, "skin-cards", f"{skin}-card-master.png")
        out = os.path.join(PUB, "skin-cards", f"{skin}-card.webp")
        skin_files.append(derive_webp(master, out, (448, 576), 90))
        masters.append({"path": rel(master), "sha256": sha256(master),
                        "job": by_name.get(f"skin-card-{skin}", {})})

    for name in LOADING_NAMES:
        master = os.path.join(SRC, "loading", f"{name}-loading-master.png")
        out = os.path.join(PUB, "loading", f"{name}-loading.webp")
        loading_files.append(derive_webp(master, out, None, 88))
        masters.append({"path": rel(master), "sha256": sha256(master),
                        "job": by_name.get(f"loading-{name}", {})})

    master = os.path.join(SRC, "menu", "main-menu-backdrop-master.png")
    out = os.path.join(PUB, "menu", "main-menu-backdrop.webp")
    menu_files.append(derive_webp(master, out, None, 88))
    masters.append({"path": rel(master), "sha256": sha256(master),
                    "job": by_name.get("menu-backdrop", {})})

    provenance = {
        "schemaVersion": 1,
        "lane": "lane-i-local-image-gen",
        "generatedAt": receipt.get("generatedAt", DATE),
        "creator": CREATOR,
        "provider": "Local ComfyUI 0.31.1 portable, Qwen-Image-2512 fp8_e4m3fn "
                    "+ Qwen-Image-2512-Lightning-4steps-V1.0 LoRA, 4 steps, "
                    "cfg 1.0, euler/simple, FluxGuidance 3.5",
        "machine": "dave-gaming-pc (RTX 5080, fully local, no hosted API)",
        "clearance": "Owner cleared local generation for non-commercial project "
                     "use; no third-party imagery used as input (pure text-to-image)",
        "sourceScript": GEN_SCRIPT,
        "sourceScriptSha256": sha256(os.path.join(ROOT, GEN_SCRIPT)),
        "jobsFile": JOBS_FILE,
        "jobsFileSha256": sha256(os.path.join(ROOT, JOBS_FILE)),
        "masters": masters,
    }
    prov_path = os.path.join(SRC, "lane-i.provenance.json")
    with open(prov_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(provenance, f, indent=2)
    prov_sha = sha256(prov_path)

    common = {
        "creator": CREATOR,
        "source": SOURCE,
        "generatedAsOf": DATE,
        "license": LICENSE,
        "attributionRequired": False,
        "sourceProvenance": rel(prov_path),
        "sourceProvenanceSha256": prov_sha,
        "sourceScript": GEN_SCRIPT,
        "sourceScriptSha256": provenance["sourceScriptSha256"],
    }

    rows = [
        {
            "id": f"atomic-acres-operator-skin-cards-{DATE}",
            "kind": "original-project-ai-assisted-operator-skin-card-art",
            **common,
            "files": skin_files,
            "owner": "wiringNotes: operator skin select cards (one portrait per "
                     "selectable skin in src/operator-skin-catalog.ts)",
            "placeholderStatus": "production",
            "format": "448x576 quality-90 lossy WebP per card, derived by "
                      "Lanczos reduction from 896x1152 PNG masters preserved "
                      "byte-for-byte under source-assets/art-gen/skin-cards/",
            "modifications": "Four operator portrait cards generated locally "
                             "with Qwen-Image-2512, one per selectable skin "
                             "(default, explorer, symbiote, navalops), art "
                             "directed to each skin's authored card palette and "
                             "material read (ISSUE WEAVE, CANVAS, CHITIN, WET "
                             "SHELL). Exact prompts and seeds recorded in the "
                             "source provenance record.",
        },
        {
            "id": f"atomic-acres-arena-deployment-loading-art-{DATE}",
            "kind": "original-project-ai-assisted-arena-loading-backdrop",
            **common,
            "files": loading_files,
            "owner": "wiringNotes: deployment loading surface backdrops (one "
                     "per arena in src/arena-identity.ts)",
            "placeholderStatus": "production",
            "format": "1536x864 quality-88 lossy WebP per arena, native "
                      "generation resolution, PNG masters preserved "
                      "byte-for-byte under source-assets/art-gen/loading/",
            "modifications": "Six deployment/loading backdrops generated "
                             "locally with Qwen-Image-2512, one per arena, "
                             "grounded in each arena's authored grade identity "
                             "description and deployment briefing approach "
                             "line. Exact prompts and seeds recorded in the "
                             "source provenance record.",
        },
        {
            "id": f"atomic-acres-main-menu-backdrop-{DATE}",
            "kind": "original-project-ai-assisted-menu-key-art",
            **common,
            "files": menu_files,
            "owner": "wiringNotes: main menu backdrop key art",
            "placeholderStatus": "production",
            "format": "1536x864 quality-88 lossy WebP, native generation "
                      "resolution, PNG master preserved byte-for-byte under "
                      "source-assets/art-gen/menu/",
            "modifications": "One main-menu key-art backdrop generated locally "
                             "with Qwen-Image-2512: four operator silhouettes "
                             "over the project's coastal-suburb-and-superyacht "
                             "identity, composed with negative space for UI. "
                             "Exact prompt and seed recorded in the source "
                             "provenance record.",
        },
    ]

    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    replaced_prefixes = ("atomic-acres-operator-skin-cards-",
                        "atomic-acres-arena-deployment-loading-art-",
                        "atomic-acres-main-menu-backdrop-")
    manifest["assets"] = [a for a in manifest["assets"]
                          if not str(a.get("id", "")).startswith(replaced_prefixes)]
    manifest["assets"].extend(rows)
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    total = len(skin_files) + len(loading_files) + len(menu_files)
    print(f"[finalize] {total} runtime webp files derived, provenance written, "
          f"{len(rows)} manifest rows updated in {rel(MANIFEST)}")
    print("[finalize] now run: npm run qa:asset-provenance")


if __name__ == "__main__":
    main()
