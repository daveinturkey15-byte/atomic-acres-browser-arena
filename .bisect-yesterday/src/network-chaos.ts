import { DeterministicRng } from './deterministic-rng';

export type NetworkImpairmentProfile = {
  oneWayLatencyMs: number;
  jitterMs: number;
  lossRate: number;
  duplicateRate: number;
  reorderRate: number;
  outage?: { startsAtMs: number; durationMs: number };
};

export type NetworkEvent<T> = {
  id: string;
  sentAt: number;
  payload: T;
};

export type NetworkDelivery<T> = NetworkEvent<T> & {
  arrivesAt: number;
  duplicate: boolean;
};

export const NETWORK_IMPAIRMENT_PROFILES = {
  clean: { oneWayLatencyMs: 0, jitterMs: 0, lossRate: 0, duplicateRate: 0, reorderRate: 0 },
  normal: { oneWayLatencyMs: 40, jitterMs: 20, lossRate: 0.01, duplicateRate: 0.005, reorderRate: 0.01 },
  adverse: {
    oneWayLatencyMs: 100,
    jitterMs: 50,
    lossRate: 0.05,
    duplicateRate: 0.02,
    reorderRate: 0.04,
    outage: { startsAtMs: 2_000, durationMs: 2_000 },
  },
} as const satisfies Record<string, NetworkImpairmentProfile>;

function clampProbability(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Deterministically applies transport impairment; gameplay admission remains a separate receiver boundary. */
export function impairNetworkEvents<T>(
  events: readonly NetworkEvent<T>[],
  profile: NetworkImpairmentProfile,
  seed: string | number,
): NetworkDelivery<T>[] {
  const rng = new DeterministicRng(seed);
  const deliveries: NetworkDelivery<T>[] = [];
  for (const event of events) {
    if (!Number.isFinite(event.sentAt)) continue;
    const outage = profile.outage;
    if (outage && event.sentAt >= outage.startsAtMs && event.sentAt < outage.startsAtMs + outage.durationMs) continue;
    if (rng.next() < clampProbability(profile.lossRate)) continue;
    const jitter = (rng.next() * 2 - 1) * Math.max(0, profile.jitterMs);
    const reorder = rng.next() < clampProbability(profile.reorderRate)
      ? (rng.next() * 2 - 1) * Math.max(1, profile.oneWayLatencyMs + profile.jitterMs)
      : 0;
    const arrivesAt = Math.max(event.sentAt, event.sentAt + Math.max(0, profile.oneWayLatencyMs + jitter + reorder));
    deliveries.push({ ...event, arrivesAt, duplicate: false });
    if (rng.next() < clampProbability(profile.duplicateRate)) {
      deliveries.push({ ...event, arrivesAt: arrivesAt + 1 + rng.next() * 8, duplicate: true });
    }
  }
  return deliveries.sort((left, right) => left.arrivesAt - right.arrivesAt || left.id.localeCompare(right.id) || Number(left.duplicate) - Number(right.duplicate));
}
