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
    // Every card and the manager use one canonical CATALOG BALLISTICS deck.
    // DPS is a standalone value; only the five owner-requested metrics have bars.
    expect(markup).not.toContain('class="kit-stat-strip kit-stat-strip-real"');
    expect(markup).not.toContain('class="kit-dps"');
    expect(markup.match(/data-weapon-dps(?:\s|>)/gu)).toHaveLength(8);
    expect(markup.match(/data-weapon-metric=/gu)).toHaveLength(40);
    expect(markup).toContain('data-weapon-metric="piercing"');
    expect(markup).not.toContain('data-loadout-stat=');
    expect(markup).toContain('data-loadout-grenade-detail');
    // The shell no longer emits the retired kit-stat-strip. The final cascade
    // must therefore leave the canonical asset + metric deck visible.
    expect(css).not.toContain('.kit-card .weapon-menu-stat-deck { display: none; }');
    expect(css).not.toContain('.kit-card .weapon-menu-presentation { display: block; }');
    expect(css).toContain('.custom-kit-grid .kit-card:not(.manage-kit-card)');
    expect(css).toContain('.custom-kit-grid { grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 14px; }');
    expect(css).toContain('background: linear-gradient(150deg, #16302f, #0d1e20)');
    expect(css).toContain('.kit-card.selected em { display: inline-flex; align-items: center; }');
    expect(css).toContain('.loadout-save-status[data-kind=\'error\']');
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
    expect(css).toContain('@media (orientation: portrait)');
    expect(css).toContain('@media (orientation: landscape) and (max-height: 500px)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('body.mtc-live #support-block,');
    expect(css).not.toContain('ROTATE DEVICE · LANDSCAPE RECOMMENDED');
  });
});
