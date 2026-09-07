# Muse review — geometry-2 reconciliation (turning-head × rooflines × z-fight)

Worktree `C:/Users/david/projects/aa-claude-geom2`, branch
`contrib/dave-gaming-pc/claude/nuketown2-geometry-2` @ `e3e6a8be`.
Base `51f16012`. Lanes: turning-head `0e393367`, rooflines `a01c3494`,
z-fight `1458d039` (brief named ancestor `e46ca6c9`; head adds only the
GLM-7 review doc — merging the head was correct).
REPORT: `docs/evidence/pass94/nuketown2-geometry-2/REPORT.md`.
Scope: read-only (`git log/diff/show/grep`). No builds, no browsers, no
`npm`, no `src/` modification. Claim-states: VERIFIED (read from the
repo), DERIVED (follows from code), [INFERENCE] (judgment), OPEN (unproven here).

First-parent log `51f16012..HEAD`: `686798eb` bulb, `822992e6`+`859b6b65`+
`65087fb1`+`6b642947`+`0e393367` turning-head fixes, `3aab05ac` rooflines
merge, `e3e6a8be` geometry-2 merge (z-fight `1458d039` as second parent).
`3aab05ac` was auto-merge no-conflict; all 3 conflicts come from `e3e6a8be`.

## 1. Conflict resolutions — was anything dropped?

### C1 — `scripts/qa/find-coplanar-pairs.ts` → `src/nuketown2-coplanar-audit.ts` — VERIFIED, nothing dropped

Parent-only hunks and disposition:

- Turning-head instrument (`0e393367:scripts/qa/find-coplanar-pairs.ts:103-110`)
  hardened non-box guard `p?.width === undefined || ...` — survives verbatim at
  `src/nuketown2-coplanar-audit.ts:162-167` (HEAD), with the CylinderGeometry
  comment carried over. VERIFIED by text match.
- Turning-head `PlanCircle` / `circleOverlapsPlanRect` / circular branch of
  `overlapInsideCarriageway` (`0e393367` script lines ~130-205) — survive at
  `src/nuketown2-coplanar-audit.ts:194-200,252-256,263-276`. VERIFIED.
- Turning-head rect branch dropped `shape` discriminant (untyped union
  `PlanRect | PlanCircle`) — HEAD does NOT carry that defect forward; it types
  `PlanRectFootprint & { shape: 'rect' }` at
  `src/nuketown2-coplanar-audit.ts:201-206` and constructs
  `{ shape: 'rect' as const, ... }` at line 244. DERIVED: required inside
  `src/` tsconfig; the REPORT's stated reason is correct.
- Z-fight core (`1458d039:src/nuketown2-coplanar-audit.ts`) → HEAD diff is
  +53/-7 only: `nuketown2HandedX` import, the guard comment+check, the
  `PlanCircle` type, `CarriagewayFootprint` discriminant, mirrored
  `centreX`, and the overlap-rectangle + circular branch. Every `-` line is
  the old single-line form of the same statement (guard, `return {...footprint,
  x0, x1}`, untyped footprints). No z-fight classifier, threshold, or comment
  deleted. VERIFIED.
- `COPLANAR_NEAR_METERS` 0.03 (`src/nuketown2-coplanar-audit.ts:58`) and
  `MIN_RACE_AREA_M2` 0.02 (line 66) unchanged. Exit still requires all four
  classes at zero per REPORT gates. VERIFIED.

### C2 — `src/nuketown2-arena.ts` three hunks — VERIFIED, resolution as documented

- `git diff 3e2fd273 1458d039 -- src/nuketown2-arena.ts` confirms the REPORT's
  claim: z-fight touched exactly the three material clones in this file, none
  in a conflicted hunk. All three survive on HEAD at tier -1:
  `src/nuketown2-arena.ts:1793-1795` (`nuketown2-balcony-rail-cap`),
  `:3297-3299` (`nuketown2-yard-butt-pad`), `:3400-3402`
  (`nuketown2-perimeter-wall-end`). VERIFIED by grep.
- The three `ours` resolutions (layout imports + `NUKETOWN2_BAY_DEPTH` /
  `NUKETOWN2_BAY_RUNS`, `centredPolygon` disc at `:2923-2924` + 20-segment
  kerb ring at `:2933-2935` with `NUKETOWN2_TURNING_HEAD_SEGMENTS = 20`,
  disc kerb ring over the 12-band island loop) are present. The `-` hunks vs
  `1458d039` (square `carriageway turning head` + `HEAD_BAND_EDGES` island
  loop + 7-band patio) are the superseded square-head design HF-477 replaced —
  deliberate, documented, not a silent drop. DERIVED.
- The `-` hunks vs `0e393367`/`a01c3494` (old `standard()`/`withOffset`
  material block, `HOUSE_WIDTH = 11`, `GARAGE_X0/X1` re-derivation,
  blue-yellow siding comments) are the candidate-line materials/lighting lanes
  that rode in with the z-fight merge (REPORT scope note). They replace, not
  delete, turning-head/rooflines geometry. No turning-head disc or rooflines
  stair/roof table hunk is missing on HEAD. VERIFIED by stat + grep.
- Dead import `NUKETOWN2_APPLIANCE_BLUE`: import dropped at HEAD, re-export
  kept (`src/nuketown2-arena.ts:218`). `1458d039` used it at old line 1234 for
  `applianceBlue = standard(...)`; the role moved to
  `src/nuketown2-materials` (`applianceBlue: createPaintedMetalMaterial`).
  No reader of the re-export changes meaning. VERIFIED.

### C3 — `src/nuketown2-fidelity.test.ts` tail — VERIFIED, both kept

Ours (HF-491 bay/verge block + turning-head circle tests) and theirs (HF-497
`same-material-visible === 0` pin at `src/nuketown2-fidelity.test.ts:3100+`)
both present; resolution closed our `it()` before theirs opened. No test
deleted. VERIFIED.

## 2. The 32 riser/tread findings — appearance-neutral? new pipeline?

Code: `src/nuketown2-roofs.ts:310-314` —
`const riserMaterial = materials.timber.clone()` then
`name = 'nuketown2-exterior-stair-riser'`, `polygonOffset = true`,
`polygonOffsetFactor = -1`, `polygonOffsetUnits = -1`. Risers
(`:318-321`) use it; treads (`:322-324`) keep `materials.timber`;
stringers/handrail/posts keep `materials.timber`. `timber` is `m.fence`
(`src/nuketown2-arena.ts:3479,3485`), so the clone shares the same base
maps/color/roughness objects — same paint. `polygonOffset` is rasterizer
depth-bias state, not shader defines: it does not change the TSL/GLSL graph
or add a render pipeline/program, matching the three HF-497 clones and the
balcony/butt/wall-end pattern. Geometry untouched (stair table still
`going 4.2/16, run 4.2, treadCount 16` at `src/nuketown2-roofs.ts:170-180`;
loop `index < stair.treadCount` with `pairedStairBox` × N/S = 32 risers +
32 treads, matching the 32 reported pairs). DERIVED.

Appearance-neutrality itself is [INFERENCE]: identical material clone +
identical up-facing normal + identical lighting + depth-only tie-break should
not change appearance — the same inference HF-497 rests on. OPEN: no browser,
GPU, or capture in this lane, as the REPORT states. The capture list
(overhead/low stem views, timber flight + patio, walk probe up both flights,
jump onto the flat roof deck) is the visual proof; it stands unchanged and
unexecuted here.

## 3. Lawn 8910 → 8303 — proven or plausible?

Pin: `src/nuketown2-fidelity.test.ts:3057` `toBe(8303)` exact equality.
Direction (fewer blades after more keep-outs) is DERIVED from the keep-out
mechanism; attribution to "candidate hedges / verge-alley planters / avenue
bodies" is PLAUSIBLE, not proven: no per-keepout or per-region blade-loss
breakdown is in the REPORT or the test. The comment's mechanism sentence is
also stale — see F1. No region table is asserted by the gate (only
`lawnMeshes.length > 0` at `:3024`), so the "same eleven regions
(0,1,2,3,5,6,8,10,11,14,15)" claim is REPORT prose, not a gate. The
paving-protecting assertions (zero lawn-region/bay overlap, no blade root in
a bay) are untouched and independent of the number. VERIFIED by reading
`:3017-3057`.

## 4. Roofs reconciliation test — non-vacuous? VERIFIED

`src/nuketown2-roofs.test.ts:166-250`: (1) asserts head footprint defined +
`shape === 'circle'` with a throwing guard (`:177-180`), `worldBays.length >
0` (`:189`), drive mesh defined (`:191-192`), then zero-overlap disc-vs-each
and bay-vs-drive; (2) asserts each rake `solid === false`, `shots === true`,
name contains `roof` (`:216-220`) and `shotSurfaces` rake count is exactly 2
(`:221-222`); (3) asserts `stairBodies.length > 0` (`:236`), counts bodies
inside the 1.2 m band, asserts each is non-solid (`:246-247`), and asserts
`insideStandoff > 0` (`:249`). Every section has a presence guard before the
universal claim. Non-vacuous. VERIFIED.

## 5. Assertion loosening scan — VERIFIED, none found; two tightenings

- Coplanar thresholds unchanged (0.03 / 0.02). Exit still zero across classes.
- Clutter ceiling `toBeLessThanOrEqual(43)` → split into furniture ≤ 36 plus
  aggregate ≤ 51 (`src/nuketown2-fidelity.test.ts:316-320`), excluding
  `NUKETOWN2_GROUND_DRESSING` ids by table, not name pattern. Strictly
  tighter (furniture cap down from effective 43; rename-into-gap closed).
  VERIFIED in `1458d039..HEAD` diff hunk `@@ -2655,14 +2795,36 @@`.
- Appliance colour check 3-loop (`verge appliance top 0..2`) → single shipped
  bank (`lawn appliance bank hob deck`, `:1120-1124`, margin still > 0.15):
  narrower sample, but the old bodies no longer exist on HEAD (candidate 4b
  deduplicated onto `src/nuketown2-yard-props.ts`; arena notes it at
  `src/nuketown2-arena.ts:3092`). Required update, not a free loosening. The
  cabinet-side/spawn-readability assertions survive renamed
  (`:1129`). VERIFIED.
- 16-island kerb expectations replaced by the 20-segment disc ring — follows
  the authored geometry change, not a threshold move.
- No timeout/tolerance/frame-budget raised in the five files in scope.

## Findings

**F1 (doc, minor) — `src/nuketown2-fidelity.test.ts:3043-3052` comment says
`keepOuts` is `builder.colliders.slice(groundColliderCount)`.**
Why: on HEAD the blade-count loop (`:3022-3041`) does not use `keepOuts` at
all (it checks `WORLD_BAYS`), and the keep-out reconstruction elsewhere
(`:1248-1251`) filters the floor-slab band, not a slice index. Stale
mechanism prose will mislead the next re-measure.
Fix: rewrite the comment to name the actual inputs (floor-slab-band filter /
bay table) or point at the slicing site if one exists in the builder.

**F2 (gate gap) — lawn region identity not pinned
(`src/nuketown2-fidelity.test.ts:3024`).**
Why: REPORT's "same eleven regions" is load-bearing for the 8910→8303 story
but the gate asserts only `length > 0`; a region dropping out while the exact
blade count is re-pinned would pass silently next time.
Fix: assert the exact sorted region-id set
`[0,1,2,3,5,6,8,10,11,14,15]` (one `toEqual`).

**F3 (evidence gap, inherited OPEN) — no visual proof for the riser tier;
`src/nuketown2-roofs.ts:310-314` + REPORT §"Re-tiering".**
Why: the depth-winner inference is sound but unexecuted on any backend; a
`-1` tier on a walked surface is exactly the class that needs a daylight
capture.
Fix: run the already-listed captures (timber flight + patio close view, walk
probe up both flights, jump onto flat roof deck) before HITL sign-off. No
code change.

**F4 (robustness, optional) — `src/nuketown2-roofs.test.ts:233` uses
`map.root.children.filter` for stair bodies.**
Why: `pairedStairBox` marks `nuketown2ExteriorStairBody`; if a later lane
nests carpentry under a group, the filter silently sees zero — saved today
only by the `> 0` guard.
Fix: `map.root.traverse` with the same predicate (3-line change, same
assertions).

## Verdict: SHIP-WITH-FIXES

1. The merge is faithful: every conflict resolution ports rather than drops
   (C1 circle logic + discriminant, C2 disc + all three z-fight clones, C3
   both test tails), thresholds are unchanged, and the two changed ceilings
   (36/51) tighten rather than loosen.
2. The two numbers that moved are correctly handled as exact pins with the
   right direction (32→0 via the HF-497 smaller-body rule on a shared-graph
   clone; 8910→8303 with paving guards untouched), but the lawn story leans
   on prose — region identity deserves the one-line gate in F2 and the stale
   keep-out comment needs F1.
3. Visual proof remains OPEN by the lane's own admission (no browser/GPU):
   the riser tier and the inherited roof-fairness (F3 follow-up) and corner-
   pocket (F4) captures must still be taken, so HITL 6 should accept the line
   with F1+F2 applied and F3 captures attached, not as a visually proven fix.
