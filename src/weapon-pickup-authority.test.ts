import { describe, expect, it } from 'vitest';
import {
  PICKUP_RESEND_AFTER_MS,
  PICKUP_RESOLUTION_LIMIT,
  PICKUP_RESOLUTION_TTL_MS,
  PICKUP_REVERT_AFTER_MS,
  createPickupResolutionLedger,
  deathDropPayload,
  evaluatePickupGeometry,
  forgetPlayerPickupResolutions,
  pickupRequestKey,
  recallPickupResolution,
  rememberPickupResolution,
  stepPendingPickup,
  type PickupGeometryInput,
  type PickupResolution,
} from './weapon-pickup-authority';
import {
  DEATH_DROP_INTERACTION_RANGE,
  DEATH_DROP_SCAVENGE_RANGE,
  consumeDeathDropWeapon,
  createDeathDrop,
  placeSwappedDeathDrop,
} from './death-drops';
import { WEAPONS } from './gameplay';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

/**
 * PASS 95 - HF-504 ("cannot reload or pick up guns").
 *
 * Every test here is a claim about the HOST's decision, not about the renderer.
 * The host is the only authority: a guest's pickup request is untrusted input,
 * and each of these cases is one way a guest could be wrong, malicious, or
 * simply unlucky with a dropped datagram.
 */

const ADMISSIBLE: PickupGeometryInput = Object.freeze({
  mode: 'weapon',
  senderDistanceM: 0.2,
  dropDistanceM: 1.4,
  dropHorizontalDistanceM: 1.4,
  dropVerticalDistanceM: 0.1,
  insideBounds: true,
  sightBlocked: false,
  weaponRangeM: DEATH_DROP_INTERACTION_RANGE,
  scavengeRangeM: DEATH_DROP_SCAVENGE_RANGE,
});

const geometry = (patch: Partial<PickupGeometryInput>) =>
  evaluatePickupGeometry({ ...ADMISSIBLE, ...patch });

describe('HF-504 host pickup admission - request validation', () => {
  it('admits a request made in range, in bounds and in sight', () => {
    expect(geometry({})).toBeNull();
  });

  it('names the first failed guard in a fixed order so a rejection is diagnosable', () => {
    // All four guards fail at once. The reported reason must be the bounds
    // check, which is the outermost: a position outside the arena is not worth
    // measuring distances against.
    expect(geometry({
      insideBounds: false,
      senderDistanceM: 50,
      dropDistanceM: 50,
      sightBlocked: true,
    })).toBe('out-of-bounds');
  });

  it('rejects a request whose stamped position has drifted from the replicated sender', () => {
    // A guest that teleports its stamped position next to a distant gun while
    // its replicated body stays put is minting reach it does not have.
    expect(geometry({ senderDistanceM: 2.9 })).toBe('sender-distance');
    expect(geometry({ senderDistanceM: 2.8 })).toBeNull();
  });

  it('rejects a weapon pickup beyond the interaction radius plus one snapshot of slack', () => {
    expect(geometry({ dropDistanceM: DEATH_DROP_INTERACTION_RANGE + 0.5 })).toBeNull();
    expect(geometry({ dropDistanceM: DEATH_DROP_INTERACTION_RANGE + 0.51 })).toBe('drop-distance');
  });

  it('rejects a weapon pickup through a wall, and does not sight-gate a scavenge', () => {
    // The gun is in range but a world collider stands between the requester's
    // eye and it. Range alone let this through before PASS 95.
    expect(geometry({ sightBlocked: true })).toBe('line-of-sight');
    // A scavenge happens standing on the corpse inside 1.05 m; the trace would
    // hit the body itself, so it is deliberately not gated.
    expect(geometry({
      mode: 'scavenge',
      sightBlocked: true,
      dropHorizontalDistanceM: 0.6,
      dropVerticalDistanceM: 0.2,
    })).toBeNull();
  });

  it('uses the horizontal-plus-vertical window for a scavenge, not the straight line', () => {
    const scavenge = { mode: 'scavenge' as const, sightBlocked: false };
    expect(geometry({
      ...scavenge,
      dropHorizontalDistanceM: DEATH_DROP_SCAVENGE_RANGE + 0.5,
      dropVerticalDistanceM: 2.5,
      dropDistanceM: 99,
    })).toBeNull();
    expect(geometry({
      ...scavenge,
      dropHorizontalDistanceM: DEATH_DROP_SCAVENGE_RANGE + 0.51,
      dropVerticalDistanceM: 0.1,
    })).toBe('drop-distance');
    expect(geometry({
      ...scavenge,
      dropHorizontalDistanceM: 0.4,
      dropVerticalDistanceM: 2.51,
    })).toBe('drop-distance');
  });

  it('rejects a non-finite distance instead of admitting it', () => {
    // `<=` against NaN is false, which is the safe direction. This pins that
    // the guard is written so a NaN cannot pass, because a guest controls the
    // stamped position and NaN is one keystroke away in a hand-built payload.
    expect(geometry({ dropDistanceM: Number.NaN })).toBe('drop-distance');
    expect(geometry({ senderDistanceM: Number.NaN })).toBe('sender-distance');
  });
});

describe('HF-504 host pickup admission - idempotency', () => {
  const acceptedResolution: PickupResolution = Object.freeze({
    status: 'accepted',
    reason: 'accepted',
    drop: 'removed',
    resolvedAt: 1_000,
  });

  it('replays an ACCEPTED verdict, so a lost ack costs a round trip and never the gun', () => {
    // This is the whole HF-504 failure mode. The host accepted; the result was
    // lost; the guest resent the same nonce. Before PASS 95 the answer was
    // 'rejected: duplicate', and the guest's rejection path reverted a swap the
    // host had already committed - the two sides then disagreed about the
    // guest's primary weapon.
    const ledger = createPickupResolutionLedger();
    const key = pickupRequestKey('guest-a', 77);
    rememberPickupResolution(ledger, key, acceptedResolution);
    const replay = recallPickupResolution(ledger, key, 1_200);
    expect(replay?.status).toBe('accepted');
    expect(replay?.reason).toBe('accepted');
  });

  it('replays a REJECTED verdict, so a retry cannot become a second successful pick', () => {
    const ledger = createPickupResolutionLedger();
    const key = pickupRequestKey('guest-a', 78);
    rememberPickupResolution(ledger, key, {
      status: 'rejected', reason: 'drop-distance', drop: 'removed', resolvedAt: 1_000,
    });
    expect(recallPickupResolution(ledger, key, 1_400)?.reason).toBe('drop-distance');
  });

  it('scopes a verdict to (playerId, nonce), so one guest cannot replay another guest\'s pickup', () => {
    const ledger = createPickupResolutionLedger();
    rememberPickupResolution(ledger, pickupRequestKey('guest-a', 5), acceptedResolution);
    expect(recallPickupResolution(ledger, pickupRequestKey('guest-b', 5), 1_100)).toBeNull();
  });

  it('keeps a verdict replayable for longer than the guest\'s whole retry schedule', () => {
    // If the ledger forgot before the guest gave up, the last retry would be
    // re-executed against a drop that is already gone and answered
    // 'unknown-drop', which reverts the swap. The TTL has to outlive the
    // revert deadline with room for a round trip.
    expect(PICKUP_RESOLUTION_TTL_MS).toBeGreaterThan(PICKUP_REVERT_AFTER_MS * 2);
    const ledger = createPickupResolutionLedger();
    const key = pickupRequestKey('guest-a', 9);
    rememberPickupResolution(ledger, key, acceptedResolution);
    expect(recallPickupResolution(ledger, key, 1_000 + PICKUP_RESOLUTION_TTL_MS)).not.toBeNull();
    expect(recallPickupResolution(ledger, key, 1_001 + PICKUP_RESOLUTION_TTL_MS)).toBeNull();
  });

  it('cannot be grown without bound by a guest inventing nonces', () => {
    const ledger = createPickupResolutionLedger();
    for (let nonce = 0; nonce < PICKUP_RESOLUTION_LIMIT + 64; nonce += 1) {
      rememberPickupResolution(ledger, pickupRequestKey('hostile', nonce), {
        ...acceptedResolution, resolvedAt: 1_000 + nonce,
      });
    }
    expect(ledger.size).toBe(PICKUP_RESOLUTION_LIMIT);
    // Eviction is oldest-first, so the most recent request is still replayable.
    const newest = pickupRequestKey('hostile', PICKUP_RESOLUTION_LIMIT + 63);
    expect(ledger.has(newest)).toBe(true);
  });

  it('drops every verdict for a peer that has left', () => {
    const ledger = createPickupResolutionLedger();
    rememberPickupResolution(ledger, pickupRequestKey('guest-a', 1), acceptedResolution);
    rememberPickupResolution(ledger, pickupRequestKey('guest-a', 2), acceptedResolution);
    rememberPickupResolution(ledger, pickupRequestKey('guest-b', 1), acceptedResolution);
    forgetPlayerPickupResolutions(ledger, 'guest-a');
    expect([...ledger.keys()]).toEqual([pickupRequestKey('guest-b', 1)]);
  });

  it('does not confuse player ids that share a prefix', () => {
    const ledger = createPickupResolutionLedger();
    rememberPickupResolution(ledger, pickupRequestKey('guest', 1), acceptedResolution);
    rememberPickupResolution(ledger, pickupRequestKey('guest-a', 1), acceptedResolution);
    forgetPlayerPickupResolutions(ledger, 'guest');
    expect([...ledger.keys()]).toEqual([pickupRequestKey('guest-a', 1)]);
  });
});

describe('HF-504 two guests racing for one gun', () => {
  /**
   * The host executes requests one at a time off its own message queue. The
   * race is decided by `consumeDeathDropWeapon`: the first request consumes the
   * drop's weapon payload, and the second finds a drop that now holds the
   * FIRST guest's surrendered gun instead of the contested one. The host's
   * `weapon-mismatch` guard is what turns that into a clean loss rather than a
   * duplicated weapon, so this test asserts the ground record both guests are
   * racing over, in the host's own order.
   */
  it('gives the gun to exactly one guest and hands the loser a mismatch', () => {
    const contested = createDeathDrop('death-1', 'ak-47', { x: 0, y: 0, z: 0 }, 20, 40, 0);
    const first = consumeDeathDropWeapon(
      contested,
      { primary: 'carbine', ammo: 11, reserve: 22 },
      WEAPONS.carbine.reserve,
      100,
    );
    expect(first.consumed).toBe(true);
    expect(first.mode).toBe('pickup');
    expect(first.inventory.primary).toBe('ak-47');

    // The host's ground record after the winner's transaction. The second
    // guest's request still names 'ak-47'; the drop no longer holds it.
    const afterFirst = placeSwappedDeathDrop(first.drop, { x: 0, y: 0, z: 0 }, 0, 100);
    expect(afterFirst.weapon).toBe('carbine');
    expect(afterFirst.weapon === 'ak-47').toBe(false);

    // Exactly one 'ak-47' exists across the winner's inventory and the ground.
    const akInstances = [first.inventory.primary, afterFirst.weapon]
      .filter((weapon) => weapon === 'ak-47').length;
    expect(akInstances).toBe(1);

    // And the loser, executed against the same post-transaction record with the
    // same weapon it asked for, gets nothing new: the drop is a carbine now.
    const second = consumeDeathDropWeapon(
      afterFirst,
      { primary: 'carbine', ammo: 30, reserve: 60 },
      WEAPONS.carbine.reserve,
      110,
    );
    // Same gun as the loser already holds, so this is a replenish at most -
    // never a second 'ak-47'.
    expect(second.inventory.primary).toBe('carbine');
  });

  it('a guest cannot mint a weapon by asking for one the drop does not hold', () => {
    // `consumeDeathDropWeapon` transfers `drop.weapon`, never the requested id.
    // The host additionally rejects the mismatch up front; this pins that even
    // if that guard were bypassed the transfer still cannot fabricate a gun.
    const drop = createDeathDrop('death-2', 'smg', { x: 0, y: 0, z: 0 }, 10, 10, 0);
    const result = consumeDeathDropWeapon(
      drop,
      { primary: 'carbine', ammo: 5, reserve: 5 },
      WEAPONS.carbine.reserve,
      50,
    );
    expect(result.inventory.primary).toBe('smg');
    expect(result.inventory.primary).not.toBe('minigun');
  });

  it('a consumed drop cannot be picked a second time', () => {
    const drop = createDeathDrop('death-3', 'smg', { x: 0, y: 0, z: 0 }, 10, 10, 0);
    const consumed = { ...drop, weaponConsumedAt: 10, ammoConsumedAt: 10 };
    const result = consumeDeathDropWeapon(
      consumed,
      { primary: 'carbine', ammo: 5, reserve: 5 },
      WEAPONS.carbine.reserve,
      50,
    );
    expect(result.consumed).toBe(false);
    expect(result.inventory.primary).toBe('carbine');
  });
});

describe('HF-504 drop on death and reload after pickup', () => {
  it('spawns a ground weapon carrying the victim\'s remaining ammunition', () => {
    const spec = WEAPONS['ak-47'];
    expect(deathDropPayload(spec, { ammo: 7, reserve: 13 })).toEqual({ ammo: 7, reserve: 13 });
    // Clamped to the weapon, never above it.
    expect(deathDropPayload(spec, { ammo: 9_999, reserve: 9_999 }))
      .toEqual({ ammo: spec.mag, reserve: spec.reserve });
    // An empty magazine still leaves a usable gun on the ground rather than a
    // record `consumeDeathDropWeapon` would treat as a dud.
    expect(deathDropPayload(spec, { ammo: 0, reserve: 0 })).toEqual({ ammo: 1, reserve: 0 });
  });

  it('keeps the historical fraction for a victim the host holds no ledger for', () => {
    const spec = WEAPONS['ak-47'];
    expect(deathDropPayload(spec, null)).toEqual({
      ammo: Math.max(1, Math.ceil(spec.mag * 0.5)),
      reserve: Math.max(1, Math.ceil(spec.reserve * 0.25)),
    });
    expect(deathDropPayload(spec, { ammo: Number.NaN, reserve: 4 }))
      .toEqual(deathDropPayload(spec, null));
  });

  it('transfers the drop\'s reserve, so the first reload after a pickup is possible', () => {
    // THE OWNER-REPORTED SYMPTOM. Before PASS 95 the transferred reserve was a
    // hard 0: you picked a gun up and could not reload it, for months.
    const drop = createDeathDrop('death-4', 'ak-47', { x: 0, y: 0, z: 0 }, 12, 24, 0);
    const result = consumeDeathDropWeapon(
      drop,
      { primary: 'carbine', ammo: 3, reserve: 9 },
      WEAPONS.carbine.reserve,
      100,
    );
    expect(result.consumed).toBe(true);
    expect(result.inventory.primary).toBe('ak-47');
    expect(result.inventory.ammo).toBe(12);
    expect(result.inventory.reserve).toBe(24);
    // A reload is possible exactly when there is reserve to draw from.
    expect(result.inventory.reserve).toBeGreaterThan(0);
  });

  it('does not duplicate ammunition across the swap', () => {
    const drop = createDeathDrop('death-5', 'ak-47', { x: 0, y: 0, z: 0 }, 12, 24, 0);
    const carriedBefore = { ammo: 3, reserve: 9 };
    const result = consumeDeathDropWeapon(
      drop, { primary: 'carbine', ...carriedBefore }, WEAPONS.carbine.reserve, 100,
    );
    // The reserve the picker gains came off the drop, and the drop now holds
    // exactly what the picker surrendered - no side gains rounds.
    expect(result.drop.weapon).toBe('carbine');
    expect(result.drop.ammo).toBe(carriedBefore.ammo);
    expect(result.drop.reserve).toBe(carriedBefore.reserve);
    expect(result.inventory.reserve).toBe(drop.reserve);
    expect(result.inventory.ammo).toBe(drop.ammo);
  });

  it('gives no reserve from a drop whose ammunition payload was already scavenged', () => {
    const drop = createDeathDrop('death-6', 'ak-47', { x: 0, y: 0, z: 0 }, 12, 24, 0);
    const scavenged = { ...drop, ammoConsumedAt: 50 };
    const result = consumeDeathDropWeapon(
      scavenged, { primary: 'carbine', ammo: 3, reserve: 9 }, WEAPONS.carbine.reserve, 100,
    );
    expect(result.consumed).toBe(true);
    expect(result.inventory.reserve).toBe(0);
  });

  it('a swap keeps per-session state: the gun you handed over stays pickable', () => {
    const drop = createDeathDrop('death-7', 'ak-47', { x: 0, y: 0, z: 0 }, 12, 24, 0);
    const swapped = consumeDeathDropWeapon(
      drop, { primary: 'carbine', ammo: 5, reserve: 15 }, WEAPONS.carbine.reserve, 100,
    );
    expect(swapped.drop.weaponConsumedAt).toBeNull();
    expect(swapped.drop.ammoConsumedAt).toBeNull();
    // Swapping straight back returns the original loadout to the picker.
    const back = consumeDeathDropWeapon(
      placeSwappedDeathDrop(swapped.drop, { x: 0, y: 0, z: 0 }, 0, 100),
      { primary: 'ak-47', ammo: swapped.inventory.ammo, reserve: swapped.inventory.reserve },
      WEAPONS['ak-47'].reserve,
      200,
    );
    expect(back.inventory.primary).toBe('carbine');
    expect(back.inventory.ammo).toBe(5);
    expect(back.inventory.reserve).toBe(15);
  });
});

describe('HF-504 guest retry schedule', () => {
  it('waits, then resends the same request once, then reverts at the unchanged deadline', () => {
    const pending = { sentAt: 0, resentAt: null };
    expect(stepPendingPickup(pending, PICKUP_RESEND_AFTER_MS - 1)).toBe('wait');
    expect(stepPendingPickup(pending, PICKUP_RESEND_AFTER_MS)).toBe('resend');
    // Once resent, it waits out the rest of the deadline rather than flooding.
    const resent = { sentAt: 0, resentAt: PICKUP_RESEND_AFTER_MS };
    expect(stepPendingPickup(resent, PICKUP_REVERT_AFTER_MS)).toBe('wait');
    expect(stepPendingPickup(resent, PICKUP_REVERT_AFTER_MS + 1)).toBe('revert');
  });

  it('does not relax the revert deadline that existed before PASS 95', () => {
    expect(PICKUP_REVERT_AFTER_MS).toBe(1_500);
    expect(PICKUP_RESEND_AFTER_MS).toBeLessThan(PICKUP_REVERT_AFTER_MS);
  });

  it('reverts an un-resent request that outlived the deadline', () => {
    // A request that never got a resend window (a stalled frame loop) must
    // still revert rather than hang the guest's inventory forever.
    expect(stepPendingPickup({ sentAt: 0, resentAt: null }, PICKUP_REVERT_AFTER_MS + 1)).toBe('revert');
  });
});

describe('HF-504 wire version', () => {
  it('takes 20, not 19, so it cannot silently merge with the concurrent reload lane', () => {
    // The 'line-of-sight' pickup-result reason is a wire change. The HF-498
    // reload lane bumps the same constant 18 -> 19 for a different wire change.
    // Two lanes both landing "19" would auto-merge into one version number
    // describing two incompatible schemas; taking 20 forces a resolution.
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(20);
  });
});
