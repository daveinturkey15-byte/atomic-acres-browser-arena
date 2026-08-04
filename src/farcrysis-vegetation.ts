/**
 * farcrysis-vegetation.ts — Pass 69 dense THREE.js tropical jungle vegetation module.
 *
 * Exports:
 *   buildVegetation(scene: THREE.Group): void
 *   FARCRYSIS_VEGE_STATS(): { totalInstances: number; treeTypes: number; totalTriangles: number }
 *
 * Target: 200+ vegetation objects via InstancedMesh, 5+ distinct tree/palm types,
 * ground cover (ferns, grass, bushes), vines. PBR materials (MeshStandardMaterial).
 * Distributions: dense inland, thinning toward beach. All procedural — no copied IP.
 *
 * Presentation only — never adds colliders, shot surfaces, cover, or gameplay authority.
 * Mount from farcrysis.ts buildFarcrysis to add dense jungle dressing over the arena.
 */
import * as THREE from 'three';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOUNDS = FARCRYSIS_BOUNDS;
const MARGIN = 1.8;

/** Golden ratio conjugate — produces even angular distribution. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ---------------------------------------------------------------------------
// Module-level stats tracker (populated during buildVegetation, read by stats fn)
// ---------------------------------------------------------------------------

interface VegeStatAccumulator {
  totalInstances: number;
  treeTypeNames: Set<string>; // only distinct tree/palm types (not ground cover)
  totalTriangles: number;
}

let _s: VegeStatAccumulator = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0 };

function resetStats(): void {
  _s = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count rendered triangles for a BufferGeometry (instanced or single-use). */
function triCount(geometry: THREE.BufferGeometry): number {
  const idx = geometry.index;
  if (idx) return idx.count / 3;
  const pos = geometry.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

/** Shorthand for PBR material matching the art-lane palette style. */
function vegeMat(color: number, roughness = 0.88, metalness = 0.04): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Register an InstancedMesh in stats and apply art-layer conventions.
 *  Pass `treeType` only for distinct tree/palm types (not ground cover). */
function register(
  mesh: THREE.InstancedMesh,
  treeType?: string,
): THREE.InstancedMesh {
  _s.totalInstances += mesh.count;
  if (treeType) _s.treeTypeNames.add(treeType);
  _s.totalTriangles += triCount(mesh.geometry) * mesh.count;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

/**
 * Generate positions evenly distributed within a disc (Fibonacci lattice).
 * Used for trees that prefer the inland jungle core.
 */
function discPositions(count: number, maxRadius: number): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const radius = maxRadius * Math.sqrt((i + 0.5) / count);
    const theta = i * GOLDEN_ANGLE;
    let x = Math.cos(theta) * radius;
    let z = Math.sin(theta) * radius * 0.88;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
    result.push([x, z, theta]);
  }
  return result;
}

/**
 * Generate positions in an annular ring (Fibonacci-based).
 * Used for trees preferring the beach fringe or mid-ring transitions.
 */
function ringPositions(
  count: number,
  innerRadius: number,
  outerRadius: number,
): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    const theta = i * GOLDEN_ANGLE + (i % 5) * 0.22;
    let x = Math.cos(theta) * radius;
    let z = Math.sin(theta) * radius * 0.88;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
    result.push([x, z, theta]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. Palm trees — tall tropical palms (beach / outer ring)
// ---------------------------------------------------------------------------

function addPalms(root: THREE.Group): void {
  const count = 22;
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.34, 2.8, 8);
  const frondGeom = new THREE.BoxGeometry(3.2, 0.16, 3.2);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(FARCRYSIS_ART_FEEL.palmTrunk, 0.88, 0.03), count);
  trunks.name = 'farcrysis-vege-palm-trunks';
  const fronds = new THREE.InstancedMesh(frondGeom, vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.85, 0.02), count);
  fronds.name = 'farcrysis-vege-palm-fronds';

  const tMat = new THREE.Matrix4();
  const fMat = new THREE.Matrix4();
  const positions = ringPositions(count, 19, 30);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const baseY = 1.4;
    const frondY = baseY + 2.7;
    const lean = (i % 3 === 0 ? 0.07 : -0.06) * (Math.sin(angle) * 0.25);

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, angle + 0.3, 0)),
      new THREE.Vector3(0.85 + (i % 3) * 0.12, 1.0, 0.85 + (i % 3) * 0.12),
    );
    trunks.setMatrixAt(i, tMat);

    fMat.compose(
      new THREE.Vector3(x, frondY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 1.3 + i * 0.15, 0)),
      new THREE.Vector3(0.85 + (i % 4) * 0.1, 1.0, 0.85 + ((i + 1) % 4) * 0.1),
    );
    fronds.setMatrixAt(i, fMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'palm'));
  root.add(register(fronds, 'palm'));
}

// ---------------------------------------------------------------------------
// 2. Broadleaf jungle trees — thick trunk + wide canopy (inland)
// ---------------------------------------------------------------------------

function addBroadleafTrees(root: THREE.Group): void {
  const count = 28;
  const trunkGeom = new THREE.CylinderGeometry(0.22, 0.44, 2.6, 10);
  const canopyGeom = new THREE.SphereGeometry(1.0, 10, 6);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x6b4e30, 0.92, 0.02), count);
  trunks.name = 'farcrysis-vege-broadleaf-trunks';
  const canopies = new THREE.InstancedMesh(canopyGeom, vegeMat(0x3a6e32, 0.88, 0.01), count);
  canopies.name = 'farcrysis-vege-broadleaf-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = discPositions(count, 20);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const baseY = 1.3;
    const canopyY = baseY + 2.4;
    const twist = angle + (i % 7) * 0.35;

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, twist, 0)),
      new THREE.Vector3(0.8 + (i % 5) * 0.12, 0.9 + (i % 4) * 0.08, 0.8 + (i % 5) * 0.12),
    );
    trunks.setMatrixAt(i, tMat);

    // Canopy: squashed sphere (wider than tall), slight random rotation
    const cScale = 1.2 + (i % 5) * 0.14;
    cMat.compose(
      new THREE.Vector3(x, canopyY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.22, twist * 0.7, 0)),
      new THREE.Vector3(cScale, 0.55 + (i % 3) * 0.15, cScale * 0.92),
    );
    canopies.setMatrixAt(i, cMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'broadleaf'));
  root.add(register(canopies, 'broadleaf'));
}

// ---------------------------------------------------------------------------
// 3. Conifer / cypress — tall columnar evergreen (mid ring)
// ---------------------------------------------------------------------------

function addConifers(root: THREE.Group): void {
  const count = 20;
  const coneGeom = new THREE.ConeGeometry(0.42, 3.6, 10, 1);

  const cones = new THREE.InstancedMesh(coneGeom, vegeMat(0x2a5528, 0.9, 0.02), count);
  cones.name = 'farcrysis-vege-conifers';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 16);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.14;
    matrix.compose(
      new THREE.Vector3(x, 1.8, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(s, 0.85 + (i % 4) * 0.1, s),
    );
    cones.setMatrixAt(i, matrix);
  }

  cones.instanceMatrix.needsUpdate = true;
  root.add(register(cones, 'conifer'));
}

// ---------------------------------------------------------------------------
// 4. Banana plants — short trunk + broad flat leaves (inland clusters)
// ---------------------------------------------------------------------------

function addBananaPlants(root: THREE.Group): void {
  const plantCount = 14;
  const leavesPerPlant = 4;
  const leafCount = plantCount * leavesPerPlant;

  const trunkGeom = new THREE.CylinderGeometry(0.1, 0.2, 1.6, 7);
  const leafGeom = new THREE.BoxGeometry(2.2, 0.07, 0.65);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x7a9a38, 0.85, 0.02), plantCount);
  trunks.name = 'farcrysis-vege-banana-trunks';
  const leaves = new THREE.InstancedMesh(leafGeom, vegeMat(0x4d8c2a, 0.82, 0.02), leafCount);
  leaves.name = 'farcrysis-vege-banana-leaves';

  const tMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = discPositions(plantCount, 14);

  for (let p = 0; p < plantCount; p += 1) {
    const [x, z, baseAngle] = positions[p];
    const baseY = 0.8;
    const leafY = baseY + 1.55;

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, baseAngle, 0)),
      new THREE.Vector3(0.85 + (p % 3) * 0.12, 1.0, 0.85 + (p % 3) * 0.12),
    );
    trunks.setMatrixAt(p, tMat);

    for (let l = 0; l < leavesPerPlant; l += 1) {
      const leafAngle = baseAngle + (l / leavesPerPlant) * Math.PI * 2 + (p % 3) * 0.25;
      const tilt = 0.2 + (l % 3) * 0.15; // slight upward/downward tilt
      const leafIdx = p * leavesPerPlant + l;
      lMat.compose(
        new THREE.Vector3(x, leafY + tilt * 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, leafAngle, 0)),
        new THREE.Vector3(0.8 + (p % 4) * 0.12, 1.0, 0.85 + (l % 3) * 0.1),
      );
      leaves.setMatrixAt(leafIdx, lMat);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'banana'));
  root.add(register(leaves, 'banana'));
}

// ---------------------------------------------------------------------------
// 5. Bamboo clusters — thin tall cylinders in small groups (dense inland)
// ---------------------------------------------------------------------------

function addBamboo(root: THREE.Group): void {
  const clusters = 7;
  const stemsPerCluster = 5;
  const count = clusters * stemsPerCluster;

  const stemGeom = new THREE.CylinderGeometry(0.05, 0.07, 2.8, 6);

  const stems = new THREE.InstancedMesh(stemGeom, vegeMat(0x6a8a3a, 0.84, 0.03), count);
  stems.name = 'farcrysis-vege-bamboo-stems';

  const matrix = new THREE.Matrix4();
  const clusterCenters = discPositions(clusters, 13);

  for (let c = 0; c < clusters; c += 1) {
    const [cx, cz, ca] = clusterCenters[c];
    for (let s = 0; s < stemsPerCluster; s += 1) {
      const offsetAngle = (s / stemsPerCluster) * Math.PI * 2 + ca;
      const offsetRadius = 0.25 + (s % 3) * 0.18;
      const sx = cx + Math.cos(offsetAngle) * offsetRadius;
      const sz = cz + Math.sin(offsetAngle) * offsetRadius;
      const heightScale = 0.85 + (s % 4) * 0.1;
      const idx = c * stemsPerCluster + s;

      matrix.compose(
        new THREE.Vector3(sx, 1.4 * heightScale, sz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, offsetAngle + s * 0.3, 0)),
        new THREE.Vector3(0.8 + (s % 3) * 0.12, heightScale, 0.8 + (s % 3) * 0.12),
      );
      stems.setMatrixAt(idx, matrix);
    }
  }

  stems.instanceMatrix.needsUpdate = true;
  root.add(register(stems, 'bamboo'));
}

// ---------------------------------------------------------------------------
// 6. Dead / rotted trees — leaning, leafless (scattered, thin toward beach)
// ---------------------------------------------------------------------------

function addDeadTrees(root: THREE.Group): void {
  const count = 10;
  const trunkGeom = new THREE.CylinderGeometry(0.14, 0.24, 2.4, 7);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x6e6258, 0.94, 0.05), count);
  trunks.name = 'farcrysis-vege-dead-trunks';

  const matrix = new THREE.Matrix4();
  const positions = ringPositions(count, 6, 24);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    // Lean the dead tree significantly
    const leanAngle = 0.3 + (i % 4) * 0.15;
    const leanDir = angle + (i % 3) * 0.6;
    const s = 0.7 + (i % 3) * 0.2;

    matrix.compose(
      new THREE.Vector3(x, 1.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(leanAngle, leanDir, (i % 2) * 0.2)),
      new THREE.Vector3(s, 0.85 + (i % 3) * 0.12, s),
    );
    trunks.setMatrixAt(i, matrix);
  }

  trunks.instanceMatrix.needsUpdate = true;
  root.add(register(trunks, 'dead-tree'));
}

// ---------------------------------------------------------------------------
// 7. Ferns — thin vertical frond clusters (undergrowth, mid ring)
// ---------------------------------------------------------------------------

function addFerns(root: THREE.Group): void {
  const count = 35;
  const fernGeom = new THREE.BoxGeometry(0.35, 1.2, 0.12);

  const ferns = new THREE.InstancedMesh(fernGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  ferns.name = 'farcrysis-vege-ferns';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 22);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.16;
    matrix.compose(
      new THREE.Vector3(x, 0.6, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 2.1 + i * 0.4, 0)),
      new THREE.Vector3(s, 0.7 + (i % 4) * 0.18, 1.0),
    );
    ferns.setMatrixAt(i, matrix);
  }

  ferns.instanceMatrix.needsUpdate = true;
  root.add(register(ferns));
}

// ---------------------------------------------------------------------------
// 8. Grass tufts — tiny cones scattered everywhere (ground cover)
// ---------------------------------------------------------------------------

function addGrassTufts(root: THREE.Group): void {
  const count = 45;
  const grassGeom = new THREE.ConeGeometry(0.12, 0.45, 5, 1);

  const grass = new THREE.InstancedMesh(grassGeom, vegeMat(0x4d7a36, 0.9, 0.01), count);
  grass.name = 'farcrysis-vege-grass-tufts';

  const matrix = new THREE.Matrix4();
  // Grass everywhere — use full disc + some outer scatter
  const inner = discPositions(Math.floor(count * 0.7), 18);
  const outer = ringPositions(count - inner.length, 18, 30);
  const positions = [...inner, ...outer];

  for (let i = 0; i < count; i += 1) {
    const [x, z] = positions[i];
    const s = 0.6 + (i % 6) * 0.1;
    matrix.compose(
      new THREE.Vector3(x, 0.22, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)),
      new THREE.Vector3(s, 0.7 + (i % 4) * 0.18, s),
    );
    grass.setMatrixAt(i, matrix);
  }

  grass.instanceMatrix.needsUpdate = true;
  root.add(register(grass));
}

// ---------------------------------------------------------------------------
// 9. Bushes — low rounded shrubs (mid ring, inland cover dressing)
// ---------------------------------------------------------------------------

function addBushes(root: THREE.Group): void {
  const count = 28;
  const bushGeom = new THREE.IcosahedronGeometry(0.7, 1);

  const bushes = new THREE.InstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.9, 0.01), count);
  bushes.name = 'farcrysis-vege-bushes';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 20);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.7 + (i % 5) * 0.14;
    matrix.compose(
      new THREE.Vector3(x, 0.45, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.1, angle, i * 0.15)),
      new THREE.Vector3(s, 0.55 + (i % 3) * 0.18, s * 0.9),
    );
    bushes.setMatrixAt(i, matrix);
  }

  bushes.instanceMatrix.needsUpdate = true;
  root.add(register(bushes));
}

// ---------------------------------------------------------------------------
// 10. Vines — diagonal thin cylinders near tree trunks (jungle atmosphere)
// ---------------------------------------------------------------------------

function addVines(root: THREE.Group): void {
  const count = 18;
  // Thin, long cylinder placed at an angle — reads as a hanging vine
  const vineGeom = new THREE.CylinderGeometry(0.03, 0.04, 2.4, 6);

  const vines = new THREE.InstancedMesh(vineGeom, vegeMat(0x3d6e30, 0.82, 0.02), count);
  vines.name = 'farcrysis-vege-vines';

  const matrix = new THREE.Matrix4();
  // Place vines near tree positions — use mid-ring scatter
  const positions = ringPositions(count, 4, 22);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const lean = 0.5 + (i % 3) * 0.2; // diagonal lean
    const twist = angle + (i % 5) * 0.4;
    const s = 0.6 + (i % 4) * 0.15;
    matrix.compose(
      new THREE.Vector3(x, 1.0 + (i % 3) * 0.6, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, twist, lean * 0.3)),
      new THREE.Vector3(s, 0.9 + (i % 3) * 0.1, s),
    );
    vines.setMatrixAt(i, matrix);
  }

  vines.instanceMatrix.needsUpdate = true;
  root.add(register(vines));
}

// ---------------------------------------------------------------------------
// Main entry: add every vegetation layer to the arena group.
// ---------------------------------------------------------------------------

export function buildVegetation(scene: THREE.Group): void {
  resetStats();

  // Trees — 6 distinct types
  addPalms(scene);
  addBroadleafTrees(scene);
  addConifers(scene);
  addBananaPlants(scene);
  addBamboo(scene);
  addDeadTrees(scene);

  // Ground cover
  addFerns(scene);
  addGrassTufts(scene);
  addBushes(scene);
  addVines(scene);
}

// ---------------------------------------------------------------------------
// Stats query — read the accumulated stats after buildVegetation() runs.
// ---------------------------------------------------------------------------

export function FARCRYSIS_VEGE_STATS(): {
  totalInstances: number;
  treeTypes: number;
  totalTriangles: number;
} {
  return {
    totalInstances: _s.totalInstances,
    treeTypes: _s.treeTypeNames.size,
    totalTriangles: _s.totalTriangles,
  };
}
