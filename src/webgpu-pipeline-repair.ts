/**
 * webgpu-pipeline-repair.ts — in-place recovery for Chrome 153's Tint race.
 *
 * MEASURED 2026-08-29 on the affected build (153.0.8010.12, stable channel):
 * the same game bundle fails pipeline creation 3/3 when assets stream over
 * the real network and 0/4 with warm/local timing, and the async compile
 * path is clean 5/5. The failure is a TIMING race inside Tint's new swizzle
 * lowering, surfacing as "Render pipeline creation failed (...): error while
 * generating Tint IR / swizzle view instruction still has usages after
 * lowering". Three.js marks such a pipeline errored and silently never draws
 * that material again - a melted-looking arena on an otherwise healthy
 * session.
 *
 * The repair: because the bug is probabilistic per creation, RE-CREATING the
 * same pipeline usually succeeds. Three caches pipelines two levels deep
 * (renderer._pipelines.caches by shader cacheKey, and per-render-object
 * data), and consults the error flag forever without retrying. This module
 * purges every errored entry from the pipeline cache and bumps material
 * versions so the normal supported invalidation path rebuilds them - a
 * fresh createRenderPipeline call with fresh timing.
 *
 * Uses three's underscore-internal `_pipelines` deliberately and defensively:
 * every access is feature-checked so a three upgrade degrades this to a
 * no-op sweep (purged: 0) rather than a crash, and the unit suite pins the
 * internals' shape so an upgrade fails loudly in CI instead.
 */
import type * as THREE from 'three';

/** The Chrome 153 Tint failure classes seen live; keep the net wide enough
 * for the whole family, narrow enough to never match gameplay errors. */
export const TINT_PIPELINE_ERROR_PATTERN =
  /Render pipeline creation failed[\s\S]*?(Tint IR|swizzle view instruction)/i;

export function isTintPipelineFailureMessage(message: string): boolean {
  return TINT_PIPELINE_ERROR_PATTERN.test(message);
}

type PipelineCacheLike = {
  caches?: Map<string, object>;
};

type BackendLike = {
  get?: (key: object) => { error?: boolean } | undefined;
  delete?: (key: object) => void;
};

export type PipelineRepairResult = Readonly<{
  /** Errored pipelines removed from the cache (0 = nothing to repair). */
  purged: number;
  /** Materials whose versions were bumped to trigger the rebuild. */
  materialsBumped: number;
}>;

/**
 * Purge every errored pipeline from the renderer's cache and invalidate the
 * scene's materials so three rebuilds them through its supported path. Safe
 * to call on any backend/renderer shape - degrades to a no-op.
 */
export function sweepErroredPipelines(
  renderer: { _pipelines?: PipelineCacheLike; backend?: BackendLike } | null | undefined,
  scene: THREE.Object3D | null | undefined,
): PipelineRepairResult {
  const caches = renderer?._pipelines?.caches;
  const backend = renderer?.backend;
  if (!caches || typeof caches.forEach !== 'function' || typeof backend?.get !== 'function') {
    return { purged: 0, materialsBumped: 0 };
  }
  const doomed: string[] = [];
  caches.forEach((pipeline, key) => {
    try {
      const data = backend.get!(pipeline);
      if (data?.error === true) doomed.push(key);
    } catch {
      // A pipeline the backend cannot describe is not ours to touch.
    }
  });
  for (const key of doomed) {
    const pipeline = caches.get(key);
    caches.delete(key);
    if (pipeline) {
      try { backend.delete?.(pipeline); } catch { /* stale backend entry is harmless */ }
    }
  }
  let materialsBumped = 0;
  if (doomed.length > 0 && scene) {
    scene.traverse((node) => {
      const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) {
        entry.needsUpdate = true;
        materialsBumped += 1;
      }
    });
  }
  return { purged: doomed.length, materialsBumped };
}

/**
 * Console-driven scheduler: three reports the captured pipeline error only
 * through console.error, so that is the honest detection point. Chains the
 * original console.error untouched; sweeps are debounced and capped per
 * session so a persistent failure cannot loop.
 */
export function installTintPipelineRepair(options: {
  getRenderer: () => { _pipelines?: PipelineCacheLike; backend?: BackendLike } | null | undefined;
  getScene: () => THREE.Object3D | null;
  onRepair?: (result: PipelineRepairResult, sweepsUsed: number) => void;
  maximumSweeps?: number;
  debounceMs?: number;
}): () => void {
  const maximumSweeps = options.maximumSweeps ?? 5;
  const debounceMs = options.debounceMs ?? 450;
  let sweepsUsed = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const original = console.error.bind(console);
  const patched = (...args: unknown[]): void => {
    original(...args);
    if (sweepsUsed >= maximumSweeps || pending !== null) return;
    const message = args.map((value) => String(value)).join(' ');
    if (!isTintPipelineFailureMessage(message)) return;
    pending = setTimeout(() => {
      pending = null;
      sweepsUsed += 1;
      const result = sweepErroredPipelines(options.getRenderer(), options.getScene());
      options.onRepair?.(result, sweepsUsed);
    }, debounceMs);
  };
  console.error = patched;
  return () => {
    if (pending !== null) clearTimeout(pending);
    if (console.error === patched) console.error = original;
  };
}
