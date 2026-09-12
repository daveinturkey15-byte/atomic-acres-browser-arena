import { describe, expect, it, vi } from 'vitest';
import { captureReloadProtocolTrace, type ReloadProtocolTraceInput } from './reload-protocol-trace';
import { createLocalReloadRetryRuntime } from './mp-reload-retry';
import { createPendingReload } from './local-reload-authority';
import { MULTIPLAYER_PROTOCOL_VERSION, type ReloadIntentMessage } from './protocol';

describe('reload diagnostic identity', () => {
  it('preserves frozen message identity and identifies the match epoch as event-at-record', () => {
    const input: ReloadProtocolTraceInput = {
      direction: 'cache-hit', actorId: 'guest', requestId: 'reload-1', action: 'start',
      status: 'committed', reason: 'committed', actionSequence: 0,
      lifeId: 3, connectionEpoch: 'old-connection',
    };
    const first = captureReloadProtocolTrace(input, 'host', 100.3, 41);
    const later = captureReloadProtocolTrace(input, 'host', 200.6, 42);
    expect(first).toMatchObject({ lifeId: 3, connectionEpoch: 'old-connection', matchEpoch: 41,
      matchEpochSemantics: 'event-at-record', atMs: 100 });
    expect(later).toMatchObject({ lifeId: 3, connectionEpoch: 'old-connection', matchEpoch: 42, atMs: 201 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input).not.toHaveProperty('matchEpoch');
  });

  it('records the actual retry wire identity separately from the original pending identity', () => {
    vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
    try {
      const pending = createPendingReload({ connectionEpoch: 'pending-connection', lifeId: 3,
        requestId: 'reload-1', weapon: 'm4a1', actionSequence: 0, nowMs: 0, expectedCompletionMs: 2000 });
      const rows: ReloadProtocolTraceInput[] = [];
      const messages: ReloadIntentMessage[] = [];
      const runtime = createLocalReloadRetryRuntime({ getRole: () => 'client', getPlayerId: () => 'guest',
        getConnectionEpoch: () => 'current-connection', getLifeId: () => 4,
        getProtocolVersion: () => MULTIPLAYER_PROTOCOL_VERSION, randomNonce: () => 123,
        getPending: () => pending, send: message => messages.push(message), record: row => rows.push(row),
      });
      runtime.send(pending, 'start');
      expect(messages).toHaveLength(1);
      expect(rows).toHaveLength(1);
      // Diagnostic-only: this deliberately preserves the existing wire behavior
      // even when the current context differs from the original pending record.
      expect(messages[0]).toMatchObject({ lifeId: 4, connectionEpoch: 'current-connection', requestId: 'reload-1' });
      expect(rows[0]).toMatchObject({ lifeId: messages[0].lifeId, connectionEpoch: messages[0].connectionEpoch,
        requestLifeId: 3, requestConnectionEpoch: 'pending-connection' });
      expect(pending).toMatchObject({ lifeId: 3, connectionEpoch: 'pending-connection' });
      runtime.clear();
    } finally { vi.unstubAllGlobals(); }
  });
});
