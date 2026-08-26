/**
 * farcrysis-detail.ts — Pass 69 environmental detail polish module.
 *
 * Adds presentation-only environmental detail to the Farcrysis jungle/beach arena:
 *   1. Hanging vines from canopy crowns (curved TubeGeometry, wind-sway).
 *   2. Moss / lichen patches on ruined walls (small emissive planes).
 *   3. Rock formations (displaced-icosahedron scatter on jungle floor).
 *   4. Jungle floor litter (InstancedMesh of small flat elements).
 *   5. Reed clusters at water's edge (thin cylinders with sway animation).
 *
 * No colliders, gameplay authority, or physics. Presentation only.
 * Mount from farcrysis-art.ts via buildDetail() + animateDetail().
 */
import * as THREE from 'three';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';
import {
  FARCRYSIS_ARENA_HALF,
  FARCRYSIS_WATERLINE_EDGE,
  farcrysisEdgeBandPoint,
} from './farcrysis-shore-bands';

/** Jungle-interior edge band shared by the detail scatter layers. Starts
 *  where the transition band begins so corner-diagonal ground is covered —
 *  the old circular rings starved every corner. */
const INTERIOR_BAND: Readonly<[number, number]> = [14, FARCRYSIS_ARENA_HALF - 2.5];
/** Floor litter spreads wider still, reaching the corner interior. */
const LITTER_BAND: Readonly<[number, number]> = [13, FARCRYSIS_ARENA_HALF - 2.5];
/** Reeds straddle the actual waterline (the HF-393 shelf crossing). */
const REED_WATERLINE_BAND: Readonly<[number, number]> = [
  FARCRYSIS_WATERLINE_EDGE - 3,
  FARCRYSIS_WATERLINE_EDGE + 4.5,
];

// ---------------------------------------------------------------------------
// Shared state — vine pivots, reed meshes, and any per-frame state for
// animateDetail.  All arrays are module-level so the animation driver can
// update them every frame without re-traversing the scene graph.
// ---------------------------------------------------------------------------

/** A pivot group (positioned at the crown edge) + its vine child mesh. */
interface VineEntry {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  /** Base rotation angles stored so animate can add the sway offset. */
  baseRotationY: number;
  phase: number;
}

const _vines: VineEntry[] = [];

/** Thin cylinder meshes that sway like reeds. */
interface ReedEntry {
  mesh: THREE.Mesh;
  /** World XZ position for sway calculation. */
  posX: number;
  posZ: number;
  phase: number;
  height: number;
}

const _reeds: ReedEntry[] = [];

/**
 * Drop every registered vine and reed.
 *
 * `_vines` and `_reeds` are module-level so `animateDetail` can sway them
 * each frame without traversing the scene, but a second `buildDetail`
 * (arena reload, rematch, map switch back to farcrysis) used to APPEND to
 * the previous arena's entries. Each stale vine owns its own TubeGeometry
 * and each stale reed its own CylinderGeometry, so the registries pinned
 * disposed GPU geometry alive AND grew the per-frame sway loop linearly
 * with the number of rebuilds — writing transforms to detached objects.
 * `buildDetail` resets first so the registries only ever describe the arena
 * that is actually mounted.
 */
function resetDetailAnimationRegistries(): void {
  _vines.length = 0;
  _reeds.length = 0;
}

/** Diagnostic: how many animated detail entries the live arena registered. */
export function farcrysisDetailAnimationCounts(): { vines: number; reeds: number } {
  return { vines: _vines.length, reeds: _reeds.length };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random — deterministic, repeatable. */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

/**
 * Create a MeshStandardMaterial + mark as art-layer dressing.
 * Also sets userData.farcrysisArt on every returned mesh.
 */
function artMat(
  color: number,
  roughness = 0.86,
  metalness = 0.08,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function artMark(mesh: THREE.Object3D, name: string): void {
  mesh.name = name;
  mesh.userData.farcrysisArt = true;
}

// ---------------------------------------------------------------------------
// 1. HANGING VINES from canopy crowns
// ---------------------------------------------------------------------------

/** The 12 canopy positions (from farcrysis.ts — read-only reference, not redefined). */
// HF-396: mirrors the doubled canopyPositions in farcrysis.ts.
const CANOPY_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-30, -30], [30, 30], [-30, 30], [30, -30],
  [-8, -48], [8, 48], [-48, 8], [48, -8],
  [-40, -24], [40, 24], [-24, 40], [24, -40],
];

const VINE_COLOR = 0x2d5a1e;
const CROWN_CENTER_Y = 3.1;
const CROWN_HALF = 2.3; // crown box half-extent in X / Z
const CROWN_HALF_H = 0.8; // crown box half-extent in Y

function buildVines(root: THREE.Object3D, rng: () => number): void {
  const vineMat = artMat(VINE_COLOR, 0.75, 0.04);
  const tubeSegments = 8;
  const tubeRadius = 0.03;

  for (const [cx, cz] of CANOPY_POSITIONS) {
    // 2-3 vines per tree
    const count = 2 + Math.floor(rng() * 2); // 2 or 3
    for (let v = 0; v < count; v++) {
      // Pick a random edge point on the crown perimeter
      const angle = rng() * Math.PI * 2;
      const edgeDist = CROWN_HALF * (0.7 + rng() * 0.3);
      const startX = cx + Math.cos(angle) * edgeDist;
      const startZ = cz + Math.sin(angle) * edgeDist;
      const startY = CROWN_CENTER_Y - CROWN_HALF_H + rng() * 0.2; // near crown bottom

      const dropLen = 2.0 + rng() * 2.5; // 2–4.5m
      const endX = startX + (rng() - 0.5) * 0.8;
      const endY = startY - dropLen;
      const endZ = startZ + (rng() - 0.5) * 0.8;

      const midX = (startX + endX) * 0.5 + (rng() - 0.5) * 1.2;
      const midY = (startY + endY) * 0.5 + rng() * 0.3;
      const midZ = (startZ + endZ) * 0.5 + (rng() - 0.5) * 1.0;

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), // local origin (pivot at attachment point)
        new THREE.Vector3(midX - startX, midY - startY, midZ - startZ),
        new THREE.Vector3(endX - startX, endY - startY, endZ - startZ),
      ]);

      const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 6, false);
      const vineMesh = new THREE.Mesh(tubeGeom, vineMat);
      artMark(vineMesh, `farcrysis-detail-vine-mesh-${cx}-${cz}-${v}`);
      vineMesh.castShadow = true;

      // Pivot group at the attachment point on the crown edge
      const pivot = new THREE.Object3D();
      artMark(pivot, `farcrysis-detail-vine-pivot-${cx}-${cz}-${v}`);
      pivot.position.set(startX, startY, startZ);
      pivot.add(vineMesh);

      const baseRotationY = rng() * Math.PI * 2;
      pivot.rotation.y = baseRotationY;
      root.add(pivot);

      _vines.push({
        pivot,
        mesh: vineMesh,
        baseRotationY,
        phase: rng() * Math.PI * 2,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. MOSS / LICHEN PATCHES on ruined walls
// ---------------------------------------------------------------------------

interface WallDef {
  center: [number, number, number];
  size: [number, number, number]; // [sizeX, sizeY, sizeZ] of the BoxGeometry
  faceNormal: [number, number, number]; // outward-facing normal
}

const MOSS_COLOR = 0x5a8a3c;

function buildMossPatches(root: THREE.Object3D, rng: () => number): void {
  const mossMat = new THREE.MeshStandardMaterial({
    color: MOSS_COLOR,
    emissive: MOSS_COLOR,
    emissiveIntensity: 0.25,
    roughness: 0.92,
    metalness: 0.01,
  });

  const walls: WallDef[] = [
    { center: [-8, 0.8, -14], size: [3.6, 1.6, 0.5], faceNormal: [0, 0, -1] },
    { center: [8, 0.8, 14], size: [3.6, 1.6, 0.5], faceNormal: [0, 0, 1] },
    { center: [14, 0.8, -8], size: [0.5, 1.6, 3.6], faceNormal: [1, 0, 0] },
    { center: [-14, 0.8, 8], size: [0.5, 1.6, 3.6], faceNormal: [-1, 0, 0] },
  ];

  for (const wall of walls) {
    const [cx, cy, cz] = wall.center;
    const [sx, sy, sz] = wall.size;
    const [nx, _ny, nz] = wall.faceNormal;

    const halfX = sx / 2;
    const halfZ = sz / 2;

    const surfaceOffset = 0.02; // just off the wall surface

    // Determine which axis the wall extends along (X or Z)
    const useXAxis = sx > sz;

    const patchCount = 3 + Math.floor(rng() * 3); // 3-5 patches

    for (let p = 0; p < patchCount; p++) {
      const pw = 0.2 + rng() * 0.6;
      const ph = 0.15 + rng() * 0.5;

      const patchGeom = new THREE.PlaneGeometry(pw, ph);

      if (useXAxis) {
        // Wall extends in X: position randomly along X and Y within the wall face
        const px = cx + (rng() - 0.5) * (sx - pw);
        const py = cy + (rng() - 0.5) * (sy - ph);
        const pz = cz + nz * (halfZ + surfaceOffset);
        const patch = new THREE.Mesh(patchGeom, mossMat);
        artMark(patch, `farcrysis-detail-moss-${cx.toFixed(0)}-${cz.toFixed(0)}-${p}`);
        patch.position.set(px, py, pz);
        // Face the normal direction
        patch.rotation.y = nz > 0 ? 0 : Math.PI;
        patch.castShadow = false;
        root.add(patch);
      } else {
        // Wall extends in Z: position randomly along Z and Y
        const px = cx + nx * (halfX + surfaceOffset);
        const py = cy + (rng() - 0.5) * (sy - ph);
        const pz = cz + (rng() - 0.5) * (sz - pw);
        const patch = new THREE.Mesh(patchGeom, mossMat);
        artMark(patch, `farcrysis-detail-moss-${cx.toFixed(0)}-${cz.toFixed(0)}-${p}`);
        patch.position.set(px, py, pz);
        patch.rotation.y = nx < 0 ? 0 : Math.PI;
        if (Math.sign(nx) !== 0) {
          // Rotate to face X axis
          patch.rotation.y = nx > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        patch.castShadow = false;
        root.add(patch);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. ROCK FORMATIONS (detail scatter on jungle floor)
// ---------------------------------------------------------------------------

function buildRocks(root: THREE.Object3D, rng: () => number): void {
  const rockCount = 8 + Math.floor(rng() * 5); // 8-12


  for (let i = 0; i < rockCount; i++) {
    // Pass 76: darker earthy grey — the old 0x7a-0x9a range read as pale
    // tarpaulin against the saturated jungle floor.
    const gray = 0x5c + Math.floor(rng() * 0x1c);
    const color = (gray << 16) | ((gray + (Math.floor(rng() * 10) - 5)) << 8) | gray;
    const rockMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.05,
    });

    // Base icosahedron, detail 1
    const detail = rng() < 0.5 ? 0 : 1;
    const geom = new THREE.IcosahedronGeometry(1, detail);

    // Displace vertices for natural look
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const scale = 0.5 + rng() * 1.2; // varied rock size
    for (let j = 0; j < posAttr.count; j++) {
      const x = posAttr.getX(j);
      const y = posAttr.getY(j);
      const z = posAttr.getZ(j);
      const noise = 1.0 + (rng() - 0.5) * 0.5;
      // Normalize then scale with noise
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len > 0.001) {
        posAttr.setXYZ(j, (x / len) * noise * scale, (y / len) * noise * scale * 0.6, (z / len) * noise * scale);
      }
    }
    geom.computeVertexNormals();

    // Pass 76: flatten the underside and rebase so y=0 is the seat plane —
    // free-rotated icosahedra balanced on points and read as grey tarps.
    for (let j = 0; j < posAttr.count; j++) {
      posAttr.setY(j, Math.max(posAttr.getY(j), -scale * 0.35) + scale * 0.35);
    }
    posAttr.needsUpdate = true;
    geom.computeVertexNormals();

    const rock = new THREE.Mesh(geom, rockMat);
    artMark(rock, `farcrysis-detail-rock-${i}`);
    rock.castShadow = true;
    rock.receiveShadow = true;

    // Square-shore interior band: the old 20-36 m circular ring starved the
    // corner diagonals (Chebyshev collapses to r/sqrt(2)).
    const [px, pz] = farcrysisEdgeBandPoint(rng, INTERIOR_BAND, 2.5);
    // Pass 76: seated on the terrain authority (was flat y≈0.2, which buried
    // rocks inside interior hills leaving only spiky grey tips poking out).
    const py = farcrysisTerrainHeight(px, pz) - 0.04;

    rock.position.set(px, py, pz);
    rock.rotation.set(0, rng() * Math.PI * 2, 0); // yaw only — keep the seat down
    rock.scale.setScalar(0.8 + rng() * 0.5);
    root.add(rock);
  }
}

// ---------------------------------------------------------------------------
// 4. JUNGLE FLOOR LITTER (InstancedMesh of small flat elements)
// ---------------------------------------------------------------------------

function buildFloorLitter(root: THREE.Object3D, rng: () => number): void {
  const count = 80 + Math.floor(rng() * 21); // 80-100
  const litterGeom = new THREE.BoxGeometry(0.12, 0.025, 0.28);
  const litterMat = artMat(0x5d4a2c, 0.9, 0.02); // dark brown

  const instances = new THREE.InstancedMesh(litterGeom, litterMat, count);
  artMark(instances, 'farcrysis-detail-floor-litter');
  instances.castShadow = true;
  instances.receiveShadow = true;

  // Enable per-instance color for variety
  instances.instanceColor = null; // reset — we'll set per-instance colors
  // Per-instance color requires InstancedMesh with no pre-set colors.
  // We'll use setColorAt to vary between browns and greens.

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleVec = new THREE.Vector3();

  const litterColors = [
    new THREE.Color(0x5d4a2c), // dark brown (twig)
    new THREE.Color(0x7a5e36), // medium brown (bark)
    new THREE.Color(0x4a6b2a), // dark green (leaf)
    new THREE.Color(0x6b8a3a), // olive green (leaf)
    new THREE.Color(0x8a7a5a), // tan (dry leaf)
  ];


  for (let i = 0; i < count; i++) {
    const [px, pz] = farcrysisEdgeBandPoint(rng, LITTER_BAND, 2.5);
    // Pass 76: seated on the terrain authority (flat y=0.05 buried most of
    // this layer inside the interior hills).
    const py = farcrysisTerrainHeight(px, pz) + 0.04;

    euler.set(
      (rng() - 0.5) * 0.3,
      rng() * Math.PI * 2,
      (rng() - 0.5) * 0.3,
    );
    quat.setFromEuler(euler);

    const s = 0.6 + rng() * 1.2;
    scaleVec.set(s * (0.7 + rng() * 0.6), 0.8 + rng() * 0.4, s);

    matrix.compose(
      new THREE.Vector3(px, py, pz),
      quat,
      scaleVec,
    );
    instances.setMatrixAt(i, matrix);

    // Per-instance color
    const col = litterColors[Math.floor(rng() * litterColors.length)];
    instances.setColorAt(i, col);
  }

  instances.instanceMatrix.needsUpdate = true;

  root.add(instances);
}

// ---------------------------------------------------------------------------
// 5. REED CLUSTERS at water's edge
// ---------------------------------------------------------------------------

const REED_COLOR = 0x8a9a5a;

function buildReedClusters(root: THREE.Object3D, rng: () => number): void {
  const clusterCount = 8 + Math.floor(rng() * 3); // HF-396: 8-10 clusters across the bigger shore
  const reedMat = artMat(REED_COLOR, 0.7, 0.03);

  for (let c = 0; c < clusterCount; c++) {
    // Cluster centre straddling the ACTUAL waterline on every azimuth — the
    // old ARENA_HALF-13..-10 circular ring sat up to ~26 m inland at the
    // corner diagonals (Chebyshev collapses to r/sqrt(2)).
    const [cx, cz] = farcrysisEdgeBandPoint(rng, REED_WATERLINE_BAND, 2.5);

    const reedCount = 5 + Math.floor(rng() * 4); // 5-8 reeds

    for (let r = 0; r < reedCount; r++) {
      const reedHeight = 1.0 + rng() * 1.0; // 1-2m
      const reedRadius = 0.04 + rng() * 0.03; // 0.04-0.07

      // Small random offset from cluster center
      const ox = (rng() - 0.5) * 0.8;
      const oz = (rng() - 0.5) * 0.8;

      const reedGeom = new THREE.CylinderGeometry(reedRadius * 0.8, reedRadius, reedHeight, 6);
      const reed = new THREE.Mesh(reedGeom, reedMat);

      const px = cx + ox;
      const pz = cz + oz;
      // Pass 76: seated on the terrain authority (was flat half-height).
      const py = farcrysisTerrainHeight(px, pz) + reedHeight / 2;

      artMark(reed, `farcrysis-detail-reed-${c}-${r}`);
      reed.position.set(px, py, pz);
      reed.castShadow = true;

      // Slight initial lean
      reed.rotation.z = (rng() - 0.5) * 0.15;
      reed.rotation.x = (rng() - 0.5) * 0.15;

      root.add(reed);

      _reeds.push({
        mesh: reed,
        posX: px,
        posZ: pz,
        phase: rng() * Math.PI * 2,
        height: reedHeight,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function buildDetail(scene: THREE.Scene): void {
  resetDetailAnimationRegistries();

  // Use a fresh seeded-RNG per subsystem for deterministic, repeatable placement.
  // Each builder gets its own rng chain so seed order is stable.
  const rngVines = seededRandom(0xf4c4d);
  const rngMoss = seededRandom(0xf4c4e);
  const rngRocks = seededRandom(0xf4c4f);
  const rngLitter = seededRandom(0xf4c50);
  const rngReeds = seededRandom(0xf4c51);

  buildVines(scene, rngVines);
  buildMossPatches(scene, rngMoss);
  buildRocks(scene, rngRocks);
  buildFloorLitter(scene, rngLitter);
  buildReedClusters(scene, rngReeds);
}

/**
 * Animate all detail elements: vine sway, reed sway.
 * Call every frame from the onBeforeRender animation driver.
 * @param time Seconds elapsed (e.g. performance.now() / 1000).
 */
export function animateDetail(time: number): void {
  // --- Vine sway (gentle rotation of pivot groups) ---
  for (const vine of _vines) {
    const sway = Math.sin(time * 2.3 + vine.phase) * 0.06;
    vine.pivot.rotation.z = sway;
    vine.pivot.rotation.x = Math.cos(time * 1.9 + vine.phase) * 0.04;
  }

  // --- Reed sway (bend by tilting + slight translate) ---
  for (const reed of _reeds) {
    const swayX = Math.sin(time * 3.1 + reed.phase) * 0.08;
    const swayZ = Math.cos(time * 2.7 + reed.phase) * 0.06;

    // Tilt from base
    reed.mesh.rotation.x = swayX * 1.5;
    reed.mesh.rotation.z = swayZ * 1.5;

    // Slight position jitter
    reed.mesh.position.x = reed.posX + swayX * 0.15;
    reed.mesh.position.z = reed.posZ + swayZ * 0.15;
  }
}
