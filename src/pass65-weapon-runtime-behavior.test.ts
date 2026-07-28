import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { poseOperator, setOperatorWeapon } from './art-kit';
import { WeaponPresentation } from './weapon-presentation';
import type { WeaponId } from './protocol';
import {
  PASS65_AUTHORED_FIREARM_IDS,
  createPass65WeaponModel,
  invalidatePass65PresentationTree,
  loadPass65WeaponAsset,
  pass65WeaponCacheTelemetry,
  releasePass65WeaponModelsIn,
  reloadImportedWeapon,
  type Pass65AuthoredFirearmId,
} from './weapon-model';

type FakeGltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function weaponIdFromUrl(url: string): Pass65AuthoredFirearmId {
  const match = url.match(/pass65-firearms\/([^/]+)\//);
  const id = match?.[1] as Pass65AuthoredFirearmId | undefined;
  return id && PASS65_AUTHORED_FIREARM_IDS.includes(id) ? id : 'carbine';
}

function fakeWeaponGltf(id: Pass65AuthoredFirearmId, animated = false): FakeGltf {
  const scene = new THREE.Group();
  const identity = new THREE.Group();
  identity.userData.asset_id = `pass65-weapon-${id}`;
  identity.userData.design_id = `${id}-behavior-test`;
  identity.userData.display_name = id;
  identity.userData.silhouette_family = 'behavior-test';
  scene.add(identity);
  const animations = animated
    ? [new THREE.AnimationClip('reload', 1, [
        new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
      ])]
    : [];
  return { scene, animations };
}

function fakeArmsGltf(): FakeGltf {
  const scene = new THREE.Group();
  for (const suffix of ['R', 'L']) {
    const shoulder = new THREE.Bone(); shoulder.name = `UpperArm${suffix}`;
    const elbow = new THREE.Bone(); elbow.name = `LowerArm${suffix}`;
    const wrist = new THREE.Bone(); wrist.name = `Wrist${suffix}`;
    const index = new THREE.Bone(); index.name = `Index1${suffix}`;
    elbow.position.set(0, -0.36, 0);
    wrist.position.set(0, -0.34, 0);
    index.position.set(0, -0.12, 0);
    shoulder.add(elbow); elbow.add(wrist); wrist.add(index); scene.add(shoulder);
  }
  return { scene, animations: [] };
}

function fakeKnifeGltf(): FakeGltf {
  const scene = new THREE.Group();
  const grip = new THREE.Group(); grip.name = 'grip-socket-r'; grip.position.set(0, 0.61, 0);
  const tip = new THREE.Group(); tip.name = 'blade-tip-socket'; tip.position.set(0, -1.2, 0);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), new THREE.MeshStandardMaterial());
  blade.name = 'field-knife-blade';
  blade.position.y = -0.3;
  scene.add(grip, tip, blade);
  return { scene, animations: [new THREE.AnimationClip('melee', 0.52, [])] };
}

function fakeGltfForUrl(url: string): FakeGltf {
  if (url.includes('pass65-first-person-arms')) return fakeArmsGltf();
  if (url.includes('pass65-field-knife')) return fakeKnifeGltf();
  return fakeWeaponGltf(weaponIdFromUrl(url));
}

function stubBrowserTextureLoading(): void {
  vi.stubGlobal('document', {});
  vi.stubGlobal('window', { requestIdleCallback: vi.fn(() => 1) });
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((_url, onLoad) => {
    const texture = new THREE.Texture<HTMLImageElement>();
    texture.image = { complete: true, width: 1, height: 1 } as HTMLImageElement;
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  }) as THREE.TextureLoader['load']);
}

async function flushPromises(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Pass 65 managed weapon runtime behavior', () => {
  it('keeps a rapid loadout switch atomic while initial browser assets are delayed', async () => {
    stubBrowserTextureLoading();
    const pending = new Map<string, Deferred<FakeGltf>>();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => {
      const gate = deferred<FakeGltf>();
      pending.set(String(url), gate);
      return gate.promise;
    }) as GLTFLoader['loadAsync']);
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false);

    const initialLoad = presentation.load();
    presentation.setWeapon('mp5');
    const mp5Url = [...pending.keys()].find((url) => url.includes('/mp5/'));
    expect(mp5Url).toBeDefined();
    pending.get(mp5Url!)?.resolve(fakeWeaponGltf('mp5'));
    await flushPromises();

    for (const [url, gate] of pending) {
      if (url !== mp5Url) gate.resolve(fakeGltfForUrl(url));
    }
    await initialLoad;

    const mp5 = presentation.root.getObjectByName('mp5-pass65-first-person-model');
    const initial = presentation.root.getObjectByName('carbine-pass65-first-person-model');
    expect(mp5?.visible).toBe(true);
    expect(initial?.visible).toBe(false);
    expect(presentation.root.children.filter((node) => node.name.endsWith('-pass65-first-person-model'))).toHaveLength(2);
    const loaded = pass65WeaponCacheTelemetry().entries.filter((entry) => (
      entry.variant === 'first-person' && (entry.key.endsWith(':carbine') || entry.key.endsWith(':mp5'))
    ));
    expect(loaded).toHaveLength(2);
    expect(loaded.every((entry) => entry.refs === 1)).toBe(true);
    expect(releasePass65WeaponModelsIn(presentation.root)).toBe(2);
  });

  it('keeps the previous complete viewmodel visible until injected GPU prewarm settles', async () => {
    stubBrowserTextureLoading();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltfForUrl(String(url)))
    )) as GLTFLoader['loadAsync']);
    const gate = deferred<void>();
    const prewarmer = vi.fn((_model: THREE.Object3D, context: { weaponId: WeaponId }) => (
      context.weaponId === 'carbine' ? Promise.resolve() : gate.promise
    ));
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false, undefined, prewarmer);
    await presentation.load();

    const carbine = presentation.root.getObjectByName('carbine-pass65-first-person-model');
    expect(carbine?.visible).toBe(true);
    presentation.setWeapon('mp5');
    await flushPromises();

    const mp5 = presentation.root.getObjectByName('mp5-pass65-first-person-model');
    expect(prewarmer).toHaveBeenCalledWith(mp5, { weaponId: 'mp5', requestGeneration: 1 });
    expect(mp5?.visible).toBe(false);
    expect(carbine?.visible).toBe(true);

    gate.resolve();
    await flushPromises();
    expect(mp5?.visible).toBe(true);
    expect(carbine?.visible).toBe(false);
    expect(releasePass65WeaponModelsIn(presentation.root)).toBe(2);
  });

  it('inherits the dedicated viewmodel layer on every asynchronously streamed descendant', async () => {
    stubBrowserTextureLoading();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltfForUrl(String(url)))
    )) as GLTFLoader['loadAsync']);
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false);
    await presentation.load();
    presentation.root.traverse((node) => node.layers.set(2));

    presentation.setWeapon('mp5');
    await flushPromises();
    const mp5 = presentation.root.getObjectByName('mp5-pass65-first-person-model');
    const layerMasks: number[] = [];
    mp5?.traverse((node) => layerMasks.push(node.layers.mask));

    expect(layerMasks.length).toBeGreaterThan(1);
    expect(new Set(layerMasks)).toEqual(new Set([presentation.root.layers.mask]));
    expect(releasePass65WeaponModelsIn(presentation.root)).toBe(2);
  });

  it('awaits initial GPU prewarm and safely admits a switch-away/switch-back race', async () => {
    stubBrowserTextureLoading();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltfForUrl(String(url)))
    )) as GLTFLoader['loadAsync']);
    const gates = new Map<WeaponId, Deferred<void>>();
    const prewarmer = vi.fn((_model: THREE.Object3D, context: { weaponId: WeaponId }) => {
      const gate = deferred<void>();
      gates.set(context.weaponId, gate);
      return gate.promise;
    });
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false, undefined, prewarmer);
    let loadSettled = false;
    const initialLoad = presentation.load().then(() => { loadSettled = true; });
    await flushPromises();

    const carbine = presentation.root.getObjectByName('carbine-pass65-first-person-model');
    expect(prewarmer).toHaveBeenCalledWith(carbine, { weaponId: 'carbine', requestGeneration: 0 });
    expect(carbine?.visible).toBe(false);
    expect(loadSettled).toBe(false);

    presentation.setWeapon('mp5');
    await flushPromises();
    presentation.setWeapon('carbine');
    await flushPromises();
    gates.get('mp5')?.resolve();
    await flushPromises();
    expect(carbine?.visible).toBe(false);
    expect(presentation.root.getObjectByName('mp5-pass65-first-person-model')?.visible).toBe(false);
    expect(loadSettled).toBe(false);

    gates.get('carbine')?.resolve();
    await initialLoad;
    await flushPromises();
    expect(carbine?.visible).toBe(true);
    expect(presentation.root.getObjectByName('mp5-pass65-first-person-model')?.visible).toBe(false);
    expect(releasePass65WeaponModelsIn(presentation.root)).toBe(2);
  });

  it('never commits stale or failed GPU prewarm generations', async () => {
    stubBrowserTextureLoading();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltfForUrl(String(url)))
    )) as GLTFLoader['loadAsync']);
    const gates = new Map<WeaponId, Deferred<void>>();
    const prewarmer = vi.fn((_model: THREE.Object3D, context: { weaponId: WeaponId }) => {
      if (context.weaponId === 'carbine') return Promise.resolve();
      const gate = deferred<void>();
      gates.set(context.weaponId, gate);
      return gate.promise;
    });
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false, undefined, prewarmer);
    await presentation.load();
    const carbine = presentation.root.getObjectByName('carbine-pass65-first-person-model');

    presentation.setWeapon('mp5');
    await flushPromises();
    presentation.setWeapon('m4a1');
    await flushPromises();
    gates.get('mp5')?.resolve();
    await flushPromises();

    expect(presentation.root.getObjectByName('mp5-pass65-first-person-model')?.visible ?? false).toBe(false);
    expect(presentation.root.getObjectByName('m4a1-pass65-first-person-model')?.visible).toBe(false);
    expect(carbine?.visible).toBe(true);

    gates.get('m4a1')?.reject(new Error('synthetic GPU prewarm failure'));
    await flushPromises();
    expect(presentation.root.getObjectByName('m4a1-pass65-first-person-model')).toBeUndefined();
    expect(carbine?.visible).toBe(true);
    expect(presentation.root.userData.pass65WeaponLoadError).toBe('synthetic GPU prewarm failure');
    expect(releasePass65WeaponModelsIn(presentation.root)).toBe(1);
  });

  it('uses only the authored two-chain arm rig for browser melee and restores bind state on exit', async () => {
    stubBrowserTextureLoading();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltfForUrl(String(url)))
    )) as GLTFLoader['loadAsync']);
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false);

    expect(presentation.root.getObjectByName('first-person-arms')).toBeUndefined();
    expect(presentation.root.getObjectByName('field-knife-arm-rig')).toBeUndefined();
    await presentation.load();
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms?.userData.authoredFirstPersonArms).toBe(true);

    presentation.melee();
    presentation.setMeleeCaptureProgress(0.42);
    presentation.update({
      dt: 1 / 60, moving: false, sprinting: false, crouched: false, prone: false,
      ads: false, phase: 0, landingImpulse: 0, lateralSpeed: 0, reloadProgress: null,
    });
    const active = presentation.presentationState();
    expect(arms?.visible).toBe(true);
    expect(active).toMatchObject({
      armsSource: 'authored-two-chain',
      meleeArmSource: 'authored-rigged-arms',
      proceduralMeleeArmVisible: false,
      browserProceduralMeleeArmViolation: false,
      proceduralMeleeArmFrames: 0,
      authoredMeleeChainCount: 2,
      authoredMeleeKnifeParent: 'authored-field-knife-wrist-socket',
      knifeVisible: true,
    });
    expect(active.authoredMeleeGripError).toBeLessThan(1e-6);
    expect(active.riggedArms).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: 'right', action: 'melee', knifeAttachedToRightWrist: true }),
    ]));
    expect((active.riggedArms.find((rig) => rig.side === 'right')?.shoulderBindDelta as number)).toBeGreaterThan(0);

    presentation.setMeleeCaptureProgress(null);
    presentation.fire(0.02);
    presentation.update({
      dt: 1 / 60, moving: false, sprinting: false, crouched: false, prone: false,
      ads: false, phase: 0, landingImpulse: 0, lateralSpeed: 0, reloadProgress: null,
    });
    expect(presentation.presentationState()).toMatchObject({
      meleeArmSource: 'inactive',
      proceduralMeleeArmVisible: false,
      browserProceduralMeleeArmViolation: false,
      riggedMeleeBindPoseRestoredExactly: true,
      knifeVisible: false,
    });
    expect(arms?.visible).toBe(true);
  });

  it('does not resurrect a retired operator after a delayed world-weapon load', async () => {
    vi.stubGlobal('document', {});
    const gate = deferred<FakeGltf>();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation((() => gate.promise) as unknown as GLTFLoader['loadAsync']);
    const root = new THREE.Group();
    const weaponSocket = new THREE.Group();
    const hitProxyRoot = new THREE.Group();
    root.add(weaponSocket, hitProxyRoot);
    root.userData.operatorRig = {
      rigged: true, weaponSocket, hitProxyRoot, weaponId: 'carbine', armPoseBeforeIk: [],
    };

    setOperatorWeapon(root, 'ak-47');
    expect(root.userData.pass65PendingWorldWeapon).toBe('ak-47');
    invalidatePass65PresentationTree(root);
    gate.resolve(fakeWeaponGltf('ak-47'));
    await flushPromises();

    expect(weaponSocket.children).toHaveLength(0);
    expect(root.userData.operatorRig.weapon).toBeUndefined();
    expect(pass65WeaponCacheTelemetry().entries.find((entry) => entry.key === 'world:ak-47')?.refs).toBe(0);
  });

  it('keeps the mounted operator weapon until a delayed replacement can commit atomically', async () => {
    vi.stubGlobal('document', {});
    const gate = deferred<FakeGltf>();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation((() => gate.promise) as unknown as GLTFLoader['loadAsync']);
    const root = new THREE.Group();
    const weaponSocket = new THREE.Group();
    const hitProxyRoot = new THREE.Group();
    const previous = new THREE.Group(); previous.name = 'operator-carbine';
    weaponSocket.add(previous);
    root.add(weaponSocket, hitProxyRoot);
    root.userData.operatorRig = {
      rigged: true, weaponSocket, hitProxyRoot, weapon: previous, weaponId: 'carbine', armPoseBeforeIk: [],
    };

    setOperatorWeapon(root, 'mini-uzi');
    expect(root.userData.pass65PendingWorldWeapon).toBe('mini-uzi');
    expect(root.userData.operatorRig.weaponId).toBe('carbine');
    expect(root.userData.operatorRig.weapon).toBe(previous);
    expect(weaponSocket.children).toEqual([previous]);

    gate.resolve(fakeWeaponGltf('mini-uzi'));
    await flushPromises();
    expect(root.userData.operatorRig.weaponId).toBe('mini-uzi');
    expect(root.userData.operatorRig.weapon).not.toBe(previous);
    expect(weaponSocket.children).toHaveLength(1);
    expect(releasePass65WeaponModelsIn(root)).toBe(1);
  });

  it('returns managed refs to zero and enforces the world cache budget across churn', async () => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeWeaponGltf(weaponIdFromUrl(String(url))))
    )) as GLTFLoader['loadAsync']);
    const churnIds = PASS65_AUTHORED_FIREARM_IDS.slice(0, 11);
    for (const id of churnIds) {
      await loadPass65WeaponAsset(id, 'world');
      const model = createPass65WeaponModel(id, false, 'world');
      expect(model).not.toBeNull();
      const owner = new THREE.Group();
      owner.add(model!);
      invalidatePass65PresentationTree(owner);
      expect(releasePass65WeaponModelsIn(owner)).toBe(1);
    }

    const worldEntries = pass65WeaponCacheTelemetry().entries.filter((entry) => entry.variant === 'world');
    expect(worldEntries.length).toBeLessThanOrEqual(pass65WeaponCacheTelemetry().budgets.world);
    expect(worldEntries.every((entry) => entry.refs === 0)).toBe(true);
  });

  it.each([30, 60, 120])('advances authored third-person clips by elapsed time at %i FPS', async (fps) => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(fakeWeaponGltf('railgun', true) as never);
    await loadPass65WeaponAsset('railgun', 'drop');
    const weapon = createPass65WeaponModel('railgun', false, 'drop');
    expect(weapon).not.toBeNull();
    reloadImportedWeapon(weapon!);
    const operator = new THREE.Group();
    const weaponSocket = new THREE.Group();
    const hitProxyRoot = new THREE.Group();
    weaponSocket.add(weapon!);
    operator.add(weaponSocket, hitProxyRoot);
    operator.userData.operatorRig = {
      rigged: true, weaponSocket, hitProxyRoot, weapon, weaponId: 'railgun', armPoseBeforeIk: [],
    };

    for (let frame = 0; frame < fps / 2; frame += 1) {
      poseOperator(operator, 'stand', 0, frame / fps, 1, 0, 1 / fps);
    }
    const animatedVisual = weapon!.getObjectByName('railgun-pass65-drop-visual');
    expect(animatedVisual?.position.x).toBeCloseTo(0.5, 5);
    expect(releasePass65WeaponModelsIn(operator)).toBe(1);
  });
});
