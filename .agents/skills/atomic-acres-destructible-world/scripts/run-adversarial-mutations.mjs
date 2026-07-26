#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(scriptDir, 'fixtures');
const verifier = path.join(scriptDir, 'verify-interactive-world.mjs');
const knownGood = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'known-good.json'), 'utf8'));
const cases = [
  ['unknown authority key', value => { value.objects[0].clientCanFracture = true; }],
  ['non-object object entry', value => { value.objects[0] = null; }],
  ['non-object placement entry', value => { value.objects[0].placements[0] = null; }],
  ['forged receipt digest', value => { value.decisionBinding.receiptSha256 = 'f'.repeat(64); }],
  ['retired arena alias', value => { value.objects[0].placements[0].arenaId = 'nuke-town'; }],
  ['duplicate placement row', value => { value.objects[0].placements.push(structuredClone(value.objects[0].placements[0])); }],
  ['aperture cap above 32', value => { value.objects[0].apertures.maxPerObject = 64; }],
  ['dent cap above 24', value => { value.objects[0].maxDentsPerObject = 25; }],
  ['chunk cap above 6', value => { value.objects[0].debris.maxMajorChunks = 7; }],
  ['awake-body cap above 18', value => { value.globalBudgets.maxAwakeMajorBodiesArenaWide = 19; }],
  ['unknown obstruction enum', value => { value.objects[0].door.obstructionKinds.push('client'); }],
  ['missing consumer completeness', value => { value.consumers.pop(); }],
  ['forged evidence digest', value => { value.evidenceBinding.receiptSha256 = 'e'.repeat(64); }],
  ['evidence path escapes repository', value => { value.evidenceBinding.path = '../../../../package.json'; }],
  ['unsigned vertical slice', value => { value.objects[0].evidenceIds = ['shed-vertical-slice']; }],
];

const tempDir = fs.mkdtempSync(path.join(fixtureDir, '.mutation-'));
const falseAccepts = [];
const crashes = [];
try {
  for (let index = 0; index < cases.length; index += 1) {
    const [name, mutate] = cases[index];
    const candidate = structuredClone(knownGood);
    mutate(candidate);
    const candidatePath = path.join(tempDir, `${index}.json`);
    fs.writeFileSync(candidatePath, JSON.stringify(candidate));
    const run = spawnSync(process.execPath, [verifier, '--synthetic-fixture', candidatePath], { encoding: 'utf8' });
    if (run.status === 0) falseAccepts.push(name);
    else if (run.status !== 1 || /(?:TypeError|ReferenceError|RangeError):/.test(run.stderr)) crashes.push(name);
  }
} finally {
  const resolved = path.resolve(tempDir);
  if (!resolved.startsWith(`${path.resolve(fixtureDir)}${path.sep}.mutation-`)) throw new Error('refusing to remove unexpected mutation directory');
  fs.rmSync(resolved, { recursive: true, force: true });
}

if (falseAccepts.length || crashes.length) {
  console.error(`FAIL destructible-world adversarial falseAccepts=${falseAccepts.length} crashes=${crashes.length}`);
  for (const name of falseAccepts) console.error(`- ${name}`);
  for (const name of crashes) console.error(`- crashed: ${name}`);
  process.exit(1);
}
console.log(`PASS destructible-world adversarial cases=${cases.length}`);
