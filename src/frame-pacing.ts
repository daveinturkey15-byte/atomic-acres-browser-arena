export type FramePacingSummary = {
  ready: boolean;
  sampleCount: number;
  cadenceHz: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  displayLimited: boolean;
};

export class FramePacingSampler {
  private readonly samples: number[] = [];

  record(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 1 || frameMs > 1_000) return;
    this.samples.push(frameMs);
    if (this.samples.length > 180) this.samples.splice(0, this.samples.length - 180);
  }

  summary(): FramePacingSummary {
    if (this.samples.length === 0) {
      return { ready: false, sampleCount: 0, cadenceHz: 0, medianMs: 0, p95Ms: 0, maxMs: 0, displayLimited: false };
    }
    const ordered = [...this.samples].sort((a, b) => a - b);
    const percentile = (fraction: number) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
    const medianMs = percentile(0.5);
    const p95Ms = percentile(0.95);
    const cadenceHz = medianMs > 0 ? 1000 / medianMs : 0;
    return {
      ready: ordered.length >= 90,
      sampleCount: ordered.length,
      cadenceHz,
      medianMs,
      p95Ms,
      maxMs: ordered[ordered.length - 1],
      displayLimited: ordered.length >= 90 && cadenceHz < 55,
    };
  }
}
