/**
 * nuketown2-facade-elevation-consumers.test.ts - HF-536 facade elevation,
 * the two REAL consumers in `src/nuketown2-arena.ts`.
 *
 * The house front and the garage front are two differently configured calls
 * of the same `facadeElevationParts()` assembly, emitted through the arena's
 * own `facadePair()`. This file pins what the arena must keep true of them:
 * 1. both consumers emit, on both mirrored houses, under the historic names;
 * 2. every emitted board sits on a SOLID pier that keeps its collider, never
 *    across an opening, and never more than 50 mm proud of the pier's face;
 * 3. window liners stay inside the wall body; the door leaf is parked beside
 *    the doorway registry's opening, never inside it; the sectional band
 *    spans the vehicle bay above its head;
 * 4. every part is presentation-only with no collider, shot surface or
 *    ballistic row, and every material comes from the arena registry;
 * 5. the two profiles differ in role, board count and material.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { ArenaMap } from './map';
import { NUKETOWN2_DOORWAYS, buildNuketown2 } from './nuketown2-arena';
import { FACADE_MAX_PROUD, lapSidingParts } from './forge-kit/facade';

const SIDES = ['north', 'south'] as const;
type Side = (typeof SIDES)[number];

let cached: ArenaMap | undefined;
function buildOnce(): ArenaMap {
  cached ??= buildNuketown2(new THREE.Scene());
  return cached;
}
function mesh(map: ArenaMap, name: string): THREE.Mesh {
  const found = map.root.getObjectByName(name);
  expect(found, `${name} exists`).toBeInstanceOf(THREE.Mesh);
  return found as THREE.Mesh;
}
function boxOf(part: THREE.Object3D): THREE.Box3 {
  part.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(part);
}
function materialName(part: THREE.Mesh): string {
  return (part.material as THREE.Material).name;
}
/** Every emitted facade part of one prop, in emit order. */
function partsOf(map: ArenaMap, side: Side, prop: string): THREE.Mesh[] {
  const prefix = `nuketown2 ${side} ${prop} `;
  const found: THREE.Mesh[] = [];
  map.root.traverse((object) => {
    if (object.name.startsWith(prefix) && (object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  return found;
}
/** The x-gap between two piers sorted west to east. */
function gap(piers: THREE.Box3[], index: number): [number, number] {
  return [piers[index]!.max.x, piers[index + 1]!.min.x];
}
/** Signed outward z: positive means towards the street for that side. */
function outwardZ(side: Side, box: THREE.Box3, wall: THREE.Box3): [number, number] {
  return side === 'north'
    ? [box.min.z - wall.max.z, box.max.z - wall.max.z]
    : [wall.min.z - box.max.z, wall.min.z - box.min.z];
}
const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] - 1e-9 && b[0] < a[1] - 1e-9;

const HOUSE_PIERS = 4;
const GARAGE_PIERS = 2;

describe('HF-536 facade elevation: two arena consumers', () => {
  it('emits the house front and the garage front on both houses under their historic prop names', () => {
    const map = buildOnce();
    for (const side of SIDES) {
      for (let pier = 0; pier < HOUSE_PIERS; pier += 1) mesh(map, `nuketown2 ${side} house front siding ${pier} board 0`);
      for (let pier = 0; pier < GARAGE_PIERS; pier += 1) mesh(map, `nuketown2 ${side} garage front siding ${pier} board 0`);
      for (let pane = 0; pane < 2; pane += 1) mesh(map, `nuketown2 ${side} house front window reveal ${pane} reveal head`);
      mesh(map, `nuketown2 ${side} house front door leaf leaf`);
      mesh(map, `nuketown2 ${side} garage door panels board 0`);
      expect(partsOf(map, side, 'house front siding 4')).toHaveLength(0);
      expect(partsOf(map, side, 'garage front siding 2')).toHaveLength(0);
      expect(partsOf(map, side, 'garage front window reveal')).toHaveLength(0);
      expect(partsOf(map, side, 'garage front door leaf')).toHaveLength(0);
    }
  });

  it('keeps every board on its own solid, colliding pier and out of every opening', () => {
    const map = buildOnce();
    for (const side of SIDES) {
      for (const [prop, count] of [['house front', HOUSE_PIERS], ['garage front', GARAGE_PIERS]] as const) {
        const piers = Array.from({ length: count }, (_, index) => boxOf(mesh(map, `nuketown2 ${side} ${prop} pier ${index}`)));
        // Prop index follows the authored run; the south house mirrors x, so
        // the openings are the gaps between the piers sorted in WORLD x.
        const westToEast = [...piers].sort((a, b) => a.min.x - b.min.x);
        for (const pier of piers) {
          const solid = map.colliders.some((c) => (
            Math.abs(c.minX - pier.min.x) < 1e-4 && Math.abs(c.maxX - pier.max.x) < 1e-4
            && Math.abs(c.minZ - pier.min.z) < 1e-4 && Math.abs(c.maxZ - pier.max.z) < 1e-4
          ));
          expect(solid, `${side} ${prop} pier keeps its collider`).toBe(true);
        }
        for (let index = 0; index < count; index += 1) {
          const pier = piers[index]!;
          const boards = partsOf(map, side, `${prop} siding ${index}`).filter((part) => part.name.includes(' board '));
          const expected = lapSidingParts({ run: pier.max.x - pier.min.x, height: pier.max.y - pier.min.y, facing: 'z+' })
            .filter((part) => part.suffix.startsWith('board')).length;
          expect(boards.length, `${side} ${prop} pier ${index} board count`).toBe(expected);
          for (const board of boards) {
            const box = boxOf(board);
            expect(box.min.x, `${board.name} west edge`).toBeGreaterThanOrEqual(pier.min.x - 1e-6);
            expect(box.max.x, `${board.name} east edge`).toBeLessThanOrEqual(pier.max.x + 1e-6);
            expect(box.min.y).toBeGreaterThanOrEqual(pier.min.y - 1e-6);
            expect(box.max.y).toBeLessThanOrEqual(pier.max.y + 1e-6);
            const [inner, outer] = outwardZ(side, box, pier);
            expect(outer, `${board.name} proud of the wall`).toBeLessThanOrEqual(FACADE_MAX_PROUD + 1e-6);
            expect(inner, `${board.name} bedded into the wall`).toBeLessThan(0);
            for (let other = 0; other < count - 1; other += 1) {
              expect(overlaps([box.min.x, box.max.x], gap(westToEast, other)), `${board.name} across an opening`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('lines the windows inside the wall, parks the leaf beside the doorway and bands the bay head', () => {
    const map = buildOnce();
    const doorway = NUKETOWN2_DOORWAYS.find((entry) => entry.id === 'house front door')!;
    const bay = NUKETOWN2_DOORWAYS.find((entry) => entry.id === 'garage vehicle door')!;
    for (const side of SIDES) {
      const piers = Array.from({ length: HOUSE_PIERS }, (_, index) => boxOf(mesh(map, `nuketown2 ${side} house front pier ${index}`)))
        .sort((a, b) => a.min.x - b.min.x);
      // One house is the other's 180-degree partner, so authored x is negated
      // on one side; the pier layout tells us which, the registry tells us
      // where the door is, and the two must agree exactly.
      const authored: [number, number] = [doorway.centre - doorway.width / 2, doorway.centre + doorway.width / 2];
      const mirror = Math.abs(gap(piers, 1)[0] - authored[0]) < 1e-6 ? 1 : -1;
      const door: [number, number] = mirror === 1 ? authored : [-authored[1], -authored[0]];
      expect(gap(piers, 1)[0]).toBeCloseTo(door[0], 6);
      expect(gap(piers, 1)[1]).toBeCloseTo(door[1], 6);

      for (const pane of [0, 1]) {
        // Reveal 0 is the west window on the north house and the east one on
        // its mirror; either way the two windows are the outer gaps.
        const cut = gap(piers, (pane === 0) === (mirror === 1) ? 0 : 2);
        const liners = partsOf(map, side, `house front window reveal ${pane}`);
        expect(liners).toHaveLength(4);
        for (const liner of liners) {
          const box = boxOf(liner);
          expect(box.min.x).toBeGreaterThanOrEqual(cut[0] - 1e-6);
          expect(box.max.x).toBeLessThanOrEqual(cut[1] + 1e-6);
          const [inner, outer] = outwardZ(side, box, piers[0]!);
          expect(outer, `${liner.name} never proud`).toBeLessThanOrEqual(1e-6);
          expect(inner, `${liner.name} inside the wall body`).toBeGreaterThanOrEqual(-(piers[0]!.max.z - piers[0]!.min.z) - 1e-6);
        }
      }

      const leaf = partsOf(map, side, 'house front door leaf');
      expect(leaf.length).toBeGreaterThan(3);
      for (const part of leaf) {
        const box = boxOf(part);
        expect(overlaps([box.min.x, box.max.x], door), `${part.name} hung in the doorway`).toBe(false);
        expect(box.max.y).toBeLessThan(doorway.headY);
        const [, outer] = outwardZ(side, box, piers[0]!);
        expect(outer, `${part.name} proud of the wall`).toBeLessThanOrEqual(FACADE_MAX_PROUD + 1e-6);
      }

      const bayX: [number, number] = [
        Math.min(mirror * (bay.centre - bay.width / 2), mirror * (bay.centre + bay.width / 2)),
        Math.max(mirror * (bay.centre - bay.width / 2), mirror * (bay.centre + bay.width / 2)),
      ];
      const band = partsOf(map, side, 'garage door panels');
      expect(band.filter((part) => part.name.includes(' board ')).length).toBe(4);
      for (const part of band) {
        const box = boxOf(part);
        expect(box.min.x).toBeGreaterThanOrEqual(bayX[0] - 1e-6);
        expect(box.max.x).toBeLessThanOrEqual(bayX[1] + 1e-6);
        expect(box.min.y).toBeGreaterThanOrEqual(bay.headY - 1e-6);
      }
    }
  });

  it('adds only presentation: no collider, shot surface or ballistic row, registry materials only', () => {
    const map = buildOnce();
    const shots = new Set(map.shotSurfaces.map((surface) => surface.name));
    for (const side of SIDES) {
      const props = [
        ...Array.from({ length: HOUSE_PIERS }, (_, index) => `house front siding ${index}`),
        ...Array.from({ length: GARAGE_PIERS }, (_, index) => `garage front siding ${index}`),
        'house front window reveal 0', 'house front window reveal 1', 'house front door leaf', 'garage door panels',
      ];
      for (const prop of props) {
        const parts = partsOf(map, side, prop);
        expect(parts.length, `${side} ${prop} emits`).toBeGreaterThan(0);
        for (const part of parts) {
          expect(part.userData.presentationOnly, `${part.name} presentationOnly`).toBe(true);
          expect(part.userData.ballisticSurfaceId, `${part.name} no ballistic id`).toBeUndefined();
          expect(shots.has(part.name), `${part.name} not a shot surface`).toBe(false);
          const box = boxOf(part);
          const collides = map.colliders.some((c) => (
            Math.abs(c.minX - box.min.x) < 1e-4 && Math.abs(c.maxX - box.max.x) < 1e-4
            && Math.abs(c.minZ - box.min.z) < 1e-4 && Math.abs(c.maxZ - box.max.z) < 1e-4
          ));
          expect(collides, `${part.name} not a movement collider`).toBe(false);
          expect(materialName(part), `${part.name} registry material`).toMatch(/^nuketown2-/);
          expect(materialName(part)).not.toContain('facade-');
        }
      }
    }
  });

  it('gives the two consumers different board counts and each pier\'s own material from parameters alone', () => {
    const map = buildOnce();
    for (const side of SIDES) {
      const houseBoards = partsOf(map, side, 'house front siding 0').filter((part) => part.name.includes(' board '));
      const garageBoards = partsOf(map, side, 'garage front siding 0').filter((part) => part.name.includes(' board '));
      expect(houseBoards.length).not.toBe(garageBoards.length);
      // Each consumer's boards resolve to the material its own solid pier
      // wears (the registry may alias the two siding roles to one material).
      expect(materialName(houseBoards[0]!)).toBe(materialName(mesh(map, `nuketown2 ${side} house front pier 0`)));
      expect(materialName(garageBoards[0]!)).toBe(materialName(mesh(map, `nuketown2 ${side} garage front pier 0`)));
      expect(materialName(mesh(map, `nuketown2 ${side} garage door panels board 0`)))
        .toBe(materialName(mesh(map, `nuketown2 ${side} garage door head`)));
      expect(materialName(mesh(map, `nuketown2 ${side} house front door leaf leaf`))).toContain('trim');
    }
  });
});
