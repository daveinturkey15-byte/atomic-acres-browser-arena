# Pass 43 — Rustworks Quality textured plant

Date: 2026-07-21  
Branch: `overhaul/pass43-rustworks-quality-assets`  
Status: source complete — not yet promoted to public `gh-pages`

## What changed

### Real Quality assets (not box cosmetics)
- Generated original industrial PBR sets under `public/assets/original/textures/rustworks-*.png` (+ normal/roughness).
- Regenerated Blender/GLB kit:
  - `source-assets/blender/rustworks-central-tower.blend`
  - `public/assets/original/models/rustworks-central-tower.glb` (~**3.87 MB**, was ~0.17 MB)
- Asset version **`pass43-v1`**, ~159 authored parts, embedded textures (no external URIs).
- Solid textured decks, legs, grate, hazard rails, crane, yard tanks/crates, hardstand.
- Upper deck utilities pushed to **opposite corners** so the centre walk ring stays open.
- Ship-ladder / ramp openings keep split rails clear of the climb path.

### Runtime wiring
- Quality Graphics loads the authored kit and **hides duplicated procedural presentation** (keeps dirt ray target + work lights).
- Performance keeps procedural playable core.
- Tri-Pass missile/marker GPU resources are pooled (no per-impact geometry dispose hitch).
- Tri-Pass map still shows live hostiles / YOU / snap-to-blip from Pass 42.

## How to view
1. Graphics: **QUALITY GRAPHICS**
2. Map: **RUSTWORKS**
3. Reload after deploy (asset is large).

## Verify
- `npx tsc --noEmit`
- `npm run build`
- Vitest: rustworks-blender, additional-maps, field-support, atmosphere, map-selection, rustworks-quality
- Rebuild authoring:
  - `python3 scripts/generate-rustworks-pbr.py`
  - `blender --background --python scripts/blender/create-rustworks-central-tower.py`
