# r185 recipe: ground-projected environment map

## 1. Observed API surface

**VERIFIED.** The example loads an equirectangular HDR, converts it with
`CubeRenderTarget.fromEquirectangularTexture`, and samples it through `cubeTexture(cubeMap,
getGroundProjectedNormal(float(radius), float(height)))`. The exact addon is
`GroundedSkybox.js`; its TSL function imports `Fn`, `If`, `vec3`, `float`, `min`,
`cameraPosition`, and `positionWorld`. Local symbols are
`node_modules/three/examples/jsm/tsl/utils/GroundedSkybox.js:18` and the core cube texture
node; version: `three` `0.185.1`.

## 2. Engine equivalent

**PARTIAL/near.** `src/rendering/arena-environment-ibl.ts:89-135` generates and binds a
WebGPU PMREM environment, and `:167-180` changes intensity without regeneration.
`src/rendering/pass64-tsl-scene.ts:207-222` exposes the arena environment application.
We do not currently project the environment against a ground disk or expose a skyline-
horizon normal, so the equivalent is not present.

## 3. Applicability ranking

1. **Terminal — high:** skyline horizon and apron reflections.
2. **Nuke Town — high:** distant neighbourhood/mountain horizon behind the houses.
3. **Raid — medium:** terrace horizon and pool surround.
4. **RustRig/Farcrysis/Gun Range — low/medium:** useful only for an authored open boundary.

## 4. Re-implementation plan

Create `src/rendering/grounded-environment-node.ts`, retaining the current arena PMREM
ownership and using a small TSL normal-projection function in our own expression. Budget:
zero new render passes, one material graph variant, <0.15 ms p95, and no extra texture
memory beyond the existing PMREM. Radius, camera height and environment intensity are
uniforms; changing them must not rebuild the shader.

Deploy fence: bind after the existing PMREM is ready, with an off/flat-sky fallback; never
regenerate PMREM or compile in a menu animation loop. Tripwires: environment disposal on
arena switch, camera-inside-radius assertion, skyline-only use, and no collision effect.
Gates: normal-direction math tests, PMREM lifecycle test, resize/arena-switch test, and
deterministic Terminal/Nuke Town horizon review cameras. Estimate: 90-140 LOC plus tests.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_materials_envmaps_groundprojected.html
