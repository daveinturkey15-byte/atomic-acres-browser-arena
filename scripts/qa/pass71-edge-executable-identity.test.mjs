import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { readWindowsExecutableIdentity } from './pass71-edge-executable-identity.mjs';

test('Windows metadata probe safely handles an executable path containing spaces', {
  skip: process.platform !== 'win32',
}, () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'pass71 edge identity '));
  const copy = join(temporaryRoot, `copy of ${basename(process.execPath)}`);
  try {
    copyFileSync(process.execPath, copy);
    const identity = readWindowsExecutableIdentity(copy);
    assert.equal(identity.executablePath, copy);
    assert.equal(identity.installRoot, temporaryRoot);
    assert.match(identity.productVersion, /^\d+(?:\.\d+){1,3}$/u);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('metadata probe passes the target only through a dedicated environment value', () => {
  const source = readFileSync(new URL('./pass71-edge-executable-identity.mjs', import.meta.url), 'utf8');
  assert.match(source, /PASS71_EDGE_EXE_PROBE_PATH/u);
  assert.doesNotMatch(source, /-Command', script, executable/u);
});
