import { describe, expect, it } from 'vitest';
import { botScaledDamage, grenadeDamage } from './gameplay';
import { applyAuthoritativeRemoteDamage, createRemoteHealthAuthorityState } from './remote-health-authority';
import { resolveRemotePoweredDamage } from './remote-hit-admission';
import { isKillstreakEligible, type KillCause } from './kill-provenance';

type MatrixCase = Readonly<{
  route: string;
  requested: number;
  modifier: number;
  expected: number;
  cause: KillCause;
}>;

const matrix: MatrixCase[] = [
  { route: 'host-to-guest gun', requested: 31, modifier: 1, expected: 31, cause: { kind: 'gun', weapon: 'carbine' } },
  { route: 'guest-to-host gun', requested: 31, modifier: 1, expected: 31, cause: { kind: 'gun', weapon: 'carbine' } },
  { route: 'host-to-bot gun', requested: 23, modifier: 1, expected: 23, cause: { kind: 'gun', weapon: 'smg' } },
  { route: 'guest-to-bot gun', requested: 23, modifier: 1, expected: 23, cause: { kind: 'gun', weapon: 'smg' } },
  { route: 'bot-to-host canonical skirmish damage', requested: botScaledDamage(24), modifier: 1, expected: 6, cause: { kind: 'gun', weapon: 'lmg' } },
  { route: 'bot-to-guest canonical skirmish damage', requested: botScaledDamage(24), modifier: 1, expected: 6, cause: { kind: 'gun', weapon: 'lmg' } },
  { route: 'representative scattergun', requested: 42, modifier: 1, expected: 42, cause: { kind: 'gun', weapon: 'scattergun' } },
  { route: 'representative sniper', requested: 91, modifier: 1, expected: 91, cause: { kind: 'gun', weapon: 'sniper' } },
  { route: 'quad host-to-guest gun', requested: 31, modifier: 4, expected: 100, cause: { kind: 'gun', weapon: 'carbine' } },
  { route: 'quad guest-to-host gun', requested: 31, modifier: 4, expected: 100, cause: { kind: 'gun', weapon: 'carbine' } },
  { route: 'grenade', requested: 48, modifier: 1, expected: 48, cause: { kind: 'grenade' } },
  { route: 'splash self-damage', requested: grenadeDamage(0) * 0.35, modifier: 1, expected: 80.5, cause: { kind: 'grenade' } },
  { route: 'killstreak', requested: 80, modifier: 1, expected: 80, cause: { kind: 'killstreak', effect: 'tri-pass' } },
];

describe('host-authoritative multiplayer damage matrix', () => {
  it.each(matrix)('$route applies exactly one bounded canonical delta', ({ requested, modifier, expected }) => {
    const resolved = resolveRemotePoweredDamage(requested, modifier);
    const result = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(), resolved, 100);
    expect(resolved).toBe(expected);
    expect(result.state.hp).toBe(100 - expected);
    expect(result.died).toBe(expected === 100);
  });

  it('reuses the documented solo-skirmish bot damage rule without a host/guest branch', () => {
    const canonicalBotDamage = botScaledDamage(24);
    expect(canonicalBotDamage).toBe(6);
    expect(matrix.find((entry) => entry.route.startsWith('bot-to-host'))?.requested).toBe(canonicalBotDamage);
    expect(matrix.find((entry) => entry.route.startsWith('bot-to-guest'))?.requested).toBe(canonicalBotDamage);
    expect(grenadeDamage(20)).toBe(0);
  });

  it.each(matrix)('$route only advances streaks for eligible gun provenance', ({ cause }) => {
    expect(isKillstreakEligible(cause)).toBe(cause.kind === 'gun');
  });
});