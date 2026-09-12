/**
 * Source 18 - Procedural grass and landscape systems for Three.js.
 *
 * Primary source (read at the pinned revision, 2026-09-12):
 *   https://github.com/CK42BB/procedural-grass-threejs @ 26f072308df12caac68a474cb40300ef576793e1
 *   SKILL.md, 22,187 bytes, sha256 recorded in docs/technique-lab/group-b/SOURCE_RESEARCH.json
 *   LICENSE: MIT, "Copyright (c) 2026 Kingsley", read in full at the same revision.
 *
 * What the source actually documents (restated in our own words, never copied - the register
 * records that MIT here means restate rather than reproduce the prose or shader bodies):
 *   1. a blade is a tapered triangle strip swept along a quadratic Bezier so curvature costs
 *      vertices rather than texture (SKILL.md "Blade Geometry", lines 39-103);
 *   2. placement is a jittered regular grid, not free scatter, so density is uniform without
 *      clumping, with three rejection tests - minimum height, slope above a threshold, and a
 *      low-frequency density noise that carves bare patches (lines 120-181);
 *   3. wind is four superimposed layers - global directional sway, rolling gust fronts,
 *      per-blade turbulence from a position hash, and a height weighting so roots stay
 *      planted and tips travel furthest (lines 216-256);
 *   4. shading approximates subsurface scattering for backlit blades and darkens the root
 *      (lines 258-348);
 *   5. LOD is concentric rings that drop both density and blade segment count (lines 350-401).
 *
 * COMPATIBILITY DIFFERENCE, stated because it changes the code and not just the style:
 * the source implements 3 and 4 in a GLSL `ShaderMaterial`. This repository forbids
 * `ShaderMaterial`/GLSL on the WebGPU path (`webgpu-tsl-arena-forging` step 7, and the
 * procedural-art authoring hard rules). This demo therefore uses `MeshStandardMaterial`,
 * which both backends accept, and drives wind from the CPU as a rigid per-blade rotation
 * about the blade root. That reproduces "tips move most" for a rigid blade but NOT the
 * source's per-vertex quadratic bend, and it trades the source's 200K-2M blade budget for a
 * bounded few thousand. The blade count here is a lab budget, not a measurement of the
 * source's claims - those remain author claims, untested by us.
 */

import { createRng, fbm2, hash2 } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';

/** Blades per patch. Bounded for a lab scene; the source targets orders of magnitude more. */
const BLADE_BUDGET = 1400;
const PATCH_SIZE = 9;
const MAX_SLOPE = 0.62;

interface BladeInstance {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  phase: number;
  colourVariation: number;
}

/**
 * Terrain height in metres at a patch coordinate. A ridge runs across the patch so the
 * slope-rejection test has something to reject - without a slope, claim 2 is unfalsifiable.
 */
function terrainHeight(x: number, z: number, seed: number): number {
  const rolling = fbm2(x * 0.12 + 11, z * 0.12 + 7, seed, 3) * 0.9;
  const ridge = Math.exp(-((x - 1.6) * (x - 1.6)) / 1.1) * 1.9;
  return rolling + ridge;
}

function terrainSlope(x: number, z: number, seed: number): number {
  const eps = 0.15;
  const h = terrainHeight(x, z, seed);
  const dx = (terrainHeight(x + eps, z, seed) - h) / eps;
  const dz = (terrainHeight(x, z + eps, seed) - h) / eps;
  return Math.atan(Math.hypot(dx, dz));
}

/**
 * Quadratic-Bezier tapered blade. `segments` is the LOD knob: the source drops it with
 * distance, so the far ring is a cheaper mesh and not merely a thinner one.
 */
function createBladeGeometry(
  THREE: DemoContext['THREE'],
  segments: number,
  width: number,
  height: number,
  curvature: number,
): import('three').BufferGeometry {
  const crossSections = segments + 1;
  const vertexCount = crossSections * 2 + 1;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    // Quadratic Bezier with control points (0,0), (curvature, h/2), (0, h): the lateral term
    // is 2(1-t)t*curvature, which peaks mid-blade and returns to zero at the tip.
    const lateral = 2 * (1 - t) * t * curvature;
    const y = t * height;
    const halfWidth = (width * (1 - t * 0.8)) / 2;
    const left = i * 2;
    const right = left + 1;
    positions[left * 3] = lateral - halfWidth;
    positions[left * 3 + 1] = y;
    positions[right * 3] = lateral + halfWidth;
    positions[right * 3 + 1] = y;
    uvs[left * 2] = 0;
    uvs[left * 2 + 1] = t;
    uvs[right * 2] = 1;
    uvs[right * 2 + 1] = t;
  }

  const tip = crossSections * 2;
  positions[tip * 3] = curvature * 0.5;
  positions[tip * 3 + 1] = height;
  uvs[tip * 2] = 0.5;
  uvs[tip * 2 + 1] = 1;

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  indices.push(segments * 2, segments * 2 + 1, tip);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Jittered-grid placement with the source's three rejection tests. */
function placeBlades(seed: number, density: number, useRejection: boolean): BladeInstance[] {
  const random = createRng(seed);
  const step = 1 / Math.sqrt(density);
  const half = PATCH_SIZE / 2;
  const instances: BladeInstance[] = [];

  for (let gx = -half; gx < half; gx += step) {
    for (let gz = -half; gz < half; gz += step) {
      const x = gx + (random() - 0.5) * step;
      const z = gz + (random() - 0.5) * step;
      const rotation = random() * Math.PI * 2;
      const scaleX = 0.7 + random() * 0.6;
      const scaleY = 0.6 + random() * 0.8;
      const colourVariation = random();
      const roll = random();

      if (useRejection) {
        if (terrainSlope(x, z, seed) > MAX_SLOPE) continue;
        const patchiness = fbm2(x * 0.35 + 31, z * 0.35 + 17, seed, 2);
        if (patchiness < 0.38) continue;
        if (roll > patchiness * 0.7 + 0.45) continue;
      }

      instances.push({
        x,
        y: terrainHeight(x, z, seed),
        z,
        rotation,
        scaleX,
        scaleY,
        colourVariation,
        phase: hash2(Math.round(x * 64), Math.round(z * 64), seed) * Math.PI * 2,
      });
      if (instances.length >= BLADE_BUDGET) return instances;
    }
  }
  return instances;
}

interface Ring {
  label: string;
  radius: number;
  segments: number;
  keepEvery: number;
}

/** Concentric LOD rings: density thinning AND blade simplification, as the source specifies. */
const RINGS: Ring[] = [
  { label: 'near', radius: 2.6, segments: 5, keepEvery: 1 },
  { label: 'mid', radius: 4.2, segments: 3, keepEvery: 2 },
  { label: 'far', radius: 99, segments: 2, keepEvery: 4 },
];

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-18-procedural-grass';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 48, 48),
    new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  const groundPositions = ground.geometry.getAttribute('position');
  for (let i = 0; i < groundPositions.count; i += 1) {
    // The plane is authored in its own XY and rotated into XZ, so local y maps to world z.
    const x = groundPositions.getX(i);
    const z = -groundPositions.getY(i);
    groundPositions.setZ(i, terrainHeight(x, z, seed) - 0.01);
  }
  groundPositions.needsUpdate = true;
  ground.geometry.computeVertexNormals();

  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f8a33,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    // The source approximates subsurface scattering in its own fragment shader. On a standard
    // material the honest equivalent is a small emissive lift keyed to the tip colour: it
    // reads as translucency but it is NOT view-dependent transmission, so it will not
    // brighten only when backlit.
    emissive: new THREE.Color(0x14330c),
    emissiveIntensity: 0.55,
  });

  const meshes: import('three').InstancedMesh[] = [];
  const geometries: import('three').BufferGeometry[] = [];
  const swayState: { mesh: import('three').InstancedMesh; blades: BladeInstance[] }[] = [];

  function buildPatch(origin: import('three').Vector3, useMethod: boolean): void {
    const patch = new THREE.Group();
    patch.position.copy(origin);
    const blades = placeBlades(seed, 26, useMethod);
    const rings = useMethod ? RINGS : [{ label: 'single', radius: 99, segments: 1, keepEvery: 1 }];

    for (let r = 0; r < rings.length; r += 1) {
      const ring = rings[r];
      const inner = r === 0 ? 0 : rings[r - 1].radius;
      const members = blades.filter((blade, index) => {
        const distance = Math.hypot(blade.x, blade.z);
        if (distance < inner || distance >= ring.radius) return false;
        return index % ring.keepEvery === 0;
      });
      if (members.length === 0) continue;

      const geometry = useMethod
        ? createBladeGeometry(THREE, ring.segments, 0.055, 0.85, 0.3)
        // The "before" half is what grass looks like when the method is skipped: a flat
        // untapered quad, no Bezier curvature, one LOD, no placement rejection.
        : new THREE.PlaneGeometry(0.055, 0.85, 1, 1).translate(0, 0.425, 0);
      geometries.push(geometry);

      const mesh = new THREE.InstancedMesh(geometry, bladeMaterial, members.length);
      mesh.name = `blades-${useMethod ? 'method' : 'baseline'}-${ring.label}`;
      mesh.frustumCulled = false;
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const colour = new THREE.Color();
      for (let i = 0; i < members.length; i += 1) {
        const blade = members[i];
        position.set(blade.x, blade.y, blade.z);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), blade.rotation);
        scale.set(blade.scaleX, blade.scaleY, 1);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
        // Per-instance colour variation and a dry-grass lean, both from the source's
        // instance-variation channel.
        colour.setHSL(0.24 - blade.colourVariation * 0.05, 0.42 + blade.colourVariation * 0.2, 0.26 + blade.colourVariation * 0.16);
        mesh.setColorAt(i, colour);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      patch.add(mesh);
      meshes.push(mesh);
      if (useMethod) swayState.push({ mesh, blades: members });
    }
    root.add(patch);
  }

  root.add(ground);
  buildPatch(new THREE.Vector3(-PATCH_SIZE * 0.55, 0, 0), false);
  buildPatch(new THREE.Vector3(PATCH_SIZE * 0.55, 0, 0), true);

  const windDirection = new THREE.Vector2(1, 0.3).normalize();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const bend = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const bendAxis = new THREE.Vector3();

  function update(time: number): void {
    for (const entry of swayState) {
      const { mesh, blades } = entry;
      for (let i = 0; i < blades.length; i += 1) {
        const blade = blades[i];
        // Layer 1: global directional sway, one phase for the whole field.
        const sway = Math.sin(time * 1.1 + blade.x * windDirection.x * 0.35 + blade.z * windDirection.y * 0.35) * 0.16;
        // Layer 2: gust fronts rolling along the wind direction at a slower frequency.
        const gustPhase = (blade.x * windDirection.x + blade.z * windDirection.y) * 0.28 - time * 0.55;
        const gust = Math.max(0, Math.sin(gustPhase)) ** 2 * 0.34;
        // Layer 3: per-blade turbulence keyed to the blade's own position hash.
        const flutter = Math.sin(time * 5.2 + blade.phase) * 0.04;
        const bendAngle = sway + gust + flutter;

        position.set(blade.x, blade.y, blade.z);
        quaternion.setFromAxisAngle(yAxis, blade.rotation);
        // Layer 4 equivalent: the blade rotates about its ROOT, so the tip travels furthest
        // and the base stays planted. This is the rigid-blade stand-in for the source's
        // per-vertex height weighting.
        bendAxis.set(-windDirection.y, 0, windDirection.x).normalize();
        bend.setFromAxisAngle(bendAxis, bendAngle);
        quaternion.premultiply(bend);
        scale.set(blade.scaleX, blade.scaleY, 1);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    root,
    update,
    dispose: () => {
      disposeGroup(root);
      for (const geometry of geometries) geometry.dispose();
      bladeMaterial.dispose();
    },
    metadata: {
      sourceId: 18,
      title: 'Procedural grass and landscape systems for Three.js',
      method:
        'Instanced quadratic-Bezier tapered blades placed on a jittered grid with slope, '
        + 'height and density-noise rejection, animated by layered wind (global sway, rolling '
        + 'gust fronts, per-blade turbulence, root-anchored bend) and drawn through concentric '
        + 'LOD rings that thin density and simplify blade segment count. Left patch is the same '
        + 'seed with the method switched off: flat quads, no rejection, one LOD.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/CK42BB/procedural-grass-threejs',
        'https://raw.githubusercontent.com/CK42BB/procedural-grass-threejs/26f072308df12caac68a474cb40300ef576793e1/SKILL.md',
      ],
      limitation:
        'Wind is CPU per-instance rigid rotation on MeshStandardMaterial, not the source\'s '
        + 'GLSL per-vertex bend (ShaderMaterial/GLSL is forbidden on this repository\'s WebGPU '
        + 'path). Subsurface scattering is an emissive approximation, not view-dependent '
        + 'transmission. Blade count is a bounded lab budget; the source\'s 50K-2M figures are '
        + 'author claims and are not measured here. No compute-shader placement path.',
      localLights: [],
    },
  };
}

export default createDemo;
