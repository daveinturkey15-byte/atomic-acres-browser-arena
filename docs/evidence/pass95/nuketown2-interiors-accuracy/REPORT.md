# HF-478 - Nuke Town Rebuild INTERIORS accuracy

**Lane:** interiors geometry (owner priority "nuke town accuracy").
**Branch:** `contrib/dave-gaming-pc/claude/nuketown2-interiors-accuracy`
**Base:** `origin/contrib/dave-gaming-pc/claude/layout-hitl5` @ `51f16012`
**Scope owned:** interior GEOMETRY. The Muse interior LOOK lane
(`nuketown2-interior-look`) owns lighting and fixtures; nothing here touches a
light, a decal or a material definition.

Claim-states: **VERIFIED** (a gate quoted below proves it), **DESIGNED** (built
to the brief, needs a capture or a reference frame), **OPEN** (not done, with
the measurement that says why).

## Source-of-truth caveat - read this before the table

The brief names `FINDINGS.md` (BO2 Nuketown 2025 reference facts) as the source
for the interior spec. **It is not on this branch and it is not on any branch
this lane can see.** A `git ls-files` grep for findings is empty, and a
`git ls-tree -r` over `layout-hitl5`, `nuketown2-bo2-accuracy`,
`nuketown2-handedness` and `nuketown2-interior-look` returns nothing matching
FINDINGS or references/nuketown. HF-477 cites
`docs/references/nuketown-2025/FINDINGS.md` and 20 images, so the file exists in
the accuracy lane's worktree and was never committed.

**Consequence, stated plainly:** every "reference" column below is the
ORCHESTRATOR'S BRIEF, not a frame this lane opened. Rows are DESIGNED wherever
the claim is about what BO2 shows, and VERIFIED only where a gate in this
repository proves what OUR geometry does. No row claims a reference frame was
read that was not.

## Room-by-room: reference (per brief) vs ours

| Room | Reference (per brief) | Ours, as built | Claim |
|---|---|---|---|
| Ground, street side | kitchen | Front room. `house front room counter` 3.2 x 1.0 m at LOW_COVER on the west run; `house kitchen island` 2.0 x 0.8 m, 1.30 m off it; upper cabinets and counter top as presentation | **VERIFIED** built, solid, paired |
| Ground, yard side | living space | Back room. `house back room bench` 3.0 x 1.0 m; `house living couch` 2.2 x 0.9 m at 0.62 m, set off the back wall and facing the stair | **VERIFIED** built, solid, paired |
| Ground partition | one internal wall, one doorway | Pre-existing: `house ground partition 0/1` either side of the 1.8 m `house internal door`, with architrave casings | **VERIFIED** (owned by `nuketown2-fidelity`, not restated here) |
| Internal stair | one flight to the upper floor | Pre-existing and correct: 11 risers against the WEST blind wall of the back room, presentation treads plus ONE collision-only rotated ramp per flight, 0.9 m landing. This is the pattern the owner's HF-449 "sticky stairs" fix landed; this lane did NOT touch it | **VERIFIED** - stair gate quoted below |
| Upper, street side | bedroom / power position | Two rooms exist. `house upper dresser` 1.2 x 0.6 m at LOW_COVER in the far EAST corner, 3.0 m from the window's east jamb, out of the rare-gun stand | **VERIFIED** built and clear; **DESIGNED** that the reference puts a dresser there |
| Upper, yard side | bedroom | `house upper crate` (pre-existing) plus `house upper bed` 1.8 x 1.8 m at 0.55 m, 0.7 m clear of the balcony doorway and 0.35 m clear of the upper back window's jump-out run | **VERIFIED** built and clear; **DESIGNED** as a reference claim |
| Upper partition + balcony door | two rooms, a door to the balcony | Pre-existing: upper partition stopping at the flight's inboard edge (the landing is the second join), `house balcony door` 1.8 m | **VERIFIED** (fidelity lane) |
| Garage - shelving | shelving | `garage shelving rack` 0.7 x 2.8 m x 1.9 m on the outboard wall, SOLID and over the 1.82 m standing capsule so it is hard cover; four boards at distinct heights and two uprights as presentation | **VERIFIED** built, solid, rated |
| Garage - the car | a car in the bay | `garage car body` 1.8 x 3.7 x 1.45 m, ONE solid on the slab, with cabin, glass and four wheels as presentation. Shares the HF-477 `carA` paint uniform, so no new pipeline | **VERIFIED** built, solid, rated; **DESIGNED** as a reference claim |
| Garage - workbench | (pre-existing, HF-432 item 4) | Shortened 4.0 to 2.4 m and slid to the back of the outboard wall to free the bay. HF-432's invariant is unchanged AND now asserted | **VERIFIED** by the new gate |

## Ballistic rating - the defect this lane found and fixed

`classifyBallisticMaterial` in `src/ballistics.ts` reads the mesh NAME. Every
body in `house()` and `garage()` is called `house ...` or `garage ...`, which
matches the plaster/partition/house/garage/wall rule and is rated
`interior-wall`. So a body that misses every earlier token is rated as
plasterboard BY ITS OWN PREFIX:

- `house upper crate` - a wooden crate - was rated `interior-wall`
  (entryCost 0.42), classification `rule`.
- `house front room counter`, `house back room bench` and `garage bench` hit the
  bench/counter token first and were rated `wood` - right, but by accident, and
  one rename away from wrong.
- A steel `shelving rack` and a `car body` would both have fallen to
  `interior-wall`.

All ten cover bodies now carry an explicit id (`wood`, `thin-metal`, `vehicle`)
and the gate asserts the classification is `explicit`, which the
ballistic-parity ledger can see in a way a rule hit cannot. NO THRESHOLD WAS
CHANGED - `BALLISTIC_MATERIALS` is untouched.

## What the gate itself caught (findings against my own first cut)

`src/nuketown2-interiors.test.ts` is new, and it failed four times before it
passed. Each failure moved the GEOMETRY, never the assertion:

1. The couch stood in a garage link doorway. Handedness is -1, so authored x
   [-4.6, -2.4] is WORLD [2.4, 4.6], and the fidelity gate's plan-only
   link-door probe stands at world x = 3.6 / 4.35 / 5.1. The couch moved to
   authored x = -2.0 (world [0.9, 3.1], 0.5 m clear of the first station).
2. The shelving clipped the vehicle door. Its front 0.4 m sat inside the 3.5 m
   door's threshold band at the outboard edge. Depth 3.0 to 2.8 m, z -18.0 to
   -18.6; 0.29 m clear now.
3. Six new HOUSE-INTERIOR z-fights. Shelf uprights' top faces exactly on the
   rack's (four) and the car glass 0.01 m over the car body with 3.1 m2 of
   overlap (two). Uprights shortened 0.08 m, glass moved into the cabin band,
   top board 1.82 to 1.70. Back to ZERO.
4. A wrong invariant in my own gate. The first cut asserted a height band
   ("waist-high or over a standing capsule") to prevent crouch-only cells; that
   failed the 1.45 m car, which is one solid block from the slab and cannot
   produce such a cell. The band is gone; the real invariant - underside at or
   below its floor top, so there is no walk-under gap at all - is asserted
   instead, with the reasoning written down beside it.

## Gate quotes - VERIFIED

Head `e09d8e0e`, worktree `C:/Users/david/projects/aa-wf-ntint`.

    $ npx tsc --noEmit -p tsconfig.json
    TSC_EXIT=0

    $ npx vitest run src/nuketown2-fidelity.test.ts src/nuketown2-interiors.test.ts \
        src/walkable-surface-parity-gate.test.ts src/spawn-layout-quality.test.ts \
        src/spawn-safety.test.ts src/collider-visual-parity-gate.test.ts src/ballistics.test.ts
     Test Files  7 passed (7)
          Tests  233 passed (233)

Baseline at `51f16012`, same set minus the new file and `ballistics`:
`Test Files 5 passed (5) / Tests 207 passed (207)`. The new file adds 5.

    $ npx tsx scripts/qa/find-coplanar-pairs.ts
    # HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
    # STREET pairs<=0.03m (offsets ignored): 0
    # boxes=855 - pairs<=0.03m: 141 - FINDINGS (different materials, no offset): 0
    #   - FENCED (material offset): 115 - SAME-MATERIAL (benign): 26
    # UNAUDITED meshes ... : 19

Baseline was boxes=819 ... FINDINGS 0 ... FENCED 115 ... SAME-MATERIAL 26,
HOUSE-INTERIOR 0. 36 BOXES ADDED, EVERY COUNTED CLASS UNCHANGED. The 19
UNAUDITED meshes (instanced lawn and forest, non-box mountains) are unchanged
and are not this lane's. Full output: `coplanar-pairs.txt` beside this file.

STAIRS, from the passing `nuketown2-fidelity` run - this lane changed nothing
here and the ramp pattern the owner's HF-449 fix landed still holds:

- "walks a STANDING player up each stair, onto the landing and into both upper
  rooms" asserts, per house and in both directions, "up/down stair completed
  within the frame budget", "ground contact" at most 1 ungrounded frame, and
  "used the smooth ramp" (slopeAdjustedFrames > 0).
- The coplanar instrument lists the four ramps under "COLLISION-ONLY SLOPES ...
  excluded from horizontal top-face scan": they are audited by the traversal and
  parity gates, not by the top-face test.

PARITY WALK-THROUGH 0: `src/walkable-surface-parity-gate.test.ts` and
`src/collider-visual-parity-gate.test.ts` are inside the 233 above.
SPAWN FAIRNESS BANDS UNTOUCHED: no spawn table, band or layout constant was
edited; `spawn-layout-quality` and `spawn-safety` are in the 233. Interiors are
not spawn points and none was added.
BOTH HOUSES THROUGH pair(): every body added here is emitted by `pair()`, and
the new gate reads back each south partner's exact 180-degree position and size.
IN-COMBAT PIPELINE CREATIONS 0, PER-INSTANCE VALUES ARE UNIFORMS: the garage car
reuses the shared `carA` node graph whose colour HF-477 made a uniform; no new
material and no new pipeline.

## OPEN

1. FINDINGS.md is not in the repository. Every reference claim in the table
   above is the brief's, not a frame. Until that file and its 20 images are
   committed, no row can move from DESIGNED to VERIFIED-against-BO2.
   Falsifier: commit `docs/references/nuketown-2025/` and re-derive the table.
2. Ground-floor furniture is sunk 0.08 m into its own slab. Pre-existing,
   measured, not introduced here: HF-448 raised the interior slab to +0.08 m to
   cure the z-fighting and left the furniture authored from y = 0. Invisible,
   and not a float - the new gate asserts nothing hangs ABOVE its floor, which
   is the forging review's actual rule. Fixing it means raising four solids and
   four presentation tops together in one edit and re-running the coplanar
   instrument; a clean follow-up, not a hotfix.
3. No browser capture. Per the machine rule this lane started no headless
   browser. Still owed for visual sign-off: `qa:pass74:arena-boot-smoke`,
   `qa:stock-boot`, and an interior capture of each house's ground floor and
   both garages. Command: `npx vite build --outDir dist-ntint`, then
   `node scripts/qa/capture-arena-viewpoints.mjs --serve-dist dist-ntint
   --arenas nuketown2 --label pass95-interiors --sha HEAD`.
4. Full suite not run in this lane's time box - only the seven files above. The
   changed surface is one arena builder plus one new test file, but that is an
   argument, not a receipt.
5. The car is a reference ASSERTION this lane could not check. If BO2's Nuketown
   2025 garages are empty, the bodies to delete are `garage car body` and its
   four presentation partners, and the workbench's 1.6 m goes back.
