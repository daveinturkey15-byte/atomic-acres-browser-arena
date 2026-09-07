// PASS 85 Lane N (repair) - the measurement this audit got wrong first time.
//
// Counts every `runtimeEvidence(` call site in src/graphics-settings-registry.ts
// by ARGUMENT ARITY, because the 4th positional argument IS `liveObservation`
// and no row sets it by name: grepping for the string finds only the doc
// comment, the type field, the parameter, the function body and the validator,
// which is how "10 rows carry a live observation" was ever written down.
//
//   node docs/evidence/pass85/lane-n/runtime-evidence-arity.mjs
//
// Recorded result at 75a4e508 and at the head of this branch:
//   rows=40 live=1 sourceShapeOnly=39
//   LIVE: environmentIntensity@L592
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKSLASH = String.fromCharCode(92);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FILE = resolve(REPO, 'src/graphics-settings-registry.ts');
const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');
const rows = [];
let i = 0;
for (;;) {
  const at = src.indexOf('runtimeEvidence(', i);
  if (at < 0) break;
  let j = at + 'runtimeEvidence'.length;
  let depth = 0; let inStr = null; const start = j + 1;
  for (; j < src.length; j += 1) {
    const c = src[j];
    if (inStr) { if (c === BACKSLASH) { j += 1; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) break; }
  }
  const body = src.slice(start, j);
  const args = []; let cur = ''; let d = 0; inStr = null;
  for (const c of body) {
    if (inStr) { cur += c; if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; cur += c; continue; }
    if ('([{'.includes(c)) d += 1;
    if (')]}'.includes(c)) d -= 1;
    if (c === ',' && d === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  const lineNo = src.slice(0, at).split('\n').length;
  const key = (lines[lineNo - 1] ?? '').trim().split(':')[0].replace(/^.*\s/, '');
  rows.push({ lineNo, key, argc: args.length });
  i = j + 1;
}
const live = rows.filter((r) => r.argc >= 4);
const shape = rows.filter((r) => r.argc < 4);
console.log(`rows=${rows.length} live=${live.length} sourceShapeOnly=${shape.length}`);
console.log('LIVE: ' + live.map((r) => `${r.key}@L${r.lineNo}`).join(', '));
console.log('SHAPE-ONLY (' + shape.length + '):');
console.log(shape.map((r) => '`' + r.key + '`').join(', '));
const mentions = lines.map((l, n) => [n + 1, l]).filter(([, l]) => l.includes('liveObservation'));
console.log('liveObservation textual mentions on lines: ' + mentions.map(([n]) => n).join(', '));
