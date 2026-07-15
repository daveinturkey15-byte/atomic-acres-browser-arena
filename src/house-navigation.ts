import type { Team } from './protocol';

export type HouseSurface = 'aqua' | 'coral' | 'plaster' | 'brick' | 'timber' | 'concrete' | 'trim' | 'glass' | 'metal' | 'ceiling' | 'light';
export type HouseSolid = {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  surface: HouseSurface;
  collidable: boolean;
  kind: 'wall' | 'floor' | 'landing' | 'frame' | 'glass' | 'ramp';
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

const WIDTH = 16.2;
const DEPTH = 14.4;
const WALL = 0.42;
const GROUND_HEIGHT = 3.35;
const UPPER_HEIGHT = 3.45;
const FLOOR_Y = 3.48;
const HALF_WIDTH = WIDTH / 2;
const HALF_DEPTH = DEPTH / 2;
const RAMP_START_X = -6;
const RAMP_END_X = 3.8;
const RAMP_Z = 4.8;
const RAMP_RISE = FLOOR_Y;
const RAMP_RUN = RAMP_END_X - RAMP_START_X;


const solid = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  surface: HouseSurface,
  collidable = true,
  kind: HouseSolid['kind'] = 'wall',
  rotation?: [number, number, number],
): LocalSolid => ({ name, position, size, surface, collidable, kind, rotation });

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
  const doorX = -3;
  const doorWidth = 1.8;
  const windowX = 3.8;
  const windowWidth = 2.4;
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

function upperFrontWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const windowX = 0;
  const windowWidth = 2.8;
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
  const width = 1.8;
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
      [slopeLength, 0.18, 1.84],
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
  const doorX = -3;
  const partitionOpeningX = 1.5;
  const solids: LocalSolid[] = [
    solid('ground-west-wall', [-HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, DEPTH + WALL], surface),
    solid('ground-east-wall', [HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, DEPTH + WALL], surface),
    solid('ground-rear-wall', [0, GROUND_HEIGHT / 2, -HALF_DEPTH], [WIDTH + WALL, GROUND_HEIGHT, WALL], surface),
    ...groundFrontWall(surface),
    ...doorFrame('front-entry', doorX, HALF_DEPTH + 0.04),
    ...splitWallAroundDoor('ground-room-partition', 0, partitionOpeningX, 1.8, 'plaster'),

    solid('upper-west-wall', [-HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, DEPTH + WALL], surface),
    solid('upper-east-wall', [HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, DEPTH + WALL], surface),
    solid('upper-rear-wall', [0, FLOOR_Y + UPPER_HEIGHT / 2, -HALF_DEPTH], [WIDTH + WALL, UPPER_HEIGHT, WALL], surface),
    ...upperFrontWall(surface),
    ...splitWallAroundDoor('upper-room-partition', 0, partitionOpeningX, 1.8, 'plaster', FLOOR_Y),

    solid('upper-rear-floor', [0, FLOOR_Y, -3.5], [15.6, 0.3, 6.7], 'timber', true, 'floor'),
    solid('upper-front-floor', [0, FLOOR_Y, 1.8], [15.6, 0.3, 3.2], 'timber', true, 'floor'),
    solid('ramp-top-landing', [4.75, FLOOR_Y, 4.8], [2.3, 0.3, 2.4], 'timber', true, 'landing'),
    ...rampSolids(),
  ];

  const rooms: LocalRoom[] = [
    { id: 'ground-front-room', level: 'ground', centre: [0, 0, 3.5], size: [15.6, 6.6] },
    { id: 'ground-rear-room', level: 'ground', centre: [0, 0, -3.5], size: [15.6, 6.6] },
    { id: 'upper-front-room', level: 'upper', centre: [0, FLOOR_Y, 1.8], size: [15.6, 3.2] },
    { id: 'upper-rear-room', level: 'upper', centre: [0, FLOOR_Y, -3.5], size: [15.6, 6.7] },
  ];
  const openings: LocalOpening[] = [
    { id: 'front-door', kind: 'exterior-door', centre: [doorX, 1.4, HALF_DEPTH], width: 1.8, height: 2.8, route: true },
    { id: 'ground-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, 1.4, 0], width: 1.8, height: 2.8, route: true },
    { id: 'upper-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, FLOOR_Y + 1.4, 0], width: 1.8, height: 2.8, route: true },
    { id: 'ground-window', kind: 'window', centre: [3.8, 1.7, HALF_DEPTH], width: 2.4, height: 1.32, route: false },
    { id: 'upper-window', kind: 'window', centre: [0, 5.32, HALF_DEPTH], width: 2.8, height: 1.3, route: false },
  ];
  const anchors: LocalAnchor[] = [
    { id: 'front-yard', position: [doorX, 1.7, 8.8], level: 'ground' },
    { id: 'front-door-inside', position: [doorX, 1.7, 6.15], level: 'ground' },
    { id: 'ground-front-bypass', position: [5.2, 1.7, 6.05], level: 'ground' },
    { id: 'ground-front', position: [5.2, 1.7, 2.7], level: 'ground' },
    { id: 'ground-opening', position: [1.5, 1.7, 0], level: 'ground' },
    { id: 'ground-rear', position: [1.5, 1.7, -3.5], level: 'ground' },
    { id: 'ramp-approach', position: [-6.85, 1.7, 6.0], level: 'ground' },
    { id: 'ramp-foot', position: [-6.1, 1.7, RAMP_Z], level: 'ground' },
    { id: 'ramp-mid', position: [-1.1, 3.45, RAMP_Z], level: 'upper' },
    { id: 'ramp-top', position: [3.8, 5.18, RAMP_Z], level: 'upper' },
    { id: 'upper-front', position: [1.5, 5.18, 2.2], level: 'upper' },
    { id: 'upper-opening', position: [1.5, 5.18, 0], level: 'upper' },
    { id: 'upper-rear', position: [1.5, 5.18, -3.4], level: 'upper' },
  ];
  return {
    rooms,
    solids,
    openings,
    anchors,
    routes: {
      'ground-room-flow': ['front-yard', 'front-door-inside', 'ground-front-bypass', 'ground-front', 'ground-opening', 'ground-rear'],
      'ramp-room-flow': ['front-door-inside', 'ramp-approach', 'ramp-foot', 'ramp-mid', 'ramp-top', 'upper-front', 'upper-opening', 'upper-rear'],
    },
  };
}

function worldPosition(position: [number, number, number], x: number, z: number, facing: 1 | -1): [number, number, number] {
  return [x + position[0], position[1], z + facing * position[2]];
}

/** Shared simplified declaration used by rendering, collision and traversal tests. */
export function createHouseArchitecture(team: Team, x: number, z: number, facing: 1 | -1): HouseArchitecture {
  const local = simplePlan(team === 0 ? 'aqua' : 'coral');
  return {
    id: team === 0 ? 'aqua-irrigation-workshop' : 'coral-orchard-conservatory',
    label: team === 0 ? 'Aqua House' : 'Coral House',
    team,
    dimensions: { width: WIDTH, depth: DEPTH, wallThickness: WALL },
    rooms: local.rooms.map((entry) => ({ ...entry, centre: worldPosition(entry.centre, x, z, facing) })),
    solids: local.solids.map((entry) => ({ ...entry, position: worldPosition(entry.position, x, z, facing) })),
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
