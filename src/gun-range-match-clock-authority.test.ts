import { describe, expect, it } from 'vitest';
import {
  advanceGunRangeMatchClock,
  createGunRangeMatchClockSnapshot,
  gunRangeMatchClockRemainingAt,
  gunRangeTestBayOccupants,
  holdGunRangeReplicaAtAuthorityBoundary,
  isGunRangeMatchClockSnapshot,
  projectGunRangeMatchClock,
  restoreGunRangeMatchClock,
} from './gun-range-match-clock-authority';

describe('Gun Range match-clock authority', () => {
  it('freezes one shared remaining-time anchor and resumes without consuming paused time', () => {
    const initial = createGunRangeMatchClockSnapshot(120_000, 1_000);
    const entered = advanceGunRangeMatchClock(initial, 11_000, true, 120_000);
    expect(entered.transition).toBe('paused');
    expect(entered.state).toMatchObject({ revision: 1, paused: true, remainingMs: 110_000 });

    const held = advanceGunRangeMatchClock(entered.state, 61_000, true, 120_000);
    expect(held.transition).toBeNull();
    expect(held.state.remainingMs).toBe(110_000);

    const exited = advanceGunRangeMatchClock(held.state, 66_000, false, 120_000);
    expect(exited.transition).toBe('resumed');
    expect(exited.state).toMatchObject({ revision: 2, paused: false, remainingMs: 110_000 });
    expect(gunRangeMatchClockRemainingAt(exited.state, 76_000, 120_000)).toBe(100_000);
  });

  it('projects the host sample into each local monotonic clock without guest authorship', () => {
    const paused = advanceGunRangeMatchClock(
      createGunRangeMatchClockSnapshot(120_000, 1_000),
      21_000,
      true,
      120_000,
    ).state;
    expect(projectGunRangeMatchClock(paused, 2_500, 52_500, 120_000)).toEqual({
      phaseStartedAt: 32_500,
      endsAt: 152_500,
    });

    const resumed = advanceGunRangeMatchClock(paused, 31_000, false, 120_000).state;
    expect(projectGunRangeMatchClock(resumed, 7_500, 17_500, 120_000)).toEqual({
      phaseStartedAt: -12_500,
      endsAt: 107_500,
    });
  });

  it('admits only connected, alive authority rows and rejects a spoofed unadmitted bay position', () => {
    const bay = { x: 72, y: 1.7, z: 6 };
    const outside = { x: 20, y: 1.7, z: 0 };
    const bounds = { minX: 52, maxX: 100, minY: 0, maxY: 25.175, minZ: -26, maxZ: 38 };
    expect(gunRangeTestBayOccupants([
      { id: 'host', admitted: true, connected: true, alive: true, position: outside },
      { id: 'guest', admitted: true, connected: true, alive: true, position: bay },
      { id: 'spoofed-unadmitted', admitted: false, connected: true, alive: true, position: bay },
      { id: 'dead-guest', admitted: true, connected: true, alive: false, position: bay },
      { id: 'disconnected-guest', admitted: true, connected: false, alive: true, position: bay },
    ], bounds)).toEqual(['guest']);
  });

  it('persists pause across downtime but charges downtime to a running clock', () => {
    const initial = createGunRangeMatchClockSnapshot(120_000, 0);
    const paused = advanceGunRangeMatchClock(initial, 20_000, true, 120_000).state;
    expect(restoreGunRangeMatchClock(paused, 5_000, 30_000, 120_000)).toMatchObject({
      paused: true,
      remainingMs: 100_000,
      sampledAtHostTimeMs: 5_000,
    });

    const running = advanceGunRangeMatchClock(paused, 25_000, false, 120_000).state;
    expect(restoreGunRangeMatchClock(running, 5_000, 30_000, 120_000)).toMatchObject({
      paused: false,
      remainingMs: 70_000,
      sampledAtHostTimeMs: 5_000,
    });
  });

  it('holds a near-zero guest active until the reliable host phase ends', () => {
    const projected = { phase: 'active', phaseStartedAt: 0, endsAt: 100, winner: null } as const;
    const locallyExpired = {
      phase: 'ended', phaseStartedAt: 101, endsAt: 101, winner: 'draw', endReason: 'time',
    } as const;
    const heldAtZero = holdGunRangeReplicaAtAuthorityBoundary(projected, locallyExpired, true);
    expect(heldAtZero).toEqual({
      ...projected,
      endsAt: 101,
    });
    expect(holdGunRangeReplicaAtAuthorityBoundary(projected, locallyExpired, false)).toBe(locallyExpired);

    const delayedHostPause = projectGunRangeMatchClock(
      { schemaVersion: 1, revision: 9, paused: true, remainingMs: 25, sampledAtHostTimeMs: 5_000 },
      1_000,
      1_080,
      120_000,
    );
    expect({ ...heldAtZero, ...delayedHostPause }).toMatchObject({
      phase: 'active',
      endsAt: 1_105,
    });
  });

  it('strictly rejects extra fields, invalid revisions, and over-duration state', () => {
    const state = createGunRangeMatchClockSnapshot(120_000, 0);
    expect(isGunRangeMatchClockSnapshot(state, 120_000)).toBe(true);
    expect(isGunRangeMatchClockSnapshot({ ...state, callerPaused: true }, 120_000)).toBe(false);
    expect(isGunRangeMatchClockSnapshot({ ...state, revision: -1 }, 120_000)).toBe(false);
    expect(isGunRangeMatchClockSnapshot({ ...state, remainingMs: 120_001 }, 120_000)).toBe(false);
    expect(isGunRangeMatchClockSnapshot({ ...state, sampledAtHostTimeMs: -1 }, 120_000)).toBe(false);
  });
});
