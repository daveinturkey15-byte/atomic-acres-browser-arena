import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * REGRESSION PIN for the real renderer bug that took MAX down.
 *
 * `WebGpuRenderRuntime.create` once called `adapter.requestDevice()` with NO
 * descriptor. WebGPU grants a device EXACTLY the optional features the caller
 * asks for — an adapter advertising a feature does not put it on the device —
 * so every optional feature was structurally absent, `THREE.SSGINode` failed
 * pipeline creation on `rg11b10ufloat-renderable`, and the resulting invalid
 * command buffer failed the whole queue submit and took arena admission down
 * with it.
 *
 * `render-runtime.test.ts` already covers the pure `selectOptionalDeviceFeatures`
 * intersection, but that helper stays green even if `create()` stops passing
 * its result to `requestDevice`. This file drives the REAL `create()` against a
 * fake `navigator.gpu` whose device grants only what the descriptor asked for —
 * the same rule the browser applies — and asserts the granted features that
 * reach `telemetry()`. It therefore fails if the descriptor is ever dropped,
 * emptied, or stops being derived from the allowlist.
 *
 * These tests assert the OUTPUT (what the device ends up holding), not merely
 * the input, which is the failure mode this project has been burned by before.
 */

type DeviceDescriptor = Readonly<{ requiredFeatures: readonly string[] }> | undefined;

type Recorder = Readonly<{
  descriptors: DeviceDescriptor[];
  /** Simulates a driver that advertises a feature and then rejects it. */
  rejectDescribedRequests?: boolean;
}>;

function fakeGpu(adapterFeatures: readonly string[], recorder: Recorder) {
  const featureSet = (names: readonly string[]) => ({ has: (name: string) => names.includes(name) });
  const makeDevice = (granted: readonly string[]) => ({
    // The browser's contract: the device holds exactly the requested optional
    // features, never everything the adapter advertised.
    features: featureSet(granted),
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
    features: featureSet(adapterFeatures),
    requestDevice: (descriptor?: Readonly<{ requiredFeatures: readonly string[] }>) => {
      recorder.descriptors.push(descriptor);
      if (descriptor && recorder.rejectDescribedRequests) {
        return Promise.reject(new Error('driver rejected an advertised feature'));
      }
      return Promise.resolve(makeDevice(descriptor ? [...descriptor.requiredFeatures] : []));
    },
    constructor: { name: 'GPUAdapter' },
  };
  return { requestAdapter: () => Promise.resolve(adapter) };
}

function stubThreeWebGpu(): void {
  vi.doMock('three/webgpu', async (importOriginal) => {
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
    // TAA's admission-only resolve quad is a real three/webgpu export. Keep
    // the rest of the module intact so this renderer-boundary mock does not
    // accidentally turn a newly imported WebGPU primitive into a missing
    // export failure.
    return { ...(await importOriginal()), WebGPURenderer, RenderPipeline };
  });
}

async function createRuntime(adapterFeatures: readonly string[], recorder: Recorder) {
  vi.resetModules();
  stubThreeWebGpu();
  vi.stubGlobal('navigator', { gpu: fakeGpu(adapterFeatures, recorder) });
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

describe('WebGPU device creation grants the optional features the renderer needs', () => {
  it('hands the allowlist to requestDevice, so the created device actually HOLDS them', async () => {
    const recorder: Recorder = { descriptors: [] };
    const { runtime, module } = await createRuntime(
      // An adapter with more than the allowlist: nothing outside it may be asked for.
      [...['rg11b10ufloat-renderable', 'float32-filterable'], 'texture-compression-bc', 'shader-f16'],
      recorder,
    );
    try {
      expect(recorder.descriptors).toHaveLength(1);
      const descriptor = recorder.descriptors[0];
      // A dropped descriptor (the original bug) makes this undefined.
      expect(descriptor, 'requestDevice must be called WITH a device descriptor').toBeDefined();
      expect([...descriptor!.requiredFeatures])
        .toEqual([...module.OPTIONAL_WEBGPU_DEVICE_FEATURES]);

      // The product, not the input: what the device ended up holding.
      const granted = runtime.telemetry('webgpu').deviceFeatures;
      expect(granted).toContain('rg11b10ufloat-renderable');
      expect(granted).toContain('float32-filterable');
      // And never a blanket copy of the adapter's feature set.
      expect(granted).not.toContain('texture-compression-bc');
      expect(granted).not.toContain('shader-f16');
    } finally {
      runtime.dispose();
    }
  });

  it('names SSGI’s render-target feature specifically, because MAX dies without it', async () => {
    const recorder: Recorder = { descriptors: [] };
    // Exactly the feature SSGI needs and nothing else.
    const { runtime } = await createRuntime(['rg11b10ufloat-renderable'], recorder);
    try {
      expect(recorder.descriptors[0]?.requiredFeatures).toEqual(['rg11b10ufloat-renderable']);
      expect(runtime.telemetry('webgpu').deviceFeatures).toEqual(['rg11b10ufloat-renderable']);
    } finally {
      runtime.dispose();
    }
  });

  it('asks for nothing when the adapter advertises nothing, instead of a rejected request', async () => {
    const recorder: Recorder = { descriptors: [] };
    const { runtime } = await createRuntime([], recorder);
    try {
      // Requesting a feature the adapter lacks makes requestDevice REJECT, so
      // the empty intersection must produce a bare request, not an empty list.
      expect(recorder.descriptors).toEqual([undefined]);
      expect(runtime.telemetry('webgpu').deviceFeatures).toEqual([]);
    } finally {
      runtime.dispose();
    }
  });

  it('falls back to a bare device when a driver rejects a feature it advertised', async () => {
    const recorder: Recorder = { descriptors: [], rejectDescribedRequests: true };
    const { runtime } = await createRuntime(['rg11b10ufloat-renderable', 'float32-filterable'], recorder);
    try {
      // First the described request, then the bare retry: a driver bug must
      // degrade the effect, never kill the whole renderer.
      expect(recorder.descriptors).toHaveLength(2);
      expect(recorder.descriptors[0]?.requiredFeatures).toEqual([
        'rg11b10ufloat-renderable',
        'float32-filterable',
      ]);
      expect(recorder.descriptors[1]).toBeUndefined();
      expect(runtime.telemetry('webgpu').deviceFeatures).toEqual([]);
    } finally {
      runtime.dispose();
    }
  });
});
