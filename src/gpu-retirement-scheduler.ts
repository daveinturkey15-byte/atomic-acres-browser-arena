/**
 * Deferred GPU retirement scheduler.
 *
 * Extracted verbatim from `legacy-main.ts` (Pass 79 streamline unit 1): roots and
 * geometries removed from the scene are parked until a WebGPU fence proves the
 * GPU no longer reads them, then disposed one-per-browser-frame so cleanup never
 * collides with match admission or a weapon switch.
 *
 * Backend access and frame fencing are injected so this module stays a leaf
 * service: it owns only its queues, WeakSets and counters.
 */
import * as THREE from 'three';
import {
  invalidatePass65PresentationTree,
  releasePass65WeaponModelsIn,
} from './weapon-model';
import { isSharedMeshGeometry } from './gpu-resource-ownership';
import { yieldBrowserPreparationFrame } from './browser-preparation-scheduler';

type DeferredGpuRetirement = Readonly<{
  kind: 'root';
  root: THREE.Object3D;
  disposeResources: boolean;
  afterFence?: () => void;
}> | Readonly<{
  kind: 'geometry';
  geometry: THREE.BufferGeometry;
}>;

export type GpuRetirementTelemetry = Readonly<{
  queuedResources: number;
  queuedRoots: number;
  queuedGeometries: number;
  draining: boolean;
  fences: number;
  scheduledRoots: number;
  scheduledGeometries: number;
  disposedRoots: number;
  disposedGeometries: number;
  failures: number;
}>;

export type GpuRetirementSchedulerDeps = Readonly<{
  /** Current render backend id; fence accounting counts WebGPU fences only. */
  backend(): string;
  /**
   * Resolves once every already-submitted frame's GPU work has completed,
   * making disposal of retired resources safe. Implemented by legacy-main's
   * `flushWebGpuFrames` over `renderRuntime.waitForSubmittedWork`.
   */
  flushSubmittedFrames(timeoutMs?: number): Promise<void>;
}>;

export type DeferredGpuRetirementScheduler = Readonly<{
  /**
   * Retire a detached scene root. `disposeResourcesOrAfterFence` is either the
   * resource-disposal flag or an `afterFence` hook; `explicitAfterFence` pairs
   * with an explicit flag.
   */
  schedule(
    root: THREE.Object3D,
    disposeResourcesOrAfterFence?: boolean | (() => void),
    explicitAfterFence?: () => void,
  ): void;
  /** Retire a single buffer geometry after the next fence. */
  scheduleGeometry(geometry: THREE.BufferGeometry): void;
  /** Live queue/counters snapshot for the QA debug registry. */
  telemetry(): GpuRetirementTelemetry;
}>;

export function createGpuRetirementScheduler(
  deps: GpuRetirementSchedulerDeps,
): DeferredGpuRetirementScheduler {
  const deferredGpuRetirements: DeferredGpuRetirement[] = [];
  const scheduledGpuRetirementRoots = new WeakSet<THREE.Object3D>();
  const scheduledGpuRetirementGeometries = new WeakSet<THREE.BufferGeometry>();
  let gpuRetirementTask: Promise<void> | null = null;
  let gpuRetirementFences = 0;
  let gpuRetirementScheduledRoots = 0;
  let gpuRetirementScheduledGeometries = 0;
  let gpuRetirementDisposedRoots = 0;
  let gpuRetirementDisposedGeometries = 0;
  let gpuRetirementFailures = 0;

  async function yieldDeferredGpuRetirementTask(): Promise<void> {
    await yieldBrowserPreparationFrame();
  }

  function disposeDetachedRootResources(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        geometries.add(node.geometry);
        const entries = Array.isArray(node.material) ? node.material : [node.material];
        entries.forEach((material) => materials.add(material));
      }
      if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
        node.shadow.map?.dispose();
      }
    });
    geometries.forEach((geometry) => { if (!isSharedMeshGeometry(geometry)) geometry.dispose(); });
    materials.forEach((material) => material.dispose());
    root.clear();
  }

  async function drainDeferredGpuRetirements(): Promise<void> {
    while (deferredGpuRetirements.length > 0) {
      // Snapshot before fencing. Roots detached after this target was captured
      // may have appeared in a newer submission and must wait for the next
      // fence, never piggyback on this one.
      const batch = deferredGpuRetirements.splice(0, deferredGpuRetirements.length);
      try {
        await deps.flushSubmittedFrames();
        if (deps.backend() === 'webgpu') gpuRetirementFences += 1;
      } catch (error) {
        gpuRetirementFailures += 1;
        deferredGpuRetirements.unshift(...batch);
        console.warn('[Pass 65 GPU retirement fence failed; resources retained]', error);
        return;
      }
      for (const [retirementIndex, retirement] of batch.entries()) {
        if (retirement.kind === 'geometry') {
          retirement.geometry.dispose();
          gpuRetirementDisposedGeometries += 1;
        } else {
          // Cache ownership outlives one clone. Release refs only after the GPU
          // fence and before generic teardown clears the nested weapon roots.
          releasePass65WeaponModelsIn(retirement.root);
          if (retirement.disposeResources) disposeDetachedRootResources(retirement.root);
          retirement.afterFence?.();
          gpuRetirementDisposedRoots += 1;
        }
        // Fence completion only establishes that disposal is safe; it does not
        // require every detached hierarchy to be torn down in one browser task.
        // One retirement per frame prevents cleanup of prewarm clones and old
        // operators from colliding with match admission or a weapon switch.
        if (retirementIndex + 1 < batch.length || deferredGpuRetirements.length > 0) {
          await yieldDeferredGpuRetirementTask();
        }
      }
    }
  }

  function scheduleDeferredGpuRetirement(
    root: THREE.Object3D,
    disposeResourcesOrAfterFence: boolean | (() => void) = true,
    explicitAfterFence?: () => void,
  ): void {
    if (scheduledGpuRetirementRoots.has(root)) return;
    const disposeResources = typeof disposeResourcesOrAfterFence === 'boolean' ? disposeResourcesOrAfterFence : true;
    const afterFence = typeof disposeResourcesOrAfterFence === 'function' ? disposeResourcesOrAfterFence : explicitAfterFence;
    scheduledGpuRetirementRoots.add(root);
    gpuRetirementScheduledRoots += 1;
    invalidatePass65PresentationTree(root);
    root.removeFromParent();
    root.visible = false;
    deferredGpuRetirements.push(Object.freeze({ kind: 'root', root, disposeResources, afterFence }));
    scheduleGpuRetirementDrain();
  }

  function scheduleDeferredGpuGeometryRetirement(geometry: THREE.BufferGeometry): void {
    if (scheduledGpuRetirementGeometries.has(geometry)) return;
    scheduledGpuRetirementGeometries.add(geometry);
    gpuRetirementScheduledGeometries += 1;
    deferredGpuRetirements.push(Object.freeze({ kind: 'geometry', geometry }));
    scheduleGpuRetirementDrain();
  }

  function scheduleGpuRetirementDrain(): void {
    if (gpuRetirementTask) return;
    gpuRetirementTask = drainDeferredGpuRetirements().finally(() => {
      gpuRetirementTask = null;
      if (deferredGpuRetirements.length > 0) {
        // A failed fence retains resources safely. A later admitted frame or map
        // transition will give the queue another completion target.
        window.setTimeout(() => {
          if (!gpuRetirementTask) {
            gpuRetirementTask = drainDeferredGpuRetirements().finally(() => { gpuRetirementTask = null; });
          }
        }, 250);
      }
    });
  }

  return {
    schedule: scheduleDeferredGpuRetirement,
    scheduleGeometry: scheduleDeferredGpuGeometryRetirement,
    telemetry(): GpuRetirementTelemetry {
      return Object.freeze({
        queuedResources: deferredGpuRetirements.length,
        queuedRoots: deferredGpuRetirements.filter((entry) => entry.kind === 'root').length,
        queuedGeometries: deferredGpuRetirements.filter((entry) => entry.kind === 'geometry').length,
        draining: gpuRetirementTask !== null,
        fences: gpuRetirementFences,
        scheduledRoots: gpuRetirementScheduledRoots,
        scheduledGeometries: gpuRetirementScheduledGeometries,
        disposedRoots: gpuRetirementDisposedRoots,
        disposedGeometries: gpuRetirementDisposedGeometries,
        failures: gpuRetirementFailures,
      });
    },
  };
}
