import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizationWriter } from './mp-soak-finalization.mjs';

test('cleanup receipt preserves exact identities and is write-once even across writers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aa-finalization-'));
  try {
    const path = join(dir, 'receipt.json');
    const write = finalizationWriter(path, { runtimeSha: 'runtime', driverSha: 'driver' });
    assert.equal(write({ cleanup: 'forced', reason: 'owned browser cleanup timed out after 3000ms', requestedExitCode: 1 }), true);
    assert.equal(write({ cleanup: 'normal' }), false);
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(receipt.runtimeSha, 'runtime');
    assert.equal(receipt.driverSha, 'driver');
    assert.equal(receipt.cleanup, 'forced');
    assert.equal(receipt.requestedExitCode, 1);
    assert.throws(() => finalizationWriter(path, {})({ cleanup: 'normal' }), /EEXIST/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('v2.1 driver retains bounded cleanup and writes receipt before forced termination', () => {
  const source = readFileSync(new URL('./mp-soak-gate-v21.mjs', import.meta.url), 'utf8');
  assert.match(source, /3000,'owned browser cleanup'/);
  assert.match(source, /const HARD_TIMEOUT_MS = 299_000/);
  const terminate = source.slice(source.indexOf('function terminateOwnedRun'), source.indexOf('async function closeOwnedBrowsers'));
  assert.ok(terminate.indexOf("cleanup:'forced'") < terminate.indexOf("spawnSync('taskkill'"));
  assert.match(source, /sourceSha,\s+driverSha,/);
});
