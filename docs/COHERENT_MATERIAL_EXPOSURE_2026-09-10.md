# Coherent material/exposure candidate 2026-09-10

## Basis
- Installed Three.js 0.185.1: `MeshPhysicalNodeMaterial` dielectric (`metalness 0`,
  `specularIntensity`, `clearcoat`/`clearcoatRoughness`); per r185 `colorNode`
  overwrites diffuse from `color`; `normalView`/`positionViewDirection` are the
  view-space pair for glass Fresnel.
- Upstream: MeshPhysicalMaterial (clearcoat, dielectric reflection, per-pixel cost,
  env-map recommendation); TSL / MeshPhysicalNodeMaterial / webgpu_clearcoat example.
- Local recipe: `docs/threejs-knowledge/recipes/vehicle-paint-under-a-blue-environment.md`;
  shared paint physics in `src/vehicle-forge/materials.ts`; siding graph in
  `src/nuketown2-materials/families/siding.ts`.

## What was seen (pixels, not camera names)
Supplied WebGPU captures: overbright pale siding/lights, flat pale vehicle paint,
very dark windscreens. Coach wheel/band work retained.

## Changed parameters (production diff is materials-only)
- `src/vehicle-forge/materials.ts`
  - `VEHICLE_PAINT_SATURATION_LOSS_MAX` 0.15 -> 0.12,
    `VEHICLE_PAINT_VALUE_LIFT_MAX` 0.08 -> 0.05 (floors 0.08/0.03 unchanged, so the
    pinned weathering contract still passes; worst-case wash narrowed).
  - Bleach mask `smoothstep(0.58, 0.88, normalWorld.y)` -> `(0.68, 0.92)`: flanks keep
    livery chroma, roof/bonnet still sun-bleach.
  - Dust-grey veil `dust * 0.30` -> `dust * 0.22` (pinned 0.35 dust mix untouched).
  - Glass `a0` 0.14 -> 0.12, constant fill 0.34 -> 0.22; Fresnel `pow(1-cos,5)`,
    tint, DoubleSide, `depthWrite:false`, clearcoat 1, coach `forgeCoachShade`
    variation unchanged. Normal-incidence alpha ~0.48 -> ~0.34, grazing still -> 1.
- `src/nuketown2-materials/families/siding.ts`
  - `sunFade` 0.09 -> 0.06; lip light `1.12 @ 0.6` -> `1.07 @ 0.5`
    (max lip lift ~+7.2% -> ~+3.5%). Splash, board tone, relief, batching unchanged.
- `src/rendering/arenas/nuketown2.ts`: intentionally untouched. Sun 3.2 / ambient
  0.42 / exposure 1.08 are mirrored by `NUKETOWN2_AUTHORED` and its mirror test;
  headroom is gained in materials, not by darkening the scene or touching cameras.

## Preserved contracts
VERIFIED source diff changes numeric material controls only; geometry/build/specs
and arena definition hashes are unchanged. SOURCE-INFERRED: no added geometry,
draws, textures, samplers or material instances. Actual runtime draw counts and
performance remain OPEN. No provenance digest changes; existing attributes,
relief, side/depth settings and graph structure are retained. Factory swatch tests
assert navy luma below half cream luma; rendered livery and glass response are OPEN.

## Tests
VERIFIED independent coordinator run, 10 September 14:13 BST: 7 files, 98 tests passed;
`git diff --check` passed. Assertions and old thresholds were not changed.
- `src/coherent-material-exposure.test.ts` (6 new invariant cases)
- `src/vehicle-forge/weathering.test.ts`
- `src/vehicle-forge/glass-space.test.ts`
- `src/vehicle-forge/coach-polish.test.ts`
- `src/nuketown2-vehicle-materials.test.ts`
- `src/nuketown2-materials/nuketown2-materials.test.ts`
- `src/nuketown2-lighting/presets.test.ts`

These checks do not measure rendered alpha, GPU draw/sampler counts, pixel quality,
or every other arena. Matching frozen browser captures remain required. The glass
base-alpha change applies to all forged vehicles, not only the coach.

## Unresolved visual risks
Screenshot improvement is OPEN until the coordinator captures the same cameras on
the frozen candidate. Glass lightening is analytic (alpha arithmetic), not a capture.
Narrowed wash still leaves the 0.08/0.03 floors, so a near-white coach stays pale by
authoring; that is palette, not a defect to fix here.
