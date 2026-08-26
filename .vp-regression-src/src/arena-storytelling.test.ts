import { describe, expect, it } from 'vitest';
import { arenaAnimationAt, arenaZoneLabel, classifyArenaZone } from './arena-storytelling';

describe('arena storytelling', () => {
  it('classifies the authored route and home regions deterministically', () => {
    expect(classifyArenaZone(0, -34)).toBe('aqua-home');
    expect(classifyArenaZone(0, 34)).toBe('coral-home');
    expect(classifyArenaZone(-24, 0)).toBe('west-garden');
    expect(classifyArenaZone(24, 0)).toBe('east-service');
    expect(arenaZoneLabel(classifyArenaZone(-24, 0))).toBe('VERDANT ARRAY');
    expect(arenaZoneLabel(classifyArenaZone(0, 0))).toBe('CIVIC TRANSIT');
    expect(arenaZoneLabel(classifyArenaZone(24, 0))).toBe('HELIO SERVICE');
  });

  it('keeps restrained animation outputs finite and bounded', () => {
    for (const now of [0, 1_000, 10_000, 90_000]) {
      const state = arenaAnimationAt(now);
      expect(Number.isFinite(state.landmarkYaw)).toBe(true);
      expect(state.beaconPulse).toBeGreaterThanOrEqual(0.1);
      expect(state.beaconPulse).toBeLessThanOrEqual(1);
      expect(state.signGlow).toBeGreaterThanOrEqual(0.44);
      expect(state.signGlow).toBeLessThanOrEqual(1);
    }
  });
});
