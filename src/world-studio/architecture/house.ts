/**
 * HF-571 world-studio architecture: the two-storey suburban test house.
 *
 * One parametric builder authors both houses. They are mirrored across the road (teal at
 * X = -20 facing +X, yellow at X = +20 facing -X) and differ only in palette and masonry,
 * so the two sides of the map are gameplay-identical the way the Nuke Town loops require.
 *
 * LOCAL COORDINATES (converted to world by `wx`/`wz` below):
 *   +localX is the STREET side, -localX is the BACKYARD side, +localZ is the GARAGE side.
 *   Main block is 14 m (localX -7..7) by 18 m (localZ -9..9); the garage wing is 8 x 10 m
 *   centred on the house at localZ 9..19, i.e. world Z 9..19 with its centre at Z = +14.
 *
 * LEVELS: finished ground floor 0.08, finished upper floor 3.30 (both from the coordinate
 * contract), 3.0 m clear per storey, eave 6.45, ridge 8.0.
 *
 * Ground: living room and entry hall on the street side, dining and kitchen on the yard
 * side, straight stair in the hall. Upper: master bedroom over the living room with two
 * street-facing windows for the cross-street duel, study with a balcony door, back hall and
 * a second bedroom that opens onto the garage roof. Every route is a real aperture in both
 * the presentation and the collision set - see `studio-architecture.test.ts`.
 */

import * as THREE from 'three';
import type { BallisticMaterialId } from '../../ballistics';
import type { Box2 } from '../../collision';
import type { ArenaVerticalNavigation, VerticalPlatform, VerticalRamp, VerticalRoute } from '../../vertical-navigation';
import { studioBoxGeometry, StudioSurfaceCollector, type ContactShading } from './build';
import type { StudioMaterialId } from './materials';

export const HOUSE_HALF_WIDTH = 7;
export const HOUSE_HALF_DEPTH = 9;
export const GROUND_FLOOR_Y = 0.08;
export const UPPER_FLOOR_Y = 3.3;
export const UPPER_CEILING_Y = 6.3;
export const EAVE_Y = 6.45;
export const RIDGE_Y = 8;
export const GARAGE_ROOF_Y = 3.5;

const WALL = 0.22;
const PARTITION = 0.14;
const SLAB = 0.22;
const INNER_X = HOUSE_HALF_WIDTH - WALL;
const INNER_Z = HOUSE_HALF_DEPTH - WALL;
const LINING = 0.04;
const EAVE_OVERHANG = 0.5;
const RAKE_OVERHANG = 0.4;
const ROOF_THICKNESS = 0.22;
const ROOF_RUN = HOUSE_HALF_WIDTH + EAVE_OVERHANG;
const ROOF_PITCH = Math.atan2(RIDGE_Y - EAVE_Y, ROOF_RUN);

const STAIR_STEPS = 16;
const STAIR_RISE = (UPPER_FLOOR_Y - GROUND_FLOOR_Y) / STAIR_STEPS;
const STAIR_GOING = 0.28125;
const STAIR_RUN = STAIR_STEPS * STAIR_GOING;
const STAIR_X0 = 0.12;
const STAIR_X1 = 1.37;
const STAIR_Z0 = 2.2;
const STAIR_HOLE: Readonly<{ x0: number; x1: number; z0: number; z1: number }> = {
  x0: 0.08,
  x1: 1.55,
  z0: 2.55,
  z1: STAIR_Z0 + STAIR_RUN,
};

const GARAGE_HALF_X = 4;
const GARAGE_Z0 = 9;
const GARAGE_Z1 = 19;

// The contracted 14 m footprint leaves only 3 m between the front wall (X = 13) and the
// road edge (X = 10), so the porch is a 1.6 m deep entry rather than the deep verandah the
// reference angle suggests; the step still lands clear of the kerb.
const PORCH_X0 = HOUSE_HALF_WIDTH;
const PORCH_X1 = 8.6;
const PORCH_Z0 = 0.6;
const PORCH_Z1 = 7.2;
const PORCH_Y = 0.16;

const BALCONY_X0 = -9.4;
const BALCONY_X1 = -HOUSE_HALF_WIDTH;
const BALCONY_Z0 = -6.6;
const BALCONY_Z1 = -0.8;

export type HouseSide = 'teal' | 'yellow';

export type HouseConfig = Readonly<{
  id: string;
  side: HouseSide;
  centreX: number;
  /** +1 when the street-facing wall points along +X. */
  frontSign: 1 | -1;
  siding: StudioMaterialId;
  masonry: StudioMaterialId;
  accent: StudioMaterialId;
}>;

export type FurnitureAnchor = Readonly<{
  id: string;
  room: string;
  position: readonly [number, number, number];
  /** Yaw in radians; the anchor's +Z points into the room. */
  yaw: number;
  footprint: readonly [number, number];
}>;

export type HouseBuild = Readonly<{
  routes: VerticalRoute[];
  ramps: VerticalRamp[];
  platforms: VerticalPlatform[];
  anchors: FurnitureAnchor[];
  reviewPoints: Array<{ id: string; position: [number, number, number]; target: [number, number, number] }>;
}>;

type WallKey = 'front' | 'rear' | 'sideA' | 'sideB';

type OpeningKind = 'window' | 'door' | 'slider' | 'cased' | 'garage';

type Opening = Readonly<{
  id: string;
  /** Extent along the wall in LOCAL coordinates (localZ for front/rear, localX for sides). */
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  kind: OpeningKind;
  /** Which end of the opening the open door leaf rests against. */
  swing?: -1 | 1;
  /** Vertical mullion count for wide windows. */
  mullions?: number;
}>;

const EXTERIOR_CONTACT: ContactShading = { floorY: 0, floorStrength: 0.26, floorHeight: 0.8 };

function groundContact(tint = 1): ContactShading {
  return { floorY: GROUND_FLOOR_Y, floorStrength: 0.24, floorHeight: 0.55, ceilingY: UPPER_FLOOR_Y - SLAB, ceilingStrength: 0.14, tint };
}

function upperContact(tint = 1): ContactShading {
  return { floorY: UPPER_FLOOR_Y, floorStrength: 0.24, floorHeight: 0.55, ceilingY: UPPER_CEILING_Y, ceilingStrength: 0.14, tint };
}

/**
 * Builds one house into `collector` and returns its navigation, furniture anchors and
 * review cameras in world coordinates.
 */
export function buildHouse(collector: StudioSurfaceCollector, config: HouseConfig): HouseBuild {
  const { id, centreX, frontSign, siding, masonry, accent } = config;
  const group = `${id}`;
  const wx = (localX: number): number => centreX + frontSign * localX;
  const spanX = (a: number, b: number): [number, number] => {
    const left = wx(a);
    const right = wx(b);
    return left <= right ? [left, right] : [right, left];
  };

  const routes: VerticalRoute[] = [];
  const ramps: VerticalRamp[] = [];
  const platforms: VerticalPlatform[] = [];
  const anchors: FurnitureAnchor[] = [];
  const reviewPoints: Array<{ id: string; position: [number, number, number]; target: [number, number, number] }> = [];

  /** Adds an axis-aligned box given LOCAL x/z ranges and world Y. */
  const box = (
    partId: string,
    material: StudioMaterialId,
    ballistic: BallisticMaterialId | null,
    lx0: number,
    lx1: number,
    y0: number,
    y1: number,
    lz0: number,
    lz1: number,
    contact?: ContactShading,
    uvSwap?: boolean,
  ): void => {
    const [minX, maxX] = spanX(lx0, lx1);
    collector.addBox({
      id: `${id}-${partId}`,
      group,
      material,
      ballistic,
      min: [minX, Math.min(y0, y1), Math.min(lz0, lz1)],
      max: [maxX, Math.max(y0, y1), Math.max(lz0, lz1)],
      contact,
      uvSwap,
    });
  };

  const rotatedBox = (
    partId: string,
    material: StudioMaterialId,
    ballistic: BallisticMaterialId | null,
    centre: readonly [number, number, number],
    size: readonly [number, number, number],
    rotation: readonly [number, number, number],
  ): void => {
    const half: [number, number, number] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const geometry = studioBoxGeometry({
      id: `${id}-${partId}`,
      group,
      material,
      ballistic: null,
      min: [-half[0], -half[1], -half[2]],
      max: [half[0], half[1], half[2]],
    });
    const matrix = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'),
    );
    matrix.setPosition(centre[0], centre[1], centre[2]);
    geometry.applyMatrix4(matrix);
    collector.addGeometry(group, material, geometry);
    if (ballistic) {
      collector.addCollider(
        `${id}-${partId}`,
        `${group}:${material}`,
        {
          minX: centre[0] - half[0],
          maxX: centre[0] + half[0],
          minY: centre[1] - half[1],
          maxY: centre[1] + half[1],
          minZ: centre[2] - half[2],
          maxZ: centre[2] + half[2],
          rotation: [rotation[0], rotation[1], rotation[2]],
        },
        ballistic,
      );
    }
  };

  // ---------------------------------------------------------------- wall frame

  type WallFrame = Readonly<{
    axis: 'x' | 'z';
    at: number;
    thickness: number;
    /** Outward unit direction on the wall's perpendicular world axis. */
    outward: number;
    from: number;
    to: number;
    /** Converts a LOCAL along-wall coordinate to world. */
    u: (local: number) => number;
  }>;

  const WALLS: Readonly<Record<WallKey, WallFrame>> = {
    front: {
      axis: 'z',
      at: wx(HOUSE_HALF_WIDTH - WALL / 2),
      thickness: WALL,
      outward: frontSign,
      from: -HOUSE_HALF_DEPTH,
      to: HOUSE_HALF_DEPTH,
      u: (local) => local,
    },
    rear: {
      axis: 'z',
      at: wx(-(HOUSE_HALF_WIDTH - WALL / 2)),
      thickness: WALL,
      outward: -frontSign,
      from: -HOUSE_HALF_DEPTH,
      to: HOUSE_HALF_DEPTH,
      u: (local) => local,
    },
    sideA: {
      axis: 'x',
      at: -(HOUSE_HALF_DEPTH - WALL / 2),
      thickness: WALL,
      outward: -1,
      from: wx(-HOUSE_HALF_WIDTH),
      to: wx(HOUSE_HALF_WIDTH),
      u: wx,
    },
    sideB: {
      axis: 'x',
      at: HOUSE_HALF_DEPTH - WALL / 2,
      thickness: WALL,
      outward: 1,
      from: wx(-HOUSE_HALF_WIDTH),
      to: wx(HOUSE_HALF_WIDTH),
      u: wx,
    },
  };

  /** Emits a box described in (along-wall u, world y, perpendicular n) wall space. */
  const wallPart = (
    frame: WallFrame,
    partId: string,
    material: StudioMaterialId,
    ballistic: BallisticMaterialId | null,
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    n0: number,
    n1: number,
    contact?: ContactShading,
    uvSwap?: boolean,
  ): void => {
    const uMin = Math.min(u0, u1);
    const uMax = Math.max(u0, u1);
    const nMin = frame.at + Math.min(n0, n1);
    const nMax = frame.at + Math.max(n0, n1);
    collector.addBox({
      id: `${id}-${partId}`,
      group,
      material,
      ballistic,
      min: frame.axis === 'x' ? [uMin, y0, nMin] : [nMin, y0, uMin],
      max: frame.axis === 'x' ? [uMax, y1, nMax] : [nMax, y1, uMax],
      contact,
      uvSwap,
    });
  };

  /**
   * Casing, sill, glazing and - for doors - a leaf resting flat against the interior wall
   * so the aperture stays physically open. Nothing opaque ever spans the opening.
   */
  const dressOpening = (wallKey: WallKey, opening: Opening): void => {
    const frame = WALLS[wallKey];
    const u0 = Math.min(frame.u(opening.u0), frame.u(opening.u1));
    const u1 = Math.max(frame.u(opening.u0), frame.u(opening.u1));
    const out = frame.outward;
    const half = frame.thickness / 2;
    const face = out * half;
    const casing = 0.1;
    const proud = out * 0.05;
    const key = `${wallKey}-${opening.id}`;

    if (opening.kind !== 'cased') {
      // Exterior casing: head, jambs and a projecting sill with a drip edge.
      wallPart(frame, `${key}-casing-head`, 'trim', null, u0 - casing, u1 + casing, opening.y1, opening.y1 + casing, face, face + proud);
      wallPart(frame, `${key}-casing-jamb-a`, 'trim', null, u0 - casing, u0, opening.y0, opening.y1, face, face + proud, undefined, true);
      wallPart(frame, `${key}-casing-jamb-b`, 'trim', null, u1, u1 + casing, opening.y0, opening.y1, face, face + proud, undefined, true);
      if (opening.kind === 'window') {
        wallPart(frame, `${key}-sill`, 'trim', null, u0 - casing - 0.05, u1 + casing + 0.05, opening.y0 - 0.07, opening.y0, face, face + out * 0.11);
        wallPart(frame, `${key}-drip`, 'trim', null, u0 - casing - 0.05, u1 + casing + 0.05, opening.y1 + casing, opening.y1 + casing + 0.05, face, face + out * 0.09);
      }
    }

    // Reveal lining so the aperture edge never shows an untextured wall cut.
    wallPart(frame, `${key}-reveal-head`, 'trim', null, u0, u1, opening.y1 - 0.03, opening.y1, -half, half);
    if (opening.kind !== 'garage') {
      wallPart(frame, `${key}-reveal-jamb-a`, 'trim', null, u0, u0 + 0.03, opening.y0, opening.y1, -half, half, undefined, true);
      wallPart(frame, `${key}-reveal-jamb-b`, 'trim', null, u1 - 0.03, u1, opening.y0, opening.y1, -half, half, undefined, true);
    }

    if (opening.kind === 'window' || opening.kind === 'slider') {
      const inset = 0.04;
      // A slider is glazed over ONE leaf only: the other half is the route the brief needs,
      // so no pane ever spans a doorway the player is meant to walk through.
      const glassU1 = opening.kind === 'slider' ? (u0 + u1) / 2 : u1 - inset;
      wallPart(frame, `${key}-glass`, 'glass', 'glass', u0 + inset, glassU1, opening.y0 + inset, opening.y1 - inset, -0.015, 0.015);
      const bars = opening.mullions ?? (u1 - u0 > 2.4 ? 2 : 1);
      for (let bar = 1; bar <= bars; bar++) {
        const position = u0 + ((glassU1 - u0) * bar) / (bars + 1);
        wallPart(frame, `${key}-mullion-${bar}`, 'trim', null, position - 0.03, position + 0.03, opening.y0 + inset, opening.y1 - inset, -0.035, 0.035, undefined, true);
      }
      if (opening.kind === 'window') {
        const mid = (opening.y0 + opening.y1) / 2;
        wallPart(frame, `${key}-transom`, 'trim', null, u0 + inset, u1 - inset, mid - 0.03, mid + 0.03, -0.035, 0.035);
      } else {
        // Meeting stile of the parked leaf, hard against the open half.
        wallPart(frame, `${key}-stile`, 'trim', null, glassU1, glassU1 + 0.06, opening.y0 + inset, opening.y1 - inset, -0.045, 0.045, undefined, true);
        wallPart(frame, `${key}-track`, 'metal', null, u0, u1, opening.y0, opening.y0 + 0.04, -0.05, 0.05);
      }
    }

    if (opening.kind === 'door') {
      // Leaf swung flat against the inside face, clear of the opening it serves.
      const width = u1 - u0;
      const swing = opening.swing ?? 1;
      const leafU0 = swing > 0 ? u1 + 0.02 : u0 - width - 0.02;
      wallPart(frame, `${key}-leaf`, 'door', 'wood', leafU0, leafU0 + width, opening.y0, opening.y1 - 0.04, -out * (half + 0.07), -out * half);
      wallPart(frame, `${key}-leaf-rail`, 'trim', null, leafU0 + 0.1, leafU0 + width - 0.1, opening.y0 + 0.9, opening.y0 + 1.05, -out * (half + 0.09), -out * (half + 0.07));
    }
  };

  const exteriorWall = (wallKey: WallKey, openings: readonly Opening[]): void => {
    const frame = WALLS[wallKey];
    const apertures = openings.map((opening) => {
      const a = frame.u(opening.u0);
      const b = frame.u(opening.u1);
      return { id: opening.id, u0: Math.min(a, b), u1: Math.max(a, b), y0: opening.y0, y1: opening.y1 };
    });
    collector.addWall({
      id: `${id}-${wallKey}`,
      group,
      material: siding,
      ballistic: 'wood',
      axis: frame.axis,
      at: frame.at,
      thickness: frame.thickness,
      from: frame.from,
      to: frame.to,
      y0: 0,
      y1: EAVE_Y,
      apertures,
      contact: EXTERIOR_CONTACT,
    });
    // Painted interior lining, same apertures, non-colliding: the structural wall collides.
    collector.addWall({
      id: `${id}-${wallKey}-lining`,
      group,
      material: 'interior-wall',
      ballistic: null,
      axis: frame.axis,
      at: frame.at - frame.outward * (frame.thickness / 2 + LINING / 2),
      thickness: LINING,
      from: frame.from,
      to: frame.to,
      y0: 0,
      y1: EAVE_Y,
      apertures,
      contact: groundContact(),
    });
    for (const opening of openings) dressOpening(wallKey, opening);
  };

  // ---------------------------------------------------------------- openings

  const frontOpenings: Opening[] = [
    { id: 'living-picture', u0: -6.6, u1: -2.6, y0: 1, y1: 2.45, kind: 'window', mullions: 2 },
    { id: 'entry-door', u0: 3.4, u1: 4.5, y0: GROUND_FLOOR_Y, y1: 2.22, kind: 'door', swing: 1 },
    { id: 'entry-sidelight', u0: 4.72, u1: 5.12, y0: 0.6, y1: 2.22, kind: 'window', mullions: 0 },
    { id: 'hall-window', u0: 6.4, u1: 7.8, y0: 1, y1: 2.35, kind: 'window', mullions: 1 },
    { id: 'bedroom-street-a', u0: -6.6, u1: -4.6, y0: 4.1, y1: 5.65, kind: 'window', mullions: 1 },
    { id: 'bedroom-street-b', u0: -3.4, u1: -1.4, y0: 4.1, y1: 5.65, kind: 'window', mullions: 1 },
    // Full-height slider onto the street balcony that roofs the porch.
    { id: 'landing-balcony-door', u0: 3.6, u1: 5.4, y0: UPPER_FLOOR_Y, y1: 5.65, kind: 'slider', mullions: 1 },
  ];

  const rearOpenings: Opening[] = [
    { id: 'dining-slider', u0: -3.9, u1: -2.1, y0: GROUND_FLOOR_Y, y1: 2.35, kind: 'slider', mullions: 1 },
    { id: 'dining-window', u0: -7.6, u1: -6, y0: 1, y1: 2.35, kind: 'window', mullions: 1 },
    { id: 'kitchen-window', u0: 3.6, u1: 5.6, y0: 1.05, y1: 2.3, kind: 'window', mullions: 1 },
    { id: 'study-window', u0: -7.8, u1: -6.2, y0: 4.15, y1: 5.6, kind: 'window', mullions: 1 },
    { id: 'balcony-door', u0: -4.2, u1: -2.4, y0: UPPER_FLOOR_Y, y1: 5.6, kind: 'slider', mullions: 1 },
    { id: 'back-hall-window', u0: 1, u1: 2.4, y0: 4.2, y1: 5.6, kind: 'window', mullions: 1 },
    { id: 'bedroom2-rear', u0: 6, u1: 7.6, y0: 4.15, y1: 5.6, kind: 'window', mullions: 1 },
  ];

  const sideAOpenings: Opening[] = [
    { id: 'living-side', u0: 2, u1: 4.6, y0: 1, y1: 2.4, kind: 'window', mullions: 2 },
    { id: 'dining-side', u0: -5.6, u1: -3.6, y0: 1.05, y1: 2.3, kind: 'window', mullions: 1 },
    { id: 'bedroom-side', u0: 2.4, u1: 4.6, y0: 4.15, y1: 5.6, kind: 'window', mullions: 1 },
    { id: 'study-side', u0: -5.4, u1: -3.6, y0: 4.15, y1: 5.6, kind: 'window', mullions: 1 },
  ];

  const sideBOpenings: Opening[] = [
    { id: 'garage-link', u0: -4.6, u1: -3.5, y0: GROUND_FLOOR_Y, y1: 2.2, kind: 'door', swing: -1 },
    { id: 'hall-side', u0: 3.4, u1: 5.4, y0: 1, y1: 2.35, kind: 'window', mullions: 1 },
    // Full-height slider onto the garage roof: a deliberate route, not a window to vault.
    // Kept inside localX -4.2..4.2 so the whole threshold lands on the roof deck.
    { id: 'bedroom2-roof-door', u0: -4, u1: -2.2, y0: UPPER_FLOOR_Y, y1: 5.55, kind: 'slider', mullions: 1 },
    { id: 'landing-side', u0: 2.6, u1: 4.4, y0: 4.2, y1: 5.6, kind: 'window', mullions: 1 },
  ];

  exteriorWall('front', frontOpenings);
  exteriorWall('rear', rearOpenings);
  exteriorWall('sideA', sideAOpenings);
  exteriorWall('sideB', sideBOpenings);

  // ---------------------------------------------------------------- floors

  const slabWithHole = (
    partId: string,
    material: StudioMaterialId,
    ballistic: BallisticMaterialId | null,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    hole: Readonly<{ x0: number; x1: number; z0: number; z1: number }> | null,
    contact?: ContactShading,
  ): void => {
    if (!hole) {
      box(partId, material, ballistic, x0, x1, y0, y1, z0, z1, contact);
      return;
    }
    box(`${partId}-a`, material, ballistic, x0, hole.x0, y0, y1, z0, z1, contact);
    box(`${partId}-b`, material, ballistic, hole.x1, x1, y0, y1, z0, z1, contact);
    box(`${partId}-c`, material, ballistic, hole.x0, hole.x1, y0, y1, z0, hole.z0, contact);
    box(`${partId}-d`, material, ballistic, hole.x0, hole.x1, y0, y1, hole.z1, z1, contact);
  };

  // Ground slab under the whole main block plus the garage wing.
  box('slab-main', 'foundation', 'concrete', -HOUSE_HALF_WIDTH, HOUSE_HALF_WIDTH, -0.12, 0.02, -HOUSE_HALF_DEPTH, HOUSE_HALF_DEPTH, EXTERIOR_CONTACT);
  box('slab-garage', 'foundation', 'concrete', -GARAGE_HALF_X, GARAGE_HALF_X, -0.12, 0.06, GARAGE_Z0, GARAGE_Z1, EXTERIOR_CONTACT);
  // Finished ground floors: carpet in the living room, hard floor through hall and kitchen.
  box('floor-living', 'floor-soft', 'wood', 0, INNER_X, 0.02, GROUND_FLOOR_Y, -INNER_Z, 0, groundContact());
  box('floor-hall', 'floor-hard', 'wood', 0, INNER_X, 0.02, GROUND_FLOOR_Y, 0, INNER_Z, groundContact());
  box('floor-kitchen', 'floor-hard', 'wood', -INNER_X, 0, 0.02, GROUND_FLOOR_Y, -INNER_Z, INNER_Z, groundContact());

  // Upper structure: the underside is the ground-floor ceiling, so it wears the interior paint.
  slabWithHole('slab-upper', 'interior-wall', 'wood', -INNER_X, INNER_X, -INNER_Z, INNER_Z, UPPER_FLOOR_Y - SLAB, UPPER_FLOOR_Y - 0.08, STAIR_HOLE, groundContact());
  slabWithHole('floor-upper-front', 'floor-soft', 'wood', 0, INNER_X, -INNER_Z, INNER_Z, UPPER_FLOOR_Y - 0.08, UPPER_FLOOR_Y, STAIR_HOLE, upperContact());
  box('floor-upper-back', 'floor-hard', 'wood', -INNER_X, 0, UPPER_FLOOR_Y - 0.08, UPPER_FLOOR_Y, -INNER_Z, INNER_Z, upperContact());
  // Attic ceiling closes the upper storey; the roof above it is dressing.
  box('ceiling-upper', 'interior-wall', 'wood', -INNER_X, INNER_X, UPPER_CEILING_Y, EAVE_Y, -INNER_Z, INNER_Z, upperContact());

  // ---------------------------------------------------------------- partitions

  const partition = (
    partId: string,
    axis: 'x' | 'z',
    atLocal: number,
    fromLocal: number,
    toLocal: number,
    y0: number,
    y1: number,
    openings: ReadonlyArray<{ id: string; u0: number; u1: number; y0: number; y1: number; door?: boolean }>,
    material: StudioMaterialId,
    contact: ContactShading,
  ): void => {
    const at = axis === 'z' ? wx(atLocal) : atLocal;
    const from = axis === 'z' ? fromLocal : wx(fromLocal);
    const to = axis === 'z' ? toLocal : wx(toLocal);
    const apertures = openings.map((opening) => {
      const a = axis === 'z' ? opening.u0 : wx(opening.u0);
      const b = axis === 'z' ? opening.u1 : wx(opening.u1);
      return { id: opening.id, u0: Math.min(a, b), u1: Math.max(a, b), y0: opening.y0, y1: opening.y1 };
    });
    collector.addWall({
      id: `${id}-${partId}`,
      group,
      material,
      ballistic: 'interior-wall',
      axis,
      at,
      thickness: PARTITION,
      from,
      to,
      y0,
      y1,
      apertures,
      contact,
    });
    // Cased architrave around every interior opening.
    for (const aperture of apertures) {
      const half = PARTITION / 2 + 0.02;
      const emit = (suffix: string, u0: number, u1: number, ay0: number, ay1: number, swap?: boolean): void => {
        collector.addBox({
          id: `${id}-${partId}-${aperture.id}-${suffix}`,
          group,
          material: 'trim',
          ballistic: null,
          min: axis === 'x' ? [u0, ay0, at - half] : [at - half, ay0, u0],
          max: axis === 'x' ? [u1, ay1, at + half] : [at + half, ay1, u1],
          contact,
          uvSwap: swap,
        });
      };
      emit('head', aperture.u0 - 0.08, aperture.u1 + 0.08, aperture.y1, aperture.y1 + 0.08);
      emit('jamb-a', aperture.u0 - 0.08, aperture.u0, aperture.y0, aperture.y1, true);
      emit('jamb-b', aperture.u1, aperture.u1 + 0.08, aperture.y0, aperture.y1, true);
    }
  };

  partition(
    'p-spine',
    'z',
    0,
    -INNER_Z,
    INNER_Z,
    0.02,
    UPPER_FLOOR_Y - SLAB,
    [
      { id: 'living-dining', u0: -7.4, u1: -5.4, y0: GROUND_FLOOR_Y, y1: 2.4 },
      { id: 'hall-kitchen', u0: 5, u1: 5.9, y0: GROUND_FLOOR_Y, y1: 2.15 },
    ],
    accent,
    groundContact(),
  );
  partition(
    'p-hall',
    'x',
    0,
    0,
    INNER_X,
    0.02,
    UPPER_FLOOR_Y - SLAB,
    [{ id: 'living-hall', u0: 3.6, u1: 6.4, y0: GROUND_FLOOR_Y, y1: 2.5 }],
    'interior-wall',
    groundContact(),
  );
  partition(
    'p-kitchen',
    'x',
    2,
    -INNER_X,
    0,
    0.02,
    UPPER_FLOOR_Y - SLAB,
    [{ id: 'dining-kitchen', u0: -5.6, u1: -3.6, y0: GROUND_FLOOR_Y, y1: 2.4 }],
    'interior-wall',
    groundContact(),
  );

  partition(
    'q-spine',
    'z',
    0,
    -INNER_Z,
    INNER_Z,
    UPPER_FLOOR_Y,
    UPPER_CEILING_Y,
    [
      { id: 'hall-bath', u0: 1.4, u1: 2.5, y0: UPPER_FLOOR_Y, y1: 5.4 },
      { id: 'hall-bedroom2', u0: 5.4, u1: 6.5, y0: UPPER_FLOOR_Y, y1: 5.4 },
    ],
    'interior-wall',
    upperContact(),
  );
  partition(
    'q-bedroom',
    'x',
    1,
    0,
    INNER_X,
    UPPER_FLOOR_Y,
    UPPER_CEILING_Y,
    [{ id: 'landing-bedroom', u0: 4.6, u1: 5.7, y0: UPPER_FLOOR_Y, y1: 5.4 }],
    accent,
    upperContact(),
  );
  partition(
    'q-study',
    'x',
    -1,
    -INNER_X,
    0,
    UPPER_FLOOR_Y,
    UPPER_CEILING_Y,
    [{ id: 'bath-study', u0: -6, u1: -4.9, y0: UPPER_FLOOR_Y, y1: 5.4 }],
    'interior-wall',
    upperContact(),
  );
  partition(
    'q-bedroom2',
    'x',
    4,
    -INNER_X,
    0,
    UPPER_FLOOR_Y,
    UPPER_CEILING_Y,
    [{ id: 'bath-bedroom2', u0: -2.2, u1: -1.1, y0: UPPER_FLOOR_Y, y1: 5.4 }],
    'interior-wall',
    upperContact(),
  );

  // Skirting and picture rail: the cheap detail that stops a room reading as a box.
  for (const [suffix, z0, z1] of [['front', -INNER_Z, INNER_Z]] as const) {
    box(`skirting-${suffix}-a`, 'trim', null, INNER_X - 0.03, INNER_X, GROUND_FLOOR_Y, GROUND_FLOOR_Y + 0.14, z0, z1, groundContact());
    box(`skirting-${suffix}-b`, 'trim', null, -INNER_X, -INNER_X + 0.03, GROUND_FLOOR_Y, GROUND_FLOOR_Y + 0.14, z0, z1, groundContact());
    box(`skirting-${suffix}-c`, 'trim', null, -INNER_X, INNER_X, UPPER_FLOOR_Y, UPPER_FLOOR_Y + 0.14, z0, z0 + 0.03, upperContact());
    box(`skirting-${suffix}-d`, 'trim', null, -INNER_X, INNER_X, UPPER_FLOOR_Y, UPPER_FLOOR_Y + 0.14, z1 - 0.03, z1, upperContact());
  }
  box('cornice-ground', 'trim', null, -INNER_X, INNER_X, UPPER_FLOOR_Y - SLAB - 0.1, UPPER_FLOOR_Y - SLAB, -INNER_Z, -INNER_Z + 0.08, groundContact());
  box('cornice-ground-b', 'trim', null, -INNER_X, INNER_X, UPPER_FLOOR_Y - SLAB - 0.1, UPPER_FLOOR_Y - SLAB, INNER_Z - 0.08, INNER_Z, groundContact());

  // ---------------------------------------------------------------- stairs

  for (let step = 0; step < STAIR_STEPS; step++) {
    const z0 = STAIR_Z0 + step * STAIR_GOING;
    const top = GROUND_FLOOR_Y + (step + 1) * STAIR_RISE;
    box(`stair-${step}`, 'floor-soft', 'wood', STAIR_X0, STAIR_X1, 0.02, top, z0, z0 + STAIR_GOING, groundContact());
    box(`stair-nosing-${step}`, 'door', null, STAIR_X0, STAIR_X1 + 0.03, top - 0.04, top, z0 - 0.03, z0 + 0.06, groundContact());
  }
  // Open-side rail: a single rotated rail plus stepped balusters, matching the treads.
  {
    const midZ = STAIR_Z0 + STAIR_RUN / 2;
    const midY = GROUND_FLOOR_Y + (UPPER_FLOOR_Y - GROUND_FLOOR_Y) / 2 + 0.95;
    const length = Math.hypot(STAIR_RUN, UPPER_FLOOR_Y - GROUND_FLOOR_Y);
    const pitch = Math.atan2(UPPER_FLOOR_Y - GROUND_FLOOR_Y, STAIR_RUN);
    rotatedBox(
      'stair-handrail',
      'door',
      'wood',
      [wx(STAIR_X1 + 0.04), midY, midZ],
      [0.09, 0.07, length],
      [-pitch, 0, 0],
    );
    for (let step = 0; step < STAIR_STEPS; step += 1) {
      const z = STAIR_Z0 + (step + 0.5) * STAIR_GOING;
      const top = GROUND_FLOOR_Y + (step + 1) * STAIR_RISE;
      box(`stair-baluster-${step}`, 'metal', null, STAIR_X1, STAIR_X1 + 0.04, top, top + 0.93, z - 0.02, z + 0.02, groundContact());
    }
  }
  // Landing guard around the stairwell opening.
  box('stair-guard-side', 'door', 'wood', STAIR_HOLE.x1, STAIR_HOLE.x1 + 0.08, UPPER_FLOOR_Y, UPPER_FLOOR_Y + 1.02, STAIR_HOLE.z0, STAIR_HOLE.z1, upperContact());
  box('stair-guard-end', 'door', 'wood', STAIR_HOLE.x0, STAIR_HOLE.x1 + 0.08, UPPER_FLOOR_Y, UPPER_FLOOR_Y + 1.02, STAIR_HOLE.z0, STAIR_HOLE.z0 + 0.08, upperContact());
  for (let baluster = 0; baluster < 14; baluster++) {
    const z = STAIR_HOLE.z0 + 0.2 + baluster * 0.29;
    if (z > STAIR_HOLE.z1 - 0.1) break;
    box(`landing-baluster-${baluster}`, 'metal', null, STAIR_HOLE.x1 + 0.02, STAIR_HOLE.x1 + 0.06, UPPER_FLOOR_Y, UPPER_FLOOR_Y + 0.95, z - 0.02, z + 0.02, upperContact());
  }

  routes.push({ id: `${id}-interior-stair`, foot: [wx((STAIR_X0 + STAIR_X1) / 2), GROUND_FLOOR_Y, STAIR_Z0], top: [wx((STAIR_X0 + STAIR_X1) / 2), UPPER_FLOOR_Y, STAIR_Z0 + STAIR_RUN] });
  ramps.push({ id: `${id}-interior-stair`, from: [wx((STAIR_X0 + STAIR_X1) / 2), GROUND_FLOOR_Y, STAIR_Z0], to: [wx((STAIR_X0 + STAIR_X1) / 2), UPPER_FLOOR_Y, STAIR_Z0 + STAIR_RUN], width: STAIR_X1 - STAIR_X0 });

  // ---------------------------------------------------------------- porch

  box('porch-slab', 'foundation', 'concrete', PORCH_X0, PORCH_X1, 0, PORCH_Y, PORCH_Z0, PORCH_Z1, EXTERIOR_CONTACT);
  box('porch-step', 'foundation', 'concrete', PORCH_X1, PORCH_X1 + 0.45, 0, PORCH_Y - 0.08, PORCH_Z0 + 2.4, PORCH_Z1 - 1.4, EXTERIOR_CONTACT);
  box('porch-edge', 'trim', null, PORCH_X0, PORCH_X1 + 0.02, PORCH_Y - 0.05, PORCH_Y, PORCH_Z1, PORCH_Z1 + 0.02, EXTERIOR_CONTACT);
  // Posts carry the street balcony, which roofs the porch the way the yellow-house
  // reference does; the pergola then sits above the balcony rather than over the entry.
  const balconyDeckY = UPPER_FLOOR_Y;
  for (const [index, z] of [1, 2.9, 5.1, 6.9].entries()) {
    box(`porch-post-${index}`, 'trim', 'wood', PORCH_X1 - 0.24, PORCH_X1 - 0.08, PORCH_Y, balconyDeckY - 0.12, z - 0.08, z + 0.08, EXTERIOR_CONTACT, true);
  }
  box('porch-beam-outer', 'trim', null, PORCH_X1 - 0.28, PORCH_X1 - 0.04, balconyDeckY - 0.3, balconyDeckY - 0.12, PORCH_Z0, PORCH_Z1);
  box('porch-beam-inner', 'trim', null, PORCH_X0 - 0.02, PORCH_X0 + 0.18, balconyDeckY - 0.3, balconyDeckY - 0.12, PORCH_Z0, PORCH_Z1);
  box('porch-ceiling', 'trim', null, PORCH_X0, PORCH_X1 - 0.04, balconyDeckY - 0.12, balconyDeckY - 0.06, PORCH_Z0, PORCH_Z1);
  platforms.push({ id: `${id}-porch`, ...boundsOf(spanX(PORCH_X0, PORCH_X1), [PORCH_Z0, PORCH_Z1]), y: PORCH_Y });

  // ---------------------------------------------------------------- street balcony

  box('street-balcony-deck', 'door', 'wood', PORCH_X0, PORCH_X1, balconyDeckY - 0.06, balconyDeckY, PORCH_Z0, PORCH_Z1, EXTERIOR_CONTACT);
  box('street-balcony-fascia', 'trim', null, PORCH_X1, PORCH_X1 + 0.05, balconyDeckY - 0.22, balconyDeckY + 0.02, PORCH_Z0 - 0.05, PORCH_Z1 + 0.05);
  const streetRailTop = balconyDeckY + 1.02;
  box('street-balcony-rail-outer', 'trim', 'wood', PORCH_X1 - 0.08, PORCH_X1, streetRailTop - 0.09, streetRailTop, PORCH_Z0, PORCH_Z1);
  box('street-balcony-rail-a', 'trim', 'wood', PORCH_X0, PORCH_X1, streetRailTop - 0.09, streetRailTop, PORCH_Z0, PORCH_Z0 + 0.08);
  box('street-balcony-rail-b', 'trim', 'wood', PORCH_X0, PORCH_X1, streetRailTop - 0.09, streetRailTop, PORCH_Z1 - 0.08, PORCH_Z1);
  for (let baluster = 0; baluster < 52; baluster++) {
    const z = PORCH_Z0 + 0.1 + baluster * 0.13;
    if (z > PORCH_Z1 - 0.08) break;
    box(`street-balcony-baluster-${baluster}`, 'trim', null, PORCH_X1 - 0.06, PORCH_X1 - 0.01, balconyDeckY, streetRailTop - 0.09, z - 0.025, z + 0.025);
  }
  for (const [index, z] of [PORCH_Z0 + 0.04, PORCH_Z1 - 0.09].entries()) {
    for (let baluster = 0; baluster < 12; baluster++) {
      const x = PORCH_X0 + 0.12 + baluster * 0.13;
      if (x > PORCH_X1 - 0.1) break;
      box(`street-balcony-end-baluster-${index}-${baluster}`, 'trim', null, x - 0.025, x + 0.025, balconyDeckY, streetRailTop - 0.09, z, z + 0.05);
    }
  }
  // Pergola over the balcony: two outer posts and a wall ledger, slats running out from the
  // house. Well above head height on the deck, so it carries no collider.
  for (const [index, z] of [PORCH_Z0 + 0.5, PORCH_Z1 - 0.5].entries()) {
    box(`pergola-post-${index}`, 'trim', 'wood', PORCH_X1 - 0.22, PORCH_X1 - 0.08, balconyDeckY, 6.15, z - 0.07, z + 0.07, undefined, true);
  }
  box('pergola-beam-outer', 'trim', null, PORCH_X1 - 0.26, PORCH_X1 - 0.04, 6.15, 6.33, PORCH_Z0, PORCH_Z1);
  box('pergola-ledger', 'trim', null, PORCH_X0 - 0.02, PORCH_X0 + 0.16, 6.15, 6.33, PORCH_Z0, PORCH_Z1);
  for (let slat = 0; slat < 22; slat++) {
    const z = PORCH_Z0 + 0.2 + slat * 0.32;
    if (z > PORCH_Z1 - 0.1) break;
    box(`pergola-slat-${slat}`, 'trim', null, PORCH_X0 - 0.04, PORCH_X1 - 0.02, 6.33, 6.41, z - 0.03, z + 0.03);
  }
  platforms.push({ id: `${id}-street-balcony`, ...boundsOf(spanX(PORCH_X0, PORCH_X1), [PORCH_Z0, PORCH_Z1]), y: balconyDeckY });

  // ---------------------------------------------------------------- balcony and external stair

  box('balcony-deck', 'door', 'wood', BALCONY_X0, BALCONY_X1, UPPER_FLOOR_Y - 0.12, UPPER_FLOOR_Y, BALCONY_Z0, BALCONY_Z1, EXTERIOR_CONTACT);
  box('balcony-fascia', 'trim', null, BALCONY_X0 - 0.03, BALCONY_X1, UPPER_FLOOR_Y - 0.18, UPPER_FLOOR_Y - 0.12, BALCONY_Z0 - 0.03, BALCONY_Z1 + 0.03);
  for (const [index, z] of [BALCONY_Z0 + 0.4, BALCONY_Z1 - 0.4].entries()) {
    box(`balcony-post-${index}`, 'trim', 'wood', BALCONY_X0 + 0.1, BALCONY_X0 + 0.26, 0, UPPER_FLOOR_Y - 0.12, z - 0.08, z + 0.08, EXTERIOR_CONTACT, true);
  }
  const railTop = UPPER_FLOOR_Y + 1.02;
  box('balcony-rail-outer', 'trim', 'wood', BALCONY_X0, BALCONY_X0 + 0.08, railTop - 0.09, railTop, BALCONY_Z0, BALCONY_Z1);
  box('balcony-rail-north', 'trim', 'wood', BALCONY_X0, BALCONY_X1, railTop - 0.09, railTop, BALCONY_Z0, BALCONY_Z0 + 0.08);
  // Keep the entire external stair width (-9.25..-8), plus 0.1 m, clear.
  // A centre-line point fits the old opening, but the actual 0.38 m capsule
  // hit the rail before reaching the top step.
  box('balcony-rail-south', 'trim', 'wood', -7.9, BALCONY_X1, railTop - 0.09, railTop, BALCONY_Z1 - 0.08, BALCONY_Z1);
  let balconyBaluster = 0;
  for (let step = 0; step < 46; step++) {
    const z = BALCONY_Z0 + 0.12 + step * 0.13;
    if (z > BALCONY_Z1 - 0.1) break;
    box(`balcony-baluster-a-${balconyBaluster++}`, 'trim', null, BALCONY_X0 + 0.01, BALCONY_X0 + 0.06, UPPER_FLOOR_Y, railTop - 0.09, z - 0.025, z + 0.025);
  }
  for (let step = 0; step < 20; step++) {
    const x = BALCONY_X0 + 0.12 + step * 0.13;
    if (x > BALCONY_X1 - 0.1) break;
    box(`balcony-baluster-b-${step}`, 'trim', null, x - 0.025, x + 0.025, UPPER_FLOOR_Y, railTop - 0.09, BALCONY_Z0 + 0.01, BALCONY_Z0 + 0.06);
  }
  platforms.push({ id: `${id}-balcony`, ...boundsOf(spanX(BALCONY_X0, BALCONY_X1), [BALCONY_Z0, BALCONY_Z1]), y: UPPER_FLOOR_Y });

  const extX0 = -9.25;
  const extX1 = -8;
  const extZ0 = BALCONY_Z1;
  for (let step = 0; step < STAIR_STEPS; step++) {
    const z0 = extZ0 + step * STAIR_GOING;
    const top = UPPER_FLOOR_Y - (step + 1) * STAIR_RISE;
    box(`ext-stair-${step}`, 'door', 'wood', extX0, extX1, 0, top, z0, z0 + STAIR_GOING, EXTERIOR_CONTACT);
  }
  {
    const midZ = extZ0 + STAIR_RUN / 2;
    const midY = UPPER_FLOOR_Y - (UPPER_FLOOR_Y - GROUND_FLOOR_Y) / 2 + 0.95;
    const length = Math.hypot(STAIR_RUN, UPPER_FLOOR_Y - GROUND_FLOOR_Y);
    const pitch = Math.atan2(UPPER_FLOOR_Y - GROUND_FLOOR_Y, STAIR_RUN);
    rotatedBox('ext-stair-rail', 'trim', 'wood', [wx(extX0 - 0.05), midY, midZ], [0.08, 0.08, length], [pitch, 0, 0]);
  }
  routes.push({ id: `${id}-external-stair`, foot: [wx((extX0 + extX1) / 2), 0, extZ0 + STAIR_RUN], top: [wx((extX0 + extX1) / 2), UPPER_FLOOR_Y, extZ0] });
  ramps.push({ id: `${id}-external-stair`, from: [wx((extX0 + extX1) / 2), 0, extZ0 + STAIR_RUN], to: [wx((extX0 + extX1) / 2), UPPER_FLOOR_Y, extZ0], width: extX1 - extX0 });

  // ---------------------------------------------------------------- garage wing

  const garageWall = (
    partId: string,
    axis: 'x' | 'z',
    atLocal: number,
    fromLocal: number,
    toLocal: number,
    openings: ReadonlyArray<{ id: string; u0: number; u1: number; y0: number; y1: number }>,
  ): void => {
    const at = axis === 'z' ? wx(atLocal) : atLocal;
    const from = axis === 'z' ? fromLocal : wx(fromLocal);
    const to = axis === 'z' ? toLocal : wx(toLocal);
    const apertures = openings.map((opening) => {
      const a = axis === 'z' ? opening.u0 : wx(opening.u0);
      const b = axis === 'z' ? opening.u1 : wx(opening.u1);
      return { id: opening.id, u0: Math.min(a, b), u1: Math.max(a, b), y0: opening.y0, y1: opening.y1 };
    });
    collector.addWall({
      id: `${id}-${partId}`,
      group,
      material: siding,
      ballistic: 'wood',
      axis,
      at,
      thickness: 0.2,
      from,
      to,
      y0: 0,
      y1: GARAGE_ROOF_Y,
      apertures,
      contact: EXTERIOR_CONTACT,
    });
  };

  garageWall('garage-west', 'z', -(GARAGE_HALF_X - 0.1), GARAGE_Z0, GARAGE_Z1, [
    { id: 'garage-side-door', u0: 12, u1: 13.1, y0: 0.06, y1: 2.1 },
    { id: 'garage-side-window', u0: 15.5, u1: 16.8, y0: 1.2, y1: 2.2 },
  ]);
  garageWall('garage-east', 'z', GARAGE_HALF_X - 0.1, GARAGE_Z0, GARAGE_Z1, [
    { id: 'garage-east-window', u0: 14.5, u1: 16, y0: 1.2, y1: 2.2 },
  ]);
  garageWall('garage-end', 'x', GARAGE_Z1 - 0.1, -GARAGE_HALF_X, GARAGE_HALF_X, [
    { id: 'garage-door', u0: -2.3, u1: 2.3, y0: 0, y1: 2.55 },
  ]);
  box('garage-roof', 'roof', 'wood', -GARAGE_HALF_X - 0.2, GARAGE_HALF_X + 0.2, GARAGE_ROOF_Y - 0.2, GARAGE_ROOF_Y, GARAGE_Z0 - 0.2, GARAGE_Z1 + 0.25);
  box('garage-fascia-w', 'trim', null, -GARAGE_HALF_X - 0.26, -GARAGE_HALF_X - 0.2, GARAGE_ROOF_Y - 0.28, GARAGE_ROOF_Y + 0.04, GARAGE_Z0 - 0.26, GARAGE_Z1 + 0.31);
  box('garage-fascia-e', 'trim', null, GARAGE_HALF_X + 0.2, GARAGE_HALF_X + 0.26, GARAGE_ROOF_Y - 0.28, GARAGE_ROOF_Y + 0.04, GARAGE_Z0 - 0.26, GARAGE_Z1 + 0.31);
  box('garage-fascia-end', 'trim', null, -GARAGE_HALF_X - 0.26, GARAGE_HALF_X + 0.26, GARAGE_ROOF_Y - 0.28, GARAGE_ROOF_Y + 0.04, GARAGE_Z1 + 0.25, GARAGE_Z1 + 0.31);
  // Sectional door parked under the ceiling: the opening stays a real route.
  for (let panel = 0; panel < 4; panel++) {
    const y = 2.66 + panel * 0.16;
    box(`garage-door-panel-${panel}`, 'metal', null, -2.3, 2.3, y, y + 0.14, GARAGE_Z1 - 1.9, GARAGE_Z1 - 1.82);
  }
  for (const [index, x] of [-2.32, 2.32].entries()) {
    box(`garage-door-track-${index}`, 'metal', null, x - 0.05, x + 0.05, 3.2, 3.28, GARAGE_Z1 - 3.4, GARAGE_Z1 - 0.2);
  }
  box('garage-door-head', 'trim', null, -2.45, 2.45, 2.55, 2.72, GARAGE_Z1 - 0.26, GARAGE_Z1 + 0.02);
  box('garage-door-jamb-a', 'trim', null, -2.45, -2.3, 0, 2.72, GARAGE_Z1 - 0.26, GARAGE_Z1 + 0.02, EXTERIOR_CONTACT, true);
  box('garage-door-jamb-b', 'trim', null, 2.3, 2.45, 0, 2.72, GARAGE_Z1 - 0.26, GARAGE_Z1 + 0.02, EXTERIOR_CONTACT, true);
  platforms.push({ id: `${id}-garage-roof`, ...boundsOf(spanX(-GARAGE_HALF_X - 0.2, GARAGE_HALF_X + 0.2), [GARAGE_Z0 - 0.2, GARAGE_Z1 + 0.25]), y: GARAGE_ROOF_Y });
  // Bedroom floor (3.30) out onto the garage roof deck (3.50): a 0.2 m step either way.
  // dressOpening parks glass in the smaller-world-X half. Route through
  // the centre of the genuinely open half, not the glass meeting stile.
  const garageRoofDoorX = (Math.min(wx(-4), wx(-2.2)) + 3 * Math.max(wx(-4), wx(-2.2))) / 4;
  // A real low threshold ramp bridges the 0.2 m roof rise before the narrow
  // opening. Autostep cannot find capsule clearance at the original roof lip.
  const thresholdFromZ = 7.6, thresholdToZ = GARAGE_Z0 - 0.2;
  const thresholdRun = thresholdToZ - thresholdFromZ;
  const thresholdRise = GARAGE_ROOF_Y - UPPER_FLOOR_Y;
  const thresholdPitch = Math.atan2(thresholdRise, thresholdRun);
  const thresholdThickness = 0.04;
  rotatedBox('garage-roof-threshold', 'door', 'wood', [
    garageRoofDoorX,
    (UPPER_FLOOR_Y + GARAGE_ROOF_Y) / 2 - Math.cos(thresholdPitch) * thresholdThickness / 2,
    (thresholdFromZ + thresholdToZ) / 2 + Math.sin(thresholdPitch) * thresholdThickness / 2,
  ], [1.1, thresholdThickness, Math.hypot(thresholdRun, thresholdRise)], [-thresholdPitch, 0, 0]);
  routes.push({ id: `${id}-garage-roof-door`, foot: [garageRoofDoorX, UPPER_FLOOR_Y, thresholdFromZ], top: [garageRoofDoorX, GARAGE_ROOF_Y, GARAGE_Z0 + 1.4] });
  ramps.push({ id: `${id}-garage-roof-threshold`, from: [garageRoofDoorX, UPPER_FLOOR_Y, thresholdFromZ], to: [garageRoofDoorX, GARAGE_ROOF_Y, thresholdToZ], width: 1.1 });

  // ---------------------------------------------------------------- chimney

  box('chimney', masonry, 'brick', -1.7, 0.3, 0, 9.2, -10, -HOUSE_HALF_DEPTH + 0.1, EXTERIOR_CONTACT);
  // The cap carries the stack's ballistic family so its own top face has
  // movement authority beneath it: with the cap presentation-only, the
  // walkable-surface gate measured its top as unsupported with a 0.25 m drop.
  // The cap's north edge is pulled out to mirror the 0.14 m south overhang -
  // the authored cap stopped 0.14 m short of the stack's north face, which
  // both read wrong and left a 0.14 m ledge of the walkable census AABB with
  // nothing beneath it. Unreachable masonry above the ridge; the colliders
  // change no route, they only stop bullets and fall-through lies.
  box('chimney-cap', masonry, 'brick', -1.85, 0.45, 9.2, 9.42, -10.14, -HOUSE_HALF_DEPTH + 0.24);
  box('chimney-shoulder', masonry, null, -1.55, 0.15, 2.6, 2.78, -10.08, -10, EXTERIOR_CONTACT);

  // ---------------------------------------------------------------- exterior trim

  const cornerBoards: ReadonlyArray<readonly [string, number, number]> = [
    ['a', HOUSE_HALF_WIDTH, -HOUSE_HALF_DEPTH],
    ['b', HOUSE_HALF_WIDTH, HOUSE_HALF_DEPTH],
    ['c', -HOUSE_HALF_WIDTH, -HOUSE_HALF_DEPTH],
    ['d', -HOUSE_HALF_WIDTH, HOUSE_HALF_DEPTH],
  ];
  for (const [name, cx, cz] of cornerBoards) {
    const xSign = Math.sign(cx);
    const zSign = Math.sign(cz);
    box(`corner-${name}-x`, 'trim', null, cx - xSign * 0.16, cx + xSign * 0.03, 0.3, EAVE_Y, cz - zSign * 0.03, cz + zSign * 0.04, EXTERIOR_CONTACT, true);
    box(`corner-${name}-z`, 'trim', null, cx - xSign * 0.03, cx + xSign * 0.04, 0.3, EAVE_Y, cz - zSign * 0.16, cz + zSign * 0.03, EXTERIOR_CONTACT, true);
  }
  const band = (name: string, y0: number, y1: number, proud: number): void => {
    box(`${name}-front`, 'trim', null, HOUSE_HALF_WIDTH, HOUSE_HALF_WIDTH + proud, y0, y1, -HOUSE_HALF_DEPTH - proud, HOUSE_HALF_DEPTH + proud, EXTERIOR_CONTACT);
    box(`${name}-rear`, 'trim', null, -HOUSE_HALF_WIDTH - proud, -HOUSE_HALF_WIDTH, y0, y1, -HOUSE_HALF_DEPTH - proud, HOUSE_HALF_DEPTH + proud, EXTERIOR_CONTACT);
    box(`${name}-sidea`, 'trim', null, -HOUSE_HALF_WIDTH, HOUSE_HALF_WIDTH, y0, y1, -HOUSE_HALF_DEPTH - proud, -HOUSE_HALF_DEPTH, EXTERIOR_CONTACT);
    box(`${name}-sideb`, 'trim', null, -HOUSE_HALF_WIDTH, HOUSE_HALF_WIDTH, y0, y1, HOUSE_HALF_DEPTH, HOUSE_HALF_DEPTH + proud, EXTERIOR_CONTACT);
  };
  band('watertable', 0.3, 0.46, 0.055);
  band('beltcourse', UPPER_FLOOR_Y - 0.32, UPPER_FLOOR_Y - 0.18, 0.04);
  band('frieze', EAVE_Y - 0.24, EAVE_Y, 0.035);

  // ---------------------------------------------------------------- roof

  const roofCentreY = (RIDGE_Y + EAVE_Y) / 2;
  const slopeLength = Math.hypot(ROOF_RUN, RIDGE_Y - EAVE_Y);
  const roofDepth = 2 * (HOUSE_HALF_DEPTH + RAKE_OVERHANG);
  for (const sign of [1, -1] as const) {
    const centreLocalX = (sign * ROOF_RUN) / 2;
    rotatedBox(
      `roof-${sign > 0 ? 'front' : 'rear'}`,
      'roof',
      'wood',
      [wx(centreLocalX), roofCentreY, 0],
      [slopeLength, ROOF_THICKNESS, roofDepth],
      [0, 0, -sign * frontSign * ROOF_PITCH],
    );
    // Fascia, soffit and gutter along the eave. The fascia sits just outboard of the slab
    // edge and the soffit closes the overhang, both clear of the sloped underside.
    const eaveLocalX = sign * ROOF_RUN;
    const face = sign > 0 ? 'front' : 'rear';
    box(`soffit-${face}`, 'trim', null, sign * HOUSE_HALF_WIDTH, eaveLocalX, EAVE_Y - 0.33, EAVE_Y - 0.27, -HOUSE_HALF_DEPTH - RAKE_OVERHANG, HOUSE_HALF_DEPTH + RAKE_OVERHANG);
    box(`fascia-${face}`, 'trim', null, eaveLocalX, eaveLocalX + sign * 0.09, EAVE_Y - 0.45, EAVE_Y - 0.06, -HOUSE_HALF_DEPTH - RAKE_OVERHANG, HOUSE_HALF_DEPTH + RAKE_OVERHANG);
    box(`gutter-${face}`, 'trim', null, eaveLocalX + sign * 0.09, eaveLocalX + sign * 0.21, EAVE_Y - 0.44, EAVE_Y - 0.3, -HOUSE_HALF_DEPTH - RAKE_OVERHANG, HOUSE_HALF_DEPTH + RAKE_OVERHANG);
    for (const [index, z] of [-HOUSE_HALF_DEPTH + 0.35, HOUSE_HALF_DEPTH - 0.35].entries()) {
      box(`downpipe-${face}-${index}`, 'trim', null, sign * HOUSE_HALF_WIDTH, sign * (HOUSE_HALF_WIDTH + 0.09), 0.05, EAVE_Y - 0.46, z - 0.05, z + 0.05, EXTERIOR_CONTACT, true);
      box(`downpipe-elbow-${face}-${index}`, 'trim', null, sign * HOUSE_HALF_WIDTH, eaveLocalX + sign * 0.15, EAVE_Y - 0.46, EAVE_Y - 0.37, z - 0.05, z + 0.05);
    }
    // Rake boards on both gable ends.
    for (const [index, z] of [-(HOUSE_HALF_DEPTH + RAKE_OVERHANG) + 0.06, HOUSE_HALF_DEPTH + RAKE_OVERHANG - 0.06].entries()) {
      rotatedBox(
        `rake-${sign > 0 ? 'front' : 'rear'}-${index}`,
        'trim',
        null,
        [wx(centreLocalX), roofCentreY - 0.16, z],
        [slopeLength, 0.26, 0.12],
        [0, 0, -sign * frontSign * ROOF_PITCH],
      );
    }
  }
  box('ridge-cap', 'roof', null, -0.26, 0.26, RIDGE_Y - 0.06, RIDGE_Y + 0.14, -HOUSE_HALF_DEPTH - RAKE_OVERHANG, HOUSE_HALF_DEPTH + RAKE_OVERHANG);

  // Gable infill, stepped to stay under the roof plane. Non-colliding: it sits in the attic
  // above the ceiling slab, and the roof slabs themselves carry the ballistic envelope.
  const roofUnderY = (localX: number): number =>
    RIDGE_Y - (Math.abs(localX) / ROOF_RUN) * (RIDGE_Y - EAVE_Y) - ROOF_THICKNESS / Math.cos(ROOF_PITCH);
  for (const [endIndex, z] of [-HOUSE_HALF_DEPTH, HOUSE_HALF_DEPTH - WALL].entries()) {
    for (let stepIndex = 0; stepIndex < 16; stepIndex++) {
      const x0 = -HOUSE_HALF_WIDTH + stepIndex * (HOUSE_HALF_WIDTH / 8);
      const x1 = x0 + HOUSE_HALF_WIDTH / 8;
      const top = Math.min(roofUnderY(x0), roofUnderY(x1));
      if (top <= EAVE_Y + 0.02) continue;
      box(`gable-${endIndex}-${stepIndex}`, siding, null, x0, x1, EAVE_Y - 0.02, top, z, z + WALL);
    }
  }

  // ---------------------------------------------------------------- navigation, anchors, cameras

  platforms.push({ id: `${id}-ground`, ...boundsOf(spanX(-INNER_X, INNER_X), [-INNER_Z, INNER_Z]), y: GROUND_FLOOR_Y });
  // Bot support must have the same hole as slabWithHole. A single upper
  // rectangle lets actors retain storey height over the open stairwell.
  for (const [suffix, x0, x1, z0, z1] of [
    ['a', -INNER_X, STAIR_HOLE.x0, -INNER_Z, INNER_Z],
    ['b', STAIR_HOLE.x1, INNER_X, -INNER_Z, INNER_Z],
    ['c', STAIR_HOLE.x0, STAIR_HOLE.x1, -INNER_Z, STAIR_HOLE.z0],
    ['d', STAIR_HOLE.x0, STAIR_HOLE.x1, STAIR_HOLE.z1, INNER_Z],
  ] as const) {
    platforms.push({ id: `${id}-upper-${suffix}`, ...boundsOf(spanX(x0, x1), [z0, z1]), y: UPPER_FLOOR_Y });
  }
  platforms.push({ id: `${id}-garage-floor`, ...boundsOf(spanX(-GARAGE_HALF_X + 0.1, GARAGE_HALF_X - 0.1), [GARAGE_Z0, GARAGE_Z1 - 0.2]), y: 0.06 });

  const anchor = (anchorId: string, room: string, lx: number, y: number, lz: number, yaw: number, footprint: [number, number]): void => {
    anchors.push({
      id: `${id}-${anchorId}`,
      room,
      position: [wx(lx), y, lz],
      yaw: frontSign > 0 ? yaw : Math.PI - yaw,
      footprint,
    });
  };
  anchor('sofa', 'living', 5.4, GROUND_FLOOR_Y, -4.4, -Math.PI / 2, [2.2, 0.9]);
  anchor('coffee-table', 'living', 3.6, GROUND_FLOOR_Y, -4.4, 0, [1.2, 0.6]);
  anchor('tv-unit', 'living', 1, GROUND_FLOOR_Y, -4.4, Math.PI / 2, [1.6, 0.5]);
  anchor('dining-table', 'dining', -3.4, GROUND_FLOOR_Y, -3.4, 0, [1.6, 1]);
  anchor('kitchen-run', 'kitchen', -6.2, GROUND_FLOOR_Y, 5.2, Math.PI / 2, [4.4, 0.65]);
  anchor('bed', 'bedroom', 4.6, UPPER_FLOOR_Y, -5.2, -Math.PI / 2, [2, 1.9]);
  anchor('wardrobe', 'bedroom', 1, UPPER_FLOOR_Y, -7.4, Math.PI / 2, [1.8, 0.6]);
  anchor('desk', 'study', -5.8, UPPER_FLOOR_Y, -6, Math.PI / 2, [1.6, 0.7]);
  anchor('bed2', 'bedroom2', -5.4, UPPER_FLOOR_Y, 6.6, Math.PI / 2, [1.9, 1.4]);
  anchor('workbench', 'garage', -3, 0.06, 11.5, Math.PI / 2, [2.4, 0.7]);

  reviewPoints.push(
    { id: `${id}-street`, position: [wx(16), 2.2, 8], target: [wx(4), 3.2, 0] },
    { id: `${id}-living`, position: [wx(5.6), 1.65, -6.6], target: [wx(0.5), 1.5, 1.5] },
    { id: `${id}-bedroom`, position: [wx(1.4), 4.95, -7.6], target: [wx(6.8), 4.8, -3] },
    { id: `${id}-backyard`, position: [wx(-16), 2.4, -7], target: [wx(-5), 3.6, 0] },
    { id: `${id}-stair`, position: [wx(4.6), 1.7, 7.8], target: [wx(0.6), 2.6, 3] },
    { id: `${id}-street-balcony`, position: [wx(8.1), 4.9, 6.5], target: [wx(20), 3.4, -2] },
    { id: `${id}-porch`, position: [wx(12), 1.7, 1.5], target: [wx(6.9), 1.9, 4.2] },
  );

  return { routes, ramps, platforms, anchors, reviewPoints };
}

function boundsOf(x: readonly [number, number], z: readonly [number, number]): Pick<VerticalPlatform, 'minX' | 'maxX' | 'minZ' | 'maxZ'> {
  return { minX: x[0], maxX: x[1], minZ: Math.min(z[0], z[1]), maxZ: Math.max(z[0], z[1]) };
}

/** Convenience for tests and for root's sanity checks. */
export function houseBounds(config: HouseConfig): Box2 {
  const left = config.centreX - HOUSE_HALF_WIDTH;
  const right = config.centreX + HOUSE_HALF_WIDTH;
  return { minX: left, maxX: right, minZ: -HOUSE_HALF_DEPTH, maxZ: GARAGE_Z1, minY: 0, maxY: RIDGE_Y };
}

export function emptyNavigation(): ArenaVerticalNavigation {
  return Object.freeze({ routes: [], ramps: [], platforms: [] });
}
