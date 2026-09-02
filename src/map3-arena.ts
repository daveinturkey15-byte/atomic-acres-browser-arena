/**
 * MAP3: Map 3 - the Corridor Showcase, as a playable EXPLORE arena (PREVIEW).
 *
 * WHAT THIS IS.
 *
 * The owner opened PASS 84 and asked (2026-09-02 16:25): "wtf happened to map
 * 3? it was full of rich code based asset tests and now its just a square map
 * of stone?" It was: the arena registered under `map3` was an authored stone
 * gallery, and the real showcase - `src/map3/**`, animated corridors of TSL
 * around a hub - had never been imported into it. This file is that import.
 * The corridors ARE the arena now. Half an hour later he settled what kind of
 * arena it is: "Just keep the showcase in and it's not about combat, it's a
 * mode you can explore." So Map 3 is solo, no bots, no field support, no
 * overdrive; the content is the place, and the job of the code here is to make
 * the place STAND UP under a player.
 *
 * THE THREE THINGS THAT KEPT THE SHOWCASE OUT, AND WHERE EACH IS SOLVED.
 *
 *   1. NO COLLIDERS. The corridor modules publish geometry and an `update()`
 *      and nothing solid, because the showcase page flies a camera. Solved in
 *      `src/map3/corridor-solids.ts`: each corridor now declares its solids -
 *      trunks, plinths, pier pylons, colonnade columns, masonry clusters - in
 *      its own local frame, at the point it places them, and this file turns
 *      them into movement colliders and shot surfaces.
 *   2. NOTHING TICKS AN ARENA. Solved in `src/arena-frame-animation.ts`: the
 *      `ArenaMap.update` hook, driven once a frame for the ACTIVE arena only.
 *      Without it every corridor arrives frozen - still water, still rain,
 *      static god rays.
 *   3. LOAD TIME. Solved in `src/arena-factory-registry.ts`: `map3` is the one
 *      LAZY arena, so a player who picked Nuke Town never downloads any of
 *      this.
 *
 * WHY THE LANES ARE AXIS-ALIGNED AND THE SHOWCASE'S SPOKES ARE NOT.
 *
 * The showcase puts its corridors on 45-degree spokes. That cannot be
 * collided: `box()` records a solid as extents-plus-yaw (an ORIENTED box, what
 * the solver and Rapier consume) while the collider/visual parity audit
 * compares a collider's rectangle against each mesh's world AABB, and those
 * two agree exactly at yaw 0 and diverge badly anywhere else - a 0.5 x 4.6 m
 * wall at 45 degrees measures 0.11 coverage against its own mesh and reads as
 * an invisible collider. Making the audit orientation-aware would move the
 * accepted rows of arenas this lane does not own. So the lanes run on the four
 * world axes, and every rotation here is a MULTIPLE OF 90 DEGREES, which maps
 * an axis-aligned box to an axis-aligned box exactly.
 *
 * WHAT IS NOT HERE. The physics playground corridor (`corridor-physics.ts`)
 * stays on `/map3.html`. It owns a Rapier world and `createPhysicsCorridor()`
 * is async because `RAPIER.init()` streams a wasm module; arena construction
 * is SYNCHRONOUS on purpose, inside the fenced transaction between the WebGPU
 * fence and the authority commit. Making it async there, or splitting Rapier
 * out of that module, would force an async preparation step into the parity
 * audit's factory table, the spawn-layout builder map and the eye-clearance
 * sweep - three call sites this lane does not own. The exact patch is in the
 * lane report; until it lands, the bay is one page click away and the arena
 * does not pretend to contain it.
 */
import * as THREE from 'three';
import {
  type Builder,
  box,
  emptyTelemetry,
  spawnRecord,
  standard,
} from './additional-maps';
import { createBallisticSurface, type BallisticMaterialId } from './ballistics';
import type { ArenaMap } from './map';
import type { ArenaFrameContext } from './arena-frame-animation';
import { createGrammarCorridor, createMathsCorridor, createNatureCorridor, type Corridor } from './map3/corridors';
import { createVolumeCorridor, createWaterCorridor, createWeatherCorridor } from './map3/corridors-extra';
import { createColosseumCorridor } from './map3/corridor-colosseum';
import type { CorridorSolid } from './map3/corridor-solids';

/**
 * Playfield extent. The longest lane is the seasons corridor: 34 m of start
 * plus 56 m of corridor is 90, and its far trees stand a little past that.
 * Everything beyond - the colosseum's bowl at 140 m and its skyline at 262 m -
 * is deliberately OUTSIDE the bounds: it is a vista, not a place, and the
 * parity audit's own backdrop rule is what says so.
 */
export const MAP3_BOUNDS = Object.freeze({ minX: -96, maxX: 96, minZ: -96, maxZ: 96 });

/** Half-extent of the paved courtyard at the centre of the hub. */
export const MAP3_COURTYARD_HALF = 28;

/**
 * Distance from the origin at which a lane's corridor mouth sits.
 *
 * 34 m, and the number is forced rather than chosen. A lane on one edge and a
 * lane on the NEXT edge are disjoint only while the second one's lateral
 * offset plus its half-width stays inside this start; the shoreline is 41 m
 * across and the forest 30, so at the courtyard's own 28 m their flanks
 * reached into the neighbouring edge's ground (measured: the shoreline
 * overlapped the seasons corridor by 21 x 8 m at a 26 m start).
 * `src/map3-lane-layout.test.ts` fails if any two lanes' footprints intersect
 * at all, so this cannot silently regress.
 */
export const MAP3_LANE_START = 34;

/** rotY for each edge: -z, +x, +z, -x. Quarter turns only; see the header. */
const EDGE_ROTATION = Object.freeze([0, -Math.PI / 2, Math.PI, Math.PI / 2]);

export type Map3LaneSpec = Readonly<{
  /** Stable slug. Names the pivot group and prefixes every collider it owns. */
  id: string;
  label: string;
  /** 0 = north (-z), 1 = east (+x), 2 = south (+z), 3 = west (-x). */
  edge: 0 | 1 | 2 | 3;
  /** Offset of the lane's centre line from its edge's midpoint, in metres. */
  lateral: number;
  build: () => Corridor;
}>;

/**
 * The seven showcase corridors, placed.
 *
 * Wide corridors get room (the shoreline is 41 m across, the forest 30);
 * narrow ones sit at +/-13 m, which is more than the widest of them needs. The
 * colosseum shares the north edge with the shoreline because almost all of it
 * - the bowl, the arcade, the skyline - is beyond the bounds, and only its
 * overlook terrace is in the playfield at all.
 */
export const MAP3_LANES: readonly Map3LaneSpec[] = Object.freeze([
  { id: 'shoreline', label: 'Shoreline', edge: 0, lateral: -26, build: () => createWaterCorridor() },
  { id: 'colosseum', label: 'Colosseum', edge: 0, lateral: 26, build: () => createColosseumCorridor() },
  { id: 'raymarch', label: 'Raymarched SDF', edge: 1, lateral: -13, build: () => createMathsCorridor() },
  { id: 'grammar', label: 'Shape grammar', edge: 1, lateral: 13, build: () => createGrammarCorridor(11) },
  { id: 'vegetation', label: 'Vegetation', edge: 2, lateral: 0, build: () => createNatureCorridor(7) },
  { id: 'godrays', label: 'God rays', edge: 3, lateral: -13, build: () => createVolumeCorridor() },
  { id: 'seasons', label: 'Seasons', edge: 3, lateral: 14, build: () => createWeatherCorridor(21) },
]);

/** Corridor-local -> world for a lane. Quarter turns, so this is exact. */
export function laneToWorld(
  lane: Map3LaneSpec,
  x: number,
  z: number,
): { x: number; z: number } {
  const px = x + lane.lateral;
  const pz = z - MAP3_LANE_START;
  switch (lane.edge) {
    case 0: return { x: px, z: pz };
    case 1: return { x: -pz, z: px };
    case 2: return { x: -px, z: -pz };
    default: return { x: pz, z: -px };
  }
}

/** True when a lane's quarter turn swaps the X and Z extents of a box. */
function laneSwapsExtents(lane: Map3LaneSpec): boolean {
  return lane.edge === 1 || lane.edge === 3;
}

function makeBuilder(scene: THREE.Scene, name: string): Builder {
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  return {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    ballisticSurfaceSequence: 0,
  };
}

const SOLID_BALLISTICS: Readonly<Record<CorridorSolid['material'], BallisticMaterialId>> = Object.freeze({
  wood: 'wood',
  stone: 'brick',
  glass: 'glass',
  metal: 'structural-metal',
});

/**
 * Register one corridor solid as movement authority AND shot authority.
 *
 * There is no mesh here on purpose. The visible mass is the corridor's own
 * geometry - a merged 60 m batch of trunks, a merged colonnade - and adding a
 * second box beside it would be authoring a wall next to a tree instead of
 * colliding the tree. The parity audit's Direction A asks exactly the right
 * question of this shape: is there a visible mesh that covers this collider
 * and rises through it? For a trunk collider inside its own batch the answer
 * is yes, at coverage 1.0.
 */
function registerSolid(builder: Builder, lane: Map3LaneSpec, solid: CorridorSolid): void {
  const centre = laneToWorld(lane, solid.x, solid.z);
  const swap = laneSwapsExtents(lane);
  const halfX = (swap ? solid.sz : solid.sx) / 2;
  const halfZ = (swap ? solid.sx : solid.sz) / 2;
  const name = `map3-${lane.id}-${solid.name}`;
  const bounds = {
    minX: centre.x - halfX,
    maxX: centre.x + halfX,
    minZ: centre.z - halfZ,
    maxZ: centre.z + halfZ,
    minY: solid.y - solid.sy / 2,
    maxY: solid.y + solid.sy / 2,
  };
  builder.colliders.push(bounds);
  builder.physicsColliders.push(bounds);
  builder.shotSurfaces.push(createBallisticSurface(
    `${builder.root.name}:${builder.ballisticSurfaceSequence}:${name}`,
    name,
    bounds,
    { material: SOLID_BALLISTICS[solid.material] },
  ));
  builder.ballisticSurfaceSequence += 1;
}

type Map3Materials = Readonly<{
  paving: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  marker: THREE.MeshStandardMaterial;
}>;

/**
 * The hub's ring of waymarkers, and the spawn ring inside it.
 *
 * SIXTEEN stones on a 26 m radius, on the half-steps of a 22.5-degree rose, so
 * every one of the ten authored spawn points below stands exactly midway
 * between two of them - 5.10 m, inside the spawn gate's 6 m hard-cover reach.
 * That is why the ring exists rather than being decoration: an explore mode
 * still spawns a body, the spawn-quality gate still asks for cover in reach,
 * and a bare 56 m plaza has none anywhere. It is also the showcase's own idea:
 * `map3.html` puts a signed marker at every corridor mouth, and this is that
 * rose brought inside the hub where the corridors all read from one place.
 *
 * The gaps are 10.1 m, so the ring is a threshold you walk through, never a
 * wall you walk around.
 */
const HUB_MARKER_RADIUS = 26;
const HUB_MARKER_COUNT = 16;

function hubWaymarkers(builder: Builder, material: THREE.Material): void {
  for (let i = 0; i < HUB_MARKER_COUNT; i += 1) {
    const angle = ((i + 0.5) / HUB_MARKER_COUNT) * Math.PI * 2;
    // Snapped to the millimetre: a marker at an irrational offset would give
    // the collider a footprint that is not quite the mesh's, for no gain.
    const x = Math.round(Math.sin(angle) * HUB_MARKER_RADIUS * 1000) / 1000;
    const z = Math.round(-Math.cos(angle) * HUB_MARKER_RADIUS * 1000) / 1000;
    box(builder, `map3-hub-waymarker-${i}`, [x, 0.95, z], [0.9, 1.9, 0.9], material);
  }
}

/**
 * The authored spawn ring: five points per team on a 26 m radius, on the north
 * and south quadrants.
 *
 * Explore mode (owner 16:55) fields no bots and no second player, so the two
 * tables exist only because `spawnRecord` is typed for them. They are still
 * authored to the gate's rules rather than dropped in a heap, because a spawn
 * table nobody checks is how Raid ended up spawning the owner outside the map:
 * 36.8 m of spread on a 192 m axis (floor 18%), 9.9 m minimum pair separation
 * (floor 3), 36.8 m between the nearest cross-team pair (floor 30), and a
 * waymarker 5.1 m from every point.
 */
const SPAWN_RING_RADIUS = 26;
const SPAWN_ARC_DEGREES = [-45, -22.5, 0, 22.5, 45] as const;

function spawnRing(sign: 1 | -1): [number, number][] {
  return SPAWN_ARC_DEGREES.map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    const x = Math.round(Math.sin(angle) * SPAWN_RING_RADIUS * 100) / 100;
    const z = Math.round(-Math.cos(angle) * SPAWN_RING_RADIUS * 100) / 100;
    return [x * sign, z * sign] as [number, number];
  });
}

function map3Materials(): Map3Materials {
  return Object.freeze({
    // Value taken from the showcase's own re-grade: its hub paving moved from
    // 0.31 to 0.20 linear on 2026-09-02 after 0.31 measured as blown white
    // concrete under this sun.
    paving: standard(0x565853, 0.94, 0.02),
    kerb: standard(0x3e4040, 0.9, 0.02),
    ground: standard(0x4a5140, 1, 0),
    // A shade lighter than the paving so the ring reads against it at range.
    marker: standard(0x6c6e68, 0.88, 0.02),
  });
}

/** A placed lane, kept so the frame hook can drive it. */
type PlacedLane = {
  readonly spec: Map3LaneSpec;
  readonly corridor: Corridor;
  readonly group: THREE.Group;
  readonly inverseYaw: THREE.Quaternion;
};

export function buildMap3(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Map3 arena');
  const materials = map3Materials();

  // Ground runs past the playfield so the horizon is continuous scrub rather
  // than a slab floating in a void. Its top is y = 0, which is the plane every
  // corridor was authored against (their own floors sit 3 cm above it).
  box(builder, 'map3-ground-terrain', [0, -0.7, 0], [420, 1.4, 420], materials.ground, { cast: false });

  const half = MAP3_COURTYARD_HALF;
  box(builder, 'map3-hub-paving', [0, -0.18, 0], [half * 2, 0.36, half * 2],
    materials.paving, { cast: false });
  // A kerb on each edge, so the hub reads as built ground rather than a
  // rectangle of a different colour painted on the scrub.
  for (const [ex, ez] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const alongX = ex === 0;
    box(builder, `map3-hub-kerb-${ex}-${ez}`,
      [ex * (half - 0.25), 0.1, ez * (half - 0.25)],
      alongX ? [half * 2, 0.4, 0.5] : [0.5, 0.4, half * 2],
      materials.kerb, { cast: false });
  }

  // The central plinth: the one piece of high ground every lane mouth can see,
  // reached by four 0.35 m steps (under the 0.45 m autostep, so no jump).
  box(builder, 'map3-hub-plinth', [0, 0.35, 0], [7.2, 0.7, 7.2], materials.paving);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    box(builder, `map3-hub-plinth-step-${sx}-${sz}`,
      [sx * 4.4, 0.175, sz * 4.4], [sz === 0 ? 1.6 : 5.2, 0.35, sz === 0 ? 5.2 : 1.6],
      materials.paving);
  }

  hubWaymarkers(builder, materials.marker);

  const placed: PlacedLane[] = [];
  for (const lane of MAP3_LANES) {
    const corridor = lane.build();
    const group = new THREE.Group();
    group.name = `map3-lane-${lane.id}`;
    // MAP3 (HF-409): keep the static batcher OUT of the corridors.
    //
    // `batchSelectedArenaPresentation` -> `batchStaticMeshes` merges an arena
    // root's static meshes into one draw call per material, and `dynamic` is
    // that batcher's own documented escape hatch (art-kit.ts, checked on the
    // mesh and every ancestor). A corridor is exactly what it must not touch:
    // its geometry carries custom instanced attributes (`aCenter` on the rain
    // splash rings, `aSpan`/`aSide`/`aDead` on every leaf) that no other mesh
    // has, and merging across them is not a slow path, it is an ERROR - the
    // headless boot smoke caught it as
    // "mergeGeometries() failed with geometry at index 1 ... make sure aSpan
    // exists among all geometries, or in none of them", with the corridors
    // then missing from the frame. Even where the merge would succeed it would
    // be wrong: these meshes move, and a batch is baked once.
    group.userData.dynamic = true;
    group.rotation.y = EDGE_ROTATION[lane.edge]!;
    corridor.group.position.set(lane.lateral, 0, -MAP3_LANE_START);
    group.add(corridor.group);
    builder.root.add(group);
    for (const solid of corridor.solids ?? []) registerSolid(builder, lane, solid);
    placed.push({
      spec: lane,
      corridor,
      group,
      inverseYaw: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -EDGE_ROTATION[lane.edge]!, 0)),
    });
  }

  // Scratch vectors for the frame hook. Allocating these per frame, seven times
  // a frame, is exactly the kind of steady garbage that shows up weeks later as
  // a periodic hitch and takes a day to find.
  const localPosition = new THREE.Vector3();
  const localVelocity = new THREE.Vector3();

  // Explore mode (owner 2026-09-02 16:55): no bots, no field support, no
  // overdrive. You start on the hub's spawn ring with the lane mouths in front
  // of you. See `spawnRing` for the measured numbers.
  const team0: [number, number][] = spawnRing(1);
  const team1: [number, number][] = spawnRing(-1);

  return {
    id: 'map3',
    label: 'Map 3',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(team0, team1),
    /**
     * MAP3 (HF-409): the reason the corridors are not frozen.
     *
     * Every corridor drives its own time uniforms, its foliage springs and its
     * vehicle from this call. The player's pose goes in in CORRIDOR-LOCAL
     * space, because that is the frame the corridors were authored in and the
     * frame their interaction maths (a shrub's push radius, the rover's
     * avoidance) is written in.
     */
    update(elapsedSeconds: number, dtSeconds: number, context: ArenaFrameContext) {
      for (const lane of placed) {
        localPosition.copy(context.cameraPosition);
        lane.corridor.group.worldToLocal(localPosition);
        localVelocity.copy(context.playerVelocity).applyQuaternion(lane.inverseYaw);
        lane.corridor.update(elapsedSeconds, dtSeconds, localPosition, localVelocity);
      }
    },
    patrolPoints: MAP3_LANES.flatMap((lane) => {
      const mouth = laneToWorld(lane, 0, -2);
      const deep = laneToWorld(lane, 0, -24);
      return [new THREE.Vector3(mouth.x, 0, mouth.z), new THREE.Vector3(deep.x, 0, deep.z)];
    }),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...MAP3_BOUNDS },
    // The scrub is 35 cm below the hub in the showcase's own section; the
    // arena's ground slab tops out at y = 0 instead, so every corridor floor
    // (authored at y = 0.03) sits 3 cm proud of walkable ground exactly as it
    // does on the page. The fail-safe is a hair below that.
    physicsSafetyFloorY: -0.05,
    houseTelemetry: emptyTelemetry(),
  };
}
