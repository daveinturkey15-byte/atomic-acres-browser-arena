# World Studio — nature lane (HF-571)

Lane: `contrib/dave-gaming-pc/claude/nature-author-20260912` (routed lane
`nature-author-20260912`). Owned paths: `src/world-studio/nature/**`,
`scripts/world-studio/nature/**`, `public/assets/original/world-studio/nature/**`,
`source-assets/world-studio/nature/**`, this document.

## API

`src/world-studio/nature/index.ts` exports exactly the contract:

```ts
createStudioNature(): {
  root: THREE.Group;            // at origin, no enclosing transform
  update(elapsed, dt, cameraPosition, { wind, rain, snow, wetness }): void;
  dispose(): void;
  stats;                        // build-time ledger (extra, not in the frozen API)
}
```

`update()` writes four shared TSL uniforms (time, wind, wetness, snow) and
advances the lawn field's wind clock. It allocates nothing and rebuilds no
geometry. Root owns lights, fog, sky, weather choice and the frame loop; the
module never touches them. No listeners, no window globals, no renderer.

## What is built (measured by `index.test.ts`, 2026-09-12)

| Layer | File | Draw groups | Notes |
|---|---|---|---|
| Ridge / forest / coast ring | `terrain.ts` | 1 | Polar heightfield 160 x 48, radius 46 → 560 m, vertex-coloured (meadow, forest floor, rock by slope, snow above ~90 m, beach sand/wet band/silt), one tileable ground-detail map |
| Boulders | `terrain.ts` | 1 | 30 displaced icosahedra, forest floor and shore, outside the playable margin only |
| Coastal sea | `water.ts` | 1 | Plane X ±900, Z −940 → −40 at Y = −0.6; 4 declared directional bands with analytic normals; Beer-Lambert per-channel absorption over an authored 256² depth mask; Schlick Fresnel toward a sky term; crest + shoreline foam; waves shoal to zero on the beach |
| Trees (near) | `trees.ts` | 6 | 58 broadleaf (trunk + 3 branches + 32 leaf-cluster cards in 4 lobes), 98 conifer (88 forest + 10 lean-tilted shore pines; 6 ragged needle tiers + leader), 46 birch (pale trunk, 18 small-leaf cards). Grove-clustered seeded scatter, ≥ 3.4 m separation, feet on `terrainHeight()` with slope sink |
| Trees (far) | `trees.ts` | 2 | 720 crossed silhouette cards, 96 → 250 m, below the 78 m treeline, foothills only |
| Hedges | `gardens.ts` | 2 | 18 knee-high clipped-box segments (merged, AO vertex colour, world-scaled leaf tile) + 650 instanced leaf sprigs along tops and shoulders |
| Flower beds | `gardens.ts` | 4 | 733 crossed cards in 4 atlas cells: street verges, shed skirts, yard side of every hedge |
| Lawn tufts | `gardens.ts` → `rendering/instanced-grass-field.ts` | 8 | 2,551 two-blade tufts in fence bands, north/south strips and the street verges; suburban tint with dry patches |

Totals: **94,794 triangles, 25 draw groups, 9 textures** (8 albedo/alpha maps
at 128–256 px plus the 256² depth mask). Budget in the brief: ≤ 100k / ≤ 80.

Coastal sector: centred on −Z, 110° wide (`COAST_HALF_ANGLE_DEG = 55`), 12°
blend at each edge; mountains and forest fill the remaining 250°.

## Recipes applied (with provenance)

- **Terrain / coast**: one height field (`layout.ts::terrainHeight`) read by
  the ring mesh, tree feet, boulders, and the water depth mask, so nothing
  floats and the shoreline the water draws is the ground's. Ridged
  multifractal for crests, fbm for undulation; polar grid dense near the
  arena (`t^1.7` radial spacing). Own implementation.
- **Water**: `threejs-webgpu-water` skill steps 1 and 4 (absorption before
  any palette, local Fresnel), foam-from-slope as in the project's
  `water/ocean-tsl.ts` idiom. Authored depth mask is the explicit
  approximation the technique packet allows; no FFT, no reflection pass, no
  foam accumulation state (listed below).
- **Vegetation**: `threejs-procedural-vegetation` skill — mulberry32 seeded
  scatter, grove clustering, merged multi-part geometry via `mergeGeometries`
  with `toNonIndexed()`, `computeBoundingSphere()` after the last
  `setMatrixAt`, trunk/foliage material buckets. Wind is a per-vertex
  `windWeight` attribute read by the vertex stage (`materials.ts`), no JS
  leaf loops. Leaf atlas is a computed `Uint8Array` DataTexture (same idea as
  `nuketown2-vegetation.ts`) so Node QA can inspect it.
- **Lawn**: reuses `rendering/instanced-grass-field.ts` unchanged
  (region rectangles + `groundCoverAllowed` keep-out predicate).
- **Materials**: `MeshStandardNodeMaterial` from `three/webgpu` with small TSL
  graphs; WebGL2 compatibility route (`dataset.renderBackend === 'webgl2'`,
  same gate as the grass field) gets plain `MeshStandardMaterial` with the
  same maps and no wind. No `ShaderMaterial`, no `onBeforeCompile`.
- Eanpa-Sky: not used (root owns the sky rig).

## Gameplay safety

- Nothing in this module collides or blocks shots; every mesh carries
  `userData.presentationOnly = true` and `blocksShots = false`.
- Trunks and boulders stand outside the playable rectangle inflated by 4 m
  (test: every near-tree foot passes `outsidePlayableMargin`).
- In-bounds decor is short: hedges are capped at 0.5 m
  (`HEDGE_MAX_HEIGHT_M`), flowers 0.28 m, lawn blades 0.14 m. Hedge lines are
  sampled every 0.5 m across their full width against `hedgeAllowed()` (road
  X ±11, both houses, both garages, both sheds, the four spawn pads at 3.5 m,
  and the lanes: house-end exits Z ±12, rear-door corridors, street entrance
  paths) and a run that crosses a keep-out is cut there, never nudged.

## Visual assumptions root should check on the first render

- Root's ground apron is a flat plate at Y = 0 out to at least r = 46 m; the
  terrain ring starts 3 cm below that at its inner rim and rises from there.
- The water plane sits at Y = −0.6 under the apron on the coastal side; if
  the apron does not reach Z ≈ −56 there will be a visible sea gap.
- Key light roughly from +X / −Z (the wind lean direction and water foam
  phase assume that); the sea's Fresnel term uses a fixed cool sky colour
  and expects root's environment map for actual reflections.
- Fog: far cards and the ring rely on root fog for depth; conifer/leaf
  materials carry a tiny emissive floor so they never go black under it.

## Known limitations (honest list)

- **Tall reference hedges** (the 1.8 m side-lane hedges in the concepts) are
  not built: they would be real cover and need matching solids from the
  architecture/root lane. `HEDGE_RUNS` accepts any height but clamps to 0.5 m.
- **Lawn tufts get wind only**: the shared grass field owns its material, so
  wetness/snow do not reach the blades. Terrain, trees, hedges, flowers and
  boulders respond to all four uniforms.
- **Water** has no reflection/refraction pass, no foam memory (crest foam is
  a per-frame threshold), no swimming or buoyancy, and its four bands are
  presentation-only (never sample it for physics).
- **Snow** is a material response (up-facing whitening + roughness rise),
  not accumulated geometry; no precipitation particles here (root's).
- No LOD swapping by camera distance; the far cards are a separate static
  band. `update()` ignores the camera argument today.
- No Blender batch was needed; `scripts/world-studio/nature/` is empty.

## Verify

```
node node_modules/vitest/vitest.mjs run src/world-studio/nature --root <lane>
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```
