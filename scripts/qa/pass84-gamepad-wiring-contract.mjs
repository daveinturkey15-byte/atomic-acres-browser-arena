// ===========================================================================
// PASS 87 Lane AR, item 13 (Lane N's withheld patch).
//
// tests/e2e/pass84-gamepad.spec.ts shipped with the gamepad + aim-assist
// feature the owner asked for on 2026-08-31 and was executed by NOTHING in CI.
// The bounded runner did carry a `pass84-gamepad` group, marked `default:
// true` - but BOTH CI browser jobs pass QA_E2E_GROUPS explicitly from
// classify-change, and the default set is only consulted when that variable is
// empty. A group that lives only in the default set is dark in CI. That is the
// same failure that left pass74-arena-boot-smoke dark, and it is why this
// contract asserts the CI SELECTION rather than the group's existence.
//
// Modelled on scripts/qa/pass73-ci-wiring-contract.mjs, deliberately: the same
// shape means the next person reads one pattern rather than three.
// ===========================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputsFor } from '../release/change-impact.mjs';

export const PASS84_BOUNDED_GROUP = 'pass84-gamepad';
export const PASS84_BROWSER_SPEC = 'tests/e2e/pass84-gamepad.spec.ts';

const WINDOWS_GROUPS_BINDING = 'QA_E2E_GROUPS: ${{ needs.classify-change.outputs.windows_groups }}';
const LINUX_GROUPS_BINDING = 'QA_E2E_GROUPS: ${{ needs.classify-change.outputs.linux_groups }}';

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

export function pass84GamepadWiringFailures({
  boundedRunnerSource,
  workflowSource,
  packageJsonSource,
  windowsGroups,
  linuxGroups,
  smokeWindowsGroups,
  smokeLinuxGroups,
}) {
  const failures = [];

  const groupLine = boundedRunnerSource.split(/\r?\n/u)
    .find((line) => line.includes(`name: '${PASS84_BOUNDED_GROUP}'`));
  if (!groupLine) {
    failures.push(`bounded runner lacks ${PASS84_BOUNDED_GROUP}`);
  } else {
    if (!groupLine.includes(`'${PASS84_BROWSER_SPEC}'`)) {
      failures.push('Pass 84 gamepad group lost its spec');
    }
    if (!groupLine.includes("'--project=chromium'")) {
      failures.push('Pass 84 gamepad group must select Chromium explicitly');
    }
    if (!groupLine.includes("'--workers=1'")) {
      failures.push('Pass 84 gamepad group must stay single-worker');
    }
  }

  // The whole point of the row: a full-impact change must SELECT it, on both
  // runners, exactly once. A duplicate would run the five-minute spec twice.
  const windows = splitGroups(windowsGroups);
  const linux = splitGroups(linuxGroups);
  if (!exactlyOnce(windows, PASS84_BOUNDED_GROUP)) {
    failures.push(`full Windows impact must select ${PASS84_BOUNDED_GROUP} exactly once`);
  }
  if (!exactlyOnce(linux, PASS84_BOUNDED_GROUP)) {
    failures.push(`full Linux impact must select ${PASS84_BOUNDED_GROUP} exactly once`);
  }
  // ...and a smoke-mode change must NOT, or the classification stops meaning
  // anything. A gate that fires on everything is a gate nobody reads.
  if (splitGroups(smokeWindowsGroups).includes(PASS84_BOUNDED_GROUP)
    || splitGroups(smokeLinuxGroups).includes(PASS84_BOUNDED_GROUP)) {
    failures.push(`${PASS84_BOUNDED_GROUP} must not be selected by a smoke-mode change`);
  }

  if (!packageJsonSource.includes('"qa:pass84:gamepad-wiring-contract"')) {
    failures.push('package.json does not expose qa:pass84:gamepad-wiring-contract');
  }
  if (!workflowSource.includes('npm run qa:pass84:gamepad-wiring-contract')) {
    failures.push('verify workflow does not execute the Pass 84 gamepad wiring contract');
  }

  // The same fail-closed check the Pass 73 contract makes: the browser jobs
  // must keep taking their groups FROM classify-change, or the list entries
  // above are decoration.
  const windowsJob = workflowSection(workflowSource, '  bounded-browser-windows:', '  bounded-browser-linux:');
  const linuxJob = workflowSection(workflowSource, '  bounded-browser-linux:', '  pipeline-metrics:');
  if (!windowsJob.includes(WINDOWS_GROUPS_BINDING)
    || !windowsJob.includes('npm run test:e2e:bounded')
    || windowsJob.includes('continue-on-error: true')) {
    failures.push('Windows bounded job does not fail closed on its selected groups');
  }
  if (!linuxJob.includes(LINUX_GROUPS_BINDING)
    || !linuxJob.includes('npm run test:e2e:bounded')
    || linuxJob.includes('continue-on-error: true')) {
    failures.push('Linux bounded job does not fail closed on its selected groups');
  }
  return failures;
}

export function assertPass84GamepadWiring(input) {
  const failures = pass84GamepadWiringFailures(input);
  assert.deepEqual(failures, [], failures.join('\n'));
}

function repositoryInputs(root) {
  const full = outputsFor({ mode: 'full', reason: 'pass84-gamepad-wiring-contract' });
  const smoke = outputsFor({ mode: 'smoke', reason: 'pass84-gamepad-wiring-contract' });
  return {
    boundedRunnerSource: readFileSync(resolve(root, 'scripts/qa/run-bounded-e2e.mjs'), 'utf8'),
    workflowSource: readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8'),
    packageJsonSource: readFileSync(resolve(root, 'package.json'), 'utf8'),
    windowsGroups: full.windows_groups,
    linuxGroups: full.linux_groups,
    smokeWindowsGroups: smoke.windows_groups,
    smokeLinuxGroups: smoke.linux_groups,
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  assertPass84GamepadWiring(repositoryInputs(root));
  console.log(JSON.stringify({ pass84GamepadWiring: 'ok', group: PASS84_BOUNDED_GROUP }));
}

export { repositoryInputs };
