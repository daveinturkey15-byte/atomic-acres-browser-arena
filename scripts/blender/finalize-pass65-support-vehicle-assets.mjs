import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditSupportVehicleGlb, pngDimensions, readGlb, SUPPORT_VEHICLE_SPECS } from '../qa/pass65-support-vehicle-glb.mjs';

const root = process.cwd();
const slash = (value) => value.replaceAll('\\', '/');
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const fileRecord = async (value, extra = {}) => Object.freeze({ path: slash(value), sha256: await sha256(value), ...extra });

async function auditedLods(family, files) {
  const records = [];
  const audits = [];
  for (const [lod, relative] of files.entries()) {
    const { bytes, json } = await readGlb(absolute(relative));
    const audit = auditSupportVehicleGlb(json, bytes.length, family, lod);
    if (audit.failures.length > 0) {
      throw new Error(`${family} LOD${lod} is not releasable:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
    }
    records.push(await fileRecord(relative, { lod, triangles: audit.triangles, bytes: audit.bytes }));
    audits.push({ lod, ...audit });
  }
  if (!audits.slice(1).every((audit, index) => audits[index].triangles > audit.triangles)) {
    throw new Error(`${family} LOD triangle counts must decrease strictly`);
  }
  if (new Set(records.map((record) => record.sha256)).size !== records.length) {
    throw new Error(`${family} LOD deliverables must have unique digests`);
  }
  return { records: Object.freeze(records), audits: Object.freeze(audits) };
}

async function pbrSet(prefix) {
  const result = {};
  for (const [key, suffix] of [['baseColor', 'albedo'], ['normal', 'normal'], ['orm', 'orm'], ['emissive', 'emissive']]) {
    const relative = `public/assets/original/textures/support/${prefix}-${suffix}.png`;
    const bytes = await readFile(absolute(relative));
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== 512 || dimensions.height !== 512) throw new Error(`${relative} must be 512x512`);
    result[key] = await fileRecord(relative, dimensions);
  }
  return Object.freeze(result);
}

async function reviewRecord(relative, cameraId, expectedWidth, expectedHeight) {
  const bytes = await readFile(absolute(relative));
  const dimensions = pngDimensions(bytes);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(`${relative} is ${dimensions.width}x${dimensions.height}, expected ${expectedWidth}x${expectedHeight}`);
  }
  return fileRecord(relative, { cameraId, ...dimensions });
}

const sourceScript = await fileRecord('scripts/blender/create-pass65-support-vehicles.py');
const chopperSourceBlend = await fileRecord('source-assets/blender/pass65-chopper-gunner.blend');
const aircraftSourceBlend = await fileRecord('source-assets/blender/pass65-support-aircraft-family.blend');

const chopper = await auditedLods('chopper', [0, 1, 2].map((lod) => `public/assets/original/models/support/pass65-chopper-gunner-lod${lod}.glb`));
const care = await auditedLods('care', [0, 1, 2].map((lod) => `public/assets/original/models/support/pass65-care-aircraft-lod${lod}.glb`));
const carpet = await auditedLods('carpet', [0, 1, 2].map((lod) => `public/assets/original/models/support/pass65-carpet-aircraft-lod${lod}.glb`));
const crate = await auditedLods('crate', [0, 1].map((lod) => `public/assets/original/models/support/pass65-care-crate-lod${lod}.glb`));
const chopperPbrMaps = await pbrSet('pass65-chopper');
const aircraftPbrMaps = await pbrSet('pass65-support-aircraft');

const chopperRenders = await Promise.all([
  reviewRecord('docs/assets/pass65-vehicles/chopper/pass65-chopper-exterior-front-quarter.png', 'exterior-front-quarter', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/chopper/pass65-chopper-rotor-gun-profile.png', 'rotor-gun-profile', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/chopper/pass65-chopper-rear-fuselage-quarter.png', 'rear-fuselage-quarter', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png', 'accepted-first-person-instruments', 960, 540),
]);
const chopperContactSheet = await reviewRecord(
  'docs/assets/pass65-vehicles/chopper/pass65-chopper-contact-sheet.png', 'accepted-contact-sheet', 1024, 1024,
);
const aircraftRenders = await Promise.all([
  reviewRecord('docs/assets/pass65-vehicles/aircraft/pass65-aircraft-care-front-quarter.png', 'care-front-quarter', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/aircraft/pass65-aircraft-care-cargo-parachute.png', 'care-cargo-parachute', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/aircraft/pass65-aircraft-carpet-front-quarter.png', 'carpet-front-quarter', 512, 512),
  reviewRecord('docs/assets/pass65-vehicles/aircraft/pass65-aircraft-carpet-bomb-bay.png', 'carpet-bomb-bay', 512, 512),
]);
const aircraftContactSheet = await reviewRecord(
  'docs/assets/pass65-vehicles/aircraft/pass65-aircraft-contact-sheet.png', 'aircraft-contact-sheet', 1024, 1024,
);

const compactAudit = (audits) => audits.map(({ failures: _failures, ...audit }) => audit);
const sharedBoundary = {
  creator: 'Atomic Acres project',
  owner: 'Atomic Acres project',
  created: '2026-07-26',
  license: 'Project-original; no third-party meshes or textures',
  blenderVersion: '5.1.2',
  generator: sourceScript,
  runtimeForwardAxis: '-Z',
  blenderAuthoringForwardAxis: '-Y converted to glTF -Z by Y-up export',
  presentationOnly: true,
};
const reproducibilityBoundary = {
  contract: 'semantic-and-decoded-visual',
  exactCandidateHashesPinned: true,
  byteIdentityAcrossBlenderExports: false,
  reason: 'Blender container, generated UV/index ordering and PNG encoding bytes can vary while audited scene semantics and decoded review pixels remain equivalent.',
};

const chopperProvenancePath = 'source-assets/blender/pass65-chopper-gunner.provenance.json';
const chopperProvenance = {
  schemaVersion: 1,
  id: 'chopper-gunner-vehicle-v1',
  title: 'Pass 65 Chopper Gunner authored vehicle and first-person cockpit',
  ...sharedBoundary,
  inspirationBoundary: 'Original stylized near-future support helicopter. No copied commercial-game geometry, texture, logo, HUD, animation, UI, or audio.',
  sourceBlend: chopperSourceBlend,
  sharedConsumers: ['menu-prerecorded-map-preview', 'ai-flown-chopper-gunner', 'player-optional-chopper-gunner'],
  worldGlbs: chopper.records,
  firstPersonGlb: chopper.records[0],
  pbrMaps: chopperPbrMaps,
  requiredNodes: SUPPORT_VEHICLE_SPECS.chopper.nodes,
  sockets: SUPPORT_VEHICLE_SPECS.chopper.sockets,
  animationClips: SUPPORT_VEHICLE_SPECS.chopper.actions,
  review: {
    acceptedFirstPersonFrame: chopperRenders[3],
    renders: chopperRenders,
    contactSheet: chopperContactSheet,
    acceptance: 'parent visual gate APPROVE after original-resolution rear-quarter and unobstructed 960x540 gunner-sightline inspection',
  },
  runtimeAudit: {
    lods: compactAudit(chopper.audits),
    compressedGeometry: 'EXT_meshopt_compression plus KHR_mesh_quantization',
    embeddedTextureDelivery: 'quality-100 EXT_texture_webp in each GLB; standalone project-owned PNG source maps retained',
    externalUris: 0,
  },
  authorityBoundary: 'Presentation only. Flight, targeting, damage, collision, duration, ownership and replication remain TypeScript authoritative.',
  determinism: { command: 'npm run author:blender-support-vehicles', cleanFactoryStartup: true, pythonHashSeed: 0 },
  reproducibility: reproducibilityBoundary,
};
await writeFile(absolute(chopperProvenancePath), `${JSON.stringify(chopperProvenance, null, 2)}\n`, 'utf8');
const chopperProvenanceRecord = await fileRecord(chopperProvenancePath);

const aircraftProvenancePath = 'source-assets/blender/pass65-support-aircraft-family.provenance.json';
const aircraftProvenance = {
  schemaVersion: 1,
  id: 'support-aircraft-family-v1',
  title: 'Pass 65 Care Package and Carpet Bomber support aircraft family',
  ...sharedBoundary,
  inspirationBoundary: 'Original stylized fixed-wing support family. No copied commercial-game geometry, texture, logo, animation, UI, or audio.',
  sourceBlend: aircraftSourceBlend,
  variants: {
    care: { worldGlbs: care.records, requiredNodes: SUPPORT_VEHICLE_SPECS.care.nodes, sockets: SUPPORT_VEHICLE_SPECS.care.sockets, animationClips: SUPPORT_VEHICLE_SPECS.care.actions },
    carpet: { worldGlbs: carpet.records, requiredNodes: SUPPORT_VEHICLE_SPECS.carpet.nodes, sockets: SUPPORT_VEHICLE_SPECS.carpet.sockets, animationClips: SUPPORT_VEHICLE_SPECS.carpet.actions },
    parachuteCrate: { worldGlbs: crate.records, requiredNodes: SUPPORT_VEHICLE_SPECS.crate.nodes, sockets: SUPPORT_VEHICLE_SPECS.crate.sockets, animationClips: SUPPORT_VEHICLE_SPECS.crate.actions },
  },
  pbrMaps: aircraftPbrMaps,
  review: { renders: aircraftRenders, contactSheet: aircraftContactSheet },
  runtimeAudit: {
    careLods: compactAudit(care.audits),
    carpetLods: compactAudit(carpet.audits),
    crateLods: compactAudit(crate.audits),
    compressedGeometry: 'EXT_meshopt_compression plus KHR_mesh_quantization',
    embeddedTextureDelivery: 'quality-100 EXT_texture_webp in each GLB; standalone project-owned PNG source maps retained',
    externalUris: 0,
  },
  authorityBoundary: 'Presentation only. Target markers, corridor ownership, flight, drops, impacts, damage, collision, interaction and replication remain TypeScript authoritative.',
  determinism: { command: 'npm run author:blender-support-vehicles', cleanFactoryStartup: true, pythonHashSeed: 0 },
  reproducibility: reproducibilityBoundary,
};
await writeFile(absolute(aircraftProvenancePath), `${JSON.stringify(aircraftProvenance, null, 2)}\n`, 'utf8');
const aircraftProvenanceRecord = await fileRecord(aircraftProvenancePath);

const productionManifestPath = absolute('source-assets/blender/pass65-weapon-production.manifest.json');
const productionManifest = JSON.parse(await readFile(productionManifestPath, 'utf8'));
const replaceSupport = (id, entry) => {
  const index = productionManifest.supportVehicles.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new Error(`Pass65 production manifest has no ${id} entry`);
  productionManifest.supportVehicles[index] = entry;
};
replaceSupport('chopper-gunner-vehicle-v1', {
  id: 'chopper-gunner-vehicle-v1', releaseState: 'release-ready', sourceKind: 'project-original-blender', owner: 'Atomic Acres project',
  qualityTier: 'hero-support-vehicle-and-first-person-cockpit', materialFamily: 'tactical-gunmetal-cyan-green-orange-pbr',
  textureDensity: '512px project-owned PBR map set', triangleRange: { lod0: [60_000, 80_000], lod1: [25_000, 40_000], lod2: [14_000, 25_000] },
  placeholderStatus: 'forbidden-and-not-present', sharedConsumers: chopperProvenance.sharedConsumers, runtimeForwardAxis: '-Z',
  sourceBlend: chopperSourceBlend, sourceScript, worldGlbs: chopper.records, firstPersonGlb: chopper.records[0], pbrMaps: chopperPbrMaps,
  provenance: chopperProvenanceRecord, sockets: SUPPORT_VEHICLE_SPECS.chopper.sockets,
  semanticNodes: SUPPORT_VEHICLE_SPECS.chopper.nodes, actions: SUPPORT_VEHICLE_SPECS.chopper.actions,
  review: { renders: chopperRenders, contactSheet: chopperContactSheet, acceptedFirstPersonFrame: chopperRenders[3] },
  technicalAudit: { lods: compactAudit(chopper.audits) },
});
replaceSupport('support-aircraft-family-v1', {
  id: 'support-aircraft-family-v1', releaseState: 'release-ready', sourceKind: 'project-original-blender', owner: 'Atomic Acres project',
  qualityTier: 'hero-support-aircraft-family', materialFamily: 'distinct-care-and-carpet-tactical-pbr',
  textureDensity: '512px shared project-owned PBR map set', placeholderStatus: 'forbidden-and-not-present', runtimeForwardAxis: '-Z',
  sourceBlend: aircraftSourceBlend, sourceScript, pbrMaps: aircraftPbrMaps, provenance: aircraftProvenanceRecord,
  variants: aircraftProvenance.variants, review: { renders: aircraftRenders, contactSheet: aircraftContactSheet },
  technicalAudit: { careLods: compactAudit(care.audits), carpetLods: compactAudit(carpet.audits), crateLods: compactAudit(crate.audits) },
});
await writeFile(productionManifestPath, `${JSON.stringify(productionManifest, null, 2)}\n`, 'utf8');

const assetManifestPath = absolute('assets.manifest.json');
const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
const upsertAsset = (entry) => {
  const index = assetManifest.assets.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) assetManifest.assets[index] = entry;
  else assetManifest.assets.splice(4, 0, entry);
};
upsertAsset({
  id: 'atomic-acres-pass65-chopper-gunner-2026-07-26', kind: 'original-project-blender-support-vehicle-family', creator: 'Atomic Acres project',
  source: sourceScript.path, generatedAsOf: '2026-07-26', license: 'Original project work',
  files: [...chopper.records, ...Object.values(chopperPbrMaps)], sourceBlend: chopperSourceBlend.path, sourceBlendSha256: chopperSourceBlend.sha256,
  sourceScript: sourceScript.path, sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: chopperProvenanceRecord.path, sourceProvenanceSha256: chopperProvenanceRecord.sha256,
  preview: chopperContactSheet.path,
  format: 'Three strict decreasing optimized self-contained glTF 2.0 binary LODs with embedded WebP PBR maps, complete rear fuselage/tail, authored unobstructed gunner sightline/HUD/weapon view, exterior rotors/gun/sockets and eight animation clips',
  modifications: 'Project-original support helicopter with substantial rear cabin and tail volume plus a possessed-view-only gunner sightline that excludes exterior shell and rotors. Runtime gameplay authority remains TypeScript-owned; procedural geometry is non-release fallback only.',
  attributionRequired: false,
});
upsertAsset({
  id: 'atomic-acres-pass65-support-aircraft-family-2026-07-26', kind: 'original-project-blender-support-aircraft-family', creator: 'Atomic Acres project',
  source: sourceScript.path, generatedAsOf: '2026-07-26', license: 'Original project work',
  files: [...care.records, ...carpet.records, ...crate.records, ...Object.values(aircraftPbrMaps)], sourceBlend: aircraftSourceBlend.path, sourceBlendSha256: aircraftSourceBlend.sha256,
  sourceScript: sourceScript.path, sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: aircraftProvenanceRecord.path, sourceProvenanceSha256: aircraftProvenanceRecord.sha256,
  preview: aircraftContactSheet.path,
  format: 'Distinct Care transport and Carpet bomber three-LOD GLBs plus two-LOD parachute crate, embedded WebP PBR maps, semantic cargo/bomb sockets and authored actions',
  modifications: 'Project-original fixed-wing support family with correct local -Z forward contract, animated propellers/engines/doors/bay/racks and a visible parachute crate. Runtime gameplay authority remains TypeScript-owned.',
  attributionRequired: false,
});
await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  releaseState: 'release-ready',
  chopper: { sourceBlend: chopperSourceBlend.sha256, provenance: chopperProvenanceRecord.sha256, lods: chopper.records },
  aircraft: { sourceBlend: aircraftSourceBlend.sha256, provenance: aircraftProvenanceRecord.sha256, care: care.records, carpet: carpet.records, crate: crate.records },
}, null, 2));
