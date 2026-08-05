import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOperator } from './art-kit';

describe('canonical corpse presentation contract', () => {
  it('does not retain or expose the retired bounded operator implementation', () => {
    const artKit = readFileSync(new URL('./art-kit.ts', import.meta.url), 'utf8');
    expect(artKit).not.toContain('buildBoundedOperatorLod');
    expect(artKit).not.toContain('bounded-operator-lod');
    expect(artKit).not.toContain('preferRigged');
    expect(artKit).not.toContain('rigged: false');
  });

  it('fails closed when the canonical rig asset is unavailable', () => {
    expect(() => buildOperator(0, 'missing-canonical-rig'))
      .toThrow(/Canonical rigged operator asset is unavailable.*primitive operator fallback is prohibited/);
  });

  it('prewarms bounded corpses through the canonical rig path and leaves the weapon to its drop presentation', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain("buildOperator(team, 'prewarmed-fallen-operator', flattenOperatorMaterials, 'carbine')");
    expect(main).toContain('if (rig?.weapon) rig.weapon.visible = false');
    expect(main).toContain('pooled.inUse = true');
    expect(main).not.toContain("buildOperator(source.team, 'fallen-operator'");
  });

  it('captures the live weapon before a death drop mutates railgun holder state', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const processDeath = main.slice(main.indexOf('function processDeath('), main.indexOf('function processDeath(') + 3_500);
    const capture = processDeath.indexOf('const fallenOperatorSource = corpseSource(message.victim)');
    const drop = processDeath.indexOf('dropHeldRailgun(message.victim');
    const presentation = processDeath.indexOf('spawnCorpsePresentation(message.victim, fallenOperatorSource)');
    expect(capture).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(capture);
    expect(presentation).toBeGreaterThan(drop);
  });
});
