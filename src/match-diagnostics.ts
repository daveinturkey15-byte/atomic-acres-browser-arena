export const MATCH_DIAGNOSTICS_SCHEMA_VERSION = 2;
export const MAX_DIAGNOSTIC_EVENTS = 2_048;
export const MAX_DAMAGE_LEDGER_EVENTS = 8_192;
export const MAX_DIAGNOSTIC_EXPORT_BYTES = 4 * 1_024 * 1_024;

export type DiagnosticRole = 'offline' | 'host' | 'guest';
export type DiagnosticAdmission = 'accepted' | 'rejected' | 'observed';
export type MatchDiagnosticInput = Readonly<{
  monotonicMs: number;
  localEpochMs: number;
  matchTimeMs?: number;
  eventId: string;
  eventType: string;
  actorId?: string;
  actorKind?: string;
  targetId?: string;
  targetKind?: string;
  weaponOrEffect?: string;
  hitZone?: string;
  critical?: boolean;
  wallbang?: boolean;
  penetrationMultiplier?: number;
  distanceMeters?: number;
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
  if (Array.isArray(value)) return value.slice(0, 8_192).map((entry) => sanitizeDiagnosticValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => !SECRET_KEYS.test(entryKey))
      .slice(0, 64)
      .map(([entryKey, entryValue]) => [entryKey, sanitizeDiagnosticValue(entryValue, entryKey)]));
  }
  return undefined;
}

function isDamageEvent(event: ExportEvent): boolean {
  return event.damageApplied !== undefined || event.eventType.includes('damage');
}

export class MatchDiagnostics {
  readonly context: MatchDiagnosticContext;
  private readonly events: ExportEvent[] = [];
  private readonly damageLedger: ExportEvent[] = [];
  private droppedEvents = 0;
  private droppedDamageEvents = 0;
  private finalState: unknown = undefined;

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

  participantKey(id: string): string {
    return stablePseudonym(id, this.context.sessionId);
  }

  setFinalState(value: unknown): void {
    this.finalState = sanitizeDiagnosticValue(value);
  }

  record(input: MatchDiagnosticInput): void {
    const event: ExportEvent = {
      ...input,
      eventId: scrubText(input.eventId).slice(0, 80),
      eventType: scrubText(input.eventType).slice(0, 60),
      ...(input.actorId ? { actorId: this.participantKey(input.actorId) } : {}),
      ...(input.targetId ? { targetId: this.participantKey(input.targetId) } : {}),
      ...(input.actorKind ? { actorKind: scrubText(input.actorKind).slice(0, 24) } : {}),
      ...(input.targetKind ? { targetKind: scrubText(input.targetKind).slice(0, 24) } : {}),
      ...(input.weaponOrEffect ? { weaponOrEffect: scrubText(input.weaponOrEffect).slice(0, 40) } : {}),
      ...(input.hitZone ? { hitZone: scrubText(input.hitZone).slice(0, 20) } : {}),
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
    if (isDamageEvent(event)) {
      this.damageLedger.push(event);
      if (this.damageLedger.length > MAX_DAMAGE_LEDGER_EVENTS) {
        this.damageLedger.shift();
        this.droppedDamageEvents += 1;
      }
    }
  }

  export(): { filename: string; json: string } {
    const makeEnvelope = () => ({
      schemaVersion: MATCH_DIAGNOSTICS_SCHEMA_VERSION,
      context: this.context,
      droppedEvents: this.droppedEvents,
      droppedDamageEvents: this.droppedDamageEvents,
      events: this.events,
      damageLedger: this.damageLedger,
      ...(this.finalState === undefined ? {} : { finalState: this.finalState }),
    });
    let json = JSON.stringify(makeEnvelope(), null, 2);
    while (new TextEncoder().encode(json).byteLength > MAX_DIAGNOSTIC_EXPORT_BYTES && this.events.length > 1) {
      this.events.shift();
      this.droppedEvents += 1;
      json = JSON.stringify(makeEnvelope(), null, 2);
    }
    while (new TextEncoder().encode(json).byteLength > MAX_DIAGNOSTIC_EXPORT_BYTES && this.damageLedger.length > 1) {
      this.damageLedger.shift();
      this.droppedDamageEvents += 1;
      json = JSON.stringify(makeEnvelope(), null, 2);
    }
    const safeArena = this.context.arena.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arena';
    return { filename: `atomic-acres-match-${safeArena}-${this.context.sessionId}.json`, json };
  }

  size(): number {
    return this.events.length;
  }
}
