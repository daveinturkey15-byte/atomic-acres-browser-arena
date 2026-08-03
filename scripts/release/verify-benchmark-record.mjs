#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..', '..');
const RECORD_PATH = resolve(ROOT, 'baselines', 'pass62', 'best-netcode-benchmark.json');
const CHANNELS_PATH = resolve(ROOT, 'release-channels.json');
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PASS = /^PASS [1-9][0-9]*(\.[0-9]+)?$/;

function safeRelativePath(value, label) {
  if (value === '.') return value;
  if (typeof value !== 'string' || !value || value.includes('\\')
    || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a safe POSIX relative path`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
}

function verifyHostedTree(record) {
  git(['cat-file', '-e', `${record.pagesSha}^{commit}`]);
  const prefix = `${record.pagesPath}/`;
  const sourcePaths = git(['ls-tree', '-r', '-z', '--name-only', record.pagesSha, '--', record.pagesPath])
    .split('\0').filter(Boolean);
  const excluded = new Set(record.runtimeDigestPolicy.excludedFiles);
  const selected = sourcePaths
    .map((sourcePath) => ({ sourcePath, relative: sourcePath.startsWith(prefix) ? sourcePath.slice(prefix.length) : sourcePath }))
    .filter(({ relative }) => !excluded.has(relative))
    .sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
  const hash = createHash('sha256');
  for (const { sourcePath, relative } of selected) {
    hash.update(relative);
    hash.update('\0');
    hash.update(git(['cat-file', 'blob', `${record.pagesSha}:${sourcePath}`], null));
    hash.update('\0');
  }
  if (selected.length !== record.runtimeFileCount) throw new Error(`hosted runtime count ${selected.length} != ${record.runtimeFileCount}`);
  if (sourcePaths.length !== record.runtimeDigestPolicy.completeSubtreeFileCount) {
    throw new Error(`hosted subtree count ${sourcePaths.length} != ${record.runtimeDigestPolicy.completeSubtreeFileCount}`);
  }
  const digest = hash.digest('hex');
  if (digest !== record.runtimeTreeSha256) throw new Error(`hosted runtime digest ${digest} != ${record.runtimeTreeSha256}`);
  return { digestedFiles: selected.length, completeSubtreeFiles: sourcePaths.length, treeSha256: digest };
}

export function verifyBenchmarkRecord(record, channels, options = {}) {
  if (record.schemaVersion !== 1 || typeof record.designation !== 'string' || !record.designation) throw new Error('invalid benchmark identity');
  if (typeof record.designatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.designatedAt)
    || Number.isNaN(Date.parse(record.designatedAt))) throw new Error('designatedAt must be an exact UTC timestamp');
  if (record.immutable !== true || !PASS.test(record.releasePass)) throw new Error('benchmark must be immutable and name one release pass');
  for (const field of ['sourceSha', 'pagesSha']) if (!SHA40.test(record[field] ?? '')) throw new Error(`${field} must be an exact lowercase SHA`);
  safeRelativePath(record.pagesPath, 'pagesPath');
  positiveInteger(record.runtimeFileCount, 'runtimeFileCount');
  if (!SHA256.test(record.runtimeTreeSha256 ?? '') || !SHA256.test(record.acceptanceManifestSha256 ?? '')) throw new Error('benchmark digests must be lowercase SHA-256');
  for (const field of ['requiredChecksRun', 'productionWorkflowRun', 'pagesWorkflowRun']) positiveInteger(record[field], field);
  positiveInteger(record.productionReceiptArtifact?.id, 'productionReceiptArtifact.id');
  if (typeof record.productionReceiptArtifact?.name !== 'string' || !record.productionReceiptArtifact.name) throw new Error('production receipt name is required');
  if (!Array.isArray(record.retainedContracts) || record.retainedContracts.length < 1
    || record.retainedContracts.some((item) => typeof item !== 'string' || !item)) throw new Error('retainedContracts must be non-empty strings');
  if (!String(record.rollbackPolicy).toLowerCase().includes('exact') || !String(record.rollbackPolicy).toLowerCase().includes('rebuild')) {
    throw new Error('rollbackPolicy must require exact bytes and reject rebuilds');
  }
  const policy = record.runtimeDigestPolicy;
  if (!policy || policy.excludedFiles?.length !== 1 || policy.excludedFiles[0] !== 'channel-provenance.json'
    || policy.completeSubtreeFileCount !== record.runtimeFileCount + 1
    || policy.wrapperProvenanceFile !== 'pinned-channel-provenance.json') {
    throw new Error('runtimeDigestPolicy must distinguish the embedded provenance and outer wrapper');
  }
  for (const excluded of policy.excludedFiles) safeRelativePath(excluded, 'runtimeDigestPolicy.excludedFiles[]');
  if (channels.schemaVersion < 4 || !channels.stable) throw new Error('release channel config has no pinned stable channel');
  if (!PASS.test(channels.stable.pass) || !SHA40.test(channels.stable.sourceSha ?? '')
    || !SHA40.test(channels.stable.pagesSha ?? '') || !SHA256.test(channels.stable.runtimeTreeSha256 ?? '')) {
    throw new Error('release channel config has an invalid pinned stable identity');
  }
  safeRelativePath(channels.stable.pagesPath, 'stable.pagesPath');
  positiveInteger(channels.stable.runtimeFileCount, 'stable.runtimeFileCount');

  let hosted = null;
  if (options.verifyGit) {
    git(['cat-file', '-e', `${record.sourceSha}^{commit}`]);
    const acceptance = git(['cat-file', 'blob', `${record.sourceSha}:acceptance/pass-62.json`], null);
    const digest = createHash('sha256').update(acceptance).digest('hex');
    if (digest !== record.acceptanceManifestSha256) throw new Error(`acceptance manifest digest ${digest} != ${record.acceptanceManifestSha256}`);
    hosted = verifyHostedTree(record);
  }
  return {
    ok: true,
    releasePass: record.releasePass,
    sourceSha: record.sourceSha,
    currentStablePass: channels.stable.pass,
    benchmarkIsCurrentStable: channels.stable.sourceSha === record.sourceSha,
    hosted,
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
  const channels = JSON.parse(readFileSync(CHANNELS_PATH, 'utf8'));
  const receipt = verifyBenchmarkRecord(record, channels, { verifyGit: process.argv.includes('--verify-git') });
  console.log(JSON.stringify(receipt, null, 2));
}
