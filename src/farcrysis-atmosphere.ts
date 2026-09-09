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
 *
 * ---------------------------------------------------------------------------
 * HF-371 pass. Three changes, each closing a real gap rather than restyling:
 *
 * 1. NOTHING HERE ROLLS `Math.random` ANY MORE. The dust was seeded in Pass 76
 *    and this file's own comment called determinism "the arena idiom", but the
 *    god-ray shafts and the fireflies were still rolling raw randoms — so two
 *    peers standing in the same clearing in the same match were looking at
 *    different light. Both now draw from `DeterministicRng`, the repository's
 *    canonical seeded stream, forked per system so adding one cannot shift
 *    another's scatter. The local mulberry32 copy is gone: it was the same
 *    algorithm as `DeterministicRng`, written out a second time.
 *
 * 2. THE SHAFTS ARE PUBLISHED, NOT JUST DRAWN. `farcrysisLightShafts()` hands
 *    the particle runtime the cones this file authored, so suspended dust
 *    BRIGHTENS where the light actually is. "Dust in a shaft of light" is not a
 *    separate effect from either system; it is the two of them agreeing on
 *    where the shafts are, which they could not previously do because only this
 *    file knew.
 *
 * 3. THE AIR HERE OBEYS THE SHARED WIND FIELD. `animateAtmosphere` takes an
 *    optional wind sample and drifts the motes and fireflies with it. This is
 *    the defect `weather/wind-field.ts` was written to end: dust hanging
 *    perfectly still while the palms bend, or drifting one way while the grass
 *    leans the other, reads as broken rather than as air. The parameter is
 *    optional, so the existing call in farcrysis-art.ts keeps working unchanged.
 */

import * as THREE from 'three';
import { DeterministicRng } from './deterministic-rng';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
// Imported from the registry rather than from `./particles` so this art
// module never pulls the renderer-side particle system in behind it.
import { publishLightShafts, type ParticleLightShaft } from './particles/light-shaft-registry';

// ---------------------------------------------------------------------------
// Atmosphere constants
// ---------------------------------------------------------------------------

/** Golden-hour sun position (low angle from task specification). */
const ATMOS_SUN = new THREE.Vector3(35, 25, -10);
const ATMOS_SUN_DIR = ATMOS_SUN.clone().normalize();

/**
 * Sky-dome sun disk placement — matches the live golden-hour directional light
 * (farcrysis-art.ts sun at (-18, 22, 25)) so the disk sits in the sky where the
 * light actually comes from. Parked inside the 180–200 m sky dome.
 */
const ATMOS_SUN_DISK_DIR = new THREE.Vector3(-18, 22, 25).normalize();
const ATMOS_SUN_DISK_DIST = 165;
const ATMOS_SHAFT_COUNT = 7;

// ---------------------------------------------------------------------------
// Module-level state for per-frame animation
// ---------------------------------------------------------------------------

let _dustPoints: THREE.Points | null = null;
let _dustOrigins: Float32Array | null = null;
let _dustPhases: Float32Array | null = null;
let _dustRadii: Float32Array | null = null;
let _dustHeightOffsets: Float32Array | null = null;
let _fireflyPoints: THREE.Points | null = null;
let _fireflyPhases: Float32Array | null = null;
let _fireflyDriftAngles: Float32Array | null = null;
let _fireflyBase: Float32Array | null = null;
let _sunDiskGroup: THREE.Group | null = null;
let _sunHaloMesh: THREE.Mesh | null = null;
let _shaftGroup: THREE.Group | null = null;
const _shaftMeshes: THREE.Mesh[] = [];
const _shaftBaseOpacities: number[] = [];
const _shaftPhases: number[] = [];
const _shaftSpeeds: number[] = [];
const _shaftOrigins: THREE.Vector3[] = [];
const _lightShafts: ParticleLightShaft[] = [];

/**
 * Wind-integrated drift applied to the mote and firefly clouds. Held as one
 * displacement rather than baked into each point, so it stays a single add per
 * particle per frame, and wrapped inside the arena so a steady breeze can never
 * carry the whole field off the map.
 */
let _windDriftX = 0;
let _windDriftZ = 0;
let _lastAtmosTime = 0;

/** Fraction of the shared wind the fine motes actually carry. */
const ATMOS_DUST_WIND_PULL = 0.35;
/** Fireflies fly; wind pushes them, it does not carry them. */
const ATMOS_FIREFLY_WIND_PULL = 0.12;

/**
 * One seed for the whole arena's atmosphere, forked per system. Forking rather
 * than sharing a single stream means adding a shaft cannot move a firefly.
 */
const FARCRYSIS_ATMOSPHERE_SEED = 0xfa2c;

function atmosphereStream(label: string): DeterministicRng {
  return new DeterministicRng(FARCRYSIS_ATMOSPHERE_SEED).fork(`farcrysis-atmosphere/${label}`);
}

// ---------------------------------------------------------------------------
// 5. Sun disk in the sky dome — bright core + additive halo/glow facing the arena
// ---------------------------------------------------------------------------

function buildSunDisk(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-atmos-sun-disk';
  group.userData.farcrysisArt = true;
  group.frustumCulled = false;

  const center = ATMOS_SUN_DISK_DIR.clone().multiplyScalar(ATMOS_SUN_DISK_DIST);

  // Core disk — bright warm-white face visible against the sky gradient
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff8e0,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  core.name = 'farcrysis-atmos-sun-disk-core';
  core.userData.farcrysisArt = true;

  // Inner halo — soft additive glow hugging the disk
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffcc80,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.name = 'farcrysis-atmos-sun-disk-halo';
  halo.userData.farcrysisArt = true;

  // Outer glow — wide warm bloom behind the disk
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(14, 40),
    new THREE.MeshBasicMaterial({
      color: 0xff9a4a,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  glow.name = 'farcrysis-atmos-sun-disk-glow';
  glow.userData.farcrysisArt = true;

  for (const part of [core, halo, glow]) {
    part.position.copy(center);
    part.lookAt(0, 0, 0); // face the arena centre (CircleGeometry front is +Z)
  }

  group.add(core, halo, glow);
  _sunHaloMesh = halo;
  return group;
}

// ---------------------------------------------------------------------------
// 6. God-ray shafts — additive quads (MeshBasicMaterial, no ShaderMaterial)
// ---------------------------------------------------------------------------

function buildGodRayShafts(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-atmos-god-ray-shafts';
  group.userData.farcrysisArt = true;

  _shaftMeshes.length = 0;
  _shaftBaseOpacities.length = 0;
  _shaftPhases.length = 0;
  _shaftSpeeds.length = 0;
  _shaftOrigins.length = 0;
  _lightShafts.length = 0;

  const rng = atmosphereStream('god-ray-shafts');
  const up = new THREE.Vector3(0, 1, 0);
  const sunDir = ATMOS_SUN_DISK_DIR.clone();

  for (let i = 0; i < ATMOS_SHAFT_COUNT; i++) {
    // Scatter shaft origins across the arena, clamped inside the bounds
    const ox = (rng.next() - 0.5) * 36;
    const oz = (rng.next() - 0.5) * 36;
    const origin = new THREE.Vector3(
      Math.max(FARCRYSIS_BOUNDS.minX + 2, Math.min(FARCRYSIS_BOUNDS.maxX - 2, ox)),
      3 + rng.next() * 9,
      Math.max(FARCRYSIS_BOUNDS.minZ + 2, Math.min(FARCRYSIS_BOUNDS.maxZ - 2, oz)),
    );

    const length = 26 + rng.next() * 16;
    const width = 1.6 + rng.next() * 1.6;

    // Slight per-shaft tilt off the pure sun axis so quads stay visible
    // from many camera angles (a pure axis-aligned quad is edge-on head-on).
    const axis = sunDir
      .clone()
      .add(new THREE.Vector3((rng.next() - 0.5) * 0.1, (rng.next() - 0.5) * 0.1, (rng.next() - 0.5) * 0.1))
      .normalize();

    // A plain additive quad has hard ends, which is what made these read as
    // white triangles pasted over the sky rather than light in air. Under
    // additive blending, black IS transparent - so a vertex-colour ramp that
    // falls to black at both ends of the shaft gives a soft fade for free, with
    // no extra texture, no alpha map and no second draw.
    const shaftGeometry = new THREE.PlaneGeometry(width, length, 1, 6);
    const shaftPosition = shaftGeometry.getAttribute('position');
    const shaftColors = new Float32Array(shaftPosition.count * 3);
    for (let vertex = 0; vertex < shaftPosition.count; vertex += 1) {
      // Normalised distance from the shaft's centre along its length.
      const along = Math.abs(shaftPosition.getY(vertex)) / (length / 2);
      const fade = Math.max(0, 1 - along * along);
      shaftColors[vertex * 3] = fade;
      shaftColors[vertex * 3 + 1] = fade;
      shaftColors[vertex * 3 + 2] = fade;
    }
    shaftGeometry.setAttribute('color', new THREE.BufferAttribute(shaftColors, 3));

    const quad = new THREE.Mesh(
      shaftGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffecc0,
        vertexColors: true,
        transparent: true,
        // Halved now that the duplicate cone system no longer stacks on top.
        opacity: 0.02 + rng.next() * 0.015,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    quad.name = `farcrysis-atmos-god-ray-shaft-${i}`;
    quad.position.copy(origin);
    quad.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis));
    quad.rotateY(rng.next() * Math.PI * 2); // seeded roll around the sun axis
    quad.renderOrder = 997;
    quad.frustumCulled = false;
    quad.userData.farcrysisArt = true;
    group.add(quad);

    _shaftMeshes.push(quad);
    _shaftBaseOpacities.push((quad.material as THREE.MeshBasicMaterial).opacity);
    _shaftPhases.push(rng.next() * Math.PI * 2);
    _shaftSpeeds.push(0.5 + rng.next() * 0.7);
    _shaftOrigins.push(origin.clone());

    // Publish the cone so suspended dust can brighten inside it. The radius is
    // wider than the quad because the visible shaft is the LIT AIR around the
    // card, not the card.
    _lightShafts.push(Object.freeze({
      x: origin.x, y: origin.y, z: origin.z,
      axisX: axis.x, axisY: axis.y, axisZ: axis.z,
      radiusM: width * 1.6,
    }));
  }

  return group;
}


/**
 * A soft round dot, used as the sprite for every point cloud in this arena.
 *
 * An untextured PointsMaterial draws each point as a hard-edged SQUARE. At dust
 * and firefly scale against a bright sky that reads exactly as what it is -
 * white squares pasted over the horizon - and it was the most conspicuous
 * artefact left in the arena after the sky was fixed.
 *
 * The texture is a radial falloff built as a DataTexture rather than through a
 * 2D canvas: canvas is unavailable in the test environment, and a 32x32 ramp is
 * cheaper to synthesise than to rasterise. Under additive blending black is
 * transparent, so the falloff alone produces a soft dot with no alpha test and
 * no sorting cost.
 */
let _softDotTexture: THREE.DataTexture | null = null;

export function softDotTexture(): THREE.DataTexture {
  if (_softDotTexture) return _softDotTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      // Squared falloff keeps a bright core with a long soft skirt.
      const intensity = Math.max(0, 1 - distance);
      const value = Math.round(intensity * intensity * 255);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = value;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'farcrysis-soft-dot';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  _softDotTexture = texture;
  return texture;
}

// ---------------------------------------------------------------------------
// God rays: ONE system.
//
// This arena carried two independent god-ray implementations - 10 additive
// cones AND 7 additive quads - drawn on top of each other at renderOrder 996
// and 997. Seventeen overlapping additive surfaces is enough to wash the sky
// to flat white, and neither system was occluded by the other, so the cost was
// paid twice for a worse image. The cones are gone; the quads remain and are
// now softened (see buildGodRayShafts).
// ---------------------------------------------------------------------------

/**
 * NOTE FOR THE COMMIT THAT WIRES `src/particles`: this 60-point CPU-updated
 * cloud is the same effect as the particle runtime's `motes` family, which
 * carries an order of magnitude more of it in one instanced draw and brightens
 * inside the shafts published above. Retire this builder IN THAT COMMIT, not
 * before — deleting it while the runtime is still unwired would leave the
 * arena with LESS air than it has today, which is the opposite of HF-371.
 */
function buildDustMotes(): THREE.Points {
  // Pass 76: 200 dust motes at size 0.12 / opacity 0.5 read as SNOWFALL over
  // a tropical beach. Fewer, smaller, dimmer — pollen drifting through the
  // sunbeams, only really visible inside a shaft. Also seeded (was
  // Math.random — presentation-only, but the arena idiom is deterministic).
  const count = 60;
  const rng = atmosphereStream('dust-motes');
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
    const r = rng.next() * cylinderRadius;
    const angle = rng.next() * Math.PI * 2;
    const along = (rng.next() - 0.5) * cylinderHalfLen * 2;

    const px = midpoint.x + perp1.x * Math.cos(angle) * r + perp2.x * Math.sin(angle) * r + sunAxis.x * along;
    const py = midpoint.y + perp1.y * Math.cos(angle) * r + perp2.y * Math.sin(angle) * r + sunAxis.y * along;
    const pz = midpoint.z + perp1.z * Math.cos(angle) * r + perp2.z * Math.sin(angle) * r + sunAxis.z * along;

    const cx = Math.max(FARCRYSIS_BOUNDS.minX, Math.min(FARCRYSIS_BOUNDS.maxX, px));
    const cy = Math.max(0.2, Math.min(14, py));
    const cz = Math.max(FARCRYSIS_BOUNDS.minZ, Math.min(FARCRYSIS_BOUNDS.maxZ, pz));

    origins[i * 3 + 0] = cx;
    origins[i * 3 + 1] = cy;
    origins[i * 3 + 2] = cz;

    positions[i * 3 + 0] = cx;
    positions[i * 3 + 1] = cy;
    positions[i * 3 + 2] = cz;

    phases[i] = rng.next() * Math.PI * 2;
    radii[i] = 0.3 + rng.next() * 2.5;
    heightOffsets[i] = (rng.next() - 0.5) * 2.0;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xffeedd,
    size: 0.04,
    map: softDotTexture(),
    transparent: true,
    opacity: 0.16,
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
  const rng = atmosphereStream('fireflies');
  const count = 50;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const driftAngles = new Float32Array(count);

  const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;

  for (let i = 0; i < count; i++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = 16 + rng.next() * 20; // HF-396: 16–36 across the doubled interior

    let px = Math.cos(angle) * radius;
    let pz = Math.sin(angle) * radius;

    px = Math.max(minX + 2, Math.min(maxX - 2, px));
    pz = Math.max(minZ + 2, Math.min(maxZ - 2, pz));

    const py = 1.0 + rng.next() * 3.0;

    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    base[i * 3 + 0] = px;
    base[i * 3 + 1] = py;
    base[i * 3 + 2] = pz;

    phases[i] = rng.next() * Math.PI * 2;
    driftAngles[i] = rng.next() * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    // Pass 76: smaller and dimmer — a subtle jungle shimmer, not fairy lights.
    color: 0xccff88,
    size: 0.14,
    map: softDotTexture(),
    transparent: true,
    opacity: 0.4,
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
  // HF-396: haze plane doubles with the island.
  const geom = new THREE.PlaneGeometry(160, 160);
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    // Pass 76 regrade: warm-orange additive haze fed the beige wash; the
    // ground mist now leans pale green-white (jungle humidity, not dust).
    color: 0xdcead2,
    transparent: true,
    opacity: 0.05,
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

  scene.add(buildDustMotes());

  scene.add(buildFireflies());

  scene.add(buildFogLayer());

  _sunDiskGroup = buildSunDisk();
  scene.add(_sunDiskGroup);

  _shaftGroup = buildGodRayShafts();
  scene.add(_shaftGroup);
  // PASS 79 - THE LINE THAT WAS MISSING. These cones have been published
  // through `farcrysisLightShafts()` since they were authored, and a repo-wide
  // grep found that function imported by exactly one file: its own test. Live
  // telemetry agreed - `particles.lightShafts` read 0 on every arena - so the
  // motes never knew where the light was and "dust in a shaft of light" was
  // green on both sides and invisible on screen.
  publishLightShafts('farcrysis', _lightShafts);
}

/**
 * The authored god-ray cones, in the shape the particle runtime consumes.
 *
 * Empty until `buildAtmosphere` has run, so the caller registers them after
 * the arena is built:
 *
 *   particles.setLightShafts(farcrysisLightShafts());
 *
 * Bounded by ATMOS_SHAFT_COUNT (7) against the runtime's own cap of 6, so the
 * mote-brightening loop's cost is known from both ends rather than inherited.
 */
export function farcrysisLightShafts(): readonly ParticleLightShaft[] {
  return _lightShafts;
}

/**
 * Per-frame animation driver for atmosphere effects.
 *
 * @param time Current time in seconds (e.g. `performance.now() * 0.001`).
 * @param wind Optional sample from the shared wind field
 *   (`sampleWind(...)` in `weather/wind-field.ts`). When supplied, the motes
 *   and fireflies drift with the same air the palms and the rain already use.
 *   Omitted, the arena behaves exactly as it did before HF-371 — which is what
 *   keeps the existing single-argument call in farcrysis-art.ts valid.
 */
export function animateAtmosphere(time: number, wind: Readonly<{ x: number; z: number }> | null = null): void {
  // Derive the step from the clock this function is already given rather than
  // asking the caller for one: a second parameter that every call site has to
  // compute correctly is a second way to wire this wrong.
  const step = Math.min(0.1, Math.max(0, time - _lastAtmosTime));
  _lastAtmosTime = time;
  if (wind) {
    _windDriftX += (Number.isFinite(wind.x) ? wind.x : 0) * ATMOS_DUST_WIND_PULL * step;
    _windDriftZ += (Number.isFinite(wind.z) ? wind.z : 0) * ATMOS_DUST_WIND_PULL * step;
    // Wrap inside the arena. Without this a steady monsoon breeze carries the
    // entire dust field off the map inside a minute and the clearing goes dead.
    const spanX = FARCRYSIS_BOUNDS.maxX - FARCRYSIS_BOUNDS.minX;
    const spanZ = FARCRYSIS_BOUNDS.maxZ - FARCRYSIS_BOUNDS.minZ;
    if (_windDriftX > spanX / 2) _windDriftX -= spanX;
    else if (_windDriftX < -spanX / 2) _windDriftX += spanX;
    if (_windDriftZ > spanZ / 2) _windDriftZ -= spanZ;
    else if (_windDriftZ < -spanZ / 2) _windDriftZ += spanZ;
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

      positions[i * 3 + 0] = ox + Math.sin(phase) * r + _windDriftX;
      positions[i * 3 + 1] = oy + Math.cos(phase * 1.3) * r * 0.45 + Math.sin(phase * 0.65) * _dustHeightOffsets[i];
      positions[i * 3 + 2] = oz + Math.cos(phase) * r + _windDriftZ;
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

      const push = ATMOS_FIREFLY_WIND_PULL / ATMOS_DUST_WIND_PULL;
      positions[i * 3 + 0] = _fireflyBase[i * 3 + 0] + Math.sin(time * 0.3 + drift) * 0.55 + _windDriftX * push;
      positions[i * 3 + 1] = _fireflyBase[i * 3 + 1] + Math.sin(time * 0.75 + phase) * 0.35;
      positions[i * 3 + 2] = _fireflyBase[i * 3 + 2] + Math.cos(time * 0.33 + drift) * 0.55 + _windDriftZ * push;
    }

    posAttr.needsUpdate = true;

    // Global opacity pulse — averages out individual phases into a nice
    // shimmer. Pass 76: peak lowered so fireflies stay subtle in daylight.
    const mat = _fireflyPoints.material as THREE.PointsMaterial;
    mat.opacity = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.3 + 0.7));
  }

  // --- Sun disk: breathing halo + gentle opacity shimmer ---
  if (_sunHaloMesh) {
    _sunHaloMesh.scale.setScalar(1 + Math.sin(time * 0.5) * 0.06);
    const haloMat = _sunHaloMesh.material as THREE.MeshBasicMaterial;
    haloMat.opacity = 0.30 + Math.sin(time * 0.7 + 1.2) * 0.08;
  }

  // --- God-ray shafts: slow group sway + per-shaft flicker + drift along sun axis ---
  if (_shaftGroup) {
    _shaftGroup.rotation.y = Math.sin(time * 0.03 + 1.3) * 0.07;
    _shaftGroup.rotation.x = Math.cos(time * 0.025 + 0.6) * 0.035;
  }
  for (let i = 0; i < _shaftMeshes.length; i++) {
    const quad = _shaftMeshes[i];
    const shaftMat = quad.material as THREE.MeshBasicMaterial;
    const pulse = 0.72 + 0.28 * Math.sin(time * _shaftSpeeds[i] + _shaftPhases[i]);
    shaftMat.opacity = Math.max(0.01, _shaftBaseOpacities[i] * pulse);
    quad.position
      .copy(_shaftOrigins[i])
      .addScaledVector(ATMOS_SUN_DISK_DIR, Math.sin(time * 0.12 + _shaftPhases[i] * 2.0) * 1.4);
  }
}