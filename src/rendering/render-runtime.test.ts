import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  awaitSubmissionCompletionTarget,
  centeredReadbackRegion,
  classifyPresentationFreshness,
  configureSceneLightShadowSchedule,
  detectLivePresentationStall,
  shouldResetPresentationAfterSchedulerGap,
  formatWebGpuUncapturedError,
  pendingCompletionStartAfterProgress,
  resolveRenderRuntimeRequest,
  sequenceProgressRate,
  shouldBackpressureWebGpuSubmissions,
  toneMappingForMode,
  webGpuRenderInfoSnapshot,
  LegacyWebGlRenderRuntime,
  WebGpuRenderRuntime,
} from './render-runtime';
import { assertTslCutoverReady, assertTslReviewAuthored, pendingTslMigrationIds, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

describe('Pass 64 render runtime boundary', () => {
  it('makes WebGPU fail-closed by default and keeps WebGL2 behind an explicit compatibility query', () => {
    expect(resolveRenderRuntimeRequest('')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu&requireWebGPU=1')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgl2')).toEqual({ requestedBackend: 'webgl2', requireWebGPU: false });
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
    });
  });

  it('prewarms only the submitted TSL render-pipeline context', async () => {
    const compileAsync = vi.fn(async () => undefined);
    const render = vi.fn();
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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const staged = new THREE.Group();
    scene.add(camera, staged);

    await runtime.compileAndRender(staged, camera, scene);

    expect(compileAsync).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrently staged presentation roots into one fenced scene submission', async () => {
    const render = vi.fn();
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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const tracerRoot = new THREE.Group();
    const smokeRoot = new THREE.Group();
    scene.add(camera, tracerRoot, smokeRoot);

    await Promise.all([
      runtime.compileAndRender(tracerRoot, camera, scene),
      runtime.compileAndRender(smokeRoot, camera, scene),
    ]);
    expect(render).toHaveBeenCalledTimes(1);

    await runtime.compileAndRender(tracerRoot, camera, scene);
    expect(render).toHaveBeenCalledTimes(2);
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
    const render = vi.fn()
      .mockImplementationOnce(() => { throw new Error('synthetic pipeline build failure'); })
      .mockImplementation(() => undefined);
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
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);

    await expect(runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene))
      .rejects.toThrow('synthetic pipeline build failure');
    await runtime.compileAndRender(root, new THREE.PerspectiveCamera(), scene);
    expect(render).toHaveBeenCalledTimes(2);
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
});
