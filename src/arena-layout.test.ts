import { describe, expect, it } from 'vitest';
import {
  ARENA_BOUNDS,
  CENTRAL_BUS,
  COVER_LAYOUT,
  GARAGE_LAYOUT,
  HOUSE_LAYOUT,
  NEIGHBOURHOOD_BENCH_COLLIDER_SIZE,
  NEIGHBOURHOOD_BENCH_LAYOUT,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  PATROL_LAYOUT,
  SPAWN_LAYOUT,
  STREET_HALF_WIDTH,
  YARD_FENCE_LAYOUT,
} from './arena-layout';
import { movementProfile } from './gameplay';
import { circleIntersectsBox, segmentIntersectsBox } from './collision';

const inside = ([x, z]: readonly [number, number], margin = 0) =>
  x >= ARENA_BOUNDS.minX + margin && x <= ARENA_BOUNDS.maxX - margin
  && z >= ARENA_BOUNDS.minZ + margin && z <= ARENA_BOUNDS.maxZ - margin;

const rotated = (points: ReadonlyArray<readonly [number, number]>) =>
  points.every(([x, z]) => points.some(([ox, oz]) => Math.abs(ox + x) < 1e-6 && Math.abs(oz + z) < 1e-6));

const sprint = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true }).maxSpeed;

describe('compact original arena layout', () => {
  it('measures 62 by 60 metres, small enough to cross corner to corner in ten seconds', () => {
    expect(ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX).toBe(62);
    expect(ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ).toBe(60);
    const diagonal = Math.hypot(
      ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX,
      ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ,
    );
    expect(diagonal).toBeLessThan(90);
    // The reference map's whole character is that it is small. Sprinting a
    // straight diagonal must stay inside ten seconds, and a full lap of the
    // perimeter inside thirty.
    expect(diagonal / sprint).toBeLessThan(10);
    const lapSeconds = (2 * ((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) + (ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ))) / sprint;
    expect(lapSeconds).toBeGreaterThan(25);
    expect(lapSeconds).toBeLessThan(30);
  });

  it('faces the two houses at each other across the central street', () => {
    const [north, south] = HOUSE_LAYOUT;
    const HOUSE_DEPTH = 16.4;
    expect(north.facing).toBe(1);
    expect(south.facing).toBe(-1);
    // One house on each kerb, fronts opposed, with an open road between them.
    expect(Math.sign(north.z)).toBe(-1);
    expect(Math.sign(south.z)).toBe(1);
    const frontGap = Math.abs(south.z - north.z) - HOUSE_DEPTH;
    expect(frontGap).toBeGreaterThan(14);
    expect(frontGap).toBeLessThan(22);
    // Neither house may stand in the carriageway.
    for (const house of HOUSE_LAYOUT) {
      expect(Math.abs(house.z) - HOUSE_DEPTH / 2).toBeGreaterThan(STREET_HALF_WIDTH);
    }
    // A garage is attached to each house rather than parked in a far corner.
    for (const [index, garage] of GARAGE_LAYOUT.entries()) {
      expect(Math.sign(garage.z)).toBe(Math.sign(HOUSE_LAYOUT[index].z));
      expect(Math.abs(garage.x - HOUSE_LAYOUT[index].x)).toBeLessThan(16);
    }
  });

  it('parks exactly one bus in the middle of the road as central hard cover', () => {
    expect(CENTRAL_BUS.x).toBe(0);
    expect(CENTRAL_BUS.z).toBe(0);
    const [length, , width] = CENTRAL_BUS.size;
    // Broadside along the street, and fully inside the carriageway.
    expect(length).toBeGreaterThan(width);
    expect(width / 2).toBeLessThan(STREET_HALF_WIDTH);
    // It must actually break the straight road sightline between the two ends.
    expect(segmentIntersectsBox(
      { x: ARENA_BOUNDS.minX + 1, y: 1.7, z: 0 },
      { x: ARENA_BOUNDS.maxX - 1, y: 1.7, z: 0 },
      { minX: -length / 2, maxX: length / 2, minY: 0, maxY: CENTRAL_BUS.size[1], minZ: -width / 2, maxZ: width / 2 },
    )).toBe(true);
  });

  it('is 180-degree rotationally symmetric in every gameplay layer', () => {
    expect(rotated(COVER_LAYOUT.map(([x, z]) => [x, z] as const))).toBe(true);
    expect(rotated(PATROL_LAYOUT)).toBe(true);
    expect(rotated(NEIGHBOURHOOD_BIN_POSITIONS)).toBe(true);
    expect(rotated(NEIGHBOURHOOD_BENCH_LAYOUT.map(([x, z]) => [x, z] as const))).toBe(true);
    expect(rotated(YARD_FENCE_LAYOUT.map(([x, z]) => [x, z] as const))).toBe(true);
    expect(rotated(GARAGE_LAYOUT.map((garage) => [garage.x, garage.z] as const))).toBe(true);
    // Neither team may inherit a better spawn set than the other.
    expect(SPAWN_LAYOUT[0].every(([x, z]) => (
      SPAWN_LAYOUT[1].some(([ox, oz]) => Math.abs(ox + x) < 1e-6 && Math.abs(oz + z) < 1e-6)
    ))).toBe(true);
    expect(COVER_LAYOUT.every(([x, z, w, d]) => COVER_LAYOUT.some(([ox, oz, ow, od]) => (
      Math.abs(ox + x) < 1e-6 && Math.abs(oz + z) < 1e-6 && ow === w && od === d
    )))).toBe(true);
  });

  it('provides at least twenty good authored spawns with ten or more choices per team', () => {
    expect(SPAWN_LAYOUT[0].length).toBeGreaterThanOrEqual(10);
    expect(SPAWN_LAYOUT[1].length).toBeGreaterThanOrEqual(10);
    expect(SPAWN_LAYOUT[0].length + SPAWN_LAYOUT[1].length).toBeGreaterThanOrEqual(20);
  });

  it('keeps every authored spawn and patrol centre inside radius-aware bounds', () => {
    expect([...SPAWN_LAYOUT[0], ...SPAWN_LAYOUT[1]].every((point) => inside(point, 0.44))).toBe(true);
    expect(PATROL_LAYOUT.every((point) => inside(point, 0.44))).toBe(true);
  });

  it('keeps each team spawning on its own side of the street', () => {
    expect(SPAWN_LAYOUT[0].every(([, z]) => z < -STREET_HALF_WIDTH)).toBe(true);
    expect(SPAWN_LAYOUT[1].every(([, z]) => z > STREET_HALF_WIDTH)).toBe(true);
  });

  it('keeps the east patrol turn clear of the authored service wall', () => {
    const serviceWall = { minX: 22.15, maxX: 22.85, minY: 0, maxY: 1.5, minZ: 4, maxZ: 14 };
    const turn = PATROL_LAYOUT[5];
    expect(circleIntersectsBox(turn[0], turn[1], 0.44, serviceWall)).toBe(false);
    const previous = PATROL_LAYOUT[4];
    expect(segmentIntersectsBox(
      { x: previous[0], y: 0.8, z: previous[1] },
      { x: turn[0], y: 0.8, z: turn[1] },
      serviceWall,
      0.44,
    )).toBe(false);
  });

  it('blocks the opposing primary-spawn ray with the central bus', () => {
    const [a] = SPAWN_LAYOUT[0];
    const [b] = SPAWN_LAYOUT[1];
    // Short map: the two primary spawns are close, so the bus has to do the work.
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(60);
    const [length, height, width] = CENTRAL_BUS.size;
    expect(segmentIntersectsBox(
      { x: a[0], y: 1.7, z: a[1] },
      { x: b[0], y: 1.7, z: b[1] },
      { minX: -length / 2, maxX: length / 2, minY: 0, maxY: height, minZ: -width / 2, maxZ: width / 2 },
    )).toBe(true);
  });

  it('owns collision layouts for every player-sized street prop', () => {
    expect(NEIGHBOURHOOD_BENCH_LAYOUT).toHaveLength(4);
    expect(NEIGHBOURHOOD_BIN_POSITIONS).toHaveLength(6);
    expect(NEIGHBOURHOOD_BENCH_LAYOUT.every(([x, z]) => inside([x, z], 0.5))).toBe(true);
    expect(NEIGHBOURHOOD_BIN_POSITIONS.every((point) => inside(point, 0.4))).toBe(true);
    expect(NEIGHBOURHOOD_BENCH_COLLIDER_SIZE).toEqual([2.5, 1.34, 0.72]);
    expect(NEIGHBOURHOOD_BIN_COLLIDER_SIZE).toEqual([0.78, 1.08, 0.72]);
  });
});
