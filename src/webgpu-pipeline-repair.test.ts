import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  installTintPipelineRepair,
  isTintPipelineFailureMessage,
  sweepErroredPipelines,
} from './webgpu-pipeline-repair';

const TINT_MESSAGE = 'THREE.WebGPURenderer: Render pipeline creation failed (renderPipeline_MeshStandardMaterial_6346): '
  + 'An error occurred while generating Tint IR\nerror: swizzle view instruction still has usages after lowering';

function fakeRenderer(entries: Array<[string, { errored: boolean }]>) {
  const caches = new Map<string, object>();
  const backendData = new Map<object, { error?: boolean }>();
  for (const [key, spec] of entries) {
    const pipeline = { key };
    caches.set(key, pipeline);
    backendData.set(pipeline, spec.errored ? { error: true } : {});
  }
  return {
    _pipelines: { caches },
    backend: {
      get: (pipeline: object) => backendData.get(pipeline),
      delete: (pipeline: object) => { backendData.delete(pipeline); },
    },
    backendData,
  };
}

describe('Tint pipeline repair', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recognises the live Chrome 153 failure message and nothing else', () => {
    expect(isTintPipelineFailureMessage(TINT_MESSAGE)).toBe(true);
    expect(isTintPipelineFailureMessage('Render pipeline creation failed (x): device lost')).toBe(false);
    expect(isTintPipelineFailureMessage('some gameplay error about a pipeline of bots')).toBe(false);
  });

  it('purges ONLY errored pipelines and bumps material versions for the rebuild', () => {
    const renderer = fakeRenderer([
      ['healthy-a', { errored: false }],
      ['tint-victim', { errored: true }],
      ['healthy-b', { errored: false }],
    ]);
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial();
    const versionBefore = material.version;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    const result = sweepErroredPipelines(renderer, scene);
    expect(result.purged).toBe(1);
    expect(result.materialsBumped).toBe(1);
    expect(renderer._pipelines.caches.has('tint-victim')).toBe(false);
    expect(renderer._pipelines.caches.has('healthy-a')).toBe(true);
    expect(renderer._pipelines.caches.has('healthy-b')).toBe(true);
    expect(material.version).toBeGreaterThan(versionBefore);
  });

  it('degrades to a no-op on an unexpected renderer shape instead of throwing', () => {
    expect(sweepErroredPipelines(null, null)).toEqual({ purged: 0, materialsBumped: 0 });
    expect(sweepErroredPipelines({} as never, new THREE.Scene())).toEqual({ purged: 0, materialsBumped: 0 });
  });

  it('pins the three internals this module depends on (upgrade tripwire)', async () => {
    // If a three upgrade renames these, the repair silently dies - fail CI
    // here instead. WebGPURenderer cannot construct headless, so pin against
    // the renderer source and the Pipelines class shape.
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('node_modules/three/build/three.webgpu.js', 'utf8');
    expect(source).toContain('this._pipelines = new Pipelines(');
    expect(source).toContain('this.caches = new Map();');
    expect(source).toContain('pipelineData.error = true;');
  });

  it('schedules exactly one debounced sweep per burst of Tint errors', async () => {
    vi.useFakeTimers();
    const renderer = fakeRenderer([['tint-victim', { errored: true }]]);
    const scene = new THREE.Scene();
    const repairs: number[] = [];
    const uninstall = installTintPipelineRepair({
      getRenderer: () => renderer,
      getScene: () => scene,
      onRepair: (result) => repairs.push(result.purged),
      debounceMs: 100,
    });
    try {
      console.error(TINT_MESSAGE);
      console.error(TINT_MESSAGE);
      console.error(TINT_MESSAGE);
      expect(repairs).toEqual([]);
      await vi.advanceTimersByTimeAsync(150);
      expect(repairs).toEqual([1]);
      // Unrelated errors never schedule sweeps.
      console.error('ordinary log');
      await vi.advanceTimersByTimeAsync(500);
      expect(repairs).toEqual([1]);
    } finally {
      uninstall();
      vi.useRealTimers();
    }
  });
});
