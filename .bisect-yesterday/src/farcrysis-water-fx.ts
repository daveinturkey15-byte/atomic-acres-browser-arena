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
 * Annulus under the water surface (r 31.5–61) covering the visible water ring
 * around the beach shelf. Golden near the shore fading to deep teal offshore —
 * the shallow→deep sand depth gradient seen through the translucent water.
 */
function buildSandDepthGradient(scene: THREE.Scene): void {
  const canvas = createSandGradientCanvas();
  if (!canvas) return;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  const geom = new THREE.RingGeometry(31.5, 61, 96);
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

  // Main foam torus: circular ring at ~20 m radius (inner beach boundary)
  const majorR = 20;
  const minorR = 0.38;
  const torusGeom = new THREE.TorusGeometry(majorR, minorR, 16, 128);
  torusGeom.rotateX(-Math.PI / 2); // lay flat in XZ plane

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
  foamRing.position.y = -0.15;
  foamRing.renderOrder = 5;
  foamRing.userData.farcrysisArt = true;
  group.add(foamRing);

  // Secondary thinner ring (slightly larger, adds depth to the foam band)
  const torusGeom2 = new THREE.TorusGeometry(majorR + 0.55, minorR * 0.6, 12, 96);
  torusGeom2.rotateX(-Math.PI / 2);
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
  foamRing2.position.y = -0.16;
  foamRing2.renderOrder = 5;
  foamRing2.userData.farcrysisArt = true;
  group.add(foamRing2);

  // Tertiary thin ring inside (lighter, inner foam edge)
  const torusGeom3 = new THREE.TorusGeometry(majorR - 0.45, minorR * 0.4, 10, 80);
  torusGeom3.rotateX(-Math.PI / 2);
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
  foamRing3.position.y = -0.14;
  foamRing3.renderOrder = 5;
  foamRing3.userData.farcrysisArt = true;
  group.add(foamRing3);

  scene.add(group);
  _foamRing = foamRing; // outer reference for opacity animation
}

// ---------------------------------------------------------------------------
// 2. Animated wave surface
// ---------------------------------------------------------------------------

function buildWaveSurface(scene: THREE.Scene): void {
  const size = 76;
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

  const waveMat = new THREE.MeshBasicMaterial({
    color: 0x3da0b8,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

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

  // --- 2. Animated wave surface — vertex displacement from center ---
  if (_waveMesh && _waveBasePositions && _waveGeom) {
    const posAttr = _waveGeom.attributes.position as THREE.BufferAttribute;
    const base = _waveBasePositions;

    for (let i = 0; i < posAttr.count; i++) {
      const bx = base[i * 3 + 0];
      const bz = base[i * 3 + 2];
      const dist = Math.sqrt(bx * bx + bz * bz);

      // Circular ripples emanating from center
      const wave1 = Math.sin(dist * 0.55 - time * 1.4) * 0.08;
      const wave2 = Math.cos(dist * 0.75 + time * 1.1) * 0.05;
      const wave3 = Math.sin(dist * 1.05 - time * 1.8) * 0.04;
      const ripple = Math.sin(dist * 0.40 - time * 2.0) * 0.06;

      const y = wave1 + wave2 + wave3 + ripple + 0.02; // slight base lift

      posAttr.setY(i, y);
    }

    posAttr.needsUpdate = true;
    _waveGeom.computeVertexNormals();
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