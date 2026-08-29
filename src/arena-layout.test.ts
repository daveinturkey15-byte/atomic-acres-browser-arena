import * as THREE from 'three';
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
  PARKED_VAN_LAYOUT,
  PARKED_VAN_SIZE,
  PATROL_LAYOUT,
  SPAWN_LAYOUT,
  STREET_HALF_WIDTH,
} from './arena-layout';
import { movementProfile } from './gameplay';
import { circleIntersectsBox, segmentIntersectsBox } from './collision';
import { buildArena } from './map';
import { CharacterPhysics, STANCE_SHAPES } from './physics';
import { solidBounds } from './house-navigation';

const inside = ([x, z]: readonly [number, number], margin = 0) =>
  x >= ARENA_BOUNDS.minX + margin && x <= ARENA_BOUNDS.maxX - margin
  && z >= ARENA_BOUNDS.minZ + margin && z <= ARENA_BOUNDS.maxZ - margin;

const rotated = (points: ReadonlyArray<readonly [number, number]>) =>
  points.every(([x, z]) => points.some(([ox, oz]) => Math.abs(ox + x) < 1e-6 && Math.abs(oz + z) < 1e-6));

const sprint = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true }).maxSpeed;

describe('compact original arena layout', () => {
  it('measures 74 by 60 metres, crossed corner to corner in about eleven seconds', () => {
    // v3 (owner HITL 2026-08-29): "you didn't make the playable map any
    // bigger" - bounds grow to 74 x 60 by direct owner instruction, so the
    // sprint bands re-derive from the measured geometry rather than the
    // reference's own timings: 95.3 m diagonal, 10.95 s at 8.7 m/s.

    // REDESIGN 2026-08-29 (docs/NUKETOWN_REDESIGN_2026-08-29.md): length moves
    // onto the STREET axis where the reference keeps it; the across-street
    // depth gives back what the sideways design had borrowed. The diagonal
    // sprint band below holds UNCHANGED - 68 x 57 was sized to it: 88.73 m
    // diagonal, 10.20 s at 8.7 m/s, inside the same 10..10.5 s pin that
    // rejected a straight scale-up once already.
    expect(ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX).toBe(74);
    expect(ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ).toBe(60);
    const diagonal = Math.hypot(
      ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX,
      ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ,
    );
    expect(diagonal).toBeLessThan(96);
    // The reference map's whole character is that it is small. Sprinting a
    // straight diagonal must stay inside ten seconds, and a full lap of the
    // perimeter inside thirty. HF-383 note: an in-flight uniform 1.05 scale-up
    // briefly relaxed the diagonal gate to <11 s; that weakening was rejected
    // then, and this deeper-but-narrower growth does NOT revive it: the new
    // pin is two-sided at 10..10.5 s - above the old envelope to pin the
    // owner-requested growth (proven red at 10.16 s against the old <10 s),
    // below 10.5 s to keep the sprint-crossing character.
    expect(diagonal / sprint).toBeGreaterThan(10);
    expect(diagonal / sprint).toBeLessThan(11.2);
    const lapSeconds = (2 * ((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) + (ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ))) / sprint;
    expect(lapSeconds).toBeGreaterThan(27);
    expect(lapSeconds).toBeLessThan(32); // v3 74x60: measured 30.8 s
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
    expect(rotated(GARAGE_LAYOUT.map((garage) => [garage.x, garage.z] as const))).toBe(true);
    // v3 (owner HITL 2026-08-29): the hedge and fence layers are DELETED, so
    // their symmetry rows go with them - the surviving layers above and the
    // houses/vans below still pin every remaining gameplay set.
    expect(rotated(HOUSE_LAYOUT.map((house) => [house.x, house.z] as const))).toBe(true);
    expect(rotated(PARKED_VAN_LAYOUT.map((van) => [van.x, van.z] as const))).toBe(true);
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

  it('keeps each team spawning in its own END yard behind its own house', () => {
    // v3: the fences are gone (owner HITL); the HOUSE is the spawn shield
    // now, so every spawn must sit strictly beyond its own team's house
    // rear line - the reference's anatomy.
    const houseRearX = Math.max(...HOUSE_LAYOUT.map((house) => Math.abs(house.x))) + 10.5;
    expect(SPAWN_LAYOUT[0].every(([x]) => x < -33)).toBe(true);
    expect(SPAWN_LAYOUT[1].every(([x]) => x > 33)).toBe(true);
    expect(houseRearX).toBeLessThanOrEqual(33.5); // spawns clear the house envelope
  });

  it('keeps the east patrol turn clear of the coral garage plot', () => {
    // v3: the service wall is long gone; the nearest authored plot to the
    // east patrol turn is the coral garage. Same capsule-clearance pin.
    const coralGarage = { minX: 1.5, maxX: 8.7, minY: 0, maxY: 3.3, minZ: 9.2, maxZ: 15.8 };
    const turn = PATROL_LAYOUT[5];
    expect(circleIntersectsBox(turn[0], turn[1], 0.44, coralGarage)).toBe(false);
    const previous = PATROL_LAYOUT[4];
    expect(segmentIntersectsBox(
      { x: previous[0], y: 0.8, z: previous[1] },
      { x: turn[0], y: 0.8, z: turn[1] },
      coralGarage,
      0.44,
    )).toBe(false);
  });

  it('blocks the opposing primary-spawn ray with the central bus', () => {
    const [a] = SPAWN_LAYOUT[0];
    const [b] = SPAWN_LAYOUT[1];
    // REDESIGN: the primary spawns face each other down the full street, so
    // the separation GROWS (76.3 m measured) - the point of the end-to-end
    // flow - and the bus still owns the block, since the primary ray crosses
    // the origin by 180-degree symmetry. Bounded above by the map diagonal.
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(60);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(90);
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
    // REDESIGN 2026-08-29: the planter pillars are gone; a mid-street van's
    // real neighbours are the bus and its own twin. Auditing the twin is new
    // coverage the pillar era never had.
    const blockers = [
      { id: 'central-bus', ...bus },
      ...PARKED_VAN_LAYOUT.map((other) => ({ id: `${other.id}-twin`, ...vanBounds(other) })),
    ];
    for (const van of PARKED_VAN_LAYOUT) {
      const bounds = vanBounds(van);
      // No volume overlap with any street blocker.
      for (const blocker of blockers) {
        if (blocker.id === `${van.id}-twin`) continue; // a van is not its own pocket
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

/**
 * HF-387 player-body half: the live first-person camera is
 * PerspectiveCamera(76, 1, 0.08, 180), so any visible surface closer than
 * 0.08 m to the eye shears through the near plane and reads as "clipping
 * through the wall". The audit that found these defects marched the real
 * CharacterPhysics into every wall-like visible surface; these pins hold the
 * two defect classes it measured closed.
 */
describe('HF-387 prone/wall camera clearance', () => {
  const CAMERA_NEAR_PLANE = 0.08;

  async function pressedEye(
    physics: CharacterPhysics,
    stance: 'stand' | 'crouch' | 'prone',
    start: { x: number; y: number; z: number },
    dir: { x: number; z: number },
    slide?: { x: number; z: number },
  ): Promise<{ x: number; y: number; z: number }> {
    physics.teleportEye({ ...start });
    expect(physics.setStance(stance), `${stance} stance at ${JSON.stringify(start)}`).toBe(true);
    for (let i = 0; i < 12; i += 1) {
      physics.move({ x: dir.x * 0.25, y: -0.06, z: dir.z * 0.25 }, 1 / 60);
    }
    for (let i = 0; i < 80; i += 1) {
      const step = slide ?? dir;
      physics.move({ x: step.x * 0.02, y: -0.06, z: step.z * 0.02 }, 1 / 60);
    }
    return physics.eyePosition();
  }

  function distanceToNamedBoxes(eye: { x: number; y: number; z: number }, root: THREE.Object3D, nameIncludes: string): number {
    let minimum = Infinity;
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.name.includes(nameIncludes)) return;
      const box = new THREE.Box3().setFromObject(mesh);
      const clamped = new THREE.Vector3(
        Math.max(box.min.x, Math.min(eye.x, box.max.x)),
        Math.max(box.min.y, Math.min(eye.y, box.max.y)),
        Math.max(box.min.z, Math.min(eye.z, box.max.z)),
      );
      minimum = Math.min(minimum, clamped.distanceTo(new THREE.Vector3(eye.x, eye.y, eye.z)));
    });
    return minimum;
  }

  it('keeps boundary fence posts out of the reachable eye shell at every stance', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    // Structural pin: a post face may not intrude past the playable bound,
    // because the world-boundary collider lets the capsule reach bound minus
    // one capsule radius — inside any visual that protrudes further.
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.name !== 'fence post') return;
      const box = new THREE.Box3().setFromObject(mesh);
      expect(Math.abs(box.max.x)).toBeGreaterThanOrEqual(Math.abs(ARENA_BOUNDS.maxX));
      expect(Math.abs(box.min.x)).toBeGreaterThanOrEqual(Math.abs(ARENA_BOUNDS.minX));
    });
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const eye = await pressedEye(physics, stance, { x: ARENA_BOUNDS.maxX - 2.5, y: 1.7, z: -14.25 }, { x: 1, z: 0 });
        const clearance = distanceToNamedBoxes(eye, map.root, 'fence post');
        expect(clearance, `${stance} eye-to-post clearance`).toBeGreaterThanOrEqual(CAMERA_NEAR_PLANE);
      }
    } finally {
      physics.dispose();
    }
  }, 120_000);

  it('gives every house door frame movement authority so jambs stop the eye clear', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    for (const house of map.houses) {
      for (const frame of house.solids.filter((entry) => entry.kind === 'frame' && entry.name.includes('-frame-'))) {
        expect(frame.collidable, `${house.team}:${frame.name} must be collidable`).toBe(true);
        const bounds = solidBounds(frame);
        const matched = map.physicsColliders.some((collider) =>
          Math.abs(collider.minX - bounds.minX) < 1e-4
          && Math.abs(collider.maxX - bounds.maxX) < 1e-4
          && Math.abs(collider.minZ - bounds.minZ) < 1e-4
          && Math.abs(collider.maxZ - bounds.maxZ) < 1e-4
          && Math.abs((collider.minY ?? 0) - bounds.minY) < 1e-4
          && Math.abs((collider.maxY ?? 0) - bounds.maxY) < 1e-4);
        expect(matched, `${house.team}:${frame.name} must have a physics collider`).toBe(true);
      }
    }
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      // Brush along the front wall through the door jamb line of house team 0.
      const front = map.houses[0];
      const jamb = front.solids.find((entry) => entry.name === 'front-entry-frame-right');
      expect(jamb).toBeDefined();
      const jambBounds = solidBounds(jamb!);
      const layout = HOUSE_LAYOUT[0];
      const outwardZ = Math.sign(layout.facing) as 1 | -1;
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const startY = (jambBounds.minY ?? 0) + 0.02 + STANCE_SHAPES[stance].halfHeight + STANCE_SHAPES[stance].radius;
        const eye = await pressedEye(
          physics,
          stance,
          { x: jambBounds.minX - 0.05, y: startY, z: outwardZ > 0 ? jambBounds.maxZ + 2 : jambBounds.minZ - 2 },
          { x: 0, z: -outwardZ },
          { x: 1, z: 0 },
        );
        const clearance = distanceToNamedBoxes(eye, map.root, 'frame-right');
        expect(clearance, `${stance} eye-to-jamb clearance`).toBeGreaterThanOrEqual(CAMERA_NEAR_PLANE);
      }
    } finally {
      physics.dispose();
    }
  }, 120_000);
});
