import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_REVIEW_VIEWPORTS, UI_STATE_INVENTORY, UI_SURFACE_INVENTORY } from './surface-registry';

const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const generatedDialogSources = [
  readFileSync(new URL('./project-map-dialog.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('./release-history-dialog.ts', import.meta.url), 'utf8'),
].join('\n');
const rendererSources = `${mainSource}\n${generatedDialogSources}`;

describe('Pass 64 typed UI surface contract', () => {
  it('assigns every typed surface to one renderer and one unique DOM root', () => {
    const surfaceIds = UI_SURFACE_INVENTORY.map((surface) => surface.id);
    const rootIds = UI_SURFACE_INVENTORY.map((surface) => surface.rootElementId);
    expect(new Set(surfaceIds).size).toBe(surfaceIds.length);
    expect(new Set(rootIds).size).toBe(rootIds.length);
    for (const surface of UI_SURFACE_INVENTORY) {
      expect(['main-shell', 'match-hud']).toContain(surface.renderer);
      expect(rendererSources.match(new RegExp(`id=["']${surface.rootElementId}["']`, 'g')) ?? []).toHaveLength(1);
    }
  });

  it('keeps the complete multiplayer/lifecycle and deterministic viewport review matrix', () => {
    expect(UI_STATE_INVENTORY).toEqual(expect.arrayContaining([
      'host', 'guest', 'reconnecting', 'syncing', 'ready', 'live', 'dead',
      'match-ended', 'returned-lobby', 'modal-open', 'chat-typing', 'reduced-motion',
    ]));
    expect(UI_REVIEW_VIEWPORTS.map(({ id }) => id)).toEqual(['laptop', 'desktop', 'ultrawide', 'narrow']);
  });

  it('does not duplicate any static DOM id in the shell renderer', () => {
    const ids = [...rendererSources.matchAll(/id=["']([^"']+)["']/g)].map((match) => match[1]!);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });
});
