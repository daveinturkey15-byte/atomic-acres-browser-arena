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
import {
  CARPET_METRES_PER_TILE,
  TERRAZZO_METRES_PER_TILE,
  generateStudioTextureSet,
  type StudioTextureFamily,
  type StudioTextureSet,
} from './interior-textures';

/** Forge families plus the two interior floors this lane authors locally. */
type MaterialFamily = TextureFamily | StudioTextureFamily;

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
  family: MaterialFamily | null;
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
  /** Transparent surfaces that must not depth-reject what is behind them. */
  depthWrite?: boolean;
}>;

/**
 * Per-FAMILY albedo contrast, applied once to the shared buffer so the sampler census
 * stays at one albedo/normal/roughness triplet per family.
 *
 * The forge authors weathered surfaces: lap siding carries 45 mm paint-wear edge bands and
 * 55 mm scuff blotches that drop a painted board to 0.44/0.34/0.245, and the 12 mm shadow
 * gap is a hard albedo step on top of a metric-true 6 mm height drop. Read at house scale
 * that stacks into "damaged", not "maintained". Compressing each texel towards the family's
 * own linear mean keeps the course rhythm and the grain while removing the blotch depth;
 * the mean is preserved exactly, so `tintFor` still lands the authored target.
 */
const FAMILY_ALBEDO_CONTRAST: Readonly<Partial<Record<MaterialFamily, number>>> = {
  lapSiding: 0.55,
  shingle: 0.88,
  brick: 0.82,
  concrete: 0.9,
};

/**
 * Tiling is authored, not inherited: lap siding keeps the forge's 220 mm course pitch at
 * 1.76 m/tile, while doors reuse the same family at 0.44 m so the courses read as narrow
 * stiles. Stone veneer is the brick family at a coarser tile with a stronger normal.
 */
const SPECS: Readonly<Record<StudioMaterialId, MaterialSpec>> = {
  'siding-teal': { family: 'lapSiding', metresPerTile: 1.76, target: 0x5fbfa6, roughness: 0.62, normalScale: 0.55 },
  'siding-yellow': { family: 'lapSiding', metresPerTile: 1.76, target: 0xecc65c, roughness: 0.62, normalScale: 0.55 },
  trim: { family: 'concrete', metresPerTile: 0.9, target: 0xf2ede2, roughness: 0.46, normalScale: 0.16 },
  roof: { family: 'shingle', metresPerTile: 2.1, target: 0x7e7b74, roughness: 0.9, normalScale: 0.85 },
  brick: { family: 'brick', metresPerTile: 1.8, target: 0xa06a52, roughness: 0.88, normalScale: 0.85 },
  stone: { family: 'brick', metresPerTile: 2.6, target: 0xa89b86, roughness: 0.92, normalScale: 1.1 },
  foundation: { family: 'concrete', metresPerTile: 3, target: 0xb0aa9e, roughness: 0.93, normalScale: 0.8 },
  'interior-wall': { family: 'concrete', metresPerTile: 2.2, target: 0xe6dfd0, roughness: 0.88, normalScale: 0.12 },
  'interior-accent-teal': { family: 'concrete', metresPerTile: 2.2, target: 0x8fbdad, roughness: 0.88, normalScale: 0.12 },
  'interior-accent-yellow': { family: 'concrete', metresPerTile: 2.2, target: 0xd8c59c, roughness: 0.88, normalScale: 0.12 },
  'floor-hard': { family: 'terrazzo', metresPerTile: TERRAZZO_METRES_PER_TILE, target: 0xcfc6b2, roughness: 1, normalScale: 0.8 },
  'floor-soft': { family: 'carpet', metresPerTile: CARPET_METRES_PER_TILE, target: 0xb0a48d, roughness: 1, normalScale: 1 },
  door: { family: 'lapSiding', metresPerTile: 0.44, target: 0x8a6a45, roughness: 0.6, normalScale: 0.7 },
  /**
   * Window glazing, alpha-blended rather than transmissive (no `MeshPhysicalMaterial`,
   * no refraction pass). Three corrections against the capture's milky panes:
   * - a DARK dielectric tint. A pane is mostly the reflection of the sky plus whatever the
   *   room returns; a light base colour at low opacity is fog, and it hid the interiors.
   * - `FrontSide` on the pane's closed box, so one glazed opening is ONE alpha layer
   *   instead of the two `DoubleSide` drew (0.28 twice composites to 0.48 of white).
   * - `depthWrite: false`, so a pane never depth-rejects the room behind it. This is why
   *   rooms vanished: the glazing wrote depth, then the interior drew and was discarded.
   */
  glass: {
    family: null,
    metresPerTile: 1,
    target: 0x2c3a40,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    side: THREE.FrontSide,
    depthWrite: false,
  },
  metal: { family: 'concrete', metresPerTile: 1.4, target: 0xc0c6cc, roughness: 0.32, metalness: 0.85, normalScale: 0.2 },
};

export type StudioMaterialKit = Readonly<{
  get(id: StudioMaterialId): THREE.MeshStandardMaterial;
  metresPerTile(id: StudioMaterialId): number;
  /** Families actually generated, for budget reporting. */
  readonly families: readonly MaterialFamily[];
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

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/**
 * Compresses every texel towards `mean` in LINEAR light and re-encodes to sRGB bytes.
 * Linear is the right space for this: it is the space the mean was measured in and the
 * space the GPU lights in, so the mean survives the round trip and `tintFor` stays valid.
 */
function compressAlbedoContrast(
  rgba: Uint8Array,
  mean: readonly [number, number, number],
  contrast: number,
): Uint8Array {
  if (contrast >= 1) return rgba;
  for (let index = 0; index < rgba.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const linear = srgbToLinear(rgba[index + channel] / 255);
      const pulled = mean[channel] + (linear - mean[channel]) * contrast;
      rgba[index + channel] = Math.round(255 * Math.min(1, Math.max(0, linearToSrgb(pulled))));
    }
  }
  return rgba;
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

function meanLinear(set: TextureSet | StudioTextureSet): [number, number, number] {
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

function isStudioFamily(family: MaterialFamily): family is StudioTextureFamily {
  return family === 'terrazzo' || family === 'carpet';
}

function buildFamily(family: MaterialFamily): FamilyMaps {
  const set = isStudioFamily(family)
    ? generateStudioTextureSet(family, STUDIO_TEXTURE_SIZE, STUDIO_TEXTURE_SEED)
    : generateTextureSet(family, { size: STUDIO_TEXTURE_SIZE, seed: STUDIO_TEXTURE_SEED });
  const mean = meanLinear(set);
  const albedo = compressAlbedoContrast(
    flipRows(set.albedo, set.size, 4),
    mean,
    FAMILY_ALBEDO_CONTRAST[family] ?? 1,
  );
  return {
    albedo: dataTexture(albedo, set.size, THREE.SRGBColorSpace),
    normal: dataTexture(flipRows(set.normal, set.size, 4), set.size, THREE.NoColorSpace),
    roughness: dataTexture(expandRoughness(set.roughness, set.size), set.size, THREE.NoColorSpace),
    meanLinear: mean,
  };
}

/** Highest gain a tint may apply to a family mean before the whole tint is scaled back. */
export const MAX_TINT_GAIN = 4;

/**
 * Normalises an authored sRGB target against the family's measured mean albedo so the
 * painted result lands on the intended colour instead of darkening through the map.
 *
 * `new THREE.Color(hex)` already converts sRGB to the linear working space
 * (`Color.setHex(hex, colorSpace = SRGBColorSpace)`, three 0.185.1). The former
 * `.convertSRGBToLinear()` on top of it was a SECOND decode: every target was
 * gamma-crushed before it was divided by the mean, which is why the shingle roof resolved
 * to linear 0.021 (a navy slab) against an authored 0.152, and the brick chimney to
 * 0.085/0.012/0.006 - near black - against an authored warm red. Targets now land.
 *
 * The gain limit is applied to the PEAK channel and scaled uniformly so a bright target on
 * a dark family (the roof) desaturates towards grey rather than swinging hue, which is what
 * per-channel clamping did to any target that clipped on one channel only.
 */
function tintFor(target: number, mean: readonly [number, number, number]): THREE.Color {
  const color = new THREE.Color(target);
  const gain: [number, number, number] = [
    color.r / Math.max(0.02, mean[0]),
    color.g / Math.max(0.02, mean[1]),
    color.b / Math.max(0.02, mean[2]),
  ];
  const peak = Math.max(gain[0], gain[1], gain[2]);
  const scale = peak > MAX_TINT_GAIN ? MAX_TINT_GAIN / peak : 1;
  return new THREE.Color(gain[0] * scale, gain[1] * scale, gain[2] * scale);
}

/**
 * Builds the architecture material set. One kit per `createStudioArchitecture()` call; the
 * caller owns its lifetime and `dispose()` releases every generated map exactly once.
 */
export function createStudioMaterialKit(): StudioMaterialKit {
  const families = new Map<MaterialFamily, FamilyMaps>();
  const materials = new Map<StudioMaterialId, THREE.MeshStandardMaterial>();
  const owned: THREE.Texture[] = [];

  const family = (id: MaterialFamily): FamilyMaps => {
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
      depthWrite: spec.depthWrite ?? true,
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
    get families(): readonly MaterialFamily[] {
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
