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
  kind: 'exterior-door' | 'interior-opening' | 'ramp-entry' | 'window';
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

const WIDTH = 20.2;
const DEPTH = 16.4;
const WALL = 0.42;
const GROUND_HEIGHT = 3.35;
const UPPER_HEIGHT = 3.45;
const FLOOR_Y = 3.48;
const HALF_WIDTH = WIDTH / 2;
const HALF_DEPTH = DEPTH / 2;
const WINDOW_SILL_TOP = 0.58;
const WINDOW_OPENING_TOP = 2.55;
const WINDOW_OPENING_HEIGHT = WINDOW_OPENING_TOP - WINDOW_SILL_TOP;
const WINDOW_CENTRE_Y = (WINDOW_OPENING_TOP + WINDOW_SILL_TOP) / 2;
const RAMP_BOTTOM_Z = 6;
const RAMP_TOP_Z = -3.4;
const RAMP_ENTRY_Z = -4.8;
const RAMP_RISE = FLOOR_Y;
const RAMP_RUN = RAMP_BOTTOM_Z - RAMP_TOP_Z;
const RAMP_WIDTH = 2.8;
const RAMP_SIDE_OUTSET = 1.85;
const INDOOR_RAMP_BOTTOM_Z = 7;
const INDOOR_RAMP_TOP_Z = 0.8;
const INDOOR_RAMP_RISE = FLOOR_Y;
const INDOOR_RAMP_RUN = INDOOR_RAMP_BOTTOM_Z - INDOOR_RAMP_TOP_Z;
const INDOOR_RAMP_WIDTH = 2.2;
const INDOOR_RAMP_X = HALF_WIDTH - 1.75;
const INDOOR_OPENING_FRONT_Z = 6.1;
const INDOOR_OPENING_REAR_Z = 0.1;
const FLOOR_OUTER_X = HALF_WIDTH - 0.1;
const FLOOR_OUTER_Z = HALF_DEPTH - 0.1;
const INDOOR_OPENING_INNER_X = HALF_WIDTH - 3.4;
const DOOR_FRAME_OUTSET = WALL / 2 + 0.09;
const SEAM_OUTSET = WALL / 2 + 0.08;
const RAMP_LANDING_OVERLAP = 0.06;

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

function splitSideWallAroundDoor(
  name: string,
  x: number,
  centreZ: number,
  width: number,
  surface: 'aqua' | 'coral',
  baseY: number,
): LocalSolid[] {
  const rearEdge = centreZ - width / 2;
  const frontEdge = centreZ + width / 2;
  const sideRear = -HALF_DEPTH + WALL / 2;
  const sideFront = HALF_DEPTH - WALL / 2;
  const height = baseY === 0 ? GROUND_HEIGHT : UPPER_HEIGHT;
  return [
    solid(`${name}-rear`, [x, baseY + height / 2, (sideRear + rearEdge) / 2], [WALL, height, rearEdge - sideRear], surface),
    solid(`${name}-front`, [x, baseY + height / 2, (frontEdge + sideFront) / 2], [WALL, height, sideFront - frontEdge], surface),
    solid(`${name}-lintel`, [x, baseY + height - 0.28, centreZ], [WALL, 0.56, width], 'trim'),
  ];
}

function groundFrontWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const doorX = -3.8;
  const doorWidth = 2.2;
  const windowX = 4.8;
  const windowWidth = 2.8;
  const doorLeft = doorX - doorWidth / 2;
  const doorRight = doorX + doorWidth / 2;
  const windowLeft = windowX - windowWidth / 2;
  const windowRight = windowX + windowWidth / 2;
  return [
    solid('front-ground-far-left', [(-HALF_WIDTH + doorLeft) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [doorLeft + HALF_WIDTH, GROUND_HEIGHT, WALL], surface),
    solid('front-ground-centre', [(doorRight + windowLeft) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [windowLeft - doorRight, GROUND_HEIGHT, WALL], surface),
    solid('front-ground-far-right', [(windowRight + HALF_WIDTH) / 2, GROUND_HEIGHT / 2, HALF_DEPTH], [HALF_WIDTH - windowRight, GROUND_HEIGHT, WALL], surface),
    solid('front-door-lintel', [doorX, 3.05, HALF_DEPTH], [doorWidth, 0.6, WALL], 'trim'),
    solid('ground-window-sill-wall', [windowX, WINDOW_SILL_TOP / 2, HALF_DEPTH], [windowWidth, WINDOW_SILL_TOP, WALL], surface),
    solid('ground-window-lintel-wall', [windowX, (WINDOW_OPENING_TOP + GROUND_HEIGHT) / 2, HALF_DEPTH], [windowWidth, GROUND_HEIGHT - WINDOW_OPENING_TOP, WALL], surface),
    solid('ground-window-glass', [windowX, WINDOW_CENTRE_Y, HALF_DEPTH + 0.02], [windowWidth, WINDOW_OPENING_HEIGHT, 0.08], 'glass', false, 'glass'),
  ];
}

function groundRearWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const doorX = 3.8;
  const doorWidth = 2.2;
  const windowX = -4.8;
  const windowWidth = 2.8;
  const windowLeft = windowX - windowWidth / 2;
  const windowRight = windowX + windowWidth / 2;
  const doorLeft = doorX - doorWidth / 2;
  const doorRight = doorX + doorWidth / 2;
  return [
    solid('rear-ground-far-left', [(-HALF_WIDTH + windowLeft) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [windowLeft + HALF_WIDTH, GROUND_HEIGHT, WALL], surface),
    solid('rear-ground-centre', [(windowRight + doorLeft) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [doorLeft - windowRight, GROUND_HEIGHT, WALL], surface),
    solid('rear-ground-far-right', [(doorRight + HALF_WIDTH) / 2, GROUND_HEIGHT / 2, -HALF_DEPTH], [HALF_WIDTH - doorRight, GROUND_HEIGHT, WALL], surface),
    solid('rear-door-lintel', [doorX, 3.05, -HALF_DEPTH], [doorWidth, 0.6, WALL], 'trim'),
    solid('rear-ground-window-sill-wall', [windowX, WINDOW_SILL_TOP / 2, -HALF_DEPTH], [windowWidth, WINDOW_SILL_TOP, WALL], surface),
    solid('rear-ground-window-lintel-wall', [windowX, (WINDOW_OPENING_TOP + GROUND_HEIGHT) / 2, -HALF_DEPTH], [windowWidth, GROUND_HEIGHT - WINDOW_OPENING_TOP, WALL], surface),
    solid('rear-ground-window-glass', [windowX, WINDOW_CENTRE_Y, -HALF_DEPTH - 0.02], [windowWidth, WINDOW_OPENING_HEIGHT, 0.08], 'glass', false, 'glass'),
  ];
}

function upperFrontWall(surface: 'aqua' | 'coral'): LocalSolid[] {
  const windowX = 0;
  const windowWidth = 3.2;
  const left = windowX - windowWidth / 2;
  const right = windowX + windowWidth / 2;
  const sillTop = FLOOR_Y + WINDOW_SILL_TOP;
  const openingTop = FLOOR_Y + WINDOW_OPENING_TOP;
  return [
    solid('front-upper-left', [(-HALF_WIDTH + left) / 2, FLOOR_Y + UPPER_HEIGHT / 2, HALF_DEPTH], [left + HALF_WIDTH, UPPER_HEIGHT, WALL], surface),
    solid('front-upper-right', [(right + HALF_WIDTH) / 2, FLOOR_Y + UPPER_HEIGHT / 2, HALF_DEPTH], [HALF_WIDTH - right, UPPER_HEIGHT, WALL], surface),
    solid('upper-window-sill-wall', [windowX, FLOOR_Y + WINDOW_SILL_TOP / 2, HALF_DEPTH], [windowWidth, WINDOW_SILL_TOP, WALL], surface),
    solid('upper-window-lintel-wall', [windowX, (openingTop + FLOOR_Y + UPPER_HEIGHT) / 2, HALF_DEPTH], [windowWidth, FLOOR_Y + UPPER_HEIGHT - openingTop, WALL], surface),
    solid('upper-window-glass', [windowX, FLOOR_Y + WINDOW_CENTRE_Y, HALF_DEPTH + 0.02], [windowWidth, WINDOW_OPENING_HEIGHT, 0.08], 'glass', false, 'glass'),
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

function sideDoorFrame(id: string, side: 1 | -1, z: number, baseY: number): LocalSolid[] {
  const width = 2.6;
  const x = side * (HALF_WIDTH + DOOR_FRAME_OUTSET);
  return [
    solid(`${id}-frame-rear`, [x, baseY + 1.42, z - width / 2 - 0.09], [0.16, 2.84, 0.18], 'trim', false, 'frame'),
    solid(`${id}-frame-front`, [x, baseY + 1.42, z + width / 2 + 0.09], [0.16, 2.84, 0.18], 'trim', false, 'frame'),
    solid(`${id}-frame-head`, [x, baseY + 2.78, z], [0.16, 0.18, width + 0.36], 'trim', false, 'frame'),
  ];
}

function rampSolids(side: 1 | -1): LocalSolid[] {
  const slopeLength = Math.hypot(RAMP_RUN, RAMP_RISE);
  const angle = Math.atan2(RAMP_RISE, RAMP_RUN);
  return [
    solid(
      'exterior-access-ramp',
      [side * (HALF_WIDTH + RAMP_SIDE_OUTSET), RAMP_RISE / 2 + 0.04, (RAMP_BOTTOM_Z + RAMP_TOP_Z) / 2],
      [RAMP_WIDTH, 0.18, slopeLength],
      'timber',
      true,
      'ramp',
      [angle, 0, 0],
    ),
  ];
}

function indoorRampSolids(side: 1 | -1): LocalSolid[] {
  const slopeLength = Math.hypot(INDOOR_RAMP_RUN, INDOOR_RAMP_RISE);
  const angle = Math.atan2(INDOOR_RAMP_RISE, INDOOR_RAMP_RUN);
  const x = side * INDOOR_RAMP_X;
  const y = INDOOR_RAMP_RISE / 2 + 0.04;
  const z = (INDOOR_RAMP_BOTTOM_Z + INDOOR_RAMP_TOP_Z) / 2;
  // Keep the presentation rails outside the timber ramp instead of embedding
  // their long side faces one centimetre into it. The former overlap was
  // coplanar enough to shimmer along almost the complete indoor incline.
  const railXs = [x - side * (INDOOR_RAMP_WIDTH / 2 + 0.07), x + side * (INDOOR_RAMP_WIDTH / 2 + 0.07)];
  const posts = [0.18, 0.82].flatMap((progress, index) => {
    const postZ = INDOOR_RAMP_BOTTOM_Z - INDOOR_RAMP_RUN * progress;
    const postBaseY = INDOOR_RAMP_RISE * progress;
    return railXs.map((railX, sideIndex) => solid(
      `interior-ramp-post-${index}-${sideIndex}`,
      [railX, postBaseY + 0.38, postZ],
      [0.08, 0.76, 0.08],
      'metal',
      false,
      'frame',
    ));
  });
  return [
    solid('interior-access-ramp', [x, y, z], [INDOOR_RAMP_WIDTH, 0.18, slopeLength], 'timber', true, 'ramp', [angle, 0, 0]),
    solid('interior-ramp-rail-inner', [railXs[0], y + 0.62, z], [0.08, 0.08, slopeLength], 'metal', false, 'frame', [angle, 0, 0]),
    solid('interior-ramp-rail-outer', [railXs[1], y + 0.62, z], [0.08, 0.08, slopeLength], 'metal', false, 'frame', [angle, 0, 0]),
    ...posts,
  ];
}

function upperFloorSolids(indoorSide: 1 | -1): LocalSolid[] {
  const mainInnerEdge = indoorSide * INDOOR_OPENING_INNER_X;
  const mainMinX = indoorSide === 1 ? -FLOOR_OUTER_X : mainInnerEdge;
  const mainMaxX = indoorSide === 1 ? mainInnerEdge : FLOOR_OUTER_X;
  // Adjacent upper-floor boxes meet edge-to-edge. Earlier 8 cm overlaps kept
  // traversal sealed but exported duplicate top faces at exactly the same depth.
  const stripMinX = indoorSide === 1 ? INDOOR_OPENING_INNER_X : -FLOOR_OUTER_X;
  const stripMaxX = indoorSide === 1 ? FLOOR_OUTER_X : -INDOOR_OPENING_INNER_X;
  const floorDepth = FLOOR_OUTER_Z * 2;
  const frontDepth = FLOOR_OUTER_Z - INDOOR_OPENING_FRONT_Z;
  const rearDepth = INDOOR_OPENING_REAR_Z + FLOOR_OUTER_Z;
  return [
    solid('upper-floor-main', [(mainMinX + mainMaxX) / 2, FLOOR_Y, 0], [mainMaxX - mainMinX, 0.32, floorDepth], 'timber', true, 'floor'),
    solid('upper-floor-ramp-front', [(stripMinX + stripMaxX) / 2, FLOOR_Y, (INDOOR_OPENING_FRONT_Z + FLOOR_OUTER_Z) / 2], [stripMaxX - stripMinX, 0.32, frontDepth], 'timber', true, 'floor'),
    solid('upper-floor-ramp-rear', [(stripMinX + stripMaxX) / 2, FLOOR_Y, (-FLOOR_OUTER_Z + INDOOR_OPENING_REAR_Z) / 2], [stripMaxX - stripMinX, 0.32, rearDepth], 'timber', true, 'floor'),
  ];
}

function simplePlan(surface: 'aqua' | 'coral', rampSide: 1 | -1): {
  rooms: LocalRoom[];
  solids: LocalSolid[];
  openings: LocalOpening[];
  anchors: LocalAnchor[];
  routes: HouseArchitecture['routes'];
} {
  const doorX = -3.8;
  const rearDoorX = 3.8;
  const partitionOpeningX = 2;
  const rampWallX = rampSide * HALF_WIDTH;
  const indoorRampSide = -rampSide as 1 | -1;
  const sideWallDepth = DEPTH - WALL;
  const westUpperWall = rampSide === -1
    ? splitSideWallAroundDoor('upper-ramp-side-wall', -HALF_WIDTH, RAMP_ENTRY_Z, 2.6, surface, FLOOR_Y)
    : [solid('upper-west-wall', [-HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, sideWallDepth], surface)];
  const eastUpperWall = rampSide === 1
    ? splitSideWallAroundDoor('upper-ramp-side-wall', HALF_WIDTH, RAMP_ENTRY_Z, 2.6, surface, FLOOR_Y)
    : [solid('upper-east-wall', [HALF_WIDTH, FLOOR_Y + UPPER_HEIGHT / 2, 0], [WALL, UPPER_HEIGHT, sideWallDepth], surface)];
  const solids: LocalSolid[] = [
    solid('ground-west-wall', [-HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, sideWallDepth], surface),
    solid('ground-east-wall', [HALF_WIDTH, GROUND_HEIGHT / 2, 0], [WALL, GROUND_HEIGHT, sideWallDepth], surface),
    ...groundRearWall(surface),
    ...groundFrontWall(surface),
    ...doorFrame('front-entry', doorX, HALF_DEPTH + DOOR_FRAME_OUTSET),
    ...doorFrame('rear-entry', rearDoorX, -HALF_DEPTH - DOOR_FRAME_OUTSET),
    ...splitWallAroundDoor('ground-room-partition', 0, partitionOpeningX, 2.6, 'plaster'),
    solid('ground-floor-slab', [0, 0.06, 0], [WIDTH - 0.2, 0.12, DEPTH - 0.2], 'concrete', false, 'floor'),

    ...westUpperWall,
    ...eastUpperWall,
    solid('upper-rear-wall', [0, FLOOR_Y + UPPER_HEIGHT / 2, -HALF_DEPTH], [WIDTH + WALL, UPPER_HEIGHT, WALL], surface),
    ...upperFrontWall(surface),
    ...splitWallAroundDoor('upper-room-partition', 0, partitionOpeningX, 2.6, 'plaster', FLOOR_Y),
    ...sideDoorFrame('upper-ramp-entry', rampSide, RAMP_ENTRY_Z, FLOOR_Y),
    solid('floor-seam-front', [0, FLOOR_Y - 0.05, HALF_DEPTH + SEAM_OUTSET], [WIDTH + 0.24, 0.18, 0.14], 'trim', false, 'frame'),
    solid('floor-seam-rear', [0, FLOOR_Y - 0.05, -HALF_DEPTH - SEAM_OUTSET], [WIDTH + 0.24, 0.18, 0.14], 'trim', false, 'frame'),
    solid('floor-seam-west', [-HALF_WIDTH - SEAM_OUTSET, FLOOR_Y - 0.05, 0], [0.14, 0.18, DEPTH], 'trim', false, 'frame'),
    solid('floor-seam-east', [HALF_WIDTH + SEAM_OUTSET, FLOOR_Y - 0.05, 0], [0.14, 0.18, DEPTH], 'trim', false, 'frame'),

    ...upperFloorSolids(indoorRampSide),
    solid(
      'ramp-top-landing',
      [rampSide * (HALF_WIDTH + RAMP_SIDE_OUTSET), FLOOR_Y, ((RAMP_TOP_Z + RAMP_LANDING_OVERLAP) + (RAMP_ENTRY_Z - 0.4)) / 2],
      [3.9, 0.32, (RAMP_TOP_Z + RAMP_LANDING_OVERLAP) - (RAMP_ENTRY_Z - 0.4)],
      'timber',
      true,
      'landing',
    ),
    solid(
      'interior-ramp-top-landing',
      [indoorRampSide * ((INDOOR_OPENING_INNER_X + INDOOR_RAMP_X + INDOOR_RAMP_WIDTH / 2) / 2), FLOOR_Y, ((INDOOR_RAMP_TOP_Z + RAMP_LANDING_OVERLAP) + INDOOR_OPENING_REAR_Z) / 2],
      [INDOOR_RAMP_X + INDOOR_RAMP_WIDTH / 2 - INDOOR_OPENING_INNER_X, 0.32, (INDOOR_RAMP_TOP_Z + RAMP_LANDING_OVERLAP) - INDOOR_OPENING_REAR_Z],
      'timber',
      true,
      'landing',
    ),
    ...rampSolids(rampSide),
    ...indoorRampSolids(indoorRampSide),
  ];

  const rooms: LocalRoom[] = [
    { id: 'ground-front-room', level: 'ground', centre: [0, 0, 4], size: [19.4, 7.6] },
    { id: 'ground-rear-room', level: 'ground', centre: [0, 0, -4], size: [19.4, 7.6] },
    { id: 'upper-front-room', level: 'upper', centre: [0, FLOOR_Y, 4], size: [19.4, 7.6] },
    { id: 'upper-rear-room', level: 'upper', centre: [0, FLOOR_Y, -4], size: [19.4, 7.6] },
  ];
  const openings: LocalOpening[] = [
    { id: 'front-door', kind: 'exterior-door', centre: [doorX, 1.4, HALF_DEPTH], width: 2.2, height: 2.8, route: true },
    { id: 'rear-door', kind: 'exterior-door', centre: [rearDoorX, 1.4, -HALF_DEPTH], width: 2.2, height: 2.8, route: true },
    { id: 'ground-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, 1.4, 0], width: 2.6, height: 2.8, route: true },
    { id: 'upper-room-opening', kind: 'interior-opening', centre: [partitionOpeningX, FLOOR_Y + 1.4, 0], width: 2.6, height: 2.8, route: true },
    { id: 'upper-ramp-entry', kind: 'ramp-entry', centre: [rampWallX, FLOOR_Y + 1.4, RAMP_ENTRY_Z], width: 2.6, height: 2.8, route: true },
    { id: 'front-ground-window', kind: 'window', centre: [4.8, WINDOW_CENTRE_Y, HALF_DEPTH], width: 2.8, height: WINDOW_OPENING_HEIGHT, route: true },
    { id: 'rear-ground-window', kind: 'window', centre: [-4.8, WINDOW_CENTRE_Y, -HALF_DEPTH], width: 2.8, height: WINDOW_OPENING_HEIGHT, route: true },
    { id: 'upper-window', kind: 'window', centre: [0, FLOOR_Y + WINDOW_CENTRE_Y, HALF_DEPTH], width: 3.2, height: WINDOW_OPENING_HEIGHT, route: true },
  ];
  const rampX = rampSide * (HALF_WIDTH + RAMP_SIDE_OUTSET);
  const indoorRampX = indoorRampSide * INDOOR_RAMP_X;
  const anchors: LocalAnchor[] = [
    { id: 'front-yard', position: [doorX, 1.7, 9.9], level: 'ground' },
    { id: 'front-door-inside', position: [doorX, 1.7, 7], level: 'ground' },
    { id: 'ground-front', position: [doorX, 1.7, 3.2], level: 'ground' },
    { id: 'ground-opening', position: [partitionOpeningX, 1.7, 0], level: 'ground' },
    { id: 'ground-rear', position: [rearDoorX, 1.7, -3.2], level: 'ground' },
    { id: 'rear-door-inside', position: [rearDoorX, 1.7, -7], level: 'ground' },
    { id: 'rear-yard', position: [rearDoorX, 1.7, -9.9], level: 'ground' },
    { id: 'ramp-approach', position: [rampX, 1.7, 8], level: 'ground' },
    { id: 'ramp-foot', position: [rampX, 1.7, RAMP_BOTTOM_Z], level: 'ground' },
    { id: 'ramp-mid', position: [rampX, 3.44, (RAMP_BOTTOM_Z + RAMP_TOP_Z) / 2], level: 'upper' },
    { id: 'ramp-top', position: [rampX, 5.18, RAMP_TOP_Z], level: 'upper' },
    { id: 'landing-exit', position: [rampSide * (HALF_WIDTH - 1), 5.18, RAMP_ENTRY_Z], level: 'upper' },
    { id: 'indoor-ramp-foot', position: [indoorRampX, 1.7, INDOOR_RAMP_BOTTOM_Z], level: 'ground' },
    { id: 'indoor-ramp-mid', position: [indoorRampX, 3.44, (INDOOR_RAMP_BOTTOM_Z + INDOOR_RAMP_TOP_Z) / 2], level: 'upper' },
    { id: 'indoor-ramp-top', position: [indoorRampX, 5.18, INDOOR_RAMP_TOP_Z], level: 'upper' },
    { id: 'indoor-landing-exit', position: [indoorRampSide * (INDOOR_OPENING_INNER_X - 0.4), 5.18, INDOOR_RAMP_TOP_Z], level: 'upper' },
    { id: 'upper-rear', position: [rampSide * 4, 5.18, -3.5], level: 'upper' },
    { id: 'upper-opening', position: [partitionOpeningX, 5.18, 0], level: 'upper' },
    { id: 'upper-front', position: [partitionOpeningX, 5.18, 3.5], level: 'upper' },
  ];
  return {
    rooms,
    solids,
    openings,
    anchors,
    routes: {
      'ground-room-flow': ['front-yard', 'front-door-inside', 'ground-front', 'ground-opening', 'ground-rear', 'rear-door-inside', 'rear-yard'],
      'ramp-room-flow': ['front-yard', 'ramp-approach', 'ramp-foot', 'ramp-mid', 'ramp-top', 'landing-exit', 'upper-rear', 'upper-opening', 'upper-front'],
      'indoor-ramp-room-flow': ['front-door-inside', 'ground-front', 'indoor-ramp-foot', 'indoor-ramp-mid', 'indoor-ramp-top', 'indoor-landing-exit', 'upper-front', 'upper-opening', 'upper-rear'],
    },
  };
}

function worldPosition(position: [number, number, number], x: number, z: number, facing: 1 | -1): [number, number, number] {
  return [x + position[0], position[1], z + facing * position[2]];
}

function worldRotation(rotation: [number, number, number] | undefined, facing: 1 | -1): [number, number, number] | undefined {
  return rotation ? [rotation[0] * facing, rotation[1], rotation[2]] : undefined;
}

/** Shared simplified declaration used by rendering, collision and traversal tests. */
export function createHouseArchitecture(team: Team, x: number, z: number, facing: 1 | -1): HouseArchitecture {
  const rampSide: 1 | -1 = team === 0 ? -1 : 1;
  const local = simplePlan(team === 0 ? 'aqua' : 'coral', rampSide);
  const id = team === 0 ? 'aqua-irrigation-workshop' : 'coral-orchard-conservatory';
  return {
    id,
    label: team === 0 ? 'Aqua House' : 'Coral House',
    team,
    origin: { x, z, facing },
    dimensions: { width: WIDTH, depth: DEPTH, wallThickness: WALL },
    rooms: local.rooms.map((entry) => ({ ...entry, centre: worldPosition(entry.centre, x, z, facing) })),
    solids: local.solids.map((entry) => ({
      ...entry,
      id: `${id}:${entry.id}`,
      position: worldPosition(entry.position, x, z, facing),
      rotation: worldRotation(entry.rotation, facing),
    })),
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
