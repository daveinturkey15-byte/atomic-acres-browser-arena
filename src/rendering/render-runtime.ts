import * as THREE from 'three';
// HF-401: three's own console routing, so a node-build failure it SWALLOWS
// becomes a receipt this runtime publishes instead of a line nobody reads.
import { getConsoleFunction, setConsoleFunction } from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { assertTslCutoverReady } from './tsl-migration-inventory';
import {
  installFilmicGradeChain,
  type FilmicGradeChainHandle,
  type PostAntiAliasingMode,
  type SpatialUpscalingRequest,
} from './filmic-grade-chain';
import { DEFAULT_GRADE_PROFILE_ID, type GradeProfileId } from './grade-profile';
import type { ToneMappingMode } from '../graphics-settings-registry';
import { FramePacingSampler, type FramePacingSummary } from '../frame-pacing';
import {
  browserOwnsForegroundPresentation,
  browserPresentationIsVisible,
  waitForVisibleBrowserPreparation,
} from '../browser-preparation-scheduler';

export type RenderBackendId = 'webgl2' | 'webgpu';

export type WebGpuSubmissionMode = 'serialized' | 'warmed-live' | 'input-response';

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
  /**
   * Optional WebGPU device features actually GRANTED at device creation.
   * WebGPU hands a device only the optional features the caller asked for, so
   * this is the receipt that a feature-gated effect (SSGI) can run at all.
   */
  deviceFeatures: readonly string[];
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
  /** HF-401 — TSL node-build failures three swallowed. See `TslNodeBuildDiagnostics`. */
  tslNodeBuild: TslNodeBuildDiagnostics;
  presentation: PresentationFreshnessTelemetry;
}>;

export type RenderRuntimeHealthTelemetry = Readonly<{
  actualBackend: RenderBackendId;
  // HF-331: adapter identity rides on the live health/diagnostics surface so
  // live Firefox probing can confirm which physical adapter (or masked
  // "WebGPU adapter info unavailable" label) backs the reported backend
  // without a separate full telemetry() sample. Additive only.
  adapterLabel: string;
  deviceLost: boolean;
  uncapturedErrors: number;
  presentation: PresentationFreshnessTelemetry;
}>;

export type PresentationFreshnessTelemetry = Readonly<{
  status: 'synchronous' | 'warming' | 'healthy' | 'stalled' | 'device-lost' | 'failed';
  submissionMode: 'synchronous' | WebGpuSubmissionMode;
  maximumInFlightSubmissions: number;
  inFlightSubmissions: number;
  /** Oldest submission still awaiting its completion observer. */
  completionProbeTargetSequence: number | null;
  /** Completion observers currently in flight - one per unretired submission. */
  outstandingCompletionProbes: number;
  completionProbeCount: number;
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

/**
 * The cheap presented-frame counter surface. Deliberately allocation-light and
 * sort-free: a presented-frame sampler polls it faster than the frame rate it
 * is measuring.
 */
export type PresentationCounters = Readonly<{
  submissionSequence: number;
  completedSequence: number;
  inFlightSubmissions: number;
  maximumInFlightSubmissions: number;
  skippedSubmissions: number;
  starvationRecoveries: number;
  consecutiveRefusedSubmissions: number;
  outstandingCompletionProbes: number;
  lastSubmittedAt: number | null;
  /** Exact clock stamp of the most recently GPU-confirmed (presented) frame. */
  lastCompletedAt: number | null;
  lastCompletionLatencyMs: number | null;
  calls: number;
  triangles: number;
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
  maximumCompletionLatencyMs: number;
  submissionPacing: FramePacingSummary;
  completionPacing: FramePacingSummary;
}>;

// ---------------------------------------------------------------------------
// HF-401 — the swallowed TSL node-build failure, made observable
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS.
 *
 * Three r185 builds a render object's node graph inside a `try` in
 * `Nodes.getForRender()`. When that build throws, three does NOT rethrow: it
 * rebuilds the render object against a bare `NodeMaterial`, logs
 * `THREE.TSL: <error>` through its own `error()` helper, and carries on. The
 * draw succeeds, the arena admits, every gate stays green — and the object is
 * rendering a DEFAULT material instead of the one that was authored.
 *
 * That is the worst failure shape this renderer has: a feature that silently
 * stops being the feature, indistinguishable from one that was never built.
 * A console line nobody reads is not a gate.
 *
 * Three exposes `setConsoleFunction`, so the runtime can watch its own console
 * routing and publish a COUNT that a test can assert on. Everything is still
 * forwarded to the real console exactly as three would have printed it, so this
 * hides nothing; it only adds a receipt.
 */
export type TslNodeBuildDiagnostics = Readonly<{
  /** How many node-build failures three has swallowed since install. */
  count: number;
  /** The distinct messages, capped, most recent last. */
  messages: readonly string[];
}>;

/** Dataset key the swallowed-failure count is published under. */
export const TSL_NODE_BUILD_ERROR_ATTRIBUTE = 'tslNodeBuildErrors';

/** Minimum surface the receipt needs, so a suite can supply one without a DOM. */
export type TslDiagnosticsTarget = { dataset: Record<string, string | undefined> };

export type TslNodeBuildDiagnosticsHandle = Readonly<{
  read(): TslNodeBuildDiagnostics;
  reset(): void;
  uninstall(): void;
}>;

const TSL_NODE_BUILD_MESSAGE_CAP = 8;

type ThreeConsoleFunction = (type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]) => void;

/**
 * Three's runtime stores whatever it is given and `getConsoleFunction()`
 * returns `null` when nothing is installed — its `.d.ts` declares both as
 * non-nullable. These two wrappers keep the honest nullability at our boundary
 * instead of pretending a missing hook is a function.
 */
const currentThreeConsoleFunction = (): ThreeConsoleFunction | null =>
  (getConsoleFunction() as ThreeConsoleFunction | null) ?? null;
const installThreeConsoleFunction = (fn: ThreeConsoleFunction | null): void => {
  (setConsoleFunction as unknown as (value: ThreeConsoleFunction | null) => void)(fn);
};

/** Every message three routes through `error()` from the node-build catch. */
const TSL_NODE_BUILD_ERROR_PREFIX = 'THREE.TSL:';

/**
 * Installs the observer. Idempotent per target: calling it again replaces the
 * previous installation rather than stacking forwarders.
 */
export function installTslNodeBuildDiagnostics(
  target: TslDiagnosticsTarget | null = typeof document === 'undefined'
    ? null
    : (document.documentElement as unknown as TslDiagnosticsTarget),
): TslNodeBuildDiagnosticsHandle {
  const messages: string[] = [];
  let count = 0;
  const previous = currentThreeConsoleFunction();

  const publish = (): void => {
    if (!target) return;
    target.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE] = String(count);
  };

  const forward = (type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]): void => {
    if (previous) {
      previous(type, message, ...params);
      return;
    }
    // Reproduce three's own native routing exactly, including the StackTrace
    // rendering, so installing this changes nothing a developer sees.
    const stackTrace = params[0] as { isStackTrace?: boolean; getError?: (message: string) => Error } | undefined;
    const rendered = stackTrace?.isStackTrace && stackTrace.getError
      ? [stackTrace.getError(message)]
      : [message, ...params];
    if (type === 'error') console.error(...rendered);
    else if (type === 'warn') console.warn(...rendered);
    else console.log(...rendered);
  };

  const observer = (type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]): void => {
    if (type === 'error' && typeof message === 'string' && message.startsWith(TSL_NODE_BUILD_ERROR_PREFIX)) {
      count += 1;
      if (!messages.includes(message)) {
        messages.push(message);
        if (messages.length > TSL_NODE_BUILD_MESSAGE_CAP) messages.shift();
      }
      publish();
    }
    forward(type, message, ...params);
  };

  installThreeConsoleFunction(observer);
  publish();

  return Object.freeze({
    read: (): TslNodeBuildDiagnostics => Object.freeze({ count, messages: Object.freeze([...messages]) }),
    reset: (): void => {
      count = 0;
      messages.length = 0;
      publish();
    },
    uninstall: (): void => {
      if (currentThreeConsoleFunction() === observer) installThreeConsoleFunction(previous);
      if (target) delete target.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE];
    },
  });
}

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
    rateHz: 0,
    cadenceHz: 0,
    meanMs: 0,
    p05Ms: 0,
    medianMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    longFrames: { over20Ms: 0, over33Ms: 0, over50Ms: 0, over100Ms: 0 },
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
 * explicit render pauses, or normal bounded queue backpressure as missing
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

/**
 * How deep the warmed live queue may run before admission refuses a frame.
 *
 * MEASURED, not chosen. Presentation is bounded by depth / completion-fence
 * latency, and the fence on this hardware resolves in 18-46 ms while the frame
 * itself costs the GPU almost nothing (14-18% utilisation across every soak).
 * A depth of two therefore capped presentation at ~50 fps no matter how cheap
 * the frame was: 107.9 requestAnimationFrame callbacks per second against 50.9
 * presented frames, with 52.8% of submissions refused. Reproduce with
 * `node scripts/qa/measure-presented-frames.mjs --no-vsync`.
 */
export const WARMED_LIVE_MAX_IN_FLIGHT_SUBMISSIONS = 3;

export function maximumInFlightWebGpuSubmissions(mode: WebGpuSubmissionMode): number {
  // An input-response frame is allowed exactly one slot beyond the warmed live
  // frontier so a shot or a turn is never the frame that admission refuses.
  if (mode === 'input-response') return WARMED_LIVE_MAX_IN_FLIGHT_SUBMISSIONS + 1;
  return mode === 'warmed-live' ? WARMED_LIVE_MAX_IN_FLIGHT_SUBMISSIONS : 1;
}

/**
 * The relief valve for the presentation collapse.
 *
 * THE COLLAPSE. Completion latency walks from ~5 ms to ~48 ms in about three
 * seconds and never recovers: admission refuses frames, the starved GPU drops
 * to 700-780 MHz, the low clocks keep the fence slow, and the slow fence keeps
 * refusing. It is hysteresis, and nothing in the loop breaks it - the match
 * finishes pinned near 20 fps with the GPU at 14% utilisation.
 *
 * Backpressure is right when the GPU is genuinely saturated and wrong when it
 * is asleep, and a page cannot read GPU utilisation. Draw calls and triangles
 * are the available proxy for frame cost: below these ceilings no frame can
 * plausibly be occupying a discrete GPU for a quarter of a second, so a long
 * refusal streak is starvation rather than saturation, and admitting one frame
 * both re-feeds the GPU and re-opens the observation window.
 *
 * It admits ONE frame and resets the streak, so it is a bounded floor of one
 * frame per `refusalStreakThreshold` refused attempts - never an override of
 * backpressure for a device that is really wedged.
 */
export function shouldRecoverStarvedPresentation(input: Readonly<{
  consecutiveRefusedSubmissions: number;
  refusalStreakThreshold: number;
  inFlightSubmissions: number;
  maximumInFlightSubmissions: number;
  drawCalls: number;
  triangles: number;
  trivialDrawCallCeiling: number;
  trivialTriangleCeiling: number;
}>): boolean {
  if (input.refusalStreakThreshold <= 0) return false;
  if (input.consecutiveRefusedSubmissions < input.refusalStreakThreshold) return false;
  // Pinned AT the bound, not merely near it: this is the queue-depth clause of
  // backpressure refusing, which is the clause that starves the GPU.
  if (input.inFlightSubmissions < input.maximumInFlightSubmissions) return false;
  // An unknown frame cost is not a cheap frame. Three's WebGPU backend reports
  // `drawCalls`, and a snapshot taken from the wrong field yields undefined -
  // which must keep backpressure, never open the valve.
  if (!Number.isFinite(input.drawCalls) || !Number.isFinite(input.triangles)) return false;
  return input.drawCalls <= input.trivialDrawCallCeiling
    && input.triangles <= input.trivialTriangleCeiling;
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

/**
 * Never let a diagnostic string be the thing that throws. A `describe` hook
 * reads live runtime state, and a failure inside it during an already-failing
 * deadline would replace a precise queue error with an unrelated one.
 */
function describeFrontier(describe: (() => string) | undefined): string {
  if (!describe) return '';
  try {
    const detail = describe();
    return detail ? `, ${detail}` : '';
  } catch {
    return ', frontier description unavailable';
  }
}

/**
 * Fails closed on a queue-completion deadline, and SAYS WHY.
 *
 * The message this rejects with is the one the player reads when a deployment
 * bounces ("Deployment preparation failed: WebGPU queue completion exceeded
 * 4000 ms for submission 35"). It used to carry only the bound and the target
 * sequence, which is not enough to tell a wedged device apart from a cold
 * first-use compile, nor to locate WHICH of the several fences in the
 * admission path blew - two passes at the MAX-preset admission bound were
 * spent re-deriving that from stage timings. `describe` lets the caller attach
 * the live frontier state to the failure so the next reader gets it for free.
 *
 * The bound itself is untouched: same timeout, same fail-closed decision, same
 * message prefix. Only the diagnosis is richer.
 */
export async function awaitSubmissionCompletionTarget(input: Readonly<{
  targetSequence: number;
  completedSequence: () => number;
  createProbe: () => Promise<void> | null;
  failure: () => string | null;
  timeoutMs: number;
  /** Optional one-line frontier description appended to a deadline failure. */
  describe?: () => string;
}>): Promise<void> {
  if (input.completedSequence() >= input.targetSequence) return;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<void>((resolve, reject) => {
    timeoutHandle = setTimeout(
      () => {
        // A queue probe can advance the shared completion frontier in the same
        // turn that the deadline fires. Give that already-settling work one
        // microtask to publish its state, then keep the original deadline
        // fail-closed if the captured target is still incomplete.
        void Promise.resolve().then(() => {
          const failure = input.failure();
          if (failure) {
            reject(new Error(`WebGPU queue completion failed: ${failure}`));
          } else if (input.completedSequence() >= input.targetSequence) {
            resolve();
          } else {
            reject(new Error(
              `WebGPU queue completion exceeded ${input.timeoutMs} ms for submission ${input.targetSequence}`
              + ` (completed ${input.completedSequence()}${describeFrontier(input.describe)})`,
            ));
          }
        });
      },
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
  backend?: RenderBackendId;
  compileAndRender(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void>;
}>;

export function resolveRenderRuntimeRequest(search: string, webGpuAvailable = true): RenderRuntimeRequest {
  // Owner 2026-08-30: "retire all webgl2 stuff, full webgpu, no fallback."
  // WebGPU is the only route. Chrome ships it everywhere; Firefox ships it on
  // Windows since 141 (installed Firefox 154 exposes navigator.gpu here). A
  // browser without navigator.gpu gets the honest requirement screen at
  // renderer init instead of a silently slower second engine. ?renderer=webgl2
  // is retired with the fallback; ?renderer=webgpu stays the explicit HITL
  // contract spelling of the same thing.
  void search;
  void webGpuAvailable;
  return { requestedBackend: 'webgpu', requireWebGPU: true };
}

function webGlAdapterLabel(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}

function suppressUnrelatedRenderables(
  scene: THREE.Scene,
  roots: readonly THREE.Object3D[],
): () => void {
  const retained = new Set<THREE.Object3D>();
  for (const root of roots) {
    root.traverse((node) => retained.add(node));
    for (let node: THREE.Object3D | null = root; node; node = node.parent) retained.add(node);
  }
  scene.traverse((node) => {
    if (!(node instanceof THREE.Light)) return;
    for (let ancestor: THREE.Object3D | null = node; ancestor; ancestor = ancestor.parent) retained.add(ancestor);
  });

  const hidden = new Map<THREE.Object3D, boolean>();
  scene.traverse((node) => {
    const renderable = node instanceof THREE.Mesh
      || node instanceof THREE.Line
      || node instanceof THREE.Points
      || node instanceof THREE.Sprite;
    if (!renderable || retained.has(node) || !node.visible) return;
    hidden.set(node, node.visible);
    node.visible = false;
  });
  return () => {
    for (const [node, visible] of hidden) node.visible = visible;
  };
}

function suppressUnrelatedWebGlRenderables(scene: THREE.Scene, root: THREE.Object3D): () => void {
  return suppressUnrelatedRenderables(scene, [root]);
}

export class LegacyWebGlRenderRuntime {
  readonly backend = 'webgl2' as const;
  readonly renderer: THREE.WebGLRenderer;
  private readonly adapterLabel: string;

  private readonly tslDiagnostics: TslNodeBuildDiagnosticsHandle;

  private constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.adapterLabel = webGlAdapterLabel(renderer);
    // The compatibility route builds no TSL graphs, so this reports a truthful
    // zero. It is installed anyway so the receipt exists on both backends and a
    // gate never has to special-case "the field is missing" as "no failures".
    this.tslDiagnostics = installTslNodeBuildDiagnostics();
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
      deviceFeatures: EMPTY_DEVICE_FEATURES,
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
      tslNodeBuild: this.tslDiagnostics.read(),
      presentation: this.presentationTelemetry(),
    };
  }

  /** HF-401 — parity surface with the WebGPU runtime; always zero on this route. */
  tslNodeBuildDiagnostics(): TslNodeBuildDiagnostics {
    return this.tslDiagnostics.read();
  }

  healthTelemetry(now = performance.now()): RenderRuntimeHealthTelemetry {
    const deviceLost = this.renderer.getContext().isContextLost();
    return {
      actualBackend: 'webgl2',
      adapterLabel: this.adapterLabel,
      deviceLost,
      uncapturedErrors: 0,
      presentation: this.presentationTelemetry(now),
    };
  }

  /**
   * WebGL presents synchronously inside the draw call, so submitted, completed
   * and presented are the same event and nothing is ever refused.
   */
  presentationCounters(): PresentationCounters {
    return {
      submissionSequence: 0,
      completedSequence: 0,
      inFlightSubmissions: 0,
      maximumInFlightSubmissions: 0,
      skippedSubmissions: 0,
      starvationRecoveries: 0,
      consecutiveRefusedSubmissions: 0,
      outstandingCompletionProbes: 0,
      lastSubmittedAt: null,
      lastCompletedAt: null,
      lastCompletionLatencyMs: null,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  presentationTelemetry(now = performance.now()): PresentationFreshnessTelemetry {
    const lost = this.renderer.getContext().isContextLost();
    const pacing = emptyFramePacingSummary('synchronous WebGL presentation');
    return {
      status: lost ? 'device-lost' : 'synchronous',
      submissionMode: 'synchronous',
      maximumInFlightSubmissions: 0,
      inFlightSubmissions: 0,
      completionProbeTargetSequence: null,
      outstandingCompletionProbes: 0,
      completionProbeCount: 0,
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
        maximumCompletionLatencyMs: 0,
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
    let attachmentRoot = root;
    while (attachmentRoot.parent) attachmentRoot = attachmentRoot.parent;
    if (attachmentRoot !== scene) {
      throw new Error('WebGL presentation prewarm root must be attached to the submitted scene');
    }
    await this.compile(root, camera, scene);
    // compileAsync can outlive the foreground turn that admitted it. Recheck
    // immediately before the synchronous draw so a mid-compile tab switch can
    // never leak one hidden WebGL frame.
    // Presentation pools stage exact-scale buffers and authored materials, but
    // they must not redraw the complete cold arena once per effect family. The
    // selected scene's lights remain available to the staged root; the final
    // AtomicSignal coverage and match-composition renders still prove the full
    // world. This removes redundant whole-map raster/driver work without
    // deferring any effect geometry, texture, material or upload into combat.
    // Same bounded-patience rule as the WebGPU path: wait for real focus a few
    // times, then accept a visible document. An unfocused window used to spin
    // here forever and never finish loading.
    for (let attempt = 0; ; attempt += 1) {
      await waitForVisibleBrowserPreparation();
      const restoreVisibility = suppressUnrelatedWebGlRenderables(scene, root);
      try {
        // The visibility traversal itself can race a tab switch. Recheck at
        // the final synchronous boundary and retry without authoring a frame.
        const ready = attempt >= 3
          ? browserPresentationIsVisible()
          : browserOwnsForegroundPresentation();
        if (!ready) continue;
        this.renderer.render(scene, camera);
        return;
      } finally {
        restoreVisibility();
      }
    }
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
  features?: GpuFeatureSetShape;
  constructor?: { name?: string };
}>;

type GpuAdapterInfoShape = Readonly<Record<string, string | number | boolean | undefined>>;
type GpuFeatureSetShape = Readonly<{ has(name: string): boolean }>;
type GpuAdapterShape = Readonly<{
  info?: GpuAdapterInfoShape;
  isFallbackAdapter?: boolean;
  features?: GpuFeatureSetShape;
  requestAdapterInfo?: () => Promise<GpuAdapterInfoShape>;
  requestDevice(descriptor?: Readonly<{ requiredFeatures: readonly string[] }>): Promise<GpuDeviceShape>;
  constructor?: { name?: string };
}>;

type GpuNavigatorShape = Readonly<{
  gpu?: Readonly<{
    requestAdapter(options?: Readonly<{ powerPreference?: 'high-performance' | 'low-power' }>): Promise<GpuAdapterShape | null>;
  }>;
}>;

const EMPTY_DEVICE_FEATURES: readonly string[] = Object.freeze([]);

/**
 * Optional WebGPU device features this renderer asks for when the adapter has
 * them. This is an ALLOWLIST with a named consumer per entry, never a blanket
 * `[...adapter.features]`: every granted feature is surface a driver bug can
 * reach, so one is only added when something in the app actually needs it.
 *
 * WHY THIS EXISTS AT ALL. WebGPU grants a device exactly the optional features
 * the caller requests — an adapter advertising a feature does NOT put it on the
 * device. This runtime called `requestDevice()` with no descriptor, so every
 * optional feature was structurally absent and the MAX preset's SSGI died at
 * pipeline creation on every machine:
 *   "THREE.SSGINode: The device does not support the 'rg11b10ufloat-renderable'
 *    feature which is required for SSGI"
 * followed by an invalid command buffer that failed the whole queue submit and
 * took arena admission down with it. Headless QA could never see it: headless
 * Chromium here has no navigator.gpu at all, so nothing automated ever ran the
 * MAX WebGPU route.
 */
export const OPTIONAL_WEBGPU_DEVICE_FEATURES: readonly string[] = Object.freeze([
  // Consumer: THREE.SSGINode's RG11B10 GI render target (MAX preset).
  'rg11b10ufloat-renderable',
  // Consumer: linear filtering of the float HDR targets the bloom downsample
  // chain and the grade chain sample; without it those silently drop to point.
  'float32-filterable',
]);

/**
 * Intersects the allowlist with what the adapter actually advertises. Pure and
 * exported so the contract is testable without a GPU — and the intersection is
 * mandatory, because requesting a feature the adapter lacks makes
 * `requestDevice` reject outright, turning a missing nicety into a dead
 * renderer.
 */
export function selectOptionalDeviceFeatures(
  adapterFeatures: Readonly<{ has(name: string): boolean }> | undefined,
  allowList: readonly string[] = OPTIONAL_WEBGPU_DEVICE_FEATURES,
): readonly string[] {
  if (!adapterFeatures || typeof adapterFeatures.has !== 'function') return EMPTY_DEVICE_FEATURES;
  return Object.freeze(allowList.filter((feature) => {
    try { return adapterFeatures.has(feature) === true; } catch { return false; }
  }));
}

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
  /**
   * HF-362 — the filmic grade chain that owns everything after the scene
   * pass's linear-HDR output, including the explicit tone map. It is installed
   * on the RenderPipeline at construction so the profile reaches the screen
   * regardless of which module assembles the scene pass.
   */
  private readonly filmicGrade: FilmicGradeChainHandle;
  private deviceLost = false;
  private disposed = false;
  private readonly canvasAntialias: boolean;
  private readonly canvasSamples: number;
  private readonly adapterLabel: string;
  private readonly adapterClass: string;
  private readonly deviceClass: string;
  private readonly deviceFeatures: readonly string[];
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
  /**
   * One outstanding completion observer per submission, keyed by the sequence
   * it proves. Several may be in flight; they settle in submission order.
   */
  private readonly completionProbes = new Map<number, Promise<void>>();
  private completionProbeCount = 0;
  private submissionMode: WebGpuSubmissionMode = 'serialized';
  private presentationPrewarmBatch: Promise<void> | null = null;
  private presentationPrewarmScene: THREE.Scene | null = null;
  private readonly presentationPrewarmRoots = new Set<THREE.Object3D>();
  private presentationPrewarmCollecting = false;
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
  /**
   * Refusals since the last admitted frame. A streak is the only in-page
   * evidence that admission - not GPU cost - is what stopped presenting.
   */
  private consecutiveRefusedSubmissions = 0;
  private starvationRecoveries = 0;
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
  private progressMaximumCompletionLatencyMs = 0;
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
  private readonly tslDiagnostics: TslNodeBuildDiagnosticsHandle;
  /**
   * Polite attempts to acquire real focus before cold prewarm settles for a
   * visible-but-unfocused document. Each attempt costs one foreground-wait
   * fallback, so this is a few seconds of patience, not a spin.
   */
  private static readonly PREWARM_FOCUS_ATTEMPTS = 3;

  private static readonly SUBMISSION_BACKPRESSURE_MS = 250;
  /**
   * Refusals in a row before starvation relief admits one frame. At the
   * ~110 admission attempts per second this frame loop makes, eight refusals is
   * about 70 ms of no presentation - long enough that it is not a single
   * expensive frame, short enough that the relief valve keeps a floor well
   * above the ~20 fps the collapse pinned the owner at.
   */
  private static readonly STARVATION_REFUSAL_STREAK = 8;
  /**
   * "This frame cannot be what is keeping the GPU busy." A live Atomic Acres
   * frame measures ~181 draw calls and ~528k triangles at 1440p (measured by
   * scripts/qa/measure-presented-frames.mjs); these ceilings sit an order of
   * magnitude above that, so genuine GPU saturation still keeps its
   * backpressure while a starved-but-cheap frame gets relief.
   */
  private static readonly STARVATION_TRIVIAL_DRAW_CALLS = 6_000;
  private static readonly STARVATION_TRIVIAL_TRIANGLES = 12_000_000;
  // Cold compilation, prewarm, transitions and explicit renderer mutations
  // remain one-deep. Only the already-fenced, warmed live path may keep two
  // submissions in flight; that is the smallest frontier which avoids making
  // every presented frame wait for its own queue-completion promise.
  // Cold shader/shadow compilation on the frozen owner hardware can retire in
  // ~2.4 s. Backpressure still stops new work at 250 ms; twelve seconds matches
  // the explicit cold-generation fence and distinguishes cold work from a hang.
  // Admission rejects catastrophic completion latency, while bounded Custom
  // adaptation uses only proven submitted-frame cadence. Keep the live fatal
  // fence for a genuinely non-progressing device, not an isolated slow frame.
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
      deviceFeatures?: readonly string[];
      softwareAdapter: boolean;
      device: GpuDeviceShape;
      now?: () => number;
      gradeProfileId?: GradeProfileId;
    }>,
  ) {
    this.renderer = renderer;
    this.renderPipeline = renderPipeline;
    this.canvasAntialias = identity.canvasAntialias;
    this.canvasSamples = identity.canvasSamples;
    this.adapterLabel = identity.adapterLabel;
    this.adapterClass = identity.adapterClass;
    this.deviceClass = identity.deviceClass;
    this.deviceFeatures = identity.deviceFeatures ?? EMPTY_DEVICE_FEATURES;
    this.softwareAdapter = identity.softwareAdapter;
    this.device = identity.device;
    this.clock = identity.now ?? (() => performance.now());
    // Install before any scene-pass assembler publishes an outputNode. The
    // chain intercepts that assignment, keeps the published node as its
    // linear-HDR source, and takes over the output transform (stage 7) so the
    // display-referred stages can exist at all.
    this.filmicGrade = installFilmicGradeChain(renderPipeline, {
      profileId: identity.gradeProfileId ?? DEFAULT_GRADE_PROFILE_ID,
    });
    this.resetPresentationProgressTelemetry('renderer initialized', this.clock());
    // HF-401: watch three's console routing for the node-build failures it
    // catches and hides. Installed unconditionally and before any arena graph
    // is assembled, because the failure it catches happens during the very
    // first pipeline build of a transition.
    this.tslDiagnostics = installTslNodeBuildDiagnostics();
    this.installNodeBuildTrace();
    identity.device.addEventListener?.('uncapturederror', this.uncapturedErrorListener);
    void identity.device.lost?.then((info) => {
      const record = info as { reason?: unknown; message?: unknown } | undefined;
      const reason = record?.reason === undefined ? 'unknown' : String(record.reason);
      // device.destroy() resolves GPUDevice.lost with reason "destroyed".
      // That is successful page-exit cleanup, not a live renderer failure.
      if (this.disposed && reason === 'destroyed') return;
      this.deviceLost = true;
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
    gradeProfileId?: GradeProfileId;
  }>): Promise<WebGpuRenderRuntime> {
    const gpu = (navigator as unknown as GpuNavigatorShape).gpu;
    if (!gpu) throw new Error('WebGPU was required, but navigator.gpu is unavailable');
    // Owner 2026-08-31: he could not launch the game at all in his everyday
    // Chrome - "This game needs WebGPU ... (WebGPU was required, but no
    // high-performance adapter was available)" - while a fresh Chrome, a copy of
    // his GPU caches and a pristine profile all acquired an adapter fine on the
    // same machine, same URL, same second.
    //
    // The cause was here, not on his machine. powerPreference is a HINT, not a
    // requirement: per spec a browser may return null for a hinted request while
    // a perfectly usable default adapter exists, and it does so in real
    // conditions - power saving, an integrated GPU preferred, or an instance
    // that has been running long enough to be holding many GPU contexts. This
    // asked for high-performance and then gave up on the whole game.
    //
    // Note the asymmetry it sat next to: requestDevice below already falls back
    // to a bare device "rather than killing the whole renderer". The adapter
    // deserved the same courtesy.
    let adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    let adapterFallback: 'high-performance' | 'default' = 'high-performance';
    if (!adapter) {
      adapter = await gpu.requestAdapter();
      adapterFallback = 'default';
    }
    if (!adapter) throw new Error('WebGPU was required, but no GPU adapter was available at all');
    const adapterInfo = adapter.info ?? await adapter.requestAdapterInfo?.() ?? {};
    // Surface the fallback rather than hiding it: if we are running on the
    // default adapter because the high-performance hint came back empty, that
    // is worth seeing in telemetry and in any bug report.
    const adapterLabel = adapterFallback === 'default'
      ? `${adapterInfoLabel(adapterInfo)} (default adapter; high-performance hint unavailable)`
      : adapterInfoLabel(adapterInfo);
    const requiredFeatures = selectOptionalDeviceFeatures(adapter.features);
    // Ask with the intersected list, and fall back to a bare device rather than
    // killing the whole renderer if a driver rejects a feature it advertised.
    const device = requiredFeatures.length > 0
      ? await adapter.requestDevice({ requiredFeatures }).catch(() => adapter.requestDevice())
      : await adapter.requestDevice();
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
      deviceFeatures: selectOptionalDeviceFeatures(device.features),
      softwareAdapter: adapter.isFallbackAdapter === true || /swiftshader|llvmpipe|software|softpipe|\bwarp\b/i.test(adapterLabel),
      device,
      gradeProfileId: parameters.gradeProfileId,
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
      deviceFeatures: this.deviceFeatures,
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
      tslNodeBuild: this.tslDiagnostics.read(),
      presentation: this.presentationTelemetry(),
    };
  }

  /** HF-401 — TSL node-build failures three caught and hid, as a readable count. */
  tslNodeBuildDiagnostics(): TslNodeBuildDiagnostics {
    return this.tslDiagnostics.read();
  }

  healthTelemetry(now = this.clock()): RenderRuntimeHealthTelemetry {
    const backend = this.renderer.backend as WebGpuBackendShape;
    return {
      actualBackend: backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2',
      adapterLabel: this.adapterLabel,
      deviceLost: this.deviceLost,
      uncapturedErrors: this.uncapturedErrors,
      presentation: this.presentationTelemetry(now),
    };
  }

  /**
   * The presented-frame counters ONLY, with no pacing-window sort.
   *
   * WHY THIS EXISTS: `presentationTelemetry()` sorts two 180-sample windows on
   * every call, so it is a four-Hz surface. A presented-frame instrument has to
   * sample faster than the frames it is counting, and it must not become the
   * cost it is measuring. These fields are plain reads.
   *
   * `lastCompletedAt` is the exact clock stamp of the frame the GPU most
   * recently confirmed, so a sampler polling faster than the presentation rate
   * reconstructs an exact presented-frame interval series from it - it never
   * has to time a requestAnimationFrame callback and call that a frame.
   */
  presentationCounters(): PresentationCounters {
    return {
      submissionSequence: this.submissionSequence,
      completedSequence: this.completedSequence,
      inFlightSubmissions: Math.max(0, this.submissionSequence - this.completedSequence),
      maximumInFlightSubmissions: maximumInFlightWebGpuSubmissions(this.submissionMode),
      skippedSubmissions: this.skippedSubmissions,
      starvationRecoveries: this.starvationRecoveries,
      consecutiveRefusedSubmissions: this.consecutiveRefusedSubmissions,
      outstandingCompletionProbes: this.outstandingCompletionProbeCount(),
      lastSubmittedAt: this.lastSubmittedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastCompletionLatencyMs: this.lastCompletionLatencyMs,
      calls: this.lastSubmittedRenderInfo.calls,
      triangles: this.lastSubmittedRenderInfo.triangles,
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
    const inFlightSubmissions = Math.max(0, this.submissionSequence - this.completedSequence);
    const maximumInFlightSubmissions = maximumInFlightWebGpuSubmissions(this.submissionMode);
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
      submissionMode: this.submissionMode,
      maximumInFlightSubmissions,
      inFlightSubmissions,
      completionProbeTargetSequence: this.oldestOutstandingProbeSequence(),
      outstandingCompletionProbes: this.completionProbes.size,
      completionProbeCount: this.completionProbeCount,
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
        inFlightSubmissions,
        maximumInFlightSubmissions,
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
        maximumCompletionLatencyMs: this.progressMaximumCompletionLatencyMs,
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
    // hidden-tab time must not count against its foreground completion fence.
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
    this.progressMaximumCompletionLatencyMs = 0;
  }

  private outstandingCompletionProbeCount(): number {
    return this.completionProbes.size;
  }

  private oldestOutstandingProbeSequence(): number | null {
    let oldest: number | null = null;
    for (const sequence of this.completionProbes.keys()) {
      if (oldest === null || sequence < oldest) oldest = sequence;
    }
    return oldest;
  }

  /**
   * Observe ONE submission's retirement.
   *
   * WHY PER SUBMISSION. This used to keep a single mutable probe: while it was
   * outstanding, no second observer could be attached, so the completion
   * frontier could advance at most one probe-resolution at a time. Combined
   * with a queue-depth bound, that made the fence the frame timer - and an
   * `onSubmittedWorkDone` round trip costs 18-46 ms on this hardware whether
   * the frame drew 181 calls or nothing at all. Presentation was therefore
   * pinned near 50 fps with the GPU at 14% utilisation.
   *
   * `onSubmittedWorkDone()` resolves once everything submitted before the call
   * has retired, so a probe attached after submission N proves the frontier has
   * reached at least N. Attaching one per submission lets those observations
   * pipeline: several can be in flight, they settle in order, and the frontier
   * advances with each one instead of waiting for a fresh round trip.
   */
  private attachCompletionProbe(sequence: number, startedAt: number): Promise<void> | null {
    if (sequence <= this.completedSequence) return Promise.resolve();
    const existing = this.completionProbes.get(sequence);
    if (existing) return existing;
    const queue = this.device.queue;
    if (!queue?.onSubmittedWorkDone) return null;
    this.pendingCompletionStartedAt ??= startedAt;
    this.completionProbeCount += 1;
    const probe = queue.onSubmittedWorkDone()
      .then(() => {
        const completedAt = this.clock();
        const priorCompletedSequence = this.completedSequence;
        this.completedSequence = Math.max(this.completedSequence, sequence);
        if (this.completedSequence > priorCompletedSequence) {
          const completionGapMs = Math.max(0, completedAt - this.progressLastCompletionAt);
          this.progressMaximumCompletionGapMs = Math.max(this.progressMaximumCompletionGapMs, completionGapMs);
          this.completionPacing.record(completionGapMs / Math.max(1, this.completedSequence - priorCompletedSequence));
          this.progressLastCompletionAt = completedAt;
          this.lastCompletedAt = completedAt;
          // This probe's OWN submission stamp, so the reported latency is the
          // real queue residency of THIS frame. Pipelined observers each carry
          // their own start; a single shared pending age would report one
          // number for frames with genuinely different residencies.
          //
          // The floor is the current observation epoch: a tab that was hidden,
          // unfocused or paused between submit and retire must not charge that
          // wall-clock time to the device. In steady play the frame's own stamp
          // is the later of the two, so this clamp is inert.
          const latencyStartedAt = Math.max(startedAt, this.pendingCompletionStartedAt ?? startedAt);
          this.lastCompletionLatencyMs = Math.max(0, completedAt - latencyStartedAt);
          this.progressMaximumCompletionLatencyMs = Math.max(
            this.progressMaximumCompletionLatencyMs,
            this.lastCompletionLatencyMs,
          );
        }
        if (this.pendingCompletionStartedAt !== null) {
          this.progressMaximumPendingForMs = Math.max(
            this.progressMaximumPendingForMs,
            completedAt - this.pendingCompletionStartedAt,
          );
        }
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
        this.completionProbes.delete(sequence);
        if (this.completedSequence >= this.submissionSequence) this.pendingCompletionStartedAt = null;
      });
    this.completionProbes.set(sequence, probe);
    return probe;
  }

  /**
   * Observe the CURRENT frontier. Used by the drain paths and by admission when
   * it refuses, where the caller wants "tell me when everything submitted so
   * far has retired", not a specific frame.
   */
  private scheduleCompletionProbe(now: number): Promise<void> | null {
    return this.attachCompletionProbe(this.submissionSequence, now);
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

  configureOutput(
    exposure: number,
    toneMapping: ToneMappingMode = 'aces',
    gradeProfileId?: GradeProfileId,
  ): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = toneMappingForMode(toneMapping);
    this.renderer.toneMappingExposure = exposure;
    // Tone mapping mode and exposure are consumed by the chain's explicit
    // stage-7 renderOutput() through the RenderPipeline context, so both keep
    // working unchanged; the pipeline rebuilds when either value moves.
    if (gradeProfileId !== undefined) this.filmicGrade.setProfile(gradeProfileId);
  }

  /** HF-362 - selects the frozen filmic grade profile for this session. */
  setGradeProfile(gradeProfileId: GradeProfileId): void {
    this.filmicGrade.setProfile(gradeProfileId);
  }

  gradeProfileId(): GradeProfileId {
    return this.filmicGrade.profileId();
  }

  /** The built chain receipt, in order. Matches GRADE_CHAIN_STAGES. */
  gradeChainStages(): readonly string[] {
    return this.filmicGrade.stages();
  }

  /**
   * The PLAYER'S vignette setting, handed to the display-referred stage. The
   * chain composes the current arena's authored vignette character on top and
   * caps the result (see art-direction.ts DISPLAY_VIGNETTE_MAXIMUM), so the
   * screen periphery enemies enter from keeps a proven luminance floor.
   */
  setDisplayVignetteStrength(strength: number): void {
    this.filmicGrade.setDisplayVignetteStrength(strength);
  }

  /**
   * Lane L — the arena art direction currently composed into the grade chain,
   * for diagnostics and QA receipts. Null until the Pass 64 scene assembler
   * pushes the first arena.
   */
  arenaArtDirectionId(): string | null {
    return this.filmicGrade.arenaArtDirection()?.id ?? null;
  }

  /** Arena-authored grain strength, in 8-bit output steps. */
  setGradeGrainStrength(strength8Bit: number): void {
    this.filmicGrade.setGrainStrength8Bit(strength8Bit);
  }

  /**
   * Display-side post anti-aliasing (FXAA/SMAA) appended after the grade
   * chain. Selecting a mode rebuilds only the chain's output graph; MSAA on
   * the principal target remains the separate renderer-construction path.
   */
  setPostAntiAliasing(mode: PostAntiAliasingMode): void {
    this.filmicGrade.setPostAntiAliasing(mode);
  }

  postAntiAliasing(): PostAntiAliasingMode {
    return this.filmicGrade.postAntiAliasing();
  }

  /** Player sharpness 0..1 for the display-side RCAS stage; zero bypasses it. */
  setSharpness(uiSharpness: number): void {
    this.filmicGrade.setSharpness(uiSharpness);
  }

  sharpness(): number {
    return this.filmicGrade.sharpness();
  }

  /**
   * HF-364 — FSR 1 spatial upscaling. The scene-pass assembler must apply the
   * same `sceneResolutionScale` to `pass()`; this half only owns the EASU/RCAS
   * reconstruction at the end of the display chain.
   */
  setSpatialUpscaling(request: SpatialUpscalingRequest): void {
    this.filmicGrade.setSpatialUpscaling(request);
  }

  spatialUpscaling(): SpatialUpscalingRequest {
    return this.filmicGrade.spatialUpscaling();
  }

  /**
   * HF-364 — publishes the linear-side stage list the scene-pass assembler is
   * about to build, so the chain's order receipt covers the optional
   * screen-space stages. Call BEFORE the assembler publishes its outputNode.
   */
  setGradeLinearSourceStages(stages: readonly string[]): void {
    this.filmicGrade.setLinearSourceStages(stages);
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

  async compileAndRender(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    let attachmentRoot = root;
    while (attachmentRoot.parent) attachmentRoot = attachmentRoot.parent;
    if (attachmentRoot !== scene) {
      throw new Error('WebGPU presentation prewarm root must be attached to the submitted scene');
    }
    // Never encode a forced TSL/HDR presentation frame for a hidden tab. CPU,
    // network and decode preparation remain independent of this foreground
    // ownership boundary and can finish before the tab becomes visible again.
    await waitForVisibleBrowserPreparation();
    if (this.presentationPrewarmBatch) {
      if (this.presentationPrewarmScene !== scene) {
        throw new Error('WebGPU presentation prewarm batch cannot span multiple submitted scenes');
      }
      if (this.presentationPrewarmCollecting) {
        this.presentationPrewarmRoots.add(root);
        return this.presentationPrewarmBatch;
      }
      // A root staged after encoding began was not part of that submission.
      // Queue it behind the active fence; sibling late arrivals will still
      // coalesce into the next microtask batch.
      return this.presentationPrewarmBatch.then(() => this.compileAndRender(root, camera, scene));
    }
    // compileAsync() uses Three's default renderer context, while gameplay is
    // submitted through the TSL/HDR RenderPipeline. Building both contexts
    // doubles cold node/pipeline residency without warming the live path. One
    // forced pipeline submission compiles the exact context and the queue fence
    // below makes that work an admission boundary rather than a gameplay hitch.
    // Defer one microtask so independently staged presentation roots can join
    // one exact TSL/HDR submission. Keep the selected scene's lights and the
    // complete post-processing graph, while masking unrelated arena meshes so
    // effect batches do not repeatedly rebuild and draw the complete cold map.
    this.presentationPrewarmScene = scene;
    this.presentationPrewarmRoots.clear();
    this.presentationPrewarmRoots.add(root);
    this.presentationPrewarmCollecting = true;
    let batch!: Promise<void>;
    batch = Promise.resolve().then(async () => {
      this.presentationPrewarmCollecting = false;
      const roots = [...this.presentationPrewarmRoots];
      // The caller pauses live admission before staging cold roots, but an
      // already-admitted warmed frame may still own renderer resources. Drain
      // that exact target before the forced one-deep compilation submission.
      await this.waitForSubmittedWork(12_000);
      // Queue retirement may finish after the browser lost focus. Reacquire
      // foreground ownership at the actual encode boundary, not only when the
      // caller entered this method.
      // Wait politely for real foreground ownership, but do not wait forever.
      // submitFrame refuses without focus, and waitForVisibleBrowserPreparation
      // falls back on a timer, so a visible-but-unfocused window span this loop
      // indefinitely and never finished loading the map. After the polite
      // attempts, a VISIBLE document is enough - the hidden-tab contract is
      // about hidden tabs, and this still refuses to submit for one.
      let submitted = false;
      for (let attempt = 0; !submitted; attempt += 1) {
        await waitForVisibleBrowserPreparation();
        const force = attempt >= WebGpuRenderRuntime.PREWARM_FOCUS_ATTEMPTS;
        if (force && !browserPresentationIsVisible()) continue;
        const restoreVisibility = suppressUnrelatedRenderables(scene, roots);
        try {
          submitted = this.submitFrame(this.clock(), true, 'serialized', force);
        } finally {
          restoreVisibility();
        }
      }
      // Presentation-only effects prewarm behind the loading surface. Cold
      // Chrome/driver shader creation can exceed the live four-second fence,
      // especially when each QA page owns a fresh WebGPU device.
      await this.waitForSubmittedWork(12_000);
    }).finally(() => {
      if (this.presentationPrewarmBatch === batch) {
        this.presentationPrewarmBatch = null;
        this.presentationPrewarmScene = null;
        this.presentationPrewarmRoots.clear();
        this.presentationPrewarmCollecting = false;
      }
    });
    this.presentationPrewarmBatch = batch;
    return batch;
  }

  submitFrame(
    _frameTimestamp = this.clock(),
    force = false,
    submissionMode: WebGpuSubmissionMode = 'serialized',
    /**
     * Admission prewarm only: accept a VISIBLE document that does not hold
     * focus. Gameplay submission never sets this - it keeps the strict gate.
     */
    allowUnfocusedVisible = false,
  ): boolean {
    if (this.disposed) return false;
    if (this.deviceLost) throw new Error(this.lastFailure ?? 'WebGPU device lost');
    if (this.uncapturedErrors > 0) throw new Error(this.lastFailure ?? 'WebGPU uncaptured error');
    if (allowUnfocusedVisible
      ? !browserPresentationIsVisible()
      : !browserOwnsForegroundPresentation()) return false;
    const admissionCheckedAt = this.clock();
    this.submissionMode = submissionMode;
    const inFlightSubmissions = Math.max(0, this.submissionSequence - this.completedSequence);
    const maximumInFlightSubmissions = maximumInFlightWebGpuSubmissions(submissionMode);
    if (force && inFlightSubmissions > 0) {
      throw new Error(
        `Forced WebGPU submission requires an idle completion frontier; ${inFlightSubmissions} submission(s) remain`,
      );
    }
    if (!force && shouldBackpressureWebGpuSubmissions(
      this.pendingCompletionStartedAt,
      admissionCheckedAt,
      WebGpuRenderRuntime.SUBMISSION_BACKPRESSURE_MS,
      inFlightSubmissions,
      maximumInFlightSubmissions,
    )) {
      if (this.pendingCompletionStartedAt !== null) {
        this.progressMaximumPendingForMs = Math.max(
          this.progressMaximumPendingForMs,
          admissionCheckedAt - this.pendingCompletionStartedAt,
        );
      }
      this.scheduleCompletionProbe(admissionCheckedAt);
      this.consecutiveRefusedSubmissions += 1;
      if (!shouldRecoverStarvedPresentation({
        consecutiveRefusedSubmissions: this.consecutiveRefusedSubmissions,
        refusalStreakThreshold: WebGpuRenderRuntime.STARVATION_REFUSAL_STREAK,
        inFlightSubmissions,
        maximumInFlightSubmissions,
        drawCalls: this.lastSubmittedRenderInfo.calls,
        triangles: this.lastSubmittedRenderInfo.triangles,
        trivialDrawCallCeiling: WebGpuRenderRuntime.STARVATION_TRIVIAL_DRAW_CALLS,
        trivialTriangleCeiling: WebGpuRenderRuntime.STARVATION_TRIVIAL_TRIANGLES,
      })) {
        this.skippedSubmissions += 1;
        return false;
      }
      // Break the hysteresis: admit this one frame, and start a fresh
      // observation epoch so the pending-age clause judges the recovered queue
      // rather than the age that starved it. The stall guard is not disarmed -
      // it simply gets a new window, and fires again in
      // SUBMISSION_BACKPRESSURE_MS if the device really has stopped retiring.
      this.starvationRecoveries += 1;
      this.resetPresentationProgressWindow(admissionCheckedAt);
      if (this.pendingCompletionStartedAt !== null) this.pendingCompletionStartedAt = admissionCheckedAt;
    }
    this.consecutiveRefusedSubmissions = 0;
    this.renderer.info.reset();
    // Stage 12 advances on a profile-quantised clock, and the profile's bloom
    // tuning is re-asserted here so a graphics-settings write cannot silently
    // drop the threshold back under 1.0 linear.
    this.filmicGrade.beforeRender(admissionCheckedAt);
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
    // Observe THIS frame's retirement. Every admitted frame gets its own
    // observer so the completion frontier advances per frame instead of once
    // per queue round trip.
    this.attachCompletionProbe(this.submissionSequence, submittedAt);
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
      createProbe: () => this.scheduleCompletionProbe(this.clock()),
      failure: () => this.lastFailure,
      timeoutMs,
      // What the player sees when a deployment bounces. The frontier state is
      // what separates a genuinely wedged device from one frame of cold
      // first-use pipeline creation: a cold compile shows a healthy prior
      // latency, one in-flight submission and a large draw count, while a
      // wedged device shows a pending age far past the bound and no probe
      // progress at all.
      describe: () => this.describeCompletionFrontier(),
    });
  }

  private describeCompletionFrontier(): string {
    const now = this.clock();
    const pendingForMs = this.pendingCompletionStartedAt === null
      ? 0
      : Math.max(0, now - this.pendingCompletionStartedAt);
    return [
      `mode ${this.submissionMode}`,
      `in-flight ${Math.max(0, this.submissionSequence - this.completedSequence)}`,
      `pending ${Math.round(pendingForMs)} ms`,
      `probes ${this.completionProbeCount}`,
      `prior latency ${this.lastCompletionLatencyMs === null ? 'none' : `${Math.round(this.lastCompletionLatencyMs)} ms`}`,
      `fenced draws ${this.lastSubmittedRenderInfo.calls}`,
    ].join(', ');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.device.removeEventListener?.('uncapturederror', this.uncapturedErrorListener);
    this.filmicGrade.dispose();
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
