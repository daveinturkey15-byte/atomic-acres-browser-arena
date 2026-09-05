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
