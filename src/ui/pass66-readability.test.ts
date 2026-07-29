import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./pass66-readability.css', import.meta.url), 'utf8');

describe('Pass 66 dense-surface readability contract', () => {
  it('loads after the legacy and tactical style sheets', () => {
    const legacy = bootstrap.indexOf("import './style.css'");
    const tactical = bootstrap.indexOf("import './ui/tactical-ui.css'");
    const readability = bootstrap.indexOf("import './ui/pass66-readability.css'");
    expect(legacy).toBeGreaterThanOrEqual(0);
    expect(tactical).toBeGreaterThan(legacy);
    expect(readability).toBeGreaterThan(tactical);
  });

  it('raises only the named dense menu and review surfaces', () => {
    for (const selector of [
      '#project-map-panel',
      '#changelog-panel',
      '#private-lobby',
      '#last-match-reports',
      '.kit-card',
      '.killstreak-slot-card',
      '#roster-list',
      '#menu-panel-options .settings-section',
      '#advanced-graphics .advanced-graphics-control',
    ]) expect(css).toContain(selector);
    expect(css).not.toContain('#hud *');
    expect(css).not.toContain('#support-block *');
  });

  it('has a ten-pixel microcopy floor and larger interactive controls', () => {
    expect(css).toContain('--pass66-micro: clamp(10px');
    expect(css).toContain('--pass66-copy: clamp(12px');
    expect(css).not.toMatch(/font-size:\s*[0-9](?:\.[0-9]+)?px/);
    expect(css).toMatch(/min-height:\s*42px/);
  });

  it('replaces the inherited grey Options wash with an explicit high-contrast instrument surface', () => {
    expect(css).toContain('linear-gradient(140deg, rgba(8, 24, 29, 0.98), rgba(4, 12, 16, 0.99))');
    expect(css).toContain('#menu-panel-options .audio-setting-row');
    expect(css).toContain('color: #c4d8d7');
  });
});
