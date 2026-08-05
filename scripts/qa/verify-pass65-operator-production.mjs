import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  auditOperatorGlb,
  OPERATOR_ASSET_ID,
  operatorMutationSelfTest,
  pngDimensions,
  readGlb,
  REQUIRED_OPERATOR_ACTIONS,
  REQUIRED_OPERATOR_MATERIALS,
  validateOperatorLodFamily,
} from './pass65-operator-glb.mjs';

const root = process.cwd();
const failures = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const resolveRepoPath = (relative) => {
  const absolute = path.resolve(root, relative);
  if (path.relative(root, absolute).startsWith('..')) throw new Error(`${relative}: escapes repository root`);
  return absolute;
};
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

const manifestPath = 'source-assets/blender/pass65-third-person-operator.manifest.json';
const manifestBytes = await readFile(resolveRepoPath(manifestPath));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.id !== OPERATOR_ASSET_ID) failures.push('production manifest identity mismatch');
if (manifest.releaseState !== 'release-ready') failures.push(`manifest releaseState is ${manifest.releaseState ?? '<missing>'}`);
if (manifest.sourceKind !== 'license-vetted-cc0-blender-derivative') failures.push('licence-vetted source kind missing');
if (manifest.placeholderStatus !== 'primitive-and-unrigged-fallbacks-forbidden-and-not-present') {
  failures.push('primitive/unrigged fallback policy is not fail closed');
}
if (manifest.materialContract !== 'opaque-embedded-pbr-depth-writing') failures.push('opaque PBR manifest contract missing');
if (manifest.worldGlbs?.length !== 3) failures.push('exactly three third-person operator LODs are required');
if (JSON.stringify(manifest.requiredMaterials) !== JSON.stringify(REQUIRED_OPERATOR_MATERIALS)) failures.push('material roster drift');
for (const action of REQUIRED_OPERATOR_ACTIONS) if (!manifest.requiredActions?.includes(action)) failures.push(`manifest action ${action} missing`);
for (const consumer of ['human-players', 'remote-players', 'bots', 'reinforcements', 'corpses']) {
  if (!manifest.canonicalConsumers?.includes(consumer)) failures.push(`canonical consumer ${consumer} missing`);
}

const sourceBlendBytes = await verifyRecord(manifest.sourceBlend, 'source blend');
if (sourceBlendBytes && sourceBlendBytes.length < 500_000) failures.push('source blend is not a substantial editable Blender asset');
for (const [name, record] of Object.entries(manifest.sourceRecords ?? {})) await verifyRecord(record, `source ${name}`);

const blender = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!blender) failures.push('Blender 5.1 executable unavailable for editable-source validation');
else if (manifest.sourceBlend?.path) {
  const blendExpression = [
    "import bpy",
    `roots=[o for o in bpy.data.objects if o.get('asset_id')=='${OPERATOR_ASSET_ID}']`,
    "assert len([o for o in roots if o.type=='ARMATURE'])==1",
    "assert len([o for o in roots if o.type=='MESH'])==4",
    "assert bpy.data.objects.get('Pistol') is None",
    "assert len(bpy.data.actions)>=24",
    "assert len([m for m in bpy.data.materials if m.get('opaque_depth_writing') is True])==4",
    "assert len([i for i in bpy.data.images if i.name.startswith('Pass65_ThirdPersonOperator_')])>=16",
  ].join(';');
  const blendAudit = spawnSync(blender, [
    resolveRepoPath(manifest.sourceBlend.path), '--background', '--python-expr', blendExpression,
  ], { cwd: root, encoding: 'utf8' });
  if (blendAudit.status !== 0) failures.push(`editable Blender source audit failed\n${blendAudit.stdout}${blendAudit.stderr}`);
}

const gltfCli = process.env.ATOMIC_ACRES_GLTF_TRANSFORM_CLI
  ?? resolveRepoPath('node_modules/@gltf-transform/cli/bin/cli.js');
if (!existsSync(gltfCli)) failures.push(`official glTF validator unavailable at ${gltfCli}`);

const lodAudits = [];
let mutationSource = null;
for (const [index, record] of (manifest.worldGlbs ?? []).entries()) {
  if (record.lod !== index) failures.push(`LOD record ${index} has wrong lod field`);
  const bytes = await verifyRecord(record, `LOD${index}`);
  if (!bytes) continue;
  try {
    const glb = await readGlb(resolveRepoPath(record.path));
    const audit = auditOperatorGlb(glb.json, index, glb.bytes);
    failures.push(...audit.failures);
    if (record.triangles !== audit.triangles || record.bytes !== audit.bytes
      || record.skinnedMeshNodes !== audit.skinnedMeshNodes || record.joints !== audit.joints) {
      failures.push(`LOD${index}: manifest technical audit drift`);
    }
    lodAudits.push(audit);
    if (index === 0) mutationSource = glb;
    if (existsSync(gltfCli)) {
      const validation = spawnSync(process.execPath, [
        gltfCli, 'validate', resolveRepoPath(record.path), '--format', 'csv',
        '--ignore', 'UNUSED_OBJECT,UNUSED_MESH_TANGENT,ACCESSOR_JOINTS_USED_ZERO_WEIGHT',
      ], { cwd: root, encoding: 'utf8' });
      if (validation.status !== 0) failures.push(`LOD${index}: official glTF validation failed\n${validation.stdout}${validation.stderr}`);
    }
  } catch (error) {
    failures.push(`LOD${index}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
failures.push(...validateOperatorLodFamily(manifest.worldGlbs ?? [], lodAudits));

if (mutationSource) {
  const mutationFailures = operatorMutationSelfTest(mutationSource.json, mutationSource.bytes);
  failures.push(...mutationFailures.map((failure) => `mutation self-test: ${failure}`));
} else failures.push('mutation self-test has no LOD0 source');

const textureHashes = [];
for (const material of REQUIRED_OPERATOR_MATERIALS) {
  const set = manifest.pbrMaps?.[material];
  for (const kind of ['baseColor', 'normal', 'roughness', 'metallic']) {
    const record = set?.[kind];
    const bytes = await verifyRecord(record, `${material} ${kind}`);
    if (!bytes) continue;
    textureHashes.push(record.sha256);
    try {
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== 512 || dimensions.height !== 512
        || record.width !== 512 || record.height !== 512) failures.push(`${material} ${kind}: must be 512x512`);
    } catch (error) {
      failures.push(`${material} ${kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
if (textureHashes.length !== 16 || new Set(textureHashes).size !== 16) failures.push('source PBR maps must be sixteen distinct files');

for (const [index, record] of (manifest.review?.renders ?? []).entries()) {
  const bytes = await verifyRecord(record, `review render ${index}`);
  if (!bytes) continue;
  const dimensions = pngDimensions(bytes);
  if (dimensions.width !== 640 || dimensions.height !== 640 || bytes.length < 60_000) {
    failures.push(`review render ${index}: invalid or trivial evidence`);
  }
}
const sheetBytes = await verifyRecord(manifest.review?.contactSheet, 'contact sheet');
if (sheetBytes) {
  const dimensions = pngDimensions(sheetBytes);
  if (dimensions.width !== 1280 || dimensions.height !== 1280 || sheetBytes.length < 220_000) {
    failures.push('contact sheet is invalid or trivial');
  }
}

const provenanceBytes = await verifyRecord(manifest.provenance, 'provenance');
if (provenanceBytes) {
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  if (provenance.id !== manifest.id || provenance.license !== 'CC0 1.0 Universal / Public Domain Dedication') {
    failures.push('provenance identity/licence mismatch');
  }
  if (JSON.stringify(provenance.worldGlbs) !== JSON.stringify(manifest.worldGlbs)) failures.push('provenance GLB records drift');
  if (JSON.stringify(provenance.pbrMaps) !== JSON.stringify(manifest.pbrMaps)) failures.push('provenance PBR records drift');
  if (!/presentation-only/u.test(provenance.authorityBoundary ?? '')) failures.push('presentation/authority boundary missing');
}

const assetManifest = JSON.parse(await readFile(resolveRepoPath('assets.manifest.json'), 'utf8'));
const publicRecord = assetManifest.assets?.find((candidate) => candidate.id === 'atomic-acres-pass65-third-person-operator-family-2026-07-27');
if (!publicRecord) failures.push('public asset provenance entry missing');
else {
  if (publicRecord.sourceBlendSha256 !== manifest.sourceBlend?.sha256) failures.push('public source blend digest drift');
  if (publicRecord.sourceScriptSha256 !== manifest.sourceScript?.sha256) failures.push('public source script digest drift');
  if (publicRecord.sourceProvenanceSha256 !== manifest.provenance?.sha256) failures.push('public provenance digest drift');
  if (publicRecord.productionManifestSha256 !== digest(manifestBytes)) failures.push('public production manifest digest drift');
  if (publicRecord.files !== 'public/assets/original/**/pass65-third-person-operator-*') failures.push('public asset coverage pattern drift');
}

const operatorSource = await readFile(resolveRepoPath('src/operator-model.ts'), 'utf8');
for (const expected of [
  "pass65-third-person-operator-lod0.glb",
  "pass65-third-person-operator-lod1.glb",
]) if (!operatorSource.includes(expected)) failures.push(`runtime wiring missing ${expected}`);
if (operatorSource.includes("const OPERATOR_URL = './assets/third-party/quaternius/ultimate-modular-males/Swat.gltf'")) {
  failures.push('runtime still loads the untextured source glTF directly');
}
if (operatorSource.includes('flattenOperatorMaterialGroups(') || operatorSource.includes('mergeFlattenedOperatorMeshes(')) {
  failures.push('runtime still replaces authored PBR operator materials with a vertex-colour fallback');
}
for (const opaqueLine of ['result.transparent = false', 'result.opacity = 1', 'result.depthWrite = true']) {
  if (!operatorSource.includes(opaqueLine)) failures.push(`runtime opaque material enforcement missing: ${opaqueLine}`);
}
const artKitSource = await readFile(resolveRepoPath('src/art-kit.ts'), 'utf8');
if (!artKitSource.includes('primitive operator fallback is prohibited')) failures.push('canonical operator fallback is not fail closed');
if (artKitSource.includes('buildBoundedOperatorLod')) failures.push('retired procedural humanoid implementation returned');

if (failures.length > 0) {
  console.error(`Pass 65 third-person operator production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  gate: 'pass65-third-person-operator-production',
  releaseState: 'release-ready',
  sourceBlendBytes: (await stat(resolveRepoPath(manifest.sourceBlend.path))).size,
  lods: lodAudits.map((audit, lod) => ({
    lod, triangles: audit.triangles, bytes: audit.bytes, joints: audit.joints,
    skinnedMeshNodes: audit.skinnedMeshNodes, materials: audit.materials, images: audit.images,
    animations: audit.animations.length,
  })),
  pbrMaps: textureHashes.length,
  mutationSelfTest: 'passed',
  runtimeProfiles: manifest.currentRuntimeSources,
  contactSheet: manifest.review.contactSheet.path,
}, null, 2));
