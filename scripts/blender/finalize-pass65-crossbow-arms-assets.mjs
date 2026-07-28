import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  auditCrossbowGlb,
  auditOperatorArmsGlb,
  OPERATOR_ARMS_RENDER_BUDGET,
  readGlb,
  REQUIRED_ARM_BONES,
  REQUIRED_ARM_SOCKETS,
  REQUIRED_CORE_ACTIONS,
  REQUIRED_CROSSBOW_NODES,
} from '../qa/pass65-crossbow-arms-glb.mjs';
import { pngDimensions } from '../qa/hunter-drone-glb.mjs';

const root = process.cwd();
const slash = (value) => value.replaceAll('\\', '/');
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });
const pngRecord = async (value, extra = {}) => {
  const bytes = await readFile(absolute(value));
  return fileRecord(value, { ...pngDimensions(bytes), ...extra });
};

const crossbowSourceBlend = await fileRecord('source-assets/blender/pass65-explosive-crossbow.blend');
const crossbowSourceScript = await fileRecord('scripts/blender/create-pass65-explosive-crossbow.py');
const armsSourceBlend = await fileRecord('source-assets/blender/pass65-first-person-operator-arms.blend');
const armsSourceScript = await fileRecord('scripts/blender/create-pass65-first-person-arms.py');

const crossbowSpecs = [
  ['first-person-lod0', 'firstPersonGlbs', 0, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb'],
  ['first-person-lod1', 'firstPersonGlbs', 1, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod1.glb'],
  ['world-lod0', 'worldGlbs', 0, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-world-lod0.glb'],
  ['world-lod1', 'worldGlbs', 1, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-world-lod1.glb'],
  ['world-lod2', 'worldGlbs', 2, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-world-lod2.glb'],
  ['drop-lod0', 'dropGlbs', 0, 'public/assets/original/models/weapons/pass65-crossbow/pass65-crossbow-drop-lod0.glb'],
];
const crossbowDeliveries = { firstPersonGlbs: [], worldGlbs: [], dropGlbs: [] };
const crossbowAudits = [];
for (const [variant, bucket, lod, relative] of crossbowSpecs) {
  const { bytes, json } = await readGlb(absolute(relative));
  const audit = auditCrossbowGlb(json, variant, bytes.length);
  if (audit.failures.length > 0) throw new Error(`${relative} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  crossbowDeliveries[bucket].push(await fileRecord(relative, { variant, lod, triangles: audit.triangles, bytes: audit.bytes }));
  crossbowAudits.push({ variant, ...audit });
}
if (!(crossbowDeliveries.firstPersonGlbs[0].triangles > crossbowDeliveries.firstPersonGlbs[1].triangles)) {
  throw new Error('Crossbow first-person LOD triangle counts must decrease strictly');
}
if (!(crossbowDeliveries.worldGlbs[0].triangles > crossbowDeliveries.worldGlbs[1].triangles
  && crossbowDeliveries.worldGlbs[1].triangles > crossbowDeliveries.worldGlbs[2].triangles)) {
  throw new Error('Crossbow world LOD triangle counts must decrease strictly');
}
const crossbowDeliveryHashes = await Promise.all(crossbowSpecs.map(([, , , relative]) => sha256(relative)));
if (new Set(crossbowDeliveryHashes).size !== crossbowSpecs.length) {
  throw new Error('Every crossbow delivery must be an independently authored binary');
}

const armsGlbs = [];
const armsAudits = [];
for (const lod of [0, 1]) {
  const relative = `public/assets/original/models/operators/pass65-first-person-arms-lod${lod}.glb`;
  const { bytes, json } = await readGlb(absolute(relative));
  const audit = auditOperatorArmsGlb(json, lod, bytes.length);
  if (audit.failures.length > 0) throw new Error(`${relative} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  armsGlbs.push(await fileRecord(relative, {
    lod,
    triangles: audit.triangles,
    bytes: audit.bytes,
    skinnedMeshNodes: audit.skinnedMeshNodes,
    renderPrimitives: audit.renderPrimitives,
    skins: audit.skins,
    sourceWeightedParts: audit.sourceWeightedParts,
    bones: audit.bones,
    blendedVertexCount: audit.blendedVertexCount,
    multiBoneWeightedParts: audit.multiBoneWeightedParts,
    knifeSocketParent: audit.knifeSocketParent,
  }));
  armsAudits.push({ lod, ...audit });
}
if (!(armsGlbs[0].triangles > armsGlbs[1].triangles)) throw new Error('Operator arm LOD triangle counts must decrease strictly');
if (armsGlbs[0].sha256 === armsGlbs[1].sha256) throw new Error('Operator arm LODs must be independently authored binaries');

const crossbowPbrMaps = {};
for (const map of ['baseColor', 'normal', 'roughness', 'metallic', 'emissive']) {
  crossbowPbrMaps[map] = await pngRecord(`public/assets/original/textures/weapons/pass65-crossbow/pass65-crossbow-${map}.png`);
}
const armsPbrMaps = {};
for (const map of ['baseColor', 'normal', 'roughness', 'metallic']) {
  armsPbrMaps[map] = await pngRecord(`public/assets/original/textures/operators/pass65-first-person-arms/pass65-first-person-arms-${map}.png`);
}

const crossbowRenderLabels = ['hero-quarter', 'top-silhouette', 'optic-closeup', 'limb-string-profile'];
const crossbowRenders = await Promise.all(crossbowRenderLabels.map((label) => pngRecord(
  `docs/assets/pass65-weapons/crossbow/pass65-crossbow-${label}.png`, { cameraId: label },
)));
const crossbowContactSheet = await pngRecord('docs/assets/pass65-weapons/crossbow/pass65-crossbow-contact-sheet.png');
const armsRenderLabels = [
  'neutral-front', 'forearm-wrist-quarter', 'hand-anatomy-closeup',
  'm4a1-neutral-contact', 'm4a1-ads-contact', 'm4a1-reload-contact',
];
const armsRenders = await Promise.all(armsRenderLabels.map((label) => pngRecord(
  `docs/assets/pass65-operators/first-person-arms/pass65-first-person-arms-${label}.png`, { cameraId: label },
)));
const armsContactSheet = await pngRecord('docs/assets/pass65-operators/first-person-arms/pass65-first-person-arms-contact-sheet.png');

const crossbowProvenancePath = 'source-assets/blender/pass65-explosive-crossbow.provenance.json';
const crossbowProvenance = {
  schemaVersion: 1,
  id: 'explosive-crossbow-production-v1',
  title: 'Pass 65 project-original explosive compound crossbow',
  creator: 'Atomic Acres project', owner: 'Atomic Acres project', created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: 'Original compact near-future tactical compound crossbow. No copied commercial-game geometry, textures, logos, animation, UI, or audio.',
  blenderVersion: '5.1.2', generator: crossbowSourceScript, sourceBlend: crossbowSourceBlend,
  runtimeForwardAxis: '-Z', opticMagnification: 1.5,
  deliveries: crossbowDeliveries, pbrMaps: crossbowPbrMaps,
  requiredNodes: REQUIRED_CROSSBOW_NODES, animationClips: REQUIRED_CORE_ACTIONS,
  review: { authoringSeed: 0, frame: 1, renderEngine: 'BLENDER_EEVEE', renders: crossbowRenders, contactSheet: crossbowContactSheet },
  runtimeAudit: { deliveries: crossbowAudits.map(({ failures: _failures, ...audit }) => audit), externalUris: 0 },
  gameplayBoundary: 'Presentation asset only. TypeScript retains projectile, sticking, fuse, blast, damage, authority, collision and networking.',
};
await writeFile(absolute(crossbowProvenancePath), `${JSON.stringify(crossbowProvenance, null, 2)}\n`, 'utf8');
const crossbowProvenanceRecord = await fileRecord(crossbowProvenancePath);

const armsProvenancePath = 'source-assets/blender/pass65-first-person-operator-arms.provenance.json';
const armsProvenance = {
  schemaVersion: 1,
  id: 'pass65-first-person-operator-arms',
  title: 'Pass 65 project-original opaque first-person operator arms',
  creator: 'Atomic Acres project', owner: 'Atomic Acres project', created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: 'Original tactical sleeves, gloves, guards and full articulated hands. No copied commercial-game geometry, textures, logos, animation, UI, or audio.',
  blenderVersion: '5.1.2', generator: armsSourceScript, sourceBlend: armsSourceBlend,
  firstPersonGlbs: armsGlbs, pbrMaps: armsPbrMaps,
  requiredBones: REQUIRED_ARM_BONES, requiredSockets: REQUIRED_ARM_SOCKETS, animationClips: REQUIRED_CORE_ACTIONS,
  materialContract: 'All visible materials OPAQUE with depth writes; no alpha fading or see-through anatomy.',
  visualRevision: 'continuous-manifold-viewmodel-v6',
  limbProfileContract: 'continuous-shoulder-elbow-wrist-manifold-shell-v6',
  handPoseContract: 'continuous-cuff-palm-wrapped-articulated-digit-grip-v6',
  shoulderEntryContract: 'full-profile-frame-edge-sleeve-v6',
  gloveConstructionContract: 'opaque-continuous-palm-wrapped-fingers-cloth-v6',
  weaponGripReviewContract: 'all-family-runtime-plus-m4-contact-v5',
  weightingContract: 'adjacent-bone-normalized-blend-v5',
  runtimeAnimationContract: 'authored-fingers-under-runtime-chain-ik-v1',
  fingerSegmentCount: 30,
  weaponGripReviewFrames: 3,
  performanceContract: OPERATOR_ARMS_RENDER_BUDGET,
  review: { authoringSeed: 0, frame: 1, renderEngine: 'BLENDER_EEVEE', renders: armsRenders, contactSheet: armsContactSheet },
  runtimeAudit: { lods: armsAudits.map(({ failures: _failures, ...audit }) => audit), externalUris: 0 },
  gameplayBoundary: 'Presentation asset only. Camera, weapon sockets, IK targets, gameplay authority and networking remain TypeScript-owned.',
};
await writeFile(absolute(armsProvenancePath), `${JSON.stringify(armsProvenance, null, 2)}\n`, 'utf8');
const armsProvenanceRecord = await fileRecord(armsProvenancePath);

const productionManifestPath = absolute('source-assets/blender/pass65-weapon-production.manifest.json');
const productionManifest = JSON.parse(await readFile(productionManifestPath, 'utf8'));
const supportVehicleSnapshot = JSON.stringify(productionManifest.supportVehicles ?? []);
const crossbowIndex = productionManifest.weapons.findIndex((entry) => entry.id === 'explosive-crossbow');
if (crossbowIndex < 0) throw new Error('Pass65 production manifest has no explosive-crossbow entry');
productionManifest.weapons[crossbowIndex] = {
  id: 'explosive-crossbow', releaseState: 'release-ready', sourceKind: 'project-original-blender',
  owner: 'Atomic Acres project', qualityTier: 'hero-first-person-and-world',
  currentRuntimeSource: crossbowDeliveries.firstPersonGlbs[0].path,
  placeholderStatus: 'forbidden-and-not-present', runtimeForwardAxis: '-Z', opticMagnification: 1.5,
  sourceBlend: crossbowSourceBlend, sourceScript: crossbowSourceScript,
  ...crossbowDeliveries, pbrMaps: crossbowPbrMaps, provenance: crossbowProvenanceRecord,
  sockets: ['rightGrip', 'leftGrip', 'magazine', 'muzzle', 'eject', 'optic'],
  semanticNodes: REQUIRED_CROSSBOW_NODES, actions: REQUIRED_CORE_ACTIONS,
  review: { renders: crossbowRenders, contactSheet: crossbowContactSheet },
  technicalAudit: { deliveries: crossbowAudits.map(({ failures: _failures, ...audit }) => audit) },
};
productionManifest.operatorArms = {
  id: 'pass65-first-person-operator-arms', releaseState: 'release-ready', sourceKind: 'project-original-blender',
  owner: 'Atomic Acres project', qualityTier: 'hero-first-person-operator',
  currentRuntimeSource: armsGlbs[0].path, placeholderStatus: 'forbidden-and-not-present',
  sourceBlend: armsSourceBlend, sourceScript: armsSourceScript, firstPersonGlbs: armsGlbs,
  pbrMaps: armsPbrMaps, provenance: armsProvenanceRecord,
  bones: REQUIRED_ARM_BONES, sockets: REQUIRED_ARM_SOCKETS, actions: REQUIRED_CORE_ACTIONS,
  materialContract: 'opaque-depth-writing',
  visualRevision: 'continuous-manifold-viewmodel-v6',
  limbProfileContract: 'continuous-shoulder-elbow-wrist-manifold-shell-v6',
  handPoseContract: 'continuous-cuff-palm-wrapped-articulated-digit-grip-v6',
  shoulderEntryContract: 'full-profile-frame-edge-sleeve-v6',
  gloveConstructionContract: 'opaque-continuous-palm-wrapped-fingers-cloth-v6',
  weaponGripReviewContract: 'all-family-runtime-plus-m4-contact-v5',
  weightingContract: 'adjacent-bone-normalized-blend-v5',
  runtimeAnimationContract: 'authored-fingers-under-runtime-chain-ik-v1',
  fingerSegmentCount: 30,
  weaponGripReviewFrames: 3,
  renderBudget: OPERATOR_ARMS_RENDER_BUDGET,
  review: { renders: armsRenders, contactSheet: armsContactSheet },
  technicalAudit: { lods: armsAudits.map(({ failures: _failures, ...audit }) => audit) },
};
if (JSON.stringify(productionManifest.supportVehicles ?? []) !== supportVehicleSnapshot) {
  throw new Error('Crossbow/arms finalization must preserve every existing support-vehicle production record byte-for-byte');
}
await writeFile(productionManifestPath, `${JSON.stringify(productionManifest, null, 2)}\n`, 'utf8');

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const assetRecords = [
  {
    id: 'atomic-acres-pass65-explosive-crossbow-2026-07-26', kind: 'original-project-blender-weapon-family',
    creator: 'Atomic Acres project', source: crossbowSourceScript.path, generatedAsOf: '2026-07-26', license: 'Original project work',
    files: 'public/assets/original/**/pass65-crossbow-*', sourceBlend: crossbowSourceBlend.path, sourceBlendSha256: crossbowSourceBlend.sha256,
    sourceScript: crossbowSourceScript.path, sourceScriptSha256: crossbowSourceScript.sha256,
    sourceProvenance: crossbowProvenanceRecord.path, sourceProvenanceSha256: crossbowProvenanceRecord.sha256,
    preview: crossbowContactSheet.path,
    format: 'Two first-person, three world and one drop optimized self-contained glTF 2.0 binaries with Meshopt geometry, embedded WebP PBR textures, physical 1.5x optic, authored sockets and thirteen action clips',
    modifications: 'Project-original compound explosive crossbow authored in Blender with transverse curved limbs, cams, compound string, bolt rail, loaded explosive bolt, cassette, compact 1.5x optic and independently authored delivery LODs. Gameplay authority remains TypeScript-owned.',
    attributionRequired: false,
  },
  {
    id: 'atomic-acres-pass65-first-person-operator-arms-2026-07-26', kind: 'original-project-blender-skinned-operator-family',
    creator: 'Atomic Acres project', source: armsSourceScript.path, generatedAsOf: '2026-07-26', license: 'Original project work',
    files: 'public/assets/original/**/pass65-first-person-arms-*', sourceBlend: armsSourceBlend.path, sourceBlendSha256: armsSourceBlend.sha256,
    sourceScript: armsSourceScript.path, sourceScriptSha256: armsSourceScript.sha256,
    sourceProvenance: armsProvenanceRecord.path, sourceProvenanceSha256: armsProvenanceRecord.sha256,
    preview: armsContactSheet.path,
    format: 'Two decreasing optimized self-contained glTF 2.0 skinned LODs with 37-bone dedicated skeleton, four material-compatible skinned renderables per LOD, embedded WebP PBR textures, opaque materials and thirteen action clips',
    modifications: 'Project-original first-person operator arms authored in Blender from 45 sleeve, glove, guard, full-finger/thumb and wrist-display parts. The v6 silhouette uses shared-ring manifold shells from shoulder through wrist and cuff through palm, preventing open elbow or wrist contours under runtime IK. Enlarged articulated digits use matching 50/50 seam weights and a readable cool tactical PBR value range. Opaque anatomy pads, low-profile cuff straps, cloth normal detail and the wrist device remain. Neutral, ADS and reload frames socket-fit the consolidated authored M4A1, while a deterministic browser gate covers every weapon family and knife action. Four material batches remain under the six-renderable/six-primitive budget. Runtime camera-space IK remains TypeScript-owned and consumes only authored finger animation beneath that IK layer.',
    attributionRequired: false,
  },
];
for (const record of assetRecords.reverse()) {
  const index = assetManifest.assets.findIndex((entry) => entry.id === record.id);
  if (index >= 0) assetManifest.assets[index] = record;
  else assetManifest.assets.splice(4, 0, record);
}
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  crossbow: { releaseState: 'release-ready', sourceBlend: crossbowSourceBlend.sha256, deliveries: crossbowDeliveries },
  operatorArms: { releaseState: 'release-ready', sourceBlend: armsSourceBlend.sha256, firstPersonGlbs: armsGlbs },
}, null, 2));
