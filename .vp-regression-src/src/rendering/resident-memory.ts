import * as THREE from 'three';

export type ResidentObjectMemoryEstimate = Readonly<{
  activeTextureBytes: number;
  cachedTextureBytes: number;
  totalTextureBytes: number;
  activeGeometryBytes: number;
  cachedGeometryBytes: number;
  totalGeometryBytes: number;
  activeTextures: number;
  cachedTextures: number;
  activeGeometries: number;
  cachedGeometries: number;
}>;

type ResourceSet = {
  textures: Set<THREE.Texture>;
  geometries: Set<THREE.BufferGeometry>;
};

const MATERIAL_TEXTURE_KEYS = Object.freeze([
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'emissiveMap', 'alphaMap', 'lightMap', 'envMap',
] as const);

function collectObjectResources(
  root: THREE.Object3D,
  destination: ResourceSet,
  visibility: 'all' | 'visible',
): void {
  if (root instanceof THREE.Scene) {
    if (root.background instanceof THREE.Texture) destination.textures.add(root.background);
    if (root.environment instanceof THREE.Texture) destination.textures.add(root.environment);
  }
  const collect = (node: THREE.Object3D): void => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry instanceof THREE.BufferGeometry) destination.geometries.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      const record = material as THREE.Material & Record<string, unknown>;
      for (const key of MATERIAL_TEXTURE_KEYS) {
        if (record[key] instanceof THREE.Texture) destination.textures.add(record[key]);
      }
    }
    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
      const shadowTexture = node.shadow.map?.texture;
      if (shadowTexture instanceof THREE.Texture) destination.textures.add(shadowTexture);
    }
  };
  if (visibility === 'visible') root.traverseVisible(collect);
  else root.traverse(collect);
}

function textureBytes(texture: THREE.Texture): number {
  const source = texture.source?.data as {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
  } | undefined;
  const width = source?.width ?? source?.videoWidth ?? 1;
  const height = source?.height ?? source?.videoHeight ?? 1;
  return Math.ceil(Math.max(1, width) * Math.max(1, height) * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

function geometryArrays(geometries: Iterable<THREE.BufferGeometry>): Set<ArrayBufferLike> {
  const arrays = new Set<ArrayBufferLike>();
  const collect = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): void => {
    if (!attribute) return;
    const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
    arrays.add(array.buffer);
  };
  for (const geometry of geometries) {
    collect(geometry.index ?? undefined);
    for (const attribute of Object.values(geometry.attributes)) collect(attribute);
    for (const attributes of Object.values(geometry.morphAttributes)) {
      for (const attribute of attributes) collect(attribute);
    }
  }
  return arrays;
}

function sum<T>(values: Iterable<T>, size: (value: T) => number): number {
  let total = 0;
  for (const value of values) total += size(value);
  return total;
}

export function estimateResidentObjectMemory(
  activeRoot: THREE.Object3D,
  retainedRoots: readonly (THREE.Object3D | null | undefined)[],
): ResidentObjectMemoryEstimate {
  const active: ResourceSet = { textures: new Set(), geometries: new Set() };
  // Only resources reachable through the visible presentation are active for
  // the arena budget. Hidden viewmodels and prewarmed support assets remain
  // resident and are accounted by the separate total below.
  collectObjectResources(activeRoot, active, 'visible');
  const total: ResourceSet = {
    textures: new Set(active.textures),
    geometries: new Set(active.geometries),
  };
  collectObjectResources(activeRoot, total, 'all');
  for (const root of retainedRoots) {
    if (root) collectObjectResources(root, total, 'all');
  }
  const cachedTextures = new Set([...total.textures].filter((texture) => !active.textures.has(texture)));
  const cachedGeometries = new Set([...total.geometries].filter((geometry) => !active.geometries.has(geometry)));
  const activeGeometryArrays = geometryArrays(active.geometries);
  const totalGeometryArrays = geometryArrays(total.geometries);
  const cachedGeometryArrays = new Set([...totalGeometryArrays].filter((array) => !activeGeometryArrays.has(array)));
  const activeTextureBytes = sum(active.textures, textureBytes);
  const cachedTextureBytes = sum(cachedTextures, textureBytes);
  const activeGeometryBytes = sum(activeGeometryArrays, (array) => array.byteLength);
  const cachedGeometryBytes = sum(cachedGeometryArrays, (array) => array.byteLength);
  return Object.freeze({
    activeTextureBytes,
    cachedTextureBytes,
    totalTextureBytes: activeTextureBytes + cachedTextureBytes,
    activeGeometryBytes,
    cachedGeometryBytes,
    totalGeometryBytes: activeGeometryBytes + cachedGeometryBytes,
    activeTextures: active.textures.size,
    cachedTextures: cachedTextures.size,
    activeGeometries: active.geometries.size,
    cachedGeometries: cachedGeometries.size,
  });
}
