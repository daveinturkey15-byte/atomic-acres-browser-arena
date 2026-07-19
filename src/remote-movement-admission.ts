import type { PlayerSnapshot } from './protocol';

export const REMOTE_MAX_HORIZONTAL_SPEED = 11;
export const REMOTE_MAX_VERTICAL_SPEED = 14;
export const REMOTE_SNAPSHOT_JITTER_RADIUS = 0.8;
export const REMOTE_RESYNC_AFTER_MS = 1_000;
export const REMOTE_CLAIM_REQUALIFY_MS = 1_500;
export const REMOTE_CLAIM_MAX_SNAPSHOT_AGE_MS = 300;

type Position = Pick<PlayerSnapshot, 'x' | 'y' | 'z'>;

export type RemoteMovementAdmission = Readonly<{
  accepted: boolean;
  resynchronized: boolean;
  claimEligibleAt: number;
}>;

export function admitRemoteSnapshotMovement(
  previous: Position,
  incoming: Position,
  now: number,
  lastAcceptedAt: number,
  claimEligibleAt: number,
  respawned: boolean,
): RemoteMovementAdmission {
  if (![previous.x, previous.y, previous.z, incoming.x, incoming.y, incoming.z, now, lastAcceptedAt].every(Number.isFinite)) {
    return { accepted: false, resynchronized: false, claimEligibleAt };
  }
  const elapsedMs = Math.max(0, now - lastAcceptedAt);
  const horizontalDistance = Math.hypot(incoming.x - previous.x, incoming.z - previous.z);
  const verticalDistance = Math.abs(incoming.y - previous.y);
  const boundedElapsedSeconds = Math.min(350, elapsedMs) / 1_000;
  const horizontalLimit = REMOTE_SNAPSHOT_JITTER_RADIUS + REMOTE_MAX_HORIZONTAL_SPEED * boundedElapsedSeconds;
  const verticalLimit = REMOTE_SNAPSHOT_JITTER_RADIUS + REMOTE_MAX_VERTICAL_SPEED * boundedElapsedSeconds;
  if (!respawned && horizontalDistance <= horizontalLimit && verticalDistance <= verticalLimit) {
    return { accepted: true, resynchronized: false, claimEligibleAt };
  }
  if (respawned || elapsedMs >= REMOTE_RESYNC_AFTER_MS) {
    return { accepted: true, resynchronized: true, claimEligibleAt: now + REMOTE_CLAIM_REQUALIFY_MS };
  }
  return { accepted: false, resynchronized: false, claimEligibleAt };
}

export function remoteCanClaimTimedPickup(now: number, lastAcceptedAt: number, claimEligibleAt: number): boolean {
  return Number.isFinite(now) && Number.isFinite(lastAcceptedAt) && Number.isFinite(claimEligibleAt)
    && now >= claimEligibleAt
    && now - lastAcceptedAt >= 0
    && now - lastAcceptedAt <= REMOTE_CLAIM_MAX_SNAPSHOT_AGE_MS;
}
