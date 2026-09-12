import * as THREE from 'three';
import { texturedMaterial } from './art-kit';
import {
  ARENA_BOUNDS,
  CENTRAL_BUS,
  PARKED_VAN_LAYOUT,
  KERB_CAR_LAYOUT,
  KERB_CAR_SIZE,
  PARKED_VAN_SIZE,
  COVER_LAYOUT,
  GARAGE_LAYOUT,
  GARAGE_SIZE,
  HOUSE_LAYOUT,
  NEIGHBOURHOOD_BENCH_COLLIDER_SIZE,
  NEIGHBOURHOOD_BENCH_LAYOUT,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  PATROL_LAYOUT,
  SPAWN_LAYOUT,
  STREET_CRATE_HEIGHT,
  STREET_CRATE_LOW_X,
  STREET_CRATE_TALL_HEIGHT,
  STREET_CRATE_TALL_X,
  STREET_HALF_WIDTH,
} from './arena-layout';
import { classifyImpactSurface } from './combat-feedback';
import { Box2 } from './collision';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { createHouseArchitecture, HouseSurface, solidBounds, type HouseArchitecture } from './house-navigation';
import {
  HOUSE_DESTRUCTION_DEFINITION_SET_ID,
  createAtomicHouseFragmentDefinitions,
  type HouseFragmentDefinition,
} from './house-destruction';
import { Team } from './protocol';
import type { GlassState } from './glass-authority';
import { bindPass73CollisionVisualOwner } from './pass73-collision-route-authority';
import type { ArenaId } from './map-selection';
import type { ArenaFrameUpdate } from './arena-frame-animation';
import type { ThinMetalPanelPlacement } from './thin-metal-perforation';

export type PracticeTarget = {
  id: string;
  root: THREE.Group;
  active: boolean;
  respawnAt: number;
  respawnDelayMs?: number;
  scoreValue: number;
  distanceBand: 'near' | 'mid' | 'far';
  maxHealth: number;
  health: number;
  alwaysCritical?: boolean;
  kind?: 'plate' | 'flying-cat' | 'training-dummy';
};
export type BreakableWindow = { id: string; mesh: THREE.Mesh; broken: boolean; glassState?: GlassState };
export type ArenaMap = {
  id: ArenaId;
  label: string;
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  /** Canonical shot authority shared by local fire, bots, and multiplayer verification. */
  shotSurfaces: BallisticSurface[];
  spawns: Record<Team, THREE.Vector3[]>;
  patrolPoints: THREE.Vector3[];
  targets: PracticeTarget[];
  houses: readonly HouseArchitecture[];
  houseDestruction?: Readonly<{
    definitions: readonly HouseFragmentDefinition[];
    staticColliders: readonly Box2[];
    staticBallisticSurfaceIds: readonly string[];
  }>;
  breakableWindows: BreakableWindow[];
  /** HF-467: this arena's plain thin-metal perforation registry (see src/thin-metal-perforation.ts). */
  thinMetalPanels?: readonly ThinMetalPanelPlacement[];
  physicalCover: Array<{
    id: string;
    bounds: Box2;
    blocksMovement: true;
    blocksShots: true;
    performanceVisualKind?: 'cargo-stack' | 'pipe-stack' | 'service-skip' | 'generator-trailer';
    performanceVisualMeshes?: number;
  }>;
  bounds: Box2;
  /**
   * MAP3 (HF-409): optional per-frame animation for arena-authored content.
   *
   * Absent on every arena but Map 3, and absent is the zero-cost path: the frame
   * loop reads this property, finds nothing, and does not even build the context
   * (`src/arena-frame-animation.ts`, proven in its test). An arena that sets it
   * is ticked once per frame while it is the ACTIVE arena and never while it is
   * merely built, cached or staged behind a loading transition.
   */
  update?: ArenaFrameUpdate;
  /** Optional physics-only fail-safe floor. Defaults to y=0 for legacy arenas. */
  physicsSafetyFloorY?: number;
  houseTelemetry: {
    houses: number;
    groundRooms: number;
    upperRooms: number;
    doors: number;
    windows: number;
    ramps: number;
    wallMaterialVariants: number;
    pbrMaterialFamilies: number;
  };
};

const material = (color: number, roughness = 0.78, metalness = 0.03) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export type AuthoredLargeCoverId =
  | 'north-cargo-stack'
  | 'south-pipe-stack'
  | 'west-service-skip'
  | 'east-generator-trailer';

/**
 * The four lane anchors that carry authored art instead of a blockout box, keyed
 * by ANCHOR COORDINATE rather than by COVER_LAYOUT array index.
 *
 * HF-383 removed the two leading COVER_LAYOUT entries. Both production
 * consumers - this file and the fallback/Performance art in
 * environment-assets.ts - keyed their authored art by literal index, so the
 * removal silently retired `west-service-skip` and `east-generator-trailer`
 * (indices 6 and 7 stopped existing) and re-pointed the cargo and pipe stacks
 * at the former 6/7 anchors, against a 2.8 x 4.4 collider they are not modelled
 * for. Nothing failed loudly: two minimap landmarks disappeared, two moved, and
 * the orphaned (-8,-22)/(8,22) anchors went back to rendering as plain
 * aqua/coral blockout cubes. Anchors are what the art is actually modelled
 * against, so keying on them means a future layout edit either keeps the anchor
 * (art follows it automatically) or deletes it, which fails
 * src/atomic-authored-cover.test.ts instead of passing quietly.
 */
export const AUTHORED_LARGE_COVER_ANCHORS: ReadonlyArray<
  readonly [x: number, z: number, id: AuthoredLargeCoverId]
> = Object.freeze([
  // v3: anchors follow the COVER_LAYOUT re-seat for the house-per-end
  // anatomy - ids stable, coordinates the layout's.
  Object.freeze([-9, -26, 'north-cargo-stack'] as const),
  Object.freeze([9, 26, 'south-pipe-stack'] as const),
  Object.freeze([27, -13, 'west-service-skip'] as const),
  Object.freeze([-27, 13, 'east-generator-trailer'] as const),
]);

/** Authored large cover is the tall lane-breaking class; ordinary cover is 1.6 m. */
export const AUTHORED_LARGE_COVER_HEIGHT = 2.2;

// v3 (owner HITL 2026-08-29): the mannequin prop class is DELETED -
// "random manekins that look like bots standing around, remove those".


/** Resolve the authored asset seated on a cover anchor, or null for plain cover. */
export function authoredLargeCoverIdAt(x: number, z: number): AuthoredLargeCoverId | null {
  const anchor = AUTHORED_LARGE_COVER_ANCHORS.find(
    (entry) => Math.abs(entry[0] - x) < 1e-6 && Math.abs(entry[1] - z) < 1e-6,
  );
  return anchor ? anchor[2] : null;
}

export function buildArena(scene: THREE.Scene): ArenaMap {
  const colliders: Box2[] = [];
  const physicsColliders: Box2[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const shotSurfaces: BallisticSurface[] = [];
  let ballisticSurfaceSequence = 0;
  const targets: PracticeTarget[] = [];
  const houses: HouseArchitecture[] = [];
  const houseFragmentDefinitions: HouseFragmentDefinition[] = [];
  const staticHouseFragmentColliders: Box2[] = [];
  const staticHouseFragmentBallisticSurfaceIds: string[] = [];
  const breakableWindows: BreakableWindow[] = [];
  const physicalCover: ArenaMap['physicalCover'] = [];
  const houseTelemetry = {
    houses: 0, groundRooms: 0, upperRooms: 0, doors: 0, windows: 0, ramps: 0,
    wallMaterialVariants: 6,
    pbrMaterialFamilies: 9,
  };
  const world = new THREE.Group();
  world.name = 'Atomic Acres arena';
  scene.add(world);

  const pbrTexture = (stem: string, options: Parameters<typeof texturedMaterial>[1] = {}) => texturedMaterial(
    `./assets/original/textures/${stem}.png`,
    {
      ...options,
      normalPath: `./assets/original/textures/${stem}-normal.png`,
      roughnessPath: `./assets/original/textures/${stem}-roughness.png`,
    },
  );

  const palette = {
    grass: pbrTexture('grass-turf', { roughness: 1, repeatX: 12, repeatY: 16, normalScale: 0.24 }),
    grassDark: texturedMaterial('./assets/original/textures/grass-turf.png', { color: 0x7e916a, roughness: 1, repeatX: 8, repeatY: 8 }),
    road: pbrTexture('asphalt-aged', { roughness: 0.98, repeatX: 5, repeatY: 20, normalScale: 0.32 }),
    concrete: pbrTexture('concrete-poured', { roughness: 0.94, repeatX: 3, repeatY: 3, normalScale: 0.38 }),
    cream: pbrTexture('plaster-warm', { roughness: 0.92, repeatX: 3, repeatY: 3, normalScale: 0.36 }),
    aqua: pbrTexture('siding-aqua', { roughness: 0.76, repeatX: 4, repeatY: 4, normalScale: 0.5 }),
    aquaUpper: pbrTexture('siding-aqua', { color: 0xc1e4dd, roughness: 0.8, repeatX: 6, repeatY: 5, normalScale: 0.65 }),
    coral: pbrTexture('siding-coral', { roughness: 0.76, repeatX: 4, repeatY: 4, normalScale: 0.5 }),
    coralUpper: pbrTexture('brick-warm', { color: 0xe7c0ad, roughness: 0.91, repeatX: 7, repeatY: 4, normalScale: 0.72 }),
    mustard: material(0xd9a43b, 0.58, 0.18),
    dark: texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { roughness: 0.56, metalness: 0.3, repeatX: 3, repeatY: 2 }),
    timber: pbrTexture('wood-deck', { roughness: 0.92, repeatX: 4, repeatY: 2, normalScale: 0.42 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x78bad0, roughness: 0.1, metalness: 0.04, transparent: true, opacity: 0.54, transmission: 0.12 }),
    white: material(0xf0e4c9, 0.68),
    // Roughness 0.18, not 0.23. This material is named chrome, is metalness
    // 0.76, and dresses the ramp rails, both garage doors, the irrigation
    // vessel and the entrance canopies - polished metal by authorship. At 0.23
    // it sat one hundredth ABOVE the 0.22 mirror ceiling the ray-traced preset
    // classifies against, so the flagship map offered the tracer exactly two
    // reflective surfaces totalling 14 m2 and RAY TRACED did visibly nothing
    // here. The ceiling is combat-tuned and must not move; the material was
    // simply under-polished for what it is called.
    chrome: material(0xaebdc1, 0.18, 0.76),
    brick: pbrTexture('brick-warm', { roughness: 0.9, repeatX: 5, repeatY: 3, normalScale: 0.65 }),
    roof: pbrTexture('roof-shingles', { roughness: 0.86, repeatX: 5, repeatY: 6, normalScale: 0.48 }),
  };
  // Performance batching otherwise lifts reflective chrome to near-white and lets
  // stair rails overpower route geometry. Quality preserves the authored material.
  palette.chrome.userData.batchColor = 0x5f6d72;

  function box(
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    mat: THREE.Material,
    solid = true,
    cast = true,
    blocksShots = solid,
    ballisticMaterial?: BallisticMaterialId,
    breakableWindowId?: string,
    rotation?: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.userData.impactSurface = classifyImpactSurface({
      name,
      metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : undefined,
    });
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
    const bounds: Box2 = {
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
      minY: position[1] - size[1] / 2,
      maxY: position[1] + size[1] / 2,
      ...(rotation ? { rotation } : {}),
    };
    if (blocksShots) {
      raycastMeshes.push(mesh);
      const surface = createBallisticSurface(
        `atomic-acres:${ballisticSurfaceSequence}:${name}`,
        name,
        bounds,
        {
          impactSurface: mesh.userData.impactSurface as ReturnType<typeof classifyImpactSurface>,
          material: ballisticMaterial,
        },
        breakableWindowId,
      );
      ballisticSurfaceSequence += 1;
      shotSurfaces.push(surface);
      mesh.userData.ballisticSurfaceId = surface.id;
      mesh.userData.ballisticMaterial = surface.material;
    }
    if (solid) {
      colliders.push(bounds);
      physicsColliders.push(bounds);
    }
    return mesh;
  }

  // (collisionProxy helper deleted with its last callers in the 2026-08-29
  // declutter - authoredCollisionProxy below is the surviving authority
  // helper for player-sized props.)
  function authoredCollisionProxy(
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    // HF-390 lane: REQUIRED. The old 'structural-metal' default made a silent
    // guess look exactly like an authored rating ('explicit' classification),
    // so the fallback gate could never catch it - the house media consoles
    // shipped rated near-concrete that way.
    ballisticMaterial: BallisticMaterialId,
  ): THREE.Mesh {
    const proxy = box(name, position, size, palette.dark, true, false, true, ballisticMaterial);
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
    proxy.userData.authoredCollisionAuthority = true;
    return proxy;
  }

  function performanceCoverBox(
    coverId: string,
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    mat: THREE.Material,
  ): THREE.Mesh {
    const mesh = box(name, position, size, mat, false, false, false);
    mesh.userData.performanceCoverId = coverId;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    return mesh;
  }

  function performanceCoverCylinder(
    coverId: string,
    name: string,
    position: [number, number, number],
    radius: number,
    length: number,
    mat: THREE.Material,
    rotation: [number, number, number],
    hollow = false,
  ): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    if (hollow) {
      const profile = new THREE.Shape();
      profile.absarc(0, 0, radius, 0, Math.PI * 2, false);
      const opening = new THREE.Path();
      opening.absarc(0, 0, radius * 0.58, 0, Math.PI * 2, true);
      profile.holes.push(opening);
      geometry = new THREE.ExtrudeGeometry(profile, {
        depth: length,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 6,
      });
      geometry.translate(0, 0, -length / 2);
      geometry.rotateX(-Math.PI / 2);
    } else {
      geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.userData.performanceCoverId = coverId;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.impactSurface = 'metal';
    world.add(mesh);
    return mesh;
  }

  function addPerformanceLargeCover(
    id: AuthoredLargeCoverId,
    x: number,
    z: number,
  ): { kind: NonNullable<ArenaMap['physicalCover'][number]['performanceVisualKind']>; meshes: number } {
    let meshes = 0;
    const addBox = (name: string, position: [number, number, number], size: [number, number, number], mat: THREE.Material) => {
      performanceCoverBox(id, name, position, size, mat);
      meshes += 1;
    };
    const addCylinder = (name: string, position: [number, number, number], radius: number, length: number, mat: THREE.Material, rotation: [number, number, number], hollow = false) => {
      performanceCoverCylinder(id, name, position, radius, length, mat, rotation, hollow);
      meshes += 1;
    };

    if (id === 'north-cargo-stack') {
      // HF-387 player-body half: the lower crates used to span x +/- 1.925
      // while the frozen COVER_LAYOUT authority for this anchor is only
      // +/- 1.5 wide (3 x 2.2 at [-8,-22]), so a player hugging the stack put
      // the camera eye inside visible crate mass that nothing blocked. The
      // silhouette now sits INSIDE the frozen authority envelope (visible mass
      // matches movement/shot authority) instead of widening the frozen
      // gameplay layout, which world-identity pins forbid. NOTE: HF-387 was
      // authored while the index-keying bug had this builder mis-seated on the
      // 2.8 x 4.4 anchor, so its comment quoted +/- 1.4; the geometry it landed
      // (+/- 1.4 wide, +/- 0.91 deep) fits both, and fits the correct anchor
      // with 0.1 m to spare.
      for (const offset of [-0.7, 0.7]) addBox('performance-cargo-lower', [x + offset, 0.52, z], [1.4, 1.04, 1.82], offset < 0 ? palette.aqua : palette.mustard);
      addBox('performance-cargo-upper', [x, 1.62, z], [2.15, 1.04, 1.82], palette.aqua);
      for (const offset of [-0.62, 0.62]) addBox('performance-cargo-lock-rail', [x + offset, 1.62, z - 0.93], [0.12, 0.9, 0.08], palette.dark);
      return { kind: 'cargo-stack', meshes };
    }

    if (id === 'south-pipe-stack') {
      // HF-387: same authority-wrap rule as the cargo stack - pipe extents
      // stay inside the +/- 1.4 m frozen cover width.
      for (const offset of [-0.85, 0, 0.85]) addCylinder('performance-concrete-pipe', [x + offset, 0.53, z], 0.52, 1.82, palette.concrete, [Math.PI / 2, 0, 0], true);
      for (const offset of [-0.58, 0.58]) addCylinder('performance-concrete-pipe', [x + offset, 1.52, z], 0.52, 1.82, palette.concrete, [Math.PI / 2, 0, 0], true);
      return { kind: 'pipe-stack', meshes };
    }

    if (id === 'west-service-skip') {
      // HF-387 authority-wrap rule, applied to the two builders that were
      // unreachable while the index-keying bug hid them: every visible face
      // stays inside the frozen 2.8 x 4.4 anchor (x +/- 1.4, z +/- 2.2), so no
      // eye that the capsule can press against ends up inside skip mass.
      addBox('performance-skip-floor', [x, 0.18, z], [2.72, 0.28, 4.3], palette.dark);
      for (const offset of [-1.25, 1.25]) addBox('performance-skip-side', [x + offset, 1.02, z], [0.22, 1.72, 4.3], palette.aqua);
      addBox('performance-skip-rear', [x, 1.02, z + 2.04], [2.6, 1.72, 0.22], palette.aqua);
      addBox('performance-skip-front', [x, 0.62, z - 2.04], [2.6, 0.92, 0.22], palette.mustard);
      for (const offset of [-1.25, 1.25]) addBox('performance-skip-top-rail', [x + offset, 1.92, z], [0.28, 0.16, 4.3], palette.mustard);
      return { kind: 'service-skip', meshes };
    }

    // Generator trailer: same authority-wrap envelope as the skip above.
    addBox('performance-generator-chassis', [x, 0.48, z], [2.72, 0.22, 4.3], palette.dark);
    addBox('performance-generator-body', [x, 1.28, z + 0.28], [2.42, 1.5, 3.05], palette.mustard);
    addBox('performance-generator-panel', [x - 1.23, 1.3, z + 0.28], [0.08, 0.92, 1.75], palette.dark);
    addBox('performance-generator-drawbar', [x, 0.48, z - 1.68], [0.18, 0.18, 0.9], palette.chrome);
    for (const wheelX of [-1.22, 1.22]) for (const wheelZ of [-1.08, 1.08]) {
      addCylinder('performance-generator-wheel', [x + wheelX, 0.48, z + wheelZ], 0.38, 0.24, palette.dark, [0, 0, Math.PI / 2]);
    }
    addCylinder('performance-generator-exhaust', [x + 0.83, 1.75, z + 0.82], 0.1, 0.82, palette.dark, [0, 0, 0]);
    return { kind: 'generator-trailer', meshes };
  }


  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 68), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'soil';
  world.add(ground);
  raycastMeshes.push(ground);
  const groundSurface = createBallisticSurface(
    `atomic-acres:${ballisticSurfaceSequence}:ground`,
    'atomic-acres-ground',
    { minX: -35, maxX: 35, minY: -8, maxY: 0, minZ: -34, maxZ: 34 },
    { impactSurface: 'soil', material: 'earth' },
  );
  ballisticSurfaceSequence += 1;
  shotSurfaces.push(groundSurface);
  ground.userData.ballisticSurfaceId = groundSurface.id;
  ground.userData.ballisticMaterial = groundSurface.material;

  // The street runs the long axis with a house on each kerb, so the road plane
  // is laid out along X and both houses face across it.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(70, STREET_HALF_WIDTH * 2), palette.road);
  road.name = 'aged asphalt road';
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.025;
  road.receiveShadow = true;
  road.userData.impactSurface = 'concrete';
  world.add(road);
  raycastMeshes.push(road);
  const roadSurface = createBallisticSurface(
    `atomic-acres:${ballisticSurfaceSequence}:road`,
    'atomic-acres-road',
    { minX: -35, maxX: 35, minY: -0.25, maxY: 0.03, minZ: -STREET_HALF_WIDTH, maxZ: STREET_HALF_WIDTH },
    { impactSurface: 'concrete', material: 'concrete' },
  );
  ballisticSurfaceSequence += 1;
  shotSurfaces.push(roadSurface);
  road.userData.ballisticSurfaceId = roadSurface.id;
  road.userData.ballisticMaterial = roadSurface.material;
  for (const z of [-5.6, 5.6]) box('curb', [0, 0.12, z], [70, 0.24, 1.2], palette.concrete, false, false);
  for (const z of [-7.5, 7.5]) box('sidewalk', [0, 0.07, z], [70, 0.14, 2.6], palette.concrete, false, false);
  for (const x of [-32, -24, -16, -8, 8, 16, 24, 32]) box('lane marker', [x, 0.055, 0], [3.6, 0.03, 0.18], palette.mustard, false, false);
  for (const x of [-16, 16]) {
    for (let z = -4.5; z <= 4.5; z += 1.5) box('crosswalk stripe', [x, 0.062, z], [3.2, 0.025, 1.4], palette.white, false, false);
  }

  function addHouse(team: Team, x: number, z: number, facing: 1 | -1): void {
    const architecture = createHouseArchitecture(team, x, z, facing);
    const destructionDefinitions = createAtomicHouseFragmentDefinitions([architecture]);
    houseFragmentDefinitions.push(...destructionDefinitions);
    houses.push(architecture);
    houseTelemetry.houses += 1;
    houseTelemetry.groundRooms += architecture.rooms.filter((room) => room.level === 'ground').length;
    houseTelemetry.upperRooms += architecture.rooms.filter((room) => room.level === 'upper').length;
    houseTelemetry.doors += architecture.openings.filter((opening) => opening.kind === 'exterior-door').length;
    houseTelemetry.windows += architecture.openings.filter((opening) => opening.kind === 'window').length;
    houseTelemetry.ramps += architecture.solids.filter((solid) => solid.kind === 'ramp').length;
    const surfaceMaterial: Record<HouseSurface, THREE.Material> = {
      aqua: palette.aqua,
      coral: palette.coral,
      plaster: palette.cream,
      brick: palette.brick,
      timber: palette.timber,
      concrete: palette.concrete,
      trim: palette.white,
      glass: palette.glass,
      metal: palette.chrome,
      ceiling: palette.cream,
      light: new THREE.MeshBasicMaterial({ color: 0xffe2a3, toneMapped: false }),
    };
    const wallMaterial = (solid: HouseArchitecture['solids'][number]): THREE.Material => {
      if (solid.surface === 'glass' && solid.name.includes('upper-window')) {
        return new THREE.MeshPhysicalMaterial({
          color: 0xb9eef2,
          roughness: 0.06,
          metalness: 0,
          transparent: true,
          opacity: 0.2,
          transmission: 0.48,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }
      if (solid.surface === 'aqua') {
        if (solid.name.includes('upper')) return palette.aquaUpper;
        if (solid.name.startsWith('rear-ground')) return palette.cream;
      }
      if (solid.surface === 'coral') {
        if (solid.name.includes('upper')) return palette.coralUpper;
        if (solid.name.startsWith('rear-ground')) return palette.cream;
      }
      return surfaceMaterial[solid.surface];
    };
    const wallBallistics: Record<HouseSurface, BallisticMaterialId> = {
      aqua: 'interior-wall',
      coral: 'interior-wall',
      plaster: 'interior-wall',
      brick: 'brick',
      timber: 'wood',
      concrete: 'concrete',
      trim: 'wood',
      glass: 'glass',
      metal: 'thin-metal',
      ceiling: 'interior-wall',
      light: 'reinforced',
    };

    const bindPreauthoredFragment = (
      rendered: THREE.Mesh,
      definition: HouseFragmentDefinition,
    ): void => {
      const collider = colliders.at(-1);
      const physicsCollider = physicsColliders.at(-1);
      const surface = shotSurfaces.at(-1);
      if (!collider || physicsCollider !== collider || !surface || rendered.userData.ballisticSurfaceId !== surface.id) {
        throw new Error(`Atomic house fragment ${definition.id} did not bind one static authority tuple`);
      }
      physicsColliders.pop();
      staticHouseFragmentColliders.push(collider);
      staticHouseFragmentBallisticSurfaceIds.push(surface.id);
      shotSurfaces[shotSurfaces.length - 1] = Object.freeze({
        ...surface,
        houseFragment: Object.freeze({
          definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
          fragmentId: definition.id,
        }),
      });
      rendered.visible = false;
      rendered.userData.preAuthoredHouseFragmentId = definition.id;
      rendered.userData.dynamicAuthorityReplacement = true;
    };

    for (const solid of architecture.solids) {
      const solidMaterial = wallMaterial(solid);
      if (solid.kind === 'ramp') {
        // HF-390 lane (2026-08-28): ramps were movement-only - a timber ramp
        // was GHOST cover for gunfire (no impact, no attenuation, free
        // under-ramp wallbangs). Register the slope for shots with its real
        // rotation so bullets pay the authored family (timber -> wood).
        const rendered = box(
          solid.name, solid.position, solid.size, solidMaterial,
          false, true, true, wallBallistics[solid.surface], undefined, solid.rotation,
        );
        bindPass73CollisionVisualOwner(rendered, architecture, solid);
        physicsColliders.push(solidBounds(solid));
        continue;
      }
      const isBreakableGlass = solid.kind === 'glass' && solid.breakable;
      const destructionDefinition = destructionDefinitions.find((definition) => (
        definition.sourceKind === 'architecture-solid' && definition.sourceId === solid.id
      ));
      const rendered = box(
        solid.name,
        solid.position,
        solid.size,
        solidMaterial,
        solid.collidable,
        solid.kind !== 'glass',
        isBreakableGlass || solid.collidable,
        wallBallistics[solid.surface],
        isBreakableGlass ? solid.id : undefined,
      );
      if (solid.rotation) rendered.rotation.set(...solid.rotation);
      bindPass73CollisionVisualOwner(rendered, architecture, solid);
      if (destructionDefinition) bindPreauthoredFragment(rendered, destructionDefinition);
      if (isBreakableGlass) {
        rendered.userData.breakableWindowId = solid.id;
        rendered.userData.dynamic = true;
        breakableWindows.push({ id: solid.id, mesh: rendered, broken: false });
      }
    }

    for (const definition of destructionDefinitions.filter((candidate) => candidate.role === 'roof')) {
      const rendered = box(
        definition.sourceId,
        [definition.position.x, definition.position.y, definition.position.z],
        [definition.halfExtents.x * 2, definition.halfExtents.y * 2, definition.halfExtents.z * 2],
        palette.roof,
        true,
        true,
        true,
        definition.ballisticMaterial,
      );
      bindPreauthoredFragment(rendered, definition);
    }
  }

  for (const house of HOUSE_LAYOUT) addHouse(house.team, house.x, house.z, house.facing);

  // The authored street-life layer is presentation-only. These shared layout
  // bounds make every player-sized bench and recycling bin physical without
  // coupling gameplay authority to render-profile meshes.
  for (const [index, [x, z, rotation]] of NEIGHBOURHOOD_BENCH_LAYOUT.entries()) {
    const [width, height, depth] = NEIGHBOURHOOD_BENCH_COLLIDER_SIZE;
    const rotated = Math.abs(Math.sin(rotation)) > 0.5;
    const proxy = box(
      `street-bench-collider-${index}`,
      [x, height / 2, z],
      [rotated ? depth : width, height, rotated ? width : depth],
      palette.timber,
      true,
      false,
      true,
      'wood',
    );
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
  }
  for (const [index, [x, z]] of NEIGHBOURHOOD_BIN_POSITIONS.entries()) {
    const [width, height, depth] = NEIGHBOURHOOD_BIN_COLLIDER_SIZE;
    const proxy = box(
      `street-recycling-bin-collider-${index}`,
      [x, height / 2, z],
      [width, height, depth],
      palette.dark,
      true,
      false,
      true,
      'thin-metal',
    );
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
  }
  // v3 (owner HITL 2026-08-29): the mannequins are DELETED - "random
  // manekins that look like bots standing around, remove those".

  // One transit anchor, parked broadside across the middle of the street. This
  // is the map's single unmistakable piece of central hard cover: it splits the
  // road sightline in half and is the first thing both teams contest.
  const [busLength, busHeight, busWidth] = CENTRAL_BUS.size;
  // v4 (owner 2026-08-29): the bus is REAL - a walkable interior entered
  // through its two side doors (the positions the coach art has always
  // framed), window bands that are movement-solid but ballistic GLASS so you
  // can see and shoot in and out, closed ends under the raked end glazing,
  // and the same footprint as ever. The old single body box answered the
  // "should the windows become real apertures" question recorded in
  // docs/ballistic-parity/ - the owner decided yes.
  // v6 (owner 2026-08-30 playtest): taller two-tier bus. Hull 0-1.1, glass
  // band 1.1-2.1 (movement-solid, SHOOT-THROUGH once its breakable panes
  // shatter), end decks top 2.25 over the cab/engine bays, main roof top 3.0.
  const busHullTopY = 1.1;
  const busWindowTopY = 2.1;
  const busDeckTopY = 2.25;
  const busMidHalf = 4.1; // main-roof section |x| extent; decks beyond.
  const busSideZ = busWidth / 2 - 0.14; // hull centreline (z +/-2.66)
  const busDoorHalf = 0.85;
  // Door centres mirror the coach art's frames: north side toward the west
  // end, south side the exact 180-degree twin.
  // Doors at +/-2.8: clear of the wheel solids at the corners (the first
  // seat at 4.05 sealed the interior - 0.23 m past capsule margins).
  const busDoorX = 2.8;
  for (const side of [-1, 1] as const) {
    const doorCentre = -side * busDoorX;
    const sideName = side < 0 ? 'north' : 'south';
    const segments: Array<[number, number]> = [
      [-busLength / 2, doorCentre - busDoorHalf],
      [doorCentre + busDoorHalf, busLength / 2],
    ];
    for (const [fromX, toX] of segments) {
      const width = toX - fromX;
      const centre = (fromX + toX) / 2;
      box(`central bus hull ${sideName} ${fromX < doorCentre ? 'a' : 'b'}`,
        [CENTRAL_BUS.x + centre, busHullTopY / 2, CENTRAL_BUS.z + side * busSideZ],
        [width, busHullTopY, 0.28], palette.mustard, true, true, true, 'vehicle');
      // v6 window authority is SPLIT so the glass can break without the
      // traversal contract changing:
      //   * an invisible movement-only proxy keeps the band solid to bodies
      //     (you still cannot walk through a shattered window frame), and
      //   * per-bay BREAKABLE panes are the visible glass AND the ballistic
      //     authority, tiling the proxy's exact footprint so the coach art's
      //     windows stay rated (the parity gate caught the ghost the first
      //     cut created by simply switching the band's shots off).
      const bandProxy = box(`central bus window band ${sideName} ${fromX < doorCentre ? 'a' : 'b'}`,
        [CENTRAL_BUS.x + centre, (busHullTopY + busWindowTopY) / 2, CENTRAL_BUS.z + side * (busWidth / 2 + 0.02)],
        [width, busWindowTopY - busHullTopY, 0.12], palette.glass, true, false, false, 'glass');
      bandProxy.visible = false;
      bandProxy.userData.collisionProxy = true;
      bandProxy.userData.authoredCollisionAuthority = true;
      // v6 ("bus glass isn't breaking with shooting"): per-bay breakable
      // panes - shots shatter them exactly like house windows, and the
      // empty frame then shoots through while the proxy still stops bodies.
      const bayCount = Math.max(1, Math.round(width / 2.1));
      const bayWidth = width / bayCount;
      for (let bay = 0; bay < bayCount; bay += 1) {
        const bayCentre = fromX + bayWidth * (bay + 0.5);
        const paneId = `central-bus-pane-${sideName}-${fromX < doorCentre ? 'a' : 'b'}-${bay}`;
        const pane = box(paneId,
          [CENTRAL_BUS.x + bayCentre, (busHullTopY + busWindowTopY) / 2, CENTRAL_BUS.z + side * (busWidth / 2 + 0.02)],
          [bayWidth, busWindowTopY - busHullTopY, 0.12],
          palette.glass, false, true, true, 'glass', paneId);
        pane.userData.breakableWindowId = paneId;
        pane.userData.dynamic = true;
        breakableWindows.push({ id: paneId, mesh: pane, broken: false });
      }
    }
    // v6 roof-band wall over the MID section. Its underside is 2.2 m - real
    // standing clearance through the door mouths beneath it, and above the
    // traversal audit's head-clearance rule so the doorways audit as the
    // walkable mouths they actually are. It runs the full mid length, so it
    // IS the door header; no separate header box.
    box(`central bus roof band mid ${sideName}`,
      [CENTRAL_BUS.x, (2.2 + busHeight) / 2, CENTRAL_BUS.z + side * busSideZ],
      [busMidHalf * 2, busHeight - 2.2, 0.28], palette.mustard, true, true, true, 'vehicle');
    for (const deckEnd of [-1, 1] as const) {
      box(`central bus deck lip ${sideName} ${deckEnd < 0 ? 'west' : 'east'}`,
        [CENTRAL_BUS.x + deckEnd * (busMidHalf + (busLength / 2 - busMidHalf) / 2), (busWindowTopY + busDeckTopY) / 2, CENTRAL_BUS.z + side * busSideZ],
        [busLength / 2 - busMidHalf, busDeckTopY - busWindowTopY, 0.28], palette.mustard, true, true, true, 'vehicle');
    }
  }
  // Closed ends below the raked end glazing (whose shot-only proxies remain
  // the glass authority above 1.9 m).
  for (const end of [-1, 1] as const) {
    box(`central bus end cap ${end < 0 ? 'west' : 'east'}`,
      [CENTRAL_BUS.x + end * (busLength / 2 - 0.15), busWindowTopY / 2, CENTRAL_BUS.z],
      [0.3, busWindowTopY, busWidth], palette.mustard, true, true, true, 'vehicle');
    box(`central bus end roofline ${end < 0 ? 'west' : 'east'}`,
      [CENTRAL_BUS.x + end * (busLength / 2 - 0.15), (busWindowTopY + busDeckTopY) / 2, CENTRAL_BUS.z],
      [0.3, busDeckTopY - busWindowTopY, busWidth], palette.mustard, true, true, true, 'vehicle');
  }
  // v6 walkable surfaces: two END DECKS at 2.25 (the third 0.75 rise from
  // the tall crates) and the MAIN roof at 3.0 (the fourth), with riser faces
  // closing the step between them.
  for (const deckEnd of [-1, 1] as const) {
    box(`central bus deck ${deckEnd < 0 ? 'west' : 'east'}`,
      [CENTRAL_BUS.x + deckEnd * (busMidHalf + (busLength / 2 - busMidHalf) / 2), busDeckTopY - 0.06, CENTRAL_BUS.z],
      [busLength / 2 - busMidHalf, 0.12, busWidth], palette.white, true, true, true, 'vehicle');
    box(`central bus roof riser ${deckEnd < 0 ? 'west' : 'east'}`,
      [CENTRAL_BUS.x + deckEnd * busMidHalf, (busDeckTopY + busHeight) / 2, CENTRAL_BUS.z],
      [0.24, busHeight - busDeckTopY, busWidth], palette.mustard, true, true, true, 'vehicle');
  }
  box('central bus roof', [CENTRAL_BUS.x, busHeight - 0.06, CENTRAL_BUS.z], [busMidHalf * 2, 0.12, busWidth], palette.white, true, true, true, 'vehicle');
  // Bot cover reasoning keeps one bus-sized envelope; movement/ballistics
  // come from the pieces above.
  physicalCover.push({
    id: 'central-transit-bus',
    bounds: {
      minX: CENTRAL_BUS.x - busLength / 2, maxX: CENTRAL_BUS.x + busLength / 2,
      minY: 0, maxY: busHeight,
      minZ: CENTRAL_BUS.z - busWidth / 2, maxZ: CENTRAL_BUS.z + busWidth / 2,
    },
    // Semantically the hull IS mostly blocking; the flags feed the minimap's
    // landmark renderer, not physics (the pieces above own that).
    blocksMovement: true,
    blocksShots: true,
  });
  // v4: the crude wheel visuals leave (the coach art and the Quality bake
  // both carry real wheels); the interior gains HONEST seat colliders sized
  // to the coach art's bench rows - crouch cover inside the bus, and the
  // walk-through census stops seeing ghost furniture.
  for (const [index, [wheelX, wheelZ]] of ([
    [-4.64, -1.71], [4.64, 1.71], [-4.56, 1.89], [4.56, -1.89],
  ] as Array<[number, number]>).entries()) {
    // v5: arches shrink with the lower bus so they read as wheel wells, not
    // interior walls.
    box(`central bus wheel ${index}`, [CENTRAL_BUS.x + wheelX, 0.45, CENTRAL_BUS.z + wheelZ], [1.3, 0.9, 0.4], palette.dark, true, false, true, 'vehicle');
  }
  // v6 interior ("needs better quality inside too, not just random
  // geometry"): a real coach cabin, authored once and mirrored 180 degrees so
  // the fairness contract holds - the driver cab at the west end has an
  // engine/luggage bay as its exact rotational twin at the east end. Every
  // interior piece is either FLUSH to a hull (<0.2 m gap - no standable cell)
  // or leaves >=0.85 m of walkable clearance, so no sealed pockets form.
  const busMirrored = (
    name: string,
    twinName: string,
    [pieceX, pieceY, pieceZ]: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    shots = true,
  ): void => {
    box(name, [CENTRAL_BUS.x + pieceX, pieceY, CENTRAL_BUS.z + pieceZ], size, material, true, shots, true, 'vehicle');
    box(twinName, [CENTRAL_BUS.x - pieceX, pieceY, CENTRAL_BUS.z - pieceZ], size, material, true, shots, true, 'vehicle');
  };
  // Cab (west) / engine bay (east): dash+workbench flush to the north hull,
  // half bulkhead flush behind, seat block sealed into the bulkhead corner.
  busMirrored('central bus cab dash', 'central bus engine workbench', [-5.6, 0.75, -1.35], [1, 1.5, 2.3], palette.dark);
  busMirrored('central bus cab bulkhead', 'central bus engine bulkhead', [-3.9, 0.95, -1.65], [0.14, 1.9, 1.6], palette.mustard);
  busMirrored('central bus cab seat', 'central bus engine crate', [-4.5, 0.3, -1.35], [0.7, 0.6, 0.7], palette.aqua);
  // Three bench pairs per side; backs face the near end so each seat's twin
  // (mirrored in x AND z) is byte-symmetric. Stanchions stand at the aisle
  // corner of every bench.
  // Two bench pairs per side, in the central band BETWEEN the door strips
  // (aperture x +/-1.95..3.65): v5 already proved a bench in the doorway
  // seals the interior, and the v6 first cut re-proved it (351-cell pocket).
  for (const [index, seatX] of ([-1.1, 1.1] as const).entries()) {
    busMirrored(`central bus seat ${index} north`, `central bus seat ${index} south`,
      [seatX, 0.225, -1.95], [1.5, 0.45, 0.75], palette.aqua);
    busMirrored(`central bus seat back ${index} north`, `central bus seat back ${index} south`,
      [seatX - 0.68, 0.66, -1.95], [0.14, 0.58, 0.75], palette.aqua);
    busMirrored(`central bus stanchion ${index} north`, `central bus stanchion ${index} south`,
      [seatX + 0.62, 1.5, -1.5], [0.07, 1.2, 0.07], palette.white, false);
  }

  // HF-390 lane: the Quality art coach (environment-assets buildRetroCoach at
  // CENTRAL_BUS, yaw PI/2 + 0.02) has raked end glazing OUTSIDE the bus body
  // box (half-length 6.3), so its windshield and rear glass were ghost
  // surfaces - bullets crossed with no impact. Shot-only glass panes sized to
  // the art's measured world AABBs (docs/ballistic-parity sweep) give them
  // real glass impacts; the parity gate re-flags them if the art ever moves.
  // One shared envelope for both ends (covering the larger, windshield AABB):
  // the art's windshield and rear glass differ by centimetres, but the
  // nuketown fidelity contract requires 180-degree symmetric authority, and a
  // glass toll over a superset envelope is felt identically at both ends.
  for (const [name, endX, endZ] of [
    ['coach windshield', -6.82, 0.14],
    ['coach rear glass', 6.82, -0.14],
  ] as Array<[string, number, number]>) {
    // v6: the raked end glazing follows the 1.1-2.1 glass band.
    const pane = box(name, [CENTRAL_BUS.x + endX, 1.6, CENTRAL_BUS.z + endZ], [0.27, 1, 4.28], palette.glass, false, false, true, 'glass');
    pane.visible = false;
    pane.userData.collisionProxy = true;
    pane.userData.authoredCollisionAuthority = true;
  }

  // Two delivery vans parked in the road, one beyond each end of the bus.
  // They are the diagonal-lane authority: without them a standing player sees
  // corner to corner across the yards and the open road (65 m measured). The
  // visible body wraps the collider so presentation never hides authority.
  const [vanLength, vanHeight, vanWidth] = PARKED_VAN_SIZE;
  for (const van of PARKED_VAN_LAYOUT) {
    box(van.id, [van.x, vanHeight / 2, van.z], [vanLength, vanHeight, vanWidth], palette.white, true, true, true, 'vehicle');
    physicalCover.push({ id: van.id, bounds: { ...colliders[colliders.length - 1] }, blocksMovement: true, blocksShots: true });
    // Cab and windscreen sit inside the collider envelope; wheels are
    // presentation-only below the body line.
    box(`${van.id} windscreen`, [van.x + (van.x > 0 ? -1.45 : 1.45), 1.85, van.z], [0.9, 0.7, vanWidth - 0.2], palette.glass, false, false);
    for (const wheelX of [-vanLength / 2 + 0.95, vanLength / 2 - 0.95]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8), palette.dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(van.x + wheelX, 0.42, van.z);
      world.add(wheel);
    }
  }

  // Each garage is attached to the outboard end of its own house with the door
  // on the same building line, so both yards read as one property.
  const [garageWidth, garageHeight, garageDepth] = GARAGE_SIZE;
  for (const [index, garage] of GARAGE_LAYOUT.entries()) {
    const facing = garage.z < 0 ? 1 : -1;
    box(`garage ${index}`, [garage.x, garageHeight / 2, garage.z], [garageWidth, garageHeight, garageDepth], palette.cream);
    // These read as closed, opaque doors, so movement and projectile authority
    // must match the facade instead of relying on the slightly recessed shell.
    // HF-390 lane: the chrome door previously fell to the 'garage' name rule
    // (interior-wall, 0.42/1.05) - a metal door that wallbanged like
    // plasterboard. Authored thin-metal to match what it visibly is.
    box('garage door', [garage.x, 1.35, garage.z + facing * (garageDepth / 2)], [garageWidth - 1.8, 2.5, 0.18], palette.chrome, true, false, true, 'thin-metal');
  }

  // v3 (owner HITL 2026-08-29): every yard fence, front hedge and garden-
  // cover slab is DELETED - "remove all hedges and fences for now".
  for (const car of KERB_CAR_LAYOUT) {
    const [carLength, carHeight, carWidth] = KERB_CAR_SIZE;
    box(car.id, [car.x, carHeight / 2, car.z], [carLength, carHeight, carWidth], palette.coral, true, false, true, 'vehicle');
  }
  // v3: rear-yard hedges, garden dividers and spawn-end fences DELETED with
  // the rest of the fence system. The dividers had shipped INVISIBLE on the
  // Quality profile (procedural-only visuals hidden behind the GLB) - the
  // exact geometry the owner walked into; see the quality-composition parity
  // gate added this pass.
  const moundAudit: Array<{ id: string; collider: string; bottomY: number }> = [];
  for (const [id, x, z, sx, sz] of [
    // REDESIGN: the mounds move with the boundary - now soft shoulders in the
    // two end gardens, flanking the spawn fences inside the new Z bounds.
    // Cornered tight against boundary + fence junction so the flank corridors
    // (z beyond the fence span) keep >= 2.5 m of walkable width. The first
    // re-seat filled the corridor and sealed the whole rear strip - measured
    // as 4,608 grid cells by the traversal gate before this fix.
    ['west-verge', -36.2, -28.8, 1.6, 2.2],
    ['east-verge', 36.2, 28.8, 1.6, 2.2],
  ] as const) {
    const colliderName = `terrain-mound-${id}-collider`;
    const authority = box(colliderName, [x, 0.55, z], [sx, 1.1, sz], palette.grass, true, false, true, 'earth');
    authority.visible = false;
    authority.userData.collisionAuthorityFor = `terrain-mound-${id}`;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), palette.grass);
    mound.name = `terrain-mound-${id}`;
    mound.position.set(x, 0.28, z);
    mound.scale.set(sx / 2, 0.72, sz / 2);
    mound.castShadow = true;
    mound.receiveShadow = true;
    mound.userData.impactSurface = 'soil';
    mound.userData.collisionAuthority = colliderName;
    world.add(mound);
    moundAudit.push({ id, collider: colliderName, bottomY: -0.44 });
  }
  // DECLUTTER 2026-08-29: the four corner "quality earth banks" (huge
  // ellipsoid splats reaching inside the bounds with tiered colliders) are
  // deleted - the owner called them out by sight. The out-of-bounds ground
  // read is now owned by the forest surround + mountain backdrop modules.
  // DECLUTTER 2026-08-29 (owner: "still ... crowded for a cod style game").
  // The agritech campus layer - trellis garden, greenhouse + hydro beds,
  // reclamation tank, service walls, solar canopy, irrigation vessel and
  // terminals, landmark plinth - is deleted from the playable area wholesale.
  // The reference's yards are OPEN; identity now lives in the houses, the
  // vehicles, the mannequins and the backdrop landmark beyond the boundary
  // (environment-assets moves the atomic sculpture out there).
  world.userData.atomicCollisionAudit = {
    terrainMounds: moundAudit,
  };
  // Lane cover interrupts ordinary combat rays every 12–18 metres. The four
  // outer anchors receive taller collision aligned to recognisable authored
  // cargo/utility assets in the Blender and fallback art layers.
  COVER_LAYOUT.forEach(([x, z, w, d], index) => {
    // Keyed by anchor coordinate, never by array index - see
    // AUTHORED_LARGE_COVER_ANCHORS for why an index broke this silently.
    const id = authoredLargeCoverIdAt(x, z);
    // Owner 2026-08-29/30: the street crates are a jump stairway to the bus
    // roof - outer pair one rise, inner pair two.
    const height = id ? AUTHORED_LARGE_COVER_HEIGHT
      : Math.abs(x) === STREET_CRATE_LOW_X ? STREET_CRATE_HEIGHT
        : Math.abs(x) === STREET_CRATE_TALL_X ? STREET_CRATE_TALL_HEIGHT : 1.6;
    const authoritativeCover = box(`cover ${index}`, [x, height / 2, z], [w, height, d], index % 2 ? palette.coral : palette.aqua);
    if (id) {
      // Keep one simple AABB for movement/projectile authority, but render a
      // recognisable low-cost semantic silhouette on the representative
      // Performance profile instead of a generic coloured block.
      authoritativeCover.visible = false;
      const visual = addPerformanceLargeCover(id, x, z);
      physicalCover.push({
        id,
        bounds: { ...colliders[colliders.length - 1] },
        blocksMovement: true,
        blocksShots: true,
        performanceVisualKind: visual.kind,
        performanceVisualMeshes: visual.meshes,
      });
    }
  });

  // DECLUTTER 2026-08-29: trellis columns, greenhouse walls + shot panes,
  // service wall and solar canopy columns all deleted with their visuals -
  // the whole west/east campus architecture left the playable area. The
  // landmark plinth went with it; the atomic sculpture now stands beyond the
  // boundary as backdrop (environment-assets), where the reference keeps its
  // own tower.

  // Player-sized authored objects need one shared authority contract even when
  // Quality replaces the procedural presentation with its Blender scene.
  const substantialPropColliders: string[] = [];
  const substantial = (name: string, position: [number, number, number], size: [number, number, number], material: BallisticMaterialId) => {
    substantialPropColliders.push(authoredCollisionProxy(name, position, size, material).name);
  };
  // v3: eight yard trees re-seated for the house-per-end anatomy - rear
  // yards, flank verges and one per spawn yard.
  for (const [index, [x, z, scale]] of [
    [-9, -28.5, 1], [9, 28.5, 1], [-33.5, -26, 0.9], [33.5, 26, 0.9],
    [-13, 27.5, 0.85], [13, -27.5, 0.85], [-34.5, 10, 0.9], [34.5, -10, 0.9],
  ].entries()) substantial(`authored-tree-trunk-collider-${index}`, [x, 2 * scale, z], [0.68 * scale, 4 * scale, 0.68 * scale], 'wood');
  // DECLUTTER 2026-08-29: the rear-yard concrete planters keep their visuals
  // (suburban, on-reference) and now carry HONEST authority sized to what a
  // player sees - the old 'terminal' colliders were the wrong story and the
  // wrong size. The flank pair at (+/-24,+/-8) is deleted with its visuals.
  for (const [index, [x, z]] of [[-16, -28.5], [16, 28.5]].entries()) {
    substantial(`authored-planter-collider-${index}`, [x, 0.35, z], [2.2, 0.7, 1.05], 'concrete');
  }
  for (const [index, [x, z]] of [[-30, -8], [30, 8]].entries()) {
    substantial(`authored-extra-lamp-collider-${index}`, [x, 2.8, z], [0.3, 5.6, 0.3], 'structural-metal');
  }
  for (const [index, z] of [-6.5, 6.5].entries()) substantial(`authored-civic-post-collider-${index}`, [0, 3.25, z], [0.32, 6.5, 0.32], 'structural-metal');
  for (const [houseIndex, house] of HOUSE_LAYOUT.entries()) {
    const { x, z, facing } = house;
    const tableX = x - 3;
    const tableZ = z - facing * 2.7;
    substantial(`authored-house-${houseIndex}-dining-collider`, [tableX, 0.62, tableZ], [2.8, 1.24, 1.45], 'wood');
    for (const [chairIndex, [chairX, chairZ]] of [
      [tableX - 1.72, tableZ], [tableX + 1.72, tableZ], [tableX, tableZ - 1.05], [tableX, tableZ + 1.05],
    ].entries()) substantial(`authored-house-${houseIndex}-chair-collider-${chairIndex}`, [chairX, 0.6, chairZ], [0.72, 1.2, 0.72], 'wood');
    const sofaX = x + 3.7;
    const sofaZ = z + facing * 2.7;
    substantial(`authored-house-${houseIndex}-sofa-collider`, [sofaX, 0.85, sofaZ], [3.25, 1.7, 1.3], 'wood');
    substantial(`authored-house-${houseIndex}-kitchen-collider`, [x - 3.75, 1.15, z - facing * 5.25], [6.5, 2.3, 0.85], 'wood');
    substantial(`authored-house-${houseIndex}-coffee-table-collider`, [sofaX - 0.3, 0.36, sofaZ - facing * 1.5], [1.9, 0.72, 0.9], 'wood');
    // A mid-century TV cabinet is furniture-grade timber, not a steel bulkhead:
    // it was silently rated structural-metal (2.15/6.4, near-concrete) by the
    // old default while sitting in the main indoor firefight.
    substantial(`authored-house-${houseIndex}-media-collider`, [x + 3.7, 1.1, z - facing * 3.1], [2.6, 2.2, 0.82], 'wood');
    // Keep the bed out of the upper partition sightline. Its old x + 3.6
    // placement made the dark headboard fill the opening and read as a sealed
    // black door even though the route was physically open.
    substantial(`authored-house-${houseIndex}-upper-bed-collider`, [x + 6.1, 4.0, z - facing * 2.5], [3.2, 1.05, 2.2], 'wood');
    substantial(`authored-house-${houseIndex}-upper-desk-collider`, [x - 3.2, 4.25, z + facing * 2.8], [2.7, 1.65, 0.92], 'wood');
  }
  world.userData.atomicCollisionAudit.substantialProps = substantialPropColliders;

  // Boundary fencing, with substantial visual posts rather than invisible
  // walls. HF-383 remainder: the north/south fences follow ARENA_BOUNDS out
  // to +/-31.5 (fence centreline +/-31.8); the west/east runs lengthen to
  // span the deeper map.
  // REDESIGN 2026-08-29: the boundary fences DERIVE from ARENA_BOUNDS instead
  // of restating them - the exporter learned this lesson in Pass 81 wave 1 and
  // this block was the last restatement left. Side runs overlap the end runs'
  // thickness so the corners lap, same contract as the Blender spec.
  const boundaryHalfX = ARENA_BOUNDS.maxX + 0.3;
  const boundaryHalfZ = ARENA_BOUNDS.maxZ + 0.3;
  const sideFenceLength = ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ + 1.6;
  const endFenceLength = ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX + 1;
  box('west fence', [-boundaryHalfX, 1.5, 0], [0.6, 3, sideFenceLength], palette.timber);
  box('east fence', [boundaryHalfX, 1.5, 0], [0.6, 3, sideFenceLength], palette.timber);
  box('north fence', [0, 1.5, -boundaryHalfZ], [endFenceLength, 3, 0.6], palette.timber);
  box('south fence', [0, 1.5, boundaryHalfZ], [endFenceLength, 3, 0.6], palette.timber);
  // HF-387 player-body half: these posts used to sit at +/-30.9, protruding
  // ~0.5 m into the play space past the world-boundary collider with NO
  // movement authority of their own. The audit marched the real capsule into
  // the boundary and measured the camera eye up to 1.4 cm from the post mesh
  // (stand) and inside its slab when prone/crouched - a near-plane clip the
  // owner reads as "clipping through walls". Posts now sit proud on the
  // outside face of the fence run, fully beyond ARENA_BOUNDS, so visible mass
  // and reachable eye shells agree again. Purely visual relocation; no
  // clearance constant or gameplay value changed.
  const postX = boundaryHalfX + 0.15;
  const postSpan = ARENA_BOUNDS.maxZ - 3.6;
  for (let postIndex = 0; postIndex < 8; postIndex += 1) {
    const z = -postSpan + (postIndex * (2 * postSpan)) / 7;
    box('fence post', [-postX, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
    box('fence post', [postX, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
  }

  function sign(text: string, x: number, y: number, z: number, rotationY = 0): void {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#13242b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f3c34d';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#f6ead6';
    ctx.font = '900 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.65), new THREE.MeshBasicMaterial({ map: texture }));
    board.position.set(x, y, z);
    board.rotation.y = rotationY;
    world.add(board);
  }
  sign('NUKE TOWN', 0, 4.7, -29.9, 0);
  sign('TEST BLOCK 86', 0, 4.7, 29.9, Math.PI);

  function target(id: string, x: number, z: number, team: Team): void {
    const root = new THREE.Group();
    root.name = 'practice-target';
    root.userData.targetId = id;
    root.position.set(x, 0, z);
    const targetMat = team === 0 ? palette.aqua : palette.coral;
    // Named so camera-clip audits can attribute eye-in-geometry hits to the
    // soft practice dummies instead of an anonymous mesh.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 5, 10), targetMat);
    torso.name = `${id}-torso`;
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), palette.cream);
    head.name = `${id}-head`;
    head.position.y = 1.92;
    head.castShadow = true;
    root.add(torso, head);
    root.traverse((child) => { child.userData.targetRoot = root; });
    world.add(root);
    targets.push({ id, root, active: true, respawnAt: 0, scoreValue: 1, distanceBand: 'mid', maxHealth: 1, health: 1 });
  }
  target('north-yard', -20, -20, 1);
  target('north-lane', 18, -6, 1);
  target('south-yard', 20, 20, 0);
  target('south-lane', -18, 6, 0);
  target('mid-coach', 8, 3, 1);
  target('mid-truck', -8, -3, 0);

  // Street lamps and a few decorative trees add depth without texture downloads.
  for (const [x, z] of [[-18, -16], [18, 16], [-26, -2], [26, 2]] as Array<[number, number]>) {
    box('lamp pole', [x, 2.8, z], [0.15, 5.6, 0.15], palette.dark, true, true, true, 'structural-metal');
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffefb5, emissive: 0xffb84d, emissiveIntensity: 2.2 }));
    lamp.position.set(x, 5.55, z);
    world.add(lamp);
  }
  // Original trees and street props are assembled in environment-assets.ts.

  return {
    id: 'atomic-acres',
    label: 'Nuke Town',
    root: world,
    colliders,
    physicsColliders,
    raycastMeshes,
    shotSurfaces,
    patrolPoints: PATROL_LAYOUT.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets,
    houses,
    houseDestruction: Object.freeze({
      definitions: Object.freeze([...houseFragmentDefinitions].sort((left, right) => left.id.localeCompare(right.id))),
      staticColliders: Object.freeze(staticHouseFragmentColliders),
      staticBallisticSurfaceIds: Object.freeze(staticHouseFragmentBallisticSurfaceIds),
    }),
    breakableWindows,
    physicalCover,
    houseTelemetry,
    bounds: { ...ARENA_BOUNDS },
    spawns: {
      0: SPAWN_LAYOUT[0].map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
      1: SPAWN_LAYOUT[1].map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
    },
  };
}
