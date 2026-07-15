import type { Team } from './protocol';

export type HouseSurface = 'aqua' | 'coral' | 'plaster' | 'brick' | 'timber' | 'concrete' | 'trim' | 'glass' | 'metal' | 'ceiling' | 'light';
export type HouseSolid = {
  id: string;
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  surface: HouseSurface;
  collidable: boolean;
  kind: 'wall' | 'floor' | 'landing' | 'frame' | 'glass' | 'ramp';
  breakable: boolean;
  rotation?: [number, number, number];
};
export type HouseOpening = {
  id: string;
  kind: 'exterior-door' | 'interior-opening' | 'window';
  centre: [number, number, number];
  width: number;
  height: number;
  route: boolean;
};
export type HouseRouteAnchor = {
  id: string;
  position: [number, number, number];
  level: 'ground' | 'upper';
};
export type HouseRoom = {
  id: string;
  level: 'ground' | 'upper';
  centre: [number, number, number];
  size: [number, number];
};
export type HouseArchitecture = {
  id: 'aqua-irrigation-workshop' | 'coral-orchard-conservatory';
  label: string;
  team: Team;
  origin: { x: number; z: number; facing: 1 | -1 };
  dimensions: { width: number; depth: number; wallThickness: number };
  rooms: readonly HouseRoom[];
  solids: readonly HouseSolid[];
  openings: readonly HouseOpening[];
  anchors: readonly HouseRouteAnchor[];
  routes: Readonly<Record<string, readonly string[]>>;
};

type LocalSolid = Omit<HouseSolid, 'position'> & { position: [number, number, number] };
type LocalOpening = Omit<HouseOpening, 'centre'> & { centre: [number, number, number] };
type LocalAnchor = Omit<HouseRouteAnchor, 'position'> & { position: [number, number, number] };
type LocalRoom = Omit<HouseRoom, 'centre'> & { centre: [number, number, number] };

const WIDTH = 18.2;
const DEPTH = 16.4;
const WALL = 0.42;
const GROUND_HEIGHT = 3.35;
const UPPER_HEIGHT = 3.45;
const FLOOR_Y = 3.48;
const HALF_WIDTH = WIDTH / 2;
const HALF_DEPTH = DEPTH / 2;
const RAMP_START_X = -7.1;
const RAMP_END_X = 4.7;
const RAMP_Z = 5.5;
const RAMP_RISE = FLOOR_Y;
const RAMP_RUN = RAMP_END_X - RAMP_START_X;
const DOOR_FRAME_OUTSET = WALL / 2 + 0.09;
const SEAM_OUTSET = WALL / 2 + 0.08;


const solid = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  surface: HouseSurface,
  collidable = true,
  kind: HouseSolid['kind'] = 'wall',
  rotation?: [number, number, number],
): LocalSolid => ({ id: name, name, position, size, surface, collidable, kind, breakable: kind === 'glass', rotation });

function splitWallAroundDoor(
  name: string,
  z: number,
  centreX: number,
  width: number,
  surface: 'aqua' | 'coral' | 'plaster',
  baseY = 0,
): LocalSolid[] {
  const left = centreX - width / 2;
  const right = centreX + width / 2;
  const height = baseY === 0 ? GROUND_HEIGHT : UPPER_HEIGHT;
  return [
    solid(`${name}-left`, [(-HALF_WIDTH + left) / 2, baseY + height / 2, z], [left + HALF_WIDTH, height, WALL], surface),
    solid(`${name}-right`, [(right + HALF_WIDTH) / 2, baseY + height / 2, z], [HALF_WIDTH - right, height, WALL], surface),
    solid(`${name}-lintel`, [centreX, baseY + height - 0.28, z], [width, 0.56, WALL], 'trim'),
  ];
}

function groundFrontWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const doorX = -3.4;
  const doorWidth = 2.2;
  const windowX = 4.4;
  const windowWidth = 2.6;
  const doorLeft = doorX - doorWidth / 2;
  const doorRight = doorX + doorWidth / 2;
  const windowLeft = windowX - windowWidth / 2;
  const windowRight = windowX + windowWidth / 2;
  return [
    solid('front-ground-far-left', [(-HALF_WIDTH + doorLeft) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [doorLeft + HALF_WIDTH, GROUND_HEIGHT, WALL], surface),
    solid('front-ground-centre', [(doorRight + windowLeft) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [windowLeft - doorRight, GROUND_HEIGHT, WALL], surface),
    solid('front-ground-far-right', [(windowRight + HALF_WIDTH) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [HALF_WIDTH - windowRight, GROUND_HEIGHT, WALL], surface),
    solid('front-door-lintel', [doorX, 3.05, HALF_DEPTH], [doorWidth, 0.6, WALL], 'trim'),
    solid('ground-window-sill-wall', [windowX, 0.52, HALF_DEPTH], [windowWidth, 1.04, WALL], surface),
    solid('ground-window-lintel-wall', [windowX, 2.88, HALF_DEPTH], [windowWidth, 0.94, WALL], surface),
    solid('ground-window-glass', [windowX, 1.7, HALF_DEPTH + 0.02], [windowWidth, 1.32, 0.08], 'glass', false, 'glass'),
  ];
}

function groundRearWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const doorX = 3.4;
  const doorWidth = 2.2;
  const windowX = -4.4;
  const windowWidth = 2.6;
  const windowLeft = windowX - windowWidth / 2;
  const windowRight = windowX + windowWidth / 2;
  const doorLeft = doorX - doorWidth / 2;
  const doorRight = doorX + doorWidth / 2;
  return [
    solid('rear-ground-far-left', [(-HALF_WIDTH + windowLeft) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [windowLeft + HALF_WIDTH, GROUND_HEIGHT, WALL], surface),
    solid('rear-ground-centre', [(windowRight + doorLeft) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [doorLeft - windowRight, GROUND_HEIGHT, WALL], surface),
    solid('rear-ground-far-right', [(doorRight + HALF_WIDTH) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [HALF_WIDTH - doorRight, GROUND_HEIGHT, WALL], surface),
    solid('rear-door-lintel', [doorX, 3.05, -HALF_DEPTH], [doorWidth, 0.6, WALL], 'trim'),
    solid('rear-ground-window-sill-wall', [windowX, 0.52, -HALF_DEPTH], [windowWidth, 1.04, WALL], surface),
    solid('rear-ground-window-lintel-wall', [windowX, 2.88, -HALF_DEPTH], [windowWidth, 0.94, WALL], surface),
    solid('rear-ground-window-glass', [windowX, 1.7, -HALF_DEPTH - 0.02], [windowWidth, 1.32, 0.08], 'glass', false, 'glass'),
  ];
}

function upperFrontWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const windowX = 0;
  const windowWidth = 3;
  const left = windowX - windowWidth / 2;
  const right = windowX + windowWidth / 2;
  return [
    solid('front-upper-left', [(-HALF_WIDTH + left) / 2, FLOOR_Y + UPPER_HEIGHT / 2, HALF_DEPTH], [left + HALF_WIDTH, UPPER_HEIGHT, WALL], surface),
    solid('front-upper-right', [(right + HALF_WIDTH) / 2, FLOOR_Y + UPPER_HEIGHT / 2, HALF_DEPTH], [HALF_WIDTH - right, UPPER_HEIGHT, WALL], surface),
    solid('upper-window-sill-wall', [windowX, 4.15, HALF_DEPTH], [windowWidth, 1.04, WALL], surface),
    solid('upper-window-lintel-wall', [windowX, 6.5, HALF_DEPTH], [windowWidth, 0.86, WALL], surface),
    solid('upper-window-glass', [windowX, 5.32, HALF_DEPTH + 0.02], [windowWidth, 1.3, 0.08], 'glass', false, 'glass'),
  ];
}

function doorFrame(id: string, x: number, z: number, baseY = 0): LocalSolid[] {
  const width = 2.2;
  return [
    solid(`${id}-frame-left`, [x - width / 2 - 0.09, baseY + 1.42, z], [0.18, 2.84, 0.16], 'trim', false, 'frame'),
    solid(`${id}-frame-right`, [x + width / 2 + 0.09, baseY + 1.42, z], [0.18, 2.84, 0.16], 'trim', false, 'frame'),
    solid(`${id}-frame-head`, [x, baseY + 2.78, z], [width + 0.36, 0.18, 0.16], 'trim', false, 'frame'),
  ];
}

function rampSolids(): LocalSolid[] {
  const slopeLength = Math.hypot(RAMP_RUN, RAMP_RISE);
  const angle = Math.atan2(RAMP_RISE, RAMP_RUN);
  return [
    solid(
      'interior-access-ramp',
      [(RAMP_START_X + RAMP_END_X) / 2, RAMP_RISE / 2 + 0.04, RAMP_Z],
      [slopeLength, 0.18, 2.6],
      'timber',
      true,
      'ramp',
      [0, 0, angle],
    ),
  ];
}

function simplePlan(surface: 'aqua' | 'coral'): {
  rooms: LocalRoom[];
  solids: LocalSolid[];
  openings: LocalOpening[];
  anchors: LocalAnchor[];
  routes: HouseArchitecture['routes'];
} {
  const doorX = -3.4;
  const rearDoorX = 3.4;
  const partitionOpeningX = 1.7;
  const solids: LocalSolid[] = [
    solid('ground-west-wall', [-HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, DEPTH + WALL], surface),
    solid('ground-east-wall', [HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, DEPTH + WALL], surface),
    ...groundRearWall(surface),
    ...groundFrontWall(surface),
    ...doorFrame('front-entry', doorX, HALF_DEPTH + DOOR_FRAME_OUTSET),
    ...doorFrame('rear-entry', rearDoorX, -HALF_DEPTH - DOOR_FRAME_OUTSET),
    ...splitWallAroundDoor('ground-room-partition', 0, partitionOpeningX, 2.4, 'plaster'),
    solid('ground-floor-slab', [0, 0.04, 0], [WIDTH - WALL * 2, 0.08, DEPTH - WALL * 2], 'concrete', false, 'floor'),

    solid('upper-west-wall', [-HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, DEPTH + WALL], surface),
    solid('upper-east-wall', [HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, DEPTH + WALL], surface),
    solid('upper-rear-wall', [0, FLOOR_Y + UPPER_HEIGHT / 2, -HALF_DEPTH], [WIDTH + WALL, UPPER_HEIGHT, WALL], surface),
    ...upperFrontWall(surface),
    ...splitWallAroundDoor('upper-room-partition', 0, partitionOpeningX, 2.4, 'plaster', FLOOR_Y),
    solid('floor-seam-front', [0, FLOOR_Y - 0.05, HALF_DEPTH + SEAM_OUTSET], [WIDTH + 0.24, 0.18, 0.14], 'trim', false, 'frame'),
    solid('floor-seam-rear', [0, FLOOR_Y - 0.05, -HALF_DEPTH - SEAM_OUTSET], [WIDTH + 0.24, 0.18, 0.14], 'trim', false, 'frame'),
    solid('floor-seam-west', [-HALF_WIDTH - SEAM_OUTSET, FLOOR_Y - 0.05, 0], [0.14, 0.18, DEPTH], 'trim', false, 'frame'),
    solid('floor-seam-east', [HALF_WIDTH + SEAM_OUTSET, FLOOR_Y - 0.05, 0], [0.14, 0.18, DEPTH], 'trim', false, 'frame'),

    solid('upper-rear-floor', [0, FLOOR_Y, -4.05], [WIDTH - WALL * 2, 0.32, 8.3], 'timber', true, 'floor'),
    solid('upper-front-floor', [0, FLOOR_Y, 1.9], [WIDTH - WALL * 2, 0.32, 3.8], 'timber', true, 'floor'),
    solid('ramp-top-landing', [5.85, FLOOR_Y, 5.5], [3.4, 0.32, 4], 'timber', true, 'landing'),
    ...rampSolids(),
  ];

  const rooms: LocalRoom[] = [
    { id: 'ground-front-room', level: 'ground', centre: [0, 0, 4], size: [17.6, 7.6] },
    { id: 'ground-rear-room', level: 'ground', centre: [0, 0, -4], size: [17.6, 7.6] },
    { id: 'upper-front-room', level: 'upper', centre: [0, FLOOR_Y, 2], size: [17.6, 3.7] },
    { id: 'upper-rear-room', level: 'upper', centre: [0, FLOOR_Y, -4], size: [17.6, 7.8] },
  ];
  const openings: LocalOpening[] = [
    { id: 'front-door', kind: 'exterior-door', centre: [doorX, 1.4, HALF_DEPTH], width: 2.2, height: 2.8, route: true },
    { id: 'rear-door', kind: 'exterior-door', centre: [rearDoorX, 1.4, -HALF_DEPTH], width: 2.2, height: 2.8, route: true },
    { id: 'ground-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, 1.4, 0], width: 2.4, height: 2.8, route: true },
    { id: 'upper-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, FLOOR_Y + 1.4, 0], width: 2.4, height: 2.8, route: true },
    { id: 'front-ground-window', kind: 'window', centre: [4.4, 1.7, HALF_DEPTH], width: 2.6, height: 1.32, route: false },
    { id: 'rear-ground-window', kind: 'window', centre: [-4.4, 1.7, -HALF_DEPTH], width: 2.6, height: 1.32, route: false },
    { id: 'upper-window', kind: 'window', centre: [0, 5.32, HALF_DEPTH], width: 3, height: 1.3, route: false },
  ];
  const anchors: LocalAnchor[] = [
    { id: 'front-yard', position: [doorX, 1.7, 9.8], level: 'ground' },
    { id: 'front-door-inside', position: [doorX, 1.7, 7.1], level: 'ground' },
    { id: 'ground-front-bypass', position: [6.2, 1.7, 7], level: 'ground' },
    { id: 'ground-front', position: [6.1, 1.7, 3.2], level: 'ground' },
    { id: 'ground-opening', position: [1.7, 1.7, 0], level: 'ground' },
    { id: 'ground-rear', position: [1.7, 1.7, -4], level: 'ground' },
    { id: 'rear-door-inside', position: [rearDoorX, 1.7, -7.1], level: 'ground' },
    { id: 'rear-yard', position: [rearDoorX, 1.7, -9.8], level: 'ground' },
    { id: 'ramp-approach', position: [-7.65, 1.7, 6.9], level: 'ground' },
    { id: 'ramp-foot', position: [-7.1, 1.7, RAMP_Z], level: 'ground' },
    { id: 'ramp-mid', position: [-1.2, 3.45, RAMP_Z], level: 'upper' },
    { id: 'ramp-top', position: [4.7, 5.18, RAMP_Z], level: 'upper' },
    { id: 'landing-exit', position: [5.2, 5.18, 3.72], level: 'upper' },
    { id: 'upper-front', position: [1.7, 5.18, 2.5], level: 'upper' },
    { id: 'upper-opening', position: [1.7, 5.18, 0], level: 'upper' },
    { id: 'upper-rear', position: [1.7, 5.18, -4], level: 'upper' },
  ];
  return {
    rooms,
    solids,
    openings,
    anchors,
    routes: {
      'ground-room-flow': ['front-yard', 'front-door-inside', 'ground-front-bypass', 'ground-front', 'ground-opening', 'ground-rear', 'rear-door-inside', 'rear-yard'],
      'ramp-room-flow': ['front-door-inside', 'ramp-approach', 'ramp-foot', 'ramp-mid', 'ramp-top', 'landing-exit', 'upper-front', 'upper-opening', 'upper-rear'],
    },
  };
}

function worldPosition(position: [number, number, number], x: number, z: number, facing: 1 | -1): [number, number, number] {
  return [x + position[0], position[1], z + facing * position[2]];
}

/** Shared simplified declaration used by rendering, collision and traversal tests. */
export function createHouseArchitecture(team: Team, x: number, z: number, facing: 1 | -1): HouseArchitecture {
  const local = simplePlan(team === 0 ? 'aqua' : 'coral');
  const id = team === 0 ? 'aqua-irrigation-workshop' : 'coral-orchard-conservatory';
  return {
    id,
    label: team === 0 ? 'Aqua House' : 'Coral House',
    team,
    origin: { x, z, facing },
    dimensions: { width: WIDTH, depth: DEPTH, wallThickness: WALL },
    rooms: local.rooms.map((entry) => ({ ...entry, centre: worldPosition(entry.centre, x, z, facing) })),
    solids: local.solids.map((entry) => ({ ...entry, id: `${id}:${entry.id}`, position: worldPosition(entry.position, x, z, facing) })),
    openings: local.openings.map((entry) => ({ ...entry, centre: worldPosition(entry.centre, x, z, facing) })),
    anchors: local.anchors.map((entry) => ({ ...entry, position: worldPosition(entry.position, x, z, facing) })),
    routes: local.routes,
  };
}

export function houseCollisionSolids(x: number, z: number, facing: 1 | -1, team: Team = 0): HouseSolid[] {
  return createHouseArchitecture(team, x, z, facing).solids.filter((entry) => entry.collidable);
}

export function solidBounds(solidEntry: HouseSolid): { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; rotation?: [number, number, number] } {
  return {
    minX: solidEntry.position[0] - solidEntry.size[0] / 2,
    maxX: solidEntry.position[0] + solidEntry.size[0] / 2,
    minY: solidEntry.position[1] - solidEntry.size[1] / 2,
    maxY: solidEntry.position[1] + solidEntry.size[1] / 2,
    minZ: solidEntry.position[2] - solidEntry.size[2] / 2,
    maxZ: solidEntry.position[2] + solidEntry.size[2] / 2,
    rotation: solidEntry.rotation,
  };
}
