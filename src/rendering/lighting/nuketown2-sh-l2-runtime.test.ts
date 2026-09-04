import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_SECTION,
  NUKETOWN2_WINDOWS,
} from '../../nuketown2-arena';
import {
  nuketown2SkyPreset,
  resolveNuketown2Sky,
} from '../../nuketown2-lighting';
import {
  DERING_PROBE_DIRECTIONS,
  SH_L2_BYTES_PER_PROBE,
  SH_L2_COEFFICIENTS,
  bakeShL2Volume,
  deriveShL2Grid,
  evaluateShL2,
  evaluateShL2Unclamped,
} from './sh-l2-irradiance';
import { bakeLightingFromNuketown2Sky } from './sh-l2-irradiance-runtime';
import { buildNuketown2ShL2BakeOccluders } from './nuketown2-sh-l2-occluders';
import { vec3 } from '../raytracing/analytic-proxy-scene';

describe('Nuke Town SH-L2 runtime bake', () => {
  it('uses the four authored geometry tables for bake-only occluders', () => {
    const source = readFileSync('src/rendering/lighting/nuketown2-sh-l2-occluders.ts', 'utf8');
    for (const symbol of [
      'NUKETOWN2_SECTION', 'NUKETOWN2_DOORWAYS', 'NUKETOWN2_WINDOWS', 'NUKETOWN2_BUILDING_FOOTPRINTS',
    ]) expect(source, symbol).toContain(symbol);
    expect(source).not.toContain('RAY_TRACED_MAXIMUM_SHAPES');
    expect(source).not.toContain('groundPlaneProxy');

    const scene = buildNuketown2ShL2BakeOccluders();
    expect(scene.shapes.length).toBeGreaterThan(24);
    expect(scene.shapes.every((shape) => shape.kind === 'box')).toBe(true);
    expect(scene.shapes.every((shape) => shape.name.startsWith('sh-l2 '))).toBe(true);
    expect(scene.shapes.some((shape) => shape.name.includes('220'))).toBe(false);
    expect(NUKETOWN2_DOORWAYS.length).toBeGreaterThan(0);
    expect(NUKETOWN2_WINDOWS.length).toBeGreaterThan(0);
    expect(NUKETOWN2_BUILDING_FOOTPRINTS).toHaveLength(2);
    expect(NUKETOWN2_SECTION.houseWidth).toBeGreaterThan(0);
  });

  it('scales the bake lighting from resolveNuketown2Sky real lux entries', () => {
    const input = { arenaId: 'nuketown2' as const, fixedHour: 10.5 };
    const resolved = resolveNuketown2Sky(input);
    const entry = nuketown2SkyPreset(resolved.presetId);
    const anchor = nuketown2SkyPreset('golden-hour');
    const lighting = bakeLightingFromNuketown2Sky(input);
    expect(resolved.presetId).toBe('late-morning');
    expect(lighting.sunColour[1]).toBeCloseTo(entry.directIlluminanceLux / anchor.directIlluminanceLux, 8);
    expect(lighting.skyZenithColour[1]).toBeCloseTo(resolved.skyIlluminanceLux / anchor.skyIlluminanceLux, 8);
    expect(lighting.sunColour[1]).toBeGreaterThan(6);
    expect(lighting.skyZenithColour[1]).toBeGreaterThan(2);
  });

  it('keeps the interior station at least 25 percent darker than the exterior probe', () => {
    const occluders = buildNuketown2ShL2BakeOccluders();
    const house = NUKETOWN2_BUILDING_FOOTPRINTS.find(({ id }) => id === 'house')!;
    const interior = vec3((house.x0 + house.x1) / 2, 4, (house.z0 + house.z1) / 2 + 1);
    const exterior = vec3(interior[0], interior[1], house.z1 + 3);
    const lighting = bakeLightingFromNuketown2Sky({ arenaId: 'nuketown2', fixedHour: 10.5 });

    const averageAt = (position: ReturnType<typeof vec3>): number => {
      const grid = deriveShL2Grid({ minM: position, maxM: position }, { spacingM: 2, heightM: 0.01, paddingM: 0 });
      const volume = bakeShL2Volume({
        arenaId: 'nuketown2', conditionId: 'interior-ratio', grid, lighting, occluders,
        raysPerProbe: 256, bounces: 1, seed: 0x51_12,
      });
      return [0, 1, 2].reduce((sum, channel) => sum + evaluateShL2(
        volume.coefficients, channel * 9, vec3(0, 1, 0),
      ), 0) / 3;
    };

    const interiorMean = averageAt(interior);
    const exteriorMean = averageAt(exterior);
    expect(interiorMean, 'interior / exterior ratio').toBeLessThan(exteriorMean * 0.75);
  });

  it('checks relative dering across fixed probes from the real arena bake', () => {
    const occluders = buildNuketown2ShL2BakeOccluders();
    const lighting = bakeLightingFromNuketown2Sky({ arenaId: 'nuketown2', fixedHour: 10.5 });
    const positions = [
      vec3(-7, 4, -5), vec3(-3, 2, -10), vec3(4, 4, -4), vec3(8, 3, -9),
      vec3(-7, 4, 27), vec3(0, 1.6, 20), vec3(8, 3, 29), vec3(14, 2, 8),
    ];
    const grid = {
      originM: positions[0], spacingM: vec3(2, 2, 2),
      dimensions: Object.freeze([1, 1, 1]) as unknown as readonly [number, number, number],
      probeCount: 1, band: 'l2' as const, bytes: SH_L2_BYTES_PER_PROBE,
    };
    let demoted = 0;
    for (const position of positions) {
      const volume = bakeShL2Volume({
        arenaId: 'nuketown2', conditionId: 'real-arena-dering',
        grid: { ...grid, originM: position }, lighting, occluders,
        raysPerProbe: 128, bounces: 1, seed: 0x51_12,
      });
      demoted += volume.bake.demotedProbes;
      for (let channel = 0; channel < 3; channel += 1) {
        const offset = channel * SH_L2_COEFFICIENTS;
        for (const direction of DERING_PROBE_DIRECTIONS) {
          const l1 = evaluateShL2Unclamped(volume.coefficients, offset, direction, 1);
          const l2 = evaluateShL2Unclamped(volume.coefficients, offset, direction, 2);
          expect(l2).toBeGreaterThanOrEqual(Math.min(0, l1) - 1e-6);
        }
      }
    }
    expect(positions).toHaveLength(8);
    expect(demoted).toBe(0);
  });
});
