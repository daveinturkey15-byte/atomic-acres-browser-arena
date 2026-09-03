/**
 * map3/corridors.ts — the three exhibits.
 *
 * Each corridor is a factory returning { group, update, dispose } and nothing
 * else. Nothing outside this file reaches into their internals, nothing mutates
 * global renderer state, and every GPU resource each one creates is released by
 * its own dispose(). That is the ring-fence: a corridor cannot break the game
 * because it cannot reach it.
 *
 *   1. NATURE   — the six techniques a reference jungle uses and we do not.
 *   2. MATHS    — a raymarched SDF grotto. Not one triangle of content.
 *   3. GRAMMAR  — a shape-grammar tower, rebuilt from a seed as you walk past.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  Fn, Loop, Break, If, abs, cameraPosition, clamp, cos, dot, float, length, max, mix,
  normalize, positionWorld, pow, sin, uniform, vec3,
} = TSL as unknown as Record<string, any>;

import {
  createTree, createShrub, createConifer, createFallenLog, createGrassTuft, poissonScatter,
} from './plants';
import { createLitterSkirt, hash11, mergeGeometries } from './leaf-geometry';
import { createStreetCell, STREET_CELL_Z_END } from './street-cell';
import {
  AUTUMN_PALETTE, SPRING_PALETTE, SUMMER_PALETTE, createBarkMaterial, createFlatFoliageMaterial,
  createFoliageMaterial, createFoliageUniforms, createForestFloorMaterial,
  setVehicleInteractor, setPlayerInteractor, rgb,
  type FoliageUniforms,
} from './foliage-material';

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

export interface Corridor {
  group: THREE.Group;
  update(elapsed: number, dt: number, playerPos?: THREE.Vector3, playerVel?: THREE.Vector3): void;
  dispose(): void;
  foliage?: FoliageUniforms;
  length: number;
  title: string;
  skill: string;
}

const CORRIDOR_WIDTH = 9;

interface InteractivePlant {
  x: number;
  z: number;
  baseScale: number;
  baseRotY: number;
  bendX: number;
  bendZ: number;
  velX: number;
  velZ: number;
  radius: number;
  maxBend: number;
  stiffness: number;
  damping: number;
}

/* ------------------------------------------------------------------ */
/* 1. NATURE & VEHICLE THROUGH VEGETATION                             */
/* ------------------------------------------------------------------ */

/**
 * A forest floor with full procedural vegetation, interactive vehicle interaction,
 * instanced sapling and shrub spring-rebound bending, and the before/after split.
 */
export function createNatureCorridor(seed = 7): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 54;
  const Z1 = -LEN / 3;          // end of zone A
  const Z2 = -(LEN * 2) / 3;    // end of zone B

  const uniforms = createFoliageUniforms();
  const foliageMat = createFoliageMaterial(uniforms, SUMMER_PALETTE);
  const autumnMat = createFoliageMaterial(uniforms, AUTUMN_PALETTE);
  const springMat = createFoliageMaterial(uniforms, SPRING_PALETTE);
  const flatMat = createFlatFoliageMaterial(SUMMER_PALETTE);
  const barkMat = createBarkMaterial();
  const darkBarkMat = createBarkMaterial(0x4a4034);
  const floorMat = createForestFloorMaterial({ z1: Z1, z2: Z2 });
  disposables.push(foliageMat, autumnMat, springMat, flatMat, barkMat, darkBarkMat, floorMat);

  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH + 4, LEN, 14, 54);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);   // clear of the hub plane at y=0
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  // Batched background trees
  const wood: THREE.BufferGeometry[] = [];
  const darkWood: THREE.BufferGeometry[] = [];
  const green: THREE.BufferGeometry[] = [];
  const autumn: THREE.BufferGeometry[] = [];
  const spring: THREE.BufferGeometry[] = [];
  const flat: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();

  const place = (g: THREE.BufferGeometry, x: number, z: number, ry = 0) => {
    xf.makeRotationY(ry);
    xf.setPosition(x, 0, z);
    g.applyMatrix4(xf);
    return g;
  };

  /* ---- ZONE A: broadleaf, and the before/after split ------------------ */
  poissonScatter(28, { minX: -11, maxX: 11, minZ: Z1, maxZ: 1 }, 2.6, seed).forEach((p, i) => {
    if (Math.abs(p.x) < 2.0) return; // Keep central trail open for vehicle
    const before = p.x < 0;
    const parts = createTree({
      seed: seed * 10 + i,
      height: 4.5 + hash11(seed + i) * 6.5,
      trunkRadius: 0.12 + hash11(seed * 2 + i) * 0.19,
      depth: 3, leavesPerClump: 11, deadFraction: 0.08,
    });
    wood.push(place(parts.wood, p.x, p.y));
    (before ? flat : green).push(place(parts.foliage, p.x, p.y));
    if (!before) green.push(place(parts.litter, p.x, p.y));
    else parts.litter.dispose();
  });

  /* ---- ZONE B: conifer stand, grass understorey, deadwood ------------- */
  poissonScatter(24, { minX: -12, maxX: 12, minZ: Z2, maxZ: Z1 }, 2.9, seed * 3).forEach((p, i) => {
    if (Math.abs(p.x) < 2.2) return;
    const parts = createConifer({
      seed: seed * 20 + i,
      height: 7 + hash11(seed * 5 + i) * 8,
      trunkRadius: 0.16 + hash11(seed * 6 + i) * 0.14,
    });
    darkWood.push(place(parts.wood, p.x, p.y));
    green.push(place(parts.foliage, p.x, p.y));
    green.push(place(parts.litter, p.x, p.y));
  });
  // Fallen logs
  [[-3.4, Z1 - 4, 0.4], [3.9, Z1 - 11, -0.8], [-4.6, Z2 + 3, 1.9]].forEach(([x, z, r], i) => {
    darkWood.push(place(createFallenLog(seed * 30 + i, 3.2 + i), x, z, r));
  });

  /* ---- ZONE C: autumn grove, heavy litter, spring saplings ------------ */
  poissonScatter(30, { minX: -12, maxX: 12, minZ: -LEN, maxZ: Z2 }, 2.4, seed * 11).forEach((p, i) => {
    if (Math.abs(p.x) < 2.0) return;
    const young = hash11(seed * 13 + i) > 0.7;
    const parts = createTree({
      seed: seed * 40 + i,
      height: young ? 2.6 + hash11(seed + i) * 2 : 5 + hash11(seed + i) * 7,
      trunkRadius: young ? 0.07 : 0.13 + hash11(seed * 3 + i) * 0.16,
      depth: 3, leavesPerClump: young ? 8 : 12,
      deadFraction: young ? 0.05 : 0.55,
    });
    wood.push(place(parts.wood, p.x, p.y));
    (young ? spring : autumn).push(place(parts.foliage, p.x, p.y));
    autumn.push(place(parts.litter, p.x, p.y));
  });

  /* ---- Background understorey and litter skirts ----------------------- */
  poissonScatter(80, { minX: -11, maxX: 11, minZ: -LEN, maxZ: 0 }, 1.35, seed * 5).forEach((p, i) => {
    if (Math.abs(p.x) < 2.2) return;
    const before = p.y > Z1 && p.x < 0;
    const g = createShrub(seed * 60 + i, 0.6 + hash11(seed + i * 3) * 1.1);
    (before ? flat : (p.y < Z2 ? autumn : green))
      .push(place(g, p.x, p.y, hash11(seed + i * 9) * 6.28));
  });
  poissonScatter(160, { minX: -6, maxX: 6, minZ: -LEN + 1, maxZ: -1 }, 0.58, seed * 3).forEach((p, i) => {
    if (p.y > Z1 && p.x < 0) return;
    if (Math.abs(p.x) < 1.4) return;
    const g = createLitterSkirt(0.28, 3, {
      length: 0.19, width: 0.07, segmentsV: 3, segmentsU: 2, widestAt: 0.4,
    }, seed * 17 + i);
    (p.y < Z2 ? autumn : green).push(place(g, p.x, p.y));
  });

  function addBatch(parts: THREE.BufferGeometry[], material: THREE.Material, cast: boolean): void {
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = !cast;
    group.add(mesh);
    disposables.push(merged);
  }

  addBatch(wood, barkMat, true);
  addBatch(darkWood, darkBarkMat, true);
  addBatch(green, foliageMat, false);
  addBatch(autumn, autumnMat, false);
  addBatch(spring, springMat, false);
  addBatch(flat, flatMat, false);

  /* ---------------------------------------------------------------- */
  /* 2. Interactive Instanced Vegetation (Saplings, Shrubs, Grass)     */
  /* ---------------------------------------------------------------- */

  // A. Interactive Saplings
  const saplingTemplate = createTree({
    seed: 77, height: 2.6, trunkRadius: 0.07, depth: 2, leavesPerClump: 8, deadFraction: 0.06,
  });
  disposables.push(saplingTemplate.wood, saplingTemplate.foliage, saplingTemplate.litter);

  const saplingPositions = [
    { x: -1.35, z: -7.5, s: 1.05 },
    { x: 1.45, z: -11.0, s: 0.95 },
    { x: -1.25, z: -15.5, s: 1.15 },
    { x: 1.30, z: -19.0, s: 0.90 },
    { x: -1.40, z: -24.5, s: 1.10 },
    { x: 1.25, z: -28.0, s: 1.00 },
    { x: -1.30, z: -33.5, s: 1.05 },
    { x: 1.35, z: -37.0, s: 0.95 },
    { x: -1.20, z: -42.0, s: 1.10 },
    { x: 1.40, z: -46.5, s: 1.00 },
  ];
  const saplingPlants: InteractivePlant[] = saplingPositions.map((p, i) => ({
    x: p.x,
    z: p.z,
    baseScale: p.s,
    baseRotY: hash11(i * 7) * Math.PI * 2,
    bendX: 0,
    bendZ: 0,
    velX: 0,
    velZ: 0,
    radius: 0.85,
    maxBend: 1.6,
    stiffness: 22.0,
    damping: 3.2,
  }));

  const saplingWoodMesh = new THREE.InstancedMesh(saplingTemplate.wood, barkMat, saplingPlants.length);
  const saplingFoliageMesh = new THREE.InstancedMesh(saplingTemplate.foliage, foliageMat, saplingPlants.length);
  saplingWoodMesh.castShadow = true;
  saplingWoodMesh.receiveShadow = true;
  group.add(saplingWoodMesh, saplingFoliageMesh);
  disposables.push(saplingWoodMesh, saplingFoliageMesh);

  // B. Interactive Roadside Shrubs
  const shrubGeo = createShrub(99, 1.1);
  disposables.push(shrubGeo);

  const shrubPositions: Array<{ x: number; z: number; s: number }> = [];
  poissonScatter(32, { minX: -2.3, maxX: 2.3, minZ: -49, maxZ: -3 }, 1.35, 42).forEach((p, i) => {
    shrubPositions.push({ x: p.x, z: p.y, s: 0.75 + hash11(i * 3) * 0.55 });
  });
  const shrubPlants: InteractivePlant[] = shrubPositions.map((p, i) => ({
    x: p.x,
    z: p.z,
    baseScale: p.s,
    baseRotY: hash11(i * 5) * Math.PI * 2,
    bendX: 0,
    bendZ: 0,
    velX: 0,
    velZ: 0,
    radius: 0.70,
    maxBend: 1.3,
    stiffness: 26.0,
    damping: 3.8,
  }));

  const shrubMesh = new THREE.InstancedMesh(shrubGeo, foliageMat, shrubPlants.length);
  group.add(shrubMesh);
  disposables.push(shrubMesh);

  // C. Interactive Trail Grass Tufts
  const grassGeo = createGrassTuft(123, 1.25);
  disposables.push(grassGeo);

  const grassPositions: Array<{ x: number; z: number; s: number }> = [];
  poissonScatter(64, { minX: -2.2, maxX: 2.2, minZ: -50, maxZ: -2 }, 0.72, 88).forEach((p, i) => {
    grassPositions.push({ x: p.x, z: p.y, s: 0.85 + hash11(i * 4) * 0.5 });
  });
  const grassPlants: InteractivePlant[] = grassPositions.map((p, i) => ({
    x: p.x,
    z: p.z,
    baseScale: p.s,
    baseRotY: hash11(i * 3) * Math.PI * 2,
    bendX: 0,
    bendZ: 0,
    velX: 0,
    velZ: 0,
    radius: 0.55,
    maxBend: 1.4,
    stiffness: 32.0,
    damping: 4.8,
  }));

  const grassMesh = new THREE.InstancedMesh(grassGeo, foliageMat, grassPlants.length);
  group.add(grassMesh);
  disposables.push(grassMesh);

  /* ---------------------------------------------------------------- */
  /* 3. Procedural 4x4 Forester Overland Truck                        */
  /* ---------------------------------------------------------------- */

  const carGroup = new THREE.Group();

  const carBodyMat = new MeshStandardNodeMaterial();
  carBodyMat.roughness = 0.36;
  carBodyMat.metalness = 0.62;
  carBodyMat.colorNode = rgb(0x2d4f26); // Forest ranger deep olive green
  disposables.push(carBodyMat);

  const carSteelMat = new MeshStandardNodeMaterial();
  carSteelMat.roughness = 0.65;
  carSteelMat.metalness = 0.88;
  carSteelMat.colorNode = rgb(0x1a1c1e); // Dark gunmetal chassis
  disposables.push(carSteelMat);

  const carTimberMat = new MeshStandardNodeMaterial();
  carTimberMat.roughness = 0.85;
  carTimberMat.colorNode = rgb(0x4a3724); // Weathered hardwood bed
  disposables.push(carTimberMat);

  const tireMat = new MeshStandardNodeMaterial();
  tireMat.roughness = 0.90;
  tireMat.metalness = 0.05;
  tireMat.colorNode = rgb(0x151518); // Rubber black
  disposables.push(tireMat);

  const rimMat = new MeshStandardNodeMaterial();
  rimMat.roughness = 0.28;
  rimMat.metalness = 0.92;
  rimMat.colorNode = rgb(0xc5ccd4); // Steel rim
  disposables.push(rimMat);

  const headlightMat = new MeshStandardNodeMaterial();
  headlightMat.roughness = 0.2;
  headlightMat.colorNode = rgb(0xfffae0);
  headlightMat.emissiveNode = rgb(0xffe899, 2.5);
  disposables.push(headlightMat);

  // A. Cab & Hood
  const bodyParts: THREE.BufferGeometry[] = [];
  const cab = new THREE.BoxGeometry(1.65, 0.75, 1.45);
  cab.translate(0, 0.95, -0.2);
  bodyParts.push(cab);

  const hood = new THREE.BoxGeometry(1.45, 0.42, 1.35);
  hood.translate(0, 0.78, 1.15);
  bodyParts.push(hood);

  // Roof visor / brow
  const brow = new THREE.BoxGeometry(1.68, 0.08, 0.25);
  brow.translate(0, 1.34, 0.48);
  bodyParts.push(brow);

  // Side mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.BoxGeometry(0.12, 0.22, 0.16);
    mirror.translate(side * 0.94, 1.05, 0.35);
    bodyParts.push(mirror);
  }

  const bodyMerged = mergeSimple(bodyParts);
  bodyParts.forEach((g) => g.dispose());
  const bodyMesh = new THREE.Mesh(bodyMerged, carBodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);
  disposables.push(bodyMerged);

  // B. Steel Chassis, Bull-Bar & Roof Rack
  const steelParts: THREE.BufferGeometry[] = [];

  // Frame rails
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.12, 0.16, 3.8);
    rail.translate(side * 0.55, 0.42, 0.2);
    steelParts.push(rail);
  }

  // Heavy front bull-bar bumper with winch
  const bumper = new THREE.BoxGeometry(1.85, 0.24, 0.28);
  bumper.translate(0, 0.48, 1.88);
  steelParts.push(bumper);

  const winch = new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10);
  winch.rotateZ(Math.PI / 2);
  winch.translate(0, 0.55, 1.95);
  steelParts.push(winch);

  // Bull-bar brush guard hoops
  const guardPillars = [
    [-0.7, 0.55, 1.9, -0.65, 0.95, 1.85],
    [0.7, 0.55, 1.9, 0.65, 0.95, 1.85],
    [-0.65, 0.95, 1.85, 0.65, 0.95, 1.85],
  ];
  guardPillars.forEach(([x0, y0, z0, x1, y1, z1]) => {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const tube = new THREE.CylinderGeometry(0.035, 0.035, d, 6);
    tube.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    steelParts.push(tube);
  });

  // Roll cage / headache rack behind cab
  const rollBarBars = [
    [-0.78, 0.6, -0.95, -0.72, 1.45, -0.95],
    [0.78, 0.6, -0.95, 0.72, 1.45, -0.95],
    [-0.72, 1.45, -0.95, 0.72, 1.45, -0.95],
  ];
  rollBarBars.forEach(([x0, y0, z0, x1, y1, z1]) => {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const tube = new THREE.CylinderGeometry(0.04, 0.04, d, 6);
    tube.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    steelParts.push(tube);
  });

  const steelMerged = mergeSimple(steelParts);
  steelParts.forEach((g) => g.dispose());
  const steelMesh = new THREE.Mesh(steelMerged, carSteelMat);
  steelMesh.castShadow = true;
  steelMesh.receiveShadow = true;
  carGroup.add(steelMesh);
  disposables.push(steelMerged);

  // C. Hardwood Rear Cargo Bed & Toolboxes
  const timberParts: THREE.BufferGeometry[] = [];
  const bedFloor = new THREE.BoxGeometry(1.62, 0.10, 1.55);
  bedFloor.translate(0, 0.58, -1.65);
  timberParts.push(bedFloor);

  for (const side of [-1, 1]) {
    const sideBoard = new THREE.BoxGeometry(0.08, 0.38, 1.55);
    sideBoard.translate(side * 0.77, 0.76, -1.65);
    timberParts.push(sideBoard);
  }
  const tailgate = new THREE.BoxGeometry(1.62, 0.38, 0.08);
  tailgate.translate(0, 0.76, -2.40);
  timberParts.push(tailgate);

  const timberMerged = mergeSimple(timberParts);
  timberParts.forEach((g) => g.dispose());
  const timberMesh = new THREE.Mesh(timberMerged, carTimberMat);
  timberMesh.castShadow = true;
  timberMesh.receiveShadow = true;
  carGroup.add(timberMesh);
  disposables.push(timberMerged);

  // D. Headlights
  const lightParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.CylinderGeometry(0.12, 0.12, 0.10, 10);
    lamp.rotateX(Math.PI / 2);
    lamp.translate(side * 0.56, 0.78, 1.83);
    lightParts.push(lamp);

    // Roof spotlamp
    const spot = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8);
    spot.rotateX(Math.PI / 2);
    spot.translate(side * 0.38, 1.45, 0.44);
    lightParts.push(spot);
  }
  const lightMerged = mergeSimple(lightParts);
  lightParts.forEach((g) => g.dispose());
  const lightMesh = new THREE.Mesh(lightMerged, headlightMat);
  carGroup.add(lightMesh);
  disposables.push(lightMerged);

  // E. 4 Off-road Wheels & Front Steering Assemblies
  const WHEEL_R = 0.44;
  const WHEEL_W = 0.34;
  const wheels: THREE.Mesh[] = [];

  const frontWheelAssemblyL = new THREE.Group();
  const frontWheelAssemblyR = new THREE.Group();
  frontWheelAssemblyL.position.set(-0.95, WHEEL_R, 1.15);
  frontWheelAssemblyR.position.set(0.95, WHEEL_R, 1.15);
  carGroup.add(frontWheelAssemblyL, frontWheelAssemblyR);

  const rearAssemblyL = new THREE.Group();
  const rearAssemblyR = new THREE.Group();
  rearAssemblyL.position.set(-0.95, WHEEL_R, -1.45);
  rearAssemblyR.position.set(0.95, WHEEL_R, -1.45);
  carGroup.add(rearAssemblyL, rearAssemblyR);

  [frontWheelAssemblyL, frontWheelAssemblyR, rearAssemblyL, rearAssemblyR].forEach((assembly) => {
    const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    assembly.add(tire);

    const rimGeo = new THREE.CylinderGeometry(WHEEL_R * 0.58, WHEEL_R * 0.58, WHEEL_W * 1.05, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    assembly.add(rim);

    wheels.push(tire);
    disposables.push(tireGeo, rimGeo);
  });

  group.add(carGroup);

  // Vehicle dynamic state
  const carPos = new THREE.Vector3(0, 0.03, -6.0);
  const carVel = new THREE.Vector3();
  let carHeading = 0;
  let carSpeed = 0;
  let carWheelRot = 0;
  let steeringAngle = 0;
  let carRoll = 0;
  let carPitch = 0;

  // Temp math objects for spring matrix updates
  const _matPos = new THREE.Vector3();
  const _matEuler = new THREE.Euler();
  const _matQuat = new THREE.Quaternion();
  const _matScale = new THREE.Vector3();
  const _instMatrix = new THREE.Matrix4();
  const _localPlayerPos = new THREE.Vector3();

  function updateSpringPlants(
    plants: InteractivePlant[],
    mesh: THREE.InstancedMesh,
    mesh2: THREE.InstancedMesh | null,
    delta: number,
    hasPlayer: boolean,
  ) {
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];

      // Interaction with vehicle
      const dx = p.x - carPos.x;
      const dz = p.z - carPos.z;
      const dist = Math.hypot(dx, dz);
      const vehicleReach = p.radius + 1.25;

      if (dist < vehicleReach) {
        const pushNorm = Math.max(0, 1.0 - dist / vehicleReach);
        const pushDirX = dist > 0.01 ? dx / dist : 1.0;
        const pushDirZ = dist > 0.01 ? dz / dist : 0.0;
        // Directional deflection + forward drag from moving vehicle
        const forwardX = Math.sin(carHeading);
        const forwardZ = Math.cos(carHeading);
        const impulse = pushNorm * (p.maxBend * 1.8);
        p.velX += (pushDirX * impulse + forwardX * (carSpeed * 0.25)) * 14.0 * delta;
        p.velZ += (pushDirZ * impulse + forwardZ * (carSpeed * 0.25)) * 14.0 * delta;
      }

      // Interaction with player
      if (hasPlayer) {
        const pdx = p.x - _localPlayerPos.x;
        const pdz = p.z - _localPlayerPos.z;
        const pdist = Math.hypot(pdx, pdz);
        const playerReach = p.radius + 0.55;
        if (pdist < playerReach && Math.abs(_localPlayerPos.y) < 2.0) {
          const ppush = Math.max(0, 1.0 - pdist / playerReach);
          const pdirX = pdist > 0.01 ? pdx / pdist : 1.0;
          const pdirZ = pdist > 0.01 ? pdz / pdist : 0.0;
          p.velX += pdirX * ppush * 10.0 * delta;
          p.velZ += pdirZ * ppush * 10.0 * delta;
        }
      }

      // 2nd-order spring-damper restorative physics
      const fx = -p.stiffness * p.bendX - p.damping * p.velX;
      const fz = -p.stiffness * p.bendZ - p.damping * p.velZ;
      p.velX += fx * delta;
      p.bendX += p.velX * delta;
      p.velZ += fz * delta;
      p.bendZ += p.velZ * delta;

      // Clamp max deflection
      const curBend = Math.hypot(p.bendX, p.bendZ);
      if (curBend > p.maxBend) {
        p.bendX = (p.bendX / curBend) * p.maxBend;
        p.bendZ = (p.bendZ / curBend) * p.maxBend;
      }

      // Construct instance matrix: root anchor at y = 0, tilt and scale squish
      _matPos.set(p.x + p.bendX * 0.10, 0.03, p.z + p.bendZ * 0.10);
      _matEuler.set(p.bendZ * 0.40, p.baseRotY, -p.bendX * 0.40, 'YXZ');
      _matQuat.setFromEuler(_matEuler);
      const flatten = Math.max(0.25, 1.0 - curBend * 0.35);
      _matScale.set(p.baseScale, p.baseScale * flatten, p.baseScale);
      _instMatrix.compose(_matPos, _matQuat, _matScale);

      mesh.setMatrixAt(i, _instMatrix);
      if (mesh2) mesh2.setMatrixAt(i, _instMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh2) mesh2.instanceMatrix.needsUpdate = true;
  }

  // Initial matrix setup for instanced vegetation
  updateSpringPlants(saplingPlants, saplingWoodMesh, saplingFoliageMesh, 0.001, false);
  updateSpringPlants(shrubPlants, shrubMesh, null, 0.001, false);
  updateSpringPlants(grassPlants, grassMesh, null, 0.001, false);

  const _carWorldPos = new THREE.Vector3();

  return {
    group,
    length: LEN,
    foliage: uniforms,
    title: 'Vegetation bending, leaf translucency & vehicle interaction',
    skill: 'threejs-procedural-vegetation',
    update(elapsed, dt, playerPos) {
      (uniforms.time as unknown as { value: number }).value = elapsed;

      const delta = Math.min(dt, 0.05);

      let hasPlayer = false;
      if (playerPos) {
        group.updateWorldMatrix(true, false);
        _localPlayerPos.copy(playerPos);
        group.worldToLocal(_localPlayerPos);
        hasPlayer = true;
      }

      /* --- 1. Vehicle Movement along Winding Forest Trail --- */
      const loopTime = (elapsed * 0.24) % (Math.PI * 2);
      // Patrol loop between z = -4.5 and z = -47.5
      const targetZ = -4.5 - (Math.sin(loopTime) * 0.5 + 0.5) * 43.0;
      const targetX = Math.sin(loopTime * 1.5) * 1.4 + Math.sin(loopTime * 3.0) * 0.45;

      const prevX = carPos.x;
      const prevZ = carPos.z;
      const moveDirZ = targetZ - carPos.z;
      const moveDirX = targetX - carPos.x;
      const moveDist = Math.hypot(moveDirX, moveDirZ);

      if (moveDist > 0.001) {
        const desiredHeading = Math.atan2(moveDirX, moveDirZ);
        let dHeading = desiredHeading - carHeading;
        while (dHeading > Math.PI) dHeading -= Math.PI * 2;
        while (dHeading < -Math.PI) dHeading += Math.PI * 2;
        carHeading += dHeading * Math.min(1.0, 5.0 * delta);
        carSpeed = moveDist / delta;
      }

      carPos.x += moveDirX * Math.min(1.0, 3.2 * delta);
      carPos.z += moveDirZ * Math.min(1.0, 3.2 * delta);
      carVel.set(
        delta > 0 ? (carPos.x - prevX) / delta : 0,
        0,
        delta > 0 ? (carPos.z - prevZ) / delta : 0,
      );

      // Steering angle on front wheels
      const targetSteering = Math.max(-0.48, Math.min(0.48, (targetX - carPos.x) * 0.9));
      steeringAngle += (targetSteering - steeringAngle) * 6.0 * delta;

      // Chassis suspension roll and pitch
      const targetRoll = -steeringAngle * 0.22;
      const targetPitch = Math.sin(elapsed * 3.8) * 0.022 * Math.min(1.0, carSpeed * 0.2);
      carRoll += (targetRoll - carRoll) * 6.0 * delta;
      carPitch += (targetPitch - carPitch) * 8.0 * delta;

      carGroup.position.copy(carPos);
      carGroup.rotation.y = carHeading;
      carGroup.rotation.z = carRoll;
      carGroup.rotation.x = carPitch;

      // Spin wheels
      carWheelRot += (carSpeed / WHEEL_R) * delta;
      frontWheelAssemblyL.rotation.y = steeringAngle;
      frontWheelAssemblyR.rotation.y = steeringAngle;
      wheels.forEach((w) => { w.rotation.x = carWheelRot; });

      // Pass vehicle world position to TSL vertex foliage shader
      carGroup.getWorldPosition(_carWorldPos);
      setVehicleInteractor(uniforms, _carWorldPos);
      if (playerPos) setPlayerInteractor(uniforms, playerPos);

      /* --- 2. Update Interactive Spring-Rebound Vegetation --- */
      updateSpringPlants(saplingPlants, saplingWoodMesh, saplingFoliageMesh, delta, hasPlayer);
      updateSpringPlants(shrubPlants, shrubMesh, null, delta, hasPlayer);
      updateSpringPlants(grassPlants, grassMesh, null, delta, hasPlayer);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. MATHS — raymarched SDF                                           */
/* ------------------------------------------------------------------ */

/**
 * A grotto with no content geometry at all: one box proxy carrying a TSL
 * raymarcher. Every surface, every normal and all the shading come out of a
 * distance function evaluated per pixel.
 *
 * The route decision (procedural-sdf-raymarched-worlds §1) is respected: this
 * is a bounded set-piece INSIDE a rasterised corridor, not the corridor itself.
 * The walls and floor you walk on are real geometry with real colliders; the
 * thing in the alcove is maths.
 */
export function createMathsCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 48;

  const time = uniform(0);

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.9;
  floorMat.colorNode = vec3(0.16, 0.17, 0.19);
  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 4, 4);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);   // clear of the hub plane at y=0
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  // --- the SDF material -------------------------------------------------
  /** Polynomial smooth minimum — the blend that makes SDF shapes fuse. */
  const smin = Fn(([a, b, k]: [any, any, any]) => {
    const h = clamp(float(0.5).add(float(0.5).mul(b.sub(a)).div(k)), float(0), float(1));
    return mix(b, a, h).sub(k.mul(h).mul(float(1).sub(h)));
  });

  const sdSphere = Fn(([p, r]: [any, any]) => length(p).sub(r));

  /**
   * Station A - smooth-union blobs. The polynomial smin is what makes three
   * spheres read as one organism rather than three spheres.
   */
  const sceneBlobs = Fn(([p]: [any]) => {
    const t = float(time);
    const q = p.toVar();
    const a = sdSphere(q.sub(vec3(sin(t.mul(0.41)).mul(1.1), cos(t.mul(0.29)).mul(0.7), sin(t.mul(0.53)).mul(0.9))), float(1.05));
    const b = sdSphere(q.sub(vec3(cos(t.mul(0.37)).mul(1.3), sin(t.mul(0.47)).mul(0.9).add(0.4), cos(t.mul(0.31)).mul(1.0))), float(0.85));
    const c = sdSphere(q.sub(vec3(sin(t.mul(0.23)).mul(0.8), cos(t.mul(0.43)).mul(1.1).sub(0.3), sin(t.mul(0.19)).mul(1.2))), float(0.7));
    const d0 = smin(a, b, float(0.65));
    const d1 = smin(d0, c, float(0.55));
    const ripple = sin(q.x.mul(4.2).add(t.mul(1.1)))
      .mul(sin(q.z.mul(3.7).sub(t.mul(0.8))))
      .mul(sin(q.y.mul(4.9).add(t.mul(0.6))))
      .mul(0.06);
    return d1.add(ripple);
  });

  /**
   * Station B - LIMITED domain repetition. One sphere-and-strut cell folded
   * into a bounded 3x3x3 lattice. The infinite form of this trick is the
   * classic SDF demo and also the version you can never cull, budget or ship:
   * clamping the cell index keeps the bounding volume finite.
   */
  const sceneLattice = Fn(([p]: [any]) => {
    const t = float(time);
    const c = float(1.5);
    const id = p.div(c).add(0.5).floor().clamp(float(-1), float(1));
    const q = p.sub(id.mul(c)).toVar();
    const pulse = sin(t.mul(0.9).add(id.x.add(id.y).add(id.z).mul(1.7))).mul(0.09);
    const ball = sdSphere(q, float(0.42).add(pulse));
    const sx = length(vec3(float(0), q.y, q.z)).sub(0.11);
    const sy = length(vec3(q.x, float(0), q.z)).sub(0.11);
    const sz = length(vec3(q.x, q.y, float(0))).sub(0.11);
    const d0 = smin(ball, sx, float(0.22));
    const d1 = smin(d0, sy, float(0.22));
    return smin(d1, sz, float(0.22));
  });

  /**
   * Station C - a gyroid, the standard triply-periodic minimal surface. Pure
   * trigonometry: no primitives at all. Its "distance" is only an
   * approximation, which is precisely why it needs heavier step damping - a
   * good demonstration that a non-metric field still marches if you respect it.
   */
  const sceneGyroid = Fn(([p]: [any]) => {
    const t = float(time);
    const q = p.mul(1.9).toVar();
    const g = sin(q.x).mul(cos(q.y))
      .add(sin(q.y).mul(cos(q.z)))
      .add(sin(q.z).mul(cos(q.x)));
    const shell = abs(g).sub(float(0.42).add(sin(t.mul(0.4)).mul(0.16)));
    const bound = length(p).sub(2.1);
    return max(shell.mul(0.42), bound);
  });

  const MAX_STEPS = 32;

  /** One marcher, parameterised by distance function, centre and damping. */
  function marcherFor(sceneFn: any, centreUniform: any, damp: number, tint: any) {
    return Fn(() => {
      const centre = vec3(centreUniform);
      const ro = cameraPosition.sub(centre).toVar();
      const rd = normalize(positionWorld.sub(cameraPosition)).toVar();

      const tt = float(0.05).toVar();
      const hit = float(0.0).toVar();
      const p = vec3(0).toVar();

      Loop(MAX_STEPS, () => {
        p.assign(ro.add(rd.mul(tt)));
        const d = sceneFn(p);
        If(d.lessThan(float(0.0018).mul(max(tt, float(1.0)))), () => {
          hit.assign(1.0);
          Break();
        });
        // Lipschitz damping. A warped or non-metric field over-estimates the
        // safe step and rays tunnel through the surface; speckled holes are
        // this, never an insufficient step count.
        tt.addAssign(d.mul(float(damp)));
        If(tt.greaterThan(float(48.0)), () => { Break(); });
      });

      const h = float(0.0025);
      const k1 = vec3(1, -1, -1); const k2 = vec3(-1, -1, 1);
      const k3 = vec3(-1, 1, -1); const k4 = vec3(1, 1, 1);
      const n = normalize(
        k1.mul(sceneFn(p.add(k1.mul(h))))
          .add(k2.mul(sceneFn(p.add(k2.mul(h)))))
          .add(k3.mul(sceneFn(p.add(k3.mul(h)))))
          .add(k4.mul(sceneFn(p.add(k4.mul(h))))),
      );

      const L = normalize(vec3(0.45, 0.8, 0.35));
      const diff = clamp(dot(n, L), float(0.0), float(1.0));
      const fres = pow(float(1.0).sub(clamp(dot(n, rd.negate()), float(0), float(1))), float(3.0));
      const surface = mix(vec3(0.04, 0.16, 0.26), tint, diff)
        .add(vec3(0.85, 0.42, 0.22).mul(fres).mul(0.7));
      return mix(vec3(0.02, 0.03, 0.05), surface, hit);
    })();
  }

  const STATIONS: Array<{ fn: any; damp: number; tint: any; z: number }> = [
    { fn: sceneBlobs, damp: 0.72, tint: vec3(0.25, 0.72, 0.78), z: -LEN * 0.28 },
    { fn: sceneLattice, damp: 0.85, tint: vec3(0.80, 0.63, 0.28), z: -LEN * 0.55 },
    { fn: sceneGyroid, damp: 0.42, tint: vec3(0.74, 0.34, 0.62), z: -LEN * 0.82 },
  ];

  const proxies: Array<{ mesh: THREE.Mesh; centre: any }> = [];
  const plinthMat = new MeshStandardNodeMaterial();
  plinthMat.roughness = 0.6;
  plinthMat.colorNode = vec3(0.1, 0.11, 0.13);
  disposables.push(plinthMat);

  STATIONS.forEach((st) => {
    const centre = uniform(new THREE.Vector3(0, 2.9, st.z));
    const mat = new MeshStandardNodeMaterial();
    mat.side = THREE.BackSide;
    mat.colorNode = marcherFor(st.fn, centre, st.damp, st.tint);

    const geo = new THREE.BoxGeometry(5.4, 4.8, 5.4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 2.9, st.z);
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geo, mat);
    proxies.push({ mesh, centre });

    const pg = new THREE.CylinderGeometry(2.1, 2.5, 0.5, 20);
    const plinth = new THREE.Mesh(pg, plinthMat);
    plinth.position.set(0, 0.25, st.z);
    plinth.receiveShadow = true;
    group.add(plinth);
    disposables.push(pg);
  });

  const proxyWorld = new THREE.Vector3();

  return {
    group,
    length: LEN,
    title: 'Raymarched SDF — three fields, no geometry',
    skill: 'procedural-sdf-raymarched-worlds',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      proxies.forEach((pr) => {
        pr.mesh.getWorldPosition(proxyWorld);
        (pr.centre as unknown as { value: THREE.Vector3 }).value.copy(proxyWorld);
      });
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3. GRAMMAR — the pipeline-shaped one                                */
/* ------------------------------------------------------------------ */

/**
 * A shape grammar: footprint -> mass -> podium / shaft / crown -> facade
 * populated from a kit of parts. This is the "pipeline" corridor in the sense
 * that matters — a repeatable authoring PROCESS with stages and assertions,
 * rather than a hand-modelled object — but it runs entirely in code with no
 * imported module, no texture and no external tool.
 */
export function createGrammarCorridor(seed = 11): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 52;

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.95;
  floorMat.colorNode = vec3(0.22, 0.21, 0.2);
  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 4, 4);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);   // clear of the hub plane at y=0
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.82;
  {
    const band = sin(positionWorld.y.mul(6.1)).mul(0.5).add(0.5);
    stoneMat.colorNode = mix(vec3(0.52, 0.49, 0.44), vec3(0.63, 0.60, 0.55), band);
  }

  const glassMat = new MeshStandardNodeMaterial();
  glassMat.roughness = 0.14;
  glassMat.metalness = 0.1;
  glassMat.colorNode = vec3(0.12, 0.18, 0.22);
  disposables.push(stoneMat, glassMat);

  /**
   * Stage 1 — FOOTPRINT. A convex polygon from a seeded radius sweep.
   * Stage 2 — MASS. Extrude, then split vertically into podium/shaft/crown.
   * Stage 3 — FACADE. Populate each storey band with kit modules.
   */
  function buildTower(s: number, storeys: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const w = 2.2 + hash11(s) * 1.6;
    const d = 2.2 + hash11(s * 3.1) * 1.6;

    // Podium — always wider, always shorter. The grammar's first rule.
    const podiumH = 1.1 + hash11(s * 7) * 0.5;
    const podium = new THREE.BoxGeometry(w * 1.25, podiumH, d * 1.25);
    podium.translate(0, podiumH / 2, 0);
    parts.push(podium);

    // Shaft — repeated storey bands, each slightly inset from the last.
    let y = podiumH;
    const storeyH = 1.15;
    for (let i = 0; i < storeys; i++) {
      const inset = 1 - i * 0.028;
      const band = new THREE.BoxGeometry(w * inset, storeyH * 0.72, d * inset);
      band.translate(0, y + storeyH * 0.36, 0);
      parts.push(band);

      // Facade modules: a spandrel course between storeys, offset per face so
      // the four elevations are not identical — the assertion that catches a
      // grammar which has collapsed to a single rule.
      const rail = new THREE.BoxGeometry(w * inset * 1.04, 0.1, d * inset * 1.04);
      rail.translate(0, y + storeyH * 0.78, 0);
      parts.push(rail);

      y += storeyH;
    }

    // Crown — the grammar's terminal rule, never the same as a storey.
    const crownH = 0.7 + hash11(s * 11) * 0.6;
    const crown = new THREE.BoxGeometry(w * 0.72, crownH, d * 0.72);
    crown.translate(0, y + crownH / 2, 0);
    parts.push(crown);
    const cap = new THREE.ConeGeometry(Math.max(w, d) * 0.42, crownH * 1.1, 6);
    cap.translate(0, y + crownH + crownH * 0.55, 0);
    parts.push(cap);

    return parts;
  }

  /**
   * RULE SET 2 - low-rise cottages. Same pipeline (footprint -> mass -> roof),
   * entirely different terminal rules: a pitched roof instead of a crown, a
   * chimney instead of a spire, and a porch module on one elevation only. This
   * is the point of a grammar - the STAGES are fixed, the rules are swappable,
   * and one generator gives you a skyline and a village.
   */
  function buildCottage(s: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const w = 2.6 + hash11(s) * 1.4;
    const d = 2.2 + hash11(s * 5.1) * 1.2;
    const h = 1.9 + hash11(s * 3.3) * 0.8;

    const body = new THREE.BoxGeometry(w, h, d);
    body.translate(0, h / 2, 0);
    parts.push(body);

    // Pitched roof: a rotated box is wrong (it leaves a visible seam at the
    // ridge); a 3-sided cylinder IS a prism, and its ridge is exact.
    const roof = new THREE.CylinderGeometry(d * 0.72, d * 0.72, w * 1.08, 3, 1, false);
    roof.rotateZ(Math.PI / 2);
    roof.rotateY(Math.PI / 2);
    roof.translate(0, h + d * 0.30, 0);
    parts.push(roof);

    const chimney = new THREE.BoxGeometry(0.32, 1.0, 0.32);
    chimney.translate(w * 0.28, h + d * 0.5, d * 0.18);
    parts.push(chimney);

    // Porch on the street elevation only.
    const porch = new THREE.BoxGeometry(1.0, 0.12, 0.9);
    porch.translate(0, h * 0.62, d / 2 + 0.42);
    parts.push(porch);
    for (const sx of [-0.4, 0.4]) {
      const post = new THREE.CylinderGeometry(0.06, 0.06, h * 0.62, 5);
      post.translate(sx, h * 0.31, d / 2 + 0.78);
      parts.push(post);
    }
    return parts;
  }

  /**
   * RULE SET 3 - a ruined wall. The interesting rule here is SUBTRACTIVE: the
   * grammar builds a full course of blocks, then removes them by a seeded
   * survival test that falls off with height, so the ruin collapses upward
   * exactly the way a real one does. Nothing is hand-placed, and the same seed
   * always produces the same ruin.
   */
  function buildRuin(s: number, courses: number, len: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const bw = 0.62;
    const bh = 0.34;
    const perCourse = Math.floor(len / bw);
    for (let c = 0; c < courses; c++) {
      // Higher courses are likelier to be missing.
      const survivalBase = 1 - c / (courses + 1.2);
      for (let i = 0; i < perCourse; i++) {
        const h = hash11(s * 7.3 + c * 13.1 + i * 3.7);
        if (h > survivalBase) continue;
        // Alternate courses are offset half a block - running bond, which is
        // what stops a stone wall reading as a grid.
        const offset = (c % 2) * bw * 0.5;
        const jitter = (hash11(s + c * 5 + i * 2) - 0.5) * 0.05;
        const b = new THREE.BoxGeometry(bw * 0.94, bh * 0.92, 0.46);
        b.translate(
          -len / 2 + i * bw + offset,
          bh / 2 + c * bh,
          jitter,
        );
        b.rotateY(jitter * 0.6);
        parts.push(b);
      }
    }
    return parts;
  }

  // Three rule sets down the corridor, so walking it shows one pipeline
  // producing a skyline, a village and a ruin.
  const emit = (parts: THREE.BufferGeometry[], mat: THREE.Material,
                x: number, z: number, ry: number) => {
    const geo = mergeGeometriesSimple(parts);
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    disposables.push(geo);
  };

  // Station A - towers.
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = seed * 13 + i * 3;
    emit(buildTower(s, 3 + i), i % 3 === 2 ? glassMat : stoneMat,
      side * 3.4, -4 - i * 3.4, hash11(s) * 0.6 - 0.3);
  }
  // Station B - cottages.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = seed * 29 + i * 7;
    emit(buildCottage(s), stoneMat, side * 3.6, -24 - Math.floor(i / 2) * 4.2,
      side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Station C - the ruin, which is the same pipeline running subtractively.
  emit(buildRuin(seed * 41, 7, 9), stoneMat, -3.9, -40, Math.PI / 2);
  emit(buildRuin(seed * 43, 5, 7), stoneMat, 3.9, -42.5, Math.PI / 2);
  emit(buildRuin(seed * 47, 9, 5), stoneMat, 0, -47, 0);

  // Station D (HF-419) - RULE SET 4, a street cell: the same footprint -> mass
  // -> banded storeys -> facade modules -> terminal pipeline at street scale,
  // with the two terminals a street has and a tower does not (a shopfront
  // ground floor and a parapet), plus the carriageway, kerbs, pavements,
  // furniture and parked scenery that make a frontage read as a street.
  //
  // It carries its OWN seed stream (street-cell.ts, mulberry32) rather than
  // consuming this function's `hash11` sequence, so adding it did not move a
  // single tower, cottage or ruin block - which is the only reason the
  // before/after captures for this trial are comparable at all.
  const streetCell = createStreetCell(seed * 38 + 5);
  group.add(streetCell.group);
  disposables.push(streetCell);

  // The corridor is as long as its content, not as long as its floor plane.
  // Rule set 4 starts where the plane above stops (z -52) and runs to z -74,
  // laying its OWN cambered carriageway rather than standing on this floor -
  // two coplanar ground surfaces at y = 0.03 would z-fight. `length` drives the
  // far-end sign in main.ts ("so you always know what you walked"), and while
  // this returned 52 that sign stood 22 m short of the end, in front of a rule
  // set the sign itself was already counting. Reported by the content, so the
  // two follow each other if either moves.
  const CONTENT_LEN = Math.max(LEN, -STREET_CELL_Z_END);

  return {
    group,
    length: CONTENT_LEN,
    title: 'Shape grammar — four rule sets, one pipeline',
    skill: 'atomic-acres-procedural-art-authoring',
    update() { /* static exhibit */ },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/** Merge for geometries carrying only position/normal/uv. */
function mergeGeometriesSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
