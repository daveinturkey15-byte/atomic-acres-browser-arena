import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_HOUSE_STAIR,
  NUKETOWN2_SPAWN_LAYOUT,
  NUKETOWN2_STAIRWELL,
  buildNuketown2,
} from '../../nuketown2-arena';
import {
  NUKETOWN2_GARAGE_SPAN,
  NUKETOWN2_GROUND_FLOOR_TOP,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_UPPER_Y0,
  nuketown2HandedX as hx,
} from '../../nuketown2-layout';
import {
  ARMCHAIR_TRIANGLES,
  CHAIR_TRIANGLES,
  COFFEE_TABLE_TRIANGLES,
  DINING_TABLE_TRIANGLES,
  FLOOR_LAMP_TRIANGLES,
  FRIDGE_TRIANGLES,
  GARAGE_INTERIOR_BOXES,
  GARAGE_INTERIOR_TRIANGLES,
  HOUSE_INTERIORS2_BOXES,
  HOUSE_INTERIORS2_BUDGET,
  HOUSE_INTERIORS2_TRIANGLES,
  HOUSE_INTERIOR_BOXES,
  HOUSE_INTERIOR_TRIANGLES,
  INTERIOR_BOX_TRIANGLES,
  INTERIOR_ROLES,
  KETTLE_PAIR_TRIANGLES,
  KITCHEN_RUN_TRIANGLES,
  OIL_STAIN_TRIANGLES,
  PENDANTS_TRIANGLES,
  PICTURES_TRIANGLES,
  RACKING_BOXES_TRIANGLES,
  RUG_TRIANGLES,
  SHELF_UNIT_TRIANGLES,
  SKIRTING_TRIANGLES,
  SOFA_TRIANGLES,
  SWITCHES_TRIANGLES,
  TV_UNIT_TRIANGLES,
  UPPER_BACK_BEDROOM_TRIANGLES,
  UPPER_FRONT_BEDROOM_TRIANGLES,
  WALL_ART_TRIANGLES,
  WORKBENCH_DRESSING_TRIANGLES,
  armchairParts,
  chairParts,
  coffeeTableParts,
  diningTableParts,
  floorLampParts,
  fridgeParts,
  kettlePairParts,
  kitchenRunParts,
  oilStainParts,
  pendantParts,
  pictureParts,
  rackingBoxesParts,
  rugParts,
  shelfUnitParts,
  skirtingParts,
  sofaParts,
  switchParts,
  tvUnitParts,
  upperBackBedroomParts,
  upperFrontBedroomParts,
  wallArtParts,
  workbenchDressingParts,
  type InteriorPart,
} from './prefabs';

/**
 * HF-536 NIGHT-MUSE-INTERIORS (+ INTERIORS-2) — the interior kit's proof gates.
 *
 * Budgets: <= 14,000 tris for everything in one house, <= 4,000 for the
 * garage (brief sec. "Place them"); interiors-2 adds <= 3,200 tris per house.
 * Authority: every prefab is presentation-only — no movement collider, no shot
 * surface, no ballistic id — so the movement/shot authority the interiors +
 * fidelity gates own is byte-identical with the kit on or off. That is
 * asserted as a PROPERTY (no kit mesh owns authority) rather than a pinned
 * count, so this file cannot drift from the roster when another lane adds
 * furniture.
 *
 * INTERIORS-2 scoping (brief proof bullets). The pass-1 groups keep their own
 * conventions (5 mm sink, ground volumes); the strict gates below cover only
 * the NEW groups: 0.01 m room inset for every new part; 1.2 m plan clearance
 * from the stair volume, the applicable doorway runs and every spawn pad for
 * every new FLOOR-STANDING part. Wall/ceiling dressing (skirting, pictures,
 * pendants, switches) is exempt from the 1.2 m rule by design — a switch
 * beside a doorway cannot stand 1.2 m from it — and dressing stacked on an
 * existing solid (mattress on the bed solid, kettle on the counter solid)
 * takes no new floor footprint, so it is exempt too.
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
function volumes(): {
  north: Volume; south: Volume; upperNorth: Volume; upperSouth: Volume;
  garageNorth: Volume; garageSouth: Volume;
} {
  const innerX0 = HOUSE_X0 + WALL_T;
  const innerX1 = HOUSE_X1 - WALL_T;
  const innerZ0 = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH + WALL_T;
  const innerZ1 = NUKETOWN2_HOUSE_FRONT_Z - WALL_T;
  const floor = NUKETOWN2_GROUND_FLOOR_TOP;
  const ceiling = NUKETOWN2_GROUND_STOREY_H;
  const upperFloor = NUKETOWN2_UPPER_Y0;
  const upperCeiling = NUKETOWN2_UPPER_Y0 + 2.9;
  // pair() mirrors x by HANDEDNESS (-1) for the north emission and negates
  // both axes for the south: north world x is [-innerX1, -innerX0].
  return {
    north: { minX: -innerX1, maxX: -innerX0, minZ: innerZ0, maxZ: innerZ1, floorTop: floor, ceiling },
    south: { minX: innerX0, maxX: innerX1, minZ: -innerZ1, maxZ: -innerZ0, floorTop: floor, ceiling },
    upperNorth: { minX: -innerX1, maxX: -innerX0, minZ: innerZ0, maxZ: innerZ1, floorTop: upperFloor, ceiling: upperCeiling },
    upperSouth: { minX: innerX0, maxX: innerX1, minZ: -innerZ1, maxZ: -innerZ0, floorTop: upperFloor, ceiling: upperCeiling },
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

/** The interiors-2 slice: upper bedrooms, wall dressing, ground gaps. */
const NEW_HOUSE_GROUPS: readonly Group[] = Object.freeze([
  { id: 'house interior upper bedroom back', parts: upperBackBedroomParts(), triangles: UPPER_BACK_BEDROOM_TRIANGLES, volume: 'house' },
  { id: 'house interior upper bedroom front', parts: upperFrontBedroomParts(), triangles: UPPER_FRONT_BEDROOM_TRIANGLES, volume: 'house' },
  { id: 'house interior skirting', parts: skirtingParts(), triangles: SKIRTING_TRIANGLES, volume: 'house' },
  { id: 'house interior pictures', parts: pictureParts(), triangles: PICTURES_TRIANGLES, volume: 'house' },
  { id: 'house interior pendants', parts: pendantParts(), triangles: PENDANTS_TRIANGLES, volume: 'house' },
  { id: 'house interior switches', parts: switchParts(), triangles: SWITCHES_TRIANGLES, volume: 'house' },
  { id: 'house interior tv unit', parts: tvUnitParts(), triangles: TV_UNIT_TRIANGLES, volume: 'house' },
  { id: 'house interior fridge', parts: fridgeParts(), triangles: FRIDGE_TRIANGLES, volume: 'house' },
  { id: 'house interior kettle pair', parts: kettlePairParts(), triangles: KETTLE_PAIR_TRIANGLES, volume: 'house' },
]);

const GARAGE_GROUPS: readonly Group[] = Object.freeze([
  { id: 'garage interior bench dressing', parts: workbenchDressingParts(), triangles: WORKBENCH_DRESSING_TRIANGLES, volume: 'garage' },
  { id: 'garage interior racking', parts: rackingBoxesParts(), triangles: RACKING_BOXES_TRIANGLES, volume: 'garage' },
  { id: 'garage interior oil stain', parts: oilStainParts(), triangles: OIL_STAIN_TRIANGLES, volume: 'garage' },
]);
const ALL_GROUPS: readonly Group[] = Object.freeze([...HOUSE_GROUPS, ...NEW_HOUSE_GROUPS, ...GARAGE_GROUPS]);
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
    expect(houseBoxes, 'pass-1 house box count').toBe(HOUSE_INTERIOR_BOXES - HOUSE_INTERIORS2_BOXES);
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
    // Pass-1 groups only: the strict 0.01 m inset gate below owns the new groups.
    for (const group of [...HOUSE_GROUPS, ...GARAGE_GROUPS]) {
      for (const side of ['north', 'south'] as const) {
        const meshes = kitMeshes(map, group.id)
          .filter((mesh) => mesh.name.startsWith(`nuketown2 ${side} `));
        expect(meshes.length, `${side} ${group.id} halves`).toBe(group.parts.length);
        for (const mesh of meshes) {
          const box = meshBox(mesh);
          // Interiors-2 groups span both storeys: resolve the volume per mesh.
          const upper = group.volume === 'house' && box.minY > NUKETOWN2_GROUND_STOREY_H;
          const volume = group.volume === 'garage'
            ? volumesBySide[side === 'north' ? 'garageNorth' : 'garageSouth']
            : upper
              ? volumesBySide[side === 'north' ? 'upperNorth' : 'upperSouth']
              : volumesBySide[side === 'north' ? 'north' : 'south'];
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

  it('counts interiors-2 boxes and holds the 3,200-tri budget', () => {
    const boxes = NEW_HOUSE_GROUPS.reduce((sum, group) => sum + group.parts.length, 0);
    expect(boxes, 'interiors-2 box count').toBe(HOUSE_INTERIORS2_BOXES);
    expect(HOUSE_INTERIORS2_TRIANGLES, 'interiors-2 triangles').toBe(HOUSE_INTERIORS2_BOXES * INTERIOR_BOX_TRIANGLES);
    expect(HOUSE_INTERIORS2_TRIANGLES, 'brief budget 3,200').toBeLessThanOrEqual(HOUSE_INTERIORS2_BUDGET);
    // Shelf contract from the brief: 4 shelf strips and 12-18 book blocks per bookshelf.
    for (const parts of [upperBackBedroomParts(), upperFrontBedroomParts()]) {
      const shelves = parts.filter((p) => p.suffix.startsWith('shelf board'));
      const books = parts.filter((p) => p.suffix.includes('book r'));
      expect(shelves.length, 'shelf strips per bookshelf').toBe(4);
      expect(books.length, 'book blocks per bookshelf').toBeGreaterThanOrEqual(12);
      expect(books.length, 'book blocks per bookshelf').toBeLessThanOrEqual(18);
    }
  });

  it('emits identical north/south counts for every interiors-2 group (pair)', () => {
    const map = buildOnce();
    for (const group of NEW_HOUSE_GROUPS) {
      for (const side of ['north', 'south'] as const) {
        const count = kitMeshes(map, group.id)
          .filter((mesh) => mesh.name.startsWith(`nuketown2 ${side} `)).length;
        expect(count, `${side} ${group.id} count`).toBe(group.parts.length);
      }
    }
  });

  it('keeps every interiors-2 part 0.01 m inside its room volume', () => {
    // Authored inset bounds: lining faces inset 0.01, floor/ceiling inset 0.01.
    const inset = (side: 'north' | 'south', upper: boolean): Volume => {
      const x: Volume = side === 'north'
        ? { minX: -3.92, maxX: 6.42 } as unknown as Volume
        : { minX: -6.42, maxX: 3.92 } as unknown as Volume;
      const z: readonly [number, number] = upper
        ? (side === 'north' ? [-22.69, -10.31] : [10.31, 22.69])
        : (side === 'north' ? [-22.67, -10.33] : [10.33, 22.67]);
      const y: readonly [number, number] = upper ? [3.31, 6.19] : [0.09, 2.99];
      return { minX: x.minX, maxX: x.maxX, minZ: z[0]!, maxZ: z[1]!, floorTop: y[0]!, ceiling: y[1]! };
    };
    const map = buildOnce();
    for (const group of NEW_HOUSE_GROUPS) {
      for (const side of ['north', 'south'] as const) {
        for (const mesh of kitMeshes(map, group.id).filter((m) => m.name.startsWith(`nuketown2 ${side} `))) {
          const box = meshBox(mesh);
          const volume = inset(side, box.minY > NUKETOWN2_GROUND_STOREY_H);
          expect(box.minX, `${mesh.name} 0.01 off west face`).toBeGreaterThanOrEqual(volume.minX - 1e-6);
          expect(box.maxX, `${mesh.name} 0.01 off east face`).toBeLessThanOrEqual(volume.maxX + 1e-6);
          expect(box.minZ, `${mesh.name} 0.01 off back face`).toBeGreaterThanOrEqual(volume.minZ - 1e-6);
          expect(box.maxZ, `${mesh.name} 0.01 off front face`).toBeLessThanOrEqual(volume.maxZ + 1e-6);
          expect(box.minY, `${mesh.name} 0.01 above floor`).toBeGreaterThanOrEqual(volume.floorTop - 1e-6);
          expect(box.maxY, `${mesh.name} 0.01 below ceiling`).toBeLessThanOrEqual(volume.ceiling + 1e-6);
        }
      }
    }
  });

  it('keeps new floor footprints 1.2 m clear of the stair, doorway runs and spawns', () => {
    const map = buildOnce();
    const toWorld = (side: 'north' | 'south', ax: number, az: number): readonly [number, number] =>
      side === 'north' ? [hx(ax), az] : [ax, -az];
    const rectOf = (
      side: 'north' | 'south', ax0: number, ax1: number, az0: number, az1: number,
    ): { x0: number; x1: number; z0: number; z1: number } => {
      const [ax, az] = [toWorld(side, ax0, az0), toWorld(side, ax1, az1)];
      return {
        x0: Math.min(ax[0]!, az[0]!), x1: Math.max(ax[0]!, az[0]!),
        z0: Math.min(ax[1]!, az[1]!), z1: Math.max(ax[1]!, az[1]!),
      };
    };
    const dist = (
      a: { x0: number; x1: number; z0: number; z1: number },
      b: { x0: number; x1: number; z0: number; z1: number },
    ): number => {
      const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
      const dz = Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1));
      return Math.hypot(dx, dz);
    };
    const stair = {
      x0: NUKETOWN2_HOUSE_STAIR.x0,
      x1: NUKETOWN2_HOUSE_STAIR.x0 + NUKETOWN2_HOUSE_STAIR.width,
      z0: NUKETOWN2_STAIRWELL.footZ,
      z1: NUKETOWN2_STAIRWELL.headZ,
    };
    const band = 0.76;
    interface FlatRect { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
    const doorRects = (upper: boolean): FlatRect[] => {
      const ids = upper
        ? ['house internal door', 'house balcony door']
        : ['house front door', 'house back door', 'house internal door', 'house garage link'];
      return NUKETOWN2_DOORWAYS.filter((door) => ids.includes(door.id)).map((door) => {
        const half = door.width / 2;
        return door.span === 'x'
          ? { x0: door.centre - half, x1: door.centre + half, z0: door.at - band, z1: door.at + band }
          : { x0: door.at - band, x1: door.at + band, z0: door.centre - half, z1: door.centre + half };
      });
    };
    const spawns: Array<readonly [number, number]> = [
      ...NUKETOWN2_SPAWN_LAYOUT[0]!, ...NUKETOWN2_SPAWN_LAYOUT[1]!,
    ];
    for (const group of NEW_HOUSE_GROUPS) {
      for (const side of ['north', 'south'] as const) {
        const stairRect = rectOf(side, stair.x0, stair.x1, stair.z0, stair.z1);
        for (const mesh of kitMeshes(map, group.id).filter((m) => m.name.startsWith(`nuketown2 ${side} `))) {
          const box = meshBox(mesh);
          const upper = box.minY > NUKETOWN2_GROUND_STOREY_H;
          const floorTop = upper ? NUKETOWN2_UPPER_Y0 : NUKETOWN2_GROUND_FLOOR_TOP;
          // Wall-mounted dressing (skirting, pictures, switches) stands on the
          // walls by design; the inset gate above proves where it stands.
          if (group.id === 'house interior skirting' || group.id === 'house interior pictures' || group.id === 'house interior switches') continue;
          // Wall/ceiling dressing and high clutter take no walkable footprint.
          // Dressing stacked on a furniture-height solid takes no NEW footprint.
          const dressed = map.colliders.some((bounds) => (
            (bounds.maxY ?? Infinity) > floorTop + 0.5
            && box.minY >= (bounds.maxY ?? Infinity) - 0.02
            && box.minX < bounds.maxX && box.maxX > bounds.minX
            && box.minZ < bounds.maxZ && box.maxZ > bounds.minZ
          ));
          if (dressed) continue;
          const footprint = { x0: box.minX, x1: box.maxX, z0: box.minZ, z1: box.maxZ };
          const doors = upper ? doorRects(true) : doorRects(false);
          const applicable = [stairRect, ...doors.map((r) => rectOf(side, r.x0, r.x1, r.z0, r.z1))];
          for (const rect of applicable) {
            expect(dist(footprint, rect), `${mesh.name} 1.2 m from route`).toBeGreaterThanOrEqual(1.2 - 1e-9);
          }
          for (const [sx, sz] of spawns) {
            const spawn = { x0: sx, x1: sx, z0: sz, z1: sz };
            expect(dist(footprint, spawn), `${mesh.name} 1.2 m from spawn (${sx}, ${sz})`)
              .toBeGreaterThanOrEqual(1.2 - 1e-9);
          }
        }
      }
    }
  });
});
