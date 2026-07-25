import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { assertTslCutoverReady } from './tsl-migration-inventory';

export type RenderBackendId = 'webgl2' | 'webgpu';

export type RenderRuntimeRequest = Readonly<{
  requestedBackend: RenderBackendId;
  requireWebGPU: boolean;
}>;

export type RenderRuntimeTelemetry = Readonly<{
  requestedBackend: RenderBackendId;
  actualBackend: RenderBackendId;
  initialized: boolean;
  failClosed: boolean;
  adapterLabel: string;
  canvasAntialias: boolean;
  canvasSamples: number;
  principalHdrSamples: number | null;
  bloomSamples: number | null;
  renderPipelineApi: 'legacy-direct' | 'three-r185-render-pipeline';
  deviceLost: boolean;
}>;

export function resolveRenderRuntimeRequest(search: string): RenderRuntimeRequest {
  const query = new URLSearchParams(search);
  const requestedBackend = query.get('renderer') === 'webgpu' ? 'webgpu' : 'webgl2';
  return {
    requestedBackend,
    requireWebGPU: requestedBackend === 'webgpu' && query.get('requireWebGPU') === '1',
  };
}

function webGlAdapterLabel(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}

export class LegacyWebGlRenderRuntime {
  readonly backend = 'webgl2' as const;
  readonly renderer: THREE.WebGLRenderer;
  private readonly adapterLabel: string;

  private constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.adapterLabel = webGlAdapterLabel(renderer);
  }

  static async create(parameters: THREE.WebGLRendererParameters): Promise<LegacyWebGlRenderRuntime> {
    const renderer = new THREE.WebGLRenderer(parameters);
    return new LegacyWebGlRenderRuntime(renderer);
  }

  telemetry(targets?: Readonly<{ principalHdrSamples: number | null; bloomSamples: number | null }>): RenderRuntimeTelemetry {
    const gl = this.renderer.getContext();
    return {
      requestedBackend: 'webgl2',
      actualBackend: 'webgl2',
      initialized: true,
      failClosed: false,
      adapterLabel: this.adapterLabel,
      canvasAntialias: gl.getContextAttributes()?.antialias ?? false,
      canvasSamples: Number(gl.getParameter(gl.SAMPLES) ?? 0),
      principalHdrSamples: targets?.principalHdrSamples ?? null,
      bloomSamples: targets?.bloomSamples ?? null,
      renderPipelineApi: 'legacy-direct',
      deviceLost: gl.isContextLost(),
    };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

type WebGpuBackendShape = Readonly<{
  isWebGPUBackend?: boolean;
  device?: { lost?: Promise<unknown> };
}>;

/**
 * An actual initialized Three r185 WebGPU renderer and RenderPipeline owner.
 * It is deliberately not accepted by main.ts until the TSL inventory is green.
 */
export class WebGpuRenderRuntime {
  readonly backend = 'webgpu' as const;
  readonly renderer: WebGPURenderer;
  readonly renderPipeline: RenderPipeline;
  private deviceLost = false;

  private constructor(renderer: WebGPURenderer, renderPipeline: RenderPipeline) {
    this.renderer = renderer;
    this.renderPipeline = renderPipeline;
    const backend = renderer.backend as WebGpuBackendShape;
    void backend.device?.lost?.then(() => { this.deviceLost = true; });
  }

  static async create(parameters: Readonly<{
    canvas: HTMLCanvasElement;
    antialias: boolean;
    samples: number;
    requireWebGPU: boolean;
  }>): Promise<WebGpuRenderRuntime> {
    const module = await import('three/webgpu');
    const renderer = new module.WebGPURenderer({
      canvas: parameters.canvas,
      antialias: parameters.antialias,
      samples: parameters.samples,
      powerPreference: 'high-performance',
    });
    await renderer.init();
    const backend = renderer.backend as WebGpuBackendShape;
    if (parameters.requireWebGPU && backend.isWebGPUBackend !== true) {
      renderer.dispose();
      throw new Error('WebGPU was required, but Three r185 initialized its WebGL2 fallback backend');
    }
    const renderPipeline = new module.RenderPipeline(renderer);
    return new WebGpuRenderRuntime(renderer, renderPipeline);
  }

  telemetry(requestedBackend: RenderBackendId = 'webgpu'): RenderRuntimeTelemetry {
    const backend = this.renderer.backend as WebGpuBackendShape;
    const actualBackend = backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
    return {
      requestedBackend,
      actualBackend,
      initialized: true,
      failClosed: requestedBackend === 'webgpu' && actualBackend !== 'webgpu',
      adapterLabel: backend.isWebGPUBackend === true ? 'three-r185-webgpu-backend' : 'three-r185-webgl2-fallback',
      canvasAntialias: false,
      canvasSamples: 0,
      principalHdrSamples: null,
      bloomSamples: null,
      renderPipelineApi: 'three-r185-render-pipeline',
      deviceLost: this.deviceLost,
    };
  }

  assertCandidateReady(): void {
    const telemetry = this.telemetry();
    if (telemetry.actualBackend !== 'webgpu') {
      throw new Error('WebGPU candidate verification failed closed: actual backend is not WebGPU');
    }
    if (telemetry.deviceLost) throw new Error('WebGPU candidate verification failed closed: device was lost');
    assertTslCutoverReady();
  }

  dispose(): void {
    this.renderPipeline.dispose();
    this.renderer.dispose();
  }
}

/**
 * A WebGPU query performs a real detached backend initialization, records the
 * actual backend, then fails closed while the TSL migration ledger is pending.
 * This prevents a feature-detection or silent-fallback build being called a
 * WebGPU HITL candidate.
 */
export async function probeRequiredWebGpuCandidate(search: string): Promise<RenderRuntimeTelemetry | null> {
  const request = resolveRenderRuntimeRequest(search);
  if (request.requestedBackend !== 'webgpu') return null;
  const runtime = await WebGpuRenderRuntime.create({
    canvas: document.createElement('canvas'),
    antialias: true,
    samples: 4,
    requireWebGPU: true,
  });
  const telemetry = runtime.telemetry(request.requestedBackend);
  try {
    runtime.assertCandidateReady();
    return telemetry;
  } finally {
    runtime.dispose();
  }
}
