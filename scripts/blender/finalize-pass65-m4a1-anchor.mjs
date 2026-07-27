import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';
import { pngDimensions } from '../qa/hunter-drone-glb.mjs';
import {
  auditWeaponFamilyGlb,
  readGlb,
  REQUIRED_CORE_ACTIONS,
  REQUIRED_WEAPON_SOCKETS,
} from '../qa/pass65-weapon-family-glb.mjs';

const root = process.cwd();
const absolute = (value) => path.join(root, value);
const slash = (value) => value.replaceAll('\\', '/');
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileRecord = async (value, extra = {}) => {
  const bytes = await readFile(absolute(value));
  return Object.freeze({ path: slash(value), sha256: hashBytes(bytes), bytes: bytes.length, ...extra });
};
const pngRecord = async (value, extra = {}) => {
  const bytes = await readFile(absolute(value));
  return Object.freeze({
    path: slash(value), sha256: hashBytes(bytes), bytes: bytes.length,
    ...pngDimensions(bytes), ...extra,
  });
};

const specPath = 'source-assets/blender/pass65-weapon-family-specs.json';
const sourceScriptPath = 'scripts/blender/create-pass65-weapon-families.py';
const sourceBlendPath = 'artifacts/blender-weapon-families/pass65-weapon-families-preview.blend';
const provenancePath = 'source-assets/blender/pass65-weapons/m4a1-anchor.provenance.json';
const receiptPath = 'artifacts/blender-weapon-families/m4a1-anchor-release-gate.json';
const spec = JSON.parse(await readFile(absolute(specPath), 'utf8'));
const weapon = spec.weapons.find((entry) => entry.id === 'm4a1');
if (!weapon) throw new Error('M4A1 source specification is missing');

const deliveries = [];
for (const delivery of spec.deliveries) {
  const relative = `public/assets/original/models/weapons/pass65-firearms/m4a1/m4a1-${delivery.suffix}.glb`;
  const { bytes, json, binary } = await readGlb(absolute(relative));
  const audit = auditWeaponFamilyGlb(json, weapon, delivery, bytes.length, binary);
  if (audit.failures.length > 0) {
    throw new Error(`${relative} failed the M4A1 structural gate:\n${audit.failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: relative,
    format: 'glb',
    writeTimestamp: false,
    maxIssues: 200,
  });
  const errors = report.issues.numErrors ?? 0;
  const warnings = report.issues.numWarnings ?? 0;
  if (errors > 0 || warnings > 0) {
    throw new Error(`${relative} failed Khronos validation with ${errors} errors and ${warnings} warnings`);
  }
  deliveries.push(await fileRecord(relative, {
    variant: delivery.variant,
    lod: delivery.lod,
    triangles: audit.triangles,
    meshNodes: audit.meshNodes,
    renderPrimitives: audit.renderPrimitives,
    clips: audit.animations.length,
    gltfValidation: Object.freeze({ errors, warnings, infos: report.issues.numInfos ?? 0 }),
    muzzleForwardDot: audit.muzzleForwardDot,
    sightForwardDot: audit.sightForwardDot,
  }));
}

if (new Set(deliveries.map((delivery) => delivery.sha256)).size !== deliveries.length) {
  throw new Error('Every M4A1 LOD/delivery must be an independent GLB binary');
}
const byVariant = new Map(deliveries.map((delivery) => [delivery.variant, delivery]));
if (!(byVariant.get('first-person-lod0').triangles > byVariant.get('first-person-lod1').triangles)) {
  throw new Error('M4A1 first-person LOD triangles must decrease strictly');
}
if (!(byVariant.get('world-lod0').triangles > byVariant.get('world-lod1').triangles
  && byVariant.get('world-lod1').triangles > byVariant.get('world-lod2').triangles)) {
  throw new Error('M4A1 world LOD triangles must decrease strictly');
}

const pbrMaps = {};
for (const map of [
  'baseColor', 'normal', 'roughness', 'metallic',
  'polymerBaseColor', 'polymerRoughness', 'polymerMetallic',
]) {
  pbrMaps[map] = await pngRecord(`public/assets/original/textures/weapons/pass65-firearms/m4a1/m4a1-${map}.png`);
}
const reviewLabels = [
  'hero-quarter', 'side-silhouette', 'sight-line', 'reload-action',
  'world-lod0-silhouette', 'drop-lod0-silhouette',
];
const renders = await Promise.all(reviewLabels.map((label) => pngRecord(
  `docs/assets/pass65-weapons/firearms/m4a1/m4a1-${label}.png`, { cameraId: label },
)));
const contactSheet = await pngRecord('docs/assets/pass65-weapons/firearms/m4a1/m4a1-contact-sheet.png');
const provenance = {
  schemaVersion: 1,
  gate: 'pass65-m4a1-production-anchor',
  status: 'passed',
  id: 'm4a1',
  displayName: weapon.displayName,
  designId: weapon.designId,
  title: 'Pass 65 project-original M4A1 stylized production anchor',
  creator: 'Atomic Acres project',
  owner: 'Atomic Acres project',
  created: '2026-07-27',
  license: 'Project-original; no third-party meshes or textures',
  inspirationBoundary: spec.sourcePolicy,
  visualRevision: 'm4a1-production-hero-v3',
  materialLanguage: 'm4a1-anodized-metal-polymer-pbr-v3',
  blenderVersion: '5.1.2',
  generator: await fileRecord(sourceScriptPath),
  sourceBlend: await fileRecord(sourceBlendPath),
  sourceSpec: await fileRecord(specPath),
  runtimeForwardAxis: spec.runtimeForwardAxis,
  runtimePolicy: {
    batching: 'static-action-magazine-by-material-v1',
    firstPersonAndWorldRenderPrimitiveCap: 16,
    dropRenderPrimitiveCap: 12,
    lazySelection: true,
  },
  deliveries,
  pbrMaps,
  requiredSignatureNodes: weapon.signatureNodes,
  requiredSockets: REQUIRED_WEAPON_SOCKETS,
  animationClips: REQUIRED_CORE_ACTIONS,
  review: { renders, contactSheet },
  gameplayBoundary: 'Presentation only. TypeScript owns damage, spread, recoil authority, collision, hit registration and networking.',
};
await mkdir(path.dirname(absolute(provenancePath)), { recursive: true });
await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const receipt = {
  ...provenance,
  provenance: await fileRecord(provenancePath),
  note: 'This anchor receipt does not promote the remaining firearm corpus or modify release manifests.',
};
await mkdir(path.dirname(absolute(receiptPath)), { recursive: true });
await writeFile(absolute(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  gate: receipt.gate,
  status: receipt.status,
  deliveries: deliveries.map(({ variant, triangles, meshNodes, renderPrimitives, bytes, gltfValidation }) => (
    { variant, triangles, meshNodes, renderPrimitives, bytes, gltfValidation }
  )),
  provenance: receipt.provenance,
  contactSheet,
}, null, 2));
