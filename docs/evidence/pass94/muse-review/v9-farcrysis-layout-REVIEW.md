# Muse review — v9-farcrysis layout stage (PASS 95)

Branch `contrib/dave-gaming-pc/claude/v9-farcrysis` @ `7197e427`, diffed vs
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`. Read `AGENTS.md`,
`docs/evidence/pass95/farcrysis-rebuild/SPEC.md` (787 lines, full) and
`docs/evidence/pass95/farcrysis-rebuild/REPORT.md`. No builds, no browsers, no
`npm install`. Status was clean at review time.

## Verdict: SHIP-WITH-FIXES

Layout may proceed to dressing and later candidate 9. Three reasons:

1. Traceability is honest where it hurts: the 22 m sightline target stays
   `[OPEN]` with 391/1008 over-band samples and a lower-only ratchet, never
   loosened (`src/farcrysis-layout.test.ts:60-64`, `REPORT.md:41`).
2. The arena stays parked in every channel: `selectable: false`
   (`src/map-selection.ts:331`), `multiplayer: false` (`:347`),
   `prototype: true` (`:333`); derived rosters asserted by flag, untouched by
   this diff (empty `map-selection.ts` diff).
3. No test was loosened and parity/coplanar gates hold at 0; the two route
   stops are named solid cover, not invisible walls
   (`route-probe.json`: 30 walked / 2 stopped-at-surface / 0 invisible).

## Check 1 — spec-to-build traceability and the [OPEN] sightline

REPORT.md §"Spec-to-build traceability" maps every layout-stage spec line to
code with `[VERIFIED]`/`[MEASURED]`; the sightline row reads
`[MEASURED] 93.99 m max, p50 17 m, p90 45.3 m, 391/1008 over target; 22 m
target [OPEN]` (`REPORT.md:41`). The final receipt agrees exactly
(`layout-after-layout-final.json`: `maxOpenM 93.99`, `p50 17`, `p90 45.3`,
`overCeiling 391/1008`, `spawnPairsOpen 20/64`, `middle.unjustified []`).
The ratchet is lower-only: `MAX_OPEN_SIGHTLINE_CEILING_M = 94.0`,
`UNDER_CEILING_FRACTION_FLOOR = 0.60`, `OPEN_SPAWN_PAIRS_CEILING = 20`
(`src/farcrysis-layout.test.ts:60-64`), with history stating the L2 clear
"could not move these" because the removed masses "blocked none of the
over-ceiling lines" (`:66-76`). Correct posture: not a spec miss (22 m stands
per SPEC.md §5.2), the band needs occlusion work in dressing (jungle density),
never re-derivation. FINDING-1 below is the dressing consequence, not a layout
defect.

## Check 2 — hidden in every channel

- Flags: `selectable: false` (`src/map-selection.ts:331`),
  `multiplayer: false` (`:347`), `prototype: true` (`:333`). Diff on
  `src/map-selection.ts` is empty — layout changed no registry field.
- Tests: `src/arena-selectability.test.ts:45` asserts the hidden set BY FLAG
  (`SELECTABLE_ARENAS.some(e => e.id === 'farcrysis')` false);
  `src/map-selection.test.ts:43` pins 11-arena display order including
  Farcrysis; MP lab roster is `multiplayer && selectable`
  (`src/map-selection.ts:343-346`), so solo-only keeps it out of MP sweeps.
- REPORT.md gate ledger: registry/selectability/roster + spawn fairness green
  (`REPORT.md:58`).

## Check 3 — coplanar 0, parity 0, spawn bands, ceilings, pipeline budget

- Coplanar: `npx tsx scripts/qa/find-coplanar-pairs.ts` → HOUSE-INTERIOR 0,
  STREET 0, HF-497 SAME-MATERIAL-VISIBLE 0, different-material 0
  (`REPORT.md:60`). Core floor slab inset 0.15 m from every wall inner face "so
  no slab edge is coplanar with a wall (the HOUSE-INTERIOR coplanar class stays
  0)" (`src/farcrysis.ts:758-774`).
- Parity: "0 invisible colliders, 0 walk-through meshes, 0 fall-through floors"
  via collider-visual parity and walkable-surface parity gates
  (`REPORT.md:50`); gates named in G13
  (`src/collider-visual-parity-gate.test.ts`, `src/walkable-surface-parity-gate.test.ts`).
- Spawn fairness bands: `FARCRYSIS_SPAWN_ZONES` derived from the sole table
  `FARCRYSIS_SPAWNS_XZ` (`src/farcrysis-layout.ts:302-315`), `coverReachM: 6`
  (= `SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM`), `visibleEnemyFloorM: 30`
  (= `minimumVisibleEnemySpawnDistanceM`), asserted in
  `src/farcrysis-layout.test.ts:235-247` (every open pair ≥ 30 m). Receipt:
  20/64 open, nearest 48.8 m (test history `:66-76`).
- "Verge ceilings": no such concept exists in farcrysis code (grep `verge` in
  `src/farcrysis*` hits nothing; the term belongs to another arena's street
  layout). Nearest binding edge numbers, quoted instead: shore envelope
  `FARCRYSIS_SHORE` `{descentStartDist: 10, outerDropDist: 1.5, ...}`
  (`src/farcrysis-terrain-authority.ts:81-91`), water level `-0.25`, safety
  floor `-4.5`, bounds ±64 m, all pinned in
  `src/farcrysis-layout.test.ts:166-181`.
- Pipeline budget: `FARCRYSIS_PIPELINE_BUDGET`
  `{maximumFoliageNodeGraphs: TSL_FOLIAGE_MAX_DISTINCT_GRAPHS (=16),
  minimumMaterialsPerFoliageGraph: 4, maximumDrawCalls: 460,
  maximumTriangles: 1_100_000}` (`src/farcrysis-layout.ts:340-346`),
  consumed by `src/rendering/arenas/farcrysis.ts:38-41`, asserted in
  `src/farcrysis-layout.test.ts:189-194` and
  `src/farcrysis-webgpu-pipeline-budget.test.ts:123-127`. Values unchanged,
  only re-routed through the constant (see check 6).

## Check 4 — route probe: 32 routes, 2 palm-cover stops

`route-probe.json` (sha `9548775d`, stock flags, `PASS73_NATIVE_WEBGPU=1`):
planned 32 (= 28 `FARCRYSIS_ROUTE_SEGMENTS` edges + 4 lane-midpoint probes),
attempted 32, skipped 0, walked 30, stopped-at-surface 2, invisibleWalls [].
The two stops name their blockers:

- `core-loop` segment 6 (`[-6.5,0]`→`[-6.5,-6.5]`):
  `farcrysis-enhanced-palm-trunk-collider-35`, wood, 0.41 m.
- `lane-e` midpoint (`[29,0]`→`[8,0]`):
  `farcrysis-enhanced-palm-trunk-collider-37`, wood, 0.41 m.

Intended cover, misplaced position. Palm trunks are spec-sanctioned jungle-band
cover (`FARCRYSIS_COVER_RHYTHM` beach/jungle/core bands;
`src/farcrysis-layout.ts:575` exempts the trunk prefix as
`vegetation-collider`: "its trunk collider exists so the visible trunk is not
walk-through"), and the probe classifies honestly (surface, not invisible
wall). But both stops sit ON authored routes — one on the 4.5 m core loop
itself. FINDING-2.

## Check 5 — pair()/symmetry only where the spec is symmetric

`pair()` (`src/farcrysis.ts:228-241`) emits a body plus its exact 180° partner
`(x,z)→(-x,-z)`; `centred()` (`:217-226`) only centres the origin-symmetric
floor slab. Sole uses: the three core work-light fixtures
(`:805-807`: bracket, hood, lens at `[-5.12/−4.9/−4.72, …, 1.6]` + partners).
The core IS 180°-symmetric: N walls `[-4,±] / [4,±]` @ z −5.5 mirror S walls @
+5.5 (`:701-706`), doors `[0,1.2,∓3.6]` are mutual negations (`:708-710`), so
fixtures on opposite long-wall inner faces preserve the symmetry. No asymmetric
use (spawns, landmarks, lanes untouched by `pair`). Nit: the comment's door
wording ("north door x 0..4, south door x −4..0", `:786-788`) does not match
the wall gaps (both gaps x −2..2); symmetry claim still holds. FINDING-3 (docs
only).

## Check 6 — any test loosened? No. Ratchets hold or tighten

- `src/farcrysis.test.ts:263-276`: the vacuous `maxSightline >= 0` assertion
  (PASS 74 audit finding) is GONE, replaced by the real
  `measureFarcrysisSightlines` metric + `report.violations == []`. Tightened.
  A guard test (`farcrysis-layout.test.ts:249-253`) fails the suite if the
  `>= 0` text ever returns.
- `src/farcrysis-terrain-authority.test.ts:279`: one ADDED exact exemption,
  `/^farcrysis-throwback-seaplane-wing-collider$/`, for the new physical wreck
  deck whose proxy is derived from the visual parent/child transform
  (`src/farcrysis.ts:884-894`). Named, single-family, justified in-comment;
  a new floating collider anywhere else still fails. Not a loosening.
- `src/farcrysis-webgpu-pipeline-budget.test.ts:123-127`: same bounds (≤16
  graphs, ratio < keys/4), now read via `FARCRYSIS_PIPELINE_BUDGET`. No
  numeric change.
- `src/farcrysis-square-shore.test.ts` (+33 lines): ADDS boulder
  `instanceColor` sharing assertions (1 material, 1 geometry). Tightened.
- Material ratchet: `MATERIAL_CEILING = 166`
  (`src/farcrysis-material-vocabulary.test.ts:43`), target 110 stays a
  documented objective, not an assertion; `CEILING_HISTORY` re-measures at the
  new base and documents the 17-object WebGPU/WebGL2 environment gap. One-way
  (removal never fails).

## Findings (file:line, why, smallest fix)

- FINDING-1 — sightline band still far over target (spec posture, not a
  blocker): `src/farcrysis-layout.test.ts:60-64` ratchets max 94.0 /
  under-fraction 0.60 / 20 open pairs vs targets 22 m / 1.0 / 0. Why: island
  authentically has 94 m sightlines; L2 proved the middle was not the cause.
  Fix: none in layout — dressing must add real occlusion (jungle-band density
  per SPEC.md §8 D3, inside `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS = 16`) and ratchet
  DOWNWARD only. Never move 22 m.
- FINDING-2 — two authored routes stop at palm trunks (dressing must re-seat):
  `route-probe.json` rows `core-loop#6` (collider-35) and `lane-e#1`
  (collider-37); palm placements via `src/farcrysis.ts:1000-1012`. Why: a route
  that ends at a trunk is a blocked route even when the trunk is legitimate
  cover. Fix: in dressing, move those two palm instances off the 4.5 m
  core-loop corridor and the lane-e axis (keep colliders on the trunks —
  deleting them would open walk-through parity defects); re-run
  `probe-farcrysis-routes-stock.mjs` to 32/32 walked-or-honest-cover.
- FINDING-3 — stale door-range words in the L4 comment (docs only):
  `src/farcrysis.ts:786-788` says "north door x 0..4, south door x −4..0" but
  walls at `:701-706` leave both gaps at x −2..2. Why: a future reader will
  mis-derive symmetry from the comment. Fix: one-line comment edit to "north
  gap x −2..2, south gap x −2..2; 180°-symmetric under (x,z)→(−x,−z)".
- FINDING-4 — non-issue, recorded to stop a re-raise: `src/farcrysis-detail.ts`
  rock tint rides baked geometry `color` attributes while art boulders ride
  `instanceColor` (`src/farcrysis-art.ts:667-675`). Why different is fine:
  detail rocks are 8–12 unique non-instanced `Mesh`es (no instance path
  exists); Luna's `instanceColor` ruling covered the three SHARED
  `InstancedMesh` boulder sets only. No fix.

## DRESSING-STAGE NOTES (must respect)

1. Keep 22 m: `FARCRYSIS_MAX_SIGHTLINE` is a ceiling to beat, never to move;
   ratchets in `farcrysis-layout.test.ts:60-64` move down only.
2. Re-seat palms 35/37 off the core loop and lane-e (FINDING-2); keep every
   trunk collider — walk-through palms are parity defects.
3. Card stays parked: `selectable: false`, `multiplayer: false` until the
   owner's HITL word (HF-455); unhide is one last commit (SPEC.md §8 D11).
4. Material vocabulary stays collapsed LAST in the build
   (`src/farcrysis.ts:1199-1208`); new dressing materials must be new draw
   states, ceiling 166 holds, target 110 open; per-instance tint via
   `instanceColor`, not cloned-geometry vertex colours.
5. Penetration classes as they land (HF-467): glass breaks/passes, thin metal
   perforates, concrete stops — window precedent at `src/farcrysis.ts:748-756`.
6. No game frame grabs anywhere (SPEC.md §2 originality boundary); reference
   sets D0 are real-world photography, T2/T3 with fetch receipts.
7. One browser at a time, stock flags, ports 4280–4289 for the lane; frame
   (G6 ≤ 1.25) and admission (G7 beat 1.297, ceiling 1.60) fixes compile LESS,
   never widen a fence.
8. G16: `diff-arena-viewpoints` vs the L0 baseline — no `REGION_CHANGED` on
   any other arena.
