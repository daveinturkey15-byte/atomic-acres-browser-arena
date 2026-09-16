// Measure the decoded GPU cost of a GLB tree.
//
// Why this exists (2026-09-16): the rebuild asset set read as harmless by file
// size — 128.4 MB of download — while decoding to 1594.7 MB of resident VRAM.
// The two are decoupled, because VRAM tracks texture *resolution* and file size
// tracks *encoding*: public/assets/rebuild/vehicles/semi.glb is 1.33 MB on disk
// and 138.7 MB on the GPU. A file-size review misses the worst offenders
// entirely, and a scene-graph census ("21/21 resolved") proves the graph, not
// the texture upload — which is how untextured/gray props survived both checks.
//
// Usage:
//   node scripts/qa/measure-glb-vram.mjs [dir=public/assets/rebuild] [--budget MB]
//
// Exits 1 when a --budget is supplied and the tree exceeds it, so this can gate.

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
// RGBA8 plus a full mip chain: sum of 1/4^n converges to 4/3.
const MIP_CHAIN_FACTOR = 4 / 3;
const BYTES_PER_TEXEL = 4;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.glb')) out.push(path);
  }
  return out;
}

function parseGlb(buffer) {
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
    else if (type === GLB_BIN_CHUNK) bin = body;
    offset += 8 + length;
  }
  return { json, bin };
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// The SOF marker often sits well past the first 64 bytes, so this must be given
// the whole bufferView — a truncated slice silently reports no dimensions, which
// reads as "free" and is how an earlier pass of this measurement undercounted.
function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

function measure(file) {
  const buffer = readFileSync(file);
  const { json, bin } = parseGlb(buffer);
  if (!json || !bin) return null;
  let vram = 0;
  let unreadable = 0;
  for (const image of json.images ?? []) {
    const view = json.bufferViews[image.bufferView];
    if (!view) continue;
    const start = view.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    const size = pngDimensions(bytes) ?? jpegDimensions(bytes);
    // A texture whose header we cannot read is reported, never counted as zero.
    if (!size) { unreadable += 1; continue; }
    vram += size.width * size.height * BYTES_PER_TEXEL * MIP_CHAIN_FACTOR;
  }
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices != null) triangles += json.accessors[primitive.indices].count / 3;
    }
  }
  return {
    file: file.split(sep).slice(-2).join('/'),
    bytes: buffer.length,
    vram,
    unreadable,
    images: (json.images ?? []).length,
    triangles: Math.round(triangles),
    compressed: (json.extensionsUsed ?? []).some((e) => /texture_basisu|meshopt|draco|texture_webp/i.test(e)),
  };
}

const args = process.argv.slice(2);
const budgetIndex = args.indexOf('--budget');
const budgetMb = budgetIndex === -1 ? null : Number(args[budgetIndex + 1]);
const root = args.find((a) => !a.startsWith('--') && a !== String(budgetMb)) ?? 'public/assets/rebuild';

const MB = 1048576;
const rows = walk(root).map(measure).filter(Boolean).sort((a, b) => b.vram - a.vram);
const totalVram = rows.reduce((sum, r) => sum + r.vram, 0);
const totalBytes = rows.reduce((sum, r) => sum + r.bytes, 0);
const unreadable = rows.reduce((sum, r) => sum + r.unreadable, 0);

console.log(`${'file'.padEnd(42)}${'file MB'.padStart(9)}${'VRAM MB'.padStart(10)}${'tris'.padStart(8)}  compressed`);
for (const row of rows.slice(0, 12)) {
  console.log(
    row.file.padEnd(42)
    + (row.bytes / MB).toFixed(2).padStart(9)
    + (row.vram / MB).toFixed(1).padStart(10)
    + String(row.triangles).padStart(8)
    + (row.compressed ? '  yes' : '  NO'),
  );
}
console.log('---');
console.log(`GLBs ${rows.length} | download ${(totalBytes / MB).toFixed(1)} MB | decoded VRAM ${(totalVram / MB).toFixed(1)} MB`);
console.log(`uncompressed GLBs: ${rows.filter((r) => !r.compressed).length}/${rows.length}`);
if (unreadable > 0) console.log(`WARNING: ${unreadable} texture(s) had unreadable headers and are NOT counted above`);

if (budgetMb != null && Number.isFinite(budgetMb)) {
  const actual = totalVram / MB;
  if (actual > budgetMb) {
    console.error(`FAIL: decoded VRAM ${actual.toFixed(1)} MB exceeds budget ${budgetMb} MB`);
    process.exit(1);
  }
  console.log(`PASS: decoded VRAM ${actual.toFixed(1)} MB within budget ${budgetMb} MB`);
}
