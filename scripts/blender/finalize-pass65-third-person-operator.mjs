import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  auditOperatorGlb,
  OPERATOR_ASSET_ID,
  readGlb,
  REQUIRED_OPERATOR_ACTIONS,
  REQUIRED_OPERATOR_MATERIALS,
  validateOperatorLodFamily,
} from '../qa/pass65-operator-glb.mjs';

const root = process.cwd();
const slash = (value) => value.replaceAll('\\', '/');
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });

const sourceBlend = await fileRecord('source-assets/blender/pass65-third-person-operator.blend');
const sourceScript = await fileRecord('scripts/blender/create-pass65-third-person-operator.py');
const sourceGltf = await fileRecord('public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf');
const sourceReadme = await fileRecord('public/assets/third-party/quaternius/ultimate-modular-males/README.md');
const sourceLicense = await fileRecord('public/assets/third-party/quaternius/ultimate-modular-males/LICENSE.txt');

const worldGlbs = [];
const technicalLods = [];
for (const lod of [0, 1, 2]) {
  const relative = `public/assets/original/models/operators/pass65-third-person-operator-lod${lod}.glb`;
  const { bytes, json } = await readGlb(absolute(relative));
  const audit = auditOperatorGlb(json, lod, bytes);
  if (audit.failures.length > 0) {
    throw new Error(`Third-person operator LOD${lod} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  worldGlbs.push(await fileRecord(relative, {
    lod, triangles: audit.triangles, bytes: audit.bytes,
    skinnedMeshNodes: audit.skinnedMeshNodes, joints: audit.joints,
  }));
  technicalLods.push({ lod, ...audit });
}
const familyFailures = validateOperatorLodFamily(worldGlbs, technicalLods);
if (familyFailures.length > 0) throw new Error(`Third-person operator LOD family invalid:\n${familyFailures.join('\n')}`);

const pbrMaps = {};
for (const material of REQUIRED_OPERATOR_MATERIALS) {
  const slug = material.toLowerCase().replaceAll('_', '-');
  pbrMaps[material] = {};
  for (const kind of ['baseColor', 'normal', 'roughness', 'metallic']) {
    pbrMaps[material][kind] = await fileRecord(
      `public/assets/original/textures/operators/pass65-third-person-operator/pass65-third-person-operator-${slug}-${kind}.png`,
      { width: 512, height: 512 },
    );
  }
}

const renderLabels = ['neutral-front', 'neutral-rear-quarter', 'run-action', 'corpse-action'];
const reviewRenders = await Promise.all(renderLabels.map((label) => fileRecord(
  `docs/assets/pass65-operators/third-person/pass65-third-person-operator-${label}.png`,
  { cameraId: label, width: 640, height: 640 },
)));
const contactSheet = await fileRecord(
  'docs/assets/pass65-operators/third-person/pass65-third-person-operator-contact-sheet.png',
  { width: 1280, height: 1280 },
);

const provenancePath = 'source-assets/blender/pass65-third-person-operator.provenance.json';
const provenance = {
  schemaVersion: 1,
  id: OPERATOR_ASSET_ID,
  title: 'Pass 65 canonical opaque PBR third-person operator family',
  derivativeCreator: 'Atomic Acres project',
  created: '2026-07-27',
  sourceCreator: 'Quaternius (@Quaternius)',
  sourceAsset: 'Ultimate Modular Males / Individual Characters / glTF / Swat.gltf',
  sourcePage: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
  license: 'CC0 1.0 Universal / Public Domain Dedication',
  attributionRequired: false,
  sourceRecords: { sourceGltf, sourceReadme, sourceLicense },
  derivativeGenerator: sourceScript,
  sourceBlend,
  blenderVersion: '5.1.2',
  materialContract: 'opaque-embedded-pbr-depth-writing',
  skeletonContract: 'one retained 62-joint source skeleton; every runtime body renderable remains skinned',
  animationContract: 'all 24 source clips retained; required runtime action subset mechanically enforced',
  embeddedWeaponPolicy: 'removed from every runtime LOD; Atomic Acres loadout presentation remains canonical',
  runtimeAxisContract: 'source forward is corrected exactly once at the Atomic visual root; authority axes are unchanged',
  canonicalConsumers: ['human-players', 'remote-players', 'bots', 'reinforcements', 'corpses'],
  pbrMaps,
  worldGlbs,
  requiredMaterials: REQUIRED_OPERATOR_MATERIALS,
  requiredActions: REQUIRED_OPERATOR_ACTIONS,
  review: {
    deterministicSeed: 0,
    renderEngine: 'BLENDER_EEVEE',
    colorTransform: 'AgX - Medium High Contrast',
    renders: reviewRenders,
    contactSheet,
  },
  runtimeAudit: {
    lods: technicalLods.map(({ failures: _failures, ...audit }) => audit),
    compressedGeometry: 'EXT_meshopt_compression plus KHR_mesh_quantization',
    embeddedTextureDelivery: 'EXT_texture_webp in each GLB; project-owned PNG map sources retained',
    externalUris: 0,
  },
  determinism: {
    command: 'npm run author:blender-operator-body',
    cleanFactoryStartup: true,
    pythonHashSeed: 0,
    note: 'Fixed source digest, generated texture formulae, topology ratios, camera poses, actions, frames, lighting and optimization arguments.',
  },
  authorityBoundary: 'Character meshes, materials, skeleton pose and clips are presentation-only. Hit proxies, movement, shots, damage and corpse pickup authority remain TypeScript-owned.',
};
await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const provenanceRecord = await fileRecord(provenancePath);

const manifestPath = 'source-assets/blender/pass65-third-person-operator.manifest.json';
const manifest = {
  schemaVersion: 1,
  id: OPERATOR_ASSET_ID,
  releaseState: 'release-ready',
  sourceKind: 'license-vetted-cc0-blender-derivative',
  owner: 'Atomic Acres project',
  qualityTier: 'canonical-third-person-operator',
  placeholderStatus: 'primitive-and-unrigged-fallbacks-forbidden-and-not-present',
  materialContract: 'opaque-embedded-pbr-depth-writing',
  currentRuntimeSources: {
    quality: worldGlbs[0].path,
    performance: worldGlbs[1].path,
    retainedFarLod: worldGlbs[2].path,
  },
  sourceBlend,
  sourceScript,
  sourceRecords: { sourceGltf, sourceReadme, sourceLicense },
  provenance: provenanceRecord,
  worldGlbs,
  pbrMaps,
  requiredMaterials: REQUIRED_OPERATOR_MATERIALS,
  actions: technicalLods[0].animations,
  requiredActions: REQUIRED_OPERATOR_ACTIONS,
  renderBudget: {
    maximumSkinnedMeshNodesPerLod: 4,
    minimumJoints: 58,
    maximumGlbBytesPerLod: 3_500_000,
    triangleRanges: [[6_500, 10_000], [4_200, 7_500], [2_200, 5_000]],
  },
  canonicalConsumers: provenance.canonicalConsumers,
  review: { renders: reviewRenders, contactSheet },
  technicalAudit: { lods: technicalLods.map(({ failures: _failures, ...audit }) => audit) },
};
await writeFile(absolute(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const manifestRecord = await fileRecord(manifestPath);

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const assetRecord = {
  id: 'atomic-acres-pass65-third-person-operator-family-2026-07-27',
  kind: 'cc0-source-project-blender-pbr-skinned-operator-derivative',
  creator: 'Quaternius source; Atomic Acres controlled Blender derivative',
  source: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
  generatedAsOf: '2026-07-27',
  license: 'CC0 1.0 Universal / Public Domain Dedication',
  files: 'public/assets/original/**/pass65-third-person-operator-*',
  sourceBlend: sourceBlend.path,
  sourceBlendSha256: sourceBlend.sha256,
  sourceScript: sourceScript.path,
  sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: provenanceRecord.path,
  sourceProvenanceSha256: provenanceRecord.sha256,
  productionManifest: manifestRecord.path,
  productionManifestSha256: manifestRecord.sha256,
  preview: contactSheet.path,
  format: 'Three distinct optimized self-contained glTF 2.0 skinned LODs with 62-joint rig, 24 clips, embedded material-specific WebP PBR textures and opaque materials',
  modifications: 'Removed the embedded source pistol; retained lawful topology, full-body skin weights and complete action corpus; authored material-specific base-color, normal, roughness and metallic maps; added strict LOD/provenance/review contracts. Runtime Quality selects LOD0 and Performance selects LOD1 without replacing anatomy or collision authority.',
  attributionRequired: false,
};
const existingIndex = assetManifest.assets.findIndex((entry) => entry.id === assetRecord.id);
if (existingIndex >= 0) assetManifest.assets[existingIndex] = assetRecord;
else assetManifest.assets.splice(6, 0, assetRecord);
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  asset: OPERATOR_ASSET_ID,
  releaseState: 'release-ready',
  sourceBlend: sourceBlend.sha256,
  provenance: provenanceRecord.sha256,
  manifest: manifestRecord.sha256,
  lods: worldGlbs,
  contactSheet: contactSheet.path,
}, null, 2));
