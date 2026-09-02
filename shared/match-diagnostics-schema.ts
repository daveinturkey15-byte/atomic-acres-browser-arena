export const MATCH_DIAGNOSTIC_UPLOAD_SCHEMA_VERSION = 1 as const;
export const MATCH_DIAGNOSTIC_MAX_BODY_BYTES = 48 * 1_024;
export const MATCH_DIAGNOSTIC_MAX_EVENTS = 192;
export const MATCH_DIAGNOSTIC_MAX_PARTICIPANTS = 12;
export const MATCH_DIAGNOSTIC_RETENTION_DAYS = 30;

export const MATCH_DIAGNOSTIC_BACKENDS = ['webgpu', 'webgl-compatibility'] as const;
export const MATCH_DIAGNOSTIC_ARENAS = [
  'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'farcrysis', 'high-seas', 'test1', 'test2',
  // MAP3 (owner 2026-09-02, HF-405). Paired with worker/migrations/
  // 0007_add_map3_arena.sql: this list and that CHECK constraint are the two
  // halves of the same boundary and must never drift apart.
  'map3',
] as const;
// Owner 2026-08-30: Domination ships with the Test2 arena.
export const MATCH_DIAGNOSTIC_MODES = ['solo', 'tdm', 'ffa', 'domination'] as const;
export const MATCH_DIAGNOSTIC_ROLES = ['offline', 'host', 'guest'] as const;
export const MATCH_DIAGNOSTIC_ADMISSIONS = ['accepted', 'rejected', 'observed'] as const;
export const MATCH_DIAGNOSTIC_EVENT_CATEGORIES = ['damage', 'health', 'regen', 'death', 'admission'] as const;
export const MATCH_DIAGNOSTIC_ACTOR_KINDS = [
  'player', 'hosted-bot', 'solo-bot', 'practice-target', 'flying-target', 'environment', 'unknown',
] as const;
export const MATCH_DIAGNOSTIC_SOURCES = [
  'unknown', 'firearm', 'railgun', 'grenade', 'melee', 'support', 'environment', 'state', 'spawn', 'pickup', 'redeploy', 'match',
] as const;
export const MATCH_DIAGNOSTIC_FATAL_CATEGORIES = ['renderer', 'network', 'physics', 'asset', 'unknown'] as const;

export type MatchDiagnosticBackend = typeof MATCH_DIAGNOSTIC_BACKENDS[number];
export type MatchDiagnosticArena = typeof MATCH_DIAGNOSTIC_ARENAS[number];
export type MatchDiagnosticMode = typeof MATCH_DIAGNOSTIC_MODES[number];
export type MatchDiagnosticUploadRole = typeof MATCH_DIAGNOSTIC_ROLES[number];
export type MatchDiagnosticUploadAdmission = typeof MATCH_DIAGNOSTIC_ADMISSIONS[number];
export type MatchDiagnosticEventCategory = typeof MATCH_DIAGNOSTIC_EVENT_CATEGORIES[number];
export type MatchDiagnosticActorKind = typeof MATCH_DIAGNOSTIC_ACTOR_KINDS[number];
export type MatchDiagnosticSource = typeof MATCH_DIAGNOSTIC_SOURCES[number];
export type MatchDiagnosticFatalCategory = typeof MATCH_DIAGNOSTIC_FATAL_CATEGORIES[number];

export type MatchDiagnosticUploadEvent = Readonly<{
  sequence: number;
  atMs: number;
  category: MatchDiagnosticEventCategory;
  admission: MatchDiagnosticUploadAdmission;
  actor?: string;
  actorKind?: MatchDiagnosticActorKind;
  target?: string;
  targetKind?: MatchDiagnosticActorKind;
  source: MatchDiagnosticSource;
  healthBefore?: number;
  healthAfter?: number;
  damageRequested?: number;
  damageApplied?: number;
  wallbang?: boolean;
}>;

export type MatchDiagnosticParticipantSummary = Readonly<{
  participant: string;
  kind: MatchDiagnosticActorKind;
  team: 0 | 1 | 2;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  finalHealth: number;
}>;

export type MatchDiagnosticUploadEnvelope = Readonly<{
  schemaVersion: typeof MATCH_DIAGNOSTIC_UPLOAD_SCHEMA_VERSION;
  idempotencyKey: string;
  matchId: string;
  completedAtEpochMinute: number;
  buildId: string;
  pass: string;
  backend: MatchDiagnosticBackend;
  arena: MatchDiagnosticArena;
  mode: MatchDiagnosticMode;
  role: MatchDiagnosticUploadRole;
  durationMs: number;
  events: readonly MatchDiagnosticUploadEvent[];
  droppedEvents: number;
  net: Readonly<{
    rttBucketMs: number | null;
    jitterBucketMs: number;
    clockOffsetBucketMs: number;
    interpolationDelayBucketMs: number;
    receiverSequenceGaps: number;
    receiverReordered: number;
    droppedDamageEvents: number;
  }>;
  perf: Readonly<{
    sampleCount: number;
    frameP50BucketMs: number;
    frameP95BucketMs: number;
    frameP99BucketMs: number;
    maximumFrameBucketMs: number;
  }>;
  final: Readonly<{
    participantCount: number;
    participants: readonly MatchDiagnosticParticipantSummary[];
    local: Readonly<{
      kills: number;
      deaths: number;
      shotsFired: number;
      hitShots: number;
      damageDealt: number;
      damageTaken: number;
      headshots: number;
    }>;
    fatalRuntimeErrorCategories: readonly MatchDiagnosticFatalCategory[];
  }>;
}>;

const BUILD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const PASS_PATTERN = /^PASS [0-9]{1,3}$/;
const MATCH_PATTERN = /^p-[a-f0-9]{16}$/;
const IDEMPOTENCY_PATTERN = /^diagnostic:p-[a-f0-9]{16}:(?:offline|host|guest)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(item: Record<string, unknown>, allowed: readonly string[], required = allowed): boolean {
  return Object.keys(item).every((key) => allowed.includes(key)) && required.every((key) => key in item);
}

function oneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function decimal(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    && Math.round(value * 10) === value * 10;
}

function optionalDecimal(value: unknown, minimum: number, maximum: number): boolean {
  return value === undefined || decimal(value, minimum, maximum);
}

function optionalPseudonym(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && MATCH_PATTERN.test(value));
}

function validateEvent(value: unknown, index: number, previousAtMs: number): value is MatchDiagnosticUploadEvent {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ['sequence', 'atMs', 'category', 'admission', 'actor', 'actorKind', 'target', 'targetKind', 'source', 'healthBefore', 'healthAfter', 'damageRequested', 'damageApplied', 'wallbang'],
    ['sequence', 'atMs', 'category', 'admission', 'source'],
  )) return false;
  if (value.sequence !== index || !integer(value.atMs, 0, 4 * 60 * 60_000) || value.atMs < previousAtMs) return false;
  if (!oneOf(MATCH_DIAGNOSTIC_EVENT_CATEGORIES, value.category)
    || !oneOf(MATCH_DIAGNOSTIC_ADMISSIONS, value.admission)
    || !oneOf(MATCH_DIAGNOSTIC_SOURCES, value.source)) return false;
  if (!optionalPseudonym(value.actor) || !optionalPseudonym(value.target)) return false;
  if (value.actorKind !== undefined && !oneOf(MATCH_DIAGNOSTIC_ACTOR_KINDS, value.actorKind)) return false;
  if (value.targetKind !== undefined && !oneOf(MATCH_DIAGNOSTIC_ACTOR_KINDS, value.targetKind)) return false;
  if (!optionalDecimal(value.healthBefore, 0, 1_000) || !optionalDecimal(value.healthAfter, 0, 1_000)
    || !optionalDecimal(value.damageRequested, 0, 1_000) || !optionalDecimal(value.damageApplied, 0, 1_000)) return false;
  return value.wallbang === undefined || typeof value.wallbang === 'boolean';
}

function validateParticipant(value: unknown): value is MatchDiagnosticParticipantSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, ['participant', 'kind', 'team', 'kills', 'deaths', 'damageDealt', 'damageTaken', 'finalHealth'])) return false;
  return typeof value.participant === 'string' && MATCH_PATTERN.test(value.participant)
    && oneOf(MATCH_DIAGNOSTIC_ACTOR_KINDS, value.kind)
    && integer(value.team, 0, 2)
    && integer(value.kills, 0, 1_000_000) && integer(value.deaths, 0, 1_000_000)
    && integer(value.damageDealt, 0, 10_000_000) && integer(value.damageTaken, 0, 10_000_000)
    && decimal(value.finalHealth, 0, 1_000);
}

export function validateMatchDiagnosticEnvelope(value: unknown): {
  envelope: MatchDiagnosticUploadEnvelope | null;
  error: string | null;
} {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'idempotencyKey', 'matchId', 'completedAtEpochMinute', 'buildId', 'pass', 'backend',
    'arena', 'mode', 'role', 'durationMs', 'events', 'droppedEvents', 'net', 'perf', 'final',
  ])) return { envelope: null, error: 'invalid envelope shape' };
  if (value.schemaVersion !== MATCH_DIAGNOSTIC_UPLOAD_SCHEMA_VERSION) return { envelope: null, error: 'invalid schema version' };
  if (typeof value.matchId !== 'string' || !MATCH_PATTERN.test(value.matchId)
    || typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(value.idempotencyKey)
    || value.idempotencyKey !== `diagnostic:${value.matchId}:${value.role}`) return { envelope: null, error: 'invalid match identity' };
  if (!integer(value.completedAtEpochMinute, 0, 8_640_000_000_000) || value.completedAtEpochMinute % 60_000 !== 0) return { envelope: null, error: 'invalid completion time' };
  if (typeof value.buildId !== 'string' || !BUILD_PATTERN.test(value.buildId)
    || typeof value.pass !== 'string' || !PASS_PATTERN.test(value.pass)) return { envelope: null, error: 'invalid build identity' };
  if (!oneOf(MATCH_DIAGNOSTIC_BACKENDS, value.backend) || !oneOf(MATCH_DIAGNOSTIC_ARENAS, value.arena)
    || !oneOf(MATCH_DIAGNOSTIC_MODES, value.mode) || !oneOf(MATCH_DIAGNOSTIC_ROLES, value.role)) return { envelope: null, error: 'invalid match context' };
  if (!integer(value.durationMs, 0, 4 * 60 * 60_000) || !integer(value.droppedEvents, 0, 10_000_000)) return { envelope: null, error: 'invalid match bounds' };
  if (!Array.isArray(value.events) || value.events.length > MATCH_DIAGNOSTIC_MAX_EVENTS) return { envelope: null, error: 'invalid events' };
  let previousAtMs = 0;
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index];
    if (!validateEvent(event, index, previousAtMs)) return { envelope: null, error: 'invalid event' };
    previousAtMs = event.atMs;
  }
  if (!isRecord(value.net) || !hasOnlyKeys(value.net, ['rttBucketMs', 'jitterBucketMs', 'clockOffsetBucketMs', 'interpolationDelayBucketMs', 'receiverSequenceGaps', 'receiverReordered', 'droppedDamageEvents'])) return { envelope: null, error: 'invalid network summary' };
  if (!(value.net.rttBucketMs === null || integer(value.net.rttBucketMs, 0, 60_000))
    || !integer(value.net.jitterBucketMs, 0, 60_000) || !integer(value.net.clockOffsetBucketMs, -60_000, 60_000)
    || !integer(value.net.interpolationDelayBucketMs, 0, 5_000) || !integer(value.net.receiverSequenceGaps, 0, 1_000_000)
    || !integer(value.net.receiverReordered, 0, 1_000_000) || !integer(value.net.droppedDamageEvents, 0, 10_000_000)) return { envelope: null, error: 'invalid network values' };
  if (!isRecord(value.perf) || !hasOnlyKeys(value.perf, ['sampleCount', 'frameP50BucketMs', 'frameP95BucketMs', 'frameP99BucketMs', 'maximumFrameBucketMs'])) return { envelope: null, error: 'invalid performance summary' };
  if (!integer(value.perf.sampleCount, 0, 10_000_000) || !integer(value.perf.frameP50BucketMs, 0, 1_000)
    || !integer(value.perf.frameP95BucketMs, 0, 1_000) || !integer(value.perf.frameP99BucketMs, 0, 1_000)
    || !integer(value.perf.maximumFrameBucketMs, 0, 1_000)
    || value.perf.frameP50BucketMs > value.perf.frameP95BucketMs || value.perf.frameP95BucketMs > value.perf.frameP99BucketMs
    || value.perf.frameP99BucketMs > value.perf.maximumFrameBucketMs) return { envelope: null, error: 'invalid performance values' };
  if (!isRecord(value.final) || !hasOnlyKeys(value.final, ['participantCount', 'participants', 'local', 'fatalRuntimeErrorCategories'])) return { envelope: null, error: 'invalid final summary' };
  if (!integer(value.final.participantCount, 1, MATCH_DIAGNOSTIC_MAX_PARTICIPANTS)
    || !Array.isArray(value.final.participants) || value.final.participants.length !== value.final.participantCount
    || value.final.participants.some((participant) => !validateParticipant(participant))
    || new Set(value.final.participants.map((participant) => participant.participant)).size !== value.final.participants.length) return { envelope: null, error: 'invalid participants' };
  if (!isRecord(value.final.local) || !hasOnlyKeys(value.final.local, ['kills', 'deaths', 'shotsFired', 'hitShots', 'damageDealt', 'damageTaken', 'headshots'])) return { envelope: null, error: 'invalid local summary' };
  const local = value.final.local;
  if (!integer(local.kills, 0, 1_000_000) || !integer(local.deaths, 0, 1_000_000)
    || !integer(local.shotsFired, 0, 1_000_000) || !integer(local.hitShots, 0, 1_000_000) || local.hitShots > local.shotsFired
    || !integer(local.damageDealt, 0, 10_000_000) || !integer(local.damageTaken, 0, 10_000_000)
    || !integer(local.headshots, 0, 1_000_000) || local.headshots > local.hitShots) return { envelope: null, error: 'invalid local values' };
  if (!Array.isArray(value.final.fatalRuntimeErrorCategories) || value.final.fatalRuntimeErrorCategories.length > 5
    || value.final.fatalRuntimeErrorCategories.some((category) => !oneOf(MATCH_DIAGNOSTIC_FATAL_CATEGORIES, category))) return { envelope: null, error: 'invalid fatal categories' };
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.byteLength > MATCH_DIAGNOSTIC_MAX_BODY_BYTES) return { envelope: null, error: 'body too large' };
  return { envelope: value as unknown as MatchDiagnosticUploadEnvelope, error: null };
}
