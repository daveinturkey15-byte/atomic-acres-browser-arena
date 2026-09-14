/**
 * gardens/materials.ts — one small shared PBR family for the backyard kit.
 *
 * Method (atomic-acres-procedural-art-authoring §1/§2, photoreal-procedural-scene-forge
 * rule 3): author each tile at a real physical size and let several materials share one
 * raster set, tinted through `color`, instead of minting a material per prop. Every map is
 * a CPU `DataTexture` from the repository's own `rasterizeSurface`; no DOM, no shader
 * injection, deterministic seed.
 */
import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import { rasterizeSurface, type SurfaceDescription } from '../../rendering/surface-forge';

export type GardenRole =
  | 'cedar' | 'paintedWhite' | 'paintedTeal' | 'paintedYellow' | 'paintedGreen'
  | 'canvasRed' | 'linen' | 'shingle'
  | 'galvanised' | 'blackSteel' | 'terracotta' | 'soil' | 'plasticGreen' | 'foliage' | 'concrete';

export type GardenPalette = Readonly<{
  materials: Readonly<Record<GardenRole, MeshStandardMaterial>>;
  textures: readonly Texture[];
  /** World metres one tile spans for a textured role (undefined = untextured). */
  tileMetres: (role: GardenRole) => number | undefined;
  dispose: () => void;
}>;

const SIZE = 256;

export function createGardenPalette(): GardenPalette {
  const textures: Texture[] = [];
  const toTexture = (name: string, bytes: Uint8ClampedArray, colour: boolean): DataTexture => {
    const texture = new DataTexture(new Uint8Array(bytes), SIZE, SIZE, RGBAFormat, UnsignedByteType);
    texture.name = name;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.flipY = true; // rasterizeSurface uses canvas row order and v-up normals.
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 4;
    if (colour) texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  };
  const tiles = new Map<GardenRole, number>();
  const forge = (name: string, description: SurfaceDescription, tileMetres: number, reliefMetres: number, seed: number) => {
    const raster = rasterizeSurface(description, { size: SIZE, seed, tileMetres, reliefMetres, micro: false });
    return {
      map: toTexture(`ws-garden-${name}-albedo`, raster.albedo, true),
      normalMap: toTexture(`ws-garden-${name}-normal`, raster.normal, false),
      roughnessMap: toTexture(`ws-garden-${name}-roughness`, raster.roughness, false),
    };
  };
  const textured = (role: GardenRole, maps: ReturnType<typeof forge>, tileMetres: number, color: number, roughness = 1) => {
    const material = new MeshStandardMaterial({ ...maps, color, roughness });
    material.name = `ws-garden-${role}`;
    material.userData.gardenRole = role;
    tiles.set(role, tileMetres);
    return material;
  };
  const flat = (role: GardenRole, color: number, roughness: number, metalness = 0, flatShading = false) => {
    const material = new MeshStandardMaterial({ color, roughness, metalness, flatShading });
    material.name = `ws-garden-${role}`;
    material.userData.gardenRole = role;
    return material;
  };

  // Weathered cedar: 140 mm boards read along v, silvered summer wood, occasional knot.
  const cedar = forge('cedar', (u, v, noise) => {
    const board = Math.floor(v * 4); // four boards per 0.6 m tile
    const grain = Math.sin((u * 26 + noise.noise(u * 8, v * 8, 8) * 1.6 + board * 0.7) * Math.PI * 2);
    const silver = noise.noise(u * 4, v * 4, 4) * 0.16;
    const knot = Math.exp(-Math.hypot((u * 4) % 1 - 0.5, (v * 4) % 1 - 0.5) * 9) * (noise.hash(board, Math.floor(u * 4)) > 0.82 ? 1 : 0);
    const gap = ((v * 4) % 1) < 0.045 ? 0.55 : 1;
    const value = (0.56 + grain * 0.045 + silver - knot * 0.22) * gap;
    return { albedo: [value * 0.98, value * 0.86, value * 0.72], height: 0.5 + grain * 0.12 - knot * 0.3 - (gap < 1 ? 0.35 : 0), roughness: 0.78 + grain * 0.05 + knot * 0.1 };
  }, 0.6, 0.0025, 9101);
  // Painted lap siding: a 190 mm course shadow line every course, brush texture inside.
  const painted = forge('painted-lap', (u, v, noise) => {
    const course = (v * 5) % 1; // five 0.19 m courses per 0.95 m tile
    const shadow = course < 0.07 ? 0.62 + course * 4 : 1;
    const brush = noise.noise(u * 16, v * 2, 16) * 0.03;
    const chip = noise.noise(u * 8, v * 8, 8) > 0.93 ? -0.08 : 0;
    const value = (0.9 + brush + chip) * shadow;
    return { albedo: [value, value, value], height: course < 0.07 ? 0.15 : 0.55 + brush, roughness: 0.55 + Math.abs(brush) * 2 + (chip ? 0.2 : 0) };
  }, 0.95, 0.008, 9102);
  // Canvas / linen weave, 0.6 mm threads, so the umbrella and sheets read as cloth close up.
  const canvas = forge('canvas', (u, v, noise) => {
    const weave = Math.sin(u * Math.PI * 80) * Math.sin(v * Math.PI * 80);
    const slub = noise.noise(u * 12, v * 12, 12) * 0.04;
    const value = 0.92 + weave * 0.05 + slub;
    return { albedo: [value, value, value], height: 0.5 + weave * 0.3, roughness: 0.9 + weave * 0.05 };
  }, 0.048, 0.0003, 9103);
  // Asphalt shingle courses, 0.3 m exposure with staggered tabs.
  const shingle = forge('shingle', (u, v, noise) => {
    const courseIndex = Math.floor(v * 4);
    const course = (v * 4) % 1;
    const tab = ((u * 4 + (courseIndex % 2) * 0.5) % 1);
    const edge = course < 0.09 || tab < 0.03 ? 0.6 : 1;
    const grit = noise.noise(u * 40, v * 40, 40) * 0.12;
    const value = (0.42 + grit) * edge;
    return { albedo: [value * 0.98, value * 0.97, value], height: (course < 0.09 ? 0.2 : 0.55) + grit * 0.6, roughness: 0.92 };
  }, 1.2, 0.006, 9104);

  const materials: Record<GardenRole, MeshStandardMaterial> = {
    cedar: textured('cedar', cedar, 0.6, 0xffffff),
    paintedWhite: textured('paintedWhite', painted, 0.95, 0xe9e6dc),
    paintedTeal: textured('paintedTeal', painted, 0.95, 0x46b89b),
    paintedYellow: textured('paintedYellow', painted, 0.95, 0xe6cc3c),
    paintedGreen: textured('paintedGreen', painted, 0.95, 0x6b8f74),
    canvasRed: textured('canvasRed', canvas, 0.048, 0xb2262c),
    linen: textured('linen', canvas, 0.048, 0xf1eee6),
    shingle: textured('shingle', shingle, 1.2, 0xffffff),
    galvanised: flat('galvanised', 0xa7adad, 0.42, 0.85),
    blackSteel: flat('blackSteel', 0x2b2d2e, 0.5, 0.65),
    terracotta: flat('terracotta', 0xb5613b, 0.86),
    soil: flat('soil', 0x3b2f22, 1),
    plasticGreen: flat('plasticGreen', 0x3d5638, 0.58),
    foliage: flat('foliage', 0x4f7b33, 0.88, 0, true),
    concrete: flat('concrete', 0xaca79a, 0.95),
  };
  // Shared maps sit on several materials; only one owner disposes each texture.
  return Object.freeze({
    materials: Object.freeze(materials),
    textures: Object.freeze([...textures]),
    tileMetres: (role: GardenRole) => tiles.get(role),
    dispose: () => {
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  });
}

/** Palette accent colours used for per-yard identity, exported for the handoff tests. */
export const GARDEN_ACCENTS = Object.freeze({
  teal: new Color(0x46b89b),
  yellow: new Color(0xe6cc3c),
});
