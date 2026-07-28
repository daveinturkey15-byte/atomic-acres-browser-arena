import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findOperatorCandidates } from './vision.mjs';

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function detect(name) {
  const jpeg = await readFile(resolve(fixtureDirectory, name));
  const { data, info } = await sharp(jpeg)
    .resize({ width: 320, height: 180, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return findOperatorCandidates(data, info.width, info.height, info.channels);
}

test('Pass 63 archived operator fixtures produce aimable dark-Coral components', async () => {
  const centre = await detect('pass63-true-operator-centre.jpg');
  assert.equal(centre.length, 1);
  assert.ok(Math.abs(centre[0].x - 170.1) < 0.5);
  assert.ok(Math.abs(centre[0].y - 104.2) < 0.5);
  assert.deepEqual(centre[0].bounds, { minX: 169, minY: 101, maxX: 171, maxY: 107, width: 3, height: 7 });

  const right = await detect('pass63-true-operator-right.jpg');
  assert.equal(right.length, 2);
  assert.ok(Math.abs(right[0].x - 213.9) < 0.5);
  assert.ok(Math.abs(right[0].y - 107.4) < 0.5);
  assert.equal(right[0].bounds.width, 5);
  assert.equal(right[1].bounds.width, 2);
});

test('Pass 63 archived tree/scenery fixture does not become an operator', async () => {
  const targets = await detect('pass63-tree-and-props-negative.jpg');
  assert.equal(targets.length, 0);
  assert.equal(targets.rejectedReason, null);
});

test('Pass 63 archived red damage flash forces detector abstention', async () => {
  const targets = await detect('pass63-red-damage-flash-negative.jpg');
  assert.equal(targets.length, 0);
  assert.equal(targets.rejectedReason, 'global-red-flash');
  assert.ok(targets.paletteRatio > 0.25);
});
