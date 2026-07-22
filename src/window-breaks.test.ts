import { describe, expect, it } from 'vitest';
import { segmentIntersectsBox, type Box2 } from './collision';
import { selectPlayableWindowApproach, windowBreakPathBlocked } from './window-breaks';

const bounds: Box2 = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

describe('breakable-window admission geometry', () => {
  it('ignores only collider contact behind the pane endpoint but keeps real mid-path cover', () => {
    const origin = { x: 0, y: 1.6, z: 4 };
    const centre = { x: 0, y: 1.6, z: 0 };
    const behindPane: Box2 = { minX: -2, maxX: 2, minZ: -0.3, maxZ: 0, minY: 0, maxY: 3 };
    expect(segmentIntersectsBox(origin, centre, behindPane)).toBe(false);
    expect(windowBreakPathBlocked(origin, centre, [behindPane])).toBe(false);

    const realCover: Box2 = { minX: -2, maxX: 2, minZ: 1.5, maxZ: 2, minY: 0, maxY: 3 };
    expect(windowBreakPathBlocked(origin, centre, [realCover])).toBe(true);
  });

  it('selects an in-bounds playable side when the requested exterior pose crosses the arena edge', () => {
    const approach = selectPlayableWindowApproach(
      { x: -13.8, y: 1.565, z: -36.22 },
      { x: -9, z: -28 },
      bounds,
      [],
      4,
    );
    expect(approach).not.toBeNull();
    expect(approach!.z).toBeGreaterThanOrEqual(bounds.minZ + 0.44);
    expect(approach!.z).toBeLessThan(-36.22);
  });

  it('falls back to the opposite playable side when solid cover blocks the preferred approach', () => {
    const centre = { x: 0, y: 1.6, z: 10 };
    const preferredBlocker: Box2 = { minX: -2, maxX: 2, minZ: 11, maxZ: 13, minY: 0, maxY: 3 };
    const approach = selectPlayableWindowApproach(centre, { x: 0, z: 0 }, bounds, [preferredBlocker], 3);
    expect(approach).toEqual({ x: 0, y: 1.6, z: 7 });
  });
});
