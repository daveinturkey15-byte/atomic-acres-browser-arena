import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeArmIdMask,
  analyzeViewmodelSilhouetteMask,
  capArmIdMask,
} from './viewmodel-silhouette-contract.mjs';

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

test('accepts only an ultra-substantial continuous merge for a telemetry-proven heavy dual-chain pose', () => {
  const accepted = analyzeViewmodelSilhouetteMask(maskWith([
    [205, 185, 305, 240],
  ]), width, height, { profile: 'heavy-overlap' });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.cropEntryMode, 'ultra-merged');

  const ordinaryBroadProxy = analyzeViewmodelSilhouetteMask(maskWith([
    [220, 185, 295, 240],
  ]), width, height, { profile: 'heavy-overlap' });
  assert.equal(ordinaryBroadProxy.passed, false);
});

test('accepts a short-landscape dual-arm union only above the stronger overlap floor', () => {
  const accepted = analyzeViewmodelSilhouetteMask(maskWith([
    [220, 185, 256, 240],
  ]), width, height, { profile: 'dual-arm-overlap' });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.cropEntryMode, 'dual-arm-overlap');

  const ordinaryMergedWidth = analyzeViewmodelSilhouetteMask(maskWith([
    [225, 185, 255, 240],
  ]), width, height, { profile: 'dual-arm-overlap' });
  assert.equal(ordinaryMergedWidth.passed, false);
});

test('accepts a substantial one-hand action only through its right-edge action corridor', () => {
  const accepted = analyzeViewmodelSilhouetteMask(maskWith([
    [330, 185, 370, 240],
  ]), width, height, { profile: 'one-hand-action' });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.cropEntryMode, 'one-hand-action');

  const detachedCap = analyzeViewmodelSilhouetteMask(maskWith([
    [330, 225, 370, 240],
  ]), width, height, { profile: 'one-hand-action' });
  assert.equal(detachedCap.passed, false);
  assert.match(detachedCap.violations.join('\n'), /lower-arm silhouette/u);

  const edgeMassWithTendril = analyzeViewmodelSilhouetteMask(maskWith([
    [330, 236, 370, 240],
    [348, 185, 351, 236],
  ]), width, height, { profile: 'one-hand-action' });
  assert.equal(edgeMassWithTendril.passed, false);
  assert.match(edgeMassWithTendril.violations.join('\n'), /too thin|lower-arm silhouette/u);

  const belowRetainedSubstantialMass = analyzeViewmodelSilhouetteMask(maskWith([
    [330, 185, 355, 240],
  ]), width, height, { profile: 'one-hand-action' });
  assert.equal(belowRetainedSubstantialMass.passed, false);
});

for (const side of ['left', 'right']) {
  test(`accepts a substantial connected ${side} arm-only material-ID chain`, () => {
    const arm = maskWith([
      [248, 188, 274, 240],
      [238, 172, 272, 202],
      [224, 150, 254, 185],
    ]);
    const result = analyzeArmIdMask(arm, width, height, side);
    assert.equal(result.passed, true);
    assert.equal(result.principalComponent.bounds.maxY, height - 1);
    assert.ok(result.principalComponent.metrics.lowerEdge.maximumRunRatio >= 0.04);
  });

  test(`rejects a capped ${side} sleeve while an unrelated weapon mask could remain`, () => {
    const arm = maskWith([
      [248, 188, 274, 240],
      [238, 172, 272, 202],
      [224, 150, 254, 185],
    ]);
    const capped = capArmIdMask(arm, width, height);
    const result = analyzeArmIdMask(capped, width, height, side);
    assert.equal(result.passed, false);
    assert.match(result.violations.join('\n'), /capped|lowerEdge|lowerCrop/u);
  });
}

test('rejects a thin connected arm-only tendril even when it reaches the final row', () => {
  const result = analyzeArmIdMask(maskWith([
    [245, 150, 275, 215],
    [258, 215, 261, 240],
  ]), width, height, 'left');
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /thinner/u);
});

test('rejects disconnected hand/cuff and sleeve components', () => {
  const result = analyzeArmIdMask(maskWith([
    [205, 130, 265, 184],
    [248, 188, 274, 240],
  ]), width, height, 'right');
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /bottom screen edge/u);
});
