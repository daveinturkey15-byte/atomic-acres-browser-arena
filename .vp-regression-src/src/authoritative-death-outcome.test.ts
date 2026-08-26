import { describe, expect, it, vi } from 'vitest';
import { MAP_CARPET_BOMBER_KILLER_ID } from './kill-provenance';
import { emptyPlayerScore } from './private-match';
import {
  MAP_CARPET_BOMBER_LABEL,
  commitAuthoritativeDeathOutcome,
  recordAuthoritativeDamageScores,
  resolveAuthoritativeDeathOutcome,
  type DeathOutcomeCombatant,
} from './authoritative-death-outcome';

function combatant(id: string, team: 0 | 1, name = id): DeathOutcomeCombatant {
  return { id, team, name, kind: 'player', scoreEligible: true };
}

describe('authoritative processDeath score/feed/diagnostic outcome', () => {
  it('records a map-owned Carpet Bomber victim death without a synthetic map or owner kill', () => {
    const scores = new Map([
      ['owner', { ...emptyPlayerScore('owner'), kills: 4, damageDealt: 120 }],
      ['victim', { ...emptyPlayerScore('victim'), deaths: 2, damageTaken: 80 }],
      [MAP_CARPET_BOMBER_KILLER_ID, { ...emptyPlayerScore(MAP_CARPET_BOMBER_KILLER_ID), damageDealt: 10 }],
    ]);
    const effects: string[] = [];
    const replaceScores = vi.fn((next: ReadonlyMap<string, unknown>) => {
      effects.push(`scores:${next.get('victim') ? 'victim' : 'missing'}`);
    });
    const broadcastScores = vi.fn(() => effects.push('broadcast'));
    const outcome = resolveAuthoritativeDeathOutcome({
      role: 'host',
      message: {
        killer: MAP_CARPET_BOMBER_KILLER_ID,
        victim: 'victim',
        cause: { kind: 'environment' },
      },
      scores,
      killer: null,
      victim: combatant('victim', 1, 'Victim'),
      hostile: false,
    });
    commitAuthoritativeDeathOutcome(outcome, {
      recordDiagnostic: (entry) => effects.push(`diagnostic:${entry.actor.kind}:${entry.weaponOrEffect}`),
      replaceScores,
      broadcastScores,
      presentFeed: (text) => effects.push(`feed:${text}`),
    });

    expect(outcome).toMatchObject({
      actor: { id: MAP_CARPET_BOMBER_KILLER_ID, name: MAP_CARPET_BOMBER_LABEL, kind: 'environment' },
      target: { id: 'victim', name: 'Victim', kind: 'player' },
      weaponOrEffect: 'carpet-bomber',
      feedText: 'Carpet Bomber eliminated Victim',
      scoreChanged: true,
      killerCredited: false,
      victimDeathRecorded: true,
    });
    expect(outcome.scores.get('victim')).toMatchObject({ deaths: 3, damageTaken: 80 });
    expect(outcome.scores.get('owner')).toMatchObject({ kills: 4, damageDealt: 120 });
    expect(outcome.scores.has(MAP_CARPET_BOMBER_KILLER_ID)).toBe(false);
    expect(scores.get('victim')).toMatchObject({ deaths: 2 });
    expect(replaceScores).toHaveBeenCalledTimes(1);
    expect(broadcastScores).toHaveBeenCalledTimes(1);
    expect(effects).toEqual([
      'diagnostic:environment:carpet-bomber',
      'scores:victim',
      'broadcast',
      'feed:Carpet Bomber eliminated Victim',
    ]);
  });

  it('keeps the canonical map feed on replicas without mutating replica scores', () => {
    const scores = new Map([['victim', emptyPlayerScore('victim')]]);
    const outcome = resolveAuthoritativeDeathOutcome({
      role: 'client',
      message: {
        killer: MAP_CARPET_BOMBER_KILLER_ID,
        victim: 'victim',
        cause: { kind: 'environment' },
      },
      scores,
      killer: null,
      victim: combatant('victim', 0, 'Guest'),
      hostile: false,
    });

    expect(outcome.feedText).toBe('Carpet Bomber eliminated Guest');
    expect(outcome.actor.kind).toBe('environment');
    expect(outcome.weaponOrEffect).toBe('carpet-bomber');
    expect(outcome.scoreChanged).toBe(false);
    expect(outcome.scores).toEqual(scores);
  });

  it('presents an offline map death once without score replacement or broadcast', () => {
    const scores = new Map([['victim', { ...emptyPlayerScore('victim'), deaths: 2 }]]);
    const effects: string[] = [];
    const replaceScores = vi.fn();
    const broadcastScores = vi.fn();
    const outcome = resolveAuthoritativeDeathOutcome({
      role: 'offline',
      message: {
        killer: MAP_CARPET_BOMBER_KILLER_ID,
        victim: 'victim',
        cause: { kind: 'environment' },
      },
      scores,
      killer: null,
      victim: combatant('victim', 1, 'Offline Bot'),
      hostile: false,
    });
    commitAuthoritativeDeathOutcome(outcome, {
      recordDiagnostic: (entry) => effects.push(`diagnostic:${entry.actor.kind}:${entry.weaponOrEffect}`),
      replaceScores,
      broadcastScores,
      presentFeed: (text) => effects.push(`feed:${text}`),
    });

    expect(outcome).toMatchObject({
      feedText: 'Carpet Bomber eliminated Offline Bot',
      scoreChanged: false,
      killerCredited: false,
      victimDeathRecorded: false,
    });
    expect(outcome.scores).toEqual(scores);
    expect(replaceScores).not.toHaveBeenCalled();
    expect(broadcastScores).not.toHaveBeenCalled();
    expect(effects).toEqual([
      'diagnostic:environment:carpet-bomber',
      'feed:Carpet Bomber eliminated Offline Bot',
    ]);
  });

  it('retains the ordinary hostile-player kill and victim-death path', () => {
    const outcome = resolveAuthoritativeDeathOutcome({
      role: 'host',
      message: { killer: 'killer', victim: 'victim', cause: { kind: 'gun', weapon: 'carbine' } },
      scores: new Map([
        ['killer', emptyPlayerScore('killer')],
        ['victim', emptyPlayerScore('victim')],
      ]),
      killer: combatant('killer', 0, 'Killer'),
      victim: combatant('victim', 1, 'Victim'),
      hostile: true,
    });

    expect(outcome.feedText).toBe('Killer eliminated Victim');
    expect(outcome.weaponOrEffect).toBe('carbine');
    expect(outcome.killerCredited).toBe(true);
    expect(outcome.victimDeathRecorded).toBe(true);
    expect(outcome.scores.get('killer')).toMatchObject({ kills: 1, deaths: 0 });
    expect(outcome.scores.get('victim')).toMatchObject({ kills: 0, deaths: 1 });
  });

  it('does not score a non-hostile player death or a forged map gun death', () => {
    const scores = new Map([
      ['killer', emptyPlayerScore('killer')],
      ['victim', emptyPlayerScore('victim')],
    ]);
    const friendly = resolveAuthoritativeDeathOutcome({
      role: 'host',
      message: { killer: 'killer', victim: 'victim', cause: { kind: 'gun', weapon: 'carbine' } },
      scores,
      killer: combatant('killer', 0),
      victim: combatant('victim', 0),
      hostile: false,
    });
    const forgedMap = resolveAuthoritativeDeathOutcome({
      role: 'host',
      message: {
        killer: MAP_CARPET_BOMBER_KILLER_ID,
        victim: 'victim',
        cause: { kind: 'gun', weapon: 'carbine' },
      },
      scores,
      killer: null,
      victim: combatant('victim', 1),
      hostile: false,
    });

    expect(friendly.scoreChanged).toBe(false);
    expect(friendly.scores).toEqual(scores);
    expect(forgedMap.scoreChanged).toBe(false);
    expect(forgedMap.scores).toEqual(scores);
  });

  it('retains map victim damage taken while removing synthetic map damage credit', () => {
    const scores = new Map([
      ['owner', { ...emptyPlayerScore('owner'), damageDealt: 40 }],
      ['victim', { ...emptyPlayerScore('victim'), damageTaken: 10 }],
      [MAP_CARPET_BOMBER_KILLER_ID, { ...emptyPlayerScore(MAP_CARPET_BOMBER_KILLER_ID), damageDealt: 20 }],
    ]);
    const next = recordAuthoritativeDamageScores(
      scores,
      MAP_CARPET_BOMBER_KILLER_ID,
      'victim',
      9.6,
    );

    expect(next.get('victim')).toMatchObject({ damageTaken: 20 });
    expect(next.get('owner')).toMatchObject({ damageDealt: 40 });
    expect(next.has(MAP_CARPET_BOMBER_KILLER_ID)).toBe(false);
  });

  it('retains ordinary attacker and victim damage accounting', () => {
    const next = recordAuthoritativeDamageScores(
      new Map([
        ['attacker', emptyPlayerScore('attacker')],
        ['victim', emptyPlayerScore('victim')],
      ]),
      'attacker',
      'victim',
      12.4,
    );
    expect(next.get('attacker')).toMatchObject({ damageDealt: 12 });
    expect(next.get('victim')).toMatchObject({ damageTaken: 12 });
  });
});
