import { WEAPONS } from './gameplay';
import type { PlayerSnapshot, ShotMessage } from './protocol';

export type RemoteShotAdmissionState = {
  lastAcceptedAt: number;
  recentNonces: number[];
};

export type RemoteShotAdmission = {
  accepted: boolean;
  reason: 'accepted' | 'unknown-sender' | 'weapon-mismatch' | 'duplicate' | 'invalid-direction' | 'invalid-pellets' | 'origin-mismatch' | 'cadence';
  nextState: RemoteShotAdmissionState;
};

export function createRemoteShotAdmissionState(): RemoteShotAdmissionState {
  return { lastAcceptedAt: -10_000, recentNonces: [] };
}

export function admitRemoteShot(
  message: ShotMessage,
  sender: PlayerSnapshot | undefined,
  now: number,
  state: RemoteShotAdmissionState,
): RemoteShotAdmission {
  const reject = (reason: RemoteShotAdmission['reason']): RemoteShotAdmission => ({ accepted: false, reason, nextState: state });
  if (!sender || sender.id !== message.by) return reject('unknown-sender');
  if (sender.weapon !== message.weapon) return reject('weapon-mismatch');
  if (state.recentNonces.includes(message.nonce)) return reject('duplicate');
  const directionMagnitude = Math.hypot(...message.direction);
  if (!Number.isFinite(directionMagnitude) || directionMagnitude < 0.96 || directionMagnitude > 1.04) return reject('invalid-direction');
  if (message.pelletDirections.length !== WEAPONS[message.weapon].pellets
    || message.pelletDirections.some((direction) => {
      const magnitude = Math.hypot(...direction);
      return !Number.isFinite(magnitude) || magnitude < 0.96 || magnitude > 1.04;
    })) return reject('invalid-pellets');
  const originDistance = Math.hypot(
    message.origin[0] - sender.x,
    message.origin[1] - sender.y,
    message.origin[2] - sender.z,
  );
  if (!Number.isFinite(originDistance) || originDistance > 2.25) return reject('origin-mismatch');
  const authoredInterval = 60_000 / WEAPONS[message.weapon].rpm;
  // Damage authority uses host receipt time. Reliable delivery preserves order;
  // accepting a fraction of the authored interval would permit sustained
  // fire above the weapon contract rather than merely tolerate packet bunching.
  if (now - state.lastAcceptedAt + 1e-6 < authoredInterval) return reject('cadence');
  return {
    accepted: true,
    reason: 'accepted',
    nextState: {
      lastAcceptedAt: now,
      recentNonces: [...state.recentNonces.slice(-15), message.nonce],
    },
  };
}
