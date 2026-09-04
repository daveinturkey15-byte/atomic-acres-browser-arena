# Clustered lighting in our r185 renderer

Upstream reference: [Three.js r185 clustered lights example](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_clustered.html)

Three r185's example assigns the public `ClusteredLighting` addon to
`WebGPURenderer.lighting` before renderer initialization. The installed package
is `three@0.185.1`; its addon source exposes `ClusteredLighting` and
`ClusteredLightsNode`, while `src/renderers` retains the ordinary `Lighting`
manager. Our implementation uses that public addon API and does not copy or
vendor upstream source.

Our settings are intentionally smaller than the example defaults:

* 48 maximum visible point lights in the arena;
* 24 lights per 32-pixel XY tile;
* 24 exponential Z slices;
* 30 fixed Nuke Town practicals, all `castShadow = false`;
* one clustered update pipeline reservation, with the existing exact ScenePass
  precompile reaching it before combat.

The catalog is authored from Nuke Town's own exported windows, house/garage
section, lamp-post layout, and vehicle dimensions. Paired anchors use the same
180-degree involution as the arena builder. Time-of-day modes remain pure
`LightingConditionWrites`; the local rig receives only the resolved hour and
updates existing light intensities with `duskLocalLightFade()`.

The node's bounded shader shape is the reason the cost is fixed: screen tiles
and Z slices have a fixed dispatch, and a fragment evaluates no more than the
per-tile list capacity. At 2560x1440 the grid is 80 x 45 x 24 = 86,400 cluster
items; the worst-case fragment loop is 24 point-light evaluations. This is a
source-level estimate, not a measured GPU result.

Claim state: **VERIFIED** source/API selection, data derivation, limits,
precompile registration, and unit tests. **OPEN** browser capture and GPU
timing because this rendering lane was run with browsers and GPU work
prohibited.
