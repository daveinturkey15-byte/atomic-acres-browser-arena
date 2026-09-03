import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PASS84_BOUNDED_GROUP,
  PASS84_BROWSER_SPEC,
  pass84GamepadWiringFailures,
  repositoryInputs,
} from './pass84-gamepad-wiring-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The real repository, so the contract can never pass on a fixture alone. */
function live() {
  return repositoryInputs(ROOT);
}

test('the live repository wires the Pass 84 gamepad spec into CI', () => {
  assert.deepEqual(pass84GamepadWiringFailures(live()), []);
});

test('a bounded runner without the group fails', () => {
  const input = { ...live(), boundedRunnerSource: '// no groups here' };
  assert.ok(pass84GamepadWiringFailures(input)
    .includes(`bounded runner lacks ${PASS84_BOUNDED_GROUP}`));
});

test('a group that lost its spec fails', () => {
  const input = {
    ...live(),
    boundedRunnerSource: `{ name: '${PASS84_BOUNDED_GROUP}', args: ['--project=chromium', '--workers=1'] },`,
  };
  assert.ok(pass84GamepadWiringFailures(input).includes('Pass 84 gamepad group lost its spec'));
});

test('a group that drops single-worker or explicit chromium fails', () => {
  const input = {
    ...live(),
    boundedRunnerSource: `{ name: '${PASS84_BOUNDED_GROUP}', args: ['${PASS84_BROWSER_SPEC}'] },`,
  };
  const failures = pass84GamepadWiringFailures(input);
  assert.ok(failures.includes('Pass 84 gamepad group must select Chromium explicitly'));
  assert.ok(failures.includes('Pass 84 gamepad group must stay single-worker'));
});

test('the exact defect it was written for: group present, never selected', () => {
  // The pre-PASS-87 state, reproduced: run-bounded-e2e.mjs carries the group
  // and neither CI list names it. Nothing else about the repo is changed.
  const input = { ...live(), windowsGroups: 'release-shell,pass74-chopper-hud', linuxGroups: 'release-shell' };
  assert.deepEqual(pass84GamepadWiringFailures(input), [
    `full Windows impact must select ${PASS84_BOUNDED_GROUP} exactly once`,
    `full Linux impact must select ${PASS84_BOUNDED_GROUP} exactly once`,
  ]);
});

test('a duplicated selection fails too', () => {
  const input = { ...live(), windowsGroups: `release-shell,${PASS84_BOUNDED_GROUP},${PASS84_BOUNDED_GROUP}` };
  assert.ok(pass84GamepadWiringFailures(input)
    .includes(`full Windows impact must select ${PASS84_BOUNDED_GROUP} exactly once`));
});

test('selecting the group on a smoke-mode change fails', () => {
  const input = { ...live(), smokeLinuxGroups: `release-shell,${PASS84_BOUNDED_GROUP}` };
  assert.ok(pass84GamepadWiringFailures(input)
    .includes(`${PASS84_BOUNDED_GROUP} must not be selected by a smoke-mode change`));
});

test('a workflow that stops taking its groups from classify-change fails', () => {
  const input = { ...live(), workflowSource: 'npm run qa:pass84:gamepad-wiring-contract' };
  const failures = pass84GamepadWiringFailures(input);
  assert.ok(failures.includes('Windows bounded job does not fail closed on its selected groups'));
  assert.ok(failures.includes('Linux bounded job does not fail closed on its selected groups'));
});

test('an unexposed npm script fails', () => {
  const input = { ...live(), packageJsonSource: '{}' };
  assert.ok(pass84GamepadWiringFailures(input)
    .includes('package.json does not expose qa:pass84:gamepad-wiring-contract'));
});
