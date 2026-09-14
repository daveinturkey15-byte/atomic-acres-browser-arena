import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attachWebGpuDiagnostics,
  collectWebGpuDiagnostics,
  deriveWebGpuNextSteps,
  formatWebGpuDiagnostics,
  observeWebGl2,
  webGpuDiagnosticsFromError,
  type DiagnosticsEnvironment,
} from './webgpu-adapter-diagnostics';
import { presentWebGpuDiagnostics, WEBGPU_DIAGNOSTICS_ELEMENT_ID } from './webgpu-diagnostics-screen';
import { WebGpuRenderRuntime } from './render-runtime';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type GlStub = Readonly<{ renderer?: string; vendor?: string; debugExtension?: boolean }>;

/** A WebGL2 context that answers the two parameter pairs the collector reads. */
function webGl2Stub(stub: GlStub) {
  const exposed = stub.debugExtension !== false;
  return {
    getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' && exposed ? {} : null),
    getParameter: (parameterName: number) => {
      if (parameterName === 0x9246 || parameterName === 0x1f01) return stub.renderer ?? null;
      if (parameterName === 0x9245 || parameterName === 0x1f00) return stub.vendor ?? null;
      return null;
    },
  };
}

function environment(overrides: Partial<DiagnosticsEnvironment> = {}): DiagnosticsEnvironment {
  return {
    gpu: { requestAdapter: async () => null },
    createWebGl2Context: () => webGl2Stub({ renderer: 'NVIDIA GeForce RTX 5090', vendor: 'NVIDIA' }),
    isSecureContext: true,
    crossOriginIsolated: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0',
    brands: ['Google Chrome 153', 'Chromium 153'],
    platform: 'Windows',
    probeTimeoutMs: 50,
    ...overrides,
  };
}

describe('the failure screen reports every observation it claims to', () => {
  it('names navigator.gpu, all three adapter hints, the WebGL renderer, the context flags and the browser', async () => {
    const report = await collectWebGpuDiagnostics(environment({
      createWebGl2Context: () => webGl2Stub({ renderer: 'ANGLE (NVIDIA GeForce RTX 5090 Direct3D11)', vendor: 'Google Inc. (NVIDIA)' }),
    }));
    const block = formatWebGpuDiagnostics(report);

    // Every claim the brief makes about this block, asserted as text a player
    // could read - not as internal fields.
    expect(block).toContain('navigator.gpu: present');
    expect(block).toContain("requestAdapter({ powerPreference: 'high-performance' })");
    expect(block).toContain("requestAdapter({ powerPreference: 'low-power' })");
    expect(block).toContain('requestAdapter() unhinted');
    expect(block).toContain('WebGL2 context: created');
    expect(block).toContain('WebGL2 UNMASKED_RENDERER_WEBGL: ANGLE (NVIDIA GeForce RTX 5090 Direct3D11)');
    expect(block).toContain('WebGL2 UNMASKED_VENDOR_WEBGL: Google Inc. (NVIDIA)');
    expect(block).toContain('WEBGL_debug_renderer_info: exposed');
    expect(block).toContain('isSecureContext: true');
    expect(block).toContain('crossOriginIsolated: false');
    expect(block).toContain('browser: Google Chrome 153, Chromium 153');
    expect(block).toContain('platform: Windows');
    expect(block).toContain('userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0');
    expect(block).toContain('WHAT TO TRY');

    // Each hint is reported separately, because WHICH ones fail is the diagnosis.
    expect(report.adapterProbes.map((probe) => probe.hint)).toEqual(['high-performance', 'low-power', 'unhinted']);
  });

  it('asks each powerPreference separately and records their answers independently', async () => {
    const asked: Array<string | undefined> = [];
    const report = await collectWebGpuDiagnostics(environment({
      gpu: {
        requestAdapter: async (options?: { powerPreference?: string }) => {
          asked.push(options?.powerPreference);
          return options?.powerPreference === 'low-power'
            ? { info: { vendor: 'intel', architecture: 'xe' } }
            : null;
        },
      },
    }));
    expect(asked).toEqual(['high-performance', 'low-power', undefined]);
    expect(report.adapterProbes.map((probe) => probe.outcome)).toEqual(['null', 'adapter', 'null']);
    expect(formatWebGpuDiagnostics(report)).toContain('intel xe');
  });

  it('reads the masked strings and says so when WEBGL_debug_renderer_info is absent', () => {
    const observation = observeWebGl2(environment({
      createWebGl2Context: () => webGl2Stub({ renderer: 'WebKit WebGL', vendor: 'WebKit', debugExtension: false }),
    }));
    expect(observation.debugRendererInfoExposed).toBe(false);
    expect(observation.renderer).toBe('WebKit WebGL');
  });

  it('records a WebGL2 context that cannot be created at all', () => {
    const observation = observeWebGl2(environment({ createWebGl2Context: () => null }));
    expect(observation.contextCreated).toBe(false);
    expect(formatWebGpuDiagnostics({
      navigatorGpuPresent: true,
      adapterProbes: [],
      anyAdapterAcquired: false,
      webgl2: observation,
      softwareRasteriser: false,
      secureContext: true,
      crossOriginIsolated: false,
      browser: 'test',
      platform: 'test',
      userAgent: 'test',
    })).toContain('WebGL2 context: NOT created');
  });
});

describe('the advice is derived from the observations, never a generic list', () => {
  it('blames the browser, not the game, when WebGL falls back to a software rasteriser', async () => {
    const report = await collectWebGpuDiagnostics(environment({
      createWebGl2Context: () => webGl2Stub({
        renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
        vendor: 'Google Inc. (Google)',
      }),
    }));
    expect(report.softwareRasteriser).toBe(true);
    const steps = deriveWebGpuNextSteps(report).join(' ');
    expect(steps).toContain('software renderer');
    expect(steps).toContain('chrome://settings/system');
    expect(steps).toContain('not a problem with the game');
    // The GPU-process advice would be wrong here: there is no working GPU in
    // this browser to lose.
    expect(steps).not.toContain('running on a real GPU');
  });

  it('blames the running browser instance when WebGL has a real GPU but no adapter is offered', async () => {
    const report = await collectWebGpuDiagnostics(environment());
    expect(report.softwareRasteriser).toBe(false);
    const steps = deriveWebGpuNextSteps(report).join(' ');
    expect(steps).toContain('NVIDIA GeForce RTX 5090');
    expect(steps).toContain('Quit the browser COMPLETELY');
    expect(steps).toContain('Guest window');
    // Telling him to switch acceleration on would be advice the observations
    // contradict: acceleration is demonstrably working.
    expect(steps).not.toContain('chrome://settings/system');
  });

  it('blames the browser or its version when navigator.gpu is missing, and gives no adapter advice', async () => {
    const report = await collectWebGpuDiagnostics(environment({ gpu: null }));
    expect(report.adapterProbes).toHaveLength(0);
    const steps = deriveWebGpuNextSteps(report);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toContain('does not expose WebGPU at all');
    expect(steps.join(' ')).not.toContain('adapter');
    expect(formatWebGpuDiagnostics(report)).toContain('adapter requests: not attempted');
  });

  it('names the secure context when that is why navigator.gpu is missing', async () => {
    const report = await collectWebGpuDiagnostics(environment({ gpu: null, isSecureContext: false }));
    const steps = deriveWebGpuNextSteps(report).join(' ');
    expect(steps).toContain('not a secure context');
    expect(steps).toContain('https://');
    expect(steps).not.toContain('113 or newer');
  });

  it('calls the failure transient when a re-probe does get an adapter', async () => {
    const report = await collectWebGpuDiagnostics(environment({
      gpu: { requestAdapter: async () => ({ info: { vendor: 'nvidia', architecture: 'blackwell' } }) },
    }));
    expect(report.anyAdapterAcquired).toBe(true);
    const steps = deriveWebGpuNextSteps(report);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toContain('transient');
    expect(steps[0]).toContain('Ctrl+Shift+R');
  });

  it('surfaces a requestAdapter that throws rather than returning null', async () => {
    const report = await collectWebGpuDiagnostics(environment({
      gpu: {
        requestAdapter: async () => {
          throw new Error('GPU process crashed');
        },
      },
    }));
    expect(report.adapterProbes.every((probe) => probe.outcome === 'error')).toBe(true);
    const block = formatWebGpuDiagnostics(report);
    expect(block).toContain('threw GPU process crashed');
    expect(block).toContain("browser's own WebGPU");
  });

  it('bounds a requestAdapter that never answers instead of hanging the failure screen', async () => {
    const report = await collectWebGpuDiagnostics(environment({
      gpu: { requestAdapter: () => new Promise(() => undefined) },
      probeTimeoutMs: 10,
    }));
    expect(report.adapterProbes.map((probe) => probe.detail)).toEqual([
      'no answer within 10 ms',
      'no answer within 10 ms',
      'no answer within 10 ms',
    ]);
  });

  it('never says cross-origin isolation is required, because it is not', async () => {
    const report = await collectWebGpuDiagnostics(environment());
    expect(formatWebGpuDiagnostics(report)).toContain('crossOriginIsolated: false (not required for WebGPU');
    expect(deriveWebGpuNextSteps(report).join(' ')).not.toContain('crossOriginIsolated');
  });
});

describe('the diagnostic block is produced on failure and only on failure', () => {
  const gpuStub = (requestAdapter: (options?: { powerPreference?: string }) => Promise<unknown>) => {
    const calls: Array<{ powerPreference?: string } | undefined> = [];
    return {
      calls,
      gpu: {
        requestAdapter: (options?: { powerPreference?: string }) => {
          calls.push(options);
          return requestAdapter(options);
        },
      },
    };
  };

  it('gathers and attaches a report when no adapter can be acquired', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { calls, gpu } = gpuStub(async () => null);
    vi.stubGlobal('navigator', { gpu, userAgent: 'test-agent' });

    const failure = await WebGpuRenderRuntime.create({
      canvas: {} as HTMLCanvasElement,
      antialias: false,
      samples: 1,
      requireWebGPU: true,
    }).then(() => null, (error: unknown) => error);

    // The honest failure the player already had is untouched...
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('WebGPU was required, but no GPU adapter was available at all');
    // ...and now it carries what the page could observe.
    const report = webGpuDiagnosticsFromError(failure);
    expect(report).not.toBeNull();
    expect(report?.navigatorGpuPresent).toBe(true);
    expect(report?.adapterProbes.map((probe) => probe.hint)).toEqual(['high-performance', 'low-power', 'unhinted']);
    // Two acquisition attempts, then one probe per hint.
    expect(calls).toHaveLength(5);
    expect(consoleError).toHaveBeenCalled();
  });

  it('attaches a report when the browser exposes no navigator.gpu at all', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', { userAgent: 'test-agent' });
    const failure = await WebGpuRenderRuntime.create({
      canvas: {} as HTMLCanvasElement,
      antialias: false,
      samples: 1,
      requireWebGPU: true,
    }).then(() => null, (error: unknown) => error);
    expect((failure as Error).message).toBe('WebGPU was required, but navigator.gpu is unavailable');
    expect(webGpuDiagnosticsFromError(failure)?.navigatorGpuPresent).toBe(false);
  });

  it('costs an acquired adapter nothing: no probes, no report, no console receipt', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reachedDeviceCreation = new Error('reached device creation');
    const { calls, gpu } = gpuStub(async () => ({
      info: { vendor: 'nvidia', architecture: 'blackwell' },
      requestDevice: () => Promise.reject(reachedDeviceCreation),
    }));
    vi.stubGlobal('navigator', { gpu, userAgent: 'test-agent' });

    const failure = await WebGpuRenderRuntime.create({
      canvas: {} as HTMLCanvasElement,
      antialias: false,
      samples: 1,
      requireWebGPU: true,
    }).then(() => null, (error: unknown) => error);

    // Stopped at the first step AFTER acquisition, which is the whole point:
    // acquisition succeeded, so nothing diagnostic may have run.
    expect(failure).toBe(reachedDeviceCreation);
    expect(webGpuDiagnosticsFromError(failure)).toBeNull();
    expect(calls, 'the hinted request succeeded, so no further adapter request may be made').toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the diagnostics behind a failure-only dynamic import in the shipped source', () => {
    const source = readFileSync(new URL('./render-runtime.ts', import.meta.url), 'utf8');
    // A static import would put the diagnostics in the renderer chunk and make
    // "costs nothing on success" a claim rather than a structural fact.
    expect(source).not.toContain("from './webgpu-adapter-diagnostics'");
    expect(source).toContain("await import('./webgpu-adapter-diagnostics')");
    // And the honest failure text stays exactly as the player saw it.
    expect(source).toContain('no GPU adapter was available at all');
  });

  it('refuses to dress an unrelated failure up as a graphics diagnosis', () => {
    expect(webGpuDiagnosticsFromError(new Error('something else broke'))).toBeNull();
    expect(webGpuDiagnosticsFromError('a string')).toBeNull();
    expect(webGpuDiagnosticsFromError(null)).toBeNull();
  });

  it('round-trips a report through the thrown error without making it enumerable', async () => {
    const report = await collectWebGpuDiagnostics(environment());
    const error = attachWebGpuDiagnostics(new Error('headline'), report);
    expect(webGpuDiagnosticsFromError(error)).toBe(report);
    expect(Object.keys(error)).toHaveLength(0);
    expect(JSON.stringify({ ...error })).toBe('{}');
  });
});

type FakeElement = {
  tagName: string;
  id: string;
  type: string;
  textContent: string;
  style: Record<string, string>;
  children: FakeElement[];
  listeners: Record<string, Array<() => void>>;
  appendChild(child: FakeElement): FakeElement;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
};

/**
 * The unit suite runs without a DOM, so the presentation is exercised against
 * the small, explicit surface it is allowed to use. If that surface grows, this
 * fake fails loudly rather than the failure screen failing silently.
 */
function fakeDocument() {
  const byId = new Map<string, FakeElement>();
  const register = (element: FakeElement): void => {
    if (element.id) byId.set(element.id, element);
    element.children.forEach(register);
  };
  const createElement = (tagName: string): FakeElement => {
    const element: FakeElement = {
      tagName,
      id: '',
      type: '',
      textContent: '',
      style: {},
      children: [],
      listeners: {},
      appendChild(child) {
        element.children.push(child);
        register(child);
        return child;
      },
      setAttribute() {
        // Recorded nowhere on purpose: only the text matters to a player.
      },
      addEventListener(type, listener) {
        (element.listeners[type] ??= []).push(listener);
      },
    };
    return element;
  };
  const body = createElement('body');
  register(body);
  return {
    body,
    createElement,
    createRange: () => ({ selectNodeContents: () => undefined }),
    getElementById: (id: string) => byId.get(id) ?? null,
  };
}

function renderedText(element: FakeElement): string {
  return [element.textContent, ...element.children.map(renderedText)].join('\n');
}

describe('the technical block lands beneath the friendly line', () => {
  it('appends into the existing requirement screen and keeps its sentence first', async () => {
    const doc = fakeDocument();
    const overlay = doc.createElement('div');
    overlay.id = 'pre-init-fatal';
    overlay.textContent = 'This game needs WebGPU. Use a current Chrome, Edge or Firefox (Windows) - '
      + '(WebGPU was required, but no GPU adapter was available at all)';
    doc.body.appendChild(overlay);

    const report = await collectWebGpuDiagnostics(environment());
    expect(presentWebGpuDiagnostics(report, doc as unknown as Document)).toBe(true);

    expect(overlay.textContent, 'the friendly first line must survive verbatim')
      .toContain('This game needs WebGPU.');
    const text = renderedText(overlay);
    expect(text).toContain('NUKE TOWN - WEBGPU DIAGNOSTICS');
    expect(text).toContain('NVIDIA GeForce RTX 5090');
    expect(text).toContain('WHAT TO TRY');
    // A centring flex row would put the block beside the sentence, not under it.
    expect(overlay.style.flexDirection).toBe('column');
  });

  it('keeps the advice outside the scrollable panel, where it cannot fall below the fold', async () => {
    const doc = fakeDocument();
    const report = await collectWebGpuDiagnostics(environment());
    presentWebGpuDiagnostics(report, doc as unknown as Document);
    const observations = doc.getElementById(`${WEBGPU_DIAGNOSTICS_ELEMENT_ID}-text`);
    const steps = doc.getElementById(`${WEBGPU_DIAGNOSTICS_ELEMENT_ID}-steps`);
    expect(observations?.textContent).toContain('WHAT THIS PAGE CAN SEE');
    expect(observations?.textContent, 'the advice is not inside the clipped panel').not.toContain('WHAT TO TRY');
    expect(steps?.children.map((item) => item.textContent).join(' ')).toContain('Quit the browser COMPLETELY');
    // The copy control still hands over one block containing both halves.
    expect(formatWebGpuDiagnostics(report)).toContain('WHAT THIS PAGE CAN SEE');
    expect(formatWebGpuDiagnostics(report)).toContain('WHAT TO TRY');
  });

  it('is idempotent, so a second failure report cannot double the screen', async () => {
    const doc = fakeDocument();
    const overlay = doc.createElement('div');
    overlay.id = 'pre-init-fatal';
    doc.body.appendChild(overlay);
    const report = await collectWebGpuDiagnostics(environment());
    expect(presentWebGpuDiagnostics(report, doc as unknown as Document)).toBe(true);
    expect(presentWebGpuDiagnostics(report, doc as unknown as Document)).toBe(false);
    expect(overlay.children).toHaveLength(1);
  });

  it('builds its own screen, with a friendly line, when no failure screen exists yet', async () => {
    const doc = fakeDocument();
    const report = await collectWebGpuDiagnostics(environment());
    expect(presentWebGpuDiagnostics(report, doc as unknown as Document)).toBe(true);
    const text = renderedText(doc.body);
    expect(text).toContain('This game needs WebGPU');
    expect(text).toContain('NUKE TOWN - WEBGPU DIAGNOSTICS');
  });

  it('offers a copy control that degrades to a selection instead of throwing', async () => {
    const doc = fakeDocument();
    const report = await collectWebGpuDiagnostics(environment());
    presentWebGpuDiagnostics(report, doc as unknown as Document);
    const panel = doc.getElementById(WEBGPU_DIAGNOSTICS_ELEMENT_ID);
    const button = panel?.children[0]?.children[1];
    expect(button?.tagName).toBe('button');
    expect(() => button?.listeners.click?.forEach((listener) => listener())).not.toThrow();
    expect(button?.textContent).toBe('SELECTED - PRESS CTRL+C');
  });
});
