#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index].replace(/^--/, '')] = argv[index + 1];
  return values;
}

function filesUnder(root, current = root) {
  return readdirSync(current).flatMap((name) => {
    const path = join(current, name);
    return statSync(path).isDirectory() ? filesUnder(root, path) : [path];
  });
}

const values = parseArgs(process.argv.slice(2));
if (!/^[0-9a-f]{40}$/.test(values.head ?? '')) throw new Error('--head must be a full Git SHA');
if (!/^\d+$/.test(values.pr ?? '')) throw new Error('--pr must be a pull request number');
const dist = resolve(values.dist ?? 'dist');
const entries = filesUnder(dist).map((path) => ({
  path: relative(dist, path).replaceAll('\\', '/'),
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
})).sort((left, right) => left.path.localeCompare(right.path));
const receipt = {
  schemaVersion: 1,
  sourceSha: values.head,
  pullRequest: Number(values.pr),
  createdAt: new Date().toISOString(),
  artifactName: `pr-preview-${values.pr}-${values.head}`,
  fileCount: entries.length,
  treeSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
};
const output = resolve(values.output ?? 'artifacts/pipeline/pr-preview.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt, null, 2));
