export type FrameTailCounts = Readonly<{
  over20Ms: number;
  over33Ms: number;
  over50Ms: number;
  over100Ms: number;
}>;

export type FrameTailRates = Readonly<{
  over20MsPer1000: number;
  over33MsPer1000: number;
  over50MsPer1000: number;
  over100MsPer1000: number;
}>;

export type FramePacingWindowSummary = Readonly<{
  windowMs: number;
  sampleCount: number;
  rejectedSampleCount: number;
  cadenceHz: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  longFrames: FrameTailCounts;
  longFrameRates: FrameTailRates;
}>;

export type FramePacingThresholds = Readonly<{
  minimumWindowMs: number;
  minimumCadenceHz: number;
  maximumP50Ms: number;
  maximumP95Ms: number;
  maximumP99Ms: number;
  maximumFrameMs: number;
  maximumOver20MsPer1000: number;
  maximumOver33MsPer1000: number;
  maximumOver50MsPer10Seconds: number;
  maximumSteadyLongTasks: number;
  atomicDelta: Readonly<{
    cadenceFixedHz: number;
    cadenceFraction: number;
    maxFixedMs: number;
    maxFraction: number;
    over20MsPer1000: number;
    over33MsPer1000: number;
    over50MsPer1000: number;
  }>;
}>;

/**
 * Pass 65 owner-hardware thresholds. These are intentionally fixed in source:
 * environment variables can lengthen/repeat a run, but cannot weaken it.
 *
 * 20 ms is the 50 FPS presentation boundary, 33 ms is one dropped 60 Hz frame,
 * 50 ms is a plainly visible hitch, and 100 ms is a release-blocking freeze.
 */
export const PASS65_FRAME_PACING_THRESHOLDS: FramePacingThresholds = Object.freeze({
  minimumWindowMs: 10_000,
  minimumCadenceHz: 45,
  maximumP50Ms: 18.5,
  maximumP95Ms: 20,
  maximumP99Ms: 33,
  maximumFrameMs: 100,
  maximumOver20MsPer1000: 50,
  maximumOver33MsPer1000: 10,
  maximumOver50MsPer10Seconds: 1,
  maximumSteadyLongTasks: 0,
  atomicDelta: Object.freeze({
    cadenceFixedHz: 5,
    cadenceFraction: 0.05,
    maxFixedMs: 12,
    maxFraction: 0.30,
    over20MsPer1000: 15,
    over33MsPer1000: 5,
    over50MsPer1000: 2,
  }),
});

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(ordered: readonly number[], fraction: number): number {
  if (ordered.length === 0) return Number.POSITIVE_INFINITY;
  return ordered[Math.floor((ordered.length - 1) * Math.max(0, Math.min(1, fraction)))]!;
}

function per1000(count: number, sampleCount: number): number {
  return sampleCount > 0 ? rounded(count * 1_000 / sampleCount) : Number.POSITIVE_INFINITY;
}

export function summarizeFramePacingWindow(
  samples: readonly number[],
  windowMs: number,
): FramePacingWindowSummary {
  const accepted = samples.filter((sample) => Number.isFinite(sample) && sample > 0);
  const ordered = [...accepted].sort((left, right) => left - right);
  const count = (threshold: number) => ordered.filter((sample) => sample > threshold).length;
  const longFrames = Object.freeze({
    over20Ms: count(20),
    over33Ms: count(33),
    over50Ms: count(50),
    over100Ms: count(100),
  });
  return Object.freeze({
    windowMs: rounded(windowMs),
    sampleCount: ordered.length,
    rejectedSampleCount: samples.length - ordered.length,
    cadenceHz: Number.isFinite(windowMs) && windowMs > 0 ? rounded(ordered.length * 1_000 / windowMs) : 0,
    p50Ms: rounded(percentile(ordered, 0.50)),
    p95Ms: rounded(percentile(ordered, 0.95)),
    p99Ms: rounded(percentile(ordered, 0.99)),
    maxMs: rounded(ordered.at(-1) ?? Number.POSITIVE_INFINITY),
    longFrames,
    longFrameRates: Object.freeze({
      over20MsPer1000: per1000(longFrames.over20Ms, ordered.length),
      over33MsPer1000: per1000(longFrames.over33Ms, ordered.length),
      over50MsPer1000: per1000(longFrames.over50Ms, ordered.length),
      over100MsPer1000: per1000(longFrames.over100Ms, ordered.length),
    }),
  });
}

export function validateFramePacingWindow(
  summary: FramePacingWindowSummary,
  steadyLongTaskCount: number,
  observerSupported: boolean,
  thresholds: FramePacingThresholds = PASS65_FRAME_PACING_THRESHOLDS,
): readonly string[] {
  const issues: string[] = [];
  const minimumSamples = Math.floor(summary.windowMs * thresholds.minimumCadenceHz / 1_000);
  if (summary.windowMs < thresholds.minimumWindowMs) issues.push(`window-too-short:${summary.windowMs}/${thresholds.minimumWindowMs}`);
  if (summary.rejectedSampleCount > 0) issues.push(`invalid-frame-samples:${summary.rejectedSampleCount}`);
  if (summary.sampleCount < minimumSamples) issues.push(`insufficient-frame-samples:${summary.sampleCount}/${minimumSamples}`);
  if (summary.cadenceHz < thresholds.minimumCadenceHz) issues.push(`cadence-below-${thresholds.minimumCadenceHz}hz:${summary.cadenceHz}`);
  if (summary.p50Ms > thresholds.maximumP50Ms) issues.push(`p50-over-${thresholds.maximumP50Ms}ms:${summary.p50Ms}`);
  if (summary.p95Ms > thresholds.maximumP95Ms) issues.push(`p95-over-${thresholds.maximumP95Ms}ms:${summary.p95Ms}`);
  if (summary.p99Ms > thresholds.maximumP99Ms) issues.push(`p99-over-${thresholds.maximumP99Ms}ms:${summary.p99Ms}`);
  if (summary.maxMs > thresholds.maximumFrameMs) issues.push(`frame-over-${thresholds.maximumFrameMs}ms:${summary.maxMs}`);
  if (summary.longFrames.over100Ms > 0) issues.push(`frames-over-100ms:${summary.longFrames.over100Ms}`);
  if (summary.longFrameRates.over20MsPer1000 > thresholds.maximumOver20MsPer1000) {
    issues.push(`over-20ms-rate:${summary.longFrameRates.over20MsPer1000}/${thresholds.maximumOver20MsPer1000}`);
  }
  if (summary.longFrameRates.over33MsPer1000 > thresholds.maximumOver33MsPer1000) {
    issues.push(`over-33ms-rate:${summary.longFrameRates.over33MsPer1000}/${thresholds.maximumOver33MsPer1000}`);
  }
  const maximumOver50Ms = Math.max(1, Math.ceil(summary.windowMs / 10_000)) * thresholds.maximumOver50MsPer10Seconds;
  if (summary.longFrames.over50Ms > maximumOver50Ms) {
    issues.push(`frames-over-50ms:${summary.longFrames.over50Ms}/${maximumOver50Ms}`);
  }
  if (!observerSupported) issues.push('long-task-observer-unavailable');
  if (steadyLongTaskCount > thresholds.maximumSteadyLongTasks) {
    issues.push(`steady-long-tasks:${steadyLongTaskCount}/${thresholds.maximumSteadyLongTasks}`);
  }
  return Object.freeze(issues);
}

function materiallyAbove(candidate: number, baseline: number, fixedMs: number, fraction: number): boolean {
  return candidate > baseline + Math.max(fixedMs, baseline * fraction);
}

function materiallyBelow(candidate: number, baseline: number, fixed: number, fraction: number): boolean {
  return candidate < baseline - Math.max(fixed, baseline * fraction);
}

export function compareAtomicAgainstTerminal(
  atomic: FramePacingWindowSummary,
  terminal: FramePacingWindowSummary,
  thresholds: FramePacingThresholds = PASS65_FRAME_PACING_THRESHOLDS,
): readonly string[] {
  const delta = thresholds.atomicDelta;
  const issues: string[] = [];
  // Browser callbacks are quantized at display intervals, so p95/p99 can jump
  // an entire refresh slot when otherwise-near-identical distributions straddle
  // a percentile boundary. Compare actual delivered throughput and hitch tails;
  // validateFramePacingWindow still enforces every absolute percentile limit.
  if (materiallyBelow(atomic.cadenceHz, terminal.cadenceHz, delta.cadenceFixedHz, delta.cadenceFraction)) {
    issues.push(`atomic-cadence-materially-worse:${atomic.cadenceHz}/${terminal.cadenceHz}`);
  }
  if (materiallyAbove(atomic.maxMs, terminal.maxMs, delta.maxFixedMs, delta.maxFraction)) {
    issues.push(`atomic-max-materially-worse:${atomic.maxMs}/${terminal.maxMs}`);
  }
  if (atomic.longFrameRates.over20MsPer1000 > terminal.longFrameRates.over20MsPer1000 + delta.over20MsPer1000) {
    issues.push(`atomic-over-20ms-rate-materially-worse:${atomic.longFrameRates.over20MsPer1000}/${terminal.longFrameRates.over20MsPer1000}`);
  }
  if (atomic.longFrameRates.over33MsPer1000 > terminal.longFrameRates.over33MsPer1000 + delta.over33MsPer1000) {
    issues.push(`atomic-over-33ms-rate-materially-worse:${atomic.longFrameRates.over33MsPer1000}/${terminal.longFrameRates.over33MsPer1000}`);
  }
  if (atomic.longFrameRates.over50MsPer1000 > terminal.longFrameRates.over50MsPer1000 + delta.over50MsPer1000) {
    issues.push(`atomic-over-50ms-rate-materially-worse:${atomic.longFrameRates.over50MsPer1000}/${terminal.longFrameRates.over50MsPer1000}`);
  }
  return Object.freeze(issues);
}
