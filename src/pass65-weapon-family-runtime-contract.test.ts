import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  PASS65_AUTHORED_FIREARM_IDS,
  PASS65_AUTHORED_WEAPON_URLS,
  PASS65_FIELD_KNIFE_URLS,
  PASS65_WEAPON_CACHE_BUDGET,
} from './weapon-model';

const familySpec = JSON.parse(readFileSync('source-assets/blender/pass65-weapon-family-specs.json', 'utf8')) as {
  weapons: readonly { id: string; displayName: string; designId: string; signatureNodes: readonly string[] }[];
};
const production = JSON.parse(readFileSync('source-assets/blender/pass65-weapon-production.manifest.json', 'utf8')) as {
  weapons: readonly {
    id: string;
    releaseState: string;
    runtimeIntegrationState?: string;
    firstPersonGlbs?: readonly { path: string; variant: string }[];
    worldGlbs?: readonly { path: string; variant: string }[];
    dropGlbs?: readonly { path: string; variant: string }[];
  }[];
  meleeWeapons: readonly {
    id: string;
    releaseState: string;
    runtimeIntegrationState?: string;
    firstPersonGlbs?: readonly { path: string; variant: string }[];
    worldGlbs?: readonly { path: string; variant: string }[];
    dropGlbs?: readonly { path: string; variant: string }[];
  }[];
};

describe('Pass 65 authored firearm runtime selection', () => {
  it('keeps the runtime, Blender specification, catalog and production sets exactly equal', () => {
    const expected = WEAPON_CATALOG.map((weapon) => weapon.id).filter((id) => id !== 'explosive-crossbow').sort();
    expect([...PASS65_AUTHORED_FIREARM_IDS].sort()).toEqual(expected);
    expect(familySpec.weapons.map((weapon) => weapon.id).sort()).toEqual(expected);
    expect(production.weapons.filter((weapon) => weapon.id !== 'explosive-crossbow').map((weapon) => weapon.id).sort()).toEqual(expected);
    expect(new Set(familySpec.weapons.map((weapon) => weapon.designId)).size).toBe(expected.length);
    const catalogNames = new Map(WEAPON_CATALOG.map((weapon) => [weapon.id, weapon.displayName]));
    for (const weapon of familySpec.weapons) expect(weapon.displayName).toBe(catalogNames.get(weapon.id));
  });

  it('selects authored first-person, world and drop deliveries for every family', () => {
    for (const id of PASS65_AUTHORED_FIREARM_IDS) {
      const urls = PASS65_AUTHORED_WEAPON_URLS[id];
      expect(urls['first-person']).toBe(`./assets/original/models/weapons/pass65-firearms/${id}/${id}-fp-lod0.glb`);
      expect(urls.world).toBe(`./assets/original/models/weapons/pass65-firearms/${id}/${id}-world-lod0.glb`);
      expect(urls.drop).toBe(`./assets/original/models/weapons/pass65-firearms/${id}/${id}-drop-lod0.glb`);
      for (const url of Object.values(urls)) expect(existsSync(url.replace('./assets/', 'public/assets/'))).toBe(true);
      const entry = production.weapons.find((weapon) => weapon.id === id);
      expect(entry).toMatchObject({ releaseState: 'release-ready', runtimeIntegrationState: 'bounded-lazy-runtime-selection' });
      expect(entry?.firstPersonGlbs?.map((delivery) => delivery.variant)).toEqual(['first-person-lod0', 'first-person-lod1']);
      expect(entry?.worldGlbs?.map((delivery) => delivery.variant)).toEqual(['world-lod0', 'world-lod1', 'world-lod2']);
      expect(entry?.dropGlbs?.map((delivery) => delivery.variant)).toEqual(['drop-lod0']);
    }
  });

  it('bounds decoded assets and excludes eager corpus loading and release procedural fallback', () => {
    expect(PASS65_WEAPON_CACHE_BUDGET).toEqual({ 'first-person': 2, world: 8, drop: 4 });
    const modelSource = readFileSync('src/weapon-model.ts', 'utf8');
    const viewSource = readFileSync('src/weapon-presentation.ts', 'utf8');
    const artKitSource = readFileSync('src/art-kit.ts', 'utf8');
    const railgunSource = readFileSync('src/railgun-presentation.ts', 'utf8');
    expect(modelSource).not.toContain('third-party/quaternius');
    expect(modelSource).not.toMatch(/Promise\.all\([^)]*PASS65_AUTHORED_FIREARM_IDS/);
    expect(modelSource).toContain('enforceCacheBudget(variant, key)');
    expect(modelSource).toContain('entry.key !== protectedKey');
    expect(viewSource).toContain('this.retireModel(model, () => releasePass65WeaponModel(model))');
    expect(artKitSource).toContain('retirePrevious(previous, () => releasePass65WeaponModel(previous))');
    expect(viewSource).toContain("loadPass65WeaponPresentation(id, 'first-person')");
    expect(viewSource).toContain("model.userData.firstPersonSource = 'test-only-procedural-fallback'");
    expect(artKitSource).toContain("loadPass65WeaponPresentation(weaponId, 'world')");
    expect(artKitSource).toContain('const weapon = authoredWorldWeapon ?? buildWeaponModel');
    expect(artKitSource).toContain("'weapon-action', 'weapon-magazine', 'm134-barrel-cluster'");
    expect(artKitSource).toContain('fireImportedWeapon(rig.weapon)');
    expect(artKitSource).toContain('if (rig.weapon) updateImportedWeapon(rig.weapon, animationDeltaSeconds)');
    expect(artKitSource).toContain('root.userData.pass65PresentationRetired === true');
    expect(modelSource).toContain('export function invalidatePass65PresentationTree');
    expect(modelSource).toContain('export function releasePass65WeaponModelsIn');
    expect(railgunSource).toContain("loadPass65WeaponAsset('railgun', 'world')");
    expect(railgunSource).toContain("createPass65WeaponModel('railgun', this.flattenMaterials, 'world')");
    expect(railgunSource).toContain("if (typeof window === 'undefined')");
  });

  it('uses the independently authored drop delivery for death drops', () => {
    const dropSource = readFileSync('src/death-drop-presentation.ts', 'utf8');
    const gameSource = readFileSync('src/legacy-main.ts', 'utf8');
    expect(dropSource).toContain("loadPass65WeaponPresentation(weaponId, 'drop')");
    expect(dropSource).toContain("if (typeof document === 'undefined')");
    expect(dropSource).toContain('this.retireModel(model, () => releasePass65WeaponModel(model))');
    expect(gameSource).toContain('deathDropPresentationPool.acquire(id, spec.color, victim.position, victim.weapon)');
    expect(gameSource).toContain('deathDropPresentationPool.prewarm(renderRuntime, camera, player.weapon)');
  });

  it('selects the authored field knife for first-person, operator and hidden drop presentation', () => {
    expect(PASS65_FIELD_KNIFE_URLS).toEqual({
      'first-person': './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-fp-lod0.glb',
      world: './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-world-lod0.glb',
      drop: './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-drop-lod0.glb',
    });
    for (const url of Object.values(PASS65_FIELD_KNIFE_URLS)) expect(existsSync(url.replace('./assets/', 'public/assets/'))).toBe(true);
    expect(production.meleeWeapons).toHaveLength(1);
    expect(production.meleeWeapons[0]).toMatchObject({
      id: 'field-knife', releaseState: 'release-ready', runtimeIntegrationState: 'bounded-lazy-runtime-selection',
    });
    expect(production.meleeWeapons[0].firstPersonGlbs).toHaveLength(2);
    expect(production.meleeWeapons[0].worldGlbs).toHaveLength(2);
    expect(production.meleeWeapons[0].dropGlbs).toHaveLength(1);
    const viewSource = readFileSync('src/weapon-presentation.ts', 'utf8');
    const artKitSource = readFileSync('src/art-kit.ts', 'utf8');
    expect(viewSource).toContain("loadPass65FieldKnifeAsset('first-person')");
    expect(viewSource).toContain("loadPass65FieldKnifeAsset('drop')");
    expect(viewSource).toContain('this.passiveKnife.visible = false');
    expect(artKitSource).toContain("loadPass65FieldKnifeAsset('world')");
    expect(viewSource).toContain("if (typeof document === 'undefined')");
    expect(artKitSource).toContain("if (typeof document === 'undefined')");
  });
});
