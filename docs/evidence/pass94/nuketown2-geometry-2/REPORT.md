# PASS 94 - Nuke Town Rebuild geometry 2: four lanes reconciled into one line

Worktree `C:/Users/david/projects/aa-claude-geom2`, branch
`contrib/dave-gaming-pc/claude/nuketown2-geometry-2`, base
`origin/contrib/dave-gaming-pc/claude/layout-hitl5` @ `51f16012`.
No builds, no browsers, no GPU, no preview server. Nothing outside this worktree
was touched.

## What this branch is

The HITL 6 integrator gets ONE line instead of four. Merged in the order the
brief pins, each merge gated before the next:

| # | Lane | Merged head | Result |
|---|---|---|---|
| 1 | `nuketown2-turning-head` (circular kerbed bulb) | `0e393367` | fast-forward, no conflict |
| 2 | `nuketown2-rooflines` (BO2 rooflines + timber stairs) | `a01c3494` | auto-merge, no conflict |
| 3 | `nuketown2-zfight` (strengthened coplanar checker) | `1458d039` | 3 conflicts, all resolved below |

**Branch-head correction, VERIFIED.** The brief names the z-fight lane at
`e46ca6c9`. That commit is an ancestor; the branch head is `1458d039`, which adds
`docs/evidence/pass94/muse-review/nuketown2-zfight-REVIEW.md` and nothing else.
The head was merged, so the review travels with the code. Its verdict is SHIP
(not SHIP-WITH-FIXES) with no outstanding fix commits, which is why nothing
follows it on that branch.

**Scope note the integrator must read, VERIFIED.** The three geometry lanes are
based on `layout-hitl5`; the z-fight lane is based on
`contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`, and `51f16012` is
NOT an ancestor of it. Merging z-fight therefore pulled the whole candidate 5
line - bots, perf, minimap, audio, animation-skins, hedges, avenue planting,
vehicle forge - into this branch. That is deliberate and it is the cleanest
shape available: the result is a strict superset of `pass93-candidate`, so the
integrator merges one branch rather than reconciling a candidate against three
descendants of an older cut of itself. It also means this branch's gate numbers
are candidate-line numbers, not layout-line numbers (see the lawn re-measure).

## Every conflict and its resolution

### C1 - `scripts/qa/find-coplanar-pairs.ts` (whole body)

**Both sides rewrote the same file for different reasons.** The turning-head lane
taught the instrument that the carriageway now contains a CIRCLE; the z-fight
lane moved the instrument's entire scan/classify core into
`src/nuketown2-coplanar-audit.ts` so the instrument and the new vitest pin cannot
drift.

**Resolution: take the z-fight instrument (a thin reporter over the shared core),
and port every turning-head change into the shared core** - so both lanes' work
survives and the vitest pin inherits the circle awareness the instrument-only
version could never have given it. Three ports, all in
`src/nuketown2-coplanar-audit.ts`:

1. **The non-box guard.** Base: `if (geometry.parameters === undefined)`. The
   turning head is a `CylinderGeometry`, whose `parameters` **is** defined but
   carries `radiusTop/radiusBottom/height` and no `width`/`depth`. Read as a box
   it yields NaN half-extents, which compare false against everything - the disc
   would have dropped silently out of the audit while `skipped` still reported 0.
   Now `p?.width === undefined || p.height === undefined || p.depth === undefined`.
   VERIFIED by the instrument output: `nuketown2 carriageway turning head
   (non-box)` is named in the UNAUDITED list rather than counted as a box.
2. **`PlanCircle` / `circleOverlapsPlanRect`** and the circular branch of
   `overlapInsideCarriageway`, so the STREET class tests the overlap rectangle
   against the disc with a nearest-point test rather than against its bounding
   square. Without it the four corner pockets outside the disc would be called
   carriageway and any street race landing in them would be hidden.
3. **The union kept its discriminant.** The turning-head instrument dropped
   `shape` from the rect branch while mirroring; that type-checks only because
   `scripts/` is outside the app tsconfig. Inside `src/` it is a hard error, so
   the rect branch now carries `shape: 'rect'` - which is what
   `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` already declares, so the discriminant is
   carried through from the table rather than invented here.

Nothing was relaxed: `COPLANAR_NEAR_METERS` stays 0.03, `MIN_RACE_AREA_M2` stays
0.02, and the exit condition still requires all four counts at zero.

### C2 - `src/nuketown2-arena.ts`, three hunks

All three are **old-base vs turning-head**, not z-fight content. VERIFIED by
`git diff 3e2fd273 origin/...nuketown2-zfight -- src/nuketown2-arena.ts`: the
z-fight lane changed exactly three things in this file, all material clones, none
of them in a conflicted hunk.

| Hunk | Their side | Resolution |
|---|---|---|
| layout imports | candidate's older import list | **ours** - keep `NUKETOWN2_BAY_DEPTH` / `NUKETOWN2_BAY_RUNS` (HF-491 needs them) |
| `carriageway turning head` | square asphalt + `head kerb island` bands | **ours** - the `centredPolygon` disc and its 20-segment kerb ring (HF-477 replaced the square) |
| head kerb loop | 12-band island loop | **ours** - the disc's kerb ring |

VERIFIED after resolution that all three z-fight clones survived:
`nuketown2-balcony-rail-cap`, `nuketown2-yard-butt-pad`,
`nuketown2-perimeter-wall-end` are present at their `-1` tier.

**One dead import removed as a consequence.** `NUKETOWN2_APPLIANCE_BLUE` was
imported for `const applianceBlue = standard(NUKETOWN2_APPLIANCE_BLUE, ...)` at
old line 1234. The candidate's materials lane moved that role into
`src/nuketown2-materials/index.ts` (`applianceBlue: createPaintedMetalMaterial`),
so the merged file no longer reads it. The *import* is dropped; the **re-export**
of the same symbol is untouched, so every downstream importer of
`nuketown2-arena` is unchanged.

### C3 - `src/nuketown2-fidelity.test.ts`, tail

Ours added the HF-491 bay/verge block and the turning-head circle tests; theirs
added the HF-497 `same-material-visible === 0` pin. Neither replaces the other.
**Resolution: keep both**, closing our final `it()` before theirs opens. Both
suites run; nothing was dropped.

## Semantics reconciled (the part no lane could gate alone)

Bound as a new test - `src/nuketown2-roofs.test.ts`, "reconciles the merged lanes:
paved cuts are disjoint, roofs stay ghosts, the standoff holds". Every claim below
is an assertion, not prose.

1. **The bulb disc vs the bays vs the third-house drive - no overlap.**
   Three paved cuts authored in three branches. The disc is tested with the SAME
   nearest-point predicate the ground cut and the coplanar instrument now use, so
   all three agree on where the road is. Bays and drive are tested rectangle-wise.
   VERIFIED: zero overlap in every pair.
   The grass keep-out firing on every paved cut is already gated by the merged
   fidelity test (zero lawn-region/bay overlap, and no blade root inside a bay);
   both assertions are untouched by this branch.
2. **Roof rake planes vs the balcony/deck bodies.** VERIFIED `solid: false`,
   `shots: true`, name contains `roof` for both rakes (name-based
   `classifyImpactSurface`), and both reach `map.shotSurfaces`. No coplanar pair:
   the checker reports 0 in every class. The rakes spring at 6.55 against a deck
   topping at 6.50, so the separation is constructional, not a tier.
3. **Stair flights vs the patio and the 1.2 m spawn standoff.** The rooflines
   carpentry genuinely reaches inside the standoff band (VERIFIED: the test
   asserts the count of such bodies is > 0, so the check cannot pass vacuously).
   It is legal only because those bodies add no collider, so the property is
   stated as the conditional it actually is: *any* stair body within 1.2 m of the
   |z| = 25 spawn line must be non-solid. A later lane making a stringer solid to
   "fix" a walk probe now fails here rather than at spawn time.
4. **The symmetry exception table is the union.** VERIFIED: the merged
   asymmetric-set assertion enumerates four classes - carriageway
   (`EXPECTED_ASYMMETRIC_CARRIAGEWAY`), beyond-bounds third house, roofs
   (`NUKETOWN2_ROOF_SYMMETRY_EXCEPTION_NAMES`, derived from the roof table), and
   presentation-only street vehicles - and still compares the whole asymmetric set
   for EXACT equality. Every class is derived from a table, so no list can be
   grown by renaming a body into it.

## Re-tiering the races the merges introduced

Deleting nothing, per the brief. The checker was re-run after each merge.

- After merges 1+2 (legacy instrument): `HOUSE-INTERIOR 0`, `STREET 0`,
  `FINDINGS 0`, exit 0.
- After merge 3, the **strengthened** checker on the merged arena reported
  **32 SAME-MATERIAL-VISIBLE findings** - every one of them a pair the merge
  created, and none visible to either lane alone.

**All 32 are `exterior stair closed riser N` x `exterior stair tread N`**, 16 per
flight, both flights. Measured: identical top face (`treadTop`, dy = 0.0000 m),
identical `timber` material, plan overlap `riserDepth/2 * (width - 0.2)` =
0.03 m2 - over the 0.02 m2 race floor - on a surface the player walks with their
eyes a metre from it. This is the largest same-material race on the map and it
existed for exactly as long as the two lanes were separate.

**Fix: the same one HF-497 applies to its own three pairs.** The SMALLER body
(riser plan area 0.06 m2 vs tread 0.37 m2) takes the arena's `-1` decal tier on
its own cloned material `nuketown2-exterior-stair-riser`, so its top wins the
shared plane deterministically on both backends. **Geometry is untouched** - the
rooflines lane's 17/16 envelope, `YARD_STAIR_RUN`, the patio centre and the
|z| = 25 standoff are all bit-identical - and `materials.timber` stays clean for
the stringers, handrail and posts. Same paint, same geometry; only the depth
tie-break moved. Class change VERIFIED by instrument output (32 -> 0, and FENCED
242 -> 274); the visual result is **NOT VERIFIED** (no browser or GPU in this
lane), [INFERENCE] that an identical-material clone with a depth tie-break cannot
change appearance - the same inference HF-497's own three fixes rest on.

## Gates (quoted)

```
$ npx tsc --noEmit
TSC_EXIT=0
```

```
$ npx tsx scripts/qa/find-coplanar-pairs.ts
# nuketown2 coplanar top-face pairs (HF-434 instrument)
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 0
# CONTACT (same-material edge/butt contact under the 0.02 m2 race floor): 4
# COLLISION-ONLY SLOPES (audited by parity/traversal, excluded from horizontal top-face scan): 4 - nuketown2 north house stair ramp, nuketown2 south house stair ramp, nuketown2 north yard stair ramp, nuketown2 south yard stair ramp
# boxes=942 - pairs<=0.03m: 288 - FINDINGS (different materials, no offset): 0 - FENCED (material offset): 274 - SAME-MATERIAL-VISIBLE: 0 - CONTACT: 4 - SAME-MATERIAL (benign): 10
Exit code: 0
```

```
$ npx vitest run src/nuketown2-fidelity.test.ts src/nuketown2-roofs*.test.ts src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts src/pipeline-metrics*.test.ts src/nuketown-lawn-field.test.ts src/grass-placement.test.ts src/legacy-main-size-ratchet.test.ts
 Test Files  8 passed (8)
      Tests  82 passed (82)
VITEST_EXIT=0
```

## The one number that moved, and why it is not a weakening

`src/nuketown2-fidelity.test.ts` - "the lawn field retains the measured
circular-head population": **8910 -> 8303**, re-measured, still an EXACT equality.

- The turning-head lane measured 8910 on the layout line. VERIFIED that the value
  still held after merge 2 (the focused suite was green at `3aab05ac`); it moved
  only when merge 3 brought the candidate line in.
- `keepOuts` is `builder.colliders.slice(groundColliderCount)` - **every** collider
  the arena authors after the ground. The candidate's hedges, verge/alley planters
  and avenue bodies are therefore keep-outs on the tick they are built, and 607
  blades stop growing through them. The direction is the one this gate wants: more
  paving and planting covered, never less.
- VERIFIED that no lawn REGION was lost: the field still emits the same eleven
  instanced regions (0, 1, 2, 3, 5, 6, 8, 10, 11, 14, 15) it emitted at `3aab05ac`,
  so the fall is keep-out coverage inside unchanged regions, not a region dropping
  out of the table.
- The assertions that actually protect the paving - zero lawn-region/bay overlap,
  and no blade root inside a bay - are untouched and independent of this number.
  A silent future loss of grass still fails here exactly as before.

**No gate, threshold, timeout, tolerance or assertion was weakened.** The
two-sided corridor-ratio band, the verge ceilings (furniture <= 36, aggregate
<= 51), garage-RIGHT, the `pair()`/`centred()` symmetry exceptions, the spawn
fairness bands, parity walk-through 0, every coplanar class and the size ratchet
are all as they were, and the branch adds three assertions rather than removing
any.

## Claim states

- **VERIFIED** - `npx tsc --noEmit` exit 0.
- **VERIFIED** - the quoted vitest run, all passing.
- **VERIFIED** - the coplanar instrument: all four classes at 0, exit 0.
- **VERIFIED** - all three z-fight material clones survive the merge at tier -1.
- **VERIFIED** - the merged asymmetric set is the union of the lanes' tables and
  is still an exact-equality comparison.
- **DERIVED** - the riser tier follows HF-497's own smaller-body rule; no number
  in it is measured off a reference.
- **[INFERENCE]** - the riser tier is appearance-neutral (identical material,
  identical up-facing normal, identical lighting).
- **OPEN** - no browser, preview server or GPU was used, so nothing here is a
  visual claim. The three lanes' capture lists stand unchanged and are now one
  list against one head: the overhead and low stem-facing views of the circular
  head, the two roof forms and the six solar panels, the timber flight and its
  patio, and a walk probe up both flights plus a jump onto the flat roof deck.
- **TODO (OPEN, Muse F3)** - before HITL sign-off, collect and attach the
  already-listed riser-tier captures: a timber-flight + patio close view, a walk
  probe up both flights, and a jump onto the flat roof deck. Exact fix: verify
  that the cloned `-1` riser depth tier at `src/nuketown2-roofs.ts:310-314`
  removes the visible stair race without changing the authored appearance or
  walk/shot behavior; no source change is authorized by this evidence-only
  follow-up.
- **OPEN** - the rooflines lane's F3 follow-up (reconcile the emitted roof
  plan-area sum, north 188.77 vs south 202.03, and the apex envelope 7.94 vs 8.15,
  then replace the measured pins with approved fairness bounds) is inherited
  unchanged. It is a fairness payment on the roof exception and this lane did not
  touch it.
- **OPEN** - the turning-head lane's F4 follow-up (confirm the square-minus-disc
  corner interpretation in a daylight capture) is inherited unchanged.

## A contention artifact the integrator will otherwise rediscover

The FIRST run of the quoted vitest command, on a machine then busy with ComfyUI
and a release job, timed out `src/collider-visual-parity-gate.test.ts` >
"constructs every arena without audit errors" at vitest's 120,000 ms test
timeout. No timeout was raised and no test was changed. Run on its own the file
passed in **93.15 s, 6/6, exit 0**, and the SECOND run of the full quoted command
(the one quoted above) passed all eight files in **43.98 s**. The failure was
machine contention, not a regression - but it is a real 120 s cliff on a
90+ second test, so if CI trips it, isolate the file before believing it.
