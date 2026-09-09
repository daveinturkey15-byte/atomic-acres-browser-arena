# Muse review 3 — thin-metal follow-ups F-06 / F-08 / F-10 (HF-467)

Reviewer: Meta Muse Spark 1.3 (skeptic). Worktree: `C:/Users/david/projects/aa-claude-perforate`, branch `contrib/dave-gaming-pc/claude/thin-metal-perforation`.
Scope: `git log --oneline 9e2405d7..HEAD` (0d570e09 F-06, 46fd135a F-08, 2cfec655 F-10, 0169112b lane-report note) and the diff over `src`. Baseline: TODO reassessment in `thin-metal-REVIEW-2.md` ("safe to ship as TODOs", each with a prescribed follow-up). Read-only; no builds, no test runs, no `src/` edits. HEAD verified: `0169112b`.

## Verdict: SHIP

1. All three REVIEW-2 TODOs landed in source AND are pinned by named tests: F-06 (`dispose returns the nuketown2 presentation GPU inventory to baseline`), F-08 (`resets against its own prior epoch with no shed runtime present` + `keeps the legacy-main thin-metal reset outside the shed guard`), F-10 (`a counted hit that mints nothing neither bumps nor broadcasts`). Each matches the exact follow-up REVIEW-2 prescribed.
2. No regression: single `resetThinMetalPerforationRuntime` callsite migrated (compiler-enforced arity change), null-safe, epoch-guard semantics preserved; revision gating stays monotonic and broadcast suppression is revision-gated including the forced-reliable path; commit/rollback/dispose untouched.
3. The residual risk REVIEW-2 accepted (bounded cold-compile hitch, unreachable staleness mode, measurable wire) is now receipted or removed, not merely re-argued — inventory counts return to baseline with per-resource dispose asserted, the shed guard no longer gates the thin-metal reset, dents no longer bump or broadcast.

## F-06 — cold inventory receipt: DONE as prescribed, no regression

Claim-state: VERIFIED (source + test read; counts asserted in test, not re-executed here).
`src/thin-metal-perforation.test.ts` (+54) builds the real `buildNuketown2` scene, snapshots `{meshes, geometries, materials, textures}` via `scene.traverse` before/after the full `createAndAttachThinMetalPerforationRuntime` → `removeFromParent()` + `disposeThinMetalPerforationRuntime` lifecycle, and asserts the cold presentation adds exactly +2 meshes / +2 geometries / +2 materials / +1 stencil texture, that the 5 created GPU resources (2+2+1) each receive exactly one `dispose`, and that the snapshot returns to baseline (`toEqual(baseline)`).
Why sufficient: REVIEW-2 asked for "`snapshot()` inventory before/after on nuketown2" as the one-line receipt; this is that receipt plus a dispose-once spy. It proxies programs by material family, as its own comment states — it does not claim a compiled-program count, so no overclaim. Source unchanged (test-only commit), so no presentation/behavior regression possible. Minor note (non-blocking): `readFileSync` import added in this commit is used only by the later F-08 source-assertion test; harmless.

## F-08 — epoch block hoisted off the shed guard: DONE as prescribed, no regression

Claim-state: VERIFIED (diff + callsite read).
`src/thin-metal-perforation-runtime.ts` (+13/−3): `ThinMetalPerforationRuntime` gains `lastMatchEpoch` (set at creation); `resetThinMetalPerforationRuntime` drops the caller-supplied shed `priorEpoch` (arity 4→3) and guards on `matchEpoch > runtime.lastMatchEpoch`, advancing the tracker on reset, with `setHostAuthority` still unconditional and null-runtime still a no-op. `src/legacy-main.ts` (1 line moved): the thin-metal reset now sits above `if (interactiveWorldRuntime)`, which keeps only the shed `telemetry().matchEpoch` guard / regress-throw / `setHostAuthority` / `syncInteractiveWorldPhysics`.
Why sufficient: REVIEW-2 prescribed "key off the authority's own epoch, or hoist the block" — this does both. The unreachable-today staleness mode (shed null while thin-metal exists) now resets correctly. Pinned by two tests: a behavioral no-shed reset (aperture closes, hits zeroed, envelope epoch 5, same-epoch repeat and epoch regression both no-throw with tracker unmoved) and a source assertion (exact hoisted call present, `priorEpoch` form gone, call before the shed guard, guard body free of `ThinMetalPerforation` and still resetting the shed).
Regression sweep: `grep` shows exactly one production caller (legacy-main:17456, migrated) and all test callers on the new arity; the type change (new required field) is constructed in exactly one place (`createThinMetalPerforationRuntime`); `commit`/`rollback` correctly leave `lastMatchEpoch` alone (next runtime is created at the current epoch; rollback returns the previous runtime with its own epoch). Divergence note: on epoch regression the shed throws while thin-metal silently no-ops + updates host authority — same net effect as before (startGame aborts via the shed throw), not a regression.

## F-10 — revision only on minted hole: DONE as prescribed, no regression

Claim-state: VERIFIED (diff + broadcast gate read).
`src/thin-metal-perforation.ts` (+4/−1): `applyPanelImpact` now does `if (opensHole) this.revision += 1` (was unconditional), beside the already-gated `if (opensHole) this.presentation.sync(...)`. `opensHole` is unchanged (`hits+1 >= hitsToOpen && panel holes < cap && global holes < cap`).
Why sufficient: REVIEW-2 prescribed "gate-on-content-change … one-line follow-up"; this is that line. Dents (hits 1–2) and over-budget hits still increment `hits` and return `accepted:true`, but leave `revision` and the revision-gated broadcast (`broadcastThinMetalPerforationState`: `if (!forceReliable && envelope.revision === lastBroadcastRevision) return`) silent. Pinned by a 5-hit walk (2 silent dents at rev 0, 2 mints to rev 1/2 with one broadcast each, 1 silent over-budget hit at the per-panel cap with no broadcast).
Correctness check: dent `hits` are host-local until the next mint, when the broadcast envelope carries the cumulative `hits` + holes — guests apply via `applyAuthoritativeEnvelope` (monotonic `revision <= lastAppliedRevision` reject, F-01) so the jump is accepted, not stale. No hole state is ever skipped: every mint still bumps exactly once. No presentation change for dents (sync was already mint-gated).

## Regressions: none

Single-callsite arity migration (compiler-enforced), null-safe reset, monotonic revision, untouched commit/rollback/dispose paths, test-only F-06. `artifacts/lane-report.md` follow-up section (0169112b) is docs-only and accurately describes the three commits.

## What stayed good

F-01..F-05 + F-07 + F-09 holdings from REVIEW-2 untouched (no changes to envelope validation, watermark, `nextHoleId`, protocol type, ratchet, rollback, or aperture union in this range).
