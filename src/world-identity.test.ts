import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, COVER_LAYOUT, FRONT_HEDGE_FIN_LAYOUT, HOUSE_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import { ARENA_ROUTE_IDENTITIES, routeIdentityForPosition, routeIdentityTelemetry } from './world-identity';

// Frozen Nuke Town gameplay-layout pin.
//
// HISTORY: originally the frozen Pass 78 layout. The owner's HF-383
// instruction ("remove all the bulky items that are in the way of stuff ...
// make it actually true to original") then removed the two garden-mouth
// cover pairs at (+/-12, -/+6.5) in commit 0269334d, superseded by the
// planter-fin pillars at x = +/-4 / +/-13 which own that duty. The pin was
// re-frozen to the post-HF-383 layout AT EQUAL OR GREATER STRICTNESS:
// every export is still pinned exactly, plus three new invariants below --
// the removed pairs must stay removed, cover stays rotationally paired,
// and the mouth-cover duty must demonstrably transfer to the fins.
//
// HF-383 REMAINDER (owner: "maybe make it a tad bigger because it feels a
// little bit clustered"): the map deepened across the street from 60 to
// 63 m; ARENA_BOUNDS minZ/maxZ moved -30/+30 -> -31.5/+31.5 and the rear
// boundary dressing followed the fence out. Houses, cover and spawns keep
// their exact coordinates, so only the bounds row is re-frozen. Proven red
// against the previous freeze before this fixture moved.
const FROZEN_HF383_LAYOUT = {
  bounds: { minX: -31, maxX: 31, minZ: -31.5, maxZ: 31.5 },
  houses: [
    { team: 0, x: 4, z: -17.4, facing: 1 },
    { team: 1, x: -4, z: 17.4, facing: -1 },
  ],
  cover: [
    [-20, -2, 2.4, 3.6], [20, 2, 2.4, 3.6],
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

  it('does not alter the frozen post-HF-383 gameplay layout', () => {
    expect(ARENA_BOUNDS).toEqual(FROZEN_HF383_LAYOUT.bounds);
    expect(HOUSE_LAYOUT).toEqual(FROZEN_HF383_LAYOUT.houses);
    expect(COVER_LAYOUT).toEqual(FROZEN_HF383_LAYOUT.cover);
    expect(SPAWN_LAYOUT).toEqual(FROZEN_HF383_LAYOUT.spawns);
  });

  it('keeps the removed HF-383 garden-mouth cover pairs removed', () => {
    // HF-383 removed the bulky (±12, ∓6.5) garden-mouth cover blocks; they
    // must not silently return through any later staging pass.
    for (const [x] of COVER_LAYOUT) {
      expect(Math.abs(x)).not.toBe(12);
    }
  });

  it('keeps cover rotationally paired under 180-degree symmetry', () => {
    const key = (x: number, z: number) => `${x},${z}`;
    const present = new Set(COVER_LAYOUT.map(([x, z]) => key(x, z)));
    for (const [x, z] of COVER_LAYOUT) {
      expect(present.has(key(-x, -z))).toBe(true);
    }
  });

  it('transfers the garden-mouth cover duty to the planter fins', () => {
    // The removal was only legal because the FRONT_HEDGE_FIN pillars at
    // x = ±4 / ±13 own the mouth-cover duty; if the fins move off those
    // lines the street loses its mid-cover entirely.
    const finXs = FRONT_HEDGE_FIN_LAYOUT.map(({ x }) => x).sort((a, b) => a - b);
    expect(finXs).toEqual([-13, -4, 4, 13]);
  });
});
