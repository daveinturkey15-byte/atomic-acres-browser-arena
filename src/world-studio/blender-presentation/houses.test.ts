import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildWorldStudio } from '../arena';
import { HOUSE_SHELLS, type HouseShellAudit, type HouseVariant, type StudioHouseShells } from '../houses';
import {
  TEAL_HOUSE_SHELL_PATH,
  YELLOW_HOUSE_SHELL_PATH,
  attachHousePresentation,
  isProceduralGlassNode,
  isShellGlassMesh,
  type HousePresentationContext,
} from './houses';

/**
 * CPU contract for the house presentation substitution. No WebGL, no fetch: the loader is
 * replaced by a deterministic stub shaped exactly like `createStudioHouseShells`, while the
 * arena, its architecture, its solids and its dynamic glass registry are the real ones built by
 * `buildWorldStudio`. The GLB pane marker ids are read from the shipped bytes so the binding
 * evidence is about the real assets, not a fixture.
 */

const REPO = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/** GLB pane markers with no arena registration: the garage windows are unglazed apertures in `house.ts:832-838`. */
const GARAGE_UNREGISTERED = (houseId: string): string[] => [
  `world-studio-window:${houseId}-garage-east-garage-east-window-glass`,
  `world-studio-window:${houseId}-garage-west-garage-side-window-glass`,
];

type Gltf = { nodes: { name?: string; extras?: Record<string, unknown> }[]; meshes: { name?: string }[] };
function readGlb(path: string): Gltf {
  const glb = readFileSync(path);
  expect(glb.readUInt32LE(0)).toBe(0x46546c67);
  return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as Gltf;
}
function glbWindowIds(variant: HouseVariant): string[] {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
  return readGlb(REPO(`public/${spec.path}`)).nodes
    .filter((node) => node.extras?.atomic_semantic === 'breakable-window')
    .map((node) => String(node.extras!.atomic_window_id));
}

/** A fake shell scene: one textured opaque mesh and one glass mesh, tagged as the exporter tags them. */
function fakeShellScene(variant: HouseVariant): THREE.Group {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
  const scene = new THREE.Group();
  scene.name = spec.partition;
  const opaque = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  opaque.name = `W3_${variant}-siding`;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 0.01),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.name = `W3_${variant}-glass`;
  glass.userData.atomic_material_slot = 'glass';
  scene.add(opaque, glass);
  return scene;
}

function audit(variant: HouseVariant, passed: boolean, windowIds: readonly string[]): HouseShellAudit {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
  return {
    variant, houseId: spec.houseId, partition: spec.partition, passed,
    failures: passed ? [] : ['3 stair treads, expected 16'],
    windowIds, apertureIds: [], blockedApertureIds: [],
    routeIds: ['interior-stair', 'external-stair', 'garage-roof-door'].map((route) => `${spec.houseId}-${route}`),
    interiorApertureIds: [], blockedInteriorApertureIds: [], partitionIds: [], stairTreadTops: [],
    triangles: 24, drawGroups: 2, localBounds: null,
  };
}

/** Mirrors the real loader's `disposeSubtree` so a double free is observable as a second `dispose` event. */
function releaseResources(scene: THREE.Object3D): void {
  scene.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map?.dispose();
    material.dispose();
    mesh.geometry!.dispose();
  });
}

/** Counts `dispose` events per GPU resource of a scene, keyed `<mesh>.<geometry|material|map>`. */
function watchDisposals(scene: THREE.Object3D, counts = new Map<string, number>()): Map<string, number> {
  const watch = (key: string, resource: { addEventListener(type: 'dispose', listener: () => void): void }) => {
    counts.set(key, 0);
    resource.addEventListener('dispose', () => counts.set(key, counts.get(key)! + 1));
  };
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    watch(`${node.name}.geometry`, mesh.geometry);
    const material = mesh.material as THREE.MeshStandardMaterial;
    watch(`${node.name}.material`, material);
    if (material.map) watch(`${node.name}.map`, material.map);
  });
  return counts;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type FakeShells = StudioHouseShells & {
  audits: Map<HouseVariant, HouseShellAudit>;
  /** One shell's own load resolved: attach and audit it now, as the real loader does before `Promise.all` settles. */
  attach(variant: HouseVariant, result: HouseShellAudit): THREE.Group;
  /** The aggregate `Promise.all` resolved. */
  settle(): Promise<void>;
  /** Attach every result, then settle. */
  resolve(results: Partial<Record<HouseVariant, HouseShellAudit>>): Promise<void>;
  /** The aggregate `Promise.all` rejected on one failed load; other loads may still complete later. */
  reject(error: unknown): Promise<void>;
  disposeCalls: number;
  /** Scenes the loader released, in order: on dispose(), or on arrival after dispose(). */
  disposedScenes: THREE.Object3D[];
  /** Every scene this loader created, released or not. */
  scenes: Map<HouseVariant, THREE.Group>;
};

/** Deterministic stand-in for `createStudioHouseShells`, honouring its lifecycle contract. */
function fakeShells(): FakeShells {
  const root = new THREE.Group();
  const audits = new Map<HouseVariant, HouseShellAudit>();
  const attached: THREE.Object3D[] = [];
  let disposed = false;
  let settle!: { resolve: () => void; reject: (error: unknown) => void };
  const ready = new Promise<void>((resolve, reject) => { settle = { resolve, reject }; });
  const release = (scene: THREE.Object3D) => { releaseResources(scene); shells.disposedScenes.push(scene); };
  const shells: FakeShells = {
    root, ready, audits, disposeCalls: 0, disposedScenes: [], scenes: new Map(),
    dispose() {
      shells.disposeCalls += 1;
      if (disposed) return;
      disposed = true;
      for (const node of attached) { root.remove(node); release(node); }
      attached.length = 0;
      audits.clear();
      root.clear();
    },
    attach(variant, result) {
      const scene = fakeShellScene(variant);
      shells.scenes.set(variant, scene);
      if (disposed) { release(scene); return scene; }
      audits.set(variant, result);
      attached.push(scene);
      root.add(scene);
      return scene;
    },
    async settle() {
      settle.resolve();
      await ready;
      await tick();
    },
    async resolve(results) {
      for (const [variant, result] of Object.entries(results) as [HouseVariant, HouseShellAudit][]) shells.attach(variant, result);
      await shells.settle();
    },
    async reject(error) {
      settle.reject(error);
      await ready.catch(() => undefined);
      await tick();
    },
  };
  return shells;
}

function proceduralNodes(architectureRoot: THREE.Object3D, houseId: string): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [];
  architectureRoot.traverse((node) => { if (node.name.startsWith(`world-studio-${houseId}-`)) nodes.push(node); });
  return nodes;
}

function snapshot(arena: ReturnType<typeof buildWorldStudio>) {
  return {
    solids: arena.shotSurfaces.map((surface) => ({ id: surface.id, bounds: { ...surface.bounds } })),
    colliders: arena.physicsColliders.map((bounds) => ({ ...bounds })),
    windows: arena.breakableWindows.map((pane) => ({ id: pane.id, mesh: pane.mesh, broken: pane.broken })),
    spawns: JSON.stringify(arena.spawns),
    routes: JSON.stringify(arena.root.userData.verticalNavigation),
    raycast: [...arena.raycastMeshes],
  };
}

function harness() {
  const scene = new THREE.Scene();
  const arena = buildWorldStudio(scene);
  const architectureRoot = arena.root.getObjectByName('world-studio-architecture')!;
  const context: HousePresentationContext = { architectureRoot, breakableWindows: arena.breakableWindows, raycastMeshes: arena.raycastMeshes };
  return { scene, arena, architectureRoot, context, before: snapshot(arena) };
}

function assertAuthorityUntouched(arena: ReturnType<typeof buildWorldStudio>, before: ReturnType<typeof snapshot>): void {
  const after = snapshot(arena);
  expect(after.solids).toEqual(before.solids);
  expect(after.colliders).toEqual(before.colliders);
  expect(arena.colliders).toBe(arena.physicsColliders);
  expect(after.windows).toEqual(before.windows);
  expect(after.spawns).toBe(before.spawns);
  expect(after.routes).toBe(before.routes);
  for (const mesh of before.raycast) expect(arena.raycastMeshes).toContain(mesh);
}

describe('world-studio house presentation: assets', () => {
  it('names both final audited GLBs at their contracted placements, and both exist on disk', () => {
    expect(TEAL_HOUSE_SHELL_PATH).toBe('assets/world-studio/blender/houses/house-teal-shell.glb');
    expect(YELLOW_HOUSE_SHELL_PATH).toBe('assets/world-studio/blender/houses/house-yellow-shell.glb');
    expect(HOUSE_SHELLS.map((spec) => [spec.houseId, spec.position])).toEqual([
      ['teal-house', [-20, 0, 0]], ['yellow-house', [20, 0, 0]],
    ]);
    // Revision 5 buries overlapping sheathing; pin the exact exported bytes (visual seams remain open).
    expect(statSync(REPO(`public/${TEAL_HOUSE_SHELL_PATH}`)).size).toBe(5_670_156);
    expect(statSync(REPO(`public/${YELLOW_HOUSE_SHELL_PATH}`)).size).toBe(5_644_860);
    expect(createHash('sha256').update(readFileSync(REPO(`public/${TEAL_HOUSE_SHELL_PATH}`))).digest('hex'))
      .toBe('bc7c4667062a10f6c4878ccea3e99d148dc8296b9c9aa238799802e260f81698');
    expect(createHash('sha256').update(readFileSync(REPO(`public/${YELLOW_HOUSE_SHELL_PATH}`))).digest('hex'))
      .toBe('2fec2939227a60aab7234173ac9eee72a8c0e8f111de024e353e261fab4f1042');
  });

  it('carries 22 pane markers per GLB: 20 name arena breakable windows, 2 name garage apertures the arena never glazes', () => {
    const { arena } = harness();
    const registry = new Set(arena.breakableWindows.map((pane) => pane.id));
    for (const spec of HOUSE_SHELLS) {
      const ids = glbWindowIds(spec.variant);
      expect(ids).toHaveLength(22);
      // Measured divergence, recorded exactly: `house.ts` cuts the garage side/east windows as
      // apertures only (garageWall has no glass part), so these two ids have no registration.
      // A per-pane binding is therefore unprovable and the GLB glass must stay hidden.
      expect(ids.filter((id) => !registry.has(id)).sort()).toEqual(GARAGE_UNREGISTERED(spec.houseId));
      const houseRegistry = [...registry].filter((id) => id.startsWith(`world-studio-window:${spec.houseId}-`));
      expect(houseRegistry).toHaveLength(20);
      expect(houseRegistry.filter((id) => !ids.includes(id))).toEqual([]);
      // ...and exactly one glass mesh carries all of them, which is why they cannot break per pane.
      const glb = readGlb(REPO(`public/${spec.path}`));
      expect(glb.meshes.filter((mesh) => mesh.name?.endsWith('-glass'))).toHaveLength(1);
    }
  });
});

describe('world-studio house presentation: arena wiring', () => {
  it('adds the presentation root immediately, empty, with nothing hidden and status loading', () => {
    const { arena, architectureRoot } = harness();
    const presentation = arena.root.getObjectByName('world-studio-house-presentation');
    expect(presentation).toBeDefined();
    expect(presentation!.children).toHaveLength(0);
    expect(presentation!.visible).toBe(false);
    expect(presentation!.userData.presentationOnly).toBe(true);
    expect(arena.root.userData.worldStudioHouseStatus).toBe('loading');
    for (const houseId of ['teal-house', 'yellow-house']) {
      const nodes = proceduralNodes(architectureRoot, houseId);
      expect(nodes.length).toBeGreaterThan(2);
      for (const node of nodes) expect(node.visible, node.name).toBe(true);
    }
  });

  it('survives ordinary reparenting; only explicit dispose retires the generation', () => {
    const { scene, arena } = harness();
    const presentation = arena.root.userData.worldStudioHousePresentation;
    // Wave 3: the staging detach in legacy-main constructArena (and cache moves, live adoption)
    // must never dispose the loaders. Terminal retirement is explicit (worldStudioRetire).
    scene.remove(arena.root);
    expect(arena.root.parent).toBeNull();
    expect(presentation.status()).toBe('loading');
    expect(arena.root.userData.worldStudioHouseStatus).toBe('loading');
    expect(arena.root.getObjectByName('world-studio-house-presentation')).toBe(presentation.root);
    const live = new THREE.Scene();
    live.add(arena.root);
    expect(presentation.status()).toBe('loading');
    expect(arena.root.getObjectByName('world-studio-house-presentation')).toBe(presentation.root);
    presentation.dispose();
    expect(presentation.status()).toBe('disposed');
    presentation.dispose();
    expect(presentation.status()).toBe('disposed');
  });
});

describe('world-studio house presentation: substitution', () => {
  it('hides only the passing house, keeps its dynamic panes and all authority intact', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    arena.root.add(presentation.root);
    expect(presentation.status()).toBe('loading');

    await shells.resolve({
      teal: audit('teal', true, glbWindowIds('teal')),
      yellow: audit('yellow', false, glbWindowIds('yellow')),
    });
    const outcomes = await presentation.ready;
    expect(presentation.status()).toBe('ready');

    const teal = outcomes.get('teal')!;
    expect(teal.substituted).toBe(true);
    expect(teal.hiddenNodes.length).toBeGreaterThan(0);
    for (const node of proceduralNodes(architectureRoot, 'teal-house')) {
      if (isProceduralGlassNode(node, 'teal-house')) {
        expect(node.visible, `dynamic pane ${node.name} stays visible`).toBe(true);
        expect(teal.retainedNodes).toContain(node.name);
      } else {
        expect(node.visible, `${node.name} hidden`).toBe(false);
        expect(teal.hiddenNodes).toContain(node.name);
      }
    }
    for (const pane of arena.breakableWindows) expect(pane.mesh.visible, pane.id).toBe(true);
    expect(teal.retainedNodes.length).toBe(arena.breakableWindows.filter((pane) => pane.id.startsWith('world-studio-window:teal-house-')).length);

    const yellow = outcomes.get('yellow')!;
    expect(yellow.substituted).toBe(false);
    expect(yellow.reason).toMatch(/^audit failed: 3 stair treads/);
    for (const node of proceduralNodes(architectureRoot, 'yellow-house')) expect(node.visible, node.name).toBe(true);
    // The failed shell is released, the passing one is attached.
    expect(presentation.root.children.map((child) => child.name)).toEqual(['world-studio.house.teal.shell']);
    expect(shells.disposedScenes.map((scene) => scene.name)).toEqual([]);

    // Furniture is a different partition and is never in scope.
    arena.root.getObjectByName('world-studio-interiors')!.traverse((node) => expect(node.visible, node.name).toBe(true));
    assertAuthorityUntouched(arena, before);
    presentation.dispose();
  });

  it('applies the glazing decision explicitly: GLB glass hidden, procedural dynamic glass authoritative', async () => {
    const { arena, context } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    await shells.resolve({ teal: audit('teal', true, glbWindowIds('teal')), yellow: audit('yellow', true, glbWindowIds('yellow')) });
    const outcomes = await presentation.ready;
    for (const variant of ['teal', 'yellow'] as const) {
      const outcome = outcomes.get(variant)!;
      expect(outcome.substituted).toBe(true);
      expect(outcome.glass).toMatchObject({
        authority: 'procedural-dynamic-glass', glassMeshes: 1, unmarked: [], unregistered: GARAGE_UNREGISTERED(outcome.houseId),
      });
      expect(outcome.glass!.matched).toHaveLength(20);
      expect(outcome.reason).toContain('2 unregistered pane marker(s)');
      const scene = presentation.root.getObjectByName(`world-studio.house.${variant}.shell`)!;
      const glass = scene.getObjectByName(`W3_${variant}-glass`) as THREE.Mesh;
      expect(isShellGlassMesh(glass)).toBe(true);
      expect(glass.visible).toBe(false);
      const material = glass.material as THREE.Material;
      expect([material.transparent, material.depthWrite, material.side]).toEqual([true, false, THREE.DoubleSide]);
      // The hidden GLB glass never joins the raycast list; the visible opaque art does.
      expect(arena.raycastMeshes).not.toContain(glass);
      expect(arena.raycastMeshes).toContain(scene.getObjectByName(`W3_${variant}-siding`));
    }
    // A hidden procedural mesh is still traceable by three, so shot authority meshes are unaffected.
    const hiddenMesh = context.architectureRoot.getObjectByName(outcomes.get('teal')!.hiddenNodes[0]) as THREE.Mesh;
    expect(hiddenMesh.visible).toBe(false);
    expect(arena.breakableWindows.length).toBeGreaterThan(8);
    presentation.dispose();
  });

  it('leaves both procedural houses visible when the load rejects', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    await shells.reject(new Error('404'));
    const outcomes = await presentation.ready;
    expect(presentation.status()).toBe('failed: Error: 404');
    for (const variant of ['teal', 'yellow'] as const) {
      expect(outcomes.get(variant)!.substituted).toBe(false);
      expect(outcomes.get(variant)!.reason).toBe('load failed: Error: 404');
    }
    for (const houseId of ['teal-house', 'yellow-house']) {
      for (const node of proceduralNodes(architectureRoot, houseId)) expect(node.visible, node.name).toBe(true);
    }
    expect(presentation.root.children).toHaveLength(0);
    expect(presentation.root.visible).toBe(false);
    // The rejection released the loader once; disposing the handle afterwards does not ask again.
    expect(shells.disposeCalls).toBe(1);
    assertAuthorityUntouched(arena, before);
    presentation.dispose();
    expect(shells.disposeCalls).toBe(1);
  });

  it('never hides on a load that resolves without an audit', async () => {
    const { architectureRoot, context } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    await shells.resolve({});
    const outcomes = await presentation.ready;
    expect([...outcomes.values()].map((outcome) => outcome.reason)).toEqual(['load resolved without an audit', 'load resolved without an audit']);
    for (const node of proceduralNodes(architectureRoot, 'teal-house')) expect(node.visible).toBe(true);
    presentation.dispose();
  });

  it('detaches an attached shell with a missing audit before revealing a passing sibling', async () => {
    const { architectureRoot, context } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    const teal = shells.attach('teal', audit('teal', true, glbWindowIds('teal')));
    const yellow = shells.attach('yellow', audit('yellow', true, glbWindowIds('yellow')));
    const yellowDisposals = watchDisposals(yellow);
    shells.audits.delete('yellow');

    await shells.settle();
    const outcomes = await presentation.ready;
    expect(outcomes.get('yellow')!.reason).toBe('load resolved without an audit');
    expect(presentation.root.visible).toBe(true);
    expect(presentation.root.getObjectByName('world-studio.house.teal.shell')).toBe(teal);
    expect(presentation.root.getObjectByName('world-studio.house.yellow.shell')).toBeUndefined();
    for (const node of proceduralNodes(architectureRoot, 'yellow-house')) expect(node.visible).toBe(true);

    presentation.dispose();
    expect(yellowDisposals.size).toBeGreaterThan(0);
    for (const count of yellowDisposals.values()) expect(count).toBe(1);
  });
});

describe('world-studio house presentation: pending root and loader ownership', () => {
  it('keeps the root invisible and hides nothing while one shell is attached and the other is pending', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    arena.root.add(presentation.root);
    expect(presentation.root.visible).toBe(false);

    // Teal's own load lands first: the loader attaches it under the root before Promise.all settles.
    const teal = shells.attach('teal', audit('teal', true, glbWindowIds('teal')));
    await tick();
    expect(presentation.root.children).toEqual([teal]);
    expect(presentation.root.visible, 'partially loaded root must not overlap the procedural houses').toBe(false);
    expect(presentation.status()).toBe('loading');
    expect(presentation.outcomes.size).toBe(0);
    for (const houseId of ['teal-house', 'yellow-house']) {
      for (const node of proceduralNodes(architectureRoot, houseId)) expect(node.visible, node.name).toBe(true);
    }
    expect(arena.raycastMeshes).toEqual(before.raycast);

    // Yellow lands and the aggregate settles: only now is anything revealed or hidden.
    shells.attach('yellow', audit('yellow', true, glbWindowIds('yellow')));
    await shells.settle();
    await presentation.ready;
    expect(presentation.status()).toBe('ready');
    expect(presentation.root.visible).toBe(true);
    expect(presentation.root.children.map((child) => child.name)).toEqual(['world-studio.house.teal.shell', 'world-studio.house.yellow.shell']);
    for (const houseId of ['teal-house', 'yellow-house']) {
      const hidden = proceduralNodes(architectureRoot, houseId).filter((node) => !node.visible);
      expect(hidden.length, houseId).toBeGreaterThan(0);
      for (const node of hidden) expect(isProceduralGlassNode(node, houseId), node.name).toBe(false);
    }
    assertAuthorityUntouched(arena, before);
    presentation.dispose();
  });

  it('releases the loader once when one shell rejects, and a late completion can neither attach nor show', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    arena.root.add(presentation.root);
    const teal = shells.attach('teal', audit('teal', true, glbWindowIds('teal')));
    const tealDisposals = watchDisposals(teal);
    await tick();
    expect(presentation.root.children).toEqual([teal]);

    // Yellow's load fails: Promise.all rejects while teal is already attached and yellow may still complete.
    await shells.reject(new Error('yellow 404'));
    const outcomes = await presentation.ready;
    expect(presentation.status()).toBe('failed: Error: yellow 404');
    expect(shells.disposeCalls, 'the loader owner is disposed exactly once on aggregate rejection').toBe(1);
    expect(shells.disposedScenes).toEqual([teal]);
    expect([...tealDisposals.values()]).toEqual([1, 1, 1, 1, 1]);
    expect(presentation.root.children).toHaveLength(0);
    expect(presentation.root.visible).toBe(false);
    for (const variant of ['teal', 'yellow'] as const) expect(outcomes.get(variant)!.reason).toBe('load failed: Error: yellow 404');
    for (const houseId of ['teal-house', 'yellow-house']) {
      for (const node of proceduralNodes(architectureRoot, houseId)) expect(node.visible, node.name).toBe(true);
    }

    // Yellow's load completes late: the loader releases it instead of attaching it.
    const yellow = shells.attach('yellow', audit('yellow', true, glbWindowIds('yellow')));
    await tick();
    expect(yellow.parent).toBeNull();
    expect(shells.disposedScenes).toEqual([teal, yellow]);
    expect(presentation.root.children).toHaveLength(0);
    expect(presentation.root.visible).toBe(false);
    expect(presentation.status()).toBe('failed: Error: yellow 404');
    for (const houseId of ['teal-house', 'yellow-house']) {
      for (const node of proceduralNodes(architectureRoot, houseId)) expect(node.visible, node.name).toBe(true);
    }
    assertAuthorityUntouched(arena, before);
    presentation.dispose();
    presentation.dispose();
    expect(shells.disposeCalls, 'handle disposal after rejection must not ask the loader again').toBe(1);
    expect([...tealDisposals.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it('detaches a shell that fails its audit without releasing it; the loader releases every resource exactly once', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    arena.root.add(presentation.root);
    const teal = shells.attach('teal', audit('teal', true, glbWindowIds('teal')));
    const yellow = shells.attach('yellow', audit('yellow', false, glbWindowIds('yellow')));
    const disposals = watchDisposals(yellow, watchDisposals(teal));
    expect(disposals.size).toBe(10);
    await shells.settle();
    const outcomes = await presentation.ready;

    expect(outcomes.get('yellow')!.substituted).toBe(false);
    expect(outcomes.get('yellow')!.reason).toMatch(/^audit failed/);
    // Detached and hidden by the integration layer, released by nobody yet.
    expect(yellow.parent).toBeNull();
    expect(yellow.visible).toBe(false);
    expect(presentation.root.children).toEqual([teal]);
    expect(presentation.root.visible).toBe(true);
    expect(shells.disposedScenes).toEqual([]);
    expect([...disposals.values()]).toEqual(Array(10).fill(0));
    for (const node of proceduralNodes(architectureRoot, 'yellow-house')) expect(node.visible, node.name).toBe(true);

    // Disposal is the loader's, happens once, and no resource sees a second dispose event.
    presentation.dispose();
    expect(shells.disposeCalls).toBe(1);
    expect(shells.disposedScenes).toEqual([teal, yellow]);
    expect([...disposals.values()]).toEqual(Array(10).fill(1));
    presentation.dispose();
    expect(shells.disposeCalls).toBe(1);
    expect([...disposals.values()]).toEqual(Array(10).fill(1));
    assertAuthorityUntouched(arena, before);
  });

  it('reveals only passed GLB art on aggregate success, keeps the dynamic panes, and repeated disposal is a no-op', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    arena.root.add(presentation.root);
    const teal = shells.attach('teal', audit('teal', true, glbWindowIds('teal')));
    const yellow = shells.attach('yellow', audit('yellow', false, glbWindowIds('yellow')));
    await tick();
    expect(presentation.root.visible).toBe(false);
    await shells.settle();
    await presentation.ready;

    expect(presentation.root.visible).toBe(true);
    expect(presentation.root.children).toEqual([teal]);
    expect(yellow.parent).toBeNull();
    const siding = teal.getObjectByName('W3_teal-siding')!;
    const glass = teal.getObjectByName('W3_teal-glass')!;
    expect(siding.visible).toBe(true);
    expect(glass.visible).toBe(false);
    expect(arena.raycastMeshes).toEqual([...before.raycast, siding]);
    // Every dynamic pane mesh, both houses, is still the registry's mesh and still visible.
    for (const pane of arena.breakableWindows) {
      expect(pane.mesh.visible, pane.id).toBe(true);
      expect(pane.mesh.parent, pane.id).not.toBeNull();
    }
    const tealPanes = proceduralNodes(architectureRoot, 'teal-house').filter((node) => isProceduralGlassNode(node, 'teal-house'));
    expect(tealPanes.length).toBe(20);
    for (const node of tealPanes) expect(node.visible, node.name).toBe(true);
    for (const node of proceduralNodes(architectureRoot, 'yellow-house')) expect(node.visible, node.name).toBe(true);

    presentation.dispose();
    presentation.dispose();
    expect(presentation.status()).toBe('disposed');
    expect(shells.disposeCalls).toBe(1);
    expect(shells.disposedScenes).toEqual([teal, yellow]);
    expect(presentation.root.children).toHaveLength(0);
    expect(presentation.root.visible).toBe(false);
    expect(arena.raycastMeshes).toEqual(before.raycast);
    for (const node of proceduralNodes(architectureRoot, 'teal-house')) expect(node.visible, node.name).toBe(true);
    assertAuthorityUntouched(arena, before);
  });
});

describe('world-studio house presentation: lifecycle', () => {
  it('releases a load that arrives after dispose, and repeated dispose is a no-op', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    presentation.dispose();
    presentation.dispose();
    expect(presentation.status()).toBe('disposed');
    await shells.resolve({ teal: audit('teal', true, glbWindowIds('teal')), yellow: audit('yellow', true, glbWindowIds('yellow')) });
    const outcomes = await presentation.ready;
    expect([...outcomes.values()].every((outcome) => !outcome.substituted && outcome.reason === 'disposed')).toBe(true);
    for (const houseId of ['teal-house', 'yellow-house']) {
      for (const node of proceduralNodes(architectureRoot, houseId)) expect(node.visible, node.name).toBe(true);
    }
    expect(presentation.root.children).toHaveLength(0);
    expect(shells.disposedScenes).toHaveLength(2);
    // The stub's own dispose is idempotent too: every call after the first is a no-op.
    expect(shells.disposeCalls).toBeGreaterThanOrEqual(1);
    presentation.dispose();
    expect(shells.root.children).toHaveLength(0);
    assertAuthorityUntouched(arena, before);
  });

  it('restores hidden art and removes its raycast meshes on dispose after a substitution', async () => {
    const { arena, architectureRoot, context, before } = harness();
    const shells = fakeShells();
    const presentation = attachHousePresentation(context, { createShells: () => shells });
    await shells.resolve({ teal: audit('teal', true, glbWindowIds('teal')) });
    await presentation.ready;
    const hidden = proceduralNodes(architectureRoot, 'teal-house').filter((node) => !node.visible);
    expect(hidden.length).toBeGreaterThan(0);
    expect(arena.raycastMeshes.length).toBe(before.raycast.length + 1);
    presentation.dispose();
    for (const node of hidden) expect(node.visible, node.name).toBe(true);
    expect(arena.raycastMeshes).toEqual(before.raycast);
    expect(shells.disposedScenes.map((scene) => scene.name)).toEqual(['world-studio.house.teal.shell']);
    assertAuthorityUntouched(arena, before);
  });

  it('a retired generation can never hide a house that a live generation owns', async () => {
    const { architectureRoot, context } = harness();
    const stale = fakeShells();
    const first = attachHousePresentation(context, { createShells: () => stale });
    first.dispose();
    const live = fakeShells();
    const second = attachHousePresentation(context, { createShells: () => live });
    await live.resolve({ teal: audit('teal', true, glbWindowIds('teal')) });
    await second.ready;
    const hiddenByLive = proceduralNodes(architectureRoot, 'teal-house').filter((node) => !node.visible);
    expect(hiddenByLive.length).toBeGreaterThan(0);
    // The stale load now resolves: it must neither hide nor un-hide anything.
    await stale.resolve({ teal: audit('teal', true, glbWindowIds('teal')), yellow: audit('yellow', true, glbWindowIds('yellow')) });
    await first.ready;
    expect(proceduralNodes(architectureRoot, 'teal-house').filter((node) => !node.visible)).toEqual(hiddenByLive);
    for (const node of proceduralNodes(architectureRoot, 'yellow-house')) expect(node.visible, node.name).toBe(true);
    expect(first.root.children).toHaveLength(0);
    second.dispose();
    for (const node of hiddenByLive) expect(node.visible).toBe(true);
  });

  it('exposes no collider, spawn or navigation authority and derives nothing from meshes', () => {
    const code = readFileSync(REPO('src/world-studio/blender-presentation/houses.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // No gameplay authority is created or derived, and procedural nodes are only ever toggled.
    expect(code).not.toMatch(/addCollider|physicsColliders|shotSurfaces|spawns|verticalNavigation|createBallisticSurface|breakableWindows\.(push|splice)|architectureRoot\.(remove|clear|add)\(/);
    expect(code).toMatch(/node\.visible = false/);
    const { context } = harness();
    const presentation = attachHousePresentation(context, { createShells: () => fakeShells() });
    expect(Object.keys(presentation).sort()).toEqual(['dispose', 'outcomes', 'ready', 'root', 'status']);
    presentation.dispose();
  });
});
