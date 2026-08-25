import { describe, expect, it, vi } from 'vitest';

// TEMPORARY diagnostic: prove the grass checksum drift is caused solely by the
// HF-383 ARENA_BOUNDS Z growth (+/-30 -> +/-31.5), not by any accidental break.
vi.mock('./arena-layout', () => ({
  ARENA_BOUNDS: Object.freeze({ minX: -31, maxX: 31, minZ: -30, maxZ: 30 }),
  HOUSE_LAYOUT: Object.freeze([
    Object.freeze({ team: 0 as const, x: 4, z: -17.4, facing: 1 as const }),
    Object.freeze({ team: 1 as const, x: -4, z: 17.4, facing: -1 as const }),
  ]),
  GARAGE_LAYOUT: Object.freeze([
    Object.freeze({ x: 17.7, z: -12.5 }),
    Object.freeze({ x: -17.7, z: 12.5 }),
  ]),
}));

import { createGrassPlacements } from './grass-placement';

describe('causation probe (pre-HF-383 bounds)', () => {
  it('reproduces the originally pinned checksum under the old bounds', () => {
    const result = createGrassPlacements([]);
    expect(result.checksum).toBe('2766df53');
    expect(result.placements).toHaveLength(720);
    expect(result.chunks).toBe(4);
  });
});
