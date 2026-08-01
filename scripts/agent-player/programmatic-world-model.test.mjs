import assert from 'node:assert/strict';

import { evaluateRespawnWorldModel } from './programmatic-world-model.mjs';

const common = {
  now: 100_000,
  priorQuickDeathStreak: 0,
  quickDeathWindowMs: 30_000,
  baseEscapeDurationMs: 0,
  quickDeathEscapeBonusMs: 1_600,
  quickDeathCooldownMs: 6_000,
  reentryDurationMs: 2_000,
};

const quick = evaluateRespawnWorldModel({ ...common, previousLifeAgeMs: 12_000 });
assert.equal(quick.useModel, true);
assert.equal(quick.transition.quickDeathStreak, 1);
assert.equal(quick.render.expectedMode, 'respawn-escape');
assert.equal(quick.render.escapeDurationMs, 1_600);
assert.equal(quick.render.reentryDurationMs, 2_000);
assert.equal(quick.transition.nextCooldownUntil, 107_600);
assert.deepEqual(quick.outcome.invalidateOn, ['visible-target', 'new-damage', 'death', 'match-end']);

const healthy = evaluateRespawnWorldModel({ ...common, previousLifeAgeMs: 45_000 });
assert.equal(healthy.useModel, false);
assert.equal(healthy.transition.quickDeathStreak, 0);
assert.equal(healthy.render.expectedMode, 'roam');
assert.equal(healthy.render.escapeDurationMs, 0);

const repeated = evaluateRespawnWorldModel({
  ...common,
  previousLifeAgeMs: 8_000,
  priorQuickDeathStreak: 1,
});
assert.equal(repeated.useModel, true);
assert.equal(repeated.transition.quickDeathStreak, 2);
assert.equal(repeated.render.escapeDurationMs, 3_200);
assert.equal(repeated.transition.nextCooldownUntil, 109_200);

console.log('programmatic-world-model tests passed');
