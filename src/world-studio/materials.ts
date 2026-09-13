import * as THREE from 'three';

type SurfaceKind = 'asphalt' | 'concrete' | 'soil' | 'timber' | 'grass';
/** Small original periodic texture family. World-scaled UVs avoid giant aggregate. */
export function createStudioSurface(kind: SurfaceKind): THREE.MeshStandardMaterial {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const normals = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const palette: Record<SurfaceKind, number[]> = {
    asphalt: [95, 98, 96], concrete: [184, 181, 164], soil: [113, 111, 73], timber: [133, 102, 67],
    // Bright suburban lawn (owner reference teal-backyard.png reads ~sRGB 120,145,78);
    // slightly above target so lit rendering lands near the reference mid-tone.
    grass: [118, 154, 72],
  };
  const rgb = palette[kind];
  const noise = (x: number, y: number) => {
    let n = Math.imul((x & 255) + 1, 374761393) ^ Math.imul((y & 255) + 1, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const height = (x: number, y: number) => {
    const fine = noise(x, y);
    if (kind === 'timber') return 0.25 * Math.sin(x * .36 + Math.sin(y * .02) * 2) + fine * .17;
    if (kind === 'grass') {
      // Fine fibre: per-pixel blade flecks smeared along v (world z) into strands,
      // plus metre-scale clump mottle. Streak axis keeps it grass, not soil grit.
      return noise(x, y >> 2) * .5 + fine * .3 + noise(x >> 4, y >> 4) * .2;
    }
    return fine * (kind === 'asphalt' ? .8 : .35) + noise(x >> 3, y >> 3) * .16;
  };
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const i = (y * size + x) * 4;
    const n = height(x, y);
    const fleck = noise(x, y) > .976 ? 1.25 : 1;
    let value = (0.83 + n * .34) * fleck;
    if (kind === 'grass') value *= 0.92 + noise(x >> 5, y >> 5) * 0.16;
    for (let c = 0; c < 3; c += 1) albedo[i + c] = Math.min(255, rgb[c]! * value);
    albedo[i + 3] = 255;
    normals[i] = 128 + (height(x - 1, y) - height(x + 1, y)) * 34;
    normals[i + 1] = 128 + (height(x, y - 1) - height(x, y + 1)) * 34;
    normals[i + 2] = 250; normals[i + 3] = 255;
    const r = kind === 'asphalt' ? 198 + noise(x, y) * 53 : kind === 'grass' ? 235 + noise(x, y) * 20 : 215 + noise(x, y) * 35;
    roughness[i] = roughness[i + 1] = roughness[i + 2] = r; roughness[i + 3] = 255;
  }
  const texture = (pixels: Uint8Array, color = false) => {
    const t = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4;
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true; return t;
  };
  const mat = new THREE.MeshStandardMaterial({
    map: texture(albedo, true), normalMap: texture(normals), roughnessMap: texture(roughness),
    roughness: 1, metalness: 0, normalScale: new THREE.Vector2(.65, .65),
  });
  if (kind === 'grass') {
    // Real-world scale: the baked /2 UVs give 2 m per tile; repeating twice
    // lands the fibre pitch at ~4 mm per texel across the lawn.
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) t!.repeat.set(2, 2);
  }
  mat.name = `world-studio-${kind}-original-pbr`;
  mat.userData.worldStudioSurface = kind;
  return mat;
}
