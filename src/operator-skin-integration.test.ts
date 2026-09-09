/**
 * HF-360 — operator skins are integrated, not merely staged.
 *
 * The authored archetypes (62 joints / 24 clips on the canonical pass65 rig,
 * verified from the GLB binaries in the skins lane) become selectable only if
 * every link holds: catalog → model URLs → real files on disk → protocol
 * membership → lobby replication → third-person presentation plumbing.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATOR_SKIN_CATALOG, isSelectableOperatorSkinId } from './operator-skin-catalog';
import { OPERATOR_SKIN_MODEL_URLS } from './operator-model';
import { isGameMessage } from './protocol';
import { DEFAULT_PRIVATE_MATCH_CONFIG, isLobbyMember } from './private-match';

const selectableIds = OPERATOR_SKIN_CATALOG.definitions
  .filter((definition) => definition.availability === 'selectable')
  .map((definition) => definition.id);

describe('HF-360 skin model delivery', () => {
  it('maps every selectable non-default skin to both runtime LOD urls', () => {
    for (const id of selectableIds) {
      if (id === 'default') continue;
      const urls = OPERATOR_SKIN_MODEL_URLS[id];
      expect(urls, `catalog skin '${id}' has no model urls`).toBeDefined();
      expect(urls.quality).toContain(`pass74-operator-skin-${id}-lod0.glb`);
      expect(urls.performance).toContain(`pass74-operator-skin-${id}-lod1.glb`);
    }
    // No orphan urls for ids the catalog does not sell.
    for (const id of Object.keys(OPERATOR_SKIN_MODEL_URLS)) {
      expect(selectableIds).toContain(id);
    }
  });

  it('ships the actual GLB files the urls point at', () => {
    for (const [id, urls] of Object.entries(OPERATOR_SKIN_MODEL_URLS)) {
      for (const url of [urls.quality, urls.performance]) {
        const publicPath = fileURLToPath(new URL(`../public/${url.replace('./', '')}`, import.meta.url));
        expect(existsSync(publicPath), `${id}: missing ${publicPath}`).toBe(true);
      }
    }
  });
});

describe('HF-360 protocol membership', () => {
  it('admits only catalog-selectable skin ids on the wire', () => {
    const base = { type: 'lobby-skin' as const, by: 'guest-1', nonce: 7 };
    expect(isGameMessage({ ...base, skinId: 'explorer' })).toBe(true);
    expect(isGameMessage({ ...base, skinId: 'default' })).toBe(true);
    expect(isGameMessage({ ...base, skinId: 'not-a-skin' })).toBe(false);
    expect(isGameMessage({ ...base, skinId: 42 })).toBe(false);
    expect(isGameMessage({ ...base, skinId: '' })).toBe(false);
  });

  it('validates the optional member skin in lobby snapshots', () => {
    const member = {
      id: 'guest-1', name: 'Guest', team: 1 as const, ready: true, connected: true, pingMs: 20, dhv: 10 as const,
    };
    expect(isLobbyMember({ ...member, skinId: 'symbiote' })).toBe(true);
    expect(isLobbyMember(member)).toBe(true); // absent means default
    expect(isLobbyMember({ ...member, skinId: 'stolen-franchise-skin' })).toBe(false);
    expect(DEFAULT_PRIVATE_MATCH_CONFIG).toBeDefined();
  });

  it('rejects retired ids even if a stale client still offers them', () => {
    expect(isSelectableOperatorSkinId('default')).toBe(true);
    expect(isSelectableOperatorSkinId('navalops')).toBe(true);
    expect(isSelectableOperatorSkinId('retired-skin-that-never-existed')).toBe(false);
    expect(isSelectableOperatorSkinId(undefined)).toBe(false);
  });
});

describe('HF-360 runtime wiring', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('routes lobby-skin through host validation and replication', () => {
    expect(main).toContain("if (message.type === 'lobby-skin') {");
    expect(main).toContain('function updateHostSkin(');
    // Host validation + snapshot rebroadcast, mirroring updateHostSquad.
    expect(main).toMatch(/function updateHostSkin[\s\S]{0,600}isSelectableOperatorSkinId\(message\.skinId\)[\s\S]{0,300}broadcastHostLobby\(phase\)/);
  });

  it('builds remote third-person operators from the replicated member skin', () => {
    expect(main).toContain("memberOperatorSkinId(snapshot.id), // HF-360");
  });

  it('prefetches every member skin on snapshot receipt', () => {
    expect(main).toMatch(/for \(const member of message\.snapshot\.members\) \{\s*\n\s*if \(member\.skinId !== undefined && isSelectableOperatorSkinId\(member\.skinId\)\) \{\s*\n\s*void loadOperatorSkinAsset\(member\.skinId\);/);
  });

  it('carries the joiner skin preference in lobby-join', () => {
    expect(main).toContain('skinId: localOperatorSkinId, // HF-360');
  });
});
