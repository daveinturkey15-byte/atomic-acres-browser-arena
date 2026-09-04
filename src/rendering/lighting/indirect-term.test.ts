import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRDF_Lambert, diffuseColor, metalness } from 'three/tsl';

import { TSL_SHARED_MATERIAL_INVENTORY } from '../tsl-migration-inventory';
import {
  evaluateIndirectTerm,
  sharedNuketown2IndirectTerm,
} from './indirect-term';

const FACTORY_MODULES = [
  'src/nuketown2-facade-materials.ts',
  'src/nuketown2-interior-materials.ts',
  'src/nuketown2-street-materials.ts',
  'src/nuketown2-vehicle-materials.ts',
] as const;

function factoryRoster(): readonly { name: string; path: string; source: string }[] {
  return FACTORY_MODULES.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/export function (createNuketown2\w+Material)\s*\(/gu)]
      .map((match) => ({ name: match[1]!, path, source }));
  });
}

describe('Nuke Town SH-L2 ambient choke point', () => {
  it('routes the complete factory roster through the shared material constructor', () => {
    const roster = factoryRoster();
    expect(roster).toHaveLength(24);
    expect(new Set(roster.map(({ name }) => name)).size).toBe(roster.length);
    for (const { name, path, source } of roster) {
      const start = source.indexOf(`export function ${name}`);
      const next = source.indexOf('\nexport function ', start + 1);
      const body = source.slice(start, next < 0 ? source.length : next);
      expect(body, `${path}:${name}`).toContain('createNuketown2IndirectMaterial');
      expect(body, `${path}:${name}`).not.toContain('new MeshStandardNodeMaterial');
    }
  });

  it('records the shared graph as a zero-pipeline TSL traversal entry', () => {
    expect(TSL_SHARED_MATERIAL_INVENTORY).toEqual([
      expect.objectContaining({
        id: 'nuketown2-sh-l2-indirect-materials',
        owner: 'src/rendering/lighting/indirect-term.ts',
        pipelineIds: [],
      }),
    ]);
    expect(TSL_SHARED_MATERIAL_INVENTORY[0]!.factorySources).toEqual(FACTORY_MODULES);
  });

  it('evaluates the enabled, strength and additive bounds in the choke-point contract', () => {
    expect(evaluateIndirectTerm([0.2, 0.4, 0.8], true, 0.5)).toEqual([0.1, 0.18, 0.18]);
    expect(evaluateIndirectTerm([0.2, 0.4, 0.8], false, 0.5)).toEqual([0, 0, 0]);
    expect(evaluateIndirectTerm([99, 99, 99], true, 99)).toEqual([0.18, 0.18, 0.18]);
  });

  it('turns the added term off by uniform state and restores the prior enabled result exactly', () => {
    const graph = sharedNuketown2IndirectTerm();
    graph.setStrength(0.4);
    graph.setEnabled(true);
    const before = graph.receipt();
    graph.setEnabled(false);
    const off = graph.receipt();
    graph.setEnabled(true);
    const restored = graph.receipt();
    expect(off).toMatchObject({ digest: 'unbound', enabled: false, strength: before.strength });
    expect(restored).toEqual(before);
  });

  it('keeps the lighting hook inside the standard material graph', () => {
    const source = readFileSync('src/rendering/lighting/indirect-term.ts', 'utf8');
    expect(source).toContain('override indirectDiffuse');
    expect(source).toContain('BRDF_Lambert');
    expect(source).toContain('reflectedLight.indirectDiffuse.addAssign');
    expect(source).toContain('positionWorld');
    expect(source).toContain('normalWorld');
    expect(source).not.toContain('three/src/nodes/core/PropertyNode');
  });

  it('uses r185 public TSL nodes for the standard diffuse contribution', () => {
    const diffuseContribution = diffuseColor.rgb.mul(metalness.oneMinus());
    const brdf = BRDF_Lambert({ diffuseColor: diffuseContribution });
    expect(typeof diffuseContribution.mul).toBe('function');
    expect(typeof (brdf as unknown as { mul?: unknown }).mul).toBe('function');
  });
});
