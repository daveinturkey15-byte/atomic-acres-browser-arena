#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

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

if (mode !== 'doctor') {
  run('git', ['-C', repo, 'fetch', 'origin', 'main', '--prune']);
  receipt.originMainSha = git(repo, 'rev-parse', 'origin/main');
  receipt.containsOriginMain = run(
    'git',
    ['-C', repo, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
    { allowFailure: true },
  ).status === 0;
  if (!receipt.clean) throw new Error(`Refusing ${mode}: worktree has ${dirty.length} changed path(s)`);
}

if (mode === 'contribute') {
  const machine = slug(values.machine, 'machine');
  const harness = slug(values.harness, 'harness');
  const prefix = `contrib/${machine}/${harness}/`;
  if (!branch.startsWith(prefix) || branch.length === prefix.length) {
    throw new Error(`Contribution branch must match ${prefix}<short-outcome>; current branch is ${branch}`);
  }
  if (!receipt.containsOriginMain) {
    throw new Error('Contribution does not contain current origin/main; reconcile and rerun checks');
  }
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
