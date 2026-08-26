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
