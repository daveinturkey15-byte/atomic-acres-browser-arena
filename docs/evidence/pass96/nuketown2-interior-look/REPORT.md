# PASS 96 — nuketown2 interior lighting look (REPORT)

Branch `contrib/dave-gaming-pc/claude/nuketown2-interior-look` from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` (465ae6b7).
Method: skill `threejs-webgpu-interior-lighting-look` (SKILL.md §§1–8, fences,
budgets), re-implemented in our likeness — no vendored source (HF-472).
Upstream first (HF-481): three r185 pinned `0.185.1` (verified
`node -e "console.log(require('./node_modules/three/package.json').version)"`
→ `0.185.1`); `docs/threejs-knowledge/upstream/llms-full.txt` is absent on
this base; the r185 recipe tree is absent on this base and was read via
`git show origin/contrib/dave-gaming-pc/claude/r185-techniques:...`
(INDEX + `webgpu_lights_clustered.md`). r185 verdict applied: clustered
lighting is the lane that owns real lights — this lane adds none.

## Change set (explicit paths)

- `src/nuketown2-interior-look.ts` (new): value plan per room, 6 lamp solids
  per house (2 table lamps: base+stem+shade on counter/bench tops), 4 skirting
  junction decals per house (wall-grime family). Zero materials created.
- `src/nuketown2-interior-look.test.ts` (new): 6 tests.
- `src/nuketown2-interior-materials.ts`: fixture emissive driven by the one
  shared `NUKETOWN2_INTERIOR_FIXTURE_INTENSITY` uniform (warm + cold).
- `src/nuketown2-layout.ts`: `NUKETOWN2_WALL_T` / `NUKETOWN2_HOUSE_WIDTH`
  single-sourced (arena adopts via aliased imports, net 0 behaviour change).
- `src/nuketown2-arena.ts`: emit lamp solids in `house()` via `pair()`,
  presentation-only. `src/legacy-main.ts` untouched (37,231 ≤ 37,396 ceiling).
- `src/nuketown2-grime-decals.ts`: append junction decals in the existing
  table (wall-grime family, same material, -3 tier).

## Claims

- VERIFIED — one ceiling fixture per room per house (8 lenses via pair):
  `src/nuketown2-interior-look.test.ts` 6/6 green (see gate quotes).
- VERIFIED — lamps only in ground rooms (4 shades, 0 upstairs); every fixture
  emissive reads the shared uniform; exactly ≤2 fixture material instances;
  uniform value 1.
- VERIFIED — lane creates no material (rows reuse caller materials), no
  dynamic light in the built scene, all bodies presentation-only / batch-merged
  / shadowless, junction tops (0.26) clear of slab (0.08) and baseboards
  (0.14) by >0.03 and below the 3.17 wall-grime ceiling.
- VERIFIED — coplanar `HOUSE-INTERIOR 0 / STREET 0 / FINDINGS 0`
  (boxes 819 → 839, +20 exactly: 12 lamp + 8 junction halves).
- VERIFIED — no gate weakened: `tsc`, fidelity 33/33, grime + pipeline-budget,
  graphics-profile, pipeline-metrics, legacy-main ratchet, collider parity,
  8 neighbouring contracts (90 tests) all green, unmodified.
- VERIFIED — `src/cold-session-precompile-reach*.test.ts` matches NO file on
  this base (`No test files found, exiting with code 1`). Closest real
  coverage — the pipeline-budget distinct-graph fence (cold-compile admission)
  — passes unchanged: zero new materials, zero new graphs.
- DESIGNED (needs capture) — per-frame cost estimate: +0 draw calls (new boxes
  merge into the pre-existing trim/warmLight/wallGrime presentation batches),
  +≈240 triangles, 0 per-frame CPU (static geometry, static uniform, no
  lights, no new pipelines). No capture-harness `hud.json` delta on this
  machine (headless-only rule; owner runs ComfyUI; numbers would be void).
  Frame-time claim stays DESIGNED until a quiet-machine capture compares.
- DESIGNED (needs capture) — combat readability: entry sightlines untouched
  (no geometry above 1.6 m added in any doorway/lane; tallest new top 1.595 m
  on top of existing solid furniture), enemy silhouette separation
  unmeasurable headless — needs the lit-capture diff, recorded as follow-up.
- OPEN — upper-floor junction grime deliberately cut: a vertical upper strip
  would break the wall-grime top rule the grime gate pins; corners upstairs
  read dark by the lens-only value plan instead. No gate touched to hide this.
- OPEN — halo/light-pool cards (skill §TSL halo) deliberately cut: a radial
  falloff card is a new material graph against the 54-graph ceiling; the
  existing bloom chain over above-threshold emissive carries the halo.

No settings-registry entry: there is no new visual stage (static geometry +
one static uniform), so there is nothing to switch off. No new pipeline, so
the cold-session precompile reach is unchanged by construction.

## Luna review TODOs

- TODO: obtain the required native-WebGPU interior capture in both supported
  graphics profiles, including entry sightlines and the dark corners; this
  review was intentionally no-browser/no-GPU.
- TODO: add or identify the canonical cold-session precompile reach receipt
  for this lane. The named glob has no matching test on this base and exits 1;
  no new pipeline was added, so this remains an evidence gap rather than a
  relaxed gate.
- TODO: obtain the quiet-machine frame-time/draw receipt for the claimed zero
  incremental draw-call and approximately 240-triangle cost.

## Gate quotes (verbatim, trimmed to the verdict lines)

`npx tsc --noEmit` → `(no output)` exit 0.

`npx vitest run src/nuketown2-interior-look.test.ts` →
`Test Files  1 passed (1)` / `Tests  6 passed (6)`.

`npx tsx scripts/qa/find-coplanar-pairs.ts` →
`# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0` /
`# STREET pairs<=0.03m (offsets ignored): 0` /
`# boxes=839 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL (benign): 26`.

`npx vitest run src/graphics-profile-contract.test.ts "src/cold-session-precompile-reach*.test.ts" src/pipeline-metrics.test.ts src/legacy-main-size-ratchet.test.ts src/collider-visual-parity-gate.test.ts` →
`Test Files  4 passed (4)` / `Tests  26 passed (26)`
(the cold-session pattern matched nothing; quoted separately below).

`npx vitest run "src/cold-session-precompile-reach*.test.ts"` →
`No test files found, exiting with code 1` /
`filter: src/cold-session-precompile-reach*.test.ts`.

`npx vitest run src/nuketown2-fidelity.test.ts` →
`Test Files  1 passed (1)` / `Tests  33 passed (33)`.

`npx vitest run src/nuketown2-interior-look.test.ts src/nuketown2-grime-decals.test.ts src/nuketown2-pipeline-budget.test.ts` →
`Test Files  3 passed (3)` / `Tests  19 passed (19)`
(after fixing one arithmetic slip in the NEW test: 2 lamps × 2 houses = 4
bases, not 2; no shipped assertion touched).

Neighbouring contracts (yard-props, vegetation, pool-water, glass-authority,
review-camera, minimap-semantic-layer, ballistics, map-selection) →
`Test Files  8 passed (8)` / `Tests  90 passed (90)`.

Bootstrap: OMP on dave-gaming-pc —
`PASS: OMP on dave-gaming-pc trust=trusted`; power plan
`Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (High performance)`.
