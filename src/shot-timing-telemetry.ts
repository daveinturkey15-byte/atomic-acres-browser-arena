export type SpacingSummary = Readonly<{
  count: number;
  lastMs: number | null;
  minimumMs: number | null;
  maximumMs: number | null;
  meanMs: number | null;
  p95Ms: number | null;
}>;

export type ShotTimingTelemetrySnapshot = Readonly<{
  authoredSpacing: SpacingSummary;
  packetReceiptSpacing: SpacingSummary;
  resolutionSpacing: SpacingSummary;
  resultDeliverySpacing: SpacingSummary;
  appliedRewindHistogram: Readonly<{
    '0-50': number;
    '50-130': number;
    '130-180': number;
    '180-250': number;
    rejected: number;
  }>;
  eventLaneBufferedBytes: Readonly<{ last: number; maximum: number }>;
}>;

const SAMPLE_LIMIT = 64;

function appendBounded(values: number[], value: number): void {
  if (!Number.isFinite(value)) return;
  values.push(value);
  while (values.length > SAMPLE_LIMIT) values.shift();
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarize(values: readonly number[]): SpacingSummary {
  if (values.length === 0) {
    return { count: 0, lastMs: null, minimumMs: null, maximumMs: null, meanMs: null, p95Ms: null };
  }
  const ordered = [...values].sort((a, b) => a - b);
  const p95Index = Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1);
  return {
    count: values.length,
    lastMs: rounded(values.at(-1)!),
    minimumMs: rounded(ordered[0]),
    maximumMs: rounded(ordered.at(-1)!),
    meanMs: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    p95Ms: rounded(ordered[p95Index]),
  };
}

export class ShotTimingTelemetry {
  private authoredTimesMs: number[] = [];
  private packetReceiptSpacingMs: number[] = [];
  private resolutionSpacingMs: number[] = [];
  private resultDeliverySpacingMs: number[] = [];
  private lastReceiptAt: number | null = null;
  private lastResolutionAt: number | null = null;
  private lastDeliveryAt: number | null = null;
  private rewindHistogram = { '0-50': 0, '50-130': 0, '130-180': 0, '180-250': 0, rejected: 0 };
  private eventBufferedLast = 0;
  private eventBufferedMaximum = 0;

  reset(): void {
    this.authoredTimesMs = [];
    this.packetReceiptSpacingMs = [];
    this.resolutionSpacingMs = [];
    this.resultDeliverySpacingMs = [];
    this.lastReceiptAt = null;
    this.lastResolutionAt = null;
    this.lastDeliveryAt = null;
    this.rewindHistogram = { '0-50': 0, '50-130': 0, '130-180': 0, '180-250': 0, rejected: 0 };
    this.eventBufferedLast = 0;
    this.eventBufferedMaximum = 0;
  }

  recordHostResolution(input: Readonly<{
    fireTimeMs: number;
    receivedAtHostTimeMs: number;
    resolvedAtHostTimeMs: number;
    appliedRewindMs: number;
    rejected: boolean;
    eventLaneBufferedBytes?: number;
  }>): void {
    if (Number.isFinite(input.fireTimeMs)) {
      this.authoredTimesMs.push(input.fireTimeMs);
      this.authoredTimesMs.sort((a, b) => a - b);
      while (this.authoredTimesMs.length > SAMPLE_LIMIT + 1) this.authoredTimesMs.shift();
    }
    if (this.lastReceiptAt !== null) appendBounded(this.packetReceiptSpacingMs, input.receivedAtHostTimeMs - this.lastReceiptAt);
    if (this.lastResolutionAt !== null) appendBounded(this.resolutionSpacingMs, input.resolvedAtHostTimeMs - this.lastResolutionAt);
    this.lastReceiptAt = input.receivedAtHostTimeMs;
    this.lastResolutionAt = input.resolvedAtHostTimeMs;
    if (input.rejected) this.rewindHistogram.rejected += 1;
    else if (input.appliedRewindMs < 50) this.rewindHistogram['0-50'] += 1;
    else if (input.appliedRewindMs < 130) this.rewindHistogram['50-130'] += 1;
    else if (input.appliedRewindMs < 180) this.rewindHistogram['130-180'] += 1;
    else this.rewindHistogram['180-250'] += 1;
    const buffered = Number.isFinite(input.eventLaneBufferedBytes) ? Math.max(0, input.eventLaneBufferedBytes!) : 0;
    this.eventBufferedLast = buffered;
    this.eventBufferedMaximum = Math.max(this.eventBufferedMaximum, buffered);
  }

  recordResultDelivery(deliveredAtMs: number): void {
    if (!Number.isFinite(deliveredAtMs)) return;
    if (this.lastDeliveryAt !== null) appendBounded(this.resultDeliverySpacingMs, deliveredAtMs - this.lastDeliveryAt);
    this.lastDeliveryAt = deliveredAtMs;
  }

  snapshot(): ShotTimingTelemetrySnapshot {
    const authoredSpacingMs = this.authoredTimesMs.slice(1).map((at, index) => at - this.authoredTimesMs[index]);
    return {
      authoredSpacing: summarize(authoredSpacingMs),
      packetReceiptSpacing: summarize(this.packetReceiptSpacingMs),
      resolutionSpacing: summarize(this.resolutionSpacingMs),
      resultDeliverySpacing: summarize(this.resultDeliverySpacingMs),
      appliedRewindHistogram: { ...this.rewindHistogram },
      eventLaneBufferedBytes: { last: this.eventBufferedLast, maximum: this.eventBufferedMaximum },
    };
  }
}
