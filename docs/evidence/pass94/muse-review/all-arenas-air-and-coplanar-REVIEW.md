# Muse review — all-arenas air + coplanar sweep (pass 96, HF-486/503)

Reviewer: Muse Spark 1.3 (skeptical reviewer) via OMP, `dave-gaming-pc`.
Lane: `contrib/dave-gaming-pc/claude/all-arenas-air-and-coplanar`
Range: `origin/contrib/dave-gaming-pc/claude/pass93-candidate..96819787` (3 commits).
Base: `465ae6b7` (`origin/.../pass93-candidate`). Head: `96819787`.
Report under review: `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md` (GLM 5.3 Flash, 2026-09-04).
Constraints honored: no builds, no browsers, no GPU; no `npm install/ci/rebuild`; static review only.
No test was executed by this reviewer; gate quotes are the worker's, cross-checked against the diff and committed evidence.
This verdict supersedes the `a5c51eae`-range review committed at this head: same src/scripts geometry, range extended through `96819787`.

## Commits reviewed

```
96819787 docs(pass96): Muse review - all-arenas air + coplanar sweep   (prior review file only)
a5c51eae fix(arenas): coplanar sweep - raid2 and farcrysis finding classes to zero
0fae56d8 fix(look): all-arenas air - nuketown2 visible radius/alpha floor for every arena
```

## Diff scope (src + scripts only; docs/evidence excluded)

```
scripts/qa/find-coplanar-pairs.ts
src/arena-coplanar-findings.test.ts          (new, 93 lines)
src/particles/ambient-visibility.test.ts
src/particles/particle-catalog.ts
src/raid2-arena.ts
```

`src/collider-visual-parity-gate.test.ts`, `src/legacy-main-size-ratchet.test.ts`,
`src/spawn-layout-constraints.ts`, `src/nuketown2-arena.ts`, `src/farcrysis.ts`,
`src/additional-maps.ts` are byte-identical to base (empty diff — verified).
`git diff -- src/raid2-arena.ts | grep -cE 'verge|fairness|corridor|furniture|aggregate|spawn|tiler|merger|deferred'` = 0.

## The five asked checks

### (1) Geometry/placement corrections only; checker classes stay 0 — VERIFIED

Checker invocation and results (quoted from committed evidence):

```
$ npx tsx scripts/qa/find-coplanar-pairs.ts            (nuketown2 default, after)
  # boxes=687 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0
  #   · FENCED (material offset): 165 · SAME-MATERIAL (benign): 26
  # HOUSE-INTERIOR 0, STREET 0                          -> exit 0
$ npx tsx scripts/qa/find-coplanar-pairs.ts --all       (before-sweep.txt -> after-sweep.txt)
  BEFORE: raid2 FINDINGS 21 · farcrysis FINDINGS 5 · HOUSE-INTERIOR 0 / STREET 0 every arena
  AFTER:  raid2 FINDINGS 0  · farcrysis FINDINGS 0  · HOUSE-INTERIOR 0 / STREET 0 every arena
```

- All 21 before-raid2 FINDING rows are flush tops (`dy=0.0000m`): piers/walls at `top=3.400`
  against decks/slabs at `3.400`, plinth vs planters at `1.900`, steps vs paving at `0.000`.
- All 5 before-farcrysis FINDING rows are authored-invisible pairs: 4 x
  `farcrysis-bound-{n,s,e,w}` corners at `top=4.000` + `farcrysis-art-tower-platform-collider`
  vs platform at `top=4.895`. None draws a fragment; reclassification (not geometry) is correct.
- `HOUSE-INTERIOR`/`STREET` are nuketown2 authored-footprint classes; gating them on
  `scopeFootprints = arenaId === 'nuketown2'` (`find-coplanar-pairs.ts:250,268-270`) with the
  "structurally absent, read 0" header is honest, not a loosening. They read 0 before and after.
- The collider-visual parity walk-through is untouched (file not in diff); raid2 shifts stay
  inside its `CENTRE_TOLERANCE = 0.06` by construction (0.04 m, see finding 1).

### (2) Spawn fairness, verge ceilings, corridor ratio untouched — VERIFIED

No diff hunk touches spawn bands, verge/furniture/aggregate counts, or corridor ratio:
protected-file diffs are empty and the raid2 diff contains zero matching tokens (census above).
Raid2 edits move only TOP faces ±0.04 m; footprints, masses, mouths, routes unchanged.

### (3) Fixes in the arena factory, nothing hidden, no shrunk colliders — VERIFIED (with wording fix)

- Every raid2 edit goes through `rect()` / `wallAlongX|Z()` with default `solid:true`
  (`src/raid2-arena.ts:469-473,488-489,496-498,507,520,742,780-781`): pavilion walls x4,
  pool steps +0.04, pool-bar walls x3, pergola piers x2, colonnade piers x3, fountain plinth
  −0.04 to 1.86 m, garage piers x3. No `visible=false`, no deleted body, no decoupled collider.
- Offset direction is buried-inside-the-mating-solid past the 0.03 m window — same resolution
  as the cited farcrysis rail laps. Steps go flush 0.0 → 0.04 lip, still under the 0.42 m
  autostep; plinth 1.90 → 1.86 m stays the island's tallest mass.
- Precision: `box()` (`src/additional-maps.ts:92-160`) derives colliders + shot surfaces from
  the same extents, so collider/shot tops move WITH the visual. Benign (inside 0.06 tolerance),
  but the REPORT's "keeps collider authority / no collider moved" is wrongly worded → finding 1.

### (4) No loosened/skipped tests; size ratchet respected — VERIFIED

- `ambient-visibility.test.ts`: motes `toBeGreaterThan(0)` → `toBeGreaterThanOrEqual(2px)` —
  strictly tightened; drift already `>= 2px`. Roster derived from `ARENA_PARTICLE_PROFILES`.
- `arena-coplanar-findings.test.ts` is new: ceilings AT measured values, `Record<ArenaId,…>`
  (new arena without a row is a compile error), plus an exact-zero pin for raid2/farcrysis.
- Densities byte-identical (14-bin census identical; diff touches only `radiusM`/`opacity` +
  comment). `legacy-main-size-ratchet.test.ts` untouched; worker quotes it green in the
  29-file/230-test run. Art note (accepted): farcrysis leaf drift shrinks 0.075→0.055 and
  gun-range lint grows 0.030→0.055 — the cost of one catalog-wide floor, still ≥2 px and
  under the 0.16 readability bound.

### (5) Nuke Town cold path untouched — VERIFIED

No tiler, merger, deferred-geometry, `nuketown2-arena.ts`, or layout file is in the diff.
The instrument only reads `NUKETOWN2_*_FOOTPRINTS` and reuses `ARENA_BUILDERS`/`prepareMap3`
read-only; nuketown2 classification is byte-identical to pass-94 (`FENCED 165, SAME-MATERIAL 26,
pairs 191, FINDINGS 0`; 132 pairless decal bounds move to the named UNAUDITED list, 819→687 boxes).
The batch-source exception (`staticBatchRendered`) is load-bearing and retained — without it
the nuketown2 decal discipline would silently leave the audit.

## Findings (file:line, why, smallest fix)

1. `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md:152-154` + `src/raid2-arena.ts:158-169` —
   "keeps collider/shot authority" overstates: colliders/shot surfaces move ±0.04 m WITH the
   visual. Fix: reword to "move WITH the visual by the same 0.04 m; inside the 0.06 m parity
   tolerance, buried in the mating solid; no hidden/decoupled collider". Words only.
2. `docs/evidence/pass96/all-arenas-air-and-coplanar/after-sweep.txt:1-11` — headers record
   `head 465ae6b7` though raid2-0 geometry exists only at `a5c51eae`. Fix: annotate "geometry at
   `a5c51eae`, instrument base `465ae6b7`". Provenance only.
3. `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md:149-150` (pool steps) — quote the
   coping-top `y1` the "riser to coping still 0.26 m" claim is measured against. One sentence.
4. `scripts/qa/find-coplanar-pairs.ts:115-135` (invisible exclusion) — no UNAUDITED pin, so a
   future `visible=false` regression exits the audit silently (names are printed, but unpinned).
   Fix in a follow-up lane: pin per-arena UNAUDITED counts in `arena-coplanar-findings.test.ts`.
   Not a ship-blocker.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. Both outcomes are real and correctly scoped: all-arenas air above the 2 px floor with
   densities provably unchanged, and raid2 + farcrysis provably at 0/0/0 with every other
   arena's findings pinned AT (never above) measured values on a roster-derived table.
2. No test was weakened — the ambient suite was tightened, the coplanar suite is new and
   ceiling-shaped, and the instrument's NaN/invisible boundary fixes are disclosed, reasoned,
   and preserve the pass-94 nuketown2 classification exactly.
3. The only defects are words and provenance (findings 1–3; finding 4 is a follow-up): doc,
   comment, and evidence-header edits, no geometry rework, no re-sweep needed.
