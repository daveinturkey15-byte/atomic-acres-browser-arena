export const MATCH_REPORT_SCHEMA_VERSION = 2;

export type MatchParticipantReportInput = Readonly<{
  name: string;
  kind: 'player' | 'hosted-bot' | 'solo-bot';
  team?: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  finalHealth?: number;
  score?: number;
  shots?: number;
  hits?: number;
}>;

export type HumanDamageEventInput = Readonly<{
  elapsedMs: number;
  timestamp: string;
  from: string;
  fromKind: string;
  to: string;
  toKind: string;
  damage: number;
  healthBefore: number;
  healthAfter: number;
  source: string;
  hitZone?: string;
  critical?: boolean;
  wallbang?: boolean;
  penetrationMultiplier?: number;
  distanceMeters?: number;
}>;

export type MatchReportInput = Readonly<{
  build: string;
  arena: string;
  mode: string;
  role?: 'offline' | 'host' | 'guest';
  result: string;
  durationMs: number;
  kills: number;
  deaths: number;
  shotsFired: number;
  hitShots: number;
  damageDealt: number;
  damageTaken: number;
  headshots: number;
  bestKillstreak: number;
  completedAt: string;
  participants?: readonly MatchParticipantReportInput[];
  damageTimeline?: readonly HumanDamageEventInput[];
  droppedDamageEvents?: number;
}>;

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function decimal(value: number, places = 1): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function elapsedLabel(elapsedMs: number): string {
  const totalTenths = Math.max(0, Math.floor(elapsedMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor(totalTenths / 10) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${totalTenths % 10}`;
}

function safeText(value: string, limit: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit);
}

export function createHumanMatchReport(input: MatchReportInput): { filename: string; json: string } {
  const shotsFired = count(input.shotsFired);
  const hitShots = Math.min(shotsFired, count(input.hitShots));
  const kills = count(input.kills);
  const deaths = count(input.deaths);
  const completedAt = Number.isNaN(Date.parse(input.completedAt)) ? new Date(0).toISOString() : input.completedAt;
  const participants = (input.participants ?? []).slice(0, 32).map((participant) => {
    const shots = count(participant.shots ?? 0);
    const hits = Math.min(shots, count(participant.hits ?? 0));
    return {
      name: safeText(participant.name, 48),
      kind: participant.kind,
      ...(participant.team ? { team: safeText(participant.team, 24) } : {}),
      kills: count(participant.kills),
      deaths: count(participant.deaths),
      damageDealt: count(participant.damageDealt),
      damageTaken: count(participant.damageTaken),
      ...(participant.finalHealth === undefined ? {} : { finalHealth: decimal(participant.finalHealth) }),
      ...(participant.score === undefined ? {} : { score: count(participant.score) }),
      ...(participant.shots === undefined ? {} : {
        shots,
        hits,
        accuracyPercent: shots === 0 ? 0 : decimal(hits / shots * 100),
      }),
    };
  });
  const damageTimeline = (input.damageTimeline ?? []).slice(0, 8_192).map((event) => ({
    at: elapsedLabel(event.elapsedMs),
    timestamp: Number.isNaN(Date.parse(event.timestamp)) ? completedAt : event.timestamp,
    from: safeText(event.from, 48),
    fromKind: safeText(event.fromKind, 24),
    to: safeText(event.to, 48),
    toKind: safeText(event.toKind, 24),
    damage: decimal(Math.max(0, event.damage)),
    source: safeText(event.source, 48),
    health: `${decimal(event.healthBefore)} -> ${decimal(event.healthAfter)} HP`,
    ...(event.hitZone ? { hitZone: safeText(event.hitZone, 20) } : {}),
    ...(event.critical ? { critical: true } : {}),
    ...(event.wallbang ? { wallbang: true } : {}),
    ...(event.penetrationMultiplier === undefined ? {} : { penetrationMultiplier: decimal(event.penetrationMultiplier, 3) }),
    ...(event.distanceMeters === undefined ? {} : { distanceMeters: decimal(event.distanceMeters) }),
  }));
  const report = {
    schemaVersion: MATCH_REPORT_SCHEMA_VERSION,
    reportType: 'human-readable-match-summary',
    build: safeText(input.build, 80),
    match: {
      arena: safeText(input.arena, 80),
      mode: safeText(input.mode, 40),
      dataAuthority: input.role ?? 'offline',
      damageTimelineComplete: input.role !== 'guest',
      result: safeText(input.result, 120),
      completedAt,
      durationSeconds: decimal(Math.max(0, input.durationMs) / 1_000),
    },
    stats: {
      kills,
      deaths,
      killDeathRatio: decimal(kills / Math.max(1, deaths), 2),
      shotsFired,
      shotsHit: hitShots,
      accuracyPercent: shotsFired === 0 ? 0 : decimal(hitShots / shotsFired * 100),
      damageDealt: count(input.damageDealt),
      damageTaken: count(input.damageTaken),
      headshots: count(input.headshots),
      bestKillstreak: count(input.bestKillstreak),
    },
    participants,
    damageTimeline,
    droppedDamageEvents: count(input.droppedDamageEvents ?? 0),
    help: {
      overview: 'This file is designed for people. It contains the final scoreboard and a chronological damage timeline.',
      damageTimeline: input.role === 'guest'
        ? 'Guest timelines contain locally confirmed damage and may omit damage resolved only by the host. Use the host technical file for the complete authoritative ledger.'
        : 'at is time since match start; timestamp is local ISO time; health shows target health before and after the event.',
      technicalFile: 'Use the separate technical diagnostics JSON for the larger machine-readable event ledger and runtime context.',
    },
  };
  const stamp = completedAt.replace(/[:.]/g, '-');
  return { filename: `atomic-acres-match-summary-${stamp}.json`, json: JSON.stringify(report, null, 2) };
}
