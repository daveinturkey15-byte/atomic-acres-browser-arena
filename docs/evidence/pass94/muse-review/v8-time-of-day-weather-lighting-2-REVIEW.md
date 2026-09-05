# Muse review: v8-time-of-day-weather-lighting-2 (PASS 95 finish round)

Reviewer: Muse Spark 1.3 (skeptical second pair of eyes, no verifier run — no builds, no browsers, no GPU per brief).
Date: 2026-09-05. Worktree: `C:/Users/david/projects/aa-p-time-of-day-weather-lighting`.
Branch: `contrib/dave-gaming-pc/claude/v8-time-of-day-weather-lighting`.
Base for diff: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
HEAD at review: `1bf9eaa1`. Report reviewed: `docs/evidence/pass95/time-of-day-weather-lighting/REPORT.md`
(the Finish round section, commits `bcd7a961` + `f0eba84d` on top of `63e254ef`).
Earlier review: `docs/evidence/pass94/muse-review/v8-time-of-day-weather-lighting-REVIEW.md` (HEAD `59f8df6e` then).
Method: report first, then full source diff vs pass93 base, then targeted reads of every touched runtime line.
This review closes the two UNFINISHED wiring items from the -1 review and re-checks the brief's five items.

## Verdict: SHIP

Three reasons:

1. Both finish wirings are real by source trace, with the documented precedence intact (C1): the
   match clock feeds the quarters walk in `cycle` mode and the arena default feeds every other
   solo/capture boot, while `?todhour=` beats `?sky=` beats both, and hosted lobbies ignore all of it.
2. Every preserved invariant still holds by source with exact quotes (C2, C3, C4): shadow refreshes
   stay behind the 0.35-degree sun gate, the roster-derived default test loops all 12 `ARENA_IDS`
   with no hand list, and tripwire-0 / pipeline-budget-54 lines are byte-untouched by this lane.
3. The -1 review's two blocking docs/code gaps are closed and the remaining OPENs are honestly
   marked, not claimed (C5, O1): F6 staleness fixed by `1bf9eaa1`, UNFINISHED-1/2 wired by
   `bcd7a961`/`f0eba84d`, while frame-cost/cold stays `ok: false` + `[OPEN]` in both JSON and REPORT —
   an integrator pre-publish measurement, not a code defect in this diff.

## Findings

### C1 (check 1): matchTimeSkyPreset + arenaConfiguredSkyPreset are really wired, ?sky wins — PASS

- `src/legacy-main.ts:4235-4236` — cycle walk: `{ fixedHour: cycleMatchFixedHour(selectedArena.id,
  lightingConditionsElapsedSeconds, currentMatchRules().durationMs) }`, guarded by
  `lightingCaptureFixedHour !== null || privateLobbySnapshot || isSkyTimePresetId(lightingQuerySkyPreset)
  || activeLightingTimeChoice() !== 'cycle'`. So it fires only in `cycle` mode, only when neither
  override is present, never in a hosted lobby.
- `src/legacy-main.ts:4239-4240` — arena default: `{ fixedHour: skyTimePresetHour(selectedArena.id,
  arenaConfiguredSkyPreset(selectedArena.id).time) }`, guarded by the same three plus
  `activeLightingTimeChoice() === 'cycle'` (i.e. every non-cycle mode). `?sky=` still wins over it
  because the guard contains `isSkyTimePresetId(lightingQuerySkyPreset)`.
- `src/legacy-main.ts:4230-4231` — `?sky=` spread sits between `?todhour=` (`:4228`) and the two finish
  spreads, and its own guard requires `lightingCaptureFixedHour === null`, so `?todhour=` wins when
  both are given. The new wiring test pins this order by index (`sky-weather-match-wiring.test.ts:78-90`:
  `todhour > sky > walk`, `def > sky`).
- Match-clock provenance, traced end to end: `lightingConditionsElapsedSeconds = weatherElapsedSeconds`
  (`src/legacy-main.ts:31530`, same clock/seed the weather already agrees on) → fed into
  `cycleMatchFixedHour` → `/1000` with 300 s fallback inside `cycleMatchFixedHour`
  (`src/rendering/sky-weather-presets.ts:205-208`, handles `null`/`0`/`NaN` durationMs) →
  `matchTimeSkyPreset` quarters (`:181-186`, pure in both args, `min(3, floor(elapsed/length*4))`) →
  `skyTimePresetHour` (`:138-153`). Length provenance: `currentMatchRules()` (`src/legacy-main.ts:7364-7379`:
  explore → `EXPLORE_MATCH_RULES`, solo → `selectedArena.matchRules`, otherwise the replicated lobby
  config) — peer-identical with zero traffic as REPORT claims. Arena-load provenance: `selectedArena.id`
  (`:3401`, from `?map=`) flows into both spreads; default is deterministic per arena (nearest preset to
  authored hour, clear — `sky-weather-presets.ts:161-176`), a stated behaviour change from seeded variety.
- Host-authoritative by derivation preserved: every one of the four spreads is suppressed when
  `privateLobbySnapshot` is set, and the `?sky=` pin test was extended the same way
  (`lighting-conditions-light-set.test.ts:226-228`). No new traffic, no new replicated field.
- Why no fix: precedence, purity, fallback and lobby-ignore all check out by source. Smallest fix if
  candidate 9 wants anything more: none — code complete.

### C2 (check 2): shadow map refreshes only when the sun moves — PASS

- `src/legacy-main.ts:4129`: `LIGHTING_CONDITION_SUN_STEP_DEGREES = 0.35`, unchanged (no diff to this line).
- `src/legacy-main.ts:4263-4266`: `movedEnough` early-returns unless elevation or azimuth moved >= 0.35 deg;
  `sunLight.shadow.needsUpdate = true` (`:4277`) plus `requestStaticShadowRefresh()` (`:4279`) run only
  past the gate. No diff to `reaimConditionedSun` vs pass93 base.
- Consequence for the quarters walk, as REPORT states: quarters sharing an hour (narrow bands, pinned
  arenas — `cycleMatchFixedHour` returns the authored hour at every quarter there) resolve identical
  writes, so the outer writes-equality gate (`:4316`) already suppresses the apply, and even a forced
  apply would hit `!movedEnough` and skip the shadow refresh. Narrow-band `night`-equals-`dusk` costs
  no refresh. Verified by code path, not by measurement (no GPU in this session).
- Note (not a finding): `scene.backgroundIntensity` (`:4343`) is written on every gated apply, outside
  the sun sub-gate — correct, it also depends on `skyDarkenAmount`, and the outer gate suppresses no-op
  frames. The per-frame pre-resolve gate (`:4294-4300`, `clockStep` quantised at 4 Hz in cycle mode) means
  `resolveActiveLightingConditions` re-runs ~4x/s in cycle mode but writes only on quarter boundaries;
  that is a small frozen-record alloc rate, not a shadow cost.
- Smallest fix: none.

### C3 (check 3): roster-derived arena default test covers every registry arena — PASS

- `src/rendering/sky-weather-match-wiring.test.ts:96-116`: `for (const arenaId of ARENA_IDS)` with
  `expect(ARENA_IDS.length).toBeGreaterThan(0)` — asserts `arenaConfiguredSkyPreset` returns a valid
  time id, weather `'clear'`, finite hour, pinned arenas exactly at `authoredHour`, unpinned inside
  `[hourRange[0], hourRange[1]]`, with an explicit `nuketown2` continue (own skies). Roster-derived:
  `ARENA_IDS` (`src/arena-identity.ts:8-25`) holds all 12 ids; the test imports it, names no arena
  literally except the nuketown2 carve-out. A 13th arena with a daylight row is covered the moment it
  lands in the roster; without a daylight row the import-time sweep throws (fail-closed).
- Companion coverage in `src/rendering/sky-weather-presets.test.ts`: full catalogue loop
  (`:22-37`, every arena x 4 times x 3 weathers), band-containment loop (`:49-62`), pinned-identity
  loop (`:64-73`), per-arena backdrop envelope (`:128-143`). No hand list anywhere.
- Smallest fix: none.

### C4 (check 4): tripwire 0 and pipeline budget 54 unchanged — PASS, quoted

- `src/rendering/clustered-lights.ts:28-29`: `pipelineCount: 1,` / `pipelineBudgetCeiling: 54,` — no diff
  to these lines in this lane (the lane's diff to this file is only the dawn ramp + `localLightFadeForHour`).
- `src/nuketown2-pipeline-budget.test.ts:169-173`: `"reserves one fixed clustered update pipeline inside
  the 54-pipeline ceiling"` — `expect(pipelineCount).toBe(1)`,
  `expect(pipelineCount).toBeLessThanOrEqual(pipelineBudgetCeiling)`,
  `expect(pipelineBudgetCeiling).toBe(54)`. No diff to this file in this lane.
- `src/graphics-settings-registry.ts:932-934`: `"Its pipelines are compiled with the rest of this preset's
  at admission; the audit tripwire requires zero pipelines compiled in combat."` — comment, untouched;
  no diff to any graphics-profile/registry/pipeline file in this lane.
- Size ratchet intact: `LINE_CEILING = 37_396` (`src/legacy-main-size-ratchet.test.ts:78`); the finish
  commits hoist the fallback into `sky-weather-presets.ts` precisely to stay under it (commit message
  quotes `37386 <= 37396`; current file is 37,390 lines incl. comments — under ceiling either way).
- Smallest fix: none.

### C5 (check 5): earlier UNFINISHED list — items 1-2 CLOSED, items 3-6 still OPEN (all honestly recorded)

- UNFINISHED-1 (match-time unwired) → CLOSED by `bcd7a961`, verified in C1 above.
- UNFINISHED-2 (arena-default unwired) → CLOSED by `f0eba84d`, verified in C1 above.
- UNFINISHED-3 (`resolveSkyWeatherPreset()` test-only) → still OPEN, and REPORT now owns it as a TODO
  (`src/rendering/sky-weather-presets.ts:287-307` — runtime consumes `skyTimePresetHour` + existing
  hour/weather inputs; `wetnessTarget`/`rainRate` duplicate `WEATHER_STATE_TABLE`). Safe as is; hooking
  the full preset into the runtime is a separate change. No action for candidate 9.
- UNFINISHED-4 (weather axis stops at light-rain) → still OPEN by design (brief named
  `clear|overcast|light-rain`; `arenaWeatherPresetState` clamps to the highest available rung at/below
  requested). No action.
- UNFINISHED-5 (`?sky=` names time only) → still OPEN, REPORT-owned TODO (`src/legacy-main.ts:4240-4242`).
  Extension point only. No action.
- UNFINISHED-6/F4 (cost/cold evidence) → still OPEN, see O1 below. F6 (stale REPORT) → FIXED by `1bf9eaa1`
  (finish round section + TODOs). F7 (contradictory logs) → reconciled in REPORT with a quoted single-file
  re-run (`src/gameplay-state-property.test.ts`: 2/2 in isolation); this lane still touches no
  gameplay-state/cold-admission path (diff file list confirms), so "flake outside the lane's diff,
  recorded not explained away" is the honest disposition. No test weakened anywhere (F5 stands).

### O1: frame cost < 1.5 ms / cold addition < 500 ms — still OPEN (unmeasured, not disproven; pre-publish job)

- `docs/evidence/pass95/time-of-day-weather-lighting/lighting-cost.json:1-7`: still `"ok": false`,
  `"error": "page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4266/..."`. Committed `ms: 979`
  is time-to-failure, not a measurement. No `forcedApply`/`steadyState`/`frameNightLightRain` numbers
  exist anywhere in the evidence dir. REPORT marks it `[OPEN]` and assigns the integrator the exact
  command (`port 4266`, `PASS73_NATIVE_WEBGPU=1`, re-run `probe-pass95-lighting-cost.mjs`).
- The instrument measures the right things (forced-apply ms, steady-state counter deltas, rAF means);
  the code path it would measure is gate-suppressed steady-state (C2), so there is no source-level
  reason to expect a regression — but "no reason to expect" is not a number. Must not enter
  candidate 9 notes as a claimed fact.
- Smallest fix (integrator, under the machine lock, needs a browser — explicitly out of scope for this
  review session): bring the preview up, re-run the probe, commit the JSON, quote or keep OPEN the
  ms-per-apply / frame means. Separately triage `cold-admission/failure-receipt.json` (`cold exit 1`,
  untouched by this lane). Do not weaken any gate to get there.

## UNFINISHED (remaining, for the integrator — all already owned as REPORT TODOs/OPENs)

1. `src/rendering/sky-weather-presets.ts:287-307` — `resolveSkyWeatherPreset()` stays test-only (safe;
   separate change to hook the full preset into the runtime).
2. `src/legacy-main.ts:4240-4242` — `?sky=` names time only, not weather (asymmetric vs catalogue shape;
   extension point).
3. `scripts/qa/probe-pass95-lighting-cost.mjs` + `lighting-cost.json` — frame-cost/cold measurement OPEN
   (O1); browser work under the machine lock.
4. True nights on narrow-band arenas (Farcrysis, Test1: `night` aliases the `dusk` hour) need measured
   band widening + a re-run of `scan-lane-ab-band-readability.mjs` — never a hand-edited hour.

## Commit note

Staged and committed ONLY this file
(`git add docs/evidence/pass94/muse-review/v8-time-of-day-weather-lighting-2-REVIEW.md`).
Worktree untracked outputs (`captures/high-seas-night-light-rain/`,
`captures/rustworks-1v1-night-light-rain/`, `cold-admission/`) and all other lane files were neither
staged nor touched.
