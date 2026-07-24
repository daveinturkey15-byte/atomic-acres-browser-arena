export type SnapshotRateHz = 20 | 30 | 40;

export type ReplicationPressure = Readonly<{
  rttMs: number;
  jitterMs: number;
  sequenceGaps: number;
  reordered: number;
  bufferedPressure: number;
}>;

export type SnapshotRateState = Readonly<{
  rateHz: SnapshotRateHz;
  enteredAt: number;
  stableSamples: number;
  pressuredSamples: number;
  transitions: number;
}>;

export type TimestampedSnapshot<T> = Readonly<{
  seq: number;
  hostTimeMs: number;
  continuity: number;
  value: T;
}>;

export type SnapshotBufferStats = Readonly<{
  accepted: number;
  duplicates: number;
  reordered: number;
  sequenceGaps: number;
  discontinuities: number;
  underruns: number;
}>;

export type InterpolatedSnapshot<T> = Readonly<{
  value: T;
  renderedHostTimeMs: number;
  renderedWorldAgeMs: number;
  mode: 'interpolated' | 'held-oldest' | 'held-latest';
  fromSeq: number;
  toSeq: number;
  alpha: number;
}>;

export const SNAPSHOT_RATES: readonly SnapshotRateHz[] = Object.freeze([20, 30, 40]);
export const DEFAULT_SNAPSHOT_RATE_HZ: SnapshotRateHz = 40;
/** Legacy gameplay-contract aliases; runtime pacing is controller-driven. */
export const STATE_BROADCAST_INTERVAL_MS = 50;
export const REMOTE_INTERPOLATION_RATE = 24;
export const SNAPSHOT_INTERPOLATION_DELAY_MS = 100;
export const MIN_RATE_RESIDENCY_MS = 1_000;
export const PROMOTION_RESIDENCY_MS = 5_000;
export const PROMOTION_STABLE_SAMPLES = 8;
export const DEMOTION_PRESSURE_SAMPLES = 2;

export function createSnapshotRateState(now = 0): SnapshotRateState {
  return { rateHz: DEFAULT_SNAPSHOT_RATE_HZ, enteredAt: now, stableSamples: 0, pressuredSamples: 0, transitions: 0 };
}

export function snapshotIntervalMs(rateHz: SnapshotRateHz): number {
  return 1_000 / rateHz;
}

export function desiredSnapshotRate(input: ReplicationPressure): SnapshotRateHz {
  const pressure = Number.isFinite(input.bufferedPressure) ? Math.max(0, input.bufferedPressure) : 1;
  if (input.rttMs > 220 || input.jitterMs > 60 || input.sequenceGaps >= 3 || input.reordered >= 2 || pressure >= 0.6) return 20;
  if (input.rttMs > 100 || input.jitterMs > 20 || input.sequenceGaps > 0 || input.reordered > 0 || pressure >= 0.2) return 30;
  return 40;
}

export function updateSnapshotRate(state: SnapshotRateState, input: ReplicationPressure, now: number): SnapshotRateState {
  if (!Number.isFinite(now)) return state;
  const desired = desiredSnapshotRate(input);
  const pressure = desired < state.rateHz;
  const stable = desired > state.rateHz;
  const pressuredSamples = pressure ? state.pressuredSamples + 1 : 0;
  const stableSamples = stable ? state.stableSamples + 1 : 0;
  const residency = now - state.enteredAt;

  if (pressure && pressuredSamples >= DEMOTION_PRESSURE_SAMPLES && residency >= MIN_RATE_RESIDENCY_MS) {
    return { rateHz: desired, enteredAt: now, stableSamples: 0, pressuredSamples: 0, transitions: state.transitions + 1 };
  }
  if (stable && stableSamples >= PROMOTION_STABLE_SAMPLES && residency >= PROMOTION_RESIDENCY_MS) {
    const promoted: SnapshotRateHz = state.rateHz === 20 ? 30 : 40;
    return { rateHz: Math.min(promoted, desired) as SnapshotRateHz, enteredAt: now, stableSamples: 0, pressuredSamples: 0, transitions: state.transitions + 1 };
  }
  return { ...state, stableSamples, pressuredSamples };
}

export class SnapshotInterpolationBuffer<T> {
  private samples: TimestampedSnapshot<T>[] = [];
  private mutableStats: SnapshotBufferStats = {
    accepted: 0,
    duplicates: 0,
    reordered: 0,
    sequenceGaps: 0,
    discontinuities: 0,
    underruns: 0,
  };

  constructor(private readonly interpolate: (before: T, after: T, alpha: number) => T, private readonly limit = 32) {}

  push(sample: TimestampedSnapshot<T>): boolean {
    if (!Number.isSafeInteger(sample.seq) || sample.seq < 0 || !Number.isSafeInteger(sample.continuity) || sample.continuity < 0
      || !Number.isFinite(sample.hostTimeMs)) return false;
    const latest = this.samples.at(-1);
    if (latest && latest.continuity !== sample.continuity) {
      this.samples = [];
      this.mutableStats = { ...this.mutableStats, discontinuities: this.mutableStats.discontinuities + 1 };
    }
    if (this.samples.some((item) => item.seq === sample.seq)) {
      this.mutableStats = { ...this.mutableStats, duplicates: this.mutableStats.duplicates + 1 };
      return false;
    }
    const insertion = this.samples.findIndex((item) => item.hostTimeMs > sample.hostTimeMs);
    if (insertion >= 0) {
      this.samples.splice(insertion, 0, sample);
      this.mutableStats = { ...this.mutableStats, reordered: this.mutableStats.reordered + 1 };
    } else {
      if (latest && sample.seq > latest.seq + 1) {
        this.mutableStats = { ...this.mutableStats, sequenceGaps: this.mutableStats.sequenceGaps + sample.seq - latest.seq - 1 };
      }
      this.samples.push(sample);
    }
    while (this.samples.length > this.limit) this.samples.shift();
    this.mutableStats = { ...this.mutableStats, accepted: this.mutableStats.accepted + 1 };
    return true;
  }

  sample(hostNowMs: number, delayMs = SNAPSHOT_INTERPOLATION_DELAY_MS): InterpolatedSnapshot<T> | null {
    if (!Number.isFinite(hostNowMs) || this.samples.length === 0) return null;
    const targetTime = hostNowMs - Math.max(0, delayMs);
    const first = this.samples[0];
    const latest = this.samples.at(-1)!;
    if (targetTime <= first.hostTimeMs) {
      this.mutableStats = { ...this.mutableStats, underruns: this.mutableStats.underruns + 1 };
      return this.result(first.value, first.hostTimeMs, hostNowMs, 'held-oldest', first.seq, first.seq, 0);
    }
    if (targetTime >= latest.hostTimeMs) {
      return this.result(latest.value, latest.hostTimeMs, hostNowMs, 'held-latest', latest.seq, latest.seq, 1);
    }
    for (let index = 1; index < this.samples.length; index += 1) {
      const after = this.samples[index];
      if (after.hostTimeMs < targetTime) continue;
      const before = this.samples[index - 1];
      const span = Math.max(0.001, after.hostTimeMs - before.hostTimeMs);
      const alpha = Math.max(0, Math.min(1, (targetTime - before.hostTimeMs) / span));
      return this.result(this.interpolate(before.value, after.value, alpha), targetTime, hostNowMs, 'interpolated', before.seq, after.seq, alpha);
    }
    return this.result(latest.value, latest.hostTimeMs, hostNowMs, 'held-latest', latest.seq, latest.seq, 1);
  }

  clear(): void {
    this.samples = [];
  }

  get depth(): number {
    return this.samples.length;
  }

  get stats(): SnapshotBufferStats {
    return { ...this.mutableStats };
  }

  private result(value: T, renderedHostTimeMs: number, hostNowMs: number, mode: InterpolatedSnapshot<T>['mode'], fromSeq: number, toSeq: number, alpha: number): InterpolatedSnapshot<T> {
    return { value, renderedHostTimeMs, renderedWorldAgeMs: Math.max(0, hostNowMs - renderedHostTimeMs), mode, fromSeq, toSeq, alpha };
  }
}

export function shortestYaw(before: number, after: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(after - before), Math.cos(after - before));
  return before + delta * alpha;
}
