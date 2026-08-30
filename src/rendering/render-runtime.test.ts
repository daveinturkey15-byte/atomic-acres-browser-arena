import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  awaitSubmissionCompletionTarget,
  centeredReadbackRegion,
  classifyPresentationFreshness,
  configureSceneLightShadowSchedule,
  detectLivePresentationStall,
  shouldResetPresentationAfterSchedulerGap,
  formatWebGpuUncapturedError,
  maximumInFlightWebGpuSubmissions,
  pendingCompletionStartAfterProgress,
  OPTIONAL_WEBGPU_DEVICE_FEATURES,
  resolveRenderRuntimeRequest,
  selectOptionalDeviceFeatures,
  sequenceProgressRate,
  shouldBackpressureWebGpuSubmissions,
  toneMappingForMode,
  webGpuRenderInfoSnapshot,
  LegacyWebGlRenderRuntime,
  WebGpuRenderRuntime,
} from './render-runtime';
import { assertTslCutoverReady, assertTslReviewAuthored, pendingTslMigrationIds, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

function deferredQueueProbe(publishCompletion: () => void): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolveSource!: () => void;
  const source = new Promise<void>((resolve) => { resolveSource = resolve; });
  return {
    promise: source.then(() => publishCompletion()),
    resolve: resolveSource,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Pass 64 render runtime boundary', () => {
  it('is WebGPU-only: every request spelling resolves to the fail-closed WebGPU contract', () => {
    // Owner 2026-08-30: "retire all webgl2 stuff, full webgpu, no fallback."
    // A browser without a working WebGPU device gets the requirement screen
    // at renderer init; nothing routes to a second engine any more - not the
    // retired ?renderer=webgl2 spelling, not missing navigator.gpu.
    for (const search of ['', '?renderer=webgpu', '?renderer=webgpu&requireWebGPU=1', '?renderer=webgl2']) {
      expect(resolveRenderRuntimeRequest(search)).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
      expect(resolveRenderRuntimeRequest(search, false)).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    }
  });

  it('maps every exposed tone-mapping label to a real Three renderer mode', () => {
    expect(toneMappingForMode('aces')).toBe(THREE.ACESFilmicToneMapping);
    expect(toneMappingForMode('agx')).toBe(THREE.AgXToneMapping);
    expect(toneMappingForMode('neutral')).toBe(THREE.NeutralToneMapping);
  });

  it('prewarms one WebGL presentation root without redrawing unrelated arena meshes', async () => {
    const renderVisibility: Array<Readonly<{ arena: boolean; target: boolean; light: boolean }>> = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const target = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const light = new THREE.AmbientLight(0xffffff);
    scene.add(camera, arena, target, light);
    const renderer = {
      getContext: () => ({
        getExtension: () => null,
        getParameter: () => 'Test WebGL2 adapter',
      }),
      compileAsync: vi.fn(async () => undefined),
      render: vi.fn(() => {
        renderVisibility.push({ arena: arena.visible, target: target.visible, light: light.visible });
      }),
    };
    const runtime = new (LegacyWebGlRenderRuntime as unknown as new (value: unknown) => LegacyWebGlRenderRuntime)(renderer);

    await runtime.compileAndRender(target, camera, scene);

    expect(renderer.compileAsync).toHaveBeenCalledWith(target, camera, scene);
    expect(renderVisibility).toEqual([{ arena: false, target: true, light: true }]);
    expect(arena.visible).toBe(true);
    expect(target.visible).toBe(true);
  });

  it('restores unrelated WebGL arena visibility when a staged draw fails', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const target = new THREE.Group();
    scene.add(arena, target);
    const renderer = {
      getContext: () => ({ getExtension: () => null, getParameter: () => 'Test WebGL2 adapter' }),
      compileAsync: vi.fn(async () => undefined),
      render: vi.fn(() => { throw new Error('synthetic staged draw failure'); }),
    };
    const runtime = new (LegacyWebGlRenderRuntime as unknown as new (value: unknown) => LegacyWebGlRenderRuntime)(renderer);

    await expect(runtime.compileAndRender(target, camera, scene)).rejects.toThrow('synthetic staged draw failure');
    expect(arena.visible).toBe(true);
  });

  it('keeps WebGL and WebGPU presentation prewarms paused until a hidden tab owns the foreground', async () => {
    let visibilityState: DocumentVisibilityState = 'hidden';
    const listeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal('document', {
      get visibilityState() { return visibilityState; },
      hasFocus: () => true,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    });
    const makeScene = () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const root = new THREE.Group();
      scene.add(camera, root);
      return { scene, camera, root };
    };
    const webGlScene = makeScene();
    const webGlRenderer = {
      getContext: () => ({ getExtension: () => null, getParameter: () => 'Test WebGL2 adapter' }),
      compileAsync: vi.fn(async () => undefined),
      render: vi.fn(),
    };
    const webGlRuntime = new (LegacyWebGlRenderRuntime as unknown as new (
      value: unknown,
    ) => LegacyWebGlRenderRuntime)(webGlRenderer);
    const webGpuScene = makeScene();
    const webGpuRender = vi.fn();
    const webGpuRuntime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)({
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    }, { render: webGpuRender }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device: {
        queue: { onSubmittedWorkDone: async () => undefined },
        addEventListener: () => undefined,
        lost: new Promise<never>(() => undefined),
      },
    });

    const webGlPending = webGlRuntime.compileAndRender(webGlScene.root, webGlScene.camera, webGlScene.scene);
    const webGpuPending = webGpuRuntime.compileAndRender(webGpuScene.root, webGpuScene.camera, webGpuScene.scene);
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    // Compile-only preparation is allowed to progress while hidden; only the
    // authored presentation draw remains foreground-owned.
    expect(webGlRenderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(webGlRenderer.render).not.toHaveBeenCalled();
    expect(webGpuRender).not.toHaveBeenCalled();

    visibilityState = 'visible';
    for (const listener of [...listeners]) {
      if (typeof listener === 'function') listener(new Event('visibilitychange'));
      else listener.handleEvent(new Event('visibilitychange'));
    }
    await Promise.all([webGlPending, webGpuPending]);

    expect(webGlRenderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(webGlRenderer.render).toHaveBeenCalledTimes(1);
    expect(webGpuRender).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });

  it('rechecks WebGL foreground ownership after an asynchronous compile finishes', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    const listeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal('document', {
      get visibilityState() { return visibilityState; },
      hasFocus: () => true,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    });
    let releaseCompile!: () => void;
    const renderer = {
      getContext: () => ({ getExtension: () => null, getParameter: () => 'Test WebGL2 adapter' }),
      compileAsync: vi.fn(() => new Promise<void>((resolve) => { releaseCompile = resolve; })),
      render: vi.fn(),
    };
    const runtime = new (LegacyWebGlRenderRuntime as unknown as new (
      value: unknown,
    ) => LegacyWebGlRenderRuntime)(renderer);
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const pending = runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene);
    for (let turn = 0; turn < 4 && !renderer.compileAsync.mock.calls.length; turn += 1) await Promise.resolve();

    visibilityState = 'hidden';
    releaseCompile();
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    expect(renderer.render).not.toHaveBeenCalled();

    visibilityState = 'visible';
    for (const listener of [...listeners]) {
      if (typeof listener === 'function') listener(new Event('visibilitychange'));
      else listener.handleEvent(new Event('visibilitychange'));
    }
    await pending;
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('rechecks WebGPU foreground ownership after an admitted queue fence retires', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    const listeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal('document', {
      get visibilityState() { return visibilityState; },
      hasFocus: () => true,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    });
    const fences: Array<() => void> = [];
    const render = vi.fn();
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)({
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    }, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device: {
        queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => fences.push(resolve)) },
        addEventListener: () => undefined,
        lost: new Promise<never>(() => undefined),
      },
    });
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    expect(runtime.submitFrame(100, true)).toBe(true);
    const pending = runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene);
    for (let turn = 0; turn < 8 && fences.length < 1; turn += 1) await Promise.resolve();

    visibilityState = 'hidden';
    fences.shift()?.();
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    for (const listener of [...listeners]) {
      if (typeof listener === 'function') listener(new Event('visibilitychange'));
      else listener.handleEvent(new Event('visibilitychange'));
    }
    for (let turn = 0; turn < 8 && render.mock.calls.length < 2; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
    fences.shift()?.();
    await pending;
  });

  it('rejects a WebGPU submission at the runtime boundary while hidden', () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => true });
    const render = vi.fn();
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)({
      info: { reset: vi.fn(), render: { calls: 0, triangles: 0, points: 0, lines: 0 } },
    }, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device: {
        queue: { onSubmittedWorkDone: async () => undefined },
        addEventListener: () => undefined,
        lost: new Promise<never>(() => undefined),
      },
    });

    expect(runtime.submitFrame(100, true)).toBe(false);
    expect(render).not.toHaveBeenCalled();
    expect(runtime.presentationTelemetry()).toMatchObject({
      submissionSequence: 0,
      completedSequence: 0,
    });
  });

  it('treats an explicitly destroyed page-exit device as clean idempotent disposal', async () => {
    vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true });
    let resolveLost!: (info: Readonly<{ reason: string; message: string }>) => void;
    const lost = new Promise<Readonly<{ reason: string; message: string }>>((resolve) => { resolveLost = resolve; });
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: vi.fn(), render: { calls: 0, triangles: 0, points: 0, lines: 0 } },
      dispose: vi.fn(),
    };
    const pipeline = { render: vi.fn(), dispose: vi.fn() };
    const device = {
      queue: { onSubmittedWorkDone: async () => undefined },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      destroy: vi.fn(() => resolveLost({ reason: 'destroyed', message: 'Device was destroyed.' })),
      lost,
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, pipeline, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });

    runtime.dispose();
    runtime.dispose();
    await lost;
    await Promise.resolve();

    expect(pipeline.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(device.destroy).toHaveBeenCalledTimes(1);
    expect(runtime.submitFrame(100, true)).toBe(false);
    expect(runtime.telemetry()).toMatchObject({
      deviceLost: false,
      presentation: { status: 'warming', lastFailure: null },
    });
  });

  it('admits the cutover only after every custom GLSL owner has a verified TSL graph', () => {
    expect(TSL_MIGRATION_INVENTORY.map((entry) => entry.id)).toEqual([
      'procedural-atmosphere-sky',
      'atomic-signal-hdr',
      'atmosphere-mist',
      'atmosphere-smoke',
      'atmosphere-dust',
      'procedural-grass',
      'perimeter-water',
    ]);
    expect(pendingTslMigrationIds()).toHaveLength(0);
    expect(new Set(TSL_MIGRATION_INVENTORY.map((entry) => entry.status))).toEqual(new Set(['verified']));
    expect(() => assertTslReviewAuthored()).not.toThrow();
    expect(() => assertTslCutoverReady()).not.toThrow();
  });

  it('accepts only an entirely verified inventory', () => {
    const verified = TSL_MIGRATION_INVENTORY.map((entry) => ({ ...entry, status: 'verified' as const }));
    expect(() => assertTslCutoverReady(verified)).not.toThrow();
  });

  it('classifies queue completion freshness independently of simulation cadence', () => {
    const classify = (overrides: Partial<Parameters<typeof classifyPresentationFreshness>[0]> = {}) => classifyPresentationFreshness({
      deviceLost: false,
      completionFailures: 0,
      submissionSequence: 12,
      completedSequence: 11,
      pendingForMs: 50,
      stallThresholdMs: 1_500,
      ...overrides,
    });
    expect(classify({ submissionSequence: 0, completedSequence: 0 })).toBe('warming');
    expect(classify()).toBe('healthy');
    expect(classify({ pendingForMs: 1_501 })).toBe('stalled');
    expect(classify({ submissionSequence: 1, completedSequence: 0, pendingForMs: 2_000 })).toBe('stalled');
    expect(classify({ completionFailures: 1 })).toBe('failed');
    expect(classify({ deviceLost: true, completionFailures: 1 })).toBe('device-lost');
  });

  it('derives truthful presentation cadence from queue sequence progress rather than animation callbacks', () => {
    expect(sequenceProgressRate({
      baselineSequence: 100,
      currentSequence: 232,
      windowStartedAt: 1_000,
      now: 3_000,
    })).toEqual({ advances: 132, elapsedMs: 2_000, cadenceHz: 66 });
    expect(sequenceProgressRate({
      baselineSequence: 10,
      currentSequence: 9,
      windowStartedAt: 2_000,
      now: 1_000,
    })).toEqual({ advances: 0, elapsedMs: 0, cadenceHz: 0 });
  });

  it('fails a foreground idle submission gap while exempting every intentional pause surface', () => {
    const detect = (overrides: Partial<Parameters<typeof detectLivePresentationStall>[0]> = {}) => detectLivePresentationStall({
      activeMatch: true,
      menuHidden: true,
      documentVisible: true,
      documentFocused: true,
      arenaSelectionReady: true,
      debugRenderPaused: false,
      renderSubmissionPaused: false,
      backpressureActive: false,
      currentSubmissionGapMs: 1_000,
      pendingForMs: 0,
      stallThresholdMs: 1_000,
      ...overrides,
    });
    expect(detect()).toEqual({ kind: 'missing-submission', elapsedMs: 1_000 });
    expect(detect({ activeMatch: false })).toBeNull();
    expect(detect({ menuHidden: false })).toBeNull();
    expect(detect({ documentVisible: false })).toBeNull();
    expect(detect({ documentFocused: false })).toBeNull();
    expect(detect({ arenaSelectionReady: false })).toBeNull();
    expect(detect({ debugRenderPaused: true })).toBeNull();
    expect(detect({ renderSubmissionPaused: true })).toBeNull();
    expect(detect({ backpressureActive: true })).toBeNull();
    expect(detect({ backpressureActive: true, pendingForMs: 1_000 }))
      .toEqual({ kind: 'pending-completion', elapsedMs: 1_000 });
  });

  it('restarts the foreground presentation epoch after a scheduler-sized frame gap', () => {
    expect(shouldResetPresentationAfterSchedulerGap(999.9, 1_000)).toBe(false);
    expect(shouldResetPresentationAfterSchedulerGap(1_000, 1_000)).toBe(true);
    expect(shouldResetPresentationAfterSchedulerGap(5_000, 1_000)).toBe(true);
    expect(shouldResetPresentationAfterSchedulerGap(Number.NaN, 1_000)).toBe(false);
    expect(shouldResetPresentationAfterSchedulerGap(1_000, -1)).toBe(false);
  });

  it('uses current-frame WebGPU draw calls instead of cumulative lifetime render calls', () => {
    const commonRendererMetrics = {
      calls: 9_999,
      drawCalls: 0,
      frameCalls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    };
    expect(webGpuRenderInfoSnapshot(commonRendererMetrics)).toEqual({
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    });
  });

  it('normalizes uncaptured WebGPU validation errors for fail-closed telemetry', () => {
    expect(formatWebGpuUncapturedError({
      error: { name: 'GPUValidationError', message: 'Buffer used while destroyed' },
    })).toBe('GPUValidationError: Buffer used while destroyed');
    expect(formatWebGpuUncapturedError({})).toBe('GPUError: No validation message was provided');
  });

  it('schedules static shadows on each WebGPU light instead of a WebGL-only renderer flag', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    const practical = new THREE.SpotLight();
    const unshadowed = new THREE.PointLight();
    sun.castShadow = true;
    practical.castShadow = true;
    unshadowed.castShadow = false;
    scene.add(sun, practical, unshadowed);
    expect(configureSceneLightShadowSchedule(scene, false, true)).toBe(2);
    expect([sun, practical].every((light) => !light.shadow.autoUpdate && light.shadow.needsUpdate)).toBe(true);
    expect(configureSceneLightShadowSchedule(scene, false, false)).toBe(2);
    expect([sun, practical].every((light) => !light.shadow.autoUpdate && !light.shadow.needsUpdate)).toBe(true);
    expect(configureSceneLightShadowSchedule(scene, true, false)).toBe(2);
    expect([sun, practical].every((light) => light.shadow.autoUpdate && !light.shadow.needsUpdate)).toBe(true);
  });

  it('bounds submissions while an earlier WebGPU completion probe is lagging', () => {
    expect(maximumInFlightWebGpuSubmissions('serialized')).toBe(1);
    expect(maximumInFlightWebGpuSubmissions('warmed-live')).toBe(2);
    expect(maximumInFlightWebGpuSubmissions('input-response')).toBe(3);
    expect(shouldBackpressureWebGpuSubmissions(null, 1_000, 250)).toBe(false);
    expect(shouldBackpressureWebGpuSubmissions(800, 1_049, 250)).toBe(false);
    expect(shouldBackpressureWebGpuSubmissions(800, 1_050, 250)).toBe(true);
    expect(shouldBackpressureWebGpuSubmissions(800, 2_300, 250)).toBe(true);
    expect(shouldBackpressureWebGpuSubmissions(980, 1_000, 250, 7, 8)).toBe(false);
    expect(shouldBackpressureWebGpuSubmissions(980, 1_000, 250, 8, 8)).toBe(true);
    expect(shouldBackpressureWebGpuSubmissions(null, 1_000, 250, 12, 8)).toBe(true);
    expect(shouldBackpressureWebGpuSubmissions(null, 1_000, 250, 3, 4)).toBe(false);
    expect(shouldBackpressureWebGpuSubmissions(null, 1_000, 250, 4, 4)).toBe(true);
  });

  it('attaches a completion probe to every admitted one-deep submission frontier', async () => {
    const pending: Array<() => void> = [];
    const queue = {
      onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)),
    };
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const pipeline = { render: () => undefined };
    const device = {
      queue,
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, pipeline, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    expect(runtime.healthTelemetry()).toMatchObject({
      actualBackend: 'webgpu',
      // HF-331: adapter identity is surfaced on the live health/diagnostics
      // object so a live Firefox probe can read backend + adapter together.
      adapterLabel: 'test adapter',
      deviceLost: false,
      uncapturedErrors: 0,
      presentation: { status: 'warming' },
    });
    expect(runtime.healthTelemetry()).not.toHaveProperty('slowNodeBuilds');
    const settleProbe = async () => {
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    };

    expect(runtime.submitFrame(100)).toBe(true);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    await settleProbe();
    expect(runtime.submitFrame(110)).toBe(true);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    await settleProbe();
    expect(runtime.submitFrame(120)).toBe(true);
    expect(pending).toHaveLength(1);
  });

  it('admits exactly two warmed-live frames behind one completion-frontier probe', async () => {
    const pending: Array<() => void> = [];
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: vi.fn(), render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const render = vi.fn();
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    const settleProbe = async () => {
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    };

    expect(runtime.submitFrame(100, false, 'warmed-live')).toBe(true);
    expect(runtime.submitFrame(110, false, 'warmed-live')).toBe(true);
    expect(runtime.submitFrame(120, false, 'warmed-live')).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(1);
    expect(runtime.presentationTelemetry()).toMatchObject({
      submissionMode: 'warmed-live',
      maximumInFlightSubmissions: 2,
      inFlightSubmissions: 2,
      completionProbeTargetSequence: 1,
      completionProbeCount: 1,
      submissionSequence: 2,
      completedSequence: 0,
    });
    expect(() => runtime.submitFrame(125, true, 'serialized'))
      .toThrow('Forced WebGPU submission requires an idle completion frontier');
    expect(render).toHaveBeenCalledTimes(2);

    pending.shift()?.();
    await settleProbe();
    expect(runtime.submitFrame(130, false, 'warmed-live')).toBe(true);
    expect(pending).toHaveLength(1);
    expect(runtime.presentationTelemetry()).toMatchObject({
      inFlightSubmissions: 2,
      completionProbeTargetSequence: 3,
      completionProbeCount: 2,
      submissionSequence: 3,
      completedSequence: 1,
    });
    pending.shift()?.();
    await settleProbe();
    expect(runtime.presentationTelemetry()).toMatchObject({
      inFlightSubmissions: 0,
      completionProbeTargetSequence: null,
      submissionSequence: 3,
      completedSequence: 3,
    });
  });

  it('admits one bounded input-response frame beyond the warmed-live frontier', () => {
    const pending: Array<() => void> = [];
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: vi.fn(), render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const render = vi.fn();
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });

    expect(runtime.submitFrame(100, false, 'warmed-live')).toBe(true);
    expect(runtime.submitFrame(110, false, 'warmed-live')).toBe(true);
    expect(runtime.submitFrame(120, false, 'input-response')).toBe(true);
    expect(runtime.submitFrame(130, false, 'input-response')).toBe(false);
    expect(render).toHaveBeenCalledTimes(3);
    expect(pending).toHaveLength(1);
    expect(runtime.presentationTelemetry()).toMatchObject({
      submissionMode: 'input-response',
      maximumInFlightSubmissions: 3,
      inFlightSubmissions: 3,
      submissionSequence: 3,
      completedSequence: 0,
    });
  });

  it('retains every completed-queue latency maximum in the current progress window', async () => {
    let now = 0;
    const pending: Array<() => void> = [];
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: vi.fn(), render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render: vi.fn() }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
      now: () => now,
    });
    const settleProbe = async () => {
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    };

    runtime.resetPresentationProgressWindow(now);
    expect(runtime.submitFrame(now)).toBe(true);
    now = 80;
    pending.shift()?.();
    await settleProbe();
    expect(runtime.presentationTelemetry(now)).toMatchObject({
      lastCompletionLatencyMs: 80,
      progress: { maximumCompletionLatencyMs: 80 },
    });

    now = 100;
    expect(runtime.submitFrame(now)).toBe(true);
    now = 110;
    pending.shift()?.();
    await settleProbe();
    expect(runtime.presentationTelemetry(now)).toMatchObject({
      lastCompletionLatencyMs: 10,
      progress: { maximumCompletionLatencyMs: 80 },
    });

    runtime.resetPresentationProgressWindow(now);
    expect(runtime.presentationTelemetry(now).progress.maximumCompletionLatencyMs).toBe(0);
  });

  it('rejects a second unresolved submission, times latency post-submit, and rebases hidden time', async () => {
    let now = 100;
    const pending: Array<() => void> = [];
    const render = vi.fn(() => { now = 300; });
    const renderer = {
      info: { reset: vi.fn(), render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
      now: () => now,
    });

    expect(runtime.submitFrame(10)).toBe(true);
    expect(runtime.presentationTelemetry(now)).toMatchObject({
      submissionSequence: 1,
      completedSequence: 0,
      lastSubmittedAt: 300,
      pendingSince: 300,
    });
    now = 301;
    expect(runtime.submitFrame(11)).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);
    expect(runtime.presentationTelemetry(now)).toMatchObject({ submissionSequence: 1, skippedSubmissions: 1 });

    now = 5_000;
    runtime.resetPresentationProgressTelemetry('tab visibility regained', now);
    expect(runtime.presentationTelemetry(now)).toMatchObject({ pendingSince: 5_000, pendingForMs: 0 });
    const beforeFence = runtime.presentationTelemetry(5_999);
    expect(detectLivePresentationStall({
      activeMatch: true,
      menuHidden: true,
      documentVisible: true,
      documentFocused: true,
      arenaSelectionReady: true,
      debugRenderPaused: false,
      renderSubmissionPaused: false,
      backpressureActive: beforeFence.backpressureActive,
      currentSubmissionGapMs: beforeFence.progress.currentSubmissionGapMs,
      pendingForMs: beforeFence.pendingForMs,
      stallThresholdMs: 1_000,
    })).toBeNull();
    const atFence = runtime.presentationTelemetry(6_000);
    expect(detectLivePresentationStall({
      activeMatch: true,
      menuHidden: true,
      documentVisible: true,
      documentFocused: true,
      arenaSelectionReady: true,
      debugRenderPaused: false,
      renderSubmissionPaused: false,
      backpressureActive: atFence.backpressureActive,
      currentSubmissionGapMs: atFence.progress.currentSubmissionGapMs,
      pendingForMs: atFence.pendingForMs,
      stallThresholdMs: 1_000,
    })).toEqual({ kind: 'pending-completion', elapsedMs: 1_000 });

    now = 5_025;
    pending.shift()?.();
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    expect(runtime.presentationTelemetry(now)).toMatchObject({
      completedSequence: 1,
      pendingSince: null,
      lastCompletionLatencyMs: 25,
      progress: { maximumCompletionLatencyMs: 25 },
    });
  });

  it('prewarms only the submitted TSL render-pipeline context', async () => {
    const compileAsync = vi.fn(async () => undefined);
    const visibility: Array<Readonly<{ arena: boolean; staged: boolean; light: boolean }>> = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const staged = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
    const light = new THREE.AmbientLight();
    scene.add(camera, arena, staged, light);
    const render = vi.fn(() => {
      visibility.push({ arena: arena.visible, staged: staged.visible, light: light.visible });
    });
    const renderer = {
      compileAsync,
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: async () => undefined },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    await runtime.compileAndRender(staged, camera, scene);

    expect(compileAsync).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect(visibility).toEqual([{ arena: false, staged: true, light: true }]);
    expect(arena.visible).toBe(true);
    expect(staged.visible).toBe(true);
  });

  it('coalesces concurrently staged presentation roots into one fenced scene submission', async () => {
    const visibility: Array<Readonly<{
      arena: boolean;
      tracer: boolean;
      smoke: boolean;
      light: boolean;
    }>> = [];
    const renderer = {
      compileAsync: vi.fn(async () => undefined),
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: async () => undefined },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const tracerRoot = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const smokeRoot = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    const light = new THREE.DirectionalLight();
    scene.add(camera, arena, tracerRoot, smokeRoot, light);
    const render = vi.fn(() => {
      visibility.push({
        arena: arena.visible,
        tracer: tracerRoot.visible,
        smoke: smokeRoot.visible,
        light: light.visible,
      });
    });
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    await Promise.all([
      runtime.compileAndRender(tracerRoot, camera, scene),
      runtime.compileAndRender(smokeRoot, camera, scene),
    ]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(visibility[0]).toEqual({ arena: false, tracer: true, smoke: true, light: true });
    expect([arena.visible, tracerRoot.visible, smokeRoot.visible, light.visible]).toEqual([true, true, true, true]);

    await runtime.compileAndRender(tracerRoot, camera, scene);
    expect(render).toHaveBeenCalledTimes(2);
    expect(visibility[1]).toEqual({ arena: false, tracer: true, smoke: false, light: true });
    expect([arena.visible, tracerRoot.visible, smokeRoot.visible, light.visible]).toEqual([true, true, true, true]);
  });

  it('queues a root staged after encoding begins for a later exact submission', async () => {
    const pending: Array<() => void> = [];
    const snapshots: Array<Readonly<{ arena: boolean; first: boolean; second: boolean }>> = [];
    const renderer = {
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const firstRoot = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const secondRoot = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
    scene.add(camera, arena, firstRoot, secondRoot);
    const render = vi.fn(() => {
      snapshots.push({ arena: arena.visible, first: firstRoot.visible, second: secondRoot.visible });
    });
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });

    const first = runtime.compileAndRender(firstRoot, camera, scene);
    for (let turn = 0; turn < 8 && render.mock.calls.length === 0; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(1);
    const second = runtime.compileAndRender(secondRoot, camera, scene);
    expect(render).toHaveBeenCalledTimes(1);

    pending.shift()?.();
    await first;
    for (let turn = 0; turn < 16 && render.mock.calls.length < 2; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
    pending.shift()?.();
    await second;

    expect(snapshots).toEqual([
      { arena: false, first: true, second: false },
      { arena: false, first: false, second: true },
    ]);
    expect([arena.visible, firstRoot.visible, secondRoot.visible]).toEqual([true, true, true]);
  });

  it('drains an admitted warmed frontier before a forced cold prewarm submission', async () => {
    const pending: Array<() => void> = [];
    const render = vi.fn();
    const renderer = {
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: () => new Promise<void>((resolve) => pending.push(resolve)) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);

    expect(runtime.submitFrame(100, false, 'warmed-live')).toBe(true);
    const prewarm = runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene);
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);

    pending.shift()?.();
    for (let turn = 0; turn < 12 && render.mock.calls.length < 2; turn += 1) await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    await prewarm;
    expect(runtime.presentationTelemetry()).toMatchObject({
      submissionMode: 'serialized',
      submissionSequence: 2,
      completedSequence: 2,
      inFlightSubmissions: 0,
    });
  });

  it('rejects a concurrent prewarm from a different scene', async () => {
    let releaseFence!: () => void;
    const fence = new Promise<void>((resolve) => { releaseFence = resolve; });
    const render = vi.fn();
    const renderer = {
      compileAsync: vi.fn(async () => undefined),
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: () => fence },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    const firstScene = new THREE.Scene();
    const firstRoot = new THREE.Group();
    firstScene.add(firstRoot);
    const secondScene = new THREE.Scene();
    const secondRoot = new THREE.Group();
    secondScene.add(secondRoot);

    const first = runtime.compileAndRender(firstRoot, new THREE.PerspectiveCamera(), firstScene);
    await expect(runtime.compileAndRender(secondRoot, new THREE.PerspectiveCamera(), secondScene))
      .rejects.toThrow('cannot span multiple submitted scenes');
    releaseFence();
    await first;
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('clears a failed prewarm batch so a later submission can retry', async () => {
    const scene = new THREE.Scene();
    const arena = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const root = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
    scene.add(arena, root);
    const visibility: Array<Readonly<{ arena: boolean; root: boolean }>> = [];
    const render = vi.fn()
      .mockImplementationOnce(() => {
        visibility.push({ arena: arena.visible, root: root.visible });
        throw new Error('synthetic pipeline build failure');
      })
      .mockImplementation(() => {
        visibility.push({ arena: arena.visible, root: root.visible });
      });
    const renderer = {
      compileAsync: vi.fn(async () => undefined),
      info: { reset: () => undefined, render: { calls: 1, triangles: 2, points: 0, lines: 0 } },
    };
    const device = {
      queue: { onSubmittedWorkDone: async () => undefined },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    await expect(runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene))
      .rejects.toThrow('synthetic pipeline build failure');
    expect([arena.visible, root.visible]).toEqual([true, true]);
    await runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene);
    expect(render).toHaveBeenCalledTimes(2);
    expect(visibility).toEqual([
      { arena: false, root: true },
      { arena: false, root: true },
    ]);
    expect([arena.visible, root.visible]).toEqual([true, true]);
  });

  it('restarts pending age when the completion frontier advances and clears it when caught up', () => {
    expect(pendingCompletionStartAfterProgress({
      completedAt: 4_250,
      completedSequence: 19,
      submissionSequence: 22,
    })).toBe(4_250);
    expect(pendingCompletionStartAfterProgress({
      completedAt: 4_300,
      completedSequence: 22,
      submissionSequence: 22,
    })).toBeNull();
  });

  it('samples the center of a render target rather than a screen-space corner', () => {
    expect(centeredReadbackRegion(2_560, 1_440)).toEqual({ x: 1_248, y: 688, width: 64, height: 64 });
    expect(centeredReadbackRegion(32, 20)).toEqual({ x: 0, y: 0, width: 32, height: 20 });
  });

  it('fences the captured submission target even when an existing probe covers only older work', async () => {
    let completed = 0;
    let probes = 0;
    await awaitSubmissionCompletionTarget({
      targetSequence: 5,
      completedSequence: () => completed,
      createProbe: () => Promise.resolve().then(() => {
        probes += 1;
        completed = probes === 1 ? 2 : 5;
      }),
      failure: () => null,
      timeoutMs: 1_000,
    });
    expect(probes).toBe(2);
    expect(completed).toBe(5);
  });

  it('fails closed when a queue completion probe resolves without advancing its target', async () => {
    await expect(awaitSubmissionCompletionTarget({
      targetSequence: 1,
      completedSequence: () => 0,
      createProbe: () => Promise.resolve(),
      failure: () => null,
      timeoutMs: 1_000,
    })).rejects.toThrow('did not advance');
  });

  it('accepts completion published by the real probe chain before the timeout boundary check', async () => {
    vi.useFakeTimers();
    try {
      let completed = 0;
      const probe = deferredQueueProbe(() => { completed = 1; });
      const pending = awaitSubmissionCompletionTarget({
        targetSequence: 1,
        completedSequence: () => completed,
        createProbe: () => probe.promise,
        failure: () => null,
        timeoutMs: 100,
      });
      const assertion = expect(pending).resolves.toBeUndefined();
      // Queue the probe publication first, then fire the timer before flushing
      // microtasks. The boundary recheck must observe the probe chain's update.
      probe.resolve();
      vi.advanceTimersByTime(100);
      await assertion;
      expect(completed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when the timeout boundary is queued before the real probe chain publishes completion', async () => {
    vi.useFakeTimers();
    try {
      let completed = 6;
      const probe = deferredQueueProbe(() => { completed = 7; });
      const pending = awaitSubmissionCompletionTarget({
        targetSequence: 7,
        completedSequence: () => completed,
        createProbe: () => probe.promise,
        failure: () => null,
        timeoutMs: 100,
      });
      const assertion = expect(pending).rejects.toThrow('exceeded 100 ms for submission 7');
      // Fire the timer first, then settle the probe before microtasks flush.
      // The deadline check is already ahead in the queue and must fail closed.
      vi.advanceTimersByTime(100);
      probe.resolve();
      await assertion;
      await probe.promise;
      expect(completed).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('optional WebGPU device features', () => {
  const featureSet = (...names: readonly string[]) => ({ has: (name: string) => names.includes(name) });

  it('requests only allowlisted features the adapter actually advertises', () => {
    // Requesting a feature the adapter lacks makes requestDevice REJECT, which
    // would turn a missing nicety into a dead renderer, so the intersection is
    // the whole contract.
    expect(selectOptionalDeviceFeatures(featureSet('rg11b10ufloat-renderable')))
      .toEqual(['rg11b10ufloat-renderable']);
    expect(selectOptionalDeviceFeatures(featureSet('texture-compression-bc', 'shader-f16')))
      .toEqual([]);
  });

  it('asks for the SSGI render-target feature whenever the adapter has it', () => {
    // The MAX preset enables SSGI, and THREE.SSGINode hard-fails pipeline
    // creation without this feature — which then invalidates the command buffer
    // and takes arena admission down with it. Pin the name so a rename cannot
    // silently re-break the top preset.
    expect(OPTIONAL_WEBGPU_DEVICE_FEATURES).toContain('rg11b10ufloat-renderable');
    expect(selectOptionalDeviceFeatures(featureSet(...OPTIONAL_WEBGPU_DEVICE_FEATURES)))
      .toEqual([...OPTIONAL_WEBGPU_DEVICE_FEATURES]);
  });

  it('degrades to no optional features rather than throwing on an odd adapter', () => {
    expect(selectOptionalDeviceFeatures(undefined)).toEqual([]);
    expect(selectOptionalDeviceFeatures({} as unknown as { has(name: string): boolean })).toEqual([]);
    expect(selectOptionalDeviceFeatures({ has: () => { throw new Error('driver'); } })).toEqual([]);
  });
});

describe('queue-completion deadline diagnosis', () => {
  // The rejection here IS the sentence the player reads when a deployment
  // bounces ("Deployment preparation failed: WebGPU queue completion exceeded
  // 4000 ms for submission 35"). With only the bound and a sequence number it
  // cannot distinguish one cold first-use compile from a wedged device, and it
  // names none of the several fences in the admission path — two passes at the
  // MAX-preset bound were spent re-deriving that from stage timings. These pin
  // the frontier detail so it cannot be dropped back to a bare number.
  it('names the completion frontier when the deadline fails closed', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<void>(() => undefined);
      const rejection = expect(awaitSubmissionCompletionTarget({
        targetSequence: 9,
        completedSequence: () => 3,
        createProbe: () => pending,
        failure: () => null,
        timeoutMs: 100,
        describe: () => 'mode serialized, in-flight 6, pending 240 ms',
      })).rejects.toThrow(
        'WebGPU queue completion exceeded 100 ms for submission 9'
        + ' (completed 3, mode serialized, in-flight 6, pending 240 ms)',
      );
      vi.advanceTimersByTime(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('still reports the completion frontier when no describer is supplied', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<void>(() => undefined);
      const rejection = expect(awaitSubmissionCompletionTarget({
        targetSequence: 4,
        completedSequence: () => 1,
        createProbe: () => pending,
        failure: () => null,
        timeoutMs: 50,
      })).rejects.toThrow('exceeded 50 ms for submission 4 (completed 1)');
      vi.advanceTimersByTime(50);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lets a throwing describer replace the queue error', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<void>(() => undefined);
      const rejection = expect(awaitSubmissionCompletionTarget({
        targetSequence: 2,
        completedSequence: () => 0,
        createProbe: () => pending,
        failure: () => null,
        timeoutMs: 30,
        describe: () => { throw new Error('telemetry exploded'); },
      })).rejects.toThrow(
        'WebGPU queue completion exceeded 30 ms for submission 2'
        + ' (completed 0, frontier description unavailable)',
      );
      vi.advanceTimersByTime(30);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('is WIRED: the runtime fence attaches its own live frontier state', async () => {
    const renderer = {
      backend: { isWebGPUBackend: true },
      info: { reset: vi.fn(), render: { drawCalls: 4821, triangles: 9, points: 0, lines: 0 } },
    };
    const device = {
      // A queue that never retires — exactly the shape of the bounce.
      queue: { onSubmittedWorkDone: () => new Promise<void>(() => undefined) },
      addEventListener: () => undefined,
      lost: new Promise<never>(() => undefined),
    };
    const runtime = new (WebGpuRenderRuntime as unknown as new (
      renderer: unknown,
      pipeline: unknown,
      identity: unknown,
    ) => WebGpuRenderRuntime)(renderer, { render: vi.fn() }, {
      canvasAntialias: true,
      canvasSamples: 4,
      adapterLabel: 'test adapter',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      device,
    });
    expect(runtime.submitFrame(100, true, 'serialized')).toBe(true);
    // The draw count is the tell that separates a full-coverage cold prewarm
    // frame from a small one, so it has to survive into the failure text.
    await expect(runtime.waitForSubmittedWork(20)).rejects.toThrow(
      /exceeded 20 ms for submission 1 \(completed 0, mode serialized, in-flight 1, pending \d+ ms, probes 1, prior latency none, fenced draws 4821\)/,
    );
  });
});

describe('cold-generation prewarm fence', () => {
  // WHY THIS IS PINNED. The MAX preset bounces because first-use pipeline
  // creation lands inside a guarded 4000 ms admission flush. The whole defence
  // is that compileAndRender realises that work behind the runtime's OWN
  // 12 s cold-generation allowance first, so every later guarded flush only
  // ever fences a warm frame. Nothing pinned that number, so a tidy-up that
  // dropped the explicit 12_000 and took waitForSubmittedWork's 4000 ms
  // default would silently re-arm the exact bounce, with every unit test still
  // green. This asserts the fence a cold prewarm actually gets.
  //
  // It raises the bar, never lowers it: the 4000 ms admission guard is
  // untouched and unreferenced here.
  it('gives a cold prewarm submission the 12 s allowance, not the 4 s live bound', async () => {
    vi.useFakeTimers();
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const renderer = {
        backend: { isWebGPUBackend: true },
        info: { reset: vi.fn(), render: { drawCalls: 12, triangles: 3, points: 0, lines: 0 } },
      };
      const device = {
        // Cold first-use compilation that never retires: the fence is the only
        // thing deciding how long the prewarm is allowed to take.
        queue: { onSubmittedWorkDone: () => new Promise<void>(() => undefined) },
        addEventListener: () => undefined,
        lost: new Promise<never>(() => undefined),
      };
      const runtime = new (WebGpuRenderRuntime as unknown as new (
        renderer: unknown,
        pipeline: unknown,
        identity: unknown,
      ) => WebGpuRenderRuntime)(renderer, { render: vi.fn() }, {
        canvasAntialias: true,
        canvasSamples: 4,
        adapterLabel: 'test adapter',
        adapterClass: 'GPUAdapter',
        deviceClass: 'GPUDevice',
        softwareAdapter: false,
        device,
      });

      let settled: 'pending' | 'resolved' | 'rejected' = 'pending';
      let failure: unknown = null;
      const prewarm = runtime.compileAndRender(scene, camera, scene)
        .then(() => { settled = 'resolved'; })
        .catch((error: unknown) => { settled = 'rejected'; failure = error; });

      // Well past the live admission bound, and still compiling: a cold
      // prewarm that dies at 4 s is the bug, not the guard.
      await vi.advanceTimersByTimeAsync(4_100);
      expect(settled, 'cold prewarm must survive the 4 s live admission bound').toBe('pending');

      // The cold allowance is still a real bound — it fails closed too.
      await vi.advanceTimersByTimeAsync(8_000);
      await prewarm;
      expect(settled).toBe('rejected');
      expect(String(failure)).toContain('exceeded 12000 ms');
    } finally {
      vi.useRealTimers();
    }
  });
});
