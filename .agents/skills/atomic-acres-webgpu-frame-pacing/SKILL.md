---
name: atomic-acres-webgpu-frame-pacing
description: Prevent and diagnose Atomic Acres native-WebGPU gameplay stalls, active-frame canvas readbacks, pause-menu capture regressions, and Atomic Acres versus Terminal frame-tail regressions. Use for renderer-loop, pause/menu lifecycle, arena streaming, performance, GPU queue, long-task, freeze, jank, exact-SHA hardware QA, or pre-HITL release-candidate work.
---

# Atomic Acres WebGPU Frame Pacing

Keep the presented native-WebGPU gameplay canvas on a one-way compositor path and prove frame tails on the owner machine before HITL.

## Required context

Read `AGENTS.md`, the current Pass 65 correction ledger, `src/frame-pacing.ts`, `src/pass65-frame-pacing-gate.ts`, `scripts/qa/verify-pass65-frame-pacing.ts`, `src/ui/menu-lifecycle.ts`, and `tests/e2e/pass65-menu-lifecycle.spec.ts`. Keep observations, inferences, assumptions, unknowns, and falsifiers separate.

## Non-negotiable invariants

- During active native-WebGPU gameplay, never copy, sample, encode, pattern, bitmap-convert, or synchronously read the presented game canvas into a 2D canvas or CPU buffer. Do not poll a pause backdrop from the render loop or a timer.
- For a native-WebGPU pause, keep the last presented game canvas visible and blur/dim it with CSS compositor layers. If compositor blur is unavailable, show a generated no-source-pixel fallback.
- Permit the compatibility WebGL2 route at most one fresh canvas-to-2D copy when a pause is opened. Guard that copy by the explicit `webgl2` backend and keep it outside the active frame loop and periodic timers.
- Never weaken fixed thresholds, shorten the minimum sample window, use SwiftShader/headless CI as hardware proof, or accept a dirty/ambiguous candidate to make a run pass.
- Mechanical evidence does not replace Dave's headed exact-SHA HITL. Any runtime or release-shell drift after HITL invalidates that approval.

## Workflow

1. Run `npm run qa:pass65:frame-pacing-policy`. Stop on any policy/source mutation escape.
2. Run `npm run qa:pass65:menu-lifecycle` and `npm run qa:multiplayer:lifecycle`. Require zero periodic game-canvas readbacks, WebGPU CSS-compositor pause ownership, no start/resume bounce, and the single WebGL2 pause-open copy only.
3. Commit the candidate, require a completely clean worktree, and run `npm run qa:pass65:frame-pacing` with installed Google Chrome on native hardware WebGPU at 2560x1440 Quality.
4. Compare alternating fresh-context Atomic Acres and Terminal trials. Inspect p50, p95, p99, max, exact counts over 20/33/50/100 ms, steady Long Tasks, queue completion, device loss, uncaptured errors, browser/page/request errors, and exact source/build identity.
5. Preserve the receipt and digest outside disposable Playwright output. A passing automated receipt is same-machine evidence only; run the final foreground/headed candidate and hand the exact local URL and SHA to Dave for owner HITL before publish.

## Durable gotcha

**Symptom ->** gameplay visibly updates and input/audio continue, but the presented image repeatedly freezes for seconds, especially on Atomic Acres.

**Cause ->** the active native-WebGPU render loop periodically copied the presented canvas into a 2D pause-backdrop canvas, forcing synchronous GPU-to-CPU readback and queue/presentation stalls.

**Correction ->** remove every active/periodic canvas copy; use the CSS compositor over the last presented WebGPU canvas; retain only one explicitly guarded pause-open copy for WebGL2 compatibility.

**Verify ->** the policy mutation suite and lifecycle gates reject active readback, the clean exact-SHA installed-Chrome native-WebGPU 2560x1440 Atomic-versus-Terminal receipt passes all percentile/tail/Long-Task/queue/device/error gates, and Dave completes headed HITL on that unchanged SHA.

## Commands

```powershell
npm run qa:pass65:frame-pacing-policy
npm run qa:pass65:menu-lifecycle
npm run qa:multiplayer:lifecycle
npm run qa:pass65:frame-pacing
```
