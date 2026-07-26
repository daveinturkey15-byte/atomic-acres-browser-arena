#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  ['DEC-owned Yardhawk semantic drift', value => { Object.assign(catalog(value, 'yardhawk'), { tier: 'low', activation: 'target-point', durationMs: 15001, repeatable: true }); }],
  ['missing duplicate policy', value => { delete value.selectionPolicy.duplicatesAllowed; }],
  ['duplicate loadout', value => { value.loadout[1] = value.loadout[0]; }],
  ['selectable costed Nuke', value => { Object.assign(catalog(value, 'nuke'), { cost: 20, availability: 'selectable' }); }],
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
  ['drone gun identity drift', value => { support(value, 'piloted-drone-entity').weapon.gunProfileId = 'chopper-gun-v1'; }],
  ['reward privacy disabled', value => { value.privacyPolicy.rewardSeedRollHostOnly = false; }],
  ['bot targeting removed', value => { support(value, 'drone-swarm-entity').detail.targetKinds = ['player']; }],
  ['swarm pressure timing drift', value => { support(value, 'drone-swarm-entity').detail.pressureSevereByMs = 4001; }],
  ['LOS bypass', value => { support(value, 'chopper-entity').targeting.lineOfSightRequired = false; }],
  ['chopper HP drift', value => { support(value, 'chopper-entity').health = 799; }],
  ['chopper projectile cap below loaded magazine', value => { support(value, 'chopper-entity').maximumProjectiles = 0; }],
  ['chopper motion becomes client-local', value => { support(value, 'chopper-entity').detail.motionPolicyId = 'client-random'; }],
  ['Carpet Bomber impact count drift', value => { support(value, 'carpet-bomber-entity').detail.bombCount = 19; }],
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

if (falseAccepts.length || crashes.length) {
  console.error(`FAIL killstreak-authority adversarial falseAccepts=${falseAccepts.length} crashes=${crashes.length}`);
  for (const name of falseAccepts) console.error(`- ${name}`);
  for (const name of crashes) console.error(`- crashed: ${name}`);
  process.exit(1);
}
console.log(`PASS killstreak-authority adversarial cases=${cases.length}`);
