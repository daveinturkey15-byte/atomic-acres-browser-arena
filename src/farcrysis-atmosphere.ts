/**
 * farcrysis-atmosphere.ts — Pass 69 atmospheric polish module.
 *
 * Adds CPU-driven atmospheric effects to the golden-hour jungle/beach arena:
 *   - God-ray cone shafts (MeshBasicMaterial, additive)
 *   - Dust motes (CPU-position-updated Points, circular motion in sunbeams)
 *   - Fireflies (jungle mid-ring, bobbing + drift, opacity pulse)
 *   - Enhanced ground fog layer (warm golden-hour haze plane)
 *
 * Presentation only — no colliders, gameplay authority, or physics.
 * All original art; no Far Cry IP.
 * Mounted from farcrysis-art.ts at the end of applyFarcrysisArtwork.
 */

import * as THREE from 'three';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

// ---------------------------------------------------------------------------
// Atmosphere constants
// ---------------------------------------------------------------------------

/** Golden-hour sun position (low angle from task specification). */
const ATMOS_SUN = new THREE.Vector3(35, 25, -10);
const ATMOS_SUN_DIR = ATMOS_SUN.clone().normalize();

// ---------------------------------------------------------------------------
// Module-level state for per-frame animation
// ---------------------------------------------------------------------------

let _godRayGroup: THREE.Group | null = null;
let _dustPoints: THREE.Points | null = null;
let _dustOrigins: Float32Array | null = null;
let _dustPhases: Float32Array | null = null;
let _dustRadii: Float32Array | null = null;
let _dustHeightOffsets: Float32Array | null = null;
let _fireflyPoints: THREE.Points | null = null;
let _fireflyPhases: Float32Array | null = null;
let _fireflyDriftAngles: Float32Array | null = null;
let _fireflyBase: Float32Array | null = null;

// ---------------------------------------------------------------------------
// 1. God rays — 10 semi-transparent cone geometries radiating from sun dir
// ---------------------------------------------------------------------------

function buildGodRays(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-atmos-god-rays';
  group.userData.farcrysisArt = true;

  const rayCount = 10;
  const sunDir = ATMOS_SUN_DIR.clone();

  for (let i = 0; i < rayCount; i++) {
    // Scatter cone origins across the arena for varied god-ray positions
    const origin = new THREE.Vector3(
      (Math.random() - 0.5) * 40,
      2 + Math.random() * 8,
      (Math.random() - 0.5) * 40,
    );

    const coneLength = 30 + Math.random() * 25;
    const coneAngle = 0.05 + Math.random() * 0.08;
    const radius = Math.tan(coneAngle) * coneLength;

    const geom = new THREE.ConeGeometry(radius, coneLength, 8, 1, true); // open-ended cone
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff5e0,
      transparent: true,
      opacity: 0.08 + Math.random() * 0.07, // 0.08–0.15
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const cone = new THREE.Mesh(geom, mat);
    cone.name = `farcrysis-atmos-god-ray-${i}`;

    // Position: tip at origin, base at origin + direction * length
    const midpoint = origin.clone().add(sunDir.clone().multiplyScalar(coneLength / 2));
    cone.position.copy(midpoint);

    // Orient cone along the sun direction
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, sunDir);
    cone.setRotationFromQuaternion(quat);

    cone.renderOrder = 996;
    cone.frustumCulled = false;
    cone.userData.farcrysisArt = true;

    group.add(cone);
  }

  return group;
}

// ---------------------------------------------------------------------------
// 2. Dust motes — ~200 Points with CPU-driven circular motion in sunbeams
// ---------------------------------------------------------------------------

function buildDustMotes(): THREE.Points {
  const count = 200;
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const radii = new Float32Array(count);
  const heightOffsets = new Float32Array(count);

  // Concentrate particles in a cylindrical volume aligned with the sun axis
  const sunAxis = ATMOS_SUN_DIR.clone();
  const perp1 = new THREE.Vector3(-sunAxis.z, 0, sunAxis.x).normalize();
  if (perp1.lengthSq() < 0.1) perp1.set(0, 1, 0);
  const perp2 = new THREE.Vector3().crossVectors(sunAxis, perp1).normalize();

  const cylinderRadius = 18;
  const cylinderHalfLen = 28;
  const midpoint = new THREE.Vector3(0, 5, 0);

  for (let i = 0; i < count; i++) {
    const r = Math.random() * cylinderRadius;
    const angle = Math.random() * Math.PI * 2;
    const along = (Math.random() - 0.5) * cylinderHalfLen * 2;

    const px = midpoint.x + perp1.x * Math.cos(angle) * r + perp2.x * Math.sin(angle) * r + sunAxis.x * along;
    const py = midpoint.y + perp1.y * Math.cos(angle) * r + perp2.y * Math.sin(angle) * r + sunAxis.y * along;
    const pz = midpoint.z + perp1.z * Math.cos(angle) * r + perp2.z * Math.sin(angle) * r + sunAxis.z * along;

    const cx = Math.max(FARCRYSIS_BOUNDS.minX, Math.min(FARCRYSIS_BOUNDS.maxX, px));
    const cy = Math.max(0.2, Math.min(20, py));
    const cz = Math.max(FARCRYSIS_BOUNDS.minZ, Math.min(FARCRYSIS_BOUNDS.maxZ, pz));

    origins[i * 3 + 0] = cx;
    origins[i * 3 + 1] = cy;
    origins[i * 3 + 2] = cz;

    positions[i * 3 + 0] = cx;
    positions[i * 3 + 1] = cy;
    positions[i * 3 + 2] = cz;

    phases[i] = Math.random() * Math.PI * 2;
    radii[i] = 0.3 + Math.random() * 2.5;
    heightOffsets[i] = (Math.random() - 0.5) * 2.0;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xffeedd,
    size: 0.12,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geom, mat);
  points.name = 'farcrysis-atmos-dust';
  points.userData.farcrysisArt = true;
  points.frustumCulled = false;
  points.renderOrder = 999;

  // Store state for per-frame animation
  _dustPoints = points;
  _dustOrigins = origins;
  _dustPhases = phases;
  _dustRadii = radii;
  _dustHeightOffsets = heightOffsets;

  return points;
}

// ---------------------------------------------------------------------------
// 3. Fireflies — 50 glowing points in the jungle mid-ring (radius 8–18)
// ---------------------------------------------------------------------------

function buildFireflies(): THREE.Points {
  const count = 50;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const driftAngles = new Float32Array(count);

  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 10; // 8–18

    let px = Math.cos(angle) * radius;
    let pz = Math.sin(angle) * radius;

    px = Math.max(minX + 2, Math.min(maxX - 2, px));
    pz = Math.max(minZ + 2, Math.min(maxZ - 2, pz));

    const py = 1.0 + Math.random() * 3.0;

    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    base[i * 3 + 0] = px;
    base[i * 3 + 1] = py;
    base[i * 3 + 2] = pz;

    phases[i] = Math.random() * Math.PI * 2;
    driftAngles[i] = Math.random() * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xccff88,
    size: 0.22,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geom, mat);
  points.name = 'farcrysis-atmos-fireflies';
  points.userData.farcrysisArt = true;
  points.frustumCulled = false;
  points.renderOrder = 1001;

  _fireflyPoints = points;
  _fireflyPhases = phases;
  _fireflyDriftAngles = driftAngles;
  _fireflyBase = base;

  return points;
}

// ---------------------------------------------------------------------------
// 4. Enhanced fog layer — warm golden-hour ground haze plane
// ---------------------------------------------------------------------------

function buildFogLayer(): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(80, 80);
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const plane = new THREE.Mesh(geom, mat);
  plane.name = 'farcrysis-atmos-fog';
  plane.position.y = 1.0;
  plane.renderOrder = 4;
  plane.frustumCulled = false;
  plane.userData.farcrysisArt = true;

  return plane;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build and add all atmospheric polish objects to the scene.
 * Safe to call after terrain, lighting, and vegetation are established.
 */
export function buildAtmosphere(scene: THREE.Scene): void {
  _godRayGroup = buildGodRays();
  scene.add(_godRayGroup);

  scene.add(buildDustMotes());

  scene.add(buildFireflies());

  scene.add(buildFogLayer());
}

/**
 * Per-frame animation driver for atmosphere effects.
 * @param time Current time in seconds (e.g. `performance.now() * 0.001`).
 */
export function animateAtmosphere(time: number): void {
  // --- God-ray rotation (slowly tracks implied sun movement) ---
  if (_godRayGroup) {
    _godRayGroup.rotation.y = Math.sin(time * 0.03) * 0.08;
    _godRayGroup.rotation.x = Math.cos(time * 0.025) * 0.04;
  }

  // --- Dust motes: circular motion using stored origins + sin/cos ---
  if (_dustPoints && _dustOrigins && _dustPhases && _dustRadii && _dustHeightOffsets) {
    const posAttr = _dustPoints.geometry.attributes.position as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const count = _dustPhases.length;

    for (let i = 0; i < count; i++) {
      const phase = _dustPhases[i] + time * 0.55;
      const r = _dustRadii[i];
      const ox = _dustOrigins[i * 3 + 0];
      const oy = _dustOrigins[i * 3 + 1];
      const oz = _dustOrigins[i * 3 + 2];

      positions[i * 3 + 0] = ox + Math.sin(phase) * r;
      positions[i * 3 + 1] = oy + Math.cos(phase * 1.3) * r * 0.45 + Math.sin(phase * 0.65) * _dustHeightOffsets[i];
      positions[i * 3 + 2] = oz + Math.cos(phase) * r;
    }

    posAttr.needsUpdate = true;
  }

  // --- Fireflies: vertical bobbing, horizontal drift, opacity pulse ---
  if (_fireflyPoints && _fireflyPhases && _fireflyDriftAngles && _fireflyBase) {
    const posAttr = _fireflyPoints.geometry.attributes.position as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const count = _fireflyPhases.length;

    for (let i = 0; i < count; i++) {
      const phase = _fireflyPhases[i];
      const drift = _fireflyDriftAngles[i];

      positions[i * 3 + 0] = _fireflyBase[i * 3 + 0] + Math.sin(time * 0.3 + drift) * 0.55;
      positions[i * 3 + 1] = _fireflyBase[i * 3 + 1] + Math.sin(time * 0.75 + phase) * 0.35;
      positions[i * 3 + 2] = _fireflyBase[i * 3 + 2] + Math.cos(time * 0.33 + drift) * 0.55;
    }

    posAttr.needsUpdate = true;

    // Global opacity pulse — averages out individual phases into a nice shimmer
    const mat = _fireflyPoints.material as THREE.PointsMaterial;
    mat.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2.3 + 0.7));
  }
}