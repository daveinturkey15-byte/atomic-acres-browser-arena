# RAID2 rebuild — Job 0, Job 1 and Job 2

**Lane:** RAID slice 1 (builder). **Agent:** Claude Opus 5.1, 2026-09-04.
**Worktree:** `C:/Users/david/projects/aa-claude-raid`.
**Branch:** `contrib/dave-gaming-pc/claude/raid2-rebuild`, based on
`origin/contrib/dave-gaming-pc/omp/pass84-overnight` @ `c3ba5028`.
**Plan:** `C:/Users/david/projects/aa-claude-research/docs/research/2026-09-04/RAID-rebuild-plan.md`.
**Ledger rows this serves:** HF-408 (the rebuild), HF-427 (the owner statement:
detail parity, layout accuracy, look), HF-467 (penetration classes, not spent here).

**Claim-state key.** `VERIFIED` = I ran the command or read the raw artefact in
this session and quote what it said. `CLAIMED` = another agent's report says it
and I did not re-derive it. `OPEN` = named as unknown.

---

## 0. The headline, in one paragraph

`raid2` was paving over its own pool and its own sunken sport court. The arena
laid a solid slab from y -1 to y 0 across every footprint slice and then
authored the pool basin at top -0.55 and the court floor at top -0.35
*underneath* it. Two of the three things this arena's own art direction calls
its identity did not exist in the frame, could not be entered, and no gate could
see it — the layout metrics are collider-based and every one of those boxes sits
under the 0.8 m mountable ceiling, so they are invisible to the sightline
instrument. All 24 fidelity bands were green over it. That is the largest single
finding of this slice, it is VERIFIED by a column probe through the built arena,
and it is now fixed geometrically (the floor is cut) with a band that fails if
anything ever stands at grade inside a sunken footprint again.

---

## 1. Job 0 — the two gates the plan asked for first

**Commit `40f5cf6a`.**

`collectMeshes` in `scripts/qa/collider-visual-parity-core.ts` dropped, silently,
any mesh whose world `Box3` came back NaN. **CLAIMED** (GLM pre-check sections
4-5, which I read but did not re-run) that is how the previous detail branch
shipped 25 authored dressing meshes — the court lines, both hoop assemblies, the
sculpture, the cornices — at NaN world matrices with a green audit.

A NaN world box has no legitimate cause, so it is now reported by object path
and fails the CLI with a distinct exit code 4, ahead of the invisible-collider
check. `isEmpty()` stays a silent skip: an `InstancedMesh` with zero live
instances is a real state and carries no NaN. The same assertion is added to
`src/collider-visual-parity-gate.test.ts` so the vitest suite carries it too.

**VERIFIED, falsified this session.** With one deliberately NaN-positioned
fixture box in raid2 the CLI prints
`NaN-BOUNDED MESH "Raid Rebuild arena/raid2 NANFIXTURE"` and exits **4**; with
the fixture removed it exits **0**.

`npx tsc --noEmit` exit 0 is enforced as a lane gate by running it before every
commit; it is quoted in section 5.

---

## 2. Job 1 — the reference, re-derived

**Commit `5fdd2f82`.** Authored as data in `src/raid2-reference.ts` so the arena
and the gate consume one measurement instead of three transcriptions of it.

### 2.1 Provenance — VERIFIED

All nine first-party artefacts re-fetched with curl this session. **9/9 HTTP
200. 9/9 byte counts reproduce the previous pass exactly** (86042, 860522,
380350, 673670, 568726, 317410, 615574, 996996, 516362). Every one of them is
**served as `image/webp`** behind a `.png` URL — the same trap the Nuke Town lane
recorded, and the reason the receipt table records the served content type
rather than the extension. sha256 prefixes are in `RAID2_SOURCES`.

The minimap's alpha envelope reproduces **to the pixel**: `x = [63, 443]`,
`y = [15, 499]`, 381 x 485, aspect 1.2730.

### 2.2 The calibration, and where it departs from the plan — VERIFIED

**The envelope is not the calibration**, and this is the methodological finding.
Under the fit below the envelope's corners land at Z -42.7..+31.0 (73.7 m) and
X +50.8..-53.0 (103.8 m) against a 76 x 100 m playfield — i.e. the out-of-bounds
margin is *negative* on one axis and *positive* on the other. Calibrating on it
is what put the previous pass's absolute centres 6-8 m out.

The plan named exactly two anchor pairs, the pool water centroid and the
roundabout curb centre. **That is not solvable, and the reason is worth stating
rather than papering over: in the BUILT arena the pool water centre and the
drive island centre both sit at X = 0**, so the X baseline between the plan's two
anchors is zero metres and the X scale is unidentifiable from them. The court is
therefore promoted from residual-anchor to fit-anchor, the similarity is solved
by least squares over three pairs, and the residual is published at every anchor
plus two independent features instead of at one.

```
Z = 0.19381 * px_x - 54.864     (0.1938 m per pixel)
X = -0.21441 * px_y + 53.985    (0.2144 m per pixel)

                        dZ       dX
pool water centroid   -1.00    -2.00
drive island centre   -0.06    +1.73
court enclosure ctr   +1.06    +0.26
```

**Worst residual 2.00 m against the plan's 2 m stop condition: PASS, with no
headroom on X.** Every X figure therefore carries +/- 2 m and none of them was
used to move a spawn.

**Anisotropy 1.106**, published rather than hidden: the fit is 6.6 % coarser per
pixel along the long axis than across it. Either the artefact is not isotropic,
or the arena's 100 x 76 m anchor stretches the long axis by ~10 % against the
reference. The anchor is *not* re-litigated (HF-426 settled that argument for
Nuke Town and the same reasoning holds).

### 2.3 What the artefact actually shows — VERIFIED, measured this session

| Feature | Measured | Built before this slice |
|---|---|---|
| Pool water | **107.0 m2 inside a 23.4 x 11.6 m envelope, fill 0.394**, organic: a 3.3 m channel at the garage end opening into a broad southern lobe | 28 x 8 m rectangle, fill 1.00 |
| Round spa | 3.45 m across at (X +1.78, Z -26.08) — **3.8 m NORTH of the pool centroid** | absent |
| Round basin inside the lobe | 6.53 m across at (X -8.84, Z -28.51), ringed by coping (which is why the flood fill could not enter it) | absent |
| Drive carriageway | **circular**, 23.26 m across Z / 25.73 m across X | 22 x 14 m rectangle of paving |
| Drive block ring | 11.94 m across | four planters spanning 7.4 x 4.4 m |
| Drive plinth | 5.2 m across, stepped | 4 x 4 m square + 1.45 m torus |
| Court enclosure | 14.37 x 12.99 m at (X -26.74, Z -27.44) | 14 x 11 m at (X -27, Z -28.5) — **agrees within 1.1 m** |
| Court painted surface | 9.11 x 7.87 m | none authored |

The court agreement independently corroborates GLM's D6 (the previous
schematic's court box was ~2x the real one) without relying on it.

I independently reproduced GLM's pool flood fill exactly (bbox
`[100,204,159,312]`, 60 x 109 px, fill 0.394 against their 0.38), and I record
one weakness in their recipe: the "teal water" mask (`B - R >= 3, G - R >= 3`)
is satisfied almost everywhere on this artefact — it is a *dark-value* mask, not
a water discriminator. It happens to select the right region here.

---

## 3. Job 2 — the layout corrections

**Commit `5fdd2f82`.** New helper modules `src/raid2-shapes.ts` (pure rectangle
algebra: rect subtraction, disc bands, ring segments) and `src/raid2-reference.ts`.
Arena edits are confined to `src/raid2-arena.ts`; no other arena's files were
touched.

1. **The paving is cut under every sunken footprint.** VERIFIED before:
   at (0, -29) the column read `raid2 paving -20` top 0.00 over `raid2 pool
   water` top -0.12 over `raid2 pool basin` top -0.55; at (-27, -28.5)
   `raid2 paving -36` top 0.00 over `raid2 court floor` top -0.35. VERIFIED
   after: the pool centre's topmost solid is the water at -0.12 and the court
   centre's is the court floor at -0.35.

2. **The pool is the measured body**, six water cells with derived basin slabs
   and coping, plus the round spa and the round lobe basin with its coping ring.

3. **The drive is a circle**: eleven rotated kerb chords on an 11.6 m radius (the
   twelfth is dropped because it runs through the laundry block — which is also
   what the artefact shows, its own circle being truncated by buildings on that
   side), and a two-tier circular stepped plinth at the measured 5.2 m carrying
   a four-tier twisted ribbon that starts *above* the 1.70 m standing eye.

**Cutting the paving turned the pool into a real hole and the arena's own
reachability gate immediately failed** on the patrol point at (0, -28). That is
HF-402's defect in miniature, and it was fixed the way HF-402 was — with a
walked route, not by moving the patrol point: two mouths in the south coping,
each with a single 0.19 m ledge, so the descent is 0.19 m then 0.36 m, both
under the 0.42 m autostep.

### 3.1 Detail is free — measured, not asserted

`npx tsx scripts/qa/raid2-layout-metrics.ts raid2`, before (stashed) and after:

| metric | before | after | band |
|---|---|---|---|
| eye-blocking masses | 34 | **34** | 8, RATCHET, zero headroom — **zero spent** |
| masses per 100 m2 floor | 0.679 | 0.679 | 8b <= 0.87 |
| mean eye-cluster area | 22.62 m2 | 22.53 m2 | 9 >= 15 |
| wall m2 per 100 m2 floor | 15.496 | **15.427** | 10 <= 17 |
| mean open line | 13.611 m | 13.612 m | 3 >= 13 |
| long-axis median | 25.65 m | 25.65 m | 4 >= 24 |
| roofed fraction | 0.2190 | 0.2188 | 7 <= 0.24 |
| fill fraction | 0.6585 | 0.6589 | 2, 0.58-0.72 |
| mountable pieces | 84 | 262 | 11 >= 24 |

No band was nudged, widened or re-derived to admit any of this.

### 3.2 The fidelity test, extended — and every new band falsified

Five layout bands and five surface bands were added (24 -> 34 tests).

| band | what it holds | falsified how |
|---|---|---|
| 24 mirror falsifier | three sign relations; the third (**the spa sits north of the pool centroid**) is *inside* one flank, so it survives what a mirror survives | **VERIFIED RED** with the spa moved to X -6.5 |
| 25 burial falsifier | column probe: nothing stands at grade inside any sunken cut | **VERIFIED RED** with the paving cut list emptied |
| 26 the pool is not a rectangle | envelope within 1.5 m per axis of the measurement; plan fill 0.3-0.7 | by construction: a filled rectangle is 1.00 |
| 27 the drive is one circle | eleven kerb segments, all on one radius within 0.2 m | two straight runs cannot satisfy it |
| 28 risers into the water | every mouth ledge under the 0.42 m autostep | it was the band that failed first, before the mouths existed |
| 29 integer noise periods | `createSurfaceNoise` *rounds* a fractional period rather than failing | assertion also throws at module load |
| 30 tiles actually tile | u = 0 and u = 1 return the same texel | **VERIFIED RED on real code**: caught a 0.065 albedo step at every timber board edge |
| 31 no map is a constant | albedo/roughness/AO/normal all vary; micro tile present | a flat normal costs the same fetch and shows nothing |
| 32 authored feature >= 2 texels | mm authored, texels measured | see section 4 — it caught three wrong numbers |
| 22b readability after the maps | palette x baked raster mean, not the constant alone | band 22 alone cannot see a map that inverts it |

---

## 4. The first material pass

**Commits `b0e66b9f`, `8557fb23`.** New module `src/raid2-art.ts`.

The arena shipped **ten flat materials** — no albedo, no normal, no roughness,
no AO — across 300-odd boxes, while the shipped Raid carries six forged sets
over the same kind of geometry. Eight sets are now authored through the existing
forge (`src/rendering/surface-forge.ts`), extended in use and never duplicated:
travertine, stucco, limestone, timber, court acrylic, pool mosaic, gravel,
planting.

**Three scales of wear in every set**: the shared 0.25 m micro tile (grain),
20-100 mm scuffs / pitting / chips / aggregate, and a 1.5-3 m traffic gradient.

**World tiling.** A `BoxGeometry` face is 0..1 in UV whatever it measures, so one
repeat can only ever be right for one mesh size — the 36 x 76 m paving slab and
a 1.2 m kerb would have worn the same tile thirty apart. Every `rect` now goes
through `worldTiled` with the material's authored `metresPerTile`.

**The tint stays `RAID2_PALETTE`.** Descriptions author modulation about 1.0 and
the family value multiplies it, so band 22 keeps gating the constants it always
gated, and band 22b now measures palette x baked raster mean — the number that
actually reaches the screen.

**Looking at the bake caught three real defects that review did not.** The
thresholds were first written as bare cell fractions, which carry no unit:

| set | recorded | actually authored | texels |
|---|---|---|---|
| limestone bed joint | 7 mm | **0.87 mm** | 0.37 |
| timber board gap | 9 mm | **3.1 mm** | 0.9 |
| mosaic grout | 8 mm | **2.0 mm** | 1.0 |
| travertine joint | 20 mm | 20 mm | 3.4 OK |

Sub-texel aliases out entirely, and the worst was the **limestone — the cover
family a player reads at range — which baked with no course lines in it at
all**. `jointHalfWidth(mm, tileMetres, cells)` now derives the threshold from the
millimetre and `FEATURE_MM` is the single source, so the recorded number and the
baked number are the same number by construction. Contact sheets are in
`surface-albedo-sheet.png` and `surface-normal-sheet.png`.

**Bake budget**, measured in its own process, twice per run, three runs:
**924-1074 ms / 907-974 ms against the ~1200 ms ceiling — INSIDE.** Thinner than
the 820 ms the plan projected. Two caveats, stated rather than absorbed: the
machine was simultaneously running another lane's headless captures throughout,
so this is a pessimistic reading; and the first knob if it ever needs cutting is
the `warp` stacks in travertine and stucco, exactly as `test-maps-art.ts`
records for its own budget. The court and planting sets were already cut to
256 px on the same reasoning (a 4 m-per-tile continuous pour does not need
7.8 mm/texel).

---

## 5. Gates — quoted, all run by me this session

```
$ npx tsc --noEmit                                          exit 0

$ npx vitest run src/raid2-fidelity.test.ts
  Test Files  1 passed (1)
        Tests  34 passed (34)

$ npx tsx scripts/qa/audit-collider-visual-parity.ts        exit 0
=== atomic-acres: 0 invisible collider(s), 8 walk-through mesh(es) [...]
=== skyline-terminal: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== rustworks-1v1: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== gun-range: 0 invisible collider(s), 3 walk-through mesh(es) [...]
=== farcrysis: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== high-seas: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== test1: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== test2: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== map3: 0 invisible collider(s), 4 walk-through mesh(es) [...]
=== nuketown2: 0 invisible collider(s), 0 walk-through mesh(es) [...]
=== raid2: 0 invisible collider(s), 0 walk-through mesh(es)
           [307 colliders, 0 boundary, 0 runtime-replaced statics, 311 visible meshes]
   (zero NaN-bounded meshes on any arena)

$ npx tsx scripts/qa/audit-walkable-surface-parity.ts --arenas raid2   exit 0
=== raid2: 0 fall-through floor(s) [42 walkable visuals censused, 42 fully supported, ...]

$ npx vitest run src/spawn-layout-quality.test.ts
        Tests  129 passed (129)

$ npx tsx scripts/qa/raid2-bake-budget.ts                   exit 0
  raid2Materials() bake: 924 / 912 ms  (ceiling ~1200 ms)  -> INSIDE
```

The walk-through counts on `atomic-acres`, `gun-range` and `map3` are the
pre-existing triaged ledger and are unchanged by this lane.

**Browser gates: OPEN.** The GPU rule was polled every 60 s for 18 minutes
(14:21:47 to 14:39:00). ComfyUI's queue was empty throughout and free VRAM never
fell below 9,449 MiB, but **another lane held 2-6 headless Chrome processes for
the entire window**, so the one-browser-at-a-time rule was never satisfied and no
headless capture was taken. Stock-flags boot, the viewpoint regression diff, the
60 s solo run and the two-client mp-lab sync are therefore all OPEN for this
slice. In their place this report carries two GPU-free visual checks: a top-down
plan render of the built colliders (`raid2-plan-after-job2.png`) and the two
surface contact sheets.

---

## 6. What remains — for Job 3 and beyond

**Deferred with a reason, not forgotten:**

1. **The juice-bar pavilion is still a 5 x 4.5 m rectangle.** The reference's is
   curved. Re-forming it is an eight-box octagon around a mass that band 8
   counts with zero headroom, so it is a cell job with a re-derivation, not a
   layout job. OPEN.
2. **The courtyard fountain was NOT re-dressed as planting.** The plan calls for
   it (GLM's D4: the "courtyard" citation shows a tree, boulders and planters,
   and the fountain belongs to the drive). But `raid2 courtyard fountain basin`
   is a deliberate 3.4 x 3.4 m shot-surfaced reflector, sized *above* the
   ray-traced extractor's 6 m2 footprint floor precisely because this arena's
   reflective coverage used to rest on a single pane that turned out to be an
   eye-clearance defect. Removing it without a replacement reflector would
   weaken a documented budget, which this lane may not do. The correct sequence
   is: build the drive fountain basin on the new stepped plinth first, prove the
   extractor still has >= 6 m2 there, then re-dress the courtyard. **OPEN, with
   the constraint named.**
3. **Court lines, hoops, painted surface** — cell 3's work. The measured painted
   rectangle is 9.11 x 7.87 m at (X -28.67, Z -28.25) and is in
   `RAID2_MEASURED.courtPainted` ready to use. Lines must be **cut into** the
   floor per the plan's section 6.5, not offset above it.
4. **Vehicles** — none authored. The reference's coupes stand ~1.35 m, squarely
   in the 0.9-1.8 m dead band this arena forbids, so they need either the
   vans-as-hard-cover route or a documented second exception. Not a builder
   decision.
5. **Water, interiors, contact-grime decals** — Job 14. The pool is still an
   `opacity: 0.82` tinted box; Beer-Lambert absorption by depth is the single
   biggest remaining look win now that the pool is actually visible.
6. **Dressing meshes: still zero.** Deliverable A's target is >= 70. This slice
   spent its budget on the layout being true and the surfaces existing; the
   ~70 dressing pieces are cells 1-9. The NaN gate from Job 0 exists precisely
   so that work cannot be "done" and invisible.

**OPEN questions carried forward, unchanged and unfilled** (also in
`RAID2_OPEN`): garage depth (moving it moves team 1's spawns — HF-402's scar);
the south garden pond (a water feature in a spawn apron needs a second
confirming source); court colour (blue must clear band 22 *at held luminance*,
not by dropping value); the vehicle dead-band exception; the derived-exposure
camera block (its own lane — it touches the shared grade profile).

**One thing the skeptic should re-measure first:** the bake budget on a quiet
machine, and the calibration's X residual, which is sitting exactly on its 2 m
stop condition.
