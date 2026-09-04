# HF-481 lane LOOK — what was built, what it cost, and where we actually stand

Branch `contrib/dave-gaming-pc/claude/nuketown2-look`, based on
`contrib/dave-gaming-pc/claude/pass93-candidate` and merged up to `1db7e288`.
Read `ANALYSIS.md` in this directory first: it is the answer to the owner's
question. This file is the receipt.

---

## 1. The short version for the owner

You asked why the shared examples look cooler and more modern than ours, and
whether we are using the same techniques. The answer, from reading our source
and grading our own frames against theirs:

**We are using nine of the eleven techniques. Two were missing, and I built
one and a half of them. Neither is the real problem.**

The real problem is that our surfaces have no albedo variation. A wall of Nuke
Town is one flat blue with a lap-line and nothing else — no dirt at the base,
no bleach at the top, no board-to-board variance — and a window is an opaque
white rectangle. GTAO is on at High, SSR is on, bloom is on, and they are all
invisible because there is nothing in the image for them to modulate. That is
the materials lane's work, not this one's, and it is bigger than everything
below put together.

**Honest second finding, and it is uncomfortable: aerial perspective cannot do
much on a map this small.** Nuke Town's whole combat space is about fifty
metres. Depth haze that is strong enough to see at fifty metres is haze inside
a duel, which the combat-readability contract forbids and which would be a bad
trade even if it did not. The far-field wash now reads clearly in the overhead
and drone views and barely at all at street level, and that is the ceiling of
what this technique can give on this arena. On Farcrysis or High Seas it would
be worth several times more.

## 2. What was built

Three commits, each its own module.

| # | Commit | Module |
|---|---|---|
| 1 | `648c78c0` | `src/rendering/atmosphere/aerial-perspective.ts` — aerial perspective as a new additive linear-HDR stage |
| 2 | `9ab96d5b` | `src/particles/particle-catalog.ts` — Nuke Town's ambient air was shipped and invisible |
| 3 | (this pass) | `aerial-perspective.ts` — restructured after measuring that cut 1 was invisible |

### 2.1 Aerial perspective

The inscattering half of the transmittance equation and only that half.
`L_out = L_surface * T(d) + L_in(d)`; the module builds `L_in(d)` and the
compositor **adds** it. It never builds `T(d)` and never multiplies, so it can
wash a distant silhouette's contrast but can never delete the silhouette —
the same rule every other term in `screen-space-post.ts` runs under.

- Real Rayleigh `lambda^-4` channel split (0.20 / 0.40 / 1.00) so distance goes
  blue, and a real Henyey-Greenstein Mie lobe so a shot into the sun glows and
  the reverse angle does not. The arena-scale height falloff (14-22 m against a
  real 1.2 km) is a **stylisation** and the header says so rather than dressing
  it up as meteorology.
- **No new setting.** It rides the existing `graphics.volumetricQuality`, which
  already means "how much atmosphere" and correctly has no `off` rung. The only
  zero is the WebGL2 compatibility route, which runs no linear composite for an
  additive term to be added into.
- **No new pipeline, no render target, no MRT attachment, no extra pass.** It
  is arithmetic over the view-Z the scene pass already publishes, reconstructed
  with the same expression `baked-indirect-node.ts` uses so two stages cannot
  disagree about where a pixel is. Nothing new to precompile.
- `scene.fog` is untouched, so every existing writer keeps working — including
  the LIGHTING lane's fog-COLOUR writes, which now flow into the haze for free
  because the arena's authored fog colour **is** the haze colour.

**The interesting part is that cut 1 was wrong, and the measurement said so.**
Cut 1 held the ceiling by keeping every tier's worst case — white sky, white
sun, view straight down the sun vector — under it. It passed every assertion in
its own file and changed the seven Nuke Town captures by a mean of **1.0-1.4
sRGB codes**. Bounding only the pathological case had squeezed the
representative one to nothing.

It was also arithmetically unfixable by tuning. `1 - exp(-beta*d)` is concave,
so its 25 m value can never fall below the linear share `25/90 = 0.278` of its
90 m value for *any* beta: a curve strong enough to be visible at 90 m is
**forced** to put 28% of that into a duel. There was no number that was both
visible and duel-safe. The structure was wrong.

Cut 2 changes the structure in three places:

- **A near-field gate.** Inscatter is smoothstepped in between 18 m and 45 m,
  so it is exactly zero inside the duel envelope. This is also the honest
  physics for a far-field wash. A test proves the gate is load-bearing: for
  every tier, the *same tuning* ungated breaks the engagement bound and gated
  is inside it by more than 4x.
- **The ceiling moves to a per-channel `min` in the shipped expression**, where
  `baked-indirect-node.ts` holds its own. Past the arena's longest sightline,
  into the sun, the curve genuinely does want more than 0.12 and the clamp is
  what stops it. The header says that instead of pretending otherwise.
- **A visibility floor**, swept at import time against the arena's
  representative sky and sun. Regressing to an invisible effect is now a build
  failure. A gate that only bounds the top is exactly how something ships green
  and absent — the same bug as the ambient motes below, in the same lane, on
  the same day.

Delivered: 0.050 / 0.075 / 0.090 linear on the far-field blue channel at 90 m
(22-50% of middle grey) at Low / High / Ultra, with the worst case at 25 m at
0.009 / 0.015 / 0.018 against a 0.036 allowance.

### 2.2 Ambient air

`particle-catalog.test.ts` proved every arena has an air profile inside its
ceiling. Both true; not one mote appears in any of the seven PASS 94 exterior
captures. **Coverage is not visibility.**

Measured: a 0.014 m mote at the 12 m reading distance subtends
`2 * 0.014 / (2 * 12 * tan 35) * 720 = 1.20 px` at the 1280x720 review
viewport, drawn additively at alpha 0.09.

Fixed with **radius and alpha, never density**: motes 0.014 -> 0.026 m
(1.20 -> 2.23 px) at alpha 0.11 (the motes family's own unchanged ceiling);
drift 0.040 -> 0.055 m at alpha 0.15 (under its unchanged 0.16). Both densities
are byte-identical, so instance count, draw count, buffer sizes and capacity
ceilings are exactly what PASS 94 shipped.

`src/particles/ambient-visibility.test.ts` is new and measures subtended pixels
rather than trusting a comment. It reproduces the 1.20 px measurement that
condemned the old values, so the regression is stated rather than remembered.

**Cross-arena finding it records: ten of the eleven arenas still have sub-pixel
motes.** gun-range is worst at 1.03 px. Only Nuke Town is this lane's to edit,
so the other ten are an OPEN item below, not a silent exemption.

## 3. What was NOT built, and why

I would rather hand over four honest modules than six half-wired ones. These
are specified and deliberately not started:

| Module | Why not |
|---|---|
| **Contact shadows** | `screen-space-post.ts` explicitly forbids a second occlusion term: GTAO already owns contact darkening, and stacking would darken exactly the shaded pockets a defender uses. Doing this properly means replacing GTAO's contact term, not adding beside it — a different lane with a different gate. |
| **Transmission glass** | The windows are the loudest "code-made" tell in the exterior set and I wanted this one. It is bounded by the glass-authority and breakable-window contracts (`nuketown2-glass-authority.test.ts`), which own the same material. Changing presentation under an authority contract without running that contract's gates is how a lane ships a green build that cannot be shot through. |
| **Time-of-day grade LUT** | The grade chain's core stage order is frozen and carries a receipt. Adding a display-side stage there is legitimate, but I could not add it AND run the display chain's gates in this pass, and a half-run frozen contract is worse than no LUT. |
| **Shaft budget** | `volumetricLightShafts` is `low` at Quality and `off` at Balanced/Performance, and those values are **pinned** by `graphics-settings-registry.test.ts`. Raising them is a deliberate profile decision the pin exists to force into the open — an owner call, not a builder's. The shafts also cost a real half-res raymarch, unlike everything I did ship. |

## 4. Gates

All run on this machine today, at branch head, WebGPU on the real adapter.

**tsc** — clean, no output:
```
$ npx tsc --noEmit -p tsconfig.json
(no output)
```

**Unit suites** (rendering, particles, registry, profile contract, nuketown2
fidelity, settings inventory):
```
 Test Files  47 passed (47)
      Tests  712 passed (712)
```

**The lane's own new tests:**
```
src/rendering/atmosphere/aerial-perspective.test.ts   21 passed (21)
src/particles/                                        7 files, 119 passed (119)
```

**Coplanar** — unchanged, exit 0, no blocking pair; this lane touched no
geometry:
```
$ npx tsx scripts/qa/find-coplanar-pairs.ts   # exit 0
FENCED   dy=0.0200m overlap=7.5m2 [nuketown2 ground tile 17 ...]
BENIGN   dy=0.0000m overlap=0.2m2 [nuketown2 north perimeter wall ...]
(35 rows, all FENCED or BENIGN, zero BLOCKING)
```

**Review captures**, native WebGPU on real hardware, `render=quality`:
```
[viewpoint-capture] backend=webgpu renderer=webgpu adapter={"gpu":true,"adapter":true,"device":true,"vendor":"nvidia","architecture":"blackwell"}
[viewpoint-capture] nuketown2   FAIL 10/17 shots 75231 ms
  — 7 x "setArenaReviewCamera returned false - authored camera missing"
```
**The 10/17 is identical on the base build**, camera for camera, so those seven
cameras are missing from the arena definition on `pass93-candidate` and are not
this lane's doing. They include `nuketown2-front-porch` and the three vehicle
cameras, i.e. exactly the shots the owner's checklist asks for. OPEN below.

**Arena boot smoke — `qa:pass74:arena-boot-smoke`, RED on both builds:**
```
candidate:  12 failed, 1 passed (19.2m)
base:       identical - fails from test #1 onward
  x  1  runs on a browser that can actually get a WebGPU device      (683ms)
  ok 2  the boot roster names every arena module on disk
  x  3  atomic-acres: boots a clean visible solo match               (1.7m)
  x  4..11  skyline-terminal, rustworks-1v1, gun-range, farcrysis,
            high-seas, test1, test2, map3 - all the same
```
The very first test is the environment gate, and it fails in 683 ms on the
BASE build: headless Chromium under this spec's stock flags cannot obtain a
WebGPU device on this machine right now. Every arena failure downstream of it
is that same fact repeated. **This gate is currently red on `pass93-candidate`
independently of this lane**, and it is red for an environment reason, so it
says nothing either way about the atmosphere stage. The evidence that the
renderer is healthy is the viewpoint sweep above, which DID get a real WebGPU
device (`vendor: nvidia, architecture: blackwell`) and rendered ten cameras on
both builds. OPEN below.

**Stock-flags boot — `qa:stock-boot`, same story:**
```
candidate:  2 failed, 2 passed (2.9m)
base:       2 failed, 2 passed (2.5m)
  x nuketown2:       TimeoutError: locator.click: Timeout 15000ms exceeded
  x skyline-terminal: TimeoutError: locator.click: Timeout 15000ms exceeded
```
**Identical on base and candidate**, so it is not this lane. It is a click
timeout on the "CHOOSE YOUR DEPLOYMENT" build-select interstitial — the run
never reaches the arena. HF-480 records the PASS 94 candidate as
"stock-Chrome boot 4/4"; at the current branch head on this machine it is
**2/4**, and it was 2/4 before I touched anything. OPEN below.

## 5. Frame time, measured properly

Eight paired 20 s samples, alternating base and candidate in one window,
`--disable-gpu-vsync`, nuketown2, headless native WebGPU, GPU otherwise idle.

| sample | base p50 | candidate p50 | base p95 | candidate p95 |
|---|---|---|---|---|
| 1 | 11.8 ms | 13.5 ms | 15.5 ms | 19.2 ms |
| 2 | 13.2 ms | 14.0 ms | 19.5 ms | 19.4 ms |
| 3 | 13.0 ms | 13.6 ms | 16.9 ms | 18.3 ms |
| 4 | 12.0 ms | 11.9 ms | 15.2 ms | 15.5 ms |
| **mean** | **12.50 ms** | **13.25 ms** | **16.78 ms** | **18.10 ms** |

Cost: **+0.75 ms p50 (+6%)** and **+1.3 ms p95 (+8%)**.

Stated honestly: the paired differences are +1.7, +0.8, +0.6, **-0.1** ms, and
the base's own spread across samples is 11.8-13.2 ms. The effect is real and
directional but it is the same order as the harness's run-to-run noise, so the
defensible claim is **"about a millisecond, not more"**, not a precise figure.
The first sample pair alone would have said +14%, and reporting that from one
run would have been wrong.

Draw load is **identical** — 128 meshes, 29 instanced, 11275 instances, 311158
triangles, 101 distinct materials, 0 pipeline creations during the sample — on
both builds. The cost is entirely composite-shader arithmetic plus a little
particle fill, which is what a stage with no render target should cost.

## 6. Did it work? Measured, per capture

Mean absolute sRGB delta, base vs candidate, over the shared captures:

| capture | pixels changed | mean delta | max |
|---|---|---|---|
| `nuketown2-overhead` | 72.4% | **16.59** | 95 |
| `nuketown2-south-yard` | 38.3% | 4.40 | 180 |
| `nuketown2-north-yard` | 34.3% | 4.95 | 163 |
| `nuketown2-into-sun-street` | 25.6% | 1.25 | 104 |
| `nuketown2-street-centre` | 21.7% | 1.07 | 73 |
| `nuketown2-garage` | 20.7% | 1.06 | 110 |
| `nuketown2-north-upper-window` | 10.3% | 1.04 | 55 |
| `nuketown2-north-interior` | 16.6% | 1.01 | 7 |
| `nuketown2-south-interior` | 25.5% | 1.01 | 5 |

Read that table honestly:

- **The overhead is transformed** — 72% of pixels, mean 16.6 codes. The far
  treeline now washes pale and cool against saturated near trees, and the
  ridge line finally sits behind the arena instead of beside it. This is the
  depth cue that was missing, and it works.
- **The yards moved** — mean ~4.5 codes, max 163-180. That is the ambient air:
  motes are now visible objects rather than sub-pixel rumours.
- **The street-level combat framings barely moved** — mean ~1.1 codes. That is
  the near-field gate doing exactly what it was built to do. Those cameras sit
  15-35 m from everything they see, which on this map is inside the duel
  envelope. It is the correct behaviour and it is also the honest limit.
- **The interiors are within a rounding error** (max 5-7 codes), which is right:
  there is no atmosphere to speak of across a living room.

## 7. Where we stand against the examples, honestly

Compared with `cosy-japan.vercel.app`, which is the fair reference — same
renderer family, same browser, a real frame I opened and looked at:

**Closed:** far-field aerial perspective, and air that exists. Both were
genuinely absent and both are now present and measured.

**Still open, and still the whole gap:**

1. **Flat albedo.** Their foliage is thousands of leaf cards with per-leaf
   colour variance; ours is flat cones. Their surfaces carry wear at three
   scales; ours carry one colour. This is 80% of what the owner is seeing.
2. **Value composition.** Their entire foreground sits in a narrow, cool,
   desaturated band and only the sky is bright. Ours is a full-range,
   full-saturation image where pure cyan, pure yellow, pure red and pure green
   all shout equally. That is an art-direction decision and it is free.
3. **Opaque glass.** Still the loudest single tell in our exterior set.
4. **High-frequency small stuff.** Their overhead power lines cost two draw
   calls and buy more "a person made this" than any post effect in the table.

`nuketown2-north-yard.png` in `artifacts/quality-gap/candidate/` is the frame to
look at if you want the gap in one picture: my atmosphere and my air are both in
it and neither can rescue a pure-cyan wall meeting pure-green grass on a hard
line with an opaque white window above it.

## 8. OPEN

1. **[Muse F3 / TRACKED OPEN] Seven review cameras are missing from the nuketown2 arena definition** on
   `pass93-candidate` — `nuketown2-front-porch`, `nuketown2-north-balcony`,
   `nuketown2-coach-elevation`, `nuketown2-truck-cab-near`, and the three
   `nuketown2-vehicle-*` cameras. The viewpoint catalog names them; the arena
   does not author them. Pre-existing, reproduced identically on base, and it
   silently removes the balcony and vehicle shots from every capture sweep —
   which are the exact shots the HF-480 owner checklist asks for.
2. **Two browser gates are red on the base branch on this machine, before this
   lane touches anything.** `qa:stock-boot` is **2/4** (nuketown2 and
   skyline-terminal both time out clicking through the build-select
   interstitial) where HF-480 records 4/4 for the served candidate; and
   `qa:pass74:arena-boot-smoke` is **1/13**, failing its own "can actually get
   a WebGPU device" environment check in 683 ms. Both reproduce identically on
   base and candidate. Somebody needs to work out whether these are machine
   state or a real regression on the branch, because right now neither gate can
   clear or condemn any lane's work.
3. **[Muse F2 / TRACKED OPEN] Ten of eleven arenas still have sub-pixel ambient motes** (gun-range worst
   at 1.03 px). Same one-line fix as Nuke Town's; each belongs to its arena's
   lane.
4. **Contact shadows, transmission glass, the time-of-day LUT and the shaft
   budget** are specified in section 3 and not built.
5. **Materials.** Not this lane's, and it is the answer to the owner's question.
