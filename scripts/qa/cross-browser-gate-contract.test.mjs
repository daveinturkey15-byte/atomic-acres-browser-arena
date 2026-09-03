import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeMatrixVerdict } from './cross-browser-gate-contract.mjs';
import { MINIMUM_EYE_CLEARANCE_ARENAS, eyeClearanceArenaIds, parkedArenaIds } from './eye-clearance-roster.mjs';

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
  // MAP3: ratcheted 7 -> 8 when Map 3 joined the selectable roster, mirroring the
  // identical guard in eye-clearance-sweep-contract.test.mjs. The floor and the
  // required set are the only things standing between a collapsed derivation and
  // a gate that reports success while browser-testing nothing.
  // MAP3 (owner 2026-09-02, HF-409, PASS 86): ratcheted BACK UP 7 -> 8 with the
  // card. The 8 -> 7 drop lasted exactly as long as the withdrawal did. A floor
  // is a collapsed-derivation alarm and must equal the REAL roster in both
  // directions - which is why the equality assertion below, not this literal,
  // is the thing that actually holds it.
  // HF-423 (PASS 87): 8 -> 10. Both PASS 86 and Lane R independently wrote the
  // literal `9` from different arithmetic (nine of ten with farcrysis hidden;
  // nine ids before nuketown2 with it un-hidden). Git merges identical text
  // without conflict, so the union of the two is TEN, not nine.
  assert.ok(selectable.length >= 10, `expected the real selectable roster, got ${JSON.stringify(selectable)}`);
  // MAP3 (HF-409 repair, 2026-09-02): a bare floor only guards DOWNWARD, so a
  // silently lowered literal would still pass while covering fewer arenas. The
  // sibling eye-clearance contract was given a floor-equals-derived-roster
  // equality on the same day; this is that assertion, so the two independent
  // derivations and the shared floor constant must all agree, and the literal
  // above cannot be edited on its own in either direction.
  assert.equal(
    selectable.length, MINIMUM_EYE_CLEARANCE_ARENAS,
    `this file's derived roster (${selectable.length}: ${selectable.join(', ')}) must equal `
    + `the shared roster floor (${MINIMUM_EYE_CLEARANCE_ARENAS}) that eye-clearance-roster.mjs pins`,
  );
  assert.deepEqual(
    [...selectable].sort(), [...eyeClearanceArenaIds()].sort(),
    'this file and the shared roster derivation must name the SAME arenas, not merely the same count',
  );
  // MAP3 joins the required set with its card: an offered arena that no browser
  // ever loads is exactly the hole this required set exists to catch. FARCRYSIS
  // joins it at HF-423 for the same reason.
  for (const required of ['atomic-acres', 'test1', 'test2', 'map3']) {
    assert.ok(selectable.includes(required), `${required} is selectable and must be browser-tested`);
  }
  // HF-429 (owner, 2026-09-03): farcrysis is PARKED again and leaves the
  // required set. Its exclusion is ASSERTED, not merely dropped - the parked
  // set is derived from the same registry scrape as the offered set, so a
  // parked arena cannot quietly slip out of coverage, and a future park or
  // un-park needs no edit here at all.
  const parked = parkedArenaIds();
  assert.ok(parked.length > 0, 'the parked-arena pin must not be vacuous');
  for (const id of parked) {
    assert.ok(!selectable.includes(id), `${id} is parked and must not be in this roster`);
  }
});
