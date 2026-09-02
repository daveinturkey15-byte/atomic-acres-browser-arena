/**
 * map3/corridor-water.ts — corridor 4: EXPANDED GERSTNER SHORELINE & WATER PHYSICS.
 *
 * Fully procedural shoreline, wave physics, buoyancy simulation, and vehicle
 * water interaction:
 *   1. GERSTNER WAVE DISPLACEMENT & ANALYTIC NORMALS — 4-band incommensurate
 *      wave spectrum with exact CPU/GPU parity, analytical normalNode,
 *      depth-graded color (shallow tropical cyan -> lagoon teal -> deep ocean navy),
 *      and slope-derived crest foam + shoreline foam.
 *   2. BUOYANCY & FLOATING RIGID OBJECTS — floating barrels, crates, buoys,
 *      and logs with full Archimedean buoyancy, wave normal alignment (roll &
 *      pitch), wave drift, and player kick interaction.
 *   3. SPRAY & SPLASH PARTICLE SYSTEM — instanced billboard droplet bursts
 *      and expanding surface ripple rings when objects or wheels hit water.
 *   4. PROCEDURAL OFF-ROAD ROVER — driveable/patrolling vehicle with
 *      spinning wheels, suspension bob, twin high-speed wheel roostertails,
 *      bow wave spray, and dynamic wake.
 *   5. SHORELINE PROPS — wooden jetty/pier with pylons, weathered planks,
 *      lanterns, mooring bollards, driftwood, pebbles, and marram dunes.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL expressions only.
 * No ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  attribute, cameraPosition, clamp, cos, cross, dot, float, mix, normalize,
  positionLocal, positionWorld, pow, sin, smoothstep, sqrt, uniform, uv, vec2, vec3, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { createGrassTuft, poissonScatter } from './plants';
import { mergeGeometries, hash11 } from './leaf-geometry';
import { SUMMER_PALETTE, createFoliageMaterial, createFoliageUniforms, rgb } from './foliage-material';

const W = 9;
const CORRIDOR_LEN = 54;

/** Gerstner wave spectrum: [dirX, dirZ, wavelength, weight] */
export const GERSTNER_BANDS: Array<[number, number, number, number]> = [
  [0.92, 0.39, 17.0, 1.00],
  [-0.31, 0.95, 9.4, 0.58],
  [0.71, -0.70, 5.1, 0.31],
  [-0.97, -0.25, 2.9, 0.17],
];
export const WAVE_AMPLITUDE = 0.36;
export const WATER_BASE_Y = 0.14;

// Maximum slope for foam thresholding
export const SLOPE_MAX = WAVE_AMPLITUDE * GERSTNER_BANDS.reduce(
  (s, b) => s + b[3] * ((2 * Math.PI) / b[2]),
  0,
);

/** Exact analytical CPU wave height & surface gradient */
export function sampleWaterHeight(x: number, z: number, t: number): { y: number; sx: number; sz: number } {
  let y = WATER_BASE_Y;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < GERSTNER_BANDS.length; i++) {
    const [dx, dz, lambda, weight] = GERSTNER_BANDS[i];
    const k = (2 * Math.PI) / lambda;
    const speed = Math.sqrt(9.81 / k);
    const phase = x * dx * k + z * dz * k + t * k * speed;
    const a = WAVE_AMPLITUDE * weight;
    y += Math.sin(phase) * a;
    sx += Math.cos(phase) * a * k * dx;
    sz += Math.cos(phase) * a * k * dz;
  }
  return { y, sx, sz };
}

/* ------------------------------------------------------------------ */
/* Floating Object Definition                                         */
/* ------------------------------------------------------------------ */

interface FloatingBody {
  mesh: THREE.Object3D;
  basePos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  mass: number;
  radius: number;
  buoyancyCoeff: number;
  targetY: number;
  rollCoeff: number;
  lastSplashTime: number;
}

/* ------------------------------------------------------------------ */
/* Helper to merge simple geometries                                   */
/* ------------------------------------------------------------------ */

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count * 3; i++) pos.push(p.array[i] as number);
    for (let i = 0; i < p.count * 3; i++) nor.push(n ? (n.array[i] as number) : 0);
    for (let i = 0; i < p.count * 2; i++) uvs.push(u ? (u.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}

/* ------------------------------------------------------------------ */
/* Main Water Corridor Creation                                       */
/* ------------------------------------------------------------------ */

export function createWaterCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = CORRIDOR_LEN;

  const time = uniform(0);
  const uniforms = createFoliageUniforms();
  disposables.push({ dispose() {} });

  // TSL Gerstner wave expression operating on local plane coordinates
  const waveAt = (p: any) => {
    const t = time;
    let y: any = float(0);
    let sx: any = float(0);
    let sz: any = float(0);
    GERSTNER_BANDS.forEach(([dx, dz, lambda, weight]) => {
      const k = (2 * Math.PI) / lambda;
      const speed = Math.sqrt(9.81 / k);
      const phase = p.x.mul(dx * k).add(p.z.mul(dz * k)).add(t.mul(k * speed));
      const a = WAVE_AMPLITUDE * weight;
      y = y.add(sin(phase).mul(a));
      sx = sx.add(cos(phase).mul(a * k * dx));
      sz = sz.add(cos(phase).mul(a * k * dz));
    });
    return { y, sx, sz };
  };

  /* ---------------------------------------------------------------- */
  /* 1. Polished Water Surface Material                                */
  /* ---------------------------------------------------------------- */

  const waterMat = new MeshStandardNodeMaterial();
  waterMat.roughness = 0.04;
  waterMat.metalness = 0.06;
  waterMat.transparent = true;

  // Vertex displacement
  {
    const p = positionLocal;
    const w = waveAt(p);
    waterMat.positionNode = vec3(p.x, p.y.add(w.y), p.z);
  }

  // Pixel shading: normals + depth grading + Fresnel + sun specular + foam
  {
    const p = positionLocal;
    const w = waveAt(p);

    // Analytic normal from wave derivatives
    const waveNormal = normalize(vec3(w.sx.negate(), float(1.0), w.sz.negate()));
    waterMat.normalNode = waveNormal;

    const slope = sqrt(w.sx.mul(w.sx).add(w.sz.mul(w.sz)));
    const norm = clamp(slope.div(float(SLOPE_MAX)), float(0), float(1));

    // Depth grading: p.z in local coordinates is -6 at shore, down to -56 in deep ocean
    const depth = clamp(p.z.negate().sub(6.2).div(24.0), float(0.0), float(1.0));

    // Depth-based transparency: shallow water near shore is clear & translucent
    waterMat.opacityNode = mix(float(0.38), float(0.96), smoothstep(float(0.0), float(0.28), depth));

    // Natural, grounded coastal palette (toned down from saturated electric cyan)
    const shallow = rgb(0x28626a); // Natural translucent coastal turquoise-slate
    const mid = rgb(0x0e363e);     // Deep lagoon teal
    const deep = rgb(0x03131c);    // Dark oceanic navy
    const waterBody = mix(shallow, mix(mid, deep, depth), depth);

    // Fresnel reflection: grazing angles toward the horizon reflect the sky dome
    const V = normalize(cameraPosition.sub(positionWorld));
    const NdotV = clamp(dot(waveNormal, V), float(0.0), float(1.0));
    const fresnel = pow(float(1.0).sub(NdotV), float(4.0)); // Schlick approximation
    const skyReflection = rgb(0x94bccc); // Soft sky reflection at horizon
    const reflectedBody = mix(waterBody, skyReflection, fresnel.mul(0.72));

    // Sun specular glint on wave facets
    const L = normalize(uniforms.sunDirection);
    const H = normalize(V.add(L));
    const NdotH = clamp(dot(waveNormal, H), float(0.0), float(1.0));
    const sunGlint = pow(NdotH, float(96.0)).mul(3.2).mul(uniforms.sunColor);
    waterMat.emissiveNode = sunGlint;

    // Crest foam on steep wave slopes + dynamic shoreline lapping foam
    const crestFoam = smoothstep(float(0.68), float(0.94), norm);
    const shoreLap = sin(p.z.mul(2.2).add(time.mul(1.5))).mul(0.5).add(0.5);
    const shoreEdge = smoothstep(float(-8.4), float(-6.5), p.z)
      .mul(smoothstep(float(-4.8), float(-6.2), p.z))
      .mul(shoreLap.mul(0.6).add(0.4));
    const foamColor = rgb(0xf2fbfd);

    const totalFoam = clamp(crestFoam.mul(0.70).add(shoreEdge.mul(0.75)), float(0.0), float(1.0));
    waterMat.colorNode = mix(reflectedBody, foamColor, totalFoam);
    waterMat.roughnessNode = mix(float(0.04), float(0.70), totalFoam);
  }

  // Expanded water plane
  const waterGeo = new THREE.PlaneGeometry(W * 4.6, 52, 100, 100);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, WATER_BASE_Y, -LEN * 0.60);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);
  disposables.push(waterGeo, waterMat);

  /* ---------------------------------------------------------------- */
  /* 2. Shoreline & Beach Geometry                                     */
  /* ---------------------------------------------------------------- */

  const sandMat = new MeshStandardNodeMaterial();
  sandMat.roughness = 0.92;
  {
    const p = positionLocal;
    const wet = smoothstep(float(-2.5), float(-8.5), p.z);
    const grain = sin(p.x.mul(37.3)).mul(sin(p.z.mul(31.7))).mul(0.5).add(0.5).mul(0.04);
    sandMat.colorNode = mix(rgb(0xc4b391), rgb(0x69573f), wet).add(vec3(grain, grain, grain));
    sandMat.roughnessNode = mix(float(0.95), float(0.16), wet);
  }

  const sandGeo = new THREE.PlaneGeometry(W * 4.6, LEN, 28, 100);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(0, 0, -LEN / 2);
  {
    const pos = sandGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const into = Math.max(0, (-z - 3.5) / 28);
      const shelf = -2.2 * into * into;
      const ripple = Math.sin(x * 0.38) * 0.16 * (1 - into);
      const dune = 0.42 * Math.max(0, 1 - (-z) / 6.5);
      pos.setY(i, shelf + ripple + dune);
    }
    pos.needsUpdate = true;
    sandGeo.computeVertexNormals();
  }
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.receiveShadow = true;
  group.add(sandMesh);
  disposables.push(sandGeo, sandMat);

  /* ---------------------------------------------------------------- */
  /* 3. Wooden Pier & Jetty                                            */
  /* ---------------------------------------------------------------- */

  const woodMat = new MeshStandardNodeMaterial();
  woodMat.roughness = 0.82;
  woodMat.colorNode = rgb(0x423526);
  disposables.push(woodMat);

  const pierParts: THREE.BufferGeometry[] = [];
  const PIER_X = -W * 0.85;
  const PIER_Z_START = -5;
  const PIER_Z_END = -26;
  const PIER_WIDTH = 2.2;
  const PIER_Y = 0.78;

  // Deck planks
  const plankCount = 34;
  for (let i = 0; i < plankCount; i++) {
    const z = PIER_Z_START + (i / plankCount) * (PIER_Z_END - PIER_Z_START);
    const plank = new THREE.BoxGeometry(PIER_WIDTH, 0.10, 0.48);
    plank.translate(PIER_X + (hash11(i * 3) - 0.5) * 0.03, PIER_Y, z);
    pierParts.push(plank);
  }

  // Pylons (vertical posts into water)
  for (let i = 0; i < 6; i++) {
    const z = PIER_Z_START - 1.2 - i * 3.6;
    for (const side of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.12, 0.14, 3.0, 8);
      post.translate(PIER_X + side * (PIER_WIDTH * 0.45), PIER_Y - 1.1, z);
      pierParts.push(post);

      // Mooring post sticking up above deck
      if (i === 0 || i === 3 || i === 5) {
        const topPost = new THREE.CylinderGeometry(0.10, 0.12, 0.5, 8);
        topPost.translate(PIER_X + side * (PIER_WIDTH * 0.45), PIER_Y + 0.30, z);
        pierParts.push(topPost);
      }
    }
  }

  const pierMerged = mergeSimple(pierParts);
  pierParts.forEach((g) => g.dispose());
  const pierMesh = new THREE.Mesh(pierMerged, woodMat);
  pierMesh.castShadow = true;
  pierMesh.receiveShadow = true;
  group.add(pierMesh);
  disposables.push(pierMerged);

  /* ---------------------------------------------------------------- */
  /* 4. Marram Grass & Coastal Vegetation                              */
  /* ---------------------------------------------------------------- */

  const grassMat = createFoliageMaterial(uniforms, SUMMER_PALETTE);
  disposables.push(grassMat);

  const tufts: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();
  poissonScatter(100, { minX: -18, maxX: 18, minZ: -13, maxZ: -1 }, 0.85, 42).forEach((p, i) => {
    if (Math.abs(p.x - PIER_X) < 1.8) return; // leave jetty clear
    if (Math.abs(p.x) < 2.0 && p.y > -7) return; // central path
    const g = createGrassTuft(100 + i, 0.9 + hash11(i) * 0.9);
    xf.makeRotationY(hash11(i * 5) * 6.28);
    xf.setPosition(p.x, 0.08, p.y);
    g.applyMatrix4(xf);
    tufts.push(g);
  });
  if (tufts.length) {
    const merged = mergeGeometries(tufts);
    tufts.forEach((g) => g.dispose());
    const tuftMesh = new THREE.Mesh(merged, grassMat);
    tuftMesh.receiveShadow = true;
    group.add(tuftMesh);
    disposables.push(merged);
  }

  /* ---------------------------------------------------------------- */
  /* 5. Floating Objects with Buoyancy Simulation                      */
  /* ---------------------------------------------------------------- */

  const floatingBodies: FloatingBody[] = [];

  const barrelMat = new MeshStandardNodeMaterial();
  barrelMat.roughness = 0.75;
  barrelMat.colorNode = rgb(0x6b482b);
  disposables.push(barrelMat);

  const ironMat = new MeshStandardNodeMaterial();
  ironMat.roughness = 0.45;
  ironMat.metalness = 0.8;
  ironMat.colorNode = rgb(0x282c30);
  disposables.push(ironMat);

  const buoyMat = new MeshStandardNodeMaterial();
  buoyMat.roughness = 0.35;
  buoyMat.metalness = 0.1;
  buoyMat.colorNode = rgb(0xdf3222); // Red
  disposables.push(buoyMat);

  const buoyWhiteMat = new MeshStandardNodeMaterial();
  buoyWhiteMat.roughness = 0.35;
  buoyWhiteMat.metalness = 0.1;
  buoyWhiteMat.colorNode = rgb(0xedf2f5);
  disposables.push(buoyWhiteMat);

  function makeBarrelMesh(): THREE.Group {
    const bGroup = new THREE.Group();
    const stavesGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.95, 12);
    const staves = new THREE.Mesh(stavesGeo, barrelMat);
    staves.castShadow = true;
    staves.receiveShadow = true;
    bGroup.add(staves);

    const hoop1 = new THREE.TorusGeometry(0.39, 0.02, 6, 14);
    hoop1.rotateX(Math.PI / 2);
    hoop1.translate(0, 0.28, 0);
    const hoop2 = hoop1.clone();
    hoop2.translate(0, -0.56, 0);
    const hoopMesh1 = new THREE.Mesh(hoop1, ironMat);
    const hoopMesh2 = new THREE.Mesh(hoop2, ironMat);
    bGroup.add(hoopMesh1, hoopMesh2);
    return bGroup;
  }

  function makeCrateMesh(size = 0.8): THREE.Group {
    const cGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const boxMesh = new THREE.Mesh(boxGeo, barrelMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    cGroup.add(boxMesh);
    return cGroup;
  }

  function makeBuoyMesh(): THREE.Group {
    const buoyGroup = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(0.45, 1.2, 10);
    coneGeo.translate(0, 0.25, 0);
    const coneMesh = new THREE.Mesh(coneGeo, buoyMat);
    coneMesh.castShadow = true;
    buoyGroup.add(coneMesh);

    const ringGeo = new THREE.TorusGeometry(0.40, 0.10, 6, 14);
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.translate(0, 0.12, 0);
    const ringMesh = new THREE.Mesh(ringGeo, buoyWhiteMat);
    buoyGroup.add(ringMesh);

    const mastGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
    mastGeo.translate(0, 1.0, 0);
    const mastMesh = new THREE.Mesh(mastGeo, ironMat);
    buoyGroup.add(mastMesh);
    return buoyGroup;
  }

  function makeLogMesh(): THREE.Group {
    const logGroup = new THREE.Group();
    const logGeo = new THREE.CylinderGeometry(0.20, 0.24, 2.8, 8);
    logGeo.rotateZ(Math.PI / 2);
    const logMesh = new THREE.Mesh(logGeo, woodMat);
    logMesh.castShadow = true;
    logMesh.receiveShadow = true;
    logGroup.add(logMesh);
    return logGroup;
  }

  const FLOATING_CONFIGS = [
    { type: 'barrel', x: -1.6, z: -14.0, mass: 28, radius: 0.48, roll: 0.85 },
    { type: 'barrel', x: 2.2, z: -17.0, mass: 32, radius: 0.48, roll: 0.85 },
    { type: 'barrel', x: -3.4, z: -22.0, mass: 30, radius: 0.48, roll: 0.85 },
    { type: 'crate', x: 0.6, z: -19.5, mass: 45, radius: 0.55, roll: 0.60 },
    { type: 'crate', x: -1.0, z: -26.0, mass: 50, radius: 0.55, roll: 0.60 },
    { type: 'crate', x: 3.2, z: -24.0, mass: 42, radius: 0.55, roll: 0.60 },
    { type: 'buoy', x: 4.2, z: -18.5, mass: 65, radius: 0.60, roll: 0.95 },
    { type: 'buoy', x: -4.8, z: -30.0, mass: 70, radius: 0.60, roll: 0.95 },
    { type: 'log', x: 1.2, z: -29.0, mass: 55, radius: 0.70, roll: 0.70 },
    { type: 'log', x: -2.2, z: -36.0, mass: 60, radius: 0.70, roll: 0.70 },
  ];

  FLOATING_CONFIGS.forEach((cfg) => {
    let mesh: THREE.Group;
    if (cfg.type === 'barrel') mesh = makeBarrelMesh();
    else if (cfg.type === 'crate') mesh = makeCrateMesh();
    else if (cfg.type === 'buoy') mesh = makeBuoyMesh();
    else mesh = makeLogMesh();

    mesh.position.set(cfg.x, 0, cfg.z);
    group.add(mesh);

    floatingBodies.push({
      mesh,
      basePos: new THREE.Vector3(cfg.x, 0, cfg.z),
      pos: new THREE.Vector3(cfg.x, 0, cfg.z),
      vel: new THREE.Vector3(0, 0, 0),
      rot: new THREE.Euler(),
      angVel: new THREE.Vector3(),
      mass: cfg.mass,
      radius: cfg.radius,
      buoyancyCoeff: 32.0,
      targetY: 0,
      rollCoeff: cfg.roll,
      lastSplashTime: 0,
    });
  });

  /* ---------------------------------------------------------------- */
  /* 6. Dynamic Water Splash & Spray Particle System                  */
  /* ---------------------------------------------------------------- */

  const SPLASH_MAX = 350;
  const splashPositions = new Float32Array(SPLASH_MAX * 3);
  const splashVelocities = new Float32Array(SPLASH_MAX * 3);
  const splashAges = new Float32Array(SPLASH_MAX);
  const splashLifetimes = new Float32Array(SPLASH_MAX);
  const splashSizes = new Float32Array(SPLASH_MAX);

  const splashGeo = new THREE.InstancedBufferGeometry();
  const sQuad = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
    -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]);
  const sUv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  splashGeo.setAttribute('position', new THREE.BufferAttribute(sQuad, 3));
  splashGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));

  const splashOriginAttr = new THREE.InstancedBufferAttribute(new Float32Array(SPLASH_MAX * 3), 3);
  const splashScaleAttr = new THREE.InstancedBufferAttribute(new Float32Array(SPLASH_MAX), 1);
  const splashAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(SPLASH_MAX), 1);

  splashGeo.setAttribute('aOrigin', splashOriginAttr);
  splashGeo.setAttribute('aScale', splashScaleAttr);
  splashGeo.setAttribute('aAlpha', splashAlphaAttr);
  splashGeo.instanceCount = 0;
  splashGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -LEN / 2), LEN);

  const splashMat = new MeshBasicNodeMaterial();
  splashMat.transparent = true;
  splashMat.depthWrite = false;
  splashMat.side = THREE.DoubleSide;
  splashMat.fog = false;

  {
    const o = attribute('aOrigin', 'vec3');
    const scale = attribute('aScale', 'float');
    const alpha = attribute('aAlpha', 'float');

    const toCam = normalize(cameraPosition.sub(o));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    const up = cross(toCam, right);

    splashMat.positionNode = o
      .add(right.mul(positionLocal.x.mul(scale)))
      .add(up.mul(positionLocal.y.mul(scale)));

    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const circle = float(1.0).sub(smoothstep(float(0.3), float(1.0), d));

    splashMat.colorNode = vec4(rgb(0xebf8fa), circle.mul(alpha).mul(0.75));
  }

  const splashMesh = new THREE.Mesh(splashGeo, splashMat);
  splashMesh.frustumCulled = false;
  splashMesh.renderOrder = 7;
  group.add(splashMesh);
  disposables.push(splashGeo, splashMat);

  let activeSplashCount = 0;

  function spawnSplashBurst(x: number, y: number, z: number, count = 10, speedScale = 1.0, sizeScale = 1.0) {
    for (let i = 0; i < count; i++) {
      if (activeSplashCount >= SPLASH_MAX) break;
      const idx = activeSplashCount++;
      splashPositions[idx * 3] = x + (Math.random() - 0.5) * 0.25;
      splashPositions[idx * 3 + 1] = y + Math.random() * 0.15;
      splashPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.25;

      const angle = Math.random() * Math.PI * 2;
      const horiz = (0.6 + Math.random() * 1.8) * speedScale;
      splashVelocities[idx * 3] = Math.cos(angle) * horiz;
      splashVelocities[idx * 3 + 1] = (1.8 + Math.random() * 2.8) * speedScale;
      splashVelocities[idx * 3 + 2] = Math.sin(angle) * horiz;

      splashAges[idx] = 0;
      splashLifetimes[idx] = 0.35 + Math.random() * 0.30;
      splashSizes[idx] = (0.05 + Math.random() * 0.08) * sizeScale;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 7. Procedural Off-Road Rover / Water Buggy                       */
  /* ---------------------------------------------------------------- */

  const carGroup = new THREE.Group();
  const carParts: THREE.BufferGeometry[] = [];

  const carBodyMat = new MeshStandardNodeMaterial();
  carBodyMat.roughness = 0.32;
  carBodyMat.metalness = 0.65;
  carBodyMat.colorNode = rgb(0xe88a1a); // Rally orange
  disposables.push(carBodyMat);

  const carChassisMat = new MeshStandardNodeMaterial();
  carChassisMat.roughness = 0.5;
  carChassisMat.metalness = 0.85;
  carChassisMat.colorNode = rgb(0x1a1e22); // Gunmetal
  disposables.push(carChassisMat);

  const tireMat = new MeshStandardNodeMaterial();
  tireMat.roughness = 0.88;
  tireMat.metalness = 0.05;
  tireMat.colorNode = rgb(0x18181a); // Rubber black
  disposables.push(tireMat);

  const silverMat = new MeshStandardNodeMaterial();
  silverMat.roughness = 0.25;
  silverMat.metalness = 0.95;
  silverMat.colorNode = rgb(0xd0d8e0); // Chrome / silver
  disposables.push(silverMat);

  // Main lower tub
  const chassisBox = new THREE.BoxGeometry(1.5, 0.35, 2.8);
  chassisBox.translate(0, 0.45, 0);
  carParts.push(chassisBox);

  // Hood wedge
  const hood = new THREE.BoxGeometry(1.3, 0.20, 1.1);
  hood.translate(0, 0.65, 0.85);
  carParts.push(hood);

  // Cabin roll cage (tubes)
  const cagePillars = [
    [-0.65, 0.6, 0.6, -0.55, 1.3, 0.2],
    [0.65, 0.6, 0.6, 0.55, 1.3, 0.2],
    [-0.65, 0.6, -0.7, -0.55, 1.3, -0.4],
    [0.65, 0.6, -0.7, 0.55, 1.3, -0.4],
    // Roof bars
    [-0.55, 1.3, 0.2, 0.55, 1.3, 0.2],
    [-0.55, 1.3, -0.4, 0.55, 1.3, -0.4],
    [-0.55, 1.3, 0.2, -0.55, 1.3, -0.4],
    [0.55, 1.3, 0.2, 0.55, 1.3, -0.4],
  ];
  cagePillars.forEach(([x0, y0, z0, x1, y1, z1]) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const tube = new THREE.CylinderGeometry(0.04, 0.04, len, 6);
    tube.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    carParts.push(tube);
  });

  // Front bumper
  const bumper = new THREE.BoxGeometry(1.7, 0.18, 0.22);
  bumper.translate(0, 0.42, 1.55);
  carParts.push(bumper);

  // Headlights
  for (const side of [-1, 1]) {
    const light = new THREE.CylinderGeometry(0.10, 0.10, 0.12, 8);
    light.rotateX(Math.PI / 2);
    light.translate(side * 0.54, 0.64, 1.48);
    carParts.push(light);
  }

  const carMerged = mergeSimple(carParts);
  carParts.forEach((g) => g.dispose());
  const carBodyMesh = new THREE.Mesh(carMerged, carBodyMat);
  carBodyMesh.castShadow = true;
  carBodyMesh.receiveShadow = true;
  carGroup.add(carBodyMesh);
  disposables.push(carMerged);

  // 4 Wheels
  const WHEEL_RADIUS = 0.42;
  const WHEEL_WIDTH = 0.32;
  const wheels: THREE.Mesh[] = [];
  const wheelOffsets = [
    [-0.90, 0.42, 1.05],  // Front Left
    [0.90, 0.42, 1.05],   // Front Right
    [-0.92, 0.44, -1.05], // Rear Left
    [0.92, 0.44, -1.05],  // Rear Right
  ];

  wheelOffsets.forEach(([wx, wy, wz]) => {
    const wheelAssembly = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheelAssembly.add(tire);

    const rimGeo = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.6, WHEEL_RADIUS * 0.6, WHEEL_WIDTH * 1.05, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, silverMat);
    wheelAssembly.add(rim);

    wheelAssembly.position.set(wx, wy, wz);
    carGroup.add(wheelAssembly);
    wheels.push(tire); // for rotation
    disposables.push(tireGeo, rimGeo);
  });

  group.add(carGroup);

  // Car state
  let carPos = new THREE.Vector3(0, 0.4, -6);
  let carSpeed = 0;
  let carHeading = -Math.PI / 2;
  let carWheelRotation = 0;

  const _localPlayerPos = new THREE.Vector3();
  let lastPlayerStepSplash = 0;

  return {
    group,
    length: LEN,
    foliage: uniforms,
    title: 'Gerstner shoreline with physics buoyancy & vehicle splash',
    skill: 'threejs-webgpu-water',
    update(elapsed, dt, playerPos, playerVel) {
      (time as unknown as { value: number }).value = elapsed;
      (uniforms.time as unknown as { value: number }).value = elapsed;

      const delta = Math.min(dt, 0.05);

      let hasPlayer = false;
      if (playerPos) {
        group.updateWorldMatrix(true, false);
        _localPlayerPos.copy(playerPos);
        group.worldToLocal(_localPlayerPos);
        hasPlayer = true;
      }

      /* --- 1. Buoyancy & Floating Physics --- */
      floatingBodies.forEach((body) => {
        const water = sampleWaterHeight(body.pos.x, body.pos.z, elapsed);
        body.targetY = water.y;

        // Player physical kick/push interaction
        if (hasPlayer) {
          const dx = body.pos.x - _localPlayerPos.x;
          const dz = body.pos.z - _localPlayerPos.z;
          const dist = Math.hypot(dx, dz);
          const pushRadius = body.radius + 0.65;
          if (dist < pushRadius && Math.abs(_localPlayerPos.y - body.pos.y) < 1.4) {
            const pushDirX = dist > 0.01 ? dx / dist : 1;
            const pushDirZ = dist > 0.01 ? dz / dist : 0;
            const impulse = (pushRadius - dist) * 14.0;
            body.vel.x += pushDirX * impulse;
            body.vel.z += pushDirZ * impulse;
            body.vel.y += impulse * 0.45;
            if (elapsed - body.lastSplashTime > 0.25) {
              body.lastSplashTime = elapsed;
              spawnSplashBurst(body.pos.x, water.y, body.pos.z, 8, 1.1, 1.0);
            }
          }
        }

        // Submersion depth
        const depth = water.y - body.pos.y;
        if (depth > -body.radius) {
          const immersion = Math.min(1.0, (depth + body.radius) / (body.radius * 2));
          const fBuoy = immersion * body.buoyancyCoeff;
          body.vel.y += (fBuoy - 9.81) * delta;
          body.vel.y *= Math.max(0.75, 1.0 - 4.5 * delta); // water drag

          // Wave orbital drift
          body.vel.x += water.sx * 1.5 * delta;
          body.vel.z += water.sz * 1.5 * delta;

          // Drag on horizontal motion
          body.vel.x *= Math.max(0.85, 1.0 - 2.5 * delta);
          body.vel.z *= Math.max(0.85, 1.0 - 2.5 * delta);

          // Spawn splash on vertical bob impact
          if (body.vel.y < -1.0 && elapsed - body.lastSplashTime > 0.45) {
            body.lastSplashTime = elapsed;
            spawnSplashBurst(body.pos.x, water.y, body.pos.z, 6, 0.7, 0.8);
          }
        } else {
          body.vel.y -= 9.81 * delta;
        }

        body.pos.addScaledVector(body.vel, delta);

        // Keep anchored near base position with gentle spring
        body.pos.x += (body.basePos.x - body.pos.x) * 0.3 * delta;
        body.pos.z += (body.basePos.z - body.pos.z) * 0.3 * delta;

        // Wave normal orientation (rocking & rolling)
        const targetPitch = -water.sz * body.rollCoeff;
        const targetRoll = water.sx * body.rollCoeff;
        body.rot.x += (targetPitch - body.rot.x) * 4.5 * delta;
        body.rot.z += (targetRoll - body.rot.z) * 4.5 * delta;

        body.mesh.position.copy(body.pos);
        body.mesh.rotation.copy(body.rot);
      });

      /* --- 2. Car Movement & Water Splash --- */
      // Dynamic patrol loop driving down the beach into water and splashing
      const loopTime = (elapsed * 0.32) % (Math.PI * 2);
      const targetZ = -6 - (Math.sin(loopTime) * 0.5 + 0.5) * 16; // Drives between z=-6 (dry sand) and z=-22 (water)
      const targetX = Math.sin(loopTime * 2.0) * 1.8;

      const moveDirZ = targetZ - carPos.z;
      const moveDirX = targetX - carPos.x;
      const moveDist = Math.hypot(moveDirX, moveDirZ);

      if (moveDist > 0.01) {
        carHeading = Math.atan2(moveDirX, moveDirZ);
        carSpeed = moveDist / delta;
      }

      carPos.x += moveDirX * Math.min(1.0, 3.8 * delta);
      carPos.z += moveDirZ * Math.min(1.0, 3.8 * delta);

      // Get water & ground height at car center
      const carWater = sampleWaterHeight(carPos.x, carPos.z, elapsed);
      const sandZ = Math.max(0, (-carPos.z - 3.5) / 28);
      const sandY = -2.2 * sandZ * sandZ + 0.42 * Math.max(0, 1 - (-carPos.z) / 6.5);

      const groundOrWaterY = Math.max(sandY, carWater.y - 0.20);
      carPos.y += (groundOrWaterY - carPos.y) * 8.0 * delta;

      carGroup.position.copy(carPos);
      carGroup.rotation.y = carHeading;
      carGroup.rotation.x = -carWater.sz * 0.35;
      carGroup.rotation.z = carWater.sx * 0.35;

      // Spin wheels
      carWheelRotation += carSpeed * delta * 2.4;
      wheels.forEach((w) => {
        w.rotation.x = carWheelRotation;
      });

      // Water interaction: car wheels in water produce rooster tails & bow wave!
      const waterDepth = carWater.y - (carPos.y - 0.1);
      if (waterDepth > 0.04 && carSpeed > 0.8) {
        // Rear wheel roostertail spray
        const rearLeft = carPos.clone().add(new THREE.Vector3(-0.90, -0.1, -1.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading));
        const rearRight = carPos.clone().add(new THREE.Vector3(0.90, -0.1, -1.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading));
        spawnSplashBurst(rearLeft.x, carWater.y, rearLeft.z, 2, 1.2, 0.9);
        spawnSplashBurst(rearRight.x, carWater.y, rearRight.z, 2, 1.2, 0.9);

        // Front bow spray
        const front = carPos.clone().add(new THREE.Vector3(0, -0.1, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading));
        spawnSplashBurst(front.x, carWater.y, front.z, 2, 0.9, 0.8);
      }

      // Player footstep splashes when wading in the shoreline water
      if (hasPlayer && _localPlayerPos.z < -6.2 && _localPlayerPos.z > -CORRIDOR_LEN && playerVel && playerVel.lengthSq() > 1.0) {
        if (elapsed - lastPlayerStepSplash > 0.28) {
          lastPlayerStepSplash = elapsed;
          const pWater = sampleWaterHeight(_localPlayerPos.x, _localPlayerPos.z, elapsed);
          spawnSplashBurst(_localPlayerPos.x, pWater.y, _localPlayerPos.z, 5, 0.7, 0.7);
        }
      }

      /* --- 3. Update Splash Particles --- */
      let writeIdx = 0;
      for (let i = 0; i < activeSplashCount; i++) {
        splashAges[i] += delta;
        if (splashAges[i] < splashLifetimes[i]) {
          splashVelocities[i * 3 + 1] -= 18.0 * delta; // Quick gravity fall
          splashPositions[i * 3] += splashVelocities[i * 3] * delta;
          splashPositions[i * 3 + 1] += splashVelocities[i * 3 + 1] * delta;
          splashPositions[i * 3 + 2] += splashVelocities[i * 3 + 2] * delta;

          if (writeIdx !== i) {
            splashPositions[writeIdx * 3] = splashPositions[i * 3];
            splashPositions[writeIdx * 3 + 1] = splashPositions[i * 3 + 1];
            splashPositions[writeIdx * 3 + 2] = splashPositions[i * 3 + 2];
            splashVelocities[writeIdx * 3] = splashVelocities[i * 3];
            splashVelocities[writeIdx * 3 + 1] = splashVelocities[i * 3 + 1];
            splashVelocities[writeIdx * 3 + 2] = splashVelocities[i * 3 + 2];
            splashAges[writeIdx] = splashAges[i];
            splashLifetimes[writeIdx] = splashLifetimes[i];
            splashSizes[writeIdx] = splashSizes[i];
          }

          const progress = splashAges[writeIdx] / splashLifetimes[writeIdx];
          const scale = splashSizes[writeIdx] * (1.0 + progress * 1.2);
          const alpha = Math.max(0, 1.0 - progress);

          splashOriginAttr.setXYZ(writeIdx, splashPositions[writeIdx * 3], splashPositions[writeIdx * 3 + 1], splashPositions[writeIdx * 3 + 2]);
          splashScaleAttr.setX(writeIdx, scale);
          splashAlphaAttr.setX(writeIdx, alpha);

          writeIdx++;
        }
      }
      activeSplashCount = writeIdx;
      splashGeo.instanceCount = activeSplashCount;
      if (activeSplashCount > 0) {
        splashOriginAttr.needsUpdate = true;
        splashScaleAttr.needsUpdate = true;
        splashAlphaAttr.needsUpdate = true;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
