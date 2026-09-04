# Muse review — all-arenas air + coplanar sweep (pass 96, HF-486/503)

Reviewer: Muse Spark 1.3 (skeptical reviewer) via OMP, `dave-gaming-pc`.
Lane: `contrib/dave-gaming-pc/claude/all-arenas-air-and-coplanar`
Range: `465ae6b7..a5c51eae` (2 commits).
Base: `465ae6b7` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`).
Report under review: `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md` (GLM 5.3 Flash, 2026-09-04).
Constraints honored: no builds, no browsers, no GPU; no `npm install/ci/rebuild`; static review only.
No test was executed by this reviewer; all gate quotes below are the worker's, cross-checked against the diff and the committed evidence files.

## Commits reviewed

```
a5c51eae fix(arenas): coplanar sweep - raid2 and farcrysis finding classes to zero
0fae56d8 fix(look): all-arenas air - nuketown2 visible radius/alpha floor for every arena
```

## Diff scope (src + scripts/qa)

```
docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md
docs/evidence/pass96/all-arenas-air-and-coplanar/after-sweep.txt
docs/evidence/pass96/all-arenas-air-and-coplanar/before-farcrysis.txt
docs/evidence/pass96/all-arenas-air-and-coplanar/before-raid2.txt
docs/evidence/pass96/all-arenas-air-and-coplanar/before-sweep.txt
scripts/qa/find-coplanar-pairs.ts
src/arena-coplanar-findings.test.ts          (new, 93 lines)
src/particles/ambient-visibility.test.ts
src/particles/particle-catalog.ts
src/raid2-arena.ts
```

No other `src` / `scripts/qa` file moves in this range. `src/farcrysis.ts` is untouched (zero-geometry clearance claim is structurally plausible).

---

## Claim-state answers (the five asked questions)

### (1) Densities byte-identical per arena — VERIFIED

The worker's before/after table (`REPORT.md:33-45`) is quoted verbatim here because the task demands it:

| arena | motes r/a before | motes r/a after | drift r/a before | drift r/a after |
|---|---|---|---|---|
| atomic-acres | 0.016 / 0.085 | 0.026 / 0.11 | ash 0.045 / 0.12 | ash 0.055 / 0.15 |
| skyline-terminal | 0.014 / 0.08 | 0.026 / 0.11 | lint 0.038 / 0.10 | lint 0.055 / 0.15 |
| rustworks-1v1 | 0.018 / 0.09 | 0.026 / 0.11 | foam 0.050 / 0.13 | foam 0.055 / 0.15 |
| gun-range | 0.012 / 0.11 | 0.026 / 0.11 | lint 0.030 / 0.09 | lint 0.055 / 0.15 |
| farcrysis | 0.015 / 0.10 | 0.026 / 0.11 | leaf 0.075 / 0.16 | leaf 0.055 / 0.15 |
| high-seas | 0.017 / 0.095 | 0.026 / 0.11 | foam 0.055 / 0.15 | unchanged |
| test1 | 0.016 / 0.10 | 0.026 / 0.11 | seed 0.040 / 0.11 | seed 0.055 / 0.15 |
| test2 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.045 / 0.12 | seed 0.055 / 0.15 |
| map3 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.042 / 0.10 | seed 0.055 / 0.15 |
| raid2 | 0.015 / 0.09 | 0.026 / 0.11 | seed 0.044 / 0.11 | seed 0.055 / 0.15 |
| nuketown2 | 0.026 / 0.11 | unchanged (reference) | seed 0.055 / 0.15 | unchanged (reference) |

Static verification, independent of the worker:

- Density-token census before vs after is identical in all 14 bins
  (`git show 465ae6b7:...` vs `git show a5c51eae:...`, `grep -oE "density: [0-9.]+"`):
  `0.2x1, 0.4x1, 0.42x2, 0.45x1, 0.5x3, 0.55x1, 0.58x1, 0.62x2, 0.7x4, 0.72x1, 0.75x2, 0.85x1, 0.9x1, 1x1` both sides.
- `git diff` over `src/particles/particle-catalog.ts` contains 39 `radiusM|opacity` token lines and zero other `+/-` content lines besides the pass-96 comment block (`src/particles/particle-catalog.ts:223-227`). Every changed hunk preserves the leading `density`, color, rate and wind tokens character-for-character (spot-checked atomic-acres, skyline-terminal, farcrysis leaf, high-seas foam-unchanged, raid2).
- The budget pin exists where it should: `src/particles/ambient-visibility.test.ts:135-147` pins `nuketown2` motes `0.72` / drift `0.42` and both family capacities (`{low:220,high:520,ultra:900}` / `{low:60,high:140,ultra:240}`). Draw/instance/buffer budgets did not move by construction (density is the only cost input; radius/opacity are shader-side).
- Two art notes, not blockers: farcrysis drift leaf SHRINKS `0.075 -> 0.055` (uniform floor overrides an authored-larger leaf; still 4.71 px at 12 m, so the floor holds); gun-range indoor lint grows `0.030 -> 0.055` with alpha `0.09 -> 0.15` (largest relative change in the catalog, indoors). Both stay under the family/readability ceilings the smoke-screen suite pins — accepted as the cost of one catalog-wide floor.

### (2) Visibility floor: COPIED from nuketown2, not per-arena camera/fog — VERIFIED (as the REPORT honestly states)

- The test uses ONE reading distance, ONE viewport, ONE FOV for every arena:
  `src/particles/ambient-visibility.test.ts:23-37` (`REVIEW_HEIGHT_PX = 720`,
  `REVIEW_VERTICAL_FOV_DEGREES = 70`, `READING_DISTANCE_M = 12`, `MINIMUM_SUBTENDED_PX = 2`).
  The 12 m rationale is the Nuke Town street width (`ambient-visibility.test.ts:26-31`).
- The catalog applies ONE radius/alpha pair to the whole roster
  (`src/particles/particle-catalog.ts:223-227,230-325`): motes `0.026 m / 0.11`, drift `0.055 m / 0.15`.
- Per-arena fog/camera distances (`arena(...)` trailing args, e.g. gun-range `0.9, 14, 7, 3` vs high-seas `0.35, 24, 12, 5`) are not inputs to the floor. After the fix every arena reports motes 2.23 px / drift 4.71 px at 12 m by construction.
- Verdict on the question: copied, deliberately. That is the correct shape for a *minimum-visibility* floor (no arena may ship sub-pixel air), but it is not a per-arena fog-matched art direction. A fog-scaled or camera-scaled floor is a legitimate follow-up, not a ship-blocker. The REPORT does not misrepresent this ("The SAME radius/alpha fix is applied to every other arena", `REPORT.md:24-27`).

### (3) Coplanar fixes are tier/offset — VERIFIED; "no collider moved" — REFUTED as worded (benign, doc fix needed)

What is true:

- All raid2 geometry edits are top-face offsets by one named constant
  `COPLANAR_CLEARANCE = 0.04` (`src/raid2-arena.ts:169`), past the instrument's `0.03 m` window (`scripts/qa/find-coplanar-pairs.ts:56`): pavilion walls x4 (`raid2-arena.ts:469-473`), pool steps sw/ne +0.04 (`raid2-arena.ts:488-489`), pool-bar walls x3 (`raid2-arena.ts:496-498`), pergola piers x2 via loop (`raid2-arena.ts:507`), wing colonnade piers x3 via loop (`raid2-arena.ts:520`), drive fountain plinth (`raid2-arena.ts:742`), garage bay piers x3 via loop over `[-9,-1,7]` (`raid2-arena.ts:780-781`). Nothing hidden, no body deleted, no `visible=false` introduced by this lane. farcrysis has zero geometry edits (no `src/farcrysis.ts` in the diff) — its 5 findings were authored-invisible pairs correctly reclassified (see below).
- The offset direction is buried-inside-the-mating-solid (walls/piers/plinth stop short; steps rise into the coping zone), matching the precedent the comment cites. The garage loop edits all three piers uniformly, not just the `z=7` carrier named in the REPORT — uniform treatment, correct.

What is worded wrongly:

- `src/additional-maps.ts:92-160` (`box()`) couples visual mesh, movement collider (`builder.colliders.push(bounds)`), and shot surfaces (`builder.raycastMeshes` / `shotSurfaces`) from the SAME extents. Every raid2 edit above goes through `rect()` / `wallAlongX|Z()` with default `solid:true` (only `{cast:false}` on the steps, which still leaves `solid:true`, `shots:true`). **Collider tops and ballistic-surface tops therefore move ±0.04 m with the visual.** The REPORT's "every body keeps its mass, collider and shot authority" / "no collider moved" (`REPORT.md:152-154`) is false as stated.
- Why it is benign: the parity gate tolerates it by design — `CENTRE_TOLERANCE = 0.06` in `src/collider-visual-parity-gate.test.ts:100` absorbs a 0.04 m top shift, and the shifted tops stay buried inside the mating solid (or, for the steps, 0.04 above paving with riser-to-coping still under the autostep per the REPORT's measured claim). No decoupled invisible collider is introduced; the gate's "zero invisible colliders" direction still holds structurally.
- Smallest fix: reword the REPORT raid2 section and the `src/raid2-arena.ts:158-169` comment to "colliders and shot surfaces move WITH the visual by the same 0.04 m (single `box()` extent); shift is inside the 0.06 m parity tolerance and buried in the mating solid; no hidden/decoupled collider". No geometry rework required.

Pool-step lip note: the two lower steps go from flush (`-0.28+0.28 = 0.0`, coincident with paving top `0.0`) to a 0.04 m lip above paving. Still under any autostep and the stated 0.26 m riser-to-coping holds only if the coping top cited in the REPORT is the one I could not re-derive statically — ask the worker to quote the coping `y1` in the REPORT's raid2 section. Gameplay-safe on its face; provenance nit only.

### (4) Per-arena ceiling table pinned AT measured values, roster-derived — VERIFIED

- Committed evidence summary (`after-sweep.txt:1-11`): nuketown2 0 / raid2 0 / atomic-acres 25 / skyline-terminal 39 / rustworks-1v1 11 / gun-range 43 / farcrysis 0 / high-seas 8 / test1 21 / test2 33 / map3 1 — matches `MEASURED_FINDING_CLASSES` in `src/arena-coplanar-findings.test.ts:36-52` EXACTLY, including HOUSE-INTERIOR 0 / STREET 0 on every row.
- No ceiling sits above its measured value; raid2 + farcrysis are pinned with an additional exact-zero test (`arena-coplanar-findings.test.ts:85-92`) on top of the `<=` ceiling tests (`:71-83`), so a regression fails twice and loudly.
- Roster derivation is real, not prose: the test iterates `ARENA_IDS` (`src/arena-identity.ts:8`), the table is `Record<ArenaId, ...>` so a new arena without a row is a compile error and a retired arena cannot leave a stale row (`arena-coplanar-findings.test.ts:20-22,62-66`). The instrument side derives `--all` from the same `ARENA_IDS` (`find-coplanar-pairs.ts:323-335`).
- HOUSE-INTERIOR/STREET gating (`scopeFootprints = arenaId === 'nuketown2'`, `find-coplanar-pairs.ts:250,268-270`) with the "structurally absent, read 0" header note (`:300-303`) is the correct treatment for authored-footprint classes — they are nuketown2 tables, and inventing findings against nothing on other arenas would be as dishonest as hiding findings.

### (5) Any test loosened — NONE FOUND (one scope change flagged as accepted)

- `src/particles/ambient-visibility.test.ts` diff (`@@ -74,20 +74,20 @@`, `@@ -97,7 +98,10 @@`): motes assertion goes `toBeGreaterThan(0)` → `toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX)`; drift was and stays `>= 2 px`. Comment-only lines reframe PASS-94 history accurately. Strictly tightened.
- Smoke-screen suite (`ambient-visibility.test.ts:109-133`) unchanged in force: family ceilings + `fineMaxOpacity 0.16` double-bound intact.
- `src/arena-coplanar-findings.test.ts` is new; there is no prior ceiling to loosen. Its `<=` shape plus exact-zero pin for the two swept arenas is the strongest correct form (non-swept arenas may only go down without a deliberate edit here).
- Instrument default preserved: no-flag run still measures exactly nuketown2 (`requestedArenas`, `find-coplanar-pairs.ts:323-335`), so the pass-94 acceptance command is byte-compatible as claimed. Unknown `--arena` exits 2 with the roster printed (`:350-356`). `--all` aggregates exit code across arenas (`:365-391`) — one arena's regression fails the run, correct.
- The one genuine scope change is the instrument's audit boundary, and it is disclosed, not smuggled:
  (a) non-finite boxes → `UNAUDITED (non-finite)` (`find-coplanar-pairs.ts:142-152`) — fixes the NaN-flood where `dy > NEAR` is false for NaN and one bad body pairs with everything (map3 shoreline/godrays). Correct.
  (b) authored-invisible meshes → `UNAUDITED (invisible)` with the batch-source exception retained via `staticBatchRendered` (`:115-135`) — nuketown2 classification byte-identical on the audited classes (`FENCED 165, SAME-MATERIAL 26, pairs 191, FINDINGS 0`); 132 pairless decal field bounds move to the named list, boxes 819 → 687. Correct and the exception is load-bearing: without it the nuketown2 decal discipline would silently leave the audit.
  (c) farcrysis boxes 237 → 77, UNAUDITED 752 → 912 on the same base geometry — the 5 cleared "findings" are exactly the before-file's invisible pairs: 4 x `farcrysis-bound-{n,s,e,w}` corner pairs at `top=4.000` plus the `farcrysis-art-tower-platform-collider` vs platform pair at `top=4.895` (`before-farcrysis.txt` FINDING rows). None can z-fight (draws nothing). Zero-geometry clearance is the right call.
- Residual risk of (b), accepted but recorded: exclusion is by ancestor `visible === false`, so a future bug that flips a visible mesh invisible would silently LEAVE the audit instead of failing. The names are printed in every report header (nuketown2 198, farcrysis 912 entries), so the evidence exists — but no test pins the UNAUDITED set. Smallest hardening (follow-up, not blocker): pin per-arena UNAUDITED counts/names or a delta-reviewed allowlist so a newly-invisible mesh fails loudly. The current lane does not need it to ship.

---

## Findings (file:line, why, smallest fix)

1. `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md:152-154` + `src/raid2-arena.ts:158-169` — "keeps collider/shot authority, no collider moved" overstates. `box()` (`src/additional-maps.ts:92-160`) derives colliders + shot surfaces from the same extents the lane edits, so all raid2 tops move ±0.04 m in every authority at once. Fix: reword to "colliders/shot surfaces move WITH the visual by the same 0.04 m; inside the 0.06 m parity tolerance (`src/collider-visual-parity-gate.test.ts:100`), buried in the mating solid; no hidden/decoupled collider". No geometry change.
2. `docs/evidence/pass96/all-arenas-air-and-coplanar/after-sweep.txt:1-11` headers record `head 465ae6b7` although the committed file contains post-clearance geometry (raid2 0 FINDINGS only exists at `a5c51eae`). Same for the per-arena `head` lines (e.g. farcrysis `head 465ae6b7 · generated 2026-09-04T21:40:20Z` in `before-farcrysis.txt` vs after). Fix: regenerate the after-file header at the landing commit or annotate "geometry at `a5c51eae`, instrument base `465ae6b7`". Provenance only.
3. `scripts/qa/find-coplanar-pairs.ts:127-135` (invisible exclusion) — no UNAUDITED pin means a future `visible=false` regression exits the audit silently. Fix (follow-up lane): pin per-arena UNAUDITED counts or name-sets in `src/arena-coplanar-findings.test.ts`, or require the evidence diff to be reviewed when the count moves. Ship does not depend on it.
4. `docs/evidence/pass96/all-arenas-air-and-coplanar/REPORT.md:149-150` (pool steps) — quote the coping-top `y1` the "riser to coping still 0.26 m" claim is measured against, so the 0.04 m lip above paving is checkable from the REPORT alone. One sentence.

No hidden bodies, no moved-then-unmentioned colliders beyond finding 1's wording, no loosened test, no ceiling above measured, no hardcoded roster.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. Both technical outcomes are real and correctly scoped: densities provably unchanged (identical 14-bin census, radius/opacity-only diff, budget pins intact) with every arena now above the 2 px floor; raid2 + farcrysis provably at 0/0/0 with every remaining arena's findings pinned AT (never above) measured values on a roster-derived table that fails a new flush pair and compile-errors a new arena without a row.
2. No test was weakened to get green — the ambient suite was tightened (`>0` → `>=2 px` on motes), the coplanar suite is new and strictly ceiling-shaped, and the instrument's two audit-boundary fixes (NaN guard, authored-invisible naming with the batch-source exception) are disclosed, reasoned, and preserve the nuketown2 pass-94 classification exactly.
3. The only defects are words and provenance, not geometry: the "no collider moved" sentence is inaccurate (colliders move WITH the visual inside tolerance — benign by construction), the after-file header SHA is stale, and the invisible-exclusion deserves a future UNAUDITED pin. All three are doc/comment/evidence fixes; none requires re-cutting geometry or re-running the sweep.

Ship after fixes 1, 2 and 4 (all in `REPORT.md` + one comment in `src/raid2-arena.ts:158-169`); fix 3 is a follow-up lane.
