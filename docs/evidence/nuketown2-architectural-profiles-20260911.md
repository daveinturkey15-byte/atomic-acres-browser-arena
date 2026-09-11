# Architectural profiles for the rejected porch view

Base: `14c833a3ff2ab408b32f75f57f347d95270f4851`.
Branch: `contrib/dave-gaming-pc/codex/scene-visual-hitl-20260911`.

VERIFIED reconciliation: the former scene branch was clean at `83baeb30d`.
Fast-forward to the candidate was impossible. `git cherry` reports both
`49992fac6` and `83baeb30d` patch-equivalent in the candidate. The former branch
was preserved; this new branch starts at the exact requested candidate.

VERIFIED inspected artifact: candidate `artifacts/viewpoint-regression/
grille-eee248-first/nuketown2/nuketown2-front-porch.png`. The image shows the
house dominated by square-cut board faces, sills and cantilever canopy slabs.
The previous bin substitution cannot address those large visible surfaces.

VERIFIED implementation in `src/forge-kit/architectural-profiles.ts`:

- 608 existing clapboards become actual tapered profiles, retreating 10 mm at
  the top while keeping their original AABB and 12 triangles each.
- 24 existing prominent sills, lintels, fascia and canopy pieces receive
  bounded bevelled edges, maximum radius 16 mm, inside their existing bounds.
- Added geometry: 2304 triangles, below the 4000 component budget. No new
  objects, material instances, shader graphs, textures, lights or render loop.
- Profiles retain indexed BoxGeometry compatibility with the existing static
  batcher. The two-source mixed plain/profiled batching test produces one batch.
- Existing source meshes keep their material, transform and identity. No
  collider or shot record is created or changed by this module.

VERIFIED checks: three focused tests passed; `npx tsc --noEmit` passed. Tests
cover all four clapboard outward directions, real normal slopes, unchanged
envelopes, finite bevel attributes, triangle counts, indexed batching, actual
candidate selection census, budget and rejection of application after batching.
Preflight on the new branch at its base passed current-main containment.

## Required integration

OPEN until root applies the module: import `applyNuketownArchitecturalProfiles`
from `./forge-kit/architectural-profiles` into `src/nuketown2-arena.ts` and call
`applyNuketownArchitecturalProfiles(builder.root)` immediately before
`batchPresentationOnlyBoxes(builder.root, 'nuketown2-presentation')`.
The helper refuses late or duplicate application. No arena file is edited by
this component because root owns that integration surface.

OPEN visual result: retain the rejected camera and inspect both house halves,
plus a close siding view. Require continuous lap shading, restrained edge
highlights and clean trim without flicker. Root must verify final geometry /
shot-envelope parity and native-WebGPU frame cost in the combined candidate.
No GPU, browser or multiplayer run was performed in this source component.

Source checked: installed `three@0.185.1` implementation of
`examples/jsm/geometries/RoundedBoxGeometry.js` and existing BoxGeometry batch
contract. The official addon is used through the project's own Three instance.
It emits non-indexed geometry, so the adapter supplies sequential indices
without merging distinct bevel normals. No additional npm asset was imported:
this correction targets the actual existing architecture shown in the rejection.
