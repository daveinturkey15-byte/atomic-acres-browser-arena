#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENARIO_ORACLE = Object.freeze({
  'solo-host-bots': [['R601', 'R603'], ['F-R601-01', 'F-R603-01']],
  'two-peer-private': [['R601', 'R602'], ['F-R601-02', 'F-R602-01']],
  'host-guest-bot': [['R601', 'R603'], ['F-R601-03', 'F-R603-02']],
  'life-action-revision-races': [['R602', 'R603'], ['F-R602-02', 'F-R603-03']],
  'weapon-command-forgery': [['R203', 'R228', 'R601'], ['F-R203-01', 'F-R228-01', 'F-R601-04']],
  'ordnance-duplicate-stale': [['R223', 'R233', 'R602', 'R603'], ['F-R223-01', 'F-R233-01', 'F-R602-03', 'F-R603-04']],
  'support-reward-forgery': [['R502', 'R503', 'R510', 'R602', 'R603'], ['F-R502-01', 'F-R503-01', 'F-R510-01', 'F-R602-04', 'F-R603-05']],
  'shed-revision-forgery': [['R403', 'R405', 'R408', 'R410', 'R411'], ['F-R403-01', 'F-R405-01', 'F-R408-01', 'F-R410-01', 'F-R411-01']],
  'late-join-repair': [['R204', 'R234', 'R403', 'R410', 'R607'], ['F-R204-01', 'F-R234-01', 'F-R403-02', 'F-R410-02', 'F-R607-01']],
  'match-end-cleanup': [['R204', 'R307', 'R603', 'R610'], ['F-R204-02', 'F-R307-01', 'F-R603-06', 'F-R610-01']],
  'reconnect-rematch-repair': [['R204', 'R602', 'R607', 'R610'], ['F-R204-03', 'F-R602-05', 'F-R607-02', 'F-R610-02']],
  'pose-history-dynamic-geometry': [['R411', 'R504', 'R506', 'R607'], ['F-R411-02', 'F-R504-01', 'F-R506-01', 'F-R607-03']],
  'exactly-once-outcomes': [['R223', 'R502', 'R503', 'R603'], ['F-R223-02', 'F-R502-02', 'F-R503-02', 'F-R603-07']],
});

const IMPAIRMENT_VERSION = 'pass65-chaos-v1';
const PROFILE_ORACLE = Object.freeze([Object.freeze({
  id: 'moderate-chaos',
  delayMs: 80,
  jitterMs: 30,
  lossPermille: 30,
  duplicatePermille: 20,
  reorderPermille: 20,
  seed: 65001,
  durationSeconds: 120,
  eventCount: 5000,
  repairDeadlineMs: 3000,
})]);
const HARDWARE_PRESETS = Object.freeze(['high', 'max']);
const HARDWARE_SCENES = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'combined-stress']);
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

const exactRequirements = [...new Set(Object.values(SCENARIO_ORACLE).flatMap(([requirements]) => requirements))].sort();
const exactFalsifiers = [...new Set(Object.values(SCENARIO_ORACLE).flatMap(([, falsifiers]) => falsifiers))].sort();
const exactScenarios = Object.keys(SCENARIO_ORACLE);
const sha40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value);
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const requirementOk = value => typeof value === 'string' && /^R\d{3}$/.test(value);
const falsifierOk = value => typeof value === 'string' && /^F-R\d{3}-\d{2}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const uint = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sorted = values => [...values].sort();
const exactArray = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const sameSet = (actual, expected) => Array.isArray(actual) && new Set(actual).size === actual.length && exactArray(sorted(actual), sorted(expected));
const safeArtifactPath = value => typeof value === 'string'
  && value.length >= 3 && value.length <= 240
  && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..')
  && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function exactKeys(value, required, allowed, label, failures) {
  if (!plainObject(value)) {
    failures.push(`${label} must be a plain object`);
    return false;
  }
  const keys = Object.keys(value);
  for (const key of required) if (!keys.includes(key)) failures.push(`${label} missing key ${key}`);
  for (const key of keys) if (!allowed.includes(key)) failures.push(`${label} unknown key ${key}`);
  return true;
}

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateFileEvidence(relativePath, expectedDigest, artifactRoot, label, failures) {
  if (!safeArtifactPath(relativePath)) {
    failures.push(`${label} path invalid`);
    return;
  }
  if (!sha256(expectedDigest)) {
    failures.push(`${label} digest invalid`);
    return;
  }
  if (typeof artifactRoot !== 'string' || artifactRoot.length === 0) {
    failures.push(`${label} artifact root missing`);
    return;
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(artifactRoot));
  } catch {
    failures.push(`${label} artifact root unreadable`);
    return;
  }
  const candidate = path.resolve(realRoot, relativePath);
  if (!containedBy(realRoot, candidate)) {
    failures.push(`${label} escapes artifact root`);
    return;
  }
  let realFile;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    failures.push(`${label} file missing`);
    return;
  }
  if (!containedBy(realRoot, realFile)) {
    failures.push(`${label} resolves outside artifact root`);
    return;
  }
  let stat;
  try {
    stat = fs.statSync(realFile);
  } catch {
    failures.push(`${label} file unreadable`);
    return;
  }
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_EVIDENCE_BYTES) {
    failures.push(`${label} file size/type invalid`);
    return;
  }
  let actualDigest;
  try {
    actualDigest = crypto.createHash('sha256').update(fs.readFileSync(realFile)).digest('hex');
  } catch {
    failures.push(`${label} file unreadable`);
    return;
  }
  if (actualDigest !== expectedDigest) failures.push(`${label} digest mismatch`);
}

function validateArtifact(value, label, artifactRoot, failures) {
  if (!exactKeys(value, ['path', 'sha256'], ['path', 'sha256'], label, failures)) return;
  validateFileEvidence(value.path, value.sha256, artifactRoot, label, failures);
}

function validateHardware(receipt, label, identity, artifactRoot, failures) {
  const keys = ['preset', 'sourceSha', 'environmentHash', 'artifact', 'os', 'browser', 'adapter', 'backend', 'settingsHash', 'resolution', 'warmupSamples', 'measuredSamples', 'gpuMetricKind', 'sceneIds', 'baseline', 'thresholds', 'observed'];
  if (!exactKeys(receipt, keys, keys, label, failures)) return;
  if (!HARDWARE_PRESETS.includes(receipt.preset)) failures.push(`${label} preset invalid`);
  if (receipt.sourceSha !== identity.sourceSha || !sha40(receipt.sourceSha)) failures.push(`${label} source SHA mismatch`);
  if (receipt.environmentHash !== identity.environmentHash || !sha256(receipt.environmentHash)) failures.push(`${label} environment mismatch`);
  validateArtifact(receipt.artifact, `${label}.artifact`, artifactRoot, failures);
  exactKeys(receipt.os, ['name', 'version'], ['name', 'version'], `${label}.os`, failures);
  exactKeys(receipt.browser, ['name', 'version'], ['name', 'version'], `${label}.browser`, failures);
  exactKeys(receipt.adapter, ['name', 'vendorId', 'deviceId', 'driverVersion'], ['name', 'vendorId', 'deviceId', 'driverVersion'], `${label}.adapter`, failures);
  for (const [object, fields, objectLabel] of [[receipt.os, ['name', 'version'], 'os'], [receipt.browser, ['name', 'version'], 'browser'], [receipt.adapter, ['name', 'vendorId', 'deviceId', 'driverVersion'], 'adapter']]) {
    for (const field of fields) if (typeof object?.[field] !== 'string' || object[field].trim().length === 0 || object[field].length > 120) failures.push(`${label}.${objectLabel}.${field} invalid`);
  }
  if (receipt.backend !== 'webgpu') failures.push(`${label} backend must equal webgpu`);
  if (!sha256(receipt.settingsHash)) failures.push(`${label} settingsHash invalid`);
  if (exactKeys(receipt.resolution, ['width', 'height', 'dpr'], ['width', 'height', 'dpr'], `${label}.resolution`, failures)) {
    if (!uint(receipt.resolution.width, 1280, 7680) || !uint(receipt.resolution.height, 720, 4320) || !finite(receipt.resolution.dpr, 0.5, 4)) failures.push(`${label} resolution invalid`);
  }
  if (!uint(receipt.warmupSamples, 60, 10000) || !uint(receipt.measuredSamples, 300, 100000)) failures.push(`${label} sample counts invalid`);
  if (!['gpu-time', 'queue-proxy'].includes(receipt.gpuMetricKind)) failures.push(`${label} GPU metric kind invalid`);
  if (!exactArray(receipt.sceneIds, HARDWARE_SCENES)) failures.push(`${label} scene corpus must exactly match the independent oracle`);

  const metricKeys = ['cpuP95Ms', 'gpuOrProxyP95Ms', 'frameP99Ms', 'memoryPeakMiB'];
  const baselineKeys = ['sourceSha', 'artifact', ...metricKeys];
  if (exactKeys(receipt.baseline, baselineKeys, baselineKeys, `${label}.baseline`, failures)) {
    if (!sha40(receipt.baseline.sourceSha) || receipt.baseline.sourceSha === identity.sourceSha) failures.push(`${label} baseline source SHA invalid`);
    validateArtifact(receipt.baseline.artifact, `${label}.baseline.artifact`, artifactRoot, failures);
    for (const field of metricKeys) if (!finite(receipt.baseline[field], 0, field === 'memoryPeakMiB' ? 32768 : 1000)) failures.push(`${label} baseline ${field} invalid`);
  }
  const thresholdKeys = ['cpuP95MaxMs', 'gpuOrProxyP95MaxMs', 'frameP99MaxMs', 'memoryPeakMaxMiB', 'cpuP95DeltaMaxMs', 'gpuOrProxyP95DeltaMaxMs', 'frameP99DeltaMaxMs', 'memoryPeakDeltaMaxMiB'];
  if (exactKeys(receipt.thresholds, thresholdKeys, thresholdKeys, `${label}.thresholds`, failures)) {
    for (const field of thresholdKeys) if (!finite(receipt.thresholds[field], 0, field.includes('memory') ? 32768 : 1000)) failures.push(`${label} threshold ${field} invalid`);
  }
  const observedKeys = [...metricKeys, 'deviceLossCount', 'uncapturedErrorCount'];
  if (exactKeys(receipt.observed, observedKeys, observedKeys, `${label}.observed`, failures)) {
    for (const field of metricKeys) if (!finite(receipt.observed[field], 0, field === 'memoryPeakMiB' ? 32768 : 1000)) failures.push(`${label} observed ${field} invalid`);
    if (receipt.observed.deviceLossCount !== 0 || receipt.observed.uncapturedErrorCount !== 0) failures.push(`${label} device loss or uncaptured error observed`);
  }
  const comparisons = [
    ['cpuP95Ms', 'cpuP95MaxMs', 'cpuP95DeltaMaxMs'],
    ['gpuOrProxyP95Ms', 'gpuOrProxyP95MaxMs', 'gpuOrProxyP95DeltaMaxMs'],
    ['frameP99Ms', 'frameP99MaxMs', 'frameP99DeltaMaxMs'],
    ['memoryPeakMiB', 'memoryPeakMaxMiB', 'memoryPeakDeltaMaxMiB'],
  ];
  for (const [metric, absolute, deltaLimit] of comparisons) {
    if (Number.isFinite(receipt.observed?.[metric]) && Number.isFinite(receipt.thresholds?.[absolute]) && receipt.observed[metric] > receipt.thresholds[absolute]) failures.push(`${label} ${metric} exceeds absolute threshold`);
    if (Number.isFinite(receipt.observed?.[metric]) && Number.isFinite(receipt.baseline?.[metric]) && Number.isFinite(receipt.thresholds?.[deltaLimit]) && receipt.observed[metric] - receipt.baseline[metric] > receipt.thresholds[deltaLimit]) failures.push(`${label} ${metric} exceeds baseline delta threshold`);
  }
}

export function validateCombatMatrix(report, artifactRoot) {
  const failures = [];
  const rootKeys = ['schemaVersion', 'identity', 'acceptance', 'impairmentManifest', 'results', 'hardwareEvidence'];
  if (!exactKeys(report, rootKeys, rootKeys, 'report', failures)) return failures;
  if (report.schemaVersion !== 3) failures.push('schemaVersion must equal 3');

  const identityKeys = ['sourceSha', 'buildId', 'environmentHash', 'worktreeState', 'buildState'];
  if (exactKeys(report.identity, identityKeys, identityKeys, 'identity', failures)) {
    if (!sha40(report.identity.sourceSha)) failures.push('identity sourceSha must be an exact 40-hex Git SHA');
    if (!idOk(report.identity.buildId)) failures.push('identity buildId invalid');
    if (!sha256(report.identity.environmentHash)) failures.push('identity environmentHash must be a 64-hex SHA256 digest');
    if (report.identity.worktreeState !== 'clean') failures.push('candidate worktree must be clean');
    if (report.identity.buildState !== 'immutable') failures.push('candidate build must be immutable');
  }

  const acceptanceKeys = ['state', 'artifact', 'requirementIds', 'falsifierIds'];
  if (exactKeys(report.acceptance, acceptanceKeys, acceptanceKeys, 'acceptance', failures)) {
    if (report.acceptance.state !== 'frozen') failures.push('acceptance state must be frozen');
    validateArtifact(report.acceptance.artifact, 'acceptance.artifact', artifactRoot, failures);
    if (!sameSet(report.acceptance.requirementIds, exactRequirements) || !report.acceptance.requirementIds?.every(requirementOk)) failures.push('acceptance requirement IDs must exactly equal the independent scenario union');
    if (!sameSet(report.acceptance.falsifierIds, exactFalsifiers) || !report.acceptance.falsifierIds?.every(falsifierOk)) failures.push('acceptance falsifier IDs must exactly equal the independent scenario union');
  }

  const impairmentKeys = ['version', 'sha256', 'profiles'];
  let profiles = [];
  if (exactKeys(report.impairmentManifest, impairmentKeys, impairmentKeys, 'impairmentManifest', failures)) {
    if (report.impairmentManifest.version !== IMPAIRMENT_VERSION) failures.push('impairment manifest version differs from oracle');
    profiles = Array.isArray(report.impairmentManifest.profiles) ? report.impairmentManifest.profiles : [];
    if (canonical(profiles) !== canonical(PROFILE_ORACLE)) failures.push('impairment profiles differ from the independent fixed oracle');
    const expectedDigest = digest({ version: IMPAIRMENT_VERSION, profiles: PROFILE_ORACLE });
    if (report.impairmentManifest.sha256 !== expectedDigest) failures.push('impairment manifest digest does not match canonical recomputation');
    for (const [index, profile] of profiles.entries()) exactKeys(profile, Object.keys(PROFILE_ORACLE[0]), Object.keys(PROFILE_ORACLE[0]), `impairmentManifest.profiles[${index}]`, failures);
  }

  const results = Array.isArray(report.results) ? report.results : [];
  const profileIds = PROFILE_ORACLE.map(profile => profile.id);
  const expectedCells = profileIds.flatMap(profileId => exactScenarios.map(scenarioId => `${profileId}/${scenarioId}`)).sort();
  const actualCells = results.map(result => `${result?.profileId}/${result?.scenarioId}`).sort();
  if (!exactArray(actualCells, expectedCells)) failures.push('matrix must contain the exact scenario x profile cross product with no extras');

  const resultKeys = ['profileId', 'scenarioId', 'sourceSha', 'buildId', 'environmentHash', 'requirementIds', 'falsifierIds', 'commandOrFixture', 'artifact', 'events', 'repair', 'stateHashes', 'cleanup', 'lifecycle'];
  for (const [index, result] of results.entries()) {
    const label = `results[${index}]`;
    if (!exactKeys(result, resultKeys, resultKeys, label, failures)) continue;
    const oracle = SCENARIO_ORACLE[result.scenarioId];
    const profile = PROFILE_ORACLE.find(candidate => candidate.id === result.profileId);
    if (!profile) failures.push(`${label} unknown profile`);
    if (!oracle) failures.push(`${label} unknown scenario`);
    if (result.sourceSha !== report.identity?.sourceSha || !sha40(result.sourceSha)) failures.push(`${label} source identity mismatch`);
    if (result.buildId !== report.identity?.buildId) failures.push(`${label} build identity mismatch`);
    if (result.environmentHash !== report.identity?.environmentHash) failures.push(`${label} environment identity mismatch`);
    if (oracle && (!exactArray(result.requirementIds, oracle[0]) || !result.requirementIds.every(requirementOk))) failures.push(`${label} requirement evidence differs from scenario oracle`);
    if (oracle && (!exactArray(result.falsifierIds, oracle[1]) || !result.falsifierIds.every(falsifierOk))) failures.push(`${label} falsifier evidence differs from scenario oracle`);
    if (!safeArtifactPath(result.commandOrFixture)) failures.push(`${label} commandOrFixture path invalid`);
    validateArtifact(result.artifact, `${label}.artifact`, artifactRoot, failures);

    const eventKeys = ['originalEvents', 'droppedEvents', 'duplicatedDeliveries', 'reorderedDeliveries', 'deliveredEvents', 'admittedEvents', 'rejectedEvents', 'appliedOutcomes', 'duplicateApplications', 'staleApplications'];
    if (exactKeys(result.events, eventKeys, eventKeys, `${label}.events`, failures)) {
      for (const key of eventKeys) if (!uint(result.events[key])) failures.push(`${label}.events.${key} invalid`);
      if (profile && result.events.originalEvents !== profile.eventCount) failures.push(`${label} original event count differs from profile`);
      if (result.events.deliveredEvents !== result.events.originalEvents - result.events.droppedEvents + result.events.duplicatedDeliveries) failures.push(`${label} delivery arithmetic inconsistent`);
      if (result.events.admittedEvents + result.events.rejectedEvents !== result.events.deliveredEvents) failures.push(`${label} admission arithmetic inconsistent`);
      if (result.events.appliedOutcomes > result.events.admittedEvents) failures.push(`${label} applied outcomes exceed admitted events`);
      if (result.events.duplicateApplications !== 0 || result.events.staleApplications !== 0) failures.push(`${label} duplicate or stale outcomes were applied`);
      if (profile && profile.lossPermille > 0 && result.events.droppedEvents === 0) failures.push(`${label} loss profile produced no dropped events`);
      if (profile && profile.duplicatePermille > 0 && result.events.duplicatedDeliveries === 0) failures.push(`${label} duplicate profile produced no duplicate deliveries`);
      if (profile && profile.reorderPermille > 0 && result.events.reorderedDeliveries === 0) failures.push(`${label} reorder profile produced no reordered deliveries`);
    }

    const repairKeys = ['deadlineMs', 'completedMs', 'attempts', 'remainingDivergences'];
    if (exactKeys(result.repair, repairKeys, repairKeys, `${label}.repair`, failures)) {
      if (!uint(result.repair.deadlineMs, 1, 60000) || (profile && result.repair.deadlineMs !== profile.repairDeadlineMs)) failures.push(`${label} repair deadline mismatch`);
      if (!finite(result.repair.completedMs, 0, result.repair.deadlineMs)) failures.push(`${label} repair completion missed deadline`);
      if (!uint(result.repair.attempts, 1, 1000) || result.repair.remainingDivergences !== 0) failures.push(`${label} repair evidence incomplete`);
    }

    const hashKeys = ['hostFinalSha256', 'clientFinalSha256'];
    if (exactKeys(result.stateHashes, hashKeys, hashKeys, `${label}.stateHashes`, failures)) {
      if (!sha256(result.stateHashes.hostFinalSha256) || result.stateHashes.hostFinalSha256 !== result.stateHashes.clientFinalSha256) failures.push(`${label} final state hashes invalid or divergent`);
    }

    const cleanupKeys = ['initialResourceCount', 'expectedSettledCount', 'observedSettledCount', 'errorCount', 'staleCallbackCount'];
    if (exactKeys(result.cleanup, cleanupKeys, cleanupKeys, `${label}.cleanup`, failures)) {
      for (const key of cleanupKeys) if (!uint(result.cleanup[key], 0, 1000000)) failures.push(`${label}.cleanup.${key} invalid`);
      if (result.cleanup.observedSettledCount !== result.cleanup.expectedSettledCount || result.cleanup.observedSettledCount > result.cleanup.initialResourceCount || result.cleanup.errorCount !== 0 || result.cleanup.staleCallbackCount !== 0) failures.push(`${label} cleanup counters do not settle`);
    }

    const lifecycleKeys = ['lateJoinSnapshotCount', 'lateJoinRepairCount', 'matchEndTransitionCount', 'postMatchMutationCount'];
    if (exactKeys(result.lifecycle, lifecycleKeys, lifecycleKeys, `${label}.lifecycle`, failures)) {
      for (const key of lifecycleKeys) if (!uint(result.lifecycle[key], 0, 1000)) failures.push(`${label}.lifecycle.${key} invalid`);
      if (result.scenarioId === 'late-join-repair' && (result.lifecycle.lateJoinSnapshotCount < 1 || result.lifecycle.lateJoinRepairCount !== result.lifecycle.lateJoinSnapshotCount)) failures.push(`${label} explicit late-join reconstruction evidence missing`);
      if (result.scenarioId === 'match-end-cleanup' && (result.lifecycle.matchEndTransitionCount !== 1 || result.lifecycle.postMatchMutationCount !== 0)) failures.push(`${label} explicit match-end evidence missing`);
    }
  }

  const hardware = Array.isArray(report.hardwareEvidence) ? report.hardwareEvidence : [];
  if (!exactArray(hardware.map(receipt => receipt?.preset), HARDWARE_PRESETS)) failures.push('hardware evidence must contain exact ordered High and Max receipts');
  for (const [index, receipt] of hardware.entries()) validateHardware(receipt, `hardwareEvidence[${index}]`, report.identity ?? {}, artifactRoot, failures);
  return [...new Set(failures)].sort();
}

function readJson(input) {
  return JSON.parse(fs.readFileSync(input, 'utf8'));
}

function runSelfTest() {
  const fixturePath = fileURLToPath(new URL('./fixtures/known-good.json', import.meta.url));
  const fixtureRoot = path.dirname(fixturePath);
  const good = readJson(fixturePath);
  const baseline = validateCombatMatrix(good, fixtureRoot);
  if (baseline.length) return [`known-good fixture failed before mutations: ${baseline.join('; ')}`];
  const mutations = [
    ['64-hex Git SHA', report => { report.identity.sourceSha = 'a'.repeat(64); }],
    ['unknown recursive key', report => { report.results[0].events.selfAttested = true; }],
    ['candidate-selected extra scenario', report => { report.results.push({ ...report.results[0], scenarioId: 'invented-scenario' }); }],
    ['missing late join cell', report => { report.results = report.results.filter(result => result.scenarioId !== 'late-join-repair'); }],
    ['unrecomputed impairment digest', report => { report.impairmentManifest.profiles[0].delayMs += 1; }],
    ['acceptance subset gap', report => { report.acceptance.requirementIds.pop(); }],
    ['artifact traversal', report => { report.results[0].artifact.path = '../evidence.json'; }],
    ['artifact missing', report => { report.results[0].artifact.path = 'fixture-payloads/network/missing.json'; }],
    ['artifact digest drift', report => { report.results[0].artifact.sha256 = 'e'.repeat(64); }],
    ['inconsistent event arithmetic', report => { report.results[0].events.deliveredEvents += 1; }],
    ['truthy self-attestation field', report => { report.results[0].status = 'passed'; }],
    ['state hash divergence', report => { report.results[0].stateHashes.clientFinalSha256 = 'f'.repeat(64); }],
    ['late join evidence erased', report => { const cell = report.results.find(result => result.scenarioId === 'late-join-repair'); cell.lifecycle.lateJoinSnapshotCount = 0; }],
    ['match end evidence erased', report => { const cell = report.results.find(result => result.scenarioId === 'match-end-cleanup'); cell.lifecycle.matchEndTransitionCount = 0; }],
    ['hardware baseline removed', report => { delete report.hardwareEvidence[0].baseline; }],
    ['hardware threshold breach', report => { report.hardwareEvidence[0].observed.cpuP95Ms = report.hardwareEvidence[0].thresholds.cpuP95MaxMs + 1; }],
  ];
  const escaped = [];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(good);
    mutate(candidate);
    if (validateCombatMatrix(candidate, fixtureRoot).length === 0) escaped.push(label);
  }
  return escaped;
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const escaped = runSelfTest();
  if (escaped.length) {
    console.error(`FAIL pass65-combat-matrix self-test escaped=${escaped.length}`);
    for (const label of escaped) console.error(`- ${label}`);
    process.exit(1);
  }
  console.log('PASS pass65-combat-matrix self-test mutations=16');
  process.exit(0);
}
if (args[0] === '--print-impairment-digest') {
  console.log(digest({ version: IMPAIRMENT_VERSION, profiles: PROFILE_ORACLE }));
  process.exit(0);
}
const input = args[0];
if (!input) {
  console.error('usage: node run-pass65-combat-matrix.mjs <combat-matrix-results.json> | --self-test | --print-impairment-digest');
  process.exit(2);
}
let report;
try {
  report = readJson(input);
} catch (error) {
  console.error(`FAIL pass65-combat-matrix unreadable-json ${error.message}`);
  process.exit(2);
}
const failures = validateCombatMatrix(report, path.dirname(path.resolve(input)));
if (failures.length) {
  console.error(`FAIL pass65-combat-matrix ${path.basename(input)} ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS pass65-combat-matrix ${path.basename(input)} profiles=${PROFILE_ORACLE.length} scenarios=${exactScenarios.length} cells=${report.results.length}`);
