/**
 * webgpu-tint-swizzle-shim.ts - Chrome 153 Tint chained-swizzle workaround.
 *
 * ROOT CAUSE (measured 2026-08-29, deterministic local repro without
 * --enable-unsafe-webgpu): three r185's DFGLUT helper returns
 * `texture(lut, uv).rg`; every consumer then reads `.x`/`.y` off that node,
 * and the WGSL builder emits CHAINED swizzles - `nodeVar30.xy.x` (36 of
 * each in one captured fragment shader, artifacts/qa/tint-swizzle/). Chrome
 * 153's new Tint IR lowering fails exactly there: "swizzle view instruction
 * still has usages after lowering". Every material lit through GGX
 * multiscatter (MeshStandard/MeshPhysical/NodeMaterial alike) dies on BOTH
 * the sync and async pipeline paths, so retries could never save a session
 * (the earlier "timing race" reading was an artifact of QA harnesses running
 * with --enable-unsafe-webgpu, which changes Tint's lowering and masks the
 * bug).
 *
 * PASS 93 (measured 2026-09-04, stock-flag installed Chrome 153.0.8010.12,
 * docs/evidence/pass93/chrome153-hotfix/): the shim above only knew the
 * `.xy.x` / `.xy.y` shape. The screen-space post composite that Nuke Town
 * Rebuild deploys with (ray-traced light node + a 16-tap rotated depth
 * kernel) emits `NodeBuffer_1941.value[ i ].xyz.xy`, `... .xyz.z` and
 * `( mat4 * vec4 ).xyz.y` - three chains the narrow pattern left in place,
 * and Tint fails the SAME way on any chained swizzle, not only the DFGLUT
 * one. renderPipeline_RenderPipeline_25 failed on every graphics profile and
 * the owner could not load the arena. The shim WAS installed before the
 * device was requested (measured: the navigator.gpu flag was set when
 * requestDevice ran), so install timing was not the failure - coverage was.
 *
 * THE SHIM: for any swizzle chain `v.<a>.<b>` where `<a>` has 2-4 components
 * and `<b>` 1-4, `v.<a>.<b>` === `v.<compose(a,b)>` by WGSL swizzle
 * composition (component k of the result is component b[k] of `v.<a>`, which
 * is component a[b[k]] of `v`). Composition is exact for every vector width
 * on which the chain was valid to begin with, and chains of any depth reduce
 * by repeating the rewrite until it no longer changes the text. WGSL has no
 * string literals and three emits no comments containing the pattern, so a
 * plain textual rewrite is safe. Installed before renderer init on the
 * WebGPU route (legacy-main, navigator.gpu wrap) AND on the exact device
 * WebGpuRenderRuntime.create negotiates (device wrap, after requestDevice),
 * so no device creation path can miss it while adapter/device negotiation
 * stays observable; both wraps are idempotent and degrade to a no-op
 * wherever navigator.gpu or createShaderModule is absent.
 */

const SWIZZLE_FAMILIES = ['xyzw', 'rgba', 'stpq'] as const;

/** `.<2-4 components>.<1-4 components>` - one link of a swizzle chain. */
export const TINT_CHAINED_SWIZZLE_PATTERN =
  /\.([xyzw]{2,4}|[rgba]{2,4}|[stpq]{2,4})\.([xyzw]{1,4}|[rgba]{1,4}|[stpq]{1,4})\b/g;

function componentIndex(component: string): number {
  for (const family of SWIZZLE_FAMILIES) {
    const index = family.indexOf(component);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Compose two swizzles applied in sequence: `v.first.second` -> `v.<result>`.
 * Returns null when the chain was never valid WGSL (an index past `first`'s
 * width), in which case the text is left for Tint to reject honestly.
 */
export function composeSwizzles(first: string, second: string): string | null {
  let composed = '';
  for (const component of second) {
    const index = componentIndex(component);
    if (index < 0 || index >= first.length) return null;
    composed += first[index];
  }
  return composed;
}

export function rewriteChainedSwizzles(code: string): string {
  let previous: string;
  let current = code;
  do {
    previous = current;
    current = current.replace(TINT_CHAINED_SWIZZLE_PATTERN, (match: string, first: string, second: string) => {
      const composed = composeSwizzles(first, second);
      return composed === null ? match : `.${composed}`;
    });
  } while (current !== previous);
  return current;
}

type ShimTelemetry = { modulesRewritten: number; modulesSeen: number };

const telemetry: ShimTelemetry = { modulesRewritten: 0, modulesSeen: 0 };

export function tintSwizzleShimTelemetry(): Readonly<ShimTelemetry> {
  return { ...telemetry };
}

type ShimmedGpu = { __tintSwizzleShim?: boolean };

/** True once navigator.gpu has been wrapped in this document. */
export function isTintSwizzleShimInstalled(): boolean {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  return Boolean(gpu && (gpu as ShimmedGpu).__tintSwizzleShim);
}

type ShimmedDevice = { __tintSwizzleShim?: boolean; createShaderModule?: unknown };

/**
 * Wrap `createShaderModule` on ONE device object so every shader module it
 * creates has chained swizzles flattened before Tint parses it. This is the
 * whole workaround; the navigator.gpu wrap below only exists to reach devices
 * this module never sees. Applied by WebGpuRenderRuntime.create to the exact
 * device it negotiated, after requestDevice returned - so adapter and device
 * negotiation stays untouched and observable (device-feature tests inject a
 * fake gpu and spy on requestDevice), and a device without createShaderModule
 * (a test fake) is simply left alone. Returns true when this call wrapped it.
 */
export function installTintSwizzleShimOnDevice(device: unknown): boolean {
  const shimmed = device as ShimmedDevice | null | undefined;
  if (!shimmed || shimmed.__tintSwizzleShim || typeof shimmed.createShaderModule !== 'function') return false;
  shimmed.__tintSwizzleShim = true;
  const gpuDevice = device as GPUDevice;
  const createShaderModule = gpuDevice.createShaderModule.bind(gpuDevice);
  gpuDevice.createShaderModule = ((descriptor: GPUShaderModuleDescriptor) => {
    telemetry.modulesSeen += 1;
    const code = descriptor.code;
    if (typeof code === 'string') {
      const rewritten = rewriteChainedSwizzles(code);
      if (rewritten !== code) {
        telemetry.modulesRewritten += 1;
        return createShaderModule({ ...descriptor, code: rewritten });
      }
    }
    return createShaderModule(descriptor);
  }) as GPUDevice['createShaderModule'];
  return true;
}

/** Wrap navigator.gpu so every device it hands out gets the shim above.
 * Must run before renderer.init(); returns true when this call performed the
 * wrap, false when it was already in place or there is no navigator.gpu. */
export function installTintSwizzleShim(): boolean {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  if (!gpu || (gpu as ShimmedGpu).__tintSwizzleShim || typeof gpu.requestAdapter !== 'function') return false;
  (gpu as unknown as { __tintSwizzleShim: boolean }).__tintSwizzleShim = true;
  const requestAdapter = gpu.requestAdapter.bind(gpu);
  gpu.requestAdapter = (async (...args: Parameters<GPU['requestAdapter']>) => {
    const adapter = await requestAdapter(...args);
    if (!adapter || typeof adapter.requestDevice !== 'function') return adapter;
    const requestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = (async (...deviceArgs: Parameters<GPUAdapter['requestDevice']>) => {
      const device = await requestDevice(...deviceArgs);
      installTintSwizzleShimOnDevice(device);
      return device;
    }) as GPUAdapter['requestDevice'];
    return adapter;
  }) as GPU['requestAdapter'];
  return true;
}
