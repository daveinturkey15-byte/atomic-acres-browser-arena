# Pass 64 complete playable migration specification

Date: 2026-07-25

Status: implementation candidate; not accepted and not publishable

## Overview

Replace the disconnected Pass 64 renderer laboratory with a complete playable Three.js WebGPU/TSL game, deliver an unmistakable modern tactical HUD/menu redesign, and collect privacy-minimized post-match diagnostics without adding traffic to the realtime multiplayer path. Preserve the exact Pass 62 stable bytes as the rollback oracle and keep Pass 64 behind HITL approval.

## Current evidence and claim states

### Observations

- Pass 62 remains the exact stable benchmark at source `249a7ee77dce761eb237f3eb0e0d0ea1d0356317` and runtime digest `035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d`.
- Pass 63 is the current live source at `1bd55076c952080d5f7a8a5b0b8869aaa0646a76`.
- Pass 64 draft SHA `21cb948a998ca527cc30e076d86766b60fec3dfe` routes the normal URL to `legacy-main.ts`/WebGL and routes `renderer=webgpu` to a disconnected visual review entry.
- Owner HITL rejected that split and judged the HUD/menu changes insufficiently transformed.
- The game already has a bounded in-memory `MatchDiagnostics` ledger and a same-origin-capable Worker/D1 leaderboard service, but it does not automatically upload post-match diagnostic envelopes.

### Inferences

- A second renderer-owned scene graph would create gameplay/presentation drift. The safe target is one gameplay scene and one backend-neutral render owner, with WebGPU as the normal Pass 64 backend and WebGL only as explicit compatibility coverage.
- Post-match batching through `sendBeacon` or `fetch(..., { keepalive: true })` avoids coupling diagnostics delivery to WebRTC state/event lanes.
- The delayed-death report needs ordered health/damage/regeneration/admission evidence, not names, room codes, chat, IP addresses, or continuous network packet capture.

### Assumptions

- Production may reuse the existing Worker origin for a bounded `/v1/match-diagnostics` endpoint and D1 storage after schema migration.
- WebGPU-capable browsers are the intended Pass 64 HITL target. Unsupported hardware may use an explicit compatibility URL, but may not silently masquerade as WebGPU.
- Visual improvement may change approved screenshots, but gameplay authority, collision, networking and Pass 62 rollback bytes must remain unchanged.

### Unknowns and falsifiers

- If Three r185 WebGPU cannot render a required gameplay subsystem without legacy GLSL, the migration is blocked until that subsystem is converted; silent omission or fallback falsifies completion.
- If the Worker endpoint or D1 retention cannot be deployed within the existing service boundary, automatic remote collection is blocked; local post-match retention/export remains supporting evidence only.
- If deterministic closed-wall/open-door ROI captures cannot distinguish correct occlusion, the light-leak gate remains red.
- If the full WebGPU game exceeds frozen frame-time, draw-call, memory or device-loss budgets on the RTX 5080, it is not an acceptable Pass 64 candidate.

## Requirements

### R1 — One playable WebGPU game

The normal Pass 64 preview must initialize `WebGpuRenderRuntime`, then run the complete existing game loop, gameplay scene, physics, input, bots, weapons, multiplayer, HUD and all four arenas through that runtime. The old disconnected visual-forge entry must no longer be the HITL product.

### R2 — Backend-neutral rendering ownership

Move renderer creation, sizing, frame submission, render targets, context/device loss, compile/prewarm, readback and disposal behind a typed render-runtime boundary. `legacy-main.ts` may temporarily remain the gameplay coordinator, but it may not construct or directly own a `WebGLRenderer` on the WebGPU path.

### R3 — Complete TSL cutover

Every custom shader used by the playable WebGPU path must be TSL/node based. `ShaderMaterial`, `RawShaderMaterial`, GLSL source strings and WebGL-only post effects are forbidden on that path. Compatibility-only exceptions must be mechanically inventoried and unreachable from required WebGPU HITL.

### R4 — Selected-arena streaming and disposal

Only the selected `ArenaVisualDefinition` and its assets may load. Arena changes use abort/generation protection, detached validation, atomic attach, exactly one active presentation root and idempotent disposal. Repeated switching must return object, texture, target, draw-call and GPU-memory counts near the recorded baseline.

### R5 — One controlled HDR pipeline

The playable path must use one linear-HDR scene pipeline with a multisampled principal target, depth-aware emissive bloom, exposure/tone mapping, colour grade, deterministic grain/dither and output transform. Telemetry reports actual principal and bloom samples.

### R6 — Lighting and geometry quality

All arena lights declare an occlusion policy. Fixed-camera masked ROI tests must prove solid walls suppress practical/bloom spill while open doors retain readable light. Terminal must have a real roof/ceiling with intentional face orientation. Door appearance, portal collision/ballistics, floating geometry and material/asset outliers are reviewed across Nuke Town, Terminal, RustRig and Gun Range.

### R7 — Unmistakable HUD/menu overhaul

Recompose the setup/menu, lobby, loadout, in-match HUD, overlays, match end and returned-lobby states using a new component/token system and strong modern tactical hierarchy. Merely changing colours, borders, blur or labels does not satisfy this requirement. Every surface in `src/ui/surface-registry.ts` remains reachable and mechanically covered.

### R8 — Lightweight automatic match diagnostics

Every completed solo or multiplayer match creates a bounded privacy-minimized diagnostic envelope. Capture stays in memory on the gameplay path; serialization and upload occur after match completion or during a safe page-lifecycle flush. Normal delivery uses `fetch(..., { keepalive: true })` and removes an envelope only after a valid collector receipt, never through WebRTC gameplay channels. `sendBeacon` is a last-chance lifecycle attempt and does not clear the capped local queue; idempotency makes later retries safe.

The remote payload may include build/pass/backend, arena/mode/role, anonymous per-match pseudonyms, ordered damage/health/regeneration/admission events, RTT/jitter/clock-offset buckets, dropped-event counts, final scoreboard summary, frame-time quantiles and fatal runtime error categories. It must not include callsigns, chat, room codes, raw peer IDs, install IDs, IP addresses, credentials, cookies, free text, stack traces or precise long-term device fingerprints.

### R9 — Diagnostic service and retention

Extend the existing Worker/D1 service with a strictly validated, size-capped, rate-limited, idempotent match-diagnostics endpoint. Store a server-generated receipt ID and timestamps. Apply a bounded retention window and provide an authenticated or local-operator analysis/export path without exposing public player logs.

### R10 — Benchmark and rollback protection

The candidate must verify Pass 62 source, Pages subtree, file count and runtime digest. Pass 64 must contain current Live/Pass 63 ancestry. No Pass 62 bytes or stable-channel configuration may change.

### R11 — HITL truth

The supplied gameplay URL must be the full hardware WebGPU game. The supplied compatibility URL must be labelled WebGL compatibility. Deterministic contact sheets and performance/diagnostic receipts bind to one exact candidate SHA. No `acceptance/pass-64.json` approval is added until Dave approves that immutable preview.

## Mechanical acceptance criteria

- **C1:** normal Pass 64 HITL reports actual WebGPU backend after `await renderer.init()` and exercises a playable solo match plus real two-peer host/guest match.
- **C2:** required WebGPU route loads zero legacy GLSL/`ShaderMaterial` paths and no disconnected review-only entry.
- **C3:** all four arenas load through one gameplay runtime; selected-only request logs, one-root assertions and repeated-switch disposal budgets pass.
- **C4:** principal HDR sample count, depth-aware bloom identity, grade/grain graph and device-loss telemetry are present and truthful.
- **C5:** paired solid-wall/open-door ROI tests pass in Nuke Town and Terminal; Terminal roof/ceiling and portal semantics pass geometry/collision/ballistics checks.
- **C6:** deterministic HUD screenshots visibly supersede the rejected candidate at desktop, laptop, ultrawide and narrow sizes; all inventory/state/keyboard/focus/two-peer gates pass.
- **C7:** a real completed match produces one validated diagnostic receipt without any upload during active combat; forced offline delivery queues and later retries once.
- **C8:** payload privacy, byte cap, rate limit, idempotency, retention and public-read denial tests pass.
- **C9:** Pass 62 benchmark verification, authoritative netcode, rematch, railgun, redeploy, canonical corpse/operator and full bounded browser matrices pass without weaker thresholds.
- **C10:** RTX 5080 review records per-arena CPU p50/p95/p99, available GPU timing, draw calls, triangles, texture/target/shadow budgets, frame hitches and device loss; regression against the frozen comparator blocks acceptance.
- **C11:** branch is clean, contains current `origin/main`, is pushed to the existing draft PR, and hosted Windows/Linux gates pass except the intentionally absent HITL approval.

## Out of scope before HITL

- Publishing, merging or creating Pass 64 acceptance approval.
- Rebuilding Pass 62 with shared Pass 64 code.
- Sending chat, callsigns, room codes, peer identifiers, IP addresses, secrets or raw browser profiles to diagnostics storage.
- Claiming WAN/TURN, anti-cheat or host-migration guarantees from local browser tests.

## Work ownership

- Renderer specialist: R1–R6 and C1–C5, isolated worktree.
- HUD specialist: R7 and C6, isolated worktree.
- Diagnostics/gameplay specialist: R8–R9 and C7–C8, isolated worktree.
- Integrator: R10–R11 and C9–C11, cross-lane reconciliation, benchmarks, real hardware/two-peer proof, PR and HITL handoff.
