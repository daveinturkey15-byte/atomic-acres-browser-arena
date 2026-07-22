import type { MeleeMessage, PlayerSnapshot } from './protocol';

export type RemoteMeleeAdmissionState = {
  lastAcceptedAt: number;
  recentNonces: number[];
};

export function createRemoteMeleeAdmissionState(): RemoteMeleeAdmissionState {
  return { lastAcceptedAt: -Infinity, recentNonces: [] };
}

export function admitRemoteMelee(
  message: MeleeMessage,
  sender: PlayerSnapshot | undefined,
  now: number,
  state: RemoteMeleeAdmissionState,
): { accepted: boolean; nextState: RemoteMeleeAdmissionState } {
  if (!sender || sender.id !== message.by || sender.hp <= 0) return { accepted: false, nextState: state };
  if (!Number.isFinite(now) || state.recentNonces.includes(message.nonce)) return { accepted: false, nextState: state };
  const [ox, oy, oz] = message.origin;
  const originError = Math.hypot(ox - sender.x, oy - sender.y, oz - sender.z);
  const directionLength = Math.hypot(...message.direction);
  if (originError > 1.15 || directionLength < 0.92 || directionLength > 1.08) return { accepted: false, nextState: state };
  if (now - state.lastAcceptedAt < 500) return { accepted: false, nextState: state };
  return {
    accepted: true,
    nextState: {
      lastAcceptedAt: now,
      recentNonces: [...state.recentNonces.slice(-31), message.nonce],
    },
  };
}

export function meleeActionHitsPoint(
  message: MeleeMessage,
  target: { x: number; y: number; z: number },
  maximumReach = 1.85,
  minimumFacingDot = 0.72,
): boolean {
  const toTarget = [
    target.x - message.origin[0],
    target.y - message.origin[1],
    target.z - message.origin[2],
  ] as const;
  const distance = Math.hypot(...toTarget);
  if (distance <= 0.001 || distance > maximumReach) return false;
  const dot = (toTarget[0] * message.direction[0] + toTarget[1] * message.direction[1] + toTarget[2] * message.direction[2]) / distance;
  return dot >= minimumFacingDot;
}
