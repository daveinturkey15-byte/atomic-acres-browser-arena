#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const syntheticFixture = argv[0] === '--synthetic-fixture';
const input = argv[syntheticFixture ? 1 : 0];
if (!input || argv.length !== (syntheticFixture ? 2 : 1)) {
  console.error('usage: node verify-interactive-world.mjs [--synthetic-fixture] <interactive-world-manifest.json>');
  process.exit(2);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(SCRIPT_DIR, 'fixtures');
const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const CANONICAL_DECISIONS = path.join(REPO_ROOT, 'docs', 'PASS65_DECISION_RECEIPTS.json');
const SYNTHETIC_RECEIPT = path.join(FIXTURE_DIR, 'synthetic-dec-09-receipt.json');

const ARENAS = Object.freeze([
  Object.freeze({ arenaId: 'atomic-acres', displayName: 'Nuke Town' }),
  Object.freeze({ arenaId: 'skyline-terminal', displayName: 'Terminal' }),
  Object.freeze({ arenaId: 'rustworks-1v1', displayName: 'RustRig' }),
  Object.freeze({ arenaId: 'gun-range', displayName: 'Gun Range' }),
]);
const ARENA_IDS = ARENAS.map(({ arenaId }) => arenaId);
const DISPLAY_BY_ID = new Map(ARENAS.map(({ arenaId, displayName }) => [arenaId, displayName]));
const REQUIRED_CONSUMERS = Object.freeze([
  'movement', 'ballistics', 'grenades', 'ai-los', 'support-targeting', 'spawn-nav', 'rendering',
]);
const REQUIRED_SURFACES = Object.freeze(['wall', 'roof', 'door', 'detached-chunk']);
const REQUIRED_OBSTRUCTIONS = Object.freeze(['player', 'major-debris', 'bullet']);
const REQUIRED_EVIDENCE_IDS = Object.freeze([
  'shed-aperture-parity', 'shed-consumer-parity', 'shed-late-join-reset', 'shed-resource-budget', 'shed-vertical-slice',
]);
const REQUIRED_REQUIREMENT_IDS = Object.freeze(Array.from({ length: 14 }, (_, index) => `R${400 + index}`));
const SYNTHETIC_DECISION_VALUE = Object.freeze({
  arenaClassifications: Object.freeze([
    Object.freeze({ arenaId: 'atomic-acres', displayName: 'Nuke Town', classification: 'outdoor', shedEligibleZones: Object.freeze(['whole-arena']), minimumSheds: 2 }),
    Object.freeze({ arenaId: 'skyline-terminal', displayName: 'Terminal', classification: 'mixed', shedEligibleZones: Object.freeze(['terminal-apron']), minimumSheds: 2 }),
    Object.freeze({ arenaId: 'rustworks-1v1', displayName: 'RustRig', classification: 'outdoor', shedEligibleZones: Object.freeze(['whole-arena']), minimumSheds: 2 }),
    Object.freeze({ arenaId: 'gun-range', displayName: 'Gun Range', classification: 'indoor', shedEligibleZones: Object.freeze([]), minimumSheds: 0 }),
  ]),
});

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const gitOidOk = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isoOk = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const unique = values => new Set(values).size === values.length;
const sameOrdered = (left, right) => Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
const sameSet = (left, right) => Array.isArray(left) && unique(left) && left.length === right.length && left.every(value => right.includes(value));
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed, label) {
  check(plainObject(value), `${label} must be an object`);
  if (!plainObject(value)) return false;
  const actual = Object.keys(value);
  for (const key of actual) check(allowed.includes(key), `${label}: unknown key ${key}`);
  for (const key of allowed) check(Object.hasOwn(value, key), `${label}: missing key ${key}`);
  return actual.every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value, key));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  const payload = canonical(value);
  return typeof payload === 'string' ? crypto.createHash('sha256').update(payload).digest('hex') : null;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${label} unreadable JSON: ${error.message}`);
    return null;
  }
}

function repoFile(relativePath, label) {
  check(typeof relativePath === 'string' && relativePath.length > 0, `${label} path missing`);
  if (typeof relativePath !== 'string' || !relativePath) return null;
  const relativeSafe = !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes('..');
  check(relativeSafe, `${label} path must stay repo-relative`);
  if (!relativeSafe) return null;
  const resolved = path.resolve(REPO_ROOT, relativePath);
  const contained = resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${path.sep}`);
  check(contained, `${label} path escapes repository`);
  if (!contained) return null;
  return resolved;
}

let manifest;
if (syntheticFixture && !path.resolve(input).startsWith(`${FIXTURE_DIR}${path.sep}`)) {
  console.error('FAIL interactive-world --synthetic-fixture is restricted to package fixtures');
  process.exit(2);
}
try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL interactive-world unreadable-json ${error.message}`);
  process.exit(2);
}
if (!plainObject(manifest)) {
  console.error('FAIL interactive-world manifest must be a JSON object');
  process.exit(1);
}

exactKeys(manifest, ['schemaVersion', 'sourceSha', 'buildId', 'decisionBinding', 'consumers', 'globalBudgets', 'objects', 'evidenceBinding'], 'manifest');
check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
check(gitOidOk(manifest.sourceSha), 'sourceSha must be the exact 40-hex Git object ID');
check(idOk(manifest.buildId), 'buildId missing or invalid');

const binding = plainObject(manifest.decisionBinding) ? manifest.decisionBinding : {};
exactKeys(binding, ['id', 'scope', 'receiptSha256'], 'decisionBinding');
check(binding.id === 'DEC-09', 'decisionBinding must target DEC-09');
check(shaOk(binding.receiptSha256), 'decision receipt digest invalid');
check(binding.scope === (syntheticFixture ? 'synthetic-fixture-only' : 'canonical-decision-registry'), 'decision binding scope does not match validation mode');

let receipt = null;
if (syntheticFixture) {
  receipt = readJson(SYNTHETIC_RECEIPT, 'synthetic DEC-09 receipt');
  if (receipt) {
    exactKeys(receipt, ['receiptVersion', 'id', 'status', 'syntheticFixtureOnly', 'sourceDecisionStatus', 'value', 'rationale', 'owner', 'recordedAt', 'resolvedAt'], 'synthetic DEC-09 receipt');
    check(receipt.syntheticFixtureOnly === true, 'synthetic receipt must be fixture-only');
    check(receipt.sourceDecisionStatus === 'OPEN', 'synthetic receipt must record the live decision as OPEN');
    check(receipt.owner === 'synthetic-fixture-not-owner-approval', 'synthetic receipt cannot impersonate owner approval');
    check(canonical(receipt.value) === canonical(SYNTHETIC_DECISION_VALUE), 'synthetic DEC-09 value drifted from the Pass 65 decision packet recommendation');
  }
} else {
  const registry = readJson(CANONICAL_DECISIONS, 'canonical decision registry');
  exactKeys(registry, ['$schema', 'schemaVersion', 'releasePass', 'updatedAt', 'receipts'], 'canonical decision registry');
  check(registry?.schemaVersion === 1 && registry?.releasePass === 'PASS 65' && isoOk(registry?.updatedAt), 'canonical decision registry identity invalid');
  receipt = Array.isArray(registry?.receipts) ? registry.receipts.find(item => item?.id === 'DEC-09') : null;
  check(Boolean(receipt), 'canonical DEC-09 receipt missing');
  if (receipt) {
    exactKeys(receipt, ['receiptVersion', 'id', 'status', 'proposedDefault', 'value', 'rationale', 'owner', 'recordedAt', 'resolvedAt', 'freezeNoLaterThan', 'supersedesReceiptSha256'], 'canonical DEC-09 receipt');
  }
}

let classifications = [];
if (receipt) {
  check(receipt.receiptVersion === 1, 'DEC-09 receiptVersion must equal 1');
  check(receipt.id === 'DEC-09', 'decision receipt identity mismatch');
  check(receipt.status === 'FROZEN', 'DEC-09 must be FROZEN before candidate validation');
  check(isoOk(receipt.recordedAt) && isoOk(receipt.resolvedAt), 'DEC-09 receipt timestamps invalid');
  check(typeof receipt.rationale === 'string' && receipt.rationale.length > 0, 'DEC-09 rationale missing');
  check(digest(receipt) === binding.receiptSha256, 'DEC-09 receipt digest mismatch');
  exactKeys(receipt.value, ['arenaClassifications'], 'DEC-09 value');
  classifications = Array.isArray(receipt.value?.arenaClassifications) ? receipt.value.arenaClassifications : [];
}

check(classifications.length === ARENAS.length, 'DEC-09 must classify every canonical arena exactly once');
check(unique(classifications.map(item => item?.arenaId)), 'DEC-09 arena classifications must be unique');
check(sameOrdered(classifications.map(item => item?.arenaId), ARENA_IDS), 'DEC-09 arena classifications must use canonical machine IDs in canonical order');
for (const classificationValue of classifications) {
  const classification = plainObject(classificationValue) ? classificationValue : {};
  check(plainObject(classificationValue), 'DEC-09 arena classification must be an object');
  const label = `DEC-09 arena ${classification?.arenaId ?? '<invalid>'}`;
  exactKeys(classification, ['arenaId', 'displayName', 'classification', 'shedEligibleZones', 'minimumSheds'], label);
  check(ARENA_IDS.includes(classification?.arenaId), `${label}: unknown or retired arena ID`);
  check(classification?.displayName === DISPLAY_BY_ID.get(classification?.arenaId), `${label}: display label does not match canonical machine ID`);
  check(['outdoor', 'mixed', 'indoor'].includes(classification?.classification), `${label}: invalid classification`);
  const zones = Array.isArray(classification?.shedEligibleZones) ? classification.shedEligibleZones : [];
  check(zones.every(idOk) && unique(zones), `${label}: eligible zone IDs invalid or duplicated`);
  if (classification?.classification === 'indoor') {
    check(zones.length === 0 && classification.minimumSheds === 0, `${label}: indoor arena cannot mandate sheds`);
  } else {
    check(zones.length > 0 && Number.isInteger(classification?.minimumSheds) && classification.minimumSheds >= 2, `${label}: shed-eligible arena/zone requires at least two sheds`);
  }
}

const consumers = Array.isArray(manifest.consumers) ? manifest.consumers : [];
check(sameSet(consumers, REQUIRED_CONSUMERS), 'consumers must exactly cover the canonical world-collision consumers');

const globalBudgets = plainObject(manifest.globalBudgets) ? manifest.globalBudgets : {};
exactKeys(globalBudgets, ['maxAperturesPerShed', 'maxDentsPerShed', 'maxMajorChunksPerShed', 'maxAwakeMajorBodiesArenaWide'], 'globalBudgets');
check(globalBudgets.maxAperturesPerShed === 32, 'global aperture cap must equal 32 per shed');
check(globalBudgets.maxDentsPerShed === 24, 'global dent cap must equal 24 per shed');
check(globalBudgets.maxMajorChunksPerShed === 6, 'global major-chunk cap must equal 6 per shed');
check(globalBudgets.maxAwakeMajorBodiesArenaWide === 18, 'global awake-major-body cap must equal 18 arena-wide');

const evidenceBinding = plainObject(manifest.evidenceBinding) ? manifest.evidenceBinding : {};
exactKeys(evidenceBinding, ['scope', 'path', 'receiptSha256'], 'evidenceBinding');
check(evidenceBinding.scope === (syntheticFixture ? 'synthetic-fixture-only' : 'candidate-evidence'), 'evidence binding scope does not match validation mode');
check(shaOk(evidenceBinding.receiptSha256), 'evidence receipt digest invalid');
const expectedSyntheticEvidence = '.agents/skills/atomic-acres-destructible-world/scripts/fixtures/synthetic-shed-evidence.json';
if (syntheticFixture) check(evidenceBinding.path === expectedSyntheticEvidence, 'synthetic evidence path must be the fixed package fixture');
const evidencePath = repoFile(evidenceBinding.path, 'evidence receipt');
const evidence = evidencePath ? readJson(evidencePath, 'shed evidence receipt') : null;
if (evidence) {
  exactKeys(evidence, ['evidenceVersion', 'syntheticFixtureOnly', 'sourceSha', 'buildId', 'verifierId', 'verifierVersion', 'requirementIds', 'evidenceIds', 'artifactPath', 'artifactSha256', 'result', 'attestation'], 'shed evidence receipt');
  check(evidence.evidenceVersion === 1, 'evidenceVersion must equal 1');
  check(evidence.syntheticFixtureOnly === syntheticFixture, 'evidence synthetic scope mismatch');
  check(evidence.sourceSha === manifest.sourceSha && evidence.buildId === manifest.buildId, 'evidence source/build identity mismatch');
  check(idOk(evidence.verifierId) && idOk(evidence.verifierVersion), 'evidence verifier identity invalid');
  check(sameSet(evidence.requirementIds, REQUIRED_REQUIREMENT_IDS), 'evidence requirements must exactly cover R400-R413');
  check(sameSet(evidence.evidenceIds, REQUIRED_EVIDENCE_IDS), 'evidence IDs must exactly cover the shed stop gate');
  check(evidence.result === 'passed', 'shed evidence result must be passed');
  check(shaOk(evidence.artifactSha256), 'shed evidence artifact digest invalid');
  exactKeys(evidence.attestation, ['reviewerId', 'reviewedAt', 'statement'], 'shed evidence attestation');
  check(idOk(evidence.attestation?.reviewerId), 'evidence reviewer identity invalid');
  check(isoOk(evidence.attestation?.reviewedAt), 'evidence review timestamp invalid');
  check(typeof evidence.attestation?.statement === 'string' && evidence.attestation.statement.length >= 20, 'evidence attestation statement missing');
  const artifactPath = repoFile(evidence.artifactPath, 'shed evidence artifact');
  if (artifactPath) {
    check(fs.existsSync(artifactPath), 'shed evidence artifact missing');
    if (fs.existsSync(artifactPath)) {
      const artifactDigest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
      check(artifactDigest === evidence.artifactSha256, 'shed evidence artifact digest mismatch');
    }
  }
  check(digest(evidence) === evidenceBinding.receiptSha256, 'shed evidence receipt digest mismatch');
}

const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
check(objects.length > 0, 'objects must be a non-empty array');
check(unique(objects.map(item => item?.id)), 'object IDs must be unique');
for (const objectValue of objects) {
  const object = plainObject(objectValue) ? objectValue : {};
  check(plainObject(objectValue), 'object entry must be an object');
  const label = idOk(object?.id) ? object.id : '<invalid-id>';
  exactKeys(object, ['id', 'kind', 'authority', 'revisioned', 'worldCollisionSnapshotId', 'collisionPolicyId', 'materialPolicyId', 'damageThresholds', 'maxDentsPerObject', 'preauthoredChunkIds', 'lods', 'placements', 'door', 'apertures', 'surfaces', 'debris', 'persistence', 'lifecycle', 'budgets', 'provenance', 'evidenceIds'], label);
  check(idOk(object?.id), `${label}: invalid id`);
  check(object?.kind === 'destructible-shed', `${label}: unsupported kind`);
  check(object?.authority === 'host', `${label}: authority must be host`);
  check(object?.revisioned === true, `${label}: state must be revisioned`);
  check(object?.worldCollisionSnapshotId === 'world-collision-v1', `${label}: canonical snapshot identity invalid`);
  check(idOk(object?.collisionPolicyId) && idOk(object?.materialPolicyId), `${label}: collision/material policy identity invalid`);

  exactKeys(object?.damageThresholds, ['dent', 'perforate', 'detach'], `${label}.damageThresholds`);
  const thresholds = object?.damageThresholds ?? {};
  check(Number.isInteger(thresholds.dent) && Number.isInteger(thresholds.perforate) && Number.isInteger(thresholds.detach), `${label}: damage thresholds must be integers`);
  check(finite(thresholds.dent, 1, 1000000) && finite(thresholds.perforate, 1, 1000000) && finite(thresholds.detach, 1, 1000000), `${label}: damage threshold out of bounds`);
  check(thresholds.dent < thresholds.perforate && thresholds.perforate < thresholds.detach, `${label}: damage thresholds must increase dent < perforate < detach`);
  check(object?.maxDentsPerObject === 24, `${label}: max dents must equal the global cap 24`);

  const placements = Array.isArray(object?.placements) ? object.placements : [];
  const placementKeys = placements.map(item => `${item?.arenaId}/${item?.zoneId}`);
  check(unique(placementKeys), `${label}: placement arena/zone rows must be unique`);
  for (const placementValue of placements) {
    const placement = plainObject(placementValue) ? placementValue : {};
    check(plainObject(placementValue), `${label}.placement must be an object`);
    exactKeys(placement, ['arenaId', 'zoneId', 'count'], `${label}.placement`);
    check(ARENA_IDS.includes(placement?.arenaId), `${label}: placement uses unknown or retired arena ID ${placement?.arenaId}`);
    check(idOk(placement?.zoneId), `${label}: placement zone ID invalid`);
    check(Number.isInteger(placement?.count) && placement.count >= 0 && placement.count <= 64, `${label}: placement count invalid`);
  }
  const requiredPlacementKeys = [];
  for (const classification of classifications) {
    for (const zoneId of classification?.shedEligibleZones ?? []) {
      const key = `${classification.arenaId}/${zoneId}`;
      requiredPlacementKeys.push(key);
      const row = placements.find(item => `${item?.arenaId}/${item?.zoneId}` === key);
      check(Boolean(row) && row.count >= classification.minimumSheds, `${label}: ${key} must place at least ${classification.minimumSheds} sheds`);
    }
  }
  check(sameSet(placementKeys, requiredPlacementKeys), `${label}: placements must exactly match DEC-09 shed-eligible arena zones`);

  exactKeys(object?.door, ['durationMs', 'commandSequenced', 'canonicalTicks', 'hostAdmission', 'obstructionKinds', 'obstructionPolicy', 'trajectoryFields'], `${label}.door`);
  const door = object?.door ?? {};
  check(door.durationMs === 1000, `${label}: door duration must equal 1000ms`);
  check(door.commandSequenced === true && door.canonicalTicks === true, `${label}: door command/tick sequencing missing`);
  exactKeys(door.hostAdmission, ['hostOnly', 'requiresRange', 'requiresLineOfSight'], `${label}.door.hostAdmission`);
  check(door.hostAdmission?.hostOnly === true && door.hostAdmission?.requiresRange === true && door.hostAdmission?.requiresLineOfSight === true, `${label}: door admission must be host/range/LOS guarded`);
  check(sameSet(door.obstructionKinds, REQUIRED_OBSTRUCTIONS), `${label}: door obstruction kinds incomplete or unknown`);
  check(['reverse-resume', 'pause-resume'].includes(door.obstructionPolicy), `${label}: invalid obstruction policy`);
  check(sameSet(door.trajectoryFields, ['command-id', 'command-sequence', 'target-angle', 'direction', 'started-tick', 'completes-tick', 'blocked-by', 'resume-policy']), `${label}: reconstructible door trajectory fields incomplete`);

  exactKeys(object?.apertures, ['canonicalSharedRepresentation', 'maxPerObject', 'saturation'], `${label}.apertures`);
  check(object.apertures?.canonicalSharedRepresentation === true, `${label}: render/ballistics aperture parity missing`);
  check(object.apertures?.maxPerObject === 32, `${label}: aperture cap must equal 32`);
  check(['merge-exact-region', 'exact-or-fail-closed'].includes(object.apertures?.saturation), `${label}: aperture saturation policy invalid`);
  check(sameSet(object?.surfaces, REQUIRED_SURFACES), `${label}: surface roles incomplete or unknown`);

  exactKeys(object?.debris, ['maxMajorChunks', 'hostSimulated', 'shotWakeFlat', 'explosionWakeFlat', 'contactNudgeNonFlat', 'awakeArenaWideCap'], `${label}.debris`);
  check(object.debris?.maxMajorChunks === 6, `${label}: major debris cap must equal 6`);
  check(object.debris?.hostSimulated === true, `${label}: major debris must be host simulated`);
  check(object.debris?.shotWakeFlat === true && object.debris?.explosionWakeFlat === true && object.debris?.contactNudgeNonFlat === true, `${label}: debris wake/nudge policy incomplete`);
  check(object.debris?.awakeArenaWideCap === 18, `${label}: awake debris cap must equal 18 arena-wide`);
  const chunkIds = Array.isArray(object?.preauthoredChunkIds) ? object.preauthoredChunkIds : [];
  check(chunkIds.length === 6 && chunkIds.every(idOk) && unique(chunkIds), `${label}: exactly six unique pre-authored chunk IDs required`);

  const lods = Array.isArray(object?.lods) ? object.lods : [];
  check(lods.length >= 2 && lods.length <= 8, `${label}: bounded LOD definitions missing`);
  check(unique(lods.map(lod => lod?.id)), `${label}: LOD IDs must be unique`);
  for (let index = 0; index < lods.length; index += 1) {
    const lod = lods[index] ?? {};
    exactKeys(lod, ['id', 'maxDistanceM', 'triangleBudget'], `${label}.lod[${index}]`);
    check(idOk(lod.id), `${label}: invalid LOD ID`);
    check(finite(lod.maxDistanceM, 0.01, 10000), `${label}: LOD distance invalid`);
    check(Number.isInteger(lod.triangleBudget) && lod.triangleBudget >= 1 && lod.triangleBudget <= 250000, `${label}: LOD triangle budget invalid`);
    if (index > 0) {
      check(lod.maxDistanceM > lods[index - 1]?.maxDistanceM, `${label}: LOD distances must increase`);
      check(lod.triangleBudget <= lods[index - 1]?.triangleBudget, `${label}: LOD triangle budgets must not increase`);
    }
  }

  exactKeys(object?.persistence, ['lateJoin', 'resetOnRematch', 'resetOnArenaChange', 'matchEpochRequired', 'snapshotHashAlgorithm'], `${label}.persistence`);
  check(object.persistence?.lateJoin === true && object.persistence?.resetOnRematch === true && object.persistence?.resetOnArenaChange === true, `${label}: persistence/reset policy incomplete`);
  check(object.persistence?.matchEpochRequired === true && object.persistence?.snapshotHashAlgorithm === 'sha256', `${label}: epoch/hash reconstruction policy incomplete`);
  exactKeys(object?.lifecycle, ['generationAware', 'idempotentDispose', 'settlesAfterRematch', 'settlesAfterArenaSwitch'], `${label}.lifecycle`);
  check(Object.values(object.lifecycle ?? {}).every(value => value === true), `${label}: lifecycle/disposal policy incomplete`);

  exactKeys(object?.budgets, ['maxStateBytes', 'maxCollisionQueriesPerTick', 'maxNetworkBytesPerSnapshot', 'maxParticlesPerShed'], `${label}.budgets`);
  check(Number.isInteger(object.budgets?.maxStateBytes) && finite(object.budgets.maxStateBytes, 1, 1048576), `${label}: state-byte budget invalid`);
  check(Number.isInteger(object.budgets?.maxCollisionQueriesPerTick) && finite(object.budgets.maxCollisionQueriesPerTick, 1, 10000), `${label}: collision-query budget invalid`);
  check(Number.isInteger(object.budgets?.maxNetworkBytesPerSnapshot) && finite(object.budgets.maxNetworkBytesPerSnapshot, 1, 1048576), `${label}: network snapshot budget invalid`);
  check(Number.isInteger(object.budgets?.maxParticlesPerShed) && finite(object.budgets.maxParticlesPerShed, 0, 10000), `${label}: particle budget invalid`);

  exactKeys(object?.provenance, ['source', 'license', 'derivativeNotes', 'sha256'], `${label}.provenance`);
  check(typeof object.provenance?.source === 'string' && object.provenance.source.length > 0, `${label}: provenance source missing`);
  check(typeof object.provenance?.license === 'string' && object.provenance.license.length > 0, `${label}: provenance license missing`);
  check(typeof object.provenance?.derivativeNotes === 'string' && object.provenance.derivativeNotes.length > 0, `${label}: provenance derivative notes missing`);
  check(shaOk(object.provenance?.sha256), `${label}: provenance digest invalid`);
  check(sameSet(object?.evidenceIds, REQUIRED_EVIDENCE_IDS), `${label}: evidence IDs must exactly bind the signed vertical-slice receipt`);
}

if (failures.length) {
  console.error(`FAIL interactive-world ${path.basename(input)} ${new Set(failures).size}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS interactive-world ${path.basename(input)} objects=${objects.length} arenas=${classifications.length} receipt=${binding.receiptSha256.slice(0, 12)} evidence=${evidenceBinding.receiptSha256.slice(0, 12)}`);
