import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';
import { WEAPON_CATALOG } from './combat/weapon-catalog';

type ProductionEntry = Readonly<{
  id: string;
  displayName?: string;
  designId?: string;
  silhouetteFamily?: string;
  platformAnatomy?: string;
  releaseState: 'blocked' | 'release-ready';
  currentRuntimeSource?: string;
  blockers?: readonly string[];
  firstPersonGlbs?: readonly {
    path: string;
    sha256: string;
    triangles: number;
    skinnedMeshNodes?: number;
    renderPrimitives?: number;
    sourceWeightedParts?: number;
    bones?: number;
  }[];
  worldGlbs?: readonly { path: string; sha256: string; triangles: number; renderPrimitives?: number }[];
  dropGlbs?: readonly { path: string; sha256: string; triangles: number; renderPrimitives?: number }[];
  actions?: readonly string[];
  pbrMaps?: Readonly<Record<string, { path: string; sha256: string }>>;
  opticMagnification?: number;
  materialContract?: string;
  visualRevision?: string;
  materialLanguage?: string;
  review?: Readonly<{
    renders?: readonly { cameraId: string; path: string; sha256: string }[];
  }>;
  renderBudget?: Readonly<{
    maxSkinnedRenderableMeshesPerLod: number;
    maxSkinnedPrimitivesPerLod: number;
    sourceWeightedParts: number;
    boneCount: number;
    batchingPolicy: string;
  }>;
}>;

const manifest = JSON.parse(readFileSync('source-assets/blender/pass65-weapon-production.manifest.json', 'utf8')) as {
  releaseGate: string;
  forbiddenReleaseFallbacks: readonly string[];
  requiredPbrMaps: readonly string[];
  requiredSockets: readonly string[];
  requiredCoreActions: readonly string[];
  operatorArms: ProductionEntry;
  meleeWeapons: readonly ProductionEntry[];
  supportVehicles: readonly ProductionEntry[];
  weapons: readonly ProductionEntry[];
};

describe('Pass 65 Blender weapon and operator production gate', () => {
  it('tracks every shipped weapon exactly once and fails closed', () => {
    expect(manifest.releaseGate).toBe('fail-closed-until-every-entry-is-release-ready');
    expect(manifest.weapons.map((entry) => entry.id).sort()).toEqual([...WEAPON_IDS].sort());
    expect(new Set(manifest.weapons.map((entry) => entry.id)).size).toBe(WEAPON_IDS.length);
  });

  it('requires complete PBR, socket, action, LOD and provenance production rather than a shared hero fallback', () => {
    expect(manifest.requiredPbrMaps).toEqual(['baseColor', 'normal', 'roughness', 'metallic']);
    expect(manifest.requiredSockets).toEqual(expect.arrayContaining(['rightGrip', 'leftGrip', 'magazine', 'muzzle', 'eject', 'optic']));
    expect(manifest.requiredCoreActions).toEqual(expect.arrayContaining(['ads-in', 'ads-out', 'fire', 'reload', 'empty-reload', 'inspect']));
    expect(manifest.forbiddenReleaseFallbacks).toEqual(expect.arrayContaining([
      'shared-generic-hero-model',
      'runtime-procedural-hero-weapon',
      'unrigged-or-see-through-first-person-arms',
    ]));
  });

  it('releases the structurally audited unique Blender firearm corpus, crossbow and opaque rigged arms', () => {
    const crossbow = manifest.weapons.find((entry) => entry.id === 'explosive-crossbow');
    expect(crossbow).toMatchObject({
      releaseState: 'release-ready',
      currentRuntimeSource: 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb',
      opticMagnification: 1.5,
    });
    expect(crossbow?.firstPersonGlbs).toHaveLength(2);
    expect(crossbow?.worldGlbs).toHaveLength(3);
    expect(crossbow?.dropGlbs).toHaveLength(1);
    expect(crossbow?.firstPersonGlbs?.[0].triangles).toBeGreaterThan(crossbow?.firstPersonGlbs?.[1].triangles ?? Infinity);
    expect(crossbow?.worldGlbs?.[0].triangles).toBeGreaterThan(crossbow?.worldGlbs?.[1].triangles ?? Infinity);
    expect(crossbow?.worldGlbs?.[1].triangles).toBeGreaterThan(crossbow?.worldGlbs?.[2].triangles ?? Infinity);
    expect(crossbow?.actions).toEqual(expect.arrayContaining([...manifest.requiredCoreActions]));
    expect(Object.keys(crossbow?.pbrMaps ?? {})).toEqual(expect.arrayContaining([...manifest.requiredPbrMaps]));
    expect(manifest.operatorArms).toMatchObject({
      releaseState: 'release-ready',
      materialContract: 'opaque-depth-writing',
      currentRuntimeSource: 'public/assets/original/models/operators/pass65-first-person-arms-lod0.glb',
      visualRevision: 'human-anatomy-m4-contact-v4',
      limbProfileContract: 'human-deltoid-brachioradialis-ulna-wrist-taper-v4',
      handPoseContract: 'separate-palm-thumb-index-resting-digit-grip-v4',
      shoulderEntryContract: 'tapered-offscreen-sleeve',
      gloveConstructionContract: 'opaque-articulated-knuckle-pads-seams-cloth-v4',
      weaponGripReviewContract: 'm4a1-neutral-ads-reload-contact-v4',
      fingerSegmentCount: 30,
      weaponGripReviewFrames: 3,
    });
    expect(manifest.operatorArms.review?.renders?.map((render) => render.cameraId)).toEqual(expect.arrayContaining([
      'neutral-front', 'forearm-wrist-quarter', 'hand-anatomy-closeup',
      'm4a1-neutral-contact', 'm4a1-ads-contact', 'm4a1-reload-contact',
    ]));
    expect(manifest.operatorArms.firstPersonGlbs).toHaveLength(2);
    expect(manifest.operatorArms.renderBudget).toEqual({
      maxSkinnedRenderableMeshesPerLod: 6,
      maxSkinnedPrimitivesPerLod: 6,
      sourceWeightedParts: 45,
      boneCount: 37,
      batchingPolicy: 'one-shared-armature-batch-per-material',
    });
    for (const lod of manifest.operatorArms.firstPersonGlbs ?? []) {
      expect(lod.skinnedMeshNodes).toBe(4);
      expect(lod.renderPrimitives).toBe(4);
      expect(lod.skinnedMeshNodes).toBeGreaterThanOrEqual(1);
      expect(lod.skinnedMeshNodes).toBeLessThanOrEqual(6);
      expect(lod.renderPrimitives).toBeGreaterThanOrEqual(1);
      expect(lod.renderPrimitives).toBeLessThanOrEqual(6);
      expect(lod.sourceWeightedParts).toBe(45);
      expect(lod.bones).toBe(37);
    }
    expect(manifest.operatorArms.actions).toEqual(expect.arrayContaining([...manifest.requiredCoreActions]));
    expect(manifest.meleeWeapons).toHaveLength(1);
    expect(manifest.meleeWeapons[0]).toMatchObject({
      id: 'field-knife',
      releaseState: 'release-ready',
      currentRuntimeSource: 'public/assets/original/models/weapons/pass65-field-knife/pass65-field-knife-fp-lod0.glb',
    });
    expect(manifest.meleeWeapons[0].firstPersonGlbs).toHaveLength(2);
    expect(manifest.meleeWeapons[0].worldGlbs).toHaveLength(2);
    expect(manifest.meleeWeapons[0].dropGlbs).toHaveLength(1);
    expect(manifest.weapons.every((entry) => entry.releaseState === 'release-ready')).toBe(true);
    const catalogNames = new Map(WEAPON_CATALOG.map((weapon) => [weapon.id, weapon.displayName]));
    for (const weapon of manifest.weapons.filter((entry) => entry.id !== 'explosive-crossbow')) {
      expect(weapon.displayName).toBe(catalogNames.get(weapon.id as (typeof WEAPON_IDS)[number]));
      expect(weapon.currentRuntimeSource).toBe(
        `public/assets/original/models/weapons/pass65-firearms/${weapon.id}/${weapon.id}-fp-lod0.glb`,
      );
      expect(weapon.designId).toBeTruthy();
      expect(weapon.silhouetteFamily).toBeTruthy();
      expect(weapon.visualRevision).toBe(
        weapon.id === 'm4a1' ? 'm4a1-production-hero-v3' : 'platform-production-hero-v4',
      );
      expect(weapon.materialLanguage).toBe(
        weapon.id === 'm4a1' ? 'm4a1-anodized-metal-polymer-pbr-v3' : 'platform-authentic-metal-polymer-pbr-v4',
      );
      expect(weapon.review?.renders?.map((render) => render.cameraId)).toEqual(expect.arrayContaining([
        'hero-quarter', 'side-silhouette', 'sight-line', 'reload-action',
        'world-lod0-silhouette', 'world-lod2-silhouette', 'drop-lod0-silhouette',
      ]));
      expect(weapon.review?.renders?.map((render) => (
        'evidenceRole' in render ? render.evidenceRole : undefined
      ))).toEqual(expect.arrayContaining([
        'first-person-neutral', 'first-person-side-silhouette', 'first-person-ads',
        'first-person-reload', 'world-near-silhouette', 'world-far-lod-silhouette',
        'drop-silhouette',
      ]));
      expect(weapon.firstPersonGlbs).toHaveLength(2);
      expect(weapon.worldGlbs).toHaveLength(3);
      expect(weapon.dropGlbs).toHaveLength(1);
      expect(weapon.firstPersonGlbs?.[0].triangles).toBeGreaterThan(weapon.firstPersonGlbs?.[1].triangles ?? Infinity);
      expect(weapon.worldGlbs?.[0].triangles).toBeGreaterThan(weapon.worldGlbs?.[1].triangles ?? Infinity);
      expect(weapon.worldGlbs?.[1].triangles).toBeGreaterThan(weapon.worldGlbs?.[2].triangles ?? Infinity);
      for (const delivery of [...(weapon.firstPersonGlbs ?? []), ...(weapon.worldGlbs ?? [])]) {
        expect(delivery.renderPrimitives).toBeGreaterThanOrEqual(4);
        expect(delivery.renderPrimitives).toBeLessThanOrEqual(16);
      }
      for (const delivery of weapon.dropGlbs ?? []) {
        expect(delivery.renderPrimitives).toBeGreaterThanOrEqual(4);
        expect(delivery.renderPrimitives).toBeLessThanOrEqual(12);
      }
      expect(weapon.actions).toEqual(expect.arrayContaining([...manifest.requiredCoreActions]));
      expect(Object.keys(weapon.pbrMaps ?? {})).toEqual(expect.arrayContaining([
        ...manifest.requiredPbrMaps, 'polymerBaseColor', 'polymerRoughness', 'polymerMetallic',
      ]));
    }
    expect(new Set(manifest.weapons.filter((entry) => entry.id !== 'explosive-crossbow')
      .map((entry) => entry.designId)).size).toBe(WEAPON_IDS.length - 1);
    expect(new Set(manifest.weapons.filter((entry) => entry.id !== 'explosive-crossbow')
      .map((entry) => entry.platformAnatomy)).size).toBe(WEAPON_IDS.length - 1);
    expect(manifest.supportVehicles.map((entry) => entry.id)).toEqual([
      'hunter-drone-visual-family-v1', 'chopper-gunner-vehicle-v1', 'support-aircraft-family-v1',
    ]);
    expect(manifest.supportVehicles.find((entry) => entry.id === 'hunter-drone-visual-family-v1')).toMatchObject({
      releaseState: 'release-ready',
    });
    expect(manifest.supportVehicles.every((entry) => entry.releaseState === 'release-ready')).toBe(true);
  });
});
