import type { KillstreakDamageResultMessage } from './killstreak-protocol';
import type { KillstreakDamageEvent, KillstreakImpactEvent } from './killstreak-runtime';

export const KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY = 4_096;

export type KillstreakDamageResultAdmission = Readonly<
  | {
      accepted: false;
      reason: 'forged-host' | 'match-epoch-mismatch' | 'duplicate-nonce';
      events: readonly KillstreakDamageEvent[];
      impacts: readonly KillstreakImpactEvent[];
    }
  | {
      accepted: true;
      reason: 'accepted';
      events: readonly KillstreakDamageEvent[];
      impacts: readonly KillstreakImpactEvent[];
    }
>;

function retainBounded<T>(set: Set<T>, value: T): void {
  set.add(value);
  while (set.size > KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY) {
    set.delete(set.values().next().value!);
  }
}

export function killstreakImpactReplayKey(event: KillstreakImpactEvent): string {
  return `${event.activationId}\u0000${event.ordinal}\u0000${event.phase}`;
}

/**
 * Match-local replay ledger for host-authored support results. Message nonces
 * reject exact transport replays, while immutable result/impact identities
 * prevent the same presentation from being wrapped in a fresh nonce. A later
 * message with genuinely new entries remains admissible even at the same
 * snapshot revision (damage chunks legitimately share revisions).
 */
export class KillstreakDamageResultReplayLedger {
  private readonly nonces = new Set<number>();
  private readonly resultIds = new Set<string>();
  private readonly impactKeys = new Set<string>();

  admit(
    message: KillstreakDamageResultMessage,
    context: Readonly<{ expectedHostId: string | null | undefined; expectedMatchEpoch: number }>,
  ): KillstreakDamageResultAdmission {
    if (!context.expectedHostId || message.by !== context.expectedHostId) {
      return Object.freeze({ accepted: false, reason: 'forged-host', events: [], impacts: [] });
    }
    if (message.matchEpoch !== context.expectedMatchEpoch) {
      return Object.freeze({ accepted: false, reason: 'match-epoch-mismatch', events: [], impacts: [] });
    }
    if (this.nonces.has(message.nonce)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-nonce', events: [], impacts: [] });
    }
    retainBounded(this.nonces, message.nonce);

    const events = message.events.filter((event) => {
      if (this.resultIds.has(event.resultId)) return false;
      retainBounded(this.resultIds, event.resultId);
      return true;
    });
    const impacts = message.impacts.filter((event) => {
      const key = killstreakImpactReplayKey(event);
      if (this.impactKeys.has(key)) return false;
      retainBounded(this.impactKeys, key);
      return true;
    });
    return Object.freeze({
      accepted: true,
      reason: 'accepted',
      events: Object.freeze(events),
      impacts: Object.freeze(impacts),
    });
  }

  reset(): void {
    this.nonces.clear();
    this.resultIds.clear();
    this.impactKeys.clear();
  }

  snapshot(): Readonly<{ nonces: number; resultIds: number; impactKeys: number; bounded: boolean }> {
    return Object.freeze({
      nonces: this.nonces.size,
      resultIds: this.resultIds.size,
      impactKeys: this.impactKeys.size,
      bounded: this.nonces.size <= KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY
        && this.resultIds.size <= KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY
        && this.impactKeys.size <= KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY,
    });
  }
}
