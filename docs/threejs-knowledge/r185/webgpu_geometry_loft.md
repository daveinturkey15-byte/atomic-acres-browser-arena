# r185 recipe: loft geometry

## 1. Observed API surface

**VERIFIED.** `LoftGeometry` takes ordered 3D cross-section arrays with equal point counts,
supports `closed`, `capStart`, and `capEnd`, and creates a `BufferGeometry`; the example
uses `SplineCurve`, `Vector2/3`, `MeshStandardNodeMaterial`, and procedural TSL
`positionLocal`, `uv`, `screenUV`, `bumpMap`, `mx_noise_float`, `mx_fractal_noise_float`,
`mx_worley_noise_float`, `smoothstep`, `mix`, `sin`, `cos`, `vec3`, and `float`. Local r185
addon: `node_modules/three/examples/jsm/geometries/LoftGeometry.js:55-107,355`; version
`0.185.1`.

## 2. Engine equivalent

**PARTIAL.** `src/nuketown2-arena.ts:240` owns the kerb line and the arena uses explicit
boxes/planes for authored roads and covers. `src/nuketown2-materials/index.ts:120-178`
provides role materials; `src/raid2-arena.ts:369-378,449-450` builds repeated stair/kerb
geometry. There is no cross-section sweep utility for cables, curbs or pipes.

## 3. Applicability ranking

1. **Nuke Town — high:** continuous road/kerb profiles, cables and trim with fewer seams.
2. **Raid — high:** terrace rails, pool edging and curved architectural detail.
3. **Terminal/RustRig — medium:** cables, pipes and industrial rails.
4. **Farcrysis/Gun Range — medium/low:** roadside bands and wires only.

## 4. Re-implementation plan

Create `src/rendering/lofted-dressing.ts` around a small own cross-section builder, with
explicit topology names and optional collision-free render-only output. Budget: <=12
sections per piece, <=64 radial points, <0.4 ms CPU generation off-loop, <0.2 ms GPU p95,
and <=2 MiB per arena batch. Section shape, wear and material role are data; do not encode
individual piece parameters into shader variants.

Deploy fence: build/cache with arena geometry and precompile the material in the menu-time
retained set; never rebuild from a frame callback. Tripwires: equal section counts, winding,
finite bounds, no hidden collider claim, and one shared material per role. Gates: geometry
normal/UV tests, degenerate-section rejection, disposal, draw-count receipt and visual
review cameras for road/kerb/cable seams. Estimate: 160-240 LOC and tests.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_geometry_loft.html
