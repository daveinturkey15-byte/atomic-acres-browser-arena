#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function optionalNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numeric(value) {
  return optionalNumeric(value) ?? 0;
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

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function ratio(numerator, denominator, places = 3) {
  if (!denominator) return null;
  const scale = 10 ** places;
  return Math.round(numerator / denominator * scale) / scale;
}

function targetHealthAfter(event) {
  const structured = optionalNumeric(event?.targetHealthAfter ?? event?.healthAfter);
  if (structured !== null) return structured;
  const match = String(event?.health ?? '').match(/(?:->|→)\s*([0-9]+(?:\.[0-9]+)?)\s*HP$/i);
  return match ? Number(match[1]) : null;
}

function completedLives(incoming, durationSeconds) {
  const deathTimes = incoming
    .filter((event) => targetHealthAfter(event) === 0)
    .map((event) => elapsedSeconds(event.at))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  const durations = [];
  let previous = 0;
  for (const time of deathTimes) {
    durations.push(Math.max(0, time - previous));
    previous = time;
  }
  return {
    deathTimes,
    durations,
    finalCensoredLifeSeconds: durationSeconds > 0 ? Math.max(0, durationSeconds - previous) : null,
  };
}

export function analyseCombat(summary, driverReport, callsign = 'Jigglyclaw') {
  const stats = summary?.stats ?? {};
  const events = Array.isArray(summary?.damageTimeline) ? summary.damageTimeline : [];
  const outgoing = events.filter((event) => event.from === callsign);
  const incoming = events.filter((event) => event.to === callsign);
  const participants = Array.isArray(summary?.participants) ? summary.participants : [];
  const player = participants.find((participant) => participant.name === callsign) ?? null;
  const opponents = participants.filter((participant) => participant.name !== callsign);
  const botNames = new Set(opponents.filter((participant) => /bot/i.test(String(participant.kind))).map((participant) => participant.name));
  const outgoingBot = outgoing.filter((event) => botNames.has(event.to));
  const outgoingNonBot = outgoing.filter((event) => !botNames.has(event.to));
  const outgoingClusters = contactClusters(outgoingBot);
  const incomingClusters = contactClusters(incoming);
  const shotsFired = numeric(stats.shotsFired);
  const shotsHit = numeric(stats.shotsHit);
  const kills = numeric(stats.kills);
  const durationSeconds = numeric(summary?.match?.durationSeconds);
  const outgoingBotDamage = outgoingBot.reduce((sum, event) => sum + numeric(event.damage), 0);
  const incomingDamage = incoming.reduce((sum, event) => sum + numeric(event.damage), 0);
  const outgoingDistances = outgoingBot.map((event) => numeric(event.distanceMeters)).filter((value) => value > 0);
  const incomingDistances = incoming.map((event) => numeric(event.distanceMeters)).filter((value) => value > 0);
  const hitZones = Object.fromEntries([...new Set(outgoingBot.map((event) => event.hitZone ?? 'unknown'))]
    .map((zone) => [zone, outgoingBot.filter((event) => (event.hitZone ?? 'unknown') === zone).length]));
  const lives = completedLives(incoming, durationSeconds);
  const visionFrames = numeric(driverReport?.performance?.visionFrames);
  const activeVisionFrames = numeric(driverReport?.performance?.activeVisionFrames ?? driverReport?.performance?.visionFrames);
  const rawTargetFrames = numeric(driverReport?.performance?.rawTargetFrames ?? driverReport?.performance?.targetFrames);
  const confirmedTargetFrames = optionalNumeric(driverReport?.performance?.confirmedTargetFrames);
  const captureDurations = driverReport?.performance?.visionStream?.captureMs ?? {};

  return {
    schemaVersion: 2,
    kind: 'atomic-player-combat-benchmark',
    source: {
      build: summary?.build ?? driverReport?.source?.pass ?? null,
      pass: driverReport?.source?.pass ?? null,
      url: driverReport?.source?.url ?? null,
      arena: summary?.match?.arena ?? driverReport?.outcome?.arena ?? null,
      mode: summary?.match?.mode ?? driverReport?.session?.mode ?? null,
      durationSeconds,
      callsign,
      harnessGitSha: driverReport?.source?.harnessGitSha ?? driverReport?.source?.gitSha ?? null,
      completedAt: summary?.match?.completedAt ?? driverReport?.endedAt ?? null,
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
      finalHealthPositive: player?.finalHealth === undefined ? null : numeric(player.finalHealth) > 0,
    },
    survival: {
      firstIncomingDamageAtSeconds: incomingClusters[0]?.firstAtSeconds ?? null,
      firstDeathAtSeconds: lives.deathTimes[0] ?? null,
      completedLives: lives.durations.length,
      medianCompletedLifeSeconds: median(lives.durations),
      longestCompletedLifeSeconds: lives.durations.length > 0 ? Math.max(...lives.durations) : null,
      shortestCompletedLifeSeconds: lives.durations.length > 0 ? Math.min(...lives.durations) : null,
      finalCensoredLifeSeconds: lives.finalCensoredLifeSeconds,
    },
    contacts: {
      creditedBotDamageEvents: outgoingBot.length,
      nonBotDamageEvents: outgoingNonBot.length,
      incomingDamageEvents: incoming.length,
      outgoingContactWindows: outgoingClusters.length,
      incomingContactWindows: incomingClusters.length,
      firstCreditedBotHitAtSeconds: outgoingClusters[0]?.firstAtSeconds ?? null,
      firstIncomingHitAtSeconds: incomingClusters[0]?.firstAtSeconds ?? null,
      creditedBotDamageFromTimeline: Math.round(outgoingBotDamage * 10) / 10,
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
    perception: {
      visionFrames,
      activeVisionFrames,
      rawTargetFrames,
      confirmedTargetFrames,
      rawTargetFrameRatio: ratio(rawTargetFrames, activeVisionFrames, 5),
      confirmedTargetFrameRatio: confirmedTargetFrames === null ? null : ratio(confirmedTargetFrames, activeVisionFrames, 5),
      confirmedToRawRatio: confirmedTargetFrames === null ? null : ratio(confirmedTargetFrames, rawTargetFrames, 5),
      rejectedScreenLockedFrames: optionalNumeric(driverReport?.performance?.rejectedScreenLockedFrames),
      sourceFps: optionalNumeric(driverReport?.performance?.visionStream?.sourceFps),
      decisionFps: optionalNumeric(driverReport?.performance?.decisionFps),
      captureFailures: numeric(driverReport?.performance?.visionStream?.failedFrames),
      captureMinimumMs: optionalNumeric(captureDurations.minimum),
      captureMedianMs: optionalNumeric(captureDurations.median),
      captureP95Ms: optionalNumeric(captureDurations.p95),
      captureMaximumMs: optionalNumeric(captureDurations.maximum),
      decodeMedianMs: optionalNumeric(driverReport?.performance?.visionLoopMs?.median),
      decodeP95Ms: optionalNumeric(driverReport?.performance?.visionLoopMs?.p95),
    },
    control: {
      gameFps: optionalNumeric(driverReport?.performance?.fpsCounter?.value),
      gameCadenceHz: optionalNumeric(driverReport?.performance?.framePacing?.cadenceHz),
      pointerLock: Boolean(driverReport?.session?.pointerLock),
      performanceProfile: driverReport?.performance?.observedRenderProfile ?? null,
      webGlRenderer: driverReport?.performance?.webGlRenderer ?? null,
      aimMoves: numeric(driverReport?.input?.aimMoves),
      shotPulses: numeric(driverReport?.input?.shotPulses),
      bursts: optionalNumeric(driverReport?.input?.bursts),
      warmupShotPulses: optionalNumeric(driverReport?.input?.warmupShotPulses),
      unconfirmedShotPulses: optionalNumeric(driverReport?.input?.unconfirmedShotPulses),
      reloadRequests: optionalNumeric(driverReport?.input?.reloadRequests),
      stuckRecoveries: optionalNumeric(driverReport?.input?.stuckRecoveries),
      damageReactions: optionalNumeric(driverReport?.input?.damageReactions),
      maximumObservedHoldMs: optionalNumeric(driverReport?.input?.maximumObservedHoldMs),
      configuredMaxHoldMs: optionalNumeric(driverReport?.input?.configuredMaxHoldMs),
      releasedAtEnd: Boolean(driverReport?.input?.releasedAtEnd),
      holdWatchdogExceeded: Boolean(driverReport?.input?.holdWatchdogExceeded),
      pageErrors: driverReport?.browser?.pageErrors ?? [],
      browserWarnings: numeric(driverReport?.browser?.warningOrErrorCount),
    },
    integrity: {
      matchEndedObserved: Boolean(driverReport?.outcome?.matchEndedObserved),
      summaryDownloaded: Boolean(driverReport?.outcome?.downloadedSummary),
      technicalDownloaded: Boolean(driverReport?.outcome?.downloadedTechnical),
      damageTimelineComplete: summary?.match?.damageTimelineComplete ?? null,
      droppedDamageEvents: numeric(summary?.droppedDamageEvents),
      captureMode: driverReport?.performance?.visionStream?.mode ?? null,
      forbiddenInputsUsed: driverReport?.fairness?.forbiddenInputsUsed ?? [],
    },
    interpretationInputs: {
      contactWindowGapSeconds: 5,
      lifeDurationsUseCreditedZeroHealthIncomingEvents: true,
      finalLifeIsCensored: true,
      nonBotDamageExcludedFromCombatContacts: true,
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
  const outputPath = resolve(directory, valueAfter('--output') ?? 'combat-benchmark.json');
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, result }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
