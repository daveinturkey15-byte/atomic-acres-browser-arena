# Muse review: v8-time-of-day-weather-lighting (PASS 95 lane)

Reviewer: Muse Spark 1.3 (skeptical second pair of eyes, no verifier has run).
Date: 2026-09-05. Worktree: `C:/Users/david/projects/aa-p-time-of-day-weather-lighting`.
Branch: `contrib/dave-gaming-pc/claude/v8-time-of-day-weather-lighting`.
Base for diff: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
HEAD at review: `59f8df6e`. Report reviewed:
`docs/evidence/pass95/time-of-day-weather-lighting/REPORT.md` (127 lines, covers only
`a1238129` + `e749989b`; see F6).
Method: report first, then full source diff vs pass93 base, then targeted reads of every
touched file. No builds, no browsers, no GPU; all verdicts below are by source + the
lane's own committed logs. Per AGENTS.md multi-agent discipline, exit-code claims below
are checked against repository state, not trusted at face value.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. Core safety holds by source: roster-derived catalogue with import-time fail-closed
   readability sweeps (F1), zero new pipeline permutations inside the quoted 54 budget
   and in-combat tripwire (F2), shadow-gate and pooled-rain untouched (F3), no weakened
   thresholds (F5).
2. The performance half of the lane is unproven: the cost probe never produced a
   successful measurement (`lighting-cost.json` is `ok:false`, connection refused, in
   both HEAD and the dirty worktree copy), and the REPORT states no 1.5 ms / 500 ms
   numbers at all, so check (4) is OPEN, not failed, but it must not enter candidate 9
   as a claimed fact (F4).
3. The lane's own evidence contradicts itself in two places that must be reconciled
   before candidacy: `chain.log` says `cold exit 1` (with a committed `failure-receipt.json`
   verdict `fail`) while the REPORT's gate section omits cold admission entirely; and the
   committed full-suite log contains a failed test
   (`gameplay-state-property.test.ts` canonical-hash replay) while `chain.log` says
   `vitest exit 0`. Neither failure is in files this lane touched, but an unexplained red
   log plus a stale REPORT (missing HEAD commit `59f8df6e`) is exactly what the second
   pair of eyes is for (F6, F7).

## Findings

### F1 (check 1): presets cover every registry arena; night readability holds by construction — PASS with noted aliasing

- `src/rendering/sky-weather-presets.ts:321`: `assertSkyWeatherPresetSafety()` loops
  `for (const arenaId of ARENA_IDS)` x every time x every weather preset. Roster-derived,
  not a hand list. Called at import time (`:351`), so the catalogue fails closed.
- Readability invariants, `sky-weather-presets.ts:325-334`: composed shade response
  (`ambientIntensityScale * luma(ambientTint) * exposureScale`) `>= 1 - 1e-9` (never darker
  than the shipped arena) and `shadowFloorScale >= 1 - 1e-9`, for every arena x preset.
  Backdrop pinned inside `[0.3, 1.15]` (`SKY_BACKDROP_INTENSITY_BOUNDS`, `:208`).
  Pinned arenas provably constant (`:343-347`).
- Nuke Town night, `src/nuketown2-lighting/presets.ts:315-325`: sun at the 6-degree floor,
  key at the shipped 0.55 floor, shadow floor saturating at ~1.52 ceiling, composed shade
  +55% above the golden-hour floor. Night reads by hue/sky/practicals, never by darker
  shade. Preset table corroborates (`preset-table.json`: nuketown2 night/clear backdrop
  0.548, sun scale 0.550, shadow floor 1.518).
- Aliasing (admitted in REPORT, verified at `sky-weather-presets.ts:147-153`): generic-arena
  `night` returns the band's `high` end, i.e. the identical hour to `dusk` on narrow-band
  arenas (Farcrysis 17, test1 13). Readability still holds (scales >= 1), but "night" there
  is a label over the dusk hour, and widening a band requires re-running
  `scan-lane-ab-band-readability.mjs`. Acceptable for SHIP; calls it out so candidate 9
  notes do not oversell a true night on every arena.
- Why no fix: sweep already enforces the invariant; aliasing is a documented scope
  boundary, not a bug. Smallest fix if candidate 9 wants true nights: widen the measured
  bands per-arena and re-run the band-readability scan; do not hand-edit hours.

### F2 (check 2): no new pipeline permutations; budget 54 and tripwire 0 intact — PASS, quoted

- `src/rendering/clustered-lights.ts:28-29`: `pipelineCount: 1, pipelineBudgetCeiling: 54`
  (unchanged by this lane; no diff to these lines).
- `src/nuketown2-pipeline-budget.test.ts:169-173`: `"reserves one fixed clustered update
  pipeline inside the 54-pipeline ceiling"` — `expect(pipelineCount).toBe(1)`,
  `expect(pipelineBudgetCeiling).toBe(54)`. Untouched by the lane (no diff to this file).
- In-combat tripwire, `src/rendering/graphics-settings-registry.ts:932-934` (comment):
  `"Its pipelines are compiled with the rest of this preset's at admission; the audit
  tripwire requires zero pipelines compiled in combat."` Untouched; no diff to any
  graphics-profile/registry/pipeline file in this lane.
- The sun-following sky is `scene.backgroundIntensity = skyBackdropIntensity(...)` at
  `src/legacy-main.ts:4334`, placed AFTER the writes-equality gate (`:4307:
  if (!force && lightingConditionWritesEqual(...)) return;`). three r185
  `renderers/common/Background.js` multiplies the background node by that uniform, so this
  is a uniform write on the existing path: no new material, no new graph, no precompile
  entry, no combat-time compile. Claim in REPORT item 2 checks out by source.
- New `?sky=` path (`legacy-main.ts`, HEAD commit `59f8df6e`) resolves through
  `skyTimePresetHour` into the same `fixedHour` the `?todhour=` override already feeds;
  it adds a branch, not a pipeline.

### F3 (check 3): shadow refresh still sun-gated; rain still pooled — PASS

- `src/legacy-main.ts:4129`: `LIGHTING_CONDITION_SUN_STEP_DEGREES = 0.35` unchanged.
  `:4254-4259`: `movedEnough` early-returns unless elevation or azimuth moved >= 0.35 deg.
  No diff to the re-aim logic vs pass93 base.
- Note: `scene.backgroundIntensity` (`:4334`) is written on every gated apply, not inside
  the sun-movement sub-gate — correct, because it also depends on `skyDarkenAmount`
  (weather), and the outer writes-equality gate (`:4307`) already suppresses no-op frames.
  The probe's steady-state counter check (uniformWrites/resolves/sunReaims deltas over
  3 s) is the right instrument for this; it just never ran green (F4).
- Rain: zero diff to `src/weather/` or rain presentation. `src/legacy-main.ts:4955`:
  `rainPresentation.build(scene)` once at module scope. `src/weather/rain-presentation.ts:864`
  and `:897`: exactly two `new THREE.InstancedMesh` (streaks `pass76-rain-streaks`,
  splashes `pass76-rain-splashes`), `frustumCulled = false`, counts driven, never
  spawned. `resolveSkyWeatherPreset` carries `wetnessTarget`/`rainRate` from
  `WEATHER_STATE_TABLE` (`sky-weather-presets.ts:290-301`) as data for the existing hooks;
  no presentation object is constructed per frame.

### F4 (check 4): frame cost < 1.5 ms and cold addition < 500 ms — OPEN (unmeasured, not disproven)

- `docs/evidence/pass95/time-of-day-weather-lighting/lighting-cost.json:1-7`: `"ok": false`,
  `"error": "page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4266/..."`.
  The committed copy (`ms: 979`) and the dirty worktree copy (`ms: 5908`, uncommitted —
  I staged nothing but this review file, see commit note) both failed the same way: the
  preview server was not up when the probe ran. No `forcedApply`, `steadyState`, or
  `frameNightLightRain` numbers exist anywhere in the evidence dir.
- The REPORT contains no 1.5 ms or 500 ms figures at all — the numbers in my brief appear
  nowhere in the lane's claims, so there is nothing to quote; the check is OPEN.
- The instrument itself (`scripts/qa/probe-pass95-lighting-cost.mjs`, 124 lines) measures
  the right things: forced-apply ms per apply (200 alternating dawn/night applies),
  steady-state counter deltas over 3 s, and rAF means at authored/night/night+rain.
- Cold admission: `chain.log` records `cold exit 1`, and
  `cold-admission/failure-receipt.json` has `"verdict": "fail"` on
  `pass65-cold-physical-menu-webgpu-admission` (`WebGPU queue completion exceeded 12000 ms
  ... fenced draws 577`, plus `duplicateArenaRoots: true`, scene stuck at
  `waiting-for-authored-textures`). No "cold addition under 500 ms" figure exists either.
- Smallest fix: bring the preview up under the machine lock per REPORT (`port 4266`,
  `PASS73_NATIVE_WEBGPU=1`), re-run `probe-pass95-lighting-cost.mjs --url
  http://127.0.0.1:4266 --arena nuketown2 --out` to green, commit the resulting JSON, and
  either quote the ms-per-apply / frame means in the REPORT or mark the 1.5 ms / 500 ms
  bounds OPEN. Separately triage the cold-admission failure (infra flake vs regression —
  this lane touches no arena construction or weapon corpus path) and record the verdict.

### F5 (check 5): no test loosened — PASS, two contracts legitimately extended (flagged, not failures)

- `src/nuketown2-lighting/presets.test.ts:36-37`: `three skies` expectation extended to
  `['dawn', 'late-morning', 'overcast', 'golden-hour', 'night']`. Widened for the two new
  authored skies, thresholds untouched.
- `src/nuketown2-lighting/writes.test.ts:83-86`: cycle expectation `3 -> 5` skies; `:96-99`:
  `nuketown2PresetForFixedHour(20)` remapped `golden-hour -> night`, with `18 -> golden-hour`
  and `5 -> dawn` added. Behavior change (20:00 now resolves to the 20:30 night sky), but it
  is the direct consequence of the new sky, and hour 18 still hits golden-hour. Not a
  loosening; flagging so candidate 9 notes the remap.
- `src/rendering/clustered-lights.test.ts:86+`: purely additive dawn-ramp test;
  REPORT states `duskLocalLightFade` was restored byte-identical after the first run broke
  its monotone test, and the diff confirms the old test body is intact.
- `src/rendering/lighting-conditions-light-set.test.ts:228-230` (new): pins the `?sky=`
  lobby guard by source-pattern match, same technique as the neighboring `?todhour=` pin.
  Source-pattern pins are brittle by design (they are tripwires), not loosenings.
- No timeout, threshold, tolerance, or bound was widened anywhere in the diff.

### F6: REPORT is stale relative to HEAD — FIX REQUIRED (docs only)

- `docs/evidence/pass95/time-of-day-weather-lighting/REPORT.md:44` claims
  `[VERIFIED] commits a1238129 (feature) and e749989b (cost probe), pushed` — but HEAD is
  `59f8df6e` (`?sky=dawn|day|dusk|night` capture-path preset, +10/-1 across `legacy-main.ts`
  and the light-set test). The `?sky=` path is therefore unreported evidence entering
  candidate 9.
- The `?sky=` change itself is sound: `legacy-main.ts` guard
  `lightingCaptureFixedHour !== null || privateLobbySnapshot ||
  !isSkyTimePresetId(lightingQuerySkyPreset)` correctly gives `?todhour=` precedence and
  ignores the preset in hosted lobbies (host-authoritative by derivation preserved), with a
  pinning test. Smallest fix: append a REPORT item 7 describing `59f8df6e` (same shape as
  items 1-6) rather than rewriting history.

### F7: lane logs contradict the REPORT's gate section — RECONCILE BEFORE CANDIDACY (verification only)

- `chain.log`: `cold exit 1` at 07:42, yet REPORT "Static gates" lists only tsc, coplanar,
  and targeted vitest — cold admission is silently omitted.
- The committed full-suite log (evidence dir, run ending 08:36) shows
  `src/gameplay-state-property.test.ts > replays every generated sequence to the same
  canonical hash` FAILED (1 failed / rest passed in the visible portion), while `chain.log`
  says `vitest exit 0` at 08:02. Different runs, different hours — but a red full-suite log
  committed beside a green chain claim must be explained, not averaged.
- Neither red file is in this lane's diff (no touch to cold admission, gameplay state, or
  weapon corpus), so the likely story is infra flake + nondeterministic hash replay — but
  "likely" is not evidence. Smallest fix: re-run the single failing test file plus the cold
  gate from this HEAD, commit the receipts, and note the outcome in the REPORT. Do not
  weaken either gate to get there.

## UNFINISHED (brief requirements vs diff, best-effort — no numbered brief file exists in this worktree or the queue dirs; reconstructed from REPORT "What did NOT exist" + the catalogue API surface)

1. Match-time progression unwired: `matchTimeSkyPreset()` (`sky-weather-presets.ts:181-186`,
   dawn→day→dusk→night in quarters) has zero runtime consumers — only its unit test calls
   it. No match clock feeds it; matches do not walk a day. Pure function, tested, dead.
2. Arena-configured default unwired: `arenaConfiguredSkyPreset()` (`:161-175`) likewise has
   zero runtime consumers outside tests/`assertSkyWeatherPresetSafety`. Arenas still boot at
   their authored hour via the old path; nothing selects a "configured preset".
3. `resolveSkyWeatherPreset()` (`:287-307`) is test-only: the runtime path consumes
   `skyTimePresetHour` + `skyBackdropIntensity` + the existing `resolveLightingConditions`
   hour/weather inputs. `wetnessTarget`/`rainRate` in the resolved preset duplicate
   `WEATHER_STATE_TABLE` values the weather system already reads — no new hookup, which is
   safe, but the "catalogue" as a runtime object exists only in tests and the preset-table
   generator.
4. Weather axis stops at light-rain: heavy-rain/storm rungs are clamped away by
   `arenaWeatherPresetState` (`:193-201`, highest rung at-or-below requested). Matches the
   brief's named `clear|overcast|light-rain` axis, so in-scope — listed only so candidate 9
   does not claim full-ladder coverage.
5. `?sky=` names time only, not weather (hour via `skyTimePresetHour`; weather still needs
   `?todhour=&weather=` or the QA `setWeatherOverride` hook). Fine for captures, asymmetric
   vs the catalogue's time×weather shape.
6. Cost/cold evidence (F4) and REPORT staleness (F6) are the unfinished verification, not code.

## Commit note

Staged and committed ONLY this file (`git add
docs/evidence/pass94/muse-review/v8-time-of-day-weather-lighting-REVIEW.md`). Noted at
review time: worktree carries an uncommitted modification to
`docs/evidence/pass95/time-of-day-weather-lighting/lighting-cost.json` (committed `ms:
979` vs worktree `ms: 5908`, both `ok: false`) plus untracked capture/cold-admission
outputs from the lane's chain. None of that was staged or touched.
