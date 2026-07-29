#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveCarePackagePool, rewardAtUnit } from './care-package-weights.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(scriptDir, 'fixtures');
const verifier = path.join(scriptDir, 'verify-killstreak-catalog.mjs');
const knownGood = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'known-good.json'), 'utf8'));
const catalog = (value, id) => value.catalog.find(item => item.id === id);
const support = (value, id) => value.supportDefinitions.find(item => item.id === id);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFutureEnrollment() {
  const futureManifest = structuredClone(knownGood);
  const orbitalLance = {
    ...structuredClone(catalog(knownGood, 'adrenaline')),
    id: 'future-orbital-lance',
    displayName: 'Future Orbital Lance',
    cost: 10,
    availability: 'care-only',
    carePackageBaseWeightUnits: 5,
    carePackageWeightUnits: 495,
    relationship: 'r'.repeat(96),
  };
  const decoyWing = {
    ...structuredClone(catalog(knownGood, 'adrenaline')),
    id: 'future-decoy-wing',
    displayName: 'Future Decoy Wing',
    cost: 11,
    availability: 'care-only',
    carePackageBaseWeightUnits: 7,
    carePackageWeightUnits: 693,
  };
  futureManifest.catalog.splice(2, 0, orbitalLance);
  futureManifest.catalog.splice(futureManifest.catalog.findIndex(item => item.id === 'nuke'), 0, decoyWing);
  catalog(futureManifest, 'nuke').carePackageWeightUnits = 135;
  const futureCatalog = futureManifest.catalog;

  const pool = deriveCarePackagePool(futureCatalog);
  assert(pool.nonNukeBaseWeightTotal === 135, 'two future streaks did not update the base total');
  assert(pool.totalWeightUnits === 13_500, 'two future streaks did not renormalize the pool');
  assert(pool.entries.filter(entry => entry.id === 'future-orbital-lance').length === 1, 'first future streak did not enroll exactly once');
  assert(pool.entries.filter(entry => entry.id === 'future-decoy-wing').length === 1, 'care-only future streak did not enroll exactly once');
  assert(pool.derivedWeights.get('future-orbital-lance') === 495, 'first future weight was not derived');
  assert(pool.derivedWeights.get('future-decoy-wing') === 693, 'future care-only weight was not derived');
  assert(pool.derivedWeights.get('nuke') === 135, 'Nuke weight did not preserve exact one-percent probability');
  for (const entry of pool.entries) {
    assert(rewardAtUnit(pool, entry.startInclusive) === entry.id, `${entry.id} is unreachable at its first unit`);
    assert(rewardAtUnit(pool, entry.endExclusive - 1) === entry.id, `${entry.id} is unreachable at its last unit`);
  }

  const renamedManifest = structuredClone(futureManifest);
  Object.assign(catalog(renamedManifest, 'future-orbital-lance'), {
    id: 'future-orbital-lance-mk2',
    displayName: 'Future Orbital Lance Mk II',
    cost: 12,
  });
  const renamedPool = deriveCarePackagePool(renamedManifest.catalog);
  assert(renamedPool.totalWeightUnits === pool.totalWeightUnits, 'rename or cost change altered probability mass');
  assert(renamedPool.entries.some(entry => entry.id === 'future-orbital-lance-mk2'), 'renamed future streak was not reprojected');
  assert(!renamedPool.entries.some(entry => entry.id === 'future-orbital-lance'), 'old future ID survived rename');

  const reweightedManifest = structuredClone(futureManifest);
  Object.assign(catalog(reweightedManifest, 'future-orbital-lance'), {
    carePackageBaseWeightUnits: 8,
    carePackageWeightUnits: 792,
  });
  catalog(reweightedManifest, 'nuke').carePackageWeightUnits = 138;
  const reweightedPool = deriveCarePackagePool(reweightedManifest.catalog);
  assert(reweightedPool.nonNukeBaseWeightTotal === 138, 'base-weight mutation did not update the base total');
  assert(reweightedPool.totalWeightUnits === 13_800, 'base-weight mutation did not renormalize the pool');
  assert(reweightedPool.derivedWeights.get('future-orbital-lance') === 792, 'base-weight mutation left a stale derived weight');
  assert(reweightedPool.derivedWeights.get('nuke') === 138, 'base-weight mutation broke exact Nuke probability');

  const retiredManifest = structuredClone(futureManifest);
  Object.assign(catalog(retiredManifest, 'future-decoy-wing'), {
    availability: 'retired',
    carePackageBaseWeightUnits: 0,
    carePackageWeightUnits: 0,
  });
  catalog(retiredManifest, 'nuke').carePackageWeightUnits = 128;
  const retiredPool = deriveCarePackagePool(retiredManifest.catalog);
  assert(retiredPool.nonNukeBaseWeightTotal === 128, 'retirement did not remove probability mass');
  assert(retiredPool.totalWeightUnits === 12_800, 'retirement did not renormalize the pool');
  assert(retiredPool.derivedWeights.get('future-decoy-wing') === 0, 'retired future streak retained weight');
  assert(!retiredPool.entries.some(entry => entry.id === 'future-decoy-wing'), 'retired future streak remained reward eligible');
  return [futureManifest, renamedManifest, reweightedManifest, retiredManifest];
}

function addValidFutureExtension(value, overrides = {}) {
  value.catalog.splice(2, 0, {
    ...structuredClone(catalog(value, 'adrenaline')),
    id: 'future-schema-probe',
    displayName: 'Future Schema Probe',
    cost: 10,
    availability: 'care-only',
    carePackageBaseWeightUnits: 5,
    carePackageWeightUnits: 495,
    ...overrides,
  });
  catalog(value, 'nuke').carePackageWeightUnits = 128;
}

let futureManifests;
try {
  futureManifests = assertFutureEnrollment();
} catch (error) {
  console.error(`FAIL killstreak-authority future-enrollment ${error.message}`);
  process.exit(1);
}

const cases = [
  ['unknown hidden-state leak key', value => { value.publicRewardBeforeClaim = 'nuke'; }],
  ['non-object catalog entry', value => { value.catalog[0] = null; }],
  ['non-object support definition', value => { value.supportDefinitions[0] = null; }],
  ['missing aircraft detail', value => { delete support(value, 'care-package-aircraft').detail; }],
  ['missing piloted-drone sensor', value => { delete support(value, 'piloted-drone-entity').sensor; }],
  ['missing gun definition with digest-shaped value', value => { delete value.gunProfiles[0].definition; value.gunProfiles[0].sha256 = 'a'.repeat(64); }],
  ['forged decision digest', value => { value.decisionBinding.receiptSha256 = 'f'.repeat(64); }],
  ['exact Care Package cost drift', value => { catalog(value, 'care-package').cost = 5; }],
  ['exact care weight drift', value => { catalog(value, 'yardhawk').carePackageWeightUnits = 15; }],
  ['base weight changed without derived recomputation', value => { catalog(value, 'yardhawk').carePackageBaseWeightUnits = 17; }],
  ['Care Package made recursively eligible', value => { catalog(value, 'care-package').carePackageBaseWeightUnits = 1; }],
  ['future nullable cost', value => { addValidFutureExtension(value, { cost: null }); }],
  ['future whitespace display name', value => { addValidFutureExtension(value, { displayName: '   ' }); }],
  ['future oversized display name', value => { addValidFutureExtension(value, { displayName: 'D'.repeat(81) }); }],
  ['future oversized relationship', value => { addValidFutureExtension(value, { relationship: 'r'.repeat(97) }); }],
  ['future extension leaves its own derived weight stale', value => { addValidFutureExtension(value, { carePackageWeightUnits: 0 }); }],
  ['future selectable row omitted from slot families', value => { addValidFutureExtension(value, { availability: 'selectable' }); }],
  ['DEC-owned Yardhawk semantic drift', value => { Object.assign(catalog(value, 'yardhawk'), { tier: 'low', activation: 'target-point', durationMs: 15001, repeatable: true }); }],
  ['missing duplicate policy', value => { delete value.selectionPolicy.duplicatesAllowed; }],
  ['duplicate loadout', value => { value.loadout[1] = value.loadout[0]; }],
  ['wrong slot-1 family', value => { value.loadout[0] = 'yardhawk'; }],
  ['wrong slot-2 family', value => { value.loadout[1] = 'adrenaline'; }],
  ['Nuke made care-only', value => { catalog(value, 'nuke').availability = 'care-only'; }],
  ['Nuke and Drone Swarm both selected', value => { value.loadout[2] = 'drone-swarm'; }],
  ['future row leaves stale Nuke derived weight', value => {
    value.catalog.push({
      ...structuredClone(catalog(value, 'adrenaline')),
      id: 'future-orbital-lance',
      displayName: 'Future Orbital Lance',
      cost: 10,
      availability: 'care-only',
      carePackageBaseWeightUnits: 5,
      carePackageWeightUnits: 495,
    });
  }],
  ['secondary reward pool', value => { value.carePool = [{ id: 'nuke', weight: 1 }]; }],
  ['invalid evidence ID', value => { catalog(value, 'adrenaline').evidenceIds = ['']; }],
  ['swarm entity cap below count', value => { support(value, 'drone-swarm-entity').maximumEntities = 1; }],
  ['swarm projectile cap below loaded rounds', value => { support(value, 'drone-swarm-entity').maximumProjectiles = 239; }],
  ['swarm projectile cap above exact load', value => { support(value, 'drone-swarm-entity').maximumProjectiles = 241; }],
  ['swarm carries pilot fuel semantics', value => { support(value, 'drone-swarm-entity').detail.fuelMs = 30000; }],
  ['pilot projectile cap below two magazines', value => { support(value, 'piloted-drone-entity').maximumProjectiles = 20; }],
  ['pilot projectile cap above two magazines', value => { support(value, 'piloted-drone-entity').maximumProjectiles = 41; }],
  ['pilot duration drift', value => { support(value, 'piloted-drone-entity').detail.durationMs = 30001; }],
  ['pilot carries autonomous pressure semantics', value => { support(value, 'piloted-drone-entity').detail.pressureSevereByMs = 4000; }],
  ['pilot caller-relative spawn regression', value => { support(value, 'piloted-drone-entity').detail.spawnOrigin = 'behind-caller'; }],
  ['pilot input inversion convention drift', value => { support(value, 'piloted-drone-entity').detail.inputConvention = 'inverted'; }],
  ['pilot autonomous speed is not twice manual', value => { support(value, 'piloted-drone-entity').detail.autonomousStandaloneSpeedMps = 19; }],
  ['swarm centre-spawn separation drift', value => { support(value, 'drone-swarm-entity').detail.minimumSpawnSeparationM = 0; }],
  ['drone gun identity drift', value => { support(value, 'piloted-drone-entity').weapon.gunProfileId = 'chopper-gun-v1'; }],
  ['reward privacy disabled', value => { value.privacyPolicy.rewardSeedRollHostOnly = false; }],
  ['bot targeting removed', value => { support(value, 'drone-swarm-entity').detail.targetKinds = ['player']; }],
  ['swarm pressure timing drift', value => { support(value, 'drone-swarm-entity').detail.pressureSevereByMs = 4001; }],
  ['LOS bypass', value => { support(value, 'chopper-entity').targeting.lineOfSightRequired = false; }],
  ['chopper HP drift', value => { support(value, 'chopper-entity').health = 799; }],
  ['chopper projectile cap below loaded magazine', value => { support(value, 'chopper-entity').maximumProjectiles = 0; }],
  ['chopper motion becomes client-local', value => { support(value, 'chopper-entity').detail.motionPolicyId = 'client-random'; }],
  ['Carpet Bomber impact count drift', value => { support(value, 'carpet-bomber-entity').detail.bombCount = 19; }],
  ['Carpet Bomber skips inbound aircraft lifecycle', value => { support(value, 'carpet-bomber-entity').detail.targetingLifecycle = 'instant-impacts'; }],
  ['lifecycle disposal disabled', value => { support(value, 'yardhawk-entity').lifecycle.expiresAndDisposes = false; }],
  ['gun payload changed without digest', value => { value.gunProfiles[0].definition.damage = 11; }],
  ['gun payload changed with recomputed self-hash', value => { value.gunProfiles[0].definition.damage = 11; value.gunProfiles[0].sha256 = digest(value.gunProfiles[0].definition); }],
  ['forged evidence receipt digest', value => { value.evidenceBinding.receiptSha256 = 'e'.repeat(64); }],
  ['evidence path escapes repository', value => { value.evidenceBinding.path = '../../../../package.json'; }],
];

const tempDir = fs.mkdtempSync(path.join(fixtureDir, '.mutation-'));
const falseAccepts = [];
const crashes = [];
try {
  for (const [index, futureManifest] of futureManifests.entries()) {
    const futurePath = path.join(tempDir, `future-positive-${index}.json`);
    fs.writeFileSync(futurePath, JSON.stringify(futureManifest));
    const futureRun = spawnSync(process.execPath, [verifier, '--synthetic-fixture', futurePath], { encoding: 'utf8' });
    if (futureRun.status !== 0) {
      console.error(`FAIL killstreak-authority end-to-end future manifest ${index}`);
      if (futureRun.stdout.trim()) console.error(futureRun.stdout.trim());
      if (futureRun.stderr.trim()) console.error(futureRun.stderr.trim());
      process.exitCode = 1;
    }
  }
  for (let index = 0; index < cases.length; index += 1) {
    const [name, mutate] = cases[index];
    const candidate = structuredClone(knownGood);
    mutate(candidate);
    const candidatePath = path.join(tempDir, `${index}.json`);
    fs.writeFileSync(candidatePath, JSON.stringify(candidate));
    const run = spawnSync(process.execPath, [verifier, '--synthetic-fixture', candidatePath], { encoding: 'utf8' });
    if (run.status === 0) falseAccepts.push(name);
    else if (run.status !== 1 || /(?:TypeError|ReferenceError|RangeError):/.test(run.stderr)) crashes.push(name);
  }
} finally {
  const resolved = path.resolve(tempDir);
  if (!resolved.startsWith(`${path.resolve(fixtureDir)}${path.sep}.mutation-`)) throw new Error('refusing to remove unexpected mutation directory');
  fs.rmSync(resolved, { recursive: true, force: true });
}

if (process.exitCode || falseAccepts.length || crashes.length) {
  console.error(`FAIL killstreak-authority adversarial falseAccepts=${falseAccepts.length} crashes=${crashes.length}`);
  for (const name of falseAccepts) console.error(`- ${name}`);
  for (const name of crashes) console.error(`- crashed: ${name}`);
  process.exit(1);
}
console.log(`PASS killstreak-authority future-manifests=${futureManifests.length} future-enrollment=2 mutation-cases=${cases.length}`);
