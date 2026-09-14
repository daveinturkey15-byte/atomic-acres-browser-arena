import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

/**
 * Loader-contract tests for `createStudioInteriorAssets`.
 *
 * The GLTFLoader is replaced by a stub that hands back the pending promise instead of resolving
 * it, so the load/dispose race is driven explicitly rather than hoped for. A test that awaits a
 * real fetch can only observe the order the machine happened to produce; this one chooses the
 * order, including the one that matters — payload arrives *after* teardown.
 *
 * No renderer, no canvas, no network, no GLB is read here. Bytes-on-disk claims live in
 * `catalog.test.ts`.
 */

interface PendingLoad {
  url: string;
  resolve: (gltf: { scene: THREE.Object3D }) => void;
  reject: (error: unknown) => void;
}

// `vi.hoisted` runs before the mock factory, which runs before this module's body: a plain
// top-level const would still be in its temporal dead zone when the stub is constructed.
const stub = vi.hoisted(() => ({ pending: [] as PendingLoad[] }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string): Promise<{ scene: THREE.Object3D }> {
      return new Promise((resolve, reject) => {
        stub.pending.push({ url, resolve, reject });
      });
    }
  },
}));

// A static import is safe here: `vi.mock` is hoisted above it, so `./index` picks up the stub.
import {
  GROUND_FLOOR_Y,
  INTERIOR_HERO_ASSET_PATH,
  INTERIOR_HERO_ID,
  createStudioInteriorAssets,
} from './index';

interface Payload {
  scene: THREE.Group;
  geometry: THREE.BufferGeometry;
  opaque: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  texture: THREE.Texture;
  disposals: () => { geometry: number; opaque: number; glass: number; texture: number };
}

/**
 * A payload shaped like the real export: one opaque mesh carrying a textured material and one
 * transparent mesh standing in for the television glass, both double-sided the way the glTF
 * exporter leaves them.
 */
function makePayload(): Payload {
  const scene = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const texture = new THREE.Texture();
  const opaque = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geometry, opaque));
  scene.add(new THREE.Mesh(geometry, glass));
  const spies = {
    geometry: vi.spyOn(geometry, 'dispose'),
    opaque: vi.spyOn(opaque, 'dispose'),
    glass: vi.spyOn(glass, 'dispose'),
    texture: vi.spyOn(texture, 'dispose'),
  };
  return {
    scene,
    geometry,
    opaque,
    glass,
    texture,
    disposals: () => ({
      geometry: spies.geometry.mock.calls.length,
      opaque: spies.opaque.mock.calls.length,
      glass: spies.glass.mock.calls.length,
      texture: spies.texture.mock.calls.length,
    }),
  };
}

beforeEach(() => {
  stub.pending.length = 0;
});

describe('interior loader lifecycle', () => {
  it('returns a usable, parentable root before anything has loaded', () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    expect(assets.root).toBeInstanceOf(THREE.Group);
    expect(assets.root.name).toBe('world-studio-interior-assets');
    expect(assets.root.userData.presentationOnly).toBe(true);
    expect(assets.root.children).toHaveLength(0);
    // Exhaustive on purpose: the surface is the contract root integrates against. `repairs` was
    // added in wave 5 and is empty until a payload lands - see `fit.test.ts`.
    expect(Object.keys(assets).sort()).toEqual(['dispose', 'ready', 'repairs', 'root']);
    expect(assets.repairs).toEqual([]);
    // The request went out immediately, against the base it was given.
    expect(stub.pending.map((load) => load.url)).toEqual([`/${INTERIOR_HERO_ASSET_PATH}`]);
    assets.dispose();
  });

  it('attaches the payload and stamps presentation ownership on every node', async () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    const payload = makePayload();
    stub.pending[0].resolve({ scene: payload.scene });
    await expect(assets.ready).resolves.toBeUndefined();

    expect(assets.root.children).toEqual([payload.scene]);
    expect(payload.scene.name).toBe(`world-studio-${INTERIOR_HERO_ID}`);
    payload.scene.traverse((node) => {
      expect(node.userData.worldStudioInteriorAsset).toBe(true);
      expect(node.userData.presentationOnly).toBe(true);
    });
    // The closed-volume contract: opaque surfaces go single-sided, glass keeps both faces but
    // stops writing depth.
    expect(payload.opaque.side).toBe(THREE.FrontSide);
    expect(payload.glass.side).toBe(THREE.DoubleSide);
    expect(payload.glass.depthWrite).toBe(false);
    expect(payload.disposals()).toEqual({ geometry: 0, opaque: 0, glass: 0, texture: 0 });
    assets.dispose();
  });

  it('releases a payload that arrives after dispose instead of attaching it', async () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    const payload = makePayload();

    assets.dispose();
    // The fetch was already in flight and completes anyway. This is the case a real teardown
    // hits and the one that leaks GPU memory if it is handled by hoping it cannot happen.
    stub.pending[0].resolve({ scene: payload.scene });
    await expect(assets.ready).resolves.toBeUndefined();

    expect(assets.root.children).toHaveLength(0);
    expect(payload.scene.parent).toBeNull();
    expect(payload.disposals()).toEqual({ geometry: 1, opaque: 1, glass: 1, texture: 1 });
  });

  it('disposes geometry, materials and textures of a payload that did land', async () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    const payload = makePayload();
    stub.pending[0].resolve({ scene: payload.scene });
    await assets.ready;

    assets.dispose();
    expect(assets.root.children).toHaveLength(0);
    expect(payload.disposals()).toEqual({ geometry: 1, opaque: 1, glass: 1, texture: 1 });
  });

  it('is idempotent: repeated dispose neither throws nor double-frees', async () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    const payload = makePayload();
    stub.pending[0].resolve({ scene: payload.scene });
    await assets.ready;

    assets.dispose();
    assets.dispose();
    assets.dispose();
    expect(payload.disposals()).toEqual({ geometry: 1, opaque: 1, glass: 1, texture: 1 });
    expect(assets.root.children).toHaveLength(0);
  });

  it('rejects visibly on a failed load rather than resolving empty', async () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    stub.pending[0].reject(new Error('404 interior'));
    await expect(assets.ready).rejects.toThrow('404 interior');
    expect(assets.root.children).toHaveLength(0);
    assets.dispose();
  });

  it('still owns the sibling that succeeded when one asset of several fails', async () => {
    const assets = createStudioInteriorAssets({
      baseUrl: '/',
      assetIds: ['interior-prop-sofa', 'interior-prop-area-rug'],
    });
    expect(stub.pending).toHaveLength(2);
    const arrived = makePayload();
    stub.pending[0].resolve({ scene: arrived.scene });
    stub.pending[1].reject(new Error('rug missing'));
    await expect(assets.ready).rejects.toThrow('rug missing');

    // Promise.all rejected, but the sofa did attach and is this module's to free.
    expect(assets.root.children).toEqual([arrived.scene]);
    assets.dispose();
    expect(assets.root.children).toHaveLength(0);
    expect(arrived.disposals()).toEqual({ geometry: 1, opaque: 1, glass: 1, texture: 1 });
  });

  it('clears children a caller parked inside root, without disposing them', async () => {
    // Documented ownership edge: `dispose()` ends with `root.clear()`. A caller's own child is
    // detached but not freed, because this module never owned it. Park siblings next to `root`.
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    const foreign = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const foreignDispose = vi.spyOn(foreign.geometry, 'dispose');
    assets.root.add(foreign);

    stub.pending[0].resolve({ scene: makePayload().scene });
    await assets.ready;
    assets.dispose();

    expect(assets.root.children).toHaveLength(0);
    expect(foreign.parent).toBeNull();
    expect(foreignDispose).not.toHaveBeenCalled();
    // And `root` itself is left attached to whatever the caller parented it to.
    const scene = new THREE.Scene();
    scene.add(assets.root);
    assets.dispose();
    expect(assets.root.parent).toBe(scene);
  });
});

describe('interior loader selection and placement', () => {
  it('loads catalog ids through the checked route', () => {
    const assets = createStudioInteriorAssets({
      baseUrl: '/atomic-acres/',
      assetIds: ['interior-prop-area-rug', 'interior-prop-sofa'],
    });
    // Requested in catalog order, not argument order.
    expect(stub.pending.map((load) => load.url)).toEqual([
      '/atomic-acres/assets/world-studio/blender/interiors/interior-prop-sofa.glb',
      '/atomic-acres/assets/world-studio/blender/interiors/interior-prop-area-rug.glb',
    ]);
    assets.ready.catch(() => undefined);
    assets.dispose();
  });

  it('refuses a hero/prop mix at the call site, before any request goes out', () => {
    expect(() =>
      createStudioInteriorAssets({ baseUrl: '/', assetIds: [INTERIOR_HERO_ID, 'interior-prop-sofa'] }),
    ).toThrow(/would draw that furniture twice/);
    expect(() =>
      createStudioInteriorAssets({ baseUrl: '/', assetIds: [INTERIOR_HERO_ID], assetPaths: ['x.glb'] }),
    ).toThrow(/not both/);
    expect(stub.pending).toHaveLength(0);
  });

  it('keeps the raw assetPaths escape hatch working unchanged', () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/', assetPaths: ['some/other/thing.glb'] });
    expect(stub.pending.map((load) => load.url)).toEqual(['/some/other/thing.glb']);
    assets.ready.catch(() => undefined);
    assets.dispose();
  });

  it('mirrors the set by reflection, which a yaw of PI cannot do', () => {
    const mirrored = createStudioInteriorAssets({
      baseUrl: '/',
      position: [20, GROUND_FLOOR_Y, 0],
      mirrored: true,
    });
    mirrored.ready.catch(() => undefined);
    mirrored.root.updateMatrixWorld(true);

    // The kitchen run's anchor is house-local (-6.2, 5.2). Under `frontSign = -1`, house.ts puts
    // it at world x = 20 - (-6.2) = 26.2 with z unchanged at 5.2.
    const point = new THREE.Vector3(-6.2, 0, 5.2).applyMatrix4(mirrored.root.matrixWorld);
    expect(point.x).toBeCloseTo(26.2, 6);
    expect(point.z).toBeCloseTo(5.2, 6);
    expect(mirrored.root.scale.x).toBe(-1);
    // three flips winding for a negative-determinant world matrix, so FrontSide still culls the
    // faces the player cannot see. Without that, mirroring would turn the set inside out.
    expect(mirrored.root.matrixWorld.determinant()).toBeLessThan(0);

    // A half turn is the wrong tool and this is why: Z flips with X.
    const turned = createStudioInteriorAssets({
      baseUrl: '/',
      position: [20, GROUND_FLOOR_Y, 0],
      headingRadians: Math.PI,
    });
    turned.ready.catch(() => undefined);
    turned.root.updateMatrixWorld(true);
    const wrong = new THREE.Vector3(-6.2, 0, 5.2).applyMatrix4(turned.root.matrixWorld);
    expect(wrong.x).toBeCloseTo(26.2, 6);
    expect(wrong.z).toBeCloseTo(-5.2, 6);

    mirrored.dispose();
    turned.dispose();
  });

  it('defaults to the unmirrored hero at the origin', () => {
    const assets = createStudioInteriorAssets({ baseUrl: '/' });
    expect(assets.root.position.toArray()).toEqual([0, 0, 0]);
    expect(assets.root.scale.toArray()).toEqual([1, 1, 1]);
    expect(assets.root.rotation.y).toBe(0);
    assets.ready.catch(() => undefined);
    assets.dispose();
  });
});
