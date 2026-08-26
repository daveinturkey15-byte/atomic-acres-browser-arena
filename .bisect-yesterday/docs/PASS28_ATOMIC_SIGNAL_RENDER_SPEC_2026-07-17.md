# Pass 28 — Atomic Signal Render Specification

Date: 2026-07-17
Status: deployed and publicly verified 2026-07-18

## Intent

Give Atomic Acres a more coherent modern image without adopting expensive cinematic effects or changing authoritative gameplay. Preserve the 60 FPS production floor through one bounded pass, profile-specific sampling and the existing adaptive-quality system. Keep the requested live FPS counter in the top-right.

## Architecture

`src/atomic-signal.ts` implements one `RawShaderMaterial` fullscreen pass:

1. render the scene once into one full-drawing-buffer `HalfFloatType` linear-HDR target;
2. validate framebuffer completeness on first use;
3. grade the source with restrained contrast/saturation, cool shadows, warm highlights and distance desaturation;
4. use the Three.js r185 ACES fit under renamed local GLSL symbols, avoiding renderer-injected uniform collisions;
5. apply a soft peripheral vignette in linear display space, then a fine ordered dither after the sRGB transfer so its amplitude remains within the intended output-code budget;
6. use one texture sample in Performance and five only in Blender Render for restrained sharpening;
7. convert linear output to sRGB exactly once;
8. validate representative output pixels once, then fall back to direct rendering if the result is all black.

The enabled path sets the renderer to `NoToneMapping` because Atomic Signal owns the single ACES/output transform. Compatibility mode retains the direct renderer's `ACESFilmicToneMapping`. Runtime fallback temporarily restores direct ACES rendering. No render target, shader, geometry or uniform object is allocated per frame.

The diagnostic-only `?signal=off` query bypasses the pass for exact same-origin A/B checks. Detected software rasterizers (`SwiftShader`, `llvmpipe`, `softpipe`, WARP and Microsoft Basic Render Driver) also bypass it by default because the extra full-screen pass can dominate an already cadence-limited renderer. `?signal=on` is the explicit QA override that proves shader compilation, framebuffer completeness and visible output even on software WebGL. The public menu exposes neither query as a normal player option.

## Profile contract

| Profile | Pass | Source samples | Sharpen | Initial DPR | Intended use |
|---|---:|---:|---:|---:|---|
| Performance | enabled | 1 | none | 0.75 | 60 FPS-first gameplay |
| Blender Render | enabled | 5 | 0.12 | 1.0 | richer authored presentation |
| Compatibility | direct fallback | 0 | none | 0.65 | weak/problematic devices |

Explicitly excluded: SSAO, SSR, depth of field, motion blur, heavy bloom, chromatic aberration, full-screen volumetrics and stacked post-process chains.

## Material and texture compatibility

`src/material-compatibility.ts` replaces the older one-off crushed-black lift with an idempotent, telemetry-producing audit of shared `MeshStandardMaterial` instances.

Corrections and rationale:

- `map` and `emissiveMap` are color content and are corrected to `SRGBColorSpace`;
- AO, alpha, bump, displacement, metallic, normal and roughness maps are data and are corrected to `NoColorSpace`;
- anisotropy is bounded to 4 in Performance/Compatibility and 8 in Blender Render;
- dark non-protected surfaces receive a restrained readability lift;
- roughness is clamped to `0.28..0.98` to prevent implausible glare or dead-flat response;
- metalness is clamped to `0..0.82` to preserve readable non-metallic props;
- normal scale is bounded to avoid noisy, unstable highlights;
- shared materials are adjusted once, and changed materials are marked for update.

Material counts and correction counts are exposed as `render.materialCompatibility` in the debug snapshot.

## FPS counter

`#hud` is the fixed full-viewport layer (`z-index: 5`). Inside it, `#fps-counter` is absolutely anchored to the top-right safe area (`top: max(16px, env(safe-area-inset-top)); right: max(24px, env(safe-area-inset-right)); z-index: 4`) and remains visible during gameplay. It updates on the established bounded cadence rather than allocating every frame. Debug telemetry exposes value, pacing class, visibility and the `top-right` anchor contract.

## Fallback and observability

`render.atomicSignal` exposes:

- enabled profile;
- fallback reason;
- intentional bypass reason (`compat-profile`, `software-renderer` or `query-disabled`);
- latest and rolling CPU submission time;
- sample count;
- texture-sample count;
- framebuffer and output validation state;
- render-target dimensions.

Compatibility mode and detected software renderers bypass the pass. Enabled or explicitly forced profiles verify framebuffer completeness and a non-black first output. WebGL context restoration invalidates both validation flags and requires a fresh framebuffer/output check before telemetry can report healthy output. JavaScript/render exceptions use direct ACES rendering rather than leaving a black screen, and inactive/fallback telemetry reports zero pass work.

## Verification evidence

Passing on the final candidate before release:

- TypeScript lint;
- 231 Vitest tests across 49 files;
- deterministic gameplay contract and golden replay checks;
- production Vite build;
- release-tree validation;
- production dependency audit with zero vulnerabilities;
- Chromium shader compile/telemetry checks for Blender Render and Performance;
- Chromium direct-render Compatibility check;
- Chromium resize equality between Atomic Signal target and renderer drawing buffer;
- Chromium top-right live FPS geometry/cadence check;
- WebKit capability smoke with shader compile, framebuffer validation and non-black output validation;
- visual screenshot histogram checks: no black frame, no highlight clipping, and restrained central-view change relative to direct ACES rendering;
- Performance profile telemetry on the explicit `signal=on` oracle: one texture sample, validated target/output, a latest fullscreen-pass CPU submission of 0.10 ms and a warm rolling average of 0.15 ms under WSL headless SwiftShader (release ceiling: 12 ms). Scene submission is excluded by construction and is not misreported as post-process overhead. The same harness reported only 1 FPS overall because this environment's software renderer was cadence-limited; that number is not a hardware FPS claim.

Firefox headless is not a usable shader oracle on this WSL host: Firefox reports `AllowWebgl2:false` and cannot create any WebGL2 renderer, including the pre-shader direct path. Chromium and WebKit provide the available cross-engine WebGL2 evidence here.

The exact local candidate also passed the bounded Chromium/WebKit matrix (baseline/lifecycle, headed Pointer Lock, authored boot, callsign/high-score persistence, route readability, solo mechanics, Tri-Pass and performance) plus explicit no-retry reruns of the two aggregate flakes. Real PeerJS QA passed leaderboard, stance, window, explosive-window, death/drop, scavenging and pickup replication with zero errors; 20/20 host/join/leave lifecycle cycles passed. Deployment and public-origin verification are appended after promotion.

## Gameplay preservation

Pass 28 does not change collision, movement, spawn rules, weapons, lethality, bot decisions, networking, score replication or replay state. The authoritative gameplay contract and golden replay files remain unchanged.

## Canonical promotion evidence

- Initial implementation commit: `495101e28cc127510f72aa5e83a040d66f782680`
- Independent-review hardening commit: `f144f6d0faa42d7e4ac215e7a3c7abe2010f3956`
- Current Pages commit: `4040abcab5526dd2d8a7f2d151df9be3ffe12ead`
- Pages build status: `built`
- Canonical root/index and the two hashed JS/CSS bundles matched the exact local `dist` bytes over HTTP 200.
- The Blender arena GLB matched the exact local artifact.
- Public browser telemetry reported Pass 28, WebGL2, Atomic Signal enabled, no fallback, one Performance texture sample, fresh framebuffer/output validation, a warm fullscreen-pass CPU average of approximately `0.11 ms`, and matching `960x432` target/drawing-buffer dimensions.
- Public gameplay exposed the FPS counter at `top=16px`, `right=24px` with the `top-right` telemetry anchor.
- Public console: zero JavaScript/shader errors (only the non-fatal absence of `KHR_parallel_shader_compile`).
- Archived `review/` tree before/after: `55b0f92c22f6db6fb59e99ebaf5e5206e359b6b1`.
- All 18 archived review indexes and their directly referenced hashed assets returned HTTP 200.
