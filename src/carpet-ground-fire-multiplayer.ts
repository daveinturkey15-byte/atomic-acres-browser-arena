import {
  CARPET_BOMBER_IMPACT_COUNT,
  MAX_ACTIVE_SUPPORT_ENTITIES,
  type KillstreakImpactEvent,
} from './killstreak-runtime';
import {
  FLAMETHROWER_GROUND_FIRE_DURATION_MS,
  type CarpetGroundFirePresentationSnapshot,
} from './flamethrower-stream-system';

export const MAX_CONCURRENT_CARPET_BOMBER_ACTIVATIONS = MAX_ACTIVE_SUPPORT_ENTITIES;
export const CARPET_GROUND_FIRE_AUTHORITY_CAPACITY = MAX_CONCURRENT_CARPET_BOMBER_ACTIVATIONS
  * CARPET_BOMBER_IMPACT_COUNT;
export const CARPET_GROUND_FIRE_STATE_CHUNK_SIZE = 64;
export const CARPET_GROUND_FIRE_STATE_MAX_CHUNKS = Math.ceil(
  CARPET_GROUND_FIRE_AUTHORITY_CAPACITY / CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
);

const DEFAULT_PRESENTATION_RECEIPT_CAPACITY = CARPET_GROUND_FIRE_AUTHORITY_CAPACITY * 2;

export type CarpetGroundFireStateChunk = Readonly<{
  snapshotId: number;
  chunkIndex: number;
  chunkCount: number;
  totalFires: number;
  fires: readonly CarpetGroundFirePresentationSnapshot[];
}>;

function validSnapshot(snapshot: CarpetGroundFirePresentationSnapshot): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/.test(snapshot.activationId)
    && Number.isSafeInteger(snapshot.impactOrdinal)
    && snapshot.impactOrdinal >= 0
    && snapshot.impactOrdinal < CARPET_BOMBER_IMPACT_COUNT
    && snapshot.position.length === 3
    && snapshot.position.every(Number.isFinite)
    && Number.isFinite(snapshot.expiresAtHostTimeMs)
    && snapshot.expiresAtHostTimeMs >= 0
    && snapshot.expiresAtHostTimeMs <= Number.MAX_SAFE_INTEGER;
}

export function carpetGroundFireStateChunks(
  snapshotId: number,
  fires: readonly CarpetGroundFirePresentationSnapshot[],
): readonly CarpetGroundFireStateChunk[] {
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 0
    || fires.length > CARPET_GROUND_FIRE_AUTHORITY_CAPACITY
    || !fires.every(validSnapshot)
    || new Set(fires.map((fire) => `${fire.activationId}:${fire.impactOrdinal}`)).size !== fires.length) {
    return Object.freeze([]);
  }
  const chunkCount = Math.max(1, Math.ceil(fires.length / CARPET_GROUND_FIRE_STATE_CHUNK_SIZE));
  return Object.freeze(Array.from({ length: chunkCount }, (_, chunkIndex) => Object.freeze({
    snapshotId,
    chunkIndex,
    chunkCount,
    totalFires: fires.length,
    fires: Object.freeze(fires.slice(
      chunkIndex * CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
      (chunkIndex + 1) * CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
    )),
  })));
}

/**
 * Recipient-local admission for retained Carpet Bomber fire presentation.
 * Damage remains host-only; this ledger prevents either an impact replay or a
 * rejoin-state replay from extending the host-authored expiry.
 */
export class CarpetGroundFireGuestPresentationAdmission {
  private readonly seen = new Set<string>();
  private readonly capacity: number;

  constructor(capacity = DEFAULT_PRESENTATION_RECEIPT_CAPACITY) {
    this.capacity = Number.isSafeInteger(capacity) && capacity > 0
      ? capacity
      : DEFAULT_PRESENTATION_RECEIPT_CAPACITY;
  }

  admit(matchEpoch: number, impact: KillstreakImpactEvent): boolean {
    if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0
      || impact.source !== 'carpet-bomber' || impact.phase !== 'impact') return false;
    return this.admitKey(`${matchEpoch}:${impact.activationId}:${impact.ordinal}`);
  }

  admitSnapshot(
    matchEpoch: number,
    snapshot: CarpetGroundFirePresentationSnapshot,
    nowHostTimeMs: number,
  ): number | null {
    if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0
      || !validSnapshot(snapshot) || !Number.isFinite(nowHostTimeMs)) return null;
    const remainingMs = Math.min(
      FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      snapshot.expiresAtHostTimeMs - nowHostTimeMs,
    );
    if (remainingMs <= 0
      || !this.admitKey(`${matchEpoch}:${snapshot.activationId}:${snapshot.impactOrdinal}`)) return null;
    return remainingMs;
  }

  clear(): void {
    this.seen.clear();
  }

  private admitKey(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    while (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return true;
  }
}
