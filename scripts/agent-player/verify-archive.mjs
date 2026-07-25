#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METRIC_REGISTRY } from './archive-game.mjs';

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function filesRecursively(root, current = root) {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) output.push(...await filesRecursively(root, path));
    else if (entry.isFile()) output.push(relative(root, path).replaceAll('\\', '/'));
  }
  return output.sort();
}

export async function verifyArchive(archiveRoot) {
  archiveRoot = resolve(archiveRoot);
  const errors = [];
  const indexPath = join(archiveRoot, 'index.json');
  if (!await exists(indexPath)) throw new Error(`Archive index is missing: ${indexPath}`);
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const expectedIds = index.games.map((_, gameIndex) => `G${String(gameIndex + 1).padStart(4, '0')}`);
  const actualIds = index.games.map((game) => game.id);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) errors.push('game IDs are not contiguous and ordered');
  if (index.games.length > 0 && !index.games.some((game) => game.id === index.baselineGameId)) errors.push('baselineGameId does not identify an archived game');

  let verifiedFiles = 0;
  for (const game of index.games) {
    const directory = join(archiveRoot, game.directory);
    const manifestPath = join(directory, 'manifest.json');
    if (!await exists(manifestPath)) {
      errors.push(`${game.id}: manifest.json missing`);
      continue;
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.gameId !== game.id) errors.push(`${game.id}: manifest gameId mismatch`);
    const evidenceByName = new Map(manifest.evidence.map((entry) => [entry.file, entry]));
    const actualFiles = (await filesRecursively(directory)).filter((file) => file !== 'manifest.json');
    for (const file of actualFiles) {
      const evidence = evidenceByName.get(file);
      if (!evidence) {
        errors.push(`${game.id}: unmanifested file ${file}`);
        continue;
      }
      const path = join(directory, file);
      const info = await stat(path);
      if (info.size !== evidence.bytes) errors.push(`${game.id}: size mismatch ${file}`);
      if (await sha256File(path) !== evidence.sha256) errors.push(`${game.id}: hash mismatch ${file}`);
      verifiedFiles += 1;
    }
    for (const file of evidenceByName.keys()) {
      if (!actualFiles.includes(file)) errors.push(`${game.id}: manifested file missing ${file}`);
    }
    for (const comparisonName of ['comparison-vs-baseline.json', 'comparison-vs-previous.json']) {
      const path = join(directory, comparisonName);
      if (!await exists(path)) continue;
      const comparison = JSON.parse(await readFile(path, 'utf8'));
      if (comparison.rows?.length !== METRIC_REGISTRY.length) {
        errors.push(`${game.id}: ${comparisonName} has ${comparison.rows?.length ?? 0}/${METRIC_REGISTRY.length} metric rows`);
      }
    }
    if (game.benchmarkFile && !await exists(join(archiveRoot, game.benchmarkFile))) errors.push(`${game.id}: benchmarkFile missing`);
  }
  return {
    ok: errors.length === 0,
    archiveRoot,
    gameCount: index.games.length,
    baselineGameId: index.baselineGameId,
    metricCount: METRIC_REGISTRY.length,
    verifiedFiles,
    errors,
  };
}

async function main() {
  const archiveRoot = process.argv[2] ?? 'artifacts/agent-player/archive';
  const result = await verifyArchive(archiveRoot);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
