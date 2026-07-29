import * as THREE from 'three';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEAPON_IDS } from './protocol';

function fakeGltf(url: string) {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.25, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x667788 }),
  );
  mesh.name = `source-${url}`;
  scene.add(mesh);
  return { scene, animations: [] };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Pass 65 menu-video runtime weapon corpus', () => {
  it('keeps the checked-in world/drop corpus inside the explicit compressed budget', async () => {
    const { PASS65_RUNTIME_WEAPON_CORPUS_BUDGET } = await import('./weapon-model');
    const files: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (/(?:-world-lod0|-drop-lod0)\.glb$/.test(entry.name)) files.push(path);
      }
    };
    visit(join(process.cwd(), 'public', 'assets', 'original', 'models', 'weapons'));
    const compressedBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
    expect(files).toHaveLength(PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets);
    expect(compressedBytes).toBeLessThanOrEqual(PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.maximumCompressedBytes);
  });

  it('decodes each bounded source once and survives two complete 18-weapon world/drop cycles', async () => {
    vi.resetModules();
    const loadSpy = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltf(String(url)))
    )) as unknown as GLTFLoader['loadAsync']);
    const weaponModel = await import('./weapon-model');
    let yields = 0;
    await weaponModel.prewarmPass65RuntimeWeaponCorpus(async () => { yields += 1; });

    const afterPrewarm = weaponModel.pass65WeaponCacheTelemetry();
    expect(yields).toBe(weaponModel.PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets);
    expect(afterPrewarm.runtimeCorpus).toMatchObject({ ready: true, prewarming: false });
    expect(afterPrewarm.runtimeCorpus.profile).toMatchObject({
      requestedAssets: weaponModel.PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
      loadedAssets: weaponModel.PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
      completed: true,
      error: null,
    });
    expect(afterPrewarm.resident.world.assets).toBe(WEAPON_IDS.length + 1);
    expect(afterPrewarm.resident.drop.assets).toBe(WEAPON_IDS.length + 1);
    expect(afterPrewarm.resident.world.estimatedDecodedBytes).toBeGreaterThan(0);
    expect(afterPrewarm.resident.drop.estimatedDecodedBytes).toBeGreaterThan(0);
    expect(afterPrewarm.resident.world.estimatedDecodedBytes + afterPrewarm.resident.drop.estimatedDecodedBytes)
      .toBeLessThanOrEqual(weaponModel.PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.maximumEstimatedDecodedBytes);
    const decodedLoads = loadSpy.mock.calls.length;

    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (const id of WEAPON_IDS) {
        const world = id === 'explosive-crossbow'
          ? weaponModel.createPass65CrossbowModel(false, 'world')
          : weaponModel.createPass65WeaponModel(id, false, 'world');
        const drop = id === 'explosive-crossbow'
          ? weaponModel.createPass65CrossbowModel(false, 'drop')
          : weaponModel.createPass65WeaponModel(id, false, 'drop');
        expect(world, `${cycle}:${id}:world`).not.toBeNull();
        expect(drop, `${cycle}:${id}:drop`).not.toBeNull();
        weaponModel.disposePass65WeaponModel(world!);
        weaponModel.disposePass65WeaponModel(drop!);
      }
      const knifeWorld = weaponModel.createPass65FieldKnifeModel(false, 'world');
      const knifeDrop = weaponModel.createPass65FieldKnifeModel(false, 'drop');
      expect(knifeWorld).not.toBeNull();
      expect(knifeDrop).not.toBeNull();
      weaponModel.disposePass65WeaponModel(knifeWorld!);
      weaponModel.disposePass65WeaponModel(knifeDrop!);
    }

    expect(loadSpy).toHaveBeenCalledTimes(decodedLoads);
    const finalTelemetry = weaponModel.pass65WeaponCacheTelemetry();
    expect(finalTelemetry.entries.filter((entry) => entry.variant === 'world')).toHaveLength(17);
    expect(finalTelemetry.entries.filter((entry) => entry.variant === 'drop')).toHaveLength(17);
    expect(finalTelemetry.entries.every((entry) => entry.refs === 0)).toBe(true);
  });
});
