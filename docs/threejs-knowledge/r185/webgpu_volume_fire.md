# r185 recipe: volume fire

## 1. Observed API surface

**VERIFIED.** The example is a GPU 3D fluid: `Storage3DTexture` at 100x100x200, curl-noise
initialisation, semi-Lagrangian velocity/dye advection, divergence, two Jacobi pressure
passes, projection, and `VolumeNodeMaterial` ray marching. Its exact TSL imports include
`Fn`, `uniform`, `texture3D`, `textureStore`, `storage`, `storageTexture`, `instanceIndex`,
`If`, `Loop`, `positionWorld`, `positionLocal`, `screenCoordinate`, `mx_noise_float`,
`interleavedGradientNoise`, `frameId`, `smoothstep`, `mix`, `min`, `max`, `floor`, `hue`,
`snoise`, and `snoiseVec3`; addons are `curlNoise.js`, `GaussianBlurNode.js`, and
`BloomNode.js`. The r185 HTML runs seven compute stages then a `RenderPipeline`; local
core symbols are `node_modules/three/src/renderers/common/Storage3DTexture.js:13` and
`node_modules/three/src/materials/nodes/VolumeNodeMaterial.js:10`. Version: `three` `0.185.1`.

## 2. Engine equivalent

**PARTIAL.** `src/special-weapon-effects.ts:1-82` has bounded fire/projectile state and
`src/carpet-ground-fire-multiplayer.ts:10-106` has authoritative retained fire snapshots.
`src/graphics-settings-registry.ts:364-388` has volumetric, smoke and particle controls;
`src/rendering/pass64-tsl-scene.ts:150-154` has depth-aware bloom and volumetric shaft
stage ordering. We have no `Storage3DTexture`, `VolumeNodeMaterial`, or fluid compute path.

## 3. Applicability ranking

1. **Nuke Town — very high:** scripted background nuke fireball, with a bounded visual box.
2. **Raid — medium:** one shed/barrel fire emitter, only in Max/Custom.
3. **Farcrysis — medium:** burning wreck or flare, not a persistent field.
4. **Terminal/RustRig/Gun Range — low:** use the existing cheap fire signal unless authored.

## 4. Re-implementation plan

Create `src/rendering/volume-fire-presentation.ts` as a presentation-only, fixed-box effect:
one 3D dye texture (target 48x48x96), one velocity texture, one divergence/pressure pair,
and at most five compute submissions per active emitter. Budget: 2.0 ms p95 at 1280x720
and 3.5 ms at 2560x1440, <=32 MiB transient GPU memory, one pipeline family per quality
tier, and a hard cap of two simultaneous emitters. Drive phase, temperature, wind and
colour as uniforms; never make per-instance values compile-time constants.

Deploy fence: precompile the volume material and compute nodes at menu-time; admit the
effect only after explicit deployment; pause simulation when its arena is not presented.
Tripwires: fixed texture dimensions, bounded Jacobi count, pool reuse, no `compute()` or
pipeline creation in combat, no authoritative damage from the volume, and automatic off
fallback when the storage-texture capability is absent. Gates: deterministic fluid-step
math, memory-cap test, renderer feature admission, disposal test, and a no-pipeline-in-
combat probe. Estimate: 300-450 LOC and two focused test files.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_volume_fire.html
