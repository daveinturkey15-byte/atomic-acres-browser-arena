import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findPurpleOperatorCandidates } from './vision.mjs';

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function detect(name) {
  const jpeg = await readFile(resolve(fixtureRoot, name));
  const { data, info } = await sharp(jpeg)
    .resize({ width: 320, height: 180, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return findPurpleOperatorCandidates(data, info.width, info.height, info.channels);
}

test('Pass 63 live purple operators produce precise visible-pixel aim candidates', async () => {
  const rightA = await detect('pass63-purple-operator-right-a.jpg');
  assert.equal(rightA.length, 1);
  assert.ok(Math.abs(rightA[0].x - 240.2) < 0.5);
  assert.ok(Math.abs(rightA[0].y - 90.0) < 0.5);

  const rightB = await detect('pass63-purple-operator-right-b.jpg');
  assert.equal(rightB.length, 1);
  assert.ok(Math.abs(rightB[0].x - 235.4) < 0.5);
  assert.ok(Math.abs(rightB[0].y - 91.0) < 0.5);

  const left = await detect('pass63-purple-operator-left.jpg');
  assert.equal(left.length, 1);
  assert.ok(Math.abs(left[0].x - 140.7) < 0.5);
  assert.ok(Math.abs(left[0].y - 91.5) < 0.5);
  assert.equal(left[0].detector, 'pass63-visible-purple-operator-v1');
});

test('Pass 63 open scenery and prior red-post false positives do not become purple operators', async () => {
  const openScenery = await detect('pass63-no-purple-operator.jpg');
  assert.equal(openScenery.length, 0);
  const redPosts = await detect('pass63-tree-and-props-negative.jpg');
  assert.equal(redPosts.length, 0);
});

test('Pass 63 red damage flash forces purple-detector abstention', async () => {
  const damage = await detect('pass63-red-damage-flash-negative.jpg');
  assert.equal(damage.length, 0);
  assert.equal(damage.rejectedReason, 'global-red-flash');
  assert.ok(damage.redTintRatio > 0.3);
});
