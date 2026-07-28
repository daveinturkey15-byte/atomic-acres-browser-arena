import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildGunRange } from './additional-maps';
import { GUN_RANGE_WEAPON_STATIONS } from './gun-range-armory';
import {
  GUN_RANGE_RACK_ASSETS,
  loadGunRangeRackPresentation,
  type GunRangeRackPresentationRuntime,
} from './gun-range-rack-presentation';
import { definition as gunRangeVisualDefinition } from './rendering/arenas/gun-range';
import type { Pass65AuthoredFirearmId } from './weapon-model';

type Deferred = Readonly<{
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}>;

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeAuthoredModel(weapon: Pass65AuthoredFirearmId): THREE.Group {
  const asset = GUN_RANGE_RACK_ASSETS.find((entry) => entry.weapon === weapon)!;
  const model = new THREE.Group();
  model.userData.projectOriginalWeapon = true;
  model.userData.deliveryVariant = 'world';
  model.userData.importedWeaponSource = asset.url;
  model.userData.weaponModelId = `${weapon}-project-original-test`;
  model.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.6), new THREE.MeshStandardMaterial()));
  return model;
}

function rackModels(root: THREE.Group): THREE.Object3D[] {
  const models: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name.startsWith('gun-range-rack-weapon-')) models.push(node);
  });
  return models;
}

describe('Gun Range authored rack presentation', () => {
  it('builds deterministic authority stations empty instead of constructing a procedural firearm fallback', () => {
    const source = readFileSync(new URL('./additional-maps.ts', import.meta.url), 'utf8');
    const map = buildGunRange(new THREE.Scene());
    const stations = GUN_RANGE_WEAPON_STATIONS.map((station) => (
      map.root.getObjectByName(`gun-range-weapon-station-${station.weapon}`)
    ));

    expect(source).not.toContain('buildWeaponModel(station.weapon');
    expect(source).not.toContain("import { buildWeaponModel } from './art-kit'");
    expect(stations).toHaveLength(5);
    expect(stations.every((station) => station instanceof THREE.Group)).toBe(true);
    expect(stations.map((station) => station?.userData.stationId)).toEqual(GUN_RANGE_WEAPON_STATIONS.map((station) => station.id));
    expect(stations.map((station) => station?.userData.weapon)).toEqual(GUN_RANGE_WEAPON_STATIONS.map((station) => station.weapon));
    expect(stations.every((station) => station?.userData.rackPresentationSource === 'fail-closed-unloaded')).toBe(true);
    expect(rackModels(map.root)).toEqual([]);
    expect(map.root.userData.gunRangeRackPresentation).toMatchObject({ status: 'unloaded', required: 5, ready: 0 });
  });

  it('declares exactly the selected authored world-LOD requests on the Gun Range definition', () => {
    expect(GUN_RANGE_RACK_ASSETS.map((asset) => asset.stationId)).toEqual(GUN_RANGE_WEAPON_STATIONS.map((station) => station.id));
    expect(GUN_RANGE_RACK_ASSETS.map((asset) => asset.weapon)).toEqual(GUN_RANGE_WEAPON_STATIONS.map((station) => station.weapon));
    expect(GUN_RANGE_RACK_ASSETS.every((asset) => asset.url.endsWith(`/${asset.weapon}-world-lod0.glb`))).toBe(true);
    expect(gunRangeVisualDefinition.assetDependencies).toEqual(GUN_RANGE_RACK_ASSETS.map((asset) => asset.url));
  });

  it('awaits authored rack preparation before the existing selected-scene GPU prewarm and exposes source telemetry', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const browserGate = readFileSync(new URL('../scripts/qa/verify-pass65-menu-preview-webgpu.mjs', import.meta.url), 'utf8');
    const qualityGate = source.slice(
      source.indexOf('async function ensureSelectedQualityPresentation('),
      source.indexOf('function retireAtomicPresentation()'),
    );
    const deployment = source.slice(
      source.indexOf('async function performArenaSelection('),
      source.indexOf('function activateArenaSelection('),
    );

    expect(source).toContain("import { loadGunRangeRackPresentation } from './gun-range-rack-presentation'");
    expect(qualityGate).toContain("else if (id === 'gun-range')");
    expect(qualityGate).toContain("await loadGunRangeRackPresentation(selectedArenaAuthority('gun-range').root");
    expect(qualityGate).toContain("arenaVisualStream.recordSelectedAssetRequest('gun-range', url)");
    expect(deployment.indexOf('await ensureSelectedQualityPresentation(selectedArena.id)'))
      .toBeLessThan(deployment.indexOf('batchSelectedArenaPresentation()'));
    expect(deployment.indexOf('batchSelectedArenaPresentation()'))
      .toBeLessThan(deployment.indexOf('submitWebGpuFrame(performance.now(), true)'));
    expect(source).toContain('rackPresentation: arena.root.userData.gunRangeRackPresentation ?? null');
    expect(source).toContain('authored: rackModel?.userData.projectOriginalWeapon === true');
    expect(source).toContain('deliveryVariant: rackModel?.userData.deliveryVariant ?? null');
    expect(browserGate).toContain("requireWebGPU=1&render=blender");
    expect(browserGate).toContain("setArenaReviewCamera('gun-range-armory-support')");
    expect(browserGate).toContain("afterDeployment.rangePractice.rackPresentation?.status !== 'ready'");
    expect(browserGate).toContain("station.deliveryVariant !== 'world'");
    expect(browserGate).toContain('source changed during exact Gun Range authored-rack WebGPU capture');
  });

  it('loads and validates all five models before one atomic attach without mutating authority', async () => {
    const map = buildGunRange(new THREE.Scene());
    const authorityBefore = {
      colliders: map.colliders,
      physicsColliders: map.physicsColliders,
      raycastMeshes: map.raycastMeshes,
      shotSurfaces: map.shotSurfaces,
    };
    const gates = new Map(GUN_RANGE_RACK_ASSETS.map((asset) => [asset.weapon, deferred()]));
    const load = vi.fn((weapon: Pass65AuthoredFirearmId) => gates.get(weapon)!.promise);
    const create = vi.fn((weapon: Pass65AuthoredFirearmId) => fakeAuthoredModel(weapon));
    const dispose = vi.fn();
    const runtime: GunRangeRackPresentationRuntime = { load, create, dispose };
    const requests: string[] = [];

    const first = loadGunRangeRackPresentation(map.root, { recordRequest: (url) => requests.push(url), runtime });
    const duplicate = loadGunRangeRackPresentation(map.root, { recordRequest: (url) => requests.push(url), runtime });
    expect(duplicate).toBe(first);
    expect(map.root.userData.gunRangeRackPresentation).toMatchObject({ status: 'loading', ready: 0 });
    expect(load).toHaveBeenCalledTimes(5);
    expect(create).not.toHaveBeenCalled();
    expect(rackModels(map.root)).toEqual([]);

    gates.forEach((gate) => gate.resolve());
    const receipt = await first;

    expect(requests).toEqual(GUN_RANGE_RACK_ASSETS.map((asset) => asset.url));
    expect(receipt).toMatchObject({ status: 'ready', stationCount: 5 });
    expect(receipt.stations.map((station) => station.stationId)).toEqual(GUN_RANGE_WEAPON_STATIONS.map((station) => station.id));
    expect(map.root.userData.gunRangeRackPresentation).toMatchObject({
      status: 'ready', required: 5, ready: 5, source: 'project-original-blender-world-lod0',
    });
    expect(rackModels(map.root)).toHaveLength(5);
    for (const asset of GUN_RANGE_RACK_ASSETS) {
      const station = map.root.getObjectByName(`gun-range-weapon-station-${asset.weapon}`)!;
      const model = station.getObjectByName(`gun-range-rack-weapon-${asset.weapon}`)!;
      expect(station.userData).toMatchObject({
        stationId: asset.stationId,
        weapon: asset.weapon,
        rackPresentationSource: 'project-original-blender-world-lod0',
      });
      expect(model.userData).toMatchObject({
        projectOriginalWeapon: true,
        deliveryVariant: 'world',
        importedWeaponSource: asset.url,
        weaponId: asset.weapon,
        gunRangeStationId: asset.stationId,
        presentationSource: 'project-original-blender-world-lod0',
      });
      expect(model.rotation.toArray().slice(0, 3)).toEqual([0.08, Math.PI / 2, -0.08]);
      expect(model.scale.x).toBe(asset.weapon === 'lmg' ? 0.52 : 0.58);
      model.traverse((node) => {
        expect(node.userData.presentationOnly).toBe(true);
        if (node instanceof THREE.Mesh) expect(node.raycast(new THREE.Raycaster(), [])).toBeUndefined();
      });
    }
    expect(map.colliders).toBe(authorityBefore.colliders);
    expect(map.physicsColliders).toBe(authorityBefore.physicsColliders);
    expect(map.raycastMeshes).toBe(authorityBefore.raycastMeshes);
    expect(map.shotSurfaces).toBe(authorityBefore.shotSurfaces);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('fails closed before instantiation when any authored request fails', async () => {
    const map = buildGunRange(new THREE.Scene());
    const failure = new Error('fixture GLB unavailable');
    const load = vi.fn((weapon: Pass65AuthoredFirearmId) => (
      weapon === 'lmg' ? Promise.reject(failure) : Promise.resolve()
    ));
    const create = vi.fn((weapon: Pass65AuthoredFirearmId) => fakeAuthoredModel(weapon));
    const runtime: GunRangeRackPresentationRuntime = { load, create, dispose: vi.fn() };

    await expect(loadGunRangeRackPresentation(map.root, { recordRequest: vi.fn(), runtime })).rejects.toThrow(failure);
    expect(load).toHaveBeenCalledTimes(5);
    expect(create).not.toHaveBeenCalled();
    expect(rackModels(map.root)).toEqual([]);
    expect(map.root.userData.gunRangeRackPresentation).toMatchObject({
      status: 'failed', ready: 0, source: 'fail-closed', error: failure.message,
    });
  });

  it('disposes every detached clone and attaches none when authored identity validation fails', async () => {
    const map = buildGunRange(new THREE.Scene());
    const created: THREE.Group[] = [];
    const create = vi.fn((weapon: Pass65AuthoredFirearmId) => {
      const model = fakeAuthoredModel(weapon);
      if (weapon === 'lmg') model.userData.importedWeaponSource = 'procedural://forbidden';
      created.push(model);
      return model;
    });
    const dispose = vi.fn();
    const runtime: GunRangeRackPresentationRuntime = {
      load: vi.fn(() => Promise.resolve()),
      create,
      dispose,
    };

    await expect(loadGunRangeRackPresentation(map.root, { recordRequest: vi.fn(), runtime }))
      .rejects.toThrow('rejected non-authored or incomplete model');
    expect(create).toHaveBeenCalledTimes(3);
    expect(dispose).toHaveBeenCalledTimes(created.length);
    expect(rackModels(map.root)).toEqual([]);
    expect(map.root.userData.gunRangeRackPresentation).toMatchObject({ status: 'failed', ready: 0 });
  });
});
