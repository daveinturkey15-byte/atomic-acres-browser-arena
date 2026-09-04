// node --test scripts/loop/run-loop.test.mjs
// Pins the runner's refusals against the REAL committed reference set and the
// REAL committed image pair, so these assertions cover the same code path a
// live cycle takes - only the model call is a fixture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, resolvePairs, runCycle, runLoop, LOOP_CONTRACT } from './run-loop.mjs';
import { createFixtureAdapter } from './adapters/fixture.mjs';
import { openJournal } from './journal.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBJECT = 'chopper-gunner-cockpit-1080';
const fixtureDir = join(repoRoot, 'scripts/loop/fixtures/dry-run');
const fixture = (id) => JSON.parse(readFileSync(join(fixtureDir, `cycle-1-critic-${id}.json`), 'utf8'));

function tempJournal() {
  return openJournal(join(mkdtempSync(join(tmpdir(), 'loop-run-')), 'journal.jsonl'));
}

async function cycleWith(responses, critics) {
  const { manifest } = loadManifest(repoRoot, SUBJECT);
  return runCycle({
    repoRoot, subject: SUBJECT, manifest, cycle: 1,
    adapter: createFixtureAdapter({ responses }),
    critics,
    outDir: mkdtempSync(join(tmpdir(), 'loop-out-')),
    dryRun: true,
    journalPath: tempJournal(),
  });
}

test('the committed subject loads and resolves exactly one allow-listed pair', () => {
  const { manifest } = loadManifest(repoRoot, SUBJECT);
  const pairs = resolvePairs(repoRoot, manifest);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].skipped, undefined);
  assert.match(pairs[0].referencePath, /after-desktop-1920x1080\.png$/);
  assert.match(pairs[0].capturePath, /before-desktop-1920x1080\.png$/);
});

test('a pair pointing at a source the manifest did not allow-list is SKIPPED, not shown', () => {
  const { manifest } = loadManifest(repoRoot, SUBJECT);
  const tampered = { ...manifest, pairs: [{ id: 'sneaky', sourceId: 'S2', capture: 'docs/assets/chopper-gunner-2026-08-31/after-desktop-1920x1080.png' }] };
  const pairs = resolvePairs(repoRoot, tampered);
  assert.equal(pairs[0].referencePath, null);
  assert.match(pairs[0].skipped, /not an allow-listed critic target/);
});

test('a good critic produces a scored cycle with a named region and a real tier-0 measurement', async () => {
  const { event } = await cycleWith({ 'cycle-1-critic-A': fixture('A') }, ['A']);
  assert.equal(event.contract, LOOP_CONTRACT);
  assert.equal(event.critics[0].valid, true);
  assert.equal(event.critics[0].total, 81);
  assert.equal(event.largestGapRow, 'geometry-match');
  assert.deepEqual(event.largestGapRegions, ['r2c2']);
  // Tier 0 ran on the real images before the critic was called.
  assert.equal(event.precheck.ssim, 0.8105);
  assert.equal(event.precheck.edgeIoU, 0.5343);
  assert.equal(event.precheck.worstRegion, 'r2c2');
  assert.equal(event.precheck.aspectMismatch, 0);
});

test('a critic that did not see pixels is journalled INVALID and contributes no score', async () => {
  const { event } = await cycleWith({ 'cycle-1-critic-B': fixture('B') }, ['B']);
  assert.deepEqual(
    { valid: event.critics[0].valid, reason: event.critics[0].invalidReason, total: event.critics[0].total },
    { valid: false, reason: 'probe-mismatch', total: null },
  );
  assert.equal(event.validCritics, 0);
  assert.equal(event.meanTotal, null, 'a cycle with no valid critic has no score at all');
  assert.equal(event.allRowsPassGate, false);
});

test('a critic that contradicts the measurement is INVALID even with a correct probe', async () => {
  const { event } = await cycleWith({ 'cycle-1-critic-C': fixture('C') }, ['C']);
  assert.deepEqual(
    { valid: event.critics[0].valid, reason: event.critics[0].invalidReason, total: event.critics[0].total },
    { valid: false, reason: 'tier0-contradiction', total: null },
  );
  assert.equal(event.critics[0].expectedProbe, event.critics[0].answeredProbe, 'the probe was right; the reconciliation was not');
});

test('a mixed cycle scores only the valid critic and still refuses the gate', async () => {
  const { event } = await cycleWith(
    { 'cycle-1-critic-A': fixture('A'), 'cycle-1-critic-B': fixture('B'), 'cycle-1-critic-C': fixture('C') },
    ['A', 'B', 'C'],
  );
  assert.equal(event.validCritics, 1);
  assert.equal(event.meanTotal, 81);
  assert.equal(event.allRowsPassGate, false, 'one valid critic is under quorum and can never open the exit gate');
});

test('a critic with an empty notMatchable is recorded as over-claiming', async () => {
  const overclaiming = { ...fixture('A'), notMatchable: [] };
  const { event } = await cycleWith({ 'cycle-1-critic-A': overclaiming }, ['A']);
  assert.deepEqual(event.overClaimingCritics, ['A']);
});

test('the runner refuses the rationed Codex route for a routine cycle', async () => {
  await assert.rejects(
    () => runLoop({ repoRoot, subject: SUBJECT, adapterName: 'codex', dryRun: true }),
    /rationed and refuses a routine cycle/,
  );
});

test('a subject with no reference set is refused rather than rubric-graded', () => {
  assert.throws(() => loadManifest(repoRoot, 'no-such-subject'), /cannot be scored, only rubric-graded/);
});

test('there is no flag that lowers a gate, edits the judgeset or re-rolls a critic', () => {
  const source = readFileSync(join(repoRoot, 'scripts/loop/run-loop.mjs'), 'utf8');
  const argReads = [...source.matchAll(/args\[?'?([a-z-]+)'?\]/g)].map((m) => m[1]);
  const forbidden = argReads.filter((a) => /threshold|gate|retry|reroll|re-roll|camera|judgeset|force/.test(a));
  assert.deepEqual(forbidden, [], `the runner must not read a flag that weakens itself: ${forbidden.join(', ')}`);
});
