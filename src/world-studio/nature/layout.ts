/**
 * layout.ts — the HF-571 coordinate contract as executable keep-outs, plus the
 * terrain and coastline model every other file in this lane samples.
 *
 * Units are metres, Y up. Playable ground is Y = 0. Everything in this file is
 * a pure function of position and fixed constants, so terrain, tree feet,
 * the water depth mask and the tests all read ONE height field.
 */
import { clamp01, fbm2, lerp, ridged2, smoothstep } from './seeded';

export type Rect = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

/** Playable bounds from the brief. */
export const PLAYABLE: Rect = Object.freeze({ minX: -40, maxX: 40, minZ: -34, maxZ: 34 });
/** Road along Z; hedges and beds never enter it. */
export const ROAD: Rect = Object.freeze({ minX: -11, maxX: 11, minZ: -34, maxZ: 34 });
/** Teal (west) and yellow (east) house footprints, 14 x 18 m centred at X ±20. */
export const HOUSES: readonly Rect[] = Object.freeze([
  Object.freeze({ minX: -27, maxX: -13, minZ: -9, maxZ: 9 }),
  Object.freeze({ minX: 13, maxX: 27, minZ: -9, maxZ: 9 }),
]);
/** Garage wings on Z = +14, 8 x 10 m, at each house's X centre. */
export const GARAGES: readonly Rect[] = Object.freeze([
  Object.freeze({ minX: -24, maxX: -16, minZ: 9, maxZ: 19 }),
  Object.freeze({ minX: 16, maxX: 24, minZ: 9, maxZ: 19 }),
]);
/** Garden sheds 4 x 3.5 m at X ±34, Z -21. */
export const SHEDS: readonly Rect[] = Object.freeze([
  Object.freeze({ minX: -36, maxX: -32, minZ: -22.75, maxZ: -19.25 }),
  Object.freeze({ minX: 32, maxX: 36, minZ: -22.75, maxZ: -19.25 }),
]);
/** Backyard spawn pads (x, z); nothing decorative inside SPAWN_PAD_RADIUS_M. */
export const SPAWN_PADS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-34, -8], [-34, 8], [34, -8], [34, 8],
]);
export const SPAWN_PAD_RADIUS_M = 3.5;
/**
 * Routes hedges must not cross: the garden exits around both house ends
 * (Z ±12), the rear-door corridors (Z ≈ -3 on the yard faces) and the
 * street-front entrance path (Z ≈ +4 on the road faces).
 */
export const HEDGE_LANES: readonly Rect[] = Object.freeze([
  Object.freeze({ minX: -40, maxX: -11, minZ: -14.5, maxZ: -9.5 }),
  Object.freeze({ minX: 11, maxX: 40, minZ: -14.5, maxZ: -9.5 }),
  Object.freeze({ minX: -40, maxX: -11, minZ: 18.5, maxZ: 23.5 }),
  Object.freeze({ minX: 11, maxX: 40, minZ: 18.5, maxZ: 23.5 }),
  Object.freeze({ minX: -31, maxX: -27, minZ: -6, maxZ: 0 }),
  Object.freeze({ minX: 27, maxX: 31, minZ: -6, maxZ: 0 }),
  Object.freeze({ minX: -13, maxX: -11, minZ: 1, maxZ: 7 }),
  Object.freeze({ minX: 11, maxX: 13, minZ: 1, maxZ: 7 }),
]);

export function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function inPlayable(x: number, z: number): boolean {
  return inRect(PLAYABLE, x, z);
}

function nearSpawnPad(x: number, z: number, radius: number): boolean {
  for (const [px, pz] of SPAWN_PADS) {
    const dx = x - px;
    const dz = z - pz;
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

/**
 * Where short lawn tufts and flower beds may stand inside the playable
 * rectangle: not on the road, not in any building, not on a spawn pad.
 */
export function groundCoverAllowed(x: number, z: number): boolean {
  if (!inPlayable(x, z)) return false;
  if (inRect(ROAD, x, z)) return false;
  for (const r of HOUSES) if (inRect(r, x, z)) return false;
  for (const r of GARAGES) if (inRect(r, x, z)) return false;
  for (const r of SHEDS) if (inRect(r, x, z)) return false;
  if (nearSpawnPad(x, z, SPAWN_PAD_RADIUS_M)) return false;
  return true;
}

/** Hedges additionally stay out of every traversal lane in HEDGE_LANES. */
export function hedgeAllowed(x: number, z: number): boolean {
  if (!groundCoverAllowed(x, z)) return false;
  for (const r of HEDGE_LANES) if (inRect(r, x, z)) return false;
  return true;
}

/** Scenery with volume (trunks, rocks) must stand outside this inflation. */
export const SCENERY_MARGIN_M = 4;
export function outsidePlayableMargin(x: number, z: number, margin = SCENERY_MARGIN_M): boolean {
  return !(
    x > PLAYABLE.minX - margin && x < PLAYABLE.maxX + margin
    && z > PLAYABLE.minZ - margin && z < PLAYABLE.maxZ + margin
  );
}

// ---------------------------------------------------------------------------
// Terrain and coastline
// ---------------------------------------------------------------------------

/** Radius where the authored ridge terrain begins (root's ground apron is inside). */
export const TERRAIN_INNER_R = 46;
/** Outer radius of the terrain ring; beyond it the skirt drops away. */
export const TERRAIN_OUTER_R = 560;
/** Coastal sector: centred on -Z, 110 degrees wide (about 30 % of the panorama). */
export const COAST_HALF_ANGLE_DEG = 55;
/** Sea level relative to playable ground. */
export const WATER_LEVEL_Y = -0.6;

const DEG = Math.PI / 180;
const TERRAIN_SEED = 0x57_0d10;

/**
 * 1 inside the coastal sector, 0 in the mountain/forest sectors, with a
 * 12-degree blend so headlands roll into the shore instead of stepping.
 */
export function coastalFactor(x: number, z: number): number {
  const a = Math.abs(Math.atan2(x, -z)) / DEG;
  return 1 - smoothstep(COAST_HALF_ANGLE_DEG - 6, COAST_HALF_ANGLE_DEG + 6, a);
}

function mountainHeight(x: number, z: number, r: number): number {
  const foothill = smoothstep(TERRAIN_INNER_R, 150, r) * 16;
  const azimuth = Math.atan2(x, -z);
  const amplitude = smoothstep(110, 430, r) * 125 * (0.72 + 0.28 * Math.sin(azimuth * 3 + 1.1));
  const crest = ridged2(x * 0.0042, z * 0.0042, 5, TERRAIN_SEED);
  const undulation = fbm2(x * 0.028, z * 0.028, 3, TERRAIN_SEED + 7) * 1.8 * smoothstep(TERRAIN_INNER_R, 90, r);
  const detail = fbm2(x * 0.011, z * 0.011, 4, TERRAIN_SEED + 13) * 9 * smoothstep(100, 300, r);
  return foothill + amplitude * Math.pow(crest, 1.35) + undulation + detail;
}

function coastHeight(x: number, z: number, r: number): number {
  const beach = lerp(0, -0.45, smoothstep(TERRAIN_INNER_R, 72, r));
  const dunes = fbm2(x * 0.06, z * 0.06, 2, TERRAIN_SEED + 21) * 0.35 * (1 - smoothstep(60, 74, r));
  const seabed = -Math.max(0, r - 72) * 0.11;
  const shelf = Math.max(-16, seabed) + fbm2(x * 0.02, z * 0.02, 2, TERRAIN_SEED + 29) * 0.6;
  return beach + dunes + Math.min(0, shelf);
}

/**
 * Authored ground height beyond the playable apron. Inside TERRAIN_INNER_R
 * the value is 0 (the root ground plate). Past TERRAIN_OUTER_R it falls away
 * so the ring never shows a hard rim against the sky.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < TERRAIN_INNER_R) return 0;
  const c = coastalFactor(x, z);
  const h = lerp(mountainHeight(x, z, r), coastHeight(x, z, r), c);
  const skirt = smoothstep(TERRAIN_OUTER_R - 60, TERRAIN_OUTER_R, r);
  return lerp(h, -30, skirt);
}

/** Water depth (m) below sea level at a world point, 0 on dry ground. */
export function waterDepthAt(x: number, z: number): number {
  return Math.max(0, WATER_LEVEL_Y - terrainHeight(x, z));
}

/** Slope-aware ground classification for vertex colours, 0 grass .. 1 rock. */
export function rockiness(x: number, z: number, step = 2): number {
  const h = terrainHeight(x, z);
  const hx = terrainHeight(x + step, z) - h;
  const hz = terrainHeight(x, z + step) - h;
  const slope = Math.hypot(hx, hz) / step;
  return clamp01(smoothstep(0.35, 0.9, slope) + smoothstep(60, 140, h) * 0.5);
}
