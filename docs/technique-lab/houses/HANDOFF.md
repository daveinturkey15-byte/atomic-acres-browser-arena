# Houses lane handoff — wave 3 interior substitution, 2026-09-12

> **Wave 3 summary.** The shells now carry the interior: seven partitions, their nine cased
> openings, the contracted **16-tread** internal stair, the landing guard, the skirting band and
> the stairwell hole cut through the upper slab. Falsifier 5 is retired and falsifier 3 is
> retired; falsifiers 1, 4, 8 and 9 stand, and two new mismatches are recorded below. The wave-1
> and wave-2 sections that follow are unchanged history and still describe what those waves did
> and failed to do. **Still not integrated, not observed in the runtime, not visually accepted.**
>
> | | wave 2 | wave 3 |
> |---|---|---|
> | teal GLB | 5,545,104 B `5f987101…` | **5,670,288 B `0748813fa082fb694978168c55a896124ac4d052237d226cccafc241df7ccd50`** |
> | yellow GLB | 5,519,604 B `eb7afd72…` | **5,644,996 B `bdd2867e05a36266cca8d468fdc56b01168e7eea65ebe29b6a5ee4a91dcc5ee6`** |
> | triangles | 36,360 / 36,528 | **37,944 / 38,112** (budget 40,000, gated) |
> | materials / texture images / texture bytes | 8 / 18 / 2,843,343 / 2,806,733 | **unchanged** |
> | panes / aperture markers / route landmarks | 22 / 26 / 3 | **unchanged** |
> | interior partitions / cased openings / treads | 0 / 0 / 0 | **7 / 9 / 16** |

---

# Wave 3 — what was authored, and what the numbers say

## The change

Wave 2 recorded the interior as falsifier 5 and left it. That made substitution not merely
incomplete but *unsafe*, for a reason worth stating plainly because it is the whole argument for
this wave: `build.ts:310-334` merges the entire procedural house into one mesh per
`(group, material)` pair, so `world-studio-<houseId>-*` **is** the house — exterior, partitions
and stair in the same buffers. There is no partial hide. Hiding it in wave 2 would have deleted
the interior walls and the stair. The GLB either carries the interior or hiding is a regression.

Everything authored is transcribed, never invented. `house_contract.INTERIOR_PARTITIONS`,
`GARAGE_ROOF_THRESHOLD_*`, `STAIR_*` and `STAIR_HOLE` each cite the `house.ts` line they came
from at the same frozen SHA `6e9b2cafd…`.

| Added | From | Result |
|---|---|---|
| 7 interior partitions at 140 mm, split around their openings, with cased architraves | `house.ts:502-650` | `interiorPartitions: 7`, `interiorApertureMarkers: 9`, all marked clear |
| 16-tread stair: treads, nosings, balusters, raked handrail | `house.ts:664-689` | `stairTreads: 16`, every tread top on the contract to 1e-5 |
| Landing guard, guard end and 14 landing balusters | `house.ts:691-697` | present |
| **Stairwell hole cut through the upper slab** | `house.ts:464-497` | wave 2 shipped this as one unbroken box, i.e. a capped shaft over the stair |
| Skirting and picture rail | `house.ts:652-660` | present |
| External stair handrail | `house.ts:787-793` | wave 2 omitted it; it would have vanished on the first hide |
| Garage-roof threshold board | `house.ts:869-873` | same; its local X differs per house and both values are transcribed |

## Measured, not asserted

Every number below comes out of `build-report.json`, which is written by the build that produced
the bytes, and is re-checked by `audit_maps.py` and by `src/world-studio/houses/index.test.ts`.

* **Stair.** All 16 treads re-measured from the built mesh with the runtime's own method: the
  support height a millimetre above each contracted top (`studio-architecture.test.ts:150`).
  `stairTreadProblems: []` on both houses. Rise 0.20125 m, going 0.28125 m, the flight lands
  exactly on 3.30.
* **The runtime's own probes, transcribed.** This is the first direct attack on falsifier 2.
  `RUNTIME_ROUTE_PROBES`, `INTERIOR_ROOM_PROBES` and `STAIRWELL_HEAD_PROBES` are the literal
  coordinates of `studio-architecture.test.ts:96-157` converted into the local frame; 24 of them
  are run against the built opaque solids at every build. `blockedRuntimeProbes: []` on both
  houses, including the stairwell head-height probe that only passes because the slab hole is
  real. This is **agreement, not identity**: those probes query the TypeScript colliders and
  these query the GLB's presentation solids.
* **Glazing.** 22 panes, 22 distinct `atomic_window_id`s, one shared glass material and exactly
  one glass mesh per house — so no pane can be quietly swapped for an opaque stand-in. Each pane
  marker now also carries `atomic_window_bounds`, the exact glass solid it names, and the build
  samples each pane rectangle nine times against every opaque solid: `opaqueBehind: 0` for all 44
  panes. No duplicate, superposed or permanently hidden pane was introduced.
* **Budget.** Triangles +1,584 / +1,584 (+4.4%), which is the entire interior. Materials 8,
  texture images 18 and texture bytes are byte-identical to wave 2. `audit_maps.py` now fails
  above 40,000 triangles or 6,000,000 GLB bytes; nothing was relaxed to fit.
* **Determinism.** The teal build was run twice and reproduced `0748813f…` byte for byte.

## A dead parameter found and fixed

`make_material` accepted `base_rgb` and never used it. The "door" slot has no synthesised map
set, so every front door, both balcony decks and the whole external stair shipped at Blender's
0.8 grey default instead of the `door_rgb` each variant declares — wave 1 and wave 2 both. This
surfaced because the stair treads use that slot. The parameter is now applied, and the builder
raises rather than silently defaulting if any other slot ever arrives without maps. The colour
was already in `VARIANTS`; nothing new was chosen. **This changes the exterior**: teal doors and
decks are now brown `(0.400, 0.235, 0.157)` and yellow's are slate `(0.290, 0.310, 0.345)`.

## Executable evidence — wave 3

* `python scripts/blender/world-studio/houses/run_houses.py --variant all --render` → returncode
  **0**, Blender reporting **`Blender 5.1.2 (hash ec6e62d40fa9)`**, `--background
  --factory-startup --threads 4 --python-exit-code 9`, `cycles.device = "CPU"`. Build 2.3 s per
  house, render 32-34 s per house.
* `python scripts/blender/world-studio/houses/audit_maps.py` → **all checks passed**, 28 census
  checks per house including the 11 new interior ones. Palette and normal-tilt results are
  unchanged from wave 2 to the reported decimal.
* `python scripts/blender/world-studio/houses/write_catalog.py` → 2 assets, revision 3, hashes
  recomputed from the bytes.
* `node node_modules/vitest/vitest.mjs run src/world-studio/houses/index.test.ts
  src/world-studio/architecture/studio-architecture.test.ts
  src/world-studio/blender-assets/index.test.ts` → **50 passed**, 0 failed.
* `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → clean.

## Interior captures — and what they are not

`house-{teal,yellow}-interior-stair.png` and `-interior-living.png`, 512x320 CPU Cycles at 64
samples, rendered from the **re-imported GLB**. The stair frame shows the flight, the nosings,
the balusters, the raked handrail, the stringer face and the stairwell opening above it.

Two honest deviations, both recorded in `catalog.json` as well:

1. **Four interior fill lamps were added.** A closed house lit only by the exterior sun renders
   as noise at any sample count this lane can afford. They are a photographic rig for inspecting
   geometry. They are **not** the project light rig, and nothing about interior lighting, bounce
   or mood may be concluded from these frames.
2. **The stair camera keeps the review point's position `(4.6, 1.7, 7.8)` but is aimed at the
   flight**, not at the published target `(0.6, 2.6, 3.0)`. Aimed as published the frame is a
   ceiling and a slab edge — the first attempt produced exactly that, plus a blown exposure from
   lamps run an order of magnitude hot, and both frames were discarded and re-shot.

## New files in wave 3

```
src/world-studio/houses/index.test.ts                       NEW 26 tests, retires falsifier 3
public/assets/world-studio/blender/houses/house-teal-interior-stair.png    NEW
public/assets/world-studio/blender/houses/house-teal-interior-living.png   NEW
public/assets/world-studio/blender/houses/house-yellow-interior-stair.png  NEW
public/assets/world-studio/blender/houses/house-yellow-interior-living.png NEW
```

`house_contract.py`, `build_house_shell.py`, `audit_maps.py`, `write_catalog.py`,
`render_thumbnails.py`, `src/world-studio/houses/index.ts`, both GLBs, both build reports and
`catalog.json` were modified. `arena.ts`, `assets.manifest.json`, the registry, shared config,
the architecture sources and every other lane were **not** touched. No commit was made.

## Partition substitution plan for root

This is the section wave 2 could not write. It is a plan, not an acceptance: step 0 is still
falsifier 1.

**0. Capture first.** Load additively, capture from the existing review cameras in the runtime,
and compare against the procedural frame. Nothing below is authorised before that frame exists.

**1. What may be hidden after a passing audit.** For a house whose `audit.passed === true`,
`proceduralPartitionNodes(architectureRoot, houseId)` returns exactly the merged meshes named
`world-studio-<houseId>-*`. All of them may be set `visible = false` **together**. Per-part
hiding is impossible: the merge is by `(group, material)`, so these meshes each span exterior and
interior geometry. Set `visible = false` only; never remove or dispose, so rollback costs one
boolean.

**2. What must stay visible, unconditionally.**
   * `world-studio-interiors-*` — the procedural furniture root. It is a different partition,
     it is merged by material role with no per-house split, and **none of it is in these GLBs**.
     The `world-studio.interiors.all` fallback in the visual contract still applies.
   * The other house's nodes, if its own audit failed. Hide per house, never globally.
   * Everything, for any house where `ready` is still pending or `passed === false`.

**3. What must remain visible until runtime review, even on a pass.** Nothing structural is now
missing from the GLB, but three things are *approximations* rather than transcriptions and should
be eyeballed in the runtime frame before the procedural version is considered replaced:
   * **Baluster counts.** The GLB spaces balusters by a 0.13 m while-loop; the TypeScript uses
     bounded `for` loops. Counts may differ by one at the ends of each run.
   * **Interior surfacing.** Every partition, lining, skirting and architrave is the `trim`
     material. The TypeScript uses `accent` for `p-spine` and `q-bedroom` and `interior-wall`
     elsewhere, so the two-tone interior of the procedural house is currently one tone.
   * **Stair treads are wood (`door`), not the procedural `floor-soft` carpet.**

**4. Still owned by root and deliberately untouched:** `arena.ts` wiring, the central catalog,
`assets.manifest.json`, the registry, and the browser capture.

## Remaining mismatches and falsifiers after wave 3

Numbering continues from the wave-2 list below; **1, 4, 8 and 9 stand unchanged**, 3 and 5 are
retired, 2 is narrowed, and 10-12 are new.

* **2 (narrowed, not closed).** 24 runtime probe coordinates are now transcribed and re-checked
  at every build, and both houses pass all of them. What is still unproven is that the GLB's
  opaque presentation solids and the TypeScript collider set are the *same* set — only that both
  are clear at the same 24 points. The falsifier stands: run the real probes against a build with
  the shells visible and the procedural house hidden.
* **3 — RETIRED.** `src/world-studio/houses/index.test.ts` exists and executes: 26 tests covering
  the GLB's declared contract, bounds, apertures, partitions, treads, pane identity and budget,
  plus the loader's URL resolution, early-`ready` behaviour, repeated dispose, dispose-before-load
  and variant filter. It states its own limits: no WebGL context, so no render and no draw call,
  and `loadAsync` is exercised on its rejection path rather than against `file://`.
* **5 — RETIRED.** The interior is in both GLBs and is gated in three places: the build's own
  self-audit, `audit_maps.py`, and `auditShell`, which now fails a house that is missing its
  partitions, its cased openings or any of its 16 treads.
* **10 (new). The interior is one tone.** See substitution plan step 3. The material roster has
  no `accent`/`interior-wall` split, so the procedural two-tone interior is flattened. Adding it
  would cost one more material slot and one more texture set, which is why it was not done
  silently.
* **11 (new). The garage-roof threshold board is not mirror-symmetric.** `garageRoofDoorX` in
  `house.ts:861` weights the open half three-to-one toward the larger *world* X, so teal lands at
  local −2.65 and yellow at −3.45. Both are transcribed rather than averaged, which means the two
  GLBs are **not** exact mirrors of each other at that one board. If root prefers symmetry, that
  is a TypeScript decision, not a presentation one.
* **12 (new). The interior frames use an added fill rig.** See *Interior captures* above. They
  prove geometry, not lighting.

---

# Wave 2 — refinement, 2026-09-12 (unchanged history)

Lane `houses-night-20260912` · harness `claude` · model `claude-opus-5` · effort `xhigh` ·
machine `dave-gaming-pc` · worktree `C:/Users/david/projects/worktrees/aa-houses-night-20260912`
· branch `contrib/dave-gaming-pc/claude/houses-night-20260912` · frozen source anchor
`6e9b2cafd318ca2b2f67f9eedcf8d624fee30453` (unchanged; **no commit was made** — the scoped diff
is left uncommitted for root integration, as instructed).

Outcome row: **NIGHT-05, wave 2**. Status: both shells re-authored, re-exported, re-audited and
re-rendered against the independent evaluator's own camera recipe. **Still not integrated, not
observed in the runtime, not visually accepted.** The arena was not wired and `arena.ts` was not
touched.

## What wave 2 was asked to fix, and what the pixels now say

Four defects were named. Each row below is a measurement, not an impression — the commands that
produce the numbers are in *Executable evidence* and every one of them was re-run after the last
edit.

| Named defect | Evidence it existed | What changed | Evidence it is fixed |
|---|---|---|---|
| Overly strong trim bump ("popcorn/stucco") | `house-teal-close.png`, `house-yellow-close.png` | `painted_trim` height rebuilt: the 4-8 px noise that drove the normal is gone, replaced by low-frequency board waviness plus a vertical brush; Sobel strength 0.45 → 0.035 | mean tangent tilt **0.13° / 0.07°** (ceiling 3.0°), and the trim reads as smooth painted board in the re-shot close frame |
| Flat roof treatment | `house-*-front.png`: roof is a featureless near-black plane | shingle albedo solved back to the concept's measured roof plane; per-tab tone ±7% → ±10%; normal strength 2.2 → 0.62 | shipped albedo mean **(137.1,143.0,129.2)** vs concept **(137,143,129)**, mean dE **0.1** (yellow 1.9); courses and tabs now visible in the re-shot front frame |
| Shallow depth / silhouette | front frame reads as a flat card | every projecting trim depth raised, **zero triangles added**: window casing 55→78 mm, sill 120→155 mm, drip 100→135 mm, watertable 75→98 mm, beltcourse 58→82 mm, frieze 52→80 mm, corner boards 55→75 mm, rake boards 280×140→360×210 mm | triangles unchanged at 36,360 / 36,528; shadow lines under every band and casing in the re-shot front and grazing frames |
| Visible artifacts (sparkle/fireflies on hard edges) | silver glints on the shingle eave and a vertical metal strip | shingle, masonry, concrete and metal normal strengths cut; metal brush lattice 128→48 cells; metallic 0.85 → 0.25 (these are powder-coated gutters, not bare aluminium) | **isolated fireflies 93/322/79/329 → 0/0/0/0** across the four close and grazing frames |

Two further changes were made because the same comparison exposed them:

* **Siding palette and finish.** Wave 1's teal was ~30 counts hot in green and the yellow sat a
  whole step toward olive. Both were re-solved from the concept (below). Roughness base
  0.62 → 0.80 — flat exterior house paint, not the semi-gloss that made the wall read plastic.
* **Glazing.** A near-white pane at alpha 0.28 is mostly whatever is behind it, which is why
  every window read as a white board with muntins. Now a darker blue-grey film at alpha 0.42,
  which is what glazing seen from outside actually does. This does **not** claim a reflection;
  see falsifier 4.

### Where the palette numbers come from

Not taste. The owner concept `codex-clipboard-5e010137` was masked per house by hue/saturation
and measured in sRGB: teal siding lit **(77,127,119)**, yellow siding lit **(169,134,66)**, roof
plane **(137,143,129)**, white trim on the teal house **(226,222,210)**. The concept renders a
sunlit white at ~0.96 of its own albedo, so a lit reading is very close to albedo, and the
siding/trim linear ratio pins the level independently of exposure. The generators average
`0.4*base + 0.6*shade`, so each pair in `house_contract.VARIANTS` is solved to land the
*effective* albedo on the measured target. Verified on the shipped maps, not on a render:

| | shipped albedo mean | concept target | mean dE |
|---|---|---|---|
| teal siding | (84.1, 133.9, 128.7) | (77, 127, 119) | 7.9 |
| teal shingle | (137.1, 143.0, 129.2) | (137, 143, 129) | 0.1 |
| yellow siding | (177.8, 142.2, 75.3) | (169, 134, 66) | 8.8 |
| yellow shingle | (138.9, 141.3, 126.9) | (137, 143, 129) | 1.9 |

Comparing a render against the concept directly was tried and **abandoned as unsound**: the two
were lit by different rigs, so the difference conflates palette with exposure. Comparing the
shipped albedo texels is lighting-independent, and it is what the gate now checks.

## Files changed in wave 2

```
scripts/blender/world-studio/houses/house_textures.py     all six generators retuned (see table above)
scripts/blender/world-studio/houses/house_contract.py     VARIANTS palette re-solved from the concept
scripts/blender/world-studio/houses/build_house_shell.py  trim projection depths, glass, metallic
scripts/blender/world-studio/houses/render_thumbnails.py  NEW --review: the evaluator's 3-view recipe
scripts/blender/world-studio/houses/run_houses.py         NEW --review / --skip-build
scripts/blender/world-studio/houses/audit_maps.py         NEW mechanical gate (palette, normals, census)

public/assets/world-studio/blender/houses/house-teal-shell.glb     5,545,104 B  sha256 5f987101ab0f2500361ddef79ab4526c5f23ecb48387456f3b282a8fce826c09
public/assets/world-studio/blender/houses/house-yellow-shell.glb   5,519,604 B  sha256 eb7afd7299cad8e367f1d84bea0865541e4dbf07b602927a080ec16738028b25
public/assets/world-studio/blender/houses/house-teal-street.png    209,399 B    re-rendered 512x320
public/assets/world-studio/blender/houses/house-teal-backyard.png  213,093 B
public/assets/world-studio/blender/houses/house-yellow-street.png  207,159 B
public/assets/world-studio/blender/houses/house-yellow-backyard.png 227,834 B
public/assets/world-studio/blender/houses/catalog.json             regenerated from the new build reports

source-assets/world-studio/houses/{teal,yellow}/textures/*.png     18 PBR maps per house, regenerated
source-assets/world-studio/houses/{teal,yellow}/build-report.json  regenerated census and measurements
source-assets/world-studio/houses/{teal,yellow}/review/*.png       NEW 6 wave-2-recipe frames, 960x600, 128 spp

docs/technique-lab/houses/HANDOFF.md                      this file
docs/technique-lab/houses/SKILL_USE_RECEIPT.md            wave-2 techniques and what is still unvalidated
```

`src/world-studio/houses/index.ts` was **not** touched in wave 2 — no loader behaviour changed,
only the asset it loads. `arena.ts`, `assets.manifest.json`, the registry, shared config and
every other lane were untouched.

## Executable evidence

A script on disk is not evidence that Blender ran. Quoted from the runs:

* Executable `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`, process-reported
  version **`Blender 5.1.2 (hash ec6e62d40fa9)`**, `--background --factory-startup --threads 4
  --python-exit-code 9`, `scene.cycles.device = "CPU"`. No GPU, no browser, no server.
* `python scripts/blender/world-studio/houses/run_houses.py --variant all --render --review`
  → returncode **0** on all six invocations. Build 2.3-2.4 s per house, thumbnails 3.5-3.8 s,
  review pass 81-89 s per house.
* `python scripts/blender/world-studio/houses/write_catalog.py` → 2 assets, hashes as above.
* **Determinism re-verified after every change.** A final independent `--variant all` run
  reproduced `5f987101…` and `eb7afd72…` byte for byte.

### Aperture audit — mechanically green

`apertureMismatches: []` in both build reports, i.e. **26/26 declared apertures per house pass
the 9-sample clearance audit**, re-measured from the built mesh before each export. `audit_maps.py`
re-reads both reports and fails if either list is non-empty. The wave-2 geometry changes were
chosen so they *cannot* touch an aperture: every raised depth projects outboard along the wall
normal, and the casing/sill/drip boxes all sit outside the declared void in `u` or below/above it
in `y`. Route landmarks 3/3 and `roadClearanceOk: true` on both houses. A slider is still audited
on its clear half only, which is correct — one leaf is legitimately glazed.

### Budget census — held

| Measure | Teal wave 1 → wave 2 | Yellow wave 1 → wave 2 |
|---|---|---|
| Triangles | 36,360 → **36,360** | 36,528 → **36,528** |
| Materials / draw groups | 8 / 8 → **8 / 8** | 8 / 8 → **8 / 8** |
| Texture images | 18 → **18** | 18 → **18** |
| Texture bytes | 3,490,376 → **2,843,343** | 3,466,744 → **2,806,733** |
| GLB bytes | 6,196,280 → **5,545,104** | 6,184,276 → **5,519,604** |
| Glass panes | 22 → **22** | 22 → **22** |
| Aperture markers | 26 → **26** | 26 → **26** |
| Route landmarks | 3 → **3** | 3 → **3** |

Not one triangle, material or texture slot was added; the GLB got ~10% *smaller* because the
calmer normal maps compress better. CPU-only policy held throughout.

### The gate, and one thing I had to fix in it

`audit_maps.py` is new and is the reason the claims above are checkable. It measures palette
against the concept, mean tangent-normal tilt against a per-material ceiling, and the full
contract census, and **exits non-zero on any failure**. Final run: **all checks passed** for both
houses.

It caught me out once, and the correction is worth recording because the first version was
measuring the wrong thing. I originally derived tilt from the normal map's **Z** channel. An
8-bit Z is hopeless near flat: the entire 0-13° band lives between codes 254 and 255, and since
`write_png` truncates, a dead-flat normal encodes Z=254 and `acos(254/127.5 - 1)` is **exactly
7.18°**. The trim map sat at precisely 7.18° at strength 0.09 *and* at 0.035 — a value that will
not move is a broken instrument, not a stubborn asset. The metric now reads X and Y, which sit
near code 127 where one code is 1/127.5 of range, giving a quantisation floor near 0.45°. The
per-material ceilings were **not** relaxed to accommodate this; they were re-stated as physical
claims about each material and then three materials were brought *under* them by retuning
(siding 10.18→7.92°, metal 3.66→2.75°, shingle 13.39→10.98°).

### Sparkle / firefly census — the wave-2 falsifier, retired

Re-shot at **128 spp, denoising off** (a denoiser would erase the very defect under test), at the
evaluator's exact camera positions — reproduced to the millimetre, e.g. teal front
`(-0.195, -47.326, 13.448)`. Hot pixels (luminance > 250) classified as *isolated* (≥5 of 8
neighbours below 200 — a firefly) or *contiguous* (a genuinely blown highlight):

| Frame | wave 2 isolated | wave 3 isolated | wave 2 contiguous | wave 3 contiguous |
|---|---|---|---|---|
| teal close | 93 | **0** | 2,291 | 649 |
| teal grazing-contact | 322 | **0** | 572 | 12 |
| yellow close | 79 | **0** | 10,313 | 5,616 |
| yellow grazing-contact | 329 | **0** | 4,264 | 341 |
| teal front | 0 | 0 | 631 | 663 |
| yellow front | 0 | 1 | 2,332 | 2,507 |

The glints were a material defect, not a sampling artefact: they are gone at *higher* sample
count. The two front frames gained a few contiguous hot pixels, which is the expected and
intended consequence of a roof that is no longer near-black.

## Refinements considered and **reverted**

* **Shingle albedo hedged at 85% of the measured concept value.** Shipped in the first refined
  export, then reverted: the audit measured it 23 counts short of the concept and the honest
  move was to drop the hedge rather than widen the tolerance to accept it. Final value is solved
  back from that measurement and lands at dE 0.1.
* **Bounds-centre aim point including the review ground plane.** The first review pass aimed at
  `(0, 0, 4.5)` instead of the evaluator's `(-0.195, -5.23, 4.5)`, because the 220 m ground plane
  is a mesh and was inside the bounds. Those six frames were discarded and re-shot; a mis-framed
  capture cannot support an A/B claim. The `W2_` filter in `_imported_bounds_centre` is the fix.

## Unresolved falsifiers

*(Wave-2 state, kept as written. Superseded by the wave-3 list above: 3 and 5 are now retired
and 2 is narrowed. Where this section and the wave-3 section disagree, the wave-3 section is
current.)*

Wave 1's list, updated. **1, 2, 3, 4 and 8 are what root must still close.**

1. **No runtime capture exists.** Still true and still the most important gap. The six review
   frames are Blender renders of the exported GLB under the evaluator's *test* world, not the
   asset inside the world-studio arena under the project light rig. `ai-3d-asset-generation-loop`
   names this exact failure mode. Root must capture from the existing review cameras before any
   acceptance.
2. **Aperture audit is self-referential.** It measures this lane's own opaque-solid list, not the
   runtime probes in `studio-architecture.test.ts:96-115`. Agreement is plausible and now
   mechanically re-checked every build, but still unproven against the runtime. Falsifier: run
   those probes against a build with the shells visible.
3. **No focused Vitest file for the loader.** Unchanged from wave 1 — `createStudioHouseShells`
   has no executing test for its dispose-races-load path, its audit pass/fail branch or
   `proceduralPartitionNodes`. Wave 2 changed no loader code, so this neither grew nor shrank.
4. **Glass and metal env response is still unproven.** The evaluator's env-variant pair was *not*
   run: this lane's review world is the uniform test world, which cannot produce a reflection, so
   nothing here distinguishes "reflective" from "painted". The pane is now a darker film, which
   is a *shading* improvement and is not a reflection claim. Falsifier stands: render with and
   without a PMREM env and require the metals to visibly degrade without it.
5. **Interior shell is minimal.** Unchanged. Interior partitions and the internal stair are still
   not in the GLB. **Do not hide the full procedural partition** — see *Needed root wiring*.
6. **Scale/contact gate is measured against the contract, not a player capsule.** Unchanged.
   Ground contact at local Y = 0; min Y = −0.42 is the buried foundation and driveway apron.
7. **`atomic_collision_bounds` structural owners were not emitted.** Unchanged: 0 `collision`
   markers, by design, only window, aperture and route markers.
8. **Texture tiles are still 512 px** (trim and metal 256 px). The refinement prompt asked for
   1024 px tiles with a second de-tiling UV offset; that was **not** done, and the tile repeat is
   still visible at an interior or porch-close camera. It was traded against the defects with
   higher visual cost, and it would have roughly quadrupled texture bytes. This is the clearest
   remaining item and is honestly open.
9. **Contact darkening at the stoop is still absent** — the wave-2 note about a hard intersection
   with no AO is unaddressed. This is a property of the test world's flat ground rather than of
   the asset, but it is unproven either way until falsifier 1 is closed.

## Needed root wiring

*(Wave-2 state. **Item 3 below is now obsolete** — the interior exists, so substitution is no
longer deferred. Follow *Partition substitution plan for root* in the wave-3 section instead.)*

Unchanged from wave 1 and repeated because none of it was done here:

1. Nothing in `src/world-studio/arena.ts` imports this loader. Root owns that wire-up.
2. `createStudioHouseShells()` → `arenaRoot.add(houses.root)` → `await houses.ready` → inspect
   `houses.audits` → hide **only** partitions whose `passed === true`, via
   `proceduralPartitionNodes(architectureRoot, houseId)`. Never hide on `ready` alone, never hide
   globally, and leave a failed house's procedural presentation visible.
3. **Because of falsifier 5, the honest first integration is additive-with-substitution
   deferred.** Hiding the whole partition today removes the interior walls and the stair: that is
   a regression, not an upgrade.
4. `catalog.json` is lane-local by design; root synthesises the central catalog.
5. `assets.manifest.json` and the registry are root-owned and were deliberately not edited.

## Next best improvement, in priority order

*(Wave-2 list. Items 1 and 3 were done in wave 3; the rest still stand, re-ordered below.)*

1. ~~Author the interior shell partitions and the 16-tread internal stair into the GLB.~~ **Done
   in wave 3**, retiring falsifier 5.
2. **1024 px siding/ashlar tiles plus a second de-tiling UV offset** — retires falsifier 8, and
   it matters more now that there are interior cameras that see the tile repeat at close range.
3. ~~`src/world-studio/houses/index.test.ts`~~ **Done in wave 3**, retiring falsifier 3.
4. A second interior material so the procedural `accent` / `interior-wall` two-tone survives
   substitution (wave-3 falsifier 10).
5. Emit `collision-visual-owner` markers with `atomic_collision_bounds` (falsifier 7).
6. An env-variant render pair to settle falsifier 4.

## Permissions and limits encountered

* `powercfg` remains unreachable from this session, so **the machine bootstrap's High-performance
  power-plan check could not be completed** and the plan state is unverified for this run. Nothing
  was bypassed.
* Several ad-hoc `python - <<'PY'` analysis heredocs were denied by the don't-ask permission mode,
  non-deterministically. That is why the analysis lives in `audit_maps.py` — which is the better
  outcome anyway, since the gate is now re-runnable rather than a throwaway.
* No commit, push, merge or deploy. No nested agents, no new provider calls. No global config or
  shared skill was modified. `arena.ts` untouched; no other lane touched.
