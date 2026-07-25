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
  adapterClass: string;
  deviceClass: string | null;
  softwareAdapter: boolean;
  canvasAntialias: boolean;
  canvasSamples: number;
  principalHdrSamples: number | null;
  bloomSamples: number | null;
  renderPipelineApi: 'legacy-direct' | 'three-r185-render-pipeline';
  deviceLost: boolean;
}>;

export type RenderInfoSnapshot = Readonly<{
  calls: number;
  triangles: number;
  points: number;
  lines: number;
}>;

export type ShadowRuntimeState = Readonly<{
  enabled: boolean;
  autoUpdate: boolean;
  needsUpdate: boolean;
}>;

export type PresentationPrewarmRuntime = Readonly<{
  compileAndRender(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void>;
}>;

export function resolveRenderRuntimeRequest(search: string): RenderRuntimeRequest {
  const query = new URLSearchParams(search);
  const requestedBackend = query.get('renderer') === 'webgl2' ? 'webgl2' : 'webgpu';
  return {
    requestedBackend,
    // WebGPU is a renderer contract, not a feature-detection hint. Silent
    // WebGL fallback would make the HITL evidence and rollback boundary false.
    requireWebGPU: requestedBackend === 'webgpu',
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
      adapterClass: gl.constructor.name || 'WebGL2RenderingContext',
      deviceClass: null,
      softwareAdapter: /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/i.test(this.adapterLabel),
      canvasAntialias: gl.getContextAttributes()?.antialias ?? false,
      canvasSamples: Number(gl.getParameter(gl.SAMPLES) ?? 0),
      principalHdrSamples: targets?.principalHdrSamples ?? null,
      bloomSamples: targets?.bloomSamples ?? null,
      renderPipelineApi: 'legacy-direct',
      deviceLost: gl.isContextLost(),
    };
  }

  configureOutput(exposure: number): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
  }

  setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  configureShadows(options: Readonly<{
    enabled: boolean;
    type?: THREE.ShadowMapType;
    autoUpdate?: boolean;
    needsUpdate?: boolean;
  }>): void {
    this.renderer.shadowMap.enabled = options.enabled;
    if (options.type !== undefined) this.renderer.shadowMap.type = options.type;
    if (options.autoUpdate !== undefined) this.renderer.shadowMap.autoUpdate = options.autoUpdate;
    if (options.needsUpdate !== undefined) this.renderer.shadowMap.needsUpdate = options.needsUpdate;
  }

  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
  }

  shadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  requestShadowUpdate(needsUpdate = true): void {
    this.renderer.shadowMap.needsUpdate = needsUpdate;
  }

  shadowState(): ShadowRuntimeState {
    return {
      enabled: this.renderer.shadowMap.enabled,
      autoUpdate: this.renderer.shadowMap.autoUpdate,
      needsUpdate: this.renderer.shadowMap.needsUpdate,
    };
  }

  setPixelRatio(pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
  }

  pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  setSize(width: number, height: number, updateStyle = false): void {
    this.renderer.setSize(width, height, updateStyle);
  }

  drawingBufferSize(target = new THREE.Vector2()): THREE.Vector2 {
    return this.renderer.getDrawingBufferSize(target);
  }

  maximumAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  async compile(root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): Promise<void> {
    await this.renderer.compileAsync(root, camera, scene);
  }

  async compileAndRender(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    await this.compile(root, camera, scene);
    this.renderer.render(scene, camera);
  }

  compileAndRenderImmediate(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
    void this.renderer.compileAsync(root, camera, scene);
    this.renderer.render(scene, camera);
  }

  resetRenderInfo(): void {
    this.renderer.info.reset();
  }

  renderInfo(): RenderInfoSnapshot {
    const { calls, triangles, points, lines } = this.renderer.info.render;
    return { calls, triangles, points, lines };
  }

  webGlVersion(): string {
    const gl = this.renderer.getContext();
    return String(gl.getParameter(gl.VERSION));
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

type WebGpuBackendShape = Readonly<{
  isWebGPUBackend?: boolean;
  device?: GpuDeviceShape;
}>;

type GpuDeviceShape = Readonly<{
  lost?: Promise<unknown>;
  queue?: Readonly<{ onSubmittedWorkDone?: () => Promise<void> }>;
  destroy?: () => void;
  constructor?: { name?: string };
}>;

type GpuAdapterInfoShape = Readonly<Record<string, string | number | boolean | undefined>>;
type GpuAdapterShape = Readonly<{
  info?: GpuAdapterInfoShape;
  isFallbackAdapter?: boolean;
  requestAdapterInfo?: () => Promise<GpuAdapterInfoShape>;
  requestDevice(): Promise<GpuDeviceShape>;
  constructor?: { name?: string };
}>;

type GpuNavigatorShape = Readonly<{
  gpu?: Readonly<{
    requestAdapter(options: Readonly<{ powerPreference: 'high-performance' }>): Promise<GpuAdapterShape | null>;
  }>;
}>;

function adapterInfoLabel(info: GpuAdapterInfoShape): string {
  const orderedKeys = ['vendor', 'architecture', 'device', 'description'];
  const values = orderedKeys.map((key) => info[key]).filter((value) => value !== undefined && String(value).trim() !== '');
  return values.length > 0 ? values.map(String).join(' / ') : 'WebGPU adapter info unavailable';
}

/**
 * An actual initialized Three r185 WebGPU renderer and RenderPipeline owner.
 * Hardware readiness admits the isolated HITL scene; candidate readiness stays
 * stricter and blocks gameplay/release cutover until the TSL ledger is verified.
 */
export class WebGpuRenderRuntime {
  readonly backend = 'webgpu' as const;
  readonly renderer: WebGPURenderer;
  readonly renderPipeline: RenderPipeline;
  private deviceLost = false;
  private readonly canvasAntialias: boolean;
  private readonly canvasSamples: number;
  private readonly adapterLabel: string;
  private readonly adapterClass: string;
  private readonly deviceClass: string;
  private readonly softwareAdapter: boolean;
  private readonly device: GpuDeviceShape;
  private principalHdrSamples: number | null = null;
  private bloomSamples: number | null = null;

  private constructor(
    renderer: WebGPURenderer,
    renderPipeline: RenderPipeline,
    identity: Readonly<{
      canvasAntialias: boolean;
      canvasSamples: number;
      adapterLabel: string;
      adapterClass: string;
      deviceClass: string;
      softwareAdapter: boolean;
      device: GpuDeviceShape;
    }>,
  ) {
    this.renderer = renderer;
    this.renderPipeline = renderPipeline;
    this.canvasAntialias = identity.canvasAntialias;
    this.canvasSamples = identity.canvasSamples;
    this.adapterLabel = identity.adapterLabel;
    this.adapterClass = identity.adapterClass;
    this.deviceClass = identity.deviceClass;
    this.softwareAdapter = identity.softwareAdapter;
    this.device = identity.device;
    void identity.device.lost?.then(() => { this.deviceLost = true; });
  }

  static async create(parameters: Readonly<{
    canvas: HTMLCanvasElement;
    antialias: boolean;
    samples: number;
    requireWebGPU: boolean;
  }>): Promise<WebGpuRenderRuntime> {
    const gpu = (navigator as unknown as GpuNavigatorShape).gpu;
    if (!gpu) throw new Error('WebGPU was required, but navigator.gpu is unavailable');
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU was required, but no high-performance adapter was available');
    const adapterInfo = adapter.info ?? await adapter.requestAdapterInfo?.() ?? {};
    const adapterLabel = adapterInfoLabel(adapterInfo);
    const device = await adapter.requestDevice();
    const module = await import('three/webgpu');
    const renderer = new module.WebGPURenderer({
      canvas: parameters.canvas,
      antialias: parameters.antialias,
      samples: parameters.samples,
      powerPreference: 'high-performance',
      device,
    });
    await renderer.init();
    const backend = renderer.backend as WebGpuBackendShape;
    if (parameters.requireWebGPU && backend.isWebGPUBackend !== true) {
      renderer.dispose();
      throw new Error('WebGPU was required, but Three r185 initialized its WebGL2 fallback backend');
    }
    const renderPipeline = new module.RenderPipeline(renderer);
    return new WebGpuRenderRuntime(renderer, renderPipeline, {
      canvasAntialias: parameters.antialias,
      canvasSamples: parameters.antialias ? parameters.samples : 0,
      adapterLabel,
      adapterClass: adapter.constructor?.name || 'GPUAdapter',
      deviceClass: device.constructor?.name || 'GPUDevice',
      softwareAdapter: adapter.isFallbackAdapter === true || /swiftshader|llvmpipe|software|softpipe|\bwarp\b/i.test(adapterLabel),
      device,
    });
  }

  telemetry(requestedBackend: RenderBackendId = 'webgpu'): RenderRuntimeTelemetry {
    const backend = this.renderer.backend as WebGpuBackendShape;
    const actualBackend = backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
    return {
      requestedBackend,
      actualBackend,
      initialized: true,
      failClosed: requestedBackend === 'webgpu' && actualBackend !== 'webgpu',
      adapterLabel: this.adapterLabel,
      adapterClass: this.adapterClass,
      deviceClass: this.deviceClass,
      softwareAdapter: this.softwareAdapter,
      canvasAntialias: this.canvasAntialias,
      canvasSamples: this.canvasSamples,
      principalHdrSamples: this.principalHdrSamples,
      bloomSamples: this.bloomSamples,
      renderPipelineApi: 'three-r185-render-pipeline',
      deviceLost: this.deviceLost,
    };
  }

  assertCandidateReady(): void {
    this.assertHardwareReady();
    assertTslCutoverReady();
  }

  assertHardwareReady(): void {
    const telemetry = this.telemetry();
    if (telemetry.actualBackend !== 'webgpu') {
      throw new Error('WebGPU candidate verification failed closed: actual backend is not WebGPU');
    }
    if (telemetry.softwareAdapter) throw new Error('WebGPU candidate verification failed closed: software/fallback adapter');
    if (telemetry.deviceLost) throw new Error('WebGPU candidate verification failed closed: device was lost');
  }

  setRenderTargetTelemetry(principalHdrSamples: number, bloomSamples: number): void {
    this.principalHdrSamples = principalHdrSamples;
    this.bloomSamples = bloomSamples;
  }

  configureOutput(exposure: number): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
  }

  setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  configureShadows(options: Readonly<{
    enabled: boolean;
    type?: THREE.ShadowMapType;
    autoUpdate?: boolean;
    needsUpdate?: boolean;
  }>): void {
    this.renderer.shadowMap.enabled = options.enabled;
    if (options.type !== undefined) this.renderer.shadowMap.type = options.type;
  }

  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
  }

  shadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  requestShadowUpdate(): void {
    // Three's common WebGPU renderer updates shadow maps through the active
    // RenderPipeline. There is no WebGL `needsUpdate` flag to mutate here.
  }

  shadowState(): ShadowRuntimeState {
    return { enabled: this.renderer.shadowMap.enabled, autoUpdate: true, needsUpdate: false };
  }

  setPixelRatio(pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
  }

  pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  setSize(width: number, height: number, updateStyle = false): void {
    this.renderer.setSize(width, height, updateStyle);
  }

  drawingBufferSize(target = new THREE.Vector2()): THREE.Vector2 {
    return this.renderer.getDrawingBufferSize(target);
  }

  maximumAnisotropy(): number {
    return this.renderer.getMaxAnisotropy();
  }

  async compile(root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): Promise<void> {
    await this.renderer.compileAsync(root, camera, scene);
  }

  async compileAndRender(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    await this.compile(root, camera, scene);
    this.renderPipeline.render();
    await this.waitForSubmittedWork();
  }

  compileAndRenderImmediate(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
    void this.renderer.compileAsync(root, camera, scene);
    this.renderPipeline.render();
  }

  submitFrame(): void {
    this.renderer.info.reset();
    this.renderPipeline.render();
  }

  resetRenderInfo(): void {
    this.renderer.info.reset();
  }

  renderInfo(): RenderInfoSnapshot {
    const { calls, triangles, points, lines } = this.renderer.info.render;
    return { calls, triangles, points, lines };
  }

  webGlVersion(): null {
    return null;
  }

  async readRenderTargetPixels(
    target: THREE.RenderTarget,
    width: number,
    height: number,
  ): Promise<ArrayBufferView> {
    return this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
  }

  async waitForSubmittedWork(): Promise<void> {
    await this.device.queue?.onSubmittedWorkDone?.();
  }

  dispose(): void {
    this.renderPipeline.dispose();
    this.renderer.dispose();
    this.device.destroy?.();
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
