import type { RenderProfile } from './render-profile';

export type AdaptiveQualityTelemetry = {
  enabled: boolean;
  profile: RenderProfile;
  tier: number;
  levels: readonly number[];
  pixelRatioCap: number;
  targetFrameMs: number;
  p50Ms: number;
  p95Ms: number;
  samples: number;
  downshifts: number;
  upshifts: number;
  lastReason: string;
  cooldownFrames: number;
};

export type WebGpuPresentationIdleState = Readonly<{
  submissionSequence: number;
  completedSequence: number;
  pendingSince: number | null;
}>;

/** Keeps renderer target mutations queued until the bounded GPU frontier is fully idle. */
export class DeferredAdaptivePixelRatio {
  private pendingPixelRatio: number | null = null;

  request(pixelRatio: number): void {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    this.pendingPixelRatio = pixelRatio;
  }

  takeWhenPresentationIdle(presentation: WebGpuPresentationIdleState): number | null {
    if (this.pendingPixelRatio === null
      || presentation.submissionSequence !== presentation.completedSequence
      || presentation.pendingSince !== null) return null;
    const pixelRatio = this.pendingPixelRatio;
    this.pendingPixelRatio = null;
    return pixelRatio;
  }

  pending(): number | null {
    return this.pendingPixelRatio;
  }

  clear(): void {
    this.pendingPixelRatio = null;
  }
}

export function adaptiveShadowsEnabled(profile: RenderProfile, authoredShadows: boolean, pixelRatioCap: number): boolean {
  // Shadows are an explicit player choice, not a disposable post effect. The
  // controller sheds bloom, contact shading, fog, particles, decals, IBL and
  // resolution first. Performance stays shadow-free through its preset, while
  // Custom may independently combine reduced geometry with authored shadows.
  return profile !== 'compat' && authoredShadows && Number.isFinite(pixelRatioCap) && pixelRatioCap > 0;
}

/** WebGPU target reallocations are admission-only; WebGL2 retains its established live controller. */
export function shouldFreezeAdaptiveQualityForMatch(backend: 'webgpu' | 'webgl2'): boolean {
  return backend === 'webgpu';
}

/** Rejects a catastrophic completed-queue sample; it never selects a quality tier. */
export function assertWebGpuAdmissionCompletionLatency(
  label: string,
  completionLatencyMs: number | null,
  maximumLatencyMs = 4_000,
): asserts completionLatencyMs is number {
  if (completionLatencyMs === null || !Number.isFinite(completionLatencyMs) || completionLatencyMs < 0) {
    throw new Error(`${label} presentation completed without a valid queue-latency sample`);
  }
  if (completionLatencyMs > maximumLatencyMs) {
    throw new Error(`${label} presentation completion latency ${completionLatencyMs.toFixed(1)}ms exceeded the ${maximumLatencyMs}ms admission limit`);
  }
}

type AdaptiveQualityOptions = {
  profile: RenderProfile;
  targetFrameMs: number;
  initialPixelRatioCap: number;
  enabled?: boolean;
  levels?: readonly number[];
  downshiftSamples?: number;
  upshiftSamples?: number;
  cooldownSamples?: number;
};

const LEVELS: Record<RenderProfile, readonly number[]> = {
  performance: [0.55, 0.65, 0.75],
  blender: [0.55, 0.65, 0.75, 0.85, 1],
  compat: [0.2],
};

/**
 * Builds adaptive tiers whose maximum is always the player's selected render
 * scale. This prevents Custom low-scale configurations from upshifting above
 * their own cap while preserving the established 0.55/0.65/0.75 Performance
 * and 0.65/0.75/0.85/1.0 Quality tiers at the public preset defaults.
 */
export function configuredAdaptiveQualityLevels(
  profile: RenderProfile,
  pixelRatioCap: number,
  enabled: boolean,
): readonly number[] {
  const cap = Number.isFinite(pixelRatioCap) && pixelRatioCap > 0 ? pixelRatioCap : LEVELS[profile].at(-1) ?? 1;
  if (!enabled || profile === 'compat') return Object.freeze([cap]);
  const ratios = profile === 'performance' ? [0.73, 0.87, 1] : [0.55, 0.65, 0.75, 0.85, 1];
  const minimum = Math.min(0.5, cap);
  return Object.freeze([...new Set(ratios.map((ratio) => (
    Number(Math.min(cap, Math.max(minimum, cap * ratio)).toFixed(2))
  )))].sort((left, right) => left - right));
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

export class AdaptiveQualityController {
  private readonly levels: readonly number[];
  private tier: number;
  private readonly samples: number[] = [];
  private overloadSamples = 0;
  private headroomSamples = 0;
  private cooldownFrames = 0;
  private downshifts = 0;
  private upshifts = 0;
  private lastReason = 'initial profile tier';
  private p50Ms = 0;
  private p95Ms = 0;
  private readonly downshiftSamples: number;
  private readonly upshiftSamples: number;
  private readonly cooldownSamples: number;

  constructor(private readonly options: AdaptiveQualityOptions) {
    const suppliedLevels = options.levels?.filter((level) => Number.isFinite(level) && level > 0 && level <= 2);
    this.levels = suppliedLevels?.length ? Object.freeze([...new Set(suppliedLevels)].sort((left, right) => left - right)) : LEVELS[options.profile];
    const closest = this.levels.reduce((best, level, index) =>
      Math.abs(level - options.initialPixelRatioCap) < Math.abs(this.levels[best] - options.initialPixelRatioCap) ? index : best, 0);
    this.tier = closest;
    this.downshiftSamples = options.downshiftSamples ?? 90;
    this.upshiftSamples = options.upshiftSamples ?? 300;
    this.cooldownSamples = options.cooldownSamples ?? 180;
  }

  record(frameMs: number, eligible: boolean): number | null {
    if (this.options.enabled === false || this.options.profile === 'compat' || !eligible || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) {
      this.overloadSamples = 0;
      this.headroomSamples = 0;
      this.samples.length = 0;
      this.p50Ms = 0;
      this.p95Ms = 0;
      return null;
    }
    this.samples.push(frameMs);
    if (this.samples.length > 120) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.p50Ms = percentile(sorted, 0.5);
    this.p95Ms = percentile(sorted, 0.95);
    if (this.cooldownFrames > 0) {
      this.cooldownFrames -= 1;
      return null;
    }
    if (this.samples.length < 45) return null;

    const downThreshold = this.options.targetFrameMs * 1.12;
    // Upshifts require genuine spare GPU/compositor budget rather than merely
    // hovering at refresh. At 60 Hz this is 14.5 ms, leaving ~2.2 ms headroom.
    const upThreshold = this.options.targetFrameMs * 0.87;
    if (this.p95Ms > downThreshold && this.tier > 0) {
      this.overloadSamples += 1;
      this.headroomSamples = 0;
      if (this.overloadSamples >= this.downshiftSamples) {
        this.tier -= 1;
        this.downshifts += 1;
        this.overloadSamples = 0;
        this.cooldownFrames = this.cooldownSamples;
        this.lastReason = `sustained p95 ${this.p95Ms.toFixed(1)}ms above ${downThreshold.toFixed(1)}ms budget`;
        return this.levels[this.tier];
      }
      return null;
    }
    if (this.p95Ms <= upThreshold && this.tier < this.levels.length - 1) {
      this.headroomSamples += 1;
      this.overloadSamples = 0;
      if (this.headroomSamples >= this.upshiftSamples) {
        this.tier += 1;
        this.upshifts += 1;
        this.headroomSamples = 0;
        this.cooldownFrames = this.cooldownSamples;
        this.lastReason = `sustained p95 ${this.p95Ms.toFixed(1)}ms within ${upThreshold.toFixed(1)}ms recovery budget`;
        return this.levels[this.tier];
      }
      return null;
    }
    this.overloadSamples = 0;
    this.headroomSamples = 0;
    return null;
  }

  /**
   * Drops accumulated frame-time evidence without touching the current tier.
   * Used when the tab regains visibility: browser-throttled background frames
   * are scheduling artifacts, not workload evidence, and must never trigger a
   * downshift or block an upshift after refocus.
   */
  resetSampling(reason: string): void {
    this.samples.length = 0;
    this.overloadSamples = 0;
    this.headroomSamples = 0;
    this.cooldownFrames = 0;
    this.p50Ms = 0;
    this.p95Ms = 0;
    this.lastReason = reason;
  }

  /** Re-anchors a new match to the player's selected preset before any opaque admission sample. */
  seedPixelRatioCap(pixelRatioCap: number, reason: string): number {
    const closest = this.levels.reduce((best, level, index) =>
      Math.abs(level - pixelRatioCap) < Math.abs(this.levels[best] - pixelRatioCap) ? index : best, 0);
    this.tier = closest;
    this.samples.length = 0;
    this.overloadSamples = 0;
    this.headroomSamples = 0;
    this.cooldownFrames = 0;
    this.p50Ms = 0;
    this.p95Ms = 0;
    this.lastReason = reason;
    return this.levels[this.tier];
  }

  /**
   * Applies at most one pre-game downshift from a window of admitted WebGPU
   * submission gaps. The fixed limits deliberately describe catastrophic
   * under-performance, not monitor refresh: browser callbacks alone are not
   * GPU evidence and a 144/180 Hz display must not force Quality to its floor.
   * Active play keeps the admitted tier fixed so a framebuffer reallocation
   * cannot hitch gameplay.
   */
  calibrateSevereAdmissionDownshift(
    frameMsSamples: readonly number[],
    reason: string,
    p50LimitMs = 25,
    p95LimitMs = 50,
    minimumSamples = 24,
  ): number | null {
    if (this.options.enabled === false || this.options.profile === 'compat') return null;
    const valid = frameMsSamples
      .filter((sample) => Number.isFinite(sample) && sample > 0 && sample <= 250)
      .slice(-120);
    this.samples.splice(0, this.samples.length, ...valid);
    const sorted = [...valid].sort((left, right) => left - right);
    this.p50Ms = percentile(sorted, 0.5);
    this.p95Ms = percentile(sorted, 0.95);
    this.overloadSamples = 0;
    this.headroomSamples = 0;
    this.cooldownFrames = 0;
    if (valid.length < minimumSamples) {
      this.lastReason = `${reason}: ${valid.length}/${minimumSamples} valid calibration samples`;
      return null;
    }
    const severelyUnderperforming = this.p50Ms > p50LimitMs || this.p95Ms > p95LimitMs;
    if (!severelyUnderperforming) {
      this.lastReason = `${reason}: p50 ${this.p50Ms.toFixed(1)}ms/p95 ${this.p95Ms.toFixed(1)}ms within severe ${p50LimitMs.toFixed(1)}ms/${p95LimitMs.toFixed(1)}ms limits`;
      return null;
    }
    if (this.tier <= 0) {
      this.lastReason = `${reason}: p50 ${this.p50Ms.toFixed(1)}ms/p95 ${this.p95Ms.toFixed(1)}ms exceeded severe ${p50LimitMs.toFixed(1)}ms/${p95LimitMs.toFixed(1)}ms limits at minimum tier`;
      return null;
    }
    this.tier -= 1;
    this.downshifts += 1;
    this.lastReason = `${reason}: p50 ${this.p50Ms.toFixed(1)}ms/p95 ${this.p95Ms.toFixed(1)}ms exceeded severe ${p50LimitMs.toFixed(1)}ms/${p95LimitMs.toFixed(1)}ms limits`;
    return this.levels[this.tier];
  }

  telemetry(): AdaptiveQualityTelemetry {
    return {
      enabled: this.options.enabled !== false && this.options.profile !== 'compat',
      profile: this.options.profile,
      tier: this.tier,
      levels: this.levels,
      pixelRatioCap: this.levels[this.tier],
      targetFrameMs: this.options.targetFrameMs,
      p50Ms: this.p50Ms,
      p95Ms: this.p95Ms,
      samples: this.samples.length,
      downshifts: this.downshifts,
      upshifts: this.upshifts,
      lastReason: this.lastReason,
      cooldownFrames: this.cooldownFrames,
    };
  }
}

const COMMON_DISPLAY_REFRESH_HZ = [30, 60, 75, 90, 120, 144, 165, 180, 240, 360] as const;

export function classifyDisplayFrameMs(samples: readonly number[]): number {
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample > 2 && sample < 100).sort((a, b) => a - b);
  const measured = percentile(valid, 0.5);
  // Very slow startup/browser-throttling samples are workload evidence, not a
  // credible display refresh rate. Treating 80-120ms as an 8-12Hz display
  // would hide genuine overload and prevent adaptation from ever engaging.
  if (measured <= 0 || measured > 42) return 1_000 / 60;
  // High-refresh displays (144/165/180 Hz...) must keep their real cadence as
  // the adaptive budget. Bucketing 180 Hz down to a 120 or 60 Hz target let
  // frame times sag to 60-90 FPS on capable hardware without any response.
  const measuredHz = 1_000 / measured;
  const nearestHz = COMMON_DISPLAY_REFRESH_HZ.reduce((best, hz) => (
    Math.abs(hz - measuredHz) < Math.abs(best - measuredHz) ? hz : best
  ), COMMON_DISPLAY_REFRESH_HZ[0]);
  // Snap to a standard cadence only when the measurement credibly matches it;
  // otherwise trust the measured median (unusual or VRR displays).
  return Math.abs(nearestHz - measuredHz) <= measuredHz * 0.06 ? 1_000 / nearestHz : measured;
}
