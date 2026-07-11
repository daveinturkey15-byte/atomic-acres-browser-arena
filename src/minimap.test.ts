import { describe, expect, it } from 'vitest';
import { shouldRevealEnemy, worldToMinimap } from './minimap';

const bounds = { minX: -40, maxX: 40, minZ: -50, maxZ: 50 };

describe('worldToMinimap', () => {
  it('maps arena corners and centre with north up', () => {
    expect(worldToMinimap(-40, -50, bounds, 180, 180)).toEqual([0, 180]);
    expect(worldToMinimap(40, 50, bounds, 180, 180)).toEqual([180, 0]);
    expect(worldToMinimap(0, 0, bounds, 180, 180)).toEqual([90, 90]);
  });

  it('clamps out-of-bounds positions to the map frame', () => {
    expect(worldToMinimap(100, -100, bounds, 180, 180)).toEqual([180, 180]);
  });
});

describe('enemy reveal policy', () => {
  it('reveals close enemies and recent gunfire but not distant quiet enemies', () => {
    expect(shouldRevealEnemy(12, 10_000, 0)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 8_000)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 2_000)).toBe(false);
  });
});
