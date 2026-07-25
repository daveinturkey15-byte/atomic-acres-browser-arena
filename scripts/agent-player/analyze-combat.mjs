#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function elapsedSeconds(label) {
  const match = String(label ?? '').match(/^(\d+):(\d{2})(?:\.(\d))?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] ?? 0) / 10;
}

export function contactClusters(events, gapSeconds = 5) {
  const times = events
    .map((event) => elapsedSeconds(event.at))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (times.length === 0) return [];
  const clusters = [[times[0]]];
  for (const time of times.slice(1)) {
    const current = clusters.at(-1);
    if (time - current.at(-1) > gapSeconds) clusters.push([time]);
    else current.push(time);
  }
  return clusters.map((cluster) => ({
    firstAtSeconds: cluster[0],
    lastAtSeconds: cluster.at(-1),
    eventCount: cluster.length,
  }));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function ratio(numerator, denominator, places = 3) {
  if (!denominator) return null;
  const scale = 10 ** places;
  return Math.round(numerator / denominator * scale) / scale;
}

export function analyseCombat(summary, driverReport, callsign = 'Jigglyclaw') {
  const stats = summary?.stats ?? {};
  const events = Array.isArray(summary?.damageTimeline) ? summary.damageTimeline : [];
  const outgoing = events.filter((event) => event.from === callsign);
  const incoming = events.filter((event) => event.to === callsign);
  const outgoingClusters = contactClusters(outgoing);
  const incomingClusters = contactClusters(incoming);
  const participants = Array.isArray(summary?.participants) ? summary.participants : [];
  const player = participants.find((participant) => participant.name === callsign) ?? null;
  const opponents = participants.filter((participant) => participant.name !== callsign);
  const shotsFired = numeric(stats.shotsFired);
  const shotsHit = numeric(stats.shotsHit);
  const kills = numeric(stats.kills);
  const durationSeconds = numeric(summary?.match?.durationSeconds);
  const outgoingDamage = outgoing.reduce((sum, event) => sum + numeric(event.damage), 0);
  const incomingDamage = incoming.reduce((sum, event) => sum + numeric(event.damage), 0);
  const outgoingDistances = outgoing.map((event) => numeric(event.distanceMeters)).filter((value) => value > 0);
  const incomingDistances = incoming.map((event) => numeric(event.distanceMeters)).filter((value) => value > 0);
  const hitZones = Object.fromEntries([...new Set(outgoing.map((event) => event.hitZone ?? 'unknown'))]
    .map((zone) => [zone, outgoing.filter((event) => (event.hitZone ?? 'unknown') === zone).length]));

  return {
    schemaVersion: 1,
    kind: 'atomic-player-combat-baseline',
    source: {
      build: summary?.build ?? driverReport?.source?.pass ?? null,
      pass: driverReport?.source?.pass ?? null,
      arena: summary?.match?.arena ?? driverReport?.outcome?.arena ?? null,
      durationSeconds,
      callsign,
    },
    result: {
      headline: summary?.match?.result ?? null,
      kills,
      deaths: numeric(stats.deaths),
      killDeathRatio: numeric(stats.killDeathRatio),
      shotsFired,
      shotsHit,
      accuracyPercent: numeric(stats.accuracyPercent),
      damageDealt: numeric(stats.damageDealt),
      damageTaken: numeric(stats.damageTaken),
      headshots: numeric(stats.headshots),
      bestKillstreak: numeric(stats.bestKillstreak),
      shotsPerKill: kills > 0 ? ratio(shotsFired, kills, 2) : null,
      damagePerShot: ratio(numeric(stats.damageDealt), shotsFired, 2),
      hitsPerKill: kills > 0 ? ratio(shotsHit, kills, 2) : null,
      survivedAtEnd: player?.finalHealth === undefined ? null : numeric(player.finalHealth) > 0,
    },
    contacts: {
      outgoingDamageEvents: outgoing.length,
      incomingDamageEvents: incoming.length,
      outgoingContactWindows: outgoingClusters.length,
      incomingContactWindows: incomingClusters.length,
      firstOutgoingHitAtSeconds: outgoingClusters[0]?.firstAtSeconds ?? null,
      firstIncomingHitAtSeconds: incomingClusters[0]?.firstAtSeconds ?? null,
      outgoingDamageFromTimeline: Math.round(outgoingDamage * 10) / 10,
      incomingDamageFromTimeline: Math.round(incomingDamage * 10) / 10,
      medianOutgoingDistanceMeters: median(outgoingDistances),
      medianIncomingDistanceMeters: median(incomingDistances),
      hitZones,
      opponents: opponents.map((opponent) => ({
        name: opponent.name,
        kind: opponent.kind,
        kills: numeric(opponent.kills),
        deaths: numeric(opponent.deaths),
        damageDealt: numeric(opponent.damageDealt),
        damageTaken: numeric(opponent.damageTaken),
        finalHealth: opponent.finalHealth ?? null,
      })),
    },
    control: {
      pointerLock: Boolean(driverReport?.session?.pointerLock),
      performanceProfile: driverReport?.performance?.observedRenderProfile ?? null,
      webGlRenderer: driverReport?.performance?.webGlRenderer ?? null,
      visionFrames: numeric(driverReport?.performance?.visionFrames),
      targetFrames: numeric(driverReport?.performance?.targetFrames),
      targetFrameRatio: numeric(driverReport?.performance?.targetFrameRatio),
      sourceFps: driverReport?.performance?.visionStream?.sourceFps ?? null,
      aimMoves: numeric(driverReport?.input?.aimMoves),
      shotPulses: numeric(driverReport?.input?.shotPulses),
      releasedAtEnd: Boolean(driverReport?.input?.releasedAtEnd),
      holdWatchdogExceeded: Boolean(driverReport?.input?.holdWatchdogExceeded),
      pageErrors: driverReport?.browser?.pageErrors ?? [],
    },
    interpretationInputs: {
      contactWindowGapSeconds: 5,
      damageTimelineComplete: summary?.match?.damageTimelineComplete ?? null,
      droppedDamageEvents: numeric(summary?.droppedDamageEvents),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const directory = resolve(valueAfter('--directory') ?? args[0] ?? '.');
  const summary = JSON.parse(await readFile(resolve(directory, 'match-summary.json'), 'utf8'));
  const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
  const result = analyseCombat(summary, report, valueAfter('--callsign') ?? 'Jigglyclaw');
  const outputPath = resolve(directory, valueAfter('--output') ?? 'combat-baseline.json');
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, result }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
