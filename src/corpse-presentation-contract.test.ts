import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('canonical corpse presentation contract', () => {
  it('does not retain or expose the retired bounded operator implementation', () => {
    const artKit = readFileSync(new URL('./art-kit.ts', import.meta.url), 'utf8');
    expect(artKit).not.toContain('buildBoundedOperatorLod');
    expect(artKit).not.toContain('bounded-operator-lod');
    expect(artKit).not.toContain('preferRigged');
  });

  it('builds corpses through the same canonical operator path as live players and bots', () => {
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    expect(main).toContain("buildOperator(source.team, 'fallen-operator', flattenOperatorMaterials, source.weapon)");
    expect(main).not.toMatch(/fallen-operator[^\n]*source\.weapon\s*,\s*false/);
  });
});
