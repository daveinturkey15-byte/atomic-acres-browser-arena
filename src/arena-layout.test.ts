import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, HOUSE_LAYOUT, PATROL_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import { circleIntersectsBox, segmentIntersectsBox } from './collision';

const inside = ([x, z]: readonly [number, number], margin = 0) =>
  x >= ARENA_BOUNDS.minX + margin && x <= ARENA_BOUNDS.maxX - margin
  && z >= ARENA_BOUNDS.minZ + margin && z <= ARENA_BOUNDS.maxZ - margin;

describe('compact original arena layout', () => {
  it('measures 68 by 86 metres with roughly 59 metres between house centres', () => {
    expect(ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX).toBe(68);
    expect(ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ).toBe(86);
    const [a, b] = HOUSE_LAYOUT;
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(58.82, 1);
  });

  it('keeps every authored spawn and patrol centre inside radius-aware bounds', () => {
    expect([...SPAWN_LAYOUT[0], ...SPAWN_LAYOUT[1]].every((point) => inside(point, 0.44))).toBe(true);
    expect(PATROL_LAYOUT.every((point) => inside(point, 0.44))).toBe(true);
  });

  it('keeps the east patrol turn clear of the authored service wall', () => {
    const serviceWall = { minX: 22.15, maxX: 22.85, minY: 0, maxY: 1.5, minZ: 4, maxZ: 14 };
    const turn = PATROL_LAYOUT[4];
    expect(circleIntersectsBox(turn[0], turn[1], 0.44, serviceWall)).toBe(false);
    const previous = PATROL_LAYOUT[3];
    expect(segmentIntersectsBox(
      { x: previous[0], y: 0.8, z: previous[1] },
      { x: turn[0], y: 0.8, z: turn[1] },
      serviceWall,
      0.44,
    )).toBe(false);
  });

  it('blocks the opposing primary-spawn ray with the original central coach', () => {
    const [a] = SPAWN_LAYOUT[0];
    const [b] = SPAWN_LAYOUT[1];
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(60);
    expect(segmentIntersectsBox(
      { x: a[0], y: 1.7, z: a[1] },
      { x: b[0], y: 1.7, z: b[1] },
      { minX: -6.5, maxX: -1.1, minY: 0, maxY: 3.5, minZ: 0, maxZ: 14 },
    )).toBe(true);
  });
});
