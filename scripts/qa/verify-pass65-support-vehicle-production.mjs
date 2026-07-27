import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditSupportVehicleGlb, pngDimensions, readGlb, SUPPORT_VEHICLE_SPECS } from './pass65-support-vehicle-glb.mjs';

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
    if (digest(bytes) !== record.sha256) failures.push(`${label}: digest mismatch`);
    return bytes;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const productionManifest = JSON.parse(await readFile(resolveRepoPath('source-assets/blender/pass65-weapon-production.manifest.json'), 'utf8'));
const chopperEntry = productionManifest.supportVehicles?.find((candidate) => candidate.id === 'chopper-gunner-vehicle-v1');
const aircraftEntry = productionManifest.supportVehicles?.find((candidate) => candidate.id === 'support-aircraft-family-v1');
if (!chopperEntry || !aircraftEntry) throw new Error('Pass 65 support vehicle production entries are missing');

for (const [label, entry] of [['chopper', chopperEntry], ['aircraft', aircraftEntry]]) {
  if (entry.releaseState !== 'release-ready') failures.push(`${label}: releaseState is ${entry.releaseState ?? '<missing>'}`);
  if (entry.placeholderStatus !== 'forbidden-and-not-present') failures.push(`${label}: placeholder policy is not fail closed`);
  if (entry.sourceKind !== 'project-original-blender') failures.push(`${label}: source kind is not project-original Blender`);
  if (entry.runtimeForwardAxis !== '-Z') failures.push(`${label}: runtime forward axis is not -Z`);
  await verifyRecord(entry.sourceScript, `${label} source script`);
}

const chopperBlend = await verifyRecord(chopperEntry.sourceBlend, 'chopper source blend');
const aircraftBlend = await verifyRecord(aircraftEntry.sourceBlend, 'aircraft source blend');
if (chopperBlend && chopperBlend.length < 1_000_000) failures.push('chopper source blend is not a substantial editable source');
if (aircraftBlend && aircraftBlend.length < 700_000) failures.push('aircraft source blend is not a substantial editable source');
const menuPreviewProvenance = JSON.parse(await readFile(
  resolveRepoPath('source-assets/menu/pass65-preview-masters/provenance.json'),
  'utf8',
));
if (menuPreviewProvenance.authoredCockpit?.assetId !== chopperEntry.id
  || menuPreviewProvenance.authoredCockpit?.sha256 !== chopperEntry.sourceBlend.sha256
  || menuPreviewProvenance.authoredCockpit?.qualityTier !== 'LOD0') {
  failures.push('prerecorded menu previews are stale against the release-ready authored chopper cockpit');
}
if (JSON.stringify(menuPreviewProvenance.sources?.map((source) => source.arenaId).sort())
  !== JSON.stringify(['atomic-acres', 'gun-range', 'rustworks-1v1', 'skyline-terminal'])) {
  failures.push('prerecorded menu preview provenance must cover exactly the three helicopter maps and protected Gun Range cat map');
}

const blender = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!blender) failures.push('Blender 5.1 executable unavailable for editable-source validation');
else {
  const blendAudits = [
    [chopperEntry.sourceBlend.path,
      "import bpy; roots=[o for o in bpy.data.objects if o.get('asset_id')=='chopper-gunner-vehicle-v1']; assert len(roots)==3; assert all(any(c.get('canonical_node_name')=='chopper-first-person-cockpit' for c in r.children_recursive) for r in roots); assert len(bpy.data.actions)>=27; assert len([i for i in bpy.data.images if i.packed_file])>=4"],
    [aircraftEntry.sourceBlend.path,
      "import bpy; roots=[o for o in bpy.data.objects if o.get('asset_id')=='support-aircraft-family-v1']; assert len(roots)==8; assert len([o for o in roots if o.get('presentation_variant')=='care'])==3; assert len([o for o in roots if o.get('presentation_variant')=='carpet'])==3; assert len([o for o in roots if o.get('presentation_variant')=='parachute-crate'])==2; assert len(bpy.data.actions)>=32; assert len([i for i in bpy.data.images if i.packed_file])>=4"],
  ];
  for (const [relative, expression] of blendAudits) {
    const audit = spawnSync(blender, [resolveRepoPath(relative), '--background', '--python-expr', expression], { cwd: root, encoding: 'utf8' });
    if (audit.status !== 0) failures.push(`${relative}: editable Blender source audit failed\n${audit.stdout}${audit.stderr}`);
  }
}

const gltfValidator = resolveRepoPath('node_modules/@gltf-transform/cli/bin/cli.js');
async function verifyLodFamily(family, records, expectedCount) {
  if (!Array.isArray(records) || records.length !== expectedCount) {
    failures.push(`${family}: exactly ${expectedCount} LOD records are required`);
    return [];
  }
  const audits = [];
  for (const [lod, record] of records.entries()) {
    if (record.lod !== lod) failures.push(`${family} LOD${lod}: manifest lod field drift`);
    const bytes = await verifyRecord(record, `${family} LOD${lod}`);
    if (!bytes) continue;
    try {
      const glb = await readGlb(resolveRepoPath(record.path));
      const audit = auditSupportVehicleGlb(glb.json, glb.bytes.length, family, lod);
      failures.push(...audit.failures);
      if (record.triangles !== audit.triangles || record.bytes !== audit.bytes) failures.push(`${family} LOD${lod}: manifest technical audit drift`);
      audits.push(audit);
      const validation = spawnSync(process.execPath, [
        gltfValidator, 'validate', resolveRepoPath(record.path), '--format', 'csv',
        '--ignore', 'UNUSED_OBJECT,UNUSED_MESH_TANGENT',
      ], { cwd: root, encoding: 'utf8' });
      if (validation.status !== 0) failures.push(`${family} LOD${lod}: official glTF validation failed\n${validation.stdout}${validation.stderr}`);
    } catch (error) {
      failures.push(`${family} LOD${lod}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (audits.length === expectedCount && !audits.slice(1).every((audit, index) => audits[index].triangles > audit.triangles)) {
    failures.push(`${family}: LOD triangle counts do not decrease strictly`);
  }
  if (new Set(records.map((record) => record.sha256)).size !== expectedCount) failures.push(`${family}: LOD deliverables are not unique`);
  return audits;
}

const chopperAudits = await verifyLodFamily('chopper', chopperEntry.worldGlbs, 3);
const careAudits = await verifyLodFamily('care', aircraftEntry.variants?.care?.worldGlbs, 3);
const carpetAudits = await verifyLodFamily('carpet', aircraftEntry.variants?.carpet?.worldGlbs, 3);
const crateAudits = await verifyLodFamily('crate', aircraftEntry.variants?.parachuteCrate?.worldGlbs, 2);
if (JSON.stringify(chopperEntry.firstPersonGlb) !== JSON.stringify(chopperEntry.worldGlbs?.[0])) failures.push('chopper first-person GLB must be exact LOD0');

for (const [family, entry, spec] of [
  ['chopper', chopperEntry, SUPPORT_VEHICLE_SPECS.chopper],
  ['care', aircraftEntry.variants?.care, SUPPORT_VEHICLE_SPECS.care],
  ['carpet', aircraftEntry.variants?.carpet, SUPPORT_VEHICLE_SPECS.carpet],
  ['crate', aircraftEntry.variants?.parachuteCrate, SUPPORT_VEHICLE_SPECS.crate],
]) {
  const nodes = entry.semanticNodes ?? entry.requiredNodes;
  const actions = entry.actions ?? entry.animationClips;
  for (const name of spec.nodes) if (!nodes?.includes(name)) failures.push(`${family}: manifest missing semantic node ${name}`);
  for (const name of spec.actions) if (!actions?.includes(name)) failures.push(`${family}: manifest missing action ${name}`);
  for (const name of spec.sockets) if (!entry.sockets?.includes(name)) failures.push(`${family}: manifest missing socket ${name}`);
}

async function verifyPbrMaps(label, maps) {
  for (const key of ['baseColor', 'normal', 'orm', 'emissive']) {
    const record = maps?.[key];
    const bytes = await verifyRecord(record, `${label} PBR ${key}`);
    if (!bytes) continue;
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== 512 || dimensions.height !== 512 || record.width !== 512 || record.height !== 512) {
      failures.push(`${label} PBR ${key}: dimensions must remain 512x512`);
    }
  }
}
await verifyPbrMaps('chopper', chopperEntry.pbrMaps);
await verifyPbrMaps('aircraft', aircraftEntry.pbrMaps);

async function verifyReview(label, review, expectedRenderCount, requiresAcceptedFrame = false) {
  if (!Array.isArray(review?.renders) || review.renders.length !== expectedRenderCount) failures.push(`${label}: review render set is incomplete`);
  for (const [index, record] of (review?.renders ?? []).entries()) {
    const bytes = await verifyRecord(record, `${label} review ${index}`);
    if (!bytes) continue;
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== record.width || dimensions.height !== record.height || bytes.length < 100_000) failures.push(`${label} review ${index}: invalid or trivial evidence`);
  }
  const sheetBytes = await verifyRecord(review?.contactSheet, `${label} contact sheet`);
  if (sheetBytes) {
    const dimensions = pngDimensions(sheetBytes);
    if (dimensions.width !== 1024 || dimensions.height !== 1024 || sheetBytes.length < 300_000) failures.push(`${label}: contact sheet is invalid or trivial`);
  }
  if (requiresAcceptedFrame) {
    if (review.acceptedFirstPersonFrame?.cameraId !== 'accepted-first-person-instruments'
      || review.acceptedFirstPersonFrame?.width !== 960 || review.acceptedFirstPersonFrame?.height !== 540
      || !review.renders.some((record) => record.sha256 === review.acceptedFirstPersonFrame.sha256)) {
      failures.push('chopper: accepted 960x540 first-person frame is not pinned inside the review set');
    }
  }
}
await verifyReview('chopper', chopperEntry.review, 4, true);
await verifyReview('aircraft', aircraftEntry.review, 4);

const chopperProvenanceBytes = await verifyRecord(chopperEntry.provenance, 'chopper provenance');
const aircraftProvenanceBytes = await verifyRecord(aircraftEntry.provenance, 'aircraft provenance');
if (chopperProvenanceBytes) {
  const provenance = JSON.parse(chopperProvenanceBytes.toString('utf8'));
  if (provenance.id !== chopperEntry.id || provenance.runtimeForwardAxis !== '-Z') failures.push('chopper provenance identity/axis mismatch');
  if (provenance.license !== 'Project-original; no third-party meshes or textures') failures.push('chopper provenance license boundary missing');
  if (JSON.stringify(provenance.worldGlbs) !== JSON.stringify(chopperEntry.worldGlbs)) failures.push('chopper provenance GLBs drift from production manifest');
  if (JSON.stringify(provenance.pbrMaps) !== JSON.stringify(chopperEntry.pbrMaps)) failures.push('chopper provenance PBR records drift');
  if (provenance.review?.acceptedFirstPersonFrame?.sha256 !== chopperEntry.review?.acceptedFirstPersonFrame?.sha256) failures.push('accepted cockpit provenance drift');
  if (provenance.reproducibility?.contract !== 'semantic-and-decoded-visual'
    || provenance.reproducibility?.exactCandidateHashesPinned !== true
    || provenance.reproducibility?.byteIdentityAcrossBlenderExports !== false) {
    failures.push('chopper reproducibility boundary is missing or overclaims Blender byte identity');
  }
}
if (aircraftProvenanceBytes) {
  const provenance = JSON.parse(aircraftProvenanceBytes.toString('utf8'));
  if (provenance.id !== aircraftEntry.id || provenance.runtimeForwardAxis !== '-Z') failures.push('aircraft provenance identity/axis mismatch');
  if (provenance.license !== 'Project-original; no third-party meshes or textures') failures.push('aircraft provenance license boundary missing');
  if (JSON.stringify(provenance.variants) !== JSON.stringify(aircraftEntry.variants)) failures.push('aircraft provenance variants drift from production manifest');
  if (JSON.stringify(provenance.pbrMaps) !== JSON.stringify(aircraftEntry.pbrMaps)) failures.push('aircraft provenance PBR records drift');
  if (provenance.reproducibility?.contract !== 'semantic-and-decoded-visual'
    || provenance.reproducibility?.exactCandidateHashesPinned !== true
    || provenance.reproducibility?.byteIdentityAcrossBlenderExports !== false) {
    failures.push('aircraft reproducibility boundary is missing or overclaims Blender byte identity');
  }
}

const assetManifest = JSON.parse(await readFile(resolveRepoPath('assets.manifest.json'), 'utf8'));
for (const [id, entry] of [
  ['atomic-acres-pass65-chopper-gunner-2026-07-26', chopperEntry],
  ['atomic-acres-pass65-support-aircraft-family-2026-07-26', aircraftEntry],
]) {
  const publicRecord = assetManifest.assets?.find((candidate) => candidate.id === id);
  if (!publicRecord) failures.push(`${id}: public asset provenance entry missing`);
  else {
    if (publicRecord.sourceBlendSha256 !== entry.sourceBlend?.sha256) failures.push(`${id}: public source blend digest drift`);
    if (publicRecord.sourceScriptSha256 !== entry.sourceScript?.sha256) failures.push(`${id}: public source script digest drift`);
    if (publicRecord.sourceProvenanceSha256 !== entry.provenance?.sha256) failures.push(`${id}: public provenance digest drift`);
    for (const record of publicRecord.files ?? []) await verifyRecord(record, `${id} public file ${record.path ?? '<missing>'}`);
  }
}

const presentationSource = await readFile(resolveRepoPath('src/killstreak-presentation.ts'), 'utf8');
const mainSource = await readFile(resolveRepoPath('src/legacy-main.ts'), 'utf8');
const expectedRuntimeAssets = [
  ...chopperEntry.worldGlbs,
  ...aircraftEntry.variants.care.worldGlbs,
  ...aircraftEntry.variants.carpet.worldGlbs,
  ...aircraftEntry.variants.parachuteCrate.worldGlbs,
].map((record) => `./${record.path.replace(/^public\//u, '')}`).sort();
const runtimeAssetMatches = [...presentationSource.matchAll(/['"](\.\/assets\/original\/models\/support\/pass65-(?:chopper-gunner|care-aircraft|carpet-aircraft|care-crate)-lod\d+\.glb)['"]/gu)]
  .map((match) => match[1]).sort();
if (JSON.stringify(runtimeAssetMatches) !== JSON.stringify(expectedRuntimeAssets)) failures.push('runtime authored support asset source set is not exact');
for (const token of [
  'if (supportVehicleLoadPromise) return supportVehicleLoadPromise',
  'Promise.allSettled',
  'SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES = 2',
  "presentationSource = 'project-original-blender-glb'",
  "presentationSource = 'procedural-non-release-fallback'",
  'prewarmAuthoredAssets()',
  'prewarmedAuthoredSupportFamilies',
]) if (!presentationSource.includes(token)) failures.push(`runtime lazy-cache/prewarm boundary missing: ${token}`);
if (!mainSource.includes('loadSupportVehiclePresentations(),')
  || !mainSource.includes('killstreakPresentation.prewarmAuthoredAssets();')
  || !mainSource.includes('supportVehiclePresentation: supportVehiclePresentationTelemetry(),')) {
  failures.push('bootstrap does not load the authored cache and refresh prewarmed support vocabulary');
}

if (failures.length > 0) {
  console.error(`Pass 65 support vehicle production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  gate: 'pass65-support-vehicle-production', releaseState: 'release-ready', runtimeAssetCount: expectedRuntimeAssets.length,
  sourceBlendBytes: {
    chopper: (await stat(resolveRepoPath(chopperEntry.sourceBlend.path))).size,
    aircraft: (await stat(resolveRepoPath(aircraftEntry.sourceBlend.path))).size,
  },
  lods: { chopper: chopperAudits, care: careAudits, carpet: carpetAudits, crate: crateAudits }
    && {
      chopper: chopperAudits.map((audit) => audit.triangles), care: careAudits.map((audit) => audit.triangles),
      carpet: carpetAudits.map((audit) => audit.triangles), crate: crateAudits.map((audit) => audit.triangles),
    },
  acceptedCockpit: chopperEntry.review.acceptedFirstPersonFrame,
}, null, 2));
