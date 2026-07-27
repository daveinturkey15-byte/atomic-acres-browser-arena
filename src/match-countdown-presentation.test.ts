import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 65 match countdown presentation contract', () => {
  it('binds each 3-2-1 edge and ENGAGE transition to the bounded countdown cue', () => {
    const gameplay = readFileSync('src/legacy-main.ts', 'utf8');
    const audio = readFileSync('src/audio.ts', 'utf8');
    const audioProfile = readFileSync('src/match-countdown-audio.ts', 'utf8');

    expect(gameplay).toContain("if (headline !== lastMatchCountdownCue && /^(1|2|3)$/.test(headline))");
    expect(gameplay).toContain('function presentMatchCountdownCue(cue: MatchCountdownCue)');
    expect(gameplay).toContain("countdown.classList.remove('countdown-cue-active')");
    expect(gameplay).toContain('void countdown.offsetWidth');
    expect(gameplay).toContain("countdown.classList.add('countdown-cue-active')");
    expect(gameplay).toContain("presentMatchCountdownCue('engage')");
    expect(gameplay).toContain("countdown.setAttribute('aria-label'");
    expect(gameplay).toContain("countdown.removeAttribute('aria-label')");
    expect(gameplay).toContain('audio.matchCountdown(Number(cue) as 1 | 2 | 3)');
    expect(gameplay).toContain("audio.matchCountdown('engage')");
    expect(audio).toContain("matchCountdown(step: 1 | 2 | 3 | 'engage')");
    expect(audio).toContain('for (const voice of matchCountdownAudioCue(step))');
    expect(audio).toContain("voice.bus === 'announcements' ? this.announcements : this.ui");
    expect(audioProfile).toContain('maximumVoicesPerCue: 2');
    expect(audioProfile).toContain('maximumCueWindowSeconds: 0.36');
  });

  it('keeps a large animated number while reduced motion disables the beat', () => {
    const style = readFileSync('src/style.css', 'utf8');
    const accessibility = readFileSync('src/ui/tactical-ui.css', 'utf8');
    const pass65Hud = readFileSync('src/ui/pass65-hud.css', 'utf8');

    expect(style).toContain("font:900 clamp(84px,14vw,150px)/1 'Barlow Condensed'");
    expect(style).toContain('#countdown.countdown-cue-active{animation:countdownBeat .72s ease-out}');
    expect(style).toContain('@keyframes countdownBeat');
    expect(accessibility).toContain('#countdown.countdown-cue-active');
    expect(accessibility).toContain('animation: pass65CountdownBeatOdd 680ms');
    expect(accessibility).toContain('animation: pass65CountdownBeatEven 680ms');
    expect(pass65Hud).toContain('font: 900 clamp(112px, 13vw, 190px)');
    expect(pass65Hud).toContain('animation: pass65HudCountdownRing 680ms');
    expect(pass65Hud).toContain("content: 'DEPLOYMENT SYNC'");
    expect(pass65Hud).toContain("content: 'OBJECTIVE LIVE'");
    expect(accessibility).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation-duration:\s*0\.001ms\s*!important/i);
    expect(pass65Hud).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/i);
  });
});
