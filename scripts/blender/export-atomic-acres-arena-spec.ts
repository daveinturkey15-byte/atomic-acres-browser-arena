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
  STREET_HALF_WIDTH,
  YARD_FENCE_HEIGHT,
  YARD_FENCE_LAYOUT,
} from '../../src/arena-layout';
import { createHouseArchitecture } from '../../src/house-navigation';
// Anchors live with the art authority in src/map.ts, not with the layout constants.
import { AUTHORED_LARGE_COVER_ANCHORS } from '../../src/map';

const output = resolve(process.argv[2] ?? 'source-assets/blender/atomic-acres-arena-spec.json');
const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));

// Pass 81 / HF-383c. The carriageway, kerbs, pavements and boundary fences used
// to be flat literals here, frozen at the pre-HF-383 62 x 60 m arena with a 10 m
// road. That made the exporter a dead end: ARENA_BOUNDS and STREET_HALF_WIDTH
// could move (and did - 62x60 -> 62x63, half width 5 -> 6.5) while re-running
// the exporter still emitted the old fence line and the old road, so the Quality
// profile's baked GLB drew an arena 3 m shallower and 3 m narrower-roaded than
// the one the player collides with. Everything below is now derived. Each
// formula was checked against the pre-HF-383 checked-in spec: at
// STREET_HALF_WIDTH = 5 and 62 x 60 m bounds they reproduce 5.6 / 7.5 / 10 m
// road / +/-30.3 / 61.6 exactly, so these are the authored relationships
// recovered, not new ones invented.
const ARENA_WIDTH = ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX; // along the street (X)
const ARENA_DEPTH = ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ; // across the street (Z)
const ARENA_CENTRE_X = (ARENA_BOUNDS.minX + ARENA_BOUNDS.maxX) / 2;
const ARENA_CENTRE_Z = (ARENA_BOUNDS.minZ + ARENA_BOUNDS.maxZ) / 2;

/** Asphalt overruns the end fences by 1 m so no seam shows at either mouth. */
const STREET_LENGTH = ARENA_WIDTH + 2;
/** Authored kerb section: fixed depth, sitting immediately outside the asphalt. */
const CURB_DEPTH = 1.2;
const CURB_Z = STREET_HALF_WIDTH + CURB_DEPTH / 2;
/**
 * Outer edge of the walkable concrete band. This is the classifier boundary in
 * classifyFootstepSurface (src/combat-feedback.ts:79): |z| <= STREET_HALF_WIDTH
 * reports asphalt, |z| <= 8.8 reports concrete, beyond that soil. The kerb and
 * pavement together have to tile exactly that band or the art disagrees with the
 * footstep audio - which is what HF-383c's widened road caused, leaving 1.5 m
 * strips each side that sounded like asphalt while the GLB drew kerb and grass.
 * src/blender-arena-surface-binding.test.ts pins the agreement in both directions.
 */
const PAVEMENT_OUTER_Z = 8.8;
/** Derived metres are rounded to micrometres so the checked-in spec stays free
 * of binary-float tails like 1.1000000000000005 and diffs stay readable. */
const metres = (value: number) => Number(value.toFixed(6));
const SIDEWALK_DEPTH = metres(PAVEMENT_OUTER_Z - (STREET_HALF_WIDTH + CURB_DEPTH));
const SIDEWALK_Z = metres(PAVEMENT_OUTER_Z - SIDEWALK_DEPTH / 2);

/** Boundary fence section, mirroring the procedural runs at src/map.ts:817-820. */
const BOUNDARY_THICKNESS = 0.6;
const BOUNDARY_HEIGHT = 3;
/** Each run overshoots its bound line so the four corners close with no gap. */
const BOUNDARY_OVERHANG = 0.5;
const BOUNDARY_SIDE_X = ARENA_WIDTH / 2 + BOUNDARY_THICKNESS / 2;
const BOUNDARY_END_Z = ARENA_DEPTH / 2 + BOUNDARY_THICKNESS / 2;
/** Side runs additionally cover the end runs' thickness, so the corners lap. */
const BOUNDARY_SIDE_LENGTH = ARENA_DEPTH + BOUNDARY_THICKNESS + BOUNDARY_OVERHANG * 2;
const BOUNDARY_END_LENGTH = ARENA_WIDTH + BOUNDARY_OVERHANG * 2;

if (SIDEWALK_DEPTH <= 0) {
  throw new Error(
    `STREET_HALF_WIDTH ${STREET_HALF_WIDTH} plus a ${CURB_DEPTH} m kerb leaves no pavement `
    + `inside the ${PAVEMENT_OUTER_Z} m concrete band; widen the band or narrow the road.`,
  );
}

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
  // Which lane anchors carry authored art, keyed by COORDINATE not by index.
  // The generator used to branch on `index == 4..7` and label the marker with
  // `[index - 4]`. HF-383b cut COVER_LAYOUT to six entries, so indices 6 and 7
  // stopped existing and the service skip and generator trailer were silently
  // never BUILT - not merely unlabelled. Publishing the anchors means a future
  // layout edit either keeps the anchor and the art follows it, or drops it and
  // src/blender-environment.test.ts fails loudly.
  authoredLargeCover: AUTHORED_LARGE_COVER_ANCHORS.map(([x, z, id]) => [x, z, id]),
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
    road: {
      position: [ARENA_CENTRE_X, 0.015, ARENA_CENTRE_Z],
      size: [STREET_LENGTH, 0.03, STREET_HALF_WIDTH * 2],
    },
    curbs: [-CURB_Z, CURB_Z].map((z) => ({
      position: [ARENA_CENTRE_X, 0.12, ARENA_CENTRE_Z + z], size: [STREET_LENGTH, 0.24, CURB_DEPTH],
    })),
    sidewalks: [-SIDEWALK_Z, SIDEWALK_Z].map((z) => ({
      position: [ARENA_CENTRE_X, 0.07, ARENA_CENTRE_Z + z], size: [STREET_LENGTH, 0.14, SIDEWALK_DEPTH],
    })),
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
    {
      id: 'west',
      position: [ARENA_CENTRE_X - BOUNDARY_SIDE_X, BOUNDARY_HEIGHT / 2, ARENA_CENTRE_Z],
      size: [BOUNDARY_THICKNESS, BOUNDARY_HEIGHT, BOUNDARY_SIDE_LENGTH],
    },
    {
      id: 'east',
      position: [ARENA_CENTRE_X + BOUNDARY_SIDE_X, BOUNDARY_HEIGHT / 2, ARENA_CENTRE_Z],
      size: [BOUNDARY_THICKNESS, BOUNDARY_HEIGHT, BOUNDARY_SIDE_LENGTH],
    },
    {
      id: 'north',
      position: [ARENA_CENTRE_X, BOUNDARY_HEIGHT / 2, ARENA_CENTRE_Z - BOUNDARY_END_Z],
      size: [BOUNDARY_END_LENGTH, BOUNDARY_HEIGHT, BOUNDARY_THICKNESS],
    },
    {
      id: 'south',
      position: [ARENA_CENTRE_X, BOUNDARY_HEIGHT / 2, ARENA_CENTRE_Z + BOUNDARY_END_Z],
      size: [BOUNDARY_END_LENGTH, BOUNDARY_HEIGHT, BOUNDARY_THICKNESS],
    },
  ],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, houses: houses.length, houseSolids: houses.reduce((sum, house) => sum + house.solids.length, 0) }));
