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
queued is voided, not annotated), cold shader cache. Five rows on the built
bundle at branch head.

### 3.1 The number that matters most: pipelines at admission

| Arena | Pipelines at admission, layer ON (this lane, VERIFIED) | Pipelines at admission, QUALITY before this layer existed (Lane AI, CLAIMED) |
|---|---|---|
| `atomic-acres` | **374** | 374 |
| `skyline-terminal` | **300** | 300 |
| `high-seas` | **251** | 251 |

Exact match on three arenas measured independently, at the same resolution, by a
different harness on a different branch. **The layer adds no pipeline.** That is
the direct answer to "won't murder FPS", and it is a categorical fact rather
than a noisy one: pipeline counts do not drift with machine load.

It is also the answer to the cold-compile fence. A layer that compiles nothing
new cannot push a profile past an admission fence, so every tier admits inside
the fence for the same reason the profile below it does.

### 3.2 The tripwire

`pipelinesInCombat = 0` on **all five rows**. Nothing is compiled while a settled
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

**All four parts are asserted by the harness, not just the first.** The RTX
skill records a live harness that read this exact shape of receipt and checked
only the shape count, returning PASS on the run that demonstrated the defect.
The occluder count is in the receipt because a bake that finds zero occluders
binds successfully and is *correctly invisible* — the "correct image of nothing"
state — and that must be distinguishable from a bind failure. **No measured
arena is at zero. VERIFIED.**

### 3.4 Bake cost

Measured offline over 6912 probes, twice per tier, byte-identical both times
(`scripts/bake/bake-arena-indirect.mjs --self-test`):

| Tier | Bake, run 1 | Bake, run 2 | Buried probes filled | Serialised |
|---|---|---|---|---|
| `low` | 892 ms | 971 ms | 109 | 442 KB |
| `high` | 5001 ms | 5082 ms | 548 | 442 KB |
| cached | **0 ms** | — | — | — |

At runtime that work is spread at **3 ms per presented frame**, so LOW converges
in roughly 300 frames and HIGH in roughly 1700 — about 5 s and 28 s at 60 Hz,
starting from a sky-only volume that is already correct-looking rather than
black. The frame is never stalled. **VERIFIED** (the chunked bake is proven
byte-identical to the one-shot bake, so the committed cache and the runtime path
are the same volume).

### 3.5 What these rows do NOT support

**The tier A/B is BLOCKED WITH EVIDENCE.** The harness could not seed a persisted
graphics blob into the page: the row requested with `--tier off` came back
reporting the QUALITY default (`bakedIndirect` low, gain 0.380), and the
harness's own fail-closed receipt check caught it rather than letting the row be
published as an A/B. The app's Options transaction (`flushPendingGraphics`) is
the only writer whose value survives boot; driving that surface is a separate
harness and is an OPEN item (§7).

The three `atomic-acres` rows are therefore three runs of **one** configuration,
which makes them a **noise measurement**, and a useful one:

| Run (identical control set) | Median | p95 | Frames/s | Deploy |
|---|---|---|---|---|
| 1 | 22.2 ms | 38.8 ms | 42.2 | 62.6 s |
| 2 | 27.8 ms | 50.0 ms | 32.4 | 68.8 s |
| 3 | 22.4 ms | 33.4 ms | 38.3 | 75.7 s |

**~25% spread on the median and ~50% on p95, on an identical build with
identical settings**, with five other PASS 87 lanes sharing the GPU. No A/B
smaller than that is readable on this machine in this state, which independently
corroborates Lane AI's refusal to read any single-cell comparison under about
15%. Do not read a frame-time claim for this feature off any single row; read
§3.1, which is not noise-sensitive.

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
3. **The consequence Lane AB should know about, stated plainly.** On an arena
   with a wide band (High Seas, 40° of elevation travel), a full traverse crosses
   several quantisation cells, and each crossing starts a fresh converging bake:
   ~5 s at LOW, ~28 s at HIGH, during which the indirect term is a blend of the
   previous volume and a re-converging one rather than wrong. **OPEN:** whether
   that reads as a slow, pleasant warm-shift or as a visible settle has not been
   captured. It is the first thing to look at if the two features ship together.
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
  moving camera, layer on versus off) needs the tier A/B that §3.5 records as
  blocked. The clamp bounds the effect analytically; the capture is still owed.
  It is listed in §7 with the exact command.

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

- **OPEN — the tier A/B and the readability capture.** §3.5. Needs a harness
  that drives the real Options surface (select `#graphics-baked-indirect`, leave
  the panel so `flushPendingGraphics` commits, reload) rather than seeding
  localStorage. Once it exists:
  `node scripts/qa/measure-baked-indirect.mjs --url http://127.0.0.1:PORT --arena atomic-acres --tier off|low|high`
  ×3 repeats per cell on a quiet GPU, reporting the spread, not the mean.
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
- **OPEN — ambient occlusion is `off` on PERFORMANCE, BALANCED and QUALITY.**
  Contact shadows are the other half of "beautiful lighting" and only RAY TRACED
  and MAX have any. This lane deliberately did **not** change that default:
  GTAO is a real per-frame pass, and adding one to the auto-selected default
  while HF-399 (150 → 40 fps on QUALITY) is an open owner complaint needs a
  measurement, not a preference. The measurement is the same blocked A/B; the
  harness already accepts `--ao low` for exactly this row.
- **OPEN — a committed build-time volume for any arena.** The offline bake and
  its digest cache exist and are proven reproducible
  (`scripts/bake/bake-arena-indirect.mjs`), but no arena has a committed volume,
  because producing one needs a headless extraction stage
  (`scripts/qa/extract-arena-proxy.mjs`) that this lane did not build. Until
  then every machine bakes at load, which works and is measured, but costs the
  CPU time in §3.4 on every session.
- **OPEN — `screenSpaceGi` and `bakedIndirect` interact and nobody has looked.**
  On MAX both are on and both add bounce light. They answer different questions
  (§2) so double-counting is bounded rather than wrong, but the combined gain has
  not been captured against the readability threshold.
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
