# World Studio architecture (HF-571)

Authored by the `architecture-author-20260912` lane for the new `world-studio` level. This
document is the contract between this lane and root integration; it records what the module
returns, what is measured rather than claimed, and where the boundaries with other lanes are.

## API

```ts
import { createStudioArchitecture } from './src/world-studio/architecture';

const { root, solids, verticalNavigation, reviewPoints } = createStudioArchitecture();
```

- `root` — `THREE.Group` at the world origin with no enclosing transform. Every mesh is a
  descendant; nothing is re-parented or re-measured afterwards.
- `solids` — `{ id, mesh, bounds, material }[]` in **world** coordinates. Every `bounds`
  carries explicit `minY`/`maxY`; roof planes and stair handrails additionally carry
  `rotation`, which `src/collision.ts` already supports.
- `verticalNavigation` — `ArenaVerticalNavigation` with the interior stair, the external
  balcony stair and the garage-roof door as routes and ramps, plus walkable platforms.
- `reviewPoints` — fourteen cameras (street, living room, bedroom, backyard, stair, street
  balcony and porch per house) for root's render-and-critique pass.

Extras published on `root.userData`:

| key | purpose |
| --- | --- |
| `worldStudioArchitecture` | version, house ids, solid/draw-group/triangle census |
| `furnitureAnchors` | 20 measured placements (room, world position, yaw, footprint) for the furniture lane |
| `verticalNavigation` | same object as the return value, for consumers that read the group |
| `dispose()` | releases every generated texture and merged geometry |

## Measured budget

Counted by `studio-architecture.test.ts`, not estimated:

| metric | value | lane budget |
| --- | --- | --- |
| triangles | 20,088 | ≤ 100,000 |
| renderable draw groups | 24 | ≤ 80 |
| solids (colliders) | 444 | — |
| generated texture families | 4 × 512² (albedo + normal + roughness) | "modest handful" |

## Layout

Both houses are authored by one parametric builder and mirrored across the road, so the two
sides are gameplay-identical; only palette and masonry differ (teal house: brick chimney,
sage interior accent. Yellow house: stone chimney, gold accent).

Local coordinates: `+localX` is the street side, `-localX` the backyard, `+localZ` the
garage side. Teal is centred at X = −20 facing +X, yellow at X = +20 facing −X.

- Main block 14 m × 18 m, ground floor 0.08, upper floor 3.30, 3.0 m clear per storey,
  eave 6.45, ridge 8.0 (gable ridge runs along Z).
- Garage wing 8 × 10 m at world Z 9…19, centred on the house — i.e. centre Z = +14.
- **Ground:** living room and entry hall street-side, dining and kitchen yard-side.
  Front door at Z ≈ +4, rear slider at Z ≈ −3, kitchen↔garage door on the Z = +9 wall,
  garage vehicle opening onto the Z = +19 side lane.
- **Upper:** master bedroom over the living room with two street-facing windows for the
  cross-street duel, study with a balcony door, back hall/bath, second bedroom with a
  full-height slider onto the garage roof deck.
- **Vertical:** 16-tread interior stair in the hall (rise 0.201, going 0.281) through a real
  hole in the upper slab; a 16-tread external stair from the rear balcony to the yard.
- **Balconies:** a street balcony at 3.30 roofing the porch, with a pergola above it, reached
  by a full-height slider from the landing; a rear balcony over the back door, reached from
  the study, with the external stair down to the yard.

Routes through each house: street → porch → hall → living → dining → rear slider → yard;
hall → kitchen → garage → side lane; landing → street balcony; study → rear balcony →
external stair → yard; bedroom two → garage roof. The garage roof (3.50) and both balconies
are published walkable platforms. The two master bedrooms glaze the same band of their
street walls, so the cross-street window duel is a straight line interrupted only by glass —
asserted, not assumed, in `studio-architecture.test.ts`.

## Method

- **Materials.** One 512² set per texture family from the in-repo forge
  (`src/forge/textures`: `lapSiding`, `shingle`, `brick`, `concrete`), uploaded as
  `DataTexture` triplets and shared by every material that tints them. Tints are normalised
  against each family's measured mean albedo so an authored sRGB target lands on the intended
  hue instead of double-darkening through the map, and are clamped below 1.9 to stay off the
  oversaturated end. `MeshStandardMaterial` only — no `ShaderMaterial`, no
  `onBeforeCompile`, no DOM at generation time, so the same maps exist under Node QA.
- **UVs in metres.** The geometry builder bakes world-metre UVs and each material sets
  `repeat = 1 / metresPerTile`. Wall segments either side of a window therefore continue the
  same siding course rhythm instead of restarting per box.
- **Real apertures.** `StudioSurfaceCollector.addWall` subtracts rectangular openings and
  emits the exact remaining segments, so every door and window is a hole in the presentation
  *and* in the collision set. Sliding doors are glazed over one leaf only; hinged doors are
  modelled swung flat against the interior face. No opaque part spans a traversable opening.
- **Contact shading.** Per-vertex darkening towards floors and ceilings, written into the
  colour attribute. An `aoMap` would need a second UV set and would block merging.
- **Batching.** Geometry is merged per (house, material) before it reaches the scene; each
  solid references the merged mesh that contains it.

## Boundaries

This lane owns houses, garages, porches, balconies, external stairs, interior shells and
trim. It does **not** author ground, road, fences, vehicles, vegetation, garden sheds or
interior furniture; those belong to other lanes and to root.

## Known gaps and assumptions

1. **Porch depth.** The reference angle shows a deep verandah, but the contracted 14 m
   footprint leaves only 3 m between the front wall (X = ±13) and the road corridor
   (X = ±10), so the porch is a 1.6 m entry roofed by the street balcony. Deliberate
   deviation from the image in favour of the coordinate contract.
2. **Both houses carry the yellow house's street balcony.** The teal reference shows a
   pergola-over-porch instead. Gameplay symmetry was ranked above per-house silhouette
   variety: an upper street-facing firing position on one side only would not be a fair
   Nuke Town loop. Palette, masonry and interior accent still differ per house.
3. **Solids share meshes.** Several solids point at the same merged mesh. If root needs a
   mesh per collider — for per-panel destruction or per-pane glass breaking — that needs a
   second pass; the bucketing is a one-line change but would raise the draw-group count.
4. **Glass panes** are listed as `glass` solids with correct bounds, but they are merged into
   one mesh per house, so they are not individually breakable as authored.
5. **Stone veneer** is the `brick` family at a coarser tile with a stronger normal rather
   than a dedicated stacked-stone generator. It reads as coursed masonry, not as the rubble
   stone in the yellow-house reference.
6. **Carpet and terrazzo** are the `concrete` family retinted and rescaled. Plausible at
   player distance; a dedicated generator would be better and is cheap to add later.
7. **Gable infill** above the attic ceiling is non-colliding: it is enclosed by the ceiling
   slab below and the roof slabs above, both of which do collide.
8. **No lighting, renderer, rAF, listeners or window globals** are created here, per the
   brief. Materials respond to whatever environment and lights root installs.
9. Renderer-side quality (FPS, draw calls after batching, mobile behaviour) is **not**
   self-certified: root renders, inspects and critiques.
