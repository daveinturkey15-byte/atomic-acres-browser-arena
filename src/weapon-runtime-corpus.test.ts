import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEAPON_IDS } from './protocol';

function fakeGltf(url: string) {
  const scene = new THREE.Group();
  const material = (name: string): THREE.MeshStandardMaterial => {
    const texture = new THREE.Texture();
    texture.image = { width: 4, height: 4 };
    texture.name = `${name}-texture`;
    const result = new THREE.MeshStandardMaterial({ color: 0x667788, map: texture });
    result.name = name;
    return result;
  };
  const materialNames = url.includes('/lmg/')
    ? ['MAT_Pass65_lmg_Polymer_PBR', 'MAT_Pass65_lmg_Primary_PBR']
    : ['shared-pass65-test-material'];
  if (url.includes('/lmg/') && url.includes('-drop-lod0')) materialNames.reverse();
  for (const [index, name] of materialNames.entries()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.2), material(name));
    mesh.name = `source-${index}-${url}`;
    scene.add(mesh);
  }
  return { scene, animations: [] };
}

function embeddedImageDigests(path: string): readonly string[] {
  const glb = readFileSync(path);
  let offset = 12;
  let document: { images?: Array<{ bufferView?: number }>; bufferViews?: Array<{ byteOffset?: number; byteLength: number }> } | null = null;
  let binary: Buffer | null = null;
  while (offset < glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.toString('ascii', offset + 4, offset + 8);
    const chunk = glb.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') document = JSON.parse(chunk.toString('utf8').replace(/\0+$/u, ''));
    if (type.startsWith('BIN')) binary = chunk;
    offset += 8 + length;
  }
  if (!document || !binary) throw new Error(`Invalid binary glTF: ${path}`);
  return Object.freeze((document.images ?? []).map((image) => {
    if (image.bufferView === undefined) throw new Error(`External image is not allowed in ${path}`);
    const view = document!.bufferViews?.[image.bufferView];
    if (!view) throw new Error(`Missing image buffer view in ${path}`);
    const start = view.byteOffset ?? 0;
    return createHash('sha256').update(binary!.subarray(start, start + view.byteLength)).digest('hex');
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Pass 65 menu-video runtime weapon corpus', () => {
  it('finishes its default cooperative decode lane while hidden animation frames are suspended', async () => {
    vi.resetModules();
    const suspendedAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    vi.stubGlobal('requestAnimationFrame', suspendedAnimationFrame);
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltf(String(url)))
    )) as unknown as GLTFLoader['loadAsync']);
    const weaponModel = await import('./weapon-model');

    await weaponModel.prewarmPass65RuntimeWeaponCorpus();

    expect(suspendedAnimationFrame).not.toHaveBeenCalled();
    expect(weaponModel.pass65WeaponCacheTelemetry().runtimeCorpus).toMatchObject({
      ready: true,
      prewarming: false,
      profile: expect.objectContaining({ completed: true, error: null }),
    });
  });

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

  it('proves every variant embeds byte-identical PBR images before runtime texture sharing', () => {
    const directory = join(process.cwd(), 'public', 'assets', 'original', 'models', 'weapons');
    const worldFiles: string[] = [];
    const visit = (path: string): void => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (/-world-lod0\.glb$/.test(entry.name)) worldFiles.push(child);
      }
    };
    visit(directory);
    expect(worldFiles).toHaveLength(WEAPON_IDS.length + 1);
    for (const world of worldFiles) {
      const expected = embeddedImageDigests(world);
      expect(embeddedImageDigests(world.replace('-world-lod0.glb', '-drop-lod0.glb')), world).toEqual(expected);
      expect(embeddedImageDigests(world.replace('-world-lod0.glb', '-fp-lod0.glb')), world).toEqual(expected);
    }
  });

  it('decodes each bounded source once and survives two complete 18-weapon world/drop cycles', async () => {
    vi.resetModules();
    const loadSpy = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(((url: string) => (
      Promise.resolve(fakeGltf(String(url)))
    )) as unknown as GLTFLoader['loadAsync']);
    const weaponModel = await import('./weapon-model');
    const firstPersonModels: THREE.Object3D[] = [];
    for (const id of WEAPON_IDS) {
      await weaponModel.loadPass65WeaponPresentation(id, 'first-person');
      const model = id === 'explosive-crossbow'
        ? weaponModel.createPass65CrossbowModel(false, 'first-person')
        : weaponModel.createPass65WeaponModel(id, false, 'first-person');
      expect(model, `${id}:first-person`).not.toBeNull();
      firstPersonModels.push(model!);
    }
    await weaponModel.loadPass65FieldKnifeAsset('first-person');
    const firstPersonKnife = weaponModel.createPass65FieldKnifeModel(false, 'first-person');
    expect(firstPersonKnife).not.toBeNull();
    firstPersonModels.push(firstPersonKnife!);
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
    expect(afterPrewarm.runtimeCorpus.residency.textureBytesEstimate).toBe(0);
    expect(afterPrewarm.runtimeCorpus.allVariantsResidency.textureBytesEstimate)
      .toBe(afterPrewarm.resident.world.textureBytesEstimate);
    expect(afterPrewarm.runtimeCorpus.residency.estimatedDecodedBytes)
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
    for (const model of firstPersonModels) weaponModel.disposePass65WeaponModel(model);
    const finalTelemetry = weaponModel.pass65WeaponCacheTelemetry();
    expect(finalTelemetry.entries.filter((entry) => entry.variant === 'world')).toHaveLength(17);
    expect(finalTelemetry.entries.filter((entry) => entry.variant === 'drop')).toHaveLength(17);
    expect(finalTelemetry.entries.every((entry) => entry.refs === 0)).toBe(true);
  });
});
