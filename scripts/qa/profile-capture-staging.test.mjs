import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freezeActiveProfileCapture, prepareProfileCapture, readHealthyProfileCapture } from './lib/profile-capture-staging.mjs';

function fixture(overrides = {}) {
  const state = { gameStarted: true, matchPhase: 'active', player: { hp: 100, alive: true, deaths: 0 }, ...overrides };
  let frozen = false;
  let hidden = false;
  const prior = globalThis.window;
  globalThis.window = { __ATOMIC_ACRES_DEBUG__: {
    snapshot: () => structuredClone(state),
    setBotsFrozen: (value) => { frozen = value; },
    setCaptureViewmodelHidden: (value) => { hidden = value; },
  } };
  return { state, get frozen() { return frozen; }, get hidden() { return hidden; },
    close: () => { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; } };
}

test('freezes admitted bots before settle can cause the observed damage tint', async () => {
  const f = fixture();
  try {
    const page = {
      waitForFunction: async (fn) => assert.equal(fn(), true),
      evaluate: async (fn) => fn(),
      waitForTimeout: async () => { if (!f.frozen) f.state.player.hp = 80; },
    };
    const receipt = await prepareProfileCapture(page, 5000, 180000);
    assert.equal(receipt.beforeSettle.hp, 100);
    assert.equal(receipt.afterSettle.hp, 100);
    assert.equal(f.hidden, true);
  } finally { f.close(); }
});

test('waits for match admission before applying the freeze that initialization resets', () => {
  const f = fixture({ matchPhase: 'loading', gameStarted: false });
  try {
    assert.equal(freezeActiveProfileCapture(), false);
    assert.equal(f.frozen, false);
  } finally { f.close(); }
});

for (const player of [undefined, { hp: 80, alive: true, deaths: 0 },
  { hp: 100, alive: false, deaths: 0 }, { hp: 100, alive: true, deaths: 1 }]) {
  test(`rejects contaminated or unavailable player ${JSON.stringify(player)}`, () => {
    const f = fixture({ player });
    try { assert.throws(readHealthyProfileCapture, /capture contaminated/); }
    finally { f.close(); }
  });
}

test('rejects damage during settle instead of healing or silently accepting it', async () => {
  const f = fixture();
  try {
    const page = { waitForFunction: async (fn) => fn(), evaluate: async (fn) => fn(),
      waitForTimeout: async () => { f.state.player.hp = 80; } };
    await assert.rejects(prepareProfileCapture(page, 5000, 180000), /capture contaminated/);
    assert.equal(f.state.player.hp, 80);
  } finally { f.close(); }
});
