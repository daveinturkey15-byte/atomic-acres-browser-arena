# VERIFY - adversarial verification of `nuketown2-accuracy-3`

**Verifier:** Claude Opus 5, 2026-09-04. **Branch:** `contrib/dave-gaming-pc/claude/nuketown2-accuracy-3`.
**Head verified:** `c4d3bdb1` (`8de62756` code + `c4d3bdb1` report). **Worktree:** `C:/Users/david/projects/aa-wf-nt3`.
**Method:** every quoted gate re-run from scratch on this branch; every measured number
re-derived independently rather than re-read; the whole branch diff scanned for weakened
assertions; the collateral suites the lane did NOT run executed as well.

## VERDICT: SHIP-WITH-FIXES

Every gate the lane quotes reproduces **exactly**, the code change is derivation-preserving and
strengthening-only, and nothing this lane authored turned a gate red. Three evidence claims are
false and are corrected on the branch; one of them (the base branch) needs the orchestrator, not
this pass.

### Reason 1 - all three quoted gates reproduce, number for number.

`npx tsc --noEmit` clean, exit 0. The nine-file vitest set: `Test Files 9 passed (9) · Tests 80
passed (80)`, the lane's exact counts. `npx tsx scripts/qa/find-coplanar-pairs.ts`:
`HOUSE-INTERIOR 0`, `STREET 0`, `boxes=880`, `pairs<=0.03m: 173`, `FINDINGS: 0`, `FENCED: 115`,
`SAME-MATERIAL (benign): 58` - identical. Re-derived independently against
`src/nuketown2-layout.ts`, by sampling at N = 400/1000/2000/4000 AND by an analytic
integration over z that shares no code with the gate: `truck.x -11.612490`, `cabX -5.762490`,
`coach -5.212490 / -2.650000`; off-carriageway truck box **0.000000**, cab **0.000000**, saloon
**0.000000**, classic **0.000000**, coach **0.867859** converged (lane: 0.8679), BEFORE
**1.2819**. The corner wall `-12.1491` and the rear-mouth wall `-11.66249` both re-derive to
4 dp, `max()` picks the rear mouth, and `+0.05` lands the seat at `-11.6125`. The overdrive core
follows by construction (`overdrivePositionForArena` reads `NUKETOWN2_CENTRAL_TRUCK.x` through
`nuketown2HandedX`), and `git diff 75fbaf59..HEAD -- '*.test.ts'` contains **no** deletion, no
loosened matcher and no raised ceiling - the verge-furniture ceiling of 36 and the legacy size
ratchet are untouched. Both merge claims check out: `git merge-base --is-ancestor` confirms
`nuketown2-turning-head` and `nuketown2-rooflines` are ancestors of HEAD.

### Reason 2 - but three stated claims are false, and one of them is about the base branch.

1. **"`nuketown2-geometry-2` DOES NOT EXIST"** - it does. `git ls-remote` lists it at `daf398ba`
   (pushed 22:33:43), and its reconcile commit `e3e6a8be` is dated 22:25:23, both **before** the
   lane's own `8de62756` at 22:39:46. It is **not** an ancestor of this HEAD and the two diverge
   by 379 files. The lane worked from a stale fetch and took the fallback base it was not
   entitled to. Recorded as REPORT **TODO 1**; re-landing two commits on the right base is an
   orchestrator decision, not a verify-pass edit.
2. **"All 58 SAME-MATERIAL rows print `overlap=0.0m2` · Visible same-material coplanar overlap:
   0"** - the instrument prints no `SAME-MATERIAL` row at all (the verdict string is `BENIGN`),
   and **18 of the 58 carry a non-zero overlap**, four of them at `dy=0.0000m`, i.e. exactly
   coplanar, at 0.2-0.5 m2 each (perimeter wall long/end, balcony rail outboard/cap, yard crate
   pad/butt pad). The classification is still defensible; the sentence is not - it asserts a
   row-level fact the output does not contain. Inherited, not caused: none of those bodies is in
   this lane's diff. Recorded as REPORT **TODO 2**'s sibling note; geometry-2 already carries
   `e46ca6c9 z-fight sweep - HF-497 same-material-visible coplanar class` for this exact class.
3. **"-32 % on the coach"** - true for the solid 9.1 x 2.6 body, which is all the new gate
   measures. On the **emitted envelope** (body + wheels at `width + 0.2` + chrome bumpers at
   `x +/- (length/2 + 0.1)`), re-sampled at 3000x3000, the off-carriageway area goes
   **1.3615 -> 1.3008 m2, i.e. -4.5 %**: the seat takes the front WHEEL off the lune
   (0.6634 -> 0.0000) and puts the front BUMPER onto it (0.0000 -> 0.4563). The direction is
   right and the cover geometry genuinely improves 32 %, but that is not what capture station 1
   will show. Corrected in the REPORT and in the gate's own comment; widening the gate is TODO 3.

### Reason 3 - a red gate is sitting on this branch, unreported, and it is not this lane's fault.

`npx vitest run src/walkable-surface-parity-gate.test.ts` **FAILS**: 3 tests, 24 nuketown2
fall-through floors / contiguous holes on `north house A roof deck front|rear rake`,
`north house A solar panel *` and `south house B capsule N band 0-6`. Checking
`src/nuketown2-layout.ts` and `src/nuketown2-fidelity.test.ts` out at the merge commit
`75fbaf59` and re-running reproduces the **identical** 3 failures, so it came in with the merged
rooflines work, not with `8de62756` - which is why this is SHIP-WITH-FIXES and not
DO-NOT-SHIP. But this lane performed that merge and its gate set does not name this file, so a
red gate rode the branch unreported. Recorded as REPORT **TODO 2**. Six further nuketown2-
touching suites the lane did not run (`overdrive-line-of-sight`, `railgun-authority`,
`killstreak-flight-navigation`, `destructible-shed-registry`, `map-selection`,
`match-diagnostics-migration`) all **pass**, so the 1.01 m truck move has no collateral damage.

## Fixes applied on the branch by this pass

- `src/nuketown2-fidelity.test.ts` - ratchet **tightened** 0.87 -> **0.868** (the sampler's own
  reading is 0.867731, converged 0.867859, so 0.87 carried 0.0023 m2 of the "no headroom" the
  comment claimed); the rear-mouth wall in the comment corrected `-11.6125` -> `-11.6625` (it
  quoted the seat, not the wall); `x <= -12.49` labelled as the TRUCK's x; and the gate's scope
  (solid body, not emitted envelope) written down with the envelope numbers. Strengthening only.
- `docs/evidence/pass95/nuketown2-accuracy-3/REPORT.md` - the three false claims corrected in
  place with the evidence, capture station 1's prediction corrected, and a new section 4b
  carrying TODOs 1-4 plus a units note on `TRUCK_REAR_MOUTH_LIMIT_X`.

## Not fixed here, deliberately

TODO 1 (wrong base) is an integration decision. TODO 2 (walkable parity red) belongs to the
rooflines line. TODO 3 (widen the gate to the emitted envelope) should follow TODO 4 (pave the
lune pockets as kerb returns), which is the only change that takes the residue to zero instead
of moving it around the bulb mouth.

## Gates after the fixes

```
npx tsc --noEmit                       clean, exit 0
npx vitest run <the lane's nine files>  Test Files 9 passed (9) · Tests 80 passed (80)
npx tsx scripts/qa/find-coplanar-pairs.ts
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# boxes=880 · pairs<=0.03m: 173 · FINDINGS: 0 · FENCED: 115 · SAME-MATERIAL (benign): 58
```

**Nothing has been looked at here either.** No browser was launched; port 4210 was not used. The
four capture stations in the REPORT still stand, with station 1 corrected.
