import { describe, expect, it } from 'vitest';
import { CLIENT_RUNTIME_LOG_KEY, CLIENT_RUNTIME_LOG_LIMIT, appendClientRuntimeLog, readClientRuntimeLog } from './client-runtime-log';

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
  it('persists a bounded, readable session log', () => {
    const storage = fakeStorage();
    for (let index = 0; index < CLIENT_RUNTIME_LOG_LIMIT + 3; index += 1) {
      appendClientRuntimeLog({ kind: 'error', message: `failure ${index}\nprivate detail` }, storage);
    }
    const log = readClientRuntimeLog(storage);
    expect(log).toHaveLength(CLIENT_RUNTIME_LOG_LIMIT);
    expect(log[0].message).toContain('failure 3 private detail');
    expect(JSON.parse(storage.getItem(CLIENT_RUNTIME_LOG_KEY) ?? '[]')).toHaveLength(CLIENT_RUNTIME_LOG_LIMIT);
  });
});
