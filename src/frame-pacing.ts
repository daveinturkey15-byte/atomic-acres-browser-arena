export type FramePacingSummary = {
  ready: boolean;
  sampleCount: number;
  /**
   * THE frame rate. Frames divided by elapsed time over the retained window -
   * the only cadence figure that survives bursty pacing.
   *
   * A MEDIAN GAP IS NOT A FRAME RATE. When two frames are admitted back to back
   * and the next is refused, the gaps are [8, 40, 8, 40...] and their median is
   * 8 ms - "125 fps" for a stream that is actually presenting 42. That is
   * exactly how the HUD read 60 while the owner was watching 20.
   */
  rateHz: number;
  /** Median gap. Kept for shape/tail reporting; never used as a frame rate. */
  cadenceHz: number;
  meanMs: number;
  /**
   * The FASTEST frames in the window. Nothing can present faster than the
   * display refresh, so the fifth-percentile interval is the best in-page
   * estimate of that ceiling - and unlike the mean or the median it does not
   * move when the renderer hitches.
   */
  p05Ms: number;
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
        rateHz: 0,
        cadenceHz: 0,
        meanMs: 0,
        p05Ms: 0,
        medianMs: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        longFrames: { over20Ms: 0, over33Ms: 0, over50Ms: 0, over100Ms: 0 },
        lastResetReason: this.lastResetReason,
      };
    }
    const ordered = [...this.samples].sort((a, b) => a - b);
    const percentile = (fraction: number) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
    const medianMs = percentile(0.5);
    const p95Ms = percentile(0.95);
    const p99Ms = percentile(0.99);
    const meanMs = ordered.reduce((total, sample) => total + sample, 0) / ordered.length;
    const cadenceHz = medianMs > 0 ? 1000 / medianMs : 0;
    return {
      ready: ordered.length >= 90,
      sampleCount: ordered.length,
      rateHz: meanMs > 0 ? 1_000 / meanMs : 0,
      cadenceHz,
      meanMs,
      p05Ms: percentile(0.05),
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
      lastResetReason: this.lastResetReason,
    };
  }
}

/**
 * Above this presented rate nobody needs to be told about their refresh rate.
 * Below it, a display running at its refresh ceiling is worth saying once.
 */
export const SMOOTH_PRESENTATION_FLOOR_HZ = 100;

/**
 * Is the DISPLAY the thing capping presentation?
 *
 * WHY THE OLD TEST COULD NEVER FIRE. It was `sampleCount >= 90 && cadenceHz <
 * 55` on a single interval stream. The owner's 180 Hz panel is set to 59 Hz in
 * Windows, so his presented cadence sits at 59.9 - above 55 - and the one
 * surface that would have told him he was looking at a display limit was
 * unreachable at exactly the refresh rate that needed it. Worse, the same test
 * fired at 40 fps when the RENDERER was the limit, which is not a display
 * problem at all and is not fixed by changing a Windows setting.
 *
 * A single stream cannot tell those apart, so this takes both: presentation is
 * display-limited when presented frames are TRACKING the callback (vsync)
 * cadence - the renderer is keeping up - and that cadence is below the smooth
 * floor. If presented falls materially below the callback cadence, the renderer
 * is the limit and this stays silent.
 */
export function presentationIsDisplayLimited(input: Readonly<{
  sampleCount: number;
  presentedCadenceHz: number;
  /**
   * The display's refresh CEILING, not the current callback rate. Take it from
   * the fastest frames (`p05Ms`): during a renderer hitch the callback rate
   * falls with the presented rate, and an instantaneous comparison then calls a
   * 33 fps hitch on a 60 Hz monitor a "33 Hz display limit".
   */
  callbackRefreshHz: number;
  minimumSamples?: number;
  smoothFloorHz?: number;
  trackingTolerance?: number;
}>): boolean {
  const minimumSamples = input.minimumSamples ?? 60;
  const smoothFloorHz = input.smoothFloorHz ?? SMOOTH_PRESENTATION_FLOOR_HZ;
  const trackingTolerance = input.trackingTolerance ?? 0.12;
  if (!Number.isFinite(input.presentedCadenceHz) || !Number.isFinite(input.callbackRefreshHz)) return false;
  if (input.sampleCount < minimumSamples) return false;
  if (input.callbackRefreshHz <= 0 || input.callbackRefreshHz >= smoothFloorHz) return false;
  // Presented must be keeping up with the refresh ceiling. If it is materially
  // below, the RENDERER is the limit and no display setting fixes that.
  const shortfall = (input.callbackRefreshHz - input.presentedCadenceHz) / input.callbackRefreshHz;
  return shortfall <= trackingTolerance;
}
