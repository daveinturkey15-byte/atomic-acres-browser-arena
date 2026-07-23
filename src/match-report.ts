export const MATCH_REPORT_SCHEMA_VERSION = 1;

export type MatchReportInput = Readonly<{
  build: string;
  arena: string;
  mode: string;
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
}>;

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function createHumanMatchReport(input: MatchReportInput): { filename: string; json: string } {
  const shotsFired = count(input.shotsFired);
  const hitShots = Math.min(shotsFired, count(input.hitShots));
  const kills = count(input.kills);
  const deaths = count(input.deaths);
  const completedAt = Number.isNaN(Date.parse(input.completedAt)) ? new Date(0).toISOString() : input.completedAt;
  const report = {
    schemaVersion: MATCH_REPORT_SCHEMA_VERSION,
    reportType: 'human-readable-match-summary',
    build: input.build.slice(0, 80),
    match: {
      arena: input.arena.slice(0, 80),
      mode: input.mode.slice(0, 40),
      result: input.result.slice(0, 120),
      completedAt,
      durationSeconds: Math.round(Math.max(0, input.durationMs) / 100) / 10,
    },
    stats: {
      kills,
      deaths,
      killDeathRatio: Math.round((kills / Math.max(1, deaths)) * 100) / 100,
      shotsFired,
      shotsHit: hitShots,
      accuracyPercent: shotsFired === 0 ? 0 : Math.round((hitShots / shotsFired) * 1_000) / 10,
      damageDealt: count(input.damageDealt),
      damageTaken: count(input.damageTaken),
      headshots: count(input.headshots),
      bestKillstreak: count(input.bestKillstreak),
    },
    help: 'Share this summary for an easy match overview. Share the separate technical diagnostics JSON when reporting a bug.',
  };
  const stamp = completedAt.replace(/[:.]/g, '-');
  return { filename: `atomic-acres-match-summary-${stamp}.json`, json: JSON.stringify(report, null, 2) };
}
