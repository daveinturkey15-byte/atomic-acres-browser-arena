# RAID Rebuild (`raid2`) — the proper plan

**Lane:** RAID (research + skeleton only; **no arena code was written or changed by this lane**).
**Author:** Opus research agent, 2026-09-04. **Worktree:** `C:/Users/david/projects/aa-claude-research`.
**Ledger rows:** HF-408, HF-427, HF-440, HF-455, HF-456, HF-461 (as a precedent), HF-462/468 (asset forge), HF-467 (penetration).
**Depends on:** the `photoreal-procedural-scene-forge` skill (materials/lighting/vehicle method — now installed; supersedes `R1-diner-method-skill-draft.md` as the operative source), `R2-reference-grounded-loop-design.md` (provenance + critic loop), `R3-material-penetration-design.md` (penetration classes), `R4-bo2-nuketown-accuracy.md` (the precedent that worked), plus `visual-gauntlet-loop` (loop contract), `open-world-city-art-loop` (cell decomposition), `threejs-webgpu-water`, `threejs-webgpu-interior-lighting-look`, `webgpu-tsl-arena-forging`.

**Claim-state key.** `VERIFIED` = I read the file or ran the command in this session and quote what it said. `CLAIMED` = another agent's report or an external source says it and I did not re-derive it. `OPEN` = unknown, and named as unknown.

**Originality boundary.** Nothing in this plan copies geometry, texture, text or trade dress from any external source. Where an external artefact is described, it is described in this lane's own words, and every number that ends up in the arena is a *measurement* or a *ratio*, never a reproduction. §2 makes that boundary enforceable rather than aspirational.

---

## 1. What the owner actually asked for, and what "detail" means as a number

**VERIFIED, ledger HF-427 (owner 2026-09-03 ~06:50, verbatim):**

> "Raid layout feels better but is missing all the nice detail you had in the old version, get the same level of detail to the new layout and then enhance it to be closer to the original map in lighthing texture and asset style too, ideally with just code and our new skills techniques. There are also some issues with the raid map layout not being true and accurate so you need to do better research there too."

**VERIFIED, HF-440 (owner 2026-09-03 17:30):** "put raid rebuild to one side and polish up nuketown … raid can come next." So this lane is *queued behind* the Nuke Town tip-top work and starts when the orchestrator releases it.

That sentence contains three separable deliverables, and the plan below keeps them separable because they have different failure modes:

| # | Deliverable | Failure mode it has already had |
|---|---|---|
| A | **Detail parity** with the shipped Raid, on the new layout | The last attempt authored the detail and 25 of its headline meshes landed at NaN and were silently dropped (§3) |
| B | **Layout accuracy** to the real Black Ops 2 Raid | The last attempt's zone measurements do not reproduce, and three of its citations do not show what it says they show (§3) |
| C | **Look** — lighting, texture, asset style closer to the original, code only | Never attempted on `raid2`; the arena is still the layout lane's flat first pass |

### 1.1 The detail gap, measured

**VERIFIED — the shipped Raid (`test2`).** `src/test-maps-art.ts` (1,453 lines) gives `test2`:

- **six forged PBR surface sets** via `test2Materials()` → `forgeSurface('test2-travertine' | 'test2-stucco' | 'test2-hedge' | 'test2-pool-tile' | 'test2-court' | 'test2-timber')`. Each yields albedo + Sobel tangent **normal** + roughness + AO from one authored height/colour function, plus a shared two-scale micro/macro detail layer at fixed physical size. Measured bake budget in the file header: `test2Materials() 666 / 630 ms` for six sets plus both shared tiles (~102 ms/set), against a ~1.2 s boot ceiling.
- **an environment kit pass**: deterministic instanced vegetation (broadleaf / conifer / shrub / dry-scrub / litter, Poisson with inter-layer clearance, position-hashed variation, two build-time LOD tiers, contact skirts), a displaced ridgeline ring (`test2-ridge-ring`), and a single 190 × 1.6 × 176 m hillside slab whose top sits at −1.60 m so it can never cap a cutout.
- **~70 authored dressing meshes**, counted from the source: 4 umbrellas (pole + cone canopy = 8), 2 pool ladders × 2 rails (4), 1 towel stack, 5 jittered loungers, 8 court-line quads + 1 torus centre circle, 2 hoop assemblies × (pole + glass board + torus rim) (6), a drive gravel apron + 4 beds + 2 urns + 2 icosahedron urn shrubs (9), 9 pilasters + 4 window bays + 1 cornice + 6 garage lintels (20), and 9 `test2-contact-grime` patches grounding the heavy masses.
- **five geometry families**: box, cylinder, cone, torus, icosahedron.

**VERIFIED — the rebuild (`raid2`).** `src/raid2-arena.ts` (843 lines) has **79 `rect()` calls and zero other geometry call sites**; `docs/raid-rebuild/ASSET_INVENTORY.md` states it plainly: *"`raid2` is 218 axis-aligned boxes and ten `MeshStandardMaterial`s"*, and *"Every visible mesh is a `THREE.BoxGeometry` emitted by one `rect()` helper — there is exactly one geometry call site."* `raid2Materials()` returns ten flat `standard()` materials with **no map, no normal, no roughness map, no AO**. There is no dressing group, no vegetation, no ridge ring, no contact grime; the only presentation-only element is the out-of-bounds hillside skirt.

**So the detail gap, as numbers a gate can hold:**

| Metric | shipped Raid | `raid2` today | target |
|---|---|---|---|
| Forged surface sets (albedo + normal + roughness + AO) | 6 | **0** | 8 (§6.1) |
| Materials carrying a normal map | 6 of 8 | **0 of 10** | ≥ 8 |
| Geometry families | 5 | **1** | ≥ 5 |
| Authored dressing meshes | ~70 | **0** | ≥ 70, none of them ghost cover |
| Instanced vegetation layers | 5 | **0** | ≥ 4, all outside the boundary or authored as real colliders |
| Contact-grounding decals | 9 | **0** | one merged multiply-blended mesh (§6.4) |

This table is the acceptance test for deliverable A. "Same level of detail" is now falsifiable.

---

## 2. Reference plan — sources, tiers, and the provenance policy

The policy is R2 §3.2's source ladder, applied to Raid. It exists because HF-426 caught a research pass citing four URLs that did not resolve, and because this repository's own rule (**VERIFIED**, memory `feedback-gemini-flash-task-fit`, owner 2026-09-03 12:55) is that a Flash-class model never gathers references.

### 2.1 The ladder, as it applies here

| Tier | For Raid | How it may be used |
|---|---|---|
| **T1 — first-party artefact** | The BO2 in-game minimap and the publisher's own in-game stills of Raid (Treyarch art, obtained from the wiki's static image host) | **Measurable for layout, proportion and topology only.** Converted to ratios. **Never** placed in front of a critic as "make it look like this." |
| **T2 — own capture** | The shipped Raid's approved frames (`docs/evidence/pass85/lane-aq/judgeset/*.png`, **VERIFIED — 10 files exist**), and any photograph Dave takes himself | Measurable and showable. Preferred for *look*: no licence question at all. |
| **T3 — permissive third party** | CC0/CC-BY photographs of the **real-world subjects**: a modernist hillside villa in travertine/stucco/glass, an outdoor acrylic hard court, a residential pool with coping and a spa, a gravel roundabout with clipped hedge, an open garage forecourt, cypress/olive/bougainvillea planting | Measurable and showable, with the licence line recorded |
| **T4 — reported** | Written tactical guides (callouts, flag positions, sightline prose) | **Corroboration only.** Never the sole basis for a number; never shown to a critic |
| **REJECTED** | Anything whose licence is UNKNOWN; anything whose URL does not resolve; a commercial game frame used as the *visual target* | Not a reference |

**The distinction this lane must hold sharp, restated because it is the whole originality argument:**

> **Measure the T1 game artefacts for geometry and proportion. Never hand a commercial game's art to a critic as the look target.** For look, the bar is a T2/T3 photograph of the real-world thing, or our own approved shipped-Raid frames.

That is what makes the arena reference-grounded *and* original: layout from measurement, surface look from photographs of the real world and our own art, and neither is a copy.

### 2.2 The T1 measurement set

**CLAIMED (GLM pre-check, `docs/raid-rebuild/GLM_PRECHECK_2026-09-03.md`, which I read this session but whose fetches I did not re-run):** all fifteen URLs cited by the previous pass resolve, and 13 of 15 byte counts reproduce exactly on an independent GET. That is a genuinely good provenance receipt and it is the one part of the previous lane worth carrying forward — **as a fetch manifest, not as a schematic**.

The set to re-fetch at the start of the lane (each with status, bytes, served content-type, sha256, pixel dimensions recorded at fetch time, per R2 §3.3):

| id | What | Tier | Use |
|---|---|---|---|
| S1 | Raid minimap, 512 × 512 RGBA, first-party | T1 | **Primary geometry ground truth.** Ratios only |
| S2 | Raid aerial view still | T1 | Cross-check on roofline extents, courtyard open-to-sky, drive circle |
| S3 | Basketball court still | T1 | Court markings, hoop standards, retaining steps, **surface colour** |
| S4 | Compound entrance still | T1 | Roundabout, stepped plinth + ribbon sculpture, block ring, **vehicle roster** |
| S5 | Courtyard still | T1 | Courtyard planting, boulders, planter runs (**not** a fountain — see §3.2) |
| S6 | Scenic veranda still | T1 | Pool, round spa, juice-bar pavilion, loungers, balustrade |
| S7 | FBI spawn / garage still | T1 | Garage bays, roller doors, solar roof, forecourt vehicles |
| S8 | Mercs spawn still | T1 | Garden apron: lawn, rock outcrops, retaining planters, steps |
| S9 | Load screen art | T1 | **Time of day** and value composition (see §3.2 — it is midday, not golden hour) |
| S10 | Wiki article wikitext | T4 | Faction names, callouts, the note that one car does not spawn in objective modes |
| S11 | Tactical guide text | T4 | Flag positions, sightline prose, power-position claims |

**Rejected outright:** the `callofdutymaps.com` page (403 behind a WAF; the previous pass correctly excluded it, and **CLAIMED** the 403 body is 5,439 bytes, not the 0 the schematic recorded). Also rejected: the "callout map" JPEG cited by the previous pass — **CLAIMED (GLM D3)** it is a Create-a-Class loadout screenshot, not a callout map.

### 2.3 The T3 look set — what a critic is actually shown

Six reference pairs, one per estate cell that has a strong real-world analogue. This is the set that closes deliverable C, and it is **not** derived from the game:

| Subject | What to gather | `criticTargets` |
|---|---|---|
| `raid2-travertine-paving` | 2–3 CC-licensed photos of large-format travertine/limestone paving in direct sun, at grazing and at plan angle | yes |
| `raid2-stucco-wall` | 2–3 photos of a modernist rendered wall, sunlit face + shaded return, with a real edge radius visible | yes |
| `raid2-hard-court` | 2–3 photos of an outdoor acrylic sports court: surface grain, line paint edge, post pad, fence | yes |
| `raid2-pool-and-spa` | 2–3 photos of a residential pool: mosaic tile, coping bullnose, waterline, a circular spa, water colour by depth | yes |
| `raid2-drive-and-gravel` | 2–3 photos of a gravel/aggregate drive island with clipped hedge and kerb | yes |
| `raid2-estate-vehicle` | Per R1 §3: 3 views of one real vehicle (three-quarter front, true side elevation for pixel proportion, three-quarter rear) + a dimensioned drawing if one resolves | yes |

Plus one T2 pair per cell: the shipped Raid's own approved judgeset frame for the equivalent zone, so "same level of detail as the old version" is literally scored against the old version.

### 2.4 What needs an owner screenshot — OPEN

These cannot be settled by reading, and I mark them OPEN rather than filling them in:

1. **OPEN — absolute scale.** No public source gives Raid in metres. HF-426 hit the identical wall on Nuketown and resolved it by declaring absolute scale an **ANCHOR**: one constant, chosen once, rescaling everything. `raid2` already anchors at 100 × 76 m and the aspect reproduces the measured 1.311 to 0.4 % (**VERIFIED**, `SPATIAL_PLAN.md` §2.1). **Recommendation: do not re-litigate the anchor.** Record it as an anchor and move on.
2. **OPEN — the garage's true depth.** The build's garage spans 28 m in z (`x 34..50, z −16..+12`, **VERIFIED** in `raid2-arena.ts`); **CLAIMED (GLM O2)** the minimap's garage mass measures ~10.7 m. Either the build is ~2.6× too deep or the minimap mass is roof-only. Moving the garage moves team 1's spawns, and HF-402's scar is exactly that (the shipped map's garage was unreachable and spawns had to be moved into the house). **Needs S2 + S7 read together, and an owner screenshot if they disagree.**
3. **OPEN — the south garden pond.** **CLAIMED (GLM O3)**: a Ø ≈ 7.5 m water feature is visible on the minimap near the Mercs garden and exists in neither the schematic nor the build. Confirm on S2/S8 before adding; a water feature in a spawn apron changes spawn routes.
4. **OPEN — court surface colour.** **CLAIMED (GLM D8)**: the reference court is **blue**; `raid2` paints it `0x386b63` (teal-green) and the previous schematic wrote "dark athletic green/teal". Blue must be checked against fidelity band 22 (no cover family darker than the floor) before it is adopted — see §7.3.
5. **OPEN — the vehicle roster.** **CLAIMED (GLM D9)**: the fetched stills show a black van, a white van, a yellow coupe, an orange coupe inside a garage bay and a blue car; **no red coupe appears in any fetched frame**, though the previous schematic asserted one. A screenshot settles it.
6. **OPEN — mirror/handedness.** HF-461 caught the Nuke Town rebuild possibly mirrored ("almost like you've created the mirror of the map"). `raid2`'s topology agrees with the reference mapping (**VERIFIED**: pool and court at −Z, garage at +X, drive at +Z), but topology agreeing is not handedness verified. §4.4 makes this an explicit falsifier rather than an assumption.

**Policy note on owner screenshots:** a screenshot Dave takes of the retail game is still commercial art. It enters at **T1 — measurable, never a critic look-target**, exactly like the minimap.

---

## 3. The Gemini branch `raid2-detail-accuracy` — what to salvage, what to bin

**VERIFIED (`git show --stat`, this session):** the branch is three commits over the PASS-89 integration head — `a0eaac1f` (Job 1: `REFERENCE_SCHEMATIC.md`, 215 lines), `eac254e7` (Job 2: dressing, procedural vehicles, sports court), `97015e66` (the GLM pre-check report).

### 3.1 The blocking defect

**CLAIMED (GLM §5, with a re-runnable method):**

- `npx tsc --noEmit` at `eac254e7` exits **2**: `TS2459: Module '"./raid2-arena"' declares 'COURT_Y' / 'HARD_COVER' / 'MOUNT' / 'POOL_FLOOR_Y' / 'UPPER_FLOOR_Y' / 'WALL_TOP' locally, but it is not exported` (×6, `src/raid2-dressing.ts:15`).
- **VERIFIED by me** that this is plausible at the source: `raid2-arena.ts` declares `UPPER_FLOOR_Y`, `WALL_TOP`, `HARD_COVER`, `MOUNT`, `COURT_Y`, `POOL_FLOOR_Y` as module-private `const`; only `STEP`, `STAIR_RISERS`, `STAIR_RUN` (and the frozen tables) are exported.
- Runtime consequence: under esbuild/tsx there is no type check, so `undefined + number = NaN`, and **25 dressing meshes carry NaN world matrices** — 8 court lines, 8 hoop meshes, the courtyard statue, the drive helix, the kitchen island top, 2 bed pieces, 4 cornices. `Box3.setFromObject` returns NaN and **the parity audit silently drops them**.

So the branch's headline detail work — the hoops, the painted court lines, the sculpture, the cornices — **does not exist at its authored positions**, and the lane's own gate list cannot have been green.

### 3.2 The research defects

**CLAIMED (GLM §1, §3, §6), each with a stated method:**

| id | Defect |
|---|---|
| D3 | The "callout map" citation is a loadout screenshot |
| D4 | The courtyard still shows a tree, boulders and planter runs — **no fountain, no bronze statue, no four colonnade pillars**. The schematic's Fact 3 attributes the roundabout's fountain to it |
| D5 | The load screen is bright **midday**, not the "sunset/golden hour" the schematic claims |
| D6 | The schematic's minimap zone boxes do not reproduce: the court box is ~2× the measured court and its centre misses its own tolerance by > 10 m; the garage box is ~3× the garage mass; the U1 box overlaps non-playable pixels |
| D7 | The reference pool is a ~22.3 × 11.8 m **organic** body plus a Ø 3.6–4.0 m round spa; the schematic and the build both model a 28 × 8 m rectangle |
| D10 | The reference roundabout is a wide stepped circular plinth with a tall ribbon sculpture; the build has a 4 × 4 m plinth and a 1.45 m torus |
| D11 | `ASSET_INVENTORY.md` is stale against the branch head on every count |

### 3.3 Verdict and salvage list

**Do not cherry-pick this branch.** Start a fresh branch off the current integration head.

**Salvage (as data, re-fetched and re-checked):**
- the **fetch manifest** — the eleven resolving source URLs of §2.2, with the discipline of recording status/bytes/content-type at fetch time;
- the **minimap measurement recipe** in GLM §2 (alpha threshold, luma masks, 4/8-neighbour flood fill, radial ray sampling for the roundabout) — it is re-runnable and it reproduced the envelope to the pixel;
- the **defect list** itself, D1–D12 and O1–O4, as the skeptic's opening checklist.

**Bin:** the entire zone-measurement table (§2 of the schematic), Facts 3/9/10/12's descriptive claims about citations 5/6/10/13, and all of `eac254e7`'s code.

---

## 4. Layout spec

### 4.1 The frame that is not in dispute

**VERIFIED** in `src/raid2-arena.ts`:

- `RAID2_BOUNDS = { minX: −50, maxX: 50, minZ: −38, maxZ: 38 }` — 100 × 76 m, deliberately identical to the shipped Raid.
- Orientation: **+X north** (FBI / garage / upper bedroom end), **−X south** (Mercs / garden / court end), **−Z west** (pool, court), **+Z east** (drive, roundabout, garage approach).
- Fairness involution: the **X mirror** `(x, z) → (−x, z)`, because the reference's objective anchors are x-mirrors of one another, not 180° images.
- Footprint: five rectangles (`RAID2_BLOB`), down from the shipped map's twelve.
- Vertical constants: `UPPER_FLOOR_Y 3.4`, `UPPER_SLAB 0.24` (soffit 3.16 m), `WALL_T 0.8`, `HARD_COVER 1.9`, `MOUNT 0.7`, `STEP 0.35`, `RAIL_TOP 4.45`, `COURT_Y −0.35`, `POOL_FLOOR_Y −0.55`, stair module 9 risers × 0.3778 m under the 0.42 m autostep.

### 4.2 The calibration this lane must fix first

**CLAIMED (GLM O1) and it is the most important methodological finding in the whole pre-check:** the previous mapping calibrated minimap pixels to engine metres off the **alpha envelope**, and the alpha envelope includes out-of-bounds hillside margins. The result is a systematic offset — reference content lands ~6–8 m further +Z than the build under that mapping. Sizes and aspect ratios are robust; **absolute centres are not**.

**Required method for this lane (this is a gate, §8):**

1. Re-fetch S1. Record status, bytes, served content-type, sha256, pixel dimensions. Note that on the Nuketown lane both `.png` URLs were served as `image/webp` (**VERIFIED** in `docs/nuketown-rebuild/TASK_STATE.md`); record what is *served*, never what the extension says.
2. Extract masks and components with the GLM recipe. Publish the envelope, and then **do not calibrate on it.**
3. Solve the pixel→metre similarity on **two identifiable anchor pairs** — the pool water centroid and the roundabout curb centre — one scale and one offset per axis. Publish the residual at a third independent anchor (the court centroid). **A residual above 2 m fails the calibration and the lane stops for owner input.**
4. Every dimension published as a **ratio to the long axis** as well as in metres, so a later rescale of the anchor is one multiplication.
5. **Two independent sources per load-bearing number** with the agreement percentage published (R2 §3.3). One source is a hypothesis. S1 vs S2 (aerial) is the natural pair for footprint extents; S1 vs the relevant still for each feature.

### 4.3 Diff table — reference vs built, with corrections ordered by impact

Built values are **VERIFIED** (read from `src/raid2-arena.ts`). Reference values are **CLAIMED** (GLM's independent measurement, re-derivation required before any of them is acted on). Ordered by how much each changes what a player sees and does.

| # | Element | Built today | Reference (CLAIMED) | Correction | Risk |
|---|---|---|---|---|---|
| 1 | **Pool basin** | 28 × 8 m rectangle, `x −14..+14, z −33..−25`, floor −0.55, no spa | ~22.3 × 11.8 m **organic** body (fill 0.38 of its bbox), plus a **Ø 3.6–4.0 m round spa** at its NE edge | Reshape to an organic plan (a rounded-rectangle/kidney outline authored as a small polygon, not a box), add the spa as a separate water body with its own coping | Pool coping is the north lane's cover line — band 3/5 must be re-run |
| 2 | **Roundabout** | Rectangular paving `x −11..+11, z +5..+19`; plinth 4 × 4 m; torus 1.45 m | **Circular** drive, outer curb Ø ≈ 24–24.7 m; island + block ring Ø ≈ 13–18 m; **wide stepped circular plinth** with a tall ribbon sculpture; ring of square concrete blocks | Make the drive a circle (kerb ring as a real collider), enlarge the plinth into stepped tiers, replace the torus with a tall ribbon form, keep the block ring (the existing urn/shrub ring already reads as it) | The plinth is hard cover; enlarging it is a band-8/10 event |
| 3 | **Vehicles** | **None in the base arena** (VERIFIED: no car/van/coupe in `raid2-arena.ts`) | Black van, white van, yellow coupe, orange coupe inside a garage bay, blue car on the drive. **No red coupe in any fetched frame.** Wikitext (T4) says one car does not spawn in objective modes | Author 3–4 vehicles via `photoreal-procedural-scene-forge` → `references/vehicle-recipe.md` (24-point station ring, superellipse arches, glass cut out of the loft, lathe wheels, six verification poses incl. a **true side elevation for pixel proportion**; ~2 k tris each). Each is **one solid chassis collider** plus presentation shells — presentation geometry never derives collision | Vehicles are half/full cover — they are the single biggest band-8/10 spend in the lane |
| 4 | **Court surface** | `0x386b63` teal-green, `x −34..−20, z −34..−23` (14 × 11 m), floor −0.35 | **Blue** acrylic; measured court 12.6 × 13.6 m centred ≈ (−24.9, −22.7) — footprint agrees with the build within 1.4 / 2.6 m | Keep the footprint (it agrees). Change the colour family to blue **only if** it clears fidelity band 22 (§7.3) | Band 22 is a readability gate, not a taste gate |
| 5 | **Court fittings** | None | Two hoop standards (post, glass backboard with target square, orange breakaway rim, cord net), regulation lines: sidelines, baselines, key, three-point arc, centre circle | Port the shipped Raid's court-line + hoop pattern, re-anchored to the raid2 court centre, and **cut the floor under the lines** rather than offsetting them (§6.5) | Hoop poles are thin metal — penetration class, §7.4 |
| 6 | **Garage** | `x 34..50, z −16..+12` — 28 m z-span | Bright mass ≈ 10.6 × 12.4 m; bays with roller doors, solar roof; an orange car inside a bay, a blue car on the drive | **OPEN (§2.4 item 2).** Resolve with S2 + S7 before moving anything | Moving it moves team 1's spawns — HF-402's scar |
| 7 | **South garden pond** | Absent | Ø ≈ 7.5 m water feature near the Mercs garden apron | **OPEN (§2.4 item 3).** Add only on a second confirming source | Changes spawn routes at the −X end |
| 8 | **Courtyard** | Fountain kerb + basin + four piers + planting, `x −10.4..+11.6, z −19.2..−4.8` | Planting cluster ≈ 14.8 × 18.8 m: a large tree, boulders, concrete planter runs, bougainvillea walls. **The fountain and statue belong to the roundabout, not here** (D4) | Keep the courtyard's gameplay shape; re-dress it as *planting*, not as a fountain court; the fountain reads on the drive island instead | Low: dressing, not geometry |
| 9 | **Juice-bar pavilion** | Building at ≈ (−17, −31) | A **circular** juice-bar pavilion plus a round hot tub on the veranda | Re-form as a circular pavilion; the spa is item 1 | Its roofline blocks U1's line to the Mercs apron — a deliberate reference behaviour worth preserving |

**Everything not in this table stays.** The three-lane topology, the five-rectangle blob, the six upper rooms, the two-partition rule, the colonnade, the spawn sets and every vertical constant are **VERIFIED** as consistent with the reference topology and are not in dispute. The owner said the layout *feels better*; this lane corrects specific untrue features, it does not re-plan the map.

### 4.4 The mirror falsifier (HF-461's lesson, applied before it bites)

Write a test, not a paragraph. From S1, the *sign* of three independent relations must be asserted:

- garage end is **+X**, garden-apron end is **−X**;
- pool and court are on **−Z**, drive and roundabout on **+Z**;
- **within** the pool lane, the spa sits on the pool's **+X (north) end**, not its south end.

The third is what catches a mirror, because the first two survive one. Assert all three against `RAID2_BOUNDS`-relative positions in the fidelity test. If any disagrees, the arena is mirrored and the fix is a coordinate transform, not a re-author.

---

## 5. Street-cell decomposition — the **estate cell**

`open-world-city-art-loop` §5 defines a street cell as *one road segment between two cross-streets, both kerbs, the frontages on both sides, its furniture, its trees, its parked vehicles and its signage* (**VERIFIED**, quoted in R2 §6). `src/map3/street-cell.ts` (1,069 lines, **VERIFIED** to exist) is that unit implemented as a rule set over the existing shape grammar, exporting `createStreetCell(seed)` → `{ group, dispose(), stats }`, one `mulberry32` stream, every material created at construction, no `update()`.

Raid is an estate, not a street, so the unit is an **estate cell**: *one outdoor room or one interior room, its floor, its edges, its furniture, its planting, its vehicles and its facade bays.* Nine cells, run **strictly in sequence** (one browser at a time on this machine; parallel cells fight for the GPU and the capture harness's 3000 MiB VRAM floor):

| # | Cell | Contents | Reference pairs | Judgeset cameras |
|---|---|---|---|---|
| 1 | `facade-bay` | Pilaster rhythm, window bays, cornice, soffit, reveal depth, contact grime. **Authored first** because every other cell abuts it | T3 stucco wall; T2 `raid2-house-spine` | 5 m frontage bay, 40 m distance check |
| 2 | `pool-terrace` | Coping bullnose, deck, waterline tile, 5 loungers, 4 umbrellas, towel stack, 2 ladders, spa, glass balustrade | T3 pool-and-spa; T1 S6 (measure only); T2 `raid2-pool-deck-return` | Deck eye-level along the long lane, 5 m coping, 40 m |
| 3 | `court` | Blue acrylic surface, regulation lines cut into the floor, 2 hoop standards, post pads, retaining steps, fence run | T3 hard-court; T1 S3 (measure only) | Baseline eye-level, 5 m hoop, 40 m |
| 4 | `drive` | Circular carriageway, kerb ring, gravel island, stepped plinth + ribbon sculpture, urn/hedge ring, 2–3 parked vehicles | T3 drive-and-gravel + estate-vehicle; T1 S4 (measure only); T2 `raid2-drive-approach` | Drive eye-level, 5 m vehicle three-quarter, true side elevation of one vehicle, 40 m |
| 5 | `courtyard` | Paving pattern, four piers, planting cluster, boulders, planter runs, the one large tree | T1 S5 (measure only); T2 `raid2-courtyard` | Ground centre, upper-landing look-down, 40 m |
| 6 | `house-interior` | Living room (fireplace, sofas, rug, coffee table), kitchen (island, stools, cabinet run), practicals | T3 interior stills; `threejs-webgpu-interior-lighting-look` | Doorway eye-level, room interior, grazing-angle floor shot (the z-fighting falsifier) |
| 7 | `upper-rooms` | U1 bedroom furniture, U3/U4 balcony rails, cornices, the power-position sightline dressing | T2 `raid2-upper-bedroom`, `raid2-drive-balcony` | U1 firing arc, balcony-to-balcony |
| 8 | `garage` | Bays, roller doors, benches, tire racks, lintels, solar roof, oil grime, one car in a bay | T1 S7 (measure only); T2 `raid2-garage-fan` | Forecourt eye-level, bay interior, 40 m |
| 9 | `garden-apron` | Lawn, rock outcrops, retaining planters, steps, hedge runs, (pond if confirmed) | T1 S8 (measure only); T2 `raid2-west-apron` | Apron eye-level, steps down to court, 40 m |

**Rules carried over unchanged from the city skill (VERIFIED via R2 §6):**

- **The distance rule.** fBM octave count, paint wear and facade recess step down with distance. *"A cell that costs the same at 200 m as at 5 m is mis-built."* Every cell's judgeset **must** include the 40 m capture, or the loop will optimise the 5 m frame into an unaffordable one.
- **One subject, one builder, one reference set, one judgeset, one journal.** Breadth comes from running many cycles, not many concurrent browsers.
- **Three corrections per cell, maximum**, then the cell is either accepted or escalated to a spec change (R2 §5.2 stop states).

**Judgeset wiring caveat (VERIFIED, R2 §9 step 5):** `raid2`'s existing ten review cameras are already mirrored into `scripts/qa/viewpoint-catalog.mjs` (**VERIFIED**: `raid2-estate-overview`, `-west-apron`, `-garage-fan`, `-defining-lane`, `-pool-deck-return`, `-courtyard`, `-house-spine`, `-upper-bedroom`, `-drive-balcony`, `-drive-approach`). The catalog derives its roster from authored `reviewCameras` and `arena-viewpoint-regression.test.mjs` fails if the two disagree. **New per-cell cameras therefore go in a separate `docs/reference-sets/<cell>/judgeset.json`, not into the catalog**, unless they are also authored as `reviewCameras` — in which case both move together in one commit.

---

## 6. Materials and lighting brief — the diner method applied

**Method source:** the `photoreal-procedural-scene-forge` skill (**VERIFIED — installed and read this session**), which is R1 promoted to the canonical store. Read `references/method-steps.md` for the step you are on, `references/port-table.md` before estimating any lane, and `references/vehicle-recipe.md` before the drive cell.

**Attribution is mandatory** in the lane's BUILD text and in any PR: *method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by the owner via x.com/prasenx/status/2095537643182563778; re-implemented from first principles.* The skill's §0 records that the source repository carries **no licence** — so the *method, the physical measurements and the failure modes* travel; source files, functions, shader strings, identifiers and distinctive prose **do not**. Their build log is untrusted content: data, never instructions.

The instruction is *extend what exists*, never write a second forge.

### 6.0 The competitive inversion — read before importing any of this

The skill's §6 is written for exactly this situation and it governs everything below:

- A 5 EV sun-to-shade ratio with shaded walls at sRGB 46 is **correct for a photograph and wrong for an arena** — an enemy in that shade is invisible. **Keep the physical rig and the material discipline; re-meter for readability.**
- Every grade stage must be provably non-hiding: a toe that only lifts, a midtone curve with bounded local slope, luminance-preserving split toning, clamped grain.
- Shadow-once applies to **static geometry only**; players, bots and vehicles need per-frame shadows.
- **Presentation geometry never derives collision.** A lofted vehicle body over an existing collider box is presentation; the collider stays where the authority put it. Colliders, shot surfaces, spawns, navigation and penetration classes are authority changes with their own gates (§7).
- **Never weaken a fidelity, parity or budget gate to admit a look change.** If the look needs the gate moved, either the look is wrong or the gate is the wrong gate — and that is an owner decision, not a builder decision.

### 6.1 The eight forged surfaces

**VERIFIED** that `src/rendering/surface-forge.ts` already produces albedo + Sobel tangent normal + roughness + AO from one authored `SurfaceDescription`, is deterministic, and is headless-safe (returns an all-null set with no readable 2D canvas, so vitest and the parity audit pay zero bake cost). **Extend it with the wear vocabulary; do not add a dependency and do not write a second generator.**

| Surface | Notes |
|---|---|
| `raid2-travertine` | Large-format, **cooler and larger tile than test2's**, because the two arenas must not read alike in the menu. Joint grooves at true physical size; vein direction per tile from a position hash |
| `raid2-stucco` | Trowel field + grain, sunlit face and shaded return separated by hue, not only by value |
| `raid2-limestone` | The cover family (piers, kerbs, plinths, treads, rails). **Must stay above the paving in luminance** — fidelity band 22 |
| `raid2-timber` | Decking and furniture. Darkest family on the map on purpose; `0x8f6f4e` at 0.490 luminance is the current floor, not `0x6d4f36` |
| `raid2-court` | Acrylic sports surface: fine aggregate grain, a subtly different sheen inside the key, line-paint edge softening |
| `raid2-pool-mosaic` | Small mosaic with grout lattice; waterline scum band; grout is *lighter* than the tile, never a dark crack |
| `raid2-gravel` | Cool river aggregate on the drive island; separates from the warm travertine by hue |
| `raid2-planting` | Hedge/shrub canopy with translucency read at grazing angle |

**Bake budget is a gate.** Measure `raid2Materials()` in its own process, twice, exactly as `test-maps-art.ts` documents its own 666/630 ms. Ceiling ~1.2 s. Eight sets at test2's ~102 ms/set is ~0.82 s — inside, with headroom. If it is not, the first knob is the number of `warp` stacks, as that file already records.

**Noise-period assertion — author this before the first surface.** The skill's §2 prerequisite: a seeded tileable value noise with fBm on top and **a hard assertion that the noise period is an integer**. A fractional period yields NaN, which silently turns every map black and every surface into a mirror. This lane has already lost 25 meshes to a silent NaN once (§3.1); it does not get to lose eight surfaces to a second one. Assert the period, and let Job 0's NaN gate catch anything that slips.

**Author in millimetres, then measure the pixels.** The skill's rule 3: a generator that *intends* a 1–4 mm joint and ships 10–20 mm bands passes every code review and fails every frame. Each of the eight `SurfaceDescription`s records its authored feature sizes in millimetres **and** the measured result at the shipped resolution.

**Albedo carries, roughness follows.** The skill's rule 4: anything the frame must show is a **10–30 % albedo step or geometry**; wear that lives only in roughness is invisible. Before touching a generator, prove the map is actually bound — dump the canvas, then swap it for a constant and measure the frame.

### 6.2 The three scales of wear (the method's highest-value single rule)

Every surface carries **all three** or it is a CG tell:

- **0.5–1.5 mm grain** — the micro tile;
- **20–80 mm scuffs, chips and smudges** — authored per family;
- **0.5–3 m traffic gradients** — where feet, tyres and water actually go: the pool coping's wet band, the drive's tyre tracks into the garage, the court's worn key, the path from the garden steps to the court.

One scale only is the single most reliable "made by code" signal.

### 6.3 The CG-tells list for this arena

Write it into the brief and give it to the critic. Adapted from R1 §2 step 2 for a sunlit hillside estate at late morning:

razor-sharp shadow edges everywhere · pure-white travertine and pure-black openings (matte black is 3–5 % albedo, not 0.6 %) · uniform gloss across a whole family · cracks and joints drawn dark · no contact shadows where a mass meets the ground · no bounce off the paving into the wall soffits · shadows that are blue and cold rather than sky-filled · an over-saturated court · uniform dirt · perfect alignment of every pilaster · plastic hedge with no translucency · one noise scale · a sun colour that is too orange for the stated hour · water that is a transparent tinted box rather than depth-absorbing.

### 6.4 Contact grounding

**Ports directly (R1 §2):** one merged, multiply-blended, vertex-coloured `MeshBasicNodeMaterial` mesh carrying every contact-occlusion decal — one draw call. This replaces the shipped Raid's nine separate `test2-contact-grime` boxes and is both cheaper and better. It is presentation-only and must be excluded by name from the parity audit's rules, exactly as the existing grime boxes are.

### 6.5 Z-fighting is a **geometric** rule here, not an offset

This is the lesson that cost PASS 92 and PASS 93 (**VERIFIED**, HF-434 → HF-443 → HF-448 → HF-457 → HF-463): `polygonOffset` tiers did not cure the Nuke Town interiors, and the fix that worked was geometric — interior slabs raised, and the ground, lawn and dressing **cut out** under every building footprint.

`raid2` must adopt the rule before it authors a single decal:

- **No two surfaces are ever coplanar.** Butt panels edge to edge.
- **Nothing is drawn under a floor.** The hillside slab's top already sits at −1.60 m, below the paving, the court floor and the pool basin (**VERIFIED** in the shipped map's comment; the same discipline applies) — keep it, and additionally cut the paving under interior slabs.
- **Court lines and road-style markings are cut into the floor**, or the floor is cut out beneath them; the shipped Raid's 30 mm-proud flush quads are acceptable *only* where nothing else is coplanar within the same plane, and the arena carries a house-class exclusion in the coplanar instrument so the instrument reports the class rather than skipping it.
- The coplanar instrument must list **UNAUDITED** meshes by count, never report "skipped: 0" (HF-443's repair).

### 6.6 Lighting — and a finding that resolves an apparent conflict

The owner asked for lighting "closer to the original". The previous schematic claimed the original is golden hour; **CLAIMED (GLM D5)** the load screen is bright **midday**.

**VERIFIED** in `src/rendering/arenas/raid2.ts`: `raid2` is already graded for **high late morning** — key `0xfff2dc` at 2.62 (test2's luminous key, re-spectralised at constant luminance: `0.955 × 2.62 = 2.503` against test2's `0.835 × 3.0 = 2.505`), sun at 52° elevation, shadow bias derived at `0.0527 × (0.55 + 1.1 × 0.212) = 0.0413`, fog pinned by the 125.7 m diagonal.

**Finding: `raid2`'s existing grade is already closer to the reference than the shipped Raid's golden hour.** The correct action is therefore *not* to re-grade toward gold. It is to keep the 52° key and add the reference's actual character:

- a **hard hillside sun** with a real penumbra that grows with distance from the occluder, not a constant blur;
- **strong bounce** off pale travertine into wall soffits and the underside of the upper rooms — the single thing that makes a bright exterior read as photographed rather than lit by a constant;
- **sky-filled shadow**, cool but not blue-crushed; the flat ambient stays cool and warmth stays in the key (the rule `test2.ts` sets out at length: lerping a warm bounce into the fill makes shadows warmer than the sun casting them);
- the **derived-exposure camera block**: `EV100 = log2(N²/t) − log2(ISO/100)`, `L_sat = 1.2 × 2^EV100`, `exposure = 1/(L_sat × K)`, middle grey `0.18 × L_sat` — **derived, never tuned** (skill rule 2). Then **meter on the subject**: a correctly locked exposure metered on the wrong region puts the subject a stop and a half under every photograph a critic holds it against. For this arena the metering region is the **travertine paving in open sun**, not the sky and not the shaded courtyard. The skill names this the highest-value single import and notes we do not have it. **Recommendation: attempt it in this lane only if cells 1–4 land early; otherwise queue it as its own lane** — it touches the shared grade profile.
- **Water** via `threejs-webgpu-water`: Beer-Lambert absorption by depth, not the current `opacity: 0.82` tinted box. The pool is the arena's saturated note and the one surface the reference is most recognisable by.
- **Interiors** via `threejs-webgpu-interior-lighting-look`: the arena already declares a `raid2-estate-practicals` emissive-only light policy (**VERIFIED**), so the fixtures have a home; value composition and combat readability first.

**Distinctiveness floor.** The art-direction gate requires `raid2` to stay separated from `test2`. The separation levers are hour (52° vs 18°), spectrum (neutral vs golden) and surface format (cooler, larger travertine). None of them may be spent to chase a reference photo's colour grade — R2 §4.2's `notMatchable` clause exists exactly to stop a critic dragging the arena toward a photograph's grade.

### 6.7 Diagnostics — not optional, and authored before the critic loop runs

**A critic loop without ablation switches is a guessing loop** (skill §5). Before cell 1, ship URL flags that drop each light group and force each tone curve — `?nokey`, `?nofill`, `?nobounce`, `?nopractical`, `?tm=`. **Ablate before authoring:** the skill records a rev where three "obvious" causes each turned out to be something else, and zeroing sources one at a time named the real cause in under a minute each. R1 §2 makes the same point about our own stack: *the critic loop is unusable without the diagnostic flags.*

Every blocker is answered with one of three things, never with prose:

- an **HDR probe** — render to a float target, report region p10/p50/p90 in nits and EV over middle grey, plus the display code of the same region in the same frame;
- an **ablation** that names the cause;
- a **ray-cast** that names the region. Skill rule 5: *a region chosen from a screenshot needs one ray-cast to earn its name* — two revs were once spent on "sun on the wall under the sill" that turned out to be a stool top. The discipline runs both ways: **do not concede a mis-read either**, and do not argue a real failure away.

Each cell's rev is written up as a **target | measured | verdict** table.

**Structure, not numbers** (skill rule 1). If a cell is past three corrections with no *measured* movement, the problem is the spec or the structure, not the values — escalate to a spec change once, then stop. This is the same stop policy as R2 §5.2's plateau rule and the §5 three-corrections cap; they are one rule stated three times, and the loop honours it mechanically.

**Boot cost is shader links, not textures** (skill step 10). The eight new surfaces are a CPU bake measured in §6.1; the risk to first-frame time is *pipeline creation*, which is already gated (§8, pipeline census, and `street-cell.ts`'s recorded FAIL). Issue programs together and make the stand-in PMREM first rather than letting each cell's new material trickle a pipeline into the first thirteen seconds of a match.

---

## 7. Colliders and the gameplay contract

Detail must be **free**. Every rule below exists so that adding ~70 props does not change how the map plays.

### 7.1 The presentation-only rule (the shipped Raid's own contract, VERIFIED)

*"DRESSING NEVER BECOMES GHOST COVER."* A dressing mesh qualifies as presentation-only when it is **under 0.9 m tall**, **thinner than 0.35 m in its widest axis**, **at or above the 2.6 m reachable ceiling**, **outside the arena bounds**, or **named so the parity audit's foliage/cloth rules exclude it by construction**. Anything that should stop a body or a bullet is authored as a real collider in the arena source instead. Every dressing mesh is tagged `presentationOnly` and has `raycast` replaced with a no-op.

### 7.2 The cover rule (VERIFIED in `raid2-arena.ts`)

Ground cover is either **mountable** (top ≤ 0.75 m against a measured 0.82 m jump apex) or **hard** (≥ 1.9 m, clearing the 1.70 m standing eye). **Nothing sits in the 0.9–1.8 m dead band.** The single exception is the 1.05 m balcony rail on a +3.40 m floor, where the crouch eye sits at 1.16 m so the rail hides the body and clears the eye.

**Consequence for this lane, and it is the sharpest constraint in the plan:** parked vehicles are ~1.3–1.5 m tall — squarely in the dead band. A vehicle must therefore be authored as either a **mountable** body (roof ≤ 0.75 m is absurd) or as **hard cover ≥ 1.9 m** (a van, not a coupe), or the arena takes a documented, skeptic-approved second exception with the same shape as the balcony-rail exception: a coupe at ~1.35 m hides a crouched player from a standing one *at range* because of the ground fall, and that argument must be **measured** on the drive's actual grade before it is accepted. **Recommendation: the two vans carry the hard-cover role; the coupes are authored on a raised kerb/apron so their roofline clears 1.9 m, or they are moved inside the garage bay where the reference puts one anyway.**

### 7.3 Readability (fidelity band 22, VERIFIED)

*"Never puts a cover family darker than the floor it stands on."* Rec.709 relative luminance is the metric and the gate is written against it and nothing else. Current values: travertine `0x9a8f7d` (0.565 floor), limestone `0xa8a496` (0.642), timber `0x8f6f4e` (0.490 — the documented dark family), planting `0x4a6540`.

The court-colour correction (§4.3 item 4) goes through this gate: a saturated reference blue may measure below the paving. **If it fails, the correction is a hue change at held luminance, not a luminance drop** — the same arithmetic the key re-spectralisation uses.

### 7.4 Penetration classes (HF-467 / R3)

Every new prop declares a class from R3's table rather than inventing one:

| Class | Props |
|---|---|
| **Glass — breaks, passes through** | Window bays, hoop backboards, the pool's glass balustrade, vehicle glazing |
| **Thin metal — perforates, loses collision at the hole** | Pool ladders, hoop posts, court fence, garage roller doors, vehicle body panels, tool cabinets |
| **Stops** | Stucco, travertine, limestone piers, kerbs, plinths, concrete blocks, vehicle engine block |

### 7.5 Bots, spawns and the sightline ratchet

- **Bots do not climb** (VERIFIED, the arena's own header): every zone keeps at least one **autostep route** with rise ≤ 0.42 m. The garage kerb is 0.40 m and gapped; the court is one 0.35 m riser; the pool has 0.27 m steps. **Any new kerb, planter run or coping must not close one of these.** A continuous 0.70 m kerb is a wall to a bot even though a player hops it — that is exactly the defect HF-402 found.
- **Spawns:** 12 total, 6 + 6, x-mirrored with every point within 2 m of its mirror, teams ≥ 55 m apart, no spawn sees another (bands 15–18, VERIFIED). **HF-456 (P1, all maps)** additionally requires better distribution for players *and bots*: farthest-from-threat, recent-use avoidance, team-side aware. `raid2`'s set must be re-audited under that lane's rules once it lands, and **no prop added by this lane may remove a spawn, block a spawn route or reduce spawn spread.**
- **The sightline ratchet is the hard ceiling on ambition.** Band 8 is *"RATCHET: never adds another eye-blocking mass (≤ 34, zero headroom)"* and band 10 is *"did NOT buy its openness by deleting cover (≤ 17 m² per 100 m²)"*. Adding hard cover breaks band 8; deleting cover breaks band 10. **Therefore: all ported detail is presentation-only or mountable by default. Any new hard cover — the vans, the enlarged plinth, the kerb ring — is a ratchet decision the skeptic makes explicitly, with the band re-derived and the headroom re-stated, never a number nudged.**

---

## 8. Gates

Nothing here weakens an existing gate. Two are new, and both close a defect that has already shipped.

**New gates (author these first, §9 Job 0):**

1. **NaN-bounded authored meshes FAIL.** `scripts/qa/audit-collider-visual-parity.ts` currently drops a mesh whose `Box3.setFromObject` returns NaN. **CLAIMED (GLM §5)** that is how 25 dressing meshes vanished while the audit stayed green. Make it a failure with the offending mesh names listed. *This is the single highest-value item in the plan: without it, deliverable A can be "done" and invisible.*
2. **`npx tsc --noEmit` exit 0 is a lane gate, checked before any capture.** The previous branch's headline commit does not compile, and every downstream claim it made was therefore unsafe.

**Existing gates, all green at every commit:**

| Gate | Command / source | Note |
|---|---|---|
| Type check | `npx tsc --noEmit` | exit 0 |
| Fidelity bands | `src/raid2-fidelity.test.ts` — 23 bands | Re-derived from the corrected schematic, **never weakened**; band 8 has zero headroom |
| Collider/visual parity | `scripts/qa/audit-collider-visual-parity.ts` | 0 findings |
| Walkable-surface parity | `scripts/qa/audit-walkable-surface-parity.ts` | 0 findings |
| Coplanar instrument | the HF-443/448 instrument | FINDINGS 0, **UNAUDITED listed by count**, an estate-interior class added |
| Spawn quality + distribution | `spawn-layout-quality.test.ts`, `spawn-safety.ts`, + HF-456's lane | 12 spawns, mirror ≤ 2 m, ≥ 55 m, no spawn sees another |
| Mirror falsifier | new assertions in the fidelity test | §4.4, three independent sign relations |
| Art-direction floor | the distinctiveness gate vs `test2` | raid2 stays cool-keyed, late morning |
| Viewpoint regression | `scripts/qa/capture-arena-viewpoints.mjs` + `diff-arena-viewpoints.mjs` | Every **other** arena diffed against a frozen pre-lane baseline; a gain here that costs a `REGION_CHANGED` elsewhere is a rejected round |
| Boot smoke | 13/13 on native WebGPU | |
| **Stock-flags boot** | `npm run qa:stock-boot` | Installed Chrome, **no `--enable-unsafe-webgpu`**, real menu → Solo. HF-454's honest gate; every historical QA pass used the unsafe flag and that is why PASS 92 shipped unlaunchable |
| Draw calls / frame time | quoted **before and after each cell** vs the PASS-93 `raid2` baseline | HF-450: cut density if draw calls grow more than 15 % |
| Pipeline census | 0 in-combat pipeline creations; cold-compile fence untouched | The `street-cell.ts` header records a measured **FAIL** here (36 post-mark creations with the cell vs 28 without) — this lane must not repeat it |
| Bake budget | `raid2Materials()` measured twice in its own process | ≤ ~1.2 s |
| MP sync | two-client mp-lab run against `raid2` | Lane AQ recorded arena sync **45–63 % slower** than the shipped Raid as OPEN; dressing will make it worse. Re-measure and report |
| 60 s solo run | zero errors | |
| Reference pre-check | R2 §4.1 `reference-precheck` per cell | SSIM / edge-IoU / silhouette IoU / value-EMD, global and per region |
| Reference critic | R2 §4.2 `reference-critic-v1`, three fresh critics | Every row ≥ 85 % of weight; **no score without a reference pair**; probe-token receipt or the round is INVALID |

**Refuse-in-code, per R2 §5.2:** the loop never lowers a threshold, never widens the cold-compile fence, never edits the judgeset to remove a failing camera, and never re-runs a critic until it agrees.

---

## 9. Ordered implementation plan — builder + skeptic

**Two agents, disjoint ownership, one worktree each.**

- **Builder** (Opus; bounded mechanical sub-jobs may go to GLM/Gemini under an exact one-file edit spec per HF-460). Owns `src/raid2-arena.ts`, `src/raid2-dressing.ts` (new), `src/rendering/arenas/raid2.ts`, `src/rendering/surface-forge.ts` additions, `docs/raid-rebuild/*`, `docs/reference-sets/raid2-*/*`.
- **Skeptic** (a *separate* Opus with fresh context). Owns **nothing under `src/`**. Re-fetches the sources itself, re-derives every load-bearing number from the raw images, runs every gate itself, and writes the verdict. The GLM pre-check is the template for its output: a citation table with its own byte counts, a diff table with its own measurements, and a numbered defect list with claim-states.

**Setup (both):** worktrees created with `git worktree add` from `C:/Users/david/projects/aa-omp-pass84`, `node_modules` junctioned to `C:/Users/david/projects/aa-claude-chopper/node_modules`. Branch `contrib/dave-gaming-pc/claude/raid2-detail-accuracy-v2`, off the **current integration head**, not off the Gemini branch. Read `AGENTS.md` first. Explicit-path commits with the `Co-Authored-By` trailer. **Never touch the shipped Raid (`test2`).** Nothing publishes.

| Job | Owner | Time | Content | Exit gate |
|---|---|---|---|---|
| **0** | Skeptic | 40 m | The two new gates (§8): NaN-bounded meshes fail the parity audit; tsc is a lane gate. Freeze the viewpoint baseline for every arena | Both gates red against a deliberately NaN-positioned fixture mesh, green after; baseline captured |
| **1a** | Builder | 90 m | Re-fetch the eleven T1/T4 sources with receipts. Re-run the mask/flood-fill/radial measurement. **Solve the calibration on two anchor pairs and publish the residual at a third** (§4.2). Write `docs/raid-rebuild/REFERENCE_SCHEMATIC_V2.md` — ratios first, metres second, two sources per load-bearing number with agreement % | Residual ≤ 2 m; every source has a resolving receipt; every number has two sources or is marked OPEN |
| **1b** | Skeptic | 90 m | **In parallel, independently**, from the same raw images, without reading 1a's output until both are written. Then reconcile | A published agreement table between 1a and 1b. Disagreement > tolerance on any number ⇒ that number is OPEN and does not drive geometry |
| **1c** | Builder | 20 m | Gather the six T3 look sets + the T2 shipped-Raid pairs; write `reference-set.json` per R2 §3.3 with `criticTargets`, `notUsableFor`, `caveats` | Every source licensed and dated; no T1 game artefact carries `asTarget: true` |
| **2** | Builder | 90 m | **Layout corrections only, no art**: pool organic body + spa, roundabout circle + kerb ring + stepped plinth + ribbon sculpture, juice-bar pavilion re-formed circular, courtyard re-scoped as planting. Items 6 and 7 (garage depth, pond) stay OPEN pending §2.4 | All 23 fidelity bands green with band 8 re-derived and headroom re-stated; parity 0; walkable 0; spawn gates green; mirror falsifier green |
| **3** | Skeptic | 45 m | Verify Job 2 against its own re-derivation. Explicitly adjudicate every band-8/10 ratchet spend | Written verdict with claim-states; any band nudged without a stated derivation is a REJECT |
| **3b** | Builder | 30 m | **Diagnostics before the loop** (§6.7): light-group ablation and tone-curve URL flags, the HDR region probe, the ray-cast region namer. Nothing renders differently by default | Each flag demonstrably changes one frame and only one; probe reports p10/p50/p90 in nits + EV + display code for a named region |
| **4** | Builder | 75 m | The forge: eight `SurfaceDescription`s, integer noise-period assertion, millimetre-authored features with **measured** pixel sizes, three-scale wear, `raid2Materials()` rewired. **No new geometry.** Measure the bake budget twice in its own process | tsc 0; bake ≤ 1.2 s; band 22 green on the new palette; every map proved bound by the constant-swap test; draw calls within +15 % |
| **5–13** | Builder | 45–60 m each | **One estate cell per job, in the §5 order** (facade-bay first, then pool, court, drive, courtyard, house-interior, upper-rooms, garage, garden-apron). Each: build → capture at that cell's judgeset (5 m, eye-level, **40 m**) → `reference-precheck` → three reference-grounded critics with probe tokens → at most three bounded corrections → commit | Per cell: every critic row ≥ 85 %; ≥ 2 valid critics (probe token correct); precheck not worsening; parity 0; walkable 0; coplanar FINDINGS 0; draw calls ≤ +15 % vs the cell's own baseline; **no prop in the 0.9–1.8 m dead band**; every autostep route still open |
| **14** | Builder | 60 m | Water (`threejs-webgpu-water`, Beer-Lambert pool + spa), interior practicals (`threejs-webgpu-interior-lighting-look`), merged contact-occlusion decal mesh. Derived-exposure camera block **only if** the lane is ahead of schedule | Pipeline census 0 in-combat creations; cold-compile fence untouched; interiors readable in combat |
| **15** | Skeptic | 90 m | Full sweep: every gate in §8 run by the skeptic, not quoted from the builder. Grazing-angle interior captures (the z-fighting falsifier). Stock-Chrome boot. 60 s solo run. Two-client mp-lab sync re-measured. Draw-call/frame-time table vs the PASS-93 baseline | A SHIP / SHIP-WITH-FIXES / DO-NOT-SHIP verdict with every claim carrying VERIFIED / CLAIMED / OPEN |
| **16** | Orchestrator | — | **HITL build per HF-455**: local build, stock-Chrome gate green first, served locally, owner plays before anything publishes | Owner's read on detail parity, layout accuracy, the pool, the drive, the court colour, and FPS |

**Budget and machine rules, enforced per job:** headless only, **one browser at a time**, ports 4280–4289, never on Dave's main screen; ComfyUI queue empty and ≥ 3000 MiB free VRAM before any capture (poll up to 20 minutes at 60 s intervals, else mark browser checks OPEN); never kill the owner's processes. Delete `test-results`, `playwright-report` and any `artifacts/**/*.json` the runs created. `artifacts/reference-cache/` is gitignored by construction, so no reference image is ever committed — only provenance and measurements.

**Stop conditions:** calibration residual > 2 m (Job 1) ⇒ stop for owner input. Two consecutive cells with < 2 valid critics ⇒ the harness is broken, stop and report. A band-8/10 spend the skeptic will not sign ⇒ the cell ships presentation-only and the hard-cover item goes to the owner as a question.

---

## 10. OPEN items for the owner / orchestrator

1. **OPEN — garage depth** (§2.4 item 2). Resolve before Job 2, because it moves team 1's spawns.
2. **OPEN — south garden pond** (§2.4 item 3). Add only on a second confirming source.
3. **OPEN — court colour** (§2.4 item 4). Blue if it clears band 22; otherwise a hue change at held luminance.
4. **OPEN — vehicle roster and the dead-band exception** (§4.3 item 3, §7.2). The reference's coupes sit in the 0.9–1.8 m dead band the arena forbids. Vans as hard cover and a coupe inside a garage bay is the recommendation; a second documented exception needs the owner's or the skeptic's explicit sign-off.
5. **OPEN — derived exposure** (§6.6). It is R1's highest-value import and it touches the shared grade profile. Recommend its own lane rather than smuggling it into this one.
6. **OPEN — does `test2` get hidden when `raid2` is good?** HF-466 did exactly this for the original Nuke Town once the rebuild was better. **Do not pre-empt it.** Ask the owner after the HITL play.
7. **OPEN — MP arena sync.** Lane AQ measured `raid2` 45–63 % slower to sync than the shipped Raid and routed it to another lane; ~70 new meshes will not help. Re-measure at Job 15 and report the number rather than absorbing it.
8. **CLAIMED, not VERIFIED — every number in §3 and §4.3 attributed to the GLM pre-check.** I read that report this session; I did not re-run its fetches or its Pillow/NumPy measurements. Job 1b exists precisely so that no geometry moves on an un-re-derived number.
