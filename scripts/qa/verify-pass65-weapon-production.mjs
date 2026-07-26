import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { auditCrossbowGlb, auditOperatorArmsGlb, readGlb } from './pass65-crossbow-arms-glb.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'source-assets/blender/pass65-weapon-production.manifest.json');
const requiredWeaponIds = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'flashlight-pistol', 'explosive-crossbow',
]);
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const failures = [];
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (manifest.releaseGate !== 'fail-closed-until-every-entry-is-release-ready') failures.push('releaseGate must remain fail closed');
if (!Array.isArray(manifest.weapons)) failures.push('weapons must be an array');

const entries = Array.isArray(manifest.weapons) ? manifest.weapons : [];
const ids = entries.map((entry) => entry.id);
if (new Set(ids).size !== ids.length) failures.push('weapon IDs must be unique');
for (const required of requiredWeaponIds) if (!ids.includes(required)) failures.push(`missing weapon entry: ${required}`);
for (const id of ids) if (!requiredWeaponIds.includes(id)) failures.push(`unknown weapon entry: ${id}`);

const requiredPaths = ['sourceBlend', 'firstPersonGlbs', 'worldGlbs', 'pbrMaps', 'provenance'];
const readyAssetPaths = [];
const queueDeliverable = (id, deliverable) => {
  if (typeof deliverable?.path === 'string') readyAssetPaths.push({ id, ...deliverable });
};
for (const entry of entries) {
  if (entry.releaseState !== 'release-ready') {
    failures.push(`${entry.id}: ${entry.releaseState ?? 'missing-state'} - ${(entry.blockers ?? ['unspecified blocker']).join('; ')}`);
    continue;
  }
  for (const field of requiredPaths) if (entry[field] === undefined) failures.push(`${entry.id}: release-ready entry missing ${field}`);
  if ((entry.firstPersonGlbs ?? []).length < manifest.requirements.firstPersonLodCount) failures.push(`${entry.id}: insufficient first-person LODs`);
  if ((entry.worldGlbs ?? []).length < manifest.requirements.worldLodCount) failures.push(`${entry.id}: insufficient world LODs`);
  if (entry.id === 'explosive-crossbow' && (entry.dropGlbs ?? []).length < 1) failures.push(`${entry.id}: dedicated drop delivery missing`);
  for (const map of manifest.requiredPbrMaps) if (!entry.pbrMaps?.[map]) failures.push(`${entry.id}: missing ${map} PBR map`);
  for (const socket of manifest.requiredSockets) if (!entry.sockets?.includes(socket)) failures.push(`${entry.id}: missing ${socket} socket`);
  for (const action of manifest.requiredCoreActions) if (!entry.actions?.includes(action)) failures.push(`${entry.id}: missing ${action} action`);
  for (const deliverable of [entry.sourceBlend, entry.sourceScript, entry.provenance,
    ...(entry.firstPersonGlbs ?? []), ...(entry.worldGlbs ?? []), ...(entry.dropGlbs ?? []),
    ...Object.values(entry.pbrMaps ?? {})]) queueDeliverable(entry.id, deliverable);

  if (entry.id === 'explosive-crossbow') {
    const deliveries = [...(entry.firstPersonGlbs ?? []), ...(entry.worldGlbs ?? []), ...(entry.dropGlbs ?? [])];
    for (const deliverable of deliveries) {
      try {
        const absolute = path.join(root, deliverable.path);
        const { bytes, json } = await readGlb(absolute);
        const audit = auditCrossbowGlb(json, deliverable.variant, bytes.length);
        for (const failure of audit.failures) failures.push(failure);
        if (audit.triangles !== deliverable.triangles) failures.push(`${entry.id}: triangle receipt mismatch: ${deliverable.path}`);
      } catch (error) {
        failures.push(`${entry.id}: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fp = entry.firstPersonGlbs ?? [];
    const world = entry.worldGlbs ?? [];
    if (fp.length >= 2 && !(fp[0].triangles > fp[1].triangles)) failures.push(`${entry.id}: first-person LODs must decrease strictly`);
    if (world.length >= 3 && !(world[0].triangles > world[1].triangles && world[1].triangles > world[2].triangles)) {
      failures.push(`${entry.id}: world LODs must decrease strictly`);
    }
  }
}

if (manifest.operatorArms?.releaseState !== 'release-ready') {
  failures.push(`operator arms: ${manifest.operatorArms?.releaseState ?? 'missing-state'} - ${(manifest.operatorArms?.blockers ?? []).join('; ')}`);
} else {
  const arms = manifest.operatorArms;
  for (const field of ['sourceBlend', 'firstPersonGlbs', 'pbrMaps', 'provenance']) {
    if (arms[field] === undefined) failures.push(`operator arms: release-ready entry missing ${field}`);
  }
  if ((arms.firstPersonGlbs ?? []).length < manifest.requirements.firstPersonLodCount) failures.push('operator arms: insufficient first-person LODs');
  for (const map of manifest.requiredPbrMaps) if (!arms.pbrMaps?.[map]) failures.push(`operator arms: missing ${map} PBR map`);
  for (const bone of ['UpperArmR', 'LowerArmR', 'WristR', 'UpperArmL', 'LowerArmL', 'WristL']) {
    if (!arms.bones?.includes(bone)) failures.push(`operator arms: missing ${bone} bone`);
  }
  for (const action of manifest.requiredCoreActions) if (!arms.actions?.includes(action)) failures.push(`operator arms: missing ${action} action`);
  for (const deliverable of [arms.sourceBlend, arms.sourceScript, arms.provenance,
    ...(arms.firstPersonGlbs ?? []), ...Object.values(arms.pbrMaps ?? {})]) queueDeliverable('operator arms', deliverable);
  for (const deliverable of arms.firstPersonGlbs ?? []) {
    try {
      const absolute = path.join(root, deliverable.path);
      const { bytes, json } = await readGlb(absolute);
      const audit = auditOperatorArmsGlb(json, deliverable.lod, bytes.length);
      for (const failure of audit.failures) failures.push(failure);
      if (audit.triangles !== deliverable.triangles) failures.push(`operator arms: triangle receipt mismatch: ${deliverable.path}`);
    } catch (error) {
      failures.push(`operator arms: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const lods = arms.firstPersonGlbs ?? [];
  if (lods.length >= 2 && !(lods[0].triangles > lods[1].triangles)) failures.push('operator arms: LODs must decrease strictly');
}
for (const vehicle of manifest.supportVehicles ?? []) {
  if (vehicle.releaseState !== 'release-ready') {
    failures.push(`${vehicle.id}: ${vehicle.releaseState ?? 'missing-state'} - ${(vehicle.blockers ?? ['unspecified blocker']).join('; ')}`);
  }
}

for (const deliverable of readyAssetPaths) {
  const absolute = path.join(root, deliverable.path);
  try {
    if (!(await stat(absolute)).isFile()) failures.push(`${deliverable.id}: not a file: ${deliverable.path}`);
    if (!/^[a-f0-9]{64}$/.test(deliverable.sha256 ?? '')) failures.push(`${deliverable.id}: missing sha256: ${deliverable.path}`);
    else if (await sha256(absolute) !== deliverable.sha256) failures.push(`${deliverable.id}: digest mismatch: ${deliverable.path}`);
  } catch {
    failures.push(`${deliverable.id}: missing deliverable: ${deliverable.path}`);
  }
}

if (failures.length > 0) {
  console.error(`Pass 65 weapon/arms production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Pass 65 weapon/arms production gate passed: ${entries.length} distinct weapons plus authored operator arms are release-ready.`);
