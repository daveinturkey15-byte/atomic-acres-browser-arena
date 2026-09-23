import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS, DEFAULT_ARENA_ID, isArenaId } from '../arena-identity';
import {
  ARENA_SELECTIONS, SELECTABLE_ARENAS, arenaSelection, decodeArenaId,
  isMenuMultiplayerArenaId, menuArenaSelection,
} from '../map-selection';
import { DEFAULT_PRIVATE_MATCH_CONFIG, isPrivateMatchConfig } from '../private-match';
import { createPass64ShellViewModel, renderPass64Shell } from '../ui/pass64-shell';
import { menuPreviewVideoDefinition } from '../ui/menu-preview-video';

const retainedIds = [
  'nuketown2', 'raid2', 'atomic-acres', 'skyline-terminal', 'rustworks-1v1',
  'gun-range', 'farcrysis', 'high-seas', 'test1', 'test2', 'map3',
] as const;

// Day-2 (2026-09-14): New World Prime gameplay authority landed, so the row
// was promoted from PASS 97 Day-1 standby to selectable (`map-selection.ts`
// Day-2 flip comment). Standby expectation rewrite authorized by the owner
// 2026-09-23 (PR #72 owner call 2; `acceptance/pass-97.json` records that
// the standby fallback expectations are superseded by the selectable
// reality). The prime row is still last in `ARENA_IDS` and still decodes
// for network/replay/storage.
const promotedPrimeId = 'newworld-prime' as const;

describe('New World selection and retained multiplayer identity', () => {
  it('offers only the new arena while retaining every historical ID and alias', () => {
    expect(ARENA_IDS).toEqual(['world-studio', ...retainedIds, promotedPrimeId]);
    expect(SELECTABLE_ARENAS.map((row) => row.id)).toEqual(['world-studio', promotedPrimeId]);
    for (const id of retainedIds) {
      const row = arenaSelection(id);
      expect(row.id).toBe(id);
      expect(row.selectable).toBe(false);
      for (const alias of [id, row.routeId, ...row.legacyAliases]) {
        expect(decodeArenaId(alias)).toBe(id);
        expect(menuArenaSelection(alias).id).toBe('world-studio');
      }
    }
    const prime = arenaSelection(promotedPrimeId);
    expect(prime.id).toBe(promotedPrimeId);
    expect(prime.selectable).toBe(true);
    expect(prime.legacyAliases).toEqual([]);
    expect(decodeArenaId(promotedPrimeId)).toBe(promotedPrimeId);
    expect(menuArenaSelection(promotedPrimeId).id).toBe(promotedPrimeId);
    expect(menuArenaSelection('new-world-prime').id).toBe(promotedPrimeId);
  });

  it.each([null, undefined, '', 'missing-map', 'WORLD-STUDIO', ' world-studio '])(
    'uses the visible menu default for %s', (value) => {
      expect(menuArenaSelection(value).id).toBe(DEFAULT_ARENA_ID);
    },
  );

  it('keeps strict wire IDs separate from menu compatibility aliases', () => {
    for (const id of ARENA_IDS) {
      expect(isArenaId(id)).toBe(true);
      const config = { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: id,
        ...(id === 'gun-range' ? { autoBalance: false, durationMs: 120_000 } : {}),
      };
      expect(isPrivateMatchConfig(config), id).toBe(true);
      expect(config.arenaId).toBe(id);
    }
    for (const alias of ['WORLD-STUDIO', ' world-studio ', 'nuke-town', 'unknown']) {
      expect(isArenaId(alias)).toBe(false);
      expect(isPrivateMatchConfig({ ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: alias })).toBe(false);
    }
    expect(DEFAULT_PRIVATE_MATCH_CONFIG.arenaId).toBe('world-studio');
  });

  it('admits only the visible multiplayer maps in host controls', () => {
    expect(isMenuMultiplayerArenaId('world-studio')).toBe(true);
    expect(isMenuMultiplayerArenaId(promotedPrimeId)).toBe(true);
    for (const id of [...retainedIds, 'unknown', '', 'WORLD-STUDIO']) {
      expect(isMenuMultiplayerArenaId(id)).toBe(false);
    }
    expect(arenaSelection('world-studio')).toMatchObject({
      kind: 'team', multiplayer: true, fieldSupport: true,
      soloBotCount: 2, maximumSoloBots: 2,
    });
    expect(arenaSelection(promotedPrimeId)).toMatchObject({
      kind: 'team', multiplayer: true, fieldSupport: true,
      soloBotCount: 2, maximumSoloBots: 2,
    });
  });

  it('binds initial shell, dropdown and media standby to the new identity', () => {
    const html = renderPass64Shell(createPass64ShellViewModel('Operator'));
    expect([...html.matchAll(/data-arena-route="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['world-studio', 'new-world-prime']);
    const lobbyOptions = html.match(/<select id="lobby-arena">([\s\S]*?)<\/select>/)?.[1];
    expect(lobbyOptions).toContain('value="world-studio"');
    expect(lobbyOptions).toContain('value="newworld-prime"');
    expect((lobbyOptions?.match(/<option /g) ?? [])).toHaveLength(2);
    expect(html).toContain('aria-label="Nuke Town · New World multiplayer arena"');
    expect(html).toContain('data-arena="world-studio"');
    expect(html).toContain('PREVIEW STANDBY');
    const preview = menuPreviewVideoDefinition('world-studio');
    expect(preview.mediaAvailable).toBe(false);
    expect([preview.webm, preview.mp4, preview.poster]).toEqual(['', '', '']);
    expect(ARENA_SELECTIONS).toHaveLength(13);
  });

  it('routes both startup consumers through the menu boundary while keeping lobby activation exact', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(source.match(/menuArenaSelection\(new URLSearchParams\(window.location.search\).get\('map'\)\)/g))
      .toHaveLength(2);
    expect(source).toContain('isMenuMultiplayerArenaId(requestedArena)');
    expect(source).toContain('await activateArenaSelection(arenaId, admissionToken !== undefined, admissionToken)');
  });
});
