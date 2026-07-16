// @ts-nocheck -- executed by vite-node as a deterministic Blender authoring tool.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ARENA_BOUNDS, COVER_LAYOUT, GARAGE_LAYOUT, HOUSE_LAYOUT } from '../../src/arena-layout';
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
  cover: COVER_LAYOUT,
  roadway: {
    ground: { position: [0, -0.09, 0], size: [86, 0.18, 98] },
    road: { position: [0, 0.015, 0], size: [19, 0.03, 88] },
    curbs: [-10.25, 10.25].map((x) => ({ position: [x, 0.12, 0], size: [1.4, 0.24, 88] })),
    sidewalks: [-12.6, 12.6].map((x) => ({ position: [x, 0.07, 0], size: [3.2, 0.14, 88] })),
    laneMarkers: Array.from({ length: 10 }, (_, index) => ({ position: [0, 0.055, -36 + index * 8], size: [0.18, 0.03, 3.6] })),
    crosswalks: [-18, 18].flatMap((z) => Array.from({ length: 7 }, (_, index) => ({
      position: [-7.5 + index * 2.5, 0.062, z], size: [1.4, 0.025, 3.2],
    }))),
  },
  vehicles: [
    { id: 'armored-transit', position: [-3.8, 0, 7], facing: 1 },
    { id: 'agritech-carrier', position: [4.2, 0, -8], facing: -1 },
  ],
  routeStructures: [
    { id: 'west-hydroponics', position: [-25.5, 0, 16] },
    { id: 'east-service-channel', position: [25.5, 0, 9] },
    { id: 'east-solar-canopy', position: [26, 0, -16] },
    { id: 'atomic-beacon', position: [27, 0, -1.5] },
  ],
  boundaries: [
    { id: 'west', position: [-34.3, 1.5, 0], size: [0.6, 3, 88] },
    { id: 'east', position: [34.3, 1.5, 0], size: [0.6, 3, 88] },
    { id: 'north', position: [0, 1.5, -43.3], size: [69, 3, 0.6] },
    { id: 'south', position: [0, 1.5, 43.3], size: [69, 3, 0.6] },
  ],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, houses: houses.length, houseSolids: houses.reduce((sum, house) => sum + house.solids.length, 0) }));
