# Pass 66 prerecorded menu previews

These files are the editable source boundary for the four map-selection previews. The browser must play the compressed media in `public/assets/original/menu-previews`; it must never construct an arena, run preview physics, compile a gameplay pipeline, or submit gameplay frames while maps are browsed.

## Canonical inputs

- `choreography.json` is the machine-readable timing, seed, path, FOV, safe-volume, anatomy, audio-profile, poster, and deterministic-review contract.
- `media.cacheKey` must change whenever accepted runtime bytes change. `cache-family-lock.json` is append-only: every retained key is bound to the aggregate digest, file count, and byte count of all twelve final runtime media files, so a key can never be silently reused for different bytes. The pre-integration `pass66-runtime-preview-v1` trial exposed host-scheduler-dependent libx264 output and remains retained only as rejected history; `pass66-runtime-preview-v2` fixed x264 video and AAC audio to one thread. `pass66-runtime-preview-v3` remains immutable evidence for its earlier Version 66 runtime closure. `pass66-runtime-preview-v4` is the required fresh family for the current source closure: it starts unused, and the finalizer may append its first lock record only after a real full hardware-WebGPU capture and deterministic transcode produce its digest, file count, and byte count.
- `scripts/assets/generate-pass65-runtime-menu-previews.ts` opens each selected production arena through the same WebGPU runtime and arena-streaming boundary used by gameplay, then captures the deterministic camera recipe offline. It does not synthesize, approximate, or rebuild map geometry.
- Canonical per-arena asset dependencies are derived from `ARENA_VISUAL_REGISTRY`; a recursive, deterministic manifest covers all regular files under `src` and `public/assets/original` plus declared shared arena assets. Generated menu-preview outputs are the only excluded subtree. Any included source or asset mutation invalidates the capture receipt.
- The three helicopter captures bake a compact original cockpit/HUD treatment over the real arena footage. Three transparent elliptic motion arcs communicate the foreshortened rotor disc while four deliberately subdued tapered spokes and two restrained trails preserve mechanical cadence without the rejected flat crossed-card look. A dimensional mast/hub and two visible ties connect the canopy header to both side rails. The receipt measures arc span, blade span, overlap, browser-sampled occlusion and bounded pose response. The lower instrument pack is compact graphite with restrained green/cyan signals; the selected arena and centre sightline remain dominant.
- The Gun Range capture bakes compact black/grey ears and top-facing paws over the real moving-target range. The smaller anatomy framing avoids the former shoe-like soles, and the camera remains on the canonical comfortable loop.
- These overlays exist only in the offline authoring page. Loading and menu browsing still play prerecorded compressed media and never construct an arena or submit a gameplay frame.

The old byte-identical Gun Range gate is intentionally superseded by HF-011/R114. Its prior digests remain recorded under `provenance.json.supersedes`; they are history, not accepted current bytes. HF-128 rejects both the earlier tiny-star treatment and the later oversized crossed-card treatment; the rotor-only verifier retains negative mutations for missing arcs, filled discs, flat projection, disconnected structure and excessive alpha.

## Authoring and verification

From the repository root, with installed Google Chrome and ffmpeg on `PATH`:

```powershell
$env:AA_PREVIEW_VALIDATE_ONLY='1'
npm run finalize:pass65:menu-previews
Remove-Item Env:AA_PREVIEW_VALIDATE_ONLY -ErrorAction SilentlyContinue

npm run qa:pass65:menu-rotor
npm run author:pass65:menu-previews

npm run finalize:pass65:menu-previews
npm run qa:pass65:menu-previews
```

Use `AA_PREVIEW_ARENAS` for a comma-separated subset, `AA_PREVIEW_STILL_FRAME` for one staged still, or `AA_PREVIEW_STILL_FRAMES=1,60,120,180,240` for the deterministic review set. Set `AA_PREVIEW_REVIEW_ONLY=1` during a partial generator run so its receipt stays under ignored review artifacts and cannot replace the canonical full-capture receipt. The authoring command fails unless the runtime reports real WebGPU, exactly one selected arena was constructed, and that arena is the requested actual authoritative map. Helicopter frames additionally require an 82% x 20% transparent stage, exactly three wide elliptic motion arcs, four low-alpha tapered spokes, at least two 300-pixel projected blades, at least 760 pixels of combined sweep, at least 700 pixels of arc span, exactly two temporal trails, measured and sampled hub/mast/header occlusion, two connected header-to-side-rail ties, bounded pose response, a clear reticle and a tail camera above the rotor layer. With those five frames captured for every arena, keep `AA_PREVIEW_REVIEW_ONLY=1` and run `npm run finalize:pass65:menu-previews` to generate contact sheets without transcoding or touching provenance. Intermediate PNG frames live under ignored `artifacts/pass65/menu-preview-master-frames` and are never committed.

The generator binds every ordered staged PNG into one per-arena all-frame-set digest. Before any transcode, the finalizer recomputes all four digests and directly verifies each declared review-frame hash. It then transcodes into a temporary directory, computes the aggregate final-media digest, rejects cache-key reuse before touching runtime media, creates distinct VP9/Opus WebM and H.264/AAC MP4 loops with two-second keyframe intervals, extracts the reviewed poster frame, generates five-frame contact sheets under `docs/assets/pass65-menu-previews`, records current digests, and updates `assets.manifest.json`. The H.264/AAC path fixes encoder threads so repeated finalizations produce identical bytes; the append-only cache-family gate is the enforcement boundary. Pass 66 raises the masters to 1280x720 at 30 FPS while fail-closing each video to 450–1600 kbps and 1.7 MB, each poster to 120 KB, and each review sheet to 220 KB. The runtime still admits one selected decoder only, uses metadata preload, and retains a static poster for reduced motion. The accepted cockpit evidence digest is recomputed from its declared file; do not edit generated digests by hand.

The production gate fails closed on:

- recipe/source/runtime/review inventory, canonical dependency-closure, staged frame-set, cockpit-evidence, cache-family lock, or digest drift;
- wrong codec, dimensions, frame count, duration, bitrate/byte budget, quiet-audible audio bounds, static footage, or a visible loop seam;
- camera/FOV/safe-volume/comfort-bound violations;
- any capture receipt that does not prove WebGPU, one selected authoritative runtime arena, current source hashes, and the canonical offline overlay scale/palette;
- missing compact graphite/green helicopter cockpit or cat ear/paw overlay markers, the legacy tiny-star or flat crossed-card treatment, missing elliptic arcs, fewer than two long legible blade sweeps, insufficient arc/sweep span, excessive spoke alpha, missing dual temporal trails, floating/non-occluding hub/header structure, missing or disconnected header-to-side-rail ties, declared-only rather than sampled occlusion, out-of-bounds pose response, tail-camera/reticle obstruction, an oversized stage, or any filled/full-disc main-rotor surface;
- any browser import of the offline camera evaluator, live preview canvas, arena construction, or gameplay renderer submission;
- missing reduced-motion poster-only behavior or rapid-switch generation ownership.

Process status alone is not accepted as capture proof: the generator writes a fail-closed runtime receipt with canonical visual dependencies, a full recursive input tree, and four ordered frame-set digests; the finalizer requires the exact `frame-0001.png` through `frame-0240.png` roster for every arena; and the production gate independently recomputes the dependency tree and final-media family while checking the receipt, media structure, decode, motion, and loop seam.

Passing automation creates only a HITL candidate. Owner visual approval of the immutable candidate remains mandatory before publication.
