import test from 'node:test';
import assert from 'node:assert/strict';
import { associateRangeTarget, findCyanRangeTargets } from './range-target-vision.mjs';

function fixture() {
  const width = 320;
  const height = 180;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 68; y <= 80; y += 1) {
    for (let x = 144; x <= 156; x += 1) {
      if (Math.hypot(x - 150, y - 74) <= 6) {
        const i = (y * width + x) * 3;
        data[i] = 25; data[i + 1] = 185; data[i + 2] = 195;
      }
    }
  }
  return { data, width, height };
}

test('finds a rendered cyan circular range target in the world region', () => {
  const image = fixture();
  const targets = findCyanRangeTargets(image.data, image.width, image.height);
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(targets[0].x - 150) < 0.5);
  assert.ok(Math.abs(targets[0].y - 74) < 0.5);
});

test('excludes first-person cyan weapon fragments below the target lane', () => {
  const image = fixture();
  for (let y = 104; y <= 112; y += 1) {
    for (let x = 156; x <= 164; x += 1) {
      const i = (y * image.width + x) * 3;
      image.data[i] = 20; image.data[i + 1] = 190; image.data[i + 2] = 205;
    }
  }
  const targets = findCyanRangeTargets(image.data, image.width, image.height);
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(targets[0].y - 74) < 0.5);
});

test('associates only a nearby causally newer range target', () => {
  const previous = { x: 150, y: 90 };
  assert.equal(associateRangeTarget(previous, [{ x: 153, y: 92 }], 6)?.target.x, 153);
  assert.equal(associateRangeTarget(previous, [{ x: 170, y: 90 }], 6), null);
});
