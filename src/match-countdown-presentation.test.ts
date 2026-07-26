import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 65 match countdown presentation contract', () => {
  it('binds each 3-2-1 edge and ENGAGE transition to the bounded countdown cue', () => {
    const gameplay = readFileSync('src/legacy-main.ts', 'utf8');
    const audio = readFileSync('src/audio.ts', 'utf8');

    expect(gameplay).toContain("if (headline !== lastMatchCountdownCue && /^(1|2|3)$/.test(headline))");
    expect(gameplay).toContain('audio.matchCountdown(Number(headline) as 1 | 2 | 3)');
    expect(gameplay).toContain("audio.matchCountdown('engage')");
    expect(audio).toContain("matchCountdown(step: 1 | 2 | 3 | 'engage')");
    expect(audio).toContain('this.announcements');
    expect(audio).toContain('this.ui');
  });

  it('keeps a large animated number while reduced motion disables the beat', () => {
    const style = readFileSync('src/style.css', 'utf8');
    const accessibility = readFileSync('src/ui/tactical-ui.css', 'utf8');

    expect(style).toContain("font:900 clamp(84px,14vw,150px)/1 'Barlow Condensed'");
    expect(style).toContain('animation:countdownBeat .72s ease-out');
    expect(style).toContain('@keyframes countdownBeat');
    expect(accessibility).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation-duration:\s*0\.001ms\s*!important/i);
  });
});
