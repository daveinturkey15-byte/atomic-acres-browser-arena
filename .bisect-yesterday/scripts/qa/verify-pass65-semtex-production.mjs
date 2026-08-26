import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pngDimensions, readGlb } from './hunter-drone-glb.mjs';

const root = process.cwd();
const failures = [];
const provenancePath = 'source-assets/blender/semtex-bundle.provenance.json';
const requiredNodes = Object.freeze([
  'semtex-bundle-root', 'semtex-block-1', 'semtex-block-2', 'semtex-block-3', 'semtex-block-4',
  'semtex-wrap-band-horizontal', 'semtex-wrap-band-vertical', 'semtex-detonator', 'semtex-fuse',
  'semtex-wire', 'semtex-sticky-pad', 'semtex-held-socket', 'semtex-world-socket',
]);

function resolveRepoPath(relative) {
  const absolute = path.resolve(root, relative);
  const outside = path.relative(root, absolute);
  if (outside.startsWith('..') || path.isAbsolute(outside)) throw new Error(`${relative}: escapes repository root`);
  return absolute;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function verifyRecord(record, label) {
  if (!record || typeof record.path !== 'string' || !/^[a-f0-9]{64}$/u.test(record.sha256 ?? '')) {
    failures.push(`${label}: invalid path/hash record`);
    return null;
  }
  try {
    const bytes = await readFile(resolveRepoPath(record.path));
    if (sha256(bytes) !== record.sha256) failures.push(`${label}: digest mismatch`);
    return bytes;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const provenanceBytes = await readFile(resolveRepoPath(provenancePath));
const provenance = JSON.parse(provenanceBytes.toString('utf8'));
if (provenance.schemaVersion !== 1) failures.push('provenance schemaVersion must be 1');
if (provenance.id !== 'atomic-acres-semtex-bundle-v1') failures.push('provenance asset identity drift');
if (provenance.license !== 'Project-original; no third-party meshes, textures, brands, or commercial-game assets') {
  failures.push('project-original licence boundary is missing');
}
if (provenance.presentationOnly !== true || !String(provenance.gameplayAuthority).includes('TypeScript host authority')) {
  failures.push('presentation/authority boundary is missing');
}
if (JSON.stringify(provenance.requiredNodes) !== JSON.stringify(requiredNodes)) failures.push('required semantic-node inventory drift');
if (provenance.reproducibility?.command !== 'npm run author:blender-semtex'
  || provenance.reproducibility?.cleanFactoryStartup !== true) failures.push('reproducibility contract drift');

const sourceBlend = await verifyRecord(provenance.sourceBlend, 'source blend');
await verifyRecord(provenance.generator, 'source generator');
if (sourceBlend && sourceBlend.length < 150_000) failures.push('editable Blender source is unexpectedly trivial');

const blender = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!blender) failures.push('Blender 5.1 executable unavailable for editable-source validation');
else if (provenance.sourceBlend?.path) {
  const audit = spawnSync(blender, [
    resolveRepoPath(provenance.sourceBlend.path), '--background', '--python-expr',
    "import bpy; roots=[o for o in bpy.data.objects if o.get('asset_id')=='atomic-acres-semtex-bundle-v1']; assert len(roots)==1; names={o.name for o in roots[0].children_recursive}; required={'semtex-block-1','semtex-block-2','semtex-block-3','semtex-block-4','semtex-detonator','semtex-fuse','semtex-wire','semtex-sticky-pad','semtex-held-socket','semtex-world-socket'}; assert required.issubset(names); assert len([i for i in bpy.data.images if i.packed_file])>=4",
  ], { cwd: root, encoding: 'utf8' });
  if (audit.status !== 0) failures.push(`editable Blender source audit failed\n${audit.stdout}${audit.stderr}`);
}

const lodAudits = [];
for (const [index, record] of (provenance.worldGlbs ?? []).entries()) {
  if (record.lod !== index) failures.push(`LOD${index}: manifest index/LOD mismatch`);
  const bytes = await verifyRecord(record, `LOD${index}`);
  if (!bytes) continue;
  try {
    const glb = await readGlb(resolveRepoPath(record.path));
    const names = new Set((glb.json.nodes ?? []).map((node) => node.name));
    for (const name of requiredNodes) if (!names.has(name)) failures.push(`LOD${index}: missing semantic node ${name}`);
    const triangles = (glb.json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []).reduce((total, primitive) => {
      const accessor = glb.json.accessors?.[primitive.indices];
      return total + Math.floor((accessor?.count ?? 0) / 3);
    }, 0);
    if (triangles <= 0 || triangles !== record.triangles || bytes.length !== record.bytes) failures.push(`LOD${index}: receipt drift`);
    if ((glb.json.images?.length ?? 0) < 4) failures.push(`LOD${index}: embedded PBR image set is incomplete`);
    lodAudits.push({ lod: index, triangles, bytes: bytes.length });
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
if ((provenance.worldGlbs ?? []).length !== 3) failures.push('exactly three Semtex world LODs are required');
if (lodAudits.length === 3
  && !(lodAudits[0].triangles > lodAudits[1].triangles && lodAudits[1].triangles > lodAudits[2].triangles)) {
  failures.push('LOD triangle counts do not decrease strictly');
}
if (new Set((provenance.worldGlbs ?? []).map(({ sha256: digest }) => digest)).size !== 3) failures.push('LOD artifacts are not unique');

for (const key of ['albedo', 'normal', 'orm', 'emissive']) {
  const record = provenance.pbrMaps?.[key];
  const bytes = await verifyRecord(record, `PBR ${key}`);
  if (!bytes) continue;
  try {
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== 256 || dimensions.height !== 256
      || record.width !== 256 || record.height !== 256) failures.push(`PBR ${key}: dimensions must remain 256x256`);
  } catch (error) {
    failures.push(`PBR ${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const reviewBytes = await verifyRecord(provenance.review, 'review render');
if (reviewBytes) {
  const dimensions = pngDimensions(reviewBytes);
  if (dimensions.width !== 512 || dimensions.height !== 512
    || provenance.review.width !== 512 || provenance.review.height !== 512
    || reviewBytes.length < 100_000) failures.push('review render is missing, malformed, or trivial');
}

const assetManifest = JSON.parse(await readFile(resolveRepoPath('assets.manifest.json'), 'utf8'));
const publicRecord = assetManifest.assets?.find(({ id }) => id === 'atomic-acres-semtex-bundle-2026-07-26');
if (!publicRecord) failures.push('public asset provenance entry missing');
else {
  if (publicRecord.sourceBlendSha256 !== provenance.sourceBlend?.sha256) failures.push('public source blend digest drift');
  if (publicRecord.sourceScriptSha256 !== provenance.generator?.sha256) failures.push('public generator digest drift');
  if (publicRecord.sourceProvenanceSha256 !== sha256(provenanceBytes)) failures.push('public provenance digest drift');
  if (publicRecord.preview !== provenance.review?.path) failures.push('public review path drift');
  if (publicRecord.files !== 'public/assets/original/**/semtex-bundle-*') failures.push('public asset coverage pattern drift');
}

if (failures.length > 0) {
  console.error(`Pass 65 Semtex production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  gate: 'pass65-semtex-production',
  releaseState: 'release-ready',
  sourceBlendBytes: (await stat(resolveRepoPath(provenance.sourceBlend.path))).size,
  lods: lodAudits,
  pbrMaps: Object.keys(provenance.pbrMaps),
  requiredNodes,
  review: provenance.review.path,
}, null, 2));
