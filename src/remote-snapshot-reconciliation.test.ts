import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from './protocol';
import {
  applyRemoteAuthoritativeSnapshot,
  createRemoteAuthoritativeState,
  reconcileLocalAuthoritativeSnapshot,
} from './remote-snapshot-reconciliation';

const actor = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: 'guest-b', name: 'Guest B', team: 1,
  x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, hp: 100,
  kills: 0, deaths: 0, primary: 'carbine', secondary: 'pistol', grenade: 'frag', weapon: 'carbine',
  stance: 'stand', seq: 0, ...overrides,
});

describe('authoritative multiplayer snapshot application', () => {
  it('applies a newer continuity even when the repair state sequence is behind the join seed', () => {
    // Recorded HF-499 pattern: the reliable repair join seeds a remote with a
    // later sequence, then the first state from the replacement continuity
    // arrives with the sender sequence that was sampled before rejoin.
    const seeded = createRemoteAuthoritativeState({
      snapshot: actor({ seq: 240, x: 2 }), continuity: 7, hostTimeMs: 12_000,
    });
    const result = applyRemoteAuthoritativeSnapshot(seeded, {
      kind: 'state', snapshot: actor({ seq: 239, x: 18 }), continuity: 8, hostTimeMs: 12_060,
    });

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe('new-continuity');
    expect(result.state.snapshot).toMatchObject({ seq: 239, x: 18 });
    expect(result.state.continuity).toBe(8);
  });

  it('rejects an older sample after the continuity has already been applied', () => {
    const seeded = createRemoteAuthoritativeState({
      snapshot: actor({ seq: 239, x: 18 }), continuity: 8, hostTimeMs: 12_060,
    });
    const result = applyRemoteAuthoritativeSnapshot(seeded, {
      kind: 'state', snapshot: actor({ seq: 238, x: 17 }), continuity: 8, hostTimeMs: 12_040,
    });

    expect(result).toMatchObject({ accepted: false, reason: 'older-sequence' });
    expect(result.state.snapshot).toMatchObject({ seq: 239, x: 18 });
  });
});

describe('guest local authoritative reconciliation', () => {
  it('snaps a prediction beyond the bound toward a newer host-acknowledged sample', () => {
    const result = reconcileLocalAuthoritativeSnapshot({
      predicted: actor({ id: 'guest-a', seq: 61, x: 12, z: -4, yaw: 0.4 }),
      authoritative: actor({ id: 'guest-a', seq: 60, x: 1, z: -4, yaw: 0.1 }),
      lastAcknowledgedInputSeq: 59,
    });

    expect(result.accepted).toBe(true);
    expect(result.correction).toBe('snap');
    expect(result.divergenceM).toBeGreaterThan(0.35);
    expect(result.snapshot).toMatchObject({ seq: 60, x: 1, z: -4, yaw: 0.1 });
  });

  it('does not let an older host echo overwrite a newer acknowledged sample', () => {
    const result = reconcileLocalAuthoritativeSnapshot({
      predicted: actor({ id: 'guest-a', seq: 61, x: 12 }),
      authoritative: actor({ id: 'guest-a', seq: 58, x: 1 }),
      lastAcknowledgedInputSeq: 60,
    });

    expect(result).toMatchObject({ accepted: false, correction: 'ignore' });
  });
});
