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

---

## R-008 — Warm the actual image before attributing a lighting change

VERIFIED2026-09-09 bounded Nuke Town run: fixed named camera, authored17.6hour,
clear weather, fixed outer visual clock and seed still produced early luminance
drift. The same original bundle converged only after182574ms; candidate1 after
164371ms. Constant light values, environment UUID/version and texture census did
not prove the image was settled. Baked indirect was enabled, but its exact share
of the drift remains an inference, not an established cause.

Method: first camera warmup downsamples actual1280x720 screenshots to160x90 and
requires three consecutive mean absolute RGB differences<=1/255 at18s intervals,
after at least90s, with a bounded18check timeout. Only then compare ablations and
restore A/A. This is a diagnostic screenshot method, never a GPU FPS source.
Performance separately uses runtime completed-sequence/time counters without
canvas readback. Preserve failed/unstable pairs rather than choosing their most
flattering frame. Receipts: root run outputs aa-visual-run/baseline-warm-six,
candidate1-six and candidate2-lamp-nine.

## R-009 — Preserve channel ratios when applying contrast to linear HDR

VERIFIED stable vehicle A/A: the previous per-channel affine contrast around0.5
produced blue-pixel fractions0.0533507/0.0533670; identity contrast produced0.
Nuke-only shared-luminance scaling in commit3912b0d49 removes the blue artifacts
in six actual warmed views while leaving other arenas on their existing curve.

Method: for finite nonnegative linear RGB and positive contrast c, compute
Y=dot(rgb,[0.2126,0.7152,0.0722]), then rgb*pow(max(Y,1e-6)/0.5,c-1).
Identity c=1 selects the original input exactly. No channel offset, no HDR clamp;
black stays black and positive channel ratios are preserved. This does not repair
negative values introduced by an upstream saturation operation; that remains a
separate input-contract question. CPU plus interpreted-TSL tests prove arithmetic;
actual Chrome WebGPU captures prove this candidate compiled and rendered.

Cost OPEN until matched performance acceptance. The existing scene-grade uniform
and one arena selector are reused, no new pass or render loop; that does not imply
the extra expression is free. Current API orientation: https://threejs.org/docs/llms.txt;
implementation checked against installedThree0.185.1, no dependency upgrade.

## R-010 — Keep the night pool, attenuate its daylight contribution

VERIFIED commit3c5abd7b3: the four shared additive lamp pools stayed full strength
in daylight and obscured foreground asphalt/curb detail. Writing material.opacity
through the existing peer-derived lighting transaction reduces authored17.6hour
strength to0.12, with a smooth18–20h return to1 and6–8h morning fade. Original
0.95 radial alpha, tint, geometry, depth behavior and shared graph remain intact.
Invalid hours retain original strength; leaving the arena restores it.

Proof:36focusedtests/4files plus tsc/build and nine actual warm captures. Root and
worker independently viewed before/after street pixels: road texture, centre
markings and curb are visible through a restrained warm glow. This is a daylight
improvement verdict, not night visual approval or complete performance acceptance.
No extra material/light/draw/geometry/frame loop was added. Night pixels and all
remaining release gates stay OPEN until their own receipts establish them.

Method provenance for this run: method observed in StarKnightt/morning-diner
(Claude Fable,2026), shared by owner via https://x.com/prasenx/status/2095537643182563778;
re-implemented from first principles. No source/shader/prose copied.

## R-011 — Describe an elevation as openings and a style; never copy a wall's geometry by hand

**Subject:** the house front and the garage front in Nuke Town. **Pass:** HF-536 forge-transfer
lane, 2026-09-11, candidate `79161fd5`. **Files:** `src/forge-kit/facade-elevation.ts`
(`facadeElevationParts`, `facadeElevationFlatParts`, `FACADE_LEAF_*`, `FACADE_SECTIONAL_COURSE_H`),
`src/forge-kit/facade.ts` (`facadeOffset`), `src/nuketown2-arena.ts` (`house()`, `garage()`).

**Method.** One call takes `extent`, `height`, `facing`, `wallThickness`, the `openings` cut through
the wall (`window` with sill and head, `door` with head) and a `style` (siding role, course pitch
and offset, window reveals on or off, door treatment `bare` | `parked-leaf` | `sectional-head`).
It returns groups of parts, one group per prop, composed only from `lapSidingParts`,
`windowRevealParts` and `panelDoorParts` and translated with `facadeOffset`. Anchor at along = 0
and the arena's authored wall coordinates pass through unchanged, so the piers, liners and leaf
that were five hand-placed `facadePair` calls become one data description. The two real
consumers differ only in parameters: the house asks for `siding`, two windows with reveals and a
30 mm trim leaf parked 100 mm east of the doorway; the garage asks for `garageSiding`, one 3.5 m
bay, no reveals and a band of 200 mm `panel` courses over the bay head.

**Contract, pinned by `src/forge-kit/facade-elevation.test.ts` and
`src/nuketown2-facade-elevation-consumers.test.ts`:** deterministic and order-independent; every
part finite, inside the extent, at most `FACADE_MAX_PROUD` proud and never deeper than the wall;
boards only on piers, never across an opening; liners inside their own cut and the wall body;
the leaf beside the doorway, never in it; malformed options throw before any part exists; the
arena's piers keep their colliders and the emitted parts add no collider, shot surface or
ballistic row and use registry materials only.

**Cost:** +0 draws, +0 materials, same part list as the hand-placed version at this SHA (a
behaviour-preserving extraction; it is NOT a visual change and claims no visual upgrade).

**Gotchas.** `panelDoorParts` defaults to a 50 mm leaf whose rails then stand 63 mm proud, past
the parity ceiling; the assembly defaults `leafThickness` to `FACADE_LEAF_T` (30 mm) instead.
A `courseHeight` below `FACADE_BOARD_H` (216 mm) gives overlapping boards because the board
height is a constant, not a fraction of the pitch - this is how the garage head band has always
been authored (200 mm pitch, 216 mm boards), and `nuketown2-garage-door.test.ts` expects 200 mm
there, so that retained test is red at this SHA independent of the extraction (OPEN for root).
The house leaf, parked east of the door, laps the east window's cut by 150 mm in plan; also
pre-existing, left for the owner's eye. Claim states: assembly/tests VERIFIED by focused Vitest and
`tsc --noEmit` in the lane worktree; boot, captures and taste OPEN.
