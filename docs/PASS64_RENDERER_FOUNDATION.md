# Pass 64 renderer and arena-forging foundation

Impact: `runtime`  
Baseline: accepted Pass 63 source `0c1574b132db8d16666e6a1ce25c6711165194b9`  
Rollback oracle: immutable Pass 62 source `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`, Pages `27c90967bdaf5387c0372933c7965a60ce75a765`, nested path `channels/experimental-netcode-pass`, runtime digest `035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d`

Pass 62 remains exact hosted bytes. Pass 64 does not rebuild or reinterpret it through the new renderer architecture.

## Claim state

### Observations

- `src/main.ts` owns WebGL creation, context inspection, render settings, all four eagerly built arenas, scene switching, direct render calls, diagnostics and much gameplay/UI state.
- The selected map does not determine which procedural arena modules are downloaded or constructed: all four builders are statically imported and executed at startup.
- The current custom GLSL owners are the procedural sky, Atomic Signal HDR pass, three atmosphere materials, grass and water.
- Atomic Signal renders the principal scene into a half-float offscreen target. Before this pass it left `WebGLRenderTarget.samples` at zero even when the Quality canvas requested antialiasing.
- CSS colour-grade and film-grain overlays are disabled while Atomic Signal is active; the intended modern path is therefore one linear-HDR grade/dither owner rather than stacked CSS and GPU transforms.
- Nuke Town/Terminal contrast keys were active without complete shadows. Nuke Town route, street, portal and interior PointLights were also unshadowed.
- Terminal's Quality aircraft roof used front-sided half-cylinder shells. The Performance placeholder was suppressed in Quality, so the cabin saw the exterior shell's culled backfaces.

### Inferences

- A backend-neutral async owner can be extracted while retaining the concrete `WebGLRenderer` adapter required by existing post, PMREM, context/readback, shadow and prewarm code.
- WebGPU is not a safe game cutover until every custom material has a verified TSL graph and the WebGL-only seams have adapters. Merely constructing `WebGPURenderer`, checking `navigator.gpu`, or accepting its silent WebGL fallback would be false evidence.
- The lowest-risk roof correction is a separate, inset `BackSide` interior shell with the same forward/aft split. `DoubleSide` would mask orientation errors and could close or visually muddy the boarding aperture.
- Static practical fixtures should be emissive-only or baked. A runtime local light without a shadow-capable occlusion policy is a light-leak regression.

### Assumptions

- The stable machine IDs remain `atomic-acres`, `skyline-terminal`, `rustworks-1v1` and `gun-range`; display-label migrations do not rewrite physics, storage or protocol IDs.
- The four current `ArenaMap` builders remain authoritative for colliders, portals, spawns, ballistics and targets while presentation streaming is introduced.
- Two 256-square shadowed contrast keys plus the arena sun remain within the provisional Quality shadow budget for Nuke Town and Terminal. This must be measured on the HITL machine.
- Principal HDR target sample requests of four for Quality and two for Performance are supported up to `renderer.capabilities.maxSamples`.

### Unknowns

- GPU frame-time and transient-memory deltas for multisampled half-float HDR on the target gaming GPU.
- Whether every target browser/device supports multisampled half-float resolves with the depth texture and current Atomic Signal validation path.
- Final WebGPU adapter/device identity, software-adapter behavior, device-loss recovery and compiled WGSL pipeline hashes.
- Pixel-mask thresholds for closed-wall luminance and open-door luminance on every arena/profile/backend.
- The retained-object and GPU-memory steady state after repeated real quality-asset arena switches; the controller contract is implemented, but `main.ts` still eagerly owns the current arenas.

### Falsifiers

- A WebGPU-required preview whose `renderer.backend.isWebGPUBackend` is not exactly true, that reports device loss, or that retains any inventory entry below `verified` is not a WebGPU HITL candidate.
- Any unselected arena module or arena-owned asset request invalidates the streaming claim.
- More than one attached presentation root, a stale aborted root attaching, or resources remaining above the frozen repeated-switch threshold invalidates the disposal claim.
- A closed-wall luminance increase above its frozen ROI threshold with practicals/bloom enabled invalidates light-occlusion acceptance.
- An open portal whose luminance delta collapses below its threshold, or whose movement/shot aperture becomes blocked, invalidates the leak fix.
- A Quality cabin capture that cannot see the separate BackSide ceiling, or any opaque geometry spanning the aircraft boarding gap, invalidates the roof fix.
- A principal HDR telemetry value of zero while Atomic Signal is active invalidates the offscreen-antialiasing fix.

## Implemented boundary

- `LegacyWebGlRenderRuntime` now owns creation and truthful WebGL2 adapter/canvas telemetry while exposing the unchanged concrete renderer to legacy systems.
- `WebGpuRenderRuntime` is a real async Three r185 `WebGPURenderer` plus current `RenderPipeline` owner. It awaits `init()`, records actual backend identity, watches device loss and rejects a required WebGPU request when Three falls back to WebGL2.
- `?renderer=webgpu&requireWebGPU=1` initializes a detached real candidate backend, then fails closed until the TSL ledger is fully verified. It does not claim that the game scene is running on WebGPU.
- Atomic Signal now requests bounded MSAA on the principal HDR target and reports canvas antialiasing, canvas samples, principal-HDR samples and bloom samples separately. Bloom remains intentionally single-sampled.
- Four `ArenaVisualDefinition` modules declare per-level assets, lighting/occlusion, fog, shadows, atmosphere, one HDR colour pipeline, budgets, collision identity, exceptions and deterministic cameras.
- `ArenaVisualStreamController` dynamically imports only the selected definition, rejects undeclared resources, aborts stale generations, requires a detached candidate root, swaps one presentation root and idempotently disposes geometry, materials, textures and shadow maps.
- The stream controller is not wired into `main.ts` yet. Current gameplay continues using the behavior-preserving eager builders until collision/presentation atomic switching and asset-loader request recording have browser evidence.
- Terminal has separate inset forward/aft `BackSide` cabin-ceiling shells. The split leaves the central aircraft boarding aperture open; no blanket `DoubleSide` was added.
- Nuke Town and Terminal contrast keys are Quality-only and all active keys cast local shadows. Nuke Town's legacy unshadowed local fill PointLights now retain only emissive-source metadata at zero runtime intensity.

## Remaining cutover gates

1. Move authoritative map preparation and presentation streaming behind one generation transaction without changing colliders, spawns, ballistics or network state.
2. Route quality GLTF loads through the selected definition's request recorder, then prove zero unselected requests.
3. Convert each entry in `TSL_MIGRATION_INVENTORY` to named TSL graphs and store stable authored pipeline descriptor hashes.
4. Replace WebGL context/readback, PMREM, render-target, shadow-refresh, compile/prewarm and context-loss calls with backend adapters.
5. Implement the common-renderer `RenderPipeline` HDR graph: scene/depth, occlusion-correct bloom, exposure/tone map, grade, ordered dither and output transform.
6. Freeze per-arena/profile WebGL camera captures and performance measurements, then compare WebGPU/TSL at the same camera/time/seed/exposure.
7. Add closed-wall/open-door pixel-mask gates for Nuke Town and Terminal, then all remaining arenas.
8. Run repeated switch/disposal memory tests and device-loss tests.
9. Produce an immutable preview receipt containing actual backend, adapter class, device-loss state, active arena/module, camera ID, principal target samples, TSL pipeline hashes and zero legacy shader materials.

Until all gates pass, Pass 62 remains the exact-byte rollback and Pass 63 remains the current-stack comparison candidate.
