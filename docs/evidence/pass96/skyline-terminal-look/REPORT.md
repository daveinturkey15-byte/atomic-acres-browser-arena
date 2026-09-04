# Skyline-terminal look pass — evidence report

Branch: `contrib/dave-gaming-pc/claude/skyline-terminal-look`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`465ae6b7`)
Date: 2026-09-04. Machine: `dave-gaming-pc`. Harness: OMP (Muse Spark 1.3).

Brief: the ambient-air fix nuketown2 got, aerial-perspective tuning for the
terminal horizon, albedo variation on the largest flat surfaces via the shared
noise-LUT pattern at uniform strength, emissive signage. No new pipeline.

## Changes (explicit paths)

- `src/particles/particle-catalog.ts` — skyline-terminal motes 0.014 → 0.026 m,
  opacity 0.08 → 0.11 (family ceiling); drift 0.038 → 0.055 m, opacity
  0.10 → 0.15 (ceiling 0.16). Densities byte-identical (0.62 / 0.42).
- `src/particles/ambient-visibility.test.ts` — new terminal-only visibility
  block (motes/drift floor + density pins); MEASURED comment updated
  (terminal 1.20 → 2.23 px; nine of eleven arenas remain sub-pixel, OPEN).
- `src/terminal-albedo-lut.ts` (new) — tileable CPU value-noise table
  re-implementing the `noise-lut.ts` pattern from
  `origin/contrib/dave-gaming-pc/claude/perf-hitl5` for a canvas consumer,
  plus `TERMINAL_ALBEDO_VARIATION_STRENGTH = 0.07`.
- `src/additional-maps.ts` — metre-scale albedo drift baked into
  terrazzo/concrete/panel canvas textures; `userData.terminalAlbedoVariation`
  pinned on those materials; emissive crowns on both hero signs
  (`skyline-terminal-main-sign-crown`, `skyline-flight-display-crown`,
  practicalMat, terminal-story cluster, performance detail).
- `src/skyline-terminal-look.test.ts` (new) — strength pin, multiplier bounds,
  material pins, crown pins, aerial horizon bounds, LUT determinism/tiling.
- `docs/threejs-knowledge/r185/skyline-terminal-look-ours.md` (new) — recipe.

## Claim states

- VERIFIED — terminal motes subtend 2.23 px ≥ 2 px floor at 12 m:
  `src/skyline-terminal-look.test.ts` + `ambient-visibility.test.ts` pass
  (quoted below).
- VERIFIED — no new render pipeline: `screen-space-post.test.ts` and
  `screen-space-post-profile.test.ts` stage pins unchanged and green; the
  albedo work bakes into existing `CanvasTexture`s, the crowns reuse existing
  materials (quoted below).
- VERIFIED — pipeline/draw budget holds with +2 static crown meshes:
  `additional-maps.test.ts` terminal budget assertion green (quoted below).
- VERIFIED — aerial tuning holds at the 120 m terminal horizon in every tier:
  clamped worst case ≤ 0.12, representative blue ≥ 0.04 floor
  (`skyline-terminal-look.test.ts`, quoted below). No tuning constant changed —
  the global curve plus the per-channel clamp already composes with the longer
  horizon; the pin makes regressing it a build failure.
- VERIFIED — `src/legacy-main.ts` untouched (ratchet test green).
- DESIGNED (needs a capture) — the albedo drift and crowns are authored for
  the review cameras (`terminal-overview`, concourse views) but this session
  has no browser/GPU (owner running ComfyUI): no pixel capture taken. The
  canvas overlay is deterministic code covered by unit pins, not by a render.
- OPEN — nine of eleven arenas still have sub-pixel motes (pre-existing,
  recorded in `ambient-visibility.test.ts`, not this lane's scope).

## Luna review TODOs

- TODO: obtain the required native-WebGPU visual capture for skyline terminal in both supported profiles; this review was intentionally no-browser/no-GPU.
- TODO: obtain a quiet-machine frame-time/draw receipt for the bake-time canvas cost and the two static signage crowns; the current estimate is source-derived only.
- TODO: keep the remaining nine sub-pixel arena-mote cases tracked in the existing quality-gap lane; this contribution intentionally changes only terminal.

## Per-frame cost estimate (defended)

- Particles: instance counts identical (densities and capacities unchanged).
  Extra cost is fill only: ~322 live motes × ~5 px² + ~59 drift × ~17 px² ≈
  2,600 px² additive per frame at 720p — under 0.001% of the frame.
- Albedo: baked into canvas textures at arena build (~7 textures × 256
  fillRects, one-time). Per-frame: 0. No new texture upload per frame, no
  shader change.
- Aerial: 0 — no constant changed; the stage already runs in the composite.
- Signage: +2 static meshes sharing an existing material → at most +2 draw
  calls against a 590 budget with headroom (budget test green); no new
  pipeline, no per-frame CPU (static, emissive is a material property).
- In-combat pipeline creations: 0 (no material graph, stage, or target added;
  all textures/materials built at arena construction, inside the existing
  menu-time precompile reach — `cold-session-precompile-reach.test.ts` green).

## Settings registry

No new visual stage was added, so no new settings-registry entry (and no off
switch) was needed. Reusing the existing `volumetricQuality` tier for the
aerial stage and baking everything else into authored assets keeps the
control set fingerprint — and `graphics-profile-contract.test.ts` — untouched.

## Gate outputs (quoted)

`npx tsc --noEmit`:
```
(no output — clean)
TSC_DONE:0
```

`npx vitest run src/graphics-profile-contract.test.ts
src/rendering/cold-session-precompile-reach.test.ts src/pipeline-metrics.test.ts
src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts
src/skyline-terminal-look.test.ts src/particles/ambient-visibility.test.ts
src/particles/particle-catalog.test.ts
src/rendering/atmosphere/aerial-perspective.test.ts`:
```
 Test Files  9 passed (9)
      Tests  114 passed (114)
```

`npx vitest run src/additional-maps.test.ts
src/rendering/screen-space-post.test.ts
src/rendering/screen-space-post-profile.test.ts
src/nuketown2-pipeline-budget.test.ts
src/farcrysis-webgpu-pipeline-budget.test.ts`:
```
 Test Files  5 passed (5)
      Tests  78 passed (78)
```

`npx vitest run src/skyline-terminal-look.test.ts
src/particles/ambient-visibility.test.ts` (first green, before the full suite):
```
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

Baseline before the change (same files, pre-edit): ambient/aerial/cold-session
3 files, 31 tests passed; `additional-maps.test.ts`, 37 tests passed.

## Upstream consultation (HF-481)

- Installed version checked: `three@0.185.1` (`package.json`), matching the
  AGENTS.md pin — no API copied from HEAD.
- r185 recipes read with `git show` from
  `origin/contrib/dave-gaming-pc/claude/r185-techniques`:
  `docs/threejs-knowledge/r185/INDEX.md` (ranked lanes; terminal-relevant:
  ground-projected environment #4, already shipped for terminal in
  `cd0eec06`). No new Three.js API used by this pass, so no further upstream
  lookup was needed.
- `docs/threejs-knowledge/upstream/llms-full.txt` is absent on this base
  branch (no `docs/threejs-knowledge/` directory); not re-fetched — nothing
  in this pass depends on a doc lookup.
- Poimandres docs MCP: mounted in this session (`get_example`,
  `get_page_content`), but untouched — this pass uses no R3F/Drei/ecosystem
  API. Per the source-priority falsifier, the MCP route is reported, not
  claimed.
- HF-472: studied `noise-lut.ts` via `git show`, re-implemented the pattern
  for a new consumer; no code vendored.
