import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderedCoverController } from './rendered-cover-controller.mjs';

const target = { x: 90, pixels: 40, bounds: { width: 8, height: 12 } };
const cues = { left: { score: 0.05 }, right: { score: 0.22 } };

function active(now, overrides = {}) {
  return { now, active: true, health: 90, damageDelta: 0, width: 320, target, confirmedTarget: false, coverCues: cues, ...overrides };
}

test('rendered cover activates only after visible damage with a rendered target', () => {
  const controller = createRenderedCoverController({ enabled: true });
  assert.equal(controller.update(active(0)).active, false);
  const activated = controller.update(active(100, { damageDelta: 8 }));
  assert.equal(activated.mode, 'cover-probe');
  assert.deepEqual(activated.keys, ['KeyD', 'ShiftLeft']);
  assert.equal(activated.event.kind, 'activate');
  assert.equal(activated.event.direction, 1);
});

test('rendered occlusion plus quiet health acquires cover and enters a bounded peek-return cycle', () => {
  const controller = createRenderedCoverController({
    enabled: true,
    probeDurationMs: 1000,
    occlusionConfirmMs: 300,
    damageQuietMs: 400,
    holdDurationMs: 700,
    peekDurationMs: 400,
    returnDurationMs: 300,
  });
  controller.update(active(0, { damageDelta: 8 }));
  controller.update(active(200, { target: null }));
  const acquired = controller.update(active(500, { target: null }));
  assert.equal(acquired.mode, 'cover-hold');
  assert.equal(acquired.event.kind, 'acquire');
  assert.deepEqual(acquired.keys, []);
  assert.equal(acquired.allowScan, false);

  const peek = controller.update(active(1200, { target: null }));
  assert.equal(peek.mode, 'cover-peek');
  assert.deepEqual(peek.keys, ['KeyA']);
  const returning = controller.update(active(1300, { confirmedTarget: true }));
  assert.equal(returning.mode, 'cover-return');
  assert.equal(returning.event.reason, 'confirmed-target');
  assert.deepEqual(returning.keys, ['KeyD', 'ShiftLeft']);
  const heldAgain = controller.update(active(1600, { target: null }));
  assert.equal(heldAgain.mode, 'cover-hold');

  const receipt = controller.snapshot();
  assert.equal(receipt.activations, 1);
  assert.equal(receipt.acquisitions, 1);
  assert.ok(receipt.occlusionFrames > 0);
  assert.ok(receipt.peekFrames > 0);
  assert.ok(receipt.returnFrames > 0);
  assert.equal(receipt.confirmedPeekFrames, 1);
});

test('failed occlusion reverses once and then aborts instead of looping forever', () => {
  const controller = createRenderedCoverController({ enabled: true, probeDurationMs: 300, maximumProbeReversals: 1 });
  controller.update(active(0, { damageDelta: 8 }));
  const reversed = controller.update(active(300));
  assert.equal(reversed.event.kind, 'reverse');
  assert.deepEqual(reversed.keys, ['KeyA', 'ShiftLeft']);
  const aborted = controller.update(active(600));
  assert.equal(aborted.active, false);
  assert.equal(aborted.event.kind, 'abort');
  assert.equal(controller.snapshot().aborts, 1);
});

test('default-off controller never changes movement', () => {
  const controller = createRenderedCoverController();
  const result = controller.update(active(0, { damageDelta: 20 }));
  assert.equal(result.active, false);
  assert.deepEqual(result.keys, []);
  assert.equal(controller.snapshot().activations, 0);
});
