# Pass 64 playable WebGPU renderer foundation

Impact: `runtime`
Status: implementation candidate; not accepted and not publishable
Audited candidate base: `84726db211fbaee7d0ccf73cc1f007604d6fac7f`
Rollback oracle: immutable Pass 62 source `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`, Pages `27c90967bdaf5387c0372933c7965a60ce75a765`, nested path `channels/experimental-netcode-pass`, runtime digest `035e868ad80a7d81aeac6a08c17db4123feb6a1343f1b8eb24bbd8b1971c1d5d`

Pass 62 remains byte-exact and is not rebuilt through Pass 64 renderer code. Pass 63 remains Live until Dave approves an immutable Pass 64 preview.

## Current architecture

- The normal route is the complete playable game on fail-closed hardware WebGPU. It uses the existing gameplay scene, physics, bots, weapons, multiplayer and HUD; it is not a disconnected visual forge.
- `?renderer=webgl2` is the explicit compatibility renderer. It is not evidence that the required WebGPU route passed.
- `WebGpuRenderRuntime` owns WebGPU initialization, backend/adapter/device proof, frame submission, compile/prewarm, sizing, render telemetry, target readback, shadow controls, queue fences and disposal. `LegacyWebGlRenderRuntime` owns the matching WebGL operations.
- `legacy-main.ts` remains an oversized gameplay coordinator, but it no longer casts the WebGPU renderer to `THREE.WebGLRenderer` or directly submits/compiles/reads WebGPU frames. Further gameplay-coordinator decomposition is cleanup, not permission to move renderer ownership back.
- The WebGPU scene traverses zero `ShaderMaterial` or `RawShaderMaterial` instances. Seven former GLSL owners have TSL/node replacements: sky, HDR grade/dither, mist, smoke, dust, grass and water.
- One `ArenaVisualDefinition` exists for Nuke Town, Terminal, RustRig and Gun Range. The selected gameplay root is the sole authoritative presentation root; selected quality GLB requests are validated against and recorded on that definition's generation receipt.
- The WebGPU HDR scene target requests four samples. The TSL graph owns grade and ordered dither; CSS colour-grade, film-grain and vignette overlays are disabled on WebGPU so post processing is not stacked.
- Review cameras apply pose, projection, exposure, fixed TSL time, seed and HUD policy. The active values are exposed in the playable-scene receipt.
- Nuke Town and Terminal local contrast lights are shadowed; unshadowed local fills are removed or emissive-only. Terminal uses split BackSide cabin-ceiling shells and preserves the boarding aperture.

## Evidence already established on the audited base

The exact clean-source hardware receipt under `artifacts/pass64/playable-webgpu/hardware-webgpu-playable-receipt.json` established:

- actual NVIDIA/Blackwell WebGPU with no fallback or device loss;
- one gameplay scene and one authoritative selected arena root;
- all four arenas rendered with zero traversed legacy shader materials and seven TSL pipeline identities;
- four principal HDR samples and successful target readback;
- one successful in-place switch sequence across all four arenas;
- a real two-peer host/client WebGPU match;
- Nuke Town and Terminal fixed-camera wall/opening captures;
- per-arena CPU frame, queue-completion proxy, draw, triangle, texture, transient, shadow and post budgets.

Any runtime change after that receipt, including this ownership/determinism correction, requires a new exact-SHA hardware receipt before HITL.

## Remaining release gates

1. Rerun the complete hardware WebGPU matrix on the final clean candidate and bind screenshots, diagnostics and receipt to its exact SHA.
2. Add same-camera effects-off/effects-on bloom and practical-light deltas. The current depth-discontinuity guard and wall/opening captures are useful evidence but are not a depth-tested emissive MRT extraction.
3. Capture every deterministic review camera, assemble an exact-candidate arena contact sheet and apply explicit luminance/readability and asset-outlier gates. RustRig night readability requires special scrutiny.
4. Run repeated multi-cycle arena switching with retained object, texture, render-target and GPU-memory settling measurements. One clean switch circuit is not a steady-state memory proof.
5. Route any future arena-owned texture/model loader through the selected definition recorder; an empty request ledger must mean no arena-owned request, not missing instrumentation.
6. Continue decomposing the 12k-line gameplay coordinator without changing gameplay/network authority or weakening existing verification.
7. Do not add `acceptance/pass-64.json`, merge, publish or describe Pass 64 as accepted until Dave approves the exact immutable preview and all required hosted gates pass.

## Falsifiers

- WebGPU request resolves to WebGL, a software adapter, device loss or missing backend proof.
- Any active legacy shader material appears on the required route.
- CSS grade/grain/vignette overlays remain visible while the TSL HDR pipeline is active.
- More than one arena presentation root is attached or an unselected arena-owned asset is requested.
- Review-camera fixed time, seed, exposure or HUD telemetry differs from the selected definition.
- A solid-wall effects delta breaches its fixed threshold, an open portal loses readable light, or Terminal's cabin roof/boarding geometry fails parity.
- Repeated switching emits GPU validation errors or fails to return near the frozen resource baseline.
- A dark, occluded or placeholder-heavy contact-sheet frame is accepted solely because structural telemetry is green.
