#!/usr/bin/env node
/**
 * Node-only GLB node-tree dumper (HF-396).
 *
 * The pass 84 ledger names `scripts/dump-glb-nodes.js` as the instrument for
 * auditing rail / optic / barrel alignment on the flagged rifles; that file
 * never existed. This one does the job without a browser or Blender: it reads
 * a GLB with @gltf-transform/core, walks every scene node, and prints for each
 * node its depth, name, parent, local TRS and WORLD position (root-space,
 * i.e. after the delivery root's Z-up -> Y-up rotation), plus the mesh
 * primitive count and the world-space AABB of any attached mesh.
 *
 * World positions are what the presentation code sees when it calls
 * `getWorldPosition` on a socket, so a rail whose AABB centre sits away from
 * the barrel datum here is authored wrong; one that sits right here but wrong
 * in game is a runtime transform defect.
 *
 * Usage:
 *   node scripts/qa/dump-glb-nodes.mjs <file.glb> [--json out.json] [--grep rail,optic,barrel]
 *   node scripts/qa/dump-glb-nodes.mjs public/assets/original/models/weapons/pass65-firearms/m14-ebr/m14-ebr-fp-lod0.glb --grep optic,rail,muzzle
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const positional = argv.filter((value, index) => !value.startsWith('--') && !(index > 0 && argv[index - 1]?.startsWith('--')));
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const file = positional[0];
if (!file) {
  console.error('usage: dump-glb-nodes.mjs <file.glb> [--json out.json] [--grep a,b,c]');
  process.exit(2);
}
const jsonOut = arg('--json', null);
const grep = arg('--grep', '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// --- minimal column-major 4x4 helpers (glTF convention) -------------------
function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mat4Multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}
function mat4FromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
function normalizedDivisor(array) {
  if (array instanceof Int16Array) return 32_767;
  if (array instanceof Int8Array) return 127;
  if (array instanceof Uint16Array) return 65_535;
  if (array instanceof Uint8Array) return 255;
  return 1;
}
const round = (value) => Math.round(value * 10_000) / 10_000;
const vec = (v) => v.map(round);

// --- walk ------------------------------------------------------------------
// The pass 65 deliveries are meshopt-compressed (EXT_meshopt_compression is a
// REQUIRED extension in every fp-lod0.glb), so the reader needs the decoder.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(resolve(file));
const root = document.getRoot();
const scene = root.listScenes()[0];
if (!scene) throw new Error(`${file}: no scene`);

const rows = [];
function meshWorldBounds(mesh, world) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let primitives = 0;
  for (const primitive of mesh.listPrimitives()) {
    primitives += 1;
    const position = primitive.getAttribute('POSITION');
    if (!position) continue;
    const array = position.getArray();
    const stride = position.getElementSize();
    const count = position.getCount();
    // KHR_mesh_quantization: the deliveries store POSITION as normalized
    // int16, dequantized by the node scale. Undo the normalization here so the
    // node scale alone maps the values back to metres.
    const divisor = position.getNormalized() ? normalizedDivisor(array) : 1;
    for (let index = 0; index < count; index += 1) {
      const p = transformPoint(world, [array[index * stride] / divisor, array[index * stride + 1] / divisor, array[index * stride + 2] / divisor]);
      for (let axis = 0; axis < 3; axis += 1) {
        if (p[axis] < min[axis]) min[axis] = p[axis];
        if (p[axis] > max[axis]) max[axis] = p[axis];
      }
    }
  }
  if (!Number.isFinite(min[0])) return { primitives, min: null, max: null, center: null };
  return {
    primitives,
    min: vec(min),
    max: vec(max),
    center: vec([0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2)),
  };
}

function walk(node, parentWorld, parentName, depth, path) {
  const local = mat4FromTRS(node.getTranslation(), node.getRotation(), node.getScale());
  const world = mat4Multiply(parentWorld, local);
  const mesh = node.getMesh();
  const row = {
    depth,
    name: node.getName() || '(unnamed)',
    parent: parentName,
    path: [...path, node.getName() || '(unnamed)'].join('/'),
    localPosition: vec(node.getTranslation()),
    localRotation: vec(node.getRotation()),
    localScale: vec(node.getScale()),
    worldPosition: vec(transformPoint(world, [0, 0, 0])),
    extras: node.getExtras(),
    mesh: mesh ? { name: mesh.getName(), ...meshWorldBounds(mesh, world) } : null,
  };
  rows.push(row);
  for (const child of node.listChildren()) walk(child, world, row.name, depth + 1, [...path, row.name]);
}
for (const node of scene.listChildren()) walk(node, mat4Identity(), null, 0, []);

const matches = grep.length === 0
  ? rows
  : rows.filter((row) => grep.some((needle) => row.path.toLowerCase().includes(needle) || (row.mesh?.name ?? '').toLowerCase().includes(needle)));

console.log(`# ${file}: ${rows.length} nodes${grep.length ? `, ${matches.length} matching [${grep.join(', ')}]` : ''}`);
console.log('depth  name  <- parent  | local T | world P | mesh AABB centre (min..max)');
for (const row of matches) {
  const indent = '  '.repeat(row.depth);
  const meshText = row.mesh
    ? row.mesh.center
      ? ` | mesh ${row.mesh.name} c=${JSON.stringify(row.mesh.center)} y[${row.mesh.min[1]}..${row.mesh.max[1]}] z[${row.mesh.min[2]}..${row.mesh.max[2]}]`
      : ` | mesh ${row.mesh.name} (no POSITION)`
    : '';
  console.log(`${String(row.depth).padStart(2)} ${indent}${row.name} <- ${row.parent ?? '-'} | T=${JSON.stringify(row.localPosition)} | W=${JSON.stringify(row.worldPosition)}${meshText}`);
}
if (jsonOut) {
  writeFileSync(resolve(jsonOut), `${JSON.stringify({ file, nodes: rows }, null, 2)}\n`);
  console.log(`wrote ${jsonOut}`);
}
