import type { DeathDrop } from './death-drops';
import type { GuestCombatInventory, PickupResultMessage, PrimaryWeaponId, WeaponId } from './protocol';
import type { NetworkRole } from './network';
import type { DiagnosticAdmission, MatchDiagnosticInput } from './match-diagnostics';

export type PendingLocalPickup = Readonly<{
  nonce: number;
  dropId: string;
  priorInventory: GuestCombatInventory;
  priorPrimaryWeapon: PrimaryWeaponId;
  priorWeapon: WeaponId;
  priorSwitchingUntil: number;
  priorDrop: DeathDrop;
  sentAt: number;
}>;

type PickupAuthorityContext = Readonly<{
  networkRole: NetworkRole;
  hostId: string | null;
  playerId: string;
  pending: PendingLocalPickup | null;
  setPending: (pending: PendingLocalPickup | null) => void;
  restorePendingLocalPickup: (pending: PendingLocalPickup) => void;
  applyCanonicalPickupDrop: (message: PickupResultMessage, now: number) => void;
  applyLocalCombatInventoryProjection: (projection: PickupResultMessage['combatInventory'], allowEqualRevision: boolean) => boolean;
  setPrimaryWeapon: (weapon: PrimaryWeaponId) => void;
  setWeapon: (weapon: WeaponId) => void;
  getWeapon: () => WeaponId;
  setWeaponPresentation: (weapon: WeaponId, force: boolean) => void;
  playerPosition: readonly [number, number, number];
  renderFieldKitSelection: () => void;
  addFeed: (text: string, tone: 'gold' | 'coral') => void;
  recordMatchDiagnostic: (
    kind: string,
    status: DiagnosticAdmission,
    details?: Partial<Omit<MatchDiagnosticInput, 'monotonicMs' | 'localEpochMs' | 'eventId' | 'eventType' | 'admission'>>,
  ) => void;
}>;

export function acceptLocalPickupResult(context: PickupAuthorityContext, message: PickupResultMessage): void {
  if (context.networkRole !== 'client' || message.by !== context.hostId) return;
  // Every guest consumes the host's canonical drop correction. Only the
  // claimant applies the inventory projection and correlates the nonce.
  if (message.forPlayerId !== context.playerId) {
    context.applyCanonicalPickupDrop(message, performance.now());
    return;
  }
  const pending = context.pending;
  if (pending && (pending.nonce !== message.nonce || pending.dropId !== message.dropId)) return;
  if (message.status === 'rejected') {
    if (pending) context.restorePendingLocalPickup(pending);
    context.setPending(null);
    context.applyCanonicalPickupDrop(message, performance.now());
    context.addFeed('PICKUP DENIED', 'coral');
    context.recordMatchDiagnostic('weapon-pickup', 'rejected', {
      actorId: context.playerId,
      weaponOrEffect: message.combatInventory.primary.weapon,
      position: context.playerPosition,
      reason: message.reason,
    });
    return;
  }
  context.applyLocalCombatInventoryProjection(message.combatInventory, true);
  const wasUsingPrimary = pending?.priorWeapon === pending?.priorPrimaryWeapon;
  context.setPrimaryWeapon(message.combatInventory.primary.weapon);
  if (wasUsingPrimary || pending === null) context.setWeapon(message.combatInventory.primary.weapon);
  context.applyCanonicalPickupDrop(message, performance.now());
  context.setPending(null);
  context.setWeaponPresentation(context.getWeapon(), true);
  context.renderFieldKitSelection();
}

export function expirePendingLocalPickup(
  context: Pick<PickupAuthorityContext, 'networkRole' | 'pending' | 'setPending' | 'restorePendingLocalPickup' | 'playerId' | 'recordMatchDiagnostic' | 'addFeed'>,
  now: number,
): void {
  const pending = context.pending;
  if (context.networkRole !== 'client' || !pending || now - pending.sentAt <= 1_500) return;
  context.restorePendingLocalPickup(pending);
  context.setPending(null);
  context.recordMatchDiagnostic('weapon-pickup', 'rejected', {
    actorId: context.playerId,
    reason: 'pickup-result-timeout',
    modifiers: ['deadline:1500ms'],
  });
  context.addFeed('PICKUP TIMED OUT', 'coral');
}
