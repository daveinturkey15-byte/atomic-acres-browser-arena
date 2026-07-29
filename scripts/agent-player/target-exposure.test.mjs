import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTargetExposure } from './target-exposure.mjs';

test('default exposure gate preserves existing fire eligibility', () => {
  const result = evaluateTargetExposure({ pixels: 1, bounds: { width: 1, height: 1 } });
  assert.equal(result.passes, true);
  assert.deepEqual(result.reasons, []);
});

test('occluded sliver fails every configured exposure dimension', () => {
  const result = evaluateTargetExposure(
    { pixels: 21, bounds: { width: 6, height: 5 } },
    { minimumPixels: 30, minimumArea: 48, minimumHeight: 8 },
  );
  assert.equal(result.passes, false);
  assert.deepEqual(result.reasons, [
    'insufficient-visible-pixels',
    'insufficient-visible-area',
    'insufficient-visible-height',
  ]);
  assert.equal(result.area, 30);
});

test('exposed operator passes the candidate gate at exact thresholds', () => {
  const result = evaluateTargetExposure(
    { pixels: 30, bounds: { width: 6, height: 8 } },
    { minimumPixels: 30, minimumArea: 48, minimumHeight: 8 },
  );
  assert.equal(result.passes, true);
});
