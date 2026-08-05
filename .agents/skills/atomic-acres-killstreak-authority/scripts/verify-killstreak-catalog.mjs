#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARE_PACKAGE_ID, NUKE_ID, deriveCarePackagePool } from './care-package-weights.mjs';

const argv = process.argv.slice(2);
const syntheticFixture = argv[0] === '--synthetic-fixture';
const input = argv[syntheticFixture ? 1 : 0];
if (!input || argv.length !== (syntheticFixture ? 2 : 1)) {
  console.error('usage: node verify-killstreak-catalog.mjs [--synthetic-fixture] <support-manifest.json>');
  process.exit(2);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(SCRIPT_DIR, 'fixtures');
const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const CANONICAL_DECISIONS = path.join(REPO_ROOT, 'docs', 'PASS65_DECISION_RECEIPTS.json');
const DRONE_GUN_ID = 'drone-gun-standard-v1';
const AVAILABILITY = Object.freeze(['selectable', 'care-only', 'retired']);
const TIERS = Object.freeze(['low', 'mid', 'high', 'top']);
const ACTIVATIONS = Object.freeze(['instant', 'target-point', 'target-line', 'possession']);
const KINDS = Object.freeze(['aircraft', 'parachute-crate', 'chopper', 'drone']);
const GUN_PROFILE_ORACLE = Object.freeze([
  Object.freeze({
    id: 'drone-gun-standard-v1',
    definition: Object.freeze({ damage: 10, rpm: 600, falloffStartM: 10, falloffEndM: 45, penetration: 10, magazineSize: 20, reloadMs: 2000 }),
    sha256: 'e1ab6c3d563caf939c66308ec89d7b72ea7df6ab1b0c695e52b543da2fd6e114',
  }),
  Object.freeze({
    id: 'chopper-gun-v1',
    definition: Object.freeze({ damage: 20, rpm: 450, falloffStartM: 30, falloffEndM: 150, penetration: 20, magazineSize: 64, reloadMs: 3000 }),
    sha256: 'b4fd974f6501fbc26fac74d9c5cc9108dd862fe88f0b80e9c9db1196e1ff999a',
  }),
]);
const REQUIRED_REQUIREMENT_IDS = Object.freeze(Array.from({ length: 13 }, (_, index) => `R${500 + index}`));
const REQUIRED_EVIDENCE_IDS = Object.freeze([
  'care-pool-completeness', 'killstreak-catalog-exactness', 'privacy-reveal-boundary', 'support-authority', 'support-budget', 'support-lifecycle',
]);
const EXPECTED_SUPPORT_BINDINGS = Object.freeze({
  adrenaline: Object.freeze([]),
  'care-package': Object.freeze(['care-package-aircraft', 'care-package-crate']),
  yardhawk: Object.freeze(['yardhawk-entity']),
  'piloted-drone': Object.freeze(['piloted-drone-entity']),
  'tri-pass': Object.freeze(['tri-pass-entity']),
  'carpet-bomber': Object.freeze(['carpet-bomber-entity']),
  'hunter-swarm': Object.freeze(['hunter-swarm-entity']),
  chopper: Object.freeze(['chopper-entity']),
  'drone-swarm': Object.freeze(['drone-swarm-entity']),
  nuke: Object.freeze([]),
  'scout-sweep': Object.freeze([]),
});
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const relationshipOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(value);
const gitOidOk = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isoOk = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const unique = values => new Set(values).size === values.length;
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

function authoredDecisionProjection(item) {
  return {
    id: item?.id,
    displayName: item?.displayName,
    cost: item?.cost,
    tier: item?.tier,
    availability: item?.availability,
    carePackageBaseWeightUnits: item?.carePackageBaseWeightUnits,
    relationship: item?.relationship,
    activation: item?.activation,
    durationMs: item?.durationMs,
    repeatable: item?.repeatable,
  };
}

let manifest;
if (syntheticFixture && !path.resolve(input).startsWith(`${FIXTURE_DIR}${path.sep}`)) {
  console.error('FAIL killstreak-catalog --synthetic-fixture is restricted to package fixtures');
  process.exit(2);
}
try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL killstreak-catalog unreadable-json ${error.message}`);
  process.exit(2);
}
if (!plainObject(manifest)) {
  console.error('FAIL killstreak-catalog manifest must be a JSON object');
  process.exit(1);
}

exactKeys(manifest, ['schemaVersion', 'sourceSha', 'buildId', 'decisionBinding', 'catalog', 'loadout', 'selectionPolicy', 'earningPolicy', 'activationPolicy', 'privacyPolicy', 'gunProfiles', 'supportDefinitions', 'provenance', 'evidenceBinding'], 'manifest');
check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
check(gitOidOk(manifest.sourceSha), 'sourceSha must be the exact 40-hex Git object ID');
check(idOk(manifest.buildId), 'buildId missing or invalid');

const binding = plainObject(manifest.decisionBinding) ? manifest.decisionBinding : {};
exactKeys(binding, ['id', 'scope', 'receiptSha256'], 'decisionBinding');
check(binding.id === 'DEC-13', 'decisionBinding must target DEC-13');
check(binding.scope === (syntheticFixture ? 'synthetic-fixture-only' : 'canonical-decision-registry'), 'decision binding scope does not match validation mode');
check(shaOk(binding.receiptSha256), 'decision receipt digest invalid');

const registry = readJson(CANONICAL_DECISIONS, 'canonical decision registry');
exactKeys(registry, ['$schema', 'schemaVersion', 'releasePass', 'updatedAt', 'receipts'], 'canonical decision registry');
check(registry?.schemaVersion === 1 && registry?.releasePass === 'PASS 65' && isoOk(registry?.updatedAt), 'canonical decision registry identity invalid');
const receipt = Array.isArray(registry?.receipts) ? registry.receipts.find(item => item?.id === 'DEC-13') : null;
check(Boolean(receipt), 'canonical DEC-13 receipt missing');
if (receipt) exactKeys(receipt, ['receiptVersion', 'id', 'status', 'proposedDefault', 'value', 'rationale', 'owner', 'recordedAt', 'resolvedAt', 'freezeNoLaterThan', 'supersedesReceiptSha256'], 'canonical DEC-13 receipt');

let decision = {};
if (receipt) {
  check(receipt.receiptVersion === 1 && receipt.id === 'DEC-13', 'DEC-13 receipt identity invalid');
  check(receipt.status === 'FROZEN', 'DEC-13 must be FROZEN before candidate validation');
  check(isoOk(receipt.recordedAt) && isoOk(receipt.resolvedAt), 'DEC-13 receipt timestamps invalid');
  check(typeof receipt.rationale === 'string' && receipt.rationale.length > 0, 'DEC-13 rationale missing');
  check(digest(receipt) === binding.receiptSha256, 'DEC-13 receipt digest mismatch');
  exactKeys(receipt.value, [
    'catalog', 'selectionPolicy', 'carePackagePolicy', 'earningPolicy', 'activationPolicy', 'privacyPolicy',
    'chopperCalibration', 'droneSwarmCalibration', 'pilotedDroneSensor', 'pilotedDroneDeployment', 'carpetBomber',
  ], 'DEC-13 value');
  decision = receipt.value ?? {};
}

const decisionCatalog = Array.isArray(decision.catalog) ? decision.catalog : [];
check(decisionCatalog.length === 11 && unique(decisionCatalog.map(item => item?.id)), 'DEC-13 must contain one unique row for the complete 11-row catalog');
for (const itemValue of decisionCatalog) {
  const item = plainObject(itemValue) ? itemValue : {};
  check(plainObject(itemValue), 'DEC-13 catalog entry must be an object');
  exactKeys(item, ['id', 'displayName', 'cost', 'tier', 'availability', 'carePackageBaseWeightUnits', 'carePackageWeightUnits', 'relationship', 'activation', 'durationMs', 'repeatable'], `DEC-13 catalog ${item?.id ?? '<invalid>'}`);
  check(idOk(item?.id), 'DEC-13 catalog ID invalid');
  check(typeof item?.displayName === 'string' && item.displayName.trim().length > 0 && item.displayName.length <= 80, `${item?.id}: DEC-13 display name invalid`);
  check(Number.isSafeInteger(item?.cost) && item.cost >= 1 && item.cost <= 100, `${item?.id}: DEC-13 cost invalid`);
  check(TIERS.includes(item?.tier), `${item?.id}: DEC-13 tier invalid`);
  check(AVAILABILITY.includes(item?.availability), `${item?.id}: DEC-13 availability invalid`);
  check(Number.isSafeInteger(item?.carePackageBaseWeightUnits) && item.carePackageBaseWeightUnits >= 0, `${item?.id}: DEC-13 care base weight invalid`);
  check(Number.isSafeInteger(item?.carePackageWeightUnits) && item.carePackageWeightUnits >= 0, `${item?.id}: DEC-13 care weight invalid`);
  check(relationshipOk(item?.relationship), `${item?.id}: DEC-13 relationship invalid`);
  check(ACTIVATIONS.includes(item?.activation), `${item?.id}: DEC-13 activation invalid`);
  check(Number.isInteger(item?.durationMs) && item.durationMs >= 0 && item.durationMs <= 600000, `${item?.id}: DEC-13 duration invalid`);
  check(typeof item?.repeatable === 'boolean', `${item?.id}: DEC-13 repeatability invalid`);
}
let decisionDerivedPool = null;
try {
  decisionDerivedPool = deriveCarePackagePool(decisionCatalog);
} catch (error) {
  check(false, `DEC-13 care-package formula invalid: ${error.message}`);
}
for (const item of decisionCatalog) {
  check(item?.carePackageWeightUnits === (decisionDerivedPool?.derivedWeights.get(item?.id) ?? -1), `${item?.id}: DEC-13 derived care weight is stale`);
}

exactKeys(decision.selectionPolicy, ['slotCount', 'duplicatesAllowed', 'freezeAt', 'keyBindings', 'slots', 'mutuallyExclusiveGroups'], 'DEC-13 selectionPolicy');
exactKeys(decision.carePackagePolicy, ['eligibilityPredicate', 'inclusionCardinality', 'futureCatalogEntries', 'recomputeTrigger', 'normalization', 'fixedProbability', 'algorithm', 'currentNonNukeBaseWeightTotal', 'currentDerivedWeightTotal', 'scoutSweepWeightClass', 'recursiveIdsExcluded', 'retiredEntriesExcluded', 'validatorPolicy'], 'DEC-13 carePackagePolicy');
exactKeys(decision.earningPolicy, ['progressScope', 'advancingKillSources', 'excludedKillSources', 'eachRewardEarnsOncePerCycle', 'cycleRepeatsAfterFinalThresholdWhileLifeActive', 'nextCycleProgressStartsAtZero', 'deathClearsProgress', 'deathClearsUnconsumedRewards', 'unconsumedRewardLifetime', 'respawnStartsFreshLife', 'rematchStartsFreshEpoch'], 'DEC-13 earningPolicy');
exactKeys(decision.activationPolicy, ['hostOwnsActivation', 'consumesExactlyOnce', 'duplicateOwnerTypePolicy'], 'DEC-13 activationPolicy');
exactKeys(decision.privacyPolicy, ['rewardSeedRollHostOnly', 'acquisitionStateHostOnly', 'rewardRevealPolicy', 'recipientSnapshotOmitsSeedAndRoll'], 'DEC-13 privacyPolicy');
exactKeys(decision.droneSwarmCalibration, ['count', 'healthEach', 'magazineSize', 'reservePolicy', 'maximumLifetimeMs', 'spawnOrigin', 'minimumSpawnSeparationM', 'ingress', 'formation', 'routePolicy', 'targets', 'rejects', 'survivalIntent'], 'DEC-13 droneSwarmCalibration');
exactKeys(decision.pilotedDroneDeployment, ['modeChoiceRequired', 'allowedModes', 'spawnOrigin', 'minimumSpawnSeparationM', 'inputConvention', 'manualHorizontalSpeedMps', 'autonomousStandaloneSpeedMultiplier', 'autonomousStandaloneSpeedMps', 'sharedAssetFamilyWithDroneSwarm', 'sharedGunProfileId', 'variantDifferencesLimitedTo'], 'DEC-13 pilotedDroneDeployment');
exactKeys(decision.carpetBomber, ['playerInput', 'targetingLifecycle', 'sharedGroundMarker', 'callerFlightPathPreview', 'ingressAndOrientation', 'impactCount', 'pattern', 'damageMultiplierFromPreviousFrozenProfile', 'payloadPresentation'], 'DEC-13 carpetBomber');
check(decision.selectionPolicy?.slotCount === 5 && decision.selectionPolicy?.duplicatesAllowed === false, 'DEC-13 must explicitly require five distinct slots');
check(decision.selectionPolicy?.freezeAt === 'match-start', 'DEC-13 selection freeze policy invalid');
check(canonical(decision.selectionPolicy?.keyBindings) === canonical([3, 4, 5, 6, 7]), 'DEC-13 slot keys must equal 3-7');
const expectedSlots = [
  { slot: 1, allowedIds: ['scout-sweep', 'adrenaline', 'care-package'] },
  { slot: 2, allowedIds: ['yardhawk', 'piloted-drone'] },
  { slot: 3, allowedIds: ['tri-pass', 'carpet-bomber', 'hunter-swarm', 'chopper'] },
  { slot: 4, allowedIds: ['tri-pass', 'carpet-bomber', 'hunter-swarm', 'chopper'] },
  { slot: 5, allowedIds: ['nuke', 'drone-swarm'] },
];
check(canonical(decision.selectionPolicy?.slots) === canonical(expectedSlots), 'DEC-13 slot families drifted');
check(canonical(decision.selectionPolicy?.mutuallyExclusiveGroups) === canonical([['nuke', 'drone-swarm']]), 'DEC-13 Nuke/Drone exclusion missing');
check(decision.carePackagePolicy?.eligibilityPredicate === 'availability-is-not-retired-and-id-is-not-care-package', 'DEC-13 care eligibility predicate invalid');
check(decision.carePackagePolicy?.inclusionCardinality === 'exactly-once' && decision.carePackagePolicy?.normalization === 'exact-safe-integer-units', 'DEC-13 care inclusion/normalization invalid');
check(decision.carePackagePolicy?.futureCatalogEntries === 'automatically-eligible-when-nonretired-nonrecursive-and-positive-base-weight', 'DEC-13 future catalog enrollment invalid');
check(decision.carePackagePolicy?.recomputeTrigger === 'every-catalog-change-including-add-rename-retire-cost-or-weight', 'DEC-13 recompute trigger invalid');
check(canonical(decision.carePackagePolicy?.fixedProbability) === canonical({ id: 'nuke', numerator: 1, denominator: 100 }), 'DEC-13 fixed Nuke probability invalid');
check(decision.carePackagePolicy?.algorithm === 'Let S be the sum of non-Nuke eligible base weights; each non-Nuke derived weight is baseWeight*99, Nuke derived weight is S, and total derived weight is 100*S', 'DEC-13 care formula text drifted');
check(decision.carePackagePolicy?.scoutSweepWeightClass === 'highest', 'DEC-13 Scout Sweep weight class invalid');
check(canonical(decision.carePackagePolicy?.recursiveIdsExcluded) === canonical([CARE_PACKAGE_ID]), 'DEC-13 recursive exclusion invalid');
check(decision.carePackagePolicy?.retiredEntriesExcluded === true, 'DEC-13 retired-entry exclusion invalid');
check(decision.carePackagePolicy?.validatorPolicy === 'catalog-set-equality-plus-forced-every-reward-plus-formula-recomputation', 'DEC-13 care validator policy invalid');
check(decision.earningPolicy?.progressScope === 'per-life' && decision.earningPolicy?.deathClearsProgress === true, 'per-life progress must reset on death');
check(decision.earningPolicy?.eachRewardEarnsOncePerCycle === true && decision.earningPolicy?.cycleRepeatsAfterFinalThresholdWhileLifeActive === true && decision.earningPolicy?.nextCycleProgressStartsAtZero === true, 'killstreak ladder must repeat from zero after the final threshold while the same life remains active');
check(decision.earningPolicy?.deathClearsUnconsumedRewards === false, 'death must retain unconsumed rewards');
check(decision.earningPolicy?.unconsumedRewardLifetime === 'until-consumed-or-match-epoch-ends', 'unconsumed reward lifetime invalid');
check(decision.droneSwarmCalibration?.count === 24 && decision.droneSwarmCalibration?.healthEach === 50 && decision.droneSwarmCalibration?.magazineSize === 20 && decision.droneSwarmCalibration?.maximumLifetimeMs === 60000, 'DEC-13 Drone Swarm numeric calibration invalid');
check(decision.droneSwarmCalibration?.spawnOrigin === 'deterministic-valid-centre-map-volume' && decision.droneSwarmCalibration?.minimumSpawnSeparationM === 1.15 && decision.droneSwarmCalibration?.ingress === 'fast-then-smooth-normal-speed' && decision.droneSwarmCalibration?.formation === 'distributed-individual-or-small-groups' && decision.droneSwarmCalibration?.routePolicy === 'host-seeded-divergent-valid-map-directions', 'DEC-13 Drone Swarm spawn/ingress/formation/route policy invalid');
check(decision.carpetBomber?.playerInput === 'crosshair-ground-anchor-no-overview-map' && decision.carpetBomber?.targetingLifecycle === 'care-package-style-crosshair-preview-commit-aircraft-resolve' && decision.carpetBomber?.sharedGroundMarker === 'large-red-x-at-admitted-anchor' && decision.carpetBomber?.callerFlightPathPreview === 'red-map-bounded-payload-corridor' && decision.carpetBomber?.ingressAndOrientation === 'host-seeded-valid-random' && decision.carpetBomber?.impactCount === 20 && decision.carpetBomber?.pattern === 'bounded-zigzag' && decision.carpetBomber?.damageMultiplierFromPreviousFrozenProfile === 3, 'DEC-13 Carpet Bomber targeting/lifecycle/damage policy invalid');
check(sameSet(decision.carpetBomber?.payloadPresentation, ['visible-falling-shell', 'large-bounded-explosion', 'smoke', 'fire', 'spatial-audio']), 'DEC-13 Carpet Bomber payload presentation incomplete');
check(canonical(decision.pilotedDroneDeployment) === canonical({
  modeChoiceRequired: true,
  allowedModes: ['autonomous', 'first-person-owner-control'],
  spawnOrigin: 'deterministic-valid-centre-map-volume',
  minimumSpawnSeparationM: 1.15,
  inputConvention: 'non-inverted-screen-space-keyboard-mouse-gamepad',
  manualHorizontalSpeedMps: 10,
  autonomousStandaloneSpeedMultiplier: 2,
  autonomousStandaloneSpeedMps: 20,
  sharedAssetFamilyWithDroneSwarm: true,
  sharedGunProfileId: 'drone-gun-standard-v1',
  variantDifferencesLimitedTo: ['control-mode', 'reserve', 'lifetime', 'sensor-policy'],
}), 'piloted-drone deployment/shared-identity policy invalid');
check(decision.activationPolicy?.hostOwnsActivation === true && decision.activationPolicy?.consumesExactlyOnce === true && decision.activationPolicy?.duplicateOwnerTypePolicy === 'forbid-unless-definition-allows', 'activation authority/exactly-once policy invalid');
check(decision.privacyPolicy?.rewardSeedRollHostOnly === true && decision.privacyPolicy?.acquisitionStateHostOnly === true && decision.privacyPolicy?.recipientSnapshotOmitsSeedAndRoll === true, 'host-private support state policy invalid');
check(decision.privacyPolicy?.rewardRevealPolicy === 'claimant-after-exclusive-claim', 'reward reveal policy invalid');

check(canonical(manifest.selectionPolicy) === canonical(decision.selectionPolicy), 'manifest selection policy differs from DEC-13');
check(canonical(manifest.earningPolicy) === canonical(decision.earningPolicy), 'manifest earning policy differs from DEC-13');
check(canonical(manifest.activationPolicy) === canonical(decision.activationPolicy), 'manifest activation policy differs from DEC-13');
check(canonical(manifest.privacyPolicy) === canonical(decision.privacyPolicy), 'manifest privacy policy differs from DEC-13');

const catalog = (Array.isArray(manifest.catalog) ? manifest.catalog : []).map((item) => {
  check(plainObject(item), 'catalog entry must be an object');
  return plainObject(item) ? item : {};
});
check(catalog.length >= decisionCatalog.length && unique(catalog.map(item => item?.id)), 'manifest catalog must contain every frozen DEC-13 row and unique extension IDs');
const frozenIds = new Set(decisionCatalog.map(item => item?.id));
const frozenCatalogRows = catalog.filter(item => frozenIds.has(item?.id));
const extensionCatalog = catalog.filter(item => !frozenIds.has(item?.id));
check(
  canonical(frozenCatalogRows.map(authoredDecisionProjection)) === canonical(decisionCatalog.map(authoredDecisionProjection)),
  'manifest frozen catalog rows differ from DEC-13 authored values or relative order',
);
check(extensionCatalog.every(item => !decisionCatalog.some(frozen => frozen?.id === item?.id)), 'extension catalog IDs must not shadow frozen DEC-13 IDs');
const definitions = (Array.isArray(manifest.supportDefinitions) ? manifest.supportDefinitions : []).map((item) => {
  check(plainObject(item), 'support definition entry must be an object');
  return plainObject(item) ? item : {};
});
const gunProfiles = (Array.isArray(manifest.gunProfiles) ? manifest.gunProfiles : []).map((item) => {
  check(plainObject(item), 'gun profile entry must be an object');
  return plainObject(item) ? item : {};
});
const provenance = (Array.isArray(manifest.provenance) ? manifest.provenance : []).map((item) => {
  check(plainObject(item), 'provenance entry must be an object');
  return plainObject(item) ? item : {};
});
check(unique(definitions.map(item => item?.id)), 'support definition IDs must be unique');
check(unique(gunProfiles.map(item => item?.id)), 'gun profile IDs must be unique');
check(canonical(gunProfiles) === canonical(GUN_PROFILE_ORACLE), 'gun profiles must exactly match the immutable external payload/digest oracle');
check(unique(provenance.map(item => item?.id)), 'provenance IDs must be unique');

for (const item of catalog) {
  const label = item?.id ?? '<invalid>';
  exactKeys(item, ['id', 'displayName', 'cost', 'tier', 'availability', 'carePackageBaseWeightUnits', 'carePackageWeightUnits', 'relationship', 'activation', 'supportDefinitionIds', 'durationMs', 'repeatable', 'authorityPolicy', 'presentationId', 'audioProfileId', 'evidenceIds'], `catalog ${label}`);
  check(idOk(item?.id), `${label}: invalid catalog ID`);
  check(typeof item?.displayName === 'string' && item.displayName.trim().length > 0 && item.displayName.length <= 80, `${label}: display name invalid`);
  check(Number.isSafeInteger(item?.cost) && item.cost >= 1 && item.cost <= 100, `${label}: cost invalid`);
  check(TIERS.includes(item?.tier), `${label}: tier invalid`);
  check(AVAILABILITY.includes(item?.availability), `${label}: availability invalid`);
  check(Number.isSafeInteger(item?.carePackageBaseWeightUnits) && item.carePackageBaseWeightUnits >= 0, `${label}: care base weight invalid`);
  check(Number.isSafeInteger(item?.carePackageWeightUnits) && item.carePackageWeightUnits >= 0, `${label}: care weight invalid`);
  check(relationshipOk(item?.relationship), `${label}: relationship invalid`);
  check(ACTIVATIONS.includes(item?.activation), `${label}: activation invalid`);
  const supportIds = Array.isArray(item?.supportDefinitionIds) ? item.supportDefinitionIds : [];
  check(supportIds.every(idOk) && unique(supportIds), `${label}: support definition references invalid or duplicated`);
  for (const id of supportIds) check(definitions.some(def => def?.id === id), `${label}: missing support definition ${id}`);
  if (Object.hasOwn(EXPECTED_SUPPORT_BINDINGS, item.id)) {
    check(canonical(supportIds) === canonical(EXPECTED_SUPPORT_BINDINGS[item.id]), `${label}: frozen support-definition binding invalid`);
  }
  check(Number.isInteger(item?.durationMs) && item.durationMs >= 0 && item.durationMs <= 600000, `${label}: duration invalid`);
  check(typeof item?.repeatable === 'boolean', `${label}: repeatable policy missing`);
  check(item?.authorityPolicy === 'host', `${label}: authority policy must be host`);
  check(idOk(item?.presentationId) && idOk(item?.audioProfileId), `${label}: presentation/audio identity invalid`);
  const evidenceIds = Array.isArray(item?.evidenceIds) ? item.evidenceIds : [];
  check(evidenceIds.length > 0 && evidenceIds.every(idOk) && unique(evidenceIds), `${label}: evidence IDs invalid or duplicated`);
  check(evidenceIds.every(id => REQUIRED_EVIDENCE_IDS.includes(id)), `${label}: unknown evidence ID`);
}
const slotEligibleIds = new Set((decision.selectionPolicy?.slots ?? []).flatMap(slot => slot?.allowedIds ?? []));
for (const item of catalog) {
  check(item.availability !== 'selectable' || slotEligibleIds.has(item.id), `${item.id}: selectable catalog row is absent from every frozen slot family`);
  check(item.availability === 'selectable' || !slotEligibleIds.has(item.id), `${item.id}: non-selectable catalog row appears in a frozen slot family`);
}

const flattenedBindings = catalog.flatMap(item => item?.supportDefinitionIds ?? []);
check(sameSet(flattenedBindings, definitions.map(item => item?.id)), 'support definitions must be referenced exactly once by the catalog');
check(catalog.find(item => item.id === 'adrenaline')?.durationMs === 15000, 'Adrenaline duration must equal 15000ms');
const nuke = catalog.find(item => item.id === NUKE_ID);
check(Boolean(nuke) && nuke.cost === 15 && nuke.availability === 'selectable', 'Nuke must be selectable at cost 15');
const scout = catalog.find(item => item.id === 'scout-sweep');
check(Boolean(scout) && scout.cost === 3 && scout.availability === 'selectable' && scout.durationMs === 12000, 'Scout Sweep must remain the selectable slot-1 support');

const loadout = Array.isArray(manifest.loadout) ? manifest.loadout : [];
check(loadout.length === 5 && unique(loadout), 'loadout must contain exactly five distinct IDs');
for (const id of loadout) check(catalog.some(item => item.id === id && item.availability === 'selectable'), `loadout contains non-selectable or unknown ${id}`);
check(manifest.selectionPolicy?.duplicatesAllowed === false, 'duplicatesAllowed must explicitly equal false');
for (const [index, id] of loadout.entries()) {
  const slot = decision.selectionPolicy?.slots?.[index];
  check(slot?.slot === index + 1 && Array.isArray(slot.allowedIds) && slot.allowedIds.includes(id), `loadout slot ${index + 1} violates its frozen family`);
}
check(loadout[2] !== loadout[3], 'loadout slots 3 and 4 must be distinct');
check(!(loadout.includes('nuke') && loadout.includes('drone-swarm')), 'Nuke and Drone Swarm must be mutually exclusive');

check(!Object.hasOwn(manifest, 'carePool') && !Object.hasOwn(manifest, 'rewardPool'), 'secondary reward-pool sources are forbidden');
let derivedPool = null;
try {
  derivedPool = deriveCarePackagePool(catalog);
} catch (error) {
  check(false, `care-package formula invalid: ${error.message}`);
}
const rewardEligible = catalog.filter(item => item.availability !== 'retired' && item.id !== CARE_PACKAGE_ID);
for (const item of catalog) {
  check(item.carePackageWeightUnits === (derivedPool?.derivedWeights.get(item.id) ?? -1), `${item.id}: derived care weight is stale or independently authored`);
}
const totalWeight = derivedPool?.totalWeightUnits ?? 0;
check(decisionDerivedPool?.totalWeightUnits === decision.carePackagePolicy?.currentDerivedWeightTotal, 'DEC-13 current derived reward total is stale');
check(decisionDerivedPool?.nonNukeBaseWeightTotal === decision.carePackagePolicy?.currentNonNukeBaseWeightTotal, 'DEC-13 current non-Nuke base total is stale');
check((derivedPool?.nonNukeBaseWeightTotal ?? 0) >= (decisionDerivedPool?.nonNukeBaseWeightTotal ?? Number.MAX_SAFE_INTEGER), 'catalog extensions cannot reduce frozen baseline probability mass');
if (extensionCatalog.length === 0) {
  check(totalWeight === decision.carePackagePolicy?.currentDerivedWeightTotal, 'baseline derived reward total differs from DEC-13');
  check(derivedPool?.nonNukeBaseWeightTotal === decision.carePackagePolicy?.currentNonNukeBaseWeightTotal, 'baseline non-Nuke base total differs from DEC-13');
}
check((derivedPool?.derivedWeights.get(NUKE_ID) ?? 0) * 100 === totalWeight, 'Nuke must have exactly one percent of derived reward units');
const highestBaseWeight = Math.max(...rewardEligible.filter(item => item.id !== NUKE_ID).map(item => item.carePackageBaseWeightUnits));
check(scout?.carePackageBaseWeightUnits === highestBaseWeight, 'Scout Sweep must remain in the highest care-weight band');

for (const profile of gunProfiles) {
  const label = profile?.id ?? '<invalid-profile>';
  exactKeys(profile, ['id', 'definition', 'sha256'], `gunProfile ${label}`);
  check(idOk(profile?.id), `${label}: gun profile ID invalid`);
  exactKeys(profile?.definition, ['damage', 'rpm', 'falloffStartM', 'falloffEndM', 'penetration', 'magazineSize', 'reloadMs'], `${label}.definition`);
  check(finite(profile.definition?.damage, 0.01, 1000) && finite(profile.definition?.rpm, 1, 3000), `${label}: damage/rpm invalid`);
  check(finite(profile.definition?.falloffStartM, 0, 2000) && finite(profile.definition?.falloffEndM, 0, 2000) && profile.definition?.falloffEndM > profile.definition?.falloffStartM, `${label}: falloff invalid`);
  check(finite(profile.definition?.penetration, 0, 1000), `${label}: penetration invalid`);
  check(Number.isInteger(profile.definition?.magazineSize) && profile.definition.magazineSize >= 1 && profile.definition.magazineSize <= 1000, `${label}: magazine size invalid`);
  check(Number.isInteger(profile.definition?.reloadMs) && profile.definition.reloadMs >= 1 && profile.definition.reloadMs <= 60000, `${label}: reload duration invalid`);
  check(shaOk(profile?.sha256) && digest(profile.definition) === profile.sha256, `${label}: gun profile digest mismatch`);
}

for (const item of provenance) {
  const label = item?.id ?? '<invalid-provenance>';
  exactKeys(item, ['id', 'source', 'license', 'derivativeNotes', 'sha256'], `provenance ${label}`);
  check(idOk(item?.id), `${label}: provenance ID invalid`);
  check(typeof item?.source === 'string' && item.source.length > 0, `${label}: provenance source missing`);
  check(typeof item?.license === 'string' && item.license.length > 0, `${label}: provenance license missing`);
  check(typeof item?.derivativeNotes === 'string' && item.derivativeNotes.length > 0, `${label}: derivative notes missing`);
  check(shaOk(item?.sha256), `${label}: provenance digest invalid`);
}

for (const def of definitions) {
  const label = def?.id ?? '<invalid-definition>';
  exactKeys(def, ['id', 'kind', 'authority', 'targetable', 'health', 'hitboxProfileId', 'presentationId', 'audioProfileId', 'maximumEntities', 'maximumActiveVoices', 'maximumProjectiles', 'pooled', 'prewarmed', 'provenanceId', 'lifecycle', 'navigation', 'targeting', 'weapon', 'sensor', 'detail'], `support ${label}`);
  check(idOk(def?.id), `${label}: support ID invalid`);
  check(KINDS.includes(def?.kind), `${label}: support kind invalid`);
  check(def?.authority === 'host', `${label}: support authority must be host`);
  check(typeof def?.targetable === 'boolean', `${label}: targetability must be explicit`);
  check(def.targetable ? finite(def.health, 1, 100000) && idOk(def.hitboxProfileId) : def.health === null && def.hitboxProfileId === null, `${label}: health/hitbox contradict targetability`);
  check(idOk(def?.presentationId) && idOk(def?.audioProfileId), `${label}: presentation/audio identity invalid`);
  check(Number.isInteger(def?.maximumEntities) && def.maximumEntities >= 1 && def.maximumEntities <= 64, `${label}: entity cap invalid`);
  check(Number.isInteger(def?.maximumActiveVoices) && def.maximumActiveVoices >= 0 && def.maximumActiveVoices <= 256, `${label}: audio cap invalid`);
  check(Number.isInteger(def?.maximumProjectiles) && def.maximumProjectiles >= 0 && def.maximumProjectiles <= 512, `${label}: projectile cap invalid`);
  check(def?.pooled === true && def?.prewarmed === true, `${label}: support must be pooled and prewarmed`);
  check(provenance.some(item => item.id === def?.provenanceId), `${label}: provenance reference missing`);

  exactKeys(def?.lifecycle, ['spawnAuthority', 'reliableEvents', 'lossyPoseSnapshots', 'expiresAndDisposes', 'resetOnRematch', 'generationAware'], `${label}.lifecycle`);
  check(def.lifecycle?.spawnAuthority === 'host-fixed-step', `${label}: lifecycle spawn authority invalid`);
  for (const field of ['reliableEvents', 'lossyPoseSnapshots', 'expiresAndDisposes', 'resetOnRematch', 'generationAware']) check(def.lifecycle?.[field] === true, `${label}: lifecycle ${field} must be true`);
  exactKeys(def?.navigation, ['required', 'policyId', 'recoveryPolicy'], `${label}.navigation`);
  check(typeof def.navigation?.required === 'boolean', `${label}: navigation required flag missing`);
  check(def.navigation?.required ? idOk(def.navigation.policyId) && def.navigation.recoveryPolicy === 'bounded-host-recovery' : def.navigation?.policyId === null && def.navigation?.recoveryPolicy === 'not-applicable', `${label}: navigation policy inconsistent`);

  if (def.targeting === null) {
    check(def.kind === 'parachute-crate', `${label}: only a non-AI crate may omit targeting`);
  } else {
    exactKeys(def.targeting, ['policyId', 'hostOwned', 'livingOnly', 'opposingOnly', 'allowedTargetKinds', 'lineOfSightRequired', 'semanticSmokeBlocks', 'hardCoverBlocks', 'hiddenUntilReveal'], `${label}.targeting`);
    check(idOk(def.targeting?.policyId) && def.targeting?.hostOwned === true, `${label}: targeting must be host-owned and identified`);
    check(Array.isArray(def.targeting?.allowedTargetKinds) && def.targeting.allowedTargetKinds.every(idOk) && unique(def.targeting.allowedTargetKinds), `${label}: targeting kind allowlist invalid`);
    check(typeof def.targeting?.livingOnly === 'boolean' && typeof def.targeting?.opposingOnly === 'boolean', `${label}: target life/relationship policy missing`);
    check(typeof def.targeting?.lineOfSightRequired === 'boolean' && typeof def.targeting?.semanticSmokeBlocks === 'boolean' && typeof def.targeting?.hardCoverBlocks === 'boolean', `${label}: LOS/smoke/cover policy missing`);
    check(def.targeting?.hiddenUntilReveal === true, `${label}: hidden acquisition state must remain private until reveal`);
  }

  if (def.weapon === null) {
    check(!['chopper', 'drone'].includes(def.kind), `${label}: armed support kind missing weapon contract`);
  } else {
    exactKeys(def.weapon, ['gunProfileId', 'magazineSize', 'reservePolicy', 'reloadMs'], `${label}.weapon`);
    const profile = gunProfiles.find(item => item.id === def.weapon?.gunProfileId);
    check(Boolean(profile), `${label}: referenced gun profile missing`);
    check(Number.isInteger(def.weapon?.magazineSize) && def.weapon.magazineSize >= 1, `${label}: magazine invalid`);
    check(['two-magazines-total', 'unlimited-reloads-until-expiry', 'bounded-support-feed'].includes(def.weapon?.reservePolicy), `${label}: reserve policy invalid`);
    check(Number.isInteger(def.weapon?.reloadMs) && def.weapon.reloadMs >= 1 && def.weapon.reloadMs <= 60000, `${label}: reload duration invalid`);
    if (profile) {
      check(def.weapon?.magazineSize === profile.definition?.magazineSize && def.weapon?.reloadMs === profile.definition?.reloadMs, `${label}: weapon contract differs from immutable gun profile`);
      const loadedProjectileCapacity = def.maximumEntities * def.weapon.magazineSize;
      check(Number.isSafeInteger(loadedProjectileCapacity) && def.maximumProjectiles >= loadedProjectileCapacity, `${label}: projectile cap below one loaded magazine per armed entity`);
    }
  }

  if (def.sensor === null) {
    check(def.id !== 'piloted-drone-entity', `${label}: piloted drone sensor missing`);
  } else {
    exactKeys(def.sensor, ['presentationOnly', 'revealPolicy', 'rangeM', 'forwardConeDeg', 'refreshMs', 'wallReveal', 'ballisticAuthority'], `${label}.sensor`);
    check(def.id === 'piloted-drone-entity', `${label}: sensor capability leaked to non-piloted support`);
    check(def.sensor?.presentationOnly === true && def.sensor?.revealPolicy === 'living-hostiles-only', `${label}: sensor reveal policy invalid`);
    check(def.sensor?.rangeM === 50 && def.sensor?.forwardConeDeg === 90 && def.sensor?.refreshMs === 250, `${label}: sensor envelope must equal 50m/90deg/250ms`);
    check(def.sensor?.wallReveal === true && def.sensor?.ballisticAuthority === false, `${label}: sensor must reveal through walls without ballistic authority`);
  }

  if (def.kind === 'aircraft') {
    const aircraftDetailKeys = ['role', 'bombCount', 'ingressPolicy', 'pathPolicy', 'activationAnchorPolicy', 'lifetimeMs'];
    if (def.detail?.role === 'carpet-bomber') aircraftDetailKeys.push('targetingLifecycle', 'sharedGroundMarker', 'callerFlightPathPreview');
    exactKeys(def.detail, aircraftDetailKeys, `${label}.detail`);
    check(['care-drop', 'yardhawk', 'tri-pass', 'carpet-bomber', 'hunter-swarm'].includes(def.detail?.role), `${label}: aircraft role invalid`);
    check(Number.isInteger(def.detail?.bombCount) && def.detail.bombCount >= 0 && def.detail.bombCount <= 20, `${label}: aircraft bomb count invalid`);
    check(Number.isInteger(def.detail?.lifetimeMs) && def.detail.lifetimeMs >= 1 && def.detail.lifetimeMs <= 600000, `${label}: aircraft lifetime invalid`);
    if (def.detail?.role === 'carpet-bomber') {
      check(def.detail?.bombCount === 20 && def.maximumProjectiles === 20, `${label}: Carpet Bomber must schedule exactly 20 bounded impacts`);
      check(def.detail?.ingressPolicy === 'host-seeded-random-valid' && def.detail?.pathPolicy === 'bounded-zigzag-strip' && def.detail?.activationAnchorPolicy === 'crosshair-ground-anchor-no-overview-map', `${label}: Carpet Bomber anchor/ingress/path policy invalid`);
      check(def.detail?.targetingLifecycle === 'care-package-style-crosshair-preview-commit-aircraft-resolve' && def.detail?.sharedGroundMarker === 'large-red-x-at-admitted-anchor' && def.detail?.callerFlightPathPreview === 'red-map-bounded-payload-corridor', `${label}: Carpet Bomber targeting/aircraft lifecycle incomplete`);
    } else {
      check(def.detail?.bombCount === 0 && def.detail?.ingressPolicy === 'not-applicable' && def.detail?.pathPolicy === 'not-applicable' && def.detail?.activationAnchorPolicy === 'not-applicable', `${label}: non-bomber aircraft carries bomber-only fields`);
    }
  } else if (def.kind === 'parachute-crate') {
    exactKeys(def.detail, ['descentPolicyId', 'capturePolicyId', 'exclusiveConsume', 'expiryPolicyId', 'aircraftDefinitionId'], `${label}.detail`);
    check(idOk(def.detail?.descentPolicyId) && idOk(def.detail?.capturePolicyId) && idOk(def.detail?.expiryPolicyId), `${label}: crate lifecycle policy IDs invalid`);
    check(def.detail?.exclusiveConsume === true, `${label}: crate capture must consume exactly once`);
    check(definitions.some(item => item.id === def.detail?.aircraftDefinitionId && item.kind === 'aircraft'), `${label}: crate aircraft definition invalid`);
  } else if (def.kind === 'chopper') {
    exactKeys(def.detail, ['durationMs', 'motionPolicyId', 'losRequired', 'semanticSmokeBlocks', 'pressureSevereByMs', 'escapeWindowMinMs', 'escapeWindowMaxMs'], `${label}.detail`);
    check(def.detail?.durationMs === 30000, `${label}: chopper duration must equal 30000ms`);
    check(def.detail?.motionPolicyId === 'host-seeded-band-limited-chopper-v1', `${label}: chopper motion policy invalid`);
    check(def.detail?.losRequired === true && def.detail?.semanticSmokeBlocks === true, `${label}: chopper LOS/smoke policy invalid`);
    check(def.detail?.pressureSevereByMs === 4000 && def.detail?.escapeWindowMinMs === 4000 && def.detail?.escapeWindowMaxMs === 5000, `${label}: chopper pressure calibration invalid`);
  } else if (def.kind === 'drone') {
    exactKeys(def.detail, ['count', 'durationMs', 'fuelMs', 'ownerBodyVulnerable', 'controlRestoreConditions', 'targetKinds', 'relationshipPolicy', 'pressureSevereByMs', 'escapeWindowMinMs', 'escapeWindowMaxMs', 'spawnOrigin', 'minimumSpawnSeparationM', 'inputConvention', 'manualHorizontalSpeedMps', 'autonomousStandaloneSpeedMultiplier', 'autonomousStandaloneSpeedMps', 'ingressPolicy', 'formationPolicy', 'routePolicy'], `${label}.detail`);
    check(Number.isInteger(def.detail?.count) && def.detail.count >= 1 && def.detail.count <= 24, `${label}: drone count invalid`);
    check(def.maximumEntities === def.detail.count, `${label}: maximumEntities must equal drone count`);
    check(Number.isInteger(def.detail?.durationMs) && def.detail.durationMs >= 1 && def.detail.durationMs <= 60000, `${label}: drone duration invalid`);
    check(def.detail?.fuelMs === null || (Number.isInteger(def.detail.fuelMs) && def.detail.fuelMs >= 1 && def.detail.fuelMs <= def.detail.durationMs), `${label}: drone fuel invalid`);
    check(typeof def.detail?.ownerBodyVulnerable === 'boolean', `${label}: owner-body vulnerability missing`);
    check(Array.isArray(def.detail?.controlRestoreConditions) && def.detail.controlRestoreConditions.every(idOk) && unique(def.detail.controlRestoreConditions), `${label}: control restoration conditions invalid`);
    check(Array.isArray(def.detail?.targetKinds) && def.detail.targetKinds.every(idOk) && unique(def.detail.targetKinds), `${label}: drone target kinds invalid`);
    check(['opposing-living-only', 'owner-controlled-or-opposing-living-ai'].includes(def.detail?.relationshipPolicy), `${label}: drone relationship policy invalid`);
    check(def.detail?.spawnOrigin === 'deterministic-valid-centre-map-volume' && def.detail?.minimumSpawnSeparationM === 1.15, `${label}: deterministic separated centre-map spawn policy invalid`);
    check(def.weapon?.gunProfileId === DRONE_GUN_ID && def.weapon?.magazineSize === 20, `${label}: drones must use the immutable shared 20-round gun profile`);
    const minimumProjectileCapacity = (Number.isInteger(def.detail?.count) ? def.detail.count : Infinity) * (Number.isInteger(def.weapon?.magazineSize) ? def.weapon.magazineSize : Infinity);
    check(def.maximumProjectiles >= minimumProjectileCapacity, `${label}: projectile cap below one loaded magazine per drone`);
  }
}

const swarm = definitions.find(item => item.id === 'drone-swarm-entity');
const pilot = definitions.find(item => item.id === 'piloted-drone-entity');
const chopper = definitions.find(item => item.id === 'chopper-entity');
check(Boolean(swarm) && swarm.detail?.count === 24 && swarm.health === 50 && swarm.detail?.durationMs === 60000, 'Drone Swarm must be 24 targetable 50-HP drones for 60 seconds');
check(swarm?.weapon?.reservePolicy === 'unlimited-reloads-until-expiry', 'Drone Swarm must have unlimited host reloads until expiry');
check(swarm?.maximumProjectiles === 480, 'Drone Swarm projectile cap must equal one loaded 20-round magazine for each of 24 drones');
check(swarm?.detail?.spawnOrigin === 'deterministic-valid-centre-map-volume' && swarm?.detail?.minimumSpawnSeparationM === 1.15 && swarm?.detail?.inputConvention === 'not-applicable' && swarm?.detail?.manualHorizontalSpeedMps === null && swarm?.detail?.autonomousStandaloneSpeedMultiplier === null && swarm?.detail?.autonomousStandaloneSpeedMps === null, 'Drone Swarm centre-spawn/standalone-speed isolation contract incomplete');
check(swarm?.detail?.ingressPolicy === 'fast-then-smooth-normal-speed' && swarm?.detail?.formationPolicy === 'distributed-individual-or-small-groups' && swarm?.detail?.routePolicy === 'host-seeded-divergent-valid-map-directions', 'Drone Swarm ingress/formation/route contract incomplete');
check(sameSet(swarm?.detail?.targetKinds, ['player', 'bot']) && swarm?.detail?.relationshipPolicy === 'opposing-living-only', 'Drone Swarm target eligibility must be opposing living players and bots');
check(swarm?.detail?.fuelMs === null && swarm?.detail?.ownerBodyVulnerable === false && sameSet(swarm?.detail?.controlRestoreConditions, []), 'Drone Swarm cannot carry piloted-drone fuel/body/control semantics');
check(swarm?.detail?.pressureSevereByMs === 4000 && swarm?.detail?.escapeWindowMinMs === 4000 && swarm?.detail?.escapeWindowMaxMs === 5000, 'Drone Swarm pressure calibration must bind the four-to-five-second exposure/escape target');
check(swarm?.targeting?.livingOnly === true && swarm?.targeting?.opposingOnly === true && swarm?.targeting?.lineOfSightRequired === true && swarm?.targeting?.semanticSmokeBlocks === true && swarm?.targeting?.hardCoverBlocks === true, 'Drone Swarm LOS/smoke/cover target policy incomplete');
check(Boolean(pilot) && pilot.detail?.count === 1 && pilot.health === 50 && pilot.detail?.durationMs === 30000 && pilot.detail?.fuelMs === 30000, 'Piloted Drone must be one targetable 50-HP drone with 30-second duration and fuel');
check(pilot?.detail?.spawnOrigin === 'deterministic-valid-centre-map-volume' && pilot?.detail?.minimumSpawnSeparationM === 1.15 && pilot?.detail?.inputConvention === 'non-inverted-screen-space-keyboard-mouse-gamepad', 'Piloted Drone centre-spawn/input convention incomplete');
check(pilot?.detail?.manualHorizontalSpeedMps === 10 && pilot?.detail?.autonomousStandaloneSpeedMultiplier === 2 && pilot?.detail?.autonomousStandaloneSpeedMps === 20 && pilot.detail.autonomousStandaloneSpeedMps === pilot.detail.manualHorizontalSpeedMps * pilot.detail.autonomousStandaloneSpeedMultiplier, 'Piloted Drone autonomous speed must be exactly twice manual horizontal speed');
check(pilot?.detail?.ingressPolicy === 'not-applicable' && pilot?.detail?.formationPolicy === 'not-applicable' && pilot?.detail?.routePolicy === 'owner-controlled-or-host-ai-twice-manual-speed', 'Piloted Drone must not inherit Drone Swarm formation policy');
check(pilot?.weapon?.reservePolicy === 'two-magazines-total' && pilot?.maximumProjectiles === 40, 'Piloted Drone must have exactly two 20-round magazines');
check(pilot?.detail?.ownerBodyVulnerable === true && sameSet(pilot?.detail?.controlRestoreConditions, ['body-death', 'disconnect', 'drone-death', 'exit', 'fuel-expiry']), 'Piloted Drone body/control restoration policy incomplete');
check(pilot?.targeting?.livingOnly === true && pilot?.targeting?.opposingOnly === true && pilot?.targeting?.lineOfSightRequired === true && pilot?.targeting?.semanticSmokeBlocks === true && pilot?.targeting?.hardCoverBlocks === true && sameSet(pilot?.detail?.targetKinds, ['player', 'bot']) && pilot?.detail?.relationshipPolicy === 'owner-controlled-or-opposing-living-ai', 'Piloted Drone autonomous mode must target opposing living players/bots under LOS/smoke/cover policy');
check(pilot?.detail?.pressureSevereByMs === null && pilot?.detail?.escapeWindowMinMs === null && pilot?.detail?.escapeWindowMaxMs === null, 'Piloted Drone cannot carry autonomous pressure-calibration semantics');
check(Boolean(chopper) && chopper.health === 800 && chopper.targetable === true, 'Chopper must be targetable with 800 HP');
check(chopper?.maximumProjectiles === 64, 'Chopper projectile cap must equal its 64-round loaded magazine');
check(chopper?.targeting?.livingOnly === true && chopper?.targeting?.opposingOnly === true && chopper?.targeting?.lineOfSightRequired === true && chopper?.targeting?.semanticSmokeBlocks === true && chopper?.targeting?.hardCoverBlocks === true, 'Chopper target policy must require opposing living targets, LOS, semantic smoke and hard cover');
check(sameSet(chopper?.targeting?.allowedTargetKinds, ['player', 'bot']), 'Chopper target eligibility must include opposing living players and bots');
check(swarm?.weapon?.gunProfileId === pilot?.weapon?.gunProfileId, 'swarm and piloted drone must reference the same gun profile');

const evidenceBinding = plainObject(manifest.evidenceBinding) ? manifest.evidenceBinding : {};
exactKeys(evidenceBinding, ['scope', 'path', 'receiptSha256'], 'evidenceBinding');
check(evidenceBinding.scope === (syntheticFixture ? 'synthetic-fixture-only' : 'candidate-evidence'), 'evidence binding scope does not match validation mode');
check(shaOk(evidenceBinding.receiptSha256), 'evidence receipt digest invalid');
const expectedSyntheticEvidence = '.agents/skills/atomic-acres-killstreak-authority/scripts/fixtures/synthetic-support-evidence.json';
if (syntheticFixture) check(evidenceBinding.path === expectedSyntheticEvidence, 'synthetic evidence path must be the fixed package fixture');
const evidencePath = repoFile(evidenceBinding.path, 'support evidence receipt');
const evidence = evidencePath ? readJson(evidencePath, 'support evidence receipt') : null;
if (evidence) {
  exactKeys(evidence, ['evidenceVersion', 'syntheticFixtureOnly', 'sourceSha', 'buildId', 'verifierId', 'verifierVersion', 'requirementIds', 'evidenceIds', 'artifactPath', 'artifactSha256', 'result', 'attestation'], 'support evidence receipt');
  check(evidence.evidenceVersion === 1 && evidence.syntheticFixtureOnly === syntheticFixture, 'support evidence version/scope invalid');
  check(evidence.sourceSha === manifest.sourceSha && evidence.buildId === manifest.buildId, 'support evidence source/build mismatch');
  check(idOk(evidence.verifierId) && idOk(evidence.verifierVersion), 'support evidence verifier identity invalid');
  check(sameSet(evidence.requirementIds, REQUIRED_REQUIREMENT_IDS), 'support evidence must exactly cover R500-R512');
  check(sameSet(evidence.evidenceIds, REQUIRED_EVIDENCE_IDS), 'support evidence IDs incomplete or unknown');
  check(evidence.result === 'passed', 'support evidence result must be passed');
  check(shaOk(evidence.artifactSha256), 'support evidence artifact digest invalid');
  exactKeys(evidence.attestation, ['reviewerId', 'reviewedAt', 'statement'], 'support evidence attestation');
  check(idOk(evidence.attestation?.reviewerId) && isoOk(evidence.attestation?.reviewedAt), 'support evidence reviewer/timestamp invalid');
  check(typeof evidence.attestation?.statement === 'string' && evidence.attestation.statement.length >= 20, 'support evidence attestation statement missing');
  const artifactPath = repoFile(evidence.artifactPath, 'support evidence artifact');
  if (artifactPath) {
    check(fs.existsSync(artifactPath), 'support evidence artifact missing');
    if (fs.existsSync(artifactPath)) {
      const artifactDigest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
      check(artifactDigest === evidence.artifactSha256, 'support evidence artifact digest mismatch');
    }
  }
  check(digest(evidence) === evidenceBinding.receiptSha256, 'support evidence receipt digest mismatch');
}

const catalogEvidence = [...new Set(catalog.flatMap(item => item.evidenceIds ?? []))];
check(sameSet(catalogEvidence, REQUIRED_EVIDENCE_IDS), 'catalog rows must collectively bind every required support evidence ID');

if (failures.length) {
  console.error(`FAIL killstreak-catalog ${path.basename(input)} ${new Set(failures).size}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS killstreak-catalog ${path.basename(input)} catalog=${catalog.length} rewardEligible=${rewardEligible.length} totalWeight=${totalWeight} support=${definitions.length} receipt=${binding.receiptSha256.slice(0, 12)}`);
