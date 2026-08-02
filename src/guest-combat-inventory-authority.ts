import { WEAPONS } from './gameplay';
import {
  ORDINARY_WEAPON_IDS,
  type GuestCombatInventory,
  type GuestCombatInventoryProjection,
  type GuestCombatWeaponProjection,
  type OrdinaryWeaponId,
  type PrimaryWeaponId,
  type SidearmWeaponId,
  type ShotResultMessage,
  type WeaponId,
} from './protocol';

export function admitLocalShotInventoryRepair(
  message: ShotResultMessage,
  pending: Readonly<{
    playerId: string;
    shotId: string;
    connectionEpoch: string;
    lifeId: number;
    shotSeq: number;
    weapon: OrdinaryWeaponId;
  }>,
  cursor: Readonly<{ lastShotSeq: number; authorityRevision: number }>,
): boolean {
  return message.forPlayerId === pending.playerId
    && message.shotId === pending.shotId
    && message.connectionEpoch === pending.connectionEpoch
    && message.lifeId === pending.lifeId
    && message.shotSeq === pending.shotSeq
    && message.weapon === pending.weapon
    && message.shotSeq > cursor.lastShotSeq
    && message.combatInventory !== null
    && message.combatInventory.revision >= cursor.authorityRevision;
}

export function reapplyPendingShotPredictions(
  projection: GuestCombatInventoryProjection,
  pendingShots: Iterable<Readonly<{
    connectionEpoch: string;
    lifeId: number;
    shotSeq: number;
    weapon: OrdinaryWeaponId;
  }>>,
  context: Readonly<{ connectionEpoch: string; lifeId: number; shotSequenceWatermark: number }>,
): GuestCombatInventoryProjection {
  const pendingByWeapon = new Map<OrdinaryWeaponId, number>();
  for (const pending of pendingShots) {
    if (pending.connectionEpoch !== context.connectionEpoch || pending.lifeId !== context.lifeId
      || pending.shotSeq <= context.shotSequenceWatermark) continue;
    pendingByWeapon.set(pending.weapon, (pendingByWeapon.get(pending.weapon) ?? 0) + 1);
  }
  const reapply = <TWeapon extends OrdinaryWeaponId>(counter: GuestCombatWeaponProjection<TWeapon>): GuestCombatWeaponProjection<TWeapon> => Object.freeze({
    ...counter,
    ammo: Math.max(0, counter.ammo - (pendingByWeapon.get(counter.weapon) ?? 0)),
  });
  return Object.freeze({
    ...projection,
    primary: reapply(projection.primary),
    sidearm: reapply(projection.sidearm),
  });
}

type WeaponCounters = Readonly<Record<WeaponId, number>>;

function counters(fill: (weapon: OrdinaryWeaponId) => number): Record<OrdinaryWeaponId, number> {
  return Object.fromEntries(ORDINARY_WEAPON_IDS.map((weapon) => [weapon, fill(weapon)])) as Record<OrdinaryWeaponId, number>;
}

function freezeInventory(
  ammo: Readonly<Record<OrdinaryWeaponId, number>>,
  reserve: Readonly<Record<OrdinaryWeaponId, number>>,
  grenades: number,
): GuestCombatInventory {
  return Object.freeze({
    ammo: Object.freeze({ ...ammo }),
    reserve: Object.freeze({ ...reserve }),
    grenades: grenades > 0 ? 1 : 0,
  });
}

export function createGuestCombatInventory(
  primary: PrimaryWeaponId,
  sidearm: SidearmWeaponId,
  grenades = 1,
): GuestCombatInventory {
  const equipped = new Set<OrdinaryWeaponId>([primary, sidearm]);
  return freezeInventory(
    counters((weapon) => equipped.has(weapon) ? WEAPONS[weapon].mag : 0),
    counters((weapon) => equipped.has(weapon) ? WEAPONS[weapon].reserve : 0),
    grenades,
  );
}

export function captureGuestCombatInventory(
  ammo: WeaponCounters,
  reserve: WeaponCounters,
  grenades: number,
): GuestCombatInventory {
  return freezeInventory(
    counters((weapon) => Math.max(0, Math.min(WEAPONS[weapon].mag, Math.floor(ammo[weapon] ?? 0)))),
    counters((weapon) => Math.max(0, Math.min(WEAPONS[weapon].reserve, Math.floor(reserve[weapon] ?? 0)))),
    grenades,
  );
}

export function guestCombatInventoryWithinWeaponCaps(inventory: GuestCombatInventory): boolean {
  return ORDINARY_WEAPON_IDS.every((weapon) => Number.isSafeInteger(inventory.ammo[weapon])
    && Number.isSafeInteger(inventory.reserve[weapon])
    && inventory.ammo[weapon] >= 0 && inventory.ammo[weapon] <= WEAPONS[weapon].mag
    && inventory.reserve[weapon] >= 0 && inventory.reserve[weapon] <= WEAPONS[weapon].reserve)
    && (inventory.grenades === 0 || inventory.grenades === 1);
}

export function createGuestCombatInventoryProjection(
  authority: GuestCombatInventory,
  revision: number,
  primary: PrimaryWeaponId,
  sidearm: SidearmWeaponId,
): GuestCombatInventoryProjection {
  return Object.freeze({
    revision: Math.max(0, Math.floor(revision)),
    primary: Object.freeze({ weapon: primary, ammo: authority.ammo[primary], reserve: authority.reserve[primary] }),
    sidearm: Object.freeze({ weapon: sidearm, ammo: authority.ammo[sidearm], reserve: authority.reserve[sidearm] }),
    grenades: authority.grenades,
  });
}

export function captureGuestCombatInventoryProjection(
  ammo: WeaponCounters,
  reserve: WeaponCounters,
  grenades: number,
  revision: number,
  primary: PrimaryWeaponId,
  sidearm: SidearmWeaponId,
): GuestCombatInventoryProjection {
  const projected = <TWeapon extends OrdinaryWeaponId>(weapon: TWeapon) => Object.freeze({
    weapon,
    ammo: Math.max(0, Math.min(WEAPONS[weapon].mag, Math.floor(ammo[weapon] ?? 0))),
    reserve: Math.max(0, Math.min(WEAPONS[weapon].reserve, Math.floor(reserve[weapon] ?? 0))),
  });
  return Object.freeze({
    revision: Math.max(0, Math.floor(revision)),
    primary: projected(primary),
    sidearm: projected(sidearm),
    grenades: grenades > 0 ? 1 : 0,
  });
}

export type GuestCombatInventoryProjectionAdmission = Readonly<{
  inventory: GuestCombatInventory;
  revision: number;
}>;

/** Validate a compact client observation without granting it mutation authority.
 * Reload transfer is host-timed elsewhere; even a total-conserving client split
 * is rejected unless both counters already equal the canonical ledger. */
export function reconcileGuestCombatInventoryProjection(
  authority: GuestCombatInventory,
  candidate: GuestCombatInventoryProjection,
  expectedPrimary: PrimaryWeaponId,
  expectedSidearm: SidearmWeaponId,
  hostGrenades: number,
  lastAcceptedRevision: number,
  admittedStateSequence: number,
): GuestCombatInventoryProjectionAdmission | null {
  if (!Number.isSafeInteger(candidate.revision)
    || candidate.revision !== admittedStateSequence
    || candidate.revision <= lastAcceptedRevision
    || candidate.primary.weapon !== expectedPrimary
    || candidate.sidearm.weapon !== expectedSidearm
    || candidate.grenades !== hostGrenades) return null;
  const projections = [candidate.primary, candidate.sidearm] as const;
  for (const projected of projections) {
    const spec = WEAPONS[projected.weapon];
    if (!Number.isSafeInteger(projected.ammo) || !Number.isSafeInteger(projected.reserve)
      || projected.ammo < 0 || projected.ammo > spec.mag
      || projected.reserve < 0 || projected.reserve > spec.reserve
      || projected.ammo !== authority.ammo[projected.weapon]
      || projected.reserve !== authority.reserve[projected.weapon]) return null;
  }
  return Object.freeze({
    inventory: authority,
    revision: candidate.revision,
  });
}

export function consumeGuestCombatRound(
  authority: GuestCombatInventory,
  weapon: WeaponId,
): GuestCombatInventory {
  const ordinary = ORDINARY_WEAPON_IDS.find((candidate) => candidate === weapon);
  if (!ordinary || authority.ammo[ordinary] <= 0) return authority;
  const ammo = { ...authority.ammo };
  const reserve = { ...authority.reserve };
  ammo[ordinary] -= 1;
  return freezeInventory(ammo, reserve, authority.grenades);
}

export function guestCombatInventoryCanFire(
  authority: GuestCombatInventory,
  weapon: WeaponId,
): boolean {
  const ordinary = ORDINARY_WEAPON_IDS.find((candidate) => candidate === weapon);
  return ordinary !== undefined && authority.ammo[ordinary] > 0;
}

export function setGuestCombatInventoryWeapon(
  authority: GuestCombatInventory,
  weapon: OrdinaryWeaponId,
  ammoCount: number,
  reserveCount: number,
): GuestCombatInventory {
  const ammo = { ...authority.ammo, [weapon]: Math.max(0, Math.min(WEAPONS[weapon].mag, Math.floor(ammoCount))) };
  const reserve = { ...authority.reserve, [weapon]: Math.max(0, Math.min(WEAPONS[weapon].reserve, Math.floor(reserveCount))) };
  return freezeInventory(ammo, reserve, authority.grenades);
}

export function setGuestCombatInventoryGrenades(
  authority: GuestCombatInventory,
  grenades: number,
): GuestCombatInventory {
  return freezeInventory(authority.ammo, authority.reserve, grenades);
}
