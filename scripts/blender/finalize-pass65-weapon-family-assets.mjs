import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pngDimensions } from '../qa/hunter-drone-glb.mjs';
import {
  auditWeaponFamilyGlb,
  readGlb,
  REQUIRED_CORE_ACTIONS,
  REQUIRED_WEAPON_SOCKETS,
} from '../qa/pass65-weapon-family-glb.mjs';

const root = process.cwd();
const slash = (value) => value.replaceAll('\\', '/');
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });
const pngRecord = async (value, extra = {}) => {
  const bytes = await readFile(absolute(value));
  return fileRecord(value, { ...pngDimensions(bytes), ...extra });
};

const specPath = 'source-assets/blender/pass65-weapon-family-specs.json';
const sourceBlendPath = 'source-assets/blender/pass65-weapon-families.blend';
const sourceScriptPath = 'scripts/blender/create-pass65-weapon-families.py';
const geometryModulePath = 'scripts/blender/pass65_weapon_production_geometry.py';
const corpusProvenancePath = 'source-assets/blender/pass65-weapon-families.provenance.json';
const spec = JSON.parse(await readFile(absolute(specPath), 'utf8'));
const sourceBlend = await fileRecord(sourceBlendPath);
const sourceScript = await fileRecord(sourceScriptPath);
const geometryModule = await fileRecord(geometryModulePath);
const sourceSpec = await fileRecord(specPath);
const contactSheet = await pngRecord('docs/assets/pass65-weapons/firearms/pass65-weapon-family-contact-sheet.png');
const semanticSockets = Object.freeze(['rightGrip', 'leftGrip', 'magazine', 'muzzle', 'eject', 'optic']);
const allBinaryHashes = [];
const heroSilhouettes = new Set();
const heroAnimationSignatures = new Set();
const heroPlatformAnatomies = new Set();
const pbrBaseHashes = new Set();
const weaponEntries = [];
const weaponProvenances = [];

for (const weapon of spec.weapons) {
  const deliveries = { firstPersonGlbs: [], worldGlbs: [], dropGlbs: [] };
  const audits = [];
  for (const delivery of spec.deliveries) {
    const relative = `public/assets/original/models/weapons/pass65-firearms/${weapon.id}/${weapon.id}-${delivery.suffix}.glb`;
    const { bytes, json, binary } = await readGlb(absolute(relative));
    const audit = auditWeaponFamilyGlb(json, weapon, delivery, bytes.length, binary);
    if (audit.failures.length > 0) {
      throw new Error(`${relative} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
    }
    const record = await fileRecord(relative, {
      variant: delivery.variant,
      lod: delivery.lod,
      triangles: audit.triangles,
      bytes: audit.bytes,
      meshNodes: audit.meshNodes,
      renderPrimitives: audit.renderPrimitives,
    });
    deliveries[delivery.bucket].push(record);
    audits.push({ variant: delivery.variant, ...audit });
    allBinaryHashes.push(record.sha256);
    if (delivery.variant === 'first-person-lod0') {
      if (heroSilhouettes.has(audit.silhouetteSignature)) throw new Error(`${weapon.id}: duplicate first-person silhouette audit signature`);
      heroSilhouettes.add(audit.silhouetteSignature);
      if (heroAnimationSignatures.has(audit.animationSignature)) throw new Error(`${weapon.id}: duplicate first-person animation motion signature`);
      heroAnimationSignatures.add(audit.animationSignature);
      if (heroPlatformAnatomies.has(audit.platformAnatomy)) throw new Error(`${weapon.id}: duplicate platform anatomy receipt`);
      heroPlatformAnatomies.add(audit.platformAnatomy);
    }
  }
  if (!(deliveries.firstPersonGlbs[0].triangles > deliveries.firstPersonGlbs[1].triangles)) {
    throw new Error(`${weapon.id}: first-person LOD triangle counts must decrease strictly`);
  }
  if (!(deliveries.worldGlbs[0].triangles > deliveries.worldGlbs[1].triangles
    && deliveries.worldGlbs[1].triangles > deliveries.worldGlbs[2].triangles)) {
    throw new Error(`${weapon.id}: world LOD triangle counts must decrease strictly`);
  }
  const pbrMaps = {};
  for (const map of ['baseColor', 'normal', 'roughness', 'metallic']) {
    pbrMaps[map] = await pngRecord(`public/assets/original/textures/weapons/pass65-firearms/${weapon.id}/${weapon.id}-${map}.png`);
  }
  for (const map of ['polymerBaseColor', 'polymerRoughness', 'polymerMetallic']) {
    pbrMaps[map] = await pngRecord(
      `public/assets/original/textures/weapons/pass65-firearms/${weapon.id}/${weapon.id}-${map}.png`,
    );
  }
  if (pbrBaseHashes.has(pbrMaps.baseColor.sha256)) throw new Error(`${weapon.id}: duplicate base-color texture corpus`);
  pbrBaseHashes.add(pbrMaps.baseColor.sha256);
  const reviewFrames = [
    { cameraId: 'hero-quarter', evidenceRole: 'first-person-neutral' },
    { cameraId: 'side-silhouette', evidenceRole: 'first-person-side-silhouette' },
    { cameraId: 'sight-line', evidenceRole: 'first-person-ads' },
    { cameraId: 'reload-action', evidenceRole: 'first-person-reload' },
    { cameraId: 'world-lod0-silhouette', evidenceRole: 'world-near-silhouette' },
    { cameraId: 'world-lod2-silhouette', evidenceRole: 'world-far-lod-silhouette' },
    { cameraId: 'drop-lod0-silhouette', evidenceRole: 'drop-silhouette' },
  ];
  const renders = await Promise.all(reviewFrames.map(({ cameraId, evidenceRole }) => pngRecord(
    `docs/assets/pass65-weapons/firearms/${weapon.id}/${weapon.id}-${cameraId}.png`, { cameraId, evidenceRole },
  )));
  const weaponContactSheet = await pngRecord(
    `docs/assets/pass65-weapons/firearms/${weapon.id}/${weapon.id}-contact-sheet.png`,
  );
  const provenancePath = `source-assets/blender/pass65-weapons/${weapon.id}.provenance.json`;
  await mkdir(path.dirname(absolute(provenancePath)), { recursive: true });
  const provenance = {
    schemaVersion: 1,
    assetFamilyId: spec.assetFamilyId,
    id: weapon.id,
    displayName: weapon.displayName,
    designId: weapon.designId,
    silhouetteFamily: weapon.family,
    title: `Pass 65 project-original ${weapon.displayName} presentation family`,
    creator: 'Atomic Acres project', owner: 'Atomic Acres project', created: '2026-07-26',
    license: 'Project-original; no third-party meshes or textures',
    inspirationBoundary: spec.sourcePolicy,
    blenderVersion: '5.1.2', generator: sourceScript, geometryModule, sourceBlend, sourceSpec,
    runtimeForwardAxis: spec.runtimeForwardAxis,
    visualRevision: weapon.id === 'm4a1' ? 'm4a1-production-hero-v3' : 'platform-production-hero-v4',
    materialLanguage: weapon.id === 'm4a1' ? 'm4a1-anodized-metal-polymer-pbr-v3' : 'platform-authentic-metal-polymer-pbr-v4',
    platformAnatomy: audits.find((audit) => audit.variant === 'first-person-lod0')?.platformAnatomy,
    deliveries,
    pbrMaps,
    requiredSignatureNodes: weapon.signatureNodes,
    requiredSockets: REQUIRED_WEAPON_SOCKETS,
    animationClips: REQUIRED_CORE_ACTIONS,
    review: { authoringSeed: 0, frame: 1, renderEngine: 'BLENDER_EEVEE', renders, contactSheet: weaponContactSheet },
    runtimeAudit: { deliveries: audits.map(({ failures: _failures, ...audit }) => audit), externalUris: 0 },
    gameplayBoundary: 'Presentation assets only. TypeScript owns damage, spread, recoil authority, hit registration, projectiles, collision and networking.',
  };
  await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  const provenanceRecord = await fileRecord(provenancePath);
  weaponProvenances.push(provenanceRecord);
  weaponEntries.push({
    id: weapon.id,
    displayName: weapon.displayName,
    releaseState: 'release-ready',
    sourceKind: 'project-original-blender',
    owner: 'Atomic Acres project',
    qualityTier: 'hero-first-person-and-world',
    currentRuntimeSource: deliveries.firstPersonGlbs[0].path,
    runtimeIntegrationState: 'bounded-lazy-runtime-selection',
    placeholderStatus: 'forbidden-and-not-present',
    runtimeForwardAxis: spec.runtimeForwardAxis,
    visualRevision: weapon.id === 'm4a1' ? 'm4a1-production-hero-v3' : 'platform-production-hero-v4',
    materialLanguage: weapon.id === 'm4a1' ? 'm4a1-anodized-metal-polymer-pbr-v3' : 'platform-authentic-metal-polymer-pbr-v4',
    designId: weapon.designId,
    silhouetteFamily: weapon.family,
    platformAnatomy: audits.find((audit) => audit.variant === 'first-person-lod0')?.platformAnatomy,
    sourceBlend, sourceScript, geometryModule, sourceSpec,
    ...deliveries,
    pbrMaps,
    provenance: provenanceRecord,
    sockets: semanticSockets,
    semanticNodes: [...weapon.signatureNodes, ...REQUIRED_WEAPON_SOCKETS],
    actions: REQUIRED_CORE_ACTIONS,
    review: { renders, contactSheet: weaponContactSheet },
    technicalAudit: { deliveries: audits.map(({ failures: _failures, ...audit }) => audit) },
  });
}

if (new Set(allBinaryHashes).size !== allBinaryHashes.length) {
  throw new Error(`Every firearm delivery must be an independent binary (${new Set(allBinaryHashes).size}/${allBinaryHashes.length} unique)`);
}
if (heroSilhouettes.size !== spec.weapons.length || heroAnimationSignatures.size !== spec.weapons.length
  || heroPlatformAnatomies.size !== spec.weapons.length
  || pbrBaseHashes.size !== spec.weapons.length) {
  throw new Error('Firearm corpus uniqueness receipts are incomplete');
}

const corpusProvenance = {
  schemaVersion: 1,
  id: spec.assetFamilyId,
  title: 'Pass 65 project-original seventeen-firearm presentation corpus',
  creator: 'Atomic Acres project', owner: 'Atomic Acres project', created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: spec.sourcePolicy,
  blenderVersion: '5.1.2', generator: sourceScript, geometryModule, sourceBlend, sourceSpec,
  weaponIds: spec.weapons.map((weapon) => weapon.id),
  displayNames: Object.fromEntries(spec.weapons.map((weapon) => [weapon.id, weapon.displayName])),
  runtimeForwardAxis: spec.runtimeForwardAxis,
  visualRevision: 'platform-production-hero-v4',
  materialLanguage: 'platform-authentic-metal-polymer-pbr-v4',
  deliveriesPerWeapon: spec.deliveries.length,
  independentBinaryCount: allBinaryHashes.length,
  independentBinaryHashes: allBinaryHashes,
  uniqueHeroSilhouetteReceipts: heroSilhouettes.size,
  uniqueHeroMotionReceipts: heroAnimationSignatures.size,
  uniquePlatformAnatomyReceipts: heroPlatformAnatomies.size,
  uniqueBaseColorReceipts: pbrBaseHashes.size,
  weaponProvenances,
  review: { contactSheet },
  runtimePolicy: 'Selected first-person family and visible world/drop family load on demand. No eager corpus decode is allowed.',
  gameplayBoundary: 'The corpus is presentation-only. All gameplay authority remains TypeScript-owned.',
};
await writeFile(absolute(corpusProvenancePath), `${JSON.stringify(corpusProvenance, null, 2)}\n`, 'utf8');
const corpusProvenanceRecord = await fileRecord(corpusProvenancePath);

const productionManifestPath = absolute('source-assets/blender/pass65-weapon-production.manifest.json');
const productionManifest = JSON.parse(await readFile(productionManifestPath, 'utf8'));
const supportVehicleSnapshot = JSON.stringify(productionManifest.supportVehicles ?? []);
const replacementById = new Map(weaponEntries.map((entry) => [entry.id, entry]));
productionManifest.weapons = productionManifest.weapons.map((entry) => replacementById.get(entry.id) ?? entry);
productionManifest.requirements.dropLodCount = 1;
if (JSON.stringify(productionManifest.supportVehicles ?? []) !== supportVehicleSnapshot) {
  throw new Error('Firearm finalization must preserve every existing support-vehicle production record byte-for-byte');
}
const missing = spec.weapons.map((weapon) => weapon.id).filter((id) => !productionManifest.weapons.some((entry) => entry.id === id));
if (missing.length > 0) throw new Error(`Production manifest missing weapon entries: ${missing.join(', ')}`);
await writeFile(productionManifestPath, `${JSON.stringify(productionManifest, null, 2)}\n`, 'utf8');

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const assetRecord = {
  id: 'atomic-acres-pass65-firearm-corpus-2026-07-26',
  kind: 'original-project-blender-firearm-corpus',
  creator: 'Atomic Acres project',
  source: sourceScript.path,
  generatedAsOf: '2026-07-26',
  license: 'Original project work',
  files: 'public/assets/original/**/pass65-firearms/**',
  sourceBlend: sourceBlend.path,
  sourceBlendSha256: sourceBlend.sha256,
  sourceScript: sourceScript.path,
  sourceScriptSha256: sourceScript.sha256,
  geometryModule: geometryModule.path,
  geometryModuleSha256: geometryModule.sha256,
  sourceSpec: sourceSpec.path,
  sourceSpecSha256: sourceSpec.sha256,
  sourceProvenance: corpusProvenanceRecord.path,
  sourceProvenanceSha256: corpusProvenanceRecord.sha256,
  preview: contactSheet.path,
  format: 'Seventeen unique firearm families; each has two first-person, three world and one independently exported drop optimized self-contained glTF 2.0 binary with Meshopt geometry, embedded WebP PBR textures, authored sockets and thirteen core action clips',
  modifications: 'Project-original platform-specific silhouettes, materials, reload components, optics and action motion authored in Blender from a checked-in deterministic specification. Real platform names are catalog labels only; no commercial-game geometry, textures, logos or extracted assets are used. Gameplay authority remains TypeScript-owned.',
  attributionRequired: false,
};
const existingIndex = assetManifest.assets.findIndex((entry) => entry.id === assetRecord.id);
if (existingIndex >= 0) assetManifest.assets[existingIndex] = assetRecord;
else assetManifest.assets.splice(4, 0, assetRecord);
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  releaseState: 'release-ready',
  assetFamilyId: spec.assetFamilyId,
  weapons: weaponEntries.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    firstPersonTriangles: entry.firstPersonGlbs.map((delivery) => delivery.triangles),
    worldTriangles: entry.worldGlbs.map((delivery) => delivery.triangles),
  })),
  independentBinaries: allBinaryHashes.length,
  corpusProvenance: corpusProvenanceRecord,
}, null, 2));
