import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import validator from 'gltf-validator';

const root = process.cwd();
const manifest = JSON.parse(await readFile(
  path.join(root, 'source-assets/blender/pass65-weapon-production.manifest.json'),
  'utf8',
));
const failures = [];
const records = [];
const collect = (owner, entry) => {
  for (const field of ['firstPersonGlbs', 'worldGlbs', 'dropGlbs']) {
    for (const delivery of entry?.[field] ?? []) {
      if (typeof delivery.path === 'string') records.push({ owner, variant: delivery.variant ?? `lod${delivery.lod}`, path: delivery.path });
    }
  }
};

if (manifest.weapons?.length !== 20) failures.push(`weapon manifest must contain 20 entries, found ${manifest.weapons?.length ?? 0}`);
for (const weapon of manifest.weapons ?? []) {
  if (weapon.releaseState !== 'release-ready') failures.push(`${weapon.id}: GLB validation requires a release-ready entry`);
  collect(weapon.id, weapon);
}
if (manifest.meleeWeapons?.length !== 1 || manifest.meleeWeapons[0]?.releaseState !== 'release-ready') {
  failures.push('field-knife: GLB validation requires exactly one release-ready melee entry');
} else collect('field-knife', manifest.meleeWeapons[0]);
if (manifest.operatorArms?.releaseState !== 'release-ready') failures.push('operator arms: GLB validation requires a release-ready entry');
else collect('operator-arms', manifest.operatorArms);

const uniquePaths = new Set(records.map((record) => record.path));
if (uniquePaths.size !== records.length) failures.push(`GLB delivery paths must be unique (${uniquePaths.size}/${records.length})`);

let infos = 0;
for (const record of records) {
  try {
    const bytes = await readFile(path.join(root, record.path));
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: record.path,
      format: 'glb',
      writeTimestamp: false,
      maxIssues: 200,
    });
    infos += report.issues.numInfos ?? 0;
    if ((report.issues.numErrors ?? 0) > 0 || (report.issues.numWarnings ?? 0) > 0) {
      const blocking = (report.issues.messages ?? []).filter((message) => message.severity <= 1);
      failures.push(`${record.owner} ${record.variant}: Khronos validation found ${report.issues.numErrors} errors and ${report.issues.numWarnings} warnings: ${JSON.stringify(blocking)}`);
    }
  } catch (error) {
    failures.push(`${record.owner} ${record.variant}: Khronos validation failed to run: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Pass 65 weapon Khronos glTF gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  gate: 'pass65-weapon-khronos-gltf',
  status: 'passed',
  validatedGlbs: records.length,
  errors: 0,
  warnings: 0,
  informationalMessages: infos,
}, null, 2));
