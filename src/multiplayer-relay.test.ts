import { describe, expect, it } from 'vitest';
import {
  createGuestCombatInventory,
  createGuestCombatInventoryProjection,
} from './guest-combat-inventory-authority';
import {
  applyRemoteInventoryProjectionToMaps,
  applyRemoteReloadResult,
  clampAdmittedHeldWeapon,
  createCanonicalRemoteState,
} from './multiplayer-relay';
import { MULTIPLAYER_PROTOCOL_VERSION, isGameMessage, type PlayerSnapshot, type ReloadResultMessage } from './protocol';

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

  it('emits host-relayed guest states that observers accept at transport (HF-533)', () => {
    // The relay stamps the host inventory-event revision (2) while the live
    // snapshot sequence has moved on (179). Transport validation must accept
    // this shape or every relayed guest state is silently dropped and
    // guest-to-guest replication never converges.
    const guestA = { ...snapshot('guest-a', 'pistol'), seq: 179 };
    const hostState = createCanonicalRemoteState(
      guestA, 500, 3, 40,
      createGuestCombatInventoryProjection(createGuestCombatInventory('m4a1', 'pistol', 1), 2, 'm4a1', 'pistol'),
    );
    expect(hostState.combatInventory!.revision).not.toBe(hostState.player.seq);
    expect(isGameMessage(hostState)).toBe(true);
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

describe('F1 host allow-lists the guest-claimed equipped weapon', () => {
  it('clamps a forged ordinary weapon to the admitted primary before rebroadcast', () => {
    const forged = snapshot('guest-a', 'sniper');
    const admitted = clampAdmittedHeldWeapon(forged, 'pistol');

    expect(admitted.weapon).toBe('m4a1');
    // The forged claim can never become another peer's held weapon: guest B
    // renders exactly the host-admitted snapshot.
    const hostState = createCanonicalRemoteState(admitted, 500, 1, 40, null);
    const guestBView = snapshot('guest-a', 'm4a1');
    guestBView.weapon = hostState.player.weapon;
    expect(guestBView.weapon).toBe('m4a1');
  });

  it('keeps a legitimate swap within the admitted pair', () => {
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'pistol'), 'pistol').weapon).toBe('pistol');
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'm4a1'), 'pistol').weapon).toBe('m4a1');
  });

  it('preserves host-authorized specials and the personal crimson grant', () => {
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'railgun'), 'pistol').weapon).toBe('railgun');
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'flamethrower'), 'pistol').weapon).toBe('flamethrower');
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'flare-gun'), 'pistol').weapon).toBe('flare-gun');
    expect(clampAdmittedHeldWeapon(snapshot('guest-a', 'crimson-flamethrower'), 'pistol').weapon).toBe('crimson-flamethrower');
  });
});

describe('remote reload stale-revision guard', () => {
  function reloadMessage(revision: number, status: ReloadResultMessage['status']): ReloadResultMessage {
    return {
      type: 'reload-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'guest-a', connectionEpoch: 'epoch-1', lifeId: 1,
      actionSequence: 3, requestId: 'reload-3', weapon: 'm4a1', status, reason: 'accepted',
      completesAtHostTimeMs: 700, shotSequenceWatermark: 2,
      combatInventory: {
        revision,
        primary: { weapon: 'm4a1', ammo: 30, reserve: 67 },
        sidearm: { weapon: 'pistol', ammo: 12, reserve: 48 },
        grenades: 1,
      },
      nonce: 4,
    };
  }

  it('rejects a stale reload result below the stored revision without touching inventory or presentation', () => {
    const remote = snapshot('guest-a', 'pistol');
    const beforeRemote = structuredClone(remote);
    const inventories = new Map([['guest-a', createGuestCombatInventory('m4a1', 'pistol', 1)]]);
    const revisions = new Map([['guest-a', 8]]);
    const beforeInventory = inventories.get('guest-a');
    const outcome = applyRemoteReloadResult(remote, beforeInventory!, reloadMessage(7, 'committed'), 'pistol', revisions.get('guest-a') ?? -1);
    expect(outcome).toBeNull();
    expect(inventories.get('guest-a')).toBe(beforeInventory);
    expect(remote).toStrictEqual(beforeRemote);
    expect(remote.weapon).toBe('pistol');
  });

  it('accepts legitimate same-revision started and committed results', () => {
    const authority = createGuestCombatInventory('m4a1', 'pistol', 1);
    const started = applyRemoteReloadResult(snapshot('guest-a', 'pistol'), authority, reloadMessage(8, 'started'), 'pistol', 8);
    expect(started?.snapshot).toMatchObject({ weapon: 'm4a1', reloading: true });
    expect(started?.inventory).toMatchObject({ ammo: { m4a1: 30, pistol: 12 }, reserve: { m4a1: 67, pistol: 48 } });
    const committed = applyRemoteReloadResult(snapshot('guest-a', 'pistol'), authority, reloadMessage(8, 'committed'), 'pistol', 8);
    expect(committed?.snapshot).toMatchObject({ weapon: 'm4a1', reloading: false });
    expect(committed?.inventory).toMatchObject({ ammo: { m4a1: 30, pistol: 12 }, reserve: { m4a1: 67, pistol: 48 } });
  });

  it('accepts a newer reload result above the stored revision', () => {
    const authority = createGuestCombatInventory('m4a1', 'pistol', 1);
    const outcome = applyRemoteReloadResult(snapshot('guest-a', 'pistol'), authority, reloadMessage(9, 'committed'), 'pistol', 8);
    expect(outcome?.snapshot).toMatchObject({ weapon: 'm4a1', reloading: false });
    expect(outcome?.inventory).toMatchObject({ ammo: { m4a1: 30, pistol: 12 } });
  });
});
