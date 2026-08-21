import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PASS73_BOUNDED_GROUP,
  assertPass73CiWiring,
  pass73CiWiringFailures,
  repositoryInputs,
} from './pass73-ci-wiring-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const actual = repositoryInputs(root);

test('accepts the fail-closed Pass 73 group wiring', () => {
  assert.doesNotThrow(() => assertPass73CiWiring(actual));
});

test('rejects a bounded group that no longer executes the Pass 73 spec', () => {
  const mutated = {
    ...actual,
    boundedRunnerSource: actual.boundedRunnerSource.replace(
      'tests/e2e/pass73-gameplay-regressions.spec.ts',
      'tests/e2e/pass72-lobby-squad-reset.spec.ts',
    ),
  };
  assert.match(pass73CiWiringFailures(mutated).join('\n'), /lost its gameplay spec/u);
});

test('rejects either operating-system matrix omitting the Pass 73 group', () => {
  const withoutPass73 = (value) => value.split(',').filter((group) => group !== PASS73_BOUNDED_GROUP).join(',');
  assert.match(pass73CiWiringFailures({
    ...actual,
    windowsGroups: withoutPass73(actual.windowsGroups),
  }).join('\n'), /full Windows impact/u);
  assert.match(pass73CiWiringFailures({
    ...actual,
    linuxGroups: withoutPass73(actual.linuxGroups),
  }).join('\n'), /full Linux impact/u);
});

test('rejects a workflow bypass or advisory-only bounded job', () => {
  assert.match(pass73CiWiringFailures({
    ...actual,
    workflowSource: actual.workflowSource.replace('npm run qa:pass73:ci-wiring-contract', 'npm run lint'),
  }).join('\n'), /does not execute/u);
  assert.match(pass73CiWiringFailures({
    ...actual,
    workflowSource: actual.workflowSource.replace(
      '  bounded-browser-windows:',
      '  bounded-browser-windows:\n    continue-on-error: true',
    ),
  }).join('\n'), /Windows bounded job does not fail closed/u);
});
