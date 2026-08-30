import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeMatrixVerdict } from './cross-browser-gate-contract.mjs';

const lane = (name, verdict) => ({ lane: name, verdict });

test('every lane measured and passing is a PASS', () => {
  const result = computeMatrixVerdict({
    lanes: [lane('chrome', 'pass'), lane('edge', 'pass'), lane('firefox', 'pass')],
    required: ['chrome', 'edge', 'firefox'],
  });
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.measured, ['chrome', 'edge', 'firefox']);
});

test('an uninstalled browser is NEVER counted as measured', () => {
  const result = computeMatrixVerdict({
    lanes: [lane('chrome', 'pass'), lane('opera', 'not-installed')],
    required: ['chrome'],
  });
  assert.deepEqual(result.measured, ['chrome'], 'opera must not appear as covered');
  assert.deepEqual(result.notInstalled, ['opera']);
});

test('an uninstalled browser that was required fails the gate', () => {
  const result = computeMatrixVerdict({
    lanes: [lane('chrome', 'pass'), lane('opera', 'not-installed')],
    required: ['chrome', 'opera'],
  });
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.requiredMissingOrBlocked, ['opera']);
});

test('a blocked lane fails the gate even when nobody required it', () => {
  // This is the HF-331 shape: the lane launched, produced no number, and the
  // temptation is to shrug it off as environmental. Nothing was measured, so the
  // browser is uncovered, so the gate is red.
  const result = computeMatrixVerdict({
    lanes: [lane('chrome', 'pass'), lane('firefox', 'blocked')],
    required: ['chrome'],
  });
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.blockedLanes, ['firefox']);
  assert.deepEqual(result.measured, ['chrome']);
});

test('a failing lane fails the gate', () => {
  const result = computeMatrixVerdict({ lanes: [lane('chrome', 'fail')], required: [] });
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.failedLanes, ['chrome']);
});

test('an all-skipped matrix is not a pass in disguise', () => {
  // Nothing installed, nothing required: the gate stays green only because there
  // is nothing to be red about, and `measured` is empty so the summary cannot
  // claim coverage it does not have.
  const result = computeMatrixVerdict({
    lanes: [lane('opera', 'not-installed'), lane('firefox', 'not-installed')],
    required: [],
  });
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.measured, [], 'no browser was measured, so nothing is covered');
  assert.deepEqual(result.notInstalled, ['opera', 'firefox']);
});

// Owner 2026-08-30. Both cross-browser entry points used to hardcode a
// six-arena list, so when test1/test2 shipped they were never opened in ANY
// browser by this gate - and nothing said so. That is the same failure mode
// that let two arenas ship another map's menu preview: a roster frozen inside a
// verifier that nobody updates when the roster grows. The scripts now derive
// the list from src/map-selection.ts; these pins stop the literal coming back
// and stop a new selectable arena silently escaping browser coverage.
test('the cross-browser scripts derive their arena roster instead of hardcoding it', () => {
  const scripts = ['./verify-cross-browser-matrix.mjs', './run-cross-browser-gate.mjs'];
  for (const relative of scripts) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /selectableArenaIds\(\)/u, `${relative} must derive the arena roster`);
    assert.doesNotMatch(
      source,
      /'atomic-acres,skyline-terminal/u,
      `${relative} must not reintroduce a hardcoded arena list`,
    );
  }
});

test('every selectable arena is covered by the derived roster', () => {
  const source = readFileSync(new URL('../../src/map-selection.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('ARENA_SELECTIONS'));
  const found = [...body.matchAll(/id:\s*'([a-z0-9-]+)'\s*as const/gu)];
  const selectable = [];
  for (let index = 0; index < found.length; index += 1) {
    const start = found[index].index;
    const end = index + 1 < found.length ? found[index + 1].index : body.length;
    if (!/selectable:\s*false/u.test(body.slice(start, end))) selectable.push(found[index][1]);
  }
  // Guards the derivation itself: if the regex ever stops matching the file's
  // shape it would silently yield an EMPTY roster, and an empty roster tests
  // nothing while reporting success.
  assert.ok(selectable.length >= 7, `expected the real selectable roster, got ${JSON.stringify(selectable)}`);
  for (const required of ['atomic-acres', 'test1', 'test2']) {
    assert.ok(selectable.includes(required), `${required} is selectable and must be browser-tested`);
  }
  assert.ok(!selectable.includes('farcrysis'), 'farcrysis is selectable:false and must stay out of the required set');
});
