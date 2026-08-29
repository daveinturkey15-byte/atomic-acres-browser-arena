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
 * THE SHIM: `v.xy.x === v.x` and `v.xy.y === v.y` by WGSL swizzle
 * composition, so rewriting the chain at createShaderModule time is
 * semantics-preserving for every possible input vector. WGSL has no string
 * literals and three emits no comments containing the pattern, so a plain
 * textual rewrite is safe. Installed before renderer init on the WebGPU
 * route; the wrap is idempotent and degrades to a no-op wherever
 * navigator.gpu is absent.
 */

export const TINT_CHAINED_SWIZZLE_PATTERN = /\.xy\.(x|y)\b/g;

export function rewriteChainedSwizzles(code: string): string {
  return code.replace(TINT_CHAINED_SWIZZLE_PATTERN, '.$1');
}

type ShimTelemetry = { modulesRewritten: number; modulesSeen: number };

const telemetry: ShimTelemetry = { modulesRewritten: 0, modulesSeen: 0 };

export function tintSwizzleShimTelemetry(): Readonly<ShimTelemetry> {
  return { ...telemetry };
}

/** Wrap navigator.gpu so every created shader module has chained swizzles
 * flattened before Tint parses it. Must run before renderer.init(). */
export function installTintSwizzleShim(): boolean {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  if (!gpu || (gpu as { __tintSwizzleShim?: boolean }).__tintSwizzleShim) return false;
  (gpu as unknown as { __tintSwizzleShim: boolean }).__tintSwizzleShim = true;
  const requestAdapter = gpu.requestAdapter.bind(gpu);
  gpu.requestAdapter = (async (...args: Parameters<GPU['requestAdapter']>) => {
    const adapter = await requestAdapter(...args);
    if (!adapter) return adapter;
    const requestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = (async (...deviceArgs: Parameters<GPUAdapter['requestDevice']>) => {
      const device = await requestDevice(...deviceArgs);
      const wrappedDevice = device as GPUDevice & { __tintSwizzleShim?: boolean };
      if (wrappedDevice.__tintSwizzleShim) return device;
      wrappedDevice.__tintSwizzleShim = true;
      const createShaderModule = device.createShaderModule.bind(device);
      device.createShaderModule = ((descriptor: GPUShaderModuleDescriptor) => {
        telemetry.modulesSeen += 1;
        const code = descriptor.code;
        if (typeof code === 'string' && TINT_CHAINED_SWIZZLE_PATTERN.test(code)) {
          TINT_CHAINED_SWIZZLE_PATTERN.lastIndex = 0;
          telemetry.modulesRewritten += 1;
          return createShaderModule({ ...descriptor, code: rewriteChainedSwizzles(code) });
        }
        TINT_CHAINED_SWIZZLE_PATTERN.lastIndex = 0;
        return createShaderModule(descriptor);
      }) as GPUDevice['createShaderModule'];
      return device;
    }) as GPUAdapter['requestDevice'];
    return adapter;
  }) as GPU['requestAdapter'];
  return true;
}
