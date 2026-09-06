import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from '../../nuketown2-arena';
import {
  NUKETOWN2_GARAGE_SPAN,
  NUKETOWN2_GROUND_FLOOR_TOP,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_HOUSE_WIDTH,
} from '../../nuketown2-layout';
import {
  ARMCHAIR_TRIANGLES,
  CHAIR_TRIANGLES,
  COFFEE_TABLE_TRIANGLES,
  DINING_TABLE_TRIANGLES,
  FLOOR_LAMP_TRIANGLES,
  GARAGE_INTERIOR_BOXES,
  GARAGE_INTERIOR_TRIANGLES,
  HOUSE_INTERIOR_BOXES,
  HOUSE_INTERIOR_TRIANGLES,
  INTERIOR_BOX_TRIANGLES,
  INTERIOR_ROLES,
  KITCHEN_RUN_TRIANGLES,
  OIL_STAIN_TRIANGLES,
  RACKING_BOXES_TRIANGLES,
  RUG_TRIANGLES,
  SHELF_UNIT_TRIANGLES,
  SOFA_TRIANGLES,
  WALL_ART_TRIANGLES,
  WORKBENCH_DRESSING_TRIANGLES,
  armchairParts,
  chairParts,
  coffeeTableParts,
  diningTableParts,
  floorLampParts,
  kitchenRunParts,
  oilStainParts,
  rackingBoxesParts,
  rugParts,
  shelfUnitParts,
  sofaParts,
  wallArtParts,
  workbenchDressingParts,
  type InteriorPart,
} from './prefabs';

/**
 * HF-536 NIGHT-MUSE-INTERIORS — the interior kit's proof gates.
 *
 * Budgets: <= 14,000 tris for everything in one house, <= 4,000 for the
 * garage (brief sec. "Place them"). Authority: every prefab is
 * presentation-only — no movement collider, no shot surface, no ballistic
 * id — so the movement/shot authority the interiors + fidelity gates own is
 * byte-identical with the kit on or off. That is asserted as a PROPERTY
 * (no kit mesh owns authority) rather than a pinned count, so this file
 * cannot drift from the roster when another lane adds furniture.
 */

// Authored-frame shell, derived from the layout module (never restated: the
// north house centre is LAYOUT[0].x, width 11, depth 13 off front -10).
const HOUSE_X0 = NUKETOWN2_HOUSE_LAYOUT[0]!.x - NUKETOWN2_HOUSE_WIDTH / 2;
const HOUSE_X1 = NUKETOWN2_HOUSE_LAYOUT[0]!.x + NUKETOWN2_HOUSE_WIDTH / 2;
const WALL_T = 0.3;

interface Volume {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly floorTop: number;
  readonly ceiling: number;
}

/** World-frame interior volumes for both houses + both garages. */
function volumes(): { north: Volume; south: Volume; garageNorth: Volume; garageSouth: Volume } {
  const innerX0 = HOUSE_X0 + WALL_T;
  const innerX1 = HOUSE_X1 - WALL_T;
  const innerZ0 = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH + WALL_T;
  const innerZ1 = NUKETOWN2_HOUSE_FRONT_Z - WALL_T;
  const floor = NUKETOWN2_GROUND_FLOOR_TOP;
  const ceiling = NUKETOWN2_GROUND_STOREY_H;
  // pair() mirrors x by HANDEDNESS (-1) for the north emission and negates
  // both axes for the south: north world x is [-innerX1, -innerX0].
  return {
    north: { minX: -innerX1, maxX: -innerX0, minZ: innerZ0, maxZ: innerZ1, floorTop: floor, ceiling },
    south: { minX: innerX0, maxX: innerX1, minZ: -innerZ1, maxZ: -innerZ0, floorTop: floor, ceiling },
    garageNorth: {
      minX: -NUKETOWN2_GARAGE_SPAN.x1 + WALL_T, maxX: -NUKETOWN2_GARAGE_SPAN.x0 - WALL_T,
      minZ: innerZ0, maxZ: NUKETOWN2_HOUSE_FRONT_Z - 6 + WALL_T,
      floorTop: floor, ceiling: 3.4,
    },
    garageSouth: {
      minX: NUKETOWN2_GARAGE_SPAN.x0 + WALL_T, maxX: NUKETOWN2_GARAGE_SPAN.x1 - WALL_T,
      minZ: -(NUKETOWN2_HOUSE_FRONT_Z - 6 + WALL_T), maxZ: -innerZ0,
      floorTop: floor, ceiling: 3.4,
    },
  };
}

interface Group {
  readonly id: string;
  readonly parts: readonly InteriorPart[];
  readonly triangles: number;
  readonly volume: 'house' | 'garage';
}

const HOUSE_GROUPS: readonly Group[] = Object.freeze([
  { id: 'house interior kitchen run', parts: kitchenRunParts(), triangles: KITCHEN_RUN_TRIANGLES, volume: 'house' },
  { id: 'house interior sofa', parts: sofaParts(), triangles: SOFA_TRIANGLES, volume: 'house' },
  { id: 'house interior armchair', parts: armchairParts(), triangles: ARMCHAIR_TRIANGLES, volume: 'house' },
  { id: 'house interior coffee table', parts: coffeeTableParts(), triangles: COFFEE_TABLE_TRIANGLES, volume: 'house' },
  { id: 'house interior rug', parts: rugParts(), triangles: RUG_TRIANGLES, volume: 'house' },
  { id: 'house interior floor lamp', parts: floorLampParts(), triangles: FLOOR_LAMP_TRIANGLES, volume: 'house' },
  { id: 'house interior shelf hutch', parts: shelfUnitParts(), triangles: SHELF_UNIT_TRIANGLES, volume: 'house' },
  { id: 'house interior wall art', parts: wallArtParts(), triangles: WALL_ART_TRIANGLES, volume: 'house' },
  { id: 'house interior dining table', parts: diningTableParts(), triangles: DINING_TABLE_TRIANGLES, volume: 'house' },
  { id: 'house interior dining chair north 0', parts: chairParts(true), triangles: CHAIR_TRIANGLES, volume: 'house' },
  { id: 'house interior dining chair north 1', parts: chairParts(true), triangles: CHAIR_TRIANGLES, volume: 'house' },
  { id: 'house interior dining chair south 0', parts: chairParts(false), triangles: CHAIR_TRIANGLES, volume: 'house' },
  { id: 'house interior dining chair south 1', parts: chairParts(false), triangles: CHAIR_TRIANGLES, volume: 'house' },
]);

const GARAGE_GROUPS: readonly Group[] = Object.freeze([
  { id: 'garage interior bench dressing', parts: workbenchDressingParts(), triangles: WORKBENCH_DRESSING_TRIANGLES, volume: 'garage' },
  { id: 'garage interior racking', parts: rackingBoxesParts(), triangles: RACKING_BOXES_TRIANGLES, volume: 'garage' },
  { id: 'garage interior oil stain', parts: oilStainParts(), triangles: OIL_STAIN_TRIANGLES, volume: 'garage' },
]);

const ALL_GROUPS: readonly Group[] = Object.freeze([...HOUSE_GROUPS, ...GARAGE_GROUPS]);

function buildOnce(): ReturnType<typeof buildNuketown2> {
  return buildNuketown2(new THREE.Scene());
}

function kitMeshes(map: ReturnType<typeof buildNuketown2>, group: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  map.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.name.startsWith(`nuketown2 north ${group} `) || node.name.startsWith(`nuketown2 south ${group} `)) out.push(node);
  });
  return out;
}

function meshBox(mesh: THREE.Mesh): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const bounds = new THREE.Box3().setFromObject(mesh);
  return {
    minX: bounds.min.x, maxX: bounds.max.x,
    minY: bounds.min.y, maxY: bounds.max.y,
    minZ: bounds.min.z, maxZ: bounds.max.z,
  };
}

describe('forge-kit interior prefabs (HF-536 night-muse-interiors)', () => {
  it('declares one box per part and honest triangle constants', () => {
    for (const group of ALL_GROUPS) {
      expect(group.triangles, `${group.id} constant`).toBe(group.parts.length * INTERIOR_BOX_TRIANGLES);
    }
    const houseBoxes = HOUSE_GROUPS.reduce((sum, group) => sum + group.parts.length, 0);
    expect(houseBoxes, 'house box count').toBe(HOUSE_INTERIOR_BOXES);
    expect(HOUSE_INTERIOR_TRIANGLES, 'house triangles').toBe(HOUSE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES);
    expect(HOUSE_INTERIOR_TRIANGLES, 'house budget 14,000').toBeLessThanOrEqual(14000);
    const garageBoxes = GARAGE_GROUPS.reduce((sum, group) => sum + group.parts.length, 0);
    expect(garageBoxes, 'garage box count').toBe(GARAGE_INTERIOR_BOXES);
    expect(GARAGE_INTERIOR_TRIANGLES, 'garage triangles').toBe(GARAGE_INTERIOR_BOXES * INTERIOR_BOX_TRIANGLES);
    expect(GARAGE_INTERIOR_TRIANGLES, 'garage budget 4,000').toBeLessThanOrEqual(4000);
  });

  it('emits both houses and both garages through pair(), as 12-tri boxes', () => {
    const map = buildOnce();
    for (const group of ALL_GROUPS) {
      const meshes = kitMeshes(map, group.id);
      expect(meshes.length, `${group.id} emits both halves`).toBe(group.parts.length * 2);
      let tris = 0;
      for (const mesh of meshes) {
        const geometry = mesh.geometry as THREE.BoxGeometry;
        expect(geometry.parameters?.width, `${mesh.name} is a box`).toBeDefined();
        expect(mesh.geometry.index?.count ?? 0, `${mesh.name} tris`).toBe(INTERIOR_BOX_TRIANGLES * 3);
        tris += (mesh.geometry.index?.count ?? 0) / 3;
      }
      expect(tris, `${group.id} total tris`).toBe(group.triangles * 2);
    }
  });

  it('uses existing material roles only, and mints no new material', () => {
    const roles = new Set<string>(INTERIOR_ROLES as readonly string[]);
    for (const group of ALL_GROUPS) {
      for (const part of group.parts) {
        expect(roles.has(part.role), `${group.id} ${part.suffix} role '${part.role}' exists`).toBe(true);
        for (const value of [...part.offset, ...part.size]) {
          expect(Number.isFinite(value), `${group.id} ${part.suffix} has no NaN`).toBe(true);
        }
        expect(part.size[0]! > 0 && part.size[1]! > 0 && part.size[2]! > 0, `${group.id} ${part.suffix} has positive size`).toBe(true);
      }
    }
    // No new material: every kit mesh's material instance is shared with at
    // least one mesh the kit did not emit (the arena's own bodies).
    const map = buildOnce();
    const materialUsers = new Map<string, { kit: number; other: number }>();
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || Array.isArray(node.material) || !node.material) return;
      const kit = node.name.includes(' interior ') && !node.name.includes('presentation-batch');
      const entry = materialUsers.get(node.material.uuid) ?? { kit: 0, other: 0 };
      if (kit) entry.kit += 1; else entry.other += 1;
      materialUsers.set(node.material.uuid, entry);
    });
    for (const group of ALL_GROUPS) {
      for (const mesh of kitMeshes(map, group.id)) {
        const material = mesh.material as THREE.Material;
        const entry = materialUsers.get(material.uuid)!;
        expect(entry.other, `${mesh.name} reuses an existing arena material`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every prefab inside its interior volume and above its floor', () => {
    const map = buildOnce();
    const volumesBySide = volumes();
    for (const group of ALL_GROUPS) {
      for (const side of ['north', 'south'] as const) {
        const volume = group.volume === 'house'
          ? volumesBySide[side === 'north' ? 'north' : 'south']
          : volumesBySide[side === 'north' ? 'garageNorth' : 'garageSouth'];
        const meshes = kitMeshes(map, group.id)
          .filter((mesh) => mesh.name.startsWith(`nuketown2 ${side} `));
        expect(meshes.length, `${side} ${group.id} halves`).toBe(group.parts.length);
        for (const mesh of meshes) {
          const box = meshBox(mesh);
          for (const value of [box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ]) {
            expect(Number.isFinite(value), `${mesh.name} world AABB has no NaN`).toBe(true);
          }
          expect(box.minX, `${mesh.name} inside west wall`).toBeGreaterThanOrEqual(volume.minX - 1e-6);
          expect(box.maxX, `${mesh.name} inside east wall`).toBeLessThanOrEqual(volume.maxX + 1e-6);
          expect(box.minZ, `${mesh.name} inside back wall`).toBeGreaterThanOrEqual(volume.minZ - 1e-6);
          expect(box.maxZ, `${mesh.name} inside front wall`).toBeLessThanOrEqual(volume.maxZ + 1e-6);
          // 5 mm sink into the supporting top is the kit's seating convention;
          // anything lower is a buried or floating part, not furniture.
          expect(box.minY, `${mesh.name} above its floor`).toBeGreaterThanOrEqual(volume.floorTop - 0.02);
          expect(box.maxY, `${mesh.name} below its ceiling`).toBeLessThanOrEqual(volume.ceiling + 1e-6);
        }
      }
    }
  });

  it('adds no movement collider, shot surface or ballistic id', () => {
    const map = buildOnce();
    const surfacesByName = new Map(map.shotSurfaces.map((surface) => [surface.name, surface]));
    for (const group of ALL_GROUPS) {
      for (const mesh of kitMeshes(map, group.id)) {
        expect(mesh.userData.presentationOnly, `${mesh.name} presentationOnly`).toBe(true);
        expect(mesh.userData.ballisticSurfaceId, `${mesh.name} claims no shot surface`).toBeUndefined();
        expect(surfacesByName.has(mesh.name), `${mesh.name} is no ballistic surface`).toBe(false);
        const box = meshBox(mesh);
        const solid = map.colliders.some((bounds) => (
          Math.abs(bounds.minX - box.minX) < 1e-6 && Math.abs(bounds.maxX - box.maxX) < 1e-6
          && Math.abs(bounds.minZ - box.minZ) < 1e-6 && Math.abs(bounds.maxZ - box.maxZ) < 1e-6
        ));
        expect(solid, `${mesh.name} owns no movement collider`).toBe(false);
      }
    }
  });
});
