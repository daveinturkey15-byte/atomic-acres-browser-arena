import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, CENTRAL_BUS, COVER_LAYOUT, HOUSE_LAYOUT, PARKED_VAN_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
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
// FULL-STEP REDESIGN 2026-08-29: D1 fixed (end-to-end flow, 68 x 57).
// LAYOUT v3 same day, after owner HITL ("you didn't adjust its layout or
// make it more similar to the black ops 2 nuketown"): the HOUSES move to
// their team ends and become the spawn shields, garages flank the
// mid-street, every hedge/fence/mannequin is deleted by direct instruction,
// and bounds grow to 74 x 60. Every row re-frozen at the v3 exact values;
// prior freezes are in git history at this file.
const FROZEN_HF383_LAYOUT = {
  bounds: { minX: -37, maxX: 37, minZ: -30, maxZ: 30 },
  houses: [
    { team: 0, x: -19, z: -17.4, facing: 1 },
    { team: 1, x: 19, z: 17.4, facing: -1 },
  ],
  cover: [
    // v5 re-freeze (owner 2026-08-30 "jump ontop of both boxes outside bus
    // to then get on buss roof"): the street pair becomes the two-step crate
    // stairway onto the 2.25 m bus roof. Tall pair at |z| 1.6 so the vans'
    // standable cover cells stay clear (measured 0.11 m clip at 1.3).
    [-10.1, -1.3, 1.7, 2.2], [10.1, 1.3, 1.7, 2.2],
    [-8.1, -1.6, 1.7, 2.2], [8.1, 1.6, 1.7, 2.2],
    [-9, -26, 3, 2.2], [9, 26, 3, 2.2], [27, -13, 2.8, 4.4], [-27, 13, 2.8, 4.4],
  ],
  spawns: {
    0: [
      [-35.5, -20], [-35.5, -12], [-35.5, -4], [-35.5, 4], [-35.5, 12], [-35.5, 20],
      [-33.5, -16], [-33.5, -8], [-33.5, 0], [-33.5, 8], [-33.5, 16],
      [-34.5, 23],
    ],
    1: [
      [35.5, 20], [35.5, 12], [35.5, 4], [35.5, -4], [35.5, -12], [35.5, -20],
      [33.5, 16], [33.5, 8], [33.5, 0], [33.5, -8], [33.5, -16],
      [34.5, -23],
    ],
  },
};

const STREET_LANE_LIMIT = 6.5;

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
    // v3: the guard retired - it pinned the FIN-era garden-mouth pairs at
    // |x| = 12, a class deleted with the maze; the v3 street crates at
    // (+/-12, -/+2) are the new mid-street furniture, not a fin return
    // (different z, different size, frozen above).
    // v5: 8 rows - the street pair split into the low+tall stair crates.
    expect(COVER_LAYOUT.length).toBe(8);
  });

  it('keeps cover rotationally paired under 180-degree symmetry', () => {
    const key = (x: number, z: number) => `${x},${z}`;
    const present = new Set(COVER_LAYOUT.map(([x, z]) => key(x, z)));
    for (const [x, z] of COVER_LAYOUT) {
      expect(present.has(key(-x, -z))).toBe(true);
    }
  });

  it('transfers the street mid-cover duty to the bus and mid-street vans', () => {
    // REDESIGN 2026-08-29: the planter fins are gone with the rest of the
    // cross-flow maze. The street's mid-cover duty for the new end-to-end
    // flow belongs to the reference's own furniture: the central bus and the
    // two vans staggered flush against its ends. If any of the three leaves
    // the street centre, the road becomes a single uncontested lane.
    expect(CENTRAL_BUS.x).toBe(0);
    expect(CENTRAL_BUS.z).toBe(0);
    const vanXs = PARKED_VAN_LAYOUT.map(({ x }) => x).sort((a, b) => a - b);
    expect(vanXs).toEqual([-8.6, 8.6]);
    for (const van of PARKED_VAN_LAYOUT) expect(Math.abs(van.z)).toBeLessThan(STREET_LANE_LIMIT);
  });
});
