// Contract test for scripts/orchestration/publish_pass89.py --dry-run (HF-400).
//
// Owner, 2026-09-02 06:58 BST: "also when you push the next pass, pin this version and
// remove all past versions, this can be the safe backup". Given a fake gh-pages tree with
// the six channel trees that are live today, the plan must delete every tree except
// pass88, keep pass88, add pass89, offer exactly those two, and resolve the in-build
// fallback to channels/pass88 - all without writing a byte into the fake tree.
//
// Runs the real script (the plan is whatever the script would do, not a re-implementation
// of it), so this needs a python on PATH. It fails loudly when there is none: a contract
// test that cannot run must not be mistaken for one that passed.
//
//   node --test scripts/orchestration/publish_pass<N>_plan.test.mjs   (<N> = this pass)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repo = resolve(import.meta.dirname, '..', '..');
const script = join(repo, 'scripts', 'orchestration', 'publish_pass89.py');

// What origin/gh-pages carried at 718a5295 (2026-09-02, verified with git ls-tree).
const LIVE_TREES = ['pass72-retained', 'pass81', 'pass82', 'pass88', 'recent-stable', 'the-big-one'];
const LIVE_GENERATION = '76b095f29713';
const STALE_GENERATION = 'fb56f71d793a';
const LIVE_CONFIG = {
  experimental: { label: 'PASS 73 · RETAINED', description: 'x', pass: 'PASS 73', path: 'channels/the-big-one', deploymentState: 'live' },
  previous: { label: 'PASS 72 · RETAINED', description: 'x', pass: 'PASS 72', path: 'channels/pass72-retained' },
  pass81: { label: 'PASS 81 · RETAINED', description: 'x', pass: 'PASS 81', path: 'channels/pass81' },
  pass82: { label: 'PASS 82 · PREVIOUS VERSION', description: 'x', pass: 'PASS 82', path: 'channels/pass82' },
  pass88: { label: 'PASS 88', description: 'x', pass: 'PASS 88', path: 'channels/pass88' },
};

function python() {
  for (const candidate of ['python', 'python3', 'py']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  assert.fail('no python on PATH - the publish_pass89 contract cannot run, and an unrun contract is not a pass');
}

function fakeGhPages(trees = LIVE_TREES) {
  const dir = mkdtempSync(join(tmpdir(), 'aa-pass89-ghpages-'));
  for (const tree of trees) {
    mkdirSync(join(dir, 'channels', tree, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'channels', tree, 'index.html'), `<!doctype html><title>${tree}</title>\n`);
    writeFileSync(join(dir, 'channels', tree, 'assets', 'index.js'), `/* ${tree} */\n`);
  }
  writeFileSync(join(dir, 'release-channel-config.js'),
    `window.__ATOMIC_ACRES_RELEASE_CHANNELS__=${JSON.stringify(LIVE_CONFIG)};\n`);
  writeFileSync(join(dir, 'release-index.json'),
    `${JSON.stringify({ generation: LIVE_GENERATION, manifest: `release-manifest.${LIVE_GENERATION}.json` })}\n`);
  for (const generation of [LIVE_GENERATION, STALE_GENERATION]) {
    writeFileSync(join(dir, `release-shell.${generation}.js`), '// shell\n');
    writeFileSync(join(dir, `release-shell.${generation}.css`), '/* shell */\n');
    writeFileSync(join(dir, `release-manifest.${generation}.json`), '{}\n');
  }
  writeFileSync(join(dir, 'index.html'), '<!doctype html>\n');
  writeFileSync(join(dir, 'release-shell.js'), '// legacy\n');
  writeFileSync(join(dir, 'release-shell.css'), '/* legacy */\n');
  return dir;
}

function snapshot(dir) {
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [`${path.slice(dir.length + 1).replaceAll('\\', '/')}:${statSync(path).size}:${readFileSync(path, 'utf8')}`];
  });
  return walk(dir).sort();
}

function dryRun(dir, ...extraArgs) {
  const planPath = join(dir, '..', `${dir.split(/[\\/]/).at(-1)}-plan.json`);
  const run = spawnSync(python(), [script, '--dry-run', ...extraArgs, '--gh-pages-dir', dir, '--plan-json', planPath], {
    cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.ok(run.status === 0 || run.status === 2, `dry run crashed (exit ${run.status}):\n${output}`);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  rmSync(planPath, { force: true });
  return { status: run.status, output, plan };
}

test('the plan deletes every tree except pass88, keeps pass88, adds pass89, and the post-state is exactly {pass88, pass89}', () => {
  const dir = fakeGhPages();
  try {
    const { plan, output } = dryRun(dir);
    assert.equal(plan.policy, 'HF-400');
    assert.deepEqual(plan.treesPresent, LIVE_TREES);
    // Six trees live today; everything but the pinned backup goes - five deletions.
    assert.deepEqual(plan.treesToDelete, LIVE_TREES.filter((tree) => tree !== 'pass88'));
    assert.equal(plan.treesToDelete.length, 5);
    assert.deepEqual(plan.treesKept, ['pass88']);
    assert.equal(plan.treeAdded, 'pass89');
    assert.deepEqual(plan.postState, ['pass88', 'pass89']);
    assert.equal(plan.channel, 'channels/pass89');
    assert.equal(plan.backup, 'channels/pass88');
    assert.equal(plan.guards['post-state-exact'].ok, true, plan.guards['post-state-exact'].detail);
    assert.equal(plan.guards['chooser-matches-post-state'].ok, true, plan.guards['chooser-matches-post-state'].detail);
    assert.equal(plan.guards['backup-present'].ok, true);
    assert.equal(plan.guards['predecessors-offered'].ok, true, plan.guards['predecessors-offered'].detail);
    for (const tree of plan.treesToDelete) assert.match(output, new RegExp(`would delete channels/${tree}/`));
    assert.match(output, /would keep\s+\['channels\/pass88\/'\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the chooser carries exactly two cards, keyed for the shell aliases: experimental -> PASS 89 live, previous -> PASS 88 backup', () => {
  const dir = fakeGhPages();
  try {
    const { plan } = dryRun(dir);
    assert.deepEqual(plan.chooser.keys, ['experimental', 'previous']);
    assert.deepEqual(
      { pass: plan.chooser.channels.experimental.pass, path: plan.chooser.channels.experimental.path, deploymentState: plan.chooser.channels.experimental.deploymentState },
      { pass: 'PASS 89', path: 'channels/pass89', deploymentState: 'live' },
    );
    assert.deepEqual(
      { pass: plan.chooser.channels.previous.pass, path: plan.chooser.channels.previous.path, label: plan.chooser.channels.previous.label },
      { pass: 'PASS 88', path: 'channels/pass88', label: 'PASS 88 · SAFE BACKUP' },
    );
    // Every path the chooser offers is a tree in the post-state, and vice versa.
    const offered = Object.values(plan.chooser.channels).map((channel) => channel.path.split('/').at(-1)).sort();
    assert.deepEqual(offered, plan.postState);
    // The live pass81/pass82/pass72/the-big-one cards are gone from the chooser too.
    assert.deepEqual(plan.chooser.droppedLiveKeys.sort(), ['experimental', 'pass81', 'pass82', 'pass88', 'previous']);
    // Root shell: content-addressed generation, keep the live pointer's generation, sweep the rest.
    assert.match(plan.generation, /^[0-9a-f]{12}$/);
    assert.deepEqual(plan.keepGenerations, [plan.generation, LIVE_GENERATION].sort());
    assert.deepEqual(plan.rootAssetsToSweep, [
      `release-manifest.${STALE_GENERATION}.json`,
      `release-shell.${STALE_GENERATION}.css`,
      `release-shell.${STALE_GENERATION}.js`,
    ]);
    assert.deepEqual(plan.rootFilesToWrite, [
      'index.html',
      `release-shell.${plan.generation}.js`,
      `release-shell.${plan.generation}.css`,
      `release-manifest.${plan.generation}.json`,
      'release-index.json',
      'release-shell.js',
      'release-shell.css',
      'release-channel-config.js',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the in-build fallback (src/bootstrap.ts via release-channels.json) resolves to channels/pass88', () => {
  // Red until src/bootstrap.ts prefers `pass88Backup`: the guard reads the real
  // `const stableFallback = ...` chain out of the source, so this is the repository's
  // actual state, not a fixture. A red here means a direct link to a channel URL would
  // offer a second card that 404s the moment the pass89 publish retires its tree.
  const dir = fakeGhPages();
  try {
    const { plan } = dryRun(dir);
    assert.equal(plan.fallback.path, 'channels/pass88',
      `in-build fallback resolves to '${plan.fallback.key}' -> ${plan.fallback.path}; HF-400 retires that tree. `
      + 'Re-pin `const stableFallback` in src/bootstrap.ts to releaseChannels.pass88Backup.');
    assert.equal(plan.fallback.pass, 'PASS 88');
    assert.equal(plan.guards['in-build-fallback'].ok, true, plan.guards['in-build-fallback'].detail);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the dry run writes, deletes and renames nothing in the gh-pages tree', () => {
  const dir = fakeGhPages();
  try {
    const before = snapshot(dir);
    dryRun(dir);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses when the pass88 backup is not on gh-pages to be pinned, and plans no deletions', () => {
  const dir = fakeGhPages(LIVE_TREES.filter((tree) => tree !== 'pass88'));
  try {
    const { status, plan } = dryRun(dir);
    assert.equal(status, 2);
    assert.equal(plan.wouldPublish, false);
    assert.equal(plan.guards['backup-present'].ok, false);
    assert.match(plan.guards['backup-present'].detail, /no \['pass88'\] tree to pin as the safe backup/);
    assert.deepEqual(plan.treesToDelete, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback re-points the default at PASS 88, keeps PASS 89 as the previous card, deletes nothing, needs no build', () => {
  const dir = fakeGhPages(['pass88', 'pass89']);
  try {
    const before = snapshot(dir);
    const { plan } = dryRun(dir, '--rollback');
    assert.equal(plan.mode, 'rollback');
    assert.deepEqual(plan.treesToDelete, []);
    assert.equal(plan.treeAdded, null);
    assert.deepEqual(plan.postState, ['pass88', 'pass89']);
    assert.equal(plan.guards['rollback-state'].ok, true, plan.guards['rollback-state'].detail);
    assert.equal('build-present' in plan.guards, false, 'a rollback must not depend on dist-pass89');
    assert.equal('build-freshness' in plan.guards, false, 'a rollback must not depend on dist-pass89');
    assert.deepEqual(plan.chooser.keys, ['experimental', 'previous']);
    assert.deepEqual(
      { pass: plan.chooser.channels.experimental.pass, path: plan.chooser.channels.experimental.path, deploymentState: plan.chooser.channels.experimental.deploymentState },
      { pass: 'PASS 88', path: 'channels/pass88', deploymentState: 'live' },
    );
    assert.deepEqual(
      { pass: plan.chooser.channels.previous.pass, path: plan.chooser.channels.previous.path },
      { pass: 'PASS 89', path: 'channels/pass89' },
    );
    assert.deepEqual(snapshot(dir), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback refuses when gh-pages is not already exactly {pass88, pass89}', () => {
  const dir = fakeGhPages();
  try {
    const { status, plan } = dryRun(dir, '--rollback');
    assert.equal(status, 2);
    assert.equal(plan.guards['rollback-state'].ok, false);
    assert.match(plan.guards['rollback-state'].detail, /post-state is \[.*\], expected exactly \['pass88', 'pass89'\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exit code is 2 while any guard is red and 0 only when every guard is green', () => {
  const dir = fakeGhPages();
  try {
    const { status, plan } = dryRun(dir);
    const red = Object.entries(plan.guards).filter(([, verdict]) => !verdict.ok).map(([name]) => name);
    assert.equal(plan.wouldPublish, red.length === 0);
    assert.equal(status, red.length === 0 ? 0 : 2, `red guards: ${red.join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the outside-ownership patch is tracked and either applies cleanly or is already applied', () => {
  // Case 3 above is red until src/bootstrap.ts prefers `pass88Backup`. That change is
  // outside Lane F's ownership, so it ships as a patch file. The first copy lived under
  // artifacts/, which is gitignored and so would not have survived the merge; it lives in
  // docs/ now, next to the runbook that tells the orchestrator to apply it BEFORE
  // `npm run build`. This proves the tracked copy still matches the tree it targets: a
  // patch that neither applies nor reverses has drifted from src/ and must be re-cut.
  const patch = join(repo, 'docs', 'pass89-outside-ownership.patch');
  assert.ok(statSync(patch).isFile(), `${patch} is missing`);
  const text = readFileSync(patch, 'utf8');
  assert.match(text, /^\+const stableFallback = releaseChannels\.pass88Backup \?\? releaseChannels\.stable;$/m);
  assert.match(text, /^\+  pass88Backup\?: Readonly</m);
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', 'docs/pass89-outside-ownership.patch'], { cwd: repo, encoding: 'utf8' });
  assert.equal(tracked.status, 0, 'docs/pass89-outside-ownership.patch must be tracked so it survives the merge');
  const forward = spawnSync('git', ['apply', '--check', patch], { cwd: repo, encoding: 'utf8' });
  const reverse = spawnSync('git', ['apply', '--check', '--reverse', patch], { cwd: repo, encoding: 'utf8' });
  assert.ok(forward.status === 0 || reverse.status === 0,
    `the patch neither applies (${forward.stderr.trim()}) nor is already applied (${reverse.stderr.trim()}); re-cut it against src/bootstrap.ts and src/release-channel.ts`);
});
