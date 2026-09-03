# Lane AM - HF-420 realtime water surfaces, Map 3 trial

**Branch:** `contrib/dave-gaming-pc/claude/hf420-water-everywhere` (from `0c7aab53`)
**Worktree:** `C:/Users/david/projects/aa-claude-water`
**Skill applied:** `threejs-webgpu-water` v1.1.0 (canonical store, read in full)
**Study executed:** `realtime-water-surfaces.md` section 8, the Map 3 EXPERIMENT PLAN

---

## Verdict

**PARTIAL.** Four of the five pass-bar items are met and measured. One is NOT met -
backscatter is not visibly green-shifted in the turbulent capture - and the cause is
diagnosed, numerically, as a defect in the repo's EXISTING foam estimator rather than in the
new term or its injection point. The cross-arena rollout stopped at Map 3 under the trial's
own STOP conditions.

---

## What shipped (5 code commits on the lane branch, plus this evidence)

| # | Commit | What |
| --- | --- | --- |
| 1 | `15fff76b` | Map 3 ponds exist as DATA - finite shaped bodies, no new shader file |
| 2 | `ffc1db92` | Beer-Lambert extinction replaces the palette lerp |
| 3 | `6f0751e4` | Broadband bubble backscatter, injected upstream of absorption |
| 4 | `c5ae08f7` | Deep-water scattering closure - absorption alone renders black |
| 5 | `be16ee17` | The Map 3 pond rendered ZERO pixels - the arena's basin is buried |

Files touched: `src/water/water-authoring.ts`, `src/water/ocean-tsl.ts`,
`src/water/ocean-tsl.test.ts`, `src/rendering/pass64-tsl-scene.ts` (the water wiring only),
`scripts/qa/capture-hf420-water.mjs` (new), `scripts/qa/compare_hf420_water_captures.py` (new).
**Nothing outside water ownership was edited.** No gate, threshold, timeout or test was
weakened; the cold-compile admission fence was not touched.

---

## Method

Every capture is a FIXED-TIME review camera (`setCaptureCameraPose(..., fixedVisualTimeMs,
seed)`) with bots cleared and the viewmodel hidden, at 2560x1440, in HEADLESS installed
Chrome on native WebGPU. No headed browser was launched at any point; the harness has no
headed mode and refuses to start below 3000 MiB free GPU, waiting 60 s x10 for headroom
rather than taking it. ComfyUI's queue was empty and the power plan was High performance for
every measurement.

**Noise floor first.** Three arenas, two runs each of the UNCHANGED build:

| Arena | mean abs pixel delta | silhouette max shift |
| --- | --- | --- |
| map3 | 0.000110 - 0.000318 | 0 - 18 px (mean <= 0.14) |
| rustworks-1v1 | 0.000213 - 0.000374 | 0 px |
| high-seas | 0.000245 - 0.000299 | 0 - 1 px |

Every delta below is quoted as a multiple of its own arena's floor.

---

## Pass bar, item by item

### (a) The pond exists with no new shader file - PASS

Two ponds (the Water bay's north and south reflecting basins) are authored purely as data in
`water-authoring.ts` and rendered by the existing `createOceanTslWater`. No shader file was
created and no shader term was needed to author them.

**Honest qualification.** The falsifier held, but the module DID need data plumbing: finite
rectangular extents, a centre offset, and a horizon-skirt opt-out, because it had only ever
built one square plane at the arena origin. That is a module which assumed ONE SEA PER ARENA -
not one which assumed A SHADER PER BODY. The distinction is the falsifier's, and it survives.

### (b) Visible colour change, geometry unchanged - PASS

| Capture | mean abs delta | x noise floor | silhouette shift |
| --- | --- | --- | --- |
| map3 shallow-down | 0.017208 | 156x | 0 px |
| map3 shoreline | 0.017552 | 97x | 64 px max, 0.073 mean |
| map3 wide | 0.005674 | 18x | 18 px max (== its own noise) |
| rustworks storm-down | 0.048514 | 228x | 0 px |
| rustworks storm-wide | 0.027095 | 127x | 0 px |
| high-seas sea-down | 0.044724 | 182x | 0 px |
| high-seas sea-wide | 0.021176 | 71x | 507 px - see caveat |

**Pond coverage, measured not assumed.** The harness captures every frame twice, once with
the pool group hidden, so "the pond is in this shot" is a differencing result:

| Camera | pond pixels (> 8/255) | share of frame |
| --- | --- | --- |
| shoreline | 1,304,805 | 35.40% |
| shallow-down | 1,356,146 | 36.79% |
| wide | 213,609 | 5.80% |
| grazing | 3,226 | 0.09% |

Pond mean colour **R 0.0007 / G 0.0849 / B 0.0062** against the floor behind it at
**R 0.0223 / G 0.0258 / B 0.0577** - red and blue absorbed, green surviving. That is the
murky-pond extinction vector and nothing else could have produced it.

**Caveat on the silhouette metric, stated rather than buried.** The metric finds, per column,
the first row that is not sky by a fixed luma threshold. It is only valid while the water
stays on the same side of that threshold. On rustworks (already dark) it reads 0 px on every
camera. On high-seas the water crossed the threshold, so the 507/547 px readings measure the
BRIGHTNESS change, not geometry. The geometry claim rests on the stronger evidence: the
displacement expression, `OCEAN_BANDS` and `oceanSpectrumFingerprint()` are untouched by every
commit in this lane - colour is the only thing that moved, by construction.

### (c) Backscatter green-shifted when turbulent, exactly zero when still - HALF PASS, HALF FAIL

**Zero in still water: PASS, and stronger than a screenshot.** A Map 3 pond's steepest
possible summed slope is ~0.005 against the foam gate's 0.06, so the term is a HARD zero. A
unit test asserts `oceanBackscatterDensity === 0` at every crest height for the authored pond.
The commit-2 to commit-3 pond captures differ by 0.000187 mean, inside the 0.000110 - 0.000318
noise floor.

**Green-shifted when turbulent: FAIL.** Commit 3 moved the rustworks captures by
0.00014 - 0.00092 mean against a same-build floor of 0.00027 - 0.00038 - between 0.4x and 3.4x
noise. By the HF-410 rule that is not an effect.

**Cause, measured.** It is not the injection point and not the colour constant. The repo's
existing crest estimator multiplies a crest-HEIGHT term by a SLOPE term, and for a sum of
sines those are in quadrature: height ~ sin(phase), slope ~ cos(phase), so where the crest is
highest the slope is zero. Sampling 400,000 (x, z, t) points on the rustworks storm spectrum:

- max reachable `crestFoam` = **0.0714** (of a possible 1.0), at normalised crest 1.076 and
  slope 0.0939;
- slope p50 0.0503, p99 0.1045, max 0.1271, against a gate that opens at 0.06 and saturates at
  0.2 - the estimator never leaves the bottom of its own ramp.

So the repo's foam is near-dead, and ANYTHING DRIVEN BY IT IS NEAR-DEAD TOO - which includes
this backscatter term BY DESIGN, because the skill requires foam and backscatter to share one
estimator. The fix is not a colour constant: it is Jacobian-based breaking detection with a
persistent foam field, which is step 3 of the physical stack and explicitly out of scope for
this pass. The injection point is separately proved correct by a unit test showing the
upstream and downstream forms are measurably different pictures (upstream gains more green
than red or blue; downstream gains identical amounts in all three).

### (d) Tripwire, frame time, tsc, vitest, roster test - MOSTLY PASS

**Pipeline tripwire - PASS, with a before/after baseline rather than an assertion:**

| Arena | pipelines before window | created in window | created IN A STALL | enrichment |
| --- | --- | --- | --- | --- |
| map3 baseline (`0c7aab53`) | 185 | 1 | 0 | 0 |
| map3 with this lane | 186 | 1 | 0 | 0 |
| high-seas baseline | 251 | 1 | 0 | 0 |
| high-seas with this lane | 251 | 1 | 0 | 0 |

Two ponds add exactly ONE pipeline to the whole game, created at load, and High Seas adds
none - the pond shares the ocean's graph, differing only in uniforms. In-combat creations are
unchanged and zero of them land in a stall. The admission fence was not widened or touched.

**Frame time - NOT RESOLVABLE at the stated budget, stated honestly.** The budget was
<= 0.30 ms median added. This instrument cannot see that: two runs of the SAME build on
high-seas returned p50 16.1 ms and 12.6 ms, a 3.5 ms same-build spread, more than ten times the
budget. Measured p50 (2560x1440, quality, n=90):

| Arena | baseline runs | with this lane |
| --- | --- | --- |
| map3 | 8.9 / 8.5 | 10.3 |
| rustworks | 11.4 / 11.8 | 10.8 |
| high-seas | 16.1 / 12.6 | 10.4 |

Every "after" number sits inside the same-build spread and two of three are faster than their
baseline, which is itself the sign that the spread dominates. **Claim: no measurable
regression. NOT claimed: a delta under 0.30 ms** - that would need a quiet-machine harness
with far more samples, and building one was outside this trial's budget.

**tsc:** clean. **Focused vitest:** `src/water/**` 29 tests green; with `pass64-tsl-scene`,
`water-system` and `arena-visual-definition` alongside, 66 green. The full suite was NOT run
(lane rule).

**Roster test - WRITTEN, PROVED RED, NOT LANDED GREEN. This is the one open item.**
`water-roster.test.ts` derives its roster from `ARENA_IDS`, requires water or an explicit
written-down opt-out, and mechanises the falsifier permanently (a scratch id with no entry is
reported). Run against HEAD it fails with exactly:

    expected [ 'atomic-acres', 'skyline-terminal' ] to deeply equal []

That is the honest state of "a pond in every level": 5 of 7 shippable arenas covered
(rustworks-1v1, farcrysis, high-seas by their seas; map3 by two new ponds), with `gun-range` a
written opt-out and `test1`/`test2` fixtures. The test is NOT committed as a passing gate
because it does not pass; its source and its red output are committed here as
`water-roster.test.ts.txt` and `measurements/water-roster-test-RED.log`. It goes green the
moment atomic-acres and skyline-terminal get a pond, which is the next commit in this lane.

**Why the rollout stopped there (STOP condition, not an omission).** Siting a decorative water
surface in two shipped competitive arenas needs a verified clear footprint and a before/after
capture per arena. The siting probe was written and run for atomic-acres, but converting its
clear rectangles into an authored level requires resolving the capsule-origin-to-ground
offset, and the remaining window was not enough to do that AND capture the result. Guessing a
Y and shipping water floating over, or sunk into, Atomic Acres is worse than shipping none.
Reported rather than pushed through.

### (e) Buoyancy unaffected - PASS by construction

`sampleOcean()`, `OCEAN_BANDS` and `oceanSpectrumFingerprint()` are byte-identical across every
commit in this lane; `git diff 0c7aab53..HEAD -- src/water/ocean-spectrum.ts` is empty. Every
new term is a colour node downstream of `material.colorNode` / `emissiveNode`; none is
reachable from `positionNode` or from any height query. Ponds are registered in a SECOND table
(`WATER_POOLS`) that `waterBodyForArena` - the host-authoritative accessor `water-system.ts`
reads for level, swimmable and amplitudeScale - cannot see at all, so "a pond feeds buoyancy"
is unrepresentable rather than merely undocumented. Every pond is `swimmable: false`.

---

## Two defects found in other people's code (handed back, not patched)

1. **Map 3's Water bay basins are buried under its own floor.** The basin boxes top out at
   y = -0.05; the bay floor slab spans y -0.27 to +0.03 across the full bay width. Nothing at
   basin level is ever drawn - the "sunken basin either side of a walkway" in the arena's own
   comment does not exist on screen. The pond had to be moved 5 mm above the floor slab, inside
   the kerb, to be visible at all. Fixing the basin means moving the floor slab or cutting the
   basin out of it: ARENA GEOMETRY, Map 3's owner, not a water lane's to change.
2. **The foam / breaking estimator is near-dead** (numbers in (c) above). Max reachable value
   0.0714 of 1.0 on the game's stormiest sea. Pre-existing; it affects the shipped whitecaps,
   not only the new term.

## One defect found in this lane's own first attempt

The first pond authoring rendered EXACTLY ZERO pixels while reporting `visible: true` with
correct data in the scene graph. Only the pool-hidden differencing probe caught it; a dark
screenshot and a scene-graph dump both looked fine. **Gotcha worth keeping:** a capture harness
that cannot say which pixels an object owns cannot tell "authored and invisible" from
"authored and subtle", and in a shadowed interior those look identical.

---

## Recommendation to the orchestrator

- **Map 3 ponds and the colour model: SAFE to merge.** One added pipeline, created at load,
  zero in-combat creations, no new pass, no measurable frame-time cost, geometry provably
  untouched, buoyancy structurally unreachable.
- **The wide rollout is already in this branch** - High Seas, RustRig and Farcrysis all author
  a water type - and the numbers above are from those arenas. The one-line revert per body
  (delete `waterType`) is retained deliberately if any arena's grade is judged wrong.
- **Do not treat backscatter as delivered.** It is correct, cheap and provably zero where it
  should be, but it is invisible until the breaking estimator is replaced. That is a scoped
  follow-up (persistent Jacobian foam), not a tweak.
- **The pond-in-every-level gate is owed:** two arenas and a siting pass.

---

## Contents of this directory

- `captures/` - before/after PNGs at half resolution (1280x720), plus the pool-hidden frame
  that proves pond coverage.
- `measurements/cmp-*.json` - per-capture pixel statistics, including the same-build noise runs
  (`cmp-noise-*`).
- `measurements/tripwire-*.json` - pipeline compile-stall probe, baseline and with this lane.
- `measurements/frame-time-budgets.json` - every frame-time sample taken in this lane.
- `measurements/water-roster-test-RED.log` - the roster gate failing, with the two arena ids.
- `water-roster.test.ts.txt` - the roster gate's source, ready to land once those two arenas
  have water.
