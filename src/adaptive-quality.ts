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

export function adaptiveShadowsEnabled(profile: RenderProfile, authoredShadows: boolean, pixelRatioCap: number): boolean {
  return profile === 'blender' && authoredShadows && pixelRatioCap >= 0.85;
}

type AdaptiveQualityOptions = {
  profile: RenderProfile;
  targetFrameMs: number;
  initialPixelRatioCap: number;
  downshiftSamples?: number;
  upshiftSamples?: number;
  cooldownSamples?: number;
};

const LEVELS: Record<RenderProfile, readonly number[]> = {
  performance: [0.55, 0.65, 0.75],
  blender: [0.65, 0.75, 0.85, 1],
  compat: [0.2],
};

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
    this.levels = LEVELS[options.profile];
    const closest = this.levels.reduce((best, level, index) =>
      Math.abs(level - options.initialPixelRatioCap) < Math.abs(this.levels[best] - options.initialPixelRatioCap) ? index : best, 0);
    this.tier = closest;
    this.downshiftSamples = options.downshiftSamples ?? 90;
    this.upshiftSamples = options.upshiftSamples ?? 300;
    this.cooldownSamples = options.cooldownSamples ?? 180;
  }

  record(frameMs: number, eligible: boolean): number | null {
    if (this.options.profile === 'compat' || !eligible || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) {
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

  telemetry(): AdaptiveQualityTelemetry {
    return {
      enabled: this.options.profile !== 'compat',
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

export function classifyDisplayFrameMs(samples: readonly number[]): number {
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample > 4 && sample < 100).sort((a, b) => a - b);
  const measured = percentile(valid, 0.5);
  if (measured <= 12.5) return 1_000 / 120;
  if (measured <= 23) return 1_000 / 60;
  if (measured <= 42) return 1_000 / 30;
  // Very slow startup/browser-throttling samples are workload evidence, not a
  // credible display refresh rate. Treating 80-120ms as an 8-12Hz display
  // would hide genuine overload and prevent adaptation from ever engaging.
  return 1_000 / 60;
}
