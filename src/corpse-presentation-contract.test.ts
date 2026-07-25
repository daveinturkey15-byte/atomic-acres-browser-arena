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

  it('builds corpses through the same canonical operator path as live players and bots', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain("buildOperator(source.team, 'fallen-operator', flattenOperatorMaterials, source.weapon)");
    expect(main).not.toMatch(/fallen-operator[^\n]*source\.weapon\s*,\s*false/);
  });
});
