export type HostClockProbe = Readonly<{
  guestSentMonoMs: number;
  hostReceivedMonoMs: number;
  hostSentMonoMs: number;
  guestReceivedMonoMs: number;
}>;

export type HostTimeMapping = Readonly<{
  offsetMs: number;
  rttMs: number;
  jitterMs: number;
  uncertaintyMs: number;
  sampleCount: number;
  rejectedOutliers: number;
  lastGuestMonoMs: number;
  lastHostTimeMs: number;
}>;

export type HostClockObservation = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'invalid' | 'outlier';
  mapping: HostTimeMapping;
  sampleRttMs: number;
  sampleOffsetMs: number;
}>;

const MAX_PROBE_RTT_MS = 5_000;
const MIN_OUTLIER_ALLOWANCE_MS = 12;

export function createHostTimeMapping(): HostTimeMapping {
  return {
    offsetMs: 0,
    rttMs: 0,
    jitterMs: 0,
    uncertaintyMs: Number.POSITIVE_INFINITY,
    sampleCount: 0,
    rejectedOutliers: 0,
    lastGuestMonoMs: Number.NEGATIVE_INFINITY,
    lastHostTimeMs: Number.NEGATIVE_INFINITY,
  };
}

export function observeHostClock(mapping: HostTimeMapping, probe: HostClockProbe): HostClockObservation {
  const values = [probe.guestSentMonoMs, probe.hostReceivedMonoMs, probe.hostSentMonoMs, probe.guestReceivedMonoMs];
  const invalid = values.some((value) => !Number.isFinite(value))
    || probe.guestReceivedMonoMs < probe.guestSentMonoMs
    || probe.hostSentMonoMs < probe.hostReceivedMonoMs;
  const sampleRttMs = invalid
    ? Number.POSITIVE_INFINITY
    : (probe.guestReceivedMonoMs - probe.guestSentMonoMs) - (probe.hostSentMonoMs - probe.hostReceivedMonoMs);
  const sampleOffsetMs = invalid
    ? 0
    : ((probe.hostReceivedMonoMs - probe.guestSentMonoMs) + (probe.hostSentMonoMs - probe.guestReceivedMonoMs)) / 2;
  if (invalid || sampleRttMs < 0 || sampleRttMs > MAX_PROBE_RTT_MS || !Number.isFinite(sampleOffsetMs)) {
    return { accepted: false, reason: 'invalid', mapping, sampleRttMs, sampleOffsetMs };
  }

  const allowance = Math.max(MIN_OUTLIER_ALLOWANCE_MS, mapping.uncertaintyMs * 4, mapping.jitterMs * 4);
  if (mapping.sampleCount >= 3 && Math.abs(sampleOffsetMs - mapping.offsetMs) > allowance) {
    return {
      accepted: false,
      reason: 'outlier',
      mapping: { ...mapping, rejectedOutliers: mapping.rejectedOutliers + 1 },
      sampleRttMs,
      sampleOffsetMs,
    };
  }

  const first = mapping.sampleCount === 0;
  const rttMs = first ? sampleRttMs : mapping.rttMs * 0.8 + sampleRttMs * 0.2;
  const jitterSample = Math.abs(sampleRttMs - rttMs);
  const jitterMs = first ? 0 : mapping.jitterMs * 0.8 + jitterSample * 0.2;
  const sampleUncertainty = sampleRttMs / 2 + jitterMs;
  return {
    accepted: true,
    reason: 'accepted',
    sampleRttMs,
    sampleOffsetMs,
    mapping: {
      ...mapping,
      offsetMs: first ? sampleOffsetMs : mapping.offsetMs * 0.8 + sampleOffsetMs * 0.2,
      rttMs,
      jitterMs,
      uncertaintyMs: first ? sampleUncertainty : mapping.uncertaintyMs * 0.8 + sampleUncertainty * 0.2,
      sampleCount: mapping.sampleCount + 1,
    },
  };
}

export function guestMonoToHostTime(mapping: HostTimeMapping, guestMonoMs: number): number {
  if (!Number.isFinite(guestMonoMs)) return mapping.lastHostTimeMs;
  return guestMonoMs + mapping.offsetMs;
}

export function hostTimeToGuestMono(
  mapping: HostTimeMapping,
  hostTimeMs: number,
  guestObservedMonoMs: number,
  observedHostTimeMs: number,
): number {
  if (![hostTimeMs, guestObservedMonoMs, observedHostTimeMs].every(Number.isFinite)) return guestObservedMonoMs;
  if (mapping.sampleCount > 0 && Number.isFinite(mapping.offsetMs)) return hostTimeMs - mapping.offsetMs;
  return guestObservedMonoMs + hostTimeMs - observedHostTimeMs;
}

export function monotonicMappedHostNow(mapping: HostTimeMapping, guestMonoMs: number): HostTimeMapping {
  const mapped = guestMonoToHostTime(mapping, guestMonoMs);
  const nextHostTimeMs = Number.isFinite(mapping.lastHostTimeMs) ? Math.max(mapping.lastHostTimeMs, mapped) : mapped;
  return { ...mapping, lastGuestMonoMs: guestMonoMs, lastHostTimeMs: nextHostTimeMs };
}

export function hostTimeDiagnostics(mapping: HostTimeMapping): Record<string, number> {
  return {
    offsetMs: Math.round(mapping.offsetMs * 100) / 100,
    rttMs: Math.round(mapping.rttMs * 100) / 100,
    jitterMs: Math.round(mapping.jitterMs * 100) / 100,
    uncertaintyMs: Number.isFinite(mapping.uncertaintyMs) ? Math.round(mapping.uncertaintyMs * 100) / 100 : -1,
    sampleCount: mapping.sampleCount,
    rejectedOutliers: mapping.rejectedOutliers,
  };
}
