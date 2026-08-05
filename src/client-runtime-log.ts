export const CLIENT_RUNTIME_LOG_KEY = 'atomic-acres:client-runtime-log:v1';
export const CLIENT_RUNTIME_LOG_LIMIT = 64;
export const CLIENT_RUNTIME_MESSAGE_LIMIT = 800;
export const CLIENT_RUNTIME_SOURCE_LIMIT = 400;
export const CLIENT_RUNTIME_STACK_LIMIT = 4_000;
export const CLIENT_RUNTIME_STACK_LINE_LIMIT = 32;

export type ClientRuntimeLogEntry = Readonly<{
  timestamp: string;
  kind: 'error' | 'unhandled-rejection' | 'network-warning';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}>;

export type ClientRuntimeLogInput = Omit<ClientRuntimeLogEntry, 'timestamp'> & { timestamp?: string };

const RUNTIME_LOG_KINDS = new Set<ClientRuntimeLogEntry['kind']>(['error', 'unhandled-rejection', 'network-warning']);
const PRIVATE_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;
const URL_LIKE = /\b(?:https?|wss?):\/\/[^\s<>"'`]+/gi;
const SECRET_NAME = '(?:access[_-]?code|access[_-]?token|api[_-]?key|auth(?:orization)?|client[_-]?secret|cookie|credential|id[_-]?token|password|passwd|peer[_-]?id|refresh[_-]?token|resume[_-]?token|room[_-]?code|secret|session[_-]?token|token)';
const QUOTED_SECRET_ASSIGNMENT = new RegExp(`((?:["']?${SECRET_NAME}["']?)\\s*[:=]\\s*)(["'])(.*?)\\2`, 'gi');
const SECRET_ASSIGNMENT = new RegExp(`((?:["']?${SECRET_NAME}["']?)\\s*[:=]\\s*)(?!["'])([^\\s,;&}]+)`, 'gi');

let memoryLog: ClientRuntimeLogEntry[] = [];

function scrubUrl(raw: string): string {
  const trailing = raw.match(/[),.;\]}]+$/)?.[0] ?? '';
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const url = new URL(candidate);
    const authority = `${url.hostname}${url.port ? `:${url.port}` : ''}`;
    return `${url.protocol}//${authority}${url.pathname}${url.search ? '?[redacted]' : ''}${trailing}`;
  } catch {
    return `[url-redacted]${trailing}`;
  }
}

function scrubRuntimeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(URL_LIKE, scrubUrl)
    .replace(QUOTED_SECRET_ASSIGNMENT, '$1$2[redacted]$2')
    .replace(SECRET_ASSIGNMENT, '$1[redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/([?&](?:access[_-]?code|access[_-]?token|api[_-]?key|auth|password|resume[_-]?token|room[_-]?code|secret|token)=)[^&#\s]*/gi, '$1[redacted]')
    .replace(PRIVATE_IP, '[private-network]')
    .replace(/\broom_[A-Za-z0-9_-]{6,}\b/gi, '[room-code]')
    .replace(/\b(?:C:\\Users\\|\/Users\/|\/home\/)[^\\/\s]+/gi, (path) => path.replace(/[^\\/]+$/, '[user]'))
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[redacted]');
}

export function sanitizeClientRuntimeText(value: unknown, limit: number, preserveLines = false): string {
  const scrubbed = scrubRuntimeText(value).replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  const normalized = preserveLines
    ? scrubbed.split('\n').slice(0, CLIENT_RUNTIME_STACK_LINE_LIMIT).map((line) => line.trimEnd()).join('\n').trim()
    : scrubbed.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, Math.max(0, limit));
}

function finiteLocation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

function normalizeEntry(value: unknown, fallbackTimestamp?: string): ClientRuntimeLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.kind !== 'string' || !RUNTIME_LOG_KINDS.has(entry.kind as ClientRuntimeLogEntry['kind'])) return null;
  const timestampCandidate = typeof entry.timestamp === 'string' ? entry.timestamp : fallbackTimestamp;
  if (!timestampCandidate || Number.isNaN(Date.parse(timestampCandidate))) return null;
  const message = sanitizeClientRuntimeText(entry.message, CLIENT_RUNTIME_MESSAGE_LIMIT);
  const source = sanitizeClientRuntimeText(entry.source, CLIENT_RUNTIME_SOURCE_LIMIT);
  const stack = sanitizeClientRuntimeText(entry.stack, CLIENT_RUNTIME_STACK_LIMIT, true);
  const line = finiteLocation(entry.line);
  const column = finiteLocation(entry.column);
  return {
    timestamp: timestampCandidate,
    kind: entry.kind as ClientRuntimeLogEntry['kind'],
    message: message || 'Unknown runtime exception',
    ...(source ? { source } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(stack ? { stack } : {}),
  };
}

export function clientRuntimeLogEntryFromError(
  kind: ClientRuntimeLogEntry['kind'],
  error: unknown,
  source?: string,
  fallbackMessage = 'Unknown runtime exception',
): Omit<ClientRuntimeLogEntry, 'timestamp'> {
  const record = error && typeof error === 'object' ? error as { message?: unknown; name?: unknown; stack?: unknown } : null;
  const rawMessage = typeof record?.message === 'string'
    ? `${typeof record.name === 'string' && record.name ? `${record.name}: ` : ''}${record.message}`
    : typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean'
      ? String(error)
      : fallbackMessage;
  return {
    kind,
    message: rawMessage || fallbackMessage,
    ...(source ? { source } : {}),
    ...(typeof record?.stack === 'string' && record.stack ? { stack: record.stack } : {}),
  };
}

export function readClientRuntimeLog(storage?: Pick<Storage, 'getItem'>): ClientRuntimeLogEntry[] {
  if (!storage) return [...memoryLog];
  try {
    const raw = storage.getItem(CLIENT_RUNTIME_LOG_KEY);
    if (raw === null) return [...memoryLog];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is ClientRuntimeLogEntry => entry !== null)
      .slice(-CLIENT_RUNTIME_LOG_LIMIT);
  } catch {
    return [...memoryLog];
  }
}

export function appendClientRuntimeLog(
  entry: ClientRuntimeLogInput,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): ClientRuntimeLogEntry {
  const timestamp = entry.timestamp && !Number.isNaN(Date.parse(entry.timestamp)) ? entry.timestamp : new Date().toISOString();
  const normalized = normalizeEntry({ ...entry, timestamp }, timestamp) ?? {
    timestamp,
    kind: 'error',
    message: 'Unknown runtime exception',
  };
  const next = [...readClientRuntimeLog(storage), normalized].slice(-CLIENT_RUNTIME_LOG_LIMIT);
  memoryLog = next;
  try { storage?.setItem(CLIENT_RUNTIME_LOG_KEY, JSON.stringify(next)); } catch { /* Memory fallback remains downloadable. */ }
  return normalized;
}
