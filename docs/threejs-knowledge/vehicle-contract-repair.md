# Vehicle contract repair - merged forge meshes are several vehicles (2026-09-12)

Three.js 0.185.1 (installed; checked against `BufferGeometry` docs, groups partition an
index buffer once and the forge is non-indexed, so per-vehicle identity has to travel as a
vertex attribute). Skill method applied: `threejs-game-development` "start with live truth"
(observations / inferences / falsifiers kept apart) and `atomic-acres-procedural-art-authoring`
reusable mode (generator + adapter + focused regression + second use + recipe).

## Symptom

- `collider-visual-parity-gate` reports `vehicle-forge merged paint @ [-5.8,1.05,1.3]
  size [6,1.62,5.7]` as a new walk-through / unrated shot surface on nuketown2.
- `nuketown2-fidelity` R24 reports a non-wheel tyre cluster reaching y 0.650 at (1.86,-3.81).

## Cause

- `mergeForgedPlacements` folds every vehicle sharing a material into one mesh (HF-491,
  one draw per material). The two street saloons share `nuketown2-forge-saloon`, sit at
  world (-8.8, 3.2) and (-7.2, -0.6), and the merged mesh's AABB covers the road between
  them. Per-vehicle identity survives only as the `forgeVehicleAnchor` attribute.
- The tyre finding is 29 rim vertices of the coach's own 0.94 m wheel (r 0.47 since
  68949e9cd) split off by the gate's 0.5 m greedy plan clustering, which assumes wheels
  are at most 0.84 m across. The wheel is attached; `partBounds` proves it pre-merge.

## Correction (owned, code-only)

- `mergedVehicleBounds(geometry)` in `src/vehicle-forge/build.ts` returns one `Box3` per
  anchor from a merged mesh. Any audit that reads merged forge meshes must partition by it
  before comparing against colliders; the whole-mesh AABB is not a vehicle.
- `src/vehicle-forge/completion-vehicle-census.test.ts` pins the behaviour instead of a
  count: every anchor box of every merged mesh fits its family's dressed envelope plus
  0.45 m trim (coach mirror heads measure 2.96 m across), and every tyre-bucket part above
  the 0.45 plate line shares a plan centre with a grounded carcass of the same build. The HF-536 bogie bug (wheels 7.9 m ahead of
  the nose) fails the first check; a detached disc fails the second.

## Audit integration (completion, 2026-09-12)

- `partitionMergedVehicles(geometry, matrixWorld?)` in `src/vehicle-forge/build.ts` is the
  reusable reader: one `{ key, anchor, box, vertices }` per stamped anchor, vertices applied
  through `matrixWorld` per point (a yawed placement is measured tight, not as a transformed
  local AABB). Component vertex counts always sum to the position count. It returns
  `unanchored` (no attribute) or `malformed` (itemSize != 2, count mismatch, non-finite value)
  instead of guessing; `mergedVehicleBounds` is now a thin map over it.
- `collectMeshCensus` in `scripts/qa/collider-visual-parity-core.ts` pushes ONE `MeshEntry` per
  component for a partitioned mesh, with `component: { anchor, index, of }` carried onto any
  finding row. Unanchored and malformed meshes are measured whole exactly as before (fail
  closed: the stricter whole-mesh check still runs) and malformed ones are counted in
  `meshComponents.malformedAnchorMeshes`. `visibleMeshes` still counts mesh objects, so other
  arenas' numbers are unchanged; instanced meshes are never partitioned (shared geometry).
- No threshold, rule, ledger or arena roster moved. The method is generic: any batched mesh
  that stamps `forgeVehicleAnchor` per vertex is measured per source object.

Measured on nuketown2 after the change: 15 merged meshes, 54 components, 162,594 vertices,
0 malformed; zero forge walk-through rows; Direction A still zero. The saloon paint mesh is
two components at anchors (-8.8, 3.2) and (-7.2, -0.6), each within 4.4 x 1.9 in plan, with a
positive gap between them and each >= 25% covered by its own collider.

Newly visible and NOT fixed here: four per-vehicle `vehicle-forge merged chrome` rows (both
street saloons and both driveway coupes) are ballistic ghosts with surface share 0. The sedan
chrome spans 0.03..1.79 m while its shot authority is a `vehicle` body box 0.22..1.22 m plus a
`glass` cabin above it, so no single surface covers 60% of the chrome's combat height. The
old whole-street chrome mesh was "explained" by containment of a coach/truck surface, which
was the wrong unit. Resolving it is a spec/shot-surface or ledger decision.

## Second use

Both checks run over all seven actual arena builds (coach, cab, bogie, two saloons, two
coupes) with structurally different dressings and yaws; the reader is dressing-agnostic.

## Verify

```
npx --no-install vitest run src/vehicle-forge/completion-vehicle-census.test.ts --silent=false --reporter=verbose
```

## Still open (not fixable inside this scope without a contract change)

- Draw ceiling 15 is exactly met; splitting shared-paint meshes per vehicle costs +2 draws.
  The audit reading anchors (`scripts/qa/audit-collider-visual-parity.ts`, not owned) keeps
  draws flat and is the recommended route.
- Truck census: cab 6206 + bogie 1818 under one anchor against the 6000 cab-only fence.
- Twelve winding rows, the coach 9988 pin, the skirt 2.25 pin and the R24 0.84 m clustering
  assumption are historical pins superseded by later authored commits; see REPORT.md.
# Integration review: complete accounting is a gate

On 2026-09-12 the independent review found that filtering an invalid component box
could silently remove a whole vehicle while crediting all source vertices. Root
corrected the reader before integration: xyz positions and world transforms must be
finite, ownership must be uniform within each emitted triangle, and only non-indexed
triangle geometry is partitioned. Unsupported or malformed ownership falls back to
whole-mesh measurement and is counted as malformed; the permanent gate now requires
that count to be zero. Indexed support must be implemented explicitly in a later
change, rather than inferred from a different vertex order.

Invalid source positions cannot be rescued by a cached old bounding box. The census
retains the visible-mesh count and reports unmeasurable geometry with its full vertex
count; the permanent gate requires that list to be empty. Component counts are summed
from the retained components rather than simply copying the claimed source total.

Root verification: 28 focused tests passed, including eight corruption/topology cases;
the unchanged Direction C shot-coverage assertion still failed on four chrome
components. That remaining failure is OPEN. No threshold, exclusion or accepted
shoot-through row was changed, and no runtime geometry or shot authority was changed.
The reviewer's proposed vertical-stack approximation remains unapplied pending proof
that it does not conceal actual projectile gaps.
