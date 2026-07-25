import test from 'node:test';
import assert from 'node:assert/strict';
import { findCoralTargets, isCoralPixel } from './vision.mjs';

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

test('Pass 63 minimap and top-HUD coral are ignored', () => {
  const width = 100;
  const height = 60;
  const raw = frame(width, height);
  paint(raw, width, 5, 18, 17, 38, [255, 116, 94]);
  paint(raw, width, 29, 22, 33, 28, [255, 116, 94]);
  paint(raw, width, 48, 2, 55, 7, [255, 116, 94]);
  assert.equal(findCoralTargets(raw, width, height, 3).length, 0);
});

test('large coral scenery is rejected as an implausible operator', () => {
  const width = 80;
  const height = 45;
  const raw = frame(width, height);
  paint(raw, width, 2, 5, 45, 35, [198, 109, 90]);
  assert.equal(findCoralTargets(raw, width, height, 3).length, 0);
});
