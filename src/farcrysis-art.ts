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
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { buildVegetation, buildAdditionalVegetation, animateVegetationWind, setVegetationLOD } from './farcrysis-vegetation';
// terrain.ts ShaderMaterial effects disabled for TSL review compatibility.
// Terrain + water provided inline; lighting simplified to standard lights.
import { applyFarcrysisTextures } from './farcrysis-textures';
import { applyVista, animateVista } from './farcrysis-vista';
import { buildEnhancedPalms } from './farcrysis-palms-enhanced';
import { applyGroundTextures } from './farcrysis-ground-textures';
import { buildWaterFX, animateWaterFX } from './farcrysis-water-fx';
import { buildDetail, animateDetail } from './farcrysis-detail';
import { buildAtmosphere, animateAtmosphere } from './farcrysis-atmosphere';

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
  palmFrond: 0x2f6b2a,
  bushGreen: 0x3d7a35,
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

  // Four vertical legs (thin box columns)
  const legRadius = 0.14;
  const legHeight = 4.8;
  const legHalf = 1.3;
  const legGeom = new THREE.BoxGeometry(legRadius, legHeight, legRadius);
  const legs: [number, number][] = [
    [-legHalf, -legHalf], [legHalf, -legHalf], [-legHalf, legHalf], [legHalf, legHalf],
  ];
  for (const [lx, lz] of legs) {
    group.add(makeMesh(legGeom, cornerMetal, 'farcrysis-art-tower-leg', [lx, legHeight / 2, lz]));
  }

  // Cross-bracing (thin horizontal / diagonal strips)
  const braceGeomH = new THREE.BoxGeometry(legHalf * 2.1, 0.1, 0.1);
  const braceGeomV = new THREE.BoxGeometry(0.1, 0.1, legHalf * 2.1);
  for (let y = 1.2; y <= 3.6; y += 1.2) {
    group.add(makeMesh(braceGeomH, cornerMetal, 'farcrysis-art-tower-brace-h', [0, y, -legHalf]));
    group.add(makeMesh(braceGeomH, cornerMetal, 'farcrysis-art-tower-brace-h', [0, y, legHalf]));
    group.add(makeMesh(braceGeomV, cornerMetal, 'farcrysis-art-tower-brace-v', [-legHalf, y, 0]));
    group.add(makeMesh(braceGeomV, cornerMetal, 'farcrysis-art-tower-brace-v', [legHalf, y, 0]));
  }

  // Top platform
  group.add(makeMesh(
    new THREE.BoxGeometry(3.2, 0.16, 3.2), metal,
    'farcrysis-art-tower-platform',
    [0, legHeight + 0.08, 0],
  ));

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

  // Position near the research station core, outside the NW wall
  group.position.set(-8.5, 0, -8.5);
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

  // Place at lagoon's southern edge, facing inland
  group.position.set(26, 0, 16);
  group.rotation.y = 1.2;
  root.add(group);
}

// ---------------------------------------------------------------------------
// 3. Throwback — tiki-style markers (beach ring compass points)
// ---------------------------------------------------------------------------

function addTikiMarkers(root: THREE.Group): void {
  const tikiPositions: ReadonlyArray<readonly [number, number]> = [
    [0, -28], [0, 28], [-28, 0], [28, 0],
  ];

  for (const [tx, tz] of tikiPositions) {
    const post = new THREE.Group();
    post.name = `farcrysis-art-tiki-${tx}-${tz}`;

    const wood = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.85, 0.04);
    const band = mat(FARCRYSIS_ART_FEEL.tikiBand, 0.7, 0.08);

    // Main post
    post.add(makeMesh(new THREE.CylinderGeometry(0.22, 0.28, 2.4, 8), wood, 'farcrysis-art-tiki-post', [0, 1.2, 0]));

    // Coloured bands (rings)
    for (let b = 0; b < 3; b += 1) {
      post.add(makeMesh(
        new THREE.TorusGeometry(0.26, 0.1, 6, 8), band,
        `farcrysis-art-tiki-band-${b}`,
        [0, 0.55 + b * 0.7, 0],
      ));
    }

    // Top carving (small angular shape — a cube tilted)
    const topGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    post.add(makeMesh(topGeom, wood, 'farcrysis-art-tiki-top', [0, 2.5, 0], { rotation: [0.3, 0.5, 0.2] }));

    post.position.set(tx, 0.02, tz);
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
  // The 4 overgrown crates are named farcrysis-crate-nw/-ne/-sw/-se at
  // [-10/10, 0.45, -8/8] in the builder. We add a small emissive plaque
  // on the outward-facing side of each.
  const crates: [string, [number, number, number], [number, number, number]][] = [
    ['nw', [-10.45, 1.0, -8], [0, 0, 0]],
    ['ne', [10.45, 1.0, -8], [0, Math.PI, 0]],
    ['sw', [-10.45, 1.0, 8], [0, Math.PI, 0]],
    ['se', [10.45, 1.0, 8], [0, 0, 0]],
  ];

  for (const [tag, pos, rot] of crates) {
    // Small raised-stamp plaque on the crate's outer face
    const plaque = makeMesh(
      new THREE.BoxGeometry(1.2, 0.4, 0.06), stampMat,
      `farcrysis-art-crate-stamp-${tag}`,
      pos,
      { rotation: [0, ...rot.slice(1) as [number, number]] as [number, number, number] },
    );
    root.add(plaque);

    // Add a wordmark texture via a small emissive sprite if we have a canvas;
    // otherwise the emissive plaque above is the stamp marker.
    const texture = createWordmarkTexture();
    if (texture) {
      const spriteMat = new THREE.SpriteMaterial({ map: texture, color: FARCRYSIS_ART_FEEL.crateStamp, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.name = `farcrysis-art-crate-wordmark-${tag}`;
      const outward = (tag === 'nw' || tag === 'se') ? -1 : 1;
      sprite.position.set(pos[0], pos[1], pos[2] + outward * 0.1);
      sprite.scale.set(1.0, 0.35, 1);
      root.add(sprite);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Instanced foliage — bushes (jungle undergrowth, mid ring)
// ---------------------------------------------------------------------------

function addInstancedBushes(root: THREE.Group): void {
  const count = 20;
  const bushGeom = new THREE.BoxGeometry(1.4, 0.9, 1.4);

  const instances = new THREE.InstancedMesh(bushGeom, mat(FARCRYSIS_ART_FEEL.bushGreen, 0.9, 0.01), count);
  instances.name = 'farcrysis-art-instanced-bushes';
  instances.castShadow = true;
  instances.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.5;
    const radius = 8 + (i % 3) * 3.2;
    let px = Math.cos(angle) * radius;
    let pz = Math.sin(angle) * radius * 0.85;
    px = Math.max(minX + 2, Math.min(maxX - 2, px));
    pz = Math.max(minZ + 2, Math.min(maxZ - 2, pz));

    matrix.makeRotationY(angle * 1.8 + i);
    // Per-instance scale variation
    matrix.scale(new THREE.Vector3(0.7 + (i % 4) * 0.18, 0.75 + (i % 3) * 0.16, 0.7 + ((i + 1) % 4) * 0.18));
    matrix.setPosition(px, 0.45, pz);
    instances.setMatrixAt(i, matrix);
  }

  instances.instanceMatrix.needsUpdate = true;
  root.add(instances);
}

// ---------------------------------------------------------------------------
// 7. Instanced foliage — fern clusters (scattered around mid ring / core edge)
// ---------------------------------------------------------------------------

function addInstancedFernClusters(root: THREE.Group): void {
  const count = 18;
  // A "fern cluster" is represented as a short flat vertical slab
  // (like a frond leaf). At distance this reads as dense undergrowth.
  const fernGeom = new THREE.BoxGeometry(0.4, 1.1, 0.14);

  const instances = new THREE.InstancedMesh(fernGeom, mat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  instances.name = 'farcrysis-art-instanced-fern-clusters';
  instances.castShadow = true;
  instances.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.15;
    const radius = 5 + (i % 4) * 2.1;
    let px = Math.cos(angle) * radius;
    let pz = Math.sin(angle) * radius * 0.9;
    px = Math.max(minX + 2.5, Math.min(maxX - 2.5, px));
    pz = Math.max(minZ + 2.5, Math.min(maxZ - 2.5, pz));

    // Slightly rotate each fern so they face random directions
    matrix.makeRotationY(angle * 2.7 + i * 0.9);
    matrix.scale(new THREE.Vector3(0.8 + (i % 3) * 0.25, 0.7 + (i % 4) * 0.2, 1));
    matrix.setPosition(px, 0.55, pz);
    instances.setMatrixAt(i, matrix);
  }

  instances.instanceMatrix.needsUpdate = true;
  root.add(instances);
}

// ---------------------------------------------------------------------------
// 8. Atmosphere — lagoon water sparkle
// ---------------------------------------------------------------------------

function addWaterSparkle(root: THREE.Group): void {
  const sparkleCount = 60;
  const positions = new Float32Array(sparkleCount * 3);
  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
  // Sparkles only on the outer water ring (beyond the beach/lagoon edge)
  const innerRadius = 20;

  for (let i = 0; i < sparkleCount; i += 1) {
    const angle = (i / sparkleCount) * Math.PI * 2 + Math.random() * 0.4;
    const radius = innerRadius + Math.random() * 16;
    const px = Math.max(minX + 2, Math.min(maxX - 2, Math.cos(angle) * radius));
    const pz = Math.max(minZ + 2, Math.min(maxZ - 2, Math.sin(angle) * radius * 0.9));
    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = -0.21; // just above water surface (y=-0.25)
    positions[i * 3 + 2] = pz;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Star-shaped sparkle via a PointsMaterial with additive blending
  const sparkleMat = new THREE.PointsMaterial({
    color: FARCRYSIS_ART_FEEL.waterSparkleColor,
    size: 0.15,
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

function terrainHeight(x: number, z: number): number {
  const dist = FARCRYSIS_BOUNDS.maxX - Math.max(Math.abs(x), Math.abs(z));
  // Beach shelf: flat near edges, rising toward center
  if (dist < 10) return Math.max(0, dist * 0.03 - 0.1);
  // Jungle interior: gentle rolling hills
  const h = Math.sin(x * 0.12) * Math.cos(z * 0.15) * 1.2
    + Math.sin(x * 0.25 + 1.3) * Math.cos(z * 0.22 + 2.1) * 0.6
    + Math.sin(z * 0.18 - 0.7) * 0.4;
  return Math.max(-0.05, h + 0.1);
}

// ARENA_HALF based on FARCRYSIS_BOUNDS
const ARENA_HALF = FARCRYSIS_BOUNDS.maxX;

function buildInlineTerrain(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = 'farcrysis-terrain';

  const w = ARENA_HALF * 2;
  const segs = 96;
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
    if (edgeDist < 8) {
      colors[i * 3 + 0] = 0.88; colors[i * 3 + 1] = 0.78; colors[i * 3 + 2] = 0.62; // white sand
    } else if (edgeDist < 14) {
      colors[i * 3 + 0] = 0.42; colors[i * 3 + 1] = 0.44; colors[i * 3 + 2] = 0.28; // transition
    } else {
      colors[i * 3 + 0] = 0.30; colors[i * 3 + 1] = 0.40; colors[i * 3 + 2] = 0.20; // jungle floor
    }
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.03 });
  const terrainMesh = new THREE.Mesh(geom, terrainMat);
  terrainMesh.name = 'farcrysis-terrain-elevation';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.position.y = 0.04;
  group.add(terrainMesh);

  // Cliff rock ring (28 IcosahedronGeometry rocks along the cliff band)
  const cliffRockMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.88, metalness: 0.06 });
  const cliffCount = 28;
  for (let i = 0; i < cliffCount; i++) {
    const angle = (i / cliffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const rockDist = 18 + Math.random() * 8;
    const rx = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, Math.cos(angle) * rockDist));
    const rz = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, Math.sin(angle) * rockDist));
    const baseY = terrainHeight(rx, rz);
    const detail = Math.random() < 0.5 ? 2 : 1;
    const rGeom = new THREE.IcosahedronGeometry(0.6 + Math.random() * 1.4, detail);
    const rock = new THREE.Mesh(rGeom, cliffRockMat);
    rock.name = `farcrysis-cliff-rock-${i}`;
    rock.position.set(rx, baseY + 0.4, rz);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.setScalar(0.7 + Math.random() * 0.6);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  // Jungle floor boulders (scattered interior)
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x7a7268, roughness: 0.85, metalness: 0.08 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
    const placeDist = 5 + Math.random() * 12;
    const rx = Math.max(-ARENA_HALF + 3, Math.min(ARENA_HALF - 3, Math.cos(angle) * placeDist));
    const rz = Math.max(-ARENA_HALF + 3, Math.min(ARENA_HALF - 3, Math.sin(angle) * placeDist));
    const baseY = terrainHeight(rx, rz);
    const rGeom = new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.6, 1);
    const boulder = new THREE.Mesh(rGeom, boulderMat);
    boulder.name = `farcrysis-boulder-${i}`;
    boulder.position.set(rx, baseY + 0.15, rz);
    boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    group.add(boulder);
  }

  // Large boulders near water's edge
  const shoreBoulderMat = new THREE.MeshStandardMaterial({ color: 0x6a6058, roughness: 0.9, metalness: 0.04 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const shoreDist = ARENA_HALF - 2 + Math.random() * 3;
    const rx = Math.cos(angle) * shoreDist;
    const rz = Math.sin(angle) * shoreDist;
    const baseY = terrainHeight(rx, rz);
    const rGeom = new THREE.IcosahedronGeometry(0.8 + Math.random() * 1.2, 2);
    const boulder = new THREE.Mesh(rGeom, shoreBoulderMat);
    boulder.name = `farcrysis-shore-boulder-${i}`;
    boulder.position.set(rx, baseY + 0.3, rz);
    boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    group.add(boulder);
  }

  // ---- Pass 69 density polish: beach litter, driftwood, interior undergrowth ----
  addBeachLitter(group);
  addDriftwoodLogs(group);
  addJungleUndergrowth(group);

  scene.add(group);

  // Sky dome (large BackSide gradient sphere)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 256; skyCanvas.height = 128;
  const ctx = skyCanvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ff8c42');   // warm zenith
    grad.addColorStop(0.35, '#ffb469'); 
    grad.addColorStop(0.7, '#e8c89e');
    grad.addColorStop(1, '#c9d8e0');   // pale horizon
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyGeom = new THREE.SphereGeometry(180, 32, 24);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    const skyDome = new THREE.Mesh(skyGeom, skyMat);
    skyDome.name = 'farcrysis-sky-dome';
    skyDome.renderOrder = -1;
    scene.add(skyDome);
  }
}

function buildInlineLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffe8cc, 0.55);
  ambient.name = 'farcrysis-ambient';
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x4a6b3a, 0.50);
  hemi.name = 'farcrysis-hemi';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.8);
  sun.name = 'farcrysis-sun';
  sun.position.set(-18, 22, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // Low-intensity warm fill from below to soften underside shadows on rocks/boulders.
  // Deliberately does NOT castShadow so it cannot create secondary shadows.
  const bounce = new THREE.DirectionalLight(0xffe0c0, 0.15);
  bounce.name = 'farcrysis-bounce';
  bounce.position.set(0, -2, 0);
  scene.add(bounce);

  const fill = new THREE.DirectionalLight(0x7d9cc9, 0.28);
  fill.name = 'farcrysis-fill';
  fill.position.set(6, 10, -20);
  scene.add(fill);

  const fogColor = new THREE.Color(0xffd4b3);
  scene.fog = new THREE.FogExp2(fogColor, 0.0028);
}

function buildInlineWater(scene: THREE.Scene): void {
  // (a) Deep open water — extended to the visible horizon (120×120 m),
  //     richer tropical blue-green. At y = -0.28 it sits below the lowest
  //     terrain rim (y ≈ 0.0) and beneath every additive water-FX layer.
  const deepSize = 120;
  const deepGeom = new THREE.PlaneGeometry(deepSize, deepSize);
  deepGeom.rotateX(-Math.PI / 2);

  const deepMat = new THREE.MeshStandardMaterial({
    color: 0x0b6a7a,
    roughness: 0.15,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  });

  const deep = new THREE.Mesh(deepGeom, deepMat);
  deep.name = 'farcrysis-water-inline';
  deep.position.y = -0.28;
  deep.receiveShadow = true;
  scene.add(deep);

  // (c) Shallow near-shore water — a lighter translucent lens (40×40 m)
  //     over the beach shelf so the sand reads through the water near the
  //     shoreline. y = -0.24 keeps it just below the additive wave surface
  //     at -0.22 (no z-fighting) while still above the deep plane.
  const shallowSize = 40;
  const shallowGeom = new THREE.PlaneGeometry(shallowSize, shallowSize);
  shallowGeom.rotateX(-Math.PI / 2);

  const shallowMat = new THREE.MeshStandardMaterial({
    color: 0x2f9aa0,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const shallow = new THREE.Mesh(shallowGeom, shallowMat);
  shallow.name = 'farcrysis-water-shallow';
  shallow.position.y = -0.24;
  shallow.renderOrder = 2;
  scene.add(shallow);

  // (d) Wet-sand shoreline transition — a square-frame plane (64×64 outer,
  //     48×48 inner hole → 8-unit band at the beach rim) conformed to the
  //     terrain height so it hugs the sand slope naturally.
  const outer = ARENA_HALF;          // 32 — matches terrain edge
  const inner = outer - 8;           // 24 — inner edge of the sand band
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

  const wetMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a58,               // darker than dry sand — damp/wet shore
    roughness: 0.95,
    metalness: 0.0,
  });

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
function tintBeachGeometry(geo: THREE.BufferGeometry, base: THREE.Color, spread: number): THREE.BufferGeometry {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const v = 1 - spread + Math.random() * spread * 2;
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

  for (let i = 0; i < litterCount; i += 1) {
    const angle = (i / litterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
    const dist = ARENA_HALF - 1.5 - Math.random() * 6.5; // edgeDist ≈ 1.5-8 (sand)
    const rx = Math.max(-ARENA_HALF + 0.8, Math.min(ARENA_HALF - 0.8, Math.cos(angle) * dist));
    const rz = Math.max(-ARENA_HALF + 0.8, Math.min(ARENA_HALF - 0.8, Math.sin(angle) * dist * 0.96));
    const baseY = terrainHeight(rx, rz);

    // Every third item is a flattened shell; the rest are small lumpy rocks.
    const size = 0.06 + Math.random() * 0.12;
    const isShell = i % 3 === 0;
    const geo = isShell
      ? tintBeachGeometry(new THREE.SphereGeometry(size, 6, 4), sand, 0.16)
      : tintBeachGeometry(new THREE.BoxGeometry(size * 2.2, size * 0.7, size * 1.6), sand, 0.22);

    group.add(makeMesh(geo, litterMat, `farcrysis-beach-litter-${i}`, [rx, baseY + size * 0.3, rz], {
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      castShadow: false,
    }));
  }
}

/** Driftwood logs washed up on the beach (edgeDist < 8). */
function addDriftwoodLogs(group: THREE.Group): void {
  const logMat = mat(0x8a7355, 0.92, 0.04);
  const logCount = 6;

  for (let i = 0; i < logCount; i += 1) {
    const angle = (i / logCount) * Math.PI * 2 + (Math.random() - 0.5) * 1.1;
    const dist = ARENA_HALF - 2 - Math.random() * 5; // edgeDist ≈ 2-7 (sand)
    const rx = Math.max(-ARENA_HALF + 0.8, Math.min(ARENA_HALF - 0.8, Math.cos(angle) * dist));
    const rz = Math.max(-ARENA_HALF + 0.8, Math.min(ARENA_HALF - 0.8, Math.sin(angle) * dist * 0.96));
    const baseY = terrainHeight(rx, rz);
    const length = 1.2 + Math.random() * 1.6;

    group.add(makeMesh(
      new THREE.CylinderGeometry(0.09, 0.14, length, 6),
      logMat,
      `farcrysis-driftwood-${i}`,
      [rx, baseY + 0.1, rz],
      // Rz(π/2) lays the cylinder horizontal; Ry spins it; Rx gives a slight tilt.
      { rotation: [(Math.random() - 0.5) * 0.25, Math.random() * Math.PI, Math.PI / 2], castShadow: true },
    ));
  }
}

/** Low flat undergrowth bushes inside the jungle interior (edgeDist ≥ 14). */
function addJungleUndergrowth(group: THREE.Group): void {
  const undergrowthMat = mat(0x35682f, 0.9, 0.02);
  const bushCount = 18;

  for (let i = 0; i < bushCount; i += 1) {
    const angle = (i / bushCount) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
    const dist = 7 + Math.random() * 9; // 7-16 → jungle interior
    const rx = Math.max(-ARENA_HALF + 4, Math.min(ARENA_HALF - 4, Math.cos(angle) * dist));
    const rz = Math.max(-ARENA_HALF + 4, Math.min(ARENA_HALF - 4, Math.sin(angle) * dist * 0.9));
    const edgeDist = ARENA_HALF - Math.max(Math.abs(rx), Math.abs(rz));
    if (edgeDist < 14) continue; // keep strictly inside the jungle interior
    const baseY = terrainHeight(rx, rz);
    const sx = 0.7 + Math.random() * 0.8;
    const sz = 0.7 + Math.random() * 0.8;

    group.add(makeMesh(
      new THREE.BoxGeometry(1.2, 1.0, 1.2),
      undergrowthMat,
      `farcrysis-undergrowth-bush-${i}`,
      [rx, baseY + 0.21, rz],
      { rotation: [0, Math.random() * Math.PI, 0], scale: [sx, 0.42, sz], castShadow: true },
    ));
  }
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

  for (let i = 0; i < trunkInstances.count && added < target; i += 1) {
    trunkInstances.getMatrixAt(i, matrix);
    pos.setFromMatrixPosition(matrix);
    // Drop 1-2 coconuts a short tumble from each trunk base
    const perPalm = i % 2 === 0 ? 2 : 1;
    for (let c = 0; c < perPalm && added < target; c += 1) {
      const offset = 0.35 + Math.random() * 0.55;
      const ang = Math.random() * Math.PI * 2;
      const cx = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, pos.x + Math.cos(ang) * offset));
      const cz = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, pos.z + Math.sin(ang) * offset));
      const baseY = terrainHeight(cx, cz);
      const size = 0.11 + Math.random() * 0.07;

      root.add(makeMesh(
        new THREE.SphereGeometry(size, 8, 6),
        coconutMat,
        `farcrysis-fallen-coconut-${added}`,
        [cx, baseY + size * 0.7, cz],
        { rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI], castShadow: false },
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
  buildAdditionalVegetation(root);

  // Terrain, lighting, and water modules expect Scene; cast through Object3D
  const s = root as unknown as import('three').Scene;
  buildInlineTerrain(s);
  buildInlineLighting(s);
  buildInlineWater(s);

  // Distant vista — ocean horizon, island silhouettes, seabirds (additive, no colliders)
  applyVista(s);

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
  };
}
