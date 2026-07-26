#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-interactive-world.mjs <interactive-world-manifest.json>');
  process.exit(2);
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
let manifest;

try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL interactive-world unreadable-json ${error.message}`);
  process.exit(2);
}

check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
check(manifest.decisionReceipt?.status === 'FROZEN', 'outdoor classification decision must be FROZEN');
const outdoorMaps = Array.isArray(manifest.decisionReceipt?.outdoorMaps) ? manifest.decisionReceipt.outdoorMaps : [];
check(outdoorMaps.length > 0 && outdoorMaps.every(idOk), 'outdoorMaps must contain stable IDs');
const consumers = new Set(Array.isArray(manifest.consumers) ? manifest.consumers : []);
for (const consumer of ['movement', 'ballistics', 'grenades', 'ai-los', 'support-targeting', 'spawn-nav', 'rendering']) {
  check(consumers.has(consumer), `missing canonical revision consumer ${consumer}`);
}

const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
check(objects.length > 0, 'objects must be a non-empty array');
const ids = objects.map(item => item?.id);
check(new Set(ids).size === ids.length, 'object IDs must be unique');

for (const object of objects) {
  const label = idOk(object?.id) ? object.id : '<invalid-id>';
  check(idOk(object?.id), `${label}: invalid id`);
  check(object?.kind === 'destructible-shed', `${label}: unsupported kind`);
  check(object?.authority === 'host', `${label}: authority must be host`);
  check(object?.revisioned === true, `${label}: state must be revisioned`);
  check(object?.verticalSlicePassed === true, `${label}: vertical slice gate not passed`);

  const placements = Array.isArray(object?.placements) ? object.placements : [];
  const placementMap = new Map(placements.map(item => [item?.arenaId, item?.count]));
  for (const arenaId of outdoorMaps) {
    check(Number.isInteger(placementMap.get(arenaId)) && placementMap.get(arenaId) >= 2, `${label}: ${arenaId} must place at least two sheds`);
  }
  for (const placement of placements) {
    check(outdoorMaps.includes(placement?.arenaId), `${label}: placement on non-outdoor arena ${placement?.arenaId}`);
  }

  const door = object?.door ?? {};
  check(door.durationMs === 1000, `${label}: door duration must equal 1000ms`);
  check(door.commandSequenced === true && door.canonicalTicks === true, `${label}: door command/tick sequencing missing`);
  const obstructionKinds = new Set(Array.isArray(door.obstructionKinds) ? door.obstructionKinds : []);
  for (const kind of ['player', 'major-debris', 'bullet']) check(obstructionKinds.has(kind), `${label}: missing door obstruction ${kind}`);
  check(['reverse-resume', 'pause-resume'].includes(door.obstructionPolicy), `${label}: invalid obstruction policy`);

  const apertures = object?.apertures ?? {};
  check(apertures.canonicalSharedRepresentation === true, `${label}: render/ballistics aperture parity missing`);
  check(Number.isInteger(apertures.maxPerObject) && apertures.maxPerObject >= 1 && apertures.maxPerObject <= 64, `${label}: aperture cap invalid`);
  check(['merge', 'exact-or-fail-closed'].includes(apertures.saturation), `${label}: aperture saturation policy invalid`);

  const surfaces = new Set(Array.isArray(object?.surfaces) ? object.surfaces : []);
  for (const surface of ['wall', 'roof', 'door', 'detached-chunk']) check(surfaces.has(surface), `${label}: missing surface role ${surface}`);

  const debris = object?.debris ?? {};
  check(Number.isInteger(debris.maxMajorChunks) && debris.maxMajorChunks >= 1 && debris.maxMajorChunks <= 16, `${label}: major debris cap invalid`);
  check(debris.hostSimulated === true, `${label}: major debris must be host simulated`);
  check(debris.shotWakeFlat === true && debris.contactNudgeNonFlat === true, `${label}: debris wake/nudge behavior incomplete`);

  const persistence = object?.persistence ?? {};
  check(persistence.lateJoin === true, `${label}: late-join reconstruction missing`);
  check(persistence.resetOnRematch === true && persistence.resetOnArenaChange === true, `${label}: reset policy incomplete`);

  const budgets = object?.budgets ?? {};
  check(finite(budgets.maxStateBytes, 1, 1048576), `${label}: maxStateBytes invalid`);
  check(finite(budgets.maxCollisionQueriesPerTick, 1, 10000), `${label}: collision-query budget invalid`);
  check(finite(budgets.maxMajorBodiesPerMatch, 1, 1024), `${label}: major-body budget invalid`);

  check(typeof object?.provenance?.source === 'string' && object.provenance.source.length > 0, `${label}: provenance source missing`);
  check(typeof object?.provenance?.license === 'string' && object.provenance.license.length > 0, `${label}: provenance license missing`);
  check(shaOk(object?.provenance?.sha256), `${label}: provenance digest invalid`);
  check(Array.isArray(object?.evidenceIds) && object.evidenceIds.length > 0 && object.evidenceIds.every(idOk), `${label}: evidence IDs missing or invalid`);
}

if (failures.length) {
  console.error(`FAIL interactive-world ${path.basename(input)} ${new Set(failures).size}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS interactive-world ${path.basename(input)} objects=${objects.length} outdoorMaps=${outdoorMaps.length}`);
