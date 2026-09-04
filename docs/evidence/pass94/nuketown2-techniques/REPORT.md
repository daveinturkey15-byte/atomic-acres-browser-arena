# PASS 94 — Nuke Town Rebuild: the shared 3D techniques, applied

**Lane:** TECHNIQUES (Claude Code, Opus 5.1, `dave-gaming-pc`).
**Worktree:** `C:/Users/david/projects/aa-claude-tech`.
**Branch:** `contrib/dave-gaming-pc/claude/nuketown2-techniques`.
**Date:** 2026-09-04.

Owner brief: *"can we be using the cool three.js techniques from the threads I
shared (Fable, Opus, GLM and more) — get it really nice?"*

---

## 0. Base-branch deviation, recorded first because it changes what this is diffed against

The lane brief said to branch from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`. **That ref does not
exist on origin.** `git fetch origin` succeeded and the branch list carries no
`pass93-candidate`; the only `pass93` ref is
`origin/contrib/dave-gaming-pc/claude/pass93-chrome153-hotfix`.

This lane therefore branched from
**`origin/contrib/dave-gaming-pc/claude/nuketown2-handedness` @ `5f5ecc47`**,
chosen because it is the most inclusive current Nuke Town line:
`git merge-base --is-ancestor` confirms it CONTAINS `nuketown2-tiptop`,
`nuketown2-owner-round2` and `pass93-chrome153-hotfix`. It does **not** contain
`nuketown2-ballistics`, `vehicle-forge` or `spawn-distribution`, which are three
other lanes' branches from today. **Integration owes a merge of those three.**

---

## 1. Register rows applied

Each row is named with what was taken and what was refused. Every row was read in
`C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md`.

| Row | Source and licence | What this pass took | What it did NOT take |
|---|---|---|---|
| **18** | `CK42BB/procedural-grass-threejs` / `procedural-landscapes-threejs`, **MIT** | Distance LOD by geometry simplification; three-layer wind (global sway + rolling world-space gust + fast turbulence); backlit-translucency approximation. | Nothing imported. Both repos are documentation-shaped (`SKILL.md` + prose, no `src/`), so adoption can only mean reading a described method. Restated in our own TSL in `src/nuketown2-vegetation.ts`. |
| **24** | TAKEN / VOIDMODE, **source unlocated, comparator only** | The property the row names: ground cover must be *several distinct species*, not one repeated silhouette. Hedge and avenue tree are two silhouette families with different wind constants, asserted by `nuketown2-vegetation.test.ts`. | No code, no assets. The row's search was closed negative; nothing was re-searched. |
| **38** | `vibe-stack/super-terrain`, **NO LICENCE — Authority 2b** | Two atoms: *species parameter sets sharing one material*, and *separating where foliage may grow from how much*. Restated as `HEDGE_SPECIES`/`TREE_SPECIES` and the placement predicate. | No files, functions, shader bodies, constants tables or comments. Nothing vendored. Learn-only. |
| **46** | Three.js Water Pro (Dan Greenheck), **paid, all-rights-reserved** | The published physics, in the skill's build order: Beer-Lambert per-channel absorption over a real optical path; broadband backscatter injected **upstream** of the absorption integral; depth-driven shoreline foam; local Fresnel transparency at `iorRatio` 1.33. | The library was not purchased, downloaded, unpacked or read; the shipped demo bundle was **not** fetched or deobfuscated; no prose pasted. Both of the author's water repos return 404, so there was no code to copy in any case. |
| **47** | GTA-style city art (Matt Shumer), **unpublished, bar only** | The row's ordering of what carries a street look: *road surface first (aggregate, crack networks, worn paint), pavement second, furniture density fourth*. That is why this pass built a grime tier at all. | The row's trap was avoided: the reference's flat overcast grade is the opposite of the owner's dynamic/time-of-day direction, and **lighting is another lane today**, so nothing here touches grade. |
| **48** | Browser subway FPS (bijanbowen), **comparator** | The finding that decal grime buys most of a "high graphics" read for no lighting technology at all — applied to wall streaking and splash-back. | No lighting work, per the lane split. |
| **9** | `millionco/react-doctor` `improve-threejs`, **Modified MIT** | The *method*: severity follows the render loop; build the hot-path map before triage; rank by where code runs. Implemented as `scripts/qa/audit-nuketown2-frame-loop.mts`. | The upstream skill was **not installed** — installing runs third-party code and is an owner decision, not an agent decision. |
| **6 (img2threejs)** | `img2threejs/img2threejs`, **Apache-2.0** | The staged-sculpt discipline: a quality contract before code, then blockout to structure to detail, each tier named with its read distance. Applied to the four hero props. | The Python `forge/` state harness was **not** run (OPEN 5). Nothing copied. |

Reference images: `docs/references/nuketown-2025/img/` on
`origin/contrib/dave-gaming-pc/claude/research-2026-09-04`.
`nt2025-aerial-boii.jpg` and `nt2025-street-boii.jpg` were extracted to a session
scratchpad and **opened and looked at** at native resolution on 2026-09-04. No
image, texture, mesh or colour dropper entered the project.

---

## 2. What changed

### 2.1 Vegetation — `src/nuketown2-vegetation.ts` (+ test)

The Rebuild already had a dense instanced lawn (inside the lots) and a forest
ring (at 44.5 m). Between them there was nothing, and the arena's hedge and
planter bodies were plain grey boxes.

- **Clipped box hedges** now dress four authored bodies, both halves — `verge
  front hedge`, `verge planter`, `verge kerb planter`, `yard alley planter`.
  Each is a `THREE.LOD` with three merged-geometry levels: five lobes on a
  clipped body (near), three lower-detail lobes (mid), the body alone (far).
- **A 54-trunk deciduous avenue** in the previously empty band between the
  perimeter wall and the forest ring — seeded dart-throwing, 4.6 m minimum
  separation, four angular sectors each with its own three-level LOD.
- **Layered GPU wind** on both, riding the one existing per-frame hook.

**Why it is admissible.** Every hedge run sits on the footprint of a body the
arena already emits as a *collider*, and `nuketown2-vegetation.test.ts` asserts
that against the **real constructed arena** rather than a second copy of the
numbers — the discipline `nuketown-lawn-field.test.ts` applies to the lawn
keep-out table. Every avenue trunk stands outside the arena rectangle inflated by
2.4 m and inside 43 m radius, so no reachable ground gained a visible solid.
Nothing here has a collider, raycast mesh or shot surface.

**A bug this pass found in its own first cut, recorded because it is the
interesting one.** The first version parked all three LOD objects at the world
origin with world-baked geometry. That is not a distance LOD — it is a global
quality switch measuring distance-to-map-centre. The fix bakes each cluster's
geometry in its own local frame and positions the LOD where the thing it draws
stands; the test now asserts `lod.position.lengthSq() > 1` on every LOD so the
mistake cannot come back.

### 2.2 Pool water — `src/nuketown2-pool-water.ts` (+ test)

The previous material set a constant `vec3(0.04, 0.44, 0.54)` plus a plus/minus
0.04 noise ripple and `opacity: 0.78`, under a comment calling it "Beer-Lambert
absorption tone". It is a palette: no path length, so the water was the same
colour 5 cm from the coping as over the deep end, and equally opaque looked at
straight down as at a grazing angle — the "blue lid" the water skill names.

Replaced, in the skill's stated build order:

1. **Absorption over a real optical path.** `pathLength = depth + depth/cos(theta)`
   (downwelling + upwelling legs), depth from an authored dished bed profile,
   theta from the shading normal against the view direction. Per-channel
   extinction `[0.92, 0.16, 0.11] 1/m` — red removed fastest, which is why deep
   clean water goes cyan-green rather than merely dark.
2. **Broadband backscatter injected upstream of the absorption integral**, so
   absorption acts on the scattered light and the hue shifts green. The test
   asserts the *source order* (`scatter`, then `incoming`, then `transmittance`,
   then `incoming.mul(transmittance)`), because this is the one property that
   silently reverses the result and still compiles.
3. **Depth-driven edge foam** plus a crest term with an explicit lag, so foam
   trails the ripple instead of blinking with it.
4. **Local Fresnel transparency** at `iorRatio` 1.33 — the single term that makes
   a pool read as water rather than a lid.

A CPU mirror of the bed profile (`nuketown2PoolDepthAt`) exists so the depth the
shader integrates and the depth a future submersion query would ask for are one
function. The pool is **not** swimmable and nothing here writes gameplay state.

### 2.3 Hero props — `src/nuketown2-yard-props.ts` (+ test)

Four props rebuilt from the aerial, each authored at three reading tiers
(`silhouette` / `structure` / `detail`):

| Prop | Reference evidence | Tiers |
|---|---|---|
| Three-unit appliance bank on a white cabinet | FINDINGS Q4, **VERIFIED** from `nt2025-aerial-boii.jpg` | cabinet (solid) / hob deck + plinth / 3 control panels + 3 handles |
| Glasshouse | FINDINGS Q4 back-yard identity, **VERIFIED** | glazed shell (solid) / eaves + cill + 2 posts / 5 glazing bars + door frame |
| Garden pod | FINDINGS Q4, **VERIFIED** | shell (solid) / eave band + roof cap / window + sill |
| Sand pit | FINDINGS Q4, **VERIFIED** | timber kerb (solid, 0.30 m — under the 0.42 m autostep) / sand / 2 corner seats |

**The one deliberate divergence from the reference, and why.** The reference's
two yards hold *different* objects, and FINDINGS is right that the difference is
chirality. But this arena's fairness argument is `pair()`, and a glasshouse on
one team's yard against a garden pod on the other's is not the same cover on a
3,024 m2 competitive map. So **geometry is an exact rotational pair and the
identity is carried by colour alone** — RED hob tops on one lawn, BLUE on the
other. That is the precedent `pair()` already documents for the house siding, and
it is exactly the anchor FINDINGS calls "the cheapest chirality anchor in the
whole reference". Both yards get all four props.

The `silhouette` tier is the solid and it is the whole visible mass, so what you
shoot and what you see are the same box. `reduced` drops exactly the `detail`
tier and nothing solid — asserted.

### 2.4 Tiered grime — `src/nuketown2-grime-decals.ts` (+ test)

Six decal families on a **-3 polygon-offset tier**, strictly below the arena's
existing `driveDecal` (-1) and `lawn` (-2): tyre scuff, oil (with an iridescent
rim), settlement crack networks, shuffleboard court paint, stepping stones, and
wall grime (rain streaking + splash-back). Each family is one material whose
alpha comes from a world-space procedural field, so `batchPresentationOnlyBoxes`
merges every member into one draw without the pattern smearing.

**Depth-tier compliance, and the thing this pass refused to do.**
`find-coplanar-pairs.ts` classifies overlapping top faces three ways and
**ignores polygon offsets inside carriageway and building footprints**. Every
ground decal here is therefore placed *outside* both, where the offset tier
actually fences the pair — and `nuketown2-grime-decals.test.ts` re-implements
those exact footprint rules so a bad decal fails a unit test before it reaches
the gate. Ground decals sit 3 mm above the plate: *inside* the 0.03 m window on
purpose, so the instrument sees the pair and fences it, rather than hiding from
the audit behind a lip. **Carriageway skid marks are OPEN, not built** — OPEN 1.

### 2.5 Frame-loop instrument — `scripts/qa/audit-nuketown2-frame-loop.mts`

New. Counts draw calls the way a renderer does (one per visible mesh; an
`InstancedMesh` is one; a `THREE.LOD` is one, at the level its distance selects;
batcher source nodes left `visible = false` are **not** counted), and separately
exercises the arena's per-frame entry point 6,000 times.

---

## 3. Gate lines

All run in `C:/Users/david/projects/aa-claude-tech` at `813c6579`.

**`npx tsc --noEmit`** — clean, no output.

**`npx tsx scripts/qa/find-coplanar-pairs.ts`** (full report: `coplanar-pairs.txt`):

```
# nuketown2 coplanar top-face pairs (HF-434 instrument)
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# boxes=802 · pairs<=0.03m: 196 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 170 · SAME-MATERIAL (benign): 26
```

Baseline was `boxes=726 · pairs: 92 · FINDINGS 0 · FENCED 66 · SAME-MATERIAL 26`.
**One scoped-claim change to record honestly:** the report's `UNAUDITED` line grew
from **16 to 52** meshes. The 36 new entries are this pass's 24 hedge-LOD meshes
(`non-box` merged geometry) and 12 avenue-sector `InstancedMesh`es. They are
counted and named by the instrument, not silently dropped, but "0 FINDINGS"
remains a scoped claim over axis-aligned boxes, and organic foliage geometry is
outside that scope — as it already was for the lawn, forest and mountain rings.

Two real z-fighting findings were caught by this instrument during the pass and
fixed geometrically (the glasshouse eaves band and its posts topped out flush
with the shell roof plane over 6.6 m2; both now stop 0.06 to 0.10 m under it).

**Unit and gate suites** — `npx vitest run` over the ten relevant files:

```
Test Files  10 passed (10)
     Tests  94 passed (94)
```

covering `nuketown2-fidelity`, `collider-visual-parity-gate`,
`walkable-surface-parity-gate`, `nuketown-traversal`, `nuketown-lawn-field`,
`nuketown-sightline-fidelity`, plus the four new module tests
(`nuketown2-vegetation` 9, `nuketown2-pool-water` 9, `nuketown2-yard-props` 7,
`nuketown2-grime-decals` 7 = **32 new tests**).

**`npx vite build --outDir dist-pass94-tech`** — built in 3.81s.

**Frame-loop audit** (`frame-loop-before.json` / `frame-loop-after.json`):

| | before (`5f5ecc47`) | after (`813c6579`) | delta |
|---|---|---|---|
| draw calls | **356** | **391** | **+35, +9.83 %** |
| triangles (typical, camera at arena centre) | 215,326 | 224,225 | +8,899, +4.13 % |
| triangles (worst case, every LOD at level 0) | 215,326 | 247,777 | +32,451, +15.07 % |
| frame-loop entry points | 1 | **1** | unchanged |
| colliders | 292 | 300 | +8 (four hero props x two halves) |

**Draw-call growth is +9.83 %, under the lane's 15 % ceiling.** The 35 break down
exactly: **12** vegetation LODs, **13** new presentation batches (props and decals,
merged per material by the arena's existing batcher), **8** solid hero-prop bodies,
and **2** hob decks — the hob decks cost two draws rather than one precisely
*because* they are the red/blue chirality anchor and therefore cannot share a
material. Everything static that could be batched, was: props and decals were
deliberately emitted through `pair()` **before** `batchPresentationOnlyBoxes` runs
so the batcher owns them.

Triangle growth is small at the typical figure because the four new solids became
lawn keep-outs automatically (the lawn is built from `builder.colliders`), so tuft
count fell 9,298 to 8,599 and paid for most of the new geometry.

**Per-frame allocation.** The arena has exactly one per-frame entry point,
`root.userData.nuketownLawnWind`, driven by `updateArenaArt`. It now calls two
`advanceWind` closures instead of one; both do nothing but assign to `.value`,
with an index loop and no allocation. Measured over 6,000 frames: **0.074 us per
frame**, heap delta **19 bytes/frame** — the same order as the baseline's 18.45,
i.e. sampling noise rather than a real allocation. No new RAF callback, no new
traversal, no new render target, no new scene-graph mutation.

---

## 4. OPEN

1. **Carriageway tyre marks are not built.** `find-coplanar-pairs.ts` ignores
   polygon offsets inside the carriageway, so *any* new top-face box within
   0.03 m of the road is a `STREET-FINDING` regardless of tier. The only route
   the gate leaves open is HF-463's geometric one (raise the marking >0.03 m
   clear, as the centre dashes are), and a 40 mm proud plinth is the wrong shape
   for a skid mark over several square metres. **This was left OPEN rather than
   solved by rotating the geometry so the audit skips it.** The right fix is a
   grime term inside the road material itself — materials lane, not this one.
2. **Two review cameras are missing at runtime** — `nuketown2-north-balcony`
   and `nuketown2-front-porch`, PRE-EXISTING at the base SHA (section 5).
2b. **`qa:pass74:arena-boot-smoke` and `qa:stock-boot` did not run** — the
   shared `node_modules` junction lost `@playwright/test` and `.bin` mid-pass
   (section 5). Not repaired, because that tree is shared with live lanes.
3. **Persistent world-fixed foam** for the pool (one render target + one blit per
   frame for a 9.9 m2 pool) was judged a bad trade and not built; refraction of
   the scene behind the surface and bed caustics likewise need a pass each. The
   depth-driven edge layer carries the read today.
4. **`createNuketown2PoolWaterMaterial` in `src/nuketown2-interior-materials.ts`
   is now dead code.** Left in place deliberately: that file is another lane's
   today. Route the deletion to a later tidy pass.
5. **The img2threejs `forge/` Python state harness was not run.** The staged
   sculpt discipline was applied by hand (quality contract, tier order, stated
   read distances) but there is no `.img2threejs/state.json` and no automated
   render-vs-reference score. The props are *reference-informed*, not
   *gate-scored*, and that distinction should not be over-claimed.
6. **Three sibling lanes are not merged into this branch** —
   `nuketown2-ballistics`, `vehicle-forge`, `spawn-distribution` (see section 0).
   `vehicle-forge` touches the street vehicles; integration should re-run the
   coplanar instrument after that merge.
8. **The grime decals are not visually confirmed.** They pass the depth-tier
   unit gates and the coplanar instrument, but no review camera frames a
   driveway apron, border path or wall run closely enough for a decal to
   resolve, so nothing is claimed about how they look.
9. **The hero props have no close-range capture.** Both yard cameras look away
   from them. The `structure` and `detail` tiers are therefore untested by eye.
7. **Hob-deck colour to house-colour mapping is unverified.** FINDINGS says red
   goes with the orange house and blue with the white/cream one. This pass
   assigns red to the `north` half and blue to `south` without asserting which
   half currently carries which siding, because house colour is a live
   materials-lane decision today. If the mapping is wrong it is a one-line swap
   in `nuketown2YardPropSolids`, and it is worth a gate once the siding settles.

---

## 5. Browser evidence — captured, and looked at

The GPU rule was re-checked at 14:37 BST (ComfyUI queue empty; 14,246 MiB free;
**zero** headless Chrome after a 6-minute poll) and the window was taken.

`node scripts/qa/capture-arena-viewpoints.mjs --serve-dist dist-pass94-tech
--arenas nuketown2 --label pass94-techniques` — backend **webgpu**, adapter
**nvidia/blackwell**, **10 of 12 cameras captured**. Output:
`artifacts/viewpoint-regression/pass94-techniques/`.

**The 2 failures are PRE-EXISTING and are not this lane's.**
`nuketown2-north-balcony` and `nuketown2-front-porch` both return
`setArenaReviewCamera returned false - authored camera missing`. The identical
run at the base SHA `5f5ecc47` in a separate worktree fails on exactly the same
two cameras, so the two HF-465 cameras landed in
`scripts/qa/viewpoint-catalog.mjs` and in `src/rendering/arenas/nuketown2.ts`
but the runtime `setArenaReviewCamera` path does not accept them. This is a
blocking finding for the handedness lane, recorded here and not worked around.

### What the captures actually show — and three things they made this lane fix

The captures were opened and looked at, and they changed the code three times.
This is the honest record, because two of the three would have shipped as
silent no-ops.

1. **The hedges were rendering nowhere.** `nuketown2-into-sun-street` and
   `nuketown2-street-centre` came back *byte-similar to the baseline*. The
   hedge foliage was being built 0.06 m **inside** its host solid — and the
   host is an opaque box at the same footprint, so the hedge was invisible in
   every frame. Fixed: the foliage now CLADS its host (`HEDGE_CLAD_M` 0.07 m
   proud, `HEDGE_CLAD_TOP_M` 0.06 m above the top face), and a regression test
   asserts the near level's bounding box is wider and taller than the run it
   dresses so a future tidy cannot re-inset it.
2. **The hedge lobes were scaled off the run thickness, not the segment.** On
   the 1.94 m-thick verge planter each lobe came out 1.78 m wide inside a
   0.62 m segment — five per segment, six segments, all overlapping into one
   smooth mass wider than the planter. Lobe X is now a fraction of the unit
   segment, so the scalloped ridge survives at every run thickness.
3. **Every review camera was on the FAR hedge tier.** At 14/30 m the
   deterministic cameras all selected the box level, which is the same read the
   olive planter already had. Widened to 22/40 m (measured cost: 1,648 tris for
   the largest run), so the near tier covers the ranges a player fights at.

**And one claim in this lane's own source comment was wrong and has been
corrected.** The module header said the arena's hedge and planter bodies "were
plain grey boxes". They are not — `m.planter` is `0x415a33`, a dark olive
green, so they already read as vegetation-coloured masses. What they lacked was
silhouette, value gradient and movement. The corrected comment says so, and it
also states the consequence honestly: **at distance a green box and a green
hedge are the same few pixels**, so the far tier is deliberately still a box and
the hedge work is a modest delta at the review-camera ranges, not a
transformation.

### The honest read of the four items

| Item | Verdict from the captures |
|---|---|
| **Avenue trees** | **The clear win.** `nuketown2-overhead` shows a real line of round-crowned deciduous trees standing between the perimeter wall and the conifer ring, on both long flanks, visibly a different species from the forest behind them. That band was empty. |
| **Hedges** | Landed, and visibly better than the flat olive box — the near tier has a soft crown and a value gradient in `nuketown2-street-centre`. Modest at these camera ranges; the fix history above is the interesting part. |
| **Hero props** | Present as cream masses in both back yards in `nuketown2-overhead`. At the yard cameras they sit behind the eye point, so no close read of the glasshouse/pod detail tiers exists yet. **Not visually verified at close range.** |
| **Grime decals** | **Not confirmed in any capture.** None of the ten cameras frames the driveway apron, the border path or the wall runs at a range where a decal resolves. Recorded as OPEN 8 rather than claimed. |

### The two named boot gates did NOT run, and the reason is not this branch

`npm run qa:pass74:arena-boot-smoke` and `npm run qa:stock-boot` are **OPEN**.
Both failed to start with `Cannot find module '@playwright/test'`. The cause is
external to this branch: this worktree's `node_modules` is a junction into the
shared `C:/Users/david/projects/aa-claude-chopper/node_modules`, and partway
through this pass `@playwright/test` and the whole `node_modules/.bin` directory
disappeared from it. It is not a transient install — the tree still holds 350
packages including `three` and `vitest`, and no npm/pnpm process is running, so
another lane pruned or replaced it. **It was left alone**: repairing a
`node_modules` that several live worktrees share is not this lane's call, and an
`npm install` there could break whichever lane is mid-run.

What this costs, stated precisely: the two named boot gates have no receipt.
What partly covers it: the review-capture run above IS a real WebGPU boot — it
loaded the built app, waited for `__ATOMIC_ACRES_DEBUG__`, selected `nuketown2`,
called `startSolo()`, froze the bots and drove ten deterministic cameras to
committed frames on an nvidia/blackwell adapter with **zero page errors and zero
console errors**. That is stronger boot evidence than a smoke spec, but it is
not the named gate and is not offered as one.

Everything else was re-verified at this head after the `node_modules` change:
`npx tsc --noEmit` clean, and 10 test files / 95 tests green.

### The biggest remaining art problem is not this lane's

`nuketown2-overhead` makes it obvious: the ground **outside** the perimeter wall
is a vast pale sand-cream plain, and it now occupies more of the frame than the
map does. The avenue draws the eye straight to it. That is the arena ground-slab
material, it is pre-existing, and it belongs to the materials lane — but it is
the single highest-value fix visible in these frames and it should be routed.
