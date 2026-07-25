import { describe, expect, it } from 'vitest';
import {
  RAILGUN_DAMAGE,
  RAILGUN_PENETRATION_MULTIPLIER,
  RAILGUN_RECHAMBER_MS,
  RAILGUN_SPAWN_DELAY_MS,
  RAILGUN_STATE_RESYNC_MS,
  RAILGUN_TOTAL_ROUNDS,
  RAILGUN_UPPER_ROOM_SPAWN_SITES,
  advanceRailgunAuthority,
  advanceRailgunChamber,
  chooseRailgunUpperRoom,
  claimRailgun,
  createRailgunAuthorityState,
  dropRailgun,
  fireRailgun,
  isStaleRailgunAuthorityState,
  railgunStateResyncDue,
  isRailgunProtocolMessage,
  railgunThermalTargetEligible,
  replenishRailgunAmmo,
} from './railgun-authority';

describe('host-authoritative railgun', () => {
  it('schedules only on Nuke Town and selects each authored upper room uniformly', () => {
    expect(createRailgunAuthorityState('skyline-terminal', 10_000, 0).status).toBe('disabled');
    const scheduled = createRailgunAuthorityState('atomic-acres', 10_000, 0.5);
    expect(scheduled).toMatchObject({ status: 'scheduled', spawnAtHostTimeMs: 10_000 + RAILGUN_SPAWN_DELAY_MS });
    expect([0, 0.249999, 0.25, 0.499999, 0.5, 0.749999, 0.75, 0.999999].map(chooseRailgunUpperRoom).map((site) => site.id))
      .toEqual(['aqua-front', 'aqua-front', 'aqua-rear', 'aqua-rear', 'coral-front', 'coral-front', 'coral-rear', 'coral-rear']);
    expect(new Set(RAILGUN_UPPER_ROOM_SPAWN_SITES.map((site) => site.position[1]))).toEqual(new Set([4.18]));
  });

  it('spawns and announces exactly once at 180 seconds', () => {
    const scheduled = createRailgunAuthorityState('atomic-acres', 1_000, 0, 7);
    expect(advanceRailgunAuthority(scheduled, 1_000 + RAILGUN_SPAWN_DELAY_MS - 1).spawned).toBe(false);
    const spawned = advanceRailgunAuthority(scheduled, 1_000 + RAILGUN_SPAWN_DELAY_MS);
    expect(spawned).toMatchObject({ spawned: true, announcement: 'RAILGUN SPAWNED' });
    expect(advanceRailgunAuthority(spawned.state, 999_999)).toMatchObject({ spawned: false, announcement: null });
  });

  it('orders every mutation within a generation and rejects stale equal-generation snapshots', () => {
    const scheduled = createRailgunAuthorityState('atomic-acres', 0, 0, 9);
    const available = advanceRailgunAuthority(scheduled, RAILGUN_SPAWN_DELAY_MS).state;
    const held = claimRailgun(available, 'player-a', 9).state;
    const fired = fireRailgun(held, 'player-a', 'revision-shot', 200_000).state;
    expect([scheduled.revision, available.revision, held.revision, fired.revision]).toEqual([0, 1, 2, 3]);
    expect(isStaleRailgunAuthorityState(held, available)).toBe(true);
    expect(isStaleRailgunAuthorityState(held, held)).toBe(false);
    expect(isStaleRailgunAuthorityState(available, held)).toBe(false);
    expect(isStaleRailgunAuthorityState(held, createRailgunAuthorityState('atomic-acres', 0, 0, 10))).toBe(false);
  });

  it('periodically resends authoritative state so every guest converges after a missed event', () => {
    expect(railgunStateResyncDue(-Infinity, 0)).toBe(true);
    expect(railgunStateResyncDue(10_000, 10_000 + RAILGUN_STATE_RESYNC_MS - 1)).toBe(false);
    expect(railgunStateResyncDue(10_000, 10_000 + RAILGUN_STATE_RESYNC_MS)).toBe(true);
  });

  it('fires 50-damage full-penetration shots, breaks ADS, and rechambers for 1.5 seconds', () => {
    const available = advanceRailgunAuthority(createRailgunAuthorityState('atomic-acres', 0, 0), RAILGUN_SPAWN_DELAY_MS).state;
    let state = claimRailgun(available, 'player-a', 1).state;
    const first = fireRailgun(state, 'player-a', 'shot-0001', 200_000);
    expect(first).toMatchObject({
      accepted: true,
      damage: RAILGUN_DAMAGE,
      penetrationMultiplier: RAILGUN_PENETRATION_MULTIPLIER,
      adsAfterShot: false,
      rechamberMs: RAILGUN_RECHAMBER_MS,
    });
    state = first.state;
    expect(fireRailgun(state, 'player-a', 'shot-0002', 200_000 + RAILGUN_RECHAMBER_MS - 1).reason).toBe('not-ready');
    state = advanceRailgunChamber(state, 200_000 + RAILGUN_RECHAMBER_MS);
    expect(advanceRailgunChamber(state, 200_000 + RAILGUN_RECHAMBER_MS)).toBe(state);
    expect(fireRailgun(state, 'player-a', 'shot-0002', 200_000 + RAILGUN_RECHAMBER_MS).accepted).toBe(true);
  });

  it('has exactly eight lifetime rounds, rejects duplicate shots, and cannot replenish', () => {
    const available = advanceRailgunAuthority(createRailgunAuthorityState('atomic-acres', 0, 0), RAILGUN_SPAWN_DELAY_MS).state;
    let state = claimRailgun(available, 'player-a', 1).state;
    for (let index = 0; index < RAILGUN_TOTAL_ROUNDS; index += 1) {
      const now = 200_000 + index * RAILGUN_RECHAMBER_MS;
      state = advanceRailgunChamber(state, now);
      const fired = fireRailgun(state, 'player-a', `shot-${String(index).padStart(4, '0')}`, now);
      expect(fired.accepted).toBe(true);
      if (index === 0) {
        const duplicate = fireRailgun(fired.state, 'player-a', 'shot-0000', now + 10);
        expect(duplicate).toMatchObject({ accepted: false, duplicate: true, reason: 'duplicate' });
        expect(duplicate.state.roundsRemaining).toBe(RAILGUN_TOTAL_ROUNDS - 1);
      }
      state = fired.state;
    }
    expect(state).toMatchObject({ status: 'depleted', roundsRemaining: 0 });
    expect(replenishRailgunAmmo(state)).toEqual({ replenished: false, state });
    expect(fireRailgun(state, 'player-a', 'shot-9999', 999_999).accepted).toBe(false);
  });

  it('drops and reclaims remaining rounds without refilling', () => {
    const available = advanceRailgunAuthority(createRailgunAuthorityState('atomic-acres', 0, 0), RAILGUN_SPAWN_DELAY_MS).state;
    const held = claimRailgun(available, 'player-a', 1).state;
    const fired = fireRailgun(held, 'player-a', 'shot-drop', 200_000).state;
    const dropped = dropRailgun(fired, 'player-a', [1, 2, 3]);
    expect(dropped).toMatchObject({ dropped: true, state: { status: 'available', holderId: null, roundsRemaining: 7, pickupPosition: [1, 2, 3] } });
    const reclaimed = claimRailgun(dropped.state, 'player-b', 1);
    expect(reclaimed).toMatchObject({ accepted: true, state: { status: 'held', holderId: 'player-b', roundsRemaining: 7 } });
    expect(fireRailgun(reclaimed.state, 'player-b', 'reclaim-1', 200_100).reason).toBe('not-ready');
    expect(fireRailgun(reclaimed.state, 'player-b', 'reclaim-1', 200_000 + RAILGUN_RECHAMBER_MS).accepted).toBe(true);
  });

  it('reveals only living hostile players and bots through thermal ADS', () => {
    const observer = { id: 'a', team: 0 as const };
    expect(railgunThermalTargetEligible(observer, { id: 'b', team: 1, alive: true, kind: 'player' }, 'tdm')).toBe(true);
    expect(railgunThermalTargetEligible(observer, { id: 'bot', team: 1, alive: true, kind: 'bot' }, 'tdm')).toBe(true);
    expect(railgunThermalTargetEligible(observer, { id: 'ally', team: 0, alive: true, kind: 'player' }, 'tdm')).toBe(false);
    expect(railgunThermalTargetEligible(observer, { id: 'dead', team: 1, alive: false, kind: 'player' }, 'tdm')).toBe(false);
    expect(railgunThermalTargetEligible(observer, { id: 'other', team: 0, alive: true, kind: 'player' }, 'ffa')).toBe(true);
  });

  it('validates bounded railgun protocol messages', () => {
    expect(isRailgunProtocolMessage({
      type: 'railgun-claim-request', protocolVersion: 6, by: 'player-a', generation: 1,
      position: [1, 2, 3], nonce: 1,
    }, 6)).toBe(true);
    expect(isRailgunProtocolMessage({
      type: 'railgun-shot-request', protocolVersion: 6, by: 'player-a', generation: 1,
      shotId: 'shot-0001', origin: [1, 2, 3], direction: [0, 0, -1], fireTimeMs: 2_000, nonce: 2,
    }, 6)).toBe(true);
    expect(isRailgunProtocolMessage({
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'player-a', generation: 1,
      shotId: 'shot-0001', status: 'accepted-hit', reason: 'accepted',
      outcomes: [{ target: 'player-b', damage: 50, resultingHealth: 50, died: false, distanceMeters: 180 }], nonce: 3,
    }, 6)).toBe(true);
    expect(isRailgunProtocolMessage({
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'player-a', generation: 1,
      shotId: 'shot-0001', status: 'accepted-hit', reason: 'accepted',
      outcomes: [{ target: 'player-b', damage: 51, resultingHealth: 49, died: false, distanceMeters: 180 }], nonce: 3,
    }, 6)).toBe(false);
    expect(isRailgunProtocolMessage({
      type: 'railgun-claim-request', protocolVersion: 5, by: 'player-a', generation: 1,
      position: [1, 2, 3], nonce: 1,
    }, 6)).toBe(false);
  });
});
