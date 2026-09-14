import { describe, expect, it } from 'vitest';
import {
  MATCH_DIAGNOSTIC_ARENAS,
  MATCH_DIAGNOSTIC_MAX_EVENTS,
  validateMatchDiagnosticEnvelope,
} from './match-diagnostics-schema';
import { ARENA_IDS } from '../src/arena-identity';

const base = {
  schemaVersion: 1,
  idempotencyKey: 'diagnostic:p-0123456789abcdef:offline',
  matchId: 'p-0123456789abcdef',
  completedAtEpochMinute: 1_800_000,
  buildId: 'pass64-schema-test',
  pass: 'PASS 64',
  backend: 'webgpu',
  arena: 'atomic-acres',
  mode: 'solo',
  role: 'offline',
  durationMs: 60_000,
  events: [{ sequence: 0, atMs: 5, category: 'regen', admission: 'accepted', actor: 'p-1111111111111111', actorKind: 'player', source: 'unknown', healthBefore: 80, healthAfter: 81 }],
  droppedEvents: 0,
  net: { rttBucketMs: null, jitterBucketMs: 0, clockOffsetBucketMs: 0, interpolationDelayBucketMs: 0, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
  perf: { sampleCount: 3_600, frameP50BucketMs: 16, frameP95BucketMs: 20, frameP99BucketMs: 33, maximumFrameBucketMs: 50 },
  final: {
    participantCount: 1,
    participants: [{ participant: 'p-1111111111111111', kind: 'player', team: 0, kills: 1, deaths: 0, damageDealt: 100, damageTaken: 0, finalHealth: 100 }],
    local: { kills: 1, deaths: 0, shotsFired: 3, hitShots: 2, damageDealt: 100, damageTaken: 0, headshots: 1 },
    fatalRuntimeErrorCategories: [],
  },
};

describe('shared automatic match diagnostic schema', () => {
  it('accepts only the exact bounded schema', () => {
    expect(MATCH_DIAGNOSTIC_ARENAS).toEqual(ARENA_IDS);
    expect(validateMatchDiagnosticEnvelope(base)).toEqual({ envelope: base, error: null });
    expect(validateMatchDiagnosticEnvelope({ ...base, arena: 'farcrysis' }).error).toBeNull();
    expect(validateMatchDiagnosticEnvelope({ ...base, arena: 'high-seas' }).error).toBeNull();
    // owner 2026-08-30: Test1/Test2 arenas added.
    expect(validateMatchDiagnosticEnvelope({ ...base, arena: 'test1' }).error).toBeNull();
    expect(validateMatchDiagnosticEnvelope({ ...base, arena: 'test2' }).error).toBeNull();
    // MAP3 (HF-405).
    expect(validateMatchDiagnosticEnvelope({ ...base, arena: 'map3' }).error).toBeNull();
    expect(validateMatchDiagnosticEnvelope({ ...base, rawPeerId: 'peer-real' }).error).toBe('invalid envelope shape');
    expect(validateMatchDiagnosticEnvelope({ ...base, pass: 'version sixty-four' }).error).toBe('invalid build identity');
    expect(validateMatchDiagnosticEnvelope({ ...base, completedAtEpochMinute: 1_800_001 }).error).toBe('invalid completion time');
  });

  it('rejects unordered evidence, extra free-text fields and unbounded arrays', () => {
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      events: [{ ...base.events[0], sequence: 1 }],
    }).error).toBe('invalid event');
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      events: [{ ...base.events[0], reason: 'arbitrary free text' }],
    }).error).toBe('invalid event');
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      events: Array.from({ length: MATCH_DIAGNOSTIC_MAX_EVENTS + 1 }, (_, sequence) => ({
        ...base.events[0], sequence, atMs: sequence,
      })),
    }).error).toBe('invalid events');
  });

  it('rejects raw identifiers and impossible final/performance relationships', () => {
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      events: [{ ...base.events[0], actor: 'raw-peer-id' }],
    }).error).toBe('invalid event');
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      perf: { ...base.perf, frameP50BucketMs: 100, frameP95BucketMs: 20 },
    }).error).toBe('invalid performance values');
    expect(validateMatchDiagnosticEnvelope({
      ...base,
      final: { ...base.final, local: { ...base.final.local, hitShots: 4 } },
    }).error).toBe('invalid local values');
  });
});
