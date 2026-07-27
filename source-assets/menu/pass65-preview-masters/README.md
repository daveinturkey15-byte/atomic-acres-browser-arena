# Pass 65 prerecorded menu previews

These files are the editable source boundary for the four map-selection previews. The browser must play the compressed media in `public/assets/original/menu-previews`; it must never construct an arena, run preview physics, compile a gameplay pipeline, or submit gameplay frames while maps are browsed.

## Canonical inputs

- `choreography.json` is the machine-readable timing, seed, path, FOV, safe-volume, anatomy, audio-profile, poster, and deterministic-review contract.
- `media.cacheKey` must change whenever accepted runtime bytes change, preventing a published browser cache from retaining the superseded preview family.
- `generate_pass65_menu_previews.py` builds each `.blend` master from project-original geometry and the authored Chopper Gunner LOD0 source. It uses no downloaded model, texture, video, sampled audio, logo, or extracted game asset.
- The three helicopter masters contain the authored three-dimensional cockpit, cyan/green instruments, canopy glass, exact-loop first-person rotor, exact-loop instrument motion, paired instrument bounce lights, and bounded seeded hold/blend flight corrections.
- The Gun Range master contains authored non-primitive ear shells, pinnae, tufts, forelegs, palms, four toes and pads per paw, procedural fur micro-colour/bump, alternating expressive beats, moving illuminated targets, and a compact exact-loop path.

The old byte-identical Gun Range gate is intentionally superseded by HF-011/R114. Its prior digests remain recorded under `provenance.json.supersedes`; they are history, not accepted current bytes.

## Authoring and verification

From the repository root, with Blender 5.1 and ffmpeg on `PATH`:

```powershell
$env:AA_PREVIEW_VALIDATE_ONLY='1'
npm run finalize:pass65:menu-previews
Remove-Item Env:AA_PREVIEW_VALIDATE_ONLY -ErrorAction SilentlyContinue

$env:AA_PREVIEW_SAVE_ONLY='1'
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/assets/generate_pass65_menu_previews.py

Remove-Item Env:AA_PREVIEW_SAVE_ONLY -ErrorAction SilentlyContinue
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/assets/generate_pass65_menu_previews.py

npm run finalize:pass65:menu-previews
npm run qa:pass65:menu-previews
```

Use `AA_PREVIEW_ARENAS` for a comma-separated subset, `AA_PREVIEW_STILL_FRAME` for one staged still, or `AA_PREVIEW_STILL_FRAMES=1,48,96,144,192` for the deterministic review set. With those five frames rendered for every arena, set `$env:AA_PREVIEW_REVIEW_ONLY='1'` and run `npm run finalize:pass65:menu-previews` to generate contact sheets without transcoding or touching provenance. Intermediate PNG frames live under ignored `artifacts/pass65/menu-preview-master-frames` and are never committed.

The finalizer requires exactly 192 frames per arena, creates distinct VP9/Opus WebM and H.264/AAC MP4 loops, extracts the reviewed poster frame, generates five-frame contact sheets under `docs/assets/pass65-menu-previews`, records current digests, and updates `assets.manifest.json`. The canonical recipe also fail-closes each video to 300–1100 kbps and 1.1 MB, each poster to 80 KB, and each review sheet to 120 KB so a visual upgrade cannot silently regress menu loading. Do not edit generated digests by hand.

The production gate fails closed on:

- recipe/source/runtime/review inventory or digest drift;
- wrong codec, dimensions, frame count, duration, bitrate/byte budget, quiet-audible audio bounds, static footage, or a visible loop seam;
- camera/FOV/safe-volume/comfort-bound violations;
- missing authored LOD0 cockpit semantics, 3D depth, cyan/green/glass signals, instrument motion/lights, or review-frame rotor visibility;
- missing cat anatomy/material/fur signals, primitive-sphere stand-ins, or unsafe review-frustum composition;
- any browser import of the offline camera evaluator, live preview canvas, arena construction, or gameplay renderer submission;
- missing reduced-motion poster-only behavior or rapid-switch generation ownership.

Every Blender Python invocation must include `--python-exit-code 1`. Blender 5.1 can otherwise report process status 0 after an unhandled Python exception. Process status is still not accepted as render proof: the finalizer requires the exact `frame-0001.png` through `frame-0192.png` roster for every arena, and the production gate independently opens and audits each saved master.

Passing automation creates only a HITL candidate. Owner visual approval of the immutable candidate remains mandatory before publication.
