export type CombatantPoseSample = Readonly<{
  at: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  stance: 'stand' | 'crouch' | 'prone';
  continuity: number;
}>;

export type CombatantPoseRewind = Readonly<{
  pose: CombatantPoseSample | null;
  reason: 'accepted' | 'missing-history' | 'outside-history' | 'continuity-mismatch' | 'invalid';
}>;

export const COMBATANT_HISTORY_RETENTION_MS = 750;
export const COMBATANT_HISTORY_LIMIT = 64;

export function recordCombatantPose(history: CombatantPoseSample[], sample: CombatantPoseSample): void {
  if (![sample.at, sample.x, sample.y, sample.z, sample.yaw].every(Number.isFinite)) return;
  const previous = history.at(-1);
  if (previous && sample.at < previous.at) return;
  history.push(sample);
  const cutoff = sample.at - COMBATANT_HISTORY_RETENTION_MS;
  while (history.length > 2 && (history[1].at < cutoff || history.length > COMBATANT_HISTORY_LIMIT)) history.shift();
}

export function rewindCombatantPose(history: readonly CombatantPoseSample[], targetAt: number): CombatantPoseSample | null {
  return rewindCombatantPoseStrict(history, targetAt).pose;
}

export function rewindCombatantPoseStrict(
  history: readonly CombatantPoseSample[],
  targetAt: number,
  expectedContinuity?: number,
): CombatantPoseRewind {
  if (!Number.isFinite(targetAt)) return { pose: null, reason: 'invalid' };
  if (history.length === 0) return { pose: null, reason: 'missing-history' };
  const first = history[0];
  const latest = history.at(-1)!;
  if (targetAt < first.at || targetAt > latest.at) return { pose: null, reason: 'outside-history' };
  if (expectedContinuity !== undefined && (first.continuity !== expectedContinuity || latest.continuity !== expectedContinuity)) {
    return { pose: null, reason: 'continuity-mismatch' };
  }
  if (targetAt === first.at) return { pose: first, reason: 'accepted' };
  if (targetAt === latest.at) return { pose: latest, reason: 'accepted' };
  for (let index = 1; index < history.length; index += 1) {
    const after = history[index];
    if (after.at < targetAt) continue;
    const before = history[index - 1];
    if (before.continuity !== after.continuity
      || expectedContinuity !== undefined && before.continuity !== expectedContinuity) {
      return { pose: null, reason: 'continuity-mismatch' };
    }
    const span = Math.max(1, after.at - before.at);
    const alpha = Math.min(1, Math.max(0, (targetAt - before.at) / span));
    return { pose: {
      at: targetAt,
      x: before.x + (after.x - before.x) * alpha,
      y: before.y + (after.y - before.y) * alpha,
      z: before.z + (after.z - before.z) * alpha,
      yaw: alpha < 0.5 ? before.yaw : after.yaw,
      stance: alpha < 0.5 ? before.stance : after.stance,
      continuity: before.continuity,
    }, reason: 'accepted' };
  }
  return { pose: null, reason: 'outside-history' };
}
