import {
  MATCH_DIAGNOSTIC_ACTOR_KINDS,
  MATCH_DIAGNOSTIC_ARENAS,
  MATCH_DIAGNOSTIC_MAX_BODY_BYTES,
  MATCH_DIAGNOSTIC_MAX_EVENTS,
  MATCH_DIAGNOSTIC_MAX_PARTICIPANTS,
  MATCH_DIAGNOSTIC_MODES,
  MATCH_DIAGNOSTIC_UPLOAD_SCHEMA_VERSION,
  validateMatchDiagnosticEnvelope,
  type MatchDiagnosticActorKind,
  type MatchDiagnosticBackend,
  type MatchDiagnosticFatalCategory,
  type MatchDiagnosticParticipantSummary,
  type MatchDiagnosticSource,
  type MatchDiagnosticUploadEnvelope,
} from '../shared/match-diagnostics-schema';
import {
  CLIENT_RUNTIME_MESSAGE_LIMIT,
  CLIENT_RUNTIME_SOURCE_LIMIT,
  CLIENT_RUNTIME_STACK_LIMIT,
  sanitizeClientRuntimeText,
} from './client-runtime-log';

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

export type RemoteMatchDiagnosticCompletion = Readonly<{
  completedAtEpochMs: number;
  pass: string;
  backend: MatchDiagnosticBackend;
  durationMs: number;
  network: Readonly<{
    rttMs: number | null;
    jitterMs: number;
    clockOffsetMs: number;
    interpolationDelayMs: number;
    receiverSequenceGaps: number;
    receiverReordered: number;
    droppedDamageEvents: number;
  }>;
  participants: readonly Readonly<{
    id: string;
    kind: string;
    team: string;
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
    finalHealth?: number;
  }>[];
  local: Readonly<{
    kills: number;
    deaths: number;
    shotsFired: number;
    hitShots: number;
    damageDealt: number;
    damageTaken: number;
    headshots: number;
  }>;
  fatalRuntimeErrorCategories?: readonly MatchDiagnosticFatalCategory[];
}>;

const SECRET_KEYS = /room.*code|access.*code|auth.*code|token|secret|credential|password|cookie|authorization|(?:^|[_-])ip(?:$|[_-])|address/i;
const PRIVATE_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;

function fnv1a(value: string, seed: number): string {
  let hash = seed;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stablePseudonym(value: string, salt: string): string {
  const material = `${salt}:${value}`;
  let reverse = '';
  for (let index = material.length - 1; index >= 0; index -= 1) reverse += material[index];
  return `p-${fnv1a(material, 0x811c9dc5)}${fnv1a(reverse, 0x9e3779b9)}`;
}

function scrubText(value: string): string {
  return value
    .replace(PRIVATE_IP, '[private-network]')
    .replace(/\broom_[A-Za-z0-9_-]{6,}\b/gi, '[room-code]')
    .replace(/[A-Za-z0-9_-]{48,}/g, '[redacted]');
}

export function sanitizeDiagnosticValue(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    const stack = /stack/i.test(key);
    const limit = stack
      ? CLIENT_RUNTIME_STACK_LIMIT
      : /source|filename/i.test(key)
        ? CLIENT_RUNTIME_SOURCE_LIMIT
        : /message|error/i.test(key)
          ? CLIENT_RUNTIME_MESSAGE_LIMIT
          : 160;
    return sanitizeClientRuntimeText(value, limit, stack);
  }
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

function isPriorityRemoteEvent(event: ExportEvent): boolean {
  return isDamageEvent(event)
    || event.eventType === 'health-regen'
    || event.eventType.includes('death')
    || event.admission === 'rejected';
}

function selectRemoteEvents(events: readonly ExportEvent[]): ExportEvent[] {
  const prioritized = events.filter(isPriorityRemoteEvent).slice(-MATCH_DIAGNOSTIC_MAX_EVENTS);
  const prioritizedSet = new Set(prioritized);
  const ordinarySlots = MATCH_DIAGNOSTIC_MAX_EVENTS - prioritized.length;
  const ordinary = ordinarySlots > 0
    ? events.filter((event) => !prioritizedSet.has(event)).slice(-ordinarySlots)
    : [];
  return [...prioritized, ...ordinary].sort((left, right) => left.monotonicMs - right.monotonicMs);
}

const FRAME_BUCKETS_MS = [8, 12, 16, 20, 25, 33, 50, 100, 250, 500, 1_000] as const;

function boundedInteger(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.round(value))) : 0;
}

function boundedDecimal(value: number | undefined, minimum: number, maximum: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * 10) / 10;
}

function actorKind(value: string | undefined): MatchDiagnosticActorKind {
  return value && (MATCH_DIAGNOSTIC_ACTOR_KINDS as readonly string[]).includes(value)
    ? value as MatchDiagnosticActorKind
    : 'unknown';
}

function eventSource(event: ExportEvent): MatchDiagnosticSource {
  const source = event.weaponOrEffect ?? '';
  if (source === 'railgun') return 'railgun';
  if (source === 'grenade') return 'grenade';
  if (source === 'melee') return 'melee';
  if (source === 'environment' || source === 'fall') return 'environment';
  if (['yardhawk', 'tri-pass', 'hunter-swarm', 'nuke'].includes(source)) return 'support';
  if (['carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'pistol', 'machine-pistol', 'magnum'].includes(source)) return 'firearm';
  if (event.eventType.includes('state') || event.eventType.includes('timing')) return 'state';
  if (event.eventType.includes('spawn')) return 'spawn';
  if (event.eventType.includes('pickup')) return 'pickup';
  if (event.eventType.includes('redeploy')) return 'redeploy';
  if (event.eventType.includes('match')) return 'match';
  return 'unknown';
}

function teamCode(value: string): 0 | 1 | 2 {
  if (value === 'team-1') return 0;
  if (value === 'team-2') return 1;
  return 2;
}

export class MatchDiagnostics {
  readonly context: MatchDiagnosticContext;
  private readonly events: ExportEvent[] = [];
  private readonly damageLedger: ExportEvent[] = [];
  private droppedEvents = 0;
  private droppedDamageEvents = 0;
  private finalState: unknown = undefined;
  private readonly frameBuckets = FRAME_BUCKETS_MS.map(() => 0);
  private frameSampleCount = 0;
  private maximumFrameBucketMs = 0;

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

  recordFrame(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    const bounded = Math.min(1_000, Math.max(0, frameMs));
    const bucketIndex = FRAME_BUCKETS_MS.findIndex((ceiling) => bounded <= ceiling);
    const index = bucketIndex === -1 ? FRAME_BUCKETS_MS.length - 1 : bucketIndex;
    this.frameBuckets[index] += 1;
    this.frameSampleCount = Math.min(10_000_000, this.frameSampleCount + 1);
    this.maximumFrameBucketMs = Math.max(this.maximumFrameBucketMs, FRAME_BUCKETS_MS[index]);
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
      const ordinaryIndex = this.events.findIndex((candidate) => !isPriorityRemoteEvent(candidate));
      if (ordinaryIndex >= 0) this.events.splice(ordinaryIndex, 1);
      else this.events.shift();
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

  remoteEnvelope(completion: RemoteMatchDiagnosticCompletion): MatchDiagnosticUploadEnvelope {
    const durationMs = boundedInteger(completion.durationMs, 4 * 60 * 60_000);
    const retained = selectRemoteEvents(this.events);
    const events = retained.map((event, sequence) => {
      const hasHealth = event.healthBefore !== undefined || event.healthAfter !== undefined;
      const category = event.eventType.includes('death')
        ? 'death' as const
        : event.eventType === 'health-regen'
        ? 'regen' as const
        : isDamageEvent(event)
          ? 'damage' as const
          : hasHealth
            ? 'health' as const
            : 'admission' as const;
      return {
        sequence,
        atMs: boundedInteger(event.matchTimeMs ?? event.monotonicMs - this.events[0]?.monotonicMs, durationMs),
        category,
        admission: event.admission,
        ...(event.actorId ? { actor: event.actorId } : {}),
        ...(event.actorKind ? { actorKind: actorKind(event.actorKind) } : {}),
        ...(event.targetId ? { target: event.targetId } : {}),
        ...(event.targetKind ? { targetKind: actorKind(event.targetKind) } : {}),
        source: eventSource(event),
        ...(boundedDecimal(event.healthBefore, 0, 1_000) !== undefined ? { healthBefore: boundedDecimal(event.healthBefore, 0, 1_000) } : {}),
        ...(boundedDecimal(event.healthAfter, 0, 1_000) !== undefined ? { healthAfter: boundedDecimal(event.healthAfter, 0, 1_000) } : {}),
        ...(boundedDecimal(event.damageRequested, 0, 1_000) !== undefined ? { damageRequested: boundedDecimal(event.damageRequested, 0, 1_000) } : {}),
        ...(boundedDecimal(event.damageApplied, 0, 1_000) !== undefined ? { damageApplied: boundedDecimal(event.damageApplied, 0, 1_000) } : {}),
        ...(event.wallbang !== undefined ? { wallbang: event.wallbang } : {}),
      };
    });
    const percentileBucket = (fraction: number): number => {
      if (this.frameSampleCount === 0) return 0;
      const target = Math.max(1, Math.ceil(this.frameSampleCount * fraction));
      let cumulative = 0;
      for (let index = 0; index < this.frameBuckets.length; index += 1) {
        cumulative += this.frameBuckets[index];
        if (cumulative >= target) return FRAME_BUCKETS_MS[index];
      }
      return 1_000;
    };
    const participants: MatchDiagnosticParticipantSummary[] = completion.participants
      .slice(0, MATCH_DIAGNOSTIC_MAX_PARTICIPANTS)
      .map((participant) => ({
        participant: this.participantKey(participant.id),
        kind: actorKind(participant.kind),
        team: teamCode(participant.team),
        kills: boundedInteger(participant.kills, 1_000_000),
        deaths: boundedInteger(participant.deaths, 1_000_000),
        damageDealt: boundedInteger(participant.damageDealt, 10_000_000),
        damageTaken: boundedInteger(participant.damageTaken, 10_000_000),
        finalHealth: boundedDecimal(participant.finalHealth ?? 0, 0, 1_000) ?? 0,
      }));
    const envelope: MatchDiagnosticUploadEnvelope = {
      schemaVersion: MATCH_DIAGNOSTIC_UPLOAD_SCHEMA_VERSION,
      idempotencyKey: `diagnostic:${this.context.sessionId}:${this.context.role}`,
      matchId: this.context.sessionId,
      completedAtEpochMinute: Math.floor(Math.max(0, completion.completedAtEpochMs) / 60_000) * 60_000,
      buildId: this.context.buildId,
      pass: completion.pass,
      backend: completion.backend,
      arena: (MATCH_DIAGNOSTIC_ARENAS as readonly string[]).includes(this.context.arena) ? this.context.arena as MatchDiagnosticUploadEnvelope['arena'] : 'atomic-acres',
      mode: (MATCH_DIAGNOSTIC_MODES as readonly string[]).includes(this.context.mode) ? this.context.mode as MatchDiagnosticUploadEnvelope['mode'] : 'solo',
      role: this.context.role,
      durationMs,
      events,
      droppedEvents: boundedInteger(this.droppedEvents + Math.max(0, this.events.length - retained.length), 10_000_000),
      net: {
        rttBucketMs: completion.network.rttMs === null ? null : boundedInteger(Math.round(completion.network.rttMs / 10) * 10, 60_000),
        jitterBucketMs: boundedInteger(Math.round(completion.network.jitterMs / 5) * 5, 60_000),
        clockOffsetBucketMs: Math.min(60_000, Math.max(-60_000, Math.round(completion.network.clockOffsetMs / 10) * 10)),
        interpolationDelayBucketMs: boundedInteger(Math.round(completion.network.interpolationDelayMs / 5) * 5, 5_000),
        receiverSequenceGaps: boundedInteger(completion.network.receiverSequenceGaps, 1_000_000),
        receiverReordered: boundedInteger(completion.network.receiverReordered, 1_000_000),
        droppedDamageEvents: boundedInteger(completion.network.droppedDamageEvents, 10_000_000),
      },
      perf: {
        sampleCount: this.frameSampleCount,
        frameP50BucketMs: percentileBucket(0.5),
        frameP95BucketMs: percentileBucket(0.95),
        frameP99BucketMs: percentileBucket(0.99),
        maximumFrameBucketMs: this.maximumFrameBucketMs,
      },
      final: {
        participantCount: participants.length,
        participants,
        local: {
          kills: boundedInteger(completion.local.kills, 1_000_000),
          deaths: boundedInteger(completion.local.deaths, 1_000_000),
          shotsFired: boundedInteger(completion.local.shotsFired, 1_000_000),
          hitShots: Math.min(boundedInteger(completion.local.shotsFired, 1_000_000), boundedInteger(completion.local.hitShots, 1_000_000)),
          damageDealt: boundedInteger(completion.local.damageDealt, 10_000_000),
          damageTaken: boundedInteger(completion.local.damageTaken, 10_000_000),
          headshots: Math.min(boundedInteger(completion.local.hitShots, 1_000_000), boundedInteger(completion.local.headshots, 1_000_000)),
        },
        fatalRuntimeErrorCategories: [...new Set(completion.fatalRuntimeErrorCategories ?? [])].slice(0, 5),
      },
    };
    while (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MATCH_DIAGNOSTIC_MAX_BODY_BYTES && envelope.events.length > 0) {
      (envelope.events as MatchDiagnosticUploadEnvelope['events'][number][]).shift();
      (envelope.events as MatchDiagnosticUploadEnvelope['events'][number][]).forEach((event, sequence) => {
        (event as { sequence: number }).sequence = sequence;
      });
      (envelope as { droppedEvents: number }).droppedEvents += 1;
    }
    const validated = validateMatchDiagnosticEnvelope(envelope);
    if (!validated.envelope) throw new Error(`Generated invalid match diagnostic envelope: ${validated.error}`);
    return validated.envelope;
  }

  size(): number {
    return this.events.length;
  }
}
