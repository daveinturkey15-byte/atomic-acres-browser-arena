import { describe, expect, it } from 'vitest';
import { createGuestCombatInventory, setGuestCombatInventoryWeapon } from './guest-combat-inventory-authority';
import {
  admitGuestReloadIntent,
  advanceGuestReloadAuthority,
  createGuestReloadAuthorityState,
} from './guest-reload-authority';
import { MULTIPLAYER_PROTOCOL_VERSION, type ReloadIntentMessage } from './protocol';

const epoch = 'connection_epoch_a';
const intent = (actionSequence: number, action: 'start' | 'cancel' = 'start'): ReloadIntentMessage => ({
  type: 'reload-intent', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: 'guest-a', connectionEpoch: epoch,
  lifeId: 4, actionSequence, weapon: 'm4a1', action, nonce: 100 + actionSequence,
});

describe('guest reload authority', () => {
  it('does not transfer a single round until the host duration has elapsed', () => {
    const inventory = setGuestCombatInventoryWeapon(createGuestCombatInventory('m4a1', 'pistol'), 'm4a1', 7, 90);
    const admitted = admitGuestReloadIntent(createGuestReloadAuthorityState(epoch, 4), intent(0), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true,
      nowHostTimeMs: 1_000, durationMs: 2_400, inventory,
    });
    expect(admitted.accepted).toBe(true);

    const early = advanceGuestReloadAuthority(admitted.state, {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true,
      nowHostTimeMs: 3_399, inventory,
    });
    expect(early.status).toBe('pending');
    expect(early.inventory.ammo['m4a1']).toBe(7);
    expect(early.inventory.reserve['m4a1']).toBe(90);

    const committed = advanceGuestReloadAuthority(early.state, {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true,
      nowHostTimeMs: 3_400, inventory,
    });
    expect(committed.status).toBe('committed');
    expect(committed.inventory.ammo['m4a1']).toBe(30);
    expect(committed.inventory.reserve['m4a1']).toBe(67);
  });

  it('rejects replay, gaps, wrong life and wrong connection without consuming sequence authority', () => {
    const inventory = setGuestCombatInventoryWeapon(createGuestCombatInventory('m4a1', 'pistol'), 'm4a1', 7, 90);
    const base = createGuestReloadAuthorityState(epoch, 4);
    const gap = admitGuestReloadIntent(base, intent(1), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 0, durationMs: 2_000, inventory,
    });
    expect(gap.reason).toBe('action-sequence');
    const accepted = admitGuestReloadIntent(gap.state, intent(0), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 0, durationMs: 2_000, inventory,
    });
    expect(accepted.accepted).toBe(true);
    expect(admitGuestReloadIntent(accepted.state, intent(0), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 1, durationMs: 2_000, inventory,
    }).reason).toBe('action-sequence');
    expect(admitGuestReloadIntent(base, { ...intent(0), connectionEpoch: 'wrong_epoch' }, {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 0, durationMs: 2_000, inventory,
    }).reason).toBe('connection-epoch');
    expect(admitGuestReloadIntent(base, { ...intent(0), lifeId: 5 }, {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 0, durationMs: 2_000, inventory,
    }).reason).toBe('life-mismatch');
  });

  it('cancels before commit and cancels a pending transaction when weapon authority changes', () => {
    const inventory = setGuestCombatInventoryWeapon(createGuestCombatInventory('m4a1', 'pistol'), 'm4a1', 7, 90);
    const started = admitGuestReloadIntent(createGuestReloadAuthorityState(epoch, 4), intent(0), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 1_000, durationMs: 2_000, inventory,
    });
    const cancelled = admitGuestReloadIntent(started.state, intent(1, 'cancel'), {
      connectionEpoch: epoch, lifeId: 4, weapon: 'm4a1', alive: true, nowHostTimeMs: 1_100, durationMs: 2_000, inventory,
    });
    expect(cancelled.accepted).toBe(true);
    expect(cancelled.state.pending).toBeNull();
    expect(cancelled.state.lastActionSequence).toBe(1);

    const weaponChanged = advanceGuestReloadAuthority(started.state, {
      connectionEpoch: epoch, lifeId: 4, weapon: 'pistol', alive: true, nowHostTimeMs: 3_000, inventory,
    });
    expect(weaponChanged.status).toBe('cancelled');
    expect(weaponChanged.reason).toBe('weapon-mismatch');
    expect(weaponChanged.inventory).toBe(inventory);
  });
});
