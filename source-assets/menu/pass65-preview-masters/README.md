# Pass 65 prerecorded menu previews

These files are the editable source boundary for the four map-selection previews. The browser must play the compressed media in `public/assets/original/menu-previews`; it must never construct an arena, run preview physics, compile a gameplay pipeline, or submit gameplay frames while maps are browsed.

## Canonical inputs

- `choreography.json` is the machine-readable timing, seed, path, FOV, safe-volume, anatomy, audio-profile, poster, and deterministic-review contract.
- `media.cacheKey` must change whenever accepted runtime bytes change, preventing a published browser cache from retaining the superseded preview family.
- `scripts/assets/generate-pass65-runtime-menu-previews.ts` opens each selected production arena through the same WebGPU runtime and arena-streaming boundary used by gameplay, then captures the deterministic camera recipe offline. It does not synthesize, approximate, or rebuild map geometry.
- The three helicopter captures bake a compact black/grey rotor and cockpit/HUD treatment over the real arena footage. The overlay uses half-scale framing and separated panels so it does not obscure the selected map.
- The Gun Range capture bakes compact black/grey ears and paws over the real moving-target range. The anatomy occupies roughly half the former footprint and the camera remains on the canonical comfortable loop.
- These overlays exist only in the offline authoring page. Loading and menu browsing still play prerecorded compressed media and never construct an arena or submit a gameplay frame.

The old byte-identical Gun Range gate is intentionally superseded by HF-011/R114. Its prior digests remain recorded under `provenance.json.supersedes`; they are history, not accepted current bytes.

## Authoring and verification

From the repository root, with installed Google Chrome and ffmpeg on `PATH`:

```powershell
$env:AA_PREVIEW_VALIDATE_ONLY='1'
npm run finalize:pass65:menu-previews
Remove-Item Env:AA_PREVIEW_VALIDATE_ONLY -ErrorAction SilentlyContinue

npm run author:pass65:menu-previews

npm run finalize:pass65:menu-previews
npm run qa:pass65:menu-previews
```

Use `AA_PREVIEW_ARENAS` for a comma-separated subset, `AA_PREVIEW_STILL_FRAME` for one staged still, or `AA_PREVIEW_STILL_FRAMES=1,48,96,144,192` for the deterministic review set. The authoring command fails unless the runtime reports real WebGPU, exactly one selected arena was constructed, and that arena is the requested actual authoritative map. With those five frames captured for every arena, set `$env:AA_PREVIEW_REVIEW_ONLY='1'` and run `npm run finalize:pass65:menu-previews` to generate contact sheets without transcoding or touching provenance. Intermediate PNG frames live under ignored `artifacts/pass65/menu-preview-master-frames` and are never committed.

The finalizer requires exactly 192 frames per arena, creates distinct VP9/Opus WebM and H.264/AAC MP4 loops, extracts the reviewed poster frame, generates five-frame contact sheets under `docs/assets/pass65-menu-previews`, records current digests, and updates `assets.manifest.json`. The canonical recipe also fail-closes each video to 300–1100 kbps and 1.1 MB, each poster to 80 KB, and each review sheet to 120 KB so a visual upgrade cannot silently regress menu loading. Do not edit generated digests by hand.

The production gate fails closed on:

- recipe/source/runtime/review inventory or digest drift;
- wrong codec, dimensions, frame count, duration, bitrate/byte budget, quiet-audible audio bounds, static footage, or a visible loop seam;
- camera/FOV/safe-volume/comfort-bound violations;
- any capture receipt that does not prove WebGPU, one selected authoritative runtime arena, current source hashes, and the canonical offline overlay scale/palette;
- missing compact black/grey helicopter rotor/cockpit or cat ear/paw overlay markers;
- any browser import of the offline camera evaluator, live preview canvas, arena construction, or gameplay renderer submission;
- missing reduced-motion poster-only behavior or rapid-switch generation ownership.

Process status alone is not accepted as capture proof: the generator writes a fail-closed runtime receipt, the finalizer requires the exact `frame-0001.png` through `frame-0192.png` roster for every arena, and the production gate independently checks the receipt, current runtime source hashes, media structure, motion and loop seam.

Passing automation creates only a HITL candidate. Owner visual approval of the immutable candidate remains mandatory before publication.
