# Atomic Acres ART FORGE — recipe book

One entry per pass. A recipe records the subject, the exact files and constants, the measured
effect, the cost, and the gotchas — so the next brief on the same subject extends it rather than
rediscovering it. Predicted gain vs realised gain is scored, so the book learns which techniques
transfer (ruleset R37–R38).

Claim states: `[VERIFIED]` read from source/capture, `[MEASURED]` computed here, `[INFERENCE]`
reasoned, `[OPEN]` not yet checked.

---

## R-001 — Recover an aliased silhouette before adding noise to it

**Subject:** distant ridge / crest silhouettes built from analytic ridged-fBM.
**Pass:** `forge-nature-1` (HF-536 PASS 1). **Files:** `src/nuketown-mountain-backdrop.ts`.

**Method.** When a procedural crest reads as "one smooth band", measure the crest series BEFORE
adding octaves. `buildRidgeRing`'s `ridged()` already summed four octaves at angular frequency
3 / 7 / 13 / 23. `[MEASURED]` over 360 samples the ridge ring's own height function has 45 local
maxima and a 2.05 max/min ratio — far above the "≥ 14 maxima, ≥ 1.9 ratio" bar the brief set as a
target. The silhouette was smooth because the ring was **sampled** at 168 segments, so the top
octaves were aliased off the geometry, not because the function lacked detail.

**Constants.** ridge `segments` 168 → 200; far range 144 → 152. Foothills 108 unchanged.

**Measured effect** `[MEASURED]` (crest local maxima on the built geometry, wrap-aware):
ridge 34 → 37, far range 30 → 36; 64 → 73 total, +14 %.

**Cost** `[MEASURED]`: rings 5,664 → 5,984 triangles, against the module's **untouched** 6,000
fence in `nuketown-mountain-backdrop.test.ts`. Draws unchanged (4 meshes). This is why the pass
shipped 200/152 and not the brief's 240/200 — 240/200 measures 6,688 triangles and would have
required moving a threshold, which is forbidden (R32).

**Transfer rule.** For any analytic silhouette: `segments ≥ 8 × highest angular frequency` before
adding an octave. Adding octaves under that bound buys nothing and costs vertices.

---

## R-002 — Separate stacked primitives with a baked value ramp, never a tint

**Subject:** instanced conifers / canopy blobs on a flat-shaded white `MeshStandardMaterial`.
**Pass:** `forge-nature-1`. **Files:** `src/nuketown-forest-surround.ts`.

**Method.** Stacked cones read as one green mass because every tier carries one value. Bake a
per-vertex value ramp into the MERGED prototype (`mergeParts` gained an optional
`shade: { underside, top }` per part, keyed off that part's own local y extent) and flip
`vertexColors: true` on the **same** material instance. Tiers x0.62 at their base ring, broadleaf
blobs x0.7.

**Why a ramp and not a lighter top:** `material.color`, `instanceColor` and `vertexColor` all
**multiply** and are capped at white (gotcha `gotcha-material-color-tint-cannot-lighten`). A tier
can only separate itself by darkening its own underside. Any recipe phrased as "brighten the lit
face" is arithmetically impossible on this stack.

**Program-set cost:** zero `[MEASURED]` — material instance count in the module is 9 before and 9
after; no new `MeshStandardNodeMaterial`, no `uniform()`, no sampler (R2).

---

## R-003 — Jitter a rim by hashing the QUANTISED position, not the vertex index

**Subject:** breaking a cone/cylinder rim so a silhouette is ragged (R20).
**Pass:** `forge-nature-1`. **Files:** `src/nuketown-forest-surround.ts` (`jitterRim`).

**Method.** After merging into a NON-INDEXED geometry, each rim corner exists several times (once
per adjacent triangle). Hashing on the vertex **index** gives those copies different offsets and
tears the surface open. Hash on the position quantised to 1 mm instead: every copy of a corner
hashes identically and the surface stays closed. Skip vertices inside `minRadius` so cone apexes
and the trunk do not move — that is what keeps `FOREST_CONIFER_HEIGHT_M` exact and its pin green.

**Constants:** `FOREST_RIM_RADIAL_JITTER` 0.18 (±18 % radial), `FOREST_RIM_VERTICAL_JITTER_M` 0.25.
**Cost:** zero draws, zero materials; tier cones went 8 → 12 radial segments in the same change.

---

## R-004 — Fork a shared sky preset, never edit one

**Subject:** a blown-white horizon at a fixed exposure. **Pass:** `forge-nature-1`.
**Files:** `src/rendering/sky-backdrop.ts`, `src/rendering/arenas/nuketown2.ts:98`.

**Method.** `estate-golden-hour` is also test2's sky (R6), so Nuke Town got
`'nuketown2-golden-hour'`: zenith stops and every below-horizon stop copied verbatim, the five
horizon-band stops lowered in value and raised in chroma (`0.4985` `#ffcf90` → `#f0b874`), cloud
alpha 0.56 → 0.50, and the **sun disc entry copied verbatim** because the light rig is frozen (R5).
Adding a preset id means four places: the union type, the gradient table, the cloud table, the sun
table, plus every id predicate — `npx tsc --noEmit` names the ones you miss if the records are
exhaustive over the union.

**[OPEN]** Realised effect on the into-sun sky box is not yet measured — see the pass report.

---

## R-005 — A structural feature that lives only in albedo is a picture of a surface

**Subject:** the whole map reading as flat, "Roblox or something 20 years old" (owner, 2026-09-06
18:05). **Pass:** `night-materials`. **Files:** `src/nuketown2-materials/relief.ts` (new), the six
family graphs under `families/`.

**The finding.** The families were not short of detail. Asphalt had tar seams, cold patches, wheel
paths and cracks; siding had lap courses, drip shadows, nails and butt joints; blockwork had mortar
joints in half bond; the roof had shingle courses and keyways. Every one of those was an **albedo
step and nothing else** — `grep -rn 'normalNode' src/nuketown2-materials` returned nothing. An
albedo step is the same value from every direction at every sun angle, so a mortar joint painted
into the colour is a printed line on a card. Under a 14° key the thing that says "wall" is that the
joint is *recessed*: the top lip shades, the bottom lip catches, and the pair flips as the sun moves.

**Method.** One shared node, `reliefNormal(heightM)`: Mikkelsen's surface-gradient bump
(mm_sfgrad_bump.pdf listing 2 — the same maths as three's own `perturbNormalArb`) evaluated on an
arbitrary scalar height node instead of a texture fetch, because three's `bumpMap()` takes a
`TextureNode` and re-samples it, and our height is a composition of a dozen procedural terms.

Two decisions worth copying:
1. **World-rate gradients.** `dFdx(height)` is divided by `|dFdx(positionView)|`, the world size of
   one pixel, so `dH/dx` is a slope in m/m. That is what lets a family author "the mortar joint is
   5 mm deep" and get 5 mm at every range, and what lets a test pin the number. Three's own bump
   node skips the divide and its strength therefore drifts with distance and resolution.
2. **Clamp the slope.** A lap course or a shingle butt is a genuine STEP; differentiated across one
   pixel that is an unbounded slope (a 10 mm step at 2 m spans a 1.2 mm pixel → slope 8) and the
   normal flips past grazing and sparkles. `MAX_RELIEF_SLOPE = 2.5` (tan 68°) keeps the step as a
   hard lit/shadow pair that can never render as a hole.

**Why not a normal map.** Six families × one sampler is six against a device budget that rejects
`requestDevice` **silently** at 17 samplers and rolls the arena back with no error text
(gotcha `silent-arena-rollback-device-limit`). This costs zero samplers, zero textures, zero load.

**Constants (metres, all real dimensions per R17):** siding lap proud 0.010 (11 mm milled butt);
shingle butt proud 0.004; mortar recess −0.005 (struck joint); sawn slab joint −0.006; tar-seam
overband +0.003; cold-patch +0.004; road aggregate ±0.0012; timber board gap −0.019; door panel
joint −0.006; marking film 0.0028; orange peel 0.00006.

**Cost:** program-set delta 8 → 8 registry family graph keys, 43 → 43 distinct arena graphs, six
keys replaced, zero net new.

---

## R-006 — Author the scale the frame actually reads, not the scale the spec table has a row for

**Subject:** the carriageway reading as one flat value at 8–25 m. **Pass:** `night-materials`.
**Files:** `src/nuketown2-materials/families/asphalt.ts`.

**The finding.** `wear.ts` fades grain out by 3 m and scuffs by 18 m, which is correct — below those
ranges they alias. But asphalt's three authored scales are 1.0 mm / 35 mm / 2.6 m, so from the
distance every street station actually views the road, the **only** live term was the 2.6 m traffic
gradient. One term at one scale across a 40 m plane. The bands in `spec.ts` (grain 0.5–1.5 mm,
scuff 20–80 mm, traffic 0.5–3 m) are a *vocabulary*, not a complete description: a family is free to
add a term at the size its own material is made of, and asphalt's is 10–20 mm stone.

**Method.** `AGGREGATE_M 0.022` (fitted to the generated reference tile's autocorrelation feature
size, 31 mm at an assumed 2 m span), ±8.5 % albedo, +0.12 roughness, 1.2 mm relief, faded 14 → 30 m
rather than the scuff's 18 m because at 22 mm it is still 3.6 px at 20 m — above the 2 px floor.

**Same trap, second instance: the markings.** Paint wear rode `wear.scuff`, so it was gone beyond
18 m — and every station the critic scores a lane marking from is further away than that. That is
the entire mechanism behind gap #3, "razor-sharp unweathered dashed centre line". Paint loss now
rides its own field carried to 44 m, thresholded to a **measured** 0.30 of the bar (scanned over the
shipped LUT, pinned in `relief.test.ts`), with the chip edge modulated by the *road's own* aggregate
noise so the bar and the surface under it are one material and not two.

**The general rule.** Before adding contrast, check whether the term you are strengthening is even
alive at the range the frame reads it from. Twice on this map the answer was no.

## R-005 — Count props, not boxes, or a ratchet will forbid detail

**Subject:** a declutter ratchet that blocked every kit-of-parts prefab. **Pass:** `night-kit`.
**Files:** `src/nuketown2-fidelity.test.ts`, `src/nuketown2-arena.ts` (`BoxOptions.propId`).

**Method.** The HF-491 verge ceiling counted BOXES because, when it was written, every authored
body was one box AND one prop. The moment a prop is built from parts — a lantern head is a hood, a
cap and a lit diffuser — a box count forbids the prop from LOOKING like the thing it is, while
still admitting the same number of separate objects. Move the ceiling onto the PROP at the same
value, keep the box count as its own measured fence with zero headroom, and give every part of one
prefab the same `propId`. A body with no `propId` is its own prop, so the re-base moves nothing
that already existed. Keep the label out of colliders, shot surfaces and the ballistic ledger, so
it can never launder cover in; write it at ONE call site so a reviewer reads it next to the
geometry.

**Cost:** zero. **Measured:** props 34 of 36; boxes 70 (was 30 before the two prefabs landed).

---

## R-006 — A dressing strip is invisible unless its normal differs

**Subject:** a 26 m kerb that read as one grey stripe. **Pass:** `night-kit`.
**Files:** `src/forge-kit/kerb-course.ts`, `src/nuketown2-arena.ts` (`carriageway stem kerb`).

**Method.** The instinct is to lay a thin bright strip along the top arris. It does nothing: an
axis-aligned box on an axis-aligned box shares its normals, returns the same value under the same
light, and is invisible except at the silhouette. ROTATE the strip 45 degrees about the run axis
and half of it buries in the parent while the lit half faces up and out — now it has its own
normal and draws a continuous highlight the length of the run. Then INTERRUPT that highlight at
the real stone pitch (915 mm, BS 7263) with a mortar haunch standing 8 mm proud: an interrupted
highlight is how an eye counts stones.

**Scale departure, recorded not hidden:** the real chamfer is 13 mm and subtends under one pixel
at the review distance, so it is authored at 45 mm — the smallest section that survives 1080p at
14-24 m. Everything else in the prefab is real millimetres.

**Cost:** +1 draw call (the `kerb` role gains its first presentation batch), +1,032 triangles,
zero materials. The solid kerb box is untouched, so colliders and ballistics are byte-identical.

---

## R-007 — Presentation-only boxes are free draws; spend them on the eaves

**Subject:** 6 m of unbroken siding on every house elevation. **Pass:** `night-kit`.
**Files:** `src/forge-kit/gutter-run.ts`, `src/nuketown2-arena.ts`.

**Method.** `batchPresentationOnlyBoxes` merges every `solid:false, shots:false` BoxGeometry that
shares a material into ONE mesh, so a prefab that borrows an existing role costs triangles and no
draw call at all. That makes the eaves the cheapest large improvement on a house: a trough, a bead
standing 20 mm proud of it (the bead is the part the low sun catches — one box with one normal
cannot produce that line), hoppers, downpipes at the inner faces of the end walls, and shoes
160 mm off the lawn. Put the pipes where a builder would: at the corners, clear of every opening.

**Cost:** 96 triangles per run, four runs, +0 draws, +0 materials.
