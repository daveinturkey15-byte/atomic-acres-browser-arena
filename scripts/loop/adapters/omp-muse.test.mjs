// node --test scripts/loop/adapters/omp-muse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOmpMuseAdapter, DEFAULT_MODEL, CRITIC_SYSTEM_PROMPT } from './omp-muse.mjs';
import { assertAdapter, loadAdapter } from './index.mjs';

test('Muse is registered as a vision adapter with the exact contributor model', async () => {
  const adapter = await loadAdapter('omp-muse', { cwd: mkdtempSync(join(tmpdir(), 'muse-test-')) });
  assertAdapter(adapter);
  assert.equal(adapter.id, 'omp-muse');
  assert.equal(adapter.kind, 'vision');
  assert.match(adapter.describe(), new RegExp(DEFAULT_MODEL.replace('/', '\\/')));
});

test('Muse argv keeps prompt transport on stdin and attaches neutral paths', () => {
  const adapter = createOmpMuseAdapter({ cwd: mkdtempSync(join(tmpdir(), 'muse-test-')) });
  const argv = adapter.argv({ images: ['C:\\captures\\reference frame.png', 'C:\\captures\\capture.png'], jsonPath: 'C:\\measurements\\tier0.json' });
  assert.equal(argv[0], '-p');
  assert.deepEqual(argv.slice(1, 4), ['@C:\\captures\\reference frame.png', '@C:\\captures\\capture.png', '@C:\\measurements\\tier0.json']);
  assert.ok(argv.includes('--model'));
  assert.ok(argv.includes(DEFAULT_MODEL));
  for (const flag of ['--no-session', '--no-skills', '--no-lsp', '--allow-home', '--cwd']) assert.ok(argv.includes(flag), `missing ${flag}`);
  assert.ok(argv.includes(CRITIC_SYSTEM_PROMPT));
});

test('Muse uses an isolated cwd and neutral attachment names', () => {
  const adapter = createOmpMuseAdapter({ cwd: mkdtempSync(join(tmpdir(), 'muse-test-')) });
  const neutral = adapter.neutralise({ images: [], jsonPath: null });
  assert.deepEqual(neutral, { images: [], jsonPath: null });
  assert.match(adapter.isolatedCwd, /muse-test/);
});
