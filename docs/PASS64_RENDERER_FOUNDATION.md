# Pass 64 renderer and arena-forging foundation

Impact: `runtime`  
Baseline: accepted Pass 63 source `0c1574b132db8d16666e6a1ce25c6711165194b9`  
Rollback oracle: immutable Pass 62 source `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`, Pages `27c90967bdaf5387c0372933c7965a60ce75a765`, nested path `channels/experimental-netcode-pass`, runtime digest `035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d`

Pass 62 remains exact hosted bytes. Pass 64 does not rebuild or reinterpret it through the new renderer architecture.

## Claim state

### Observations

- `src/legacy-main.ts` owns WebGL creation, context inspection, render settings, all four eagerly built arenas, scene switching, direct render calls, diagnostics and much gameplay/UI state.
- The selected map does not determine which procedural arena modules are downloaded or constructed: all four builders are statically imported and executed at startup.
- The current custom GLSL owners are the procedural sky, Atomic Signal HDR pass, three atmosphere materials, grass and water.
- Atomic Signal renders the principal scene into a half-float offscreen target. Before this pass it left `WebGLRenderTarget.samples` at zero even when the Quality canvas requested antialiasing.
- CSS colour-grade and film-grain overlays are disabled while Atomic Signal is active; the intended modern path is therefore one linear-HDR grade/dither owner rather than stacked CSS and GPU transforms.
- Nuke Town/Terminal contrast keys were active without complete shadows. Nuke Town route, street, portal and interior PointLights were also unshadowed.
- Terminal's Quality aircraft roof used front-sided half-cylinder shells. The Performance placeholder was suppressed in Quality, so the cabin saw the exterior shell's culled backfaces.
- Hardware Chrome on the NVIDIA Blackwell adapter separately loaded, compiled and rendered all four arenas with actual WebGPU, seven authored TSL pipeline IDs, four principal HDR samples, zero traversed legacy shader materials and no browser/GPU errors. Repeated in-place arena disposal exposed a Three r185 cached-resource failure (`Buffer ... used in submit while destroyed`), so arena changes in the review UI deliberately reload the renderer instead of claiming safe WebGPU hot-swap.
- HITL rejected the first Gun Range capture because its overview camera was above the 7.1 m ceiling, and rejected the first Terminal cabin capture because the roof was too dark to judge. The corrected hardware captures keep Gun Range inside the shell with its armory, booths and targets visible, and light the Terminal cabin with its declared bounded shadowed-local key at the arena baseline exposure. Direct image review confirmed the cabin roof, wall panels, aisle and seats remain distinguishable without an ambient wash.

### Inferences

- A backend-neutral async owner can be extracted while retaining the concrete `WebGLRenderer` adapter required by existing post, PMREM, context/readback, shadow and prewarm code.
- WebGPU is not a safe game cutover until every custom material has a verified TSL graph and the WebGL-only seams have adapters. Merely constructing `WebGPURenderer`, checking `navigator.gpu`, or accepting its silent WebGL fallback would be false evidence.
- The lowest-risk roof correction is a separate, inset `BackSide` interior shell with the same forward/aft split. `DoubleSide` would mask orientation errors and could close or visually muddy the boarding aperture.
- Static practical fixtures should be emissive-only or baked. A runtime local light without a shadow-capable occlusion policy is a light-leak regression.
- Full renderer reload is the only currently evidenced WebGPU arena retirement boundary. It preserves selected-only loading and avoids reusing renderer caches after geometry disposal; it does not prove in-place hot-swap or steady-state memory yet.

### Assumptions

- The stable machine IDs remain `atomic-acres`, `skyline-terminal`, `rustworks-1v1` and `gun-range`; display-label migrations do not rewrite physics, storage or protocol IDs.
- The four current `ArenaMap` builders remain authoritative for colliders, portals, spawns, ballistics and targets while presentation streaming is introduced.
- Two 256-square shadowed contrast keys plus the arena sun remain within the provisional Quality shadow budget for Nuke Town and Terminal. This must be measured on the HITL machine.
- Principal HDR target sample requests of four for Quality and two for Performance are supported up to `renderer.capabilities.maxSamples`.

### Unknowns

- GPU frame-time and transient-memory deltas for multisampled half-float HDR on the target gaming GPU.
- Whether every target browser/device supports multisampled half-float resolves with the depth texture and current Atomic Signal validation path.
- Final target-machine WebGPU adapter/device identity, device-loss recovery and driver-compiled WGSL pipeline hashes. Authored TSL descriptor SHA-256 hashes are now emitted separately and must not be mislabeled as driver pipeline hashes.
- Pixel-mask thresholds for closed-wall luminance and open-door luminance on every arena/profile/backend.
- The retained-object and GPU-memory steady state after repeated real quality-asset arena switches; the WebGPU inspection path streams one root, while legacy gameplay intentionally retains its eager arena ownership.

### Falsifiers

- A WebGPU-required inspection preview whose `renderer.backend.isWebGPUBackend` is not exactly true, uses a software/fallback adapter, reports device loss, retains an unauthored inventory entry, or traverses a `ShaderMaterial`/`RawShaderMaterial` is blocked. Promotion of that preview to game renderer additionally requires every inventory entry to be `verified`.
- Any unselected arena module or arena-owned asset request invalidates the streaming claim.
- More than one attached presentation root, a stale aborted root attaching, or resources remaining above the frozen repeated-switch threshold invalidates the disposal claim.
- Any in-place WebGPU arena switch is blocked until a repeated-switch run produces zero GPU validation errors; current r185 behavior failed that gate, so the HITL arena selector must perform a full renderer reload.
- A closed-wall luminance increase above its frozen ROI threshold with practicals/bloom enabled invalidates light-occlusion acceptance.
- An open portal whose luminance delta collapses below its threshold, or whose movement/shot aperture becomes blocked, invalidates the leak fix.
- A Quality cabin capture that cannot see the separate BackSide ceiling, or any opaque geometry spanning the aircraft boarding gap, invalidates the roof fix.
- A principal HDR telemetry value of zero while Atomic Signal is active invalidates the offscreen-antialiasing fix.

## Implemented boundary

- `LegacyWebGlRenderRuntime` now owns creation and truthful WebGL2 adapter/canvas telemetry while exposing the unchanged concrete renderer to legacy systems.
- `WebGpuRenderRuntime` is a real async Three r185 `WebGPURenderer` plus current `RenderPipeline` owner. It awaits `init()`, records actual backend identity, watches device loss and rejects a required WebGPU request when Three falls back to WebGL2.
- `src/main.ts` is now a small backend dispatcher. Default navigation dynamically imports the behavior-preserving `src/legacy-main.ts`; `?renderer=webgpu&requireWebGPU=1` dynamically imports the separate hardware WebGPU/TSL inspection entry and never imports the legacy game chunk.
- The WebGPU route renders the selected real procedural arena through `ArenaVisualStreamController` with its deterministic cameras and a visible review control surface. It is explicitly inspection-only: no input, physics, combat or network authority is attached.
- Deterministic cameras switch in place. Arena selection updates the URL and reloads the WebGPU renderer because the in-place r185 disposal gate is red; this is an intentional fail-closed boundary, not a hidden hot-swap claim.
- All seven inventoried custom GLSL owners have real Three r185 node-graph equivalents: `SkyMesh` atmosphere, a single `RenderPipeline` HDR grade/dither graph, mist, smoke, dust, grass wind and perimeter water. Runtime compile plus scene traversal must prove all seven pipeline IDs and zero legacy shader materials before the review loop starts.
- Every graph has a canonical authored descriptor and SHA-256 receipt. These hashes prove source-graph identity, not opaque driver WGSL identity.
- `npm run qa:pass64:webgpu` is the reproducible hardware gate: it launches installed Chrome (or `PASS64_CHROME_PATH`), reloads once per arena, selects the deterministic camera, rejects software/fallback adapters and GPU/browser errors, validates one root/7 TSL/0 GLSL/4 HDR samples, and writes screenshots plus a JSON receipt under `artifacts/pass64/webgpu-tsl`.
- Bloom is disabled on the WebGPU review route until a depth-aware emissive MRT design has closed-wall evidence; this avoids reintroducing screen-space light bleeding under a cosmetic "parity" claim.
- Atomic Signal now requests bounded MSAA on the principal HDR target and reports canvas antialiasing, canvas samples, principal-HDR samples and bloom samples separately. Bloom remains intentionally single-sampled.
- Four `ArenaVisualDefinition` modules declare per-level assets, lighting/occlusion, fog, shadows, atmosphere, one HDR colour pipeline, budgets, collision identity, exceptions and deterministic cameras.
- Gotcha: `Empty floor or shell-only arena capture` → `deterministic camera placed above or outside authored enclosure` → `move the camera inside the authoritative shell and aim through gameplay landmarks` → `rerun hardware capture and visually confirm those landmarks, not only backend telemetry`.
- `ArenaVisualStreamController` dynamically imports only the selected definition, rejects undeclared resources, aborts stale generations, requires a detached candidate root, swaps one presentation root and idempotently disposes geometry, materials, textures and shadow maps.
- The stream controller is wired into the isolated WebGPU inspection route. Current WebGL gameplay continues using the behavior-preserving eager builders until collision/presentation atomic switching and asset-loader request recording have browser evidence.
- Terminal has separate inset forward/aft `BackSide` cabin-ceiling shells. The split leaves the central aircraft boarding aperture open; no blanket `DoubleSide` was added.
- Nuke Town and Terminal contrast keys are Quality-only and all active keys cast local shadows. Nuke Town's legacy unshadowed local fill PointLights now retain only emissive-source metadata at zero runtime intensity.

## Remaining cutover gates

1. Move authoritative map preparation and presentation streaming behind one generation transaction before attaching WebGPU to gameplay; preserve colliders, spawns, ballistics and network state byte-for-byte.
2. Route quality GLTF loads through the selected definition's request recorder, then prove zero unselected requests. The current WebGPU route streams selected procedural modules but does not yet consume the listed quality GLTF.
3. Replace remaining WebGL context/readback, PMREM, render-target, shadow-refresh, compile/prewarm and context-loss calls with backend adapters.
4. Add a selective emissive MRT and depth/occlusion proof before enabling WebGPU bloom. The current single HDR pipeline already owns exposure/tone map, grade, ordered dither and output transform.
5. Freeze per-arena/profile WebGL camera captures and performance measurements, then compare WebGPU/TSL at the same camera/time/seed/exposure and promote each ledger entry from `tsl-authored` to `verified` only after evidence passes.
6. Add closed-wall/open-door pixel-mask gates for Nuke Town and Terminal, then all remaining arenas.
7. Resolve or work around the observed Three r185 cached-buffer destruction failure, then run repeated in-place switch/disposal memory tests and device-loss tests on a non-software WebGPU adapter. Until then, arena changes reload the renderer.
8. Store an immutable target-machine preview receipt containing actual backend, adapter class, device-loss state, active arena/module, camera ID, descriptor hashes, measured budgets and zero legacy shader materials.

Until all gates pass, Pass 62 remains the exact-byte rollback and Pass 63 remains the current-stack comparison candidate.
