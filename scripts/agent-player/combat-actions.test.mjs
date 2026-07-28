import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVisibleSupport, parseVisibleCount, shouldThrowVisibleGrenade } from './combat-actions.mjs';

test('visible HUD counts parse grenade and streak labels', () => {
  assert.equal(parseVisibleCount('FRAG ×2'), 2);
  assert.equal(parseVisibleCount('STREAK 4'), 4);
  assert.equal(parseVisibleCount('LOCKED'), null);
});

test('support activation chooses the highest visibly earned unused tier', () => {
  assert.deepEqual(chooseVisibleSupport(4, new Set()), { threshold: 4, code: 'Digit4', name: 'YARDHAWK' });
  assert.deepEqual(chooseVisibleSupport(4, new Set([4])), { threshold: 3, code: 'Digit3', name: 'SCOUT SWEEP' });
  assert.equal(chooseVisibleSupport(2, new Set()), null);
});

test('grenade authority requires a healthy aligned confirmed operator at bounded distance', () => {
  const valid = {
    enabled: true, grenades: 2, throwsSoFar: 0, maximumThrows: 2,
    active: true, targetConfirmed: true, twoFrameAligned: true,
    stableFrames: 3, alignment: 0.006, health: 80, threatDistance: 16,
    now: 30_000, lastThrowAt: 0,
  };
  assert.equal(shouldThrowVisibleGrenade(valid), true);
  assert.equal(shouldThrowVisibleGrenade({ ...valid, threatDistance: null, targetHeight: 9 }), true);
  assert.equal(shouldThrowVisibleGrenade({ ...valid, threatDistance: null, targetHeight: 5 }), false);
  for (const mutation of [
    { targetConfirmed: false }, { twoFrameAligned: false }, { alignment: 0.009 },
    { health: 40 }, { threatDistance: 30 }, { grenades: 0 }, { throwsSoFar: 2 },
    { now: 10_000 },
  ]) assert.equal(shouldThrowVisibleGrenade({ ...valid, ...mutation }), false);
});
