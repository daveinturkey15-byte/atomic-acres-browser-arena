import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_REVIEW_VIEWPORTS, UI_STATE_INVENTORY, UI_SURFACE_INVENTORY } from './surface-registry';

const mainSource = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
const generatedDialogSources = [
  readFileSync(new URL('./pass64-shell.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('./killstreak-loadout-menu.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('./project-map-dialog.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('./release-history-dialog.ts', import.meta.url), 'utf8'),
].join('\n');
const rendererSources = `${mainSource}\n${generatedDialogSources}`;
const tacticalCssSource = readFileSync(new URL('./tactical-ui.css', import.meta.url), 'utf8');

function cssHexToken(name: string): string {
  const match = tacticalCssSource.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Missing CSS colour token ${name}`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

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
      'respawning', 'match-ended', 'returned-lobby', 'modal-open', 'chat-typing',
      'error', 'reduced-motion', 'pointer-lock-requesting', 'pointer-lock-denied',
      'focus-suspended', 'paused-match', 'high-dpi',
    ]));
    expect(UI_REVIEW_VIEWPORTS.map(({ id }) => id)).toEqual(['laptop', 'desktop', 'ultrawide', 'narrow']);
  });

  it('registers the railgun thermal scope as a critical rendered and styled HUD surface', () => {
    expect(UI_SURFACE_INVENTORY.find(({ id }) => id === 'railgun-thermal')).toEqual({
      id: 'railgun-thermal',
      rootElementId: 'railgun-thermal',
      renderer: 'match-hud',
      critical: true,
    });
    expect(mainSource).toContain("element<HTMLElement>('#railgun-thermal')");
    expect(tacticalCssSource).toContain('#railgun-thermal');
  });

  it('registers the M14 smoke-only thermal scope as a critical rendered and styled HUD surface', () => {
    expect(UI_SURFACE_INVENTORY.find(({ id }) => id === 'dmr-thermal')).toEqual({
      id: 'dmr-thermal',
      rootElementId: 'dmr-thermal',
      renderer: 'match-hud',
      critical: true,
    });
    expect(mainSource).toContain("element<HTMLElement>('#dmr-thermal')");
    expect(tacticalCssSource).toContain('#dmr-thermal');
  });

  it('registers one renderer-provenanced active-match pause backdrop', () => {
    expect(UI_SURFACE_INVENTORY.find(({ id }) => id === 'match-pause-backdrop')).toEqual({
      id: 'match-pause-backdrop',
      rootElementId: 'match-pause-backdrop',
      renderer: 'main-shell',
      critical: true,
    });
    expect(generatedDialogSources).toContain('data-frame-provenance="renderer-canvas"');
    expect(generatedDialogSources).not.toContain('atomic-acres-menu-squad-joke.jpg');
    expect(tacticalCssSource).toContain("#menu-showcase[data-menu-context='paused-match'] .match-pause-backdrop");
  });

  it('keeps canonical text and status colours above AA contrast on the primary panel', () => {
    const panel = cssHexToken('--ui-panel');
    for (const token of ['--ui-text', '--ui-muted', '--ui-cyan', '--ui-amber', '--ui-coral', '--ui-good']) {
      expect(contrastRatio(cssHexToken(token), panel), `${token} on --ui-panel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('does not duplicate any static DOM id in the shell renderer', () => {
    const ids = [...rendererSources.matchAll(/id=["']([^"']+)["']/g)].map((match) => match[1]!);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });
});
