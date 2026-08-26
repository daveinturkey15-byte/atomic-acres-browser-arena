#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const authorityDir = path.join(repoRoot, '.agents', 'skills', 'atomic-acres-killstreak-authority', 'scripts');
const verifier = path.join(authorityDir, 'verify-killstreak-catalog.mjs');
const fixture = (name) => path.join(authorityDir, 'fixtures', name);

const cases = [
  {
    label: 'known-good frozen DEC-13 fixture',
    args: [verifier, '--synthetic-fixture', fixture('known-good.json')],
    expectedStatus: 0,
  },
  {
    label: 'incomplete fixture rejection',
    args: [verifier, '--synthetic-fixture', fixture('incomplete.json')],
    expectedStatus: 1,
  },
  {
    label: 'future-content and adversarial mutations',
    args: [path.join(authorityDir, 'run-adversarial-mutations.mjs')],
    expectedStatus: 0,
  },
];

let failed = false;
for (const testCase of cases) {
  const run = spawnSync(process.execPath, testCase.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (run.error || run.status !== testCase.expectedStatus) {
    failed = true;
    console.error(`FAIL ${testCase.label}: expected exit ${testCase.expectedStatus}, received ${run.status ?? 'none'}`);
    if (run.error) console.error(run.error.message);
    if (run.stdout.trim()) console.error(run.stdout.trim());
    if (run.stderr.trim()) console.error(run.stderr.trim());
  } else {
    console.log(`PASS ${testCase.label}`);
  }
}

if (failed) process.exit(1);
console.log('PASS Pass 65 killstreak catalog authority gate');
