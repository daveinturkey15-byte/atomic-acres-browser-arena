import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * REGRESSION PIN for the High Seas boot failure.
 *
 * WebGPU does not give a device the adapter's capabilities. An unrequested
 * limit is granted at the SPEC DEFAULT, not at what the hardware can do.
 * `WebGpuRenderRuntime.create` asked for a device with no `requiredLimits`, so
 * every device this game created was capped at the default 16 sampled textures
 * per shader stage while the adapter advertised more. The High Seas fragment
 * stage binds 17, and the browser rejected the bind group:
 *
 *   "The number of sampled textures (17) in the Fragment stage exceeds the
 *    maximum per-stage limit (16). This adapter supports a higher
 *    maxSampledTexturesPerShaderStage"
 *
 * The rejected bind group cascaded into an invalid CommandBuffer, the queue
 * submit failed, `performArenaSelection` threw and rolled the player back to
 * the previously prepared arena — so the map simply never loaded.
 *
 * This is the same defect class as `render-runtime-device-features.test.ts`
 * pins on the FEATURE axis, and it is pinned the same way: against the real
 * `create()`, so the helper staying green cannot hide `create()` dropping the
 * descriptor.
 */

type DeviceDescriptor = Readonly<{
  requiredFeatures?: readonly string[];
  requiredLimits?: Readonly<Record<string, number>>;
}> | undefined;

type Recorder = {
  descriptors: DeviceDescriptor[];
  /**
   * Simulates the browser's own rule: a device request asking for MORE than the
   * adapter exposes is rejected. Used to prove the fallback ladder still yields
   * a device instead of killing the renderer.
   */
  rejectLimitRequests?: boolean;
};

const ADAPTER_LIMITS = Object.freeze({
  maxSampledTexturesPerShaderStage: 32,
  maxSamplersPerShaderStage: 24,
  maxTextureDimension2D: 16_384,
});

function fakeGpu(recorder: Recorder, limits: Record<string, unknown> | undefined) {
  const featureSet = (names: readonly string[]) => ({ has: (name: string) => names.includes(name) });
  const makeDevice = () => ({
    features: featureSet([]),
    lost: new Promise<never>(() => {}),
    queue: { onSubmittedWorkDone: () => Promise.resolve() },
    addEventListener: () => {},
    removeEventListener: () => {},
    destroy: () => {},
    constructor: { name: 'GPUDevice' },
  });
  const adapter = {
    info: { vendor: 'nvidia', architecture: 'blackwell', device: 'RTX 5080' },
    isFallbackAdapter: false,
    // No optional features, so this file isolates the LIMITS axis.
    features: featureSet([]),
    limits,
    requestDevice: (descriptor?: DeviceDescriptor) => {
      recorder.descriptors.push(descriptor);
      if (descriptor?.requiredLimits && recorder.rejectLimitRequests) {
        return Promise.reject(new Error('driver rejected an advertised limit'));
      }
      return Promise.resolve(makeDevice());
    },
    constructor: { name: 'GPUAdapter' },
  };
  return { requestAdapter: () => Promise.resolve(adapter) };
}

function stubThreeWebGpu(): void {
  vi.doMock('three/webgpu', () => {
    class WebGPURenderer {
      backend = { isWebGPUBackend: true };
      info = { reset: () => {}, render: { drawCalls: 0, triangles: 0, points: 0, lines: 0 } };
      shadowMap = { enabled: false };
      constructor(public readonly parameters: Record<string, unknown>) {}
      init(): Promise<void> { return Promise.resolve(); }
      dispose(): void {}
    }
    class RenderPipeline {
      outputNode: unknown = null;
      outputColorTransform = true;
      needsUpdate = false;
      constructor(public readonly renderer: unknown) {}
      render(): void {}
      dispose(): void {}
    }
    return { WebGPURenderer, RenderPipeline };
  });
}

/** Pass `null` for an adapter that reports no limits at all. */
async function createRuntime(recorder: Recorder, limits?: Record<string, unknown> | null) {
  vi.resetModules();
  stubThreeWebGpu();
  vi.stubGlobal('navigator', {
    gpu: fakeGpu(recorder, limits === undefined ? { ...ADAPTER_LIMITS } : (limits ?? undefined)),
  });
  const module = await import('./render-runtime');
  const runtime = await module.WebGpuRenderRuntime.create({
    canvas: {} as unknown as HTMLCanvasElement,
    antialias: true,
    samples: 4,
    requireWebGPU: true,
  });
  return { runtime, module };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('three/webgpu');
  vi.resetModules();
});

describe('selectInheritedDeviceLimits (pure)', () => {
  it('reads each named limit off the adapter', async () => {
    const module = await import('./render-runtime');
    expect(module.selectInheritedDeviceLimits(ADAPTER_LIMITS)).toEqual({
      maxSampledTexturesPerShaderStage: 32,
      maxSamplersPerShaderStage: 24,
    });
  });

  it('never invents a limit the adapter does not report', async () => {
    const module = await import('./render-runtime');
    // Requesting a limit the adapter lacks makes requestDevice reject outright,
    // which would turn extra headroom into a dead renderer.
    expect(module.selectInheritedDeviceLimits({ maxSampledTexturesPerShaderStage: 32 })).toEqual({
      maxSampledTexturesPerShaderStage: 32,
    });
    expect(module.selectInheritedDeviceLimits(undefined)).toEqual({});
    expect(module.selectInheritedDeviceLimits({})).toEqual({});
  });

  it('ignores values that are not usable positive numbers', async () => {
    const module = await import('./render-runtime');
    expect(module.selectInheritedDeviceLimits({
      maxSampledTexturesPerShaderStage: Number.NaN,
      maxSamplersPerShaderStage: 0,
    })).toEqual({});
  });

  it('names the limit High Seas actually needed', async () => {
    const module = await import('./render-runtime');
    expect(module.INHERITED_WEBGPU_DEVICE_LIMITS).toContain('maxSampledTexturesPerShaderStage');
  });
});

describe('WebGPU device creation inherits the adapter binding limits', () => {
  it('asks requestDevice for the adapter values, not the spec defaults', async () => {
    const recorder: Recorder = { descriptors: [] };
    const { runtime } = await createRuntime(recorder);
    try {
      expect(recorder.descriptors).toHaveLength(1);
      const descriptor = recorder.descriptors[0];
      expect(descriptor, 'requestDevice must be called WITH a device descriptor').toBeDefined();
      // The original bug: no requiredLimits at all, so the device silently got 16.
      expect(
        descriptor!.requiredLimits,
        'requestDevice must carry requiredLimits or the device is capped at the spec default',
      ).toBeDefined();
      expect(descriptor!.requiredLimits!.maxSampledTexturesPerShaderStage).toBe(32);
      expect(descriptor!.requiredLimits!.maxSamplersPerShaderStage).toBe(24);
      // High Seas binds 17; a device granted the default 16 is the whole defect.
      expect(descriptor!.requiredLimits!.maxSampledTexturesPerShaderStage).toBeGreaterThan(16);
      // Only the named limits travel — never a blanket copy of adapter.limits.
      expect(Object.keys(descriptor!.requiredLimits!).sort())
        .toEqual(['maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage']);
    } finally {
      runtime.dispose();
    }
  });

  it('still yields a device when a driver rejects the limits it advertised', async () => {
    const recorder: Recorder = { descriptors: [], rejectLimitRequests: true };
    const { runtime } = await createRuntime(recorder);
    try {
      // Degrades rather than killing the renderer: the limited request is tried
      // first, then a bare one. Same courtesy the feature request already had.
      expect(recorder.descriptors.length).toBeGreaterThanOrEqual(2);
      expect(recorder.descriptors[0]?.requiredLimits).toBeDefined();
      expect(recorder.descriptors[recorder.descriptors.length - 1]?.requiredLimits).toBeUndefined();
      expect(runtime, 'a rejected limit request must not kill the renderer').toBeDefined();
    } finally {
      runtime.dispose();
    }
  });

  it('omits the descriptor entirely on an adapter that reports no limits', async () => {
    const recorder: Recorder = { descriptors: [] };
    const { runtime } = await createRuntime(recorder, null);
    try {
      expect(recorder.descriptors).toHaveLength(1);
      expect(recorder.descriptors[0]?.requiredLimits).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
});
