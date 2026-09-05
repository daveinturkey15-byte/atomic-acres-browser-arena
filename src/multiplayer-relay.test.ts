import { describe, expect, it } from 'vitest';
import {
  createGuestCombatInventory,
  createGuestCombatInventoryProjection,
} from './guest-combat-inventory-authority';
import {
  applyRemoteInventoryProjectionToMaps,
  createCanonicalRemoteState,
} from './multiplayer-relay';
import type { PlayerSnapshot } from './protocol';

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
});
