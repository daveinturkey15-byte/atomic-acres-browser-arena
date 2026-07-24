import { describe, expect, it } from 'vitest';
import {
  OVERDRIVE_DAMAGE_MULTIPLIER,
  OVERDRIVE_DURATION_MS,
  OVERDRIVE_POSITION,
  OVERDRIVE_SPAWN_INTERVAL_MS,
  advanceOverdrive,
  claimOverdrive,
  createOverdriveState,
  dropOverdriveOnElimination,
  overdriveDamageMultiplier,
} from './overdrive';

describe('Overdrive Core authority', () => {
  it('spawns exactly every two minutes and remains until claimed', () => {
    const initial = createOverdriveState(1_000);
    expect(advanceOverdrive(initial, 1_000 + OVERDRIVE_SPAWN_INTERVAL_MS - 1).available).toBe(false);
    const spawned = advanceOverdrive(initial, 1_000 + OVERDRIVE_SPAWN_INTERVAL_MS);
    expect(spawned.available).toBe(true);
    expect(advanceOverdrive(spawned, 999_999).available).toBe(true);
  });

  it('admits one living player inside the centre radius for exactly thirty seconds', () => {
    const now = OVERDRIVE_SPAWN_INTERVAL_MS;
    const spawned = advanceOverdrive(createOverdriveState(0), now);
    const result = claimOverdrive(spawned, 'player-a', OVERDRIVE_POSITION, true, now);
    expect(result.claimed).toBe(true);
    expect(result.state.activeUntil).toBe(now + OVERDRIVE_DURATION_MS);
    expect(result.state.nextSpawnAt).toBe(now + OVERDRIVE_SPAWN_INTERVAL_MS);
    expect(overdriveDamageMultiplier(result.state, 'player-a', now + 29_999)).toBe(OVERDRIVE_DAMAGE_MULTIPLIER);
    expect(overdriveDamageMultiplier(result.state, 'player-a', now + 30_000)).toBe(1);
  });

  it('rejects dead, distant and duplicate claims', () => {
    const now = OVERDRIVE_SPAWN_INTERVAL_MS;
    const spawned = advanceOverdrive(createOverdriveState(0), now);
    expect(claimOverdrive(spawned, 'dead', OVERDRIVE_POSITION, false, now).claimed).toBe(false);
    expect(claimOverdrive(spawned, 'far', { x: 10, y: 0.82, z: 0 }, true, now).claimed).toBe(false);
    const first = claimOverdrive(spawned, 'winner', OVERDRIVE_POSITION, true, now);
    expect(claimOverdrive(first.state, 'loser', OVERDRIVE_POSITION, true, now).claimed).toBe(false);
  });

  it('expires cleanly before the next scheduled spawn', () => {
    const now = OVERDRIVE_SPAWN_INTERVAL_MS;
    const claimed = claimOverdrive(advanceOverdrive(createOverdriveState(0), now), 'winner', OVERDRIVE_POSITION, true, now).state;
    const expired = advanceOverdrive(claimed, now + OVERDRIVE_DURATION_MS);
    expect(expired).toMatchObject({ available: false, holderId: null, activeUntil: 0 });
    expect(advanceOverdrive(expired, now + OVERDRIVE_SPAWN_INTERVAL_MS).available).toBe(true);
  });

  it('drops the core at the holder death point and preserves only its remaining time', () => {
    const now = OVERDRIVE_SPAWN_INTERVAL_MS;
    const held = claimOverdrive(advanceOverdrive(createOverdriveState(0), now), 'holder', OVERDRIVE_POSITION, true, now).state;
    const deathPoint = { x: 4, y: 0.82, z: -3 };
    const result = dropOverdriveOnElimination(held, 'holder', deathPoint, now + 8_000);
    expect(result.dropped).toBe(true);
    expect(result.state).toMatchObject({ available: true, holderId: null, activeUntil: now + OVERDRIVE_DURATION_MS, position: deathPoint });
    expect(claimOverdrive(result.state, 'killer', OVERDRIVE_POSITION, true, now + 9_000).claimed).toBe(false);
    const reclaimed = claimOverdrive(result.state, 'killer', deathPoint, true, now + 9_000);
    expect(reclaimed).toMatchObject({
      claimed: true,
      state: {
        holderId: 'killer',
        activeUntil: now + OVERDRIVE_DURATION_MS,
        nextSpawnAt: held.nextSpawnAt,
      },
    });
    expect(dropOverdriveOnElimination(held, 'other', deathPoint, now).dropped).toBe(false);
  });

  it('expires an unclaimed death drop without extending the normal respawn schedule', () => {
    const now = OVERDRIVE_SPAWN_INTERVAL_MS;
    const held = claimOverdrive(advanceOverdrive(createOverdriveState(0), now), 'holder', OVERDRIVE_POSITION, true, now).state;
    const dropped = dropOverdriveOnElimination(held, 'holder', { x: 2, y: 0.82, z: 2 }, now + 10_000).state;
    expect(advanceOverdrive(dropped, now + OVERDRIVE_DURATION_MS - 1).available).toBe(true);
    expect(advanceOverdrive(dropped, now + OVERDRIVE_DURATION_MS)).toMatchObject({ available: false, holderId: null, activeUntil: 0 });
  });
});
