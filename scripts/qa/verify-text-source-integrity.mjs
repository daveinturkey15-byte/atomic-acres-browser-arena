#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '../..');
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.glsl', '.html', '.js', '.jsx', '.json', '.md', '.mjs',
  '.ps1', '.py', '.sh', '.toml', '.ts', '.tsx', '.txt', '.wgsl', '.yaml', '.yml',
]);

function validateTextBytes(bytes) {
  const failures = [];
  if (bytes.length === 0) failures.push('is unexpectedly empty');
  if (bytes.includes(0)) failures.push('contains NUL bytes');
  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    failures.push('is not valid UTF-8');
  }
  if (text !== null && (
    /\u00c2[\u0080-\u00bf\u2000-\u20cf]/u.test(text)
    || /\u00c3[\u0080-\u00bf]/u.test(text)
    || /\u00e2[\u0080-\u00bf\u2000-\u20cf]/u.test(text)
    || /\u00ef\u00bb\u00bf/u.test(text)
    || /\u00f0[\u0080-\u00bf\u0178]/u.test(text)
  )) failures.push('contains a common UTF-8 mojibake sequence');
  return failures;
}

function trackedTextPaths() {
  const bytes = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return bytes.toString('utf8').split('\0').filter(Boolean)
    .filter((relativePath) => TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

function runSelfTest() {
  assert.deepEqual(validateTextBytes(Buffer.from('export const intact = true;\n', 'utf8')), []);
  assert.deepEqual(validateTextBytes(Buffer.alloc(0)), ['is unexpectedly empty']);
  assert.deepEqual(validateTextBytes(Buffer.from([0x61, 0x00, 0x62])), ['contains NUL bytes']);
  assert.deepEqual(validateTextBytes(Buffer.from([0xc3, 0x28])), ['is not valid UTF-8']);
  assert.deepEqual(
    validateTextBytes(Buffer.from(String.fromCodePoint(0x00e2, 0x20ac, 0x00a6), 'utf8')),
    ['contains a common UTF-8 mojibake sequence'],
  );
  assert.deepEqual(validateTextBytes(Buffer.from('café\n', 'utf8')), []);
  assert.deepEqual(
    validateTextBytes(Buffer.from([0x00, 0xc3, 0x28])),
    ['contains NUL bytes', 'is not valid UTF-8'],
  );
}

runSelfTest();

const failures = [];
const paths = trackedTextPaths();
for (const relativePath of paths) {
  const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
  for (const reason of validateTextBytes(readFileSync(absolutePath))) {
    failures.push(`${relativePath}: ${reason}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, checked: paths.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: paths.length, selfTest: true }, null, 2));
