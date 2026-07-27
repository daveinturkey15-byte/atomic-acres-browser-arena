import { createHash } from 'node:crypto';

import { readGlb } from './hunter-drone-glb.mjs';

export { readGlb };

export const OPERATOR_ASSET_ID = 'pass65-third-person-operator-family-v1';

export const REQUIRED_OPERATOR_MATERIALS = Object.freeze([
  'Skin', 'Swat', 'Swat_Black', 'Visor',
]);

export const REQUIRED_OPERATOR_ACTIONS = Object.freeze([
  'Idle_Gun_Pointing', 'Idle_Gun', 'Walk', 'Run', 'Run_Shoot',
  'Gun_Shoot', 'HitRecieve', 'HitRecieve_2', 'Death', 'Punch_Right',
]);

export const REQUIRED_OPERATOR_BONES = Object.freeze([
  ['Hips'], ['Abdomen'], ['Torso'], ['Chest'], ['Neck'], ['Head'],
  ['Shoulder.L', 'ShoulderL'], ['UpperArm.L', 'UpperArmL'], ['LowerArm.L', 'LowerArmL'], ['Wrist.L', 'WristL'],
  ['Shoulder.R', 'ShoulderR'], ['UpperArm.R', 'UpperArmR'], ['LowerArm.R', 'LowerArmR'], ['Wrist.R', 'WristR'],
  ['UpperLeg.L', 'UpperLegL'], ['LowerLeg.L', 'LowerLegL'], ['Foot.L', 'FootL'],
  ['UpperLeg.R', 'UpperLegR'], ['LowerLeg.R', 'LowerLegR'], ['Foot.R', 'FootR'],
  ['Index1.L', 'Index1L'], ['Middle1.L', 'Middle1L'], ['Ring1.L', 'Ring1L'], ['Pinky1.L', 'Pinky1L'], ['Thumb1.L', 'Thumb1L'],
  ['Index1.R', 'Index1R'], ['Middle1.R', 'Middle1R'], ['Ring1.R', 'Ring1R'], ['Pinky1.R', 'Pinky1R'], ['Thumb1.R', 'Thumb1R'],
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function primitiveTriangles(json) {
  const instances = new Map();
  for (const node of json.nodes ?? []) {
    if (typeof node.mesh === 'number') instances.set(node.mesh, (instances.get(node.mesh) ?? 0) + 1);
  }
  let triangles = 0;
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      triangles += ((json.accessors?.[accessorIndex]?.count ?? 0) / 3) * (instances.get(meshIndex) ?? 0);
    }
  }
  return Math.round(triangles);
}

function glbBinaryChunk(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) return null;
    if (type === 0x004e4942) return bytes.subarray(start, end);
    offset = end;
  }
  return null;
}

function imageDigest(json, bytes, imageIndex) {
  const image = json.images?.[imageIndex];
  const view = Number.isInteger(image?.bufferView) ? json.bufferViews?.[image.bufferView] : null;
  const binary = glbBinaryChunk(bytes);
  if (!view || !binary) return null;
  const start = (view.byteOffset ?? 0);
  const end = start + (view.byteLength ?? 0);
  if (start < 0 || end > binary.length || start >= end) return null;
  return sha256(binary.subarray(start, end));
}

function textureImageIndex(json, textureInfo) {
  if (!Number.isInteger(textureInfo?.index)) return null;
  const texture = json.textures?.[textureInfo.index];
  if (!texture) return null;
  if (Number.isInteger(texture.source)) return texture.source;
  const webpSource = texture.extensions?.EXT_texture_webp?.source;
  return Number.isInteger(webpSource) ? webpSource : null;
}

export function auditOperatorGlb(json, lod, bytes) {
  const failures = [];
  const byteLength = Buffer.isBuffer(bytes) ? bytes.length : Number(bytes);
  const nodes = json.nodes ?? [];
  const nodeNames = new Set(nodes.map((node) => node.name));
  const deliveryRoot = nodes.find((node) => (
    node.extras?.asset_id === OPERATOR_ASSET_ID
    && node.extras?.skeleton_joint_count >= 58
    && node.extras?.animation_clip_count >= 24
  ));
  if (!deliveryRoot) failures.push(`LOD${lod}: canonical operator asset identity missing`);
  if (deliveryRoot?.extras?.lod !== lod) failures.push(`LOD${lod}: delivery metadata has wrong LOD`);
  if (deliveryRoot?.extras?.source_kind !== 'license-vetted-cc0-blender-derivative') {
    failures.push(`LOD${lod}: licence-vetted source declaration missing`);
  }
  if (deliveryRoot?.extras?.material_contract !== 'opaque-embedded-pbr-depth-writing') {
    failures.push(`LOD${lod}: opaque PBR material contract missing`);
  }
  if (deliveryRoot?.extras?.embedded_weapon_policy !== 'removed-from-delivery') {
    failures.push(`LOD${lod}: embedded weapon removal declaration missing`);
  }
  if (nodeNames.has('Pistol') || [...nodeNames].some((name) => /(^|[_. -])pistol([_. -]|$)/iu.test(name ?? ''))) {
    failures.push(`LOD${lod}: source pistol remains in canonical operator delivery`);
  }

  for (const alternatives of REQUIRED_OPERATOR_BONES) {
    if (!alternatives.some((name) => nodeNames.has(name))) failures.push(`LOD${lod}: missing authored bone ${alternatives.join('|')}`);
  }

  const skins = json.skins ?? [];
  const canonicalJointPalette = JSON.stringify(skins[0]?.joints ?? []);
  if (skins.length !== 4 || skins.some((skin) => JSON.stringify(skin.joints ?? []) !== canonicalJointPalette)) {
    failures.push(`LOD${lod}: four body skins do not share one canonical joint palette`);
  }
  const jointCount = skins[0]?.joints?.length ?? 0;
  if (jointCount < 58) failures.push(`LOD${lod}: ${jointCount} joints cannot represent the 62-joint source rig`);

  const meshNodes = nodes.filter((node) => typeof node.mesh === 'number');
  const skinnedMeshNodes = meshNodes.filter((node) => typeof node.skin === 'number');
  if (meshNodes.length !== 4 || skinnedMeshNodes.length !== meshNodes.length) {
    failures.push(`LOD${lod}: every one of four body renderables must retain the canonical skin`);
  }

  const materials = json.materials ?? [];
  const materialByName = new Map(materials.map((material, index) => [material.name, { material, index }]));
  const textureSignatures = [];
  const pbrMaterialIndices = new Set();
  const boundImageDigests = new Set();
  for (const materialName of REQUIRED_OPERATOR_MATERIALS) {
    const entry = materialByName.get(materialName);
    if (!entry) {
      failures.push(`LOD${lod}: required operator material ${materialName} missing`);
      continue;
    }
    pbrMaterialIndices.add(entry.index);
    const { material } = entry;
    if ((material.alphaMode ?? 'OPAQUE') !== 'OPAQUE') failures.push(`LOD${lod}: ${materialName} is not opaque`);
    if (material.doubleSided === true) failures.push(`LOD${lod}: ${materialName} disables production backface culling`);
    const base = material.pbrMetallicRoughness?.baseColorTexture;
    const normal = material.normalTexture;
    const packed = material.pbrMetallicRoughness?.metallicRoughnessTexture;
    if (!base) failures.push(`LOD${lod}: ${materialName} base-color texture missing`);
    if (!normal) failures.push(`LOD${lod}: ${materialName} normal texture missing`);
    if (!packed) failures.push(`LOD${lod}: ${materialName} metallic/roughness texture missing`);
    const imageIndices = [base, normal, packed].map((info) => textureImageIndex(json, info));
    if (imageIndices.some((index) => index === null)) failures.push(`LOD${lod}: ${materialName} texture image binding is invalid`);
    textureSignatures.push(imageIndices.join(':'));
    for (const imageIndex of imageIndices) {
      if (imageIndex === null) continue;
      const digest = imageDigest(json, bytes, imageIndex);
      if (!digest) failures.push(`LOD${lod}: ${materialName} image ${imageIndex} is not self-contained`);
      else boundImageDigests.add(digest);
    }
  }
  if (new Set(textureSignatures).size !== REQUIRED_OPERATOR_MATERIALS.length) {
    failures.push(`LOD${lod}: distinct body materials collapsed onto a shared generic texture set`);
  }
  if (Buffer.isBuffer(bytes) && boundImageDigests.size < REQUIRED_OPERATOR_MATERIALS.length * 3) {
    failures.push(`LOD${lod}: PBR images are duplicated/shared instead of material-authored`);
  }

  const primitives = meshNodes.flatMap((node) => json.meshes?.[node.mesh]?.primitives ?? []);
  if (primitives.length < 4) failures.push(`LOD${lod}: body primitive set is incomplete`);
  for (const primitive of primitives) {
    if (!pbrMaterialIndices.has(primitive.material)) failures.push(`LOD${lod}: body primitive uses non-production material`);
    const attributes = primitive.attributes ?? {};
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT', 'JOINTS_0', 'WEIGHTS_0']) {
      if (attributes[attribute] === undefined) failures.push(`LOD${lod}: skinned PBR primitive lacks ${attribute}`);
    }
  }

  const animationNames = (json.animations ?? []).map((animation) => animation.name);
  for (const required of REQUIRED_OPERATOR_ACTIONS) {
    if (!animationNames.includes(required)) failures.push(`LOD${lod}: missing action clip ${required}`);
  }
  if (animationNames.length < 24) failures.push(`LOD${lod}: only ${animationNames.length}/24 source action clips retained`);

  if ((json.images ?? []).length < 12 || (json.textures ?? []).length < 12) {
    failures.push(`LOD${lod}: complete four-material embedded PBR texture corpus missing`);
  }
  if ((json.images ?? []).some((image) => typeof image.uri === 'string')) failures.push(`LOD${lod}: external image URI is forbidden`);
  if ((json.buffers ?? []).some((buffer) => typeof buffer.uri === 'string')) failures.push(`LOD${lod}: external buffer URI is forbidden`);
  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`LOD${lod}: optimized extension ${extension} missing`);
  }

  const triangles = primitiveTriangles(json);
  const [minimumTriangles, maximumTriangles] = [[6_500, 10_000], [4_200, 7_500], [2_200, 5_000]][lod];
  if (triangles < minimumTriangles || triangles > maximumTriangles) {
    failures.push(`LOD${lod}: ${triangles} triangles outside ${minimumTriangles}-${maximumTriangles}`);
  }
  if (!Number.isFinite(byteLength) || byteLength < 150_000 || byteLength > 3_500_000) {
    failures.push(`LOD${lod}: ${byteLength} bytes outside optimized operator budget`);
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    triangles,
    bytes: byteLength,
    meshNodes: meshNodes.length,
    skinnedMeshNodes: skinnedMeshNodes.length,
    skins: skins.length,
    joints: jointCount,
    materials: materials.length,
    images: (json.images ?? []).length,
    animations: Object.freeze(animationNames),
    textureSignatures: Object.freeze(textureSignatures),
    boundImageDigests: boundImageDigests.size,
    externalUris: (json.images ?? []).filter((image) => image.uri).length
      + (json.buffers ?? []).filter((buffer) => buffer.uri).length,
  });
}

export function validateOperatorLodFamily(records, audits) {
  const failures = [];
  if (records.length !== 3 || audits.length !== 3) failures.push('operator family requires exactly three audited LODs');
  if (new Set(records.map((record) => record.sha256)).size !== records.length) {
    failures.push('operator LOD binaries share a digest');
  }
  if (audits.length === 3 && !(audits[0].triangles > audits[1].triangles && audits[1].triangles > audits[2].triangles)) {
    failures.push('operator LOD triangle counts do not decrease strictly');
  }
  return failures;
}

export function operatorMutationSelfTest(sourceJson, sourceBytes) {
  const expectedFailures = [];
  const expectFailure = (label, mutate, pattern) => {
    const candidate = structuredClone(sourceJson);
    mutate(candidate);
    const messages = auditOperatorGlb(candidate, 0, sourceBytes).failures;
    if (!messages.some((message) => pattern.test(message))) expectedFailures.push(`${label}: mutation escaped (${messages.join('; ')})`);
  };

  expectFailure('unrigged', (json) => {
    for (const node of json.nodes ?? []) if (typeof node.mesh === 'number') delete node.skin;
  }, /canonical skin/u);
  expectFailure('no-texture', (json) => {
    const swat = json.materials?.find((material) => material.name === 'Swat');
    if (swat?.pbrMetallicRoughness) delete swat.pbrMetallicRoughness.baseColorTexture;
  }, /base-color texture missing/u);
  expectFailure('transparent', (json) => {
    const skin = json.materials?.find((material) => material.name === 'Skin');
    if (skin) skin.alphaMode = 'BLEND';
  }, /not opaque/u);
  expectFailure('double-sided', (json) => {
    const visor = json.materials?.find((material) => material.name === 'Visor');
    if (visor) visor.doubleSided = true;
  }, /backface culling/u);
  expectFailure('shared-generic-texture', (json) => {
    const source = json.materials?.find((material) => material.name === 'Skin');
    for (const material of json.materials ?? []) {
      if (!REQUIRED_OPERATOR_MATERIALS.includes(material.name) || !source) continue;
      material.pbrMetallicRoughness.baseColorTexture = structuredClone(source.pbrMetallicRoughness.baseColorTexture);
      material.pbrMetallicRoughness.metallicRoughnessTexture = structuredClone(source.pbrMetallicRoughness.metallicRoughnessTexture);
      material.normalTexture = structuredClone(source.normalTexture);
    }
  }, /shared generic texture set|duplicated\/shared/u);
  expectFailure('missing-death-animation', (json) => {
    json.animations = (json.animations ?? []).filter((animation) => animation.name !== 'Death');
  }, /missing action clip Death/u);

  const familyFailures = validateOperatorLodFamily(
    [{ sha256: 'a' }, { sha256: 'a' }, { sha256: 'b' }],
    [{ triangles: 7_000 }, { triangles: 7_000 }, { triangles: 3_000 }],
  );
  if (!familyFailures.some((message) => /share a digest/u.test(message))) expectedFailures.push('shared LOD digest mutation escaped');
  if (!familyFailures.some((message) => /decrease strictly/u.test(message))) expectedFailures.push('flat LOD triangle mutation escaped');
  return expectedFailures;
}

export function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('invalid PNG');
  return Object.freeze({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}
