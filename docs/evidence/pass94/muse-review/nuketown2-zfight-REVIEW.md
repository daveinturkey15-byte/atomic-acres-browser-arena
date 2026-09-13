# PASS 94 Muse review — nuketown2 z-fight sweep (HF-497, GLM-7)

Branch: `contrib/dave-gaming-pc/claude/nuketown2-zfight` (worktree `aa-claude-zfight`).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273` [VERIFIED].
Range reviewed: `origin/contrib/dave-gaming-pc/claude/pass93-candidate..HEAD`, 1 commit:

- `e46ca6c9` fix(nuketown2): z-fight sweep - HF-497 same-material-visible coplanar class

Diff over `src`+`scripts/qa`: 5 files, 653 insertions, 197 deletions [VERIFIED from
`git diff --stat`]. Also read: `docs/evidence/pass94/nuketown2-zfight/REPORT.md`
(full, 198 lines) and the base version of `scripts/qa/find-coplanar-pairs.ts`
(via `git show ...:scripts/qa/find-coplanar-pairs.ts`) for the before/after
classification comparison.

Claim-states: `[VERIFIED]` = read off source/diff in this worktree;
`[INFERENCE]` = reviewer judgement; `[ABSENT]` = looked for, not found.
No builds, browsers, or test runs were executed per the task brief; all
gate numbers below are QUOTATIONS from REPORT.md, cross-checked against
the diff logic — the visual result is therefore NOT independently verified,
exactly as REPORT.md itself states.

## (1) Checker extension: strengthening, thresholds, counts

**Strengthening [VERIFIED].** Base precedence
(`find-coplanar-pairs.ts` @ base, `main()` classification chain):

```
street > houseInterior > fencedByOffset > sameMaterial(BENIGN) > FINDING
```

with `NEAR_METERS = 0.03` and exit code failing only on
`findings/houseInterior/street`. New precedence
(`src/nuketown2-coplanar-audit.ts:279-301` `classifyPair`):

```
street > houseInterior > fencedByOffset > sameMaterial{presentationOnly→benign;
overlap<MIN_RACE_AREA_M2→contact; !raceRegionVisible→benign;
else same-material-visible(FINDING)} > finding
```

No class was downgraded: every pair that was a FINDING before is still a
FINDING (the `finding` fallthrough is byte-identical logic), every pair that
was FENCED is still FENCED (the fence test is unchanged and still dominates
same-material), and the only re-partition is old-BENIGN splitting into
`benign / contact / same-material-visible`, of which only the last is a
finding. Thresholds unchanged: `COPLANAR_NEAR_METERS = 0.03`
(`nuketown2-coplanar-audit.ts:58`) equals base `NEAR_METERS = 0.03`;
`MIN_RACE_AREA_M2 = 0.02` (`:66`) is NEW but gates only the new class, and
the 1e-4 plan-overlap epsilon and footprint tests are untouched (moved
verbatim). Exit-code change (`find-coplanar-pairs.ts:102-106`) ADDS
`sameMaterialVisibleFindings === 0` to the pass condition — strictly harder
to pass. The scan core moved verbatim into `src/nuketown2-coplanar-audit.ts:122-179`
(`collectBoxes`, incl. the PASS 92 traverse fix, batch-source, instanced/
rotated/non-box skips, collisionOnly slopes) and both the instrument
(`find-coplanar-pairs.ts:45-50`) and the new vitest pin import it, so
instrument and gate cannot drift [VERIFIED].

**Before/after [QUOTED from REPORT.md, logic cross-checked]:**

Before (legacy instrument @ `3e2fd273`):
```
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL (benign): 26
Exit code: 0
```
Strengthened instrument on the UNFIXED arena (fails as designed):
```
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL-VISIBLE: 8 · CONTACT: 8 · SAME-MATERIAL (benign): 10
Exit code: 1
```
After the three fixes:
```
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 177 · SAME-MATERIAL-VISIBLE: 0 · CONTACT: 4 · SAME-MATERIAL (benign): 10
Exit code: 0
```
Arithmetic closes: 26 = 8+8+10 before; 8 visible → FENCED (+8 = 173… observed
177 because the cap clone also fences 4 CONTACT pairs: 8+4 = 12, 165+12 = 177;
CONTACT 8−4 = 4; BENIGN 10 unchanged) [VERIFIED by counting]. Geometry
untouched: 819 boxes / 191 pairs in all three readings.

**"Other arenas stay at or below previous counts" — VACUOUS [VERIFIED].**
`collectBoxes` builds ONLY nuketown2 (`audit.ts:122-124`:
`buildNuketown2(scene)`); no other arena is scanned by this instrument, so no
other arena's count can move by construction. REPORT.md says exactly this
(§Instrument change). There is no cross-arena regression surface here.

## (2) Each tier/offset change: collider vs visual, gap/light-leak risk

All three fixes are material-object swaps ONLY — positions, sizes, options
unchanged [VERIFIED from diff]:

1. Perimeter wall corners (`src/nuketown2-arena.ts:3246-3258`, `perimeter()`):
   `m.fence` → `m.fence.clone()` + `polygonOffset(-1,-1)` on the END wall
   only; the LONG wall keeps `m.fence`. Call had NO options before and has
   NO options after → default solidity path unchanged; collider (extents,
   registered by `box()` via `pair()` at the same position/size) does not
   move. polygonOffset is a depth-buffer tie-break, not a geometric offset:
   cannot open a gap or light leak [VERIFIED mechanism; visual NOT verified
   without GPU — REPORT.md honestly marks this [INFERENCE], agreed].
   Side-face note: the offset biases ALL faces of the end wall, not just the
   top; at tier −1 against a same-tier neighbour this is the arena's existing
   decal-tier contract (HF-434) and the magnitude is one depth unit step —
   no plausible through-wall draw. Non-blocking.
2. Balcony rail cap (`src/nuketown2-arena.ts:1698-1710`, `house()`):
   `m.trim` → `m.trim.clone()` + tier −1 on the CAP only.
   Options `{ solid: false, shots: false, cast: true }` identical before/after
   → non-collider, non-shot-surface before and after; parity gate unaffected
   by construction. Same depth-only reasoning; no gap possible (no vertex
   moved).
3. Yard butt pad (`src/nuketown2-arena.ts:3143-3155`, `yard()`):
   `m.drive` → `m.drive.clone()` + tier −1 on the SMALLER pad.
   Options `{ solid: false, shots: false, cast: false }` identical
   before/after → lawn-level dressing, no collider/shot surface; parity gate
   unaffected. Smaller-wins choice is arbitrary but deterministic, which is
   all a tie-break needs.

Shared-registry hygiene [VERIFIED]: each fix clones (`m.trim.clone()` /
`m.fence.clone()` / `m.drive.clone()`), renames, and sets the offset on the
CLONE; `m.trim`/`m.fence`/`m.drive` themselves are untouched, so the
`nuketown2-materials.test.ts` role pins cannot break. REPORT.md quotes the
adjacency runs (grime-decals 8 passed, materials 49 passed).

## (3) Any body hidden rather than tiered? [ABSENT]

No. Zero `visible = false`, zero `presentationOnly` additions, zero deletions,
zero size/position edits in the diff. The three touched call sites change only
the material argument. Deliberately-unchanged rows (REPORT.md §"audited and
NOT changed": 4 CONTACT rail butt joints, 10 BENIGN window-trim rows, 165→177
FENCED rows incl. the 8 same-tier transparent grime films, presentation-only
vehicle trim) are argued with a mechanism (race-region sampling / family lifts
/ owner presentation rule), not hidden. The new test pins the class at zero
rather than excluding bodies.

## (4) Any test loosened? [ABSENT]

No threshold, tolerance, or assertion was weakened [VERIFIED]: the only test
delta is the ADDED pin (`src/nuketown2-fidelity.test.ts:2680-2696`,
`same-material-visible === 0` via the shared core, with a no-name-list
comment). No existing expectation was edited; the instrument's exit condition
got STRICTER (see §1). REPORT.md's "no gate weakened" claim is accurate.

## Findings (non-blocking nits)

1. `docs/evidence/pass94/nuketown2-zfight/REPORT.md:85` (and arena comment
   `src/nuketown2-arena.ts:3249`): REPORT says "overlap = 0.2 m2 per corner
   (0.4 m x 0.4 m post)" — 0.4×0.4 = **0.16** m2, which is what the code
   comment says. Docs arithmetic slip; smallest fix: change REPORT "0.2 m2"
   to "0.16 m2". No checker/arena impact (the classifier uses measured
   overlap, not the prose number).
2. `REPORT.md:96-97` vs `src/nuketown2-arena.ts:1698-1700`: REPORT "overlap
   0.5 m2", comment "0.53 m2". Rounding-level inconsistency; smallest fix:
   pick one (measured value to 2 dp) and use it in both places.
3. `src/nuketown2-coplanar-audit.ts:234-236` `strictlyInside` uses strict
   inequalities, so a sample exactly ON a box face never counts as buried —
   correct for the upper face's own plane, and the lower-face burial test
   (`:265-268`) handles the inside-upper-body case explicitly. Read twice for
   an off-by-epsilon that would misclassify the sill/stool BENIGN rows;
   none found — the sampling + burial combination is the reason those 10 rows
   stay BENIGN. No fix; recorded so the next reader need not re-derive it.

## Verdict: SHIP

1. The checker change is a pure strengthening (same 0.03 m window, same fence
   rule, old-BENIGN split only, exit code strictly harder) and nuketown2 reads
   0 on the new class with geometry byte-identical (819/191 throughout).
2. Every fix is a depth tie-break on a cloned material — no collider, shot
   surface, vertex, or registry role moves, so parity/forging gates cannot
   regress and no gap or light leak is geometrically possible.
3. Nothing was hidden and nothing was loosened: the added vitest pin shares
   the instrument's exact core, and the honest [INFERENCE]-labelled visual
   claims in REPORT.md are the only unverified part — inherent to a
   no-GPU task, and the mechanism (identical paint + 1-step depth bias) is
   the standard HF-434/HF-346 contract already shipped elsewhere.
