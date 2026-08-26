import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditDroneGlb, readGlb, REQUIRED_DRONE_ANIMATIONS, REQUIRED_DRONE_NODES } from '../qa/hunter-drone-glb.mjs';

const root = process.cwd();
const slash = (value) => value.replaceAll('\\', '/');
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });

const sourceBlend = await fileRecord('source-assets/blender/hunter-drone-family.blend');
const sourceScript = await fileRecord('scripts/blender/create-hunter-drone-family.py');
const worldGlbs = [];
const technicalLods = [];
for (const lod of [0, 1, 2]) {
  const relative = `public/assets/original/models/support/hunter-drone-lod${lod}.glb`;
  const { bytes, json } = await readGlb(absolute(relative));
  const audit = auditDroneGlb(json, lod, bytes.length);
  if (audit.failures.length > 0) throw new Error(`Hunter drone LOD${lod} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  worldGlbs.push(await fileRecord(relative, { lod, triangles: audit.triangles, bytes: audit.bytes }));
  technicalLods.push({ lod, ...audit });
}
if (!(technicalLods[0].triangles > technicalLods[1].triangles && technicalLods[1].triangles > technicalLods[2].triangles)) {
  throw new Error('Hunter drone LOD triangle counts must decrease strictly');
}

const pbrMaps = {};
for (const [key, suffix] of [['baseColor', 'albedo'], ['normal', 'normal'], ['orm', 'orm'], ['emissive', 'emissive']]) {
  pbrMaps[key] = await fileRecord(`public/assets/original/textures/support/hunter-drone-${suffix}.png`, {
    width: 512,
    height: 512,
  });
}
const renderLabels = ['front-quarter', 'rear-quarter', 'side-gun', 'optic-closeup'];
const reviewRenders = await Promise.all(renderLabels.map((label) => fileRecord(
  `docs/assets/pass65-drone/hunter-drone-${label}.png`, { cameraId: label, width: 512, height: 512 },
)));
const contactSheet = await fileRecord('docs/assets/pass65-drone/hunter-drone-contact-sheet.png', { width: 1024, height: 1024 });

const provenancePath = 'source-assets/blender/hunter-drone-family.provenance.json';
const provenance = {
  schemaVersion: 1,
  id: 'hunter-drone-visual-family-v1',
  title: 'Hunter Drone shared standalone and Swarm visual family',
  creator: 'Atomic Acres project',
  owner: 'Atomic Acres project',
  created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: 'Original compact near-future tactical quad-rotor. No copied commercial-game geometry, textures, logos, animation, UI, or audio.',
  blenderVersion: '5.1.2',
  generator: sourceScript,
  sourceBlend,
  runtimeForwardAxis: '-Z',
  blenderAuthoringForwardAxis: '-Y converted to glTF -Z by Y-up export',
  presentationOnly: true,
  sharedConsumers: ['standalone-piloted-drone', 'standalone-ai-drone', 'hunter-drone-swarm'],
  worldGlbs,
  pbrMaps,
  requiredNodes: REQUIRED_DRONE_NODES,
  animationClips: REQUIRED_DRONE_ANIMATIONS,
  review: {
    deterministicSeed: 0,
    frame: 1,
    renderEngine: 'BLENDER_EEVEE',
    colorTransform: 'AgX - Medium High Contrast',
    renders: reviewRenders,
    contactSheet,
  },
  runtimeAudit: {
    lods: technicalLods.map(({ failures: _failures, ...audit }) => audit),
    compressedGeometry: 'EXT_meshopt_compression plus KHR_mesh_quantization',
    embeddedTextureDelivery: 'lossy-quality-100 EXT_texture_webp in each GLB; standalone lossless project-owned PNG source maps retained',
    externalUris: 0,
  },
  determinism: {
    command: 'npm run author:blender-drone',
    cleanFactoryStartup: true,
    pythonHashSeed: 0,
    note: 'Fixed geometry, textures, camera poses, frame, lighting and optimization arguments; exact generated digests are synchronized into both asset manifests.',
  },
};
await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const provenanceRecord = await fileRecord(provenancePath);

const productionManifestPath = absolute('source-assets/blender/pass65-weapon-production.manifest.json');
const productionManifest = JSON.parse(await readFile(productionManifestPath, 'utf8'));
const supportIndex = productionManifest.supportVehicles.findIndex((entry) => entry.id === 'hunter-drone-visual-family-v1');
if (supportIndex < 0) throw new Error('Pass65 production manifest has no hunter drone entry');
productionManifest.supportVehicles[supportIndex] = {
  id: 'hunter-drone-visual-family-v1',
  releaseState: 'release-ready',
  sourceKind: 'project-original-blender',
  owner: 'Atomic Acres project',
  qualityTier: 'hero-support-vehicle',
  materialFamily: 'tactical-gunmetal-cyan-orange-pbr',
  textureDensity: '512px shared map set for a 2.23m authored vehicle',
  triangleRange: { lod0: [9_000, 12_000], lod1: [6_500, 9_000], lod2: [4_000, 6_500] },
  placeholderStatus: 'forbidden-and-not-present',
  sharedConsumers: ['standalone-piloted-drone', 'standalone-ai-drone', 'hunter-drone-swarm'],
  runtimeForwardAxis: '-Z',
  sourceBlend,
  worldGlbs,
  firstPersonGlb: worldGlbs[0],
  pbrMaps,
  provenance: provenanceRecord,
  sockets: REQUIRED_DRONE_NODES.filter((name) => name.includes('socket')),
  semanticNodes: REQUIRED_DRONE_NODES,
  actions: REQUIRED_DRONE_ANIMATIONS,
  review: { renders: reviewRenders, contactSheet },
  technicalAudit: { lods: technicalLods.map(({ failures: _failures, ...audit }) => audit) },
};
await writeFile(productionManifestPath, `${JSON.stringify(productionManifest, null, 2)}\n`, 'utf8');

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const assetRecord = {
  id: 'atomic-acres-hunter-drone-family-2026-07-26',
  kind: 'original-project-blender-support-vehicle-family',
  creator: 'Atomic Acres project',
  source: 'scripts/blender/create-hunter-drone-family.py',
  generatedAsOf: '2026-07-26',
  license: 'Original project work',
  files: 'public/assets/original/**/hunter-drone-*',
  sourceBlend: sourceBlend.path,
  sourceBlendSha256: sourceBlend.sha256,
  sourceScript: sourceScript.path,
  sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: provenanceRecord.path,
  sourceProvenanceSha256: provenanceRecord.sha256,
  preview: contactSheet.path,
  format: 'Three optimized self-contained glTF 2.0 binary LODs with Meshopt geometry, quantization, embedded WebP PBR textures, authored sockets, and three animation clips',
  modifications: 'Project-original shared Hunter Drone family authored in Blender for standalone player/AI and Swarm presentation. Includes a mounted machine-gun silhouette, four ducted rotors, optic, landing gear, strict local -Z forward metadata, camera/muzzle sockets, propeller/fire/recoil clips, three decreasing LODs, and project-owned albedo/normal/ORM/emissive maps. Gameplay authority remains TypeScript-owned.',
  attributionRequired: false,
};
const existingAssetIndex = assetManifest.assets.findIndex((entry) => entry.id === assetRecord.id);
if (existingAssetIndex >= 0) assetManifest.assets[existingAssetIndex] = assetRecord;
else assetManifest.assets.splice(4, 0, assetRecord);
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  asset: 'hunter-drone-visual-family-v1',
  releaseState: 'release-ready',
  sourceBlend: sourceBlend.sha256,
  provenance: provenanceRecord.sha256,
  lods: worldGlbs,
}, null, 2));
