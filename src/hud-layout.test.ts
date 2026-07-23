import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('Pass 59 HUD layout contract', () => {
  it('keeps damage-done and damage-taken telemetry visually distinct', () => {
    expect(css).toContain('#damage-feeds');
    expect(css).toContain('.damage-feed.done>b{color:#72f2e9}');
    expect(css).toContain('.damage-feed.taken>b{color:#ff806e}');
    expect(css).toMatch(/#damage-numbers strong\{[^}]*font-weight:600/);
  });

  it('forces field support into one vertical column at every profile breakpoint', () => {
    const finalPass59Rules = css.slice(css.lastIndexOf('/* Pass 59:'));
    expect(finalPass59Rules.match(/\.support-list\{grid-template-columns:1fr\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(finalPass59Rules).not.toContain('repeat(2');
    expect(finalPass59Rules).not.toContain('repeat(5');
  });
});