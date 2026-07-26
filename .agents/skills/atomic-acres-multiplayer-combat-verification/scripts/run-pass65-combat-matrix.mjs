#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node run-pass65-combat-matrix.mjs <combat-matrix-results.json>');
  process.exit(2);
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
let report;

try {
  report = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL pass65-combat-matrix unreadable-json ${error.message}`);
  process.exit(2);
}

const requiredScenarios = [
  'solo-host-bots',
  'two-peer-private',
  'host-guest-bot',
  'life-action-revision-races',
  'weapon-command-forgery',
  'ordnance-duplicate-stale',
  'support-reward-forgery',
  'shed-revision-forgery',
  'reconnect-rematch-repair',
  'pose-history-dynamic-geometry',
  'exactly-once-outcomes'
];

check(report.schemaVersion === 1, 'schemaVersion must equal 1');
for (const field of ['sourceSha', 'environmentHash', 'acceptanceDigest']) check(shaOk(report?.identity?.[field]), `identity ${field} invalid`);
check(idOk(report?.identity?.buildId), 'identity buildId invalid');
check(report?.identity?.dirtyWorktree === false, 'dirty worktree cannot pass');
check(report?.identity?.immutableBuild === true, 'build identity must be immutable');
check(report?.acceptance?.frozen === true, 'acceptance manifest must be frozen');
check(Array.isArray(report?.acceptance?.requirementIds) && report.acceptance.requirementIds.length > 0 && report.acceptance.requirementIds.every(idOk), 'acceptance requirement IDs invalid');
check(Array.isArray(report?.acceptance?.falsifierIds) && report.acceptance.falsifierIds.length > 0 && report.acceptance.falsifierIds.every(idOk), 'acceptance falsifier IDs invalid');

const profiles = Array.isArray(report?.impairmentManifest?.profiles) ? report.impairmentManifest.profiles : [];
check(idOk(report?.impairmentManifest?.version), 'impairment manifest version invalid');
check(profiles.length > 0, 'impairment profiles missing');
const profileIds = profiles.map(profile => profile?.id);
check(new Set(profileIds).size === profileIds.length, 'impairment profile IDs must be unique');
for (const profile of profiles) {
  const label = idOk(profile?.id) ? profile.id : '<invalid-profile>';
  check(idOk(profile?.id), `${label}: invalid profile ID`);
  check(finite(profile?.delayMs, 0, 10000), `${label}: delay invalid`);
  check(finite(profile?.jitterMs, 0, 10000), `${label}: jitter invalid`);
  check(finite(profile?.lossPercent, 0, 100), `${label}: loss invalid`);
  check(finite(profile?.duplicatePercent, 0, 100), `${label}: duplication invalid`);
  check(finite(profile?.reorderPercent, 0, 100), `${label}: reorder invalid`);
  check(Number.isInteger(profile?.seed) && profile.seed >= 0, `${label}: seed invalid`);
  check(finite(profile?.durationSeconds, 1, 86400), `${label}: duration invalid`);
  check(Number.isInteger(profile?.eventCount) && profile.eventCount >= 1, `${label}: eventCount invalid`);
  check(finite(profile?.repairDeadlineMs, 1, 60000), `${label}: repair deadline invalid`);
  check(profile?.expectFinalHashEquality === true, `${label}: final hash equality must be expected`);
}

const results = Array.isArray(report.results) ? report.results : [];
const cellKeys = results.map(result => `${result?.profileId}/${result?.scenarioId}`);
check(new Set(cellKeys).size === cellKeys.length, 'matrix cells must be unique');
for (const scenario of requiredScenarios) {
  for (const profileId of profileIds) check(cellKeys.includes(`${profileId}/${scenario}`), `missing matrix cell ${profileId}/${scenario}`);
}

for (const result of results) {
  const label = `${result?.profileId ?? '<profile>'}/${result?.scenarioId ?? '<scenario>'}`;
  check(profileIds.includes(result?.profileId), `${label}: unknown profile`);
  check(requiredScenarios.includes(result?.scenarioId), `${label}: unknown scenario`);
  check(result?.status === 'passed', `${label}: status must be passed`);
  check(result?.cleanupPassed === true, `${label}: cleanup failed or missing`);
  check(result?.finalHashEqual === true, `${label}: final hash diverged`);
  check(result?.withinRepairDeadline === true, `${label}: repair deadline missed`);
  check(Array.isArray(result?.requirementIds) && result.requirementIds.length > 0 && result.requirementIds.every(idOk), `${label}: requirement evidence missing`);
  check(Array.isArray(result?.falsifierIds) && result.falsifierIds.length > 0 && result.falsifierIds.every(idOk), `${label}: falsifier evidence missing`);
  check(typeof result?.commandOrFixture === 'string' && result.commandOrFixture.length > 0, `${label}: command or fixture missing`);
  check(typeof result?.expected === 'string' && result.expected.length > 0, `${label}: expected value missing`);
  check(typeof result?.observed === 'string' && result.observed.length > 0, `${label}: observed value missing`);
  check(shaOk(result?.artifactSha256), `${label}: artifact digest invalid`);
  check(result?.sourceSha === report?.identity?.sourceSha, `${label}: source identity mismatch`);
  check(result?.buildId === report?.identity?.buildId, `${label}: build identity mismatch`);
  check(result?.environmentHash === report?.identity?.environmentHash, `${label}: environment identity mismatch`);
}

const hardware = report.hardwareEvidence ?? {};
for (const field of ['os', 'browser', 'adapter', 'backend', 'resolution']) check(typeof hardware[field] === 'string' && hardware[field].length > 0, `hardware ${field} missing`);
check(shaOk(hardware.settingsHash), 'hardware settingsHash invalid');
check(Number.isInteger(hardware.warmupSamples) && hardware.warmupSamples >= 1, 'hardware warmupSamples invalid');
check(Number.isInteger(hardware.measuredSamples) && hardware.measuredSamples >= 1, 'hardware measuredSamples invalid');
check(finite(hardware.cpuP95Ms, 0, 1000), 'hardware CPU p95 invalid');
check(finite(hardware.gpuOrProxyP95Ms, 0, 1000), 'hardware GPU/proxy p95 invalid');
check(['gpu-time', 'queue-proxy'].includes(hardware.gpuMetricKind), 'hardware GPU metric kind must be honest');

if (failures.length) {
  console.error(`FAIL pass65-combat-matrix ${path.basename(input)} ${new Set(failures).size}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS pass65-combat-matrix ${path.basename(input)} profiles=${profiles.length} scenarios=${requiredScenarios.length} cells=${results.length}`);
