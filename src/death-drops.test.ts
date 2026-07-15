import { describe, expect, it } from 'vitest';
import { consumeDeathDrop, createDeathDrop, nearestDeathDrop, pruneDeathDrops } from './death-drops';

describe('death-drop inventory contract', () => {
  it('replenishes a matching weapon once and clamps reserve to the weapon maximum', () => {
    const drop = createDeathDrop('death-1', 'sniper', { x: 1, y: 0, z: 1 }, 5, 99, 1_000);
    const result = consumeDeathDrop(drop, { primary: 'sniper', ammo: 2, reserve: 24 }, 25, 1_100);
    expect(result.consumed).toBe(true);
    expect(result.mode).toBe('replenish');
    expect(result.inventory).toEqual({ primary: 'sniper', ammo: 2, reserve: 25 });
    expect(consumeDeathDrop(result.drop, result.inventory, 25, 1_200).consumed).toBe(false);
  });

  it('swaps to a different dropped primary with bounded ammunition', () => {
    const drop = createDeathDrop('death-2', 'sniper', { x: 0, y: 0, z: 0 }, 50, 50, 1_000);
    const result = consumeDeathDrop(drop, { primary: 'carbine', ammo: 30, reserve: 90 }, 25, 1_100);
    expect(result.consumed).toBe(true);
    expect(result.mode).toBe('pickup');
    expect(result.inventory).toEqual({ primary: 'sniper', ammo: 5, reserve: 25 });
  });

  it('finds only a live nearby drop and prunes expired or overflow entries', () => {
    const drops = [
      createDeathDrop('a', 'carbine', { x: 1, y: 0, z: 0 }, 10, 10, 0),
      createDeathDrop('b', 'smg', { x: 8, y: 0, z: 0 }, 10, 10, 0),
      createDeathDrop('c', 'scattergun', { x: 0.5, y: 0, z: 0 }, 2, 4, -30_000),
    ];
    expect(nearestDeathDrop(drops, { x: 0, y: 0, z: 0 }, 2.35, 1_000)?.id).toBe('a');
    expect(pruneDeathDrops(drops, 1_000, 1).map((drop) => drop.id)).toEqual(['a']);
  });
});
