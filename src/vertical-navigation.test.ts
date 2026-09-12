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

const stackedNavigation: ArenaVerticalNavigation = {
  routes: [
    { id: 'engine-main', foot: [-6, 0, -6], top: [-6, 3.2, -2] },
    { id: 'main-upper', foot: [6, 3.2, 2], top: [6, 6.2, 6] },
  ],
  ramps: [
    { id: 'engine-main', from: [-6, 0, -6], to: [-6, 3.2, -2], width: 2.2 },
    { id: 'main-upper', from: [6, 3.2, 2], to: [6, 6.2, 6], width: 2.2 },
    { id: 'stacked-engine-main', from: [0, 0, -4], to: [0, 3.2, 4], width: 2.2 },
    { id: 'stacked-main-upper', from: [0, 3.2, -4], to: [0, 6.2, 4], width: 2.2 },
  ],
  platforms: [
    { id: 'engine-deck', minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 0 },
    { id: 'main-deck', minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 3.2 },
    { id: 'upper-cabin', minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 6.2 },
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
    expect(authoredVerticalRouteTarget(navigation, { x: 12, y: 2.55, z: 2 }, { x: 0, y: 5.04, z: -7 })).toBeNull();
    expect(authoredVerticalRouteTarget(navigation, { x: 0, y: 3.34, z: -7 }, { x: 12, y: 4.25, z: 2 })).toBeNull();
  });

  it('retains the nearest of overlapping engine, main, and upper platforms', () => {
    const position = { x: 9, y: 0, z: 0 };
    expect(authoredElevationAt(stackedNavigation, position, 0)).toBe(0);
    expect(authoredElevationAt(stackedNavigation, position, 3.05)).toBe(3.2);
    expect(authoredElevationAt(stackedNavigation, position, 6.05)).toBe(6.2);
    expect(authoredElevationAt(stackedNavigation, { x: 12, y: 0, z: 0 }, 6.2)).toBe(0);
  });

  it('selects the vertically nearest ramp when ramp footprints overlap', () => {
    const overlap = { x: 0, y: 0, z: 0 };
    expect(authoredElevationAt(stackedNavigation, overlap, 0)).toBe(0);
    expect(authoredElevationAt(stackedNavigation, overlap, 1.55)).toBeCloseTo(1.6);
    expect(authoredElevationAt(stackedNavigation, overlap, 4.75)).toBeCloseTo(4.7);
    expect(authoredVerticalRouteTarget(
      stackedNavigation,
      { x: 0, y: 1.6, z: 0 },
      { x: 8, y: 7.9, z: 8 },
    )).toEqual({ x: 0, y: 3.2, z: 4 });
    expect(authoredVerticalRouteTarget(
      stackedNavigation,
      { x: 0, y: 4.7, z: 0 },
      { x: -8, y: 1.7, z: -8 },
    )).toEqual({ x: 0, y: 3.2, z: -4 });
  });

  it('advances engine to main to upper one connected route at a time', () => {
    const upperEye = { x: 9, y: 7.9, z: 9 };
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: -9, y: 0, z: -9 }, upperEye))
      .toEqual({ x: -6, y: 0, z: -6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: -6.2, y: 0, z: -6.1 }, upperEye))
      .toEqual({ x: -6, y: 3.2, z: -2 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: -6, y: 3.2, z: -2 }, upperEye))
      .toEqual({ x: 6, y: 3.2, z: 2 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: 6.1, y: 3.2, z: 2.1 }, upperEye))
      .toEqual({ x: 6, y: 6.2, z: 6 });
  });

  it('advances upper to main to engine one connected route at a time', () => {
    const engineEye = { x: -9, y: 1.7, z: -9 };
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: 9, y: 6.2, z: 9 }, engineEye))
      .toEqual({ x: 6, y: 6.2, z: 6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: 6.1, y: 6.2, z: 6.1 }, engineEye))
      .toEqual({ x: 6, y: 3.2, z: 2 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: 6, y: 3.2, z: 2 }, engineEye))
      .toEqual({ x: -6, y: 3.2, z: -2 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: -6.1, y: 3.2, z: -2.1 }, engineEye))
      .toEqual({ x: -6, y: 0, z: -6 });
  });

  it('classifies standing, crouched, and prone combat eyes on authored levels', () => {
    const actor = { x: -9, y: 0, z: -9 };
    expect(authoredVerticalRouteTarget(stackedNavigation, actor, { x: 0, y: 4.9, z: 0 }))
      .toEqual({ x: -6, y: 0, z: -6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, actor, { x: 9, y: 7.9, z: 9 }))
      .toEqual({ x: -6, y: 0, z: -6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, actor, { x: 9, y: 7.36, z: 9 }))
      .toEqual({ x: -6, y: 0, z: -6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, actor, { x: 9, y: 6.81, z: 9 }))
      .toEqual({ x: -6, y: 0, z: -6 });
    expect(authoredVerticalRouteTarget(stackedNavigation, { x: 9, y: 6.2, z: 9 }, { x: 0, y: 4.36, z: 0 }))
      .toEqual({ x: 6, y: 6.2, z: 6 });
  });
});
