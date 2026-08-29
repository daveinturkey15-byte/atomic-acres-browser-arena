import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, CENTRAL_BUS, HOUSE_LAYOUT, SPAWN_LAYOUT, STREET_HALF_WIDTH } from './arena-layout';
import { isBlocked } from './collision';
import { buildArena } from './map';
import { movementProfile } from './gameplay';
import type { ArenaMap } from './map';
import { CharacterPhysics } from './physics';

/**
 * Nuke Town fidelity guard.
 *
 * The owner's requirement is that this arena reads as the Black Ops 2 map it is
 * named after: two mirrored houses facing each other over a central road, one
 * bus as the hard cover in that road, garages and fenced yards, very short
 * sightlines, and above all a SMALL, symmetric footprint. Every assertion here
 * is one of those properties measured on the arena the game actually builds,
 * not on the authored constants alone.
 */

const PLAYER_RADIUS = 0.44;
const sprintSpeed = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true }).maxSpeed;
const walkSpeed = movementProfile({ crouched: false, prone: false, ads: false, sprinting: false, grounded: true }).maxSpeed;

const width = ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX;
const depth = ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ;
/** The reference map's longest legal standing sightline; measured on built colliders.
 *
 * Pass 81 / HF-383d: ratcheted 40 -> 26. Re-measured with THIS test's own
 * estimator (longestClearEyeLine below, perimeter rings at 1.65 m eye height)
 * against HEAD's built colliders: 24.00 m, on the east perimeter run from
 * [30, -16.5] to [30, 7.5]. The old 40 left 16 m of unused slack, so sightlines
 * could grow by two thirds before anything noticed - and they did grow, twice:
 * the 45.5 m and 45.3 m lanes recorded at src/arena-layout.ts:148-153 and
 * :174-186 reopened after the Z deepening. 26 keeps a 2 m margin for the
 * estimator's 2 m sample step while still catching that class of creep.
 *
 * Deliberately NOT set to the 24.19 m figure in
 * artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md: that came from a 3 m walkable
 * grid, and the sibling gate in src/nuketown-sightline-fidelity.test.ts uses a
 * 1 m interior lattice that measures 41.77 m on the same arena. The three
 * estimators sample different populations and their numbers are not
 * interchangeable, so each ceiling is pinned only against its own estimator. */
// REDESIGN 2026-08-29 re-derivation. The 26 m ceiling encoded the OLD
// cross-street flow, whose whole design fought long lanes. The reference map
// authentically HAS them - its signature sniper lane runs down the street and
// through the spawn-fence openings - so the redesigned geometry measures
// 30.27 m on THIS estimator (an end-garden diagonal through a door mouth) and
// the ceiling pins that measurement with margin, not the old philosophy.
// Derived with this test's own estimator per its convention; not loosened
// past what the reference layout implies (the raw unfurnished verge would
// measure 58 m - the furniture is doing its job).
const MAX_STANDING_EYE_LINE_METRES = 32;

/** Longest unobstructed straight eye-line between perimeter sample points on the built arena. */
function longestClearEyeLine(map: ArenaMap, eyeHeight: number): {
  metres: number;
  from: [number, number];
  to: [number, number];
} {
  const samples: Array<[number, number]> = [];
  for (let x = ARENA_BOUNDS.minX + 1; x <= ARENA_BOUNDS.maxX - 1; x += 2) samples.push([x, ARENA_BOUNDS.minZ + 1], [x, ARENA_BOUNDS.maxZ - 1]);
  for (let z = ARENA_BOUNDS.minZ + 1; z <= ARENA_BOUNDS.maxZ - 1; z += 2) samples.push([ARENA_BOUNDS.minX + 1, z], [ARENA_BOUNDS.maxX - 1, z]);
  let best = { metres: 0, from: [0, 0] as [number, number], to: [0, 0] as [number, number] };
  for (const [ax, az] of samples) {
    for (const [bx, bz] of samples) {
      const dx = bx - ax;
      const dz = bz - az;
      const metres = Math.hypot(dx, dz);
      if (metres <= best.metres) continue;
      const steps = Math.ceil(metres * 4);
      let clear = true;
      for (let i = 1; i < steps && clear; i++) {
        const t = i / steps;
        const x = ax + dx * t;
        const z = az + dz * t;
        for (const b of map.colliders) {
          const minY = b.minY ?? 0;
          const maxY = b.maxY ?? minY + 3;
          if (x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05 && eyeHeight > minY && eyeHeight < maxY) {
            clear = false;
            break;
          }
        }
      }
      if (clear) best = { metres, from: [ax, az], to: [bx, bz] };
    }
  }
  return best;
}

describe('Nuke Town fidelity', () => {
  it('stays small: the whole map is crossed in barely over ten seconds at real sprint speed', () => {
    const diagonal = Math.hypot(width, depth);
    // HF-383 remainder ("a tad bigger because it feels a little bit
    // clustered"): the footprint deepened from 60 to 63 m, moving the
    // diagonal sprint from 9.92 s to 10.16 s. Proven red against the old
    // sub-10 s pin before this gate moved. The new pin is TWO-SIDED: the
    // crossing must stay above the old sub-10 s envelope (pinning the
    // owner-requested growth) and below 10.5 s (keeping the reference
    // map's sprint-crossing character).
    expect(diagonal / sprintSpeed).toBeGreaterThan(10);
    expect(diagonal / sprintSpeed).toBeLessThan(10.5);
    expect(diagonal / walkSpeed).toBeLessThan(15);
    // A full lap of the perimeter is the reference map's 25-30 second circuit.
    const lap = (2 * (width + depth)) / sprintSpeed;
    expect(lap).toBeGreaterThan(25);
    expect(lap).toBeLessThan(30);
    // Guard against the footprint creeping back out.
    expect(width * depth).toBeLessThan(4000);
  });

  it('keeps the longest straight sightline short by putting the bus in the road', () => {
    const map = buildArena(new THREE.Scene());
    const bus = map.physicalCover.find((cover) => cover.id === 'central-transit-bus');
    expect(bus, 'exactly one central bus owns the middle of the road').toBeDefined();
    // Only one vehicle-scale cover body: the reference map has one bus, not a
    // pair of off-centre coaches.
    expect(map.physicalCover.filter((cover) => cover.id.includes('bus'))).toHaveLength(1);
    expect(bus!.bounds.minX).toBeLessThan(0);
    expect(bus!.bounds.maxX).toBeGreaterThan(0);
    expect(bus!.bounds.minZ).toBeGreaterThan(-STREET_HALF_WIDTH);
    expect(bus!.bounds.maxZ).toBeLessThan(STREET_HALF_WIDTH);
    // Standing on the centre line, neither map end is visible past the bus.
    expect(bus!.blocksShots).toBe(true);
    expect(bus!.blocksMovement).toBe(true);
  });

  it('builds two houses that face each other across the road, each with its own garage', () => {
    const map = buildArena(new THREE.Scene());
    expect(map.houses).toHaveLength(2);
    const [north, south] = map.houses;
    expect(north.origin.facing).toBe(1);
    expect(south.origin.facing).toBe(-1);
    expect(north.origin.z).toBeLessThan(-STREET_HALF_WIDTH);
    expect(south.origin.z).toBeGreaterThan(STREET_HALF_WIDTH);
    // Both houses keep their full interior: two floors, four rooms, two exterior
    // doors, three windows and a ramp, on both sides.
    expect(map.houseTelemetry.houses).toBe(2);
    expect(map.houseTelemetry.groundRooms).toBe(4);
    expect(map.houseTelemetry.upperRooms).toBe(4);
    expect(map.houseTelemetry.doors).toBe(4);
    expect(map.houseTelemetry.windows).toBe(6);
    const garages = map.root.children.filter((node) => /^garage \d+$/.test(node.name));
    expect(garages).toHaveLength(2);
  });

  it('spawns every player on solid, unobstructed ground inside the fence', () => {
    const map = buildArena(new THREE.Scene());
    for (const team of [0, 1] as const) {
      for (const spawn of map.spawns[team]) {
        const label = `t${team} (${spawn.x}, ${spawn.z})`;
        expect(spawn.x, label).toBeGreaterThan(ARENA_BOUNDS.minX + PLAYER_RADIUS);
        expect(spawn.x, label).toBeLessThan(ARENA_BOUNDS.maxX - PLAYER_RADIUS);
        expect(spawn.z, label).toBeGreaterThan(ARENA_BOUNDS.minZ + PLAYER_RADIUS);
        expect(spawn.z, label).toBeLessThan(ARENA_BOUNDS.maxZ - PLAYER_RADIUS);
        // Clear at knee, chest and eye height, not merely at one sample.
        for (const y of [0.6, 1.2, 1.7]) {
          expect(isBlocked({ x: spawn.x, y, z: spawn.z }, map.colliders, PLAYER_RADIUS), `${label} @y${y}`).toBe(false);
        }
      }
    }
    // REDESIGN 2026-08-29 (D1): teams own the two street ENDS, not the two
    // sides. Neither team may spawn past the street's midpoint toward the
    // other end - the end-garden fences sit at |x| = 27.5 and every spawn is
    // behind its own team's fence.
    expect(SPAWN_LAYOUT[0].every(([x]) => x < -27.5)).toBe(true);
    expect(SPAWN_LAYOUT[1].every(([x]) => x > 27.5)).toBe(true);
  });

  it('leaves no floating solid geometry over the playable yards', () => {
    const map = buildArena(new THREE.Scene());
    const overhead = /roof|canopy|landing|upper|floor|seam|frame|lintel|lamp|coach|sign|post|beam|window|door|ramp|rail|bus/i;
    const floating = map.colliders.filter((bounds) => (
      (bounds.minY ?? 0) > 0.4
      && bounds.minX > ARENA_BOUNDS.minX && bounds.maxX < ARENA_BOUNDS.maxX
      && bounds.minZ > ARENA_BOUNDS.minZ && bounds.maxZ < ARENA_BOUNDS.maxZ
    ));
    // Everything left above the ground must be a named structural element,
    // never an orphan slab the player can neither see nor reach.
    for (const bounds of floating) {
      const owner = map.root.children.find((node) => (
        Math.abs(node.position.x - (bounds.minX + bounds.maxX) / 2) < 1e-6
        && Math.abs(node.position.z - (bounds.minZ + bounds.maxZ) / 2) < 1e-6
        && Math.abs(node.position.y - ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2) < 1e-6
      ));
      expect(owner, `floating collider at ${JSON.stringify(bounds)}`).toBeDefined();
      expect(owner!.name, `floating collider ${owner!.name}`).toMatch(overhead);
    }
  });

  it('cannot be escaped: sprinting hard at every boundary stays inside the fence', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      const runs: Array<{ from: [number, number]; direction: [number, number] }> = [
        { from: [0, -20], direction: [0, -1] },
        { from: [0, 20], direction: [0, 1] },
        { from: [-20, 0], direction: [-1, 0] },
        { from: [20, 0], direction: [1, 0] },
        { from: [-20, -20], direction: [-1, -1] },
        { from: [20, 20], direction: [1, 1] },
        { from: [20, -20], direction: [1, -1] },
        { from: [-20, 20], direction: [-1, 1] },
      ];
      for (const run of runs) {
        physics.teleportEye({ x: run.from[0], y: 1.7, z: run.from[1] });
        const length = Math.hypot(run.direction[0], run.direction[1]);
        for (let step = 0; step < 900; step += 1) {
          physics.move({
            x: (run.direction[0] / length) * 0.08,
            y: -0.004,
            z: (run.direction[1] / length) * 0.08,
          }, 1 / 120);
        }
        const end = physics.eyePosition();
        const label = `from ${run.from} toward ${run.direction}`;
        expect(end.x, label).toBeGreaterThanOrEqual(ARENA_BOUNDS.minX - 0.5);
        expect(end.x, label).toBeLessThanOrEqual(ARENA_BOUNDS.maxX + 0.5);
        expect(end.z, label).toBeGreaterThanOrEqual(ARENA_BOUNDS.minZ - 0.5);
        expect(end.z, label).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ + 0.5);
        expect(end.y, label).toBeGreaterThan(0);
      }
    } finally {
      physics.dispose();
    }
  }, 60_000);

  it('gives both teams the same map: the solid collider set is 180-degree symmetric', () => {
    const map = buildArena(new THREE.Scene());
    // House interiors are mirrored rather than rotated by the shared architecture
    // generator, so symmetry is measured on the arena shell: every solid body
    // that is not part of a house or its furniture. Keys are size plus position
    // so a pair still counts as symmetric when the two halves are named
    // differently ("west fence" and "east fence").
    const houseOwned = new Set<string>();
    for (const house of map.houses) for (const solid of house.solids) houseOwned.add(solid.name);
    const shell = map.root.children.filter((node): node is THREE.Mesh => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true) return false;
      if (mesh.userData.presentationOnly === true) return false;
      if (houseOwned.has(mesh.name)) return false;
      if (mesh.name.includes('authored-house-')) return false;
      if (mesh.name.includes('roof-')) return false;
      const parameters = (mesh.geometry as THREE.BoxGeometry).parameters as
        { width: number; height: number; depth: number } | undefined;
      return parameters !== undefined;
    });
    const size = (mesh: THREE.Mesh) => {
      const p = (mesh.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
      return `${p.width}x${p.height}x${p.depth}`;
    };
    const at = (x: number, z: number) => `${(x === 0 ? 0 : x).toFixed(3)}|${(z === 0 ? 0 : z).toFixed(3)}`;
    const present = new Set(shell.map((mesh) => `${size(mesh)}|${at(mesh.position.x, mesh.position.z)}`));
    const asymmetric = shell
      .filter((mesh) => !present.has(`${size(mesh)}|${at(-mesh.position.x, -mesh.position.z)}`))
      .map((mesh) => `${mesh.name} @(${mesh.position.x}, ${mesh.position.z})`);
    // A short, explicitly reviewed allowance for the named lane landmarks that
    // give west, centre and east their own identity. Everything else that
    // affects play must have a rotated partner. Greenhouse joins the class
    // with the collider/visual parity audit (2026-08-26): its five frame
    // walls are one-sided lane architecture like the trellis; their
    // movement-authority deferral (sills stay decorative until the
    // environment-assets lane authors real openings) is pinned in
    // nuketown-traversal.test.ts.
    const LANE_IDENTITY = /trellis|service wall|solar canopy|hydro-bed|reclamation-tank|landmark plinth|irrigation-vessel|terrain-mound|greenhouse/;
    expect(asymmetric.filter((entry) => !LANE_IDENTITY.test(entry))).toEqual([]);
  });

  it('keeps the whole street inside one lane of cover-to-cover movement', () => {
    // Every spawn is within one short sprint of the contested centre, which is
    // what makes the reference map relentless rather than a walk simulator.
    const centre = { x: 0, z: 0 };
    for (const team of [0, 1] as const) {
      for (const [x, z] of SPAWN_LAYOUT[team]) {
        const seconds = Math.hypot(x - centre.x, z - centre.z) / sprintSpeed;
        expect(seconds, `spawn (${x}, ${z}) to centre`).toBeLessThan(5);
      }
    }
    expect(Math.abs(HOUSE_LAYOUT[0].z) + Math.abs(HOUSE_LAYOUT[1].z)).toBeLessThan(depth);
    expect(CENTRAL_BUS.size[0]).toBeGreaterThan(10);
  });

  it('keeps every standing eye-line short on the arena as actually built', () => {
    // The bus alone does not guarantee short sightlines: the Pass 78 rebuild
    // left a 68 m clear diagonal lane threading both yards and the road east
    // of the bus. Measure the built collider set, not the authored constants.
    const map = buildArena(new THREE.Scene());
    const longest = longestClearEyeLine(map, 1.65);
    expect(
      longest.metres,
      `clear lane ${JSON.stringify(longest.from)} -> ${JSON.stringify(longest.to)}`,
    ).toBeLessThanOrEqual(MAX_STANDING_EYE_LINE_METRES);
  });

  it('measures its own playable footprint from the built fence colliders', () => {
    const map = buildArena(new THREE.Scene());
    const fence = map.colliders.filter((bounds) => (bounds.maxY ?? 0) >= 2.5 && (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ) < 60);
    const inner = fence.filter((b) => (b.maxX - b.minX) > (b.maxZ - b.minZ));
    const sides = fence.filter((b) => (b.maxX - b.minX) <= (b.maxZ - b.minZ));
    const playMinZ = Math.max(...inner.map((b) => b.minZ + (b.maxZ - b.minZ)));
    const playMaxZ = Math.min(...inner.map((b) => b.minZ));
    const playMinX = Math.max(...sides.map((b) => b.minX + (b.maxX - b.minX)));
    const playMaxX = Math.min(...sides.map((b) => b.minX));
    const area = (playMaxX - playMinX) * (playMaxZ - playMinZ);
    // The reference map stays small; guard against footprint creep measured
    // on geometry rather than on ARENA_BOUNDS. HF-383 remainder: proven red
    // at 4057 m^2 against the old <4000 pin after the fence line deepened to
    // +/-31.5; the new band is two-sided - above the old 4000 ceiling (the
    // growth is real and pinned) and below 4200 so creep stays capped.
    expect(area).toBeGreaterThan(4000);
    expect(area).toBeLessThan(4200);
  });
});
