import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./pass74-killstreak-selector.css', import.meta.url), 'utf8');

describe('Pass 74 killstreak selector readability slice', () => {
  it('loads after the accepted Pass 66 visual layer', () => {
    const overhaul = bootstrap.indexOf("import './ui/pass66-overhaul.css'");
    const pass74 = bootstrap.indexOf("import './ui/pass74-killstreak-selector.css'");
    expect(overhaul).toBeGreaterThanOrEqual(0);
    expect(pass74).toBeGreaterThan(overhaul);
  });

  it('pins the dark two-column desktop composition and narrow single-column fallback', () => {
    expect(css).toContain('#menu-panel-streaks');
    expect(css).toContain('.killstreak-loadout-layout');
    expect(css).toContain('.killstreak-slot-grid');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*grid-template-columns: 1fr;/u);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.killstreak-slot-grid[\s\S]*grid-template-columns: 1fr;/u);
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('background: #061217');
  });

  it('keeps selector text and controls above the readability floor', () => {
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('font-size: 13px');
    expect(css).toContain('font-size: 20px');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain(':focus-within');
  });

  it('contains no behavior-changing declarations', () => {
    expect(css).not.toMatch(/pointer-events\s*:/u);
    expect(css).not.toMatch(/display\s*:\s*none/u);
    expect(css).not.toMatch(/visibility\s*:/u);
    expect(css).not.toMatch(/user-select\s*:/u);
    expect(css).not.toMatch(/content\s*:/u);
  });
});
