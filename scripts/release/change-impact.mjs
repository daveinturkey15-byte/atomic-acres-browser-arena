#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROCESS_ONLY = Object.freeze([
  /^AGENTS\.md$/,
  /^README\.md$/,
  /^docs\//,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^scripts\/release\//,
  /^src\/release-change-impact\.test\.ts$/,
  /^src\/release-pipeline\.test\.ts$/,
]);

const RELEASE_SHELL = Object.freeze([
  /^index\.html$/,
  /^release-channels\.json$/,
  /^public\/(?:favicon|manifest|robots)/,
  /^scripts\/qa\/run-bounded-e2e\.mjs$/,
  /^src\/(?:changelog|release-channel)(?:\.|-)/,
  /^tests\/e2e\/release-channel-chooser\.spec\.ts$/,
]);

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

export function classifyPaths(paths) {
  const normalized = [...new Set(paths.map((path) => path.trim().replaceAll('\\', '/')).filter(Boolean))];
  if (normalized.length === 0) {
    return { mode: 'full', reason: 'empty-or-unresolvable-diff' };
  }
  if (normalized.every((path) => matchesAny(path, PROCESS_ONLY))) {
    return { mode: 'none', reason: 'process-only' };
  }
  if (normalized.every((path) => matchesAny(path, PROCESS_ONLY) || matchesAny(path, RELEASE_SHELL))) {
    return { mode: 'smoke', reason: 'release-shell-only' };
  }
  return { mode: 'full', reason: 'runtime-or-unclassified' };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    values[token.slice(2)] = value;
    index += 1;
  }
  return values;
}

function changedPaths(base, head) {
  if (!base || /^0+$/.test(base)) return [];
  const baseSha = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { encoding: 'utf8' }).trim();
  const diffArgs = head === 'WORKTREE'
    ? ['diff', '--name-only', '--diff-filter=ACDMRTUXB', baseSha]
    : ['diff', '--name-only', '--diff-filter=ACDMRTUXB', baseSha, execFileSync(
      'git', ['rev-parse', '--verify', `${head}^{commit}`], { encoding: 'utf8' },
    ).trim()];
  const paths = execFileSync('git', diffArgs, {
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  if (head === 'WORKTREE') {
    paths.push(...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    }).split(/\r?\n/).filter(Boolean));
  }
  return paths;
}

function outputsFor(classification) {
  if (classification.mode === 'none') {
    return { ...classification, windows_groups: '', linux_groups: '' };
  }
  if (classification.mode === 'smoke') {
    return { ...classification, windows_groups: 'release-shell', linux_groups: 'release-shell' };
  }
  return {
    ...classification,
    windows_groups: 'pass25a-capability-chromium,boot-and-authored',
    linux_groups: 'pass25a-baseline,pass25a-capability-chromium',
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const values = parseArgs(process.argv.slice(2));
  const paths = changedPaths(values.base, values.head);
  const output = outputsFor(classifyPaths(paths));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(JSON.stringify({ ...output, paths }, null, 2));
}
