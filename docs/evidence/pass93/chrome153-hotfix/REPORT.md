# PASS 93 hotfix - Chrome 153 Tint chained swizzle, Nuke Town Rebuild will not load

Date: 2026-09-04. Machine: dave-gaming-pc. Browser: installed Chrome 153.0.8010.12,
headless, STOCK flags (no `--enable-unsafe-webgpu`, no `--enable-features`, no
`--ignore-gpu-blocklist`, no `--use-angle`). Base: live head `ce1c8f76` (PASS 92).
Branch: `contrib/dave-gaming-pc/claude/pass93-chrome153-hotfix`.

## Symptom (owner, real Chrome, PASS 92 live; PASS 91 also fails now)

Real menu -> Nuke Town Rebuild (`nuketown2`) -> Solo never reaches a live frame.

## Reproduced locally at ce1c8f76 (VERIFIED)

`npm run build` of `ce1c8f76`, `vite preview` on `127.0.0.1:4301`,
`node scripts/qa/pass93-owner-hitl-repro-stock.mjs before-ce1c8f76` (this folder,
`before-ce1c8f76-*.json`). All three profiles fail. Verbatim first console lines
(default profile; quality identical):

```
warning The powerPreference option is currently ignored when calling requestAdapter() on Windows. See https://crbug.com/369219127
error THREE.WebGPURenderer: Render pipeline creation failed (renderPipeline_RenderPipeline_25): An error occurred while generating Tint IR
error: swizzle view instruction still has usages after lowering
 - While initializing [RenderPipeline "renderPipeline_RenderPipeline_25"]
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""renderPipeline_RenderPipeline_25""]).
error THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid RenderPipeline "renderPipeline_RenderPipeline_25"] is invalid due to a previous error.
 - While encoding [RenderPassEncoder (unlabeled)].SetPipeline([Invalid RenderPipeline "renderPipeline_RenderPipeline_25"]).
 - While finishing [CommandEncoder "renderContext_3"].
error THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid CommandBuffer from CommandEncoder "renderContext_3"] is invalid due to a previous error.
 - While calling [Queue].Submit([[Invalid CommandBuffer from CommandEncoder "renderContext_3"]])
warning [atomic-acres:webgpu] recovered 1 errored pipeline(s), sweep 1
error [Nuke Town Rebuild map selection failed] Error: WebGPU queue completion failed: WebGPU uncaptured error: GPUError: [Invalid CommandBuffer from CommandEncoder "renderContext_3"] is invalid due to a previous error.
```

Max profile fails identically on a render-to-texture pipeline
(`renderPipeline_RTT_6417`, same "swizzle view instruction still has usages after
lowering"). `documentElement.dataset.tintSwizzleShim === "true"` in every run: the
existing shim WAS installed.

## Which shader (VERIFIED by capture)

A scratch Playwright init script (not committed) wrapped `navigator.gpu` underneath the
app's shim, kept every `createShaderModule` code string per module, mapped every
`createRenderPipeline(Async)` descriptor to its modules and dumped the modules of any
pipeline whose `popErrorScope` returned an error. Default profile: 119 modules, 72
pipelines, exactly one failure - `renderPipeline_RenderPipeline_25`. Its fragment
shader is beside this report as `renderPipeline_RenderPipeline_25.frag.wgsl` (the
vertex stage carries no chain).

It is the screen-space post composite Nuke Town Rebuild deploys with: the ray-traced
light graph (`src/rendering/raytracing/raytraced-light-node.ts` - `NodeBuffer_1867`
is its 24x4 `vec4` `shapeArray`; `object.nodeUniform45 * vec3<f32>( 0.35 )` is
`skyRadiance.mul(0.35)`) plus a 16-tap temporally rotated depth kernel over a `vec4`
uniform array (`NodeBuffer_1941`). The chains the shim left in place, verbatim:

```
NodeBuffer_1941.value[ i ].xyz.xy * vec2<f32>( ( 1.0 + ( NodeBuffer_1941.value[ i ].xyz.z * ( object.nodeUniform27 - 1.0 ) ) ) )
( object.nodeUniform37 * vec4<f32>( vec3<f32>( ... ), 1.0 ) ).xyz.y - object.nodeUniform47
```

A count of `.xy.x` / `.xy.y` on the captured shader is 0: the old pattern had already
rewritten every DFGLUT chain. `.xyz.xy`, `.xyz.z` and `.xyz.y` survived it.

## Why the shim missed it; whether install timing mattered

- `src/webgpu-tint-swizzle-shim.ts` rewrote only `.xy.x` and `.xy.y`, the exact shape
  three r185's DFGLUT helper emits. Chrome 153's Tint IR lowering fails on ANY chained
  swizzle, and TSL's `SplitNode.generate` emits `${nodeSnippet}.${components}` for every
  swizzle of a swizzle, so `uniformArray(...).element(i).xyz` consumed as `.xy` / `.z`
  produces chains the pattern never matched. Coverage, not timing.
- Timing was measured, not assumed: the capture recorded `gpu.__tintSwizzleShim` at the
  moment the app's `requestDevice` ran (`shimFlagAtDevice: true`; first device at
  1433 ms, first shader module at 4605 ms). The shim is installed in `legacy-main.ts`
  immediately before `WebGpuRenderRuntime.create`, the only device-creation path on the
  game route, and the `powerPreference` warning is attributed to the shim's asset in
  every run - the wrapped `requestAdapter` is the one that ran. Install order was NOT the
  failure. ("PASS 92 worked last night" is consistent with the Chrome 153 update landing
  in between; no build ever carried a rewrite for these chains.)

## The fix (pure WGSL text rewrite)

`src/webgpu-tint-swizzle-shim.ts`:

- `TINT_CHAINED_SWIZZLE_PATTERN` now matches `.<2-4 components>.<1-4 components>` in
  the xyzw, rgba and stpq families.
- `composeSwizzles(first, second)`: component k of the result is
  `first[index(second[k])]`; returns null for a chain that was never valid WGSL (index past
  the width of `first`), which is left for Tint to reject honestly.
- `rewriteChainedSwizzles` repeats the replace until the text stops changing, so any depth
  reduces (`v.xyzw.xyz.xy.x` -> `v.x`); `v.xy.x1` is an identifier, not a chain.
- The device wrapper compares rewritten text to the original instead of testing a stateful
  global regex.
- `installTintSwizzleShim()` is also called first thing in `WebGpuRenderRuntime.create`
  (`src/rendering/render-runtime.ts`), the device-creation path itself, so no caller can
  request a device ahead of the wrap; the call is idempotent and legacy-main's stamp keeps
  its meaning.

Untouched by design: the 12 s WebGPU fence, the in-combat pipeline tripwire, the
pipeline-repair sweep and the solo auto-retry semantics.

## Honest gate

- `scripts/qa/pass93-owner-hitl-repro-stock.mjs` - the stock-flags visitor probe
  (installed Chrome channel, real menu, Solo, default/quality/max); writes here.
- `tests/e2e/pass93-stock-flags-boot.spec.ts`, `npm run qa:stock-boot` - launches the
  installed Chrome channel WITHOUT the unsafe flag using its own browser (the chromium
  project fixture adds `--enable-unsafe-webgpu` under `PASS73_NATIVE_WEBGPU=1`; this
  gate must never inherit it), walks the real menu for `nuketown2` and `atomic-acres`,
  and requires a live gameplay frame, `renderBackend=webgpu`, the shim stamp, NO
  pipeline-repair sweep, zero console errors and zero page errors. It skips only when
  the Chrome channel is absent or no WebGPU device exists under stock flags, naming the
  reason. A static test pins that none of the masking flags are in its argv. The
  live-frame wait is 120 s, the same active-phase patience as
  `pass74-arena-boot-smoke.spec.ts`; measured deploy->active under stock flags is 54 s
  on nuketown2 and ~62 s on atomic-acres (a 60 s wait timed out at "MATCH STARTS IN 2").
  Against a running preview: `QA_EXTERNAL_PREVIEW=1 BASE_URL=http://127.0.0.1:<port> npm run qa:stock-boot`.
- `src/webgpu-tint-swizzle-shim.test.ts` pins the PASS 93 chains verbatim, composition
  against a concrete vector, invalid chains left alone, and the captured shader repaired
  with nothing but swizzles changed.

## Results after the fix (rebuilt dist, same preview, stock flags)

`node scripts/qa/pass93-owner-hitl-repro-stock.mjs after-shim` (`after-shim-*.json`):

```
default  ok:true liveFrame:true pageErrors:0 consoleErrors:0 consoleWarnings:1 fatalError:null
quality  ok:true liveFrame:true pageErrors:0 consoleErrors:0 consoleWarnings:1 fatalError:null
max      ok:true liveFrame:true pageErrors:0 consoleErrors:0 consoleWarnings:2 fatalError:null
EXIT 0
```

The only warning is Chrome's `powerPreference ... ignored ... on Windows` notice; no
`tintPipelineRepairs` stamp exists in any run (no repair sweep fired). A first
after-run had max at `liveFrame:false` with ZERO errors while the Playwright spec was
booting atomic-acres in a second Chrome on the same GPU (`presentedGameplayFrame: 16`,
still in warmup at 60 s); re-run alone it passed. Never run two arena boots at once.

`npx playwright test tests/e2e/pass93-stock-flags-boot.spec.ts` (external preview):

```
  ok 1 launch arguments carry none of the flags that mask Tint lowering bugs (13ms)
  ok 2 stock-flag Chrome exposes a WebGPU device, or the arena boots skip by name (2.1s)
  ok 3 nuketown2: the real menu reaches a live frame with zero pipeline errors (59.0s)
  ok 4 atomic-acres: the real menu reaches a live frame with zero pipeline errors (1.2m)
  4 passed (2.3m)
SPEC EXIT 0
```

`npx tsc --noEmit`: `TSC EXIT 0`.

`npx vitest run` over every `src/*.test.ts` matching `swizzle|tint` (13 files) plus
`src/graphics-profile-contract.test.ts`:

```
 Test Files  14 passed (14)
      Tests  167 passed (167)
```

## Claim states

- VERIFIED: failure reproduced locally at ce1c8f76 with stock flags on all three profiles.
- VERIFIED: failing shader captured; chains are `.xyz.xy` / `.xyz.z` / `.xyz.y`; shim was
  installed before the device (timing not the cause).
- VERIFIED: with the widened rewrite, nuketown2 reaches a live frame on default, quality
  and max with zero pipeline errors and no repair sweep; atomic-acres likewise in the spec.
- VERIFIED: unit tests, tsc, and the stock spec green on this machine.
- OPEN: owner HITL on the published channel in his own Chrome (this is a local build).
- OPEN: `qa:stock-boot` is wired as an npm script but not yet added to the release
  workflow / bounded-e2e groups (needs the serialized production workflow's owner).
- OPEN: the ~55-62 s deploy->active time under stock flags was not profiled here; it is
  slower than the unsafe-flag harness and worth a frame-pacing look, but it is not this
  failure.
