import { describe, expect, it } from 'vitest';
import {
  createGrassPlacements,
  evaluateGrassBend,
  grassPlacementAllowed,
  GRASS_MAX_HEIGHT,
  isGrassGround,
} from './grass-placement';

describe('Atomic Acres deterministic manicured-verge placement', () => {
  it('admits only the split green verges and rejects road, bounds, structures and expanded colliders', () => {
    expect(isGrassGround(-20, 0)).toBe(true);
    expect(isGrassGround(20, 0)).toBe(true);
    expect(isGrassGround(0, 0)).toBe(false);
    expect(isGrassGround(-35, 0)).toBe(false);
    expect(grassPlacementAllowed(-9, -28, [])).toBe(false);
    expect(grassPlacementAllowed(-20, 0, [{ minX: -20.2, maxX: -19.8, minZ: -0.2, maxZ: 0.2 }])).toBe(false);
    expect(grassPlacementAllowed(-20, 2, [])).toBe(true);
  });

  it('produces a stable private placement checksum without consuming runtime RNG', () => {
    const first = createGrassPlacements([]);
    const second = createGrassPlacements([]);
    expect(first).toEqual(second);
    expect(first.placements).toHaveLength(720);
    expect(first.checksum).toBe('27c37a93');
    expect(first.chunks).toBe(4);
    expect(first.placements.every((placement) => isGrassGround(placement.x, placement.z))).toBe(true);
    expect(Math.max(...first.placements.map((placement) => placement.height))).toBeLessThanOrEqual(GRASS_MAX_HEIGHT);
  });

  it('keeps wind deterministic and adds only bounded local player reaction', () => {
    const placement = createGrassPlacements([], 1).placements[0];
    const remote = evaluateGrassBend(placement, 3.25, { playerX: 10_000, playerZ: 10_000, radius: 2.65, strength: 1 });
    const repeated = evaluateGrassBend(placement, 3.25, { playerX: 10_000, playerZ: 10_000, radius: 2.65, strength: 1 });
    const local = evaluateGrassBend(placement, 3.25, { playerX: placement.x - 0.2, playerZ: placement.z, radius: 2.65, strength: 1 });
    expect(remote).toEqual(repeated);
    expect(remote.flatten).toBe(0);
    expect(local.flatten).toBeGreaterThan(0.9);
    expect(Math.hypot(local.x, local.z)).toBeLessThan(0.5);
  });
});
