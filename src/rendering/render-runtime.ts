import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { assertTslCutoverReady } from './tsl-migration-inventory';
import type { ToneMappingMode } from '../graphics-settings-registry';
import { FramePacingSampler, type FramePacingSummary } from '../frame-pacing';

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
  canvasAlphaMode: 'opaque';
  canvasAntialias: boolean;
  canvasSamples: number;
  principalHdrSamples: number | null;
  bloomSamples: number | null;
  renderPipelineApi: 'legacy-direct' | 'three-r185-render-pipeline';
  deviceLost: boolean;
  uncapturedErrors: number;
  lastUncapturedError: string | null;
  slowNodeBuilds?: readonly Readonly<{
    atMs: number;
    durationMs: number;
    mode: 'async' | 'sync';
    objectName: string;
    objectUuid: string;
    materialName: string;
    materialUuid: string;
    geometryType: string;
    initialCacheKey: number | null;
    initialNodesCacheKey: number | null;
    dynamicCacheKey: number | null;
    contextId: number | null;
    lightsNodeId: number | null;
  }>[];
  presentation: PresentationFreshnessTelemetry;
}>;

export type RenderRuntimeHealthTelemetry = Readonly<{
  actualBackend: RenderBackendId;
  deviceLost: boolean;
  uncapturedErrors: number;
  presentation: PresentationFreshnessTelemetry;
}>;

export type PresentationFreshnessTelemetry = Readonly<{
  status: 'synchronous' | 'warming' | 'healthy' | 'stalled' | 'device-lost' | 'failed';
  submissionSequence: number;
  completedSequence: number;
  lastSubmittedAt: number | null;
  lastCompletedAt: number | null;
  pendingSince: number | null;
  pendingForMs: number;
  lastCompletionLatencyMs: number | null;
  completionFailures: number;
  lastFailure: string | null;
  backpressureActive: boolean;
  skippedSubmissions: number;
  progress: PresentationProgressTelemetry;
}>;

export type PresentationProgressTelemetry = Readonly<{
  windowStartedAt: number;
  elapsedMs: number;
  submissionAdvances: number;
  completionAdvances: number;
  submittedHz: number;
  completedHz: number;
  currentSubmissionGapMs: number;
  currentCompletionGapMs: number;
  maximumSubmissionGapMs: number;
  maximumCompletionGapMs: number;
  maximumPendingForMs: number;
  submissionPacing: FramePacingSummary;
  completionPacing: FramePacingSummary;
}>;

export function sequenceProgressRate(input: Readonly<{
  baselineSequence: number;
  currentSequence: number;
  windowStartedAt: number;
  now: number;
}>): Readonly<{ advances: number; elapsedMs: number; cadenceHz: number }> {
  const elapsedMs = Number.isFinite(input.now) && Number.isFinite(input.windowStartedAt)
    ? Math.max(0, input.now - input.windowStartedAt)
    : 0;
  const advances = Number.isSafeInteger(input.currentSequence) && Number.isSafeInteger(input.baselineSequence)
    ? Math.max(0, input.currentSequence - input.baselineSequence)
    : 0;
  return Object.freeze({
    advances,
    elapsedMs,
    cadenceHz: elapsedMs > 0 ? advances * 1_000 / elapsedMs : 0,
  });
}

function emptyFramePacingSummary(reason: string): FramePacingSummary {
  return {
    ready: false,
    sampleCount: 0,
    cadenceHz: 0,
    medianMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    longFrames: { over20Ms: 0, over33Ms: 0, over50Ms: 0, over100Ms: 0 },
    displayLimited: false,
    lastResetReason: reason,
  };
}

export function classifyPresentationFreshness(input: Readonly<{
  deviceLost: boolean;
  completionFailures: number;
  submissionSequence: number;
  completedSequence: number;
  pendingForMs: number;
  stallThresholdMs: number;
}>): PresentationFreshnessTelemetry['status'] {
  if (input.deviceLost) return 'device-lost';
  if (input.completionFailures > 0) return 'failed';
  if (input.submissionSequence > input.completedSequence && input.pendingForMs > input.stallThresholdMs) return 'stalled';
  if (input.submissionSequence === 0 || input.completedSequence === 0) return 'warming';
  return 'healthy';
}

export type LivePresentationStall = Readonly<{
  kind: 'pending-completion' | 'missing-submission';
  elapsedMs: number;
}>;

/**
 * Detects a foreground presentation stall without treating menus, hidden tabs,
 * explicit render pauses, or normal one-deep queue backpressure as missing
 * submissions. Pending queue work retains its own independent fatal fence.
 */
export function detectLivePresentationStall(input: Readonly<{
  activeMatch: boolean;
  menuHidden: boolean;
  documentVisible: boolean;
  documentFocused: boolean;
  arenaSelectionReady: boolean;
  debugRenderPaused: boolean;
  renderSubmissionPaused: boolean;
  backpressureActive: boolean;
  currentSubmissionGapMs: number;
  pendingForMs: number;
  stallThresholdMs: number;
}>): LivePresentationStall | null {
  if (!input.activeMatch || !input.menuHidden || !input.documentVisible || !input.documentFocused || !input.arenaSelectionReady
    || input.debugRenderPaused || input.renderSubmissionPaused) return null;
  if (!Number.isFinite(input.stallThresholdMs) || input.stallThresholdMs < 0) return null;
  if (Number.isFinite(input.pendingForMs) && input.pendingForMs >= input.stallThresholdMs) {
    return Object.freeze({ kind: 'pending-completion', elapsedMs: Math.max(0, input.pendingForMs) });
  }
  if (!input.backpressureActive && Number.isFinite(input.currentSubmissionGapMs)
    && input.currentSubmissionGapMs >= input.stallThresholdMs) {
    return Object.freeze({ kind: 'missing-submission', elapsedMs: Math.max(0, input.currentSubmissionGapMs) });
  }
  return null;
}

/**
 * A long requestAnimationFrame gap is browser/OS scheduling evidence, not proof
 * that the GPU stopped presenting. Start a fresh foreground observation epoch
 * before judging queue progress so hidden, unfocused, capture, and breakpoint
 * time cannot be charged to the live-device fence.
 */
export function shouldResetPresentationAfterSchedulerGap(frameGapMs: number, stallThresholdMs: number): boolean {
  return Number.isFinite(frameGapMs)
    && Number.isFinite(stallThresholdMs)
    && stallThresholdMs >= 0
    && frameGapMs >= stallThresholdMs;
}

export function shouldBackpressureWebGpuSubmissions(
  pendingSince: number | null,
  now: number,
  thresholdMs: number,
  inFlightSubmissions = 0,
  maximumInFlightSubmissions = Number.POSITIVE_INFINITY,
): boolean {
  const queueDepthBoundReached = Number.isSafeInteger(inFlightSubmissions)
    && Number.isSafeInteger(maximumInFlightSubmissions)
    && inFlightSubmissions >= 0
    && maximumInFlightSubmissions > 0
    && inFlightSubmissions >= maximumInFlightSubmissions;
  return queueDepthBoundReached || pendingSince !== null
    && Number.isFinite(pendingSince)
    && Number.isFinite(now)
    && Number.isFinite(thresholdMs)
    && thresholdMs >= 0
    && now - pendingSince >= thresholdMs;
}

export function pendingCompletionStartAfterProgress(input: Readonly<{
  completedAt: number;
  completedSequence: number;
  submissionSequence: number;
}>): number | null {
  return input.completedSequence >= input.submissionSequence ? null : input.completedAt;
}

export function centeredReadbackRegion(
  targetWidth: number,
  targetHeight: number,
  maximumDimension = 64,
): Readonly<{ x: number; y: number; width: number; height: number }> {
  const width = Math.max(1, Math.min(Math.floor(targetWidth), maximumDimension));
  const height = Math.max(1, Math.min(Math.floor(targetHeight), maximumDimension));
  return Object.freeze({
    x: Math.max(0, Math.floor((targetWidth - width) / 2)),
    y: Math.max(0, Math.floor((targetHeight - height) / 2)),
    width,
    height,
  });
}

export async function awaitSubmissionCompletionTarget(input: Readonly<{
  targetSequence: number;
  completedSequence: () => number;
  createProbe: () => Promise<void> | null;
  failure: () => string | null;
  timeoutMs: number;
}>): Promise<void> {
  if (input.completedSequence() >= input.targetSequence) return;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`WebGPU queue completion exceeded ${input.timeoutMs} ms for submission ${input.targetSequence}`)),
      input.timeoutMs,
    );
  });
  try {
    while (input.completedSequence() < input.targetSequence) {
      const before = input.completedSequence();
      const probe = input.createProbe();
      if (!probe) throw new Error('WebGPU queue completion probing is unavailable');
      await Promise.race([probe, timeout]);
      const failure = input.failure();
      if (failure) throw new Error(`WebGPU queue completion failed: ${failure}`);
      if (input.completedSequence() <= before) {
        throw new Error(`WebGPU queue completion probe did not advance beyond submission ${before}`);
      }
    }
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}

export type RenderInfoSnapshot = Readonly<{
  calls: number;
  triangles: number;
  points: number;
  lines: number;
}>;

export function webGpuRenderInfoSnapshot(render: Readonly<{
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
}>): RenderInfoSnapshot {
  return {
    calls: render.drawCalls,
    triangles: render.triangles,
    points: render.points,
    lines: render.lines,
  };
}

export function formatWebGpuUncapturedError(event: unknown): string {
  const record = event as { error?: { name?: unknown; message?: unknown } } | null;
  const name = record?.error?.name === undefined ? 'GPUError' : String(record.error.name);
  const message = record?.error?.message === undefined ? 'No validation message was provided' : String(record.error.message);
  return `${name}: ${message}`;
}

export function toneMappingForMode(mode: ToneMappingMode): THREE.ToneMapping {
  if (mode === 'agx') return THREE.AgXToneMapping;
  if (mode === 'neutral') return THREE.NeutralToneMapping;
  return THREE.ACESFilmicToneMapping;
}

export type ShadowRuntimeState = Readonly<{
  enabled: boolean;
  autoUpdate: boolean;
  needsUpdate: boolean;
}>;

export function configureSceneLightShadowSchedule(
  root: THREE.Object3D,
  autoUpdate: boolean,
  needsUpdate: boolean,
): number {
  let configured = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight || node instanceof THREE.PointLight)
      || !node.castShadow) return;
    node.shadow.autoUpdate = autoUpdate;
    node.shadow.needsUpdate = needsUpdate;
    configured += 1;
  });
  return configured;
}

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
      canvasAlphaMode: 'opaque',
      canvasAntialias: gl.getContextAttributes()?.antialias ?? false,
      canvasSamples: Number(gl.getParameter(gl.SAMPLES) ?? 0),
      principalHdrSamples: targets?.principalHdrSamples ?? null,
      bloomSamples: targets?.bloomSamples ?? null,
      renderPipelineApi: 'legacy-direct',
      deviceLost: gl.isContextLost(),
      uncapturedErrors: 0,
      lastUncapturedError: null,
      presentation: this.presentationTelemetry(),
    };
  }

  healthTelemetry(now = performance.now()): RenderRuntimeHealthTelemetry {
    const deviceLost = this.renderer.getContext().isContextLost();
    return {
      actualBackend: 'webgl2',
      deviceLost,
      uncapturedErrors: 0,
      presentation: this.presentationTelemetry(now),
    };
  }

  presentationTelemetry(now = performance.now()): PresentationFreshnessTelemetry {
    const lost = this.renderer.getContext().isContextLost();
    const pacing = emptyFramePacingSummary('synchronous WebGL presentation');
    return {
      status: lost ? 'device-lost' : 'synchronous',
      submissionSequence: 0,
      completedSequence: 0,
      lastSubmittedAt: null,
      lastCompletedAt: null,
      pendingSince: null,
      pendingForMs: 0,
      lastCompletionLatencyMs: null,
      completionFailures: 0,
      lastFailure: lost ? 'WebGL context lost' : null,
      backpressureActive: false,
      skippedSubmissions: 0,
      progress: {
        windowStartedAt: now,
        elapsedMs: 0,
        submissionAdvances: 0,
        completionAdvances: 0,
        submittedHz: 0,
        completedHz: 0,
        currentSubmissionGapMs: 0,
        currentCompletionGapMs: 0,
        maximumSubmissionGapMs: 0,
        maximumCompletionGapMs: 0,
        maximumPendingForMs: 0,
        submissionPacing: pacing,
        completionPacing: pacing,
      },
    };
  }

  resetPresentationProgressTelemetry(_reason?: string, _now?: number): void { /* Synchronous WebGL has no queue frontier. */ }

  resetPresentationProgressWindow(_now?: number): void { /* Synchronous WebGL has no queue frontier. */ }

  configureOutput(exposure: number, toneMapping: ToneMappingMode = 'aces'): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = toneMappingForMode(toneMapping);
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

  configureLightShadows(root: THREE.Object3D, autoUpdate: boolean, needsUpdate: boolean): number {
    return configureSceneLightShadowSchedule(root, autoUpdate, needsUpdate);
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
  addEventListener?: (type: 'uncapturederror', listener: (event: unknown) => void) => void;
  removeEventListener?: (type: 'uncapturederror', listener: (event: unknown) => void) => void;
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
  private readonly clock: () => number;
  private principalHdrSamples: number | null = null;
  private bloomSamples: number | null = null;
  private submissionSequence = 0;
  private completedSequence = 0;
  private lastSubmittedAt: number | null = null;
  private lastCompletedAt: number | null = null;
  private pendingCompletionStartedAt: number | null = null;
  private completionProbe: Promise<void> | null = null;
  private presentationPrewarmBatch: Promise<void> | null = null;
  private presentationPrewarmScene: THREE.Scene | null = null;
  private lastCompletionLatencyMs: number | null = null;
  private completionFailures = 0;
  private lastFailure: string | null = null;
  private uncapturedErrors = 0;
  private lastUncapturedError: string | null = null;
  private readonly uncapturedErrorListener = (event: unknown): void => {
    const message = formatWebGpuUncapturedError(event);
    this.uncapturedErrors += 1;
    this.lastUncapturedError = message;
    this.completionFailures += 1;
    this.lastFailure = `WebGPU uncaptured error: ${message}`;
  };
  private skippedSubmissions = 0;
  private readonly submissionPacing = new FramePacingSampler();
  private readonly completionPacing = new FramePacingSampler();
  private progressWindowStartedAt = 0;
  private progressBaselineSubmissionSequence = 0;
  private progressBaselineCompletionSequence = 0;
  private progressLastSubmissionAt = 0;
  private progressLastCompletionAt = 0;
  private progressMaximumSubmissionGapMs = 0;
  private progressMaximumCompletionGapMs = 0;
  private progressMaximumPendingForMs = 0;
  private lastSubmittedRenderInfo: RenderInfoSnapshot = Object.freeze({ calls: 0, triangles: 0, points: 0, lines: 0 });
  private lightShadowAutoUpdate = true;
  private lightShadowNeedsUpdate = false;
  private readonly slowNodeBuilds: Array<Readonly<{
    atMs: number;
    durationMs: number;
    mode: 'async' | 'sync';
    objectName: string;
    objectUuid: string;
    materialName: string;
    materialUuid: string;
    geometryType: string;
    initialCacheKey: number | null;
    initialNodesCacheKey: number | null;
    dynamicCacheKey: number | null;
    contextId: number | null;
    lightsNodeId: number | null;
  }>> = [];
  private nextCompletionProbeAt = 0;
  private static readonly COMPLETION_PROBE_INTERVAL_MS = 250;
  private static readonly SUBMISSION_BACKPRESSURE_MS = 250;
  // Three's WebGPU renderer owns mutable bind-group, render-target and texture
  // state. Never begin a second presentation while the prior GPU submission is
  // unresolved: overlapping cold scene/viewmodel compilation caused both long
  // gameplay freezes and `Texture already initialized` failures on the HITL
  // browser. Queue completion still advances in frontiers, but admission is
  // deliberately serialized at the renderer boundary.
  private static readonly MAX_IN_FLIGHT_SUBMISSIONS = 1;
  // Cold shader/shadow compilation on the frozen owner hardware can retire in
  // ~2.4 s. Backpressure still stops new work at 250 ms; twelve seconds matches
  // the explicit cold-generation fence and distinguishes cold work from a hang.
  // Queue-latency adaptation handles bounded overload before gameplay. Keep
  // the fatal fence for a genuinely non-progressing device, not a slow frame
  // that can still retire and trigger a safe quality downshift.
  private static readonly PRESENTATION_STALL_MS = 12_000;

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
      now?: () => number;
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
    this.clock = identity.now ?? (() => performance.now());
    this.resetPresentationProgressTelemetry('renderer initialized', this.clock());
    this.installNodeBuildTrace();
    identity.device.addEventListener?.('uncapturederror', this.uncapturedErrorListener);
    void identity.device.lost?.then((info) => {
      this.deviceLost = true;
      const record = info as { reason?: unknown; message?: unknown } | undefined;
      const reason = record?.reason === undefined ? 'unknown' : String(record.reason);
      const message = record?.message === undefined ? '' : `: ${String(record.message)}`;
      this.lastFailure = `WebGPU device lost (${reason})${message}`;
    });
  }

  private installNodeBuildTrace(): void {
    if (typeof location === 'undefined' || new URLSearchParams(location.search).get('traceNodeBuilds') !== '1') return;
    type RenderObjectShape = Readonly<{
      object?: THREE.Object3D & { geometry?: { type?: string } };
      material?: THREE.Material;
      initialCacheKey?: number;
      initialNodesCacheKey?: number;
      context?: { id?: number };
      lightsNode?: { id?: number };
      getDynamicCacheKey?: () => number;
    }>;
    type NodeManagerShape = {
      getForRender(renderObject: RenderObjectShape, useAsync?: boolean): unknown;
    };
    const nodes = (this.renderer as unknown as { _nodes?: NodeManagerShape })._nodes;
    if (!nodes) return;
    const getForRender = nodes.getForRender.bind(nodes);
    const record = (renderObject: RenderObjectShape, startedAt: number, mode: 'async' | 'sync'): void => {
      const durationMs = performance.now() - startedAt;
      if (durationMs < 4) return;
      this.slowNodeBuilds.push(Object.freeze({
        atMs: startedAt,
        durationMs,
        mode,
        objectName: renderObject.object?.name || '(unnamed)',
        objectUuid: renderObject.object?.uuid || '(unknown)',
        materialName: renderObject.material?.name || renderObject.material?.type || '(unnamed)',
        materialUuid: renderObject.material?.uuid || '(unknown)',
        geometryType: renderObject.object?.geometry?.type || '(unknown)',
        initialCacheKey: Number.isFinite(renderObject.initialCacheKey) ? renderObject.initialCacheKey! : null,
        initialNodesCacheKey: Number.isFinite(renderObject.initialNodesCacheKey) ? renderObject.initialNodesCacheKey! : null,
        dynamicCacheKey: renderObject.getDynamicCacheKey ? renderObject.getDynamicCacheKey() : null,
        contextId: Number.isFinite(renderObject.context?.id) ? renderObject.context!.id! : null,
        lightsNodeId: Number.isFinite(renderObject.lightsNode?.id) ? renderObject.lightsNode!.id! : null,
      }));
      if (this.slowNodeBuilds.length > 256) this.slowNodeBuilds.splice(0, this.slowNodeBuilds.length - 256);
    };
    nodes.getForRender = (renderObject, useAsync = false) => {
      const startedAt = performance.now();
      const result = getForRender(renderObject, useAsync);
      if (useAsync && result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result).then((value) => {
          record(renderObject, startedAt, 'async');
          return value;
        });
      }
      record(renderObject, startedAt, useAsync ? 'async' : 'sync');
      return result;
    };
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
      // The game canvas is a fully opaque presentation surface. Pass 64's
      // implicit transparent default exposed the CSS backdrop as a flat brown
      // field whenever the WebGPU swapchain stopped presenting useful color.
      alpha: false,
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
      canvasAlphaMode: 'opaque',
      canvasAntialias: this.canvasAntialias,
      canvasSamples: this.canvasSamples,
      principalHdrSamples: this.principalHdrSamples,
      bloomSamples: this.bloomSamples,
      renderPipelineApi: 'three-r185-render-pipeline',
      deviceLost: this.deviceLost,
      uncapturedErrors: this.uncapturedErrors,
      lastUncapturedError: this.lastUncapturedError,
      slowNodeBuilds: Object.freeze(this.slowNodeBuilds.map((entry) => Object.freeze({ ...entry }))),
      presentation: this.presentationTelemetry(),
    };
  }

  healthTelemetry(now = this.clock()): RenderRuntimeHealthTelemetry {
    const backend = this.renderer.backend as WebGpuBackendShape;
    return {
      actualBackend: backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2',
      deviceLost: this.deviceLost,
      uncapturedErrors: this.uncapturedErrors,
      presentation: this.presentationTelemetry(now),
    };
  }

  presentationTelemetry(now = this.clock()): PresentationFreshnessTelemetry {
    const pendingForMs = this.pendingCompletionStartedAt === null
      ? 0
      : Math.max(0, now - this.pendingCompletionStartedAt);
    const submissionRate = sequenceProgressRate({
      baselineSequence: this.progressBaselineSubmissionSequence,
      currentSequence: this.submissionSequence,
      windowStartedAt: this.progressWindowStartedAt,
      now,
    });
    const completionRate = sequenceProgressRate({
      baselineSequence: this.progressBaselineCompletionSequence,
      currentSequence: this.completedSequence,
      windowStartedAt: this.progressWindowStartedAt,
      now,
    });
    const currentSubmissionGapMs = Math.max(0, now - this.progressLastSubmissionAt);
    const currentCompletionGapMs = Math.max(0, now - this.progressLastCompletionAt);
    const status = classifyPresentationFreshness({
      deviceLost: this.deviceLost,
      completionFailures: this.completionFailures,
      submissionSequence: this.submissionSequence,
      completedSequence: this.completedSequence,
      pendingForMs,
      stallThresholdMs: WebGpuRenderRuntime.PRESENTATION_STALL_MS,
    });
    return {
      status,
      submissionSequence: this.submissionSequence,
      completedSequence: this.completedSequence,
      lastSubmittedAt: this.lastSubmittedAt,
      lastCompletedAt: this.lastCompletedAt,
      pendingSince: this.pendingCompletionStartedAt,
      pendingForMs,
      lastCompletionLatencyMs: this.lastCompletionLatencyMs,
      completionFailures: this.completionFailures,
      lastFailure: this.lastFailure,
      backpressureActive: shouldBackpressureWebGpuSubmissions(
        this.pendingCompletionStartedAt,
        now,
        WebGpuRenderRuntime.SUBMISSION_BACKPRESSURE_MS,
        this.submissionSequence - this.completedSequence,
        WebGpuRenderRuntime.MAX_IN_FLIGHT_SUBMISSIONS,
      ),
      skippedSubmissions: this.skippedSubmissions,
      progress: {
        windowStartedAt: this.progressWindowStartedAt,
        elapsedMs: submissionRate.elapsedMs,
        submissionAdvances: submissionRate.advances,
        completionAdvances: completionRate.advances,
        submittedHz: submissionRate.cadenceHz,
        completedHz: completionRate.cadenceHz,
        currentSubmissionGapMs,
        currentCompletionGapMs,
        maximumSubmissionGapMs: Math.max(this.progressMaximumSubmissionGapMs, currentSubmissionGapMs),
        maximumCompletionGapMs: Math.max(this.progressMaximumCompletionGapMs, currentCompletionGapMs),
        maximumPendingForMs: Math.max(this.progressMaximumPendingForMs, pendingForMs),
        submissionPacing: this.submissionPacing.summary(),
        completionPacing: this.completionPacing.summary(),
      },
    };
  }

  resetPresentationProgressTelemetry(reason = 'presentation progress reset', now = this.clock()): void {
    this.submissionPacing.reset(reason);
    this.completionPacing.reset(reason);
    // Full lifecycle resets (not endurance-window samples) establish a new
    // foreground observation epoch. An unresolved queue item may remain, but
    // hidden-tab time must not count against its one-second foreground fence.
    if (this.pendingCompletionStartedAt !== null) this.pendingCompletionStartedAt = now;
    this.resetPresentationProgressWindow(now);
  }

  resetPresentationProgressWindow(now = this.clock()): void {
    this.progressWindowStartedAt = now;
    this.progressBaselineSubmissionSequence = this.submissionSequence;
    this.progressBaselineCompletionSequence = this.completedSequence;
    this.progressLastSubmissionAt = now;
    this.progressLastCompletionAt = now;
    this.progressMaximumSubmissionGapMs = 0;
    this.progressMaximumCompletionGapMs = 0;
    this.progressMaximumPendingForMs = this.pendingCompletionStartedAt === null
      ? 0
      : Math.max(0, now - this.pendingCompletionStartedAt);
  }

  private scheduleCompletionProbe(now: number, force = false): Promise<void> | null {
    if (this.completionProbe) return this.completionProbe;
    if (!force && now < this.nextCompletionProbeAt) return null;
    const queue = this.device.queue;
    if (!queue?.onSubmittedWorkDone) return null;
    const sequence = this.submissionSequence;
    if (sequence <= this.completedSequence) return Promise.resolve();
    const startedAt = now;
    this.pendingCompletionStartedAt ??= startedAt;
    this.nextCompletionProbeAt = now + WebGpuRenderRuntime.COMPLETION_PROBE_INTERVAL_MS;
    const probe = queue.onSubmittedWorkDone()
      .then(() => {
        const completedAt = this.clock();
        const latencyStartedAt = Math.max(startedAt, this.pendingCompletionStartedAt ?? startedAt);
        const priorCompletedSequence = this.completedSequence;
        this.completedSequence = Math.max(this.completedSequence, sequence);
        if (this.completedSequence > priorCompletedSequence) {
          const completionGapMs = Math.max(0, completedAt - this.progressLastCompletionAt);
          this.progressMaximumCompletionGapMs = Math.max(this.progressMaximumCompletionGapMs, completionGapMs);
          this.completionPacing.record(completionGapMs / Math.max(1, this.completedSequence - priorCompletedSequence));
          this.progressLastCompletionAt = completedAt;
        }
        if (this.pendingCompletionStartedAt !== null) {
          this.progressMaximumPendingForMs = Math.max(
            this.progressMaximumPendingForMs,
            completedAt - this.pendingCompletionStartedAt,
          );
        }
        this.lastCompletedAt = completedAt;
        this.lastCompletionLatencyMs = Math.max(0, completedAt - latencyStartedAt);
        // A continuously busy queue is healthy when its completion frontier is
        // advancing. Measure pending age from the latest progress, not from the
        // moment any backlog first appeared, or long play is misclassified as
        // a stall despite regular completed frames.
        this.pendingCompletionStartedAt = pendingCompletionStartAfterProgress({
          completedAt,
          completedSequence: this.completedSequence,
          submissionSequence: this.submissionSequence,
        });
      })
      .catch((error: unknown) => {
        this.completionFailures += 1;
        this.lastFailure = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        if (this.completionProbe === probe) {
          this.completionProbe = null;
          if (this.completedSequence >= this.submissionSequence) this.pendingCompletionStartedAt = null;
        }
      });
    this.completionProbe = probe;
    return probe;
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
    if (telemetry.uncapturedErrors > 0) throw new Error(`WebGPU candidate verification failed closed: ${telemetry.lastUncapturedError}`);
  }

  setRenderTargetTelemetry(principalHdrSamples: number, bloomSamples: number): void {
    this.principalHdrSamples = principalHdrSamples;
    this.bloomSamples = bloomSamples;
  }

  configureOutput(exposure: number, toneMapping: ToneMappingMode = 'aces'): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = toneMappingForMode(toneMapping);
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
    if (options.autoUpdate !== undefined) this.lightShadowAutoUpdate = options.autoUpdate;
    if (options.needsUpdate !== undefined) this.lightShadowNeedsUpdate = options.needsUpdate;
  }

  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
  }

  shadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  requestShadowUpdate(needsUpdate = true): void {
    // Three's common WebGPU renderer updates shadow maps through the active
    // RenderPipeline. Renderer-level WebGL flags do not control that path.
    this.lightShadowNeedsUpdate = needsUpdate;
  }

  configureLightShadows(root: THREE.Object3D, autoUpdate: boolean, needsUpdate: boolean): number {
    // Three r185's ShadowNode reads scheduling from each LightShadow. Without
    // this, static profiles silently regenerate every shadow map every frame.
    this.lightShadowAutoUpdate = autoUpdate;
    this.lightShadowNeedsUpdate = needsUpdate;
    return configureSceneLightShadowSchedule(root, autoUpdate, needsUpdate);
  }

  shadowState(): ShadowRuntimeState {
    return {
      enabled: this.renderer.shadowMap.enabled,
      autoUpdate: this.lightShadowAutoUpdate,
      needsUpdate: this.lightShadowNeedsUpdate,
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
    return this.renderer.getMaxAnisotropy();
  }

  async compile(root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): Promise<void> {
    await this.renderer.compileAsync(root, camera, scene);
  }

  async compileAndRender(root: THREE.Object3D, _camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    let attachmentRoot = root;
    while (attachmentRoot.parent) attachmentRoot = attachmentRoot.parent;
    if (attachmentRoot !== scene) {
      throw new Error('WebGPU presentation prewarm root must be attached to the submitted scene');
    }
    if (this.presentationPrewarmBatch) {
      if (this.presentationPrewarmScene !== scene) {
        throw new Error('WebGPU presentation prewarm batch cannot span multiple submitted scenes');
      }
      return this.presentationPrewarmBatch;
    }
    // compileAsync() uses Three's default renderer context, while gameplay is
    // submitted through the TSL/HDR RenderPipeline. Building both contexts
    // doubles cold node/pipeline residency without warming the live path. One
    // forced pipeline submission compiles the exact context and the queue fence
    // below makes that work an admission boundary rather than a gameplay hitch.
    // Defer one microtask so independently staged presentation roots can join
    // the same exact scene submission. Rendering the whole TSL/HDR scene once
    // already compiles every visible staged root; submitting and fencing that
    // identical scene once per effect only multiplies cold admission time.
    this.presentationPrewarmScene = scene;
    let batch!: Promise<void>;
    batch = Promise.resolve().then(async () => {
      this.submitFrame(this.clock(), true);
      // Presentation-only effects prewarm behind the loading surface. Cold
      // Chrome/driver shader creation can exceed the live four-second fence,
      // especially when each QA page owns a fresh WebGPU device.
      await this.waitForSubmittedWork(12_000);
    }).finally(() => {
      if (this.presentationPrewarmBatch === batch) {
        this.presentationPrewarmBatch = null;
        this.presentationPrewarmScene = null;
      }
    });
    this.presentationPrewarmBatch = batch;
    return batch;
  }

  submitFrame(_frameTimestamp = this.clock(), force = false): boolean {
    if (this.deviceLost) throw new Error(this.lastFailure ?? 'WebGPU device lost');
    if (this.uncapturedErrors > 0) throw new Error(this.lastFailure ?? 'WebGPU uncaptured error');
    const admissionCheckedAt = this.clock();
    if (!force && shouldBackpressureWebGpuSubmissions(
      this.pendingCompletionStartedAt,
      admissionCheckedAt,
      WebGpuRenderRuntime.SUBMISSION_BACKPRESSURE_MS,
      this.submissionSequence - this.completedSequence,
      WebGpuRenderRuntime.MAX_IN_FLIGHT_SUBMISSIONS,
    )) {
      if (this.pendingCompletionStartedAt !== null) {
        this.progressMaximumPendingForMs = Math.max(
          this.progressMaximumPendingForMs,
          admissionCheckedAt - this.pendingCompletionStartedAt,
        );
      }
      this.scheduleCompletionProbe(admissionCheckedAt, true);
      this.skippedSubmissions += 1;
      return false;
    }
    this.renderer.info.reset();
    this.renderPipeline.render();
    // Queue latency begins only after Three has encoded/submitted the frame.
    // The rAF timestamp is intentionally not used: it predates simulation and
    // render encoding and previously misreported CPU hitches as GPU latency.
    const submittedAt = this.clock();
    // Three clears its public per-frame counters while asynchronous WebGPU
    // work retires. Capture the admitted submission synchronously so a later
    // queue fence cannot turn a real frame into a false zero-draw receipt.
    this.lastSubmittedRenderInfo = Object.freeze(webGpuRenderInfoSnapshot(this.renderer.info.render));
    this.submissionSequence += 1;
    const submissionGapMs = Math.max(0, submittedAt - this.progressLastSubmissionAt);
    this.progressMaximumSubmissionGapMs = Math.max(this.progressMaximumSubmissionGapMs, submissionGapMs);
    this.submissionPacing.record(submissionGapMs);
    this.progressLastSubmissionAt = submittedAt;
    this.lastSubmittedAt = submittedAt;
    // With a one-submission frontier, every admitted frame needs its own probe.
    // Honouring the 250 ms sampling throttle here leaves the queue at depth one
    // without a completion observer and forces the following display frame to
    // be skipped merely to attach that probe.
    this.scheduleCompletionProbe(submittedAt, true);
    return true;
  }

  resetRenderInfo(): void {
    this.renderer.info.reset();
    this.lastSubmittedRenderInfo = Object.freeze({ calls: 0, triangles: 0, points: 0, lines: 0 });
  }

  renderInfo(): RenderInfoSnapshot {
    // This is the most recent admitted frame, not cumulative lifetime calls.
    // Intentional backpressure skips do not erase its liveness evidence.
    return { ...this.lastSubmittedRenderInfo };
  }

  webGlVersion(): null {
    return null;
  }

  async readRenderTargetPixels(
    target: THREE.RenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<ArrayBufferView> {
    return this.renderer.readRenderTargetPixelsAsync(target, x, y, width, height);
  }

  async waitForSubmittedWork(timeoutMs = 4_000): Promise<void> {
    const targetSequence = this.submissionSequence;
    await awaitSubmissionCompletionTarget({
      targetSequence,
      completedSequence: () => this.completedSequence,
      createProbe: () => this.scheduleCompletionProbe(this.clock(), true),
      failure: () => this.lastFailure,
      timeoutMs,
    });
  }

  dispose(): void {
    this.device.removeEventListener?.('uncapturederror', this.uncapturedErrorListener);
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
