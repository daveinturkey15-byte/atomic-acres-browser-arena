#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ANCESTRY_ROOTS_RELATIVE_PATH = '.github/ancestry-roots.json';
const SHA40 = /^[0-9a-f]{40}$/;

const REQUIRED_CHECKS = Object.freeze([
  'requirements-acceptance',
  'static-and-unit (ubuntu-latest)',
  'static-and-unit (windows-latest)',
  'bounded-browser-linux',
  'bounded-browser-windows',
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${stderr || stdout}`);
  }
  return { status: result.status, stdout, stderr };
}

function parseArgs(argv) {
  const [mode = 'doctor', ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) values[key] = true;
    else {
      values[key] = next;
      index += 1;
    }
  }
  return { mode, values };
}

function slug(value, label) {
  if (!value || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} must be a lowercase ASCII slug (letters, digits, hyphens)`);
  }
  return value;
}

function git(repo, ...args) {
  return run('git', ['-C', repo, ...args]).stdout;
}

function repositoryName(remote) {
  const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (!match) throw new Error(`origin is not a recognizable GitHub repository: ${remote}`);
  return match[1];
}

function toolVersion(command, args = ['--version']) {
  const result = run(command, args, { allowFailure: true });
  return {
    available: result.status === 0,
    version: (result.stdout || result.stderr).split(/\r?\n/)[0] || null,
  };
}

function npmVersion() {
  if (process.platform !== 'win32') return toolVersion('npm');
  return toolVersion(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm --version']);
}

function checkRuns(repoName, sourceSha) {
  const response = run('gh', ['api', `repos/${repoName}/commits/${sourceSha}/check-runs`]);
  const payload = JSON.parse(response.stdout);
  const latest = new Map();
  for (const check of payload.check_runs ?? []) latest.set(check.name, check.conclusion);
  return REQUIRED_CHECKS.map((name) => ({ name, conclusion: latest.get(name) ?? 'missing' }));
}

// HF-536 (2026-09-06). Seven parentless full-tree snapshot imports on
// 2026-09-03..05 severed the shipping line from origin/main. Nothing executable
// refused them, so the break went unnoticed for 21 passes and produced 385
// phantom merge conflicts against a tree that was already a strict superset of
// main. These two assertions are that refusal. See
// docs/RELEASE_LINE_RECONCILIATION_2026-09-06.md.
function ancestryRoots(repo) {
  const path = join(repo, '.github', 'ancestry-roots.json');
  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${ANCESTRY_ROOTS_RELATIVE_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (document?.schemaVersion !== 1) throw new Error(`${ANCESTRY_ROOTS_RELATIVE_PATH} schemaVersion must be 1`);
  const collect = (key) => {
    if (!Array.isArray(document[key])) throw new Error(`${ANCESTRY_ROOTS_RELATIVE_PATH} ${key} must be an array`);
    return document[key].map((entry, index) => {
      if (!SHA40.test(entry?.sha ?? '')) {
        throw new Error(`${ANCESTRY_ROOTS_RELATIVE_PATH} ${key}[${index}].sha must be a full 40-character SHA`);
      }
      return entry.sha;
    });
  };
  const legitimate = collect('legitimate');
  const quarantined = collect('quarantined');
  if (legitimate.length === 0) throw new Error(`${ANCESTRY_ROOTS_RELATIVE_PATH} must list at least one legitimate root`);
  return { legitimate, quarantined, allowed: new Set([...legitimate, ...quarantined]) };
}

function writeReceipt(repo, kind, receipt) {
  const compactTime = receipt.timestamp.replace(/[-:.]/g, '');
  const path = join(repo, 'artifacts', 'pipeline', `${compactTime}-${kind}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return path;
}

const { mode, values } = parseArgs(process.argv.slice(2));
if (!['doctor', 'contribute', 'release'].includes(mode)) {
  throw new Error('Usage: pipeline-guard.mjs <doctor|contribute|release> [options]');
}

const repo = run('git', ['rev-parse', '--show-toplevel']).stdout;
const remote = git(repo, 'remote', 'get-url', 'origin');
const repoName = repositoryName(remote);
const timestamp = new Date().toISOString();
const branch = git(repo, 'branch', '--show-current') || 'DETACHED';
const headSha = git(repo, 'rev-parse', 'HEAD');
const dirty = git(repo, 'status', '--porcelain=v1').split(/\r?\n/).filter(Boolean);
const ghStatus = run('gh', ['auth', 'status'], { allowFailure: true });
const authText = `${ghStatus.stdout}\n${ghStatus.stderr}`;

const receipt = {
  schemaVersion: 1,
  kind: mode,
  timestamp,
  repository: repoName,
  branch,
  headSha,
  clean: dirty.length === 0,
  dirtyPathCount: dirty.length,
  tools: {
    git: toolVersion('git'),
    node: toolVersion(process.execPath),
    npm: npmVersion(),
    gh: toolVersion('gh'),
  },
  githubAuth: {
    authenticated: ghStatus.status === 0,
    repoScope: /(?:^|[,\s'])repo(?:[,\s']|$)/.test(authText),
    workflowScope: /(?:^|[,\s'])workflow(?:[,\s']|$)/.test(authText),
  },
};

const headRoots = git(repo, 'rev-list', '--max-parents=0', 'HEAD').split(/\r?\n/).filter(Boolean);
receipt.rootCommitCount = headRoots.length;

if (mode !== 'doctor') {
  run('git', ['-C', repo, 'fetch', 'origin', 'main', '--prune']);
  receipt.originMainSha = git(repo, 'rev-parse', 'origin/main');
  receipt.containsOriginMain = run(
    'git',
    ['-C', repo, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
    { allowFailure: true },
  ).status === 0;
  if (!receipt.clean) throw new Error(`Refusing ${mode}: worktree has ${dirty.length} changed path(s)`);

  // Was recorded but never enforced, and enforced only in `contribute`. A line
  // that does not contain origin/main must not reach ANY non-doctor mode:
  // publishing from one is how 21 passes shipped without main ever moving.
  if (!receipt.containsOriginMain) {
    throw new Error(`Refusing ${mode}: HEAD ${headSha} does not contain current origin/main ${receipt.originMainSha}; reconcile through a pull request into main and rerun checks`);
  }

  const roots = ancestryRoots(repo);
  const unlisted = headRoots.filter((root) => !roots.allowed.has(root)).sort();
  receipt.ancestryRoots = {
    allowlist: ANCESTRY_ROOTS_RELATIVE_PATH,
    legitimate: roots.legitimate.length,
    quarantined: headRoots.filter((root) => roots.quarantined.includes(root)).sort(),
    unlisted,
  };
  if (unlisted.length > 0) {
    throw new Error(`Refusing ${mode}: HEAD reaches ${unlisted.length} root commit(s) absent from ${ANCESTRY_ROOTS_RELATIVE_PATH} (${unlisted.join(', ')}). A parentless full-tree snapshot import (git checkout --orphan, or git init plus a copy) severs ancestry and is banned; do not add the root to the allowlist to clear this failure without an explicit reviewed decision`);
  }
  if (receipt.ancestryRoots.quarantined.length > 0) {
    console.error(`WARNING: HEAD reaches ${receipt.ancestryRoots.quarantined.length} quarantined snapshot-import root(s) recorded in ${ANCESTRY_ROOTS_RELATIVE_PATH}. This is known incident debt from 2026-09-03..05, not a new break.`);
  }
}

if (mode === 'contribute') {
  const machine = slug(values.machine, 'machine');
  const harness = slug(values.harness, 'harness');
  const prefix = `contrib/${machine}/${harness}/`;
  if (!branch.startsWith(prefix) || branch.length === prefix.length) {
    throw new Error(`Contribution branch must match ${prefix}<short-outcome>; current branch is ${branch}`);
  }
  // containsOriginMain is now enforced above for every non-doctor mode.
  receipt.machine = machine;
  receipt.harness = harness;
}

if (mode === 'release') {
  const sourceSha = values['source-sha'];
  const releasePass = values.pass;
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) {
    throw new Error('--source-sha must be a full 40-character Git SHA');
  }
  if (!/^PASS [1-9][0-9]*$/.test(releasePass ?? '')) {
    throw new Error('--pass must look like "PASS 58"');
  }
  if (branch !== 'main') throw new Error(`Release must run from branch main; current branch is ${branch}`);
  if (sourceSha !== headSha || sourceSha !== receipt.originMainSha) {
    throw new Error(`Release SHA must equal clean local and origin main (${headSha} / ${receipt.originMainSha})`);
  }
  receipt.releasePass = releasePass;
  receipt.requiredChecks = checkRuns(repoName, sourceSha);
  const failures = receipt.requiredChecks.filter((check) => check.conclusion !== 'success');
  if (failures.length) {
    throw new Error(`Required checks are not green: ${failures.map((check) => `${check.name}=${check.conclusion}`).join(', ')}`);
  }
}

const receiptPath = writeReceipt(repo, mode, receipt);
console.log(JSON.stringify({ ok: true, receiptPath, ...receipt }, null, 2));
