import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditDroneGlb, pngDimensions, readGlb, REQUIRED_DRONE_ANIMATIONS, REQUIRED_DRONE_NODES } from './hunter-drone-glb.mjs';

const root = process.cwd();
const failures = [];
const resolveRepoPath = (relative) => {
  const absolute = path.resolve(root, relative);
  if (path.relative(root, absolute).startsWith('..')) throw new Error(`${relative}: escapes repository root`);
  return absolute;
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const verifyRecord = async (record, label) => {
  if (!record || typeof record.path !== 'string' || !/^[a-f0-9]{64}$/u.test(record.sha256 ?? '')) {
    failures.push(`${label}: invalid path/hash record`);
    return null;
  }
  try {
    const bytes = await readFile(resolveRepoPath(record.path));
    const actual = digest(bytes);
    if (actual !== record.sha256) failures.push(`${label}: digest mismatch`);
    return bytes;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const productionManifest = JSON.parse(await readFile(resolveRepoPath('source-assets/blender/pass65-weapon-production.manifest.json'), 'utf8'));
const entry = productionManifest.supportVehicles?.find((candidate) => candidate.id === 'hunter-drone-visual-family-v1');
if (!entry) throw new Error('Hunter drone production entry missing');
if (entry.releaseState !== 'release-ready') failures.push(`manifest releaseState is ${entry.releaseState ?? '<missing>'}`);
if (entry.placeholderStatus !== 'forbidden-and-not-present') failures.push('placeholder policy is not fail closed');
if (entry.runtimeForwardAxis !== '-Z') failures.push('manifest runtime forward axis is not -Z');
if (entry.worldGlbs?.length !== 3) failures.push('exactly three world GLB LODs are required');
for (const name of REQUIRED_DRONE_NODES) if (!entry.semanticNodes?.includes(name)) failures.push(`manifest missing semantic node ${name}`);
for (const name of REQUIRED_DRONE_ANIMATIONS) if (!entry.actions?.includes(name)) failures.push(`manifest missing action ${name}`);

const blendBytes = await verifyRecord(entry.sourceBlend, 'source blend');
if (blendBytes && blendBytes.length < 500_000) {
  failures.push('source blend is not a substantial editable Blender file');
}
const blender = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!blender) failures.push('Blender 5.1 executable unavailable for editable-source validation');
else {
  const blendAudit = spawnSync(blender, [
    resolveRepoPath(entry.sourceBlend.path), '--background', '--python-expr',
    "import bpy; assert len([o for o in bpy.data.objects if o.get('asset_id') == 'hunter-drone-visual-family-v1']) == 3; assert len(bpy.data.actions) >= 18; assert len([i for i in bpy.data.images if i.name.startswith('Hunter_Drone_')]) >= 4",
  ], { cwd: root, encoding: 'utf8' });
  if (blendAudit.status !== 0) failures.push(`editable Blender source audit failed\n${blendAudit.stdout}${blendAudit.stderr}`);
}

const lodAudits = [];
for (const [index, record] of (entry.worldGlbs ?? []).entries()) {
  if (record.lod !== index) failures.push(`LOD record ${index} has wrong lod field`);
  const bytes = await verifyRecord(record, `LOD${index}`);
  if (!bytes) continue;
  try {
    const glb = await readGlb(resolveRepoPath(record.path));
    const audit = auditDroneGlb(glb.json, index, glb.bytes.length);
    failures.push(...audit.failures);
    if (record.triangles !== audit.triangles || record.bytes !== audit.bytes) failures.push(`LOD${index}: manifest audit drift`);
    lodAudits.push(audit);
    const validation = spawnSync(process.execPath, [
      resolveRepoPath('node_modules/@gltf-transform/cli/bin/cli.js'),
      'validate', resolveRepoPath(record.path), '--format', 'csv',
      '--ignore', 'UNUSED_OBJECT,UNUSED_MESH_TANGENT',
    ], { cwd: root, encoding: 'utf8' });
    if (validation.status !== 0) failures.push(`LOD${index}: official glTF validation failed\n${validation.stdout}${validation.stderr}`);
  } catch (error) {
    failures.push(`LOD${index}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (lodAudits.length === 3 && !(lodAudits[0].triangles > lodAudits[1].triangles && lodAudits[1].triangles > lodAudits[2].triangles)) {
  failures.push('LOD triangle counts do not decrease strictly');
}
if (new Set((entry.worldGlbs ?? []).map((record) => record.sha256)).size !== 3) failures.push('LOD deliverables are not unique');

for (const [key, record] of Object.entries(entry.pbrMaps ?? {})) {
  const bytes = await verifyRecord(record, `PBR ${key}`);
  if (!bytes) continue;
  try {
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== 512 || dimensions.height !== 512) failures.push(`PBR ${key}: must be 512x512`);
    if (record.width !== 512 || record.height !== 512) failures.push(`PBR ${key}: manifest dimensions drift`);
  } catch (error) {
    failures.push(`PBR ${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const key of ['baseColor', 'normal', 'orm', 'emissive']) if (!entry.pbrMaps?.[key]) failures.push(`PBR ${key}: missing`);

for (const [index, record] of (entry.review?.renders ?? []).entries()) {
  const bytes = await verifyRecord(record, `review render ${index}`);
  if (!bytes) continue;
  const dimensions = pngDimensions(bytes);
  if (dimensions.width !== 512 || dimensions.height !== 512 || bytes.length < 50_000) failures.push(`review render ${index}: invalid or trivial evidence`);
}
const sheetBytes = await verifyRecord(entry.review?.contactSheet, 'contact sheet');
if (sheetBytes) {
  const dimensions = pngDimensions(sheetBytes);
  if (dimensions.width !== 1024 || dimensions.height !== 1024 || sheetBytes.length < 150_000) failures.push('contact sheet is invalid or trivial');
}

const provenanceBytes = await verifyRecord(entry.provenance, 'provenance');
if (provenanceBytes) {
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  if (provenance.id !== entry.id || provenance.runtimeForwardAxis !== '-Z') failures.push('provenance identity/axis mismatch');
  if (provenance.license !== 'Project-original; no third-party meshes or textures') failures.push('provenance license boundary missing');
  if (JSON.stringify(provenance.worldGlbs) !== JSON.stringify(entry.worldGlbs)) failures.push('provenance GLB records drift from production manifest');
  if (JSON.stringify(provenance.pbrMaps) !== JSON.stringify(entry.pbrMaps)) failures.push('provenance texture records drift from production manifest');
}

const assetManifest = JSON.parse(await readFile(resolveRepoPath('assets.manifest.json'), 'utf8'));
const publicRecord = assetManifest.assets?.find((candidate) => candidate.id === 'atomic-acres-hunter-drone-family-2026-07-26');
if (!publicRecord) failures.push('public asset provenance entry missing');
else {
  if (publicRecord.sourceBlendSha256 !== entry.sourceBlend?.sha256) failures.push('public source blend digest drift');
  if (publicRecord.sourceProvenanceSha256 !== entry.provenance?.sha256) failures.push('public provenance digest drift');
  if (publicRecord.files !== 'public/assets/original/**/hunter-drone-*') failures.push('public asset coverage pattern drift');
}

if (failures.length > 0) {
  console.error(`Pass 65 Hunter Drone production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  gate: 'pass65-hunter-drone-production',
  releaseState: 'release-ready',
  sourceBlendBytes: (await stat(resolveRepoPath(entry.sourceBlend.path))).size,
  lods: lodAudits.map((audit, lod) => ({ lod, triangles: audit.triangles, bytes: audit.bytes, animations: audit.animations })),
  pbrMaps: Object.keys(entry.pbrMaps),
  sockets: entry.sockets,
  contactSheet: entry.review.contactSheet.path,
}, null, 2));
