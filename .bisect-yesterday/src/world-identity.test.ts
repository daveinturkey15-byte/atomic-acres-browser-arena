import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, COVER_LAYOUT, HOUSE_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import { ARENA_ROUTE_IDENTITIES, routeIdentityForPosition, routeIdentityTelemetry } from './world-identity';

// Pass 78 Nuke Town fidelity rebuild replaced the frozen Pass 26 layout on the
// owner's direct instruction: the map now measures 62 x 60 m with the two
// houses facing each other across a central street. This block is the new exact
// pin -- the route-identity pass still may not move a single coordinate.
const FROZEN_PASS78_LAYOUT = {
  bounds: { minX: -31, maxX: 31, minZ: -30, maxZ: 30 },
  houses: [
    { team: 0, x: 4, z: -17.4, facing: 1 },
    { team: 1, x: -4, z: 17.4, facing: -1 },
  ],
  cover: [
    [-12, -6.5, 3.6, 2], [12, 6.5, 3.6, 2], [-20, -2, 2.4, 3.6], [20, 2, 2.4, 3.6],
    [-8, -22, 3, 2.2], [8, 22, 3, 2.2], [24, -13, 2.8, 4.4], [-24, 13, 2.8, 4.4],
  ],
  spawns: {
    0: [[-2, -27], [3, -27], [8, -27], [13, -27], [-12, -26], [-17, -24], [-21, -20], [-24, -16], [18, -25], [25, -25], [28, -13], [27, -10]],
    1: [[2, 27], [-3, 27], [-8, 27], [-13, 27], [12, 26], [17, 24], [21, 20], [24, 16], [-18, 25], [-25, 25], [-28, 13], [-27, 10]],
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

  it('does not alter the frozen Pass 78 gameplay layout', () => {
    expect(ARENA_BOUNDS).toEqual(FROZEN_PASS78_LAYOUT.bounds);
    expect(HOUSE_LAYOUT).toEqual(FROZEN_PASS78_LAYOUT.houses);
    expect(COVER_LAYOUT).toEqual(FROZEN_PASS78_LAYOUT.cover);
    expect(SPAWN_LAYOUT).toEqual(FROZEN_PASS78_LAYOUT.spawns);
  });
});
