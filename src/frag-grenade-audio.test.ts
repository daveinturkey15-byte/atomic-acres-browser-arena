import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRENADE_FUSE_BEEP_START_MS, grenadeFuseBeepIntervalMs } from './audio';

describe('conventional fragmentation grenade audio contract', () => {
  it('accelerates clearly over the final fuse window', () => {
    const remaining = [1_450, 1_000, 650, 350, 100];
    const intervals = remaining.map(grenadeFuseBeepIntervalMs);
    expect(GRENADE_FUSE_BEEP_START_MS).toBe(1_450);
    expect(intervals).toEqual([366, 280, 214, 157, 109]);
    expect(intervals.every((interval, index) => index === 0 || interval < intervals[index - 1]!)).toBe(true);
  });

  it('uses the normal explosion mix and never fetches or plays the retired choir sting', () => {
    const audioSource = readFileSync('src/audio.ts', 'utf8');
    const gameplaySource = readFileSync('src/legacy-main.ts', 'utf8');
    expect(audioSource).not.toMatch(/sanctified|hallelujah|choir/i);
    // PASS 95: the frag detonation is positioned (explosionAt) but still the
    // normal explosion mix; the retired choir sting stays retired.
    expect(gameplaySource).toContain("audio.explosionAt(point, 'semtex', afterPresentationDetach)");
    expect(gameplaySource).not.toMatch(/sanctifiedFragExplosion|preloadSanctifiedFragChoir/);
  });
});
