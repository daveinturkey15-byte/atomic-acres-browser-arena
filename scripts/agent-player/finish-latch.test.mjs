import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFinishLatch, consumeFinishFollowup } from './finish-latch.mjs';

const sameTarget = (previous, current) => previous?.id === current?.id ? current : null;

test('visible damage activates one absolute non-extending same-target latch', () => {
  const first = advanceFinishLatch({
    active: true,
    now: 1000,
    atMs: 5000,
    currentTarget: { id: 'RIVET', x: 10 },
    lastBurstTarget: { id: 'RIVET', x: 9 },
    visibleDamageDealtDelta: 31,
    lastBurstAt: 900,
    durationMs: 1200,
    followupLimit: 2,
    associate: sameTarget,
  });
  assert.equal(first.event.kind, 'activate');
  assert.equal(first.latch.expiresAt, 2200);

  const laterDamage = advanceFinishLatch({
    latch: first.latch,
    active: true,
    now: 1500,
    atMs: 5500,
    currentTarget: { id: 'RIVET', x: 11 },
    lastBurstTarget: { id: 'RIVET', x: 10 },
    visibleDamageDealtDelta: 31,
    lastBurstAt: 1400,
    durationMs: 1200,
    followupLimit: 2,
    associate: sameTarget,
  });
  assert.equal(laterDamage.latch.expiresAt, 2200);
  assert.equal(laterDamage.event, null);
});

test('finish latch permits at most two followups', () => {
  let latch = { activatedAtMs: 100, expiresAt: 2200, followupsRemaining: 2, target: { id: 'RIVET' } };
  let consumed = consumeFinishFollowup(latch, 1200);
  assert.equal(consumed.finishFollowup, true);
  latch = consumed.latch;
  consumed = consumeFinishFollowup(latch, 1600);
  assert.equal(consumed.finishFollowup, true);
  latch = consumed.latch;
  consumed = consumeFinishFollowup(latch, 1800);
  assert.equal(consumed.finishFollowup, false);
  assert.equal(consumed.latch.followupsRemaining, 0);
});

test('kill, timeout and identity change cancel the latch', () => {
  const latch = { activatedAtMs: 100, expiresAt: 2200, followupsRemaining: 2, target: { id: 'RIVET' } };
  const killed = advanceFinishLatch({ latch, active: true, now: 1200, visibleKillDelta: 1, currentTarget: { id: 'RIVET' }, followupLimit: 2, associate: sameTarget });
  assert.equal(killed.latch, null);
  assert.equal(killed.event.reason, 'visible-kill');

  const changed = advanceFinishLatch({ latch, active: true, now: 1200, currentTarget: { id: 'MICA' }, followupLimit: 2, associate: sameTarget });
  assert.equal(changed.latch, null);
  assert.equal(changed.event.reason, 'identity-ambiguity');

  const timedOut = advanceFinishLatch({ latch, active: true, now: 2200, currentTarget: { id: 'RIVET' }, followupLimit: 2, associate: sameTarget });
  assert.equal(timedOut.latch, null);
  assert.equal(timedOut.event.reason, 'absolute-timeout');
});
