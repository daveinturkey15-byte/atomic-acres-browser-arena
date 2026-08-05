/**
 * farcrysis-vista.ts — Pass 69 ocean-horizon vista (sub-agent A).
 *
 * Golden-hour open-ocean backdrop for the Farcrysis arena:
 *   - A 512×512 ocean water plane that fills the horizon far beyond the
 *     64×64 play arena (the lagoon water in farcrysis-terrain.ts covers the
 *     centre; this plane extends the water table outward to the sky dome).
 *   - Five distant low-poly island silhouettes (volcanic cone + jungle-dome
 *     clusters) at 80–150 m from centre, tinted to sit inside the warm haze.
 *   - Eighteen animated seabird points orbiting the beach/ocean at 12–28 m,
 *     driven per-frame by animateVista(timeSeconds).
 *
 * Presentation only — no colliders, spawn points, navigation or gameplay
 * authority. Every mesh is tagged userData.farcrysisArt = true.
 * Deterministic: fixed-seed mulberry32 only, no Math.random.
 *
 * Exports:
 *   applyVista(scene)              — adds ocean plane, islands and birds
 *   animateVista(timeSeconds)      — per-frame bird orbit update (safe no-op
 *                                    before applyVista has run, idempotent)
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Ocean plane height. The lagoon water in farcrysis-terrain.ts sits at
 * y = -0.3 and its vertex-shader waves displace the surface by up to ±0.29
 * (trough ≈ -0.59). The open-ocean plane is placed just below that trough so
 * the two water surfaces never intersect (no z-fighting on the 76×76 lagoon
 * overlap zone) while still reading as the same water table.
 */
const OCEAN_Y = -0.62;
const OCEAN_SIZE = 512;

const OCEAN_COLOR = 0x1f7086; // tropical open-ocean teal, warmed for sunset
const OCEAN_ROUGHNESS = 0.3; // low roughness → golden-hour sun glitter path
const OCEAN_METALNESS = 0.05;
const OCEAN_EMISSIVE = 0x55260f; // faint warm glow — sunset colour grading on the water
const OCEAN_EMISSIVE_INTENSITY = 0.22;

/** Horizontal sun azimuth — matches the golden-hour light at (-18, 22, 25). */
const SUN_AZIMUTH = new THREE.Vector3(-18, 0, 25).normalize();

/** Distant hazy green — sits inside the warm FogExp2 (0xffd4b3) haze. */
const ISLAND_HAZE_COLOR = 0x4a6a5a;

/** Low-poly island silhouette facets. */
const ISLAND_RADIAL_SEGMENTS = 8;
const PEAK_RADIAL_SEGMENTS = 7;

/** Five island centres, 143–150 m out, spread around the compass. */
const ISLAND_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [-118, 0, -92], // NW
  [120, 0, -88], // NE
  [38, 0, 138], // S (slightly E)
  [-96, 0, 108], // SW
  [142, 0, 38], // E (smaller)
];

const BIRD_COUNT = 18;
const BIRD_WHITE = 0xf4f1e8; // warm sunlit white
const BIRD_DARK = 0x2e2e30;

// ---------------------------------------------------------------------------
// Deterministic RNG (fixed seeds — no Math.random)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Module state (null until applyVista runs)
// ---------------------------------------------------------------------------

interface VistaBirds {
  points: THREE.Points;
  count: number;
  cx: Float32Array;
  cz: Float32Array;
  radius: Float32Array;
  speed: Float32Array;
  phase: Float32Array;
  yBase: Float32Array;
  yAmp: Float32Array;
  bobSpeed: Float32Array;
  positions: Float32Array;
}

let birds: VistaBirds | null = null;
let vistaApplied = false;
let _glitterPath: THREE.Mesh | null = null;

// ---------------------------------------------------------------------------
// Ocean plane
// ---------------------------------------------------------------------------

function buildOcean(scene: THREE.Scene): void {
  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: OCEAN_COLOR,
    roughness: OCEAN_ROUGHNESS,
    metalness: OCEAN_METALNESS,
    emissive: OCEAN_EMISSIVE,
    emissiveIntensity: OCEAN_EMISSIVE_INTENSITY,
  });

  const ocean = new THREE.Mesh(geometry, material);
  ocean.name = 'farcrysis-vista-ocean';
  ocean.position.y = OCEAN_Y;
  ocean.castShadow = false; // flat water never casts
  ocean.receiveShadow = true;
  ocean.userData.farcrysisArt = true;
  scene.add(ocean);
}

// ---------------------------------------------------------------------------
// Sunset horizon grading — warm glow bands + sun glitter path on the ocean
// ---------------------------------------------------------------------------

/**
 * Two additive warm glow rings straddling the horizon circle (the sky dome is
 * ~180 m out) so the sunset colour sits right where the ocean meets the sky.
 */
function buildSunsetHorizonGlow(scene: THREE.Scene): void {
  // Wide soft halo below the horizon line
  const wideGeom = new THREE.RingGeometry(168, 194, 96);
  wideGeom.rotateX(-Math.PI / 2);
  const wide = new THREE.Mesh(
    wideGeom,
    new THREE.MeshBasicMaterial({
      color: 0xff8f3f,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  wide.name = 'farcrysis-vista-horizon-glow-wide';
  wide.position.y = -0.5;
  wide.renderOrder = 2;
  wide.userData.farcrysisArt = true;
  scene.add(wide);

  // Bright band right on the horizon line
  const bandGeom = new THREE.RingGeometry(178, 186, 96);
  bandGeom.rotateX(-Math.PI / 2);
  const band = new THREE.Mesh(
    bandGeom,
    new THREE.MeshBasicMaterial({
      color: 0xffb469,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  band.name = 'farcrysis-vista-horizon-glow-band';
  band.position.y = -0.55;
  band.renderOrder = 2;
  band.userData.farcrysisArt = true;
  scene.add(band);
}

/**
 * Canvas streak texture for the sun glitter path — bright and wide at the
 * horizon end, tapering to a faint point toward the viewer.
 */
function createGlitterCanvas(): HTMLCanvasElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const w = 128;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(0x9e11_7d3);

    ctx.clearRect(0, 0, w, h);
    for (let py = 0; py < h; py++) {
      const t = py / (h - 1); // 0 = horizon end (bright), 1 = viewer end (faint)
      const intensity = Math.exp(-((t * 5.5) ** 2)) * 0.85 + Math.exp(-((t * 12) ** 2)) * 0.25;
      if (intensity <= 0.01) continue;
      const halfW = Math.max(1, w * 0.5 * (1 - 0.88 * t)); // taper toward viewer
      ctx.fillStyle = `rgba(255, 205, 140, ${intensity})`;
      ctx.fillRect(w * 0.5 - halfW, py, halfW * 2, 1);
    }

    // Glitter sparkles concentrated near the horizon end
    for (let i = 0; i < 260; i++) {
      const sx = rng() * w;
      const sy = rng() * h * 0.5;
      ctx.fillStyle = `rgba(255, 236, 200, ${0.10 + rng() * 0.35})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6 + rng() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Sun glitter path — a long additive quad lying on the open ocean, aimed at
 * the sun azimuth, from just beyond the lagoon out to the horizon.
 */
function buildSunGlitterPath(scene: THREE.Scene): void {
  const canvas = createGlitterCanvas();
  if (!canvas) return;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const geom = new THREE.PlaneGeometry(18, 260, 1, 12);
  geom.rotateX(-Math.PI / 2);

  const path = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  path.name = 'farcrysis-vista-sun-glitter-path';
  path.position.copy(SUN_AZIMUTH.clone().multiplyScalar(115));
  path.position.y = OCEAN_Y + 0.02;
  // Rotate so the plane's far end (-Z after flattening) points at the sun azimuth
  path.rotation.y = Math.atan2(-SUN_AZIMUTH.x, -SUN_AZIMUTH.z);
  path.renderOrder = 3;
  path.frustumCulled = false;
  path.userData.farcrysisArt = true;
  scene.add(path);

  _glitterPath = path;
}

// ---------------------------------------------------------------------------
// Distant island silhouettes
// ---------------------------------------------------------------------------

function buildIsland(
  scene: THREE.Scene,
  index: number,
  position: readonly [number, number, number],
  islandMat: THREE.MeshStandardMaterial,
): void {
  const rng = mulberry32(0xf4c5 + index * 7919);

  // Island mass scale — 0.85–1.25 (island 5 seeded smaller by chance).
  const s = 0.85 + rng() * 0.4;
  const baseRadius = (14 + rng() * 10) * s; // 12–30 → base diameter 24–60 m
  const baseHeight = (4 + rng() * 4) * s; // rocky base mass
  const baseTopY = -1.6; // base top sits ~1 m below the water line

  const group = new THREE.Group();
  group.name = `farcrysis-vista-island-${index}`;
  group.position.set(position[0], position[1], position[2]);
  group.userData.farcrysisArt = true;

  // ---- Rocky base — wide low cone rising out of the sea ----
  const base = new THREE.Mesh(
    new THREE.ConeGeometry(baseRadius, baseHeight, ISLAND_RADIAL_SEGMENTS, 1),
    islandMat,
  );
  base.position.y = baseTopY - baseHeight / 2; // bottom ~5–6 m below water
  base.castShadow = true;
  base.receiveShadow = true;
  base.userData.farcrysisArt = true;
  group.add(base);

  // ---- Volcanic peaks (1–2 per island), 20–38 m above the mass ----
  const peakCount = 1 + Math.floor(rng() * 2);
  for (let p = 0; p < peakCount; p++) {
    const peakRadius = (5 + rng() * 8) * s;
    const peakHeight = (20 + rng() * 17) * s; // apex ≈ 18–36 m above the sea
    const offX = (rng() - 0.5) * baseRadius * 1.1;
    const offZ = (rng() - 0.5) * baseRadius * 1.1;

    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(peakRadius, peakHeight, PEAK_RADIAL_SEGMENTS, 1),
      islandMat,
    );
    peak.position.set(offX, baseTopY + peakHeight / 2 - 0.6 * s, offZ);
    peak.rotation.y = rng() * Math.PI; // facet orientation varies per island
    peak.castShadow = true;
    peak.receiveShadow = true;
    peak.userData.farcrysisArt = true;
    group.add(peak);
  }

  // ---- Jungle dome hills (1–2 squashed spheres) ----
  const hillCount = 1 + Math.floor(rng() * 2);
  for (let h = 0; h < hillCount; h++) {
    const hillRadius = (9 + rng() * 9) * s;
    const offX = (rng() - 0.5) * baseRadius * 0.8;
    const offZ = (rng() - 0.5) * baseRadius * 0.8;

    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(hillRadius, 8, 5),
      islandMat,
    );
    hill.scale.y = 0.5; // squash into a dome
    hill.position.set(offX, baseTopY + hillRadius * 0.28, offZ);
    hill.castShadow = true;
    hill.receiveShadow = true;
    hill.userData.farcrysisArt = true;
    group.add(hill);
  }

  scene.add(group);
}

function buildIslands(scene: THREE.Scene): void {
  // Single shared material — one draw call set for all island meshes.
  const islandMat = new THREE.MeshStandardMaterial({
    color: ISLAND_HAZE_COLOR,
    roughness: 0.95,
    metalness: 0,
    flatShading: true, // low-poly facets read as distant volcanic terrain
  });
  for (let i = 0; i < ISLAND_POSITIONS.length; i++) {
    buildIsland(scene, i, ISLAND_POSITIONS[i], islandMat);
  }
}

// ---------------------------------------------------------------------------
// Animated seabirds (single Points draw call)
// ---------------------------------------------------------------------------

function buildBirds(scene: THREE.Scene): void {
  const rng = mulberry32(0xb1d5);
  const count = BIRD_COUNT;

  const cx = new Float32Array(count);
  const cz = new Float32Array(count);
  const radius = new Float32Array(count);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  const yBase = new Float32Array(count);
  const yAmp = new Float32Array(count);
  const bobSpeed = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Orbit centres drift over the beach and near ocean (arena ±32, water beyond).
    cx[i] = (rng() - 0.5) * 90;
    cz[i] = (rng() - 0.5) * 90;
    radius[i] = 16 + rng() * 36; // 16–52 m orbit radius
    speed[i] = 0.08 + rng() * 0.14; // slow circle: 25–80 s per orbit
    phase[i] = rng() * Math.PI * 2;
    yBase[i] = 12 + rng() * 16; // 12–28 m altitude
    yAmp[i] = 1.5 + rng() * 2.5; // gentle vertical bob
    bobSpeed[i] = 0.4 + rng() * 0.5;

    // ~70% warm-white gulls, 30% dark terns.
    const birdColor = rng() < 0.7 ? BIRD_WHITE : BIRD_DARK;
    colors[i * 3 + 0] = ((birdColor >> 16) & 0xff) / 255;
    colors[i * 3 + 1] = ((birdColor >> 8) & 0xff) / 255;
    colors[i * 3 + 2] = (birdColor & 0xff) / 255;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.8,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'farcrysis-vista-birds';
  points.renderOrder = 3; // above the transparent lagoon water (renderOrder 1)
  points.userData.farcrysisArt = true;
  scene.add(points);

  birds = { points, count, cx, cz, radius, speed, phase, yBase, yAmp, bobSpeed, positions };

  // Bake a sensible t = 0 layout so the flock exists before the first animate
  // call (the orchestrator's per-frame driver calls animateVista anyway).
  updateBirdPositions(0);
}

function updateBirdPositions(t: number): void {
  const b = birds;
  if (!b) return;
  const { count, cx, cz, radius, speed, phase, yBase, yAmp, bobSpeed, positions } = b;
  for (let i = 0; i < count; i++) {
    const angle = t * speed[i] + phase[i];
    positions[i * 3 + 0] = cx[i] + Math.cos(angle) * radius[i];
    positions[i * 3 + 1] = yBase[i] + Math.sin(t * bobSpeed[i] + phase[i] * 2.1) * yAmp[i];
    positions[i * 3 + 2] = cz[i] + Math.sin(angle) * radius[i];
  }
  (b.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Add the ocean horizon plane, distant island silhouettes and seabirds. */
export function applyVista(scene: THREE.Scene): void {
  if (vistaApplied) return; // idempotent — one vista per scene
  vistaApplied = true;

  buildOcean(scene);
  buildIslands(scene);
  buildBirds(scene);
  buildSunsetHorizonGlow(scene);
  buildSunGlitterPath(scene);
}

/** Per-frame driver: orbit the seabirds. Safe no-op before applyVista. */
export function animateVista(timeSeconds: number): void {
  updateBirdPositions(timeSeconds);
  if (_glitterPath) {
    const mat = _glitterPath.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.42 + Math.sin(timeSeconds * 0.55) * 0.10;
  }
}
