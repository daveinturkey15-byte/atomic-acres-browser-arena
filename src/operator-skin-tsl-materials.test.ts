import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OPERATOR_LOOK_REGISTRY,
  resolveOperatorLook,
} from './operator-skin-look-registry';
import {
  OPERATOR_LOOK_GARMENT_ROLES,
  cloneOperatorLookMaterial,
  operatorLookBaseMaterial,
  operatorLookCacheStats,
  operatorLookGraphCount,
  operatorLookInstanceMaterial,
  operatorLookMaterialForAuthored,
  operatorLookMaterialsEnabled,
  operatorLookRoleForMaterialName,
  resetOperatorLookCachesForTest,
  resetOperatorLookRenderBackendForTest,
  setOperatorLookRenderBackend,
} from './operator-skin-tsl-materials';

afterEach(() => {
  resetOperatorLookCachesForTest();
});

describe('operatorLookRoleForMaterialName', () => {
  it('claims exactly the three authored garment materials', () => {
    expect(operatorLookRoleForMaterialName('Swat')).toBe('garment');
    expect(operatorLookRoleForMaterialName('swat')).toBe('garment');
    expect(operatorLookRoleForMaterialName('Swat_Black')).toBe('garmentDark');
    expect(operatorLookRoleForMaterialName('Grey')).toBe('webbing');
    expect(operatorLookRoleForMaterialName('DarkBrown')).toBe('webbing');
  });

  it('leaves skin, visor and unknown materials to their existing path', () => {
    expect(operatorLookRoleForMaterialName('Skin')).toBeNull();
    expect(operatorLookRoleForMaterialName('Visor')).toBeNull();
    expect(operatorLookRoleForMaterialName('SomeNewMaterialNobodyMapped')).toBeNull();
  });
});

describe('node graph sharing', () => {
  it('returns one shared base material per (look, role)', () => {
    const a = operatorLookBaseMaterial('vanguard-woodland', 'garment');
    const b = operatorLookBaseMaterial('vanguard-woodland', 'garment');
    expect(a).toBe(b);
  });

  it('gives different roles of the same look different graphs', () => {
    const garment = operatorLookBaseMaterial('vanguard-woodland', 'garment');
    const webbing = operatorLookBaseMaterial('vanguard-woodland', 'webbing');
    expect(garment.colorNode).not.toBe(webbing.colorNode);
  });

  it('clones share node identity, so a clone adds no pipeline', () => {
    const base = operatorLookBaseMaterial('marauder-arid', 'garment');
    const clone = cloneOperatorLookMaterial(base);
    expect(clone).not.toBe(base);
    expect(clone.colorNode).toBe(base.colorNode);
    expect(clone.roughnessNode).toBe(base.roughnessNode);
    expect(clone.metalnessNode).toBe(base.metalnessNode);
    expect(clone.customProgramCacheKey()).toBe(base.customProgramCacheKey());
  });

  it('cannot be disguised as a standard material on three 0.185.1', () => {
    // NodeMaterial declares `set type( _value ) {}` - an explicit no-op - so the
    // `material.type = 'MeshStandardMaterial'` guard other modules in this repo
    // document is silently discarded. This test pins the fact, because it is the
    // reason the WebGL2 route is gated out instead of being served node
    // materials that WebGLRenderer cannot compile.
    const base = operatorLookBaseMaterial('marauder-arid', 'garment');
    (base as unknown as { type: string }).type = 'MeshStandardMaterial';
    expect(base.type).toBe('MeshStandardNodeMaterial');
    expect(cloneOperatorLookMaterial(base).type).toBe('MeshStandardNodeMaterial');
  });

  it('is fail-closed until a render backend is declared', () => {
    resetOperatorLookRenderBackendForTest();
    expect(operatorLookMaterialsEnabled()).toBe(false);
    setOperatorLookRenderBackend('webgl2');
    expect(operatorLookMaterialsEnabled()).toBe(false);
    setOperatorLookRenderBackend('webgpu');
    expect(operatorLookMaterialsEnabled()).toBe(true);
    resetOperatorLookRenderBackendForTest();
  });

  it('creates one graph per look-role and no more, however many instances are built', () => {
    const lookIds = OPERATOR_LOOK_REGISTRY.looks.map((look) => look.id);
    for (let i = 0; i < 25; i += 1) {
      for (const lookId of lookIds) {
        for (const role of OPERATOR_LOOK_GARMENT_ROLES) {
          operatorLookInstanceMaterial(lookId, role);
        }
      }
    }
    const expected = operatorLookGraphCount(lookIds, OPERATOR_LOOK_GARMENT_ROLES);
    expect(expected).toBe(lookIds.length * OPERATOR_LOOK_GARMENT_ROLES.length);
    expect(operatorLookCacheStats().graphs).toBe(expected);
    expect(operatorLookCacheStats().materials).toBe(expected);
  });

  it('every reachable look builds all three garment roles without throwing', () => {
    for (const look of OPERATOR_LOOK_REGISTRY.looks) {
      for (const role of OPERATOR_LOOK_GARMENT_ROLES) {
        const material = operatorLookInstanceMaterial(look.id, role);
        expect(material.colorNode, `${look.id}/${role}`).toBeTruthy();
        expect(material.roughnessNode, `${look.id}/${role}`).toBeTruthy();
      }
    }
  });

  it('refuses an unknown look id rather than painting a black operator quietly', () => {
    expect(() => operatorLookBaseMaterial('no-such-look', 'garment')).toThrow(/unknown operator look/);
  });
});

describe('instance materials against the authored garment', () => {
  function authoredGarment(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ name: 'Swat' });
    material.map = new THREE.Texture();
    material.normalMap = new THREE.Texture();
    material.normalScale.set(0.7, 0.7);
    return material;
  }

  it('detaches the authored base-colour map and retains it for recovery', () => {
    const authored = authoredGarment();
    const material = operatorLookInstanceMaterial('vanguard-urban', 'garment', { authored });
    // The procedural graph IS the albedo. Leaving the dark atlas bound as `map`
    // would multiply it back in and restore the exact defect this replaces.
    expect(material.map).toBeNull();
    expect(material.userData.authoredBaseColorMap).toBe(authored.map);
  });

  it('keeps the authored normal map and its scale', () => {
    const authored = authoredGarment();
    const material = operatorLookInstanceMaterial('vanguard-urban', 'garment', { authored });
    expect(material.normalMap).toBe(authored.normalMap);
    expect(material.normalScale.x).toBeCloseTo(0.7, 6);
  });

  it('tags the look and role for evidence capture and debugging', () => {
    const material = operatorLookInstanceMaterial('marauder-nightfall', 'webbing');
    expect(material.userData.operatorLookId).toBe('marauder-nightfall');
    expect(material.userData.operatorLookRole).toBe('webbing');
  });

  it('honours the shipped flatten contract', () => {
    const flat = operatorLookInstanceMaterial('marauder-arid', 'garment', { flattenMaterials: true });
    expect(flat.metalness).toBe(0);
    expect(flat.metalnessNode).toBeNull();
    // Roughness stays a node: flattening must not erase the cue that separates
    // canvas from neoprene, which is what the shipped comment warns about.
    expect(flat.roughnessNode).toBeTruthy();
  });

  it('returns null for materials it does not own, so callers keep their path', () => {
    expect(operatorLookMaterialForAuthored('Visor', 'vanguard-woodland')).toBeNull();
    expect(operatorLookMaterialForAuthored('Skin', 'vanguard-woodland')).toBeNull();
  });

  it('builds a garment material for every shipped skin and team pair', () => {
    for (const skinId of ['default', 'explorer', 'symbiote', 'navalops']) {
      for (const team of [0, 1] as const) {
        const look = resolveOperatorLook(skinId, team);
        const material = operatorLookMaterialForAuthored('Swat', look.id);
        expect(material, `${skinId}/${team}`).toBeInstanceOf(MeshStandardNodeMaterial);
      }
    }
  });
});
