import * as THREE from 'three';
import type { DeathDrop } from './death-drops';
import type { PendingLocalPickup } from './mp-pickup-authority';
import type { OrdinaryWeaponId, PickupResultMessage, PrimaryWeaponId, WeaponId } from './protocol';

type DropEntity = { drop: DeathDrop; root: THREE.Group };
type CombatState = {
  primaryWeapon: PrimaryWeaponId;
  weapon: WeaponId;
  switchingUntil: number;
  ammo: Record<OrdinaryWeaponId, number>;
  reserve: Record<OrdinaryWeaponId, number>;
  grenades: number;
};

type PickupPresentationContext = Readonly<{
  player: CombatState;
  ordinaryWeaponIds: readonly OrdinaryWeaponId[];
  deathDrops: DropEntity[];
  removeDeathDrop: (entity: DropEntity) => void;
  updateDeathDropPresentation: (entity: DropEntity, now?: number) => void;
  setWeaponPresentation: (weapon: WeaponId, force: boolean) => void;
  renderFieldKitSelection: () => void;
}>;

export function restorePendingLocalPickup(
  context: PickupPresentationContext,
  pending: PendingLocalPickup,
): void {
  context.player.primaryWeapon = pending.priorPrimaryWeapon;
  context.player.weapon = pending.priorWeapon;
  context.player.switchingUntil = pending.priorSwitchingUntil;
  for (const weapon of context.ordinaryWeaponIds) {
    context.player.ammo[weapon] = pending.priorInventory.ammo[weapon];
    context.player.reserve[weapon] = pending.priorInventory.reserve[weapon];
  }
  context.player.grenades = pending.priorInventory.grenades;
  const entity = context.deathDrops.find((candidate) => candidate.drop.id === pending.dropId);
  if (entity) {
    entity.drop = { ...pending.priorDrop, position: { ...pending.priorDrop.position } };
    entity.root.position.set(entity.drop.position.x, entity.drop.position.y, entity.drop.position.z);
    context.updateDeathDropPresentation(entity);
  }
  context.setWeaponPresentation(context.player.weapon, true);
  context.renderFieldKitSelection();
}

export function applyCanonicalPickupDrop(
  context: PickupPresentationContext,
  message: PickupResultMessage,
  now: number,
): void {
  const entity = context.deathDrops.find((candidate) => candidate.drop.id === message.dropId);
  if (message.drop === 'removed') {
    if (entity) context.removeDeathDrop(entity);
    return;
  }
  if (!entity) return;
  const canonical = message.drop;
  entity.drop = {
    ...entity.drop,
    weapon: canonical.weapon,
    ammo: canonical.ammo,
    reserve: canonical.reserve,
    position: { x: canonical.position[0], y: canonical.position[1], z: canonical.position[2] },
    expiresAt: canonical.expiresAt,
    ammoConsumedAt: null,
    weaponConsumedAt: null,
  };
  entity.root.position.set(canonical.position[0], canonical.position[1], canonical.position[2]);
  context.updateDeathDropPresentation(entity, now);
}
