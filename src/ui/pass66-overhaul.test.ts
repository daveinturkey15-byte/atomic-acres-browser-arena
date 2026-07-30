import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPass64ShellViewModel, renderPass64Shell } from './pass64-shell';
import { killstreakLoadoutPanelMarkup } from './killstreak-loadout-menu';
import { menuPreviewVideoMarkup } from './menu-preview-video';

const bootstrap = readFileSync(new URL('../bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./pass66-overhaul.css', import.meta.url), 'utf8');

describe('Pass 66 tactical UI overhaul', () => {
  it('loads as the final visual layer without replacing typed UI ownership', () => {
    const readability = bootstrap.indexOf("import './ui/pass66-readability.css'");
    const overhaul = bootstrap.indexOf("import './ui/pass66-overhaul.css'");
    expect(overhaul).toBeGreaterThan(readability);
    expect(css.trimStart()).toMatch(/^\/\*[\s\S]*?@layer pass66\.overhaul \{/);
    expect(css).toContain('.command-body');
    expect(css).toContain('#hud');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps all controls while adding loadout inspection and readable stat surfaces', () => {
    const markup = renderPass64Shell(createPass64ShellViewModel('Operator'));
    for (const id of [
      'solo', 'host', 'join', 'private-lobby', 'loadout-manager', 'loadout-primary',
      'loadout-secondary', 'loadout-grenade', 'loadout-save', 'loadout-inspector',
      'graphics-profile', 'advanced-graphics', 'audio-settings', 'support-block',
    ]) expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('class="kit-stat-strip"');
    expect(markup).toContain('data-loadout-stat="damage"');
    expect(markup).toContain('data-loadout-grenade-detail');
  });

  it('adds a sticky killstreak demo rail and minimal video cockpit symbology', () => {
    const streaks = killstreakLoadoutPanelMarkup();
    expect(streaks).toContain('id="killstreak-demo-rail"');
    expect(streaks).toContain('data-demo-poster');
    expect(streaks).not.toContain('data-killstreak-preview=');
    const preview = menuPreviewVideoMarkup();
    expect(preview).toContain('class="preview-cockpit-hud"');
    expect(preview).toContain('class="cockpit-instruments"');
    expect(preview).not.toContain('canvas');
    expect(css).toContain("#menu-preview-frame[data-frame='cat'] .preview-cockpit-hud");
  });

  it('covers desktop, narrow, and reduced-motion layouts mechanically', () => {
    expect(css).toContain('@media (max-width: 1180px)');
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('.pass64-command-deck.panel { inset: 0; border-radius: 0; }');
    expect(css).toContain('#support-block { bottom: 142px; }');
  });
});
