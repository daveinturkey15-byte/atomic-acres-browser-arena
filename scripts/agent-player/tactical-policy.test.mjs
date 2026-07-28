import test from 'node:test';
import assert from 'node:assert/strict';
import { createTacticalPolicy } from './tactical-policy.mjs';

test('damage burst latches one retreat direction without per-hit oscillation', () => {
  const policy = createTacticalPolicy({ retreatDamage: 18 });
  const first = policy.update({ now: 1000, active: true, health: 90, damageDelta: 10, movementCycle: 0 });
  assert.equal(first.mode, 'roam');
  const second = policy.update({ now: 1200, active: true, health: 80, damageDelta: 10, movementCycle: 1 });
  assert.equal(second.mode, 'retreat');
  const direction = second.direction;
  const third = policy.update({ now: 1300, active: true, health: 75, damageDelta: 5, movementCycle: 2 });
  assert.equal(third.mode, 'retreat');
  assert.equal(third.direction, direction);
  assert.ok(third.keys.includes('KeyS'));
  assert.ok(third.keys.includes('ShiftLeft'));
});

test('recovery is bounded and cooldown prevents repeated stuck oscillation', () => {
  const policy = createTacticalPolicy({ recoveryDurationMs: 1000, recoveryCooldownMs: 4000 });
  const start = policy.update({ now: 1000, active: true, health: 100, stuck: true, movementCycle: 0 });
  assert.equal(start.mode, 'recover');
  assert.equal(Math.abs(start.turn), 92);
  const held = policy.update({ now: 1500, active: true, health: 100, stuck: true, movementCycle: 1 });
  assert.equal(held.mode, 'recover');
  assert.equal(held.turn, 0);
  const clear = policy.update({ now: 2200, active: true, health: 100, stuck: true, movementCycle: 2 });
  assert.equal(clear.mode, 'roam');
});

test('engagement stops translation except for a bounded post-shot strafe', () => {
  const policy = createTacticalPolicy({ postShotStrafeMs: 650 });
  const lock = policy.update({ now: 1000, active: true, health: 100, currentTarget: true, lastShotAt: -Infinity, movementCycle: 0 });
  assert.equal(lock.mode, 'engage');
  assert.deepEqual(lock.keys, []);
  assert.equal(lock.allowEngagement, true);
  const postShot = policy.update({ now: 1200, active: true, health: 100, currentTarget: true, lastShotAt: 1100, movementCycle: 1 });
  assert.equal(postShot.keys.length, 1);
});

test('close minimap threats produce lateral exposure control instead of rushing', () => {
  const policy = createTacticalPolicy({ closeThreatDistance: 18 });
  const result = policy.update({
    now: 1000,
    active: true,
    health: 100,
    movementCycle: 0,
    minimapThreat: { bearingRadians: 0.2, distance: 12 },
  });
  assert.equal(result.mode, 'roam');
  assert.deepEqual(result.keys, ['KeyA']);
});

test('low health vetoes engagement until retreat expires', () => {
  const policy = createTacticalPolicy({ retreatHealth: 45, retreatDurationMs: 1500 });
  const result = policy.update({ now: 1000, active: true, health: 40, damageDelta: 5, currentTarget: true, movementCycle: 0 });
  assert.equal(result.mode, 'retreat');
  assert.equal(result.allowEngagement, false);
});
