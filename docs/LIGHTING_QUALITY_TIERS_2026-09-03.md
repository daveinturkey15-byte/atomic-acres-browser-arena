# Lighting quality tiers: what each lighting feature is, what it costs, and where it is on by default

**Ledger row:** HF-418 item 4. **Lane:** AL.
**Written:** 2026-09-03. **Base:** integration head `d329628d` (PASS 86 live).
**Renderer:** three r185 WebGPU + TSL, WebGPU only.

Companion documents, and the seam with each:

- `docs/GRAPHICS_PROFILES_2026-09-03.md` (Lane AI, branch
  `contrib/dave-gaming-pc/claude/graphics-profiles-clarity`) owns the **ladder**:
  which profiles exist, in what order, with what copy, and the RTX explainer.
  This document owns the **lighting features** the ladder switches. Lane AI's §7
  carries the row `OPEN (HF-418 item 4, blocked on Lane AL)`; this closes it for
  baked indirect and states honestly what it does not close.
- `docs/DYNAMIC_LIGHTING_2026-09-03.md` (Lane AB, branch
  `contrib/dave-gaming-pc/claude/dynamic-lighting`) owns **time of day and
  weather**: how the sun moves within each arena's authored band. §4 below is the
  interaction between the two, and it is not a footnote — a moving sun is an
  input to a baked volume's cache key.

Every row carries a claim-state. **VERIFIED** = this lane measured it or ran it.
**CLAIMED** = asserted elsewhere and not re-checked. **OPEN** = unresolved.

---

## 0. The owner's sentence, and which part this lane answers

> "when i say ray tracing i mean the beautiful lighting etc, get it all working
> in a nice way that wont murder FPS and you can adjust and on/off stuff,
> quality maybe its on lightly, maybe make a new balanced profile that doesnt
> look shit like performance but will run nice and look good? … its more about
> the assets and sensible lighting than balls to the wall"
> — 2026-09-02 ~19:10 BST

The part this lane answers is **"beautiful lighting that won't murder FPS"**, and
the specific gap it closes is this, measured from the registry at head:

> **Nothing below MAX computes an indirect bounce.** `screenSpaceGi` is `off` on
> PERFORMANCE, BALANCED, QUALITY and RAY TRACED. `indirectLighting` is a scalar
> on a hemisphere approximation, not a bounce. So a wall facing away from the
> sun is lit by a constant: it reads flat, and the shaded side of every interior
> reads as the same grey whatever colour the room is. **VERIFIED** (read from
> `GRAPHICS_PRESET_VALUES` at `d329628d`).

That is the single largest distance between this build and the word "beautiful",
and it is the one thing screen-space techniques structurally cannot fix, because
a bounce needs light from geometry that is not on screen.

---

## 1. The feature, in one paragraph

**Baked indirect light.** A path tracer runs over the arena's static massing —
the *same* analytic proxy set the RAY TRACED preset traces against — and writes
the result into a small 3D grid of spherical-harmonic coefficients. At runtime
each shaded pixel reconstructs its world position and normal, takes **three 3D
texture fetches** and does **eleven multiply-adds**, and gets that surface's
indirect light. The tracing happened before the frame started. There is no
march, no denoiser, no history buffer and no temporal artefact class.

The RTX skill's route 4 names this twice: as the honest default, and as
**"route 3's indirect-lighting supply"** — classic recursive ray tracing computes
no bounce at all, and the documented failure mode is raising a flat ambient
constant until the whole scene is milk. This is what gets raised instead, which
is why RAY TRACED takes the expensive tier and pays nothing per frame for it.

---

## 2. The control, and where it is on

One control, `bakedIndirect`, id `graphics-baked-indirect`, category `lighting`,
apply mode `pipeline-rebuild`, runtime consumer `baked-indirect`.

| Profile | Tier | The argument, in one sentence |
|---|---|---|
| PERFORMANCE | `off` | Not because the frame cannot afford three texture fetches — it can — but because the BAKE is CPU work at load on the machines this preset exists for, and PERFORMANCE's contract is that nothing in the screen-space stack runs here at all. |
| **BALANCED** | `low` **(proposed — Lane AI's preset, patch in §7)** | BALANCED's whole design is "QUALITY's look without QUALITY's per-frame structures". This is a look with no per-frame structure at all, so it is the single best-fitting entry BALANCED can take. |
| QUALITY | `low` | The owner's *"quality maybe its on lightly"*. QUALITY is the auto-selected default, so the bar is "nearly free": no march, no extra render target, no attachment beyond the normal buffer QUALITY's SSR already allocates, and — measured — **zero extra pipelines**. |
| RAY TRACED | `high` | Because the trace computes no indirect bounce at all. See §1. |
| MAX | `high` | Alongside SSGI, not instead of it: SSGI bounces what is on screen *this frame* (a muzzle flash, a moving player's lit side); the bake carries the static room's own bounce, including from geometry off screen. Neither subsumes the other and both are additive. |

The two tiers differ **only in bake cost**, never in per-frame cost:

| Tier | Probe grid | Rays / probe | Bounces | Composite gain |
|---|---|---|---|---|
| `low` | 24 x 12 x 24 (6912) | 48 | 1 | 0.380 |
| `high` | 24 x 12 x 24 (6912) | 128 | 2 | 0.500 |

Both bind the same three textures at the same fixed grid, which is why switching
between them is deliberately **not** a topology change (pinned by
`src/rendering/lighting/baked-indirect-profile.test.ts`): a pipeline recompile
for a texture upload would be a real cost paid for nothing.

---

## 3. Measured cost

**Method (VERIFIED).** `scripts/qa/measure-baked-indirect.mjs`, one fresh
headless Chrome per row, 2560x1440, real WebGPU backend confirmed per row, the
owner's ComfyUI queue read before AND after each row (a row taken with work
queued is voided, not annotated), cold shader cache.

**This section was rewritten on 2026-09-03 after a skeptic review.** What changed
and why is stated inline rather than quietly corrected, because three of the
numbers that were here were wrong in ways worth remembering:

- the bake-cost table was quoted from a SIX-occluder synthetic scene while every
  shipped arena has twenty-four (SS 3.4), and its figures matched neither its own
  cited evidence file nor a re-run;
- the A/B's sample window opened six seconds after admission, which is inside the
  bake at BOTH tiers, so the row labelled "HIGH costs +5.8 ms" was a measurement
  of the loading transient (SS 3.5);
- the "layer ON" pipeline counts were cited from three rows this document itself
  annotated as void (SS 3.1).

The current rows are ten on the built bundle at branch head: nine A/B rows (three
tiers x three repeats, 45 s settle) and one two-arena row that switches map
inside a single page load.

### 3.1 The number that matters most: pipelines at admission

Same build, same arena, minutes apart, three repeats per cell (SS 3.5):

| `bakedIndirect` | Pipelines at admission | Runs |
|---|---|---|
| `off` | **374** | 374 / 374 / 374 |
| `low` | **371** | 371 / 371 / 371 |
| `high` | **371** | 371 / 371 / 371 |

**The layer adds no pipeline.** That is the direct answer to "won't murder FPS".

Two honesty notes on this table, both corrections:

- The count is *not* the perfectly deterministic quantity an earlier draft of
  this section claimed. Turning the layer on moved it DOWN by three, three times
  out of three, which is admission-ordering rather than a saving. What the
  measurement supports is "no increase", not "identical".
- An earlier draft also matched these against Lane AI's independent QUALITY
  baseline of 374 / 300 / 251 on three arenas and called it an exact match. The
  layer-ON figures it used came from the three rows SS 3.6 annotates as void as
  an A/B. The comparison is dropped; the same-build A/B above replaces it and is
  a stronger measurement anyway, because both cells come from one bundle.

It is also the answer to the cold-compile fence. A layer that compiles nothing
new cannot push a profile past an admission fence, so every tier admits inside
the fence for the same reason the profile below it does.

### 3.2 The tripwire

`pipelinesInCombat = 0` on **every row taken for this lane**, including all
nine A/B rows and the two-arena swap row. Nothing is compiled while a settled
match is being played. **VERIFIED.** This is the measurement that matters most
for the owner's freeze reports, and it is the one the layer could most easily
have broken: a naive implementation that rebuilt the node when the arena changed
would compile a pipeline during a transition. It re-uploads into fixed-size
textures instead, precisely to avoid that.

### 3.3 The runtime receipt, on the built bundle

`documentElement.dataset.bakedIndirect`, written per frame by the code that
binds, read headless with no debug hook:

| Arena | Receipt | Reading |
|---|---|---|
| `atomic-acres` | `24x12x24:7536c242:24:0.380` | grid, digest, **24 occluder shapes**, live gain |
| `skyline-terminal` | `24x12x24:781efe12:24:0.380` | distinct digest — not another arena's volume |
| `high-seas` | `24x12x24:ff21f3c8:24:0.380` | distinct digest |
| any, tier `off` | `off` | published even when the layer is not built |

The `off` row was previously VERIFIED as a unit test and CLAIMED in the browser.
It is now **VERIFIED in the browser**: all three `off` rows of the A/B read `off`
rather than being absent.

**The digests are cross-checked against the offline bake.** `atomic-acres` LOW
`7536c242` and HIGH `104e394b`, and `skyline-terminal` LOW `781efe12`, are the
same digests `scripts/bake/bake-arena-indirect.mjs` produces from the extracted
proxy of that arena. The runtime and the offline bake key identically. One cell
does not match and is recorded as such in SS 7.

**All four parts are asserted by the harness, not just the first.** The RTX
skill records a live harness that read this exact shape of receipt and checked
only the shape count, returning PASS on the run that demonstrated the defect.
The occluder count is in the receipt because a bake that finds zero occluders
binds successfully and is *correctly invisible* — the "correct image of nothing"
state — and that must be distinguishable from a bind failure. **No measured
arena is at zero. VERIFIED.**

### 3.4 Bake cost, from real arenas

**This table used to be wrong, and how it was wrong is the point.** Every figure
in it came from `syntheticScene()` inside the bake script: SIX occluders,
`capReason: 'synthetic self-test scene'`. Every shipped arena's own runtime
receipt reports TWENTY-FOUR (SS 3.3). Nothing in the repository could have
produced a real number, because `scripts/qa/extract-arena-proxy.mjs` - named in
the bake script's own header as the stage that feeds it - did not exist. The
published figures also disagreed with their own cited evidence file (892/971 vs a
committed 1736/1214) and with a re-run of the identical command (3182/3073), and
the "cached 0 ms" row had no measurement behind it anywhere.

The extraction stage now exists. It reads the ProxyScene, quantised lighting and
digest that the runtime itself bakes against out of a headless WebGPU page, and
the digest it pulls matches the live runtime receipt on all three arenas. The
table below is a bake of those real proxies, **3 repeats per cell**, 6912 probes,
24 x 12 x 24 grid, quiet machine, ComfyUI queue empty:

| Arena | Occluders | Buried probes | LOW (3 runs, ms) | LOW median | HIGH (3 runs, ms) | HIGH median |
|---|---|---|---|---|---|---|
| `atomic-acres` | 24 | 1449 | 709 / 817 / 773 | **773** | 3072 / 2662 / 3007 | **3007** |
| `skyline-terminal` | 24 | 1015 | 931 / 951 / 1101 | **951** | 2772 / 2306 / 2165 | **2306** |
| `high-seas` | 24 | 1940 | 1027 / 1140 / 984 | **1027** | 3916 / 4290 / 3902 | **3916** |

Serialised volume 442 KB in every case. The cached path is now measured rather
than asserted: a serialise/deserialise round trip of the volume is **21-52 ms**,
against a bake of 0.8-3.9 s. Determinism is unchanged and still checked every
run: identical digest and byte-identical coefficients across all three repeats of
every cell.

**A real arena is not slower than the synthetic stand-in, for a reason worth
knowing.** More shapes cost more per ray, but a real arena buries far more
probes - 1015 to 1940 of 6912 sit inside geometry and are skipped entirely, then
filled from their neighbours - and the two effects roughly cancel. A skeptic's
24-shape *synthetic* proxy measured 5.6 s and 19.8 s because almost none of its
probes were buried. This is why the fixture has to be an extracted arena and not
a plausible-looking stand-in of the right shape count.

**Convergence at 3 ms per presented frame**, which is what the runtime spends
(SS 3.5, and the budget is now enforced - see below):

| Arena | LOW | HIGH |
|---|---|---|
| `atomic-acres` | ~258 frames, **~6 s** at 45 Hz | ~1002 frames, **~22 s** |
| `skyline-terminal` | ~317 frames, ~7 s | ~769 frames, ~17 s |
| `high-seas` | ~342 frames, ~8 s | ~1305 frames, **~29 s** |

**The 3 ms budget is now a bound, and it was not one before. VERIFIED.** The
stepper checked its deadline every 16 probes, so one step paid up to sixteen
probes of straight-line JavaScript however small the budget was: a skeptic
measured mean 13.1 ms / worst 79 ms at LOW and mean 45.9 / worst 198 at HIGH. A
198 ms main-thread stall is the freeze class this project spent PASS 82-83
removing, and HIGH is the default on MAX and RAY TRACED. Two causes, both fixed:
the unit of work is now a RAY rather than a probe (a probe is resumable, keeping
its ray cursor and jitter offset, so a chunked bake stays byte-identical to a
one-shot one), and the deadline is read from `performance.now()` rather than
`Date.now()`, whose ~15.6 ms granularity on Windows cannot express a 3 ms budget
at all.

Measured after the fix, 400 steps, 24-occluder proxy, `scripts/qa/measure-bake-step-budget.mjs`:

| Tier | Mean step | p95 | Worst | Steps over 2x budget |
|---|---|---|---|---|
| `low` | 3.03 ms | 3.10 ms | **5.13 ms** | 0 / 400 |
| `high` | 3.02 ms | 3.07 ms | **3.89 ms** | 0 / 400 |

### 3.5 The tier A/B, re-taken after convergence

The harness drives the real Options surface exactly as the owner does: open
OPTIONS, set `#graphics-baked-indirect`, press SAVE GRAPHICS, ride the
renderer-reconstruction reload, then deploy. One control moves; nothing else
about the profile does. (Seeding the persisted settings blob into localStorage
was tried first and never survives a boot; the harness's own fail-closed receipt
check caught it rather than letting it be published as an A/B.)

**What changed since the first version of this table.** It sampled 6 s after
admission. The bake is spread at 3 ms per presented frame, so convergence is
~6 s at LOW and ~22 s at HIGH on this arena (SS 3.4): the old window was inside
the bake at BOTH tiers, and the row that read "HIGH costs +5.8 ms" was measuring
the loading transient. The settle is now 45 s and every cell is repeated three
times.

One build, one arena (`atomic-acres`), 2560x1440 headless, real WebGPU, ComfyUI
queue 0 before AND after all nine rows, zero page errors, `pipelinesInCombat = 0`
in all nine. **VERIFIED.**

| Tier | Median (3 runs) | p95 (3 runs) | Frames/s | >33 ms | Pipelines @admission | Receipt |
|---|---|---|---|---|---|---|
| `off` | 16.6 / 22.1 / 16.7 | 22.2 / 27.9 / 22.3 | 67.2 / 48.8 / 54.7 | 2 / 30 / 4 | 374 | `off` |
| `low` | 16.7 / 22.2 / 22.2 | 27.7 / 27.9 / 27.9 | 52.8 / 45.3 / 45.5 | 12 / 25 / 18 | 371 | `24x12x24:7536c242:24:0.380` |
| `high` | 22.3 / 22.2 / 22.2 | 33.4 / 27.8 / 28.0 | 40.2 / 45.1 / 44.3 | 47 / 11 / 31 | 371 | `24x12x24:104e394b:24:0.500` |

**Reading 1 - the medians are BIMODAL and that governs how much can be claimed.**
Every median in the table is either 16.7 ms or 22.2 ms: this machine settles into
a ~60 Hz or a ~45 Hz bucket and stays there for the whole window. `off` landed in
the fast bucket twice, `low` once, `high` never. The within-cell spread is
therefore one whole bucket, which is larger than any difference between `off` and
`low`. **The honest statement is that no per-cell delta smaller than one bucket
is readable from three repeats**, and `low` versus `off` is smaller than that.
The weaker claim that does survive: nothing in the `low` rows looks like a cost,
and the layer adds no pipeline (SS 3.1).

**Reading 2 - HIGH's +5.8 ms does not survive to steady state.** The old table
had `high` at 33.3 ms median against `off` at 27.5. After convergence `high`
sits at 22.2-22.3, in the same bucket as `low`, with p95 27.8-33.4 against
`off`'s 22.2-27.9. So the previous +21% was substantially the converging bake, as
was argued - **but that argument was claim-stated VERIFIED while its verification
sat on the same report's OPEN list**, and it did not reconcile either (the bake
budget is tier-independent, so a 3 ms budget cannot explain a 5.8 ms
differential). It is now measured. What remains at HIGH after convergence is a
p95 and a >33 ms count above `off`'s, both inside the machine's own spread.

**Reading 3 - `>33 ms` is now reported, because it was omitted before.** The
first table quoted only median and p95 while `>33 ms` rose 87 to 131 (+51%) on
the row it called indistinguishable from off - and `>33 ms` is a metric this
repository's own frame-pacing gate uses. Repeated three times per cell it reads
2/30/4 (off), 12/25/18 (low), 47/11/31 (high): a 15x within-cell spread at `off`
and a 4x one at `high`. The metric is too noisy on this machine at this sample
length to separate the cells, which is a statement worth making explicitly rather
than a number worth leaving out.

**Reading 4 - the tier genuinely reaches the bake.** LOW and HIGH produce
DIFFERENT digests on the same arena (`7536c242` vs `104e394b`) and different live
gains (0.380 vs 0.500), consistently across three repeats each. A tier being
silently ignored would produce the same digest twice.

**Reading 5 - the arena swap, measured inside ONE page load.** This is the row
that catches the defect every other row in this document is blind to. The runtime
never re-derived its digest after the first bind: `maybeStartBake` returned
before extracting or hashing anything, and the only thing that re-opened it was a
tier change. Since the post graph is built once per session and an arena change
does not rebuild it, **the second and every later arena in a session sampled the
first arena's probe volume, at the first arena's origin** - and a full day of sun
travel never re-baked either. Every row above is a cold single-arena page load,
which is the one condition under which that is invisible.

Measured after the fix, one page load, main menu, second arena, deploy:
`24x12x24:104e394b:...` (atomic-acres) -> `24x12x24:058a6ef4:...`
(skyline-terminal), 0 page errors, 0 in-combat pipelines. **VERIFIED.**

The trigger is `document.documentElement.dataset.arenaId`, which `legacy-main.ts`
already writes on every selection. A structural fingerprint of the scene root was
tried first, passed its unit tests, and **did not work in the built bundle**: the
root's 58-64 direct children churn during a match (pooled groups, prewarmed
corpses, one `window-debris:*` group per broken pane), so a rule waiting for them
to hold still never gets its moment. That failure is recorded here because the
unit test that passed was a real test of the wrong signal.

### 3.6 The noise floor on this machine

Three earlier rows, taken before the Options drive existed, turned out to be
three runs of one identical configuration. That makes them a noise measurement,
and it is the most useful thing they produce:

| Run (identical control set) | Median | p95 | Frames/s | Deploy |
|---|---|---|---|---|
| 1 | 22.2 ms | 38.8 ms | 42.2 | 62.6 s |
| 2 | 27.8 ms | 50.0 ms | 32.4 | 68.8 s |
| 3 | 22.4 ms | 33.4 ms | 38.3 | 75.7 s |

**~25% spread on the median and ~50% on p95, on an identical build with
identical settings**, with five other PASS 87 lanes sharing the GPU. That
independently corroborates Lane AI's refusal to read any single-cell comparison
under about 15%.

The re-taken A/B (SS 3.5) sharpens this rather than replacing it. On a quiet
machine the medians are not noisy-continuous, they are **bimodal**: every one of
the nine rows landed on either 16.7 ms or 22.2 ms and stayed there. So the
correct yardstick is not a percentage at all - it is one whole 60-to-45 Hz
bucket, and a difference smaller than that cannot be read from three repeats
however quiet the machine is. Anything this lane claims about `low` versus `off`
per-frame cost is therefore bounded by "no more than one bucket", and the
categorical measurements - zero added pipelines, zero in-combat compiles - are
what carry the "won't murder FPS" answer.

---

## 4. The seam with Lane AB: a moving sun is an input to a baked volume

This is the interaction the two lanes have to agree on, and it is not obvious.

Lane AB's model moves each arena's sun continuously within its authored band —
Nuke Town's elevation travels -11.0° to +19.9°, High Seas' -40.1° to 0.0°. A
baked volume is a function of the sun. So:

1. **The digest covers the lighting, not just the geometry.** A cache keyed on
   the arena would serve a noon bake at dusk, which is a lighting bug that
   presents as an art bug. `computeBakeDigest` takes the proxy set, the lighting
   AND the tier. **VERIFIED** by three tests: moving the geometry, moving the
   lighting, and changing the tier each move the digest.
2. **The sun is quantised before it reaches the digest** — direction to 1/12,
   colour to 1/8 — so a continuously moving sun re-bakes a handful of times
   across a full day cycle instead of restarting every frame. Verified that
   0.06° of movement does not move the digest and that noon → dusk does.
   **VERIFIED.**
3. **The consequence Lane AB should know about, stated plainly - and note that
   until 2026-09-03 the opposite was true.** Points 1 and 2 describe what
   `computeBakeDigest` does, and they are correct about the function. They were
   not correct about the runtime: it never re-derived the digest after the first
   bind, so a noon bake WAS served at dusk and no re-bake ever started (SS 3.5,
   Reading 5). Fixed and confirmed live. The consequence is therefore now real
   rather than hypothetical: on an arena with a wide band (High Seas, 40° of
   elevation travel) a full traverse crosses several quantisation cells, and each
   crossing starts a fresh converging bake - measured on the extracted High Seas
   proxy at **~8 s at LOW and ~29 s at HIGH** (SS 3.4), during which the indirect
   term is a blend of the previous volume and a re-converging one rather than
   wrong. **OPEN:** whether that reads as a slow, pleasant warm-shift or as a
   visible settle has not been captured. It is the first thing to look at if the
   two features ship together.
   The cheap mitigation, if it reads badly, is to bake the arena's *anchor* hour
   once and accept a fixed bounce across the band — the bounce is the
   lowest-frequency term in the frame and the least sensitive to the sun's exact
   elevation.
4. **The two lanes do not touch the same files.** Lane AB writes uniforms over a
   frozen light set (`src/lighting/**`, weather, the lobby row); this lane owns
   `src/rendering/lighting/**`, the `bakedIndirect` control and its stage. The
   only shared file is `src/graphics-settings-registry.ts`, and the two lanes add
   different keys to it.

---

## 5. Combat readability and preset parity

The RTX skill's bound: **combat readability outranks beauty**, and gameplay
information must not differ between presets.

- **The layer can only brighten.** The composite is additive and hard-clamped at
  `BAKED_INDIRECT_MAXIMUM_ADDITIVE` = 0.18 linear per channel — below the
  godrays' 0.22, because a bounce covers whole surfaces where a shaft is a narrow
  volume. Nothing visible today can be hidden by turning this on.
  **VERIFIED** by the clamp in the node and by a test that constructs an
  over-gain tuning and asserts the family safety check refuses it.
  **A correction, 2026-09-03:** "clamped, not assumed" was not what the code did.
  `applyRuntime` wrote the baked tuning into the live gain uniform on its first
  line and called the safety assert on its second - every other value in that
  function is applied after the assert - and the graph's `applyTuning` wrote
  `next.composite` with no ceiling. An over-gain tuning therefore reached the
  live uniform and the guard threw afterwards. The assert now runs first and the
  setter clamps, pinned by a live-uniform test and a source-order test.
- **Every reconstructed irradiance is non-negative.** Checked over 48
  position/normal pairs including a fully enclosed overhang. This is why the
  band is L1 and not L2: an unclamped L2 reconstruction routinely rings negative
  over a bright horizon, and a negative "light" is a darkening pass. **VERIFIED.**
- **Parity is structural, not tuned.** `bakeIrradianceVolume` takes a
  `ProxyScene` and a `BakeLighting` and nothing else. There is no parameter
  through which a player, bot or vehicle could enter the integral, so a baked
  bounce cannot carry positional intel and a player on PERFORMANCE is not
  disadvantaged by a player on QUALITY. **VERIFIED**, asserted structurally so a
  future change that adds a dynamic input has to argue with a test.
- **OPEN — the silhouette-contrast capture.** The measurable version of the
  readability bound (enemy silhouette contrast at engagement distance, from a
  moving camera, layer on versus off) is **no longer blocked** - the
  Options-driving harness that makes it possible exists and §3.5 is a closed
  measurement - but it has not been run. The clamp bounds the effect
  analytically; the capture is still owed. It is listed in §7 with the command.

---

## 6. Path tracing in game — research note, not a proposal

The brief asks for research only, and the answer is short.

**In-browser path tracing is a photo-mode feature, not a gameplay one, and it is
a separate lane if the owner wants it.**

- **Hardware is not reachable.** Measured on this machine's own adapter (Lane AI,
  `docs/evidence/pass87/graphics-profiles/webgpu-adapter.json`): the adapter
  advertises 24 features and **not one** matches ray-query, acceleration
  structure, BVH or traversal. RT cores are not addressable from a tab on any
  GPU. **CLAIMED** (measured by Lane AI, not re-run here).
- **So a path tracer would be software**, and path tracing's cost is samples per
  pixel per frame. A progressive tracer that accumulates while the camera is
  still can look extraordinary; the moment the camera moves the accumulation is
  invalid and the image is noise until a denoiser reconstructs it. That is the
  route-2 artefact family — ghosting, disocclusion noise, over-blur, fireflies —
  every one of which is invisible in a still frame and all of which are
  readability hazards in a competitive shooter.
- **What it would actually be good for:** a photo mode, a spectator or replay
  camera, a menu backdrop, an end-of-match card. Places where the camera is
  still or authored, nobody is being shot at, and a two-second convergence is a
  feature rather than a defect.
- **What it should NOT be:** a fifth rung on the ladder. The ladder's rungs are
  promises that selecting them will admit and will play; a rung whose image is
  only correct when you stop moving breaks both.
- **The cheaper 90%, and this lane just built it.** Most of what a player means
  by "path traced" is soft indirect colour and believable bounce. That is what
  §1 delivers at three texture fetches. The honest recommendation is to look at
  the baked result on a real arena first, and only then decide whether a
  progressive photo-mode tracer is worth its own lane.

---

## 7. Open items, each with what would close it

- **OPEN — the silhouette-contrast readability capture.** §5. No longer blocked:
  the Options-driving harness exists and the A/B is closed. What is owed is a
  layer-on versus layer-off capture from a moving camera at engagement distance,
  against the project's existing readability threshold.
- **OPEN — one digest cell does not match between the offline bake and the
  runtime.** `atomic-acres` LOW and HIGH and `skyline-terminal` LOW all match
  exactly between `scripts/bake/bake-arena-indirect.mjs` and the live receipt.
  `skyline-terminal` at HIGH does not: offline `5aaa7d9b`, live `058a6ef4`. Both
  are stable within their own method, so this is a difference in the INPUT - most
  likely the arena's proxy or sun differs slightly between a cold load and an
  arrival by in-session transition. It matters because it is exactly the
  condition under which a committed build-time volume would be rejected as
  stale and silently re-baked at load. Closing it: extract the proxy on both
  paths and diff the two ProxyScenes.
- **OPEN — a committed build-time volume for any arena.** The extraction stage
  now exists (`scripts/qa/extract-arena-proxy.mjs`) and its output bakes
  reproducibly, so the remaining work is a build step that runs it per arena and
  ships the volume, plus a cache implementation on the runtime's
  `BakedIndirectVolumeCache` seam. Until then every machine bakes at load: 0.8 s
  (LOW) to 3.9 s (HIGH) of CPU spread at 3 ms per frame, i.e. 6-29 s of
  converging picture per session (§3.4). Nothing stalls - that is now measured,
  not asserted - but it is per-session work that a committed volume would remove.
- **OPEN — BALANCED's default.** BALANCED lives on Lane AI's branch and not on
  this base, so this lane could not set it. The one-line patch, to
  `src/graphics-settings-registry.ts` in `GRAPHICS_PRESET_VALUES.balanced`:

  ```diff
  -    shadowFilter: 'auto', indirectLighting: 'high', ambientOcclusion: 'off',
  +    shadowFilter: 'auto', indirectLighting: 'high', bakedIndirect: 'low', ambientOcclusion: 'off',
  ```

  and delete the `TODO(HF-418 item 4, Lane AL)` beside it. This changes
  BALANCED's control-set hash, so `GRAPHICS_PROFILES_2026-09-03.md` §2 must be
  re-measured in the same commit — that is exactly what its hash tripwire is for.
- **OPEN — ambient occlusion is `off` on PERFORMANCE, BALANCED and QUALITY, and
  contact-shadow / shadow-filter tiers were not built.** Items 2 and 3 of this
  lane's brief. Contact shadows are the other half of "beautiful lighting" and
  only RAY TRACED and MAX have any. This lane deliberately did **not** change
  that default: GTAO is a real per-frame pass, and adding one to the
  auto-selected default while HF-399 (150 → 40 fps on QUALITY) is an open owner
  complaint needs a measurement, not a preference. The harness accepts the row:
  `node scripts/qa/measure-baked-indirect.mjs --url http://127.0.0.1:PORT --arena atomic-acres --tier low --ao low --label ao1`
- **OPEN — per-arena cost and VRAM.** §3.4 is per-arena for the bake. The A/B in
  §3.5 is one arena, and VRAM is not measured anywhere, though the brief names
  it. The volume itself is 442 KB serialised and three 24x12x24 RGBA-float 3D
  textures live, which is arithmetically ~1.3 MB; that is a source claim, not a
  measurement of what the driver allocates.
- **OPEN — the Lane AB seam on a wide-band arena.** §4 item 3. Now a real
  question rather than a hypothetical one, because the re-bake actually happens.
- **OPEN — `screenSpaceGi` and `bakedIndirect` interact and nobody has looked.**
  On MAX both are on and both add bounce light. They answer different questions
  (§2) so double-counting is bounded rather than wrong, but the combined gain has
  not been captured against the readability threshold.
- **OPEN — graphics settings did not persist to localStorage in a fresh headless
  profile.** After SAVE GRAPHICS the live session applies the change (the A/B
  proves it) but the stored blob reads back `null`. `writePass65Settings` round
  trips correctly in Node, so the defect is not in the normaliser. It may be
  headless-profile-specific, or it may mean a real player's saved graphics do not
  survive a restart. Worth one probe by whoever owns settings.
- **CLOSED, and worth recording — two receipts described a chain the installed
  pipeline did not have.** `pass64LinearSourceStages` is a hand-written
  enumeration of the linear chain and never learned about
  `raytraced-reflection-refraction-add`, which has been in
  `LINEAR_SOURCE_STAGE_ORDER` and in the graph's own `stages()` since HF-398
  landed three passes ago. The `advancedGraphics.screenSpace` telemetry
  projection had the same defect from the same cause. Both fixed here; both pins
  updated to assert the complete chain. This is the third instance in this
  repository of the same failure shape — a hand-maintained list beside a derived
  one — after the IBL evidence row and the hardcoded gate rosters.
- **CLOSED — two gates were inert for the control this lane added.** The preset
  promise matrix in `src/graphics-settings-registry.test.ts` carried
  `bakedIndirect: 'off'` for all four presets (three of them false) and never
  compared it, because the key was missing from `SCREEN_SPACE_KEYS`; and the
  sibling combat-safety-envelope test hardcoded `'off'` where every other field
  reads `preset.X`. Both repaired, nothing relaxed, and the envelope test now
  asserts the resolved composite against `BAKED_INDIRECT_MAXIMUM_GAIN` per preset.
  Same failure shape as the row above: a table nobody reads is worse than no
  table.
