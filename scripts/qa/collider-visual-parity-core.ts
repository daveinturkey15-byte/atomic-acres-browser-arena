// Mechanical collider/visual parity audit core across EVERY arena the game can
// name - derived, not listed (see ALL_ARENA_IDS below).
//
// Shared by:
//   - scripts/qa/audit-collider-visual-parity.ts (CLI sweep, exit-coded gate)
//   - src/collider-visual-parity-gate.test.ts    (permanent vitest gate that
//     runs with the full suite, so an arena rebuild cannot silently
//     reintroduce invisible colliders or NEW walk-through props)
//
// The experiential walker (verify-invisible-blockers.mjs) proves what a PLAYER
// feels: it drives real key input and flags stops with nothing visible ahead.
// This module answers the complementary MECHANICAL question against the real
// constructed scene graph (the same factory call the game's constructArena
// makes), so it can gate every arena rebuild without a browser:
//
//   Direction A - INVISIBLE COLLIDER: every authoritative collider
//     (arena.colliders ∪ physicsColliders ∪ houseDestruction.staticColliders,
//     perimeter containment excluded) must be explained by a VISIBLE mesh
//     whose world bounds overlap it in XZ (footprint coverage) AND rise high
//     enough in Y to actually be the thing you bump into. Colliders whose
//     identity appears in houseDestruction.staticColliders are excluded as
//     RUNTIME-REPLACED: legacy-main.ts activeWorldColliders() swaps them for
//     interactiveWorldRuntime.movementColliders (visible dynamic bodies gated
//     by pass73-collision-route-authority), so they are never live walls.
//
//   Direction B - WALK-THROUGH PROP: every substantial visible mesh (tall and
//     narrow enough that a player expects it to block) must overlap SOME
//     collider. Terrain, water, sky, foliage and flat ground dressing are
//     excluded by rule; the exclusions are counted, not silently dropped.
//
// For atomic-acres the ALWAYS-ON code-authored visual layers are attached
// exactly as ensureAtomicWorldPresentation + ensureAtomicAuthoredPresentation
// do in legacy-main.ts (addNeighbourhoodLife + loadArenaArt). Without them the
// audit would judge the blockout shell, not what a player sees.
import * as THREE from 'three';
import type { Box2 } from '../../src/collision';
import type { ArenaMap } from '../../src/map';
import { ARENA_IDS } from '../../src/arena-identity';

// ---------------------------------------------------------------------------
// Calibration constants. These were set against the first measured sweep on
// 2026-08-25 and must only move WITH EVIDENCE (never to turn a red arena green
// by hiding real findings — tighten or fix the geometry instead).
// ---------------------------------------------------------------------------

/** Visible mesh must cover at least this fraction of the collider footprint. */
export const EXPLAIN_XZ_COVERAGE = 0.35;
/**
 * The explaining mesh must rise at least this fraction of the collider's own
 * Y range above the collider floor (or 0.12 m for sub-0.4 m kerb colliders,
 * where a low kerbstone legitimately explains a low collider).
 */
export const EXPLAIN_RISE_FRACTION = 0.5;
export const COLLIDER_LOW_HEIGHT_M = 0.4;
export const LOW_EXPLAIN_RISE_M = 0.12;
/** Defaults mirroring collision.ts navigation semantics for Box2 without Y. */
export const DEFAULT_COLLIDER_MIN_Y = -0.5;
export const DEFAULT_COLLIDER_MAX_Y = 8;

/** Direction B: what makes a visible mesh "substantial" enough to expect collision. */
/**
 * Meshes whose BOTTOM sits at least this high cannot touch a standing
 * player (eye ~1.7 m, jump reach well under 1 m): tree canopies, beams,
 * ceiling dressing. They never need movement collision.
 */
export const ABOVE_REACH_MIN_Y_M = 2.6;
/** Shell-scale meshes accept a looser overlap share before being flagged. */
export const SHELL_OVERLAP_SHARE_FLOOR = 0.15;
export const WALKTHROUGH_MIN_HEIGHT_M = 0.9;
export const WALKTHROUGH_MIN_FOOTPRINT_M = 0.35;
/** Meshes covering more than this share of the arena footprint are terrain/sky. */
export const TERRAIN_FOOTPRINT_SHARE = 0.4;
/** Collider footprint must overlap this share OF THE MESH footprint to explain it. */
export const WALKTHROUGH_OVERLAP_SHARE = 0.25;
/** Meshes wider than this are shell-scale: containment beats footprint-share. */
export const SHELL_MESH_WIDTH_M = 8;
/** Tolerance for "fully contained" shell tests against float-authored boxes. */
export const CONTAINMENT_EPSILON_M = 0.08;

/** Name-based exclusion rules for Direction B, each with a stated reason. */
export const WALKTHROUGH_NAME_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /water|ocean|sea|wave|pool/i, reason: 'water volume presentation' },
  { pattern: /terrain|ground|floor|road|street|sidewalk|pavement|deck-plank/i, reason: 'walkable surface' },
  { pattern: /sky|dome|cloud|atmosphere/i, reason: 'sky/atmosphere dressing' },
  { pattern: /grass|foliage|fern|bush|hedge-tuft|shrub|canopy-leaves|palm-frond/i, reason: 'soft foliage' },
  { pattern: /tree|canopy|leaf|branch|vine|trellis/i, reason: 'soft foliage' },
  { pattern: /decal|scorch|bullet-hole|aperture|dent|crack|stripe|hazard/i, reason: 'surface decal/dressing' },
  { pattern: /particle|sprite|spark|smoke|dust|mist|rain/i, reason: 'particle/volumetric effect' },
];

// ---------------------------------------------------------------------------
// Direction C - BALLISTIC parity (HF-390 / Pass 81 lane aa-lane-ballistics).
//
// castShot's penetration path (src/legacy-main.ts) traces
// activeBallisticSurfaces() ONLY: a visible mesh with no BallisticSurface is
// GHOST cover - bullets cross it with no attenuation, no impact mark and no
// sound. Direction C therefore asks the mirror question of Direction B:
// every substantial visible mesh must be rated for gunfire - registered
// directly (userData.ballisticSurfaceId), covered by an overlapping
// shot-surface footprint (authored collision proxies ARE the shot authority
// for Blender art), a dynamic raycast target, or excluded by a stated
// shoot-through rule. Anything left is reported for triage: rate it or put it
// in the ACCEPTED_SHOOT_THROUGH ledger with a written reason
// (scripts/qa/ballistic-parity-ledger.ts).
// ---------------------------------------------------------------------------

/** A mesh this tall can hide part of a crouched body: it needs a rating. */
export const BALLISTIC_MIN_HEIGHT_M = WALKTHROUGH_MIN_HEIGHT_M;
/**
 * WIDEST XZ dimension floor (movement uses the narrowest): a 0.12 m thick
 * window pane can never block a body but absolutely takes a bullet, so thin
 * wide sheets stay in the ballistic census while true slivers (posts thinner
 * than a barrel, decals) drop out.
 */
export const BALLISTIC_MIN_WIDE_DIMENSION_M = 0.35;
/** Shot-surface footprint must cover this share OF THE MESH footprint. */
export const BALLISTIC_OVERLAP_SHARE = 0.25;
/**
 * The explaining surface must also cover this share of the mesh's
 * COMBAT-HEIGHT range (0 .. BALLISTIC_ABOVE_COMBAT_MIN_Y_M): a knee-high
 * garden bed must never "explain" the 3 m greenhouse wall standing on it -
 * binary Y-overlap did exactly that in the first measured sweep.
 */
export const BALLISTIC_Y_COVERAGE_SHARE = 0.6;
/**
 * Flush-dressing tolerance: a thin authored skin or recessed panel sitting
 * within this distance of a registered surface is explained by it - a bullet
 * crossing the 3 cm skin impacts the authority a few centimetres later, so
 * the felt result is the authority's material, not ghost cover. Only thin
 * sheets are materially affected: for chunky meshes the expanded strip can
 * never reach the footprint-share threshold on its own.
 */
export const BALLISTIC_FLUSH_EPSILON_M = 0.05;
/**
 * Meshes whose BOTTOM sits above the standing combat volume (bodies, bots and
 * traversal all live below): canopy/ceiling dressing. Shots CAN reach them,
 * but no body is ever behind them, so a missing rating there cannot move
 * time-to-kill; counted as an exclusion, never silently dropped.
 */
export const BALLISTIC_ABOVE_COMBAT_MIN_Y_M = ABOVE_REACH_MIN_Y_M;
/** BallisticSurface bounds without authored Y default to the nav volume. */
export const DEFAULT_SURFACE_MIN_Y = 0;
export const DEFAULT_SURFACE_MAX_Y = 8;

/**
 * Name rules for meshes a bullet legitimately crosses without a rating.
 * Movement's exclusions carry over (water, terrain, sky, foliage, decals,
 * particles) plus cloth: all are soft presentation a round should never stop
 * on. Every exclusion is counted in the result, never silently dropped.
 */
export const BALLISTIC_SHOOT_THROUGH_NAME_RULES: Array<{ pattern: RegExp; reason: string }> = [
  ...WALKTHROUGH_NAME_RULES,
  { pattern: /flag|cloth|banner|awning|curtain|tarp|drape/i, reason: 'cloth/soft presentation' },
];

export type ColliderEntry = {
  box: Box2;
  sources: string[];
};

export type MeshEntry = {
  name: string;
  path: string;
  box: THREE.Box3;
  presentationOnly: boolean;
  instanced: boolean;
  vertices: number;
  /** Direction C: the mesh's own registration stamp, when the arena builder rated it. */
  ballisticSurfaceId: string | null;
  /** Direction C: dynamic raycast target (practice target / test dummy limb). */
  dynamicTarget: boolean;
};

export type ColliderSample = {
  /** World-space centre of the collider AABB (mid-height of its Y range). */
  centre: [number, number, number];
  size: [number, number, number];
  sources: string[];
  yRangeDefaulted: boolean;
};

export type ArenaAuditResult = {
  id: string;
  error?: string;
  colliderCount?: number;
  defaultedYColliders?: number;
  boundaryColliders?: number;
  runtimeReplacedStaticColliders?: number;
  visibleMeshes?: number;
  invisibleColliders?: Array<Record<string, unknown>>;
  walkThroughMeshes?: Array<Record<string, unknown>>;
  excludedByRuleCounts?: Record<string, number>;
  /** Direction C: authored shot-surface roster stats (material / classification). */
  shotSurfaceStats?: {
    total: number;
    byMaterial: Record<string, number>;
    byClassification: Record<string, number>;
  };
  /** Direction C: full authored roster, one row per shot surface. */
  shotSurfaceRoster?: Array<{ id: string; name: string; material: string; classification: string }>;
  /**
   * Direction C: meshes explained ONLY by an overlapping surface footprint -
   * listed with the explaining surface so a reviewer can falsify the
   * explanation instead of trusting the count (fake coverage guard).
   */
  ballisticFootprintExplained?: Array<{ name: string; centre: [number, number, number]; surfaceId: string; surfaceMaterial: string; share: number }>;
  /** Direction C: substantial visible meshes with NO gunfire rating at all. */
  ballisticGhostMeshes?: Array<Record<string, unknown>>;
  ballisticExcludedByRuleCounts?: Record<string, number>;
  ballisticCensus?: {
    total: number;
    ratedDirect: number;
    ratedByFootprint: number;
    dynamicTargets: number;
    excludedByRule: number;
    unrated: number;
  };
  /**
   * Deterministic sample of LIVE-authoritative movement colliders (boundary
   * containment and runtime-replaced statics excluded). The CDP live leg
   * probes these through the game's own collision authority: each one MUST
   * block, or the audited scene has drifted from what players experience.
   */
  colliderSamples?: ColliderSample[];
  /** How many eligible colliders the sample was drawn from. */
  colliderSamplePopulation?: number;
};

type ArenaBuild = (scene: THREE.Scene) => Omit<ArenaMap, 'id'> & { id?: string };
type ArenaEnrich = (scene: THREE.Scene) => Promise<void>;

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function visibleChain(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

function objectPath(object: THREE.Object3D): string {
  const parts: string[] = [];
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.name) parts.unshift(node.name);
    node = node.parent;
  }
  return parts.join('/');
}

export function collectMeshes(scene: THREE.Scene): MeshEntry[] {
  scene.updateMatrixWorld(true);
  const meshes: MeshEntry[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!visibleChain(object)) return;
    const box = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) return;
    meshes.push({
      name: object.name || `(unnamed ${object.type})`,
      path: objectPath(object),
      box,
      presentationOnly: object.userData.presentationOnly === true,
      instanced: object instanceof THREE.InstancedMesh,
      vertices: object.geometry.attributes?.position?.count ?? 0,
      ballisticSurfaceId: typeof object.userData.ballisticSurfaceId === 'string' ? object.userData.ballisticSurfaceId : null,
      dynamicTarget: typeof object.userData.targetId === 'string' || typeof object.userData.hitZone === 'string',
    });
  });
  return meshes;
}

export function collectColliders(map: ArenaMap): ColliderEntry[] {
  const entries: ColliderEntry[] = [];
  const push = (box: Box2, source: string) => {
    const existing = entries.find((entry) => entry.box === box);
    if (existing) existing.sources.push(source);
    else entries.push({ box, sources: [source] });
  };
  for (const box of map.colliders) push(box, 'colliders');
  for (const box of map.physicsColliders) push(box, 'physicsColliders');
  for (const box of map.houseDestruction?.staticColliders ?? []) push(box, 'houseDestruction.staticColliders');
  return entries;
}

export function colliderYRange(box: Box2): { min: number; max: number; defaulted: boolean } {
  if (box.minY !== undefined && box.maxY !== undefined) return { min: box.minY, max: box.maxY, defaulted: false };
  return { min: box.minY ?? DEFAULT_COLLIDER_MIN_Y, max: box.maxY ?? DEFAULT_COLLIDER_MAX_Y, defaulted: true };
}

export function isBoundaryCollider(box: Box2, bounds: Box2): boolean {
  // Perimeter containment sits ON the authored bounds edges by construction:
  // it must touch one X edge AND one Z edge simultaneously.
  const eps = 0.05;
  const touchesX = Math.abs(box.minX - bounds.minX) < eps || Math.abs(box.maxX - bounds.maxX) < eps;
  const touchesZ = Math.abs(box.minZ - bounds.minZ) < eps || Math.abs(box.maxZ - bounds.maxZ) < eps;
  return touchesX && touchesZ;
}

function rectArea(minX: number, maxX: number, minZ: number, maxZ: number): number {
  return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
}

function overlapCoverage(
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  other: THREE.Box3,
): number {
  const colliderArea = rectArea(box.minX, box.maxX, box.minZ, box.maxZ);
  if (colliderArea <= 1e-9) return 0;
  const ix = Math.min(box.maxX, other.max.x) - Math.max(box.minX, other.min.x);
  const iz = Math.min(box.maxZ, other.max.z) - Math.max(box.minZ, other.min.z);
  return (Math.max(0, ix) * Math.max(0, iz)) / colliderArea;
}

function bestExplainingMesh(
  entry: ColliderEntry,
  meshes: MeshEntry[],
): { found: boolean; coverage: number } {
  const y = colliderYRange(entry.box);
  const height = y.max - y.min;
  const requiredRise = height <= COLLIDER_LOW_HEIGHT_M ? LOW_EXPLAIN_RISE_M : height * EXPLAIN_RISE_FRACTION;
  let bestCoverage = 0;
  for (const mesh of meshes) {
    if (mesh.box.max.y < y.min + requiredRise) continue;
    if (mesh.box.min.y > y.max) continue;
    const coverage = overlapCoverage(entry.box, mesh.box);
    if (coverage >= EXPLAIN_XZ_COVERAGE) return { found: true, coverage };
    if (coverage > bestCoverage) bestCoverage = coverage;
  }
  return { found: false, coverage: bestCoverage };
}

function nearestVisibleMesh(entry: ColliderEntry, meshes: MeshEntry[]): string | null {
  const cx = (entry.box.minX + entry.box.maxX) / 2;
  const cz = (entry.box.minZ + entry.box.maxZ) / 2;
  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const mesh of meshes) {
    const mx = (mesh.box.min.x + mesh.box.max.x) / 2;
    const mz = (mesh.box.min.z + mesh.box.max.z) / 2;
    const distance = Math.hypot(mx - cx, mz - cz);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = `${mesh.name} @ (${round(mx)}, ${round(mz)}) (${distance.toFixed(1)}m from collider centre)`;
    }
  }
  return bestName;
}

/**
 * World-space XZ AABB + Y range of a BallisticSurface's bounds. Authored
 * rotations (yaw-staged props, the high-seas hull) rotate the box about its
 * centre exactly as ballistics.surfaceInterval does, so the parity test sees
 * the same footprint gunfire does.
 */
export function surfaceWorldFootprint(bounds: Box2): {
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
} {
  const minY = bounds.minY ?? DEFAULT_SURFACE_MIN_Y;
  const maxY = bounds.maxY ?? DEFAULT_SURFACE_MAX_Y;
  if (!bounds.rotation) {
    return { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ, minY, maxY };
  }
  const centre = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, (minY + maxY) / 2, (bounds.minZ + bounds.maxZ) / 2);
  const half = new THREE.Vector3((bounds.maxX - bounds.minX) / 2, (maxY - minY) / 2, (bounds.maxZ - bounds.minZ) / 2);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...bounds.rotation));
  const footprint = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity };
  const corner = new THREE.Vector3();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    corner.set(half.x * sx, half.y * sy, half.z * sz).applyQuaternion(rotation).add(centre);
    footprint.minX = Math.min(footprint.minX, corner.x);
    footprint.maxX = Math.max(footprint.maxX, corner.x);
    footprint.minZ = Math.min(footprint.minZ, corner.z);
    footprint.maxZ = Math.max(footprint.maxZ, corner.z);
    footprint.minY = Math.min(footprint.minY, corner.y);
    footprint.maxY = Math.max(footprint.maxY, corner.y);
  }
  return footprint;
}

export async function auditArena(id: string, build: ArenaBuild, enrich?: ArenaEnrich): Promise<ArenaAuditResult> {
  const scene = new THREE.Scene();
  let map: Omit<ArenaMap, 'id'> & { id?: string };
  try {
    map = build(scene);
    if (enrich) await enrich(scene);
  } catch (error) {
    return { id, error: String((error as Error)?.stack ?? error).slice(0, 600) };
  }
  const colliders = collectColliders(map as ArenaMap);
  const meshes = collectMeshes(scene);
  const bounds = map.bounds;

  // Runtime-replaced statics are counted, never flagged (see header).
  const runtimeReplaced = new Set<Box2>(map.houseDestruction?.staticColliders ?? []);
  let runtimeReplacedStaticColliders = 0;
  let defaultedYColliders = 0;
  let boundaryColliders = 0;
  const invisibleColliders: Array<Record<string, unknown>> = [];
  for (const entry of colliders) {
    const y = colliderYRange(entry.box);
    if (y.defaulted) defaultedYColliders += 1;
    if (runtimeReplaced.has(entry.box)) {
      runtimeReplacedStaticColliders += 1;
      continue;
    }
    if (isBoundaryCollider(entry.box, bounds)) {
      boundaryColliders += 1;
      continue;
    }
    const explanation = bestExplainingMesh(entry, meshes);
    if (explanation.found) continue;
    invisibleColliders.push({
      sources: entry.sources,
      worldBounds: {
        minX: round(entry.box.minX), maxX: round(entry.box.maxX),
        minY: round(y.min), maxY: round(y.max),
        minZ: round(entry.box.minZ), maxZ: round(entry.box.maxZ),
      },
      centre: [
        round((entry.box.minX + entry.box.maxX) / 2),
        round((y.min + y.max) / 2),
        round((entry.box.minZ + entry.box.maxZ) / 2),
      ],
      size: [round(entry.box.maxX - entry.box.minX), round(y.max - y.min), round(entry.box.maxZ - entry.box.minZ)],
      bestPartialCoverage: round(explanation.coverage),
      nearestVisibleMesh: nearestVisibleMesh(entry, meshes) ?? '(no visible meshes at all)',
    });
  }

  const arenaFootprintArea = rectArea(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  const movementColliders = colliders.filter((entry) => !isBoundaryCollider(entry.box, bounds));
  const walkThroughMeshes: Array<Record<string, unknown>> = [];
  const excludedByRuleCounts: Record<string, number> = {};
  for (const entry of meshes) {
    const height = entry.box.max.y - entry.box.min.y;
    const footW = entry.box.max.x - entry.box.min.x;
    const footD = entry.box.max.z - entry.box.min.z;
    if (height < WALKTHROUGH_MIN_HEIGHT_M) continue;
    if (Math.min(footW, footD) < WALKTHROUGH_MIN_FOOTPRINT_M) continue;
    const footprint = rectArea(entry.box.min.x, entry.box.max.x, entry.box.min.z, entry.box.max.z);
    if (footprint > TERRAIN_FOOTPRINT_SHARE * arenaFootprintArea) {
      excludedByRuleCounts['terrain/sky-scale surface'] = (excludedByRuleCounts['terrain/sky-scale surface'] ?? 0) + 1;
      continue;
    }
    const centreX = (entry.box.min.x + entry.box.max.x) / 2;
    const centreZ = (entry.box.min.z + entry.box.max.z) / 2;
    if (centreX < bounds.minX - 1 || centreX > bounds.maxX + 1 || centreZ < bounds.minZ - 1 || centreZ > bounds.maxZ + 1) {
      excludedByRuleCounts['outside playable bounds (backdrop)'] = (excludedByRuleCounts['outside playable bounds (backdrop)'] ?? 0) + 1;
      continue;
    }
    if (entry.box.min.y >= ABOVE_REACH_MIN_Y_M) {
      excludedByRuleCounts['above reachable height (no standing contact)'] = (excludedByRuleCounts['above reachable height (no standing contact)'] ?? 0) + 1;
      continue;
    }
    const rule = WALKTHROUGH_NAME_RULES.find(({ pattern }) => pattern.test(entry.name) || pattern.test(entry.path));
    const runtimeSolidityRule = /practice-target|test-dummy/i.test(entry.path)
      ? 'training target (solidity owned by runtime colliders)'
      : /flag|cloth|banner|awning/i.test(entry.name)
        ? 'cloth presentation'
        : null;
    const exclusionReason = rule?.reason ?? runtimeSolidityRule;
    if (exclusionReason) {
      excludedByRuleCounts[exclusionReason] = (excludedByRuleCounts[exclusionReason] ?? 0) + 1;
      continue;
    }
    // A merged presentation batch spans whole building shells; its AABB
    // legitimately CONTAINS many small colliders, so a footprint-share rule can
    // never fire. For shell-scale meshes a fully-contained collider (or a
    // looser 15% share, which covers colliders that slightly overhang the
    // visual AABB, e.g. ramp plates) is the right containment test instead.
    const shellScale = Math.max(footW, footD) > SHELL_MESH_WIDTH_M;
    const explained = movementColliders.some((collider) => {
      const y = colliderYRange(collider.box);
      if (entry.box.max.y <= y.min || entry.box.min.y >= y.max) return false;
      const ix = Math.min(collider.box.maxX, entry.box.max.x) - Math.max(collider.box.minX, entry.box.min.x);
      const iz = Math.min(collider.box.maxZ, entry.box.max.z) - Math.max(collider.box.minZ, entry.box.min.z);
      const share = footprint <= 1e-9 ? 0 : (Math.max(0, ix) * Math.max(0, iz)) / footprint;
      if (shellScale) {
        const contained = collider.box.minX >= entry.box.min.x - CONTAINMENT_EPSILON_M
          && collider.box.maxX <= entry.box.max.x + CONTAINMENT_EPSILON_M
          && collider.box.minZ >= entry.box.min.z - CONTAINMENT_EPSILON_M
          && collider.box.maxZ <= entry.box.max.z + CONTAINMENT_EPSILON_M;
        return contained || share >= SHELL_OVERLAP_SHARE_FLOOR;
      }
      return share >= WALKTHROUGH_OVERLAP_SHARE;
    });
    if (explained) continue;
    walkThroughMeshes.push({
      name: entry.name,
      path: entry.path,
      centre: [round(centreX), round((entry.box.min.y + entry.box.max.y) / 2), round(centreZ)],
      size: [round(footW), round(height), round(footD)],
      presentationOnly: entry.presentationOnly,
      instanced: entry.instanced,
      vertices: entry.vertices,
    });
  }
  walkThroughMeshes.sort((a, b) => Number(b.vertices) - Number(a.vertices));

  // Direction C - ballistic census (see header block by the constants).
  const shotSurfaces = (map as ArenaMap).shotSurfaces ?? [];
  const byMaterial: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  for (const surface of shotSurfaces) {
    byMaterial[surface.material] = (byMaterial[surface.material] ?? 0) + 1;
    byClassification[surface.classification] = (byClassification[surface.classification] ?? 0) + 1;
  }
  const surfaceFootprints = shotSurfaces.map((surface) => ({
    surface,
    footprint: surfaceWorldFootprint(surface.bounds),
  }));
  const ballisticFootprintExplained: NonNullable<ArenaAuditResult['ballisticFootprintExplained']> = [];
  const ballisticExcludedByRuleCounts: Record<string, number> = {};
  const ballisticGhostMeshes: Array<Record<string, unknown>> = [];
  let ballisticCensusTotal = 0;
  let ratedDirect = 0;
  let ratedByFootprint = 0;
  let dynamicTargets = 0;
  let ballisticExcluded = 0;
  const excludeBallistic = (reason: string) => {
    ballisticExcluded += 1;
    ballisticExcludedByRuleCounts[reason] = (ballisticExcludedByRuleCounts[reason] ?? 0) + 1;
  };
  for (const entry of meshes) {
    const height = entry.box.max.y - entry.box.min.y;
    const footW = entry.box.max.x - entry.box.min.x;
    const footD = entry.box.max.z - entry.box.min.z;
    if (height < BALLISTIC_MIN_HEIGHT_M) continue;
    if (Math.max(footW, footD) < BALLISTIC_MIN_WIDE_DIMENSION_M) continue;
    const footprint = rectArea(entry.box.min.x, entry.box.max.x, entry.box.min.z, entry.box.max.z);
    if (footprint > TERRAIN_FOOTPRINT_SHARE * arenaFootprintArea) continue;
    const centreX = (entry.box.min.x + entry.box.max.x) / 2;
    const centreZ = (entry.box.min.z + entry.box.max.z) / 2;
    if (centreX < bounds.minX - 1 || centreX > bounds.maxX + 1 || centreZ < bounds.minZ - 1 || centreZ > bounds.maxZ + 1) continue;
    ballisticCensusTotal += 1;
    if (entry.ballisticSurfaceId) { ratedDirect += 1; continue; }
    if (entry.dynamicTarget || /practice-target|test-dummy|mannequin/i.test(entry.path)) { dynamicTargets += 1; continue; }
    const rule = BALLISTIC_SHOOT_THROUGH_NAME_RULES.find(({ pattern }) => pattern.test(entry.name) || pattern.test(entry.path));
    if (rule) { excludeBallistic(rule.reason); continue; }
    const shellScale = Math.max(footW, footD) > SHELL_MESH_WIDTH_M;
    let bestShare = 0;
    const combatMinY = Math.max(entry.box.min.y, 0);
    const combatMaxY = Math.min(entry.box.max.y, BALLISTIC_ABOVE_COMBAT_MIN_Y_M);
    const combatRange = Math.max(combatMaxY - combatMinY, 1e-6);
    const meshMinX = entry.box.min.x - BALLISTIC_FLUSH_EPSILON_M;
    const meshMaxX = entry.box.max.x + BALLISTIC_FLUSH_EPSILON_M;
    const meshMinZ = entry.box.min.z - BALLISTIC_FLUSH_EPSILON_M;
    const meshMaxZ = entry.box.max.z + BALLISTIC_FLUSH_EPSILON_M;
    const flushFootprint = rectArea(meshMinX, meshMaxX, meshMinZ, meshMaxZ);
    const explainedBy = surfaceFootprints.find(({ footprint: surface }) => {
      if (entry.box.max.y <= surface.minY || entry.box.min.y >= surface.maxY) return false;
      const yCovered = Math.min(surface.maxY, combatMaxY) - Math.max(surface.minY, combatMinY);
      if (yCovered / combatRange < BALLISTIC_Y_COVERAGE_SHARE) return false;
      const ix = Math.min(surface.maxX, meshMaxX) - Math.max(surface.minX, meshMinX);
      const iz = Math.min(surface.maxZ, meshMaxZ) - Math.max(surface.minZ, meshMinZ);
      const share = flushFootprint <= 1e-9 ? 0 : (Math.max(0, ix) * Math.max(0, iz)) / flushFootprint;
      if (share > bestShare) bestShare = share;
      if (shellScale) {
        const contained = surface.minX >= entry.box.min.x - CONTAINMENT_EPSILON_M
          && surface.maxX <= entry.box.max.x + CONTAINMENT_EPSILON_M
          && surface.minZ >= entry.box.min.z - CONTAINMENT_EPSILON_M
          && surface.maxZ <= entry.box.max.z + CONTAINMENT_EPSILON_M;
        return contained || share >= SHELL_OVERLAP_SHARE_FLOOR;
      }
      return share >= BALLISTIC_OVERLAP_SHARE;
    });
    if (explainedBy) {
      ratedByFootprint += 1;
      ballisticFootprintExplained.push({
        name: entry.name,
        centre: [round(centreX), round((entry.box.min.y + entry.box.max.y) / 2), round(centreZ)],
        surfaceId: explainedBy.surface.id,
        surfaceMaterial: explainedBy.surface.material,
        share: round(bestShare),
      });
      continue;
    }
    // Only exclude above-volume dressing AFTER the footprint attempt, so an
    // upper-storey skin whose authority IS a registered fragment counts as
    // rated, and only true canopy/eaves dressing lands here.
    if (entry.box.min.y >= BALLISTIC_ABOVE_COMBAT_MIN_Y_M) {
      excludeBallistic('above the standing combat volume (canopy/eaves/overhead dressing)');
      continue;
    }
    ballisticGhostMeshes.push({
      name: entry.name,
      path: entry.path,
      centre: [round(centreX), round((entry.box.min.y + entry.box.max.y) / 2), round(centreZ)],
      size: [round(footW), round(height), round(footD)],
      vertices: entry.vertices,
      instanced: entry.instanced,
      bestSurfaceShare: round(bestShare),
    });
  }
  ballisticGhostMeshes.sort((a, b) => String(a.name).localeCompare(String(b.name))
    || Number((a.centre as number[])[0]) - Number((b.centre as number[])[0])
    || Number((a.centre as number[])[2]) - Number((b.centre as number[])[2]));

  // Deterministic live-probe sample: evenly spaced over the eligible
  // (non-boundary, non-runtime-replaced) movement colliders, index-strided so
  // the same tree always yields the same coordinates for a given build.
  const eligible = movementColliders.filter((entry) => !runtimeReplaced.has(entry.box));
  const MAX_SAMPLES = 12;
  const stride = Math.max(1, Math.ceil(eligible.length / MAX_SAMPLES));
  const colliderSamples: ColliderSample[] = [];
  for (let index = 0; index < eligible.length; index += stride) {
    const entry = eligible[index];
    const y = colliderYRange(entry.box);
    colliderSamples.push({
      centre: [
        round((entry.box.minX + entry.box.maxX) / 2),
        round((y.min + y.max) / 2),
        round((entry.box.minZ + entry.box.maxZ) / 2),
      ],
      size: [round(entry.box.maxX - entry.box.minX), round(y.max - y.min), round(entry.box.maxZ - entry.box.minZ)],
      sources: entry.sources,
      yRangeDefaulted: y.defaulted,
    });
  }

  return {
    id,
    colliderCount: colliders.length,
    defaultedYColliders,
    boundaryColliders,
    runtimeReplacedStaticColliders,
    visibleMeshes: meshes.length,
    invisibleColliders,
    walkThroughMeshes,
    excludedByRuleCounts,
    shotSurfaceStats: {
      total: shotSurfaces.length,
      byMaterial,
      byClassification,
    },
    shotSurfaceRoster: shotSurfaces.map((surface) => ({
      id: surface.id,
      name: surface.name,
      material: surface.material,
      classification: surface.classification,
    })),
    ballisticFootprintExplained,
    ballisticGhostMeshes,
    ballisticExcludedByRuleCounts,
    ballisticCensus: {
      total: ballisticCensusTotal,
      ratedDirect,
      ratedByFootprint,
      dynamicTargets,
      excludedByRule: ballisticExcluded,
      unrated: ballisticGhostMeshes.length,
    },
    colliderSamples,
    colliderSamplePopulation: eligible.length,
  };
}

type ArenaFactories = Record<string, { build: ArenaBuild; enrich?: ArenaEnrich }>;

let factoriesPromise: Promise<ArenaFactories> | null = null;

async function loadFactories(): Promise<ArenaFactories> {
  if (!factoriesPromise) {
    factoriesPromise = (async () => {
      const [{ buildArena }, { buildGunRange, buildRustworks1v1, buildSkylineTerminal }, { buildFarcrysis }, { buildHighSeas }, { addNeighbourhoodLife, loadArenaArt }, { buildTest1, buildTest2 }, { buildMap3 }] = await Promise.all([
        import('../../src/map'),
        import('../../src/additional-maps'),
        import('../../src/farcrysis'),
        import('../../src/high-seas'),
        import('../../src/environment-assets'),
        import('../../src/test-maps'),
        import('../../src/map3-arena'),
      ]);
      return {
        'atomic-acres': {
          build: buildArena,
          enrich: async (scene) => {
            addNeighbourhoodLife(scene, false);
            await loadArenaArt(scene, undefined, false);
          },
        },
        'rustworks-1v1': { build: buildRustworks1v1 },
        'gun-range': { build: buildGunRange },
        'skyline-terminal': { build: buildSkylineTerminal },
        farcrysis: { build: buildFarcrysis },
        'high-seas': { build: (scene) => buildHighSeas(scene) },
        // Owner 2026-08-30: Test1/Test2 join the audit.
        test1: { build: buildTest1 },
        test2: { build: buildTest2 },
        // MAP3 (owner 2026-09-02, HF-405): Map 3 joins the audit.
        map3: { build: buildMap3 },
      } satisfies ArenaFactories;
    })();
  }
  return factoriesPromise;
}

// Owner 2026-08-30: Test1/Test2 join the mechanical parity audit.
// MAP3 (owner 2026-09-02, HF-405): Map 3 joins it too. A roster that does not
// name a shipped arena is a gate that never looked at it.
//
// PASS 85 Lane N repair: it was a nine-id literal that happened to be complete
// on the day it was written, and it had already been hand-edited twice to catch
// up with a shipped arena. It is now the canonical identity list itself, so the
// audit covers a new arena on the commit that registers it rather than on the
// commit somebody remembers this file. Registry ORDER (atomic-acres,
// skyline-terminal, rustworks-1v1, gun-range, ...) replaces the old hand order;
// the results array follows the ids it is given, and both consumers derive
// their expectations from this same constant.
export const ALL_ARENA_IDS = ARENA_IDS;

/**
 * Runs the mechanical audit for the requested arenas inside plain Node/vitest.
 * Installs the minimal window/document shims environment-assets needs (it reads
 * window.location.search at call time) BEFORE any arena factory is imported or
 * invoked, so the constructed graph matches what the browser builds.
 */
export async function runColliderVisualParityAudit(
  arenaIds: readonly string[] = ALL_ARENA_IDS,
): Promise<ArenaAuditResult[]> {
  // environment-assets reads window.location.search at call time; this audit
  // runs in plain Node, so shim the minimal surface before any layer attaches.
  (globalThis as { window?: unknown }).window ??= { location: { search: '' } };
  // createSignTexture draws with a 2D context; texture CONTENT does not matter
  // for collider parity, so a no-op context proxy is sufficient offscreen.
  (globalThis as { document?: unknown }).document ??= (() => {
    // createSignTexture draws with a 2D context; texture CONTENT does not
    // matter for collider parity, so a no-op context proxy is sufficient
    // offscreen. Gradient factories must return addColorStop-able objects and
    // measureText must return a width (terminalWayfindingMaterial uses both).
    const noopContext = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 8 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => undefined });
        }
        if (prop === 'createPattern') return () => null;
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const makeCanvas = () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      style: {} as CSSStyleDeclaration,
      getContext: () => noopContext,
      width: 0,
      height: 0,
    });
    return {
      createElementNS: () => makeCanvas(),
      createElement: () => makeCanvas(),
    } as unknown as Document;
  })();

  const factories = await loadFactories();
  const results: ArenaAuditResult[] = [];
  for (const id of arenaIds) {
    const entry = factories[id];
    results.push(entry
      ? await auditArena(id, entry.build, entry.enrich)
      : { id, error: 'unknown arena id' });
  }
  return results;
}
