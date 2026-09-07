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
    // Pass 79 reskin: the instrument surface moved from the rejected cold
    // blue-black wash onto the warm instrument sheet, and the muted label
    // moved from cold grey #c4d8d7 to warm bone #e8ddcb. Same structural
    // pins, warmer values, PLUS the legibility intent enforced numerically:
    // the new pair must compute at least the old pair's 12.2:1 contrast.
    expect(css).toContain('linear-gradient(140deg, rgba(43, 36, 28, 0.98), rgba(20, 16, 12, 0.99))');
    expect(css).toContain('#menu-panel-options .audio-setting-row');
    expect(css).toContain('color: #e8ddcb');

    const channel = (hex: string, index: number): number => {
      const c = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = (hex: string): number =>
      0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Solid approximations of the composited grounds (verified by eye against
    // the rendered panels; both slightly BRIGHTER than the true composite, so
    // the bound is conservative).
    const oldGround = '#0a1a1f';
    const newGround = '#241d16';
    expect(contrast('#e8ddcb', newGround)).toBeGreaterThanOrEqual(contrast('#c4d8d7', oldGround));
    expect(contrast('#e8ddcb', newGround)).toBeGreaterThanOrEqual(12);
  });

  it('keeps Field Kit metrics and the killstreak demo rail responsive and motion-safe', () => {
    expect(css).toContain('.weapon-menu-presentation');
    expect(css).toContain('.weapon-menu-dps');
    expect(css).toContain('aspect-ratio: 4 / 3');
    expect(css).toMatch(/\.weapon-menu-still img \{[\s\S]*?object-fit: contain;[\s\S]*?\}/u);
    expect(css).toContain('font: 900 clamp(30px, 2.2vw, 42px)');
    expect(css).toContain('grid-template-columns: minmax(102px, 1fr) minmax(72px, auto)');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('.killstreak-loadout-layout');
    expect(css).toContain('.killstreak-demo-rail[data-motion=\'poster\']');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.killstreak-loadout-layout \{ grid-template-columns: 1fr; \}/u);
  });
});
