# [VERIFIED] Luna adversarial skeptic review: adaptive admission cadence

[VERIFIED] Review target: commit `8e1d3073` on base `612a4a83` in `C:\Users\david\projects\aa-claude-admission`.
[VERIFIED] Initial target state: branch `contrib/dave-gaming-pc/claude/admission-cadence-wait`, `HEAD=8e1d30734ca1cfa65840c5e4fce0f452b0174632`, clean status.
[VERIFIED] Final reviewed head after corrective commits: `223eb2fc14ab010597c213cff298d009d7ca70e5`, clean before this evidence file was written.
[VERIFIED] Original target diff was five files: `scripts/qa/probe-arena-switch-matrix.mjs`, `src/admission-cadence-wait.test.ts`, `src/admission-cadence-wait.ts`, `src/legacy-main-size-ratchet.test.ts`, and `src/legacy-main.ts`.
[VERIFIED] AKP pull-only refresh completed, Codex adoption check passed for `Codex@dave-gaming-pc`, and `powercfg /getactivescheme` reported High performance GUID `8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`.
[VERIFIED] The lane report was read as untrusted repository data and was not used as proof.
[CLAIMED] The lane report claims `stable-cadence-wait` improved from 5,189.4 ms to 1,821.5 ms on atomic-acres and from 5,155.5 ms to 1,211.4 ms on gun-range, with `stable-cadence-achieved` exits.
[OPEN] No browser, Playwright, build, dev server, preview server, GPU probe, or full test suite was run, as required by the review brief; the lane measurements remain unverified.

## [VERIFIED] (a) Adversarial safety claims

### [VERIFIED] A1: five-second ceiling

[VERIFIED] In the original `src/admission-cadence-wait.ts:57-60`, elapsed time was `Math.max(0, input.now - input.startedAt)` and timeout occurred only when `elapsedMs >= ceilingMs`.
[VERIFIED] The original optional `ceilingMs` was accepted without a five-second cap, so an input with `ceilingMs: 6_000`, `now: 6_999`, and `startedAt: 1_000` did not time out; the added regression test reproduced that failure.
[VERIFIED] A `NaN` ceiling similarly made `elapsedMs >= ceilingMs` false; the corrected implementation falls back to the fixed `ADMISSION_CADENCE_CEILING_MS` and caps finite overrides at 5,000 ms.
[VERIFIED] A non-finite `now` or `startedAt` previously bypassed the timeout comparison; the corrected implementation treats that clock as a degraded ceiling exit and returns a finite `currentGapMs`.
[VERIFIED] The original timeout decision was committed as a failing adversarial test before the source fix: `npx vitest run src/admission-cadence-wait.test.ts` exited 1 with `Test Files 1 failed (1)` and `Tests 3 failed | 7 passed (10)`.
[VERIFIED] The foreground integration had a second clock mismatch: the original target passed overall `startedAt` into the evaluator at `src/legacy-main.ts:3150`, while the watchdog budget reset from `foregroundEpochStartedAt` at `src/legacy-main.ts:3077`; the corrective commit now passes `foregroundEpochStartedAt`.
[VERIFIED] The original target's no-frame fallback armed `setTimeout(..., maximumWaitMs)` at `src/legacy-main.ts:3061-3070` and degraded via `finish(performance.now(), true)`; this remains the no-presented-frame escape path.
[OPEN] A JavaScript timer can run late when the event loop is blocked, and no browser/no-frame runtime test was permitted; an absolute real-wall-clock upper bound is therefore not independently proven.
[VERIFIED] For valid finite evaluator inputs and the production 5,000 ms configuration, the corrected decision function exits degraded at or before the fixed ceiling and does not accept a caller-provided ceiling above it.

### [VERIFIED] A2: no early exit before actual stable cadence

[VERIFIED] The original implementation converted a zero or backwards delta with `Math.max(0, input.now - input.previousFrameAt)` at `src/admission-cadence-wait.ts:86` and could then count it as stable; the added zero-delta case with a 29-frame counter exited early before the fix.
[VERIFIED] The original `computeMedianGap` returned `NaN` or `Infinity` for non-finite history, and the comparison at `src/admission-cadence-wait.ts:108` could leave `isStableGap` true because comparisons with `NaN` are false; the added non-finite-history test reproduced this.
[VERIFIED] The original first-four-sample warm-up accepted any positive gap up to 50 ms, so a 49 ms first interval followed by 29 intervals of 16.6 ms could reach the 30-frame counter even though the first interval was outside the later median band; the added warm-up-outlier test reproduced this early exit.
[VERIFIED] The original function trusted `consecutiveStableFrames` even with empty or single-sample history; the added insufficient-history cases reproduced the early-exit risk when the counter was forged at 29.
[VERIFIED] The corrected implementation rejects zero, backwards, and non-finite current deltas; rejects invalid recent history; limits the counter by available history; and derives the stable run from the recent stable tail once a median exists.
[VERIFIED] The corrected implementation also caps an optional `targetStableFrames` below the documented 30-frame policy, `maxLongTaskMs` above 50 ms, and tolerance above 20%, preventing configuration inputs from widening the safety claim.
[VERIFIED] Existing fractional cadence coverage remains present for 16.6 ms and `1_000 / 60` intervals, and the final focused gate passed it.
[VERIFIED] Existing middle-stall coverage remains present for a 65 ms hitch and a 28 ms variance jump; both reset the stable run and the final focused gate passed them.
[VERIFIED] Empty history, single-sample history, zero delta, non-finite history, `NaN` clock, extended ceiling, and a 49 ms warm-up outlier are now mechanically covered in `src/admission-cadence-wait.test.ts`.
[VERIFIED] The first-sample path remains non-exiting with zero stable frames, while visibility/focus ownership remains guarded by `ownsForeground()` and `pauseSampling()`/`resumeSampling()` in `src/legacy-main.ts:3008-3088`.
[OPEN] Hidden-tab, repeated focus/blur, and a page that never presents a frame were inspected statically but not exercised in a browser under the explicit headless/GPU restriction.

## [VERIFIED] (b) Pass 82/83 freeze fixes and in-combat tripwire

[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:224`: `// Take the in-combat pipeline baseline after the warm-up so the tripwire`.
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:225`: `// counts only pipelines built while a settled match is being played.`
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:226`: `const combatBaseline = await page.evaluate(() => window.__PROFILE_AUDIT__?.pipelines ?? null);`.
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:272`: `// THE TRIPWIRE. Anything above zero is a pipeline built while the player`.
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:273`: `// was already in a settled match.`
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:274`: `pipelinesInCombat: sampled.pipelines === null || combatBaseline === null`.
[VERIFIED] `scripts/qa/audit-graphics-profiles.mjs:275`: `? null : sampled.pipelines - combatBaseline,`.
[VERIFIED] `src/rendering/render-runtime.ts:1858`: `await this.waitForSubmittedWork(12_000);`.
[VERIFIED] `src/rendering/render-runtime.ts:1883`: `await this.waitForSubmittedWork(12_000);`.
[VERIFIED] `src/legacy-main.ts:29946`: `await flushWebGpuFrames(12_000);`.
[VERIFIED] `git diff 612a4a83 8e1d3073 -- scripts/qa/audit-graphics-profiles.mjs` was empty, so the authoritative profile tripwire file was untouched by the original target.
[VERIFIED] `git diff 612a4a83 8e1d3073 -- src/rendering/render-runtime.ts` was empty, so the renderer's 12-second queue-fence implementation was untouched by the original target.
[VERIFIED] `src/legacy-main.ts` did change for admission wiring, but its target diff has no hunk at the `flushWebGpuFrames(12_000)` call; the fence line and surrounding fence sequence were read unchanged.
[CLAIMED] The lane report claims in-combat pipeline creation stayed at zero and the 12-second fence stayed untouched.
[OPEN] The numeric zero tripwire result was not independently measured because browser/GPU execution was prohibited.

## [VERIFIED] (c) Supporting-edit audit

### [VERIFIED] Switch-matrix probe

[VERIFIED] The original target hunk at `scripts/qa/probe-arena-switch-matrix.mjs:202-211` added an `error` listener that treated `EADDRINUSE` as success, printed `reusing external server`, and continued the probe.
[VERIFIED] This was not instrumentation-only: it changed the probe's failure tolerance and provided no identity check that the external server served this checkout's `DIST` or bundle.
[VERIFIED] The same script later fetched pages from `http://127.0.0.1:${PORT}` and reported the local source `gitSha` separately, so an external stale server could make the measured dist differ from the reported source tree.
[VERIFIED] Corrective commit `42d49034` restored the fail-closed `await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));` behavior, so a busy port aborts rather than contaminating evidence.
[OPEN] The corrected probe was not executed, per the no-browser/no-server restriction.

### [VERIFIED] Legacy-main size ratchet

[VERIFIED] The original target changed `LINE_CEILING` only from `37_100` to `37_124` at `src/legacy-main-size-ratchet.test.ts:78`.
[VERIFIED] It appended a new final `CEILING_HISTORY` record at `src/legacy-main-size-ratchet.test.ts:234-241`, dated `2026-09-03`, with a note naming the PASS 92 adaptive cadence feature and the extracted module.
[VERIFIED] The enforced growth comparison remains `toBeLessThanOrEqual(LINE_CEILING)` at `src/legacy-main-size-ratchet.test.ts:265`.
[VERIFIED] The one-direction ratchet comparison remains `!(lines <= LINE_CEILING)` at `src/legacy-main-size-ratchet.test.ts:294`, with the over-ceiling check at line 303.
[VERIFIED] This is a valid appended history entry, not a flipped comparison, lower-bound reintroduction, or silent threshold relaxation.

### [VERIFIED] Legacy-main wiring diff

[VERIFIED] Every original `src/legacy-main.ts` hunk was read: the new evaluator import; formatting-only type-line reflow; optional `exitReason`/`consecutiveStableFrames` fields; cadence state and recent-gap collection; the `finish` reason/telemetry fields; evaluator invocation; the `performance.now()` timeout timestamp; cadence projection; and match-profile telemetry fields.
[VERIFIED] No unrelated gameplay, input, networking, weapon, arena, or renderer logic was changed in the original `legacy-main.ts` diff.
[VERIFIED] The original target did contain a semantic timeout-timestamp change from `finish(now, true)` to `finish(performance.now(), true)`; it is part of the reviewed admission wiring and is why the live timer-lateness bound remains OPEN.
[VERIFIED] The corrective source diff changed only the evaluator clock argument to `foregroundEpochStartedAt`; it did not touch the protected 12-second fence sequence.

## [VERIFIED] (d) Headless gates

[VERIFIED] Final exact-head gate ran at `HEAD=223eb2fc14ab010597c213cff298d009d7ca70e5` with `npx tsc --noEmit`; exit code was `0` and the command emitted no diagnostics.
[VERIFIED] Final exact-head Vitest command was `npx vitest run src/admission-cadence-wait.test.ts src/presentation-prewarm-contract.test.ts src/legacy-main-size-ratchet.test.ts`; exit code was `0`.
[VERIFIED] Exact Vitest summary line: `Test Files  3 passed (3)`.
[VERIFIED] Exact Vitest summary line: `Tests  38 passed (38)`.
[VERIFIED] Exact Vitest summary line: `Start at  20:51:00`.
[VERIFIED] Exact Vitest summary line: `Duration  491ms (transform 192ms, setup 0ms, import 276ms, tests 147ms, environment 0ms)`.
[VERIFIED] The final exact-head status was clean on `contrib/dave-gaming-pc/claude/admission-cadence-wait` before this review file write.
[OPEN] No full suite, build, browser, Playwright, server, visual, GPU, or live admission measurement was exercised.

## [VERIFIED] (e) Corrective commits and evidence boundary

[VERIFIED] Commit `273546c5` was created with explicit paths `src/admission-cadence-wait.ts`, `src/admission-cadence-wait.test.ts`, and `src/legacy-main.ts`, using a `fix(load-time):` subject and the required Codex Luna trailer; it was pushed to the contribution branch.
[VERIFIED] Commit `42d49034` was created with explicit path `scripts/qa/probe-arena-switch-matrix.mjs`, using a `fix(load-time):` subject and the required Codex Luna trailer; it was pushed to the contribution branch.
[VERIFIED] Commit `223eb2fc` was created with explicit path `src/admission-cadence-wait.test.ts`, using a `test(load-time):` subject and the required Codex Luna trailer; it was pushed to the contribution branch.
[VERIFIED] No other worktree was read-modified, no process was killed/stopped/restarted, and no secret or token value was printed.
[VERIFIED] The original commit is not independently acceptable as written because the adversarial tests exposed fail-open cadence inputs and the probe accepted an unverified external server; those defects are corrected on the pushed review head.
[OPEN] Morning Opus still needs to decide whether the unexercised browser/GPU evidence is required before release publication; this review does not convert the lane report into runtime proof.

FINAL VERDICT: SHIP-WITH-FIXES [VERIFIED]
[VERIFIED] Justification: The identified cadence-safety and probe-integrity defects were fixed with focused tests and the required exact-head gates pass, while live browser timing and GPU tripwire evidence remain OPEN under the imposed restrictions.
