import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperatorTargetTracker,
  createTemporalTargetTracker,
  findCoralTargets,
  findMinimapThreats,
  findOperatorCandidates,
  findPurpleOperatorCandidates,
  frameSignature,
  isCoralPixel,
  isOperatorPalettePixel,
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

test('operator palette isolates shaded Coral tactical material from orange props', () => {
  assert.equal(isOperatorPalettePixel(179, 77, 63), true);
  assert.equal(isOperatorPalettePixel(154, 110, 5), false);
  assert.equal(isOperatorPalettePixel(45, 120, 125), false);
});

test('dark-Coral geometry proposal accepts a narrow swatch and rejects a pole and orange crate', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 48, 22, 50, 28, [179, 77, 63]);
  // Break three pixels so the component is not a perfectly solid UI-like bar.
  for (const [x, y] of [[48, 22], [50, 22], [48, 28]]) paint(raw, width, x, y, x, y, [18, 18, 18]);
  paint(raw, width, 65, 21, 65, 30, [179, 77, 63]);
  paint(raw, width, 35, 24, 44, 31, [154, 110, 5]);
  const targets = findOperatorCandidates(raw, width, height, 3, { minimumPixels: 8 });
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(targets[0].x - 49) < 0.2);
  assert.equal(targets[0].detector, 'operator-palette-geometry-v1');
});

test('operator detector abstains during a global red damage flash', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 0, 0, width - 1, height - 1, [140, 60, 50]);
  const targets = findOperatorCandidates(raw, width, height, 3);
  assert.equal(targets.length, 0);
  assert.equal(targets.rejectedReason, 'global-red-flash');
  assert.ok(targets.paletteRatio > 0.9);
});

test('purple operator detector isolates magenta body geometry from Aqua and red props', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 47, 27, 53, 35, [150, 95, 175]);
  paint(raw, width, 70, 25, 80, 38, [30, 160, 180]);
  paint(raw, width, 25, 27, 28, 38, [145, 55, 20]);
  const targets = findPurpleOperatorCandidates(raw, width, height, 3);
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(targets[0].x - 50) < 0.1);
  assert.equal(targets[0].detector, 'pass63-visible-purple-operator-v1');
});

test('visible player-up minimap markers yield a closed-loop relative bearing', () => {
  const width = 320;
  const height = 180;
  const raw = frame(width, height);
  // Player anchor is approximately (49.6, 97.2); this marker is ahead-right.
  paint(raw, width, 57, 56, 58, 57, [222, 62, 72]);
  const threats = findMinimapThreats(raw, width, height, 3);
  assert.equal(threats.length, 1);
  assert.ok(threats[0].deltaX > 7);
  assert.ok(threats[0].deltaY < -39);
  assert.ok(threats[0].bearingRadians > 0 && threats[0].bearingRadians < 0.4);
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

test('operator tracker rejects static geometry after a scan-stop observation', () => {
  const tracker = createOperatorTargetTracker({ settlingFrames: 2, requiredEvidenceFrames: 1, maximumObservationFrames: 4 });
  const target = [{ x: 50, y: 40, pixels: 18, score: 0, bounds: { width: 3, height: 7 } }];
  tracker.update(target, { width: 100, height: 60, active: true, cameraMoved: true, movementMoved: true });
  let result;
  for (let index = 0; index < 4; index += 1) {
    result = tracker.update(target, { width: 100, height: 60, active: true, cameraMoved: false, movementMoved: false });
  }
  assert.equal(result.reason, 'static-geometry-rejected');
  assert.equal(result.fireAuthorized, false);
});

test('operator tracker authorises a changing candidate only after settling and repeated evidence', () => {
  const tracker = createOperatorTargetTracker();
  const target = (x, pixels) => [{ x, y: 40, pixels, score: 0, bounds: { width: 3, height: 7 } }];
  tracker.update(target(50, 18), { width: 100, height: 60, active: true, cameraMoved: true, movementMoved: true });
  for (let index = 0; index < 4; index += 1) {
    const warming = tracker.update(target(50, 18), { width: 100, height: 60, active: true, cameraMoved: false, movementMoved: false });
    assert.equal(warming.fireAuthorized, false);
  }
  const firstEvidence = tracker.update(target(51, 20), { width: 100, height: 60, active: true, cameraMoved: false, movementMoved: false });
  assert.equal(firstEvidence.fireAuthorized, false);
  const result = tracker.update(target(52, 22), { width: 100, height: 60, active: true, cameraMoved: false, movementMoved: false });
  assert.equal(result.reason, 'operator-motion-confirmed');
  assert.equal(result.fireAuthorized, true);
  assert.equal(result.confirmedTarget.x, 52);
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
