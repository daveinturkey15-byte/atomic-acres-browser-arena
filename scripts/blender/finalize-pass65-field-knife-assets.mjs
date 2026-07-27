import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pngDimensions } from '../qa/hunter-drone-glb.mjs';
import {
  auditFieldKnifeGlb,
  readGlb,
  REQUIRED_FIELD_KNIFE_ACTIONS,
  REQUIRED_FIELD_KNIFE_NODES,
} from '../qa/pass65-field-knife-glb.mjs';

const root = process.cwd();
const absolute = (value) => path.join(root, value);
const slash = (value) => value.replaceAll('\\', '/');
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });
const pngRecord = async (value, extra = {}) => {
  const bytes = await readFile(absolute(value));
  return fileRecord(value, { ...pngDimensions(bytes), ...extra });
};

const sourceBlend = await fileRecord('source-assets/blender/pass65-field-knife.blend');
const sourceScript = await fileRecord('scripts/blender/create-pass65-field-knife.py');
const deliverySpecs = [
  ['first-person-lod0', 'firstPersonGlbs', 0, 'fp-lod0'],
  ['first-person-lod1', 'firstPersonGlbs', 1, 'fp-lod1'],
  ['world-lod0', 'worldGlbs', 0, 'world-lod0'],
  ['world-lod1', 'worldGlbs', 1, 'world-lod1'],
  ['drop-lod0', 'dropGlbs', 0, 'drop-lod0'],
];
const deliveries = { firstPersonGlbs: [], worldGlbs: [], dropGlbs: [] };
const audits = [];
for (const [variant, bucket, lod, suffix] of deliverySpecs) {
  const relative = `public/assets/original/models/weapons/pass65-field-knife/pass65-field-knife-${suffix}.glb`;
  const { bytes, json } = await readGlb(absolute(relative));
  const audit = auditFieldKnifeGlb(json, variant, bytes.length);
  if (audit.failures.length > 0) throw new Error(`${relative} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  deliveries[bucket].push(await fileRecord(relative, {
    variant, lod, triangles: audit.triangles, bytes: audit.bytes, meshNodes: audit.meshNodes,
  }));
  audits.push({ variant, ...audit });
}
if (!(deliveries.firstPersonGlbs[0].triangles > deliveries.firstPersonGlbs[1].triangles)) {
  throw new Error('Field-knife first-person LOD triangle counts must decrease strictly');
}
if (!(deliveries.worldGlbs[0].triangles > deliveries.worldGlbs[1].triangles)) {
  throw new Error('Field-knife world LOD triangle counts must decrease strictly');
}
const hashes = [...deliveries.firstPersonGlbs, ...deliveries.worldGlbs, ...deliveries.dropGlbs].map((entry) => entry.sha256);
if (new Set(hashes).size !== hashes.length) throw new Error('Every field-knife delivery must be an independently authored binary');

const pbrMaps = {};
for (const map of ['baseColor', 'normal', 'roughness', 'metallic']) {
  pbrMaps[map] = await pngRecord(`public/assets/original/textures/weapons/pass65-field-knife/pass65-field-knife-${map}.png`);
}
pbrMaps.handleBaseColor = await pngRecord(
  'public/assets/original/textures/weapons/pass65-field-knife/pass65-field-knife-handleBaseColor.png',
);
const renderLabels = ['hero-quarter', 'blade-profile', 'grip-closeup', 'melee-action'];
const renders = await Promise.all(renderLabels.map((label) => pngRecord(
  `docs/assets/pass65-weapons/field-knife/pass65-field-knife-${label}.png`, { cameraId: label },
)));
const contactSheet = await pngRecord('docs/assets/pass65-weapons/field-knife/pass65-field-knife-contact-sheet.png');
const provenancePath = 'source-assets/blender/pass65-field-knife.provenance.json';
const provenance = {
  schemaVersion: 1,
  id: 'pass65-field-knife-v1',
  title: 'Pass 65 project-original fixed-blade tactical field knife',
  creator: 'Atomic Acres project', owner: 'Atomic Acres project', created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: 'Original full-tang fixed blade with G10 scales, recessed fuller, spine serrations, guard, screws and lanyard pommel. No copied commercial-game geometry, textures, logos, animation, UI or audio.',
  blenderVersion: '5.1.2', generator: sourceScript, sourceBlend,
  runtimeForwardAxis: '-Z', deliveries, pbrMaps,
  requiredNodes: REQUIRED_FIELD_KNIFE_NODES,
  animationClips: REQUIRED_FIELD_KNIFE_ACTIONS,
  review: { authoringSeed: 0, frame: 1, renderEngine: 'BLENDER_EEVEE', renders, contactSheet },
  runtimeAudit: { deliveries: audits.map(({ failures: _failures, ...audit }) => audit), externalUris: 0 },
  gameplayBoundary: 'Presentation asset only. TypeScript owns melee timing, range, collision, hit admission, damage, authority and networking.',
};
await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const provenanceRecord = await fileRecord(provenancePath);
const entry = {
  id: 'field-knife',
  displayName: 'Field Knife',
  releaseState: 'release-ready',
  sourceKind: 'project-original-blender',
  owner: 'Atomic Acres project',
  qualityTier: 'hero-first-person-and-world',
  currentRuntimeSource: deliveries.firstPersonGlbs[0].path,
  runtimeIntegrationState: 'bounded-lazy-runtime-selection',
  placeholderStatus: 'forbidden-and-not-present',
  runtimeForwardAxis: '-Z', sourceBlend, sourceScript,
  ...deliveries, pbrMaps, provenance: provenanceRecord,
  sockets: ['rightGrip', 'bladeTip', 'bladeEdge', 'pommel'],
  semanticNodes: REQUIRED_FIELD_KNIFE_NODES,
  actions: REQUIRED_FIELD_KNIFE_ACTIONS,
  review: { renders, contactSheet },
  technicalAudit: { deliveries: audits.map(({ failures: _failures, ...audit }) => audit) },
};

const productionPath = absolute('source-assets/blender/pass65-weapon-production.manifest.json');
const production = JSON.parse(await readFile(productionPath, 'utf8'));
const supportVehicleSnapshot = JSON.stringify(production.supportVehicles ?? []);
production.requirements.meleeFirstPersonLodCount = 2;
production.requirements.meleeWorldLodCount = 2;
production.requirements.dropLodCount = 1;
production.meleeWeapons = [entry];
if (JSON.stringify(production.supportVehicles ?? []) !== supportVehicleSnapshot) {
  throw new Error('Field-knife finalization must preserve every existing support-vehicle production record byte-for-byte');
}
await writeFile(productionPath, `${JSON.stringify(production, null, 2)}\n`, 'utf8');

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const assetRecord = {
  id: 'atomic-acres-pass65-field-knife-2026-07-26',
  kind: 'original-project-blender-melee-weapon-family',
  creator: 'Atomic Acres project', source: sourceScript.path, generatedAsOf: '2026-07-26', license: 'Original project work',
  files: 'public/assets/original/**/pass65-field-knife-*',
  sourceBlend: sourceBlend.path, sourceBlendSha256: sourceBlend.sha256,
  sourceScript: sourceScript.path, sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: provenanceRecord.path, sourceProvenanceSha256: provenanceRecord.sha256,
  preview: contactSheet.path,
  format: 'Two first-person, two world and one dedicated drop optimized self-contained glTF 2.0 binaries with Meshopt geometry, embedded WebP PBR textures, authored melee sockets and seven action clips',
  modifications: 'Project-original full-tang tactical field knife authored in Blender with a shaped blade, recessed fuller, serrated spine, guard, G10 handle scales, grip ribs, fasteners, pommel and lanyard hole. Gameplay authority remains TypeScript-owned.',
  attributionRequired: false,
};
const existing = assetManifest.assets.findIndex((candidate) => candidate.id === assetRecord.id);
if (existing >= 0) assetManifest.assets[existing] = assetRecord;
else assetManifest.assets.splice(4, 0, assetRecord);
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ releaseState: entry.releaseState, deliveries, provenance: provenanceRecord }, null, 2));
