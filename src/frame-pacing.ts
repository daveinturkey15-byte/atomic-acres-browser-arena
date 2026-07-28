export type FramePacingSummary = {
  ready: boolean;
  sampleCount: number;
  cadenceHz: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  longFrames: Readonly<{
    over20Ms: number;
    over33Ms: number;
    over50Ms: number;
    over100Ms: number;
  }>;
  displayLimited: boolean;
  lastResetReason: string | null;
};

/**
 * A historical median cannot remain the effective cadence after presentation
 * progress stops. Once the current gap exceeds the historical frame interval,
 * decay toward the observable one-frame-per-gap rate.
 */
export function cadenceWithNoProgressAge(historicalCadenceHz: number, currentGapMs: number): number {
  if (!Number.isFinite(historicalCadenceHz) || historicalCadenceHz <= 0) return 0;
  if (!Number.isFinite(currentGapMs) || currentGapMs <= 0) return historicalCadenceHz;
  const historicalFrameMs = 1_000 / historicalCadenceHz;
  if (currentGapMs <= historicalFrameMs) return historicalCadenceHz;
  return Math.min(historicalCadenceHz, 1_000 / currentGapMs);
}

export class FramePacingSampler {
  private readonly samples: number[] = [];
  private lastResetReason: string | null = null;

  reset(reason: string): void {
    this.samples.length = 0;
    this.lastResetReason = reason.trim() || 'unspecified';
  }

  record(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 1 || frameMs > 1_000) return;
    this.samples.push(frameMs);
    if (this.samples.length > 180) this.samples.splice(0, this.samples.length - 180);
  }

  summary(): FramePacingSummary {
    if (this.samples.length === 0) {
      return {
        ready: false,
        sampleCount: 0,
        cadenceHz: 0,
        medianMs: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        longFrames: { over20Ms: 0, over33Ms: 0, over50Ms: 0, over100Ms: 0 },
        displayLimited: false,
        lastResetReason: this.lastResetReason,
      };
    }
    const ordered = [...this.samples].sort((a, b) => a - b);
    const percentile = (fraction: number) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
    const medianMs = percentile(0.5);
    const p95Ms = percentile(0.95);
    const p99Ms = percentile(0.99);
    const cadenceHz = medianMs > 0 ? 1000 / medianMs : 0;
    return {
      ready: ordered.length >= 90,
      sampleCount: ordered.length,
      cadenceHz,
      medianMs,
      p95Ms,
      p99Ms,
      maxMs: ordered[ordered.length - 1],
      longFrames: {
        over20Ms: ordered.filter((frameMs) => frameMs > 20).length,
        over33Ms: ordered.filter((frameMs) => frameMs > 33).length,
        over50Ms: ordered.filter((frameMs) => frameMs > 50).length,
        over100Ms: ordered.filter((frameMs) => frameMs > 100).length,
      },
      displayLimited: ordered.length >= 90 && cadenceHz < 55,
      lastResetReason: this.lastResetReason,
    };
  }
}
