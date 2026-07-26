import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';

type ProductionEntry = Readonly<{
  id: string;
  releaseState: 'blocked' | 'release-ready';
  currentRuntimeSource?: string;
  blockers?: readonly string[];
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

  it('honestly records the current crossbow and arm art as release blockers', () => {
    const crossbow = manifest.weapons.find((entry) => entry.id === 'explosive-crossbow');
    expect(crossbow).toMatchObject({
      releaseState: 'blocked',
      currentRuntimeSource: 'runtime procedural pistol derivative with added limbs/string',
    });
    expect(crossbow?.blockers).toEqual(expect.arrayContaining([
      'must be a total Blender-authored redesign',
      'needs dedicated compact 1.5x optic',
    ]));
    expect(manifest.operatorArms).toMatchObject({ releaseState: 'blocked' });
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
