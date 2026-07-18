---
title: Pass 29 Early Morning and Living Ground
status: approved-for-public-test
owner: Dave / Jigglyclaw
branch: overhaul/pass27-world-identity
baseline: 18cbe5791a6fd6bef3fe30a3518dbe4e5e66f512
baseline-date: 2026-07-18
---

# Pass 29 — Early Morning and Living Ground

## Overview

Turn the approved Pass 28 arena from dark/high-contrast sunset presentation into a readable early-morning environment, add bounded practical/interior illumination, and introduce deterministic presentation-only grass that bends in wind and around the local player. Preserve the Atomic Signal linear-HDR → ACES → sRGB-once image contract, deterministic gameplay and networking, and the 60 FPS floor.

This is an original Atomic Acres presentation pass. It does not reproduce commercial-map coordinates, assets, branding, lighting, UI, audio, or geometry.

## Frozen baseline

- Source baseline: `18cbe5791a6fd6bef3fe30a3518dbe4e5e66f512`.
- Golden replay SHA-256 before Pass 29: `edf1393d958452a8c73fea14055822b30febd18a0e57c197d0f94fc2bdc2df03`.
- Gameplay-contract SHA-256 before Pass 29: `33eb773112cd797dad4c036bc2ecfc884e61c8611c2199d7a8dd5ace5649e4e1`.
- Baseline checks: TypeScript passed; 231/231 Vitest tests passed across 49 files; production Vite build passed.
- Baseline Blender stable gameplay was previously measured at 92 scene draws. Pass 29 may add no more than four grass submissions and one instanced fixture submission; its declared stable Blender ceiling is 100 scene draws, while the retained transient ceiling remains 120.
- Canonical production and every `review/*` Pages archive are frozen until owner approval.

## Requirements

- **R1 — Early-morning hierarchy:** Use a low-angle warm sun, pale blue-grey sky, peach horizon, softer cool fill, and restrained fog. Sun-to-hemisphere intensity must be `1.6..2.2`; no representative approach may depend on crushed blacks for route separation.
- **R2 — Bounded god rays:** Render deterministic sky-only angular rays inside the existing sky draw. Add zero render targets, texture samples, or world draws. Maximum contribution is `0.08` Performance and `0.12` Blender; Compatibility and detected software renderers bypass rays.
- **R3 — Practical source agreement:** Keep all local lights fixed, finite-range, inverse-square (`decay=2`), non-shadowing, and visibly associated with existing route fixtures or new ceiling panels. No flicker or gameplay coupling.
- **R4 — Interior readability:** Add one instanced ceiling-panel draw for all eight declared rooms plus one structural-ceiling draw derived from the exact upper-floor sections and upper-room bounds. Blender uses four broad interior lights (one per house floor), Performance two (one per house), and Compatibility zero; Compatibility instead receives sufficient global fill.
- **R5 — Route identity:** Retain three distinct route signs, labels, palettes, and macro silhouettes. Practical pools must not resemble objective markers, team pings, or collision/interaction affordances.
- **R6 — Presentation-only grass:** Grass has no collider, ray target, bot/nav input, cover/LOS role, damage role, protocol field, transport message, replay state, or gameplay RNG draw.
- **R7 — Deterministic ground mask:** Place grass only on the two green verges, inside playable bounds, outside road/sidewalk clearance, house/garage footprints, and expanded authoritative ground colliders. Placement uses a private fixed integer hash and has a stable checksum.
- **R8 — Efficient grass:** Use at most four instanced grass chunks, one shared tapered three-blade tuft geometry, one shared shader material, fixed instance buffers, no per-frame allocations, and uniform-only wind/player updates. Blade height stays at or below `0.58 m`, so grass cannot visually become standing/crouched cover.
- **R9 — Wind and local reaction:** Wind is deterministic from render time and stable world position. The local player produces a bounded radial bend/flatten response through uniforms only. Debug time can freeze presentation for repeatable captures without entering simulation or replay authority.
- **R10 — Profile bounds:** Blender: 2,400 instances / 7,200 blades / 43,200 tuft triangles / at most 8 observed renderer submissions across 4 chunks / 54 m chunk distance. Performance: 1,200 instances / 3,600 blades / 21,600 tuft triangles / at most 8 observed submissions across 4 chunks / 38 m. Compatibility and ordinary software WebGL: grass bypassed. Adaptive DPR reduction must reduce grass distance before threatening the frame floor. `?grass=on&rays=on` is diagnostic-only forced proof on software renderers.
- **R11 — Restrained realism:** Grass receives a low-amplitude dew/grazing highlight in its linear shader. No droplets, puddles, wet roads, motes, SSAO, SSR, DOF, motion blur, bloom stack, screen-space volumetrics, temporal sparkle, or noisy/copycat effects.
- **R12 — Color contract:** Scene and grass emit linear HDR. Atomic Signal remains the sole ACES/output-transfer owner when active; direct fallback retains renderer ACES. Do not change Atomic Signal grading, exposure scale, output transfer, top-right FPS, or context-restoration semantics.
- **R13 — Authority freeze:** Collision, movement, camera rays, weapons, bots, score, spawn selection, match flow, inventory, breakables, physics, networking, replay streams, authoritative RNG, route openings, and bounds remain unchanged.
- **R14 — Release boundary:** Build and verify an owner-review source candidate only. Do not modify `gh-pages`, canonical production, or any `review/*` archive. Push only the verified source branch and report the local/review route.

## Mechanical acceptance checks

- **C1:** `git diff --cached --check`, staged secret scan, and intended-file review pass on the exact final tree.
- **C2:** `npm run lint` passes.
- **C3:** full `npm test` passes with new unit tests for profile lighting, grass placement, grass profile/bypass behavior, deterministic wind/reaction, budgets, and presentation-only metadata.
- **C4:** `npm run verify:gameplay-contract` passes after reviewing only the intended lighting/profile contract delta; golden replay file SHA-256 remains exactly `edf1393d958452a8c73fea14055822b30febd18a0e57c197d0f94fc2bdc2df03`.
- **C5:** `npm run build`, `npm run verify:release-tree`, and `npm run audit:dependencies` pass.
- **C6:** Browser telemetry reports `pass: 29`, exact profile light budgets, one fixture instanced draw, deterministic grass count/checksum/chunks, actual grass submissions, maximum height, wind time, interaction distance, and bypass reason.
- **C7:** Blender and Performance browser runs prove grass is visible only on admitted green ground, moves between two frozen debug times, and changes locally when the player moves inside its interaction radius.
- **C8:** Compatibility and ordinary software-WebGL runs report zero grass blades/submissions and zero god-ray strength while remaining playable.
- **C9:** Forced shader proof (`signal=on`) retains healthy framebuffer and non-black output validation; context loss/restoration forces fresh Atomic Signal validation and grass remains finite/functional.
- **C10:** Profile render budgets: Blender stable ≤100 calls; Performance ≤145 calls and ≤160,000 total scene triangles; Compatibility remains within retained lightweight budgets. Grass itself remains within R10.
- **C11:** Representative exterior and both-house interior captures have no black frame or clipped highlight field; light telemetry is finite; route labels remain readable; practical pools have visible sources.
- **C12:** Exact before/after screenshots at matched cameras are stored under `artifacts/pass29/`, inspected visually, and accompanied by telemetry plus luminance evidence. Owner review—not the histogram alone—is the final visual gate.
- **C13:** Top-right FPS counter remains numeric in active gameplay, anchored `top-right`, and independent of adaptive quality.
- **C14:** Focused solo movement/collision/combat and deterministic replay checks pass without altered authoritative outputs.
- **C15:** Real two-peer PeerJS regression proves connection, opposite teams, spawn separation, remote snapshot/stance replication, combat state, and zero page/console errors.
- **C16:** Chromium and WebKit WebGL2 capability/color smoke pass where the host supplies WebGL2; capability failures are reported honestly rather than converted into product claims.
- **C17:** No stale project-owned preview or test browser remains after QA.
- **C18:** Source push lands on `origin/overhaul/pass27-world-identity`; `gh-pages` and all public `review/*` archives remain untouched.

## Out of scope / rejected effects

- No canonical deployment before Dave approves the owner-review candidate.
- No PBR GLB re-authoring, new licensed asset pack, particle fog, pollen cloud, rain, puddles, reflection probe, SSR, SSAO, volumetric buffer, bloom chain, DOF, motion blur, chromatic aberration, or light flicker.
- No grass shadows, grass collision, procedural concealment, destructible vegetation, remote-player grass state, or networked wind.
- No gameplay tuning, map rescale, route relocation, collision edit, or balance change.

## Decisions

1. Reconcile the specialist plans by spending at most eight observed renderer submissions on grass, one on fixture panels and one on structural ceiling finishes. God rays remain in the existing sky draw; practical lights do not add shadows; optional pollen is rejected.
2. Keep route illumination at three route practicals plus four source-matched streetlamp pools in Blender/Performance. Add four interior lights in Blender, two in Performance, zero total local lights in Compatibility/software-safe mode. Every local light is finite, inverse-square and non-shadowing.
3. Use four coarse verge chunks rather than eight. This preserves culling while bounding added submissions against the 92-call Blender baseline.
4. Grass is a deliberately short living-ground layer, not tactical concealment. The deterministic mask rejects structural footprints even where wall-only colliders would otherwise leave indoor holes.
5. A gameplay-contract lighting delta is expected because lighting is intentionally included under `contract.rendering`; authoritative sections and the golden replay must remain unchanged.
6. Dave approved deployment of the complete Pass 29 candidate for public testing on 2026-07-18. That approval supersedes the pre-review deployment prohibition in R14/C18 for this release only; existing `review/*` archives remain protected.
