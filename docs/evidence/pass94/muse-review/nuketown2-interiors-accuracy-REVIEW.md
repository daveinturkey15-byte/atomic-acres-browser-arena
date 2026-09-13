# Muse review - HF-478 nuketown2-interiors-accuracy (third pair of eyes)

Branch: `contrib/dave-gaming-pc/claude/nuketown2-interiors-accuracy`, head `2b865c55`.
Base for lane: `51f16012`. Verifier checked `51eca436`; delta `51eca436..2b865c55` is comment + test-constant only (no geometry).
Scope: `src/nuketown2-arena.ts`, new `src/nuketown2-interiors.test.ts`, three evidence files. No existing test, threshold, fence, or constant table touched by the lane (stat `51f16012..HEAD`: 5 files).
Method: read REPORT.md + VERIFY.md, diffed `origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD` and `51f16012..HEAD`, read the stair/partition/pair/ballistics code cited below. No builds, no browsers, per brief.

## What the verifier did not check, checked here

### 1. Internal stair ramp - PASS, untouched, pattern holds

`src/nuketown2-arena.ts:1589-1603`: one rotated collision-only ramp per house (`collisionOnly`, pitched about X so the x-mirror commutes), exact rotated OBBs kept in `physicsColliders` only, axis-aligned copies filtered out of the lightweight `colliders` channel. Presentation treads `src/nuketown2-arena.ts:1609-1611` are `solid:false`. No stringer bodies exist; the only "stringer" hit in the file is a comment about the exterior balcony stair's reference read (`:1696-1697`), not a solid. Lane diff adds zero stair code. Sticky-stair (HF-449) pattern intact.

### 2. Partitions and door openings - PASS

`src/nuketown2-arena.ts:1635-1663`: ground partition runs from the west wall inner face, upper from the flight inboard edge; east run stops at the east wall inner face (HF-434 trim, now mirrored west per HF-477 comment `:1645-1652`). No new coplanar risk authored.
`docs/evidence/pass95/nuketown2-interiors-accuracy/coplanar-pairs.txt`: HOUSE-INTERIOR 0, STREET 0, FINDINGS 0, FENCED 115 / SAME-MATERIAL 26 - byte-identical classes to baseline, +36 boxes = 18 authored bodies x `pair()`. Depth tiers unchanged. New gate sweeps every `NUKETOWN2_DOORWAYS` entry for a standing-wide (0.76 m) clear run rather than naive no-overlap, which is the correct contract for the vehicle door with a car parked through it.

### 3. Furniture cover blocks - explicit and correct, but NOT parity-audited (see F1)

All ten `FURNITURE` bodies carry explicit ids: 8x `wood`, 1x `thin-metal` (`src/nuketown2-arena.ts:2229` shelving), 1x `vehicle` (`src/nuketown2-arena.ts:2274` car). Against `src/ballistics.ts:71-83`: wood 0.38 / interior-wall 0.42 / thin-metal 0.95 / vehicle 2.5 - the rack and car would both have fallen through to `interior-wall` by the `/(plaster|partition|house|garage|...)/` rule (`src/ballistics.ts:134`), so the explicit ids fix a real defect. Couch/bed/dresser as `wood` is the closest available class (no upholstery id exists); coarse but correct per the shared table, and the gate asserts membership in `BALLISTIC_MATERIALS`. Car cabin/glass/wheels are presentation (`solid:false, shots:false`); car body `minY` on the slab, one solid to 1.45 m - no walk-under/crouch-only cell. Reachability gap is F1.

### 4. Both houses through pair() - PASS, exception table derived

All ten furniture bodies emitted via `pair()` (`src/nuketown2-arena.ts:907-940`: authored frame mirrored once by handedness, south = exact `(-x,-z)`). New gate `src/nuketown2-interiors.test.ts:99-129` reads back each south partner's position/size to 1e-6. Lane adds zero asymmetric bodies. Exceptions live in `src/nuketown2-fidelity.test.ts:1649-1744` as an enumerated `EXPECTED_ASYMMETRIC` street-vehicle list (exact equality, not a name filter) plus derived property classes for carriageway/ground-tile asymmetry and the `[north,south]` colour-only roof pair (geometry identical, gate measures size+position never material). Nothing here needs the table updated.

### 5. No test loosened - PASS

Lane vs base touches zero existing test files. Verify-commit delta only: island comment corrected to the measured Z-clearance, `3.3`/`2` literals replaced by `NUKETOWN2_UPPER_Y0` (`src/nuketown2-interiors.test.ts:175`) - a strengthening. `BALLISTIC_MATERIALS` byte-identical. Verifier's four mutation catches confirmed by reading the gate (explicit-rating, doorway run, float, lane width all fail closed on the stated mutations).

## Findings

F1 - parity audit does not look at this arena (mid; pre-existing, capped claim).
File: `src/ballistics.test.ts:173`. Why: roster is six hardcoded builders, `buildNuketown2` absent; arena carries 56 `fallback`/`reinforced` surfaces, and now the garage car is `vehicle` (2.5) while the street cars on the same drive are `reinforced` (1000). The report's "ledger can see" sentence has no gate behind it for this arena. Smallest fix: rate the 56 explicitly in an accuracy lane, then add `buildNuketown2` to the roster (adding first lands red, per verifier TODO 1).

F2 - evidence stamp stale by one commit (low).
File: `docs/evidence/pass95/nuketown2-interiors-accuracy/coplanar-pairs.txt:5` (`# head 51eca436`, HEAD is `2b865c55`). Why: verifier fixed the base-stamp mislabel, then committed a geometry-invariant verify commit on top, so the stamp is behind again. Numbers (855 boxes, 0/0/0) still valid - delta is comment + test constant. Smallest fix: regenerate the stamp line at HEAD; no re-measurement needed.

F3 - FURNITURE roster hardcoded (low; verifier TODO 2, confirmed).
File: `src/nuketown2-interiors.test.ts:85`. Why: ten hand-listed names; an eleventh interior body gets no coverage and the gate stays green. Smallest fix: derive roster from built arena (solid colliders inside house/garage footprint), assert count.

F4 - collider match ignores Y (low; verifier TODO 4, confirmed).
File: `src/nuketown2-interiors.test.ts:133-136` (repeat `:283-286`). Why: X/Z-only match lets two bodies sharing a footprint at different heights satisfy each other. No such pair exists today. Smallest fix: include Y bounds next touch.

F5 - vehicle-door margin thinnest in lane (info).
File: `src/nuketown2-arena.ts:2234-2274` (car `GARAGE_CAR_X/Z`, 1.8 x 3.7). Why: clear run 0.90 m vs 0.76 m threshold; a 0.2 m car nudge closes it. Smallest fix: named constant + comment at the car, no move (design deliberate - car parked through a vehicle door).

Noted, no fix: ground furniture sunk 0.08 m (pre-existing HF-448 slab raise; gate's `minY <= floorTop` correctly forbids float without demanding exact seating; report OPEN 2 records the 8-body follow-up). Couch at `src/nuketown2-arena.ts:1918` world [0.9,3.1] 0.5 m clear of the link-door probe - the self-caught handedness bug stays fixed.

## Verdict: SHIP-WITH-FIXES

1. Every lane VERIFIED number is structurally sound: stair pattern untouched, partitions trimmed both sides with 0 HOUSE-INTERIOR pairs, all ten bodies paired with explicit ratings the classifier defect needed.
2. No gate was weakened and the new gate has teeth (mutation-catching, doorway sampling, lane-depth measurement all read correctly off the code).
3. F1 caps the lane's own ballistic claim and F2 leaves evidence one commit behind: rate-and-roster the arena (accuracy lane, not hotfix), restamp the pairs file, and derive the roster / Y-match on next touch. None blocks the geometry shipping.
