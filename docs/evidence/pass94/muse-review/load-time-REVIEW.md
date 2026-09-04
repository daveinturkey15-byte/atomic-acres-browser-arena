# Muse review — PASS 94 load-time lane

**Worktree** `C:/Users/david/projects/aa-claude-lt` · **Branch** `contrib/dave-gaming-pc/claude/load-time-verified`
**Range** `origin/contrib/dave-gaming-pc/omp/pass84-overnight..HEAD` (10 ahead: `8e1d3073`, `273546c5`, `42d49034`, `223eb2fc`, `213dc777`, `c7bfadf3`, `45f46cc8`, `fab34311`, `d57871de`, `f5f59e8f`)
**Report reviewed** `docs/evidence/pass94/load-time/REPORT.md` (head `f5f59e8f`)
**Scope read** full `git diff` over `src` + `scripts` (8 files, +1367/−26); `src/admission-cadence-wait.ts`, `src/weapon-rehearsal-scheduler.ts`, `src/legacy-main.ts` integration, both new tests, `scripts/qa/probe-weapon-switch-latency-cdp.mjs` (new gate), `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` (tripwire definition, pre-existing file), `src/weapon-presentation.ts` `prepareBrowserWeapon`/`prewarmBrowserModel` path. No builds, no browsers, no suite runs; `src/` untouched by this review.

Claim-states: `[VERIFIED]` = confirmed in diff/report source on this head; `[OPEN]` = residual risk or owner decision.

---

## 1. `[VERIFIED]` The 12 s WebGPU fence is untouched and the settle is never removed

`git diff <merge-base>...HEAD -- src/legacy-main.ts | grep -c "12_000"` is 0 for the fence lines; the only `12_000` touches in the diff are none — all four cold-generation fences are context lines, byte-identical:

- `src/legacy-main.ts:11096` — `await flushWebGpuFrames(12_000);` (menu/deployment fenced upload frame).
- `src/legacy-main.ts:30022` — `await flushWebGpuFrames(12_000);` (arena-transition staged composition).
- `src/legacy-main.ts:30082` — `await flushWebGpuFrames(12_000);` (quality-presentation exact scene pass).
- `src/legacy-main.ts:30108` — `await flushWebGpuFrames(12_000);` (longer menu/loading allowance).

The warm-frame fence is also untouched: `src/legacy-main.ts:2576` still `const MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS = 4_000;`, and every admission flush still passes that constant (`:2645,2721,2727,2756,2846,2999,3197,3286`). The settle is still called on the admission path: `src/legacy-main.ts:17692` `await settleWebGpuPresentation('Initial match');`, and `settleWebGpuPresentation` at `:2881` still does `flush + 3×(submit + flush) + settleMatchAdmissionAdaptiveWebGpuPresentation`. The report §7 quotes the same four call sites and the pinning contract verbatim — accurate.

No finding. No fix.

## 2. `[VERIFIED with one OPEN residual]` Deferred warm-up can no longer force a submission in combat, but "safe window" ≠ "tripwire combat"

Traced end to end on HEAD:

- Predicate: `src/weapon-rehearsal-scheduler.ts:113` `isSafeWeaponRehearsalWindow = window !== 'combat'`. Slice: `:118–129` returns `[]` for `combat`, one ID otherwise. Scheduler `:168–190` early-returns on `!isSafe…(window)`, on `isPreparing()`, and while a slice is in flight — and its input type no longer accepts `exercise`/`backend` at all, so `exercisePreparedWebGpuWeaponSwitchesFor` is unreachable from a gameplay frame. The defect comment at `:145–167` names the exact 38× `Forced WebGPU submission requires an idle completion frontier` failure from `pass74-arena-boot-smoke` and why the fix is `prepareBrowserWeapon`-only. This half of the claim holds.
- Producer: `src/legacy-main.ts:19168–19173` `weaponRehearsalWindow()` returns `'menu' | 'respawn' | 'pre-match-countdown' | null` — **`null` in combat**, so `frame()` at `:31101–31102` (`const rehearsalWindow = weaponRehearsalWindow(); if (rehearsalWindow) scheduleDeferredWeaponRehearsal(...)`) schedules nothing during combat. Good.
- Fallback: `:19175–19179` `weaponRehearsalWindowForSwitch()` maps the same state to `'combat'` in combat; `switchWeapon` at `:19188` → `decideWeaponSwitchRehearsal(state, id, 'combat')` (`scheduler.ts:131–143`) yields `'synchronous-before-switch'` for any unrehearsed ID, and `:19208–19210` runs `rehearseWeaponBeforeSwitch(…, prepareBrowserWeapon)` — `await prepare` then `commit()`. So an unrehearsed combat switch is an async barrier, not a same-tick commit. In normal play it is unreachable (see §5: `reachableDeferred: []`), but the path exists and is async by construction.

`[OPEN]` residual — two halves of "combat" disagree, and `prepare` is not pipeline-free:

1. The scheduler's `combat` is `gameStarted && menu hidden && player.alive && phase !== 'warmup'` (`legacy-main.ts:19168–19179`). The tripwire's "in window" is wall-clock: everything created between `windowStartedAt` (12 s after match-active) and +75 s (`probe-pipeline-compile-stalls-cdp.mjs:204–260`), explicitly including deaths/respawns — its state track samples `alive/weapon` every 250 ms precisely to attribute bursts to death/respawn. A `respawn` deferred slice therefore runs **inside** the tripwire window by definition.
2. `prepareBrowserWeapon` (`src/weapon-presentation.ts:2945–2966`) → `prewarmBrowserModel` (`:3505–3525`) → `this.gpuPrewarmer!(model, …)` (`:3512`). That hook is the GPU-upload/compile half (upload + `renderer.compile`-class work); it does not `submitFrame`/`flush`, which is why the idle-frontier error is gone, but on WebGPU a first-ever compile of a deferred viewmodel **is** a `createRenderPipeline` the probe counts. The report's after-runs show no such extra (in-window = 1, identical first-death `MeshBasicMaterial` on both builds — §6), so this is latent, not observed. But a future arena whose deferred set is not menu-warm before the window, or a respawn slice racing the window, would trip the 0-contract without touching the fixed forced-submission path.

**Finding F1 (small, real):** safe-window predicate allows pipeline-creating `prepare` during `respawn`/`pre-match-countdown` windows that the tripwire counts as in-combat. File: `src/weapon-rehearsal-scheduler.ts:113`, `src/legacy-main.ts:19168–19173,31101–31102`. Why: `window !== 'combat'` is a submission-safety predicate, not a pipeline-creation predicate; the report §6 honestly records 1 ≠ 0 but attributes it fully to the pre-existing transparent, which is correct today and fragile tomorrow. Smallest fix (pick one, in this order): (a) restrict the deferred scheduler to `'menu' | 'admission-settle'` only and leave `respawn`/`pre-match-countdown` to the synchronous pre-switch barrier — one-line predicate change plus one regression test (`nextDeferredWeaponRehearsalSlice(state,'respawn') === []`); or (b) keep the windows but add probe attribution that excludes/filters by label — assert `in window === 0 for labels matching /Pass65_/`, so a deferred-viewmodel compile reds with its own name instead of hiding inside the `MeshBasicMaterial` row.

**Finding F2 (fallback async gap, by design — document, don't "fix"):** `src/legacy-main.ts:19208–19228` — an unrehearsed combat switch awaits `prepare` across promise jobs, drops the switch if `!player.alive || player.weapon === id` at commit time, and no-ops new requests while `pendingWeaponSwitchRehearsal` is set (`:19201`). Why listed: the weapon-switch probe proves this branch is dead in normal play, but any future loadout/handicap rule that makes a deferred weapon reachable turns a same-tick switch into a multi-frame one plus a swallowed second press. Smallest fix: keep the barrier (it is the fail-closed choice), but add the probe's `reachableDeferred` assertion as a blocking gate on any loadout/handicap change — the probe already reds on it; wire it into the lane's required gates so the branch cannot silently become live.

## 3. `[VERIFIED]` The tripwire evidence is real — it quotes 1, not 0, against itself

The report §6 does not claim the 0-contract is met. It publishes the full 4-cell table (before/after × atomic-acres/nuketown2, `probe-pipeline-compile-stalls-cdp.mjs --seconds 75`): pipelines-before 375/373/253/253, **in-window 1/1/1/1**, in-stall 0, enrichment 0× — then identifies the one creation on all four runs as `renderPipeline_MeshBasicMaterial_774` within ~1.8 s of the player's FIRST death (four timestamp pairs quoted), drawn from `_renderTransparents`, never inside a stall, present identically on the merge base (which has no scheduler) and surviving the §3 fix. That is a genuine probe run with timestamps, labels, and a baseline control — not a bare claim — and it correctly marks the first-death transparent as `[OPEN]` pre-existing, needing its own lane. The only wording to tighten is §6's "not attributable to, or fixable inside, this one": true for the forced-submission half (F1's compile half is the stated exception, hence SHIP-WITH-FIXES not SHIP).

## 4. `[VERIFIED]` The adaptive wait's decision function has no early-exit hole; the "never fires" is measured, not a bug in the tests

Read `src/admission-cadence-wait.ts:47–190` against `src/admission-cadence-wait.test.ts` (10 cases):

- Clamps are fail-closed one-directional: ceiling `min(5_000, …)` (`:51–54`), target `max(30, …)` (`:57–59`), long-task `min(50, …)` (`:62–64`), tolerance `min(0.20, …)` (`:66–69`). A caller cannot widen/extend/lower any of them; non-finite clock → `elapsedMs = ceilingMs` → degraded ceiling exit. First sample (`previousFrameAt <= 0`) never exits; zero/backwards/non-finite deltas and invalid history reset to 0, never exit.
- Warm-up hole closed: `< 5 samples` accepts `≤ 50 ms` frames as stable, but `consecutiveStableFrames = min(prior+1, recentGaps.length)` (`:135–138`) caps the run at the history length, and the history-tail recount (`:145–157`) takes `min(counter, stableHistoryFrames)` once a median exists — the "29 injected with 1 sample" case stays at 1 and cannot exit (test `fails closed…`, `does not count a long warm-up frame`). Progress (`progressReady`) and floor gates are conjunctive with the 30-frame run (`:160`).
- Integration (`legacy-main.ts:3167–3186`) preserves the pre-existing `minimumStableWindowMs = 1_000` OR-path (`:3179`) alongside the adaptive exit (`:3176`), both gated on `presentationProgressReady` (which itself requires submission+completion advances with all gaps ≤ 50 ms, `:3144–3147`, and is forced false on any hitch-stall, `:3156–3163`). So the adaptive branch can only shorten 1,000 ms → ~500/210 ms when 30 consecutive frames are genuinely stable; it can never exit later than the 5 s ceiling (watchdog `:3088` + epoch check `:3183` + evaluator ceiling). The report §4's telemetry (`resets == samples == 72–74`, `maximumGapMs ≈ 82 ms`, `consecutiveStableFrames: 0`, `exitReason: ceiling-timeout` on all three arenas, identical on base) is therefore the expected outcome of a ~68 ms/frame admission warm loop against a 50 ms hitch threshold — 0 ms saved, correctly not manufactured by widening tolerance/threshold.

**Finding F3 (telemetry-only, not a hole):** `resumeSampling` (`legacy-main.ts:3090–3110`) resets `stableSince`/`previousAt` but carries `recentGaps` (cap 60) and `consecutiveStableFrames` across foreground epochs; the next sample's `previousFrameAt <= 0` branch resets the counter to 0 anyway, so the only effect is one stale-filled median on the second epoch's 5th frame — negligible, but a one-line `recentGaps.length = 0; consecutiveStableFrames = 0;` on epoch reset would make the evaluator's history match its epoch. Optional; not a ship-blocker.

## 5. `[VERIFIED]` No host/guest divergence in admission timing

The diff introduces no `network.role` branch anywhere in the admission path: `waitForStableMatchAdmissionCadence` (`:2993–3239`), `weaponRehearsalState`/`generation` (`:6075–6084`, `:36969`), `begin/finalizeMatchAdmissionProfile` (`:36966–37003`), both rehearsal windows (`:19168–19179`), and the deferred scheduler wiring (`:6078–6084`, `:31101–31102`) are all local-presentation state driven by local `rAF`, local `visibilityState`/`hasFocus`, and local `matchStartPreparing`/`gameStarted`/`menuLifecycle`/`matchState.phase`. Rehearsal marks only affect which local viewmodels are GPU-ready; authority, loadout commit, and trigger/reload authority (`syncLocalTriggerAuthority`, client/guest guards elsewhere) are untouched. Host and guest each pay their own local admission; there is no replicated rehearsal registry to diverge. Gun-range note (`REPORT §2`, `arenaPickupWeaponIds` returning the whole roster on gun-range) is by design and local-only.

---

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. **The load-bearing safety claims verify.** The 12 s fence and settle are byte-untouched (§1); the forced-submission defect was caught red by `pass74-arena-boot-smoke`, fixed by removing the state walk from the deferred path (not by relaxing the frontier check), and covered by the first scheduler unit tests plus two honest probe gates (switch-latency `reachableDeferred: []`, same-tick commit ≤ 1.6 ms; tripwire 1 == 1 with baseline control).
2. **The measured wins/losses are honestly reported and correctly scoped.** Rehearsal scoping saves 2.9–4.4 s on atomic-acres/nuketown2 with gun-range unchanged by design (§2 table deltas reproduce the scoping arithmetic); the cadence wait is correctly marked DO-NOT-SHIP-as-a-win with 0 ms and kept only for its diagnosing telemetry (§4) — nothing was widened to manufacture a green.
3. **Two known-OPEN rows must not ship silently, and F1 needs its one-line answer.** The in-combat pipeline count is 1, not 0, on both builds (pre-existing first-death transparent — needs its own lane and an owner decision on the PASS 94 candidate), and the full suite carries the pre-existing `audio-music-rotation-runtime` timeout on both builds (row stays OPEN, timeout correctly not raised). F1 (respawn-slice `prepare` can still compile inside the tripwire window under a different definition of "combat") is latent today and should land as the `menu | admission-settle`-only predicate or the label-filtered tripwire assertion before the next lane builds on this scheduler.

Not a DO-NOT-SHIP: no fence change, no silent green, no unreviewed async commit path in normal play. Not a clean SHIP: F1 + the two carried OPEN rows need explicit owner sign-off on the candidate.
