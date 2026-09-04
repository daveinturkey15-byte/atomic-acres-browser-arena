// node --test scripts/loop/critic-schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJson, validateCriticResponse, rowsPassGate, CRITIC_CONTRACT, ROWS, ROW_WEIGHT,
} from './critic-schema.mjs';

function response(overrides = {}, rowOverrides = {}) {
  return {
    contract: CRITIC_CONTRACT,
    subject: 'demo',
    cycle: 1,
    criticId: 'A',
    sawImages: { answer: 'ACDE' },
    rows: ROWS.map((row) => ({
      row,
      weight: ROW_WEIGHT,
      score: 24,
      regions: ['r1c1'],
      finding: 'The rear door track is a single plane where the reference shows a recess.',
      referenceEvidence: 'reference lower-right quadrant',
      captureEvidence: 'capture region r1c1',
      severity: 'P2',
      boundedCorrection: 'Add the rear door track recess. Change nothing else.',
      ...(rowOverrides[row] ?? {}),
    })),
    largestGap: { row: 'material-read', regions: ['r1c1'], rootCauseClass: 'implementation' },
    contractConflict: null,
    decision: 'refine-code',
    notMatchable: ['The reference is graded warmer than our key light; colour temperature is not scored.'],
    ...overrides,
  };
}

test('extractJson pulls an object out of a fenced block', () => {
  assert.deepEqual(extractJson('here you go:\n```json\n{"a":1}\n```\nthanks'), { a: 1 });
});

test('extractJson pulls a bare object out of prose, braces balanced inside strings', () => {
  assert.deepEqual(extractJson('sure. {"a":"}{","b":2} done'), { a: '}{', b: 2 });
});

test('extractJson returns null rather than guessing when there is no object', () => {
  assert.equal(extractJson('I could not see the images.'), null);
  assert.equal(extractJson(null), null);
});

test('a well-formed response with the right probe is valid and totals its rows', () => {
  const result = validateCriticResponse(response(), { expectedProbe: 'ACDE' });
  assert.deepEqual({ valid: result.valid, total: result.total, errors: result.errors }, { valid: true, total: 96, errors: [] });
});

test('a wrong probe makes the round invalid AND carries no total - it is never scored', () => {
  const result = validateCriticResponse(response(), { expectedProbe: 'FGHJ' });
  assert.deepEqual(
    { valid: result.valid, invalidReason: result.invalidReason, total: result.total, rowsBelowGate: result.rowsBelowGate },
    { valid: false, invalidReason: 'probe-mismatch', total: null, rowsBelowGate: null },
    'an invalid round must leave behind no number anyone can quote later',
  );
});

test('a missing probe answer makes the round invalid', () => {
  const result = validateCriticResponse(response({ sawImages: { answer: '' } }), { expectedProbe: 'ACDE' });
  assert.equal(result.invalidReason, 'probe-missing');
});

test('a row with no regions is rejected - it cannot produce a bounded correction', () => {
  const result = validateCriticResponse(response({}, { proportion: { regions: [] } }), { expectedProbe: 'ACDE' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('regions is mandatory')));
});

test('a failing row with no bounded correction is rejected', () => {
  const result = validateCriticResponse(response({}, { 'material-read': { score: 12, boundedCorrection: '' } }), { expectedProbe: 'ACDE' });
  assert.ok(result.errors.some((e) => e.includes('bounded correction')));
});

test('a missing row is rejected rather than silently scored out of three', () => {
  const body = response();
  body.rows = body.rows.filter((r) => r.row !== 'lighting-match');
  const result = validateCriticResponse(body, { expectedProbe: 'ACDE' });
  assert.ok(result.errors.some((e) => e.includes('missing row: lighting-match')));
  assert.equal(result.total, null, 'an incomplete response must not produce a total');
});

test('an empty notMatchable warns about over-claiming but does not invalidate', () => {
  const result = validateCriticResponse(response({ notMatchable: [] }), { expectedProbe: 'ACDE' });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes('over-claiming')));
});

test('tier 0 blocks tier 1: a high geometry score against a floor edge IoU is INVALID', () => {
  const precheck = { regions: [{ id: 'r1c1', edgeIoU: 0.31 }, { id: 'r0c0', edgeIoU: 0.9 }] };
  const result = validateCriticResponse(response(), { expectedProbe: 'ACDE', precheck });
  assert.equal(result.valid, false);
  assert.equal(result.invalidReason, 'tier0-contradiction');
});

test('tier 0 does not invalidate when the critic scored the contradicted region DOWN', () => {
  const precheck = { regions: [{ id: 'r1c1', edgeIoU: 0.31 }] };
  const result = validateCriticResponse(response({}, { 'geometry-match': { score: 14 } }), { expectedProbe: 'ACDE', precheck });
  assert.equal(result.valid, true);
});

test('tier 0 does not invalidate over a region the critic did not name', () => {
  const precheck = { regions: [{ id: 'r2c2', edgeIoU: 0.1 }] };
  assert.equal(validateCriticResponse(response(), { expectedProbe: 'ACDE', precheck }).valid, true);
});

test('an unknown decision or root-cause class is rejected', () => {
  assert.ok(validateCriticResponse(response({ decision: 'ship-it' }), { expectedProbe: 'ACDE' }).errors.some((e) => e.includes('decision')));
  assert.ok(validateCriticResponse(response({ largestGap: { row: 'proportion', regions: ['r0c0'], rootCauseClass: 'vibes' } }), { expectedProbe: 'ACDE' })
    .errors.some((e) => e.includes('rootCauseClass')));
});

test('rowsPassGate needs every valid critic clean', () => {
  const clean = validateCriticResponse(response(), { expectedProbe: 'ACDE' });
  const dirty = validateCriticResponse(response({}, { proportion: { score: 10 } }), { expectedProbe: 'ACDE' });
  assert.equal(rowsPassGate([clean]), true);
  assert.equal(rowsPassGate([clean, dirty]), false);
});
