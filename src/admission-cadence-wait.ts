/**
 * PASS 92 — Adaptive Match Admission Cadence Wait
 *
 * Evaluates whether match admission presentation has achieved stable frame cadence:
 * - Exits as soon as presented-frame cadence has been stable for N consecutive frames
 *   (default 30 consecutive frames within +/-20% of the median interval, with no long task > 50ms).
 * - Retains the 5,000 ms ceiling as a strict upper bound (never longer than today).
 * - A floor is only observed if configured and documented; with N=30 consecutive stable frames,
 *   cadence stability is proven empirically by real frames (~500ms at 60Hz, ~210ms at 144Hz)
 *   rather than an arbitrary wall-clock sleep.
 * - Publishes the achieved wait time and exit reason into the admission profile.
 */

export const ADMISSION_CADENCE_TARGET_STABLE_FRAMES = 30;
export const ADMISSION_CADENCE_CEILING_MS = 5_000;
export const ADMISSION_CADENCE_MAX_LONG_TASK_MS = 50;
export const ADMISSION_CADENCE_MEDIAN_TOLERANCE = 0.20;

export interface AdaptiveCadenceEvaluationInput {
  now: number;
  startedAt: number;
  previousFrameAt: number;
  consecutiveStableFrames: number;
  recentGapsMs: readonly number[];
  progressReady: boolean;
  ceilingMs?: number;
  targetStableFrames?: number;
  maxLongTaskMs?: number;
  tolerance?: number;
  floorMs?: number;
}

export interface AdaptiveCadenceDecision {
  shouldExit: boolean;
  reason: 'stable-cadence-achieved' | 'ceiling-timeout' | 'sampling' | 'unstable-hitch' | 'unstable-variance';
  admittedDegraded: boolean;
  consecutiveStableFrames: number;
  currentGapMs: number;
  medianGapMs: number | null;
  isStableGap: boolean;
}

export function computeMedianGap(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function evaluateAdaptiveCadenceDecision(input: AdaptiveCadenceEvaluationInput): AdaptiveCadenceDecision {
  const ceilingMs = input.ceilingMs ?? ADMISSION_CADENCE_CEILING_MS;
  const targetStableFrames = input.targetStableFrames ?? ADMISSION_CADENCE_TARGET_STABLE_FRAMES;
  const maxLongTaskMs = input.maxLongTaskMs ?? ADMISSION_CADENCE_MAX_LONG_TASK_MS;
  const tolerance = input.tolerance ?? ADMISSION_CADENCE_MEDIAN_TOLERANCE;
  const floorMs = input.floorMs ?? 0;

  const elapsedMs = Math.max(0, input.now - input.startedAt);

  // Strict upper bound: ceiling timeout always exits degraded.
  if (elapsedMs >= ceilingMs) {
    const currentGapMs = input.previousFrameAt > 0 ? Math.max(0, input.now - input.previousFrameAt) : 0;
    return {
      shouldExit: true,
      reason: 'ceiling-timeout',
      admittedDegraded: true,
      consecutiveStableFrames: input.consecutiveStableFrames,
      currentGapMs,
      medianGapMs: computeMedianGap(input.recentGapsMs),
      isStableGap: false,
    };
  }

  // First sample establishes the timeline (no interval measured yet).
  if (input.previousFrameAt <= 0) {
    return {
      shouldExit: false,
      reason: 'sampling',
      admittedDegraded: false,
      consecutiveStableFrames: 0,
      currentGapMs: 0,
      medianGapMs: null,
      isStableGap: true,
    };
  }

  const currentGapMs = Math.max(0, input.now - input.previousFrameAt);

  // Any frame longer than maxLongTaskMs (50 ms) is a hitch/long task: breaks stability.
  if (currentGapMs > maxLongTaskMs) {
    return {
      shouldExit: false,
      reason: 'unstable-hitch',
      admittedDegraded: false,
      consecutiveStableFrames: 0,
      currentGapMs,
      medianGapMs: computeMedianGap(input.recentGapsMs),
      isStableGap: false,
    };
  }

  // Evaluate stability relative to the median gap of recent frames.
  // With fewer than 5 samples, accept any frame <= maxLongTaskMs as stable warmup.
  let isStableGap = true;
  const medianGapMs = computeMedianGap(input.recentGapsMs);
  if (medianGapMs !== null && input.recentGapsMs.length >= 5) {
    const minAcceptable = medianGapMs * (1 - tolerance);
    const maxAcceptable = Math.min(maxLongTaskMs, medianGapMs * (1 + tolerance));
    if (currentGapMs < minAcceptable || currentGapMs > maxAcceptable) {
      isStableGap = false;
    }
  }

  const consecutiveStableFrames = isStableGap ? input.consecutiveStableFrames + 1 : 0;

  // Early exit condition: N consecutive stable frames, presentation progress ready, and past floor.
  if (consecutiveStableFrames >= targetStableFrames && input.progressReady && elapsedMs >= floorMs) {
    return {
      shouldExit: true,
      reason: 'stable-cadence-achieved',
      admittedDegraded: false,
      consecutiveStableFrames,
      currentGapMs,
      medianGapMs,
      isStableGap,
    };
  }

  return {
    shouldExit: false,
    reason: isStableGap ? 'sampling' : 'unstable-variance',
    admittedDegraded: false,
    consecutiveStableFrames,
    currentGapMs,
    medianGapMs,
    isStableGap,
  };
}
