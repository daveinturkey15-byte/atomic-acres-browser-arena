import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';
import { pngDimensions } from './hunter-drone-glb.mjs';
import { auditWeaponFamilyGlb, readGlb } from './pass65-weapon-family-glb.mjs';

const root = process.cwd();
const absolute = (value) => path.join(root, value);
const slash = (value) => value.replaceAll('\\', '/');
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileRecord = async (value) => {
  const bytes = await readFile(absolute(value));
  return { path: slash(value), sha256: sha256Bytes(bytes), bytes: bytes.length };
};

const specPath = 'source-assets/blender/pass65-weapon-family-specs.json';
const spec = JSON.parse(await readFile(absolute(specPath), 'utf8'));
const failures = [];
const weapons = [];
let glbs = 0;
let triangles = 0;
let bytes = 0;
let maximumFirstPersonPrimitives = 0;
let maximumWorldPrimitives = 0;
let maximumDropPrimitives = 0;

for (const weapon of spec.weapons) {
  const deliveries = [];
  let platformAnatomy = null;
  for (const delivery of spec.deliveries) {
    const relative = `public/assets/original/models/weapons/pass65-firearms/${weapon.id}/${weapon.id}-${delivery.suffix}.glb`;
    try {
      const loaded = await readGlb(absolute(relative));
      const audit = auditWeaponFamilyGlb(loaded.json, weapon, delivery, loaded.bytes.length, loaded.binary);
      failures.push(...audit.failures.map((failure) => `${relative}: ${failure}`));
      const validation = await validator.validateBytes(new Uint8Array(loaded.bytes), {
        uri: relative,
        format: 'glb',
        writeTimestamp: false,
        maxIssues: 200,
      });
      if ((validation.issues.numErrors ?? 0) > 0 || (validation.issues.numWarnings ?? 0) > 0) {
        failures.push(`${relative}: Khronos validator found ${validation.issues.numErrors} errors and ${validation.issues.numWarnings} warnings`);
      }
      const record = {
        variant: delivery.variant,
        path: relative,
        sha256: sha256Bytes(loaded.bytes),
        bytes: audit.bytes,
        triangles: audit.triangles,
        meshNodes: audit.meshNodes,
        renderPrimitives: audit.renderPrimitives,
        clips: audit.animations.length,
        muzzleForwardDot: audit.muzzleForwardDot,
        sightForwardDot: audit.sightForwardDot,
        khronos: {
          errors: validation.issues.numErrors ?? 0,
          warnings: validation.issues.numWarnings ?? 0,
          infos: validation.issues.numInfos ?? 0,
        },
      };
      deliveries.push(record);
      if (delivery.variant === 'first-person-lod0') platformAnatomy = audit.platformAnatomy;
      glbs += 1;
      triangles += audit.triangles;
      bytes += audit.bytes;
      if (delivery.variant.startsWith('first-person')) maximumFirstPersonPrimitives = Math.max(maximumFirstPersonPrimitives, audit.renderPrimitives);
      else if (delivery.variant.startsWith('world')) maximumWorldPrimitives = Math.max(maximumWorldPrimitives, audit.renderPrimitives);
      else maximumDropPrimitives = Math.max(maximumDropPrimitives, audit.renderPrimitives);
    } catch (error) {
      failures.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  weapons.push({
    id: weapon.id,
    displayName: weapon.displayName,
    designId: weapon.designId,
    requiredSignatureNodes: weapon.signatureNodes,
    platformAnatomy,
    deliveries,
  });
}

const contactSheetPath = 'docs/assets/pass65-weapons/firearms/pass65-weapon-family-contact-sheet.png';
const contactSheetBytes = await readFile(absolute(contactSheetPath));
const contactSheet = {
  ...(await fileRecord(contactSheetPath)),
  ...pngDimensions(contactSheetBytes),
};
const source = await Promise.all([
  specPath,
  'scripts/blender/create-pass65-weapon-families.py',
  'scripts/blender/pass65_weapon_production_geometry.py',
  'source-assets/blender/pass65-weapon-families.blend',
].map(fileRecord));

if (failures.length > 0) {
  console.error(`Pass 65 firearm corpus receipt BLOCKED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const receipt = {
  schemaVersion: 1,
  gate: 'pass65-project-original-firearm-corpus-release',
  status: 'passed',
  assetFamilyId: spec.assetFamilyId,
  source,
  contactSheet,
  policy: {
    realNamesAreCatalogLabelsOnly: true,
    copiedCommercialGameAssetsForbidden: true,
    independentDeliveryBinariesRequired: true,
    maximumFirstPersonRenderPrimitives: 16,
    maximumWorldRenderPrimitives: 16,
    maximumDropRenderPrimitives: 12,
    visualOwnerHitlStillRequired: true,
  },
  totals: {
    weapons: weapons.length,
    glbs,
    triangles,
    bytes,
    khronosErrors: 0,
    khronosWarnings: 0,
    maximumFirstPersonPrimitives,
    maximumWorldPrimitives,
    maximumDropPrimitives,
  },
  weapons,
};
const output = 'artifacts/blender-weapon-families/pass65-firearm-corpus-release-gate.json';
await mkdir(path.dirname(absolute(output)), { recursive: true });
await writeFile(absolute(output), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, ...receipt.totals }, null, 2));
