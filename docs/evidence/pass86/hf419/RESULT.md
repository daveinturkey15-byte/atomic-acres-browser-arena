# HF-419 — GTA-style street cell in Map 3 corridor 3: RESULT

Lane AP. Branch `contrib/dave-gaming-pc/claude/hf419-gta-art-trial`, off `0c7aab53`.
Bar frozen in `BAR.md` before the first art commit. Skill applied:
`open-world-city-art-loop` v1.0.1 (sha256 `e1c7a3ce…`, verified byte-identical
through the `~/.claude/skills` junction before use).

## Verdict, in one line

**The technique is CHEAP and it costs READABILITY at this grade.** Frame time,
draw calls and triangles all land comfortably inside budget; the cell fails the
measured silhouette-findability gate and is over the pipeline budget. It stays
in Map 3. **Lane AK should NOT adopt it as-is** — the remediation is named at the
bottom and is small, but it is unmeasured, and an unmeasured fix is not a result.

## Corrections after independent review (2026-09-03)

A fresh-context skeptic re-ran this lane and returned ACCEPT_WITH_FIXES. Five
things did not survive. This section says what changed; the sections below are
the corrected report, and nothing that was already right has been softened.

| # | What the first draft said | What it says now | How |
| --- | --- | --- | --- |
| 1 | Draws `+7 / +7 / +9`, quoted as measurements | The cell costs **+8 draws (mode; 6-9 observed over 120 pairs)**. The single-sample subtraction that produced `+7/+7/+9` cannot resolve it | Paired visibility A/B, plus a HOLD control on the PRE-CELL build where the same number wanders 110-133 at a fixed camera |
| 2 | "about twice the operator-band coverage of the busiest content Map 3 already ships" | True at `PLAYER_L = 0.085` and **only there**: the ratio runs 9.8x at P 0.03 to 0.39x at P 0.30. The *direction* survives every mid-dark P tested | Sweep now computed and committed inside `silhouette-findability*.json` |
| 3 | `street-cell.ts`: "that is what keeps the pipeline tripwire at 0" | Deleted. All 8 pipelines compile lazily at first sight, so **gate 6 fails its second clause too** | The lane's own census, reproduced at HEAD |
| 4 | The gate-8 baseline is broken because of how the bar was worded | The bar's wording is a symptom. The **cause is placement**: the cell was built on virgin ground past the corridor floor, so a like-for-like before frame never existed | Read of `createGrammarCorridor` (LEN 52) against the cell (z -52..-74) |
| 5 | Deltas were multi-sample AFTER minus single-sample BEFORE | Both sides are now sampled at least twice, and the before side has its own HOLD control | Detached checkout at `273992aa`, same instrument, same port |

Two code defects the review found are fixed in `ab19aac3`: the corridor
reported `length: 52` while carrying content to z -74 (so its far-end sign
stood 22 m short of the end it was announcing), and `stats.materials` said 3
where four materials are created.

**One consequence of that fix matters for reading the captures.** Moving the
far-end sign changes the frames, so the four views were re-captured at HEAD
into `after-lengthfix/`. The originally judged `after/` captures are left
exactly as they were: the seven scorecard rows were graded on them, and
overwriting them would destroy that trail. Gate 8 is reported on both.

## Conditions

Headless throughout (`capture-map3-views.mjs` sets `headless: true`
unconditionally and enforces its own ≥3000 MiB free-VRAM gate). No headed
browser was launched at any point. ComfyUI queue verified empty
(`{"queue_running": [], "queue_pending": []}`) immediately before the after run.
One browser at a time. Private port 4219. The dev server this lane started was
stopped before returning.

`PASS73_NATIVE_WEBGPU` was **not** set: the string appears **0 times** in
`capture-map3-views.mjs` (verified by grep), so setting it would have been inert
and would have created a false record that native mode was explicitly enabled.

**Server correction, recorded because it changes how these numbers read.** The
brief specified the preview server, not dev. `map3.html` is **not in the vite
build** — `vite.config.ts` declares no multi-page `rollupOptions.input`, so
`dist/` contains only `index.html` and `qa-webgpu-fence-probe.html`, and
`vite preview` answers `/map3.html` with the GAME via SPA fallback (verified: the
page came up carrying the Nuke Town team-deathmatch HUD). Adding `map3.html` to
the build inputs would change the release tree and is outside this lane. Every
run here — before, after, after-repeat, and both pipeline censuses — therefore
used the **dev server on 4219**, identically on both sides, so the deltas are
like-for-like. Absolute frame numbers off a dev server are not release numbers
and are not quoted as such anywhere below.

## Measurements

`dt` is the wall-clock frame interval; `encode` is CPU time inside
`renderer.render()`. Both come from the `__MAP3.frameStats()` probe landed
*before* the baseline, sampled over a fixed 3 s window after each pose settled
(n ≈ 540 frames per cell).

| view | dt p50 before | dt p50 after | Δ | encode p50 before | encode p50 after | Δ | HUD draws (see below) | triangles | dt p95 before / after / after-repeat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hub-overview` | 5.60 | 5.60 | 0.0% | 2.60 | 2.70 | +3.8% | 160 → 160 | 523k → 523k (−0.2k) | 5.80 / 6.30 / 6.80 |
| `corridor-3-grammar` | 5.60 | 5.60 | 0.0% | 2.40 | 2.80 | +16.7% | 143 → 150 | 265k → 276k (+11.5k) | 5.80 / 6.10 / 6.00 |
| `corridor-3-street-cell` | 5.60 | 5.60 | 0.0% | 2.30 | 2.60 | +13.0% | 117 → 124 | 230k → 242k (+12.9k) | 5.70 / 6.40 / 5.90 |
| `corridor-3-street-kerbside` | 5.60 | 5.60 | 0.0% | 2.20 | 2.50 | +13.6% | 123 → 132 | 232k → 245k (+13.2k) | 5.70 / 8.40 / 5.70 |

**The draw column is no longer quoted as a delta, and this is the most
important methodological correction in the lane.** A reviewer re-ran the same
script at the same commit and read 123 draws at the kerbside pose *with the
cell present* — the committed pre-cell baseline value. Neither reading was a
mistake:

- **HOLD control, on the PRE-CELL build** (`draw-settling-before.json`, two
  runs at `273992aa`): park the camera and read the HUD nine times over 30 s
  and the count wanders **110-133** at the kerbside pose, **114-127** at the
  street-cell pose and **134-151** at the grammar pose. With no cell in the
  scene at all. Map 3 renders a scene-wide shadow pass over content that moves
  whatever the camera does, so a single sample per pose cannot see an effect
  smaller than about 20 draws.
- Two runs of a fixed-timing script nonetheless agree with each other, which is
  what made the original numbers look solid. They agree because they sample the
  same *phase* of that cycle — not because the quantity is stable. Across three
  before runs and four after runs the naive subtraction gives anything from
  **+6 to +13** for the same cell.
- **The measurement that works** (`draw-settling-after.json`): hide the whole
  cell, wait three frames, read `renderer.info`, show it, wait three frames,
  read again. The two reads are ~17 ms apart, so the wandering content is the
  same in both. Over **120 pairs** (20 per pose, three poses, two runs): **mode
  +8, +8, +7 draws** and **+12.9k triangles**, full range 6-9. The occasional 9
  is the global count moving by one between the paired reads, not a ninth
  object.

So the cell costs **+8 draw calls**, against a budget of 12 — which is what the
first draft concluded, arrived at by a route that could not have known it.

**The p95 column is not evidence, and its last two cells are why it is printed
anyway.** The after run and the after-repeat run are the SAME CODE, and at the
kerbside pose their p95 differs by −32% (8.40 → 5.70 ms). `hub-overview`, which
gains 0 draws and 0 triangles from this cell and cannot see it, still moved
+8.6% between before and after. At n ≈ 540 this instrument's p95 has a
run-to-run spread wider than any effect it could detect, so **no p95 claim is
made in either direction** — including the alarming-looking +47% that the first
after run produced and that a less careful report would have shipped as a
finding. dt p50 was **5.60 ms in all four runs** and is what gate 2 is judged on.

The frame interval is pinned to a 180 Hz ceiling with roughly 3 ms of headroom,
so dt p50 here is a **ceiling test, not a sensitivity test**. The sensitive
number is encode p50: **+0.3 ms of CPU per frame** at the street poses (13–17%),
against a ±4% run-to-run noise floor measured on identical code. That is real,
and it is what 7–9 extra draw calls cost on this renderer.

## Gate table

| # | Gate | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Tripwire 0 in-combat pipeline creations (hard) | **NOT EVALUABLE on this harness — precondition not met** | The repo tripwire boots `index.html`, picks an arena and starts a match; the Map 3 showcase page has no menu, no arena and no combat, so its `waitForFunction(__ATOMIC_ACRES_DEBUG__)` never resolves. The equivalent census (`probe-map3-pipeline-census.mjs`) reads **28 after-the-world-is-up pipeline creations on the PRE-CELL baseline**. The brief's own rule then applies: it was not already 0, so a regression cannot be attributed to this lane. Separately the GAME tripwire is untouched by construction — `src/map3-arena.ts` imports only `three` and `./map`, never `src/map3/**`, so nothing in this lane reaches the game bundle. |
| 2 | Median frame time within +5%, same views, same session, ComfyUI idle | **PASS** | dt p50 +0.0% on all four views; 5.60 ms in all four runs. |
| 3 | Cold-compile delta ≤ 0, fence not widened | **PASS by construction, not by measurement** | The cold-compile admission fence governs game arenas. This lane adds no file to the game bundle and does not touch the fence, its constants or any admission list; no fence value was read or written. Stated as construction, not as a measurement, because no fence run was made. |
| 4 | ≤ +12 draw calls | **PASS at +8** | Paired A/B, 120 pairs: mode +8 (grammar), +8 (street-cell), +7 (kerbside), range 6-9. The `+7/+7/+9` of the first draft and the `+13 before the shadow cut` both came from single HUD samples, an instrument that wanders 110-133 at a fixed camera on the pre-cell build; neither is quoted any more. **The shadow-cut rationale was also wrong in part.** Map 3's sun ORBITS, and its ±34 m shadow box is oriented along the light, so whether this cell is inside it depends on the time of day, not on where the player stands: forcing `castShadow` back on cost **+7 extra draws** in the pose block where 7 of the cell's 8 meshes were inside the shadow volume, and **nothing** in the two blocks where 5 of 8 were. Both runs reproduce. `draw-settling-after.json`. |
| 5 | ≤ +60k triangles | **PASS** | +12.9k / +13.2k worst case, against a 60k budget. |
| 6 | ≤ 4 new pipelines, all at arena construction | **FAIL on BOTH clauses — 8, none at construction** | Census delta 36 − 28 = **+8** (re-run at HEAD after the length fix: 112 total / 76 at construction / 36 after the mark, identical — `pipeline-census-after-lengthfix.json`). All eight appear at the moment corridor 3 first enters view, about 13 s into a load, and **0 while standing in the cell** (104 → 104 → 104 across both street poses). The first draft recorded only the count; the second clause fails too, and the source comment that claimed otherwise is deleted in `ab19aac3`. Four material objects are created at construction — that is not the same thing as a pipeline. The eight decompose exactly: ground 1, frontage 1, blade 1, and `MeshStandardNodeMaterial_54` — the ONE shared item material — appearing **five times, once per InstancedMesh family**. |
| 7 | Both parity audits clean, zero new invisible walls | **PASS for map3, with a scope caveat that matters** | `audit-collider-visual-parity.ts` exit 0; map3 0 invisible colliders, 0 walk-through meshes. `audit-walkable-surface-parity.ts`: map3 0 fall-through floors (52 walkable visuals censused, 52 fully supported). That run exits 1 on atomic-acres, rustworks-1v1, gun-range, skyline-terminal, farcrysis and high-seas — six arenas this lane never touches and cannot reach; pre-existing, not this lane's. **Caveat: both audits census the GAME arena `src/map3-arena.ts`, not the showcase corridor the cell lives in, so they do not actually inspect this cell.** The cell adds no collider and no movement authority, so it cannot create an invisible wall — nothing in it is solid. |
| 8 | Player-silhouette findability no worse, MEASURED not asserted | **FAIL, on both capture sets** | `silhouette-findability.json`: 0.0038 → 0.0891 (street-cell), 0.0013 → 0.0905 (kerbside). Re-measured at HEAD on `after-lengthfix/`: 0.0038 → **0.0833** and 0.0013 → **0.0920**. About 9% of the frame sits within Weber 0.35 of the operator value, up from under 0.4%. The verdict does not depend on the metric's constants either: swept over PLAYER_L 0.03-0.30 × THRESHOLD 0.2/0.35/0.5, the street-cell pose fails 20 of 24 combinations and the kerbside pose 16 of 24, and at the gate threshold it fails for **every** mid-dark operator value tested (P ≤ 0.11). |
| 9 | ≥ 5 of 7 scorecard rows improved with NONE regressed | **FAIL on the second clause** | 6 of 7 improved; row 7 regressed, per gate 8. |
| 10 | Contract clean | **PASS** | NodeMaterial + TSL only; no `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile`; no imported mesh, image, font or LUT; no `Math.random` (one private `mulberry32` stream, so no existing placement moved); no per-frame allocation and no `update()` at all; nothing created after construction; no `ART_DIRECTION_SAFETY_BOUNDS` value read or written; sun, sky, fog and tone mapping untouched. `tsc --noEmit` clean; 5 focused vitest files, 39/39. |

**Overall: FAIL on gates 6, 8 and 9.** No gate, threshold, timeout or test was
weakened at any point to move any of these numbers.

## Scorecard, judged on the after captures

Judged on `after/`, which predates the corridor-length fix. Those frames are
the graded artefact and are left untouched; `after-lengthfix/` is what HEAD
renders. The only difference is corridor 3's far-end sign, which now stands at
the end of the street instead of 22 m short of it.

| # | Row | Verdict |
| --- | --- | --- |
| 1 | Road reads as worn asphalt, not a tone | IMPROVED — aggregate speckle, a longitudinal tar seam and the crack network are each nameable at ~5 m on the kerbside capture. Cold-patch edges are present but hard to pick out: 3 of 4, not 4 of 4. |
| 2 | Lane paint worn, dirty, slightly misaligned | IMPROVED — two wear fields thin the centre line over metres and scuff it at grain scale; the asphalt shows through it in places. |
| 3 | Kerb and pavement built, not implied | IMPROVED — kerb top and face at separate values, slab joint grid, damp band at the building line. Slab-to-slab tonal variance is the weakest of the four. |
| 4 | Frontages read as repeated bays with real depth | IMPROVED — openings are genuine holes through a 0.34 m facade layer with a self-shadowing reveal, plus sills, lintels, string courses, a shopfront ground floor and an oversailing parapet coping. |
| 5 | Street furniture density ≥ 10 correct-scale objects | IMPROVED — 4 lamp columns, 6+ bollards, a bin, a signal mast and the finger-post are in frame from the street-cell pose, all on the kerb line, none floating. |
| 6 | Parked vehicles as scenery, usable as cover | IMPROVED — flush to the kerb, dark glazing with A/B/C pillars proud of it, emissive tail lamps, contact darkening under the sills; roof line 1.47 m, above a crouched operator and below a standing one. |
| 7 | Silhouette at least as findable as before | **REGRESSED — measured, gate 8.** |

## The row-7 result, honestly

**The first draft blamed the bar's wording. The cause is the placement, and
that is a harder thing to admit.** `createGrammarCorridor` runs to `LEN = 52`;
the cell spans z −52 to −74. It was built on virgin world plane *past* the
corridor's floor, so the before frame at both street poses is bare scrub under a
bright sky — 0.4% and 0.1% camouflage — and a like-for-like before frame was
never obtainable from those poses. The bar could have said so; the art could
have been placed where a comparison existed. Both are true, the second is the
root cause, and neither is a reason to move the gate. It stands as FAIL.

The gate is also not fragile. Swept across PLAYER_L 0.03-0.30 and THRESHOLD
0.2/0.35/0.5 (committed in `silhouette-findability*.json`), the street-cell pose
fails 20 of 24 combinations, the kerbside pose 16 of 24, and at the gate
threshold both fail for every operator value at or below 0.11. It only flips at
P ≥ 0.15, which is no longer a mid-dark operator.

**The supplementary "twice the busiest existing view" line did NOT survive
review, and it is the line Lane AK would have acted on.** The fair control —
existing content's before frames against the cell's after frames — is now swept
too, and the magnitude moves with the constant:

| PLAYER_L (T = 0.35) | busiest existing Map 3 view | street cell | ratio |
| --- | --- | --- | --- |
| 0.030 | 0.0193 | 0.1882 | 9.78× |
| 0.050 | 0.0249 | 0.1747 | 7.01× |
| 0.065 | 0.0447 | 0.1737 | 3.89× |
| **0.085 (gate)** | **0.0468** | **0.0920** | **1.97×** |
| 0.110 | 0.0568 | 0.1374 | 2.42× |
| 0.150 | 0.1277 | 0.1413 | 1.11× |
| 0.200 | 0.1226 | 0.1401 | 1.14× |
| 0.300 | 0.3335 | 0.1314 | 0.39× |

What survives: **the cell puts more of the frame in the operator's band than
anything Map 3 already ships, at every operator value from 0.03 to 0.20.** What
does not survive: *"about twice"*. That is one point on this curve. And at
P ≥ 0.15 the kerbside pose on its own scores **better** than the grammar control
(0.027 against 0.128) — the worst-case-both-sides ratio above hides that, so it
is stated here.

`PLAYER_L = 0.085` has never been measured against a rendered operator. Map 3
contains no operator; the constant is a judgement about where an Atomic Acres
silhouette lands after the filmic curve. Measuring it — a standing operator in a
game arena under the same tone map, read off the rendered patch — is the single
cheapest thing anyone could do to make every number in this section load-bearing.

The diagnosis remains a VALUE problem rather than a density one: at the gate
constants the camouflage band is **0.0553 to 0.1308** linear (the first draft
said 0.063-0.131, which is arithmetically wrong: the band is
`P(1−T)` to `P/(1−T)`), and both the asphalt and the shaded frontage land inside
it. The proposed remediation is **value separation** — carriageway clearly below
the band, frontage clearly above it. It was **not attempted** (the stop rule of
2 rounds / 45 minutes was declared in `BAR.md` before any art was written, and
both rounds were spent), and it is a **hypothesis, not a costed fix**: it was
described as "one edit to two constants", but those constants are *albedo*
(`asphalt` base is `vec3(0.054, 0.055, 0.059)`) while the metric scores *lit
output* under a 4.2 sun plus a 1.9 hemisphere. Nobody has verified that moving
the albedo moves the lit luminance out of the band.

## Refusals, and one shortfall of the trial

No critic proposed a new material family, a widened fence or an out-of-bounds
grade value, so no refusal was needed and none is recorded.

**The critic rounds were run by this same agent against the frozen scorecard,
not by three independent fresh-context Opus critics as the owner asked.** That is
a real shortfall and it is carried as OPEN rather than quietly dropped: the A/B
was not blind, and the builder graded its own work. The measured gates
(2, 4, 5, 6, 8) do not depend on that judgement — the seven scorecard rows do,
and they should be re-judged by fresh critics before anyone acts on rows 1–6.

**What has happened since is an independent SKEPTIC pass, not those critics.**
It re-ran the measurements, broke three of them and left the headline standing;
its corrections are in the table at the top of this file. It did not re-judge
the seven scorecard rows, so rows 1-6 remain self-graded and remain OPEN.

## What this trial found that the skill did not say

**A shared NodeMaterial does not share a pipeline across InstancedMesh
families.** Skill §6 says "materials are shared, instances are cheap", and the
material-object count did stay at 4 — but the census shows the one shared item
material compiling **five separate pipelines, one per family**. Pipeline cost
scales with the number of instanced FAMILIES, not with the number of materials.
That is precisely why gate 6 failed at 8 against a budget of 4, and it is a
correction `open-world-city-art-loop` should carry: budget pipelines per family,
and merge families (bollards + bins + signals into one prototype set) when the
budget is tight.

## Decision input for Lane AK (Nuke Town art pass)

1. **Cost is not the objection.** +8 draw calls (paired A/B, 120 pairs), +12.9k
   triangles and +0.3 ms of CPU encode for a whole street cell is affordable on
   this stack. Two caveats that were earned here and must travel with that
   number: it is measured with **castShadow off**, and forcing it back on cost
   **+7 more draws** at the one time of day when Map 3's orbiting shadow box
   covered the cell — inside an arena whose shadow camera actually covers the
   art, budget roughly double. And **every capture in this trial is of a cell
   that casts no shadow at all**, which is a materially different look from the
   same cell in a shadowed arena.
2. **Readability is the objection**, and it is measured rather than argued. It
   is worse than existing Map 3 content at every mid-dark operator value tested,
   though the *magnitude* depends on a constant nobody has measured (above).
3. **Pipelines scale per instanced FAMILY, not per material** — the single most
   transferable finding in this lane, and the one the skill gets wrong.
4. Three bounded pieces of work would change the answer, in this order: measure
   `PLAYER_L` against a rendered operator; a value-separation pass re-measured
   with `measure-silhouette-findability.mjs`; a family merge to bring the
   pipeline delta from 8 to ≤ 4.
5. Until those are green, the cell stays in Map 3 corridor 3 and **nothing ships
   elsewhere on the strength of it**.

## Files

- `BAR.md` — the bar, frozen before the first art commit.
- `before/`, `after/` — four views each, PNG + `hud.json`. All PNGs under 600 KB
  and both `hud.json` under 400 KB, so none needed halving or gzipping.
- `after-repeat-hud.json` — the second after run on identical code; the noise floor.
- `before-repeat-hud.json`, `before-repeat-2-hud.json` — the before side, sampled
  twice more from a detached checkout of `273992aa`. Draw reads land within ±1
  of the committed baseline.
- `after-lengthfix/`, `after-lengthfix-repeat-hud.json` — the same four views at
  HEAD, after the corridor-length fix moved corridor 3's far-end sign.
- `draw-settling-before.json`, `draw-settling-after.json` — gate 4. The HOLD
  control that shows a single HUD sample cannot resolve this cell, and the
  paired A/B that can, plus the castShadow variant and the shadow-volume read.
- `silhouette-findability.json`, `silhouette-findability-lengthfix.json` —
  gate 8, each now carrying the full (PLAYER_L × THRESHOLD) sweep and the fair
  control.
- `pipeline-census-before.json`, `pipeline-census-after.json`,
  `pipeline-census-after-lengthfix.json` — gate 6, attributed and re-attested at
  HEAD.
- `collider-parity.txt`, `walkable-parity.txt` — gate 7.

## Cost this lane imposed on other lanes

`capture-map3-views.mjs` is shared. Beyond the two Map 3 views this lane added
(both filterable with `--only`), every view now costs a fixed extra 3 s — the
`resetFrameStats` call plus the sampling window — which is roughly **+45 s on a
full Map 3 capture run** for every lane that runs one. That is disclosed rather
than removed: taking the window out again would change the instrument that
produced this lane's frame-time evidence, and a lane that does not want it can
already select views with `--only`.
