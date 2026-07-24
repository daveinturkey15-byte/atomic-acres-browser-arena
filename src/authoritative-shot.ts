import { WEAPONS } from './gameplay';
import type { CombatantPoseSample } from './lag-compensation';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type ShotRejectReason, type ShotRequestMessage } from './protocol';

export type AuthoritativeShotAdmissionState = Readonly<{
  lastShotSeq: number;
  lastAcceptedHostTimeMs: number;
  recentShotIds: readonly string[];
}>;

export type AuthoritativeShotAdmission = Readonly<{
  accepted: boolean;
  reason: ShotRejectReason;
  state: AuthoritativeShotAdmissionState;
  appliedRewindMs: number;
}>;

export function createAuthoritativeShotAdmissionState(): AuthoritativeShotAdmissionState {
  return { lastShotSeq: -1, lastAcceptedHostTimeMs: Number.NEGATIVE_INFINITY, recentShotIds: [] };
}

export function admitAuthoritativeShot(
  request: ShotRequestMessage,
  sender: PlayerSnapshot | undefined,
  receivedAtHostTimeMs: number,
  state: AuthoritativeShotAdmissionState,
): AuthoritativeShotAdmission {
  const reject = (reason: ShotRejectReason): AuthoritativeShotAdmission => ({ accepted: false, reason, state, appliedRewindMs: 0 });
  if (request.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) return reject('protocol-mismatch');
  if (!sender || sender.id !== request.by) return reject('unknown-sender');
  if (state.recentShotIds.includes(request.shotId) || request.shotSeq <= state.lastShotSeq) return reject('duplicate');
  if (state.lastShotSeq >= 0 && request.shotSeq - state.lastShotSeq > 512) return reject('sequence-gap');
  if (sender.weapon !== request.weapon) return reject('weapon-mismatch');
  if (request.pelletDirections.length !== WEAPONS[request.weapon].pellets) return reject('invalid-pellets');
  const ageMs = receivedAtHostTimeMs - request.renderedHostTimeMs;
  if (ageMs > 650) return reject('stale');
  if (ageMs < -120) return reject('future');
  const authoredInterval = 60_000 / WEAPONS[request.weapon].rpm;
  if (request.renderedHostTimeMs - state.lastAcceptedHostTimeMs + 1e-6 < authoredInterval) return reject('cadence');
  return {
    accepted: true,
    reason: 'none',
    appliedRewindMs: Math.max(0, Math.min(250, ageMs)),
    state: {
      lastShotSeq: request.shotSeq,
      lastAcceptedHostTimeMs: request.renderedHostTimeMs,
      recentShotIds: [...state.recentShotIds.slice(-31), request.shotId],
    },
  };
}

export function validateShotOrigin(request: ShotRequestMessage, shooterPose: CombatantPoseSample): boolean {
  const distance = Math.hypot(
    request.origin[0] - shooterPose.x,
    request.origin[1] - shooterPose.y,
    request.origin[2] - shooterPose.z,
  );
  return Number.isFinite(distance) && distance <= 2.25;
}
