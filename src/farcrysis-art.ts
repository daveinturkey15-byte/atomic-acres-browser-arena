/**
 * farcrysis-art.ts — Pass 69 art/feel lane (spec R9 / C11).
 *
 * Golden-hour beach/jungle presentation: throwback props, instanced
 * multi-type foliage (≥3 instanced types), lagoon sparkle, and
 * palette/feel constants. Presentation only — never adds colliders,
 * shot surfaces, spawns, patrols, cover or gameplay authority.
 *
 * Mounted from farcrysis.ts at the end of buildFarcrysis so the
 * gameplay scene and visual-definition review copies both receive
 * the art layer.
 */
import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import {
  applyFarcrysisGroundMaterial,
  FARCRYSIS_GROUND_EXTENT_M,
} from './farcrysis-ground-materials';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
// HF-395: crate wordmarks derive from the SAME landmark frames the builder's
// colliders use — previously this table duplicated absolute coordinates and
// silently drifted from the builder.
import {
  FARCRYSIS_LANDMARKS,
  LANDMARK_FRINGE_OUTWARD,
  distributeAlongAxis,
  landmarkWordmarkAnchor,
  localToWorld,
  radialCluster,
  type Vec2,
} from './farcrysis-midmap-landmarks';
import { buildVegetation, animateVegetationWind, setVegetationLOD, lumpify } from './farcrysis-vegetation';
// terrain.ts ShaderMaterial effects disabled for TSL review compatibility.
// Terrain + water provided inline; lighting simplified to standard lights.
import { applyFarcrysisTextures } from './farcrysis-textures';
import {
  farcrysisTerrainHeight as terrainHeight,
  FARCRYSIS_WATER_LEVEL,
} from './farcrysis-terrain-authority';
import {
  FARCRYSIS_INLAND_DEPTH,
  FARCRYSIS_WATERLINE_EDGE,
  farcrysisEdgeBandPoint,
  farcrysisEdgeDistance,
  farcrysisSquarePoint,
} from './farcrysis-shore-bands';
import { applyVista, animateVista } from './farcrysis-vista';
import { applyMountains } from './farcrysis-mountains';
import { buildEnhancedPalms } from './farcrysis-palms-enhanced';
import { applyGroundTextures } from './farcrysis-ground-textures';
import { buildWaterFX, animateWaterFX } from './farcrysis-water-fx';
import { buildDetail, animateDetail } from './farcrysis-detail';
import { buildAtmosphere, animateAtmosphere, softDotTexture } from './farcrysis-atmosphere';
import { createWaterRippleTexture, registerScrollingWaterTexture } from './farcrysis-water-ripples';
import { bakeFarcrysisWaterDepth, createFarcrysisSeaSurfaceMaterial } from './farcrysis-water-surface';
// HF-396: the instanced tropical grass FIELD (bezier blades, layered wind,
// SSS, slope-aware placement, chunk distance LOD).
import { buildFarcrysisGrassField, animateGrassField } from './farcrysis-grass-field';

// TSL-compatible inline replacements for terrain.ts ShaderMaterial effects.
// All use standard Three.js materials (MeshStandardMaterial, MeshBasicMaterial).

// ---------------------------------------------------------------------------
// Material / naming helpers
// ---------------------------------------------------------------------------

const mat = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const emissiveMat = (color: number, intensity = 1.0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0.15 });

function makeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number],
  options?: { rotation?: [number, number, number]; castShadow?: boolean; scale?: [number, number, number] },
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  if (options?.rotation) mesh.rotation.set(...options.rotation);
  if (options?.scale) mesh.scale.set(...options.scale);
  mesh.castShadow = options?.castShadow !== false;
  mesh.receiveShadow = true;
  // Explicitly mark as art-layer dressing so profile filters never
  // accidentally hide it.
  mesh.userData.farcrysisArt = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Feel / palette constants
// ---------------------------------------------------------------------------

export const FARCRYSIS_ART_FEEL = Object.freeze({
  // Sun + ambient (mirrors the visual-definition per the golden-hour brief)
  goldenHourSunTint: 0xffd9a0,
  goldenHourSunIntensity: 3.1,
  jungleDappleTint: 0x9fd8a8,
  ambientColor: 0x9fbfa8,
  ambientIntensity: 0.42,
  // Presentation material tones
  beachSand: 0xd9c08a,
  palmTrunk: 0x7a5b36,
  palmFrond: 0x3f7c31, // pass 76: brightened for daylight grade
  bushGreen: 0x468a3c,
  fernGreen: 0x3e8638,
  towerMetal: 0x6d7a83,
  antenna: 0x8b9aaa,
  beaconLight: 0xe8862b,
  caveRock: 0x5a5550,
  tikiWood: 0x8b6b4a,
  tikiBand: 0xd85330,
  crateStamp: 0xf0a840,
  // Sparkle / atmosphere
  waterSparkleColor: 0xd4f0ff,
  // Camera-feel constants (advisory — actual camera is engine-managed)
  preferredReviewFov: 70,
  goldenHourExposure: 1.08,
} as const);

// ---------------------------------------------------------------------------
// 1. Throwback — derelict research tower + antenna mast
// ---------------------------------------------------------------------------

function addResearchTower(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'farcrysis-art-tower';

  const metal = mat(FARCRYSIS_ART_FEEL.towerMetal, 0.35, 0.65);
  const cornerMetal = mat(FARCRYSIS_ART_FEEL.antenna, 0.3, 0.7);

  // Pass 76: the "tower" was four floating box columns with sparse strips.
  // Now a proper derelict lattice: tubular legs with a slight inward rake,
  // X-braced bays on every face, a railed lookout platform and rust tones.
  const legRadius = 0.09;
  const legHeight = 4.8;
  const legHalf = 1.3;
  const rustMetal = mat(0x6e5a48, 0.7, 0.45); // weathered rust over the grey
  const legGeom = new THREE.CylinderGeometry(legRadius * 0.7, legRadius, legHeight, 7);
  const legs: [number, number][] = [
    [-legHalf, -legHalf], [legHalf, -legHalf], [-legHalf, legHalf], [legHalf, legHalf],
  ];
  for (const [lx, lz] of legs) {
    const leg = makeMesh(legGeom, cornerMetal, 'farcrysis-art-tower-leg', [lx, legHeight / 2, lz]);
    // Rake the leg tops toward centre (~0.25 m) for a real lattice-tower splay.
    leg.rotation.set(lz > 0 ? -0.052 : 0.052, 0, lx > 0 ? 0.052 : -0.052);
    group.add(leg);
  }

  // X-bracing: two crossed diagonals per bay per face (the lattice look).
  const bayHeights = [0.9, 2.1, 3.3];
  const braceLength = Math.hypot(legHalf * 2, 1.2);
  const braceGeom = new THREE.CylinderGeometry(0.03, 0.03, braceLength, 5);
  const diagonalTilt = Math.atan2(legHalf * 2, 1.2);
  for (const bayY of bayHeights) {
    for (const side of [-1, 1] as const) {
      for (const flip of [-1, 1] as const) {
        // Faces perpendicular to Z
        const braceZ = makeMesh(braceGeom, rustMetal, 'farcrysis-art-tower-brace-x', [0, bayY, side * legHalf]);
        braceZ.rotation.set(0, 0, flip * diagonalTilt);
        group.add(braceZ);
        // Faces perpendicular to X
        const braceX = makeMesh(braceGeom, rustMetal, 'farcrysis-art-tower-brace-z', [side * legHalf, bayY, 0]);
        braceX.rotation.set(flip * diagonalTilt, 0, Math.PI / 2);
        group.add(braceX);
      }
    }
    // Horizontal ring closing each bay
    const ringGeomH = new THREE.BoxGeometry(legHalf * 2.05, 0.07, 0.07);
    const ringGeomV = new THREE.BoxGeometry(0.07, 0.07, legHalf * 2.05);
    group.add(makeMesh(ringGeomH, cornerMetal, 'farcrysis-art-tower-ring-h', [0, bayY + 0.6, -legHalf]));
    group.add(makeMesh(ringGeomH, cornerMetal, 'farcrysis-art-tower-ring-h', [0, bayY + 0.6, legHalf]));
    group.add(makeMesh(ringGeomV, cornerMetal, 'farcrysis-art-tower-ring-v', [-legHalf, bayY + 0.6, 0]));
    group.add(makeMesh(ringGeomV, cornerMetal, 'farcrysis-art-tower-ring-v', [legHalf, bayY + 0.6, 0]));
  }

  // Lookout platform with a rail — a place a sniper COULD have lived.
  group.add(makeMesh(
    new THREE.BoxGeometry(3.0, 0.12, 3.0), metal,
    'farcrysis-art-tower-platform',
    [0, legHeight + 0.06, 0],
  ));
  const railGeomH = new THREE.BoxGeometry(3.0, 0.05, 0.05);
  const railGeomV = new THREE.BoxGeometry(0.05, 0.05, 3.0);
  for (const side of [-1, 1] as const) {
    group.add(makeMesh(railGeomH, rustMetal, 'farcrysis-art-tower-rail-h', [0, legHeight + 0.7, side * 1.48]));
    // 1.5 cm drop where the rails lap at the corners — welded-pipe rails DO
    // overlap like this, and it keeps the coplanar-surface audit clean.
    group.add(makeMesh(railGeomV, rustMetal, 'farcrysis-art-tower-rail-v', [side * 1.48, legHeight + 0.685, 0]));
    for (const other of [-1, 1] as const) {
      group.add(makeMesh(
        new THREE.BoxGeometry(0.05, 0.64, 0.05), rustMetal,
        'farcrysis-art-tower-rail-post',
        [side * 1.48, legHeight + 0.38, other * 1.48],
      ));
    }
  }

  // Antenna mast (long thin cylinder)
  const antennaGeom = new THREE.CylinderGeometry(0.08, 0.1, 3.8, 8);
  const antenna = makeMesh(antennaGeom, cornerMetal, 'farcrysis-art-tower-antenna', [0, legHeight + 2.0, 0]);
  group.add(antenna);

  // Red beacon light (emissive sphere)
  const beaconGeom = new THREE.SphereGeometry(0.22, 8, 6);
  group.add(makeMesh(beaconGeom, emissiveMat(FARCRYSIS_ART_FEEL.beaconLight, 1.8), 'farcrysis-art-tower-beacon', [0, legHeight + 4.0, 0]));

  // Small dish (cylinder disc) near top
  const dishGeom = new THREE.CylinderGeometry(0.8, 0.7, 0.1, 12);
  group.add(makeMesh(dishGeom, cornerMetal, 'farcrysis-art-tower-dish', [0, legHeight + 1.4, 0]));

  // Position near the research station core, outside the NW wall, with the
  // leg bases seated on the terrain authority surface (HF-360).
  group.position.set(-8.5, terrainHeight(-8.5, -8.5), -8.5);
  root.add(group);
}

// ---------------------------------------------------------------------------
// 2. Throwback — flooded cave entrance (lagoon edge)
// ---------------------------------------------------------------------------

function addFloodedCave(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'farcrysis-art-cave';

  const rock = mat(FARCRYSIS_ART_FEEL.caveRock, 0.9, 0.05);
  const dark = mat(0x1a1a1a, 0.95, 0.01);

  // Rock arch: left pillar, right pillar, top slab
  const pillarGeom = new THREE.BoxGeometry(0.7, 2.6, 1.6);

  const leftPillar = makeMesh(pillarGeom, rock, 'farcrysis-art-cave-pillar-l', [-1.5, 1.3, 0]);
  const rightPillar = makeMesh(pillarGeom, rock, 'farcrysis-art-cave-pillar-r', [1.5, 1.3, 0]);
  group.add(leftPillar);
  group.add(rightPillar);

  // Arch top
  group.add(makeMesh(
    new THREE.BoxGeometry(3.8, 0.6, 1.4), rock,
    'farcrysis-art-cave-arch-top',
    [0, 2.7, 0],
  ));

  // Dark inner portal (facing outward toward lagoon)
  const portalGeom = new THREE.PlaneGeometry(2.8, 2.4);
  const portal = makeMesh(portalGeom, dark, 'farcrysis-art-cave-portal', [0, 1.4, -0.8], { rotation: [0, 0, 0] });
  portal.castShadow = false;
  group.add(portal);

  // Rock scatter at base
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const rx = Math.cos(angle) * 2.2;
    const rz = Math.sin(angle) * 1.0 * 0.6;
    group.add(makeMesh(
      new THREE.BoxGeometry(0.7 + (i % 3) * 0.2, 0.5 + (i % 2) * 0.3, 0.6 + (i % 2) * 0.4),
      rock,
      `farcrysis-art-cave-rubble-${i}`,
      [rx, 0.25, rz],
      { rotation: [0, angle, 0] },
    ));
  }

  // Place at lagoon's southern edge, facing inland, seated on the terrain
  // authority surface (HF-360).
  group.position.set(52, terrainHeight(52, 32), 32);
  group.rotation.y = 1.2;
  root.add(group);
}

// ---------------------------------------------------------------------------
// 3. Throwback — tiki-style markers (beach ring compass points)
// ---------------------------------------------------------------------------

function addTikiMarkers(root: THREE.Group): void {
  const tikiPositions: ReadonlyArray<readonly [number, number]> = [
    [0, -56], [0, 56], [-56, 0], [56, 0],
  ];

  for (const [tx, tz] of tikiPositions) {
    const post = new THREE.Group();
    post.name = `farcrysis-art-tiki-${tx}-${tz}`;

    const wood = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.85, 0.04);
    const band = mat(FARCRYSIS_ART_FEEL.tikiBand, 0.7, 0.08);

    // Main post
    post.add(makeMesh(new THREE.CylinderGeometry(0.22, 0.28, 2.4, 8), wood, 'farcrysis-art-tiki-post', [0, 1.2, 0]));

    // Pass 76: the painted bands were torus rings hovering off the post.
    // Carved bands are now slightly-proud cylinder sleeves flush with the
    // tapered post so they read as painted carvings, not floating hoops.
    for (let b = 0; b < 3; b += 1) {
      const bandY = 0.55 + b * 0.7;
      const postRadiusAtBand = 0.28 - (bandY / 2.4) * 0.06; // follows the taper
      post.add(makeMesh(
        new THREE.CylinderGeometry(postRadiusAtBand + 0.02, postRadiusAtBand + 0.02, 0.18, 8), band,
        `farcrysis-art-tiki-band-${b}`,
        [0, bandY, 0],
      ));
    }

    // Top carving (small angular shape — a cube tilted)
    const topGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    post.add(makeMesh(topGeom, wood, 'farcrysis-art-tiki-top', [0, 2.5, 0], { rotation: [0.3, 0.5, 0.2] }));

    // HF-360: seat each marker on the terrain authority surface (the old
    // constant 0.02 matched the beach shelf at these exact positions only
    // by coincidence).
    post.position.set(tx, terrainHeight(tx, tz), tz);
    root.add(post);
  }
}

// ---------------------------------------------------------------------------
// 4. Throwback / detail — crate wordmark stamp (original "f4rcry515")
// ---------------------------------------------------------------------------

function createWordmarkTexture(): THREE.Texture | null {
  // Prefer canvas in browser; fall back to a plain emissive colour stamp
  // in test / headless environments.
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('2d')) return null;
    return null; // Short-circuit: we'll ship a plain emissive stamp for now
    // since runtime canvas fonts may differ wildly and the pixel font above
    // is the authoritative representation.
  } catch {
    return null;
  }
}

function addCrateWordmarks(root: THREE.Group): void {
  const stampMat = emissiveMat(FARCRYSIS_ART_FEEL.crateStamp, 0.9);
  // HF-395: one plaque per landmark, anchored to the stack base crate's
  // outer face via the shared landmark module — same data as the collider,
  // so plaque and crate can never drift apart again.
  for (const frame of FARCRYSIS_LANDMARKS) {
    const anchor = landmarkWordmarkAnchor(frame);
    const [px, py, pz] = anchor.position;
    const plaque = makeMesh(
      new THREE.BoxGeometry(1.2, 0.4, 0.06), stampMat,
      `farcrysis-art-crate-stamp-${anchor.tag}`,
      [px, py, pz],
      { rotation: [0, anchor.yaw, 0] },
    );
    root.add(plaque);

    // Wordmark texture sprite when canvas is available; otherwise the
    // emissive plaque above is the stamp marker.
    const texture = createWordmarkTexture();
    if (texture) {
      const spriteMat = new THREE.SpriteMaterial({ map: texture, color: FARCRYSIS_ART_FEEL.crateStamp, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.name = `farcrysis-art-crate-wordmark-${anchor.tag}`;
      sprite.position.set(px + Math.sin(anchor.yaw) * 0.1, py, pz + Math.cos(anchor.yaw) * 0.1);
      sprite.scale.set(1.0, 0.35, 1);
      root.add(sprite);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Instanced foliage — bushes (jungle undergrowth, mid ring)
// ---------------------------------------------------------------------------

function addInstancedBushes(root: THREE.Group): void {
  // Pass 76: leaf-box bushes → lumpified organic clumps.
  // HF-395: was an independent polar scatter loop; the fringe row now
  // distributes along each landmark's outward axis (5 per landmark), so the
  // bushes frame the groves instead of sprinkling across the mid ring.
  const bushGeom = lumpify(new THREE.IcosahedronGeometry(0.72, 1), 0.14, 0xb05e);

  const placements = FARCRYSIS_LANDMARKS.flatMap((frame) =>
    distributeAlongAxis(localToWorld(frame, LANDMARK_FRINGE_OUTWARD, 0), frame.tangent, 2.0, 5)
      .map(([x, z], i) => ({ x, z, seed: frame.tag.charCodeAt(0) + i })),
  );
  const instances = farcrysisInstancedMesh(bushGeom, mat(FARCRYSIS_ART_FEEL.bushGreen, 0.9, 0.01), placements.length);
  instances.name = 'farcrysis-art-instanced-bushes';
  instances.castShadow = true;
  instances.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  placements.forEach(({ x, z, seed }, i) => {
    matrix.makeRotationY(x * 1.8 + seed);
    const bushScaleY = 0.75 + (seed % 3) * 0.16;
    matrix.scale(new THREE.Vector3(0.7 + (seed % 4) * 0.18, bushScaleY, 0.7 + ((seed + 1) % 4) * 0.18));
    // HF-360: seat each bush base on the terrain authority surface.
    matrix.setPosition(x, terrainHeight(x, z) + 0.45 * bushScaleY, z);
    instances.setMatrixAt(i, matrix);
  });

  instances.instanceMatrix.needsUpdate = true;
  root.add(instances);
}

// ---------------------------------------------------------------------------
// 7. Instanced foliage — fern clusters (scattered around mid ring / core edge)
// ---------------------------------------------------------------------------

function addInstancedFernClusters(root: THREE.Group): void {
  // Pass 76 idiom retained: three arched leaf cards per cluster on one draw.
  // HF-395: was an independent polar scatter; clusters now sit at radial
  // positions around each grove centre (4 per landmark), plus two planters
  // flanking the research-station doorways (offset from the core's authored
  // 5.5 m half-depth).
  const bladesPerCluster = 3;
  const CORE_HALF_DEPTH = 5.5;
  const DOOR_PLANTER_SETBACK = 1.9;
  const clusterPoints = [
    ...FARCRYSIS_LANDMARKS.flatMap((frame) => radialCluster(frame.center, 2.4, 4, frame.center[0] * 0.02)),
    [2.8, -(CORE_HALF_DEPTH + DOOR_PLANTER_SETBACK)] as Vec2,
    [-2.8, CORE_HALF_DEPTH + DOOR_PLANTER_SETBACK] as Vec2,
  ];
  const count = clusterPoints.length * bladesPerCluster;
  const fernGeom = new THREE.BoxGeometry(0.42, 1.1, 0.05);
  fernGeom.translate(0, 0.55, 0); // pivot at the root so tilts arch outward

  const instances = farcrysisInstancedMesh(fernGeom, mat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  instances.name = 'farcrysis-art-instanced-fern-clusters';
  instances.castShadow = true;
  instances.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  clusterPoints.forEach(([px, pz], i) => {
    // HF-360: seat each fern cluster base on the terrain authority surface.
    const baseY = terrainHeight(px, pz) + 0.02;

    for (let blade = 0; blade < bladesPerCluster; blade += 1) {
      const bladeYaw = px * 2.7 + pz * 0.9 + i + (blade / bladesPerCluster) * Math.PI * 2;
      euler.set(0.32 + (blade % 2) * 0.14, bladeYaw, 0);
      quat.setFromEuler(euler);
      const fernScaleY = 0.7 + ((i + blade) % 4) * 0.2;
      matrix.compose(
        new THREE.Vector3(px, baseY, pz),
        quat,
        new THREE.Vector3(0.8 + ((i + blade) % 3) * 0.25, fernScaleY, 1),
      );
      instances.setMatrixAt(i * bladesPerCluster + blade, matrix);
    }
  });

  instances.instanceMatrix.needsUpdate = true;
  instances.computeBoundingSphere();
  root.add(instances);
}
// ---------------------------------------------------------------------------
// 8. Atmosphere — lagoon water sparkle
// ---------------------------------------------------------------------------

function addWaterSparkle(root: THREE.Group): void {
  const sparkleCount = 60;
  const positions = new Float32Array(sparkleCount * 3);
  // Sparkles only on the outer water ring, as an EDGE-DISTANCE band measured
  // from the square boundary face inward to just seaward of the waterline.
  // The old CIRCULAR 44-60 ring collapsed to Chebyshev r/sqrt(2) on the
  // corner diagonals, drawing water-height sparkles over dry island interior.
  const SPARKLE_BAND: Readonly<[number, number]> = [
    FARCRYSIS_WATERLINE_EDGE - 15,
    FARCRYSIS_WATERLINE_EDGE - 0.4,
  ];
  const sparkleRng = mulberry32(ART_SEED + 4);

  for (let i = 0; i < sparkleCount; i += 1) {
    // Rejection-draw a point over water inside the offshore sparkle band.
    for (;;) {
      const [px, pz] = farcrysisSquarePoint(sparkleRng, 1.5);
      const edge = farcrysisEdgeDistance(px, pz);
      if (edge >= SPARKLE_BAND[0] && edge <= SPARKLE_BAND[1]) {
        positions[i * 3 + 0] = px;
        positions[i * 3 + 1] = FARCRYSIS_WATER_LEVEL + 0.04; // just above the water surface
        positions[i * 3 + 2] = pz;
        break;
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Sparkle via an additive PointsMaterial. The soft-dot sprite matters here:
  // without a map each sparkle is a square, which on water reads as debris.
  const sparkleMat = new THREE.PointsMaterial({
    color: FARCRYSIS_ART_FEEL.waterSparkleColor,
    size: 0.15,
    map: softDotTexture(),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const points = new THREE.Points(geom, sparkleMat);
  points.name = 'farcrysis-art-water-sparkle';
  points.frustumCulled = false; // small, keep visible across the lagoon
  root.add(points);
}

// ---------------------------------------------------------------------------
// TSL-compatible inline terrain, lighting, and water (replaces terrain.ts)
// ---------------------------------------------------------------------------

// HF-360: the height function that used to live right here is now the arena's
// single terrain authority (farcrysis-terrain-authority.ts), shared with the
// physics plates, prop seating, vegetation and bot elevation. Imported above
// under its old local name so every call site below reads unchanged.

/**
 * Seeded PRNG (mulberry32, the same idiom farcrysis-physics.ts and
 * farcrysis-vegetation.ts already use). HF-360: world placement in this file
 * ran on Math.random, so every peer built a DIFFERENT arena — rocks, litter
 * and driftwood disagreed between host and clients. All placement below is
 * seeded so peers see identical worlds.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Base seed for this module's placement streams (arbitrary, stable). */
const ART_SEED = 0x0fa7c515;

// ARENA_HALF based on FARCRYSIS_BOUNDS
const ARENA_HALF = FARCRYSIS_BOUNDS.maxX;

function buildInlineTerrain(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = 'farcrysis-terrain';

  // HF-396: 192 segments keep the old ~0.67 m vertex spacing across the
  // doubled span, so the sculpted surface and its physics plates still agree.
  const w = ARENA_HALF * 2;
  const segs = 192;
  const geom = new THREE.PlaneGeometry(w, w, segs, segs);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    const edgeDist = ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
    // Pass 76 regrade: the interior tones were too pale, so under the warm
    // light stack the whole arena flattened into one beige. The jungle floor
    // is now a saturated humus green and the transition band leans green, so
    // the beach→jungle read survives the lighting.
    let r: number;
    let g: number;
    let b: number;
    if (edgeDist < 8) {
      r = 0.88; g = 0.79; b = 0.6; // coral sand
    } else if (edgeDist < 14) {
      r = 0.29; g = 0.41; b = 0.15; // grassy transition
    } else {
      r = 0.14; g = 0.3; b = 0.09; // jungle humus
      // HF-398 elevation read: the raised highland massifs must present as
      // ROCK, not flat green — otherwise 8 m of relief hides inside the
      // canopy colour. Blend humus toward bare grey-brown by STEEPNESS
      // (central-difference slope, the same signal grass MAX_SLOPE uses)
      // and by ALTITUDE, so flank scarps and high shoulders both read.
      // Deterministic analytic sampling — no RNG, no texture cost.
      const slope = Math.max(
        Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)),
        Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1)),
      ) / 2;
      const steep = THREE.MathUtils.smoothstep(slope, 0.55, 1.05);
      const high = THREE.MathUtils.smoothstep(h, 4.6, 7.4);
      const rock = Math.min(1, steep + 0.55 * high);
      if (rock > 0) {
        r += (0.32 - r) * rock;
        g += (0.29 - g) * rock;
        b += (0.25 - b) * rock;
      }
    }
    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.03 });
  // Vertex colour describes the ZONE (sand / transition / jungle floor); the
  // maps describe the SURFACE. Without the maps this is a smooth three-stop
  // gradient with no grain, which is why the ground read as coloured geometry.
  applyFarcrysisGroundMaterial(terrainMat, 'terrain');
  const terrainMesh = new THREE.Mesh(geom, terrainMat);
  terrainMesh.name = 'farcrysis-terrain-elevation';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.position.y = 0.04;
  group.add(terrainMesh);

  // Pass 76: the rock dressing was raw IcosahedronGeometry at random 3-axis
  // rotations — faceted d20s balancing on points. All three rock families now
  // share one lumpified FLAT-BOTTOMED boulder geometry (yaw-only rotation so
  // the flat base always seats on the ground), drawn as three InstancedMesh
  // sets, with the arena's procedural ground PBR maps for surface grain.
  const boulderGeometry = lumpify(new THREE.IcosahedronGeometry(1, 2), 0.2, 0xa7c1);
  {
    // Clamp the underside then rebase so y=0 is the seat plane.
    const pos = boulderGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, Math.max(pos.getY(i), -0.55) + 0.55);
    }
    pos.needsUpdate = true;
    boulderGeometry.computeVertexNormals();
  }
  const makeRockMaterial = (color: number): THREE.MeshStandardMaterial => {
    const rockMat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04 });
    // Ground-material grain at rock scale (repeat 2 ≈ 0.5 m tiles on a
    // metre-class boulder) so rocks share the terrain's surface language.
    applyFarcrysisGroundMaterial(rockMat, 'terrain', 2);
    rockMat.color.setHex(color); // applyFarcrysisGroundMaterial leaves colour, but be explicit
    return rockMat;
  };
  const scatterBoulders = (
    name: string,
    color: number,
    count: number,
    seed: number,
    place: (rng: () => number, index: number) => [number, number, number], // x, z, scale
  ): void => {
    const rocks = farcrysisInstancedMesh(boulderGeometry, makeRockMaterial(color), count);
    rocks.name = name;
    const rng = mulberry32(seed);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const [rx, rz, s] = place(rng, i);
      const baseY = terrainHeight(rx, rz);
      euler.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(euler);
      m.compose(
        // Slight sink so the jagged base edge bites into the soil.
        new THREE.Vector3(rx, baseY - 0.05 * s, rz),
        q,
        new THREE.Vector3(s * (0.85 + rng() * 0.4), s * (0.55 + rng() * 0.3), s),
      );
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.computeBoundingSphere();
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    group.add(rocks);
  };

  // Shore-edge bands (metres inward from the square boundary face), derived
  // from the terrain authority. The old CIRCULAR rings collapsed to
  // Chebyshev r/sqrt(2) on the corner diagonals — corner beaches starved,
  // waterline boulders inland, sparkles over dry hills.
  const CLIFF_ROCK_BAND: Readonly<[number, number]> = [
    FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.06,
    FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.35,
  ];
  const INTERIOR_BOULDER_BAND: Readonly<[number, number]> = [18, ARENA_HALF - 3];
  const SHORE_BOULDER_BAND: Readonly<[number, number]> = [
    FARCRYSIS_WATERLINE_EDGE - 2.5,
    FARCRYSIS_WATERLINE_EDGE + 4.5,
  ];

  // Cliff rocks along the jungle/beach transition band.
  scatterBoulders('farcrysis-cliff-rocks', 0x716b60, 28, ART_SEED + 1, (rng) => {
    const [rx, rz] = farcrysisEdgeBandPoint(rng, CLIFF_ROCK_BAND, 2);
    return [rx, rz, 0.8 + rng() * 1.1];
  });

  // Jungle floor boulders (scattered interior).
  scatterBoulders('farcrysis-interior-boulders', 0x7a7268, 12, ART_SEED + 2, (rng) => {
    const [rx, rz] = farcrysisEdgeBandPoint(rng, INTERIOR_BOULDER_BAND, 3);
    return [rx, rz, 0.35 + rng() * 0.5];
  });

  // Large boulders straddling the actual waterline.
  scatterBoulders('farcrysis-shore-boulders', 0x6d655c, 8, ART_SEED + 3, (rng) => {
    const [rx, rz] = farcrysisEdgeBandPoint(rng, SHORE_BOULDER_BAND, 0.8);
    return [rx, rz, 0.9 + rng() * 1.0];
  });

  // ---- Pass 69 density polish: beach litter, driftwood, interior undergrowth ----
  addBeachLitter(group);
  addDriftwoodLogs(group);
  addJungleUndergrowth(group);

  scene.add(group);

  // NO LOCAL SKY DOME.
  //
  // This arena used to add its own BackSide gradient sphere of radius 180 -
  // exactly the camera's far plane (camera.far = 180). A sphere sitting on the
  // far plane is partly inside the frustum and partly clipped, so a spherical
  // cap of it was culled every frame and the scene background showed through
  // the hole as a hard-edged disc of sky. That disc was the single most
  // obviously broken thing in the arena.
  //
  // It was also redundant. `applySkyBackdrop` already installs a real sky as
  // `scene.background`, which is why that module exists: a background is
  // resolved per-pixel behind everything and can never be frustum-clipped by
  // the far plane nor washed out by the fog band. The fix is therefore to
  // delete the competing dome rather than resize it, and to give the arena its
  // own backdrop preset ('jungle-golden-hour') instead of borrowing the
  // farmland sunset it used to share with Atomic Acres.
}

function buildInlineLighting(scene: THREE.Scene): void {
  // Pass 76 regrade: the arena's OWN lights stack on top of the engine lights
  // legacy-main creates from the visual definition, and the old values (warm
  // cream ambient 0.55 + warm cream hemi 0.5 + orange sun 2.8) drowned every
  // green in a beige golden wash — the audit's "beige golden-hour" P0. The
  // brief is saturated tropical DAYLIGHT: blue sky influence from above, a
  // warm (not orange) sun, and green bounce off the canopy from below.
  const ambient = new THREE.AmbientLight(0xdcecdf, 0.16);
  ambient.name = 'farcrysis-ambient';
  scene.add(ambient);

  // Sky/ground hemisphere carries most of the indirect light: pale tropical
  // blue from the sky dome, deep foliage green rising off the jungle floor.
  const hemi = new THREE.HemisphereLight(0x9fd0e8, 0x3c5f2c, 0.72);
  hemi.name = 'farcrysis-hemi';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
  sun.name = 'farcrysis-sun';
  sun.position.set(-18, 22, 25);
  sun.castShadow = true;
  // HF-375 (boot cost): this asked for 4096x4096 — the only light in the game
  // that did. A WebGPU object trace of the real boot showed farcrysis, alone
  // among the arenas, allocating two 4096x4096 depth textures, on top of the
  // 2048 map the engine's own sun already allocates for this arena.
  //
  // That engine sun points HERE. The arena's visual definition puts it at
  // [-18, 22, 25] as well (`arena-grade-identity.ts` FARCRYSIS_IDENTITY
  // .sunPosition), aimed at the same arena centre, so this light is a second
  // shadow map of the same sun from the same angle. Both must keep casting:
  // dropping one would leak this light's 2.1 of the 5.2 total sun intensity
  // into every shadow interior and wash the shadows out. But 4096 buys nothing
  // even so — over this light's +/-36 m volume, 2048 still resolves 28.4
  // texels/m, FINER than the engine sun's own 23.4 texels/m over its +/-44 m
  // volume (`graphics-refinement.ts` arena shadow volume). Shadow edges and
  // shadow contrast are therefore unchanged, and the arena stops asking the
  // driver for 4x the shadow-map rasterisation and ~100 MB of extra depth
  // memory at the exact moment the admission fence is realising every pipeline
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 170;
  sun.shadow.camera.left = -68;
  sun.shadow.camera.right = 68;
  sun.shadow.camera.bottom = -68;
  sun.shadow.camera.top = 68;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // Green canopy bounce from below softens undersides of rocks and fronds.
  // Deliberately does NOT castShadow so it cannot create secondary shadows.
  const bounce = new THREE.DirectionalLight(0x9cc76e, 0.2);
  bounce.name = 'farcrysis-bounce';
  bounce.position.set(0, -2, 0);
  scene.add(bounce);

  const fill = new THREE.DirectionalLight(0x8fb8d9, 0.3);
  fill.name = 'farcrysis-fill';
  fill.position.set(6, 10, -20);
  scene.add(fill);

  // Fallback fog for review copies (the live renderer overwrites this with
  // the visual definition's fog band) — same pale aqua-sage family so the
  // depth haze pulls toward the sea/sky instead of tinting the jungle beige.
  const fogColor = new THREE.Color(0xc9ddd2);
  scene.fog = new THREE.FogExp2(fogColor, 0.0022);
}

function buildInlineWater(scene: THREE.Scene): void {
  // HF-360: every stacked visual water plane is now expressed relative to the
  // ONE registry water level (water-authoring FARCRYSIS_WATER.level = -0.25,
  // which the arena-builder lagoon plane sits at). The visual stack keeps its
  // accepted millimetre offsets purely to avoid z-fighting: deep sits 30 mm
  // below the surface, the shallow lens 10 mm above the lagoon plane, and the
  // additive wave FX 30 mm above (farcrysis-water-fx.ts).

  // (a) Deep open water — extended to the visible horizon (176×176 m),
  //     richer tropical blue-green, below every additive water-FX layer.
  const deepSize = 176; // HF-396: horizon water clears the 128 m island (camera far = 180)
  // HF-394: 48x48 segments (~3.7 m quads) carry the baked per-vertex water
  // column depth for the TSL refraction ramp; this plane is mostly open sea,
  // so coarse quads resolve it fine and cost ~4.6 k static verts once.
  const deepGeom = new THREE.PlaneGeometry(deepSize, deepSize, 48, 48);
  deepGeom.rotateX(-Math.PI / 2);
  bakeFarcrysisWaterDepth(deepGeom, true); // pre-rotated: world z = local z

  // Pass 76: metalness 0.35 at roughness 0.15 is what made the sea read as
  // glossy green marble — metallic water reflects only the environment and
  // goes dark/waxy. Dielectric water: no metalness, moderate roughness, and
  // a deeper blue so the shallow→deep gradient (turquoise lens over sand
  // gradient ring, then this) reads like a real tropical shelf.
  //
  // HF-394: procedural ripple normal map, scrolled slower and coarser than
  // the lagoon plane so near and mid water never shimmer in lockstep. On the
  // WebGPU route the material is the typed TSL sea surface (Fresnel sky
  // reflection + depth-graded transmission, farcrysis-water-surface.ts);
  // compatOpacity keeps the WebGL2/test look byte-identical.
  const deepRipples = createWaterRippleTexture(4, 4);
  const deepMat = createFarcrysisSeaSurfaceMaterial({
    baseColor: 0x0e5e7e,
    shallowColor: 0x14606f,
    roughness: 0.24,
    metalness: 0.02,
    opacityShallow: 0.6,
    opacityDeep: 0.94,
    compatOpacity: 0.88,
    normalMap: deepRipples?.texture ?? null,
    normalScale: 0.5,
  });
  if (deepRipples) {
    registerScrollingWaterTexture(deepRipples.texture, 0.014, 0.009);
  }

  const deep = new THREE.Mesh(deepGeom, deepMat);
  deep.name = 'farcrysis-water-inline';
  deep.position.y = FARCRYSIS_WATER_LEVEL - 0.03;
  deep.receiveShadow = true;
  scene.add(deep);

  // (c) Shallow near-shore water — a lighter translucent lens over the
  //     beach shelf so the sand reads through the water near the shoreline.
  //     10 mm above the lagoon plane keeps it just below the additive wave
  //     surface (no z-fighting) while still above deep water.
  //     HF-395 square-shore fix: the lens must REACH PAST the actual
  //     waterline, which sits at Chebyshev ARENA_HALF -
  //     FARCRYSIS_WATERLINE_EDGE on every azimuth. The pre-rescale 40 m and
  //     the doubled 80 m squares both stopped ~15 m short of it, leaving a
  //     detached turquoise patch floating mid-lagoon while the real
  //     near-shore shelf kept deep-water shading. Inland the lens is hidden
  //     underground (terrain sits above the water level there), so covering
  //     the interior costs nothing visible.
  const shallowSize = Math.ceil((FARCRYSIS_INLAND_DEPTH + 2.5) * 2);
  const shallowGeom = new THREE.PlaneGeometry(shallowSize, shallowSize);
  shallowGeom.rotateX(-Math.PI / 2);

  const shallowMat = new THREE.MeshStandardMaterial({
    // Pass 76: brighter turquoise, fully dielectric — the sunlit shallow lens
    // over the sand shelf that sells "tropical lagoon" at a glance.
    //
    // HF-394: fine fast ripple detail (dense repeat, gentle normal scale) so
    // wading-depth water shows moving light instead of a static tint.
    color: 0x3fc2b7,
    roughness: 0.26,
    metalness: 0.0,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const shallowRipples = createWaterRippleTexture(11, 11);
  if (shallowRipples) {
    shallowMat.normalMap = shallowRipples.texture;
    shallowMat.normalScale = new THREE.Vector2(0.3, 0.3);
    registerScrollingWaterTexture(shallowRipples.texture, 0.027, -0.019);
  }

  const shallow = new THREE.Mesh(shallowGeom, shallowMat);
  shallow.name = 'farcrysis-water-shallow';
  shallow.position.y = FARCRYSIS_WATER_LEVEL + 0.01;
  shallow.renderOrder = 2;
  scene.add(shallow);

  // (d) Wet-sand shoreline transition — a square-frame plane conformed to
  //     the terrain height so it hugs the sand slope naturally.
  //     HF-395 square-shore fix: the band is derived from the terrain
  //     authority's waterline (FARCRYSIS_WATERLINE_EDGE, metres inland from
  //     the square boundary face) and STRADDLES it — 2.5 m of the band sits
  //     offshore (drowned under the sea planes, invisible) and 3.5 m lies on
  //     dry sand, so the damp read starts exactly where the water meets the
  //     beach on every azimuth, corners included. The pre-rescale
  //     `outer = ARENA_HALF / inner = outer - 8` band occupied edge
  //     distances 0..8 — entirely seaward of the 8.82 m waterline — so the
  //     dry beach showed no wet-sand transition at all while the real band
  //     lay hidden underwater.
  const bandInlandEdge = FARCRYSIS_WATERLINE_EDGE + 3.5;  // dry-sand reach
  const bandOffshoreEdge = FARCRYSIS_WATERLINE_EDGE - 2.5; // drowned reach
  const outer = ARENA_HALF - bandOffshoreEdge; // larger square (closer to the boundary)
  const inner = ARENA_HALF - bandInlandEdge;   // hole (further inland)
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer);
  shape.lineTo(outer, -outer);
  shape.lineTo(outer, outer);
  shape.lineTo(-outer, outer);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(inner, -inner);
  hole.lineTo(inner, inner);
  hole.lineTo(-inner, inner);
  hole.closePath();
  shape.holes.push(hole);

  const wetGeom = new THREE.ShapeGeometry(shape);
  wetGeom.rotateX(-Math.PI / 2);

  // Conform to the terrain slope so the band tracks the beach shelf exactly.
  const wetPos = wetGeom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wetPos.count; i++) {
    const h = terrainHeight(wetPos.getX(i), wetPos.getZ(i));
    wetPos.setY(i, h + 0.02);       // just above the terrain — no depth-fight
  }
  wetGeom.computeVertexNormals();

  // ShapeGeometry emits UVs in shape space, i.e. metres, whereas the terrain
  // plane emits 0..1. Normalising here lets both surfaces share one repeat, so
  // grain stays the same physical size as a player crosses the shoreline.
  const wetUv = wetGeom.attributes.uv as THREE.BufferAttribute | undefined;
  if (wetUv) {
    for (let i = 0; i < wetUv.count; i++) {
      wetUv.setXY(i, wetUv.getX(i) / FARCRYSIS_GROUND_EXTENT_M, wetUv.getY(i) / FARCRYSIS_GROUND_EXTENT_M);
    }
    wetUv.needsUpdate = true;
  }

  const wetMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a58,               // darker than dry sand — damp/wet shore
    metalness: 0.0,
  });
  // Roughness intentionally omitted above: the shore was authored at 0.95,
  // ROUGHER than the dry terrain behind it, which is backwards. A film of
  // water fills the grain and reflects, making wet sand the smoothest ground
  // in the arena; applyFarcrysisGroundMaterial sets the corrected value.
  applyFarcrysisGroundMaterial(wetMat, 'wet-sand');

  const wet = new THREE.Mesh(wetGeom, wetMat);
  wet.name = 'farcrysis-water-wetsand';
  wet.receiveShadow = true;
  scene.add(wet);
}

// ---------------------------------------------------------------------------
// Pass 69 density polish — beach litter, driftwood, fallen coconuts, and
// interior undergrowth. All standard MeshStandardMaterial (no ShaderMaterial,
// no PointsMaterial); presentation-only dressing, no colliders.
// ---------------------------------------------------------------------------

/** Sand-matched vertex colors so small beach litter blends into the sand. */
function tintBeachGeometry(geo: THREE.BufferGeometry, base: THREE.Color, spread: number, rng: () => number): THREE.BufferGeometry {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const v = 1 - spread + rng() * spread * 2;
    colors[i * 3 + 0] = base.r * v;
    colors[i * 3 + 1] = base.g * v;
    colors[i * 3 + 2] = base.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Scattered small rocks + shells on the beach ring (edgeDist < 8). */
function addBeachLitter(group: THREE.Group): void {
  const sand = new THREE.Color(FARCRYSIS_ART_FEEL.beachSand);
  const litterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.03 });
  const litterCount = 36;
  const rng = mulberry32(ART_SEED + 5);

  for (let i = 0; i < litterCount; i += 1) {
    // Square-shore sand band: the old CIRCULAR ring sat up to ~22 m inland
    // of the real waterline at the corner diagonals.
    const [rx, rz] = farcrysisEdgeBandPoint(rng, [1.2, 8.5], 0.8);
    const baseY = terrainHeight(rx, rz);

    // Every third item is a flattened shell; the rest are small lumpy rocks.
    const size = 0.06 + rng() * 0.12;
    const isShell = i % 3 === 0;
    const geo = isShell
      ? tintBeachGeometry(new THREE.SphereGeometry(size, 6, 4), sand, 0.16, rng)
      : tintBeachGeometry(new THREE.BoxGeometry(size * 2.2, size * 0.7, size * 1.6), sand, 0.22, rng);

    group.add(makeMesh(geo, litterMat, `farcrysis-beach-litter-${i}`, [rx, baseY + size * 0.3, rz], {
      rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
      castShadow: false,
    }));
  }
}

/** Driftwood logs washed up on the strand line (dry sand above the waterline). */
function addDriftwoodLogs(group: THREE.Group): void {
  const logMat = mat(0x8a7355, 0.92, 0.04);
  const logCount = 6;
  const rng = mulberry32(ART_SEED + 6);

  for (let i = 0; i < logCount; i += 1) {
    const [rx, rz] = farcrysisEdgeBandPoint(rng, [1.8, 7.5], 0.8);
    const baseY = terrainHeight(rx, rz);
    const length = 1.2 + rng() * 1.6;

    group.add(makeMesh(
      new THREE.CylinderGeometry(0.09, 0.14, length, 6),
      logMat,
      `farcrysis-driftwood-${i}`,
      [rx, baseY + 0.1, rz],
      // Rz(π/2) lays the cylinder horizontal; Ry spins it; Rx gives a slight tilt.
      { rotation: [(rng() - 0.5) * 0.25, rng() * Math.PI, Math.PI / 2], castShadow: true },
    ));
  }
}

/** Layered leaf-card undergrowth inside the jungle interior (edgeDist ≥ 14). */
function addJungleUndergrowth(group: THREE.Group): void {
  // Pass 76: this used to be 18 squashed BOXES — the audit's "undergrowth
  // boxes" P1. It is now one instanced draw of arched leaf CARDS at ~4x the
  // density: every accepted scatter point sprouts 4 tilted cards fanned at
  // different yaws/heights, which reads as layered ground foliage.
  const undergrowthMat = mat(0x35682f, 0.9, 0.02);
  undergrowthMat.side = THREE.DoubleSide; // tilted cards read from both faces
  const cardsPerClump = 4;
  const rng = mulberry32(ART_SEED + 7);
  const clumpCount = 36; // HF-396: 4x area, same single instanced draw
  const cardGeom = new THREE.BoxGeometry(0.85, 0.62, 0.035);
  cardGeom.translate(0, 0.31, 0); // pivot at the root so tilts arch outward
  const cards = farcrysisInstancedMesh(cardGeom, undergrowthMat, clumpCount * cardsPerClump);
  cards.name = 'farcrysis-undergrowth-leaf-cards';
  cards.castShadow = true;
  cards.receiveShadow = true;
  cards.userData.farcrysisArt = true;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  let placed = 0;
  for (let i = 0; i < clumpCount; i += 1) {
    // HF-395 square-shore fix: the old CIRCULAR dist 14-32 draw sampled the
    // pre-rescale interior radius, clustering every clump inside ~32 m of
    // the origin and leaving the outer half of the 128 m island's jungle
    // bare (the clamp + edge guard only trimmed the overflow). Placement is
    // now a uniform shore-edge band across the FULL interior, same as every
    // other art layer.
    const [rx, rz] = farcrysisEdgeBandPoint(rng, [14, ARENA_HALF - 4], 2);
    const rotY = rng() * Math.PI;
    const baseY = terrainHeight(rx, rz);

    for (let card = 0; card < cardsPerClump; card += 1) {
      const cardYaw = rotY + (card / cardsPerClump) * Math.PI * 2 + rng() * 0.6;
      const spread = 0.12 + rng() * 0.3;
      euler.set(0.3 + rng() * 0.35, cardYaw, (rng() - 0.5) * 0.2);
      quat.setFromEuler(euler);
      matrix.compose(
        new THREE.Vector3(rx + Math.cos(cardYaw) * spread, baseY + 0.02, rz + Math.sin(cardYaw) * spread),
        quat,
        new THREE.Vector3(0.7 + rng() * 0.7, 0.75 + rng() * 0.7, 1),
      );
      cards.setMatrixAt(placed, matrix);
      placed += 1;
    }
  }
  cards.count = placed; // skip slots dropped by the edge-distance guard
  cards.instanceMatrix.needsUpdate = true;
  cards.computeBoundingSphere();
  group.add(cards);
}

/**
 * Fallen coconuts scattered around the bases of the enhanced palms.
 * Reads exact palm trunk positions from the InstancedMesh matrices so every
 * coconut lands near a real trunk.
 */
export function addFallenCoconuts(root: THREE.Group, trunkInstances: THREE.InstancedMesh): void {
  const coconutMat = mat(0x6b4a2b, 0.75, 0.06);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const target = 20;
  let added = 0;
  const rng = mulberry32(ART_SEED + 8);

  for (let i = 0; i < trunkInstances.count && added < target; i += 1) {
    trunkInstances.getMatrixAt(i, matrix);
    pos.setFromMatrixPosition(matrix);
    // Drop 1-2 coconuts a short tumble from each trunk base
    const perPalm = i % 2 === 0 ? 2 : 1;
    for (let c = 0; c < perPalm && added < target; c += 1) {
      const offset = 0.35 + rng() * 0.55;
      const ang = rng() * Math.PI * 2;
      const cx = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, pos.x + Math.cos(ang) * offset));
      const cz = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, pos.z + Math.sin(ang) * offset));
      const baseY = terrainHeight(cx, cz);
      const size = 0.11 + rng() * 0.07;

      root.add(makeMesh(
        new THREE.SphereGeometry(size, 8, 6),
        coconutMat,
        `farcrysis-fallen-coconut-${added}`,
        [cx, baseY + size * 0.7, cz],
        { rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI], castShadow: false },
      ));
      added += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry: apply every art/feel lane addition to the arena root group.
// ---------------------------------------------------------------------------

export function applyFarcrysisArtwork(root: THREE.Group): void {
  // Throwback props
  addResearchTower(root);
  addFloodedCave(root);
  addTikiMarkers(root);
  addCrateWordmarks(root);

  // Instanced foliage — ≥3 types (enhanced palms, bushes, fern clusters)
  const palms = buildEnhancedPalms(root);
  addFallenCoconuts(root, palms.trunkInstances);
  addInstancedBushes(root);
  addInstancedFernClusters(root);

  // Atmosphere
  addWaterSparkle(root);

  // ---- Pass 69 re-authored art layer (dense vegetation, terrain, lighting, water) ----
  buildVegetation(root);

  // HF-396: real grass field over the interior plateau. Presentation only —
  // no colliders, no raycast/shot-surface registration (the existing foliage
  // exception in rendering/arenas/farcrysis.ts covers this layer).
  buildFarcrysisGrassField(root);

  // Terrain, lighting, and water modules expect Scene; cast through Object3D
  const s = root as unknown as import('three').Scene;
  buildInlineTerrain(s);
  buildInlineLighting(s);
  buildInlineWater(s);

  // Distant vista — ocean horizon, island silhouettes, seabirds (additive, no colliders)
  applyVista(s);

  // HF-398 mountain backdrop ring beyond the playfield (presentation-only,
  // one merged mesh, no colliders) — the horizon the island previously lacked.
  applyMountains(s);

  // Pass 69 procedural PBR textures — apply after all geometry is built
  applyFarcrysisTextures(root);
  // Procedural ground textures (canvas sand/earth — baseline; async PBR images may override)
  applyGroundTextures(s);

  // Pass 69 atmospheric polish (god rays, dust motes, fireflies, ground haze)
  buildAtmosphere(s);

  // Environmental detail polish: vines, moss, rocks, floor litter, reeds
  buildDetail(s);

  // Enhanced water FX — shoreline foam, wave surface, caustics, edge ripples
  buildWaterFX(s);

  // HF-346: apply polygonOffset tiering to coplanar crate shards and floor litter overlays.
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.name.includes('-shards-shard-')) {
      const match = node.name.match(/-shards-shard-(\d+)$/);
      const index = match ? parseInt(match[1], 10) : 0;
      const originalMat = Array.isArray(node.material) ? node.material[0] : node.material;
      if (originalMat) {
        const mat = originalMat.clone();
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1 - index;
        mat.polygonOffsetUnits = -1 - index;
        node.material = mat;
      }
    }
  });

  const vegeLitter = root.getObjectByName('farcrysis-vege-leaf-litter');
  if (vegeLitter instanceof THREE.Mesh) {
    const originalMat = Array.isArray(vegeLitter.material) ? vegeLitter.material[0] : vegeLitter.material;
    if (originalMat) {
      const mat = originalMat.clone();
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
      vegeLitter.material = mat;
    }
  }

  const detailLitter = root.getObjectByName('farcrysis-detail-floor-litter');
  if (detailLitter instanceof THREE.Mesh) {
    const originalMat = Array.isArray(detailLitter.material) ? detailLitter.material[0] : detailLitter.material;
    if (originalMat) {
      const mat = originalMat.clone();
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      detailLitter.material = mat;
    }
  }

  // Per-frame animation driver (wind sway, water/foam, god-rays, vegetation LOD).
  //
  // HF-359 audit fix: this was attached to `root`, a THREE.Group. three.js only
  // invokes onBeforeRender for objects that enter the render list — Mesh, Line,
  // Points, Sprite — so a Group's callback never fires and EVERY animated system
  // here was inert, including the LOD switching the arena's triangle budget
  // assumes. Bind it to a rendered mesh instead; the terrain is always visible.
  const animationHost = root.getObjectByName('farcrysis-terrain-elevation')
    ?? root.children.find((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true)
    ?? root;
  animationHost.onBeforeRender = (_renderer, _scene, camera) => {
    const t = performance.now() * 0.001;
    animateVegetationWind(t);
    // animateWater removed — ShaderMaterial-based water replaced with standard materials
    animateVista(t);
    animateAtmosphere(t);
    animateDetail(t);
    animateWaterFX(t);
    if (camera) {
      const dist = camera.position.distanceTo(root.position);
      setVegetationLOD(dist);
    }
    // HF-396: chunk-level distance LOD for the grass field.
    animateGrassField(camera);
  };
}
