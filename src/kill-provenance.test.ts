import { describe, expect, it } from 'vitest';
import {
  isKillstreakEligible,
  killAttributionId,
  killCauseFromHit,
  killCauseFromKillstreak,
  killstreakEliminationSource,
  MAP_CARPET_BOMBER_KILLER_ID,
} from './kill-provenance';

describe('kill provenance', () => {
  it('advances gun and lethal-ordnance kills toward killstreak rewards (HF-379)', () => {
    expect(isKillstreakEligible({ kind: 'gun', weapon: 'lmg' })).toBe(true);
    expect(isKillstreakEligible({ kind: 'grenade' })).toBe(true);
    expect(isKillstreakEligible({ kind: 'melee' })).toBe(false);
    expect(isKillstreakEligible({ kind: 'environment' })).toBe(false);
    expect(isKillstreakEligible({ kind: 'killstreak', effect: 'nuke' })).toBe(false);
  });

  it('records grenade eliminations as ordnance, never as weapon or recursive streak progress', () => {
    expect(killstreakEliminationSource({ kind: 'gun', weapon: 'carbine' })).toBe('weapon');
    expect(killstreakEliminationSource({ kind: 'grenade' })).toBe('ordnance');
    expect(killstreakEliminationSource({ kind: 'killstreak', effect: 'nuke' })).toBe('killstreak');
  });

  it('derives non-recursive provenance from admitted hits', () => {
    expect(killCauseFromHit({ kind: 'shot' }, 'carbine')).toEqual({ kind: 'gun', weapon: 'carbine' });
    expect(killCauseFromHit({ kind: 'melee' }, 'pistol')).toEqual({ kind: 'melee' });
    expect(killCauseFromHit({ kind: 'explosive', explosiveSource: 'grenade' }, 'smg')).toEqual({ kind: 'grenade' });
    expect(killCauseFromHit({ kind: 'explosive', explosiveSource: 'hunter-swarm' }, 'smg')).toEqual({
      kind: 'killstreak',
      effect: 'hunter-swarm',
    });
  });

  it('keeps map-owned Carpet Bomber kills out of player attribution', () => {
    const cause = killCauseFromKillstreak('carpet-bomber');
    expect(cause).toEqual({ kind: 'environment' });
    expect(isKillstreakEligible(cause)).toBe(false);
    expect(killAttributionId('player-1', cause)).toBe(MAP_CARPET_BOMBER_KILLER_ID);
    expect(killAttributionId('player-1', killCauseFromKillstreak('chopper'))).toBe('player-1');
  });
});
