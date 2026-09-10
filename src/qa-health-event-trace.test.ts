import { describe, expect, it } from 'vitest';
import type { HealthAuthorityMessage } from './protocol';
import { createHealthEventTrace, healthTraceFence, QA_HEALTH_TRACE_CAPACITY } from './qa-health-event-trace';

const fact: HealthAuthorityMessage = { type: 'health-authority', by: 'host', playerId: 'guest', hp: 80, alive: true, continuity: 4, revision: 7, matchEpoch: 2, hostTimeMs: 9, nonce: 11 };
describe('isolated QA health boundary trace', () => {
  it('requires both QA flags and loopback', () => {
    expect(healthTraceFence('?multiplayerQa=1&qaTrace=1', '127.0.0.1')).toBe(true);
    expect(healthTraceFence('?multiplayerQa=1&qaTrace=1', 'localhost')).toBe(true);
    for (const [query, host] of [['?multiplayerQa=1', 'localhost'], ['?qaTrace=1', 'localhost'], ['?multiplayerQa=1&qaTrace=1', 'example.com']]) expect(healthTraceFence(query!, host!)).toBe(false);
  });
  it('does not sample clock or retain anything when disabled', () => {
    const trace = createHealthEventTrace(false, () => { throw Error('disabled clock'); });
    trace.record('publish', fact);
    expect(trace.sample()).toEqual({ enabled: false, recorded: 0, dropped: 0, rows: [] });
  });
  it('records exact identity and independent clock domain at boundary without mutating message', () => {
    const trace = createHealthEventTrace(true, () => ({ now: 20, origin: 1000 }));
    trace.record('apply', Object.freeze(fact), 80);
    expect(trace.sample().rows[0]).toEqual({ ordinal: 1, stage: 'apply', atMs: 20, timeOriginMs: 1000, subjectId: 'guest', authorId: 'host', revision: 7, continuity: 4, matchEpoch: 2, hp: 80, observedHp: 80, reason: null });
    expect(fact.hp).toBe(80);
  });
  it('bounds rows, counts dropped entries, and returns isolated snapshots', () => {
    const trace = createHealthEventTrace(true, () => ({ now: 20, origin: 1000 }));
    for (let i = 0; i < QA_HEALTH_TRACE_CAPACITY + 10; i++) trace.record('receive', fact);
    const snapshot = trace.sample();
    expect(snapshot.rows).toHaveLength(QA_HEALTH_TRACE_CAPACITY);
    expect(snapshot.dropped).toBe(10);
    expect(snapshot.rows[0]?.ordinal).toBe(11);
    snapshot.rows.pop();
    expect(trace.sample().rows).toHaveLength(QA_HEALTH_TRACE_CAPACITY);
  });
});
