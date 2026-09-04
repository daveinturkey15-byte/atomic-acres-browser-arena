# Pass 94 local Qwen benchmark

Date: 2026-09-04. Harness: OMP 18.1.1. Local route: `qwen-local-8090/qwen38-27b-iq3xxs`. Reference route: `alibaba-token-plan/qwen3.8-flash`.

## Result

The corrected campaign completed all requested cells as terminal classifications, but the local model was not available for almost the entire run: the owner's header-chain job continuously held the Qwen slot. The benchmark therefore establishes slot contention, not a broad local-model score.

| Route | T1 | T2 | T3 | T4 | T5 | T6 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Local, low x2 + medium x1 | 0/3 launched; 3 blocked | 0/3 launched; 3 blocked | 0/3 launched; 3 blocked | 0/3 launched; 3 blocked | 0/3 launched; 3 blocked | 0/3 launched; 3 blocked | 18 blocked |
| Flash, low x1 | not terminal | not run | not run | — | — | — | reference incomplete |

Evidence file: [`results.json`](./results.json). Every blocked local row records wall time, null exit code, no marker, null checks, and the observed local-Qwen blocker count. No trial process was killed or restarted.

### Exploratory probe

`VERIFIED`: an earlier invocation, before the touched-file accounting correction, completed local Qwen `T1/medium` in 157.695 seconds with exit code 0, the `QWEN-BENCH-DONE T1` marker, a present usage header, and passing `node --check`. It is retained as a one-sample probe, not blended into the corrected 18-cell ladder. This is 1/1 for the exact one-file header task, but it is not enough to claim an 80% repeatable rate.

The Flash `T1/low` attempt remained alive past the 15-minute command bound with no useful OMP log progression. Its OMP process was left untouched; this is `OPEN` launcher/provider evidence, not a model-quality score.

## Task shapes and grading

| Task | Fixture and mechanical gate | Current evidence |
|---|---|---|
| T1 | 185-line `.mjs`; add usage header; header present and `node --check` | `VERIFIED` exploratory probe, 1/1; corrected ladder blocked |
| T2 | 6-line TypeScript fixture; replace only line 3; exact file equality to expected diff | `OPEN` — all three local cells blocked |
| T3 | Two TypeScript files; pure `clampPercent`; Vitest covers 7 boundary values | `OPEN` — all three local cells blocked |
| T4 | Exactly 300-line TypeScript test source; exactly five bullet facts; manual source-read grader | `OPEN` — all three local cells blocked |
| T5 | 1280×720 Nuke Town overhead PNG; five bullets and at least four named features | `OPEN` — all three local cells blocked |
| T6 | Two TypeScript files; rename `legacyUsage` to `ratioAsPercent`; `tsc --noEmit` | `OPEN` — all three local cells blocked |

### Manual grading anchors

These are owner-side ground truth, not claims about an absent model answer.

T4 source read (`VERIFIED`):

- The file uses Three.js, Vitest, the killstreak catalog, and the host killstreak runtime.
- World bounds are x/z `-80..80`, floor `0`, ceiling `48`.
- Chopper rays derive camera and muzzle origins from authored socket transforms and pose/camera yaw-pitch rotations.
- The contract admits near and far centre-ray targets but rejects the old off-crosshair cone.
- Coverage includes camera-origin LOS, exactly half damage through occlusion, low-FPS snapshot firing, and restoration of AI root fire after piloting.

T5 capture read (`VERIFIED`): the overhead frame visibly contains the central marked street, two-storey coloured houses, multiple vehicles, a blue side-yard/pool-like rectangle, and a dense wooded perimeter. A model answer naming at least four of those features would pass. No model answer was produced in the corrected campaign.

## Where the local model is good

`VERIFIED` only for the one exploratory sample: a small, exact-path, single-file comment/header edit with a syntax gate. This matches the prior Qwen evidence: Q3 was a bounded report-only export finder, while the open-ended Q2 task overflowed the 65,536-token server context after many tool turns.

`OPEN` for T2–T6. There is no valid measured pass rate for exact comment replacement, new function-plus-test work, 300-line summarisation, vision description, or a two-file refactor because the required local cells never acquired the slot. Do not infer that those tasks failed because of reasoning or tool skill; the observed cause was availability contention.

## Recommended operating envelope

- `contextWindow`: keep OMP at the supplied provider value `61440`; do not raise it toward the server ceiling `65536`. Keep the actual prompt/tool envelope below roughly 40–45k tokens so completion and retry headroom remain available. This is grounded by the prior 66k request overflow, not a fresh context sweep.
- Thinking: `low` by default for mechanical edits. Use `medium` only for a bounded multi-step task after low has a demonstrated failure; the current probe does not establish a low-versus-medium accuracy advantage.
- `--max-time`: 10m for one-file mechanical work; 15m only for a bounded test/refactor or an explicitly observed cold wake. A repeated context-size, image-input, or no-final-output error should be terminal rather than retried through compaction.
- Scheduling: require an exclusive local-Qwen slot; poll every 60s for at most 15m, record `BLOCKED` if unavailable, and never compete with the owner's OMP chain or GPU work.

## Daily dispatch guidance

Good candidates, after a clean slot is available:

- one-file usage headers and exact comment corrections;
- report-only reachability/export scans with bounded output;
- small pure functions with a short, named test file and an external test gate;
- tightly specified documentation skeletons and gotcha drafts.

Never send this route:

- broad repository sweeps, large multi-file rewrites, or authority/lifecycle/release code;
- browser, server, capture, deployment, or production publication work;
- unbounded tasks that invite many tool turns or carry large tool-result/system payloads;
- image tasks until a clean vision-input trial proves that the OMP route accepts the projector path;
- secrets, credentials, raw logs, or private session material.

## Claim-state summary

- `VERIFIED`: harness syntax, isolated fixture gates, exact corrected blocked-row records, High performance scheme, one local T1/medium exploratory pass, and independent T4/T5 ground-truth reads.
- `CLAIMED`: owner-supplied model identity, 65,536 server context, MTP/projector/idle-sleep characteristics, and the OMP provider context value.
- `OPEN`: repeatable local pass rates beyond T1/medium, all T2–T6 capability cells, and the Flash comparison because the route did not return a terminal result.
