export type HostClockProbe = Readonly<{
  guestSentMonoMs: number;
  hostReceivedMonoMs: number;
  hostSentMonoMs: number;
  guestReceivedMonoMs: number;
}>;

export type HostTimeMapping = Readonly<{
  offsetMs: number;
  driftPpm: number;
  referenceGuestMonoMs: number;
  rttMs: number;
  bestRttMs: number;
  jitterMs: number;
  uncertaintyMs: number;
  sampleCount: number;
  rejectedOutliers: number;
  lastGuestMonoMs: number;
  lastHostTimeMs: number;
  samples: readonly HostClockSample[];
}>;

export type HostClockSample = Readonly<{
  guestMonoMs: number;
  offsetMs: number;
  rttMs: number;
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
const CLOCK_SAMPLE_WINDOW = 12;
const MAX_OFFSET_STEP_MS = 2;
const MAX_DRIFT_PPM = 1_000;
const MIN_DRIFT_SPAN_MS = 1_000;

export function createHostTimeMapping(): HostTimeMapping {
  return {
    offsetMs: 0,
    driftPpm: 0,
    referenceGuestMonoMs: 0,
    rttMs: 0,
    bestRttMs: 0,
    jitterMs: 0,
    uncertaintyMs: Number.POSITIVE_INFINITY,
    sampleCount: 0,
    rejectedOutliers: 0,
    lastGuestMonoMs: Number.NEGATIVE_INFINITY,
    lastHostTimeMs: Number.NEGATIVE_INFINITY,
    samples: [],
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function lowRttSamples(samples: readonly HostClockSample[]): readonly HostClockSample[] {
  const ordered = [...samples].sort((a, b) => a.rttMs - b.rttMs || b.guestMonoMs - a.guestMonoMs);
  if (ordered.length <= 2) return ordered;
  const bestRttMs = ordered[0].rttMs;
  const threshold = bestRttMs + Math.max(2, median(ordered.map((sample) => sample.rttMs)) * 0.1);
  const selected = ordered.filter((sample) => sample.rttMs <= threshold).slice(0, 8);
  return selected.length >= 2 ? selected : ordered.slice(0, 2);
}

function estimateDriftPpm(samples: readonly HostClockSample[]): number {
  if (samples.length < 3) return 0;
  const firstAt = Math.min(...samples.map((sample) => sample.guestMonoMs));
  const lastAt = Math.max(...samples.map((sample) => sample.guestMonoMs));
  if (lastAt - firstAt < MIN_DRIFT_SPAN_MS) return 0;
  const meanAt = samples.reduce((total, sample) => total + sample.guestMonoMs, 0) / samples.length;
  const meanOffset = samples.reduce((total, sample) => total + sample.offsetMs, 0) / samples.length;
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    const deltaAt = sample.guestMonoMs - meanAt;
    numerator += deltaAt * (sample.offsetMs - meanOffset);
    denominator += deltaAt * deltaAt;
  }
  if (denominator <= 0) return 0;
  return Math.max(-MAX_DRIFT_PPM, Math.min(MAX_DRIFT_PPM, numerator / denominator * 1_000_000));
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

  const guestMonoMs = (probe.guestSentMonoMs + probe.guestReceivedMonoMs) / 2;
  const predictedOffsetMs = mapping.sampleCount === 0
    ? sampleOffsetMs
    : mapping.offsetMs + (guestMonoMs - mapping.referenceGuestMonoMs) * mapping.driftPpm / 1_000_000;
  const allowance = Math.max(
    MIN_OUTLIER_ALLOWANCE_MS,
    Number.isFinite(mapping.uncertaintyMs) ? Math.min(250, mapping.uncertaintyMs * 3) : 0,
    mapping.jitterMs * 4,
  );
  if (mapping.sampleCount >= 3 && Math.abs(sampleOffsetMs - predictedOffsetMs) > allowance) {
    return {
      accepted: false,
      reason: 'outlier',
      mapping: { ...mapping, rejectedOutliers: mapping.rejectedOutliers + 1 },
      sampleRttMs,
      sampleOffsetMs,
    };
  }

  const first = mapping.sampleCount === 0;
  const samples = [...mapping.samples, { guestMonoMs, offsetMs: sampleOffsetMs, rttMs: sampleRttMs }].slice(-CLOCK_SAMPLE_WINDOW);
  const selected = lowRttSamples(samples);
  const bestRttMs = Math.min(...samples.map((sample) => sample.rttMs));
  const rawDriftPpm = estimateDriftPpm(selected);
  const driftPpm = first ? 0 : mapping.driftPpm * 0.85 + rawDriftPpm * 0.15;
  const weighted = selected.map((sample) => ({
    offsetAtReference: sample.offsetMs + (guestMonoMs - sample.guestMonoMs) * driftPpm / 1_000_000,
    weight: 1 / (1 + Math.max(0, sample.rttMs - bestRttMs)),
  }));
  const targetOffsetMs = weighted.reduce((total, sample) => total + sample.offsetAtReference * sample.weight, 0)
    / weighted.reduce((total, sample) => total + sample.weight, 0);
  const offsetStep = targetOffsetMs - predictedOffsetMs;
  const offsetStepLimitMs = mapping.sampleCount < 4 ? Number.POSITIVE_INFINITY : MAX_OFFSET_STEP_MS;
  const offsetMs = first
    ? sampleOffsetMs
    : predictedOffsetMs + Math.max(-offsetStepLimitMs, Math.min(offsetStepLimitMs, offsetStep));
  const rttMs = median(samples.map((sample) => sample.rttMs));
  const jitterMs = median(samples.map((sample) => Math.abs(sample.rttMs - rttMs)));
  const offsetSpreadMs = Math.max(0, ...selected.map((sample) => Math.abs(
    sample.offsetMs + (guestMonoMs - sample.guestMonoMs) * driftPpm / 1_000_000 - offsetMs,
  )));
  const uncertaintyMs = bestRttMs / 2 + jitterMs + offsetSpreadMs;
  return {
    accepted: true,
    reason: 'accepted',
    sampleRttMs,
    sampleOffsetMs,
    mapping: {
      ...mapping,
      offsetMs,
      driftPpm,
      referenceGuestMonoMs: guestMonoMs,
      rttMs,
      bestRttMs,
      jitterMs,
      uncertaintyMs,
      sampleCount: mapping.sampleCount + 1,
      samples,
    },
  };
}

export function guestMonoToHostTime(mapping: HostTimeMapping, guestMonoMs: number): number {
  if (!Number.isFinite(guestMonoMs)) return mapping.lastHostTimeMs;
  return guestMonoMs + mapping.offsetMs
    + (guestMonoMs - mapping.referenceGuestMonoMs) * mapping.driftPpm / 1_000_000;
}

export function hostTimeToGuestMono(
  mapping: HostTimeMapping,
  hostTimeMs: number,
  guestObservedMonoMs: number,
  observedHostTimeMs: number,
): number {
  if (![hostTimeMs, guestObservedMonoMs, observedHostTimeMs].every(Number.isFinite)) return guestObservedMonoMs;
  if (mapping.sampleCount > 0 && Number.isFinite(mapping.offsetMs)) {
    const drift = mapping.driftPpm / 1_000_000;
    return (hostTimeMs - mapping.offsetMs + mapping.referenceGuestMonoMs * drift) / (1 + drift);
  }
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
    driftPpm: Math.round(mapping.driftPpm * 100) / 100,
    rttMs: Math.round(mapping.rttMs * 100) / 100,
    bestRttMs: Math.round(mapping.bestRttMs * 100) / 100,
    jitterMs: Math.round(mapping.jitterMs * 100) / 100,
    uncertaintyMs: Number.isFinite(mapping.uncertaintyMs) ? Math.round(mapping.uncertaintyMs * 100) / 100 : -1,
    sampleCount: mapping.sampleCount,
    windowSize: mapping.samples.length,
    rejectedOutliers: mapping.rejectedOutliers,
  };
}
