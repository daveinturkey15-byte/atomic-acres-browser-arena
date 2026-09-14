/**
 * CPU inspection of the exported hero glTF binary. No renderer, no browser, no GPU.
 *
 * Checks the container header, then every accessor, primitive, material and image the runtime
 * will actually consume: indexed triangle count, POSITION/NORMAL/TEXCOORD_0 presence, finite
 * accessor bounds in metres, embedded (not external) images, and material PBR response. It then
 * attempts a real three.js parse so the claim "three can load this" is measured, not assumed.
 *
 * Usage: node scripts/blender/world-studio/validate_glb.mjs [path-to.glb]
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.argv[2] ?? 'public/assets/world-studio/blender/hero-bus.glb');
const bytes = readFileSync(target);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// --- container ------------------------------------------------------------------------------
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const magic = view.getUint32(0, true);
const version = view.getUint32(4, true);
const declaredLength = view.getUint32(8, true);
check(magic === 0x46546c67, `bad glTF magic 0x${magic.toString(16)} (expected 'glTF')`);
check(version === 2, `glTF container version ${version}, expected 2`);
check(declaredLength === bytes.byteLength, `header length ${declaredLength} != file size ${bytes.byteLength}`);

let offset = 12;
let json = null;
let binChunk = null;
while (offset < bytes.byteLength) {
  const chunkLength = view.getUint32(offset, true);
  const chunkType = view.getUint32(offset + 4, true);
  const body = bytes.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
  if (chunkType === 0x004e4942) binChunk = body;
  offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
}
check(json !== null, 'no JSON chunk');
check(binChunk !== null, 'no BIN chunk');

// --- geometry -------------------------------------------------------------------------------
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

let triangles = 0;
let vertices = 0;
const usedMaterials = new Set();
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const mode = prim.mode ?? 4;
    check(mode === 4, `primitive mode ${mode} is not TRIANGLES`);
    check(prim.indices !== undefined, 'primitive is not indexed');
    check(prim.attributes?.POSITION !== undefined, 'primitive has no POSITION');
    check(prim.attributes?.NORMAL !== undefined, 'primitive has no NORMAL');
    check(prim.attributes?.TEXCOORD_0 !== undefined, 'primitive has no TEXCOORD_0');
    if (prim.material !== undefined) usedMaterials.add(prim.material);

    const index = json.accessors[prim.indices];
    check(index.count % 3 === 0, `index count ${index.count} is not a multiple of 3`);
    triangles += index.count / 3;

    const position = json.accessors[prim.attributes.POSITION];
    vertices += position.count;
    check(position.count > 0, 'empty POSITION accessor - geometry would render as nothing');
    check(Array.isArray(position.min) && Array.isArray(position.max), 'POSITION accessor has no min/max');
    for (let axis = 0; axis < 3; axis += 1) {
      check(Number.isFinite(position.min[axis]) && Number.isFinite(position.max[axis]), 'non-finite POSITION bound');
      bounds.min[axis] = Math.min(bounds.min[axis], position.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], position.max[axis]);
    }

    const uv = json.accessors[prim.attributes.TEXCOORD_0];
    check(uv.count === position.count, 'TEXCOORD_0 count does not match POSITION');
    const normal = json.accessors[prim.attributes.NORMAL];
    check(normal.count === position.count, 'NORMAL count does not match POSITION');
  }
}

// Scan the raw normal buffers for NaN and for zero-length normals, which shade black.
let nanNormals = 0;
let zeroNormals = 0;
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const acc = json.accessors[prim.attributes.NORMAL];
    if (acc.componentType !== 5126) continue;
    const bv = json.bufferViews[acc.bufferView];
    const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = bv.byteStride ?? COMPONENT_BYTES[acc.componentType] * TYPE_COUNT[acc.type];
    for (let i = 0; i < acc.count; i += 1) {
      const at = start + i * stride;
      const x = binChunk.readFloatLE(at);
      const y = binChunk.readFloatLE(at + 4);
      const z = binChunk.readFloatLE(at + 8);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nanNormals += 1;
      else if (Math.hypot(x, y, z) < 0.5) zeroNormals += 1;
    }
  }
}
check(nanNormals === 0, `${nanNormals} non-finite normals`);
check(zeroNormals === 0, `${zeroNormals} degenerate (zero-length) normals`);

// --- materials and images -------------------------------------------------------------------
const materials = (json.materials ?? []).map((m) => {
  const pbr = m.pbrMetallicRoughness ?? {};
  return {
    name: m.name,
    baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
    baseColorTexture: pbr.baseColorTexture?.index ?? null,
    metallicRoughnessTexture: pbr.metallicRoughnessTexture?.index ?? null,
    normalTexture: m.normalTexture?.index ?? null,
    alphaMode: m.alphaMode ?? 'OPAQUE',
    doubleSided: m.doubleSided === true,
    emissive: m.emissiveFactor ?? [0, 0, 0],
  };
});
check(materials.length > 0, 'no materials exported');
check(usedMaterials.size === materials.length, `${materials.length} materials but ${usedMaterials.size} used by primitives`);

for (const image of json.images ?? []) {
  check(image.uri === undefined, `image '${image.name}' is an external URI - the GLB is not self-contained`);
  check(image.bufferView !== undefined, `image '${image.name}' has no embedded bufferView`);
}

const textured = materials.filter((m) => m.baseColorTexture !== null);
check(textured.length > 0, 'no material carries a base colour texture - the GLB has flat defaults only');
const withNormal = materials.filter((m) => m.normalTexture !== null);
const withMR = materials.filter((m) => m.metallicRoughnessTexture !== null);

// --- three.js parse ---------------------------------------------------------------------------
let threeParse = { attempted: true, ok: false, detail: '' };
try {
  // three/examples/jsm/loaders/GLTFLoader.js touches `self` when it probes for ImageBitmap
  // support. Node has no `self`; this is the standard shim, not a change to the asset.
  if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await new Promise((res, rej) => {
    loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej);
  });
  let meshes = 0;
  let parsedTris = 0;
  const box = new THREE.Box3();
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    meshes += 1;
    const index = node.geometry.getIndex();
    parsedTris += (index ? index.count : node.geometry.getAttribute('position').count) / 3;
    node.geometry.computeBoundingBox();
    box.expandByPoint(node.geometry.boundingBox.min);
    box.expandByPoint(node.geometry.boundingBox.max);
  });
  threeParse = {
    attempted: true,
    ok: true,
    meshes,
    triangles: parsedTris,
    boundsMin: box.min.toArray().map((v) => Number(v.toFixed(4))),
    boundsMax: box.max.toArray().map((v) => Number(v.toFixed(4))),
    detail: 'GLTFLoader.parse succeeded on CPU',
  };
  check(parsedTris === triangles, `three parsed ${parsedTris} triangles, container says ${triangles}`);
  check(meshes > 0, 'three parsed zero meshes');
} catch (error) {
  threeParse = { attempted: true, ok: false, detail: String(error?.message ?? error) };
}

const report = {
  file: target.replace(/\\/g, '/'),
  bytes: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  generator: json.asset?.generator,
  glTFVersion: json.asset?.version,
  indexedTriangles: triangles,
  vertices,
  meshes: (json.meshes ?? []).length,
  primitives: (json.meshes ?? []).reduce((n, m) => n + m.primitives.length, 0),
  materialCount: materials.length,
  materialsWithBaseColorTexture: textured.length,
  materialsWithMetallicRoughnessTexture: withMR.length,
  materialsWithNormalTexture: withNormal.length,
  embeddedImages: (json.images ?? []).length,
  extensionsUsed: json.extensionsUsed ?? [],
  boundsMetres: {
    min: bounds.min.map((v) => Number(v.toFixed(4))),
    max: bounds.max.map((v) => Number(v.toFixed(4))),
    size: bounds.max.map((v, i) => Number((v - bounds.min[i]).toFixed(4))),
  },
  materials,
  threeParse,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} check(s)`);
  process.exit(1);
}
console.error('\nOK: all container, geometry, material and image checks passed');
