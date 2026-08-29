import { describe, expect, it } from 'vitest';
import {
  createGrassPlacements,
  evaluateGrassBend,
  grassPlacementAllowed,
  GRASS_MAX_HEIGHT,
  HARD_SURFACE_HALF_DEPTH_M,
  isGrassGround,
} from './grass-placement';

describe('Atomic Acres deterministic manicured-verge placement', () => {
  // manicured-verges-v4 (Pass 82): the v3 regions pre-dated the Pass 78 axis
  // flip - the street now runs ALONG X with asphalt at |z| <= 6.5, kerbs to
  // 7.7 and pavements to 8.8, but the v3 west/east bands at |x| > 14.2 spanned
  // the whole Z range, so (+/-20, 0) - the MIDDLE OF THE ROAD near each street
  // end - counted as grass ground and both grass consumers grew blades on the
  // asphalt while the back yards stayed bald. v4 re-derives the two lawn
  // bands from the layout authority (everything between the pavement edge and
  // the boundary fence). The old (+/-20, 0) probes are kept, inverted, as the
  // regression pin for exactly that defect.
  it('admits only the yard/verge lawn bands and rejects road, kerb, pavement, bounds, structures and expanded colliders', () => {
    expect(isGrassGround(-20, -20)).toBe(true); // west back yard
    expect(isGrassGround(20, 20)).toBe(true); // east back yard
    expect(isGrassGround(0, -10)).toBe(true); // verge strip behind the north hedge line
    expect(isGrassGround(-20, 0)).toBe(false); // asphalt (v3 grew grass here)
    expect(isGrassGround(20, 0)).toBe(false); // asphalt (v3 grew grass here)
    expect(isGrassGround(0, 0)).toBe(false); // asphalt, street centre
    expect(isGrassGround(-20, -7.1)).toBe(false); // kerbstone band
    expect(isGrassGround(-20, 8.25)).toBe(false); // pavement band
    expect(isGrassGround(-35, 0)).toBe(false); // out of bounds
    expect(isGrassGround(0, -32)).toBe(false); // beyond the boundary fence
    expect(grassPlacementAllowed(4, -17.4, [])).toBe(false); // aqua house footprint
    expect(grassPlacementAllowed(-17.7, 12.5, [])).toBe(false); // garage footprint
    expect(grassPlacementAllowed(-20, -20, [{ minX: -20.2, maxX: -19.8, minZ: -20.2, maxZ: -19.8 }])).toBe(false);
    expect(grassPlacementAllowed(-20, -20, [])).toBe(true);
  });

  // RED-FIRST PROOF (v4, Pass 82): this pin failed at '788f9625' before this
  // edit (received 'e034370e'), with every other assertion in this file and
  // the grass-system suite green. The sole cause is GRASS_GROUND_REGIONS
  // moving to the manicured-verges-v4 lawn bands (see grass-placement.ts):
  // same candidate lattice, same 720-slot fill, same hashes - only the
  // region rectangles the candidates map into changed, which is the entire
  // point of the pass ("grass must NOT grow on asphalt, kerb or pavement").
  // Re-pinned at GREATER strictness: every original assertion is kept and the
  // new hard-surface exclusion pin below is one the v3 layout could never
  // pass.
  // (v3 proof retained: '2766df53' -> '788f9625' was the HF-383 bounds
  // deepening, isolated the same way.)
  // REDESIGN 2026-08-29 (docs/NUKETOWN_REDESIGN_2026-08-29.md):
  // 'e034370e' -> 'cdef22cf'. Same isolation: the lawn bands derive from
  // ARENA_BOUNDS, which became 68 x 57 when the flow rotated end-to-end;
  // lattice, slot count (720), chunking (4) and every other assertion are
  // unchanged and re-verified here at the new bands.
  it('produces a stable private placement checksum without consuming runtime RNG', () => {
    const first = createGrassPlacements([]);
    const second = createGrassPlacements([]);
    expect(first).toEqual(second);
    expect(first.placements).toHaveLength(720);
    expect(first.checksum).toBe('cdef22cf');
    expect(first.chunks).toBe(4);
    expect(first.placements.every((placement) => isGrassGround(placement.x, placement.z))).toBe(true);
    expect(Math.max(...first.placements.map((placement) => placement.height))).toBeLessThanOrEqual(GRASS_MAX_HEIGHT);
    // Behaviour pin kept from HF-383, re-seated by the 2026-08-29 redesign:
    // spawns moved to the +/-X end gardens and the Z bounds tightened to
    // +/-28.5, so the deep-lawn duty this guarded is now the last 1.5 m of
    // both rear lawns against the new boundary.
    const deepened = first.placements.filter((placement) => Math.abs(placement.z) > 27 && Math.abs(placement.z) <= 28.5);
    expect(deepened.length).toBeGreaterThan(0);
    expect(new Set(deepened.map((placement) => Math.sign(placement.z))).size).toBe(2);
    // NEW hard-surface pin (Pass 82): no placement may sit on the asphalt,
    // kerbstone or pavement band. |z| < 8.8 is the full hard-surface half
    // depth (STREET_HALF_WIDTH 6.5 + kerb 1.2 + sidewalk 1.1); v3 placed
    // dozens of blades inside it at both street ends.
    expect(first.placements.every((placement) => Math.abs(placement.z) >= HARD_SURFACE_HALF_DEPTH_M)).toBe(true);
    // And both lawn bands must actually be populated.
    expect(new Set(first.placements.map((placement) => Math.sign(placement.z))).size).toBe(2);
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
