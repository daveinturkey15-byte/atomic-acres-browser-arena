import test from 'node:test';
import assert from 'node:assert/strict';
import { captureReloadTrigger } from './reload-trigger-identity.mjs';

function fixture({ saturated = false, localStarts = 1, resultOnly = false } = {}) {
  const rows = Array.from({ length: saturated ? 128 : 0 }, (_, i) => ({
    actorId: 'guest', requestId: `old-${i}`, actionSequence: i, direction: 'send', action: 'start',
    status: 'requested', reason: 'reliable-retry-lane', atMs: 0,
  }));
  const initial = { player: { id: 'guest', hp: 100, alive: true, ammo: 29 },
    killstreak: { matchEpoch: 5, actors: [{ actorId: 'guest', lifeId: 3 }] },
    privateMatch: { scores: [{ id: 'guest', deaths: 1 }] }, networkSync: { localContinuity: 3 },
    reloadAuthority: { localIdentity: { connectionEpoch: 'initial-connection' }, protocolTrace: rows } };
  let fired = false;
  const debug = {
    reload() { fired = true; },
    snapshot() {
      if (!fired) return initial;
      const added = Array.from({ length: localStarts }, (_, i) => ({
        actorId: 'guest', requestId: `new-${i}`, actionSequence: 128 + i,
        action: resultOnly ? 'result' : 'start', direction: 'send',
        status: resultOnly ? 'committed' : 'requested', reason: resultOnly ? 'committed' : 'reliable-retry-lane',
        atMs: Math.round(performance.now()), lifeId: 99, connectionEpoch: 'result-connection',
      }));
      return { ...initial, player: { ...initial.player, reloading: true },
        reloadAuthority: { localIdentity: { connectionEpoch: 'after-connection' }, protocolTrace: [...rows, ...added].slice(-128) } };
    },
  };
  return debug;
}

test('expected connection/life/epoch are sampled before the trigger, independently of results', () => {
  globalThis.window = { __ATOMIC_ACRES_DEBUG__: fixture() };
  try {
    const r = captureReloadTrigger();
    assert.equal(r.beforeLife.connectionEpoch, 'initial-connection');
    assert.equal(r.beforeLife.lifeId, 3);
    assert.equal(r.beforeLife.epoch, 5);
    assert.equal(r.afterLife.connectionEpoch, 'after-connection');
    assert.equal(r.requestId, 'new-0');
    assert.equal(r.actionSequence, 128);
  } finally { delete globalThis.window; }
});

test('saturated 128-row ring still yields exactly one newly authored local start', () => {
  globalThis.window = { __ATOMIC_ACRES_DEBUG__: fixture({ saturated: true }) };
  try { const r = captureReloadTrigger(); assert.equal(r.localStartCount, 1); assert.equal(r.requestId, 'new-0'); }
  finally { delete globalThis.window; }
});

test('missing or ambiguous local starts never borrow a committed host result identity', () => {
  for (const options of [{ localStarts: 0 }, { localStarts: 2 }, { resultOnly: true }]) {
    globalThis.window = { __ATOMIC_ACRES_DEBUG__: fixture(options) };
    try { const r = captureReloadTrigger(); assert.equal(r.requestId, null); assert.equal(r.actionSequence, null); }
    finally { delete globalThis.window; }
  }
});
