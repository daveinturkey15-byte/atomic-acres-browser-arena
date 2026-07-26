#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-killstreak-catalog.mjs <support-manifest.json>');
  process.exit(2);
}
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const CARE_PACKAGE_ID = 'care-package';
const NUKE_ID = 'nuke';
const availabilityValues = new Set(['selectable', 'care-only', 'retired']);
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL killstreak-catalog unreadable-json ${error.message}`);
  process.exit(2);
}

check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
check(manifest.decisionReceipt?.status === 'FROZEN', 'product decision receipt must be FROZEN');
check(manifest.decisionReceipt?.id === 'DEC-13', 'DEC-13 decision receipt must be frozen');
const catalog = Array.isArray(manifest.catalog) ? manifest.catalog : [];
const definitions = Array.isArray(manifest.supportDefinitions) ? manifest.supportDefinitions : [];
const gunProfiles = Array.isArray(manifest.gunProfiles) ? manifest.gunProfiles : [];
check(catalog.length > 0, 'catalog must be non-empty');
check(new Set(catalog.map(item => item?.id)).size === catalog.length, 'killstreak IDs must be unique');
const frozenCatalogIds = Array.isArray(manifest.decisionReceipt?.catalogIds) ? manifest.decisionReceipt.catalogIds : [];
check(frozenCatalogIds.length > 0 && frozenCatalogIds.every(idOk), 'frozen decision catalog IDs missing or invalid');
check(new Set(frozenCatalogIds).size === frozenCatalogIds.length, 'frozen decision catalog IDs must be unique');
for (const id of frozenCatalogIds) check(catalog.some(item => item?.id === id), `catalog missing frozen decision ID ${id}`);
for (const item of catalog) check(frozenCatalogIds.includes(item?.id), `catalog ID absent from frozen decision ${item?.id}`);
check(new Set(definitions.map(item => item?.id)).size === definitions.length, 'support definition IDs must be unique');
check(new Set(gunProfiles.map(item => item?.id)).size === gunProfiles.length, 'gun profile IDs must be unique');

for (const item of catalog) {
  check(idOk(item?.id), 'invalid killstreak ID');
  check(Number.isInteger(item?.cost) && item.cost >= 1 && item.cost <= 100, `${item?.id}: invalid cost`);
  check(['low', 'mid', 'high', 'top'].includes(item?.tier), `${item?.id}: invalid tier`);
  check(availabilityValues.has(item?.availability), `${item?.id}: typed availability missing or invalid`);
  check(!Object.hasOwn(item ?? {}, 'selectable') && !Object.hasOwn(item ?? {}, 'careEligible'), `${item?.id}: legacy selection/care booleans are forbidden`);
  check(Number.isSafeInteger(item?.carePackageWeightUnits) && item.carePackageWeightUnits >= 0, `${item?.id}: care-package weight must be a non-negative safe integer`);
  check(item?.authorityPolicy === 'host', `${item?.id}: authority policy must be host`);
  if (item?.supportDefinitionId !== null) check(definitions.some(def => def?.id === item.supportDefinitionId), `${item?.id}: support definition missing`);
  check(idOk(item?.presentationId), `${item?.id}: presentation identity missing`);
  check(Array.isArray(item?.evidenceIds) && item.evidenceIds.length > 0, `${item?.id}: evidence IDs missing`);
}

const loadout = manifest.loadout;
check(Array.isArray(loadout) && loadout.length === 5, 'loadout must contain exactly five slots');
if (Array.isArray(loadout)) {
  for (const id of loadout) check(catalog.some(item => item.id === id && item.availability === 'selectable'), `loadout contains non-selectable ${id}`);
  if (manifest.decisionReceipt?.duplicatesAllowed === false) check(new Set(loadout).size === loadout.length, 'loadout duplicates violate frozen policy');
}

for (const def of definitions) {
  check(idOk(def?.id), 'invalid support definition ID');
  check(['aircraft', 'parachute-crate', 'chopper', 'drone', 'bomb'].includes(def?.kind), `${def?.id}: invalid kind`);
  check(def?.authority === 'host', `${def?.id}: authority must be host`);
  check(Number.isInteger(def?.maximumEntities) && def.maximumEntities > 0 && def.maximumEntities <= 64, `${def?.id}: invalid entity cap`);
  check(Number.isInteger(def?.maximumActiveVoices) && def.maximumActiveVoices >= 0 && def.maximumActiveVoices <= 256, `${def?.id}: invalid audio cap`);
  check(Number.isInteger(def?.maximumProjectiles) && def.maximumProjectiles >= 0 && def.maximumProjectiles <= 256, `${def?.id}: invalid projectile cap`);
  check(typeof def?.pooled === 'boolean' && typeof def?.prewarmed === 'boolean', `${def?.id}: pool/prewarm policy missing`);
  check(typeof def?.provenanceId === 'string' && def.provenanceId.length > 0, `${def?.id}: provenance missing`);
}

const swarm = definitions.find(item => item.id === 'drone-swarm-entity');
const pilot = definitions.find(item => item.id === 'piloted-drone-entity');
const chopper = definitions.find(item => item.id === 'chopper-entity');
const carpetBomber = definitions.find(item => item.id === 'carpet-bomber-entity');
const adrenaline = catalog.find(item => item.id === 'adrenaline');
const chopperCatalog = catalog.find(item => item.id === 'chopper');
const carpetBomberCatalog = catalog.find(item => item.id === 'carpet-bomber');
check(Boolean(adrenaline) && adrenaline.durationMs === 15000, 'Adrenaline duration must be 15000ms');
check(Boolean(chopper) && chopper.durationMs === 30000, 'Chopper duration must be 30000ms');
check(Boolean(chopperCatalog) && chopperCatalog.supportDefinitionId === 'chopper-entity', 'Chopper catalog binding invalid');
check(Boolean(carpetBomber), 'Carpet Bomber definition missing');
check(Boolean(carpetBomberCatalog) && carpetBomberCatalog.supportDefinitionId === 'carpet-bomber-entity', 'Carpet Bomber catalog binding invalid');
if (carpetBomber) {
  check(carpetBomber.kind === 'aircraft', 'Carpet Bomber must use the aircraft support kind');
  check(carpetBomber.bombCount === 20, 'Carpet Bomber must schedule exactly 20 impacts');
  check(carpetBomber.ingressPolicy === 'host-seeded-random-valid', 'Carpet Bomber ingress policy invalid');
  check(carpetBomber.pathPolicy === 'bounded-zigzag-strip', 'Carpet Bomber path policy invalid');
  check(carpetBomber.maximumProjectiles >= carpetBomber.bombCount, 'Carpet Bomber projectile cap is below its impact count');
}
check(Boolean(swarm), 'drone swarm definition missing');
check(Boolean(pilot), 'piloted drone definition missing');
if (swarm) {
  check(swarm.count === 12 && swarm.health === 50, 'swarm must be 12 drones at 50 HP');
  check(swarm.magazine === 20 && swarm.reserveClips === null, 'swarm must use unlimited 20-round reload loops');
  check(swarm.durationMs === 60000, 'swarm duration must be 60000ms');
  check(idOk(swarm.gunProfileId), 'swarm gun profile missing');
  check(swarm.navRequired === true && swarm.targeting === 'host-los-smoke-cover', 'swarm nav/targeting policy invalid');
}
if (pilot) {
  check(pilot.count === 1 && pilot.health === 50, 'piloted drone must be one entity at 50 HP');
  check(pilot.magazine === 20 && pilot.reserveClips === 1, 'piloted drone must have two 20-round magazines');
  check(pilot.fuelMs === 30000, 'piloted drone fuel must be 30000ms');
  check(idOk(pilot.gunProfileId), 'piloted gun profile missing');
  check(pilot.sensor?.presentationOnly === true && pilot.sensor?.revealPolicy === 'living-hostiles-only', 'piloted sensor policy invalid');
}
if (swarm && pilot) check(swarm.gunProfileId === pilot.gunProfileId, 'swarm and piloted drone gun profiles differ');
for (const def of [swarm, pilot].filter(Boolean)) check(gunProfiles.some(profile => profile.id === def.gunProfileId), `${def.id}: referenced gun profile missing`);
for (const profile of gunProfiles) {
  check(finite(profile?.damage, 0, 1000) && finite(profile?.rpm, 1, 3000), `${profile?.id}: invalid damage/rpm`);
  check(finite(profile?.falloffEndM, 0, 2000) && finite(profile?.penetration, 0, 1000), `${profile?.id}: invalid falloff/penetration`);
}

const carePackage = catalog.find(item => item.id === CARE_PACKAGE_ID);
check(Boolean(carePackage), 'care-package catalog definition missing');
check(manifest.carePool === undefined, 'carePool is a forbidden second reward-eligibility source');
const rewardEligible = catalog.filter(item => item?.availability !== 'retired' && item?.id !== CARE_PACKAGE_ID);
for (const item of catalog) {
  const eligible = item?.availability !== 'retired' && item?.id !== CARE_PACKAGE_ID;
  if (eligible) check(item.carePackageWeightUnits > 0, `${item?.id}: reward-eligible definition must have a positive weight`);
  else check(item?.carePackageWeightUnits === 0, `${item?.id}: reward-ineligible definition must have zero weight`);
}
const totalWeight = rewardEligible.reduce((sum, item) => sum + (Number.isSafeInteger(item?.carePackageWeightUnits) ? item.carePackageWeightUnits : 0), 0);
check(Number.isSafeInteger(totalWeight) && totalWeight > 0, 'derived reward-pool total must be a positive safe integer');
const nuke = catalog.find(item => item.id === NUKE_ID);
check(Boolean(nuke) && nuke.availability === 'care-only', 'Nuke must have care-only availability');
if (nuke && Number.isSafeInteger(nuke.carePackageWeightUnits) && Number.isSafeInteger(totalWeight)) {
  check(BigInt(nuke.carePackageWeightUnits) * 100n === BigInt(totalWeight), 'Nuke weight must equal exactly 1% of the derived reward pool');
}
for (const lowerCost of rewardEligible) {
  for (const higherCost of rewardEligible) {
    if (higherCost.cost > lowerCost.cost) {
      check(higherCost.carePackageWeightUnits <= lowerCost.carePackageWeightUnits, `care weight increases with cost at ${higherCost.id}`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL killstreak-catalog ${path.basename(input)} ${failures.length}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS killstreak-catalog ${path.basename(input)} catalog=${catalog.length} rewardEligible=${rewardEligible.length} totalWeight=${totalWeight} support=${definitions.length}`);
