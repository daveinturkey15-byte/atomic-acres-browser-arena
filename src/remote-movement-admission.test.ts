import { describe, expect, it } from 'vitest';
import {
  REMOTE_CLAIM_REQUALIFY_MS,
  admitRemoteSnapshotMovement,
  remoteCanClaimTimedPickup,
} from './remote-movement-admission';

const start = { x: -12, y: 1.7, z: 0 };

describe('remote movement admission', () => {
  it('admits ordinary sprint-scale movement', () => {
    const result = admitRemoteSnapshotMovement(start, { x: -11.2, y: 1.7, z: 0 }, 1_100, 1_000, 0, false);
    expect(result).toMatchObject({ accepted: true, resynchronized: false, claimEligibleAt: 0 });
  });

  it('rejects an in-bounds one-snapshot teleport to mid-map', () => {
    const result = admitRemoteSnapshotMovement(start, { x: 0, y: 1.7, z: 0 }, 1_050, 1_000, 0, false);
    expect(result.accepted).toBe(false);
  });

  it('allows stale-link and respawn recovery but imposes pickup requalification', () => {
    const stale = admitRemoteSnapshotMovement(start, { x: 0, y: 1.7, z: 0 }, 2_100, 1_000, 0, false);
    expect(stale).toEqual({ accepted: true, resynchronized: true, claimEligibleAt: 2_100 + REMOTE_CLAIM_REQUALIFY_MS });
    expect(remoteCanClaimTimedPickup(2_150, 2_100, stale.claimEligibleAt)).toBe(false);
    expect(remoteCanClaimTimedPickup(stale.claimEligibleAt, stale.claimEligibleAt - 100, stale.claimEligibleAt)).toBe(true);
  });

  it('requires a fresh accepted snapshot at claim time', () => {
    expect(remoteCanClaimTimedPickup(2_000, 1_500, 1_000)).toBe(false);
    expect(remoteCanClaimTimedPickup(2_000, 1_900, 1_000)).toBe(true);
  });
});
