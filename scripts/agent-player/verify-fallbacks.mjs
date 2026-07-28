#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const registryPath = resolve(repositoryRoot, 'artifacts', 'agent-player', 'fallbacks', 'index.json');

function fail(message) {
  throw new Error(message);
}

function equalValue(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  equalValue(registry.schemaVersion, 1, 'registry schemaVersion');
  equalValue(registry.kind, 'atomic-player-fallback-registry', 'registry kind');
  if (!Array.isArray(registry.fallbacks) || registry.fallbacks.length < 2) fail('registry must contain at least two fallbacks');

  const ids = new Set();
  const verified = [];
  for (const fallback of registry.fallbacks) {
    if (ids.has(fallback.fallbackId)) fail(`duplicate fallbackId ${fallback.fallbackId}`);
    ids.add(fallback.fallbackId);

    const gameDirectory = resolve(repositoryRoot, fallback.source.archiveDirectory);
    const manifest = JSON.parse(await readFile(resolve(gameDirectory, 'manifest.json'), 'utf8'));
    const benchmark = JSON.parse(await readFile(resolve(gameDirectory, 'combat-benchmark.json'), 'utf8'));

    equalValue(manifest.gameId, fallback.gameId, `${fallback.fallbackId} gameId`);
    equalValue(manifest.completed, true, `${fallback.fallbackId} completed`);
    equalValue(manifest.counted, true, `${fallback.fallbackId} counted`);
    equalValue(manifest.sourceFingerprint, fallback.source.sourceFingerprint, `${fallback.fallbackId} source fingerprint`);
    equalValue(manifest.playerPolicy.policyId, fallback.source.policyId, `${fallback.fallbackId} policyId`);
    equalValue(manifest.playerPolicy.configurationFingerprint, fallback.source.policyConfigurationFingerprint, `${fallback.fallbackId} policy fingerprint`);
    equalValue(benchmark.source.harnessGitSha, fallback.source.driverCommit, `${fallback.fallbackId} driver commit receipt`);

    for (const [metric, expected] of Object.entries(fallback.result)) {
      equalValue(benchmark.result[metric], expected, `${fallback.fallbackId} result.${metric}`);
    }

    let fileCount = 0;
    for (const [relativePath, receipt] of Object.entries(fallback.immutableEvidence)) {
      const path = resolve(gameDirectory, relativePath);
      equalValue(await sha256(path), receipt.sha256, `${fallback.fallbackId} ${relativePath} hash`);
      equalValue((await readFile(path)).byteLength, receipt.bytes, `${fallback.fallbackId} ${relativePath} bytes`);
      fileCount += 1;
    }

    execFileSync('git', ['cat-file', '-e', `${fallback.source.driverCommit}^{commit}`], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    verified.push({ fallbackId: fallback.fallbackId, gameId: fallback.gameId, files: fileCount });
  }

  for (const selectedId of Object.values(registry.selected ?? {})) {
    if (!ids.has(selectedId)) fail(`selected fallback does not exist: ${selectedId}`);
  }

  console.log(JSON.stringify({ ok: true, registry: registryPath, verified }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
