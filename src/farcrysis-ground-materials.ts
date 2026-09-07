/**
 * Farcrysis ground PBR - albedo, normal and roughness for the terrain surfaces.
 *
 * WHY THIS EXISTS
 * The three live ground meshes (elevation shell, sand ring, wet-sand band) were
 * lit entirely by vertex colour and a flat roughness constant. Vertex colour is
 * a per-VERTEX signal, so at the terrain's tessellation it can only describe
 * zones - beach, cliff, jungle - never surface. Standing still and looking down
 * gave a smooth gradient with no sand grain, no ripple, no wet sheen: the arena
 * read as coloured geometry rather than ground.
 *
 * This module supplies the missing per-PIXEL signal. Vertex colour is kept and
 * still does its job (zone tinting); the maps here multiply into it, adding
 * grain and relief without touching the zone palette. That is why every albedo
 * is authored near-white - it modulates, it does not replace.
 *
 * PROCEDURAL AND CANVAS-FREE. Textures are DataTextures synthesised from noise,
 * so they carry real pixel dimensions, need no 2D context, are deterministic
 * under test, and keep the project-original provenance rule intact.
 *
 * DENSITY IS WORLD-SPACE. Like the High Seas materials, tile size is expressed
 * in metres (GROUND_TILE_METRES) rather than as a raw repeat, so grain stays
 * the same physical size across surfaces of very different extents.
 */
import * as THREE from 'three';

/** Edge length of the arena footprint the ground meshes span, in metres. */
export const FARCRYSIS_GROUND_EXTENT_M = 64;

/** World size covered by one tile of ground detail. */
export const GROUND_TILE_METRES = 2;

export type FarcrysisGroundSurface = 'dry-sand' | 'wet-sand' | 'terrain';

const TEXTURE_SIZE = 256;

const CACHE = new Map<string, THREE.DataTexture>();

function hash2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43_758.545_3;
  return n - Math.floor(n);
}

/** Tiling-safe value noise: lattice coordinates wrap at `period`. */
function noise2D(x: number, y: number, seed: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wrap = (value: number): number => ((value % period) + period) % period;

  const a = hash2D(wrap(xi), wrap(yi), seed);
  const b = hash2D(wrap(xi + 1), wrap(yi), seed);
  const c = hash2D(wrap(xi), wrap(yi + 1), seed);
  const d = hash2D(wrap(xi + 1), wrap(yi + 1), seed);

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, seed: number, octaves: number, basePeriod: number): number {
  let total = 0;
  let amplitude = 1;
  let normalisation = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += noise2D(x * frequency, y * frequency, seed + octave, basePeriod * frequency) * amplitude;
    normalisation += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / Math.max(1e-6, normalisation);
}

/**
 * Height field for one surface, in 0..1. The normal map is derived from this,
 * so this function is where the *feel* of each surface is actually authored.
 */
function surfaceHeight(surface: FarcrysisGroundSurface, x: number, y: number): number {
  const u = (x / TEXTURE_SIZE) * 8;
  const v = (y / TEXTURE_SIZE) * 8;

  switch (surface) {
    case 'dry-sand': {
      // Wind ripples: a directional sine, broken up by noise so it never reads
      // as a corduroy pattern, plus fine grain on top.
      const ripple = Math.sin((v + fbm(u, v, 3, 3, 8) * 1.4) * 6.0) * 0.5 + 0.5;
      const grain = fbm(u * 6, v * 6, 11, 3, 48);
      return ripple * 0.55 + grain * 0.45;
    }
    case 'wet-sand': {
      // Water-flattened: the ripple is mostly gone, and what remains is broad
      // shallow sheeting left by the last wave.
      const sheet = fbm(u * 0.8, v * 0.8, 5, 3, 6);
      const grain = fbm(u * 5, v * 5, 17, 2, 40);
      return sheet * 0.78 + grain * 0.22;
    }
    case 'terrain':
    default: {
      // Mixed ground: clumped soil with scattered pebbles.
      const clump = fbm(u * 1.6, v * 1.6, 23, 4, 12);
      const pebble = Math.pow(fbm(u * 9, v * 9, 29, 2, 72), 3) * 2.2;
      return Math.min(1, clump * 0.7 + pebble * 0.3);
    }
  }
}

function buildTexture(
  key: string,
  data: Uint8Array,
  colorSpace: THREE.ColorSpace,
  repeat: number,
): THREE.DataTexture {
  const cached = CACHE.get(key);
  if (cached) return cached;

  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.name = `farcrysis-ground-${key}`;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Ground is almost always viewed at a grazing angle, which is exactly the
  // case trilinear filtering smears; anisotropy is what keeps distant sand
  // from collapsing into a flat grey band.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  CACHE.set(key, texture);
  return texture;
}

export type FarcrysisGroundTextureSet = Readonly<{
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  /** Base roughness for the surface, before the map modulates it. */
  roughness: number;
  normalScale: number;
}>;

/** Authored surface response. Wet sand is smoother than dry - that is physics. */
const SURFACE_RESPONSE: Readonly<Record<
  FarcrysisGroundSurface,
  Readonly<{ roughness: number; normalScale: number; relief: number }>
>> = Object.freeze({
  'dry-sand': Object.freeze({ roughness: 0.94, normalScale: 1.15, relief: 3.4 }),
  // A film of water fills the grain and reflects: low roughness, shallow relief.
  'wet-sand': Object.freeze({ roughness: 0.34, normalScale: 0.55, relief: 1.5 }),
  terrain: Object.freeze({ roughness: 0.88, normalScale: 1.0, relief: 3.0 }),
});

export function farcrysisGroundTextures(
  surface: FarcrysisGroundSurface,
  repeat: number,
): FarcrysisGroundTextureSet {
  const response = SURFACE_RESPONSE[surface];
  const pixels = TEXTURE_SIZE * TEXTURE_SIZE;

  const albedo = new Uint8Array(pixels * 4);
  const rough = new Uint8Array(pixels * 4);
  const heights = new Float32Array(pixels);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const index = y * TEXTURE_SIZE + x;
      const height = surfaceHeight(surface, x, y);
      heights[index] = height;

      // Near-white, so it MULTIPLIES into vertex colour rather than replacing
      // the zone palette the terrain already encodes.
      const shade = 0.80 + height * 0.20;
      const value = Math.round(THREE.MathUtils.clamp(shade, 0, 1) * 255);
      const offset = index * 4;
      albedo[offset] = value;
      albedo[offset + 1] = value;
      albedo[offset + 2] = value;
      albedo[offset + 3] = 255;

      // Crests are scoured and slightly glossier; troughs hold dust and read
      // rougher. Wet sand varies less because the water film evens it out.
      const roughVariation = (0.5 - height) * (surface === 'wet-sand' ? 0.10 : 0.22);
      const roughValue = Math.round(
        THREE.MathUtils.clamp(response.roughness + roughVariation, 0, 1) * 255,
      );
      rough[offset] = roughValue;
      rough[offset + 1] = roughValue;
      rough[offset + 2] = roughValue;
      rough[offset + 3] = 255;
    }
  }

  const normal = new Uint8Array(pixels * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    const yPrev = (y - 1 + TEXTURE_SIZE) % TEXTURE_SIZE;
    const yNext = (y + 1) % TEXTURE_SIZE;
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const xPrev = (x - 1 + TEXTURE_SIZE) % TEXTURE_SIZE;
      const xNext = (x + 1) % TEXTURE_SIZE;

      const dx = (heights[y * TEXTURE_SIZE + xNext] - heights[y * TEXTURE_SIZE + xPrev]) * response.relief;
      const dy = (heights[yNext * TEXTURE_SIZE + x] - heights[yPrev * TEXTURE_SIZE + x]) * response.relief;
      const length = Math.hypot(dx, dy, 1);

      const offset = (y * TEXTURE_SIZE + x) * 4;
      normal[offset] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      normal[offset + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      normal[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;
    }
  }

  return Object.freeze({
    map: buildTexture(`${surface}-albedo-${repeat}`, albedo, THREE.SRGBColorSpace, repeat),
    normalMap: buildTexture(`${surface}-normal-${repeat}`, normal, THREE.NoColorSpace, repeat),
    roughnessMap: buildTexture(`${surface}-roughness-${repeat}`, rough, THREE.NoColorSpace, repeat),
    roughness: response.roughness,
    normalScale: response.normalScale,
  });
}

/** Repeat that yields GROUND_TILE_METRES on a mesh whose UVs span 0..1. */
export const FARCRYSIS_GROUND_REPEAT = Math.round(FARCRYSIS_GROUND_EXTENT_M / GROUND_TILE_METRES);

/**
 * Applies a ground texture set to a material in place.
 *
 * Deliberately mutates rather than replaces: the existing materials already
 * carry vertexColors, side and colour decisions made by the terrain author,
 * and none of those should be re-litigated here.
 */
export function applyFarcrysisGroundMaterial(
  target: THREE.MeshStandardMaterial,
  surface: FarcrysisGroundSurface,
  repeat: number = FARCRYSIS_GROUND_REPEAT,
): void {
  const textures = farcrysisGroundTextures(surface, repeat);
  target.map = textures.map;
  target.normalMap = textures.normalMap;
  target.roughnessMap = textures.roughnessMap;
  target.normalScale = new THREE.Vector2(textures.normalScale, textures.normalScale);
  target.roughness = textures.roughness;
  target.userData.farcrysisGroundSurface = surface;
  target.needsUpdate = true;
}
