import { describe, expect, it } from 'vitest';
import {
  createGuestCombatInventory,
  createGuestCombatInventoryProjection,
} from './guest-combat-inventory-authority';
import {
  applyRemoteInventoryProjectionToMaps,
  applyRemoteReloadResult,
  createCanonicalRemoteState,
} from './multiplayer-relay';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type ReloadResultMessage } from './protocol';

function snapshot(id: string, weapon: PlayerSnapshot['weapon']): PlayerSnapshot {
  return {
    id, name: id, team: 0, x: 1, y: 1, z: 1, yaw: 0, pitch: 0, hp: 100,
    kills: 0, deaths: 0, primary: 'm4a1', secondary: 'pistol', grenade: 'frag', weapon, seq: 4,
  };
}

describe('host-authoritative multiplayer relay', () => {
  it('carries guest A swap through host admission into guest B view', () => {
    const guestA = snapshot('guest-a', 'pistol');
    const hostState = createCanonicalRemoteState(
      guestA, 500, 1, 40,
      createGuestCombatInventoryProjection(createGuestCombatInventory('m4a1', 'pistol', 1), 2, 'm4a1', 'pistol'),
    );
    const guestBView = snapshot('guest-a', 'm4a1');
    const inventories = new Map([['guest-a', createGuestCombatInventory('m4a1', 'pistol', 1)]]);
    const revisions = new Map([['guest-a', 0]]);

    guestBView.weapon = hostState.player.weapon;
    const applied = applyRemoteInventoryProjectionToMaps(
      inventories, revisions, 'guest-a', hostState.combatInventory!, hostState.player, 'pistol',
    );

    expect(applied).toBe(true);
    expect(guestBView.weapon).toBe('pistol');
    expect(inventories.get('guest-a')?.ammo.pistol).toBe(15);
  });

  it('carries host reload state and ammo into the observer ledger', () => {
    const remote = snapshot('guest-a', 'm4a1');
    const authority = createGuestCombatInventory('m4a1', 'pistol', 1);
    const message: ReloadResultMessage = {
      type: 'reload-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'guest-a', connectionEpoch: 'epoch-1', lifeId: 1,
      actionSequence: 3, requestId: 'reload-3', weapon: 'm4a1', status: 'started', reason: 'accepted',
      completesAtHostTimeMs: 700, shotSequenceWatermark: 2,
      combatInventory: {
        revision: 4,
        primary: { weapon: 'm4a1', ammo: 30, reserve: 67 },
        sidearm: { weapon: 'pistol', ammo: 12, reserve: 48 },
        grenades: 1,
      },
      nonce: 4,
    };
    const started = applyRemoteReloadResult(remote, authority, message, 'pistol');

    expect(started?.snapshot).toMatchObject({ weapon: 'm4a1', reloading: true });
    expect(started?.inventory).toMatchObject({ ammo: { m4a1: 30, pistol: 12 }, reserve: { m4a1: 67, pistol: 48 } });
  });
});
