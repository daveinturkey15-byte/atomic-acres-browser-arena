import type { Team } from './protocol';

export type HouseSurface = 'aqua' | 'coral' | 'plaster' | 'brick' | 'timber' | 'concrete' | 'trim' | 'glass' | 'metal' | 'ceiling' | 'light';
export type HouseSolid = {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  surface: HouseSurface;
  collidable: boolean;
  kind: 'wall' | 'floor' | 'stair' | 'landing' | 'frame' | 'fixture' | 'glass';
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
export type HouseArchitecture = {
  id: 'aqua-irrigation-workshop' | 'coral-orchard-conservatory';
  label: string;
  team: Team;
  dimensions: { width: number; depth: number; wallThickness: number };
  solids: readonly HouseSolid[];
  openings: readonly HouseOpening[];
  anchors: readonly HouseRouteAnchor[];
  routes: Readonly<Record<string, readonly string[]>>;
};

type LocalSolid = Omit<HouseSolid, 'position'> & { position: [number, number, number] };
type LocalOpening = Omit<HouseOpening, 'centre'> & { centre: [number, number, number] };
type LocalAnchor = Omit<HouseRouteAnchor, 'position'> & { position: [number, number, number] };

const WIDTH = 16.2;
const DEPTH = 14.4;
const WALL = 0.42;
const GROUND_WALL_HEIGHT = 3.35;
const UPPER_WALL_HEIGHT = 3.45;
const FLOOR_Y = 3.48;

const solid = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  surface: HouseSurface,
  collidable = true,
  kind: HouseSolid['kind'] = 'wall',
  rotation?: [number, number, number],
): LocalSolid => ({ name, position, size, surface, collidable, kind, rotation });

/** Add a wall along local X, splitting it around a declared opening. */
function xWall(
  name: string,
  v: number,
  minX: number,
  maxX: number,
  openingX: number,
  openingWidth: number,
  surface: HouseSurface,
  height = GROUND_WALL_HEIGHT,
  thickness = WALL,
): LocalSolid[] {
  const leftEdge = openingX - openingWidth / 2;
  const rightEdge = openingX + openingWidth / 2;
  const result: LocalSolid[] = [];
  if (leftEdge > minX) result.push(solid(`${name}-left`, [(minX + leftEdge) / 2, height / 2, v], [leftEdge - minX, height, thickness], surface));
  if (rightEdge < maxX) result.push(solid(`${name}-right`, [(rightEdge + maxX) / 2, height / 2, v], [maxX - rightEdge, height, thickness], surface));
  result.push(solid(`${name}-lintel`, [openingX, 3.03, v], [openingWidth, 0.64, thickness], 'trim'));
  return result;
}

/** Add a wall along local depth, splitting it around a declared interior opening. */
function vWall(
  name: string,
  x: number,
  minV: number,
  maxV: number,
  openingV: number,
  openingWidth: number,
  surface: HouseSurface,
): LocalSolid[] {
  const low = openingV - openingWidth / 2;
  const high = openingV + openingWidth / 2;
  return [
    solid(`${name}-rear`, [x, 1.55, (minV + low) / 2], [0.3, 3.1, low - minV], surface),
    solid(`${name}-front`, [x, 1.55, (high + maxV) / 2], [0.3, 3.1, maxV - high], surface),
    solid(`${name}-lintel`, [x, 2.87, openingV], [0.3, 0.46, openingWidth], 'trim'),
  ];
}

function shell(surface: 'aqua' | 'coral', frontDoorX: number, frontDoorWidth: number, rearDoorX: number, rearDoorWidth: number): LocalSolid[] {
  const halfW = WIDTH / 2;
  const halfD = DEPTH / 2;
  return [
    solid('ground-west-wall', [-halfW, GROUND_WALL_HEIGHT / 2, 0], [WALL, GROUND_WALL_HEIGHT, DEPTH + WALL], surface),
    solid('ground-east-wall', [halfW, GROUND_WALL_HEIGHT / 2, 0], [WALL, GROUND_WALL_HEIGHT, DEPTH + WALL], surface),
    ...xWall('front-entry-wall', halfD, -halfW, halfW, frontDoorX, frontDoorWidth, surface),
    ...xWall('rear-service-wall', -halfD, -halfW, halfW, rearDoorX, rearDoorWidth, surface),
    solid('upper-west-wall', [-halfW, 5.35, 0], [WALL, UPPER_WALL_HEIGHT, DEPTH + WALL], surface),
    solid('upper-east-wall', [halfW, 5.35, 0], [WALL, UPPER_WALL_HEIGHT, DEPTH + WALL], surface),
    // Upper facades are deliberately segmented around two 2.1 m windows. Glass is non-authoritative.
    solid('upper-front-left-pier', [-6.92, 5.35, halfD], [2.36, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-front-centre-pier', [0, 5.35, halfD], [6.0, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-front-right-pier', [6.92, 5.35, halfD], [2.36, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-rear-left-pier', [-6.92, 5.35, -halfD], [2.36, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-rear-centre-pier', [0, 5.35, -halfD], [6.0, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-rear-right-pier', [6.92, 5.35, -halfD], [2.36, UPPER_WALL_HEIGHT, WALL], surface),
    solid('upper-front-window-lintel-left', [-4.7, 6.53, halfD], [2.1, 1.08, WALL], surface),
    solid('upper-front-window-sill-left', [-4.7, 4.2, halfD], [2.1, 0.72, WALL], surface),
    solid('upper-front-window-lintel-right', [4.7, 6.53, halfD], [2.1, 1.08, WALL], surface),
    solid('upper-front-window-sill-right', [4.7, 4.2, halfD], [2.1, 0.72, WALL], surface),
    solid('upper-rear-window-lintel-left', [-4.7, 6.53, -halfD], [2.1, 1.08, WALL], surface),
    solid('upper-rear-window-sill-left', [-4.7, 4.2, -halfD], [2.1, 0.72, WALL], surface),
    solid('upper-rear-window-lintel-right', [4.7, 6.53, -halfD], [2.1, 1.08, WALL], surface),
    solid('upper-rear-window-sill-right', [4.7, 4.2, -halfD], [2.1, 0.72, WALL], surface),
  ];
}

function doorFrame(id: string, x: number, v: number, width: number): LocalSolid[] {
  return [
    solid(`${id}-frame-left`, [x - width / 2 - 0.09, 1.42, v], [0.18, 2.84, 0.16], 'trim', false, 'frame'),
    solid(`${id}-frame-right`, [x + width / 2 + 0.09, 1.42, v], [0.18, 2.84, 0.16], 'trim', false, 'frame'),
    solid(`${id}-frame-head`, [x, 2.78, v], [width + 0.36, 0.18, 0.16], 'trim', false, 'frame'),
  ];
}

function stairFlight(
  id: string,
  x: number,
  startV: number,
  direction: 1 | -1,
  steps: number,
  startHeight: number,
  surface: HouseSurface,
  width: number,
): LocalSolid[] {
  const rise = 0.3;
  const run = 0.58;
  return Array.from({ length: steps }, (_, index) => {
    const height = startHeight + rise * (index + 1);
    return solid(
      `${id}-step-${index + 1}`,
      [x, height / 2, startV + direction * run * index],
      [width, height, run + 0.1],
      surface,
      true,
      'stair',
    );
  });
}

/** Non-authoritative stair finish: nosings, continuous rails and balusters follow the exact flight contract. */
function stairFinish(
  id: string,
  x: number,
  startV: number,
  direction: 1 | -1,
  steps: number,
  startHeight: number,
  width: number,
  railSides: readonly (-1 | 1)[] = [-1, 1],
): LocalSolid[] {
  const rise = 0.3;
  const run = 0.58;
  const result: LocalSolid[] = [];
  for (let index = 0; index < steps; index += 1) {
    const height = startHeight + rise * (index + 1);
    const v = startV + direction * run * index;
    result.push(solid(
      `${id}-nosing-${index + 1}`,
      [x, height + 0.025, v + direction * (run / 2 + 0.015)],
      [width + 0.1, 0.055, 0.11],
      'trim',
      false,
      'fixture',
    ));
    for (const side of railSides) {
      if (index % 2 === 0 || index === steps - 1) {
        result.push(solid(
          `${id}-${side < 0 ? 'west' : 'east'}-baluster-${index + 1}`,
          [x + side * (width / 2 + 0.065), height + 0.47, v],
          [0.065, 0.9, 0.065],
          'metal',
          false,
          'fixture',
        ));
      }
    }
  }
  const railLength = steps * Math.hypot(run, rise);
  const railY = startHeight + 0.91 + rise * (steps + 1) / 2;
  const railV = startV + direction * run * (steps - 1) / 2;
  const railPitch = -direction * Math.atan2(rise, run);
  for (const side of railSides) {
    result.push(solid(
      `${id}-${side < 0 ? 'west' : 'east'}-continuous-rail`,
      [x + side * (width / 2 + 0.065), railY, railV],
      [0.075, 0.075, railLength],
      'metal',
      false,
      'fixture',
      [railPitch, 0, 0],
    ));
  }
  return result;
}

function aquaPlan(): { solids: LocalSolid[]; openings: LocalOpening[]; anchors: LocalAnchor[]; routes: HouseArchitecture['routes'] } {
  const frontDoorX = -4.8;
  const rearDoorX = 4.75;
  const solids: LocalSolid[] = [
    ...shell('aqua', frontDoorX, 1.8, rearDoorX, 1.7),
    ...doorFrame('receiving-door', frontDoorX, 7.24, 1.8),
    ...doorFrame('mudroom-door', rearDoorX, -7.24, 1.7),
    // Opening-aware facade hierarchy breaks the team-colour shell into a
    // workshop base, structural belt and service entrance without sealing it.
    solid('workshop-front-plaster-bay', [2.1, 1.42, 7.225], [11.55, 2.62, 0.08], 'plaster', false, 'fixture'),
    solid('workshop-front-left-plaster-bay', [-6.9, 1.42, 7.225], [2.15, 2.62, 0.08], 'plaster', false, 'fixture'),
    solid('workshop-front-floor-belt', [0, 3.58, 7.28], [15.8, 0.2, 0.18], 'trim', false, 'frame'),
    solid('workshop-entry-canopy', [frontDoorX, 3.08, 7.72], [3.15, 0.16, 1.12], 'metal', false, 'fixture'),
    solid('workshop-upper-pilaster-centre', [0, 5.32, 7.26], [0.24, 2.75, 0.13], 'trim', false, 'frame'),
    solid('workshop-upper-pilaster-east', [5.92, 5.32, 7.26], [0.24, 2.75, 0.13], 'timber', false, 'frame'),
    // Receiving -> workbench -> mudroom is a broad horizontal sequence, with authored 1.4 m openings.
    ...vWall('receiving-workbench-partition', -2.55, -6.98, 6.98, 1.7, 1.5, 'plaster'),
    ...vWall('workbench-mudroom-partition', 2.45, -6.98, 6.98, -1.4, 1.4, 'plaster'),
    // Upper floor leaves a generous service-stair well and provides a real landing.
    solid('workshop-upper-west-floor', [-3.25, FLOOR_Y, 0], [9.25, 0.3, 13.7], 'timber', true, 'floor'),
    solid('workshop-upper-east-front-floor', [5.75, FLOOR_Y, 4.8], [4.3, 0.3, 4.1], 'timber', true, 'floor'),
    solid('workshop-upper-east-rear-floor', [5.75, FLOOR_Y, -5.25], [4.3, 0.3, 3.2], 'timber', true, 'floor'),
    solid('workshop-west-ceiling', [-3.25, 3.29, 0], [9.1, 0.05, 13.5], 'ceiling', false, 'fixture'),
    solid('workshop-east-front-ceiling', [5.75, 3.29, 4.8], [4.1, 0.05, 4.0], 'ceiling', false, 'fixture'),
    solid('workshop-east-rear-ceiling', [5.75, 3.29, -5.25], [4.1, 0.05, 3.1], 'ceiling', false, 'fixture'),
    solid('workshop-upper-ceiling', [0, 7.02, 0], [15.65, 0.08, 13.55], 'ceiling', false, 'fixture'),
    solid('workshop-service-landing', [5.2, FLOOR_Y, 2.35], [3.5, 0.3, 1.6], 'timber', true, 'landing'),
    solid('workshop-rear-deck', [rearDoorX, 0.18, -8.65], [5.0, 0.36, 2.5], 'concrete', true, 'landing'),
    ...stairFlight('workshop-service-stair', 5.2, -4.7, 1, 12, 0, 'timber', 1.55),
    ...stairFinish('workshop-service-stair-finish', 5.2, -4.7, 1, 12, 0, 1.55),
    solid('workshop-landing-guard-rail', [6.91, 4.42, 2.35], [0.075, 0.075, 1.52], 'metal', false, 'fixture'),
    solid('workshop-landing-guard-post-front', [6.91, 3.97, 3.05], [0.075, 0.9, 0.075], 'metal', false, 'fixture'),
    solid('workshop-landing-guard-post-rear', [6.91, 3.97, 1.65], [0.075, 0.9, 0.075], 'metal', false, 'fixture'),
    // A finished representative lane: workbench, receiving rail and mudroom lockers share the plan contract.
    solid('receiving-counter-base', [-5.85, 0.42, 3.1], [0.82, 0.84, 3.8], 'aqua', true, 'fixture'),
    solid('receiving-counter-top', [-5.85, 0.92, 3.1], [1.18, 0.16, 4.15], 'timber', false, 'fixture'),
    solid('irrigation-workbench-base', [0.0, 0.4, -5.8], [3.25, 0.8, 0.5], 'metal', true, 'fixture'),
    solid('irrigation-workbench-top', [0.0, 0.91, -5.8], [3.8, 0.16, 0.78], 'timber', false, 'fixture'),
    solid('irrigation-workbench-knee-recess', [0, 0.48, -5.51], [1.4, 0.5, 0.05], 'aqua', false, 'fixture'),
    solid('irrigation-workbench-lower-shelf', [0, 0.24, -5.42], [3.3, 0.1, 0.42], 'timber', false, 'fixture'),
    solid('irrigation-workbench-handle-left', [-1.0, 0.67, -5.49], [0.48, 0.06, 0.06], 'trim', false, 'fixture'),
    solid('irrigation-workbench-handle-right', [1.0, 0.67, -5.49], [0.48, 0.06, 0.06], 'trim', false, 'fixture'),
    solid('mudroom-lockers', [6.85, 1.1, -0.6], [1.1, 2.2, 2.8], 'aqua', true, 'fixture'),
    solid('overhead-pipe', [0.3, 2.75, -5.75], [5.2, 0.16, 0.16], 'metal', false, 'fixture'),
    solid('workshop-ceiling-light-front', [-0.8, 3.25, 2.5], [3.2, 0.06, 0.42], 'light', false, 'fixture'),
    solid('workshop-ceiling-light-rear', [0.6, 3.25, -3.0], [3.2, 0.06, 0.42], 'light', false, 'fixture'),
  ];
  const openings: LocalOpening[] = [
    { id: 'front-receiving-door', kind: 'exterior-door', centre: [frontDoorX, 1.4, 7.2], width: 1.8, height: 2.8, route: true },
    { id: 'receiving-workbench-opening', kind: 'interior-opening', centre: [-2.55, 1.4, 1.7], width: 1.5, height: 2.8, route: true },
    { id: 'workbench-mudroom-opening', kind: 'interior-opening', centre: [2.45, 1.4, -1.4], width: 1.4, height: 2.8, route: true },
    { id: 'rear-mudroom-door', kind: 'exterior-door', centre: [rearDoorX, 1.4, -7.2], width: 1.7, height: 2.8, route: true },
  ];
  const anchors: LocalAnchor[] = [
    { id: 'front-yard', position: [frontDoorX, 1.7, 8.8], level: 'ground' },
    { id: 'receiving', position: [-4.7, 1.7, 3.2], level: 'ground' },
    { id: 'receiving-opening', position: [-1.7, 1.7, 1.7], level: 'ground' },
    { id: 'workbench', position: [0.4, 1.7, 0.2], level: 'ground' },
    { id: 'mudroom-opening', position: [3.2, 1.7, -1.4], level: 'ground' },
    { id: 'mudroom', position: [4.75, 1.7, -5.4], level: 'ground' },
    { id: 'rear-yard', position: [rearDoorX, 2.05, -9.5], level: 'ground' },
    { id: 'stair-foot', position: [5.2, 1.7, -5.55], level: 'ground' },
    { id: 'upper-landing', position: [5.2, 5.25, 2.35], level: 'upper' },
    { id: 'upper-workshop', position: [-2.0, 5.25, 3.8], level: 'upper' },
  ];
  return { solids, openings, anchors, routes: {
    'receiving-service-flow': ['front-yard', 'receiving', 'receiving-opening', 'workbench', 'mudroom-opening', 'mudroom', 'rear-yard'],
    'service-stair-flow': ['mudroom', 'stair-foot', 'upper-landing', 'upper-workshop'],
  } };
}

function coralPlan(): { solids: LocalSolid[]; openings: LocalOpening[]; anchors: LocalAnchor[]; routes: HouseArchitecture['routes'] } {
  const frontDoorX = -3.7;
  const rearDoorX = 4.25;
  const solids: LocalSolid[] = [
    ...shell('coral', frontDoorX, 1.6, rearDoorX, 1.8),
    ...doorFrame('offset-vestibule-door', frontDoorX, 7.24, 1.6),
    ...doorFrame('sunroom-door', rearDoorX, -7.24, 1.8),
    // Orchard-facing masonry base and timber canopy remain split around the
    // offset vestibule so the authored entrance reads clearly from spawn.
    solid('conservatory-front-brick-base-left', [-6.35, 0.58, 7.225], [3.25, 1.08, 0.08], 'brick', false, 'fixture'),
    solid('conservatory-front-brick-base-right', [2.55, 0.58, 7.225], [10.65, 1.08, 0.08], 'brick', false, 'fixture'),
    solid('conservatory-front-floor-belt', [0, 3.58, 7.28], [15.8, 0.2, 0.18], 'trim', false, 'frame'),
    solid('conservatory-entry-canopy', [frontDoorX, 3.08, 7.72], [3.0, 0.18, 1.2], 'timber', false, 'fixture'),
    solid('conservatory-upper-pilaster-west', [-5.9, 5.32, 7.26], [0.26, 2.75, 0.13], 'brick', false, 'frame'),
    solid('conservatory-upper-pilaster-east', [5.9, 5.32, 7.26], [0.26, 2.75, 0.13], 'timber', false, 'frame'),
    // An offset vestibule and central orchard core create a two-sided living loop.
    ...xWall('vestibule-screen', 4.55, -7.88, -0.9, -3.55, 1.3, 'plaster', 3.1, 0.3),
    solid('orchard-core', [0.45, 1.55, -0.2], [3.9, 3.1, 3.5], 'brick', true, 'wall'),
    // Glazed sunroom boundary remains visibly transparent but authoritative around its 1.5 m opening.
    // Two intentional openings: west living-loop passage and east stair access.
    solid('sunroom-screen-west', [-5.065, 1.55, -4.75], [5.63, 3.1, 0.12], 'glass', true, 'glass'),
    solid('sunroom-screen-centre', [1.925, 1.55, -4.75], [5.35, 3.1, 0.12], 'glass', true, 'glass'),
    solid('sunroom-screen-east', [6.99, 1.55, -4.75], [1.78, 3.1, 0.12], 'glass', true, 'glass'),
    ...doorFrame('sunroom-living-opening', -1.5, -4.75, 1.5),
    ...doorFrame('sunroom-stair-opening', 5.35, -4.75, 1.5),

    // Dogleg stair: two 1.5 m flights, a full 1.8 m cross landing, then upper convergence.
    ...stairFlight('conservatory-dogleg-lower', 5.35, -3.5, 1, 6, 0, 'timber', 1.5),
    ...stairFinish('conservatory-dogleg-lower-finish', 5.35, -3.5, 1, 6, 0, 1.5, [-1]),
    solid('conservatory-dogleg-mid-landing', [4.15, 1.65, -0.25], [3.9, 0.3, 1.8], 'timber', true, 'landing'),
    ...stairFlight('conservatory-dogleg-upper', 2.95, -0.55, -1, 6, 1.8, 'timber', 1.5),
    ...stairFinish('conservatory-dogleg-upper-finish', 2.95, -0.55, -1, 6, 1.8, 1.5, [1]),
    solid('conservatory-upper-landing', [2.95, FLOOR_Y, -3.85], [2.4, 0.3, 1.8], 'timber', true, 'landing'),
    solid('conservatory-upper-landing-guard-rail', [4.12, 4.42, -3.85], [0.075, 0.075, 1.72], 'metal', false, 'fixture'),
    solid('conservatory-upper-landing-guard-post-front', [4.12, 3.97, -3.08], [0.075, 0.9, 0.075], 'metal', false, 'fixture'),
    solid('conservatory-upper-landing-guard-post-rear', [4.12, 3.97, -4.62], [0.075, 0.9, 0.075], 'metal', false, 'fixture'),
    solid('conservatory-upper-west-floor', [-2.75, FLOOR_Y, 0], [10.1, 0.3, 13.7], 'timber', true, 'floor'),
    solid('conservatory-upper-east-front-floor', [5.85, FLOOR_Y, 3.45], [4.1, 0.3, 6.8], 'timber', true, 'floor'),
    solid('conservatory-upper-east-rear-floor', [5.85, FLOOR_Y, -6.0], [4.1, 0.3, 1.7], 'timber', true, 'floor'),
    solid('conservatory-west-ceiling', [-2.75, 3.29, 0], [9.9, 0.05, 13.5], 'ceiling', false, 'fixture'),
    solid('conservatory-east-front-ceiling', [5.85, 3.29, 3.45], [4.0, 0.05, 6.65], 'ceiling', false, 'fixture'),
    solid('conservatory-east-rear-ceiling', [5.85, 3.29, -6.0], [4.0, 0.05, 1.6], 'ceiling', false, 'fixture'),
    solid('conservatory-upper-ceiling', [0, 7.02, 0], [15.65, 0.08, 13.55], 'ceiling', false, 'fixture'),
    solid('conservatory-rear-deck', [rearDoorX, 0.18, -8.65], [5.2, 0.36, 2.5], 'concrete', true, 'landing'),
    solid('planter-island', [-4.8, 0.48, -5.9], [3.2, 0.96, 0.9], 'brick', true, 'fixture'),
    solid('planter-island-cap', [-4.8, 1.0, -5.9], [3.45, 0.12, 1.12], 'trim', false, 'fixture'),
    solid('potting-bench', [6.45, 0.52, 2.7], [0.8, 1.04, 2.8], 'timber', true, 'fixture'),
    solid('potting-bench-top', [6.45, 1.08, 2.7], [1.05, 0.14, 3.15], 'trim', false, 'fixture'),
    solid('potting-bench-shelf', [6.08, 0.42, 2.7], [0.12, 0.12, 2.5], 'metal', false, 'fixture'),
    solid('conservatory-ceiling-light-front', [-2.4, 3.25, 2.8], [3.0, 0.06, 0.42], 'light', false, 'fixture'),
    solid('conservatory-ceiling-light-rear', [-0.5, 3.25, -3.2], [3.0, 0.06, 0.42], 'light', false, 'fixture'),
  ];
  const openings: LocalOpening[] = [
    { id: 'front-offset-vestibule', kind: 'exterior-door', centre: [frontDoorX, 1.4, 7.2], width: 1.6, height: 2.8, route: true },
    { id: 'vestibule-living-opening', kind: 'interior-opening', centre: [-3.55, 1.4, 4.55], width: 1.3, height: 2.8, route: true },
    { id: 'living-sunroom-opening', kind: 'interior-opening', centre: [-1.5, 1.4, -4.75], width: 1.5, height: 2.8, route: true },
    { id: 'sunroom-stair-opening', kind: 'interior-opening', centre: [5.35, 1.4, -4.75], width: 1.5, height: 2.8, route: true },
    { id: 'rear-sunroom-door', kind: 'exterior-door', centre: [rearDoorX, 1.4, -7.2], width: 1.8, height: 2.8, route: true },
  ];
  const anchors: LocalAnchor[] = [
    { id: 'front-yard', position: [frontDoorX, 1.7, 8.8], level: 'ground' },
    { id: 'vestibule', position: [-3.65, 1.7, 5.35], level: 'ground' },
    { id: 'living-west', position: [-4.5, 1.7, 1.7], level: 'ground' },
    { id: 'living-rear', position: [-2.7, 1.7, -3.3], level: 'ground' },
    { id: 'living-east', position: [3.3, 1.7, 2.5], level: 'ground' },
    { id: 'sunroom-approach', position: [-1.5, 1.7, -3.8], level: 'ground' },
    { id: 'sunroom-opening', position: [-1.5, 1.7, -4.45], level: 'ground' },
    { id: 'sunroom', position: [-1.5, 1.7, -5.55], level: 'ground' },
    { id: 'rear-door-inside', position: [4.25, 1.7, -6.65], level: 'ground' },
    { id: 'rear-yard', position: [rearDoorX, 2.05, -9.5], level: 'ground' },
    { id: 'stair-approach', position: [5.35, 1.7, -5.2], level: 'ground' },
    { id: 'stair-foot', position: [5.35, 1.7, -4.25], level: 'ground' },
    { id: 'lower-flight-top', position: [5.35, 3.5, -0.35], level: 'upper' },
    { id: 'dogleg-turn', position: [4.15, 3.65, -0.25], level: 'upper' },
    { id: 'upper-flight-foot', position: [2.95, 3.65, -0.45], level: 'upper' },
    { id: 'upper-landing', position: [2.95, 5.25, -3.95], level: 'upper' },
    { id: 'upper-orchard', position: [-2.2, 5.25, -3.8], level: 'upper' },
  ];
  return { solids, openings, anchors, routes: {
    'living-loop-west': ['front-yard', 'vestibule', 'living-west', 'living-rear', 'sunroom-approach', 'sunroom-opening', 'sunroom', 'rear-door-inside', 'rear-yard'],
    'living-loop-east': ['vestibule', 'living-east', 'living-west', 'living-rear', 'sunroom-approach', 'sunroom-opening', 'sunroom'],
    'dogleg-stair-flow': ['sunroom', 'stair-approach', 'stair-foot', 'lower-flight-top', 'dogleg-turn', 'upper-flight-foot', 'upper-landing', 'upper-orchard'],
  } };
}

function worldPosition(position: [number, number, number], x: number, z: number, facing: 1 | -1): [number, number, number] {
  return [x + position[0], position[1], z + facing * position[2]];
}

/** Shared authored declaration used by rendering, collision and traversal tests. */
export function createHouseArchitecture(team: Team, x: number, z: number, facing: 1 | -1): HouseArchitecture {
  const local = team === 0 ? aquaPlan() : coralPlan();
  return {
    id: team === 0 ? 'aqua-irrigation-workshop' : 'coral-orchard-conservatory',
    label: team === 0 ? 'Aqua Irrigation Workshop' : 'Coral Orchard Conservatory',
    team,
    dimensions: { width: WIDTH, depth: DEPTH, wallThickness: WALL },
    solids: local.solids.map((entry) => ({ ...entry, position: worldPosition(entry.position, x, z, facing) })),
    openings: local.openings.map((entry) => ({ ...entry, centre: worldPosition(entry.centre, x, z, facing) })),
    anchors: local.anchors.map((entry) => ({ ...entry, position: worldPosition(entry.position, x, z, facing) })),
    routes: local.routes,
  };
}

/** Backwards-compatible collision accessor; team selects the genuinely distinct topology. */
export function houseCollisionSolids(x: number, z: number, facing: 1 | -1, team: Team = 0): HouseSolid[] {
  return createHouseArchitecture(team, x, z, facing).solids.filter((entry) => entry.collidable);
}

export function solidBounds(solid: HouseSolid): { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } {
  return {
    minX: solid.position[0] - solid.size[0] / 2,
    maxX: solid.position[0] + solid.size[0] / 2,
    minY: solid.position[1] - solid.size[1] / 2,
    maxY: solid.position[1] + solid.size[1] / 2,
    minZ: solid.position[2] - solid.size[2] / 2,
    maxZ: solid.position[2] + solid.size[2] / 2,
  };
}
