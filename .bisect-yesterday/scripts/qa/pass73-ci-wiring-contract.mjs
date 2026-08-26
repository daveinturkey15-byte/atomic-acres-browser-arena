import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputsFor } from '../release/change-impact.mjs';

export const PASS73_BOUNDED_GROUP = 'pass73-gameplay-regressions';
export const PASS73_BROWSER_SPEC = 'tests/e2e/pass73-gameplay-regressions.spec.ts';
export const PASS73_NETWORK_REVEAL_SPEC = 'tests/e2e/pass73-network-reveal-authority.spec.ts';

function splitGroups(value) {
  return String(value ?? '').split(',').map((group) => group.trim()).filter(Boolean);
}

function exactlyOnce(values, expected) {
  return values.filter((value) => value === expected).length === 1;
}

function workflowSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return '';
  return source.slice(start, end);
}

export function pass73CiWiringFailures({
  boundedRunnerSource,
  workflowSource,
  windowsGroups,
  linuxGroups,
}) {
  const failures = [];
  const groupLine = boundedRunnerSource.split(/\r?\n/u)
    .find((line) => line.includes(`name: '${PASS73_BOUNDED_GROUP}'`));
  if (!groupLine) {
    failures.push(`bounded runner lacks ${PASS73_BOUNDED_GROUP}`);
  } else {
    if (!groupLine.includes(`'${PASS73_BROWSER_SPEC}'`)) failures.push('Pass 73 group lost its gameplay spec');
    if (!groupLine.includes(`'${PASS73_NETWORK_REVEAL_SPEC}'`)) {
      failures.push('Pass 73 group lost its network reveal authority spec');
    }
    if (!groupLine.includes("'--project=chromium'")) failures.push('Pass 73 group must select Chromium explicitly');
    if (!groupLine.includes("'--workers=1'")) failures.push('Pass 73 group must stay single-worker');
    if (!groupLine.includes('default: false')) failures.push('Pass 73 group must run only through explicit impact selection');
  }

  const windows = splitGroups(windowsGroups);
  const linux = splitGroups(linuxGroups);
  if (!exactlyOnce(windows, PASS73_BOUNDED_GROUP)) {
    failures.push(`full Windows impact must select ${PASS73_BOUNDED_GROUP} exactly once`);
  }
  if (!exactlyOnce(linux, PASS73_BOUNDED_GROUP)) {
    failures.push(`full Linux impact must select ${PASS73_BOUNDED_GROUP} exactly once`);
  }

  if (!workflowSource.includes('npm run qa:pass73:ci-wiring-contract')) {
    failures.push('verify workflow does not execute the Pass 73 wiring contract');
  }
  const windowsJob = workflowSection(workflowSource, '  bounded-browser-windows:', '  bounded-browser-linux:');
  const linuxJob = workflowSection(workflowSource, '  bounded-browser-linux:', '  pipeline-metrics:');
  if (!windowsJob.includes('QA_E2E_GROUPS: ${{ needs.classify-change.outputs.windows_groups }}')
    || !windowsJob.includes('npm run test:e2e:bounded')
    || windowsJob.includes('continue-on-error: true')) {
    failures.push('Windows bounded job does not fail closed on its selected groups');
  }
  if (!linuxJob.includes('QA_E2E_GROUPS: ${{ needs.classify-change.outputs.linux_groups }}')
    || !linuxJob.includes('npm run test:e2e:bounded')
    || linuxJob.includes('continue-on-error: true')) {
    failures.push('Linux bounded job does not fail closed on its selected groups');
  }
  return failures;
}

export function assertPass73CiWiring(input) {
  const failures = pass73CiWiringFailures(input);
  assert.deepEqual(failures, [], failures.join('\n'));
}

function repositoryInputs(root) {
  const full = outputsFor({ mode: 'full', reason: 'pass73-ci-wiring-contract' });
  return {
    boundedRunnerSource: readFileSync(resolve(root, 'scripts/qa/run-bounded-e2e.mjs'), 'utf8'),
    workflowSource: readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8'),
    windowsGroups: full.windows_groups,
    linuxGroups: full.linux_groups,
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  assertPass73CiWiring(repositoryInputs(root));
  console.log(JSON.stringify({ pass73CiWiring: 'ok', group: PASS73_BOUNDED_GROUP }));
}

export { repositoryInputs };
