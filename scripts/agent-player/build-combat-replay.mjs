#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function parseMatchSeconds(value) {
  const match = String(value ?? '').match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) throw new Error(`Invalid match time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function reticleInsideBounds(bounds, x = 160, y = 90, inset = 0) {
  if (!bounds) return false;
  return x >= Number(bounds.minX) + inset
    && x <= Number(bounds.maxX) - inset
    && y >= Number(bounds.minY) + inset
    && y <= Number(bounds.maxY) - inset;
}

function argsFrom(argv) {
  const out = { games: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output') out.output = argv[++index];
    else if (/^G\d{4}$/.test(token)) out.games.push(token);
    else throw new Error(`Unexpected argument: ${token}`);
  }
  if (out.games.length === 0) out.games = ['G0031', 'G0041', 'G0043', 'G0059', 'G0071'];
  return out;
}

function finalMotionProxy(trace = []) {
  if (trace.length < 2) return null;
  const before = trace.at(-2);
  const after = trace.at(-1);
  const sequenceDelta = Math.max(1, Number(after.sourceSequence ?? 0) - Number(before.sourceSequence ?? 0));
  return Math.hypot(Number(after.x) - Number(before.x), Number(after.y) - Number(before.y)) / sequenceDelta;
}

function resultKind(event) {
  return /->\s*0(?:\.0+)?\s*HP/i.test(String(event.health ?? '')) ? 'kill' : 'hit';
}

async function loadGame(archiveRoot, gameId) {
  const root = resolve(archiveRoot, gameId);
  const [summary, telemetry, benchmark, policy] = await Promise.all([
    readFile(resolve(root, 'match-summary.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'telemetry.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'combat-benchmark.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'experiment-policy.json'), 'utf8').then(JSON.parse),
  ]);
  const actions = telemetry.actions ?? [];
  const matchEnd = actions.filter((action) => action.kind === 'match-end-visible').at(-1);
  if (!matchEnd) throw new Error(`${gameId}: missing match-end-visible action`);
  const matchOffsetMs = Number(matchEnd.atMs) - Number(summary.match.durationSeconds) * 1000;
  const outgoing = summary.damageTimeline
    .filter((event) => event.from === 'Jigglyclaw' && event.toKind === 'solo-bot')
    .map((event) => ({ ...event, matchSeconds: parseMatchSeconds(event.at), result: resultKind(event) }));
  const shots = actions.filter((action) => action.kind === 'operator-authorized-burst').map((action, index) => {
    const matchSeconds = (Number(action.atMs) - matchOffsetMs) / 1000;
    const matchedEvents = outgoing.filter((event) => event.matchSeconds - matchSeconds >= -0.12
      && event.matchSeconds - matchSeconds <= 0.35);
    const bounds = action.target?.bounds ?? null;
    const inferredAds = action.useAds ?? Number(action.alignment) < 0.012;
    return {
      shotIndex: index + 1,
      matchSeconds,
      alignment: Number(action.alignment),
      useAds: Boolean(inferredAds),
      targetPixels: Number(action.target?.pixels ?? 0),
      targetBounds: bounds,
      targetWidth: Number(bounds?.width ?? 0),
      targetHeight: Number(bounds?.height ?? 0),
      reticleInsideBounds: reticleInsideBounds(bounds),
      reticleInsideInset1: reticleInsideBounds(bounds, 160, 90, 1),
      strictAlignment008: Number(action.alignment) <= 0.008,
      strictOrInset1: Number(action.alignment) <= 0.008 || reticleInsideBounds(bounds, 160, 90, 1),
      trackAge: Number(action.trackAge ?? 0),
      stableFrames: Number(action.stableFrames ?? 0),
      causalSourceSequence: action.aimTrace?.at(-1)?.sourceSequence ?? null,
      motionProxyPixelsPerSequence: finalMotionProxy(action.aimTrace),
      matchedHit: matchedEvents.length > 0,
      matchedKill: matchedEvents.some((event) => event.result === 'kill'),
      matchedEvents: matchedEvents.map((event) => ({
        at: event.at,
        result: event.result,
        damage: event.damage,
        source: event.source,
        target: event.to,
        health: event.health,
      })),
    };
  });
  return {
    gameId,
    result: benchmark.result,
    configuration: policy.configuration ?? {},
    matchOffsetMs,
    shots,
  };
}

function summarize(shots) {
  const summarizeSubset = (subset) => ({
    shots: subset.length,
    matchedHits: subset.filter((shot) => shot.matchedHit).length,
    matchedKills: subset.filter((shot) => shot.matchedKill).length,
    matchedHitRatePercent: subset.length === 0 ? 0
      : Number((100 * subset.filter((shot) => shot.matchedHit).length / subset.length).toFixed(1)),
  });
  return {
    all: summarizeSubset(shots),
    strictAlignment008: summarizeSubset(shots.filter((shot) => shot.strictAlignment008)),
    strictOrInset1: summarizeSubset(shots.filter((shot) => shot.strictOrInset1)),
    ads: summarizeSubset(shots.filter((shot) => shot.useAds)),
    hip: summarizeSubset(shots.filter((shot) => !shot.useAds)),
  };
}

export async function buildCombatReplay(gameIds, options = {}) {
  const archiveRoot = resolve(options.archiveRoot ?? 'artifacts/agent-player/archive/games');
  const games = [];
  for (const gameId of gameIds) games.push(await loadGame(archiveRoot, gameId));
  const shots = games.flatMap((game) => game.shots.map((shot) => ({ gameId: game.gameId, ...shot })));
  return {
    schemaVersion: 1,
    kind: 'rendered-state-combat-replay',
    authority: {
      allowed: ['rendered target bounds', 'rendered reticle alignment', 'authorized input telemetry', 'official post-match damage timing'],
      unavailable: ['hidden enemy state', 'server-private target coordinates', 'per-bullet miss trajectories', 'authoritative miss impact points'],
      eventMatchWindowMs: { before: 120, after: 350 },
    },
    games: games.map((game) => ({
      gameId: game.gameId,
      result: game.result,
      configuration: game.configuration,
      summary: summarize(game.shots),
      shots: game.shots,
    })),
    aggregate: summarize(shots),
  };
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  const replay = await buildCombatReplay(args.games);
  const rendered = `${JSON.stringify(replay, null, 2)}\n`;
  if (args.output) {
    const output = resolve(args.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, rendered);
  }
  console.log(JSON.stringify({ ok: true, games: args.games, aggregate: replay.aggregate, output: args.output ?? null }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
