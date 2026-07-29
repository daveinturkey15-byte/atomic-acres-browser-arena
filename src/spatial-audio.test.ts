import { describe, expect, it } from 'vitest';
import {
  AUDIO_RUNTIME_BUDGET,
  ARENA_AUDIO_DEFINITIONS,
  AudioOcclusionBudget,
  FootstepEmitterRegistry,
  arenaFootstepSurface,
  selectVoiceToSteal,
  spatialFootstepGain,
  spatialPan,
  validateArenaAudioDefinitions,
} from './spatial-audio';

describe('spatial audio contracts', () => {
  it('emits only from admitted continuous grounded travel', () => {
    const emitters = new FootstepEmitterRegistry();
    const base = { actorId: 'remote:a', lifeId: 2, continuityId: 8, grounded: true, stale: false, movement: 'walk' as const, surface: 'metal' as const };
    expect(emitters.sample({ ...base, position: { x: 0, y: 0, z: 0 }, now: 0 })).toEqual([]);
    expect(emitters.sample({ ...base, position: { x: 1, y: 0, z: 0 }, now: 100 })).toEqual([]);
    expect(emitters.sample({ ...base, position: { x: 1.7, y: 0, z: 0 }, now: 200 })).toHaveLength(1);
    expect(emitters.sample({ ...base, position: { x: 3.3, y: 0, z: 0 }, now: 900, stale: true })).toEqual([]);
    expect(emitters.sample({ ...base, position: { x: 4.9, y: 0, z: 0 }, now: 950 })).toEqual([]);
  });

  it('resets airborne, teleport, life and continuity movement without false steps', () => {
    const emitters = new FootstepEmitterRegistry();
    const base = { actorId: 'bot:1', lifeId: 1, continuityId: 1, stale: false, movement: 'sprint' as const, surface: 'concrete' as const };
    emitters.sample({ ...base, grounded: true, position: { x: 0, y: 0, z: 0 }, now: 0 });
    expect(emitters.sample({ ...base, grounded: false, position: { x: 2, y: 2, z: 0 }, now: 100 })).toEqual([]);
    expect(emitters.sample({ ...base, grounded: true, position: { x: 9, y: 0, z: 0 }, now: 200 })).toEqual([]);
    expect(emitters.sample({ ...base, continuityId: 2, grounded: true, position: { x: 12, y: 0, z: 0 }, now: 300 })).toEqual([]);
    expect(emitters.sample({ ...base, lifeId: 2, grounded: true, position: { x: 15, y: 0, z: 0 }, now: 400 })).toEqual([]);
  });

  it('uses monotonic distance attenuation and camera-correct panning', () => {
    const gains = [0, 2, 8, 16, 31, 32].map(spatialFootstepGain);
    expect(gains.every((gain, index) => index === 0 || gain <= gains[index - 1]!)).toBe(true);
    expect(gains.at(-1)).toBe(0);
    expect(spatialPan({ x: 0, y: 0, z: 0 }, 0, { x: 4, y: 0, z: 0 })).toBe(1);
    expect(spatialPan({ x: 0, y: 0, z: 0 }, Math.PI, { x: 4, y: 0, z: 0 })).toBe(-1);
  });

  it('steals voices deterministically by priority, distance, age and id', () => {
    const active = [
      { id: 'b', priority: 2, distance: 8, startedAt: 20 },
      { id: 'a', priority: 2, distance: 8, startedAt: 20 },
      { id: 'critical', priority: 8, distance: 50, startedAt: 1 },
    ];
    expect(selectVoiceToSteal(active, { id: 'new', priority: 3, distance: 20, startedAt: 30 }, 3)?.id).toBe('a');
    expect(selectVoiceToSteal(active, { id: 'weak', priority: 1, distance: 1, startedAt: 30 }, 3)).toBeNull();
  });

  it('covers all arenas with distinct original beds inside continuous budgets', () => {
    expect(validateArenaAudioDefinitions()).toEqual([]);
    expect(new Set(Object.values(ARENA_AUDIO_DEFINITIONS).map((definition) => definition.identity)).size).toBe(4);
    expect(Object.values(ARENA_AUDIO_DEFINITIONS).every((definition) => definition.continuousVoices <= 2)).toBe(true);
    expect(AUDIO_RUNTIME_BUDGET.continuousVoices).toBeGreaterThanOrEqual(8);
  });

  it('keeps continuous air beds narrow, quiet and slowly modulated instead of broadband white hiss', () => {
    for (const definition of Object.values(ARENA_AUDIO_DEFINITIONS)) {
      expect(definition.airGain).toBeGreaterThan(0);
      expect(definition.airGain).toBeLessThanOrEqual(0.01);
      expect(definition.airQ).toBeGreaterThanOrEqual(1.4);
      expect(definition.airLowpassHz).toBeGreaterThan(definition.airFrequencyHz);
      expect(definition.airLowpassHz).toBeLessThanOrEqual(900);
      expect(definition.modulationHz).toBeGreaterThan(0);
      expect(definition.modulationDepth).toBeGreaterThan(0);
      expect(definition.modulationDepth).toBeLessThanOrEqual(0.2);
    }
  });

  it('maps footsteps to each arena dominant authored walkable material', () => {
    expect(arenaFootstepSurface('atomic-acres', 'asphalt')).toBe('asphalt');
    expect(arenaFootstepSurface('atomic-acres', 'wood')).toBe('wood');
    expect(arenaFootstepSurface('rustworks-1v1', 'soil')).toBe('metal');
    expect(arenaFootstepSurface('gun-range', 'wood')).toBe('concrete');
    expect(arenaFootstepSurface('skyline-terminal', 'soil')).toBe('concrete');
  });

  it('hard-caps occlusion work per frame and resets only at a new frame', () => {
    const budget = new AudioOcclusionBudget();
    expect(Array.from({ length: 6 }, () => budget.admit(10))).toEqual([true, true, true, true, false, false]);
    expect(budget.telemetry()).toMatchObject({ frameId: 10, checks: 4, maximumPerFrame: 4, denied: 2 });
    expect(budget.admit(11)).toBe(true);
  });
});
