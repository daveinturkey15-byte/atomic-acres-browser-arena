#!/usr/bin/env node
// Duplicate-block report: normalised sliding windows of N non-trivial statements
// over non-test src/. Usage: node scripts/qa/duplicate-block-report.mjs [root] [window]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.argv[2] || process.cwd();
const WIN = Number(process.argv[3] || 8);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
const buckets = new Map();
for (const f of files) {
  const keep = readFileSync(f, 'utf8').split('\n')
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && t.length >= 6);
  for (let i = 0; i + WIN <= keep.length; i++) {
    const h = createHash('sha1').update(keep.slice(i, i + WIN).join('\n')).digest('hex').slice(0, 16);
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h).push(relative(ROOT, f).replace(/\\/g, '/'));
  }
}
const groups = new Map();
for (const [, hits] of buckets) {
  if (hits.length < 2) continue;
  const key = [...new Set(hits)].sort().join(' <-> ');
  groups.set(key, (groups.get(key) || 0) + 1);
}
console.log(`window=${WIN}`);
for (const [k, v] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`${String(v).padStart(5)}  ${k}`);
}
// Named scores this lane is graded on.
const FORGE_PAIRS = [
  'src/forge-kit/eaves/index.ts <-> src/forge-kit/index.ts',
  'src/forge-kit/index.ts <-> src/forge-kit/window/index.ts',
  'src/forge-kit/index.ts <-> src/forge-kit/yard/index.ts',
  'src/forge-kit/index.ts <-> src/forge-kit/street-signs/index.ts',
  'src/forge-kit/index.ts <-> src/forge-kit/street/index.ts',
];
const forge = FORGE_PAIRS.reduce((n, k) => n + (groups.get(k) || 0), 0);
const schema = groups.get('src/combat/weapon-schema.ts <-> src/loadout-preset-schema.ts') || 0;
const arena = groups.get('src/forge-kit/index.ts <-> src/nuketown2-arena.ts') || 0;
console.log(`SCORE forgeKitBarrelWindows=${forge}`);   // base 90
console.log(`SCORE schemaPairWindows=${schema}`);      // base 29
console.log(`SCORE forgeKitArenaWindows=${arena}`);    // base 15 — must not grow, not yours to fix
