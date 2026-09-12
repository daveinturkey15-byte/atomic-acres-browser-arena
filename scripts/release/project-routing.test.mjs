// Project routing negative tests (2026-09-11).
//
// Each test reproduces a mistake that actually happened on dave-gaming-pc and
// asserts the route is REFUSED with the named reason: a worker in the wrong
// worktree (the Pass 62 benchmark checkout incident), a launcher opening a
// stale checkout whose HEAD is behind the dispatched candidate (the aa-omp-pass84
// global pointer), a tree from the other Git database, an expired or closed
// lane, and a closure claimed without integration or preservation proof.
// Synthetic repositories are built with real git so ancestry and worktree
// semantics are genuine, not mocked.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  createGitProbe,
  evaluateLaneClosure,
  evaluateLaneRoute,
  globToRegExp,
  legacyRoutingPolicy,
  observeWorktree,
  pathsOutsideScope,
  validateRegistry,
} from './project-routing.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const IDENTITY = JSON.parse(readFileSync(join(REPOSITORY_ROOT, '.github', 'project-identity.json'), 'utf8'));
const EXAMPLE = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'docs', 'PROJECT_ROUTING.example.json'), 'utf8'));
const PROJECT = IDENTITY.projectId;
const FUTURE = '2999-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true }).trim();

test('native resolver refuses missing identity, unknown lane and wrong launch directory before dispatch', () => {
  const project = makeProject();
  try {
    const registryPath = join(project.root, 'routing.json');
    writeFileSync(registryPath, JSON.stringify(project.registry));
    const common = ['resolve', '--project', PROJECT, '--machine', 'dave-gaming-pc', '--harness', 'claude'];
    const cases = [
      [common, /resolve requires --lane/],
      [[...common, '--lane', 'unregistered'], /lane unregistered is not registered/],
      [[...common, '--lane', 'fix', '--worktree', '.'], /must be an absolute path/],
      [[...common, '--lane', 'fix', '--worktree', project.main], /requested launch directory differs/],
    ];
    for (const [args, reason] of cases) {
      const result = spawnSync(process.execPath, [join(REPOSITORY_ROOT, 'scripts/release/project-routing.mjs'), ...args], {
        cwd: project.root, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, ATOMIC_ACRES_ROUTING_REGISTRY: registryPath },
      });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, reason);
    }
    assert.equal(git(project.laneTree, 'rev-parse', 'HEAD'), project.base);
    assert.equal(git(project.laneTree, 'status', '--porcelain'), '');
  } finally {
    project.cleanup();
  }
});

function commit(repo, relative, content, message) {
  mkdirSync(join(repo, relative, '..'), { recursive: true });
  writeFileSync(join(repo, relative), content);
  git(repo, 'add', '--', relative);
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

/**
 * One synthetic project: main repo on `main` with two commits, a linked
 * worktree on a contrib branch cut from main, and the origin/main
 * remote-tracking ref pointing at main's tip.
 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'aa-routing-'));
  const main = join(root, 'main');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.email', 'routing-test@example.invalid');
  git(main, 'config', 'user.name', 'routing test');
  git(main, 'config', 'core.autocrlf', 'false');
  const first = commit(main, 'README.md', 'one\n', 'first');
  const base = commit(main, 'docs/a.md', 'a\n', 'second');
  git(main, 'update-ref', 'refs/remotes/origin/main', base);
  const laneTree = join(root, 'lane');
  git(main, 'worktree', 'add', '-q', '-b', 'contrib/dave-gaming-pc/claude/fix', laneTree, 'main');
  const registry = {
    ...structuredClone(EXAMPLE),
    machine: 'dave-gaming-pc',
    installedAt: '2026-09-11T00:00:00.000Z',
    enforcement: { legacyContribute: 'warn' },
    gitCommonDir: join(main, '.git'),
    integration: { ref: 'refs/remotes/origin/main', expectedSha: base, destination: 'pull request into main' },
    protectedCheckouts: [],
    lanes: {
      fix: {
        worktree: laneTree,
        branch: 'contrib/dave-gaming-pc/claude/fix',
        owner: { machine: 'dave-gaming-pc', harness: 'claude' },
        baseSha: base,
        dispatchHeadSha: base,
        allowedPaths: ['docs/**'],
        status: 'open',
        expiresAt: FUTURE,
        closure: null,
      },
    },
  };
  validateRegistry(registry, IDENTITY);
  const route = (overrides = {}) => {
    const cwd = overrides.cwd ?? laneTree;
    const reg = overrides.registry ?? registry;
    return evaluateLaneRoute({
      registry: reg, identity: IDENTITY, projectId: overrides.projectId ?? PROJECT, laneId: overrides.laneId ?? 'fix',
      machine: overrides.machine ?? 'dave-gaming-pc', harness: overrides.harness ?? 'claude',
      observed: observeWorktree(cwd), probe: createGitProbe(cwd),
      originMainSha: overrides.originMainSha ?? base, now: overrides.now,
    });
  };
  const refuses = (code, overrides) => assert.throws(() => route(overrides), (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    assert.match(error.message, /^Refusing route: /);
    return true;
  });
  const cleanup = () => rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  return { root, main, laneTree, first, base, registry, route, refuses, cleanup };
}

// ------------------------------------------------------------------ green

test('a correctly routed lane resolves and reports every separated destination', () => {
  const project = makeProject();
  try {
    const result = project.route();
    assert.equal(result.mode, 'routed');
    assert.equal(result.laneId, 'fix');
    assert.equal(result.baseSha, project.base);
    assert.equal(result.integration.sha, project.base);
    assert.equal(result.inspectedPreview.status, EXAMPLE.inspectedPreview.status);
    assert.equal(result.production.pass, EXAMPLE.production.pass);
    assert.equal(result.rollback.pass, EXAMPLE.rollback.pass);
    // Work inside the allowed scope is still routed.
    commit(project.laneTree, 'docs/b.md', 'b\n', 'in scope');
    assert.equal(project.route().mode, 'routed');
  } finally {
    project.cleanup();
  }
});

// -------------------------------------------------------------------- red

test('wrong worktree: the same branch name in a different checkout is refused', () => {
  const project = makeProject();
  try {
    // The incident shape: an agent stands in a tree that is not the lane's tree.
    const other = join(project.root, 'other');
    git(project.main, 'worktree', 'add', '-q', '--detach', other, 'main');
    git(other, 'checkout', '-q', '-b', 'contrib/dave-gaming-pc/claude/fix-copy');
    project.refuses('wrong-worktree', {
      cwd: other,
      registry: { ...project.registry, lanes: { fix: { ...project.registry.lanes.fix, branch: 'contrib/dave-gaming-pc/claude/fix-copy' } } },
    });
    // The MAIN working tree is never a lane worktree either.
    project.refuses('wrong-worktree', { cwd: project.main });
  } finally {
    project.cleanup();
  }
});

test('protected checkout: a lane that names a protected tree is still refused', () => {
  const project = makeProject();
  try {
    project.refuses('protected-checkout', {
      registry: { ...project.registry, protectedCheckouts: [{ path: project.laneTree, reason: 'Pass 62 benchmark' }] },
    });
  } finally {
    project.cleanup();
  }
});

test('wrong Git database: a tree from another repository is refused before any lane check', () => {
  const project = makeProject();
  const foreign = makeProject();
  try {
    project.refuses('wrong-git-database', { cwd: foreign.laneTree });
  } finally {
    project.cleanup();
    foreign.cleanup();
  }
});

test('wrong branch and wrong owner are refused', () => {
  const project = makeProject();
  try {
    git(project.laneTree, 'checkout', '-q', '-b', 'contrib/dave-gaming-pc/claude/other');
    project.refuses('wrong-branch');
    git(project.laneTree, 'checkout', '-q', 'contrib/dave-gaming-pc/claude/fix');
    project.refuses('wrong-owner', { harness: 'codex' });
    project.refuses('wrong-machine', { machine: 'jigglyclaw-wsl' });
  } finally {
    project.cleanup();
  }
});

test('stale head: a checkout behind the dispatched candidate is refused', () => {
  const project = makeProject();
  try {
    // The aa-omp-pass84 shape: the tree exists, the branch is right, but HEAD
    // is an older commit than the lane was dispatched at.
    git(project.laneTree, 'reset', '-q', '--hard', project.first);
    project.refuses('stale-base');
    // And with the base satisfied but the dispatch head advanced past HEAD:
    const advanced = commit(project.main, 'docs/c.md', 'c\n', 'later on main');
    git(project.laneTree, 'reset', '-q', '--hard', project.base);
    project.refuses('stale-head', {
      registry: { ...project.registry, lanes: { fix: { ...project.registry.lanes.fix, dispatchHeadSha: advanced } } },
    });
  } finally {
    project.cleanup();
  }
});

test('stale integration record: fetched origin/main that differs from the registry is refused', () => {
  const project = makeProject();
  try {
    project.refuses('stale-integration-record', { originMainSha: 'f'.repeat(40) });
  } finally {
    project.cleanup();
  }
});

test('dirty unknown state is refused, not classified', () => {
  const project = makeProject();
  try {
    writeFileSync(join(project.laneTree, 'scratch.txt'), 'unknown\n');
    project.refuses('dirty-worktree');
  } finally {
    project.cleanup();
  }
});

test('expired, closed and unknown lanes are refused', () => {
  const project = makeProject();
  try {
    project.refuses('expired-lane', { now: new Date('3000-01-01T00:00:00Z') });
    project.refuses('unknown-lane', { laneId: 'nope' });
    const closed = {
      ...project.registry.lanes.fix, status: 'closed', expiresAt: PAST,
      closure: { outcome: 'integrated', laneHeadSha: project.base, integratedIntoSha: project.base, closedAt: PAST },
    };
    project.refuses('closed-lane', { registry: { ...project.registry, lanes: { fix: closed } } });
  } finally {
    project.cleanup();
  }
});

test('changes outside the lane scope are refused', () => {
  const project = makeProject();
  try {
    commit(project.laneTree, 'src/legacy-main.ts', 'export {};\n', 'out of scope');
    project.refuses('outside-scope');
  } finally {
    project.cleanup();
  }
});

test('the wrong project id is refused whether it comes from the flag or the registry', () => {
  const project = makeProject();
  try {
    project.refuses('wrong-project', { projectId: 'some-other-game' });
    project.refuses('wrong-project', { registry: { ...project.registry, projectId: 'some-other-game' } });
  } finally {
    project.cleanup();
  }
});

// ---------------------------------------------------------------- closure

function closureOf(project, laneHead, closure) {
  return { ...project.registry, lanes: { fix: { ...project.registry.lanes.fix, status: 'closed', expiresAt: PAST, closure: { laneHeadSha: laneHead, closedAt: PAST, ...closure } } } };
}

function close(project, registry, originMainSha) {
  return evaluateLaneClosure({
    registry, identity: IDENTITY, projectId: PROJECT, laneId: 'fix',
    observed: observeWorktree(project.laneTree), probe: createGitProbe(project.laneTree), originMainSha,
  });
}

test('closure: an open lane cannot be closed by implication', () => {
  const project = makeProject();
  try {
    assert.throws(() => close(project, project.registry, project.base), /lane-not-closed|no closure record/);
  } finally {
    project.cleanup();
  }
});

test('closure: integrated requires the lane head to be reachable from the integration line', () => {
  const project = makeProject();
  try {
    const laneHead = commit(project.laneTree, 'docs/b.md', 'b\n', 'lane work');
    // Claimed integrated into main's tip, but main never merged it.
    assert.throws(() => close(project, closureOf(project, laneHead, { outcome: 'integrated', integratedIntoSha: project.base }), project.base), /not an ancestor/);
    // Actually merge it, then the same claim verifies.
    git(project.main, 'merge', '-q', '--no-ff', '-m', 'merge lane', laneHead);
    const merged = git(project.main, 'rev-parse', 'HEAD');
    git(project.main, 'update-ref', 'refs/remotes/origin/main', merged);
    const receipt = close(project, closureOf(project, laneHead, { outcome: 'integrated', integratedIntoSha: merged }), merged);
    assert.equal(receipt.proof.outcome, 'integrated');
    assert.equal(receipt.proof.integrationTip, merged);
    assert.match(receipt.retirement, /removes nothing/);
    // A merge commit that is NOT on the integration line is not integration.
    assert.throws(() => close(project, closureOf(project, laneHead, { outcome: 'integrated', integratedIntoSha: merged }), project.base), /not reachable from/);
    // The worktree is untouched by verification.
    assert.ok(existsSync(join(project.laneTree, 'docs', 'b.md')));
  } finally {
    project.cleanup();
  }
});

test('closure: rejected requires verified preservation and refuses a dirty tree', () => {
  const project = makeProject();
  try {
    const laneHead = commit(project.laneTree, 'docs/b.md', 'b\n', 'lane work');
    const rejected = (preservation) => closureOf(project, laneHead, { outcome: 'rejected', reason: 'owner rejected', preservation });
    // A ref that points somewhere else is not proof.
    git(project.main, 'update-ref', 'refs/preserved/fix', project.base);
    assert.throws(() => close(project, rejected({ ref: 'refs/preserved/fix' }), project.base), /resolves to/);
    // A bundle that does not exist is not proof.
    assert.throws(() => close(project, rejected({ bundlePath: join(project.root, 'missing.bundle') }), project.base), /does not exist/);
    // Real proof: the ref at the lane head, and a bundle that lists it.
    git(project.main, 'update-ref', 'refs/preserved/fix', laneHead);
    const bundlePath = join(project.root, 'fix.bundle');
    git(project.laneTree, 'bundle', 'create', bundlePath, 'contrib/dave-gaming-pc/claude/fix');
    const receipt = close(project, rejected({ ref: 'refs/preserved/fix', bundlePath }), project.base);
    assert.equal(receipt.proof.outcome, 'rejected');
    assert.deepEqual(receipt.proof.preservation.map((entry) => entry.kind), ['ref', 'bundle']);
    // Uncommitted work is the only copy; closing over it is refused.
    writeFileSync(join(project.laneTree, 'docs', 'b.md'), 'edited but not committed\n');
    assert.throws(() => close(project, rejected({ ref: 'refs/preserved/fix', bundlePath }), project.base), /dirty|only copy/);
    // The head must be the recorded head.
    git(project.laneTree, 'checkout', '-q', '--', 'docs/b.md');
    git(project.laneTree, 'reset', '-q', '--hard', project.base);
    assert.throws(() => close(project, rejected({ ref: 'refs/preserved/fix', bundlePath }), project.base), /differs from recorded laneHeadSha/);
    assert.ok(existsSync(project.laneTree), 'verification never removes the worktree');
  } finally {
    project.cleanup();
  }
});

// ------------------------------------------------- installer and readback

test('init writes a machine record from observed values, show reads it back, init never overwrites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aa-routing-registry-'));
  const registryPath = join(dir, 'registry.json');
  const cli = (...args) => spawnSync(process.execPath, [join(REPOSITORY_ROOT, 'scripts', 'release', 'project-routing.mjs'), ...args], {
    cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, ATOMIC_ACRES_ROUTING_REGISTRY: registryPath, ATOMIC_ACRES_ROUTING_REQUIRED: '' },
  });
  try {
    // The real repository must expose origin/main for init to pin the integration SHA.
    const originMain = git(REPOSITORY_ROOT, 'rev-parse', 'refs/remotes/origin/main');
    const commonDir = git(REPOSITORY_ROOT, 'rev-parse', '--git-common-dir');

    const missing = cli('show');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No project routing registry/);

    const init = cli('init', '--machine', 'dave-gaming-pc');
    assert.equal(init.status, 0, init.stderr);
    const initReceipt = JSON.parse(init.stdout);
    assert.equal(initReceipt.registryPath, registryPath);
    assert.equal(initReceipt.integrationSha, originMain);
    assert.equal(initReceipt.enforcement, 'warn');
    assert.equal(initReceipt.lanes, 0);

    const written = JSON.parse(readFileSync(registryPath, 'utf8'));
    validateRegistry(written, IDENTITY);
    assert.equal(written.machine, 'dave-gaming-pc');
    assert.deepEqual(written.lanes, {});
    assert.equal(written.inspectedPreview.sha, null, 'init must not invent an inspected candidate from example data');
    assert.equal(written.inspectedPreview.status, 'not-recorded');
    assert.equal(written.production.pass, null, 'init has not verified any production pass');
    assert.equal(written.rollback.pass, null, 'init has not verified a rollback');
    assert.equal(written.integration.expectedSha, originMain);
    assert.ok(commonDir.replace(/\\/g, '/').endsWith('.git'));
    assert.equal(written.gitCommonDir.toLowerCase(), resolve(REPOSITORY_ROOT, commonDir).replace(/\\/g, '/').toLowerCase());

    const show = cli('show');
    assert.equal(show.status, 0, show.stderr);
    const readback = JSON.parse(show.stdout);
    assert.equal(readback.registryPath, registryPath);
    assert.equal(readback.integration.matchesLocalRef, true);
    assert.equal(readback.routingRequiredByEnv, false);
    assert.deepEqual(readback.lanes, {});

    const again = cli('init', '--machine', 'dave-gaming-pc', '--enforce', 'refuse');
    assert.equal(again.status, 1);
    assert.match(again.stderr, /never overwrites/);
    assert.equal(JSON.parse(readFileSync(registryPath, 'utf8')).enforcement.legacyContribute, 'warn', 'a refused init leaves the record untouched');

    const badMachine = cli('init', '--machine', 'Not A Slug');
    assert.equal(badMachine.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------- schema and globs

test('absolute identity paths are required even when the relative path would resolve here', () => {
  for (const mutate of [
    (r) => { r.gitCommonDir = '.git'; },
    (r) => { r.lanes['routing-repair-20260911'].worktree = '.'; },
    (r) => { r.lanes['routing-repair-20260911'].worktree = 'C:work'; },
    (r) => { r.protectedCheckouts[0].path = '../benchmark'; },
    (r) => { r.inspectedPreview.worktree = 'current'; },
    (r) => { r.lanes['example-closed-rejected'].closure.preservation.bundlePath = 'saved.bundle'; },
  ]) {
    const registry = structuredClone(EXAMPLE);
    mutate(registry);
    assert.throws(() => validateRegistry(registry, IDENTITY), /must be an absolute path/);
  }
});

test('the machine on the registry cannot be borrowed for another machine', () => {
  const project = makeProject();
  try {
    project.registry.machine = 'foreign-machine';
    project.refuses('wrong-machine');
  } finally { project.cleanup(); }
});

test('damaged or explicitly missing routing state never restores legacy permission', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aa-routing-policy-'));
  const path = join(dir, 'registry.json');
  const legacyIdentity = { ...IDENTITY, routingRequired: false };
  try {
    assert.equal(legacyRoutingPolicy(legacyIdentity, { path, env: {} }).required, false);
    assert.equal(legacyRoutingPolicy({ ...IDENTITY, routingRequired: true }, { path, env: {} }).required, true, 'committed enforcement survives losing the file and environment');
    assert.equal(legacyRoutingPolicy(IDENTITY, { path, env: { ATOMIC_ACRES_ROUTING_REQUIRED: '1' } }).required, true);
    assert.equal(legacyRoutingPolicy(IDENTITY, { path, env: { ATOMIC_ACRES_ROUTING_REGISTRY: path } }).required, true);
    writeFileSync(path, JSON.stringify(EXAMPLE));
    assert.equal(legacyRoutingPolicy(legacyIdentity, { path, env: {} }).required, false);
    writeFileSync(path, '{ damaged');
    assert.throws(() => legacyRoutingPolicy(IDENTITY, { path, env: {} }), /Cannot parse/);
    const malformed = structuredClone(EXAMPLE);
    malformed.enforcement = {};
    writeFileSync(path, JSON.stringify(malformed));
    assert.throws(() => legacyRoutingPolicy(IDENTITY, { path, env: {} }), /enforcement/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a bundle header without its object pack cannot certify preservation', () => {
  const project = makeProject();
  try {
    const head = commit(project.laneTree, 'docs/b.md', 'preserved\n', 'lane');
    const bundle = join(project.root, 'real.bundle');
    git(project.laneTree, 'bundle', 'create', bundle, 'HEAD');
    const probe = createGitProbe(project.laneTree);
    assert.ok(probe.bundleHeads(bundle)?.includes(head));
    const bytes = readFileSync(bundle);
    const pack = bytes.indexOf(Buffer.from('PACK'));
    assert.ok(pack > 0);
    const truncated = join(project.root, 'header-only.bundle');
    writeFileSync(truncated, bytes.subarray(0, pack));
    assert.ok(git(project.laneTree, 'bundle', 'list-heads', truncated).includes(head), 'header looks valid to the old verifier');
    assert.equal(probe.bundleHeads(truncated), null);
  } finally { project.cleanup(); }
});

test('the registry schema refuses the shapes that would let routing lie', () => {
  const valid = structuredClone(EXAMPLE);
  validateRegistry(valid, IDENTITY);
  const broken = (mutate, expected) => {
    const candidate = structuredClone(EXAMPLE);
    mutate(candidate);
    assert.throws(() => validateRegistry(candidate, IDENTITY), expected);
  };
  broken((r) => { r.schemaVersion = 2; }, /schemaVersion/);
  broken((r) => { r.projectId = 'other'; }, /does not match/);
  broken((r) => { r.inspectedPreview.status = 'accepted'; }, /may not assert acceptance/);
  broken((r) => { r.lanes['routing-repair-20260911'].closure = { outcome: 'integrated' }; }, /open lane cannot carry a closure/);
  broken((r) => { r.lanes['example-closed-rejected'].closure.preservation = {}; }, /preservation/);
  broken((r) => { r.lanes['example-closed-rejected'].closure.preservation = { ref: 'not-a-ref' }; }, /preservation/);
  broken((r) => { r.lanes['routing-repair-20260911'].allowedPaths = []; }, /allowedPaths/);
  broken((r) => { r.lanes['routing-repair-20260911'].owner.harness = 'codex'; }, /does not name owner/);
  broken((r) => { r.lanes.second = { ...r.lanes['routing-repair-20260911'], branch: 'contrib/dave-gaming-pc/claude/second' }; }, /one worktree has one owner/);
  broken((r) => { r.enforcement.legacyContribute = 'ignore'; }, /enforcement/);
  broken((r) => { r.integration.expectedSha = 'abc'; }, /expectedSha/);
});

test('scope globs: ** spans directories, * does not, everything is anchored', () => {
  assert.ok(globToRegExp('scripts/release/**').test('scripts/release/deep/file.mjs'));
  assert.ok(!globToRegExp('scripts/release/*').test('scripts/release/deep/file.mjs'));
  assert.ok(globToRegExp('docs/PROJECT_ROUTING*').test('docs/PROJECT_ROUTING.example.json'));
  assert.ok(!globToRegExp('docs/PROJECT_ROUTING*').test('docs/other/PROJECT_ROUTING.md'));
  assert.ok(!globToRegExp('AGENTS.md').test('src/AGENTS.md'));
  assert.deepEqual(pathsOutsideScope(['src/a.ts', 'docs/x.md', 'package.json'], ['docs/**', 'package.json']), ['src/a.ts']);
});
