# Lane AM - HF-420 realtime water surfaces, Map 3 trial

**Branch:** `contrib/dave-gaming-pc/claude/hf420-water-everywhere` (from `0c7aab53`)
**Worktree:** `C:/Users/david/projects/aa-claude-water`
**Skill applied:** `threejs-webgpu-water` v1.1.0 (canonical store, read in full)
**Study executed:** `realtime-water-surfaces.md` section 8, the Map 3 EXPERIMENT PLAN
**Technique provenance:** vault `Dev-Practices/AI 3D Technique Register.md` row 46
(2026-09-02 intake) pins the owner-shared source URL, records that nothing was paid and
that no code exists in the post, and states the upstream-of-absorption prediction this lane
then falsified.

> **This document replaces an earlier version of itself.** A skeptic pass refuted four of
> its evidence citations and reported an undisclosed visual regression. Every refuted
> citation below is either replaced with a measurement that actually supports it or
> withdrawn in writing, and the regression was investigated rather than patched to the
> letter - which changed what this lane ships. The section "What the skeptic found, and
> what happened to each" is the audit trail.

---

## Verdict

**PARTIAL, and narrower than the previous version of this report claimed.**

What lands: **two ponds in Map 3**, rendered by the existing shared water module with a
physical Beer-Lambert colour model, plus the model itself, its tests, two instrument fixes
and two defect fixes.

What does **not** land: **the colour model is no longer enabled on any shipped ocean.**
RustRig, High Seas and Farcrysis authored a `waterType` in the previous version of this
branch. They no longer do. The reason is measured and is in section (f).

What is still owed: a pond in `atomic-acres` and `skyline-terminal`, and the roster gate
that goes green when they have one.

---

## What shipped

| # | Commit | What |
| --- | --- | --- |
| 1 | `15fff76b` | Map 3 ponds exist as DATA - finite shaped bodies, no new shader file |
| 2 | `ffc1db92` | Beer-Lambert extinction replaces the palette lerp |
| 3 | `6f0751e4` | Broadband bubble backscatter, injected upstream of absorption |
| 4 | `c5ae08f7` | Deep-water scattering closure - absorption alone renders black |
| 5 | `be16ee17` | The Map 3 pond rendered ZERO pixels - the arena's basin is buried |
| 6 | `5c788a7c` | Type the per-channel blend; mirror the shader's colour space |
| - | `c6c9afb8` | (evidence) |
| 7 | `1566b9a1` | Skirt migrated to the physical endpoint - **later reverted, see (f)** |
| 8 | `3ea0f2e7` | Ponds never re-read the profile gain, and were invisible to diagnostics |
| 9 | `fd912a86` | `poolCoverage` measured frame drift; the seam had no instrument |
| 10 | `cd9a1aec` | Committed foam-ceiling probe, every body not just RustRig |
| 11 | `f1bd908b` | The skirt is not the seam, and the two shipped oceans are not enrolled |

Files touched: `src/water/water-authoring.ts`, `src/water/ocean-tsl.ts`,
`src/water/ocean-tsl.test.ts`, `src/rendering/pass64-tsl-scene.ts` (water wiring only) and
its test, `scripts/qa/capture-hf420-water.mjs`, `scripts/qa/compare_hf420_water_captures.py`,
`scripts/qa/probe-hf420-foam-ceiling.ts`. **Nothing outside water ownership was edited.**
No gate, threshold, timeout or test was weakened; one gate was ADDED (skirted bodies may not
author a water type); the cold-compile admission fence was not touched.

---

## Method

Every capture is a FIXED-TIME review camera with bots cleared and the viewmodel hidden, at
2560x1440, in HEADLESS installed Chrome on native WebGPU. No headed browser was launched at
any point; the harness has no headed mode and refuses to start below 3000 MiB free GPU,
waiting 60 s x10 rather than taking it. ComfyUI's queue was empty and the power plan was
High performance for every measurement.

Each camera now writes up to **three** frames: the frame, the frame with the pond group
hidden, and the frame with the horizon skirt hidden. Differencing a pair says which pixels
an object OWNS. That is the only instrument in this lane that can tell "authored and
invisible" from "authored and subtle", and it is what caught both the buried basin and the
skirt misdiagnosis.

### Noise floor, measured on builds that actually draw the thing being measured

| Arena | build pair | mean abs pixel delta |
| --- | --- | --- |
| map3, **pond visible** | HEAD run1 vs run2 | **0.000132 - 0.000275** |
| map3, pond invisible | c1 vs c1-run2 | 0.000110 - 0.000318 |
| rustworks-1v1 | c1 vs c1-run2 | 0.000213 - 0.000374 |
| high-seas | c1 vs c1-run2 | 0.000245 - 0.000299 |

The previous report quoted only the second row and divided pond-visible deltas by it. That
was a real defect - a floor taken from a build with no pond in it - and it is corrected
here. The pond-visible floor turns out to be slightly TIGHTER, so every multiple below is if
anything larger than before. Both rows are kept so the correction is checkable.

**Is `c1` a legitimate stand-in for pre-change?** For map3, measured: `before-map3-run1` vs
`c1-map3` is 0.000190 - 0.000294, inside the floor. For the oceans, by construction: every
behavioural line commit 1 added to `ocean-tsl.ts` is guarded by `shape` (null for both
oceans) or by `horizonRadius <= 0` (3200 for both). **The `before-rustworks` capture cannot
be used for pixels at all** - it was taken with the harness's earlier camera poses under the
same shot names, and its `storm-wide` looks along the rig deck rather than at the sea. Its
frame-time row is still usable, because that is sampled with the camera released. **High
Seas has no pre-change capture and no pre-change frame-time row, and none is invented here.**

---

## Pass bar, item by item

### (a) The pond exists with no new shader file - PASS

Two ponds (the Water bay's north and south reflecting basins) are authored purely as data in
`water-authoring.ts` and rendered by the existing `createOceanTslWater`. No shader file was
created and no shader term was needed to author them.

**Honest qualification.** The falsifier held, but the module DID need data plumbing: finite
rectangular extents, a centre offset, and a horizon-skirt opt-out, because it had only ever
built one square plane at the arena origin. That is a module which assumed ONE SEA PER
ARENA - not one which assumed A SHADER PER BODY. The distinction is the falsifier's, and it
survives.

### (b) The Map 3 pond reads as murky-pond extinction - PASS, restated

The previous report filed this as "visible colour change with geometry unchanged" and cited
a `c1 -> c5` delta. **That claim is withdrawn**: across that span the pond also moved 55 mm
and went from 0% to 36.8% of the frame, so the delta is dominated by a surface APPEARING.
The 0 px silhouette reading proved nothing either - a flat pond lying on a floor cannot move
a first-non-sky-row-per-column metric in a top-down view, which is the same confound this
report already flagged for high-seas.

The correct instrument is the pool-hidden coverage probe, and it says:

| Camera | pond pixels (> 8/255) | share of frame | same probe on the pre-pond build |
| --- | --- | --- | --- |
| shoreline | 1,304,805 | 35.395% | 0 px / 0.000% |
| shallow-down | 1,356,145 | 36.788% | 0 px / 0.000% |
| wide | 213,611 | 5.795% | 0 px / 0.000% |
| grazing | 3,225 | 0.087% | 0 px / 0.000% |

Pond mean colour **R 0.0007 / G 0.0849 / B 0.0062** against the floor behind it at
**R 0.0223 / G 0.0258 / B 0.0577** - red and blue absorbed, green surviving. That is the
murky-pond extinction vector and nothing else could have produced it. The `0.000%` column is
an independent confirmation of the buried-basin defect: the pond was authored, reported
`visible: true`, and owned zero pixels.

Whole-frame delta `c1 -> HEAD`, for completeness rather than as the colour claim:
shallow-down 0.017218 (130x the pond-visible floor), shoreline 0.017529 (86x),
wide 0.005622 (21x), grazing 0.000529 (1.9x - the pond is 0.087% of that frame).

### (c) Backscatter: zero when still - PASS. Green-shifted when turbulent - FAIL

**Zero in still water: PASS.** The previous report cited a `c2b -> c3` pond capture pair for
this. **That citation is withdrawn**: the buried-basin fix is commit 5, so in both of those
builds the Map 3 pond rendered zero pixels. The capture offered as proof that the pond is
unaffected measured a frame with no pond in it.

Replaced with a stronger, committed measurement
(`scripts/qa/probe-hf420-foam-ceiling.ts`, 400,000 low-discrepancy `(x, z, t)` samples of the
pond's own authored spectrum): the maximum summed slope a Map 3 basin can reach is
**0.003828**, against a foam/backscatter gate that opens at **0.06**. The term is not small
there, it is IDENTICALLY ZERO, always, everywhere. A unit test asserts
`oceanBackscatterDensity === 0` at every crest height for the authored pond.

**Green-shifted when turbulent: FAIL.** Commit 3 moved the rustworks captures by
0.000205 - 0.000435 mean against a same-build floor of 0.000213 - 0.000374 - between 0.5x
and 2.0x noise. By the HF-410 rule that is not an effect.

**Cause, measured, and WORSE than previously reported.** It is not the injection point and
not the colour constant. The repo's existing crest estimator multiplies a crest-HEIGHT term
by a SLOPE term, and for a sum of sines those are in quadrature: height ~ sin(phase),
slope ~ cos(phase), so where the crest is highest the slope is zero. Per body, 400,000
samples each:

| Body | slope p50 | p99 | max | fraction above the 0.06 gate | max reachable foam |
| --- | --- | --- | --- | --- | --- |
| rustworks-1v1 | 0.0503 | 0.1045 | 0.1268 | 36.3% | **0.0659** of 1.0 |
| high-seas | 0.0075 | 0.0157 | **0.0190** | **0%** | **0** |
| farcrysis | 0.0101 | 0.0210 | 0.0254 | **0%** | **0** |
| map3 basins | 0.0015 | 0.0032 | 0.0038 | **0%** | **0** |

So on RustRig the estimator never leaves the bottom of its own ramp, and on **every other
body in the game the maximum summed slope never reaches the gate at all** - foam and
backscatter there are not weak, they are provably dead. The previous report analysed
rustworks only; the extension was the skeptic's and is reproduced here. The shipped
whitecaps are subject to exactly the same ceiling.

The injection point is separately proved correct by a unit test showing the upstream and
downstream forms are measurably different pictures (upstream gains more green than red or
blue; downstream gains identical amounts in all three).

### (d) Tripwire, frame time, tsc, vitest, roster gate

**Pipeline tripwire - PASS, before/after rather than an assertion:**

| Arena | pipelines before window | created in window | created IN A STALL | enrichment |
| --- | --- | --- | --- | --- |
| map3 baseline (`0c7aab53`) | 185 | 1 | 0 | 0 |
| map3 with this lane | 186 | 1 | 0 | 0 |
| high-seas baseline | 251 | 1 | 0 | 0 |
| high-seas with this lane | 251 | 1 | 0 | 0 |

Two ponds add exactly ONE pipeline to the whole game, created at load. In-combat creations
are unchanged and zero of them land in a stall. The admission fence was not widened or
touched.

**Frame time - NOT RESOLVABLE at the stated budget. The previous table was mislabelled.**
The budget was <= 0.30 ms median added. Presentation-frame p50 (2560x1440, quality, n=90),
with the rows labelled by what they actually are:

| Arena | PRE-CHANGE (`0c7aab53`) | lane commit 1 | REPAIRED HEAD |
| --- | --- | --- | --- |
| map3 | 10.6 / 10.1 / 11.2 | 8.9 / 8.5 | **10.2 / 10.1** |
| rustworks-1v1 | 17.9 | 11.4 / 11.8 | **10.7** |
| high-seas | *none exists* | 16.1 / 12.6 | **13.5** |

The previous report quoted the `c1-*` column as "baseline". It is lane commit 1. Corrected
here; the honest conclusion is unchanged and slightly stronger, since map3 at HEAD is at or
below its true pre-change figure and rustworks is well below it.

The instrument still cannot see 0.30 ms, and this repair pass produced the cleanest possible
demonstration of that: the `fixA` and `fixB` builds differ by **one material colour
constant** and returned 9.4 ms and 13.5 ms on rustworks - a 4.1 ms spread between two builds
that are identical apart from a hex value. **Claim: no measurable regression. NOT claimed: a
delta under 0.30 ms.**

**tsc:** `npx tsc --noEmit -p tsconfig.json` exit 0, clean, on final HEAD. It caught a real
defect during this repair pass too - a widened `number` against the `1 | 2 | 4` union in a
new test - which vitest does not run.

**Focused vitest:** `src/water/` 3 files / 31 tests; with `pass64-tsl-scene`, `water-system`,
`arena-visual-definition` and `art-direction`, 7 files / **83 tests** green. Full suite NOT
run (lane rule).

**Roster gate - STILL WRITTEN, STILL RED, STILL NOT LANDED. The one open deliverable.**
`water-roster.test.ts` derives its roster from `ARENA_IDS`, requires water or an explicit
written-down opt-out, and mechanises the falsifier permanently. Run against HEAD it fails
with exactly:

    expected [ 'atomic-acres', 'skyline-terminal' ] to deeply equal []

5 of 7 shippable arenas covered, `gun-range` a written opt-out, `test1`/`test2` fixtures.
Not committed as a passing gate because it does not pass; source and red output are here as
`water-roster.test.ts.txt` and `measurements/water-roster-test-RED.log`.

### (e) Buoyancy unaffected - PASS by construction

`git diff 0c7aab53..HEAD -- src/water/ocean-spectrum.ts` is empty. Every new term is a
colour node downstream of `colorNode` / `emissiveNode`; none is reachable from
`positionNode` or from any height query. Ponds live in a SECOND table (`WATER_POOLS`) that
`waterBodyForArena` - the host-authoritative accessor `water-system.ts` reads for level,
swimmable and amplitudeScale - cannot see at all, so "a pond feeds buoyancy" is
unrepresentable rather than merely undocumented. Every pond is `swimmable: false`.

### (f) The shipped oceans are NOT enrolled, and why - the one real regression

The skeptic reported: the extinction commit moved the near plane's deep endpoint to the
water type's scattering colour and left the unlit horizon skirt on `palette.deep`, producing
a hard full-width hue break on two shipped arenas; fix it by driving the skirt from the same
deep colour, or delete the `waterType` from the two oceans and land Map 3 only.

I built the missing instrument first - a skirt-hidden frame per camera - and then measured
both halves of that. **Both failed.**

**1. The skirt is not where the break is.** On the worst RustRig camera the skirt owns
**1.539% of the frame (56,742 px)**, in exactly two places: a thin line at the horizon, and
the hole in the near plane's rectangular dry footprint under the rig. See
`captures/rustworks-wide-SKIRT-OWNERSHIP-mask.png`, where those pixels are painted magenta.
The wide band that reads as "the seam" is the NEAR PLANE at a grazing angle, fog-washed. The
hard boundary is INSIDE the near plane; the skirt is not adjacent to it. On High Seas the
skirt owns **0 pixels** in all three cameras, so there is no seam there to break at all.

**2. Migrating the skirt makes it visibly worse.** Painting it `optics.scatter` renders
about 4x the luminance of `palette.deep`, because the skirt is unlit and the near plane is
lit: the horizon line becomes a bright green stripe and the shadowed water under the rig
becomes a glowing green pad (`captures/rustworks-wide-skirt-migration-REJECTED.png`). Six
weights were swept in one browser session (1.0, 0.62, 0.38, 0.362, 0.25, and the accepted
palette). There is no weight that is both principled and right, because the quantity the
skirt must match is the near plane's LIT output, which an unlit material cannot compute.
Commit `1566b9a1` is therefore reverted by `f1bd908b`.

**3. The real regression is bigger than the skirt, and it is in the near plane.** Beyond the
shore ramp the slanted column saturates - `pathLength = depth * (1/cos + 1)` with `cos`
floored at 0.18 gives 92 m of water on RustRig - so transmission is zero and the whole sea
becomes ONE flat scattering colour with no distance falloff, meeting the fogged distance at
a hard horizontal boundary. On RustRig's night sea that reads as a flat bright green sheet
(`captures/rustworks-wide-colour-model-NOT-shipping.png` against
`captures/rustworks-wide-c1-accepted-palette.png`). That is an undisclosed ART change to a
shipped arena and it is not a water lane's call to make.

**So RustRig, High Seas and Farcrysis no longer author a `waterType`.** Farcrysis' field was
inert anyway - its surface is presented by its own retained builder - and an inert field
claiming a grade is worse than none, because it would have taken effect silently the moment
that arena is re-pointed at the shared module, with none of the art review the other two now
require. Each opt-in is one commented-out line away.

**Measured proof the shipped arenas are back to their accepted grade** (`c1 -> HEAD`,
against each arena's own same-build floor):

| Arena | camera | mean abs delta | its noise floor |
| --- | --- | --- | --- |
| rustworks-1v1 | storm-down / grazing / wide | 0.000216 / 0.000278 / 0.000141 | 0.000213 - 0.000374 |
| high-seas | sea-down / grazing / wide | 0.000270 / 0.000258 / 0.000377 | 0.000245 - 0.000299 |

Every reading is inside, or within 1.3x of, the arena's own run-to-run noise. Silhouette
shift is 0 px on every rustworks camera.

**The colour model itself is retained, tested and measured** - the numbers that justify
enrolling an ocean later are in `measurements/cmp-colourmodel-*.json` (rustworks 0.024-0.049
mean, high-seas 0.015-0.045, one to two orders above their floors) and the captures are kept
as `*-colour-model-NOT-shipping.png`. What is missing before it can ship on an ocean is the
Fresnel / sky-reflection term (step 4 of the physical stack) that gives deep water something
to sit against, plus an owner art call.

The constraint is mechanised rather than trusted: **a body with `horizonRadius > 0` may not
author a `waterType`**, with a paired non-vacuity assertion that the bodies which DO carry
optics are the skirtless ones.

---

## What the skeptic found, and what happened to each

| # | Finding | Outcome |
| --- | --- | --- |
| 1 | Skirt not migrated; hard hue break on two shipped arenas | **Investigated, mechanism REFUTED, underlying regression fixed differently.** The skirt owns 1.54% of the frame and is not adjacent to the break; migrating it is worse; the real regression is the near plane's flat saturated colour. Both oceans un-enrolled and a gate added. (f) |
| 2 | The still-water backscatter capture, and the map3 noise floor, were measured on builds where the pond drew zero pixels | **Confirmed and corrected.** Capture citation withdrawn; replaced by a 400,000-sample measurement of the pond's own spectrum (max slope 0.0038 against a 0.06 gate). Noise floor re-measured on a pond-visible HEAD build: 0.000132 - 0.000275. (c), Method |
| 3 | The map3 PASS BAR 2 delta spans the pond becoming visible, so it cannot support "colour change with geometry unchanged" | **Confirmed, claim withdrawn and restated** as "the pond exists and reads as murky-pond extinction", carried by the coverage probe. (b) |
| 4 | `poolCoverage` in the committed JSONs was 1e-9-threshold frame drift, asserting 9-20% pond coverage on arenas with no ponds | **Confirmed and fixed** in `compare_hf420_water_captures.py`: 8/255 threshold, emitted only when the captured build authored a pond (read from the harness's own scene-graph readback, so a pond that is authored and not drawn still counts). The drift number is kept under the name of what it measures. All committed JSONs regenerated. (`fd912a86`) |
| 5 | Frame-time rows labelled "baseline" are lane commit 1; real pre-change rows ignored; no pre-change high-seas row | **Confirmed and relabelled**, with a new finding attached: `before-rustworks` also used the harness's EARLIER camera poses, so its pixel comparisons are void even though its frame-time row is not. (d) |
| 6 | The foam-ceiling analysis covered rustworks only; high-seas is provably dead, not weak | **Confirmed and reproduced independently**, then extended to every body and committed as a script. (c) |
| 7 | Pool amplitude never re-applied on a graphics change; ponds invisible to `publishActualGraphics` | **Confirmed and fixed** (`3ea0f2e7`), with a regression test proved non-vacuous twice: it fails with the fix disabled, and it avoids `RUSTWORKS_OCEAN_AMPLITUDE`'s profile entries, which are all the same 1.55 by design. |
| 8 | Pond meshes register no ray-tracing proxy, and neither coverage nor exclusion was written down | **Exclusion written down here.** `arena-proxy-registration.ts:69` matches `/Pass 64 TSL perimeter water/`; ponds are named `Pass 64 TSL water pool <bodyId>` and are deliberately not proxies - they are sub-metre, decorative, `swimmable: false`, and Map 3 is not a raytraced-proxy arena. Widening the pattern touches a file outside water ownership, so the patch is in the lane report rather than applied. |
| 9 | The "wide rollout is safe" claim was VERIFIED for High Seas / RustRig but never measured for Farcrysis | **Moot and superseded**: no ocean is enrolled. Farcrysis' inert field is removed with the reason written at the site. |
| 10 | (skeptic's own suspicion, refuted in the lane's favour) the technique-register licence step was skipped | Not skipped - vault register row 46, cited at the top of this file, which the previous report failed to do. |

---

## Defects found in other people's code (handed back, not patched)

1. **Map 3's Water bay basins are buried under its own floor.** The basin boxes top out at
   y = -0.05; the bay floor slab spans y -0.27 to +0.03 across the full bay width. Nothing at
   basin level is ever drawn - the "sunken basin either side of a walkway" in the arena's own
   comment does not exist on screen. The pond had to be moved 5 mm above the floor slab,
   inside the kerb, to be visible at all. Fixing the basin means moving the floor slab or
   cutting the basin out of it: ARENA GEOMETRY, Map 3's owner. Exact patch in the lane report.
2. **The foam / breaking estimator is near-dead on RustRig and identically dead everywhere
   else** (table in (c)). Pre-existing; it affects the shipped whitecaps, not only the new
   term.

## Defects found in this lane's own work

1. The first pond authoring rendered EXACTLY ZERO pixels while reporting `visible: true`
   with correct scene-graph data. Only the pool-hidden differencing probe caught it.
   **Gotcha:** a capture harness that cannot say which pixels an object owns cannot tell
   "authored and invisible" from "authored and subtle".
2. `poolCoverage` measured frame drift, not coverage (skeptic; fixed).
3. Ponds never re-read the profile gain (skeptic; fixed).
4. The skirt "fix" in `1566b9a1` was itself a regression, caught by the instrument built to
   evaluate it and reverted inside the same pass. **Gotcha:** an analytically correct
   endpoint is still wrong when the two surfaces have different response chains - one lit,
   one not. Derive the fix, then photograph it before believing it.

---

## Recommendation to the orchestrator

- **Map 3 ponds and the colour model code: SAFE to merge.** One added pipeline, created at
  load, zero in-combat creations, no new pass, no measurable frame-time cost, geometry
  provably untouched, buoyancy structurally unreachable, and both shipped oceans measured
  back to their accepted grade.
- **The wide rollout is NOT in this branch any more,** and re-enabling it is an owner art
  call that needs the Fresnel / sky-reflection term first. The evidence to make that call is
  in this directory.
- **Do not treat backscatter as delivered.** It is correct, cheap and provably zero where it
  should be, but the estimator that drives it - and the shipped whitecaps - is dead on every
  body except RustRig, where it tops out at 0.066 of 1.0.
- **The pond-in-every-level gate is owed:** two arenas and a siting pass.

---

## Contents of this directory

- `captures/` - half-resolution PNGs, named by what they ARE rather than "before/after":
  `*-c1-accepted-palette` is the shipped grade, `*-HEAD-reverted` is this branch,
  `*-colour-model-NOT-shipping` is what enrolling an ocean would look like,
  `*-skirt-migration-REJECTED` is the rejected fix, and
  `rustworks-wide-SKIRT-OWNERSHIP-mask.png` paints the skirt's own pixels magenta.
- `measurements/cmp-noise-*` - same-build run pairs, including the pond-VISIBLE floor.
- `measurements/cmp-prechange-vs-c1-map3.json` - c1 stands in for pre-change, measured.
- `measurements/cmp-c1-to-HEAD-*` - what this branch actually changes, per arena.
- `measurements/cmp-colourmodel-*` - what the colour model does, retained for the art call.
- `measurements/cmp-skirt-migration-*` - the rejected skirt fix, with the seam instrument.
- `measurements/cmp-backscatter-rustworks.json` - the FAIL, on the fixed comparator.
- `measurements/foam-estimator-ceiling.json` - the ceiling, every body.
- `measurements/tripwire-*.json` - pipeline compile-stall probe, baseline and lane.
- `measurements/frame-time-budgets.json` - every frame-time sample, labelled by stage, with
  the pose caveat recorded in the file itself.
- `measurements/water-roster-test-RED.log` and `water-roster.test.ts.txt` - the owed gate.
