import type { BotDamageMessage, WeaponId } from './protocol';

export type HostedBotDamageAdmission = Readonly<{
  accepted: boolean;
  reconcileLocalHealth: boolean;
  presentFromReplica: boolean;
}>;

/**
 * Bot replicas are lossy presentation state. Host-authored health is admitted
 * solely by host identity and replay nonce; a missing or stale-weapon replica
 * may suppress cosmetics, but can never suppress canonical HP convergence.
 */
export function admitHostedBotDamage(
  message: BotDamageMessage,
  context: Readonly<{
    expectedHostId: string | null;
    localPlayerId: string;
    seenNonces: ReadonlySet<number>;
    replicaWeapon: WeaponId | null;
  }>,
): HostedBotDamageAdmission {
  const accepted = context.expectedHostId !== null
    && message.by === context.expectedHostId
    && !context.seenNonces.has(message.nonce);
  return Object.freeze({
    accepted,
    reconcileLocalHealth: accepted && message.target === context.localPlayerId,
    presentFromReplica: accepted && context.replicaWeapon !== null,
  });
}
