# Muse review — v9-farcrysis dressing stage (PASS 95)

Branch `contrib/dave-gaming-pc/claude/v9-farcrysis-dressing` @ `67ac705d`,
diffed vs `origin/contrib/dave-gaming-pc/claude/v9-farcrysis` (layout head
`7197e427`; the base's own tip is `e883f2d3`, the layout Muse review).
Read `AGENTS.md`, `docs/evidence/pass95/farcrysis-rebuild/SPEC.md`,
`docs/evidence/pass95/farcrysis-dressing/REPORT.md`,
`docs/evidence/pass95/farcrysis-dressing/runtime.json`,
`docs/evidence/pass95/farcrysis-dressing/layout-after-dressing.json`, and the
layout review `docs/evidence/pass94/muse-review/v9-farcrysis-layout-REVIEW.md`
(incl. its DRESSING-STAGE NOTES). No builds, no browsers, no GPU, no
`npm install`. `git status` was clean; `git fetch origin` run at review start.
Numbers below are read from receipts in the repo, not re-measured here.

## Verdict: SHIP-WITH-FIXES

Dressing may enter candidate 9 only after FINDING-1 (close the regressed
spawn pair, re-run to `<= 20`) and FINDING-2 (re-run the route probe after
the palm re-seat) land. Three reasons:

1. The branch regressed the one red gate it was told to respect: open spawn
   pairs went 20/64 (at ceiling) → 21/64 (over ceiling) against the unchanged
   `OPEN_SPAWN_PAIRS_CEILING = 20` (`src/farcrysis-layout.test.ts:64,239`).
   The added pair is named (`spawn-t0-2` → `spawn-t1-1`, 58.86 m) and the fix
   is one occluder re-seat, not a bound move — but it has to land first.
2. The two palm re-seats that answer the layout review's FINDING-2 have no
   verification: no `route-probe.json` was re-run in this evidence directory,
   so "32/32 walked-or-honest-cover" is unconfirmed after the corridor seats
   changed.
3. Everything else is honest and compatible: the 22 m bound is untouched and
   pinned, the originality boundary is tightened (image-texture loader
   deleted), the card stays parked, no test or ratchet was loosened, budgets
   hold with tripwire 0, and disposal is exercised. Nothing here is
   architecturally wrong; the branch is one measured re-seat plus two
   receipts away.

## Check 1 — originality boundary: PASS (tightened)

- `src/farcrysis-textures.ts`: the entire async image-texture upgrade path is
  deleted (~150 lines: `REGISTRY`, `loadImageSet`, `loadAllImageTextures`,
  `TEXTURE_PATH = './assets/original/textures/farcrysis'`, the
  `TextureLoader` calls and `upgradeRegistered`). `applyFarcrysisTextures`
  now applies synchronous seeded procedural augmentation only. The header
  comment states the contract explicitly (no downloaded/copied game imagery,
  deterministic admission).
- `git diff -- src/` greps clean for `TextureLoader`, `http://`,
  `https://`, `assets/original`, `.png`/`.jpg`, `fetch(` — empty.
- `src/farcrysis-dressing.ts` builds all geometry in-module (lobed canopy
  from in-memory icosahedra, 5-leaf whorls, box/cylinder signs) with a seeded
  PRNG, terrain-authority seating, and materials resolved via
  `findExistingMaterial` (`src/farcrysis-dressing.ts:212`) so no shader
  vocabulary is added.
- No new runtime assets: the `--name-only` diff under `public/`/`assets/` is
  empty. The new PNGs are all under `docs/evidence/pass95/farcrysis-dressing/`
  (captures + blind-A/B material) — evidence, not shipped assets.
- References: REPORT.md:27-29 honestly marks the D0 real-photo set absent and
  labels the blind review T2 directional against four existing layout
  captures (`blind-ab/results.json`: `VERIFIED-UNDERPOWERED`,
  `separates: false`). No game frame grabs anywhere in the diff.

## Check 2 — sightline 22 m + the red test: BOUND HELD, TEST HONESTLY OPEN (regressed 20 → 21)

- `FARCRYSIS_MAX_SIGHTLINE = 22` unchanged (`src/farcrysis-constants.ts:25`),
  pinned by `expect(FARCRYSIS_MAX_SIGHTLINE).toBe(22)`
  (`src/farcrysis-layout.test.ts:132`). Ratchets unmoved (`:60-64`:
  max 94.0 / floor 0.60 / pairs 20; budget-test and layout-test diffs empty).
- `layout-after-dressing.json` sightlines vs the layout-final baseline
  (`docs/evidence/pass95/farcrysis-rebuild/layout-after-layout-final.json`):
  max 93.99 m both, p50 17.03 / p90 45.30 both, over-ceiling 391/1008 →
  **392/1008**, spawn pairs 20/64 → **21/64**. Set difference of open pairs:
  ADDED exactly one, REMOVED none —
  - `spawn-t0-2 [-26,-8]` → `spawn-t1-1 [32,2]`, 58.8558 m, `blocked: false`.
- REPORT.md:102-105 reports this honestly as `[OPEN]` ("does not claim to
  close that layout-lane issue") and :138 keeps the red assertion
  (`spawnPairsOpen <= 20` receiving 21) as the one open gate. No threshold
  was moved to absorb it.
- Smallest re-seat (FINDING-1): the new palm seats
  (`src/farcrysis-palms-enhanced.ts:104-107`: 35 → `[-16,-28]`,
  37 → `[29,13]`) sit ~21.4 m / ~11.3 m off the `t0-2→t1-1` segment, so they
  do not occlude it; the pre-move trunks likely did. Move ONE solid
  jungle-band occluder (an existing palm trunk with its named collider, never
  a dressing mesh — dressing adds no shot authority) to intersect that
  corridor while respecting the 2.2 m route buffer and 4.2 m spawn buffer
  (`src/farcrysis-dressing.ts` keep-outs are the right pattern to copy), then
  re-run the layout receipt to 20/64. Never move the 22 m bound.

## Check 3 — pipeline budget, tripwire 0, disposal, draw calls, triangles: PASS

Quoting `runtime.json` (stock WebGPU, port 4268, 0 page / 0 console errors):

- Tripwire: `combat.pipelinesDuringSample: 0` (229 → 229) and
  `combat.gapsOver1000ms: 0` (`runtime.json:134-147`). In-combat sample
  60 s / 2,952 frames, p95 27.9 / p99 44.5 / worst 99.8 ms — measurement,
  no threshold change.
- Draw calls / triangles vs `FARCRYSIS_PIPELINE_BUDGET`
  (`maximumDrawCalls: 460`, `maximumTriangles: 1_100_000`, unchanged —
  `src/farcrysis-layout.ts` diff empty): presentation counters `calls: 237`
  / `triangles: 790701` before combat, `calls: 260` / `triangles: 777152`
  after. Peak 260/460 and 790,701/1,100,000 — inside both ceilings.
  Foliage graphs 16 at the asserted ceiling, no new graph class.
- Disposal on exit: `retirementAfter` = 1 root / 992 geometries /
  166 materials / 1 shadow map (`runtime.json:300-307`), `finalArena:
  "rustworks-1v1"`, Farcrysis absent from resident ids. The dressing group is
  a child of the arena root so the shared retirement path carries it; no new
  disposal code was needed. (Commit `a7ed8c5b` only fixed the *measurement*
  script to `returnToMainMenu()` before switching — honest harness fix, not
  runtime behaviour.)
- Materials: arena census 149 total / 130 standard
  (`layout-after-dressing.json` census) below the 166 ceiling; the Muse 110
  target stays documented-objective, still OPEN and stated as such. (The
  runtime `distinctMaterials: 212` is scene-wide, not the arena census —
  REPORT.md:86-90 keeps the two separate. Correct.)
- Nit (FINDING-4): module-global `activeState`
  (`src/farcrysis-dressing.ts:48,341`) is never cleared on retire; LOD calls
  between retire and rebuild would flip flags on detached nodes. Harmless
  (rebuild overwrites it; `existing`-guard is per-new-root), but a
  one-line reset on retire would remove the trap.

## Check 4 — wind/LOD hooks, daylight grading, lighting compat: PASS (one naming nit)

- LOD: `setFarcrysisDressingLOD` (`src/farcrysis-dressing.ts:346-349`,
  canopy < 220 m, understory < 105 m) is wired into the arena art loop
  (`src/farcrysis-art.ts:1264`) beside the existing `setVegetationLOD`;
  `animateVegetationWind` (`:1255`) and `animateGrassField` (`:1267`) are
  untouched. Dressing adds no wind uniforms ("wind stays GPU-side") and tints
  via `instanceColor` (`src/farcrysis-dressing.ts:207-215`), the admitted
  pattern — no cloned-geometry vertex colours, no new materials unless
  fallback (fallbacks reuse first, `:300-310`).
- Daylight: same five lights, retinted only (`src/farcrysis-art.ts:750-798`:
  ambient/hemi/sun/bounce/fill; sun `0xfff1d8` @ 2.25, no second sun, no new
  shadow caster). All standard materials → clustered-lighting/SH-L2 safe; no
  custom GLSL introduced. Palette constants regraded to the 07:40 post-rain
  brief (`FARCRYSIS_ART_FEEL`, `:95-116`).
- Nit (FINDING-5): the backdrop preset is still named `'jungle-golden-hour'`
  (`src/farcrysis-art.ts:739`, pre-existing, values regraded around it).
  Name now lies about the grade; rename or annotate when the preset is next
  touched. Not a blocker — no behaviour rides the name.

## Check 5 — card parked, tests, ratchet: PASS

- `src/map-selection.ts` diff empty. Flags read in-tree: `selectable: false`
  (`:331`), `prototype: true` (`:333`), `multiplayer: false` (`:347`).
  Runtime receipt corroborates: arena card `{"exists": false}` before combat
  (menu never offered it).
- Only test file touched: `src/walkable-surface-parity-gate.test.ts` — the
  farcrysis ledger SHRINKS (stale seaplane-wing row retired, `:98-105`).
  That is required, not loosening: the stale-ledger gate (`:181-192`) fails
  any row whose geometry is gone, and the audit now supports all 26 censused
  visuals. No threshold or finding class changed. Collider-visual parity and
  walkable parity both pass per REPORT (2 files, 16 tests).
- Ratchets: layout-test, pipeline-budget-test, legacy-size-ratchet,
  pipeline-metrics, graphics-profile-contract diffs all empty. The one red
  assertion (`spawnPairsOpen <= 20`) is left red and reported OPEN.

## DRESSING-STAGE NOTES compliance (layout review §DRESSING-STAGE NOTES)

1. 22 m kept — yes, pinned, never moved.
2. Palms 35/37 re-seated off core-loop/lane-e with colliders retained
   (`src/farcrysis-palms-enhanced.ts:98-107,303-311`; collider builder reads
   the same placement function) — but route probe NOT re-run (FINDING-2).
3. Card parked — yes, all three flags.
4. Materials: dressing reuses family materials first; census 149 < 166;
   per-instance tint via `instanceColor` — yes.
5. Penetration classes — untouched, no new glass/metal/concrete semantics.
6. No game grabs — yes, boundary tightened.
7. One-browser/stock-flags discipline — per REPORT manifests (port 4268,
   `--mute-audio`, shared heavy lock); no fence widened.
8. G16 other-arena `REGION_CHANGED` — not evidenced in this diff's file list
   (no other-arena runtime files touched); confirm at candidate assembly.

## Findings (file:line, why, smallest fix)

- FINDING-1 — regressed open pair `spawn-t0-2 → spawn-t1-1` (21 > 20):
  `docs/evidence/pass95/farcrysis-dressing/layout-after-dressing.json`
  sightlines (`spawnPairsOpen: 21`, added pair at 58.86 m) vs
  `src/farcrysis-layout.test.ts:64,239` (ceiling 20, assertion red). Why: the
  palm re-seats (`src/farcrysis-palms-enhanced.ts:104-107`) moved trunk
  occlusion off that corridor (new seats ~11–21 m from the segment) while
  dressing meshes add no shot authority. Fix: re-seat ONE solid trunk to
  intersect the `[-26,-8]→[32,2]` corridor respecting route (2.2 m) and spawn
  (4.2 m) keep-outs; re-run layout receipt to `spawnPairsOpen <= 20`. Never
  move `FARCRYSIS_MAX_SIGHTLINE`.
- FINDING-2 — route-probe fix unverified: no `route-probe*.json` under
  `docs/evidence/pass95/farcrysis-dressing/` (only `layout-after-dressing.json`
  + `runtime.json`). Why: layout FINDING-2 required re-running
  `probe-farcrysis-routes-stock.mjs` to 32/32 walked-or-honest-cover after
  moving colliders 35/37. Fix: run it, commit the receipt.
- FINDING-3 — coplanar receipt claimed but not filed: REPORT.md:106-109 cites
  `find-coplanar-pairs.ts` exit 0 with 0 actionable, but no receipt file is
  stored beside the layout/coverage evidence. Why: a future auditor cannot
  diff the claim. Fix: store the probe output (as was done for layout and
  runtime) in a follow-up.
- FINDING-4 — `activeState` never cleared on retire (nit):
  `src/farcrysis-dressing.ts:48,341-349`. Why: post-retire LOD calls touch
  detached nodes until the next build overwrites the pointer. Fix: reset
  `activeState = null` in the arena teardown path (one line, shared owner).
- FINDING-5 — stale `'jungle-golden-hour'` preset name (docs/naming nit):
  `src/farcrysis-art.ts:739`. Why: values are now 07:40 post-rain daylight;
  the name will mislead the next grader. Fix: rename to
  `'jungle-morning-clear'` or annotate at the next touch. No behaviour change.

## UNFINISHED

- Close the added `spawn-t0-2 → spawn-t1-1` open pair and re-run the layout
  receipt to `spawnPairsOpen <= 20` (FINDING-1). Candidate 9 entry is blocked
  on this.
- Re-run `probe-farcrysis-routes-stock.mjs` after the palm re-seat and file
  the receipt; confirm 32/32 walked-or-honest-cover (FINDING-2).
- File the `find-coplanar-pairs.ts` output as a receipt (FINDING-3).
- Sightline band as a whole still OPEN (93.99 m max, 392/1008 over 22 m):
  needs real occlusion work in a later pass, ratchets down-only, bound never
  moves. Pre-existing, not introduced here.
- Material vocabulary 149 vs Muse target 110 still OPEN (ceiling 166 holds).
  Pre-existing.
- Blind A/B `VERIFIED-UNDERPOWERED`, `separates: false` (3/4 decisive for B,
  2 ties, mean confidence 0.8167): directional only, not a visual-quality win.
  Photoreal/deep-shade acceptance remains OPEN per REPORT.
- `pipeline:preflight` branch-policy row OPEN (expects `codex/…`, required
  branch is `claude/…`; correctly not renamed). Process note, not a defect.
