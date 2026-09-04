# r185 recipe: generated building

## 1. Observed API surface

**VERIFIED.** `SkyscraperGenerator` accepts a seed and building parameters, emits grouped
geometry, and is paired with `createSkyscraperMaterial` and `pickBuildingColor`. The
generator module imports `BoxGeometry`, `ExtrudeGeometry`, `LatheGeometry`, `ShapeGeometry`,
`MeshStandardNodeMaterial`, and TSL `attribute`, `cameraPosition`, `color`, `cross`, `dot`,
`floor`, `Fn`, `fract`, `fwidth`, `hash`, `mix`, `mod`, `mx_fractal_noise_float`,
`mx_noise_float`, `normalLocal`, `normalView`, `positionLocal`, `positionView`,
`positionWorld`, `select`, `smoothstep`, `step`, `uint`, `uv`, `varying`, `vec2/3/4`.
Local r185 addon: `node_modules/three/examples/jsm/generators/city/SkyscraperGenerator.js:247`
and exports at `:1357`; version `0.185.1`.

## 2. Engine equivalent

**PARTIAL.** `src/nuketown2-arena.ts:17-18,151-158` already produces code-authored house,
vehicle, fence and kerb meshes and assigns role-based node materials through
`src/nuketown2-materials/index.ts:120-178`. `src/raid2-arena.ts:182-233` has a separate
material catalog. No reusable seeded building generator or baked facade-piece groups are
present.

## 3. Applicability ranking

1. **Raid — very high:** procedural terrace, villa and outbuilding detail without hand-
placing every facade piece.
2. **Farcrysis — high:** roadside sheds and distant industrial blocks.
3. **Nuke Town — medium:** only for background detail; the playable house proportions remain
  first-party authored and collision-coupled.
4. **Terminal/RustRig/Gun Range — low:** not a primary fit.

## 4. Re-implementation plan

Create `src/rendering/procedural-building-kit.ts` as a seeded, deterministic facade-detail
generator. Generate only non-authoritative ledges, windows, awnings and roof modules,
group by material role, and let the arena own the footprint/collider. Budget: 1-3 draw
groups per building, <1.0 ms CPU generation off the frame loop, <0.5 ms GPU p95 for 24
background buildings, <=8 MiB geometry per arena. Seed and style values are inputs to a
cache; per-instance colour/variation stays uniform or instance buffer data.

Deploy fence: generate during arena stream/precompile, never during combat; cache key is
seed+style+geometry tier; no generated piece may be enterable or block a shot. Gates:
seed repeatability, footprint exclusion, draw/memory budget, materials registry coverage,
and deterministic geometry/collision parity cameras. Estimate: 260-380 LOC and tests.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_generator_building.html
