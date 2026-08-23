import * as THREE from 'three';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';

/**
 * HF-344 follow-through: collision-vs-visual parity audit across whole arenas.
 *
 * The owner's report was "issues with invisible assets blocking me in many
 * maps". The first HF-344 fix bound window colliders to authored glass bounds,
 * but nothing since has mechanically swept EVERY movement collider in EVERY
 * arena and asked the player's question: "if this volume stops me, can I see
 * why?". This module answers exactly that, deterministically, with no GPU.
 *
 * For each movement collider (arena.colliders plus physicalCover bounds) the
 * audit samples the collider volume on a bounded grid and checks each sample
 * against the world-space AABBs of the arena's VISIBLE leaf meshes. A sample
 * is "explained" when a visible mesh AABB (expanded by a small tolerance)
 * contains it. Colliders whose explained fraction falls below the threshold
 * are findings - volumes that block movement with nothing visible to justify
 * the stop.
 *
 * Two intentional families are classified rather than flagged:
 *  - perimeter containment: colliders that reach the arena bounds edge exist
 *    to keep players inside the playfield and are authored invisible;
 *  - foundation: colliders that never rise above ankle height cannot read as
 *    "an invisible wall" - they are floors/safety slabs.
 *
 * Leaf-mesh AABBs are computed from each mesh's OWN geometry transformed by
 * its world matrix - never THREE.Box3.setFromObject on a parent, whose
 * descendant union is precisely the overcoverage that caused HF-344.
 */

export type InvisibleBlockerClassification =
  | 'interior-invisible-blocker'
  | 'perimeter-containment'
  | 'foundation';

export type InvisibleBlockerFinding = Readonly<{
  arenaId: string;
  source: 'collider' | 'physical-cover';
  index: number;
  /** physicalCover id when the source is physical-cover. */
  coverId: string | null;
  bounds: Readonly<{
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
    rotation: readonly [number, number, number] | null;
  }>;
  classification: InvisibleBlockerClassification;
  /** Fraction of volume samples explained by a visible mesh, 0..1. */
  visualCoverage: number;
  sampleCount: number;
  /** Centroid of the unexplained samples - where to teleport to reproduce. */
  uncoveredCentroid: readonly [number, number, number];
}>;

export type InvisibleBlockerAuditReport = Readonly<{
  arenaId: string;
  colliderCount: number;
  physicalCoverCount: number;
  visibleMeshCount: number;
  /** Every collider below the coverage threshold, all classifications. */
  findings: readonly InvisibleBlockerFinding[];
  /** The failures a player experiences: interior invisible blockers only. */
  interiorFindings: readonly InvisibleBlockerFinding[];
}>;

export type InvisibleBlockerAuditOptions = Readonly<{
  /** Expansion applied to every visible mesh AABB before containment tests. */
  visualToleranceM?: number;
  /** Findings require coverage strictly below this fraction. */
  coverageThreshold?: number;
  /** Colliders reaching within this margin of the arena bounds edge are perimeter containment. */
  perimeterMarginM?: number;
  /** Colliders whose top stays at or below this height are foundation slabs. */
  foundationTopY?: number;
  /**
   * Bounds signatures (from `colliderSignature`) of colliders that are
   * intentionally invisible AND interior - each entry must name why.
   */
  intentional?: ReadonlyMap<string, string>;
  /**
   * World-space volumes rendered by INSTANCED presentations the mesh sweep
   * cannot see (an InstancedMesh geometry bounding box says nothing about its
   * per-instance transforms). Atomic Acres house-destruction fragments render
   * this way; their authored position/halfExtents are the visible volumes.
   */
  extraVisualVolumes?: readonly Readonly<{
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  }>[];
}>;

type WorldAabb = Readonly<{
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}>;

const DEFAULTS = Object.freeze({
  visualToleranceM: 0.3,
  coverageThreshold: 0.35,
  perimeterMarginM: 0.75,
  foundationTopY: 0.2,
});

/** Stable identity for allowlisting one authored collider volume. */
export function colliderSignature(arenaId: string, bounds: {
  minX: number; maxX: number; minZ: number; maxZ: number;
  minY?: number; maxY?: number;
}): string {
  const f = (value: number | undefined, fallback: number): string =>
    (Number.isFinite(value) ? (value as number) : fallback).toFixed(2);
  return `${arenaId}:${f(bounds.minX, 0)},${f(bounds.maxX, 0)},${f(bounds.minY, -Infinity)},${f(bounds.maxY, Infinity)},${f(bounds.minZ, 0)},${f(bounds.maxZ, 0)}`;
}

function isRenderableMaterial(material: THREE.Material | THREE.Material[] | undefined): boolean {
  if (!material) return false;
  const list = Array.isArray(material) ? material : [material];
  return list.some((entry) => entry.visible && (!entry.transparent || entry.opacity > 0.05));
}

function meshWorldAabbs(root: THREE.Object3D): WorldAabb[] {
  root.updateMatrixWorld(true);
  const boxes: WorldAabb[] = [];
  const scratch = new THREE.Box3();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    // An invisible ancestor hides the whole subtree.
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (!parent.visible) return;
    }
    if (!isRenderableMaterial(node.material as THREE.Material | THREE.Material[])) return;
    const geometry = node.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounding = geometry.boundingBox;
    if (!bounding || bounding.isEmpty()) return;
    const push = (matrix: THREE.Matrix4): void => {
      // The mesh's own geometry only - see the module comment on HF-344.
      scratch.copy(bounding).applyMatrix4(matrix);
      boxes.push({
        minX: scratch.min.x, maxX: scratch.max.x,
        minY: scratch.min.y, maxY: scratch.max.y,
        minZ: scratch.min.z, maxZ: scratch.max.z,
      });
    };
    // An InstancedMesh's own world matrix is usually the identity: its copies
    // live in `instanceMatrix`. Reading the root alone both invents a phantom
    // volume where nothing is drawn (which could falsely EXPLAIN a collider)
    // and misses every place the geometry is actually visible. Read the
    // copies, which is also why arenas dressed with instanced props no longer
    // need the `extraVisualVolumes` escape hatch.
    if (node instanceof THREE.InstancedMesh) {
      const instanceMatrix = new THREE.Matrix4();
      const worldMatrix = new THREE.Matrix4();
      for (let instance = 0; instance < node.count; instance += 1) {
        node.getMatrixAt(instance, instanceMatrix);
        push(worldMatrix.multiplyMatrices(node.matrixWorld, instanceMatrix));
      }
      return;
    }
    push(node.matrixWorld);
  });
  return boxes;
}

function aabbsIntersect(a: WorldAabb, b: WorldAabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX
    && a.minY <= b.maxY && a.maxY >= b.minY
    && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function expand(box: WorldAabb, margin: number): WorldAabb {
  return {
    minX: box.minX - margin, maxX: box.maxX + margin,
    minY: box.minY - margin, maxY: box.maxY + margin,
    minZ: box.minZ - margin, maxZ: box.maxZ + margin,
  };
}

type NormalizedCollider = Readonly<{
  source: 'collider' | 'physical-cover';
  index: number;
  coverId: string | null;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  rotation: readonly [number, number, number] | null;
}>;

function normalizeCollider(
  box: Box2,
  source: NormalizedCollider['source'],
  index: number,
  coverId: string | null,
  fallbackMinY: number,
  fallbackMaxY: number,
): NormalizedCollider {
  return {
    source,
    index,
    coverId,
    minX: box.minX,
    maxX: box.maxX,
    minY: Number.isFinite(box.minY) ? (box.minY as number) : fallbackMinY,
    maxY: Number.isFinite(box.maxY) ? (box.maxY as number) : fallbackMaxY,
    minZ: box.minZ,
    maxZ: box.maxZ,
    rotation: box.rotation ?? null,
  };
}

function sampleAxisCount(span: number): number {
  return Math.max(2, Math.min(5, Math.ceil(span / 0.9)));
}

/** World AABB of the (possibly rotated) collider, for mesh prefiltering. */
function colliderWorldAabb(collider: NormalizedCollider): WorldAabb {
  if (!collider.rotation) return collider;
  const centre = new THREE.Vector3(
    (collider.minX + collider.maxX) / 2,
    (collider.minY + collider.maxY) / 2,
    (collider.minZ + collider.maxZ) / 2,
  );
  const half = new THREE.Vector3(
    (collider.maxX - collider.minX) / 2,
    (collider.maxY - collider.minY) / 2,
    (collider.maxZ - collider.minZ) / 2,
  );
  const euler = new THREE.Euler(...collider.rotation, 'XYZ');
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    corner.set(
      (i & 1 ? half.x : -half.x),
      (i & 2 ? half.y : -half.y),
      (i & 4 ? half.z : -half.z),
    ).applyEuler(euler).add(centre);
    box.expandByPoint(corner);
  }
  return {
    minX: box.min.x, maxX: box.max.x,
    minY: box.min.y, maxY: box.max.y,
    minZ: box.min.z, maxZ: box.max.z,
  };
}

export type InvisibleBlockerAuditInput = Readonly<{
  id: ArenaMap['id'] | string;
  /**
   * The complete visible world for the arena. For arenas whose props are
   * dressed by later art layers (atomic-acres: loadArenaArt and
   * addNeighbourhoodLife add the visuals that explain the authored prop
   * colliders), pass the SCENE those layers were added to, not just the
   * arena's own root - auditing the bare build flags every dressed prop.
   */
  root: THREE.Object3D;
  colliders: ArenaMap['colliders'];
  physicalCover: ArenaMap['physicalCover'];
  bounds: ArenaMap['bounds'];
}>;

export function auditArenaInvisibleBlockers(
  arena: InvisibleBlockerAuditInput,
  options: InvisibleBlockerAuditOptions = {},
): InvisibleBlockerAuditReport {
  const visualToleranceM = options.visualToleranceM ?? DEFAULTS.visualToleranceM;
  const coverageThreshold = options.coverageThreshold ?? DEFAULTS.coverageThreshold;
  const perimeterMarginM = options.perimeterMarginM ?? DEFAULTS.perimeterMarginM;
  const foundationTopY = options.foundationTopY ?? DEFAULTS.foundationTopY;

  const meshBoxes = [
    ...meshWorldAabbs(arena.root),
    ...(options.extraVisualVolumes ?? []),
  ].map((box) => expand(box, visualToleranceM));

  const colliders: NormalizedCollider[] = [
    ...arena.colliders.map((box, index) => normalizeCollider(box, 'collider', index, null, -2, 12)),
    ...arena.physicalCover.map((cover, index) => normalizeCollider(cover.bounds, 'physical-cover', index, cover.id, -2, 12)),
  ];

  const findings: InvisibleBlockerFinding[] = [];
  const centre = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (const collider of colliders) {
    const worldAabb = colliderWorldAabb(collider);
    const candidates = meshBoxes.filter((box) => aabbsIntersect(box, worldAabb));

    const sizeX = collider.maxX - collider.minX;
    const sizeY = collider.maxY - collider.minY;
    const sizeZ = collider.maxZ - collider.minZ;
    const nx = sampleAxisCount(sizeX);
    const ny = sampleAxisCount(sizeY);
    const nz = sampleAxisCount(sizeZ);
    const insetX = Math.min(0.12, sizeX * 0.2);
    const insetY = Math.min(0.12, sizeY * 0.2);
    const insetZ = Math.min(0.12, sizeZ * 0.2);
    centre.set(
      (collider.minX + collider.maxX) / 2,
      (collider.minY + collider.maxY) / 2,
      (collider.minZ + collider.maxZ) / 2,
    );
    if (collider.rotation) euler.set(...collider.rotation, 'XYZ');

    let covered = 0;
    let total = 0;
    let uncoveredX = 0;
    let uncoveredY = 0;
    let uncoveredZ = 0;
    for (let ix = 0; ix < nx; ix += 1) {
      const tx = nx === 1 ? 0.5 : ix / (nx - 1);
      for (let iy = 0; iy < ny; iy += 1) {
        const ty = ny === 1 ? 0.5 : iy / (ny - 1);
        for (let iz = 0; iz < nz; iz += 1) {
          const tz = nz === 1 ? 0.5 : iz / (nz - 1);
          offset.set(
            (collider.minX + insetX + tx * (sizeX - 2 * insetX)) - centre.x,
            (collider.minY + insetY + ty * (sizeY - 2 * insetY)) - centre.y,
            (collider.minZ + insetZ + tz * (sizeZ - 2 * insetZ)) - centre.z,
          );
          if (collider.rotation) offset.applyEuler(euler);
          const px = centre.x + offset.x;
          const py = centre.y + offset.y;
          const pz = centre.z + offset.z;
          total += 1;
          const explained = candidates.some((box) =>
            px >= box.minX && px <= box.maxX
            && py >= box.minY && py <= box.maxY
            && pz >= box.minZ && pz <= box.maxZ);
          if (explained) covered += 1;
          else {
            uncoveredX += px;
            uncoveredY += py;
            uncoveredZ += pz;
          }
        }
      }
    }

    const coverage = total === 0 ? 1 : covered / total;
    if (coverage >= coverageThreshold) continue;

    const uncovered = total - covered;
    const touchesPerimeter = collider.minX <= arena.bounds.minX + perimeterMarginM
      || collider.maxX >= arena.bounds.maxX - perimeterMarginM
      || collider.minZ <= arena.bounds.minZ + perimeterMarginM
      || collider.maxZ >= arena.bounds.maxZ - perimeterMarginM;
    const classification: InvisibleBlockerClassification = collider.maxY <= foundationTopY
      ? 'foundation'
      : touchesPerimeter
        ? 'perimeter-containment'
        : 'interior-invisible-blocker';

    findings.push({
      arenaId: arena.id,
      source: collider.source,
      index: collider.index,
      coverId: collider.coverId,
      bounds: {
        minX: collider.minX, maxX: collider.maxX,
        minY: collider.minY, maxY: collider.maxY,
        minZ: collider.minZ, maxZ: collider.maxZ,
        rotation: collider.rotation,
      },
      classification,
      visualCoverage: Number(coverage.toFixed(3)),
      sampleCount: total,
      uncoveredCentroid: uncovered === 0
        ? [centre.x, centre.y, centre.z]
        : [
          Number((uncoveredX / uncovered).toFixed(2)),
          Number((uncoveredY / uncovered).toFixed(2)),
          Number((uncoveredZ / uncovered).toFixed(2)),
        ],
    });
  }

  const intentional = options.intentional ?? new Map<string, string>();
  const interiorFindings = findings.filter((finding) =>
    finding.classification === 'interior-invisible-blocker'
    && !intentional.has(colliderSignature(finding.arenaId, finding.bounds)));

  return {
    arenaId: arena.id,
    colliderCount: arena.colliders.length,
    physicalCoverCount: arena.physicalCover.length,
    visibleMeshCount: meshBoxes.length,
    findings,
    interiorFindings,
  };
}
