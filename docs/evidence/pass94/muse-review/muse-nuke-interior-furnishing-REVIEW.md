# Muse review: muse-nuke-interior-furnishing

**Branch:** `contrib/dave-gaming-pc/muse/nuke-interior-furnishing` @ `bd38bd91`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba`
**Diff vs base:** `docs/evidence/pass95/nuke-interior-furnishing/REPORT.md` (new, 87 lines)
+ `src/nuketown2-arena.ts` (+110, zero deletions). No test, threshold, or config touched.
**Lane rules:** `nuketown2-interiors-accuracy` REPORT (HF-478), read via
`git show origin/contrib/dave-gaming-pc/claude/nuketown2-interiors-accuracy:...`
**Method:** static review only — no builds, no browsers, no GPU per review brief.
Gate outputs below are the REPORT's quotes, cross-checked structurally against source.
Nothing was re-run here.

## Verdict: SHIP-WITH-FIXES

1. All five gates hold structurally (details below); the two defects are visual nits
   (F1, F2), not gate failures — safe for candidate 9 once fixed.
2. F1 is a genuine visible defect on a look-motivated branch (TV set floats 5 cm
   above its console); it will read as broken in the integrator's capture.
3. F3 corrects the REPORT's only stale claim; F4 records the one real coverage hole
   (interior walk lines are author-asserted, not gate-probed) as follow-up, not blocker —
   my static clearance math (check 2) confirms margin everywhere.

## Check 1 — ballistic classes: PASS

- All 7 solids carry explicit `wood`: island `nuketown2-arena.ts:2143`, dining table
  `:2145`, bookshelf `:2147`, couch `:2197`, armchair `:2199`, coffee table `:2201`,
  TV console `:2203`. `ballisticMaterial: 'wood'` (valid id) returns
  `{material:'wood', classification:'explicit'}` (`src/ballistics.ts:173-175`), so none
  can fall through to the `house`-prefix `interior-wall` rule. Never `reinforced`.
- All 37 dressing emitters per house pass `{solid:false, shots:false}`; `box()` registers
  no collider and no shot surface on that path (`nuketown2-arena.ts:1020-1044`:
  `shots = options.shots ?? solid`, gated pushes). Zero unclassified colliders.
- Net ballistic effect: +14 explicit `wood` (penetrate, entryCost 0.38) shot surfaces,
  +0 fallback, +0 unrated raycast meshes. The `nuketown2: 0` fallback ceiling
  (`src/ballistics.test.ts:80`, enforced over `ALL_ARENA_IDS` at `:288-305`) holds
  by construction.

## Check 2 — mirroring, doorways, stair: PASS (with boundary noted)

- All 44 emitters go through `pair()` — the single-path 180-degree mirror
  (`nuketown2-arena.ts:939-973`); a half-mirror is structurally impossible. Count:
  26 front + 18 back = 44 per house, x2 houses = +88 boxes = REPORT's 950 -> 1038. Exact.
- Static clearance (authored frame; north world x = -authored):
  - Island x `[-6.0,-4.0]` vs internal-door run `[-3.6,-1.8]` (`:731`): 0.40 m clear in x,
    1.20 m clear in z (island z max -15.3 vs door plane -16.5).
  - Dining table authored x `[1.1,2.7]` vs front-door approach run `[-2.15,-0.35]`
    (`:729`, centre `:491`): 1.45 m clear. Chairs likewise.
  - Couch authored x `[-0.2,2.0]` vs back-door run `[-2.15,-0.35]`: east, 0.15 m edge
    clearance; walk-line capsule edge clears by ~0.67 m (PLAYER_RADIUS 0.38).
  - Armchair x max 2.85 vs garage-link plane x ~4.1 (`:732`): 1.25 m; z `[-21.0,-20.2]`
    vs probe z -18.7: 1.5 m. Console x `[0.2,2.0]` vs internal-door run: clear.
  - Stair strip x `[-6.45,-4.8]` (`:375-389`): island overlaps in x but sits in the front
    room (z >= -15.3) while the flight is in the back room — z-separated, untouched.
- Probe evidence is real: door sweep over every `NUKETOWN2_DOORWAYS` row, both signs
  (`src/nuketown2-fidelity.test.ts:1607+`); garage-link stations x 3.6/4.35/5.1 (`:1055-1056`);
  stair traversal both directions (`:1281+`).
- Boundary (see F4): probes cover door planes and the stair, not the interior walk
  lines between new furniture — those clearances are author-asserted + verified by hand
  above, not gate-asserted.

## Check 3 — coplanar + furniture ceilings: PASS

- Instrument scans horizontal TOP faces only, plan overlap over a race floor; occluded
  (stacked-contact) faces are not races (`scripts/qa/find-coplanar-pairs.ts:2-5,22-35,78-92`).
  Stacked dressing contacts (sink/stove on island top, cushions on seat, books on shelf
  crown, chair-back slivers) are fully occluded or sub-race-floor — consistent with
  quoted FINDINGS 0, SAME-MATERIAL-VISIBLE 0.
- Rugs: top 0.12 vs floor top 0.08 → Δ 0.04 m > 0.03 m window (`:2190`, `:2236`). Bases
  (0.08 = floor top) are bottom faces, unscanned. Consistent with HOUSE-INTERIOR 0.
- Ceilings directionally guaranteed: every new name starts `house ` — zero bodies match
  the ` verge ` ceiling census (`src/nuketown2-fidelity.test.ts:2821-2827`, ≤36/≤51),
  so REPORT's 30/45 unchanged holds without re-running.

## Check 4 — materials/pipeline: PASS

- All 7 instances pre-existing: `interior`, `interiorFloor`, `fence`, `trim`, `chrome`,
  `sign`, `windowGlass` (`nuketown2-arena.ts:1103-1133`, `src/nuketown2-materials/index.ts`).
  Diff contains zero material constructors, zero node graphs, build-time emission only
  (in-combat creations 0 by construction). `src/legacy-main.ts` untouched.
- Note: REPORT quotes the 11-file/320-test suite pass (which includes
  `pipeline-metrics`, `graphics-profile-contract`, `legacy-main-size-ratchet`) but pastes
  no per-test pipeline stdout — the no-new-pipeline fact is instead verified from the diff
  itself. Informational only.

## Check 5 — no test loosened: PASS

- Name-only diff is exactly the REPORT + `src/nuketown2-arena.ts`. Zero test files,
  zero thresholds, `BALLISTIC_MATERIALS` untouched. Correlated risk (exact-count
  assertions over colliders/shotSurfaces/physicalCover) checked: all such assertions are
  relational (`>=`, set equality, ceilings) — none can break on +88 boxes.

## Findings

- **F1 (visual defect, fix before candidate):** TV stand and radio float 0.05 m above the
  console. Console top = 0.50 (`:2203`, y 0.25 + 0.50/2); stand base = 0.55 (`:2223`,
  y 0.63 - 0.16/2); radio base = 0.55 (`:2227`, y 0.62 - 0.14/2). Smallest fix: stand
  y 0.63 -> 0.58, radio y 0.62 -> 0.57 (screen `:2225` already overlaps the stand top
  correctly — leave it).
- **F2 (visual nit):** both rug slabs `[0.08,0.12]` intersect the solids standing on them
  (table/couch/chair bases at y = 0), so 4 cm of rug clips into furniture sides
  (`:2190`, `:2236`). Smallest fix: narrow each rug to clear furniture footprints, or
  accept as decal and note it (interacts with lane OPEN 2: furniture sunk 0.08 into slab).
- **F3 (stale claim in REPORT OPEN 3):** "no roster gate looks at this arena" overstates.
  The legacy six-builder test still lacks `buildNuketown2`, but `nuketown2: 0` IS in the
  fallback-ceiling ledger enforced over `ALL_ARENA_IDS` (`src/ballistics.test.ts:80,288-305`),
  and the 7 new solids add zero fallbacks. Smallest fix: reword OPEN 3 to name only the
  six-builder test, and note the ceiling ledger covers the arena.
- **F4 (coverage recommendation, non-blocking):** no new assertions for the 7 solids'
  explicit rating, the interior walk lines, or the quoted counts — all coverage is
  inherited (same shape as lane TODO 2's hardcoded-roster note). Smallest follow-up:
  extend `src/nuketown2-interiors.test.ts` with a derived furniture roster
  (solid colliders inside the house footprint) asserting explicit rating + doorway
  walk-line clearance, instead of hand-listed names.
- **F5 (info):** new dressing omits `presentationOnly` (newer street/verge convention),
  but matches the interiors lane's own dressing style and is harmless: excluded from
  `solidMeshes` via `nuketown2Solid=false` (`:1009`), and the +88 box count matches.

## UNFINISHED (for the integrator, not this branch)

1. Captures owed: `qa:pass74:arena-boot-smoke`, `qa:stock-boot`, interior capture of each
   house's ground floor (REPORT OPEN 1). Reference likeness remains DESIGNED, not verified.
2. Full suite not re-run here (static review per brief); REPORT's 320-test quote stands on
   its own evidence.
3. Pre-existing lane TODOs carry over: six-builder ballistic roster (F3), derived furniture
   roster (F4), vehicle-door margin TODO 3, XZ-only collider match TODO 4, furniture sunk
   0.08 m (lane OPEN 2), FINDINGS.md still uncommitted (lane OPEN 1).
