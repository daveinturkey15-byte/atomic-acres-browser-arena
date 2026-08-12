import {
  isBlocked,
  pointInsideBounds,
  type Box2,
  type Point3,
} from './collision';

type RecoveryActorPose = Readonly<Point3 & { id: string }>;

export type HostRecoveryPoseCheckpoint = Readonly<{
  config: Readonly<{ arenaId: string }>;
  hostPlayer: RecoveryActorPose;
  guests: readonly Readonly<{ snapshot: RecoveryActorPose }>[];
  bots: readonly Readonly<{ snapshot: RecoveryActorPose }>[];
}>;

export type HostRecoveryPoseAudit = Readonly<
  | { accepted: true; reason: null }
  | { accepted: false; reason: string }
>;

const acceptedAudit: HostRecoveryPoseAudit = Object.freeze({ accepted: true, reason: null });

function rejected(reason: string): HostRecoveryPoseAudit {
  return Object.freeze({ accepted: false, reason });
}

function auditActorPose(
  actor: 'host' | 'guest' | 'bot',
  pose: RecoveryActorPose,
  bounds: Box2,
  colliders: readonly Box2[],
  radius: number,
  collisionEyeOffsetY = 0,
): HostRecoveryPoseAudit {
  const label = `${actor}:${pose.id}`;
  if (!pointInsideBounds(pose, bounds, radius)) return rejected(`${label}:outside-arena-bounds`);
  if (!Number.isFinite(pose.y) || pose.y < -25 || pose.y > 250) return rejected(`${label}:invalid-height`);
  const collisionPose = collisionEyeOffsetY === 0
    ? pose
    : { ...pose, y: pose.y + collisionEyeOffsetY };
  if (isBlocked(collisionPose, colliders, radius)) return rejected(`${label}:blocked-by-collider`);
  return acceptedAudit;
}

/**
 * Audits exactly the poses restored by the hosted-match recovery transaction.
 * Hosts and guests store eye positions; hosted bots store root/feet positions.
 */
export function auditHostRecoveryPoses(
  checkpoint: HostRecoveryPoseCheckpoint,
  arenaId: string,
  bounds: Box2,
  colliders: readonly Box2[],
): HostRecoveryPoseAudit {
  if (checkpoint.config.arenaId !== arenaId) {
    return rejected(`arena-mismatch:${checkpoint.config.arenaId}:${arenaId}`);
  }
  const host = auditActorPose('host', checkpoint.hostPlayer, bounds, colliders, 0.44);
  if (!host.accepted) return host;
  for (const guest of checkpoint.guests) {
    const audit = auditActorPose('guest', guest.snapshot, bounds, colliders, 0.44);
    if (!audit.accepted) return audit;
  }
  for (const bot of checkpoint.bots) {
    const audit = auditActorPose('bot', bot.snapshot, bounds, colliders, 0.42, 1.7);
    if (!audit.accepted) return audit;
  }
  return acceptedAudit;
}
