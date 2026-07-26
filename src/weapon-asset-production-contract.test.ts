import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';

type ProductionEntry = Readonly<{
  id: string;
  releaseState: 'blocked' | 'release-ready';
  currentRuntimeSource?: string;
  blockers?: readonly string[];
  firstPersonGlbs?: readonly { path: string; sha256: string; triangles: number }[];
  worldGlbs?: readonly { path: string; sha256: string; triangles: number }[];
  dropGlbs?: readonly { path: string; sha256: string; triangles: number }[];
  actions?: readonly string[];
  pbrMaps?: Readonly<Record<string, { path: string; sha256: string }>>;
  opticMagnification?: number;
  materialContract?: string;
}>;

const manifest = JSON.parse(readFileSync('source-assets/blender/pass65-weapon-production.manifest.json', 'utf8')) as {
  releaseGate: string;
  forbiddenReleaseFallbacks: readonly string[];
  requiredPbrMaps: readonly string[];
  requiredSockets: readonly string[];
  requiredCoreActions: readonly string[];
  operatorArms: ProductionEntry;
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

  it('releases only the structurally audited Blender crossbow and opaque rigged arms tranche', () => {
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
    });
    expect(manifest.operatorArms.firstPersonGlbs).toHaveLength(2);
    expect(manifest.operatorArms.actions).toEqual(expect.arrayContaining([...manifest.requiredCoreActions]));
    expect(manifest.weapons.filter((entry) => entry.id !== 'explosive-crossbow')
      .every((entry) => entry.releaseState === 'blocked')).toBe(true);
    expect(manifest.supportVehicles.map((entry) => entry.id)).toEqual([
      'hunter-drone-visual-family-v1', 'chopper-gunner-vehicle-v1', 'support-aircraft-family-v1',
    ]);
    expect(manifest.supportVehicles.find((entry) => entry.id === 'hunter-drone-visual-family-v1')).toMatchObject({
      releaseState: 'release-ready',
    });
    expect(manifest.supportVehicles.filter((entry) => entry.id !== 'hunter-drone-visual-family-v1')
      .every((entry) => entry.releaseState === 'blocked')).toBe(true);
  });
});
