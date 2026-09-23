import type { HumanDamageEventInput } from './match-report';
import { isArenaId, type ArenaId } from './arena-identity';

export const LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY = 'atomic-acres:last-completed-multiplayer-diagnostic:v1';
export const LAST_MULTIPLAYER_DIAGNOSTIC_SCHEMA_VERSION = 1;
export const LAST_MULTIPLAYER_DAMAGE_EVENT_LIMIT = 64;

const MODES = ['tdm', 'ffa'] as const;
const ROLES = ['host', 'guest'] as const;
const KINDS = ['player', 'hosted-bot', 'solo-bot', 'environment', 'unknown'] as const;
const SOURCES = ['railgun', 'firearm', 'grenade', 'melee', 'support', 'environment', 'other'] as const;

type Mode = typeof MODES[number];
type Role = typeof ROLES[number];
type Kind = typeof KINDS[number];
type Source = typeof SOURCES[number];

export type SanitizedDamageEvent = Readonly<{
  elapsedMs: number;
  source: Source;
  actorKind: Kind;
  targetKind: Kind;
  actorPerspective: 'local' | 'other';
  targetPerspective: 'local' | 'other';
  damage: number;
  healthBefore: number;
  healthAfter: number;
  wallbang: boolean;
}>;

export type LastMultiplayerDiagnostic = Readonly<{
  schemaVersion: typeof LAST_MULTIPLAYER_DIAGNOSTIC_SCHEMA_VERSION;
  completedAtEpochMinute: number;
  arena: ArenaId;
  mode: Mode;
  role: Role;
  protocolVersion: number;
  durationMs: number;
  participantCount: number;
  local: Readonly<{
    kills: number;
    deaths: number;
    shotsFired: number;
    hitShots: number;
    damageDealt: number;
    damageTaken: number;
    headshots: number;
  }>;
  network: Readonly<{
    rttMs: number | null;
    clockOffsetMs: number;
    interpolationDelayMs: number;
    receiverSequenceGaps: number;
    receiverReordered: number;
    droppedDamageEvents: number;
  }>;
  recentDamage: readonly SanitizedDamageEvent[];
}>;

export type LastMultiplayerDiagnosticInput = Readonly<{
  completedAtEpochMs: number;
  arena: string;
  mode: string;
  role: string;
  protocolVersion: number;
  durationMs: number;
  participantCount: number;
  localPlayerName: string;
  local: LastMultiplayerDiagnostic['local'];
  network: LastMultiplayerDiagnostic['network'];
  damageTimeline: readonly HumanDamageEventInput[];
}>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function count(value: number, maximum = 1_000_000): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
}

function decimal(value: number, minimum: number, maximum: number, places = 1): number {
  if (!Number.isFinite(value)) return minimum;
  const scale = 10 ** places;
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * scale) / scale;
}

function oneOf<T extends readonly string[]>(values: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function kind(value: string): Kind {
  return oneOf(KINDS, value, 'unknown');
}

function source(value: string): Source {
  if ((SOURCES as readonly string[]).includes(value)) return value as Source;
  if (value === 'railgun') return 'railgun';
  if (value === 'grenade') return 'grenade';
  if (value === 'melee') return 'melee';
  if (value === 'environment' || value === 'fall') return 'environment';
  if (value === 'yardhawk' || value === 'tri-pass' || value === 'hunter-swarm' || value === 'nuke') return 'support';
  if (value === 'carbine' || value === 'smg' || value === 'lmg' || value === 'scattergun' || value === 'sniper'
    || value === 'pistol' || value === 'machine-pistol' || value === 'magnum') return 'firearm';
  return 'other';
}

function sanitizeDamageEvent(event: HumanDamageEventInput, localPlayerName: string, durationMs: number): SanitizedDamageEvent {
  return {
    elapsedMs: decimal(event.elapsedMs, 0, durationMs, 1),
    source: source(event.source),
    actorKind: kind(event.fromKind),
    targetKind: kind(event.toKind),
    actorPerspective: event.from === localPlayerName ? 'local' : 'other',
    targetPerspective: event.to === localPlayerName ? 'local' : 'other',
    damage: decimal(event.damage, 0, 1_000, 1),
    healthBefore: decimal(event.healthBefore, 0, 100, 1),
    healthAfter: decimal(event.healthAfter, 0, 100, 1),
    wallbang: event.wallbang === true,
  };
}

export function createLastMultiplayerDiagnostic(input: LastMultiplayerDiagnosticInput): LastMultiplayerDiagnostic {
  const durationMs = count(input.durationMs, 3_600_000);
  const shotsFired = count(input.local.shotsFired, 1_000_000);
  return {
    schemaVersion: LAST_MULTIPLAYER_DIAGNOSTIC_SCHEMA_VERSION,
    completedAtEpochMinute: Math.floor(Math.max(0, Number.isFinite(input.completedAtEpochMs) ? input.completedAtEpochMs : 0) / 60_000) * 60_000,
    arena: isArenaId(input.arena) ? input.arena : 'atomic-acres',
    mode: oneOf(MODES, input.mode, 'tdm'),
    role: oneOf(ROLES, input.role, 'guest'),
    protocolVersion: count(input.protocolVersion, 1_000),
    durationMs,
    participantCount: count(input.participantCount, 10),
    local: {
      kills: count(input.local.kills),
      deaths: count(input.local.deaths),
      shotsFired,
      hitShots: Math.min(shotsFired, count(input.local.hitShots)),
      damageDealt: count(input.local.damageDealt),
      damageTaken: count(input.local.damageTaken),
      headshots: count(input.local.headshots),
    },
    network: {
      rttMs: input.network.rttMs === null ? null : decimal(input.network.rttMs, 0, 60_000),
      clockOffsetMs: decimal(input.network.clockOffsetMs, -60_000, 60_000),
      interpolationDelayMs: decimal(input.network.interpolationDelayMs, 0, 5_000),
      receiverSequenceGaps: count(input.network.receiverSequenceGaps, 1_000_000),
      receiverReordered: count(input.network.receiverReordered, 1_000_000),
      droppedDamageEvents: count(input.network.droppedDamageEvents, 1_000_000),
    },
    recentDamage: input.damageTimeline
      .slice(-LAST_MULTIPLAYER_DAMAGE_EVENT_LIMIT)
      .map((event) => sanitizeDamageEvent(event, input.localPlayerName, durationMs)),
  };
}

export function saveLastMultiplayerDiagnostic(summary: LastMultiplayerDiagnostic, storage: StorageLike | undefined): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(summary));
    return true;
  } catch {
    return false;
  }
}

export function loadLastMultiplayerDiagnostic(storage: StorageLike | undefined): LastMultiplayerDiagnostic | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(LAST_MULTIPLAYER_DIAGNOSTIC_STORAGE_KEY);
    if (!value) return null;
    const candidate = JSON.parse(value) as LastMultiplayerDiagnostic;
    if (candidate.schemaVersion !== LAST_MULTIPLAYER_DIAGNOSTIC_SCHEMA_VERSION
      || !isArenaId(candidate.arena) || !MODES.includes(candidate.mode) || !ROLES.includes(candidate.role)
      || !Array.isArray(candidate.recentDamage) || candidate.recentDamage.length > LAST_MULTIPLAYER_DAMAGE_EVENT_LIMIT) return null;
    return createLastMultiplayerDiagnostic({
      completedAtEpochMs: candidate.completedAtEpochMinute,
      arena: candidate.arena,
      mode: candidate.mode,
      role: candidate.role,
      protocolVersion: candidate.protocolVersion,
      durationMs: candidate.durationMs,
      participantCount: candidate.participantCount,
      localPlayerName: 'local',
      local: candidate.local,
      network: candidate.network,
      damageTimeline: candidate.recentDamage.map((event) => ({
        elapsedMs: event.elapsedMs,
        timestamp: '',
        from: event.actorPerspective,
        fromKind: event.actorKind,
        to: event.targetPerspective,
        toKind: event.targetKind,
        damage: event.damage,
        healthBefore: event.healthBefore,
        healthAfter: event.healthAfter,
        source: event.source,
        wallbang: event.wallbang,
      })),
    });
  } catch {
    return null;
  }
}
