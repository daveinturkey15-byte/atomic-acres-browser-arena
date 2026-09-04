// Prints the exact leaf-level differences between the live gameplay contract and the frozen pre-HITL baseline (read-only diagnostic).
// Usage: npx tsx scripts/qa/diff-gameplay-contract.mjs
// Flags/env: none (no process.argv entries or process.env variables are read)
// Writes: nothing (reads baselines/pass65-candidate/gameplay-contract.json; prints diffs to stdout)
// Exit codes: 0 on success; non-zero on unhandled error (no explicit process.exit calls)
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stableStringify } from '../../src/canonical-state.ts';
import { buildGameplayContract } from '../../src/gameplay-contract.ts';

const baseline = JSON.parse(
  await readFile(resolve('baselines/pass65-candidate/gameplay-contract.json'), 'utf8'),
).contract;
const live = JSON.parse(stableStringify(buildGameplayContract()));

function flatten(value, path, into) {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, `${path}/${key}`, into);
  } else into.set(path, value);
  return into;
}
const a = flatten(baseline, '', new Map());
const b = flatten(live, '', new Map());
const keys = new Set([...a.keys(), ...b.keys()]);
const diffs = [];
for (const key of keys) {
  if (a.get(key) !== b.get(key)) diffs.push(`${key}: ${JSON.stringify(a.get(key))} -> ${JSON.stringify(b.get(key))}`);
}
diffs.sort();
console.log(`${diffs.length} changed leaves`);
for (const line of diffs) console.log('  ' + line);
