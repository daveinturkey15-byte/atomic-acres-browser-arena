/**
 * trees.ts — a small family of genuinely different silhouettes, instanced.
 *
 *   broadleaf  — tapered trunk with three branches, three-lobed canopy of
 *                alpha-cut leaf-cluster cards (oak/maple atlas cells)
 *   conifer    — trunk plus six ragged-rim needle tiers and a leader
 *   birch      — thin pale trunk, tall narrow canopy of small-leaf cards
 *   far cards  — crossed silhouette cards on the foothills past 95 m
 *
 * Two draws per near species (bark bucket, foliage bucket), two for the far
 * cards. Placement is seeded, grove-clustered, keeps a minimum separation
 * and never enters the playable rectangle plus margin. Every tree stands on
 * `terrainHeight()`. Wind is a per-vertex `windWeight` attribute read by the
 * shared material graph — no JS leaf loops.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coastalFactor, outsidePlayableMargin, rockiness, terrainHeight, waterDepthAt } from './layout';
import { createSurfaceMaterial, type NatureUniforms } from './materials';
import { mulberry32 } from './seeded';
import type { NatureTextures } from './textures';

export type TreeFamily = Readonly<{
  group: THREE.Group;
  triangles: number;
  drawGroups: number;
  counts: Readonly<{ broadleaf: number; conifer: number; birch: number; far: number }>;
  /** Trunk feet (x, z) of every near tree — for the placement tests. */
  feet: ReadonlyArray<readonly [number, number]>;
  dispose: () => void;
}>;

export const NEAR_BAND = Object.freeze({ innerR: 48, outerR: 108 });
export const FAR_BAND = Object.freeze({ innerR: 96, outerR: 250 });
export const TREE_MIN_SEPARATION_M = 3.4;
export const TREELINE_M = 78;
export const TREE_COUNTS = Object.freeze({ broadleaf: 58, conifer: 88, birch: 46, shorePines: 10, far: 720 });

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function addWindWeight(geom: THREE.BufferGeometry, weightAt: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const w = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) w[i] = weightAt(pos.getX(i), pos.getY(i), pos.getZ(i));
  geom.setAttribute('windWeight', new THREE.BufferAttribute(w, 1));
  return geom;
}

function scaleUv(geom: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

function setUvCell(geom: THREE.BufferGeometry, cx: number, cy: number, cellsX: number, cellsY: number): void {
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (cx + uv.getX(i)) / cellsX, (cy + uv.getY(i)) / cellsY);
  }
}

/** Merge transformed parts (all forced non-indexed — the skill's mergeGeometries rule). */
function mergeParts(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error(`${name}: mergeGeometries returned null`);
  for (const p of parts) p.dispose();
  merged.name = name;
  merged.computeBoundingSphere();
  return merged;
}

export function triangleCount(geom: THREE.BufferGeometry): number {
  return geom.index ? geom.index.count / 3 : geom.getAttribute('position').count / 3;
}

function card(width: number, height: number, cell: number, rng: () => number, centre: THREE.Vector3, windWeight: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  setUvCell(g, cell % 2, Math.floor(cell / 2), 2, 2);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(rng() * 1.2 - 0.6, rng() * Math.PI * 2, rng() * 0.8 - 0.4);
  m.makeRotationFromEuler(e);
  m.setPosition(centre);
  g.applyMatrix4(m);
  return addWindWeight(g, () => windWeight);
}

// ---------------------------------------------------------------------------
// Species prototypes
// ---------------------------------------------------------------------------

export function createBroadleafGeometry(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const rng = mulberry32(0xb20a_d1ea);
  const trunkParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.15, 0.36, 3.6, 9, 3);
  trunk.translate(0, 1.8, 0);
  scaleUv(trunk, 2, 2.4);
  trunkParts.push(addWindWeight(trunk, (_x, y) => Math.max(0, (y - 2.2) / 6)));
  for (let b = 0; b < 3; b += 1) {
    const branch = new THREE.CylinderGeometry(0.05, 0.13, 2.3, 6, 1);
    branch.translate(0, 1.15, 0);
    scaleUv(branch, 1, 1.6);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.55 + rng() * 0.25, b * 2.1 + rng() * 0.5, 0, 'YXZ'));
    m.setPosition(0, 3.1 + b * 0.25, 0);
    branch.applyMatrix4(m);
    trunkParts.push(addWindWeight(branch, (_x, y) => Math.max(0, (y - 3) / 5) * 0.4));
  }
  const canopyParts: THREE.BufferGeometry[] = [];
  const lobes: Array<[number, number, number, number]> = [[0, 4.9, 0, 1.55], [1.25, 4.25, 0.6, 1.2], [-1.0, 4.5, -0.85, 1.25], [0.2, 5.9, -0.3, 1.0]];
  const centre = new THREE.Vector3();
  for (const [lx, ly, lz, lr] of lobes) {
    for (let i = 0; i < 8; i += 1) {
      const u = rng() * 2 - 1;
      const phi = rng() * Math.PI * 2;
      const rad = lr * Math.cbrt(rng());
      const s = Math.sqrt(1 - u * u);
      centre.set(lx + Math.cos(phi) * s * rad, ly + u * rad * 0.8, lz + Math.sin(phi) * s * rad);
      const reach = Math.min(1, Math.hypot(centre.x, centre.z) / 2.6);
      canopyParts.push(card(1.5 + rng() * 0.5, 1.3 + rng() * 0.5, rng() < 0.6 ? 0 : 1, rng, centre, 0.45 + reach * 0.55));
    }
  }
  return {
    trunk: mergeParts(trunkParts, 'ws-nature-broadleaf-trunk'),
    canopy: mergeParts(canopyParts, 'ws-nature-broadleaf-canopy'),
  };
}

export function createConiferGeometry(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const rng = mulberry32(0xc0_1f3a);
  const trunk = new THREE.CylinderGeometry(0.08, 0.32, 9.4, 7, 1);
  trunk.translate(0, 4.7, 0);
  scaleUv(trunk, 2, 5);
  addWindWeight(trunk, (_x, y) => Math.max(0, (y - 5) / 12));
  const tiers: THREE.BufferGeometry[] = [];
  const tierCount = 6;
  for (let i = 0; i < tierCount; i += 1) {
    const radius = 2.3 - i * 0.32;
    const height = 2.0 - i * 0.12;
    const cone = new THREE.ConeGeometry(radius, height, 9, 1, true);
    const pos = cone.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v += 1) {
      if (pos.getY(v) < 0) {
        const k = 0.78 + rng() * 0.36;
        pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) + (rng() - 0.5) * 0.25, pos.getZ(v) * k);
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, 1.6 + i * 1.28 + height / 2, 0);
    scaleUv(cone, 3, 1);
    const w = 0.04 + (i / tierCount) * 0.22;
    tiers.push(addWindWeight(cone, (_x, y, _z) => (y > 1.6 + i * 1.28 + height * 0.9 ? w * 0.4 : w)));
  }
  const leader = new THREE.ConeGeometry(0.5, 1.6, 7, 1, false);
  leader.translate(0, 1.6 + tierCount * 1.28 + 0.6, 0);
  tiers.push(addWindWeight(leader, () => 0.3));
  return {
    trunk: addWindWeight(trunk, (_x, y) => Math.max(0, (y - 5) / 12)),
    canopy: mergeParts(tiers, 'ws-nature-conifer-canopy'),
  };
}

export function createBirchGeometry(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const rng = mulberry32(0xb1_2c4e);
  const trunk = new THREE.CylinderGeometry(0.06, 0.17, 7.4, 7, 3);
  trunk.translate(0, 3.7, 0);
  scaleUv(trunk, 1.5, 4);
  const lean = new THREE.Matrix4().makeRotationZ(0.06);
  trunk.applyMatrix4(lean);
  addWindWeight(trunk, (_x, y) => Math.max(0, (y - 3) / 9) * 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3();
  for (let i = 0; i < 18; i += 1) {
    const u = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = Math.cbrt(rng());
    centre.set(Math.cos(phi) * s * rad * 1.15 + 0.3, 6.0 + u * 2.0, Math.sin(phi) * s * rad * 1.15);
    parts.push(card(1.1 + rng() * 0.4, 1.4 + rng() * 0.5, 2, rng, centre, 0.6 + rad * 0.4));
  }
  return { trunk, canopy: mergeParts(parts, 'ws-nature-birch-canopy') };
}

export function createFarCardGeometry(cell: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  for (const g of [a, b]) {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (cell + uv.getX(i)) / 2, uv.getY(i));
    addWindWeight(g, (_x, y) => y * 0.25);
  }
  return mergeParts([a, b], `ws-nature-far-card-${cell}`);
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

type Slot = { x: number; z: number; yaw: number; scale: number; tone: number; tilt: number };

function scatterNear(
  count: number,
  rng: () => number,
  accept: (x: number, z: number) => boolean,
  placed: Array<readonly [number, number]>,
  minSep: number,
): Slot[] {
  const out: Slot[] = [];
  let attempts = 0;
  // Grove clustering: a fifth of the slots seed groves, the rest scatter
  // around the last accepted grove centre with decreasing probability.
  let groveX = 0;
  let groveZ = 0;
  let inGrove = 0;
  while (out.length < count && attempts < count * 90) {
    attempts += 1;
    let x: number;
    let z: number;
    if (inGrove > 0 && rng() < 0.7) {
      const a = rng() * Math.PI * 2;
      const d = minSep + rng() * 9;
      x = groveX + Math.cos(a) * d;
      z = groveZ + Math.sin(a) * d;
      inGrove -= 1;
    } else {
      const r = NEAR_BAND.innerR + rng() * (NEAR_BAND.outerR - NEAR_BAND.innerR);
      const a = rng() * Math.PI * 2;
      x = Math.sin(a) * r;
      z = -Math.cos(a) * r;
      groveX = x;
      groveZ = z;
      inGrove = 3 + Math.floor(rng() * 4);
    }
    const r = Math.hypot(x, z);
    if (r < NEAR_BAND.innerR || r > NEAR_BAND.outerR) continue;
    if (!accept(x, z)) continue;
    let tooClose = false;
    for (const [px, pz] of placed) {
      if (Math.hypot(x - px, z - pz) < minSep) { tooClose = true; break; }
    }
    if (tooClose) continue;
    placed.push([x, z]);
    out.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.45, tone: rng(), tilt: 0 });
  }
  return out;
}

function forestGround(x: number, z: number): boolean {
  return outsidePlayableMargin(x, z) && coastalFactor(x, z) < 0.35 && waterDepthAt(x, z) === 0 && terrainHeight(x, z) < TREELINE_M;
}

function shoreGround(x: number, z: number): boolean {
  return outsidePlayableMargin(x, z) && coastalFactor(x, z) > 0.6 && waterDepthAt(x, z) === 0 && Math.hypot(x, z) < 70;
}

const TONES: Readonly<Record<'broadleaf' | 'conifer' | 'birch' | 'bark', readonly number[]>> = Object.freeze({
  broadleaf: Object.freeze([0xffffff, 0xe8f0d0, 0xd8e6c4, 0xf2f6e0]),
  conifer: Object.freeze([0xffffff, 0xd0dcc8, 0xe6ecd8, 0xc4d4c0]),
  birch: Object.freeze([0xffffff, 0xf0f4dc, 0xe0ecd0, 0xf6f8ea]),
  bark: Object.freeze([0xffffff, 0xe6e0d8, 0xd8d2c8, 0xf0ece6]),
});

function fillInstances(
  mesh: THREE.InstancedMesh,
  slots: readonly Slot[],
  tones: readonly number[],
  sinkM: number,
): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    e.set(slot.tilt, slot.yaw, 0, 'YXZ');
    q.setFromEuler(e);
    const sink = sinkM + rockiness(slot.x, slot.z) * 0.45;
    p.set(slot.x, terrainHeight(slot.x, slot.z) - sink, slot.z);
    s.set(slot.scale * (0.9 + (i % 3) * 0.06), slot.scale, slot.scale * (0.9 + (i % 4) * 0.05));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.setHex(tones[Math.floor(slot.tone * tones.length) % tones.length]);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function tagMesh(mesh: THREE.Object3D, castShadow: boolean): void {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
}

export function createTreeFamily(textures: NatureTextures, uniforms: NatureUniforms): TreeFamily {
  const group = new THREE.Group();
  group.name = 'world-studio-nature-trees';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const barkMat = createSurfaceMaterial({ name: 'ws-nature-bark', map: textures.bark, roughness: 0.92, wind: { amplitudeM: 0.12, frequency: 0.9 }, snowResponse: 0.6 }, uniforms);
  const birchBarkMat = createSurfaceMaterial({ name: 'ws-nature-birch-bark', map: textures.birchBark, roughness: 0.8, wind: { amplitudeM: 0.18, frequency: 1.0 }, snowResponse: 0.6 }, uniforms);
  const leafMat = createSurfaceMaterial({ name: 'ws-nature-leaf', map: textures.leafAtlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, wind: { amplitudeM: 0.32, frequency: 1.15 }, snowResponse: 1, emissive: 0x1a2a10, emissiveIntensity: 0.08 }, uniforms);
  const needleMat = createSurfaceMaterial({ name: 'ws-nature-needle', map: textures.needles, side: THREE.DoubleSide, roughness: 0.85, wind: { amplitudeM: 0.22, frequency: 0.75 }, snowResponse: 1, emissive: 0x0e1c10, emissiveIntensity: 0.08 }, uniforms);
  const farMat = createSurfaceMaterial({ name: 'ws-nature-far-tree', map: textures.farTrees, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, wind: { amplitudeM: 0.5, frequency: 0.6 }, snowResponse: 1 }, uniforms);
  const materials = [barkMat, birchBarkMat, leafMat, needleMat, farMat];

  const broadleaf = createBroadleafGeometry();
  const conifer = createConiferGeometry();
  const birch = createBirchGeometry();
  const farConifer = createFarCardGeometry(0);
  const farBroadleaf = createFarCardGeometry(1);
  const geometries = [broadleaf.trunk, broadleaf.canopy, conifer.trunk, conifer.canopy, birch.trunk, birch.canopy, farConifer, farBroadleaf];

  const rng = mulberry32(0x7ee5_0912);
  const placed: Array<readonly [number, number]> = [];
  const broadleafSlots = scatterNear(TREE_COUNTS.broadleaf, rng, forestGround, placed, TREE_MIN_SEPARATION_M + 0.6);
  const coniferSlots = scatterNear(TREE_COUNTS.conifer, rng, forestGround, placed, TREE_MIN_SEPARATION_M);
  const birchSlots = scatterNear(TREE_COUNTS.birch, rng, forestGround, placed, TREE_MIN_SEPARATION_M);
  const shoreSlots = scatterNear(TREE_COUNTS.shorePines, rng, shoreGround, placed, TREE_MIN_SEPARATION_M + 1.5);
  for (const s of shoreSlots) { s.tilt = 0.12 + rng() * 0.1; s.scale *= 0.75; }
  const coniferAll = coniferSlots.concat(shoreSlots);

  const meshes: THREE.InstancedMesh[] = [];
  const build = (geom: THREE.BufferGeometry, mat: THREE.Material, slots: readonly Slot[], tones: readonly number[], name: string, sink: number, cast: boolean): void => {
    if (slots.length === 0) return;
    const mesh = new THREE.InstancedMesh(geom, mat, slots.length);
    mesh.name = name;
    fillInstances(mesh, slots, tones, sink);
    tagMesh(mesh, cast);
    group.add(mesh);
    meshes.push(mesh);
  };
  build(broadleaf.trunk, barkMat, broadleafSlots, TONES.bark, 'ws-nature-broadleaf-trunks', 0.2, true);
  build(broadleaf.canopy, leafMat, broadleafSlots, TONES.broadleaf, 'ws-nature-broadleaf-canopies', 0.2, true);
  build(conifer.trunk, barkMat, coniferAll, TONES.bark, 'ws-nature-conifer-trunks', 0.25, true);
  build(conifer.canopy, needleMat, coniferAll, TONES.conifer, 'ws-nature-conifer-canopies', 0.25, true);
  build(birch.trunk, birchBarkMat, birchSlots, TONES.bark, 'ws-nature-birch-trunks', 0.18, true);
  build(birch.canopy, leafMat, birchSlots, TONES.birch, 'ws-nature-birch-canopies', 0.18, false);

  // Far cards: seeded ring past the near band, foothills only, below the treeline.
  const farRng = mulberry32(0xfa2_c42d);
  const farA: Slot[] = [];
  const farB: Slot[] = [];
  let attempts = 0;
  while (farA.length + farB.length < TREE_COUNTS.far && attempts < TREE_COUNTS.far * 20) {
    attempts += 1;
    const r = FAR_BAND.innerR + Math.sqrt(farRng()) * (FAR_BAND.outerR - FAR_BAND.innerR);
    const a = farRng() * Math.PI * 2;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    if (coastalFactor(x, z) > 0.45 || waterDepthAt(x, z) > 0 || terrainHeight(x, z) > TREELINE_M) continue;
    const slot: Slot = { x, z, yaw: farRng() * Math.PI * 2, scale: 8 + farRng() * 7, tone: farRng(), tilt: 0 };
    (farRng() < 0.62 ? farA : farB).push(slot);
  }
  const fillFar = (geom: THREE.BufferGeometry, slots: Slot[], name: string): void => {
    if (slots.length === 0) return;
    const mesh = new THREE.InstancedMesh(geom, farMat, slots.length);
    mesh.name = name;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.yaw);
      p.set(slot.x, terrainHeight(slot.x, slot.z) - 0.4, slot.z);
      s.set(slot.scale * 0.55, slot.scale, slot.scale * 0.55);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.setHex(TONES.conifer[Math.floor(slot.tone * 4) % 4]);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    tagMesh(mesh, false);
    group.add(mesh);
    meshes.push(mesh);
  };
  fillFar(farConifer, farA, 'ws-nature-far-conifers');
  fillFar(farBroadleaf, farB, 'ws-nature-far-broadleafs');

  let triangles = 0;
  for (const mesh of meshes) triangles += triangleCount(mesh.geometry) * mesh.count;

  return Object.freeze({
    group,
    triangles,
    drawGroups: meshes.length,
    counts: Object.freeze({ broadleaf: broadleafSlots.length, conifer: coniferAll.length, birch: birchSlots.length, far: farA.length + farB.length }),
    feet: placed,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  });
}
