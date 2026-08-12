import { describe, expect, it } from 'vitest';
import {
  advanceGunRangeMatchClock,
  createGunRangeMatchClockSnapshot,
  gunRangeMatchClockRemainingAt,
  gunRangeTestBayOccupancyBoundaryCount,
  gunRangeTestBayOccupants,
  holdGunRangeReplicaAtAuthorityBoundary,
  isGunRangeMatchClockSnapshot,
  projectGunRangeMatchClock,
  restoreGunRangeMatchClock,
} from './gun-range-match-clock-authority';
import type { GunRangeClockParticipant } from './gun-range-match-clock-authority';

describe('Gun Range match-clock authority', () => {
  it('resets the shared clock to exactly two minutes on every entry and exit edge', () => {
    const initial = createGunRangeMatchClockSnapshot(120_000, 1_000);
    const entered = advanceGunRangeMatchClock(initial, 11_000, true, 120_000);
    expect(entered.transition).toBe('paused');
    expect(entered.state).toMatchObject({ revision: 1, paused: true, remainingMs: 120_000 });

    const held = advanceGunRangeMatchClock(entered.state, 61_000, true, 120_000);
    expect(held.transition).toBeNull();
    expect(held.state).toMatchObject({ revision: 1, paused: true, remainingMs: 120_000 });

    const exited = advanceGunRangeMatchClock(held.state, 66_000, false, 120_000);
    expect(exited.transition).toBe('resumed');
    expect(exited.state).toMatchObject({ revision: 2, paused: false, remainingMs: 120_000 });
    expect(gunRangeMatchClockRemainingAt(exited.state, 76_000, 120_000)).toBe(110_000);
  });

  it('authors one revision per participant edge without resetting stable occupancy per frame', () => {
    expect(gunRangeTestBayOccupancyBoundaryCount([], ['host'])).toBe(1);
    expect(gunRangeTestBayOccupancyBoundaryCount(['host'], ['guest', 'host'])).toBe(1);
    expect(gunRangeTestBayOccupancyBoundaryCount(['guest', 'host'], ['guest'])).toBe(1);
    expect(gunRangeTestBayOccupancyBoundaryCount(['guest'], ['replacement'])).toBe(2);
    expect(gunRangeTestBayOccupancyBoundaryCount(['guest'], ['guest'])).toBe(0);

    const paused = advanceGunRangeMatchClock(
      createGunRangeMatchClockSnapshot(120_000, 0), 10_000, true, 120_000, 1,
    );
    const secondEntry = advanceGunRangeMatchClock(paused.state, 20_000, true, 120_000, 1);
    expect(secondEntry).toMatchObject({ transition: 'reset', boundaryEdgeCount: 1 });
    expect(secondEntry.state).toMatchObject({ revision: 2, paused: true, remainingMs: 120_000 });
    const replacement = advanceGunRangeMatchClock(secondEntry.state, 30_000, true, 120_000, 2);
    expect(replacement.state).toMatchObject({ revision: 4, paused: true, remainingMs: 120_000 });
    expect(advanceGunRangeMatchClock(replacement.state, 31_000, true, 120_000, 0).state.revision).toBe(4);
  });

  it('projects a same-sample multi-edge revision identically for host and guest clocks', () => {
    const previous = ['guest-a', 'host'];
    const next = ['guest-b'];
    const boundaryEdgeCount = gunRangeTestBayOccupancyBoundaryCount(previous, next);
    expect(boundaryEdgeCount).toBe(3);
    const step = advanceGunRangeMatchClock(
      { ...createGunRangeMatchClockSnapshot(120_000, 1_000), revision: 7 },
      9_000,
      true,
      120_000,
      boundaryEdgeCount,
    );
    expect(step.state).toMatchObject({ revision: 10, paused: true, remainingMs: 120_000 });
    expect(isGunRangeMatchClockSnapshot(step.state, 120_000)).toBe(true);
    const host = projectGunRangeMatchClock(step.state, 9_000, 9_000, 120_000);
    const guest = projectGunRangeMatchClock(step.state, 2_500, 72_500, 120_000);
    expect(host.endsAt - 9_000).toBe(120_000);
    expect(guest.endsAt - 72_500).toBe(120_000);
    expect(host.endsAt - host.phaseStartedAt).toBe(120_000);
    expect(guest.endsAt - guest.phaseStartedAt).toBe(120_000);
  });

  it('resets the offline participant clock on a canonical enter and exit', () => {
    const bounds = { minX: 52, maxX: 100, minY: 0, maxY: 25.175, minZ: -26, maxZ: 38 };
    const participant = (x: number): GunRangeClockParticipant => ({
      id: 'offline-player', admitted: true, connected: true, alive: true, position: { x, y: 1.7, z: 6 },
    });
    const outside = gunRangeTestBayOccupants([participant(20)], bounds);
    const inside = gunRangeTestBayOccupants([participant(72)], bounds);
    const entered = advanceGunRangeMatchClock(
      createGunRangeMatchClockSnapshot(120_000, 0), 17_000, true, 120_000,
      gunRangeTestBayOccupancyBoundaryCount(outside, inside),
    );
    const exited = advanceGunRangeMatchClock(
      entered.state, 70_000, false, 120_000,
      gunRangeTestBayOccupancyBoundaryCount(inside, outside),
    );
    expect(entered.state).toMatchObject({ revision: 1, paused: true, remainingMs: 120_000 });
    expect(exited.state).toMatchObject({ revision: 2, paused: false, remainingMs: 120_000 });
  });

  it('projects the host sample into each local monotonic clock without guest authorship', () => {
    const paused = advanceGunRangeMatchClock(
      createGunRangeMatchClockSnapshot(120_000, 1_000),
      21_000,
      true,
      120_000,
    ).state;
    expect(projectGunRangeMatchClock(paused, 2_500, 52_500, 120_000)).toEqual({
      phaseStartedAt: 52_500,
      endsAt: 172_500,
    });

    const resumed = advanceGunRangeMatchClock(paused, 31_000, false, 120_000).state;
    expect(projectGunRangeMatchClock(resumed, 7_500, 17_500, 120_000)).toEqual({
      phaseStartedAt: 7_500,
      endsAt: 127_500,
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
      remainingMs: 120_000,
      sampledAtHostTimeMs: 5_000,
    });

    const running = advanceGunRangeMatchClock(paused, 25_000, false, 120_000).state;
    expect(restoreGunRangeMatchClock(running, 5_000, 30_000, 120_000)).toMatchObject({
      paused: false,
      remainingMs: 90_000,
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
