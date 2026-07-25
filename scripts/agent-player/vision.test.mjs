import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTemporalTargetTracker,
  findCoralTargets,
  frameSignature,
  isCoralPixel,
  signatureDifference,
} from './vision.mjs';

function frame(width, height) {
  return new Uint8Array(width * height * 3).fill(18);
}

function paint(raw, width, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * width + x) * 3;
      raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2];
    }
  }
}

test('coral mask accepts the Performance enemy palette and rejects aqua', () => {
  assert.equal(isCoralPixel(255, 116, 94), true);
  assert.equal(isCoralPixel(255, 176, 157), true);
  assert.equal(isCoralPixel(85, 216, 210), false);
  assert.equal(isCoralPixel(143, 255, 247), false);
});

test('nearest plausible central coral component wins without exposing game state', () => {
  const width = 80;
  const height = 45;
  const raw = frame(width, height);
  paint(raw, width, 37, 18, 42, 28, [255, 116, 94]);
  paint(raw, width, 5, 12, 10, 20, [255, 116, 94]);
  const targets = findCoralTargets(raw, width, height, 3, { minimumPixels: 4 });
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(targets[0].x - 39.5) < 0.1);
  assert.ok(Math.abs(targets[0].y - 23) < 0.1);
});

test('Pass 63 minimap and top-HUD coral are ignored without discarding lower-left world pixels', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 5, 18, 17, 30, [255, 116, 94]);
  paint(raw, width, 29, 22, 33, 28, [255, 116, 94]);
  paint(raw, width, 48, 2, 55, 7, [255, 116, 94]);
  paint(raw, width, 21, 34, 26, 45, [255, 116, 94]);
  const targets = findCoralTargets(raw, width, height, 3);
  assert.equal(targets.length, 1);
  assert.ok(targets[0].x < 39 && targets[0].y > 31);
});

test('large coral scenery is rejected as an implausible operator', () => {
  const width = 80;
  const height = 45;
  const raw = frame(width, height);
  paint(raw, width, 2, 5, 45, 35, [198, 109, 90]);
  assert.equal(findCoralTargets(raw, width, height, 3).length, 0);
});

test('Pass 63 top-right hostile-operator and damage notifications cannot become targets', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 70, 8, 78, 13, [255, 116, 94]);
  paint(raw, width, 81, 22, 90, 29, [255, 116, 94]);
  paint(raw, width, 45, 24, 50, 35, [255, 116, 94]);
  const targets = findCoralTargets(raw, width, height, 3);
  assert.equal(targets.length, 1);
  assert.ok(targets[0].x < 60);
});

test('temporal confirmation rejects inactive countdown and screen-locked HUD', () => {
  const tracker = createTemporalTargetTracker({ confirmationFrames: 3 });
  const target = (x) => [{ x, y: 40, pixels: 30, score: 0, bounds: { width: 4, height: 8 } }];
  assert.equal(tracker.update(target(50), { width: 100, height: 60, active: false }).reason, 'inactive-match');
  tracker.update(target(50), { width: 100, height: 60, active: true, cameraMoved: true });
  tracker.update(target(50), { width: 100, height: 60, active: true, cameraMoved: true });
  const locked = tracker.update(target(50), { width: 100, height: 60, active: true, cameraMoved: true });
  assert.equal(locked.confirmedTarget, null);
  assert.equal(locked.reason, 'screen-locked-overlay');
});

test('temporal confirmation accepts a plausible world track after camera motion', () => {
  const tracker = createTemporalTargetTracker({ confirmationFrames: 3 });
  const target = (x) => [{ x, y: 40, pixels: 30, score: 0, bounds: { width: 4, height: 8 } }];
  tracker.update(target(60), { width: 100, height: 60, active: true, cameraMoved: true });
  tracker.update(target(57), { width: 100, height: 60, active: true, cameraMoved: true });
  const confirmed = tracker.update(target(54), { width: 100, height: 60, active: true, cameraMoved: true });
  assert.equal(confirmed.reason, 'temporally-confirmed');
  assert.equal(confirmed.confirmedTarget.x, 54);
});

test('frame signatures detect visual motion without exposing world state', () => {
  const width = 80;
  const height = 45;
  const first = frame(width, height);
  const second = frame(width, height);
  paint(second, width, 20, 12, 60, 32, [200, 200, 200]);
  const firstSignature = frameSignature(first, width, height);
  assert.equal(signatureDifference(firstSignature, firstSignature), 0);
  assert.ok(signatureDifference(firstSignature, frameSignature(second, width, height)) > 20);
});
