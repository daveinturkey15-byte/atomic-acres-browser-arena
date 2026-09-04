# r185 recipe: generated city

## 1. Observed API surface

**VERIFIED.** `CityGenerator` lays out seeded city blocks, calls `SkyscraperGenerator`,
adds `SidewalkGenerator`, exposes `layout`, and is dressed with `createBuildingMaterial`
and `createRoadMaterial`. The HTML adds a `RenderPipeline`, TSL `pass`, `bloom`, and
`MeshStandardNodeMaterial`; local r185 exports are in
`node_modules/three/examples/jsm/generators/CityGenerator.js:31-32,346`, with its
Skyscraper dependency at `.../city/SkyscraperGenerator.js`. Version: `0.185.1`.

## 2. Engine equivalent

**PARTIAL.** Our arenas are deterministic code-authored layouts: `src/nuketown2-arena.ts:30-100`
owns measured footprints and parity, `src/raid2-arena.ts:291-375` builds procedural boxes,
and `src/farcrysis-ground-materials.ts:225-236` owns world-space ground materials. We do
not have a city-block layout generator or shared road/sidewalk layout object.

## 3. Applicability ranking

1. **Farcrysis — very high:** distant city/industrial skyline and roadside cells.
2. **Raid — high:** terrace/outbuilding dressing around the playable authored footprint.
3. **Nuke Town — medium:** background horizon only; never replace its measured BO2 flow.
4. **Terminal/RustRig/Gun Range — low:** only as a backdrop generator.

## 4. Re-implementation plan

Create `src/rendering/procedural-city-backdrop.ts`: a seeded cell layout that produces
background building silhouettes, road strips and sidewalk bands, not playable collision.
Budget: <=48 cells, <=3 material families, <=2.5 ms worker-side generation, <=1.2 ms GPU
p95, and <=12 MiB geometry; one cached group per arena/seed/tier. Seed, height, tint and
wear are data/uniforms, not per-instance shader variants.

Deploy fence: construct off the gameplay frame loop during streaming and precompile only
the admitted tier at menu-time; attach only after the loading transition. Tripwires: cell
count and draw-group caps, no overlaps with gameplay footprints, no fresh pipeline during
combat, and no effect on Rapier or raycast meshes. Gates: layout determinism, skyline
silhouette/height bounds, memory/draw receipt, and background-only collision exclusion.
Estimate: 220-340 LOC and tests.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_generator_city.html
