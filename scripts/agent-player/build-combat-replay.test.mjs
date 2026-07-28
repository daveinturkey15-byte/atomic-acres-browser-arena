import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombatReplay, parseMatchSeconds, reticleInsideBounds } from './build-combat-replay.mjs';

test('parseMatchSeconds parses official timeline timestamps', () => {
  assert.equal(parseMatchSeconds('00:36.3'), 36.3);
  assert.equal(parseMatchSeconds('04:59.9'), 299.9);
  assert.throws(() => parseMatchSeconds('invalid'));
});

test('reticleInsideBounds supports an eroded visible-target gate', () => {
  const bounds = { minX: 156, minY: 84, maxX: 164, maxY: 96 };
  assert.equal(reticleInsideBounds(bounds), true);
  assert.equal(reticleInsideBounds(bounds, 160, 90, 3), true);
  assert.equal(reticleInsideBounds({ minX: 160, minY: 89, maxX: 164, maxY: 94 }, 160, 90, 1), false);
  assert.equal(reticleInsideBounds(null), false);
});

test('G0031 replay preserves all four kills under strict-or-inset1 geometry', async () => {
  const replay = await buildCombatReplay(['G0031']);
  const game = replay.games[0];
  assert.equal(game.result.kills, 4);
  assert.equal(game.summary.all.shots, 26);
  assert.equal(game.summary.strictOrInset1.matchedKills, 4);
  assert.equal(game.summary.strictOrInset1.matchedHitRatePercent, 66.7);
});

test('G0059 SMG baseline is unchanged by strict-or-inset1 geometry', async () => {
  const replay = await buildCombatReplay(['G0059']);
  const game = replay.games[0];
  assert.equal(game.summary.all.shots, 9);
  assert.deepEqual(game.summary.strictOrInset1, game.summary.all);
  assert.equal(game.result.accuracyPercent, 55.6);
});
