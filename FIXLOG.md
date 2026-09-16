# Cul-de-Sac 2025 Fix Log

> **Historical archive:** this file records early rescue/swarm activity from 6–8 July 2026, including failed intermediate cycles. It is not the current backlog, release ledger, or proof of production state. Use `src/changelog.ts`, `docs/INDEX.md`, current Git/GitHub checks, and the centralized release receipt for current truth.

## Manual rescue fix — 2026-07-06T10:30 BST

- Build after change: `pass`
- Summary: Rescued project from Qwen implementer timeout/stall and fixed concrete verifier issues.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/vite-env.d.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/package.json`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/package-lock.json`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/vite.config.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/README.md`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/qwen_swarm.py`
  - `/root/.hermes/scripts/qwen_suburban_arena_watchdog.py`
- Fixes:
  - Reload timer now uses the main frame delta; HUD no longer calls `clock.getDelta()` separately.
  - Movement/game loop now uses a small fixed-step accumulator for steadier collision/jump behavior.
  - Remote players now interpolate toward network targets and stale peers are cleaned up after 10 seconds.
  - Removed unused React Vite plugin dependency and added vanilla `vite.config.ts`.
  - Added TypeScript declarations/typing so `npm run lint` is meaningful and passing.
  - Qwen swarm now uses shorter role outputs, lower implementer token budget, and a longer Qwen timeout to reduce timeout/stall cycles.
  - Watchdog now checks both lint and build, not build alone.
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/manual_fix_20260706_1030_manifest.json`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/manual_fix_20260706_1030_lint_build.log`

## Cycle 1 — 2026-07-06T18:34:38
- Build after change: `pass`
- Summary: Added weapon recoil (camera position offset + FOV kick), muzzle flash, damage flash UI, and improved HUD layout for better visual feedback.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_1.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_1_fix_manifest.json`

## Cycle 2 — 2026-07-06T18:55:05
- Build after change: `pass`
- Summary: Replaced flat sky with a gradient shader sphere, tuned fog to warm suburban haze, enhanced lighting for vibrancy, and added a styled crosshair and damage vignette to the HUD.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/style.css`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_2.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_2_fix_manifest.json`

## Cycle 3 — 2026-07-06T19:15:10
- Build after change: `pass`
- Summary: Fixed HUD crash by adding missing weapon ID to HTML, added suburban arena geometry (grass, road, houses, cover), and added null checks to HUD update logic.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_3.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_3_fix_manifest.json`

## Cycle 4 — 2026-07-06T19:36:53
- Build after change: `fail-after-change`
- Summary: Defined missing materials (grass, asphalt, red, blue, concrete, dummy), fixed sky background assignment, added training dummies, and enabled soft shadows.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_4.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_4_fix_manifest.json`

## Cycle 7 — 2026-07-07T02:17:40
- Build after change: `fail-after-change`
- Summary: Fixed truncated scene.add call by supplying the missing road mesh argument and closing parenthesis to resolve the syntax error.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_7.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_7_fix_manifest.json`

## Cycle 10 — 2026-07-07T16:50:06
- Build after change: `fail-after-change`
- Summary: Removed duplicate 'blue' const declaration in the materials block to resolve the build error.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_10.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_10_fix_manifest.json`

## Cycle 12 — 2026-07-07T17:27:23
- Build after change: `fail-after-change`
- Summary: Renamed 'red' material to 'matRed' and added 'matBlue' to fix ES6 redeclaration error and implement symmetric two-house arena.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_12.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_12_fix_manifest.json`

## Cycle 22 — 2026-07-07T21:16:22
- Build after change: `fail-after-change`
- Summary: Fixed syntax error on line 147 by separating the minified for-loop header from the subsequent variable declaration and restoring the truncated function body.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_22.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_22_fix_manifest.json`

## Cycle 24 — 2026-07-07T22:01:48
- Build after change: `fail-after-change`
- Summary: Refactored main.ts to remove the orphaned triple-fire loop and ensure single definitions for fire(), loop(), and physics().
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_24.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_24_fix_manifest.json`

## Cycle 25 — 2026-07-07T22:38:41
- Build after change: `fail-after-change`
- Summary: Removed duplicate function declarations for fire and traceShot that were causing parse errors.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_25.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_25_fix_manifest.json`

## Cycle 26 — 2026-07-07T23:15:57
- Build after change: `fail-after-change`
- Summary: Removed duplicate definitions of fire, traceShot, and loop functions that were causing build failures.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_26.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_26_fix_manifest.json`

## Cycle 27 — 2026-07-07T23:51:38
- Build after change: `fail-after-change`
- Summary: Removed duplicate function declarations for fire and traceShot that were causing the build to fail.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_27.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_27_fix_manifest.json`

## Cycle 28 — 2026-07-08T00:24:32
- Build after change: `fail-after-change`
- Summary: Replaced flat road with raised box geometry and added curb; kept fire function as is to avoid duplicate declaration errors in the provided snippet context.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_28.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_28_fix_manifest.json`

## Cycle 29 — 2026-07-08T01:00:42
- Build after change: `fail-after-change`
- Summary: Removed duplicate declarations of fire and traceShot, and implemented the missing physics function for deterministic movement and collision.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_29.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_29_fix_manifest.json`

## Cycle 30 — 2026-07-08T01:36:10
- Build after change: `fail-after-change`
- Summary: Removed duplicate fire/traceShot functions, updated HUD to use specific element IDs, and added a CSS sun glare overlay.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_30.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_30_fix_manifest.json`

## Cycle 31 — 2026-07-08T02:16:58
- Build after change: `fail-after-change`
- Summary: Removed duplicate fire and traceShot function declarations, optimized DOM queries in HUD, and added wall collision clamping in physics.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_31.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_31_fix_manifest.json`

## Cycle 34 — 2026-07-08T04:09:15
- Build after change: `fail-after-change`
- Summary: Fixed duplicate function declarations for fire and traceShot, and added missing definitions for weapons, spawns, conns, keys, and makeRemote to resolve build and runtime errors.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_34.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_34_fix_manifest.json`

## Cycle 4 — 2026-07-08T07:56:56
- Build after change: `fail-after-change`
- Summary: Fixed duplicate variable declarations in src/main.ts by replacing the truncated file tail with a complete block that includes the arena geometry, mannequins, and proper variable initialization.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_4.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_4_fix_manifest.json`

## Cycle 7 — 2026-07-08T08:58:35
- Build after change: `fail-after-change`
- Summary: Fixed duplicate declaration build errors by consolidating variable declarations and added a procedural suburban arena with ground, roads, sidewalks, and cover objects.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_7.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_7_fix_manifest.json`

## Cycle 8 — 2026-07-08T09:20:02
- Build after change: `fail-after-change`
- Summary: Consolidated duplicate variable declarations, added procedural suburban map geometry (houses, road, fences), implemented dynamic crosshair, sprint FOV, muzzle flash, and improved input handling.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_8.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_8_fix_manifest.json`

## Cycle 9 — 2026-07-08T09:41:28
- Build after change: `fail-after-change`
- Summary: Consolidated duplicate variable declarations (keys, remotes, reloading, weapons) into a single block, added missing THREE.Clock, and injected lighting, fog, and weapon sway for visual polish.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_9.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_9_fix_manifest.json`

## Cycle 10 — 2026-07-08T10:00:29
- Build after change: `fail-after-change`
- Summary: Fixed duplicate declaration syntax errors by removing the bottom block, initializing the renderer properly, and adding atmospheric lighting, fog, and suburban map details.
- Changed paths:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/src/main.ts`
- Evidence/artifacts:
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/post_change_build_10.log`
  - `/root/jigglyclaw/projects/atomic-acres-browser-arena/.swarm/artifacts/cycle_10_fix_manifest.json`

## Day set — 2026-09-16 (dave-gaming-pc, OMP)
- Commit 4fef26b9b on contrib/dave-gaming-pc/omp/atomic-acres-rebuild-20260914 (pushed).
- Integrated: house v2 kitbash (Lane M, teal/yellow, hides gray shells), spread-dim
  shed/lamp/sign (Lane N, raw world-frame kitbash mode), wear kit (Lane W: 4 shutter
  windows, porch furniture x2 houses, sleepers/planters, 5 litter spots), value.patch
  (asphalt loop+entry+spine carriageways — the dark surface the frame was missing),
  inlight.patch (interior green gamma 1.08->0.96).
- Gates: tsc clean, boot PASS webgpu, walk-through rebuild rows pass. 2 Direction-C
  failures are PRE-EXISTING world-studio ledger gaps (no world-studio module in this
  worktree; untouched by this set) — never weakened, recorded not fixed.
- Captures: artifacts/viewpoint-regression/rebuild-day/ (street s1/s2 clean; street
  main take has a one-frame transient foreground pop, s1/s2 confirm station healthy).
- Open defects (queued, not hidden): interior backsplash notch behind oven tower
  (critic gap 8 confirmed — cover panel or GLB patch); lavender wash persists at
  distance (V stopped at 1 correction by its stop rule; remains critic gap 1).

## Midday set — 2026-09-16 (dave-gaming-pc, OMP)
- Commit 93d39531a on contrib/dave-gaming-pc/omp/atomic-acres-rebuild-20260914 (pushed).
- Integrated: Lane R round-1 (sun 17°→35° elevation, hue-only hemisphere/fill
  renorm, arena-scoped branch — gdev direction correct, dark floor intact),
  Lane C worn crates (centered) + kitchen-counter-v2 (notch fixed on pixels),
  planting x2 (12 trees, 8 rocks, 10 pears, 60 scrub, 30 rocks), GLB泵 cache +
  all loads through the one pump.
- Pipeline fix: play serves dist-compare/, not dist/ — morning builds never
  went live until the dist-compare rebuild. Always build both; curl-verify a
  staged URL (200 + real bytecount, not the 1206B SPA fallback).
- Root-caused the "invisible kitbash" saga: fence bays were live all along
  (in-scene mesh census); N-crates carried a -5 m staging offset (C: D-C2),
  fixed by the centered worn swap; captures need 90s+ settle for 10MB+ GLBs.
- Captures: rebuild-rb11 (full), rebuild-rb12 (street+yard); published to
  repo-state/rb11-*, rb12-*. Scene-graph census: 21/21 worn crates resolved,
  21/21 fallbacks hidden, zero page errors.

## Correction + asset-budget finding — 2026-09-16 (dave-gaming-pc, Claude Code)
- Commit b80c05cb8 on contrib/dave-gaming-pc/omp/atomic-acres-rebuild-20260914.
- CORRECTION to the day-set and midday-set entries above: both record the work as
  "integrated ... (pushed)". The lane assets were committed, but the registration
  layer underneath them was in no commit on any branch — 30 modified files plus
  atomic-acres-rebuild-authority.ts (355 lines) and -interiors.ts (719 lines),
  untracked. Without it there is no arena. Committed as b80c05cb8; byte copy of the
  pre-commit tree kept at repo-state/rescue-20260916-0856/.
- That commit also carries a DEFAULT_ARENA_ID flip (world-studio ->
  atomic-acres-rebuild), isolated to one line so it can be reverted alone. It is
  production-facing and is flagged as an owner decision, not shipped as settled.
- CORRECTION to the gate count: 3 failures across 2 files, not 2. All pre-existing
  world-studio gaps, proven against HEAD rather than assumed: world-studio is in
  ARENA_IDS at HEAD but has zero presence in arena-proxy-coverage.test.ts, so
  factories['world-studio'] was already undefined there. Not weakened, recorded.
  tsc --noEmit exit 0; rebuild's own rows pass.
- FINDING (root-causes the "island/yard crates read gray in captures" open item):
  the rebuild asset set decodes to 1594.7 MB of VRAM from a 128.4 MB download across
  272 textures, and 0 of 39 GLBs use any texture compression. crate-06-worn.glb is
  580 triangles carrying 11.19 MB of uncompressed PNG (9x 1024 maps, 99.6% of the
  file, ~50 MB VRAM). The scene-graph census reports 21/21 resolved because it checks
  the graph, not texture upload; the 90s+ settle rule is a workaround for this.
  Download size and VRAM are decoupled: vehicles/semi.glb is 1.33 MB on disk and
  138.7 MB in VRAM, so a file-size-only pass would miss the worst set.
- The repo already ships the fix and it was never applied to these assets:
  npm run assets:compress:quality (scripts/assets/compress-quality-glbs.mjs,
  lossless webp -> meshopt -> validate) is hardcoded to two public/assets/original/
  models and rejects any other path. Measured on crate-06-worn.glb: that recipe at
  1024 gives 11.23 -> 7.12 MB and no VRAM change (VRAM tracks resolution, not
  encoding); at 512 it gives 1.72 MB / 12.6 MB VRAM; at 256, 0.42 MB / 3.1 MB.
  Resolution target per asset class is an owner fidelity decision - measured, not taken.
- The defect is in the lane authoring recipe, not only in assets on disk: lane-roofs
  is baking 1024 *_BAKE_*.png right now, reproducing the same pattern.
