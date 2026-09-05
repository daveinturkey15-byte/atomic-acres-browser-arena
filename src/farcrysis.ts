import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';
import type { ArenaVerticalNavigation } from './vertical-navigation';
import { applyFarcrysisArtwork } from './farcrysis-art';
import { collapseFarcrysisMaterialVocabulary } from './farcrysis-material-vocabulary';
import { addInteractables, buildFuelDrumInstances, FUEL_DRUM_HEIGHT, FUEL_DRUM_RADIUS } from './farcrysis-physics';
import {
  buildPalmStandInstances,
  enhancedPalmPlacements,
  TRUNK_HEIGHT as PALM_TRUNK_HEIGHT,
  type PalmPlacement,
} from './farcrysis-palms-enhanced';
import { lumpify } from './farcrysis-vegetation';
import { createWaterRippleTexture, registerScrollingWaterTexture } from './farcrysis-water-ripples';
import { bakeFarcrysisWaterDepth, createFarcrysisSeaSurfaceMaterial } from './farcrysis-water-surface';
import {
  farcrysisTerrainHeight,
  farcrysisTerrainPhysicsTiles,
  farcrysisTerrainProxyChunks,
  farcrysisBotGroundPlatforms,
  FARCRYSIS_SAFETY_FLOOR_Y,
  FARCRYSIS_WATER_LEVEL,
} from './farcrysis-terrain-authority';
import {
  FARCRYSIS_BOUNDS,
  FARCRYSIS_COVER_MIN,
  FARCRYSIS_MAX_SIGHTLINE,
  FARCRYSIS_PATROL_XZ,
  FARCRYSIS_SPAWNS_XZ,
} from './farcrysis-constants';

// HF-395 relational mid-map composition: every mid-map prop derives its world
// position from one of four quadrant landmark frames (see the module header).
import {
  FARCRYSIS_LANDMARKS,
  LANDMARK_BOULDER_SIZE_M,
  landmarkBoulderPosition,
  landmarkCratePlacements,
  landmarkFernPositions,
  landmarkHedgePositions,
  landmarkRubblePositions,
  landmarkTreePositions,
  landmarkWallSpecs,
} from './farcrysis-midmap-landmarks';
import {
  FARCRYSIS_LAYOUT_TABLES,
  FARCRYSIS_VERTICAL_CROSSING,
  FARCRYSIS_SCALE,
} from './farcrysis-layout';

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

/**
 * Authored spawns, seated on the terrain authority.
 *
 * The shared `spawnRecord` helper every flat-floored arena uses pins y at the
 * 1.7 m eye height, i.e. FEET AT y = 0. farcrysis has no floor at y = 0: its
 * ground is the analytic field `farcrysisTerrainHeight(x, z)`, and the runtime
 * uses the authored y verbatim (`player.position.copy(spawnPoint())` then
 * `characterPhysics.teleportEye(...)` in legacy-main). The pre-PASS-85 table
 * sat entirely on the beach corners, where the surface runs 0.08-0.50 m, so
 * the flat pin buried the feet by up to half a metre; anywhere on the island
 * interior it would have buried them by up to 7.3 m. Resolving y here is what
 * lets the table move off the beach at all.
 */
function spawnRecord(
  team0: readonly (readonly [number, number])[],
  team1: readonly (readonly [number, number])[],
): Record<Team, THREE.Vector3[]> {
  const seat = ([x, z]: readonly [number, number]): THREE.Vector3 =>
    new THREE.Vector3(x, farcrysisTerrainHeight(x, z) + FARCRYSIS_SCALE.eyeHeightM, z);
  return { 0: team0.map(seat), 1: team1.map(seat) };
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

type BoxOptions = {
  solid?: boolean;
  shots?: boolean;
  cover?: boolean;
  rotation?: [number, number, number];
  cast?: boolean;
  ballistic?: BallisticMaterialId;
};

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions = {},
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
    const surface = createBallisticSurface(
      `farcrysis-shot-${builder.shotSurfaces.length}`,
      name,
      b,
      { material: options.ballistic },
    );
    builder.shotSurfaces.push(surface);
    // HF-390: every other arena stamps the raycast mesh with its surface id and
    // authored family; f4rcry515 stamped neither, so `resolveShot` had no
    // `ballisticMaterial` hint and any non-penetrating weapon fell back to the
    // coarse name-based ImpactSurface instead of the authored family.
    mesh.userData.ballisticSurfaceId = surface.id;
    mesh.userData.ballisticMaterial = surface.material;
  }
  return mesh;
}

/** A body whose authored centre is the arena origin. */
function centred(
  builder: Builder,
  name: string,
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  return box(builder, name, [0, 0, 0], size, material, options);
}

/** Emit one authored body and its exact 180-degree partner. */
function pair(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions = {},
  firstSuffix = 'w',
  secondSuffix = 'e',
): void {
  box(builder, `${name}-${firstSuffix}`, position, size, material, options);
  box(builder, `${name}-${secondSuffix}`, [-position[0], position[1], -position[2]], size, material, options);
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
    // HF-390: 'metal' is an ImpactSurface, never a ballistic material family.
    // Authoring it here rated 21 core-station surfaces with a family the shared
    // resistance table does not carry, and traceBallisticPath threw on contact.
    ballistic: material instanceof THREE.MeshStandardMaterial && material.metalness > 0.4 ? 'structural-metal' : 'concrete',
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
  // Pass 76: metalness 0.35 + roughness 0.18 made the lagoon read as glossy
  // green marble (metal water reflects only the environment and goes dark).
  // Tropical water is a dielectric: near-zero metalness, mid roughness, and a
  // brighter turquoise that lets the sand gradient below read through.
  //
  // HF-394: the plane itself stays FLAT at the authored registry waterline —
  // buoyancy runs on the sim clock, this presentation on performance.now(),
  // so geometric swell here would visibly disagree with the player's bob.
  // All the motion lives in a procedural ripple NORMAL map instead: scrolling
  // micro-facets catch the sun as glints, which is what was missing when the
  // owner called the old surface plastic-flat. Roughness drops to 0.22 so
  // those facets actually produce directional specular; the map's variation
  // stops the broad glare the old roughness=1 flat look had.
  const lagoonRipples = createWaterRippleTexture(7, 7);
  // HF-394: on the WebGPU route the authored waterline surface is now a typed
  // TSL sea material (Fresnel sky reflection + depth-graded refraction
  // transmission, see farcrysis-water-surface.ts). The WebGL2 compat route and
  // test environments keep this plane's shipped look byte-for-byte via
  // compatOpacity. Shallow/deep colours bracket the old flat 0x2fa3ab tint so
  // the absorption ramp reads as depth, not as a regrade.
  const waterMat = createFarcrysisSeaSurfaceMaterial({
    baseColor: 0x1d7d88,
    shallowColor: 0x3fc2b7,
    roughness: 0.22,
    metalness: 0.02,
    opacityShallow: 0.42,
    opacityDeep: 0.72,
    compatOpacity: 0.62,
    normalMap: lagoonRipples?.texture ?? null,
    normalScale: 0.45,
  });
  if (lagoonRipples) {
    registerScrollingWaterTexture(lagoonRipples.texture, 0.021, 0.013);
  }
  const jungleLeafMat = standard(0x3d7a33, 0.85, 0.02); // pass 76: brightened for daylight
  const palmTrunkMat = standard(0x7a5b36, 0.9, 0.02);
  const rockMat = standard(0x8b8a87, 0.92, 0.1);
  // Pass 76: cool blue-grey read as fresh concrete; weathered warm stone fits
  // the "reclaimed by jungle" ruins the moss caps below dress.
  const ruinedWallMat = standard(0x8a877a, 0.95, 0.02);
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
  // Pass 76: beaconMat/hazardMat removed — the signal beacon is now a lashed
  // timber pyre and the warning barrels ride the shared fuel-drum builder.

  // Ground + water. HF-360: gameplay ground is no longer a flat y=0 plate —
  // the Rapier capsule stands on terrain plates compiled from the single
  // terrain authority (see the physicsColliders block near the end of this
  // builder), and the outer beach descends below the waterline so the HF-358
  // swimmable lagoon is actually reachable on foot. These flat planes remain
  // as presentation backstops under the sculpted terrain mesh only.
  //
  // HF-396 rescaled these for the 128 m island, but the HF-393 waterline
  // sits at Chebyshev ~55.18 (island half 55.5), so the 120 m plates
  // (half 60) floated ABOVE the lagoon (-0.18/-0.2 vs water -0.25) from
  // 55.2 out to 60 — a hard-edged yellow floor over the open water
  // (HF-394 visual audit, 2026-08-26). They now end at the shore-descent
  // start (edge distance 10 m -> half 54, size 108), where the sculpted
  // terrain is still at/above joinHeight 0.2 and hides them.
  // Pass 76 z-fight fix: these three backstop plates used to stack at
  // y = 0 / 0.01 / 0.02, INSIDE the sculpted terrain surface wherever the
  // interior dipped toward its -0.01 minimum — shimmering through the ground
  // at distance. The sculpted terrain mesh is the visible floor; the plates
  // only exist so a camera clipping through a seam sees ground-coloured
  // backstop instead of void, so they now sit safely BELOW the terrain's
  // interior minimum (still above the lagoon stack at -0.25) and the plates
  // keep their occlusion role).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(108, 108), mudMat);
  ground.name = 'farcrysis-ground-plate';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  root.add(ground);
  const beachRing = new THREE.Mesh(new THREE.PlaneGeometry(108, 108), sandMat);
  beachRing.name = 'farcrysis-beach-ring';
  beachRing.rotation.x = -Math.PI / 2;
  beachRing.position.y = -0.18;
  beachRing.receiveShadow = true;
  root.add(beachRing);

  const grassRing = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), grassMat);
  grassRing.name = 'farcrysis-jungle-floor';
  grassRing.rotation.x = -Math.PI / 2;
  grassRing.position.y = -0.16;
  grassRing.receiveShadow = true;
  root.add(grassRing);

  // The lagoon plane sits exactly at the registry water level — this surface
  // IS the arena's one authored waterline (water-authoring FARCRYSIS_WATER).
  // HF-394: 64x64 segments (2.2 m quads) so the baked per-vertex water-column
  // depth resolves the ~9 m shore band; the TSL sea material interpolates it
  // for the refraction/transmission ramp.
  const lagoonGeom = new THREE.PlaneGeometry(140, 140, 64, 64);
  bakeFarcrysisWaterDepth(lagoonGeom, false); // mesh-rotated: world z = -local y
  const water = new THREE.Mesh(lagoonGeom, waterMat);
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
    [-54, -54], [54, -54], [-54, 54], [54, 54],
    [-44, -60], [44, -60], [-44, 60], [44, 60],
  ];
  // Pass 76: these used to render as square box trunks with a flat slab of
  // "fronds" — the single worst FarCry-vibe offender at spawn. The VISUALS now
  // come from the shared enhanced-palm builder (one consolidated palm look
  // across the arena) while the gameplay colliders stay authored right here,
  // using the same [0.6 x trunkHeight x 0.6] proxy idiom HF-360 established
  // for the enhanced-palm trunks — collider tracks the visual trunk exactly.
  const gameplayPalms: PalmPlacement[] = palmPositions.map(([x, z], i) => {
    const scale = 0.92 + ((i * 7) % 4) * 0.09; // 0.92-1.19, deterministic
    return {
      x,
      z,
      baseY: groundY(x, z),
      yaw: (x * 13 + z * 7) * 0.11,
      lean: (((i * 5) % 3) - 1) * 0.06,
      scale,
      crownSpin: (x + z) * 0.17,
      crownTilt: (((i * 3) % 3) - 1) * 0.05,
      crownScale: scale,
    };
  });
  buildPalmStandInstances(root, gameplayPalms, 'farcrysis-gameplay-palm');
  for (const palm of gameplayPalms) {
    const trunkHeight = PALM_TRUNK_HEIGHT * palm.scale;
    const trunkCollider = box(
      builder,
      `farcrysis-palm-trunk-${palm.x}-${palm.z}`,
      [palm.x, palm.baseY + trunkHeight / 2, palm.z],
      [0.6, trunkHeight, 0.6],
      palmTrunkMat,
      { cast: false, ballistic: 'wood' },
    );
    trunkCollider.visible = false;
    trunkCollider.userData.collisionProxy = true;
  }
  // Pass 76: the skiffs were tilted salmon BOXES — the single ugliest object
  // in the spawn view. Each is now a real beached rowing skiff (planked hull,
  // flared gunwales, pointed bow, thwart benches) resting nearly flat; the
  // cover collider keeps its footprint and adopts the boat's gentler settle
  // rotation so silhouette and collision move together.
  const skiffSpecs: ReadonlyArray<{
    tag: string; x: number; z: number; yaw: number; pitch: number; roll: number;
  }> = [
    { tag: 'nw', x: -36, z: -48, yaw: 0.5, pitch: 0.05, roll: 0.09 },
    { tag: 'se', x: 36, z: 48, yaw: -2.6, pitch: -0.04, roll: -0.08 },
  ];
  const hullPaintMat = standard(0x6f8f92, 0.8, 0.08);   // sun-faded teal paint
  const hullWoodMat = standard(0x7d5f40, 0.9, 0.03);    // weathered interior
  for (const skiff of skiffSpecs) {
    const skiffCover = cover(
      builder,
      `farcrysis-skiff-${skiff.tag}`,
      [skiff.x, groundY(skiff.x, skiff.z) + 0.55, skiff.z],
      [4.2, 1.1, 2.1],
      standard(0x9c6b4a, 0.7, 0.2),
      [skiff.pitch, skiff.yaw, skiff.roll],
    );
    skiffCover.visible = false;
    skiffCover.userData.collisionProxy = true;

    const boat = new THREE.Group();
    boat.name = `farcrysis-skiff-${skiff.tag}-visual`;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 1.5), hullWoodMat);
    bottom.position.y = 0.2;
    boat.add(bottom);
    for (const side of [-1, 1] as const) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 0.12), hullPaintMat);
      plank.position.set(0, 0.5, side * 0.78);
      plank.rotation.x = side * -0.18; // flared gunwales
      boat.add(plank);
      // Bow planks angle inward to a point at the front.
      const bowPlank = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.12), hullPaintMat);
      bowPlank.position.set(-2.1, 0.52, side * 0.36);
      bowPlank.rotation.set(side * -0.14, side * -0.62, 0);
      boat.add(bowPlank);
    }
    const transom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 1.48), hullPaintMat);
    transom.position.set(1.78, 0.5, 0);
    boat.add(transom);
    for (const benchX of [-0.7, 0.7]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 1.4), hullWoodMat);
      bench.position.set(benchX, 0.62, 0);
      boat.add(bench);
    }
    for (const part of boat.children) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    boat.position.set(skiff.x, groundY(skiff.x, skiff.z), skiff.z);
    boat.rotation.set(skiff.pitch, skiff.yaw, skiff.roll);
    root.add(boat);
  }
  // Weathered limestone boulders framing each ruin's outer flank.
  //
  // HF-395 round 2: these were two LONE ABSOLUTE rocks — farcrysis-rock-nw at
  // (-28,-40) and farcrysis-rock-se at (28,40). Two of four quadrants had one
  // and two did not, so they broke the four-fold composition on sight, and
  // neither position was derived from anything. There is now one per
  // landmark, placed on the frame like every other prop in the composition.
  for (const frame of FARCRYSIS_LANDMARKS) {
    const [rx, rz] = landmarkBoulderPosition(frame);
    cover(
      builder,
      `farcrysis-rock-${frame.tag}`,
      [rx, groundY(rx, rz) + 0.5, rz],
      [LANDMARK_BOULDER_SIZE_M, 1.0, LANDMARK_BOULDER_SIZE_M],
      rockMat,
    );
  }

  // ---- Mid-map landmarks (HF-395 relational composition) --------------------
  //
  // Owner: "all the assets in the middle of the map just feel a bit thrown
  // together they're not very well coordinated." The old layout placed every
  // family from its own hand-listed absolute coordinates: four lone tilted
  // slabs on a ring, four floating symmetric crates, twelve scattered trees.
  // Independent scatter lists cannot read as intentional composition.
  //
  // The mid map is now composed as FOUR rotationally-symmetric jungle
  // landmarks (one per intercardinal quadrant). Each landmark groups an
  // old-growth grove, a broken ruin wall with a rubble-choked collapse gap,
  // a crate cache against the wall's inner face, and layered undergrowth —
  // all positions derived relationally from the shared frames in
  // farcrysis-midmap-landmarks.ts. Grove centres sit ON the spawn diagonals,
  // so the trees keep breaking the spawn-to-spawn sightlines the old
  // scattered canopy list existed for.
  const mossMat = standard(0x3e6a2e, 0.92, 0.01);
  for (const frame of FARCRYSIS_LANDMARKS) {
    // Broken ruin wall: two segments sharing one outward axis with a 0.8 m
    // collapse gap between them — one ruined structure, not lone slabs.
    for (const segment of landmarkWallSpecs(frame)) {
      const [wx, wz] = segment.pos;
      const wall = cover(
        builder,
        `farcrysis-ruined-wall-${frame.tag}-${segment.key}`,
        [wx, groundY(wx, wz) + 0.8, wz],
        [segment.size[0], segment.size[1], segment.size[2]],
        ruinedWallMat,
        [segment.tilt, segment.yaw, 0],
      );
      // Moss cap hugging the top edge + a vine drape down one face, parented
      // to the wall so they follow its authored tilt exactly.
      const cap = new THREE.Mesh(new THREE.BoxGeometry(segment.size[0] * 0.98, 0.1, segment.size[2] * 0.98), mossMat);
      cap.name = `farcrysis-ruined-wall-${frame.tag}-${segment.key}-moss`;
      cap.position.y = segment.size[1] / 2 + 0.03;
      cap.castShadow = false;
      wall.add(cap);
      const drape = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, segment.size[1] * 0.85, segment.size[2] * 0.4),
        mossMat,
      );
      drape.name = `farcrysis-ruined-wall-${frame.tag}-${segment.key}-vines`;
      drape.position.set(segment.size[0] / 2 + 0.04, 0.05, segment.size[2] * -0.14);
      drape.castShadow = false;
      wall.add(drape);
    }
    // Rubble choking the wall's collapse gap (presentation-only).
    landmarkRubblePositions(frame).forEach(([rx, rz], ri) => {
      const rock = new THREE.Mesh(lumpify(new THREE.IcosahedronGeometry(0.42 - ri * 0.09, 0), 0.1, 0x9a7), rockMat);
      rock.name = `farcrysis-ruin-rubble-${frame.tag}-${ri}`;
      rock.position.set(rx, groundY(rx, rz) + 0.18, rz);
      rock.rotation.y = rx * 1.7 + rz * 0.9;
      rock.castShadow = true;
      root.add(rock);
    });
    // Crate cache against the wall's inner face: stack_shapes two-tier stack
    // under segment A plus one single crate under segment B. The base crate
    // keeps the `farcrysis-crate-<tag>` name the wordmark plaques anchor to.
    for (const crate of landmarkCratePlacements(frame)) {
      const [cx, cz] = crate.pos;
      if (crate.tier === 1) {
        // HF-423 collider/visual parity. The comment that stood here claimed
        // "one collider covers both boxes of the stack". It did not: the base
        // crate's cover box tops out at groundY + 0.90 and this lid's visual
        // top face is at groundY + 1.755, so a player who climbed the stack
        // stood 0.855 m INSIDE a solid-looking crate. That is the exact
        // authored-mass-versus-movement-authority defect the arena forging
        // review in AGENTS.md forbids, and it was carried as an accepted
        // "hidden arena" row in src/walkable-surface-parity-gate.test.ts -
        // an excuse that expires the moment the arena ships.
        //
        // The upper tier now carries its own cover box, sized and seated on
        // its own visual. The stack becomes a full-height blocker rather than
        // vaultable waist cover, which is what a two-tier crate stack has
        // looked like all along.
        const topSize: [number, number, number] = [1.55, 0.85, 1.55];
        const topPos: [number, number, number] = [
          cx + Math.sin(crate.yaw) * 0.06,
          groundY(cx, cz) + 1.33,
          cz + Math.cos(crate.yaw) * 0.06,
        ];
        const top = cover(
          builder,
          `farcrysis-crate-${frame.tag}-stack-top`,
          topPos,
          topSize,
          crateMat,
          [0, crate.yaw, 0],
        );
        top.receiveShadow = true;
        continue;
      }
      cover(
        builder,
        crate.isStackBase ? `farcrysis-crate-${frame.tag}` : `farcrysis-crate-${frame.tag}-solo`,
        [cx, groundY(cx, cz) + 0.45, cz],
        [1.7, 0.9, 1.7],
        crateMat,
        [0, crate.yaw, 0],
      );
    }
  }

  // Mid-field canopy columns — collision-backed old-growth trees grouped INTO
  // the landmarks (radial clusters of three). They break the long
  // spawn-to-spawn diagonal sightlines so the map reads short-range COD, not
  // a cross-map sniper lane; the groves sit off the patrol/rotation lanes.
  const canopyTrees = FARCRYSIS_LANDMARKS.flatMap((frame) =>
    landmarkTreePositions(frame).map(([x, z], i) => ({ x, z, key: `${frame.tag}-${i}` })),
  );
  // Pass 76 idiom retained: invisible [1.5 x 2.6 x 1.5] trunk colliders whose
  // visuals are instanced organic trees (tapered trunk + two lumpified lobes).
  for (const tree of canopyTrees) {
    const g = groundY(tree.x, tree.z);
    const trunkCover = cover(builder, `farcrysis-canopy-trunk-${tree.key}`, [tree.x, g + 1.3, tree.z], [1.5, 2.6, 1.5], palmTrunkMat);
    trunkCover.visible = false;
    trunkCover.userData.collisionProxy = true;
  }

  {
    const count = canopyTrees.length;
    const trunkGeom = new THREE.CylinderGeometry(0.52, 0.72, 2.8, 9);
    trunkGeom.translate(0, 1.4, 0);
    const lobeGeom = lumpify(new THREE.SphereGeometry(1.0, 10, 7), 0.2, 0xca90);
    const canopyTrunks = farcrysisInstancedMesh(trunkGeom, standard(0x5f4630, 0.92, 0.02), count);
    canopyTrunks.name = 'farcrysis-canopy-trunk-visuals';
    const canopyLower = farcrysisInstancedMesh(lobeGeom, standard(0x3a6b2e, 0.9, 0.01), count);
    canopyLower.name = 'farcrysis-canopy-crown-lower';
    const canopyUpper = farcrysisInstancedMesh(lobeGeom, standard(0x458036, 0.88, 0.01), count);
    canopyUpper.name = 'farcrysis-canopy-crown-upper';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const { x, z } = canopyTrees[i];
      const g = groundY(x, z);
      const spin = (x * 0.7 + z * 0.13) % Math.PI;
      euler.set(0, spin, ((i % 3) - 1) * 0.04);
      q.setFromEuler(euler);
      m.compose(new THREE.Vector3(x, g, z), q, new THREE.Vector3(1 + (i % 3) * 0.08, 1 + ((i + 1) % 3) * 0.06, 1 + (i % 3) * 0.08));
      canopyTrunks.setMatrixAt(i, m);
      euler.set(((i % 3) - 1) * 0.08, spin * 1.7, 0);
      q.setFromEuler(euler);
      m.compose(new THREE.Vector3(x, g + 3.0, z), q, new THREE.Vector3(2.3 + (i % 4) * 0.12, 1.05, 2.2 + ((i + 2) % 4) * 0.12));
      canopyLower.setMatrixAt(i, m);
      euler.set(((i + 1) % 3 - 1) * 0.1, spin * 0.9 + 0.8, 0);
      q.setFromEuler(euler);
      m.compose(new THREE.Vector3(x + ((i % 3) - 1) * 0.3, g + 3.9, z + ((i % 2) - 0.5) * 0.4), q, new THREE.Vector3(1.5, 0.85, 1.45));
      canopyUpper.setMatrixAt(i, m);
    }
    for (const layer of [canopyTrunks, canopyLower, canopyUpper]) {
      layer.instanceMatrix.needsUpdate = true;
      layer.computeBoundingSphere();
      layer.castShadow = true;
      layer.receiveShadow = true;
      root.add(layer);
    }
  }
  // Low undergrowth beneath the canopy columns: lumpified shrub clumps
  // (dense, non-colliding) instead of the old floating leaf boxes.
  {
    const count = canopyTrees.length;
    const shrubGeom = lumpify(new THREE.IcosahedronGeometry(1.0, 1), 0.16, 0xd11);
    const shrubs = farcrysisInstancedMesh(shrubGeom, jungleLeafMat, count);
    shrubs.name = 'farcrysis-canopy-undergrowth';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const { x, z } = canopyTrees[i];
      euler.set(0, x * 0.31 + z * 0.17, 0);
      q.setFromEuler(euler);
      m.compose(
        new THREE.Vector3(x + ((i % 3) - 1) * 0.5, groundY(x, z) + 0.32, z + ((i % 2) - 0.5) * 0.6),
        q,
        new THREE.Vector3(1.15 + (i % 3) * 0.1, 0.5 + (i % 2) * 0.1, 1.1 + ((i + 1) % 3) * 0.1),
      );
      shrubs.setMatrixAt(i, m);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.computeBoundingSphere();
    shrubs.castShadow = true;
    root.add(shrubs);
  }

  // ---- Inner research-station core: two entrances, interior catwalk, raised desk
  const coreMat = stationMetalMat;
  // Core walls (structural, not cover-list — the station is a structure)
  const coreWall = (name: string, position: [number, number, number], size: [number, number, number]) =>
    box(builder, name, position, size, coreMat, { cast: true, ballistic: 'structural-metal' });
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
  box(builder, 'farcrysis-core-catwalk', [0, 2.5, 0], [7, 0.18, 2.4], standard(0x4c5b64, 0.5, 0.55), { cast: true, ballistic: 'structural-metal' });
  const stairMat = standard(0x4c5b64, 0.5, 0.55);
  // The arena's one warm emissive: the signal-beacon ember, shared with the
  // core work-light lenses (PASS 95 L4) so the lamp costs no new material.
  const warmEmberMat = new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.4 });
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
      { cast: true, ballistic: 'structural-metal' },
    );
  }
  // Raised command desk (cover)
  cover(builder, 'farcrysis-core-desk', [0, 0.65, 0], [3, 1.3, 1.6], standard(0x37454e, 0.4, 0.5));
  // Interior crates. HF-360: crate-b moved off the new stair footprint (it
  // sat at [3.4, 2.2], inside the flight) to the mirrored free corner.
  cover(builder, 'farcrysis-core-crate-a', [-3.4, 0.45, -2.2], [1.5, 0.9, 1.5], crateMat);
  cover(builder, 'farcrysis-core-crate-b', [3.4, 0.45, -2.2], [1.5, 0.9, 1.5], crateMat);
  // Research station window. PASS 95 L5 (HF-467): classified as it lands -
  // glass breaks and passes. Presentation stays exactly where it was; the
  // pane is registered as a non-solid shot surface so a round through it
  // reads as glass instead of falling through an unrated mesh.
  const windowMesh = box(builder, 'farcrysis-core-window-n', [-3, 2.1, -5.48], [3, 1.4, 0.08], stationGlassMat, {
    solid: false,
    shots: true,
    cast: false,
    ballistic: 'glass',
  });
  windowMesh.receiveShadow = false;

  // ---- PASS 95 layout stage, L4: the core interior shell -------------------
  //
  // SPEC.md section 3.4 left two things OPEN and section 7 L4 says resolve
  // them by reading, not assuming. Read at eda54adf: (1) the core has NO
  // floor distinct from the terrain - the flattened terrain pad at y = 0 is
  // the floor (farcrysis-terrain-authority); (2) `farcrysis-core-work-lights`
  // is declared in src/rendering/arenas/farcrysis.ts as a shadowed-local
  // practical, but NO emissive fixture geometry exists anywhere for it - a
  // light with no lamp. Both are built here.
  //
  // The floor is a poured-concrete slab 10.2 m square, top face 0.04 m above
  // the pad, inset 0.15 m from every wall's inner face so no slab edge is
  // coplanar with a wall (the HOUSE-INTERIOR coplanar class stays 0). It is
  // presentation plus a `concrete` shot surface, NOT a movement collider: the
  // Rapier capsule keeps standing on the terrain plates, the bot ground
  // platforms keep their y = 0, and a 0.04 m visual rise is far inside the
  // controller's support tolerance (the parity ledger records a 0.25 m step as
  // acceptable). Height 0.08 m is under the parity audit's 0.9 m "substantial"
  // floor, so it owes no collider by that gate either.
  //
  // The practical is a 180-degree PAIR of wall-mounted work lights, one on
  // the inner face of each long wall at 2.85 m (above the 2.6 m reach line):
  // a steel bracket, a hooded head, and a warm lens whose emissive is the
  // fixture the declared light reads as. A dark opening must be a dim lit
  // box, never a black quad (threejs-webgpu-interior-lighting-look) - this is
  // what puts a visible source in the box. `corePair` is the arena's
  // `pair()`: the core is rotationally symmetric about its centre (north
  // door x 0..4, south door x -4..0), so every interior fixture is authored
  // once and emitted twice at (x, z) and (-x, -z).
  // Materials are REUSED, not authored: the G4 ratchet (farcrysis-material-
  // vocabulary.test.ts) holds the arena at 166 distinct material objects and
  // a new material is a new pipeline in the fenced admission draw. The slab
  // takes the ruined-wall stone (weathered warm concrete), the bracket and
  // hood take the catwalk steel, and the lens takes the beacon ember glow -
  // the one warm emissive the arena already carries (hoisted below).
  const coreFloor = centred(builder, 'farcrysis-core-floor-slab', [10.2, 0.08, 10.2], ruinedWallMat, {
    solid: false,
    shots: true,
    cast: false,
    ballistic: 'concrete',
  });
  coreFloor.receiveShadow = true;
  const workLightMetalMat = stairMat;
  const workLightLensMat = warmEmberMat;
  const lampOptions = { solid: false, shots: true, cast: false, ballistic: 'thin-metal' as BallisticMaterialId };
  pair(builder, 'farcrysis-core-work-light-bracket', [-5.12, 2.85, 1.6], [0.16, 0.08, 0.08], workLightMetalMat, lampOptions);
  pair(builder, 'farcrysis-core-work-light-hood', [-4.9, 2.78, 1.6], [0.32, 0.22, 0.36], workLightMetalMat, lampOptions);
  pair(builder, 'farcrysis-core-work-light-lens', [-4.72, 2.72, 1.6], [0.04, 0.16, 0.3], workLightLensMat, { solid: false, shots: true, cast: false, ballistic: 'glass' });

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
    ballistic: BallisticMaterialId,
    rotation?: [number, number, number],
  ): void => {
    const proxy = box(builder, name, position, size, stationMetalMat, { cast: false, ballistic, rotation });
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
  };

  // Pass 76: the wreck was three plain boxes. Same footprint and collider,
  // but the fuselage is now a rounded weathered hull with a cracked wing,
  // tail fin, dead radial engine and beached floats — a proper "crashed on
  // the sand years ago" throwback silhouette.
  const seaplane = new THREE.Group();
  seaplane.name = 'farcrysis-throwback-seaplane';
  const hullMat = standard(0xb9c4c6, 0.55, 0.45);
  const wreckAccentMat = standard(0x8e6b4a, 0.75, 0.2);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 4.2, 10), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.position.y = 0.62;
  seaplane.add(hull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 8), hullMat);
  nose.position.set(-2.1, 0.62, 0);
  nose.scale.set(0.8, 1, 1);
  seaplane.add(nose);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.5, 9), standard(0x4a4f52, 0.5, 0.6));
  engine.rotation.z = Math.PI / 2;
  engine.position.set(-2.5, 0.62, 0);
  seaplane.add(engine);
  const propBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.18), standard(0x33383a, 0.5, 0.5));
  propBlade.position.set(-2.78, 0.62, 0);
  propBlade.rotation.x = 0.9; // bent from the crash
  seaplane.add(propBlade);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.15), standard(0xc7d4d9, 0.45, 0.4));
  wing.position.set(-0.4, 1.28, 0);
  wing.rotation.z = -0.06; // one wingtip dug into the sand
  seaplane.add(wing);
  const tailBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1.6, 8), hullMat);
  tailBoom.rotation.z = Math.PI / 2;
  tailBoom.position.set(2.7, 0.72, 0);
  seaplane.add(tailBoom);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.1), standard(0xc7d4d9, 0.45, 0.4));
  tailFin.position.set(3.3, 1.35, 0);
  tailFin.rotation.z = -0.2;
  seaplane.add(tailFin);
  for (const side of [-1, 1] as const) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 8), wreckAccentMat);
    float.rotation.z = Math.PI / 2;
    float.position.set(-0.4, 0.16, side * 0.85);
    seaplane.add(float);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), standard(0x6d7a83, 0.4, 0.6));
    strut.position.set(-0.4, 0.4, side * 0.75);
    seaplane.add(strut);
  }
  for (const part of seaplane.children) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  const seaplaneGround = groundY(48, -48);
  seaplane.position.set(48, seaplaneGround + 0.1, -48);
  seaplane.rotation.y = 0.7;
  seaplane.rotation.z = 0.04; // settled unevenly into the beach
  root.add(seaplane);
  // Hull collider matches the fuselage box, yawed with the wreck.
  colliderProxy('farcrysis-throwback-seaplane-collider', [48, seaplaneGround + 0.6, -48], [4.6, 1.2, 1.5], 'thin-metal', [0, 0.7, 0]);

  // Pass 76: the beacon was an orange box with a floating flame cube. Same
  // collider envelope, but it now reads as a castaway signal pyre: a lashed
  // timber tripod holding a fire basket with an emissive flame.
  const beaconGround = groundY(-48, 48);
  const beacon = new THREE.Group();
  beacon.name = 'farcrysis-throwback-signal-beacon';
  const beaconWood = standard(0x7a5b36, 0.9, 0.03);
  for (let leg = 0; leg < 3; leg += 1) {
    const angle = (leg / 3) * Math.PI * 2 + 0.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.0, 7), beaconWood);
    pole.position.set(Math.cos(angle) * 0.55, 1.4, Math.sin(angle) * 0.55);
    pole.rotation.set(Math.sin(angle) * -0.32, 0, Math.cos(angle) * 0.32);
    beacon.add(pole);
  }
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.5, 8, 1, true), standard(0x4f463c, 0.8, 0.3));
  basket.position.y = 2.5;
  beacon.add(basket);
  const flame = new THREE.Mesh(
    lumpify(new THREE.ConeGeometry(0.3, 0.9, 7), 0.08, 0xf1a),
    new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff7a20, emissiveIntensity: 1.6, roughness: 0.5 }),
  );
  flame.name = 'farcrysis-throwback-beacon-flame';
  flame.position.y = 3.1;
  beacon.add(flame);
  const emberGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), warmEmberMat);
  emberGlow.position.y = 2.72;
  beacon.add(emberGlow);
  for (const part of beacon.children) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  beacon.position.set(-48, beaconGround, 48);
  root.add(beacon);
  colliderProxy('farcrysis-throwback-signal-beacon-collider', [-48, beaconGround + 1.3, 48], [1.4, 2.6, 1.4], 'wood');

  // Pass 76: the warning barrels were squat orange cylinders. They now share
  // the fuel-drum builder with the interactable barrels (0.6 m dia x 0.9 m,
  // rust banding, recessed lid) and the collider proxy shrinks WITH the visual
  // so silhouette-vs-collision agreement is preserved.
  const barrelPositions: ReadonlyArray<readonly [number, number]> = [[-40, 40], [40, -40], [-10, -48], [10, 48]];
  buildFuelDrumInstances(
    root,
    barrelPositions.map(([x, z], index) => ({
      x,
      z,
      baseY: groundY(x, z),
      yaw: (x * 3 + z * 5) * 0.21,
      hazard: true,
      tintIndex: index,
    })),
    'farcrysis-throwback-drum',
  );
  for (const [x, z] of barrelPositions) {
    const g = groundY(x, z);
    // Cylinder collapsed to its bounding box — the same approximation the
    // interactable barrels already use in farcrysis-physics.ts.
    colliderProxy(
      `farcrysis-throwback-barrel-collider-${x}-${z}`,
      [x, g + FUEL_DRUM_HEIGHT / 2, z],
      [FUEL_DRUM_RADIUS * 2, FUEL_DRUM_HEIGHT, FUEL_DRUM_RADIUS * 2],
      'thin-metal',
    );
  }

  // Research tower legs (art tower at [-8.5, -8.5], legs at ±1.3 offsets in
  // farcrysis-art.ts addResearchTower) and cave arch pillars (art cave group
  // at [52, 32], yaw 1.2). World positions are derived from the same authored
  // constants; the arch OPENING stays clear so players can walk through it.
  for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as const) {
    const x = -8.5 + lx;
    const z = -8.5 + lz;
    colliderProxy(`farcrysis-art-tower-leg-collider-${lx}-${lz}`, [x, groundY(x, z) + 2.4, z], [0.26, 4.8, 0.26], 'structural-metal');
  }
  // HF-423: the tower's lookout platform (3.0 x 3.0 steel deck at local
  // y 4.86) and its dish (0.1 m disc at local y 6.2) carried NO authority at
  // all while the arena was hidden, and neither did the cave arch crown. That
  // is the "authored visible mass matches movement and projectile authority"
  // rule in AGENTS.md, and it was excused in
  // src/walkable-surface-parity-gate.test.ts by the words "hidden arena" -
  // an excuse that expires the moment the arena becomes selectable. Bullets
  // passed straight through a steel deck, and a player put on top of it by any
  // future route (or by the eye-clearance stage-3 teleporter) fell 4.95 m
  // through it. All three now block movement and stop shots on their own
  // visual footprint. The tower group sits at [-8.5, terrainHeight, -8.5], so
  // the deck's world height is that ground plus its authored local offset -
  // derived here rather than re-typed, so the collider tracks the art.
  const towerGroundY = groundY(-8.5, -8.5);
  colliderProxy('farcrysis-art-tower-platform-collider', [-8.5, towerGroundY + 4.86, -8.5], [3.0, 0.12, 3.0], 'structural-metal');
  colliderProxy('farcrysis-art-tower-dish-collider', [-8.5, towerGroundY + 6.2, -8.5], [1.6, 0.1, 1.6], 'thin-metal');
  const caveYaw = 1.2;
  for (const side of [-1, 1] as const) {
    const x = 52 + side * 1.5 * Math.cos(caveYaw);
    const z = 32 - side * 1.5 * Math.sin(caveYaw);
    colliderProxy(`farcrysis-art-cave-pillar-collider-${side > 0 ? 'r' : 'l'}`, [x, groundY(x, z) + 1.3, z], [0.7, 2.6, 1.6], 'concrete', [0, caveYaw, 0]);
  }
  // The arch CROWN, not the opening: the slab spans local y 2.4-3.0, so the
  // 0-2.4 m gap a player walks through stays clear. The comment above used to
  // say "the arch top stays open so players can walk through the arch", which
  // conflated the crown with the opening.
  colliderProxy('farcrysis-art-cave-arch-top-collider', [52, groundY(52, 32) + 2.7, 32], [3.8, 0.6, 1.4], 'concrete', [0, caveYaw, 0]);

  // Representative large palm trunks from the enhanced-palm art layer. The
  // placements are seeded-deterministic, so colliders and instances always
  // agree. Trunks within 2.5 m of a spawn stay collider-free so a spawn can
  // never be born wedged against a tree.
  const allSpawnXZ: ReadonlyArray<readonly [number, number]> = [
    [-52, -52], [-44, -48], [-48, -40], [-36, -52],
    [52, 52], [44, 48], [48, 40], [36, 52],
  ];
  for (const [index, palm] of enhancedPalmPlacements().entries()) {
    const nearSpawn = allSpawnXZ.some(([sx, sz]) => Math.hypot(palm.x - sx, palm.z - sz) < 2.5);
    if (nearSpawn) continue;
    const trunkHeight = PALM_TRUNK_HEIGHT * palm.scale;
    colliderProxy(`farcrysis-enhanced-palm-trunk-collider-${index}`, [palm.x, palm.baseY + trunkHeight / 2, palm.z], [0.6, trunkHeight, 0.6], 'wood');
  }

  // ---- Pass 69 interactables (crates, barrels, sandbag walls)
  addInteractables(builder);

  // ---- Jungle bushes + ferns (dressing, no collision) -----------------------
  // HF-395: these were two MORE independent absolute scatter lists (a grid
  // and an ellipse) — the "thrown together" look. Both families now hang off
  // the landmark frames: a hedgerow distributed along the back of each ruin
  // wall, and fern fans radially distributed at each grove base.
  const bushPositions = FARCRYSIS_LANDMARKS.flatMap((frame) => landmarkHedgePositions(frame));
  // Pass 76: box "bushes" become one instanced draw of lumpified shrub clumps.
  {
    const count = bushPositions.length;
    const bushGeom = lumpify(new THREE.IcosahedronGeometry(0.62, 1), 0.12, 0xb0511);
    const bushes = farcrysisInstancedMesh(bushGeom, jungleLeafMat, count);
    bushes.name = 'farcrysis-jungle-bushes';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const [x, z] = bushPositions[i];
      euler.set(0, x * 0.73 + z * 0.29, ((i % 3) - 1) * 0.08);
      q.setFromEuler(euler);
      // HF-360: seated on the terrain authority (was flat y=0.4).
      m.compose(
        new THREE.Vector3(x, groundY(x, z) + 0.3, z),
        q,
        new THREE.Vector3(0.85 + (i % 4) * 0.12, 0.6 + (i % 3) * 0.1, 0.85 + ((i + 2) % 4) * 0.12),
      );
      bushes.setMatrixAt(i, m);
    }
    bushes.instanceMatrix.needsUpdate = true;
    bushes.computeBoundingSphere();
    bushes.castShadow = true;
    root.add(bushes);
  }

  const fernPlacements = FARCRYSIS_LANDMARKS.flatMap((frame) => landmarkFernPositions(frame));
  const fernGeom = new THREE.BoxGeometry(0.5, 0.9, 0.18);
  const fernMat = standard(0x3d7a35, 0.85, 0.02);
  const ferns = farcrysisInstancedMesh(fernGeom, fernMat, fernPlacements.length);
  ferns.name = 'farcrysis-instanced-ferns';
  const fernMatrix = new THREE.Matrix4();
  fernPlacements.forEach(([x, z], i) => {
    fernMatrix.makeRotationY(x * 2.3 + z * 1.1);
    // HF-360: seated on the terrain authority (was flat y=0.45).
    fernMatrix.setPosition(x, groundY(x, z) + 0.45, z);
    ferns.setMatrixAt(i, fernMatrix);
  });
  ferns.castShadow = true;
  root.add(ferns);

  // World-bounds walls (invisible, keep players in the arena). HF-360: the
  // walls now reach down to the safety floor — the shore descends ~4 m below
  // the old y=0 wall base, and a swimmer must meet a wall there, not a gap.
  // HF-396: derived from FARCRYSIS_BOUNDS so the wall ring tracks the island
  // edge exactly instead of hardcoding the old +/-32 m footprint.
  const boundWallHeight = 4 - FARCRYSIS_SAFETY_FLOOR_Y;
  const boundWallCentreY = (4 + FARCRYSIS_SAFETY_FLOOR_Y) / 2;
  const half = FARCRYSIS_BOUNDS.maxX;
  const span = half * 2 + 1;
  const boundWalls = [
    box(builder, 'farcrysis-bound-n', [0, boundWallCentreY, -half - 0.2], [span, boundWallHeight, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-s', [0, boundWallCentreY, half + 0.2], [span, boundWallHeight, 0.5], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-w', [-half - 0.2, boundWallCentreY, 0], [0.5, boundWallHeight, span], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
    box(builder, 'farcrysis-bound-e', [half + 0.2, boundWallCentreY, 0], [0.5, boundWallHeight, span], standard(0x000000, 0.9, 0), { cast: false, ballistic: 'concrete' }),
  ];
  for (const wall of boundWalls) {
    wall.visible = false;
  }

  // Spawns — PASS 85 Lane R. Solved, not authored by eye:
  // `npx tsx scripts/qa/solve-farcrysis-spawns.ts`, which searches this
  // arena's own geometry under the HF-402 constraint set
  // (src/spawn-layout-constraints.ts: floor beneath, autostep route to the
  // enemy, cover in reach, no enemy spawn in sight, wall standoff, open arc,
  // team separation) with each candidate carrying its own terrain-resolved
  // height. Evidence: docs/evidence/pass85/lane-r/spawn-solve.json (committed;
  // the solver also writes an untracked copy under artifacts/, which is
  // git-ignored on purpose - cite the committed path).
  //
  // What it replaces, measured: four points per team inside a 16 x 12 m
  // beach corner of a 128 x 128 m island - the exact layout
  // src/spawn-layout-quality.test.ts names in its own preamble - spanning
  // 0.125 of the longer axis against that gate's 0.18 floor, with the whole
  // interior, the ruined core and the ridge unused by either team.
  //
  // Measured after: 6 + 6 points, 100% in envelope (floor, route, cover,
  // standoff, arc all pass), team spreads 0.219 and 0.344 of the longer axis,
  // cross-team minimum 48.8 m = 0.381 of it (gate floor 0.33), nearest
  // enemy spawn with a sightline 48.8 m away (gate floor 30 m).
  //
  // The NW/SE diagonal split of the old table is kept: team 0 owns
  // (x + z) / 2 <= -17, team 1 owns >= +17.
  //
  // The coordinates themselves live in farcrysis-constants.ts, the arena's leaf
  // module, because farcrysis-vegetation.ts needs them too and used to keep a
  // hand-copied second table (see FARCRYSIS_SPAWNS_XZ).
  const spawns: Record<Team, THREE.Vector3[]> = spawnRecord(FARCRYSIS_SPAWNS_XZ[0], FARCRYSIS_SPAWNS_XZ[1]);

  const patrolPoints = FARCRYSIS_PATROL_XZ.map(([x, z]) => new THREE.Vector3(x, 0, z));

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

  // ---- HF-423: the ground is now a RAYCAST surface too ---------------------
  //
  // Those plates are rotated, and both consumers of a downward probe skip
  // rotated boxes: the shared HF-402 `floorBeneath` (spawn quality) and the
  // hitscan path, which only ever sees `raycastMeshes`. So this arena had no
  // floor under the spawn rule (MEASURED: 202 of 3,136 dry cells, 6.44 %, all
  // prop tops) and no ground under gunfire. Every other shipped arena pushes
  // its ground mesh into `raycastMeshes`; farcrysis simply never did.
  //
  // 256 invisible chunk meshes (16 x 16 over the 128 m island, 8 m each, 288
  // triangles apiece = 73,728 in total) carry the collision-only triangulation,
  // so a ray's per-mesh bounding-box rejection leaves ~288 triangles to walk
  // instead of all 73,728. MEASURED at this head with
  // `farcrysisTerrainProxyChunks()`: 256 chunks / 73,728 triangles, matching
  // `docs/evidence/pass87/lane-r/floor-coverage-after-shotbox.json`
  // (terrainProxyMeshes 256, terrainProxyTriangles 73728). An earlier revision
  // of this comment described an abandoned 4 x 4 x 32 layout and was wrong.
  // They stay OUT of `colliders` for the same reason the
  // plates do — LOS, bot avoidance and spawn validation must not read the
  // ground as walls.
  const terrainProxyGroup = new THREE.Group();
  terrainProxyGroup.name = 'farcrysis-terrain-collision-proxy';
  for (const chunk of farcrysisTerrainProxyChunks()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // The mud material is reused rather than authored: the mesh never renders,
    // and a fresh material here would be a fresh node graph and a fresh render
    // pipeline on an arena whose admission cost is the thing under repair.
    const mesh = new THREE.Mesh(geometry, mudMat);
    mesh.name = chunk.id;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.userData.collisionProxy = true;
    mesh.userData.farcrysisTerrainProxy = true;
    mesh.userData.impactSurface = classifyImpactSurface({ name: chunk.id });
    terrainProxyGroup.add(mesh);
    builder.raycastMeshes.push(mesh);
    const surface = createBallisticSurface(chunk.id, chunk.id, chunk.bounds, { material: 'earth' });
    builder.shotSurfaces.push(surface);
    mesh.userData.ballisticSurfaceId = surface.id;
    mesh.userData.ballisticMaterial = surface.material;
  }
  root.add(terrainProxyGroup);

  // Bot feet track the same surface through the generic verticalNavigation
  // channel (authoredElevationAt in legacy-main) — platforms for the ground
  // grid and the catwalk deck, plus the stair flight as a ramp route.
  const verticalNavigation: ArenaVerticalNavigation = Object.freeze({
    routes: Object.freeze([
      { id: FARCRYSIS_VERTICAL_CROSSING.id, foot: FARCRYSIS_VERTICAL_CROSSING.foot, top: FARCRYSIS_VERTICAL_CROSSING.top },
    ]),
    ramps: Object.freeze([
      {
        id: FARCRYSIS_VERTICAL_CROSSING.id,
        from: FARCRYSIS_VERTICAL_CROSSING.foot,
        to: FARCRYSIS_VERTICAL_CROSSING.top,
        width: FARCRYSIS_VERTICAL_CROSSING.widthM,
      },
    ]),
    platforms: Object.freeze([
      { id: 'core-catwalk', minX: -3.5, maxX: 3.5, minZ: -1.2, maxZ: 1.2, y: 2.59 },
      ...farcrysisBotGroundPlatforms(),
    ]),
  });
  root.userData.verticalNavigation = verticalNavigation;
  root.userData.farcrysisLayout = FARCRYSIS_LAYOUT_TABLES;
  root.userData.farcrysisColliderAudit = Object.freeze(builder.colliderAudit.map((entry) => Object.freeze({ ...entry })));
  root.userData.farcrysisTerrainPlateCount = terrainPlates.length;

  // PASS 94 rework slice 1 - the arena's ONE material vocabulary.
  //
  // LAST line of the build on purpose. Every name-keyed material mutator
  // (applyFarcrysisTextures' classifier, applyFarcrysisShadeLift's emissive
  // patterns, the crate-shard polygonOffset tiering) has already run, so the
  // differences they author are IN the render state and the collapse key
  // separates them without knowing any of those classifiers. Moving this call
  // earlier reintroduces exactly the merge it is written to avoid - see rule 2
  // in src/farcrysis-material-vocabulary.ts.
  root.userData.farcrysisMaterialVocabulary = collapseFarcrysisMaterialVocabulary(root);

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
