import {
  CHOPPER_GUN_PROFILE,
  CHOPPER_GUNNER_SPLASH_POLICY,
} from './killstreak-support-catalog';
import {
  chopperGunnerAuthoritativeRay,
  chopperGunnerAuthoritativeTargetAlongRay,
  chopperGunnerCameraOrigin,
  type ChopperGunnerAuthoritativeRay,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';

export const CHOPPER_GUNNER_QA_AIM_MAX_WINDOW_MS = 2_500;
export const CHOPPER_GUNNER_QA_AIM_RECEIPT_CONTRACT = 'chopper-gunner-trusted-aligned-aim-v1' as const;

export type ChopperGunnerQaAimRequest = Readonly<{
  entityId: string;
  activationId: string;
  ownerLifeId: number;
  targetId: string;
  targetLifeId: number;
  triggerEdgeSequence: number;
  trustedEventTimestampMs: number;
  armedAtMs: number;
  deadlineAtMs: number;
}>;

export type ChopperGunnerQaAimEntity = Readonly<{
  id: string;
  activationId: string;
  ownerId: string;
  kind: 'aircraft' | 'chopper' | 'drone' | 'care-crate';
  gunController: 'owner-player' | 'ai' | null;
  expiresInMs: number;
  revision: number;
  position: SupportVec3;
  attitude: SupportVec3;
}>;

export type ChopperGunnerQaAimClearReason =
  | 'deadline-expired'
  | 'trigger-released'
  | 'trigger-edge-changed'
  | 'owner-life-changed'
  | 'entity-identity-changed'
  | 'entity-expired'
  | 'target-life-changed'
  | 'target-unavailable'
  | 'degenerate-target-vector'
  | 'covered-or-out-of-range'
  | 'other-target-selected';

export type ChopperGunnerQaAimAlignment = Readonly<{
  entityId: string;
  activationId: string;
  entityRevision: number;
  targetId: string;
  targetLifeId: number;
  entityPosition: SupportVec3;
  entityAttitude: SupportVec3;
  targetPosition: SupportVec3;
  yaw: number;
  pitch: number;
  ray: ChopperGunnerAuthoritativeRay;
  endpoint: SupportVec3;
  entryDistanceM: number;
  radialDistanceM: number;
  maximumRangeM: number;
  splashRadiusM: number;
  lineOfSight: true;
}>;

export type ChopperGunnerQaAimResolution = Readonly<{
  status: 'aligned';
  alignment: ChopperGunnerQaAimAlignment;
}> | Readonly<{
  status: 'clear';
  reason: ChopperGunnerQaAimClearReason;
}>;

export type ChopperGunnerQaAimAdmission = Readonly<{
  atMs: number;
  entityId: string;
  action: 'pilot-control' | string;
  sequence: number;
  yawQ: number | null;
  pitchQ: number | null;
  fire: boolean;
  missileFire: boolean;
  accepted: boolean;
  reason: string;
}>;

export type ChopperGunnerQaAimThrottleEvidence = Readonly<{
  eligible: boolean;
  previousControlSentAtMs: number | null;
  minimumEligibleAtMs: number | null;
}>;

export type ChopperGunnerQaAimReceipt = Readonly<{
  contract: typeof CHOPPER_GUNNER_QA_AIM_RECEIPT_CONTRACT;
  entityId: string;
  activationId: string;
  entityRevision: number;
  targetId: string;
  targetLifeId: number;
  ownerLifeId: number;
  triggerEdgeSequence: number;
  trustedEventTimestampMs: number;
  armedAtMs: number;
  alignedAtMs: number;
  consumedAtMs: number;
  deadlineAtMs: number;
  controlAdmissionAtMs: number;
  controlSequence: number;
  controlAction: 'pilot-control';
  controlReason: 'accepted';
  missileFire: false;
  previousControlSentAtMs: number | null;
  minimumControlEligibleAtMs: number | null;
  yaw: number;
  pitch: number;
  entityPosition: SupportVec3;
  entityAttitude: SupportVec3;
  targetPosition: SupportVec3;
  origin: SupportVec3;
  direction: SupportVec3;
  tracerOrigin: SupportVec3;
  endpoint: SupportVec3;
  entryDistanceM: number;
  radialDistanceM: number;
  maximumRangeM: number;
  splashRadiusM: number;
  lineOfSight: true;
  selectedAsPrimary: true;
  fireAuthority: 'native-trigger-held';
  triggerHeld: true;
  controlAccepted: true;
}>;

function frozenVec(value: SupportVec3): SupportVec3 {
  return Object.freeze([...value]) as unknown as SupportVec3;
}

export function createChopperGunnerQaAimRequest(input: Readonly<{
  entityId: string;
  activationId: string;
  ownerLifeId: number;
  targetId: string;
  targetLifeId: number;
  triggerEdgeSequence: number;
  trustedEventTimestampMs: number;
  armedAtMs: number;
  deadlineAtMs: number;
}>): ChopperGunnerQaAimRequest | null {
  if (![input.entityId, input.activationId, input.targetId].every((value) => value.length > 0)
    || !Number.isSafeInteger(input.targetLifeId)
    || input.targetLifeId < 0
    || !Number.isSafeInteger(input.ownerLifeId)
    || input.ownerLifeId < 0
    || !Number.isSafeInteger(input.triggerEdgeSequence)
    || input.triggerEdgeSequence < 1
    || ![input.trustedEventTimestampMs, input.armedAtMs, input.deadlineAtMs].every(Number.isFinite)
    || input.trustedEventTimestampMs > input.armedAtMs
    || input.deadlineAtMs <= input.armedAtMs
    || input.deadlineAtMs - input.armedAtMs > CHOPPER_GUNNER_QA_AIM_MAX_WINDOW_MS) return null;
  return Object.freeze({ ...input });
}

export function resolveChopperGunnerQaAim(
  request: ChopperGunnerQaAimRequest,
  input: Readonly<{
    nowMs: number;
    triggerHeld: boolean;
    triggerEdgeSequence: number;
    entity: ChopperGunnerQaAimEntity | null;
    ownerId: string;
    ownerLifeId: number;
    ownerTeam: 0 | 1;
    world: KillstreakWorld;
  }>,
): ChopperGunnerQaAimResolution {
  if (!Number.isFinite(input.nowMs) || input.nowMs > request.deadlineAtMs) {
    return Object.freeze({ status: 'clear', reason: 'deadline-expired' });
  }
  if (!input.triggerHeld) return Object.freeze({ status: 'clear', reason: 'trigger-released' });
  if (input.triggerEdgeSequence !== request.triggerEdgeSequence) {
    return Object.freeze({ status: 'clear', reason: 'trigger-edge-changed' });
  }
  if (input.ownerLifeId !== request.ownerLifeId) {
    return Object.freeze({ status: 'clear', reason: 'owner-life-changed' });
  }
  const entity = input.entity;
  if (!entity || entity.id !== request.entityId || entity.activationId !== request.activationId
    || entity.kind !== 'chopper' || entity.ownerId !== input.ownerId
    || entity.gunController !== 'owner-player') {
    return Object.freeze({ status: 'clear', reason: 'entity-identity-changed' });
  }
  if (!(entity.expiresInMs > 0)) return Object.freeze({ status: 'clear', reason: 'entity-expired' });
  const target = input.world.targets.find((candidate) => candidate.id === request.targetId) ?? null;
  if (!target || !target.alive) return Object.freeze({ status: 'clear', reason: 'target-unavailable' });
  if (target.lifeId !== request.targetLifeId) {
    return Object.freeze({ status: 'clear', reason: 'target-life-changed' });
  }
  const origin = chopperGunnerCameraOrigin(entity.position, entity.attitude);
  const deltaX = target.position[0] - origin[0];
  const deltaY = target.position[1] - origin[1];
  const deltaZ = target.position[2] - origin[2];
  if (Math.hypot(deltaX, deltaY, deltaZ) < 0.001) {
    return Object.freeze({ status: 'clear', reason: 'degenerate-target-vector' });
  }
  const yaw = Math.max(-Math.PI, Math.min(Math.PI, Math.atan2(-deltaX, -deltaZ)));
  const pitch = Math.max(-1.2, Math.min(0.5, Math.atan2(deltaY, Math.hypot(deltaX, deltaZ))));
  const ray = chopperGunnerAuthoritativeRay(entity.position, entity.attitude, yaw, pitch);
  const hit = chopperGunnerAuthoritativeTargetAlongRay(
    ray,
    input.ownerId,
    input.ownerTeam,
    input.world,
  );
  if (!hit) return Object.freeze({ status: 'clear', reason: 'covered-or-out-of-range' });
  if (hit.target.id !== request.targetId || hit.target.lifeId !== request.targetLifeId) {
    return Object.freeze({ status: 'clear', reason: 'other-target-selected' });
  }
  return Object.freeze({
    status: 'aligned',
    alignment: Object.freeze({
      entityId: entity.id,
      activationId: entity.activationId,
      entityRevision: entity.revision,
      targetId: target.id,
      targetLifeId: target.lifeId,
      entityPosition: frozenVec(entity.position),
      entityAttitude: frozenVec(entity.attitude),
      targetPosition: frozenVec(target.position),
      yaw,
      pitch,
      ray: Object.freeze({
        origin: frozenVec(ray.origin),
        direction: frozenVec(ray.direction),
        tracerOrigin: frozenVec(ray.tracerOrigin),
      }),
      endpoint: frozenVec(hit.endpoint),
      entryDistanceM: hit.distance,
      radialDistanceM: hit.radialDistance,
      maximumRangeM: CHOPPER_GUN_PROFILE.maximumRangeM,
      splashRadiusM: CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM,
      lineOfSight: true,
    }),
  });
}

export function chopperGunnerQaAimReceipt(
  request: ChopperGunnerQaAimRequest,
  alignment: ChopperGunnerQaAimAlignment,
  admission: ChopperGunnerQaAimAdmission,
  alignedAtMs: number,
  throttle: ChopperGunnerQaAimThrottleEvidence,
): ChopperGunnerQaAimReceipt | null {
  if (!admission.accepted || admission.fire !== true
    || admission.action !== 'pilot-control'
    || admission.reason !== 'accepted'
    || admission.missileFire !== false
    || !Number.isSafeInteger(admission.sequence)
    || admission.sequence < 1
    || admission.entityId !== request.entityId
    || alignment.entityId !== request.entityId
    || alignment.activationId !== request.activationId
    || alignment.targetId !== request.targetId
    || alignment.targetLifeId !== request.targetLifeId
    || admission.yawQ !== alignment.yaw
    || admission.pitchQ !== alignment.pitch
    || !Number.isFinite(alignedAtMs)
    || alignedAtMs < request.armedAtMs
    || alignedAtMs > request.deadlineAtMs
    || admission.atMs !== alignedAtMs
    || !throttle.eligible
    || (throttle.minimumEligibleAtMs !== null && alignedAtMs < throttle.minimumEligibleAtMs)) return null;
  return Object.freeze({
    contract: CHOPPER_GUNNER_QA_AIM_RECEIPT_CONTRACT,
    entityId: request.entityId,
    activationId: request.activationId,
    entityRevision: alignment.entityRevision,
    targetId: request.targetId,
    targetLifeId: request.targetLifeId,
    ownerLifeId: request.ownerLifeId,
    triggerEdgeSequence: request.triggerEdgeSequence,
    trustedEventTimestampMs: request.trustedEventTimestampMs,
    armedAtMs: request.armedAtMs,
    alignedAtMs,
    consumedAtMs: alignedAtMs,
    deadlineAtMs: request.deadlineAtMs,
    controlAdmissionAtMs: admission.atMs,
    controlSequence: admission.sequence,
    controlAction: 'pilot-control',
    controlReason: 'accepted',
    missileFire: false,
    previousControlSentAtMs: throttle.previousControlSentAtMs,
    minimumControlEligibleAtMs: throttle.minimumEligibleAtMs,
    yaw: alignment.yaw,
    pitch: alignment.pitch,
    entityPosition: frozenVec(alignment.entityPosition),
    entityAttitude: frozenVec(alignment.entityAttitude),
    targetPosition: frozenVec(alignment.targetPosition),
    origin: frozenVec(alignment.ray.origin),
    direction: frozenVec(alignment.ray.direction),
    tracerOrigin: frozenVec(alignment.ray.tracerOrigin),
    endpoint: frozenVec(alignment.endpoint),
    entryDistanceM: alignment.entryDistanceM,
    radialDistanceM: alignment.radialDistanceM,
    maximumRangeM: alignment.maximumRangeM,
    splashRadiusM: alignment.splashRadiusM,
    lineOfSight: true,
    selectedAsPrimary: true,
    fireAuthority: 'native-trigger-held',
    triggerHeld: true,
    controlAccepted: true,
  });
}

export function chopperGunnerQaAimThrottleEvidence(
  nowMs: number,
  previousControlSentAtMs: number,
  minimumIntervalMs = 50,
): ChopperGunnerQaAimThrottleEvidence {
  const previous = Number.isFinite(previousControlSentAtMs) ? previousControlSentAtMs : null;
  const minimumEligibleAtMs = previous === null ? null : previous + minimumIntervalMs;
  return Object.freeze({
    eligible: Number.isFinite(nowMs)
      && Number.isFinite(minimumIntervalMs)
      && minimumIntervalMs >= 0
      && (minimumEligibleAtMs === null || nowMs >= minimumEligibleAtMs),
    previousControlSentAtMs: previous,
    minimumEligibleAtMs,
  });
}
