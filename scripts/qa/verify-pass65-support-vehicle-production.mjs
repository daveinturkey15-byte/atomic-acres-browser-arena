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
const expectedRefinementContracts = Object.freeze({
  chopper: Object.freeze({
    visualRevision: 'pass70-complete-tandem-attack-airframe-v5',
    detailContract: 'complete-exterior-cockpit-gun-readable-materials-v5',
    materialRevision: 'pass70-daylight-readable-olive-pbr-v1',
  }),
  care: Object.freeze({
    visualRevision: 'close-range-heavy-cargo-aircraft-v4',
    detailContract: 'framed-flightdeck-panelled-hull-ramp-bogie-turbofans-v4',
    materialRevision: 'separated-daylight-readable-pbr-v1',
  }),
  carpet: Object.freeze({
    visualRevision: 'close-range-stealth-flying-wing-v4',
    detailContract: 'framed-intakes-service-panels-bay-structure-tailless-v4',
    materialRevision: 'separated-daylight-readable-pbr-v1',
  }),
  parachuteCrate: Object.freeze({
    visualRevision: 'close-range-rigged-pallet-drop-v4',
    detailContract: 'corner-guards-buckles-latches-crossweb-ribbed-canopy-v4',
  }),
});

for (const [label, entry] of [['chopper', chopperEntry], ['aircraft', aircraftEntry]]) {
  if (entry.releaseState !== 'release-ready') failures.push(`${label}: releaseState is ${entry.releaseState ?? '<missing>'}`);
  if (entry.placeholderStatus !== 'forbidden-and-not-present') failures.push(`${label}: placeholder policy is not fail closed`);
  if (entry.sourceKind !== 'project-original-blender') failures.push(`${label}: source kind is not project-original Blender`);
  if (entry.runtimeForwardAxis !== '-Z') failures.push(`${label}: runtime forward axis is not -Z`);
  await verifyRecord(entry.sourceScript, `${label} source script`);
}
if (chopperEntry.visualRevision !== expectedRefinementContracts.chopper.visualRevision
  || chopperEntry.detailContract !== expectedRefinementContracts.chopper.detailContract
  || chopperEntry.materialRevision !== expectedRefinementContracts.chopper.materialRevision) {
  failures.push('chopper: production manifest does not pin the Pass 70 complete authored vehicle/material refinement');
}
for (const [variant, expected] of Object.entries(expectedRefinementContracts)) {
  if (variant === 'chopper') continue;
  const entry = aircraftEntry.variants?.[variant];
  if (entry?.visualRevision !== expected.visualRevision || entry?.detailContract !== expected.detailContract
    || (expected.materialRevision && entry?.materialRevision !== expected.materialRevision)) {
    failures.push(`${variant}: production manifest does not pin the expected v4 close-range refinement`);
  }
  if (!entry?.triangleRange || Object.keys(entry.triangleRange).length !== entry?.worldGlbs?.length) {
    failures.push(`${variant}: production manifest lacks per-LOD authored triangle ranges`);
  }
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
  const chopperBlendExpression = [
    'import bpy',
    "roots=[o for o in bpy.data.objects if o.get('asset_id')=='chopper-gunner-vehicle-v1']",
    'assert len(roots)==3',
    "required={'chopper-rear-fuselage','chopper-tail-boom','chopper-tail-fin','chopper-first-person-cockpit','chopper-gunner-sightline','chopper-gunner-weapon-view','chopper-nose-sensor'}",
    "assert all(required.issubset({c.get('canonical_node_name') for c in r.children_recursive}) for r in roots)",
    "assert all(r.get('visual_revision')=='pass70-complete-tandem-attack-airframe-v5' and r.get('detail_contract')=='complete-exterior-cockpit-gun-readable-materials-v5' and r.get('material_revision')=='pass70-daylight-readable-olive-pbr-v1' for r in roots)",
    "names=lambda r:[str(c.get('canonical_node_name','')) for c in r.children_recursive]",
    "count=lambda r,prefix:sum(n.startswith(prefix) for n in names(r))",
    "lod0=next(r for r in roots if r.get('quality_tier')=='LOD0')",
    "assert count(lod0,'Chopper_OverlappingArmorPlate_')>=8 and count(lod0,'Chopper_ArmorFastener_')>=16 and count(lod0,'Chopper_CanopyArmourBrow_')>=2 and count(lod0,'Chopper_CanopyRoofArmor_')>=1",
    "assert all(count(r,'Chopper_MainBladeGrip_')==4 and count(r,'Chopper_TailBladeGrip_')==4 for r in roots)",
    "assert all(not any(c.get('canonical_node_name')=='chopper-first-person-rotor' for c in r.children_recursive) for r in roots)",
    'assert len(bpy.data.actions)>=24',
    'assert len([i for i in bpy.data.images if i.packed_file])>=4',
  ].join('; ');
  const aircraftBlendExpression = [
    'import bpy',
    "roots=[o for o in bpy.data.objects if o.get('asset_id')=='support-aircraft-family-v1']",
    "care=[o for o in roots if o.get('presentation_variant')=='care']",
    "carpet=[o for o in roots if o.get('presentation_variant')=='carpet']",
    "crate=[o for o in roots if o.get('presentation_variant')=='parachute-crate']",
    'assert len(roots)==8 and len(care)==3 and len(carpet)==3 and len(crate)==2',
    "assert all(r.get('visual_revision')=='close-range-heavy-cargo-aircraft-v4' and r.get('detail_contract')=='framed-flightdeck-panelled-hull-ramp-bogie-turbofans-v4' and r.get('material_revision')=='separated-daylight-readable-pbr-v1' for r in care)",
    "assert all(r.get('visual_revision')=='close-range-stealth-flying-wing-v4' and r.get('detail_contract')=='framed-intakes-service-panels-bay-structure-tailless-v4' and r.get('material_revision')=='separated-daylight-readable-pbr-v1' for r in carpet)",
    "assert all(r.get('visual_revision')=='close-range-rigged-pallet-drop-v4' and r.get('detail_contract')=='corner-guards-buckles-latches-crossweb-ribbed-canopy-v4' for r in crate)",
    "names=lambda r:[str(c.get('canonical_node_name','')) for c in r.children_recursive]",
    "count=lambda r,prefix:sum(n.startswith(prefix) for n in names(r))",
    "care0=next(r for r in care if r.get('quality_tier')=='LOD0')",
    "carpet0=next(r for r in carpet if r.get('quality_tier')=='LOD0')",
    "crate0=next(r for r in crate if r.get('quality_tier')=='LOD0')",
    "assert count(care0,'Care_FlightDeckFastener_')>=6 and count(care0,'Care_FlightDeckFrontPane_')>=4 and count(care0,'Care_FuselageServiceHatch_')>=6 and count(care0,'Care_MainWheelHub_')>=6 and count(care0,'Care_RampCrossRib_')>=3 and count(care0,'Care_RearApertureFrame_')>=2",
    "assert count(carpet0,'Carpet_WingServicePanel_')>=6 and count(carpet0,'Carpet_IntakeFrame_')>=8 and count(carpet0,'Carpet_BombBayCrossFrame_')>=4",
    "assert count(crate0,'Care_CrateLatch_')>=4 and count(crate0,'Care_PalletTieDownCleat_')>=4",
    "assert all(not any(n.startswith(('Carpet_TailFin_','Carpet_TailPlane_')) for n in names(r)) for r in carpet)",
    "required_materials={'MAT_Pass65CareAircraft_Underside','MAT_Pass65CareAircraft_LeadingEdge','MAT_Pass65CareAircraft_Tail','MAT_Pass65CareAircraft_EngineNacelle','MAT_Pass65CarpetAircraft_Underside','MAT_Pass65CarpetAircraft_LeadingEdge'}",
    "assert required_materials.issubset(set(bpy.data.materials.keys()))",
    "image=lambda name:bpy.data.images.get(name)",
    "mean=lambda img,channel:sum(img.pixels[channel::4])/(len(img.pixels)//4)",
    "care_albedo=image('pass65-care-aircraft_Albedo')",
    "carpet_albedo=image('pass65-carpet-aircraft_Albedo')",
    "care_orm=image('pass65-care-aircraft_Orm')",
    "carpet_orm=image('pass65-carpet-aircraft_Orm')",
    "assert all((care_albedo,carpet_albedo,care_orm,carpet_orm))",
    "assert mean(care_albedo,0)>0.43 and mean(carpet_albedo,0)>0.38 and mean(care_albedo,0)>mean(carpet_albedo,0)+0.03",
    "assert mean(care_orm,1)>0.64 and mean(carpet_orm,1)>0.68 and mean(care_orm,2)<0.12 and mean(carpet_orm,2)<0.08",
    'assert len(bpy.data.actions)>=32',
    'assert len([i for i in bpy.data.images if i.packed_file])>=12',
  ].join('; ');
  const blendAudits = [
    [chopperEntry.sourceBlend.path, chopperBlendExpression],
    [aircraftEntry.sourceBlend.path, aircraftBlendExpression],
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
await verifyPbrMaps('care aircraft', aircraftEntry.pbrMaps?.care);
await verifyPbrMaps('carpet aircraft', aircraftEntry.pbrMaps?.carpet);
await verifyPbrMaps('parachute crate', aircraftEntry.pbrMaps?.parachuteCrate);
if (aircraftEntry.pbrMaps?.care?.baseColor?.sha256 === aircraftEntry.pbrMaps?.carpet?.baseColor?.sha256
  || aircraftEntry.pbrMaps?.care?.orm?.sha256 === aircraftEntry.pbrMaps?.carpet?.orm?.sha256) {
  failures.push('care/carpet aircraft must not share albedo or ORM texture digests');
}

async function verifyReview(label, review, expectedRenderCount, sheetWidth, sheetHeight, requiresAcceptedFrame = false) {
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
    if (dimensions.width !== sheetWidth || dimensions.height !== sheetHeight || sheetBytes.length < 300_000) failures.push(`${label}: contact sheet is invalid or trivial`);
  }
  if (requiresAcceptedFrame) {
    if (review.acceptedFirstPersonFrame?.cameraId !== 'accepted-first-person-instruments'
      || review.acceptedFirstPersonFrame?.width !== 960 || review.acceptedFirstPersonFrame?.height !== 540
      || !review.renders.some((record) => record.sha256 === review.acceptedFirstPersonFrame.sha256)) {
      failures.push('chopper: accepted 960x540 first-person frame is not pinned inside the review set');
    }
  }
}
await verifyReview('chopper', chopperEntry.review, 6, 1536, 1024, true);
await verifyReview('aircraft', aircraftEntry.review, 9, 1536, 1536);

const chopperProvenanceBytes = await verifyRecord(chopperEntry.provenance, 'chopper provenance');
const aircraftProvenanceBytes = await verifyRecord(aircraftEntry.provenance, 'aircraft provenance');
if (chopperProvenanceBytes) {
  const provenance = JSON.parse(chopperProvenanceBytes.toString('utf8'));
  if (provenance.id !== chopperEntry.id || provenance.runtimeForwardAxis !== '-Z') failures.push('chopper provenance identity/axis mismatch');
  if (provenance.blenderAuthoringForwardAxis !== '+Y converted to glTF -Z by Y-up export') failures.push('chopper provenance authoring-axis contract mismatch');
  if (provenance.visualRevision !== expectedRefinementContracts.chopper.visualRevision
    || provenance.detailContract !== expectedRefinementContracts.chopper.detailContract) {
    failures.push('chopper provenance refinement contract drift');
  }
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
  if (provenance.blenderAuthoringForwardAxis !== '+Y converted to glTF -Z by Y-up export') failures.push('aircraft provenance authoring-axis contract mismatch');
  for (const [variant, expected] of Object.entries(expectedRefinementContracts)) {
    if (variant === 'chopper') continue;
    if (provenance.variants?.[variant]?.visualRevision !== expected.visualRevision
      || provenance.variants?.[variant]?.detailContract !== expected.detailContract
      || (expected.materialRevision && provenance.variants?.[variant]?.materialRevision !== expected.materialRevision)) {
      failures.push(`${variant}: aircraft provenance refinement contract drift`);
    }
  }
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
  'isGunnerCockpitNode',
  "level.getObjectByName('chopper-first-person-cockpit')",
  'node.visible = gunnerCockpitNode && !retiredStaticSource',
]) if (!presentationSource.includes(token)) failures.push(`runtime lazy-cache/prewarm boundary missing: ${token}`);
if (presentationSource.includes("getObjectByName('chopper-first-person-rotor')")) failures.push('possessed chopper still admits a first-person rotor into the runtime sightline');
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
