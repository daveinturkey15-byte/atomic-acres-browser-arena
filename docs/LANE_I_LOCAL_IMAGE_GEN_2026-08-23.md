# Lane I — Real Image-Gen Art via Local ComfyUI (2026-08-23)

Owner direction: "the 2d images are stupid drawings not image gen" — replace the
canvas-drawn 2D art with actual generated art, produced entirely on this machine.
Owner cleared local generation; non-commercial project use only. **No hosted or
paid API was called at any point.**

Status: **complete.** All 11 images generated locally, runtime WebP derived,
provenance recorded, ComfyUI shut down and the GPU released.

## The rig (as verified today)

- ComfyUI portable: `C:/Users/david/Desktop/stuff/Comfy Fun/ComfyUI_portable`
  (pinned `ComfyUI` tree, version 0.31.1, port **8188**, RTX 5080).
- Model stack (all local files under `ComfyUI/models/`):
  - unet `qwen_image_2512_fp8_e4m3fn.safetensors`
  - clip `qwen_2.5_vl_7b_fp8_scaled.safetensors` — this file had been removed
    since the proven July runs; restored 2026-08-23 from the canonical
    Comfy-Org/Qwen-Image_ComfyUI Hugging Face repo (9.38 GB) into
    `ComfyUI/models/text_encoders/`.
  - vae `qwen_image_vae.safetensors`
  - lora `Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors` (4 steps,
    cfg 1.0, euler/simple, FluxGuidance 3.5).
- Measured throughput this run: 36–86 s per image including model staging;
  the full 11-image batch ran in roughly 11 minutes wall clock.
- GPU etiquette: the 5080 also runs game QA. The generator batches everything in
  one session and shuts its own ComfyUI down afterwards. Verified after the final
  run: nothing listening on 8188, no stale PID file, GPU free. A MiniMax-H3-bundle
  ComfyUI (`run_h3.bat`, `--models-directory` pointing at
  `Downloads/ComfyUI-H3-setup/downloads-current`) was found idle on 8188 earlier
  and stopped to free VRAM; relaunch it any time with `run_h3.bat`.
  One heavyweight at a time on the 5080.

## Repeatable generator

- `scripts/art-gen/comfy_generate.py` — boots ComfyUI if down (pinned tree,
  default models dir, PID-file tracked so `--shutdown` only ever kills the
  instance it booted), refuses to submit if a wrong-models instance holds the
  port, submits API-format workflows, polls `/history`, collects PNGs via
  `/view`, writes a JSON receipt with the exact prompt/seed/sha256 per image.
- `scripts/art-gen/lane_i_jobs.json` — the 11 authored jobs (4 skin cards,
  6 arena loading backdrops, 1 main-menu backdrop) with full art direction.
- `scripts/art-gen/finalize_lane_i.py` — derives the web-optimised WebP runtime
  files, writes `source-assets/art-gen/lane-i.provenance.json`, and idempotently
  replaces the three Lane I rows in `assets.manifest.json` (per-file sha256).
- `scripts/art-gen/.gitignore` — keeps the `.comfy_boot.pid` / `.comfy_boot.log`
  runtime artifacts out of the tree.

Full rerun:

```
python scripts/art-gen/comfy_generate.py --jobs scripts/art-gen/lane_i_jobs.json \
  --out-dir source-assets/art-gen \
  --receipt source-assets/art-gen/lane-i-generation-receipt.json --boot --shutdown
python scripts/art-gen/finalize_lane_i.py
npm run verify:provenance && npm run qa:asset-provenance
```

Re-roll a single image without regenerating the other ten (added this pass —
`--only` filters the job list and the receipt is **merged**, so every master it
did not touch keeps its recorded prompt, seed and hash):

```
python scripts/art-gen/comfy_generate.py --jobs scripts/art-gen/lane_i_jobs.json \
  --only loading-farcrysis --out-dir source-assets/art-gen \
  --receipt source-assets/art-gen/lane-i-generation-receipt.json --boot --shutdown
python scripts/art-gen/finalize_lane_i.py
```

Single one-off image:

```
python scripts/art-gen/comfy_generate.py --boot --shutdown \
  --prompt "..." --width 1024 --height 1024 --out out.png
```

## Deliverables and provenance chain

Masters (preserved byte-for-byte, never shipped):
`source-assets/art-gen/{skin-cards,loading,menu}/*-master.png`
plus `lane-i-generation-receipt.json` (exact prompts, seeds, hashes, timings)
and `lane-i.provenance.json` (machine, model stack, clearance, per-master sha256).

Runtime files (shipped, all covered by `assets.manifest.json` rows
`atomic-acres-operator-skin-cards-2026-08-23`,
`atomic-acres-arena-deployment-loading-art-2026-08-23`,
`atomic-acres-main-menu-backdrop-2026-08-23`, license
"Original project AI-assisted artwork"):

| File | Size | Subject |
| --- | --- | --- |
| `public/assets/original/skin-cards/default-card.webp` | 448x576 | Standard Operator — ISSUE WEAVE, teal/cyan visor |
| `public/assets/original/skin-cards/explorer-card.webp` | 448x576 | Sunspire Wayfarer — CANVAS, tan/amber goggles |
| `public/assets/original/skin-cards/symbiote-card.webp` | 448x576 | Carapace Bulwark — CHITIN, violet carapace |
| `public/assets/original/skin-cards/navalops-card.webp` | 448x576 | Tidewrack Operative — WET SHELL, navy neoprene |
| `public/assets/original/loading/atomic-acres-loading.webp` | 1536x864 | Retro-atompunk cul-de-sac at sunset |
| `public/assets/original/loading/skyline-terminal-loading.webp` | 1536x864 | Airport apron and jetliner at cool dawn |
| `public/assets/original/loading/rustworks-loading.webp` | 1536x864 | Offshore rig at night (arena id `rustworks-1v1`) |
| `public/assets/original/loading/gun-range-loading.webp` | 1536x864 | Indoor ballistics lab, lanes and silhouette targets |
| `public/assets/original/loading/farcrysis-loading.webp` | 1536x864 | Tropical island, golden hour, vine-covered research ruin |
| `public/assets/original/loading/high-seas-loading.webp` | 1536x864 | Superyacht under way at daybreak |
| `public/assets/original/menu/main-menu-backdrop.webp` | 1536x864 | Four-operator dusk key art, yacht left, coast right |

Art direction is grounded in project truth: skin cards follow each skin's
authored `card` palette and `materialLabel` in `src/operator-skin-catalog.ts`
(ISSUE WEAVE / CANVAS / CHITIN / WET SHELL); loading art follows each arena's
`description` in `src/arena-grade-identity.ts` and the `approach` line in
`src/arena-deployment-briefing.ts`.

Three images were re-rolled this pass after visual review:
`gun-range` (first attempt produced a bare concrete corridor with no lanes or
targets), `rustworks` (fog-washed, low contrast) and `farcrysis` (the model read
"from a helicopter" literally and framed the shot through a black cockpit window,
which would have fought any UI overlay — the prompt now asks for an unobstructed
full-frame aerial and explicitly negates window/border/vignette).

## wiringNotes (runtime wiring — deliberately NOT done here; no src/ files touched)

1. **Skin cards** — `src/ui/operator-skin-portrait.ts` `operatorSkinPortraitSvg()`
   returns the palette-only drawn SVG that the OPERATOR panel in
   `src/ui/pass64-shell.ts` (`<section class="operator-group">`, SKIN group)
   renders. Wire each selectable skin's card to
   `./assets/original/skin-cards/${skinId}-card.webp` (same relative-URL style as
   `src/ui/menu-preview-video.ts`, whose `ROOT` is `'./assets/original/menu-previews'`),
   keeping the existing drawn SVG as the load-failure fallback so an unpainted
   skin can never regress to grey.
2. **Deployment loading backdrops** — `src/legacy-main.ts:1363` holds
   `deploymentTransitionPoster` (an `HTMLImageElement`, `#deployment-transition-poster`),
   whose `.src` is currently set from the menu preview poster at
   `src/legacy-main.ts:14799`. Point it instead at
   `./assets/original/loading/${arenaId === 'rustworks-1v1' ? 'rustworks' : arenaId}-loading.webp`,
   behind the existing briefing copy; keep the preview poster as fallback.
   Note the id/filename mismatch: arena id `rustworks-1v1`, file stem `rustworks`.
3. **Main menu backdrop** — wire the menu root surface's background to
   `./assets/original/menu/main-menu-backdrop.webp` (dark, low-contrast
   foreground authored so HUD/menu text stays readable; the sky band upper-left
   is the calm negative space for the title block).
4. Cache-bust with the same `?v=` key pattern `menu-preview-video.ts` already
   uses if these files are ever regenerated in place.

## Gotcha — provenance hashes and line endings

- **Symptom:** `npm run verify:provenance` would have failed on every Lane I
  record with `expected <hash>, got <hash>` for `lane-i.provenance.json`, while
  `npm run qa:asset-provenance` passed on the same file.
- **Cause:** the repo has two provenance verifiers with different hashing rules.
  `scripts/qa/verify-asset-provenance.mjs` normalises CRLF to LF before hashing
  text extensions (`.json`, `.py`, `.mjs`, ...); `scripts/qa/verify-public-asset-provenance.mjs`
  hashes raw bytes. `.gitattributes` pins the tree to `eol=lf` so the two agree —
  but Python's `open(path, "w")` on Windows translates `\n` to `\r\n`, so
  `finalize_lane_i.py` was about to write CRLF JSON whose recorded raw hash could
  never match the normalising verifier. It also would have rewritten the whole of
  `assets.manifest.json` with foreign line endings.
- **Correction:** all three JSON writes in `comfy_generate.py` /
  `finalize_lane_i.py` now pass `newline="\n"` explicitly.
- **Verify:** `npm run verify:provenance` → `{"provenance":"ok","verifiedDigests":141}`,
  and `assets.manifest.json`, `lane-i.provenance.json` and
  `lane-i-generation-receipt.json` all read back as LF.

## Pre-existing gate failure (NOT from this lane — flagged, not touched)

`npm run qa:asset-provenance` is **red at HEAD**, independently of Lane I. Nine
files committed by the pass74/pass75 operator-skin lane are in `public/assets/`
with no `assets.manifest.json` row at all:

```
public/assets/original/models/operators/pass74-operator-skins/pass74-operator-skin-{explorer,symbiote,navalops}-lod{0,1}.glb
public/assets/original/ui/operator-skins/{explorer,symbiote,navalops}-operator-card.webp
```

Confirmed pre-existing: `git show HEAD:assets.manifest.json` contains zero
matches for either path prefix, and all nine files are tracked at HEAD (the glbs
via `src/operator-model.ts:403-412`). Every Lane I hash and declaration verifies —
the uncovered list is the only remaining issue the gate reports.

Two notes for whoever owns that lane:

- The three `ui/operator-skins/*-operator-card.webp` files (6–7 KB each — the
  drawn cards the owner objected to) are referenced from **nowhere** in `src/`;
  they are orphaned. Once wiringNote 1 lands they are superseded by the four
  generated cards and should be deleted rather than given a provenance row.
- Provenance rows for the six pass74 `.glb` files still need to be authored by
  their producer. Lane I deliberately did not write them: claiming provenance for
  assets this lane did not generate would be a fabricated record.

## Regeneration policy

Re-running the batch reproduces the same images only if seeds are unchanged
(seeds are stable hashes of job names; the three re-rolled jobs carry explicit
`"seed"` values — 20260823001 gun-range, 20260823002 rustworks, 20260823003
farcrysis). If a subject is re-generated, `finalize_lane_i.py` recomputes hashes
and replaces the manifest rows, so the provenance gate stays green by construction.
