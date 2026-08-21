import * as THREE from 'three';
import { createBallisticSurface, type BallisticSurface } from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';
import { applyFarcrysisArtwork } from './farcrysis-art';
import { addInteractables } from './farcrysis-physics';
import { FARCRYSIS_BOUNDS, FARCRYSIS_COVER_MIN, FARCRYSIS_MAX_SIGHTLINE } from './farcrysis-constants';

// Re-export for downstream consumers (tests, map registry)
export { FARCRYSIS_BOUNDS, FARCRYSIS_COVER_MIN, FARCRYSIS_MAX_SIGHTLINE };

/**
 * Pass 69 — f4rcry515 arena (HITL-testing lane).
 *
 * A 64x64 flooded jungle research station inspired by the beach and jungle areas
 * of the Far Cry / Crysis family (subtle, original throwbacks only — no copied
 * assets). Three overlaid loops: beach/lagoon outer ring, dense jungle mid ring,
 * and a ruined research-station core. Fast COD-feel arcade movement; the map
 * rhythm comes from short sightlines, frequent collision-backed cover, and no
 * long open fields.
 *
 * Mechanical contract mirrors the other arenas (ArenaMap); the art/feel lane is
 * specced in docs/PASS69_FARCRYSIS_ARENA_SPEC_2026-08-04.md R9.
 */

export type FarcrysisHitlState = Readonly<{
  active: boolean;
  spawnCount: number;
  coverCount: number;
  maxSightline: number;
  violations: readonly string[];
  matchFlow: 'idle' | 'spawned' | 'loop' | 'engaged' | 'scored';
}>;

const standard = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

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

function spawnRecord(
  team0: readonly (readonly [number, number])[],
  team1: readonly (readonly [number, number])[],
): Record<Team, THREE.Vector3[]> {
  return {
    0: team0.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
    1: team1.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
  };
}

type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  shotSurfaces: BallisticSurface[];
  physicalCover: ArenaMap['physicalCover'];
};

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: {
    solid?: boolean;
    shots?: boolean;
    cover?: boolean;
    rotation?: [number, number, number];
    cast?: boolean;
    ballistic?: string;
  } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({
    name,
    metalness: material instanceof THREE.MeshStandardMaterial ? material.metalness : undefined,
  });
  builder.root.add(mesh);
  const solid = options.solid !== false;
  const shots = options.shots ?? solid;
  if (shots) builder.raycastMeshes.push(mesh);
  if (solid) {
    const bounds: Box2 = {
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
      minY: position[1] - size[1] / 2,
      maxY: position[1] + size[1] / 2,
      rotation: options.rotation,
    };
    builder.colliders.push(bounds);
    builder.physicsColliders.push(bounds);
    if (options.cover) {
      builder.physicalCover.push({
        id: name,
        bounds,
        blocksMovement: true,
        blocksShots: true,
      });
    }
  }
  if (options.ballistic) {
    const b = {
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
    };
    builder.shotSurfaces.push(
      createBallisticSurface(
        `farcrysis-shot-${builder.shotSurfaces.length}`,
        name,
        b,
        { material: options.ballistic as BallisticSurface['material'] },
      ),
    );
  }
  return mesh;
}

/** Register one collision-backed cover piece (solid + shot-blocking + physical). */
function cover(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  rotation?: [number, number, number],
): THREE.Mesh {
  return box(builder, name, position, size, material, {
    cover: true,
    rotation,
    cast: true,
    ballistic: material instanceof THREE.MeshStandardMaterial && material.metalness > 0.4 ? 'metal' : 'concrete',
  });
}

export function buildFarcrysis(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'f4rcry515 — flooded jungle research station';
  scene.add(root);
  const builder: Builder = {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    physicalCover: [],
  };

  const sandMat = standard(0xd9c08a, 0.92, 0.02);
  const grassMat = standard(0x5e7d3a, 0.9, 0.03);
  const mudMat = standard(0x6d5638, 0.94, 0.02);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2d7f8c,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  });
  const jungleLeafMat = standard(0x2f6b2a, 0.85, 0.02);
  const palmTrunkMat = standard(0x7a5b36, 0.9, 0.02);
  const rockMat = standard(0x8b8a87, 0.92, 0.1);
  const ruinedWallMat = standard(0x9aa1a8, 0.86, 0.12);
  const crateMat = standard(0x6f6a4a, 0.9, 0.18);
  const stationMetalMat = standard(0x6d7a83, 0.42, 0.62);
  const stationGlassMat = new THREE.MeshStandardMaterial({
    color: 0x7fd8e6,
    roughness: 0.2,
    metalness: 0.08,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const beaconMat = standard(0xe8862b, 0.5, 0.2);
  const hazardMat = standard(0xd8a12e, 0.5, 0.3);

  // Ground + water. The playable island plate sits at y=0; the lagoon floods the
  // outer ring below the beach lip. No swim mechanic — colliders keep players on
  // the island paths.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), mudMat);
  ground.name = 'farcrysis-ground-plate';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  root.add(ground);

  const beachRing = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), sandMat);
  beachRing.name = 'farcrysis-beach-ring';
  beachRing.rotation.x = -Math.PI / 2;
  beachRing.position.y = 0.01;
  beachRing.receiveShadow = true;
  root.add(beachRing);

  const grassRing = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), grassMat);
  grassRing.name = 'farcrysis-jungle-floor';
  grassRing.rotation.x = -Math.PI / 2;
  grassRing.position.y = 0.02;
  grassRing.receiveShadow = true;
  root.add(grassRing);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), waterMat);
  water.name = 'farcrysis-lagoon-water';
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.25;
  root.add(water);

  // ---- Outer beach ring: palms, beached skiffs, rocks (collision-backed cover)
  const palmPositions: ReadonlyArray<readonly [number, number]> = [
    [-27, -27], [27, -27], [-27, 27], [27, 27],
    [-22, -30], [22, -30], [-22, 30], [22, 30],
  ];
  for (const [x, z] of palmPositions) {
    box(builder, `farcrysis-palm-trunk-${x}-${z}`, [x, 0.9, z], [0.45, 1.8, 0.45], palmTrunkMat, { cast: true, ballistic: 'wood' });
    const fronds = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 3.4), jungleLeafMat);
    fronds.name = `farcrysis-palm-fronds-${x}-${z}`;
    fronds.position.set(x, 1.85, z);
    fronds.rotation.y = (x + z) * 0.17;
    fronds.castShadow = true;
    root.add(fronds);
  }
  cover(builder, 'farcrysis-skiff-nw', [-18, 0.55, -24], [4.2, 1.1, 2.1], standard(0x9c6b4a, 0.7, 0.2), [0.4, 0, 0.25]);
  cover(builder, 'farcrysis-skiff-se', [18, 0.55, 24], [4.2, 1.1, 2.1], standard(0x9c6b4a, 0.7, 0.2), [-0.35, 0, -0.2]);
  cover(builder, 'farcrysis-rock-nw', [-14, 0.5, -20], [2.2, 1.0, 2.2], rockMat);
  cover(builder, 'farcrysis-rock-se', [14, 0.5, 20], [2.2, 1.0, 2.2], rockMat);

  // ---- Mid jungle ring: ruined walls + overgrown crates (collision-backed)
  cover(builder, 'farcrysis-ruined-wall-n', [-8, 0.8, -14], [3.6, 1.6, 0.5], ruinedWallMat, [0, 0, 0.3]);
  cover(builder, 'farcrysis-ruined-wall-s', [8, 0.8, 14], [3.6, 1.6, 0.5], ruinedWallMat, [0, 0, -0.25]);
  cover(builder, 'farcrysis-ruined-wall-e', [14, 0.8, -8], [0.5, 1.6, 3.6], ruinedWallMat, [0.2, 0, 0]);
  cover(builder, 'farcrysis-ruined-wall-w', [-14, 0.8, 8], [0.5, 1.6, 3.6], ruinedWallMat, [-0.2, 0, 0]);
  cover(builder, 'farcrysis-crate-nw', [-10, 0.45, -8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-ne', [10, 0.45, -8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-sw', [-10, 0.45, 8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-se', [10, 0.45, 8], [1.7, 0.9, 1.7], crateMat);

  // Mid-field canopy columns — collision-backed old-growth trees that break the
  // long diagonal sightlines (spawn-to-spawn) so the map reads short-range COD,
  // not a cross-map sniper lane. Placed OFF the patrol/rotation lanes.
  const canopyPositions: ReadonlyArray<readonly [number, number]> = [
    [-15, -15], [15, 15], [-15, 15], [15, -15],
    [-4, -24], [4, 24], [-24, 4], [24, -4],
    [-20, -12], [20, 12], [-12, 20], [12, -20],
  ];
  for (const [x, z] of canopyPositions) {
    cover(builder, `farcrysis-canopy-trunk-${x}-${z}`, [x, 1.3, z], [1.5, 2.6, 1.5], palmTrunkMat);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 4.6), jungleLeafMat);
    crown.name = `farcrysis-canopy-crown-${x}-${z}`;
    crown.position.set(x, 3.1, z);
    crown.rotation.y = (x * 0.7 + z * 0.13) % Math.PI;
    crown.castShadow = true;
    root.add(crown);
  }
  // Low ferns beneath the canopy columns: dense but non-colliding dressing.
  for (const [x, z] of canopyPositions) {
    const bush = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.2), jungleLeafMat);
    bush.name = `farcrysis-canopy-undergrowth-${x}-${z}`;
    bush.position.set(x, 0.5, z);
    bush.castShadow = true;
    root.add(bush);
  }

  // ---- Inner research-station core: two entrances, interior catwalk, raised desk
  const coreMat = stationMetalMat;
  // Core walls (structural, not cover-list — the station is a structure)
  const coreWall = (name: string, position: [number, number, number], size: [number, number, number]) =>
    box(builder, name, position, size, coreMat, { cast: true, ballistic: 'metal' });
  coreWall('farcrysis-core-wall-n', [0, 1.6, -5.5], [12, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-s', [0, 1.6, 5.5], [12, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-w', [-5.5, 1.6, 0], [0.6, 3.2, 12]);
  coreWall('farcrysis-core-wall-e', [5.5, 1.6, 0], [0.6, 3.2, 12]);
  // Two entrances: north gap (0..4 x) and south gap (-4..0 x)
  const entranceCoverN = cover(builder, 'farcrysis-core-door-n', [0, 1.2, -3.6], [0.4, 2.4, 0.5], stationMetalMat);
  entranceCoverN.userData.coverOnly = true;
  const entranceCoverS = cover(builder, 'farcrysis-core-door-s', [-0, 1.2, 3.6], [0.4, 2.4, 0.5], stationMetalMat);
  entranceCoverS.userData.coverOnly = true;
  // Interior catwalk (upper, reachable by ramp)
  box(builder, 'farcrysis-core-catwalk', [0, 2.5, 0], [7, 0.18, 2.4], standard(0x4c5b64, 0.5, 0.55), { solid: false, cast: true });
  box(builder, 'farcrysis-core-catwalk-ramp', [2.6, 1.5, 2.1], [3, 0.16, 1.6], standard(0x4c5b64, 0.5, 0.55), { solid: false, cast: true, rotation: [0, 0, -0.25] });
  // Raised command desk (cover)
  cover(builder, 'farcrysis-core-desk', [0, 0.65, 0], [3, 1.3, 1.6], standard(0x37454e, 0.4, 0.5));
  // Interior crates
  cover(builder, 'farcrysis-core-crate-a', [-3.4, 0.45, -2.2], [1.5, 0.9, 1.5], crateMat);
  cover(builder, 'farcrysis-core-crate-b', [3.4, 0.45, 2.2], [1.5, 0.9, 1.5], crateMat);
  // Research station window (breakable presentation)
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.08), stationGlassMat);
  windowMesh.name = 'farcrysis-core-window-n';
  windowMesh.position.set(-3, 2.1, -5.48);
  root.add(windowMesh);

  // ---- Throwbacks (dressing, R9): crashed seaplane, signal beacon, warning barrels
  const seaplane = new THREE.Group();
  seaplane.name = 'farcrysis-throwback-seaplane';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 1.5), standard(0xd9e2e6, 0.3, 0.55));
  hull.position.y = 0.5;
  seaplane.add(hull);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 1.1), standard(0xc7d4d9, 0.3, 0.5));
  wing.position.y = 1.05;
  seaplane.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), standard(0xc7d4d9, 0.3, 0.5));
  tail.position.set(1.8, 1.15, 0);
  seaplane.add(tail);
  seaplane.position.set(24, 0.1, -24);
  seaplane.rotation.y = 0.7;
  root.add(seaplane);

  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.4), beaconMat);
  beacon.name = 'farcrysis-throwback-signal-beacon';
  beacon.position.set(-24, 1.3, 24);
  beacon.castShadow = true;
  root.add(beacon);
  const beaconFlame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), standard(0xffb340, 0.4, 0.1,));
  beaconFlame.name = 'farcrysis-throwback-beacon-flame';
  beaconFlame.position.set(-24, 3.2, 24);
  root.add(beaconFlame);

  const barrelPositions: ReadonlyArray<readonly [number, number]> = [[-20, 20], [20, -20], [-5, -24], [5, 24]];
  for (const [x, z] of barrelPositions) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10), hazardMat);
    barrel.name = `farcrysis-throwback-barrel-${x}-${z}`;
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    root.add(barrel);
  }

  // ---- Pass 69 interactables (crates, barrels, sandbag walls)
  addInteractables(builder);

  // ---- Jungle bushes (dressing, no collision) + instanced ferns (R9 style)
  const bushPositions: ReadonlyArray<readonly [number, number]> = [
    [-6, -12], [6, -12], [-6, 12], [6, 12], [-12, -4], [12, -4], [-12, 4], [12, 4],
    [-4, -20], [4, -20], [-4, 20], [4, 20], [-20, -6], [20, -6], [-20, 6], [20, 6],
  ];
  for (const [x, z] of bushPositions) {
    const bush = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), jungleLeafMat);
    bush.name = `farcrysis-jungle-bush-${x}-${z}`;
    bush.position.set(x, 0.4, z);
    bush.castShadow = true;
    root.add(bush);
  }

  const fernCount = 24;
  const fernGeom = new THREE.BoxGeometry(0.5, 0.9, 0.18);
  const fernMat = standard(0x3d7a35, 0.85, 0.02);
  const ferns = new THREE.InstancedMesh(fernGeom, fernMat, fernCount);
  ferns.name = 'farcrysis-instanced-ferns';
  const fernMatrix = new THREE.Matrix4();
  for (let i = 0; i < fernCount; i += 1) {
    const angle = (i / fernCount) * Math.PI * 2;
    const radius = 7 + (i % 4) * 2.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.9;
    fernMatrix.makeRotationY(angle * 2.3);
    fernMatrix.setPosition(x, 0.45, z);
    ferns.setMatrixAt(i, fernMatrix);
  }
  ferns.castShadow = true;
  root.add(ferns);

  // World-bounds walls (invisible, keep players in the arena)
  const boundWalls = [
    box(builder, 'farcrysis-bound-n', [0, 2, -32.2], [65, 4, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-s', [0, 2, 32.2], [65, 4, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-w', [-32.2, 2, 0], [0.5, 4, 65], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-e', [32.2, 2, 0], [0.5, 4, 65], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
  ];
  for (const wall of boundWalls) {
    wall.visible = false;
  }

  // Spawns — rotationally symmetric across the core (NW vs SE), off colliders,
  // no opposing spawn line-of-sight.
  const spawns: Record<Team, THREE.Vector3[]> = spawnRecord(
    [
      [-26, -26], [-22, -24], [-24, -20], [-18, -26],
    ],
    [
      [26, 26], [22, 24], [24, 20], [18, 26],
    ],
  );

  const patrolPoints = [
    [-26, -26], [-18, -20], [-12, -16], [-4, -12], [0, 0], [12, 16], [18, 20], [26, 26],
    [-20, 18], [20, -18], [-8, -24], [8, 24],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  // --- Pass 69 art/feel lane (presentation only — no colliders, spawns, or gameplay authority) ---
  applyFarcrysisArtwork(root);

  return {
    id: 'farcrysis',
    label: 'Farcrysis',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns,
    patrolPoints,
    targets: [] as PracticeTarget[],
    houses: [],
    breakableWindows: [],
    physicalCover: builder.physicalCover,
    bounds: { minX: FARCRYSIS_BOUNDS.minX, maxX: FARCRYSIS_BOUNDS.maxX, minZ: FARCRYSIS_BOUNDS.minZ, maxZ: FARCRYSIS_BOUNDS.maxZ },
    houseTelemetry: emptyTelemetry(),
  };
}

/** Compute HITL overlay state from a built arena (dev-only, ?hitl=1 gated). */
export function farcrysisHITL(a: ArenaMap): FarcrysisHitlState {
  const violations: string[] = [];
  const allSpawns = [...a.spawns[0], ...a.spawns[1]];
  let maxSightline = 0;
  for (const spawn of allSpawns) {
    for (const coverEntry of a.physicalCover) {
      const b = coverEntry.bounds;
      const sx = spawn.x;
      const sz = spawn.z;
      const inX = sx >= b.minX && sx <= b.maxX;
      const inZ = sz >= b.minZ && sz <= b.maxZ;
      if (inX && inZ) {
        violations.push(`spawn(${sx.toFixed(1)},${sz.toFixed(1)}) inside cover ${coverEntry.id}`);
      }
      const dist = Math.hypot(sx - b.maxX, sz - b.maxZ);
      if (dist > maxSightline) maxSightline = dist;
    }
  }
  return {
    active: true,
    spawnCount: allSpawns.length,
    coverCount: a.physicalCover.length,
    maxSightline,
    violations,
    matchFlow: 'idle',
  };
}
