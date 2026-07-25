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

export async function loadArenaVisualModule(
  arenaId: ArenaId,
  registry: ArenaVisualRegistry = ARENA_VISUAL_REGISTRY,
): Promise<ArenaVisualModule> {
  const module = await registry[arenaId]();
  if (module.definition.id !== arenaId) {
    throw new Error(`Arena module identity mismatch: requested ${arenaId}, loaded ${module.definition.id}`);
  }
  return module;
}

export type ArenaVisualSwitchReceipt = Readonly<{
  arenaId: ArenaId;
  generation: number;
  moduleId: string;
  requestedResources: readonly string[];
  activePresentationRoots: 1;
  authority: 'definition-loaded' | 'gameplay-root-adopted';
  retiredPresentationInventory: Readonly<{ geometries: number; materials: number }>;
}>;

function detachedGameplayPresentationInventory(root: THREE.Group): { geometries: number; materials: number } {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of nodeMaterials) materials.add(material);
  });
  // Authoritative procedural maps are retained detached for rollback and
  // lobby re-selection. Their per-arena TSL systems and render targets are the
  // disposable streamed layer; reusing disposed common-renderer buffers is an
  // invalid WebGPU use-after-destroy pattern.
  return { geometries: geometries.size, materials: materials.size };
}

export class ArenaVisualStreamController {
  private generation = 0;
  private pendingAbort: AbortController | null = null;
  private active: LoadedArenaVisual | null = null;
  private activeGameplayRoot: THREE.Group | null = null;
  private activeGameplayDefinition: ArenaVisualDefinition | null = null;
  private activeGameplayRequests: string[] = [];

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
      const module = await loadArenaVisualModule(arenaId, this.registry);
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
        authority: 'definition-loaded',
        retiredPresentationInventory: { geometries: 0, materials: 0 },
      };
    } catch (error) {
      candidate?.dispose();
      if (this.pendingAbort === abort) this.pendingAbort = null;
      throw error;
    }
  }

  /**
   * Applies a lazily imported visual definition to the arena root that already
   * owns gameplay collision and raycast authority. The root is moved into the
   * live scene atomically; no review copy or parallel procedural map is built.
   * Detached roots remain reusable by the lobby switcher, while the scene has
   * exactly one definition-owned arena presentation at all times.
   */
  async adoptGameplayRoot(arenaId: ArenaId, root: THREE.Group): Promise<ArenaVisualSwitchReceipt> {
    this.pendingAbort?.abort();
    const abort = new AbortController();
    this.pendingAbort = abort;
    const generation = this.generation + 1;
    this.generation = generation;
    const module = await loadArenaVisualModule(arenaId, this.registry);
    if (abort.signal.aborted || generation !== this.generation) throw new DOMException('Stale arena visual adoption', 'AbortError');
    if (root.userData.authoritativeArenaId !== undefined && root.userData.authoritativeArenaId !== arenaId) {
      throw new Error(`${arenaId} definition cannot adopt ${String(root.userData.authoritativeArenaId)} gameplay authority`);
    }
    const previous = this.activeGameplayRoot;
    let retiredPresentationInventory = { geometries: 0, materials: 0 };
    if (previous && previous !== root) {
      previous.removeFromParent();
      previous.visible = false;
      delete previous.userData.arenaVisualDefinitionId;
      delete previous.userData.arenaVisualGeneration;
      retiredPresentationInventory = detachedGameplayPresentationInventory(previous);
    }
    root.userData.authoritativeArenaId = arenaId;
    root.userData.arenaVisualDefinitionId = module.definition.id;
    root.userData.arenaVisualGeneration = generation;
    root.visible = true;
    if (root.parent !== this.scene) this.scene.add(root);
    this.activeGameplayRoot = root;
    this.activeGameplayDefinition = module.definition;
    this.activeGameplayRequests = [];
    this.pendingAbort = null;
    const activeRoots = this.scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined);
    if (activeRoots.length !== 1 || activeRoots[0] !== root) {
      throw new Error(`Expected one authoritative arena presentation root, found ${activeRoots.length}`);
    }
    return {
      arenaId,
      generation,
      moduleId: module.definition.moduleId,
      // Keep the receipt array live so selected quality assets loaded after the
      // atomic root adoption remain bound to the same generation receipt.
      requestedResources: this.activeGameplayRequests,
      activePresentationRoots: 1,
      authority: 'gameplay-root-adopted',
      retiredPresentationInventory,
    };
  }

  recordSelectedAssetRequest(arenaId: ArenaId, url: string): void {
    const definition = this.activeGameplayDefinition;
    if (!definition || definition.id !== arenaId || this.activeGameplayRoot?.userData.arenaVisualDefinitionId !== arenaId) {
      throw new Error(`${arenaId} asset request has no active matching ArenaVisualDefinition`);
    }
    const allowedResources = [...definition.assetDependencies, ...definition.sharedAssetDependencies];
    const allowed = allowedResources.some((dependency) => dependency.endsWith('/') ? url.startsWith(dependency) : url === dependency);
    if (!allowed) throw new Error(`${arenaId} requested undeclared or unselected arena resource ${url}`);
    if (!this.activeGameplayRequests.includes(url)) this.activeGameplayRequests.push(url);
  }

  dispose(): void {
    this.pendingAbort?.abort();
    this.pendingAbort = null;
    this.active?.dispose();
    this.active = null;
    if (this.activeGameplayRoot) {
      this.activeGameplayRoot.removeFromParent();
      this.activeGameplayRoot.visible = false;
      delete this.activeGameplayRoot.userData.arenaVisualDefinitionId;
      delete this.activeGameplayRoot.userData.arenaVisualGeneration;
    }
    this.activeGameplayRoot = null;
    this.activeGameplayDefinition = null;
    this.activeGameplayRequests = [];
  }
}
