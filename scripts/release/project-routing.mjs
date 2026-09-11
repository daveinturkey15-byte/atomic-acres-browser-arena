#!/usr/bin/env node

// Project routing: one stable project identity, one machine-local registry.
//
// 2026-09-11. The pipeline guard checked branch shape, cleanliness and ancestry
// but never WHICH tree an agent stood in. Two Git databases, 710 worktree
// paths and a pass-numbered global starting pointer meant a launcher could
// open an old checkout, pass every existing check, and work on the wrong
// candidate. This module binds a launch to: the committed project ID
// (.github/project-identity.json) and a gitignored machine record that
// separates the Git common directory, each bounded worktree/branch lane with
// its base, dispatch head, owner and allowed scope, the integration
// destination, the inspected preview, production and rollback.
//
// Everything here is read-only against the repository. `init` writes the
// machine record once and refuses to overwrite; nothing deletes a tree, moves
// a ref, or marks an artifact accepted. See docs/PROJECT_ROUTING.md.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REGISTRY_SCHEMA_VERSION = 1;
export const IDENTITY_RELATIVE_PATH = '.github/project-identity.json';
export const EXAMPLE_RELATIVE_PATH = 'docs/PROJECT_ROUTING.example.json';
export const REGISTRY_ENV = 'ATOMIC_ACRES_ROUTING_REGISTRY';
export const REQUIRED_ENV = 'ATOMIC_ACRES_ROUTING_REQUIRED';

const SHA40 = /^[0-9a-f]{40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const LANE_STATUSES = new Set(['open', 'closed']);
const CLOSURE_OUTCOMES = new Set(['integrated', 'rejected']);
const ENFORCEMENT = new Set(['warn', 'refuse']);

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ------------------------------------------------------------------ paths

/** Case-folded (win32), forward-slash, no trailing slash, absolute. */
export function normalizePath(value, base = process.cwd()) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const absolute = isAbsolute(value) ? resolve(value) : resolve(base, value);
  let normalized = absolute.replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

export function samePath(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return a !== null && b !== null && a === b;
}

/** Registry location: env override, else a machine-local directory outside every worktree. */
export function resolveRegistryPath(env = process.env) {
  if (env[REGISTRY_ENV]) return resolve(env[REGISTRY_ENV]);
  const base = process.platform === 'win32'
    ? (env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'))
    : (env.XDG_CONFIG_HOME || join(homedir(), '.config'));
  return join(base, 'atomic-acres-browser-arena', 'project-routing.json');
}

// --------------------------------------------------------------- identity

export function readProjectIdentity(repositoryRoot = REPOSITORY_ROOT) {
  const path = join(repositoryRoot, IDENTITY_RELATIVE_PATH);
  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${IDENTITY_RELATIVE_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (document?.schemaVersion !== 1) throw new Error(`${IDENTITY_RELATIVE_PATH} schemaVersion must be 1`);
  if (!SLUG.test(document.projectId ?? '')) throw new Error(`${IDENTITY_RELATIVE_PATH} projectId must be a lowercase slug`);
  if (typeof document.repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(document.repository)) {
    throw new Error(`${IDENTITY_RELATIVE_PATH} repository must be owner/name`);
  }
  if (document.routingRequired !== undefined && typeof document.routingRequired !== 'boolean') throw new Error(`${IDENTITY_RELATIVE_PATH} routingRequired must be boolean`);
  return document;
}

// --------------------------------------------------------------- registry

function expectString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) throw new Error(`${label} is malformed: ${value}`);
  return value;
}

function expectNullableSha(value, label) {
  if (value === null || value === undefined) return null;
  return expectString(value, label, SHA40);
}

function expectAbsolutePath(value, label) {
  expectString(value, label);
  // Accept portable records for Windows and POSIX, but never cwd-relative or
  // drive-relative paths such as '.' or 'C:work'.
  if (!((process.platform !== 'win32' && value.startsWith('/')) || /^[a-zA-Z]:[\\/]/.test(value) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(value))) {
    throw new Error(`${label} must be an absolute path`);
  }
}

function expectNullablePass(value, label) {
  if (value !== null) expectString(value, label, /^PASS [1-9][0-9]*$/);
}

function expectIsoDate(value, label) {
  expectString(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO-8601 timestamp`);
  return value;
}

function validateLane(id, lane) {
  const label = `lanes.${id}`;
  if (!SLUG.test(id)) throw new Error(`${label}: lane id must be a lowercase slug`);
  if (!lane || typeof lane !== 'object') throw new Error(`${label} must be an object`);
  expectAbsolutePath(lane.worktree, `${label}.worktree`);
  expectString(lane.branch, `${label}.branch`, /^contrib\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);
  if (!lane.owner || typeof lane.owner !== 'object') throw new Error(`${label}.owner must be an object`);
  expectString(lane.owner.machine, `${label}.owner.machine`, SLUG);
  expectString(lane.owner.harness, `${label}.owner.harness`, SLUG);
  const [, ownerMachine, ownerHarness] = lane.branch.split('/');
  if (ownerMachine !== lane.owner.machine || ownerHarness !== lane.owner.harness) {
    throw new Error(`${label}.branch ${lane.branch} does not name owner ${lane.owner.machine}/${lane.owner.harness}`);
  }
  expectString(lane.baseSha, `${label}.baseSha`, SHA40);
  expectString(lane.dispatchHeadSha, `${label}.dispatchHeadSha`, SHA40);
  if (!Array.isArray(lane.allowedPaths) || lane.allowedPaths.length === 0
    || lane.allowedPaths.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.startsWith('/'))) {
    throw new Error(`${label}.allowedPaths must be a non-empty array of repository-relative globs`);
  }
  if (!LANE_STATUSES.has(lane.status)) throw new Error(`${label}.status must be open or closed`);
  expectIsoDate(lane.expiresAt, `${label}.expiresAt`);
  if (lane.status === 'open') {
    if (lane.closure !== null && lane.closure !== undefined) throw new Error(`${label}: an open lane cannot carry a closure record`);
    return;
  }
  const closure = lane.closure;
  if (!closure || typeof closure !== 'object') throw new Error(`${label}.closure is required for a closed lane`);
  if (!CLOSURE_OUTCOMES.has(closure.outcome)) throw new Error(`${label}.closure.outcome must be integrated or rejected`);
  expectString(closure.laneHeadSha, `${label}.closure.laneHeadSha`, SHA40);
  expectIsoDate(closure.closedAt, `${label}.closure.closedAt`);
  if (closure.outcome === 'integrated') {
    expectString(closure.integratedIntoSha, `${label}.closure.integratedIntoSha`, SHA40);
  } else {
    expectString(closure.reason, `${label}.closure.reason`);
    const preservation = closure.preservation;
    const hasRef = typeof preservation?.ref === 'string' && preservation.ref.startsWith('refs/');
    const hasBundle = typeof preservation?.bundlePath === 'string' && preservation.bundlePath.length > 0;
    if (hasBundle) expectAbsolutePath(preservation.bundlePath, `${label}.closure.preservation.bundlePath`);
    if (!hasRef && !hasBundle) {
      throw new Error(`${label}.closure.preservation must name a refs/ ref or a bundlePath; a rejected lane is never closed without preservation proof`);
    }
  }
}

/** Throws on the first structural problem; returns the registry otherwise. */
export function validateRegistry(registry, identity = null) {
  if (!registry || typeof registry !== 'object') throw new Error('registry must be a JSON object');
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new Error(`registry schemaVersion must be ${REGISTRY_SCHEMA_VERSION}; received ${String(registry.schemaVersion)}`);
  }
  expectString(registry.projectId, 'registry.projectId', SLUG);
  expectString(registry.repository, 'registry.repository', /^[^/\s]+\/[^/\s]+$/);
  expectString(registry.machine, 'registry.machine', SLUG);
  expectIsoDate(registry.installedAt, 'registry.installedAt');
  if (!registry.enforcement || !ENFORCEMENT.has(registry.enforcement.legacyContribute)) {
    throw new Error('registry.enforcement.legacyContribute must be warn or refuse');
  }
  expectAbsolutePath(registry.gitCommonDir, 'registry.gitCommonDir');
  if (!registry.integration || typeof registry.integration !== 'object') throw new Error('registry.integration must be an object');
  expectString(registry.integration.ref, 'registry.integration.ref', /^refs\//);
  expectString(registry.integration.expectedSha, 'registry.integration.expectedSha', SHA40);
  expectString(registry.integration.destination, 'registry.integration.destination');
  if (!registry.inspectedPreview || typeof registry.inspectedPreview !== 'object') throw new Error('registry.inspectedPreview must be an object');
  expectNullableSha(registry.inspectedPreview.sha, 'registry.inspectedPreview.sha');
  if (registry.inspectedPreview.worktree != null) expectAbsolutePath(registry.inspectedPreview.worktree, 'registry.inspectedPreview.worktree');
  expectString(registry.inspectedPreview.status, 'registry.inspectedPreview.status');
  if (/^(accepted|approved)$/i.test(registry.inspectedPreview.status)) {
    throw new Error('registry.inspectedPreview.status may not assert acceptance; approval lives in the acceptance manifest, not the routing record');
  }
  if (!registry.production || typeof registry.production !== 'object') throw new Error('registry.production must be an object');
  expectNullablePass(registry.production.pass, 'registry.production.pass');
  expectNullableSha(registry.production.sourceSha, 'registry.production.sourceSha');
  expectNullableSha(registry.production.pagesSha, 'registry.production.pagesSha');
  if (!registry.rollback || typeof registry.rollback !== 'object') throw new Error('registry.rollback must be an object');
  expectNullablePass(registry.rollback.pass, 'registry.rollback.pass');
  expectNullableSha(registry.rollback.sourceSha, 'registry.rollback.sourceSha');
  if (!Array.isArray(registry.protectedCheckouts)) throw new Error('registry.protectedCheckouts must be an array');
  registry.protectedCheckouts.forEach((entry, index) => {
    expectAbsolutePath(entry?.path, `registry.protectedCheckouts[${index}].path`);
    expectString(entry?.reason, `registry.protectedCheckouts[${index}].reason`);
  });
  if (!registry.lanes || typeof registry.lanes !== 'object' || Array.isArray(registry.lanes)) throw new Error('registry.lanes must be an object keyed by lane id');
  for (const [id, lane] of Object.entries(registry.lanes)) validateLane(id, lane);
  const seenWorktrees = new Map();
  for (const [id, lane] of Object.entries(registry.lanes)) {
    if (lane.status !== 'open') continue;
    const key = normalizePath(lane.worktree);
    if (seenWorktrees.has(key)) throw new Error(`lanes ${seenWorktrees.get(key)} and ${id} both claim open ownership of ${lane.worktree}; one worktree has one owner`);
    seenWorktrees.set(key, id);
  }
  if (identity) {
    if (registry.projectId !== identity.projectId) throw new Error(`registry projectId ${registry.projectId} does not match ${IDENTITY_RELATIVE_PATH} ${identity.projectId}`);
    if (registry.repository !== identity.repository) throw new Error(`registry repository ${registry.repository} does not match ${IDENTITY_RELATIVE_PATH} ${identity.repository}`);
  }
  return registry;
}

export function loadRegistry(path, identity = null) {
  if (!existsSync(path)) {
    throw new Error(`No project routing registry at ${path}. Install one with: node scripts/release/project-routing.mjs init --machine <tag> (see docs/PROJECT_ROUTING.md)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse routing registry ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateRegistry(parsed, identity);
}

/** A damaged or explicitly configured missing registry never enables legacy work. */
export function legacyRoutingPolicy(identity, { path = resolveRegistryPath(), env = process.env } = {}) {
  const requiredByConfig = identity.routingRequired === true || env[REQUIRED_ENV] === '1' || Boolean(env[REGISTRY_ENV]);
  if (!existsSync(path)) {
    return { required: requiredByConfig, registryPresent: false, registryError: `No project routing registry at ${path}` };
  }
  // Intentionally propagate parsing/schema/identity errors rather than falling
  // through to a weaker legacy path.
  const registry = loadRegistry(path, identity);
  return { required: requiredByConfig || registry.enforcement.legacyContribute === 'refuse', registryPresent: true, registryError: null };
}

// --------------------------------------------------------------- globbing

/** `**` spans directories, `*` stays inside one segment; anchored to the repo root. */
export function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        pattern += glob[index + 2] === '/' ? '(?:.*/)?' : '.*';
        index += glob[index + 2] === '/' ? 2 : 1;
      } else pattern += '[^/]*';
    } else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

export function pathsOutsideScope(paths, allowedPaths) {
  const matchers = allowedPaths.map(globToRegExp);
  return paths.filter((path) => !matchers.some((matcher) => matcher.test(path))).sort();
}

// -------------------------------------------------------------- git probe

/** Minimal git access for one repository; injectable so tests run on synthetic repos. */
export function createGitProbe(repositoryPath) {
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', repositoryPath, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
  const tryGit = (...args) => {
    try {
      return { ok: true, stdout: git(...args) };
    } catch (error) {
      return { ok: false, stdout: '', error };
    }
  };
  return {
    git,
    isAncestor: (ancestor, descendant) => tryGit('merge-base', '--is-ancestor', ancestor, descendant).ok,
    commitExists: (sha) => tryGit('cat-file', '-e', `${sha}^{commit}`).ok,
    resolveRef: (ref) => {
      const result = tryGit('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
      return result.ok ? result.stdout : null;
    },
    changedPaths: (base, head) => git('diff', '--name-only', '--no-renames', base, head).split(/\r?\n/).filter(Boolean),
    bundleHeads: (bundlePath) => {
      if (!tryGit('bundle', 'verify', bundlePath).ok) return null;
      const result = tryGit('bundle', 'list-heads', bundlePath);
      if (!result.ok) return null;
      const heads = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/)[0]);
      // bundle verify/list-heads can accept a header with a missing pack. A
      // preservation bundle must restore independently, including its objects.
      const scratch = mkdtempSync(join(tmpdir(), 'aa-bundle-verify-'));
      const restored = join(scratch, 'restored.git');
      try {
        execFileSync('git', ['clone', '--bare', '--quiet', '--', bundlePath, restored], { windowsHide: true, stdio: 'pipe' });
        execFileSync('git', ['--no-replace-objects', '-C', restored, 'fsck', '--full', '--strict'], { windowsHide: true, stdio: 'pipe' });
        for (const head of heads) execFileSync('git', ['--no-replace-objects', '-C', restored, 'cat-file', '-e', `${head}^{commit}`], { windowsHide: true, stdio: 'pipe' });
        return heads;
      } catch {
        return null;
      } finally {
        if (resolve(dirname(scratch)) !== resolve(tmpdir())) throw new Error('Unexpected bundle verification scratch location');
        rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
      }
    },
  };
}

/** What the guard can see about the tree it was launched in. */
export function observeWorktree(cwd = process.cwd()) {
  const probe = createGitProbe(cwd);
  const toplevel = probe.git('rev-parse', '--show-toplevel');
  const commonDirRaw = probe.git('rev-parse', '--git-common-dir');
  const gitCommonDir = isAbsolute(commonDirRaw) ? commonDirRaw : resolve(toplevel, commonDirRaw);
  return {
    toplevel,
    gitCommonDir,
    isMainWorktree: commonDirRaw === '.git',
    branch: probe.git('branch', '--show-current') || 'DETACHED',
    headSha: probe.git('rev-parse', 'HEAD'),
    dirtyPaths: probe.git('status', '--porcelain=v1').split(/\r?\n/).filter(Boolean),
    ignoredPathCount: probe.git('status', '--porcelain=v1', '--ignored=matching').split(/\r?\n/).filter((line) => line.startsWith('!!')).length,
  };
}

// ------------------------------------------------------------- evaluation

function refusal(code, message) {
  const error = new Error(`Refusing route: ${message}`);
  error.code = code;
  return error;
}

/**
 * Fail-closed route check for a launch. Every refusal names the mismatch so the
 * launcher can repair its record instead of guessing. Never mutates anything.
 *
 * observed: from observeWorktree(); probe: createGitProbe(observed.toplevel);
 * originMainSha: freshly fetched integration tip (the caller fetches).
 */
export function evaluateLaneRoute({ registry, identity, projectId, laneId, machine, harness, observed, probe, originMainSha, now = new Date() }) {
  if (projectId !== identity.projectId) throw refusal('wrong-project', `--project ${projectId} is not this repository's project id ${identity.projectId}`);
  if (registry.projectId !== projectId) throw refusal('wrong-project', `registry belongs to project ${registry.projectId}, not ${projectId}`);
  validateRegistry(registry, identity);
  if (registry.machine !== machine) throw refusal('wrong-machine', `registry belongs to ${registry.machine}, not ${machine}`);

  const protectedHit = registry.protectedCheckouts.find((entry) => samePath(entry.path, observed.toplevel));
  if (protectedHit) throw refusal('protected-checkout', `${observed.toplevel} is a protected checkout (${protectedHit.reason}); it is never a contribution worktree`);

  if (!samePath(registry.gitCommonDir, observed.gitCommonDir)) {
    throw refusal('wrong-git-database', `this tree belongs to Git database ${observed.gitCommonDir}; the registry routes ${registry.gitCommonDir}`);
  }

  const lane = registry.lanes[laneId];
  if (!lane) throw refusal('unknown-lane', `lane ${laneId} is not registered; known lanes: ${Object.keys(registry.lanes).join(', ') || 'none'}`);
  if (lane.status !== 'open') throw refusal('closed-lane', `lane ${laneId} is ${lane.status} (${lane.closure?.outcome ?? 'no outcome'}); open a new lane from current origin/main`);
  if (Date.parse(lane.expiresAt) <= now.getTime()) throw refusal('expired-lane', `lane ${laneId} expired at ${lane.expiresAt}; renew it explicitly or close it`);
  if (lane.owner.machine !== machine || lane.owner.harness !== harness) {
    throw refusal('wrong-owner', `lane ${laneId} is owned by ${lane.owner.machine}/${lane.owner.harness}, not ${machine}/${harness}`);
  }
  if (!samePath(lane.worktree, observed.toplevel)) {
    throw refusal('wrong-worktree', `lane ${laneId} is bound to ${lane.worktree}; you are in ${observed.toplevel}`);
  }
  if (observed.branch !== lane.branch) throw refusal('wrong-branch', `lane ${laneId} is bound to branch ${lane.branch}; current branch is ${observed.branch}`);
  if (observed.dirtyPaths.length > 0) throw refusal('dirty-worktree', `${observed.dirtyPaths.length} uncommitted path(s); commit or record them before routing`);

  if (!probe.commitExists(lane.baseSha)) throw refusal('stale-base', `lane base ${lane.baseSha} is not in this Git database`);
  if (!probe.isAncestor(lane.baseSha, observed.headSha)) {
    throw refusal('stale-base', `HEAD ${observed.headSha} does not descend from lane base ${lane.baseSha}`);
  }
  if (!probe.isAncestor(lane.dispatchHeadSha, observed.headSha)) {
    throw refusal('stale-head', `HEAD ${observed.headSha} is behind the lane's dispatch head ${lane.dispatchHeadSha}; this checkout is stale or foreign`);
  }
  if (typeof originMainSha === 'string') {
    if (originMainSha !== registry.integration.expectedSha) {
      throw refusal('stale-integration-record', `registry expects ${registry.integration.ref} at ${registry.integration.expectedSha} but it is ${originMainSha}; the machine record is stale, re-run init readback after integration`);
    }
  }
  const outside = pathsOutsideScope(probe.changedPaths(lane.baseSha, observed.headSha), lane.allowedPaths);
  if (outside.length > 0) {
    throw refusal('outside-scope', `${outside.length} changed path(s) fall outside lane ${laneId}'s allowed scope: ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? ', …' : ''}`);
  }
  return {
    mode: 'routed',
    projectId,
    laneId,
    registryMachine: registry.machine,
    gitCommonDir: observed.gitCommonDir,
    worktree: observed.toplevel,
    branch: observed.branch,
    baseSha: lane.baseSha,
    dispatchHeadSha: lane.dispatchHeadSha,
    integration: { ref: registry.integration.ref, sha: registry.integration.expectedSha, destination: registry.integration.destination },
    inspectedPreview: { sha: registry.inspectedPreview.sha, status: registry.inspectedPreview.status },
    production: { pass: registry.production.pass, sourceSha: registry.production.sourceSha, pagesSha: registry.production.pagesSha },
    rollback: { pass: registry.rollback.pass, sourceSha: registry.rollback.sourceSha },
    expiresAt: lane.expiresAt,
  };
}

/**
 * Closure verification. A lane closes only as `integrated` (lane head reached
 * the integration line) or `rejected` (unique work provably preserved). The
 * guard verifies the record it is given; it does not write the record, does
 * not remove the worktree, and does not touch any ref.
 */
export function evaluateLaneClosure({ registry, identity, projectId, laneId, observed, probe, originMainSha }) {
  if (projectId !== identity.projectId || registry.projectId !== projectId) throw refusal('wrong-project', `project id mismatch (${projectId})`);
  validateRegistry(registry, identity);
  const lane = registry.lanes[laneId];
  if (!lane) throw refusal('unknown-lane', `lane ${laneId} is not registered`);
  if (lane.status !== 'closed' || !lane.closure) throw refusal('lane-not-closed', `lane ${laneId} has no closure record; closure is an explicit integrated/rejected decision, never inferred`);
  if (!samePath(registry.gitCommonDir, observed.gitCommonDir)) throw refusal('wrong-git-database', `this tree belongs to ${observed.gitCommonDir}, not ${registry.gitCommonDir}`);
  if (!samePath(lane.worktree, observed.toplevel)) throw refusal('wrong-worktree', `lane ${laneId} is bound to ${lane.worktree}; you are in ${observed.toplevel}`);
  if (observed.branch !== lane.branch) throw refusal('wrong-branch', `lane ${laneId} is bound to ${lane.branch}; current branch is ${observed.branch}`);
  if (observed.dirtyPaths.length > 0) {
    throw refusal('dirty-worktree', `${observed.dirtyPaths.length} uncommitted path(s) are the only copy of their content; a dirty lane is never closable (DS-3)`);
  }
  const { closure } = lane;
  if (observed.headSha !== closure.laneHeadSha) {
    throw refusal('head-mismatch', `worktree HEAD ${observed.headSha} differs from recorded laneHeadSha ${closure.laneHeadSha}; record the real head`);
  }
  const proof = { outcome: closure.outcome };
  if (closure.outcome === 'integrated') {
    if (!probe.commitExists(closure.integratedIntoSha)) throw refusal('integration-missing', `integratedIntoSha ${closure.integratedIntoSha} is not in this Git database`);
    if (!probe.isAncestor(closure.laneHeadSha, closure.integratedIntoSha)) {
      throw refusal('not-integrated', `lane head ${closure.laneHeadSha} is not an ancestor of ${closure.integratedIntoSha}; the work has not been integrated`);
    }
    const integrationTip = typeof originMainSha === 'string' ? originMainSha : probe.resolveRef(registry.integration.ref);
    if (!integrationTip || !probe.isAncestor(closure.integratedIntoSha, integrationTip)) {
      throw refusal('not-on-integration-line', `${closure.integratedIntoSha} is not reachable from ${registry.integration.ref} (${integrationTip ?? 'unresolved'}); integrated means on the integration line, not merely committed somewhere`);
    }
    proof.integratedIntoSha = closure.integratedIntoSha;
    proof.integrationTip = integrationTip;
  } else {
    const preservation = closure.preservation ?? {};
    const evidence = [];
    if (typeof preservation.ref === 'string') {
      const resolved = probe.resolveRef(preservation.ref);
      if (resolved !== closure.laneHeadSha) throw refusal('preservation-unverified', `preservation ref ${preservation.ref} resolves to ${resolved ?? 'nothing'}, not lane head ${closure.laneHeadSha}`);
      evidence.push({ kind: 'ref', ref: preservation.ref, sha: resolved });
    }
    if (typeof preservation.bundlePath === 'string') {
      if (!existsSync(preservation.bundlePath)) throw refusal('preservation-unverified', `preservation bundle ${preservation.bundlePath} does not exist`);
      const heads = probe.bundleHeads(preservation.bundlePath);
      if (!heads || !heads.includes(closure.laneHeadSha)) throw refusal('preservation-unverified', `bundle ${preservation.bundlePath} does not list lane head ${closure.laneHeadSha}`);
      evidence.push({ kind: 'bundle', path: preservation.bundlePath, sha: closure.laneHeadSha });
    }
    if (evidence.length === 0) throw refusal('preservation-unverified', 'a rejected lane needs at least one verified preservation proof');
    proof.reason = closure.reason;
    proof.preservation = evidence;
  }
  return {
    laneId,
    worktree: observed.toplevel,
    laneHeadSha: closure.laneHeadSha,
    closedAt: closure.closedAt,
    proof,
    retainedIgnoredPathCount: observed.ignoredPathCount,
    retirement: 'not performed: the guard removes nothing. Retire manually only after this receipt exists, only if the worktree is not the main working tree, and only after preserving the ignored evidence counted above (docs/MULTI_AGENT_REPO_DISCIPLINE.md §1).',
  };
}

// -------------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) values[token.slice(2)] = true;
    else {
      values[token.slice(2)] = next;
      index += 1;
    }
  }
  return { command, values };
}

/** `init`: write a machine record from the example plus what this tree observes. Never overwrites. */
function initRegistry(values) {
  const path = resolveRegistryPath();
  if (existsSync(path)) throw new Error(`Refusing init: ${path} already exists. Edit it deliberately or point ${REGISTRY_ENV} elsewhere; init never overwrites a machine record.`);
  if (!SLUG.test(values.machine ?? '')) throw new Error('init requires --machine <lowercase-slug>');
  const identity = readProjectIdentity();
  const observed = observeWorktree(REPOSITORY_ROOT);
  const probe = createGitProbe(REPOSITORY_ROOT);
  const originMain = probe.resolveRef('refs/remotes/origin/main');
  if (!originMain) throw new Error('init requires refs/remotes/origin/main to be present; fetch origin first');
  const example = JSON.parse(readFileSync(join(REPOSITORY_ROOT, EXAMPLE_RELATIVE_PATH), 'utf8'));
  const registry = {
    ...example,
    projectId: identity.projectId,
    repository: identity.repository,
    machine: values.machine,
    installedAt: new Date().toISOString(),
    installedBy: `project-routing.mjs init from ${observed.toplevel}`,
    enforcement: { legacyContribute: values.enforce === 'refuse' ? 'refuse' : 'warn' },
    gitCommonDir: observed.gitCommonDir.replace(/\\/g, '/'),
    integration: { ...example.integration, expectedSha: originMain },
    inspectedPreview: { sha: null, worktree: null, branch: null, status: 'not-recorded' },
    production: { pass: null, sourceSha: null, pagesSha: null, verification: 'not-recorded' },
    rollback: { pass: null, sourceSha: null, verification: 'not-recorded' },
    lanes: {},
  };
  delete registry.enforcement._comment;
  validateRegistry(registry, identity);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return { ok: true, registryPath: path, gitCommonDir: registry.gitCommonDir, integrationSha: originMain, enforcement: registry.enforcement.legacyContribute, lanes: 0, next: 'Add lanes by editing the record (see docs/PROJECT_ROUTING.md), then `show` to read it back.' };
}

/** `show`: readback. Reports validity and staleness without fetching or mutating. */
function showRegistry() {
  const path = resolveRegistryPath();
  const identity = readProjectIdentity();
  const registry = loadRegistry(path, identity);
  const probe = createGitProbe(REPOSITORY_ROOT);
  const localOriginMain = probe.resolveRef(registry.integration.ref);
  const now = Date.now();
  return {
    ok: true,
    registryPath: path,
    projectId: registry.projectId,
    machine: registry.machine,
    installedAt: registry.installedAt,
    enforcement: registry.enforcement.legacyContribute,
    routingRequiredByEnv: process.env[REQUIRED_ENV] === '1',
    gitCommonDir: registry.gitCommonDir,
    integration: { ...registry.integration, localRefSha: localOriginMain, matchesLocalRef: localOriginMain === registry.integration.expectedSha, note: 'compared against the LOCAL remote-tracking ref without fetching; run the guard for a fetched comparison' },
    inspectedPreview: registry.inspectedPreview,
    production: registry.production,
    rollback: registry.rollback,
    protectedCheckouts: registry.protectedCheckouts.map((entry) => entry.path),
    lanes: Object.fromEntries(Object.entries(registry.lanes).map(([id, lane]) => [id, {
      worktree: lane.worktree, branch: lane.branch, owner: `${lane.owner.machine}/${lane.owner.harness}`,
      status: lane.status, expired: Date.parse(lane.expiresAt) <= now, expiresAt: lane.expiresAt,
      worktreeExists: existsSync(lane.worktree), closure: lane.closure?.outcome ?? null,
    }])),
  };
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  const { command, values } = parseArgs(process.argv.slice(2));
  const commands = { init: () => initRegistry(values), show: showRegistry };
  if (!commands[command]) {
    console.error('Usage: project-routing.mjs <init --machine <tag> [--enforce warn|refuse] | show>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(commands[command](), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
