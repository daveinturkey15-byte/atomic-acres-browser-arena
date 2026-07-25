import * as THREE from 'three';
import type { ArenaId } from '../map-selection';
import type { ArenaVisualDefinition, LoadedArenaVisual } from './arena-visual-definition';

export type ArenaVisualModule = Readonly<{ definition: ArenaVisualDefinition }>;
export type ArenaVisualImporter = () => Promise<ArenaVisualModule>;
export type ArenaVisualRegistry = Readonly<Record<ArenaId, ArenaVisualImporter>>;

export const ARENA_VISUAL_REGISTRY: ArenaVisualRegistry = Object.freeze({
  'atomic-acres': () => import('./arenas/atomic-acres'),
  'rustworks-1v1': () => import('./arenas/rustworks-1v1'),
  'gun-range': () => import('./arenas/gun-range'),
  'skyline-terminal': () => import('./arenas/skyline-terminal'),
});

export type ArenaVisualSwitchReceipt = Readonly<{
  arenaId: ArenaId;
  generation: number;
  moduleId: string;
  requestedResources: readonly string[];
  activePresentationRoots: 1;
}>;

export class ArenaVisualStreamController {
  private generation = 0;
  private pendingAbort: AbortController | null = null;
  private active: LoadedArenaVisual | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly registry: ArenaVisualRegistry = ARENA_VISUAL_REGISTRY,
  ) {}

  async switchTo(arenaId: ArenaId): Promise<ArenaVisualSwitchReceipt> {
    this.pendingAbort?.abort();
    const abort = new AbortController();
    this.pendingAbort = abort;
    const generation = this.generation + 1;
    this.generation = generation;
    let candidate: LoadedArenaVisual | null = null;
    try {
      const module = await this.registry[arenaId]();
      if (module.definition.id !== arenaId) {
        throw new Error(`Arena module identity mismatch: requested ${arenaId}, loaded ${module.definition.id}`);
      }
      const requestedResources: string[] = [];
      candidate = await module.definition.load({
        signal: abort.signal,
        generation,
        recordRequest: (url) => requestedResources.push(url),
      });
      if (abort.signal.aborted || generation !== this.generation) throw new DOMException('Stale arena visual load', 'AbortError');
      if (candidate.root.parent !== null) throw new Error(`${arenaId} loaded presentation root was not detached`);
      const allowedResources = [...module.definition.assetDependencies, ...module.definition.sharedAssetDependencies];
      for (const url of requestedResources) {
        const allowed = allowedResources.some((dependency) => dependency.endsWith('/') ? url.startsWith(dependency) : url === dependency);
        if (!allowed) throw new Error(`${arenaId} requested undeclared or unselected arena resource ${url}`);
      }
      const previous = this.active;
      this.scene.add(candidate.root);
      this.active = candidate;
      previous?.dispose();
      this.pendingAbort = null;
      const activeRoots = this.scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined);
      if (activeRoots.length !== 1) throw new Error(`Expected one active arena presentation root, found ${activeRoots.length}`);
      return {
        arenaId,
        generation,
        moduleId: module.definition.moduleId,
        requestedResources,
        activePresentationRoots: 1,
      };
    } catch (error) {
      candidate?.dispose();
      if (this.pendingAbort === abort) this.pendingAbort = null;
      throw error;
    }
  }

  dispose(): void {
    this.pendingAbort?.abort();
    this.pendingAbort = null;
    this.active?.dispose();
    this.active = null;
  }
}
