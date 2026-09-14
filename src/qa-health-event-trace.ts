import type { GameMessage, HealthAuthorityMessage } from './protocol';

// Isolated diagnostic revision only. No payloads, strings from users, or traffic
// interception. The fixed ring is absent unless the existing local QA fence opens.
export const QA_HEALTH_TRACE_CAPACITY = 256;
export type HealthTraceStage = 'publish' | 'send-queued' | 'send-call' | 'send-drop' | 'receive' | 'admit' | 'reject' | 'apply';
export type HealthTraceRow = Readonly<{
  ordinal: number; stage: HealthTraceStage; atMs: number; timeOriginMs: number;
  subjectId: string; authorId: string; revision: number; continuity: number;
  matchEpoch: number; hp: number; observedHp: number | null; reason: string | null;
}>;

export function healthTraceFence(search: string, hostname: string): boolean {
  const params = new URLSearchParams(search);
  return params.get('multiplayerQa') === '1' && params.get('qaTrace') === '1'
    && (hostname === '127.0.0.1' || hostname === 'localhost');
}

export function createHealthEventTrace(enabled: boolean, clock: () => { now: number; origin: number }) {
  const rows: HealthTraceRow[] | null = enabled ? [] : null;
  let recorded = 0;
  return {
    record(stage: HealthTraceStage, message: GameMessage, observedHp: number | null = null, reason: string | null = null): void {
      if (!rows || message.type !== 'health-authority') return;
      const fact: HealthAuthorityMessage = message;
      const stamp = clock();
      const row = Object.freeze({ ordinal: ++recorded, stage, atMs: stamp.now, timeOriginMs: stamp.origin,
        subjectId: fact.playerId, authorId: fact.by, revision: fact.revision,
        continuity: fact.continuity, matchEpoch: fact.matchEpoch, hp: fact.hp, observedHp, reason });
      if (rows.length === QA_HEALTH_TRACE_CAPACITY) rows.shift();
      rows.push(row);
    },
    sample() { return { enabled, recorded, dropped: Math.max(0, recorded - QA_HEALTH_TRACE_CAPACITY), rows: rows ? [...rows] : [] }; },
  };
}

const trace = createHealthEventTrace(typeof window !== 'undefined'
  && healthTraceFence(window.location.search, window.location.hostname),
() => ({ now: performance.now(), origin: performance.timeOrigin }));
export const recordHealthEventTrace = trace.record;
export const sampleHealthEventTrace = trace.sample;
