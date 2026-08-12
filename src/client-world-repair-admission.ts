export const MAX_CLIENT_WORLD_REPAIR_ATTEMPTS = 2;

export type ClientWorldRepairIdentity = Readonly<{
  playerId: string;
  connectionEpoch: string;
  matchEpoch: number;
  lifeId: number;
}>;

export type ClientWorldRepairAdmission = Readonly<{
  identity: ClientWorldRepairIdentity;
  attempts: number;
  acknowledged: boolean;
}>;

type ClientWorldReceiverReady = Readonly<{
  connectionEpoch: string;
  matchEpoch: number;
  exactActorAcknowledged: boolean;
}>;

type ClientWorldActorAck = Readonly<{
  actorId: string;
  lifeId: number;
}>;

function validIdentity(identity: ClientWorldRepairIdentity): boolean {
  return identity.playerId.length > 0
    && identity.connectionEpoch.length > 0
    && Number.isSafeInteger(identity.matchEpoch)
    && identity.matchEpoch > 0
    && Number.isSafeInteger(identity.lifeId)
    && identity.lifeId >= 0;
}

export function beginClientWorldRepair(identity: ClientWorldRepairIdentity): ClientWorldRepairAdmission {
  if (!validIdentity(identity)) throw new TypeError('Invalid client world-repair identity');
  return Object.freeze({ identity: Object.freeze({ ...identity }), attempts: 0, acknowledged: false });
}

export function clientWorldRepairPending(admission: ClientWorldRepairAdmission | null): boolean {
  return admission !== null && !admission.acknowledged;
}

export function clientWorldRepairCanAttempt(admission: ClientWorldRepairAdmission | null): boolean {
  return admission !== null
    && !admission.acknowledged
    && admission.attempts < MAX_CLIENT_WORLD_REPAIR_ATTEMPTS;
}

export function clientWorldRepairReceiverReady(
  admission: ClientWorldRepairAdmission | null,
  receiver: ClientWorldReceiverReady,
): boolean {
  return clientWorldRepairCanAttempt(admission)
    && admission !== null
    && !receiver.exactActorAcknowledged
    && admission.identity.connectionEpoch === receiver.connectionEpoch
    && admission.identity.matchEpoch === receiver.matchEpoch;
}

export function recordClientWorldRepairAttempt(
  admission: ClientWorldRepairAdmission,
): ClientWorldRepairAdmission {
  if (admission.acknowledged || admission.attempts >= MAX_CLIENT_WORLD_REPAIR_ATTEMPTS) return admission;
  return Object.freeze({ ...admission, attempts: admission.attempts + 1 });
}

export function acknowledgeClientWorldRepairActor(
  admission: ClientWorldRepairAdmission | null,
  actor: ClientWorldActorAck,
): ClientWorldRepairAdmission | null {
  if (admission === null || admission.acknowledged
    || actor.actorId !== admission.identity.playerId
    || actor.lifeId !== admission.identity.lifeId) return admission;
  return Object.freeze({ ...admission, acknowledged: true });
}
