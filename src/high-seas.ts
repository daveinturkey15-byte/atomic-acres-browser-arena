import * as THREE from 'three';
import {
  createBallisticSurface,
  type BallisticMaterialId,
  type BallisticSurface,
} from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';
import type { ArenaVerticalNavigation } from './vertical-navigation';

export const HIGH_SEAS_LEVELS = Object.freeze({
  engine: 0,
  mainDeck: 3.2,
  upperDeck: 6.2,
  roof: 8.92,
  ocean: -2.2,
});

/** Below the keel and waterline; playable engine support is authored explicitly. */
export const HIGH_SEAS_SAFETY_FLOOR_Y = -6;

export const HIGH_SEAS_BOUNDS: Box2 = Object.freeze({
  minX: -12,
  maxX: 12,
  minZ: -44,
  maxZ: 44,
});

export const HIGH_SEAS_ENGINE_ACCESS = Object.freeze({
  width: 2.6,
  run: 4.1,
  rise: HIGH_SEAS_LEVELS.mainDeck,
  bowFoot: [0, HIGH_SEAS_LEVELS.engine, -20.15] as const,
  bowTop: [0, HIGH_SEAS_LEVELS.mainDeck, -24.25] as const,
  sternFoot: [0, HIGH_SEAS_LEVELS.engine, 20.15] as const,
  sternTop: [0, HIGH_SEAS_LEVELS.mainDeck, 24.25] as const,
});

export type HighSeasArenaMap = Omit<ArenaMap, 'id'> & { id: 'high-seas' };

export type HighSeasRouteAnchor = Readonly<{
  id: string;
  /** Feet-space position. Player eye height is added by the movement layer. */
  position: readonly [number, number, number];
}>;

export type HighSeasPortal = Readonly<{
  id: string;
  purpose: 'movement' | 'sightline' | 'engine-access';
  aperture: Readonly<Required<Pick<Box2, 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ'>>>;
}>;

type AuthorityEntry = Readonly<{
  name: string;
  bounds: Box2;
  mesh: THREE.Mesh;
  solid: boolean;
  shots: boolean;
  ballisticSurfaceId: string | null;
  externalPhysicsAuthority: string | null;
}>;

type WalkableAuthority = Readonly<{
  id: string;
  presentationName: string;
  bounds: Box2;
  y: number;
  navigation: 'bot' | 'player-only';
  ballisticSurfaceId: string;
}>;

type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  shotSurfaces: BallisticSurface[];
  physicalCover: ArenaMap['physicalCover'];
  authorities: AuthorityEntry[];
  walkable: WalkableAuthority[];
  ballisticSurfaceSequence: number;
};

type BoxOptions = {
  solid?: boolean;
  shots?: boolean;
  cover?: boolean;
  rotation?: [number, number, number];
  cast?: boolean;
  detail?: 'core' | 'performance' | 'quality';
  ballisticMaterial?: BallisticMaterialId;
  externalPhysicsAuthority?: string;
  walkable?: Readonly<{
    id: string;
    elevation: number;
    navigation: 'bot' | 'player-only';
  }>;
};

const DECK_THICKNESS = 0.28;
const CABIN_HALF_WIDTH = 7.4;
const CABIN_GROUND_WALL_HEIGHT = 2.68;
const CABIN_UPPER_WALL_HEIGHT = 2.6;
const RAMP_THICKNESS = 0.18;

function material(
  name: string,
  color: number,
  roughness: number,
  metalness: number,
  emissive = 0,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
  value.name = `high-seas-${name}`;
  value.userData.assetOwner = 'high-seas';
  value.userData.assetKind = 'procedural-original-material';
  return value;
}

function containedWaterMaterial(name: string, color: number): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    metalness: 0.28,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  value.name = `high-seas-${name}`;
  value.userData.assetOwner = 'high-seas';
  value.userData.assetKind = 'contained-presentation-water';
  value.userData.waterScope = 'contained-feature-only';
  return value;
}

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  mesh.userData.assetOwner = 'high-seas';
  mesh.userData.assetKind = 'procedural-original-geometry';
  mesh.userData.highSeasDetail = options.detail ?? 'core';
  mesh.userData.impactSurface = classifyImpactSurface({
    name,
    metalness: meshMaterial instanceof THREE.MeshStandardMaterial ? meshMaterial.metalness : undefined,
  });
  builder.root.add(mesh);

  const solid = options.solid !== false;
  const shots = options.shots ?? solid;
  const bounds: Box2 = {
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
    ...(options.rotation ? { rotation: options.rotation } : {}),
  };

  let ballisticSurfaceId: string | null = null;
  if (shots) {
    builder.raycastMeshes.push(mesh);
    const surface = createBallisticSurface(
      `high-seas:${builder.ballisticSurfaceSequence}:${name}`,
      name,
      bounds,
      {
        impactSurface: mesh.userData.impactSurface as ReturnType<typeof classifyImpactSurface>,
        material: options.ballisticMaterial ?? 'reinforced',
      },
    );
    builder.ballisticSurfaceSequence += 1;
    builder.shotSurfaces.push(surface);
    ballisticSurfaceId = surface.id;
    mesh.userData.ballisticSurfaceId = surface.id;
    mesh.userData.ballisticMaterial = surface.material;
  } else {
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.highSeasPresentationOnly = true;
    mesh.raycast = () => undefined;
  }

  if (solid) {
    builder.colliders.push(bounds);
    builder.physicsColliders.push(bounds);
    mesh.userData.collisionAuthority = name;
  }
  if (options.cover) {
    if (!solid || !shots) throw new Error(`High Seas cover ${name} must block both movement and shots`);
    builder.physicalCover.push({
      id: name,
      bounds,
      blocksMovement: true,
      blocksShots: true,
    });
  }
  if (options.walkable) {
    if (!solid || !ballisticSurfaceId) throw new Error(`High Seas platform ${name} requires shared authority`);
    builder.walkable.push({
      id: options.walkable.id,
      presentationName: name,
      bounds,
      y: options.walkable.elevation,
      navigation: options.walkable.navigation,
      ballisticSurfaceId,
    });
  }
  builder.authorities.push({
    name,
    bounds,
    mesh,
    solid,
    shots,
    ballisticSurfaceId,
    externalPhysicsAuthority: options.externalPhysicsAuthority ?? null,
  });
  return mesh;
}

function detailBox(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  rotation?: [number, number, number],
  detail: 'performance' | 'quality' = 'performance',
): THREE.Mesh {
  return box(builder, name, position, size, meshMaterial, {
    solid: false,
    shots: false,
    rotation,
    cast: detail === 'quality',
    detail,
  });
}

function coverBox(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  ballisticMaterial: BallisticMaterialId,
  rotation?: [number, number, number],
): THREE.Mesh {
  return box(builder, name, position, size, meshMaterial, {
    cover: true,
    rotation,
    ballisticMaterial,
  });
}

function presentationMesh(
  builder: Builder,
  name: string,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  detail: 'performance' | 'quality' = 'performance',
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = detail === 'quality';
  mesh.receiveShadow = true;
  mesh.userData.assetOwner = 'high-seas';
  mesh.userData.assetKind = 'procedural-original-geometry';
  mesh.userData.highSeasDetail = detail;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.userData.highSeasPresentationOnly = true;
  mesh.raycast = () => undefined;
  builder.root.add(mesh);
  return mesh;
}

function addWalkableBox(
  builder: Builder,
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  elevation: number,
  navigation: 'bot' | 'player-only',
): THREE.Mesh {
  return box(builder, `high-seas-platform-${id}`, position, size, meshMaterial, {
    ballisticMaterial: 'structural-metal',
    walkable: { id, elevation, navigation },
  });
}

function addRamp(
  builder: Builder,
  id: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  width: number,
  meshMaterial: THREE.Material,
  ballisticMaterial: BallisticMaterialId,
): Readonly<{
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  angleDegrees: number;
}> {
  const deltaX = to[0] - from[0];
  const deltaZ = to[2] - from[2];
  if (Math.abs(deltaX) > 1e-6) throw new Error(`High Seas ramp ${id} must remain Z-aligned`);
  const run = Math.abs(deltaZ);
  const rise = to[1] - from[1];
  const angle = Math.atan2(rise, run);
  const rotationX = -Math.sign(deltaZ) * angle;
  const length = Math.hypot(run, rise);
  const position: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2 - Math.cos(angle) * RAMP_THICKNESS / 2,
    (from[2] + to[2]) / 2,
  ];
  const size: [number, number, number] = [width, RAMP_THICKNESS, length];
  const rotation: [number, number, number] = [rotationX, 0, 0];
  const ramp = box(builder, `high-seas-ramp-${id}`, position, size, meshMaterial, {
    rotation,
    ballisticMaterial,
  });
  ramp.userData.highSeasRampId = id;
  ramp.userData.rampFrom = [...from];
  ramp.userData.rampTo = [...to];
  return { position, size, rotation, angleDegrees: THREE.MathUtils.radToDeg(angle) };
}

function addRampTreads(
  builder: Builder,
  id: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  width: number,
  treadMaterial: THREE.Material,
): void {
  for (let step = 1; step <= 10; step += 1) {
    const progress = step / 11;
    detailBox(
      builder,
      `high-seas-${id}-tread-${step}`,
      [
        THREE.MathUtils.lerp(from[0], to[0], progress),
        THREE.MathUtils.lerp(from[1], to[1], progress) + 0.035,
        THREE.MathUtils.lerp(from[2], to[2], progress),
      ],
      [width - 0.16, 0.055, 0.22],
      treadMaterial,
    );
  }
}

function createHullGeometry(): THREE.BufferGeometry {
  const rings = [
    { z: -44.0, width: 1.25, chine: 0.88, keel: -4.5 },
    { z: -41.0, width: 5.4, chine: 4.15, keel: -5.25 },
    { z: -40.45, width: 10.3, chine: 7.65, keel: -5.48 },
    { z: -36.5, width: 10.25, chine: 7.7, keel: -5.7 },
    { z: 35.5, width: 10.35, chine: 7.8, keel: -5.75 },
    { z: 42.2, width: 9.65, chine: 7.2, keel: -5.15 },
    { z: 43.5, width: 10.35, chine: 7.55, keel: -4.85 },
    { z: 44.0, width: 8.3, chine: 6.1, keel: -4.6 },
  ] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    const v = ringIndex / (rings.length - 1);
    for (const [x, y, u] of [
      [-ring.width, 2.9, 0],
      [-ring.chine, -1.8, 0.25],
      [0, ring.keel, 0.5],
      [ring.chine, -1.8, 0.75],
      [ring.width, 2.9, 1],
    ] as const) {
      positions.push(x, y, ring.z);
      uvs.push(u, v);
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const start = ringIndex * 5;
    const next = start + 5;
    for (let strip = 0; strip < 4; strip += 1) {
      if (strip < 2) {
        indices.push(start + strip, next + strip + 1, next + strip);
        indices.push(start + strip, start + strip + 1, next + strip + 1);
      } else {
        indices.push(start + strip, next + strip, next + strip + 1);
        indices.push(start + strip, next + strip + 1, start + strip + 1);
      }
    }
  }
  indices.push(0, 2, 1, 0, 3, 2, 0, 4, 3);
  const stern = (rings.length - 1) * 5;
  indices.push(stern, stern + 1, stern + 2, stern, stern + 2, stern + 3, stern, stern + 3, stern + 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addDecks(builder: Builder, deckMaterial: THREE.Material): void {
  const centerY = HIGH_SEAS_LEVELS.mainDeck - DECK_THICKNESS / 2;
  const add = (id: string, x: number, z: number, width: number, depth: number): void => {
    addWalkableBox(
      builder,
      id,
      [x, centerY, z],
      [width, DECK_THICKNESS, depth],
      deckMaterial,
      HIGH_SEAS_LEVELS.mainDeck,
      'bot',
    );
  };

  add('bow-tip', 0, -42.25, 8.0, 3.5);
  add('bow-shoulder', 0, -39.0, 20.8, 3.0);
  add('bow-spawn', 0, -33.25, 20.8, 8.5);
  add('bow-cabin-forward', 0, -26.775, 20.8, 4.45);
  add('bow-hatch-port', -5.975, -22.15, 8.85, 4.8);
  add('bow-hatch-starboard', 5.975, -22.15, 8.85, 4.8);
  add('bow-cabin-aft', 0, -16.375, 20.8, 6.75);
  add('center', 0, 0, 20.8, 26);
  add('stern-cabin-forward', 0, 16.375, 20.8, 6.75);
  add('stern-hatch-port', -5.975, 22.15, 8.85, 4.8);
  add('stern-hatch-starboard', 5.975, 22.15, 8.85, 4.8);
  add('stern-cabin-aft', 0, 26.775, 20.8, 4.45);
  add('stern-spawn', 0, 36.25, 20.8, 14.5);
  add('port-viewing-catwalk', -11.0, 0, 1.5, 22);
}

function addUpperFloor(
  builder: Builder,
  prefix: 'bow' | 'stern',
  stairX: number,
  holeMinZ: number,
  holeMaxZ: number,
  cabinMinZ: number,
  cabinMaxZ: number,
  deckMaterial: THREE.Material,
): void {
  const holeMinX = stairX - 1.05;
  const holeMaxX = stairX + 1.05;
  const centerY = HIGH_SEAS_LEVELS.upperDeck - DECK_THICKNESS / 2;
  const add = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): void => {
    if (maxX - minX <= 0 || maxZ - minZ <= 0) return;
    addWalkableBox(
      builder,
      `${prefix}-upper-${id}`,
      [(minX + maxX) / 2, centerY, (minZ + maxZ) / 2],
      [maxX - minX, DECK_THICKNESS, maxZ - minZ],
      deckMaterial,
      HIGH_SEAS_LEVELS.upperDeck,
      'bot',
    );
  };
  add('port', -CABIN_HALF_WIDTH, holeMinX, cabinMinZ, cabinMaxZ);
  add('starboard', holeMaxX, CABIN_HALF_WIDTH, cabinMinZ, cabinMaxZ);
  add('stair-forward', holeMinX, holeMaxX, cabinMinZ, holeMinZ);
  add('stair-aft', holeMinX, holeMaxX, holeMaxZ, cabinMaxZ);
}

function addSplitEndWall(
  builder: Builder,
  name: string,
  z: number,
  centerX: number,
  openingWidth: number,
  y: number,
  height: number,
  wallMaterial: THREE.Material,
): void {
  const openingMin = centerX - openingWidth / 2;
  const openingMax = centerX + openingWidth / 2;
  const leftWidth = openingMin + CABIN_HALF_WIDTH;
  const rightWidth = CABIN_HALF_WIDTH - openingMax;
  if (leftWidth > 0) {
    box(builder, `${name}-port`, [-CABIN_HALF_WIDTH + leftWidth / 2, y, z], [leftWidth, height, 0.22], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
  }
  if (rightWidth > 0) {
    box(builder, `${name}-starboard`, [openingMax + rightWidth / 2, y, z], [rightWidth, height, 0.22], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
  }
}

function addCabin(
  builder: Builder,
  end: 'bow' | 'stern',
  wallMaterial: THREE.Material,
  deckMaterial: THREE.Material,
  roofMaterial: THREE.Material,
  stairMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  glassMaterial: THREE.Material,
): Readonly<{
  internalRoute: HighSeasRouteAnchor[];
  externalRoute: HighSeasRouteAnchor[];
  internalAccess: ReturnType<typeof addRamp>;
  externalAccess: ReturnType<typeof addRamp>;
}> {
  const direction = end === 'bow' ? -1 : 1;
  const minZ = end === 'bow' ? -29 : 13;
  const maxZ = end === 'bow' ? -13 : 29;
  const innerZ = direction * 13;
  const outerZ = direction * 29;
  const centerZ = direction * 21;
  const internalX = direction < 0 ? 4.6 : -4.6;
  const externalX = -internalX;
  const groundY = HIGH_SEAS_LEVELS.mainDeck + CABIN_GROUND_WALL_HEIGHT / 2;
  const upperY = HIGH_SEAS_LEVELS.upperDeck + CABIN_UPPER_WALL_HEIGHT / 2;

  addSplitEndWall(builder, `high-seas-${end}-ground-inner-wall`, innerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);
  addSplitEndWall(builder, `high-seas-${end}-ground-outer-wall`, outerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);

  const doorMinZ = centerZ - 1.6;
  const doorMaxZ = centerZ + 1.6;
  for (const [side, x] of [['port', -CABIN_HALF_WIDTH], ['starboard', CABIN_HALF_WIDTH]] as const) {
    const firstDepth = doorMinZ - minZ;
    const secondDepth = maxZ - doorMaxZ;
    if (firstDepth > 0) {
      box(builder, `high-seas-${end}-ground-${side}-wall-forward`, [x, groundY, minZ + firstDepth / 2], [0.22, CABIN_GROUND_WALL_HEIGHT, firstDepth], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
    if (secondDepth > 0) {
      box(builder, `high-seas-${end}-ground-${side}-wall-aft`, [x, groundY, doorMaxZ + secondDepth / 2], [0.22, CABIN_GROUND_WALL_HEIGHT, secondDepth], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
  }

  const internalLow: readonly [number, number, number] = [internalX, HIGH_SEAS_LEVELS.mainDeck, direction * 15.9];
  const internalHigh: readonly [number, number, number] = [internalX, HIGH_SEAS_LEVELS.upperDeck, direction * 20.7];
  const holeMinZ = Math.min(internalLow[2], internalHigh[2]) - 0.55;
  const holeMaxZ = Math.max(internalLow[2], internalHigh[2]) + 0.55;
  addUpperFloor(builder, end, internalX, holeMinZ, holeMaxZ, minZ, maxZ, deckMaterial);
  const internalAccess = addRamp(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, stairMaterial, 'wood');
  addRampTreads(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, trimMaterial);

  const externalLow: readonly [number, number, number] = [externalX, HIGH_SEAS_LEVELS.mainDeck, direction * 33.9];
  const externalHigh: readonly [number, number, number] = [externalX, HIGH_SEAS_LEVELS.upperDeck, direction * 29.1];
  const externalAccess = addRamp(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, stairMaterial, 'wood');
  addRampTreads(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, trimMaterial);

  // Upper inner windows are true apertures: the sill, header and side wall pieces
  // frame empty space rather than hiding an opaque blocker behind glass.
  addSplitEndWall(builder, `high-seas-${end}-upper-inner-wall`, innerZ, 0, 4.4, upperY, CABIN_UPPER_WALL_HEIGHT, wallMaterial);
  box(builder, `high-seas-${end}-upper-window-sill`, [0, 6.43, innerZ], [4.4, 0.46, 0.22], wallMaterial, {
    ballisticMaterial: 'interior-wall',
  });
  box(builder, `high-seas-${end}-upper-window-header`, [0, 8.53, innerZ], [4.4, 0.54, 0.22], wallMaterial, {
    ballisticMaterial: 'interior-wall',
  });
  addSplitEndWall(builder, `high-seas-${end}-upper-outer-wall`, outerZ, externalX, 2.3, upperY, CABIN_UPPER_WALL_HEIGHT, wallMaterial);

  // Side upper-storey glazing is decorative and never occupies a movement portal.
  for (const [side, x, glassRotation] of [
    ['port', -CABIN_HALF_WIDTH - 0.015, [0, Math.PI / 2, 0] as [number, number, number]],
    ['starboard', CABIN_HALF_WIDTH + 0.015, [0, Math.PI / 2, 0] as [number, number, number]],
  ] as const) {
    for (const zOffset of [-4.5, 0, 4.5]) {
      detailBox(builder, `high-seas-${end}-upper-${side}-window-${zOffset}`, [x, 7.55, centerZ + zOffset], [0.04, 1.18, 2.6], glassMaterial, glassRotation);
    }
    for (const segmentCenter of [centerZ - 6.4, centerZ - 2.25, centerZ + 2.25, centerZ + 6.4]) {
      box(builder, `high-seas-${end}-upper-${side}-mullion-${segmentCenter}`, [x, upperY, segmentCenter], [0.18, CABIN_UPPER_WALL_HEIGHT, 0.28], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
  }

  box(builder, `high-seas-${end}-cabin-roof`, [0, HIGH_SEAS_LEVELS.roof - 0.1, centerZ], [15.4, 0.2, 16.6], roofMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  detailBox(builder, `high-seas-${end}-roof-teal-inlay`, [0, HIGH_SEAS_LEVELS.roof + 0.015, centerZ], [10.8, 0.035, 10.6], trimMaterial);

  // Collision-backed interior furniture gives each cabin useful cover without
  // sealing the central entrances or either exterior side door.
  coverBox(builder, `high-seas-${end}-galley-island`, [0, 3.76, direction * 16.4], [3.4, 1.12, 1.05], trimMaterial, 'structural-metal');
  coverBox(builder, `high-seas-${end}-side-locker-port`, [-6.1, 3.83, direction * 24.6], [1.55, 1.26, 2.3], wallMaterial, 'interior-wall');
  coverBox(builder, `high-seas-${end}-side-locker-starboard`, [6.1, 3.83, direction * 24.6], [1.55, 1.26, 2.3], wallMaterial, 'interior-wall');

  for (const mastX of [-2.2, 2.2]) {
    presentationMesh(
      builder,
      `high-seas-${end}-roof-antenna-${mastX}`,
      new THREE.CylinderGeometry(0.055, 0.08, 1.4, 8),
      trimMaterial,
      [mastX, 9.62, centerZ],
      [0, 0, 0],
      'quality',
    );
  }
  presentationMesh(
    builder,
    `high-seas-${end}-roof-radome`,
    new THREE.SphereGeometry(0.58, 16, 10),
    roofMaterial,
    [0, 9.36, centerZ],
    [0, 0, 0],
    'quality',
  );

  return {
    internalRoute: [
      { id: `${end}-internal-main`, position: internalLow },
      { id: `${end}-internal-mid`, position: [internalX, 4.7, direction * 18.3] },
      { id: `${end}-internal-upper`, position: internalHigh },
      { id: `${end}-upper-room`, position: [0, HIGH_SEAS_LEVELS.upperDeck, centerZ] },
    ],
    externalRoute: [
      { id: `${end}-external-main`, position: externalLow },
      { id: `${end}-external-mid`, position: [externalX, 4.7, direction * 31.5] },
      { id: `${end}-external-upper`, position: externalHigh },
      { id: `${end}-upper-room`, position: [0, HIGH_SEAS_LEVELS.upperDeck, centerZ] },
    ],
    internalAccess,
    externalAccess,
  };
}

function addEngineRoom(
  builder: Builder,
  floorMaterial: THREE.Material,
  wallMaterial: THREE.Material,
  machineryMaterial: THREE.Material,
  accentMaterial: THREE.Material,
): Readonly<{
  bow: ReturnType<typeof addRamp>;
  stern: ReturnType<typeof addRamp>;
}> {
  addWalkableBox(
    builder,
    'engine-floor',
    [0, -0.06, 0],
    [5.8, 0.12, 40.2],
    floorMaterial,
    HIGH_SEAS_LEVELS.engine,
    'bot',
  ).castShadow = false;

  for (const x of [-3.02, 3.02]) {
    box(builder, `high-seas-engine-corridor-wall-${x}`, [x, 1.42, 0], [0.24, 2.84, 40.2], wallMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  const bow = addRamp(
    builder,
    'bow-engine-access',
    HIGH_SEAS_ENGINE_ACCESS.bowFoot,
    HIGH_SEAS_ENGINE_ACCESS.bowTop,
    HIGH_SEAS_ENGINE_ACCESS.width,
    floorMaterial,
    'structural-metal',
  );
  const stern = addRamp(
    builder,
    'stern-engine-access',
    HIGH_SEAS_ENGINE_ACCESS.sternFoot,
    HIGH_SEAS_ENGINE_ACCESS.sternTop,
    HIGH_SEAS_ENGINE_ACCESS.width,
    floorMaterial,
    'structural-metal',
  );

  for (const [end, z] of [['bow', -22.15], ['stern', 22.15]] as const) {
    for (const x of [-1.52, 1.52]) {
      box(builder, `high-seas-${end}-hatch-guard-${x}`, [x, 3.72, z], [0.12, 1.04, 4.7], accentMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
    box(builder, `high-seas-${end}-hatch-end-guard`, [0, 3.72, end === 'bow' ? -19.72 : 19.72], [3.1, 1.04, 0.12], accentMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  for (const [index, z] of [-13.2, -7.1, 0, 7.1, 13.2].entries()) {
    const x = index % 2 === 0 ? -2.15 : 2.15;
    coverBox(builder, `high-seas-engine-machinery-${index}`, [x, 0.72, z], [1.18, 1.44, 2.15], machineryMaterial, 'structural-metal');
    detailBox(builder, `high-seas-engine-machinery-band-${index}`, [x, 1.02, z], [1.24, 0.1, 2.2], accentMaterial);
  }
  for (const x of [-2.62, 2.62]) {
    presentationMesh(
      builder,
      `high-seas-engine-service-pipe-${x}`,
      new THREE.CylinderGeometry(0.12, 0.12, 36, 10),
      accentMaterial,
      [x, 2.42, 0],
      [Math.PI / 2, 0, 0],
    );
  }
  for (const z of [-16, -8, 0, 8, 16]) {
    detailBox(builder, `high-seas-engine-emissive-strip-${z}`, [0, 2.76, z], [2.2, 0.055, 0.14], accentMaterial);
  }
  return { bow, stern };
}

function addCenterFeatures(
  builder: Builder,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  upholsteryMaterial: THREE.Material,
  waterMaterial: THREE.Material,
): void {
  const tubCenterX = -5.45;
  const tubRadius = 2.55;
  for (let index = 0; index < 12; index += 1) {
    if (index === 0 || index === 6) continue;
    const theta = index * Math.PI * 2 / 12;
    coverBox(
      builder,
      `high-seas-hot-tub-rim-${index}`,
      [tubCenterX + Math.cos(theta) * tubRadius, 3.67, Math.sin(theta) * tubRadius],
      [1.38, 0.9, 0.34],
      wallMaterial,
      'reinforced',
      [0, theta - Math.PI / 2, 0],
    );
  }
  const tubWater = presentationMesh(
    builder,
    'high-seas-hot-tub-contained-water',
    new THREE.CircleGeometry(2.15, 32),
    waterMaterial,
    [tubCenterX, 3.28, 0],
    [-Math.PI / 2, 0, 0],
  );
  tubWater.userData.waterScope = 'contained-feature-only';
  tubWater.userData.containedWaterFeature = 'hot-tub';

  coverBox(builder, 'high-seas-shower-port-partition', [-1.08, 4.22, -1.15], [0.2, 2.04, 3.7], wallMaterial, 'interior-wall');
  coverBox(builder, 'high-seas-shower-starboard-partition', [1.08, 4.22, 1.15], [0.2, 2.04, 3.7], wallMaterial, 'interior-wall');
  detailBox(builder, 'high-seas-shower-canopy', [0, 5.35, 0], [3.2, 0.18, 5.8], trimMaterial);

  box(builder, 'high-seas-cabana-roof', [6.55, 5.48, 0], [6.1, 0.2, 8.0], wallMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  for (const x of [3.75, 9.35]) {
    for (const z of [-3.65, 3.65]) {
      box(builder, `high-seas-cabana-post-${x}-${z}`, [x, 4.34, z], [0.18, 2.28, 0.18], trimMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
  }
  coverBox(builder, 'high-seas-cabana-bench-forward', [6.55, 3.66, -3.0], [4.15, 0.92, 0.88], upholsteryMaterial, 'interior-wall');
  coverBox(builder, 'high-seas-cabana-bench-aft', [6.55, 3.66, 3.0], [4.15, 0.92, 0.88], upholsteryMaterial, 'interior-wall');
  detailBox(builder, 'high-seas-cabana-table', [6.55, 3.62, 0], [1.8, 0.82, 1.15], trimMaterial);
}

function addSpawnFeatures(
  builder: Builder,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  waterMaterial: THREE.Material,
): void {
  const landingRing = presentationMesh(
    builder,
    'high-seas-bow-emergency-circle',
    new THREE.RingGeometry(2.7, 2.94, 48),
    trimMaterial,
    [0, 3.215, -35.8],
    [-Math.PI / 2, 0, 0],
  );
  landingRing.userData.markingLanguage = 'original-unbranded-emergency-circle';
  for (const [index, rotationY] of [0, Math.PI / 3, -Math.PI / 3].entries()) {
    detailBox(builder, `high-seas-bow-circle-spoke-${rotationY}`, [0, 3.22 + index * 0.007, -35.8], [0.16, 0.025, 4.8], trimMaterial, [0, rotationY, 0]);
  }
  box(builder, 'high-seas-bow-canopy', [0, 5.66, -31.2], [7.4, 0.24, 3.2], wallMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  for (const x of [-3.25, 3.25]) {
    box(builder, `high-seas-bow-canopy-post-${x}`, [x, 4.42, -31.2], [0.2, 2.48, 0.2], trimMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  const poolWater = presentationMesh(
    builder,
    'high-seas-stern-pool-contained-water',
    new THREE.PlaneGeometry(5.35, 4.55),
    waterMaterial,
    [0, 3.27, 36.0],
    [-Math.PI / 2, 0, 0],
  );
  poolWater.userData.waterScope = 'contained-feature-only';
  poolWater.userData.containedWaterFeature = 'stern-pool';
  coverBox(builder, 'high-seas-stern-pool-rim-port', [-2.92, 3.61, 36.0], [0.42, 0.82, 5.3], wallMaterial, 'reinforced');
  coverBox(builder, 'high-seas-stern-pool-rim-starboard', [2.92, 3.61, 36.0], [0.42, 0.82, 5.3], wallMaterial, 'reinforced');
  for (const [side, x] of [['port', -1.92], ['starboard', 1.92]] as const) {
    coverBox(builder, `high-seas-stern-pool-rim-forward-${side}`, [x, 3.61, 33.36], [1.65, 0.82, 0.42], wallMaterial, 'reinforced');
    coverBox(builder, `high-seas-stern-pool-rim-aft-${side}`, [x, 3.61, 38.64], [1.65, 0.82, 0.42], wallMaterial, 'reinforced');
  }

  for (const [end, z] of [['bow', -31.0], ['stern', 31.0]] as const) {
    for (const [side, x] of [['port', -8.45], ['starboard', 8.45]] as const) {
      coverBox(builder, `high-seas-${end}-rescue-locker-${side}`, [x, 3.78, z], [1.25, 1.16, 1.7], trimMaterial, 'structural-metal');
    }
  }
}

function addRails(
  builder: Builder,
  railMaterial: THREE.Material,
  deckMaterial: THREE.Material,
): void {
  const addRail = (id: string, x: number, z: number, width: number, depth: number): void => {
    box(builder, `high-seas-perimeter-rail-${id}`, [x, 3.72, z], [width, 1.04, depth], railMaterial, {
      ballisticMaterial: 'thin-metal',
    });
  };
  addRail('starboard', 10.34, 1.48, 0.12, 83.72);
  addRail('port-bow', -10.34, -25.85, 0.12, 29.3);
  addRail('port-center-outer', -11.73, 0, 0.12, 22.0);
  addRail('port-stern', -10.34, 27.35, 0.12, 32.3);
  addRail('bow-tip-port', -3.94, -42.18, 0.12, 3.24);
  addRail('bow-tip-starboard', 3.94, -42.18, 0.12, 3.24);
  addRail('bow-shoulder-port', -7.17, -40.56, 6.46, 0.12);
  addRail('bow-shoulder-starboard', 7.17, -40.56, 6.46, 0.12);
  addRail('bow-tip', 0, -43.82, 8.0, 0.12);
  addRail('stern', 0, 43.48, 20.7, 0.12);

  for (const z of [-10.8, 10.8]) {
    box(builder, `high-seas-catwalk-threshold-${z}`, [-11.0, 3.46, z], [1.48, 0.52, 0.16], railMaterial, {
      ballisticMaterial: 'thin-metal',
    });
  }
  for (let z = -40; z <= 40; z += 5) {
    if (z >= -10 && z <= 10) continue;
    detailBox(builder, `high-seas-starboard-stanchion-${z}`, [10.26, 4.42, z], [0.06, 0.58, 0.06], railMaterial, undefined, 'quality');
  }
  for (const z of [-8, -4, 0, 4, 8]) {
    detailBox(builder, `high-seas-catwalk-stanchion-${z}`, [-11.66, 4.42, z], [0.06, 0.58, 0.06], railMaterial, undefined, 'quality');
  }
  detailBox(builder, 'high-seas-port-catwalk-teak-inlay', [-11.0, 3.215, 0], [1.18, 0.025, 20.8], deckMaterial);
}

function portalAudit(builder: Builder, portals: readonly HighSeasPortal[]): ReadonlyArray<Readonly<{
  id: string;
  movementBlockers: number;
  shotBlockers: number;
  opaquePresentationBlockers: number;
  opaquePresentationBlockerNames: readonly string[];
}>> {
  const overlaps = (aperture: HighSeasPortal['aperture'], bounds: Box2): boolean => {
    const epsilon = 1e-4;
    return aperture.minX < bounds.maxX - epsilon && aperture.maxX > bounds.minX + epsilon
      && aperture.minY < (bounds.maxY ?? Number.POSITIVE_INFINITY) - epsilon
      && aperture.maxY > (bounds.minY ?? Number.NEGATIVE_INFINITY) + epsilon
      && aperture.minZ < bounds.maxZ - epsilon && aperture.maxZ > bounds.minZ + epsilon;
  };
  builder.root.updateMatrixWorld(true);
  const presentationMeshes: THREE.Mesh[] = [];
  builder.root.traverse((node) => {
    if (node instanceof THREE.Mesh
      && node.userData.highSeasPresentationOnly === true
      && node.userData.portalAuditExcluded !== true) presentationMeshes.push(node);
  });
  return portals.map((portal) => {
    const opaquePresentationBlockerNames = presentationMeshes.flatMap((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!materials.some((entry) => entry.visible && (!entry.transparent || entry.opacity >= 0.8))) return [];
      const bounds3 = new THREE.Box3().setFromObject(mesh);
      const bounds: Box2 = {
        minX: bounds3.min.x,
        maxX: bounds3.max.x,
        minY: bounds3.min.y,
        maxY: bounds3.max.y,
        minZ: bounds3.min.z,
        maxZ: bounds3.max.z,
      };
      return overlaps(portal.aperture, bounds) ? [mesh.name] : [];
    });
    return Object.freeze({
      id: portal.id,
      movementBlockers: builder.physicsColliders.filter((bounds) => overlaps(portal.aperture, bounds)).length,
      shotBlockers: builder.shotSurfaces.filter((surface) => overlaps(portal.aperture, surface.bounds)).length,
      opaquePresentationBlockers: opaquePresentationBlockerNames.length,
      opaquePresentationBlockerNames: Object.freeze(opaquePresentationBlockerNames.sort()),
    });
  });
}

function spawnRecord(): Record<Team, THREE.Vector3[]> {
  const stern = [
    [-9, 34], [-9, 40], [-3, 42.2], [3, 42.2], [9, 40], [9, 34],
  ] as const;
  const bow = stern.map(([x, z]) => [-x, -z] as const);
  const create = (entries: readonly (readonly [number, number])[]): THREE.Vector3[] => entries.map(
    ([x, z]) => new THREE.Vector3(x, HIGH_SEAS_LEVELS.mainDeck + 1.7, z),
  );
  return { 0: create(stern), 1: create(bow) };
}

function emptyTelemetry(): ArenaMap['houseTelemetry'] {
  return {
    houses: 0,
    groundRooms: 0,
    upperRooms: 0,
    doors: 0,
    windows: 0,
    ramps: 0,
    wallMaterialVariants: 0,
    pbrMaterialFamilies: 0,
  };
}

export function buildHighSeas(scene: THREE.Scene): HighSeasArenaMap {
  const root = new THREE.Group();
  root.name = 'High Seas original ocean yacht arena';
  scene.add(root);
  const builder: Builder = {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    physicalCover: [],
    authorities: [],
    walkable: [],
    ballisticSurfaceSequence: 0,
  };

  const hullMaterial = material('pearl-hull', 0xeaf1ef, 0.28, 0.22);
  const wallMaterial = material('warm-cabin-shell', 0xf5f3e9, 0.45, 0.08);
  const roofMaterial = material('silver-roof', 0xcbd6d5, 0.3, 0.48);
  const deckMaterial = material('honey-deck', 0xb78653, 0.7, 0.08);
  const stairMaterial = material('dark-deck-stair', 0x5a4032, 0.76, 0.08);
  const tealTrimMaterial = material('deep-teal-trim', 0x164c58, 0.32, 0.62);
  const engineWallMaterial = material('engine-bulkhead', 0x36474c, 0.52, 0.58);
  const engineFloorMaterial = material('engine-grating', 0x26363a, 0.46, 0.72);
  const engineMachineMaterial = material('engine-machinery', 0x57666a, 0.38, 0.74);
  const engineAccentMaterial = material('engine-amber', 0xd7a441, 0.34, 0.52, 0x6d3c08, 0.65);
  const upholsteryMaterial = material('cabana-upholstery', 0x4b8790, 0.76, 0.04);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e9ca8,
    roughness: 0.16,
    metalness: 0.12,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  glassMaterial.name = 'high-seas-side-glass';
  glassMaterial.userData.assetOwner = 'high-seas';
  glassMaterial.userData.assetKind = 'procedural-original-material';
  const waterMaterial = containedWaterMaterial('contained-feature-water', 0x2db9c4);

  const hull = presentationMesh(builder, 'high-seas-sculpted-hull', createHullGeometry(), hullMaterial, [0, 0, 0]);
  hull.userData.sharedOceanExpectedAtY = HIGH_SEAS_LEVELS.ocean;
  hull.userData.collisionRole = 'presentation-around-authoritative-decks-and-bounds';
  hull.userData.portalAuditExcluded = true;
  hull.userData.portalAuditExclusionReason = 'concave-enclosing-shell-has-conservative-world-aabb';

  addDecks(builder, deckMaterial);
  const engine = addEngineRoom(builder, engineFloorMaterial, engineWallMaterial, engineMachineMaterial, engineAccentMaterial);
  const bowCabin = addCabin(builder, 'bow', wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial);
  const sternCabin = addCabin(builder, 'stern', wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial);
  addCenterFeatures(builder, wallMaterial, tealTrimMaterial, upholsteryMaterial, waterMaterial);
  addSpawnFeatures(builder, wallMaterial, tealTrimMaterial, waterMaterial);
  addRails(builder, tealTrimMaterial, deckMaterial);

  const routes = Object.freeze({
    'surface-port': Object.freeze([
      { id: 'bow-port-spawn', position: [-8.8, 3.2, -34] },
      { id: 'bow-port-walkway', position: [-9.0, 3.2, -20] },
      { id: 'port-catwalk-bow', position: [-11.0, 3.2, -9] },
      { id: 'port-catwalk-center', position: [-11.0, 3.2, 0] },
      { id: 'port-catwalk-stern', position: [-11.0, 3.2, 9] },
      { id: 'stern-port-walkway', position: [-9.0, 3.2, 20] },
      { id: 'stern-port-spawn', position: [-8.8, 3.2, 34] },
    ] as const),
    'surface-center': Object.freeze([
      { id: 'bow-center-spawn', position: [0, 3.2, -36] },
      { id: 'bow-cabin-entry', position: [0, 3.2, -28.5] },
      { id: 'bow-cabin-exit', position: [0, 3.2, -13.5] },
      { id: 'center-shower-bow', position: [0, 3.2, -5.2] },
      { id: 'center-shower-port-weave', position: [-0.45, 3.2, -0.1] },
      { id: 'center-shower-stern', position: [0, 3.2, 5.2] },
      { id: 'stern-cabin-entry', position: [0, 3.2, 13.5] },
      { id: 'stern-cabin-exit', position: [0, 3.2, 28.5] },
      { id: 'stern-center-spawn', position: [0, 3.2, 31] },
    ] as const),
    'surface-starboard': Object.freeze([
      { id: 'bow-starboard-spawn', position: [8.8, 3.2, -34] },
      { id: 'bow-starboard-walkway', position: [9.0, 3.2, -20] },
      { id: 'starboard-cabana-bow', position: [9.6, 3.2, -8.5] },
      { id: 'starboard-cabana-center', position: [9.6, 3.2, 0] },
      { id: 'starboard-cabana-stern', position: [9.6, 3.2, 8.5] },
      { id: 'stern-starboard-walkway', position: [9.0, 3.2, 20] },
      { id: 'stern-starboard-spawn', position: [8.8, 3.2, 34] },
    ] as const),
    'engine-through-route': Object.freeze([
      { id: 'bow-engine-top', position: HIGH_SEAS_ENGINE_ACCESS.bowTop },
      { id: 'bow-engine-ramp-mid', position: [0, 1.6, -22.2] },
      { id: 'bow-engine-foot', position: HIGH_SEAS_ENGINE_ACCESS.bowFoot },
      { id: 'engine-forward', position: [0, 0, -12] },
      { id: 'engine-center', position: [0, 0, 0] },
      { id: 'engine-aft', position: [0, 0, 12] },
      { id: 'stern-engine-foot', position: HIGH_SEAS_ENGINE_ACCESS.sternFoot },
      { id: 'stern-engine-ramp-mid', position: [0, 1.6, 22.2] },
      { id: 'stern-engine-top', position: HIGH_SEAS_ENGINE_ACCESS.sternTop },
    ] as const),
    'bow-upper-internal-player': Object.freeze(bowCabin.internalRoute),
    'bow-upper-external-player': Object.freeze(bowCabin.externalRoute),
    'stern-upper-internal-player': Object.freeze(sternCabin.internalRoute),
    'stern-upper-external-player': Object.freeze(sternCabin.externalRoute),
  } as const) satisfies Readonly<Record<string, readonly HighSeasRouteAnchor[]>>;

  const portals: readonly HighSeasPortal[] = Object.freeze([
    { id: 'bow-ground-inner', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: -13.16, maxZ: -12.84 } },
    { id: 'bow-ground-outer', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: -29.16, maxZ: -28.84 } },
    { id: 'stern-ground-inner', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: 12.84, maxZ: 13.16 } },
    { id: 'stern-ground-outer', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: 28.84, maxZ: 29.16 } },
    { id: 'bow-port-side-door', purpose: 'movement', aperture: { minX: -7.56, maxX: -7.24, minY: 3.3, maxY: 5.72, minZ: -22.4, maxZ: -19.6 } },
    { id: 'bow-starboard-side-door', purpose: 'movement', aperture: { minX: 7.24, maxX: 7.56, minY: 3.3, maxY: 5.72, minZ: -22.4, maxZ: -19.6 } },
    { id: 'stern-port-side-door', purpose: 'movement', aperture: { minX: -7.56, maxX: -7.24, minY: 3.3, maxY: 5.72, minZ: 19.6, maxZ: 22.4 } },
    { id: 'stern-starboard-side-door', purpose: 'movement', aperture: { minX: 7.24, maxX: 7.56, minY: 3.3, maxY: 5.72, minZ: 19.6, maxZ: 22.4 } },
    { id: 'bow-upper-inner-window', purpose: 'sightline', aperture: { minX: -2.0, maxX: 2.0, minY: 6.72, maxY: 8.2, minZ: -13.16, maxZ: -12.84 } },
    { id: 'stern-upper-inner-window', purpose: 'sightline', aperture: { minX: -2.0, maxX: 2.0, minY: 6.72, maxY: 8.2, minZ: 12.84, maxZ: 13.16 } },
    { id: 'bow-upper-external-door', purpose: 'movement', aperture: { minX: -5.55, maxX: -3.65, minY: 6.3, maxY: 8.3, minZ: -29.16, maxZ: -28.84 } },
    { id: 'stern-upper-external-door', purpose: 'movement', aperture: { minX: 3.65, maxX: 5.55, minY: 6.3, maxY: 8.3, minZ: 28.84, maxZ: 29.16 } },
    { id: 'bow-engine-foot', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 0.34, maxY: 2.54, minZ: -19.4, maxZ: -19.08 } },
    { id: 'stern-engine-foot', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 0.34, maxY: 2.54, minZ: 19.08, maxZ: 19.4 } },
    { id: 'bow-engine-top', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 3.31, maxY: 5.42, minZ: -24.42, maxZ: -24.02 } },
    { id: 'stern-engine-top', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 3.31, maxY: 5.42, minZ: 24.02, maxZ: 24.42 } },
  ]);

  const verticalNavigation: ArenaVerticalNavigation = Object.freeze({
    routes: Object.freeze([
      { id: 'bow-engine-access', foot: HIGH_SEAS_ENGINE_ACCESS.bowFoot, top: HIGH_SEAS_ENGINE_ACCESS.bowTop },
      { id: 'stern-engine-access', foot: HIGH_SEAS_ENGINE_ACCESS.sternFoot, top: HIGH_SEAS_ENGINE_ACCESS.sternTop },
      { id: 'bow-internal-stair', foot: [4.6, 3.2, -15.9], top: [4.6, 6.2, -20.7] },
      { id: 'bow-external-stair', foot: [-4.6, 3.2, -33.9], top: [-4.6, 6.2, -29.1] },
      { id: 'stern-internal-stair', foot: [-4.6, 3.2, 15.9], top: [-4.6, 6.2, 20.7] },
      { id: 'stern-external-stair', foot: [4.6, 3.2, 33.9], top: [4.6, 6.2, 29.1] },
    ] as const),
    ramps: Object.freeze([
      { id: 'bow-engine-access', from: HIGH_SEAS_ENGINE_ACCESS.bowFoot, to: HIGH_SEAS_ENGINE_ACCESS.bowTop, width: HIGH_SEAS_ENGINE_ACCESS.width },
      { id: 'stern-engine-access', from: HIGH_SEAS_ENGINE_ACCESS.sternFoot, to: HIGH_SEAS_ENGINE_ACCESS.sternTop, width: HIGH_SEAS_ENGINE_ACCESS.width },
      { id: 'bow-internal-stair', from: [4.6, 3.2, -15.9], to: [4.6, 6.2, -20.7], width: 1.8 },
      { id: 'bow-external-stair', from: [-4.6, 3.2, -33.9], to: [-4.6, 6.2, -29.1], width: 1.8 },
      { id: 'stern-internal-stair', from: [-4.6, 3.2, 15.9], to: [-4.6, 6.2, 20.7], width: 1.8 },
      { id: 'stern-external-stair', from: [4.6, 3.2, 33.9], to: [4.6, 6.2, 29.1], width: 1.8 },
    ] as const),
    platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
        id: entry.id,
        minX: entry.bounds.minX,
        maxX: entry.bounds.maxX,
        minZ: entry.bounds.minZ,
        maxZ: entry.bounds.maxZ,
        y: entry.y,
      }))),
  });

  const patrolPoints = [
    [-8.8, 3.2, -36], [0, 3.2, -34], [8.8, 3.2, -36],
    [-9.0, 3.2, -25], [-9.0, 3.2, -16], [0, 3.2, -27.5], [0, 3.2, -14.5], [9.0, 3.2, -25], [9.0, 3.2, -16],
    [-11.0, 3.2, -8], [-11.0, 3.2, 0], [-11.0, 3.2, 8], [0, 3.2, -7], [0, 3.2, 7], [9.5, 3.2, -8], [9.5, 3.2, 0], [9.5, 3.2, 8],
    [-9.0, 3.2, 16], [-9.0, 3.2, 25], [0, 3.2, 14.5], [0, 3.2, 27.5], [9.0, 3.2, 16], [9.0, 3.2, 25],
    [-8.8, 3.2, 36], [0, 3.2, 31], [8.8, 3.2, 36],
    [0, 0, -20.0], [0, 0, -12], [0, 0, 0], [0, 0, 12], [0, 0, 20.0],
  ] as const;

  root.userData.verticalNavigation = verticalNavigation;
  root.userData.highSeasRoutes = routes;
  root.userData.highSeasPortals = portals;
  root.userData.highSeasPortalAudit = Object.freeze(portalAudit(builder, portals));
  root.userData.highSeasSupportAudit = Object.freeze({
    version: 'pass75-shared-platform-authority-v1',
    engineFloor: Object.freeze({
      y: HIGH_SEAS_LEVELS.engine,
      physicsAuthority: 'high-seas-platform-engine-floor',
      presentationName: 'high-seas-platform-engine-floor',
    }),
    platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
      id: entry.id,
      presentationName: entry.presentationName,
      bounds: { ...entry.bounds },
      y: entry.y,
      navigation: entry.navigation,
      movementAuthority: builder.colliders.includes(entry.bounds),
      physicsAuthority: builder.physicsColliders.includes(entry.bounds),
      shotAuthority: builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId),
    }))),
  });
  root.userData.highSeasAuthorityAudit = Object.freeze(builder.authorities.map((entry) => Object.freeze({
    name: entry.name,
    bounds: { ...entry.bounds },
    solid: entry.solid,
    shots: entry.shots,
    movementAuthority: !entry.solid || builder.colliders.includes(entry.bounds),
    physicsAuthority: !entry.solid || builder.physicsColliders.includes(entry.bounds),
    raycastAuthority: !entry.shots || builder.raycastMeshes.includes(entry.mesh),
    ballisticAuthority: !entry.shots || builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId),
    ballisticSurfaceId: entry.ballisticSurfaceId,
    externalPhysicsAuthority: entry.externalPhysicsAuthority,
  })));
  root.userData.highSeasAccess = Object.freeze({
    maximumPlayerClimbDegrees: 50,
    engineRampDegrees: engine.bow.angleDegrees,
    engineRampSymmetryError: Math.abs(engine.bow.angleDegrees - engine.stern.angleDegrees),
    internalStairDegrees: [bowCabin.internalAccess.angleDegrees, sternCabin.internalAccess.angleDegrees],
    externalStairDegrees: [bowCabin.externalAccess.angleDegrees, sternCabin.externalAccess.angleDegrees],
    upperStoreys: 'bot-pursuit-capable-no-routine-patrols',
  });
  root.userData.highSeasProvenance = Object.freeze({
    version: 'pass75-clean-room-v1',
    ownership: 'original-procedural',
    functionalReferenceBoundary: 'publicly-described-narrow-yacht-topology-only',
    copiedAssets: Object.freeze([]),
    runtimeBranding: 'high-seas-original-only',
    surroundingWaterAuthority: 'shared-water-authoring-path',
    expectedWaveEnvelope: Object.freeze({ minimumY: -2.55, maximumY: -1.85 }),
    safetyFloorY: HIGH_SEAS_SAFETY_FLOOR_Y,
    containedWaterFeatures: Object.freeze(['hot-tub', 'stern-pool']),
  });
  root.userData.highSeasReviewCameras = Object.freeze([
    { id: 'high-seas-overview', position: [28, 24, 50], target: [0, 3.2, 0], purpose: 'overview' },
    { id: 'high-seas-center-deck', position: [10, 5.2, 6], target: [-2, 4, 0], purpose: 'topology' },
    { id: 'high-seas-port-catwalk', position: [-11.3, 4.9, 10], target: [-10.8, 4.2, -10], purpose: 'route' },
    { id: 'high-seas-opposed-cabins', position: [0, 7.9, 10.5], target: [0, 7.9, -10.5], purpose: 'sightline' },
    { id: 'high-seas-engine-corridor', position: [0, 1.55, 19], target: [0, 1.4, -19], purpose: 'route' },
    { id: 'high-seas-engine-open-portal', position: [0, 1.6, -18], target: [0, 2.2, -24], purpose: 'portal' },
    { id: 'high-seas-engine-wall-closed', position: [2.5, 1.5, 0], target: [3.1, 1.5, 0], purpose: 'light-occlusion' },
  ]);

  return {
    id: 'high-seas',
    label: 'High Seas',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(),
    patrolPoints: patrolPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    targets: [] as PracticeTarget[],
    houses: [],
    breakableWindows: [],
    physicalCover: builder.physicalCover,
    bounds: { ...HIGH_SEAS_BOUNDS },
    physicsSafetyFloorY: HIGH_SEAS_SAFETY_FLOOR_Y,
    houseTelemetry: emptyTelemetry(),
  };
}
