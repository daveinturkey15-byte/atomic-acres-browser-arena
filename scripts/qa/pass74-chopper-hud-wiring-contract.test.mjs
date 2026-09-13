import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pass74ChopperHudWiringFailures, repositoryInputs } from './pass74-chopper-hud-wiring-contract.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const actual = repositoryInputs(root);

test('accepts the bounded Pass 74 Chopper HUD wiring', () => {
  assert.deepEqual(pass74ChopperHudWiringFailures(actual), []);
});

test('rejects missing Pass 74 group selection', () => {
  const without = actual.windowsGroups.split(',').filter((entry) => entry !== 'pass74-chopper-hud').join(',');
  assert.match(pass74ChopperHudWiringFailures({ ...actual, windowsGroups: without }).join('\n'), /full Windows impact/u);
});

test('rejects a non-Chromium or default-on group', () => {
  const runner = readFileSync(resolve(root, 'scripts/qa/run-bounded-e2e.mjs'), 'utf8')
    .replace("{ name: 'pass74-chopper-hud', default: false, timeoutMs: 240_000, args: ['tests/e2e/pass74-chopper-hud.spec.ts', '--project=chromium'", "{ name: 'pass74-chopper-hud', default: true, timeoutMs: 240_000, args: ['tests/e2e/pass74-chopper-hud.spec.ts', '--project=firefox'");
  const failures = pass74ChopperHudWiringFailures({ ...actual, boundedRunnerSource: runner });
  assert.match(failures.join('\n'), /Chromium/u);
  assert.match(failures.join('\n'), /opt-in/u);
});
