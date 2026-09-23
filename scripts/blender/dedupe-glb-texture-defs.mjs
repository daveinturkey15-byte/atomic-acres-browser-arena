// Merge byte-identical texture definitions in a GLB and remap every
// textureInfo reference. The Blender 5.1 glTF exporter can emit duplicate
// `{sampler, source}` entries for one image when a scene's material users
// change shape (observed 2026-08-29 on the arena rebake: 33 images -> 60
// texture defs, every duplicate byte-identical). Rendering is unaffected,
// but the asset contract pins "deduplicated texture bindings", so the
// authoring pipeline restores the invariant deterministically here rather
// than re-pinning the gate to accept bloat.
//
// Usage: node scripts/blender/dedupe-glb-texture-defs.mjs <path.glb>
import { readFileSync, writeFileSync } from 'node:fs';

const glbPath = process.argv[2];
if (!glbPath) throw new Error('usage: dedupe-glb-texture-defs.mjs <path.glb>');

const buffer = readFileSync(glbPath);
if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jsonLength = buffer.readUInt32LE(12);
if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));

const textures = gltf.textures ?? [];
const keyToNew = new Map();
const oldToNew = new Map();
const deduped = [];
textures.forEach((texture, oldIndex) => {
  const key = JSON.stringify(texture);
  if (!keyToNew.has(key)) {
    keyToNew.set(key, deduped.length);
    deduped.push(texture);
  }
  oldToNew.set(oldIndex, keyToNew.get(key));
});

if (deduped.length !== textures.length) {
  // Every texture reference in glTF 2.0 lives in a textureInfo object
  // ({ index, texCoord?, extensions? }) inside materials (including
  // normal/occlusion variants and material extensions). Remap them all.
  const remapTextureInfos = (node) => {
    if (Array.isArray(node)) { node.forEach(remapTextureInfos); return; }
    if (node === null || typeof node !== 'object') return;
    // Within the materials subtree, `index` only ever appears on textureInfo
    // objects (core and extension variants alike), so remap unconditionally.
    if (typeof node.index === 'number' && oldToNew.has(node.index)) {
      node.index = oldToNew.get(node.index);
    }
    for (const value of Object.values(node)) remapTextureInfos(value);
  };
  remapTextureInfos(gltf.materials ?? []);
  gltf.textures = deduped;

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const padding = (4 - (json.length % 4)) % 4;
  if (padding) json = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const rest = buffer.subarray(20 + jsonLength);
  const out = Buffer.alloc(20 + json.length + rest.length);
  buffer.copy(out, 0, 0, 12);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  rest.copy(out, 20 + json.length);
  writeFileSync(glbPath, out);
}
console.log(JSON.stringify({
  glb: glbPath,
  textures: { before: textures.length, after: deduped.length },
  images: gltf.images?.length ?? 0,
}));
