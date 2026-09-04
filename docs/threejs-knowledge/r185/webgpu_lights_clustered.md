# r185 recipe: clustered lights

## 1. Observed API surface

**VERIFIED.** The r185 example installs `ClusteredLighting` as `renderer.lighting`, then
builds its node with `lighting.getNode(scene).setSize(pixelWidth, pixelHeight)`. The HTML
uses `WebGPURenderer`, `RenderPipeline`, `pass`, `uniform`, `instancedBufferAttribute`,
`vec3`, `float`, `mix`, and `step`, plus `PointLight` and `InstancedMesh`. The addon is
`examples/jsm/lighting/ClusteredLighting.js`; its documented constructor defaults are
`maxLights=1024`, `tileSize=32`, and `zSlices=24`. The local r185 tree contains the addon
at `node_modules/three/examples/jsm/lighting/ClusteredLighting.js:19` and its TSL node at
`node_modules/three/examples/jsm/tsl/lighting/ClusteredLightsNode.js`; the project pins
`three` `0.185.1`.

The technique is Forward+ clustered shading: a 3D frustum grid culls point lights by XY
tile and exponential Z slice, so a fragment loops over only lights reaching its cluster.

## 2. Engine equivalent

**PARTIAL.** We have a light set and shadow schedule, but not clustered light admission:

- `src/rendering/screen-space-post.ts:120-168` owns screen-space light stages and MRT needs.
- `src/rendering/render-runtime.ts:603-610` recognises directional/spot/point lights for
  the existing shadow schedule.
- `src/graphics-settings-registry.ts:256-376` owns shadow, indirect, reflection,
  volumetric and environment controls.
- `src/rendering/arena-environment-ibl.ts:89-135` supplies shared arena environment light.

No `ClusteredLighting` or per-fragment light-list equivalent is present in `src/`.

## 3. Applicability ranking

1. **Nuke Town Rebuild — very high:** fixed-cost night/time-of-day street and house lights.
2. **Raid Rebuild — high:** courtyard and terrace fixtures without a long forward-light list.
3. **Farcrysis — medium:** useful for sparse night dressing; daytime sun remains dominant.
4. **Terminal/RustRig/Gun Range — medium/low:** only when authored light count justifies it.

## 4. Re-implementation plan

Create `src/rendering/lighting/clustered-point-lights.ts`: a typed arena light catalog,
CPU-built bounded cluster headers, and a TSL lookup that replaces only the point-light
selection path. Keep gameplay/visibility authority in existing systems. Budget: one
lighting node/pipeline variant per graphics topology, 0.6 ms p95 on the owner desktop at
2560x1440, 128 admitted point lights, 24 Z slices, and <=256 KiB list/header memory;
Performance uses 32 lights and no shadow promotion. Per-instance colour/range/intensity
are uniforms or fixed-size buffers, never shader-generated constants.

Deploy fence: construct during menu-time retained-asset precompile only; bind after the
arena loading transition; never create a pipeline in the combat frame loop. Tripwires:
stable light count, cluster dimensions, no per-frame array allocation, no light-list
overflow, and no profile-specific collider or gameplay change. Gates: pure cluster index
math tests, deterministic catalog/overflow tests, graphics-topology receipt, cold
precompile receipt, and a no-new-pipeline-in-combat probe. Estimate: 220-320 LOC and one
focused test file.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_clustered.html
