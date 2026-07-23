export const CLIENT_RUNTIME_LOG_KEY = 'atomic-acres:client-runtime-log:v1';
export const CLIENT_RUNTIME_LOG_LIMIT = 64;

export type ClientRuntimeLogEntry = Readonly<{
  timestamp: string;
  kind: 'error' | 'unhandled-rejection' | 'network-warning';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}>;

let memoryLog: ClientRuntimeLogEntry[] = [];

function clean(value: unknown, limit: number): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
}

export function readClientRuntimeLog(storage?: Pick<Storage, 'getItem'>): ClientRuntimeLogEntry[] {
  if (!storage) return [...memoryLog];
  try {
    const value = JSON.parse(storage.getItem(CLIENT_RUNTIME_LOG_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(-CLIENT_RUNTIME_LOG_LIMIT) as ClientRuntimeLogEntry[] : [];
  } catch {
    return [...memoryLog];
  }
}

export function appendClientRuntimeLog(
  entry: Omit<ClientRuntimeLogEntry, 'timestamp'> & { timestamp?: string },
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): ClientRuntimeLogEntry {
  const normalized: ClientRuntimeLogEntry = {
    timestamp: entry.timestamp && !Number.isNaN(Date.parse(entry.timestamp)) ? entry.timestamp : new Date().toISOString(),
    kind: entry.kind,
    message: clean(entry.message, 500) || 'Unknown runtime exception',
    ...(entry.source ? { source: clean(entry.source, 180) } : {}),
    ...(Number.isFinite(entry.line) ? { line: Math.max(0, Math.floor(entry.line!)) } : {}),
    ...(Number.isFinite(entry.column) ? { column: Math.max(0, Math.floor(entry.column!)) } : {}),
    ...(entry.stack ? { stack: clean(entry.stack, 1_500) } : {}),
  };
  const next = [...readClientRuntimeLog(storage), normalized].slice(-CLIENT_RUNTIME_LOG_LIMIT);
  memoryLog = next;
  try { storage?.setItem(CLIENT_RUNTIME_LOG_KEY, JSON.stringify(next)); } catch { /* Memory fallback remains downloadable. */ }
  return normalized;
}
