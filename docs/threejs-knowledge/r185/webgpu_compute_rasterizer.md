# r185 recipe: compute rasterizer

## 1. Observed API surface

**VERIFIED.** This is an experimental software rasterizer: storage buffers hold vertices,
indices, LOD/chunk metadata, packed visibility and work queues; `Fn`, `If`, `Loop`,
`instanceIndex`, `vertexIndex`, `storage`, `uniformArray`, `atomicMax`, `atomicAdd`,
`atomicStore`, `atomicLoad`, `screenSize`, `screenCoordinate`, `texture`, `varyingProperty`,
`mat4`, `uvec4`, `uint`, `float`, `int`, `distance`, `sqrt`, and a fullscreen resolve are
used. It rasterizes small triangles in compute, queues large triangles to a hardware mesh,
then shades via a `QuadMesh`. r185's `IndirectStorageBufferAttribute` is used for dispatch.
Local core symbol: `node_modules/three/src/renderers/common/IndirectStorageBufferAttribute.js:12`;
version `0.185.1`.

## 2. Engine equivalent

**NONE.** `src/rendering/render-runtime.ts:1050-1164` owns the WebGPU runtime/submission
fences, and `src/farcrysis-instancing.ts:17-55` owns conventional instancing, but no
compute visibility/raster path exists. The app's authoritative raycast and collision meshes
must not be replaced by this visual curiosity.

## 3. Applicability ranking

1. **Nuke Town/Raid — low:** too much correctness and shader risk for normal arena scale.
2. **Farcrysis — low/experimental:** possible distant backdrop research only.
3. **Terminal/RustRig/Gun Range — none for shipping:** conventional WebGPU rendering wins.

## 4. Re-implementation plan

Do not schedule production work. If a sandbox is ever approved, isolate it as
`src/rendering/experiments/compute-rasterizer-lab.ts`, with no runtime import. Budget is
zero shipping pipelines/milliseconds/memory; lab cap is 1,024 instances, 64-triangle
chunks, 16 px software raster tiles, 2 MiB queue memory and a hard 0.5 ms CPU orchestration
budget. All values are fixed-size buffers/uniforms.

Deploy fence/tripwires: never in an arena bundle, never in combat, no gameplay or raycast
authority, no GPU readback, and fail closed if indirect dispatch/atomics are unavailable.
Gates would be only static API/type checks, buffer bound tests and a zero-runtime-reach
assertion. Estimate: 0 LOC now; 250+ LOC for a quarantined lab.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_compute_rasterizer.html
