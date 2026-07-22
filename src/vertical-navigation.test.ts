import { describe, expect, it } from 'vitest';
import type { ArenaVerticalNavigation } from './vertical-navigation';
import { authoredElevationAt, authoredVerticalRouteTarget } from './vertical-navigation';

const navigation: ArenaVerticalNavigation = {
  routes: [
    { id: 'west-escalator', foot: [-20, 0, -20], top: [-20, 3.34, -28] },
    { id: 'east-escalator', foot: [20, 0, -20], top: [20, 3.34, -28] },
    { id: 'rear-airstair', foot: [21, 0, 2], top: [17, 2.55, 2] },
  ],
  ramps: [
    { id: 'west-escalator', from: [-20, 0, -20], to: [-20, 3.34, -28], width: 3.2 },
    { id: 'jetbridge-ramp', from: [0, 3.32, -2], to: [0, 2.55, 0], width: 3.6 },
  ],
  platforms: [
    { id: 'mezzanine', minX: -26, maxX: 26, minZ: -34, maxZ: -28, y: 3.34 },
    { id: 'cabin', minX: -17.5, maxX: 17.5, minZ: 0, maxZ: 4, y: 2.55 },
  ],
};

describe('authored vertical bot navigation', () => {
  it('interpolates ramps and retains upper surfaces without lifting ground bots through floors', () => {
    expect(authoredElevationAt(navigation, { x: -20, y: 0, z: -20 }, 0)).toBeCloseTo(0);
    expect(authoredElevationAt(navigation, { x: -20, y: 0, z: -24 }, 1.5)).toBeCloseTo(1.67);
    expect(authoredElevationAt(navigation, { x: -20, y: 0, z: -28 }, 3)).toBeCloseTo(3.34);
    expect(authoredElevationAt(navigation, { x: 0, y: 0, z: -30 }, 3.34)).toBeCloseTo(3.34);
    expect(authoredElevationAt(navigation, { x: 0, y: 0, z: -30 }, 0)).toBe(0);
    expect(authoredElevationAt(navigation, { x: 0, y: 0, z: -1 }, 3.32)).toBeCloseTo(2.935);
  });

  it('selects the west escalator for a west-mezzanine target', () => {
    expect(authoredVerticalRouteTarget(
      navigation,
      { x: -24, y: 0, z: -18 },
      { x: -18, y: 5.04, z: -30 },
    )).toEqual({ x: -20, y: 0, z: -20 });
    expect(authoredVerticalRouteTarget(
      navigation,
      { x: -20.2, y: 0, z: -20.1 },
      { x: -18, y: 5.04, z: -30 },
    )).toEqual({ x: -20, y: 3.34, z: -28 });
    expect(authoredVerticalRouteTarget(
      navigation,
      { x: -20, y: 1.67, z: -24 },
      { x: -18, y: 5.04, z: -30 },
    )).toEqual({ x: -20, y: 3.34, z: -28 });
  });

  it('selects the airstair for a cabin target and reverses it for descent', () => {
    expect(authoredVerticalRouteTarget(
      navigation,
      { x: 22, y: 0, z: 8 },
      { x: 12, y: 4.25, z: 2 },
    )).toEqual({ x: 21, y: 0, z: 2 });
    expect(authoredVerticalRouteTarget(
      navigation,
      { x: 17.2, y: 2.55, z: 2 },
      { x: 24, y: 1.7, z: 10 },
    )).toEqual({ x: 21, y: 0, z: 2 });
  });

  it('does not invent a route when both actors are on the same level', () => {
    expect(authoredVerticalRouteTarget(navigation, { x: 0, y: 0, z: 0 }, { x: 10, y: 1.7, z: 10 })).toBeNull();
    expect(authoredVerticalRouteTarget(navigation, { x: 10, y: 3.34, z: -30 }, { x: -10, y: 5.04, z: -30 })).toBeNull();
  });
});
