# Nuke interior furnishing (mid-century, ground floor)

**Branch:** `contrib/dave-gaming-pc/muse/nuke-interior-furnishing`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba`
**Commits:** `9f7edb74` (front room), `bd38bd91` (back room)
**Scope:** ground-floor furnishing of both houses only. No lights, no decals
outside rugs, no material definitions, no thresholds touched.

**Brief source:** Gemini reference-critic `candidate7-REVIEW.md` stations
`nuketown2-north-interior` / `nuketown2-south-interior`: "the interior feels
hollow and unpopulated without furniture or props ... Add mid-century
furniture, wall art". Room layout, coplanar rules and ballistic classes per
the HF-478 interiors lane
(`nuketown2-interiors-accuracy` REPORT/VERIFY).

Claim-states: **VERIFIED** (a gate quoted below proves it), **DESIGNED**
(built to the brief, needs a capture), **[OPEN]** (not done, with the reason).

## What was built

Every body goes through `pair()`, so both houses stay symmetric. Seven new
solids per house, each an explicit `wood` cover block (the lane's ballistic
classes: `wood`, never the `house`-prefix `interior-wall` fall-through, never
`reinforced`); everything else is non-blocking dressing (`solid: false,
shots: false`, no collider, no ballistic surface).

| Room | Solid covers (explicit `wood`) | Dressing (no collider) | Claim |
|---|---|---|---|
| Front (street side) | kitchen island 2.0x0.9x0.8 off the existing counter; dining table 1.6x0.75x1.0; bookshelf 0.6x1.9x1.0 | island top, sink, faucet, stove, oven door; 4 chairs (seat+back); 3 books; floor lamp (pole+shade); dining + kitchen wall-art frames/canvases; dining rug decal (top 0.12) | **VERIFIED** built, solid, paired |
| Back (yard side) | couch 2.2x0.62x0.9; armchair 0.9x0.62x0.8; coffee table 1.2x0.45x0.6; TV console 1.8x0.5x0.4 | cushions, backrests, armrests, table top, TV stand/screen/radio; floor lamp; living rug decal (top 0.12) | **VERIFIED** built, solid, paired |

Placement keeps every doorway walk line and the internal stair clear: the
couch sits east of the back-door walk line (first cut stood in it and the
fidelity back-door probe caught it), the armchair sits south of the
garage-link walk line (second cut stood in it, same probe), the dining set
stays east of the front-door approach and the internal-door run, and the
stair strip x [-6.45, -4.8] is untouched. All furniture tops are separated by
real Y (HOUSE-INTERIOR ignores polygonOffset); rug tops sit 0.04 m over the
0.08 m floor top, outside the 0.03 m coplanar window.

## Gate quotes - VERIFIED

Head `bd38bd91`, worktree `C:/Users/david/projects/aa-muse-interiors`:

    $ npx tsc --noEmit -p tsconfig.json
    TSC_EXIT=0

    $ npx vitest run src/nuketown2-fidelity.test.ts \
        src/nuketown2-pipeline-budget.test.ts src/pipeline-metrics.test.ts \
        src/graphics-profile-contract.test.ts \
        src/legacy-main-size-ratchet.test.ts \
        src/collider-visual-parity-gate.test.ts \
        src/walkable-surface-parity-gate.test.ts \
        src/spawn-layout-quality.test.ts src/spawn-safety.test.ts \
        src/ballistics.test.ts src/nuketown2-grime-decals.test.ts
     Test Files  11 passed (11)
          Tests  320 passed (320)

    $ npx tsx scripts/qa/find-coplanar-pairs.ts
    # HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
    # STREET pairs<=0.03m (offsets ignored): 0
    # boxes=1038 - pairs<=0.03m: 288 - FINDINGS: 0 - FENCED: 274
    #   SAME-MATERIAL-VISIBLE: 0 - CONTACT: 4 - SAME-MATERIAL (benign): 10
    # COLLISION-ONLY SLOPES: 4 (the four stair ramps, audited by traversal/parity)

Before/after (measured via stash at base `452d7aba`): boxes 950 -> 1038
(+88 = 44 `pair()` emitters x 2 houses); HOUSE-INTERIOR 0 -> 0, STREET
0 -> 0, FINDINGS 0 -> 0, SAME-MATERIAL-VISIBLE 0 -> 0.

Verge/furniture ceilings (the lane's ratchet, `nuketown2-fidelity.test.ts`):
verge FURNITURE 30 (ceiling 36), verge bodies 45 (ceiling 51) - this lane
adds zero `verge` bodies, both counts unchanged. Pipeline budget: zero new
materials (only existing `trim`/`fence`/`interior`/`interiorFloor`/`chrome`/
`sign`/`windowGlass` instances reused), in-combat creations 0, ceiling 54
untouched. `src/legacy-main.ts` untouched (ratchet green).

## OPEN

1. No browser capture - per the brief, captures are **[OPEN]** for the
   integrator: `qa:pass74:arena-boot-smoke`, `qa:stock-boot`, and an interior
   capture of each house's ground floor.
2. Reference likeness (mid-century read, 1960s styling) is **DESIGNED** from
   the critic's fix hints, not verified against a frame - needs the
   integrator's capture review.
3. `buildNuketown2` is still absent from `ballistics.test.ts`'s coverage
   roster (lane TODO 1, pre-existing): the 7 new solids carry explicit
   `wood`, but no roster gate looks at this arena yet.
