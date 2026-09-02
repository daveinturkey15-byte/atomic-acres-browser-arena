import { describe, expect, it } from 'vitest';
import { PASS65_FLIGHT_NAVIGATION, resolveSupportFlightStep } from './killstreak-flight-navigation';

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, minY: 0, maxY: 12 };

describe('support flight navigation', () => {
  it('treats authored solid mass as no-fly while allowing a real portal gap', () => {
    const wallWithPortal = [
      { minX: -10, maxX: -1, minY: 0, maxY: 8, minZ: -0.3, maxZ: 0.3 },
      { minX: 1, maxX: 10, minY: 0, maxY: 8, minZ: -0.3, maxZ: 0.3 },
    ];
    const throughPortal = resolveSupportFlightStep({
      definition: PASS65_FLIGHT_NAVIGATION['rustworks-1v1'],
      arenaBounds: bounds,
      solids: wallWithPortal,
      from: { x: 0, y: 2, z: -2 },
      desired: { x: 0, y: 2, z: 2 },
      radius: 0.35,
    });
    expect(throughPortal).toMatchObject({ collided: false, recovery: 'direct' });
    expect(throughPortal.position.z).toBe(2);

    const intoWall = resolveSupportFlightStep({
      definition: PASS65_FLIGHT_NAVIGATION['rustworks-1v1'],
      arenaBounds: bounds,
      solids: wallWithPortal,
      from: { x: 4, y: 2, z: -2 },
      desired: { x: 4, y: 2, z: 2 },
      radius: 0.35,
    });
    expect(intoWall.collided).toBe(true);
    expect(intoWall.position.z).toBeLessThan(0);
    expect(intoWall.position).not.toEqual({ x: 4, y: 2, z: -2 });
    expect(intoWall.recovery).not.toBe('hold');
  });

  it('clamps ceilings and deterministically recovers from the same obstruction', () => {
    const input = {
      definition: PASS65_FLIGHT_NAVIGATION['atomic-acres'],
      arenaBounds: bounds,
      solids: [{ minX: -0.5, maxX: 0.5, minY: 0, maxY: 10, minZ: -1, maxZ: 1 }],
      from: { x: -2, y: 2, z: 0 },
      desired: { x: 2, y: 2, z: 0 },
      radius: 0.4,
    } as const;
    const first = resolveSupportFlightStep(input);
    const repeat = resolveSupportFlightStep(input);
    expect(first).toEqual(repeat);
    expect(first.collided).toBe(true);
    const ceiling = resolveSupportFlightStep({ ...input, solids: [], desired: { x: -1, y: 99, z: 0 } });
    expect(ceiling.position.y).toBeLessThanOrEqual(PASS65_FLIGHT_NAVIGATION['atomic-acres'].ceilingY - input.radius);
  });

  it('declares arena-owned nav data for every stable arena identity', () => {
    // owner 2026-08-30: Test1/Test2 arenas added.
    // owner 2026-09-02 (HF-405): Map 3 added.
    expect(Object.keys(PASS65_FLIGHT_NAVIGATION).sort()).toEqual([
      // NUKETOWN2 (HF-407) added 2026-09-02; the list is sorted, so it lands
      // between map3 and rustworks-1v1.
      'atomic-acres', 'farcrysis', 'gun-range', 'high-seas', 'map3', 'nuketown2', 'rustworks-1v1', 'skyline-terminal', 'test1', 'test2',
    ]);
    for (const entry of Object.values(PASS65_FLIGHT_NAVIGATION)) {
      expect(entry.noFlyPolicy).toBe('authoritative-static-and-dynamic-solids');
      // owner 2026-08-30: test1 is a flat open range that deliberately authors
      // no recovery portals — the collider set alone recovers flight there.
      // Every other arena keeps at least one authored hint.
      if (entry.arenaId === 'test1') expect(entry.portals).toHaveLength(0);
      else expect(entry.portals.length).toBeGreaterThan(0);
      expect(Object.isFrozen(entry)).toBe(true);
    }
    expect(PASS65_FLIGHT_NAVIGATION['high-seas']).toMatchObject({
      floorY: 3.2,
      ceilingY: 50,
      portals: [
        { id: 'stern-air-gap', altitudeM: 14 },
        { id: 'bow-air-gap', altitudeM: 14 },
        { id: 'yacht-overflight', altitudeM: 26 },
      ],
    });
  });
});
