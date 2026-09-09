# Muse review — layout-hitl5 lane (PASS 94 / HITL 5)

Reviewer: Meta Muse Spark 1.3 (skeptic). Scope: committed lane only,
`origin/contrib/dave-gaming-pc/claude/nuketown2-bo2-accuracy..HEAD`
(3 commits: `d5af6b12` declutter, `7ade1887` corridor band + ceiling + REPORT,
`04d2ef43` bay blockers + corrected spec), i.e. `src/nuketown2-arena.ts`,
`src/nuketown2-fidelity.test.ts`, `docs/evidence/pass94/layout-hitl5/REPORT.md`.
Worktree `C:/Users/david/projects/aa-claude-layout`, branch
`contrib/dave-gaming-pc/claude/layout-hitl5`.

Claim-states: **OBSERVED** = opened and read. **DERIVED** = arithmetic over
OBSERVED values. **INFERRED** = judgement. **OPEN** = not settled, falsifier stated.

Out of scope (OBSERVED, not reviewed, not touched): the worktree is dirty —
`M src/nuketown2-arena.ts`, `M src/nuketown2-layout.ts` (uncommitted bay
implementation: `NUKETOWN2_BAY_DEPTH`/`NUKETOWN2_BAY_RUNS`/lawn re-tiling/`street()`
bays) and `?? _tmp_count.ts` (a counting script). This review covers the committed
HEAD only. The dirty bay work must land as its own diff with the REPORT §6 tests,
not ride along with anything.

## 1. Corridor measurement — SOUND, arithmetic verified, residual answered

DERIVED, re-checked from the source headers at HEAD (all OBSERVED):
`NUKETOWN2_STREET_HALF_WIDTH = 5.3` with header `0.328 − 0.038 = 0.290 L`
(0.290 × 36 = 10.44 m vs authored 2 × 5.3 = 10.6 m, +1.5 % — REPORT table row
correct); `NUKETOWN2_FRONT_VERGE_DEPTH = 4.7` with header `0.553/2 − 0.290/2 =
0.2765 − 0.145 = 0.131 L` (0.131 × 36 = 4.72 m vs 4.70 m — correct);
`NUKETOWN2_HOUSE_FRONT_Z = −(5.3 + 4.7) = −10.0`, corridor = 20.0 m.
Pixel fractions: 221/400 = 0.5525 ≈ 0.553 ✓; 121/400 = 0.3025 ≈ 0.303 ✓;
reference ratio 0.553/0.303 = 1.8251; authored 20/11 = 1.8182; delta −0.38 %,
REPORT's "−0.4 %" ✓. Roof-deck carrier legitimate: at HEAD
`'house roof deck'` is emitted with size `[HOUSE_WIDTH, …]` (`nuketown2-arena.ts:1275`,
`HOUSE_WIDTH = 11` local at HEAD), so the test's `houseWidth` read is the constant
by construction, not a coincidence.

Could "wider in the middle" still be true in a way the ratio misses? OBSERVED the
aerial (`nt2025-aerial-boii.jpg`, near-vertical): the lollipop bulb with its wide
concrete kerb apron IS wider than the stem — the wide part is the head, and the map
already builds it (16 m bulb + kerb islands over slab, stem 10.6 m; lane's aerial
check 425/630 = 0.675 vs authored 10.6/16 = 0.6625 corroborates to ~2 %). Kerb-to-kerb
(10.6 vs 10.44) and face-to-face (20.0 vs 19.91) are both at reference, so neither
reading hides a missing widening. The remaining judgement is the island/apron
treatment, which matches the aerial's wide concrete corners. The lane's reconciliation
— width correct, fill ate the middle, bays add local 15.0 m paved — is the correct
reading. No fix.

## 2. The 18 deleted pairs — all absent from the census, no over-cut

DERIVED: base `pair(builder` count 215 → HEAD 197 = 18 removed, exactly the claimed
18 (diff `@ -2573` block: parcel pedestal/box 2, wheelie 0/1 + 2 lids 4, street
bin + lid 2, hydrant body/cap/nozzles 3, sign post/blade/speed-limit 3, entry
planter urn/shrub 2, front planter/soil 2 = 18 ✓; 36 bodies ✓).
Against FINDINGS Q4 (OBSERVED): the native-resolution census lists kerbs,
pavements, appliance banks, ornamental plants, chain-and-post edging, manhole
cover, mailboxes OPEN — none of the 18 classes is in it. Judgement calls upheld:
second mailbox on the same 36 m drive removed while one per drive kept (mailboxes
are OPEN, so keeping one is the defensible half); entry/front planters removed as
"distinct masses" while the outer verge planter kept as the census's "ornamental
plants" — a real INFERRED line, drawn in the right place. Caveat (no fix needed):
absence rests on the 6 inspected BO2-2025 images; FINDINGS open item 6 notes 5 of
20 files uninspected. The zero-headroom ceiling test is the correct instrument for
exactly this residual: anything the census missed must argue its way back in a diff.

## 3. The five kept pieces — present and load-bearing

OBSERVED at HEAD, all emitted: `verge low wall`, `verge kerb planter` (HF-437
cover — `nuketown2-arena.ts:2611` "THE WIDENED STRIP'S COVER"), `verge front
hedge` (first rung of the front climb chain — `:2603`, wings `:1783`),
`verge appliance cabinet` bank (chirality anchor — `:2622`, `:1134`), `verge
mailbox` + post + flag (one per drive, OPEN retained), plus outer `verge
planter`, town pylon (`verge sign post x2 + verge sign board`, loadscreen
landmark), `verge drive edge` (census edging). The new test asserts all five
load-bearing substrings plus the ceiling. No kept name collides with the
gone-list substrings (`verge planter` ≠ `front planter`; `parcel mailbox` is the
deleted qualified name). No fix.

## 4. Section 6 bay spec — buildable as written, no fairness fight

DERIVED against the exception test (`nuketown2-fidelity.test.ts:1719–1913`,
OBSERVED): (i) `centred()` emits `nuketown2 ${name}`, so spec names
`carriageway bay …` / `carriageway bay kerb …` land in `roadBodies`
(`startsWith('nuketown2 carriageway ')`, `:1855`) and the z-mirror map gives
property (i) by construction ✓; (ii) tops 0.0 (asphalt, −0.06 + 0.06) and 0.18
(kerb, 0.06 + 0.12) ≤ 0.30 ceiling (`:1877–1881`) ✓, and the name regex (`:1843`)
admits `carriageway …` ✓; (iii) bay z ≤ 7.5 ≤ corridor half 10.0
(`:1888–1892`) ✓; lawn tiles with `paired: false` auto-register in
`EXPECTED_ASYMMETRIC_CARRIAGEWAY` (`:1742–1744`), so the 3→11 re-tile cannot be
half-applied ✓. Tile edges re-derived: mouth [−0.2, 4.05] = mouthX+0.3 ..
GARAGE_X0−0.2 ✓, outer [9.45, 17.7] = GARAGE_X1+0.2 .. 18−0.3 ✓, contiguous with
the apron span [4.25, 9.25] covered by the driveway dressing, south 5-piece
mirror consistent under the signed convention ✓. Effect arithmetic: 10.6 + 2×2.2
= 15.0 ✓; 2×(4.25+8.25)×2.2 = 55.0 m² ✓. Spawn fairness: bays are ≤0.18 m
in-corridor surfaces; no spawn, collider band, or sightline (fence-gap parity at
x = −10) moves — nothing to fight. Bay depth 2.2 m stays OPEN on its stated
falsifier, honestly. No fix.

## 5. No test got looser

OBSERVED: `base..HEAD --stat` = 3 files (arena, fidelity test, REPORT). Fidelity
diff is a pure append (`@@ -2406,3 +2407,103`); no existing assertion touched.
Corridor band is two-sided (fails narrower OR wider: 5 % absolute, 3 % ratio —
the ratio survives absolute-anchor changes, as the comment says). Ceiling
`toBeLessThanOrEqual(43)` at the post-cut count is the non-weakening ratchet
form. Size ratchet, parity gate, graphics contract untouched. Coplanar/boxes
figures are lane-reported (not re-run here per the no-build constraint), and the
deleted-classes assertion targets emitters by name, not visibility — the
hide-instead-of-delete loophole is closed. No fix.

## Findings (file:line, why, smallest fix)

- **F1 — `docs/evidence/pass94/layout-hitl5/REPORT.md:84` (decision-table signage
  row): "no BO2-2025 street-elevation image exists at all" is false.**
  `nt2025-street-boii.jpg` is a VERIFIED BO2-2025 image (FINDINGS Q1: elevated
  rear-yard viewpoint showing house, road, coach). Why it matters: the falsifier
  sentence overclaims, and a reviewer checking it finds a live counterexample.
  Substance intact — street-boii frames the rear elevation, not the front verge,
  so it cannot show verge signage either way; the Q4 aerial census still carries
  the REMOVE. Smallest fix: reword to "no BO2-2025 image frames the front verge
  at signage-resolving resolution (street-boii.jpg is a rear-yard viewpoint)".
- **F2 — REPORT §2 absence claims ("no BO2-2025 image contains at all" for
  bins/hydrants): scope to the inspected set.** FINDINGS open item 6 leaves 5 of
  20 files uninspected. Smallest fix: append "in the 6 layout-carrying BO2-2025
  images (FINDINGS image list); the 43-body ceiling forces any missed class to
  argue back in a diff" — one sentence, same mechanism the lane already built.

## Verdict: SHIP-WITH-FIXES

1. Corridor, declutter, kept-piece, spec-buildability, and no-loosening claims
   all verify against source, headers, FINDINGS, and the exception test.
2. The two defects are prose overstatements in REPORT.md (F1, F2), not code —
   bounded, each with a one-sentence fix, neither blocking the branch.
3. Bay landing correctly deferred: §6 proves the handed-down design unbuildable
   (pair() 180° image intersection is 1 m — REPORT §6 Blocker 1 DERIVED from
   `pair()` at `nuketown2-arena.ts:869–902`) and leaves a buildable,
   gate-consistent spec with tests prescribed; the dirty worktree implementation
   is explicitly out of this review's scope.
