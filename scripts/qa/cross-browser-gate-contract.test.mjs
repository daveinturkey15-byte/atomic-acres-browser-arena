import test from 'node:test';
import assert from 'node:assert/strict';
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
