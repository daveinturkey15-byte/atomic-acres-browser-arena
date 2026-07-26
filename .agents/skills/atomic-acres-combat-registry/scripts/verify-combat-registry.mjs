#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROSTER_ORACLE_ID = 'pass64-b1-weapon-roster-v1';
const WEAPON_ORACLE = Object.freeze({
  carbine: Object.freeze({ slot: 'primary', family: 'assault-rifle', fireKind: 'hitscan', fireMode: 'automatic', damagePolicy: 'standard' }),
  smg: Object.freeze({ slot: 'primary', family: 'smg', fireKind: 'hitscan', fireMode: 'automatic', damagePolicy: 'standard' }),
  lmg: Object.freeze({ slot: 'primary', family: 'lmg', fireKind: 'hitscan', fireMode: 'automatic', damagePolicy: 'standard' }),
  scattergun: Object.freeze({ slot: 'primary', family: 'shotgun', fireKind: 'pellet', fireMode: 'semi', damagePolicy: 'standard' }),
  sniper: Object.freeze({ slot: 'primary', family: 'marksman', fireKind: 'hitscan', fireMode: 'semi', damagePolicy: 'standard' }),
  pistol: Object.freeze({ slot: 'secondary', family: 'sidearm', fireKind: 'hitscan', fireMode: 'semi', damagePolicy: 'standard' }),
  'machine-pistol': Object.freeze({ slot: 'secondary', family: 'sidearm', fireKind: 'hitscan', fireMode: 'automatic', damagePolicy: 'standard' }),
  magnum: Object.freeze({ slot: 'secondary', family: 'sidearm', fireKind: 'hitscan', fireMode: 'semi', damagePolicy: 'head-only' }),
  railgun: Object.freeze({ slot: 'special', family: 'marksman', fireKind: 'hitscan', fireMode: 'semi', damagePolicy: 'standard' }),
});
const REQUIRED_WEAPON_IDS = Object.freeze(Object.keys(WEAPON_ORACLE));
const REQUIRED_COVERAGE = Object.freeze([
  'gameplay', 'protocol', 'loadout', 'bots', 'drops', 'replay', 'presentation',
  'audio', 'penetration', 'telemetry', 'tests', 'provenance',
]);
const SLOT_VALUES = new Set(['primary', 'secondary', 'special']);
const FAMILY_VALUES = new Set(['assault-rifle', 'smg', 'lmg', 'marksman', 'shotgun', 'sidearm', 'launcher']);
const FIRE_KIND_VALUES = new Set(['hitscan', 'pellet', 'slug', 'projectile']);
const FIRE_MODE_VALUES = new Set(['semi', 'automatic']);
const MATERIAL_POLICY_ID = 'pass64-ballistic-materials-v1';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const clone = value => JSON.parse(JSON.stringify(value));

function exactKeys(value, required, label, failures, optional = []) {
  if (!isObject(value)) {
    failures.push(`${label}: must be an object`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) failures.push(`${label}: missing required key ${key}`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) failures.push(`${label}: unknown key ${key}`);
  return true;
}

function exactStringSet(values, expected, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label}: must be an array`);
    return;
  }
  if (new Set(values).size !== values.length) failures.push(`${label}: duplicates are forbidden`);
  for (const value of values) if (!expected.includes(value)) failures.push(`${label}: unknown value ${value}`);
  for (const value of expected) if (!values.includes(value)) failures.push(`${label}: missing pinned value ${value}`);
  if (values.length !== expected.length) failures.push(`${label}: must equal the pinned set`);
}

function validateOptic(optic, weaponId, failures, allowReviewedThermalSchemaProbe = false) {
  const label = `${weaponId}.optic`;
  if (optic === null) return;
  if (!isObject(optic)) {
    failures.push(`${label}: must be null or a typed object`);
    return;
  }
  if (optic.kind === 'standard') {
    exactKeys(optic, ['kind', 'magnification', 'solidOcclusion'], label, failures);
    if (!finite(optic.magnification, 1, 16)) failures.push(`${label}: magnification invalid`);
    if (optic.solidOcclusion !== 'required') failures.push(`${label}: solid occlusion must be required`);
    return;
  }
  if (optic.kind === 'thermal-smoke-only') {
    exactKeys(optic, ['kind', 'magnification', 'solidOcclusion', 'targetPolicy', 'authority'], label, failures);
    if (!allowReviewedThermalSchemaProbe && WEAPON_ORACLE[weaponId]?.opticKind !== 'thermal-smoke-only') failures.push(`${label}: smoke-only thermal requires a reviewed DMR oracle identity`);
    if (optic.magnification !== 2.5) failures.push(`${label}: DMR magnification must equal 2.5`);
    if (optic.solidOcclusion !== 'required') failures.push(`${label}: thermal must remain solid-occluded`);
    if (optic.targetPolicy !== 'living-targets-through-smoke') failures.push(`${label}: thermal target policy invalid`);
    if (optic.authority !== 'presentation-only') failures.push(`${label}: thermal cannot authorize a shot`);
    return;
  }
  if (optic.kind === 'special-authority') {
    exactKeys(optic, ['kind', 'magnification', 'solidOcclusion', 'authorityPolicyId'], label, failures);
    if (weaponId !== 'railgun') failures.push(`${label}: special authority is reserved for a pinned special weapon`);
    if (!finite(optic.magnification, 1, 16)) failures.push(`${label}: magnification invalid`);
    if (optic.solidOcclusion !== 'required') failures.push(`${label}: special optic must remain solid-occluded`);
    if (optic.authorityPolicyId !== 'host-railgun-v1') failures.push(`${label}: special authority policy invalid`);
    return;
  }
  exactKeys(optic, ['kind'], label, failures);
  failures.push(`${label}: invalid optic discriminant ${String(optic.kind)}`);
}

function validateWeapon(weapon, failures) {
  const label = idOk(weapon?.id) ? weapon.id : '<invalid-weapon>';
  const required = [
    'id', 'displayName', 'slot', 'family', 'fireKind', 'fireMode', 'rpm', 'pellets', 'spinUpMs',
    'movementMultiplier', 'damage', 'spread', 'recoil', 'ammo', 'penetration', 'optic', 'projectileId',
    'policies', 'modelSetId', 'presentationId', 'audioId', 'provenanceId', 'evidenceIds',
  ];
  exactKeys(weapon, required, label, failures);
  if (!idOk(weapon?.id)) failures.push(`${label}: invalid id`);
  if (typeof weapon?.displayName !== 'string' || weapon.displayName.trim().length < 2 || weapon.displayName.length > 80) failures.push(`${label}: displayName invalid`);
  if (!SLOT_VALUES.has(weapon?.slot)) failures.push(`${label}: invalid slot`);
  if (!FAMILY_VALUES.has(weapon?.family)) failures.push(`${label}: invalid family`);
  if (!FIRE_KIND_VALUES.has(weapon?.fireKind)) failures.push(`${label}: invalid fireKind`);
  if (!FIRE_MODE_VALUES.has(weapon?.fireMode)) failures.push(`${label}: invalid fireMode`);
  const oracle = WEAPON_ORACLE[weapon?.id];
  if (!oracle) failures.push(`${label}: ID is not in the independently pinned B1 roster`);
  else {
    for (const key of ['slot', 'family', 'fireKind', 'fireMode']) if (weapon?.[key] !== oracle[key]) failures.push(`${label}: ${key} contradicts the B1 oracle`);
  }
  if (!finite(weapon?.rpm, 1, 3000)) failures.push(`${label}: rpm invalid`);
  if (!Number.isInteger(weapon?.pellets) || weapon.pellets < 1 || weapon.pellets > 12) failures.push(`${label}: pellets must be an integer from 1 through 12`);
  if (weapon?.fireKind === 'pellet' && weapon?.pellets <= 1) failures.push(`${label}: pellet fireKind requires multiple pellets`);
  if (weapon?.fireKind !== 'pellet' && weapon?.pellets !== 1) failures.push(`${label}: non-pellet fireKind requires exactly one ray or projectile`);
  if (weapon?.id === 'scattergun' && weapon?.pellets !== 9) failures.push(`${label}: B1 scattergun must retain nine pellets`);
  if (!finite(weapon?.spinUpMs, 0, 10000)) failures.push(`${label}: spinUpMs invalid`);
  if (!finite(weapon?.movementMultiplier, 0.1, 1.5)) failures.push(`${label}: movementMultiplier invalid`);

  const damage = weapon?.damage;
  exactKeys(damage, ['policy', 'base', 'minimum', 'falloffStartM', 'falloffEndM', 'headMultiplier', 'limbMultiplier'], `${label}.damage`, failures);
  if (!['standard', 'head-only'].includes(damage?.policy)) failures.push(`${label}: invalid damage policy`);
  if (oracle && damage?.policy !== oracle.damagePolicy) failures.push(`${label}: damage policy contradicts the B1 oracle`);
  if (!finite(damage?.base, 0, 10000) || !finite(damage?.minimum, 0, damage?.base ?? -1)) failures.push(`${label}: damage bounds invalid`);
  if (!finite(damage?.falloffStartM, 0, 2000) || !finite(damage?.falloffEndM, damage?.falloffStartM ?? 2001, 2000)) failures.push(`${label}: falloff invalid`);
  if (!finite(damage?.headMultiplier, 0, 10) || !finite(damage?.limbMultiplier, 0, 10)) failures.push(`${label}: hit multipliers invalid`);
  if (damage?.policy === 'head-only' && !(damage.headMultiplier === 1 && damage.limbMultiplier === 0)) failures.push(`${label}: head-only policy must encode the B1 binary head contract`);

  const spread = weapon?.spread;
  exactKeys(spread, ['hipRadians', 'adsMultiplier', 'movementMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier', 'sustainedPerShot', 'maximumRadians'], `${label}.spread`, failures);
  if (!finite(spread?.hipRadians, 0, Math.PI / 2) || !finite(spread?.maximumRadians, spread?.hipRadians ?? Math.PI, Math.PI / 2)) failures.push(`${label}: spread radians invalid`);
  for (const key of ['adsMultiplier', 'movementMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier']) if (!finite(spread?.[key], 0, 4)) failures.push(`${label}: spread ${key} invalid`);
  if (spread?.standMultiplier !== 1) failures.push(`${label}: spread standMultiplier must equal 1`);
  if (!finite(spread?.sustainedPerShot, 0, spread?.maximumRadians ?? -1)) failures.push(`${label}: sustained spread invalid`);

  const recoil = weapon?.recoil;
  exactKeys(recoil, ['pitchRadians', 'yawRadians', 'recoveryPerSecond', 'adsMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier', 'deterministicPatternId'], `${label}.recoil`, failures);
  if (!finite(recoil?.pitchRadians, 0, Math.PI) || !finite(recoil?.yawRadians, 0, Math.PI)) failures.push(`${label}: recoil radians invalid`);
  if (!finite(recoil?.recoveryPerSecond, 0.01, 100)) failures.push(`${label}: recoveryPerSecond invalid`);
  for (const key of ['adsMultiplier', 'standMultiplier', 'crouchMultiplier', 'proneMultiplier']) if (!finite(recoil?.[key], 0, 4)) failures.push(`${label}: recoil ${key} invalid`);
  if (recoil?.standMultiplier !== 1) failures.push(`${label}: recoil standMultiplier must equal 1`);
  if (!idOk(recoil?.deterministicPatternId)) failures.push(`${label}: deterministic recoil pattern missing`);

  const ammo = weapon?.ammo;
  exactKeys(ammo, ['magazine', 'reserve', 'reloadSeconds', 'emptyReloadSeconds', 'switchSeconds'], `${label}.ammo`, failures);
  if (!Number.isInteger(ammo?.magazine) || ammo.magazine < 1 || ammo.magazine > 2000) failures.push(`${label}: magazine invalid`);
  if (!Number.isInteger(ammo?.reserve) || ammo.reserve < 0 || ammo.reserve > 10000) failures.push(`${label}: reserve invalid`);
  if (!finite(ammo?.reloadSeconds, 0.05, 30) || !finite(ammo?.emptyReloadSeconds, ammo?.reloadSeconds ?? 31, 30)) failures.push(`${label}: reload timings invalid`);
  if (!finite(ammo?.switchSeconds, 0.01, 10)) failures.push(`${label}: switchSeconds invalid`);

  const penetration = weapon?.penetration;
  exactKeys(penetration, ['calibreLabel', 'power', 'fmjMultiplier', 'materialPolicyId', 'energyFalloffStartM', 'energyFalloffEndM', 'minimumEnergyRetention', 'minimumWallDamageMultiplier', 'maximumSurfaces'], `${label}.penetration`, failures);
  if (typeof penetration?.calibreLabel !== 'string' || penetration.calibreLabel.length < 1 || penetration.calibreLabel.length > 40) failures.push(`${label}: calibreLabel invalid`);
  if (!finite(penetration?.power, 0, 100000)) failures.push(`${label}: penetration power invalid`);
  if (!finite(penetration?.fmjMultiplier, 1, 4)) failures.push(`${label}: fmjMultiplier invalid`);
  if (penetration?.materialPolicyId !== MATERIAL_POLICY_ID) failures.push(`${label}: material policy must bind the B1 resistance table`);
  if (!finite(penetration?.energyFalloffStartM, 0, 2000) || !finite(penetration?.energyFalloffEndM, 0, 2001) || !(penetration.energyFalloffEndM > penetration.energyFalloffStartM)) failures.push(`${label}: penetration energy falloff invalid`);
  if (!finite(penetration?.minimumEnergyRetention, 0, 1) || !finite(penetration?.minimumWallDamageMultiplier, 0, 1)) failures.push(`${label}: penetration minimums invalid`);
  if (!Number.isInteger(penetration?.maximumSurfaces) || penetration.maximumSurfaces < 0 || penetration.maximumSurfaces > 64) failures.push(`${label}: maximumSurfaces invalid`);
  if (weapon?.id === 'railgun' && !(penetration?.power === 100000 && penetration?.maximumSurfaces === 64)) failures.push(`${label}: railgun must preserve exact power 100000 and 64 surfaces`);

  validateOptic(weapon?.optic, weapon?.id, failures);
  if (weapon?.fireKind === 'projectile') {
    if (!idOk(weapon?.projectileId)) failures.push(`${label}: projectile fireKind requires projectileId`);
  } else if (weapon?.projectileId !== null) failures.push(`${label}: non-projectile fireKind must use null projectileId`);

  const policies = weapon?.policies;
  exactKeys(policies, ['loadout', 'bot', 'drop', 'replay', 'telemetry', 'stance', 'authority'], `${label}.policies`, failures);
  if (!['eligible', 'diagnostic-only', 'never'].includes(policies?.loadout)) failures.push(`${label}: loadout policy invalid`);
  if (!['eligible', 'diagnostic-only', 'never'].includes(policies?.bot)) failures.push(`${label}: bot policy invalid`);
  if (!['droppable', 'map-pickup', 'never'].includes(policies?.drop)) failures.push(`${label}: drop policy invalid`);
  if (!['serialized', 'decode-only'].includes(policies?.replay)) failures.push(`${label}: replay policy invalid`);
  if (policies?.telemetry !== 'bounded') failures.push(`${label}: telemetry policy invalid`);
  if (!['stand-crouch-prone', 'stand-crouch'].includes(policies?.stance)) failures.push(`${label}: stance policy invalid`);
  if (!['host-shot-v1', 'host-railgun-v1', 'host-projectile-v1'].includes(policies?.authority)) failures.push(`${label}: authority policy invalid`);
  if (weapon?.id === 'railgun' ? policies?.authority !== 'host-railgun-v1' : policies?.authority !== 'host-shot-v1') failures.push(`${label}: authority policy contradicts the B1 route`);
  for (const key of ['modelSetId', 'presentationId', 'audioId', 'provenanceId']) if (!idOk(weapon?.[key])) failures.push(`${label}: ${key} missing or invalid`);
  if (!Array.isArray(weapon?.evidenceIds) || weapon.evidenceIds.length < 1 || new Set(weapon.evidenceIds).size !== weapon.evidenceIds.length || !weapon.evidenceIds.every(idOk)) failures.push(`${label}: evidenceIds invalid`);
}

function validateManifest(manifest) {
  const failures = [];
  exactKeys(manifest, ['schemaVersion', 'rosterOracleId', 'weapons', 'coverage'], 'manifest', failures);
  if (manifest?.schemaVersion !== 1) failures.push('manifest: schemaVersion must equal 1');
  if (manifest?.rosterOracleId !== ROSTER_ORACLE_ID) failures.push('manifest: roster oracle identity mismatch');
  const weapons = Array.isArray(manifest?.weapons) ? manifest.weapons : [];
  if (!Array.isArray(manifest?.weapons)) failures.push('manifest: weapons must be an array');
  if (new Set(weapons.map(item => item?.id)).size !== weapons.length) failures.push('manifest: weapon IDs must be unique');
  exactStringSet(weapons.map(item => item?.id), REQUIRED_WEAPON_IDS, 'manifest weapon roster', failures);
  for (const weapon of weapons) validateWeapon(weapon, failures);
  for (const key of ['modelSetId', 'presentationId', 'audioId', 'provenanceId']) {
    const values = weapons.map(item => item?.[key]);
    if (new Set(values).size !== values.length) failures.push(`manifest: ${key} values must be unique per release weapon`);
  }
  const patternIds = weapons.map(item => item?.recoil?.deterministicPatternId);
  if (new Set(patternIds).size !== patternIds.length) failures.push('manifest: deterministic recoil pattern IDs must be unique per release weapon');

  const coverage = Array.isArray(manifest?.coverage) ? manifest.coverage : [];
  if (!Array.isArray(manifest?.coverage)) failures.push('manifest: coverage must be an array');
  if (new Set(coverage.map(item => item?.weaponId)).size !== coverage.length) failures.push('coverage: weapon IDs must be unique');
  exactStringSet(coverage.map(item => item?.weaponId), REQUIRED_WEAPON_IDS, 'coverage roster', failures);
  for (const row of coverage) {
    const label = `coverage.${row?.weaponId ?? '<invalid>'}`;
    exactKeys(row, ['weaponId', 'channels', 'evidenceSha256'], label, failures);
    if (!REQUIRED_WEAPON_IDS.includes(row?.weaponId)) failures.push(`${label}: unknown weaponId`);
    exactStringSet(row?.channels, REQUIRED_COVERAGE, `${label}.channels`, failures);
    if (!shaOk(row?.evidenceSha256)) failures.push(`${label}: evidence digest invalid`);
  }
  return [...new Set(failures)].sort();
}

function runSelfTest() {
  const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/known-good.json', import.meta.url)), 'utf8'));
  const baseline = validateManifest(fixture);
  if (baseline.length) throw new Error(`known-good fixture invalid: ${baseline.join('; ')}`);
  const thermal = { kind: 'thermal-smoke-only', magnification: 2.5, solidOcclusion: 'required', targetPolicy: 'living-targets-through-smoke', authority: 'presentation-only' };
  const thermalUnionFailures = [];
  validateOptic(thermal, 'dmr-schema-probe', thermalUnionFailures, true);
  if (thermalUnionFailures.length) throw new Error(`valid thermal union rejected: ${thermalUnionFailures.join('; ')}`);
  const cases = [
    ['unknown-root', value => { value.unknown = true; }, 'manifest: unknown key unknown'],
    ['unknown-weapon', value => { value.weapons[0].unknown = true; }, 'carbine: unknown key unknown'],
    ['unknown-damage', value => { value.weapons[0].damage.degrees = 1; }, 'carbine.damage: unknown key degrees'],
    ['unknown-spread', value => { value.weapons[0].spread.degrees = 1; }, 'carbine.spread: unknown key degrees'],
    ['unknown-recoil', value => { value.weapons[0].recoil.recoveryMs = 100; }, 'carbine.recoil: unknown key recoveryMs'],
    ['unknown-ammo', value => { value.weapons[0].ammo.reloadMs = 100; }, 'carbine.ammo: unknown key reloadMs'],
    ['unknown-penetration', value => { value.weapons[0].penetration.retentionPerSurface = 0.8; }, 'carbine.penetration: unknown key retentionPerSurface'],
    ['unknown-standard-optic', value => { value.weapons[0].optic.overlay = 'candidate'; }, 'carbine.optic: unknown key overlay'],
    ['unknown-special-optic', value => { value.weapons.find(item => item.id === 'railgun').optic.overlay = 'candidate'; }, 'railgun.optic: unknown key overlay'],
    ['unknown-policies', value => { value.weapons[0].policies.candidate = 'eligible'; }, 'carbine.policies: unknown key candidate'],
    ['unknown-coverage', value => { value.coverage[0].candidate = true; }, 'coverage.carbine: unknown key candidate'],
    ['missing-root', value => { delete value.schemaVersion; }, 'manifest: missing required key schemaVersion'],
    ['missing-weapon', value => { delete value.weapons[0].displayName; }, 'carbine: missing required key displayName'],
    ['missing-damage', value => { delete value.weapons[0].damage.base; }, 'carbine.damage: missing required key base'],
    ['missing-spread', value => { delete value.weapons[0].spread.hipRadians; }, 'carbine.spread: missing required key hipRadians'],
    ['missing-recoil', value => { delete value.weapons[0].recoil.recoveryPerSecond; }, 'carbine.recoil: missing required key recoveryPerSecond'],
    ['missing-ammo', value => { delete value.weapons[0].ammo.emptyReloadSeconds; }, 'carbine.ammo: missing required key emptyReloadSeconds'],
    ['missing-penetration', value => { delete value.weapons[0].penetration.calibreLabel; }, 'carbine.penetration: missing required key calibreLabel'],
    ['missing-standard-optic', value => { delete value.weapons[0].optic.solidOcclusion; }, 'carbine.optic: missing required key solidOcclusion'],
    ['missing-special-optic', value => { delete value.weapons.find(item => item.id === 'railgun').optic.authorityPolicyId; }, 'railgun.optic: missing required key authorityPolicyId'],
    ['missing-policies', value => { delete value.weapons[0].policies.stance; }, 'carbine.policies: missing required key stance'],
    ['missing-coverage', value => { delete value.coverage[0].evidenceSha256; }, 'coverage.carbine: missing required key evidenceSha256'],
    ['invalid-discriminant', value => { value.weapons[0].fireKind = 'laser'; }, 'carbine: invalid fireKind'],
    ['invalid-damage-policy', value => { value.weapons[0].damage.policy = 'candidate-defined'; }, 'carbine: invalid damage policy'],
    ['unsupported-optic-discriminant', value => { value.weapons[0].optic = { kind: 'xray', magnification: 4 }; }, 'carbine.optic: invalid optic discriminant xray'],
    ['unreviewed-thermal-identity', value => { value.weapons[0].optic = clone(thermal); }, 'carbine.optic: smoke-only thermal requires a reviewed DMR oracle identity'],
    ['duplicate-id', value => { value.weapons[1].id = value.weapons[0].id; }, 'manifest: weapon IDs must be unique'],
    ['duplicate-coverage-id', value => { value.coverage[1].weaponId = value.coverage[0].weaponId; }, 'coverage: weapon IDs must be unique'],
    ['candidate-redefines-completeness', value => { value.weapons.pop(); value.coverage.pop(); }, 'manifest weapon roster: missing pinned value railgun'],
    ['pellet-cap', value => { value.weapons.find(item => item.id === 'scattergun').pellets = 13; }, 'scattergun: pellets must be an integer from 1 through 12'],
    ['railgun-power-above-exact', value => { value.weapons.find(item => item.id === 'railgun').penetration.power = 100001; }, 'railgun: penetration power invalid'],
    ['railgun-surfaces-above-exact', value => { value.weapons.find(item => item.id === 'railgun').penetration.maximumSurfaces = 65; }, 'railgun: maximumSurfaces invalid'],
    ['degree-spread-field', value => { value.weapons[0].spread.hipSpreadDeg = 1; }, 'carbine.spread: unknown key hipSpreadDeg'],
    ['millisecond-recovery-field', value => { value.weapons[0].recoil.recoveryMs = 100; }, 'carbine.recoil: unknown key recoveryMs'],
    ['missing-explicit-stance-multiplier', value => { delete value.weapons[0].spread.standMultiplier; }, 'carbine.spread: missing required key standMultiplier'],
    ['missing-recoil-stance-multiplier', value => { delete value.weapons[0].recoil.proneMultiplier; }, 'carbine.recoil: missing required key proneMultiplier'],
    ['invalid-policy-enum', value => { value.weapons[0].policies.stance = 'candidate-defined'; }, 'carbine: stance policy invalid'],
    ['contradictory-empty-reload', value => { value.weapons[0].ammo.emptyReloadSeconds = value.weapons[0].ammo.reloadSeconds - 0.1; }, 'carbine: reload timings invalid'],
    ['contradictory-energy-falloff', value => { value.weapons[0].penetration.energyFalloffEndM = value.weapons[0].penetration.energyFalloffStartM; }, 'carbine: penetration energy falloff invalid'],
    ['broken-head-only', value => { value.weapons.find(item => item.id === 'magnum').damage.limbMultiplier = 1; }, 'magnum: head-only policy must encode the B1 binary head contract'],
    ['thermal-through-wall', value => { value.weapons[0].optic = { kind: 'thermal-smoke-only', magnification: 2.5, solidOcclusion: 'none', targetPolicy: 'all', authority: 'shot-authority' }; }, 'carbine.optic: thermal must remain solid-occluded'],
    ['projectile-contradiction', value => { value.weapons[0].projectileId = 'bolt-v1'; }, 'carbine: non-projectile fireKind must use null projectileId'],
    ['duplicate-model-set', value => { value.weapons[1].modelSetId = value.weapons[0].modelSetId; }, 'manifest: modelSetId values must be unique per release weapon'],
    ['duplicate-presentation', value => { value.weapons[1].presentationId = value.weapons[0].presentationId; }, 'manifest: presentationId values must be unique per release weapon'],
    ['duplicate-audio', value => { value.weapons[1].audioId = value.weapons[0].audioId; }, 'manifest: audioId values must be unique per release weapon'],
    ['duplicate-provenance', value => { value.weapons[1].provenanceId = value.weapons[0].provenanceId; }, 'manifest: provenanceId values must be unique per release weapon'],
    ['duplicate-recoil-pattern', value => { value.weapons[1].recoil.deterministicPatternId = value.weapons[0].recoil.deterministicPatternId; }, 'manifest: deterministic recoil pattern IDs must be unique per release weapon'],
    ['coverage-self-oracle', value => { value.coverage[0].channels = ['gameplay']; }, 'coverage.carbine.channels: missing pinned value protocol'],
  ];
  for (const [name, mutate, expected] of cases) {
    const candidate = clone(fixture);
    mutate(candidate);
    const failures = validateManifest(candidate);
    if (failures.length === 0) throw new Error(`mutation unexpectedly passed: ${name}`);
    if (!failures.includes(expected)) throw new Error(`mutation ${name} missed targeted failure: ${expected}; received: ${failures.join('; ')}`);
  }
  const thermalCases = [
    ['unknown-thermal-optic', { ...thermal, candidate: true }, 'dmr-schema-probe.optic: unknown key candidate'],
    ['missing-thermal-optic', (({ targetPolicy: _targetPolicy, ...value }) => value)(thermal), 'dmr-schema-probe.optic: missing required key targetPolicy'],
  ];
  for (const [name, optic, expected] of thermalCases) {
    const failures = [];
    validateOptic(optic, 'dmr-schema-probe', failures, true);
    if (!failures.includes(expected)) throw new Error(`mutation ${name} missed targeted failure: ${expected}; received: ${failures.join('; ')}`);
  }
  console.log(`PASS combat-registry self-test mutations=${cases.length + thermalCases.length} thermalUnion=valid cases=${[...cases, ...thermalCases].map(([name]) => name).join(',')}`);
}

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-combat-registry.mjs <combat-manifest.json> | --self-test');
  process.exit(2);
}
if (input === '--self-test') {
  try { runSelfTest(); } catch (error) { console.error(`FAIL combat-registry self-test ${error.message}`); process.exit(1); }
  process.exit(0);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL combat-registry unreadable-json ${error.message}`);
  process.exit(2);
}
const failures = validateManifest(manifest);
if (failures.length) {
  console.error(`FAIL combat-registry ${path.basename(input)} ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS combat-registry ${path.basename(input)} weapons=${manifest.weapons.length} coverage=${manifest.coverage.length}`);
