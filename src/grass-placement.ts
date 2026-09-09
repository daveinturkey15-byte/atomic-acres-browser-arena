import { ARENA_BOUNDS, STREET_END_X, GARAGE_LAYOUT, HOUSE_LAYOUT, STREET_HALF_WIDTH } from './arena-layout';
import type { Box2 } from './collision';

export const GRASS_GROUND_LAYOUT_ID = 'manicured-verges-v4';
export const GRASS_MAX_BLADES = 720;
export const GRASS_BLADES_PER_INSTANCE = 3;
export const GRASS_MAX_HEIGHT = 0.22;

/**
 * Hard-surface half depth across the street (metres from the centreline):
 * asphalt to STREET_HALF_WIDTH (6.5), kerbstone band 1.2 m (spec roadway
 * `curbs`: centre |z| 7.1, size 1.2 -> 6.5..7.7), then sidewalk 1.1 m (spec
 * `sidewalks`: centre |z| 8.25, size 1.1 -> 7.7..8.8). Grass must never grow
 * inside this band. Source of truth: STREET_HALF_WIDTH plus the authored
 * roadway table in source-assets/blender/atomic-acres-arena-spec.json.
 */
export const KERB_DEPTH_M = 1.2;
export const SIDEWALK_DEPTH_M = 1.1;
export const HARD_SURFACE_HALF_DEPTH_M = STREET_HALF_WIDTH + KERB_DEPTH_M + SIDEWALK_DEPTH_M;

export type GrassGroundRegion = Readonly<{
  id: 'north-lawn' | 'south-lawn' | 'west-garden' | 'east-garden';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

/**
 * manicured-verges-v4 (Pass 82 "better grass in nuketown"). The v3 regions
 * pre-dated the Pass 78 axis flip ("X runs ALONG the street, Z runs ACROSS
 * it"): their west/east bands at |x| > 14.2 crossed the ENTIRE current
 * street canyon, so both grass consumers (the WebGL2 GrassSystem and the
 * WebGPU 'Pass 64 TSL grass' layer) grew blades on the asphalt, kerbs and
 * pavements at both street ends while the actual back yards behind each
 * house stayed bald. v4 re-derives the two lawn bands from the live layout
 * authority: everything between the pavement edge and the boundary fence,
 * on both sides of the street. Structures and props are rejected separately
 * (insideStructuralFootprint + the caller's collider list).
 */
export const GRASS_GROUND_REGIONS: readonly GrassGroundRegion[] = Object.freeze([
  Object.freeze({
    id: 'north-lawn',
    minX: ARENA_BOUNDS.minX,
    maxX: ARENA_BOUNDS.maxX,
    minZ: ARENA_BOUNDS.minZ,
    maxZ: -HARD_SURFACE_HALF_DEPTH_M,
  }),
  Object.freeze({
    id: 'south-lawn',
    minX: ARENA_BOUNDS.minX,
    maxX: ARENA_BOUNDS.maxX,
    minZ: HARD_SURFACE_HALF_DEPTH_M,
    maxZ: ARENA_BOUNDS.maxZ,
  }),
  // v3: the asphalt ends at STREET_END_X; the end aprons beyond it are lawn
  // at street level all the way to the boundary.
  Object.freeze({
    id: 'west-garden',
    minX: ARENA_BOUNDS.minX,
    maxX: -STREET_END_X,
    minZ: -HARD_SURFACE_HALF_DEPTH_M,
    maxZ: HARD_SURFACE_HALF_DEPTH_M,
  }),
  Object.freeze({
    id: 'east-garden',
    minX: STREET_END_X,
    maxX: ARENA_BOUNDS.maxX,
    minZ: -HARD_SURFACE_HALF_DEPTH_M,
    maxZ: HARD_SURFACE_HALF_DEPTH_M,
  }),
]);

export type GrassPlacement = Readonly<{
  x: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  phase: number;
  chunk: number;
}>;

export type GrassPlacementResult = Readonly<{
  layoutId: typeof GRASS_GROUND_LAYOUT_ID;
  placements: readonly GrassPlacement[];
  checksum: string;
  candidates: number;
  rejectedByStructure: number;
  chunks: number;
}>;

const HOUSE_MARGIN = 0.72;
const COLLIDER_MARGIN = 0.34;
const CANDIDATE_COLUMNS = 48;
const CANDIDATE_ROWS = 96;

function hash32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function unit(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000;
}

function insideExpandedBox(x: number, z: number, box: Box2, margin: number): boolean {
  return x >= box.minX - margin && x <= box.maxX + margin
    && z >= box.minZ - margin && z <= box.maxZ + margin;
}

function insideStructuralFootprint(x: number, z: number): boolean {
  for (const house of HOUSE_LAYOUT) {
    if (Math.abs(x - house.x) <= 10.1 + HOUSE_MARGIN && Math.abs(z - house.z) <= 8.2 + HOUSE_MARGIN) return true;
  }
  for (const garage of GARAGE_LAYOUT) {
    if (Math.abs(x - garage.x) <= 6.25 && Math.abs(z - garage.z) <= 3.7) return true;
  }
  return false;
}

export function isGrassGround(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < ARENA_BOUNDS.minX || x > ARENA_BOUNDS.maxX || z < ARENA_BOUNDS.minZ || z > ARENA_BOUNDS.maxZ) return false;
  return GRASS_GROUND_REGIONS.some((region) => x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ);
}

export function grassPlacementAllowed(x: number, z: number, colliders: readonly Box2[]): boolean {
  if (!isGrassGround(x, z) || insideStructuralFootprint(x, z)) return false;
  return !colliders.some((collider) => insideExpandedBox(x, z, collider, COLLIDER_MARGIN));
}

function placementChecksum(placements: readonly GrassPlacement[]): string {
  let hash = 0x811c9dc5;
  for (const placement of placements) {
    for (const value of [placement.x, placement.z, placement.yaw, placement.width, placement.height, placement.phase, placement.chunk]) {
      const quantized = Math.round(value * 10_000);
      hash ^= quantized;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createGrassPlacements(colliders: readonly Box2[], maximum = GRASS_MAX_BLADES): GrassPlacementResult {
  const limit = Math.max(0, Math.min(GRASS_MAX_BLADES, Math.floor(maximum)));
  const cells = CANDIDATE_COLUMNS * CANDIDATE_ROWS;
  const ordered = Array.from({ length: cells }, (_, index) => index)
    .sort((left, right) => hash32(left ^ 0x51f15e5d) - hash32(right ^ 0x51f15e5d));
  const placements: GrassPlacement[] = [];
  let rejectedByStructure = 0;
  let candidates = 0;

  for (const cell of ordered) {
    const column = cell % CANDIDATE_COLUMNS;
    const row = Math.floor(cell / CANDIDATE_COLUMNS);
    for (let regionIndex = 0; regionIndex < GRASS_GROUND_REGIONS.length; regionIndex += 1) {
      if (placements.length >= limit) break;
      candidates += 1;
      const region = GRASS_GROUND_REGIONS[regionIndex];
      const seed = cell * 2 + regionIndex;
      const jitterX = unit(hash32(seed ^ 0xa341316c));
      const jitterZ = unit(hash32(seed ^ 0xc8013ea4));
      const x = region.minX + ((column + jitterX) / CANDIDATE_COLUMNS) * (region.maxX - region.minX);
      const z = region.minZ + ((row + jitterZ) / CANDIDATE_ROWS) * (region.maxZ - region.minZ);
      if (!grassPlacementAllowed(x, z, colliders)) {
        rejectedByStructure += 1;
        continue;
      }
      const shape = hash32(seed ^ 0xad90777d);
      placements.push(Object.freeze({
        x,
        z,
        yaw: unit(hash32(shape ^ 0x7e95761e)) * Math.PI,
        width: 0.08 + unit(hash32(shape ^ 0x2c1b3c6d)) * 0.05,
        height: 0.1 + unit(hash32(shape ^ 0x297a2d39)) * (GRASS_MAX_HEIGHT - 0.1),
        phase: unit(hash32(shape ^ 0x9e3779b9)) * Math.PI * 2,
        // Four distance-cull chunks: each lawn band splits at the street's
        // mid-X so a camera at one end of the map can drop the far half.
        // (v3 split by z-sign, which the v4 bands make constant per region.)
        // REDESIGN 2026-08-29: the two end-garden strips FOLD INTO their
        // adjacent quadrant chunk (by z-sign and end) so the chunk count and
        // its distance-cull semantics stay exactly four - a garden's blades
        // cull with the map end they sit on.
        chunk: regionIndex < 2
          ? regionIndex * 2 + (x >= (region.minX + region.maxX) / 2 ? 1 : 0)
          : (z < 0 ? 0 : 2) + (x >= 0 ? 1 : 0),
      }));
    }
    if (placements.length >= limit) break;
  }

  return Object.freeze({
    layoutId: GRASS_GROUND_LAYOUT_ID,
    placements: Object.freeze(placements),
    checksum: placementChecksum(placements),
    candidates,
    rejectedByStructure,
    chunks: new Set(placements.map((placement) => placement.chunk)).size,
  });
}

export type GrassInteractionSample = Readonly<{
  playerX: number;
  playerZ: number;
  radius: number;
  strength: number;
}>;

export function evaluateGrassBend(
  placement: GrassPlacement,
  timeSeconds: number,
  interaction: GrassInteractionSample,
): { x: number; z: number; flatten: number } {
  const safeTime = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const windPhase = placement.x * 0.19 + placement.z * 0.13 + safeTime * 1.35;
  const gust = 0.72 + Math.sin(safeTime * 0.42 + placement.x * 0.031 - placement.z * 0.027) * 0.28;
  const wind = (Math.sin(windPhase) * 0.12 + Math.sin(windPhase * 2.17 + 1.7) * 0.026) * gust;
  const crosswind = (Math.cos(windPhase * 0.82) * 0.062 + Math.sin(windPhase * 3.1) * 0.018) * gust;
  const dx = placement.x - interaction.playerX;
  const dz = placement.z - interaction.playerZ;
  const distance = Math.hypot(dx, dz);
  const radius = Math.max(0.001, interaction.radius);
  const flatten = Math.max(0, Math.min(1, 1 - distance / radius)) * Math.max(0, Math.min(1, interaction.strength));
  const inverse = distance > 0.0001 ? 1 / distance : 0;
  return {
    x: wind + dx * inverse * flatten * 0.26,
    z: crosswind + dz * inverse * flatten * 0.26,
    flatten,
  };
}
