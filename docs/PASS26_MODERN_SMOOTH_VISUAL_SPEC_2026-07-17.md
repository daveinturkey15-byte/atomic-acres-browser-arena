---
title: Pass 26 Modern Smooth Visual Refresh
status: verified
owner: Dave / Jigglyclaw
date: 2026-07-17
baseline: 4eeedc23181871896b286e2b0645dbbba6db6d96
---

# Pass 26 Modern Smooth Visual Refresh

## Overview

Modernize Atomic Acres' original compact tactical-suburb presentation toward a contemporary browser FPS while preserving the deterministic Pass 25A gameplay contract and smooth frame pacing. Commercial early-2010s FPS maps are cadence/readability references only; no geometry, assets, names, UI, audio, or extracted data may be copied.

## Requirements

- **R1 — Profiles:** The player-facing selector contains exactly `PERFORMANCE` and `BLENDER RENDER`. `compat` remains query-only for diagnostics. Legacy `quality` query/storage values migrate to `blender` rather than reintroducing a third public profile.
- **R2 — FPS HUD:** A low-overhead FPS counter is visible in the top-right during play and derives from the existing bounded frame-pacing sampler.
- **R3 — Smooth rotating map:** The player-up minimap rotates continuously from raw yaw, not a rounded integer heading, and redraws at render cadence rather than the 10 Hz general-HUD gate. The textual heading may remain integer degrees.
- **R4 — Modern Blender presentation:** Improve project-original materials/textures and environmental detailing through deterministic local authoring. Prefer PBR normal/roughness response, bounded detail, and authored landmarks over post-processing.
- **R5 — Smoothness:** Retain adaptive pixel-ratio scaling and bounded draw calls. Performance mode must not load the Blender GLB. No post-processing stack is added.
- **R6 — Gameplay freeze:** Preserve canonical gameplay constants, Rapier controller settings, movement traces, shot schedules, damage, reload/switch timings, networking, collision authority, map bounds, and all six semantic breakable-window bindings.
- **R7 — Provenance:** New/changed visual assets remain project-original, local, deterministic, manifest-covered, and release-tree verified.

## Acceptance checks

- **C1:** Golden gameplay replay SHA-256 remains unchanged and `npm run verify:gameplay-contract` passes after the approved rendering-only removal of the Quality profile.
- **C2:** Render-profile and adaptive-quality tests prove only Performance/Blender are player profiles and legacy Quality migrates to Blender.
- **C3:** Minimap unit tests prove sub-degree yaw changes alter player-up rotation continuously; browser telemetry proves minimap redraw count tracks rendered frames within one frame.
- **C4:** Browser test proves the top-right FPS counter is visible and numeric during a solo match.
- **C5:** Blender asset audit proves PBR texture bindings, six semantic windows, no external URIs, and bounded triangles/materials/draw calls.
- **C6:** `npm run lint`, `npm test`, `npm run build`, `npm run verify:release-tree`, and dependency audit pass.
- **C7:** Bounded Chromium checks cover Performance and Blender Render with no page/console errors and frame-pacing telemetry captured.
- **C8:** Visual screenshots are reviewed from the exact tested build; canonical Pages is not changed without explicit promotion approval.

## Out of scope

- Copying or recreating any Black Ops/Nuketown map, asset, texture, logo, UI, sound, or name.
- Combat rebalance, weapon timing changes, bot balance, network protocol changes, new map bounds, or new collision authority.
- WebGPU migration, post-processing, public deployment, or dependence on external generative assets.

## Decisions

- Interpret “map rotate smooth” as smoothing the rotating player-up minimap. Mouse aim remains raw and low-latency; smoothing camera input would add lag and alter approved feel.
- Preserve the internal `blender` value and query-only `compat` profile.
- Use the existing `FramePacingSampler` for the FPS HUD rather than a second timing loop.

## Verification record

- `npm run lint`: pass.
- `npm run verify:gameplay-contract`: pass; golden replay SHA-256 unchanged.
- `npm test`: 205/205 pass across 43 files.
- `npm run build`: pass.
- `npm run verify:release-tree`: 44 files, zero rejected and zero oversized.
- `npm audit --omit=dev`: zero vulnerabilities.
- `node scripts/qa/verify-pass26-fps.mjs`: numeric FPS, 24 px right gap, 16 px top.
- Eight bounded E2E groups: pass across Chromium, headed Chromium, headed Firefox and WebKit.
- Two grouped software-WebGL cases reported a green retry under severe compositor throttling; both passed focused with `--retries=0`.
- Deterministic PBR and GLB regeneration: byte-identical.
- Exact runtime screenshot: corrected grass repetition, no PBR artifact, no HUD overlap.
- Focused Performance browser verification proves minimap redraw cadence tracks render cadence while retaining the top-right FPS counter.

## Release boundary

No public deployment or canonical Pages promotion is included in Pass 26; owner visual/feel approval is required first.
