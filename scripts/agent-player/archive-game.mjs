#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { analyseCombat } from './analyze-combat.mjs';

export const METRIC_REGISTRY = Object.freeze([
  { key: 'combat.kills', path: 'result.kills', direction: 'higher' },
  { key: 'combat.deaths', path: 'result.deaths', direction: 'lower' },
  { key: 'combat.killDeathRatio', path: 'result.killDeathRatio', direction: 'higher' },
  { key: 'combat.shotsFired', path: 'result.shotsFired', direction: 'informational' },
  { key: 'combat.creditedHits', path: 'result.shotsHit', direction: 'higher' },
  { key: 'combat.accuracyPercent', path: 'result.accuracyPercent', direction: 'higher', tolerance: 0.05 },
  { key: 'combat.damageDealt', path: 'result.damageDealt', direction: 'higher' },
  { key: 'combat.damageTaken', path: 'result.damageTaken', direction: 'lower' },
  { key: 'combat.headshots', path: 'result.headshots', direction: 'higher' },
  { key: 'combat.bestKillstreak', path: 'result.bestKillstreak', direction: 'higher' },
  { key: 'combat.shotsPerKill', path: 'result.shotsPerKill', direction: 'lower' },
  { key: 'combat.damagePerShot', path: 'result.damagePerShot', direction: 'higher', tolerance: 0.01 },
  { key: 'survival.firstIncomingDamageSeconds', path: 'survival.firstIncomingDamageAtSeconds', direction: 'higher', tolerance: 0.1 },
  { key: 'survival.firstDeathSeconds', path: 'survival.firstDeathAtSeconds', direction: 'higher', tolerance: 0.1 },
  { key: 'survival.medianLifeSeconds', path: 'survival.medianCompletedLifeSeconds', direction: 'higher', tolerance: 0.1 },
  { key: 'survival.longestLifeSeconds', path: 'survival.longestCompletedLifeSeconds', direction: 'higher', tolerance: 0.1 },
  { key: 'contacts.creditedBotDamageEvents', path: 'contacts.creditedBotDamageEvents', direction: 'higher' },
  { key: 'contacts.nonBotDamageEvents', path: 'contacts.nonBotDamageEvents', direction: 'lower' },
  { key: 'contacts.firstCreditedBotHitSeconds', path: 'contacts.firstCreditedBotHitAtSeconds', direction: 'lower', tolerance: 0.1 },
  { key: 'contacts.creditedBotDamage', path: 'contacts.creditedBotDamageFromTimeline', direction: 'higher', tolerance: 0.1 },
  { key: 'perception.captureFps', path: 'perception.sourceFps', direction: 'higher', tolerance: 0.05 },
  { key: 'perception.decisionFps', path: 'perception.decisionFps', direction: 'higher', tolerance: 0.05 },
  { key: 'perception.captureFailures', path: 'perception.captureFailures', direction: 'lower' },
  { key: 'perception.captureMedianMs', path: 'perception.captureMedianMs', direction: 'lower', tolerance: 1 },
  { key: 'perception.captureP95Ms', path: 'perception.captureP95Ms', direction: 'lower', tolerance: 1 },
  { key: 'perception.decodeMedianMs', path: 'perception.decodeMedianMs', direction: 'lower', tolerance: 0.2 },
  { key: 'perception.rawTargetFrames', path: 'perception.rawTargetFrames', direction: 'informational' },
  { key: 'perception.rawTargetFrameRatio', path: 'perception.rawTargetFrameRatio', direction: 'informational' },
  { key: 'perception.confirmedTargetFrames', path: 'perception.confirmedTargetFrames', direction: 'informational' },
  { key: 'perception.confirmedToRawRatio', path: 'perception.confirmedToRawRatio', direction: 'informational' },
  { key: 'perception.screenLockedRejects', path: 'perception.rejectedScreenLockedFrames', direction: 'informational' },
  { key: 'control.gameFps', path: 'control.gameFps', direction: 'higher', tolerance: 0.5 },
  { key: 'control.gameCadenceHz', path: 'control.gameCadenceHz', direction: 'higher', tolerance: 0.5 },
  { key: 'control.warmupShotPulses', path: 'control.warmupShotPulses', direction: 'lower' },
  { key: 'control.unconfirmedShotPulses', path: 'control.unconfirmedShotPulses', direction: 'lower' },
  { key: 'control.reloadRequests', path: 'control.reloadRequests', direction: 'lower' },
  { key: 'control.stuckRecoveries', path: 'control.stuckRecoveries', direction: 'informational' },
  { key: 'control.damageReactions', path: 'control.damageReactions', direction: 'informational' },
  { key: 'latency.maximumObservedHoldMs', path: 'control.maximumObservedHoldMs', direction: 'lower', tolerance: 5 },
  { key: 'reliability.browserWarnings', path: 'control.browserWarnings', direction: 'lower' },
  { key: 'reliability.droppedDamageEvents', path: 'integrity.droppedDamageEvents', direction: 'lower' },
  { key: 'safety.performanceProfile', path: 'control.performanceProfile', direction: 'invariant', expected: 'performance' },
  { key: 'safety.pointerLock', path: 'control.pointerLock', direction: 'invariant', expected: true },
  { key: 'safety.releasedAtEnd', path: 'control.releasedAtEnd', direction: 'invariant', expected: true },
  { key: 'safety.holdWatchdogExceeded', path: 'control.holdWatchdogExceeded', direction: 'invariant', expected: false },

  { key: 'safety.pageErrors', path: 'control.pageErrors', direction: 'invariant', expected: [] },
  { key: 'fairness.forbiddenInputsUsed', path: 'integrity.forbiddenInputsUsed', direction: 'invariant', expected: [] },
  { key: 'integrity.matchEndedObserved', path: 'integrity.matchEndedObserved', direction: 'invariant', expected: true },
  { key: 'integrity.summaryDownloaded', path: 'integrity.summaryDownloaded', direction: 'invariant', expected: true },
  { key: 'integrity.technicalDownloaded', path: 'integrity.technicalDownloaded', direction: 'invariant', expected: true },
]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (argv[index + 1] && !argv[index + 1].startsWith('--')) values[name] = argv[++index];
    else values[name] = true;
  }
  return values;
}

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function comparableValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value;
}

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function policyConfigurationFingerprint(configuration) {
  return createHash('sha256').update(JSON.stringify(canonicalValue(configuration))).digest('hex');
}

export function hardGateFailures(benchmark, registry = METRIC_REGISTRY) {
  const extraHardGates = [
    { key: 'contacts.nonBotDamageEvents', path: 'contacts.nonBotDamageEvents', expected: 0 },
    { key: 'perception.captureFailures', path: 'perception.captureFailures', expected: 0 },
    { key: 'control.warmupShotPulses', path: 'control.warmupShotPulses', expected: 0 },
    { key: 'control.unconfirmedShotPulses', path: 'control.unconfirmedShotPulses', expected: 0 },
    { key: 'safety.activeInputVeto', path: 'control.activeInputVeto', expected: false },
    { key: 'safety.pointerLockLosses', path: 'control.pointerLockLosses', expected: 0 },
    { key: 'safety.focusLosses', path: 'control.focusLosses', expected: 0 },
    { key: 'safety.hudFreshnessFailures', path: 'control.hudFreshnessFailures', expected: 0 },
  ];
  return [...registry.filter((metric) => metric.direction === 'invariant'), ...extraHardGates]
    .map((metric) => ({
      key: metric.key,
      expected: metric.expected,
      value: comparableValue(valueAt(benchmark, metric.path)),
    }))
    .filter((gate) => gate.value === null || !equalValue(gate.value, gate.expected))
    .map((gate) => ({ ...gate, reason: gate.value === null ? 'missing' : 'mismatch' }));
}

export function compareBenchmarks(current, reference, referenceId, registry = METRIC_REGISTRY) {
  const rows = registry.map((metric) => {
    const value = comparableValue(valueAt(current, metric.path));
    const referenceValue = reference ? comparableValue(valueAt(reference, metric.path)) : null;
    const row = {
      key: metric.key,
      direction: metric.direction,
      value,
      referenceValue,
      delta: null,
      label: 'missing',
    };
    if (value === null || referenceValue === null) {
      row.label = reference ? 'missing' : 'incomparable';
      return row;
    }
    if (metric.direction === 'informational') {
      row.label = equalValue(value, referenceValue) ? 'unchanged' : 'informational';
      if (typeof value === 'number' && typeof referenceValue === 'number') row.delta = value - referenceValue;
      return row;
    }
    if (metric.direction === 'invariant') {
      const currentPass = equalValue(value, metric.expected);
      const referencePass = equalValue(referenceValue, metric.expected);
      row.label = currentPass === referencePass ? 'unchanged' : currentPass ? 'improved' : 'regressed';
      return row;
    }
    if (typeof value !== 'number' || typeof referenceValue !== 'number') {
      row.label = equalValue(value, referenceValue) ? 'unchanged' : 'incomparable';
      return row;
    }
    row.delta = value - referenceValue;
    if (Math.abs(row.delta) <= (metric.tolerance ?? 0)) row.label = 'unchanged';
    else if (metric.direction === 'higher') row.label = row.delta > 0 ? 'improved' : 'regressed';
    else row.label = row.delta < 0 ? 'improved' : 'regressed';
    return row;
  });
  const counts = Object.fromEntries(['improved', 'regressed', 'unchanged', 'informational', 'missing', 'incomparable']
    .map((label) => [label, rows.filter((row) => row.label === label).length]));
  const absoluteHardFailures = hardGateFailures(current, registry);
  const hardRegressions = absoluteHardFailures.map((failure) => failure.key);
  return {
    schemaVersion: 1,
    kind: 'atomic-player-game-comparison',
    referenceGameId: referenceId,
    counts,
    hardRegression: hardRegressions.length > 0,
    hardRegressions,
    absoluteHardFailures,
    rows,
  };
}

export function partialBenchmarkFromReport(report) {
  const performance = report?.performance ?? {};
  const input = report?.input ?? {};
  return {
    schemaVersion: 2,
    kind: 'atomic-player-partial-benchmark',
    source: {
      build: report?.source?.pass ?? null,
      pass: report?.source?.pass ?? null,
      url: report?.source?.url ?? null,
      arena: report?.outcome?.arena ?? null,
      mode: report?.session?.mode ?? null,
      durationSeconds: null,
      callsign: report?.session?.callsign ?? null,
      harnessGitSha: report?.source?.harnessGitSha ?? report?.source?.gitSha ?? null,
      completedAt: report?.endedAt ?? null,
    },
    result: {},
    survival: {},
    contacts: {},
    perception: {
      visionFrames: performance.visionFrames ?? null,
      activeVisionFrames: performance.activeVisionFrames ?? null,
      rawTargetFrames: performance.rawTargetFrames ?? performance.targetFrames ?? null,
      confirmedTargetFrames: performance.confirmedTargetFrames ?? null,
      rawTargetFrameRatio: performance.targetFrameRatio ?? null,
      confirmedTargetFrameRatio: performance.confirmedTargetFrameRatio ?? null,
      confirmedToRawRatio: performance.rawTargetFrames
        ? (performance.confirmedTargetFrames ?? 0) / performance.rawTargetFrames
        : null,
      rejectedScreenLockedFrames: performance.rejectedScreenLockedFrames ?? null,
      sourceFps: performance.visionStream?.sourceFps ?? null,
      decisionFps: performance.decisionFps ?? null,
      captureFailures: performance.visionStream?.failedFrames ?? null,
      captureMinimumMs: performance.visionStream?.captureMs?.minimum ?? null,
      captureMedianMs: performance.visionStream?.captureMs?.median ?? null,
      captureP95Ms: performance.visionStream?.captureMs?.p95 ?? null,
      captureMaximumMs: performance.visionStream?.captureMs?.maximum ?? null,
      decodeMedianMs: performance.visionLoopMs?.median ?? null,
      decodeP95Ms: performance.visionLoopMs?.p95 ?? null,
    },
    control: {
      gameFps: performance.fpsCounter?.value === undefined ? null : Number(performance.fpsCounter.value),
      gameCadenceHz: performance.framePacing?.cadenceHz ?? null,
      pointerLock: report?.session?.pointerLock ?? null,
      performanceProfile: performance.observedRenderProfile ?? null,
      aimMoves: input.aimMoves ?? null,
      shotPulses: input.shotPulses ?? null,
      bursts: input.bursts ?? null,
      warmupShotPulses: input.warmupShotPulses ?? null,
      unconfirmedShotPulses: input.unconfirmedShotPulses ?? null,
      reloadRequests: input.reloadRequests ?? null,
      stuckRecoveries: input.stuckRecoveries ?? null,
      damageReactions: input.damageReactions ?? null,
      maximumObservedHoldMs: input.maximumObservedHoldMs ?? null,
      configuredMaxHoldMs: input.configuredMaxHoldMs ?? null,
      releasedAtEnd: input.releasedAtEnd ?? null,
      holdWatchdogExceeded: input.holdWatchdogExceeded ?? null,
      pageErrors: report?.browser?.pageErrors ?? null,
      browserWarnings: report?.browser?.warningOrErrorCount ?? null,
    },
    integrity: {
      matchEndedObserved: report?.outcome?.matchEndedObserved ?? false,
      summaryDownloaded: Boolean(report?.outcome?.downloadedSummary),
      technicalDownloaded: Boolean(report?.outcome?.downloadedTechnical),
      damageTimelineComplete: null,
      droppedDamageEvents: null,
      captureMode: performance.visionStream?.mode ?? null,
      forbiddenInputsUsed: report?.fairness?.forbiddenInputsUsed ?? null,
    },
  };
}

export function validateExperimentPolicy(policy, { report = null, modelPolicy = null } = {}) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('experiment-policy.json must contain an object');
  }
  if (policy.schemaVersion !== 1) throw new Error('experiment-policy.json requires schemaVersion 1');
  const placeholder = /(replace|placeholder|yyyy|wrong-profile|claimed-|\banything\b)/i;
  for (const key of ['policyId', 'hypothesis', 'rollbackCondition']) {
    if (typeof policy[key] !== 'string' || policy[key].trim().length < 8 || placeholder.test(policy[key])) {
      throw new Error(`experiment-policy.json requires a substantive non-placeholder ${key}`);
    }
  }
  for (const key of ['expectedMetricMovements', 'unchangedControls']) {
    if (!Array.isArray(policy[key]) || policy[key].length === 0 || policy[key].some((item) => typeof item !== 'string' || item.trim().length < 8 || placeholder.test(item))) {
      throw new Error(`experiment-policy.json requires a non-placeholder string array ${key}`);
    }
  }
  if (!policy.configuration || typeof policy.configuration !== 'object' || Array.isArray(policy.configuration)) {
    throw new Error('experiment-policy.json requires a configuration object');
  }
  for (const key of ['playerHarnessCommit', 'profile', 'provider', 'model', 'reasoningEffort', 'serviceTier']) {
    if (typeof policy.configuration[key] !== 'string' || !policy.configuration[key].trim() || placeholder.test(policy.configuration[key])) {
      throw new Error(`experiment-policy.json configuration requires a non-placeholder ${key}`);
    }
  }
  if (!/^[0-9a-f]{7,40}$/i.test(policy.configuration.playerHarnessCommit)) {
    throw new Error('experiment-policy.json playerHarnessCommit must be a real git SHA');
  }
  if (policy.configuration.profile !== 'atomicplayer') {
    throw new Error('counted Atomic Player policy must use the atomicplayer profile');
  }
  if (report?.source?.harnessGitSha && policy.configuration.playerHarnessCommit !== report.source.harnessGitSha) {
    throw new Error('experiment-policy.json playerHarnessCommit does not match the driver receipt');
  }
  if (modelPolicy) {
    const expected = modelPolicy?.profiles?.[policy.configuration.profile];
    if (!expected) throw new Error(`model policy does not index profile ${policy.configuration.profile}`);
    const pairs = [
      ['provider', expected.provider],
      ['model', expected.model],
      ['reasoningEffort', expected.reasoning_effort],
      ['serviceTier', expected.service_tier],
    ];
    for (const [key, expectedValue] of pairs) {
      if (policy.configuration[key] !== expectedValue) {
        throw new Error(`experiment-policy.json ${key}=${policy.configuration[key]} does not match model policy ${expectedValue}`);
      }
    }
  }
  return policy;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function readJson(path, fallback = null) {
  if (!await exists(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function sha256File(path) {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: false });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === 'manifest.json' || entry.name.startsWith('comparison-vs-')) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

async function filesRecursively(root, current = root) {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) output.push(...await filesRecursively(root, path));
    else if (entry.isFile()) output.push(relative(root, path).replaceAll('\\', '/'));
  }
  return output.sort();
}

async function buildContactSheet(directory) {
  const names = (await readdir(directory)).filter((name) => /\.jpe?g$/i.test(name) && name !== 'contact-sheet.jpg').sort().slice(0, 12);
  if (names.length === 0) return null;
  const tileWidth = 480;
  const tileHeight = 270;
  const columns = names.length === 1 ? 1 : 2;
  const rows = Math.ceil(names.length / columns);
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const input = await sharp(join(directory, names[index])).resize(tileWidth, tileHeight, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    composites.push({ input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight });
  }
  const output = join(directory, 'contact-sheet.jpg');
  await sharp({ create: { width: tileWidth * columns, height: tileHeight * rows, channels: 3, background: '#10171c' } })
    .composite(composites).jpeg({ quality: 88 }).toFile(output);
  return basename(output);
}

function markdownComparison(title, comparison) {
  if (!comparison) return `## ${title}\n\nNo comparable reference game.\n`;
  const lines = [`## ${title}`, '', `Reference: **${comparison.referenceGameId}**`, '',
    `Improved ${comparison.counts.improved} · Regressed ${comparison.counts.regressed} · Unchanged ${comparison.counts.unchanged} · Informational ${comparison.counts.informational} · Missing ${comparison.counts.missing}`, '',
    '| Metric | Current | Reference | Delta | Verdict |', '|---|---:|---:|---:|---|'];
  for (const row of comparison.rows) lines.push(`| ${row.key} | ${JSON.stringify(row.value)} | ${JSON.stringify(row.referenceValue)} | ${row.delta ?? '—'} | ${row.label} |`);
  return `${lines.join('\n')}\n`;
}

async function atomicWriteJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function archiveGame({
  sourceDirectory,
  archiveRoot,
  runType = 'benchmark',
  setBaseline = false,
  modelPolicyPath = process.env.HERMES_MODEL_POLICY_PATH ?? '/root/.hermes/policies/model-policy.json',
}) {
  sourceDirectory = resolve(sourceDirectory);
  archiveRoot = resolve(archiveRoot);
  await mkdir(join(archiveRoot, 'games'), { recursive: true });
  const indexPath = join(archiveRoot, 'index.json');
  const index = await readJson(indexPath, { schemaVersion: 1, kind: 'atomic-player-game-index', baselineGameId: null, games: [] });
  const reportPath = join(sourceDirectory, 'report.json');
  if (!await exists(reportPath)) throw new Error(`Source game has no report.json: ${sourceDirectory}`);
  const sourceReport = await readJson(reportPath, {});
  const experimentPolicyPath = join(sourceDirectory, 'experiment-policy.json');
  const experimentPolicy = await readJson(experimentPolicyPath);
  const requiresExperimentPolicy = runType === 'benchmark' && index.games.length >= 2;
  if (requiresExperimentPolicy && !experimentPolicy) {
    throw new Error('Counted Atomic Player games G0003+ require a frozen experiment-policy.json before play');
  }
  const modelPolicy = await readJson(resolve(modelPolicyPath));
  if (requiresExperimentPolicy && !modelPolicy) {
    throw new Error(`Counted Atomic Player games require a readable model policy: ${modelPolicyPath}`);
  }
  if (experimentPolicy) validateExperimentPolicy(experimentPolicy, { report: sourceReport, modelPolicy });
  const policyFingerprint = experimentPolicy
    ? policyConfigurationFingerprint(experimentPolicy.configuration)
    : null;
  const modelPolicyReceipt = experimentPolicy ? {
    policyAsOf: modelPolicy?.as_of ?? null,
    profile: experimentPolicy.configuration.profile,
    provider: modelPolicy?.profiles?.[experimentPolicy.configuration.profile]?.provider ?? null,
    model: modelPolicy?.profiles?.[experimentPolicy.configuration.profile]?.model ?? null,
    reasoningEffort: modelPolicy?.profiles?.[experimentPolicy.configuration.profile]?.reasoning_effort ?? null,
    serviceTier: modelPolicy?.profiles?.[experimentPolicy.configuration.profile]?.service_tier ?? null,
  } : null;
  const fingerprintHash = createHash('sha256');
  fingerprintHash.update(await readFile(reportPath));
  const sourceSummaryPath = join(sourceDirectory, 'match-summary.json');
  if (await exists(sourceSummaryPath)) fingerprintHash.update(await readFile(sourceSummaryPath));
  if (experimentPolicy) fingerprintHash.update(await readFile(experimentPolicyPath));
  const sourceFingerprint = fingerprintHash.digest('hex');
  const duplicate = index.games.find((game) => game.sourceFingerprint === sourceFingerprint);
  if (duplicate) return { duplicate: true, game: duplicate, directory: join(archiveRoot, duplicate.directory) };

  const gameId = `G${String(index.games.length + 1).padStart(4, '0')}`;
  const gameRelativeDirectory = `games/${gameId}`;
  const gameDirectory = join(archiveRoot, gameRelativeDirectory);
  if (await exists(gameDirectory)) throw new Error(`Immutable game destination already exists: ${gameDirectory}`);
  await copyTree(sourceDirectory, gameDirectory);

  const report = await readJson(join(gameDirectory, 'report.json'), {});
  const summary = await readJson(join(gameDirectory, 'match-summary.json'));
  const benchmark = summary
    ? analyseCombat(summary, report, report?.session?.callsign ?? 'Jigglyclaw')
    : partialBenchmarkFromReport(report);
  await atomicWriteJson(join(gameDirectory, 'combat-benchmark.json'), benchmark);
  await buildContactSheet(gameDirectory);

  const completed = Boolean(summary && report?.outcome?.matchEndedObserved);
  const absoluteHardFailures = hardGateFailures(benchmark);
  const counted = runType === 'benchmark' && completed && absoluteHardFailures.length === 0;
  const comparableGames = index.games.filter((game) => game.benchmarkFile && (game.counted ?? game.completed));
  const previousGame = comparableGames.at(-1) ?? null;
  const baselineId = index.baselineGameId ?? (setBaseline || counted ? gameId : null);
  const baselineGame = baselineId === gameId ? null : index.games.find((game) => game.id === baselineId) ?? null;
  const previousBenchmark = previousGame ? await readJson(join(archiveRoot, previousGame.benchmarkFile)) : null;
  const baselineBenchmark = baselineGame ? await readJson(join(archiveRoot, baselineGame.benchmarkFile)) : benchmark;
  const previousComparison = benchmark && previousGame
    ? compareBenchmarks(benchmark, previousBenchmark, previousGame.id)
    : null;
  const baselineComparison = benchmark && baselineBenchmark
    ? compareBenchmarks(benchmark, baselineBenchmark, baselineId)
    : null;
  if (previousComparison) await atomicWriteJson(join(gameDirectory, 'comparison-vs-previous.json'), previousComparison);
  if (baselineComparison) await atomicWriteJson(join(gameDirectory, 'comparison-vs-baseline.json'), baselineComparison);

  const summaryMarkdown = [
    `# Atomic Player ${gameId}`,
    '',
    `- Status: **${completed ? 'complete' : 'partial/failed'}**`,
    `- Counted benchmark: **${counted ? 'yes' : 'no'}**`,
    `- Absolute hard-gate failures: ${absoluteHardFailures.length ? absoluteHardFailures.map((gate) => gate.key).join(', ') : 'none'}`,
    `- Run type: **${runType}**`,
    `- Started: ${report?.startedAt ?? 'unknown'}`,
    `- Build: ${benchmark?.source?.build ?? report?.source?.pass ?? 'unknown'}`,
    `- Result: ${benchmark?.result?.headline ?? 'no post-game summary'}`,
    `- Archive baseline: ${baselineId ?? 'not assigned'}`,
    `- Player policy: ${experimentPolicy?.policyId ?? 'legacy/pre-policy archive'}`,
    `- Hypothesis: ${experimentPolicy?.hypothesis ?? 'not recorded'}`,
    '',
    markdownComparison('Versus fixed baseline', baselineComparison),
    markdownComparison('Versus previous comparable game', previousComparison),
  ].join('\n');
  await writeFile(join(gameDirectory, 'summary.md'), summaryMarkdown);

  const evidence = [];
  for (const file of await filesRecursively(gameDirectory)) {
    if (file === 'manifest.json') continue;
    const path = join(gameDirectory, file);
    const info = await stat(path);
    evidence.push({ file, bytes: info.size, sha256: await sha256File(path) });
  }
  const manifest = {
    schemaVersion: 1,
    kind: 'atomic-player-game-manifest',
    gameId,
    runType,
    completed,
    counted,
    absoluteHardFailures,
    archivedAt: new Date().toISOString(),
    sourceFingerprint,
    sourceDirectory,
    baselineGameId: baselineId,
    previousComparableGameId: previousGame?.id ?? null,
    playerPolicy: experimentPolicy ? {
      policyId: experimentPolicy.policyId,
      hypothesis: experimentPolicy.hypothesis,
      expectedMetricMovements: experimentPolicy.expectedMetricMovements,
      unchangedControls: experimentPolicy.unchangedControls,
      rollbackCondition: experimentPolicy.rollbackCondition,
      configuration: experimentPolicy.configuration,
      configurationFingerprint: policyFingerprint,
      modelPolicyReceipt,
    } : null,
    harnessGitSha: benchmark?.source?.harnessGitSha ?? report?.source?.gitSha ?? null,
    provenance: {
      observedUrl: report?.source?.url ?? null,
      observedMenuPass: report?.source?.pass ?? null,
      humanSummaryBuild: summary?.build ?? null,
      technicalSourceIdTrustedForRelease: false,
    },
    evidence,
  };
  await atomicWriteJson(join(gameDirectory, 'manifest.json'), manifest);

  const game = {
    id: gameId,
    directory: gameRelativeDirectory,
    runType,
    completed,
    counted,
    absoluteHardFailures,
    startedAt: report?.startedAt ?? null,
    archivedAt: manifest.archivedAt,
    sourceFingerprint,
    build: benchmark?.source?.build ?? report?.source?.pass ?? null,
    result: benchmark?.result?.headline ?? null,
    benchmarkFile: benchmark ? `${gameRelativeDirectory}/combat-benchmark.json` : null,
    summaryFile: `${gameRelativeDirectory}/summary.md`,
    manifestFile: `${gameRelativeDirectory}/manifest.json`,
    previousComparableGameId: previousGame?.id ?? null,
    policyId: experimentPolicy?.policyId ?? null,
    hypothesis: experimentPolicy?.hypothesis ?? null,
    policyConfigurationFingerprint: policyFingerprint,
    modelPolicyReceipt,
    comparisonVsBaseline: baselineComparison?.counts ?? null,
    comparisonVsPrevious: previousComparison?.counts ?? null,
    hardRegression: absoluteHardFailures.length > 0,
  };
  index.baselineGameId = baselineId;
  index.games.push(game);
  await atomicWriteJson(indexPath, index);
  return { duplicate: false, game, directory: gameDirectory, manifest, baselineComparison, previousComparison };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDirectory = args.source ?? args.directory;
  if (!sourceDirectory) throw new Error('Usage: archive-game.mjs --source <game-artifact-directory> [--archive-root <directory>]');
  const result = await archiveGame({
    sourceDirectory,
    archiveRoot: args['archive-root'] ?? 'artifacts/agent-player/archive',
    runType: String(args['run-type'] ?? 'benchmark'),
    setBaseline: Boolean(args['set-baseline']),
    modelPolicyPath: String(args['model-policy'] ?? process.env.HERMES_MODEL_POLICY_PATH ?? '/root/.hermes/policies/model-policy.json'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
