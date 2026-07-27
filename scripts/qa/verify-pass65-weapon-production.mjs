import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  auditCrossbowGlb,
  auditOperatorArmsGlb,
  OPERATOR_ARMS_RENDER_BUDGET,
  readGlb,
} from './pass65-crossbow-arms-glb.mjs';
import { auditWeaponFamilyGlb } from './pass65-weapon-family-glb.mjs';
import {
  auditFieldKnifeGlb,
  REQUIRED_FIELD_KNIFE_ACTIONS,
  REQUIRED_FIELD_KNIFE_NODES,
} from './pass65-field-knife-glb.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'source-assets/blender/pass65-weapon-production.manifest.json');
const familySpecPath = path.join(root, 'source-assets/blender/pass65-weapon-family-specs.json');
const requiredWeaponIds = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'flashlight-pistol', 'explosive-crossbow',
]);
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const failures = [];
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const familySpec = JSON.parse(await readFile(familySpecPath, 'utf8'));
const familySpecById = new Map(familySpec.weapons.map((weapon) => [weapon.id, weapon]));
const familyDeliveryByVariant = new Map(familySpec.deliveries.map((delivery) => [delivery.variant, delivery]));
const familyHeroSilhouettes = new Set();
const familyAnimationSignatures = new Set();
const familyPlatformAnatomies = new Set();
const familyBinaryHashes = [];

if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (manifest.releaseGate !== 'fail-closed-until-every-entry-is-release-ready') failures.push('releaseGate must remain fail closed');
if (!Array.isArray(manifest.weapons)) failures.push('weapons must be an array');

const entries = Array.isArray(manifest.weapons) ? manifest.weapons : [];
const ids = entries.map((entry) => entry.id);
if (new Set(ids).size !== ids.length) failures.push('weapon IDs must be unique');
for (const required of requiredWeaponIds) if (!ids.includes(required)) failures.push(`missing weapon entry: ${required}`);
for (const id of ids) if (!requiredWeaponIds.includes(id)) failures.push(`unknown weapon entry: ${id}`);

const requiredPaths = ['sourceBlend', 'firstPersonGlbs', 'worldGlbs', 'pbrMaps', 'provenance'];
const readyAssetPaths = [];
const queueDeliverable = (id, deliverable) => {
  if (typeof deliverable?.path === 'string') readyAssetPaths.push({ id, ...deliverable });
};
for (const entry of entries) {
  if (entry.releaseState !== 'release-ready') {
    failures.push(`${entry.id}: ${entry.releaseState ?? 'missing-state'} - ${(entry.blockers ?? ['unspecified blocker']).join('; ')}`);
    continue;
  }
  for (const field of requiredPaths) if (entry[field] === undefined) failures.push(`${entry.id}: release-ready entry missing ${field}`);
  if ((entry.firstPersonGlbs ?? []).length < manifest.requirements.firstPersonLodCount) failures.push(`${entry.id}: insufficient first-person LODs`);
  if ((entry.worldGlbs ?? []).length < manifest.requirements.worldLodCount) failures.push(`${entry.id}: insufficient world LODs`);
  if ((entry.dropGlbs ?? []).length < (manifest.requirements.dropLodCount ?? 1)) failures.push(`${entry.id}: dedicated drop delivery missing`);
  for (const map of manifest.requiredPbrMaps) if (!entry.pbrMaps?.[map]) failures.push(`${entry.id}: missing ${map} PBR map`);
  for (const socket of manifest.requiredSockets) if (!entry.sockets?.includes(socket)) failures.push(`${entry.id}: missing ${socket} socket`);
  for (const action of manifest.requiredCoreActions) if (!entry.actions?.includes(action)) failures.push(`${entry.id}: missing ${action} action`);
  for (const deliverable of [entry.sourceBlend, entry.sourceScript, entry.sourceSpec, entry.provenance,
    ...(entry.firstPersonGlbs ?? []), ...(entry.worldGlbs ?? []), ...(entry.dropGlbs ?? []),
    ...Object.values(entry.pbrMaps ?? {})]) queueDeliverable(entry.id, deliverable);

  if (entry.id === 'explosive-crossbow') {
    const deliveries = [...(entry.firstPersonGlbs ?? []), ...(entry.worldGlbs ?? []), ...(entry.dropGlbs ?? [])];
    for (const deliverable of deliveries) {
      try {
        const absolute = path.join(root, deliverable.path);
        const { bytes, json } = await readGlb(absolute);
        const audit = auditCrossbowGlb(json, deliverable.variant, bytes.length);
        for (const failure of audit.failures) failures.push(failure);
        if (audit.triangles !== deliverable.triangles) failures.push(`${entry.id}: triangle receipt mismatch: ${deliverable.path}`);
      } catch (error) {
        failures.push(`${entry.id}: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fp = entry.firstPersonGlbs ?? [];
    const world = entry.worldGlbs ?? [];
    if (fp.length >= 2 && !(fp[0].triangles > fp[1].triangles)) failures.push(`${entry.id}: first-person LODs must decrease strictly`);
    if (world.length >= 3 && !(world[0].triangles > world[1].triangles && world[1].triangles > world[2].triangles)) {
      failures.push(`${entry.id}: world LODs must decrease strictly`);
    }
  } else {
    const weaponSpec = familySpecById.get(entry.id);
    if (!weaponSpec) {
      failures.push(`${entry.id}: checked-in Blender family specification missing`);
      continue;
    }
    if (entry.displayName !== weaponSpec.displayName || entry.designId !== weaponSpec.designId
      || entry.silhouetteFamily !== weaponSpec.family) {
      failures.push(`${entry.id}: production identity differs from Blender family specification`);
    }
    if (entry.runtimeIntegrationState !== 'bounded-lazy-runtime-selection') {
      failures.push(`${entry.id}: runtime integration must use bounded lazy authored-asset selection`);
    }
    const expectedVisualRevision = entry.id === 'm4a1' ? 'm4a1-production-hero-v3' : 'platform-production-hero-v4';
    const expectedMaterialLanguage = entry.id === 'm4a1' ? 'm4a1-anodized-metal-polymer-pbr-v3' : 'platform-authentic-metal-polymer-pbr-v4';
    if (entry.visualRevision !== expectedVisualRevision) {
      failures.push(`${entry.id}: visualRevision must be ${expectedVisualRevision}`);
    }
    if (entry.materialLanguage !== expectedMaterialLanguage) {
      failures.push(`${entry.id}: materialLanguage must be ${expectedMaterialLanguage}`);
    }
    for (const map of ['polymerBaseColor', 'polymerRoughness', 'polymerMetallic']) {
      if (!entry.pbrMaps?.[map]) failures.push(`${entry.id}: missing independent ${map} PBR map`);
    }
    for (const [cameraId, evidenceRole] of Object.entries({
      'hero-quarter': 'first-person-neutral',
      'side-silhouette': 'first-person-side-silhouette',
      'sight-line': 'first-person-ads',
      'reload-action': 'first-person-reload',
      'world-lod0-silhouette': 'world-near-silhouette',
      'world-lod2-silhouette': 'world-far-lod-silhouette',
      'drop-lod0-silhouette': 'drop-silhouette',
    })) {
      if (!entry.review?.renders?.some((render) => render.cameraId === cameraId && render.evidenceRole === evidenceRole)) {
        failures.push(`${entry.id}: required ${cameraId}/${evidenceRole} firearm review frame missing`);
      }
    }
    const expectedRuntimeSource = `public/assets/original/models/weapons/pass65-firearms/${entry.id}/${entry.id}-fp-lod0.glb`;
    if (entry.currentRuntimeSource !== expectedRuntimeSource) {
      failures.push(`${entry.id}: current runtime source must be ${expectedRuntimeSource}`);
    }
    for (const field of ['sourceScript', 'sourceSpec']) {
      if (entry[field] === undefined) failures.push(`${entry.id}: release-ready entry missing ${field}`);
    }
    for (const signature of weaponSpec.signatureNodes) {
      if (!entry.semanticNodes?.includes(signature)) failures.push(`${entry.id}: manifest missing signature node ${signature}`);
    }
    const deliveries = [...(entry.firstPersonGlbs ?? []), ...(entry.worldGlbs ?? []), ...(entry.dropGlbs ?? [])];
    for (const deliverable of deliveries) {
      const delivery = familyDeliveryByVariant.get(deliverable.variant);
      if (!delivery) {
        failures.push(`${entry.id}: unknown delivery variant ${deliverable.variant ?? '<missing>'}`);
        continue;
      }
      try {
        const absolute = path.join(root, deliverable.path);
        const { bytes, json, binary } = await readGlb(absolute);
        const audit = auditWeaponFamilyGlb(json, weaponSpec, delivery, bytes.length, binary);
        for (const failure of audit.failures) failures.push(failure);
        if (audit.triangles !== deliverable.triangles) failures.push(`${entry.id}: triangle receipt mismatch: ${deliverable.path}`);
        if (audit.meshNodes !== deliverable.meshNodes) failures.push(`${entry.id}: mesh-node receipt mismatch: ${deliverable.path}`);
        if (audit.renderPrimitives !== deliverable.renderPrimitives) failures.push(`${entry.id}: render-primitive receipt mismatch: ${deliverable.path}`);
        familyBinaryHashes.push(deliverable.sha256);
        if (delivery.variant === 'first-person-lod0') {
          if (familyHeroSilhouettes.has(audit.silhouetteSignature)) failures.push(`${entry.id}: duplicate hero silhouette receipt`);
          familyHeroSilhouettes.add(audit.silhouetteSignature);
          if (familyAnimationSignatures.has(audit.animationSignature)) failures.push(`${entry.id}: duplicate hero animation motion receipt`);
          familyAnimationSignatures.add(audit.animationSignature);
          if (familyPlatformAnatomies.has(audit.platformAnatomy)) failures.push(`${entry.id}: duplicate platform anatomy receipt`);
          familyPlatformAnatomies.add(audit.platformAnatomy);
          if (entry.platformAnatomy !== audit.platformAnatomy) failures.push(`${entry.id}: platform anatomy manifest receipt mismatch`);
        }
      } catch (error) {
        failures.push(`${entry.id}: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fp = entry.firstPersonGlbs ?? [];
    const world = entry.worldGlbs ?? [];
    if (fp.length >= 2 && !(fp[0].triangles > fp[1].triangles)) failures.push(`${entry.id}: first-person LODs must decrease strictly`);
    if (world.length >= 3 && !(world[0].triangles > world[1].triangles && world[1].triangles > world[2].triangles)) {
      failures.push(`${entry.id}: world LODs must decrease strictly`);
    }
  }
}

const authoredFamilyCount = requiredWeaponIds.length - 1;
if (familySpec.weapons.length !== authoredFamilyCount || familySpecById.size !== authoredFamilyCount) {
  failures.push(`Blender family specification must contain ${authoredFamilyCount} unique weapons`);
}
if (familyHeroSilhouettes.size !== authoredFamilyCount) failures.push(`unique hero silhouette receipts: ${familyHeroSilhouettes.size}/${authoredFamilyCount}`);
if (familyAnimationSignatures.size !== authoredFamilyCount) failures.push(`unique hero animation motion receipts: ${familyAnimationSignatures.size}/${authoredFamilyCount}`);
if (familyPlatformAnatomies.size !== authoredFamilyCount) failures.push(`unique platform anatomy receipts: ${familyPlatformAnatomies.size}/${authoredFamilyCount}`);
if (familyBinaryHashes.length !== authoredFamilyCount * familySpec.deliveries.length
  || new Set(familyBinaryHashes).size !== familyBinaryHashes.length) {
  failures.push(`independent firearm delivery hashes: ${new Set(familyBinaryHashes).size}/${authoredFamilyCount * familySpec.deliveries.length}`);
}

const meleeWeapons = Array.isArray(manifest.meleeWeapons) ? manifest.meleeWeapons : [];
if (meleeWeapons.length !== 1 || meleeWeapons[0]?.id !== 'field-knife') {
  failures.push('melee weapon manifest must contain exactly one field-knife production entry');
} else {
  const knife = meleeWeapons[0];
  if (knife.releaseState !== 'release-ready') {
    failures.push(`field-knife: ${knife.releaseState ?? 'missing-state'} - ${(knife.blockers ?? ['unspecified blocker']).join('; ')}`);
  } else {
    for (const field of ['sourceBlend', 'sourceScript', 'provenance', 'firstPersonGlbs', 'worldGlbs', 'dropGlbs', 'pbrMaps']) {
      if (knife[field] === undefined) failures.push(`field-knife: release-ready entry missing ${field}`);
    }
    if (knife.runtimeIntegrationState !== 'bounded-lazy-runtime-selection') {
      failures.push('field-knife: runtime integration must use bounded lazy authored-asset selection');
    }
    const expectedKnifeRuntimeSource = 'public/assets/original/models/weapons/pass65-field-knife/pass65-field-knife-fp-lod0.glb';
    if (knife.currentRuntimeSource !== expectedKnifeRuntimeSource) {
      failures.push(`field-knife: current runtime source must be ${expectedKnifeRuntimeSource}`);
    }
    if ((knife.firstPersonGlbs ?? []).length < (manifest.requirements.meleeFirstPersonLodCount ?? 2)) failures.push('field-knife: insufficient first-person LODs');
    if ((knife.worldGlbs ?? []).length < (manifest.requirements.meleeWorldLodCount ?? 2)) failures.push('field-knife: insufficient world LODs');
    if ((knife.dropGlbs ?? []).length < (manifest.requirements.dropLodCount ?? 1)) failures.push('field-knife: dedicated drop delivery missing');
    for (const map of manifest.requiredPbrMaps) if (!knife.pbrMaps?.[map]) failures.push(`field-knife: missing ${map} PBR map`);
    for (const action of REQUIRED_FIELD_KNIFE_ACTIONS) if (!knife.actions?.includes(action)) failures.push(`field-knife: missing ${action} action`);
    for (const node of REQUIRED_FIELD_KNIFE_NODES) if (!knife.semanticNodes?.includes(node)) failures.push(`field-knife: missing semantic node ${node}`);
    const knifeDeliveries = [...(knife.firstPersonGlbs ?? []), ...(knife.worldGlbs ?? []), ...(knife.dropGlbs ?? [])];
    for (const deliverable of [knife.sourceBlend, knife.sourceScript, knife.provenance, ...knifeDeliveries, ...Object.values(knife.pbrMaps ?? {})]) {
      queueDeliverable('field-knife', deliverable);
    }
    const knifeHashes = [];
    for (const deliverable of knifeDeliveries) {
      try {
        const absolute = path.join(root, deliverable.path);
        const { bytes, json } = await readGlb(absolute);
        const audit = auditFieldKnifeGlb(json, deliverable.variant, bytes.length);
        for (const failure of audit.failures) failures.push(failure);
        if (audit.triangles !== deliverable.triangles) failures.push(`field-knife: triangle receipt mismatch: ${deliverable.path}`);
        if (audit.meshNodes !== deliverable.meshNodes) failures.push(`field-knife: mesh-node receipt mismatch: ${deliverable.path}`);
        knifeHashes.push(deliverable.sha256);
      } catch (error) {
        failures.push(`field-knife: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (new Set(knifeHashes).size !== knifeDeliveries.length) failures.push('field-knife: delivery binaries must have distinct digests');
    const fp = knife.firstPersonGlbs ?? [];
    const world = knife.worldGlbs ?? [];
    if (fp.length >= 2 && !(fp[0].triangles > fp[1].triangles)) failures.push('field-knife: first-person LODs must decrease strictly');
    if (world.length >= 2 && !(world[0].triangles > world[1].triangles)) failures.push('field-knife: world LODs must decrease strictly');
  }
}

if (manifest.operatorArms?.releaseState !== 'release-ready') {
  failures.push(`operator arms: ${manifest.operatorArms?.releaseState ?? 'missing-state'} - ${(manifest.operatorArms?.blockers ?? []).join('; ')}`);
} else {
  const arms = manifest.operatorArms;
  for (const field of ['sourceBlend', 'firstPersonGlbs', 'pbrMaps', 'provenance']) {
    if (arms[field] === undefined) failures.push(`operator arms: release-ready entry missing ${field}`);
  }
  if ((arms.firstPersonGlbs ?? []).length < manifest.requirements.firstPersonLodCount) failures.push('operator arms: insufficient first-person LODs');
  for (const map of manifest.requiredPbrMaps) if (!arms.pbrMaps?.[map]) failures.push(`operator arms: missing ${map} PBR map`);
  for (const bone of ['UpperArmR', 'LowerArmR', 'WristR', 'UpperArmL', 'LowerArmL', 'WristL']) {
    if (!arms.bones?.includes(bone)) failures.push(`operator arms: missing ${bone} bone`);
  }
  for (const action of manifest.requiredCoreActions) if (!arms.actions?.includes(action)) failures.push(`operator arms: missing ${action} action`);
  for (const [field, expected] of Object.entries(OPERATOR_ARMS_RENDER_BUDGET)) {
    if (arms.renderBudget?.[field] !== expected) failures.push(`operator arms: render budget ${field} must equal ${expected}`);
  }
  for (const [field, expected] of Object.entries({
    visualRevision: 'human-anatomy-m4-contact-v4',
    limbProfileContract: 'human-deltoid-brachioradialis-ulna-wrist-taper-v4',
    handPoseContract: 'separate-palm-thumb-index-resting-digit-grip-v4',
    shoulderEntryContract: 'tapered-offscreen-sleeve',
    gloveConstructionContract: 'opaque-articulated-knuckle-pads-seams-cloth-v4',
    weaponGripReviewContract: 'm4a1-neutral-ads-reload-contact-v4',
    fingerSegmentCount: 30,
    weaponGripReviewFrames: 3,
  })) {
    if (arms[field] !== expected) failures.push(`operator arms: ${field} must equal ${expected}`);
  }
  for (const cameraId of [
    'neutral-front', 'forearm-wrist-quarter', 'hand-anatomy-closeup',
    'm4a1-neutral-contact', 'm4a1-ads-contact', 'm4a1-reload-contact',
  ]) {
    if (!arms.review?.renders?.some((render) => render.cameraId === cameraId)) {
      failures.push(`operator arms: required ${cameraId} review frame missing`);
    }
  }
  for (const deliverable of [arms.sourceBlend, arms.sourceScript, arms.provenance,
    ...(arms.firstPersonGlbs ?? []), ...Object.values(arms.pbrMaps ?? {})]) queueDeliverable('operator arms', deliverable);
  for (const deliverable of arms.firstPersonGlbs ?? []) {
    try {
      const absolute = path.join(root, deliverable.path);
      const { bytes, json } = await readGlb(absolute);
      const audit = auditOperatorArmsGlb(json, deliverable.lod, bytes.length);
      for (const failure of audit.failures) failures.push(failure);
      if (audit.triangles !== deliverable.triangles) failures.push(`operator arms: triangle receipt mismatch: ${deliverable.path}`);
      for (const field of ['skinnedMeshNodes', 'renderPrimitives', 'skins', 'sourceWeightedParts', 'bones']) {
        if (audit[field] !== deliverable[field]) failures.push(`operator arms: ${field} receipt mismatch: ${deliverable.path}`);
      }
    } catch (error) {
      failures.push(`operator arms: structural audit failed: ${deliverable.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const lods = arms.firstPersonGlbs ?? [];
  if (lods.length >= 2 && !(lods[0].triangles > lods[1].triangles)) failures.push('operator arms: LODs must decrease strictly');
}
for (const vehicle of manifest.supportVehicles ?? []) {
  if (vehicle.releaseState !== 'release-ready') {
    failures.push(`${vehicle.id}: ${vehicle.releaseState ?? 'missing-state'} - ${(vehicle.blockers ?? ['unspecified blocker']).join('; ')}`);
  }
}

for (const deliverable of readyAssetPaths) {
  const absolute = path.join(root, deliverable.path);
  try {
    if (!(await stat(absolute)).isFile()) failures.push(`${deliverable.id}: not a file: ${deliverable.path}`);
    if (!/^[a-f0-9]{64}$/.test(deliverable.sha256 ?? '')) failures.push(`${deliverable.id}: missing sha256: ${deliverable.path}`);
    else if (await sha256(absolute) !== deliverable.sha256) failures.push(`${deliverable.id}: digest mismatch: ${deliverable.path}`);
  } catch {
    failures.push(`${deliverable.id}: missing deliverable: ${deliverable.path}`);
  }
}

if (failures.length > 0) {
  console.error(`Pass 65 weapon/arms production gate BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Pass 65 weapon/arms production gate passed: ${entries.length} distinct weapons plus authored operator arms are release-ready.`);
