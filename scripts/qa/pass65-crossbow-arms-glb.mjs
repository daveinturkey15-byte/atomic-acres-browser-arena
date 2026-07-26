import { readGlb } from './hunter-drone-glb.mjs';

export { readGlb };

export const REQUIRED_CORE_ACTIONS = Object.freeze([
  'equip', 'unequip', 'idle', 'walk', 'sprint', 'ads-in', 'ads-out',
  'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect',
]);

export const REQUIRED_CROSSBOW_NODES = Object.freeze([
  'crossbow-chassis', 'crossbow-string', 'crossbow-loaded-bolt',
  'crossbow-magazine', 'crossbow-compact-optic-1_5x',
  'Crossbow_Limb_Left', 'Crossbow_Limb_Right',
  'grip-socket-r', 'support-socket-l', 'reload-socket-l',
  'magazine-socket', 'muzzle-socket', 'eject-socket', 'optic-socket',
  'rear-sight-socket', 'front-sight-socket',
]);

export const REQUIRED_ARM_BONES = Object.freeze([
  'Root', 'UpperArmR', 'LowerArmR', 'WristR', 'Index1R', 'Middle1R',
  'Ring1R', 'Pinky1R', 'Thumb1R', 'UpperArmL', 'LowerArmL', 'WristL',
  'Index1L', 'Middle1L', 'Ring1L', 'Pinky1L', 'Thumb1L',
]);

export const REQUIRED_ARM_SOCKETS = Object.freeze([
  'right-hand-grip-socket', 'left-hand-grip-socket',
  'right-wrist-knife-socket', 'left-hand-grenade-socket',
]);

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

function multiplyQuaternion(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function rotateVector(q, v) {
  const vector = [v[0], v[1], v[2], 0];
  const inverse = [-q[0], -q[1], -q[2], q[3]];
  return multiplyQuaternion(multiplyQuaternion(q, vector), inverse).slice(0, 3);
}

function nodeWorldTranslation(json, index) {
  const parents = new Map();
  for (const [parentIndex, node] of (json.nodes ?? []).entries()) {
    for (const child of node.children ?? []) parents.set(child, parentIndex);
  }
  const resolve = (nodeIndex) => {
    const node = json.nodes[nodeIndex] ?? {};
    if (node.matrix) throw new Error(`matrix-authored node ${node.name ?? nodeIndex} is unsupported by the axis audit`);
    const localPosition = node.translation ?? [0, 0, 0];
    const localRotation = node.rotation ?? [0, 0, 0, 1];
    const localScale = node.scale ?? [1, 1, 1];
    const parentIndex = parents.get(nodeIndex);
    if (parentIndex === undefined) return { position: localPosition, rotation: localRotation, scale: localScale };
    const parent = resolve(parentIndex);
    const scaled = localPosition.map((value, axis) => value * parent.scale[axis]);
    const rotated = rotateVector(parent.rotation, scaled);
    return {
      position: parent.position.map((value, axis) => value + rotated[axis]),
      rotation: multiplyQuaternion(parent.rotation, localRotation),
      scale: parent.scale.map((value, axis) => value * localScale[axis]),
    };
  };
  return resolve(index).position;
}

function commonAudit(json, bytes, label) {
  const failures = [];
  const externalUris = [...(json.images ?? []), ...(json.buffers ?? [])]
    .filter((entry) => typeof entry.uri === 'string').length;
  if (externalUris > 0) failures.push(`${label}: external image or buffer URIs are forbidden`);
  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`${label}: optimized extension ${extension} missing`);
  }
  for (const material of json.materials ?? []) {
    if ((material.alphaMode ?? 'OPAQUE') !== 'OPAQUE') failures.push(`${label}: material ${material.name ?? '<unnamed>'} is not opaque`);
  }
  const normalMappedMaterials = new Set((json.materials ?? []).map((material, index) => material.normalTexture ? index : null).filter(Number.isInteger));
  const pbrPrimitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? [])
    .filter((primitive) => normalMappedMaterials.has(primitive.material));
  if (pbrPrimitives.length === 0) failures.push(`${label}: no normal-mapped PBR primitive`);
  for (const primitive of pbrPrimitives) {
    if (primitive.attributes?.TEXCOORD_0 === undefined || primitive.attributes?.TANGENT === undefined) {
      failures.push(`${label}: normal-mapped PBR primitive lacks UVs or tangents`);
      break;
    }
  }
  if (bytes < 80_000 || bytes > 2_500_000) failures.push(`${label}: ${bytes} bytes outside optimized asset budget`);
  return { failures, externalUris };
}

function hasNodeLike(names, required) {
  return names.some((name) => name === required || name.startsWith(`${required}_`) || name.startsWith(`${required}.`));
}

export function auditCrossbowGlb(json, variant, bytes) {
  const label = `crossbow ${variant}`;
  const common = commonAudit(json, bytes, label);
  const failures = [...common.failures];
  const nodes = json.nodes ?? [];
  const names = nodes.map((node) => node.name ?? '');
  for (const required of REQUIRED_CROSSBOW_NODES) {
    if (!hasNodeLike(names, required)) failures.push(`${label}: missing authored node ${required}`);
  }
  const root = nodes.find((node) => node.extras?.asset_id === 'explosive-crossbow-production-v1');
  if (!root) failures.push(`${label}: production asset identity missing`);
  if (root?.extras?.runtime_forward_axis !== '-Z') failures.push(`${label}: runtime -Z forward declaration missing`);
  if (root?.extras?.optic_magnification !== 1.5) failures.push(`${label}: compact optic is not declared at 1.5x`);
  if (root?.extras?.delivery_variant !== variant) failures.push(`${label}: delivery variant metadata mismatch`);
  const nodeIndex = new Map(nodes.map((node, index) => [node.name, index]));
  const gripIndex = nodeIndex.get('grip-socket-r');
  const muzzleIndex = nodeIndex.get('muzzle-socket');
  const rearSightIndex = nodeIndex.get('rear-sight-socket');
  const frontSightIndex = nodeIndex.get('front-sight-socket');
  const forwardDot = (fromIndex, toIndex) => {
    if (fromIndex === undefined || toIndex === undefined) return null;
    const from = nodeWorldTranslation(json, fromIndex);
    const to = nodeWorldTranslation(json, toIndex);
    const direction = to.map((value, axis) => value - from[axis]);
    const length = Math.hypot(...direction);
    return length > 1e-6 ? -direction[2] / length : null;
  };
  const muzzleForwardDot = forwardDot(gripIndex, muzzleIndex);
  const sightForwardDot = forwardDot(rearSightIndex, frontSightIndex);
  if (muzzleForwardDot === null || muzzleForwardDot < 0.88) failures.push(`${label}: grip-to-muzzle direction is not local -Z`);
  if (sightForwardDot === null || sightForwardDot < 0.88) failures.push(`${label}: rear-to-front sight direction is not local -Z`);
  for (const socketName of REQUIRED_CROSSBOW_NODES.filter((name) => name.endsWith('-socket') || name.includes('socket-'))) {
    const matching = nodes.filter((node) => node.name === socketName);
    if (matching.length !== 1 || typeof matching[0]?.mesh === 'number') failures.push(`${label}: ${socketName} must be exactly one authored empty`);
  }
  const animationNames = (json.animations ?? []).map((animation) => animation.name);
  for (const action of REQUIRED_CORE_ACTIONS) if (!animationNames.includes(action)) failures.push(`${label}: missing action ${action}`);
  const pbr = (json.materials ?? []).filter((material) => material.name?.endsWith('_PBR'));
  if (pbr.length < 2) failures.push(`${label}: carbon and armor PBR materials are required`);
  for (const material of pbr) {
    if (!material.pbrMetallicRoughness?.baseColorTexture) failures.push(`${label}: ${material.name} base color binding missing`);
    if (!material.pbrMetallicRoughness?.metallicRoughnessTexture) failures.push(`${label}: ${material.name} metallic/roughness binding missing`);
    if (!material.normalTexture) failures.push(`${label}: ${material.name} normal binding missing`);
  }
  if ((json.images ?? []).length < 3) failures.push(`${label}: embedded PBR image set incomplete`);
  const triangles = primitiveTriangles(json);
  return Object.freeze({
    failures: Object.freeze(failures), triangles, bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze(animationNames), externalUris: common.externalUris,
    muzzleForwardDot, sightForwardDot,
  });
}

export function auditOperatorArmsGlb(json, lod, bytes) {
  const label = `operator arms LOD${lod}`;
  const common = commonAudit(json, bytes, label);
  const failures = [...common.failures];
  const nodes = json.nodes ?? [];
  const names = nodes.map((node) => node.name ?? '');
  for (const bone of REQUIRED_ARM_BONES) if (!names.includes(bone)) failures.push(`${label}: missing authored bone ${bone}`);
  for (const socket of REQUIRED_ARM_SOCKETS) {
    const matching = nodes.filter((node) => node.name === socket);
    if (matching.length !== 1 || typeof matching[0]?.mesh === 'number') failures.push(`${label}: ${socket} must be exactly one authored empty`);
  }
  const skeleton = nodes.find((node) => node.extras?.asset_id === 'pass65-first-person-operator-arms'
    && node.extras?.dedicated_first_person_skeleton === true);
  if (!skeleton) failures.push(`${label}: dedicated first-person skeleton metadata missing`);
  const deliveryRoot = nodes.find((node) => node.extras?.runtime_forward_axis === '-Z');
  if (!deliveryRoot || deliveryRoot.extras?.blender_authoring_forward_axis !== '+Y') failures.push(`${label}: physical runtime -Z delivery-axis contract missing`);
  for (const socketName of ['right-hand-grip-socket', 'left-hand-grip-socket']) {
    const index = nodes.findIndex((node) => node.name === socketName);
    const position = index < 0 ? null : nodeWorldTranslation(json, index);
    if (!position || position[2] > -0.55) failures.push(`${label}: ${socketName} is not forward on local -Z`);
  }
  const skinnedNodes = nodes.filter((node) => typeof node.mesh === 'number' && typeof node.skin === 'number');
  if (skinnedNodes.length < 40 || (json.skins ?? []).length === 0) failures.push(`${label}: complete weighted arm mesh corpus missing`);
  for (const node of skinnedNodes) {
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      if (primitive.attributes?.JOINTS_0 === undefined || primitive.attributes?.WEIGHTS_0 === undefined) {
        failures.push(`${label}: skinned mesh lacks JOINTS_0 or WEIGHTS_0`);
        break;
      }
    }
  }
  const sceneRoots = new Set(json.scenes?.flatMap((scene) => scene.nodes ?? []) ?? []);
  if (skinnedNodes.some((node) => !sceneRoots.has(nodes.indexOf(node)))) failures.push(`${label}: skinned meshes must be scene roots`);
  const animationNames = (json.animations ?? []).map((animation) => animation.name);
  for (const action of REQUIRED_CORE_ACTIONS) if (!animationNames.includes(action)) failures.push(`${label}: missing action ${action}`);
  const pbr = (json.materials ?? []).filter((material) => material.name?.includes('_PBR'));
  if (pbr.length < 2) failures.push(`${label}: sleeve and glove PBR materials are required`);
  for (const material of pbr) {
    if (!material.pbrMetallicRoughness?.baseColorTexture || !material.normalTexture
      || !material.pbrMetallicRoughness?.metallicRoughnessTexture) {
      failures.push(`${label}: ${material.name} has an incomplete embedded PBR binding`);
    }
  }
  const triangles = primitiveTriangles(json);
  return Object.freeze({
    failures: Object.freeze(failures), triangles, bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    skinnedMeshNodes: skinnedNodes.length, skins: (json.skins ?? []).length,
    bones: REQUIRED_ARM_BONES.filter((bone) => names.includes(bone)).length,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze(animationNames), externalUris: common.externalUris,
  });
}
