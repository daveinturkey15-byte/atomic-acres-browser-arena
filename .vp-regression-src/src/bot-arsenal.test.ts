import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GRENADE_CATALOG } from './combat/grenade-catalog';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  BOT_GRENADE_POOL,
  BOT_STARTING_WEAPON_POOL,
  BOT_SUPPORTED_FIRE_KINDS,
  BOT_WEAPON_DEFINITIONS,
  BOT_WEAPON_POOL,
  assignBotGrenades,
  assignBotWeapons,
  botWeaponBurstSize,
  botWeaponFireAdapter,
  botWeaponFireAdapterFor,
  botWeaponFireInterval,
  botSignalFlareAimDirection,
  projectBotGrenadeIds,
  projectBotWeaponIds,
  type BotGrenadeProjectionSource,
  type BotWeaponProjectionSource,
} from './bot-arsenal';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 0x1_0000_0000;
  };
}

function expectCompleteCycles<T>(values: readonly T[], source: readonly T[]): void {
  for (let offset = 0; offset < values.length; offset += source.length) {
    expect(new Set(values.slice(offset, offset + source.length))).toEqual(new Set(source));
  }
  expect(values.every((value, index) => index === 0 || value !== values[index - 1])).toBe(true);
}

const weaponSources = (): BotWeaponProjectionSource[] => WEAPON_CATALOG.map((definition) => ({
  id: definition.id,
  fireKind: definition.fireKind,
  projectileId: definition.projectileId,
  policies: { bot: definition.policies.bot },
}));

const grenadeSources = (): BotGrenadeProjectionSource[] => GRENADE_CATALOG.map((definition) => ({
  id: definition.id,
  availability: definition.availability,
}));

describe('catalog-derived bot arsenal', () => {
  it('projects every canonical bot-eligible weapon and every shipped grenade exactly once', () => {
    expect(BOT_WEAPON_POOL).toEqual(
      WEAPON_CATALOG.filter((definition) => definition.policies.bot === 'eligible').map((definition) => definition.id),
    );
    expect(BOT_GRENADE_POOL).toEqual(
      GRENADE_CATALOG.filter((definition) => definition.availability === 'shipped').map((definition) => definition.id),
    );
    expect(new Set(BOT_WEAPON_POOL).size).toBe(BOT_WEAPON_POOL.length);
    expect(new Set(BOT_GRENADE_POOL).size).toBe(BOT_GRENADE_POOL.length);
    expect(BOT_WEAPON_POOL).toEqual(expect.arrayContaining([
      'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'm14-ebr', 'slug-shotgun', 'pistol', 'machine-pistol', 'flamethrower',
      'flare-gun',
    ]));
    expect(BOT_GRENADE_POOL).toEqual(['frag', 'smoke', 'flash', 'semtex']);
  });

  it('keeps pickup-only specials adapter-ready without granting them as ordinary spawn loadouts', () => {
    const expectedStartingPool = WEAPON_CATALOG
      .filter((definition) => definition.policies.bot === 'eligible' && definition.policies.loadout !== 'pickup-only')
      .map((definition) => definition.id);
    expect(BOT_STARTING_WEAPON_POOL).toEqual(expectedStartingPool);
    expect(BOT_WEAPON_POOL).toContain('flamethrower');
    expect(BOT_WEAPON_POOL).toContain('flare-gun');
    expect(BOT_STARTING_WEAPON_POOL).not.toContain('flamethrower');
    expect(BOT_STARTING_WEAPON_POOL).not.toContain('flare-gun');
    expect(new Set(BOT_STARTING_WEAPON_POOL).size).toBe(BOT_STARTING_WEAPON_POOL.length);
  });

  it('automatically follows synthetic add-two, rename and retire mutations without a bot mirror', () => {
    const weapons = weaponSources();
    const firstEligible = weapons.find((definition) => definition.policies.bot === 'eligible')!;
    const addedWeapons = [
      ...weapons,
      { id: 'future-bot-rifle', fireKind: 'hitscan', projectileId: null, policies: { bot: 'eligible' } },
      { id: 'future-bot-slug', fireKind: 'slug', projectileId: null, policies: { bot: 'eligible' } },
    ] as const satisfies readonly BotWeaponProjectionSource[];
    expect(projectBotWeaponIds(addedWeapons)).toEqual(expect.arrayContaining(['future-bot-rifle', 'future-bot-slug']));

    const renamedWeapons = weapons.map((definition) => definition.id === firstEligible.id
      ? { ...definition, id: 'renamed-bot-weapon' }
      : definition);
    expect(projectBotWeaponIds(renamedWeapons)).toContain('renamed-bot-weapon');
    expect(projectBotWeaponIds(renamedWeapons)).not.toContain(firstEligible.id);

    const retiredWeapons = weapons.map((definition) => definition.id === firstEligible.id
      ? { ...definition, policies: { bot: 'never' as const } }
      : definition);
    expect(projectBotWeaponIds(retiredWeapons)).not.toContain(firstEligible.id);
    expect(() => projectBotWeaponIds([...weapons, weapons[0]!])).toThrow(/Duplicate canonical weapon IDs/);
    expect(() => projectBotWeaponIds([
      ...weapons,
      { id: 'future-projectile-without-adapter', fireKind: 'projectile', projectileId: 'future-orb', policies: { bot: 'eligible' } },
    ])).toThrow(/fire-kind adapter/);

    const grenades = grenadeSources();
    const addedGrenades = [
      ...grenades,
      { id: 'future-emp', availability: 'shipped' },
      { id: 'future-decoy', availability: 'shipped' },
    ] as const satisfies readonly BotGrenadeProjectionSource[];
    expect(projectBotGrenadeIds(addedGrenades)).toEqual(expect.arrayContaining(['future-emp', 'future-decoy']));
    const renamedGrenades = grenades.map((definition) => definition.id === 'frag'
      ? { ...definition, id: 'fragmentation' }
      : definition);
    expect(projectBotGrenadeIds(renamedGrenades)).toContain('fragmentation');
    expect(projectBotGrenadeIds(renamedGrenades)).not.toContain('frag');
    const retiredGrenades = grenades.map((definition) => definition.id === 'smoke'
      ? { ...definition, availability: 'retired' as const }
      : definition);
    expect(projectBotGrenadeIds(retiredGrenades)).not.toContain('smoke');
    expect(() => projectBotGrenadeIds([...grenades, grenades[0]!])).toThrow(/Duplicate canonical grenade IDs/);
  });

  it('covers complete deterministic shuffle bags with no avoidable repeat for many seeds', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const weapons = assignBotWeapons(BOT_WEAPON_POOL.length * 3, seededRandom(seed));
      const grenades = assignBotGrenades(BOT_GRENADE_POOL.length * 4, seededRandom(seed ^ 0x5f3759df));
      expectCompleteCycles(weapons, BOT_WEAPON_POOL);
      expectCompleteCycles(grenades, BOT_GRENADE_POOL);
    }), { numRuns: 100 });
  });

  it('derives cadence and burst behavior for every eligible fire kind', () => {
    expect(new Set(BOT_WEAPON_DEFINITIONS.map((definition) => definition.fireKind))).toEqual(
      new Set(BOT_SUPPORTED_FIRE_KINDS),
    );
    for (const definition of BOT_WEAPON_DEFINITIONS) {
      const burst = botWeaponBurstSize(definition.id as typeof BOT_WEAPON_POOL[number], 3);
      const activeInterval = botWeaponFireInterval(definition.id as typeof BOT_WEAPON_POOL[number], true);
      const recoveryInterval = botWeaponFireInterval(definition.id as typeof BOT_WEAPON_POOL[number], false);
      expect(Number.isSafeInteger(burst) && burst >= 1).toBe(true);
      expect(Number.isFinite(activeInterval) && activeInterval >= 45).toBe(true);
      expect(Number.isFinite(recoveryInterval) && recoveryInterval >= activeInterval).toBe(true);
      if (definition.fireKind === 'pellet' || definition.fireKind === 'slug' || definition.fireMode === 'semi') {
        expect(burst).toBe(1);
      }
    }
  });

  it('routes the pickup-only flare through its projectile simulation and rejects generic projectile fallthrough', () => {
    expect(botWeaponFireAdapter('flare-gun')).toBe('signal-flare-projectile');
    expect(botWeaponFireAdapter('carbine')).toBe('ballistic-ray');
    expect(botWeaponFireAdapterFor({ fireKind: 'projectile', projectileId: 'explosive-bolt-v1' })).toBeNull();
    expect(botWeaponFireAdapterFor({ fireKind: 'projectile', projectileId: null })).toBeNull();
    expect(botWeaponFireAdapterFor({ fireKind: 'hitscan', projectileId: 'fake-projectile' })).toBeNull();

    const direction = botSignalFlareAimDirection(
      { x: 0, y: 1.4, z: 0 },
      { x: 0, y: 1.4, z: -22 },
    );
    expect(direction).not.toBeNull();
    expect(Math.hypot(...direction!)).toBeCloseTo(1, 12);
    expect(direction![1]).toBeGreaterThan(0);
    expect(direction![2]).toBeLessThan(-0.99);
    expect(botSignalFlareAimDirection(
      { x: 1, y: 2, z: 3 },
      { x: 1, y: 2, z: 3 },
    )).toBeNull();
  });
});
