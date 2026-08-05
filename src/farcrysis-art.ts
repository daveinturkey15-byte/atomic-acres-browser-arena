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
import { buildVegetation, animateVegetationWind, setVegetationLOD } from './farcrysis-vegetation';
import { buildTerrain, buildLighting, buildWater, animateWater } from './farcrysis-terrain';
import { applyFarcrysisTextures } from './farcrysis-textures';

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
// 5. Instanced foliage — palms (beach lagoon ring)
// ---------------------------------------------------------------------------

function addInstancedPalms(root: THREE.Group): void {
  const count = 14;
  const trunkGeom = new THREE.BoxGeometry(0.4, 1.9, 0.4);
  // Fronds as and additional instanced layer (thin wide box)
  const frondGeom = new THREE.BoxGeometry(3.2, 0.16, 3.2);

  const trunkInstances = new THREE.InstancedMesh(trunkGeom, mat(FARCRYSIS_ART_FEEL.palmTrunk, 0.88, 0.03), count);
  trunkInstances.name = 'farcrysis-art-instanced-palm-trunks';
  trunkInstances.castShadow = true;
  trunkInstances.receiveShadow = true;

  const frondInstances = new THREE.InstancedMesh(frondGeom, mat(FARCRYSIS_ART_FEEL.palmFrond, 0.85, 0.02), count);
  frondInstances.name = 'farcrysis-art-instanced-palm-fronds';
  frondInstances.castShadow = true;
  frondInstances.receiveShadow = true;

  const trunkMatrix = new THREE.Matrix4();
  const frondMatrix = new THREE.Matrix4();
  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;

  for (let i = 0; i < count; i += 1) {
    // Scatter palms near the outer beach ring (~22-30m from centre), leaning slightly
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
    const radius = 22 + (i % 4) * 2.7;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius * 0.9;

    // Clamp inside bounds with a 1.5 m margin
    const cx = Math.max(minX + 1.5, Math.min(maxX - 1.5, px));
    const cz = Math.max(minZ + 1.5, Math.min(maxZ - 1.5, pz));
    const baseY = 0.95;
    const frondY = baseY + 1.85;

    trunkMatrix.makeRotationY(angle + 0.3);
    trunkMatrix.setPosition(cx, baseY, cz);
    trunkInstances.setMatrixAt(i, trunkMatrix);

    frondMatrix.makeRotationY(angle * 1.3 + i * 0.15);
    frondMatrix.setPosition(cx, frondY, cz);
    frondInstances.setMatrixAt(i, frondMatrix);
  }

  trunkInstances.instanceMatrix.needsUpdate = true;
  frondInstances.instanceMatrix.needsUpdate = true;
  root.add(trunkInstances);
  root.add(frondInstances);
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
// Main entry: apply every art/feel lane addition to the arena root group.
// ---------------------------------------------------------------------------

export function applyFarcrysisArtwork(root: THREE.Group): void {
  // Throwback props
  addResearchTower(root);
  addFloodedCave(root);
  addTikiMarkers(root);
  addCrateWordmarks(root);

  // Instanced foliage — ≥3 types (palms, bushes, fern clusters)
  addInstancedPalms(root);
  addInstancedBushes(root);
  addInstancedFernClusters(root);

  // Atmosphere
  addWaterSparkle(root);

  // ---- Pass 69 re-authored art layer (dense vegetation, terrain, lighting, water) ----
  buildVegetation(root);

  // Terrain, lighting, and water modules expect Scene; cast through Object3D
  const s = root as unknown as import('three').Scene;
  buildTerrain(s);
  buildLighting(s);
  buildWater(s);

  // Pass 69 procedural PBR textures — apply after all geometry is built
  applyFarcrysisTextures(root);

  // Per-frame animation driver (wind sway, water/foam, vegetation LOD).
  // Uses the codebase's proven onBeforeRender self-drive pattern; safe no-op
  // before build runs, idempotent every frame.
  root.onBeforeRender = (_renderer, _scene, camera) => {
    const t = performance.now() * 0.001;
    animateVegetationWind(t);
    animateWater(t);
    if (camera) {
      const dist = camera.position.distanceTo(root.position);
      setVegetationLOD(dist);
    }
  };
}
