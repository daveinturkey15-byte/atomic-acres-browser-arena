# PASS 95 lane: time-of-day + weather lighting (every arena)

Date: 2026-09-05. Lane: `v8-time-of-day-weather-lighting`.
Branch: `contrib/dave-gaming-pc/claude/v8-time-of-day-weather-lighting`.
Base: `452d7aba` (candidate 7). Worktree: `C:/Users/david/projects/aa-p-time-of-day-weather-lighting`.
Browser port: 4266 only, headless installed Chrome, `PASS73_NATIVE_WEBGPU=1`, under the machine lock.

Claim-states: `[VERIFIED]` I ran it and quote the output; `[MEASURED]` a number
from an instrument I ran; `[OPEN]` not proven here.

## What already existed (read before designing)

`[VERIFIED]` by reading the candidate source:

- `src/rendering/lighting-conditions.ts` (Lane AB, PASS 87): time of day as
  uniform writes over the FROZEN light set, per-arena measured hour bands,
  shadow floor that can only rise, weather neutralisation, host-authoritative
  by derivation (`?tod=`, `?todhour=`, lobby row, QA hooks).
- `src/weather/weather-state.ts` + `rain-presentation.ts` (Pass 76-79): the
  seeded weather ladder (clear / overcast / light-rain / heavy-rain / storm),
  fog span, wetness integration, wet-surface material response
  (`wetSurfaceResponse`, 128 adopted surfaces), and rain that is ONE
  `InstancedMesh` of streaks plus one of splashes, built once at module scope
  (`rainPresentation.build(scene)` in `legacy-main.ts`): pooled, never
  spawned, never on the in-combat pipeline path.
- `src/nuketown2-lighting/`: the Nuke Town Rebuild's own authored skies
  (`late-morning`, `golden-hour` anchor, `overcast`) with physically derived
  exposure and the shade-readability floor 0.4536.
- `src/rendering/clustered-lights.ts`: 30 clustered local lights (window,
  porch, garage, street, appliance, vehicle) whose intensity is a uniform
  write driven by `duskLocalLightFade(hour)`.
- `scene.fog.color`, exposure and the sun re-aim already follow the hour; the
  re-aim requests a static shadow refresh ONLY when the sun moves by
  >= 0.35 degrees (`LIGHTING_CONDITION_SUN_STEP_DEGREES`).

What did NOT exist: a named dawn/day/dusk/night x clear/overcast/light-rain
catalogue for every arena; a night sky on Nuke Town; street/porch lights at
dawn; a sky BACKDROP that follows the sun (the panorama stayed constant while
the lights moved); a match-time / arena-configured preset; an instrument for
the lighting frame cost.

## What this lane adds

`[VERIFIED]` commits `a1238129` (feature) and `e749989b` (cost probe), pushed.

1. `src/rendering/sky-weather-presets.ts` (pure, no THREE): for every arena in
   `ARENA_IDS` (roster-derived, not a hand list) the presets `dawn|day|dusk|night`
   x `clear|overcast|light-rain`. Each resolves to the shipped
   `LightingConditionWrites` (sun/ambient/hemisphere/fill tint + intensity,
   sun elevation/azimuth delta, fog tint, exposure) PLUS `backdropIntensity`,
   the hour, the arena-clamped weather rung, its wetness target and rain rate,
   and the URL query that reproduces it. `arenaConfiguredSkyPreset()` derives
   each arena's default from its authored hour; `matchTimeSkyPreset()` walks a
   match dawn -> day -> dusk -> night in quarters. Import-time fail-closed
   sweep over the whole catalogue: composed shade response >= 1 (never darker
   than the shipped arena), shadow floor >= 1, backdrop inside its envelope,
   pinned arenas constant.
2. Sun-following sky: `scene.backgroundIntensity` is written inside the
   existing uniform-write gate in `legacy-main.ts` (`skyBackdropIntensity`:
   ratio of sin(solar elevation) against the authored hour, dimmed by the
   cloud deck, bounded [0.3, 1.15], exactly 1 at the authored hour in clear
   air). three r185 `renderers/common/Background.js` multiplies the background
   node by the `backgroundIntensity` uniform reference, so this is a uniform
   write with no pipeline permutation (nuketown2 budget 54 untouched).
3. Nuke Town Rebuild: two new authored skies, `dawn` (06:30, sun 8 degrees at
   +40 azimuth, 4 klx + 3 klx) and `night` (20:30, sun at the 6-degree floor,
   400 lx + 700 lx, cloud extinction 0.3, cool tints, practicals gain 1.6).
   Five skies in clock order so `cycle` walks a day. Every existing bound and
   sweep holds (`assertNuketown2PresetSafety`, `assertNuketown2LightingSafety`).
   Night readability, by construction: key at the shipped 0.55 floor, shadow
   floor 1.518, composed shade response 1.555x the golden-hour floor; the
   night reads by hue, a dim sky and blown fixtures (interior-look value
   composition), never by darker shade.
4. Street/porch/window lights come on with the clustered rig at night AND
   dawn: `localLightFadeForHour = max(duskLocalLightFade, dawnLocalLightFade)`
   (full <= 06:15, off by 07:30). `duskLocalLightFade` is unchanged and its
   monotone test is untouched.
5. `legacy-main.ts` 37,396 -> 37,376 lines: `LightingConditionBaseline` and the
   tint helper hoisted out; one backdrop write and one telemetry field added.
6. `scripts/qa/capture-arena-viewpoints.mjs --extra-query` and
   `scripts/qa/probe-pass95-lighting-cost.mjs` (instrument).

## Preset table (resolved values, `preset-table.json`)

`[VERIFIED]` generated by `npx tsx artifacts/qa/p95-presets.mts` from the
catalogue itself:

| Arena | night/clear query | backdrop | sun scale | shadow floor | dawn + light-rain query | backdrop | wetness | rain |
|---|---|---:|---:|---:|---|---:|---:|---:|
| nuketown2 | todhour=20.5&weather=clear | 0.548 | 0.550 | 1.518 | todhour=6.5&weather=clear (rain pinned out, see OPEN) | 0.729 | 0 | 0 |
| raid2 (pinned) | todhour=10.5 | 1.000 | 1.000 | 1.000 | todhour=10.5 | 1.000 | 0 | 0 |
| atomic-acres | todhour=18 | 0.872 | 0.872 | 1.147 | todhour=15&weather=light-rain | 0.992 | 0.55 | 0.34 |
| skyline-terminal | todhour=10.5 | 1.150 | 1.150 | 1.000 | todhour=6.8&weather=light-rain | 0.732 | 0.55 | 0.34 |
| rustworks-1v1 | todhour=22 | 0.715 | 0.715 | 1.328 | todhour=20&weather=light-rain | 0.903 | 0.55 | 0.34 |
| gun-range (indoor) | todhour=12 | 1.000 | 1.000 | 1.000 | todhour=12 | 1.000 | 0 | 0 |
| farcrysis | todhour=17 | 0.575 | 0.575 | 1.488 | todhour=9&weather=light-rain | 0.690 | 0.55 | 0.34 |
| high-seas | todhour=19 | 0.479 | 0.550 | 1.518 | todhour=7.5&weather=light-rain | 0.561 | 0.55 | 0.34 |
| test1 | todhour=13 | 1.028 | 1.028 | 1.000 | todhour=10 (clear-only) | 0.956 | 0 | 0 |
| test2 | todhour=18.5 | 0.574 | 0.574 | 1.490 | todhour=16 (clear-only) | 1.150 | 0 | 0 |
| map3 (pinned) | todhour=10 | 1.000 | 1.000 | 1.000 | todhour=10&weather=overcast | 0.876 | 0 | 0 |

Generic bands are NOT widened (widening one means re-running
`scan-lane-ab-band-readability.mjs`); `night` on a generic arena is its band's
late end, so on Farcrysis/Test1 it is the same hour as `dusk`.

## Static gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output.

`[VERIFIED]` `npx tsx scripts/qa/find-coplanar-pairs.ts --out artifacts/qa/p95-tod-coplanar.txt`:

```text
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 0
# boxes=950 · pairs<=0.03m: 288 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 274 · SAME-MATERIAL-VISIBLE: 0 · CONTACT: 4 · SAME-MATERIAL (benign): 10
```

`[VERIFIED]` targeted vitest: the first run over sky-weather-presets,
nuketown2-lighting (4 files), clustered-lights, lighting-conditions (3 files),
legacy-main size ratchet, pipeline-metrics, graphics-profile-contract and
cold-session-precompile-reach was `155 passed | 3 failed` (the dawn ramp broke
the monotone `duskLocalLightFade` test, and two of my own new assertions were
wrong). Fix: `duskLocalLightFade` restored unchanged, the dawn ramp moved to a
new `dawnLocalLightFade` / `localLightFadeForHour`; my two assertions
corrected. Re-run of the four touched files: `Test Files 4 passed (4) /
Tests 62 passed (62)`. No existing test was weakened.

## Finish round (2026-09-05)

`[VERIFIED]` commits `bcd7a961` (match-time wiring) and `f0eba84d`
(arena-default wiring), on top of `63e254ef`.

### Late item the last round did not report (review F6)

`[VERIFIED]` commit `59f8df6e`, already on the branch at review time:
`?sky=dawn|day|dusk|night` names a PASS 95 catalogue preset on the capture
path (`src/legacy-main.ts:4240-4242`). It resolves through
`skyTimePresetHour` into the same `fixedHour` the `?todhour=` override feeds,
so it adds a branch, not a pipeline. Precedence: `?todhour=` wins, hosted
lobbies ignore it (host-authoritative by derivation preserved), with a
pinning test (`src/rendering/lighting-conditions-light-set.test.ts:226-228`).
Weather still needs `?todhour=&weather=` or the QA hook (TODO below).

### (1) Match-time progression is wired

`[VERIFIED]` `cycle` mode now walks the catalogue dawn -> day -> dusk ->
night in quarters of the match: `resolveActiveLightingConditions`
(`src/legacy-main.ts:4232-4236`) takes its `fixedHour` from the new
`cycleMatchFixedHour()` (`src/rendering/sky-weather-presets.ts:199-208`),
which is `matchTimeSkyPreset()` quarters addressed through
`skyTimePresetHour()`, with the replicated match length
(`currentMatchRules().durationMs`, 300 s fallback where no clock runs).
Peer-identical with zero traffic: elapsed comes from the shared match clock
(`lightingConditionsElapsedSeconds`), the length from the replicated config.
`?todhour=` and `?sky=` still win; hosted lobbies ignore every local preset.
Shadow refreshes stay sun-gated: `reaimConditionedSun` only sets
`needsUpdate` past 0.35 deg, so quarters sharing an hour (narrow bands,
pinned arenas) cost no refresh. Behaviour change, stated plainly: `cycle`
no longer starts at a seeded ping-pong position but at the catalogue dawn
quarter; `resolveLightingHour()`'s own `cycle` arm is untouched and still
pinned by its direct-call tests. Duration fallback lives in
`sky-weather-presets.ts` so `legacy-main.ts` stays under its size ratchet
(`[MEASURED]` 37,390 <= 37,396 ceiling).

### (2) Arena-configured default applies at load

`[VERIFIED]` every other solo/capture mode boots at
`skyTimePresetHour(arenaConfiguredSkyPreset(arenaId).time)`
(`src/legacy-main.ts:4237-4240`) instead of a seeded random hour. Same
local-only rule: `?todhour=` wins, `?sky=` wins, hosted lobbies ignore it,
`cycle` yields to the quarters walk. Pinned arenas resolve to their authored
hour exactly as before, so the change is a no-op there. Behaviour change,
stated plainly: the solo/capture default is now deterministic per arena
(nearest preset to the authored hour, clear) rather than seeded variety;
the replicated `random` choice and its direct-call tests are untouched.

### Gates quoted

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output.

`[VERIFIED]` required gate globs
`npx vitest run src/*sky* src/*weather* src/*lighting* src/pipeline-metrics*.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts`:
`Test Files 11 passed (11) / Tests 193 passed (193)`.

`[VERIFIED]` wiring area
`npx vitest run src/rendering/sky-weather-match-wiring.test.ts src/rendering/sky-weather-presets.test.ts src/rendering/clustered-lights.test.ts src/rendering/lighting-conditions.test.ts src/rendering/lighting-conditions-light-set.test.ts src/rendering/lighting-conditions-replication.test.ts src/nuketown2-pipeline-budget.test.ts`:
`Test Files 7 passed (7) / Tests 118 passed (118)`. New tests: quarters walk
at the documented 300 s boundaries, roster-derived arena default for every
`ARENA_IDS` entry (no hand list), and source pins for the
`?todhour=`-wins / `?sky=`-wins / hosted-ignores / cycle-yields order.
No existing test weakened; tripwire 0 and nuketown2 pipeline budget 54
untouched (`src/nuketown2-pipeline-budget.test.ts` green in the run above).

`[VERIFIED]` review F7 single-file re-run from this HEAD:
`npx vitest run src/gameplay-state-property.test.ts`:
`Test Files 1 passed (1) / Tests 2 passed (2)`. The committed full-suite red
does not reproduce in isolation, so it reads as flake/nondeterminism outside
this lane's diff (this lane touches no gameplay-state path); recorded, not
explained away, and neither gate was touched.

`[OPEN]` frame cost < 1.5 ms and cold addition < 500 ms (review F4): still
unmeasured here. No browser, no GPU, no preview server in this session, so
`lighting-cost.json` stays `ok: false` and the cold-admission `cold exit 1`
is untriaged. For the integrator, under the machine lock:
bring the preview up (`port 4266`, `PASS73_NATIVE_WEBGPU=1`), re-run
`scripts/qa/probe-pass95-lighting-cost.mjs`, commit the JSON, and quote or
mark OPEN the ms-per-apply / frame means.

### TODOs the integrator owns (larger UNFINISHED items, file:line)

- `src/rendering/sky-weather-presets.ts:287-307` — `resolveSkyWeatherPreset()`
  stays test-only: the runtime consumes `skyTimePresetHour` + the existing
  hour/weather inputs, so `wetnessTarget`/`rainRate` duplicate
  `WEATHER_STATE_TABLE` values the weather system already reads. Safe as is;
  hooking the full resolved preset into the runtime is a separate change.
- `src/legacy-main.ts:4240-4242` — `?sky=` names time only, not weather;
  asymmetric vs the catalogue's time x weather shape. Extension point if
  captures ever need `?sky=dusk&weather=light-rain` in one param.
- `scripts/qa/probe-pass95-lighting-cost.mjs` +
  `docs/evidence/pass95/time-of-day-weather-lighting/lighting-cost.json` —
  F4 measurement above; browser budgets remain `[OPEN]`.
- True nights on narrow-band arenas (Farcrysis, Test1: `night` aliases the
  `dusk` hour) need measured band widening plus a re-run of
  `scripts/qa/scan-lane-ab-band-readability.mjs` — never a hand-edited hour.
