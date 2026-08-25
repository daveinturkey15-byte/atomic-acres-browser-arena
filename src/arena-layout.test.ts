import { describe, expect, it } from 'vitest';
import {
  ARENA_BOUNDS,
  CENTRAL_BUS,
  CORNER_HEDGE_LAYOUT,
  COVER_LAYOUT,
  FRONT_HEDGE_FIN_LAYOUT,
  FRONT_HEDGE_FIN_SIZE,
  FRONT_HEDGE_LAYOUT,
  GARAGE_LAYOUT,
  HOUSE_LAYOUT,
  NEIGHBOURHOOD_BENCH_COLLIDER_SIZE,
  NEIGHBOURHOOD_BENCH_LAYOUT,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  PARKED_VAN_LAYOUT,
  PARKED_VAN_SIZE,
  PATROL_LAYOUT,
  REAR_HEDGE_LAYOUT,
  SIDE_HEDGE_LAYOUT,
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
  it('measures 62 by 63 metres, crossed corner to corner in barely over ten seconds', () => {
    expect(ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX).toBe(62);
    // HF-383 remainder ("maybe make it a tad bigger because it feels a
    // little bit clustered"): the map deepened from 60 to 63 m across the
    // street, giving each back yard 1.5 m more depth behind its spawns.
    // The street canyon itself is untouched, so every exact seam pin below
    // still measures the same geometry.
    expect(ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ).toBe(63);
    const diagonal = Math.hypot(
      ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX,
      ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ,
    );
    expect(diagonal).toBeLessThan(90);
    // The reference map's whole character is that it is small. Sprinting a
    // straight diagonal must stay inside ten seconds, and a full lap of the
    // perimeter inside thirty. HF-383 note: an in-flight uniform 1.05 scale-up
    // briefly relaxed the diagonal gate to <11 s; that weakening was rejected
    // then, and this deeper-but-narrower growth does NOT revive it: the new
    // pin is two-sided at 10..10.5 s - above the old envelope to pin the
    // owner-requested growth (proven red at 10.16 s against the old <10 s),
    // below 10.5 s to keep the sprint-crossing character.
    expect(diagonal / sprint).toBeGreaterThan(10);
    expect(diagonal / sprint).toBeLessThan(10.5);
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
    // HF-383 completion: the hedge/fin/van layers were previously only
    // symmetric by collider audit (nuketown-traversal); they are pinned here
    // at the authored-constant level too so a future edit cannot break one
    // side silently. Strictness only increases: no prior assertion removed.
    expect(rotated(FRONT_HEDGE_LAYOUT.map((hedge) => [hedge.x, hedge.z] as const))).toBe(true);
    expect(rotated(FRONT_HEDGE_FIN_LAYOUT.map((fin) => [fin.x, fin.z] as const))).toBe(true);
    expect(rotated(REAR_HEDGE_LAYOUT.map((hedge) => [hedge.x, hedge.z] as const))).toBe(true);
    expect(rotated(CORNER_HEDGE_LAYOUT.map((block) => [block.x, block.z] as const))).toBe(true);
    expect(rotated(SIDE_HEDGE_LAYOUT.map((hedge) => [hedge.x, hedge.z] as const))).toBe(true);
    expect(rotated(HOUSE_LAYOUT.map((house) => [house.x, house.z] as const))).toBe(true);
    expect(rotated(PARKED_VAN_LAYOUT.map((van) => [van.x, van.z] as const))).toBe(true);
    // Segment lengths must pair too, not just centres: a longer north run vs
    // a shorter south twin would be asymmetric cover even with matched keys.
    expect(FRONT_HEDGE_LAYOUT.every((hedge) => FRONT_HEDGE_LAYOUT.some((twin) => (
      Math.abs(twin.x + hedge.x) < 1e-6 && Math.abs(twin.z + hedge.z) < 1e-6 && twin.length === hedge.length
    )))).toBe(true);
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

const vanBounds = ({ x, z }: { x: number; z: number }) => {
  const [length, height, width] = PARKED_VAN_SIZE;
  return { minX: x - length / 2, maxX: x + length / 2, minY: 0, maxY: height, minZ: z - width / 2, maxZ: z + width / 2 };
};

describe('mid-street vehicle staging (HF-383)', () => {
  const PLAYER_DIAMETER = 0.88;

  it('stages both street vehicles midfield as a staggered mid-street pair', () => {
    expect(PARKED_VAN_LAYOUT).toHaveLength(2);
    const [east, west] = PARKED_VAN_LAYOUT;
    // BO2's signature read: the bus owns the road centre and the two civilian
    // vehicles sit IN THE MIDDLE OF THE STREET beside its ends, staggered
    // diagonally opposite one another - not tucked away at the kerbs
    // (HF-383: "put the two vehicles that are open or whatever in the middle
    // of the street").
    expect(east.x).toBeGreaterThan(0);
    expect(west.x).toBeLessThan(0);
    for (const van of PARKED_VAN_LAYOUT) {
      expect(Math.abs(van.x)).toBeLessThanOrEqual(12);
      expect(van.z).not.toBe(0);
      // MID-STREET, not kerb-side: each vehicle's centre stays within the
      // bus's own road-footprint band. Proven red against the superseded
      // kerb-side staging, whose centres sat at |z| = 5.55.
      expect(Math.abs(van.z)).toBeLessThanOrEqual(CENTRAL_BUS.size[2] / 2);
      const [, , width] = PARKED_VAN_SIZE;
      expect(Math.abs(van.z) + width / 2).toBeLessThanOrEqual(STREET_HALF_WIDTH);
    }
    expect(east.z * west.z).toBeLessThan(0);
    // Exact 180-degree rotational symmetry, like every other gameplay layer.
    expect(Math.abs(east.x + west.x)).toBeLessThan(1e-6);
    expect(Math.abs(east.z + west.z)).toBeLessThan(1e-6);
  });

  it('seats each mid-street vehicle without pocketing a player against the bus or a planter pillar', () => {
    const [busLength, busHeight, busWidth] = CENTRAL_BUS.size;
    const bus = { minX: -busLength / 2, maxX: busLength / 2, minY: 0, maxY: busHeight, minZ: -busWidth / 2, maxZ: busWidth / 2 };
    const [, finHeight, finDepth] = FRONT_HEDGE_FIN_SIZE;
    const blockers = [
      { id: 'central-bus', ...bus },
      ...FRONT_HEDGE_FIN_LAYOUT.map((fin, i) => ({
        id: `planter-${i}`,
        minX: fin.x - FRONT_HEDGE_FIN_SIZE[0] / 2,
        maxX: fin.x + FRONT_HEDGE_FIN_SIZE[0] / 2,
        minY: 0,
        maxY: finHeight,
        minZ: fin.z - finDepth / 2,
        maxZ: fin.z + finDepth / 2,
      })),
    ];
    for (const van of PARKED_VAN_LAYOUT) {
      const bounds = vanBounds(van);
      // No volume overlap with any street blocker.
      for (const blocker of blockers) {
        const overlaps = bounds.minX < blocker.maxX && bounds.maxX > blocker.minX
          && bounds.minZ < blocker.maxZ && bounds.maxZ > blocker.minZ;
        expect(overlaps, `${van.id} must not overlap ${blocker.id}`).toBe(false);
      }
      // Every seam the vehicle forms with a neighbour must be one of exactly
      // two safe shapes - FLUSH (nothing to enter) or a GENUINE WALK-THROUGH
      // LANE (wide enough for a player capsule plus margin to pass cleanly).
      // Anything between is a wedge pocket: a body can partially enter but
      // not traverse. Repinned for the HF-383 mid-street staging: the
      // previous pin only audited the kerb seam and the bus flank, because
      // the kerb-side seating had no other neighbours. A mid-street vehicle
      // faces blockers on BOTH sides, so this pin audits every facing seam
      // against the bus AND every planter pillar - strictly more coverage
      // than the pin it replaces, at the same walk-lane minimum.
      // Proven red before repinning: the retired kerb-side van sat 0.20 m
      // from the x=4 planter pillar - a wedge this audit rejects outright.
      const WALK_LANE_MINIMUM = PLAYER_DIAMETER + 0.4;
      for (const blocker of blockers) {
        const dx = Math.max(blocker.minX - bounds.maxX, bounds.minX - blocker.maxX);
        const dz = Math.max(blocker.minZ - bounds.maxZ, bounds.minZ - blocker.maxZ);
        // Only axis-facing neighbours form a seam; diagonal neighbours do not.
        if (dx >= 0 && dz >= 0) continue;
        const seam = Math.max(dx, dz);
        const flushSeam = seam <= 0.001;
        const walkThroughLane = seam >= WALK_LANE_MINIMUM;
        expect(flushSeam || walkThroughLane, `${van.id} <-> ${blocker.id} seam ${seam.toFixed(3)} m is a wedge pocket`).toBe(true);
      }
    }
  });

  it('breaks the eye-line from each bus-end crossing mouth to the opposite yard gap', () => {
    const northVan = PARKED_VAN_LAYOUT.find((van) => van.z < 0);
    const southVan = PARKED_VAN_LAYOUT.find((van) => van.z > 0);
    expect(northVan).toBeDefined();
    expect(southVan).toBeDefined();
    // Exiting the bus east end towards the north yard hedge gap now crosses
    // the north-kerb vehicle instead of running clean.
    expect(segmentIntersectsBox(
      { x: 7.2, y: 1.7, z: 0 },
      { x: 5, y: 1.7, z: -8.5 },
      vanBounds(northVan!),
    )).toBe(true);
    expect(segmentIntersectsBox(
      { x: -7.2, y: 1.7, z: 0 },
      { x: -5, y: 1.7, z: 8.5 },
      vanBounds(southVan!),
    )).toBe(true);
  });
});
