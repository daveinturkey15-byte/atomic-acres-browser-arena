import * as THREE from 'three';
import { pointInsideBounds } from './collision';
import {
  DEATH_DROP_INTERACTION_RANGE,
  DEATH_DROP_SCAVENGE_RANGE,
  consumeDeathDropWeapon,
  deathDropAvailable,
  deathDropAmmoAvailable,
  deathDropWeaponAvailable,
  isPrimaryWeaponId,
  placeSwappedDeathDrop,
  scavengeDeathDrop,
  type DeathDrop,
} from './death-drops';
import { WEAPONS } from './gameplay';
import { setGuestCombatInventoryGrenades, setGuestCombatInventoryWeapon } from './guest-combat-inventory-authority';
import { stanceEyeHeight } from './legacy-pure-helpers-2';
import { replenishRemoteGrenadeAuthorityState } from './remote-grenade-admission';
import { ORDINARY_WEAPON_IDS } from './protocol';
import type {
  GuestCombatInventory,
  PickupMessage,
  PickupResultMessage,
  PlayerSnapshot,
  PrimaryWeaponId,
} from './protocol';

type Bounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
type Remote = Readonly<{
  root: THREE.Group;
  snapshot: PlayerSnapshot;
}> & { snapshot: PlayerSnapshot };
type DropEntity = { drop: DeathDrop; root: THREE.Group };

export type RemotePickupAuthorityContext = Readonly<{
  playerId: string;
  arenaBounds: Bounds;
  processedNonces: Set<number>;
  remotes: Map<string, Remote>;
  deathDrops: DropEntity[];
  remoteGrenadeAuthorities: Map<string, any>;
  remoteCombatInventories: Map<string, GuestCombatInventory>;
  authorizedRemotePickups: Map<string, { weapon: PrimaryWeaponId; expiresAt: number }>;
  rejectRemotePickup: (
    message: PickupMessage,
    reason: PickupResultMessage['reason'],
    drop: DeathDrop | undefined,
    now: number,
  ) => void;
  sendRemotePickupResult: (
    message: PickupMessage,
    status: PickupResultMessage['status'],
    reason: PickupResultMessage['reason'],
    drop: DeathDrop | undefined,
    now: number,
  ) => void;
  setRemoteCombatInventory: (playerId: string, inventory: GuestCombatInventory) => void;
  setRemoteGrenadeAuthority: (playerId: string, state: any) => void;
  setRemoteWeapon: (remote: Remote, weapon: PrimaryWeaponId) => void;
  updateDeathDropPresentation: (entity: DropEntity, now?: number) => void;
  removeDeathDrop: (entity: DropEntity) => void;
  trimNonceSet: () => void;
}>;

export function acceptRemotePickup(
  context: RemotePickupAuthorityContext,
  message: PickupMessage,
  now = performance.now(),
): void {
  if (message.by === context.playerId) return;
  if (context.processedNonces.has(message.nonce)) {
    const entity = context.deathDrops.find((candidate) => candidate.drop.id === message.dropId);
    context.rejectRemotePickup(message, 'duplicate', entity?.drop, now);
    return;
  }
  const remote = context.remotes.get(message.by);
  const entity = context.deathDrops.find((candidate) => candidate.drop.id === message.dropId);
  if (!remote) {
    context.rejectRemotePickup(message, 'unknown-sender', entity?.drop, now);
    return;
  }
  if (!entity) {
    context.rejectRemotePickup(message, 'unknown-drop', undefined, now);
    return;
  }
  if (entity.drop.weapon !== message.weapon) {
    context.rejectRemotePickup(message, 'weapon-mismatch', entity.drop, now);
    return;
  }
  const position = new THREE.Vector3(...message.position);
  const senderPosition = new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z);
  const dropPosition = new THREE.Vector3(entity.drop.position.x, entity.drop.position.y, entity.drop.position.z);
  const horizontalDropDistance = Math.hypot(position.x - dropPosition.x, position.z - dropPosition.z);
  const validDropDistance = message.mode === 'scavenge'
    ? horizontalDropDistance <= DEATH_DROP_SCAVENGE_RANGE + 0.5 && Math.abs(position.y - dropPosition.y) <= 2.5
    : position.distanceTo(dropPosition) <= DEATH_DROP_INTERACTION_RANGE + 0.5;
  const grenadeAuthority = context.remoteGrenadeAuthorities.get(message.by);
  const expectedGrenadeGranted = message.mode === 'scavenge' && grenadeAuthority?.remaining === 0 ? 1 : 0;
  if (!pointInsideBounds(position, context.arenaBounds, 0.44)) {
    context.rejectRemotePickup(message, 'out-of-bounds', entity.drop, now);
    return;
  }
  if (position.distanceTo(senderPosition) > 2.8) {
    context.rejectRemotePickup(message, 'sender-distance', entity.drop, now);
    return;
  }
  if (!validDropDistance) {
    context.rejectRemotePickup(message, 'drop-distance', entity.drop, now);
    return;
  }
  if (message.mode === 'scavenge' && !deathDropAmmoAvailable(entity.drop, now)) {
    context.rejectRemotePickup(message, entity.drop.expiresAt <= now ? 'expired' : 'payload-consumed', entity.drop, now);
    return;
  }
  if (message.mode === 'weapon' && !isPrimaryWeaponId(message.weapon)) {
    context.rejectRemotePickup(message, 'not-consumable', entity.drop, now);
    return;
  }
  if (message.mode === 'weapon' && !deathDropWeaponAvailable(entity.drop, now)) {
    context.rejectRemotePickup(message, entity.drop.expiresAt <= now ? 'expired' : 'payload-consumed', entity.drop, now);
    return;
  }
  if (message.mode === 'scavenge' && message.selectedGrenade !== remote.snapshot.grenade) {
    context.rejectRemotePickup(message, 'grenade-state', entity.drop, now);
    return;
  }
  if (message.mode === 'scavenge' && message.grenadeGranted !== expectedGrenadeGranted) {
    context.rejectRemotePickup(message, 'grenade-grant', entity.drop, now);
    return;
  }
  const inventory = context.remoteCombatInventories.get(message.by);
  if (!inventory) {
    context.rejectRemotePickup(message, 'no-inventory', entity.drop, now);
    return;
  }
  if (message.mode === 'scavenge') {
    const activeWeapon = remote.snapshot.weapon;
    const ordinary = ORDINARY_WEAPON_IDS.find((weapon) => weapon === activeWeapon);
    if (!ordinary) {
      context.rejectRemotePickup(message, 'not-consumable', entity.drop, now);
      return;
    }
    const result = scavengeDeathDrop(
      entity.drop,
      { weapon: ordinary, reserve: inventory.reserve[ordinary], grenades: inventory.grenades },
      WEAPONS[ordinary].reserve,
      now,
    );
    if (!result.scavenged || result.grenadeGranted !== message.grenadeGranted) {
      context.rejectRemotePickup(message, result.scavenged ? 'grenade-grant' : 'nothing-to-scavenge', entity.drop, now);
      return;
    }
    const replenished = setGuestCombatInventoryWeapon(inventory, ordinary, inventory.ammo[ordinary], result.inventory.reserve);
    context.setRemoteCombatInventory(message.by, setGuestCombatInventoryGrenades(replenished, result.inventory.grenades));
    entity.drop = result.drop;
    if (grenadeAuthority && result.grenadeGranted === 1) {
      context.setRemoteGrenadeAuthority(message.by, replenishRemoteGrenadeAuthorityState(grenadeAuthority));
    }
  } else {
    if (!isPrimaryWeaponId(message.weapon)) {
      context.rejectRemotePickup(message, 'not-consumable', entity.drop, now);
      return;
    }
    const result = consumeDeathDropWeapon(
      entity.drop,
      { primary: remote.snapshot.primary, ammo: inventory.ammo[remote.snapshot.primary], reserve: inventory.reserve[remote.snapshot.primary] },
      WEAPONS[remote.snapshot.primary].reserve,
      now,
    );
    if (!result.consumed) {
      context.rejectRemotePickup(message, 'payload-consumed', entity.drop, now);
      return;
    }
    const relinquished = setGuestCombatInventoryWeapon(inventory, remote.snapshot.primary, 0, 0);
    context.setRemoteCombatInventory(message.by, setGuestCombatInventoryWeapon(
      relinquished,
      result.inventory.primary,
      result.inventory.ammo,
      result.inventory.reserve,
    ));
    const floorY = position.y - stanceEyeHeight(remote.snapshot.stance) + 0.18;
    entity.drop = result.mode === 'pickup' ? placeSwappedDeathDrop(result.drop, position, floorY, now) : result.drop;
    if (result.mode === 'pickup') entity.root.position.set(position.x, floorY, position.z);
    remote.snapshot = { ...remote.snapshot, primary: result.inventory.primary, weapon: result.inventory.primary };
    context.authorizedRemotePickups.set(message.by, { weapon: message.weapon, expiresAt: now + 2_000 });
    context.setRemoteWeapon(remote, message.weapon);
  }
  context.processedNonces.add(message.nonce);
  context.sendRemotePickupResult(message, 'accepted', 'accepted', entity.drop, now);
  if (deathDropAvailable(entity.drop, now)) context.updateDeathDropPresentation(entity);
  else context.removeDeathDrop(entity);
  context.trimNonceSet();
}
