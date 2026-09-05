# RAID accuracy — reference study and build spec

**Lane:** PASS 95 · Raid accuracy research (research only; **no `src/` file was written or changed by this lane**).
**Agent:** Claude Opus, 2026-09-05.
**Worktree:** `C:/Users/david/projects/aa-m-raid` · **Branch:** `contrib/dave-gaming-pc/claude/v9-raid`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba` (candidate 7).
**Owner row served:** "make the raid layout more accurate to the original game and add
assets and textures all similar and true to the original map" (HF-408 / HF-427 lineage).

---

## 0. How to read this document

**Claim-state key — used on every figure, without exception.**

| Tag | Means |
|---|---|
| `[MEASURED from S<n>]` | A number produced by measuring the named source. The source id is always given. |
| `[VERIFIED]` | I read the file, ran the command, or fetched the URL **in this session** and quote what it said. |
| `[CARRIED, re-derivable]` | Another lane measured it with a published, re-runnable method; I read the method and the method is sound, but I did not re-run the pixel work this session. Treat as strong, not as mine. |
| `[INFERRED]` | A reasoned conclusion from evidence, not a measurement. **Advisory only.** |
| `[OPEN]` | Named unknown. **An `[OPEN]` item never drives geometry.** |

**Instruction to the layout lane, restated because it is the point of the tagging:**
`[MEASURED]` and `[CARRIED, re-derivable]` figures may move geometry. `[INFERRED]`
figures are **advisory** — they may motivate a change, they may not *specify* one, and
they may never be quoted downstream as measurements. `[OPEN]` items stop and ask.

**Originality boundary (owner rule, and it is enforced by what this document contains).**
Nothing here copies geometry, texture, audio, text or trade dress. From the first-party
artefacts this lane recovers only **topology, proportion and ratio** — how wide a thing
is relative to the map's long axis, and which side of which it sits on. No image was
downloaded by this lane; the only bytes fetched are two **text** documents (section 1).
Every mesh and texture named in the build order in section 8 is to be authored
procedurally in this repository. The arena keeps its existing display name and no
trademarked name of any in-world object is used as an identifier.

---

## 1. Sources, with receipts

### 1.1 Fetched by this lane, this session (2026-09-05)

Both fetches were plain `curl` (no browser, no GPU). Byte counts are `%{size_download}`.

| id | What | URL | HTTP | Bytes | Served | Tier |
|---|---|---|---|---|---|---|
| **T4-a** | Call of Duty Wiki, `Raid` article **wikitext** (prose only; no images fetched) | `https://callofduty.fandom.com/api.php?action=parse&page=Raid&prop=wikitext&format=json` | **200** | **7,008** | `application/json; charset=utf-8` | T4 reported |
| **T4-b** | Gamer Guides, BO2 multiplayer guide, Raid page (HTML; text extracted locally) | `https://www.gamerguides.com/call-of-duty-black-ops-ii/guide/multiplayer-guide/maps-and-tactics/raid` | **200** | **105,737** | `text/html; charset=UTF-8` | T4 reported |
| — | Call of Duty Maps, Raid page | `https://callofdutymaps.com/black-ops-2/raid/` | **403** | 5,481 (challenge body) | `text/html` | **REJECTED — not used** |

`[VERIFIED]` T4-a sha256 `35772a59cc194826950428a28048f794508d0444ebf9df39d521d8fb4f569861`.

`[VERIFIED]` **Both byte counts reproduce two prior independent lanes to the byte / near-byte.**
T4-a's 7,008 B is exactly what both `docs/raid-rebuild/REFERENCE_SCHEMATIC.md` (Gemini,
2026-09-03) and `docs/raid-rebuild/GLM_PRECHECK_2026-09-03.md` (GLM, 2026-09-03) recorded.
T4-b's 105,737 B is exactly GLM's figure and **not** the schematic's 106,392 B — i.e. GLM's
correction (the page is dynamic and the schematic's byte count drifted) reproduces today.
That is a third independent confirmation of the same discrepancy and it is why GLM's
report, not the schematic, is the carried authority below.

`[VERIFIED]` The 403 on Call of Duty Maps reproduces, **and it serves a 5,481-byte
challenge body**, not the 0 bytes the schematic claimed. It is excluded from use.

Also fetched: three `WebSearch` result sets (queries recorded in 9.3). Search-engine
*summaries* are **not** cited as evidence anywhere in this document; only the URLs they
surfaced were followed. `https://www.callofduty.com/guides/blackops7/multiplayer-maps/raid`
was surfaced and **deliberately not used**: it is the 2035 Tokyo remake, a different map.

### 1.2 Carried from prior lanes, with the method read

These are the **T1 first-party image measurements**. This lane did **not** re-download
any image — the owner rule is that the original game's assets are never copied, and the
prior lanes' pixel measurements are already published as re-runnable methods with
residuals. They are tagged `[CARRIED, re-derivable]` throughout.

| id | Artefact measured | Where the measurement lives | Status |
|---|---|---|---|
| **S1** | BO2 Raid minimap, 512 x 512 RGBA | `src/raid2-reference.ts` on `origin/contrib/dave-gaming-pc/claude/raid2-slice-2` (`RAID2_MEASURED`, `RAID2_CALIBRATION`) | **best available**; least-squares 3-anchor calibration, worst residual 2.00 m, published |
| **S1'** | Same artefact, earlier independent pass | `docs/raid-rebuild/GLM_PRECHECK_2026-09-03.md` section 2 | sound method, **envelope-calibrated**, so 6-8 m absolute bias; superseded by S1 |
| **S1''** | Same artefact, first pass | `docs/raid-rebuild/REFERENCE_SCHEMATIC.md` section 2 | **DO NOT USE for zone boxes** (see 9.2) |
| S2 | aerial view still | described in both prior reports | measure-only, not re-measured here |
| S3 | sport court still | ditto | ditto |
| S4 | compound entrance still | ditto | ditto |
| S5 | courtyard still | ditto | ditto |
| S6 | veranda still | ditto | ditto |
| S7 | garage-end still | ditto | ditto |
| S8 | garden-apron-end still | ditto | ditto |
| S9 | load screen | ditto | ditto |

### 1.3 The one thing that must not be done with S1-S9

**Measure them. Never show them to a critic as the look target.** A commercial game
frame is a measurement instrument in this pipeline and nothing else. Look targets come
from T2 (this repository's own approved judgeset frames,
`docs/evidence/pass85/lane-aq/judgeset/*.png`, `[VERIFIED]` — ten files present on the
candidate) and T3 (permissively licensed photographs of the **real-world** subjects: a
modernist hillside villa, an outdoor acrylic sports court, a residential pool with coping
and a spa, a gravel roundabout, an open garage forecourt).

---

## 2. Base-state finding — read this before anything else

`[VERIFIED]` **The Raid rebuild work is not on the candidate.** On
`pass93-candidate` @ `452d7aba` the arena is three files: `src/raid2-arena.ts` (869 lines),
`src/raid2-fidelity.test.ts`, `src/rendering/arenas/raid2.ts`. The measured-reference
rebuild — `src/raid2-reference.ts`, `src/raid2-shapes.ts`, `src/raid2-dressing.ts`,
`src/raid2-art.ts`, `src/raid2-slice2.test.ts`, `scripts/qa/find-coplanar-pairs-raid2.ts`,
`scripts/qa/raid2-bake-budget.ts` — exists **only** on
`origin/contrib/dave-gaming-pc/claude/raid2-slice-2` @ `1c62b74f`, which is **not an
ancestor of the candidate** (`git merge-base --is-ancestor` returns false; the common
ancestor is `c3ba5028`).

Consequences the layout lane must plan around:

1. There are **two different current arenas**, and every delta below is therefore given
   **twice** — against the candidate (`C`) and against the slice-2 head (`S2`).
2. `[VERIFIED]` on the candidate, `grep` for `car|coupe|van|vehicle|sedan`,
   `hoop|backboard`, `juice|pavilion|spa`, `statue|sculpture|helix|ribbon` in
   `src/raid2-arena.ts` returns **zero vehicles, zero hoops, zero court line markings,
   zero pool furniture, no spa, and exactly one sculpture** (`raid2 gallery sculpture`,
   a 2.4 x 2.4 m hard-cover block). The candidate is the bare layout pass.
3. `[VERIFIED]` slice-2 already consumes the measured reference: `src/raid2-arena.ts`
   there imports `RAID2_MEASURED` and builds the organic pool, the plunge basin, the spa,
   the circular kerb ring and the stepped drive plinth from it (lines 94, 173-174,
   629-655, 912-963), and its slice-2 dressing adds 58 meshes across facade / pool-terrace
   / court.
4. `[OPEN]` **Which head does the layout lane build on?** Rebasing slice-2 onto the
   candidate is a real merge (`raid2-arena.ts` diverges by ~200 lines), and slice-2 carries
   two unclosed `[OPEN]`s of its own (native-WebGPU judgesets; MP arena-sync re-measure).
   This is an integrator decision, not a research one. **Recommendation `[INFERRED]`:
   take slice-2 as the base and rebase it, because re-deriving `RAID2_MEASURED` from
   scratch on the candidate would repeat the most expensive part of two prior lanes.**

---

## 3. Scale anchors

### 3.1 The anchor that is not re-litigated

`[VERIFIED]` `RAID2_BOUNDS = { minX: -50, maxX: 50, minZ: -38, maxZ: 38 }` — **100 x 76 m**,
aspect **1.3158**, deliberately identical to the shipped Raid's bounds.

`[CARRIED, re-derivable, S1]` The artefact's playable alpha envelope is
x = [63, 443], y = [15, 499], so 381 x 485 px, aspect **1.2730**. This reproduces **to the
pixel** across three independent passes (schematic section 2, GLM section 2,
`raid2-reference.ts` step 2). Engine aspect is 3.4 % long against it.

**Decision, carried from HF-426's precedent and not reopened: 100 x 76 m is an ANCHOR.**
No public source gives Raid in metres. Every ratio below is published *against the long
axis* so a future rescale of the anchor is one multiplication.

### 3.2 The calibration, and why the first one was wrong

`[CARRIED, re-derivable]` This is the single most important methodological fact in the
Raid file and it must not be lost again:

- **The alpha envelope is not the calibration.** It includes out-of-bounds hillside
  margin, and it includes it **asymmetrically**. Calibrating on it put the first pass's
  absolute centres **6-8 m** out (`GLM_PRECHECK` O1). Sizes and aspect ratios survive that
  error; **absolute centres do not**.
- The accepted mapping (`src/raid2-reference.ts` step 4, slice-2) is one scale and one
  offset per axis, solved by least squares over **three** identifiable anchor pairs — pool
  water centroid, drive island centre, sport-court enclosure centre:

  ```
  Z = 0.19381 * px_x - 54.864          (0.1938 m per pixel)
  X = -0.21441 * px_y + 53.985         (0.2144 m per pixel)
  ```

  Residuals (built minus predicted), metres: pool `dZ -1.00 / dX -2.00`; drive island
  `dZ -0.06 / dX +1.73`; court `dZ +1.06 / dX +0.26`. **Worst residual 2.00 m against a
  2 m stop condition — passes with zero headroom on X.**
- **Published bias:** anisotropy `|ax| / az = 1.106`. The fit is 6.6 % coarser per pixel
  along the long axis than across it. **Therefore every X figure in section 4 carries
  +/- 2 m and none of them may be used to move a spawn.**
- `[VERIFIED]` the plan originally named **two** anchors; two is unsolvable here, because
  in the built arena the pool water centre and the drive island centre both sit at X = 0,
  so the X baseline between them is zero metres and the X scale is unidentifiable. The
  court was promoted from residual-anchor to fit-anchor. That reasoning is correct and
  should be preserved in any re-derivation.

### 3.3 Vertical anchors (build side, all `[VERIFIED]` in `src/raid2-arena.ts`)

| Constant | Value | Note |
|---|---|---|
| `UPPER_FLOOR_Y` | 3.40 m | first-floor level; four upper rooms sit here |
| `UPPER_SLAB` | 0.24 m | soffit lands at 3.16 m clear |
| `WALL_T` | 0.80 m | one thickness so walls meet exactly |
| `HARD_COVER` | 1.90 m | clears the 1.70 m standing eye |
| `MOUNT` | 0.70 m | under the measured 0.82 m jump apex |
| `RAIL_TOP` | 4.45 m | 1.05 m rail on a 3.40 m floor — documented dead-band exception |
| `STEP` | 0.35 m | under the 0.42 m autostep |
| stair module | 9 x 0.3778 m, 0.45 m treads | autostep-legal |
| `COURT_Y` | -0.35 m | court sunk one riser |
| `POOL_FLOOR_Y` | -0.55 m | |

**`[INFERRED]` — advisory, and it is the largest single accuracy gap in the vertical:**
the reference is a **hillside** map with real grade changes, and the current arena is
essentially flat (two sunken features, nothing else). Two independent T4-b statements
imply at least two grade steps: from the garage spawn a player **climbs stairs** to reach
the Central Courtyard, and from the south spawn a player goes **down stairs** to reach the
Basketball Court. `[VERIFIED, T4-b]` Domination Flag A is described as at *the top of the
stairs* leading to the court. So the reference's section is roughly:
south spawn (high) -> living area -> courtyard (high) -> stairs down -> garage forecourt
(low), with the pool terrace and court stepping down on the west flank. **This is
`[INFERRED]` and advisory:** no source in this lane measures a single vertical dimension of
the original. It motivates a grade study; it does not specify one. Any grade change is also
a spawn-reachability event (bots do not climb) and must re-run the autostep flood fill.

---

## 4. Measurements table

Ratios are against the 100 m long axis (X) and the 76 m short axis (Z). Built values are
`[VERIFIED]` read from source this session. `C` = candidate `452d7aba`;
`S2` = slice-2 `1c62b74f`. All diameters are written out as "dia".

| # | Feature | Reference | Claim-state | Built `C` | Built `S2` |
|---|---|---|---|---|---|
| 1 | Playable envelope aspect | 1.2730 | `[CARRIED, S1]` reproduces to the pixel, three times | 1.3158 (100 x 76 m) | same |
| 2 | Pool **water body** envelope | 23.37 m (X) x 11.63 m (Z); ratios **0.234 long / 0.116 across**; water area **107.0 m2**; **bbox fill 0.394** | `[CARRIED, S1]` flood fill, 2,575 px | 28 x 8 m rectangle, fill **1.00** (`x -14..14, z -33..-25`) | organic plan from `RAID2_MEASURED`, fill about 0.58 |
| 3 | Round spa / hot tub | dia **3.45 m** at (X **+1.78**, Z **-26.08**) | `[CARRIED, S1]`; **corroborated `[VERIFIED, T4-b]`** — the guide calls it a *central* hot tub in the Pool Area, and +1.78 is 3.8 m from the pool centroid, i.e. central | **absent** | built at the measured position |
| 4 | Round basin in the southern lobe ("plunge") | dia **6.53 m** at (X -8.84, Z -28.51) | `[CARRIED, S1]` | absent | built |
| 5 | Circular carriageway | dia **24.5 m** (23.26 m across Z, 25.73 m across X — the 3.2 anisotropy, not an ellipse), centre (X +1.73, Z +13.94); **ratio 0.245 long** | `[CARRIED, S1]` radial rays | **rectangle** `x -11..11, z +5..+19` (22 x 14 m) | circle plus kerb-ring segments |
| 6 | Block ring on the island (centre to centre) | dia **11.94 m** | `[CARRIED, S1]` | 4 planters on a 7.2 x 2.4 m cluster | ring segments |
| 7 | Stepped circular plinth at the island centre | dia **5.2 m** | `[CARRIED, S1]` | **4 x 4 m square**, 1.9 m tall | stepped disc bands plus ribbon tiers |
| 8 | Sport court — **fenced enclosure** | **14.37 (X) x 12.99 (Z) m**, centre (-26.74, -27.44) | `[CARRIED, S1]` | **14 x 11 m**, `x -34..-20, z -34..-23`, centre (-27, -28.5) → **dX 0.26 m, dZ 1.06 m, dsize 0.37 x 1.99 m** | same footprint |
| 9 | Sport court — **painted surface** | **9.11 (X) x 7.87 (Z) m**, centre (-28.67, -28.25) | `[CARRIED, S1]` — **the first pass conflated 8 and 9; they are different rectangles** | **no painted surface exists** | 11 line stripes plus centre ring |
| 10 | Garage structural mass | about **10.6 x 12.4 m** | `[CARRIED, S1']` GLM section 2; **not** re-derived under the 3-anchor fit | `x 34..50, z -16..+12` = **16 x 28 m** | same |
| 11 | Courtyard planting cluster | 14.8 x 18.8 m | `[CARRIED, S1']` (dark cluster = planting, not the paved yard — scopes differ) | courtyard `x -10.4..11.6, z -19.2..-4.8` = 22 x 14.4 m | same |
| 12 | South garden water feature | dia about **7.5 m** near the garden-apron end | `[CARRIED, S1']` **single source** | absent | absent |

**Reading of rows 8 and 9, because it is the most actionable pair here.** The court
*enclosure* in the build agrees with the reference to **0.26 m in X and 1.06 m in Z** —
well inside tolerance. There is nothing to fix in the court footprint. What is missing is
that the reference's **painted** court is only 9.11 x 7.87 m — **63 % of the enclosure in X
and 61 % in Z** — so the correct build is a painted rectangle *floating inside* a larger
surfaced enclosure with a run-off margin all round, not paint to the kerb. `S2` already
draws lines; **`[OPEN]` whether it draws them at the measured 9.11 x 7.87 m extent.**

---

## 5. Callout-to-current-arena mapping, with the delta per area

Callout names are the community/guide vocabulary from **T4-b** `[VERIFIED]`. They are used
here as *addresses*, not as identifiers to ship.

### 5.1 The reference's own topology, as stated

`[VERIFIED, T4-b]` The guide's overview establishes: teams start at the **north and south**
ends; the **Central Courtyard** sits at the very centre, surrounded on four sides by
sections of the mansion; the **Gallery** (with art and a gold sculpture) is **north-east**
of it; the **Living Area** is **south** of it; the **Pool Area** is on the far **west**
with a central hot tub, a **circular bar building to its south** and, at its **far south**,
the **Basketball Court**; the **Roundabout** is on the **east** with the **Gallery** north
of it and the **Laundry** south of it; team one spawns in the **Garage** at the very north.
`[VERIFIED, T4-a]` the wiki adds that the south spawn is "in a garden area", the veranda
carries "an enclosed juice bar", and the north spawn is "around a garage and rear entrance
to the mansion".

`[VERIFIED, T4-b]` **Four passages converge on the Central Courtyard** — it is the map's
declared chokepoint and main action area. `[VERIFIED, T4-b]` the three named sniping
positions are **Gallery 2F** (across the Roundabout), **Laundry 2F room and balcony**
(across the Roundabout and the south spawn's passages), and **Bedroom 2F** (an unimpeded
view across the entire Pool Area).

`[VERIFIED]` **The build's four-way courtyard reproduces this exactly.** `raid2`'s house is
one mass `x -26..30, z -20..-4` with the courtyard between two interleaved partitions at
`x -11.2..-10.4` and `x 11.6..12.4`; C1 (Living Area) is on its -X side, C3
(kitchen/office, leading to the garage) on its +X side, the pool deck through the `z -20`
face and the drive through the `z -4` face. Mapping reference N/S to build +/-X and
reference W/E to build -/+Z, all four passages and all four neighbours agree.

### 5.2 Handedness — confirmed twice, independently

This matters because HF-461 nearly shipped Nuke Town mirrored.

- **Falsifier 1 `[CARRIED, S1]`** (`RAID2_MIRROR_RELATIONS`): the spa sits at X **+1.78**
  while the pool water centroid sits at X **-2.00**, so in the reference the spa is
  **3.8 m north of the pool's own centre**. A mirrored build puts it south. This is an
  asymmetry *within one flank*, which is why it survives where topology checks do not.
- **Falsifier 2 `[VERIFIED, T4-b]`, new in this lane and fully independent of the pixels:**
  the guide states that from the **Garage** (north spawn) the path to the **right** leads
  to the Bedroom and Pool Area and the road to the **left** leads to the Gallery and
  Roundabout; and that from the **south** spawn, **left** and down the stairs leads to the
  Basketball Court and Pool, **right** to the Laundry and Roundabout.
  In the arena's right-handed frame, a player at the +X end facing -X has right = **-Z**;
  a player at the -X end facing +X has right = **+Z**. The build places pool and court at
  **-Z** and the drive at **+Z**. **Both statements agree with the build, and they agree
  with each other from opposite ends of the map.** Handedness is confirmed.

**Recommendation:** add falsifier 2 to `src/raid2-fidelity.test.ts` alongside falsifier 1,
as a chirality assertion over `RAID2_BOUNDS`-relative positions. Two independent
falsifiers from two independent source classes is the standard this file should hold.

### 5.3 A naming hazard the layout lane will trip over

`[VERIFIED]` `src/raid2-arena.ts` calls the courtyard's `z = -20` face *"house north"* and
its `z = -4` face *"house south"*, while the reference's compass has **north = the garage
end = +X**. **The file's internal compass is rotated 90 degrees from the callouts'
compass.** Nothing is geometrically wrong — the mapping above holds throughout — but every
prose comment in the arena reads backwards against every guide sentence. **Fix the comments
in the same commit as the first layout change**, or the next agent will "correct" a correct
wall.

### 5.4 Delta per area

`C` = candidate `452d7aba`. `S2` = slice-2 `1c62b74f`. Ordered by impact.

| # | Callout | Reference says | Built `C` | Built `S2` | Delta | Claim-state |
|---|---|---|---|---|---|---|
| 1 | **Roundabout / Circle Drive** | circular carriageway dia 24.5 m; block ring dia 11.94 m; wide stepped circular plinth dia 5.2 m carrying a tall ribbon sculpture; **the map's statue is here** | rectangular paving 22 x 14 m; 4 x 4 m square plinth; 4 planters | circle, kerb ring, stepped plinth, ribbon | `C`: shape wrong (rectangle, not circle); plinth 0.77x the measured diameter. `S2`: closed | `[CARRIED, S1]` plus `[VERIFIED, T4-b]` for combat hotspots "around the statue in the Roundabout area" |
| 2 | **Pool Area** | organic body, fill 0.394, 23.37 x 11.63 m; central hot tub dia 3.45 m; round basin dia 6.53 m; **circular** bar building to its south; loungers, umbrellas, ladders | 28 x 8 m rectangle at fill 1.00; **no spa**; two **rectangular** blocks (a "hot tub pavilion" at `x -20..-15` containing no water, and a "pool bar" at `x 4..10`); no furniture | organic pool, spa and plunge; 5 loungers, 3 umbrellas, towel stack | `C`: pool shape wrong by 0.6 of fill; the hot tub is a *building* instead of *water*; one bar too many and on the wrong side. `S2`: water closed, **bar still rectangular and still doubled** | `[CARRIED, S1]` geometry; `[VERIFIED, T4-a/b]` "central hot tub", "circular bar building to the south", "enclosed juice bar" |
| 3 | **Vehicles** (drive and garage) | black van, white van, yellow coupe, orange coupe inside a garage bay, blue car. **No red coupe in any fetched frame.** One car does not spawn in objective modes | **none** | **none** | 100 % missing on both heads. The owner named "the cars" explicitly | `[CARRIED, S1']` roster; `[VERIFIED, T4-a]` objective-mode note |
| 4 | **Basketball Court** | enclosure 14.37 x 12.99 m; **painted court only 9.11 x 7.87 m inside it**; two hoop standards; regulation lines; surface reads cool slate blue; reached **down stairs** from the south spawn | enclosure 14 x 11 m (**agrees**); no paint, no hoops; surface `0x386b63` teal-green; one 0.35 m riser | enclosure same; 11 stripes and a ring; 2 hoop assemblies | Footprint **already accurate** — do not touch it. Missing: the inset painted rectangle, the colour family, the grade drop | `[CARRIED, S1]` sizes; `[CARRIED, S1']` colour; `[VERIFIED, T4-b]` "top of the stairs leading to the Basketball Court" |
| 5 | **Central Courtyard** | four-sided, **four passages converge**, the map's main action area; contains **planting** — a large tree, boulders, concrete planter runs, bougainvillea walls. **No fountain and no bronze statue** | four-sided with four mouths (correct), four piers (correct), **plus a 4 x 4 m fountain kerb with a water basin** | same, plus slice-2 dressing | Topology **correct**. The **fountain is an invention** — the reference's water and statue belong to the Roundabout | `[CARRIED, S1' D4]`, corroborated by `[VERIFIED, T4-b]`, which puts the statue at the Roundabout and never mentions courtyard water |
| 6 | **Garage** (north spawn) | structural mass about 10.6 x 12.4 m; bays with roller doors and a solar roof; a car in a bay; a **small room to its west**; a **road** leading left toward Gallery/Roundabout; **stairs up** to the Courtyard | 16 x 28 m; 3 bay piers on 6 m centres; gapped 0.40 m kerb; roof slab; workbench; crate stack. No roller doors, no solar roof, no side room, no stairs | same | Depth is **2.26x the measured mass** — but moving it moves team 1's spawns (HF-402's scar). The missing fittings are cheap; the depth is not | mass `[CARRIED, S1']` **single source, OPEN**; fittings `[CARRIED, S1' from S7]`; side room and stairs `[VERIFIED, T4-b]` |
| 7 | **Gallery** (NE of courtyard, 2F sniping position) | contains **art and a gold sculpture**; 2F overlooks the Roundabout | `raid2 gallery sculpture` exists as a 2.4 x 2.4 m **stone** hard-cover block; U4 balcony over the drive exists; no wall art | same | Correct in **placement and function**; wrong in **material** (stone, not gold); missing the hung art | `[VERIFIED, T4-b]` — **new in this lane; no prior Raid document in this repository records the gallery sculpture** |
| 8 | **Laundry** (S of Roundabout, 2F room and balcony) | 2F room and balcony give a clear view over the Roundabout and the south spawn's passages | U3 `x -25.2..-10, z -4..9` plus U3B balcony `z 9..10.6` | same | **Accurate. No action** | `[VERIFIED, T4-b]` |
| 9 | **Bedroom** (2F over the Pool Area) | unimpeded view across the **entire** Pool Area including the passage to the Courtyard; an **undercover area below it** at the north of the Pool Area | U1 `x 18..32, z -34..-21` on a 3.40 m floor; the colonnade undercroft sits below it | same | **Accurate. No action** | `[VERIFIED, T4-b]` — HQ site 5 is that undercroft |
| 10 | **Living Area** (S of courtyard) | large room; access to the south; a vantage looking east; stone fireplace, sofas | C1 `x -26..-10.4, z -20..-4` with hearth block, sofa run and stair | plus fireplace, embers, coffee table, rug | Correct in shape; interior sparse | `[VERIFIED, T4-b]` topology |
| 11 | **South spawn / garden apron** | "on a dirt patch at the very south"; a **garden area** with lawn, rock outcrops, retaining planters, steps | travertine paving; 2 mountable garden walls; 1 planter; 1 hard screen | same | Ground **material** wrong: paving where the reference is dirt/lawn. Missing rock outcrops | `[VERIFIED, T4-a/b]` prose; outcrops `[CARRIED, S1' from S8]` |
| 12 | **South garden pond** | dia about 7.5 m water feature near the garden apron | absent | absent | **Do not add yet** — single source, and it sits in a spawn apron | `[CARRIED, S1']` **OPEN, one source** |
| 13 | **Pool vista** | another map "can be seen in the distance from the pool area" — the west flank looks out over a city | boundary parapet plus presentation hillside skirt | same | The reference's pool flank is a **cliff-edge view over a city**, not a walled terrace. Strong art-direction lever, zero gameplay cost | `[VERIFIED, T4-a]` (trivia) |
| 14 | **Grade / hillside section** | stairs **up** from Garage to Courtyard; stairs **down** from south spawn to Court | flat except court -0.35 m and pool -0.55 m | same | See 3.3 | `[INFERRED]` — **advisory only** |

### 5.5 Objective anchors — a free accuracy check the build can adopt

`[VERIFIED, T4-b]`, and this is the cheapest fidelity win in the document because it costs
no geometry:

| Mode | Reference site | Nearest build address |
|---|---|---|
| Domination A | top of the stairs to the Basketball Court (south end) | `RAID2_DOMINATION_ZONES` A = (-34, 0, -4) — the **court is at z about -28; A is at z = -4** |
| Domination B | **west of the Roundabout**, near the passage to the Courtyard | B = (0, 0, +14) — *in* the drive, not west of it |
| Domination C | on the street **in front of the Garage** | C = (+34, 0, -4) — the garage is `x 34..50`, so C is at its mouth (correct) |
| Hardpoint | Roundabout; Living Area; Garage; Basketball Court; Central Courtyard | — |
| HQ | Courtyard; small room west of Garage; Gallery; Pool north of Court; undercroft below Bedroom; Living Area; east side of Roundabout | — |
| S&D / Demolition | A next to the circular bar in the Pool Area; B west of the Roundabout | — |

`[VERIFIED]` the arena's own comment says B was pulled off-centre **deliberately** for
spawn stability, and that moving it into the courtyard "would break spawn stability".
**`[INFERRED]`, advisory:** the reference's B is *west of* the Roundabout at the courtyard
passage — which is between the two, and may satisfy both the reference and the stability
argument. Worth one solver run; **not** a specified change.

**A is the real finding here.** The reference anchors A at the court stairs; the build
anchors it at (-34, 0, -4), roughly 24 m away in Z, in the laundry flank. `[OPEN]` — this
is a spawn-stability-adjacent change and needs the solver, not an edit.

---

## 6. Materials and palette, per area

### 6.1 What is authored today

`[VERIFIED]` `RAID2_PALETTE` in `src/raid2-arena.ts`, with Rec.709 relative luminance
computed by the arena's own `raid2PaletteLuminance`:

| Key | Hex | Luminance | Role |
|---|---|---|---|
| `travertine` | `0x9a8f7d` | 0.565 | the floor everything else is read against |
| `stucco` | `0xc4b6a2` | 0.723 | walls |
| `stone` | `0xa8a496` | 0.642 | hard cover: piers, kerbs, plinths, treads, rails |
| `timber` | `0x8f6f4e` | 0.490 | furniture and pergola piers — darkest family, on purpose |
| `court` | `0x386b63` | 0.365 | sport court |
| `poolTile` | `0x2f5f74` | 0.334 | pool basin |
| `water` | `0x2e9cb0` | 0.500 | `opacity: 0.82` tinted box |
| `glass` | `0xbfd8de` | 0.826 | `opacity: 0.40` |
| `planting` | `0x4a6540` | 0.363 | hedges and drive planters (**hard cover at 1.9 m**) |
| `hillside` | `0x79805f` | 0.486 | presentation-only skirt outside the boundary |

`[VERIFIED]` **Readability band 22 is live and it has already bitten twice**: `stone` was
lifted from `0x7b7466` (0.457, *darker than the floor it stands on*) to `0xa8a496`, and
`timber` from `0x6d4f36` (0.328) to `0x8f6f4e`. The rule is: **every cover family sits
above the paving's 0.565 in luminance, or it is a silhouette instead of cover.** Note that
`court`, `poolTile` and `planting` sit *below* the floor — legal, because they are floor
and backdrop, not vertical cover. **Any colour change proposed below must be re-checked
against this band before it ships.**

`[VERIFIED]` All ten are flat `MeshStandardMaterial`s: **no albedo map, no normal map, no
roughness map, no AO** on the candidate. The shipped Raid (`test2`) has **six** forged PBR
sets. That is the owner's "missing all the nice detail" complaint, as a number.

### 6.2 Palette and surface target, per area

Colour targets below are **families, not droppers** — the same discipline the Nuke Town
accuracy lane settled on, and for the same reason: a saturated albedo comes back *hotter*
under this arena's key than it reads in a hazy reference frame. Every row states a
correction, and **the correction, not the number, is the contract.**

| Area | Reference surface reads as | Claim-state | Current | Target family | Correction / risk |
|---|---|---|---|---|---|
| Courtyard and house floors | large-format pale travertine, warm-neutral | `[INFERRED]` from S2/S5 descriptions | `0x9a8f7d` flat | forge `raid2-travertine`: **cooler and larger-format than `test2`'s**, joint grooves at true physical size, per-tile vein direction from a position hash | must stay the luminance datum at about 0.565; **must not read like `test2` in the menu** |
| Mansion walls | rendered stucco modernist volumes; sunlit face and shaded return | `[INFERRED]` from S2/S9 | `0xc4b6a2` flat | forge `raid2-stucco`: trowel field plus grain; separate sunlit from shaded **by hue, not only by value** | the biggest single "loads of walls" contributor is unarticulated planar stucco |
| Cover: piers, kerbs, plinths, treads, rails | limestone / cast stone | `[INFERRED]` | `0xa8a496` flat | forge `raid2-limestone` | **hard floor: L >= 0.565. Do not darken** |
| Sport court | **cool slate blue** acrylic; crisp off-white regulation lines | `[CARRIED, S1' D8]` — **contradicts** the first pass's "dark athletic green/teal" | `0x386b63` teal-green (L 0.365) | forge `raid2-court`: fine aggregate grain, a different sheen inside the key, softened line-paint edge; **blue family** | **`[OPEN]` until band 22 is re-run.** A saturated blue is darker still; the court is floor, not cover, so it is probably legal — *probably* is not a gate result |
| Court lines | off-white paint film | `[CARRIED, S1' from S3]` | absent | painted rectangle **9.11 x 7.87 m inset in the 14.37 x 12.99 m enclosure** | **cut the floor under the lines**, or lift >= 0.034 m — never coplanar (section 7) |
| Pool basin and waterline | small mosaic with a grout lattice; **grout lighter than the tile** | `[INFERRED]` from S6 | `0x2f5f74` flat | forge `raid2-pool-mosaic` plus a waterline scum band | a dark grout line reads as a crack — the classic CG tell |
| Pool water | depth-absorbing; the map's saturated note | `[INFERRED]` from S6/S9 | `opacity: 0.82` tinted box | **Beer-Lambert absorption by depth** per `threejs-webgpu-water`; bubble backscatter at the spa | the most recognisable surface on the map, and also part of the arena's shot-surface/reflector budget — do not regress the `shots` flags |
| Drive island | cool river aggregate, hue-separated from the warm paving | `[CARRIED, S1' from S4]` | `stone` / `planting` | forge `raid2-gravel` | separate from travertine **by hue**, not by value |
| Planting | hedge and shrub canopy with translucency at grazing angle | `[INFERRED]` | `0x4a6540` flat | forge `raid2-planting` | the drive planters are **1.9 m hard cover** — a shooting backdrop, not dressing |
| Timber decking and furniture | warm timber | `[INFERRED]` | `0x8f6f4e` | forge `raid2-timber` | darkest family on purpose; **0.490 is the floor, not 0.328** |
| Garden apron | **dirt / lawn**, rock outcrops, planters | `[VERIFIED, T4-a/b]` plus `[CARRIED, S1' from S8]` | travertine paving | a dirt/lawn family, distinct from paving | changes a spawn apron's ground read; low geometric risk |
| Gallery sculpture | **gold** | `[VERIFIED, T4-b]` | `stone` `0xa8a496` | a warm metal family | it is 1.9 m hard cover, so band 22 applies: a dark bronze would fail, a **light** gold passes |
| Roundabout sculpture | tall red/bronze ribbon form on a stepped plinth | `[CARRIED, S1' from S4/S9]` | `C`: 4 x 4 m stone block. `S2`: ribbon tiers | keep the ribbon; the plinth is hard cover | enlarging the plinth to dia 5.2 m is a **band 8 / band 10 event** |
| Hillside skirt | ground beyond the boundary; **a city visible in the distance from the pool** | `[VERIFIED, T4-a]` | `0x79805f` (0.486) flat | keep the skirt below the playfield; add a **distant city horizon on the pool flank** | presentation-only, outside the boundary; **must not compete with the playfield** |

### 6.3 Lighting — the correction that resolves a contradiction in the prior file

`[VERIFIED]` The first Raid schematic asserted the original is "sunset/golden hour".
`[CARRIED, S1' D5]` an independent re-fetch found the load screen is **bright midday** —
blue sky, hard shadows. `[VERIFIED]` `src/rendering/arenas/raid2.ts` already grades the
arena for **high late morning**: key `0xfff2dc` at 2.62, sun at 52 degrees elevation, fog
pinned by the 125.7 m diagonal.

**Conclusion `[INFERRED]`, and it saves the lane a wasted re-grade: `raid2`'s existing
grade is already closer to the reference than the shipped Raid's golden hour is. Do not
re-grade toward gold.** Add the reference's actual character instead — a hard hillside sun
with a penumbra that grows with occluder distance; strong bounce off pale travertine into
soffits and the undersides of the upper rooms; sky-filled, cool but not crushed, shadow.
The hour (52 degrees against `test2`'s 18), the spectrum (neutral against golden) and the
paving format are the three levers that keep the two Raids from reading alike in the menu,
and **none of them may be spent chasing a reference frame's colour grade.**

---

## 7. Constraints any build against these findings must not break

`[VERIFIED]` from the arena, its gate and the prior lane reports. None of these may be
weakened, widened or skipped to admit an accuracy change.

1. **The cover rule.** Ground cover is mountable (top <= 0.75 m) or hard (>= 1.9 m).
   **Nothing in the 0.9-1.8 m dead band.** The 1.05 m balcony rail on the 3.40 m floor is
   the one documented exception. **This is why the vehicles are hard:** `[CARRIED, S1']`
   the reference's coupes stand about 1.35 m, squarely in the forbidden band. A vehicle
   must be authored as **one solid chassis collider** that is either mountable at
   <= 0.75 m or hard at >= 1.9 m, with the presentation shell lofted over it.
   **Presentation geometry never derives collision.**
2. **Bots do not climb.** Every zone needs one autostep route in (rise <= 0.42 m). This is
   HF-402's scar: a continuous 0.70 m kerb made the shipped map's garage unreachable and
   forced team 1's spawns into the house. Any new kerb, coping, plinth step or grade change
   re-runs the flood fill.
3. **Z-fighting is geometric here, not an offset.** No two surfaces coplanar; nothing drawn
   under a floor; court lines and paving markings **cut into** the floor, or the floor cut
   out beneath them. `[VERIFIED]` slice-2 lifts stripes 0.034 m (above the 0.03 m
   threshold, below a 0.05 m paint film) and its raid2 coplanar instrument reports
   `FINDINGS: 0`.
4. **The eye-blocking ratchet.** `[VERIFIED]` `eyeClusterCount: 34` against a band-8
   ceiling of 34 — **zero headroom**. Every new mass is a spend that must be paid for by
   consolidating another. `wallM2Per100M2Accessible: 15.55` against a band-10 ceiling
   of 17.0.
5. **The defining long lane.** The pool terrace is the map's one long line. `[VERIFIED]`
   the arena's own comment calls it "the one place nothing may be added" — dressing goes at
   the lane's **edges**.
6. **The NaN lesson.** `[CARRIED, S1' section 5]` the previous detail attempt lost
   **25 meshes** — the hoops, the court lines, the statue, the sculpture, the cornices — to
   `undefined + number = NaN` from six unexported constants, and the parity audit silently
   dropped them. `[VERIFIED]` the guard now exists (`40f5cf6a qa(parity): fail the
   collider/visual audit on a NaN-bounded authored mesh`). **Do not remove it, and check
   the mesh census after every dressing commit.**
7. **The legacy-main size ratchet** (LINE_CEILING 37,396), the **12 s WebGPU fence**, the
   **10 s cold-admission budget** and the **in-combat pipeline tripwire 0** are untouched by
   anything in this document and must stay that way.

---

## 8. Build order

Sequenced so that each step is independently gateable, the two zero-headroom ratchets
(band 8, band 10) are spent late and deliberately, and nothing depends on an `[OPEN]`.
One browser at a time on this machine; cells run **strictly in sequence**.

### Step 0 — base reconciliation (blocking, integrator)

Resolve section 2: rebase `raid2-slice-2` onto the candidate, or re-land
`raid2-reference.ts` and `raid2-shapes.ts` on the candidate. **Nothing below is meaningful
until there is one head.** Close slice-2's two open items (native-WebGPU judgesets; MP
arena-sync re-measure) or carry them forward explicitly. Fix the 5.3 compass comments in
this same commit.

### Layout (measured figures only — no `[INFERRED]` figure moves geometry here)

| # | Change | Source rows | Ratchet cost | Risk |
|---|---|---|---|---|
| L1 | **Handedness falsifier 2** — assert the 5.2 chirality relations in `src/raid2-fidelity.test.ts` | 5.2 | none | none. Do this **first**: it is free and it protects everything after it |
| L2 | **Court paint extent** — inset painted rectangle 9.11 x 7.87 m inside the 14.37 x 12.99 m enclosure, run-off margin all round, **cut into the floor** | 4 rows 8-9 | none (floor) | the coplanar instrument must stay at `FINDINGS: 0` |
| L3 | **Roundabout to a circle** — carriageway dia 24.5 m, kerb ring as a real collider, block ring dia 11.94 m, stepped plinth dia 5.2 m | 4 rows 5-7 | plinth enlargement is a **band 8/10 spend** — pay for it by consolidating the four free-standing planters into the plinth mass | the drive lane's cover budget; re-run layout metrics |
| L4 | **Pool to organic plus spa** — water fill 0.394, spa dia 3.45 m at (+1.78, -26.08), plunge dia 6.53 m | 4 rows 2-4 | coping is the north lane's cover line — **re-run bands 3 and 5** | already done on `S2`; verify the fill lands at 0.394, not 0.58 |
| L5 | **Courtyard: remove the fountain** — it is an invention; re-dress as planting (one large tree, boulders, concrete planter runs) | 5.4 row 5 | the kerb is 0.70 m mountable cover — **replace mass for mass** | `[VERIFIED]` the fountain basin is currently the arena's **largest shot-surface reflector**, and the arena's own comment warns it was once a single point of failure for reflective coverage. **Move that reflector to the drive plinth's water or to the pool before deleting it.** |
| L6 | **Circular bar building** — re-form the rectangular pavilion as a circular or octagonal pavilion on the pool's south (-X) side; **delete the second, unreferenced "pool bar" block** at `x 4..10` | 5.4 row 2 | deleting a block **returns** a band-8 unit — spend it on L3 | the pavilion roofline deliberately blocks the Bedroom-to-south-spawn line; **preserve that occlusion** |
| L7 | **Garage depth** | 4 row 10 | — | **`[OPEN]` — DO NOT ACT.** Single source, and moving the garage moves team 1's spawns. Needs S2 and S7 read together, or an owner screenshot |
| L8 | **Objective anchors A and B** | 5.5 | — | **`[OPEN]`** — run the spawn solver, do not hand-edit |
| L9 | **Hillside grade** | 3.3 | — | **`[INFERRED]` — advisory. Do not build from this document.** Commission a grade study first |
| L10 | **South garden pond** | 4 row 12 | — | **`[OPEN]`** — one source, and it sits in a spawn apron |

### Dressing and art (after the layout above is green)

Nine estate cells, in this order. Each cell: build, gate, 5 m eye-level capture plus a
**40 m** capture, at most three corrections, then accept or escalate. **The 40 m capture is
mandatory** — without it the loop optimises the 5 m frame into something unaffordable.

| # | Cell | Contents | Look reference (T2/T3 only) |
|---|---|---|---|
| D0 | **surface forge** | eight forged sets (6.2). Assert the noise period is an **integer** before the first surface. Author feature sizes in **millimetres** and record the measured result at shipped resolution. Every surface carries all three wear scales: 0.5-1.5 mm grain, 20-80 mm scuffs, 0.5-3 m traffic gradients. Measure `raid2Materials()` bake time twice; ceiling about 1.2 s | T3 photographs |
| D1 | facade-bay | pilaster rhythm, window bays, cornice, soffit, reveal depth, contact grime. **First, because every other cell abuts it** | T3 modernist rendered wall; T2 `raid2-house-spine` |
| D2 | pool-terrace | coping bullnose, waterline tile, loungers, umbrellas, towel stack, ladders, spa coping, glass balustrade, **and the distant city horizon on this flank** (5.4 row 13) | T3 residential pool and spa; T2 `raid2-pool-deck-return` |
| D3 | court | blue acrylic family (**after band 22 clears**), inset paint, two hoop standards, post pads, retaining steps | T3 outdoor acrylic court; T2 own frames |
| D4 | drive | circular carriageway surface, gravel island, stepped plinth, ribbon sculpture, urn and hedge ring, **2-3 parked vehicles** | T3 gravel drive; T3 **real vehicle**, three views including a true side elevation for pixel proportion; T2 `raid2-drive-approach` |
| D5 | courtyard | paving pattern, four piers, planting cluster, boulders, planter runs, one large tree | T2 `raid2-courtyard` |
| D6 | house-interior | Living Area fireplace, sofas and rug; kitchen island, stools and cabinet run; practicals | T3 interiors; `threejs-webgpu-interior-lighting-look` |
| D7 | upper-rooms | Bedroom furniture, Laundry and Gallery balcony rails, cornices, **the gold gallery sculpture and hung art** (5.4 row 7) | T2 `raid2-upper-bedroom`, `raid2-drive-balcony` |
| D8 | garage | bays, roller doors, benches, tire racks, lintels, solar roof, oil grime, one car in a bay, the small west room | T2 `raid2-garage-fan` |
| D9 | garden-apron | dirt/lawn ground family, rock outcrops, retaining planters, steps, hedge runs | T2 `raid2-west-apron` |

**Vehicles (D4 and D8) are the largest single spend in the lane**, and the owner named
them. Author each as one solid chassis collider — **mountable at <= 0.75 m or hard at
>= 1.9 m, never in the 0.9-1.8 m dead band** — with a lofted presentation shell over it.
`[VERIFIED, T4-a]` one car does not spawn in objective modes, which is a licence to make
the roster mode-dependent if the ratchet demands it.

**One originality note on the vehicles, `[INFERRED]` from `[VERIFIED, T4-a]`:** the wiki
records that the Cold War version of this mansion is "without the futuristic vehicles" of
the original, and the original is dated **2025** with near-future styling. So the reference
cars are concept-styled, not production models — which means an **original** near-future
silhouette is *more* accurate here than any real car would be. The originality boundary and
the accuracy goal point the same way.

---

## 9. Open items, and what would close each

| # | Open item | What closes it |
|---|---|---|
| O1 | Which head is the base (section 2) | Integrator decision |
| O2 | Garage true depth (4 row 10) | S2 and S7 read together under the 3-anchor calibration, or an owner screenshot. **Not** the single S1' figure |
| O3 | South garden pond (4 row 12) | A second confirming source |
| O4 | Court surface blue against teal (6.2) | Re-run fidelity band 22 with the blue family authored |
| O5 | Vehicle roster and the dead band (7.1) | A collider design that clears the band, plus a ratchet budget |
| O6 | Is the dia 6.53 m "plunge" the hot tub, or is the dia 3.45 m spa? T4-b says the hot tub is *central*, and the 3.45 m feature is the one nearest the pool centroid, so the naming in `RAID2_MEASURED` is probably right — **probably is not verified** | Read S6 against both measured discs |
| O7 | Domination A and B anchors (5.5) | Spawn solver run under the HF-402 constraint set |
| O8 | Hillside grade (3.3) | A dedicated grade study; **advisory until then** |
| O9 | Slice-2's own opens: native-WebGPU 5 m and 40 m judgesets; MP arena-sync re-measure | A GPU session on a quiet machine |
| O10 | Nothing in this lane was rendered | This is a **research-only** lane: no build, no browser, no GPU, per the time box |

### 9.1 What this lane deliberately did not do

No image from any external source was downloaded. No `src/` file was created or modified.
No build, no vitest run, no browser, no GPU. The heavy-work machine lock was therefore
never taken.

### 9.2 Contradictions resolved in this document

| Claim | Ruling |
|---|---|
| "The courtyard has a fountain and a bronze statue on a plinth, with four colonnade pillars" (first schematic, Fact 3) | **REJECTED.** Two independent sources place the statue at the Roundabout, and the courtyard reads as planting. The four piers survive — the build has them and they are load-bearing gameplay |
| "The original is golden hour" (first schematic) | **REJECTED.** Bright midday. The arena's existing late-morning grade is already closer than `test2`'s |
| "Court surface is dark athletic green/teal" (first schematic, Fact 12) | **REJECTED** in favour of cool slate blue, pending band 22 |
| "A red sports coupe is parked on the roundabout curb" (first schematic, Fact 9) | **REJECTED.** No red coupe appears in any fetched frame |
| The first schematic's whole zone-measurement table (its section 2) | **REJECTED.** It does not reproduce; the court box is about 2x the measured court and its centre misses its own tolerance by more than 10 m |
| Gamer Guides page = 106,392 B | **CORRECTED** to 105,737 B, reproduced twice independently. The page is dynamic, and byte counts must be recorded as such |

### 9.3 Search queries run (for reproducibility)

1. `Black Ops 2 Raid map callouts list courtyard garage pool statue`
2. `"Raid" Black Ops 2 multiplayer map layout description mansion basketball court driveway`
3. `Black Ops 2 Raid Domination A B C flag locations basketball court courtyard driveway`

Only the URLs these surfaced were followed; no search-engine summary is cited as evidence.

---

## 10. Claim-state attestation

- `[VERIFIED]` Every URL in 1.1 was fetched by this lane on 2026-09-05 with the recorded
  status and byte count; the sha256 of T4-a is published.
- `[VERIFIED]` Every "Built" figure in sections 4, 5.4 and 6.1 was read from
  `src/raid2-arena.ts` (candidate `452d7aba`), or from `src/raid2-arena.ts` /
  `src/raid2-reference.ts` on `origin/contrib/dave-gaming-pc/claude/raid2-slice-2`
  @ `1c62b74f`, in this session.
- `[VERIFIED]` Section 2's base-state finding was established with `git ls-tree` and
  `git merge-base --is-ancestor`.
- `[CARRIED, re-derivable]` Every reference dimension in section 4 comes from a prior
  lane's published, re-runnable pixel method with published residuals. **This lane did not
  re-run the pixel work and does not claim to have measured any image.**
- `[VERIFIED]` Section 5.2's falsifier 2 and section 5.4 rows 7, 11 and 13 are **new** — no
  prior Raid document in this repository records the gallery's gold sculpture, the
  dirt/garden ground of the south spawn, the city vista from the pool flank, or the
  two-ended left/right handedness confirmation.
- `[INFERRED]` figures are confined to 3.3 (grade), 5.5's B-flag suggestion, 6.2's material
  families, 6.3's lighting conclusion, section 2's base recommendation and section 8's
  vehicle-styling note. **All of them are advisory and none of them is a measurement.**
- `[OPEN]` Ten items in section 9. None of them drives geometry.
