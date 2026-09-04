# Muse Spark 1.3 — qwen-bench ladder (single pass)

- Model: `meta-contributor/muse-spark-1.3` via OMP (`--thinking low`, `--no-skills --no-lsp --no-session`, max 15m)
- Date: 2026-09-04; branch `contrib/dave-gaming-pc/claude/qwen-tidy-overnight`
- Command: `node scripts/qa/qwen-bench/run.mjs --model meta-contributor/muse-spark-1.3`
- Raw scores: `docs/evidence/pass94/qwen-bench/muse-spark-results.json`
- Harness change: `scripts/qa/qwen-bench/run.mjs` gained `--model <provider/model>` (default campaign unchanged; override runs T1–T6 exactly once with the given model in scratch fixtures under `artifacts/muse-bench/`, results to `muse-spark-results.json`). Task prompts and scoring untouched except that the scratch path in prompts follows the active scratch dir (same task, relocated).
- Campaign wall: ~71s total. Score: **3/6**.

## Results

| Task | Trial | Wall | Exit | Marker | Checks | Touched | Pass |
|------|-------|------|------|--------|--------|---------|------|
| T1 usage header | T1-muse-1 | 15.2s | 0 | yes | [t,t,t] (header regexes + `node --check`) | [] (recorded empty; see note) | PASS |
| T2 comment fix | T2-muse-1 | 15.2s | 0 | yes | [t] byte-exact | T2/stale-comment.ts | PASS |
| T3 clampPercent + vitest | T3-muse-1 | 12.9s | 0 | yes | [t,t,**f**] (export ok, test shape ok, **vitest run failed**) | T3/clamp-percent.ts, T3/clamp-percent.test.ts | FAIL |
| T4 300-line summary | T4-muse-1 | 13.1s | 0 | yes | [t] ≥5 bullets | [] (read-only task) | PASS |
| T5 Nuke Town PNG | T5-muse-1 | 1.1s | **1** | yes | [t] ≥4 features named | [] (read-only task) | FAIL |
| T6 rename + tsc | T6-muse-1 | 12.6s | 0 | yes | [t,t,t,**f**] (rename applied both files, **tsc --noEmit failed**) | T6/usage.ts, T6/consumer.ts | FAIL |

No trial touched out-of-scope files. No trial blocked on the local-Qwen slot (override model skips slot wait).

## What went well / badly and why

- Well: bounded text edits (T1, T2) and read-only summarization (T4) all passed with clean markers and no scope violations. T2's byte-exact swap and T1's header (description + Usage + flags/env + writes + exit codes, `node --check` clean) show instruction-following on tightly scoped file tasks is reliable.
- Badly (T3): exported `clampPercent` and a shaped test file were produced, but the vitest run failed. Fixtures reset per task and scratch is removed after the run, so the exact assertion/implementation mismatch is not recoverable from artifacts; the recorded signal is "shape right, behavior check wrong." [INFERENCE] Likely an edge-case error (NaN/Infinity/non-finite handling) rather than a structural miss.
- Badly (T6): rename applied across both files (all three content checks true) but `tsc --noEmit` failed — a near-miss on type-correctness, not on following the rename. [INFERENCE] Probable cause is a small typing/import detail left inconsistent.
- T5 is an infra-flavored fail, not a capability fail: content checks passed (≥4 Nuke Town features named, marker present) yet the OMP process exited 1 after ~1.1s — too fast for a vision call. The attributed OMP log carried no content (telemetry null, as in all trials). [INFERENCE] Attachment/process handling error rather than a bad description. Recommend re-running T5 alone before judging vision ability.
- Anomaly (T1): `touchedFiles` recorded empty despite passing content checks that require editing the file. Scoring still passes mechanically; noting it as a possible git-index timing quirk, not a result-changer.

## Cost note

OMP text mode exposes no token/cost telemetry: `tokens: null` on all six trials (log stream carried no parseable numeric telemetry). No cost figure to report; wall time is the only measured cost (~71s campaign).

## Recommended job list for Muse Spark in this project

- Give it: usage-header/doc sweeps (T1-class), stale-comment/exact micro-fixes (T2-class), file summarization, review/critic passes, evidence-writeup drafts. Fast (~13–15s/task), obedient, no scope creep observed.
- Keep off the unsupervised lane: test-verified implementation (T3-class) and rename-plus-typecheck refactors (T6-class) — use as draft author with vitest/tsc gating and a retry, or route to a stronger coding lane.
- Vision-attached tasks (T5-class): inconclusive; re-run the single trial to separate infra failure from model failure before assigning.
- Suggested follow-ups: retry T3/T6 at higher thinking with the failing check output fed back; single-trial re-run of T5; then compare against the Qwen local/reference rows in `results.json`.
