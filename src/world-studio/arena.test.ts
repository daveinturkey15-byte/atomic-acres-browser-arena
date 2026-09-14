import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWorldStudio } from './arena';
import { validArenaSpawnPoint } from '../spawn-safety';
import type { ArenaMap } from '../map';
import type { HousePresentation } from './blender-presentation/houses';
import { HOUSE_SHELLS, type HouseShellAudit, type HouseVariant, type StudioHouseShells } from './houses';
describe('fresh world authority and integrated assets', () => {
  const scene = new THREE.Scene();
  const arena = buildWorldStudio(scene);
  it('builds exactly the new root with architecture, nature, vehicles and furnishings', () => {
    expect(arena.id).toBe('world-studio');
    expect(scene.children).toEqual([arena.root]);
    for (const name of ['world-studio-architecture', 'world-studio-nature', 'world-studio-interiors'])
      expect(arena.root.getObjectByName(name)).toBeDefined();
    expect(arena.physicalCover.length).toBeGreaterThan(6);
  });
  it('supports every authored backyard spawn outside all blocking geometry', () => {
    for (const points of Object.values(arena.spawns)) {
      expect(points.length).toBe(8);
      for (const p of points) expect(validArenaSpawnPoint(p, arena.bounds, arena.colliders), `spawn ${p.toArray()}`).toBe(true);
    }
  });
  it('carries unique shot authority and independent glass panes', () => {
    expect(new Set(arena.shotSurfaces.map(s => s.id)).size).toBe(arena.shotSurfaces.length);
    const staticSurfaces = arena.shotSurfaces.filter(s => !s.breakableWindowId);
    expect(arena.physicsColliders).toEqual(staticSurfaces.map(s => s.bounds));
    for (const pane of arena.shotSurfaces.filter(s => s.breakableWindowId))
      expect(arena.colliders).not.toContain(pane.bounds);
    expect(arena.breakableWindows.length).toBeGreaterThan(8);
    expect(new Set(arena.breakableWindows.map(w => w.mesh)).size).toBe(arena.breakableWindows.length);
    for (const surface of arena.shotSurfaces) {
      expect([surface.bounds.minX, surface.bounds.maxX, surface.bounds.minY, surface.bounds.maxY, surface.bounds.minZ, surface.bounds.maxZ].every(Number.isFinite)).toBe(true);
    }
  });
  it('has physically authored vertical routes and a single active animation hook', () => {
    expect(arena.root.userData.verticalNavigation.routes.length).toBeGreaterThanOrEqual(4);
    expect(arena.update).toBeTypeOf('function');
  });
});

interface ControllableShells {
  root: THREE.Group;
  ready: Promise<void>;
  audits: Map<HouseVariant, HouseShellAudit>;
  readonly disposeCalls: number;
  dispose(): void;
  attach(variant: HouseVariant, audit: HouseShellAudit): THREE.Group;
  resolveAll(list: HouseShellAudit[]): Promise<void>;
}
function controllableShells(): ControllableShells {
  const root = new THREE.Group();
  const audits = new Map<HouseVariant, HouseShellAudit>();
  const attached: THREE.Object3D[] = [];
  let disposed = false;
  let disposeCalls = 0;
  // Promise.withResolvers is ES2024; this repo pins lib ES2022 (tsconfig.json), and the sibling
  // stub in blender-presentation/houses.test.ts uses the executor form, so this matches it.
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => { settle = resolve; });
  const release = (scene: THREE.Object3D): void => {
    scene.traverse((node) => {
      const mesh = node as Partial<THREE.Mesh>;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
      mesh.geometry!.dispose();
    });
  };
  const shells: ControllableShells = {
    root,
    ready,
    audits,
    get disposeCalls(): number { return disposeCalls; },
    dispose(): void {
      disposeCalls += 1;
      if (disposed) return;
      disposed = true;
      for (const node of attached) { root.remove(node); release(node); }
      attached.length = 0;
      audits.clear();
      root.clear();
    },
    attach(variant: HouseVariant, audit: HouseShellAudit): THREE.Group {
      const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
      const scene = new THREE.Group();
      scene.name = spec.partition;
      const opaque = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      opaque.name = `wave3-${variant}-siding`;
      scene.add(opaque);
      if (disposed) { release(scene); return scene; }
      audits.set(variant, audit);
      attached.push(scene);
      root.add(scene);
      return scene;
    },
    async resolveAll(list: HouseShellAudit[]): Promise<void> {
      for (const audit of list) shells.attach(audit.variant, audit);
      settle();
      // Microtask order is the whole signal here: the presentation handlers were registered on
      // `ready` before this await, so awaiting the exposed promises observes their effects.
      await ready;
    },
  };
  return shells;
}

function passingAudit(variant: HouseVariant): HouseShellAudit {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
  return {
    variant, houseId: spec.houseId, partition: spec.partition, passed: true,
    failures: [], windowIds: [], apertureIds: [], blockedApertureIds: [], routeIds: [],
    interiorApertureIds: [], blockedInteriorApertureIds: [], partitionIds: [], stairTreadTops: [],
    triangles: 1, drawGroups: 1, localBounds: null,
  };
}

function stagedArenaWithShells(): {
  staging: THREE.Scene;
  shells: ControllableShells;
  arena: ArenaMap;
  presentation: HousePresentation;
} {
  const staging = new THREE.Scene();
  const shells = controllableShells();
  const arena = buildWorldStudio(staging, { createShells: () => shells as unknown as StudioHouseShells });
  const presentation = arena.root.userData.worldStudioHousePresentation as HousePresentation;
  return { staging, shells, arena, presentation };
}

function proceduralHouseNodes(arena: ArenaMap, houseId: string): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [];
  arena.root.traverse((node) => { if (node.name.startsWith(`world-studio-${houseId}-`)) nodes.push(node); });
  return nodes;
}

describe('world-studio arena presentation lifecycle (wave 3)', () => {
  it('survives the staging detach and reaches ready after live adoption', async () => {
    const { arena, shells, presentation } = stagedArenaWithShells();
    // legacy-main constructArena builds into staging, then detaches immediately.
    arena.root.removeFromParent();
    expect(arena.root.parent).toBeNull();
    expect(presentation.status()).toBe('loading');
    expect(arena.root.userData.worldStudioHouseStatus).toBe('loading');
    // Live adoption (arenaVisualStream reparent into the gameplay scene).
    const live = new THREE.Scene();
    live.add(arena.root);
    await shells.resolveAll([passingAudit('teal'), passingAudit('yellow')]);
    await presentation.ready;
    expect(presentation.status()).toBe('ready');
    expect(arena.root.userData.worldStudioHouseStatus).toBe('ready');
    const outcomes = arena.root.userData.worldStudioHouseOutcomes as Record<string, { substituted: boolean }>;
    expect(outcomes.teal.substituted).toBe(true);
    expect(outcomes.yellow.substituted).toBe(true);
    expect(presentation.root.visible).toBe(true);
    expect(presentation.root.parent).toBe(arena.root);
  });

  it('retired-pending: a late completion attaches nothing and reports no readiness', async () => {
    const { arena, shells, presentation } = stagedArenaWithShells();
    const retire = arena.root.userData.worldStudioRetire as () => void;
    expect(typeof retire).toBe('function');
    retire();
    expect(presentation.status()).toBe('disposed');
    expect(arena.root.userData.worldStudioHouseStatus).toBe('disposed');
    await shells.resolveAll([passingAudit('teal'), passingAudit('yellow')]);
    await presentation.ready;
    expect(presentation.status()).toBe('disposed');
    expect(presentation.outcomes.size).toBe(2);
    for (const outcome of presentation.outcomes.values()) {
      expect(outcome.substituted).toBe(false);
      expect(outcome.reason).toBe('disposed');
    }
    expect(arena.root.userData.worldStudioHouseStatus).toBe('disposed');
    expect(arena.root.userData.worldStudioHouseOutcomes).toBeUndefined();
    expect(presentation.root.visible).toBe(false);
    expect(presentation.root.children).toHaveLength(0);
    // A load that lands after retirement is released, never attached.
    const late = shells.attach('teal', passingAudit('teal'));
    expect(late.parent).toBeNull();
    expect(presentation.root.children).toHaveLength(0);
    // The dead generation hid no procedural art.
    for (const houseId of ['teal-house', 'yellow-house']) {
      const nodes = proceduralHouseNodes(arena, houseId);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) expect(node.visible, node.name).toBe(true);
    }
  });

  it('duplicate retirement is idempotent', () => {
    const { arena, shells, presentation } = stagedArenaWithShells();
    const retire = arena.root.userData.worldStudioRetire as () => void;
    const isRetired = arena.root.userData.worldStudioIsRetired as () => boolean;
    expect(isRetired()).toBe(false);
    retire();
    retire();
    retire();
    expect(isRetired()).toBe(true);
    expect(presentation.status()).toBe('disposed');
    expect(arena.root.userData.worldStudioHouseStatus).toBe('disposed');
    expect(shells.disposeCalls).toBe(1);
  });
});
