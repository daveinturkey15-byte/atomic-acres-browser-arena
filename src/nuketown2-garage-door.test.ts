/**
 * nuketown2-garage-door.test.ts — HF-536 (NIGHT-MUSE-GARAGE) proof gates.
 *
 * The parked leaf over each garage bay is a four-panel sectional door with
 * ONE row of four small panes in the second panel from the top:
 * 1. four panes per door, each 0.45 x 0.25 m, house window glass, total
 *    door glazing 0.45 m2 (<= 0.6 m2);
 * 2. a trim frame around each pane, standing 0.01 m proud of the pane face;
 * 3. four leaf boards with the hardware kit's battens on the panel joints;
 * 4. zero new colliders, shot surfaces or ballistic rows (presentation-only);
 * 5. both houses identical (180-degree pair partners).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ArenaMap } from './map';
import { buildNuketown2 } from './nuketown2-arena';
import { garageDoorHardware } from './forge-kit/hardware/prefabs';

const PANE_W = 0.45;
const PANE_H = 0.25;
const MAX_DOOR_GLAZING_M2 = 0.6;
const LEAF_FACE_ABS_Z = 15.95;
const BATTEN_Y = [2.62, 2.8, 3.0, 3.2];

function buildOnce() {
  return buildNuketown2(new THREE.Scene());
}
function mesh(map: ArenaMap, name: string): THREE.Mesh {
  const found = map.root.getObjectByName(name);
  expect(found, `${name} exists`).toBeInstanceOf(THREE.Mesh);
  return found as THREE.Mesh;
}
function boxOf(part: THREE.Mesh): THREE.Box3 {
  part.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(part);
}

function partNames(side: 'north' | 'south'): string[] {
  const names: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    names.push(`garage door window pane ${index}`);
    names.push(`garage door window frame side ${index} left`);
    names.push(`garage door window frame side ${index} right`);
    names.push(`garage door window frame ${index} bottom`);
    names.push(`garage door window frame ${index} top`);
  }
  return names.map((name) => `nuketown2 ${side} ${name}`);
}

describe('HF-536 garage sectional door with a four-pane window strip', () => {
  it('carries four 0.45 x 0.25 m panes per door, total glazing <= 0.6 m2', () => {
    const map = buildOnce();
    for (const side of ['north', 'south'] as const) {
      let area = 0;
      for (let index = 0; index < 4; index += 1) {
        const pane = mesh(map, `nuketown2 ${side} garage door window pane ${index}`);
        const box = boxOf(pane);
        expect(box.max.x - box.min.x, `pane ${index} width`).toBeCloseTo(PANE_W, 6);
        expect(box.max.y - box.min.y, `pane ${index} height`).toBeCloseTo(PANE_H, 6);
        expect((pane.material as THREE.Material).name, `pane ${index} glass role`).toBe('nuketown2-window-glass');
        area += (box.max.x - box.min.x) * (box.max.y - box.min.y);
      }
      expect(area, `${side} door glazing area`).toBeGreaterThan(0);
      expect(area, `${side} door glazing area <= 0.6 m2`).toBeLessThanOrEqual(MAX_DOOR_GLAZING_M2);
    }
  });

  it('frames every pane in trim, 0.01 m proud, clear of the pane edges', () => {
    const map = buildOnce();
    for (const side of ['north', 'south'] as const) {
      const sign = side === 'north' ? -1 : 1;
      for (let index = 0; index < 4; index += 1) {
        const pane = boxOf(mesh(map, `nuketown2 ${side} garage door window pane ${index}`));
        const paneFront = sign < 0 ? pane.max.z : -pane.min.z;
        const bars = ['left', 'right'].map((s) => `frame side ${index} ${s}`).concat([`frame ${index} bottom`, `frame ${index} top`]);
        expect(bars).toHaveLength(4);
        for (const bar of bars) {
          const barBox = boxOf(mesh(map, `nuketown2 ${side} garage door window ${bar}`));
          expect((mesh(map, `nuketown2 ${side} garage door window ${bar}`).material as THREE.Material).name, `${bar} trim role`).toBe('nuketown2-trim');
          const barFront = sign < 0 ? barBox.max.z : -barBox.min.z;
          expect(barFront - paneFront, `${bar} 0.01 m proud of the pane`).toBeCloseTo(0.01, 2);
        }
        const sides = ['left', 'right'].map((s) =>
          boxOf(mesh(map, `nuketown2 ${side} garage door window frame side ${index} ${s}`)));
        // Authored left/right swap under the x mirror; sort in world x instead.
        sides.sort((a, b) => a.min.x - b.min.x);
        const [west, east] = [sides[0]!, sides[1]!];
        expect(pane.min.x - west.max.x, 'west bar clear of the pane').toBeGreaterThanOrEqual(0.004);
        expect(east.min.x - pane.max.x, 'east bar clear of the pane').toBeGreaterThanOrEqual(0.004);
      }
    }
  });
  it('keeps every new face at least 0.01 m off the leaf face', () => {
    const map = buildOnce();
    for (const side of ['north', 'south'] as const) {
      for (const name of partNames(side)) {
        const box = boxOf(mesh(map, name));
        const clearance = side === 'north'
          ? box.min.z - -LEAF_FACE_ABS_Z
          : LEAF_FACE_ABS_Z - box.max.z;
        expect(clearance, `${name} clear of the leaf face`).toBeGreaterThanOrEqual(0.01 - 1e-6);
      }
    }
  });


  it('reads as four panels with battens on the joints', () => {
    const map = buildOnce();
    for (const side of ['north', 'south'] as const) {
      for (let course = 0; course < 4; course += 1) {
        const board = boxOf(mesh(map, `nuketown2 ${side} garage door panels board ${course}`));
        expect(board.max.y - board.min.y, `board ${course} course height`).toBeCloseTo(0.2, 6);
      }
      const placedY = garageDoorHardware()
        .filter((part) => part.suffix.startsWith('batten'))
        .map((part) => {
          const box = boxOf(mesh(map, `nuketown2 ${side} hardware garage door hardware ${part.suffix}`));
          return (box.min.y + box.max.y) / 2;
        });
      expect(placedY.map((y) => +y.toFixed(2))).toEqual(BATTEN_Y);
    }
  });

  it('adds zero colliders, shot surfaces or ballistic rows', () => {
    const map = buildOnce();
    const shots = new Map(map.shotSurfaces.map((surface) => [surface.name, surface]));
    for (const side of ['north', 'south'] as const) {
      for (const name of partNames(side)) {
        const part = mesh(map, name);
        expect(part.userData.presentationOnly, `${name} presentationOnly`).toBe(true);
        expect(part.userData.ballisticSurfaceId, `${name} no ballistic id`).toBeUndefined();
        expect(shots.has(name), `${name} not a shot surface`).toBe(false);
        const box = boxOf(part);
        const hitsCollider = map.colliders.some((c) => (
          Math.abs(c.minX - box.min.x) < 1e-4
          && Math.abs(c.maxX - box.max.x) < 1e-4
          && Math.abs(c.minZ - box.min.z) < 1e-4
          && Math.abs(c.maxZ - box.max.z) < 1e-4
        ));
        expect(hitsCollider, `${name} not a movement collider`).toBe(false);
      }
    }
    // The solid leaf and the aqua car collider it was reported against stand on.
    for (const side of ['north', 'south'] as const) {
      expect(map.root.getObjectByName(`nuketown2 ${side} garage door head`)).toBeInstanceOf(THREE.Mesh);
      expect(map.root.getObjectByName(`nuketown2 ${side} garage car body`)).toBeInstanceOf(THREE.Mesh);
    }
  });

  it('builds both houses as exact 180-degree partners', () => {
    const map = buildOnce();
    for (const name of partNames('north')) {
      const northBox = boxOf(mesh(map, name));
      const southBox = boxOf(mesh(map, name.replace('nuketown2 north', 'nuketown2 south')));
      for (const [a, b] of [[northBox.min.x, -southBox.max.x], [northBox.max.x, -southBox.min.x],
        [northBox.min.y, southBox.min.y], [northBox.max.y, southBox.max.y],
        [northBox.min.z, -southBox.max.z], [northBox.max.z, -southBox.min.z]] as const) {
        expect(a, `${name} mirrored`).toBeCloseTo(b, 6);
      }
    }
  });

  it('coils the drum inside above the opening, clear of the leaf', () => {
    const map = buildOnce();
    for (const side of ['north', 'south'] as const) {
      const drum = boxOf(mesh(map, `nuketown2 ${side} garage door drum`));
      const head = boxOf(mesh(map, `nuketown2 ${side} garage door head`));
      if (side === 'north') expect(drum.max.z, 'drum behind the leaf solid').toBeLessThan(head.min.z);
      else expect(drum.min.z, 'drum behind the leaf solid').toBeGreaterThan(head.max.z);
    }
  });
});
