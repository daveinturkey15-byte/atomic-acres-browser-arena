# r185 recipe: compute rasterizer with IBL

## 1. Observed API surface

**VERIFIED.** This is the IBL variant of the compute rasterizer. It adds HZB/depth-pyramid
occlusion, previous-frame matrices, meshlet clustering, `dFdx`, `dFdy`, `normalize`,
`cross`, `sign`, `positionGeometry`, `cameraViewMatrix`, `positionViewDirection`,
`overrideNodes`, `Discard`, and `context`; it uses `MeshoptClusterizer`, `MeshoptSimplifier`,
`UltraHDRLoader`, storage atomics and indirect dispatch. It also performs derivative-based
roughness widening and a hardware-triangle fallback. Version: `three` `0.185.1`; local
`IndirectStorageBufferAttribute` is `node_modules/three/src/renderers/common/IndirectStorageBufferAttribute.js:12`.

## 2. Engine equivalent

**NONE for the full path.** We have normal arena IBL at `src/rendering/arena-environment-
ibl.ts:89-135`, screen-space depth/post at `src/rendering/screen-space-post.ts:130-168`,
and render submission safeguards in `src/rendering/render-runtime.ts:1050-1164`, but no
HZB culling, meshlet resolver or compute rasterizer.

## 3. Applicability ranking

1. **Farcrysis backdrop — low/experimental:** only if distant geometry becomes the measured
  bottleneck.
2. **Nuke Town/Raid — very low:** current authored geometry and parity gates make it a poor
  trade.
3. **Terminal/RustRig/Gun Range — none for shipping.**

## 4. Re-implementation plan

No production module is recommended. A future lab would be
`src/rendering/experiments/compute-rasterizer-ibl-lab.ts`, isolated from arena imports.
Shipping budget: zero. Lab budget: <=16 HZB levels, <=15,625 instances, <=100,000 hardware
triangles, <=16 MiB transient buffers, and a separate experimental build. Camera history,
roughness and IBL parameters remain uniforms/buffers, never per-instance topology.

Deploy fence/tripwires: no menu precompile admission, no combat reachability, no replacing
the existing depth/authority contract, no readback, and hard overflow checks for packed
triangle/instance bits. Gates: static reachability, buffer bound tests, HZB determinism and
an explicit `EXPERIMENT_ONLY` receipt. Estimate: 0 LOC now; 400+ LOC if separately approved.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_compute_rasterizer_ibl.html
