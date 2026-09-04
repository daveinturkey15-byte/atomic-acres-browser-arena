# Muse review — PASS 94 TECHNIQUES lane (skeptic pass)

Branch: `contrib/dave-gaming-pc/claude/nuketown2-techniques` @ `e41654cd`.
Base: `origin/contrib/dave-gaming-pc/claude/nuketown2-handedness`.
Scope read fully: `git diff` stat 10 src/scripts files (+2775/−2),
`src/nuketown2-vegetation.ts` (741), `src/nuketown2-pool-water.ts` (330),
`src/nuketown2-yard-props.ts` (392), `src/nuketown2-grime-decals.ts` (368),
`scripts/qa/audit-nuketown2-frame-loop.mts` (164), arena hooks (52 lines),
all four new tests, REPORT.md (384 lines), coplanar + frame-loop JSON.
No builds, no browsers, no npm — code-read review only.

## 1. Module vs report claims

Pool absorption integral per channel — VERIFIED: `src/nuketown2-pool-water.ts:252`
`pathLength = depthM + depthM/cosTheta`; `:276-281` per-channel
`exp(-sigma*path)` with extinction `[0.92,0.16,0.11]` (`:123`); red fastest,
green slowest — matches "deep water goes cyan-green".
Backscatter upstream of integral — VERIFIED: `:273` `incoming` assembles
`scatter` first, `:285` `incoming.mul(transmittance)` — the order the test
pins (`nuketown2-pool-water.test.ts:115-127`).
Fresnel at iorRatio 1.33 — VERIFIED: `:314-316` Schlick `r0=((1-n)/(1+n))^2`,
opacity from fresnel + thickness + foam (`:321-324`).
CPU/GPU bed agreement — VERIFIED: `:222` GPU `smoothstep(0,1,shelfT)` vs
`:164` CPU `t*t*(3-2t)` — same smoothstep; depth zero outside sheet (`:159`).
WebGL2 compat is a flat tint — VERIFIED but disclosed: `:186-195` returns
constant colour/opacity; report §2.2 describes the WebGPU path only. Not a
finding (compat coverage by contract), but the report should say so in §2.2.
LOD switching by distance — VERIFIED: `src/nuketown2-vegetation.ts:641`
`lod.addLevel(mesh, HEDGE_LOD_M[level])` with `[0,22,40]` (`:619`),
trees `[0,26,48]` (`:665`); geometry baked in run-local frame, LOD object
positioned at the run (`:632`) / sector centroid (`:683`) — the first-cut
origin bug the report admits is actually fixed.
LOD granularity caveat — VERIFIED: switching is per hedge-run (8 LODs) and
per avenue SECTOR (4 LODs at sector centroids, `:675-683`), not per tree.
"LOD switching is by distance" is true at LOD-object level; a sector's 54
trees share 4 distance decisions. No fix needed; report §2.1 should say
"sector-level" once.
Wind writes uniforms only, no per-frame allocation — VERIFIED:
`:733-735` index loop assigning `times[i].value`; two shared `uniform(0)`
(one per species, `:246`, `:609`, `:653`); nothing else in the closure.
Heap 19.99 B/frame in `frame-loop-after.json` is sampling noise vs 18.45
baseline — report's read is honest.
Decals on -3 tier — VERIFIED: `src/nuketown2-grime-decals.ts:72,109-111`
`polygonOffsetFactor/Units = -3`, below driveDecal (−1) and lawn (−2).
Decals never inside carriageway footprint — VERIFIED for carriageway:
drive decals inset 0.1 m inside drive rect (`:327-333`), z1=−8.1 clear of
turning-head z0=−8; report OPEN 1 (carriageway marks refused) is the right
call — `find-coplanar-pairs.ts` ignores offsets on STREET pairs, so any
carriageway decal would be a STREET-FINDING regardless of tier.
FINDING 1 (SUSPECTED, visual unconfirmed): stacked ground decals share one
depth. `src/nuketown2-grime-decals.ts:312-324` — every ground decal uses
identical `GRIME_Y`; drive tyre scuff + slab crack share the identical rect
(`:331` vs `:333`, 4.8×7.8), border tyre + crack share 35.6×5.6
(`:337-338`), all with the identical −3 offset. Same-offset coplanar
transparent layers still z-fight each other; the gate counts them FENCED
(offset present) so 0 FINDINGS is instrument-true but visually unresolved —
and OPEN 8 admits no camera resolves a decal. Smallest fix: stagger ground
families by 1 mm (`GRIME_Y + familyIndex*0.001`) or merge tyre+crack into one
material. File: `src/nuketown2-grime-decals.ts:314-324`.
FINDING 2 (OPEN): appliance bank at `src/nuketown2-yard-props.ts:254`
`(x −10.4, z −8.4)` sits at the drive/turning-head edge (drive z[−16,−8]),
NOT in yard-lawn z[−36,−23] with the other three props — while report §2.3
presents all four as yard props. Its footprint overlaps the drive-decal band
(z −8.8…−8.0 vs decals to −8.2) — harmless vertically (solid vs 3 mm film)
but the placement rationale is unstated. Smallest fix: one-line comment
stating the reference position, or move into the yard band. File:
`src/nuketown2-yard-props.ts:254`.
Frame-loop instrument honest — VERIFIED:
`scripts/qa/audit-nuketown2-frame-loop.mts:50-89` counts LOD as one draw at
the selected level, InstancedMesh as one, skips `visible=false` batcher
sources; `frame-loop-after.json` (391 draws, 224215 typical / 247777 worst
tris, 1 entry point, 300 colliders) matches report §3 arithmetic
(12 + 13 + 8 + 2 = 35).
Draw-call ceiling claim — VERIFIED: +35/+9.83 % under the 15 % ceiling; the
2 hob-deck draws are forced by the two-material chirality anchor — fair.

## 2. Collider parity

Hedges add no invisible solids — VERIFIED: `buildNuketown2Vegetation` adds
only to `builder.root` group (`:717`), never `builder.colliders`; test
`nuketown2-vegetation.test.ts:95-110` asserts no collider/raycast/shot delta
against the real built arena. The 0.07 m clad lip + 0.06 m crown
(`:442,449`) overhangs the host collider — shots pass through 7 cm of leaf
lip; presentation-only foliage is explicitly allowed non-solid ("tiny grass,
decals, particles may remain non-solid", AGENTS.md) — admissible, disclosed.
Props with cover have matching colliders — VERIFIED:
`src/nuketown2-yard-props.ts:230` `SOLID={solid:true,shots:true,cast:true}`
on all four `silhouette` boxes; hob deck/plinth/panels/handles are DRESSING
or FLAT (`:231-232`), hob non-solid so red/blue share one collider —
"identical collider" claim true. Silhouette = whole visible mass for cabinet,
glasshouse shell, pod shell, sand kerb (`:288-292,321-322,357-358,377-378`).
Dressing overhang ≤0.05 m (eaves/cill/bands wider than shell, posts flush at
outer face `:331-339`) inside the test's 0.15 m lip
(`nuketown2-yard-props.test.ts:75-92`) — shots:false dressing, acceptable.
Glasshouse coplanar cure — VERIFIED: eaves stop 0.06 m under shell (`:331`),
posts 0.10 m under (`:337-339`); sand 0.05 m under kerb top (`:382-383`);
pod cap and seats share material with their base (same-material benign, not
a gate FINDING) — the instrument's 0 FINDINGS is earned, not gamed.
Spawn clearance + autostep — VERIFIED by test
(`nuketown2-yard-props.test.ts:139-162`): 3 m spawn clearance, 0.30 m kerb
under 0.42 m autostep.
Pool grants no authority — VERIFIED:
`nuketown2-pool-water.test.ts:143-169` (no collider/shot/swim,
profile-invariant `:171-177`).

## 3. Merge risk vs sibling lanes (same handedness base)

All three siblings massively rewrite `src/nuketown2-arena.ts`, so every
techniques hunk conflicts textually even where semantically orthogonal:
techniques hook hunks `@@ -113,6 +113,15 @@`, `@@ -150,9 +159,10 @@`,
`@@ -2461,6 +2471,30 @@`, `@@ -2482,9 +2516,25 @@` vs ballistics
(−1058/+817 over 12 files, arena −582 net), vehicle-forge (arena ±771),
spawn-distribution (arena ±1399, deletes facade/interior/street/vehicle
material modules techniques-adjacent code imports from).
Exact techniques hook lines (HEAD `src/nuketown2-arena.ts`) that will
conflict, with keep-both resolutions:
1. `:116-124` vegetation/grime/props imports — VERIFIED present. Conflict:
siblings edit the same import block (ballistics drops `NUKETOWN2_HANDEDNESS`
imports nearby). Resolution: keep sibling's import rewrite, re-add the three
techniques imports unchanged.
2. `:164-165` pool-water import + dead-code comment — VERIFIED present.
Conflict: any sibling touching interior-materials imports. Resolution: keep
techniques import; leave `createNuketown2PoolWaterMaterial` in
`nuketown2-interior-materials.ts` deleted-by-nobody (report OPEN 4 routes
deletion to a later tidy — tell siblings the same).
3. `:2474-2483` hero-prop `pair()` loop incl. red-north/blue-south comment —
VERIFIED present. Resolution: re-emit after sibling's `cars()`/coach block
at the same anchor (before `batchPresentationOnlyBoxes`); the
`pair(builder,…,[m.hobRed,m.hobBlue])` tuple form (`:826-831` =
north/south) must survive whatever `pair()` refactor siblings land.
4. `:2485-2496` grime `pair()` loop (`solid:false,shots:false,cast:false`) —
VERIFIED present. Resolution: same anchor; if vehicle-forge moves street
vehicle bodies, re-check the 0.1 m drive insets, then re-run
`find-coplanar-pairs.ts` (report OPEN 6 already orders this).
5. `:2520-2538` vegetation build + merged `nuketownLawnWind` closure —
VERIFIED present. Conflict: highest risk — all siblings plausibly touch the
lawn/batcher/wind tail. Resolution: keep exactly one `nuketownLawnWind`
entry point calling both `lawn.advanceWind` and `vegetation.advanceWind`;
keep `buildNuketown2Vegetation` AFTER `batchPresentationOnlyBoxes`
(LOD/InstancedMesh are not batch candidates).
Note: techniques diff also touches `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`
(+62) — outside the lane's five-module brief; integration should confirm
that hunk is intentional, not drift.

## 4. Hob colour ↔ house colour

Which house is orange on this branch? NEITHER — VERIFIED:
`src/nuketown2-arena.ts:898-903,1027-1028`: north siding BLUE `0x46809f`
(`sidingA`), south siding YELLOW `0xf4be36` (`sidingB`), ORANGE is both
garage wings (`garageSiding`, shipped `siding-coral` family, §5.3 comment
`:957-963`). The reference finding "RED bank on the ORANGE house's lawn"
cannot map onto north/south houses here — both halves own orange garages.
Lane assigns hob `[m.hobRed, m.hobBlue]` = red NORTH / blue SOUTH
(VERIFIED: `src/nuketown2-yard-props.ts:296-298` + `pair()` tuple semantics
`src/nuketown2-arena.ts:829-831`). Status OPEN (report OPEN 7 honestly
records it unverified): if the reference's orange house is a garage-wing
read, either lawn qualifies; if a later materials decision repoints a house
body orange, the mapping becomes wrong. Smallest fix, as the report says:
one-line swap of the tuple in `nuketown2YardPropSolids` callers once siding
settles, plus a gate asserting hob↔siding pairing. File:
`src/nuketown2-yard-props.ts:296-298`.

## 5. Coplanar gate and size ratchet

Coplanar gate — VERIFIED intact: `coplanar-pairs.txt` HEAD `813c6579`:
HOUSE-INTERIOR 0, STREET 0, FINDINGS 0, FENCED 170 (+104 for the new decals
+ fixed glasshouse), SAME-MATERIAL 26 (unchanged). The `UNAUDITED` 16→52
growth is the 24 hedge-LOD meshes + 12 avenue InstancedMeshes + lawn —
counted and named by the instrument, organic geometry outside the box-pair
scope exactly as lawn/forest/mountain already were. Report §3 discloses this
as a scoped-claim change — honest. Ground decals sit 3 mm above plate,
inside the 0.03 m window on purpose so the instrument fences rather than
misses them (`src/nuketown2-grime-decals.ts:81-85`, report §2.4) — deliberate
and disclosed. Residual risk is FINDING 1 above (same-tier stacking), which
the gate cannot see by construction.
Size ratchet — VERIFIED no breakage: lane touches neither `legacy-main.ts`
nor the ratchet test; `git diff --stat` shows no `legacy-main*` files. New
src (~1700 lines across 4 modules) affects bundle, not the
`legacy-main-size-ratchet` line ceiling. `npx vite build --outDir
dist-pass94-tech` receipt (3.81 s) is claimed in-report, not re-run here per
lane constraints.

## Verdict: SHIP-WITH-FIXES

1. Zero gate breakage with honest scoping: coplanar 0/0/0 FINDINGS, tsc
clean (claimed), 94→95 tests green (claimed), frame-loop +9.83 % under
ceiling, UNAUDITED growth disclosed rather than hidden.
2. The physics/appearance claims I could check in code all verify:
per-channel absorption, upstream scatter, Fresnel-1.33, distance LOD in
local frames, uniform-only wind, −3 decal tier outside carriageway,
silhouette-tier collider parity with real-arena tests.
3. What stops SHIP-clean: FINDING 1 (stacked same-tier decals will fight
each other — stagger 1 mm or merge materials); FINDING 2 (appliance-bank
placement rationale unstated); OPEN hob↔house mapping needs a one-line swap
+ gate once siding settles. None touches gameplay authority; all are small,
named, and file:line-pinned above.
