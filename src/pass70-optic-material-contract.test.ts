import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimizeAttachedWeapon } from './art-kit';
import {
  PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
  PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
  applyPass70WeaponMaterialSemantics,
  capturePass70FirstPersonMaterialState,
  createPass65WeaponModel,
  isFirstPersonOpticWindowSurface,
  loadPass65WeaponAsset,
  releasePass65WeaponModel,
} from './weapon-model';

const LENS_BEARING_FIRST_PERSON_ASSETS = Object.freeze({
  'explosive-crossbow': ['MAT_Pass65_Crossbow_OpticLens'],
  carbine: ['MAT_Pass65_carbine_Lens'],
  flamethrower: ['MAT_Pass65_flamethrower_Lens'],
  'flashlight-pistol': ['MAT_Pass65_flashlight_pistol_Lens'],
  'm14-ebr': ['MAT_Pass65_m14_ebr_Lens'],
  minigun: ['MAT_Pass65_minigun_Lens'],
  railgun: ['MAT_Pass65_railgun_Lens'],
  smg: ['MAT_Pass65_smg_Lens'],
  sniper: ['MAT_Pass65_sniper_Lens'],
} as const);

function firstPersonAssetPath(id: string): string {
  return id === 'explosive-crossbow'
    ? 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb'
    : `public/assets/original/models/weapons/pass65-firearms/${id}/${id}-fp-lod0.glb`;
}

function glbJson(path: string): { materials?: readonly { name?: string }[] } {
  const bytes = readFileSync(path);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/u, ''));
    }
    offset += 8 + length;
  }
  throw new Error(`${path} has no GLB JSON chunk`);
}

function fakeRailgunAsset(): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  const scene = new THREE.Group();
  const identity = new THREE.Group();
  identity.userData.asset_id = 'pass65-weapon-railgun';
  identity.userData.design_id = 'railgun-pass70-optic-test';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_railgun_Gunmetal' }),
  );
  body.name = 'railgun_FP_LOD0_Runtime_static_MAT_Pass65_railgun_Gunmetal';
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.02, 8),
    new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_railgun_Lens' }),
  );
  lens.name = 'railgun_FP_LOD0_Runtime_static_MAT_Pass65_railgun_Lens';
  identity.add(body, lens);
  scene.add(identity);
  return { scene, animations: [] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pass 70 semantic first-person optic windows', () => {
  it('pins the exact shipped lens-bearing corpus and the lensless Mini Uzi falsifier', () => {
    for (const [id, expectedMaterials] of Object.entries(LENS_BEARING_FIRST_PERSON_ASSETS)) {
      const json = glbJson(firstPersonAssetPath(id));
      const lensMaterials = (json.materials ?? [])
        .map((material) => material.name ?? '')
        .filter((name) => isFirstPersonOpticWindowSurface('', name));
      expect(lensMaterials, id).toEqual(expectedMaterials);
    }
    const miniUzi = glbJson(firstPersonAssetPath('mini-uzi'));
    expect((miniUzi.materials ?? []).map((material) => material.name ?? '')
      .filter((name) => isFirstPersonOpticWindowSurface('', name))).toEqual([]);
  });

  it('accepts semantic lens/window names without clearing housings, caps or receivers', () => {
    expect(isFirstPersonOpticWindowSurface('', 'MAT_Pass65_Crossbow_OpticLens')).toBe(true);
    expect(isFirstPersonOpticWindowSurface('railgun-optic-window', 'MAT_Railgun_OpticWindow')).toBe(true);
    expect(isFirstPersonOpticWindowSurface('railgun-scope-glass', 'MAT_Railgun_ScopeGlass')).toBe(true);
    expect(isFirstPersonOpticWindowSurface('railgun-LensHousing', 'MAT_Polymer')).toBe(false);
    expect(isFirstPersonOpticWindowSurface('railgun-optic-cap', 'MAT_LensHousing')).toBe(false);
    expect(isFirstPersonOpticWindowSurface('receiver-window', 'MAT_Gunmetal')).toBe(false);
    expect(isFirstPersonOpticWindowSurface('optic-lens', 'MAT_LensHousing')).toBe(false);
  });

  it('makes only first-person optic windows clear and keeps world/drop lenses opaque', () => {
    const firstPersonLens = new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_railgun_Lens' });
    expect(applyPass70WeaponMaterialSemantics(
      firstPersonLens, 'railgun_FP_Runtime_static_Lens', firstPersonLens.name, 'first-person',
    )).toBe('optic-window');
    expect(firstPersonLens).toMatchObject({
      transparent: true,
      opacity: PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
      depthTest: true,
      depthWrite: false,
    });
    expect(firstPersonLens.userData).toMatchObject({
      pass70FirstPersonMaterialContract: PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
      pass70FirstPersonSurface: 'optic-window',
    });

    const body = new THREE.MeshStandardMaterial({ name: 'MAT_Pass65_railgun_Gunmetal' });
    applyPass70WeaponMaterialSemantics(body, 'railgun_Runtime_static_Gunmetal', body.name, 'first-person');
    expect(body).toMatchObject({ transparent: false, opacity: 1, depthTest: true, depthWrite: true });

    const worldLens = new THREE.MeshStandardMaterial({
      name: 'MAT_Pass65_railgun_Lens', transparent: true, opacity: 0.2, depthWrite: false,
    });
    expect(applyPass70WeaponMaterialSemantics(
      worldLens, 'railgun_World_Lens', worldLens.name, 'world',
    )).toBe('non-first-person');
    expect(worldLens).toMatchObject({ transparent: false, opacity: 1, depthWrite: true });
    expect(worldLens.userData.pass70FirstPersonMaterialContract).toBeUndefined();
  });

  it('retains a clear visible lens through reduced texture-lit batching while bodies stay opaque', async () => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(fakeRailgunAsset() as never);
    await loadPass65WeaponAsset('railgun', 'first-person');

    for (const flattenMaterials of [false, true]) {
      const model = createPass65WeaponModel('railgun', flattenMaterials, 'first-person');
      expect(model).not.toBeNull();
      if (flattenMaterials) optimizeAttachedWeapon(model!, 'texture-lit');
      const state = capturePass70FirstPersonMaterialState(model!);
      expect(state).toMatchObject({
        contract: PASS70_FIRST_PERSON_OPTIC_WINDOW_CONTRACT,
        materialCount: 2,
        markedMaterialCount: 2,
        opticWindowCount: 1,
        opaqueBodyCount: 1,
        presentationDetailCount: 0,
        invalidOpticWindowCount: 0,
        invalidOpaqueBodyCount: 0,
      });
      expect(state.opticWindows).toEqual([expect.objectContaining({
        material: 'MAT_Pass65_railgun_Lens',
        opacity: PASS70_FIRST_PERSON_OPTIC_WINDOW_OPACITY,
        transparent: true,
        depthWrite: false,
      })]);
      expect(releasePass65WeaponModel(model!)).toBeUndefined();
    }
  });
});
