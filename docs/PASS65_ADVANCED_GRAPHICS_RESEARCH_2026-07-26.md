# Pass 65 Advanced Graphics research and implementation map

Date: 2026-07-26
Scope: browser WebGPU presentation only; gameplay and network authority are invariant.

## Source-backed product pattern

Cyberpunk 2077 is useful here as a product-design reference, not as a claim of technical parity. Its official material separates broad configuration choices from expensive specialist paths:

- [Update 2.1 patch notes](https://www.cyberpunk.net/en/news/49597/update-2-1-patch-notes) document a resolution-scaling mode selector, dynamic resolution, DLSS/FSR/XeSS choices, Ray Reconstruction and RT Overdrive changes.
- [CD Projekt Red's Overdrive requirements](https://support.cdprojektred.com/en/cyberpunk/pc/sp-technical/issue/2383/path-tracing-overdrive-mode-requirements-how-to) state that path tracing is very GPU intensive, is off by default, and has specific hardware requirements.
- [Cyberpunk 2077 system requirements](https://support.cdprojektred.com/en/cyberpunk%20/pc/sp-technical/issue/1556/cyberpunk-2077-system-requirements) make the performance target and hardware tier explicit rather than presenting one universal quality claim.
- [NVIDIA's Ray Reconstruction explanation](https://www.nvidia.com/en-us/geforce/news/gfecnt/20238/nvidia-dlss-3-5-ray-reconstruction/) and [full ray-tracing overview](https://www.nvidia.com/en-us/geforce/news/dlss-3-5-cyberpunk-2077-phantom-liberty-available-now/) describe native vendor features. These cannot be represented honestly as browser toggles.
- The official [Three.js WebGPU renderer manual](https://threejs.org/manual/en/webgpurenderer) and [TSL reference](https://threejs.org/docs/TSL.html) establish the renderer and node/post-processing surface available to this project. Upstream availability alone is not an arena-quality or performance receipt.

The Pass 65 translation is therefore:

1. Keep the ordinary choice fast: `QUALITY` is the default, `PERFORMANCE` is the reduced presentation, and any advanced edit becomes `CUSTOM`.
2. Put specialist controls in one collapsed `ADVANCED GRAPHICS` catalog.
3. Implement a control only when it reaches a real runtime owner.
4. Show attractive but unavailable paths as disabled explanations. Do not simulate DLSS, frame generation, ray reconstruction, path tracing or hardware RT with labels.
5. Keep every setting presentation-only. Performance and Quality must have identical collision, destruction authority, smoke authority, ballistics, spawn topology and network state.

## Canonical option-to-runtime matrix

`src/graphics-settings-registry.ts` is the only option registry. It generates the controls and preset fields, supplies normalization metadata, names a runtime consumer, and is cross-checked by the settings and renderer inventories.

| Player option | Implemented runtime effect | Evidence owner |
|---|---|---|
| Render scale | 50-125% framebuffer scale | adaptive quality and renderer resize |
| Adaptive quality / target | Sustained frame-time workload control, 30-360 FPS target | adaptive quality controller |
| Maximum FPS | Phase-preserving 30-360 FPS or uncapped presentation scheduler | Pass 65 settings and main frame loop |
| Anti-aliasing | 1, 2 or 4 samples on the principal HDR target | WebGPU renderer and TSL scene pass |
| Geometry detail | Reduced/full presentation stream with unchanged gameplay geometry | render profile / arena stream |
| Shadows | Off/on, 1024/2048 map, static/dynamic update schedule | render runtime and light schedule |
| Indirect light | Scales authored hemisphere, ambient and fill contribution | arena lighting |
| Specular response | Scales PBR environment and material response | graphics refinement |
| Volumetrics | Scales deterministic mist/smoke/dust opacity and draw ranges | TSL atmosphere |
| Smoke presentation | One/two/three cards with a nonzero visibility floor | semantic smoke pool |
| Particles and decals | Independent bounded density/lifetime budget scaling | impact presentation budget |
| Texture filtering | 1x-16x request clamped to GPU maximum | graphics refinement |
| Bloom | Off/subtle/cinematic strength in the depth-aware HDR graph | TSL post graph |
| Exposure / tone mapping | Per-arena exposure multiplier plus ACES/AgX/Neutral output | render runtime |
| Film grain / vignette | Bounded TSL post nodes; zero gives zero visual contribution | TSL post graph |

All advanced changes intentionally rebuild the arena renderer. This keeps target allocations, streamed presentation roots and post nodes consistent and makes persistence/read-back easy to verify.

## Explicit unsupported gaps

The menu surfaces the reason for each unavailable path:

- hardware ray tracing and path tracing: no browser/Three.js acceleration-structure implementation;
- SSGI and SSR: upstream experimental nodes have not passed normal/depth/MRT, temporal, disposal and representative-hardware gates;
- depth of field: first-person weapon depth, focus transitions and accessibility are unverified;
- motion blur: no verified velocity MRT or reduced-motion contract;
- vendor AI upscaling, Ray Reconstruction and frame generation: native vendor APIs are outside this browser renderer.

An unavailable row consumes no GPU resource and is not persisted as a fake setting. A future addition must enter the typed registry, name a runtime consumer, update the renderer feature inventory, and pass normalization, persistence, target-allocation, disposal, visual and performance gates before it becomes selectable.
