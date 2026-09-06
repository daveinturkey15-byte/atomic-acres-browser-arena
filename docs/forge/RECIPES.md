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
