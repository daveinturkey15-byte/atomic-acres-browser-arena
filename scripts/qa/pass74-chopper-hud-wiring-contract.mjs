import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputsFor } from '../release/change-impact.mjs';

export const PASS74_BOUNDED_GROUP = 'pass74-chopper-hud';
export const PASS74_BROWSER_SPEC = 'tests/e2e/pass74-chopper-hud.spec.ts';

const split = (value) => String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
const count = (values, expected) => values.filter((entry) => entry === expected).length;

export function pass74ChopperHudWiringFailures({ boundedRunnerSource, workflowSource, windowsGroups, linuxGroups }) {
  const failures = [];
  const groupLine = boundedRunnerSource.split(/\r?\n/u).find((line) => line.includes(`name: '${PASS74_BOUNDED_GROUP}'`));
  if (!groupLine) failures.push('bounded runner lacks Pass 74 Chopper HUD group');
  else {
    if (!groupLine.includes(`'${PASS74_BROWSER_SPEC}'`)) failures.push('Pass 74 group lost its HUD spec');
    if (!groupLine.includes("'--project=chromium'")) failures.push('Pass 74 group must select Chromium explicitly');
    if (!groupLine.includes("'--workers=1'")) failures.push('Pass 74 group must stay single-worker');
    if (!groupLine.includes('default: false')) failures.push('Pass 74 group must be opt-in');
  }
  for (const [label, value] of [['Windows', windowsGroups], ['Linux', linuxGroups]]) {
    if (count(split(value), PASS74_BOUNDED_GROUP) !== 1) failures.push(`full ${label} impact must select ${PASS74_BOUNDED_GROUP} exactly once`);
  }
  if (!workflowSource.includes('npm run qa:pass74:chopper-hud-wiring-contract')) failures.push('verify workflow does not execute Pass 74 HUD wiring contract');
  return failures;
}

export function repositoryInputs(root) {
  const full = outputsFor({ mode: 'full', reason: 'pass74-chopper-hud-wiring-contract' });
  return {
    boundedRunnerSource: readFileSync(resolve(root, 'scripts/qa/run-bounded-e2e.mjs'), 'utf8'),
    workflowSource: readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8'),
    windowsGroups: full.windows_groups,
    linuxGroups: full.linux_groups,
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  assert.deepEqual(pass74ChopperHudWiringFailures(repositoryInputs(root)), []);
  console.log(JSON.stringify({ pass74ChopperHudWiring: 'ok', group: PASS74_BOUNDED_GROUP }));
}
