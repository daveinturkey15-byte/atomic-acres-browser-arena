import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALLISTIC_MATERIALS } from './ballistics';
import {
  NUKETOWN2_DOORWAYS,
  buildNuketown2,
} from './nuketown2-arena';
import {
  NUKETOWN2_GARAGE_SPAN,
  NUKETOWN2_GROUND_FLOOR_TOP,
  nuketown2HandedX as hx,
} from './nuketown2-layout';

/**
 * HF-478 - the BO2 Nuketown 2025 house and garage INTERIORS, measured.
 *
 * The arena file already carried the interior SHELL: two ground rooms split by
 * a partition with a doorway, a stair against the blind wall with a
 * collision-only ramp, an upper storey of two rooms and the balcony door.
 * `nuketown2-fidelity.test.ts` owns all of that and this file does not restate
 * it - re-asserting a neighbour's contract is how two gates drift apart.
 *
 * What this file owns is what the shell was missing: the FURNITURE, and the
 * three properties that make furniture a gameplay body rather than a prop.
 *
 *   1. It is SOLID and BALLISTIC-RATED EXPLICITLY. `classifyBallisticMaterial`
 *      reads the mesh NAME, and every body in `house()` and `garage()` is
 *      called `house ...` or `garage ...` - which matches the
 *      `/(plaster|partition|house|garage|...)/` rule. A body that misses every
 *      earlier rule is therefore silently rated `interior-wall` by its own
 *      PREFIX. That is how `house upper crate` - a wooden crate - was rated as
 *      plasterboard, and how a steel shelving rack and a car would have been.
 *      An explicit id is `classification: 'explicit'` on the surface; a rule
 *      hit is `'rule'`, and it moves the day anyone renames the body.
 *
 *   2. It does not stand in a DOORWAY. Every doorway in NUKETOWN2_DOORWAYS is
 *      swept for a solid inside its own threshold band, which is the mistake
 *      HF-432 item 4 had to undo once already in the garage.
 *
 *   3. It leaves a WALKABLE LANE. Solid furniture inside a 4.4 m garage bay is
 *      how a route becomes a cupboard, so the link-door lane is measured
 *      against the standing capsule rather than eyeballed.
 *
 * Every number below is READ OFF THE BUILT ARENA. Nothing is transcribed from
 * the builder, because a gate that repeats the builder's literals only proves
 * the literals were typed twice.
 */

const STANDING_RADIUS_M = 0.38;
const STANDING_CAPSULE_M = 1.82;
const CROUCH_CAPSULE_M = 1.16;

type Solid = Readonly<{
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
}>;

function buildOnce(): ReturnType<typeof buildNuketown2> {
  return buildNuketown2(new THREE.Scene());
}

/** The built mesh for an authored name, on the NORTH side. */
function northMesh(map: ReturnType<typeof buildNuketown2>, authored: string): THREE.Mesh {
  const mesh = map.root.getObjectByName(`nuketown2 north ${authored}`);
  expect(mesh, `built body: nuketown2 north ${authored}`).toBeDefined();
  return mesh as THREE.Mesh;
}

function boxOf(mesh: THREE.Mesh): Solid {
  const p = (mesh.geometry as THREE.BoxGeometry).parameters;
  const world = new THREE.Vector3();
  mesh.getWorldPosition(world);
  return {
    minX: world.x - p.width / 2, maxX: world.x + p.width / 2,
    minZ: world.z - p.depth / 2, maxZ: world.z + p.depth / 2,
    minY: world.y - p.height / 2, maxY: world.y + p.height / 2,
  };
}

/**
 * The furniture roster this lane owns, with the material each body IS. The ids
 * are the shared `BALLISTIC_MATERIALS` table's own, so a rating that stops
 * being a real class fails here rather than at the first shot.
 */
const FURNITURE = Object.freeze([
  Object.freeze({ authored: 'house front room counter', material: 'wood' as const, room: 'ground kitchen' }),
  Object.freeze({ authored: 'house kitchen island', material: 'wood' as const, room: 'ground kitchen' }),
  Object.freeze({ authored: 'house back room bench', material: 'wood' as const, room: 'ground living' }),
  Object.freeze({ authored: 'house living couch', material: 'wood' as const, room: 'ground living' }),
  Object.freeze({ authored: 'house upper dresser', material: 'wood' as const, room: 'upper front' }),
  Object.freeze({ authored: 'house upper crate', material: 'wood' as const, room: 'upper back' }),
  Object.freeze({ authored: 'house upper bed', material: 'wood' as const, room: 'upper back' }),
  Object.freeze({ authored: 'garage bench', material: 'wood' as const, room: 'garage' }),
  Object.freeze({ authored: 'garage shelving rack', material: 'thin-metal' as const, room: 'garage' }),
  Object.freeze({ authored: 'garage car body', material: 'vehicle' as const, room: 'garage' }),
]);

describe('Nuke Town Rebuild interiors (HF-478)', () => {
  it('gives every room its furniture, in BOTH houses, through pair()', () => {
    const map = buildOnce();
    for (const piece of FURNITURE) {
      const north = northMesh(map, piece.authored);
      const south = map.root.getObjectByName(`nuketown2 south ${piece.authored}`);
      expect(south, `${piece.authored} has a south partner`).toBeDefined();
      // pair() writes the south body as the exact 180-degree partner. Reading
      // it back is the cheap proof that no piece here was authored by hand on
      // one side only, which is the way an interior stops being the same map
      // for both teams.
      const a = boxOf(north);
      const b = boxOf(south as THREE.Mesh);
      expect(b.minX, `${piece.authored} partner x`).toBeCloseTo(-a.maxX, 6);
      expect(b.minZ, `${piece.authored} partner z`).toBeCloseTo(-a.maxZ, 6);
      expect(b.minY, `${piece.authored} partner y`).toBeCloseTo(a.minY, 6);
      expect(b.maxY, `${piece.authored} partner height`).toBeCloseTo(a.maxY, 6);
    }
    // Room coverage, stated rather than implied: the reference's ground floor
    // is a kitchen AND a living space, and its upper storey is two rooms.
    // A roster that quietly lost a room would still pass every assertion
    // above, so the rooms are counted.
    const rooms = new Set(FURNITURE.map((piece) => piece.room));
    expect([...rooms].sort()).toEqual(
      ['garage', 'ground kitchen', 'ground living', 'upper back', 'upper front'],
    );
  });

  it('makes every furniture body a SOLID with an EXPLICIT ballistic rating', () => {
    const map = buildOnce();
    const byName = new Map(map.shotSurfaces.map((surface) => [surface.name, surface]));
    for (const piece of FURNITURE) {
      const mesh = northMesh(map, piece.authored);
      const box = boxOf(mesh);
      // Solid: it is in the collider set the movement authority reads.
      const solid = map.colliders.some((bounds) => (
        Math.abs(bounds.minX - box.minX) < 1e-6 && Math.abs(bounds.maxX - box.maxX) < 1e-6
        && Math.abs(bounds.minZ - box.minZ) < 1e-6 && Math.abs(bounds.maxZ - box.maxZ) < 1e-6
      ));
      expect(solid, `${piece.authored} is a movement collider`).toBe(true);

      const surface = byName.get(`nuketown2 north ${piece.authored}`);
      expect(surface, `${piece.authored} is a ballistic surface`).toBeDefined();
      // THE POINT OF THIS FILE. 'rule' means the classifier guessed from the
      // name; for a body called `house ...` or `garage ...` that guess is
      // `interior-wall` unless an earlier token happens to match, so a rule
      // hit here is an accident whether or not it is currently right.
      expect(surface!.classification, `${piece.authored} rating is authored, not guessed`)
        .toBe('explicit');
      expect(surface!.material, `${piece.authored} material`).toBe(piece.material);
      expect(BALLISTIC_MATERIALS[surface!.material], `${piece.authored} material is in the shared table`)
        .toBeDefined();
    }
  });

  it('never lets a solid furniture body float, or reach into a walk-under gap', () => {
    const map = buildOnce();
    for (const piece of FURNITURE) {
      const box = boxOf(northMesh(map, piece.authored));
      // NOT FLOATING, which is the forging review's own rule: the underside is
      // at or below the top of the floor its storey stands on, never above it.
      //
      // "At or below" and not "exactly at", deliberately, and the difference is
      // a MEASURED pre-existing condition rather than slack: HF-448 raised the
      // ground-floor slab to +0.08 m to cure the interior z-fighting, and the
      // ground furniture that was already in the room was left authored from
      // y = 0. So the counters, the bench, the island and the couch are all
      // sunk exactly 0.08 m into their own floor. Sunk is invisible and it is
      // not what this rule is about; a body hanging in the air is. The 0.08 m
      // is recorded as an OPEN item in this lane's report with this number, so
      // whoever raises them raises ALL of them - the four solids and the four
      // presentation tops that are laid on them - in one edit.
      const floorTop = box.minY > 2 ? 3.3 : NUKETOWN2_GROUND_FLOOR_TOP;
      expect(box.minY, `${piece.authored} does not float over its floor`)
        .toBeLessThanOrEqual(floorTop + 1e-6);
      expect(box.minY, `${piece.authored} is not below its own storey`)
        .toBeGreaterThanOrEqual(floorTop - NUKETOWN2_GROUND_FLOOR_TOP - 1e-6);
      // The underside rule above IS the anti-crouch rule, and it is worth
      // saying why rather than adding a second height band that looks like one.
      // The ground sweep in nuketown2-fidelity.test.ts flags a cell a CROUCH
      // clears and a STAND does not. A body standing ON its floor overlaps the
      // crouch capsule's own span the moment it is taller than 0.06 m, so it
      // blocks both stances and the sweep skips the cell whatever its height
      // is. Only a body RAISED off the floor - a solid cabin over an open sill,
      // a shelf on legs - can open the gap that makes a cell crouch-only, and
      // a raised body is exactly what `minY <= floorTop` forbids. A numeric
      // height band here would have failed the 1.45 m car, which is one solid
      // block from the slab up and cannot produce that cell at all.
      expect(box.maxY - box.minY, `${piece.authored} is a body, not a decal`)
        .toBeGreaterThan(0.06);
    }
  });

  it('leaves every doorway a standing-wide clear run through it', () => {
    const map = buildOnce();
    const boxes = FURNITURE.map((piece) => ({ piece, box: boxOf(northMesh(map, piece.authored)) }));
    for (const door of NUKETOWN2_DOORWAYS) {
      // NOT "no furniture may overlap the threshold band". That rule is wrong
      // for the one doorway on this map that a body is SUPPOSED to stand in:
      // the 3.5 m vehicle door has a car parked through it, which is what a
      // vehicle door is for. The contract a player actually needs is that the
      // doorway keeps a run they can walk, so the span is SAMPLED and the
      // widest clear run measured. For the four 1.8 m domestic doors that is a
      // stricter statement than no-overlap ever was (0.4 m of couch corner in
      // an 1.8 m door leaves 1.4 m and passes a no-overlap rule only by
      // accident of which corner it is); for the vehicle door it is the only
      // statement that is true.
      const half = door.width / 2;
      const deep = STANDING_RADIUS_M * 2;
      const spanIsX = door.span === 'x';
      const ends = spanIsX
        ? [hx(door.centre - half), hx(door.centre + half)]
        : [door.centre - half, door.centre + half];
      const [lo, hi] = [Math.min(...ends), Math.max(...ends)];
      const acrossCentre = spanIsX ? door.at : hx(door.at);
      const across: [number, number] = [acrossCentre - deep, acrossCentre + deep];
      let best = 0;
      let run = 0;
      for (let t = lo; t <= hi; t += 0.02) {
        const blocked = boxes.some(({ box }) => {
          if (box.maxY <= door.floorY + 0.06 || box.minY >= door.floorY + STANDING_CAPSULE_M) return false;
          const alongOk = spanIsX ? t > box.minX && t < box.maxX : t > box.minZ && t < box.maxZ;
          if (!alongOk) return false;
          return spanIsX
            ? box.maxZ > across[0] && box.minZ < across[1]
            : box.maxX > across[0] && box.minX < across[1];
        });
        run = blocked ? 0 : run + 0.02;
        if (run > best) best = run;
      }
      expect(best, `'${door.id}' keeps a standing-wide clear run (${best.toFixed(2)} m of ${door.width} m)`)
        .toBeGreaterThan(STANDING_RADIUS_M * 2);
    }
  });

  it('leaves the garage a route: a standing lane past the car to the link door', () => {
    const map = buildOnce();
    const car = boxOf(northMesh(map, 'garage car body'));
    const bench = boxOf(northMesh(map, 'garage bench'));
    const shelf = boxOf(northMesh(map, 'garage shelving rack'));
    const [gx0, gx1] = [NUKETOWN2_GARAGE_SPAN.x0, NUKETOWN2_GARAGE_SPAN.x1]
      .map((x) => hx(x)).sort((a, b) => a - b) as [number, number];
    const wall = 0.3;
    // The house-side lane, in the WORLD frame: from the shared wall's inner
    // face to the nearest body. hx() may flip the garage onto -x, so the lane
    // is measured from whichever inner face is closest to the house.
    const link = NUKETOWN2_DOORWAYS.find((entry) => entry.id === 'house garage link')!;
    const linkWallX = hx(link.at);
    const inner = linkWallX < (gx0 + gx1) / 2 ? gx0 + wall : gx1 - wall;
    const laneWidth = Math.min(
      ...[car, bench, shelf].map((body) => (
        inner < (gx0 + gx1) / 2 ? body.minX - inner : inner - body.maxX
      )),
    );
    expect(laneWidth, `garage link-door lane (${laneWidth.toFixed(2)} m) fits a standing capsule`)
      .toBeGreaterThan(STANDING_RADIUS_M * 2);
    // ...and the lane runs the whole depth, so it is a route and not a pocket.
    const [gz0, gz1] = [Math.min(car.minZ, bench.minZ, shelf.minZ),
      Math.max(car.maxZ, bench.maxZ, shelf.maxZ)];
    expect(gz1 - gz0, 'the three garage bodies span the bay the lane runs beside')
      .toBeGreaterThan(4.0);

    // HF-432 item 4's invariant, now asserted rather than remembered: the
    // workbench does not stand in the rear doorway's own run. Shortening the
    // bench for the car must not undo the owner's fix.
    const rear = NUKETOWN2_DOORWAYS.find((entry) => entry.id === 'garage rear door')!;
    const rearRun = [hx(rear.centre - rear.width / 2), hx(rear.centre + rear.width / 2)]
      .sort((a, b) => a - b) as [number, number];
    const clear = bench.minX >= rearRun[1] || bench.maxX <= rearRun[0];
    expect(clear, 'the workbench is clear of the rear doorway run (HF-432 item 4)').toBe(true);

    // The car has no walk-under gap: its solid body starts on the slab and the
    // cabin above it is presentation. A second solid over an open sill is what
    // the ground crouch sweep would report as a crouch-only cell in both bays.
    expect(car.minY, 'the car body rests on the garage slab')
      .toBeCloseTo(NUKETOWN2_GROUND_FLOOR_TOP, 6);
    expect(car.maxY - car.minY, 'the car is one solid body, taller than a crouch')
      .toBeGreaterThan(CROUCH_CAPSULE_M);
    const cabin = map.root.getObjectByName('nuketown2 north garage car cabin') as THREE.Mesh;
    expect(cabin, 'the cabin is built').toBeDefined();
    const cabinSolid = map.colliders.some((bounds) => (
      Math.abs(bounds.minX - boxOf(cabin).minX) < 1e-6
      && Math.abs(bounds.minZ - boxOf(cabin).minZ) < 1e-6
    ));
    expect(cabinSolid, 'the cabin is presentation, not a second solid').toBe(false);
  });
});
