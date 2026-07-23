import * as THREE from 'three';
import { texturedMaterial } from './art-kit';
import {
  ARENA_BOUNDS,
  COVER_LAYOUT,
  GARAGE_LAYOUT,
  HOUSE_LAYOUT,
  NEIGHBOURHOOD_BENCH_COLLIDER_SIZE,
  NEIGHBOURHOOD_BENCH_LAYOUT,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  PATROL_LAYOUT,
  SPAWN_LAYOUT,
} from './arena-layout';
import { classifyImpactSurface } from './combat-feedback';
import { Box2 } from './collision';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { createHouseArchitecture, HouseSurface, solidBounds, type HouseArchitecture } from './house-navigation';
import { Team } from './protocol';

export type PracticeTarget = {
  id: string;
  root: THREE.Group;
  active: boolean;
  respawnAt: number;
  scoreValue: number;
  distanceBand: 'near' | 'mid' | 'far';
  maxHealth: number;
  health: number;
};
export type BreakableWindow = { id: string; mesh: THREE.Mesh; broken: boolean };
export type ArenaMap = {
  id: 'atomic-acres' | 'rustworks-1v1' | 'gun-range' | 'skyline-terminal';
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
  breakableWindows: BreakableWindow[];
  physicalCover: Array<{
    id: string;
    bounds: Box2;
    blocksMovement: true;
    blocksShots: true;
    performanceVisualKind?: 'cargo-stack' | 'pipe-stack' | 'service-skip' | 'generator-trailer';
    performanceVisualMeshes?: number;
  }>;
  bounds: Box2;
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

export function buildArena(scene: THREE.Scene): ArenaMap {
  const colliders: Box2[] = [];
  const physicsColliders: Box2[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const shotSurfaces: BallisticSurface[] = [];
  let ballisticSurfaceSequence = 0;
  const targets: PracticeTarget[] = [];
  const houses: HouseArchitecture[] = [];
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
    chrome: material(0xaebdc1, 0.23, 0.76),
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
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.userData.impactSurface = classifyImpactSurface({
      name,
      metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : undefined,
    });
    mesh.position.set(...position);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
    const bounds = {
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
      minY: position[1] - size[1] / 2,
      maxY: position[1] + size[1] / 2,
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
    }
    if (solid) {
      colliders.push(bounds);
      physicsColliders.push(bounds);
    }
    return mesh;
  }

  function collisionProxy(name: string, position: [number, number, number], size: [number, number, number]): void {
    const proxy = box(name, position, size, palette.dark, true, false);
    // This simple shell is intentionally visible in Performance so every
    // authoritative route collider has a readable visual counterpart. Quality
    // replaces it with the rounded authored route art in environment-assets.
    proxy.visible = true;
    proxy.userData.collisionProxy = true;
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
    id: 'north-cargo-stack' | 'south-pipe-stack' | 'west-service-skip' | 'east-generator-trailer',
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
      for (const offset of [-1, 1]) addBox('performance-cargo-lower', [x + offset, 0.52, z], [1.85, 1.04, 1.82], offset < 0 ? palette.aqua : palette.mustard);
      addBox('performance-cargo-upper', [x, 1.62, z], [2.15, 1.04, 1.82], palette.aqua);
      for (const offset of [-0.82, 0.82]) addBox('performance-cargo-lock-rail', [x + offset, 1.62, z - 0.93], [0.12, 0.9, 0.08], palette.dark);
      return { kind: 'cargo-stack', meshes };
    }

    if (id === 'south-pipe-stack') {
      for (const offset of [-1.15, 0, 1.15]) addCylinder('performance-concrete-pipe', [x + offset, 0.53, z], 0.52, 1.82, palette.concrete, [Math.PI / 2, 0, 0], true);
      for (const offset of [-0.58, 0.58]) addCylinder('performance-concrete-pipe', [x + offset, 1.52, z], 0.52, 1.82, palette.concrete, [Math.PI / 2, 0, 0], true);
      return { kind: 'pipe-stack', meshes };
    }

    if (id === 'west-service-skip') {
      addBox('performance-skip-floor', [x, 0.18, z], [2.8, 0.28, 4.75], palette.dark);
      for (const offset of [-1.35, 1.35]) addBox('performance-skip-side', [x + offset, 1.02, z], [0.22, 1.72, 4.65], palette.aqua);
      addBox('performance-skip-rear', [x, 1.02, z + 2.3], [2.7, 1.72, 0.22], palette.aqua);
      addBox('performance-skip-front', [x, 0.62, z - 2.3], [2.7, 0.92, 0.22], palette.mustard);
      for (const offset of [-1.35, 1.35]) addBox('performance-skip-top-rail', [x + offset, 1.92, z], [0.28, 0.16, 4.72], palette.mustard);
      return { kind: 'service-skip', meshes };
    }

    addBox('performance-generator-chassis', [x, 0.48, z], [2.8, 0.22, 4.65], palette.dark);
    addBox('performance-generator-body', [x, 1.28, z + 0.28], [2.42, 1.5, 3.05], palette.mustard);
    addBox('performance-generator-panel', [x - 1.23, 1.3, z + 0.28], [0.08, 0.92, 1.75], palette.dark);
    addBox('performance-generator-drawbar', [x, 0.48, z - 2.02], [0.18, 0.18, 1.0], palette.chrome);
    for (const wheelX of [-1.34, 1.34]) for (const wheelZ of [-1.08, 1.08]) {
      addCylinder('performance-generator-wheel', [x + wheelX, 0.48, z + wheelZ], 0.38, 0.24, palette.dark, [0, 0, Math.PI / 2]);
    }
    addCylinder('performance-generator-exhaust', [x + 0.83, 1.75, z + 0.82], 0.1, 0.82, palette.dark, [0, 0, 0]);
    return { kind: 'generator-trailer', meshes };
  }


  const ground = new THREE.Mesh(new THREE.PlaneGeometry(86, 98), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'soil';
  world.add(ground);
  raycastMeshes.push(ground);
  const groundSurface = createBallisticSurface(
    `atomic-acres:${ballisticSurfaceSequence}:ground`,
    'atomic-acres-ground',
    { minX: -43, maxX: 43, minY: -8, maxY: 0, minZ: -49, maxZ: 49 },
    { impactSurface: 'soil', material: 'earth' },
  );
  ballisticSurfaceSequence += 1;
  shotSurfaces.push(groundSurface);
  ground.userData.ballisticSurfaceId = groundSurface.id;

  const road = new THREE.Mesh(new THREE.PlaneGeometry(19, 88), palette.road);
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
    { minX: -9.5, maxX: 9.5, minY: -0.25, maxY: 0.03, minZ: -44, maxZ: 44 },
    { impactSurface: 'concrete', material: 'concrete' },
  );
  ballisticSurfaceSequence += 1;
  shotSurfaces.push(roadSurface);
  road.userData.ballisticSurfaceId = roadSurface.id;
  for (const x of [-10.25, 10.25]) box('curb', [x, 0.12, 0], [1.4, 0.24, 88], palette.concrete, false, false);
  for (const x of [-12.6, 12.6]) box('sidewalk', [x, 0.07, 0], [3.2, 0.14, 88], palette.concrete, false, false);
  for (let z = -38; z <= 38; z += 8) box('lane marker', [0, 0.055, z], [0.18, 0.03, 3.6], palette.mustard, false, false);
  for (const z of [-18, 18]) {
    for (let x = -7.5; x <= 7.5; x += 2.5) box('crosswalk stripe', [x, 0.062, z], [1.4, 0.025, 3.2], palette.white, false, false);
  }

  function addHouse(team: Team, x: number, z: number, facing: 1 | -1): void {
    const architecture = createHouseArchitecture(team, x, z, facing);
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

    for (const solid of architecture.solids) {
      const solidMaterial = wallMaterial(solid);
      if (solid.kind === 'ramp') {
        const rendered = box(solid.name, solid.position, solid.size, solidMaterial, false, true, false);
        if (solid.rotation) rendered.rotation.set(...solid.rotation);
        physicsColliders.push(solidBounds(solid));
        continue;
      }
      const isBreakableGlass = solid.kind === 'glass' && solid.breakable;
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
      if (isBreakableGlass) {
        rendered.userData.breakableWindowId = solid.id;
        rendered.userData.dynamic = true;
        breakableWindows.push({ id: solid.id, mesh: rendered, broken: false });
      }
    }

    // One quiet roof cap is the only exterior dressing. Both ground doors and
    // all three windows come directly from the shared architecture declaration.
    box('simple-house-roof', [x, 7.35, z], [architecture.dimensions.width + 0.6, 0.42, architecture.dimensions.depth + 0.6], palette.roof, false);
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

  // Two large transit anchors create unmistakable physical hard cover through
  // the centre while their detailed authored meshes live in the art layer.
  box('north tour bus', [-3.8, 1.9, 7.2], [5.6, 3.8, 14.2], palette.mustard);
  physicalCover.push({ id: 'north-tour-bus', bounds: { ...colliders[colliders.length - 1] }, blocksMovement: true, blocksShots: true });
  box('coach roof', [-3.8, 3.62, 7], [5.15, 0.25, 13.2], palette.white, false);
  for (const z of [2.6, 6, 9.4, 12.8]) {
    box('coach window', [-6.53, 2.35, z], [0.12, 1.1, 2.3], palette.glass, false, false);
    box('coach window', [-1.07, 2.35, z], [0.12, 1.1, 2.3], palette.glass, false, false);
  }
  for (const z of [2, 12]) {
    for (const x of [-5.7, -1.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.38, 8), palette.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.7, z);
      world.add(wheel);
    }
  }

  box('south shuttle bus', [4.2, 1.75, -8.8], [4.9, 3.5, 10.8], palette.aqua);
  physicalCover.push({ id: 'south-shuttle-bus', bounds: { ...colliders[colliders.length - 1] }, blocksMovement: true, blocksShots: true });
  box('shuttle bus roof', [4.2, 3.62, -8.8], [4.65, 0.25, 10.2], palette.white, false);
  for (const z of [-12.1, -9.9, -7.7, -5.5]) {
    box('shuttle bus window', [1.72, 2.35, z], [0.12, 1.1, 1.55], palette.glass, false, false);
    box('shuttle bus window', [6.68, 2.35, z], [0.12, 1.1, 1.55], palette.glass, false, false);
  }

  // Garages and backyard flow lanes deliberately differ from the copyrighted map.
  const [northGarage, southGarage] = GARAGE_LAYOUT;
  box('north garage', [northGarage.x, 1.7, northGarage.z], [12, 3.4, 6.5], palette.cream);
  box('south garage', [southGarage.x, 1.7, southGarage.z], [12, 3.4, 6.5], palette.cream);
  // These read as closed, opaque doors, so movement and projectile authority
  // must match the facade instead of relying on the slightly recessed shell.
  box('garage door', [northGarage.x, 1.55, northGarage.z + 3.3], [9, 2.7, 0.18], palette.chrome, true, false, true);
  box('garage door', [southGarage.x, 1.55, southGarage.z - 3.3], [9, 2.7, 0.18], palette.chrome, true, false, true);

  // Original east-lane landmark doubles as readable hard cover; decorative rings are added by environment-assets.
  box('atomic landmark plinth', [27, 0.38, -1.5], [5.8, 0.76, 5.8], palette.concrete);

  // Pass 59 collision audit objects: visible soft terrain keeps conservative AABB
  // movement/ballistic authority, and the irrigation vessel has matching hard cover.
  const moundAudit: Array<{ id: string; collider: string; bottomY: number }> = [];
  for (const [id, x, z, sx, sz] of [
    ['west-verge', -28, 10, 4.6, 3.4],
    ['east-verge', 28, 18, 4.2, 3.8],
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
  const vesselCollider = box('east-irrigation-vessel-collider', [27, 1.65, 28], [3.8, 3.3, 3.8], palette.chrome, true, false, true, 'structural-metal');
  vesselCollider.visible = false;
  vesselCollider.userData.collisionAuthorityFor = 'east-irrigation-vessel';
  const irrigationVessel = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 3.3, 20), palette.chrome);
  irrigationVessel.name = 'east-irrigation-vessel';
  irrigationVessel.position.set(27, 1.65, 28);
  irrigationVessel.castShadow = true;
  irrigationVessel.receiveShadow = true;
  irrigationVessel.userData.impactSurface = 'metal';
  irrigationVessel.userData.collisionAuthority = vesselCollider.name;
  world.add(irrigationVessel);
  world.userData.atomicCollisionAudit = {
    terrainMounds: moundAudit,
    largeCylinder: { id: irrigationVessel.name, collider: vesselCollider.name, bottomY: 0 },
  };
  // Lane cover interrupts ordinary combat rays every 12–18 metres. The four
  // outer anchors receive taller collision aligned to recognisable authored
  // cargo/utility assets in the Blender and fallback art layers.
  const authoredLargeCoverIds = new Map<number, string>([
    [4, 'north-cargo-stack'],
    [5, 'south-pipe-stack'],
    [6, 'west-service-skip'],
    [7, 'east-generator-trailer'],
  ]);
  COVER_LAYOUT.forEach(([x, z, w, d], index) => {
    const height = authoredLargeCoverIds.has(index) ? 2.2 : 1.6;
    const authoritativeCover = box(`cover ${index}`, [x, height / 2, z], [w, height, d], index % 2 ? palette.coral : palette.aqua);
    const id = authoredLargeCoverIds.get(index);
    if (id) {
      // Keep one simple AABB for movement/projectile authority, but render a
      // recognisable low-cost semantic silhouette on the representative
      // Performance profile instead of a generic coloured block.
      authoritativeCover.visible = false;
      const visual = addPerformanceLargeCover(id as Parameters<typeof addPerformanceLargeCover>[0], x, z);
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

  // Route-shaping collision proxies for three distinct lanes. Rounded visual shells live in environment-assets.ts.
  for (const x of [-29, -22]) for (const z of [-15, -5]) collisionProxy('skyline trellis column', [x, 1.9, z], [0.55, 3.8, 0.55]);
  // The Blender hydroponics landmark is an open frame with beds rather than a full-height perimeter.
  // Older west/east/north/south proxy walls created an unseen enclosure; keep those routes open.
  collisionProxy('service wall west', [22.5, 0.75, 9], [0.7, 1.5, 10]);
  collisionProxy('service wall east', [28.5, 0.75, 9], [0.7, 1.5, 10]);
  for (const x of [22.5, 29.5]) for (const z of [-20, -12]) collisionProxy('solar canopy column', [x, 2.1, z], [0.6, 4.2, 0.6]);

  // Boundary fencing, with substantial visual posts rather than invisible walls.
  box('west fence', [-34.3, 1.5, 0], [0.6, 3, 88], palette.timber);
  box('east fence', [34.3, 1.5, 0], [0.6, 3, 88], palette.timber);
  box('north fence', [0, 1.5, -43.3], [69, 3, 0.6], palette.timber);
  box('south fence', [0, 1.5, 43.3], [69, 3, 0.6], palette.timber);
  for (let z = -39; z <= 39; z += 6.5) {
    box('fence post', [-33.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
    box('fence post', [33.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
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
  sign('ATOMIC ACRES', 0, 4.7, -42.9, 0);
  sign('TEST BLOCK 86', 0, 4.7, 42.9, Math.PI);

  function target(id: string, x: number, z: number, team: Team): void {
    const root = new THREE.Group();
    root.name = 'practice-target';
    root.userData.targetId = id;
    root.position.set(x, 0, z);
    const targetMat = team === 0 ? palette.aqua : palette.coral;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 5, 10), targetMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), palette.cream);
    head.position.y = 1.92;
    head.castShadow = true;
    root.add(torso, head);
    root.traverse((child) => { child.userData.targetRoot = root; });
    world.add(root);
    targets.push({ id, root, active: true, respawnAt: 0, scoreValue: 1, distanceBand: 'mid', maxHealth: 1, health: 1 });
  }
  target('north-yard', -20, -34, 1);
  target('north-lane', 18, -12, 1);
  target('south-yard', 20, 34, 0);
  target('south-lane', -18, 12, 0);
  target('mid-coach', 8, 4, 1);
  target('mid-truck', -8, -6, 0);

  // Street lamps and a few decorative trees add depth without texture downloads.
  for (const [x, z] of [[-13, -16], [13, 16], [-13, 22], [13, -22]] as Array<[number, number]>) {
    box('lamp pole', [x, 2.8, z], [0.15, 5.6, 0.15], palette.dark, true, true, true, 'structural-metal');
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffefb5, emissive: 0xffb84d, emissiveIntensity: 2.2 }));
    lamp.position.set(x, 5.55, z);
    world.add(lamp);
  }
  // Original trees and street props are assembled in environment-assets.ts.

  return {
    id: 'atomic-acres',
    label: 'Atomic Acres',
    root: world,
    colliders,
    physicsColliders,
    raycastMeshes,
    shotSurfaces,
    patrolPoints: PATROL_LAYOUT.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets,
    houses,
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
