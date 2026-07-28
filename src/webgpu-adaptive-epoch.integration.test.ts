import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AdaptiveQualityController, DeferredAdaptivePixelRatio } from './adaptive-quality';

type Presentation = Readonly<{
  submissionSequence: number;
  completedSequence: number;
  pendingSince: number | null;
  lastCompletionLatencyMs: number | null;
}>;

type RuntimeHarness = Readonly<{
  resetWebGpuPresentationEpoch: (reason: string, now: number) => void;
  adaptToCompletedWebGpuQueueLatency: (now: number) => void;
  applyDeferredAdaptiveWebGpuRenderBudget: (now: number) => boolean;
}>;

function sliceThrough(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not isolate production lifecycle between ${startMarker} and ${endMarker}`);
  return source.slice(start, end);
}

function buildRuntimeHarness(input: Readonly<{
  renderRuntime: {
    backend: 'webgpu';
    resetPresentationProgressTelemetry: (reason: string, now: number) => void;
    presentationTelemetry: (now: number) => Presentation;
  };
  deferredWebGpuAdaptivePixelRatio: DeferredAdaptivePixelRatio;
  adaptiveQuality: AdaptiveQualityController;
  applyAdaptiveRenderBudget: (pixelRatioCap: number) => void;
  setGrassPixelRatio: (pixelRatioCap: number) => void;
  resize: () => void;
}>): RuntimeHarness {
  const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
  const epochReset = sliceThrough(
    source,
    'function resetWebGpuPresentationEpoch(',
    'let lastHudAt',
  );
  const adaptiveLifecycle = sliceThrough(
    source,
    'function applyDeferredAdaptiveWebGpuRenderBudget(',
    'function selectedArenaPresentationRoot(',
  );
  const harnessSource = ts.transpileModule(`
    function createHarness() {
      let lastAdaptedWebGpuCompletionSequence = 0;
      const LIVE_WEBGPU_QUEUE_DOWNSHIFT_MS = 250;
      const gameStarted = true;
      const matchState = { phase: 'active' };
      const renderSubmissionPaused = false;
      const debugRenderPaused = false;
      const document = { visibilityState: 'visible' };
      const menu = { classList: { contains: (token: string) => token === 'hidden' } };
      const grassSystem = { setAdaptivePixelRatio: setGrassPixelRatio };
      ${epochReset}
      ${adaptiveLifecycle}
      return {
        resetWebGpuPresentationEpoch,
        adaptToCompletedWebGpuQueueLatency,
        applyDeferredAdaptiveWebGpuRenderBudget,
      };
    }
  `, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const factory = new Function(
    'renderRuntime',
    'deferredWebGpuAdaptivePixelRatio',
    'adaptiveQuality',
    'applyAdaptiveRenderBudget',
    'setGrassPixelRatio',
    'resize',
    `${harnessSource}\nreturn createHarness();`,
  ) as (
    renderRuntime: typeof input.renderRuntime,
    deferredWebGpuAdaptivePixelRatio: DeferredAdaptivePixelRatio,
    adaptiveQuality: AdaptiveQualityController,
    applyAdaptiveRenderBudget: (pixelRatioCap: number) => void,
    setGrassPixelRatio: (pixelRatioCap: number) => void,
    resize: () => void,
  ) => RuntimeHarness;
  return factory(
    input.renderRuntime,
    input.deferredWebGpuAdaptivePixelRatio,
    input.adaptiveQuality,
    input.applyAdaptiveRenderBudget,
    input.setGrassPixelRatio,
    input.resize,
  );
}

describe('live WebGPU adaptive presentation epochs', () => {
  it('consumes a stale completion and discards its deferred resize before foreground adaptation resumes', () => {
    let presentation: Presentation = {
      submissionSequence: 8,
      completedSequence: 7,
      pendingSince: 4_000,
      lastCompletionLatencyMs: 700,
    };
    const resetPresentationProgressTelemetry = vi.fn(() => {
      // Reproduce a hidden-epoch completion retiring while refocus establishes
      // the new foreground telemetry window.
      presentation = {
        submissionSequence: 8,
        completedSequence: 8,
        pendingSince: null,
        lastCompletionLatencyMs: 700,
      };
    });
    const deferred = new DeferredAdaptivePixelRatio();
    deferred.request(0.75);
    const adaptive = new AdaptiveQualityController({
      profile: 'blender',
      targetFrameMs: 1_000 / 60,
      initialPixelRatioCap: 1,
    });
    const forceDownshift = vi.spyOn(adaptive, 'forceDownshift');
    const applyAdaptiveRenderBudget = vi.fn();
    const setGrassPixelRatio = vi.fn();
    const resize = vi.fn();
    const harness = buildRuntimeHarness({
      renderRuntime: {
        backend: 'webgpu',
        resetPresentationProgressTelemetry,
        presentationTelemetry: () => presentation,
      },
      deferredWebGpuAdaptivePixelRatio: deferred,
      adaptiveQuality: adaptive,
      applyAdaptiveRenderBudget,
      setGrassPixelRatio,
      resize,
    });

    harness.resetWebGpuPresentationEpoch('tab visibility regained', 5_000);
    harness.adaptToCompletedWebGpuQueueLatency(5_001);

    expect(resetPresentationProgressTelemetry).toHaveBeenCalledWith('tab visibility regained', 5_000);
    expect(forceDownshift).not.toHaveBeenCalled();
    expect(adaptive.telemetry()).toMatchObject({ pixelRatioCap: 1, downshifts: 0 });
    expect(deferred.pending()).toBeNull();
    expect(harness.applyDeferredAdaptiveWebGpuRenderBudget(5_001)).toBe(false);
    expect(applyAdaptiveRenderBudget).not.toHaveBeenCalled();
    expect(setGrassPixelRatio).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();

    // The epoch reset must consume only the stale frontier. The first actual
    // foreground completion remains eligible for the normal adaptive path.
    presentation = {
      submissionSequence: 9,
      completedSequence: 9,
      pendingSince: null,
      lastCompletionLatencyMs: 600,
    };
    harness.adaptToCompletedWebGpuQueueLatency(5_600);

    expect(forceDownshift).toHaveBeenCalledTimes(1);
    expect(adaptive.telemetry()).toMatchObject({ pixelRatioCap: 0.85, downshifts: 1 });
    expect(deferred.pending()).toBe(0.85);
    expect(harness.applyDeferredAdaptiveWebGpuRenderBudget(5_601)).toBe(true);
    expect(applyAdaptiveRenderBudget).toHaveBeenCalledWith(0.85);
    expect(setGrassPixelRatio).toHaveBeenCalledWith(0.85);
    expect(resize).toHaveBeenCalledTimes(1);
  });
});
