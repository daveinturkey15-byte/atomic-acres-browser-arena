import * as THREE from 'three';
import { createBallisticSurface, type BallisticSurface } from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';
import type { ArenaVerticalNavigation } from './vertical-navigation';
import { applyFarcrysisArtwork } from './farcrysis-art';
import { addInteractables } from './farcrysis-physics';
import { enhancedPalmPlacements, TRUNK_HEIGHT as PALM_TRUNK_HEIGHT } from './farcrysis-palms-enhanced';
import {
  farcrysisTerrainHeight,
  farcrysisTerrainPhysicsTiles,
  farcrysisBotGroundPlatforms,
  FARCRYSIS_SAFETY_FLOOR_Y,
  FARCRYSIS_WATER_LEVEL,
} from './farcrysis-terrain-authority';
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
  /**
   * HF-360: named audit rows for every solid collider. arena.colliders are
   * anonymous Box2s, so this is what lets the terrain-authority tests assert
   * per-object seating (and lets exceptions like the elevated catwalk be
   * identified honestly by id instead of by magic bounds).
   */
  colliderAudit: Array<{ id: string; bounds: Box2 }>;
};

/** Terrain surface Y under a prop centre — always the single authority. */
const groundY = farcrysisTerrainHeight;

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
    builder.colliderAudit.push({ id: name, bounds });
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
    colliderAudit: [],
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

  // Ground + water. HF-360: gameplay ground is no longer a flat y=0 plate —
  // the Rapier capsule stands on terrain plates compiled from the single
  // terrain authority (see the physicsColliders block near the end of this
  // builder), and the outer beach descends below the waterline so the HF-358
  // swimmable lagoon is actually reachable on foot. These flat planes remain
  // as presentation backstops under the sculpted terrain mesh only.
  //
  // The mud plate shrinks from 64 m to 56 m so it ends where the seaward
  // shore descent begins (edge distance 4 m): a full-size flat plate at y=0
  // would poke through the submerged sand ramp.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), mudMat);
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

  // The lagoon plane sits exactly at the registry water level — this surface
  // IS the arena's one authored waterline (water-authoring FARCRYSIS_WATER).
  const water = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), waterMat);
  water.name = 'farcrysis-lagoon-water';
  water.rotation.x = -Math.PI / 2;
  water.position.y = FARCRYSIS_WATER_LEVEL;
  root.add(water);

  // ---- Outer beach ring: palms, beached skiffs, rocks (collision-backed cover)
  //
  // HF-360: every authored prop below seats its base on the terrain authority
  // surface. These pieces were authored against the flat y=0 plate, which
  // buried the NW rock and the SE crate inside interior hills (~1-2 m tall)
  // and left an invisible collision wall where no rock was visible.
  const palmPositions: ReadonlyArray<readonly [number, number]> = [
    [-27, -27], [27, -27], [-27, 27], [27, 27],
    [-22, -30], [22, -30], [-22, 30], [22, 30],
  ];
  for (const [x, z] of palmPositions) {
    const g = groundY(x, z);
    box(builder, `farcrysis-palm-trunk-${x}-${z}`, [x, g + 0.9, z], [0.45, 1.8, 0.45], palmTrunkMat, { cast: true, ballistic: 'wood' });
    const fronds = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 3.4), jungleLeafMat);
    fronds.name = `farcrysis-palm-fronds-${x}-${z}`;
    fronds.position.set(x, g + 1.85, z);
    fronds.rotation.y = (x + z) * 0.17;
    fronds.castShadow = true;
    root.add(fronds);
  }
  cover(builder, 'farcrysis-skiff-nw', [-18, groundY(-18, -24) + 0.55, -24], [4.2, 1.1, 2.1], standard(0x9c6b4a, 0.7, 0.2), [0.4, 0, 0.25]);
  cover(builder, 'farcrysis-skiff-se', [18, groundY(18, 24) + 0.55, 24], [4.2, 1.1, 2.1], standard(0x9c6b4a, 0.7, 0.2), [-0.35, 0, -0.2]);
  cover(builder, 'farcrysis-rock-nw', [-14, groundY(-14, -20) + 0.5, -20], [2.2, 1.0, 2.2], rockMat);
  cover(builder, 'farcrysis-rock-se', [14, groundY(14, 20) + 0.5, 20], [2.2, 1.0, 2.2], rockMat);

  // ---- Mid jungle ring: ruined walls + overgrown crates (collision-backed)
  cover(builder, 'farcrysis-ruined-wall-n', [-8, groundY(-8, -14) + 0.8, -14], [3.6, 1.6, 0.5], ruinedWallMat, [0, 0, 0.3]);
  cover(builder, 'farcrysis-ruined-wall-s', [8, groundY(8, 14) + 0.8, 14], [3.6, 1.6, 0.5], ruinedWallMat, [0, 0, -0.25]);
  cover(builder, 'farcrysis-ruined-wall-e', [14, groundY(14, -8) + 0.8, -8], [0.5, 1.6, 3.6], ruinedWallMat, [0.2, 0, 0]);
  cover(builder, 'farcrysis-ruined-wall-w', [-14, groundY(-14, 8) + 0.8, 8], [0.5, 1.6, 3.6], ruinedWallMat, [-0.2, 0, 0]);
  cover(builder, 'farcrysis-crate-nw', [-10, groundY(-10, -8) + 0.45, -8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-ne', [10, groundY(10, -8) + 0.45, -8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-sw', [-10, groundY(-10, 8) + 0.45, 8], [1.7, 0.9, 1.7], crateMat);
  cover(builder, 'farcrysis-crate-se', [10, groundY(10, 8) + 0.45, 8], [1.7, 0.9, 1.7], crateMat);

  // Mid-field canopy columns — collision-backed old-growth trees that break the
  // long diagonal sightlines (spawn-to-spawn) so the map reads short-range COD,
  // not a cross-map sniper lane. Placed OFF the patrol/rotation lanes.
  const canopyPositions: ReadonlyArray<readonly [number, number]> = [
    [-15, -15], [15, 15], [-15, 15], [15, -15],
    [-4, -24], [4, 24], [-24, 4], [24, -4],
    [-20, -12], [20, 12], [-12, 20], [12, -20],
  ];
  for (const [x, z] of canopyPositions) {
    const g = groundY(x, z);
    cover(builder, `farcrysis-canopy-trunk-${x}-${z}`, [x, g + 1.3, z], [1.5, 2.6, 1.5], palmTrunkMat);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 4.6), jungleLeafMat);
    crown.name = `farcrysis-canopy-crown-${x}-${z}`;
    crown.position.set(x, g + 3.1, z);
    crown.rotation.y = (x * 0.7 + z * 0.13) % Math.PI;
    crown.castShadow = true;
    root.add(crown);
  }
  // Low ferns beneath the canopy columns: dense but non-colliding dressing.
  for (const [x, z] of canopyPositions) {
    const bush = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.2), jungleLeafMat);
    bush.name = `farcrysis-canopy-undergrowth-${x}-${z}`;
    bush.position.set(x, groundY(x, z) + 0.5, z);
    bush.castShadow = true;
    root.add(bush);
  }

  // ---- Inner research-station core: two entrances, interior catwalk, raised desk
  const coreMat = stationMetalMat;
  // Core walls (structural, not cover-list — the station is a structure)
  const coreWall = (name: string, position: [number, number, number], size: [number, number, number]) =>
    box(builder, name, position, size, coreMat, { cast: true, ballistic: 'metal' });
  // HF-359 audit fix: the north and south walls were emitted as single 12 m spans,
  // sealing the core into a solid box. Everything inside — the command desk, crates,
  // catwalk and ramp — was unreachable, and bot patrol point [0,0] sat inside the
  // sealed volume. Each side is now two 4 m segments leaving a 4 m central doorway,
  // which is the two-entrance design the comment above already described.
  coreWall('farcrysis-core-wall-n-west', [-4, 1.6, -5.5], [4, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-n-east', [4, 1.6, -5.5], [4, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-s-west', [-4, 1.6, 5.5], [4, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-s-east', [4, 1.6, 5.5], [4, 3.2, 0.6]);
  coreWall('farcrysis-core-wall-w', [-5.5, 1.6, 0], [0.6, 3.2, 12]);
  coreWall('farcrysis-core-wall-e', [5.5, 1.6, 0], [0.6, 3.2, 12]);
  // Two entrances: north gap (0..4 x) and south gap (-4..0 x)
  const entranceCoverN = cover(builder, 'farcrysis-core-door-n', [0, 1.2, -3.6], [0.4, 2.4, 0.5], stationMetalMat);
  entranceCoverN.userData.coverOnly = true;
  const entranceCoverS = cover(builder, 'farcrysis-core-door-s', [-0, 1.2, 3.6], [0.4, 2.4, 0.5], stationMetalMat);
  entranceCoverS.userData.coverOnly = true;
  // Interior catwalk (upper, reachable by the stair flight below).
  //
  // HF-360 audit fix: the catwalk and its ramp were authored solid:false —
  // pure holograms a player fell straight through — and the ramp's top edge
  // ended at y≈1.9 in mid-air a metre short of the 2.5 m deck it pretended
  // to serve. The catwalk is now a real solid deck, and the fake ramp is
  // replaced by a stair flight whose 0.38 m risers the character
  // controller's 0.42 m autostep climbs. The core floor is the flattened
  // terrain pad at y=0 (see farcrysis-terrain-authority), so authored core
  // heights need no per-piece ground offset.
  box(builder, 'farcrysis-core-catwalk', [0, 2.5, 0], [7, 0.18, 2.4], standard(0x4c5b64, 0.5, 0.55), { cast: true, ballistic: 'metal' });
  const stairMat = standard(0x4c5b64, 0.5, 0.55);
  const stairSteps = 7;
  const stairRise = 2.59 / stairSteps; // top step flush with the catwalk deck
  const stairDepth = 0.5;
  for (let i = 0; i < stairSteps; i += 1) {
    // Full-height steps (floor to tread) so each is ground-seated collision.
    const treadTop = 2.59 - i * stairRise;
    box(
      builder,
      `farcrysis-core-stair-${i}`,
      [2.9, treadTop / 2, 0.95 + (i + 1) * stairDepth],
      [1.2, treadTop, stairDepth],
      stairMat,
      { cast: true, ballistic: 'metal' },
    );
  }
  // Raised command desk (cover)
  cover(builder, 'farcrysis-core-desk', [0, 0.65, 0], [3, 1.3, 1.6], standard(0x37454e, 0.4, 0.5));
  // Interior crates. HF-360: crate-b moved off the new stair footprint (it
  // sat at [3.4, 2.2], inside the flight) to the mirrored free corner.
  cover(builder, 'farcrysis-core-crate-a', [-3.4, 0.45, -2.2], [1.5, 0.9, 1.5], crateMat);
  cover(builder, 'farcrysis-core-crate-b', [3.4, 0.45, -2.2], [1.5, 0.9, 1.5], crateMat);
  // Research station window (breakable presentation)
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.08), stationGlassMat);
  windowMesh.name = 'farcrysis-core-window-n';
  windowMesh.position.set(-3, 2.1, -5.48);
  root.add(windowMesh);

  // ---- Throwbacks (R9): crashed seaplane, signal beacon, warning barrels.
  //
  // HF-360: these were pure walk-through dressing. Player-scale structures
  // must be physical, so each gets an invisible collider proxy registered
  // through box() — the same authored-collision-proxy idiom Atomic Acres
  // uses in map.ts — while the visible art keeps its authored shapes.
  const colliderProxy = (
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    ballistic: string,
    rotation?: [number, number, number],
  ): void => {
    const proxy = box(builder, name, position, size, stationMetalMat, { cast: false, ballistic, rotation });
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
  };

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
  const seaplaneGround = groundY(24, -24);
  seaplane.position.set(24, seaplaneGround + 0.1, -24);
  seaplane.rotation.y = 0.7;
  root.add(seaplane);
  // Hull collider matches the fuselage box, yawed with the wreck.
  colliderProxy('farcrysis-throwback-seaplane-collider', [24, seaplaneGround + 0.6, -24], [4.6, 1.2, 1.5], 'thin-metal', [0, 0.7, 0]);

  const beaconGround = groundY(-24, 24);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.4), beaconMat);
  beacon.name = 'farcrysis-throwback-signal-beacon';
  beacon.position.set(-24, beaconGround + 1.3, 24);
  beacon.castShadow = true;
  root.add(beacon);
  const beaconFlame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), standard(0xffb340, 0.4, 0.1,));
  beaconFlame.name = 'farcrysis-throwback-beacon-flame';
  beaconFlame.position.set(-24, beaconGround + 3.2, 24);
  root.add(beaconFlame);
  colliderProxy('farcrysis-throwback-signal-beacon-collider', [-24, beaconGround + 1.3, 24], [1.4, 2.6, 1.4], 'wood');

  const barrelPositions: ReadonlyArray<readonly [number, number]> = [[-20, 20], [20, -20], [-5, -24], [5, 24]];
  for (const [x, z] of barrelPositions) {
    const g = groundY(x, z);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10), hazardMat);
    barrel.name = `farcrysis-throwback-barrel-${x}-${z}`;
    barrel.position.set(x, g + 0.525, z);
    barrel.castShadow = true;
    root.add(barrel);
    // Cylinder collapsed to its bounding box — the same approximation the
    // interactable barrels already use in farcrysis-physics.ts.
    colliderProxy(`farcrysis-throwback-barrel-collider-${x}-${z}`, [x, g + 0.525, z], [0.84, 1.05, 0.84], 'thin-metal');
  }

  // Research tower legs (art tower at [-8.5, -8.5], legs at ±1.3 offsets in
  // farcrysis-art.ts addResearchTower) and cave arch pillars (art cave group
  // at [26, 16], yaw 1.2). World positions are derived from the same authored
  // constants; the arch top stays open so players can walk through the arch.
  for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as const) {
    const x = -8.5 + lx;
    const z = -8.5 + lz;
    colliderProxy(`farcrysis-art-tower-leg-collider-${lx}-${lz}`, [x, groundY(x, z) + 2.4, z], [0.26, 4.8, 0.26], 'metal');
  }
  const caveYaw = 1.2;
  for (const side of [-1, 1] as const) {
    const x = 26 + side * 1.5 * Math.cos(caveYaw);
    const z = 16 - side * 1.5 * Math.sin(caveYaw);
    colliderProxy(`farcrysis-art-cave-pillar-collider-${side > 0 ? 'r' : 'l'}`, [x, groundY(x, z) + 1.3, z], [0.7, 2.6, 1.6], 'concrete', [0, caveYaw, 0]);
  }

  // Representative large palm trunks from the enhanced-palm art layer. The
  // placements are seeded-deterministic, so colliders and instances always
  // agree. Trunks within 2.5 m of a spawn stay collider-free so a spawn can
  // never be born wedged against a tree.
  const allSpawnXZ: ReadonlyArray<readonly [number, number]> = [
    [-26, -26], [-22, -24], [-24, -20], [-18, -26],
    [26, 26], [22, 24], [24, 20], [18, 26],
  ];
  for (const [index, palm] of enhancedPalmPlacements().entries()) {
    const nearSpawn = allSpawnXZ.some(([sx, sz]) => Math.hypot(palm.x - sx, palm.z - sz) < 2.5);
    if (nearSpawn) continue;
    const trunkHeight = PALM_TRUNK_HEIGHT * palm.scale;
    colliderProxy(`farcrysis-enhanced-palm-trunk-collider-${index}`, [palm.x, palm.baseY + trunkHeight / 2, palm.z], [0.6, trunkHeight, 0.6], 'wood');
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
    // HF-360: seated on the terrain authority (was flat y=0.4).
    bush.position.set(x, groundY(x, z) + 0.4, z);
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
    // HF-360: seated on the terrain authority (was flat y=0.45).
    fernMatrix.setPosition(x, groundY(x, z) + 0.45, z);
    ferns.setMatrixAt(i, fernMatrix);
  }
  ferns.castShadow = true;
  root.add(ferns);

  // World-bounds walls (invisible, keep players in the arena). HF-360: the
  // walls now reach down to the safety floor — the shore descends ~4 m below
  // the old y=0 wall base, and a swimmer must meet a wall there, not a gap.
  const boundWallHeight = 4 - FARCRYSIS_SAFETY_FLOOR_Y;
  const boundWallCentreY = (4 + FARCRYSIS_SAFETY_FLOOR_Y) / 2;
  const boundWalls = [
    box(builder, 'farcrysis-bound-n', [0, boundWallCentreY, -32.2], [65, boundWallHeight, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-s', [0, boundWallCentreY, 32.2], [65, boundWallHeight, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-w', [-32.2, boundWallCentreY, 0], [0.5, boundWallHeight, 65], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-e', [32.2, boundWallCentreY, 0], [0.5, boundWallHeight, 65], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
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

  // ---- HF-360: physics ground = terrain authority --------------------------
  //
  // The sculpted terrain becomes real collision as tangent-plane plates in
  // `physicsColliders` ONLY. They are deliberately kept OUT of `colliders`:
  // line-of-sight checks, bot horizontal avoidance and spawn validation all
  // iterate `colliders`, and a few thousand ground plates there would read as
  // walls. This is the established split map.ts already uses for ramps.
  const terrainPlates = farcrysisTerrainPhysicsTiles();
  for (const plate of terrainPlates) builder.physicsColliders.push(plate.box);

  // Bot feet track the same surface through the generic verticalNavigation
  // channel (authoredElevationAt in legacy-main) — platforms for the ground
  // grid and the catwalk deck, plus the stair flight as a ramp route.
  const verticalNavigation: ArenaVerticalNavigation = Object.freeze({
    routes: Object.freeze([
      { id: 'core-catwalk-stairs', foot: [2.9, 0, 4.6] as const, top: [2.9, 2.59, 1.35] as const },
    ]),
    ramps: Object.freeze([
      { id: 'core-catwalk-stairs', from: [2.9, 0, 4.6] as const, to: [2.9, 2.59, 1.35] as const, width: 1.2 },
    ]),
    platforms: Object.freeze([
      { id: 'core-catwalk', minX: -3.5, maxX: 3.5, minZ: -1.2, maxZ: 1.2, y: 2.59 },
      ...farcrysisBotGroundPlatforms(),
    ]),
  });
  root.userData.verticalNavigation = verticalNavigation;
  root.userData.farcrysisColliderAudit = Object.freeze(builder.colliderAudit.map((entry) => Object.freeze({ ...entry })));
  root.userData.farcrysisTerrainPlateCount = terrainPlates.length;

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
    // Below the deepest shore point: the plates own the ground; the flat
    // fail-safe floor only catches a true void fall (see physics.ts).
    physicsSafetyFloorY: FARCRYSIS_SAFETY_FLOOR_Y,
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
