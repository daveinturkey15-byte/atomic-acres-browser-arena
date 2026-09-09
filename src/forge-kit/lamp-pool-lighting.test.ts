import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyLampPoolLighting, getLampPoolMaterial, lampPoolNightVisibility, LAMP_POOL_OPACITY } from './lamp-pool';

afterEach(() => applyLampPoolLighting('nuketown2', 22));

describe('daylight lamp-pool presentation', () => {
  it('retains original full-strength radial alpha at night and bounds daytime glare', () => {
    expect(LAMP_POOL_OPACITY).toBe(0.95);
    for (const hour of [0, 3, 6, 20, 22, 24]) expect(lampPoolNightVisibility(hour)).toBe(1);
    for (const hour of [8, 12, 17.6, 18]) expect(lampPoolNightVisibility(hour)).toBe(0.12);
    expect(lampPoolNightVisibility(19)).toBe(0.56);
    expect(lampPoolNightVisibility(7)).toBe(0.56);
  });

  it('wraps midnight continuously and keeps invalid input at the safe original strength', () => {
    for (let hour = -48; hour <= 48; hour += 0.1) {
      const visibility = lampPoolNightVisibility(hour);
      expect(visibility).toBeGreaterThanOrEqual(0.12);
      expect(visibility).toBeLessThanOrEqual(1);
      expect(visibility).toBeCloseTo(lampPoolNightVisibility(hour + 24), 10);
    }
    for (const hour of [NaN, Infinity, -Infinity]) expect(lampPoolNightVisibility(hour)).toBe(1);
  });

  it('changes only opacity on the same material and restores it across arena reentry', () => {
    const material = getLampPoolMaterial();
    const graph = material.colorNode;
    const version = material.version;
    applyLampPoolLighting('nuketown2', 17.6);
    expect(material.opacity).toBe(0.12);
    applyLampPoolLighting('map3', 17.6);
    expect(material.opacity).toBe(1);
    applyLampPoolLighting('nuketown2', 17.6);
    expect(material.opacity).toBe(0.12);
    applyLampPoolLighting('nuketown2', 22);
    expect(material.opacity).toBe(1);
    expect(getLampPoolMaterial()).toBe(material);
    expect(material.colorNode).toBe(graph);
    expect(material.version).toBe(version);
  });

  it('is wired once to the existing peer-derived lighting transaction', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(source.match(/applyLampPoolLighting\(selectedArena\.id, writes\.hour\)/g)).toHaveLength(1);
    expect(source).toContain("import { applyLampPoolLighting } from './forge-kit/lamp-pool'");
  });
});
