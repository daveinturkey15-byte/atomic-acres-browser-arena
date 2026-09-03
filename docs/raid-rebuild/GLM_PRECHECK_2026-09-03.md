# GLM Pre-Verification — Raid Rebuild research & dressing claims

**2026-09-03 · GLM-1 (GLM 5.3 Flash via OMP) · independent re-derivation for HF-427 Lane AV**
**Worktree:** `C:/Users/david/projects/aa-claude-raid3` · **Branch:** `contrib/dave-gaming-pc/claude/raid2-detail-accuracy` · **HEAD:** `eac254e7`
**Scope:** re-verify `docs/raid-rebuild/REFERENCE_SCHEMATIC.md` (commits `a0eaac1f`, `eac254e7`), `SPATIAL_PLAN.md`, `ASSET_INVENTORY.md` against `docs/pass84-lanes/LANE-AV-raid-detail-accuracy.md`. Owner rule: Gemini research is unverified until independently re-derived. No `src/` changes; one report commit.

---

## 1. Sources fetched this session (curl, no browser)

Every citation in the schematic was re-fetched. Byte counts are `%{size_download}` of a fresh GET.

| # | Citation | HTTP | Bytes (mine) | Bytes (claimed) | Content check |
|---|---|---|---|---|---|
| 1 | MediaWiki image query API | 200 | 4,276 | 4,276 | JSON image index — matches |
| 2 | Minimap `Raid_Minimap_BOII.png` | 200 | 86,042 | 86,042 | Is the minimap — matches |
| 3 | `Raid_aerial_view_BOII.png` | 200 | 860,522 | 860,522 | Estate rooflines, pool, court, roundabout, open courtyard all visible — matches |
| 4 | `Raid_basketball_court_BOII.png` | 200 | 380,350 | 380,350 | Regulation lines, one hoop visible (glass board, orange rim, white net), pole pad — matches, **but surface is BLUE, not "dark athletic green/teal"** |
| 5 | `Raid_compound_entrance_BOII.png` | 200 | 673,670 | 673,670 | Roundabout, stepped plinth with red/bronze ribbon sculpture, ring of square concrete blocks, **black van + white van + yellow coupe**. No red coupe in this frame |
| 6 | `Raid_courtyard_BOII.png` | 200 | 568,726 | 568,726 | **MISLABELED.** Shows a large tree, boulders, concrete planter runs, bougainvillea walls. NO fountain, NO bronze statue, NO four colonnade pillars. The schematic attributes the roundabout fountain to this file |
| 7 | `Raid_scenic_veranda_BOII.png` | 200 | 317,410 | 317,410 | Round hot tub, circular juice-bar pavilion, loungers, big dark pool — matches |
| 8 | `Raid_FBI_spawn_point_BOII.png` | 200 | 615,574 | 615,574 | Garage bays with roller doors, solar roof — matches; claimed "tool benches, tire racks, vehicle hoist, black sedan" NOT visible; an orange/red car sits inside a bay, a blue car on the drive |
| 9 | `Raid_Mercs_spawn_point_BOII.png` | 200 | 996,996 | 996,996 | Garden, retaining planters, steps — broadly matches; "hedges" is really lawn + rock outcrops + planters |
| 10 | `Raid_Load_Screen_BOII.png` | 200 | 516,362 | 516,362 | **MISLABELED.** Image is bright MIDDAY (blue sky, hard shadows), not "sunset/golden hour". Confirms the red spiral sculpture on a wide stepped circular plinth, square blocks, yellow coupe under a portico, white van |
| 11 | MediaWiki wikitext API | 200 | 7,008 | 7,008 | JSON synopsis — matches |
| 12 | Gamer Guides tactical guide page | 200 | **105,737** | 106,392 | Page resolves; byte count drifts (−655 B, dynamic page) |
| 13 | Gamer Guides "callout map" jpg | 200 | 76,531 | 76,531 | **MISLABELED.** It is a Create-a-Class loadout screenshot (MSMC / Ballistic Knife / perks), not a tactical callout map |
| 14 | Gamer Guides overview jpg | 200 | 149,494 | 149,494 | Gameplay still at the pool; broadly matches |
| 15 | `callofdutymaps.com/black-ops-2/raid/` | 403 | **5,439** | 0 | Status matches; a Cloudflare challenge body IS served (5,439 B, not 0 B). Correctly excluded from use |

**Citation verdict:** 15/15 URLs resolve as claimed on status; 13/15 byte counts reproduce exactly; 3 citations (6, 10, 13) do not show what the schematic says they show, and 2 more (4, 5) diverge in stated details (court colour; vehicle list).

---

## 2. Independent minimap measurement (method + numbers)

**Method (re-runnable).** Pillow 12.3 / NumPy 2.5 on the downloaded `minimap.png` (512×512 RGBA). Masks on opaque pixels (alpha > 20), `gray = (299R+587G+114B)/1000`:
- envelope: `alpha > 20`, min/max of nonzero;
- teal water: `B ≥ R+10 and G ≥ R+5`;
- pool body: 4-connected flood fill from px (x=125,y=250) over `33 ≤ gray ≤ 62, B−R ≥ 3, G−R ≥ 3`, window x 98–205 / y 192–332;
- structures: 4-connected components of `gray ≥ 135` (bright masses) and `gray ≥ 140` hulls inside tight windows;
- roundabout: 120 radial rays from the ring centre (x=361,y=241); outer curb radius = median of the outermost `gray ≥ 150` run, island ring = median innermost run;
- engine mapping (the schematic's own scales): `X = 50 − (y−15)·0.2062`, `Z = (x−63)·0.1995 − 38`.

| Measurement | Result (px) | Engine (m, schematic calibration) |
|---|---|---|
| Playable envelope | x=[63,443] y=[15,499], 381×485, H/W=1.2730 | — reproduces the schematic EXACTLY |
| Pool water body (flood fill) | bbox [100,204,159,312], 60×109 px, fill 0.38 (organic) | 11.8 m (short axis) × 22.3 m (long axis), centre (−0.1, −24.7) |
| Round spa at pool's north edge | teal disk 19×14 px inside bright rim 16×20 px | Ø ≈ 3.6–4.0 m at (2.9, −20.7) |
| Basketball court (bright hull) | [108,345,171,411], 64×67 px (court rectangle proper ≈ 50×52 px) | 12.6 × 13.6 m, centre (−24.9, −22.7) |
| Roundabout outer curb | median ray radius 60.0 px (n=117) | Ø ≈ 24–24.7 m, centre (3.4, 21.4) |
| Island fountain ring / planter ring | inner ring Ø 27 px; planter boxes span ~65–90 px | fountain Ø ≈ 5.4 m; island with blocks Ø ≈ 13–18 m |
| Courtyard planting cluster (dark) | [222,196,295,286], 74×91 px | 14.8 × 18.8 m, centre (3.4, 1.0) |
| North flank building complex (bright hull) | [160,43,344,154], 185×112 px | 22.9 × 36.7 m, centre (32.8, −0.3) |
| Garage bright mass (NE window) | [255,43,308,104], 54×62 px | 10.6 × 12.4 m, centre (37.9, 5.6) |
| South spawn terrace (bright hull) | [213,420,298,466], 86×47 px | 9.5 × 17.0 m, centre (−38.3, 0.4) |
| South garden pond (teal) | [249,383,287,419], 39×37 px | Ø ≈ 7.5 m at (−29.6, 2.9) — present in reference, absent from schematic AND build |

**Calibration caveat (OPEN):** the alpha envelope includes out-of-bounds hillside margins, so absolute positions carry a systematic offset (reference content lands ~6–8 m further +Z than the build under this mapping). Size and aspect ratios are robust; absolute centres are not. The schematic inherits the same bias — but its own zone table still fails its own tolerance on its own terms (see §3).

---

## 3. DIFF TABLE — schematic vs my measurement vs built (`src/raid2-arena.ts`, read-only)

Ratios are extent ÷ axis (short axis = 76 m / envelope W 381 px; long axis = 100 m / envelope H 485 px). Tolerance: 5% of the long axis = 5 m (0.05 ratio on the long axis, 0.066 on the short).

| Element | Schematic | Mine | Built (`raid2-arena.ts`) | Agree (≤5 m)? | Note |
|---|---|---|---|---|---|
| Envelope aspect | 1.2730 | 1.2730 | 100×76 → 1.3158 | YES (3.4%) | Schematic envelope and bytes reproduce exactly |
| Pool basin | zone 117×210 px → 0.307 / 0.433 | water body 60×109 px → 0.157 / 0.223 | rect x −14…+14, z −33…−25 → 0.105 short / 0.28 long | NO (shape) | Reference pool is a ~22.3×11.8 m ORGANIC body + round spa; schematic's zone is a terrace envelope, not the basin; built is a 28×8 rectangle. Position Δz 4.3 m OK; shape wrong in both docs |
| Spa / hot tub | not measured | Ø ~3.6–4 m at (2.9, −20.7) | none (juice-bar pavilion building at (−17,−31) instead) | NO | Reference spa is a water feature at the pool's NE edge |
| Basketball court | 97×120 px → 0.255 / 0.247, centre (−35.67, −28.23) | 64×67 px → 0.168 / 0.138, centre (−24.9, −22.7) | x −34…−20, z −34…−23 → 0.184 short / 0.14 long, centre (−27, −28.5) | Mine↔built YES (Δ1.4 / 2.6 m; Δz 5.8 marginal). Schematic↔mine NO | Schematic's zone is ~2× my measured court and its centre misses its own tolerance by >10 m |
| Roundabout (drive) | Fact 8: island Ø 14 m | outer Ø ~24–24.7 m; island+blocks Ø ~13–18 m | paving rect x −11…+11, z +5…+19 (22×14) | YES (scale) | Built "circle" is a rectangle; reference is a circle — topology kept, shape stylized |
| Island fountain | — | ring Ø 5.4 m | plinth 4×4 m | YES (Δ1.4 m) | Reference (loadscreen) shows a much larger stepped circular plinth |
| Courtyard | 105×140 px → 0.276 / 0.289 | dark cluster 74×91 px → 0.194 / 0.188 | x −10.4…+11.6, z −19.2…−4.8 → 0.184 / 0.22 | Mine↔built YES (Δ3.2 / 1.1 m) | My cluster = tree/planting, not the paved yard — scopes differ, flagged in §6 |
| North flank (U1 wing) | U1 box 112×135 px → 0.294 / 0.278 | whole north complex 185×112 px (not per-wing) | U1 x 18…32, z −34…−21 | NOT COMPARABLE | Schematic's U1 box starts at x=63 px where the minimap has hillside/road, not the wing |
| Garage | box 180×115 px → 0.472 / 0.237 | bright mass 54×62 px → 0.142 / 0.128 | x 34…50, z −16…+12 → 0.21 short / 0.28 long | NO vs schematic | Schematic garage box is ~3× the visible garage mass (covers drive/approach); built footprint deeper along z than the reference structure (OPEN, §6) |
| Mercs spawn apron | 130×89 px → 0.341 / 0.183 | terrace hull 86×47 px → 0.226 / 0.097 | spawn zone x −48…−32, z −16…+4 (12 spawns, 6+6) | zone scope differs | Built spawn zone contains my measured terrace; positions face the right directions (FBI north, Mercs south) ✓ |
| Spawns | 12 total, mirrored ends | directions confirmed on minimap | team0 x −32…−48 / team1 x +32…+48, 6+6 | YES (topology) | — |

---

## 4. Dressing counts — `ASSET_INVENTORY.md` claims vs code at HEAD

Headless build via the repo's own audit factory (`loadArenaFactories()['raid2'].build(scene)` in plain Node/tsx, same path `scripts/qa/audit-collider-visual-parity.ts` uses; `collectMeshes()` census + full family list). Scratch runner deleted after use; nothing under `src/` touched.

| Claim (ASSET_INVENTORY, at Lane AQ base) | Measured at HEAD `eac254e7` | Verdict |
|---|---|---|
| 218 visible meshes | **317 collected; 342 authored** (25 authored meshes are dropped by the audit's NaN guard — see §5) | STALE — expected after Job 2, but the doc was not updated |
| 212 movement / 212 physics colliders | **215 / 215** (+3 = the three car chassis colliders) | STALE by exactly the cars |
| "Every visible mesh is a BoxGeometry emitted by one `rect()` helper" | FALSE at HEAD — dressing adds Cylinder/Torus/Cone/Ring/Icosahedron geometries in `raid2-dressing.ts` | STALE (was true at the old base) |
| 6 presentation-only surfaces incl. `raid2 wing glazing` + `raid2-presentation-presentation-batch-0` | wing glazing REMOVED at HEAD (eye-clearance fix, arena lines 515–531); **no batch mesh is produced** (`batchPresentationOnlyBoxes` at arena line 783 finds no candidates — dressing meshes sit in a subgroup and `rect()` meshes carry no candidate flag) | STALE |
| Invisible colliders 0 / walk-through 0 | census consistent (not re-audited here) | unchanged claim |

**Dressing pieces the code actually emits per zone** (from the census; "NaN" = positioned at NaN, invisible — see §5):

- Vehicles: 3 cars × 14 meshes (1 solid chassis collider + 13 visuals) = 42, colliders live.
- Basketball court: 8 hoop meshes (2×pole/board/ring/net) **all NaN**; 8 court-line meshes **all NaN**.
- Pool terrace: 27 meshes present (5 loungers×2, 3 towels, 3 umbrellas×2, 4 ladder rails, 4 bar stools).
- Roundabout: 10 present (gravel bed, 4 urns + 4 shrubs) + helix sculpture **NaN**.
- Courtyard: 9 present (fountain kerb/basin, 4 piers, 4 pots) + statue **NaN**; 4 cypress trees present.
- Living room: 4 present (fireplace, embers, coffee table, rug).
- Kitchen: 4 present (3 stools, cabinet) + island top **NaN**.
- Garage: 4 present (tool cabinet, 3-tire stack).
- U1 bedroom: bed base + headboard **both NaN**.
- Cornices: 4 **all NaN**.

---

## 5. Blocking finding — the Job 2 commit does not type-check and 25 dressing pieces sit at NaN

**VERIFIED (measured, re-runnable):**

1. `npx tsc --noEmit` at HEAD exits **2** with `TS2459: Module '"./raid2-arena"' declares 'COURT_Y'/'HARD_COVER'/'MOUNT'/'POOL_FLOOR_Y'/'UPPER_FLOOR_Y'/'WALL_TOP' locally, but it is not exported` (×6, `src/raid2-dressing.ts` line 15) plus 3 unused-import warnings. `raid2-arena.ts` declares those constants as module-private `const` (lines 152–181); only `STEP`, `STAIR_RISERS`, `STAIR_RUN` are exported.
2. Runtime consequence, measured by building the arena headless: every dressing mesh whose Y depends on an imported constant gets `undefined + number = NaN` under esbuild/tsx (no type-check). 25 meshes carry NaN `matrixWorld`: court lines ×8, hoop assemblies ×8, courtyard statue ×1, drive helix ×1, kitchen island top ×1, U1 bed ×2, cornices ×4. `Box3.setFromObject` returns NaN for them, so the collider/visual audit silently drops them — **the arena's most iconic Job-2 features (hoops, painted court lines, cornices, statue, helix sculpture) do not exist at their authored positions.**
3. Therefore the lane's own gate list ("tsc; raid2 fidelity test re-derived; parity + walkable audits at 0") cannot have been green at `eac254e7`, and REFERENCE_SCHEMATIC §5's "Correction Applied" column is unrealized for exactly those rows. The schematic §7 "CLAIMED: Job 2… will satisfy all 18 fidelity gate bands" is **not merely unproven — the build under test does not compile.**

**Minimal fix shape (for the owner lane, not this task):** export the six constants from `raid2-arena.ts` (or re-declare locally in `raid2-dressing.ts`), re-run tsc, then re-run the parity/walkable audits — and consider making the audit FAIL on NaN-bounded authored meshes instead of silently excluding them, so this class of defect cannot pass again.

---

## 6. DISAGREEMENTS and OPEN questions for the Opus reviewer

| # | Finding | Claim-state |
|---|---|---|
| D1 | `tsc` fails at HEAD; 6×TS2459 + 3×TS6133 in `raid2-dressing.ts` | VERIFIED |
| D2 | 25 dressing meshes at NaN positions (list in §4/§5); invisible in engine; audit silently excludes them | VERIFIED |
| D3 | Citation 13 ("callout map") is a loadout screenshot | VERIFIED |
| D4 | Citation 6 (courtyard) described as fountain/statue/colonnade; actually tree + boulders + planters. The fountain/statue belongs to the roundabout | VERIFIED |
| D5 | Citation 10 described as golden-hour sunset; actually bright midday | VERIFIED |
| D6 | Schematic minimap zone boxes: court ~2× measured size, centre off by >10 m under its own calibration; garage box ~3× the garage mass; U1 box overlaps non-playable pixels | VERIFIED (method in §2) |
| D7 | Reference pool is a large organic body (~22.3×11.8 m) + round spa at its NE edge; schematic Fact 5 and the build model a 28×8 m rectangle with "steps at both ends" | VERIFIED (measurement); design response OPEN |
| D8 | Reference court surface is blue; schematic says "dark athletic green/teal"; built material `0x386b63` is teal-green | VERIFIED |
| D9 | Reference vehicles in fetched stills: black van, white van, yellow coupe, orange coupe (in a garage bay), blue car — no red coupe visible in any fetched frame; built has red/yellow/black | VERIFIED (fetched evidence); red-coupe existence OPEN |
| D10 | Reference roundabout: wide stepped circular plinth with tall red spiral sculpture; built: 4×4 m plinth + 1.45 m torus. Ring of square concrete blocks correctly inspired the urn/shrub ring | VERIFIED; fidelity gap OPEN |
| D11 | ASSET_INVENTORY is stale vs HEAD (counts, "one geometry call site", presentation-only table incl. removed wing glazing and a batch mesh that is no longer produced) | VERIFIED |
| D12 | gg-guide byte count drifts (105,737 vs claimed 106,392); codmaps 403 body is 5,439 B vs claimed 0 B — statuses honest, bytes should have been recorded as dynamic | VERIFIED (minor) |
| O1 | Absolute minimap→engine positions carry a calibration offset (~6–8 m +Z) because the alpha envelope includes out-of-bounds margins. Recommend calibrating on identifiable anchor pairs (pool centre, roundabout centre) before trusting absolute centre claims | OPEN |
| O2 | Built garage footprint (28 m z-span) vs reference bright mass (~10.7 m z-span): is the built garage ~2× too deep, or is the minimap mass roof-only? Aerial suggests a modest structure | OPEN |
| O3 | South garden pond (Ø≈7.5 m water feature at engine ≈ (−29.6, +2.9)) exists in the reference minimap and in NEITHER the schematic nor the build | OPEN (possible authentic addition) |
| O4 | Whether fidelity bands (§6 of the schematic) hold at HEAD cannot be confirmed here without running the suite (out of scope); D1/D2 make the schematic's §7 CLAIMED row unsafe to rely on until re-run after the export fix | OPEN |

**Bottom line for the reviewer:** the citation provenance discipline is real (statuses/bytes reproduce almost exactly, and the minimap envelope measurement reproduces to the pixel), but the schematic's zone-box measurements do not reproduce, three citations are mislabeled, the layout deltas that matter are pool shape, court size/colour, vehicle roster, roundabout island scale, and one omitted water feature — and, blocking everything, HEAD does not compile and 25 dressing meshes (the headline detail work) sit at NaN. Re-verify after the constants-export fix before any visual HITL.

*Method, scripts and fetched artefacts: `%TEMP%/glm-precheck/` (curl outputs, crops, census transcript). No game source was modified; this report is the only file committed.*
