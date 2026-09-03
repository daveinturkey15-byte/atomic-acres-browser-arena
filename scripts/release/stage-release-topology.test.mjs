import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/**
 * PASS 87 Lane AR, item 10.
 *
 * `stage-release-topology.mjs` used to MOVE the candidate's index.html and
 * assets/ into the channel directory, and then run every remaining check:
 * the stable channel's environment and dist, four pinned Pages channels, the
 * rollback rebuild. Any of those throwing left the dist ROOT empty - so the
 * preview 404'd, and the next run failed at the completeness guard near the top
 * of the script with `candidate dist is incomplete`, a message about the BUILD
 * printed because of a STAGING failure. Nothing tested this because nothing
 * tested this script at all.
 *
 * These tests drive the real script against a synthetic dist, force a failure
 * from the first step after staging, and assert the two things that matter:
 * the candidate survives, and re-running reports the same honest reason.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'release-channels.json'), 'utf8'));
const SOURCE_SHA = 'a'.repeat(40);

function makeCandidateDist() {
  const dist = mkdtempSync(join(tmpdir(), 'aa-stage-dist-'));
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>candidate</title>\n');
  // The pass-identity guard reads the emitted JS, so this has to carry it.
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), `console.log(${JSON.stringify(CONFIG.experimental.pass)});\n`);
  writeFileSync(join(dist, 'assets', 'index-abc123.css'), 'body{}\n');
  writeFileSync(join(dist, 'map3.html'), '<!doctype html><title>map3</title>\n');
  return dist;
}

/**
 * Runs the script with a stable dist that exists but is EMPTY. That is the
 * first check after the candidate is staged, so it isolates the destructive
 * window without depending on git objects or the pinned channels.
 */
function runWithBrokenStableChannel(dist) {
  const emptyStable = mkdtempSync(join(tmpdir(), 'aa-stage-stable-'));
  const receipt = join(mkdtempSync(join(tmpdir(), 'aa-stage-receipt-')), 'release-topology.json');
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'release', 'stage-release-topology.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_DIST_ROOT: dist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: receipt,
      RELEASE_STABLE_DIST: emptyStable,
      STABLE_RELEASED_AT: '2026-09-03T00:00:00Z',
      SOURCE_SHA,
      RELEASE_PASS: CONFIG.experimental.pass,
      RELEASE_BUILT_AT: '',
      REQUIRE_STABLE_RELEASE_TIMESTAMP: '',
      RELEASE_ROLLBACK_DIST: '',
      REQUIRE_ROLLBACK_CHANNEL: '',
    },
  });
  rmSync(emptyStable, { recursive: true, force: true });
  return result;
}

test('a staging failure leaves the candidate dist intact and re-runnable', (t) => {
  const dist = makeCandidateDist();
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  const first = runWithBrokenStableChannel(dist);
  assert.notEqual(first.status, 0, 'the broken stable channel must still fail the run');
  assert.match(
    `${first.stderr}`,
    /rebuilt stable dist is incomplete/u,
    `expected the honest stable-channel failure, got:\n${first.stderr}`,
  );

  // THE DEFECT. Before this fix both of these were gone, because the script had
  // already moved them into channels/<pass>/ before the stable channel was
  // touched.
  assert.ok(existsSync(join(dist, 'index.html')), 'dist/index.html must survive a staging failure');
  assert.ok(existsSync(join(dist, 'assets')), 'dist/assets must survive a staging failure');
  assert.ok(existsSync(join(dist, 'map3.html')), 'dist/map3.html must survive a staging failure');

  // ...and the consequence of the defect: the second run used to fail for a
  // different, misleading reason - a message about the build, caused by
  // staging. It must fail for the SAME reason as the first.
  const second = runWithBrokenStableChannel(dist);
  assert.notEqual(second.status, 0);
  assert.match(`${second.stderr}`, /rebuilt stable dist is incomplete/u);
  assert.doesNotMatch(
    `${second.stderr}`,
    /candidate dist is incomplete/u,
    'a staging failure must never be reported as an incomplete build on the next run',
  );
});

test('a run that never reaches staging does not touch the candidate either', (t) => {
  const dist = makeCandidateDist();
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'release', 'stage-release-topology.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_DIST_ROOT: dist, SOURCE_SHA: 'not-a-sha' },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}`, /SOURCE_SHA must be one exact 40-character Git SHA/u);
  assert.ok(existsSync(join(dist, 'index.html')));
  assert.ok(existsSync(join(dist, 'assets')));
});

/**
 * SKEPTIC FOLLOW-UP. The first version of the fix moved the completeness guard
 * above the staging renames but left `removeStagedOriginals()` with three
 * copyFileSync calls and two writeFileSync calls below it, so the in-code
 * comment "every throwing step is above this line" was false: a missing or
 * unreadable release-shell/ file still deleted dist/assets and dist/map3.html
 * and reproduced `candidate dist is incomplete` on the next run.
 *
 * That window cannot be reached from a test without renaming a tracked
 * directory out from under a shared machine's other builds, so it is closed by
 * ORDER and asserted as order: after the destructive call, the script may only
 * write. Any future edit that reads a file, copies a file, or shells out below
 * that line re-opens the exact defect and fails here.
 */
test('nothing that can throw runs after the dist root is emptied', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'release', 'stage-release-topology.mjs'), 'utf8');
  const destructive = source.indexOf('\nremoveStagedOriginals();');
  assert.ok(destructive > 0, 'the destructive call must exist');
  const tail = source.slice(destructive + '\nremoveStagedOriginals();'.length);

  // The release-shell inputs are read while the dist root is still intact.
  const read = source.indexOf("readFileSync(join(repositoryRoot, 'release-shell', file))");
  assert.ok(read > 0 && read < destructive, 'release-shell/ must be READ before the dist root is emptied');

  for (const forbidden of ['readFileSync(', 'copyFileSync(', 'cpSync(', 'rmSync(', 'execFileSync(', 'existsSync(', 'readdirSync(']) {
    assert.ok(
      !tail.includes(forbidden),
      `${forbidden} runs after removeStagedOriginals(); a throw there leaves the dist root unre-runnable`,
    );
  }
  // What is allowed after it: the writes that make the root chooser-only.
  assert.match(tail, /writeFileSync\(join\(distRoot, file\), contents\)/u);
  assert.match(tail, /writeFileSync\(topologyReceiptPath, topologyReceiptSource\)/u);
});
