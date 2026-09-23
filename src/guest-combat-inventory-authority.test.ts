import { describe, expect, it } from 'vitest';
import {
  captureGuestCombatInventory,
  captureGuestCombatInventoryProjection,
  admitLocalShotInventoryRepair,
  applyGuestCombatInventoryProjection,
  consumeGuestCombatRound,
  createGuestCombatInventory,
  createGuestCombatInventoryProjection,
  guestCombatInventoryCanFire,
  guestCombatInventoryWithinWeaponCaps,
  reconcileGuestCombatInventoryProjection,
  reapplyPendingShotPredictions,
  setGuestCombatInventoryGrenades,
  setGuestCombatInventoryWeapon,
} from './guest-combat-inventory-authority';
import { MULTIPLAYER_PROTOCOL_VERSION, ORDINARY_WEAPON_IDS, WEAPON_IDS, isGuestCombatInventory, type ShotResultMessage, type WeaponId } from './protocol';
import { WEAPONS } from './gameplay';

const fullCounters = (field: 'mag' | 'reserve'): Record<WeaponId, number> => Object.fromEntries(
  WEAPON_IDS.map((weapon) => [weapon, WEAPONS[weapon][field]]),
) as Record<WeaponId, number>;

describe('host-owned guest combat inventory', () => {
  it('captures an exact bounded ordinary inventory with no special-weapon authority', () => {
    const ammo = fullCounters('mag');
    const reserve = fullCounters('reserve');
    ammo.sniper = 3;
    reserve.sniper = 11;
    const inventory = captureGuestCombatInventory(ammo, reserve, 0);
    expect(isGuestCombatInventory(inventory)).toBe(true);
    expect(inventory).toMatchObject({ ammo: { sniper: 3 }, reserve: { sniper: 11 }, grenades: 0 });
    expect(Object.keys(inventory.ammo)).toEqual(ORDINARY_WEAPON_IDS);
  });

  it('treats state projections as observations and rejects client-selected reload splits', () => {
    const authority = createGuestCombatInventory('sniper', 'machine-pistol', 0);
    const afterShots = consumeGuestCombatRound(consumeGuestCombatRound(authority, 'sniper'), 'sniper');
    const reloaded = {
      ammo: { ...afterShots.ammo, sniper: WEAPONS.sniper.mag },
      reserve: {
        ...afterShots.reserve,
        sniper: afterShots.ammo.sniper + afterShots.reserve.sniper - WEAPONS.sniper.mag,
      },
      grenades: 0 as const,
    };
    const reloadProjection = createGuestCombatInventoryProjection(reloaded, 8, 'sniper', 'machine-pistol');
    expect(reconcileGuestCombatInventoryProjection(
      afterShots, reloadProjection, 'sniper', 'machine-pistol', 0, 7, 8,
    )).toBeNull();
    expect(reconcileGuestCombatInventoryProjection(
      afterShots, createGuestCombatInventoryProjection(afterShots, 8, 'sniper', 'machine-pistol'),
      'sniper', 'machine-pistol', 0, 7, 8,
    )?.inventory).toBe(afterShots);
    expect(reconcileGuestCombatInventoryProjection(
      afterShots, reloadProjection, 'sniper', 'machine-pistol', 0, 8, 8,
    )).toBeNull();
    expect(reconcileGuestCombatInventoryProjection(
      afterShots,
      createGuestCombatInventoryProjection(authority, 9, 'sniper', 'machine-pistol'),
      'sniper', 'machine-pistol', 0, 8, 9,
    )).toBeNull();
    expect(reconcileGuestCombatInventoryProjection(
      afterShots,
      createGuestCombatInventoryProjection(setGuestCombatInventoryGrenades(afterShots, 1), 9, 'sniper', 'machine-pistol'),
      'sniper', 'machine-pistol', 0, 8, 9,
    )).toBeNull();
  });

  it('projects only the equipped ordinary pair with an exact state revision', () => {
    const selectedOnly = (sniper: number, sidearm: number) => new Proxy({} as Record<WeaponId, number>, {
      get: (_target, key) => {
        if (key === 'sniper') return sniper;
        if (key === 'machine-pistol') return sidearm;
        throw new Error(`unexpected full-catalog read: ${String(key)}`);
      },
    });
    const projection = captureGuestCombatInventoryProjection(
      selectedOnly(5, 20), selectedOnly(25, 80), 0, 41, 'sniper', 'machine-pistol',
    );
    expect(projection).toEqual({
      revision: 41,
      primary: { weapon: 'sniper', ammo: 5, reserve: 25 },
      sidearm: { weapon: 'machine-pistol', ammo: 20, reserve: 80 },
      grenades: 0,
    });
    expect(JSON.stringify(projection)).not.toContain('carbine');
    expect(JSON.stringify(projection).length).toBeLessThan(JSON.stringify(
      createGuestCombatInventory('sniper', 'machine-pistol', 0),
    ).length / 3);
  });

  it('consumes only a magazine round and never treats reserve as a loaded chamber', () => {
    const authority = createGuestCombatInventory('sniper', 'machine-pistol', 1);
    const emptyMagazine = {
      ammo: { ...authority.ammo, sniper: 0 },
      reserve: { ...authority.reserve, sniper: 5 },
      grenades: authority.grenades,
    };
    expect(guestCombatInventoryCanFire(emptyMagazine, 'sniper')).toBe(false);
    expect(consumeGuestCombatRound(emptyMagazine, 'sniper')).toEqual(emptyMagazine);
    expect(guestCombatInventoryCanFire(authority, 'sniper')).toBe(true);
    expect(consumeGuestCombatRound(authority, 'sniper').ammo.sniper).toBe(authority.ammo.sniper - 1);
    expect(guestCombatInventoryCanFire(authority, 'railgun')).toBe(false);
  });

  it('converges rejected shot, host reload, and later fire without a stale refill race', () => {
    const rejected: ShotResultMessage = {
      type: 'shot-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'guest', shotId: 'connection_epoch:0',
      connectionEpoch: 'connection_epoch', lifeId: 4, shotSeq: 0, weapon: 'm4a1',
      status: 'rejected', reason: 'bad-origin', fireTimeMs: 1_000, targetViewTimeMs: 980,
      receivedAtHostTimeMs: 1_010, resolvedAtHostTimeMs: 1_011, appliedRewindMs: 20,
      combatInventory: {
        revision: 0,
        primary: { weapon: 'm4a1', ammo: 7, reserve: 90 },
        sidearm: { weapon: 'pistol', ammo: 12, reserve: 48 },
        grenades: 1,
      },
      outcomes: [], nonce: 10,
    };
    const pending = {
      playerId: 'guest', shotId: rejected.shotId, connectionEpoch: rejected.connectionEpoch,
      lifeId: rejected.lifeId, shotSeq: rejected.shotSeq, weapon: 'm4a1' as const,
    };
    expect(admitLocalShotInventoryRepair(rejected, pending, { lastShotSeq: -1, authorityRevision: 0 })).toBe(true);
    // Local prediction had 6. The rejected receipt restores canonical 7; the
    // later host reload commits 30/67, then accepted shot 2 commits 29/67.
    let counters = { ammo: 6, reserve: 90 };
    counters = { ammo: rejected.combatInventory!.primary.ammo, reserve: rejected.combatInventory!.primary.reserve };
    const reloadReceipt = createGuestCombatInventoryProjection(
      setGuestCombatInventoryWeapon(createGuestCombatInventory('m4a1', 'pistol'), 'm4a1', 30, 67),
      1,
      'm4a1',
      'pistol',
    );
    const reloadPresentation = reapplyPendingShotPredictions(reloadReceipt, [{
      connectionEpoch: 'connection_epoch', lifeId: 4, shotSeq: 1, weapon: 'm4a1',
    }], {
      connectionEpoch: 'connection_epoch', lifeId: 4, shotSequenceWatermark: 0,
    });
    counters = { ammo: reloadPresentation.primary.ammo, reserve: reloadPresentation.primary.reserve };
    expect(counters).toEqual({ ammo: 29, reserve: 67 });
    const later = {
      ...rejected,
      shotId: 'connection_epoch:2', shotSeq: 2, status: 'accepted-miss' as const, reason: 'none' as const,
      combatInventory: { ...rejected.combatInventory!, revision: 2, primary: { weapon: 'm4a1' as const, ammo: 29, reserve: 67 } },
      nonce: 12,
    };
    expect(admitLocalShotInventoryRepair(later, { ...pending, shotId: later.shotId, shotSeq: 2 }, {
      lastShotSeq: 0, authorityRevision: 1,
    })).toBe(true);
    counters = { ammo: later.combatInventory.primary.ammo, reserve: later.combatInventory.primary.reserve };
    expect(counters).toEqual({ ammo: 29, reserve: 67 });
    expect(admitLocalShotInventoryRepair(rejected, pending, { lastShotSeq: 2, authorityRevision: 2 })).toBe(false);
  });

  it('moves a primary swap atomically while preserving the sidearm and grenade ledger', () => {
    const before = createGuestCombatInventory('sniper', 'machine-pistol', 0);
    const relinquished = setGuestCombatInventoryWeapon(before, 'sniper', 0, 0);
    const swapped = setGuestCombatInventoryWeapon(relinquished, 'm4a1', 17, 43);
    expect(swapped).toMatchObject({
      ammo: { sniper: 0, 'm4a1': 17, 'machine-pistol': 20 },
      reserve: { sniper: 0, 'm4a1': 43, 'machine-pistol': 80 },
      grenades: 0,
    });
    expect(guestCombatInventoryWithinWeaponCaps(swapped)).toBe(true);
  });

  it('applies a host reload projection to a remote peer without granting client authority', () => {
    const authority = createGuestCombatInventory('m4a1', 'pistol', 1);
    const committed = setGuestCombatInventoryWeapon(authority, 'm4a1', 30, 67);
    const projection = {
      ...createGuestCombatInventoryProjection(committed, 4, 'm4a1', 'pistol'),
      sidearm: { weapon: 'pistol' as const, ammo: 12, reserve: 48 },
    };
    const guestBView = applyGuestCombatInventoryProjection(authority, projection, 'm4a1', 'pistol');

    expect(guestBView).toMatchObject({
      ammo: { m4a1: 30, pistol: 12 },
      reserve: { m4a1: 67, pistol: 48 },
      grenades: 1,
    });
    expect(applyGuestCombatInventoryProjection(authority, {
      ...projection,
      primary: { ...projection.primary, weapon: 'sniper' },
    }, 'm4a1', 'pistol')).toBeNull();
  });
});
