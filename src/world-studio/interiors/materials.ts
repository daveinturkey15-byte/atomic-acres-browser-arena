import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { rasterizeSurface, type SurfaceDescription } from '../../rendering/surface-forge';

export type InteriorRole = 'walnut' | 'fabric' | 'cream' | 'quilt' | 'ochre' | 'metal' | 'dark' | 'porcelain';
export type InteriorPalette = Record<InteriorRole, MeshStandardMaterial>;

/** Small deterministic PBR tiles from the existing CPU surface forge; no DOM or shader injection. */
export function createInteriorPalette(): InteriorPalette {
  const textured = (name: string, description: SurfaceDescription, tileMetres: number, reliefMetres: number) => {
    const raster = rasterizeSurface(description, { size: 128, seed: 731, tileMetres, reliefMetres, micro: false });
    const map = (bytes: Uint8ClampedArray, colour = false) => {
      const texture = new DataTexture(new Uint8Array(bytes), 128, 128, RGBAFormat, UnsignedByteType);
      texture.name = name;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.flipY = true; // rasterizeSurface uses canvas row order and v-up normals.
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.anisotropy = 4;
      if (colour) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    };
    const material = new MeshStandardMaterial({ map: map(raster.albedo, true), normalMap: map(raster.normal),
      roughnessMap: map(raster.roughness), roughness: 1 });
    material.name = `studio-interior-${name}`;
    material.userData.tileMetres = tileMetres;
    return material;
  };
  const walnut = textured('walnut', (u, v) => {
    const grain = Math.sin((u * 18 + 0.22 * Math.sin(v * Math.PI * 2)) * Math.PI * 2);
    const broad = Math.sin(u * Math.PI * 4) * 0.022;
    return { albedo: [0.42 + grain * 0.032 + broad, 0.27 + grain * 0.021 + broad, 0.16 + grain * 0.014],
      height: 0.5 + grain * 0.2, roughness: 0.43 + grain * 0.06 };
  }, 0.3, 0.0001);
  const cloth = (base: readonly [number, number, number]): SurfaceDescription => (u, v) => {
    const weave = Math.sin(u * Math.PI * 32) * Math.sin(v * Math.PI * 32);
    return { albedo: base.map(c => c + weave * 0.025) as [number, number, number],
      height: 0.5 + weave * 0.3, roughness: 0.88 + weave * 0.04 };
  };
  const fabric = textured('sage-weave', cloth([0.42, 0.51, 0.39]), 0.024, 0.00015);
  const cream = textured('linen', cloth([0.79, 0.75, 0.65]), 0.024, 0.00012);
  const quilt = textured('atomic-quilt', (u, v) => {
    const cx = (u * 4) % 1 - 0.5, cy = (v * 4) % 1 - 0.5;
    const leaf = (cx * cx / 0.2 + cy * cy / 0.1) < 1;
    const colour = leaf ? (Math.floor(u * 4 + v * 4) % 2 ? [0.68, 0.39, 0.23] : [0.77, 0.62, 0.28]) : [0.82, 0.77, 0.65];
    return { albedo: colour as [number, number, number], height: 0.5, roughness: 0.9 };
  }, 1.2, 0);
  const flat = (name: string, colour: number, roughness: number, metalness = 0) => {
    const material = new MeshStandardMaterial({ color: colour, roughness, metalness });
    material.name = `studio-interior-${name}`;
    return material;
  };
  return { walnut, fabric, cream, quilt, ochre: flat('ochre-enamel', 0xaa9556, 0.48),
    metal: flat('brushed-hardware', 0xaaa79a, 0.3, 0.75), dark: flat('charcoal', 0x393d3c, 0.5),
    porcelain: flat('ivory-laminate', 0xd4ccac, 0.32) };
}
