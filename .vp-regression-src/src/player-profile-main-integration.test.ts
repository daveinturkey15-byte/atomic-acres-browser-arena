import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_PROFILE_STORAGE_KEY } from './player-profile';

describe('player profile runtime integration', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  const sourceFiles = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });

  it('routes settings, controls, class loadouts and killstreaks through one store', () => {
    expect(main).toContain("import { PlayerProfileStore, type PlayerControlPreferencesV1 } from './player-profile';");
    expect(main).toContain('const playerProfileStore = new PlayerProfileStore(');
    expect(main).toContain('initialLoadout: playerProfileStore.current.killstreakLoadout');
    expect(main).toContain('playerProfileStore.update({ killstreakLoadout: loadout })');
    expect(main).toContain('playerProfileStore.update({ loadout: candidate })');
    expect(main).toContain('playerProfileStore.update({ settings: next }, { sessionOnFailure: true })');
    expect(main).toContain('playerProfileStore.update({ controls }, { sessionOnFailure: true })');
  });

  it('does not retain direct runtime readers or writers for superseded preference keys', () => {
    for (const legacyKey of [
      'atomic-acres-pass65-settings-v1',
      'atomic-acres.loadout.v2',
      'atomic-acres:killstreak-loadout:v1',
      'atomic-acres-sensitivity',
      'atomic-acres-controller-sensitivity',
      'atomic-acres-fov',
      'atomic-acres-render-profile',
    ]) expect(main, legacyKey).not.toContain(legacyKey);
    expect(main).not.toContain('writePass65Settings(');
    expect(main).not.toContain('writeLoadoutStorageV2Transaction(');
    expect(main).not.toContain('migrateLegacyFieldKitStorageV1(');
  });

  it('uses a release-query-neutral canonical key', () => {
    expect(PLAYER_PROFILE_STORAGE_KEY).toBe('atomic-acres.player-profile.v1');
    expect(PLAYER_PROFILE_STORAGE_KEY).not.toMatch(/release|latest|stable|pass-?6[345]/i);
  });

  it('fails if another runtime source reintroduces a superseded preference consumer', () => {
    const legacyDefinitionOwners = new Set([
      'killstreak-loadout.ts',
      'loadout-preset-schema.ts',
      'pass65-settings.ts',
      'player-profile.ts',
      'render-profile.ts',
    ]);
    const forbidden = [
      'atomic-acres-pass65-settings-v1',
      'atomic-acres.loadout.v2',
      'atomic-acres:killstreak-loadout:v1',
      'atomic-acres-sensitivity',
      'atomic-acres-controller-sensitivity',
      'atomic-acres-fov',
      'writePass65Settings(',
      'writeLoadoutStorageV2Transaction(',
      'migrateLegacyFieldKitStorageV1(',
    ];
    const violations = sourceFiles('src').flatMap((path) => {
      const repoPath = relative('src', path).replaceAll('\\', '/');
      if (legacyDefinitionOwners.has(repoPath)) return [];
      const source = readFileSync(path, 'utf8');
      return forbidden.filter((needle) => source.includes(needle)).map((needle) => `${repoPath}:${needle}`);
    });
    expect(violations).toEqual([]);
  });
});
