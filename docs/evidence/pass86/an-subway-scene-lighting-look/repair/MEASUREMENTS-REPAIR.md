# HF-421 repair pass — what was wrong, what was fixed, and what the numbers are now

Lane AN (`subway-scene-lighting-look`), repair pass, Claude Code / Opus 5.1,
`dave-gaming-pc`, 2026-09-03. Branch
`contrib/dave-gaming-pc/claude/hf421-subway-lighting-trial`, worktree
`C:/Users/david/projects/aa-claude-subwaylook`.

This document supersedes the cost and readability sections of the sibling
`../MEASUREMENTS.md`. That file is left in place because its §6 findings still
stand and because a report that quietly rewrites its own history is worse than
one that says what it got wrong. **Where the two disagree, this one is right.**

## 0. Conditions

Every number here was taken with the owner's ComfyUI queue idle
(`{"queue_running": [], "queue_pending": []}`, re-checked by the shared
`waitForSharedMachine` guard immediately before each browser), headless Chrome
with WebGPU on an RTX 5080, one browser at a time, GPU free ≥ 4458 MiB at every
launch (one run waited out a 1448 MiB reading before starting). Private ports:
4223 (cost harness), 4224 (preview for readability and stills), 4225 (tripwire).
Every server started here was confirmed stopped. No headed browser was launched
and no process the lane did not start was killed.

---

## 1. BLOCKER — the branch turned a permanent gate red on the shipping arena

`src/collider-visual-parity-gate.test.ts` builds the real **Map 3 arena** scene
and it failed 2 of 6 tests on the first HF-421 build.

```
map3: new walk-through meshes need triage and a ledger row
  map3-station-bay-halos @ [-54.2, 3.26, 13] size [36.8, 6.45, 3.2]
  path Map3 arena/map3-lane-godrays/map3-station-bay/map3-station-bay-kit/map3-station-bay-halos
map3: 1 unrated ghost shot surface(s) over ceiling 0: (same mesh)
```

Recorded here, reproduced by this repair pass against commit `91face1c`:
`vitest-collider-parity-before-repair.log.txt` (exit 1, **2 failed | 4 passed**).

**Cause.** The kit merged the ceiling halo cards (y = `ROOF_Y - 0.72` ≈ 6.48)
and the floor light pools (y = 0.03) into ONE mesh for one draw. Their shared
AABB therefore spanned the whole combat volume, and the audit — correctly —
read a 36.8 × 6.45 × 3.2 m visible solid standing in the aisle with no movement
collider and no ballistic rating.

**Fix.** Two meshes, `map3-station-bay-ceiling-halos` and
`map3-station-bay-floor-pools`. Each is a flat horizontal sheet whose AABB is
~0 m tall, below `WALKTHROUGH_MIN_HEIGHT_M` and `BALLISTIC_MIN_HEIGHT_M` (both
0.9 m), so both audits skip them honestly. Cost: **one draw**.

**What was deliberately NOT done.** The reviewer's suggested fix was to rename
the meshes onto the existing `particle|sprite|spark|smoke|dust|mist|rain`
exclusion pattern. That would have made the gate green by renaming geometry
onto an audit's escape hatch rather than by changing the geometry, and it is
one edit away from being a way to hide any mesh from the audit. No row was
added to `ACCEPTED_WALK_THROUGH` or `ACCEPTED_SHOOT_THROUGH` either — that
ledger is documented shrink-only.

**After:** `vitest-focused-after-repair.log.txt` — 8 files, **61 tests, all
passed**, including both parity gates, both Map 3 arena suites and
`src/rendering/art-direction.test.ts`.

The earlier report's line "no gate was touched" was true of gate FILES and
false of gate STATE. The three test files that lane chose did not exercise the
audit its change broke. That sentence is retracted.

---

## 2. The debug backdoor is out of the shipping arena

`probeMode()` and `stationBayDressing()` read `window.location.search` inside
`createVolumeCorridor()`, and `src/map3-arena.ts:152` builds that corridor into
the **playable arena**. So `?probe=1` would have spawned three 0.58 × 1.8 ×
0.36 m grey test bodies in a live match, and `?bay=0` would have deleted the
kit and its six point lights for anyone who typed it. The module comment
asserted these were "reachable only by a query string no player types" — a
claim about player behaviour, not a property of the code.

`createVolumeCorridor` now takes `{ probes, dressing }`. Only
`src/map3/main.ts` — the standalone `map3.html` showcase entry — reads the URL.
The arena builder passes nothing and never looks. The readability harness runs
against `map3.html`, so no measurement was lost.

---

## 3. Two visual regressions on the exhibit corridor

**The dressing course crossed every god-ray slit.** The dado (y 0.775–1.325)
and frieze (y 2.355–2.485) were continuous 43 m bands at x 3.89, inboard of the
sun wall's inner face at 3.95 — and that wall is pierced from y 1.0 to y 5.6.
They ran straight across every aperture, on the one corridor that exists to
show those apertures. They are now per-pier panels, `BAY − SLIT_W − 2 × 0.12`
long, centred on the column lines, derived from the corridor's own `SLIT_W`
through a new `apertureWidth` option. See
`captures/repaired-corridor6-inside.png`: the slits read as clean openings and
the trim sits on the piers between them.

**The platform overlay swallowed the floor's cast-shadow banding.** It was a
dark 43 × 8.5 m slab over the entire floor at a 14 mm offset — which also put a
coplanar sheet over the whole hall, a z-fighting risk on hardware with less
depth precision than the machine it was captured on. It is now what a platform
is: a 2.4 m strip along the open colonnade side at a 35 mm lift, with the edge
stripe moved to its inboard edge. `captures/repaired-corridor6-mouth.png` shows
the colonnade's hard shadow bands back on light stone across the aisle.

---

## 4. Draw calls and triangles — measured properly this time

The first evidence run took **one** `capture-map3-views.mjs` sample per view
from a HUD div the page rewrites twice a second. An independent re-run came
back 4–6 draws apart — half the +12 budget — and a control view returned the
stale boot string. This repair pass re-ran that exact failure and reproduced
it: in `captures/hud-after-repair.json`, `corridor-1-nature` again logged
`click to look around · WASD to walk …` instead of a telemetry line.

`scripts/qa/measure-hf421-corridor-cost.mjs` reads `renderer.info.render`
directly, once per animation frame, 15 frames per view, and records median, min
and max.

### 4a. Showcase page, sun shadow pass OFF — the kit's own cost

`cost-showcase-shadows-off.json`. One build, one session, `?bay=0` against the
plain page, `--keys o`.

| View | draws before → after | Δ | tris Δ |
| --- | --- | --- | --- |
| `corridor-6-…-mouth` | 61 → 71 | **+10** | +458 |
| `corridor-6-…-inside` | 50 → 60 | **+10** | +1 054 |
| `corridor-6-…-shafts` | 60 → 70 | **+10** | +1 226 |
| `corridor-1-nature` (control) | 64 → 64 | **0** | −212 |

Every reading had **min = max across all 15 frames**. Budget +12 draws and
+40k triangles: **PASS**, with the cost deterministic rather than sampled.

### 4b. Showcase page, shadow pass ON — and the noise floor that explains it

`cost-showcase-shadows-on-run1.json`, `-run2.json`, and the null A/B
`cost-showcase-null-ab.json` (the SAME page loaded twice, which is the only way
to size reload jitter).

| View | run 1 Δdraws | run 2 Δdraws | **null A/B** Δdraws |
| --- | --- | --- | --- |
| `corridor-6-…-mouth` | +11 | +14 | 0 |
| `corridor-6-…-inside` | +12 | +11 | 0 |
| `corridor-6-…-shafts` | +10 | +10 | −4 |
| `corridor-1-nature` (control) | −3 | −3 | 0 |

`renderer.info.render.calls` is a WHOLE-FRAME count and includes the
**scene-wide sun shadow pass**, which sees corridor 6 wherever the camera
points. Two things follow, and both are stated rather than smoothed over:

- The corridor-6 deltas are +10 (the kit) plus up to +4 of shadow-pass jitter,
  against a null-A/B noise floor of the same size (−4 on one view). The
  attributable cost is **+10 draws**; run 2's +14 on the mouth view is inside
  that noise and is NOT claimed as a smaller or larger number.
- **The control view moves by a reproducible −3 draws** (146 → 143, twice), and
  the null A/B says that is not reload jitter. With the shadow pass off it is
  exactly **0**. So corridor 1 itself is untouched — proven twice over, by the
  shadows-off control delta and by the fact that no file outside corridor 6's
  kit was edited — and the −3 lives entirely in the shadow pass. It is a
  *reduction*, so it cannot be a budget overrun. **The mechanism by which the
  kit's presence removes three draws from the sun's shadow pass was not
  isolated inside this pass's budget and is left OPEN.**

An attempt to isolate it further with the showcase page's own solo key
(`--keys 6`) was **discarded as invalid**: `src/map3/main.ts:390` builds the
solo list as `scene.children.filter((o) => o.type === 'Group')`, which is every
top-level Group in the scene and not the corridor list, so digit *n* does not
reliably solo corridor *n*. That is a pre-existing showcase-page defect, noted
and not fixed here.

### 4c. The ARENA route — measured for the first time

The earlier evidence measured only `map3.html`. `src/map3-arena.ts:152` builds
this corridor into the playable arena, which has graphics profiles, a filmic
chain, a shadowed sun and bots. `--route arena` boots the real arena, selects
Map 3, freezes the bots and reads `samplePresentationCounters()`.

The arena never reads the URL any more (§2), so this A/B is **two builds**: the
integration head `d329628d` with `station-bay.ts` absent, and this branch. Said
plainly rather than presented as one session.

`cost-arena-before.json` / `cost-arena-after.json`:

| Arena view | draws before → after | Δ | tris before → after | Δ |
| --- | --- | --- | --- | --- |
| godrays, 2 m in | 85 → 95 | **+10** | 145 147 → 146 241 | +1 094 |
| godrays, 10 m in | 81 → 91 | **+10** | 125 927 → 127 097 | +1 170 |
| godrays, 16 m in | 81 → 91 | **+10** | 126 759 → 127 829 | +1 070 |
| vegetation lane (control) | 101 → 101 | **0** | 357 119 → 356 759 | −360 |

min = max on every reading. **+10 draws on the arena route too**, matching the
showcase shadows-off number exactly, and 0 on the control lane. Budget +12
draws / +40k triangles: **PASS on the route the game actually ships.**

Paired stills: `captures/base-arena-godrays-depth10-half.png` and
`captures/repaired-arena-godrays-depth10-half.png`.

**Still OPEN:** per-graphics-profile p50/p95 frame time
(Performance/Balanced/Quality/Max) at 1440p. The arena route is now measured
for draws and triangles; profile-by-profile frame time was not, and is not
claimed.

---

## 5. Readability — the first result does not survive a proper measurement

**The old claim is retracted.** The earlier report claimed 15 m silhouette
separation improved 2.397 → 9.936 (4.1×) with "NO probe regressed". That was a
**single screenshot per condition** of a scene containing a moving 52-intensity
point light on an 11.0 s loop (the tram, the kit's own exposure moment) plus an
orbiting sun. Two back-to-back re-runs of that one-frame method on this build
returned after-medians of **7.353 and 15.575**, and one probe read **0.417** in
one run and **8.358** in the other. A single frame of that scene is a sample of
where the tram happened to be, not a measurement.

`scripts/qa/measure-hf421-station-bay-readability.mjs` now sweeps each
condition over **15 frames spaced 850 ms apart — 12.75 s, more than one full
tram period** — and reports each probe's worst, median and best separation. The
verdict compares **probe against probe** (a three-probe median hides a probe
that went to zero) and is judged on the **worst frame**, because a silhouette
has to stay readable at the worst moment of the loop.

Two swept runs, `readability-sweep-run1.json` and `-run2.json`, same build,
same poses:

| Probe | run 1 Δ worst | run 1 Δ median | run 2 Δ worst | run 2 Δ median |
| --- | --- | --- | --- | --- |
| left (x −2.4) | **+1.07** | +1.92 | **+1.00** | +6.97 |
| centre (x 0) | **−1.07** | −1.06 | **+0.76** | +0.02 |
| right (x +2.4) | **−0.57** | +0.83 | **−1.61** | −0.07 |
| sweep median | 7.448 → 8.651 | | 6.723 → 10.710 | |

**The honest reading: the kit's effect on 15 m silhouette separation in this
daylight hall is not resolvable by this metric.** Per-probe deltas take both
signs between two runs of the same build, the set of probes flagged as
regressed changes (centre+right in run 1, right only in run 2), and the swings
are ±1.6 on a probe's worst frame and up to ±7 on its median — as large as any
effect. The bar was "no worse than before"; the measured answer is **no
resolvable change**, not the 4.1× improvement previously claimed.

The harness's own `readabilityHolds` flag reads `false` in both runs, because
it is now strict enough to flag a single regressed probe. That flag is left
strict and is not being relaxed to make this lane green: it is reported as
what it is.

This is consistent with — and reinforces — the finding that survives from the
first pass: `map3.html` lights this hall with a 4.2 sun, a 1.9 hemisphere light
and an open colonnade onto a bright sky. There is no dark for the technique's
value-composition half to act on, and therefore nothing for it to make a
silhouette stand out against. The readability question has to be re-asked on a
night or interior arena, where the technique applies at all.

Frame time was unchanged and remains display-paced: p50 5.600 ms both
conditions, p95 5.700 / 5.700 (run 1) and 5.700 / 5.800 (run 2), at 2560×1440.
As before, this bounds the added cost below remaining headroom rather than
naming a GPU time; §4 carries the load-bearing cost numbers.

---

## 6. Pipeline tripwire — still 0

`node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --arena map3
--seconds 45 --port 4225` → `pipeline-compile-map3-after-repair.json`

```
render pipelines: 469 before window, 0 during (0/min); 0 inside a stall
shader modules:   628 before window, 0 during;        0 inside a stall
13 stalls, 3.23% frozen over 45.018 s
```

**0 in-combat material or pipeline creations.** The kit's four materials are
still all built in `createStationBay()` at construction and `update()` creates
nothing; splitting one mesh into two adds a draw, not a pipeline, and the
pipeline count is identical to the pre-repair run (469 / 628).

Stated rather than hidden: this run logged 13 stalls / 3.23% frozen against the
pre-repair run's 1 stall / 0.3%. **Zero** of those stalls contain a pipeline or
shader-module creation, so they are not compile stalls and not attributable to
this change; they are most likely machine load. If a later pass wants that
number tight, it needs its own quiet-machine run — this lane does not claim the
stall figure either way.

---

## 7. Contract, gates and small corrections

- `npx tsc --noEmit -p tsconfig.json` → **exit 0**. `npm run build` → **exit 0**.
- Focused suite (8 files, 61 tests) green: `vitest-focused-after-repair.log.txt`.
- `npm run lint` still cannot be used on this head: `verify-text-source-integrity.mjs`
  fails on two EMPTY tracked files from another lane's PASS 84 evidence
  (`docs/evidence/pass84/farcrysis-load/qa/farcrysis-load/tsc-3.log.txt` and
  `tsc-repair2.log.txt`). Pre-existing, confirmed again on `d329628d`, not this
  lane's to fix — and the exact reason every log this lane commits is non-empty.
- `src/rendering/art-direction.ts` remains **unedited**; no bound widened, no
  bloom threshold lowered, no vignette change, no ledger row added.
- Still no `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile`; no
  imported mesh, image, font or LUT; nothing taken from the reference.
- Small things the review found and this pass fixed: `StationBay.update`
  declared a `dt` the implementation dropped; the halo's `opacityNode`
  multiplied an emissive gain of 2.6 and leaned on an implicit clamp (brightness
  now lives in `colorNode`, opacity is clamped coverage); the block comment
  still said "two shadowed spots" when the default has been 0 since the first
  budget measurement; and the header cited a technique study by a path that does
  not resolve on this branch — it now names the branch and commit `2a7ddff1`
  where that file actually lives.
- **Accepted, and stated rather than silently left:** the parapet (0.44 m tall,
  0.18 m wide, along the colonnade side) and the skirting (0.34 m, along the
  closed wall) publish no movement solid, so a player walks through them. Both
  are under the parity gate's 0.9 m height threshold and neither is climbable
  ankle-height trim, which is the same treatment the atomic-acres root flares
  got in `ACCEPTED_WALK_THROUGH`. Named here so it is a decision, not an
  oversight.

---

## 8. Claim status after this pass

| Claim | State |
| --- | --- |
| Collider/visual parity gate green on the Map 3 arena | VERIFIED (log, before and after) |
| No URL-driven debug surface in the shipping arena | VERIFIED (code; only `main.ts` reads the URL) |
| Trim clears every god-ray aperture; floor keeps its shadow bands | VERIFIED (paired stills) |
| +10 draws, ≤ +1.3k triangles — showcase AND arena route | VERIFIED (min = max, 15 frames, 4 configs) |
| Control corridor / control lane unaffected in the main pass | VERIFIED (0 draws, both routes) |
| Whole-frame shadow-pass −3 draws on the control view | MEASURED; mechanism OPEN |
| Readability at 15 m unchanged within the metric's resolution | VERIFIED (two swept runs, both signs) |
| Readability *improved* 4.1× | **RETRACTED** — single-frame artifact |
| 0 in-combat pipeline/material creations | VERIFIED |
| Per-graphics-profile frame time at 1440p | OPEN — not measured |
| The first build's 187 draws / 414k tris with 2 shadowed spots | CLAIMED — no artifact was kept; not re-measured |
