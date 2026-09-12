/**
 * HF-571 world-studio architecture: deterministic material toolkit.
 *
 * Pixels come from the in-repo procedural texture forge (`src/forge/textures`), which is
 * pure TypeScript over typed arrays - no DOM at generation time - so the same maps exist in
 * Node QA and in the browser. One 512^2 set is generated per FAMILY (four families total);
 * every architectural material is a tint + tiling view onto a shared family, so the GPU
 * uploads four albedo/normal/roughness triplets no matter how many materials are authored.
 *
 * UVs are baked in METRES by the geometry builder, so a material's real-world scale is
 * `texture.repeat = 1 / metresPerTile` and neighbouring wall segments stay seamless.
 *
 * The forge writes row 0 as v = 1 (top of the tile) and DataTexture uploads row 0 as v = 0,
 * so rows are flipped once on upload rather than relying on `flipY`, which data textures do
 * not honour identically across the WebGL and WebGPU backends.
 *
 * Only MeshStandardMaterial is used - no ShaderMaterial, no onBeforeCompile.
 */

import * as THREE from 'three';
import { generateTextureSet, type TextureFamily, type TextureSet } from '../../forge/textures';

export const STUDIO_TEXTURE_SIZE = 512;
export const STUDIO_TEXTURE_SEED = 571;

export type StudioMaterialId =
  | 'siding-teal'
  | 'siding-yellow'
  | 'trim'
  | 'roof'
  | 'brick'
  | 'stone'
  | 'foundation'
  | 'interior-wall'
  | 'interior-accent-teal'
  | 'interior-accent-yellow'
  | 'floor-hard'
  | 'floor-soft'
  | 'door'
  | 'glass'
  | 'metal';

type MaterialSpec = Readonly<{
  family: TextureFamily | null;
  /** Real-world metres covered by one texture tile. */
  metresPerTile: number;
  /** Target look in sRGB hex; the tint is normalised against the family's mean albedo. */
  target: number;
  roughness: number;
  metalness?: number;
  normalScale?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}>;

/**
 * Tiling is authored, not inherited: lap siding keeps the forge's 220 mm course pitch at
 * 1.76 m/tile, while doors reuse the same family at 0.44 m so the courses read as narrow
 * stiles. Stone veneer is the brick family at a coarser tile with a stronger normal.
 */
const SPECS: Readonly<Record<StudioMaterialId, MaterialSpec>> = {
  'siding-teal': { family: 'lapSiding', metresPerTile: 1.76, target: 0x55a894, roughness: 0.74, normalScale: 1 },
  'siding-yellow': { family: 'lapSiding', metresPerTile: 1.76, target: 0xe3c257, roughness: 0.74, normalScale: 1 },
  trim: { family: 'concrete', metresPerTile: 0.9, target: 0xeae4d8, roughness: 0.58, normalScale: 0.22 },
  roof: { family: 'shingle', metresPerTile: 3, target: 0x6e7176, roughness: 0.92, normalScale: 1.1 },
  brick: { family: 'brick', metresPerTile: 1.8, target: 0x9a5f4a, roughness: 0.9, normalScale: 1 },
  stone: { family: 'brick', metresPerTile: 2.6, target: 0x8d8577, roughness: 0.95, normalScale: 1.35 },
  foundation: { family: 'concrete', metresPerTile: 3, target: 0xa8a298, roughness: 0.93, normalScale: 0.8 },
  'interior-wall': { family: 'concrete', metresPerTile: 2.2, target: 0xe6dfd0, roughness: 0.88, normalScale: 0.12 },
  'interior-accent-teal': { family: 'concrete', metresPerTile: 2.2, target: 0x8fbdad, roughness: 0.88, normalScale: 0.12 },
  'interior-accent-yellow': { family: 'concrete', metresPerTile: 2.2, target: 0xd8c59c, roughness: 0.88, normalScale: 0.12 },
  'floor-hard': { family: 'concrete', metresPerTile: 1.1, target: 0xd5cbb7, roughness: 0.52, normalScale: 0.35 },
  'floor-soft': { family: 'concrete', metresPerTile: 0.7, target: 0xb5a892, roughness: 0.98, normalScale: 0.5 },
  door: { family: 'lapSiding', metresPerTile: 0.44, target: 0x8a6a45, roughness: 0.6, normalScale: 0.7 },
  glass: {
    family: null,
    metresPerTile: 1,
    target: 0xcdd9d9,
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  },
  metal: { family: 'concrete', metresPerTile: 1.4, target: 0xb2b6ba, roughness: 0.42, metalness: 0.75, normalScale: 0.2 },
};

export type StudioMaterialKit = Readonly<{
  get(id: StudioMaterialId): THREE.MeshStandardMaterial;
  metresPerTile(id: StudioMaterialId): number;
  /** Families actually generated, for budget reporting. */
  readonly families: readonly TextureFamily[];
  dispose(): void;
}>;

type FamilyMaps = Readonly<{
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  meanLinear: readonly [number, number, number];
}>;

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Copies `channels`-interleaved rows bottom-to-top so v = 0 is the forge's bottom row. */
function flipRows(source: Uint8ClampedArray, size: number, channels: number): Uint8Array {
  const out = new Uint8Array(size * size * channels);
  const stride = size * channels;
  for (let row = 0; row < size; row++) {
    const from = (size - 1 - row) * stride;
    out.set(source.subarray(from, from + stride), row * stride);
  }
  return out;
}

function expandRoughness(source: Uint8ClampedArray, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    const from = (size - 1 - row) * size;
    for (let x = 0; x < size; x++) {
      const value = source[from + x];
      const index = (row * size + x) * 4;
      // Green carries roughness for MeshStandardMaterial; red/blue mirror it so the same
      // map can be read as an ORM-style packing by a later consumer.
      out[index] = value;
      out[index + 1] = value;
      out[index + 2] = value;
      out[index + 3] = 255;
    }
  }
  return out;
}

function dataTexture(data: Uint8Array, size: number, colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function meanLinear(set: TextureSet): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let samples = 0;
  // Every 7th texel: enough for a stable mean, cheap enough to run inside a unit test.
  for (let index = 0; index < set.albedo.length; index += 4 * 7) {
    r += srgbToLinear(set.albedo[index] / 255);
    g += srgbToLinear(set.albedo[index + 1] / 255);
    b += srgbToLinear(set.albedo[index + 2] / 255);
    samples++;
  }
  return [r / samples, g / samples, b / samples];
}

function buildFamily(family: TextureFamily): FamilyMaps {
  const set = generateTextureSet(family, { size: STUDIO_TEXTURE_SIZE, seed: STUDIO_TEXTURE_SEED });
  return {
    albedo: dataTexture(flipRows(set.albedo, set.size, 4), set.size, THREE.SRGBColorSpace),
    normal: dataTexture(flipRows(set.normal, set.size, 4), set.size, THREE.NoColorSpace),
    roughness: dataTexture(expandRoughness(set.roughness, set.size), set.size, THREE.NoColorSpace),
    meanLinear: meanLinear(set),
  };
}

/**
 * Normalises an authored sRGB target against the family's measured mean albedo so the
 * painted result lands on the intended hue instead of double-darkening through the map.
 * Clamped below 1.9 to keep the palette off the oversaturated end the brief warns about.
 */
function tintFor(target: number, mean: readonly [number, number, number]): THREE.Color {
  const color = new THREE.Color(target).convertSRGBToLinear();
  const factor = new THREE.Color(
    Math.min(1.9, color.r / Math.max(0.02, mean[0])),
    Math.min(1.9, color.g / Math.max(0.02, mean[1])),
    Math.min(1.9, color.b / Math.max(0.02, mean[2])),
  );
  return factor;
}

/**
 * Builds the architecture material set. One kit per `createStudioArchitecture()` call; the
 * caller owns its lifetime and `dispose()` releases every generated map exactly once.
 */
export function createStudioMaterialKit(): StudioMaterialKit {
  const families = new Map<TextureFamily, FamilyMaps>();
  const materials = new Map<StudioMaterialId, THREE.MeshStandardMaterial>();
  const owned: THREE.Texture[] = [];

  const family = (id: TextureFamily): FamilyMaps => {
    const existing = families.get(id);
    if (existing) return existing;
    const built = buildFamily(id);
    families.set(id, built);
    owned.push(built.albedo, built.normal, built.roughness);
    return built;
  };

  const build = (id: StudioMaterialId): THREE.MeshStandardMaterial => {
    const spec = SPECS[id];
    const material = new THREE.MeshStandardMaterial({
      name: `world-studio-architecture-${id}`,
      roughness: spec.roughness,
      metalness: spec.metalness ?? 0,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
      vertexColors: true,
    });
    if (!spec.family) {
      material.color = new THREE.Color(spec.target);
      return material;
    }
    const maps = family(spec.family);
    const repeat = 1 / spec.metresPerTile;
    const view = (texture: THREE.DataTexture): THREE.Texture => {
      const clone = texture.clone();
      clone.repeat.set(repeat, repeat);
      clone.needsUpdate = true;
      owned.push(clone);
      return clone;
    };
    material.map = view(maps.albedo);
    material.normalMap = view(maps.normal);
    material.roughnessMap = view(maps.roughness);
    material.normalScale = new THREE.Vector2(spec.normalScale ?? 1, spec.normalScale ?? 1);
    material.color = tintFor(spec.target, maps.meanLinear);
    return material;
  };

  return Object.freeze({
    get(id: StudioMaterialId): THREE.MeshStandardMaterial {
      const existing = materials.get(id);
      if (existing) return existing;
      const material = build(id);
      materials.set(id, material);
      return material;
    },
    metresPerTile(id: StudioMaterialId): number {
      return SPECS[id].metresPerTile;
    },
    get families(): readonly TextureFamily[] {
      return [...families.keys()];
    },
    dispose(): void {
      for (const texture of owned) texture.dispose();
      owned.length = 0;
      for (const material of materials.values()) material.dispose();
      materials.clear();
      families.clear();
    },
  });
}
