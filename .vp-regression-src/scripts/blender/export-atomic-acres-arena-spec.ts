// @ts-nocheck -- executed by vite-node as a deterministic Blender authoring tool.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ARENA_BOUNDS,
  CENTRAL_BUS,
  CORNER_HEDGE_LAYOUT,
  CORNER_HEDGE_SIZE,
  COVER_LAYOUT,
  FRONT_HEDGE_FIN_LAYOUT,
  FRONT_HEDGE_FIN_SIZE,
  FRONT_HEDGE_LAYOUT,
  FRONT_HEDGE_SIZE,
  GARAGE_LAYOUT,
  GARAGE_SIZE,
  HOUSE_LAYOUT,
  PARKED_VAN_LAYOUT,
  PARKED_VAN_SIZE,
  REAR_HEDGE_LAYOUT,
  REAR_HEDGE_SIZE,
  SIDE_HEDGE_LAYOUT,
  SIDE_HEDGE_SIZE,
  YARD_FENCE_HEIGHT,
  YARD_FENCE_LAYOUT,
} from '../../src/arena-layout';
import { createHouseArchitecture } from '../../src/house-navigation';

const output = resolve(process.argv[2] ?? 'source-assets/blender/atomic-acres-arena-spec.json');
const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));

const spec = {
  schema: 'atomic-acres-blender-arena-v1',
  authoredUnits: 'metres',
  gameAxes: 'x-right y-up z-forward',
  blenderAxes: 'x-right y-forward z-up',
  direction: {
    title: 'Original near-future military agricultural test suburb',
    constraints: [
      'No Activision or Call of Duty assets, branding, textures, logos, map geometry, signage, or UI.',
      'Use original silhouettes, materials, landmarks, faction colors, and lane dressing.',
      'Blender geometry is presentation-only; TypeScript remains authoritative for collision and gameplay.',
    ],
  },
  bounds: ARENA_BOUNDS,
  houses,
  garages: GARAGE_LAYOUT,
  garageSize: GARAGE_SIZE,
  cover: COVER_LAYOUT,
  streetHedges: {
    front: FRONT_HEDGE_LAYOUT.map((hedge) => ({
      position: [hedge.x, FRONT_HEDGE_SIZE.height / 2, hedge.z],
      size: [hedge.length, FRONT_HEDGE_SIZE.height, FRONT_HEDGE_SIZE.depth],
    })),
    fins: FRONT_HEDGE_FIN_LAYOUT.map((fin) => ({
      position: [fin.x, FRONT_HEDGE_FIN_SIZE[1] / 2, fin.z],
      size: [...FRONT_HEDGE_FIN_SIZE],
    })),
    rear: REAR_HEDGE_LAYOUT.map((rear) => ({
      position: [rear.x, REAR_HEDGE_SIZE[1] / 2, rear.z],
      size: [...REAR_HEDGE_SIZE],
    })),
    corners: CORNER_HEDGE_LAYOUT.map((corner) => ({
      position: [corner.x, CORNER_HEDGE_SIZE[1] / 2, corner.z],
      size: [...CORNER_HEDGE_SIZE],
    })),
    sideVerges: SIDE_HEDGE_LAYOUT.map((side) => ({
      position: [side.x, SIDE_HEDGE_SIZE[1] / 2, side.z],
      size: [...SIDE_HEDGE_SIZE],
    })),
  },
  parkedVans: PARKED_VAN_LAYOUT.map((van) => ({
    id: van.id,
    position: [van.x, PARKED_VAN_SIZE[1] / 2, van.z],
    size: [...PARKED_VAN_SIZE],
  })),
  roadway: {
    ground: { position: [0, -0.09, 0], size: [70, 0.18, 68] },
    road: { position: [0, 0.015, 0], size: [64, 0.03, 10] },
    curbs: [-5.6, 5.6].map((z) => ({ position: [0, 0.12, z], size: [64, 0.24, 1.2] })),
    sidewalks: [-7.5, 7.5].map((z) => ({ position: [0, 0.07, z], size: [64, 0.14, 2.6] })),
    // Centre-line dashes run along the street; the two crosswalk bands sit
    // clear of them so nothing stacks a few millimetres under the white bars.
    laneMarkers: [-28, -20, -12, 12, 20, 28]
      .map((x) => ({ position: [x, 0.055, 0], size: [3.6, 0.03, 0.18] })),
    crosswalks: [-16, 16].flatMap((x) => [-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map((z) => ({
      position: [x, 0.062, z], size: [3.2, 0.025, 1.4],
    }))),
  },
  // One bus, parked broadside in the middle of the street. It is the map's
  // single central hard-cover anchor and the first contested object.
  vehicles: [
    { id: 'armored-transit', position: [CENTRAL_BUS.x, 0, CENTRAL_BUS.z], facing: 1, length: CENTRAL_BUS.assetLength },
  ],
  yardFences: YARD_FENCE_LAYOUT.map(([x, z, width, depth]) => ({
    position: [x, YARD_FENCE_HEIGHT / 2, z], size: [width, YARD_FENCE_HEIGHT, depth],
  })),
  routeStructures: [
    { id: 'west-hydroponics', position: [-26, 0, 21] },
    { id: 'east-service-channel', position: [25.5, 0, 9] },
    { id: 'east-solar-canopy', position: [26.75, 0, -19.5] },
    { id: 'atomic-beacon', position: [27, 0, -20] },
  ],
  boundaries: [
    { id: 'west', position: [-31.3, 1.5, 0], size: [0.6, 3, 61.6] },
    { id: 'east', position: [31.3, 1.5, 0], size: [0.6, 3, 61.6] },
    { id: 'north', position: [0, 1.5, -30.3], size: [63, 3, 0.6] },
    { id: 'south', position: [0, 1.5, 30.3], size: [63, 3, 0.6] },
  ],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, houses: houses.length, houseSolids: houses.reduce((sum, house) => sum + house.solids.length, 0) }));
