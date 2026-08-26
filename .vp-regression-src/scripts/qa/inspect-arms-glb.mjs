// Inspect the first-person arms GLB bone layout to determine true L/R orientation.
// Prints node name + translation for arm/wrist/knife nodes. Run:
//   node scripts/qa/inspect-arms-glb.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2] || join(root, 'public/assets/original/models/operators/pass65-first-person-arms-lod0.glb');
const buf = readFileSync(file);
// GLB header: magic(4) version(4) length(4), then chunks. First chunk = JSON.
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const nodes = json.nodes || [];
const parents = new Map();
for (const [parentIndex, node] of nodes.entries()) {
  for (const child of node.children ?? []) parents.set(child, parentIndex);
}
const want = /UpperArm|LowerArm|Wrist|knife|Thumb1|Index1|palm-contact/i;
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  if (!want.test(n.name || '')) continue;
  const t = n.translation || [0, 0, 0];
  const parent = parents.has(i) ? nodes[parents.get(i)]?.name ?? '<unnamed>' : '<scene>';
  const q = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const determinant = s.reduce((product, value) => product * value, 1);
  console.log(`${n.name}\tparent=${parent}\tx=${(+t[0]).toFixed(3)} y=${(+t[1]).toFixed(3)} z=${(+t[2]).toFixed(3)} qlen=${Math.hypot(...q).toFixed(5)} det=${determinant.toFixed(5)}`);
}
