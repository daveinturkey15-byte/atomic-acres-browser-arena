import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeViewmodelSilhouetteMask } from './viewmodel-silhouette-contract.mjs';

const width = 400;
const height = 240;
function maskWith(rectangles) {
  const mask = new Uint8Array(width * height);
  for (const [left, top, right, bottom] of rectangles) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

test('accepts two substantial rendered sleeves continuing below the crop', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [230, 195, 270, 240],
    [286, 188, 330, 240],
  ]), width, height);
  assert.equal(result.passed, true);
});

test('rejects visible capped arms plus one off-screen vertex', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [220, 175, 275, 226],
    [286, 178, 334, 226],
    [250, 239, 251, 240],
  ]), width, height);
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /lower screen crop/u);
});

test('rejects a skinny tendril engineered to touch the crop', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [220, 175, 275, 226],
    [286, 178, 334, 226],
    [250, 220, 254, 240],
  ]), width, height);
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /lower screen crop|too thin/u);
});

test('rejects one broad crop entry standing in for both rendered arms', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [235, 185, 295, 240],
  ]), width, height);
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /lower screen crop/u);
});

test('accepts an edge-overlapped high-ready silhouette only when two arm masses resolve above it', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [220, 188, 260, 225],
    [286, 188, 330, 225],
    [220, 225, 330, 240],
  ]), width, height);
  assert.equal(result.passed, true);
  assert.equal(result.cropEntryMode, 'merged');
});

test('rejects changing lower HUD pixels outside the viewmodel corridor', () => {
  const result = analyzeViewmodelSilhouetteMask(maskWith([
    [5, 190, 80, 240],
    [335, 185, 399, 240],
  ]), width, height);
  assert.equal(result.passed, false);
  assert.deepEqual(result.lowerEdge.runs, []);
});
