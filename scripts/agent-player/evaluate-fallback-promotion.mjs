#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [baselineGameId, candidateGameId] = process.argv.slice(2);
if (!/^G\d{4}$/.test(baselineGameId ?? '') || !/^G\d{4}$/.test(candidateGameId ?? '')) {
  console.error('Usage: node scripts/agent-player/evaluate-fallback-promotion.mjs G#### G####');
  process.exit(2);
}

const gamesRoot = resolve('artifacts', 'agent-player', 'archive', 'games');

async function loadGame(gameId) {
  const directory = resolve(gamesRoot, gameId);
  const [benchmark, manifest] = await Promise.all([
    readFile(resolve(directory, 'combat-benchmark.json'), 'utf8').then(JSON.parse),
    readFile(resolve(directory, 'manifest.json'), 'utf8').then(JSON.parse),
  ]);
  return { gameId, benchmark, manifest };
}

function compare(metric, baseline, candidate, direction) {
  const pass = direction === 'higher-or-equal' ? candidate >= baseline : candidate <= baseline;
  return { metric, direction, baseline, candidate, delta: candidate - baseline, pass };
}

async function main() {
  const [baseline, candidate] = await Promise.all([loadGame(baselineGameId), loadGame(candidateGameId)]);
  const b = baseline.benchmark;
  const c = candidate.benchmark;
  const checks = [
    compare('result.killDeathRatio', b.result.killDeathRatio, c.result.killDeathRatio, 'higher-or-equal'),
    compare('result.kills', b.result.kills, c.result.kills, 'higher-or-equal'),
    compare('result.deaths', b.result.deaths, c.result.deaths, 'lower-or-equal'),
    compare('result.accuracyPercent', b.result.accuracyPercent, c.result.accuracyPercent, 'higher-or-equal'),
    compare('result.damageDealt', b.result.damageDealt, c.result.damageDealt, 'higher-or-equal'),
    compare('result.damageTaken', b.result.damageTaken, c.result.damageTaken, 'lower-or-equal'),
    compare('result.bestKillstreak', b.result.bestKillstreak, c.result.bestKillstreak, 'higher-or-equal'),
    compare('contacts.nonBotDamageEvents', b.contacts.nonBotDamageEvents, c.contacts.nonBotDamageEvents, 'lower-or-equal'),
    compare('control.unconfirmedShotPulses', b.control.unconfirmedShotPulses, c.control.unconfirmedShotPulses, 'lower-or-equal'),
  ];
  const invariants = [
    { metric: 'manifest.completed', expected: true, actual: candidate.manifest.completed },
    { metric: 'manifest.counted', expected: true, actual: candidate.manifest.counted },
    { metric: 'manifest.absoluteHardFailures.length', expected: 0, actual: candidate.manifest.absoluteHardFailures.length },
    { metric: 'control.pointerLock', expected: true, actual: c.control.pointerLock },
    { metric: 'control.releasedAtEnd', expected: true, actual: c.control.releasedAtEnd },
    { metric: 'control.holdWatchdogExceeded', expected: false, actual: c.control.holdWatchdogExceeded },
    { metric: 'integrity.matchEndedObserved', expected: true, actual: c.integrity.matchEndedObserved },
  ].map((item) => ({ ...item, pass: item.actual === item.expected }));

  const regressions = checks.filter((check) => !check.pass);
  const invariantFailures = invariants.filter((check) => !check.pass);
  const promote = regressions.length === 0 && invariantFailures.length === 0;
  console.log(JSON.stringify({
    ok: true,
    promote,
    rule: 'Zero-regression promotion: all core combat metrics must match or beat the fallback and all safety/integrity invariants must pass.',
    baselineGameId,
    candidateGameId,
    regressions,
    invariantFailures,
    checks,
    invariants,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
