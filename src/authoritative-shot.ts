import { WEAPONS } from './gameplay';
import type { CombatantPoseSample } from './lag-compensation';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type ShotRejectReason, type ShotRequestMessage } from './protocol';

type AcceptedAuthoredShot = Readonly<{
  shotId: string;
  shotSeq: number;
  weapon: ShotRequestMessage['weapon'];
  weaponSequence: number;
  fireTimeMs: number;
}>;

export type AuthoritativeShotAdmissionState = Readonly<{
  highestShotSeq: number;
  recentShots: readonly AcceptedAuthoredShot[];
}>;

export type AuthoritativeShotAdmissionContext = Readonly<{
  expectedConnectionEpoch: string;
  expectedLifeId: number;
  clockUncertaintyMs: number;
  shooterDiedAtHostTimeMs: number | null;
}>;

export type AuthoritativeShotAdmission = Readonly<{
  accepted: boolean;
  reason: ShotRejectReason;
  state: AuthoritativeShotAdmissionState;
  fireAgeMs: number;
  appliedRewindMs: number;
  clockUncertaintyAllowanceMs: number;
}>;

export type AuthoredShotTimeline = Readonly<{
  fireTimeMs: number;
  targetViewTimeMs: number;
  targetViewDelayMs: number;
  maximumFireAgeMs: number;
  presentedTargetCount: number;
  presentedTargetAgeSpreadMs: number;
}>;

export const MAX_AUTHORITATIVE_REWIND_MS = 250;
export const MAX_SHOT_FIRE_AGE_MS = 250;
export const MAX_CLOCK_UNCERTAINTY_ALLOWANCE_MS = 25;
const MAX_FUTURE_SHOT_MS = 120;
const MAX_SHOT_SEQUENCE_GAP = 512;
const RECENT_AUTHORED_SHOTS = 64;
const AUTHORED_CADENCE_TOLERANCE_MS = 1;

export function createAuthoritativeShotAdmissionState(): AuthoritativeShotAdmissionState {
  return { highestShotSeq: -1, recentShots: [] };
}

function boundedClockUncertainty(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_CLOCK_UNCERTAINTY_ALLOWANCE_MS, value)) : 0;
}

export function admitAuthoritativeShot(
  request: ShotRequestMessage,
  sender: PlayerSnapshot | undefined,
  receivedAtHostTimeMs: number,
  state: AuthoritativeShotAdmissionState,
  context: AuthoritativeShotAdmissionContext = {
    expectedConnectionEpoch: request.connectionEpoch,
    expectedLifeId: request.lifeId,
    clockUncertaintyMs: 0,
    shooterDiedAtHostTimeMs: null,
  },
): AuthoritativeShotAdmission {
  const fireAgeMs = receivedAtHostTimeMs - request.fireTimeMs;
  const clockUncertaintyAllowanceMs = boundedClockUncertainty(context.clockUncertaintyMs);
  const reject = (reason: ShotRejectReason): AuthoritativeShotAdmission => ({
    accepted: false,
    reason,
    state,
    fireAgeMs,
    appliedRewindMs: 0,
    clockUncertaintyAllowanceMs,
  });
  if (request.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) return reject('protocol-mismatch');
  if (!sender || sender.id !== request.by) return reject('unknown-sender');
  if (request.connectionEpoch !== context.expectedConnectionEpoch) return reject('connection-epoch-mismatch');
  if (request.lifeId !== context.expectedLifeId) return reject('life-mismatch');
  if (state.recentShots.some((shot) => shot.shotId === request.shotId
    || shot.shotSeq === request.shotSeq
    || shot.weapon === request.weapon && shot.weaponSequence === request.weaponSequence)) return reject('duplicate');
  if (state.highestShotSeq >= 0 && request.shotSeq <= state.highestShotSeq - RECENT_AUTHORED_SHOTS) {
    return reject('duplicate');
  }
  if (state.highestShotSeq >= 0 && request.shotSeq - state.highestShotSeq > MAX_SHOT_SEQUENCE_GAP) {
    return reject('sequence-gap');
  }
  if (sender.weapon !== request.weapon) return reject('weapon-mismatch');
  if (request.pelletDirections.length !== WEAPONS[request.weapon].pellets) return reject('invalid-pellets');
  if (fireAgeMs > MAX_SHOT_FIRE_AGE_MS + clockUncertaintyAllowanceMs) return reject('stale');
  if (fireAgeMs < -MAX_FUTURE_SHOT_MS - clockUncertaintyAllowanceMs) return reject('future');
  const appliedRewindMs = request.fireTimeMs - request.targetViewTimeMs;
  if (!Number.isFinite(appliedRewindMs) || appliedRewindMs < 0 || appliedRewindMs > MAX_AUTHORITATIVE_REWIND_MS) {
    return reject('invalid-timeline');
  }
  if (context.shooterDiedAtHostTimeMs !== null && request.fireTimeMs > context.shooterDiedAtHostTimeMs) {
    return reject('shooter-dead');
  }

  const authoredIntervalMs = 60_000 / WEAPONS[request.weapon].rpm;
  const sameWeapon = state.recentShots.filter((shot) => shot.weapon === request.weapon);
  const predecessor = sameWeapon
    .filter((shot) => shot.weaponSequence < request.weaponSequence)
    .sort((a, b) => b.weaponSequence - a.weaponSequence)[0];
  const successor = sameWeapon
    .filter((shot) => shot.weaponSequence > request.weaponSequence)
    .sort((a, b) => a.weaponSequence - b.weaponSequence)[0];
  if (predecessor) {
    const minimumSpacingMs = (request.weaponSequence - predecessor.weaponSequence) * authoredIntervalMs;
    if (request.fireTimeMs - predecessor.fireTimeMs + AUTHORED_CADENCE_TOLERANCE_MS < minimumSpacingMs) {
      return reject('cadence');
    }
  }
  if (successor) {
    const minimumSpacingMs = (successor.weaponSequence - request.weaponSequence) * authoredIntervalMs;
    if (successor.fireTimeMs - request.fireTimeMs + AUTHORED_CADENCE_TOLERANCE_MS < minimumSpacingMs) {
      return reject('cadence');
    }
  }

  const accepted: AcceptedAuthoredShot = {
    shotId: request.shotId,
    shotSeq: request.shotSeq,
    weapon: request.weapon,
    weaponSequence: request.weaponSequence,
    fireTimeMs: request.fireTimeMs,
  };
  return {
    accepted: true,
    reason: 'none',
    fireAgeMs,
    appliedRewindMs,
    clockUncertaintyAllowanceMs,
    state: {
      highestShotSeq: Math.max(state.highestShotSeq, request.shotSeq),
      recentShots: [...state.recentShots, accepted]
        .sort((a, b) => a.shotSeq - b.shotSeq)
        .slice(-RECENT_AUTHORED_SHOTS),
    },
  };
}

export function freezeAuthoredShotTimeline(
  triggerHostTimeMs: number,
  interpolationDelayMs: number,
  presentedTargetHostTimes: readonly number[] = [],
): AuthoredShotTimeline {
  const fireTimeMs = Number.isFinite(triggerHostTimeMs) ? Math.max(0, triggerHostTimeMs) : 0;
  const targetViewDelayMs = Number.isFinite(interpolationDelayMs)
    ? Math.max(0, Math.min(MAX_AUTHORITATIVE_REWIND_MS, interpolationDelayMs))
    : 0;
  const targetAges = presentedTargetHostTimes
    .filter(Number.isFinite)
    .map((targetTime) => Math.max(0, fireTimeMs - targetTime));
  const targetAgeSpread = targetAges.length > 1 ? Math.max(...targetAges) - Math.min(...targetAges) : 0;
  return Object.freeze({
    fireTimeMs,
    targetViewTimeMs: Math.max(0, fireTimeMs - targetViewDelayMs),
    targetViewDelayMs,
    maximumFireAgeMs: MAX_SHOT_FIRE_AGE_MS,
    presentedTargetCount: targetAges.length,
    presentedTargetAgeSpreadMs: targetAgeSpread,
  });
}

function frozenVector(value: readonly number[]): [number, number, number] {
  return Object.freeze([value[0], value[1], value[2]]) as unknown as [number, number, number];
}

export function freezeAuthoredBulletRecord(request: ShotRequestMessage): ShotRequestMessage {
  return Object.freeze({
    ...request,
    origin: frozenVector(request.origin),
    direction: frozenVector(request.direction),
    pelletDirections: Object.freeze(request.pelletDirections.map(frozenVector)) as unknown as [number, number, number][],
  });
}

export function validateShotOrigin(request: ShotRequestMessage, shooterPose: CombatantPoseSample): boolean {
  const distance = Math.hypot(
    request.origin[0] - shooterPose.x,
    request.origin[1] - shooterPose.y,
    request.origin[2] - shooterPose.z,
  );
  return Number.isFinite(distance) && distance <= 2.25;
}
