# Muse review: nuke-liveries-flagstones (pass95) — candidate-9 gate

Reviewer: Muse Spark 1.3 (skeptical pair of eyes). Date: 2026-09-05.
Branch: `contrib/dave-gaming-pc/muse/nuke-liveries-flagstones` @ `5f2986fe`.
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba`.
Report read: `docs/evidence/pass95/nuke-liveries-flagstones/REPORT.md`.
Diff read: full `git diff base...HEAD` for `src/nuketown2-arena.ts`,
`src/nuketown2-grime-decals.ts`, `src/nuketown2-pipeline-budget.test.ts`
(report `.md` excluded from code verdict).
Method: structural read only. No builds, no browsers, no GPU, no
`npm install/ci/rebuild`, no test runs in this lane — all `[VERIFIED]`
below means "holds by construction of the diff", not "I re-ran the suite".

## Check 1 — two-tone livery mask: no new pipeline, existing paint family

Holds, with one test-coverage gap (F1).

- `src/vehicle-forge/materials.ts:126` — `createForgePaintMaterial` carries
  pigment in `TSL.uniform(...)`, never a baked constant. Graph shape is
  colour-blind by construction; the `measures constants and uniforms
  differently` test pins exactly that distinction.
- `src/nuketown2-arena.ts:2602,2613` — truck (`0xf2ede2`/`0x2b3138`) and
  coupe (`0x9e1c1c`/`0x9e1c1c`) go through the same
  `createForgeMaterialSet` + shared colourless buckets as the coach. No new
  material family, no new `Mesh*NodeMaterial` subclass.
- `src/nuketown2-arena.ts:2655` — truck two-tone is a `surfaceBands` entry in
  the `accent` bucket + a `chrome` divider stripe. `surfaceBandAtHeights`
  (`src/vehicle-forge/geometry.ts:940`) emits only `classifyQuad(...) ===
  'body'` quads, so glass is skipped by construction — the report's
  "glass quads skipped" claim checks out. Proud offsets (0.01 band, 0.014
  stripe) are separating geometry, not coplanar films.
- `src/nuketown2-pipeline-budget.test.ts:149-155` — extended
  `keeps forge paint colours in one uniform-carried graph` test pins
  truck.paint, truck.accent and coupe.paint to the coach graph key plus their
  sRGB uniform values. This is the real pipeline proof (see F2 for the
  filename correction). It fails the moment a livery bakes colour into the
  graph as a constant — except for coupe.accent, which is unpinned (F1).
- Coupe dressing (`src/nuketown2-arena.ts:2701-2708`): same `SEDAN_SPEC`
  envelope, `sedanDressing` retained for the street saloon/classic
  (`src/nuketown2-arena.ts:2714`), `carMaterials` still consumed there — no
  dead code, no spec change, collider parity untouched.

## Check 2 — flagstone path: decal offset, no coplanar pair, mirrored yards

Holds.

- Placement untouched: `ground('yard stepping stones', 'stones', -1.0, -29.0,
  9.0, 4.4, ...)` with `position.y = GRIME_Y + 0.004`
  (`src/nuketown2-grime-decals.ts:373,119,87`). `GRIME_Y = 0.02 + 0.003 -
  0.003 = 0.02`, so slab centre `0.024`, thickness `0.006`, top `0.027`,
  gap over `GROUND_PLATE_TOP_Y (0.02)` = `0.007` — positive and inside the
  deliberate 0.03 m SEEN-and-FENCED window (`-3` tier). Same values as
  before the lane (plate, lift, family lift, tier all unchanged); only
  `colorNode`/`opacityNode` were rewritten. Coplanar outcome identical by
  construction — the instrument sees the same boxes.
- Mirror math verified: `s = -z/|z|`, `qx = s·x + 1`, `qz = s·z + 29`
  (`src/nuketown2-grime-decals.ts:271-273`). Under `pair()`'s `(x,z) →
  (-x,-z)`, a north point and its south partner map to identical `(qx,qz)`
  (checked algebraically: `qx_s = -(-x)+1 = x+1`; `qz_s = -z'+29 = d =
  qz_n`). The S-curve, jitter, superellipse axes/exponent are all functions
  of the folded frame + per-index hash, so both yards render the same path —
  never a mirrored pair of different paths. `az = |p.z|` division is NaN
  only at `z = 0`, far outside the `|z| ≈ 29` plate — no action.
- Count: `u = (qx+4.3)/0.86`, gate `[0,10]` (`src/nuketown2-grime-decals.ts:
  291`), 10 indices on a 9 m plate whose `qx` span covers `u ∈
  [-0.23,10.23]`; all 10 centres land in-plate. Report's `∈ [8,14]` is loose
  prose for an exact-10 construction — harmless.

## Check 3 — verge furniture/aggregate counts within 36/51

Holds by construction, numbers as quoted.

- Diff touches no verge code, no `pair()` call, no ground-dressing tile.
  Furniture/aggregate membership can only change via `nuketown2-arena.ts`
  verge stemming — absent from the diff. Report's 30/36 and 45/51
  (same counter, full-arena build, before AND after) is consistent with the
  `≤36 / ≤51` ceilings in `src/nuketown2-fidelity.test.ts:2824-2827`.
- I did not re-run the counter in this lane (no-build constraint); the
  integrator's re-run is listed under UNFINISHED.

## Check 4 — vehicle review stations still valid

Holds.

- All five stations exist and are untouched by the diff:
  `nuketown2-vehicle-near/mid/far`, `nuketown2-coach-elevation`,
  `nuketown2-truck-cab-near` (`src/rendering/arenas/nuketown2.ts:
  237-251`). Diff changes dressings/materials only, moves no placement,
  renames nothing the cameras target.
- Driveway pair remains an exact 180° partner:
  `(carX, carZ+L/2, yaw π)` / `(-carX, -(carZ+L/2), yaw 0)`
  (`src/nuketown2-arena.ts:2724-2732`) — same involution `pair()` applies
  to the collider boxes.

## Check 5 — any test loosened

None. The only test delta is `src/nuketown2-pipeline-budget.test.ts`,
which strictly tightens: 3 new graph-key assertions + 3 new materials in
the uniform loops, 0 thresholds/ceilings/tolerances touched
(`NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS`, 54-pipeline ceiling, verge
ceilings, coplanar rules all unmodified in-diff). Changed-file set is
exactly 3 source/test files + the evidence report.

## Findings

- F1 (test gap, minor): `src/nuketown2-pipeline-budget.test.ts:156,160` —
  `coupe.accent` is created (`:150`) but asserted nowhere, while the report
  claims the test "fails the moment a livery bakes its colour back into the
  graph as a constant". For the coupe accent that guard does not exist.
  Smallest fix: add `coupe.accent` to both loops —
  `[..., truck.paint, truck.accent, coupe.paint, coupe.accent]` and
  `[..., [coupe.paint, 0x9e1c1c], [coupe.accent, 0x9e1c1c]]`.
- F2 (report prose, non-blocking): `REPORT.md:78-79` — "Clustered budget
  still 1 pipeline inside the 54 ceiling (test-quoted)" cites the
  "pipeline-metrics test". `src/pipeline-metrics.test.ts` is workflow timing
  metrics, not GPU pipelines; the real proof is
  `src/nuketown2-pipeline-budget.test.ts` ("reserves one fixed clustered
  update pipeline inside the 54-pipeline ceiling") + the forge graph-shape
  test. Smallest fix: correct the filename in the report.
- F3 (report prose, non-blocking): `REPORT.md:50-51` — "plate top = turf +
  3 mm + stones lift (0.027 m)". `0.027` is the slab TOP
  (`0.02 + 0.003 + 0.004`), not the lift; the lift over plate is `0.007`.
  Geometry is correct, prose garbles top vs lift. Smallest fix: "slab top
  0.027 m (plate 0.02 + 3 mm grime lift + 4 mm stones family lift)".

## Verdict: SHIP-WITH-FIXES

1. No new pipeline permutation: truck/coupe paints ride the existing
   uniform-carried forge graph (materials.ts:126 + extended graph-key test);
   the only hole is the unpinned coupe.accent (F1, one-line fix).
2. Flagstones are structurally sound: folded-frame path identical on both
   yards under `pair()`'s rotation, slab top 0.027 inside the fenced 0.03 m
   window, plate/lift/tier untouched so coplanar split and verge ceilings
   cannot have moved.
3. No contract was loosened and no authority moved: sole test delta
   tightens, `SEDAN_SPEC`/colliders/shot surfaces/review stations/names all
   intact; remaining risk is purely the on-screen read, which was already
   recorded as OPEN with exact falsifier captures.

## UNFINISHED (for the integrator, not this branch)

- U1: On-screen livery read (cream/maroon split height, red coupe tone) —
  needs WebGPU captures at `nuketown2-vehicle-near/mid/far`,
  `nuketown2-coach-elevation`, `nuketown2-truck-cab-near`. No GPU in this
  lane or the feature lane.
- U2: On-screen path read (meander amplitude, stone gaps, tone) — needs
  captures at `nuketown2-north-yard`, `nuketown2-south-yard`,
  `nuketown2-overhead`. No GPU in either lane.
- U3: Fresh suite + `find-coplanar-pairs.ts` + `tsc --noEmit` re-run from
  the candidate checkout. Quoted in the report from the feature lane; not
  re-run here per the no-build lane constraint. Apply F1 first, then quote.
