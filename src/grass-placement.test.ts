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

  // RED-FIRST PROOF: this pin failed at '2766df53' before this edit (received
  // '788f9625'). The sole cause is ARENA_BOUNDS minZ/maxZ +/-30 -> +/-31.5
  // (commit 9a9bbd7b), the owner-sanctioned HF-383 remainder "maybe make it a
  // tad bigger because it feels a little bit clustered", under which hedge
  // runs, fences and mounds deliberately follow the fence line out. The verge
  // regions are clipped by ARENA_BOUNDS in isGrassGround, so the manicured
  // verges follow the same fence line; the deeper candidate pool changes which
  // shuffled cells fill the fixed 720 slots. Causation isolated via a probe
  // that reproduces '2766df53' exactly under the old bounds - no other input
  // moved. Re-pinned at EQUAL OR GREATER strictness: every original assertion
  // is kept verbatim and a new assertion below pins that placements now cover
  // the deepened |z| in (30, 31.5] strips.
  it('produces a stable private placement checksum without consuming runtime RNG', () => {
    const first = createGrassPlacements([]);
    const second = createGrassPlacements([]);
    expect(first).toEqual(second);
    expect(first.placements).toHaveLength(720);
    expect(first.checksum).toBe('788f9625');
    expect(first.chunks).toBe(4);
    expect(first.placements.every((placement) => isGrassGround(placement.x, placement.z))).toBe(true);
    expect(Math.max(...first.placements.map((placement) => placement.height))).toBeLessThanOrEqual(GRASS_MAX_HEIGHT);
    // NEW behaviour pin (HF-383 Z-deepening): grass must cover the extended
    // back-yard depth behind each spawn, on BOTH verges, or the map shows a
    // bald 1.5 m strip between the old and new fence lines.
    const deepened = first.placements.filter((placement) => Math.abs(placement.z) > 30 && Math.abs(placement.z) <= 31.5);
    expect(deepened.length).toBeGreaterThan(0);
    expect(new Set(deepened.map((placement) => Math.sign(placement.z))).size).toBe(2);
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
