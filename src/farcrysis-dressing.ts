/**
 * PASS 95 FARCRYSIS dressing stage.
 *
 * This is the authored presentation layer for the research-station island:
 * mid-story trees, broadleaf whorls, field signage, and the material response
 * that makes the existing terrain and lagoon read as a wet tropical place.
 * Every vertex, colour, texture and placement is generated here or by the
 * shared procedural PBR pass. No imported game imagery, colliders, shot
 * surfaces, spawns, patrols or gameplay authority are touched.
 *
 * The route keep-out is deliberately derived from the PASS 95 route table.
 * Dressing can close the sightline band visually, but it never narrows a
 * playable lane or invents a second copy of the physics layout.
 */
import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import { FARCRYSIS_SPAWNS_ALL, FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_ROUTE_SEGMENTS } from './farcrysis-layout';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';

const DRESSING_SEED = 0x51f0c3;
const MIDSTORY_COUNT = 28;
const UNDERSTORY_COUNT = 56;
const ROUTE_BUFFER_M = 2.2;
const SPAWN_BUFFER_M = 4.2;

const DRESSING_PALETTE = Object.freeze({
  trunk: 0x4f493a,
  canopy: 0x496d4d,
  undergrowth: 0x55784d,
});

type DressingPlacement = Readonly<{
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  lean: number;
}>;

type DressingState = Readonly<{
  root: THREE.Group;
  canopy: THREE.InstancedMesh;
  understory: THREE.InstancedMesh;
}>;

let activeState: DressingState | null = null;

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointToSegmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function isClearOfAuthoredRoutes(x: number, z: number): boolean {
  return FARCRYSIS_ROUTE_SEGMENTS.every((route) => {
    const distance = pointToSegmentDistance(x, z, route.from[0], route.from[1], route.to[0], route.to[1]);
    return distance >= route.widthM * 0.5 + ROUTE_BUFFER_M;
  });
}

function isClearOfSpawns(x: number, z: number): boolean {
  return FARCRYSIS_SPAWNS_ALL.every(([sx, sz]) => Math.hypot(x - sx, z - sz) >= SPAWN_BUFFER_M);
}

function markArt(object: THREE.Object3D, name?: string): void {
  if (name) object.name = name;
  object.userData.farcrysisArt = true;
  object.userData.farcrysisDressing = true;
}

/** Reuse an already-admitted family material so this dressing adds no shader vocabulary. */
function findExistingMaterial(root: THREE.Object3D, names: readonly string[]): THREE.Material | null {
  let found: THREE.Material | null = null;
  root.traverse((object) => {
    if (found || !(object instanceof THREE.Mesh)) return;
    if (!names.some((name) => object.name === name || object.name.includes(name))) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material) found = material;
  });
  return found;
}

/** A three-lobed low-poly crown, authored from a stock primitive in memory. */
function makeLobedCanopyGeometry(): THREE.BufferGeometry {
  // IcosahedronGeometry is already non-indexed in r185; keeping it as-is
  // avoids an unnecessary conversion (and an avoidable console warning) in
  // the cold arena build.
  const source = new THREE.IcosahedronGeometry(0.72, 1);
  const sourcePosition = source.getAttribute('position');
  const sourceUv = source.getAttribute('uv');
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lobes = [
    { x: -0.48, y: 0.15, z: 0.04, sx: 0.92, sy: 0.8, sz: 0.8, yaw: -0.22 },
    { x: 0.36, y: 0.26, z: 0.12, sx: 0.86, sy: 0.75, sz: 0.9, yaw: 0.32 },
    { x: 0.04, y: 0.46, z: -0.26, sx: 0.78, sy: 0.7, sz: 0.76, yaw: 0.08 },
  ];

  for (const lobe of lobes) {
    const base = positions.length / 3;
    const cos = Math.cos(lobe.yaw);
    const sin = Math.sin(lobe.yaw);
    for (let i = 0; i < sourcePosition.count; i += 1) {
      const sx = sourcePosition.getX(i) * lobe.sx;
      const sy = sourcePosition.getY(i) * lobe.sy;
      const sz = sourcePosition.getZ(i) * lobe.sz;
      positions.push(
        lobe.x + sx * cos - sz * sin,
        lobe.y + sy,
        lobe.z + sx * sin + sz * cos,
      );
      uvs.push(sourceUv ? sourceUv.getX(i) : 0.5, sourceUv ? sourceUv.getY(i) : 0.5);
    }
    for (let i = 0; i < sourcePosition.count; i += 3) {
      indices.push(base + i, base + i + 1, base + i + 2);
    }
  }

  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A five-leaf whorl with a raised midrib, used only for low understory. */
function makeLeafWhorlGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const leafCount = 5;
  for (let i = 0; i < leafCount; i += 1) {
    const theta = (i / leafCount) * Math.PI * 2 + 0.18;
    const ux = Math.cos(theta);
    const uz = Math.sin(theta);
    const vx = -uz;
    const vz = ux;
    const base = positions.length / 3;
    const width = 0.16 + (i % 3) * 0.018;
    const length = 0.78 + (i % 4) * 0.09;
    positions.push(
      ux * 0.06 + vx * width, 0.06, uz * 0.06 + vz * width,
      ux * 0.06 - vx * width, 0.06, uz * 0.06 - vz * width,
      ux * length * 0.46 + vx * width * 0.9, 0.34 + (i % 2) * 0.04, uz * length * 0.46 + vz * width * 0.9,
      ux * length * 0.46 - vx * width * 0.9, 0.34 + (i % 2) * 0.04, uz * length * 0.46 - vz * width * 0.9,
      ux * length, 0.48 + (i % 3) * 0.05, uz * length,
    );
    uvs.push(0, 0, 1, 0, 0, 0.55, 1, 0.55, 0.5, 1);
    indices.push(
      base, base + 2, base + 4,
      base, base + 4, base + 1,
      base + 2, base + 3, base + 4,
      base + 3, base + 1, base + 4,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCanopyPlacements(): DressingPlacement[] {
  const rng = mulberry32(DRESSING_SEED);
  const placements: DressingPlacement[] = [];
  let guard = 0;
  while (placements.length < MIDSTORY_COUNT && guard < 10_000) {
    guard += 1;
    const radius = 31 + rng() * 7;
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * radius + (rng() - 0.5) * 2.2;
    const z = Math.sin(angle) * radius + (rng() - 0.5) * 2.2;
    if (Math.abs(x) > FARCRYSIS_BOUNDS.maxX - 4 || Math.abs(z) > FARCRYSIS_BOUNDS.maxZ - 4) continue;
    if (!isClearOfAuthoredRoutes(x, z) || !isClearOfSpawns(x, z)) continue;
    if (placements.some((entry) => Math.hypot(entry.x - x, entry.z - z) < 2.8)) continue;
    placements.push(Object.freeze({
      x,
      z,
      y: farcrysisTerrainHeight(x, z),
      scale: 0.82 + rng() * 0.34,
      yaw: angle + (rng() - 0.5) * 0.7,
      lean: (rng() - 0.5) * 0.12,
    }));
  }
  return placements;
}

function addInstanceColorVariation(mesh: THREE.InstancedMesh, seed: number, baseColor: number): void {
  if (!mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
  const color = new THREE.Color();
  const rng = mulberry32(seed);
  const base = new THREE.Color(baseColor);
  for (let i = 0; i < mesh.count; i += 1) {
    color.copy(base).offsetHSL((rng() - 0.5) * 0.025, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.14);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;
}

function addFieldSigns(group: THREE.Group, boardMaterial: THREE.Material, poleMaterial: THREE.Material): void {
  const signs = [[18, -34], [-34, 18], [34, -18]] as const;
  const boardGeometry = new THREE.BoxGeometry(1.75, 0.82, 0.08);
  const poleGeometry = new THREE.CylinderGeometry(0.045, 0.06, 1.35, 6);
  poleGeometry.translate(0, 0.675, 0);
  const boards = farcrysisInstancedMesh(boardGeometry, boardMaterial, signs.length);
  const poles = farcrysisInstancedMesh(poleGeometry, poleMaterial, signs.length);
  markArt(boards, 'farcrysis-dressing-field-sign-boards');
  markArt(poles, 'farcrysis-dressing-field-sign-poles');
  boards.castShadow = true;
  boards.receiveShadow = true;
  poles.castShadow = true;
  poles.receiveShadow = true;
  const boardMatrix = new THREE.Matrix4();
  const poleMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < signs.length; i += 1) {
    const [x, z] = signs[i];
    const yaw = Math.atan2(-x, -z);
    quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
    const y = farcrysisTerrainHeight(x, z);
    position.set(x, y + 1.46, z);
    boardMatrix.compose(position, quaternion, scale);
    boards.setMatrixAt(i, boardMatrix);
    position.y = y;
    poleMatrix.compose(position, quaternion, scale);
    poles.setMatrixAt(i, poleMatrix);
  }
  boards.instanceMatrix.needsUpdate = true;
  poles.instanceMatrix.needsUpdate = true;
  boards.computeBoundingSphere();
  poles.computeBoundingSphere();
  group.add(boards, poles);
}

/** Build the complete dressing layer once for the currently selected arena. */
export function buildFarcrysisDressing(root: THREE.Group): Readonly<{ midstory: number; understory: number; signs: number }> {
  const existing = root.getObjectByName('farcrysis-dressing');
  if (existing) return { midstory: MIDSTORY_COUNT, understory: UNDERSTORY_COUNT, signs: 3 };

  const group = new THREE.Group();
  markArt(group, 'farcrysis-dressing');
  const placements = buildCanopyPlacements();

  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.26, 3.4, 8);
  trunkGeometry.translate(0, 1.7, 0);
  const canopyGeometry = makeLobedCanopyGeometry();
  const leafGeometry = makeLeafWhorlGeometry();
  const trunkMaterial = findExistingMaterial(root, ['farcrysis-vege-broadleaf-trunks', 'farcrysis-vege-kapok-trunks'])
    ?? new THREE.MeshStandardMaterial({ color: DRESSING_PALETTE.trunk, roughness: 0.91, metalness: 0.03 });
  const canopyMaterial = findExistingMaterial(root, ['farcrysis-vege-broadleaf-canopies', 'farcrysis-vege-kapok-canopies'])
    ?? trunkMaterial;
  const leafMaterial = findExistingMaterial(root, ['farcrysis-vege-banana-leaves', 'farcrysis-vege-cycad-leaves'])
    ?? canopyMaterial;
  const signMaterial = findExistingMaterial(root, ['farcrysis-art-tiki-band']) ?? trunkMaterial;

  const trunks = farcrysisInstancedMesh(trunkGeometry, trunkMaterial, placements.length);
  const canopy = farcrysisInstancedMesh(canopyGeometry, canopyMaterial, placements.length);
  const understory = farcrysisInstancedMesh(leafGeometry, leafMaterial, UNDERSTORY_COUNT);
  markArt(trunks, 'farcrysis-vege-dressing-midstory-trunks');
  markArt(canopy, 'farcrysis-vege-dressing-midstory-clumps');
  markArt(understory, 'farcrysis-vege-dressing-understory-leaves');
  for (const mesh of [trunks, canopy, understory]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < placements.length; i += 1) {
    const placement = placements[i];
    position.set(placement.x, placement.y + 0.02, placement.z);
    rotation.set(placement.lean, placement.yaw, 0);
    quaternion.setFromEuler(rotation);
    scale.set(placement.scale, placement.scale, placement.scale);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(i, matrix);
    position.y += 3.12 * placement.scale;
    scale.set(placement.scale, placement.scale * 0.92, placement.scale);
    matrix.compose(position, quaternion, scale);
    canopy.setMatrixAt(i, matrix);
  }

  const rng = mulberry32(DRESSING_SEED + 0x1234);
  for (let i = 0; i < UNDERSTORY_COUNT; i += 1) {
    const parent = placements[i % placements.length];
    const angle = rng() * Math.PI * 2;
    const radius = 0.8 + rng() * 1.35;
    position.set(
      parent.x + Math.cos(angle) * radius,
      farcrysisTerrainHeight(parent.x + Math.cos(angle) * radius, parent.z + Math.sin(angle) * radius) + 0.01,
      parent.z + Math.sin(angle) * radius,
    );
    rotation.set((rng() - 0.5) * 0.18, angle, (rng() - 0.5) * 0.16);
    quaternion.setFromEuler(rotation);
    const leafScale = 0.72 + rng() * 0.42;
    scale.set(leafScale, leafScale, leafScale);
    matrix.compose(position, quaternion, scale);
    understory.setMatrixAt(i, matrix);
  }

  for (const mesh of [trunks, canopy, understory]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  addInstanceColorVariation(trunks, DRESSING_SEED + 1, DRESSING_PALETTE.trunk);
  addInstanceColorVariation(canopy, DRESSING_SEED + 2, DRESSING_PALETTE.canopy);
  addInstanceColorVariation(understory, DRESSING_SEED + 3, DRESSING_PALETTE.undergrowth);
  group.add(trunks, canopy, understory);
  addFieldSigns(group, signMaterial, trunkMaterial);
  group.userData.farcrysisDressingStats = Object.freeze({
    midstory: placements.length,
    understory: UNDERSTORY_COUNT,
    signs: 3,
    routeBufferM: ROUTE_BUFFER_M,
    procedural: true,
  });
  root.add(group);
  activeState = { root, canopy, understory };
  return { midstory: placements.length, understory: UNDERSTORY_COUNT, signs: 3 };
}

/** Distance LOD for the two expendable dressing tiers; wind stays GPU-side. */
export function setFarcrysisDressingLOD(cameraDistanceM: number): void {
  if (!activeState) return;
  activeState.canopy.visible = cameraDistanceM < 220;
  activeState.understory.visible = cameraDistanceM < 105;
}
