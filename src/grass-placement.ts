import { ARENA_BOUNDS, GARAGE_LAYOUT, HOUSE_LAYOUT } from './arena-layout';
import type { Box2 } from './collision';

export const GRASS_GROUND_LAYOUT_ID = 'split-road-verges-v2';
export const GRASS_MAX_BLADES = 2_400;
export const GRASS_BLADES_PER_INSTANCE = 3;
export const GRASS_MAX_HEIGHT = 0.58;

export type GrassGroundRegion = Readonly<{
  id: 'west-verge' | 'east-verge';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

export const GRASS_GROUND_REGIONS: readonly GrassGroundRegion[] = Object.freeze([
  Object.freeze({ id: 'west-verge', minX: -33.35, maxX: -14.2, minZ: -42.35, maxZ: 42.35 }),
  Object.freeze({ id: 'east-verge', minX: 14.2, maxX: 33.35, minZ: -42.35, maxZ: 42.35 }),
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
        width: 0.13 + unit(hash32(shape ^ 0x2c1b3c6d)) * 0.08,
        height: 0.34 + unit(hash32(shape ^ 0x297a2d39)) * (GRASS_MAX_HEIGHT - 0.34),
        phase: unit(hash32(shape ^ 0x9e3779b9)) * Math.PI * 2,
        chunk: regionIndex * 2 + (z >= 0 ? 1 : 0),
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
  const wind = Math.sin(windPhase) * 0.105 + Math.sin(windPhase * 0.47 + 1.7) * 0.035;
  const dx = placement.x - interaction.playerX;
  const dz = placement.z - interaction.playerZ;
  const distance = Math.hypot(dx, dz);
  const radius = Math.max(0.001, interaction.radius);
  const flatten = Math.max(0, Math.min(1, 1 - distance / radius)) * Math.max(0, Math.min(1, interaction.strength));
  const inverse = distance > 0.0001 ? 1 / distance : 0;
  return {
    x: wind + dx * inverse * flatten * 0.26,
    z: Math.cos(windPhase * 0.82) * 0.045 + dz * inverse * flatten * 0.26,
    flatten,
  };
}
