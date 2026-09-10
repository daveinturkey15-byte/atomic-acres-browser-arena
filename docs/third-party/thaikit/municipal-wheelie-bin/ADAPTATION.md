# Municipal wheelie bin: bounded Nuke Town substitution

Upstream: [thaikit](https://github.com/keysforthewin/thaikit),
`@thai-kit/props@0.4.0`, supplied through the owner's Vibe3D registry link.
The six original source/metadata/license files beside this note are unchanged.
`upstream-source.json` records the supplied package identity and original hashes;
the factory SHA-256 is independently pinned by the local asset test.
MIT license is retained in `LICENSE`.

VERIFIED original factory under Node: 600 triangles, two meshes/draws, one
material, two geometries. Measured bounds are 0.72 x 1.07 x 0.66 m. Its prose
envelope claims 0.58 x 1.07 x 0.62 m; the smaller width/depth are not used as
evidence. Model metadata colliders remain proposals and are not game authority.

## Adaptation

VERIFIED runtime source lives in `src/thaikit/municipal-wheelie-bin.ts` and its
editable `municipal-wheelie-bin.geometry.json`. The JSON contains only this
model's box, frustum, cylinder and placement data, extracted from the pinned
factory's CONFIG. The adapter implements only those three construction forms.
Generic canvas tiles, preview lights, unrelated asset helpers, texture loaders,
asset colliders and dynamic lid machinery never enter the runtime import graph.

VERIFIED changes from the upstream model:

- Clean, desaturated grey-green plastic and a muted blue lid retain the old
  blue-bin identity. No branding, canvas grime, rust or soil layer is applied.
- Closed body/lid geometry is merged into one mesh and one opaque vertex-color
  material. Both placements share the same geometry/material.
- Tyres use 12 radial segments instead of 20; hubs use eight instead of 14.
  All body ribs, rear grip, raised lid forms and moulding details remain.
- Geometry is fitted to the exact former six-box aggregate local envelope:
  min `[-0.28, 0.01, -0.29]`, max `[0.28, 0.915, 0.26]` metres.
- Only `yard domestic bin blue` is substituted, once per yard, at the existing
  catalog anchor through the same handed/180-degree paired placement. The green
  bin remains the original kit prop. Old blue-bin boxes are removed, not hidden.
- Existing bins were presentation-only. That authority stays unchanged: no
  collision, shots, spawns, cover rules or navigation are added from ThaiKit.

## Evidence

VERIFIED adapter: 488 triangles and one draw per bin. Existing full yard total
756 - old blue bin 72 + replacement 488 = **1172 triangles per yard**, below the
unchanged 1200 budget. Two replacements add 832 triangles arena-wide and two
visible mesh submissions; actual GPU frame cost remains OPEN.

VERIFIED `npx vitest run src/thaikit/municipal-wheelie-bin.test.ts
src/forge-kit/yard/yard.test.ts --maxWorkers=1`: 12 passed. The asset was
instantiated and checked before wiring; tests cover finite geometry, measured
bounds, resource sharing/disposal, no textures/lights/asset physics and upstream
hash preservation. Yard checks now inspect the actual replacement mesh rather
than assuming every runtime prop is a 12-triangle box. The existing 1.5 m
spawn/door clearances, yard footprint, above-lawn seating, presentation-only
contract, shadow flags and 1200 triangle ceiling are retained. The actual
runtime yard triangle sum is additionally asserted.

VERIFIED `npx tsc --noEmit`: passed.

VERIFIED pipeline-budget/oriented-coplanar/fidelity files: 58 passed, one failed.
The sole failure is the previously reproduced ce85 vehicle tyre-bucket defect
at `(1.86, -3.81)`, top `0.649861216545105` above `0.45`; the bin adds no new
failure. The vehicle test and threshold are unchanged.

OPEN: browser boot, shader compilation, Performance/Quality screenshots,
frame-time/draw-call measurements, resize/mobile coverage and independent
visual acceptance. Root owns the combined candidate and serialized GPU slot.
Use both yard cameras plus a close three-quarter bin view; compare the old
silhouette with the tapered body, circular wheels, lid and grip. No claim of
visual quality or release acceptance is made from source/Node tests.
