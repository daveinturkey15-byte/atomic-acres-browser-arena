#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const archiveRoot = resolve('artifacts', 'agent-player', 'archive', 'games');
const requestedGames = process.argv.slice(2).filter((value) => /^G\d{4}$/.test(value));
const gameIds = requestedGames.length > 0 ? requestedGames : ['G0031', 'G0041', 'G0043'];

function parseMatchSeconds(value) {
  const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(value));
  if (!match) throw new Error(`invalid match timestamp: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function alignmentBand(value) {
  if (value <= 0.008) return '<=0.008';
  if (value <= 0.012) return '0.008-0.012';
  if (value <= 0.020) return '0.012-0.020';
  return '>0.020';
}

function summarize(rows) {
  const total = rows.length;
  const hitBursts = rows.filter((row) => row.matchedHit).length;
  return {
    bursts: total,
    matchedHitBursts: hitBursts,
    matchedHitRatePercent: total > 0 ? Number((100 * hitBursts / total).toFixed(1)) : null,
    meanTargetPixels: total > 0 ? Number((rows.reduce((sum, row) => sum + row.targetPixels, 0) / total).toFixed(1)) : null,
  };
}

async function analyzeGame(gameId) {
  const directory = resolve(archiveRoot, gameId);
  const [benchmark, summary, telemetry] = await Promise.all([
    readFile(resolve(directory, 'combat-benchmark.json'), 'utf8').then(JSON.parse),
    readFile(resolve(directory, 'match-summary.json'), 'utf8').then(JSON.parse),
    readFile(resolve(directory, 'telemetry.json'), 'utf8').then(JSON.parse),
  ]);

  const endMarker = telemetry.actions.filter((action) => action.kind === 'match-end-visible').at(-1);
  if (!endMarker) throw new Error(`${gameId}: match-end-visible telemetry is missing`);
  const matchOffsetMs = endMarker.atMs - benchmark.source.durationSeconds * 1000;
  const outgoingDamageAtMs = summary.damageTimeline
    .filter((event) => event.from === benchmark.source.callsign && event.toKind === 'solo-bot')
    .map((event) => matchOffsetMs + parseMatchSeconds(event.at) * 1000);

  const rows = telemetry.actions
    .filter((action) => action.kind === 'operator-authorized-burst')
    .map((action) => {
      const matchingDeltasMs = outgoingDamageAtMs
        .map((timestamp) => timestamp - action.atMs)
        .filter((delta) => delta >= -100 && delta <= 300);
      return {
        gameId,
        atMs: action.atMs,
        alignment: action.alignment,
        band: alignmentBand(action.alignment),
        inferredAdsUnderFallback: action.alignment < 0.012,
        targetPixels: action.target?.pixels ?? 0,
        matchedHit: matchingDeltasMs.length > 0,
        nearestMatchedDamageMs: matchingDeltasMs.length > 0
          ? Math.round(matchingDeltasMs.reduce((best, value) => Math.abs(value) < Math.abs(best) ? value : best))
          : null,
      };
    });

  return {
    gameId,
    result: benchmark.result,
    matchOffsetMs: Number(matchOffsetMs.toFixed(1)),
    officialOutgoingDamageEvents: outgoingDamageAtMs.length,
    rows,
  };
}

async function main() {
  const games = [];
  for (const gameId of gameIds) games.push(await analyzeGame(gameId));
  const rows = games.flatMap((game) => game.rows);
  const byBand = Object.fromEntries(
    ['<=0.008', '0.008-0.012', '0.012-0.020', '>0.020']
      .map((band) => [band, summarize(rows.filter((row) => row.band === band))]),
  );
  const inferredAds = summarize(rows.filter((row) => row.inferredAdsUnderFallback));
  const inferredHipFire = summarize(rows.filter((row) => !row.inferredAdsUnderFallback));

  console.log(JSON.stringify({
    ok: true,
    claimState: {
      authority: 'post-run rendered telemetry plus official outgoing-damage timestamps',
      limitation: 'This is temporal matching, not an authoritative hidden bullet ray or impact coordinate.',
      matchingWindowMs: [-100, 300],
      historicalAdsRule: 'alignment < 0.012',
    },
    gameIds,
    officialTotals: {
      shots: games.reduce((sum, game) => sum + game.result.shotsFired, 0),
      hits: games.reduce((sum, game) => sum + game.result.shotsHit, 0),
      kills: games.reduce((sum, game) => sum + game.result.kills, 0),
      deaths: games.reduce((sum, game) => sum + game.result.deaths, 0),
    },
    byBand,
    inferredAds,
    inferredHipFire,
    games: games.map(({ rows, ...game }) => ({ ...game, burstSummary: summarize(rows) })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
