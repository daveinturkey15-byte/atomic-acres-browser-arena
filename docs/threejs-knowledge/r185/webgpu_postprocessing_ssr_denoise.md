# r185 recipe: SSR plus temporal denoise

## 1. Observed API surface

**VERIFIED.** The example builds a `pass(scene,camera)` MRT with `mrt`, `output`,
`normalView`, `materialMetalness`, `materialRoughness`, `velocity`, `diffuseColor`,
`screenUV`, `sample`, `packNormalToRGB`, and `unpackRGBToNormal`. It composes `ssr()` with
`temporalReproject()`, `recurrentDenoise()`, `sharpen()`, and `traa()`; the node controls
include SSR `quality`, `maxDistance`, `thickness`, `setEnvMap`, `setHistory`, and denoise
`lumaPhi`, `depthPhi`, `normalPhi`, `alphaPhi`, `radius`, `strength`, `adapt`. Local r185
symbols are in `node_modules/three/examples/jsm/tsl/display/SSRNode.js:36,1348`,
`TemporalReprojectNode.js:519,1016`, `RecurrentDenoiseNode.js:343,908`, and the three
companion files. Version: `three` `0.185.1`.

## 2. Engine equivalent

**YES, partial denoise gap.** `src/rendering/screen-space-post.ts:39-69` already owns SSR,
SSGI and stage IDs; `:130-168` declares the normal/material/velocity MRT contract;
`:317-437` builds SSR/SSGI; `:649-680` updates SSR tuning through uniforms. The project
does not currently chain r185 temporal reprojection plus recurrent denoise behind SSR.
`src/rendering/pass64-tsl-scene.ts:125-153` owns ordering and `src/graphics-settings-
registry.ts:320-331` owns SSR/SSGI controls.

## 3. Applicability ranking

1. **Nuke Town — very high:** glossy windows, bus and wet road can expose grainy SSR.
2. **Raid — high:** pool/courtyard stone benefits if temporal history stays stable.
3. **Terminal/RustRig — medium/high:** metal interiors and waterline reflections.
4. **Farcrysis/Gun Range — medium:** only where roughness and motion provide visible gain.

## 4. Re-implementation plan

Extend the existing graph with `src/rendering/ssr-denoise-bridge.ts` rather than replacing
`screen-space-post.ts`: SSR output -> bounded temporal history -> recurrent edge-aware
denoise -> existing additive composition. Budget: two additional fullscreen pipelines,
0.8 ms p95 at 1440p, one half-float history target plus velocity (<=24 MiB at 2560x1440),
and no more than eight denoise kernel taps. History length and strengths are uniforms;
topology only changes when SSR/denoise presence changes.

Deploy fence: precompile the complete chain at menu-time and only swap a prepared graph at
deployment. Tripwires: camera/arena/resize invalidates history, no stale history across
matches, no pipeline creation in combat, and SSR remains additive. Gates: MRT attachment
contract, history invalidation tests, deterministic disocclusion cases, stage-order receipt,
and the existing `screen-space-post` safety tests. Estimate: 180-260 LOC plus tests.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_postprocessing_ssr_denoise.html
