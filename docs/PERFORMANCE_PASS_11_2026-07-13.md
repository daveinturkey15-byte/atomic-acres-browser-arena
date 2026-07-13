# Atomic Acres Pass 11 — Desktop Performance and Render Profiles

Date: 2026-07-13
Branch: `overhaul/performance-pass-11`
Baseline: Pass 10 source/documentation `41b0b73`; canonical Pages `31b638f`

## Trigger

Dave reported that the canonical build felt near 10 FPS and required at least 60 FPS. The former automated performance scenario navigated every browser test to `?render=compat`, so its `>=40 FPS` result did not validate the full-art desktop path.

## Measured cause

The Windows desktop uses an AMD Ryzen 3 4300U integrated Radeon through ANGLE Direct3D 11, but the active MikeTheTech Virtual Display Driver (`11.30.4.434`) reports 1920×1080 at 30 Hz. With ordinary VSync both full and compatibility profiles measured almost exactly 29.9 FPS, proving a display-present ceiling rather than equivalent render cost.

A dedicated Windows Chrome profile was launched with `--disable-frame-rate-limit --disable-gpu-vsync` and measured through raw CDP. This separates actual AMD rendering throughput from the 30 Hz presentation ceiling.

Pass 10 baseline on AMD, unlocked:

- full quality: 57.47 FPS; 571 calls / 341,438 triangles;
- compatibility: 365.90 FPS; 75 calls / 71,934 triangles.

## Pass 11 correction

Three deterministic render profiles now exist:

- `balanced` (default / `?render=balanced`): full authored geometry/materials, antialiasing, DPR capped at 1, 1024 px static sun-shadow cache rendered after art batching, no per-frame whole-arena shadow redraw;
- `quality` (`?render=quality`): full authored geometry/materials and continuously updated 1024 px shadows;
- `compat` (`?render=compat`): the existing reduced representation, flattened compatibility materials, no shadows, and constrained pixel ratio.

Options now exposes `GRAPHICS` with `PERFORMANCE 60`, `QUALITY`, and `COMPATIBILITY`. The selection is allowlisted, persisted, and applied on a controlled reload. Unknown labels fail to the balanced default.

The static balanced shadow map preserves tree, planter, structure, and route depth instead of simply making the scene flat. Dynamic actors do not move authoritative hit proxies or alter gameplay authority.

## Verification

Deterministic and browser evidence:

- TypeScript lint passed;
- 90/90 Vitest tests across 20 files;
- production build passed;
- 12/12 functional Chromium scenarios;
- balanced full-art work-budget scenario passed (`<=450` calls, `<=300,000` triangles, full representation, static shadows, DPR 1);
- compatibility performance scenario passed (`>=40 FPS`, `<=180` calls, `<=350,000` triangles);
- two-browser host/client verification passed with reciprocal remotes and zero errors;
- release capture reported zero console/page errors.

Isolated Windows AMD measurement after exact-prefix stale Vite cleanup:

- balanced: **66.64 FPS**, 288 calls / 239,768 triangles, p50 14.0 ms, p95 30.8 ms, zero >50 ms frames;
- quality: 59.35 FPS, 571 calls / 341,438 triangles;
- compatibility: 375.86 FPS, 75 calls / 71,934 triangles.

Visual inspection confirmed the balanced static shadow cache retains visible ground/object shadows, full weapon/arm detail, readable materials and route dressing without missing assets or release blockers.

## Display limitation

The game now clears 60 FPS render throughput on Dave's AMD desktop, but the active virtual display is still configured at 30 Hz. A 30 Hz display path cannot visibly present 60 distinct frames per second. The installed driver fallback advertises 1920×1080 at 30/60/90/120/144/165 Hz, but changing the active refresh from a noninteractive WSL process was not reliable and was not forced. Windows **Settings → System → Display → Advanced display** must select at least 60 Hz, or the remote-display/stream client must request 60 Hz.

## Preserved authority and scope

No damage, weapon tuning, bot lethality, movement authority, collision, camera-ray firing, networking, hit proxies, arena geometry, match rules, or bounded presentation capacities changed. Pass 10 remains immutable under `review/pass10/`; Pass 11 will publish separately under `review/pass11/` before canonical promotion.
