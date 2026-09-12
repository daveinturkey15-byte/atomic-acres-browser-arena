import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DeathDropPresentationPool } from './death-drop-presentation';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { optimizeAttachedWeapon } from './art-kit';
import {
  createPass65WeaponModel,
  disposePass65WeaponModel,
  loadPass65WeaponPresentation,
} from './weapon-model';

// The authored drop path only runs in a browser, so these mocks stand in for
// the real clone/merge pipeline (SkeletonUtils clone -> per-mesh
// material.clone -> cloneMeshGeometriesForOwner -> AnimationMixer ->
// optimizeAttachedWeapon's merge). Every arrow body runs at CALL time, so the
// hoisted factory never touches an uninitialised import.
vi.mock('./art-kit', () => ({
  optimizeAttachedWeapon: vi.fn(() => ({ meshes: 1, geometries: 1 })),
}));
vi.mock('./weapon-model', () => ({
  createPass65WeaponModel: vi.fn((id: string) => {
    const model = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x123456 }),
    );
    mesh.name = `authored-${id}-mesh`;
    model.add(mesh);
    return model;
  }),
  createPass65CrossbowModel: vi.fn(() => new THREE.Group()),
  disposePass65WeaponModel: vi.fn(),
  releasePass65WeaponModel: vi.fn(),
  loadPass65WeaponPresentation: vi.fn(() => Promise.resolve()),
}));

/**
 * The deferred build hops off the calling frame through a macrotask, then
 * finishes in the microtask its timer schedules. Three turns clear both.
 */
async function flushDeferredBuilds(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 0); });
}

function withBrowserDocument(): void {
  (globalThis as { document?: unknown }).document = {};
}

function authoredModelsOf(root: THREE.Object3D): THREE.Object3D[] {
  return root.getObjectByName('death-drop-weapon')!.children;
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  vi.clearAllMocks();
});

describe('DeathDropPresentationPool', () => {
  it('allocates a fixed unlit pool and reuses released slots', () => {
    const scene = new THREE.Scene();
    const pool = new DeathDropPresentationPool(scene, 2);
    expect(pool.telemetry()).toEqual({
      capacity: 2, active: 0, prewarmed: false, dynamicLights: 0, authoredBuilt: 0, authoredIdle: 0,
    });
    expect(scene.getObjectsByProperty('isLight', true)).toHaveLength(0);

    const first = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(1, 2, 3));
    const second = pool.acquire('drop-b', 0x33ccff, new THREE.Vector3(-1, 0, 4));
    expect(pool.telemetry().active).toBe(2);
    expect(() => pool.acquire('drop-c', 0xffffff, new THREE.Vector3())).toThrow('pool exhausted');

    pool.release(first);
    const reused = pool.acquire('drop-c', 0xffffff, new THREE.Vector3(9, 1, -2));
    expect(reused).toBe(first);
    expect(reused.position.toArray()).toEqual([9, 1, -2]);
    expect(second.visible).toBe(true);
  });

  // Owner 2026-08-30 "just killed a bot and froze for 0.5 seconds": the drop
  // presentation was constructed from scratch, shown once and destroyed, so
  // every kill paid the full clone/merge cost — twice per kill frame. These
  // pin the two halves of the fix: nothing is constructed on the frame that
  // asks, and a repeat drop of the same weapon constructs nothing at all.
  it('never constructs an authored drop on the frame that acquires it', async () => {
    withBrowserDocument();
    const pool = new DeathDropPresentationPool(new THREE.Scene(), 2);
    const drop = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'carbine');
    expect(authoredModelsOf(drop)).toHaveLength(0);
    expect(createPass65WeaponModel).not.toHaveBeenCalled();
    expect(optimizeAttachedWeapon).not.toHaveBeenCalled();
    expect(pool.telemetry().authoredBuilt).toBe(0);
    expect(loadPass65WeaponPresentation).toHaveBeenCalledWith('carbine', 'drop');

    // A drop released before the deferred build lands abandons it, so a
    // short-lived drop cannot leave construction work running behind it.
    pool.release(drop);
    await flushDeferredBuilds();
    expect(createPass65WeaponModel).not.toHaveBeenCalled();
    expect(pool.telemetry()).toMatchObject({ authoredBuilt: 0, authoredIdle: 0 });
  });

  it('re-shows a parked drop model instead of rebuilding geometry and materials', async () => {
    withBrowserDocument();
    const pool = new DeathDropPresentationPool(new THREE.Scene(), 2);

    const first = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'carbine');
    await flushDeferredBuilds();
    expect(pool.telemetry().authoredBuilt).toBe(1);
    const model = authoredModelsOf(first)[0];
    expect(model).toBeDefined();

    pool.release(first);
    expect(authoredModelsOf(first)).toHaveLength(0);
    expect(pool.telemetry()).toMatchObject({ authoredBuilt: 1, authoredIdle: 1 });
    // The model is parked, not destroyed: no dispose, no retire.
    expect(disposePass65WeaponModel).not.toHaveBeenCalled();

    const second = pool.acquire('drop-b', 0x33ccff, new THREE.Vector3(4, 0, 4), 'carbine');
    // Synchronous on the kill frame — the same object, re-shown.
    expect(authoredModelsOf(second)[0]).toBe(model);
    expect(pool.telemetry()).toMatchObject({ authoredBuilt: 1, authoredIdle: 0 });
    expect(createPass65WeaponModel).toHaveBeenCalledTimes(1);
    expect(optimizeAttachedWeapon).toHaveBeenCalledTimes(1);
    await flushDeferredBuilds();
    expect(pool.telemetry().authoredBuilt).toBe(1);
  });

  it('builds one model per weapon and parks each under its own id', async () => {
    withBrowserDocument();
    const pool = new DeathDropPresentationPool(new THREE.Scene(), 2);

    const carbine = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'carbine');
    const smg = pool.acquire('drop-b', 0x33ccff, new THREE.Vector3(2, 0, 0), 'smg');
    await flushDeferredBuilds();
    expect(pool.telemetry().authoredBuilt).toBe(2);
    const carbineModel = authoredModelsOf(carbine)[0];
    const smgModel = authoredModelsOf(smg)[0];

    pool.release(carbine);
    pool.release(smg);
    expect(pool.telemetry().authoredIdle).toBe(2);

    // A drop of the OTHER weapon must not consume the carbine's model.
    const nextSmg = pool.acquire('drop-c', 0xffffff, new THREE.Vector3(6, 0, 0), 'smg');
    expect(authoredModelsOf(nextSmg)[0]).toBe(smgModel);
    const nextCarbine = pool.acquire('drop-d', 0xffffff, new THREE.Vector3(8, 0, 0), 'carbine');
    expect(authoredModelsOf(nextCarbine)[0]).toBe(carbineModel);
    expect(createPass65WeaponModel).toHaveBeenCalledTimes(2);
  });

  it('swaps a live drop to a parked model without rebuilding it', async () => {
    withBrowserDocument();
    const pool = new DeathDropPresentationPool(new THREE.Scene(), 2);

    const staging = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'smg');
    await flushDeferredBuilds();
    const smgModel = authoredModelsOf(staging)[0];
    pool.release(staging);

    const drop = pool.acquire('drop-b', 0xff5533, new THREE.Vector3(), 'carbine');
    await flushDeferredBuilds();
    expect(pool.telemetry().authoredBuilt).toBe(2);

    // Picking the carbine up puts the player's smg in the drop: the swap is a
    // re-show of the parked smg, not a rebuild.
    pool.setWeapon(drop, 'smg', 0x33ccff);
    expect(authoredModelsOf(drop)[0]).toBe(smgModel);
    expect(pool.telemetry().authoredBuilt).toBe(2);
  });

  it('tints the pooled markers without repainting authored weapon materials', async () => {
    withBrowserDocument();
    const pool = new DeathDropPresentationPool(new THREE.Scene(), 2);
    const drop = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'carbine');
    await flushDeferredBuilds();

    const ring = drop.getObjectByName('death-drop-ring') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(ring.material.color.getHex()).toBe(0xff5533);
    const authored = drop.getObjectByName('authored-carbine-mesh') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(authored.material.color.getHex()).toBe(0x123456);

    pool.release(drop);
    const reused = pool.acquire('drop-b', 0x33ccff, new THREE.Vector3(), 'carbine');
    const reusedRing = reused.getObjectByName('death-drop-ring') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(reusedRing.material.color.getHex()).toBe(0x33ccff);
    // A re-used model must not accumulate the drop colours it has served.
    expect(authored.material.color.getHex()).toBe(0x123456);
  });

  it('prewarms the whole primary drop corpus so the first kill of any weapon reuses', async () => {
    withBrowserDocument();
    const scene = new THREE.Scene();
    const pool = new DeathDropPresentationPool(scene, 12);
    const camera = new THREE.PerspectiveCamera();
    const compiled: THREE.Object3D[] = [];
    const runtime: PresentationPrewarmRuntime = {
      compileAndRender: async (root) => { compiled.push(root); },
    };
    await pool.prewarm(runtime, camera, 'carbine');

    expect(compiled).toEqual([pool.root]);
    // 12 primaries, each built once, all parked and none left attached.
    expect(pool.telemetry()).toMatchObject({ prewarmed: true, authoredBuilt: 12, authoredIdle: 12 });
    expect(createPass65WeaponModel).toHaveBeenCalledTimes(12);

    const drop = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(), 'sniper');
    expect(authoredModelsOf(drop)).toHaveLength(1);
    expect(pool.telemetry().authoredBuilt).toBe(12);
  });
});
