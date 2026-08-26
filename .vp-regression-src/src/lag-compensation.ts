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
export const MAX_SHOOTER_FIRE_EXTRAPOLATION_MS = 75;
const MAX_SHOOTER_HORIZONTAL_SPEED = 11;
const MAX_SHOOTER_VERTICAL_SPEED = 14;

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

/**
 * Event and transient movement lanes can arrive a fraction of a snapshot apart.
 * Reconstruct only the shooter slightly beyond the newest admitted pose; target
 * rewinds remain strict so a missing target history is never fabricated.
 */
export function reconstructShooterPoseAtFireTime(
  history: readonly CombatantPoseSample[],
  fireTimeMs: number,
  expectedContinuity: number,
): CombatantPoseRewind {
  const strict = rewindCombatantPoseStrict(history, fireTimeMs, expectedContinuity);
  if (strict.pose || strict.reason !== 'outside-history' || history.length === 0) return strict;
  const latest = history.at(-1)!;
  const futureMs = fireTimeMs - latest.at;
  if (futureMs <= 0 || futureMs > MAX_SHOOTER_FIRE_EXTRAPOLATION_MS
    || latest.continuity !== expectedContinuity) return strict;
  const before = [...history].reverse().find((sample) => sample.at < latest.at
    && sample.continuity === expectedContinuity);
  if (!before) return {
    pose: { ...latest, at: fireTimeMs },
    reason: 'accepted',
  };
  const sampleSeconds = Math.max(0.001, (latest.at - before.at) / 1_000);
  const futureSeconds = futureMs / 1_000;
  const horizontalVelocityX = (latest.x - before.x) / sampleSeconds;
  const horizontalVelocityZ = (latest.z - before.z) / sampleSeconds;
  const horizontalSpeed = Math.hypot(horizontalVelocityX, horizontalVelocityZ);
  const horizontalScale = horizontalSpeed > MAX_SHOOTER_HORIZONTAL_SPEED
    ? MAX_SHOOTER_HORIZONTAL_SPEED / horizontalSpeed
    : 1;
  const verticalVelocity = Math.max(-MAX_SHOOTER_VERTICAL_SPEED, Math.min(
    MAX_SHOOTER_VERTICAL_SPEED,
    (latest.y - before.y) / sampleSeconds,
  ));
  return {
    pose: {
      ...latest,
      at: fireTimeMs,
      x: latest.x + horizontalVelocityX * horizontalScale * futureSeconds,
      y: latest.y + verticalVelocity * futureSeconds,
      z: latest.z + horizontalVelocityZ * horizontalScale * futureSeconds,
    },
    reason: 'accepted',
  };
}
