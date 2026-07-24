import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('Pass 59 HUD layout contract', () => {
  it('shows damage telemetry only when event rows exist', () => {
    expect(css).toContain('#damage-feeds');
    expect(css).not.toContain('.damage-feed.done>b');
    expect(css).not.toContain('.damage-feed.taken>b');
    expect(css).toMatch(/#damage-numbers strong\{[^}]*font-weight:600/);
  });

  it('forces field support into one vertical column at every profile breakpoint', () => {
    const finalPass62Rules = css.slice(css.lastIndexOf('/* Pass 62:'));
    expect(finalPass62Rules.match(/\.support-list\{grid-template-columns:1fr\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(finalPass62Rules).not.toContain('repeat(2');
    expect(finalPass62Rules).not.toContain('repeat(5');
    expect(finalPass62Rules).toContain('#support-block{top:500px;width:160px');
    expect(finalPass62Rules).toContain('zoom:1');
  });
});
