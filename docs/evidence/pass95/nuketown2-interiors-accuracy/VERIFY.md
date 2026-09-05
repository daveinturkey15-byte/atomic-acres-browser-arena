# VERIFY - HF-478 Nuke Town Rebuild interiors, adversarial pass

**Lane branch:** `contrib/dave-gaming-pc/claude/nuketown2-interiors-accuracy`
**Lane head verified:** `51eca436` (`docs(evidence): HF-478 ...`), base
`origin/contrib/dave-gaming-pc/claude/layout-hitl5` @ `51f16012`
**Worktree:** `C:/Users/david/projects/aa-wf-ntint`
**Method:** re-run every quoted gate, diff every test file and constant for a
weakened assertion, mutation-test the new gate, measure the report's VERIFIED
numbers off the built arena, and run the full suite the lane did not.

## VERDICT: SHIP WITH FIXES

Every gate the lane quoted reproduces. Nothing was weakened. Two evidence
defects and one hardcoded literal were fixed on the branch; four issues are
recorded as TODOs in `REPORT.md`, the first of them pre-existing and larger than
this lane.

## Three reasons

### 1. Every quoted gate reproduces, at the quoted numbers

    $ npx tsc --noEmit -p tsconfig.json                       -> TSC_EXIT=0
    $ npx vitest run <the seven lane files>                   -> 7 passed / 233 passed
    $ npx vitest run src/ballistics.test.ts                   -> 21 passed
    $ npx tsx scripts/qa/find-coplanar-pairs.ts
        # HOUSE-INTERIOR pairs<=0.03m: 0
        # STREET pairs<=0.03m: 0
        # boxes=855 · pairs<=0.03m: 141 · FINDINGS: 0 · FENCED: 115 · SAME-MATERIAL: 26
        # UNAUDITED: 19 · COLLISION-ONLY SLOPES: 4

The lane's arithmetic holds: 207 (five baseline files) + 5 (new file) + 21
(ballistics) = 233. The +36 boxes are exactly the 18 authored bodies this diff
adds, each doubled by `pair()`.

**The full suite the lane left OPEN was run here:** `580` files,
`5668 passed / 1 failed / 2 skipped`. The single failure is
`src/audio-music-rotation-runtime.test.ts` -> "plays all ten tracks before
repeating any of them" timing out at 20 s under a fully parallel run. Re-run
alone it is `8 passed (8)`. It is a load-flake in audio; this lane touches no
audio code. OPEN item 4 in the report is closed.

**No gate was weakened, and the diff cannot have weakened one:** the change is
four files - `src/nuketown2-arena.ts`, a NEW `src/nuketown2-interiors.test.ts`,
and two evidence documents. No existing test file, threshold, fence or constant
table is touched. `BALLISTIC_MATERIALS` is byte-identical. The verge furniture
ratchet (36 / 51) and the stair contract in `nuketown2-fidelity.test.ts` are
untouched and green.

### 2. The new gate has teeth - four mutations, four catches

A gate that only ever passes is a comment. Each mutation below was applied to
`src/nuketown2-arena.ts`, the interiors file run alone, and the source restored:

| Mutation | Result |
|---|---|
| Drop `{ ballisticMaterial: 'thin-metal' }` from `garage shelving rack` | FAIL - "rating is authored, not guessed: expected 'rule' to be 'explicit'" |
| Move `house living couch` onto the internal doorway (x -2.7, z -16.5) | FAIL - "'house internal door' keeps a standing-wide clear run (0.00 m of 1.8 m)" |
| Raise `garage shelving rack` 0.9 m off the slab | FAIL - "does not float over its floor: expected 0.9 to be <= 0.080001" |
| Widen the car 1.8 -> 3.0 m | FAIL twice - vehicle door run 0.30 m, and "garage link-door lane (0.75 m)" vs 0.76 m |

The claimed self-caught findings are also real, not narrative. The classifier
defect is confirmed by reading `src/ballistics.ts`: `house upper crate` matches
no `container` or `wood` token and falls through to
`/(plaster|partition|house|garage|hut|kiosk|wall|ceiling)/`, so a wooden crate
was rated as plasterboard by its own name prefix.

### 3. Every VERIFIED number in the report measures out on the built arena

Read off `buildNuketown2(new THREE.Scene())`, north house, world frame:

- garage link-door lane: inner face world x `-4.55`, car `maxX -5.90` -> **1.35 m**
  (claimed 1.35, threshold 0.76).
- shelving vs the 3.5 m vehicle door: rack `maxZ -17.20` against the threshold
  band edge `-16.91` -> **0.29 m clear** (claimed 0.29).
- workbench vs the rear door (HF-432 item 4): bench x `[-8.80, -7.40]`, rear-door
  run `[-7.10, -5.30]` -> clear by **0.30 m**, no overlap.
- couch: world x `[0.90, 3.10]` against the fidelity gate's plan-only link-door
  probe station at world x 3.6 -> **0.50 m clear** (claimed 0.5).
- kitchen island: **1.30 m** to the counter, **0.95 m** to the partition face,
  **1.05 m** to the west lining - all three as claimed.
- upper bed: **0.70 m** clear of the balcony door run, **0.35 m** clear of the
  upper back window's run, sill unobstructed.
- car body: `minY = 0.080` = `NUKETOWN2_GROUND_FLOOR_TOP` exactly; one solid,
  1.45 m, no walk-under gap; the cabin is not a collider.

Structural checks the lane did not claim, run here and clean:

- **Idempotency.** Two builds -> `359 / 359` colliders and `367 / 367` shot
  surfaces.
- **Pipeline creation.** The garage car body's `THREE.Material` is the SAME
  instance as a street car's `carA`, and north and south share one instance. The
  diff adds no material definition. 49 distinct materials per build, before and
  after.
- **Interpenetration.** 40 overlapping AABB pairs involve the new bodies and
  every one is a presentation join - shelf boards into their uprights, wheels and
  glass into the car - the same pattern the pre-existing street car already uses.
  No new body intersects a wall, a floor, a stair or a doorway pier.
- **Host authority.** Build-time geometry from literal constants: no RNG, no
  network state, nothing a guest can mint or forge, and both peers build the
  identical collider set.

## What was fixed on the branch, and what is left

Fixed here (see the verify commit): the `coplanar-pairs.txt` head stamp
(`51f16012`, the base, on a file carrying the post-change 855 boxes - it was
generated from a dirty worktree before the feat commit), a factually wrong
kitchen-island clearance comment (the island's authored run DOES overlap the
internal door's x run by 0.20 m; the real clearance is 0.34 m in Z), and the
gate's hardcoded `3.3` upper-storey literal, now `NUKETOWN2_UPPER_Y0`.

Left as TODOs in `REPORT.md`: (1) `buildNuketown2` is absent from
`ballistics.test.ts`'s hardcoded six-arena coverage roster and the arena carries
**56 `fallback` shot surfaces** rated `reinforced` - including both street car
bodies, which are now less penetrable than the garage car this lane added;
(2) the new gate's own `FURNITURE` roster is hardcoded ten names;
(3) the vehicle door's clear run is 0.90 m against a 0.76 m threshold;
(4) the gate's collider match ignores Y.

TODO 1 is pre-existing at the base and is NOT a reason to hold this lane - the
diff adds no fallback surface and every body it authors is `explicit` - but it
does cap the lane's own claim that the explicit ids are "what the
ballistic-parity ledger can see". There is no ledger looking at this arena yet.
