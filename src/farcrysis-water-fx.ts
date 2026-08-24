/**
 * farcrysis-water-fx.ts — Enhanced water effects for Pass 69.
 *
 * Four additive visual layers (no colliders, no gameplay authority):
 *   1. Shoreline foam ring  — circular MeshBasicMaterial torus at ~20 m radius
 *   2. Animated wave surface — vertex-displaced water plane at y=-0.22
 *   3. Caustic light overlay — canvas-textured semi-transparent plane at y=-0.15
 *   4. Water edge ripples    — pulsing sprite points around the beach ring
 *
 * All original art — no Far Cry IP.
 */

import * as THREE from 'three';
import {
  farcrysisTerrainHeight as terrainHeight,
  FARCRYSIS_WATER_LEVEL,
} from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { animateWaterRippleTextures } from './farcrysis-water-ripples';

// ---------------------------------------------------------------------------
// Module-level animation state
// ---------------------------------------------------------------------------

let _foamRing: THREE.Mesh | null = null;
let _waveMesh: THREE.Mesh | null = null;
let _waveBasePositions: Float32Array | null = null;
let _waveGeom: THREE.PlaneGeometry | null = null;
let _causticPlane: THREE.Mesh | null = null;
let _rippleGroup: THREE.Group | null = null;
const _rippleMeshes: THREE.Mesh[] = [];
const _ripplePhases: number[] = [];
let _crestMesh: THREE.Mesh | null = null;
/** Foam rings animated with a travelling wash (HF-394), with per-ring params. */
type FoamWashRing = Readonly<{
  mesh: THREE.Mesh;
  /** Wash lobes around the ring circumference. */
  lobes: number;
  /** Radians per second the wash travels shoreward-around. */
  washSpeed: number;
  /** Per-ring phase so the three rings do not pulse in lockstep. */
  washOffset: number;
}>;
const _foamWashRings: FoamWashRing[] = [];
let _crestBasePositions: Float32Array | null = null;
let _crestGeom: THREE.PlaneGeometry | null = null;
let _sandGradient: THREE.Mesh | null = null;

// ---------------------------------------------------------------------------
// 5. Wave crest highlights — additive brightness riding the wave peaks
// ---------------------------------------------------------------------------

/**
 * A second 76×76 plane matching the wave surface geometry exactly, but driven
 * as a brightness field instead of a colour wash: crests glow warm-white
 * (additive), troughs contribute nothing. Vertex-coloured MeshBasicMaterial —
 * no ShaderMaterial.
 */

// ---------------------------------------------------------------------------
// 6. Underwater sand depth gradient — golden shallows → deep teal lagoon floor
// ---------------------------------------------------------------------------

function createSandGradientCanvas(): HTMLCanvasElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Vertical gradient; ring UV v=0 (inner edge, near shore) maps to the
    // bottom of the canvas. Canvas bottom = golden shallow sand.
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, '#143c50'); // outer edge → deep lagoon floor
    grad.addColorStop(0.4, '#4a8a92'); // mid depth
    grad.addColorStop(0.7, '#9fb89a'); // sandy shallows
    grad.addColorStop(1.0, '#d8bf8c'); // inner edge → sunlit shallow sand
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Sand speckle so the floor reads as sand, not a flat colour wash
    for (let i = 0; i < 1500; i++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      ctx.fillStyle = `rgba(232, 216, 178, ${0.03 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + Math.random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Annulus under the water surface covering the visible water ring around
 * the beach shelf. Golden near the shore fading to deep teal offshore —
 * the shallow→deep sand depth gradient seen through the translucent water.
 * HF-396: the band tracks the doubled island (edge to ~2x edge).
 */
function buildSandDepthGradient(scene: THREE.Scene): void {
  const canvas = createSandGradientCanvas();
  if (!canvas) return;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  const geom = new THREE.RingGeometry(FARCRYSIS_BOUNDS.maxX - 0.5, FARCRYSIS_BOUNDS.maxX * 2 - 3, 96);
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'farcrysis-water-fx-sand-depth-gradient';
  mesh.position.y = -0.26;
  mesh.renderOrder = 2;
  mesh.userData.farcrysisArt = true;
  scene.add(mesh);

  _sandGradient = mesh;
}

// ---------------------------------------------------------------------------
// 1. Shoreline foam ring
// ---------------------------------------------------------------------------

function buildShorelineFoamRing(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = 'farcrysis-water-fx-foam-ring';
  group.userData.farcrysisArt = true;

  // HF-394: the rings used to sit at a FIXED y (-0.14..-0.16) on a fixed
  // radius, so wherever the sculpted beach terrain crossed that radius above
  // the waterline the foam vanished inside the sand, and where the shelf
  // dipped it floated in mid-air over the water. Every vertex now samples the
  // single terrain authority and rides max(shoreline, water level), exactly
  // like the wet-sand band in farcrysis-art buildInlineWater already does.
  const conformToShoreline = (geom: THREE.BufferGeometry, waterLift: number, landLift: number): void => {
    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const shoreY = Math.max(
        FARCRYSIS_WATER_LEVEL + waterLift,
        terrainHeight(x, z) + landLift,
      );
      posAttr.setY(i, shoreY);
    }
    posAttr.needsUpdate = true;
  };

  // HF-394 travelling wash: each ring carries a per-vertex brightness field
  // (vertex colours on an additive material scale its contribution) so the
  // foam pulses in lobes that travel around the shore like arriving wave
  // energy, instead of the whole ring fading in and out uniformly.
  const attachFoamWash = (mesh: THREE.Mesh, lobes: number, washSpeed: number, washOffset: number): void => {
    const geom = mesh.geometry as THREE.BufferGeometry;
    const count = (geom.attributes.position as THREE.BufferAttribute).count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    (mesh.material as THREE.MeshBasicMaterial).vertexColors = true;
    _foamWashRings.push(Object.freeze({ mesh, lobes, washSpeed, washOffset }));
  };

  // Main foam torus: circular ring at the inner beach boundary. HF-396: the
  // ring tracks the doubled island (edgeDist ~12 m, where the shelf meets
  // the shore descent), not the old 20 m radius.
  const majorR = FARCRYSIS_BOUNDS.maxX - 12;
  const minorR = 0.38;
  const torusGeom = new THREE.TorusGeometry(majorR, minorR, 16, 128);
  torusGeom.rotateX(-Math.PI / 2); // lay flat in XZ plane
  conformToShoreline(torusGeom, 0.1, 0.05);

  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xf8f8ff,
    transparent: true,
    opacity: 0.50,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const foamRing = new THREE.Mesh(torusGeom, foamMat);
  foamRing.name = 'farcrysis-water-fx-foam-ring-main';
  foamRing.position.y = 0; // absolute shoreline heights are baked per-vertex
  foamRing.renderOrder = 5;
  foamRing.userData.farcrysisArt = true;
  attachFoamWash(foamRing, 9, 1.15, 0);
  group.add(foamRing);

  // Secondary thinner ring (slightly larger, adds depth to the foam band)
  const torusGeom2 = new THREE.TorusGeometry(majorR + 0.55, minorR * 0.6, 12, 96);
  torusGeom2.rotateX(-Math.PI / 2);
  conformToShoreline(torusGeom2, 0.09, 0.06);
  const foamMat2 = new THREE.MeshBasicMaterial({
    color: 0xe0f4ff,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const foamRing2 = new THREE.Mesh(torusGeom2, foamMat2);
  foamRing2.name = 'farcrysis-water-fx-foam-ring-outer';
  foamRing2.position.y = 0;
  foamRing2.renderOrder = 5;
  foamRing2.userData.farcrysisArt = true;
  attachFoamWash(foamRing2, 11, 0.95, 2.1);
  group.add(foamRing2);

  // Tertiary thin ring inside (lighter, inner foam edge)
  const torusGeom3 = new THREE.TorusGeometry(majorR - 0.45, minorR * 0.4, 10, 80);
  torusGeom3.rotateX(-Math.PI / 2);
  conformToShoreline(torusGeom3, 0.11, 0.04);
  const foamMat3 = new THREE.MeshBasicMaterial({
    color: 0xf0faff,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const foamRing3 = new THREE.Mesh(torusGeom3, foamMat3);
  foamRing3.name = 'farcrysis-water-fx-foam-ring-inner';
  foamRing3.position.y = 0;
  foamRing3.renderOrder = 5;
  foamRing3.userData.farcrysisArt = true;
  attachFoamWash(foamRing3, 7, 1.35, 4.4);
  group.add(foamRing3);

  scene.add(group);
  _foamRing = foamRing; // outer reference for opacity animation
}

// ---------------------------------------------------------------------------
// 2. Animated wave surface
// ---------------------------------------------------------------------------

function buildWaveSurface(scene: THREE.Scene): void {
  // HF-396: 140 m clears the doubled 128 m island with the same margin the
  // old 76 m plane kept around the 64 m one.
  const size = 140;
  // HF-374. Was 72, i.e. 10,368 triangles of full-screen additive fill per
  // plane, twice over, with depthWrite disabled and no depth rejection. During
  // arena admission the coverage draw disables frustum culling for the whole
  // scene, so both planes are drawn in full regardless of where the camera
  // looks - and farcrysis wedged at 'verifying-first-presentation' with the
  // submission queue frozen. A 76 m plane vertex-animated for swell reads
  // identically at 24 segments; the wavelength is metres, not centimetres.
  const segments = 24;

  const geom = new THREE.PlaneGeometry(size, size, segments, segments);
  geom.rotateX(-Math.PI / 2);

  // Snapshot base XZ positions (Y is always 0 before animation)
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const base = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    base[i * 3 + 0] = posAttr.getX(i);
    base[i * 3 + 1] = posAttr.getY(i); // always 0
    base[i * 3 + 2] = posAttr.getZ(i);
  }

  // HF-394: vertex colours carry swellDepthFactor per vertex, so this
  // additive layer fades to nothing over the shallows instead of chopping
  // uniformly right up to the sand (shore blend, row-25 comparator).
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0x3da0b8,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3));

  const mesh = new THREE.Mesh(geom, waveMat);
  mesh.name = 'farcrysis-water-fx-wave-surface';
  mesh.position.y = -0.22;
  mesh.renderOrder = 3;
  mesh.userData.farcrysisArt = true;

  scene.add(mesh);

  _waveMesh = mesh;
  _waveBasePositions = base;
  _waveGeom = geom;
}
// ---------------------------------------------------------------------------
// 2b. Directional swell field (HF-394)
// ---------------------------------------------------------------------------

type SwellBand = Readonly<{ dx: number; dz: number; k: number; w: number; amp: number }>;

/**
 * Three crossing travel directions — a real sea reads as waves arriving from
 * one weather system, not rings radiating from the map centre (the old
 * `sin(dist - t)` field, which visibly pulsed outward from spawn). Pure and
 * clock-free so tests can pin determinism; amplitude stays under +/-0.10 m
 * so this chop layer never detaches from the flat lagoon surface it shades.
 */
const SWELL_BANDS: readonly SwellBand[] = Object.freeze([
  Object.freeze({ dx: 0.83, dz: 0.55, k: 0.42, w: 0.9, amp: 0.045 }),
  Object.freeze({ dx: -0.28, dz: 0.96, k: 0.71, w: 1.3, amp: 0.032 }),
  Object.freeze({ dx: 0.95, dz: -0.31, k: 1.13, w: 1.7, amp: 0.02 }),
]);

/** Total vertical extent bound of waveSurfaceDisplacement — pinned by test. */
export const SWELL_MAX_AMPLITUDE = SWELL_BANDS.reduce((sum, band) => sum + band.amp, 0);

// ---------------------------------------------------------------------------
// 2c. Depth response — wave energy builds offshore and calms ashore (HF-394)
// ---------------------------------------------------------------------------

/**
 * Water column depths (metres) between which swell energy eases from calm
 * to fully developed. A real shore breaks its waves where the seabed rises
 * into the wave base, so the additive chop must NOT run at full amplitude
 * over ankle-deep sand — there it dies to zero, which both looks right and
 * blends the open-water surface into the shoreline instead of stopping at a
 * hard edge (technique-register row 25 comparator).
 */
const SWELL_DEPTH_CALM_M = 0.05;
const SWELL_DEPTH_FULL_M = 2.6;

function swellSmoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 0..1 multiplier on swell energy at world (x, z): exactly 0 wherever the
 * ground stands at or above the waterline, saturating at 1 once the water
 * column reaches SWELL_DEPTH_FULL_M. Pure and clock-free like the bands.
 */
export function swellDepthFactor(x: number, z: number): number {
  const column = FARCRYSIS_WATER_LEVEL - terrainHeight(x, z);
  return swellSmoothstep((column - SWELL_DEPTH_CALM_M) / (SWELL_DEPTH_FULL_M - SWELL_DEPTH_CALM_M));
}

/** Presentation swell height (metres) at world (x, z) and time t seconds. */
export function waveSurfaceDisplacement(x: number, z: number, tSeconds: number): number {
  const depth = swellDepthFactor(x, z);
  if (depth === 0) return 0; // exact zero ashore — no sign-carrying -0
  let y = 0;
  for (const band of SWELL_BANDS) {
    y += band.amp * Math.sin((x * band.dx + z * band.dz) * band.k - tSeconds * band.w);
  }
  return depth * y;
}

// ---------------------------------------------------------------------------
// 3. Caustic light overlay (canvas-textured plane)
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// 4. Water edge ripples — pulsing sprite points at shoreline
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildWaterFX(scene: THREE.Scene): void {
  // HF-374. SIX stacked full-screen additive transparent layers here, on top of
  // the inline water's own deep plane and shallow lens and the sparkle points,
  // pushed farcrysis past the first-presentation fence on the WebGPU route:
  // the arena wedged at 'verifying-first-presentation' with the submission
  // queue frozen and never reached an active match. A bisect showed no single
  // guilty layer - skipping ANY ONE of sparkle, inline water or these effects
  // let it through - so the cost is cumulative and the fix has to be a real
  // reduction, not a reshuffle.
  //
  // Kept: the three layers that carry the shoreline read - foam where water
  // meets sand, the animated swell, and the depth gradient that makes shallow
  // water look shallow.
  buildShorelineFoamRing(scene);
  buildWaveSurface(scene);
  buildSandDepthGradient(scene);

  // Retired: caustics, edge ripples and crest highlights. All three are
  // additive detail that reads at a few metres and is invisible at play
  // distance under a bright tropical sky, while each one costs another
  // full-screen transparent pass with depth writes disabled. Their animation
  // hooks below no-op safely when the meshes are absent.
}

export function animateWaterFX(time: number): void {
  // --- 0. HF-394: scroll every registered water ripple normal map (lagoon,
  // deep, shallow lens, vista ocean) along its own drift direction ---
  animateWaterRippleTextures(time);

  // --- 1. Shoreline foam ring opacity oscillation (period ~4 s) ---
  if (_foamRing) {
    const foamMat = _foamRing.material as THREE.MeshBasicMaterial;
    foamMat.opacity = 0.30 + Math.sin(time * 1.57) * 0.18;

    // Also pulse the outer rings via the parent group
    const parent = _foamRing.parent;
    if (parent instanceof THREE.Group && parent.name === 'farcrysis-water-fx-foam-ring') {
      for (const child of parent.children) {
        if (child instanceof THREE.Mesh && child !== _foamRing) {
          const cmat = child.material as THREE.MeshBasicMaterial;
          if (child.name.includes('outer')) {
            cmat.opacity = 0.18 + Math.sin(time * 1.57 + 1.0) * 0.12;
          } else if (child.name.includes('inner')) {
            cmat.opacity = 0.14 + Math.sin(time * 1.57 + 2.2) * 0.10;
          }
        }
      }
    }
  }

  // --- 1b. HF-394 travelling foam wash — brightness lobes circle each ring ---
  for (const ring of _foamWashRings) {
    const posAttr = ring.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = ring.mesh.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const angle = Math.atan2(posAttr.getZ(i), posAttr.getX(i));
      const wash = 0.72 + 0.28 * Math.sin(ring.lobes * angle - time * ring.washSpeed + ring.washOffset);
      colAttr.setXYZ(i, wash, wash, wash);
    }
    colAttr.needsUpdate = true;
  }

  // --- 2. Animated wave surface — directional multi-band swell (HF-394) ---
  if (_waveMesh && _waveBasePositions && _waveGeom) {
    const posAttr = _waveGeom.attributes.position as THREE.BufferAttribute;
    const colAttr = _waveGeom.attributes.color as THREE.BufferAttribute;
    const base = _waveBasePositions;

    for (let i = 0; i < posAttr.count; i++) {
      const bx = base[i * 3 + 0];
      const bz = base[i * 3 + 2];
      posAttr.setY(i, waveSurfaceDisplacement(bx, bz, time));
      // Same depth factor drives the additive brightness, so the chop layer
      // visually dissolves into the calm shoreline water (HF-394 blend).
      const energy = swellDepthFactor(bx, bz);
      colAttr.setXYZ(i, energy, energy, energy);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // No computeVertexNormals: MeshBasicMaterial is unlit, so the old
    // per-frame normal recompute was ~600 wasted vertex normals per frame.
  }

  // --- 3. Caustic overlay — scroll the canvas texture ---
  if (_causticPlane) {
    const cmat = _causticPlane.material as THREE.MeshBasicMaterial;
    // Animate opacity for gentle pulsing
    if (cmat.map) {
      cmat.map.offset.x = Math.sin(time * 0.15) * 0.05;
      cmat.map.offset.y = Math.cos(time * 0.18) * 0.05;
    }
    cmat.opacity = 0.16 + Math.sin(time * 0.7) * 0.05;
  }

  // --- 4. Water edge ripples — gentle pulsing at shoreline ---
  if (_rippleGroup) {
    for (let i = 0; i < _rippleMeshes.length; i++) {
      const ripple = _rippleMeshes[i];
      const phase = _ripplePhases[i];
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.8 + phase);

      const rmat = ripple.material as THREE.MeshBasicMaterial;
      rmat.opacity = 0.15 + pulse * 0.35;

      // Subtle scale pulse
      const s = 0.7 + pulse * 0.45;
      ripple.scale.setScalar(s);
    }
  }

  // --- 5. Wave crest highlights — brightness rides the animated wave peaks ---
  if (_crestMesh && _crestBasePositions && _crestGeom) {
    const posAttr = _crestGeom.attributes.position as THREE.BufferAttribute;
    const colAttr = _crestGeom.attributes.color as THREE.BufferAttribute;
    const base = _crestBasePositions;

    for (let i = 0; i < posAttr.count; i++) {
      const bx = base[i * 3 + 0];
      const bz = base[i * 3 + 2];
      const dist = Math.sqrt(bx * bx + bz * bz);

      // Mirror the wave-surface displacement so highlights ride the crests
      const wave1 = Math.sin(dist * 0.55 - time * 1.4) * 0.08;
      const wave2 = Math.cos(dist * 0.75 + time * 1.1) * 0.05;
      const wave3 = Math.sin(dist * 1.05 - time * 1.8) * 0.04;
      const ripple = Math.sin(dist * 0.40 - time * 2.0) * 0.06;
      const y = wave1 + wave2 + wave3 + ripple + 0.02;

      posAttr.setY(i, y + 0.015); // just above the wave surface — no z-fight

      // Bright on crests, plus travelling sparkle bands
      const crest = Math.max(0, Math.min(1, (y - 0.06) / 0.12));
      const sparkle = Math.pow(Math.max(0, Math.sin(dist * 1.6 - time * 2.4)), 10.0);
      const bright = Math.min(1, crest * 0.9 + sparkle * 0.55);
      colAttr.setXYZ(i, bright, bright * 0.96, bright * 0.86);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    const crestMat = _crestMesh.material as THREE.MeshBasicMaterial;
    crestMat.opacity = 0.42 + Math.sin(time * 0.9) * 0.12;
  }

  // --- 6. Sand depth gradient — gentle opacity breathing ---
  if (_sandGradient) {
    const sandMat = _sandGradient.material as THREE.MeshBasicMaterial;
    sandMat.opacity = 0.46 + Math.sin(time * 0.4) * 0.06;
  }
}