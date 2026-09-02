import * as THREE from 'three';
import type { ArenaId } from '../map-selection';
import type { ArenaVisualDefinition, LoadedArenaVisual } from './arena-visual-definition';
import { retryLoad } from '../retry-load';

export type ArenaVisualModule = Readonly<{ definition: ArenaVisualDefinition }>;
export type ArenaVisualImporter = () => Promise<ArenaVisualModule>;
export type ArenaVisualRegistry = Readonly<Record<ArenaId, ArenaVisualImporter>>;

export const ARENA_VISUAL_REGISTRY: ArenaVisualRegistry = Object.freeze({
  'atomic-acres': () => import('./arenas/atomic-acres'),
  'rustworks-1v1': () => import('./arenas/rustworks-1v1'),
  'gun-range': () => import('./arenas/gun-range'),
  'skyline-terminal': () => import('./arenas/skyline-terminal'),
  // HF-359 (Pass 74): farcrysis revived from the Pass 69 hidden lane.
  'farcrysis': () => import('./arenas/farcrysis'),
  'high-seas': () => import('./arenas/high-seas'),
  // Owner 2026-08-30: Test1/Test2 (docs/TEST1_MAP_BRIEF.md, TEST2_MAP_BRIEF.md).
  'test1': () => import('./arenas/test1'),
  'test2': () => import('./arenas/test2'),
  // MAP3 (PREVIEW), owner 2026-09-02 via HF-405.
  'map3': () => import('./arenas/map3'),
});

export async function loadArenaVisualModule(
  arenaId: ArenaId,
  registry: ArenaVisualRegistry = ARENA_VISUAL_REGISTRY,
): Promise<ArenaVisualModule> {
  const module = await retryLoad(`arena module ${arenaId}`, () => registry[arenaId]());
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

const GAMEPLAY_AUTHORITY_KEYS = [
  'authoritativeArenaId',
  'arenaVisualDefinitionId',
  'arenaVisualGeneration',
] as const;

type GameplayAuthorityKey = typeof GAMEPLAY_AUTHORITY_KEYS[number];

type GameplayRootTransactionSnapshot = Readonly<{
  root: THREE.Group;
  parent: THREE.Object3D | null;
  parentIndex: number;
  visible: boolean;
  authority: Readonly<Record<GameplayAuthorityKey, Readonly<{ present: boolean; value: unknown }>>>;
}>;

function captureGameplayRootTransaction(root: THREE.Group): GameplayRootTransactionSnapshot {
  const authority = Object.fromEntries(GAMEPLAY_AUTHORITY_KEYS.map((key) => [key, Object.freeze({
    present: Object.prototype.hasOwnProperty.call(root.userData, key),
    value: root.userData[key],
  })])) as Record<GameplayAuthorityKey, Readonly<{ present: boolean; value: unknown }>>;
  return Object.freeze({
    root,
    parent: root.parent,
    parentIndex: root.parent?.children.indexOf(root) ?? -1,
    visible: root.visible,
    authority: Object.freeze(authority),
  });
}

function restoreGameplayRootTransactions(snapshots: readonly GameplayRootTransactionSnapshot[]): void {
  const uniqueSnapshots = snapshots.filter((snapshot, index) => (
    snapshots.findIndex((candidate) => candidate.root === snapshot.root) === index
  ));
  for (const snapshot of uniqueSnapshots) snapshot.root.removeFromParent();
  for (const snapshot of uniqueSnapshots) {
    snapshot.root.visible = snapshot.visible;
    for (const key of GAMEPLAY_AUTHORITY_KEYS) {
      const property = snapshot.authority[key];
      if (property.present) snapshot.root.userData[key] = property.value;
      else delete snapshot.root.userData[key];
    }
  }
  const byParent = new Map<THREE.Object3D, GameplayRootTransactionSnapshot[]>();
  for (const snapshot of uniqueSnapshots) {
    if (!snapshot.parent) continue;
    const siblings = byParent.get(snapshot.parent) ?? [];
    siblings.push(snapshot);
    byParent.set(snapshot.parent, siblings);
  }
  for (const [parent, siblings] of byParent) {
    siblings.sort((left, right) => left.parentIndex - right.parentIndex);
    for (const snapshot of siblings) {
      parent.add(snapshot.root);
      const addedIndex = parent.children.indexOf(snapshot.root);
      const targetIndex = Math.min(Math.max(0, snapshot.parentIndex), parent.children.length - 1);
      if (addedIndex === targetIndex) continue;
      parent.children.splice(addedIndex, 1);
      parent.children.splice(targetIndex, 0, snapshot.root);
    }
  }
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
    let transaction: Readonly<{
      previousRoot: THREE.Group | null;
      previousDefinition: ArenaVisualDefinition | null;
      previousRequests: string[];
      roots: readonly GameplayRootTransactionSnapshot[];
    }> | null = null;
    try {
      const module = await loadArenaVisualModule(arenaId, this.registry);
      if (abort.signal.aborted || generation !== this.generation) throw new DOMException('Stale arena visual adoption', 'AbortError');
      if (root.userData.authoritativeArenaId !== undefined && root.userData.authoritativeArenaId !== arenaId) {
        throw new Error(`${arenaId} definition cannot adopt ${String(root.userData.authoritativeArenaId)} gameplay authority`);
      }
      const previous = this.activeGameplayRoot;
      const retiredPresentationInventory = previous && previous !== root
        ? detachedGameplayPresentationInventory(previous)
        : { geometries: 0, materials: 0 };
      transaction = Object.freeze({
        previousRoot: previous,
        previousDefinition: this.activeGameplayDefinition,
        previousRequests: this.activeGameplayRequests,
        roots: Object.freeze([
          captureGameplayRootTransaction(root),
          ...(previous && previous !== root ? [captureGameplayRootTransaction(previous)] : []),
        ]),
      });
      if (previous && previous !== root) {
        previous.removeFromParent();
        previous.visible = false;
        delete previous.userData.arenaVisualDefinitionId;
        delete previous.userData.arenaVisualGeneration;
      }
      root.userData.authoritativeArenaId = arenaId;
      root.userData.arenaVisualDefinitionId = module.definition.id;
      root.userData.arenaVisualGeneration = generation;
      root.visible = true;
      if (root.parent !== this.scene) this.scene.add(root);
      const activeRoots = this.scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined);
      if (activeRoots.length !== 1 || activeRoots[0] !== root) {
        throw new Error(`Expected one authoritative arena presentation root, found ${activeRoots.length}`);
      }
      const selectedRequests: string[] = [];
      this.activeGameplayRoot = root;
      this.activeGameplayDefinition = module.definition;
      this.activeGameplayRequests = selectedRequests;
      if (this.pendingAbort === abort) this.pendingAbort = null;
      return {
        arenaId,
        generation,
        moduleId: module.definition.moduleId,
        // Keep the receipt array live so selected quality assets loaded after
        // the atomic root adoption remain bound to the same generation receipt.
        requestedResources: selectedRequests,
        activePresentationRoots: 1,
        authority: 'gameplay-root-adopted',
        retiredPresentationInventory,
      };
    } catch (error) {
      if (transaction) {
        restoreGameplayRootTransactions(transaction.roots);
        this.activeGameplayRoot = transaction.previousRoot;
        this.activeGameplayDefinition = transaction.previousDefinition;
        this.activeGameplayRequests = transaction.previousRequests;
      }
      if (this.pendingAbort === abort) this.pendingAbort = null;
      throw error;
    }
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

  /**
   * Repairs only presentation attachment/visibility for the exact root already
   * adopted by the selected definition. It never rebuilds map collision,
   * raycast authority, or substitutes another arena root.
   */
  restoreGameplayRoot(arenaId: ArenaId, root: THREE.Group): boolean {
    if (this.activeGameplayRoot !== root || this.activeGameplayDefinition?.id !== arenaId) return false;
    if (root.userData.authoritativeArenaId !== arenaId || root.userData.arenaVisualDefinitionId !== arenaId) return false;
    let changed = false;
    if (root.parent !== this.scene) {
      this.scene.add(root);
      changed = true;
    }
    if (!root.visible) {
      root.visible = true;
      changed = true;
    }
    const activeRoots = this.scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined);
    if (activeRoots.length !== 1 || activeRoots[0] !== root) return false;
    return changed;
  }

  /** Releases the exact failed gameplay generation without touching a successor. */
  discardGameplayRoot(arenaId: ArenaId, root: THREE.Group): boolean {
    if (this.activeGameplayRoot !== root || this.activeGameplayDefinition?.id !== arenaId) return false;
    root.removeFromParent();
    root.visible = false;
    delete root.userData.authoritativeArenaId;
    delete root.userData.arenaVisualDefinitionId;
    delete root.userData.arenaVisualGeneration;
    this.activeGameplayRoot = null;
    this.activeGameplayDefinition = null;
    this.activeGameplayRequests = [];
    return true;
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
