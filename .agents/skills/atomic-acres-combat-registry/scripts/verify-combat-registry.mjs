#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-combat-registry.mjs <combat-manifest.json>');
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
  console.error(`FAIL combat-registry unreadable-json ${error.message}`);
  process.exit(2);
}

check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
check(Array.isArray(manifest.weapons) && manifest.weapons.length > 0, 'weapons must be a non-empty array');
const weapons = Array.isArray(manifest.weapons) ? manifest.weapons : [];
const ids = weapons.map(item => item?.id);
check(new Set(ids).size === ids.length, 'weapon IDs must be unique');

const slots = new Set(['primary', 'secondary', 'special']);
const families = new Set(['assault-rifle', 'smg', 'lmg', 'marksman', 'shotgun', 'sidearm', 'launcher']);
const fireKinds = new Set(['hitscan', 'pellet', 'slug', 'projectile']);
const fireModes = new Set(['semi', 'automatic']);

for (const weapon of weapons) {
  const label = idOk(weapon?.id) ? weapon.id : '<invalid-id>';
  check(idOk(weapon?.id), `${label}: invalid id`);
  check(slots.has(weapon?.slot), `${label}: invalid slot`);
  check(families.has(weapon?.family), `${label}: invalid family`);
  check(fireKinds.has(weapon?.fireKind), `${label}: invalid fireKind`);
  check(fireModes.has(weapon?.fireMode), `${label}: invalid fireMode`);
  check(finite(weapon?.rpm, 1, 3000), `${label}: rpm out of bounds`);
  check(Number.isInteger(weapon?.pellets) && weapon.pellets >= 1 && weapon.pellets <= 32, `${label}: pellets out of bounds`);
  check(finite(weapon?.spinUpMs, 0, 10000), `${label}: spinUpMs out of bounds`);
  check(finite(weapon?.movementMultiplier, 0.1, 2), `${label}: movementMultiplier out of bounds`);
  check(weapon?.fireKind === 'pellet' ? weapon.pellets > 1 : weapon?.pellets === 1, `${label}: pellet count does not match fire kind`);
  check(weapon?.fireKind === 'projectile' ? idOk(weapon?.projectileId) : weapon?.projectileId === null, `${label}: projectile identity mismatch`);

  const damage = weapon?.damage ?? {};
  check(finite(damage.base, 0, 1000) && finite(damage.minimum, 0, damage.base ?? -1), `${label}: invalid damage`);
  check(finite(damage.falloffStartM, 0, 1000) && finite(damage.falloffEndM, damage.falloffStartM ?? 1001, 2000), `${label}: invalid falloff`);
  check(finite(damage.headMultiplier, 0, 10) && finite(damage.limbMultiplier, 0, 10), `${label}: invalid hit multipliers`);

  const handling = weapon?.handling ?? {};
  check(finite(handling.hipSpreadDeg, 0, 45), `${label}: invalid hip spread`);
  check(finite(handling.adsSpreadDeg, 0, handling.hipSpreadDeg ?? -1), `${label}: invalid ADS spread`);
  check(finite(handling.recoilPitchDeg, 0, 45) && finite(handling.recoilYawDeg, 0, 45), `${label}: invalid recoil`);
  check(finite(handling.recoveryMs, 0, 10000), `${label}: invalid recoil recovery`);

  const ammo = weapon?.ammo ?? {};
  check(Number.isInteger(ammo.magazine) && ammo.magazine > 0 && ammo.magazine <= 2000, `${label}: invalid magazine`);
  check(Number.isInteger(ammo.reserve) && ammo.reserve >= 0 && ammo.reserve <= 10000, `${label}: invalid reserve`);
  check(finite(ammo.reloadSeconds, 0.05, 60) && finite(ammo.switchSeconds, 0.01, 30), `${label}: invalid action timing`);

  const penetration = weapon?.penetration ?? {};
  check(finite(penetration.power, 0, 1000), `${label}: invalid penetration power`);
  check(finite(penetration.retentionPerSurface, 0, 1), `${label}: invalid penetration retention`);
  check(Number.isInteger(penetration.maximumSurfaces) && penetration.maximumSurfaces >= 0 && penetration.maximumSurfaces <= 16, `${label}: invalid surface cap`);
  check(idOk(weapon?.opticPolicyId), `${label}: optic policy missing or invalid`);

  for (const policy of ['loadout', 'bot', 'drop', 'replay', 'telemetry']) {
    check(typeof weapon?.policies?.[policy] === 'string' && weapon.policies[policy].length > 0, `${label}: missing ${policy} policy`);
  }
  for (const field of ['presentationId', 'audioId', 'provenanceId', 'testId']) {
    check(idOk(weapon?.[field]), `${label}: invalid or missing ${field}`);
  }
}

const requiredDomains = ['gameplay', 'protocol', 'loadout', 'bots', 'drops', 'replay', 'presentation', 'audio', 'penetration', 'telemetry', 'tests', 'provenance'];
const known = new Set(ids.filter(idOk));
for (const domain of requiredDomains) {
  const values = manifest.mappings?.[domain];
  check(Array.isArray(values), `mapping ${domain} must be an array`);
  if (!Array.isArray(values)) continue;
  check(new Set(values).size === values.length, `mapping ${domain} contains duplicates`);
  for (const id of values) check(known.has(id), `mapping ${domain} contains unknown ${id}`);
  for (const id of known) check(values.includes(id), `mapping ${domain} missing ${id}`);
}

const provenance = Array.isArray(manifest.provenance) ? manifest.provenance : [];
for (const weapon of weapons) {
  const record = provenance.find(item => item?.id === weapon?.provenanceId);
  check(Boolean(record), `${weapon?.id}: provenance record missing`);
  if (record) {
    check(typeof record.source === 'string' && record.source.length > 0, `${weapon.id}: provenance source missing`);
    check(typeof record.license === 'string' && record.license.length > 0, `${weapon.id}: provenance license missing`);
    check(shaOk(record.sha256), `${weapon.id}: provenance digest invalid`);
  }
}

if (failures.length) {
  console.error(`FAIL combat-registry ${path.basename(input)} ${failures.length}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS combat-registry ${path.basename(input)} weapons=${weapons.length} mappings=${requiredDomains.length}`);
