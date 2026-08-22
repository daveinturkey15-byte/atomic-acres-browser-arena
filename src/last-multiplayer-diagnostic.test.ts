import { describe, expect, it } from 'vitest';
import {
  LAST_MULTIPLAYER_DAMAGE_EVENT_LIMIT,
  LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY,
  createLastMultiplayerDiagnostic,
  loadLastMultiplayerDiagnostic,
  saveLastMultiplayerDiagnostic,
} from './last-multiplayer-diagnostic';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe('last completed multiplayer diagnostic', () => {
  it('retains one bounded numeric/enumerated summary and strips every free-text identifier', () => {
    const secret = 'ROOM-PEER-TOKEN-chat task title credential';
    const damageTimeline = Array.from({ length: 100 }, (_, index) => ({
      elapsedMs: index * 10_000,
      timestamp: `timestamp-${secret}`,
      from: index % 2 === 0 ? 'Local Operator' : secret,
      fromKind: index % 2 === 0 ? 'player' : secret,
      to: index % 2 === 0 ? secret : 'Local Operator',
      toKind: 'player',
      damage: 9_999,
      healthBefore: 9_999,
      healthAfter: -50,
      source: index === 99 ? 'railgun' : secret,
      wallbang: true,
    }));
    const summary = createLastMultiplayerDiagnostic({
      completedAtEpochMs: 123_456_789,
      arena: 'atomic-acres', mode: 'tdm', role: 'host', protocolVersion: 6,
      durationMs: 9_999_999, participantCount: 99, localPlayerName: 'Local Operator',
      local: { kills: 2, deaths: 3, shotsFired: 5, hitShots: 99, damageDealt: 400, damageTaken: 250, headshots: 1 },
      network: { rttMs: 999_999, clockOffsetMs: -999_999, interpolationDelayMs: 99_999, receiverSequenceGaps: 2, receiverReordered: 1, droppedDamageEvents: 50 },
      damageTimeline,
    });

    expect(summary.recentDamage).toHaveLength(LAST_MULTIPLAYER_DAMAGE_EVENT_LIMIT);
    expect(summary.durationMs).toBe(3_600_000);
    expect(summary.participantCount).toBe(10);
    expect(summary.local.hitShots).toBe(5);
    expect(summary.recentDamage.at(-1)?.source).toBe('railgun');
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(JSON.stringify(summary)).not.toContain('Local Operator');
  });

  it('round-trips through the single fixed storage key and rejects malformed schema', () => {
    const target = storage();
    const summary = createLastMultiplayerDiagnostic({
      completedAtEpochMs: 120_001,
      arena: 'skyline-terminal', mode: 'ffa', role: 'guest', protocolVersion: 6,
      durationMs: 100_000, participantCount: 4, localPlayerName: 'Local',
      local: { kills: 1, deaths: 1, shotsFired: 8, hitShots: 4, damageDealt: 200, damageTaken: 150, headshots: 0 },
      network: { rttMs: 42, clockOffsetMs: -3, interpolationDelayMs: 85, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
      damageTimeline: [],
    });
    expect(saveLastMultiplayerDiagnostic(summary, target)).toBe(true);
    expect([...target.values.keys()]).toEqual([LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY]);
    expect(loadLastMultiplayerDiagnostic(target)).toEqual(summary);

    target.setItem(LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY, JSON.stringify({ ...summary, schemaVersion: 999 }));
    expect(loadLastMultiplayerDiagnostic(target)).toBeNull();
  });

  it('retains every canonical arena ID, including High Seas, and rejects compatibility aliases', () => {
    const base = {
      completedAtEpochMs: 120_001,
      mode: 'ffa', role: 'guest', protocolVersion: 6,
      durationMs: 100_000, participantCount: 4, localPlayerName: 'Local',
      local: { kills: 1, deaths: 1, shotsFired: 8, hitShots: 4, damageDealt: 200, damageTaken: 150, headshots: 0 },
      network: { rttMs: 42, clockOffsetMs: -3, interpolationDelayMs: 85, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
      damageTimeline: [],
    };
    expect(createLastMultiplayerDiagnostic({ ...base, arena: 'farcrysis' }).arena).toBe('farcrysis');
    expect(createLastMultiplayerDiagnostic({ ...base, arena: 'high-seas' }).arena).toBe('high-seas');
    expect(createLastMultiplayerDiagnostic({ ...base, arena: 'nuke-town' }).arena).toBe('atomic-acres');
  });
});
