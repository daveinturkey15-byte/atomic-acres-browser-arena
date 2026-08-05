import * as THREE from 'three';
import { createOperatorWeaponPresentation } from './art-kit';
import { BOT_WEAPON_POOL } from './bot-arsenal';
import type { WeaponId } from './protocol';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { disposePass65WeaponModel, loadPass65WeaponPresentation } from './weapon-model';
import { yieldBrowserCpuTask } from './browser-preparation-scheduler';

const EXPECTED_BOT_WEAPON_IDS: readonly WeaponId[] = Object.freeze([...BOT_WEAPON_POOL]);

export const BOT_WEAPON_CPU_MODELS_PER_SLICE = 1 as const;

export type BotWeaponGpuVocabularyTelemetry = Readonly<{
  expectedIds: readonly WeaponId[];
  preparedIds: readonly WeaponId[];
  gpuReadyIds: readonly WeaponId[];
  sceneGeneration: number | null;
  prepared: boolean;
  gpuReady: boolean;
  preparing: boolean;
  gpuPrewarming: boolean;
  sceneAttached: boolean;
  hidden: boolean;
  lastError: string | null;
}>;

export type BotWeaponCpuYield = () => Promise<void>;

function defaultCpuYield(): Promise<void> {
  return yieldBrowserCpuTask();
}

/**
 * Retains the exact third-person weapon vocabulary bots can equip.
 *
 * The root is presentation-only and stays attached to the submitted scene for
 * the page lifetime. CPU asset decode/model construction can advance in
 * bounded slices while the menu video is visible; GPU readiness is committed
 * only after one exact compile-and-render fence succeeds for the current scene
 * generation. No operator, bot, weapon cycle, or authoritative arsenal state
 * is read or mutated here.
 */
export class BotWeaponGpuVocabulary {
  readonly root = new THREE.Group();

  private readonly models = new Map<WeaponId, THREE.Group>();
  private readonly gpuReadyIds = new Set<WeaponId>();
  private cpuPreparationPromise: Promise<void> | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private gpuReadySceneGeneration: number | null = null;
  private lastError: string | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly flattenMaterials = false,
  ) {
    this.root.name = 'retained-bot-weapon-gpu-vocabulary';
    this.root.visible = false;
    this.root.userData.presentationOnly = true;
    this.root.userData.retainedBotWeaponGpuVocabulary = true;
    this.root.raycast = () => undefined;
    scene.add(this.root);
  }

  async prepareCpu(yieldToBrowser: BotWeaponCpuYield = defaultCpuYield): Promise<void> {
    this.assertActive();
    if (this.models.size === EXPECTED_BOT_WEAPON_IDS.length) return;
    if (this.cpuPreparationPromise) return this.cpuPreparationPromise;

    let operation!: Promise<void>;
    operation = this.performCpuPreparation(yieldToBrowser).finally(() => {
      if (this.cpuPreparationPromise === operation) this.cpuPreparationPromise = null;
    });
    this.cpuPreparationPromise = operation;
    return operation;
  }

  private async performCpuPreparation(yieldToBrowser: BotWeaponCpuYield): Promise<void> {
    for (const [index, id] of EXPECTED_BOT_WEAPON_IDS.entries()) {
      this.assertActive();
      if (this.models.has(id)) continue;
      try {
        // Browser production must acquire the authored world source before the
        // shared synchronous factory creates its one retained cache-owning clone.
        if (typeof document !== 'undefined') await loadPass65WeaponPresentation(id, 'world');
        this.assertActive();
        const model = createOperatorWeaponPresentation(id, this.flattenMaterials);
        if (!model) throw new Error(`Authored bot world weapon unavailable after load: ${id}`);
        model.userData.botWeaponGpuVocabularyId = id;
        this.models.set(id, model);
        this.root.add(model);
        this.lastError = null;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
      if ((index + 1) % BOT_WEAPON_CPU_MODELS_PER_SLICE === 0
        && index + 1 < EXPECTED_BOT_WEAPON_IDS.length) {
        await yieldToBrowser();
      }
    }
  }

  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
    yieldToBrowser: BotWeaponCpuYield = defaultCpuYield,
  ): Promise<void> {
    this.assertActive();
    if (!Number.isSafeInteger(sceneGeneration) || sceneGeneration < 0) {
      throw new Error(`Bot weapon GPU vocabulary requires a non-negative integer scene generation; received ${sceneGeneration}`);
    }
    if (this.gpuReadySceneGeneration === sceneGeneration
      && this.gpuReadyIds.size === EXPECTED_BOT_WEAPON_IDS.length) return;

    // A retained clone set survives arena changes, but pipeline readiness does
    // not. Invalidate synchronously so telemetry can never advertise the prior
    // generation while the replacement fence is queued.
    if (this.gpuReadySceneGeneration !== sceneGeneration) {
      this.gpuReadyIds.clear();
      this.gpuReadySceneGeneration = null;
    }

    while (this.gpuPrewarmPromise) {
      const pending = this.gpuPrewarmPromise;
      try {
        await pending;
      } catch {
        // The caller that owned the failed attempt receives its rejection.
        // A queued caller may retry the exact retained vocabulary.
      }
      if (this.gpuReadySceneGeneration === sceneGeneration
        && this.gpuReadyIds.size === EXPECTED_BOT_WEAPON_IDS.length) return;
    }

    if (this.gpuReadySceneGeneration !== sceneGeneration) {
      this.gpuReadyIds.clear();
      this.gpuReadySceneGeneration = null;
    }

    let operation!: Promise<void>;
    operation = this.performGpuPrewarm(runtime, camera, sceneGeneration, yieldToBrowser).finally(() => {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    });
    this.gpuPrewarmPromise = operation;
    return operation;
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
    yieldToBrowser: BotWeaponCpuYield,
  ): Promise<void> {
    await this.prepareCpu(yieldToBrowser);
    this.assertActive();
    if (this.root.parent !== this.scene) {
      this.lastError = 'Bot weapon GPU vocabulary root must remain attached to its submitted scene';
      throw new Error(this.lastError);
    }
    if (this.models.size !== EXPECTED_BOT_WEAPON_IDS.length) {
      this.lastError = 'Bot weapon GPU vocabulary cannot prewarm an incomplete canonical catalog';
      throw new Error(this.lastError);
    }

    const frustumStates = new Map<THREE.Object3D, boolean>();
    this.root.traverse((node) => {
      frustumStates.set(node, node.frustumCulled);
      node.frustumCulled = false;
    });
    this.gpuReadyIds.clear();
    this.gpuReadySceneGeneration = null;
    this.root.visible = true;
    try {
      await runtime.compileAndRender(this.root, camera, this.scene);
      this.assertActive();
      for (const id of EXPECTED_BOT_WEAPON_IDS) this.gpuReadyIds.add(id);
      this.gpuReadySceneGeneration = sceneGeneration;
      this.lastError = null;
    } catch (error) {
      this.gpuReadyIds.clear();
      this.gpuReadySceneGeneration = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      for (const [node, frustumCulled] of frustumStates) node.frustumCulled = frustumCulled;
      // Exact cache-owning clones stay attached so their authored shader,
      // texture and layout vocabulary remains warm. Live bot swaps still own
      // their distinct presentation clones; no vocabulary geometry may leak.
      this.root.visible = false;
    }
  }

  telemetry(): BotWeaponGpuVocabularyTelemetry {
    const preparedIds = EXPECTED_BOT_WEAPON_IDS.filter((id) => this.models.has(id));
    const gpuReadyIds = EXPECTED_BOT_WEAPON_IDS.filter((id) => this.gpuReadyIds.has(id));
    return Object.freeze({
      expectedIds: EXPECTED_BOT_WEAPON_IDS,
      preparedIds: Object.freeze(preparedIds),
      gpuReadyIds: Object.freeze(gpuReadyIds),
      sceneGeneration: this.gpuReadySceneGeneration,
      prepared: preparedIds.length === EXPECTED_BOT_WEAPON_IDS.length,
      gpuReady: this.gpuReadySceneGeneration !== null
        && gpuReadyIds.length === EXPECTED_BOT_WEAPON_IDS.length,
      preparing: this.cpuPreparationPromise !== null,
      gpuPrewarming: this.gpuPrewarmPromise !== null,
      sceneAttached: this.root.parent === this.scene,
      hidden: !this.root.visible,
      lastError: this.lastError,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.cpuPreparationPromise || this.gpuPrewarmPromise) {
      throw new Error('Bot weapon GPU vocabulary cannot be disposed while preparation is in flight');
    }
    this.disposed = true;
    this.root.visible = false;
    this.scene.remove(this.root);
    for (const model of this.models.values()) disposePass65WeaponModel(model);
    this.models.clear();
    this.gpuReadyIds.clear();
    this.gpuReadySceneGeneration = null;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Bot weapon GPU vocabulary is disposed');
  }
}
