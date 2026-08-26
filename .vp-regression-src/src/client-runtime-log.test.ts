import { describe, expect, it } from 'vitest';
import {
  CLIENT_RUNTIME_LOG_KEY,
  CLIENT_RUNTIME_LOG_LIMIT,
  CLIENT_RUNTIME_STACK_LIMIT,
  CLIENT_RUNTIME_STACK_LINE_LIMIT,
  appendClientRuntimeLog,
  clientRuntimeLogEntryFromError,
  readClientRuntimeLog,
} from './client-runtime-log';

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('client runtime exception log', () => {
  it('persists only the newest entries in its bounded ring', () => {
    const storage = fakeStorage();
    for (let index = 0; index < CLIENT_RUNTIME_LOG_LIMIT + 3; index += 1) {
      appendClientRuntimeLog({ kind: 'error', message: `failure ${index}\nprivate detail` }, storage);
    }
    const log = readClientRuntimeLog(storage);
    expect(log).toHaveLength(CLIENT_RUNTIME_LOG_LIMIT);
    expect(log[0].message).toBe('failure 3 private detail');
    expect(log.at(-1)?.message).toBe(`failure ${CLIENT_RUNTIME_LOG_LIMIT + 2} private detail`);
    expect(JSON.parse(storage.getItem(CLIENT_RUNTIME_LOG_KEY) ?? '[]')).toHaveLength(CLIENT_RUNTIME_LOG_LIMIT);
  });

  it('redacts credentials, URL queries, room codes, private addresses and user paths', () => {
    const storage = fakeStorage();
    const entry = appendClientRuntimeLog({
      kind: 'network-warning',
      message: 'Bearer abc.def.ghi token=short-secret roomCode="ABC-123" at 192.168.1.42 room_qwerty123',
      source: 'https://dave:hunter2@192.168.1.42/client.js?access_token=do-not-keep#private',
      stack: [
        'Error: authorization: super-secret',
        '    at connect (https://example.test/client.js?resumeToken=keep-out:10:2)',
        '    at boot (C:\\Users\\david\\projects\\atomic-acres\\src\\main.ts:20:4)',
      ].join('\n'),
    }, storage);
    const serialized = JSON.stringify(entry);
    for (const secret of ['abc.def.ghi', 'short-secret', 'ABC-123', '192.168.1.42', 'room_qwerty123', 'dave', 'hunter2', 'do-not-keep', 'keep-out', 'super-secret']) {
      expect(serialized).not.toContain(secret);
    }
    expect(entry.message).toContain('Bearer [redacted]');
    expect(entry.source).toBe('https://[private-network]/client.js?[redacted]');
    expect(entry.stack).toContain('C:\\Users\\[user]\\projects\\atomic-acres\\src\\main.ts:20:4');
  });

  it('retains a useful multiline stack while bounding its frames and bytes', () => {
    const storage = fakeStorage();
    const stack = Array.from({ length: CLIENT_RUNTIME_STACK_LINE_LIMIT + 20 }, (_, index) =>
      `    at frame${index} (https://arena.example/assets/main.js:${index + 1}:2) ${'x'.repeat(180)}`).join('\r\n');
    const entry = appendClientRuntimeLog({ kind: 'error', message: 'render failed', stack }, storage);
    expect(entry.stack?.split('\n')).toHaveLength(CLIENT_RUNTIME_STACK_LINE_LIMIT);
    expect(entry.stack?.length).toBeLessThanOrEqual(CLIENT_RUNTIME_STACK_LIMIT);
    expect(entry.stack).toContain('at frame0');
    expect(entry.stack).not.toContain(`at frame${CLIENT_RUNTIME_STACK_LINE_LIMIT}`);
  });

  it('normalizes Error and non-Error rejection reasons into structured entries', () => {
    const error = new Error('socket failed token=secret-value');
    const structured = clientRuntimeLogEntryFromError('network-warning', error, 'peerjs:guest-events');
    const fallback = clientRuntimeLogEntryFromError('unhandled-rejection', { code: 500 }, undefined, 'Promise rejected without an Error');
    expect(structured).toMatchObject({ kind: 'network-warning', message: 'Error: socket failed token=secret-value', source: 'peerjs:guest-events' });
    expect(structured.stack).toContain('socket failed');
    expect(fallback).toEqual({ kind: 'unhandled-rejection', message: 'Promise rejected without an Error' });
  });

  it('rejects malformed persisted records instead of trusting storage contents', () => {
    const storage = fakeStorage();
    storage.setItem(CLIENT_RUNTIME_LOG_KEY, JSON.stringify([
      null,
      { timestamp: 'not-a-date', kind: 'error', message: 'bad timestamp' },
      { timestamp: new Date(0).toISOString(), kind: 'invented-kind', message: 'bad kind' },
      { timestamp: new Date(1).toISOString(), kind: 'error', message: 'valid\nmessage', line: -2.9 },
    ]));
    expect(readClientRuntimeLog(storage)).toEqual([{
      timestamp: new Date(1).toISOString(),
      kind: 'error',
      message: 'valid message',
      line: 0,
    }]);
  });
});
