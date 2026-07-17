import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, COVER_LAYOUT, HOUSE_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import { ARENA_ROUTE_IDENTITIES, routeIdentityForPosition, routeIdentityTelemetry } from './world-identity';

const FROZEN_PASS26_LAYOUT = {
  bounds: { minX: -34, maxX: 34, minZ: -43, maxZ: 43 },
  houses: [
    { team: 0, x: -9, z: -28, facing: 1 },
    { team: 1, x: 9, z: 28, facing: -1 },
  ],
  cover: [
    [-13, -11, 3.5, 2], [13, 11, 3.5, 2], [-15, 4, 3, 3], [15, -4, 3, 3],
    [-21, 17, 4, 2], [21, -17, 4, 2], [-24, -4, 3, 5], [24, 4, 3, 5],
  ],
  spawns: {
    0: [[-20, -30], [-24, -30], [-27, -22], [-21, -18], [3, -40], [3, -34], [4, -27], [6, -20], [22, -39], [27, -33], [24, -26], [28, -24]],
    1: [[6, 38], [24, 30], [27, 22], [21, 18], [-3, 40], [-3, 34], [-4, 27], [-6, 20], [-22, 39], [-27, 33], [-24, 26], [-28, 24]],
  },
};

describe('Pass 27 world identity contract', () => {
  it('defines exactly three distinct macro-route roles with original landmarks', () => {
    expect(ARENA_ROUTE_IDENTITIES.map(({ id, role, label, landmark }) => ({ id, role, label, landmark }))).toEqual([
      { id: 'west-cultivation', role: 'concealed-flank', label: 'VERDANT ARRAY', landmark: 'hydroponics-greenhouse' },
      { id: 'central-transit', role: 'broad-exposed', label: 'CIVIC TRANSIT', landmark: 'civil-defence-transit' },
      { id: 'east-service', role: 'technical-cover', label: 'HELIO SERVICE', landmark: 'solar-battery-yard' },
    ]);
    expect(new Set(ARENA_ROUTE_IDENTITIES.flatMap((route) => [route.primaryColor, route.secondaryColor])).size).toBe(6);
  });

  it('classifies west, central and east consistently at route boundaries', () => {
    expect(routeIdentityForPosition(-17.01).id).toBe('west-cultivation');
    expect(routeIdentityForPosition(-17).id).toBe('central-transit');
    expect(routeIdentityForPosition(0).id).toBe('central-transit');
    expect(routeIdentityForPosition(17).id).toBe('central-transit');
    expect(routeIdentityForPosition(17.01).id).toBe('east-service');
  });

  it('keeps every presentation cue inside the authoritative arena bounds', () => {
    const telemetry = routeIdentityTelemetry();
    expect(telemetry.pass).toBe('world-identity-27');
    expect(telemetry.routes).toHaveLength(3);
    expect(telemetry.cuesInsideBounds).toBe(true);
    for (const route of ARENA_ROUTE_IDENTITIES) expect(route.cuePositions).toHaveLength(3);
  });

  it('does not alter the frozen Pass 26 gameplay layout', () => {
    expect(ARENA_BOUNDS).toEqual(FROZEN_PASS26_LAYOUT.bounds);
    expect(HOUSE_LAYOUT).toEqual(FROZEN_PASS26_LAYOUT.houses);
    expect(COVER_LAYOUT).toEqual(FROZEN_PASS26_LAYOUT.cover);
    expect(SPAWN_LAYOUT).toEqual(FROZEN_PASS26_LAYOUT.spawns);
  });
});
