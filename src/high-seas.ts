import * as THREE from 'three';
import {
  createBallisticSurface,
  type BallisticMaterialId,
  type BallisticSurface,
} from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';
import type { ArenaVerticalNavigation } from './vertical-navigation';

export const HIGH_SEAS_LEVELS = Object.freeze({
  engine: 0,
  mainDeck: 3.2,
  upperDeck: 6.2,
  roof: 8.92,
  ocean: -2.2,
});

/** Below the keel and waterline; playable engine support is authored explicitly. */
export const HIGH_SEAS_SAFETY_FLOOR_Y = -6;

export const HIGH_SEAS_BOUNDS: Box2 = Object.freeze({
  minX: -12,
  maxX: 12,
  minZ: -44,
  maxZ: 44,
});

export const HIGH_SEAS_ENGINE_ACCESS = Object.freeze({
  width: 2.6,
  run: 4.1,
  rise: HIGH_SEAS_LEVELS.mainDeck,
  bowFoot: [0, HIGH_SEAS_LEVELS.engine, -20.15] as const,
  bowTop: [0, HIGH_SEAS_LEVELS.mainDeck, -24.25] as const,
  sternFoot: [0, HIGH_SEAS_LEVELS.engine, 20.15] as const,
  sternTop: [0, HIGH_SEAS_LEVELS.mainDeck, 24.25] as const,
});

export type HighSeasArenaMap = Omit<ArenaMap, 'id'> & { id: 'high-seas' };

export type HighSeasRouteAnchor = Readonly<{
  id: string;
  /** Feet-space position. Player eye height is added by the movement layer. */
  position: readonly [number, number, number];
}>;

export type HighSeasPortal = Readonly<{
  id: string;
  purpose: 'movement' | 'sightline' | 'engine-access';
  aperture: Readonly<Required<Pick<Box2, 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ'>>>;
}>;

type AuthorityEntry = Readonly<{
  name: string;
  bounds: Box2;
  mesh: THREE.Mesh;
  solid: boolean;
  shots: boolean;
  ballisticSurfaceId: string | null;
  externalPhysicsAuthority: string | null;
}>;

type WalkableAuthority = Readonly<{
  id: string;
  presentationName: string;
  bounds: Box2;
  y: number;
  navigation: 'bot' | 'player-only';
  ballisticSurfaceId: string;
}>;

type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  shotSurfaces: BallisticSurface[];
  physicalCover: ArenaMap['physicalCover'];
  authorities: AuthorityEntry[];
  walkable: WalkableAuthority[];
  ballisticSurfaceSequence: number;
};

type BoxOptions = {
  solid?: boolean;
  shots?: boolean;
  cover?: boolean;
  rotation?: [number, number, number];
  cast?: boolean;
  detail?: 'core' | 'performance' | 'quality';
  ballisticMaterial?: BallisticMaterialId;
  externalPhysicsAuthority?: string;
  walkable?: Readonly<{
    id: string;
    elevation: number;
    navigation: 'bot' | 'player-only';
  }>;
};

const DECK_THICKNESS = 0.28;
const CABIN_HALF_WIDTH = 7.4;
const CABIN_GROUND_WALL_HEIGHT = 2.68;
const CABIN_UPPER_WALL_HEIGHT = 2.6;
const RAMP_THICKNESS = 0.18;

export type HighSeasTextureFamily =
  | 'deck'
  | 'stair'
  | 'hull'
  | 'wall'
  | 'roof'
  | 'teal-trim'
  | 'engine-bulkhead'
  | 'engine-grating'
  | 'engine-machinery'
  | 'engine-amber'
  | 'engine-practical'
  | 'upholstery'
  | 'glass'
  | 'water';

export type HighSeasMaterialInventoryEntry = Readonly<{
  name: string;
  family: HighSeasTextureFamily;
  hasMap: boolean;
  hasNormalMap: boolean;
  hasRoughnessMap: boolean;
  resolution: number;
  /** Metres of world covered by one texture tile. */
  tileMetres: number;
}>;

const TEXTURE_CACHE = new Map<string, THREE.DataTexture>();

function hash2D(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 15485863) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise2D(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2D(ix, iy, seed);
  const n10 = hash2D(ix + 1, iy, seed);
  const n01 = hash2D(ix, iy + 1, seed);
  const n11 = hash2D(ix + 1, iy + 1, seed);

  const a = n00 + sx * (n10 - n00);
  const b = n01 + sx * (n11 - n01);
  return a + sy * (b - a);
}

function fbm2D(x: number, y: number, octaves = 3, seed = 0): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amp * smoothNoise2D(x * freq, y * freq, seed + i * 31);
    total += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return value / total;
}

function createDataTexture(
  name: string,
  width: number,
  height: number,
  data: Uint8Array,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
  repeat: [number, number] = [1, 1],
): THREE.DataTexture {
  const cacheKey = `${name}:${width}x${height}:${colorSpace}:${repeat[0]}x${repeat[1]}`;
  const existing = TEXTURE_CACHE.get(cacheKey);
  if (existing) return existing;

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = `high-seas-tex-${name}`;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
}

function normalsFromHeights(
  width: number,
  height: number,
  heights: Float32Array,
  strength = 3.0,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const yPrev = (y - 1 + height) % height;
    const yNext = (y + 1) % height;
    for (let x = 0; x < width; x += 1) {
      const xPrev = (x - 1 + width) % width;
      const xNext = (x + 1) % width;

      const hL = heights[y * width + xPrev];
      const hR = heights[y * width + xNext];
      const hD = heights[yPrev * width + x];
      const hU = heights[yNext * width + x];

      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;

      const len = Math.hypot(dx, dy, 1.0);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1.0 / len;

      const offset = (y * width + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round((nx * 0.5 + 0.5) * 255), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round((ny * 0.5 + 0.5) * 255), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round((nz * 0.5 + 0.5) * 255), 0, 255);
      data[offset + 3] = 255;
    }
  }
  return data;
}

/**
 * World size, in metres, that ONE tile of each family's texture covers.
 *
 * WHY THIS EXISTS. The first pass at these materials set a fixed `repeat` per
 * family, which meant texel density scaled with the mesh: the same wall texture
 * that read as 1-metre composite panels on a 20 m superstructure collapsed into
 * a dense brick grid on a 2 m crate. Density has to be a property of the WORLD,
 * not of the mesh, so it is expressed here in metres and applied through UVs.
 *
 * Values are chosen from the feature size baked into each generator: `wall`
 * draws a 4x4 grid of panels per tile, so 4 m/tile yields 1 m panels; `deck`
 * draws 8 planks per tile, so 1.1 m/tile yields ~14 cm planks.
 */
export const HIGH_SEAS_TILE_METRES: Readonly<Record<HighSeasTextureFamily, number>> = Object.freeze({
  deck: 1.1,
  stair: 0.9,
  hull: 5.0,
  wall: 4.0,
  roof: 3.0,
  'teal-trim': 2.0,
  'engine-bulkhead': 3.0,
  'engine-grating': 1.2,
  'engine-machinery': 1.5,
  'engine-amber': 1.0,
  // A practical strip is a 1.6 m fixture: 0.6 m/tile puts roughly three lit
  // diffuser segments on each run instead of one smeared gradient.
  'engine-practical': 0.6,
  upholstery: 0.8,
  glass: 3.0,
  water: 4.0,
});

/**
 * Rewrites a geometry's UVs as a world-scale box projection.
 *
 * Each vertex is projected along its dominant normal axis and divided by the
 * family's tile size, so one texture tile always covers the same number of
 * metres no matter how large the mesh is. This is what makes a shared material
 * viable: the material and its texture stay shared (one upload, one draw-call
 * group), while density is carried per-vertex in the geometry.
 *
 * Runs once at build time, so it costs nothing per frame. Local coordinates are
 * used deliberately - box geometry here is authored at true world size with no
 * mesh scaling, and projecting locally keeps the grain aligned to the object
 * rather than swimming when the object is rotated.
 */
function applyBoxProjectedUv(geometry: THREE.BufferGeometry, tileMetres: number): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  const inverse = 1 / Math.max(0.05, tileMetres);
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));

    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      // Faces pointing along X read the ZY plane.
      u = pz;
      v = py;
    } else if (ny >= nx && ny >= nz) {
      // Horizontal faces (decks, roofs) read the XZ plane, so plank runs stay
      // aligned with the hull's long axis.
      u = px;
      v = pz;
    } else {
      u = px;
      v = py;
    }

    uv[index * 2] = u * inverse;
    uv[index * 2 + 1] = v * inverse;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.getAttribute('uv').needsUpdate = true;
}

/** Tile size for whatever material a mesh was given, or null when untextured. */
function tileMetresForMaterial(meshMaterial: THREE.Material): number | null {
  const family = meshMaterial.userData?.textureFamily as HighSeasTextureFamily | undefined;
  if (!family) return null;
  return HIGH_SEAS_TILE_METRES[family] ?? null;
}

type ProceduralTextureSet = {
  map?: THREE.DataTexture;
  normalMap?: THREE.DataTexture;
  roughnessMap?: THREE.DataTexture;
  /** Metres of world covered by one texture tile; applied through the UVs. */
  tileMetres: number;
};

function generateMaterialTextureSet(
  family: HighSeasTextureFamily,
  baseColorHex: number,
): ProceduralTextureSet {
  const size = 256;
  const baseR = (baseColorHex >> 16) & 255;
  const baseG = (baseColorHex >> 8) & 255;
  const baseB = baseColorHex & 255;

  const albedoData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const heightData = new Float32Array(size * size);

  let hasAlbedo = true;
  let normalStrength = 3.0;

  switch (family) {
    case 'deck':
    case 'stair': {
      normalStrength = 3.8;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const plankIdx = Math.floor(x / 32);
          const px = x % 32;
          const isCaulk = px < 3;
          const plankTone = (hash2D(plankIdx, 0, family === 'deck' ? 101 : 202) - 0.5) * 0.18;
          const grain = (Math.sin(y * 0.15 + Math.sin(x * 0.08) * 2.5) * 0.5 + 0.5) * 0.14
            + (smoothNoise2D(x * 0.25, y * 0.05, 42) - 0.5) * 0.10;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isCaulk) {
            albedoData[offset] = 26;
            albedoData[offset + 1] = 24;
            albedoData[offset + 2] = 22;
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 230;
            roughnessData[offset + 1] = 230;
            roughnessData[offset + 2] = 230;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.10;
          } else {
            const edgeDist = Math.min(px - 3, 31 - px);
            const bevel = Math.min(1.0, edgeDist / 2.0);
            const r = THREE.MathUtils.clamp(Math.round(baseR * (1 + plankTone + grain) * (0.85 + 0.15 * bevel)), 0, 255);
            const g = THREE.MathUtils.clamp(Math.round(baseG * (1 + plankTone + grain) * (0.85 + 0.15 * bevel)), 0, 255);
            const b = THREE.MathUtils.clamp(Math.round(baseB * (1 + plankTone + grain) * (0.85 + 0.15 * bevel)), 0, 255);

            albedoData[offset] = r;
            albedoData[offset + 1] = g;
            albedoData[offset + 2] = b;
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.60 + (1.0 - bevel) * 0.15 + grain * 0.05) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.70 + 0.25 * bevel + grain * 0.08;
          }
        }
      }
      break;
    }

    case 'hull': {
      normalStrength = 2.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const py = y % 64;
          const isSeam = py < 2;
          const micro = (smoothNoise2D(x * 0.2, y * 0.2, 7) - 0.5) * 0.04;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isSeam) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.85), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.85), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.85), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 115;
            roughnessData[offset + 1] = 115;
            roughnessData[offset + 2] = 115;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.25;
          } else {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * (1 + micro)), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * (1 + micro)), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * (1 + micro)), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.24 + micro * 0.04) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.85 + micro * 0.1;
          }
        }
      }
      break;
    }

    case 'wall': {
      normalStrength = 3.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = x % 64;
          const py = y % 64;
          const distX = Math.min(px, 64 - px);
          const distY = Math.min(py, 64 - py);
          const edgeDist = Math.min(distX, distY);
          const isSeam = edgeDist < 2;
          const bevel = edgeDist >= 2 ? Math.min(1.0, (edgeDist - 2) / 4.0) : 0;
          const surfaceNoise = (smoothNoise2D(x * 0.1, y * 0.1, 13) - 0.5) * 0.03;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isSeam) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.70), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.70), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.70), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 175;
            roughnessData[offset + 1] = 175;
            roughnessData[offset + 2] = 175;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.15;
          } else {
            const factor = (1 + surfaceNoise) * (0.88 + 0.12 * bevel);
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * factor), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * factor), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * factor), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.40 + (1.0 - bevel) * 0.18) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.30 + 0.65 * bevel + surfaceNoise * 0.05;
          }
        }
      }
      break;
    }

    case 'roof': {
      normalStrength = 3.2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = x % 64;
          const py = y % 128;
          const distX = Math.min(px, 64 - px);
          const distY = Math.min(py, 128 - py);
          const isSeam = distX < 2 || distY < 2;
          const isRivet = (Math.abs(px - 10) < 3 || Math.abs(px - 54) < 3) && (Math.abs(py - 12) < 3 || Math.abs(py - 116) < 3);
          const brushed = (smoothNoise2D(x * 0.5, y * 0.04, 33) - 0.5) * 0.08;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isRivet) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 1.15), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 1.15), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 1.15), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 56;
            roughnessData[offset + 1] = 56;
            roughnessData[offset + 2] = 56;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.95;
          } else if (isSeam) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.68), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.68), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.68), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 140;
            roughnessData[offset + 1] = 140;
            roughnessData[offset + 2] = 140;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.20;
          } else {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * (1 + brushed)), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * (1 + brushed)), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * (1 + brushed)), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.28 + brushed * 0.06) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.75 + brushed * 0.1;
          }
        }
      }
      break;
    }

    case 'teal-trim': {
      normalStrength = 2.8;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const brushed = (smoothNoise2D(x * 0.6, y * 0.06, 55) - 0.5) * 0.14;
          const band = Math.cos((x * Math.PI * 2) / 128) * 0.06;
          const factor = 1 + brushed + band;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * factor), 0, 255);
          albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * factor), 0, 255);
          albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * factor), 0, 255);
          albedoData[offset + 3] = 255;

          const rough = THREE.MathUtils.clamp(Math.round((0.28 + (smoothNoise2D(x * 0.1, y * 0.1, 77) - 0.5) * 0.05) * 255), 0, 255);
          roughnessData[offset] = rough;
          roughnessData[offset + 1] = rough;
          roughnessData[offset + 2] = rough;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = 0.70 + brushed * 0.15;
        }
      }
      break;
    }

    case 'engine-bulkhead': {
      normalStrength = 4.0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = x % 64;
          const isSeam = px < 3;
          const isRivet = Math.abs(px - 8) < 3 && y % 24 < 3;
          const mottle = (fbm2D(x * 0.06, y * 0.06, 3, 88) - 0.5) * 0.15;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isRivet) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 1.25), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 1.25), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 1.25), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 95;
            roughnessData[offset + 1] = 95;
            roughnessData[offset + 2] = 95;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.95;
          } else if (isSeam) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.60), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.60), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.60), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 184;
            roughnessData[offset + 1] = 184;
            roughnessData[offset + 2] = 184;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.20;
          } else {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * (1 + mottle)), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * (1 + mottle)), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * (1 + mottle)), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.52 + mottle * 0.08) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.70 + mottle * 0.1;
          }
        }
      }
      break;
    }

    case 'engine-grating': {
      normalStrength = 4.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const u = (x + y) % 16 - 8;
          const v = (x - y + 1600) % 16 - 8;
          const diamondDist = Math.abs(u) * 1.4 + Math.abs(v);
          const isTread = diamondDist < 4.5;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isTread) {
            const treadPeak = 1.0 - diamondDist / 4.5;
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * (1.2 + 0.8 * treadPeak)), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * (1.2 + 0.8 * treadPeak)), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * (1.2 + 0.8 * treadPeak)), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.28 + 0.10 * (1.0 - treadPeak)) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.45 + 0.50 * treadPeak;
          } else {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.60), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.60), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.60), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 204;
            roughnessData[offset + 1] = 204;
            roughnessData[offset + 2] = 204;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.20;
          }
        }
      }
      break;
    }

    case 'engine-machinery': {
      normalStrength = 3.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = x % 64;
          const py = y % 64;
          const isLouver = px >= 12 && px <= 52 && py % 16 < 6;
          const isFlange = px < 4 || px >= 60 || py < 4 || py >= 60;
          const castNoise = (smoothNoise2D(x * 0.3, y * 0.3, 109) - 0.5) * 0.08;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          if (isLouver) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 0.45), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 0.45), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 0.45), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 178;
            roughnessData[offset + 1] = 178;
            roughnessData[offset + 2] = 178;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.15;
          } else if (isFlange) {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * 1.15), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * 1.15), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * 1.15), 0, 255);
            albedoData[offset + 3] = 255;

            roughnessData[offset] = 82;
            roughnessData[offset + 1] = 82;
            roughnessData[offset + 2] = 82;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.85;
          } else {
            albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * (1 + castNoise)), 0, 255);
            albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * (1 + castNoise)), 0, 255);
            albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * (1 + castNoise)), 0, 255);
            albedoData[offset + 3] = 255;

            const rough = THREE.MathUtils.clamp(Math.round((0.42 + castNoise * 0.06) * 255), 0, 255);
            roughnessData[offset] = rough;
            roughnessData[offset + 1] = rough;
            roughnessData[offset + 2] = rough;
            roughnessData[offset + 3] = 255;

            heightData[pIndex] = 0.65 + castNoise * 0.1;
          }
        }
      }
      break;
    }

    case 'engine-amber': {
      normalStrength = 3.0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const ridge = Math.sin((y * Math.PI) / 8) * 0.5 + 0.5;
          const factor = 0.85 + 0.30 * ridge;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * factor), 0, 255);
          albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * factor), 0, 255);
          albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * factor), 0, 255);
          albedoData[offset + 3] = 255;

          const rough = THREE.MathUtils.clamp(Math.round((0.30 + 0.12 * (1.0 - ridge)) * 255), 0, 255);
          roughnessData[offset] = rough;
          roughnessData[offset + 1] = rough;
          roughnessData[offset + 2] = rough;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = 0.40 + 0.55 * ridge;
        }
      }
      break;
    }

    case 'engine-practical': {
      // A lit diffuser, not a painted panel: a bright lens down the middle of
      // each tile, dimmer toward the edges, broken by the end caps that divide
      // one fixture from the next. This map is used as the practical's
      // emissiveMap as well as its albedo, so the pattern is what the strip
      // actually GLOWS as - a flat emissive colour would read as a featureless
      // white bar at the brightness this fixture has to run at.
      normalStrength = 2.2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          // Lens runs along x; caps repeat every 128 texels (0.3 m of world).
          const across = Math.abs((y / size) * 2 - 1);
          const lens = Math.cos(across * Math.PI * 0.5) ** 0.6;
          const capPhase = x % 128;
          const isCap = capPhase < 7;
          const rib = 0.94 + 0.06 * Math.sin((x % 16) * Math.PI / 8);
          const factor = isCap ? 0.16 : (0.34 + 0.66 * lens) * rib;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * factor), 0, 255);
          albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * factor), 0, 255);
          albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * factor), 0, 255);
          albedoData[offset + 3] = 255;

          const rough = THREE.MathUtils.clamp(Math.round((isCap ? 0.62 : 0.24 + 0.14 * (1 - lens)) * 255), 0, 255);
          roughnessData[offset] = rough;
          roughnessData[offset + 1] = rough;
          roughnessData[offset + 2] = rough;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = isCap ? 0.15 : 0.55 + 0.35 * lens;
        }
      }
      break;
    }

    case 'upholstery': {
      normalStrength = 3.2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const cellX = Math.floor(x / 4);
          const cellY = Math.floor(y / 4);
          const subX = (x % 4) / 4;
          const subY = (y % 4) / 4;
          const isWarp = (cellX + cellY) % 2 === 0;
          const thread = isWarp ? Math.sin(subX * Math.PI) : Math.sin(subY * Math.PI);
          const factor = 0.82 + 0.30 * thread;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          albedoData[offset] = THREE.MathUtils.clamp(Math.round(baseR * factor), 0, 255);
          albedoData[offset + 1] = THREE.MathUtils.clamp(Math.round(baseG * factor), 0, 255);
          albedoData[offset + 2] = THREE.MathUtils.clamp(Math.round(baseB * factor), 0, 255);
          albedoData[offset + 3] = 255;

          const rough = THREE.MathUtils.clamp(Math.round((0.78 + 0.08 * (1.0 - thread)) * 255), 0, 255);
          roughnessData[offset] = rough;
          roughnessData[offset + 1] = rough;
          roughnessData[offset + 2] = rough;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = 0.45 + 0.35 * thread;
        }
      }
      break;
    }

    case 'glass': {
      hasAlbedo = false;
      normalStrength = 1.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;
          const wave = smoothNoise2D(x * 0.05, y * 0.05, 31) * 0.04;

          roughnessData[offset] = 36;
          roughnessData[offset + 1] = 36;
          roughnessData[offset + 2] = 36;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = 0.5 + wave;
        }
      }
      break;
    }

    case 'water': {
      hasAlbedo = false;
      normalStrength = 3.5;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const wave = Math.sin(x * 0.12 + y * 0.08) * 0.35
            + Math.sin(x * 0.06 - y * 0.15) * 0.35
            + (smoothNoise2D(x * 0.1, y * 0.1, 99) - 0.5) * 0.3;
          const offset = (y * size + x) * 4;
          const pIndex = y * size + x;

          roughnessData[offset] = 26;
          roughnessData[offset + 1] = 26;
          roughnessData[offset + 2] = 26;
          roughnessData[offset + 3] = 255;

          heightData[pIndex] = 0.5 + wave * 0.4;
        }
      }
      break;
    }
  }

  const normalData = normalsFromHeights(size, size, heightData, normalStrength);

  const map = hasAlbedo
    ? createDataTexture(`${family}-albedo`, size, size, albedoData, THREE.SRGBColorSpace)
    : undefined;

  const normalMap = createDataTexture(
    `${family}-normal`,
    size,
    size,
    normalData,
    THREE.NoColorSpace,
  );

  const roughnessMap = createDataTexture(
    `${family}-roughness`,
    size,
    size,
    roughnessData,
    THREE.NoColorSpace,
  );

  return { map, normalMap, roughnessMap, tileMetres: HIGH_SEAS_TILE_METRES[family] };
}

function pbrMaterial(
  name: string,
  family: HighSeasTextureFamily,
  color: number,
  roughness: number,
  metalness: number,
  emissive = 0,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  const textures = generateMaterialTextureSet(family, color);
  const value = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    ...(textures.map ? { map: textures.map } : {}),
    ...(textures.normalMap ? { normalMap: textures.normalMap } : {}),
    ...(textures.roughnessMap ? { roughnessMap: textures.roughnessMap } : {}),
  });
  value.name = `high-seas-${name}`;
  value.userData.assetOwner = 'high-seas';
  value.userData.assetKind = 'procedural-original-material';
  value.userData.textureFamily = family;
  return value;
}

function material(
  name: string,
  color: number,
  roughness: number,
  metalness: number,
  emissive = 0,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  const familyLookup: Record<string, HighSeasTextureFamily> = {
    'pearl-hull': 'hull',
    'warm-cabin-shell': 'wall',
    'silver-roof': 'roof',
    'honey-deck': 'deck',
    'dark-deck-stair': 'stair',
    'deep-teal-trim': 'teal-trim',
    'engine-bulkhead': 'engine-bulkhead',
    'engine-grating': 'engine-grating',
    'engine-machinery': 'engine-machinery',
    'engine-amber': 'engine-amber',
    'engine-practical': 'engine-practical',
    'cabana-upholstery': 'upholstery',
  };
  const family = familyLookup[name] ?? 'wall';
  return pbrMaterial(name, family, color, roughness, metalness, emissive, emissiveIntensity);
}

/**
 * Below-deck lighting (HF-373, and the Pass 77 correction to it).
 *
 * HF-373 read the owner's "too dark down at the bottom of hijacked" as a
 * brightness problem and answered it the only way the emissive-only policy
 * allowed: a dedicated fixture material for the strips, plus an emissive fill
 * on the three sealed-volume families. That was a real improvement over pure
 * black and it is why those two ideas survive below - but it could not work,
 * because emissive geometry illuminates nothing but itself.
 *
 * Measured on hardware WebGPU, standing in the corridor at eye height, the
 * result was mean 46/255 with 85% of the frame below 12/255, and the deck plate
 * under the player's own feet at 6/255 with 99% crushed: bright bars hanging in
 * a void, no walls, no floor, nothing to read a body against.
 *
 * The fix is three things, in order of how much each moved the measurement:
 *  1. real light. Eight shadowed-local spot practicals authored on the arena
 *     DEFINITION (rendering/arenas/high-seas.ts), each aimed straight down
 *     inside a declared volume whose ceiling is below the main deck. They cast
 *     shadows, so they cannot spill through a bulkhead - which is the property
 *     the emissive-only policy existed to protect in the first place.
 *  2. surfaces that can answer it. The families were 58-74% metallic over a
 *     2-5% albedo, so they stayed black even under a full rig; see
 *     BELOW_DECK_METALNESS.
 *  3. the emissive sources step DOWN, not up. With a key present, a fill that
 *     takes no falloff and no shadow only flattens the depth the light just
 *     created.
 *
 * What has not changed: everything here is still scoped to materials that exist
 * only inside the sealed volume, because the one thing this must not do is
 * brighten the open deck above. The practicals still own their own material
 * rather than sharing `engine-amber` with the DECK-LEVEL hatch guards, so the
 * strips can be tuned without the guards glowing along with them.
 */
const BELOW_DECK_PRACTICAL_EMISSIVE_INTENSITY = 1.4;
/**
 * Residual fill, now that the service deck has real lights.
 *
 * These numbers used to be the ONLY thing standing between the corridor and
 * pure black, so they were pushed as far as an emissive lift can go (grating
 * sat at 1.15). Emissive is self-lit: it takes no falloff, no shadow and no
 * direction, so pushing it flattens exactly the depth the owner wants back.
 * The first practical rig therefore dropped the fill to a floor-of-black role
 * - and the Pass 79 re-measurement showed that overshot: with the rig live the
 * deck plate under the player still read median 12/255 with 50% of pixels
 * crushed, and the engine-room walls 28-33% crushed between fixture pools.
 * Crushed pixels are by definition outside the pool cores, so no fixture
 * intensity reaches them; the fill is the only lever that does, and it is
 * re-raised to a measured middle ground - well under the old 1.15, well above
 * floor-of-black. It remains the entire below-deck lighting story on the
 * `performance`/`compat` profiles, where ArenaContrastLighting builds no rig.
 *
 * Pass 79 (gauntlet round 3) re-measurement on hardware WebGPU against the
 * production bundle: the corridor legs and ramp mouths are fightable (mean
 * 117-121/255, <1% crushed), but the deck plate between fixture pools still
 * read median 28.9/255 with 36% of pixels crushed and 46% under-readable
 * (station `floor-check-down`, z=-6). Crushed pixels sit between pool cores,
 * so fixture intensity cannot reach them; the textured grating fill is the
 * only lever that does. 0.5 -> 0.8, still under the old flat 1.15 and still
 * routed through the family's own albedo so plate seams keep their contrast.
 */
const BELOW_DECK_FILL = Object.freeze({
  bulkhead: Object.freeze({ tint: 0x9fc3d2, intensity: 0.28 }),
  machinery: Object.freeze({ tint: 0xa8c4cc, intensity: 0.19 }),
  // Grating is the ONE filled family with deck-plane exposure (hatch rims and
  // ramp tops), so it must stay the dimmest or below-deck light is visible from
  // up top as glowing deck furniture. It was authored at 0.8 - brighter than
  // bulkhead AND machinery - which is the exact trap the leak gate guards.
  // 0.436 puts its effective lift (intensity x emissive x albedo) at 80% of the
  // dimmer of the other two. Brighten the corridor through the PRACTICALS, which
  // have no deck exposure, not through the floor.
  grating: Object.freeze({ tint: 0x86a8b4, intensity: 0.436 }),
});

/**
 * Below-deck surface response.
 *
 * The measured second cause of the darkness. The three service-deck families
 * were authored at metalness 0.58-0.74 over a 2-5% albedo. A metal surface has
 * almost no diffuse response, so those surfaces returned nearly nothing no
 * matter what lit them: with a full practical rig injected into the live scene,
 * the deck plate under the player's own feet still measured 20/255 mean with
 * 94% of pixels crushed, and only dropping metalness moved it (43/255 at 0.15).
 *
 * Painted marine steel is a dielectric - bulkheads and deck plate are painted,
 * so they belong near zero. The machinery keeps the most metal of the three
 * because bare machined housings genuinely are metal, and it is cover rather
 * than a walkable surface, so it is allowed to stay moodier.
 */
const BELOW_DECK_METALNESS = Object.freeze({
  bulkhead: 0.16,
  grating: 0.18,
  machinery: 0.34,
});

/**
 * Lifts a below-deck material off pure black without flattening it.
 *
 * The lift is routed through `emissiveMap` (the family's own albedo) instead of
 * a flat emissive colour: panel lines, louvers and flange edges keep their
 * contrast, so a player still reads shape and depth - and an enemy still reads
 * as a silhouette against a textured wall rather than against a milk-white
 * slab. `belowDeckFill` is the tag the leak test asserts against.
 */
function applyEnclosedVolumeFill(
  value: THREE.MeshStandardMaterial,
  fill: Readonly<{ tint: number; intensity: number }>,
): THREE.MeshStandardMaterial {
  value.emissive.setHex(fill.tint);
  value.emissiveIntensity = fill.intensity;
  if (value.map) value.emissiveMap = value.map;
  value.userData.belowDeckFill = true;
  value.userData.belowDeckFillTint = fill.tint;
  value.userData.belowDeckFillIntensity = fill.intensity;
  return value;
}

/** The service-deck light strips: a real fixture, not a tinted accent panel. */
function createPracticalMaterial(): THREE.MeshStandardMaterial {
  const value = material('engine-practical', 0xffe6c4, 0.26, 0.04, 0xffc27a, BELOW_DECK_PRACTICAL_EMISSIVE_INTENSITY);
  // The diffuser pattern drives the glow, not just the albedo, so the strip
  // reads as a lit lens with end caps instead of a uniform bar.
  if (value.map) value.emissiveMap = value.map;
  value.userData.belowDeckFill = true;
  value.userData.belowDeckPractical = true;
  return value;
}

function containedWaterMaterial(name: string, color: number): THREE.MeshStandardMaterial {
  const textures = generateMaterialTextureSet('water', color);
  const value = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    metalness: 0.28,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    ...(textures.normalMap ? { normalMap: textures.normalMap } : {}),
    ...(textures.roughnessMap ? { roughnessMap: textures.roughnessMap } : {}),
  });
  value.name = `high-seas-${name}`;
  value.userData.assetOwner = 'high-seas';
  value.userData.assetKind = 'contained-presentation-water';
  value.userData.waterScope = 'contained-feature-only';
  value.userData.textureFamily = 'water';
  return value;
}

export function getHighSeasMaterialInventory(): readonly HighSeasMaterialInventoryEntry[] {
  const definitions: Array<{ name: string; family: HighSeasTextureFamily; color: number }> = [
    { name: 'pearl-hull', family: 'hull', color: 0xeaf1ef },
    { name: 'warm-cabin-shell', family: 'wall', color: 0xf5f3e9 },
    { name: 'silver-roof', family: 'roof', color: 0xcbd6d5 },
    { name: 'honey-deck', family: 'deck', color: 0xb78653 },
    { name: 'dark-deck-stair', family: 'stair', color: 0x5a4032 },
    { name: 'deep-teal-trim', family: 'teal-trim', color: 0x164c58 },
    { name: 'engine-bulkhead', family: 'engine-bulkhead', color: 0x5c7078 },
    { name: 'engine-grating', family: 'engine-grating', color: 0x4e6067 },
    { name: 'engine-machinery', family: 'engine-machinery', color: 0x77878b },
    { name: 'engine-amber', family: 'engine-amber', color: 0xd7a441 },
    // HF-373: the practicals stopped sharing engine-amber, so the inventory
    // contract grew to 14 rather than the strips borrowing a material that also
    // appears above deck.
    { name: 'engine-practical', family: 'engine-practical', color: 0xffe6c4 },
    { name: 'cabana-upholstery', family: 'upholstery', color: 0x4b8790 },
    { name: 'side-glass', family: 'glass', color: 0x5e9ca8 },
    { name: 'contained-feature-water', family: 'water', color: 0x2db9c4 },
  ];

  return Object.freeze(
    definitions.map(({ name, family, color }) => {
      const tex = generateMaterialTextureSet(family, color);
      return Object.freeze({
        name: `high-seas-${name}`,
        family,
        hasMap: tex.map !== undefined,
        hasNormalMap: tex.normalMap !== undefined,
        hasRoughnessMap: tex.roughnessMap !== undefined,
        resolution: 256,
        tileMetres: tex.tileMetres,
      });
    }),
  );
}

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(...size);
  // Density is a property of the world, not of the mesh: project the shared
  // material's texture at a fixed metres-per-tile so a 2 m crate and a 20 m
  // bulkhead show the same panel size.
  const boxTileMetres = tileMetresForMaterial(meshMaterial);
  if (boxTileMetres !== null) applyBoxProjectedUv(geometry, boxTileMetres);

  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  mesh.userData.assetOwner = 'high-seas';
  mesh.userData.assetKind = 'procedural-original-geometry';
  mesh.userData.highSeasDetail = options.detail ?? 'core';
  mesh.userData.impactSurface = classifyImpactSurface({
    name,
    metalness: meshMaterial instanceof THREE.MeshStandardMaterial ? meshMaterial.metalness : undefined,
  });
  builder.root.add(mesh);

  const solid = options.solid !== false;
  const shots = options.shots ?? solid;
  const bounds: Box2 = {
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
    ...(options.rotation ? { rotation: options.rotation } : {}),
  };

  let ballisticSurfaceId: string | null = null;
  if (shots) {
    builder.raycastMeshes.push(mesh);
    const surface = createBallisticSurface(
      `high-seas:${builder.ballisticSurfaceSequence}:${name}`,
      name,
      bounds,
      {
        impactSurface: mesh.userData.impactSurface as ReturnType<typeof classifyImpactSurface>,
        material: options.ballisticMaterial ?? 'reinforced',
      },
    );
    builder.ballisticSurfaceSequence += 1;
    builder.shotSurfaces.push(surface);
    ballisticSurfaceId = surface.id;
    mesh.userData.ballisticSurfaceId = surface.id;
    mesh.userData.ballisticMaterial = surface.material;
  } else {
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.highSeasPresentationOnly = true;
    mesh.raycast = () => undefined;
  }

  if (solid) {
    builder.colliders.push(bounds);
    builder.physicsColliders.push(bounds);
    mesh.userData.collisionAuthority = name;
  }
  if (options.cover) {
    if (!solid || !shots) throw new Error(`High Seas cover ${name} must block both movement and shots`);
    builder.physicalCover.push({
      id: name,
      bounds,
      blocksMovement: true,
      blocksShots: true,
    });
  }
  if (options.walkable) {
    if (!solid || !ballisticSurfaceId) throw new Error(`High Seas platform ${name} requires shared authority`);
    builder.walkable.push({
      id: options.walkable.id,
      presentationName: name,
      bounds,
      y: options.walkable.elevation,
      navigation: options.walkable.navigation,
      ballisticSurfaceId,
    });
  }
  builder.authorities.push({
    name,
    bounds,
    mesh,
    solid,
    shots,
    ballisticSurfaceId,
    externalPhysicsAuthority: options.externalPhysicsAuthority ?? null,
  });
  return mesh;
}

function detailBox(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  rotation?: [number, number, number],
  detail: 'performance' | 'quality' = 'performance',
): THREE.Mesh {
  return box(builder, name, position, size, meshMaterial, {
    solid: false,
    shots: false,
    rotation,
    cast: detail === 'quality',
    detail,
  });
}

function coverBox(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  ballisticMaterial: BallisticMaterialId,
  rotation?: [number, number, number],
): THREE.Mesh {
  return box(builder, name, position, size, meshMaterial, {
    cover: true,
    rotation,
    ballisticMaterial,
  });
}

function presentationMesh(
  builder: Builder,
  name: string,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  detail: 'performance' | 'quality' = 'performance',
): THREE.Mesh {
  const presentationTileMetres = tileMetresForMaterial(meshMaterial);
  if (presentationTileMetres !== null) applyBoxProjectedUv(geometry, presentationTileMetres);

  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = detail === 'quality';
  mesh.receiveShadow = true;
  mesh.userData.assetOwner = 'high-seas';
  mesh.userData.assetKind = 'procedural-original-geometry';
  mesh.userData.highSeasDetail = detail;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.userData.highSeasPresentationOnly = true;
  mesh.raycast = () => undefined;
  builder.root.add(mesh);
  return mesh;
}

function addWalkableBox(
  builder: Builder,
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  meshMaterial: THREE.Material,
  elevation: number,
  navigation: 'bot' | 'player-only',
): THREE.Mesh {
  return box(builder, `high-seas-platform-${id}`, position, size, meshMaterial, {
    ballisticMaterial: 'structural-metal',
    walkable: { id, elevation, navigation },
  });
}

function addRamp(
  builder: Builder,
  id: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  width: number,
  meshMaterial: THREE.Material,
  ballisticMaterial: BallisticMaterialId,
): Readonly<{
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  angleDegrees: number;
}> {
  const deltaX = to[0] - from[0];
  const deltaZ = to[2] - from[2];
  if (Math.abs(deltaX) > 1e-6) throw new Error(`High Seas ramp ${id} must remain Z-aligned`);
  const run = Math.abs(deltaZ);
  const rise = to[1] - from[1];
  const angle = Math.atan2(rise, run);
  const rotationX = -Math.sign(deltaZ) * angle;
  const length = Math.hypot(run, rise);
  const position: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2 - Math.cos(angle) * RAMP_THICKNESS / 2,
    (from[2] + to[2]) / 2,
  ];
  const size: [number, number, number] = [width, RAMP_THICKNESS, length];
  const rotation: [number, number, number] = [rotationX, 0, 0];
  const ramp = box(builder, `high-seas-ramp-${id}`, position, size, meshMaterial, {
    rotation,
    ballisticMaterial,
  });
  ramp.userData.highSeasRampId = id;
  ramp.userData.rampFrom = [...from];
  ramp.userData.rampTo = [...to];
  return { position, size, rotation, angleDegrees: THREE.MathUtils.radToDeg(angle) };
}

type MergedBoxPart = Readonly<{
  center: readonly [number, number, number];
  size: readonly [number, number, number];
}>;

/** Concatenates indexed geometries that carry position and normal attributes. */
function concatGeometries(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    if (!position || !normal || !index) throw new Error('High Seas merged geometry requires indexed position+normal');
    const base = positions.length / 3;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
    }
    for (let entry = 0; entry < index.count; entry += 1) indices.push(index.getX(entry) + base);
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/**
 * Bakes many axis-aligned dressing boxes of ONE material into a single
 * presentation mesh.
 *
 * WHY. The visible-geometry budget counts draw calls, and dressing such as
 * stair treads, light strips, machinery bands and the hull-void liner is many
 * small boxes sharing one material - one draw each was most of the budget.
 * Parts are re-expressed relative to their shared AABB centre before merging:
 * `applyBoxProjectedUv` reads LOCAL coordinates, so a group baked at raw world
 * coordinates far from the origin would smear its UV span across unrelated
 * axes and break the world-space texel-density invariant.
 */
function mergedDetailBoxes(
  builder: Builder,
  name: string,
  parts: readonly MergedBoxPart[],
  meshMaterial: THREE.Material,
  portalAuditExclusionReason?: string,
): THREE.Mesh {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], part.center[axis] - part.size[axis] / 2);
      max[axis] = Math.max(max[axis], part.center[axis] + part.size[axis] / 2);
    }
  }
  const origin: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const geometry = concatGeometries(parts.map((part) => {
    const partGeometry = new THREE.BoxGeometry(...part.size);
    partGeometry.translate(part.center[0] - origin[0], part.center[1] - origin[1], part.center[2] - origin[2]);
    return partGeometry;
  }));
  const mesh = presentationMesh(builder, name, geometry, meshMaterial, origin);
  if (portalAuditExclusionReason) {
    // Same idiom as the sculpted hull: a concave enclosing group has a
    // conservative world AABB that would falsely flag every portal it spans.
    mesh.userData.portalAuditExcluded = true;
    mesh.userData.portalAuditExclusionReason = portalAuditExclusionReason;
  }
  return mesh;
}

function addRampTreads(
  builder: Builder,
  id: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  width: number,
  treadMaterial: THREE.Material,
): void {
  const parts: MergedBoxPart[] = [];
  for (let step = 1; step <= 10; step += 1) {
    const progress = step / 11;
    parts.push({
      center: [
        THREE.MathUtils.lerp(from[0], to[0], progress),
        THREE.MathUtils.lerp(from[1], to[1], progress) + 0.035,
        THREE.MathUtils.lerp(from[2], to[2], progress),
      ],
      size: [width - 0.16, 0.055, 0.22],
    });
  }
  mergedDetailBoxes(builder, `high-seas-${id}-treads`, parts, treadMaterial);
}

function createHullGeometry(): THREE.BufferGeometry {
  const rings = [
    { z: -44.0, width: 1.25, chine: 0.88, keel: -4.5 },
    { z: -41.0, width: 5.4, chine: 4.15, keel: -5.25 },
    { z: -40.45, width: 10.3, chine: 7.65, keel: -5.48 },
    { z: -36.5, width: 10.25, chine: 7.7, keel: -5.7 },
    { z: 35.5, width: 10.35, chine: 7.8, keel: -5.75 },
    { z: 42.2, width: 9.65, chine: 7.2, keel: -5.15 },
    { z: 43.5, width: 10.35, chine: 7.55, keel: -4.85 },
    { z: 44.0, width: 8.3, chine: 6.1, keel: -4.6 },
  ] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    const v = ringIndex / (rings.length - 1);
    for (const [x, y, u] of [
      [-ring.width, 2.9, 0],
      [-ring.chine, -1.8, 0.25],
      [0, ring.keel, 0.5],
      [ring.chine, -1.8, 0.75],
      [ring.width, 2.9, 1],
    ] as const) {
      positions.push(x, y, ring.z);
      uvs.push(u, v);
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const start = ringIndex * 5;
    const next = start + 5;
    for (let strip = 0; strip < 4; strip += 1) {
      if (strip < 2) {
        indices.push(start + strip, next + strip + 1, next + strip);
        indices.push(start + strip, start + strip + 1, next + strip + 1);
      } else {
        indices.push(start + strip, next + strip, next + strip + 1);
        indices.push(start + strip, next + strip + 1, start + strip + 1);
      }
    }
  }
  indices.push(0, 2, 1, 0, 3, 2, 0, 4, 3);
  const stern = (rings.length - 1) * 5;
  indices.push(stern, stern + 1, stern + 2, stern, stern + 2, stern + 3, stern, stern + 3, stern + 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addDecks(builder: Builder, deckMaterial: THREE.Material): void {
  const centerY = HIGH_SEAS_LEVELS.mainDeck - DECK_THICKNESS / 2;
  const add = (id: string, x: number, z: number, width: number, depth: number): void => {
    addWalkableBox(
      builder,
      id,
      [x, centerY, z],
      [width, DECK_THICKNESS, depth],
      deckMaterial,
      HIGH_SEAS_LEVELS.mainDeck,
      'bot',
    );
  };

  add('bow-tip', 0, -42.25, 8.0, 3.5);
  add('bow-shoulder', 0, -39.0, 20.8, 3.0);
  add('bow-spawn', 0, -33.25, 20.8, 8.5);
  add('bow-cabin-forward', 0, -26.775, 20.8, 4.45);
  add('bow-hatch-port', -5.975, -22.15, 8.85, 4.8);
  add('bow-hatch-starboard', 5.975, -22.15, 8.85, 4.8);
  add('bow-cabin-aft', 0, -16.375, 20.8, 6.75);
  add('center', 0, 0, 20.8, 26);
  add('stern-cabin-forward', 0, 16.375, 20.8, 6.75);
  add('stern-hatch-port', -5.975, 22.15, 8.85, 4.8);
  add('stern-hatch-starboard', 5.975, 22.15, 8.85, 4.8);
  add('stern-cabin-aft', 0, 26.775, 20.8, 4.45);
  add('stern-spawn', 0, 36.25, 20.8, 14.5);
  add('port-viewing-catwalk', -11.0, 0, 1.5, 22);
}

function addUpperFloor(
  builder: Builder,
  prefix: 'bow' | 'stern',
  stairX: number,
  holeMinZ: number,
  holeMaxZ: number,
  cabinMinZ: number,
  cabinMaxZ: number,
  deckMaterial: THREE.Material,
): void {
  const holeMinX = stairX - 1.05;
  const holeMaxX = stairX + 1.05;
  const centerY = HIGH_SEAS_LEVELS.upperDeck - DECK_THICKNESS / 2;
  const add = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): void => {
    if (maxX - minX <= 0 || maxZ - minZ <= 0) return;
    addWalkableBox(
      builder,
      `${prefix}-upper-${id}`,
      [(minX + maxX) / 2, centerY, (minZ + maxZ) / 2],
      [maxX - minX, DECK_THICKNESS, maxZ - minZ],
      deckMaterial,
      HIGH_SEAS_LEVELS.upperDeck,
      'bot',
    );
  };
  add('port', -CABIN_HALF_WIDTH, holeMinX, cabinMinZ, cabinMaxZ);
  add('starboard', holeMaxX, CABIN_HALF_WIDTH, cabinMinZ, cabinMaxZ);
  add('stair-forward', holeMinX, holeMaxX, cabinMinZ, holeMinZ);
  add('stair-aft', holeMinX, holeMaxX, holeMaxZ, cabinMaxZ);
}

function addSplitEndWall(
  builder: Builder,
  name: string,
  z: number,
  centerX: number,
  openingWidth: number,
  y: number,
  height: number,
  wallMaterial: THREE.Material,
): void {
  const openingMin = centerX - openingWidth / 2;
  const openingMax = centerX + openingWidth / 2;
  const leftWidth = openingMin + CABIN_HALF_WIDTH;
  const rightWidth = CABIN_HALF_WIDTH - openingMax;
  if (leftWidth > 0) {
    box(builder, `${name}-port`, [-CABIN_HALF_WIDTH + leftWidth / 2, y, z], [leftWidth, height, 0.22], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
  }
  if (rightWidth > 0) {
    box(builder, `${name}-starboard`, [openingMax + rightWidth / 2, y, z], [rightWidth, height, 0.22], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
  }
}

function addCabin(
  builder: Builder,
  end: 'bow' | 'stern',
  wallMaterial: THREE.Material,
  deckMaterial: THREE.Material,
  roofMaterial: THREE.Material,
  stairMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  glassMaterial: THREE.Material,
): Readonly<{
  internalRoute: HighSeasRouteAnchor[];
  externalRoute: HighSeasRouteAnchor[];
  internalAccess: ReturnType<typeof addRamp>;
  externalAccess: ReturnType<typeof addRamp>;
}> {
  const direction = end === 'bow' ? -1 : 1;
  const minZ = end === 'bow' ? -29 : 13;
  const maxZ = end === 'bow' ? -13 : 29;
  const innerZ = direction * 13;
  const outerZ = direction * 29;
  const centerZ = direction * 21;
  const internalX = direction < 0 ? 4.6 : -4.6;
  const externalX = -internalX;
  const groundY = HIGH_SEAS_LEVELS.mainDeck + CABIN_GROUND_WALL_HEIGHT / 2;
  const upperY = HIGH_SEAS_LEVELS.upperDeck + CABIN_UPPER_WALL_HEIGHT / 2;

  addSplitEndWall(builder, `high-seas-${end}-ground-inner-wall`, innerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);
  addSplitEndWall(builder, `high-seas-${end}-ground-outer-wall`, outerZ, 0, 3.4, groundY, CABIN_GROUND_WALL_HEIGHT, wallMaterial);

  const doorMinZ = centerZ - 1.6;
  const doorMaxZ = centerZ + 1.6;
  for (const [side, x] of [['port', -CABIN_HALF_WIDTH], ['starboard', CABIN_HALF_WIDTH]] as const) {
    const firstDepth = doorMinZ - minZ;
    const secondDepth = maxZ - doorMaxZ;
    if (firstDepth > 0) {
      box(builder, `high-seas-${end}-ground-${side}-wall-forward`, [x, groundY, minZ + firstDepth / 2], [0.22, CABIN_GROUND_WALL_HEIGHT, firstDepth], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
    if (secondDepth > 0) {
      box(builder, `high-seas-${end}-ground-${side}-wall-aft`, [x, groundY, doorMaxZ + secondDepth / 2], [0.22, CABIN_GROUND_WALL_HEIGHT, secondDepth], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
  }

  const internalLow: readonly [number, number, number] = [internalX, HIGH_SEAS_LEVELS.mainDeck, direction * 15.9];
  const internalHigh: readonly [number, number, number] = [internalX, HIGH_SEAS_LEVELS.upperDeck, direction * 20.7];
  const holeMinZ = Math.min(internalLow[2], internalHigh[2]) - 0.55;
  const holeMaxZ = Math.max(internalLow[2], internalHigh[2]) + 0.55;
  addUpperFloor(builder, end, internalX, holeMinZ, holeMaxZ, minZ, maxZ, deckMaterial);
  const internalAccess = addRamp(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, stairMaterial, 'wood');
  addRampTreads(builder, `${end}-internal-stair`, internalLow, internalHigh, 1.8, trimMaterial);

  const externalLow: readonly [number, number, number] = [externalX, HIGH_SEAS_LEVELS.mainDeck, direction * 33.9];
  const externalHigh: readonly [number, number, number] = [externalX, HIGH_SEAS_LEVELS.upperDeck, direction * 29.1];
  const externalAccess = addRamp(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, stairMaterial, 'wood');
  addRampTreads(builder, `${end}-external-stair`, externalLow, externalHigh, 1.8, trimMaterial);

  // Upper inner windows are true apertures: the sill, header and side wall pieces
  // frame empty space rather than hiding an opaque blocker behind glass.
  addSplitEndWall(builder, `high-seas-${end}-upper-inner-wall`, innerZ, 0, 4.4, upperY, CABIN_UPPER_WALL_HEIGHT, wallMaterial);
  box(builder, `high-seas-${end}-upper-window-sill`, [0, 6.43, innerZ], [4.4, 0.46, 0.22], wallMaterial, {
    ballisticMaterial: 'interior-wall',
  });
  box(builder, `high-seas-${end}-upper-window-header`, [0, 8.53, innerZ], [4.4, 0.54, 0.22], wallMaterial, {
    ballisticMaterial: 'interior-wall',
  });
  addSplitEndWall(builder, `high-seas-${end}-upper-outer-wall`, outerZ, externalX, 2.3, upperY, CABIN_UPPER_WALL_HEIGHT, wallMaterial);

  // Side upper-storey windows are framed apertures, not decoration (HF-392).
  // A sill and a header band run each cabin side between the end walls,
  // mirroring the inner end-wall window's aperture band (y 6.66..8.26); the
  // full-height mullions below divide that band into five bays; and every bay
  // is glazed with movement- and shot-authoritative glass. The previous panes
  // were rotated 90 degrees - each was a 2.6 m glass fin perpendicular to the
  // wall, jutting into the room and out over the water - while the bay behind
  // it stayed open air a player could walk out through, and the pane itself
  // was presentation-only so shots never interacted with it.
  const GLAZING_HALF_THICKNESS = 0.03;
  const APERTURE_BOTTOM = HIGH_SEAS_LEVELS.upperDeck + 0.46;
  const APERTURE_TOP = HIGH_SEAS_LEVELS.upperDeck + CABIN_UPPER_WALL_HEIGHT - 0.54;
  for (const [side, x] of [
    ['port', -CABIN_HALF_WIDTH],
    ['starboard', CABIN_HALF_WIDTH],
  ] as const) {
    box(builder, `high-seas-${end}-upper-${side}-window-sill`, [x, HIGH_SEAS_LEVELS.upperDeck + 0.23, centerZ], [0.22, 0.46, maxZ - minZ], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
    box(builder, `high-seas-${end}-upper-${side}-window-header`, [x, APERTURE_TOP + 0.27, centerZ], [0.22, 0.54, maxZ - minZ], wallMaterial, {
      ballisticMaterial: 'interior-wall',
    });
    // Bay boundaries are the end-wall inner faces (+/-7.89) and the mullion
    // faces (+/-2.11/2.39 and +/-6.26/6.54 relative to the cabin centre);
    // each pane is inset 3 cm per edge so no pane face sits coplanar with a
    // mullion face or a band face.
    for (const [bayCenter, bayWidth] of [
      [-7.215, 1.23], [-4.185, 4.03], [0, 4.1], [4.185, 4.03], [7.215, 1.23],
    ] as const) {
      box(builder, `high-seas-${end}-upper-${side}-glazing-${bayCenter}`, [x, (APERTURE_BOTTOM + APERTURE_TOP) / 2, centerZ + bayCenter], [GLAZING_HALF_THICKNESS * 2, APERTURE_TOP - APERTURE_BOTTOM - 0.02, bayWidth], glassMaterial, {
        shots: true,
        ballisticMaterial: 'glass',
      });
    }
    for (const segmentCenter of [centerZ - 6.4, centerZ - 2.25, centerZ + 2.25, centerZ + 6.4]) {
      box(builder, `high-seas-${end}-upper-${side}-mullion-${segmentCenter}`, [x, upperY, segmentCenter], [0.18, CABIN_UPPER_WALL_HEIGHT, 0.28], wallMaterial, {
        ballisticMaterial: 'interior-wall',
      });
    }
  }

  box(builder, `high-seas-${end}-cabin-roof`, [0, HIGH_SEAS_LEVELS.roof - 0.1, centerZ], [15.4, 0.2, 16.6], roofMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  detailBox(builder, `high-seas-${end}-roof-teal-inlay`, [0, HIGH_SEAS_LEVELS.roof + 0.015, centerZ], [10.8, 0.035, 10.6], trimMaterial);

  // Collision-backed interior furniture gives each cabin useful cover without
  // sealing the central entrances or either exterior side door.
  coverBox(builder, `high-seas-${end}-galley-island`, [0, 3.76, direction * 16.4], [3.4, 1.12, 1.05], trimMaterial, 'structural-metal');
  coverBox(builder, `high-seas-${end}-side-locker-port`, [-6.1, 3.83, direction * 24.6], [1.55, 1.26, 2.3], wallMaterial, 'interior-wall');
  coverBox(builder, `high-seas-${end}-side-locker-starboard`, [6.1, 3.83, direction * 24.6], [1.55, 1.26, 2.3], wallMaterial, 'interior-wall');

  for (const mastX of [-2.2, 2.2]) {
    presentationMesh(
      builder,
      `high-seas-${end}-roof-antenna-${mastX}`,
      new THREE.CylinderGeometry(0.055, 0.08, 1.4, 8),
      trimMaterial,
      [mastX, 9.62, centerZ],
      [0, 0, 0],
      'quality',
    );
  }
  presentationMesh(
    builder,
    `high-seas-${end}-roof-radome`,
    new THREE.SphereGeometry(0.58, 16, 10),
    roofMaterial,
    [0, 9.36, centerZ],
    [0, 0, 0],
    'quality',
  );

  return {
    internalRoute: [
      { id: `${end}-internal-main`, position: internalLow },
      { id: `${end}-internal-mid`, position: [internalX, 4.7, direction * 18.3] },
      { id: `${end}-internal-upper`, position: internalHigh },
      { id: `${end}-upper-room`, position: [0, HIGH_SEAS_LEVELS.upperDeck, centerZ] },
    ],
    externalRoute: [
      { id: `${end}-external-main`, position: externalLow },
      { id: `${end}-external-mid`, position: [externalX, 4.7, direction * 31.5] },
      { id: `${end}-external-upper`, position: externalHigh },
      { id: `${end}-upper-room`, position: [0, HIGH_SEAS_LEVELS.upperDeck, centerZ] },
    ],
    internalAccess,
    externalAccess,
  };
}

function addEngineRoom(
  builder: Builder,
  floorMaterial: THREE.Material,
  wallMaterial: THREE.Material,
  machineryMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  practicalMaterial: THREE.Material,
): Readonly<{
  bow: ReturnType<typeof addRamp>;
  stern: ReturnType<typeof addRamp>;
}> {
  addWalkableBox(
    builder,
    'engine-floor',
    [0, -0.06, 0],
    [5.8, 0.12, 40.2],
    floorMaterial,
    HIGH_SEAS_LEVELS.engine,
    'bot',
  ).castShadow = false;

  // Hijacked-style service deck. The whole below-deck is a cramped one-man
  // corridor that flares into a small mid-ship engine room; it is the ONLY
  // playable volume under the main deck, so every face of it - side walls,
  // width-change shoulders, and the end bulkheads past the ramp mouths - is
  // solid movement+shot authority. The hull void beyond stays presentation
  // (see addHullBilge).
  //
  // Clear half-widths per section. The vestibule mouth stays wide enough that
  // the authored engine-foot portal aperture (x +/-1.05) remains genuinely
  // open; the connecting corridor is deliberately shoulder-width.
  const CORRIDOR_HALF = 0.72;
  const ROOM_HALF = 2.35;
  const VESTIBULE_HALF = 1.35;
  const WALL = 0.24;
  const ROOM_END = 6.5;
  const NARROW_END = 18.6;
  const FLOOR_END = 20.1;
  // Walls span y -0.12..2.92 so they meet the deck underside exactly: the old
  // walls topped out at 2.84 and leaked a 0.08 m sightline seam into the void.
  const wallY = 1.4;
  const wallHeight = 3.04;
  const solidWall = (name: string, position: [number, number, number], size: [number, number, number]): void => {
    box(builder, name, position, size, wallMaterial, { ballisticMaterial: 'structural-metal' });
  };

  for (const [sideName, side] of [['port', -1], ['starboard', 1]] as const) {
    solidWall(
      `high-seas-engine-room-wall-${sideName}`,
      [side * (ROOM_HALF + WALL / 2), wallY, 0],
      [WALL, wallHeight, ROOM_END * 2],
    );
    for (const [endName, direction] of [['bow', -1], ['stern', 1]] as const) {
      solidWall(
        `high-seas-engine-corridor-wall-${endName}-${sideName}`,
        [side * (CORRIDOR_HALF + WALL / 2), wallY, direction * (ROOM_END + NARROW_END) / 2],
        [WALL, wallHeight, NARROW_END - ROOM_END],
      );
      solidWall(
        `high-seas-engine-vestibule-wall-${endName}-${sideName}`,
        [side * (VESTIBULE_HALF + WALL / 2), wallY, direction * (NARROW_END + FLOOR_END) / 2],
        [WALL, wallHeight, FLOOR_END - NARROW_END],
      );
      // Transverse shoulders seal each width change so the stepped wall line
      // has no open slot into the hull void.
      solidWall(
        `high-seas-engine-room-shoulder-${endName}-${sideName}`,
        [side * ((CORRIDOR_HALF + ROOM_HALF + WALL) / 2), wallY, direction * ROOM_END],
        [ROOM_HALF + WALL - CORRIDOR_HALF, wallHeight, WALL],
      );
      solidWall(
        `high-seas-engine-vestibule-shoulder-${endName}-${sideName}`,
        [side * ((CORRIDOR_HALF + VESTIBULE_HALF + WALL) / 2), wallY, direction * NARROW_END],
        [VESTIBULE_HALF + WALL - CORRIDOR_HALF, wallHeight, WALL],
      );
      // P0: both corridor ends used to stop at the floor edge, so the strip
      // beside each ramp dropped players through the ocean into the hull void.
      // End bulkheads close the plane at z=+/-20.1 except the ramp mouth.
      solidWall(
        `high-seas-engine-end-bulkhead-${endName}-${sideName}`,
        [side * 1.435, wallY, direction * (FLOOR_END + 0.12)],
        [0.37, wallHeight, WALL],
      );
    }
  }

  const bow = addRamp(
    builder,
    'bow-engine-access',
    HIGH_SEAS_ENGINE_ACCESS.bowFoot,
    HIGH_SEAS_ENGINE_ACCESS.bowTop,
    HIGH_SEAS_ENGINE_ACCESS.width,
    floorMaterial,
    'structural-metal',
  );
  const stern = addRamp(
    builder,
    'stern-engine-access',
    HIGH_SEAS_ENGINE_ACCESS.sternFoot,
    HIGH_SEAS_ENGINE_ACCESS.sternTop,
    HIGH_SEAS_ENGINE_ACCESS.width,
    floorMaterial,
    'structural-metal',
  );
  // Metal treads give the service ramps the same authored step read as the
  // cabin stairs (they were the only ramps without treads).
  addRampTreads(builder, 'bow-engine-access', HIGH_SEAS_ENGINE_ACCESS.bowFoot, HIGH_SEAS_ENGINE_ACCESS.bowTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial);
  addRampTreads(builder, 'stern-engine-access', HIGH_SEAS_ENGINE_ACCESS.sternFoot, HIGH_SEAS_ENGINE_ACCESS.sternTop, HIGH_SEAS_ENGINE_ACCESS.width, floorMaterial);

  for (const [end, z] of [['bow', -22.15], ['stern', 22.15]] as const) {
    for (const x of [-1.52, 1.52]) {
      box(builder, `high-seas-${end}-hatch-guard-${x}`, [x, 3.72, z], [0.12, 1.04, 4.7], accentMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
    box(builder, `high-seas-${end}-hatch-end-guard`, [0, 3.72, end === 'bow' ? -19.72 : 19.72], [3.1, 1.04, 0.12], accentMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  // HATCH SHAFT WALLS (Pass 77).
  //
  // The end bulkheads close the corridor plane at z = +/-20.22, but only across
  // |x| 1.25..1.62 - the ramp mouth itself is open, as it must be. Past that
  // plane the ramp shaft had NO side walls between the floor and the deck
  // underside, so a player who walked up the ramp could step off it sideways at
  // z beyond -20.34 and drop into the hull void. The old Rapier escape probe
  // only reported this sealed by accident: parking one extra collider 30 m
  // BELOW the map - touching nothing - flipped that probe to a failure with an
  // identical end position, which means its previous pass came from collider
  // ordering rather than from geometry.
  //
  // These walls are the actual seal, and they are the vertical continuation of
  // the hatch rims already sitting at y 2.92..3.2 directly above them, so the
  // shaft now reads as one trunk from deck plane to service deck.
  for (const [end, direction] of [['bow', -1], ['stern', 1]] as const) {
    for (const [sideName, side] of [['port', -1], ['starboard', 1]] as const) {
      box(builder, `high-seas-${end}-hatch-shaft-wall-${sideName}`, [side * 1.44, 1.4, direction * 22.3], [0.24, 3.04, 4.4], wallMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
  }

  // P1: the deck hatch apertures are wider and longer than their 2.6 m ramps,
  // which left open slivers falling (and shooting) straight through to water.
  // Solid rims close the shaft flush with the deck plane on both sides of the
  // ramp and across the gap behind each ramp's top edge.
  for (const [end, direction] of [['bow', -1], ['stern', 1]] as const) {
    for (const [sideName, side] of [['port', -1], ['starboard', 1]] as const) {
      box(builder, `high-seas-${end}-hatch-rim-${sideName}`, [side * 1.425, 3.06, direction * 22.15], [0.25, 0.28, 4.8], floorMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
    box(builder, `high-seas-${end}-hatch-rim-end`, [0, 3.06, direction * 24.4], [3.1, 0.28, 0.3], floorMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  // Machinery hugs the engine-room walls in an alternating weave: cover, not
  // corridor - the middle lane stays a single player wide.
  const machineryLayout = [-4.6, -2.3, 0, 2.3, 4.6];
  for (const [index, z] of machineryLayout.entries()) {
    const x = index % 2 === 0 ? -1.62 : 1.62;
    coverBox(builder, `high-seas-engine-machinery-${index}`, [x, 0.72, z], [1.18, 1.44, 2.15], machineryMaterial, 'structural-metal');
  }
  // SIGHTLINE BREAK (Pass 77 layout audit).
  //
  // Measured on the authored map: a player standing at the bow ramp foot
  // (0, 1.7, -18.5) had a completely unbroken line to the stern ramp foot
  // 37 m away. The corridor confines a player to |x| <= 0.3 once the 0.42 m
  // capsule radius is taken off its 0.72 m half-width, so every below-deck
  // engagement was a dead-straight duel down the map's FASTEST lane - the
  // engine route is 50.7 m against ~68 m for all three surface lanes.
  //
  // The exhaust trunk fixes it with the one thing a real engine room has at its
  // centreline anyway: the uptake carrying exhaust to the funnel. At 0.9 m
  // across it covers |x| <= 0.45, which is wider than the |x| <= 0.3 a corridor
  // player can occupy, so NO corridor-to-corridor line survives - that is a
  // geometric guarantee, not a placement that happens to work, and the test
  // asserts it from both ramp feet.
  //
  // It costs no route: the z=0 machinery is on the port side, so the trunk
  // leaves a 1.9 m starboard bypass - wider than the 1.44 m corridor players
  // already walk - and the engine through-route now weaves around it.
  coverBox(builder, 'high-seas-engine-exhaust-trunk', [0, 1.45, 0], [0.9, 2.9, 0.9], machineryMaterial, 'structural-metal');
  detailBox(builder, 'high-seas-engine-exhaust-trunk-collar', [0, 2.72, 0], [1.12, 0.16, 1.12], accentMaterial);

  mergedDetailBoxes(
    builder,
    'high-seas-engine-machinery-bands',
    machineryLayout.map((z, index) => ({
      center: [index % 2 === 0 ? -1.62 : 1.62, 1.02, z] as const,
      size: [1.24, 0.1, 2.2] as const,
    })),
    accentMaterial,
  );

  // The old below-deck ceiling was the teak deck underside; a service deck
  // reads as metal, so a thin bulkhead-family liner hangs just under it.
  mergedDetailBoxes(builder, 'high-seas-engine-ceiling', [
    { center: [0, 2.895, 0], size: [ROOM_HALF * 2, 0.05, ROOM_END * 2] },
    { center: [0, 2.895, -(ROOM_END + NARROW_END) / 2], size: [CORRIDOR_HALF * 2, 0.05, NARROW_END - ROOM_END] },
    { center: [0, 2.895, (ROOM_END + NARROW_END) / 2], size: [CORRIDOR_HALF * 2, 0.05, NARROW_END - ROOM_END] },
    { center: [0, 2.895, -19.175], size: [VESTIBULE_HALF * 2, 0.05, 1.15] },
    { center: [0, 2.895, 19.175], size: [VESTIBULE_HALF * 2, 0.05, 1.15] },
  ], wallMaterial);

  // The visible fixtures: emissive strips under the ceiling liner, the full
  // length of the service deck. These are the LENSES - the thing you see when
  // you look up. The light they appear to cast is authored separately, as eight
  // shadowed-local spot practicals on the arena definition, positioned on this
  // same centre line so lens and pool line up (see HIGH_SEAS_SERVICE_DECK_
  // PRACTICALS in rendering/arenas/high-seas.ts). Keep the two in step: moving
  // a strip run without moving its fixture leaves a lit floor under no lamp.
  const lightStrips: MergedBoxPart[] = [];
  // Engine room: transverse runs plus a wash down each side, because a single
  // centre line left the 4.7 m bulge dark at both walls.
  for (const z of [-5.2, -2.6, 0, 2.6, 5.2]) lightStrips.push({ center: [0, 2.845, z], size: [2.6, 0.05, 0.16] });
  for (const side of [-1, 1]) {
    lightStrips.push({ center: [side * (ROOM_HALF - 0.3), 2.845, 0], size: [0.16, 0.05, ROOM_END * 2 - 0.6] });
  }
  // Corridor: a fixture every 2.6 m, long enough that the runs overlap in
  // perspective and the corridor reads as continuous depth, not as dots.
  for (const direction of [-1, 1]) {
    for (const z of [7.9, 10.5, 13.1, 15.7]) lightStrips.push({ center: [0, 2.845, direction * z], size: [0.16, 0.05, 2.0] });
    lightStrips.push({ center: [0, 2.845, direction * 17.9], size: [0.16, 0.05, 1.2] });
    lightStrips.push({ center: [0, 2.845, direction * 19.35], size: [0.16, 0.05, 1.1] });
  }
  mergedDetailBoxes(builder, 'high-seas-engine-light-strips', lightStrips, practicalMaterial);

  // Floor-level guide strips: a lit kick line at the base of each wall. They
  // were introduced when emissive was all there was, to give the floor an edge;
  // they survive the move to real light because a kick line is genuine ship
  // fitting-out and it carries the run's depth cue past the last fixture, where
  // the practicals no longer reach. Presentation only - a 0.08 m lip flush
  // against a wall that already owns the collision.
  const guideStrips: MergedBoxPart[] = [];
  for (const side of [-1, 1]) {
    guideStrips.push({ center: [side * (ROOM_HALF - 0.05), 0.04, 0], size: [0.1, 0.08, ROOM_END * 2 - 0.4] });
    for (const direction of [-1, 1]) {
      guideStrips.push({
        center: [side * (CORRIDOR_HALF - 0.05), 0.04, direction * (ROOM_END + NARROW_END) / 2],
        size: [0.1, 0.08, NARROW_END - ROOM_END - 0.4],
      });
      guideStrips.push({
        center: [side * (VESTIBULE_HALF - 0.05), 0.04, direction * (NARROW_END + FLOOR_END) / 2],
        size: [0.1, 0.08, FLOOR_END - NARROW_END - 0.2],
      });
    }
  }
  mergedDetailBoxes(builder, 'high-seas-engine-floor-guide-strips', guideStrips, practicalMaterial);

  // Twin service pipes hug the ceiling inside the narrow corridor profile.
  const pipeGeometry = concatGeometries([-0.45, 0.45].map((x) => {
    const cylinder = new THREE.CylinderGeometry(0.1, 0.1, 36, 10);
    cylinder.rotateX(Math.PI / 2);
    cylinder.translate(x, 0, 0);
    return cylinder;
  }));
  presentationMesh(builder, 'high-seas-engine-service-pipes', pipeGeometry, accentMaterial, [0, 2.62, 0]);

  return { bow, stern };
}

/**
 * Dry hull interior liner.
 *
 * WHY. The sculpted hull is backface-culled presentation and the SHARED ocean
 * plane runs straight through it at y=-2.2, so before this liner everything
 * below deck outside the corridor read as open water. The liner authors a
 * dark bilge floor above the expected wave envelope plus inner hull walls up
 * to the deck underside, so the space under the deck reads as a boat's hull,
 * not ocean. Players can never reach this volume - the service corridor is
 * fully sealed - so the liner stays presentation-only, mirroring the sculpted
 * hull's own authority model. Part extents stay inside the hull's chine line
 * so nothing pokes through the visible hull above the waterline.
 */
function addHullBilge(builder: Builder, floorMaterial: THREE.Material, wallMaterial: THREE.Material): void {
  // Top of the bilge plate sits above expectedWaveEnvelope.maximumY (-1.85).
  const BILGE_TOP = -1.6;
  const floorY = BILGE_TOP - 0.06;
  const wallY = (BILGE_TOP + 2.92) / 2;
  const wallHeight = 2.92 - BILGE_TOP;
  const linerReason = 'concave-enclosing-liner-has-conservative-world-aabb';
  mergedDetailBoxes(builder, 'high-seas-bilge-floor', [
    { center: [0, floorY, 0], size: [15.0, 0.12, 72] },
    { center: [0, floorY, -38.2], size: [13.6, 0.12, 4.4] },
    { center: [0, floorY, 39.0], size: [13.6, 0.12, 6.0] },
  ], floorMaterial, linerReason);
  mergedDetailBoxes(builder, 'high-seas-bilge-hull-liner', [
    { center: [-7.44, wallY, 0], size: [0.12, wallHeight, 72] },
    { center: [7.44, wallY, 0], size: [0.12, wallHeight, 72] },
    { center: [-6.74, wallY, -38.2], size: [0.12, wallHeight, 4.4] },
    { center: [6.74, wallY, -38.2], size: [0.12, wallHeight, 4.4] },
    { center: [-6.74, wallY, 39.0], size: [0.12, wallHeight, 6.0] },
    { center: [6.74, wallY, 39.0], size: [0.12, wallHeight, 6.0] },
    { center: [-7.09, wallY, -36.0], size: [0.82, wallHeight, 0.12] },
    { center: [7.09, wallY, -36.0], size: [0.82, wallHeight, 0.12] },
    { center: [-7.09, wallY, 36.0], size: [0.82, wallHeight, 0.12] },
    { center: [7.09, wallY, 36.0], size: [0.82, wallHeight, 0.12] },
    { center: [0, wallY, -40.34], size: [13.6, wallHeight, 0.12] },
    { center: [0, wallY, 41.94], size: [13.6, wallHeight, 0.12] },
  ], wallMaterial, linerReason);
}

function addCenterFeatures(
  builder: Builder,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  upholsteryMaterial: THREE.Material,
  waterMaterial: THREE.Material,
): void {
  const tubCenterX = -5.45;
  const tubRadius = 2.55;
  for (let index = 0; index < 12; index += 1) {
    if (index === 0 || index === 6) continue;
    const theta = index * Math.PI * 2 / 12;
    coverBox(
      builder,
      `high-seas-hot-tub-rim-${index}`,
      [tubCenterX + Math.cos(theta) * tubRadius, 3.67, Math.sin(theta) * tubRadius],
      [1.38, 0.9, 0.34],
      wallMaterial,
      'reinforced',
      [0, theta - Math.PI / 2, 0],
    );
  }
  const tubWater = presentationMesh(
    builder,
    'high-seas-hot-tub-contained-water',
    new THREE.CircleGeometry(2.15, 32),
    waterMaterial,
    [tubCenterX, 3.28, 0],
    [-Math.PI / 2, 0, 0],
  );
  tubWater.userData.waterScope = 'contained-feature-only';
  tubWater.userData.containedWaterFeature = 'hot-tub';

  coverBox(builder, 'high-seas-shower-port-partition', [-1.08, 4.22, -1.15], [0.2, 2.04, 3.7], wallMaterial, 'interior-wall');
  coverBox(builder, 'high-seas-shower-starboard-partition', [1.08, 4.22, 1.15], [0.2, 2.04, 3.7], wallMaterial, 'interior-wall');
  detailBox(builder, 'high-seas-shower-canopy', [0, 5.35, 0], [3.2, 0.18, 5.8], trimMaterial);

  box(builder, 'high-seas-cabana-roof', [6.55, 5.48, 0], [6.1, 0.2, 8.0], wallMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  for (const x of [3.75, 9.35]) {
    for (const z of [-3.65, 3.65]) {
      box(builder, `high-seas-cabana-post-${x}-${z}`, [x, 4.34, z], [0.18, 2.28, 0.18], trimMaterial, {
        ballisticMaterial: 'structural-metal',
      });
    }
  }
  coverBox(builder, 'high-seas-cabana-bench-forward', [6.55, 3.66, -3.0], [4.15, 0.92, 0.88], upholsteryMaterial, 'interior-wall');
  coverBox(builder, 'high-seas-cabana-bench-aft', [6.55, 3.66, 3.0], [4.15, 0.92, 0.88], upholsteryMaterial, 'interior-wall');
  detailBox(builder, 'high-seas-cabana-table', [6.55, 3.62, 0], [1.8, 0.82, 1.15], trimMaterial);
}

function addSpawnFeatures(
  builder: Builder,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  waterMaterial: THREE.Material,
): void {
  const landingRing = presentationMesh(
    builder,
    'high-seas-bow-emergency-circle',
    new THREE.RingGeometry(2.7, 2.94, 48),
    trimMaterial,
    [0, 3.215, -35.8],
    [-Math.PI / 2, 0, 0],
  );
  landingRing.userData.markingLanguage = 'original-unbranded-emergency-circle';
  for (const [index, rotationY] of [0, Math.PI / 3, -Math.PI / 3].entries()) {
    detailBox(builder, `high-seas-bow-circle-spoke-${rotationY}`, [0, 3.22 + index * 0.007, -35.8], [0.16, 0.025, 4.8], trimMaterial, [0, rotationY, 0]);
  }
  box(builder, 'high-seas-bow-canopy', [0, 5.66, -31.2], [7.4, 0.24, 3.2], wallMaterial, {
    ballisticMaterial: 'structural-metal',
  });
  for (const x of [-3.25, 3.25]) {
    box(builder, `high-seas-bow-canopy-post-${x}`, [x, 4.42, -31.2], [0.2, 2.48, 0.2], trimMaterial, {
      ballisticMaterial: 'structural-metal',
    });
  }

  const poolWater = presentationMesh(
    builder,
    'high-seas-stern-pool-contained-water',
    new THREE.PlaneGeometry(5.35, 4.55),
    waterMaterial,
    [0, 3.27, 36.0],
    [-Math.PI / 2, 0, 0],
  );
  poolWater.userData.waterScope = 'contained-feature-only';
  poolWater.userData.containedWaterFeature = 'stern-pool';
  coverBox(builder, 'high-seas-stern-pool-rim-port', [-2.92, 3.61, 36.0], [0.42, 0.82, 5.3], wallMaterial, 'reinforced');
  coverBox(builder, 'high-seas-stern-pool-rim-starboard', [2.92, 3.61, 36.0], [0.42, 0.82, 5.3], wallMaterial, 'reinforced');
  for (const [side, x] of [['port', -1.92], ['starboard', 1.92]] as const) {
    coverBox(builder, `high-seas-stern-pool-rim-forward-${side}`, [x, 3.61, 33.36], [1.65, 0.82, 0.42], wallMaterial, 'reinforced');
    coverBox(builder, `high-seas-stern-pool-rim-aft-${side}`, [x, 3.61, 38.64], [1.65, 0.82, 0.42], wallMaterial, 'reinforced');
  }

  for (const [end, z] of [['bow', -31.0], ['stern', 31.0]] as const) {
    for (const [side, x] of [['port', -8.45], ['starboard', 8.45]] as const) {
      coverBox(builder, `high-seas-${end}-rescue-locker-${side}`, [x, 3.78, z], [1.25, 1.16, 1.7], trimMaterial, 'structural-metal');
    }
  }
}

function addRails(
  builder: Builder,
  railMaterial: THREE.Material,
  deckMaterial: THREE.Material,
): void {
  const addRail = (id: string, x: number, z: number, width: number, depth: number): void => {
    box(builder, `high-seas-perimeter-rail-${id}`, [x, 3.72, z], [width, 1.04, depth], railMaterial, {
      ballisticMaterial: 'thin-metal',
    });
  };
  addRail('starboard', 10.34, 1.48, 0.12, 83.72);
  addRail('port-bow', -10.34, -25.85, 0.12, 29.3);
  addRail('port-center-outer', -11.73, 0, 0.12, 22.0);
  addRail('port-stern', -10.34, 27.35, 0.12, 32.3);
  addRail('bow-tip-port', -3.94, -42.18, 0.12, 3.24);
  addRail('bow-tip-starboard', 3.94, -42.18, 0.12, 3.24);
  addRail('bow-shoulder-port', -7.17, -40.56, 6.46, 0.12);
  addRail('bow-shoulder-starboard', 7.17, -40.56, 6.46, 0.12);
  addRail('bow-tip', 0, -43.82, 8.0, 0.12);
  addRail('stern', 0, 43.48, 20.7, 0.12);

  for (const z of [-10.8, 10.8]) {
    box(builder, `high-seas-catwalk-threshold-${z}`, [-11.0, 3.46, z], [1.48, 0.52, 0.16], railMaterial, {
      ballisticMaterial: 'thin-metal',
    });
  }
  for (let z = -40; z <= 40; z += 5) {
    if (z >= -10 && z <= 10) continue;
    detailBox(builder, `high-seas-starboard-stanchion-${z}`, [10.26, 4.42, z], [0.06, 0.58, 0.06], railMaterial, undefined, 'quality');
  }
  for (const z of [-8, -4, 0, 4, 8]) {
    detailBox(builder, `high-seas-catwalk-stanchion-${z}`, [-11.66, 4.42, z], [0.06, 0.58, 0.06], railMaterial, undefined, 'quality');
  }
  detailBox(builder, 'high-seas-port-catwalk-teak-inlay', [-11.0, 3.215, 0], [1.18, 0.025, 20.8], deckMaterial);
}

function portalAudit(builder: Builder, portals: readonly HighSeasPortal[]): ReadonlyArray<Readonly<{
  id: string;
  movementBlockers: number;
  shotBlockers: number;
  opaquePresentationBlockers: number;
  opaquePresentationBlockerNames: readonly string[];
}>> {
  const overlaps = (aperture: HighSeasPortal['aperture'], bounds: Box2): boolean => {
    const epsilon = 1e-4;
    return aperture.minX < bounds.maxX - epsilon && aperture.maxX > bounds.minX + epsilon
      && aperture.minY < (bounds.maxY ?? Number.POSITIVE_INFINITY) - epsilon
      && aperture.maxY > (bounds.minY ?? Number.NEGATIVE_INFINITY) + epsilon
      && aperture.minZ < bounds.maxZ - epsilon && aperture.maxZ > bounds.minZ + epsilon;
  };
  builder.root.updateMatrixWorld(true);
  const presentationMeshes: THREE.Mesh[] = [];
  builder.root.traverse((node) => {
    if (node instanceof THREE.Mesh
      && node.userData.highSeasPresentationOnly === true
      && node.userData.portalAuditExcluded !== true) presentationMeshes.push(node);
  });
  return portals.map((portal) => {
    const opaquePresentationBlockerNames = presentationMeshes.flatMap((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!materials.some((entry) => entry.visible && (!entry.transparent || entry.opacity >= 0.8))) return [];
      const bounds3 = new THREE.Box3().setFromObject(mesh);
      const bounds: Box2 = {
        minX: bounds3.min.x,
        maxX: bounds3.max.x,
        minY: bounds3.min.y,
        maxY: bounds3.max.y,
        minZ: bounds3.min.z,
        maxZ: bounds3.max.z,
      };
      return overlaps(portal.aperture, bounds) ? [mesh.name] : [];
    });
    return Object.freeze({
      id: portal.id,
      movementBlockers: builder.physicsColliders.filter((bounds) => overlaps(portal.aperture, bounds)).length,
      shotBlockers: builder.shotSurfaces.filter((surface) => overlaps(portal.aperture, surface.bounds)).length,
      opaquePresentationBlockers: opaquePresentationBlockerNames.length,
      opaquePresentationBlockerNames: Object.freeze(opaquePresentationBlockerNames.sort()),
    });
  });
}

function spawnRecord(): Record<Team, THREE.Vector3[]> {
  // The two inboard spawns used to sit at z = +/-42.2. Under the 180-degree
  // rotation that pairs the teams, that put the stern pair on a full-width
  // transom with 7.4 m of deck outboard, and the bow pair on the 8 m TAPERED
  // TIP with 0.94 m to the rail - two of six spawns on a 28 m2 pointed funnel
  // with one way out, against six spread over 302 m2 at the other end. The
  // hull is right to taper; the spawns were wrong to sit in the taper.
  //
  // z = +/-40.2 was picked by searching the deck for a pair whose MIRRORED
  // openness matches - counting, at each spawn, how many of eight compass
  // bearings at 1.5 m and 2.5 m are walkable deck. The old pair scored 5/5 at
  // the stern against 4/3 at the bow; this one scores 6/6 at both ends, an
  // exact match, while staying outboard (the pair moves 2 m, not into
  // mid-ship) and keeping every same-team pair at least 6 m apart.
  const stern = [
    [-9, 34], [-9, 40], [-3, 40.2], [3, 40.2], [9, 40], [9, 34],
  ] as const;
  const bow = stern.map(([x, z]) => [-x, -z] as const);
  const create = (entries: readonly (readonly [number, number])[]): THREE.Vector3[] => entries.map(
    ([x, z]) => new THREE.Vector3(x, HIGH_SEAS_LEVELS.mainDeck + 1.7, z),
  );
  return { 0: create(stern), 1: create(bow) };
}

function emptyTelemetry(): ArenaMap['houseTelemetry'] {
  return {
    houses: 0,
    groundRooms: 0,
    upperRooms: 0,
    doors: 0,
    windows: 0,
    ramps: 0,
    wallMaterialVariants: 0,
    pbrMaterialFamilies: 0,
  };
}

export function buildHighSeas(scene: THREE.Scene): HighSeasArenaMap {
  const root = new THREE.Group();
  root.name = 'High Seas original ocean yacht arena';
  scene.add(root);
  const builder: Builder = {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    physicalCover: [],
    authorities: [],
    walkable: [],
    ballisticSurfaceSequence: 0,
  };

  const hullMaterial = material('pearl-hull', 0xeaf1ef, 0.28, 0.22);
  const wallMaterial = material('warm-cabin-shell', 0xf5f3e9, 0.45, 0.08);
  const roofMaterial = material('silver-roof', 0xcbd6d5, 0.3, 0.48);
  const deckMaterial = material('honey-deck', 0xb78653, 0.7, 0.08);
  const stairMaterial = material('dark-deck-stair', 0x5a4032, 0.76, 0.08);
  const tealTrimMaterial = material('deep-teal-trim', 0x164c58, 0.32, 0.62);
  // HF-373: the three engine families carry the enclosed-volume fill because
  // none of them ever rises above the deck plane - the bulkhead liner and the
  // machinery are sealed inside the corridor, and grating stops flush with the
  // deck at the hatch rims. The amber accent deliberately does NOT carry it:
  // it also skins the hatch guards that stand ON the open deck.
  // Albedos are lifted alongside the metalness drop: a 2-5% reflectance plate
  // reads as a hole even under a good key, and painted ship interiors are not
  // that dark. These stay well inside a believable painted-steel range.
  const engineWallMaterial = applyEnclosedVolumeFill(
    material('engine-bulkhead', 0x5c7078, 0.52, BELOW_DECK_METALNESS.bulkhead),
    BELOW_DECK_FILL.bulkhead,
  );
  const engineFloorMaterial = applyEnclosedVolumeFill(
    material('engine-grating', 0x4e6067, 0.46, BELOW_DECK_METALNESS.grating),
    BELOW_DECK_FILL.grating,
  );
  const engineMachineMaterial = applyEnclosedVolumeFill(
    material('engine-machinery', 0x77878b, 0.38, BELOW_DECK_METALNESS.machinery),
    BELOW_DECK_FILL.machinery,
  );
  const engineAccentMaterial = material('engine-amber', 0xd7a441, 0.34, 0.52, 0x6d3c08, 0.65);
  const enginePracticalMaterial = createPracticalMaterial();
  const upholsteryMaterial = material('cabana-upholstery', 0x4b8790, 0.76, 0.04);
  const glassTextures = generateMaterialTextureSet('glass', 0x5e9ca8);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e9ca8,
    roughness: 0.16,
    metalness: 0.12,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    ...(glassTextures.normalMap ? { normalMap: glassTextures.normalMap } : {}),
    ...(glassTextures.roughnessMap ? { roughnessMap: glassTextures.roughnessMap } : {}),
  });
  glassMaterial.name = 'high-seas-side-glass';
  glassMaterial.userData.assetOwner = 'high-seas';
  glassMaterial.userData.assetKind = 'procedural-original-material';
  glassMaterial.userData.textureFamily = 'glass';
  const waterMaterial = containedWaterMaterial('contained-feature-water', 0x2db9c4);

  const hull = presentationMesh(builder, 'high-seas-sculpted-hull', createHullGeometry(), hullMaterial, [0, 0, 0]);
  hull.userData.sharedOceanExpectedAtY = HIGH_SEAS_LEVELS.ocean;
  hull.userData.collisionRole = 'presentation-around-authoritative-decks-and-bounds';
  hull.userData.portalAuditExcluded = true;
  hull.userData.portalAuditExclusionReason = 'concave-enclosing-shell-has-conservative-world-aabb';

  addDecks(builder, deckMaterial);
  const engine = addEngineRoom(
    builder,
    engineFloorMaterial,
    engineWallMaterial,
    engineMachineMaterial,
    engineAccentMaterial,
    enginePracticalMaterial,
  );
  addHullBilge(builder, engineFloorMaterial, engineWallMaterial);
  const bowCabin = addCabin(builder, 'bow', wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial);
  const sternCabin = addCabin(builder, 'stern', wallMaterial, deckMaterial, roofMaterial, stairMaterial, tealTrimMaterial, glassMaterial);
  addCenterFeatures(builder, wallMaterial, tealTrimMaterial, upholsteryMaterial, waterMaterial);
  addSpawnFeatures(builder, wallMaterial, tealTrimMaterial, waterMaterial);
  addRails(builder, tealTrimMaterial, deckMaterial);

  const routes = Object.freeze({
    'surface-port': Object.freeze([
      { id: 'bow-port-spawn', position: [-8.8, 3.2, -34] },
      { id: 'bow-port-walkway', position: [-9.0, 3.2, -20] },
      { id: 'port-catwalk-bow', position: [-11.0, 3.2, -9] },
      { id: 'port-catwalk-center', position: [-11.0, 3.2, 0] },
      { id: 'port-catwalk-stern', position: [-11.0, 3.2, 9] },
      { id: 'stern-port-walkway', position: [-9.0, 3.2, 20] },
      { id: 'stern-port-spawn', position: [-8.8, 3.2, 34] },
    ] as const),
    'surface-center': Object.freeze([
      { id: 'bow-center-spawn', position: [0, 3.2, -36] },
      { id: 'bow-cabin-entry', position: [0, 3.2, -28.5] },
      { id: 'bow-cabin-exit', position: [0, 3.2, -13.5] },
      { id: 'center-shower-bow', position: [0, 3.2, -5.2] },
      { id: 'center-shower-port-weave', position: [-0.45, 3.2, -0.1] },
      { id: 'center-shower-stern', position: [0, 3.2, 5.2] },
      { id: 'stern-cabin-entry', position: [0, 3.2, 13.5] },
      { id: 'stern-cabin-exit', position: [0, 3.2, 28.5] },
      { id: 'stern-center-spawn', position: [0, 3.2, 31] },
    ] as const),
    'surface-starboard': Object.freeze([
      { id: 'bow-starboard-spawn', position: [8.8, 3.2, -34] },
      { id: 'bow-starboard-walkway', position: [9.0, 3.2, -20] },
      { id: 'starboard-cabana-bow', position: [9.6, 3.2, -8.5] },
      { id: 'starboard-cabana-center', position: [9.6, 3.2, 0] },
      { id: 'starboard-cabana-stern', position: [9.6, 3.2, 8.5] },
      { id: 'stern-starboard-walkway', position: [9.0, 3.2, 20] },
      { id: 'stern-starboard-spawn', position: [8.8, 3.2, 34] },
    ] as const),
    // The engine run is no longer a straight line: it weaves starboard around
    // the exhaust trunk at mid-ship. The extra anchors are not decoration - the
    // Rapier traversal test walks this polyline in both directions, so each one
    // is a position proven clear of the machinery slalom.
    'engine-through-route': Object.freeze([
      { id: 'bow-engine-top', position: HIGH_SEAS_ENGINE_ACCESS.bowTop },
      { id: 'bow-engine-ramp-mid', position: [0, 1.6, -22.2] },
      { id: 'bow-engine-foot', position: HIGH_SEAS_ENGINE_ACCESS.bowFoot },
      { id: 'engine-forward', position: [0, 0, -12] },
      { id: 'engine-room-bow-mouth', position: [0, 0, -7.2] },
      { id: 'engine-trunk-bypass-starboard', position: [1.5, 0, 0] },
      { id: 'engine-room-stern-mouth', position: [0, 0, 7.2] },
      { id: 'engine-aft', position: [0, 0, 12] },
      { id: 'stern-engine-foot', position: HIGH_SEAS_ENGINE_ACCESS.sternFoot },
      { id: 'stern-engine-ramp-mid', position: [0, 1.6, 22.2] },
      { id: 'stern-engine-top', position: HIGH_SEAS_ENGINE_ACCESS.sternTop },
    ] as const),
    'bow-upper-internal-player': Object.freeze(bowCabin.internalRoute),
    'bow-upper-external-player': Object.freeze(bowCabin.externalRoute),
    'stern-upper-internal-player': Object.freeze(sternCabin.internalRoute),
    'stern-upper-external-player': Object.freeze(sternCabin.externalRoute),
  } as const) satisfies Readonly<Record<string, readonly HighSeasRouteAnchor[]>>;

  const portals: readonly HighSeasPortal[] = Object.freeze([
    { id: 'bow-ground-inner', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: -13.16, maxZ: -12.84 } },
    { id: 'bow-ground-outer', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: -29.16, maxZ: -28.84 } },
    { id: 'stern-ground-inner', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: 12.84, maxZ: 13.16 } },
    { id: 'stern-ground-outer', purpose: 'movement', aperture: { minX: -1.5, maxX: 1.5, minY: 3.3, maxY: 5.72, minZ: 28.84, maxZ: 29.16 } },
    { id: 'bow-port-side-door', purpose: 'movement', aperture: { minX: -7.56, maxX: -7.24, minY: 3.3, maxY: 5.72, minZ: -22.4, maxZ: -19.6 } },
    { id: 'bow-starboard-side-door', purpose: 'movement', aperture: { minX: 7.24, maxX: 7.56, minY: 3.3, maxY: 5.72, minZ: -22.4, maxZ: -19.6 } },
    { id: 'stern-port-side-door', purpose: 'movement', aperture: { minX: -7.56, maxX: -7.24, minY: 3.3, maxY: 5.72, minZ: 19.6, maxZ: 22.4 } },
    { id: 'stern-starboard-side-door', purpose: 'movement', aperture: { minX: 7.24, maxX: 7.56, minY: 3.3, maxY: 5.72, minZ: 19.6, maxZ: 22.4 } },
    { id: 'bow-upper-inner-window', purpose: 'sightline', aperture: { minX: -2.0, maxX: 2.0, minY: 6.72, maxY: 8.2, minZ: -13.16, maxZ: -12.84 } },
    { id: 'stern-upper-inner-window', purpose: 'sightline', aperture: { minX: -2.0, maxX: 2.0, minY: 6.72, maxY: 8.2, minZ: 12.84, maxZ: 13.16 } },
    { id: 'bow-upper-external-door', purpose: 'movement', aperture: { minX: -5.55, maxX: -3.65, minY: 6.3, maxY: 8.3, minZ: -29.16, maxZ: -28.84 } },
    { id: 'stern-upper-external-door', purpose: 'movement', aperture: { minX: 3.65, maxX: 5.55, minY: 6.3, maxY: 8.3, minZ: 28.84, maxZ: 29.16 } },
    { id: 'bow-engine-foot', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 0.34, maxY: 2.54, minZ: -19.4, maxZ: -19.08 } },
    { id: 'stern-engine-foot', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 0.34, maxY: 2.54, minZ: 19.08, maxZ: 19.4 } },
    { id: 'bow-engine-top', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 3.31, maxY: 5.42, minZ: -24.42, maxZ: -24.02 } },
    { id: 'stern-engine-top', purpose: 'engine-access', aperture: { minX: -1.05, maxX: 1.05, minY: 3.31, maxY: 5.42, minZ: 24.02, maxZ: 24.42 } },
  ]);

  const verticalNavigation: ArenaVerticalNavigation = Object.freeze({
    routes: Object.freeze([
      { id: 'bow-engine-access', foot: HIGH_SEAS_ENGINE_ACCESS.bowFoot, top: HIGH_SEAS_ENGINE_ACCESS.bowTop },
      { id: 'stern-engine-access', foot: HIGH_SEAS_ENGINE_ACCESS.sternFoot, top: HIGH_SEAS_ENGINE_ACCESS.sternTop },
      { id: 'bow-internal-stair', foot: [4.6, 3.2, -15.9], top: [4.6, 6.2, -20.7] },
      { id: 'bow-external-stair', foot: [-4.6, 3.2, -33.9], top: [-4.6, 6.2, -29.1] },
      { id: 'stern-internal-stair', foot: [-4.6, 3.2, 15.9], top: [-4.6, 6.2, 20.7] },
      { id: 'stern-external-stair', foot: [4.6, 3.2, 33.9], top: [4.6, 6.2, 29.1] },
    ] as const),
    ramps: Object.freeze([
      { id: 'bow-engine-access', from: HIGH_SEAS_ENGINE_ACCESS.bowFoot, to: HIGH_SEAS_ENGINE_ACCESS.bowTop, width: HIGH_SEAS_ENGINE_ACCESS.width },
      { id: 'stern-engine-access', from: HIGH_SEAS_ENGINE_ACCESS.sternFoot, to: HIGH_SEAS_ENGINE_ACCESS.sternTop, width: HIGH_SEAS_ENGINE_ACCESS.width },
      { id: 'bow-internal-stair', from: [4.6, 3.2, -15.9], to: [4.6, 6.2, -20.7], width: 1.8 },
      { id: 'bow-external-stair', from: [-4.6, 3.2, -33.9], to: [-4.6, 6.2, -29.1], width: 1.8 },
      { id: 'stern-internal-stair', from: [-4.6, 3.2, 15.9], to: [-4.6, 6.2, 20.7], width: 1.8 },
      { id: 'stern-external-stair', from: [4.6, 3.2, 33.9], to: [4.6, 6.2, 29.1], width: 1.8 },
    ] as const),
    platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
        id: entry.id,
        minX: entry.bounds.minX,
        maxX: entry.bounds.maxX,
        minZ: entry.bounds.minZ,
        maxZ: entry.bounds.maxZ,
        y: entry.y,
      }))),
  });

  const patrolPoints = [
    [-8.8, 3.2, -36], [0, 3.2, -34], [8.8, 3.2, -36],
    [-9.0, 3.2, -25], [-9.0, 3.2, -16], [0, 3.2, -27.5], [0, 3.2, -14.5], [9.0, 3.2, -25], [9.0, 3.2, -16],
    [-11.0, 3.2, -8], [-11.0, 3.2, 0], [-11.0, 3.2, 8], [0, 3.2, -7], [0, 3.2, 7], [9.5, 3.2, -8], [9.5, 3.2, 0], [9.5, 3.2, 8],
    [-9.0, 3.2, 16], [-9.0, 3.2, 25], [0, 3.2, 14.5], [0, 3.2, 27.5], [9.0, 3.2, 16], [9.0, 3.2, 25],
    [-8.8, 3.2, 36], [0, 3.2, 31], [8.8, 3.2, 36],
    [0, 0, -20.0], [0, 0, -12], [0, 0, 0], [0, 0, 12], [0, 0, 20.0],
  ] as const;

  root.userData.verticalNavigation = verticalNavigation;
  root.userData.highSeasRoutes = routes;
  root.userData.highSeasPortals = portals;
  root.userData.highSeasPortalAudit = Object.freeze(portalAudit(builder, portals));
  root.userData.highSeasSupportAudit = Object.freeze({
    version: 'pass75-shared-platform-authority-v1',
    engineFloor: Object.freeze({
      y: HIGH_SEAS_LEVELS.engine,
      physicsAuthority: 'high-seas-platform-engine-floor',
      presentationName: 'high-seas-platform-engine-floor',
    }),
    platforms: Object.freeze(builder.walkable.map((entry) => Object.freeze({
      id: entry.id,
      presentationName: entry.presentationName,
      bounds: { ...entry.bounds },
      y: entry.y,
      navigation: entry.navigation,
      movementAuthority: builder.colliders.includes(entry.bounds),
      physicsAuthority: builder.physicsColliders.includes(entry.bounds),
      shotAuthority: builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId),
    }))),
  });
  root.userData.highSeasAuthorityAudit = Object.freeze(builder.authorities.map((entry) => Object.freeze({
    name: entry.name,
    bounds: { ...entry.bounds },
    solid: entry.solid,
    shots: entry.shots,
    movementAuthority: !entry.solid || builder.colliders.includes(entry.bounds),
    physicsAuthority: !entry.solid || builder.physicsColliders.includes(entry.bounds),
    raycastAuthority: !entry.shots || builder.raycastMeshes.includes(entry.mesh),
    ballisticAuthority: !entry.shots || builder.shotSurfaces.some((surface) => surface.id === entry.ballisticSurfaceId),
    ballisticSurfaceId: entry.ballisticSurfaceId,
    externalPhysicsAuthority: entry.externalPhysicsAuthority,
  })));
  root.userData.highSeasAccess = Object.freeze({
    maximumPlayerClimbDegrees: 50,
    engineRampDegrees: engine.bow.angleDegrees,
    engineRampSymmetryError: Math.abs(engine.bow.angleDegrees - engine.stern.angleDegrees),
    internalStairDegrees: [bowCabin.internalAccess.angleDegrees, sternCabin.internalAccess.angleDegrees],
    externalStairDegrees: [bowCabin.externalAccess.angleDegrees, sternCabin.externalAccess.angleDegrees],
    upperStoreys: 'bot-pursuit-capable-no-routine-patrols',
  });
  root.userData.highSeasProvenance = Object.freeze({
    version: 'pass75-clean-room-v1',
    ownership: 'original-procedural',
    functionalReferenceBoundary: 'publicly-described-narrow-yacht-topology-only',
    copiedAssets: Object.freeze([]),
    runtimeBranding: 'high-seas-original-only',
    surroundingWaterAuthority: 'shared-water-authoring-path',
    expectedWaveEnvelope: Object.freeze({ minimumY: -2.55, maximumY: -1.85 }),
    safetyFloorY: HIGH_SEAS_SAFETY_FLOOR_Y,
    containedWaterFeatures: Object.freeze(['hot-tub', 'stern-pool']),
  });
  root.userData.highSeasReviewCameras = Object.freeze([
    { id: 'high-seas-overview', position: [28, 24, 50], target: [0, 3.2, 0], purpose: 'overview' },
    { id: 'high-seas-center-deck', position: [10, 5.2, 6], target: [-2, 4, 0], purpose: 'topology' },
    { id: 'high-seas-port-catwalk', position: [-11.3, 4.9, 10], target: [-10.8, 4.2, -10], purpose: 'route' },
    { id: 'high-seas-opposed-cabins', position: [0, 7.9, 10.5], target: [0, 7.9, -10.5], purpose: 'sightline' },
    { id: 'high-seas-engine-corridor', position: [0, 1.55, 19], target: [0, 1.4, -19], purpose: 'route' },
    { id: 'high-seas-engine-open-portal', position: [0, 1.6, -18], target: [0, 2.2, -24], purpose: 'portal' },
    // The occlusion camera tracks the engine-room wall, which moved inboard
    // (x=2.35..2.59) when the service deck gained its cramped profile.
    { id: 'high-seas-engine-wall-closed', position: [1.7, 1.5, 0], target: [2.45, 1.5, 0], purpose: 'light-occlusion' },
    { id: 'high-seas-engine-room-bulge', position: [1.9, 2.4, -5.9], target: [-1.6, 0.9, 4.2], purpose: 'topology' },
  ]);
  root.userData.highSeasMaterialInventory = Object.freeze(getHighSeasMaterialInventory());
  // HF-373 evidence surface: what lights the sealed volume, how hard, and the
  // plane none of it is allowed to cross.
  root.userData.highSeasBelowDeckLighting = Object.freeze({
    version: 'pass77-service-deck-practical-rig-v1',
    // The arena root still adds no THREE lights of its own. What changed is
    // that the service deck is no longer lit by emissive geometry alone: the
    // arena DEFINITION now authors eight shadowed-local spot practicals
    // (HIGH_SEAS_SERVICE_DECK_PRACTICALS), which ArenaContrastLighting owns,
    // shadows, and disposes. The emissive fill below is the residual floor and
    // the whole story on profiles that build no practical rig.
    policy: 'definition-shadowed-local-practicals-plus-residual-emissive-fill',
    arenaRootAddsThreeLights: false,
    deckPlaneY: HIGH_SEAS_LEVELS.mainDeck,
    metalness: Object.freeze({ ...BELOW_DECK_METALNESS }),
    practical: Object.freeze({
      material: enginePracticalMaterial.name,
      emissiveIntensity: enginePracticalMaterial.emissiveIntensity,
      fixtures: Object.freeze(['high-seas-engine-light-strips', 'high-seas-engine-floor-guide-strips']),
    }),
    fill: Object.freeze([engineWallMaterial, engineFloorMaterial, engineMachineMaterial].map((entry) => Object.freeze({
      material: entry.name,
      emissiveIntensity: entry.emissiveIntensity,
      texturedEmissive: entry.emissiveMap !== null,
    }))),
    // Regression guard in data form: the shared accent also skins the
    // deck-level hatch guards, so it stays where it was.
    sharedAccent: Object.freeze({
      material: engineAccentMaterial.name,
      emissiveIntensity: engineAccentMaterial.emissiveIntensity,
    }),
  });

  return {
    id: 'high-seas',
    label: 'High Seas',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(),
    patrolPoints: patrolPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    targets: [] as PracticeTarget[],
    houses: [],
    breakableWindows: [],
    physicalCover: builder.physicalCover,
    bounds: { ...HIGH_SEAS_BOUNDS },
    physicsSafetyFloorY: HIGH_SEAS_SAFETY_FLOOR_Y,
    houseTelemetry: emptyTelemetry(),
  };
}
