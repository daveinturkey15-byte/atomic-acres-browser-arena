import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ArenaAudio, crossbowFuseBeepIntervalMs } from './audio';
import { EXPLOSIVE_BOLT_ARM_DELAY_MS } from './combat/ordnance';

describe('Pass 65 crossbow and minigun audio presentation', () => {
  it('accelerates crossbow beeps against the fixed post-impact detonation tick', () => {
    const intervals = [1_250, 800, 400, 100].map(crossbowFuseBeepIntervalMs);
    expect(EXPLOSIVE_BOLT_ARM_DELAY_MS).toBe(1_250);
    expect(intervals).toEqual([320, 230, 150, 90]);
    expect(intervals.every((interval, index) => index === 0 || interval < intervals[index - 1]!)).toBe(true);
  });

  it('gates positional beeps to attached flight state and strictly before detonation', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    expect(source).toContain('bolt.impactedAt !== null && bolt.nextFuseBeepAt !== null');
    expect(source).toContain('now < bolt.detonatesAt');
    expect(source).toContain('audio.crossbowFuseBeep(bolt.mesh.position, remainingMs, now)');
    expect(source.indexOf('audio.crossbowFuseBeep')).toBeGreaterThan(source.indexOf('if (bolt.impactedAt !== null'));
  });

  it('starts with no leaked continuous drive or fuse voices', () => {
    expect(new ArenaAudio().telemetry()).toMatchObject({
      crossbowFuse: { beeps: 0, startMs: EXPLOSIVE_BOLT_ARM_DELAY_MS },
      minigunDrive: { active: false, starts: 0, stops: 0, fraction: 0, phase: 'idle' },
    });
  });
});
