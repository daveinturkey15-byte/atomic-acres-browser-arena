/**
 * Test1 & Test2 (owner 2026-08-30) — see docs/TEST1_MAP_BRIEF.md and
 * docs/TEST2_MAP_BRIEF.md. Original procedural art throughout; the briefs'
 * archetypes inform layout beats only.
 *
 * Test1: sun-bleached range training ground — sandbag firing lanes west,
 * two-storey range tower centre (stair-mountable deck), container yard east,
 * team sheds at the north/south ends. ~52x38 m, 180° rotational symmetry.
 *
 * Test2: hillside mansion — pool lane north, sunken court centre, garden
 * terrace south, motor-court spawns at the east/west ends. ~64x48 m, 180°
 * symmetry. Domination zone anchors exported for the mode wiring.
 */
import * as THREE from 'three';
import {
  batchPresentationOnlyBoxes,
  box,
  emptyTelemetry,
  spawnRecord,
  standard,
  type Builder,
} from './additional-maps';
import type { ArenaMap } from './map';

export const TEST1_BOUNDS = Object.freeze({ minX: -26, maxX: 26, minZ: -19, maxZ: 19 });
export const TEST2_BOUNDS = Object.freeze({ minX: -32, maxX: 32, minZ: -24, maxZ: 24 });

/** Domination anchors for Test2 (A pool deck, B court, C garden terrace). */
export const TEST2_DOMINATION_ZONES = Object.freeze([
  Object.freeze({ id: 'A' as const, centre: Object.freeze([-20, 0, -12] as const) }),
  Object.freeze({ id: 'B' as const, centre: Object.freeze([0, 0, 0] as const) }),
  Object.freeze({ id: 'C' as const, centre: Object.freeze([20, 0, 12] as const) }),
]);

function makeBuilder(scene: THREE.Scene, name: string): Builder {
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  return { root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0 };
}

function ground(builder: Builder, name: string, width: number, depth: number, material: THREE.Material): void {
  // Ground is a solid slab collider (its top face at y=0) so movement,
  // ballistics and the viewmodel ground clamp all agree with the visual.
  box(builder, name, [0, -0.5, 0], [width, 1, depth], material, { cast: false });
}

function perimeter(builder: Builder, name: string, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, height: number, material: THREE.Material): void {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  box(builder, `${name} north`, [0, height / 2, bounds.minZ - 0.4], [width + 2, height, 0.8], material);
  box(builder, `${name} south`, [0, height / 2, bounds.maxZ + 0.4], [width + 2, height, 0.8], material);
  box(builder, `${name} west`, [bounds.minX - 0.4, height / 2, 0], [0.8, height, depth + 2], material);
  box(builder, `${name} east`, [bounds.maxX + 0.4, height / 2, 0], [0.8, height, depth + 2], material);
}

// ---------------------------------------------------------------------------
// Test1 — range training ground
// ---------------------------------------------------------------------------

export function buildTest1(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Test1 arena');
  const hardpan = standard(0xb59a6e, 0.98, 0.02);
  const plywood = standard(0xc4a069, 0.92, 0.02);
  const plywoodDark = standard(0x8a6e44, 0.94, 0.02);
  const sandbag = standard(0x9a8a5e, 0.99, 0.0);
  const containerRed = standard(0x8a3c2c, 0.72, 0.32);
  const containerBlue = standard(0x3c5a74, 0.72, 0.32);
  const containerGreen = standard(0x53644a, 0.74, 0.3);
  const cinder = standard(0x9c9488, 0.95, 0.04);
  const steel = standard(0x5c666c, 0.6, 0.6);
  const canvas = standard(0x6f7a52, 0.96, 0.0);

  ground(builder, 'test1 hardpan', 54, 40, hardpan);
  perimeter(builder, 'test1 fence', TEST1_BOUNDS, 2.6, plywoodDark);

  // Centre: two-storey range tower. Ground room with east/west door mouths,
  // walkable deck slab at 2.6 m, waist parapet, south stair (7 x 0.38 rises).
  const towerWall = cinder;
  box(builder, 'test1 tower wall north', [0, 1.3, -3], [6, 2.6, 0.35], towerWall);
  box(builder, 'test1 tower wall south', [0, 1.3, 3], [6, 2.6, 0.35], towerWall);
  box(builder, 'test1 tower wall west lower', [-3, 0.5, 0], [0.35, 1, 6], towerWall);
  box(builder, 'test1 tower wall west header', [-3, 2.3, 0], [0.35, 0.7, 6], towerWall);
  box(builder, 'test1 tower wall east lower', [3, 0.5, 0], [0.35, 1, 6], towerWall);
  box(builder, 'test1 tower wall east header', [3, 2.3, 0], [0.35, 0.7, 6], towerWall);
  box(builder, 'test1 tower deck', [0, 2.66, 0], [6.7, 0.14, 6.7], steel);
  box(builder, 'test1 tower parapet north', [0, 3.2, -3.2], [6.7, 1, 0.25], towerWall);
  // South parapet leaves a stair doorway in the middle.
  box(builder, 'test1 tower parapet south west', [-2.35, 3.2, 3.2], [2, 1, 0.25], towerWall);
  box(builder, 'test1 tower parapet south east', [2.35, 3.2, 3.2], [2, 1, 0.25], towerWall);
  box(builder, 'test1 tower parapet west', [-3.2, 3.2, 0], [0.25, 1, 6.7], towerWall);
  box(builder, 'test1 tower parapet east', [3.2, 3.2, 0], [0.25, 1, 6.7], towerWall);
  for (let step = 0; step < 7; step += 1) {
    box(builder, `test1 tower stair ${step}`,
      [0, 0.19 + step * 0.38, 3.3 + (6 - step) * 0.55], [1.6, 0.38 + step * 0.76, 0.55], steel);
  }

  // West lane: the firing line. Sandbag half-walls, silhouette targets on
  // posts (presentation), and an open awning shack near each end.
  for (const [sandbagZ, index] of [[-8, 0], [0, 1], [8, 2]] as const) {
    box(builder, `test1 sandbag wall ${index}`, [-14, 0.625, sandbagZ], [4.4, 1.25, 0.9], sandbag);
  }
  for (const targetZ of [-10, -5, 0, 5, 10]) {
    box(builder, `test1 target post ${targetZ}`, [-23.5, 0.9, targetZ], [0.14, 1.8, 0.14], plywoodDark, { solid: false, shots: true });
    box(builder, `test1 target silhouette ${targetZ}`, [-23.5, 1.95, targetZ], [0.9, 1.1, 0.06], plywood, { solid: false, shots: true });
  }
  for (const shackSide of [-1, 1] as const) {
    const shackZ = shackSide * 13;
    box(builder, `test1 shack rear ${shackSide}`, [-14, 1.35, shackZ + shackSide * 1.9], [5, 2.7, 0.3], plywood);
    box(builder, `test1 shack side a ${shackSide}`, [-16.4, 1.35, shackZ], [0.3, 2.7, 4], plywood);
    box(builder, `test1 shack side b ${shackSide}`, [-11.6, 1.35, shackZ], [0.3, 2.7, 4], plywood);
    box(builder, `test1 shack roof ${shackSide}`, [-14, 2.85, shackZ], [5.6, 0.3, 5], canvas);
  }

  // East lane: the container yard weave.
  const containers: Array<[string, number, number, number, THREE.Material, number]> = [
    ['test1 container a', 12, -6, 0, containerRed, 1.3],
    ['test1 container b', 17, 3, Math.PI / 14, containerBlue, 1.3],
    ['test1 container c', 21, -3, 0, containerGreen, 1.3],
    ['test1 container d', 13, 9, -Math.PI / 18, containerGreen, 1.3],
    ['test1 container e', 19, -11, 0, containerBlue, 1.3],
    ['test1 container stack top', 21, -3, 0, containerRed, 3.9],
  ];
  for (const [name, x, z, yaw, material, centreY] of containers) {
    box(builder, name, [x, centreY, z], [6, 2.6, 2.6], material, yaw ? { rotation: [0, yaw, 0] } : {});
  }

  // Team sheds + berms at the north/south ends (two covered exits each).
  for (const end of [-1, 1] as const) {
    const shedZ = end * 15.5;
    box(builder, `test1 shed ${end < 0 ? 'north' : 'south'}`, [end * 4, 1.4, shedZ], [7, 2.8, 3], plywoodDark);
    box(builder, `test1 berm ${end < 0 ? 'north' : 'south'} a`, [end * -10, 0.8, shedZ - end * 1], [6, 1.6, 1.6], sandbag);
    box(builder, `test1 berm ${end < 0 ? 'north' : 'south'} b`, [end * 14, 0.8, shedZ], [5, 1.6, 1.6], sandbag);
  }

  // Yard drums & crates — scattered mid cover.
  box(builder, 'test1 crate west', [-6, 0.75, -9], [1.7, 1.5, 1.7], plywood);
  box(builder, 'test1 crate east', [6, 0.75, 9], [1.7, 1.5, 1.7], plywood);
  box(builder, 'test1 drum pair north', [7, 0.6, -8], [1.4, 1.2, 0.9], steel);
  box(builder, 'test1 drum pair south', [-7, 0.6, 8], [1.4, 1.2, 0.9], steel);

  batchPresentationOnlyBoxes(builder.root, 'test1-presentation');

  return {
    id: 'test1',
    label: 'Test1',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [[-16, -16], [-8, -16.5], [0, -13], [8, -16.5], [16, -16], [-3, -16.5]],
      [[16, 16], [8, 16.5], [0, 13], [-8, 16.5], [-16, 16], [3, 16.5]],
    ),
    patrolPoints: [
      [-14, -10], [-14, 0], [-14, 10], [0, 10], [14, 8], [14, 0], [14, -8], [0, -10], [-20, 0], [8, 3],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...TEST1_BOUNDS },
    houseTelemetry: emptyTelemetry(),
  };
}

// ---------------------------------------------------------------------------
// Test2 — hillside mansion
// ---------------------------------------------------------------------------

export function buildTest2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Test2 arena');
  const travertine = standard(0xd8cbb4, 0.9, 0.03);
  const stucco = standard(0xe8e0d0, 0.92, 0.02);
  const stone = standard(0xb0a692, 0.94, 0.03);
  const hedge = standard(0x3f5c34, 0.98, 0.0);
  const poolWater = new THREE.MeshStandardMaterial({
    color: 0x2e9cb0, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82,
  });
  const poolTile = standard(0x7fc4cf, 0.4, 0.05);
  const court = standard(0x87584a, 0.92, 0.02);
  const glass = new THREE.MeshStandardMaterial({
    color: 0xbfd8de, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4,
  });
  const timber = standard(0x7a5c3c, 0.88, 0.04);

  ground(builder, 'test2 terrace', 66, 50, travertine);
  perimeter(builder, 'test2 estate wall', TEST2_BOUNDS, 3, stucco);

  // North lane: pool deck. A shallow walkable basin (floor -0.55 with a solid
  // basin slab), raised coping lip, pool houses at each end.
  box(builder, 'test2 pool basin floor', [0, -0.85, -14], [14, 0.6, 8], poolTile);
  box(builder, 'test2 pool water sheet', [0, -0.62, -14], [13.6, 0.06, 7.6], poolWater, { solid: false, shots: false, cast: false });
  box(builder, 'test2 pool coping north', [0, 0.15, -18.2], [15, 0.3, 0.6], stone);
  box(builder, 'test2 pool coping south', [0, 0.15, -9.8], [15, 0.3, 0.6], stone);
  box(builder, 'test2 pool coping west', [-7.2, 0.15, -14], [0.6, 0.3, 8.4], stone);
  box(builder, 'test2 pool coping east', [7.2, 0.15, -14], [0.6, 0.3, 8.4], stone);
  for (const poolSide of [-1, 1] as const) {
    const houseX = poolSide * 22;
    box(builder, `test2 pool house rear ${poolSide}`, [houseX, 1.5, -20], [7, 3, 0.35], stucco);
    box(builder, `test2 pool house side a ${poolSide}`, [houseX - 3.3 * poolSide, 1.5, -16.5], [0.35, 3, 7], stucco);
    box(builder, `test2 pool house front west ${poolSide}`, [houseX - poolSide * 1.4, 1.5, -13], [3.2, 3, 0.35], stucco);
    box(builder, `test2 pool house roof ${poolSide}`, [houseX, 3.15, -16.5], [7.6, 0.3, 7.6], timber);
    // Loungers: low presentation dressing.
    box(builder, `test2 lounger ${poolSide} a`, [poolSide * 10, 0.3, -11.4], [0.8, 0.4, 2], timber, { solid: false, shots: false });
    box(builder, `test2 lounger ${poolSide} b`, [poolSide * 12.2, 0.3, -11.4], [0.8, 0.4, 2], timber, { solid: false, shots: false });
  }

  // Centre: the court, planters and villa steps.
  box(builder, 'test2 court surface', [0, 0.02, 0], [12, 0.04, 9], court, { solid: false, shots: false, cast: false });
  for (const [planterX, planterZ] of [[-8, -6], [8, -6], [-8, 6], [8, 6]] as const) {
    box(builder, `test2 planter ${planterX} ${planterZ}`, [planterX, 0.55, planterZ], [2.4, 1.1, 2.4], stone);
    box(builder, `test2 planter hedge ${planterX} ${planterZ}`, [planterX, 1.5, planterZ], [2.1, 0.8, 2.1], hedge, { solid: false, shots: true });
  }
  box(builder, 'test2 fountain', [0, 0.65, 0], [2.2, 1.3, 2.2], stone);

  // South lane: garden terrace. Balustrade half-walls with gaps, hedge blocks,
  // a garage structure at each end.
  for (const balustradeX of [-13, 0, 13] as const) {
    box(builder, `test2 balustrade ${balustradeX}`, [balustradeX, 0.6, 9.5], [8, 1.2, 0.5], stone);
  }
  for (const [hedgeX, hedgeZ] of [[-10, 15], [10, 15], [0, 19]] as const) {
    box(builder, `test2 hedge ${hedgeX} ${hedgeZ}`, [hedgeX, 0.95, hedgeZ], [5, 1.9, 1.6], hedge);
  }
  for (const garageSide of [-1, 1] as const) {
    const garageX = garageSide * 25;
    box(builder, `test2 garage rear ${garageSide}`, [garageX, 1.6, 21.5], [8, 3.2, 0.35], stucco);
    box(builder, `test2 garage side ${garageSide}`, [garageX + garageSide * 3.8, 1.6, 17.8], [0.35, 3.2, 7.8], stucco);
    box(builder, `test2 garage front ${garageSide}`, [garageX - garageSide * 1.6, 1.6, 14.2], [4.6, 3.2, 0.35], stucco);
    box(builder, `test2 garage roof ${garageSide}`, [garageX, 3.35, 17.8], [8.6, 0.3, 8], timber);
  }

  // End motor courts: a low fountain wall + parked-car mass per end (solid).
  for (const motorSide of [-1, 1] as const) {
    const motorX = motorSide * 27;
    box(builder, `test2 motor wall ${motorSide}`, [motorX, 0.7, motorSide * -4], [1.1, 1.4, 9], stone);
    box(builder, `test2 parked car ${motorSide}`, [motorX - motorSide * 4.5, 0.75, motorSide * 5], [1.9, 1.5, 4.4], glass);
  }

  // Domination flag poles at the zone anchors (presentation; banners tinted
  // by the mode presentation at runtime via these exact names).
  for (const zone of TEST2_DOMINATION_ZONES) {
    const [zoneX, , zoneZ] = zone.centre;
    box(builder, `test2 zone plinth ${zone.id}`, [zoneX, 0.12, zoneZ], [1.6, 0.24, 1.6], stone);
    box(builder, `test2-zone-flag-pole-${zone.id}`, [zoneX, 2.1, zoneZ], [0.12, 4, 0.12], standard(0x8b949c, 0.5, 0.7), { solid: false, shots: false });
    box(builder, `test2-zone-flag-banner-${zone.id}`, [zoneX + 0.65, 3.55, zoneZ], [1.3, 0.8, 0.06], standard(0xcccccc, 0.85, 0.02), { solid: false, shots: false });
  }

  batchPresentationOnlyBoxes(builder.root, 'test2-presentation');

  return {
    id: 'test2',
    label: 'Test2',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [[-29, -12], [-29, -4], [-29, 4], [-29, 12], [-25, -8], [-25, 8]],
      [[29, 12], [29, 4], [29, -4], [29, -12], [25, 8], [25, -8]],
    ),
    patrolPoints: [
      [-20, -12], [0, -14], [20, -12], [14, 0], [20, 12], [0, 16], [-20, 12], [-14, 0], [0, 0], [0, -5],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...TEST2_BOUNDS },
    houseTelemetry: emptyTelemetry(),
    physicsSafetyFloorY: -1.2,
  };
}
