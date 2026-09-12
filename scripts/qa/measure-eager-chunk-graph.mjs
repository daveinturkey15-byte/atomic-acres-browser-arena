/**
 * MAP3 (HF-409): measure the EAGER chunk closure of a built entry.
 *
 * "The main bundle did not grow" is only meaningful if it means the bytes a
 * player actually downloads before they can play, and that is not one file: it
 * is the entry chunk plus every chunk reachable from it by STATIC import.
 * A `import()` edge is excluded on purpose - that is the whole point of a
 * code-split arena, and counting it would hide the win.
 *
 * Usage: node scripts/qa/measure-eager-chunk-graph.mjs [distDir] [entryPrefix]
 * Prints JSON: { entry, chunkCount, totalBytes, chunks: [{file, bytes}] }
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = process.argv[2] ?? 'dist';
const entryPrefix = process.argv[3] ?? 'legacy-main-';
const assetsDir = join(distDir, 'assets');
const files = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
const entry = files.find((f) => f.startsWith(entryPrefix));
if (!entry) throw new Error(`no chunk starting with '${entryPrefix}' in ${assetsDir}`);

// Static ESM edges only. `import(...)` is a call expression and never matches
// these: `from "./x.js"`, a bare side-effect `import "./x.js"`, and
// `export ... from "./x.js"`.
const STATIC_EDGE = /(?:^|[};\s])(?:import|export)\s*(?:[^;'"()]*?from\s*)?["'](\.\/[^"']+\.js)["']/g;

const seen = new Set();
const queue = [entry];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const source = readFileSync(join(assetsDir, file), 'utf8');
  STATIC_EDGE.lastIndex = 0;
  let match;
  while ((match = STATIC_EDGE.exec(source))) {
    const target = match[1].replace(/^\.\//, '');
    if (!seen.has(target) && files.includes(target)) queue.push(target);
  }
}

const chunks = [...seen].sort().map((file) => ({ file, bytes: statSync(join(assetsDir, file)).size }));
const totalBytes = chunks.reduce((sum, c) => sum + c.bytes, 0);
process.stdout.write(`${JSON.stringify({ entry, chunkCount: chunks.length, totalBytes, chunks }, null, 2)}\n`);
