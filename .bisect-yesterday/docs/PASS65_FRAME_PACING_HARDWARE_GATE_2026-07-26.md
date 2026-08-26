# Pass 65 native-WebGPU frame-pacing gate

Date: 2026-07-26
Owner lane: RTX hardware QA / HF-041 / HF-065 / R606 / R610
Impact: QA code plus a pure analysis contract; no gameplay or renderer mutation

## Purpose

Average FPS did not explain the owner's Atomic Acres freezes. This gate compares Atomic Acres directly with Terminal on the same installed Chrome and hardware, retains every measured frame interval, and fails on tail latency rather than averaging hitches away.

The default command is:

```powershell
npm run qa:pass65:frame-pacing
```

It first makes a production build, serves that build through Vite preview, and creates fresh alternating Atomic/Terminal browser contexts. Each trial uses:

- installed Google Chrome, not bundled Playwright Chromium;
- WebGPU required and verified from runtime backend/adapter/device telemetry;
- a 2560×1440 viewport, DPR 1 and the player-facing Quality (`high`/`blender`) profile;
- the prerecorded/deferred menu contract, followed by explicit solo deployment;
- frozen bots and deterministic forward sprint for repeatable active-game work;
- a 3-second rAF warmup followed by an uninterrupted 10-second rAF window;
- two trials per arena by default in alternating A→T then T→A order;
- `PerformanceObserver` long-task evidence, the runtime's separate 90-frame CPU/presentation sample, seven serial WebGPU queue-retirement samples, renderer residency, streaming state, pipeline inventory, request failures and browser/GPU errors;
- exact full source SHA and clean-before/clean-after worktree proof.

The output is ignored release evidence under `artifacts/pass65/frame-pacing/<source-sha>-receipt.json` plus a SHA-256 sidecar. The receipt retains every raw rAF interval as well as the summary and failure reasons.

## Fixed release thresholds

The duration and repeat count may be increased. Thresholds are fixed in `src/pass65-frame-pacing-gate.ts` and cannot be weakened through environment variables.

Every individual trial must satisfy all of these:

| Signal | Hard threshold | Reason |
|---|---:|---|
| Measurement window | at least 10,000 ms | A 90-frame burst is too short to catch intermittent freezes. |
| Median cadence | at least 45 Hz; p50 ≤18.5 ms | A representative RTX 5080 Quality trace may not normalize sustained sub-50 FPS presentation. |
| p95 | ≤20 ms | At least 95% of frames remain at or above the 50 FPS boundary. |
| p99 | ≤33 ms | The slowest percentile remains below one dropped 60 Hz frame interval. |
| Maximum | ≤100 ms, with zero frames `>100 ms` | One tenth of a second is an unmistakable interaction freeze and is never averaged away. |
| Frames `>20 ms` | ≤50 per 1,000 | Equivalent explicit tail-count form of the p95 boundary. |
| Frames `>33 ms` | ≤10 per 1,000 | Equivalent explicit tail-count form of the p99 boundary. |
| Frames `>50 ms` | at most one per 10 seconds | Visible hitches remain rare even when percentile rounding could hide one. |
| Steady-state long tasks | zero | Chrome's `longtask` entries are already ≥50 ms main-thread monopolies. |
| Runtime | native WebGPU, non-software adapter, healthy presentation, zero device loss/uncaptured/completion error | A fallback or continuity failure invalidates the measurement. |
| Arena budget | existing authored draw/triangle/memory/CPU/GPU limits pass | This comparator does not waive the existing arena contract. |

Atomic Acres must also stay within the following bounded deltas from Terminal in every paired repeat and in the aggregate:

- p50: Terminal + max(1.5 ms, 10%);
- p95: Terminal + max(2 ms, 15%);
- p99: Terminal + max(4 ms, 20%);
- max: Terminal + max(12 ms, 30%);
- `>20`, `>33`, and `>50 ms` rates: at most +15, +5, and +2 frames per 1,000 respectively.

This is deliberately asymmetric: Terminal is the owner's smoother control arena, and Atomic Acres is not allowed a materially worse tail merely because both clear an absolute average-FPS target.

## Configuration

Only evidence strength and launch placement are configurable:

| Environment variable | Default | Bounds / meaning |
|---|---:|---|
| `PASS65_FRAME_PACING_WINDOW_MS` | `10000` | `10000..120000`; cannot shorten the evidence window. |
| `PASS65_FRAME_PACING_WARMUP_MS` | `3000` | `2000..30000`. |
| `PASS65_FRAME_PACING_REPEATS` | `2` | `1..4`; alternating trial order. |
| `PASS65_FRAME_PACING_PORT` | `44077` | Local preview port. |
| `PASS65_CHROME_PATH` | installed Chrome | Optional explicit installed-Chrome executable. |
| `PASS65_FRAME_PACING_HEADED` | unset | Set to `1` only for an intentional visible foreground run. The default avoids unattended Windows UI. |

The final immutable S0 hardware evidence should include an intentional headed foreground run and owner free-look/combat/support HITL. The automation-safe native compositor run is the repeatable pre-HITL regression gate; it does not pretend to replace subjective play.

## Claim discipline

- Observed: exact rAF intervals, long tasks, native runtime identity, resource/queue/residency/error telemetry and source cleanliness captured in the receipt.
- Inferred: a green same-machine trace is strong evidence against the specific steady Atomic-vs-Terminal hitch regression.
- Assumed: deterministic movement with frozen bots is comparable enough to isolate arena presentation cost.
- Unknown until S0/HITL: free-look, simultaneous combat/support stress, owner-perceived feel and foreground compositor behavior on the final immutable candidate.
- Falsifier: any dirty/source mismatch, fallback/software adapter, page/GPU error, long task, absolute tail breach or material Atomic delta makes the command exit non-zero.
