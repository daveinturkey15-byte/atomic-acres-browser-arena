import {
  GRENADE_CATALOG,
  type GrenadeAvailability,
  type GrenadeCatalogDefinition,
  type GrenadeId,
} from './combat/grenade-catalog';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { WeaponBotPolicy, WeaponDefinition, WeaponFireKind } from './combat/weapon-schema';
import { WEAPON_IDS, type WeaponId } from './protocol';
import { FLARE_PROJECTILE_EFFECT } from './special-weapon-effects';

export const BOT_SUPPORTED_FIRE_KINDS = Object.freeze(['hitscan', 'pellet', 'slug', 'projectile'] as const);
export type BotSupportedFireKind = (typeof BOT_SUPPORTED_FIRE_KINDS)[number];
export type BotWeaponFireAdapter = 'ballistic-ray' | 'signal-flare-projectile';

export type BotWeaponProjectionSource = Readonly<{
  id: string;
  fireKind: WeaponFireKind;
  projectileId: string | null;
  policies: Readonly<{ bot: WeaponBotPolicy }>;
}>;

export type BotGrenadeProjectionSource = Readonly<{
  id: string;
  availability: GrenadeAvailability;
}>;

function duplicateIds(definitions: readonly Readonly<{ id: string }>[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.id)) duplicates.add(definition.id);
    seen.add(definition.id);
  }
  return [...duplicates].sort();
}

/**
 * Every bot-eligible fire kind resolves to an implemented runtime adapter.
 * Projectile eligibility is intentionally narrower than `fireKind`: adding a
 * new projectile family must name its real simulation here instead of silently
 * falling through the hitscan path.
 */
export function botWeaponFireAdapterFor(
  definition: Pick<BotWeaponProjectionSource, 'fireKind' | 'projectileId'>,
): BotWeaponFireAdapter | null {
  if (definition.fireKind === 'hitscan' || definition.fireKind === 'pellet' || definition.fireKind === 'slug') {
    return definition.projectileId === null ? 'ballistic-ray' : null;
  }
  return definition.projectileId === 'signal-flare-v1' ? 'signal-flare-projectile' : null;
}

/** Deterministic first-order gravity lead for the shipped signal-flare adapter. */
export function botSignalFlareAimDirection(
  origin: Readonly<{ x: number; y: number; z: number }>,
  target: Readonly<{ x: number; y: number; z: number }>,
): readonly [number, number, number] | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (![dx, dy, dz, distance].every(Number.isFinite) || distance < 0.001) return null;
  const flightSeconds = distance / FLARE_PROJECTILE_EFFECT.speedMps;
  const compensatedY = dy + 0.5 * FLARE_PROJECTILE_EFFECT.gravityMps2 * flightSeconds * flightSeconds;
  const length = Math.hypot(dx, compensatedY, dz);
  if (!Number.isFinite(length) || length < 0.001) return null;
  return Object.freeze([dx / length, compensatedY / length, dz / length] as const);
}

export function projectBotWeaponIds(
  definitions: readonly BotWeaponProjectionSource[],
): readonly string[] {
  const duplicates = duplicateIds(definitions);
  if (duplicates.length > 0) throw new Error(`Duplicate canonical weapon IDs: ${duplicates.join(', ')}`);
  const eligible = definitions.filter((definition) => definition.policies.bot === 'eligible');
  const unsupported = eligible.filter((definition) => botWeaponFireAdapterFor(definition) === null);
  if (unsupported.length > 0) {
    throw new Error(`Bot-eligible weapons require an implemented fire-kind adapter: ${unsupported.map((entry) => `${entry.id}:${entry.fireKind}:${entry.projectileId ?? 'none'}`).join(', ')}`);
  }
  if (eligible.length === 0) throw new Error('Canonical weapon catalog has no bot-eligible weapons');
  return Object.freeze(eligible.map((definition) => definition.id));
}

export function projectBotGrenadeIds(
  definitions: readonly BotGrenadeProjectionSource[],
): readonly string[] {
  const duplicates = duplicateIds(definitions);
  if (duplicates.length > 0) throw new Error(`Duplicate canonical grenade IDs: ${duplicates.join(', ')}`);
  const shipped = definitions.filter((definition) => definition.availability === 'shipped');
  if (shipped.length === 0) throw new Error('Canonical grenade catalog has no shipped families');
  return Object.freeze(shipped.map((definition) => definition.id));
}

const protocolWeaponIds = new Set<string>(WEAPON_IDS);
const canonicalBotWeaponIds = projectBotWeaponIds(WEAPON_CATALOG);
for (const id of canonicalBotWeaponIds) {
  if (!protocolWeaponIds.has(id)) throw new Error(`Bot weapon ${id} is missing from the protocol weapon registry`);
}

export const BOT_WEAPON_DEFINITIONS: readonly WeaponDefinition[] = Object.freeze(
  WEAPON_CATALOG.filter((definition) => definition.policies.bot === 'eligible'),
);
export const BOT_WEAPON_POOL: readonly WeaponId[] = Object.freeze(canonicalBotWeaponIds as WeaponId[]);
/** Spawn loadouts exclude host-owned pickups while retaining their bot fire adapters/GPU vocabulary. */
export const BOT_STARTING_WEAPON_POOL: readonly WeaponId[] = Object.freeze(
  BOT_WEAPON_DEFINITIONS
    .filter((definition) => definition.policies.loadout !== 'pickup-only')
    .map((definition) => definition.id as WeaponId),
);

const canonicalBotGrenadeIds = projectBotGrenadeIds(GRENADE_CATALOG);
const canonicalGrenadeIds = new Set<string>(GRENADE_CATALOG.map((definition) => definition.id));
for (const id of canonicalBotGrenadeIds) {
  if (!canonicalGrenadeIds.has(id)) throw new Error(`Bot grenade ${id} is missing from the canonical grenade registry`);
}
export const BOT_GRENADE_POOL: readonly GrenadeId[] = Object.freeze(canonicalBotGrenadeIds as GrenadeId[]);

const botWeaponsById = new Map<WeaponId, WeaponDefinition>(
  BOT_WEAPON_DEFINITIONS.map((definition) => [definition.id as WeaponId, definition]),
);

export function botWeaponDefinition(id: WeaponId): WeaponDefinition {
  const definition = botWeaponsById.get(id);
  if (!definition) throw new Error(`Weapon ${id} is not bot-eligible`);
  return definition;
}

export function botWeaponFireAdapter(id: WeaponId): BotWeaponFireAdapter {
  const definition = botWeaponDefinition(id);
  const adapter = botWeaponFireAdapterFor(definition);
  if (!adapter) throw new Error(`Weapon ${id} has no implemented bot fire adapter`);
  return adapter;
}

function boundedRandomSample(random: () => number): number {
  const sample = random();
  return Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : 0;
}

export type ShuffleBag<T> = Readonly<{
  next: () => T;
  remaining: () => number;
}>;

/** Covers every member once per seeded bag and avoids a boundary repeat whenever another member exists. */
export function createShuffleBag<T>(values: readonly T[], random: () => number): ShuffleBag<T> {
  if (values.length === 0) throw new Error('A shuffle bag requires at least one value');
  if (new Set(values).size !== values.length) throw new Error('A shuffle bag cannot contain duplicate values');
  let bag: T[] = [];
  let previous: T | undefined;

  const refill = (): void => {
    bag = [...values];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(boundedRandomSample(random) * (index + 1));
      [bag[index], bag[swap]] = [bag[swap]!, bag[index]!];
    }
    if (previous !== undefined && bag.length > 1 && Object.is(bag[0], previous)) {
      const alternate = bag.findIndex((entry) => !Object.is(entry, previous));
      [bag[0], bag[alternate]] = [bag[alternate]!, bag[0]!];
    }
  };

  return Object.freeze({
    next: (): T => {
      if (bag.length === 0) refill();
      const next = bag.shift()!;
      previous = next;
      return next;
    },
    remaining: (): number => bag.length,
  });
}

export function assignBotWeapons(count: number, random: () => number): WeaponId[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const bag = createShuffleBag(BOT_WEAPON_POOL, random);
  return Array.from({ length: total }, () => bag.next());
}

export function assignBotGrenades(count: number, random: () => number): GrenadeId[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const bag = createShuffleBag(BOT_GRENADE_POOL, random);
  return Array.from({ length: total }, () => bag.next());
}

/** Fire cadence and burst shape come from the canonical weapon definition, not an ID branch list. */
export function botWeaponBurstSize(weapon: WeaponId, variation: number): number {
  const definition = botWeaponDefinition(weapon);
  if (definition.fireKind === 'pellet' || definition.fireKind === 'slug' || definition.fireMode === 'semi') return 1;
  const base = Math.max(2, Math.min(6, Math.round(definition.rpm / 240)));
  return base + Math.abs(Math.floor(Number.isFinite(variation) ? variation : 0)) % 2;
}

export function botWeaponFireInterval(weapon: WeaponId, burstActive: boolean): number {
  const definition = botWeaponDefinition(weapon);
  const authoredShotInterval = 60_000 / definition.rpm;
  if (burstActive && definition.fireMode === 'automatic') return Math.max(45, authoredShotInterval);
  if (definition.fireKind === 'pellet') return Math.max(720, authoredShotInterval);
  if (definition.fireKind === 'slug') return Math.max(760, authoredShotInterval);
  if (definition.fireMode === 'semi') return Math.max(260, authoredShotInterval);
  return Math.max(430, authoredShotInterval * 2.4);
}

export function grenadeDefinition(id: GrenadeId): GrenadeCatalogDefinition {
  const definition = GRENADE_CATALOG.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown canonical grenade ${id}`);
  return definition;
}
