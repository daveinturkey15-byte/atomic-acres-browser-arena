#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-audio-catalog.mjs <audio-catalog.json>');
  process.exit(2);
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
let catalog;

try {
  catalog = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL audio-catalog unreadable-json ${error.message}`);
  process.exit(2);
}

check(catalog.schemaVersion === 1, 'schemaVersion must equal 1');
const requiredBuses = ['master', 'sfx', 'movement', 'ui', 'announcements', 'ambience', 'menu-music', 'game-music'];
const buses = Array.isArray(catalog.buses) ? catalog.buses : [];
check(new Set(buses).size === buses.length, 'bus IDs must be unique');
for (const bus of requiredBuses) {
  check(buses.includes(bus), `missing bus ${bus}`);
  check(finite(catalog.settings?.[bus]?.gain, 0, 1), `${bus}: gain must be normalized`);
  check(typeof catalog.settings?.[bus]?.muted === 'boolean', `${bus}: mute must be explicit`);
}

const requiredFamilies = ['weapon', 'ordnance', 'impact', 'door', 'shed-debris', 'support', 'footstep', 'health', 'ui', 'announcement', 'ambience', 'music'];
const events = Array.isArray(catalog.events) ? catalog.events : [];
check(events.length > 0, 'events must be a non-empty array');
const eventIds = events.map(event => event?.id);
check(new Set(eventIds).size === eventIds.length, 'event IDs must be unique');
for (const family of requiredFamilies) check(events.some(event => event?.family === family), `missing event family ${family}`);

for (const event of events) {
  const label = idOk(event?.id) ? event.id : '<invalid-id>';
  check(idOk(event?.id), `${label}: invalid id`);
  check(requiredFamilies.includes(event?.family), `${label}: invalid family`);
  check(requiredBuses.includes(event?.bus) && event.bus !== 'master', `${label}: invalid category bus`);
  check(['local', 'spatial'].includes(event?.policy), `${label}: invalid spatial policy`);
  check(event?.policy === 'spatial' ? idOk(event?.spatialProfileId) : event?.spatialProfileId === null, `${label}: spatial profile identity invalid`);
  check(Number.isInteger(event?.maxConcurrent) && event.maxConcurrent >= 1 && event.maxConcurrent <= 64, `${label}: concurrency cap invalid`);
  check(Number.isInteger(event?.priority) && event.priority >= 0 && event.priority <= 255, `${label}: priority invalid`);
  check(finite(event?.cooldownMs, 0, 60000), `${label}: cooldown invalid`);
  check(typeof event?.owner === 'string' && event.owner.length > 0, `${label}: lifecycle owner missing`);
  check(idOk(event?.evidenceId), `${label}: evidenceId missing or invalid`);
  const variants = Array.isArray(event?.variants) ? event.variants : [];
  check(variants.length > 0, `${label}: variants missing`);
  for (const variant of variants) {
    check(idOk(variant?.id), `${label}: variant id invalid`);
    check(typeof variant?.source === 'string' && variant.source.length > 0, `${label}: variant source missing`);
    check(typeof variant?.license === 'string' && variant.license.length > 0, `${label}: variant license missing`);
    check(shaOk(variant?.sha256), `${label}: variant digest invalid`);
  }
}

const profiles = Array.isArray(catalog.spatialProfiles) ? catalog.spatialProfiles : [];
const profileIds = profiles.map(profile => profile?.id);
check(new Set(profileIds).size === profileIds.length, 'spatial profile IDs must be unique');
for (const event of events.filter(event => event?.policy === 'spatial')) check(profileIds.includes(event?.spatialProfileId), `${event?.id}: spatial profile missing`);
for (const profile of profiles) {
  const label = idOk(profile?.id) ? profile.id : '<invalid-profile>';
  check(idOk(profile?.id), `${label}: invalid profile id`);
  check(finite(profile?.referenceDistanceM, 0.01, 1000), `${label}: reference distance invalid`);
  check(finite(profile?.maxDistanceM, profile?.referenceDistanceM ?? 1001, 10000), `${label}: max distance invalid`);
  check(finite(profile?.rolloff, 0, 10), `${label}: rolloff invalid`);
  check(finite(profile?.coneInnerDeg, 0, 360) && finite(profile?.coneOuterDeg, profile?.coneInnerDeg ?? 361, 360), `${label}: cone bounds invalid`);
  check(Number.isInteger(profile?.voiceCap) && profile.voiceCap >= 1 && profile.voiceCap <= 128, `${label}: voice cap invalid`);
  check(['oldest', 'quietest', 'lowest-priority'].includes(profile?.stealPolicy), `${label}: deterministic steal policy missing`);
}

const footsteps = catalog.footsteps ?? {};
check(footsteps.admittedGroundedOnly === true && footsteps.airborneEmits === false, 'footsteps must require admitted grounded movement');
const footstepKeys = new Set(Array.isArray(footsteps.keyedBy) ? footsteps.keyedBy : []);
for (const key of ['actor', 'life', 'continuity']) check(footstepKeys.has(key), `footsteps missing ${key} identity`);
check(footsteps.resetOnDiscontinuity === true, 'footsteps must reset on discontinuity');
check(Array.isArray(footsteps.surfacePolicies) && footsteps.surfacePolicies.length > 0, 'footstep surface policy missing');

const arenas = Array.isArray(catalog.arenas) ? catalog.arenas : [];
check(arenas.length > 0, 'arena ambience definitions missing');
const arenaIds = arenas.map(arena => arena?.id);
check(new Set(arenaIds).size === arenaIds.length, 'arena IDs must be unique');
const ambienceEventIds = new Set(events.filter(event => event?.family === 'ambience').map(event => event?.id));
const ambienceSignatures = [];
for (const arena of arenas) {
  check(idOk(arena?.id), `${arena?.id}: invalid arena id`);
  check(Array.isArray(arena?.beds) && arena.beds.length > 0 && arena.beds.every(idOk), `${arena?.id}: ambience beds missing`);
  for (const bed of Array.isArray(arena?.beds) ? arena.beds : []) check(ambienceEventIds.has(bed), `${arena?.id}: unknown ambience bed ${bed}`);
  check(Number.isInteger(arena?.sourceBudget) && arena.sourceBudget >= 1 && arena.sourceBudget <= 64, `${arena?.id}: source budget invalid`);
  check(arena?.disposesOnLeave === true, `${arena?.id}: disposal policy missing`);
  ambienceSignatures.push((arena?.beds ?? []).slice().sort().join('|'));
}
if (arenas.length > 1) check(new Set(ambienceSignatures).size > 1, 'all arenas use identical ambience without rationale');

const budgets = catalog.budgets ?? {};
check(Number.isInteger(budgets.maxActiveVoices) && budgets.maxActiveVoices >= 1 && budgets.maxActiveVoices <= 512, 'maxActiveVoices invalid');
check(Number.isInteger(budgets.maxLoops) && budgets.maxLoops >= 0 && budgets.maxLoops <= budgets.maxActiveVoices, 'maxLoops invalid');
check(Number.isInteger(budgets.maxReusableChains) && budgets.maxReusableChains >= 1 && budgets.maxReusableChains <= 512, 'maxReusableChains invalid');
check(Number.isInteger(budgets.maxOcclusionQueriesPerSecond) && budgets.maxOcclusionQueriesPerSecond >= 0 && budgets.maxOcclusionQueriesPerSecond <= 10000, 'occlusion query budget invalid');
check(finite(budgets.occlusionCpuP95Ms, 0, 50), 'occlusion CPU p95 budget invalid');
for (const bus of requiredBuses.filter(bus => bus !== 'master')) {
  check(Number.isInteger(budgets.perBusVoices?.[bus]) && budgets.perBusVoices[bus] >= 0 && budgets.perBusVoices[bus] <= budgets.maxActiveVoices, `${bus}: per-bus voice budget invalid`);
}
check(catalog.settleChecks?.arenaSwitch === true && catalog.settleChecks?.rematch === true && catalog.settleChecks?.suspendResume === true, 'lifecycle settle checks incomplete');

if (failures.length) {
  console.error(`FAIL audio-catalog ${path.basename(input)} ${new Set(failures).size}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS audio-catalog ${path.basename(input)} events=${events.length} buses=${requiredBuses.length} profiles=${profiles.length}`);
