import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { stageReloadAmmo } from './mp-audit.mjs';

function peers({ hostHook = true, changeHost = true, hostWeapon = 'rifle' } = {}) {
  const calls = [];
  const guestState = { player: { id: 'guest-under-test', weapon: 'rifle', ammo: 30 }, remotePlayers: [] };
  const remote = { id: 'guest-under-test', weapon: hostWeapon, combatInventory: { ammo: { rifle: 30 } } };
  const hostState = { player: { id: 'host', weapon: 'rifle', ammo: 30 }, remotePlayers: [remote] };
  const guestDebug = { snapshot: () => guestState, setAmmo: (weapon, ammo, reserve) => {
    calls.push(['guest', weapon, ammo, reserve]); guestState.player.ammo = ammo;
  } };
  const hostDebug = { snapshot: () => hostState };
  if (hostHook) hostDebug.setRemoteAmmoAuthoritatively = (weapon, ammo, reserve, id) => {
    calls.push(['host', weapon, ammo, reserve, id]);
    if (changeHost) remote.combatInventory.ammo[weapon] = ammo;
    return true;
  };
  // Execute the actual serialized page callbacks in isolated page globals.
  const page = debug => ({ evaluate: (fn, argument) => Promise.resolve(vm.runInNewContext(`(${fn.toString()})(argument)`, {
    window: { __ATOMIC_ACRES_DEBUG__: debug }, argument, performance: { now: () => 0 },
    document: { querySelector: () => null, querySelectorAll: () => [] },
  })) });
  return { guest: { page: page(guestDebug) }, host: { page: page(hostDebug) }, calls };
}

test('stages the actual target on the host and guest before accepting reload setup', async () => {
  const p = peers();
  const receipt = await stageReloadAmmo(p.guest, p.host, 'guest-under-test');
  assert.equal(receipt.verified, true);
  assert.equal(receipt.guestAmmo, 1);
  assert.equal(receipt.hostAmmo, 1);
  assert.deepEqual(p.calls, [['host', 'rifle', 1, 90, 'guest-under-test'], ['guest', 'rifle', 1, 90]]);
});
test('refuses a missing host hook before changing the local magazine', async () => {
  const p = peers({ hostHook: false });
  await assert.rejects(stageReloadAmmo(p.guest, p.host, 'guest-under-test'), /host-authoritative magazine/);
  assert.equal(p.calls.length, 0);
});
test('refuses a successful hook response when the authoritative magazine stayed full', async () => {
  const p = peers({ changeHost: false });
  await assert.rejects(stageReloadAmmo(p.guest, p.host, 'guest-under-test'), /matching weapon and depleted magazines/);
});
test('refuses a different held weapon on the authority', async () => {
  const p = peers({ hostWeapon: 'pistol' });
  await assert.rejects(stageReloadAmmo(p.guest, p.host, 'guest-under-test'), /matching weapon and depleted magazines/);
});
