/**
 * farcrysis-terrain.ts — Procedural golden-hour tropical beach/cliff terrain,
 * atmospheric lighting, and animated water for the Farcrysis arena.
 *
 * Exports:
 *   buildTerrain(scene)  — custom BufferGeometry elevation, cliffs, rocks, paths
 *   buildLighting(scene) — golden-hour sun, ambient/hemisphere, FogExp2, god rays
 *   buildWater(scene)    — animated tropical water plane with wave animation
 *
 * All procedural — no copied IP. Presentation only (no colliders/gameplay authority).
 * Uses FARCRYSIS_ART_FEEL palette constants from farcrysis-art.ts.
 */

import * as THREE from 'three';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
const ARENA_HALF = 32; // 64×64 arena
const SAND_INSET = 10; // sand perimeter extends inward ~10m from bounds
const TERR_SEGMENTS = 96; // terrain grid resolution

/** Seeded RNG so terrain is deterministic. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xf41c_5155);

/** Smoothstep for elevation blending. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Terrain elevation function
// ---------------------------------------------------------------------------

/**
 * Elevation at world (x, z). Returns height in metres.
 *
 * Zones:
 *   - Flat sand beach: outer perimeter, y≈0, inset ~10m from bounds
 *   - Cliff ring: 2–5m rising slopes between sand and plateau
 *   - Jungle plateau: 3–8m undulating interior
 *   - Gameplay paths: flat y≈0 corridors along x≈±20 and z≈±20
 */
function terrainHeight(x: number, z: number): number {
  // Clamp to arena
  const cx = Math.max(minX, Math.min(maxX, x));
  const cz = Math.max(minZ, Math.min(maxZ, z));

  // Distance from centre
  const dist = Math.sqrt(cx * cx + cz * cz);

  // ---- Gameplay path corridors (flat at y≈0) ----
  const pathHalfWidth = 4.5; // width of the flat corridor
  const pathX1 = Math.abs(cx - 20) < pathHalfWidth;
  const pathX2 = Math.abs(cx + 20) < pathHalfWidth;
  const pathZ1 = Math.abs(cz - 20) < pathHalfWidth;
  const pathZ2 = Math.abs(cz + 20) < pathHalfWidth;
  const onPath = pathX1 || pathX2 || pathZ1 || pathZ2;

  if (onPath && dist > 4) return 0; // flat path except too close to centre

  // ---- Sand beach (perimeter, y≈0) ----
  const edgeDist = ARENA_HALF - Math.max(Math.abs(cx), Math.abs(cz));
  const sandWidth = SAND_INSET;
  if (edgeDist < sandWidth && !onPath) {
    // Sand is flat
    const t = edgeDist / sandWidth; // 0 at edge, 1 at sand/cliff boundary
    // Small dunes near cliff transition
    const duneNoise = Math.sin(cx * 0.7 + cz * 0.5) * Math.cos(cx * 0.4 - cz * 0.6) * 0.25;
    const duneHeight = smoothstep(0.6, 1.0, t) * duneNoise;
    return Math.max(0, duneHeight);
  }

  // ---- Cliff ring (rising 2–5m, transition zone) ----
  const cliffDist = ARENA_HALF - Math.max(Math.abs(cx), Math.abs(cz));

  if (cliffDist >= sandWidth && cliffDist < sandWidth + 10) {
    const cliffT = (cliffDist - sandWidth) / 10; // 0 = sand edge, 1 = plateau edge
    const baseCliff = 2 + cliffT * 3; // 2m → 5m
    const jagged = (
      Math.sin(cx * 1.3 + cz * 0.7) * 0.8 +
      Math.cos(cx * 0.9 - cz * 1.1) * 0.6 +
      Math.sin(cx * 2.1) * 0.4 +
      Math.cos(cz * 1.8) * 0.5
    );
    return Math.max(0.2, baseCliff + jagged * cliffT);
  }

  // ---- Jungle plateau (3–8m, interior) ----
  // Undulating terrain with organic noise
  const plateauBase = 3.5 +
    Math.sin(cx * 0.35 + cz * 0.28) * 1.8 +
    Math.cos(cx * 0.55 - cz * 0.42) * 1.4 +
    Math.sin(cx * 1.1) * Math.cos(cz * 0.9) * 0.9 +
    Math.sin(cx * 0.18 + cz * 0.33) * 0.6;

  // Slightly higher in the centre, dip near core
  const coreDist = Math.sqrt(cx * cx + cz * cz);
  const coreDip = coreDist < 8 ? smoothstep(0, 8, coreDist) * 1.5 : 0;

  return Math.max(0.2, plateauBase - coreDip);
}

// ---------------------------------------------------------------------------
// Procedural rock helper
// ---------------------------------------------------------------------------

/** Create a deformed rock mesh from an IcosahedronGeometry. */
function makeRock(
  radius: number,
  detail: number,
  seed: number,
  material: THREE.Material,
): THREE.Mesh {
  const localRng = mulberry32(seed);
  const geom = new THREE.IcosahedronGeometry(radius, detail);
  const positions = geom.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < positions.count; i++) {
    const vx = positions.getX(i);
    const vy = positions.getY(i);
    const vz = positions.getZ(i);
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const noise = 1 + (localRng() - 0.5) * 0.45;
    const bulge = localRng() < 0.3 ? 1 + localRng() * 0.3 : 1;
    const n = noise * bulge;
    positions.setXYZ(i, (vx / len) * radius * n, (vy / len) * radius * n, (vz / len) * radius * n);
  }

  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// God-ray cone helper
// ---------------------------------------------------------------------------

function makeGodRayCone(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  coneAngle: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const radius = Math.tan(coneAngle) * length;
  const geom = new THREE.ConeGeometry(radius, length, 8, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(geom, mat);
  cone.name = 'farcrysis-god-ray';

  // Position cone: cone tip at origin, base at origin + direction * length
  const midpoint = origin.clone().add(direction.clone().multiplyScalar(length / 2));
  cone.position.copy(midpoint);

  // Orient cone to point along direction
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.setRotationFromQuaternion(quat);

  cone.renderOrder = 999;
  cone.material.depthTest = true;
  cone.frustumCulled = false;

  return cone;
}

// ---------------------------------------------------------------------------
// buildTerrain — custom BufferGeometry elevation terrain
// ---------------------------------------------------------------------------

export function buildTerrain(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-terrain';

  // ---- 1. Custom elevation terrain mesh (BufferGeometry with per-vertex displacement) ----
  const terrainWidth = 64;
  const terrainSegments = TERR_SEGMENTS;
  const terrainGeom = new THREE.PlaneGeometry(terrainWidth, terrainWidth, terrainSegments, terrainSegments);
  terrainGeom.rotateX(-Math.PI / 2);

  const terrainPositions = terrainGeom.attributes.position as THREE.BufferAttribute;

  // Store vertex colours for sand/rock/grass tinting
  const colors = new Float32Array(terrainPositions.count * 3);
  for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const h = terrainHeight(x, z);
    terrainPositions.setY(i, h);

    // Colour based on zone
    const edgeDist = ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
    let r: number; let g: number; let b: number;
    if (edgeDist < SAND_INSET && h < 0.6) {
      // Sand — warm beige
      r = 0.85; g = 0.75; b = 0.54;
    } else if (h > 2.5) {
      // Plateau / jungle — green-brown
      r = 0.37; g = 0.49; b = 0.23;
    } else {
      // Cliff transition — rock grey-brown
      r = 0.35; g = 0.33; b = 0.31;
    }
    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  terrainGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeom.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.03,
  });
  const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
  terrainMesh.name = 'farcrysis-terrain-elevation';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.userData.farcrysisArt = true;
  group.add(terrainMesh);

  // ---- 2. Cliff rock formations (deformed IcosahedronGeometry along the cliff ring) ----
  const rockMat = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.caveRock,
    roughness: 0.88,
    metalness: 0.06,
  });

  const cliffRockCount = 28;
  for (let i = 0; i < cliffRockCount; i++) {
    const angle = (i / cliffRockCount) * Math.PI * 2 + rng() * 0.3;
    // Rock positions sit on the cliff ring (~18–26m from centre)
    const rockDist = 18 + rng() * 8;
    const rx = Math.cos(angle) * rockDist;
    const rz = Math.sin(angle) * rockDist;
    const clampedX = Math.max(minX + 2, Math.min(maxX - 2, rx));
    const clampedZ = Math.max(minZ + 2, Math.min(maxZ - 2, rz));
    const baseY = terrainHeight(clampedX, clampedZ);
    const rockRadius = 0.8 + rng() * 1.6;
    const rockDetail = rng() < 0.5 ? 2 : 1;
    const rock = makeRock(rockRadius, rockDetail, 1000 + i, rockMat);
    rock.name = `farcrysis-terrain-cliff-rock-${i}`;
    rock.position.set(clampedX, baseY + rockRadius * 0.5, clampedZ);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.scale.setScalar(0.7 + rng() * 0.6);
    group.add(rock);
  }

  // ---- 3. Plateau rocks (smaller scatter on the jungle floor) ----
  const plateauRockMat = new THREE.MeshStandardMaterial({
    color: 0x7a7268,
    roughness: 0.85,
    metalness: 0.08,
  });
  const plateauRockCount = 18;
  for (let i = 0; i < plateauRockCount; i++) {
    const angle = (i / plateauRockCount) * Math.PI * 2 + rng() * 0.5;
    // Interior positions (avoid paths and centre core)
    const placeDist = 5 + rng() * 14;
    let rx = Math.cos(angle) * placeDist;
    let rz = Math.sin(angle) * placeDist;
    rx = Math.max(minX + 3, Math.min(maxX - 3, rx));
    rz = Math.max(minZ + 3, Math.min(maxZ - 3, rz));
    // Skip path corridors
    const onPath = (
      Math.abs(Math.abs(rx) - 20) < 6 ||
      Math.abs(Math.abs(rz) - 20) < 6
    );
    if (onPath && placeDist > 4) continue;
    const baseY = terrainHeight(rx, rz);
    const rockRadius = 0.35 + rng() * 0.75;
    const rock = makeRock(rockRadius, 1, 3000 + i, plateauRockMat);
    rock.name = `farcrysis-terrain-plateau-rock-${i}`;
    rock.position.set(rx, baseY + rockRadius * 0.4, rz);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(rock);
  }

  // ---- 4. Sand flat ring mesh (low poly decorative overlay) ----
  const sandRingOuter = ARENA_HALF;
  const sandRingInner = sandRingOuter - SAND_INSET;
  const sandRingShape = new THREE.Shape();
  sandRingShape.moveTo(-sandRingOuter, -sandRingOuter);
  sandRingShape.lineTo(sandRingOuter, -sandRingOuter);
  sandRingShape.lineTo(sandRingOuter, sandRingOuter);
  sandRingShape.lineTo(-sandRingOuter, sandRingOuter);
  sandRingShape.closePath();
  // Inner hole
  const holePath = new THREE.Path();
  holePath.moveTo(-sandRingInner, -sandRingInner);
  holePath.lineTo(sandRingInner, -sandRingInner);
  holePath.lineTo(sandRingInner, sandRingInner);
  holePath.lineTo(-sandRingInner, sandRingInner);
  holePath.closePath();
  sandRingShape.holes.push(holePath);

  const sandRingGeom = new THREE.ShapeGeometry(sandRingShape);
  sandRingGeom.rotateX(-Math.PI / 2);
  const sandRingMat = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.beachSand,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const sandRing = new THREE.Mesh(sandRingGeom, sandRingMat);
  sandRing.name = 'farcrysis-terrain-sand-ring';
  sandRing.position.y = 0.015;
  sandRing.receiveShadow = true;
  sandRing.userData.farcrysisArt = true;
  group.add(sandRing);

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// buildLighting — golden-hour sun, ambient, hemisphere, FogExp2, god rays
// ---------------------------------------------------------------------------

export function buildLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  godRays: THREE.Group;
  updateGodRays: () => void;
} {
  // ---- 1. Golden-hour DirectionalLight (sun) ----
  // Warmer low-angle golden-hour tint against the washed-out high sun constant in
  // FARCRYSIS_ART_FEEL; intensity pulled back ~13 % for a more natural feel.
  const SUN_COLOR = 0xffcc80;
  const SUN_INTENSITY = 2.7;
  const sunPosition = new THREE.Vector3(-18, 20, 25); // low angle from NW

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.name = 'farcrysis-sun';
  sun.position.copy(sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5; // soft golden-hour penumbra
  scene.add(sun);

  // ---- 1a. Sun disc (visible sphere + halo at the directional-light position) ----
  const sunDiscGroup = new THREE.Group();
  sunDiscGroup.name = 'farcrysis-sun-disc';

  // Inner bright disc
  const sunDiscGeom = new THREE.SphereGeometry(0.7, 16, 12);
  const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false });
  const sunDisc = new THREE.Mesh(sunDiscGeom, sunDiscMat);
  sunDisc.name = 'farcrysis-sun-disc-core';
  sunDiscGroup.add(sunDisc);

  // Outer soft halo (additive blend, barely visible but gives a corona feel)
  const sunHaloGeom = new THREE.SphereGeometry(2.2, 16, 12);
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffcc80,
    transparent: true,
    opacity: 0.18,
    fog: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sunHalo = new THREE.Mesh(sunHaloGeom, sunHaloMat);
  sunHalo.name = 'farcrysis-sun-disc-halo';
  sunDiscGroup.add(sunHalo);

  sunDiscGroup.position.copy(sunPosition);
  sunDiscGroup.frustumCulled = false;
  scene.add(sunDiscGroup);

  // ---- 2. Ambient light ----
  const ambient = new THREE.AmbientLight(
    FARCRYSIS_ART_FEEL.ambientColor, // 0x9fbfa8
    FARCRYSIS_ART_FEEL.ambientIntensity, // 0.42
  );
  ambient.name = 'farcrysis-ambient';
  scene.add(ambient);

  // ---- 3. Hemisphere light (sky + ground bounce) ----
  const hemiSky = new THREE.Color(0xffe8cc); // warm sky
  const hemiGround = new THREE.Color(0x4a6b3a); // green ground bounce
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, 0.55);
  hemi.name = 'farcrysis-hemisphere';
  scene.add(hemi);

  // ---- 4. Volumetric fog (FogExp2) ----
  // Warm grey-brown golden-hour haze — atmospheric but doesn't obscure sightlines.
  const fogColor = new THREE.Color(0xffd9c8);
  const fogDensity = 0.0022;
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  // ---- 5. Lightweight god-ray cones ----
  const godRayGroup = new THREE.Group();
  godRayGroup.name = 'farcrysis-god-rays';

  // Sun direction (normalized)
  const sunDir = sunPosition.clone().normalize();

  // Scattered cone origins across the arena
  const rayCount = 12;
  const rays: THREE.Mesh[] = [];

  for (let i = 0; i < rayCount; i++) {
    // Place cone origins at various positions in the scene
    const originAngle = (i / rayCount) * Math.PI * 2;
    const originDist = 8 + (i % 4) * 6;
    const ox = Math.cos(originAngle) * originDist;
    const oz = Math.sin(originAngle) * originDist;
    const oy = 2 + (i % 3) * 5;

    const coneLength = 30 + (i % 3) * 15;
    const coneAngle = 0.04 + (i % 4) * 0.02;
    const coneOpacity = 0.06 + (i % 3) * 0.03;

    const ray = makeGodRayCone(
      new THREE.Vector3(ox, oy, oz),
      sunDir,
      coneLength,
      coneAngle,
      0xfff5e0,
      coneOpacity,
    );
    ray.name = `farcrysis-god-ray-${i}`;
    godRayGroup.add(ray);
    rays.push(ray);
  }

  // Store base opacities per ray so we can pulse relative to their authored value.
  const baseRayOpacities = rays.map((ray) => {
    const mat = ray.material as THREE.MeshBasicMaterial;
    return mat.opacity;
  });

  // Self-driving subtle opacity pulse — feels alive without external wiring.
  godRayGroup.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    for (let i = 0; i < rays.length; i++) {
      const mat = rays[i].material as THREE.MeshBasicMaterial;
      const phase = i * 0.7;
      const pulse = 1 + Math.sin(t * 0.8 + phase) * 0.25;
      mat.opacity = Math.max(0.01, baseRayOpacities[i] * pulse);
    }
  };

  scene.add(godRayGroup);

  // Update god-ray orientations to follow the light direction
  const updateGodRays = (): void => {
    const dir = sun.position.clone().normalize();
    for (const ray of rays) {
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      ray.setRotationFromQuaternion(quat);
    }
  };

  return { sun, godRays: godRayGroup, updateGodRays };
}

// ---------------------------------------------------------------------------
// buildWater — animated tropical water plane with wave simulation
// ---------------------------------------------------------------------------

export function buildWater(scene: THREE.Scene): {
  mesh: THREE.Mesh;
  update: (timeSeconds: number) => void;
} {
  const waterSize = 76;
  const waterSegments = 64;
  const waterGeom = new THREE.PlaneGeometry(waterSize, waterSize, waterSegments, waterSegments);
  waterGeom.rotateX(-Math.PI / 2);

  // Store original positions for animation
  const basePositions = new Float32Array(
    (waterGeom.attributes.position as THREE.BufferAttribute).array,
  );

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2d7f8c,
    roughness: 0.15,
    metalness: 0.4,
    transparent: true,
    opacity: 0.78,
    depthWrite: true,
    envMapIntensity: 0.3,
    emissive: 0x1a4030,
    emissiveIntensity: 0.3,
    fog: false,
  });

  const water = new THREE.Mesh(waterGeom, waterMat);
  water.name = 'farcrysis-terrain-water';
  water.position.y = -0.3;
  water.receiveShadow = true;
  water.userData.farcrysisArt = true;
  water.renderOrder = 1;
  scene.add(water);

  // ---- Sparkle points (additive blending dots on water surface) ----
  const sparkleCount = 80;
  const sparklePositions = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (i / sparkleCount) * Math.PI * 2 + Math.random() * 0.5;
    const radius = 18 + Math.random() * 16;
    sparklePositions[i * 3 + 0] = Math.cos(angle) * radius;
    sparklePositions[i * 3 + 1] = -0.29; // just above water surface
    sparklePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const sparkleGeom = new THREE.BufferGeometry();
  sparkleGeom.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const sparkleMat = new THREE.PointsMaterial({
    color: FARCRYSIS_ART_FEEL.waterSparkleColor, // 0xd4f0ff
    size: 0.18,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const sparkles = new THREE.Points(sparkleGeom, sparkleMat);
  sparkles.name = 'farcrysis-terrain-water-sparkles';
  sparkles.frustumCulled = false;
  water.add(sparkles);

  // ---- Shoreline foam band (narrow white-ish ring at the water-beach boundary) ----
  const foamRingGeom = new THREE.TorusGeometry(22, 0.32, 8, 72);
  foamRingGeom.rotateX(-Math.PI / 2); // lay flat
  const foamRingMat = new THREE.MeshStandardMaterial({
    color: 0xfaf5ee,
    roughness: 0.7,
    metalness: 0.02,
    transparent: true,
    opacity: 0.55,
    depthWrite: true,
    fog: false,
  });
  const foamRing = new THREE.Mesh(foamRingGeom, foamRingMat);
  foamRing.name = 'farcrysis-terrain-water-foam';
  foamRing.position.y = 0.02;
  foamRing.receiveShadow = true;
  water.add(foamRing);

  // ---- Animation updater ----
  const positions = waterGeom.attributes.position as THREE.BufferAttribute;
  const update = (timeSeconds: number): void => {
    const t = timeSeconds;
    for (let i = 0; i < positions.count; i++) {
      const bx = basePositions[i * 3 + 0];
      const bz = basePositions[i * 3 + 2];
      const dist = Math.sqrt(bx * bx + bz * bz);

      // Multi-octave wave with slow sine
      const wave1 = Math.sin(bx * 0.4 + t * 0.8) * Math.cos(bz * 0.35 + t * 0.6) * 0.15;
      const wave2 = Math.sin(bx * 0.8 - t * 0.55) * 0.08;
      const wave3 = Math.cos(bz * 0.7 + t * 0.7) * 0.1;
      const ripple = Math.sin(dist * 1.2 - t * 1.3) * 0.06;

      const height = wave1 + wave2 + wave3 + ripple;
      positions.setY(i, height);
    }
    positions.needsUpdate = true;
    waterGeom.computeVertexNormals();

    // Animate sparkle opacity
    sparkleMat.opacity = 0.35 + Math.sin(t * 1.5) * 0.15;
  };

  // Self-driving wave animation — fires every visible frame without external wiring.
  water.onBeforeRender = () => {
    update(performance.now() * 0.001);
  };

  return { mesh: water, update };
}
