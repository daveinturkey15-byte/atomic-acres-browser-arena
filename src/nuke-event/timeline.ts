/**
 * Nuke Town detonation timing and replication contract.
 *
 * This file is deliberately renderer-free. The host's replicated end-state
 * timestamp is the only network trigger; presentation clocks only sample the
 * already-authorized timeline. That keeps every peer on the same phase even
 * when their local frames arrive at different times.
 */

export const NUKETOWN2_ARENA_ID = 'nuketown2';
export const NUKE_EVENT_BACKGROUND_DISTANCE_M = 680;
export const NUKE_EVENT_CAMERA_FAR_M = 900;
export const NUKE_EVENT_RAY_STEPS = 40;
export const NUKE_EVENT_RISE_SECONDS = 25;
export const NUKE_EVENT_TOTAL_SECONDS = 60;
export const NUKE_EVENT_BACKGROUND_BUDGET_P50_MS = 0.6;

export type NukeEventPhase = 'idle' | 'flash' | 'rising' | 'dissipating' | 'complete';

export type NukeEventTimeline = {
  phase: NukeEventPhase;
  elapsedSeconds: number;
  flashStrength: number;
  fireballStrength: number;
  growth: number;
  ringProgress: number;
  fade: number;
  active: boolean;
};

export type ReplicatedMatchEndState = Readonly<{
  phase: string;
  snapshotHostTimeMs: number | null;
}>;

const EMPTY_TIMELINE: NukeEventTimeline = Object.freeze({
  phase: 'idle', elapsedSeconds: 0, flashStrength: 0, fireballStrength: 0,
  growth: 0, ringProgress: 0, fade: 0, active: false,
});

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Stable event seed; peers derive the same visual noise from the same stamp. */
export function nukeEventSeed(triggerAtHostTimeMs: number): number {
  let value = (Math.round(triggerAtHostTimeMs) | 0) ^ 0x6e756b65;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/**
 * The only automatic trigger admission path. A local clock without an
 * already-replicated ended state is intentionally rejected.
 */
export function deriveNukeEventTriggerFromReplicatedState(
  selectedArenaId: string,
  state: ReplicatedMatchEndState | null | undefined,
): number | null {
  if (selectedArenaId !== NUKETOWN2_ARENA_ID || state?.phase !== 'ended') return null;
  if (!Number.isFinite(state.snapshotHostTimeMs) || state.snapshotHostTimeMs! < 0) return null;
  return state.snapshotHostTimeMs;
}

/** Write into a caller-owned record so the live frame loop allocates nothing. */
export function writeNukeEventTimeline(
  output: NukeEventTimeline,
  triggerAtHostTimeMs: number | null,
  nowHostTimeMs: number,
): void {
  if (triggerAtHostTimeMs === null || !Number.isFinite(nowHostTimeMs)) {
    output.phase = EMPTY_TIMELINE.phase;
    output.elapsedSeconds = 0;
    output.flashStrength = 0;
    output.fireballStrength = 0;
    output.growth = 0;
    output.ringProgress = 0;
    output.fade = 0;
    output.active = false;
    return;
  }

  const elapsedSeconds = Math.max(0, (nowHostTimeMs - triggerAtHostTimeMs) / 1_000);
  const inTimeline = elapsedSeconds <= NUKE_EVENT_TOTAL_SECONDS;
  const rising = elapsedSeconds <= NUKE_EVENT_RISE_SECONDS;
  output.phase = !inTimeline ? 'complete' : elapsedSeconds <= 1 ? 'flash' : rising ? 'rising' : 'dissipating';
  output.elapsedSeconds = elapsedSeconds;
  output.flashStrength = 1 - smooth01(elapsedSeconds);
  output.fireballStrength = elapsedSeconds <= 8
    ? 1 - smooth01(elapsedSeconds / 8) * 0.42
    : 0.58 * (1 - smooth01((elapsedSeconds - 8) / 18));
  output.growth = smooth01(elapsedSeconds / NUKE_EVENT_RISE_SECONDS);
  output.ringProgress = smooth01(elapsedSeconds / NUKE_EVENT_RISE_SECONDS);
  output.fade = elapsedSeconds <= 30 ? 1 : 1 - smooth01((elapsedSeconds - 30) / 30);
  output.active = inTimeline;
}

/** Allocation-friendly test/QA sampler; the renderer uses the writer above. */
export function sampleNukeEventTimeline(
  triggerAtHostTimeMs: number | null,
  nowHostTimeMs: number,
): Readonly<NukeEventTimeline> {
  const sampled: NukeEventTimeline = { ...EMPTY_TIMELINE };
  writeNukeEventTimeline(sampled, triggerAtHostTimeMs, nowHostTimeMs);
  return Object.freeze(sampled);
}
