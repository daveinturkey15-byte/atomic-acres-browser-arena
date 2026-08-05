import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  LOADOUT_STORAGE_SCHEMA_VERSION,
  LOADOUT_STORAGE_V2_KEY,
  LOADOUT_STORAGE_V2_STAGE_KEY,
  createDefaultCustomPresets,
  createLoadoutItemEligibility,
  type LoadoutStorageV2,
} from './loadout-preset-schema';
import { FIELD_KIT_STORAGE_KEY } from './loadout';
import { KILLSTREAK_LOADOUT_STORAGE_KEY } from './killstreak-loadout';
import { PASS65_SETTINGS_STORAGE_KEY, normalizePass65Settings } from './pass65-settings';
import { RENDER_PROFILE_STORAGE_KEY } from './render-profile';
import {
  LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY,
  LEGACY_FOV_STORAGE_KEY,
  LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY,
  PLAYER_PROFILE_LEGACY_KEYS,
  PLAYER_PROFILE_STORAGE_KEY,
  PlayerProfileStore,
  createDefaultPlayerProfile,
  createNextPlayerProfile,
  decodePlayerProfile,
  loadPlayerProfile,
  writePlayerProfile,
  type PlayerProfileContext,
  type PlayerProfileStorage,
} from './player-profile';

class MemoryStorage implements PlayerProfileStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly removals: string[] = [];

  getItem(key: string): string | null {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removals.push(key);
    this.values.delete(key);
  }
}

const eligibility = createLoadoutItemEligibility(WEAPON_CATALOG);
const customPresets = createDefaultCustomPresets(
  { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' },
  eligibility,
).map((preset) => preset.id === 'custom-2'
  ? { ...preset, primary: 'mp5' as const, secondary: 'machine-pistol' as const, grenade: 'smoke' as const }
  : preset.id === 'custom-3'
    ? { ...preset, primary: 'm14-ebr' as const, secondary: 'flashlight-pistol' as const, grenade: 'flash' as const }
    : preset);
const defaultLoadout: LoadoutStorageV2 = Object.freeze({
  schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
  selected: Object.freeze({ kind: 'curated', kitId: 'balanced' }),
  customPresets: Object.freeze(customPresets),
});
const context: PlayerProfileContext = Object.freeze({
  capabilityHints: Object.freeze({ hardwareConcurrency: 16, deviceMemoryGb: 16 }),
  loadoutEligibility: eligibility,
  defaultLoadout,
});

describe('canonical Pass 65 player profile', () => {
  it('round-trips every preference family through one route-neutral key', () => {
    const storage = new MemoryStorage();
    const latestRoute = new URL('https://atomic.example/?release=latest');
    const stableRoute = new URL('https://atomic.example/?release=stable');
    expect(latestRoute.origin).toBe(stableRoute.origin);

    const latest = new PlayerProfileStore(storage, context);
    expect(latest.loadResult.source).toBe('default-created');
    expect(latest.current.settings.privacy.shareGlobalLeaderboard).toBe(false);
    expect([...storage.values.keys()]).toEqual([PLAYER_PROFILE_STORAGE_KEY]);

    const renamedLoadout: LoadoutStorageV2 = {
      ...latest.current.loadout,
      selected: { kind: 'custom', presetId: 'custom-2' },
      customPresets: latest.current.loadout.customPresets.map((preset) => preset.id === 'custom-2'
        ? { ...preset, displayName: 'Night Courier', grenade: 'semtex' }
        : preset),
    };
    const result = latest.update({
      settings: normalizePass65Settings({
        ...latest.current.settings,
        graphics: { ...latest.current.settings.graphics, preset: 'custom', targetFps: 240 },
        privacy: { schemaVersion: 1, shareGlobalLeaderboard: true },
      }, context.capabilityHints),
      controls: { schemaVersion: 1, mouseSensitivity: 1.35, controllerSensitivity: 0.85, fieldOfView: 96 },
      loadout: renamedLoadout,
      killstreakLoadout: {
        schemaVersion: 1,
        slots: ['adrenaline', 'piloted-drone', 'carpet-bomber', 'hunter-swarm', 'drone-swarm'],
      },
    });
    expect(result.ok).toBe(true);
    expect(storage.writes.every((key) => key === PLAYER_PROFILE_STORAGE_KEY)).toBe(true);

    const stable = new PlayerProfileStore(storage, context);
    expect(stable.current).toEqual(latest.current);
    expect(stable.current).toMatchObject({
      settings: { graphics: { preset: 'custom', targetFps: 240 }, privacy: { shareGlobalLeaderboard: true } },
      controls: { mouseSensitivity: 1.35, controllerSensitivity: 0.85, fieldOfView: 96 },
      loadout: { selected: { kind: 'custom', presetId: 'custom-2' } },
      killstreakLoadout: { slots: ['adrenaline', 'piloted-drone', 'carpet-bomber', 'hunter-swarm', 'drone-swarm'] },
    });
    expect(stable.current.loadout.customPresets.find(({ id }) => id === 'custom-2')).toMatchObject({
      displayName: 'Night Courier', grenade: 'semtex',
    });
  });

  it('migrates every prior preference key once, verifies the profile, then ignores stale legacy values', () => {
    const storage = new MemoryStorage();
    const legacyLoadout: LoadoutStorageV2 = {
      ...defaultLoadout,
      selected: { kind: 'custom', presetId: 'custom-3' },
      customPresets: defaultLoadout.customPresets.map((preset) => preset.id === 'custom-3'
        ? { ...preset, displayName: 'Long Watch', grenade: 'semtex' }
        : preset),
    };
    storage.values.set(PASS65_SETTINGS_STORAGE_KEY, JSON.stringify(normalizePass65Settings({
      graphics: { preset: 'custom', targetFps: 240 },
      privacy: { schemaVersion: 1, shareGlobalLeaderboard: true },
    }, context.capabilityHints)));
    storage.values.set(RENDER_PROFILE_STORAGE_KEY, 'performance');
    storage.values.set(LOADOUT_STORAGE_V2_KEY, JSON.stringify(legacyLoadout));
    storage.values.set(LOADOUT_STORAGE_V2_STAGE_KEY, '{uncommitted-stage');
    storage.values.set(FIELD_KIT_STORAGE_KEY, JSON.stringify({ version: 1, selected: 'runner' }));
    storage.values.set(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
    }));
    storage.values.set(LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY, '1.7');
    storage.values.set(LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY, '1.25');
    storage.values.set(LEGACY_FOV_STORAGE_KEY, '99');

    const first = new PlayerProfileStore(storage, context);
    expect(first.loadResult.source).toBe('migrated');
    expect(first.loadResult.canonicalWrite?.ok).toBe(true);
    expect(first.current).toMatchObject({
      settings: { graphics: { preset: 'custom', targetFps: 240 }, privacy: { shareGlobalLeaderboard: true } },
      controls: { mouseSensitivity: 1.7, controllerSensitivity: 1.25, fieldOfView: 99 },
      loadout: { selected: { kind: 'custom', presetId: 'custom-3' } },
      killstreakLoadout: { slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'] },
    });
    expect(first.current.loadout.customPresets.find(({ id }) => id === 'custom-3')).toMatchObject({
      displayName: 'Long Watch', grenade: 'semtex',
    });
    for (const key of PLAYER_PROFILE_LEGACY_KEYS) expect(storage.values.has(key), key).toBe(false);

    storage.values.set(LEGACY_FOV_STORAGE_KEY, '70');
    storage.values.set(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
    }));
    storage.reads.length = 0;
    const second = new PlayerProfileStore(storage, context);
    expect(second.current).toEqual(first.current);
    expect(storage.reads).toEqual([PLAYER_PROFILE_STORAGE_KEY]);
    expect(storage.values.has(LEGACY_FOV_STORAGE_KEY)).toBe(false);
    expect(storage.values.has(KILLSTREAK_LOADOUT_STORAGE_KEY)).toBe(false);
  });

  it('preserves the old renderer and field-kit fallbacks when newer legacy stores are absent', () => {
    const storage = new MemoryStorage();
    storage.values.set(RENDER_PROFILE_STORAGE_KEY, 'performance');
    storage.values.set(FIELD_KIT_STORAGE_KEY, JSON.stringify({ version: 1, selected: 'marksman' }));
    const migrated = loadPlayerProfile(storage, context);
    expect(migrated.source).toBe('migrated');
    expect(migrated.profile.settings.graphics.preset).toBe('performance');
    expect(migrated.profile.loadout.selected).toEqual({ kind: 'curated', kitId: 'marksman' });
  });

  it('recovers malformed current data but never overwrites an unknown future profile', () => {
    const corrupt = new MemoryStorage();
    corrupt.values.set(PLAYER_PROFILE_STORAGE_KEY, '{bad');
    corrupt.values.set(LEGACY_FOV_STORAGE_KEY, '94');
    const recovered = new PlayerProfileStore(corrupt, context);
    expect(recovered.loadResult.source).toBe('recovered-corrupt');
    expect(recovered.current.controls.fieldOfView).toBe(94);
    expect(decodePlayerProfile(corrupt.values.get(PLAYER_PROFILE_STORAGE_KEY)!, context).ok).toBe(true);

    const future = new MemoryStorage();
    const futureValue = JSON.stringify({ schemaVersion: 2, revision: 99, encryptedCloudIdentity: true });
    future.values.set(PLAYER_PROFILE_STORAGE_KEY, futureValue);
    future.values.set(LEGACY_FOV_STORAGE_KEY, '100');
    const protectedStore = new PlayerProfileStore(future, context);
    expect(protectedStore.loadResult).toMatchObject({ source: 'future-default', writeProtected: true, futureVersion: 2 });
    expect(protectedStore.current.settings.privacy.shareGlobalLeaderboard).toBe(false);
    const update = protectedStore.update({
      controls: { ...protectedStore.current.controls, fieldOfView: 100 },
    }, { sessionOnFailure: true });
    expect(update).toMatchObject({ ok: false, persisted: false, reason: 'future-version' });
    expect(protectedStore.current.controls.fieldOfView).toBe(100);
    expect(future.values.get(PLAYER_PROFILE_STORAGE_KEY)).toBe(futureValue);
    expect(future.values.get(LEGACY_FOV_STORAGE_KEY)).toBe('100');
  });

  it('fails safely when storage is unavailable or legacy values are hostile', () => {
    const unavailable = loadPlayerProfile(null, context);
    expect(unavailable).toMatchObject({ source: 'storage-unavailable', writeProtected: false });
    expect(unavailable.profile.settings.privacy.shareGlobalLeaderboard).toBe(false);

    const hostile = new MemoryStorage();
    hostile.values.set(PASS65_SETTINGS_STORAGE_KEY, '{bad');
    hostile.values.set(LOADOUT_STORAGE_V2_KEY, '{bad');
    hostile.values.set(FIELD_KIT_STORAGE_KEY, JSON.stringify({ version: 99, selected: '<script>' }));
    hostile.values.set(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, slots: ['nuke'] }));
    hostile.values.set(LEGACY_MOUSE_SENSITIVITY_STORAGE_KEY, 'Infinity');
    hostile.values.set(LEGACY_CONTROLLER_SENSITIVITY_STORAGE_KEY, '-50');
    hostile.values.set(LEGACY_FOV_STORAGE_KEY, '999');
    const repaired = loadPlayerProfile(hostile, context);
    expect(repaired.profile).toEqual(createDefaultPlayerProfile(context));

    const throwing: PlayerProfileStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadPlayerProfile(throwing, context)).toMatchObject({ source: 'storage-unavailable' });
  });

  it('rolls a single-key write back after fault injection and retains legacy data until commit succeeds', () => {
    const storage = new MemoryStorage();
    const prior = createDefaultPlayerProfile(context);
    expect(writePlayerProfile(storage, prior, context).ok).toBe(true);
    const priorSerialized = storage.values.get(PLAYER_PROFILE_STORAGE_KEY)!;
    const next = createNextPlayerProfile(prior, {
      controls: { ...prior.controls, fieldOfView: 95 },
    }, context);
    let canonicalReads = 0;
    const mismatched: PlayerProfileStorage = {
      getItem: (key) => {
        if (key === PLAYER_PROFILE_STORAGE_KEY) canonicalReads += 1;
        if (key === PLAYER_PROFILE_STORAGE_KEY && canonicalReads === 2) return '{corrupt-readback';
        return storage.getItem(key);
      },
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
    };
    expect(writePlayerProfile(mismatched, next, context)).toMatchObject({
      ok: false, reason: 'readback-mismatch', rollback: 'restored',
    });
    expect(storage.values.get(PLAYER_PROFILE_STORAGE_KEY)).toBe(priorSerialized);
    expect(writePlayerProfile(storage, next, context, {
      checkpoint: (point) => { if (point === 'after-write') throw new Error('fault'); },
    })).toMatchObject({ ok: false, reason: 'checkpoint-failed', checkpoint: 'after-write', rollback: 'restored' });
    expect(storage.values.get(PLAYER_PROFILE_STORAGE_KEY)).toBe(priorSerialized);

    const migrationFailure = new MemoryStorage();
    migrationFailure.values.set(LEGACY_FOV_STORAGE_KEY, '93');
    const quotaStorage: PlayerProfileStorage = {
      getItem: (key) => migrationFailure.getItem(key),
      setItem: (key, value) => {
        if (key === PLAYER_PROFILE_STORAGE_KEY) throw new Error('quota');
        migrationFailure.setItem(key, value);
      },
      removeItem: (key) => migrationFailure.removeItem(key),
    };
    const failedMigration = loadPlayerProfile(quotaStorage, context);
    expect(failedMigration.canonicalWrite).toMatchObject({ ok: false, reason: 'storage-failed' });
    expect(migrationFailure.values.get(LEGACY_FOV_STORAGE_KEY)).toBe('93');
  });

  it('keeps identity, scores, diagnostics and rejoin leases outside the preference profile', () => {
    expect(PLAYER_PROFILE_LEGACY_KEYS).not.toContain('atomic-acres:player-name:v1');
    expect(PLAYER_PROFILE_LEGACY_KEYS).not.toContain('atomic-acres:leaderboard-install:v2');
    expect(PLAYER_PROFILE_LEGACY_KEYS.some((key) => key.includes('score'))).toBe(false);
    expect(PLAYER_PROFILE_LEGACY_KEYS.some((key) => key.includes('room'))).toBe(false);
  });
});
