import type { KillstreakImpactEvent } from './killstreak-runtime';

const DEFAULT_PRESENTATION_RECEIPT_CAPACITY = 256;

/**
 * Recipient-local admission for retained Carpet Bomber fire presentation.
 * Damage remains host-only; this ledger only prevents a replayed impact result
 * from extending the guest's five-second visual lifetime.
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
    const key = `${matchEpoch}:${impact.activationId}:${impact.ordinal}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    while (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.seen.clear();
  }
}
