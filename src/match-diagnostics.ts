export const MATCH_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const MAX_DIAGNOSTIC_EVENTS = 1_024;
export const MAX_DIAGNOSTIC_EXPORT_BYTES = 512 * 1_024;

export type DiagnosticRole = 'offline' | 'host' | 'guest';
export type DiagnosticAdmission = 'accepted' | 'rejected' | 'observed';
export type MatchDiagnosticInput = Readonly<{
  monotonicMs: number;
  localEpochMs: number;
  matchTimeMs?: number;
  eventId: string;
  eventType: string;
  actorId?: string;
  targetId?: string;
  weaponOrEffect?: string;
  position?: readonly [number, number, number];
  admission: DiagnosticAdmission;
  reason?: string;
  healthBefore?: number;
  healthAfter?: number;
  damageRequested?: number;
  damageApplied?: number;
  modifiers?: readonly string[];
  rttMs?: number;
  jitterMs?: number;
  clockOffsetMs?: number;
  spawnScore?: number;
  spawnReason?: string;
}>;
export type MatchDiagnosticContext = Readonly<{
  buildId: string;
  sourceId: string;
  sessionId: string;
  role: DiagnosticRole;
  arena: string;
  mode: string;
  technicalContext?: Readonly<Record<string, unknown>>;
}>;
type ExportEvent = Omit<MatchDiagnosticInput, 'actorId' | 'targetId'> & { actorId?: string; targetId?: string };

const SECRET_KEYS = /room.*code|access.*code|auth.*code|token|secret|credential|password|cookie|authorization|(?:^|[_-])ip(?:$|[_-])|address/i;
const PRIVATE_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;

function stablePseudonym(value: string, salt: string): string {
  let hash = 0x811c9dc5;
  for (const char of `${salt}:${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `p-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function scrubText(value: string): string {
  return value
    .replace(PRIVATE_IP, '[private-network]')
    .replace(/\broom_[A-Za-z0-9_-]{6,}\b/gi, '[room-code]')
    .replace(/[A-Za-z0-9_-]{48,}/g, '[redacted]');
}

export function sanitizeDiagnosticValue(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.test(key)) return '[redacted]';
  if (typeof value === 'string') return scrubText(value).slice(0, 160);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((entry) => sanitizeDiagnosticValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => !SECRET_KEYS.test(entryKey))
      .slice(0, 48)
      .map(([entryKey, entryValue]) => [entryKey, sanitizeDiagnosticValue(entryValue, entryKey)]));
  }
  return undefined;
}

export class MatchDiagnostics {
  readonly context: MatchDiagnosticContext;
  private readonly events: ExportEvent[] = [];
  private droppedEvents = 0;

  constructor(context: MatchDiagnosticContext) {
    this.context = {
      ...context,
      buildId: scrubText(context.buildId).slice(0, 80),
      sourceId: scrubText(context.sourceId).slice(0, 80),
      sessionId: stablePseudonym(context.sessionId, context.sourceId),
      arena: scrubText(context.arena).slice(0, 40),
      mode: scrubText(context.mode).slice(0, 40),
      ...(context.technicalContext ? { technicalContext: sanitizeDiagnosticValue(context.technicalContext) as Record<string, unknown> } : {}),
    };
  }

  record(input: MatchDiagnosticInput): void {
    const event: ExportEvent = {
      ...input,
      eventId: scrubText(input.eventId).slice(0, 80),
      eventType: scrubText(input.eventType).slice(0, 60),
      ...(input.actorId ? { actorId: stablePseudonym(input.actorId, this.context.sessionId) } : {}),
      ...(input.targetId ? { targetId: stablePseudonym(input.targetId, this.context.sessionId) } : {}),
      ...(input.weaponOrEffect ? { weaponOrEffect: scrubText(input.weaponOrEffect).slice(0, 40) } : {}),
      ...(input.reason ? { reason: scrubText(input.reason).slice(0, 100) } : {}),
      ...(input.spawnReason ? { spawnReason: scrubText(input.spawnReason).slice(0, 100) } : {}),
      modifiers: input.modifiers?.slice(0, 8).map((modifier) => scrubText(modifier).slice(0, 40)),
      position: input.position?.map((coordinate) => Math.round(coordinate * 10) / 10) as [number, number, number] | undefined,
    };
    this.events.push(event);
    if (this.events.length > MAX_DIAGNOSTIC_EVENTS) {
      this.events.shift();
      this.droppedEvents += 1;
    }
  }

  export(): { filename: string; json: string } {
    const envelope = { schemaVersion: MATCH_DIAGNOSTICS_SCHEMA_VERSION, context: this.context, droppedEvents: this.droppedEvents, events: this.events };
    let json = JSON.stringify(sanitizeDiagnosticValue(envelope), null, 2);
    while (new TextEncoder().encode(json).byteLength > MAX_DIAGNOSTIC_EXPORT_BYTES && this.events.length > 1) {
      this.events.shift();
      this.droppedEvents += 1;
      json = JSON.stringify(sanitizeDiagnosticValue({ ...envelope, droppedEvents: this.droppedEvents, events: this.events }), null, 2);
    }
    const safeArena = this.context.arena.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arena';
    return { filename: `atomic-acres-match-${safeArena}-${this.context.sessionId}.json`, json };
  }

  size(): number {
    return this.events.length;
  }
}
