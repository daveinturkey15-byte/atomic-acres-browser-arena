import { describe, expect, it } from 'vitest';
import { isKillstreakEligible, killCauseFromHit } from './kill-provenance';

describe('kill provenance', () => {
  it('allows only gun kills to progress killstreak rewards', () => {
    expect(isKillstreakEligible({ kind: 'gun', weapon: 'lmg' })).toBe(true);
    expect(isKillstreakEligible({ kind: 'grenade' })).toBe(false);
    expect(isKillstreakEligible({ kind: 'melee' })).toBe(false);
    expect(isKillstreakEligible({ kind: 'environment' })).toBe(false);
    expect(isKillstreakEligible({ kind: 'killstreak', effect: 'nuke' })).toBe(false);
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
});
